import cors from '@fastify/cors'
import Fastify from 'fastify'
import { randomUUID } from 'node:crypto'
import { MongoServerError } from 'mongodb'
import { Server, type Socket } from 'socket.io'
import { z } from 'zod'
import {
  buyCard,
  createGameState,
  endTurn,
  movePlayer,
  playCard,
  removePlayer,
  serializePublicGameState,
} from '../../../packages/game-engine/src/index.js'
import { generateMap } from '../../../packages/map-generator/src/index.js'
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
  type RoomState,
  type SessionState,
} from '../../../packages/shared/src/index.js'
import {
  findAccountByToken,
  hashToken,
  loginAccount,
  registerAccount,
} from './auth.js'
import {
  connectStorage,
  type AccountRecord,
  type RoomPlayerRecord,
  type RoomRecord,
} from './storage.js'

const storage = await connectStorage(
  process.env.MONGO_URL ?? 'mongodb://127.0.0.1:27017/travel_game',
)
const roomStore = new Map<string, RoomRecord>(
  (await storage.loadRooms()).map((room) => [room.roomCode, room]),
)
const MAX_PLAYERS_PER_ROOM = 4
const shapeCache = new WeakMap<
  RoomRecord,
  { settingsKey: string; shape: NonNullable<RoomState['mapShape']> }
>()

const getRoomMapShape = (room: RoomRecord): RoomState['mapShape'] => {
  if (room.status !== 'LOBBY') return undefined
  const settingsKey = JSON.stringify(room.settings)
  const cached = shapeCache.get(room)
  if (cached?.settingsKey === settingsKey) return cached.shape
  try {
    const shape = generateMap(room.settings).tiles.map(({ q, r, petalId }) => ({
      q,
      r,
      petalId: petalId ?? 0,
    }))
    shapeCache.set(room, { settingsKey, shape })
    return shape
  } catch {
    return undefined
  }
}

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
  mapShape: getRoomMapShape(room),
})

const emitRoom = async (io: Server, room: RoomRecord): Promise<void> => {
  await storage.saveRoom(room)
  io.to(room.roomCode).emit(EVENTS.roomUpdate, serializeRoom(room))
  if (room.gameState) {
    for (const player of room.players) {
      if (!player.socketId) {
        continue
      }
      io.to(player.socketId).emit(
        EVENTS.gameState,
        serializePublicGameState(room.gameState, player.id),
      )
    }
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
  accountId?: string,
): RoomPlayerRecord | undefined =>
  room.players.find(
    (player) =>
      (accountId !== undefined && player.accountId === accountId) ||
      (player.accountId === undefined &&
        player.id === playerId &&
        sessionToken !== undefined &&
        player.sessionTokenHash === hashToken(sessionToken)),
  )

const detachSocketFromRooms = async (
  socketId: string,
  socket: Socket,
  exceptRoomCode?: string,
): Promise<void> => {
  for (const room of roomStore.values()) {
    if (room.roomCode === exceptRoomCode) {
      continue
    }
    const player = room.players.find((entry) => entry.socketId === socketId)
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
    socket.leave(room.roomCode)
    await emitRoom(io, room)
  }
}

const authorizeRoomPlayer = (
  room: RoomRecord,
  socketId: string,
  playerId: string,
): RoomPlayerRecord | undefined =>
  room.players.find(
    (entry) => entry.id === playerId && entry.socketId === socketId,
  )

const fastify = Fastify({ logger: true })
await fastify.register(cors, { origin: true })

fastify.get('/health', async () => ({ ok: true }))

const credentialsSchema = z.object({
  username: z.string().trim().min(3).max(24),
  password: z.string().min(8).max(128),
})

const activeRoomFor = (accountId: string): RoomRecord | undefined =>
  [...roomStore.values()]
    .filter(
      (room) =>
        room.status !== 'FINISHED' &&
        room.players.some((player) => player.accountId === accountId),
    )
    .sort((left, right) => right.updatedAt - left.updatedAt)[0]

const authResponse = (account: AccountRecord, token?: string) => ({
  user: { id: account.id, username: account.username },
  activeRoomCode: activeRoomFor(account.id)?.roomCode,
  ...(token ? { token } : {}),
})

fastify.post('/auth/register', async (request, reply) => {
  const parsed = credentialsSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.code(400).send({ message: 'Nieprawidłowa nazwa lub hasło.' })
  }
  try {
    const { account, token } = await registerAccount(
      storage,
      parsed.data.username,
      parsed.data.password,
    )
    return authResponse(account, token)
  } catch (caught) {
    if (caught instanceof MongoServerError && caught.code === 11000) {
      return reply
        .code(409)
        .send({ message: 'Ta nazwa gracza jest już zajęta.' })
    }
    throw caught
  }
})

