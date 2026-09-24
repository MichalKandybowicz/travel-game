import { describe, expect, it } from 'vitest'
import type { GameMap, MapSettings } from '../../shared/src/index.js'
import { analyzeMap, countDistinctRoutesFromStart } from './MapAnalyzer.js'
import { generateMap } from './MapGenerator.js'

const settings: MapSettings = {
  seed: 'JUNGLE-92841',
  mapSize: 'MEDIUM',
  difficulty: 'NORMAL',
  routeCount: 3,
  jungleDensity: 0.4,
  waterDensity: 0.2,
  mountainDensity: 0.15,
  specialTileDensity: 0.05,
  chokepointCount: 2,
}

describe('generateMap', () => {
  it('returns the same map for the same seed and settings', () => {
    const first = generateMap(settings)
    const second = generateMap(settings)

    expect(first).toEqual(second)
  })

  it('usually returns a different map for a different seed', () => {
    const first = generateMap(settings)
    const second = generateMap({ ...settings, seed: 'JUNGLE-92842' })

    expect(second.tiles).not.toEqual(first.tiles)
  })

  it('always keeps the goal reachable with at least the requested start branches', () => {
    const map = generateMap(settings)
    const analysis = analyzeMap(map)

    expect(analysis.shortestPathLength).toBeGreaterThan(0)
    expect(analysis.routeCount).toBeGreaterThanOrEqual(2)
  })

  it('counts distinct reachable branches from the start on a handcrafted map', () => {
    const map: GameMap = {
      startHexId: 'start',
      goalHexId: 'goal',
      stats: {
        shortestPathLength: 0,
        routeCount: 0,
        junglePercent: 0,
        waterPercent: 0,
        villagePercent: 0,
        mountainPercent: 0,
        difficultyScore: 0,
      },
      tiles: [
        {
          id: 'start',
          q: 0,
          r: 0,
          terrain: 'START',
          difficulty: 0,
          isBlocked: false,
        },
        {
          id: 'a',
          q: 1,
          r: 0,
          terrain: 'JUNGLE',
          difficulty: 1,
          isBlocked: false,
        },
        {
          id: 'b',
          q: 0,
          r: 1,
          terrain: 'WATER',
          difficulty: 1,
          isBlocked: false,
        },
        {
          id: 'mid-a',
          q: 1,
          r: 1,
          terrain: 'VILLAGE',
          difficulty: 1,
          isBlocked: false,
        },
        {
          id: 'mid-b',
          q: 2,
          r: 0,
          terrain: 'RUBBLE',
          difficulty: 1,
          isBlocked: false,
        },
        {
          id: 'goal',
          q: 2,
          r: 1,
          terrain: 'GOAL',
          difficulty: 0,
          isBlocked: false,
        },
      ],
    }

    expect(countDistinctRoutesFromStart(map)).toBe(2)
  })
})
