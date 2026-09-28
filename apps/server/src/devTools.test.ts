import { describe, expect, it } from 'vitest'
import type { GameState } from '../../../packages/shared/src/index.js'
import { addDevCard, devToolsEnabled } from './devTools.js'

const testGame = (): GameState =>
  ({
    status: 'ACTIVE',
    players: [{ id: 'player-1', hand: [] }],
  }) as unknown as GameState

describe('development card tools', () => {
  it('runs only for the npm dev server', () => {
    expect(
      devToolsEnabled({
        TRAVEL_GAME_DEV_TOOLS: '1',
        npm_lifecycle_event: 'dev',
      }),
    ).toBe(true)
    expect(
      devToolsEnabled({
        TRAVEL_GAME_DEV_TOOLS: '1',
        npm_lifecycle_event: 'start',
      }),
    ).toBe(false)
    expect(
      devToolsEnabled({
        TRAVEL_GAME_DEV_TOOLS: '1',
        npm_lifecycle_event: 'dev',
        NODE_ENV: 'production',
      }),
    ).toBe(false)
  })

  it('adds a real card to the chosen player hand', () => {
    const game = testGame()
    expect(addDevCard(game, 'player-1', 'explorer').name).toBe('Explorer')
    expect(game.players[0]?.hand).toEqual([
      { cardId: 'explorer', instanceId: expect.stringMatching(/^dev-/) },
    ])
  })

  it('rejects hidden and unknown cards', () => {
    const game = testGame()
    expect(() => addDevCard(game, 'player-1', 'hidden')).toThrow()
    expect(() => addDevCard(game, 'player-1', 'not-a-card')).toThrow()
    expect(game.players[0]?.hand).toHaveLength(0)
  })
})
