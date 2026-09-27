import { describe, expect, it } from 'vitest'
import { canAffordMove } from '../../../packages/game-engine/src/index.js'
import {
  CARD_BY_ID,
  type GameState,
  type HexTile,
  type PlayerState,
} from '../../../packages/shared/src/index.js'
import {
  canReachWithHand,
  cardMovementFor,
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
