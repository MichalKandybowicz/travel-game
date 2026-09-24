import { CARD_BY_ID } from '@shared'
import type { CardInstance, PlayerState } from '@shared'
import { cardLabels, movementLabels } from '../labels.js'

const piles: Array<{
  label: string
  key: keyof Pick<
    PlayerState,
    'drawPile' | 'hand' | 'playedCards' | 'discardPile' | 'removedCards'
  >
}> = [
  { label: 'Stos dobierania', key: 'drawPile' },
  { label: 'Ręka', key: 'hand' },
  { label: 'Zagrane w tej turze', key: 'playedCards' },
  { label: 'Stos odrzuconych', key: 'discardPile' },
  { label: 'Usunięte z gry', key: 'removedCards' },
]

function CardList({ cards }: { cards: CardInstance[] }) {
  const counts = new Map<string, number>()
  for (const card of cards) {
    counts.set(card.cardId, (counts.get(card.cardId) ?? 0) + 1)
  }

  if (cards.length === 0) {
    return <span>Brak kart</span>
  }

  return (
    <ul className="deck-card-list">
      {[...counts.entries()].map(([cardId, count]) => {
        const card = CARD_BY_ID[cardId]
        return (
          <li key={cardId}>
            <span>
              {cardLabels[cardId]?.name ?? card?.name ?? cardId} × {count}
            </span>
            {card && (
              <small>
                {movementLabels[card.movementType]} +{card.movementValue}
              </small>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function DeckPreview({ player }: { player: PlayerState | undefined }) {
  if (!player) {
    return null
  }

  return (
    <details className="panel deck-preview">
      <summary>
        Moja talia (
        {player.drawPile.length +
          player.hand.length +
          player.playedCards.length +
          player.discardPile.length}{' '}
        kart)
      </summary>
      <p>Karty w stosie dobierania są pogrupowane według rodzaju.</p>
      <div className="deck-piles">
        {piles.map(({ label, key }) => (
          <section key={key}>
            <h3>
              {label} ({player[key].length})
            </h3>
            <CardList cards={player[key]} />
          </section>
        ))}
      </div>
    </details>
  )
}
