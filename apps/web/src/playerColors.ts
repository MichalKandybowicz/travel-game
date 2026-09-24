export const playerColors = [
  '#fbbf24',
  '#f472b6',
  '#a78bfa',
  '#34d399',
  '#38bdf8',
  '#fb7185',
]

export const playerColor = (index: number): string =>
  playerColors[index % playerColors.length]!
