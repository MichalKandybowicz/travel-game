import type { RoomState } from '@shared'

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

export function MapShapePreview({ shape }: { shape: RoomState['mapShape'] }) {
  if (!shape?.length) {
    return <p>Podgląd kształtu mapy jest chwilowo niedostępny.</p>
  }

  const points = shape.map((tile) => ({
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
      aria-label="Kształt mapy bez informacji o terenach"
    >
      {points.map((tile) => (
        <polygon
          key={`${tile.q},${tile.r}`}
          points={hexPoints(tile.x, tile.y)}
          fill={petalColors[tile.petalId % petalColors.length]}
          stroke="#0f172a"
          strokeWidth="1.1"
        />
      ))}
    </svg>
  )
}
