import type { GameMap, MapSettings } from '../../shared/src/index.js'
import { analyzeMap } from './MapAnalyzer.js'

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
  if (analysis.shortestPathLength < minPathLengthBySize[settings.mapSize]) {
    reasons.push('Map is too short.')
  }
  if (analysis.shortestPathLength > maxPathLengthBySize[settings.mapSize]) {
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
