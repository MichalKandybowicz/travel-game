import type { MovementType, TokenType } from './types.js'

export type TokenEffect =
  | { kind: 'MOVEMENT'; movementType: MovementType; value: 2 | 3 | 4 }
  | { kind: 'GOLD'; value: 2 | 3 | 4 }
  | { kind: 'SWAP_HAND' }
  | { kind: 'DRAW_CARD' }
  | { kind: 'REFRESH_MARKET' }
  | { kind: 'CURSE_SHIELD' }
  | { kind: 'CURSE_REMOVE_CARD' }
  | { kind: 'CURSE_SKIP_LEADER' }
  | { kind: 'CURSE_MARKET' }

export interface TokenDefinition {
  type: TokenType
  effect: TokenEffect
}

export const TOKEN_DEFINITIONS: readonly TokenDefinition[] = [
  {
    type: 'GREEN_3',
    effect: { kind: 'MOVEMENT', movementType: 'GREEN', value: 3 },
  },
  {
    type: 'GREEN_4',
    effect: { kind: 'MOVEMENT', movementType: 'GREEN', value: 4 },
  },
  {
    type: 'BLUE_3',
    effect: { kind: 'MOVEMENT', movementType: 'BLUE', value: 3 },
  },
  {
    type: 'BLUE_4',
    effect: { kind: 'MOVEMENT', movementType: 'BLUE', value: 4 },
  },
  {
    type: 'YELLOW_3',
    effect: { kind: 'MOVEMENT', movementType: 'YELLOW', value: 3 },
  },
  {
    type: 'YELLOW_4',
    effect: { kind: 'MOVEMENT', movementType: 'YELLOW', value: 4 },
  },
  {
    type: 'WILD_3',
    effect: { kind: 'MOVEMENT', movementType: 'WILD', value: 3 },
  },
  {
    type: 'WILD_4',
    effect: { kind: 'MOVEMENT', movementType: 'WILD', value: 4 },
  },
  { type: 'GOLD_2', effect: { kind: 'GOLD', value: 2 } },
  { type: 'GOLD_3', effect: { kind: 'GOLD', value: 3 } },
  { type: 'GOLD_4', effect: { kind: 'GOLD', value: 4 } },
  { type: 'DRAW_CARD', effect: { kind: 'DRAW_CARD' } },
  { type: 'REFRESH_MARKET', effect: { kind: 'REFRESH_MARKET' } },
  { type: 'CURSE_SHIELD', effect: { kind: 'CURSE_SHIELD' } },
  { type: 'CURSE_REMOVE_CARD', effect: { kind: 'CURSE_REMOVE_CARD' } },
  { type: 'CURSE_SKIP_LEADER', effect: { kind: 'CURSE_SKIP_LEADER' } },
  { type: 'CURSE_MARKET', effect: { kind: 'CURSE_MARKET' } },
]

// Saved games can still contain removed runes, while new runes are drawn only
// from TOKEN_DEFINITIONS.
const legacyTokenDefinitions: TokenDefinition[] = [
  {
    type: 'GREEN_1',
    effect: { kind: 'MOVEMENT', movementType: 'GREEN', value: 2 },
  },
  {
    type: 'BLUE_1',
    effect: { kind: 'MOVEMENT', movementType: 'BLUE', value: 2 },
  },
  {
    type: 'YELLOW_1',
    effect: { kind: 'MOVEMENT', movementType: 'YELLOW', value: 2 },
  },
  {
    type: 'WILD_1',
    effect: { kind: 'MOVEMENT', movementType: 'WILD', value: 2 },
  },
  { type: 'GOLD_1', effect: { kind: 'GOLD', value: 2 } },
  {
    type: 'GREEN_2',
    effect: { kind: 'MOVEMENT', movementType: 'GREEN', value: 2 },
  },
  {
    type: 'BLUE_2',
    effect: { kind: 'MOVEMENT', movementType: 'BLUE', value: 2 },
  },
  {
    type: 'YELLOW_2',
    effect: { kind: 'MOVEMENT', movementType: 'YELLOW', value: 2 },
  },
  {
    type: 'WILD_2',
    effect: { kind: 'MOVEMENT', movementType: 'WILD', value: 2 },
  },
  { type: 'SWAP_HAND', effect: { kind: 'SWAP_HAND' } },
]

export const TOKEN_BY_TYPE = Object.fromEntries(
  [...TOKEN_DEFINITIONS, ...legacyTokenDefinitions].map((definition) => [
    definition.type,
    definition,
  ]),
) as Record<TokenType, TokenDefinition>
