import { io, type Socket } from 'socket.io-client'
import { create } from 'zustand'
import {
  EVENTS,
  type AccountSession,
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
  allowSharedTiles: true,
  petalCount: 3,
  fogMode: 'NONE',
}

const sessionStorageKey = 'travel-game-session'
const accountStorageKey = 'travel-game-account'
const serverUrl = import.meta.env.VITE_SERVER_URL || window.location.origin

const readStored = <T>(key: string): T | undefined => {
  try {
    const value = localStorage.getItem(key)
    return value ? (JSON.parse(value) as T) : undefined
  } catch {
    localStorage.removeItem(key)
    return undefined
  }
}

interface AuthResponse {
  user: { id: string; username: string }
  token?: string
  activeRoomCode?: string
  message?: string
}

const authRequest = async (
  path: string,
  body: { username: string; password: string },
): Promise<AccountSession> => {
  const response = await fetch(`${serverUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = (await response.json()) as AuthResponse
  if (!response.ok || !result.token) {
    throw new Error(result.message ?? 'Nie udało się połączyć z serwerem.')
  }
  return {
    ...result.user,
    token: result.token,
    activeRoomCode: result.activeRoomCode,
  }
}

let socket: Socket | undefined
let handlersRegistered = false

interface GameStore {
  room: RoomState | undefined
  game: GameState | undefined
  session: SessionState | undefined
  account: AccountSession | undefined
  authError: string | undefined
  error: GameError | undefined
  connected: boolean
  initialize: () => void
  createRoom: (playerName: string, settings: MapSettings) => void
  joinRoom: (roomCode: string, playerName: string) => void
  reconnectToRoom: (roomCode: string) => void
  updateSettings: (settings: MapSettings) => void
  startGame: () => void
  chooseStart: (hexId: string) => void
  playCard: (cardInstanceId: string, mode: CardPlayMode) => void
  movePlayer: (targetHexId: string) => void
  buyCard: (cardId: string) => void
  endTurn: () => void
  leaveRoom: () => Promise<boolean>
  leaveFinishedGame: () => void
  clearError: () => void
  register: (username: string, password: string) => Promise<void>
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const getSocket = (): Socket => {
  if (!socket) {
    socket = io(serverUrl)
  }
  return socket
}

export const useGameStore = create<GameStore>((set, get) => ({
  room: undefined,
  game: undefined,
  session: readStored<SessionState>(sessionStorageKey),
  account: readStored<AccountSession>(accountStorageKey),
  authError: undefined,
  error: undefined,
  connected: false,
  initialize: () => {
    const client = getSocket()
    if (!handlersRegistered) {
      client.on('connect', () => {
        set({ connected: true })
        const roomCode =
          get().account?.activeRoomCode ?? get().session?.roomCode
        if (roomCode) {
          get().reconnectToRoom(roomCode)
        }
      })
      client.on('disconnect', () => set({ connected: false }))
      client.on(EVENTS.sessionUpdate, (session: SessionState) => {
        localStorage.setItem(sessionStorageKey, JSON.stringify(session))
        set((state) => {
          const account = state.account
            ? { ...state.account, activeRoomCode: session.roomCode }
            : undefined
          if (account) {
            localStorage.setItem(accountStorageKey, JSON.stringify(account))
          }
          return { session, account, error: undefined }
        })
      })
      client.on(EVENTS.roomUpdate, (room: RoomState) => {
        set((state) =>
          state.session?.roomCode === room.roomCode
            ? {
                room,
                game:
                  state.game?.roomCode === room.roomCode
                    ? state.game
                    : undefined,
                error: undefined,
              }
            : state,
        )
      })
      client.on(EVENTS.gameState, (game: GameState) => {
        set((state) =>
          state.session?.roomCode === game.roomCode
            ? {
                game,
                room:
                  state.room?.roomCode === game.roomCode
                    ? state.room
                    : undefined,
                error: undefined,
              }
            : state,
        )
      })
      client.on(EVENTS.gameError, (error: GameError) => {
        set({ error })
      })
      handlersRegistered = true
    }
    const account = get().account
    if (account) {
      void fetch(`${serverUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${account.token}` },
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error('Sesja konta wygasła. Zaloguj się ponownie.')
          }
          const result = (await response.json()) as AuthResponse
          if (get().account?.token !== account.token) {
            return
          }
          const next = { ...account, activeRoomCode: result.activeRoomCode }
          localStorage.setItem(accountStorageKey, JSON.stringify(next))
          set({ account: next })
        })
        .catch((caught: unknown) => {
          if (caught instanceof Error && caught.message.includes('wygasła')) {
            localStorage.removeItem(accountStorageKey)
            set({ account: undefined, authError: caught.message })
          }
        })
    }
  },
  createRoom: (playerName, settings) => {
    set({ room: undefined, game: undefined, error: undefined })
    getSocket().emit(EVENTS.roomCreate, {
      playerName,
      settings,
      authToken: get().account?.token,
    })
  },
  joinRoom: (roomCode, playerName) => {
    const session = get().session
    set({ room: undefined, game: undefined, error: undefined })
    getSocket().emit(EVENTS.roomJoin, {
      roomCode: roomCode.toUpperCase(),
      playerName,
      playerId:
        session?.roomCode === roomCode.toUpperCase()
          ? session.playerId
          : undefined,
      sessionToken:
        session?.roomCode === roomCode.toUpperCase()
          ? session.sessionToken
          : undefined,
      authToken: get().account?.token,
    })
  },
  reconnectToRoom: (roomCode) => {
    const session = get().session
    const account = get().account
    if (!session && !account) {
      return
    }
    const normalizedRoomCode = roomCode.toUpperCase()
    getSocket().emit(EVENTS.roomJoin, {
      roomCode: normalizedRoomCode,
      playerName: account?.username ?? session?.playerName ?? 'Gracz',
      playerId:
        session?.roomCode === normalizedRoomCode ? session.playerId : undefined,
      sessionToken:
        session?.roomCode === normalizedRoomCode
          ? session.sessionToken
          : undefined,
      authToken: account?.token,
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
  chooseStart: (hexId) => {
    const { session } = get()
    if (!session) return
    getSocket().emit(EVENTS.gameChooseStart, {
      roomCode: session.roomCode,
      playerId: session.playerId,
      hexId,
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
  leaveRoom: async () => {
    const { session, account, connected } = get()
    if (!session || !connected) {
      set({
        error: {
          code: 'LEAVE_FAILED',
          message: 'Brak połączenia z pokojem. Spróbuj ponownie.',
        },
      })
      return false
    }
    try {
      const result = (await getSocket()
        .timeout(5000)
        .emitWithAck(EVENTS.roomLeave, {
          roomCode: session.roomCode,
          playerId: session.playerId,
        })) as { ok: boolean }
      if (!result.ok) {
        throw new Error('Nie udało się opuścić pokoju.')
      }
    } catch {
      set({
        error: {
          code: 'LEAVE_FAILED',
          message: 'Nie udało się opuścić pokoju. Spróbuj ponownie.',
        },
      })
      return false
    }
    const nextAccount =
      account?.activeRoomCode === session.roomCode
        ? { ...account, activeRoomCode: undefined }
        : account
    localStorage.removeItem(sessionStorageKey)
    if (nextAccount && nextAccount !== account) {
      localStorage.setItem(accountStorageKey, JSON.stringify(nextAccount))
    }
    set({
      session: undefined,
      room: undefined,
      game: undefined,
      account: nextAccount,
      error: undefined,
    })
    socket?.disconnect()
    socket?.connect()
    return true
  },
  leaveFinishedGame: () => {
    const { game, room, account } = get()
    const finishedRoomCode =
      game?.status === 'FINISHED'
        ? game.roomCode
        : room?.status === 'FINISHED'
          ? room.roomCode
          : undefined
    if (!finishedRoomCode) {
      return
    }
    const nextAccount =
      account?.activeRoomCode === finishedRoomCode
        ? { ...account, activeRoomCode: undefined }
        : account
    localStorage.removeItem(sessionStorageKey)
    if (nextAccount && nextAccount !== account) {
      localStorage.setItem(accountStorageKey, JSON.stringify(nextAccount))
    }
    set({
      session: undefined,
      room: undefined,
      game: undefined,
      account: nextAccount,
      error: undefined,
    })
    socket?.disconnect()
    socket?.connect()
  },
  clearError: () => set({ error: undefined }),
  register: async (username, password) => {
    try {
      const account = await authRequest('/auth/register', {
        username,
        password,
      })
      localStorage.setItem(accountStorageKey, JSON.stringify(account))
      set({ account, authError: undefined })
    } catch (caught) {
      set({ authError: (caught as Error).message })
    }
  },
  login: async (username, password) => {
    try {
      const account = await authRequest('/auth/login', { username, password })
      localStorage.setItem(accountStorageKey, JSON.stringify(account))
      set({ account, authError: undefined })
    } catch (caught) {
      set({ authError: (caught as Error).message })
    }
  },
  logout: async () => {
    const account = get().account
    if (account) {
      try {
        await fetch(`${serverUrl}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${account.token}` },
        })
      } catch {
        // Local logout still clears credentials when the server is unavailable.
      }
    }
    localStorage.removeItem(accountStorageKey)
    localStorage.removeItem(sessionStorageKey)
    set({
      account: undefined,
      session: undefined,
      room: undefined,
      game: undefined,
    })
    socket?.disconnect()
    socket?.connect()
  },
}))

export { defaultSettings }
