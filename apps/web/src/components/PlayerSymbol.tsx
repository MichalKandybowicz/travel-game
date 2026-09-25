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
      {symbol === 'MOON' && (
        <path
          d="M18.5 16.5A8.5 8.5 0 0 1 8 5.5a8.5 8.5 0 1 0 10.5 11Z"
          fill="#102b32"
        />
      )}
      {symbol === 'CRYSTAL' && (
        <>
          <path d="m12 2.5 6 6-2 10-4 3-4-3-2-10 6-6Z" />
          <path d="m6 8.5 6 3 6-3M12 2.5v19M8 18.5l4-7 4 7" />
        </>
      )}
      {symbol === 'RUNE' && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M8 18V6l8 3-8 4 8 5V6" />
        </>
      )}
      {symbol === 'WAND' && (
        <>
          <path d="m5 20 11-11 3 3L8 23" />
          <path d="M17 2v4M15 4h4M7 5v3M5.5 6.5h3M19 17v3M17.5 18.5h3" />
        </>
      )}
      {symbol === 'CROWN' && (
        <>
          <path d="m3 7 5 5 4-7 4 7 5-5-2 11H5L3 7Z" fill="#102b32" />
          <path d="M6 21h12" />
        </>
      )}
      {symbol === 'DRAGON' && (
        <path
          d="M5 19c1-7 4-11 9-12l-1-4 5 3-2 3c3 2 4 5 3 9-2-3-4-4-7-4 1 3 0 6-3 8 0-3-1-4-4-3Z"
          fill="#102b32"
        />
      )}
    </svg>
  )
}
