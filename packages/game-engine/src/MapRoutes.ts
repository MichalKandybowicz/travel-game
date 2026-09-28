import type { GameMap, HexTile } from '../../shared/src/index.js'
import {
  getNeighborCoordinates,
  hexKey,
} from '../../map-generator/src/HexGrid.js'
import { getMoveRequirements } from './GameEngine.js'

export interface MapRoute {
  tileIds: string[]
  cost: number
}

type Edge = { to: string; cost: number; key: string }

const edgeKey = (left: string, right: string): string =>
  left < right ? `${left}|${right}` : `${right}|${left}`

const routeEdges = (route: MapRoute): Set<string> =>
  new Set(
    route.tileIds
      .slice(1)
      .map((id, index) => edgeKey(route.tileIds[index]!, id)),
  )

export const routeDifference = (left: MapRoute, right: MapRoute): number => {
  const leftEdges = routeEdges(left)
  const rightEdges = routeEdges(right)
  const shorter = Math.min(leftEdges.size, rightEdges.size)
  if (shorter === 0) return 0
  const shared = [...leftEdges].filter((edge) => rightEdges.has(edge)).length
  return 1 - shared / shorter
}

const buildGraph = (tiles: HexTile[]): Map<string, Edge[]> => {
  const byCoordinate = new Map(
    tiles.map((tile) => [hexKey(tile.q, tile.r), tile]),
  )
  return new Map(
    tiles.map((tile) => {
      if (tile.isBlocked || tile.terrain === 'MOUNTAIN') return [tile.id, []]
      const edges = getNeighborCoordinates(tile.q, tile.r)
        .map(({ q, r }) => byCoordinate.get(hexKey(q, r)))
        .filter((neighbor): neighbor is HexTile => Boolean(neighbor))
        .flatMap((neighbor) => {
          const requirements = getMoveRequirements(tile, neighbor)
          return requirements.length > 0
            ? [
                {
                  to: neighbor.id,
                  cost: requirements.reduce(
                    (sum, requirement) => sum + requirement.amount,
                    0,
                  ),
                  key: edgeKey(tile.id, neighbor.id),
                },
              ]
            : []
        })
        .sort((left, right) => left.to.localeCompare(right.to))
      return [tile.id, edges]
    }),
  )
}

const shortestRoute = (
  graph: Map<string, Edge[]>,
  startId: string,
  goalId: string,
  penalties: Map<string, number>,
): MapRoute | undefined => {
  const distances = new Map([[startId, 0]])
  const previous = new Map<string, string>()
  const queue: Array<{ id: string; score: number }> = []
  const push = (entry: { id: string; score: number }) => {
    queue.push(entry)
    for (let index = queue.length - 1; index > 0;) {
      const parent = Math.floor((index - 1) / 2)
      if (queue[parent]!.score <= queue[index]!.score) break
      ;[queue[parent], queue[index]] = [queue[index]!, queue[parent]!]
      index = parent
    }
  }
  const pop = (): { id: string; score: number } | undefined => {
    const first = queue[0]
    const last = queue.pop()
    if (!first || !last) return first
    if (queue.length > 0) {
      queue[0] = last
      for (let index = 0; ;) {
        const left = index * 2 + 1
        const right = left + 1
        let smallest = index
        if (left < queue.length && queue[left]!.score < queue[smallest]!.score)
          smallest = left
        if (
          right < queue.length &&
          queue[right]!.score < queue[smallest]!.score
        )
          smallest = right
        if (smallest === index) break
        ;[queue[index], queue[smallest]] = [queue[smallest]!, queue[index]!]
        index = smallest
      }
    }
    return first
  }
  push({ id: startId, score: 0 })
  while (queue.length > 0) {
    const current = pop()!
    if (current.score !== distances.get(current.id)) continue
    if (current.id === goalId) break
    for (const edge of graph.get(current.id) ?? []) {
      const score = current.score + edge.cost + (penalties.get(edge.key) ?? 0)
      if (score >= (distances.get(edge.to) ?? Infinity)) continue
      distances.set(edge.to, score)
      previous.set(edge.to, current.id)
      push({ id: edge.to, score })
    }
  }
  if (!distances.has(goalId)) return undefined
  const tileIds: string[] = []
  for (let id: string | undefined = goalId; id; id = previous.get(id)) {
    tileIds.push(id)
  }
  tileIds.reverse()
  let cost = 0
  for (let index = 1; index < tileIds.length; index += 1) {
    cost += graph
      .get(tileIds[index - 1]!)!
      .find((edge) => edge.to === tileIds[index])!.cost
  }
  return { tileIds, cost }
}

export const findDiverseFastestRoutes = (
  map: GameMap,
  startId: string,
  count = 3,
  minimumDifference = 0.8,
): MapRoute[] => {
  const graph = buildGraph(map.tiles)
  if (!graph.has(startId) || !graph.has(map.goalHexId)) return []
  const first = shortestRoute(graph, startId, map.goalHexId, new Map())
  if (!first || first.tileIds.length < 2) return []
  const routes = [first]
  for (let index = 1; index < count; index += 1) {
    const usedEdges = routes.map(routeEdges)
    const candidates: MapRoute[] = []
    for (const penalty of [1, 2, 4, 8, 16, 32, 64, 128, 256, 512]) {
      const penalties = new Map<string, number>()
      for (const edges of usedEdges) {
        for (const edge of edges) {
          penalties.set(edge, (penalties.get(edge) ?? 0) + penalty)
        }
      }
      const candidate = shortestRoute(graph, startId, map.goalHexId, penalties)
      if (
        candidate &&
        routes.every(
          (route) =>
            routeDifference(route, candidate) + 1e-9 >= minimumDifference,
        )
      ) {
        candidates.push(candidate)
      }
    }
    if (candidates.length === 0) break
    candidates.sort((left, right) => left.cost - right.cost)
    routes.push(candidates[0]!)
  }
  return routes.sort((left, right) => left.cost - right.cost)
}
