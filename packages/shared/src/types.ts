export type TerrainType =
  | 'JUNGLE'
  | 'WATER'
  | 'VILLAGE'
  | 'RUBBLE'
  | 'CAMP'
  | 'MOUNTAIN'
  | 'START'
  | 'GOAL'

export type MovementType = 'GREEN' | 'BLUE' | 'YELLOW' | 'WILD'
export type CardType = 'MOVEMENT'
export type MapSize = 'SMALL' | 'MEDIUM' | 'LARGE'
export type GameDifficulty = 'EASY' | 'NORMAL' | 'HARD'
export type RoomStatus = 'LOBBY' | 'IN_GAME' | 'FINISHED'
export type GameStatus = 'LOBBY' | 'ACTIVE' | 'FINISHED'

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
}

export interface MapAnalysis {
  shortestPathLength: number
  routeCount: number
  junglePercent: number
  waterPercent: number
  villagePercent: number
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
  specialType?: 'CHOKEPOINT' | 'LOOP' | 'CAMP'
}

export interface GameMap {
  tiles: HexTile[]
  startHexId: string
  goalHexId: string
  stats: MapAnalysis
}

export interface CardDefinition {
  id: string
  name: string
  type: CardType
  movementType: MovementType
  movementValue: number
  purchaseCost: number
  description: string
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
  position: string
  drawPile: CardInstance[]
  hand: CardInstance[]
  discardPile: CardInstance[]
  removedCards: CardInstance[]
  playedCards: CardInstance[]
  availableMovement: MovementPool
  availableGold: number
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
  turnNumber: number
  market: string[]
  winnerId?: string
}

export interface LobbyPlayer {
  id: string
  name: string
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
}

export interface SessionState {
  roomCode: string
  playerId: string
  playerName: string
  sessionToken: string
}

export interface GameError {
  code:
    | 'NOT_YOUR_TURN'
    | 'INVALID_MOVE'
    | 'NOT_ENOUGH_MOVEMENT'
    | 'CARD_NOT_IN_HAND'
    | 'NOT_ENOUGH_GOLD'
    | 'HEX_BLOCKED'
    | 'ROOM_NOT_FOUND'
    | 'GAME_ALREADY_STARTED'
    | 'GAME_NOT_STARTED'
    | 'PLAYER_NOT_FOUND'
    | 'ROOM_FULL'
    | 'INVALID_ACTION'
  message: string
}
