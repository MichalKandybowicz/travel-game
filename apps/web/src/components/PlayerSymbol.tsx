import type { PlayerSymbol as PlayerSymbolType } from '@shared'

export function PlayerSymbol({
  symbol,
  size = 16,
  x,
  y,
}: {
  symbol: PlayerSymbolType
  size?: number
  x?: number
  y?: number
}) {
  return (
    <svg
      x={x}
      y={y}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#102b32"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ pointerEvents: 'none' }}
    >
      {symbol === 'COMPASS' && (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="m15.5 8.5-2.1 4.9-4.9 2.1 2.1-4.9z" fill="#102b32" />
        </>
      )}
      {symbol === 'STAR' && (
        <path
          d="m12 2.5 2.7 6 6.5.7-4.9 4.3 1.4 6.4-5.7-3.3-5.7 3.3 1.4-6.4-4.9-4.3 6.5-.7z"
          fill="#102b32"
        />
      )}
      {symbol === 'LEAF' && (
        <>
          <path d="M20 4C11 4 5 7 5 14a5 5 0 0 0 5 5c7 0 10-6 10-15Z" />
          <path d="M5 20c2-5 6-8 11-11" />
        </>
      )}
      {symbol === 'WAVE' && (
        <>
          <path d="M2 9c2.5 0 2.5 2.5 5 2.5S9.5 9 12 9s2.5 2.5 5 2.5S19.5 9 22 9" />
          <path d="M2 15c2.5 0 2.5 2.5 5 2.5s2.5-2.5 5-2.5 2.5 2.5 5 2.5 2.5-2.5 5-2.5" />
        </>
      )}
      {symbol === 'MOUNTAIN' && (
        <path d="M2 19 9 6l3.5 6 2.5-4 7 11H2Zm5.5-7h3m4 2h3" />
      )}
      {symbol === 'SUN' && (
        <>
          <circle cx="12" cy="12" r="4" fill="#102b32" />
          <path d="M12 1.5v2M12 20.5v2M1.5 12h2M20.5 12h2M4.6 4.6 6 6m12 12 1.4 1.4M19.4 4.6 18 6M6 18l-1.4 1.4" />
        </>
      )}
    </svg>
  )
}
