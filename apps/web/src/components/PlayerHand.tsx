import { CARD_BY_ID } from '@shared'
import type { ReactNode } from 'react'
import type { CardPlayMode, PlayerState } from '@shared'
import { CardFace } from './CardFace.js'

interface PlayerHandProps {
  player: PlayerState | undefined
  isActive: boolean
  onPlayCard: (cardInstanceId: string, mode: CardPlayMode) => void
  onEndTurn: () => void
  market?: ReactNode
}

export function PlayerHand({
  player,
  isActive,
  onPlayCard,
  onEndTurn,
  market,
}: PlayerHandProps) {
  return (
    <div className="panel hand-panel">
      <div className="panel-header">
        <div className="hand-header-details">
          <strong>Ręka</strong>
          <small>
            {player && (
              <div
                className="hand-movement"
                aria-label="Twoje dostępne punkty ruchu"
              >
                <span>Zielone: {player.availableMovement.GREEN}</span>
                <span>Niebieskie: {player.availableMovement.BLUE}</span>
                <span>Żółte: {player.availableMovement.YELLOW}</span>
                <span>Dowolne: {player.availableMovement.WILD}</span>
              </div>
            )}
          </small>
        </div>
        <div className="hand-turn-actions">
          <button
            type="button"
            className="primary-button"
            disabled={!isActive}
            onClick={onEndTurn}
          >
            Zakończ turę
          </button>
          {market}
        </div>
      </div>

      <div className="card-grid hand-card-grid">
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
                  Złoto +{definition.goldValue}
                </button>
              </div>
            </div>
          )
        })}
        {player?.playedCards.map((card) => {
          const definition = CARD_BY_ID[card.cardId]
          if (!definition) {
            return null
          }
          return (
            <div
              key={card.instanceId}
              className="card game-card hand-card hand-card--used"
              data-movement={definition.movementType}
              aria-label={`${definition.name}, karta wykorzystana w tej rundzie`}
            >
              <CardFace card={definition} />
              <span className="hand-card-used-label">
                Wykorzystana w tej rundzie
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
