import type { PlayerColor, PlayerSymbol as PlayerSymbolType } from '@shared'
import { playerColor, playerSymbol } from '../playerColors.js'
import { PlayerSymbol } from './PlayerSymbol.js'

export function PlayerBadge({
  index,
  color,
  symbol,
}: {
  index: number
  color?: PlayerColor
  symbol?: PlayerSymbolType
}) {
  return (
    <span
      className="player-number"
      style={{ backgroundColor: playerColor(index, color) }}
      aria-hidden="true"
    >
      <PlayerSymbol symbol={playerSymbol(index, symbol)} size={15} />
    </span>
  )
}
