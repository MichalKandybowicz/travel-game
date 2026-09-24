import type { CardDefinition, MovementType } from '@shared'
import { cardLabels, movementLabels } from '../labels.js'

function MovementGlyph({ type }: { type: MovementType }) {
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
}: {
  card: CardDefinition
  purchaseCost?: number
}) {
  return (
    <span className="game-card__inner">
      <span className="game-card__topline">Karta ruchu</span>
      <strong className="game-card__name">
        {cardLabels[card.id]?.name ?? card.name}
      </strong>
      <span className="game-card__art">
        <MovementGlyph type={card.movementType} />
      </span>
      <span className="game-card__effect">
        <strong>+{card.movementValue}</strong>
        <span>{movementLabels[card.movementType]} punkty ruchu</span>
      </span>
      <span className="game-card__footer">
        {purchaseCost === undefined
          ? `Zamiana: +${card.goldValue} złota`
          : `Koszt: ${purchaseCost} złota · Zamiana: +${card.goldValue} złota`}
      </span>
    </span>
  )
}
