import {
  CARD_BY_ID,
  MARKET_CHEAPEST_CARD_CHANCES,
} from '../../shared/src/index.js'
import { SeededRandom } from '../../map-generator/src/index.js'

export const pickCheapestMarketCard = (
  random: SeededRandom,
  cardIds: string[],
  cheapestOfferCount: number,
): string | undefined => {
  if (cardIds.length === 0) return undefined
  const chance = MARKET_CHEAPEST_CARD_CHANCES[cheapestOfferCount] ?? 0
  if (chance < 1 && random.next() >= chance) return undefined
  const cheapestCost = Math.min(
    ...cardIds.map((cardId) => CARD_BY_ID[cardId]!.purchaseCost),
  )
  return random.pick(
    cardIds.filter(
      (cardId) => CARD_BY_ID[cardId]!.purchaseCost === cheapestCost,
    ),
  )
}
