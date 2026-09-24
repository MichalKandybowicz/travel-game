import type {
  GameDifficulty,
  HexTile,
  MapSettings,
  TerrainType,
} from '../../shared/src/index.js'
import { SeededRandom } from './SeededRandom.js'
import { getNeighbors } from './HexGrid.js'

const difficultyWeights: Record<
  GameDifficulty,
  readonly [number, number, number]
> = {
  EASY: [0.6, 0.3, 0.1],
  NORMAL: [0.35, 0.45, 0.2],
  HARD: [0.2, 0.45, 0.35],
}

const pickWeightedTerrain = (
  random: SeededRandom,
  settings: MapSettings,
): TerrainType => {
  const villageWeight = Math.max(
    0.12,
    1 - settings.jungleDensity - settings.waterDensity - 0.12,
  )
  const rubbleWeight = 0.12
  const weights: Array<{ terrain: TerrainType; weight: number }> = [
    { terrain: 'JUNGLE', weight: settings.jungleDensity },
    { terrain: 'WATER', weight: settings.waterDensity },
    { terrain: 'VILLAGE', weight: villageWeight },
    { terrain: 'RUBBLE', weight: rubbleWeight },
  ]
  const total = weights.reduce((sum, entry) => sum + entry.weight, 0)
  let value = random.next() * total
  for (const entry of weights) {
    value -= entry.weight
    if (value <= 0) {
      return entry.terrain
    }
  }
  return 'RUBBLE'
}

const pickDifficulty = (
  random: SeededRandom,
  difficulty: GameDifficulty,
): number => {
  const [one, two] = difficultyWeights[difficulty]
  const roll = random.next()
  if (roll <= one) {
    return 1
  }
  if (roll <= one + two) {
    return 2
  }
  return 3
}

export const applyTerrain = (
  grid: HexTile[],
  routes: Set<string>,
  settings: MapSettings,
  random: SeededRandom,
  startId: string,
  goalId: string,
): HexTile[] => {
  const tiles = grid.map((tile) => ({ ...tile }))
  const protectedIds = new Set<string>([startId, goalId])
  const routeTiles = tiles.filter(
    (tile) => routes.has(tile.id) && !protectedIds.has(tile.id),
  )
  const offRouteTiles = tiles.filter(
    (tile) => !routes.has(tile.id) && !protectedIds.has(tile.id),
  )
  const targetMountains = Math.floor(tiles.length * settings.mountainDensity)

  for (const tile of random.shuffle(offRouteTiles).slice(0, targetMountains)) {
    tile.terrain = 'MOUNTAIN'
    tile.isBlocked = true
    tile.difficulty = 3
  }

  const traversable = tiles.filter(
    (tile) => !tile.isBlocked && !protectedIds.has(tile.id),
  )
  const campCount = Math.floor(traversable.length * settings.specialTileDensity)
  const campCandidates = random.shuffle(routeTiles).slice(0, campCount)
  for (const tile of campCandidates) {
    tile.terrain = 'CAMP'
    tile.specialType = 'CAMP'
    tile.difficulty = 1
  }

  for (const tile of traversable) {
    if (tile.terrain === 'CAMP') {
      continue
    }
    tile.terrain = pickWeightedTerrain(random, settings)
    tile.difficulty = pickDifficulty(random, settings.difficulty)
  }

  const startTile = tiles.find((tile) => tile.id === startId)!
  startTile.terrain = 'START'
  startTile.difficulty = 0
  startTile.isBlocked = false
  const goalTile = tiles.find((tile) => tile.id === goalId)!
  goalTile.terrain = 'GOAL'
  goalTile.difficulty = 0
  goalTile.isBlocked = false

  for (const tile of getNeighbors(tiles, startTile)) {
    if (!tile.isBlocked) {
      tile.difficulty = Math.min(tile.difficulty, 2)
      if (tile.terrain === 'RUBBLE') {
        tile.terrain = 'JUNGLE'
      }
    }
  }

  return tiles
}
