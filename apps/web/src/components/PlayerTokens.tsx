import { useState } from 'react'
import { TOKEN_BY_TYPE, type PlayerState, type TokenType } from '@shared'

const movementLabels = {
  GREEN: 'zielonego ruchu',
  BLUE: 'niebieskiego ruchu',
  YELLOW: 'żółtego ruchu',
  WILD: 'dowolnego ruchu',
} as const

const tokenPresentation = (
  type: TokenType,
): { icon: string; label: string; tone: string } => {
  const effect = TOKEN_BY_TYPE[type].effect
  switch (effect.kind) {
    case 'MOVEMENT':
      return {
        icon: `+${effect.value}`,
        label: `+${effect.value} ${movementLabels[effect.movementType]}`,
        tone: effect.movementType.toLowerCase(),
      }
    case 'GOLD':
      return {
        icon: `+${effect.value}`,
        label: `+${effect.value} złota`,
        tone: 'gold',
      }
    case 'SWAP_HAND':
      return { icon: '↻', label: 'Wymień całą rękę', tone: 'utility' }
    case 'DRAW_CARD':
      return { icon: '+1', label: 'Dobierz dodatkową kartę', tone: 'utility' }
    case 'REFRESH_MARKET':
      return { icon: '⟳', label: 'Przelosuj sklep', tone: 'market' }
    case 'CURSE_REMOVE_CARD':
      return {
        icon: '−1',
        label: 'Usuń losową kartę rywala',
        tone: 'curse',
      }
    case 'CURSE_SKIP_LEADER':
      return {
        icon: 'Ⅱ',
        label: 'Pomiń turę lidera',
        tone: 'curse',
      }
    case 'CURSE_MARKET':
      return { icon: '×', label: 'Przeklnij sklep', tone: 'curse' }
  }
}

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
    <section className="player-tokens" aria-label="Twoje żetony">
      <div className="player-tokens-heading">
        <div>
          <strong>Żetony obozowe</strong>
          <small>Obozy odwiedzone: {player.claimedCampIds?.length ?? 0}</small>
        </div>
        <small>
          {usedThisRound
            ? 'Żeton wykorzystany w tej rundzie'
            : 'Możesz użyć 1 żetonu w tej rundzie'}
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
          Wejdź do obozu, aby zdobyć losowy żeton.
        </small>
      )}
    </section>
  )
}
