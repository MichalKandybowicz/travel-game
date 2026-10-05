export type TerrainType =
  | 'UNKNOWN'
  | 'JUNGLE'
  | 'WATER'
  | 'DESERT'
  | 'RUBBLE'
  | 'CAMP'
  | 'MOUNTAIN'
  | 'START'
  | 'GOAL'

export type MovementType = 'GREEN' | 'BLUE' | 'YELLOW' | 'WILD'
export type TokenType =
  | 'GREEN_1'
  | 'GREEN_2'
  | 'GREEN_3'
  | 'GREEN_4'
  | 'BLUE_1'
  | 'BLUE_2'
  | 'BLUE_3'
  | 'BLUE_4'
  | 'YELLOW_1'
  | 'YELLOW_2'
  | 'YELLOW_3'
  | 'YELLOW_4'
  | 'WILD_1'
  | 'WILD_2'
  | 'WILD_3'
  | 'WILD_4'
  | 'GOLD_1'
  | 'GOLD_2'
  | 'GOLD_3'
  | 'GOLD_4'
  | 'SWAP_HAND'
  | 'DRAW_CARD'
  | 'REFRESH_MARKET'
  | 'CURSE_REMOVE_CARD'
  | 'CURSE_SKIP_LEADER'
  | 'CURSE_MARKET'
export type CardPlayMode = 'MOVEMENT' | 'GOLD' | 'ACTION'
export type CardType = 'MOVEMENT' | 'ACTION'
export type ActionCardCategory = 'SPELL' | 'CURSE'
export type MarketTier = 1 | 2 | 3 | 4
export type ActionCardEffect =
  | 'MAP_SHORTCUT'
  | 'SECOND_WIND'
  | 'STEAL_PLANS'
  | 'GUIDE'
  | 'PHASE_WALK'
  | 'RESHUFFLE_HAND'
  | 'ECHO_POWER'
  | 'PROTECTIVE_CIRCLE'
  | 'PATH_FRACTURE'
  | 'FOG_OF_FORGETTING'
  | 'POVERTY_CURSE'
  | 'TANGLED_ROOTS'
  | 'CLOSED_MARKET'
  | 'HEX_SEAL'
export type MapSize = 'SMALL' | 'MEDIUM' | 'LARGE'
export type GameDifficulty = 'EASY' | 'NORMAL' | 'HARD'
export type FogMode = 'NONE' | 'PETAL' | 'MEDIUM' | 'FULL' | 'RANGE'
export type RoomStatus = 'LOBBY' | 'IN_GAME' | 'FINISHED'
export type GameStatus = 'LOBBY' | 'CHOOSING_START' | 'ACTIVE' | 'FINISHED'
import type { PlayerColor, PlayerSymbol } from './playerAppearance.js'

export interface MapSettings {
  seed: string
  mapSize: MapSize
  segmentEdgeLength?: number | undefined
  difficulty: GameDifficulty
  routeCount: number
  jungleDensity: number
  waterDensity: number
  mountainDensity: number
  specialTileDensity: number
  chokepointCount: number
  allowSharedTiles: boolean
  petalCount: number
  campCountMinPerPetal: number
  campCountMaxPerPetal: number
  fogMode: FogMode
  terrainVisibilityRange?: number | 'ALL'
  costVisibilityRange?: number | 'ALL'
}

export interface MapAnalysis {
  shortestPathLength: number
  routeCount: number
  junglePercent: number
  waterPercent: number
  desertPercent: number
  mountainPercent: number
  difficultyScore: number
}

export interface HexTile {
  id: string
  q: number
  r: number
  terrain: TerrainType
  difficulty: number
  isBlocked: boolean
  petalId?: number
  specialType?: 'CHOKEPOINT' | 'LOOP' | 'CAMP'
}

export interface GameMap {
  tiles: HexTile[]
  petalCount?: number
  startHexId: string
  startHexIds?: string[]
  goalHexId: string
  goalHexIds?: string[] | undefined
  stats: MapAnalysis
}

export interface CustomMap {
  id: string
  ownerId: string
  name: string
  settings: MapSettings
  map: GameMap
  createdAt: number
  updatedAt: number
}

export interface CardDefinition {
  id: string
  name: string
  type: CardType
  movementType: MovementType
  movementValue: number
  secondaryMovementType?: MovementType
  secondaryMovementValue?: number
  goldValue: number
  purchaseCost: number
  actionEffect?: ActionCardEffect
  actionCategory?: ActionCardCategory
}

export interface CardInstance {
  instanceId: string
  cardId: string
}

export interface TokenInstance {
  instanceId: string
  type: TokenType
}

export interface MovementPool {
  GREEN: number
  BLUE: number
  YELLOW: number
  WILD: number
}

