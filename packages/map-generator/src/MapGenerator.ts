import type {
  GameMap,
  HexTile,
  MapSettings,
  MapSize,
} from '../../shared/src/index.js'
import {
  axialDistance,
  createHexGrid,
  getNeighbors,
  HEX_DIRECTIONS,
} from './HexGrid.js'
import { analyzeMap } from './MapAnalyzer.js'
import { createRouteSet, tracePath } from './PathGenerator.js'
import { SeededRandom } from './SeededRandom.js'
import { applyTerrain } from './TerrainGenerator.js'
import { validateMap } from './MapValidator.js'

const mapRadiusBySize: Record<MapSize, number> = {
  SMALL: 3,
  MEDIUM: 4,
  LARGE: 5,
}

const getEndpointTiles = (
  grid: HexTile[],
  radius: number,
  centers: Array<{ q: number; r: number }>,
  random: SeededRandom,
): { starts: HexTile[]; goals: HexTile[] } => {
  const firstPetal = grid.filter((tile) => tile.petalId === 0)
  const center = centers[0]!
  const sides = [
    firstPetal.filter((tile) => tile.q === center.q + radius),
    firstPetal.filter((tile) => tile.q === center.q - radius),
    firstPetal.filter((tile) => tile.r === center.r + radius),
    firstPetal.filter((tile) => tile.r === center.r - radius),
    firstPetal.filter(
      (tile) => tile.q + tile.r === center.q + center.r + radius,
    ),
    firstPetal.filter(
      (tile) => tile.q + tile.r === center.q + center.r - radius,
    ),
  ]
  const contactSide =
    centers.length === 1
      ? 0
      : sides.reduce(
          (best, side, index) => {
            const contacts = side.reduce(
              (sum, tile) =>
                sum +
                getNeighbors(grid, tile).filter(
                  (neighbor) => neighbor.petalId === 1,
                ).length,
              0,
            )
            return contacts > best.contacts ? { index, contacts } : best
          },
          { index: 0, contacts: -1 },
        ).index
  const oppositeSide = contactSide % 2 === 0 ? contactSide + 1 : contactSide - 1
  const sideTiles = sides[oppositeSide]!.sort((a, b) => a.q - b.q || a.r - b.r)
  const starts = sideTiles
  if (starts.length !== radius + 1)
    throw new Error('Unable to determine the full START edge.')
  const lastPetalId = centers.length - 1
  const lastCenter = centers[lastPetalId]!
  const lastPetal = grid.filter((tile) => tile.petalId === lastPetalId)
  const goalSides = [
    lastPetal.filter((tile) => tile.q === lastCenter.q + radius),
    lastPetal.filter((tile) => tile.q === lastCenter.q - radius),
    lastPetal.filter((tile) => tile.r === lastCenter.r + radius),
    lastPetal.filter((tile) => tile.r === lastCenter.r - radius),
    lastPetal.filter(
      (tile) => tile.q + tile.r === lastCenter.q + lastCenter.r + radius,
    ),
    lastPetal.filter(
      (tile) => tile.q + tile.r === lastCenter.q + lastCenter.r - radius,
    ),
  ]
  const goalSideScores = goalSides.map((side) =>
    side.reduce((sum, tile) => sum + axialDistance(tile, centers[0]!), 0),
  )
  const farthestSideScore = Math.max(...goalSideScores)
  const goalSide =
    centers.length === 1
      ? goalSides[contactSide]!
      : random.pick(
          goalSides.filter(
            (_, index) => goalSideScores[index] === farthestSideScore,
          ),
        )
  const ordered = [...goalSide].sort((a, b) => a.q - b.q || a.r - b.r)
  if (ordered.length < 3)
    throw new Error('Unable to determine three GOAL tiles.')
  return {
    starts,
    goals: [
      ordered[0]!,
      ordered[Math.floor((ordered.length - 1) / 2)]!,
      ordered.at(-1)!,
    ],
  }
}

