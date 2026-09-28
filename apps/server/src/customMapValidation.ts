import type { GameMap } from '../../../packages/shared/src/index.js'
import {
  analyzeMap,
  getNeighborCoordinates,
  hexKey,
} from '../../../packages/map-generator/src/index.js'

export const normalizeCustomMap = (map: GameMap): GameMap | undefined => {
  const tileIds = new Set(map.tiles.map((tile) => tile.id))
  const coordinates = new Set(map.tiles.map((tile) => hexKey(tile.q, tile.r)))
  const startIds = map.startHexIds ?? []
  if (
    tileIds.size !== map.tiles.length ||
    coordinates.size !== map.tiles.length ||
    startIds.length < 4 ||
    new Set(startIds).size !== startIds.length ||
    startIds.some((id) => !tileIds.has(id)) ||
    !tileIds.has(map.goalHexId) ||
    startIds.includes(map.goalHexId)
  ) {
    return undefined
  }
  const startSet = new Set(startIds)
  const tiles = map.tiles.map((tile) => ({
    ...tile,
    terrain: startSet.has(tile.id)
      ? ('START' as const)
      : tile.id === map.goalHexId
        ? ('GOAL' as const)
        : tile.terrain === 'START' || tile.terrain === 'GOAL'
          ? ('RUBBLE' as const)
          : tile.terrain,
    difficulty:
      startSet.has(tile.id) || tile.id === map.goalHexId
        ? 1
        : tile.terrain === 'MOUNTAIN'
          ? 0
          : tile.difficulty,
    isBlocked:
      !startSet.has(tile.id) &&
      tile.id !== map.goalHexId &&
      tile.terrain === 'MOUNTAIN',
  }))
  const normalized = {
    ...map,
    tiles,
    startHexId: startIds[0]!,
    startHexIds: startIds,
  }
  const byCoordinate = new Map(
    tiles.map((tile) => [hexKey(tile.q, tile.r), tile]),
  )
  const reachable = new Set([map.goalHexId])
  const queue = [tiles.find((tile) => tile.id === map.goalHexId)!]
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!
    for (const { q, r } of getNeighborCoordinates(current.q, current.r)) {
      const neighbor = byCoordinate.get(hexKey(q, r))
      if (
        !neighbor ||
        neighbor.isBlocked ||
        neighbor.terrain === 'MOUNTAIN' ||
        reachable.has(neighbor.id)
      ) {
        continue
      }
      reachable.add(neighbor.id)
      queue.push(neighbor)
    }
  }
  if (!startIds.every((id) => reachable.has(id))) return undefined
  return { ...normalized, stats: analyzeMap(normalized) }
}
