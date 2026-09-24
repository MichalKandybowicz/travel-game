import { CARD_BY_ID } from '@shared'
import type { GameState, PlayerState } from '@shared'

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
        <strong>Market</strong>
        <span>Gold: {player?.availableGold ?? 0}</span>
      </div>
      <div className="market-grid">
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
              className="card market-card"
              disabled={!isActive || !affordable}
              onClick={() => onBuyCard(card.id)}
            >
              <strong>{card.name}</strong>
              <span>
                {card.movementType} +{card.movementValue}
              </span>
              <span>Cost: {card.purchaseCost}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
