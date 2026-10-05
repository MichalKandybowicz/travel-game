import { CARD_BY_ID, type MovementType } from '@shared'
import type { CardDefinition, CardInstance, PlayerState } from '@shared'
import { useRef } from 'react'
import { movementLabels } from '../labels.js'
import { CardFace, MovementGlyph } from './CardFace.js'

const movementTypes: MovementType[] = ['GREEN', 'BLUE', 'YELLOW', 'WILD']

const piles: Array<{
  label: string
  shortLabel: string
  key: keyof Pick<
    PlayerState,
    'drawPile' | 'hand' | 'playedCards' | 'discardPile' | 'removedCards'
  >
}> = [
  { label: 'Pozostałe do dobrania', shortLabel: 'Dobieranie', key: 'drawPile' },
  { label: 'Ręka', shortLabel: 'Ręka', key: 'hand' },
  {
    label: 'Zagrane w tej turze',
    shortLabel: 'W tej turze',
    key: 'playedCards',
  },
  {
    label: 'Zagrane — czekają na przetasowanie',
    shortLabel: 'Odrzucone',
    key: 'discardPile',
  },
  { label: 'Usunięte z gry', shortLabel: 'Usunięte', key: 'removedCards' },
]

type DeckStats = {
  cardCount: number
  movementCardCount: number
  actionCardCount: number
  goldTotal: number
  movement: Record<MovementType, number>
  totalMovement: number
}

const emptyMovement = (): Record<MovementType, number> => ({
  GREEN: 0,
  BLUE: 0,
  YELLOW: 0,
  WILD: 0,
})

const cardDefinitions = (cards: CardInstance[]): CardDefinition[] =>
  cards.flatMap((instance) => {
    const card = CARD_BY_ID[instance.cardId]
    return card ? [card] : []
  })

const calculateStats = (cards: CardInstance[]): DeckStats => {
  const stats: DeckStats = {
    cardCount: cards.length,
    movementCardCount: 0,
    actionCardCount: 0,
    goldTotal: 0,
    movement: emptyMovement(),
    totalMovement: 0,
  }

  for (const card of cardDefinitions(cards)) {
    stats.goldTotal += card.goldValue
    if (card.type === 'ACTION') {
      stats.actionCardCount += 1
      continue
    }
    stats.movementCardCount += 1
    stats.movement[card.movementType] += card.movementValue
    stats.totalMovement += card.movementValue
    if (card.secondaryMovementType && card.secondaryMovementValue) {
      stats.movement[card.secondaryMovementType] += card.secondaryMovementValue
      stats.totalMovement += card.secondaryMovementValue
    }
  }

  return stats
}

const formatAverage = (total: number, count: number): string =>
  count > 0 ? (total / count).toFixed(1) : '0.0'

function MovementBreakdown({ stats }: { stats: DeckStats }) {
  return (
    <div className="deck-stat-movement" aria-label="Punkty ruchu w talii">
      {movementTypes.map((type) => (
        <span key={type} title={movementLabels[type]} data-movement={type}>
          <MovementGlyph type={type} />
          <strong>{stats.movement[type]}</strong>
        </span>
      ))}
    </div>
  )
}

function StatsCard({ title, stats }: { title: string; stats: DeckStats }) {
  return (
    <article className="deck-stat-card">
      <header>
        <strong>{title}</strong>
        <span>{stats.cardCount} kart</span>
      </header>
      <MovementBreakdown stats={stats} />
      <dl>
        <div>
          <dt>Suma ruchu</dt>
          <dd>{stats.totalMovement}</dd>
        </div>
        <div>
          <dt>Śr. ruch/kartę</dt>
          <dd>{formatAverage(stats.totalMovement, stats.cardCount)}</dd>
        </div>
        <div>
          <dt>Śr. złota/kartę</dt>
          <dd>{formatAverage(stats.goldTotal, stats.cardCount)}</dd>
        </div>
        <div>
          <dt>Karty ruchu</dt>
          <dd>{stats.movementCardCount}</dd>
        </div>
        <div>
          <dt>Zaklęcia i klątwy</dt>
          <dd>{stats.actionCardCount}</dd>
        </div>
      </dl>
    </article>
  )
}

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
            data-secondary-movement={card.secondaryMovementType}
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
  const dialogRef = useRef<HTMLDialogElement>(null)
  if (!player) {
    return null
  }

  const allCards = piles.flatMap(({ key }) => player[key])
  const totalStats = calculateStats(allCards)
  const nextTurnStats = calculateStats(player.drawPile)

  return (
    <>
      <button
        type="button"
        className="deck-trigger"
        onClick={() => dialogRef.current?.showModal()}
      >
        Moja talia ({allCards.length})
      </button>
      <dialog
        ref={dialogRef}
        className="deck-dialog"
        aria-labelledby="deck-dialog-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close()
        }}
      >
        <div className="deck-dialog-content">
          <header className="deck-dialog-header">
            <div>
              <small>Podsumowanie kart</small>
              <h2 id="deck-dialog-title">Moja talia</h2>
            </div>
            <button
              type="button"
              aria-label="Zamknij talię"
              onClick={() => dialogRef.current?.close()}
            >
              ×
            </button>
          </header>
          <p className="deck-dialog-lead">
            Karty zagrane po zakończeniu tury czekają tutaj na przetasowanie.
            Zostaną dodane do stosu dobierania, gdy ten się wyczerpie.
          </p>
          <section className="deck-summary" aria-label="Statystyki talii">
            <StatsCard title="Cała talia" stats={totalStats} />
            <StatsCard
              title="Do dobrania w kolejnej turze"
              stats={nextTurnStats}
            />
          </section>
          <div className="deck-piles">
            {piles.map(({ label, key }) => (
              <section key={key} className="deck-pile-section">
                <h3>
                  {label} <span>{player[key].length}</span>
                </h3>
                <CardList cards={player[key]} />
              </section>
            ))}
          </div>
        </div>
      </dialog>
    </>
  )
}
