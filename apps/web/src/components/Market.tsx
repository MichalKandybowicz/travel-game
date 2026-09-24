import { CARD_BY_ID } from '@shared'
import type { GameState, PlayerState } from '@shared'
import { CardFace } from './CardFace.js'

interface MarketProps {
  game: GameState
  player: PlayerState | undefined
  isActive: boolean
  onBuyCard: (cardId: string) => void
}

export function Market({ game, player, isActive, onBuyCard }: MarketProps) {
  return (
    <div className="panel market-panel">
      <div className="panel-header">
        <strong>Rynek</strong>
        <span>Złoto: {player?.availableGold ?? 0}</span>
      </div>
      <small className="market-hint">
        Cztery losowe oferty. Po zakupie pojawia się kolejna karta.
      </small>
      <div className="market-grid">
        {game.market.map((cardId) => {
          const card = CARD_BY_ID[cardId]
          if (!card) {
            return null
          }
          const affordable =
            (player?.availableGold ?? 0) >= card.purchaseCost
          return (
            <button
              key={card.id}
              type="button"
              className="card game-card market-card"
              data-movement={card.movementType}
              disabled={!isActive || !affordable}
              onClick={() => onBuyCard(card.id)}
            >
              <CardFace card={card} purchaseCost={card.purchaseCost} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
