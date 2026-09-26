import { CARD_BY_ID } from '@shared'
import { useState, type ReactNode } from 'react'
import type { CardPlayMode, PlayerState } from '@shared'
import { CardFace, MovementGlyph } from './CardFace.js'
import { PlayerTokens } from './PlayerTokens.js'

const movementResources = [
  { type: 'GREEN', label: 'Zielony' },
  { type: 'BLUE', label: 'Niebieski' },
  { type: 'YELLOW', label: 'Żółty' },
  { type: 'WILD', label: 'Dowolny' },
] as const

function GoldGlyph() {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <circle cx="32" cy="32" r="23" />
      <circle cx="32" cy="32" r="17" />
      <path d="M37 23c-3-3-11-3-13 2-3 7 13 5 13 12-1 6-10 7-15 3M31 18v28" />
    </svg>
  )
}

interface PlayerHandProps {
  player: PlayerState | undefined
  isActive: boolean
  onPlayCard: (
    cardInstanceId: string,
    mode: CardPlayMode,
    sacrifice?: boolean,
  ) => void
  opponents: PlayerState[]
  onUseToken: (tokenInstanceId: string, targetPlayerId?: string) => void
  onUseActionCard: (cardInstanceId: string, targetPlayerId?: string) => void
  onDiscardCard: (cardInstanceId: string) => void
  onEndTurn: () => void
  roundNumber: number
  market?: ReactNode
}

export function PlayerHand({
  player,
  isActive,
  onPlayCard,
  opponents,
  onUseToken,
  onUseActionCard,
  onDiscardCard,
  onEndTurn,
  roundNumber,
  market,
}: PlayerHandProps) {
  const [actionTargetId, setActionTargetId] = useState(opponents[0]?.id ?? '')
  const mustDiscard = (player?.pendingDiscardCount ?? 0) > 0

  return (
    <div className="panel hand-panel">
      <div className="panel-header">
        <div className="hand-header-details">
          <strong>Ręka</strong>
          {player && (
            <div className="hand-resources" aria-label="Dostępne zasoby">
              {movementResources.map(({ type, label }) => (
                <span
                  key={type}
                  className="hand-resource"
                  data-resource={type.toLowerCase()}
                  title={`${label}: ${player.availableMovement[type]}`}
                >
                  <span className="hand-resource-icon">
                    <MovementGlyph type={type} />
                  </span>
                  <strong>{player.availableMovement[type]}</strong>
                </span>
              ))}
              <span
                className="hand-resource hand-resource--gold"
                data-resource="gold"
                title={`Złoto do wydania: ${player.availableGold}`}
              >
                <span className="hand-resource-icon">
                  <GoldGlyph />
                </span>
                <strong>{player.availableGold}</strong>
              </span>
            </div>
          )}
        </div>
        <div className="hand-turn-actions">
          <button
            type="button"
            className="primary-button"
            disabled={!isActive || mustDiscard}
            onClick={onEndTurn}
          >
            Zakończ turę
          </button>
          {market}
        </div>
      </div>

      {mustDiscard && (
        <div className="pending-card-discard" role="status">
          Drugi oddech: wybierz jedną kartę z ręki do odrzucenia.
        </div>
      )}

      <div className="hand-content">
        {player && (
          <PlayerTokens
            player={player}
            opponents={opponents}
            roundNumber={roundNumber}
            isActive={isActive}
            onUseToken={onUseToken}
          />
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
                {definition.type === 'ACTION' ? (
                  <div className="hand-card-actions hand-card-actions--action">
                    {definition.actionEffect === 'STEAL_PLANS' && (
                      <select
                        aria-label="Cel kradzieży planów"
                        value={actionTargetId}
                        disabled={!isActive || mustDiscard}
                        onChange={(event) =>
                          setActionTargetId(event.target.value)
                        }
                      >
                        {opponents.map((opponent) => (
                          <option key={opponent.id} value={opponent.id}>
                            {opponent.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      disabled={
                        !isActive ||
                        mustDiscard ||
                        player.hasUsedActionCardThisTurn ||
                        (definition.actionEffect === 'STEAL_PLANS' &&
                          !actionTargetId)
                      }
                      onClick={() =>
                        onUseActionCard(
                          card.instanceId,
                          definition.actionEffect === 'STEAL_PLANS'
                            ? actionTargetId
                            : undefined,
                        )
                      }
                    >
                      Użyj i usuń
                    </button>
                  </div>
                ) : mustDiscard ? (
                  <div className="hand-card-actions hand-card-actions--discard">
                    <button
                      type="button"
                      className="sacrifice-card-action"
                      disabled={!isActive}
                      onClick={() => onDiscardCard(card.instanceId)}
                    >
                      Odrzuć tę kartę
                    </button>
                  </div>
                ) : (
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
                    <button
                      type="button"
                      className="sacrifice-card-action"
                      disabled={!isActive || player.hasSacrificedCardThisTurn}
                      title="Trwale usuwa kartę z talii i podwaja jej wartość ruchu"
                      onClick={() =>
                        onPlayCard(card.instanceId, 'MOVEMENT', true)
                      }
                    >
                      Spal: ruch +{definition.movementValue * 2}
                    </button>
                    <button
                      type="button"
                      className="sacrifice-card-action"
                      disabled={!isActive || player.hasSacrificedCardThisTurn}
                      title="Trwale usuwa kartę z talii i podwaja jej wartość złota"
                      onClick={() => onPlayCard(card.instanceId, 'GOLD', true)}
                    >
                      Spal: złoto +{definition.goldValue * 2}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
