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
  getMoveRequirements,
  endTurn,
  movePlayer,
  playCard,
  removePlayer,
  serializePublicGameState,
  useToken as activateToken,
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

const logGameAction = (
  room: RoomRecord,
  playerId: string,
  action: string,
  details: Record<string, unknown> = {},
): void => {
  const game = room.gameState
  const player = room.players.find((entry) => entry.id === playerId)
  fastify.log.info(
    {
      event: 'game_action',
      action,
      roomCode: room.roomCode,
      playerId,
      playerName: player?.name,
      isBot: player?.isBot === true,
      turnNumber: game?.turnNumber,
      roundNumber: game?.roundNumber,
      currentPlayerId: game?.currentPlayerId,
      ...details,
    },
    `${player?.name ?? playerId}: ${action}`,
  )
}

const isGameError = (caught: unknown): caught is GameError =>
  typeof caught === 'object' &&
  caught !== null &&
  'code' in caught &&
  'message' in caught

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

const cardMovementFor = (
  card: CardDefinition,
  from: HexTile,
  target: HexTile,
): number => {
  const requirements = getMoveRequirements(from, target)
  if (
    requirements.some(
      (requirement) =>
        requirement.type === 'ANY' || card.movementType === requirement.type,
    ) ||
    card.movementType === 'WILD'
  ) {
    return card.movementValue
  }
  return 0
}

const cardPlanScore = (
  card: CardDefinition,
  from: HexTile,
  target: HexTile,
): number => cardMovementFor(card, from, target) * 10 + card.goldValue

const movementForTarget = (
  movement: MovementPool,
  from: HexTile,
  target: HexTile,
): number => {
  const requirements = getMoveRequirements(from, target)
  if (requirements.length === 0) return 0
  if (requirements.some((requirement) => requirement.type === 'ANY')) {
    return Object.values(movement).reduce((sum, value) => sum + value, 0)
  }
  return Math.min(
    requirements.reduce(
      (sum, requirement) =>
        sum +
        (requirement.type === 'ANY' ? 0 : movement[requirement.type]) +
        movement.WILD,
      0,
    ),
    Object.values(movement).reduce((sum, value) => sum + value, 0),
  )
}

const chooseBotPurchase = (
  game: GameState,
  player: PlayerState,
  from: HexTile,
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
        cardPlanScore(right, from, target) -
        right.purchaseCost -
        (cardPlanScore(left, from, target) - left.purchaseCost),
    )[0]
}

const chooseBotGoldCard = (
  player: PlayerState,
  from: HexTile,
  target: HexTile,
): CardInstance | undefined => {
  const upcoming = player.drawPile
    .slice(0, 4)
    .map((card) => CARD_BY_ID[card.cardId])
    .filter((card): card is CardDefinition => Boolean(card))
  const weakestUpcomingScore = upcoming.length
    ? Math.max(...upcoming.map((card) => cardPlanScore(card, from, target)))
    : 0

  const candidates = player.hand
    .map((card) => ({ card, definition: CARD_BY_ID[card.cardId] }))
    .filter(
      (entry): entry is { card: CardInstance; definition: CardDefinition } =>
        Boolean(entry.definition),
    )
    .sort((left, right) => {
      const leftScore = cardPlanScore(left.definition, from, target)
      const rightScore = cardPlanScore(right.definition, from, target)
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
    const score = cardPlanScore(entry.definition, from, target)
    return score === 0 || weakestUpcomingScore > score
  })
  if (replaceable) return replaceable.card

  const possibleMovement =
    movementForTarget(player.availableMovement, from, target) +
    candidates.reduce(
      (sum, entry) => sum + cardMovementFor(entry.definition, from, target),
      0,
    )
  const requiredMovement = getMoveRequirements(from, target).reduce(
    (sum, requirement) => sum + requirement.amount,
    0,
  )
  if (player.hand.length >= 4 && possibleMovement < requiredMovement) {
    return candidates[0]?.card
  }
  return undefined
}

