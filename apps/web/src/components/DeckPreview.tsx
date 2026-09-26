import { CARD_BY_ID } from '@shared'
import type { CardInstance, PlayerState } from '@shared'
import { CardFace } from './CardFace.js'

const piles: Array<{
  label: string
  key: keyof Pick<
    PlayerState,
    'drawPile' | 'hand' | 'playedCards' | 'discardPile' | 'removedCards'
  >
}> = [
  { label: 'Pozostałe do dobrania', key: 'drawPile' },
  { label: 'Ręka', key: 'hand' },
  { label: 'Zagrane w tej turze', key: 'playedCards' },
  { label: 'Zagrane — czekają na przetasowanie', key: 'discardPile' },
  { label: 'Usunięte z gry', key: 'removedCards' },
]

function CardList({ cards }: { cards: CardInstance[] }) {
  if (cards.length === 0) {
    return <p className="deck-empty">Brak kart</p>
  }

  return (
    <div className="deck-card-grid" aria-label={`${cards.length} kart`}>
      {cards.map((instance) => {
        const card = CARD_BY_ID[instance.cardId]
        if (!card) return null

        return (
          <div
            key={instance.instanceId}
            className="card game-card deck-card"
            data-movement={card.movementType}
            data-card-type={card.type.toLowerCase()}
            data-action-category={card.actionCategory?.toLowerCase()}
          >
            <CardFace card={card} />
          </div>
        )
      })}
    </div>
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
      <p>
        Karty zagrane po zakończeniu tury czekają tutaj na przetasowanie.
        Zostaną dodane do stosu dobierania, gdy ten się wyczerpie.
      </p>
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
