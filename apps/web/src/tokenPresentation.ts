import { TOKEN_BY_TYPE, type TokenType } from '@shared'

const movementLabels = {
  GREEN: 'zielonego ruchu',
  BLUE: 'niebieskiego ruchu',
  YELLOW: 'żółtego ruchu',
  WILD: 'dowolnego ruchu',
} as const

export const tokenPresentation = (
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
