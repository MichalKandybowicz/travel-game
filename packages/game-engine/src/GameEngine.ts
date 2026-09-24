import type {
  CardPlayMode,
  CardInstance,
  GameError,
  GameMap,
  GameState,
  HexTile,
  MapSettings,
  MovementPool,
  PlayerState,
  TerrainType,
} from '../../shared/src/index.js'
import {
  CARD_BY_ID,
  MARKET_CARD_IDS,
  createCardInstance,
} from '../../shared/src/index.js'
import {
  generateMap,
  getNeighbors,
  SeededRandom,
} from '../../map-generator/src/index.js'
import { buildStartingDeck, drawCards } from './Deck.js'

const createMovementPool = (): MovementPool => ({
  GREEN: 0,
  BLUE: 0,
  YELLOW: 0,
  WILD: 0,
})

const error = (code: GameError['code'], message: string): never => {
  throw { code, message } satisfies GameError
}

const findPlayer = (gameState: GameState, playerId: string): PlayerState => {
  const player = gameState.players.find((entry) => entry.id === playerId)
  if (!player) {
    error('PLAYER_NOT_FOUND', 'Player was not found in this game.')
  }
  return player!
}

const findTile = (map: GameMap, hexId: string): HexTile => {
  const tile = map.tiles.find((entry) => entry.id === hexId)
  if (!tile) {
    error('INVALID_MOVE', 'Target hex does not exist.')
  }
  return tile!
}

const ensureTurn = (gameState: GameState, playerId: string): void => {
  if (gameState.currentPlayerId !== playerId) {
    error('NOT_YOUR_TURN', 'It is not your turn.')
  }
  if (gameState.status !== 'ACTIVE') {
    error('GAME_NOT_STARTED', 'The game is not active.')
  }
}

const spendColor = (
  player: PlayerState,
  movementType: keyof MovementPool,
  amount: number,
): number => {
  const spent = Math.min(player.availableMovement[movementType], amount)
  player.availableMovement[movementType] -= spent
  return amount - spent
}

const spendAny = (player: PlayerState, amount: number): number => {
  let remaining = amount
  for (const movementType of ['GREEN', 'BLUE', 'WILD', 'YELLOW'] as const) {
    remaining = spendColor(player, movementType, remaining)
    if (remaining === 0) {
      return 0
    }
  }
  return remaining
}

export const getTerrainCost = (
  terrain: TerrainType,
  difficulty: number,
): keyof MovementPool | 'ANY' | 'BLOCKED' => {
  switch (terrain) {
    case 'JUNGLE':
      return 'GREEN'
    case 'WATER':
      return 'BLUE'
    case 'VILLAGE':
      return 'YELLOW'
    case 'RUBBLE':
    case 'CAMP':
    case 'START':
    case 'GOAL':
      return 'ANY'
    case 'MOUNTAIN':
      return 'BLOCKED'
    default:
      return difficulty > 0 ? 'ANY' : 'BLOCKED'
  }
}

export const canAffordMove = (player: PlayerState, tile: HexTile): boolean => {
  if (tile.isBlocked) {
    return false
  }
  const costType = getTerrainCost(tile.terrain, tile.difficulty)
  if (costType === 'BLOCKED') {
    return false
  }
  if (costType === 'ANY') {
    const total = Object.values(player.availableMovement).reduce(
      (sum, value) => sum + value,
      0,
    )
    return total >= Math.max(1, tile.difficulty)
  }
  return (
    player.availableMovement[costType] + player.availableMovement.WILD >=
    tile.difficulty
  )
}

const spendMove = (player: PlayerState, tile: HexTile): void => {
  const costType = getTerrainCost(tile.terrain, tile.difficulty)
  if (costType === 'BLOCKED') {
    error('HEX_BLOCKED', 'That hex is blocked.')
  }

  if (costType === 'ANY') {
    if (spendAny(player, Math.max(1, tile.difficulty)) > 0) {
      error('NOT_ENOUGH_MOVEMENT', 'Not enough movement points for that tile.')
    }
    return
  }

  let remaining = spendColor(
    player,
    costType as keyof MovementPool,
    tile.difficulty,
  )
  if (remaining > 0) {
    remaining = spendColor(player, 'WILD', remaining)
  }
  if (remaining > 0) {
    error('NOT_ENOUGH_MOVEMENT', 'Not enough movement points for that terrain.')
  }
}

