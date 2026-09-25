import { PLAYER_COLORS, PLAYER_SYMBOLS } from '@shared'
import type { PlayerColor, PlayerSymbol } from '@shared'

export const playerColor = (index: number, color?: PlayerColor): PlayerColor =>
  color ?? PLAYER_COLORS[index % PLAYER_COLORS.length]!

export const playerSymbol = (
  index: number,
  symbol?: PlayerSymbol,
): PlayerSymbol => symbol ?? PLAYER_SYMBOLS[index % PLAYER_SYMBOLS.length]!

export const playerSymbolLabels: Record<PlayerSymbol, string> = {
  COMPASS: 'Kompas',
  STAR: 'Gwiazda',
  LEAF: 'Liść',
  WAVE: 'Fala',
  MOUNTAIN: 'Góra',
  SUN: 'Słońce',
  MOON: 'Księżyc',
  CRYSTAL: 'Kryształ',
  RUNE: 'Runa',
  WAND: 'Różdżka',
  CROWN: 'Korona',
  DRAGON: 'Smok',
}
