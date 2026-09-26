import type { GameMap, RoomState } from '@shared'
import { TerrainIcon } from './TerrainIcon.js'

const hexSize = 12
const petalColors = [
  '#64748b',
  '#718399',
  '#5d7894',
  '#75879a',
  '#627e8a',
  '#7b899d',
]

const hexCenter = (q: number, r: number) => ({
  x: hexSize * Math.sqrt(3) * (q + r / 2),
  y: hexSize * 1.5 * r,
})

const hexPoints = (x: number, y: number): string =>
  Array.from({ length: 6 }, (_, index) => {
    const angle = ((60 * index - 30) * Math.PI) / 180
    return `${x + 11.2 * Math.cos(angle)},${y + 11.2 * Math.sin(angle)}`
  }).join(' ')

const terrainColors: Record<GameMap['tiles'][number]['terrain'], string> = {
  UNKNOWN: '#40515a',
  START: '#a77a49',
  GOAL: '#a55234',
  JUNGLE: '#205645',
  WATER: '#235979',
  DESERT: '#a47447',
  RUBBLE: '#655c55',
  CAMP: '#604960',
  MOUNTAIN: '#293f47',
}

export function MapShapePreview({
  shape,
  map,
}: {
  shape: RoomState['mapShape']
  map?: GameMap | undefined
}) {
  if (!shape?.length) {
    return <p>Podgląd kształtu mapy jest chwilowo niedostępny.</p>
  }

  const points = (map?.tiles ?? shape).map((tile) => ({
    ...tile,
    ...hexCenter(tile.q, tile.r),
  }))
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  const left = Math.min(...xs) - 18
  const top = Math.min(...ys) - 18
  const width = Math.max(...xs) - Math.min(...xs) + 36
  const height = Math.max(...ys) - Math.min(...ys) + 36

  return (
    <svg
      className="map-shape-preview"
      viewBox={`${left} ${top} ${width} ${height}`}
      role="img"
      aria-label={
        map ? 'Podgląd całej mapy z terenami i kosztami' : 'Kształt mapy'
      }
    >
      {points.map((tile) => {
        const terrain = 'terrain' in tile ? tile.terrain : undefined
        const showCost =
          terrain &&
          !['START', 'GOAL', 'MOUNTAIN'].includes(terrain) &&
          'difficulty' in tile
        return (
          <g key={`${tile.q},${tile.r}`}>
            <polygon
              points={hexPoints(tile.x, tile.y)}
              fill={
                terrain
                  ? terrainColors[terrain]
                  : petalColors[(tile.petalId ?? 0) % petalColors.length]
              }
              stroke="#0f172a"
              strokeWidth="1.1"
            />
            {terrain && (
              <>
                <g transform={`translate(${tile.x} ${tile.y - 2})`}>
                  <TerrainIcon terrain={terrain} scale={0.5} />
                </g>
                {showCost && 'difficulty' in tile && (
                  <text
                    x={tile.x}
                    y={tile.y + 9}
                    textAnchor="middle"
                    fill="#fff8dc"
                    fontSize="5"
                    fontWeight="900"
                    paintOrder="stroke"
                    stroke="#17232b"
                    strokeWidth="1.2"
                  >
                    {tile.difficulty}
                  </text>
                )}
              </>
            )}
          </g>
        )
      })}
    </svg>
  )
}
