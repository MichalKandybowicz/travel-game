import { useState } from 'react'
import type { PlayerState } from '@shared'
import { tokenPresentation } from '../tokenPresentation.js'

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
  const [targetPlayerId, setTargetPlayerId] = useState(opponents[0]?.id ?? '')

  return (
    <section className="player-tokens" aria-label="Twoje runy">
      <div className="player-tokens-heading">
        <strong>Runy</strong>
        <small>
          {usedThisRound
            ? 'Runa wykorzystana w tej rundzie'
            : 'Możesz użyć 1 runy w tej rundzie'}
        </small>
      </div>
      {tokens.length > 0 ? (
        <div className="token-list">
          {tokens.map((token) => {
            const presentation = tokenPresentation(token.type)
            const needsTarget = token.type === 'CURSE_REMOVE_CARD'
            return (
              <div className="token-action" key={token.instanceId}>
                {needsTarget && (
                  <select
                    aria-label="Przeciwnik objęty klątwą"
                    value={targetPlayerId}
                    disabled={!isActive || usedThisRound}
                    onChange={(event) => setTargetPlayerId(event.target.value)}
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
                  className="token"
                  data-tone={presentation.tone}
                  disabled={
                    !isActive ||
                    usedThisRound ||
                    (needsTarget && !targetPlayerId)
                  }
                  title={presentation.label}
                  onClick={() =>
                    onUseToken(
                      token.instanceId,
                      needsTarget ? targetPlayerId : undefined,
                    )
                  }
                >
                  <span className="token-icon" aria-hidden="true">
                    {presentation.icon}
                  </span>
                  <span>{presentation.label}</span>
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <small className="token-empty">
          Wejdź do kręgu mocy, aby zdobyć losową runę.
        </small>
      )}
    </section>
  )
}
