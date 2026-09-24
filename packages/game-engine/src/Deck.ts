import type { CardInstance, PlayerState } from '../../shared/src/index.js'
import { createCardInstance, STARTING_DECK } from '../../shared/src/index.js'
import { SeededRandom } from '../../map-generator/src/index.js'

const shuffleCards = (cards: CardInstance[], seed: string): CardInstance[] => {
  const random = new SeededRandom(seed)
  return random.shuffle(cards)
}

export const buildStartingDeck = (
  playerId: string,
  seed: string,
): CardInstance[] => {
  const cards: CardInstance[] = []
  let counter = 0
  for (const entry of STARTING_DECK) {
    for (let count = 0; count < entry.count; count += 1) {
      cards.push(createCardInstance(entry.cardId, `${playerId}-${counter}`))
      counter += 1
    }
  }
  return shuffleCards(cards, seed)
}

export const drawCards = (
  player: PlayerState,
  amount: number,
  seed: string,
): void => {
  for (let count = 0; count < amount; count += 1) {
    if (player.drawPile.length === 0 && player.discardPile.length > 0) {
      player.drawPile = shuffleCards(player.discardPile, seed)
      player.discardPile = []
    }
    const card = player.drawPile.shift()
    if (!card) {
      return
    }
    player.hand.push(card)
  }
}
