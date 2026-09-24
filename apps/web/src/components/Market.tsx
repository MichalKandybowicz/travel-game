import { useEffect, useRef, useState } from 'react'
import { CARD_BY_ID } from '@shared'
import type { GameState, PlayerState } from '@shared'
import { cardLabels } from '../labels.js'
import { CardFace } from './CardFace.js'

interface MarketProps {
  game: GameState
  player: PlayerState | undefined
  isActive: boolean
  onBuyCard: (cardId: string) => void
}

export function Market({ game, player, isActive, onBuyCard }: MarketProps) {
  const carouselRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollButtons = () => {
    const carousel = carouselRef.current
    if (!carousel) return
    setCanScrollLeft(carousel.scrollLeft > 1)
    setCanScrollRight(
      carousel.scrollLeft + carousel.clientWidth < carousel.scrollWidth - 1,
    )
  }

  useEffect(() => {
    updateScrollButtons()
    window.addEventListener('resize', updateScrollButtons)
    return () => window.removeEventListener('resize', updateScrollButtons)
  }, [game.market])

  const scrollCards = (direction: -1 | 1) => {
    const carousel = carouselRef.current
    const card = carousel?.querySelector<HTMLElement>('.market-card')
    carousel?.scrollBy({
      left: direction * ((card?.offsetWidth ?? 180) + 10),
      behavior: 'smooth',
    })
  }

  return (
    <section className="panel market-panel">
      <div className="panel-header">
        <strong>Rynek</strong>
        <span>Złoto: {player?.availableGold ?? 0}</span>
      </div>
      <small className="market-hint">
        {player?.hasBoughtThisTurn
          ? 'Zakup w tej turze został wykorzystany.'
          : 'Możesz kupić jedną kartę w swojej turze. Oferta uzupełni się po zakupie.'}
      </small>
      <div className="market-carousel-controls">
        <span>Oferty: {game.market.length}</span>
        <div>
          <button
            type="button"
            aria-label="Poprzednia karta w sklepie"
            disabled={!canScrollLeft}
            onClick={() => scrollCards(-1)}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Następna karta w sklepie"
            disabled={!canScrollRight}
            onClick={() => scrollCards(1)}
          >
            ›
          </button>
        </div>
      </div>
      <div
        className="market-carousel"
        ref={carouselRef}
        onScroll={updateScrollButtons}
        aria-label="Karty dostępne w sklepie"
        role="region"
        tabIndex={0}
      >
        {game.market.map((cardId) => {
          const card = CARD_BY_ID[cardId]
          if (!card) {
            return null
          }
          const affordable = (player?.availableGold ?? 0) >= card.purchaseCost
          return (
            <button
              key={card.id}
              type="button"
              className="card game-card market-card"
              data-movement={card.movementType}
              disabled={!isActive || !affordable || player?.hasBoughtThisTurn}
              title={cardLabels[card.id]?.description ?? card.description}
              onClick={() => onBuyCard(card.id)}
            >
              <CardFace card={card} purchaseCost={card.purchaseCost} />
            </button>
          )
        })}
      </div>
    </section>
  )
}
