import { describe, expect, it } from 'vitest'
import type { GameState, HexTile, MapSettings } from '../../shared/src/index.js'
import { CARD_BY_ID } from '../../shared/src/index.js'
import {
  buyCard,
  createGameState,
  endTurn,
  movePlayer,
  playCard,
} from './GameEngine.js'

const settings: MapSettings = {
  seed: 'ARENA-42',
  mapSize: 'SMALL',
  difficulty: 'EASY',
  routeCount: 2,
  jungleDensity: 0.45,
  waterDensity: 0.15,
  mountainDensity: 0.1,
  specialTileDensity: 0.05,
  chokepointCount: 1,
}

const buildTestGame = (): GameState =>
  createGameState('ABCDE', settings, [
    { id: 'p1', name: 'Player 1' },
    { id: 'p2', name: 'Player 2' },
  ])

const findReachableTile = (
  game: GameState,
  terrain: HexTile['terrain'],
): HexTile => {
  const player = game.players[0]!
  const current = game.map.tiles.find((tile) => tile.id === player.position)!
  return game.map.tiles.find((tile) => {
    if (tile.terrain !== terrain) {
      return false
    }
    const distance = Math.max(
      Math.abs(tile.q - current.q),
      Math.abs(tile.r - current.r),
      Math.abs(-(tile.q + tile.r) + (current.q + current.r)),
    )
    return distance === 1
  })!
}

describe('GameEngine', () => {
  it('reshuffles the discard pile when the draw pile is empty at end of turn', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    player.drawPile = []
    player.discardPile = [...player.hand]
    player.hand = []

    endTurn(game, 'p1')

    expect(player.hand).toHaveLength(4)
  })

  it('moves only when the correct movement is available', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    const greenCard = player.hand.find(
      (card) => CARD_BY_ID[card.cardId]?.movementType === 'GREEN',
    )!
    playCard(game, 'p1', greenCard.instanceId)
    const target = findReachableTile(game, 'JUNGLE')
    target.difficulty = 1
    target.isBlocked = false

    movePlayer(game, 'p1', target.id)

    expect(player.position).toBe(target.id)
  })

  it('allows buying cards when enough gold is available', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    const coinCards = player.hand.filter((card) => card.cardId === 'coin')
    for (const card of coinCards) {
      playCard(game, 'p1', card.instanceId)
    }

    buyCard(game, 'p1', 'explorer')

    expect(player.discardPile.at(-1)?.cardId).toBe('explorer')
    expect(player.availableGold).toBeGreaterThanOrEqual(0)
  })

  it('rotates the turn order to the next player', () => {
    const game = buildTestGame()

    endTurn(game, 'p1')

    expect(game.currentPlayerId).toBe('p2')
    expect(game.turnNumber).toBe(2)
  })

  it('detects a winner when the goal is reached', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    const goal = game.map.tiles.find((tile) => tile.id === game.map.goalHexId)!
    const start = game.map.tiles.find((tile) => tile.id === player.position)!
    const adjacentGoal = {
      ...goal,
      q: start.q + 1,
      r: start.r,
      difficulty: 1,
      terrain: 'GOAL' as const,
      isBlocked: false,
    }
    game.map.tiles = game.map.tiles.map((tile) =>
      tile.id === goal.id ? adjacentGoal : tile,
    )
    const greenCard = player.hand.find(
      (card) => CARD_BY_ID[card.cardId]?.movementType === 'GREEN',
    )!
    playCard(game, 'p1', greenCard.instanceId)

    movePlayer(game, 'p1', goal.id)

    expect(game.status).toBe('FINISHED')
    expect(game.winnerId).toBe('p1')
  })
})
