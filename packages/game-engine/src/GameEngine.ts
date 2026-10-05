import type {
  CardPlayMode,
  CardInstance,
  CardDefinition,
  DragonState,
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
  MARKET_CARD_COPY_LIMIT,
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

const clearUndoableCardPlays = (
  gameState: GameState,
  playerId: string,
): void => {
  delete gameState.undoableCardPlays?.[playerId]
}

const addCardMovement = (
  player: PlayerState,
  card: CardDefinition,
  multiplier = 1,
): void => {
  player.availableMovement[card.movementType] += card.movementValue * multiplier
  if (card.secondaryMovementType && card.secondaryMovementValue) {
    player.availableMovement[card.secondaryMovementType] +=
      card.secondaryMovementValue * multiplier
  }
}

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
  settings: MapSettings,
): { revealed: Set<string>; scouted: Set<string> } => {
  const fogMode = settings.fogMode ?? 'NONE'
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

  const fullRange =
    fogMode === 'RANGE'
      ? settings.costVisibilityRange === 'ALL'
        ? Infinity
        : (settings.costVisibilityRange ?? 2)
      : fogMode === 'MEDIUM'
        ? 2
        : 1
  const terrainRange =
    fogMode === 'RANGE'
      ? settings.terrainVisibilityRange === 'ALL'
        ? Infinity
        : (settings.terrainVisibilityRange ?? 4)
      : fogMode === 'MEDIUM'
        ? 4
        : 2
  for (const tile of map.tiles) {
    const distance = axialDistance(currentTile, tile)
    if (distance <= terrainRange || distance <= fullRange) scouted.add(tile.id)
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
    gameState.settings,
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
  if (findPlayer(gameState, playerId).pendingCampReward) {
    error(
      'INVALID_ACTION',
      'Choose a rune from the rune circle before continuing.',
    )
  }
}

const spendColor = (
  pool: MovementPool,
  movementType: keyof MovementPool,
  amount: number,
): number => {
  const spent = Math.min(pool[movementType], amount)
  pool[movementType] -= spent
  return amount - spent
}

const spendAny = (pool: MovementPool, amount: number): number => {
  let remaining = amount
  for (const movementType of ['GREEN', 'BLUE', 'WILD', 'YELLOW'] as const) {
    remaining = spendColor(pool, movementType, remaining)
    if (remaining === 0) {
      return 0
    }
  }
  return remaining
}

const totalMovement = (player: PlayerState): number =>
  Object.values(player.availableMovement).reduce((sum, value) => sum + value, 0)

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

const isShortcutMove = (
  tiles: HexTile[],
  from: HexTile,
  to: HexTile,
): boolean =>
  axialDistance(from, to) === 2 &&
  getNeighbors(tiles, from).some(
    (neighbor) =>
      (neighbor.isBlocked || neighbor.terrain === 'MOUNTAIN') &&
      getNeighbors(tiles, neighbor).some((tile) => tile.id === to.id),
  )

const DRAGON_CONTROL_COST = 6
const DRAGON_RANDOM_MIN_STEPS = 1
const DRAGON_RANDOM_MAX_STEPS = 2

const isDragonRestrictedTile = (tile: HexTile): boolean =>
  tile.isBlocked ||
  tile.terrain === 'MOUNTAIN' ||
  tile.terrain === 'UNKNOWN' ||
  tile.terrain === 'START' ||
  tile.terrain === 'GOAL' ||
  tile.difficulty < 0

const startPetalIds = (map: GameMap): Set<number> =>
  new Set(
    (map.startHexIds ?? [map.startHexId])
      .map((id) => map.tiles.find((tile) => tile.id === id)?.petalId ?? 0)
      .filter((petalId) => Number.isFinite(petalId)),
  )

const dragonDistance = (
  tiles: HexTile[] | undefined,
  dragons: readonly DragonState[] | undefined,
  tile: HexTile,
): number => {
  if (!tiles || !dragons?.length) return Infinity
  let distance = Infinity
  for (const dragon of dragons) {
    const dragonTile = tiles.find((entry) => entry.id === dragon.position)
    if (!dragonTile) continue
    distance = Math.min(distance, axialDistance(dragonTile, tile))
  }
  return distance
}

const isDragonBlockedTile = (
  tiles: HexTile[] | undefined,
  dragons: readonly DragonState[] | undefined,
  tile: HexTile,
): boolean => dragonDistance(tiles, dragons, tile) <= 1

const dragonMovePenalty = (
  tiles: HexTile[] | undefined,
  dragons: readonly DragonState[] | undefined,
  tile: HexTile,
): MoveRequirement[] =>
  dragonDistance(tiles, dragons, tile) === 2 ? [{ type: 'ANY', amount: 2 }] : []

export const getEffectiveMoveRequirements = (
  player: PlayerState,
  from: HexTile,
  to: HexTile,
  tiles?: HexTile[],
  dragons?: readonly DragonState[],
): MoveRequirement[] => {
  if (isDragonBlockedTile(tiles, dragons, to)) return []
  let requirements: MoveRequirement[] = []
  if (axialDistance(from, to) === 1) {
    requirements = player.guidedMoveAvailable
      ? [{ type: 'ANY', amount: 1 }]
      : getMoveRequirements(from, to)
  } else if (
    player.shortcutMoveAvailable &&
    tiles &&
    isShortcutMove(tiles, from, to) &&
    !to.isBlocked &&
    to.terrain !== 'MOUNTAIN'
  ) {
    const type = getTerrainCost(to.terrain, to.difficulty)
    requirements =
      type === 'BLOCKED' ? [] : [{ type, amount: Math.max(1, to.difficulty) }]
  }
  if (requirements.length === 0) return []
  const penalties = [
    ...(player.extraMoveCostPending
      ? [{ type: 'ANY' as const, amount: 1 }]
      : []),
    ...dragonMovePenalty(tiles, dragons, to),
  ]
  return penalties.length > 0 ? [...requirements, ...penalties] : requirements
}

export const canAffordMove = (
  player: PlayerState,
  from: HexTile,
  to: HexTile,
  tiles?: HexTile[],
  dragons?: readonly DragonState[],
): boolean => {
  const requirements = getEffectiveMoveRequirements(
    player,
    from,
    to,
    tiles,
    dragons,
  )
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
  const totalAvailable = totalMovement(player)
  return (
    coloredDeficit <= player.availableMovement.WILD &&
    totalAvailable >= totalRequired
  )
}

export const getReachableMovePaths = (
  gameState: GameState,
  playerId: string,
): Map<string, string[]> => {
  const player = gameState.players.find((entry) => entry.id === playerId)
  const start = gameState.map.tiles.find((tile) => tile.id === player?.position)
  if (!player || !start) return new Map()

  const queue: Array<{ tile: HexTile; player: PlayerState; path: string[] }> = [
    { tile: start, player, path: [] },
  ]
  const visited = new Set<string>()
  const paths = new Map<string, string[]>()
  const movementKey = (state: PlayerState, tileId: string): string =>
    [
      tileId,
      state.availableMovement.GREEN,
      state.availableMovement.BLUE,
      state.availableMovement.YELLOW,
      state.availableMovement.WILD,
      state.shortcutMoveAvailable ? 1 : 0,
      state.guidedMoveAvailable ? 1 : 0,
      state.extraMoveCostPending ? 1 : 0,
    ].join(':')

  while (queue.length > 0) {
    const current = queue.shift()!
    const key = movementKey(current.player, current.tile.id)
    if (visited.has(key)) continue
    visited.add(key)

    const neighbors = getNeighbors(gameState.map.tiles, current.tile)
    if (current.player.shortcutMoveAvailable) {
      for (const candidate of gameState.map.tiles) {
        if (
          !neighbors.some((neighbor) => neighbor.id === candidate.id) &&
          isShortcutMove(gameState.map.tiles, current.tile, candidate)
        ) {
          neighbors.push(candidate)
        }
      }
    }

    for (const neighbor of neighbors) {
      if (
        gameState.settings.allowSharedTiles === false &&
        !current.player.sharedTileAccessAvailable &&
        gameState.players.some(
          (other) => other.id !== playerId && other.position === neighbor.id,
        )
      ) {
        continue
      }
      if (
        isDragonBlockedTile(gameState.map.tiles, gameState.dragons, neighbor)
      ) {
        continue
      }
      if (
        !canAffordMove(
          current.player,
          current.tile,
          neighbor,
          gameState.map.tiles,
          gameState.dragons,
        )
      ) {
        continue
      }

      const nextPlayer: PlayerState = {
        ...current.player,
        availableMovement: { ...current.player.availableMovement },
      }
      spendMove(
        nextPlayer,
        current.tile,
        neighbor,
        gameState.map.tiles,
        undefined,
        gameState.dragons,
      )
      if (
        nextPlayer.shortcutMoveAvailable &&
        axialDistance(current.tile, neighbor) > 1
      ) {
        nextPlayer.shortcutMoveAvailable = false
      }
      if (
        nextPlayer.guidedMoveAvailable &&
        axialDistance(current.tile, neighbor) === 1
      ) {
        nextPlayer.guidedMoveAvailable = false
      }
      const path = [...current.path, neighbor.id]
      if (neighbor.id !== start.id && !paths.has(neighbor.id)) {
        paths.set(neighbor.id, path)
      }
      if (neighbor.terrain !== 'GOAL') {
        queue.push({ tile: neighbor, player: nextPlayer, path })
      }
    }
  }
  return paths
}

const spendMove = (
  player: PlayerState,
  from: HexTile,
  to: HexTile,
  tiles: HexTile[],
  anyMovementSpent?: MovementPool,
  dragons?: readonly DragonState[],
): void => {
  const requirements = getEffectiveMoveRequirements(
    player,
    from,
    to,
    tiles,
    dragons,
  )
  if (requirements.length === 0) {
    error('HEX_BLOCKED', 'That connection is blocked.')
  }
  const remainingPool = { ...player.availableMovement }
  for (const requirement of requirements) {
    if (requirement.type === 'ANY') continue
    const remaining = spendColor(
      remainingPool,
      requirement.type,
      requirement.amount,
    )
    if (remaining > 0) spendColor(remainingPool, 'WILD', remaining)
  }
  const anyRequired = requirements
    .filter((requirement) => requirement.type === 'ANY')
    .reduce((sum, requirement) => sum + requirement.amount, 0)
  if (anyMovementSpent) {
    const types = ['GREEN', 'BLUE', 'YELLOW', 'WILD'] as const
    if (
      types.some(
        (type) =>
          !Number.isSafeInteger(anyMovementSpent[type]) ||
          anyMovementSpent[type] < 0 ||
          anyMovementSpent[type] > remainingPool[type],
      ) ||
      types.reduce((sum, type) => sum + anyMovementSpent[type], 0) !==
        anyRequired
    ) {
      error('INVALID_ACTION', 'Invalid movement payment.')
    }
    for (const type of types) remainingPool[type] -= anyMovementSpent[type]
  } else if (spendAny(remainingPool, anyRequired) > 0) {
    error('NOT_ENOUGH_MOVEMENT', 'Not enough movement points for this route.')
  }
  player.availableMovement = remainingPool
}

const nextPlayerId = (gameState: GameState): string => {
  const index = gameState.players.findIndex(
    (player) => player.id === gameState.currentPlayerId,
  )
  return gameState.players[(index + 1) % gameState.players.length]!.id
}

export const routeCostToGoal = (
  gameState: GameState,
  player: PlayerState,
): number => {
  if (!player.position) return Number.POSITIVE_INFINITY
  const distances = new Map<string, number>([[player.position, 0]])
  const pending = new Set([player.position])

  while (pending.size > 0) {
    const currentId = [...pending].reduce((closestId, candidateId) =>
      (distances.get(candidateId) ?? Infinity) <
      (distances.get(closestId) ?? Infinity)
        ? candidateId
        : closestId,
    )
    pending.delete(currentId)
    const currentCost = distances.get(currentId)!
    if (
      (gameState.map.goalHexIds ?? [gameState.map.goalHexId]).includes(
        currentId,
      )
    )
      return currentCost
    const currentTile = gameState.map.tiles.find(
      (tile) => tile.id === currentId,
    )
    if (!currentTile) continue

    for (const neighbor of getNeighbors(gameState.map.tiles, currentTile)) {
      const requirements = getMoveRequirements(currentTile, neighbor)
      if (requirements.length === 0) continue
      const edgeCost = requirements.reduce(
        (sum, requirement) => sum + requirement.amount,
        0,
      )
      const nextCost = currentCost + edgeCost
      if (nextCost < (distances.get(neighbor.id) ?? Infinity)) {
        distances.set(neighbor.id, nextCost)
        pending.add(neighbor.id)
      }
    }
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
      distance: routeCostToGoal(gameState, player),
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

const createDragons = (
  gameState: Pick<
    GameState,
    'settings' | 'seed' | 'roomCode' | 'map' | 'players'
  >,
): DragonState[] => {
  const count = Math.max(0, Math.min(3, gameState.settings.dragonCount ?? 0))
  if (count === 0) return []
  const forbiddenPetals = startPetalIds(gameState.map)
  const petalIds = [
    ...new Set(gameState.map.tiles.map((tile) => tile.petalId ?? 0)),
  ]
    .filter((petalId) => !forbiddenPetals.has(petalId))
    .sort((left, right) => left - right)
  const random = new SeededRandom(
    `${gameState.seed}:${gameState.roomCode}:dragons`,
  )
  const dragons: DragonState[] = []
  for (const petalId of random.shuffle(petalIds).slice(0, count)) {
    const occupied = new Set([
      ...gameState.players.map((player) => player.position).filter(Boolean),
      ...dragons.map((dragon) => dragon.position),
    ])
    const candidates = gameState.map.tiles.filter(
      (tile) =>
        (tile.petalId ?? 0) === petalId &&
        !occupied.has(tile.id) &&
        !isDragonRestrictedTile(tile),
    )
    const tile = random.pick(candidates)
    if (!tile) continue
    dragons.push({
      id: `dragon-${dragons.length + 1}`,
      position: tile.id,
      homePetalId: petalId,
    })
  }
  return dragons
}

const isValidDragonDestination = (
  gameState: GameState,
  dragon: DragonState,
  tile: HexTile,
): boolean => {
  const forbiddenPetals = startPetalIds(gameState.map)
  return (
    !forbiddenPetals.has(tile.petalId ?? 0) &&
    !isDragonRestrictedTile(tile) &&
    !gameState.players.some((player) => player.position === tile.id) &&
    !(gameState.dragons ?? []).some(
      (candidate) =>
        candidate.id !== dragon.id && candidate.position === tile.id,
    )
  )
}

const moveDragonsRandomly = (gameState: GameState): void => {
  if (!gameState.dragons?.length) return
  const random = new SeededRandom(
    `${gameState.seed}:${gameState.roomCode}:dragons:${gameState.roundNumber ?? 1}:${gameState.turnNumber}`,
  )
  for (const dragon of gameState.dragons) {
    const steps = random.int(DRAGON_RANDOM_MIN_STEPS, DRAGON_RANDOM_MAX_STEPS)
    for (let step = 0; step < steps; step += 1) {
      const currentTile = gameState.map.tiles.find(
        (tile) => tile.id === dragon.position,
      )
      if (!currentTile) break
      const candidates = getNeighbors(gameState.map.tiles, currentTile).filter(
        (tile) => isValidDragonDestination(gameState, dragon, tile),
      )
      const next = random.pick(candidates)
      if (!next) break
      dragon.position = next.id
    }
  }
}

export const createGameState = (
  roomCode: string,
  settings: MapSettings,
  players: PlayerSetup[],
  customMap?: GameMap,
): GameState => {
  const map = customMap ? structuredClone(customMap) : generateMap(settings)
  if (players.length > (map.startHexIds?.length ?? 1)) {
    error('INVALID_ACTION', 'There are more players than starting positions.')
  }
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
      purchasesThisTurn: 0,
      hasSacrificedCardThisTurn: false,
      sacrificeCooldownTurns: 0,
      extraPurchaseAvailable: false,
      shortcutMoveAvailable: false,
      guidedMoveAvailable: false,
      sharedTileAccessAvailable: false,
      sharedTileAccessTurns: 0,
      echoPowerAvailable: false,
      curseShieldAvailable: false,
      extraMoveCostPending: false,
      fogCostsHidden: false,
      shortcutBlocked: false,
      marketBlocked: false,
      nextPurchaseCostIncrease: 0,
      pendingDiscardCount: 0,
      tokens: [],
      claimedCampIds: [],
      revealedTileIds: [],
      scoutedTileIds: [],
      isReady: true,
      connected: true,
    }
    drawCards(state, 5, `${settings.seed}:${player.id}:opening:${index}`)
    return state
  })

  const gameState: GameState = {
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
    market: [],
    marketOfferExpiresAtTurns: [],
    marketDrawPile: [],
    marketCycle: 0,
    cardPurchaseCounts: {},
    marketPurchasedThisRound: false,
    dragons: [],
    roundPlayedCards: [],
    temporaryBlockedHexes: [],
  }
  gameState.market = createMarketOffers(gameState, 4, 'initial')
  gameState.dragons = createDragons(gameState)
  return gameState
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

const cardCopiesInPlayerPiles = (
  gameState: GameState,
): Record<string, number> =>
  Object.fromEntries(
    MARKET_CARD_IDS.map((cardId) => [
      cardId,
      gameState.players.reduce(
        (total, player) =>
          total +
          [
            ...player.drawPile,
            ...player.hand,
            ...player.discardPile,
            ...player.playedCards,
            ...player.removedCards,
          ].filter((card) => card.cardId === cardId).length,
        0,
      ),
    ]),
  )

const getPurchaseCounts = (gameState: GameState): Record<string, number> => {
  gameState.cardPurchaseCounts ??= cardCopiesInPlayerPiles(gameState)
  return gameState.cardPurchaseCounts
}

const MARKET_SPECIAL_CHANCE = 0.3
const MIN_AFFORDABLE_MARKET_OFFERS = 2
const AFFORDABLE_MARKET_COST = 6
const MARKET_COST_BUCKETS = [
  { min: 1, max: 2, weight: 40 },
  { min: 3, max: 4, weight: 30 },
  { min: 5, max: 6, weight: 18 },
  { min: 7, max: 8, weight: 9 },
  { min: 9, max: 9, weight: 3 },
]

const isMarketSpecial = (cardId: string): boolean => {
  const card = CARD_BY_ID[cardId]
  return card?.actionCategory === 'SPELL' || card?.actionCategory === 'CURSE'
}

const weightedMarketPick = (
  random: SeededRandom,
  cardIds: string[],
): string | undefined => {
  const availableBuckets = MARKET_COST_BUCKETS.map((bucket) => ({
    ...bucket,
    cards: cardIds.filter((cardId) => {
      const cost = CARD_BY_ID[cardId]!.purchaseCost
      return cost >= bucket.min && cost <= bucket.max
    }),
  })).filter((bucket) => bucket.cards.length > 0)

  if (availableBuckets.length === 0) return undefined

  let roll =
    random.next() *
    availableBuckets.reduce((total, bucket) => total + bucket.weight, 0)
  for (const bucket of availableBuckets) {
    roll -= bucket.weight
    if (roll <= 0) return random.pick(bucket.cards)
  }
  return random.pick(availableBuckets.at(-1)!.cards)
}

const getMarketOfferLifetime = (gameState: GameState): number =>
  Math.max(4, Math.ceil(gameState.players.length * 1.2))

const getNewMarketOfferExpiryTurn = (gameState: GameState): number =>
  gameState.turnNumber + getMarketOfferLifetime(gameState)

const normalizeMarketOfferExpiryTurns = (gameState: GameState): number[] => {
  const fallbackExpiryTurn = getNewMarketOfferExpiryTurn(gameState)
  const expiryTurns = gameState.market.map((_, index) => {
    const expiresAt = gameState.marketOfferExpiresAtTurns?.[index]
    return typeof expiresAt === 'number' && Number.isFinite(expiresAt)
      ? expiresAt
      : fallbackExpiryTurn
  })
  gameState.marketOfferExpiresAtTurns = expiryTurns
  return expiryTurns
}

const createMarketOffers = (
  gameState: GameState,
  amount: number,
  reason: string,
): string[] => {
  const purchaseCounts = getPurchaseCounts(gameState)
  const random = new SeededRandom(
    `${gameState.seed}:${gameState.roomCode}:market:${gameState.marketCycle}:${reason}`,
  )
  const previousExpiryTurns = normalizeMarketOfferExpiryTurns(gameState)
  const retainedCounts = new Map<string, number>()
  const offers: string[] = []
  const offerExpiryTurns: number[] = []
  for (const [index, cardId] of gameState.market.entries()) {
    const retainedCount = (retainedCounts.get(cardId) ?? 0) + 1
    retainedCounts.set(cardId, retainedCount)
    if (
      (isMarketSpecial(cardId) &&
        offers.some((offer) => isMarketSpecial(offer))) ||
      (purchaseCounts[cardId] ?? 0) + retainedCount > MARKET_CARD_COPY_LIMIT
    ) {
      continue
    }
    offers.push(cardId)
    offerExpiryTurns.push(
      previousExpiryTurns[index] ?? getNewMarketOfferExpiryTurn(gameState),
    )
  }
  const marketCounts = new Map<string, number>()
  for (const cardId of offers) {
    marketCounts.set(cardId, (marketCounts.get(cardId) ?? 0) + 1)
  }
  const availableCards = (
    allowSpecial: boolean,
    maxCost = Infinity,
  ): string[] =>
    MARKET_CARD_IDS.flatMap((cardId) => {
      const remaining =
        MARKET_CARD_COPY_LIMIT -
        (purchaseCounts[cardId] ?? 0) -
        (marketCounts.get(cardId) ?? 0)
      return remaining > 0 &&
        CARD_BY_ID[cardId]!.purchaseCost <= maxCost &&
        (allowSpecial || !isMarketSpecial(cardId))
        ? Array.from({ length: Math.max(0, remaining) }, () => cardId)
        : []
    })

  const addOffer = (cardId: string): void => {
    offers.push(cardId)
    offerExpiryTurns.push(getNewMarketOfferExpiryTurn(gameState))
    marketCounts.set(cardId, (marketCounts.get(cardId) ?? 0) + 1)
  }
  const removeOfferAt = (index: number): void => {
    const [removed] = offers.splice(index, 1)
    offerExpiryTurns.splice(index, 1)
    if (!removed) return
    const nextCount = (marketCounts.get(removed) ?? 1) - 1
    if (nextCount > 0) marketCounts.set(removed, nextCount)
    else marketCounts.delete(removed)
  }

  if (
    offers.length < amount &&
    !offers.some((cardId) => isMarketSpecial(cardId)) &&
    random.next() < MARKET_SPECIAL_CHANCE
  ) {
    const specialOffer = weightedMarketPick(
      random,
      availableCards(true).filter(isMarketSpecial),
    )
    if (specialOffer) addOffer(specialOffer)
  }

  while (offers.length < amount) {
    const nextOffer = weightedMarketPick(random, availableCards(false))
    if (!nextOffer) break
    addOffer(nextOffer)
  }

  while (
    offers.filter(
      (cardId) => CARD_BY_ID[cardId]!.purchaseCost <= AFFORDABLE_MARKET_COST,
    ).length < MIN_AFFORDABLE_MARKET_OFFERS
  ) {
    const affordableOffer = weightedMarketPick(
      random,
      availableCards(false, AFFORDABLE_MARKET_COST),
    )
    if (!affordableOffer) break

    let replacementIndex = -1
    for (let index = 0; index < offers.length; index += 1) {
      const current = offers[index]!
      if (CARD_BY_ID[current]!.purchaseCost <= AFFORDABLE_MARKET_COST) continue
      if (
        replacementIndex < 0 ||
        CARD_BY_ID[current]!.purchaseCost >
          CARD_BY_ID[offers[replacementIndex]!]!.purchaseCost
      ) {
        replacementIndex = index
      }
    }
    if (replacementIndex < 0) break
    removeOfferAt(replacementIndex)
    addOffer(affordableOffer)
  }

  gameState.marketDrawPile = []
  gameState.marketOfferExpiresAtTurns = offerExpiryTurns
  return offers
}

const refreshExpiredMarketOffers = (gameState: GameState): void => {
  const expiryTurns = normalizeMarketOfferExpiryTurns(gameState)
  if (!expiryTurns.some((expiresAt) => expiresAt <= gameState.turnNumber)) {
    return
  }

  const retainedMarket: string[] = []
  const retainedExpiryTurns: number[] = []
  for (const [index, cardId] of gameState.market.entries()) {
    const expiresAt =
      expiryTurns[index] ?? getNewMarketOfferExpiryTurn(gameState)
    if (expiresAt <= gameState.turnNumber) continue
    retainedMarket.push(cardId)
    retainedExpiryTurns.push(expiresAt)
  }

  gameState.marketCycle += 1
  gameState.market = retainedMarket
  gameState.marketOfferExpiresAtTurns = retainedExpiryTurns
  gameState.market = createMarketOffers(
    gameState,
    4,
    `expired:${gameState.turnNumber}`,
  )
}

const replenishMarket = (gameState: GameState): void => {
  gameState.marketCycle += 1
  gameState.market = createMarketOffers(gameState, 4, 'purchase')
}

const refreshMarket = (gameState: GameState, reason: string): void => {
  gameState.marketCycle += 1
  gameState.market = []
  gameState.marketOfferExpiresAtTurns = []
  gameState.market = createMarketOffers(gameState, 4, reason)
}

export const playCard = (
  gameState: GameState,
  playerId: string,
  cardInstanceId: string,
  mode: CardPlayMode = 'MOVEMENT',
  sacrifice = false,
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
  if (cardDefinition.type === 'ACTION' && (mode !== 'GOLD' || sacrifice)) {
    error('INVALID_ACTION', 'Action cards can only be exchanged for gold.')
  }
  if (
    sacrifice &&
    (player.hasSacrificedCardThisTurn ||
      (player.sacrificeCooldownTurns ?? 0) > 0)
  ) {
    error(
      'INVALID_ACTION',
      'A card cannot be sacrificed while the five-turn cooldown is active.',
    )
  }
  gameState.undoableCardPlays ??= {}
  gameState.undoableCardPlays[playerId] ??= []
  const echoed =
    cardDefinition.type === 'MOVEMENT' && player.echoPowerAvailable === true
  gameState.undoableCardPlays[playerId].push({
    cardInstanceId,
    handIndex: cardIndex,
    mode,
    sacrificed: sacrifice,
    ...(echoed ? { echoed: true } : {}),
    previousSacrificeCooldown: player.sacrificeCooldownTurns ?? 0,
    previousHasSacrificedCard: player.hasSacrificedCardThisTurn ?? false,
    previousEchoPowerAvailable: player.echoPowerAvailable ?? false,
  })
  player.hand.splice(cardIndex, 1)
  if (sacrifice) {
    player.removedCards.push(card!)
    player.hasSacrificedCardThisTurn = true
    player.sacrificeCooldownTurns = 5
  } else {
    player.playedCards.push(card!)
  }
  gameState.roundPlayedCards ??= []
  gameState.roundPlayedCards.push({
    instanceId: card!.instanceId,
    playerId,
    cardId: cardDefinition.id,
    mode,
    ...(sacrifice ? { sacrificed: true } : {}),
    ...(echoed ? { echoed: true } : {}),
  })
  const multiplier = (sacrifice ? 2 : 1) * (echoed ? 2 : 1)
  if (mode === 'GOLD') {
    player.availableGold += cardDefinition.goldValue * multiplier
  } else {
    addCardMovement(player, cardDefinition, multiplier)
  }
  if (echoed) player.echoPowerAvailable = false
  return gameState
}

export const undoCardPlay = (
  gameState: GameState,
  playerId: string,
): GameState => {
  ensureTurn(gameState, playerId)
  const player = findPlayer(gameState, playerId)
  const undoStack = gameState.undoableCardPlays?.[playerId]
  if (!undoStack?.length) {
    return error('INVALID_ACTION', 'There is no card play to undo.')
  }
  const undo = undoStack[undoStack.length - 1]!
  const pile = undo.sacrificed ? player.removedCards : player.playedCards
  const cardIndex = pile.findIndex(
    (card) => card.instanceId === undo.cardInstanceId,
  )
  const card = pile[cardIndex]
  const definition = card ? CARD_BY_ID[card.cardId] : undefined
  if (!card || !definition) {
    return error('INVALID_ACTION', 'The played card can no longer be undone.')
  }
  const multiplier = (undo.sacrificed ? 2 : 1) * (undo.echoed ? 2 : 1)
  if (undo.mode === 'GOLD') {
    const amount = definition.goldValue * multiplier
    if (player.availableGold < amount) {
      error('INVALID_ACTION', 'The card gold has already been spent.')
    }
    player.availableGold -= amount
  } else {
    const movement = createMovementPool()
    movement[definition.movementType] += definition.movementValue * multiplier
    if (definition.secondaryMovementType && definition.secondaryMovementValue) {
      movement[definition.secondaryMovementType] +=
        definition.secondaryMovementValue * multiplier
    }
    for (const type of ['GREEN', 'BLUE', 'YELLOW', 'WILD'] as const) {
      if (player.availableMovement[type] < movement[type]) {
        error('INVALID_ACTION', 'The card movement has already been spent.')
      }
    }
    for (const type of ['GREEN', 'BLUE', 'YELLOW', 'WILD'] as const) {
      player.availableMovement[type] -= movement[type]
    }
  }
  pile.splice(cardIndex, 1)
  player.hand.splice(Math.min(undo.handIndex, player.hand.length), 0, card)
  if (undo.sacrificed) {
    player.sacrificeCooldownTurns = undo.previousSacrificeCooldown
    player.hasSacrificedCardThisTurn = undo.previousHasSacrificedCard
  }
  player.echoPowerAvailable = undo.previousEchoPowerAvailable ?? false
  const historyIndex = gameState.roundPlayedCards.findIndex(
    (play) =>
      play.playerId === playerId && play.instanceId === undo.cardInstanceId,
  )
  if (historyIndex >= 0) gameState.roundPlayedCards.splice(historyIndex, 1)
  undoStack.pop()
  if (undoStack.length === 0) clearUndoableCardPlays(gameState, playerId)
  return gameState
}

export const useActionCard = (
  gameState: GameState,
  playerId: string,
  cardInstanceId: string,
  targetPlayerId?: string,
  targetHexId?: string,
): GameState => {
  ensureTurn(gameState, playerId)
  const player = findPlayer(gameState, playerId)
  if ((player.pendingDiscardCount ?? 0) > 0) {
    error('INVALID_ACTION', 'Discard a card before taking another action.')
  }
  const cardIndex = player.hand.findIndex(
    (card) => card.instanceId === cardInstanceId,
  )
  const card = player.hand[cardIndex]
  const definition = card ? CARD_BY_ID[card.cardId] : undefined
  if (!card || definition?.type !== 'ACTION' || !definition.actionEffect) {
    error('INVALID_ACTION', 'That card is not a usable action card.')
  }
  const actionCard = card!
  const actionDefinition = definition!
  const isHexSeal = actionDefinition.actionEffect === 'HEX_SEAL'
  const isFateSwap = actionDefinition.actionEffect === 'RESHUFFLE_HAND'
  let sealedTile: HexTile | undefined
  let fateSwapTile: HexTile | undefined
  if (isHexSeal) {
    if (!targetHexId) error('INVALID_ACTION', 'Choose a hex to block.')
    sealedTile = findTile(gameState.map, targetHexId!)
    const casterTile = findTile(gameState.map, player.position)
    const distance = axialDistance(casterTile, sealedTile)
    if (
      distance < 1 ||
      distance > 2 ||
      sealedTile.isBlocked ||
      ['START', 'GOAL', 'MOUNTAIN', 'UNKNOWN'].includes(sealedTile.terrain) ||
      gameState.players.some((other) => other.position === sealedTile!.id)
    ) {
      error('INVALID_ACTION', 'Choose an empty, passable hex within two hexes.')
    }
  }
  if (
    actionDefinition.actionEffect === 'MAP_SHORTCUT' &&
    player.shortcutBlocked
  ) {
    error('INVALID_ACTION', 'A curse blocks shortcuts during this turn.')
  }
  const curseTarget =
    actionDefinition.actionCategory === 'CURSE' && !isHexSeal
      ? !targetPlayerId || targetPlayerId === playerId
        ? error('INVALID_ACTION', 'Choose an opponent for this curse.')
        : findPlayer(gameState, targetPlayerId)
      : undefined
  const curseBlocked = curseTarget?.curseShieldAvailable === true
  if (curseBlocked) {
    curseTarget.curseShieldAvailable = false
  }
  if (isFateSwap && !curseBlocked) {
    if (!targetHexId) error('INVALID_ACTION', 'Choose a neighboring hex.')
    fateSwapTile = findTile(gameState.map, targetHexId!)
    const targetTile = findTile(gameState.map, curseTarget!.position)
    if (
      axialDistance(targetTile, fateSwapTile) !== 1 ||
      fateSwapTile.isBlocked ||
      ['MOUNTAIN', 'UNKNOWN'].includes(fateSwapTile.terrain) ||
      gameState.players.some((other) => other.position === fateSwapTile!.id)
    ) {
      error('INVALID_ACTION', 'Choose an empty, passable neighboring hex.')
    }
  }
  let actionCardRemoved = false

  if (!curseBlocked)
    switch (actionDefinition.actionEffect) {
      case 'MAP_SHORTCUT':
        player.shortcutMoveAvailable = true
        break
      case 'SECOND_WIND':
        if (player.hand.length <= 1) {
          error('INVALID_ACTION', 'Choose another card to remove permanently.')
        }
        player.hand.splice(cardIndex, 1)
        player.removedCards.push(actionCard)
        player.removedCards.push(player.hand.shift()!)
        drawCards(
          player,
          4,
          `${gameState.seed}:${player.id}:action:${actionCard.instanceId}`,
        )
        actionCardRemoved = true
        break
      case 'STEAL_PLANS': {
        const target = curseTarget!
        if (target.hand.length === 0) {
          error('INVALID_ACTION', 'The chosen opponent has no cards in hand.')
        }
        const stolen = new SeededRandom(
          `${gameState.seed}:${playerId}:action:${actionCard.instanceId}:${targetPlayerId}`,
        ).pick(target.hand)
        target.hand.splice(
          target.hand.findIndex(
            (candidate) => candidate.instanceId === stolen.instanceId,
          ),
          1,
        )
        target.discardPile.push(stolen)
        break
      }
      case 'GUIDE':
        player.guidedMoveAvailable = true
        break
      case 'PHASE_WALK':
        player.sharedTileAccessAvailable = true
        player.sharedTileAccessTurns = 2
        break
      case 'RESHUFFLE_HAND': {
        curseTarget!.position = fateSwapTile!.id
        break
      }
      case 'ECHO_POWER': {
        player.echoPowerAvailable = true
        break
      }
      case 'PROTECTIVE_CIRCLE':
        player.curseShieldAvailable = true
        break
      case 'PATH_FRACTURE':
        curseTarget!.extraMoveCostPending = true
        break
      case 'FOG_OF_FORGETTING':
        curseTarget!.fogCostsHidden = true
        break
      case 'POVERTY_CURSE':
        curseTarget!.nextPurchaseCostIncrease = 2
        break
      case 'TANGLED_ROOTS':
        curseTarget!.shortcutBlocked = true
        curseTarget!.shortcutMoveAvailable = false
        break
      case 'CLOSED_MARKET':
        curseTarget!.marketBlocked = true
        break
      case 'HEX_SEAL':
        sealedTile!.isBlocked = true
        gameState.temporaryBlockedHexes ??= []
        gameState.temporaryBlockedHexes.push({
          hexId: sealedTile!.id,
          casterPlayerId: playerId,
        })
        break
    }

  if (!actionCardRemoved) {
    player.hand.splice(cardIndex, 1)
    player.removedCards.push(actionCard)
  }
  gameState.roundPlayedCards.push({
    instanceId: actionCard.instanceId,
    playerId,
    cardId: actionDefinition.id,
    mode: 'ACTION',
  })
  if (actionDefinition.actionCategory === 'CURSE') {
    gameState.latestCurse = {
      instanceId: actionCard.instanceId,
      playerId,
      source: 'CARD',
      cardId: actionDefinition.id,
      ...(targetPlayerId ? { targetPlayerId } : {}),
      ...(targetHexId ? { targetHexId } : {}),
      blocked: curseBlocked,
    }
  }
  return gameState
}

export const discardCard = (
  gameState: GameState,
  playerId: string,
  cardInstanceId: string,
): GameState => {
  ensureTurn(gameState, playerId)
  const player = findPlayer(gameState, playerId)
  if ((player.pendingDiscardCount ?? 0) < 1) {
    error('INVALID_ACTION', 'There is no pending card discard.')
  }
  const cardIndex = player.hand.findIndex(
    (card) => card.instanceId === cardInstanceId,
  )
  const card = player.hand[cardIndex]
  if (!card) error('CARD_NOT_IN_HAND', 'That card is not in the player hand.')
  player.hand.splice(cardIndex, 1)
  player.discardPile.push(card!)
  player.pendingDiscardCount = Math.max(
    0,
    (player.pendingDiscardCount ?? 1) - 1,
  )
  return gameState
}

export const movePlayer = (
  gameState: GameState,
  playerId: string,
  targetHexId: string,
  anyMovementSpent?: MovementPool,
): GameState => {
  ensureTurn(gameState, playerId)
  const player = findPlayer(gameState, playerId)
  const currentTile = findTile(gameState.map, player.position)
  const targetTile = findTile(gameState.map, targetHexId)
  const adjacent = axialDistance(currentTile, targetTile) === 1
  const shortcut =
    player.shortcutMoveAvailable &&
    isShortcutMove(gameState.map.tiles, currentTile, targetTile)
  if (!adjacent && !shortcut) {
    error('INVALID_MOVE', 'That field is not reachable in one move.')
  }
  if (targetTile.isBlocked || targetTile.terrain === 'MOUNTAIN') {
    error('HEX_BLOCKED', 'That hex is blocked.')
  }
  if (isDragonBlockedTile(gameState.map.tiles, gameState.dragons, targetTile)) {
    error('HEX_BLOCKED', 'A dragon blocks that hex.')
  }
  if (
    gameState.settings.allowSharedTiles === false &&
    !player.sharedTileAccessAvailable &&
    gameState.players.some(
      (other) => other.id !== playerId && other.position === targetHexId,
    )
  ) {
    error('HEX_OCCUPIED', 'That hex is occupied by another player.')
  }
  if (
    !canAffordMove(
      player,
      currentTile,
      targetTile,
      gameState.map.tiles,
      gameState.dragons,
    )
  ) {
    error('NOT_ENOUGH_MOVEMENT', 'Not enough movement for the selected hex.')
  }
  spendMove(
    player,
    currentTile,
    targetTile,
    gameState.map.tiles,
    anyMovementSpent,
    gameState.dragons,
  )
  if (shortcut) player.shortcutMoveAvailable = false
  if (adjacent && player.guidedMoveAvailable) {
    player.guidedMoveAvailable = false
  }
  player.position = targetHexId
  rememberVisibleTiles(gameState, player)

  if (targetTile.terrain === 'CAMP') {
    player.claimedCampIds ??= []
    player.tokens ??= []
    if (!player.claimedCampIds.includes(targetTile.id)) {
      const random = new SeededRandom(
        `${gameState.seed}:${playerId}:camp:${targetTile.id}`,
      )
      const options = random
        .shuffle([...TOKEN_DEFINITIONS])
        .slice(0, 3)
        .map((definition) => definition.type) as [
        TokenInstance['type'],
        TokenInstance['type'],
        TokenInstance['type'],
      ]
      player.claimedCampIds.push(targetTile.id)
      player.pendingCampReward = {
        campId: targetTile.id,
        options,
        storyIndex: random.int(0, 2),
      }
    }
  }

  if (targetTile.terrain === 'GOAL') {
    gameState.status = 'FINISHED'
    gameState.winnerId = playerId
  }

  clearUndoableCardPlays(gameState, playerId)

  return gameState
}

export const moveDragon = (
  gameState: GameState,
  playerId: string,
  dragonId: string,
  targetHexId: string,
): GameState => {
  ensureTurn(gameState, playerId)
  const player = findPlayer(gameState, playerId)
  const dragon = gameState.dragons?.find((entry) => entry.id === dragonId)
  if (!dragon) error('INVALID_ACTION', 'Dragon was not found.')
  const currentTile = findTile(gameState.map, dragon!.position)
  const targetTile = findTile(gameState.map, targetHexId)
  if (axialDistance(currentTile, targetTile) !== 1) {
    error('INVALID_MOVE', 'Dragon can move only to an adjacent hex.')
  }
  if (!isValidDragonDestination(gameState, dragon!, targetTile)) {
    error('INVALID_MOVE', 'Dragon cannot move to that hex.')
  }
  if (totalMovement(player) < DRAGON_CONTROL_COST) {
    error('NOT_ENOUGH_MOVEMENT', 'Not enough movement to control the dragon.')
  }
  const pool = { ...player.availableMovement }
  if (spendAny(pool, DRAGON_CONTROL_COST) > 0) {
    error('NOT_ENOUGH_MOVEMENT', 'Not enough movement to control the dragon.')
  }
  player.availableMovement = pool
  dragon!.position = targetTile.id
  clearUndoableCardPlays(gameState, playerId)
  return gameState
}

export const chooseCampReward = (
  gameState: GameState,
  playerId: string,
  tokenType: TokenInstance['type'],
): GameState => {
  if (gameState.currentPlayerId !== playerId || gameState.status !== 'ACTIVE') {
    error('NOT_YOUR_TURN', 'It is not your turn.')
  }
  const player = findPlayer(gameState, playerId)
  const reward = player.pendingCampReward
  if (!reward) {
    return error('INVALID_ACTION', 'There is no rune circle reward to choose.')
  }
  if (!reward.options.includes(tokenType)) {
    error('INVALID_ACTION', 'That rune is not offered by this rune circle.')
  }
  player.tokens ??= []
  player.tokens.push({
    instanceId: `${playerId}-camp-${reward.campId}`,
    type: tokenType,
  })
  delete player.pendingCampReward
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

  let curseTargetPlayerId = targetPlayerId
  switch (definition.effect.kind) {
    case 'MOVEMENT':
      player.availableMovement[definition.effect.movementType] +=
        definition.effect.value
      break
    case 'GOLD':
      player.availableGold += definition.effect.value
      break
    case 'SWAP_HAND': {
      player.discardPile.push(...player.hand)
      player.hand = []
      drawCards(
        player,
        5,
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
    case 'CURSE_SHIELD':
      player.curseShieldAvailable = true
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
      curseTargetPlayerId = closestOpponentToGoal(gameState, playerId).id
      findPlayer(gameState, curseTargetPlayerId).skipNextTurn = true
      break
    case 'CURSE_MARKET':
      gameState.marketLockedUntilPlayerId = playerId
      break
  }

  player.tokens.splice(tokenIndex, 1)
  player.tokenUsedInRound = roundNumber
  if (token.type.startsWith('CURSE_')) {
    gameState.latestCurse = {
      instanceId: token.instanceId,
      playerId,
      source: 'TOKEN',
      tokenType: token.type,
      ...(curseTargetPlayerId ? { targetPlayerId: curseTargetPlayerId } : {}),
    }
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
  if (gameState.marketLockedUntilPlayerId || player.marketBlocked) {
    error('MARKET_LOCKED', 'The market is blocked by a curse.')
  }
  const purchaseLimit = player.extraPurchaseAvailable ? 2 : 1
  if (
    (player.purchasesThisTurn ?? (player.hasBoughtThisTurn ? 1 : 0)) >=
    purchaseLimit
  ) {
    error('PURCHASE_LIMIT', 'You can buy only one card per turn.')
  }
  const definition = CARD_BY_ID[cardId]
  if (!definition || !gameState.market.includes(cardId)) {
    error('INVALID_ACTION', 'That card is not available in the market.')
  }
  const cardDefinition = definition!
  const purchaseCounts = getPurchaseCounts(gameState)
  if ((purchaseCounts[cardId] ?? 0) >= MARKET_CARD_COPY_LIMIT) {
    error('INVALID_ACTION', 'No copies of that card remain in the market.')
  }
  const purchaseCost =
    cardDefinition.purchaseCost + (player.nextPurchaseCostIncrease ?? 0)
  if (player.availableGold < purchaseCost) {
    error('NOT_ENOUGH_GOLD', 'Not enough gold to buy that card.')
  }
  player.availableGold -= purchaseCost
  player.nextPurchaseCostIncrease = 0
  purchaseCounts[cardId] = (purchaseCounts[cardId] ?? 0) + 1
  const nextCard = createCardInstance(
    cardId,
    `${playerId}-buy-${gameState.turnNumber}-${player.purchasesThisTurn ?? (player.hasBoughtThisTurn ? 1 : 0)}`,
  )
  player.hand.push(nextCard)
  player.purchasesThisTurn =
    (player.purchasesThisTurn ?? (player.hasBoughtThisTurn ? 1 : 0)) + 1
  player.hasBoughtThisTurn = true
  if (player.purchasesThisTurn >= 2) {
    player.extraPurchaseAvailable = false
  }
  gameState.marketPurchasedThisRound = true
  const marketCardIndex = gameState.market.indexOf(cardId)
  gameState.market.splice(marketCardIndex, 1)
  gameState.marketOfferExpiresAtTurns?.splice(marketCardIndex, 1)
  replenishMarket(gameState)
  clearUndoableCardPlays(gameState, playerId)
  return gameState
}

export const endTurn = (gameState: GameState, playerId: string): GameState => {
  ensureTurn(gameState, playerId)
  const player = findPlayer(gameState, playerId)
  if ((player.pendingDiscardCount ?? 0) > 0) {
    error('INVALID_ACTION', 'Discard a card before ending the turn.')
  }
  player.lastTurnPlayedCards = gameState.roundPlayedCards.filter(
    (play) => play.playerId === playerId,
  )
  player.discardPile.push(...player.playedCards)
  player.playedCards = []
  if (player.hand.length < 5) {
    drawCards(
      player,
      5 - player.hand.length,
      `${gameState.seed}:${player.id}:turn:${gameState.turnNumber}`,
    )
  }
  player.availableMovement = createMovementPool()
  player.availableGold = 0
  clearUndoableCardPlays(gameState, playerId)
  player.hasBoughtThisTurn = false
  player.purchasesThisTurn = 0
  if (
    !player.hasSacrificedCardThisTurn &&
    (player.sacrificeCooldownTurns ?? 0) > 0
  ) {
    player.sacrificeCooldownTurns = (player.sacrificeCooldownTurns ?? 0) - 1
  }
  player.hasSacrificedCardThisTurn = false
  player.extraPurchaseAvailable = false
  player.shortcutMoveAvailable = false
  player.guidedMoveAvailable = false
  if ((player.sharedTileAccessTurns ?? 0) > 1) {
    player.sharedTileAccessTurns = (player.sharedTileAccessTurns ?? 0) - 1
    player.sharedTileAccessAvailable = true
  } else {
    player.sharedTileAccessTurns = 0
    player.sharedTileAccessAvailable = false
  }
  player.echoPowerAvailable = false
  player.fogCostsHidden = false
  player.shortcutBlocked = false
  player.marketBlocked = false
  let shouldSkipPlayer: boolean
  do {
    gameState.turnNumber += 1
    gameState.currentPlayerId = nextPlayerId(gameState)
    refreshExpiredMarketOffers(gameState)
    const expiredBlocks = (gameState.temporaryBlockedHexes ?? []).filter(
      (block) => block.casterPlayerId === gameState.currentPlayerId,
    )
    for (const block of expiredBlocks) {
      const tile = gameState.map.tiles.find((entry) => entry.id === block.hexId)
      if (tile) tile.isBlocked = false
    }
    gameState.temporaryBlockedHexes = (
      gameState.temporaryBlockedHexes ?? []
    ).filter((block) => block.casterPlayerId !== gameState.currentPlayerId)
    if (gameState.currentPlayerId === gameState.players[0]?.id) {
      moveDragonsRandomly(gameState)
      gameState.roundNumber = (gameState.roundNumber ?? 1) + 1
      gameState.roundPlayedCards = []
      for (const roundPlayer of gameState.players) {
        roundPlayer.extraMoveCostPending = false
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
  for (const block of gameState.temporaryBlockedHexes ?? []) {
    if (block.casterPlayerId !== playerId) continue
    const tile = gameState.map.tiles.find((entry) => entry.id === block.hexId)
    if (tile) tile.isBlocked = false
  }
  gameState.temporaryBlockedHexes = (
    gameState.temporaryBlockedHexes ?? []
  ).filter((block) => block.casterPlayerId !== playerId)
  if (gameState.currentPlayerId === playerId && gameState.players.length > 1) {
    endTurn(gameState, playerId)
  }
  gameState.players = gameState.players.filter(
    (player) => player !== leavingPlayer,
  )
  clearUndoableCardPlays(gameState, playerId)
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
  const { undoableCardPlays, ...publicGameState } = gameState
  void undoableCardPlays
  const viewer = findPlayer(gameState, viewerPlayerId)
  const currentTile = findTile(
    gameState.map,
    viewer.position || gameState.map.startHexId,
  )
  const fogMode = gameState.settings.fogMode ?? 'NONE'
  const visibilityOrigins =
    gameState.status === 'CHOOSING_START'
      ? (gameState.map.startHexIds ?? [gameState.map.startHexId])
      : [currentTile.id]
  const currentVisibility = {
    revealed: new Set<string>(),
    scouted: new Set<string>(),
  }
  for (const origin of visibilityOrigins) {
    const visibleFromOrigin = getFogVisibility(
      gameState.map,
      origin,
      gameState.settings,
    )
    for (const id of visibleFromOrigin.revealed)
      currentVisibility.revealed.add(id)
    for (const id of visibleFromOrigin.scouted)
      currentVisibility.scouted.add(id)
  }
  const revealedIds = new Set([
    ...(viewer.revealedTileIds ?? []),
    ...currentVisibility.revealed,
  ])
  const scoutedIds = new Set([
    ...(viewer.scoutedTileIds ?? []),
    ...currentVisibility.scouted,
  ])
  const visibleTiles = gameState.map.tiles.flatMap((tile) => {
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
    if (fogMode === 'RANGE') {
      if (currentVisibility.revealed.has(tile.id)) return [tile]
      if (currentVisibility.scouted.has(tile.id)) {
        return [{ ...hideSpecialType(tile), difficulty: -1 }]
      }
      return [
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
    ...publicGameState,
    temporaryBlockedHexes: (gameState.temporaryBlockedHexes ?? []).filter(
      (block) => visibleIds.has(block.hexId),
    ),
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
            ...(gameState.map.goalHexIds
              ? {
                  goalHexIds: gameState.map.goalHexIds.filter((id) =>
                    visibleIds.has(id),
                  ),
                }
              : {}),
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
      const remainingRouteCost = routeCostToGoal(gameState, player)
      const position = fullyVisibleIds.has(player.position)
        ? player.position
        : ''
      if (player.id === viewerPlayerId) {
        return {
          ...player,
          canUndoCardPlay:
            (gameState.undoableCardPlays?.[viewerPlayerId]?.length ?? 0) > 0,
          ...(Number.isFinite(remainingRouteCost)
            ? { remainingRouteCost }
            : {}),
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

      const publicPlayer = { ...player }
      delete publicPlayer.pendingCampReward
      return {
        ...publicPlayer,
        position,
        ...(Number.isFinite(remainingRouteCost) ? { remainingRouteCost } : {}),
        tokens: player.tokens?.map((token) => ({ ...token })) ?? [],
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
