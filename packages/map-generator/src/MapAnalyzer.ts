import type { GameMap, HexTile, MapAnalysis } from '../../shared/src/index.js'
import { getNeighbors } from './HexGrid.js'

const traversable = (tile: HexTile): boolean =>
  !tile.isBlocked && tile.terrain !== 'MOUNTAIN'

const bfsDistance = (map: GameMap): number => {
  const start = map.tiles.find((tile) => tile.id === map.startHexId)!
  const goal = map.tiles.find((tile) => tile.id === map.goalHexId)!
  const queue: Array<{ tile: HexTile; distance: number }> = [
    { tile: start, distance: 0 },
  ]
  const visited = new Set<string>([start.id])

  while (queue.length > 0) {
    const current = queue.shift()!
    if (current.tile.id === goal.id) {
      return current.distance
    }
    for (const neighbor of getNeighbors(map.tiles, current.tile)) {
      if (!traversable(neighbor) || visited.has(neighbor.id)) {
        continue
      }
      visited.add(neighbor.id)
      queue.push({ tile: neighbor, distance: current.distance + 1 })
    }
  }

  return Number.POSITIVE_INFINITY
}

export const countDistinctRoutesFromStart = (map: GameMap): number => {
  const start = map.tiles.find((tile) => tile.id === map.startHexId)!
  const goalId = map.goalHexId

  const canReachGoal = (source: HexTile): boolean => {
    const queue: HexTile[] = [source]
    const visited = new Set<string>([map.startHexId, source.id])
    while (queue.length > 0) {
      const current = queue.shift()!
      if (current.id === goalId) {
        return true
      }
      for (const neighbor of getNeighbors(map.tiles, current)) {
        if (!traversable(neighbor) || visited.has(neighbor.id)) {
          continue
        }
        visited.add(neighbor.id)
        queue.push(neighbor)
      }
    }
    return false
  }

  return getNeighbors(map.tiles, start).filter(
    (neighbor) => traversable(neighbor) && canReachGoal(neighbor),
  ).length
}

export const analyzeMap = (map: GameMap): MapAnalysis => {
  const terrainCounts = map.tiles.reduce<Record<string, number>>(
    (accumulator, tile) => {
      accumulator[tile.terrain] = (accumulator[tile.terrain] ?? 0) + 1
      return accumulator
    },
    {},
  )
  const traversableTiles = map.tiles.filter(traversable)
  const shortestPathLength = bfsDistance(map)
  const averageDifficulty =
    traversableTiles.reduce((sum, tile) => sum + tile.difficulty, 0) /
    Math.max(1, traversableTiles.length)
  const mountainPercent = Math.round(
    ((terrainCounts.MOUNTAIN ?? 0) / map.tiles.length) * 100,
  )
  const routeCount = countDistinctRoutesFromStart(map)
  const difficultyScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        shortestPathLength * 2 +
          averageDifficulty * 12 +
          mountainPercent * 0.8 +
          Math.max(0, 4 - routeCount) * 5,
      ),
    ),
  )

  return {
    shortestPathLength,
    routeCount,
    junglePercent: Math.round(
      ((terrainCounts.JUNGLE ?? 0) / map.tiles.length) * 100,
    ),
    waterPercent: Math.round(
      ((terrainCounts.WATER ?? 0) / map.tiles.length) * 100,
    ),
    villagePercent: Math.round(
      ((terrainCounts.VILLAGE ?? 0) / map.tiles.length) * 100,
    ),
    mountainPercent,
    difficultyScore,
  }
}
