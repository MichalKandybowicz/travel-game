import {
  canAffordMove,
  getEffectiveMoveRequirements,
  getMoveRequirements,
  serializePublicGameState,
} from '../../../packages/game-engine/src/index.js'
import {
  axialDistance,
  HEX_DIRECTIONS,
} from '../../../packages/map-generator/src/index.js'
import {
  CARD_BY_ID,
  type CardDefinition,
  type GameState,
  type HexTile,
  type MovementPool,
  type PlayerState,
} from '../../../packages/shared/src/index.js'

export const cardMovementFor = (
  card: CardDefinition,
  from: HexTile,
  target: HexTile,
  player?: PlayerState,
): number => {
  const requirements = player
    ? getEffectiveMoveRequirements(player, from, target)
    : getMoveRequirements(from, target)
  if (requirements.length === 0) return 0
  const usefulValue = (type: CardDefinition['movementType'], value: number) =>
    type === 'WILD' ||
    requirements.some(
      (requirement) => requirement.type === 'ANY' || requirement.type === type,
    )
      ? value
      : 0
  return (
    usefulValue(card.movementType, card.movementValue) +
    (card.secondaryMovementType && card.secondaryMovementValue
      ? usefulValue(card.secondaryMovementType, card.secondaryMovementValue)
      : 0)
  )
}

const movementWithHand = (
  player: PlayerState,
  initialMovement: MovementPool = player.availableMovement,
): MovementPool => {
  const movement = { ...initialMovement }
  for (const instance of player.hand) {
    const card = CARD_BY_ID[instance.cardId]
    if (card?.type !== 'MOVEMENT') continue
    movement[card.movementType] += card.movementValue
    if (card.secondaryMovementType && card.secondaryMovementValue) {
      movement[card.secondaryMovementType] += card.secondaryMovementValue
    }
  }
  return movement
}

export const canReachWithHand = (
  player: PlayerState,
  from: HexTile,
  target: HexTile,
  initialMovement?: MovementPool,
): boolean =>
  canAffordMove(
    {
      ...player,
      availableMovement: movementWithHand(player, initialMovement),
    },
    from,
    target,
  )

// The room preview already exposes the board outline. Fill unseen tiles with
// geometry only, so the planner never reads their actual terrain or cost.
export const buildBotKnowledge = (
  game: GameState,
  playerId: string,
): GameState => {
  const visible = serializePublicGameState(game, playerId)
  const visibleTiles = new Map(visible.map.tiles.map((tile) => [tile.id, tile]))
  return {
    ...visible,
    players: visible.players.map(({ remainingRouteCost, ...entry }) => {
      void remainingRouteCost
      return entry
    }),
    map: {
      ...visible.map,
      startHexId: game.map.startHexId,
      ...(game.map.startHexIds ? { startHexIds: game.map.startHexIds } : {}),
      tiles: game.map.tiles.map(({ id, q, r, petalId }) => {
        const known = visibleTiles.get(id)
        return known?.terrain !== undefined && known.terrain !== 'UNKNOWN'
          ? known
          : {
              id,
              q,
              r,
              ...(petalId !== undefined ? { petalId } : {}),
              terrain: 'UNKNOWN' as const,
              difficulty: -1,
              isBlocked: false,
            }
      }),
    },
  }
}

interface RoutePlan {
  route: HexTile[]
  cost: number
}

