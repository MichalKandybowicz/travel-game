import { CARD_BY_ID } from '@shared'
import type { GameState } from '@shared'
import { cardLabels, movementLabels } from '../labels.js'
import { playerColor } from '../playerColors.js'

export function PlayedCards({ game }: { game: GameState }) {
  const roundNumber = Math.ceil(game.turnNumber / game.players.length)
  const plays = game.roundPlayedCards ?? []

  return (
    <section className="panel played-panel">
      <div className="panel-header">
        <strong>Zagrane karty</strong>
        <small>Runda {roundNumber}</small>
      </div>
      {game.players.map((player, index) => {
        const playerPlays = plays.filter(
          (entry) => entry.playerId === player.id,
        )
        return (
          <div key={player.id} className="played-player">
            <div className="sidebar-player-heading">
              <span
                className="player-number"
                style={{ backgroundColor: playerColor(index) }}
              >
                {index + 1}
              </span>
              <strong>{player.name}</strong>
            </div>
            {playerPlays.length === 0 ? (
              <small>Brak kart w tej rundzie</small>
            ) : (
              <div className="mini-card-grid">
                {playerPlays.map((play) => {
                  const card = CARD_BY_ID[play.cardId]
                  if (!card) {
                    return null
                  }
                  return (
                    <div
                      key={play.instanceId}
                      className="mini-card"
                      data-movement={card.movementType}
                      title={`${cardLabels[card.id]?.name ?? card.name}: ${play.mode === 'GOLD' ? 'złoto' : 'ruch'}`}
                    >
                      <strong>{cardLabels[card.id]?.name ?? card.name}</strong>
                      <span>
                        +
                        {play.mode === 'GOLD'
                          ? card.goldValue
                          : card.movementValue}
                      </span>
                      <small>
                        {play.mode === 'GOLD'
                          ? 'złota'
                          : movementLabels[card.movementType]}
                      </small>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}
