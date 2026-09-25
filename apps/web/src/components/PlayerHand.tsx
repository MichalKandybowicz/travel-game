import { CARD_BY_ID } from '@shared'
import type { ReactNode } from 'react'
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
  onPlayCard: (cardInstanceId: string, mode: CardPlayMode) => void
  opponents: PlayerState[]
  onUseToken: (tokenInstanceId: string, targetPlayerId?: string) => void
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
  onEndTurn,
  roundNumber,
  market,
}: PlayerHandProps) {
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
                  <span>
                    <small>{label}</small>
                    <strong>{player.availableMovement[type]}</strong>
                  </span>
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
                <span>
                  <small>Złoto</small>
                  <strong>{player.availableGold}</strong>
                </span>
              </span>
            </div>
          )}
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

      <div className="hand-content">
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
        {player && (
          <PlayerTokens
            player={player}
            opponents={opponents}
            roundNumber={roundNumber}
            isActive={isActive}
            onUseToken={onUseToken}
          />
        )}
      </div>
    </div>
  )
}
