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
  PlayerColor,
  PlayerSymbol,
} from '../../shared/src/index.js'
import {
  CARD_BY_ID,
  MARKET_CARD_IDS,
  createCardInstance,
} from '../../shared/src/index.js'
import {
  axialDistance,
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
    case 'DESERT':
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
  color?: PlayerColor
  symbol?: PlayerSymbol
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
  const gamePlayers: PlayerState[] = players.map((player, index) => {
    const drawPile = buildStartingDeck(
      player.id,
      `${settings.seed}:${player.id}`,
    )
    const state: PlayerState = {
      id: player.id,
      name: player.name,
      ...(player.color ? { color: player.color } : {}),
      ...(player.symbol ? { symbol: player.symbol } : {}),
      position: '',
      drawPile,
      hand: [],
      discardPile: [],
      removedCards: [],
      playedCards: [],
      availableMovement: createMovementPool(),
      availableGold: 0,
      hasBoughtThisTurn: false,
      isReady: true,
      connected: true,
    }
    drawCards(state, 4, `${settings.seed}:${player.id}:opening:${index}`)
    return state
  })

  return {
    id: `${roomCode}-${settings.seed}`,
    roomCode,
    status: 'CHOOSING_START',
    settings,
    seed: settings.seed,
    map,
    players: gamePlayers,
    currentPlayerId: gamePlayers[0]!.id,
    startSelectionOrder: gamePlayers.map((player) => player.id),
    turnNumber: 1,
    market: marketDrawPile.splice(0, 4),
    marketDrawPile,
    marketCycle: 0,
    roundPlayedCards: [],
  }
}

