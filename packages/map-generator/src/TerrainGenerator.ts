import type {
  GameDifficulty,
  HexTile,
  MapSettings,
} from '../../shared/src/index.js'
import { axialDistance, getNeighborCoordinates, hexKey } from './HexGrid.js'
import { SeededRandom } from './SeededRandom.js'

type CostTerrain = 'JUNGLE' | 'WATER' | 'DESERT' | 'RUBBLE' | 'CAMP' | 'GOAL'

const specialCostRanges = {
  CAMP: [1, 1],
  GOAL: [5, 8],
} as const

// Columns correspond to movement costs 1 through 5; rows to successive petals.
const ordinaryCostWeights = [
  [35, 55, 10, 0, 0],
  [20, 50, 30, 0, 0],
  [0, 40, 40, 20, 0],
  [0, 20, 50, 35, 0],
  [0, 10, 30, 40, 20],
] as const

const pickCost = (
  random: SeededRandom,
  difficulty: GameDifficulty,
  terrain: CostTerrain,
  petalId: number,
): number => {
  if (terrain !== 'CAMP' && terrain !== 'GOAL') {
    const weights =
      ordinaryCostWeights[Math.min(petalId, ordinaryCostWeights.length - 1)]!
    let roll = random.int(1, 100)
    for (const [index, weight] of weights.entries()) {
      roll -= weight
      if (roll <= 0) return index + 1
    }
    throw new Error('Ordinary movement cost weights must total 100.')
  }
  const [min, max] = specialCostRanges[terrain]
  const roll = random.next()
  const weighted =
    difficulty === 'EASY'
      ? roll ** 1.6
      : difficulty === 'HARD'
        ? Math.sqrt(roll)
        : roll
  return min + Math.min(max - min, Math.floor(weighted * (max - min + 1)))
}

const pickLandTerrain = (
  random: SeededRandom,
  settings: MapSettings,
): Exclude<CostTerrain, 'WATER' | 'CAMP' | 'GOAL'> => {
  const desertWeight = Math.max(
    0.12,
    1 - settings.jungleDensity - settings.waterDensity - 0.12,
  )
  const weights = [settings.jungleDensity, desertWeight, 0.12]
  let roll = random.next() * weights.reduce((sum, weight) => sum + weight, 0)
  for (const [index, terrain] of (
    ['JUNGLE', 'DESERT', 'RUBBLE'] as const
  ).entries()) {
    roll -= weights[index]!
    if (roll <= 0) return terrain
  }
  return 'RUBBLE'
}

const buildNeighborLookup = (tiles: HexTile[]) => {
  const byCoordinate = new Map(
    tiles.map((tile) => [hexKey(tile.q, tile.r), tile]),
  )
  return (tile: HexTile): HexTile[] =>
    getNeighborCoordinates(tile.q, tile.r)
      .map(({ q, r }) => byCoordinate.get(hexKey(q, r)))
      .filter((neighbor): neighbor is HexTile => Boolean(neighbor))
}

const placeMountainGroups = (
  tiles: HexTile[],
  routes: Set<string>,
  protectedIds: Set<string>,
  target: number,
  random: SeededRandom,
  neighborsOf: (tile: HexTile) => HexTile[],
): void => {
  const mountains = new Set<string>()
  while (target - mountains.size >= 3) {
    const remaining = target - mountains.size
    const sizes = [3, 4, 5].filter(
      (size) =>
        size <= remaining && (remaining - size === 0 || remaining - size >= 3),
    )
    const groupSize = random.pick(sizes)
    const canJoinGroup = (tile: HexTile, group: Set<string>): boolean =>
      !routes.has(tile.id) &&
      !protectedIds.has(tile.id) &&
      !mountains.has(tile.id) &&
      !group.has(tile.id) &&
      neighborsOf(tile).every((neighbor) => !mountains.has(neighbor.id))
    let placed = false
    for (const seed of random.shuffle(tiles)) {
      if (!canJoinGroup(seed, new Set())) continue
      const group = [seed]
      const groupIds = new Set([seed.id])
      while (group.length < groupSize) {
        const frontier = [
          ...new Map(
            group
              .flatMap(neighborsOf)
              .filter((tile) => canJoinGroup(tile, groupIds))
              .map((tile) => [tile.id, tile]),
          ).values(),
        ]
        if (frontier.length === 0) break
        const next = random.pick(frontier)
        group.push(next)
        groupIds.add(next.id)
      }
      if (group.length !== groupSize) continue
      for (const tile of group) {
        mountains.add(tile.id)
        tile.terrain = 'MOUNTAIN'
        tile.isBlocked = true
        tile.difficulty = 0
      }
      placed = true
      break
    }
    if (!placed) break
  }
}

