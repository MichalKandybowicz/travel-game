import type {
  GameDifficulty,
  HexTile,
  MapSettings,
} from '../../shared/src/index.js'
import { axialDistance, getNeighborCoordinates, hexKey } from './HexGrid.js'
import { SeededRandom } from './SeededRandom.js'

type CostTerrain = 'JUNGLE' | 'WATER' | 'DESERT' | 'RUBBLE' | 'CAMP'

const costRanges: Record<CostTerrain, readonly [number, number]> = {
  JUNGLE: [1, 4],
  WATER: [1, 3],
  DESERT: [1, 4],
  RUBBLE: [2, 4],
  CAMP: [1, 5],
}

const pickCost = (
  random: SeededRandom,
  difficulty: GameDifficulty,
  terrain: CostTerrain,
): number => {
  const [min, max] = costRanges[terrain]
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
): Exclude<CostTerrain, 'WATER' | 'CAMP'> => {
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
    const river = random.next() < 0.5
    const bodySize = Math.min(remaining, random.int(6, 16))
    while (body.length < bodySize) {
      const tip = body[body.length - 1]!
      const frontier = river
        ? neighborsOf(tip).filter(available)
        : [
            ...new Map(
              body
                .flatMap(neighborsOf)
                .filter(available)
                .map((tile) => [tile.id, tile]),
            ).values(),
          ]
      if (frontier.length === 0) break
      const next = random.pick(frontier)
      water.add(next.id)
      body.push(next)
    }
    for (const tile of body) tile.terrain = 'WATER'
  }
}

const placeCamps = (
  tiles: HexTile[],
  routes: Set<string>,
  petalCount: number,
  random: SeededRandom,
): void => {
  const camps: HexTile[] = []
  for (let petalId = 0; petalId < petalCount; petalId += 1) {
    const candidates = random.shuffle(
      tiles.filter(
        (tile) =>
          tile.petalId === petalId &&
          !tile.isBlocked &&
          tile.terrain !== 'WATER' &&
          tile.terrain !== 'START' &&
          tile.terrain !== 'GOAL',
      ),
    )
    const eligible = candidates.filter((tile) =>
      camps.every((camp) => axialDistance(tile, camp) >= 3),
    )
    const camp = eligible.find((tile) => routes.has(tile.id)) ?? eligible[0]
    if (!camp) continue
    camp.terrain = 'CAMP'
    camp.specialType = 'CAMP'
    camps.push(camp)
  }
}

export const applyTerrain = (
  grid: HexTile[],
  routes: Set<string>,
  settings: MapSettings,
  random: SeededRandom,
  startIds: string[],
  goalId: string,
): HexTile[] => {
  const tiles = grid.map((tile) => ({ ...tile }))
  const neighborsOf = buildNeighborLookup(tiles)
  const protectedIds = new Set([...startIds, goalId])

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
  const goalTile = tiles.find((tile) => tile.id === goalId)!
  for (const startTile of startTiles) startTile.terrain = 'START'
  goalTile.terrain = 'GOAL'
  if (settings.specialTileDensity > 0) {
    placeCamps(tiles, routes, settings.petalCount ?? 1, random)
  }

  for (const tile of tiles) {
    if (tile.terrain in costRanges) {
      tile.difficulty = pickCost(
        random,
        settings.difficulty,
        tile.terrain as CostTerrain,
      )
    }
  }
  for (const startTile of startTiles) startTile.difficulty = 0
  goalTile.difficulty = 0
  for (const startTile of startTiles) {
    for (const tile of neighborsOf(startTile)) {
      if (!tile.isBlocked) tile.difficulty = Math.min(tile.difficulty, 2)
    }
  }

  return tiles
}
