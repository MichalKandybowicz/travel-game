import { CARD_BY_ID } from '@shared'
import type { PlayerState } from '@shared'
import { cardLabels, cardMovementValues, movementLabels } from '../labels.js'

export function PlayedCards({ player }: { player: PlayerState }) {
  const playerPlays = player.lastTurnPlayedCards ?? []

  return (
    <details className="player-journey-details">
      <summary>Zagrane karty z ostatniej tury ({playerPlays.length})</summary>
      <div className="player-journey-content">
        <div>
          {playerPlays.length === 0 ? (
            <small className="player-detail-empty">Brak zagranych kart</small>
          ) : (
            <div className="mini-card-grid">
              {playerPlays.map((play) => {
                const card = CARD_BY_ID[play.cardId]
                if (!card) return null
                return (
                  <div
                    key={play.instanceId}
                    className="mini-card"
                    data-movement={card.movementType}
                    data-secondary-movement={card.secondaryMovementType}
                    title={`${cardLabels[card.id]?.name ?? card.name}: ${play.mode === 'GOLD' ? 'złoto' : 'ruch'}`}
                  >
                    <strong>{cardLabels[card.id]?.name ?? card.name}</strong>
                    <span>
                      {play.mode === 'ACTION'
                        ? '◆'
                        : play.mode === 'GOLD'
                          ? `+${card.goldValue * (play.sacrificed ? 2 : 1)}`
                          : cardMovementValues(card, play.sacrificed ? 2 : 1)}
                    </span>
                    <small>
                      {play.mode === 'ACTION'
                        ? 'akcja jednorazowa'
                        : play.mode === 'GOLD'
                          ? 'złota'
                          : `${movementLabels[card.movementType]}${
                              card.secondaryMovementType
                                ? ` + ${movementLabels[card.secondaryMovementType]}`
                                : ''
                            }`}
                      {play.sacrificed ? ' · spalona' : ''}
                    </small>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </details>
  )
}
