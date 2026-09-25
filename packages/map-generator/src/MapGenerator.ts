import type {
  GameMap,
  HexTile,
  MapSettings,
  MapSize,
} from '../../shared/src/index.js'
import { axialDistance, createHexGrid, HEX_DIRECTIONS } from './HexGrid.js'
import { analyzeMap } from './MapAnalyzer.js'
import { createRouteSet } from './PathGenerator.js'
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
): { start: HexTile; goal: HexTile } => {
  if (centers.length === 1) {
    const start = grid.find((tile) => tile.q === -radius && tile.r === 0)
    const goal = grid.find((tile) => tile.q === radius && tile.r === 0)
    if (!start || !goal) {
      throw new Error('Unable to determine START and GOAL tiles.')
    }
    return { start, goal }
  }
  const chooseOuterTile = (
    petalId: number,
    otherCenter: { q: number; r: number },
  ): HexTile => {
    const candidates = grid.filter((tile) => tile.petalId === petalId)
    const farthest = Math.max(
      ...candidates.map((tile) => axialDistance(tile, otherCenter)),
    )
    return random.pick(
      candidates.filter(
        (tile) => axialDistance(tile, otherCenter) === farthest,
      ),
    )
  }
  return {
    start: chooseOuterTile(0, centers[centers.length - 1]!),
    goal: chooseOuterTile(centers.length - 1, centers[0]!),
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
  const radius = mapRadiusBySize[settings.mapSize]

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const random = new SeededRandom(`${settings.seed}:${attempt}`)
    const { tiles: grid, centers } = createConnectedPetals(
      radius,
      settings.petalCount ?? 1,
      random,
    )
    const { start, goal } = getEndpointTiles(grid, radius, centers, random)
    const routes = createRouteSet(
      start,
      goal,
      grid,
      settings.routeCount,
      random,
    )
    const tiles = applyTerrain(
      grid,
      routes,
      settings,
      random,
      start.id,
      goal.id,
    )
    const provisionalMap: GameMap = {
      tiles,
      petalCount: settings.petalCount ?? 1,
      startHexId: start.id,
      goalHexId: goal.id,
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
