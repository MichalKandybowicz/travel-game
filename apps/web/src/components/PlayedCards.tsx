import { CARD_BY_ID } from '@shared'
import type { GameState, PlayerState } from '@shared'
import { cardLabels, movementLabels } from '../labels.js'
import { tokenPresentation } from '../tokenPresentation.js'

export function PlayedCards({
  game,
  player,
}: {
  game: GameState
  player: PlayerState
}) {
  const plays = game.roundPlayedCards ?? []
  const playerPlays = plays.filter((entry) => entry.playerId === player.id)
  const tokens = player.tokens ?? []

  return (
    <details className="player-journey-details">
      <summary>
        <span>
          Do celu: <strong>{player.remainingRouteCost ?? '—'}</strong>
        </span>
        <span>{playerPlays.length} zagranych</span>
      </summary>
      <div className="player-journey-content">
        <div>
          <small>Posiadane żetony</small>
          {tokens.length > 0 ? (
            <div className="player-token-icons">
              {tokens.map((token) => {
                const presentation = tokenPresentation(token.type)
                return (
                  <span
                    key={token.instanceId}
                    className="compact-token-icon"
                    data-tone={presentation.tone}
                    title={presentation.label}
                    aria-label={presentation.label}
                  >
                    {presentation.icon}
                  </span>
                )
              })}
            </div>
          ) : (
            <small className="player-detail-empty">Brak żetonów</small>
          )}
        </div>
        <div>
          <small>Karty zagrane w tej rundzie</small>
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
                    title={`${cardLabels[card.id]?.name ?? card.name}: ${play.mode === 'GOLD' ? 'złoto' : 'ruch'}`}
                  >
                    <strong>{cardLabels[card.id]?.name ?? card.name}</strong>
                    <span>
                      {play.mode === 'ACTION'
                        ? '◆'
                        : `+${
                            play.mode === 'GOLD'
                              ? card.goldValue
                              : card.movementValue
                          }`}
                    </span>
                    <small>
                      {play.mode === 'ACTION'
                        ? 'akcja jednorazowa'
                        : play.mode === 'GOLD'
                          ? 'złota'
                          : movementLabels[card.movementType]}
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
