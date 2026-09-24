import { describe, expect, it } from 'vitest'
import type { MapSettings } from '../../shared/src/index.js'
import { analyzeMap } from './MapAnalyzer.js'
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
})
