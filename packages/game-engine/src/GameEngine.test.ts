import { describe, expect, it } from 'vitest'
import type { GameState, HexTile, MapSettings } from '../../shared/src/index.js'
import { CARD_BY_ID, MARKET_CARD_IDS } from '../../shared/src/index.js'
import {
  buyCard,
  createGameState,
  endTurn,
  movePlayer,
  playCard,
  serializePublicGameState,
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
  it('draws a fresh hand for the next player when their draw pile must reshuffle', () => {
    const game = buildTestGame()
    const nextPlayer = game.players[1]!
    nextPlayer.drawPile = []
    nextPlayer.discardPile = [...nextPlayer.hand]
    nextPlayer.hand = []

    endTurn(game, 'p1')

    expect(nextPlayer.hand).toHaveLength(4)
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

  it('rejects movement without a played card or with the wrong terrain color', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    const target = findReachableTile(game, 'JUNGLE')
    target.difficulty = 1
    target.isBlocked = false

    expect(() => movePlayer(game, 'p1', target.id)).toThrow()
    player.availableMovement.BLUE = 2
    expect(() => movePlayer(game, 'p1', target.id)).toThrow()
    expect(player.position).toBe(game.map.startHexId)
  })

  it('requires movement points to enter the zero-difficulty goal', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    const goal = game.map.tiles.find((tile) => tile.id === game.map.goalHexId)!
    const start = game.map.tiles.find((tile) => tile.id === player.position)!
    goal.q = start.q + 1
    goal.r = start.r

    expect(() => movePlayer(game, 'p1', goal.id)).toThrow()
    player.availableMovement.GREEN = 1
    movePlayer(game, 'p1', goal.id)
    expect(player.availableMovement.GREEN).toBe(0)
  })

  it('allows buying cards when enough gold is available', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    const cardId = game.market[0]!
    const cost = CARD_BY_ID[cardId]!.purchaseCost
    player.availableGold = cost
    player.availableMovement.YELLOW = cost

    buyCard(game, 'p1', cardId)

    expect(player.discardPile.at(-1)?.cardId).toBe(cardId)
    expect(player.availableGold).toBe(0)
    expect(player.availableMovement.YELLOW).toBe(0)
  })

  it('starts with four random offers and replenishes them after each purchase', () => {
    const game = buildTestGame()
    const sameSeedGame = buildTestGame()
    const player = game.players[0]!
    const seenOffers = new Set(game.market)

    expect(game.market).toHaveLength(4)
    expect(new Set(game.market).size).toBe(4)
    expect(game.market).toEqual(sameSeedGame.market)
    expect(
      game.market.every((cardId) => MARKET_CARD_IDS.includes(cardId)),
    ).toBe(true)

    for (let index = 0; index < 12; index += 1) {
      const cardId = game.market[0]!
      const cost = CARD_BY_ID[cardId]!.purchaseCost
      player.availableGold = cost
      player.availableMovement.YELLOW = cost
      buyCard(game, 'p1', cardId)
      game.market.forEach((offer) => seenOffers.add(offer))

      expect(game.market).toHaveLength(4)
      expect(new Set(game.market).size).toBe(4)
    }
    expect(game.marketCycle).toBeGreaterThan(0)
    expect(seenOffers.has('seasoned_sailor')).toBe(true)
    expect(seenOffers.has('master_trader')).toBe(true)
    expect(serializePublicGameState(game, 'p1').marketDrawPile).toEqual([])
  })

  it('grants the movement and gold printed on the new cards', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    player.hand.push(
      { cardId: 'seasoned_sailor', instanceId: 'sailor-test' },
      { cardId: 'master_trader', instanceId: 'trader-test' },
    )

    playCard(game, 'p1', 'sailor-test')
    playCard(game, 'p1', 'trader-test')

    expect(player.availableMovement.BLUE).toBe(2)
    expect(player.availableMovement.YELLOW).toBe(3)
    expect(player.availableGold).toBe(3)
  })

  it('rotates the turn order to the next player', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    player.availableMovement.YELLOW = 2
    player.availableGold = 2

    endTurn(game, 'p1')

    expect(game.currentPlayerId).toBe('p2')
    expect(game.turnNumber).toBe(2)
    expect(player.availableMovement.YELLOW).toBe(0)
    expect(player.availableGold).toBe(0)
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
