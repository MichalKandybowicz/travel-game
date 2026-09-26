import { z } from 'zod'
import { PLAYER_COLORS, PLAYER_SYMBOLS } from './playerAppearance.js'

export const mapSettingsSchema = z
  .object({
    seed: z.string().min(1),
    mapSize: z.enum(['SMALL', 'MEDIUM', 'LARGE']),
    difficulty: z.enum(['EASY', 'NORMAL', 'HARD']),
    routeCount: z.number().int().min(1).max(4),
    jungleDensity: z.number().min(0).max(0.8),
    waterDensity: z.number().min(0).max(0.6),
    mountainDensity: z.number().min(0).max(0.4),
    specialTileDensity: z.number().min(0).max(0.2),
    chokepointCount: z.number().int().min(0).max(6),
    allowSharedTiles: z.boolean().default(true),
    petalCount: z.number().int().min(1).max(12).default(3),
    campCountMinPerPetal: z.number().int().min(0).max(3).default(1),
    campCountMaxPerPetal: z.number().int().min(1).max(5).default(1),
    fogMode: z.enum(['NONE', 'PETAL', 'MEDIUM', 'FULL']).default('NONE'),
  })
  .refine(
    ({ campCountMinPerPetal, campCountMaxPerPetal }) =>
      campCountMinPerPetal <= campCountMaxPerPetal,
    {
      message:
        'Minimum camp count per petal cannot exceed the maximum camp count.',
      path: ['campCountMaxPerPetal'],
    },
  )

export const roomCreateSchema = z.object({
  playerName: z.string().min(1).max(24),
  settings: mapSettingsSchema,
  authToken: z.string().optional(),
  customMapId: z.string().optional(),
})

const terrainSchema = z.enum([
  'START',
  'GOAL',
  'JUNGLE',
  'WATER',
  'DESERT',
  'RUBBLE',
  'CAMP',
  'MOUNTAIN',
])

const hexTileSchema = z.object({
  id: z.string().min(1),
  q: z.number().int(),
  r: z.number().int(),
  terrain: terrainSchema,
  difficulty: z.number().int().min(0).max(5),
  isBlocked: z.boolean(),
  petalId: z.number().int().min(0).optional(),
  specialType: z.enum(['CHOKEPOINT', 'LOOP', 'CAMP']).optional(),
})

const mapAnalysisSchema = z.object({
  shortestPathLength: z.number(),
  routeCount: z.number(),
  junglePercent: z.number(),
  waterPercent: z.number(),
  desertPercent: z.number(),
  mountainPercent: z.number(),
  difficultyScore: z.number(),
})

export const customMapPayloadSchema = z.object({
  name: z.string().trim().min(1).max(40),
  settings: mapSettingsSchema,
  map: z.object({
    tiles: z.array(hexTileSchema).min(1).max(1500),
    petalCount: z.number().int().min(1).max(12).optional(),
    startHexId: z.string().min(1),
    startHexIds: z.array(z.string()).length(4),
    goalHexId: z.string().min(1),
    stats: mapAnalysisSchema,
  }),
})

export const roomJoinSchema = z.object({
  roomCode: z
    .string()
    .length(5)
    .transform((value) => value.toUpperCase()),
  playerName: z.string().min(1).max(24),
  playerId: z.string().optional(),
  sessionToken: z.string().optional(),
  authToken: z.string().optional(),
})

export const roomUpdateSettingsSchema = z.object({
  roomCode: z
    .string()
    .length(5)
    .transform((value) => value.toUpperCase()),
  playerId: z.string(),
  settings: mapSettingsSchema,
})

export const roomUpdateMapSchema = z.object({
  roomCode: z
    .string()
    .length(5)
    .transform((value) => value.toUpperCase()),
  playerId: z.string(),
  customMapId: z.string().min(1).optional(),
})

export const roomUpdateAppearanceSchema = z.object({
  roomCode: z
    .string()
    .length(5)
    .transform((value) => value.toUpperCase()),
  playerId: z.string(),
  color: z.enum(PLAYER_COLORS),
  symbol: z.enum(PLAYER_SYMBOLS),
})

export const roomUpdatePlayerNameSchema = z.object({
  roomCode: z
    .string()
    .length(5)
    .transform((value) => value.toUpperCase()),
  playerId: z.string(),
  playerName: z.string().trim().min(1).max(24),
})

export const roomReorderPlayersSchema = z.object({
  roomCode: z
    .string()
    .length(5)
    .transform((value) => value.toUpperCase()),
  playerId: z.string(),
  orderedPlayerIds: z.array(z.string()).min(1).max(4),
})

export const roomBotSchema = z.object({
  roomCode: z
    .string()
    .length(5)
    .transform((value) => value.toUpperCase()),
  playerId: z.string(),
  botId: z.string().optional(),
})

export const roomCodeSchema = z.object({
  roomCode: z
    .string()
    .length(5)
    .transform((value) => value.toUpperCase()),
  playerId: z.string(),
})

export const playCardSchema = z.object({
  roomCode: z
    .string()
    .length(5)
    .transform((value) => value.toUpperCase()),
  playerId: z.string(),
  cardInstanceId: z.string(),
  mode: z.enum(['MOVEMENT', 'GOLD']).default('MOVEMENT'),
  sacrifice: z.boolean().default(false),
})

export const useActionCardSchema = z.object({
  roomCode: z
    .string()
    .length(5)
    .transform((value) => value.toUpperCase()),
  playerId: z.string(),
  cardInstanceId: z.string(),
  targetPlayerId: z.string().optional(),
})

export const discardCardSchema = z.object({
  roomCode: z
    .string()
    .length(5)
    .transform((value) => value.toUpperCase()),
  playerId: z.string(),
  cardInstanceId: z.string(),
})

export const movePlayerSchema = z.object({
  roomCode: z
    .string()
    .length(5)
    .transform((value) => value.toUpperCase()),
  playerId: z.string(),
  targetHexId: z.string(),
})

export const chooseStartSchema = z.object({
  roomCode: z
    .string()
    .length(5)
    .transform((value) => value.toUpperCase()),
  playerId: z.string(),
  hexId: z.string(),
})

export const buyCardSchema = z.object({
  roomCode: z
    .string()
    .length(5)
    .transform((value) => value.toUpperCase()),
  playerId: z.string(),
  cardId: z.string(),
})

export const useTokenSchema = z.object({
  roomCode: z
    .string()
    .length(5)
    .transform((value) => value.toUpperCase()),
  playerId: z.string(),
  tokenInstanceId: z.string(),
  targetPlayerId: z.string().optional(),
})
