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
export type CardPlayMode = 'MOVEMENT' | 'GOLD'
export type CardType = 'MOVEMENT'
export type MapSize = 'SMALL' | 'MEDIUM' | 'LARGE'
export type GameDifficulty = 'EASY' | 'NORMAL' | 'HARD'
export type FogMode = 'NONE' | 'PETAL' | 'MEDIUM' | 'FULL'
export type RoomStatus = 'LOBBY' | 'IN_GAME' | 'FINISHED'
export type GameStatus = 'LOBBY' | 'CHOOSING_START' | 'ACTIVE' | 'FINISHED'
import type { PlayerColor, PlayerSymbol } from './playerAppearance.js'

export interface MapSettings {
  seed: string
  mapSize: MapSize
  difficulty: GameDifficulty
  routeCount: number
  jungleDensity: number
  waterDensity: number
  mountainDensity: number
  specialTileDensity: number
  chokepointCount: number
  allowSharedTiles: boolean
  petalCount: number
  fogMode: FogMode
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
  stats: MapAnalysis
}

export interface CardDefinition {
  id: string
  name: string
  type: CardType
  movementType: MovementType
  movementValue: number
  goldValue: number
  purchaseCost: number
}

export interface CardInstance {
  instanceId: string
  cardId: string
}

export interface MovementPool {
  GREEN: number
  BLUE: number
  YELLOW: number
  WILD: number
}

export interface PlayerState {
  id: string
  name: string
  color?: PlayerColor
  symbol?: PlayerSymbol
  position: string
  drawPile: CardInstance[]
  hand: CardInstance[]
  discardPile: CardInstance[]
  removedCards: CardInstance[]
  playedCards: CardInstance[]
  availableMovement: MovementPool
  availableGold: number
  hasBoughtThisTurn?: boolean
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
  market: string[]
  marketDrawPile: string[]
  marketCycle: number
  roundPlayedCards: Array<{
    instanceId: string
    playerId: string
    cardId: string
    mode: CardPlayMode
  }>
  winnerId?: string
}

export interface LobbyPlayer {
  id: string
  name: string
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
