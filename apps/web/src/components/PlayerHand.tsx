import { CARD_BY_ID, SACRIFICE_COOLDOWN_TURNS } from '@shared'
import { useRef, useState, type ReactNode } from 'react'
import type { CardPlayMode, GameState, PlayerState } from '@shared'
import { cardDescription, cardLabels, cardMovementValues } from '../labels.js'
import { CardFace, MovementGlyph } from './CardFace.js'
import { PlayerTokens } from './PlayerTokens.js'
import { PlayerEffects } from './PlayerEffects.js'
import { DeckPreview } from './DeckPreview.js'

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
  game: GameState
  isActive: boolean
  onPlayCard: (
    cardInstanceId: string,
    mode: CardPlayMode,
    sacrifice?: boolean,
  ) => void
  opponents: PlayerState[]
  onUseToken: (tokenInstanceId: string, targetPlayerId?: string) => void
  onUseActionCard: (cardInstanceId: string, targetPlayerId?: string) => void
  onChooseHexCurseCard: (
    cardInstanceId: string,
    targetPlayerId?: string,
  ) => void
  onDiscardCard: (cardInstanceId: string) => void
  onEndTurn: () => void
  roundNumber: number
  market?: ReactNode
}

export function PlayerHand({
  player,
  game,
  isActive,
  onPlayCard,
  opponents,
  onUseToken,
  onUseActionCard,
  onChooseHexCurseCard,
  onDiscardCard,
  onEndTurn,
  roundNumber,
  market,
}: PlayerHandProps) {
  const [pendingCurseCardId, setPendingCurseCardId] = useState<string>()
  const [selectedCardId, setSelectedCardId] = useState<string>()
  const cardDialogRef = useRef<HTMLDialogElement>(null)
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
  const selectedCard = selectedCardId
    ? player?.hand.find((card) => card.instanceId === selectedCardId)
    : undefined
  const selectedDefinition = selectedCard
    ? CARD_BY_ID[selectedCard.cardId]
    : undefined
  const usedCards =
    player && game.currentPlayerId === player.id
      ? game.roundPlayedCards.filter((play) => play.playerId === player.id)
      : []

  const useSelectedAction = () => {
    if (!selectedCard || !selectedDefinition) return
    cardDialogRef.current?.close()
    if (selectedDefinition.actionEffect === 'HEX_SEAL') {
      onChooseHexCurseCard(selectedCard.instanceId)
    } else if (selectedDefinition.actionCategory === 'CURSE') {
      setPendingCurseCardId(selectedCard.instanceId)
      curseTargetDialogRef.current?.showModal()
    } else {
      onUseActionCard(selectedCard.instanceId)
    }
  }

  return (
    <div className="panel hand-panel">
      <div className="panel-header">
        <div className="hand-header-details">
          <strong>Ręka</strong>
          {player && <PlayerEffects player={player} game={game} />}
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
          <DeckPreview player={player} />
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
          Drugi oddech: kliknij ilustrację karty, którą chcesz odrzucić.
        </div>
      )}

      <div className="hand-content">
        {player && (
          <div className="hand-resources" aria-label="Dostępne zasoby">
            {movementResources.map(({ type, label }) => (
              <span
                key={type}
                className="hand-resource"
                data-resource={type.toLowerCase()}
                title={`${label}: ${player.availableMovement[type]}`}
                aria-label={`${label}: ${player.availableMovement[type]}`}
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
              aria-label={`Złoto do wydania: ${player.availableGold}`}
            >
              <span className="hand-resource-icon">
                <GoldGlyph />
              </span>
              <strong>{player.availableGold}</strong>
            </span>
          </div>
        )}
        <div className="hand-cards-area">
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
            {player?.hand.map((card, cardIndex) => {
              const definition = CARD_BY_ID[card.cardId]
              if (!definition) {
                return null
              }
              return (
                <div
                  key={card.instanceId}
                  className="card game-card hand-card"
                  data-movement={definition.movementType}
                  data-secondary-movement={definition.secondaryMovementType}
                  data-card-type={definition.type.toLowerCase()}
                  data-action-category={definition.actionCategory?.toLowerCase()}
                  data-pending-discard={mustDiscard || undefined}
                  style={{
                    zIndex:
                      (player?.hand.length ?? 0) + usedCards.length - cardIndex,
                  }}
                >
                  <CardFace
                    card={definition}
                    compact
                    {...(mustDiscard
                      ? {
                          discardAction: {
                            onDiscard: () => onDiscardCard(card.instanceId),
                            disabled: !isActive,
                          },
                        }
                      : {})}
                  />
                  <div className="hand-card-actions">
                    <button
                      type="button"
                      disabled={!isActive || mustDiscard}
                      onClick={() => {
                        setSelectedCardId(card.instanceId)
                        cardDialogRef.current?.showModal()
                      }}
                    >
                      Użyj
                    </button>
                  </div>
                </div>
              )
            })}
            {usedCards.map((play, usedCardIndex) => {
              const definition = CARD_BY_ID[play.cardId]
              if (!definition) return null
              return (
                <div
                  key={play.instanceId}
                  className="card game-card hand-card hand-card--used"
                  data-movement={definition.movementType}
                  data-secondary-movement={definition.secondaryMovementType}
                  data-card-type={definition.type.toLowerCase()}
                  data-action-category={definition.actionCategory?.toLowerCase()}
                  aria-label={`${cardLabels[definition.id]?.name ?? definition.name} — wykorzystana`}
                  style={{ zIndex: usedCards.length - usedCardIndex }}
                >
                  <CardFace card={definition} compact />
                  <span className="hand-card-used-label">Wykorzystana</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <dialog
        ref={cardDialogRef}
        className="market-dialog card-choice-dialog"
        aria-labelledby="card-choice-title"
        onClose={() => setSelectedCardId(undefined)}
      >
        <div className="market-dialog-content">
          <header className="market-dialog-header">
            <div>
              <small>Wybór zagrania</small>
              <h2 id="card-choice-title">
                {selectedDefinition
                  ? (cardLabels[selectedDefinition.id]?.name ??
                    selectedDefinition.name)
                  : 'Karta'}
              </h2>
            </div>
            <button
              type="button"
              className="market-dialog-close"
              aria-label="Zamknij"
              onClick={() => cardDialogRef.current?.close()}
            >
              ×
            </button>
          </header>
          {selectedDefinition && selectedCard && (
            <>
              <p className="card-choice-description">
                {cardDescription(selectedDefinition)}
              </p>
              <div className="choice-list">
                {selectedDefinition.type === 'ACTION' ? (
                  <button
                    type="button"
                    className="choice-option"
                    disabled={
                      !isActive ||
                      mustDiscard ||
                      (selectedDefinition.actionCategory === 'CURSE' &&
                        selectedDefinition.actionEffect !== 'HEX_SEAL' &&
                        opponents.length === 0)
                    }
                    onClick={useSelectedAction}
                  >
                    <strong>Akcja specjalna</strong>
                    <span>{cardDescription(selectedDefinition)}</span>
                    <small>
                      {selectedDefinition.actionCategory === 'CURSE'
                        ? selectedDefinition.actionEffect === 'HEX_SEAL'
                          ? 'Następnie wskażesz pole na mapie.'
                          : 'Następnie wybierzesz przeciwnika.'
                        : 'Efekt zostanie użyty od razu.'}{' '}
                      Karta zostanie spalona.
                    </small>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="choice-option"
                    disabled={!isActive || mustDiscard}
                    onClick={() => {
                      onPlayCard(selectedCard.instanceId, 'MOVEMENT')
                      cardDialogRef.current?.close()
                    }}
                  >
                    <strong>
                      Ruch {cardMovementValues(selectedDefinition)}
                    </strong>
                    <span>
                      Dodaje punkty ruchu pokazanych na karcie rodzajów.
                    </span>
                    <small>
                      Karta trafi po turze na stos odrzuconych i wróci po
                      przetasowaniu.
                    </small>
                  </button>
                )}
                <button
                  type="button"
                  className="choice-option"
                  disabled={!isActive || mustDiscard}
                  onClick={() => {
                    onPlayCard(selectedCard.instanceId, 'GOLD')
                    cardDialogRef.current?.close()
                  }}
                >
                  <strong>Złoto +{selectedDefinition.goldValue}</strong>
                  <span>Dodaje złoto do wydania w tej turze.</span>
                  <small>
                    Karta trafi po turze na stos odrzuconych i wróci po
                    przetasowaniu.
                  </small>
                </button>
              </div>
            </>
          )}
        </div>
      </dialog>
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
                  if (
                    pendingCurseDefinition?.actionEffect === 'RESHUFFLE_HAND'
                  ) {
                    onChooseHexCurseCard(pendingCurseCardId, opponent.id)
                  } else {
                    onUseActionCard(pendingCurseCardId, opponent.id)
                  }
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
            Karta zniknie z talii na stałe. Po rytuale ponowne spalanie będzie
            dostępne po upływie {SACRIFICE_COOLDOWN_TURNS} własnych tur.
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
                  data-secondary-movement={definition.secondaryMovementType}
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
                      Podwój ruch: {cardMovementValues(definition, 2)}
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
