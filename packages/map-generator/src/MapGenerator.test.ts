import { describe, expect, it } from 'vitest'
import type { GameMap, MapSettings } from '../../shared/src/index.js'
import { mapSettingsSchema } from '../../shared/src/index.js'
import { analyzeMap, countDistinctRoutesFromStart } from './MapAnalyzer.js'
import { generateMap } from './MapGenerator.js'
import { axialDistance, getNeighbors, HEX_DIRECTIONS } from './HexGrid.js'

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
  allowSharedTiles: true,
  petalCount: 1,
  fogMode: 'NONE',
}

describe('generateMap', () => {
  it('defaults to three petals and allows at most twelve', () => {
    expect(
      mapSettingsSchema.parse({ ...settings, petalCount: undefined })
        .petalCount,
    ).toBe(3)
    expect(
      mapSettingsSchema.safeParse({ ...settings, petalCount: 12 }).success,
    ).toBe(true)
    expect(
      mapSettingsSchema.safeParse({ ...settings, petalCount: 13 }).success,
    ).toBe(false)
  })

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

  it('connects the requested number of distinct petals', () => {
    for (const petalCount of Array.from(
      { length: 12 },
      (_, index) => index + 1,
    )) {
      const map = generateMap({ ...settings, petalCount })
      const ids = new Set(map.tiles.map((tile) => tile.id))
      expect(map.petalCount).toBe(petalCount)
      expect(new Set(map.tiles.map((tile) => tile.petalId)).size).toBe(
        petalCount,
      )
      expect(ids.size).toBe(map.tiles.length)
      expect(map.stats.shortestPathLength).toBeGreaterThan(0)
      const sideLength = 2 * 4 + 1
      let petalConnections = 0
      const petalNeighbors = Array.from(
        { length: petalCount },
        () => new Set<number>(),
      )
      for (let index = 1; index < petalCount; index += 1) {
        const boundaryByPetal = new Map<number, number>()
        for (const tile of map.tiles.filter(
          (entry) => entry.petalId === index,
        )) {
          for (const neighbor of getNeighbors(map.tiles, tile)) {
            if (neighbor.petalId !== undefined && neighbor.petalId < index) {
              boundaryByPetal.set(
                neighbor.petalId,
                (boundaryByPetal.get(neighbor.petalId) ?? 0) + 1,
              )
            }
          }
        }
        expect(
          [...boundaryByPetal.values()].some((count) => count === sideLength),
        ).toBe(true)
        expect(
          [...boundaryByPetal.values()].every((count) => count === sideLength),
        ).toBe(true)
        for (const neighborId of boundaryByPetal.keys()) {
          petalNeighbors[index]!.add(neighborId)
          petalNeighbors[neighborId]!.add(index)
        }
        petalConnections += boundaryByPetal.size
      }
      expect(petalConnections).toBe(petalCount - 1)
      expect(petalNeighbors.every((neighbors) => neighbors.size <= 2)).toBe(
        true,
      )
      expect(
        map.tiles.find((tile) => tile.id === map.startHexId)?.petalId,
      ).toBe(0)
      expect(map.tiles.find((tile) => tile.id === map.goalHexId)?.petalId).toBe(
        petalCount - 1,
      )
      if (petalCount >= 3) {
        const centers = [0, 1, 2].map((petalId) => {
          const tiles = map.tiles.filter((tile) => tile.petalId === petalId)
          return {
            q: tiles.reduce((sum, tile) => sum + tile.q, 0) / tiles.length,
            r: tiles.reduce((sum, tile) => sum + tile.r, 0) / tiles.length,
          }
        })
        const [first, second, third] = centers
        const cross =
          (second!.q - first!.q) * (third!.r - first!.r) -
          (second!.r - first!.r) * (third!.q - first!.q)
        expect(cross).not.toBe(0)
      }
    }
  })

  it('uses terrain cost ranges and creates spaced camps, mountain groups and water bodies', () => {
    const ranges = {
      JUNGLE: [1, 4],
      WATER: [1, 3],
      DESERT: [1, 4],
      RUBBLE: [2, 4],
      CAMP: [1, 5],
    } as const
    for (const [mapSize, petalCount] of [
      ['SMALL', 3],
      ['MEDIUM', 6],
      ['LARGE', 12],
    ] as const) {
      const map = generateMap({ ...settings, mapSize, petalCount })
      const byCoordinate = new Map(
        map.tiles.map((tile) => [`${tile.q},${tile.r}`, tile]),
      )
      const neighborsOf = (tile: (typeof map.tiles)[number]) =>
        HEX_DIRECTIONS.map(([dq, dr]) =>
          byCoordinate.get(`${tile.q + dq},${tile.r + dr}`),
        ).filter((neighbor) => neighbor !== undefined)
      for (const tile of map.tiles) {
        if (tile.terrain in ranges) {
          const [min, max] = ranges[tile.terrain as keyof typeof ranges]
          expect(tile.difficulty).toBeGreaterThanOrEqual(min)
          expect(tile.difficulty).toBeLessThanOrEqual(max)
        }
      }
      const camps = map.tiles.filter((tile) => tile.terrain === 'CAMP')
      expect(camps).toHaveLength(petalCount)
      expect(new Set(camps.map((tile) => tile.petalId)).size).toBe(petalCount)
      for (let left = 0; left < camps.length; left += 1) {
        for (let right = left + 1; right < camps.length; right += 1) {
          expect(
            axialDistance(camps[left]!, camps[right]!),
          ).toBeGreaterThanOrEqual(3)
        }
      }
      for (const terrain of ['MOUNTAIN', 'WATER'] as const) {
        const visited = new Set<string>()
        const componentSizes: number[] = []
        for (const tile of map.tiles.filter(
          (entry) => entry.terrain === terrain,
        )) {
          if (visited.has(tile.id)) continue
          const queue = [tile]
          visited.add(tile.id)
          for (let index = 0; index < queue.length; index += 1) {
            for (const neighbor of neighborsOf(queue[index]!)) {
              if (neighbor.terrain !== terrain || visited.has(neighbor.id))
                continue
              visited.add(neighbor.id)
              queue.push(neighbor)
            }
          }
          componentSizes.push(queue.length)
        }
        expect(componentSizes.length).toBeGreaterThan(0)
        for (const size of componentSizes) {
          expect(size).toBeGreaterThanOrEqual(terrain === 'MOUNTAIN' ? 3 : 2)
          if (terrain === 'MOUNTAIN') expect(size).toBeLessThanOrEqual(5)
        }
      }
    }
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
        desertPercent: 0,
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
          terrain: 'DESERT',
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
