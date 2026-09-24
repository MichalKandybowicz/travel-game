import type { HexTile } from '../../shared/src/index.js'
import { SeededRandom } from './SeededRandom.js'
import { axialDistance, getNeighbors } from './HexGrid.js'

const tileIdSet = (tiles: HexTile[]): Set<string> =>
  new Set(tiles.map((tile) => tile.id))

const chooseStep = (
  current: HexTile,
  target: HexTile,
  grid: HexTile[],
  random: SeededRandom,
): HexTile => {
  const candidates = getNeighbors(grid, current).sort(
    (left, right) => axialDistance(left, target) - axialDistance(right, target),
  )
  const bestDistance = axialDistance(candidates[0]!, target)
  const closeChoices = candidates.filter(
    (candidate) => axialDistance(candidate, target) <= bestDistance + 1,
  )
  return random.pick(closeChoices)
}

export const tracePath = (
  from: HexTile,
  to: HexTile,
  grid: HexTile[],
  random: SeededRandom,
): HexTile[] => {
  const path: HexTile[] = [from]
  const seen = tileIdSet(path)
  let current = from
  let safety = grid.length * 2
  while (current.id !== to.id && safety > 0) {
    const next = chooseStep(current, to, grid, random)
    if (!seen.has(next.id)) {
      path.push(next)
      seen.add(next.id)
    }
    current = next
    safety -= 1
  }
  if (path[path.length - 1]!.id !== to.id) {
    path.push(to)
  }
  return path
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