const createConnectedPetals = (
  radius: number,
  count: number,
  random: SeededRandom,
): { tiles: HexTile[]; centers: Array<{ q: number; r: number }> } => {
  const petals = [{ u: 0, v: 0 }]
  const key = (u: number, v: number) => `${u},${v}`
  const occupied = new Set([key(0, 0)])
  const extend = (): boolean => {
    if (petals.length === count) return true
    const previous = petals[petals.length - 1]!
    const beforePrevious = petals[petals.length - 2]
    const directions = random.shuffle([...HEX_DIRECTIONS])
    const candidates = directions
      .map(([du, dv]) => ({ u: previous.u + du, v: previous.v + dv }))
      .filter((candidate) => {
        if (occupied.has(key(candidate.u, candidate.v))) return false
        const contacts = HEX_DIRECTIONS.filter(([du, dv]) =>
          occupied.has(key(candidate.u + du, candidate.v + dv)),
        ).length
        if (contacts !== 1) return false
        if (petals.length === 2 && beforePrevious) {
          return (
            candidate.u !== previous.u * 2 - beforePrevious.u ||
            candidate.v !== previous.v * 2 - beforePrevious.v
          )
        }
        return true
      })
    for (const candidate of candidates) {
      petals.push(candidate)
      occupied.add(key(candidate.u, candidate.v))
      if (extend()) return true
      petals.pop()
      occupied.delete(key(candidate.u, candidate.v))
    }
    return false
  }
  if (!extend()) {
    throw new Error('Unable to connect the requested number of petals.')
  }
  // These basis vectors join neighboring petals along a full side.
  const centers = petals.map(({ u, v }) => ({
    q: u * (2 * radius + 1) + v * radius,
    r: -u * radius + v * (radius + 1),
  }))
  const tiles = centers.flatMap((center, petalId) =>
    createHexGrid(radius).map((tile) => {
      const q = tile.q + center.q
      const r = tile.r + center.r
      return { ...tile, id: `hex_${q}_${r}`, q, r, petalId }
    }),
  )
  return { tiles, centers }
}

export const generateMap = (settings: MapSettings): GameMap => {
  const radius = settings.segmentEdgeLength
    ? settings.segmentEdgeLength - 1
    : mapRadiusBySize[settings.mapSize]

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const random = new SeededRandom(`${settings.seed}:${attempt}`)
    const { tiles: grid, centers } = createConnectedPetals(
      radius,
      settings.petalCount ?? 1,
      random,
    )
    const { starts, goals } = getEndpointTiles(grid, radius, centers, random)
    const goal = goals[1]!
    const routes = createRouteSet(
      starts[0]!,
      goal,
      grid,
      settings.routeCount,
      random,
    )
    for (const start of starts.slice(1)) routes.add(start.id)
    for (const extraGoal of goals) {
      for (const tile of tracePath(goal, extraGoal, grid, random)) {
        routes.add(tile.id)
      }
    }
    const tiles = applyTerrain(
      grid,
      routes,
      settings,
      random,
      starts.map((start) => start.id),
      goals.map((entry) => entry.id),
    )
    const provisionalMap: GameMap = {
      tiles,
      petalCount: settings.petalCount ?? 1,
      startHexId: starts[0]!.id,
      startHexIds: starts.map((start) => start.id),
      goalHexId: goal.id,
      goalHexIds: goals.map((entry) => entry.id),
      stats: {
        shortestPathLength: 0,
        routeCount: 0,
        junglePercent: 0,
        waterPercent: 0,
        desertPercent: 0,
        mountainPercent: 0,
        difficultyScore: 0,
      },
    }
    const validation = validateMap(provisionalMap, settings)
    if (validation.valid) {
      return {
        ...provisionalMap,
        stats: analyzeMap(provisionalMap),
      }
    }
  }

  throw new Error('Failed to generate a valid map.')
}
