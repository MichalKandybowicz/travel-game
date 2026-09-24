import cors from '@fastify/cors'
import Fastify from 'fastify'
import { randomUUID } from 'node:crypto'
import { Server } from 'socket.io'
import {
  buyCard,
  createGameState,
  endTurn,
  movePlayer,
  playCard,
  serializePublicGameState,
} from '../../../packages/game-engine/src/index.js'
import {
  EVENTS,
  roomCodeSchema,
  roomCreateSchema,
  roomJoinSchema,
  roomUpdateSettingsSchema,
  playCardSchema,
  movePlayerSchema,
  buyCardSchema,
  type GameError,
  type GameState,
  type MapSettings,
  type RoomState,
  type SessionState,
} from '../../../packages/shared/src/index.js'

interface RoomPlayerRecord {
  id: string
  name: string
  sessionToken: string
  connected: boolean
  socketId?: string
}

interface RoomRecord {
  id: string
  roomCode: string
  hostPlayerId: string
  players: RoomPlayerRecord[]
  settings: MapSettings
  status: RoomState['status']
  seed: string
  gameState?: GameState
}

const roomStore = new Map<string, RoomRecord>()

const buildRoomCode = (): string =>
  Math.random().toString(36).slice(2, 7).toUpperCase()

const serializeRoom = (room: RoomRecord): RoomState => ({
  id: room.id,
  roomCode: room.roomCode,
  hostPlayerId: room.hostPlayerId,
  players: room.players.map((player) => ({
    id: player.id,
    name: player.name,
    connected: player.connected,
    isReady: true,
  })),
  settings: room.settings,
  status: room.status,
  seed: room.seed,
})

const emitRoom = (io: Server, room: RoomRecord): void => {
  io.to(room.roomCode).emit(EVENTS.roomUpdate, serializeRoom(room))
  if (room.gameState) {
    io.to(room.roomCode).emit(
      EVENTS.gameState,
      serializePublicGameState(room.gameState),
    )
  }
}

const emitSession = (
  socketId: string,
  io: Server,
  session: SessionState,
): void => {
  io.to(socketId).emit(EVENTS.sessionUpdate, session)
}

const sendError = (socketId: string, io: Server, payload: GameError): void => {
  io.to(socketId).emit(EVENTS.gameError, payload)
}

const resolveRoomPlayer = (
  room: RoomRecord,
  playerId: string,
  sessionToken?: string,
): RoomPlayerRecord | undefined =>
  room.players.find(
    (player) =>
      player.id === playerId ||
      (sessionToken !== undefined && player.sessionToken === sessionToken),
  )

const fastify = Fastify({ logger: true })
await fastify.register(cors, { origin: true })

fastify.get('/health', async () => ({ ok: true }))

const io = new Server(fastify.server, {
  cors: {
    origin: '*',
  },
})