const nextPlayerId = (gameState: GameState): string => {
  const index = gameState.players.findIndex(
    (player) => player.id === gameState.currentPlayerId,
  )
  return gameState.players[(index + 1) % gameState.players.length]!.id
}

export interface PlayerSetup {
  id: string
  name: string
}

export const createGameState = (
  roomCode: string,
  settings: MapSettings,
  players: PlayerSetup[],
): GameState => {
  const map = generateMap(settings)
  const marketDrawPile = new SeededRandom(
    `${settings.seed}:${roomCode}:market:0`,
  ).shuffle(MARKET_CARD_IDS)
  const startHexId = map.startHexId
  const gamePlayers: PlayerState[] = players.map((player, index) => {
    const drawPile = buildStartingDeck(
      player.id,
      `${settings.seed}:${player.id}`,
    )
    const state: PlayerState = {
      id: player.id,
      name: player.name,
      position: startHexId,
      drawPile,
      hand: [],
      discardPile: [],
      removedCards: [],
      playedCards: [],
      availableMovement: createMovementPool(),
      availableGold: 0,
      isReady: true,
      connected: true,
    }
    drawCards(state, 4, `${settings.seed}:${player.id}:opening:${index}`)
    return state
  })

  return {
    id: `${roomCode}-${settings.seed}`,
    roomCode,
    status: 'ACTIVE',
    settings,
    seed: settings.seed,
    map,
    players: gamePlayers,
    currentPlayerId: gamePlayers[0]!.id,
    turnNumber: 1,
    market: marketDrawPile.splice(0, 4),
    marketDrawPile,
    marketCycle: 0,
  }
}

const replenishMarket = (gameState: GameState): void => {
  if (gameState.marketDrawPile.length === 0) {
    gameState.marketCycle += 1
    gameState.marketDrawPile = new SeededRandom(
      `${gameState.seed}:${gameState.roomCode}:market:${gameState.marketCycle}`,
    ).shuffle(
      MARKET_CARD_IDS.filter((cardId) => !gameState.market.includes(cardId)),
    )
  }
  const nextCardId = gameState.marketDrawPile.shift()
  if (nextCardId) {
    gameState.market.push(nextCardId)
  }
}

export const playCard = (
  gameState: GameState,
  playerId: string,
  cardInstanceId: string,
  mode: CardPlayMode = 'MOVEMENT',
): GameState => {
  ensureTurn(gameState, playerId)
  const player = findPlayer(gameState, playerId)
  const cardIndex = player.hand.findIndex(
    (card) => card.instanceId === cardInstanceId,
  )
  const card = player.hand[cardIndex]
  if (!card) {
    error('CARD_NOT_IN_HAND', 'That card is not in the player hand.')
  }
  const definition = CARD_BY_ID[card!.cardId]
  if (!definition) {
    error('INVALID_ACTION', 'Card definition was not found.')
  }
  const cardDefinition = definition!
  if (mode !== 'MOVEMENT' && mode !== 'GOLD') {
    error('INVALID_ACTION', 'Invalid card play mode.')
  }
  player.hand.splice(cardIndex, 1)
  player.playedCards.push(card!)
  if (mode === 'GOLD') {
    player.availableGold += cardDefinition.id === 'coin' ? 2 : 1
  } else {
    player.availableMovement[cardDefinition.movementType] +=
      cardDefinition.movementValue
  }
  return gameState
}

