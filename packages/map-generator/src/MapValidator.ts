import type { GameMap, MapSettings } from '../../shared/src/index.js'
import { analyzeMap } from './MapAnalyzer.js'
import { getNeighbors } from './HexGrid.js'

export interface MapValidationResult {
  valid: boolean
  reasons: string[]
}

export const validateMap = (
  map: GameMap,
  settings: MapSettings,
): MapValidationResult => {
  const analysis = analyzeMap(map)
  const reasons: string[] = []
  const goalIds = map.goalHexIds ?? [map.goalHexId]
  const start = map.tiles.find((tile) => tile.id === map.startHexId)
  const reachable = new Set(start ? [start.id] : [])
  const queue = start ? [start] : []
  for (let index = 0; index < queue.length; index += 1) {
    for (const neighbor of getNeighbors(map.tiles, queue[index]!)) {
      if (
        neighbor.isBlocked ||
        neighbor.terrain === 'MOUNTAIN' ||
        reachable.has(neighbor.id)
      )
        continue
      reachable.add(neighbor.id)
      queue.push(neighbor)
    }
  }
  if (
    new Set(goalIds).size !== goalIds.length ||
    !goalIds.includes(map.goalHexId) ||
    goalIds.some(
      (id) =>
        !reachable.has(id) ||
        map.tiles.find((tile) => tile.id === id)?.terrain !== 'GOAL',
    )
  ) {
    reasons.push('Not every GOAL is reachable from START.')
  }
  const minRoutes = settings.routeCount >= 2 ? 2 : 1
  const minPathLengthBySize = {
    SMALL: 5,
    MEDIUM: 8,
    LARGE: 11,
  } as const
  const maxPathLengthBySize = {
    SMALL: 24,
    MEDIUM: 40,
    LARGE: 60,
  } as const
  const minimumPathLength = settings.segmentEdgeLength
    ? 5 + (settings.segmentEdgeLength - 5) * 2
    : minPathLengthBySize[settings.mapSize]
  const maximumPathLength = settings.segmentEdgeLength
    ? 24 + (settings.segmentEdgeLength - 5) * 9
    : maxPathLengthBySize[settings.mapSize]

  if (!Number.isFinite(analysis.shortestPathLength)) {
    reasons.push('START cannot reach GOAL.')
  }
  if (analysis.routeCount < minRoutes) {
    reasons.push('Not enough distinct routes leave the START area.')
  }
  const expectedJungle = Math.round(settings.jungleDensity * 100)
  if (Math.abs(analysis.junglePercent - expectedJungle) > 25) {
    reasons.push('Jungle density is outside the expected range.')
  }
  const expectedWater = Math.round(settings.waterDensity * 100)
  if (Math.abs(analysis.waterPercent - expectedWater) > 20) {
    reasons.push('Water density is outside the expected range.')
  }
  if (analysis.shortestPathLength < minimumPathLength) {
    reasons.push('Map is too short.')
  }
  if (
    analysis.shortestPathLength >
    maximumPathLength * (settings.petalCount ?? 1)
  ) {
    reasons.push('Map is too long.')
  }
  if (analysis.difficultyScore < 15 || analysis.difficultyScore > 95) {
    reasons.push('Map difficulty is poorly balanced.')
  }

  return {
    valid: reasons.length === 0,
    reasons,
  }
}
