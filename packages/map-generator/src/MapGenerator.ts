import type {
  GameMap,
  HexTile,
  MapSettings,
  MapSize,
} from '../../shared/src/index.js'
import { createHexGrid } from './HexGrid.js'
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
): { start: HexTile; goal: HexTile } => {
  const start = grid.find((tile) => tile.q === -radius && tile.r === 0)
  const goal = grid.find((tile) => tile.q === radius && tile.r === 0)
  if (!start || !goal) {
    throw new Error('Unable to determine START and GOAL tiles.')
  }
  return { start, goal }
}

export const generateMap = (settings: MapSettings): GameMap => {
  const radius = mapRadiusBySize[settings.mapSize]

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const random = new SeededRandom(`${settings.seed}:${attempt}`)
    const grid = createHexGrid(radius)
    const { start, goal } = getEndpointTiles(grid, radius)
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
      startHexId: start.id,
      goalHexId: goal.id,
      stats: {
        shortestPathLength: 0,
        routeCount: 0,
        junglePercent: 0,
        waterPercent: 0,
        villagePercent: 0,
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