fastify.post('/auth/login', async (request, reply) => {
  const parsed = credentialsSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.code(400).send({ message: 'Nieprawidłowa nazwa lub hasło.' })
  }
  const result = await loginAccount(
    storage,
    parsed.data.username,
    parsed.data.password,
  )
  if (!result) {
    return reply.code(401).send({ message: 'Nieprawidłowa nazwa lub hasło.' })
  }
  return authResponse(result.account, result.token)
})

fastify.get('/auth/me', async (request, reply) => {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '')
  const account = await findAccountByToken(storage, token)
  if (!account) {
    return reply.code(401).send({ message: 'Sesja konta wygasła.' })
  }
  return authResponse(account)
})

fastify.post('/auth/logout', async (request, reply) => {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '')
  const account = await findAccountByToken(storage, token)
  if (!account) {
    return reply.code(401).send({ message: 'Sesja konta wygasła.' })
  }
  await storage.accounts.updateOne(
    { id: account.id },
    { $set: { authTokenHash: hashToken(randomUUID()) } },
  )
  return { ok: true }
})

const io = new Server(fastify.server, {
  cors: {
    origin: '*',
  },
})

io.on('connection', (socket) => {
  socket.on(EVENTS.roomCreate, async (payload: unknown) => {
    const parsed = roomCreateSchema.safeParse(payload)
    if (!parsed.success) {
      sendError(socket.id, io, {
        code: 'INVALID_ACTION',
        message: parsed.error.message,
      })
      return
    }
    const account = await findAccountByToken(storage, parsed.data.authToken)
    if (parsed.data.authToken && !account) {
      sendError(socket.id, io, {
        code: 'INVALID_ACTION',
        message: 'Account session has expired.',
      })
      return
    }
    await detachSocketFromRooms(socket.id, socket)
    let roomCode = buildRoomCode()
    while (roomStore.has(roomCode)) {
      roomCode = buildRoomCode()
    }
    const playerId = account?.id ?? randomUUID()
    const sessionToken = randomUUID()
    const playerName = account?.username ?? parsed.data.playerName
    const room: RoomRecord = {
      id: randomUUID(),
      roomCode,
      hostPlayerId: playerId,
      players: [
        {
          id: playerId,
          name: playerName,
          sessionTokenHash: hashToken(sessionToken),
          ...(account ? { accountId: account.id } : {}),
          connected: true,
          socketId: socket.id,
        },
      ],
      settings: parsed.data.settings,
      status: 'LOBBY',
      seed: parsed.data.settings.seed,
      updatedAt: Date.now(),
    }
    roomStore.set(roomCode, room)
    socket.join(roomCode)
    emitSession(socket.id, io, {
      playerId,
      playerName,
      roomCode,
      sessionToken,
    })
    await emitRoom(io, room)
  })

  socket.on(EVENTS.roomJoin, async (payload: unknown) => {
    const parsed = roomJoinSchema.safeParse(payload)
    if (!parsed.success) {
      sendError(socket.id, io, {
        code: 'INVALID_ACTION',
        message: parsed.error.message,
      })
      return
    }
    const account = await findAccountByToken(storage, parsed.data.authToken)
    if (parsed.data.authToken && !account) {
      sendError(socket.id, io, {
        code: 'INVALID_ACTION',
        message: 'Account session has expired.',
      })
      return
    }
    await detachSocketFromRooms(socket.id, socket, parsed.data.roomCode)
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
      account?.id,
    )
    const isNewPlayer = !player
    if (!player) {
      if (room.status !== 'LOBBY') {
        sendError(socket.id, io, {
          code: 'GAME_ALREADY_STARTED',
          message: 'Game already started.',
        })
        return
      }
      if (room.players.length >= MAX_PLAYERS_PER_ROOM) {
        sendError(socket.id, io, {
          code: 'ROOM_FULL',
          message: 'This room already has the maximum number of players.',
        })
        return
      }
      const newPlayer: RoomPlayerRecord = {
        id: account?.id ?? randomUUID(),
        name: account?.username ?? parsed.data.playerName,
        sessionTokenHash: '',
        ...(account ? { accountId: account.id } : {}),
        connected: true,
        socketId: socket.id,
      }
      room.players.push(newPlayer)
      player = newPlayer
    }

    if (account && !player.accountId) {
      if (
        room.players.some(
          (entry) => entry.id !== player.id && entry.accountId === account.id,
        )
      ) {
        sendError(socket.id, io, {
          code: 'INVALID_ACTION',
          message: 'This account already joined the room.',
        })
        return
      }
      player.accountId = account.id
    }

    const sessionToken =
      account || isNewPlayer
        ? randomUUID()
        : (parsed.data.sessionToken ?? randomUUID())
    player.sessionTokenHash = hashToken(sessionToken)
    player.name = account?.username ?? parsed.data.playerName
    player.connected = true
    player.socketId = socket.id
    if (room.gameState) {
      const gamePlayer = room.gameState.players.find(
        (entry) => entry.id === player.id,
      )
      if (gamePlayer) {
        gamePlayer.connected = true
        gamePlayer.name = player.name
      }
    }
    socket.join(room.roomCode)
    emitSession(socket.id, io, {
      playerId: player.id,
      playerName: player.name,
      roomCode: room.roomCode,
      sessionToken,
    })
    await emitRoom(io, room)
  })

  socket.on(
    EVENTS.roomLeave,
    async (
      payload: unknown,
      acknowledge?: (result: { ok: boolean }) => void,
    ) => {
      const parsed = roomCodeSchema.safeParse(payload)
      if (!parsed.success) {
        acknowledge?.({ ok: false })
        return
      }
      const room = roomStore.get(parsed.data.roomCode)
      if (!room) {
        acknowledge?.({ ok: false })
        return
      }
      const player = room.players.find(
        (entry) =>
          entry.id === parsed.data.playerId && entry.socketId === socket.id,
      )
      if (!player) {
        acknowledge?.({ ok: false })
        return
      }
      if (room.status === 'FINISHED') {
        player.connected = false
        delete player.socketId
        socket.leave(room.roomCode)
        await emitRoom(io, room)
        acknowledge?.({ ok: true })
        return
      }
      room.players = room.players.filter(
        (player) => player.id !== parsed.data.playerId,
      )
      if (room.gameState) {
        removePlayer(room.gameState, parsed.data.playerId)
        if (room.gameState.status === 'FINISHED') {
          room.status = 'FINISHED'
        }
      }
      socket.leave(room.roomCode)
      if (room.players.length === 0) {
        roomStore.delete(room.roomCode)
        await storage.deleteRoom(room.roomCode)
        acknowledge?.({ ok: true })
        return
      }
      if (room.hostPlayerId === parsed.data.playerId) {
        room.hostPlayerId = room.players[0]!.id
      }
      await emitRoom(io, room)
      acknowledge?.({ ok: true })
    },
  )

  socket.on(EVENTS.roomUpdateSettings, async (payload: unknown) => {
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
    if (!authorizeRoomPlayer(room, socket.id, parsed.data.playerId)) {
      sendError(socket.id, io, {
        code: 'PLAYER_NOT_FOUND',
        message: 'Socket is not authorized for this player.',
      })
      return
    }
    if (room.status !== 'LOBBY' || room.gameState) {
      sendError(socket.id, io, {
        code: 'GAME_ALREADY_STARTED',
        message: 'Cannot update settings after the game has started.',
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
    await emitRoom(io, room)
  })

  socket.on(EVENTS.gameStart, async (payload: unknown) => {
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
    if (!authorizeRoomPlayer(room, socket.id, parsed.data.playerId)) {
      sendError(socket.id, io, {
        code: 'PLAYER_NOT_FOUND',
        message: 'Socket is not authorized for this player.',
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
    if (room.status !== 'LOBBY' || room.gameState) {
      sendError(socket.id, io, {
        code: 'GAME_ALREADY_STARTED',
        message: 'This room has already started a game.',
      })
      return
    }
    room.gameState = createGameState(
      room.roomCode,
      room.settings,
      room.players.map((player) => ({ id: player.id, name: player.name })),
    )
    room.status = 'IN_GAME'
    await emitRoom(io, room)
  })

  socket.on(EVENTS.gamePlayCard, async (payload: unknown) => {
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
      if (!authorizeRoomPlayer(room, socket.id, parsed.data.playerId)) {
        sendError(socket.id, io, {
          code: 'PLAYER_NOT_FOUND',
          message: 'Socket is not authorized for this player.',
        })
        return
      }
      playCard(
        room.gameState,
        parsed.data.playerId,
        parsed.data.cardInstanceId,
        parsed.data.mode,
      )
      await emitRoom(io, room)
    } catch (caught) {
      sendError(socket.id, io, caught as GameError)
    }
  })

  socket.on(EVENTS.gameMove, async (payload: unknown) => {
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
      if (!authorizeRoomPlayer(room, socket.id, parsed.data.playerId)) {
        sendError(socket.id, io, {
          code: 'PLAYER_NOT_FOUND',
          message: 'Socket is not authorized for this player.',
        })
        return
      }
      movePlayer(room.gameState, parsed.data.playerId, parsed.data.targetHexId)
      if (room.gameState.status === 'FINISHED') {
        room.status = 'FINISHED'
      }
      await emitRoom(io, room)
    } catch (caught) {
      sendError(socket.id, io, caught as GameError)
    }
  })

  socket.on(EVENTS.gameBuyCard, async (payload: unknown) => {
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
      if (!authorizeRoomPlayer(room, socket.id, parsed.data.playerId)) {
        sendError(socket.id, io, {
          code: 'PLAYER_NOT_FOUND',
          message: 'Socket is not authorized for this player.',
        })
        return
      }
      buyCard(room.gameState, parsed.data.playerId, parsed.data.cardId)
      await emitRoom(io, room)
    } catch (caught) {
      sendError(socket.id, io, caught as GameError)
    }
  })

  socket.on(EVENTS.gameEndTurn, async (payload: unknown) => {
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
      if (!authorizeRoomPlayer(room, socket.id, parsed.data.playerId)) {
        sendError(socket.id, io, {
          code: 'PLAYER_NOT_FOUND',
          message: 'Socket is not authorized for this player.',
        })
        return
      }
      endTurn(room.gameState, parsed.data.playerId)
      await emitRoom(io, room)
    } catch (caught) {
      sendError(socket.id, io, caught as GameError)
    }
  })

  socket.on('disconnect', async () => {
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
      await emitRoom(io, room)
    }
  })
})

const port = Number(process.env.PORT ?? 3000)
await fastify.listen({ port, host: '0.0.0.0' })
