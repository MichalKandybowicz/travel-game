import { CARD_BY_ID } from '@shared'
import type { CardPlayMode, PlayerState } from '@shared'
import { CardFace } from './CardFace.js'

interface PlayerHandProps {
  player: PlayerState | undefined
  isActive: boolean
  onPlayCard: (cardInstanceId: string, mode: CardPlayMode) => void
}

export function PlayerHand({ player, isActive, onPlayCard }: PlayerHandProps) {
  return (
    <div className="panel hand-panel">
      <div className="panel-header">
        <strong>Ręka</strong>
        <span>
          Dobieranie: {player?.drawPile.length ?? 0} / Odrzucone:{' '}
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
            <div
              key={card.instanceId}
              className="card game-card hand-card"
              data-movement={definition.movementType}
            >
              <CardFace card={definition} />
              <div className="hand-card-actions">
                <button
                  type="button"
                  disabled={!isActive}
                  onClick={() => onPlayCard(card.instanceId, 'MOVEMENT')}
                >
                  Ruch +{definition.movementValue}
                </button>
                <button
                  type="button"
                  disabled={!isActive}
                  onClick={() => onPlayCard(card.instanceId, 'GOLD')}
                >
                  Złoto +{card.cardId === 'coin' ? 2 : 1}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
