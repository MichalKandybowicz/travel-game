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
  }
}

interface PlayerTokensProps {
  player: PlayerState
  roundNumber: number
  isActive: boolean
  onUseToken: (tokenInstanceId: string) => void
}

export function PlayerTokens({
  player,
  roundNumber,
  isActive,
  onUseToken,
}: PlayerTokensProps) {
  const tokens = player.tokens ?? []
  const usedThisRound = player.tokenUsedInRound === roundNumber

  return (
    <section className="player-tokens" aria-label="Twoje żetony">
      <div className="player-tokens-heading">
        <div>
          <strong>Żetony obozowe</strong>
          <small>
            Obozy odwiedzone: {player.claimedCampIds?.length ?? 0}
          </small>
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
            return (
              <button
                key={token.instanceId}
                type="button"
                className="token"
                data-tone={presentation.tone}
                disabled={!isActive || usedThisRound}
                title={presentation.label}
                onClick={() => onUseToken(token.instanceId)}
              >
                <span className="token-icon" aria-hidden="true">
                  {presentation.icon}
                </span>
                <span>{presentation.label}</span>
              </button>
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
