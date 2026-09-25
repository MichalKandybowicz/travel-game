import type { TerrainType } from '@shared'

const iconColors: Record<
  TerrainType,
  { stroke: string; fill: string; glow: string }
> = {
  UNKNOWN: { stroke: '#e9d5ff', fill: '#7c6f9f', glow: '#c084fc' },
  START: { stroke: '#fff0b8', fill: '#b783cf', glow: '#e9b669' },
  GOAL: { stroke: '#fff1c7', fill: '#8b5fc7', glow: '#d8b4fe' },
  JUNGLE: { stroke: '#173c35', fill: '#9ed696', glow: '#86efac' },
  WATER: { stroke: '#e5fbff', fill: '#79d5e7', glow: '#67e8f9' },
  DESERT: { stroke: '#784b18', fill: '#f5d17d', glow: '#fde68a' },
  RUBBLE: { stroke: '#3d3652', fill: '#c5b8d8', glow: '#c4b5fd' },
  CAMP: { stroke: '#fff0ca', fill: '#a66fd0', glow: '#e879f9' },
  MOUNTAIN: { stroke: '#edf6ff', fill: '#667d9a', glow: '#93c5fd' },
}

export function TerrainIcon({
  terrain,
  scale = 1,
}: {
  terrain: TerrainType
  scale?: number
}) {
  const colors = iconColors[terrain]

  return (
    <g
      transform={`scale(${scale})`}
      fill="none"
      stroke={colors.stroke}
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      pointerEvents="none"
      shapeRendering="geometricPrecision"
    >
      {terrain === 'UNKNOWN' && (
        <>
          <path d="M-9 2C-5-4-1-4 3 1c3 4 6 2 8-1M-8 7c3-3 6-3 9 0 3 2 6 1 8-1" />
          <path d="M-6-6c2-3 5-3 7 0M5-5l1-3m3 5 2-2" />
        </>
      )}
      {terrain === 'START' && (
        <>
          <path d="M-7 8V-7M7 8V-7" />
          <path
            d="M-8-7Q0-12 8-7V7Q0 3-8 7Z"
            fill={colors.fill}
            fillOpacity=".72"
          />
          <path d="M0-7V5M-3 0h6M0-3v6M-10 9h20" />
        </>
      )}
      {terrain === 'GOAL' && (
        <>
          <ellipse
            cx="0"
            cy="0"
            rx="8"
            ry="11"
            fill={colors.fill}
            fillOpacity=".35"
          />
          <ellipse cx="0" cy="0" rx="4" ry="7" />
          <path d="M0-11V-7M0 7v4M-8 0h4M4 0h4M-6-8l3 3M3 5l3 3M6-8 3-3M-6 8l-3 3" />
          <circle cx="0" cy="0" r="1.8" fill={colors.stroke} />
        </>
      )}
      {terrain === 'JUNGLE' && (
        <>
          <path
            d="M0 8C-7 5-10-2-7-8c5 0 9 2 10 7 1 4-1 7-3 9Z"
            fill={colors.fill}
            fillOpacity=".82"
          />
          <path
            d="M1 7C3 1 7-3 11-5c1 6-2 11-10 12Z"
            fill={colors.fill}
            fillOpacity=".62"
          />
          <path d="M-7 9C-2 3 2-1 8-5M-1 3l-1-7M2 1l6 1" />
          <circle cx="-5" cy="-6" r="1.45" fill={colors.glow} stroke="none" />
        </>
      )}
      {terrain === 'WATER' && (
        <>
          <path
            d="M0-11C4-5 9 0 9 5a9 9 0 0 1-18 0c0-5 5-10 9-16Z"
            fill={colors.fill}
            fillOpacity=".62"
          />
          <path d="M-5 5c3-3 5 3 8 0s5 0 6 1M-3 0c1-2 3-4 4-6" />
          <path d="M-10-7h3M-8.5-8.5v3M7-5h4M9-7v4" />
        </>
      )}
      {terrain === 'DESERT' && (
        <>
          <circle cx="5" cy="-5" r="4" fill={colors.glow} fillOpacity=".75" />
          <path d="M-11 7Q-6-2 1 5Q6-2 11 4V9H-11Z" fill={colors.fill} />
          <path d="M-10 8Q-2 2 6 8M-8 1c3-3 5-3 8 0" />
          <path d="m-6-8 1 2 2 1-2 1-1 2-1-2-2-1 2-1Z" />
        </>
      )}
      {terrain === 'RUBBLE' && (
        <>
          <path
            d="M-10 7-7-2l4-2 3 5 3-9 5 4 3 11Z"
            fill={colors.fill}
            fillOpacity=".7"
          />
          <path d="m-7-2 4 4 3-1 3 3 5-8M-8 7l4-3 4 3 4-3 5 3" />
          <path d="M-3-8v3M-5-6h4" />
        </>
      )}
      {terrain === 'CAMP' && (
        <>
          <circle cx="0" cy="0" r="9" fill={colors.fill} fillOpacity=".45" />
          <circle cx="0" cy="0" r="5.5" />
          <path d="M0-10v4M0 6v4M-10 0h4M6 0h4M-7-7l3 3M4 4l3 3M7-7 4-4M-7 7l-4 4" />
          <path d="m0-4 2.5 4L0 4l-2.5-4Z" fill={colors.glow} />
        </>
      )}
      {terrain === 'MOUNTAIN' && (
        <>
          <path
            d="M-11 8-4-7 0-1 4-10 11 8Z"
            fill={colors.fill}
            fillOpacity=".72"
          />
          <path d="m-7-1 3-6 3 5M1-2l3-8 4 7M-10 8h21" />
          <path d="m-4 2 2-2 2 2 3-3 3 3" />
          <path d="M8-9v3M6.5-7.5h3" />
        </>
      )}
    </g>
  )
}
