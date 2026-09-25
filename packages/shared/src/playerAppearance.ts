export const PLAYER_COLORS = [
  '#efbf72',
  '#ef8fa5',
  '#a99af0',
  '#64cba4',
  '#73c3de',
  '#e89975',
  '#c084fc',
  '#22d3ee',
  '#f472b6',
  '#a3e635',
] as const

export const PLAYER_SYMBOLS = [
  'COMPASS',
  'STAR',
  'LEAF',
  'WAVE',
  'MOUNTAIN',
  'SUN',
  'MOON',
  'CRYSTAL',
  'RUNE',
  'WAND',
  'CROWN',
  'DRAGON',
] as const

export type PlayerColor = (typeof PLAYER_COLORS)[number]
export type PlayerSymbol = (typeof PLAYER_SYMBOLS)[number]