export interface PlayedCardRecord {
  instanceId: string
  playerId: string
  cardId: string
  mode: CardPlayMode
  sacrificed?: boolean
  echoed?: boolean
}

export interface UndoableCardPlay {
  cardInstanceId: string
  handIndex: number
  mode: CardPlayMode
  sacrificed: boolean
  echoed?: boolean
  previousSacrificeCooldown: number
  previousHasSacrificedCard: boolean
  previousEchoPowerAvailable?: boolean
}

export interface CurseEvent {
  instanceId: string
  playerId: string
  source: 'CARD' | 'TOKEN'
  cardId?: string
  tokenType?: TokenType
  targetPlayerId?: string
  targetHexId?: string
  blocked?: boolean
}

export interface PlayerState {
  id: string
  name: string
  isBot?: boolean
  color?: PlayerColor
  symbol?: PlayerSymbol
  position: string
  canUndoCardPlay?: boolean
  drawPile: CardInstance[]
  hand: CardInstance[]
  discardPile: CardInstance[]
  removedCards: CardInstance[]
  playedCards: CardInstance[]
  lastTurnPlayedCards?: PlayedCardRecord[]
  availableMovement: MovementPool
  availableGold: number
  hasBoughtThisTurn?: boolean
  purchasesThisTurn?: number
  hasSacrificedCardThisTurn?: boolean
  sacrificeCooldownTurns?: number
  extraPurchaseAvailable?: boolean
  shortcutMoveAvailable?: boolean
  guidedMoveAvailable?: boolean
  sharedTileAccessAvailable?: boolean
  sharedTileAccessTurns?: number
  echoPowerAvailable?: boolean
  curseShieldAvailable?: boolean
  extraMoveCostPending?: boolean
  fogCostsHidden?: boolean
  shortcutBlocked?: boolean
  marketBlocked?: boolean
  nextPurchaseCostIncrease?: number
  pendingDiscardCount?: number
  tokens?: TokenInstance[]
  pendingCampReward?: {
    campId: string
    options: [TokenType, TokenType, TokenType]
    storyIndex: number
  }
  claimedCampIds?: string[]
  revealedTileIds?: string[]
  scoutedTileIds?: string[]
  remainingRouteCost?: number
  tokenUsedInRound?: number
  skipNextTurn?: boolean
  isReady: boolean
  connected: boolean
}

export interface GameState {
  id: string
  roomCode: string
  status: GameStatus
  settings: MapSettings
  seed: string
  map: GameMap
  players: PlayerState[]
  currentPlayerId: string
  startSelectionOrder?: string[]
  turnNumber: number
  roundNumber?: number
  market: string[]
  marketDrawPile: string[]
  marketCycle: number
  cardPurchaseCounts?: Record<string, number>
  marketPurchasedThisRound?: boolean
  marketLockedUntilPlayerId?: string
  roundPlayedCards: PlayedCardRecord[]
  undoableCardPlays?: Record<string, UndoableCardPlay[]>
  latestCurse?: CurseEvent
  temporaryBlockedHexes?: { hexId: string; casterPlayerId: string }[]
  winnerId?: string
}

export interface LobbyPlayer {
  id: string
  name: string
  isBot?: boolean
  color?: PlayerColor
  symbol?: PlayerSymbol
  isReady: boolean
  connected: boolean
}

export interface RoomState {
  id: string
  roomCode: string
  hostPlayerId: string
  players: LobbyPlayer[]
  settings: MapSettings
  status: RoomStatus
  seed: string
  customMapId?: string
  customMapName?: string
  customMap?: GameMap
  mapShape?: Array<{ q: number; r: number; petalId: number }> | undefined
}

export interface SessionState {
  roomCode: string
  playerId: string
  playerName: string
  sessionToken: string
}

export interface AccountSession {
  id: string
  username: string
  token: string
  activeRoomCode?: string | undefined
}

export interface GameError {
  code:
    | 'NOT_YOUR_TURN'
    | 'INVALID_MOVE'
    | 'NOT_ENOUGH_MOVEMENT'
    | 'CARD_NOT_IN_HAND'
    | 'NOT_ENOUGH_GOLD'
    | 'PURCHASE_LIMIT'
    | 'TOKEN_LIMIT'
    | 'TOKEN_NOT_FOUND'
    | 'MARKET_LOCKED'
    | 'HEX_BLOCKED'
    | 'HEX_OCCUPIED'
    | 'LEAVE_FAILED'
    | 'ROOM_NOT_FOUND'
    | 'GAME_ALREADY_STARTED'
    | 'GAME_NOT_STARTED'
    | 'PLAYER_NOT_FOUND'
    | 'ROOM_FULL'
    | 'INVALID_ACTION'
  message: string
}