const placeWaterBodies = (
  tiles: HexTile[],
  protectedIds: Set<string>,
  target: number,
  random: SeededRandom,
  neighborsOf: (tile: HexTile) => HexTile[],
): void => {
  const water = new Set<string>()
  const available = (tile: HexTile) =>
    !tile.isBlocked && !protectedIds.has(tile.id) && !water.has(tile.id)

  // A river begins beside a mountain and ends on the outside edge of the map.
  // Find a short, continuous channel before filling the remaining water as lakes.
  const riverSources = random.shuffle(
    tiles.filter(
      (tile) =>
        available(tile) &&
        neighborsOf(tile).length === 6 &&
        neighborsOf(tile).some((neighbor) => neighbor.terrain === 'MOUNTAIN'),
    ),
  )
  const riverBudget = Math.min(target, Math.max(2, Math.round(target * 0.55)))
  const riverCount = Math.max(1, Math.ceil(target / 18))
  let riversPlaced = 0
  for (const source of riverSources) {
    if (riversPlaced >= riverCount || water.size >= riverBudget) break
    if (!available(source)) continue
    const queue = [source]
    const previous = new Map<string, HexTile | null>([[source.id, null]])
    let mouth: HexTile | undefined
    for (let index = 0; index < queue.length; index += 1) {
      const tile = queue[index]!
      if (tile.id !== source.id && neighborsOf(tile).length < 6) {
        mouth = tile
        break
      }
      for (const neighbor of random.shuffle(neighborsOf(tile))) {
        if (!available(neighbor) || previous.has(neighbor.id)) continue
        previous.set(neighbor.id, tile)
        queue.push(neighbor)
      }
    }
    if (!mouth) continue
    const path: HexTile[] = []
    for (
      let tile: HexTile | null = mouth;
      tile;
      tile = previous.get(tile.id) ?? null
    ) {
      path.push(tile)
    }
    if (
      path.length > target - water.size ||
      path.length > riverBudget - water.size
    )
      continue
    for (const tile of path) {
      water.add(tile.id)
      tile.terrain = 'WATER'
    }
    riversPlaced += 1
  }

  while (water.size < target) {
    const remaining = target - water.size
    const candidates = tiles.filter(
      (tile) =>
        available(tile) &&
        (remaining === 1 || neighborsOf(tile).some(available)),
    )
    if (candidates.length === 0) break
    const existingEdge = candidates.filter((tile) =>
      neighborsOf(tile).some((neighbor) => water.has(neighbor.id)),
    )
    const seed = random.pick(
      remaining < 3 && existingEdge.length > 0 ? existingEdge : candidates,
    )
    const body = [seed]
    water.add(seed.id)
    const bodySize = Math.min(remaining, random.int(6, 16))
    while (body.length < bodySize) {
      const frontier = [
        ...new Map(
          body
            .flatMap(neighborsOf)
            .filter(available)
            .map((tile) => [tile.id, tile]),
        ).values(),
      ]
      if (frontier.length === 0) break
      const mostConnected = Math.max(
        ...frontier.map(
          (tile) =>
            neighborsOf(tile).filter((neighbor) => body.includes(neighbor))
              .length,
        ),
      )
      const next = random.pick(
        frontier.filter(
          (tile) =>
            neighborsOf(tile).filter((neighbor) => body.includes(neighbor))
              .length === mostConnected,
        ),
      )
      water.add(next.id)
      body.push(next)
    }
    for (const tile of body) tile.terrain = 'WATER'
  }
}

