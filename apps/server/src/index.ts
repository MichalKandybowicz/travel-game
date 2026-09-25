import cors from '@fastify/cors'
import Fastify from 'fastify'
import { randomUUID } from 'node:crypto'
import { MongoServerError } from 'mongodb'
import { Server, type Socket } from 'socket.io'
import { z } from 'zod'
import {
  buyCard,
  chooseStart,
  createGameState,
  canAffordMove,
  getTerrainCost,
  endTurn,
  movePlayer,
  playCard,
  removePlayer,
  serializePublicGameState,
  useToken,
} from '../../../packages/game-engine/src/index.js'
import {
  axialDistance,
  generateMap,
  getNeighbors,
} from '../../../packages/map-generator/src/index.js'
import {
  EVENTS,
  CARD_BY_ID,
  TOKEN_BY_TYPE,
  PLAYER_COLORS,
  PLAYER_SYMBOLS,
  roomCodeSchema,
  roomCreateSchema,
  roomJoinSchema,
  roomUpdateSettingsSchema,
  roomUpdateAppearanceSchema,
  roomUpdatePlayerNameSchema,
  roomBotSchema,
  playCardSchema,
  movePlayerSchema,
  buyCardSchema,
  useTokenSchema,
  chooseStartSchema,
  type GameError,
  type CardDefinition,
  type CardInstance,
  type GameState,
  type HexTile,
  type MovementPool,
  type PlayerState,
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
    ...(player.isBot ? { isBot: true } : {}),
    ...(player.color ? { color: player.color } : {}),
    ...(player.symbol ? { symbol: player.symbol } : {}),
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

const botRooms = new Set<string>()

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

const findBotRoute = (game: GameState, player: PlayerState): HexTile[] => {
  const start = game.map.tiles.find((tile) => tile.id === player.position)
  const goal = game.map.tiles.find((tile) => tile.id === game.map.goalHexId)
  if (!start || !goal) return []

  const queue = [start]
  const previous = new Map<string, string>()
  const visited = new Set([start.id])
  while (queue.length > 0) {
    const tile = queue.shift()!
    if (tile.id === goal.id) break
    const neighbors = getNeighbors(game.map.tiles, tile)
      .filter(
        (neighbor) =>
          !neighbor.isBlocked &&
          neighbor.terrain !== 'MOUNTAIN' &&
          (game.settings.allowSharedTiles ||
            neighbor.id === goal.id ||
            !game.players.some(
              (other) =>
                other.id !== player.id && other.position === neighbor.id,
            )),
      )
      .sort(
        (left, right) => axialDistance(left, goal) - axialDistance(right, goal),
      )
    for (const neighbor of neighbors) {
      if (visited.has(neighbor.id)) continue
      visited.add(neighbor.id)
      previous.set(neighbor.id, tile.id)
      queue.push(neighbor)
    }
  }
  if (!visited.has(goal.id)) return []

  const route: HexTile[] = []
  let id = goal.id
  while (id !== start.id) {
    const tile = game.map.tiles.find((candidate) => candidate.id === id)
    const parent = previous.get(id)
    if (!tile || !parent) return []
    route.unshift(tile)
    id = parent
  }
  return route
}

const cardMovementFor = (card: CardDefinition, target: HexTile): number => {
  const costType = getTerrainCost(target.terrain, target.difficulty)
  if (costType === 'BLOCKED') return 0
  if (
    costType === 'ANY' ||
    card.movementType === costType ||
    card.movementType === 'WILD'
  ) {
    return card.movementValue
  }
  return 0
}

const cardPlanScore = (card: CardDefinition, target: HexTile): number =>
  cardMovementFor(card, target) * 10 + card.goldValue

const movementForTarget = (movement: MovementPool, target: HexTile): number => {
  const costType = getTerrainCost(target.terrain, target.difficulty)
  if (costType === 'BLOCKED') return 0
  if (costType === 'ANY') {
    return Object.values(movement).reduce((sum, value) => sum + value, 0)
  }
  return movement[costType] + movement.WILD
}

const chooseBotPurchase = (
  game: GameState,
  player: PlayerState,
  target: HexTile,
): CardDefinition | undefined => {
  const possibleGold =
    player.availableGold +
    player.hand.reduce(
      (sum, card) => sum + (CARD_BY_ID[card.cardId]?.goldValue ?? 0),
      0,
    )
  return game.market
    .map((cardId) => CARD_BY_ID[cardId])
    .filter((card): card is CardDefinition => Boolean(card))
    .filter((card) => card.purchaseCost <= possibleGold)
    .sort(
      (left, right) =>
        cardPlanScore(right, target) -
        right.purchaseCost -
        (cardPlanScore(left, target) - left.purchaseCost),
    )[0]
}

const chooseBotGoldCard = (
  player: PlayerState,
  target: HexTile,
): CardInstance | undefined => {
  const upcoming = player.drawPile
    .slice(0, 4)
    .map((card) => CARD_BY_ID[card.cardId])
    .filter((card): card is CardDefinition => Boolean(card))
  const weakestUpcomingScore = upcoming.length
    ? Math.max(...upcoming.map((card) => cardPlanScore(card, target)))
    : 0

  const candidates = player.hand
    .map((card) => ({ card, definition: CARD_BY_ID[card.cardId] }))
    .filter(
      (entry): entry is { card: CardInstance; definition: CardDefinition } =>
        Boolean(entry.definition),
    )
    .sort((left, right) => {
      const leftScore = cardPlanScore(left.definition, target)
      const rightScore = cardPlanScore(right.definition, target)
      const leftReplaceable =
        leftScore === 0 || weakestUpcomingScore > leftScore ? 0 : 1
      const rightReplaceable =
        rightScore === 0 || weakestUpcomingScore > rightScore ? 0 : 1
      return (
        leftReplaceable - rightReplaceable ||
        leftScore - rightScore ||
        right.definition.goldValue - left.definition.goldValue
      )
    })
  const replaceable = candidates.find((entry) => {
    const score = cardPlanScore(entry.definition, target)
    return score === 0 || weakestUpcomingScore > score
  })
  if (replaceable) return replaceable.card

  const possibleMovement =
    movementForTarget(player.availableMovement, target) +
    candidates.reduce(
      (sum, entry) => sum + cardMovementFor(entry.definition, target),
      0,
    )
  const requiredMovement = Math.max(1, target.difficulty)
  if (player.hand.length >= 4 && possibleMovement < requiredMovement) {
    return candidates[0]?.card
  }
  return undefined
}

const chooseBotToken = (
  game: GameState,
  player: PlayerState,
  target: HexTile,
): string | undefined => {
  if (
    player.tokenUsedInRound === (game.roundNumber ?? 1) ||
    !player.tokens?.length
  ) {
    return undefined
  }

  const requiredMovement = Math.max(1, target.difficulty)
  const currentMovement = movementForTarget(player.availableMovement, target)
  const movementToken = player.tokens.find((token) => {
    const effect = TOKEN_BY_TYPE[token.type].effect
    if (effect.kind !== 'MOVEMENT') return false
    const bonusPool: MovementPool = {
      GREEN: 0,
      BLUE: 0,
      YELLOW: 0,
      WILD: 0,
    }
    bonusPool[effect.movementType] = effect.value
    return (
      currentMovement < requiredMovement &&
      currentMovement + movementForTarget(bonusPool, target) >= requiredMovement
    )
  })
  if (movementToken) return movementToken.instanceId

  const goldToken = player.tokens
    .map((token) => ({ token, effect: TOKEN_BY_TYPE[token.type].effect }))
    .filter(
      (
        entry,
      ): entry is {
        token: (typeof player.tokens)[number]
        effect: { kind: 'GOLD'; value: 1 | 2 }
      } => entry.effect.kind === 'GOLD',
    )
    .sort((left, right) => left.effect.value - right.effect.value)
    .find(({ effect }) =>
      game.market.some((cardId) => {
        const card = CARD_BY_ID[cardId]
        return (
          card &&
          card.purchaseCost > player.availableGold &&
          card.purchaseCost <= player.availableGold + effect.value
        )
      }),
    )
  if (goldToken) return goldToken.token.instanceId

  const possibleMovement =
    currentMovement +
    player.hand.reduce(
      (sum, card) =>
        sum + cardMovementFor(CARD_BY_ID[card.cardId]!, target),
      0,
    )
  if (possibleMovement < requiredMovement) {
    const drawToken = player.tokens.find(
      (token) => token.type === 'DRAW_CARD',
    )
    if (drawToken) return drawToken.instanceId
    const swapToken = player.tokens.find(
      (token) => token.type === 'SWAP_HAND',
    )
    if (swapToken && player.hand.length > 0) return swapToken.instanceId
  }

  if (!chooseBotPurchase(game, player, target)) {
    return player.tokens.find((token) => token.type === 'REFRESH_MARKET')
      ?.instanceId
  }
  return undefined
}

const runBotTurns = async (io: Server, room: RoomRecord): Promise<void> => {
  if (botRooms.has(room.roomCode)) return
  botRooms.add(room.roomCode)
  try {
    for (let action = 0; action < 60; action += 1) {
      const game = room.gameState
      if (!game || game.status === 'FINISHED') return
      const bot = room.players.find(
        (player) => player.id === game.currentPlayerId && player.isBot,
      )
      if (!bot) return

      await wait(350)
      if (game.status === 'CHOOSING_START') {
        const startIds = game.map.startHexIds ?? [game.map.startHexId]
        const hexId = startIds.find(
          (id) => !game.players.some((player) => player.position === id),
        )
        if (!hexId) return
        chooseStart(game, bot.id, hexId)
        await emitRoom(io, room)
        continue
      }

      const player = game.players.find((entry) => entry.id === bot.id)!
      const target = findBotRoute(game, player)[0]
      if (!target) {
        endTurn(game, bot.id)
        await emitRoom(io, room)
        continue
      }
      const legalMove = canAffordMove(player, target)

      if (legalMove) {
        movePlayer(game, bot.id, target.id)
        if (game.winnerId) room.status = 'FINISHED'
        await emitRoom(io, room)
        continue
      }

      const tokenId = chooseBotToken(game, player, target)
      if (tokenId) {
        useToken(game, bot.id, tokenId)
        await emitRoom(io, room)
        continue
      }

      if (!player.hasBoughtThisTurn) {
        const purchase = chooseBotPurchase(game, player, target)
        if (purchase && purchase.purchaseCost <= player.availableGold) {
          buyCard(game, bot.id, purchase.id)
          await emitRoom(io, room)
          continue
        }
      }

      const plannedMovement =
        movementForTarget(player.availableMovement, target) +
        player.hand.reduce(
          (sum, card) =>
            sum + cardMovementFor(CARD_BY_ID[card.cardId]!, target),
          0,
        )
      const movementCard =
        plannedMovement >= Math.max(1, target.difficulty)
          ? player.hand
              .filter((card) => {
                const definition = CARD_BY_ID[card.cardId]
                return definition && cardMovementFor(definition, target) > 0
              })
              .sort(
                (left, right) =>
                  cardMovementFor(CARD_BY_ID[right.cardId]!, target) -
                  cardMovementFor(CARD_BY_ID[left.cardId]!, target),
              )[0]
          : undefined
      if (movementCard) {
        playCard(game, bot.id, movementCard.instanceId, 'MOVEMENT')
        await emitRoom(io, room)
        continue
      }

      const goldCard = chooseBotGoldCard(player, target)
      if (goldCard) {
        playCard(game, bot.id, goldCard.instanceId, 'GOLD')
        await emitRoom(io, room)
        continue
      }
      endTurn(game, bot.id)
      await emitRoom(io, room)
    }
    fastify.log.error({ roomCode: room.roomCode }, 'Bot action limit reached')
  } finally {
    botRooms.delete(room.roomCode)
  }
}

const scheduleBotTurns = (io: Server, room: RoomRecord): void => {
  setTimeout(() => {
    void runBotTurns(io, room).catch((caught: unknown) => {
      fastify.log.error(caught, 'Bot turn failed')
    })
  }, 0)
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
          color: PLAYER_COLORS[0],
          symbol: PLAYER_SYMBOLS[0],
          sessionTokenHash: hashToken(sessionToken),
          ...(account ? { accountId: account.id } : {}),
          connected: true,
          socketId: socket.id,
        },
      ],
      settings: {
        ...parsed.data.settings,
        difficulty: 'NORMAL',
        routeCount: 1,
      },
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
        color:
          PLAYER_COLORS.find((color) =>
            room.players.every((entry) => entry.color !== color),
          ) ?? PLAYER_COLORS[0],
        symbol: PLAYER_SYMBOLS[room.players.length % PLAYER_SYMBOLS.length]!,
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
    room.settings = {
      ...parsed.data.settings,
      difficulty: 'NORMAL',
      routeCount: 1,
    }
    room.seed = parsed.data.settings.seed
    await emitRoom(io, room)
  })

  socket.on(EVENTS.roomUpdateAppearance, async (payload: unknown) => {
    const parsed = roomUpdateAppearanceSchema.safeParse(payload)
    if (!parsed.success) {
      sendError(socket.id, io, {
        code: 'INVALID_ACTION',
        message: parsed.error.message,
      })
      return
    }
    const room = roomStore.get(parsed.data.roomCode)
    if (!room || room.status !== 'LOBBY') {
      sendError(socket.id, io, {
        code: 'ROOM_NOT_FOUND',
        message: 'The waiting room is no longer available.',
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
    if (
      room.players.some(
        (player) =>
          player.id !== parsed.data.playerId &&
          player.color === parsed.data.color,
      )
    ) {
      sendError(socket.id, io, {
        code: 'INVALID_ACTION',
        message: 'This color is already taken.',
      })
      return
    }
    const player = room.players.find(
      (entry) => entry.id === parsed.data.playerId,
    )!
    player.color = parsed.data.color
    player.symbol = parsed.data.symbol
    await emitRoom(io, room)
  })

  socket.on(EVENTS.roomUpdatePlayerName, async (payload: unknown) => {
    const parsed = roomUpdatePlayerNameSchema.safeParse(payload)
    if (!parsed.success) {
      sendError(socket.id, io, {
        code: 'INVALID_ACTION',
        message: parsed.error.message,
      })
      return
    }
    const room = roomStore.get(parsed.data.roomCode)
    if (!room || room.status !== 'LOBBY') {
      sendError(socket.id, io, {
        code: 'ROOM_NOT_FOUND',
        message: 'The waiting room is no longer available.',
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
    const player = room.players.find(
      (entry) => entry.id === parsed.data.playerId,
    )!
    player.name = parsed.data.playerName
    await emitRoom(io, room)
  })

  socket.on(EVENTS.roomAddBot, async (payload: unknown) => {
    const parsed = roomBotSchema.safeParse(payload)
    if (!parsed.success) {
      sendError(socket.id, io, {
        code: 'INVALID_ACTION',
        message: parsed.error.message,
      })
      return
    }
    const room = roomStore.get(parsed.data.roomCode)
    if (!room || room.status !== 'LOBBY' || room.gameState) {
      sendError(socket.id, io, {
        code: 'ROOM_NOT_FOUND',
        message: 'The waiting room is no longer available.',
      })
      return
    }
    if (
      !authorizeRoomPlayer(room, socket.id, parsed.data.playerId) ||
      room.hostPlayerId !== parsed.data.playerId
    ) {
      sendError(socket.id, io, {
        code: 'INVALID_ACTION',
        message: 'Only the host can add bots.',
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
    const botNumber = room.players.filter((player) => player.isBot).length + 1
    const color =
      PLAYER_COLORS.find((candidate) =>
        room.players.every((player) => player.color !== candidate),
      ) ?? PLAYER_COLORS[room.players.length % PLAYER_COLORS.length]!
    room.players.push({
      id: `bot-${randomUUID()}`,
      name: `Bot ${botNumber}`,
      isBot: true,
      color,
      symbol: PLAYER_SYMBOLS[room.players.length % PLAYER_SYMBOLS.length]!,
      sessionTokenHash: '',
      connected: true,
    })
    await emitRoom(io, room)
  })

  socket.on(EVENTS.roomRemoveBot, async (payload: unknown) => {
    const parsed = roomBotSchema.safeParse(payload)
    if (!parsed.success || !parsed.data.botId) {
      sendError(socket.id, io, {
        code: 'INVALID_ACTION',
        message: parsed.success ? 'Bot id is required.' : parsed.error.message,
      })
      return
    }
    const room = roomStore.get(parsed.data.roomCode)
    if (!room || room.status !== 'LOBBY' || room.gameState) {
      sendError(socket.id, io, {
        code: 'ROOM_NOT_FOUND',
        message: 'The waiting room is no longer available.',
      })
      return
    }
    if (
      !authorizeRoomPlayer(room, socket.id, parsed.data.playerId) ||
      room.hostPlayerId !== parsed.data.playerId
    ) {
      sendError(socket.id, io, {
        code: 'INVALID_ACTION',
        message: 'Only the host can remove bots.',
      })
      return
    }
    const bot = room.players.find(
      (player) => player.id === parsed.data.botId && player.isBot,
    )
    if (!bot) {
      sendError(socket.id, io, {
        code: 'PLAYER_NOT_FOUND',
        message: 'Bot was not found.',
      })
      return
    }
    room.players = room.players.filter((player) => player !== bot)
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
    room.settings = { ...room.settings, difficulty: 'NORMAL', routeCount: 1 }
    room.gameState = createGameState(
      room.roomCode,
      room.settings,
      room.players.map((player) => ({
        id: player.id,
        name: player.name,
        ...(player.isBot ? { isBot: true } : {}),
        ...(player.color ? { color: player.color } : {}),
        ...(player.symbol ? { symbol: player.symbol } : {}),
      })),
    )
    room.status = 'IN_GAME'
    await emitRoom(io, room)
    scheduleBotTurns(io, room)
  })

  socket.on(EVENTS.gameChooseStart, async (payload: unknown) => {
    const parsed = chooseStartSchema.safeParse(payload)
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
    if (!authorizeRoomPlayer(room, socket.id, parsed.data.playerId)) {
      sendError(socket.id, io, {
        code: 'PLAYER_NOT_FOUND',
        message: 'Socket is not authorized for this player.',
      })
      return
    }
    try {
      chooseStart(room.gameState, parsed.data.playerId, parsed.data.hexId)
      await emitRoom(io, room)
      scheduleBotTurns(io, room)
    } catch (caught) {
      sendError(socket.id, io, caught as GameError)
    }
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
      scheduleBotTurns(io, room)
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
      scheduleBotTurns(io, room)
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
      scheduleBotTurns(io, room)
    } catch (caught) {
      sendError(socket.id, io, caught as GameError)
    }
  })

  socket.on(EVENTS.gameUseToken, async (payload: unknown) => {
    const parsed = useTokenSchema.safeParse(payload)
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
      useToken(
        room.gameState,
        parsed.data.playerId,
        parsed.data.tokenInstanceId,
      )
      await emitRoom(io, room)
      scheduleBotTurns(io, room)
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
      scheduleBotTurns(io, room)
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
