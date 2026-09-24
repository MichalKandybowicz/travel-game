import { CARD_BY_ID } from '@shared'
import type { CardPlayMode, PlayerState } from '@shared'
import { CardFace } from './CardFace.js'

interface PlayerHandProps {
  player: PlayerState | undefined
  isActive: boolean
  onPlayCard: (cardInstanceId: string, mode: CardPlayMode) => void
  onEndTurn: () => void
}

export function PlayerHand({
  player,
  isActive,
  onPlayCard,
  onEndTurn,
}: PlayerHandProps) {
  return (
    <div className="panel hand-panel">
      <div className="panel-header">
        <div className="hand-header-details">
          <strong>Ręka</strong>
          <small>
            Dobieranie: {player?.drawPile.length ?? 0} / Odrzucone:{' '}
            {player?.discardPile.length ?? 0}
          </small>
        </div>
        <button
          type="button"
          className="primary-button"
          disabled={!isActive}
          onClick={onEndTurn}
        >
          Zakończ turę
        </button>
      </div>
      {player && (
        <div className="hand-movement" aria-label="Twoje dostępne punkty ruchu">
          <span>Zielone: {player.availableMovement.GREEN}</span>
          <span>Niebieskie: {player.availableMovement.BLUE}</span>
          <span>Żółte: {player.availableMovement.YELLOW}</span>
          <span>Dowolne: {player.availableMovement.WILD}</span>
        </div>
      )}
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
      </div>
    </div>
  )
}
