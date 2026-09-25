import type { TerrainType } from '@shared'

export function TerrainIcon({ terrain }: { terrain: TerrainType }) {
  const stroke =
    terrain === 'MOUNTAIN' || terrain === 'WATER' || terrain === 'UNKNOWN'
      ? '#eef1da'
      : '#183c39'

  return (
    <g
      fill="none"
      stroke={stroke}
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      pointerEvents="none"
    >
      {terrain === 'UNKNOWN' && (
        <text
          x="0"
          y="5"
          textAnchor="middle"
          fill="#d7e7dc"
          stroke="none"
          fontSize="16"
          fontWeight="800"
        >
          ?
        </text>
      )}
      {terrain === 'START' && (
        <>
          <path d="M-6 7V-8M-6-7H5L2-3l3 4H-6" fill="#fff1c7" />
          <path d="M-9 8H-3" />
        </>
      )}
      {terrain === 'GOAL' && (
        <>
          <path d="M-6 7V-8M-6-7H6V1H-6" fill="#fff1d7" />
          <path d="M-6-3H6M0-7V1M-9 8H-3" />
        </>
      )}
      {terrain === 'JUNGLE' && (
        <>
          <path d="M-7 6V-1M4 6V-2" />
          <path
            d="M-7-1C-12-4-8-9-4-7C-3-10 2-9 2-5C1-2-3 0-7-1Z"
            fill="#a9d29b"
          />
          <path
            d="M4-2C0-4 2-8 6-7C10-7 11-2 7 0C6 0 5-1 4-2Z"
            fill="#7bbf89"
          />
          <path d="M-9 7H9" />
        </>
      )}
      {terrain === 'WATER' && (
        <>
          <path
            d="M-10-3C-7-6-4 0-1-3S5-6 9-3M-10 2C-7-1-4 5-1 2S5-1 9 2M-10 7C-7 4-4 10-1 7S5 4 9 7"
            stroke="#e4f2e7"
            strokeWidth="2"
          />
        </>
      )}
      {terrain === 'DESERT' && (
        <>
          <path d="M-11 5Q-5-2 1 4Q6-1 11 4V8H-11Z" fill="#f4d799" />
          <path d="M-10 7Q-2 2 5 7M-4-3Q0-7 4-3" stroke="#92400e" />
          <circle cx="7" cy="-6" r="2.5" fill="#fff0b4" stroke="none" />
        </>
      )}
      {terrain === 'RUBBLE' && (
        <>
          <path d="M-10 6l3-7 5 1 2 6ZM0 6l3-10 5 2 2 8Z" fill="#d9d1bb" />
          <path d="M-7 2l2 1M4 0l2 1" />
        </>
      )}
      {terrain === 'CAMP' && (
        <>
          <path d="M-9 7L0-7L9 7Z" fill="#e7d6d0" />
          <path d="M0-7V7M0 7l4-6 4 6M-10 8H10" />
        </>
      )}
      {terrain === 'MOUNTAIN' && (
        <>
          <path d="M-10 7L-3-6L2 2L5-3L11 7Z" fill="#45626a" />
          <path d="M-5-2l2-4 3 5M3 0l2-3 2 4" />
        </>
      )}
    </g>
  )
}
