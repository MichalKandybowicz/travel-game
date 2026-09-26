import { CARD_BY_ID } from '@shared'
import { useRef, useState, type ReactNode } from 'react'
import type { CardPlayMode, PlayerState } from '@shared'
import { cardDescription, cardLabels } from '../labels.js'
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
  const [pendingCurseCardId, setPendingCurseCardId] = useState<string>()
  const sacrificeDialogRef = useRef<HTMLDialogElement>(null)
  const curseTargetDialogRef = useRef<HTMLDialogElement>(null)
  const mustDiscard = (player?.pendingDiscardCount ?? 0) > 0
  const sacrificeCooldown = player?.sacrificeCooldownTurns ?? 0
  const sacrificeCards =
    player?.hand.filter(
      (card) => CARD_BY_ID[card.cardId]?.type === 'MOVEMENT',
    ) ?? []
  const pendingCurse = pendingCurseCardId
    ? player?.hand.find((card) => card.instanceId === pendingCurseCardId)
    : undefined
  const pendingCurseDefinition = pendingCurse
    ? CARD_BY_ID[pendingCurse.cardId]
    : undefined

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
          <button
            type="button"
            className="sacrifice-trigger"
            disabled={
              !isActive ||
              mustDiscard ||
              sacrificeCooldown > 0 ||
              sacrificeCards.length === 0
            }
            title={
              sacrificeCooldown > 0
                ? `Spalanie będzie dostępne za ${sacrificeCooldown} własnych tur`
                : 'Trwale usuń kartę i podwój jej wartość'
            }
            onClick={() => sacrificeDialogRef.current?.showModal()}
          >
            {sacrificeCooldown > 0
              ? `Spalanie: ${sacrificeCooldown}`
              : 'Spal kartę'}
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
            const needsTarget = definition.actionCategory === 'CURSE'
            return (
              <div
                key={card.instanceId}
                className="card game-card hand-card"
                data-movement={definition.movementType}
                data-card-type={definition.type.toLowerCase()}
                data-action-category={definition.actionCategory?.toLowerCase()}
              >
                <CardFace card={definition} compact />
                {definition.type === 'ACTION' ? (
                  <div className="hand-card-actions hand-card-actions--action">
                    <button
                      type="button"
                      disabled={
                        !isActive ||
                        mustDiscard ||
                        player.hasUsedActionCardThisTurn ||
                        (needsTarget && opponents.length === 0)
                      }
                      onClick={() => {
                        if (needsTarget) {
                          setPendingCurseCardId(card.instanceId)
                          curseTargetDialogRef.current?.showModal()
                          return
                        }
                        onUseActionCard(card.instanceId)
                      }}
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
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <dialog
        ref={curseTargetDialogRef}
        className="market-dialog curse-target-dialog"
        aria-labelledby="curse-target-title"
        onClose={() => setPendingCurseCardId(undefined)}
      >
        <div className="market-dialog-content">
          <header className="market-dialog-header">
            <div>
              <small>Wybór celu</small>
              <h2 id="curse-target-title">Na kogo rzucić klątwę?</h2>
            </div>
            <button
              type="button"
              className="market-dialog-close"
              aria-label="Zamknij"
              onClick={() => curseTargetDialogRef.current?.close()}
            >
              ×
            </button>
          </header>
          {pendingCurseDefinition && (
            <div className="curse-target-summary">
              <strong>
                {cardLabels[pendingCurseDefinition.id]?.name ??
                  pendingCurseDefinition.name}
              </strong>
              <p>{cardDescription(pendingCurseDefinition)}</p>
            </div>
          )}
          <div className="curse-target-list">
            {opponents.map((opponent) => (
              <button
                key={opponent.id}
                type="button"
                onClick={() => {
                  if (!pendingCurseCardId) return
                  onUseActionCard(pendingCurseCardId, opponent.id)
                  curseTargetDialogRef.current?.close()
                }}
              >
                <strong>{opponent.name}</strong>
                <small>Nałóż klątwę</small>
              </button>
            ))}
          </div>
        </div>
      </dialog>
      <dialog
        ref={sacrificeDialogRef}
        className="market-dialog sacrifice-dialog"
        aria-labelledby="sacrifice-dialog-title"
      >
        <div className="market-dialog-content">
          <header className="market-dialog-header">
            <div>
              <small>Rytuał ognia</small>
              <h2 id="sacrifice-dialog-title">Spal kartę</h2>
            </div>
            <button
              type="button"
              className="market-dialog-close"
              aria-label="Zamknij"
              onClick={() => sacrificeDialogRef.current?.close()}
            >
              ×
            </button>
          </header>
          <p className="sacrifice-dialog-warning">
            Karta zniknie z talii na stałe. Po rytuale nie można palić kart
            przez 5 kolejnych własnych tur.
          </p>
          <div className="sacrifice-card-list">
            {sacrificeCards.map((card) => {
              const definition = CARD_BY_ID[card.cardId]
              if (!definition || definition.type !== 'MOVEMENT') return null
              return (
                <article
                  key={card.instanceId}
                  className="card game-card sacrifice-card-option"
                  data-movement={definition.movementType}
                >
                  <CardFace card={definition} compact />
                  <div className="sacrifice-card-buttons">
                    <button
                      type="button"
                      onClick={() => {
                        onPlayCard(card.instanceId, 'MOVEMENT', true)
                        sacrificeDialogRef.current?.close()
                      }}
                    >
                      Podwój ruch: +{definition.movementValue * 2}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onPlayCard(card.instanceId, 'GOLD', true)
                        sacrificeDialogRef.current?.close()
                      }}
                    >
                      Podwój złoto: +{definition.goldValue * 2}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </dialog>
    </div>
  )
}