const placeCamps = (
  tiles: HexTile[],
  petalCount: number,
  countMinPerPetal: number,
  countMaxPerPetal: number,
  random: SeededRandom,
): void => {
  const camps: HexTile[] = []
  for (let petalId = 0; petalId < petalCount; petalId += 1) {
    const campCount = random.int(countMinPerPetal, countMaxPerPetal)
    const petalTiles = tiles.filter((tile) => tile.petalId === petalId)
    const center = {
      q: petalTiles.reduce((sum, tile) => sum + tile.q, 0) / petalTiles.length,
      r: petalTiles.reduce((sum, tile) => sum + tile.r, 0) / petalTiles.length,
    }
    const petalRadius = Math.max(
      ...petalTiles.map((tile) => axialDistance(tile, center)),
    )
    const maximumCampRadius = petalRadius - Math.ceil(petalRadius / 4)
    const candidates = random
      .shuffle(
        petalTiles.filter((tile) => {
          const distanceFromCenter = axialDistance(tile, center)
          return (
            distanceFromCenter >= 1 &&
            distanceFromCenter <= maximumCampRadius &&
            !tile.isBlocked &&
            tile.terrain !== 'WATER' &&
            tile.terrain !== 'START' &&
            tile.terrain !== 'GOAL'
          )
        }),
      )
      .sort(
        (left, right) =>
          axialDistance(left, center) - axialDistance(right, center),
      )
    const eligible = candidates.filter((tile) =>
      camps.every((camp) => axialDistance(tile, camp) >= 4),
    )
    const farthest = Math.max(
      0,
      ...eligible.map((tile) => axialDistance(tile, center)),
    )
    let chosen: HexTile[] = []
    for (let count = campCount; count > 0 && chosen.length === 0; count -= 1) {
      for (
        let radius = 0;
        radius <= farthest && chosen.length === 0;
        radius += 1
      ) {
        const nearby = eligible.filter(
          (tile) => axialDistance(tile, center) <= radius,
        )
        const search = (
          selection: HexTile[],
          from: number,
        ): HexTile[] | undefined => {
          if (selection.length === count) return selection
          for (
            let index = from;
            index <= nearby.length - (count - selection.length);
            index += 1
          ) {
            const tile = nearby[index]!
            if (selection.every((camp) => axialDistance(tile, camp) >= 4)) {
              const found = search([...selection, tile], index + 1)
              if (found) return found
            }
          }
          return undefined
        }
        chosen = search([], 0) ?? []
      }
    }
    for (const camp of chosen) {
      camp.terrain = 'CAMP'
      camp.specialType = 'CAMP'
      camps.push(camp)
    }
  }
}

export const applyTerrain = (
  grid: HexTile[],
  routes: Set<string>,
  settings: MapSettings,
  random: SeededRandom,
  startIds: string[],
  goalIds: string[],
): HexTile[] => {
  const tiles = grid.map((tile) => ({ ...tile }))
  const neighborsOf = buildNeighborLookup(tiles)
  const protectedIds = new Set([...startIds, ...goalIds])

  placeMountainGroups(
    tiles,
    routes,
    protectedIds,
    Math.round(tiles.length * settings.mountainDensity),
    random,
    neighborsOf,
  )

  for (const tile of tiles) {
    if (!tile.isBlocked) tile.terrain = pickLandTerrain(random, settings)
  }
  placeWaterBodies(
    tiles,
    protectedIds,
    Math.round(tiles.length * settings.waterDensity),
    random,
    neighborsOf,
  )

  const startTiles = tiles.filter((tile) => startIds.includes(tile.id))
  const goalTiles = tiles.filter((tile) => goalIds.includes(tile.id))
  for (const startTile of startTiles) startTile.terrain = 'START'
  for (const goalTile of goalTiles) goalTile.terrain = 'GOAL'
  placeCamps(
    tiles,
    settings.petalCount ?? 1,
    settings.campCountMinPerPetal ?? 1,
    settings.campCountMaxPerPetal ?? 1,
    random,
  )

  for (const tile of tiles) {
    if (
      tile.terrain === 'JUNGLE' ||
      tile.terrain === 'WATER' ||
      tile.terrain === 'DESERT' ||
      tile.terrain === 'RUBBLE' ||
      tile.terrain === 'CAMP' ||
      tile.terrain === 'GOAL'
    ) {
      tile.difficulty = pickCost(
        random,
        settings.difficulty,
        tile.terrain,
        tile.petalId ?? 0,
      )
    }
  }
  for (const startTile of startTiles) startTile.difficulty = 0
  for (const startTile of startTiles) {
    for (const tile of neighborsOf(startTile)) {
      if (!tile.isBlocked) tile.difficulty = Math.min(tile.difficulty, 2)
    }
  }

  return tiles
}
