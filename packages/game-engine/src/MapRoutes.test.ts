import { describe, expect, it } from 'vitest'
import type { GameMap, HexTile } from '../../shared/src/index.js'
import { findDiverseFastestRoutes, routeDifference } from './MapRoutes.js'

const tile = (
  id: string,
  q: number,
  r: number,
  terrain: HexTile['terrain'] = 'JUNGLE',
  difficulty = 1,
): HexTile => ({
  id,
  q,
  r,
  terrain,
  difficulty,
  isBlocked: terrain === 'MOUNTAIN',
})

const mapWith = (tiles: HexTile[]): GameMap => ({
  tiles,
  startHexId: 'start',
  startHexIds: ['start'],
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
})

describe('findDiverseFastestRoutes', () => {
  it('draws up to three cost-ordered routes with at least 80% different edges', () => {
    const map = mapWith([
      tile('start', 0, 0, 'START'),
      tile('goal', 3, 0, 'GOAL'),
      tile('direct-1', 1, 0),
      tile('direct-2', 2, 0),
      tile('top-1', 0, -1),
      tile('top-2', 1, -1),
      tile('top-3', 2, -1),
      tile('top-4', 3, -1),
      tile('bottom-1', 0, 1),
      tile('bottom-2', 1, 1),
      tile('bottom-3', 2, 1),
      tile('bottom-4', 3, 1),
    ])
    const routes = findDiverseFastestRoutes(map, 'start')

    expect(routes).toHaveLength(3)
    expect(routes[0]?.tileIds).toEqual([
      'start',
      'direct-1',
      'direct-2',
      'goal',
    ])
    expect(routes.map((route) => route.cost)).toEqual(
      [...routes.map((route) => route.cost)].sort(
        (left, right) => left - right,
      ),
    )
    for (let left = 0; left < routes.length; left += 1) {
      for (let right = left + 1; right < routes.length; right += 1) {
        expect(
          routeDifference(routes[left]!, routes[right]!),
        ).toBeGreaterThanOrEqual(0.8)
      }
    }
  })

  it('uses real movement costs and skips mountains', () => {
    const map = mapWith([
      tile('start', 0, 0, 'START'),
      tile('mountain', 1, 0, 'MOUNTAIN', 0),
      tile('goal', 2, -1, 'GOAL'),
      tile('detour', 1, -1, 'WATER', 3),
    ])
    const routes = findDiverseFastestRoutes(map, 'start')

    expect(routes).toHaveLength(1)
    expect(routes[0]?.tileIds).toEqual(['start', 'detour', 'goal'])
    expect(routes[0]?.cost).toBe(8)
  })

  it('returns no route when the goal cannot be reached', () => {
    const map = mapWith([
      tile('start', 0, 0, 'START'),
      tile('mountain', 1, 0, 'MOUNTAIN', 0),
      tile('goal', 2, 0, 'GOAL'),
    ])

    expect(findDiverseFastestRoutes(map, 'start')).toEqual([])
  })
})
