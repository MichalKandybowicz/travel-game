import { describe, expect, it } from 'vitest'
import { createHexGrid } from '../../../packages/map-generator/src/index.js'
import { customMapPayloadSchema } from '../../../packages/shared/src/index.js'
import type {
  GameMap,
  MapSettings,
} from '../../../packages/shared/src/index.js'
import { normalizeCustomMap } from './customMapValidation.js'

const settings: MapSettings = {
  seed: 'STARTS-TEST',
  mapSize: 'SMALL',
  difficulty: 'NORMAL',
  routeCount: 2,
  jungleDensity: 0.4,
  waterDensity: 0.2,
  mountainDensity: 0.1,
  specialTileDensity: 0.05,
  chokepointCount: 1,
  allowSharedTiles: true,
  petalCount: 1,
  campCountMinPerPetal: 1,
  campCountMaxPerPetal: 1,
  fogMode: 'NONE',
}

const makeMap = (): GameMap => {
  const tiles = createHexGrid(2)
  return {
    tiles,
    startHexId: tiles[0]!.id,
    startHexIds: tiles.slice(0, 10).map((tile) => tile.id),
    goalHexId: tiles.at(-1)!.id,
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
}

describe('custom map starts', () => {
  it('accepts more than nine distinct reachable start fields', () => {
    const map = makeMap()
    expect(
      customMapPayloadSchema.safeParse({ name: 'Many starts', settings, map })
        .success,
    ).toBe(true)
    const normalized = normalizeCustomMap(map)
    expect(normalized?.startHexIds).toHaveLength(10)
    expect(
      normalized?.tiles.filter((tile) => tile.terrain === 'START'),
    ).toHaveLength(10)
  })

  it('requires at least four different start fields', () => {
    const map = makeMap()
    map.startHexIds = map.startHexIds!.slice(0, 3)
    expect(normalizeCustomMap(map)).toBeUndefined()
    expect(
      customMapPayloadSchema.safeParse({ name: 'Too few', settings, map })
        .success,
    ).toBe(false)

    map.startHexIds = [
      map.tiles[0]!.id,
      map.tiles[1]!.id,
      map.tiles[2]!.id,
      map.tiles[2]!.id,
    ]
    expect(normalizeCustomMap(map)).toBeUndefined()
  })

  it('keeps three reachable portals and normalizes their costs', () => {
    const map = makeMap()
    map.goalHexIds = map.tiles.slice(-3).map((tile) => tile.id)
    const normalized = normalizeCustomMap(map)

    expect(normalized?.goalHexIds).toEqual(map.goalHexIds)
    expect(
      normalized?.tiles.filter((tile) => tile.terrain === 'GOAL'),
    ).toHaveLength(3)
    expect(
      normalized?.tiles
        .filter((tile) => tile.terrain === 'GOAL')
        .every((tile) => tile.difficulty >= 5 && tile.difficulty <= 8),
    ).toBe(true)
  })
})
