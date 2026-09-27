import { describe, expect, it } from 'vitest'
import {
  canAffordMove,
  createGameState,
} from '../../../packages/game-engine/src/index.js'
import {
  CARD_BY_ID,
  type GameState,
  type HexTile,
  type PlayerState,
  type MapSettings,
} from '../../../packages/shared/src/index.js'
import {
  buildBotKnowledge,
  canReachWithHand,
  cardMovementFor,
  chooseBotStart,
  findBotRoute,
} from './botMovement.js'

const tile = (id: string, q: number, terrain: HexTile['terrain']): HexTile => ({
  id,
  q,
  r: 0,
  terrain,
  difficulty: terrain === 'START' ? 1 : 2,
  isBlocked: false,
})

describe('bot movement planning', () => {
  it('chooses the more promising start instead of the first free slot', () => {
    const first = tile('first', 0, 'START')
    const second = { ...tile('second', 0, 'START'), r: 1 }
    const expensive = tile('expensive', 1, 'WATER')
    expensive.difficulty = 4
    const affordable = {
      ...tile('affordable', 1, 'JUNGLE'),
      r: 1,
      difficulty: 1,
    }
    const goal = { ...tile('goal', 2, 'GOAL'), difficulty: 0 }
    const player = {
      id: 'bot',
      name: 'Bot',
      position: '',
      hand: [{ instanceId: 'explorer-test', cardId: 'explorer' }],
      drawPile: [],
      discardPile: [],
      removedCards: [],
      playedCards: [],
      availableMovement: { GREEN: 0, BLUE: 0, YELLOW: 0, WILD: 0 },
      availableGold: 0,
      isReady: true,
      connected: true,
    } satisfies PlayerState
    const game = {
      map: {
        tiles: [first, second, expensive, affordable, goal],
        startHexId: first.id,
        startHexIds: [first.id, second.id],
        goalHexId: goal.id,
      },
      settings: { allowSharedTiles: true },
      players: [player],
    } as unknown as GameState

    expect(chooseBotStart(game, player)).toBe(second.id)
  })

  it('does not expose hidden terrain, cost or blocked status to the bot planner', () => {
    const settings: MapSettings = {
      seed: 'BOT-FOG',
      mapSize: 'SMALL',
      segmentEdgeLength: 5,
      difficulty: 'EASY',
      routeCount: 1,
      jungleDensity: 0.4,
      waterDensity: 0.2,
      mountainDensity: 0.1,
      specialTileDensity: 0.05,
      chokepointCount: 1,
      allowSharedTiles: true,
      petalCount: 3,
      campCountMinPerPetal: 1,
      campCountMaxPerPetal: 1,
      fogMode: 'RANGE',
      terrainVisibilityRange: 2,
      costVisibilityRange: 1,
    }
    const game = createGameState('ABCDE', settings, [
      { id: 'bot', name: 'Bot' },
      { id: 'human', name: 'Human' },
    ])
    game.status = 'ACTIVE'
    game.players[0]!.position = game.map.startHexIds![0]!
    const knowledge = buildBotKnowledge(game, 'bot')
    const hidden = knowledge.map.tiles.find(
      (entry) => entry.terrain === 'UNKNOWN',
    )!
    expect(hidden).toBeDefined()
    const original = game.map.tiles.find((entry) => entry.id === hidden.id)!
    original.terrain = 'MOUNTAIN'
    original.difficulty = 0
    original.isBlocked = true
    const changedKnowledge = buildBotKnowledge(game, 'bot')
    expect(
      changedKnowledge.map.tiles.find((entry) => entry.id === hidden.id),
    ).toEqual(hidden)
    expect(changedKnowledge.map.goalHexId).toBe(knowledge.map.goalHexId)
    expect(
      findBotRoute(
        changedKnowledge,
        changedKnowledge.players.find((player) => player.id === 'bot')!,
      ).map((entry) => entry.id),
    ).toEqual(
      findBotRoute(
        knowledge,
        knowledge.players.find((player) => player.id === 'bot')!,
      ).map((entry) => entry.id),
    )
  })
  it('plays another color to pay the extra point from a movement curse', () => {
    const from = tile('start', 0, 'START')
    const target = tile('jungle', 1, 'JUNGLE')
    const player = {
      availableMovement: { GREEN: 2, BLUE: 0, YELLOW: 0, WILD: 1 },
      extraMoveCostPending: true,
      hand: [{ instanceId: 'coin-test', cardId: 'coin' }],
    } as PlayerState

    expect(canAffordMove(player, from, target)).toBe(false)
    expect(canReachWithHand(player, from, target)).toBe(true)
    expect(cardMovementFor(CARD_BY_ID.coin!, from, target, player)).toBe(2)
  })

  it('counts both colors of a mixed card when choosing a move', () => {
    const from = tile('jungle', 0, 'JUNGLE')
    const target = tile('water', 1, 'WATER')
    const player = {
      availableMovement: { GREEN: 0, BLUE: 0, YELLOW: 0, WILD: 0 },
      hand: [{ instanceId: 'mixed-test', cardId: 'river_grove' }],
    } as PlayerState

    expect(canReachWithHand(player, from, target)).toBe(true)
    expect(cardMovementFor(CARD_BY_ID.river_grove!, from, target, player)).toBe(
      4,
    )
  })

  it('prefers an affordable route over a shorter step the cursed bot cannot pay', () => {
    const start = tile('start', 0, 'START')
    const jungle = tile('jungle', 1, 'JUNGLE')
    jungle.difficulty = 1
    const water = { ...tile('water', 0, 'WATER'), r: 1 }
    const nextWater = { ...tile('next-water', 1, 'WATER'), r: 1 }
    const goal = tile('goal', 2, 'GOAL')
    goal.difficulty = 1
    const player = {
      id: 'bot',
      position: start.id,
      availableMovement: { GREEN: 0, BLUE: 0, YELLOW: 0, WILD: 0 },
      extraMoveCostPending: true,
      hand: [
        { instanceId: 'sailor-test', cardId: 'sailor' },
        { instanceId: 'coin-test', cardId: 'coin' },
      ],
    } as PlayerState
    const game = {
      map: {
        tiles: [start, jungle, water, nextWater, goal],
        goalHexId: goal.id,
      },
      settings: { allowSharedTiles: true },
      players: [player],
    } as GameState

    expect(canReachWithHand(player, start, jungle)).toBe(false)
    expect(canReachWithHand(player, start, water)).toBe(true)
    expect(findBotRoute(game, player)[0]?.id).toBe(water.id)
  })
})
