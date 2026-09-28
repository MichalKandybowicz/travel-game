import { useRef, useState } from 'react'
import type { PlayerState } from '@shared'
import { tokenDescription, tokenPresentation } from '../tokenPresentation.js'

interface PlayerTokensProps {
  player: PlayerState
  opponents: PlayerState[]
  roundNumber: number
  isActive: boolean
  onUseToken: (tokenInstanceId: string, targetPlayerId?: string) => void
}

export function PlayerTokens({
  player,
  opponents,
  roundNumber,
  isActive,
  onUseToken,
}: PlayerTokensProps) {
  const tokens = player.tokens ?? []
  const usedThisRound = player.tokenUsedInRound === roundNumber
  const [selectedTokenId, setSelectedTokenId] = useState<string>()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const selectedToken = tokens.find(
    (token) => token.instanceId === selectedTokenId,
  )
  const selectedPresentation = selectedToken
    ? tokenPresentation(selectedToken.type)
    : undefined

  const activateSelectedToken = (targetPlayerId?: string) => {
    if (!selectedToken) return
    onUseToken(selectedToken.instanceId, targetPlayerId)
    dialogRef.current?.close()
  }

  return (
    <div className="player-tokens" aria-label="Twoje runy">
      <button
        type="button"
        className="player-tokens-heading"
        onClick={() => dialogRef.current?.showModal()}
      >
        <strong>Runy</strong>
        <small>
          {tokens.length}{' '}
          {tokens.length === 1
            ? 'runa'
            : tokens.length >= 2 && tokens.length <= 4
              ? 'runy'
              : 'run'}
          {usedThisRound ? ' · użyto w tej rundzie' : ''}
        </small>
      </button>
      <dialog
        ref={dialogRef}
        className="market-dialog token-choice-dialog"
        aria-labelledby="token-choice-title"
        onClose={() => setSelectedTokenId(undefined)}
      >
        <div className="market-dialog-content">
          <header className="market-dialog-header">
            <div>
              <small>Twoje runy</small>
              <h2 id="token-choice-title">
                {selectedPresentation?.label ?? 'Wybierz runę'}
              </h2>
            </div>
            <button
              type="button"
              className="market-dialog-close"
              aria-label="Zamknij"
              onClick={() => dialogRef.current?.close()}
            >
              ×
            </button>
          </header>
          <p className="token-choice-rule">
            Możesz użyć jednej runy w rundzie.
            {usedThisRound && ' W tej rundzie runa została już użyta.'}
          </p>
          {selectedToken && selectedPresentation ? (
            <>
              <div className="token-choice-summary">
                <span
                  className="token-icon"
                  data-tone={selectedPresentation.tone}
                  aria-hidden="true"
                >
                  {selectedPresentation.icon}
                </span>
                <p>{tokenDescription(selectedToken.type)}</p>
              </div>
              {selectedToken.type === 'CURSE_REMOVE_CARD' ? (
                <div className="choice-list">
                  <strong>Wybierz przeciwnika</strong>
                  {opponents.length === 0 && (
                    <p>Brak przeciwnika, na którego można rzucić klątwę.</p>
                  )}
                  {opponents.map((opponent) => (
                    <button
                      key={opponent.id}
                      type="button"
                      className="choice-option"
                      disabled={!isActive || usedThisRound}
                      onClick={() => activateSelectedToken(opponent.id)}
                    >
                      <strong>{opponent.name}</strong>
                      <span>Usuń losową kartę z jego talii lub stosu.</span>
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  type="button"
                  className="choice-option"
                  disabled={!isActive || usedThisRound}
                  onClick={() => activateSelectedToken()}
                >
                  <strong>Użyj runy</strong>
                  <span>{tokenDescription(selectedToken.type)}</span>
                </button>
              )}
              <button
                type="button"
                className="token-choice-back"
                onClick={() => setSelectedTokenId(undefined)}
              >
                Wróć do listy run
              </button>
            </>
          ) : tokens.length > 0 ? (
            <div className="choice-list">
              {tokens.map((token) => {
                const presentation = tokenPresentation(token.type)
                return (
                  <button
                    key={token.instanceId}
                    type="button"
                    className="choice-option token-choice-option"
                    onClick={() => setSelectedTokenId(token.instanceId)}
                  >
                    <span
                      className="token-icon"
                      data-tone={presentation.tone}
                      aria-hidden="true"
                    >
                      {presentation.icon}
                    </span>
                    <span>
                      <strong>{presentation.label}</strong>
                      <small>{tokenDescription(token.type)}</small>
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="token-empty">
              Wejdź do kręgu run, aby wybrać jedną z trzech run.
            </p>
          )}
        </div>
      </dialog>
    </div>
  )
}
