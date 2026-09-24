import type { TerrainType } from '@shared'

export function TerrainIcon({ terrain }: { terrain: TerrainType }) {
  const stroke = terrain === 'MOUNTAIN' ? '#f8fafc' : '#172033'

  return (
    <g
      fill="none"
      stroke={stroke}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      pointerEvents="none"
    >
      {terrain === 'START' && (
        <>
          <path d="M-6 7V-8M-6-7H5L2-3l3 4H-6" fill="#dbeafe" />
          <path d="M-9 8H-3" />
        </>
      )}
      {terrain === 'GOAL' && (
        <>
          <path d="M-6 7V-8M-6-7H6V1H-6" fill="#fff7ed" />
          <path d="M-6-3H6M0-7V1M-9 8H-3" />
        </>
      )}
      {terrain === 'JUNGLE' && (
        <>
          <path d="M-7 6V-1M4 6V-2" />
          <path
            d="M-7-1C-12-4-8-9-4-7C-3-10 2-9 2-5C1-2-3 0-7-1Z"
            fill="#bbf7d0"
          />
          <path
            d="M4-2C0-4 2-8 6-7C10-7 11-2 7 0C6 0 5-1 4-2Z"
            fill="#86efac"
          />
          <path d="M-9 7H9" />
        </>
      )}
      {terrain === 'WATER' && (
        <>
          <path
            d="M-10-3C-7-6-4 0-1-3S5-6 9-3M-10 2C-7-1-4 5-1 2S5-1 9 2M-10 7C-7 4-4 10-1 7S5 4 9 7"
            stroke="#e0f2fe"
            strokeWidth="2"
          />
        </>
      )}
      {terrain === 'VILLAGE' && (
        <>
          <path d="M-9-1L0-8L9-1" fill="#fef3c7" />
          <path d="M-7-1V7H7V-1Z" fill="#fffbeb" />
          <path d="M-2 7V2H2V7M4 1H5" />
        </>
      )}
      {terrain === 'RUBBLE' && (
        <>
          <path d="M-10 6l3-7 5 1 2 6ZM0 6l3-10 5 2 2 8Z" fill="#e7e5e4" />
          <path d="M-7 2l2 1M4 0l2 1" />
        </>
      )}
      {terrain === 'CAMP' && (
        <>
          <path d="M-9 7L0-7L9 7Z" fill="#f3e8ff" />
          <path d="M0-7V7M0 7l4-6 4 6M-10 8H10" />
        </>
      )}
      {terrain === 'MOUNTAIN' && (
        <>
          <path d="M-10 7L-3-6L2 2L5-3L11 7Z" fill="#64748b" />
          <path d="M-5-2l2-4 3 5M3 0l2-3 2 4" />
        </>
      )}
    </g>
  )
}
