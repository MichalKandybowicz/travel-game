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
            d="M-8 3a4 4 0 0 1 1-7 5 5 0 0 1 9 2 4 4 0 0 1-2 6ZM1 3a4 4 0 0 1 2-7 5 5 0 0 1 9 3 4 4 0 0 1-3 5Z"
            fill={colors.fill}
            fillOpacity=".82"
          />
          <path d="M-4 2v7M6 2v7M-8 9h18M-4 5l-3 2M-4 6l3 2M6 5l3 2" />
          <circle cx="-8" cy="-7" r="1.35" fill={colors.glow} stroke="none" />
          <circle cx="8" cy="-8" r=".85" fill={colors.glow} stroke="none" />
        </>
      )}
      {terrain === 'WATER' && (
        <path d="M-11-3c3-3 5 3 8 0s5 3 8 0 5 2 7 0M-11 4c3-3 5 3 8 0s5 3 8 0 5 2 7 0" />
      )}
      {terrain === 'DESERT' && (
        <>
          <circle cx="6" cy="-6" r="3" fill={colors.glow} fillOpacity=".75" />
          <path d="M-11 8Q-4-4 3 3q4 4 9 2v4h-23Z" fill={colors.fill} />
          <path d="M-11 8Q-4 1 3 6q4 3 9-1M-9 1q4-5 9-1" />
          <path d="M6-11v2M1-6h2M9-6h2M3-9l1.5 1.5M9-9 7.5-7.5" />
        </>
      )}
      {terrain === 'RUBBLE' && (
        <>
          <path
            d="m-11 7 3-5 4 1 2-6 5-1 3 5 3 1 3 5Z"
            fill={colors.fill}
            fillOpacity=".78"
          />
          <path d="m-8 2 4 1-2 4M-2-3l5-1-1 5-4 2M3 7l3-6 3 1M-11 7h23" />
          <path d="m-8-4 3-3 3 3-3 2Z" fill={colors.fill} />
        </>
      )}
      {terrain === 'CAMP' && (
        <>
          <ellipse
            cx="0"
            cy="1"
            rx="9"
            ry="6"
            fill={colors.fill}
            fillOpacity=".3"
          />
          <path d="M0-7v5M8-3 4 0M8 6 4 3M0 10V5M-8 6l4-3M-8-3l4 3" />
          <path
            d="m0-10 2 3-2 3-2-3Zm9 4 2 3-2 3-2-3Zm0 9 2 3-2 3-2-3Zm-9 4 2 3-2 3-2-3Zm-9-4 2 3-2 3-2-3Zm0-9 2 3-2 3-2-3Z"
            fill={colors.fill}
          />
          <circle cx="0" cy="1.5" r="2" fill={colors.glow} />
        </>
      )}
      {terrain === 'MOUNTAIN' && (
        <>
          <path
            d="M-11 9-5-5-1 0 4-11 12 9Z"
            fill={colors.fill}
            fillOpacity=".72"
          />
          <path d="m-8 2 3-7 3 4M0-1l4-10 4 7M-11 9h23" />
          <path d="M4-6 1-2l3 2-2 5 5-6-3-2 3-3Z" fill={colors.glow} />
        </>
      )}
    </g>
  )
}
