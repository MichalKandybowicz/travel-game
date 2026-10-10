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
      {symbol === 'PICKAXE' && (
        <>
          <path d="M6 21 15 7" strokeWidth="3" />
          <path
            d="M3 8c4-5 11-6 18-2-5-1-8 0-10 3-2-1-5-2-8-1Z"
            fill="#102b32"
          />
        </>
      )}
      {symbol === 'RACCOON' && (
        <>
          <path d="M4 9 2.5 3.5 8 5l4-1 4 1 5.5-1.5L20 9c1 2 1 5-1 8-2 3-5 4-7 4s-5-1-7-4C3 14 3 11 4 9Z" />
          <path
            d="M4 11c2-2 5-2 8 0 3-2 6-2 8 0-1 3-3 5-6 5h-4c-3 0-5-2-6-5Z"
            fill="#102b32"
          />
          <path d="M8 12.5h1m6 0h1" stroke="#f5f1e8" strokeWidth="2" />
          <path d="m10 17 2 1.5 2-1.5" />
        </>
      )}
      {symbol === 'HORSE' && (
        <>
          <path
            d="M5 21h15v-2l-4-2 1-5 2-2-2-5-5-2-4 3-2 5-3 2 1 4 4-1-1 3-2 2Z"
            fill="#102b32"
          />
          <path d="M13 8h1" stroke="#f5f1e8" strokeWidth="2" />
        </>
      )}
      {symbol === 'DOVE' && (
        <>
          <path
            d="M3 16c3-1 5-3 7-6l-1-6c3 1 5 4 5 7 2-2 4-3 7-3l-3 4 4 2-5 1c-1 4-4 6-8 6-3 0-5-2-6-5Z"
            fill="#102b32"
          />
          <path d="M15 12h1" stroke="#f5f1e8" strokeWidth="2" />
        </>
      )}
      {symbol === 'MICROPHONE' && (
        <>
          <rect x="9" y="2" width="6" height="13" rx="3" fill="#102b32" />
          <path d="M6 11a6 6 0 0 0 12 0M12 17v4m-4 0h8" />
        </>
      )}
      {symbol === 'SWORD' && (
        <>
          <path d="m13 3 8-1-1 8-9 9-5-5 7-11Z" fill="#102b32" />
          <path d="m5 13 6 6m-7 1 4-4m-4 4-2 2" />
        </>
      )}
      {symbol === 'TANK' && (
        <>
          <path d="M8 13V8h7l3 5M15 8h7" />
          <rect x="2" y="13" width="20" height="8" rx="4" />
          <path d="M6 17h12" strokeWidth="3" />
        </>
      )}
      {symbol === 'PLANE' && (
        <path
          d="M12 2c-1 0-2 1-2 3v4l-8 5v3l8-3v5l-3 2v1l5-1 5 1v-1l-3-2v-5l8 3v-3l-8-5V5c0-2-1-3-2-3Z"
          fill="#102b32"
        />
      )}
    </svg>
  )
}
