import { describe, expect, it } from 'vitest'
import type { GameState, HexTile, MapSettings } from '../../shared/src/index.js'
import {
  CARD_BY_ID,
  getMarketTier,
  MARKET_CARD_COPY_LIMIT,
  MARKET_CARD_IDS,
  TOKEN_DEFINITIONS,
} from '../../shared/src/index.js'
import { axialDistance, getNeighbors } from '../../map-generator/src/index.js'
import {
  buyCard,
  chooseStart,
  chooseCampReward,
  createGameState,
  endTurn,
  discardCard,
  getEffectiveMoveRequirements,
  getReachableMovePaths,
  getMoveRequirements,
  moveDragon,
  movePlayer,
  playCard,
  undoCardPlay,
  removePlayer,
  serializePublicGameState,
  useActionCard as activateActionCard,
  useToken as activateToken,
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
  it('spawns dragons on distinct non-start petals', () => {
    const game = createGameState(
      'ABCDE',
      { ...settings, petalCount: 4, dragonCount: 3 },
      [
        { id: 'p1', name: 'Player 1' },
        { id: 'p2', name: 'Player 2' },
      ],
    )
    const startPetals = new Set(
      (game.map.startHexIds ?? [game.map.startHexId]).map(
        (id) => game.map.tiles.find((tile) => tile.id === id)?.petalId ?? 0,
      ),
    )

    expect(game.dragons?.length).toBeGreaterThan(0)
    expect(game.dragons?.length).toBeLessThanOrEqual(3)
    expect(
      new Set(game.dragons?.map((dragon) => dragon.homePetalId)).size,
    ).toBe(game.dragons?.length)
    for (const dragon of game.dragons ?? []) {
      const tile = game.map.tiles.find((entry) => entry.id === dragon.position)!
      expect(startPetals.has(tile.petalId ?? 0)).toBe(false)
      expect(['START', 'GOAL', 'MOUNTAIN', 'UNKNOWN']).not.toContain(
        tile.terrain,
      )
    }
  })

  it('blocks dragon-adjacent hexes and adds any movement at distance two', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    const current = game.map.tiles.find((tile) => tile.id === player.position)!
    const target = getNeighbors(game.map.tiles, current).find(
      (tile) =>
        !['START', 'GOAL', 'MOUNTAIN', 'UNKNOWN'].includes(tile.terrain) &&
        tile.difficulty >= 0,
    )!
    const dragonTile = getNeighbors(game.map.tiles, target).find(
      (tile) =>
        tile.id !== current.id &&
        !['START', 'GOAL', 'MOUNTAIN', 'UNKNOWN'].includes(tile.terrain) &&
        tile.difficulty >= 0,
    )!
    game.dragons = [
      {
        id: 'dragon-1',
        position: dragonTile.id,
        homePetalId: dragonTile.petalId ?? 0,
      },
    ]
    player.availableMovement.WILD = 20

    expect(() => movePlayer(game, player.id, target.id)).toThrow(
      expect.objectContaining({ code: 'HEX_BLOCKED' }),
    )

    const penaltyTarget = getNeighbors(game.map.tiles, current).find(
      (tile) =>
        tile.id !== target.id &&
        axialDistance(tile, dragonTile) === 2 &&
        !['START', 'GOAL', 'MOUNTAIN', 'UNKNOWN'].includes(tile.terrain) &&
        tile.difficulty >= 0,
    )
    if (penaltyTarget) {
      const requirements = getEffectiveMoveRequirements(
        player,
        current,
        penaltyTarget,
        game.map.tiles,
        game.dragons,
      )
      expect(requirements).toContainEqual({ type: 'ANY', amount: 2 })
    }
  })

  it('lets the active player move a dragon to an adjacent valid hex for six any movement', () => {
    const game = buildTestGame()
    game.map.startHexIds = []
    const player = game.players[0]!
    const dragonTile = game.map.tiles.find(
      (tile) =>
        !['START', 'GOAL', 'MOUNTAIN', 'UNKNOWN'].includes(tile.terrain) &&
        tile.difficulty >= 0 &&
        !game.players.some((entry) => entry.position === tile.id),
    )!
    const destination = getNeighbors(game.map.tiles, dragonTile).find(
      (tile) =>
        !['START', 'GOAL', 'MOUNTAIN', 'UNKNOWN'].includes(tile.terrain) &&
        tile.difficulty >= 0 &&
        !game.players.some((entry) => entry.position === tile.id),
    )!
    game.dragons = [
      {
        id: 'dragon-1',
        position: dragonTile.id,
        homePetalId: dragonTile.petalId ?? 0,
      },
    ]
    player.availableMovement.WILD = 6

    moveDragon(game, player.id, 'dragon-1', destination.id)

    expect(game.dragons[0]!.position).toBe(destination.id)
    expect(player.availableMovement.WILD).toBe(0)
  })

  it('offers three distinct camp runes and grants only the chosen one', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    const camp = findReachableTile(game, 'CAMP')
    camp.difficulty = 1
    player.availableMovement.WILD = 2

    movePlayer(game, player.id, camp.id)

    const reward = player.pendingCampReward!
    expect(reward.options).toHaveLength(3)
    expect(new Set(reward.options).size).toBe(3)
    expect(reward.storyIndex).toBeGreaterThanOrEqual(0)
    expect(reward.storyIndex).toBeLessThan(3)
    expect(player.tokens).toEqual([])
    expect(() => endTurn(game, player.id)).toThrow(
      expect.objectContaining({ code: 'INVALID_ACTION' }),
    )
    expect(() => chooseCampReward(game, player.id, 'GREEN_1')).toThrow(
      expect.objectContaining({ code: 'INVALID_ACTION' }),
    )
    expect(
      serializePublicGameState(game, game.players[1]!.id).players[0]!
        .pendingCampReward,
    ).toBeUndefined()

    chooseCampReward(game, player.id, reward.options[1])
    expect(player.pendingCampReward).toBeUndefined()
    expect(player.tokens).toEqual([
      { instanceId: `${player.id}-camp-${camp.id}`, type: reward.options[1] },
    ])
    expect(() => chooseCampReward(game, player.id, reward.options[0])).toThrow(
      expect.objectContaining({ code: 'INVALID_ACTION' }),
    )
  })
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
    expect(game.roundNumber).toBe(1)
    endTurn(game, 'p4')
    expect(game.currentPlayerId).toBe('p3')
    expect(game.roundNumber).toBe(1)
    endTurn(game, 'p3')
    expect(game.currentPlayerId).toBe('p2')
    expect(game.roundNumber).toBe(1)
    endTurn(game, 'p2')
    expect(game.currentPlayerId).toBe('p1')
    expect(game.roundNumber).toBe(1)
    endTurn(game, 'p1')
    expect(game.currentPlayerId).toBe('p4')
    expect(game.roundNumber).toBe(2)
  })

  it('lets five players choose separate starts on a map with five slots', () => {
    const players = Array.from({ length: 5 }, (_, index) => ({
      id: `p${index + 1}`,
      name: `Player ${index + 1}`,
    }))
    const game = createGameState(
      'ABCDE',
      { ...settings, segmentEdgeLength: 5 },
      players,
    )

    expect(game.map.startHexIds).toHaveLength(5)
    for (const [index, player] of players.entries()) {
      chooseStart(game, player.id, game.map.startHexIds![index]!)
    }
    expect(game.status).toBe('ACTIVE')
    expect(new Set(game.players.map((player) => player.position)).size).toBe(5)

    expect(() =>
      createGameState('ABCDE', { ...settings, segmentEdgeLength: 5 }, [
        ...players,
        { id: 'p6', name: 'Player 6' },
      ]),
    ).toThrow(expect.objectContaining({ code: 'INVALID_ACTION' }))
  })

  it('shows starting visibility from every slot and keeps the opening hand visible', () => {
    const game = createGameState(
      'ABCDE',
      {
        ...settings,
        segmentEdgeLength: 9,
        petalCount: 3,
        fogMode: 'RANGE',
        terrainVisibilityRange: 6,
        costVisibilityRange: 4,
      },
      [
        { id: 'p1', name: 'Player 1' },
        { id: 'p2', name: 'Player 2' },
      ],
    )
    const starts = game.map.startHexIds!.map((id) =>
      game.map.tiles.find((tile) => tile.id === id)!,
    )
    const view = serializePublicGameState(game, 'p1')
    expect(starts).toHaveLength(9)
    expect(view.map.startHexIds).toHaveLength(9)
    expect(view.players[0]!.hand).toEqual(game.players[0]!.hand)
    for (const tile of view.map.tiles) {
      const distance = Math.min(
        ...starts.map((start) => axialDistance(start, tile)),
      )
      if (distance <= 4) {
        expect(tile.difficulty).toBeGreaterThanOrEqual(0)
      } else if (distance <= 6) {
        expect(tile.terrain).not.toBe('UNKNOWN')
        expect(tile.difficulty).toBe(-1)
      } else {
        expect(tile.terrain).toBe('UNKNOWN')
      }
    }
    const lastStart = starts[8]!.id
    chooseStart(game, 'p1', lastStart)
    expect(game.players[0]!.position).toBe(lastStart)
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

  it('builds a ten-card starting deck with one universal movement card', () => {
    const deck = buildStartingDeck('p1', 'STARTER-42')
    const movementTypes = deck.map(
      (card) => CARD_BY_ID[card.cardId]!.movementType,
    )

    expect(deck).toHaveLength(10)
    expect(movementTypes.filter((type) => type === 'GREEN')).toHaveLength(4)
    expect(movementTypes.filter((type) => type === 'YELLOW')).toHaveLength(3)
    expect(movementTypes.filter((type) => type === 'BLUE')).toHaveLength(2)
    expect(movementTypes.filter((type) => type === 'WILD')).toHaveLength(1)
    expect(CARD_BY_ID.wanderer_spark).toMatchObject({
      movementType: 'WILD',
      movementValue: 1,
      goldValue: 1,
    })
    expect(
      deck.every(
        (card) =>
          CARD_BY_ID[card.cardId]!.goldValue ===
          (card.cardId === 'coin' ? CARD_BY_ID.coin!.movementValue : 1),
      ),
    ).toBe(true)
  })

  it('draws a fresh hand immediately after the player ends their turn', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    const previousHand = [...player.hand]
    for (const card of previousHand) {
      playCard(game, player.id, card.instanceId, 'GOLD')
    }

    expect(player.hand).toHaveLength(0)
    endTurn(game, player.id)

    expect(game.currentPlayerId).toBe('p2')
    expect(player.hand).toHaveLength(5)
    expect(player.hand).not.toEqual(previousHand)
  })

  it('reshuffles the ending player discard pile before refilling their hand', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    const previousHand = [...player.hand]
    player.drawPile = []
    for (const card of previousHand) {
      playCard(game, player.id, card.instanceId, 'GOLD')
    }

    endTurn(game, player.id)

    expect(player.hand).toHaveLength(5)
    expect(player.drawPile).toHaveLength(0)
    expect(player.discardPile).toHaveLength(0)
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

  it('spends the chosen colors for a move requiring any movement', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    const target = findReachableTile(game, 'JUNGLE')
    target.terrain = 'RUBBLE'
    target.difficulty = 2
    target.isBlocked = false
    player.availableMovement = { GREEN: 2, BLUE: 2, YELLOW: 0, WILD: 0 }

    expect(() =>
      movePlayer(game, player.id, target.id, {
        GREEN: 3,
        BLUE: 0,
        YELLOW: 0,
        WILD: 0,
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_ACTION' }))
    expect(player.position).not.toBe(target.id)
    expect(player.availableMovement).toEqual({
      GREEN: 2,
      BLUE: 2,
      YELLOW: 0,
      WILD: 0,
    })

    movePlayer(game, player.id, target.id, {
      GREEN: 1,
      BLUE: 1,
      YELLOW: 0,
      WILD: 0,
    })
    expect(player.availableMovement).toEqual({
      GREEN: 1,
      BLUE: 1,
      YELLOW: 0,
      WILD: 0,
    })
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

  it('requires movement points to enter a portal', () => {
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

  it('wins at any of the three portals and pays that portal cost', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    const portalId = game.map.goalHexIds!.find(
      (id) => id !== game.map.goalHexId,
    )!
    const portal = game.map.tiles.find((tile) => tile.id === portalId)!
    const start = game.map.tiles.find((tile) => tile.id === player.position)!
    portal.q = start.q + 1
    portal.r = start.r
    portal.difficulty = 8
    player.availableMovement.WILD = 7

    expect(() => movePlayer(game, player.id, portal.id)).toThrow(
      expect.objectContaining({ code: 'NOT_ENOUGH_MOVEMENT' }),
    )
    player.availableMovement.WILD = 8
    movePlayer(game, player.id, portal.id)

    expect(player.availableMovement.WILD).toBe(0)
    expect(game.status).toBe('FINISHED')
    expect(game.winnerId).toBe(player.id)
  })

  it('finds every destination reachable with the movement pool and returns a walkable path', () => {
    const start: HexTile = {
      id: 'start',
      q: 0,
      r: 0,
      terrain: 'START',
      difficulty: 1,
      isBlocked: false,
    }
    const first: HexTile = {
      id: 'first',
      q: 1,
      r: 0,
      terrain: 'JUNGLE',
      difficulty: 1,
      isBlocked: false,
    }
    const second: HexTile = {
      id: 'second',
      q: 2,
      r: 0,
      terrain: 'JUNGLE',
      difficulty: 1,
      isBlocked: false,
    }
    const water: HexTile = {
      id: 'water',
      q: 1,
      r: -1,
      terrain: 'WATER',
      difficulty: 1,
      isBlocked: false,
    }
    const game = buildTestGame()
    const player = game.players[0]!
    game.map.tiles = [start, first, second, water]
    game.map.goalHexId = 'second'
    player.position = start.id
    player.availableMovement = { GREEN: 3, BLUE: 0, YELLOW: 0, WILD: 0 }

    const paths = getReachableMovePaths(game, player.id)

    expect(paths.get(first.id)).toEqual([first.id])
    expect(paths.get(second.id)).toEqual([first.id, second.id])
    expect(paths.has(water.id)).toBe(false)
    expect(player.availableMovement.GREEN).toBe(3)
  })

  it('allows buying cards when enough gold is available', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    const cardId = game.market[0]!
    const cost = CARD_BY_ID[cardId]!.purchaseCost
    const handSize = player.hand.length
    const discardSize = player.discardPile.length
    player.availableGold = cost
    player.availableMovement.YELLOW = 0

    buyCard(game, 'p1', cardId)

    const purchased = player.hand.at(-1)!
    expect(purchased.cardId).toBe(cardId)
    expect(player.hand).toHaveLength(handSize + 1)
    expect(player.discardPile).toHaveLength(discardSize)
    expect(player.availableGold).toBe(0)
    expect(player.availableMovement.YELLOW).toBe(0)
    player.availableGold = 10
    expect(() => buyCard(game, 'p1', game.market[0]!)).toThrow(
      expect.objectContaining({ code: 'PURCHASE_LIMIT' }),
    )

    playCard(game, player.id, purchased.instanceId, 'GOLD')
    expect(player.hand).toHaveLength(handSize)
    expect(player.playedCards).toContainEqual(purchased)
  })

  it('gives separate instance ids to two purchases added directly to hand', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    player.extraPurchaseAvailable = true
    player.availableGold = 100

    buyCard(game, player.id, game.market[0]!)
    const first = player.hand.at(-1)!
    buyCard(game, player.id, game.market[0]!)
    const second = player.hand.at(-1)!

    expect(first.instanceId).not.toBe(second.instanceId)
  })

  it('starts with four random offers and replenishes them after each purchase', () => {
    const game = buildTestGame()
    const sameSeedGame = buildTestGame()
    const player = game.players[0]!
    const seenOffers = new Set(game.market)

    expect(game.market).toHaveLength(4)
    expect(
      game.market.some((cardId) => CARD_BY_ID[cardId]!.purchaseCost <= 4),
    ).toBe(true)
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
      expect(new Set(game.market).size).toBe(game.market.length)
      expect(
        game.market.every(
          (offer) =>
            (game.cardPurchaseCounts?.[offer] ?? 0) < MARKET_CARD_COPY_LIMIT,
        ),
      ).toBe(true)
      expect(
        game.market.filter((cardId) => CARD_BY_ID[cardId]?.type === 'ACTION')
          .length,
      ).toBeLessThanOrEqual(1)
      expect(
        game.market.some((offer) => CARD_BY_ID[offer]!.purchaseCost <= 6),
      ).toBe(true)
      endTurn(game, 'p1')
      endTurn(game, 'p2')
    }
    expect(game.marketCycle).toBeGreaterThan(0)
    expect(
      [...seenOffers].some((cardId) => CARD_BY_ID[cardId]!.purchaseCost >= 5),
    ).toBe(true)
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
          CARD_BY_ID[cardId]!.purchaseCost <= 4,
      ),
    ).toBe(true)
  })

  it('prices movement by value and caps every card at nine gold', () => {
    expect(CARD_BY_ID.dune_runner).toMatchObject({
      movementType: 'YELLOW',
      movementValue: 3,
      goldValue: 3,
      purchaseCost: 5,
    })
    expect(MARKET_CARD_IDS).toContain('dune_runner')
    expect(MARKET_CARD_IDS).not.toContain('sand_merchant')
    expect(CARD_BY_ID.pathfinder).toMatchObject({
      movementType: 'GREEN',
      movementValue: 6,
      purchaseCost: 8,
    })
    expect(CARD_BY_ID.wayfarer).toMatchObject({
      movementType: 'WILD',
      movementValue: 4,
      purchaseCost: 8,
    })
    expect(CARD_BY_ID.flooded_forest!.purchaseCost).toBe(8)
    expect(CARD_BY_ID.echo_power!.purchaseCost).toBe(5)
    expect(getMarketTier(2)).toBe(1)
    expect(getMarketTier(4)).toBe(2)
    expect(getMarketTier(6)).toBe(3)
    expect(getMarketTier(9)).toBe(4)
    expect(
      Object.values(CARD_BY_ID).every(
        (card) => card.purchaseCost > 0 && card.purchaseCost <= 9,
      ),
    ).toBe(true)

    const game = buildTestGame()
    game.market = [
      'dune_runner',
      ...game.market.filter((cardId) => cardId !== 'dune_runner').slice(0, 3),
    ]
    game.players[0]!.availableGold = 5
    buyCard(game, 'p1', 'dune_runner')
    expect(game.players[0]!.hand.at(-1)?.cardId).toBe('dune_runner')
  })

  it('stops replenishing a card after three purchases in one game', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    game.cardPurchaseCounts = {}

    for (let copy = 0; copy < MARKET_CARD_COPY_LIMIT; copy += 1) {
      game.market = [
        'herbalist',
        ...game.market.filter((cardId) => cardId !== 'herbalist').slice(0, 3),
      ]
      player.availableGold = CARD_BY_ID.herbalist!.purchaseCost
      buyCard(game, player.id, 'herbalist')
      expect(game.cardPurchaseCounts?.herbalist).toBe(copy + 1)
      if (copy < MARKET_CARD_COPY_LIMIT - 1) {
        endTurn(game, 'p1')
        endTurn(game, 'p2')
      }
    }

    expect(game.market).not.toContain('herbalist')
  })

  it('does not keep duplicate cards in the market at the same time', () => {
    const game = buildTestGame()
    game.market = ['herbalist', 'herbalist', 'admiral', 'dune_runner']
    game.marketOfferExpiresAtTurns = game.market.map(() => game.turnNumber + 4)

    const player = game.players[0]!
    player.availableGold = CARD_BY_ID.herbalist!.purchaseCost
    buyCard(game, player.id, 'herbalist')

    expect(game.market).toHaveLength(4)
    expect(new Set(game.market).size).toBe(game.market.length)
  })

  it('keeps at most one spell or curse in the market', () => {
    const game = buildTestGame()
    game.market = ['second_wind', 'steal_plans', 'herbalist', 'admiral']
    game.players[0]!.availableGold = CARD_BY_ID.herbalist!.purchaseCost

    buyCard(game, 'p1', 'herbalist')

    expect(
      game.market.filter((cardId) => CARD_BY_ID[cardId]?.type === 'ACTION')
        .length,
    ).toBeLessThanOrEqual(1)
    expect(
      game.market.some((cardId) => CARD_BY_ID[cardId]!.purchaseCost <= 4),
    ).toBe(true)
  })

  it('keeps cheap cards common while giving expensive cards a chance', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    const giveRefreshToken = (instanceId: string) => {
      player.tokens!.push({ instanceId, type: 'REFRESH_MARKET' })
      activateToken(game, player.id, instanceId)
    }

    game.cardPurchaseCounts = {}
    const seenCosts = new Set<number>()
    for (let refresh = 0; refresh < 80; refresh += 1) {
      giveRefreshToken(`refresh-weighted-${refresh}`)
      for (const cardId of game.market) {
        seenCosts.add(CARD_BY_ID[cardId]!.purchaseCost)
      }
      expect(
        game.market.filter((id) => CARD_BY_ID[id]!.purchaseCost <= 6).length,
      ).toBeGreaterThanOrEqual(2)
      expect(
        game.market.filter((id) => CARD_BY_ID[id]?.type === 'ACTION').length,
      ).toBeLessThanOrEqual(1)
      game.roundNumber = (game.roundNumber ?? 1) + 1
    }

    expect([...seenCosts].some((cost) => cost >= 7)).toBe(true)
    expect([...seenCosts].some((cost) => cost <= 4)).toBe(true)
  })

  it('starts a game from an unchanged custom map snapshot', () => {
    const generated = createGameState('SOURCE', settings, [
      { id: 'source-1', name: 'Source 1' },
      { id: 'source-2', name: 'Source 2' },
    ]).map
    const customMap = structuredClone(generated)
    const editedTile = customMap.tiles.find(
      (tile) =>
        !customMap.startHexIds?.includes(tile.id) &&
        tile.id !== customMap.goalHexId,
    )!
    editedTile.terrain = 'WATER'
    editedTile.difficulty = 3

    const game = createGameState(
      'CUSTOM',
      { ...settings, seed: 'DIFFERENT' },
      [
        { id: 'p1', name: 'Player 1' },
        { id: 'p2', name: 'Player 2' },
      ],
      customMap,
    )

    expect(game.map).toEqual(customMap)
    expect(game.map).not.toBe(customMap)
    expect(
      game.map.tiles.find((tile) => tile.id === editedTile.id),
    ).toMatchObject({ terrain: 'WATER', difficulty: 3 })
  })

  it('uses second wind once, removes another card and draws four', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    const handSize = player.hand.length
    const removedCard = player.hand[0]!
    player.hand.push({
      cardId: 'second_wind',
      instanceId: 'second-wind-test',
    })

    activateActionCard(game, player.id, 'second-wind-test')

    expect(player.removedCards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cardId: 'second_wind' }),
        removedCard,
      ]),
    )
    expect(player.hand).toHaveLength(handSize + 3)
    expect(player.pendingDiscardCount).toBe(0)
    endTurn(game, player.id)
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

  it('lets a curse discard from the hand drawn after the target spent every card', () => {
    const game = buildTestGame()
    const target = game.players[0]!
    const caster = game.players[1]!
    for (const card of [...target.hand]) {
      playCard(game, target.id, card.instanceId, 'GOLD')
    }
    endTurn(game, target.id)
    expect(target.hand).toHaveLength(5)

    caster.hand.push({ cardId: 'steal_plans', instanceId: 'curse-after-draw' })
    activateActionCard(game, caster.id, 'curse-after-draw', target.id)
    expect(target.hand).toHaveLength(4)
    endTurn(game, caster.id)
    expect(target.hand).toHaveLength(4)
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

    activateActionCard(game, player.id, 'shortcut-map-test')
    expect(getReachableMovePaths(game, player.id).has(target.id)).toBe(false)
    player.availableMovement.GREEN = 1
    expect(
      getEffectiveMoveRequirements(player, start, target, game.map.tiles),
    ).toEqual([{ type: 'GREEN', amount: 1 }])
    expect(getReachableMovePaths(game, player.id).get(target.id)).toEqual([
      target.id,
    ])
    movePlayer(game, player.id, target.id)

    expect(player.position).toBe(target.id)
    expect(player.shortcutMoveAvailable).toBe(false)
  })

  it('allows entering occupied tiles for two own turns after phase walk', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    const opponent = game.players[1]!
    const target = findReachableTile(game, 'JUNGLE')
    const secondTarget = getNeighbors(game.map.tiles, target).find(
      (tile) => tile.id !== opponent.position && !tile.isBlocked,
    )!
    game.settings.allowSharedTiles = false
    target.difficulty = 1
    secondTarget.terrain = 'JUNGLE'
    secondTarget.difficulty = 1
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
    expect(player.sharedTileAccessAvailable).toBe(true)
    endTurn(game, opponent.id)
    opponent.position = secondTarget.id
    player.availableMovement.WILD = 10
    movePlayer(game, player.id, secondTarget.id)
    expect(player.position).toBe(secondTarget.id)
    endTurn(game, player.id)
    expect(player.sharedTileAccessAvailable).toBe(false)
  })

  it('moves an opponent to a chosen adjacent hex with fate swap', () => {
    const game = buildTestGame()
    const caster = game.players[0]!
    const target = game.players[1]!
    const targetTile = game.map.tiles.find(
      (tile) => tile.id === target.position,
    )!
    const destination = getNeighbors(game.map.tiles, targetTile).find(
      (tile) =>
        !tile.isBlocked &&
        !['MOUNTAIN', 'UNKNOWN'].includes(tile.terrain) &&
        !game.players.some((player) => player.position === tile.id),
    )!
    caster.hand.push({
      cardId: 'reshuffle_hand',
      instanceId: 'reshuffle-hand-test',
    })

    activateActionCard(
      game,
      caster.id,
      'reshuffle-hand-test',
      target.id,
      destination.id,
    )

    expect(target.position).toBe(destination.id)
    expect(caster.removedCards.at(-1)?.cardId).toBe('reshuffle_hand')
    expect(game.latestCurse).toMatchObject({
      cardId: 'reshuffle_hand',
      targetPlayerId: target.id,
      targetHexId: destination.id,
    })
  })

  it('blocks the next curse after using the curse shield rune', () => {
    const game = buildTestGame()
    const target = game.players[0]!
    const caster = game.players[1]!
    target.tokens!.push({
      instanceId: 'shield-rune-test',
      type: 'CURSE_SHIELD',
    })
    caster.hand.push({
      cardId: 'path_fracture',
      instanceId: 'blocked-rune-curse',
    })

    activateToken(game, target.id, 'shield-rune-test')
    expect(target.curseShieldAvailable).toBe(true)

    endTurn(game, target.id)
    activateActionCard(game, caster.id, 'blocked-rune-curse', target.id)

    expect(target.extraMoveCostPending).toBe(false)
    expect(target.curseShieldAvailable).toBe(false)
    expect(game.latestCurse).toMatchObject({
      cardId: 'path_fracture',
      blocked: true,
    })
  })

  it('doubles the next movement card with echo power', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    const coin = player.hand.find((card) => card.cardId === 'coin')!
    player.hand.push({ cardId: 'echo_power', instanceId: 'echo-power-test' })

    activateActionCard(game, player.id, 'echo-power-test')
    playCard(game, player.id, coin.instanceId, 'GOLD')

    expect(player.availableGold).toBe(CARD_BY_ID.coin!.goldValue * 2)
    expect(player.echoPowerAvailable).toBe(false)
  })

  it('exchanges a curse for one gold and returns it to the deck after reshuffling', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    const curse = { cardId: 'path_fracture', instanceId: 'gold-curse' }
    player.hand = [curse]
    player.drawPile = []
    player.discardPile = []

    expect(() =>
      playCard(game, player.id, curse.instanceId, 'MOVEMENT'),
    ).toThrow(expect.objectContaining({ code: 'INVALID_ACTION' }))
    expect(() =>
      playCard(game, player.id, curse.instanceId, 'GOLD', true),
    ).toThrow(expect.objectContaining({ code: 'INVALID_ACTION' }))
    playCard(game, player.id, curse.instanceId, 'GOLD')

    expect(player.availableGold).toBe(1)
    expect(player.playedCards).toContainEqual(curse)
    expect(player.removedCards).not.toContainEqual(curse)
    expect(game.latestCurse).toBeUndefined()
    endTurn(game, player.id)

    expect(player.hand).toContainEqual(curse)
    expect(player.removedCards).not.toContainEqual(curse)
  })

  it('echoes a movement card even after an action card was exchanged for gold', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    const coin = player.hand.find((card) => card.cardId === 'coin')!
    player.hand.push(
      { cardId: 'guide', instanceId: 'guide-gold' },
      { cardId: 'echo_power', instanceId: 'echo-after-action-gold' },
    )

    playCard(game, player.id, 'guide-gold', 'GOLD')
    activateActionCard(game, player.id, 'echo-after-action-gold')
    playCard(game, player.id, coin.instanceId, 'GOLD')

    expect(player.availableGold).toBe(CARD_BY_ID.coin!.goldValue * 2 + 1)
  })

  it('uses a spell and a curse in the same turn', () => {
    const game = buildTestGame()
    const caster = game.players[0]!
    const target = game.players[1]!
    caster.hand.push(
      { cardId: 'guide', instanceId: 'guide-combo' },
      { cardId: 'path_fracture', instanceId: 'curse-combo' },
    )

    activateActionCard(game, caster.id, 'guide-combo')
    activateActionCard(game, caster.id, 'curse-combo', target.id)

    expect(caster.guidedMoveAvailable).toBe(true)
    expect(target.extraMoveCostPending).toBe(true)
    expect(caster.removedCards.map((card) => card.instanceId)).toEqual(
      expect.arrayContaining(['guide-combo', 'curse-combo']),
    )
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
    expect(game.latestCurse).toMatchObject({
      instanceId: 'blocked-curse',
      playerId: caster.id,
      cardId: 'path_fracture',
      targetPlayerId: target.id,
      blocked: true,
    })
    activateActionCard(game, caster.id, 'active-curse', target.id)
    expect(target.extraMoveCostPending).toBe(true)
    expect(game.latestCurse?.blocked).toBe(false)
  })

  it('adds one point to every cursed move until the round ends', () => {
    const game = buildTestGame()
    const caster = game.players[0]!
    const player = game.players[1]!
    const origin = game.map.tiles.find((tile) => tile.id === player.position)!
    const destination = getNeighbors(game.map.tiles, origin).find(
      (tile) => tile.id !== caster.position,
    )!
    destination.terrain = 'JUNGLE'
    destination.difficulty = 1
    destination.isBlocked = false
    caster.hand.push({ cardId: 'path_fracture', instanceId: 'round-curse' })

    activateActionCard(game, caster.id, 'round-curse', player.id)
    endTurn(game, caster.id)
    player.availableMovement.WILD = 10
    movePlayer(game, player.id, destination.id)
    expect(player.extraMoveCostPending).toBe(true)

    player.availableMovement.WILD = 2
    expect(getReachableMovePaths(game, player.id).has(origin.id)).toBe(false)
    player.availableMovement.WILD = 10
    const beforeSecondMove = player.availableMovement.WILD
    movePlayer(game, player.id, origin.id)
    expect(
      beforeSecondMove - player.availableMovement.WILD,
    ).toBeGreaterThanOrEqual(3)
    expect(player.extraMoveCostPending).toBe(true)

    endTurn(game, player.id)
    expect(game.roundNumber).toBe(2)
    expect(player.extraMoveCostPending).toBe(false)
  })

  it('applies fog, poverty and market curses to an opponent', () => {
    const game = buildTestGame()
    const caster = game.players[0]!
    const target = game.players[1]!
    target.availableGold = 1
    const curseCards = [
      ['fog_of_forgetting', 'fog-test'],
      ['poverty_curse', 'poverty-test'],
      ['closed_market', 'market-test'],
    ] as const
    caster.hand.push(
      ...curseCards.map(([cardId, instanceId]) => ({ cardId, instanceId })),
    )
    const activateCurse = (instanceId: string) =>
      activateActionCard(game, caster.id, instanceId, target.id)

    for (const [, instanceId] of curseCards) {
      activateCurse(instanceId)
    }

    expect(target.fogCostsHidden).toBe(true)
    expect(target.availableGold).toBe(1)
    expect(target.nextPurchaseCostIncrease).toBe(2)
    expect(target.marketBlocked).toBe(true)
    endTurn(game, caster.id)
    target.availableGold = 20
    expect(() => buyCard(game, target.id, game.market[0]!)).toThrow(
      expect.objectContaining({ code: 'MARKET_LOCKED' }),
    )
    endTurn(game, target.id)
    expect(target.fogCostsHidden).toBe(false)
    expect(target.marketBlocked).toBe(false)
    endTurn(game, caster.id)
    const cardId = game.market[0]!
    const baseCost = CARD_BY_ID[cardId]!.purchaseCost
    target.availableGold = baseCost + 2
    buyCard(game, target.id, cardId)
    expect(target.availableGold).toBe(0)
    expect(target.nextPurchaseCostIncrease).toBe(0)
  })

  it('blocks an empty hex within two steps until the caster next plays', () => {
    const game = buildTestGame()
    const caster = game.players[0]!
    const origin = game.map.tiles.find((tile) => tile.id === caster.position)!
    const target = game.map.tiles.find(
      (tile) =>
        axialDistance(origin, tile) === 1 &&
        !tile.isBlocked &&
        !['START', 'GOAL', 'MOUNTAIN'].includes(tile.terrain) &&
        !game.players.some((player) => player.position === tile.id),
    )!
    expect(target).toBeDefined()
    caster.hand.push({ cardId: 'hex_seal', instanceId: 'seal-test' })
    expect(() =>
      activateActionCard(
        game,
        caster.id,
        'seal-test',
        undefined,
        caster.position,
      ),
    ).toThrow(expect.objectContaining({ code: 'INVALID_ACTION' }))
    expect(() =>
      activateActionCard(
        game,
        caster.id,
        'seal-test',
        undefined,
        game.players[1]!.position,
      ),
    ).toThrow(expect.objectContaining({ code: 'INVALID_ACTION' }))
    const distant = game.map.tiles.find(
      (tile) => axialDistance(origin, tile) > 2,
    )!
    expect(() =>
      activateActionCard(game, caster.id, 'seal-test', undefined, distant.id),
    ).toThrow(expect.objectContaining({ code: 'INVALID_ACTION' }))
    activateActionCard(game, caster.id, 'seal-test', undefined, target.id)
    expect(target.isBlocked).toBe(true)
    expect(game.latestCurse?.targetHexId).toBe(target.id)
    caster.availableMovement.WILD = 20
    expect(() => movePlayer(game, caster.id, target.id)).toThrow(
      expect.objectContaining({ code: 'HEX_BLOCKED' }),
    )
    endTurn(game, caster.id)
    expect(target.isBlocked).toBe(true)
    endTurn(game, game.players[1]!.id)
    expect(target.isBlocked).toBe(false)
    expect(game.temporaryBlockedHexes).toEqual([])
  })

  it('refreshes individual unsold offers after their player-turn lifetime', () => {
    const game = buildTestGame()
    const previousMarket = [...game.market]
    const previousMarketCycle = game.marketCycle
    const offerLifetime = Math.max(4, Math.ceil(game.players.length * 1.2))

    expect(game.marketOfferExpiresAtTurns).toEqual(
      game.market.map(() => game.turnNumber + offerLifetime),
    )

    for (let turn = 0; turn < offerLifetime - 1; turn += 1) {
      endTurn(game, game.currentPlayerId)
    }

    expect(game.market).toEqual(previousMarket)
    expect(game.marketCycle).toBe(previousMarketCycle)

    endTurn(game, game.currentPlayerId)

    expect(game.market).toHaveLength(4)
    expect(game.marketCycle).toBeGreaterThan(previousMarketCycle)
    expect(
      game.market.filter((cardId) => CARD_BY_ID[cardId]!.purchaseCost <= 6)
        .length,
    ).toBeGreaterThanOrEqual(2)
    expect(
      game.market.filter((cardId) => CARD_BY_ID[cardId]?.type === 'ACTION')
        .length,
    ).toBeLessThanOrEqual(1)
    expect(game.market.some((cardId) => !previousMarket.includes(cardId))).toBe(
      true,
    )
    expect(game.marketOfferExpiresAtTurns).toHaveLength(game.market.length)
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

    activateToken(game, caster.id, 'market-curse')

    expect(game.marketLockedUntilPlayerId).toBe(caster.id)
    expect(game.latestCurse).toMatchObject({
      instanceId: 'market-curse',
      playerId: caster.id,
      tokenType: 'CURSE_MARKET',
    })
    expect(game.latestCurse?.targetPlayerId).toBeUndefined()
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

    activateToken(game, caster.id, 'skip-curse')
    expect(leader.skipNextTurn).toBe(true)
    expect(game.latestCurse?.targetPlayerId).toBe(leader.id)

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

    activateToken(game, caster.id, 'remove-curse', opponent.id)

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
      { instanceId: 'green-token', type: 'GREEN_3' },
      { instanceId: 'gold-token', type: 'GOLD_4' },
    )

    activateToken(game, player.id, 'green-token')

    expect(player.availableMovement.GREEN).toBe(3)
    expect(player.tokens!.map((token) => token.instanceId)).toEqual([
      'gold-token',
    ])
    expect(() => activateToken(game, player.id, 'gold-token')).toThrow(
      expect.objectContaining({ code: 'TOKEN_LIMIT' }),
    )
    endTurn(game, 'p1')
    endTurn(game, 'p2')
    activateToken(game, player.id, 'gold-token')
    expect(player.availableGold).toBe(4)
    expect(player.tokens).toEqual([])
  })

  it('does not draw +2 movement runes or the hand swap rune', () => {
    const movementValues = TOKEN_DEFINITIONS.flatMap((token) =>
      token.effect.kind === 'MOVEMENT' ? [token.effect.value] : [],
    )
    const resourceValues = TOKEN_DEFINITIONS.flatMap((token) =>
      token.effect.kind === 'MOVEMENT' || token.effect.kind === 'GOLD'
        ? [token.effect.value]
        : [],
    )

    expect(new Set(movementValues)).toEqual(new Set([3, 4]))
    expect(new Set(resourceValues)).toEqual(new Set([2, 3, 4]))
    expect(TOKEN_DEFINITIONS.map((token) => token.type)).not.toEqual(
      expect.arrayContaining([
        'GREEN_2',
        'BLUE_2',
        'YELLOW_2',
        'WILD_2',
        'SWAP_HAND',
      ]),
    )
    expect(TOKEN_DEFINITIONS.map((token) => token.type)).toContain(
      'CURSE_SHIELD',
    )
  })

  it('grants movement without gold when new cards are played for movement', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    player.hand.push(
      { cardId: 'seasoned_sailor', instanceId: 'sailor-test' },
      { cardId: 'trader', instanceId: 'trader-test' },
    )

    playCard(game, 'p1', 'sailor-test')
    playCard(game, 'p1', 'trader-test')

    expect(player.availableMovement.BLUE).toBe(
      CARD_BY_ID.seasoned_sailor!.movementValue,
    )
    expect(player.availableMovement.YELLOW).toBe(
      CARD_BY_ID.trader!.movementValue,
    )
    expect(player.availableGold).toBe(0)
  })

  it('grants both movement colors from each mixed card but only gold when exchanged', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    player.hand.push(
      { cardId: 'river_grove', instanceId: 'river-grove-test' },
      { cardId: 'sunlit_grove', instanceId: 'sunlit-grove-test' },
      { cardId: 'desert_spring', instanceId: 'desert-spring-test' },
      { cardId: 'flooded_forest', instanceId: 'flooded-forest-test' },
    )

    playCard(game, player.id, 'river-grove-test', 'MOVEMENT')
    playCard(game, player.id, 'sunlit-grove-test', 'MOVEMENT')
    playCard(game, player.id, 'desert-spring-test', 'MOVEMENT')
    expect(player.availableMovement).toMatchObject({
      GREEN: 4,
      BLUE: 4,
      YELLOW: 4,
    })

    playCard(game, player.id, 'flooded-forest-test', 'GOLD')
    expect(player.availableMovement.GREEN).toBe(4)
    expect(player.availableMovement.BLUE).toBe(4)
    expect(player.availableGold).toBe(1)
  })

  it('doubles both mixed card colors when sacrificed or echoed', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    player.hand.push(
      { cardId: 'storm_oasis', instanceId: 'mixed-sacrifice' },
      { cardId: 'echo_power', instanceId: 'mixed-echo' },
    )

    activateActionCard(game, player.id, 'mixed-echo')
    playCard(game, player.id, 'mixed-sacrifice', 'MOVEMENT')

    expect(player.availableMovement.YELLOW).toBe(6)
    expect(player.availableMovement.BLUE).toBe(6)
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

  it('undoes the latest card play and restores the hand, points and round history', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    const originalHand = [...player.hand]
    const first = originalHand[0]!
    const second = originalHand[1]!

    playCard(game, player.id, first.instanceId, 'MOVEMENT')
    const movementAfterFirst = { ...player.availableMovement }
    playCard(game, player.id, second.instanceId, 'GOLD')

    expect(
      serializePublicGameState(game, player.id).players[0]!.canUndoCardPlay,
    ).toBe(true)
    expect(
      serializePublicGameState(game, player.id).undoableCardPlays,
    ).toBeUndefined()
    undoCardPlay(game, player.id)
    expect(player.hand.map((card) => card.instanceId)).toEqual(
      originalHand.slice(1).map((card) => card.instanceId),
    )
    expect(player.availableGold).toBe(0)
    expect(player.availableMovement).toEqual(movementAfterFirst)
    expect(game.roundPlayedCards.map((card) => card.instanceId)).toEqual([
      first.instanceId,
    ])

    undoCardPlay(game, player.id)
    expect(player.hand).toEqual(originalHand)
    expect(player.availableMovement).toEqual({
      GREEN: 0,
      BLUE: 0,
      YELLOW: 0,
      WILD: 0,
    })
    expect(player.playedCards).toEqual([])
    expect(game.roundPlayedCards).toEqual([])
    expect(
      serializePublicGameState(game, player.id).players[0]!.canUndoCardPlay,
    ).toBe(false)
    expect(() => undoCardPlay(game, player.id)).toThrow(
      expect.objectContaining({ code: 'INVALID_ACTION' }),
    )
  })

  it('restores a sacrificed card and its cooldown when its play is undone', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    const card = player.hand[0]!

    playCard(game, player.id, card.instanceId, 'GOLD', true)
    undoCardPlay(game, player.id)

    expect(player.hand[0]).toEqual(card)
    expect(player.removedCards).not.toContainEqual(card)
    expect(player.availableGold).toBe(0)
    expect(player.hasSacrificedCardThisTurn).toBe(false)
    expect(player.sacrificeCooldownTurns).toBe(0)
  })

  it('keeps undo after a failed move, but loses it after a successful move', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    const card = player.hand.find(
      (entry) => CARD_BY_ID[entry.cardId]?.movementType === 'GREEN',
    )!
    playCard(game, player.id, card.instanceId, 'MOVEMENT')
    expect(() => movePlayer(game, player.id, game.map.goalHexId)).toThrow()
    expect(game.undoableCardPlays?.[player.id]).toHaveLength(1)

    const current = game.map.tiles.find((tile) => tile.id === player.position)!
    const target = getNeighbors(game.map.tiles, current).find(
      (tile) =>
        !game.players.some(
          (other) => other.id !== player.id && other.position === tile.id,
        ),
    )!
    target.terrain = 'JUNGLE'
    target.isBlocked = false
    target.difficulty = 1
    movePlayer(game, player.id, target.id)
    expect(() => undoCardPlay(game, player.id)).toThrow(
      expect.objectContaining({ code: 'INVALID_ACTION' }),
    )
  })

  it('loses earlier undo after a purchase but can undo a later card play', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    const first = player.hand[0]!
    const second = player.hand[1]!
    playCard(game, player.id, first.instanceId, 'GOLD')
    player.availableGold = CARD_BY_ID[game.market[0]!]!.purchaseCost
    buyCard(game, player.id, game.market[0]!)

    expect(() => undoCardPlay(game, player.id)).toThrow(
      expect.objectContaining({ code: 'INVALID_ACTION' }),
    )
    playCard(game, player.id, second.instanceId, 'GOLD')
    undoCardPlay(game, player.id)
    expect(player.hand).toContainEqual(second)
    expect(game.roundPlayedCards.map((play) => play.instanceId)).toContain(
      first.instanceId,
    )
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

  it('keeps unplayed cards and draws back up to five at the end of the turn', () => {
    const game = buildTestGame()
    const player = game.players[0]!
    const playedCard = player.hand[0]!
    const retainedIds = player.hand.slice(1).map((card) => card.instanceId)

    playCard(game, 'p1', playedCard.instanceId, 'GOLD')
    endTurn(game, 'p1')

    expect(player.hand).toHaveLength(5)
    expect(player.hand.slice(0, 4).map((card) => card.instanceId)).toEqual(
      retainedIds,
    )
    expect(player.discardPile).toContainEqual(playedCard)
    endTurn(game, 'p2')
    expect(player.hand).toHaveLength(5)
    expect(player.hand.slice(0, 4).map((card) => card.instanceId)).toEqual(
      retainedIds,
    )
  })

  it('keeps a public card history for the current round', () => {
    const game = buildTestGame()
    const firstCard = game.players[0]!.hand[0]!
    playCard(game, 'p1', firstCard.instanceId, 'GOLD')
    endTurn(game, 'p1')
    expect(game.players[0]!.lastTurnPlayedCards).toMatchObject([
      { instanceId: firstCard.instanceId, mode: 'GOLD' },
    ])
    const secondCard = game.players[1]!.hand[0]!
    playCard(game, 'p2', secondCard.instanceId, 'MOVEMENT')

    expect(game.roundPlayedCards.map((entry) => entry.playerId)).toEqual([
      'p1',
      'p2',
    ])
    endTurn(game, 'p2')
    expect(game.roundPlayedCards).toEqual([])
    expect(game.players[0]!.lastTurnPlayedCards).toHaveLength(1)
    expect(game.players[1]!.lastTurnPlayedCards).toMatchObject([
      { instanceId: secondCard.instanceId, mode: 'MOVEMENT' },
    ])
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

  it('shows terrain and entry costs at separate custom ranges', () => {
    const game = createGameState(
      'ABCDE',
      {
        ...settings,
        fogMode: 'RANGE',
        terrainVisibilityRange: 2,
        costVisibilityRange: 1,
      },
      [
        { id: 'p1', name: 'Player 1' },
        { id: 'p2', name: 'Player 2' },
      ],
    )
    game.status = 'ACTIVE'
    const player = game.players[0]!
    player.position = game.map.startHexId
    const center = game.map.tiles.find((tile) => tile.id === player.position)!
    const view = serializePublicGameState(game, player.id)
    expect(view.map.tiles).toHaveLength(game.map.tiles.length)
    for (const tile of view.map.tiles) {
      const distance = axialDistance(center, tile)
      if (distance <= 1) {
        expect(tile.terrain).toBe(
          game.map.tiles.find((original) => original.id === tile.id)!.terrain,
        )
        expect(tile.difficulty).toBeGreaterThanOrEqual(0)
      } else if (distance <= 2) {
        expect(tile.terrain).not.toBe('UNKNOWN')
        expect(tile.difficulty).toBe(-1)
      } else {
        expect(tile.terrain).toBe('UNKNOWN')
        expect(tile.difficulty).toBe(-1)
      }
    }

    const previouslyKnown = game.map.tiles.find(
      (tile) => axialDistance(center, tile) === 1,
    )!
    const remote = game.map.tiles.find(
      (tile) => axialDistance(previouslyKnown, tile) > 2,
    )!
    player.position = remote.id
    expect(
      serializePublicGameState(game, player.id).map.tiles.find(
        (tile) => tile.id === previouslyKnown.id,
      )?.terrain,
    ).toBe('UNKNOWN')
  })

  it('supports whole-board terrain or cost visibility independently', () => {
    const game = createGameState(
      'ABCDE',
      {
        ...settings,
        fogMode: 'RANGE',
        terrainVisibilityRange: 'ALL',
        costVisibilityRange: 1,
      },
      [
        { id: 'p1', name: 'Player 1' },
        { id: 'p2', name: 'Player 2' },
      ],
    )
    game.status = 'ACTIVE'
    game.players[0]!.position = game.map.startHexId
    const center = game.map.tiles.find(
      (tile) => tile.id === game.map.startHexId,
    )!
    const distant = game.map.tiles.find(
      (tile) => axialDistance(center, tile) > 2,
    )!
    expect(
      serializePublicGameState(game, 'p1').map.tiles.find(
        (tile) => tile.id === distant.id,
      ),
    ).toMatchObject({ terrain: distant.terrain, difficulty: -1 })

    game.settings.terrainVisibilityRange = 2
    game.settings.costVisibilityRange = 'ALL'
    expect(
      serializePublicGameState(game, 'p1').map.tiles.find(
        (tile) => tile.id === distant.id,
      ),
    ).toMatchObject({
      terrain: distant.terrain,
      difficulty: distant.difficulty,
    })
  })

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