export const movePlayer = (
  gameState: GameState,
  playerId: string,
  targetHexId: string,
): GameState => {
  ensureTurn(gameState, playerId)
  const player = findPlayer(gameState, playerId)
  const currentTile = findTile(gameState.map, player.position)
  const targetTile = findTile(gameState.map, targetHexId)
  const adjacent = getNeighbors(gameState.map.tiles, currentTile).some(
    (tile) => tile.id === targetHexId,
  )
  if (!adjacent) {
    error('INVALID_MOVE', 'You can only move to adjacent hexes.')
  }
  if (targetTile.isBlocked || targetTile.terrain === 'MOUNTAIN') {
    error('HEX_BLOCKED', 'That hex is blocked.')
  }
  if (!canAffordMove(player, targetTile)) {
    error('NOT_ENOUGH_MOVEMENT', 'Not enough movement for the selected hex.')
  }
  spendMove(player, targetTile)
  player.position = targetHexId

  if (targetTile.terrain === 'GOAL') {
    gameState.status = 'FINISHED'
    gameState.winnerId = playerId
  }

  return gameState
}

export const buyCard = (
  gameState: GameState,
  playerId: string,
  cardId: string,
): GameState => {
  ensureTurn(gameState, playerId)
  const player = findPlayer(gameState, playerId)
  const definition = CARD_BY_ID[cardId]
  if (!definition || !gameState.market.includes(cardId)) {
    error('INVALID_ACTION', 'That card is not available in the market.')
  }
  const cardDefinition = definition!
  if (player.availableGold < cardDefinition.purchaseCost) {
    error('NOT_ENOUGH_GOLD', 'Not enough gold to buy that card.')
  }
  player.availableGold -= cardDefinition.purchaseCost
  const nextCard = createCardInstance(
    cardId,
    `${playerId}-buy-${gameState.turnNumber}-${player.discardPile.length}`,
  )
  player.discardPile.push(nextCard)
  gameState.market = gameState.market.filter((entry) => entry !== cardId)
  replenishMarket(gameState)
  return gameState
}

export const endTurn = (gameState: GameState, playerId: string): GameState => {
  ensureTurn(gameState, playerId)
  const player = findPlayer(gameState, playerId)
  player.discardPile.push(...player.playedCards)
  player.playedCards = []
  player.availableMovement = createMovementPool()
  player.availableGold = 0
  gameState.turnNumber += 1
  gameState.currentPlayerId = nextPlayerId(gameState)
  const nextPlayer = findPlayer(gameState, gameState.currentPlayerId)
  if (nextPlayer.hand.length < 4) {
    drawCards(
      nextPlayer,
      4 - nextPlayer.hand.length,
      `${gameState.seed}:${nextPlayer.id}:turn:${gameState.turnNumber}`,
    )
  }
  return gameState
}

const maskPile = (count: number, prefix: string): CardInstance[] =>
  Array.from({ length: count }, (_, index) => ({
    instanceId: `${prefix}-${index}`,
    cardId: 'hidden',
  }))

export const serializePublicGameState = (
  gameState: GameState,
  viewerPlayerId: string,
): GameState => ({
  ...gameState,
  marketDrawPile: [],
  players: gameState.players.map((player) => {
    if (player.id === viewerPlayerId) {
      return {
        ...player,
        drawPile: player.drawPile.map<CardInstance>((card) => ({ ...card })),
        hand: player.hand.map<CardInstance>((card) => ({ ...card })),
        discardPile: player.discardPile.map<CardInstance>((card) => ({
          ...card,
        })),
        removedCards: player.removedCards.map<CardInstance>((card) => ({
          ...card,
        })),
        playedCards: player.playedCards.map<CardInstance>((card) => ({
          ...card,
        })),
      }
    }

    return {
      ...player,
      drawPile: maskPile(player.drawPile.length, `${player.id}-draw`),
      hand: maskPile(player.hand.length, `${player.id}-hand`),
      discardPile: maskPile(player.discardPile.length, `${player.id}-discard`),
      removedCards: maskPile(
        player.removedCards.length,
        `${player.id}-removed`,
      ),
      playedCards: maskPile(player.playedCards.length, `${player.id}-played`),
    }
  }),
})