const planBotRoute = (
  game: GameState,
  player: PlayerState,
  startId = player.position,
): RoutePlan | undefined => {
  const tiles = game.map.tiles
  const byId = new Map(tiles.map((tile) => [tile.id, tile]))
  const byCoordinates = new Map(
    tiles.map((tile) => [`${tile.q},${tile.r}`, tile]),
  )
  const start = byId.get(startId)
  if (!start) return undefined

  const knownGoal = byId.get(game.map.goalHexId)
  const lastPetalId = Math.max(...tiles.map((tile) => tile.petalId ?? 0))
  const firstPetal = tiles.filter((tile) => (tile.petalId ?? 0) === 0)
  const firstCenter = {
    q: firstPetal.reduce((sum, tile) => sum + tile.q, 0) / firstPetal.length,
    r: firstPetal.reduce((sum, tile) => sum + tile.r, 0) / firstPetal.length,
  }
  const startingEdge = (game.map.startHexIds ?? [])
    .map((id) => byId.get(id))
    .filter((tile): tile is HexTile => Boolean(tile))
  const reference =
    lastPetalId === 0 && startingEdge.length > 0
      ? {
          q:
            startingEdge.reduce((sum, tile) => sum + tile.q, 0) /
            startingEdge.length,
          r:
            startingEdge.reduce((sum, tile) => sum + tile.r, 0) /
            startingEdge.length,
        }
      : firstCenter
  const lastPetal = tiles.filter((tile) => (tile.petalId ?? 0) === lastPetalId)
  const farthest = Math.max(
    ...lastPetal.map((tile) => axialDistance(tile, reference)),
  )
  const goals = knownGoal
    ? [knownGoal]
    : lastPetal.filter(
        (tile) =>
          tile.id !== start.id &&
          axialDistance(tile, reference) >= farthest - 0.001,
      )
  if (goals.length === 0) return undefined

  const supply = { GREEN: 0, BLUE: 0, YELLOW: 0, WILD: 0 }
  for (const card of [
    ...(player.hand ?? []),
    ...(player.drawPile ?? []),
    ...(player.discardPile ?? []),
  ]) {
    const definition = CARD_BY_ID[card.cardId]
    if (definition?.type !== 'MOVEMENT') continue
    supply[definition.movementType] += definition.movementValue
    if (definition.secondaryMovementType && definition.secondaryMovementValue) {
      supply[definition.secondaryMovementType] +=
        definition.secondaryMovementValue
    }
  }

  const previous = new Map<string, string>()
  const distances = new Map([[start.id, 0]])
  const queue: Array<{ id: string; cost: number }> = [{ id: start.id, cost: 0 }]
  const push = (entry: { id: string; cost: number }) => {
    queue.push(entry)
    let index = queue.length - 1
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2)
      if (queue[parent]!.cost <= entry.cost) break
      queue[index] = queue[parent]!
      index = parent
    }
    queue[index] = entry
  }
  const pop = () => {
    const first = queue[0]!
    const last = queue.pop()!
    if (queue.length > 0) {
      let index = 0
      while (index * 2 + 1 < queue.length) {
        let child = index * 2 + 1
        if (
          child + 1 < queue.length &&
          queue[child + 1]!.cost < queue[child]!.cost
        )
          child += 1
        if (last.cost <= queue[child]!.cost) break
        queue[index] = queue[child]!
        index = child
      }
      queue[index] = last
    }
    return first
  }
  const goalIds = new Set(goals.map((tile) => tile.id))
  let destination: HexTile | undefined
  while (queue.length > 0) {
    const current = pop()
    if (current.cost !== distances.get(current.id)) continue
    const tile = byId.get(current.id)!
    if (goalIds.has(tile.id)) {
      destination = tile
      break
    }
    const neighbors = HEX_DIRECTIONS.map(([dq, dr]) =>
      byCoordinates.get(`${tile.q + dq},${tile.r + dr}`),
    ).filter((neighbor): neighbor is HexTile => Boolean(neighbor))
    for (const neighbor of neighbors) {
      if (
        neighbor.isBlocked ||
        neighbor.terrain === 'MOUNTAIN' ||
        (game.settings.allowSharedTiles === false &&
          game.players.some(
            (other) => other.id !== player.id && other.position === neighbor.id,
          ))
      )
        continue
      const requirements =
        tile.terrain === 'UNKNOWN' ||
        neighbor.terrain === 'UNKNOWN' ||
        tile.difficulty < 0 ||
        neighbor.difficulty < 0
          ? undefined
          : getMoveRequirements(tile, neighbor)
      if (requirements?.length === 0) continue
      const movementCost = requirements
        ? requirements.reduce((sum, requirement) => {
            const scarce =
              requirement.type !== 'ANY' &&
              supply[requirement.type] + supply.WILD === 0
            return sum + requirement.amount * (scarce ? 3 : 1)
          }, 0)
        : 2.5
      const cost =
        current.cost +
        movementCost +
        0.1 +
        (tile.id === start.id && !canReachWithHand(player, tile, neighbor)
          ? 8
          : 0)
      if (cost >= (distances.get(neighbor.id) ?? Infinity)) continue
      distances.set(neighbor.id, cost)
      previous.set(neighbor.id, tile.id)
      push({ id: neighbor.id, cost })
    }
  }
  if (!destination) return undefined

  const route: HexTile[] = []
  let id = destination.id
  while (id !== start.id) {
    const tile = byId.get(id)
    const parent = previous.get(id)
    if (!tile || !parent) return undefined
    route.unshift(tile)
    id = parent
  }
  return { route, cost: distances.get(destination.id)! }
}

export const findBotRoute = (game: GameState, player: PlayerState): HexTile[] =>
  planBotRoute(game, player)?.route ?? []

export const chooseBotStart = (
  game: GameState,
  player: PlayerState,
): string | undefined => {
  const startIds = game.map.startHexIds ?? [game.map.startHexId]
  return startIds
    .map((id, index) => ({ id, index }))
    .filter(
      ({ id }) => !game.players.some((candidate) => candidate.position === id),
    )
    .map(({ id, index }) => ({
      id,
      score:
        (planBotRoute(game, player, id)?.cost ?? Infinity) +
        Math.abs(index - (startIds.length - 1) / 2) * 0.05,
    }))
    .sort((left, right) => left.score - right.score)[0]?.id
}

export const chooseBotSealHex = (
  game: GameState,
  player: PlayerState,
  ownNextHexId: string,
): string | undefined => {
  const current = game.map.tiles.find((tile) => tile.id === player.position)
  if (!current) return undefined
  const visibleOpponents = game.players
    .filter((other) => other.id !== player.id && other.position)
    .map((other) => game.map.tiles.find((tile) => tile.id === other.position))
    .filter((tile): tile is HexTile => Boolean(tile))
  if (visibleOpponents.length === 0) return undefined
  return game.map.tiles
    .filter(
      (tile) =>
        tile.id !== ownNextHexId &&
        axialDistance(current, tile) >= 1 &&
        axialDistance(current, tile) <= 2 &&
        tile.difficulty >= 0 &&
        !tile.isBlocked &&
        !['START', 'GOAL', 'MOUNTAIN', 'UNKNOWN'].includes(tile.terrain) &&
        !game.players.some((other) => other.position === tile.id),
    )
    .map((tile) => ({
      tile,
      distance: Math.min(
        ...visibleOpponents.map((opponent) => axialDistance(opponent, tile)),
      ),
    }))
    .filter((candidate) => candidate.distance === 1)
    .sort((left, right) => left.tile.id.localeCompare(right.tile.id))[0]?.tile
    .id
}
