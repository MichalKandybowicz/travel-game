import type { CardDefinition, MovementType } from '@shared'
import {
  cardDescription,
  cardLabels,
  cardMovementValues,
  movementLabels,
  movementUnitLabel,
} from '../labels.js'

export function MovementGlyph({ type }: { type: MovementType }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
      {type === 'GREEN' && (
        <>
          <path d="M12 47C12 22 31 12 53 11c0 24-12 42-35 42" />
          <path d="M17 51c9-14 18-23 31-32M30 37l-1-16M30 37l16 2" />
        </>
      )}
      {type === 'BLUE' && (
        <>
          <path d="M32 7c7 11 19 24 19 35a19 19 0 0 1-38 0C13 31 25 18 32 7Z" />
          <path d="M20 43c3 5 7 7 13 7M23 34c-2 3-3 5-3 8" />
        </>
      )}
      {type === 'YELLOW' && (
        <>
          <circle cx="32" cy="32" r="23" />
          <circle cx="32" cy="32" r="17" />
          <path d="M37 23c-3-3-11-3-13 2-3 7 13 5 13 12-1 6-10 7-15 3M31 18v28" />
        </>
      )}
      {type === 'WILD' && (
        <>
          <circle cx="32" cy="32" r="22" />
          <path d="M32 10v44M10 32h44M18 18l28 28M46 18 18 46" />
          <path d="m32 20 6 12-6 12-6-12 6-12Z" />
        </>
      )}
    </svg>
  )
}

export function CardFace({
  card,
  purchaseCost,
  compact = false,
  discardAction,
}: {
  card: CardDefinition
  purchaseCost?: number
  compact?: boolean
  discardAction?: { onDiscard: () => void; disabled: boolean }
}) {
  const discardButton = discardAction && (
    <button
      type="button"
      className="game-card__art-discard"
      aria-label={`Odrzuć kartę ${cardLabels[card.id]?.name ?? card.name}`}
      disabled={discardAction.disabled}
      onClick={discardAction.onDiscard}
    >
      <span>Odrzuć</span>
    </button>
  )
  if (card.type === 'ACTION') {
    const description = cardDescription(card)
    const symbols = {
      MAP_SHORTCUT: '↝',
      SECOND_WIND: '↻',
      MERCHANT_CARAVAN: 'Ⅱ',
      STEAL_PLANS: '⌁',
      GUIDE: '◇',
      PHASE_WALK: '◉',
      RESHUFFLE_HAND: '↺',
      ECHO_POWER: '◌',
      PROTECTIVE_CIRCLE: '⬡',
      PATH_FRACTURE: '⌁',
      FOG_OF_FORGETTING: '≋',
      POVERTY_CURSE: '−',
      TANGLED_ROOTS: '⌇',
      CLOSED_MARKET: '×',
      HEX_SEAL: '⬢',
    } as const
    return (
      <span className="game-card__inner">
        <span className="game-card__topline">
          {card.actionCategory === 'CURSE' ? 'Klątwa' : 'Zaklęcie'}
        </span>
        <strong className="game-card__name">
          {cardLabels[card.id]?.name ?? card.name}
        </strong>
        <span
          className={`game-card__art action-card-art${discardAction ? ' game-card__art--discardable' : ''}`}
        >
          <span aria-hidden="true">
            {card.actionEffect ? symbols[card.actionEffect] : '◆'}
          </span>
          {discardButton}
        </span>
        <span className="game-card__action-effect" title={description}>
          {description}
        </span>
        {purchaseCost !== undefined && (
          <span className="game-card__footer">Koszt: {purchaseCost} złota</span>
        )}
      </span>
    )
  }
  return (
    <span className="game-card__inner">
      <span className="game-card__topline">Karta mocy</span>
      <strong className="game-card__name">
        {cardLabels[card.id]?.name ?? card.name}
      </strong>
      <span
        className={`game-card__art${card.secondaryMovementType ? ' game-card__art--mixed' : ''}${discardAction ? ' game-card__art--discardable' : ''}`}
      >
        <MovementGlyph type={card.movementType} />
        {card.secondaryMovementType && (
          <MovementGlyph type={card.secondaryMovementType} />
        )}
        {discardButton}
      </span>
      {compact && (
        <span className="game-card__hand-summary" title={cardDescription(card)}>
          {cardDescription(card)}
        </span>
      )}
      {!compact && (
        <>
          <span className="game-card__effect">
            <strong>{cardMovementValues(card)}</strong>
            <span>
              {card.secondaryMovementType
                ? `${movementLabels[card.movementType]} + ${movementLabels[card.secondaryMovementType]} punkty ruchu`
                : movementUnitLabel(card.movementType, card.movementValue)}
            </span>
          </span>
          <span className="game-card__footer">
            {purchaseCost === undefined
              ? `Zamiana: +${card.goldValue} złota`
              : `Koszt: ${purchaseCost} złota · Zamiana: +${card.goldValue} złota`}
          </span>
        </>
      )}
    </span>
  )
}
