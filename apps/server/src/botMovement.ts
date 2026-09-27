import {
  canAffordMove,
  getEffectiveMoveRequirements,
  getMoveRequirements,
} from '../../../packages/game-engine/src/index.js'
import { getNeighbors } from '../../../packages/map-generator/src/index.js'
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

export const findBotRoute = (
  game: GameState,
  player: PlayerState,
): HexTile[] => {
  const start = game.map.tiles.find((tile) => tile.id === player.position)
  const goal = game.map.tiles.find((tile) => tile.id === game.map.goalHexId)
  if (!start || !goal) return []

  const queue = [start]
  const previous = new Map<string, string>()
  const distances = new Map([[start.id, 0]])
  while (queue.length > 0) {
    queue.sort(
      (left, right) =>
        (distances.get(left.id) ?? Infinity) -
        (distances.get(right.id) ?? Infinity),
    )
    const tile = queue.shift()!
    if (tile.id === goal.id) break
    const neighbors = getNeighbors(game.map.tiles, tile).filter(
      (neighbor) =>
        !neighbor.isBlocked &&
        neighbor.terrain !== 'MOUNTAIN' &&
        (game.settings.allowSharedTiles ||
          neighbor.id === goal.id ||
          !game.players.some(
            (other) => other.id !== player.id && other.position === neighbor.id,
          )),
    )
    for (const neighbor of neighbors) {
      const requirements = getMoveRequirements(tile, neighbor)
      if (requirements.length === 0) continue
      const cost =
        (distances.get(tile.id) ?? Infinity) +
        requirements.reduce((sum, requirement) => sum + requirement.amount, 0) +
        0.1 +
        (tile.id === start.id && !canReachWithHand(player, tile, neighbor)
          ? 100
          : 0)
      if (cost >= (distances.get(neighbor.id) ?? Infinity)) continue
      distances.set(neighbor.id, cost)
      previous.set(neighbor.id, tile.id)
      queue.push(neighbor)
    }
  }
  if (!distances.has(goal.id)) return []

  const route: HexTile[] = []
  let id = goal.id
  while (id !== start.id) {
    const tile = game.map.tiles.find((candidate) => candidate.id === id)
    const parent = previous.get(id)
    if (!tile || !parent) return []
    route.unshift(tile)
    id = parent
  }
  return route
}