const chooseBotToken = (
  game: GameState,
  player: PlayerState,
  from: HexTile,
  target: HexTile,
): { tokenInstanceId: string; targetPlayerId?: string } | undefined => {
  if (
    player.tokenUsedInRound === (game.roundNumber ?? 1) ||
    !player.tokens?.length
  ) {
    return undefined
  }

  const requiredMovement = getMoveRequirements(from, target).reduce(
    (sum, requirement) => sum + requirement.amount,
    0,
  )
  const currentMovement = movementForTarget(
    player.availableMovement,
    from,
    target,
  )
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
      currentMovement + movementForTarget(bonusPool, from, target) >=
        requiredMovement
    )
  })
  if (movementToken) return { tokenInstanceId: movementToken.instanceId }

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
  if (goldToken) return { tokenInstanceId: goldToken.token.instanceId }

  const possibleMovement =
    currentMovement +
    player.hand.reduce(
      (sum, card) =>
        sum + cardMovementFor(CARD_BY_ID[card.cardId]!, from, target),
      0,
    )
  if (possibleMovement < requiredMovement) {
    const drawToken = player.tokens.find((token) => token.type === 'DRAW_CARD')
    if (drawToken) return { tokenInstanceId: drawToken.instanceId }
    const swapToken = player.tokens.find((token) => token.type === 'SWAP_HAND')
    if (swapToken && player.hand.length > 0) {
      return { tokenInstanceId: swapToken.instanceId }
    }
  }

  if (!chooseBotPurchase(game, player, from, target)) {
    const refreshToken = player.tokens.find(
      (token) => token.type === 'REFRESH_MARKET',
    )
    if (refreshToken) return { tokenInstanceId: refreshToken.instanceId }
  }

  const skipToken = player.tokens.find(
    (token) => token.type === 'CURSE_SKIP_LEADER',
  )
  if (skipToken) return { tokenInstanceId: skipToken.instanceId }

  const removableTarget = game.players.find(
    (opponent) =>
      opponent.id !== player.id &&
      opponent.drawPile.length + opponent.discardPile.length > 0,
  )
  const removeToken = player.tokens.find(
    (token) => token.type === 'CURSE_REMOVE_CARD',
  )
  if (removeToken && removableTarget) {
    return {
      tokenInstanceId: removeToken.instanceId,
      targetPlayerId: removableTarget.id,
    }
  }

  const marketCurse = player.tokens.find(
    (token) => token.type === 'CURSE_MARKET',
  )
  if (marketCurse && !game.marketLockedUntilPlayerId) {
    return { tokenInstanceId: marketCurse.instanceId }
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
        logGameAction(room, bot.id, 'choose_start', { hexId })
        await emitRoom(io, room)
        continue
      }

      const player = game.players.find((entry) => entry.id === bot.id)!
      const currentTile = game.map.tiles.find(
        (tile) => tile.id === player.position,
      )!
      const target = findBotRoute(game, player)[0]
      if (!target) {
        endTurn(game, bot.id)
        logGameAction(room, bot.id, 'end_turn', {
          reason: 'no_route_to_goal',
        })
        await emitRoom(io, room)
        continue
      }
      const legalMove = canAffordMove(player, currentTile, target)

      if (legalMove) {
        movePlayer(game, bot.id, target.id)
        logGameAction(room, bot.id, 'move', {
          targetHexId: target.id,
          terrain: target.terrain,
          difficulty: target.difficulty,
        })
        if (game.winnerId) room.status = 'FINISHED'
        await emitRoom(io, room)
        continue
      }

      const tokenChoice = chooseBotToken(game, player, currentTile, target)
      if (tokenChoice) {
        activateToken(
          game,
          bot.id,
          tokenChoice.tokenInstanceId,
          tokenChoice.targetPlayerId,
        )
        logGameAction(room, bot.id, 'use_token', tokenChoice)
        await emitRoom(io, room)
        continue
      }

      if (!player.hasBoughtThisTurn && !game.marketLockedUntilPlayerId) {
        const purchase = chooseBotPurchase(game, player, currentTile, target)
        if (purchase && purchase.purchaseCost <= player.availableGold) {
          buyCard(game, bot.id, purchase.id)
          logGameAction(room, bot.id, 'buy_card', {
            cardId: purchase.id,
            purchaseCost: purchase.purchaseCost,
          })
          await emitRoom(io, room)
          continue
        }
      }

      const plannedMovement =
        movementForTarget(player.availableMovement, currentTile, target) +
        player.hand.reduce(
          (sum, card) =>
            sum +
            cardMovementFor(CARD_BY_ID[card.cardId]!, currentTile, target),
          0,
        )
      const requiredMovement = getMoveRequirements(currentTile, target).reduce(
        (sum, requirement) => sum + requirement.amount,
        0,
      )
      const movementCard =
        plannedMovement >= requiredMovement
          ? player.hand
              .filter((card) => {
                const definition = CARD_BY_ID[card.cardId]
                return (
                  definition &&
                  cardMovementFor(definition, currentTile, target) > 0
                )
              })
              .sort(
                (left, right) =>
                  cardMovementFor(
                    CARD_BY_ID[right.cardId]!,
                    currentTile,
                    target,
                  ) -
                  cardMovementFor(
                    CARD_BY_ID[left.cardId]!,
                    currentTile,
                    target,
                  ),
              )[0]
          : undefined
      if (movementCard) {
        playCard(game, bot.id, movementCard.instanceId, 'MOVEMENT')
        logGameAction(room, bot.id, 'play_card', {
          cardId: movementCard.cardId,
          mode: 'MOVEMENT',
        })
        await emitRoom(io, room)
        continue
      }

      const goldCard = chooseBotGoldCard(player, currentTile, target)
      if (goldCard) {
        playCard(game, bot.id, goldCard.instanceId, 'GOLD')
        logGameAction(room, bot.id, 'play_card', {
          cardId: goldCard.cardId,
          mode: 'GOLD',
        })
        await emitRoom(io, room)
        continue
      }
      endTurn(game, bot.id)
      logGameAction(room, bot.id, 'end_turn', {
        reason: game.marketLockedUntilPlayerId
          ? 'market_locked_and_no_other_action'
          : 'no_other_action',
      })
      await emitRoom(io, room)
    }
    fastify.log.error({ roomCode: room.roomCode }, 'Bot action limit reached')
  } finally {
    botRooms.delete(room.roomCode)
  }
}

