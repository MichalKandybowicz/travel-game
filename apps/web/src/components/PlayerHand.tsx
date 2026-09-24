import { CARD_BY_ID } from '@shared'
import type { PlayerState } from '@shared'

interface PlayerHandProps {
  player: PlayerState | undefined
  isActive: boolean
  onPlayCard: (cardInstanceId: string) => void
}

export function PlayerHand({ player, isActive, onPlayCard }: PlayerHandProps) {
  return (
    <div className="panel hand-panel">
      <div className="panel-header">
        <strong>Hand</strong>
        <span>
          Deck {player?.drawPile.length ?? 0} / Discard{' '}
          {player?.discardPile.length ?? 0}
        </span>
      </div>
      <div className="card-grid">
        {player?.hand.map((card) => {
          const definition = CARD_BY_ID[card.cardId]
          if (!definition) {
            return null
          }
          return (
            <button
              key={card.instanceId}
              type="button"
              className="card"
              disabled={!isActive}
              onClick={() => onPlayCard(card.instanceId)}
            >
              <strong>{definition.name}</strong>
              <span>
                {definition.movementType} +{definition.movementValue}
              </span>
              <small>{definition.description}</small>
            </button>
          )
        })}
      </div>
    </div>
  )
}
