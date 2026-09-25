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
  TokenInstance,
  PlayerColor,
  PlayerSymbol,
} from '../../shared/src/index.js'
import {
  CARD_BY_ID,
  MARKET_CARD_IDS,
  TOKEN_BY_TYPE,
  TOKEN_DEFINITIONS,
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

const getFogVisibility = (
  map: GameMap,
  position: string,
  fogMode: MapSettings['fogMode'],
): { revealed: Set<string>; scouted: Set<string> } => {
  const currentTile = map.tiles.find((tile) => tile.id === position)
  const revealed = new Set<string>()
  const scouted = new Set<string>()
  if (!currentTile) return { revealed, scouted }

  if (fogMode === 'NONE') {
    for (const tile of map.tiles) {
      revealed.add(tile.id)
      scouted.add(tile.id)
    }
    return { revealed, scouted }
  }

  if (fogMode === 'PETAL') {
    const visiblePetals = new Set([currentTile.petalId])
    for (const neighbor of getNeighbors(map.tiles, currentTile)) {
      visiblePetals.add(neighbor.petalId)
    }
    for (const tile of map.tiles) {
      if (visiblePetals.has(tile.petalId)) {
        revealed.add(tile.id)
        scouted.add(tile.id)
      }
    }
    return { revealed, scouted }
  }

  const fullRange = fogMode === 'MEDIUM' ? 2 : 1
  const terrainRange = fogMode === 'MEDIUM' ? 4 : 2
  for (const tile of map.tiles) {
    const distance = axialDistance(currentTile, tile)
    if (distance <= terrainRange) scouted.add(tile.id)
    if (distance <= fullRange) revealed.add(tile.id)
  }
  return { revealed, scouted }
}

const rememberVisibleTiles = (
  gameState: GameState,
  player: PlayerState,
): void => {
  const visibility = getFogVisibility(
    gameState.map,
    player.position,
    gameState.settings.fogMode ?? 'NONE',
  )
  player.revealedTileIds = [
    ...new Set([...(player.revealedTileIds ?? []), ...visibility.revealed]),
  ]
  player.scoutedTileIds = [
    ...new Set([...(player.scoutedTileIds ?? []), ...visibility.scouted]),
  ]
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
): Exclude<keyof MovementPool, 'WILD'> | 'ANY' | 'BLOCKED' => {
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

export type MoveRequirement = {
  type: Exclude<keyof MovementPool, 'WILD'> | 'ANY'
  amount: number
}

export const getMoveRequirements = (
  from: HexTile,
  to: HexTile,
): MoveRequirement[] => {
  const fromType = getTerrainCost(from.terrain, from.difficulty)
  const toType = getTerrainCost(to.terrain, to.difficulty)
  if (
    from.isBlocked ||
    to.isBlocked ||
    fromType === 'BLOCKED' ||
    toType === 'BLOCKED'
  ) {
    return []
  }
  const fromAmount = Math.max(1, from.difficulty)
  const toAmount = Math.max(1, to.difficulty)
  if (fromType === toType) {
    return [{ type: fromType, amount: fromAmount + toAmount - 1 }]
  }
  return [
    { type: fromType, amount: fromAmount },
    { type: toType, amount: toAmount },
  ]
}

export const canAffordMove = (
  player: PlayerState,
  from: HexTile,
  to: HexTile,
): boolean => {
  const requirements = getMoveRequirements(from, to)
  if (requirements.length === 0) return false
  const coloredDeficit = requirements
    .filter(
      (
        requirement,
      ): requirement is MoveRequirement & {
        type: Exclude<keyof MovementPool, 'WILD'>
      } => requirement.type !== 'ANY',
    )
    .reduce(
      (sum, requirement) =>
        sum +
        Math.max(
          0,
          requirement.amount - player.availableMovement[requirement.type],
        ),
      0,
    )
  const totalRequired = requirements.reduce(
    (sum, requirement) => sum + requirement.amount,
    0,
  )
  const totalAvailable = Object.values(player.availableMovement).reduce(
    (sum, value) => sum + value,
    0,
  )
  return (
    coloredDeficit <= player.availableMovement.WILD &&
    totalAvailable >= totalRequired
  )
}

const spendMove = (player: PlayerState, from: HexTile, to: HexTile): void => {
  const requirements = getMoveRequirements(from, to)
  if (requirements.length === 0) {
    error('HEX_BLOCKED', 'That connection is blocked.')
  }
  for (const requirement of requirements) {
    if (requirement.type === 'ANY') continue
    let remaining = spendColor(player, requirement.type, requirement.amount)
    if (remaining > 0) remaining = spendColor(player, 'WILD', remaining)
  }
  const anyRequired = requirements
    .filter((requirement) => requirement.type === 'ANY')
    .reduce((sum, requirement) => sum + requirement.amount, 0)
  if (spendAny(player, anyRequired) > 0) {
    error('NOT_ENOUGH_MOVEMENT', 'Not enough movement points for this route.')
  }
}

const nextPlayerId = (gameState: GameState): string => {
  const index = gameState.players.findIndex(
    (player) => player.id === gameState.currentPlayerId,
  )
  return gameState.players[(index + 1) % gameState.players.length]!.id
}

const distanceToGoal = (gameState: GameState, player: PlayerState): number => {
  const goalId = gameState.map.goalHexId
  const visited = new Set([player.position])
  let frontier = [player.position]
  let distance = 0

  while (frontier.length > 0) {
    if (frontier.includes(goalId)) return distance
    const next: string[] = []
    for (const tileId of frontier) {
      const tile = gameState.map.tiles.find((entry) => entry.id === tileId)
      if (!tile) continue
      for (const neighbor of getNeighbors(gameState.map.tiles, tile)) {
        if (
          visited.has(neighbor.id) ||
          neighbor.isBlocked ||
          neighbor.terrain === 'MOUNTAIN'
        ) {
          continue
        }
        visited.add(neighbor.id)
        next.push(neighbor.id)
      }
    }
    frontier = next
    distance += 1
  }
  return Number.POSITIVE_INFINITY
}

const closestOpponentToGoal = (
  gameState: GameState,
  playerId: string,
): PlayerState => {
  const opponent = gameState.players
    .filter((player) => player.id !== playerId)
    .map((player, index) => ({
      player,
      index,
      distance: distanceToGoal(gameState, player),
    }))
    .sort(
      (left, right) =>
        left.distance - right.distance || left.index - right.index,
    )[0]?.player
  if (!opponent) {
    error('PLAYER_NOT_FOUND', 'There is no opponent to target.')
  }
  return opponent!
}

export interface PlayerSetup {
  id: string
  name: string
  isBot?: boolean
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
      ...(player.isBot ? { isBot: true } : {}),
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
      tokens: [],
      claimedCampIds: [],
      revealedTileIds: [],
      scoutedTileIds: [],
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
    roundNumber: 1,
    market: marketDrawPile.splice(0, 4),
    marketDrawPile,
    marketCycle: 0,
    marketPurchasedThisRound: false,
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
  const player = findPlayer(gameState, playerId)
  player.position = hexId
  rememberVisibleTiles(gameState, player)
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

const refreshMarket = (gameState: GameState, reason: string): void => {
  const previousMarket = new Set(gameState.market)
  gameState.marketCycle += 1
  gameState.marketDrawPile = new SeededRandom(
    `${gameState.seed}:${gameState.roomCode}:market:${gameState.marketCycle}:${reason}`,
  ).shuffle(MARKET_CARD_IDS.filter((cardId) => !previousMarket.has(cardId)))
  gameState.market = gameState.marketDrawPile.splice(0, 4)
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
  if (!canAffordMove(player, currentTile, targetTile)) {
    error('NOT_ENOUGH_MOVEMENT', 'Not enough movement for the selected hex.')
  }
  spendMove(player, currentTile, targetTile)
  player.position = targetHexId
  rememberVisibleTiles(gameState, player)

  if (targetTile.terrain === 'CAMP') {
    player.claimedCampIds ??= []
    player.tokens ??= []
    if (!player.claimedCampIds.includes(targetTile.id)) {
      const tokenType = new SeededRandom(
        `${gameState.seed}:${playerId}:camp:${targetTile.id}`,
      ).pick([...TOKEN_DEFINITIONS]).type
      const token: TokenInstance = {
        instanceId: `${playerId}-camp-${targetTile.id}`,
        type: tokenType,
      }
      player.claimedCampIds.push(targetTile.id)
      player.tokens.push(token)
    }
  }

  if (targetTile.terrain === 'GOAL') {
    gameState.status = 'FINISHED'
    gameState.winnerId = playerId
  }

  return gameState
}

export const useToken = (
  gameState: GameState,
  playerId: string,
  tokenInstanceId: string,
  targetPlayerId?: string,
): GameState => {
  ensureTurn(gameState, playerId)
  const player = findPlayer(gameState, playerId)
  const roundNumber = (gameState.roundNumber ??= 1)
  if (player.tokenUsedInRound === roundNumber) {
    error('TOKEN_LIMIT', 'You can use only one token per round.')
  }
  player.tokens ??= []
  const tokenIndex = player.tokens.findIndex(
    (token) => token.instanceId === tokenInstanceId,
  )
  const token = player.tokens[tokenIndex]
  if (!token) {
    return error(
      'TOKEN_NOT_FOUND',
      'That token is not in the player inventory.',
    )
  }
  const definition = TOKEN_BY_TYPE[token.type]
  if (!definition) {
    error('INVALID_ACTION', 'Token definition was not found.')
  }

  switch (definition.effect.kind) {
    case 'MOVEMENT':
      player.availableMovement[definition.effect.movementType] +=
        definition.effect.value
      break
    case 'GOLD':
      player.availableGold += definition.effect.value
      break
    case 'SWAP_HAND': {
      const handSize = player.hand.length
      player.discardPile.push(...player.hand)
      player.hand = []
      drawCards(
        player,
        handSize,
        `${gameState.seed}:${player.id}:token:${token.instanceId}`,
      )
      break
    }
    case 'DRAW_CARD':
      drawCards(
        player,
        1,
        `${gameState.seed}:${player.id}:token:${token.instanceId}`,
      )
      break
    case 'REFRESH_MARKET':
      refreshMarket(gameState, `token:${token.instanceId}`)
      gameState.marketPurchasedThisRound = true
      break
    case 'CURSE_REMOVE_CARD': {
      if (!targetPlayerId || targetPlayerId === playerId) {
        return error('INVALID_ACTION', 'Choose an opponent for this curse.')
      }
      const target = findPlayer(gameState, targetPlayerId)
      const candidates = [
        ...target.drawPile.map((card, index) => ({
          card,
          pile: target.drawPile,
          index,
        })),
        ...target.discardPile.map((card, index) => ({
          card,
          pile: target.discardPile,
          index,
        })),
      ]
      if (candidates.length === 0) {
        error('INVALID_ACTION', 'The opponent has no removable cards.')
      }
      const selected = new SeededRandom(
        `${gameState.seed}:${playerId}:token:${token.instanceId}:${targetPlayerId}`,
      ).pick(candidates)
      selected.pile.splice(selected.index, 1)
      target.removedCards.push(selected.card)
      break
    }
    case 'CURSE_SKIP_LEADER':
      closestOpponentToGoal(gameState, playerId).skipNextTurn = true
      break
    case 'CURSE_MARKET':
      gameState.marketLockedUntilPlayerId = playerId
      break
  }

  player.tokens.splice(tokenIndex, 1)
  player.tokenUsedInRound = roundNumber
  return gameState
}

export const buyCard = (
  gameState: GameState,
  playerId: string,
  cardId: string,
): GameState => {
  ensureTurn(gameState, playerId)
  const player = findPlayer(gameState, playerId)
  if (gameState.marketLockedUntilPlayerId) {
    error('MARKET_LOCKED', 'The market is blocked by a curse.')
  }
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
  gameState.marketPurchasedThisRound = true
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
  let shouldSkipPlayer: boolean
  do {
    gameState.turnNumber += 1
    gameState.currentPlayerId = nextPlayerId(gameState)
    if (gameState.currentPlayerId === gameState.players[0]?.id) {
      gameState.roundNumber = (gameState.roundNumber ?? 1) + 1
      gameState.roundPlayedCards = []
      if (!(gameState.marketPurchasedThisRound ?? false)) {
        refreshMarket(gameState, 'stale')
      }
      gameState.marketPurchasedThisRound = false
    }
    if (gameState.marketLockedUntilPlayerId === gameState.currentPlayerId) {
      delete gameState.marketLockedUntilPlayerId
    }
    const skippedPlayer = findPlayer(gameState, gameState.currentPlayerId)
    shouldSkipPlayer = skippedPlayer.skipNextTurn === true
    if (!shouldSkipPlayer) break
    skippedPlayer.skipNextTurn = false
  } while (shouldSkipPlayer)

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
  const currentVisibility = getFogVisibility(
    gameState.map,
    currentTile.id,
    fogMode,
  )
  const revealedIds = new Set([
    ...(viewer.revealedTileIds ?? []),
    ...currentVisibility.revealed,
  ])
  const scoutedIds = new Set([
    ...(viewer.scoutedTileIds ?? []),
    ...currentVisibility.scouted,
  ])
  const visibleTiles = gameState.map.tiles.flatMap((tile) => {
    if (gameState.status === 'CHOOSING_START' && tile.petalId === 0)
      return [tile]
    if (fogMode === 'NONE') return [tile]
    if (fogMode === 'PETAL') {
      return revealedIds.has(tile.id)
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
    if (revealedIds.has(tile.id)) return [tile]
    if (scoutedIds.has(tile.id)) {
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
        tokens: [],
        claimedCampIds: [],
        revealedTileIds: [],
        scoutedTileIds: [],
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
