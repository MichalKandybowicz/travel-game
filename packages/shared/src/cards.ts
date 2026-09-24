import type { CardDefinition, CardInstance } from './types.js'

export const CARD_DEFINITIONS: CardDefinition[] = [
  {
    id: 'explorer',
    name: 'Explorer',
    type: 'MOVEMENT',
    movementType: 'GREEN',
    movementValue: 1,
    purchaseCost: 2,
    description: 'Gain 1 green movement.',
  },
  {
    id: 'scout',
    name: 'Scout',
    type: 'MOVEMENT',
    movementType: 'GREEN',
    movementValue: 2,
    purchaseCost: 3,
    description: 'Gain 2 green movement.',
  },
  {
    id: 'ranger',
    name: 'Ranger',
    type: 'MOVEMENT',
    movementType: 'GREEN',
    movementValue: 3,
    purchaseCost: 5,
    description: 'Gain 3 green movement.',
  },
  {
    id: 'sailor',
    name: 'Sailor',
    type: 'MOVEMENT',
    movementType: 'BLUE',
    movementValue: 1,
    purchaseCost: 2,
    description: 'Gain 1 blue movement.',
  },
  {
    id: 'captain',
    name: 'Captain',
    type: 'MOVEMENT',
    movementType: 'BLUE',
    movementValue: 2,
    purchaseCost: 4,
    description: 'Gain 2 blue movement.',
  },
  {
    id: 'coin',
    name: 'Coin',
    type: 'MOVEMENT',
    movementType: 'YELLOW',
    movementValue: 1,
    purchaseCost: 0,
    description: 'Gain 1 yellow movement and 1 gold.',
  },
  {
    id: 'trader',
    name: 'Trader',
    type: 'MOVEMENT',
    movementType: 'YELLOW',
    movementValue: 2,
    purchaseCost: 3,
    description: 'Gain 2 yellow movement and 2 gold.',
  },
  {
    id: 'adventurer',
    name: 'Adventurer',
    type: 'MOVEMENT',
    movementType: 'WILD',
    movementValue: 1,
    purchaseCost: 4,
    description: 'Gain 1 wild movement.',
  },
]

export const CARD_BY_ID = Object.fromEntries(
  CARD_DEFINITIONS.map((card) => [card.id, card]),
) as Record<string, CardDefinition>

export const STARTING_DECK: Array<{ cardId: string; count: number }> = [
  { cardId: 'explorer', count: 3 },
  { cardId: 'sailor', count: 1 },
  { cardId: 'coin', count: 4 },
]

export const MARKET_CARD_IDS = [
  'explorer',
  'scout',
  'ranger',
  'sailor',
  'trader',
  'adventurer',
]

export const createCardInstance = (
  cardId: string,
  instanceId: string,
): CardInstance => ({
  cardId,
  instanceId,
})