io.on('connection', (socket) => {
  socket.on(EVENTS.roomCreate, (payload: unknown) => {
    const parsed = roomCreateSchema.safeParse(payload)
    if (!parsed.success) {
      sendError(socket.id, io, {
        code: 'INVALID_ACTION',
        message: parsed.error.message,
      })
      return
    }
    let roomCode = buildRoomCode()
    while (roomStore.has(roomCode)) {
      roomCode = buildRoomCode()
    }
    const playerId = randomUUID()
    const sessionToken = randomUUID()
    const room: RoomRecord = {
      id: randomUUID(),
      roomCode,
      hostPlayerId: playerId,
      players: [
        {
          id: playerId,
          name: parsed.data.playerName,
          sessionToken,
          connected: true,
          socketId: socket.id,
        },
      ],
      settings: parsed.data.settings,
      status: 'LOBBY',
      seed: parsed.data.settings.seed,
    }
    roomStore.set(roomCode, room)
    socket.join(roomCode)
    emitSession(socket.id, io, {
      playerId,
      playerName: parsed.data.playerName,
      roomCode,
      sessionToken,
    })
    emitRoom(io, room)
  })

  socket.on(EVENTS.roomJoin, (payload: unknown) => {
    const parsed = roomJoinSchema.safeParse(payload)
    if (!parsed.success) {
      sendError(socket.id, io, {
        code: 'INVALID_ACTION',
        message: parsed.error.message,
      })
      return
    }
    const room = roomStore.get(parsed.data.roomCode)
    if (!room) {
      sendError(socket.id, io, {
        code: 'ROOM_NOT_FOUND',
        message: 'Room was not found.',
      })
      return
    }

    let player = resolveRoomPlayer(
      room,
      parsed.data.playerId ?? '',
      parsed.data.sessionToken,
    )
    if (!player) {
      if (room.status !== 'LOBBY') {
        sendError(socket.id, io, {
          code: 'GAME_ALREADY_STARTED',
          message: 'Game already started.',
        })
        return
      }
      player = {
        id: randomUUID(),
        name: parsed.data.playerName,
        sessionToken: randomUUID(),
        connected: true,
        socketId: socket.id,
      }
      room.players.push(player)
    }

    player.name = parsed.data.playerName || player.name
    player.connected = true
    player.socketId = socket.id
    socket.join(room.roomCode)
    emitSession(socket.id, io, {
      playerId: player.id,
      playerName: player.name,
      roomCode: room.roomCode,
      sessionToken: player.sessionToken,
    })
    emitRoom(io, room)
  })

  socket.on(EVENTS.roomLeave, (payload: unknown) => {
    const parsed = roomCodeSchema.safeParse(payload)
    if (!parsed.success) {
      return
    }
    const room = roomStore.get(parsed.data.roomCode)
    if (!room) {
      return
    }
    room.players = room.players.filter(
      (player) => player.id !== parsed.data.playerId,
    )
    socket.leave(room.roomCode)
    if (room.players.length === 0) {
      roomStore.delete(room.roomCode)
      return
    }
    if (room.hostPlayerId === parsed.data.playerId) {
      room.hostPlayerId = room.players[0]!.id
    }
    emitRoom(io, room)
  })

  socket.on(EVENTS.roomUpdateSettings, (payload: unknown) => {
    const parsed = roomUpdateSettingsSchema.safeParse(payload)
    if (!parsed.success) {
      sendError(socket.id, io, {
        code: 'INVALID_ACTION',
        message: parsed.error.message,
      })
      return
    }
    const room = roomStore.get(parsed.data.roomCode)
    if (!room) {
      sendError(socket.id, io, {
        code: 'ROOM_NOT_FOUND',
        message: 'Room was not found.',
      })
      return
    }
    if (room.hostPlayerId !== parsed.data.playerId) {
      sendError(socket.id, io, {
        code: 'INVALID_ACTION',
        message: 'Only the host can update settings.',
      })
      return
    }
    room.settings = parsed.data.settings
    room.seed = parsed.data.settings.seed
    emitRoom(io, room)
  })

  socket.on(EVENTS.gameStart, (payload: unknown) => {
    const parsed = roomCodeSchema.safeParse(payload)
    if (!parsed.success) {
      sendError(socket.id, io, {
        code: 'INVALID_ACTION',
        message: parsed.error.message,
      })
      return
    }
    const room = roomStore.get(parsed.data.roomCode)
    if (!room) {
      sendError(socket.id, io, {
        code: 'ROOM_NOT_FOUND',
        message: 'Room was not found.',
      })
      return
    }
    if (room.hostPlayerId !== parsed.data.playerId) {
      sendError(socket.id, io, {
        code: 'INVALID_ACTION',
        message: 'Only the host can start the game.',
      })
      return
    }
    room.gameState = createGameState(
      room.roomCode,
      room.settings,
      room.players.map((player) => ({ id: player.id, name: player.name })),
    )
    room.status = 'IN_GAME'
    emitRoom(io, room)
  })

  socket.on(EVENTS.gamePlayCard, (payload: unknown) => {
    const parsed = playCardSchema.safeParse(payload)
    if (!parsed.success) {
      sendError(socket.id, io, {
        code: 'INVALID_ACTION',
        message: parsed.error.message,
      })
      return
    }
    const room = roomStore.get(parsed.data.roomCode)
    if (!room?.gameState) {
      sendError(socket.id, io, {
        code: 'GAME_NOT_STARTED',
        message: 'Game has not started.',
      })
      return
    }
    try {
      playCard(room.gameState, parsed.data.playerId, parsed.data.cardInstanceId)
      emitRoom(io, room)
    } catch (caught) {
      sendError(socket.id, io, caught as GameError)
    }
  })

  socket.on(EVENTS.gameMove, (payload: unknown) => {
    const parsed = movePlayerSchema.safeParse(payload)
    if (!parsed.success) {
      sendError(socket.id, io, {
        code: 'INVALID_ACTION',
        message: parsed.error.message,
      })
      return
    }
    const room = roomStore.get(parsed.data.roomCode)
    if (!room?.gameState) {
      sendError(socket.id, io, {
        code: 'GAME_NOT_STARTED',
        message: 'Game has not started.',
      })
      return
    }
    try {
      movePlayer(room.gameState, parsed.data.playerId, parsed.data.targetHexId)
      if (room.gameState.status === 'FINISHED') {
        room.status = 'FINISHED'
      }
      emitRoom(io, room)
    } catch (caught) {
      sendError(socket.id, io, caught as GameError)
    }
  })

  socket.on(EVENTS.gameBuyCard, (payload: unknown) => {
    const parsed = buyCardSchema.safeParse(payload)
    if (!parsed.success) {
      sendError(socket.id, io, {
        code: 'INVALID_ACTION',
        message: parsed.error.message,
      })
      return
    }
    const room = roomStore.get(parsed.data.roomCode)
    if (!room?.gameState) {
      sendError(socket.id, io, {
        code: 'GAME_NOT_STARTED',
        message: 'Game has not started.',
      })
      return
    }
    try {
      buyCard(room.gameState, parsed.data.playerId, parsed.data.cardId)
      emitRoom(io, room)
    } catch (caught) {
      sendError(socket.id, io, caught as GameError)
    }
  })

  socket.on(EVENTS.gameEndTurn, (payload: unknown) => {
    const parsed = roomCodeSchema.safeParse(payload)
    if (!parsed.success) {
      sendError(socket.id, io, {
        code: 'INVALID_ACTION',
        message: parsed.error.message,
      })
      return
    }
    const room = roomStore.get(parsed.data.roomCode)
    if (!room?.gameState) {
      sendError(socket.id, io, {
        code: 'GAME_NOT_STARTED',
        message: 'Game has not started.',
      })
      return
    }
    try {
      endTurn(room.gameState, parsed.data.playerId)
      emitRoom(io, room)
    } catch (caught) {
      sendError(socket.id, io, caught as GameError)
    }
  })

  socket.on('disconnect', () => {
    for (const room of roomStore.values()) {
      const player = room.players.find((entry) => entry.socketId === socket.id)
      if (!player) {
        continue
      }
      player.connected = false
      delete player.socketId
      if (room.gameState) {
        const gamePlayer = room.gameState.players.find(
          (entry) => entry.id === player.id,
        )
        if (gamePlayer) {
          gamePlayer.connected = false
        }
      }
      emitRoom(io, room)
    }
  })
})

const port = Number(process.env.PORT ?? 3000)
await fastify.listen({ port, host: '0.0.0.0' })
