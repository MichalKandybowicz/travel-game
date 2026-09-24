import type { HexTile } from '../../shared/src/index.js'
import { SeededRandom } from './SeededRandom.js'
import {
  axialDistance,
  getNeighborCoordinates,
  getNeighbors,
  hexKey,
} from './HexGrid.js'

export const tracePath = (
  from: HexTile,
  to: HexTile,
  grid: HexTile[],
  random: SeededRandom,
): HexTile[] => {
  const byCoordinate = new Map(
    grid.map((tile) => [hexKey(tile.q, tile.r), tile]),
  )
  const queue = [from]
  const previous = new Map<string, string>([[from.id, '']])
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!
    if (current.id === to.id) break
    const neighbors = random.shuffle(
      getNeighborCoordinates(current.q, current.r)
        .map(({ q, r }) => byCoordinate.get(hexKey(q, r)))
        .filter((tile): tile is HexTile => Boolean(tile)),
    )
    for (const neighbor of neighbors) {
      if (previous.has(neighbor.id)) continue
      previous.set(neighbor.id, current.id)
      queue.push(neighbor)
    }
  }
  if (!previous.has(to.id)) {
    throw new Error('Failed to build a contiguous path segment.')
  }
  const byId = new Map(grid.map((tile) => [tile.id, tile]))
  const path: HexTile[] = []
  for (let id = to.id; id; id = previous.get(id) ?? '') {
    path.push(byId.get(id)!)
  }
  return path.reverse()
}

export const createRouteSet = (
  start: HexTile,
  goal: HexTile,
  grid: HexTile[],
  routeCount: number,
  random: SeededRandom,
): Set<string> => {
  const routes = new Set<string>([start.id, goal.id])
  const startNeighbors = getNeighbors(grid, start)
  const goalNeighbors = getNeighbors(grid, goal)
  const interior = grid.filter(
    (tile) =>
      tile.id !== start.id &&
      tile.id !== goal.id &&
      axialDistance(tile, start) > 1,
  )

  for (let index = 0; index < routeCount; index += 1) {
    const entry = startNeighbors[index % startNeighbors.length]!
    const exit = goalNeighbors[(index + 1) % goalNeighbors.length]!
    const waypoint = random.pick(interior)
    const route = [
      ...tracePath(start, entry, grid, random),
      ...tracePath(entry, waypoint, grid, random),
      ...tracePath(waypoint, exit, grid, random),
      ...tracePath(exit, goal, grid, random),
    ]
    for (const tile of route) {
      routes.add(tile.id)
    }
  }

  const loopAttempts = Math.max(1, Math.floor(routeCount / 2) + 1)
  const routeTiles = grid.filter(
    (tile) =>
      routes.has(tile.id) && tile.id !== start.id && tile.id !== goal.id,
  )
  for (let attempt = 0; attempt < loopAttempts; attempt += 1) {
    const from = random.pick(routeTiles)
    const to = random.pick(routeTiles)
    for (const tile of tracePath(from, to, grid, random)) {
      routes.add(tile.id)
    }
  }

  return routes
}
