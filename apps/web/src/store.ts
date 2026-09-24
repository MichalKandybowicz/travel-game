import { io, type Socket } from 'socket.io-client'
import { create } from 'zustand'
import {
  EVENTS,
  type CardPlayMode,
  type GameError,
  type GameState,
  type MapSettings,
  type RoomState,
  type SessionState,
} from '@shared'

const defaultSettings: MapSettings = {
  seed: 'JUNGLE-92841',
  mapSize: 'MEDIUM',
  difficulty: 'NORMAL',
  routeCount: 3,
  jungleDensity: 0.4,
  waterDensity: 0.2,
  mountainDensity: 0.15,
  specialTileDensity: 0.05,
  chokepointCount: 2,
}

const sessionStorageKey = 'travel-game-session'
let socket: Socket | undefined
let handlersRegistered = false

interface GameStore {
  room: RoomState | undefined
  game: GameState | undefined
  session: SessionState | undefined
  error: GameError | undefined
  connected: boolean
  initialize: () => void
  createRoom: (playerName: string, settings: MapSettings) => void
  joinRoom: (roomCode: string, playerName: string) => void
  reconnectToRoom: (roomCode: string) => void
  updateSettings: (settings: MapSettings) => void
  startGame: () => void
  playCard: (cardInstanceId: string, mode: CardPlayMode) => void
  movePlayer: (targetHexId: string) => void
  buyCard: (cardId: string) => void
  endTurn: () => void
  clearError: () => void
}

const getSocket = (): Socket => {
  if (!socket) {
    socket = io(import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3000')
  }
  return socket
}

export const useGameStore = create<GameStore>((set, get) => ({
  room: undefined,
  game: undefined,
  session: undefined,
  error: undefined,
  connected: false,
  initialize: () => {
    const client = getSocket()
    if (!handlersRegistered) {
      client.on('connect', () => set({ connected: true }))
      client.on('disconnect', () => set({ connected: false }))
      client.on(EVENTS.sessionUpdate, (session: SessionState) => {
        localStorage.setItem(sessionStorageKey, JSON.stringify(session))
        set({ session, error: undefined })
      })
      client.on(EVENTS.roomUpdate, (room: RoomState) => {
        set((state) => ({
          room,
          game: state.game?.roomCode === room.roomCode ? state.game : undefined,
          error: undefined,
        }))
      })
      client.on(EVENTS.gameState, (game: GameState) => {
        set((state) => ({
          game,
          room: state.room?.roomCode === game.roomCode ? state.room : undefined,
          error: undefined,
        }))
      })
      client.on(EVENTS.gameError, (error: GameError) => {
        set({ error })
      })
      handlersRegistered = true
    }
    const stored = localStorage.getItem(sessionStorageKey)
    if (stored && !get().session) {
      set({ session: JSON.parse(stored) as SessionState })
    }
  },
  createRoom: (playerName, settings) => {
    set({ room: undefined, game: undefined, error: undefined })
    getSocket().emit(EVENTS.roomCreate, { playerName, settings })
  },
  joinRoom: (roomCode, playerName) => {
    const session = get().session
    set({ room: undefined, game: undefined, error: undefined })
    getSocket().emit(EVENTS.roomJoin, {
      roomCode: roomCode.toUpperCase(),
      playerName,
      playerId: session?.playerId,
      sessionToken: session?.sessionToken,
    })
  },
  reconnectToRoom: (roomCode) => {
    const session = get().session
    if (!session) {
      return
    }
    set({ room: undefined, game: undefined, error: undefined })
    getSocket().emit(EVENTS.roomJoin, {
      roomCode: roomCode.toUpperCase(),
      playerName: session.playerName,
      playerId: session.playerId,
      sessionToken: session.sessionToken,
    })
  },
  updateSettings: (settings) => {
    const { session } = get()
    if (!session) {
      return
    }
    getSocket().emit(EVENTS.roomUpdateSettings, {
      roomCode: session.roomCode,
      playerId: session.playerId,
      settings,
    })
  },
  startGame: () => {
    const { session } = get()
    if (!session) {
      return
    }
    getSocket().emit(EVENTS.gameStart, {
      roomCode: session.roomCode,
      playerId: session.playerId,
    })
  },
  playCard: (cardInstanceId, mode) => {
    const { session } = get()
    if (!session) {
      return
    }
    getSocket().emit(EVENTS.gamePlayCard, {
      roomCode: session.roomCode,
      playerId: session.playerId,
      cardInstanceId,
      mode,
    })
  },
  movePlayer: (targetHexId) => {
    const { session } = get()
    if (!session) {
      return
    }
    getSocket().emit(EVENTS.gameMove, {
      roomCode: session.roomCode,
      playerId: session.playerId,
      targetHexId,
    })
  },
  buyCard: (cardId) => {
    const { session } = get()
    if (!session) {
      return
    }
    getSocket().emit(EVENTS.gameBuyCard, {
      roomCode: session.roomCode,
      playerId: session.playerId,
      cardId,
    })
  },
  endTurn: () => {
    const { session } = get()
    if (!session) {
      return
    }
    getSocket().emit(EVENTS.gameEndTurn, {
      roomCode: session.roomCode,
      playerId: session.playerId,
    })
  },
  clearError: () => set({ error: undefined }),
}))

export { defaultSettings }