export const chooseStart = (
  gameState: GameState,
  playerId: string,
  hexId: string,
): GameState => {
  if (gameState.status !== 'CHOOSING_START') {
    error('INVALID_ACTION', 'Starting positions are not being selected.')
  }
  if (gameState.currentPlayerId !== playerId) {
    error('NOT_YOUR_TURN', 'It is not your turn to choose a starting position.')
  }
  const startIds = gameState.map.startHexIds ?? [gameState.map.startHexId]
  if (!startIds.includes(hexId)) {
    error('INVALID_MOVE', 'This is not a starting position.')
  }
  if (gameState.players.some((player) => player.position === hexId)) {
    error('HEX_OCCUPIED', 'This starting position is occupied.')
  }
  findPlayer(gameState, playerId).position = hexId
  const order =
    gameState.startSelectionOrder ??
    gameState.players.map((player) => player.id)
  const nextChooser = order.find((id) => !findPlayer(gameState, id).position)
  if (nextChooser) {
    gameState.currentPlayerId = nextChooser
  } else {
    gameState.players.sort((a, b) => order.indexOf(b.id) - order.indexOf(a.id))
    gameState.currentPlayerId = gameState.players[0]!.id
    gameState.status = 'ACTIVE'
  }
  return gameState
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
  gameState.roundPlayedCards ??= []
  gameState.roundPlayedCards.push({
    instanceId: card!.instanceId,
    playerId,
    cardId: cardDefinition.id,
    mode,
  })
  if (mode === 'GOLD') {
    player.availableGold += cardDefinition.goldValue
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
  if (
    gameState.settings.allowSharedTiles === false &&
    gameState.players.some(
      (other) => other.id !== playerId && other.position === targetHexId,
    )
  ) {
    error('HEX_OCCUPIED', 'That hex is occupied by another player.')
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
  if (player.hasBoughtThisTurn) {
    error('PURCHASE_LIMIT', 'You can buy only one card per turn.')
  }
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
  player.hasBoughtThisTurn = true
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
  player.hasBoughtThisTurn = false
  gameState.turnNumber += 1
  gameState.currentPlayerId = nextPlayerId(gameState)
  if (gameState.currentPlayerId === gameState.players[0]?.id) {
    gameState.roundPlayedCards = []
  }
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

export const removePlayer = (
  gameState: GameState,
  playerId: string,
): GameState => {
  if (gameState.status === 'CHOOSING_START') {
    findPlayer(gameState, playerId)
    gameState.players = gameState.players.filter(
      (player) => player.id !== playerId,
    )
    gameState.startSelectionOrder = (
      gameState.startSelectionOrder ??
      gameState.players.map((player) => player.id)
    ).filter((id) => id !== playerId)
    if (gameState.players.length <= 1) {
      gameState.status = 'FINISHED'
      if (gameState.players[0]) gameState.winnerId = gameState.players[0].id
    } else {
      const order =
        gameState.startSelectionOrder ??
        gameState.players.map((player) => player.id)
      const nextChooser = order.find(
        (id) => !findPlayer(gameState, id).position,
      )
      if (nextChooser) gameState.currentPlayerId = nextChooser
      else {
        gameState.players.sort(
          (a, b) => order.indexOf(b.id) - order.indexOf(a.id),
        )
        gameState.currentPlayerId = gameState.players[0]!.id
        gameState.status = 'ACTIVE'
      }
    }
    return gameState
  }
  if (gameState.status !== 'ACTIVE') {
    return gameState
  }
  const leavingPlayer = findPlayer(gameState, playerId)
  if (gameState.currentPlayerId === playerId && gameState.players.length > 1) {
    endTurn(gameState, playerId)
  }
  gameState.players = gameState.players.filter(
    (player) => player !== leavingPlayer,
  )
  gameState.roundPlayedCards = gameState.roundPlayedCards.filter(
    (entry) => entry.playerId !== playerId,
  )
  if (gameState.players.length === 1) {
    gameState.status = 'FINISHED'
    gameState.winnerId = gameState.players[0]!.id
  }
  return gameState
}

const maskPile = (count: number, prefix: string): CardInstance[] =>
  Array.from({ length: count }, (_, index) => ({
    instanceId: `${prefix}-${index}`,
    cardId: 'hidden',
  }))

const hideSpecialType = (tile: HexTile): HexTile => {
  const { specialType, ...rest } = tile
  void specialType
  return rest
}

export const serializePublicGameState = (
  gameState: GameState,
  viewerPlayerId: string,
): GameState => {
  const viewer = findPlayer(gameState, viewerPlayerId)
  const currentTile = findTile(
    gameState.map,
    viewer.position || gameState.map.startHexId,
  )
  const fogMode = gameState.settings.fogMode ?? 'NONE'
  const visiblePetals = new Set([currentTile.petalId])
  if (fogMode === 'PETAL') {
    for (const neighbor of getNeighbors(gameState.map.tiles, currentTile)) {
      visiblePetals.add(neighbor.petalId)
    }
  }
  const visibleTiles = gameState.map.tiles.flatMap((tile) => {
    if (gameState.status === 'CHOOSING_START' && tile.petalId === 0)
      return [tile]
    if (fogMode === 'NONE') return [tile]
    if (fogMode === 'PETAL') {
      return visiblePetals.has(tile.petalId)
        ? [tile]
        : [
            {
              ...hideSpecialType(tile),
              terrain: 'UNKNOWN' as const,
              difficulty: -1,
              isBlocked: true,
            },
          ]
    }
    const distance = axialDistance(currentTile, tile)
    const fullRange = fogMode === 'MEDIUM' ? 2 : 1
    const terrainRange = fogMode === 'MEDIUM' ? 4 : 2
    if (distance <= fullRange) return [tile]
    if (distance <= terrainRange) {
      return [{ ...hideSpecialType(tile), difficulty: -1 }]
    }
    return []
  })
  const visibleIds = new Set(
    visibleTiles
      .filter((tile) => tile.terrain !== 'UNKNOWN')
      .map((tile) => tile.id),
  )
  const fullyVisibleIds = new Set(
    visibleTiles
      .filter((tile) => tile.terrain !== 'UNKNOWN' && tile.difficulty >= 0)
      .map((tile) => tile.id),
  )
  return {
    ...gameState,
    map:
      fogMode === 'NONE'
        ? gameState.map
        : {
            ...gameState.map,
            tiles: visibleTiles,
            startHexId: visibleIds.has(gameState.map.startHexId)
              ? gameState.map.startHexId
              : '',
            ...(gameState.map.startHexIds
              ? {
                  startHexIds: gameState.map.startHexIds.filter((id) =>
                    visibleIds.has(id),
                  ),
                }
              : {}),
            goalHexId: visibleIds.has(gameState.map.goalHexId)
              ? gameState.map.goalHexId
              : '',
            stats: {
              shortestPathLength: 0,
              routeCount: 0,
              junglePercent: 0,
              waterPercent: 0,
              desertPercent: 0,
              mountainPercent: 0,
              difficultyScore: 0,
            },
          },
    marketDrawPile: [],
    players: gameState.players.map((player) => {
      const position = fullyVisibleIds.has(player.position)
        ? player.position
        : ''
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
        position,
        drawPile: maskPile(player.drawPile.length, `${player.id}-draw`),
        hand: maskPile(player.hand.length, `${player.id}-hand`),
        discardPile: maskPile(
          player.discardPile.length,
          `${player.id}-discard`,
        ),
        removedCards: maskPile(
          player.removedCards.length,
          `${player.id}-removed`,
        ),
        playedCards: maskPile(player.playedCards.length, `${player.id}-played`),
      }
    }),
  }
}