const scheduleBotTurns = (io: Server, room: RoomRecord): void => {
  setTimeout(() => {
    void runBotTurns(io, room).catch(async (caught: unknown) => {
      const game = room.gameState
      const bot = game
        ? room.players.find(
            (player) => player.id === game.currentPlayerId && player.isBot,
          )
        : undefined
      if (game && bot && game.status === 'ACTIVE' && isGameError(caught)) {
        fastify.log.warn(
          {
            event: 'bot_action_recovered',
            roomCode: room.roomCode,
            playerId: bot.id,
            errorCode: caught.code,
            errorMessage: caught.message,
          },
          'Bot action failed; ending its turn to keep the game moving',
        )
        endTurn(game, bot.id)
        logGameAction(room, bot.id, 'end_turn', {
          reason: 'recovered_from_error',
          errorCode: caught.code,
        })
        await emitRoom(io, room)
        scheduleBotTurns(io, room)
        return
      }
      fastify.log.error(
        { err: caught, roomCode: room.roomCode },
        'Bot turn failed',
      )
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
    logGameAction(room, parsed.data.playerId, 'start_game', {
      players: room.players.map((player) => ({
        id: player.id,
        name: player.name,
        isBot: player.isBot === true,
      })),
      seed: room.settings.seed,
    })
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
      logGameAction(room, parsed.data.playerId, 'choose_start', {
        hexId: parsed.data.hexId,
      })
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
        parsed.data.sacrifice,
      )
      logGameAction(room, parsed.data.playerId, 'play_card', {
        cardInstanceId: parsed.data.cardInstanceId,
        cardId: room.gameState.roundPlayedCards.at(-1)?.cardId,
        mode: parsed.data.mode,
        sacrifice: parsed.data.sacrifice,
      })
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
      const targetTile = room.gameState.map.tiles.find(
        (tile) => tile.id === parsed.data.targetHexId,
      )
      logGameAction(room, parsed.data.playerId, 'move', {
        targetHexId: parsed.data.targetHexId,
        terrain: targetTile?.terrain,
        difficulty: targetTile?.difficulty,
        tokenCount:
          room.gameState.players.find(
            (player) => player.id === parsed.data.playerId,
          )?.tokens?.length ?? 0,
      })
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
      logGameAction(room, parsed.data.playerId, 'buy_card', {
        cardId: parsed.data.cardId,
        purchaseCost: CARD_BY_ID[parsed.data.cardId]?.purchaseCost,
      })
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
      activateToken(
        room.gameState,
        parsed.data.playerId,
        parsed.data.tokenInstanceId,
        parsed.data.targetPlayerId,
      )
      logGameAction(room, parsed.data.playerId, 'use_token', {
        tokenInstanceId: parsed.data.tokenInstanceId,
        targetPlayerId: parsed.data.targetPlayerId,
      })
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
      logGameAction(room, parsed.data.playerId, 'end_turn', {
        nextPlayerId: room.gameState.currentPlayerId,
      })
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
