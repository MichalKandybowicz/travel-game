import { describe, expect, it } from 'vitest'
import type { GameState, HexTile, MapSettings } from '../../shared/src/index.js'
import { CARD_BY_ID, MARKET_CARD_IDS } from '../../shared/src/index.js'
import { axialDistance } from '../../map-generator/src/index.js'
import {
  buyCard,
  createGameState,
  endTurn,
  movePlayer,
  playCard,
  removePlayer,
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
  allowSharedTiles: true,
  petalCount: 1,
  fogMode: 'NONE',
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
  const target = game.map.tiles.find((tile) => {
    const distance = Math.max(
      Math.abs(tile.q - current.q),
      Math.abs(tile.r - current.r),
      Math.abs(-(tile.q + tile.r) + (current.q + current.r)),
    )
    return distance === 1
  })!
  target.terrain = terrain
  target.isBlocked = false
  return target
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

  it('blocks occupied tiles only when shared tiles are disabled', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    const target = findReachableTile(game, 'JUNGLE')
    target.difficulty = 1
    target.isBlocked = false
    game.players[1]!.position = target.id
    player.availableMovement.GREEN = 1
    game.settings.allowSharedTiles = false

    expect(() => movePlayer(game, 'p1', target.id)).toThrow(
      expect.objectContaining({ code: 'HEX_OCCUPIED' }),
    )
    expect(player.availableMovement.GREEN).toBe(1)

    game.settings.allowSharedTiles = true
    movePlayer(game, 'p1', target.id)
    expect(player.position).toBe(target.id)
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
    expect(game.status).toBe('FINISHED')
    expect(game.winnerId).toBe('p1')
    expect(serializePublicGameState(game, 'p2').winnerId).toBe('p1')
  })

  it('allows buying cards when enough gold is available', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    const cardId = game.market[0]!
    const cost = CARD_BY_ID[cardId]!.purchaseCost
    player.availableGold = cost
    player.availableMovement.YELLOW = 0

    buyCard(game, 'p1', cardId)

    expect(player.discardPile.at(-1)?.cardId).toBe(cardId)
    expect(player.availableGold).toBe(0)
    expect(player.availableMovement.YELLOW).toBe(0)
    player.availableGold = 10
    expect(() => buyCard(game, 'p1', game.market[0]!)).toThrow(
      expect.objectContaining({ code: 'PURCHASE_LIMIT' }),
    )
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
      player.availableMovement.YELLOW = 0
      buyCard(game, 'p1', cardId)
      game.market.forEach((offer) => seenOffers.add(offer))

      expect(game.market).toHaveLength(4)
      expect(new Set(game.market).size).toBe(4)
      endTurn(game, 'p1')
      endTurn(game, 'p2')
    }
    expect(game.marketCycle).toBeGreaterThan(0)
    expect(seenOffers.has('seasoned_sailor')).toBe(true)
    expect(seenOffers.has('master_trader')).toBe(true)
    expect(serializePublicGameState(game, 'p1').marketDrawPile).toEqual([])
  })

  it('grants movement without gold when new cards are played for movement', () => {
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
    expect(player.availableGold).toBe(0)
  })

  it('exchanges a coin for two gold and another card for one gold', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    player.hand.push(
      { cardId: 'coin', instanceId: 'coin-test' },
      { cardId: 'explorer', instanceId: 'explorer-test' },
    )

    playCard(game, 'p1', 'coin-test', 'GOLD')
    playCard(game, 'p1', 'explorer-test', 'GOLD')

    expect(player.availableGold).toBe(3)
    expect(player.availableMovement).toEqual({
      GREEN: 0,
      BLUE: 0,
      YELLOW: 0,
      WILD: 0,
    })
    expect(player.playedCards.map((card) => card.instanceId)).toEqual([
      'coin-test',
      'explorer-test',
    ])
  })

  it('keeps unplayed cards and draws back up to four next round', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    const playedCard = player.hand[0]!
    const retainedIds = player.hand.slice(1).map((card) => card.instanceId)

    playCard(game, 'p1', playedCard.instanceId, 'GOLD')
    endTurn(game, 'p1')

    expect(player.hand.map((card) => card.instanceId)).toEqual(retainedIds)
    expect(player.discardPile).toContainEqual(playedCard)
    endTurn(game, 'p2')
    expect(player.hand).toHaveLength(4)
    expect(player.hand.slice(0, 3).map((card) => card.instanceId)).toEqual(
      retainedIds,
    )
  })

  it('keeps a public card history for the current round', () => {
    const game = buildTestGame()
    const firstCard = game.players[0]!.hand[0]!
    playCard(game, 'p1', firstCard.instanceId, 'GOLD')
    endTurn(game, 'p1')
    const secondCard = game.players[1]!.hand[0]!
    playCard(game, 'p2', secondCard.instanceId, 'MOVEMENT')

    expect(game.roundPlayedCards.map((entry) => entry.playerId)).toEqual([
      'p1',
      'p2',
    ])
    endTurn(game, 'p2')
    expect(game.roundPlayedCards).toEqual([])
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

  it('ends a two-player game when one player leaves', () => {
    const game = buildTestGame()

    removePlayer(game, 'p1')

    expect(game.players.map((player) => player.id)).toEqual(['p2'])
    expect(game.status).toBe('FINISHED')
    expect(game.winnerId).toBe('p2')
  })

  it('continues with the next player when one of three players leaves', () => {
    const game = createGameState('ABCDE', settings, [
      { id: 'p1', name: 'Player 1' },
      { id: 'p2', name: 'Player 2' },
      { id: 'p3', name: 'Player 3' },
    ])

    removePlayer(game, 'p1')

    expect(game.players.map((player) => player.id)).toEqual(['p2', 'p3'])
    expect(game.status).toBe('ACTIVE')
    expect(game.currentPlayerId).toBe('p2')
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

  it('reveals only the current petal while keeping the whole outline', () => {
    const game = createGameState(
      'ABCDE',
      { ...settings, petalCount: 2, fogMode: 'PETAL' },
      [
        { id: 'p1', name: 'Player 1' },
        { id: 'p2', name: 'Player 2' },
      ],
    )
    const view = serializePublicGameState(game, 'p1')
    expect(view.map.tiles).toHaveLength(game.map.tiles.length)
    expect(
      view.map.tiles
        .filter((tile) => tile.petalId === 0)
        .every((tile) => tile.terrain !== 'UNKNOWN'),
    ).toBe(true)
    expect(
      view.map.tiles
        .filter((tile) => tile.petalId === 1)
        .every((tile) => tile.terrain === 'UNKNOWN' && tile.difficulty === -1),
    ).toBe(true)
    expect(view.map.goalHexId).toBe('')
    game.players[1]!.position = game.map.goalHexId
    expect(serializePublicGameState(game, 'p1').players[1]!.position).toBe('')
    const otherView = serializePublicGameState(game, 'p2')
    expect(
      otherView.map.tiles
        .filter((tile) => tile.petalId === 1)
        .every((tile) => tile.terrain !== 'UNKNOWN'),
    ).toBe(true)
  })

  it.each([
    ['MEDIUM', 2, 4],
    ['FULL', 1, 2],
  ] as const)(
    'limits %s fog to its full and terrain-only ranges',
    (fogMode, fullRange, terrainRange) => {
      const game = createGameState(
        'ABCDE',
        { ...settings, petalCount: 3, fogMode },
        [
          { id: 'p1', name: 'Player 1' },
          { id: 'p2', name: 'Player 2' },
        ],
      )
      const view = serializePublicGameState(game, 'p1')
      const start = game.map.tiles.find(
        (tile) => tile.id === game.map.startHexId,
      )!
      const terrainOnlyTile = game.map.tiles.find(
        (tile) => axialDistance(start, tile) === fullRange + 1,
      )!
      game.players[1]!.position = terrainOnlyTile.id
      expect(serializePublicGameState(game, 'p1').players[1]!.position).toBe('')
      expect(view.map.tiles.length).toBeLessThan(game.map.tiles.length)
      for (const tile of view.map.tiles) {
        const distance = axialDistance(start, tile)
        expect(distance).toBeLessThanOrEqual(terrainRange)
        expect(tile.difficulty).toBe(
          distance <= fullRange
            ? game.map.tiles.find((entry) => entry.id === tile.id)!.difficulty
            : -1,
        )
      }
      expect(view.map.goalHexId).toBe('')
    },
  )
})
