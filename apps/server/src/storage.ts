import { MongoClient, type Collection } from 'mongodb'
import type {
  GameState,
  MapSettings,
  RoomState,
  PlayerColor,
  PlayerSymbol,
} from '../../../packages/shared/src/index.js'

export interface RoomPlayerRecord {
  id: string
  name: string
  isBot?: boolean
  color?: PlayerColor
  symbol?: PlayerSymbol
  sessionTokenHash: string
  accountId?: string
  connected: boolean
  socketId?: string
}

export interface RoomRecord {
  id: string
  roomCode: string
  hostPlayerId: string
  players: RoomPlayerRecord[]
  settings: MapSettings
  status: RoomState['status']
  seed: string
  updatedAt: number
  gameState?: GameState
}

export interface AccountRecord {
  id: string
  username: string
  usernameKey: string
  passwordSalt: string
  passwordHash: string
  authTokenHash: string
}

export interface Storage {
  accounts: Collection<AccountRecord>
  loadRooms: () => Promise<RoomRecord[]>
  saveRoom: (room: RoomRecord) => Promise<void>
  deleteRoom: (roomCode: string) => Promise<void>
  close: () => Promise<void>
}

export async function connectStorage(url: string): Promise<Storage> {
  const client = new MongoClient(url, { serverSelectionTimeoutMS: 5000 })
  await client.connect()
  const db = client.db(process.env.MONGO_DB ?? 'travel_game')
  const rooms = db.collection<RoomRecord>('rooms')
  const accounts = db.collection<AccountRecord>('accounts')
  await Promise.all([
    rooms.createIndex({ roomCode: 1 }, { unique: true }),
    accounts.createIndex({ usernameKey: 1 }, { unique: true }),
    accounts.createIndex({ authTokenHash: 1 }),
  ])

  const pending = new Map<string, Promise<void>>()

  const enqueue = (roomCode: string, operation: () => Promise<void>) => {
    const previous = pending.get(roomCode) ?? Promise.resolve()
    const next = previous.catch(() => undefined).then(operation)
    pending.set(roomCode, next)
    void next
      .finally(() => {
        if (pending.get(roomCode) === next) {
          pending.delete(roomCode)
        }
      })
      .catch(() => undefined)
    return next
  }

  return {
    accounts,
    async loadRooms() {
      const documents = await rooms.find().toArray()
      return documents.map(({ _id, ...room }) => {
        void _id
        return {
          ...room,
          settings: {
            ...room.settings,
            difficulty:
              room.status === 'LOBBY' ? 'NORMAL' : room.settings.difficulty,
            routeCount: room.status === 'LOBBY' ? 1 : room.settings.routeCount,
            allowSharedTiles: room.settings.allowSharedTiles ?? true,
            petalCount: room.settings.petalCount ?? 1,
            campCountMinPerPetal: room.settings.campCountMinPerPetal ?? 1,
            campCountMaxPerPetal: room.settings.campCountMaxPerPetal ?? 1,
            fogMode: room.settings.fogMode ?? 'NONE',
          },
          players: room.players.map(({ socketId, ...player }) => {
            void socketId
            return {
              ...player,
              connected: player.isBot === true,
            }
          }),
          ...(room.gameState
            ? {
                gameState: {
                  ...room.gameState,
                  map: {
                    ...room.gameState.map,
                    tiles: room.gameState.map.tiles.map((tile) =>
                      (tile.terrain as string) === 'VILLAGE'
                        ? { ...tile, terrain: 'DESERT' as const }
                        : tile,
                    ),
                    stats: {
                      ...room.gameState.map.stats,
                      desertPercent:
                        room.gameState.map.stats.desertPercent ??
                        (
                          room.gameState.map
                            .stats as typeof room.gameState.map.stats & {
                            villagePercent?: number
                          }
                        ).villagePercent ??
                        0,
                    },
                  },
                  settings: {
                    ...room.gameState.settings,
                    allowSharedTiles:
                      room.gameState.settings.allowSharedTiles ?? true,
                    petalCount: room.gameState.settings.petalCount ?? 1,
                    campCountMinPerPetal:
                      room.gameState.settings.campCountMinPerPetal ?? 1,
                    campCountMaxPerPetal:
                      room.gameState.settings.campCountMaxPerPetal ?? 1,
                    fogMode: room.gameState.settings.fogMode ?? 'NONE',
                  },
                  roundPlayedCards: room.gameState.roundPlayedCards ?? [],
                  players: room.gameState.players.map((player) => ({
                    ...player,
                    connected: player.isBot === true,
                  })),
                },
              }
            : {}),
        }
      })
    },
    saveRoom(room) {
      const snapshot = structuredClone({
        ...room,
        updatedAt: Date.now(),
        players: room.players.map(({ socketId, ...player }) => {
          void socketId
          return player
        }),
      })
      room.updatedAt = snapshot.updatedAt
      return enqueue(room.roomCode, async () => {
        await rooms.replaceOne({ roomCode: room.roomCode }, snapshot, {
          upsert: true,
        })
      })
    },
    deleteRoom(roomCode) {
      return enqueue(roomCode, async () => {
        await rooms.deleteOne({ roomCode })
      })
    },
    close: () => client.close(),
  }
}
