import { describe, expect, it } from 'vitest'
import type { GameState, HexTile, MapSettings } from '../../shared/src/index.js'
import { CARD_BY_ID, MARKET_CARD_IDS } from '../../shared/src/index.js'
import { axialDistance, getNeighbors } from '../../map-generator/src/index.js'
import {
  buyCard,
  chooseStart,
  createGameState,
  endTurn,
  discardCard,
  getMoveRequirements,
  movePlayer,
  playCard,
  removePlayer,
  serializePublicGameState,
  useActionCard as activateActionCard,
  useToken,
} from './GameEngine.js'
import { buildStartingDeck } from './Deck.js'

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
  campCountMinPerPetal: 1,
  campCountMaxPerPetal: 1,
  fogMode: 'NONE',
}

const buildTestGame = (): GameState => {
  const game = createGameState('ABCDE', settings, [
    { id: 'p1', name: 'Player 1' },
    { id: 'p2', name: 'Player 2' },
  ])
  game.status = 'ACTIVE'
  game.players[0]!.position = game.map.startHexIds![0]!
  game.players[1]!.position = game.map.startHexIds![1]!
  return game
}

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
  it('combines matching terrain costs with a one-point edge discount', () => {
    const greenTwo: HexTile = {
      id: 'green-2',
      q: 0,
      r: 0,
      terrain: 'JUNGLE',
      difficulty: 2,
      isBlocked: false,
    }
    const otherGreenTwo = { ...greenTwo, id: 'other-green-2', q: 1 }
    const greenThree = { ...greenTwo, id: 'green-3', difficulty: 3 }

    expect(getMoveRequirements(greenTwo, otherGreenTwo)).toEqual([
      { type: 'GREEN', amount: 3 },
    ])
    expect(getMoveRequirements(greenThree, otherGreenTwo)).toEqual([
      { type: 'GREEN', amount: 4 },
    ])
  })

  it('requires both costs when connected terrains use different movement types', () => {
    const jungle: HexTile = {
      id: 'jungle',
      q: 0,
      r: 0,
      terrain: 'JUNGLE',
      difficulty: 2,
      isBlocked: false,
    }
    const water: HexTile = {
      ...jungle,
      id: 'water',
      q: 1,
      terrain: 'WATER',
      difficulty: 3,
    }

    expect(getMoveRequirements(jungle, water)).toEqual([
      { type: 'GREEN', amount: 2 },
      { type: 'BLUE', amount: 3 },
    ])
  })

  it('lets players choose distinct starts, then plays in reverse selection order', () => {
    const game = createGameState('ABCDE', settings, [
      { id: 'p1', name: 'Player 1' },
      { id: 'p2', name: 'Player 2' },
      { id: 'p3', name: 'Player 3' },
      { id: 'p4', name: 'Player 4' },
    ])
    const starts = game.map.startHexIds!
    expect(game.status).toBe('CHOOSING_START')
    expect(game.players.every((player) => player.position === '')).toBe(true)
    expect(() => chooseStart(game, 'p2', starts[0]!)).toThrow()
    expect(() =>
      playCard(game, 'p1', game.players[0]!.hand[0]!.instanceId),
    ).toThrow()
    chooseStart(game, 'p1', starts[0]!)
    expect(game.currentPlayerId).toBe('p2')
    expect(() => chooseStart(game, 'p2', starts[0]!)).toThrow()
    expect(() => chooseStart(game, 'p2', game.map.goalHexId)).toThrow()
    chooseStart(game, 'p2', starts[1]!)
    chooseStart(game, 'p3', starts[2]!)
    chooseStart(game, 'p4', starts[3]!)
    expect(game.status).toBe('ACTIVE')
    expect(game.players.map((player) => player.id)).toEqual([
      'p4',
      'p3',
      'p2',
      'p1',
    ])
    expect(game.currentPlayerId).toBe('p4')
    endTurn(game, 'p4')
    expect(game.currentPlayerId).toBe('p3')
    endTurn(game, 'p3')
    expect(game.currentPlayerId).toBe('p2')
    endTurn(game, 'p2')
    expect(game.currentPlayerId).toBe('p1')
  })

  it('continues start selection when the next chooser leaves', () => {
    const game = createGameState('ABCDE', settings, [
      { id: 'p1', name: 'Player 1' },
      { id: 'p2', name: 'Player 2' },
      { id: 'p3', name: 'Player 3' },
    ])
    chooseStart(game, 'p1', game.map.startHexIds![0]!)
    removePlayer(game, 'p2')
    expect(game.currentPlayerId).toBe('p3')
    chooseStart(game, 'p3', game.map.startHexIds![1]!)
    expect(game.status).toBe('ACTIVE')
    expect(game.players.map((player) => player.id)).toEqual(['p3', 'p1'])
  })

  it('builds an eight-card starting deck with four green, three yellow and one blue card', () => {
    const deck = buildStartingDeck('p1', 'STARTER-42')
    const movementTypes = deck.map(
      (card) => CARD_BY_ID[card.cardId]!.movementType,
    )

    expect(deck).toHaveLength(8)
    expect(movementTypes.filter((type) => type === 'GREEN')).toHaveLength(4)
    expect(movementTypes.filter((type) => type === 'YELLOW')).toHaveLength(3)
    expect(movementTypes.filter((type) => type === 'BLUE')).toHaveLength(1)
    expect(
      deck.every(
        (card) =>
          CARD_BY_ID[card.cardId]!.goldValue ===
          (card.cardId === 'coin' ? 2 : 1),
      ),
    ).toBe(true)
  })

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
    player.availableMovement.WILD = 1
    game.settings.allowSharedTiles = false

    expect(() => movePlayer(game, 'p1', target.id)).toThrow(
      expect.objectContaining({ code: 'HEX_OCCUPIED' }),
    )
    expect(player.availableMovement.GREEN).toBe(1)
    expect(player.availableMovement.WILD).toBe(1)

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
    player.availableMovement.WILD = 10
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

    for (let index = 0; index < 50; index += 1) {
      const cardId = game.market[0]!
      const cost = CARD_BY_ID[cardId]!.purchaseCost
      player.availableGold = cost
      player.availableMovement.YELLOW = 0
      buyCard(game, 'p1', cardId)
      game.market.forEach((offer) => seenOffers.add(offer))

      expect(game.market).toHaveLength(4)
      expect(new Set(game.market).size).toBe(4)
      expect(
        game.market.filter((offer) => CARD_BY_ID[offer]?.type === 'ACTION')
          .length,
      ).toBeLessThanOrEqual(1)
      expect(
        game.market.some(
          (offer) =>
            CARD_BY_ID[offer]?.type === 'MOVEMENT' &&
            CARD_BY_ID[offer]!.purchaseCost <= 5,
        ),
      ).toBe(true)
      endTurn(game, 'p1')
      endTurn(game, 'p2')
    }
    expect(game.marketCycle).toBeGreaterThan(0)
    expect(seenOffers.has('seasoned_sailor')).toBe(true)
    expect(seenOffers.has('master_trader')).toBe(true)
    expect(seenOffers.has('pathfinder')).toBe(true)
    expect(seenOffers.has('captain')).toBe(true)
    expect(seenOffers.has('caravan')).toBe(true)
    expect(seenOffers.has('trailblazer')).toBe(true)
    expect(serializePublicGameState(game, 'p1').marketDrawPile).toEqual([])
  })

  it('keeps starter cards out and maintains healthy market offers', () => {
    expect(MARKET_CARD_IDS).not.toEqual(
      expect.arrayContaining(['explorer', 'sailor', 'coin']),
    )
    const game = buildTestGame()
    expect(
      game.market.some(
        (cardId) =>
          CARD_BY_ID[cardId]?.type === 'MOVEMENT' &&
          CARD_BY_ID[cardId]!.purchaseCost <= 5,
      ),
    ).toBe(true)
    expect(
      game.market.filter((cardId) => CARD_BY_ID[cardId]?.type === 'ACTION')
        .length,
    ).toBeLessThanOrEqual(1)
  })

  it('uses second wind once, draws two and requires one discard', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    const handSize = player.hand.length
    player.hand.push({
      cardId: 'second_wind',
      instanceId: 'second-wind-test',
    })

    activateActionCard(game, player.id, 'second-wind-test')

    expect(player.removedCards.at(-1)?.cardId).toBe('second_wind')
    expect(player.hand).toHaveLength(handSize + 2)
    expect(player.pendingDiscardCount).toBe(1)
    expect(() => endTurn(game, player.id)).toThrow(
      expect.objectContaining({ code: 'INVALID_ACTION' }),
    )
    discardCard(game, player.id, player.hand[0]!.instanceId)
    expect(player.pendingDiscardCount).toBe(0)
    expect(player.hand).toHaveLength(handSize + 1)
  })

  it('allows a second market purchase after using merchant caravan', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    player.hand.push({
      cardId: 'merchant_caravan',
      instanceId: 'merchant-caravan-test',
    })
    activateActionCard(game, player.id, 'merchant-caravan-test')
    player.availableGold = 30

    buyCard(game, player.id, game.market[0]!)
    buyCard(game, player.id, game.market[0]!)

    expect(player.hasBoughtThisTurn).toBe(true)
    expect(player.extraPurchaseAvailable).toBe(false)
    expect(() => buyCard(game, player.id, game.market[0]!)).toThrow(
      expect.objectContaining({ code: 'PURCHASE_LIMIT' }),
    )
  })

  it('steals plans by discarding a random opponent card', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    const opponent = game.players[1]!
    player.hand.push({
      cardId: 'steal_plans',
      instanceId: 'steal-plans-test',
    })
    const opponentHandSize = opponent.hand.length

    activateActionCard(game, player.id, 'steal-plans-test', opponent.id)

    expect(opponent.hand).toHaveLength(opponentHandSize - 1)
    expect(opponent.discardPile).toHaveLength(1)
    expect(player.removedCards.at(-1)?.cardId).toBe('steal_plans')
  })

  it('makes the next adjacent move cost one after using guide', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    const target = findReachableTile(game, 'JUNGLE')
    game.settings.allowSharedTiles = true
    target.difficulty = 4
    player.hand.push({ cardId: 'guide', instanceId: 'guide-test' })
    player.availableMovement.WILD = 1

    activateActionCard(game, player.id, 'guide-test')
    movePlayer(game, player.id, target.id)

    expect(player.availableMovement.WILD).toBe(0)
    expect(player.guidedMoveAvailable).toBe(false)
  })

  it('allows shortcut map to jump over one blocked tile', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    const start = game.map.tiles.find((tile) => tile.id === player.position)!
    const blocked = getNeighbors(game.map.tiles, start)[0]!
    blocked.terrain = 'MOUNTAIN'
    blocked.isBlocked = true
    const target = getNeighbors(game.map.tiles, blocked).find(
      (tile) =>
        tile.id !== start.id &&
        axialDistance(start, tile) === 2 &&
        !tile.isBlocked,
    )!
    target.terrain = 'JUNGLE'
    target.difficulty = 1
    player.hand.push({
      cardId: 'shortcut_map',
      instanceId: 'shortcut-map-test',
    })
    player.availableMovement.GREEN = 1

    activateActionCard(game, player.id, 'shortcut-map-test')
    movePlayer(game, player.id, target.id)

    expect(player.position).toBe(target.id)
    expect(player.shortcutMoveAvailable).toBe(false)
  })

  it('allows entering occupied tiles until the turn ends after phase walk', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    const opponent = game.players[1]!
    const target = findReachableTile(game, 'JUNGLE')
    game.settings.allowSharedTiles = false
    target.difficulty = 1
    opponent.position = target.id
    player.hand.push({
      cardId: 'phase_walk',
      instanceId: 'phase-walk-test',
    })
    player.availableMovement.WILD = 10

    expect(() => movePlayer(game, player.id, target.id)).toThrow(
      expect.objectContaining({ code: 'HEX_OCCUPIED' }),
    )
    activateActionCard(game, player.id, 'phase-walk-test')
    movePlayer(game, player.id, target.id)

    expect(player.position).toBe(target.id)
    expect(player.sharedTileAccessAvailable).toBe(true)
    endTurn(game, player.id)
    expect(player.sharedTileAccessAvailable).toBe(false)
  })

  it('replaces the remaining hand after using reshuffle hand', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    const previousHand = [...player.hand]
    player.hand.push({
      cardId: 'reshuffle_hand',
      instanceId: 'reshuffle-hand-test',
    })

    activateActionCard(game, player.id, 'reshuffle-hand-test')

    expect(player.hand).toHaveLength(previousHand.length)
    expect(player.discardPile).toEqual(expect.arrayContaining(previousHand))
    expect(player.removedCards.at(-1)?.cardId).toBe('reshuffle_hand')
  })

  it('copies the last movement card effect with echo power', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    const coin = player.hand.find((card) => card.cardId === 'coin')!
    player.hand.push({ cardId: 'echo_power', instanceId: 'echo-power-test' })

    playCard(game, player.id, coin.instanceId, 'GOLD')
    activateActionCard(game, player.id, 'echo-power-test')

    expect(player.availableGold).toBe(CARD_BY_ID.coin!.goldValue * 2)
  })

  it('protective circle consumes and ignores the next curse', () => {
    const game = buildTestGame()
    const target = game.players[0]!
    const caster = game.players[1]!
    target.hand.push({
      cardId: 'protective_circle',
      instanceId: 'protective-circle-test',
    })
    caster.hand.push(
      { cardId: 'path_fracture', instanceId: 'blocked-curse' },
      { cardId: 'path_fracture', instanceId: 'active-curse' },
    )

    activateActionCard(game, target.id, 'protective-circle-test')
    expect(target.curseShieldAvailable).toBe(true)
    endTurn(game, target.id)
    activateActionCard(game, caster.id, 'blocked-curse', target.id)

    expect(target.curseShieldAvailable).toBe(false)
    expect(target.extraMoveCostPending).toBe(false)
    caster.hasUsedActionCardThisTurn = false
    activateActionCard(game, caster.id, 'active-curse', target.id)
    expect(target.extraMoveCostPending).toBe(true)
  })

  it('adds one point to the cursed player next move', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    const target = findReachableTile(game, 'JUNGLE')
    game.settings.allowSharedTiles = true
    target.difficulty = 1
    player.extraMoveCostPending = true
    player.availableMovement.WILD = 10
    const before = Object.values(player.availableMovement).reduce(
      (sum, value) => sum + value,
      0,
    )

    movePlayer(game, player.id, target.id)

    expect(
      Object.values(player.availableMovement).reduce(
        (sum, value) => sum + value,
        0,
      ),
    ).toBeLessThanOrEqual(before - 2)
    expect(player.extraMoveCostPending).toBe(false)
  })

  it('applies fog, poverty, roots and market curses to an opponent', () => {
    const game = buildTestGame()
    const caster = game.players[0]!
    const target = game.players[1]!
    target.availableGold = 1
    const curseCards = [
      ['fog_of_forgetting', 'fog-test'],
      ['poverty_curse', 'poverty-test'],
      ['tangled_roots', 'roots-test'],
      ['closed_market', 'market-test'],
    ] as const
    caster.hand.push(
      ...curseCards.map(([cardId, instanceId]) => ({ cardId, instanceId })),
    )
    const activateCurse = (instanceId: string) =>
      activateActionCard(game, caster.id, instanceId, target.id)

    for (const [, instanceId] of curseCards) {
      activateCurse(instanceId)
      caster.hasUsedActionCardThisTurn = false
    }

    expect(target.fogCostsHidden).toBe(true)
    expect(target.availableGold).toBe(1)
    expect(target.nextPurchaseCostIncrease).toBe(2)
    expect(target.shortcutBlocked).toBe(true)
    expect(target.marketBlocked).toBe(true)
    endTurn(game, caster.id)
    target.availableGold = 20
    expect(() => buyCard(game, target.id, game.market[0]!)).toThrow(
      expect.objectContaining({ code: 'MARKET_LOCKED' }),
    )
    target.hand.push({
      cardId: 'shortcut_map',
      instanceId: 'blocked-shortcut',
    })
    expect(() =>
      activateActionCard(game, target.id, 'blocked-shortcut'),
    ).toThrow(expect.objectContaining({ code: 'INVALID_ACTION' }))
    endTurn(game, target.id)
    expect(target.fogCostsHidden).toBe(false)
    expect(target.shortcutBlocked).toBe(false)
    expect(target.marketBlocked).toBe(false)
    endTurn(game, caster.id)
    const cardId = game.market[0]!
    const baseCost = CARD_BY_ID[cardId]!.purchaseCost
    target.availableGold = baseCost + 2
    buyCard(game, target.id, cardId)
    expect(target.availableGold).toBe(0)
    expect(target.nextPurchaseCostIncrease).toBe(0)
  })

  it('replaces every unsold offer after a round without purchases', () => {
    const game = buildTestGame()
    const previousMarket = [...game.market]

    endTurn(game, 'p1')
    endTurn(game, 'p2')

    expect(game.market).toHaveLength(4)
    expect(
      game.market.every((cardId) => !previousMarket.includes(cardId)),
    ).toBe(true)
  })

  it('keeps the current offers after a round with a purchase', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    const cardId = game.market[0]!
    player.availableGold = CARD_BY_ID[cardId]!.purchaseCost
    buyCard(game, 'p1', cardId)
    const marketAfterPurchase = [...game.market]

    endTurn(game, 'p1')
    endTurn(game, 'p2')

    expect(game.market).toEqual(marketAfterPurchase)
  })

  it('blocks the market until the curse caster gets the turn again', () => {
    const game = buildTestGame()
    const caster = game.players[0]!
    const opponent = game.players[1]!
    caster.tokens!.push({
      instanceId: 'market-curse',
      type: 'CURSE_MARKET',
    })
    caster.availableGold = 10
    opponent.availableGold = 10

    useToken(game, caster.id, 'market-curse')

    expect(game.marketLockedUntilPlayerId).toBe(caster.id)
    expect(() => buyCard(game, caster.id, game.market[0]!)).toThrow(
      expect.objectContaining({ code: 'MARKET_LOCKED' }),
    )
    endTurn(game, caster.id)
    expect(() => buyCard(game, opponent.id, game.market[0]!)).toThrow(
      expect.objectContaining({ code: 'MARKET_LOCKED' }),
    )
    endTurn(game, opponent.id)
    expect(game.currentPlayerId).toBe(caster.id)
    expect(game.marketLockedUntilPlayerId).toBeUndefined()
  })

  it('skips the leading opponent exactly once', () => {
    const game = createGameState('ABCDE', settings, [
      { id: 'p1', name: 'Player 1' },
      { id: 'p2', name: 'Player 2' },
      { id: 'p3', name: 'Player 3' },
    ])
    game.status = 'ACTIVE'
    game.players.forEach((player, index) => {
      player.position = game.map.startHexIds![index]!
    })
    const caster = game.players[0]!
    const leader = game.players[1]!
    leader.position = game.map.goalHexId
    caster.tokens!.push({
      instanceId: 'skip-curse',
      type: 'CURSE_SKIP_LEADER',
    })

    useToken(game, caster.id, 'skip-curse')
    expect(leader.skipNextTurn).toBe(true)

    endTurn(game, caster.id)
    expect(game.currentPlayerId).toBe('p3')
    expect(leader.skipNextTurn).toBe(false)
    endTurn(game, 'p3')
    endTurn(game, 'p1')
    expect(game.currentPlayerId).toBe('p2')
  })

  it('removes a random opponent card without touching their hand', () => {
    const game = buildTestGame()
    const caster = game.players[0]!
    const opponent = game.players[1]!
    const handBefore = [...opponent.hand]
    const removableBefore =
      opponent.drawPile.length + opponent.discardPile.length
    caster.tokens!.push({
      instanceId: 'remove-curse',
      type: 'CURSE_REMOVE_CARD',
    })

    useToken(game, caster.id, 'remove-curse', opponent.id)

    expect(opponent.hand).toEqual(handBefore)
    expect(opponent.drawPile.length + opponent.discardPile.length).toBe(
      removableBefore - 1,
    )
    expect(opponent.removedCards).toHaveLength(1)
  })

  it('allows only one stored token per round and preserves the others', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    player.tokens!.push(
      { instanceId: 'green-token', type: 'GREEN_1' },
      { instanceId: 'gold-token', type: 'GOLD_2' },
    )

    useToken(game, player.id, 'green-token')

    expect(player.availableMovement.GREEN).toBe(1)
    expect(player.tokens!.map((token) => token.instanceId)).toEqual([
      'gold-token',
    ])
    expect(() => useToken(game, player.id, 'gold-token')).toThrow(
      expect.objectContaining({ code: 'TOKEN_LIMIT' }),
    )
    endTurn(game, 'p1')
    endTurn(game, 'p2')
    useToken(game, player.id, 'gold-token')
    expect(player.availableGold).toBe(2)
    expect(player.tokens).toEqual([])
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

    expect(player.availableMovement.BLUE).toBe(
      CARD_BY_ID.seasoned_sailor!.movementValue,
    )
    expect(player.availableMovement.YELLOW).toBe(
      CARD_BY_ID.master_trader!.movementValue,
    )
    expect(player.availableGold).toBe(0)
  })

  it('exchanges cards for the gold value in their definitions', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    player.hand.push(
      { cardId: 'coin', instanceId: 'coin-test' },
      { cardId: 'explorer', instanceId: 'explorer-test' },
    )

    playCard(game, 'p1', 'coin-test', 'GOLD')
    playCard(game, 'p1', 'explorer-test', 'GOLD')

    expect(player.availableGold).toBe(
      CARD_BY_ID.coin!.goldValue + CARD_BY_ID.explorer!.goldValue,
    )
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

  it('doubles a sacrificed card and blocks another sacrifice for five own turns', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    player.hand.push(
      { cardId: 'coin', instanceId: 'sacrificed-coin' },
      { cardId: 'explorer', instanceId: 'second-sacrifice' },
    )

    playCard(game, player.id, 'sacrificed-coin', 'MOVEMENT', true)

    expect(player.availableMovement.YELLOW).toBe(
      CARD_BY_ID.coin!.movementValue * 2,
    )
    expect(player.removedCards).toContainEqual({
      cardId: 'coin',
      instanceId: 'sacrificed-coin',
    })
    expect(player.sacrificeCooldownTurns).toBe(5)
    expect(player.playedCards).not.toContainEqual(
      expect.objectContaining({ instanceId: 'sacrificed-coin' }),
    )
    expect(() =>
      playCard(game, player.id, 'second-sacrifice', 'GOLD', true),
    ).toThrow(expect.objectContaining({ code: 'INVALID_ACTION' }))

    endTurn(game, player.id)
    endTurn(game, 'p2')

    for (let blockedTurn = 5; blockedTurn >= 1; blockedTurn -= 1) {
      expect(player.sacrificeCooldownTurns).toBe(blockedTurn)
      expect(() =>
        playCard(game, player.id, 'second-sacrifice', 'GOLD', true),
      ).toThrow(expect.objectContaining({ code: 'INVALID_ACTION' }))
      endTurn(game, player.id)
      endTurn(game, 'p2')
    }

    expect(player.sacrificeCooldownTurns).toBe(0)
    playCard(game, player.id, 'second-sacrifice', 'GOLD', true)
    expect(player.availableGold).toBe(CARD_BY_ID.explorer!.goldValue * 2)
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
    game.status = 'ACTIVE'
    game.players.forEach((player, index) => {
      player.position = game.map.startHexIds![index]!
    })

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

  it('reveals the neighboring petal when the player reaches its border', () => {
    const game = createGameState(
      'ABCDE',
      { ...settings, petalCount: 2, fogMode: 'PETAL' },
      [
        { id: 'p1', name: 'Player 1' },
        { id: 'p2', name: 'Player 2' },
      ],
    )
    game.status = 'ACTIVE'
    game.players[0]!.position = game.map.startHexId
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
    const borderTile = game.map.tiles.find(
      (tile) =>
        tile.petalId === 0 &&
        !tile.isBlocked &&
        getNeighbors(game.map.tiles, tile).some(
          (neighbor) => neighbor.petalId === 1,
        ),
    )!
    game.players[0]!.position = borderTile.id
    const borderView = serializePublicGameState(game, 'p1')
    expect(
      borderView.map.tiles
        .filter((tile) => tile.petalId === 1)
        .every((tile) => tile.terrain !== 'UNKNOWN' && tile.difficulty >= 0),
    ).toBe(true)
    const crossing = getNeighbors(game.map.tiles, borderTile).find(
      (tile) => tile.petalId === 1,
    )!
    expect(
      borderView.map.tiles.find((tile) => tile.id === crossing.id),
    ).toEqual(crossing)
    expect(borderView.map.goalHexId).toBe(game.map.goalHexId)
    expect(borderView.players[1]!.position).toBe(game.map.goalHexId)
    const otherView = serializePublicGameState(game, 'p2')
    expect(
      otherView.map.tiles
        .filter((tile) => tile.petalId === 1)
        .every((tile) => tile.terrain !== 'UNKNOWN'),
    ).toBe(true)
  })

  it('keeps more distant petals hidden at a petal border', () => {
    const game = createGameState(
      'ABCDE',
      { ...settings, petalCount: 3, fogMode: 'PETAL' },
      [
        { id: 'p1', name: 'Player 1' },
        { id: 'p2', name: 'Player 2' },
      ],
    )
    game.status = 'ACTIVE'
    game.players[0]!.position = game.map.startHexId
    const borderTile = game.map.tiles.find(
      (tile) =>
        tile.petalId === 0 &&
        getNeighbors(game.map.tiles, tile).some(
          (neighbor) => neighbor.petalId === 1,
        ),
    )!
    game.players[0]!.position = borderTile.id
    const view = serializePublicGameState(game, 'p1')
    expect(
      view.map.tiles
        .filter((tile) => tile.petalId === 1)
        .every((tile) => tile.terrain !== 'UNKNOWN'),
    ).toBe(true)
    expect(
      view.map.tiles
        .filter((tile) => tile.petalId === 2)
        .every((tile) => tile.terrain === 'UNKNOWN'),
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
      game.status = 'ACTIVE'
      game.players[0]!.position = game.map.startHexId
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

  it('keeps previously revealed and scouted tiles visible through fog', () => {
    const game = createGameState(
      'ABCDE',
      { ...settings, petalCount: 3, fogMode: 'FULL' },
      [
        { id: 'p1', name: 'Player 1' },
        { id: 'p2', name: 'Player 2' },
      ],
    )
    game.status = 'ACTIVE'
    const player = game.players[0]!
    player.position = game.map.startHexId
    const start = game.map.tiles.find(
      (tile) => tile.id === game.map.startHexId,
    )!
    const revealed = game.map.tiles.find(
      (tile) => axialDistance(start, tile) > 2,
    )!
    const scouted = game.map.tiles.find(
      (tile) => tile.id !== revealed.id && axialDistance(start, tile) > 2,
    )!
    player.revealedTileIds = [revealed.id]
    player.scoutedTileIds = [revealed.id, scouted.id]

    const view = serializePublicGameState(game, player.id)

    expect(view.map.tiles.find((tile) => tile.id === revealed.id)).toEqual(
      revealed,
    )
    expect(view.map.tiles.find((tile) => tile.id === scouted.id)).toMatchObject(
      {
        id: scouted.id,
        terrain: scouted.terrain,
        difficulty: -1,
      },
    )
  })
})
