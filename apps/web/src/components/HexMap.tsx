import { canAffordMove } from '@game-engine'
import type { GameState, HexTile } from '@shared'
import { useMemo, useState } from 'react'

const tileColors: Record<HexTile['terrain'], string> = {
  START: '#60a5fa',
  GOAL: '#f97316',
  JUNGLE: '#22c55e',
  WATER: '#38bdf8',
  VILLAGE: '#facc15',
  RUBBLE: '#a8a29e',
  CAMP: '#c084fc',
  MOUNTAIN: '#334155',
}

const hexToPixel = (q: number, r: number, size: number) => {
  const x = size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r)
  const y = size * ((3 / 2) * r)
  return { x, y }
}

const polygonPoints = (x: number, y: number, size: number): string =>
  Array.from({ length: 6 }, (_, index) => {
    const angle = ((60 * index - 30) * Math.PI) / 180
    return `${x + size * Math.cos(angle)},${y + size * Math.sin(angle)}`
  }).join(' ')

const cubeDistance = (left: HexTile, right: HexTile): number =>
  Math.max(
    Math.abs(left.q - right.q),
    Math.abs(left.r - right.r),
    Math.abs(-(left.q + left.r) + (right.q + right.r)),
  )

interface HexMapProps {
  game: GameState
  playerId: string | undefined
  onSelectHex: (hexId: string) => void
}

export function HexMap({ game, playerId, onSelectHex }: HexMapProps) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [selectedHexId, setSelectedHexId] = useState<string>()
  const localPlayer = game.players.find((player) => player.id === playerId)
  const currentTile = game.map.tiles.find(
    (tile) => tile.id === localPlayer?.position,
  )

  const reachable = useMemo(() => {
    if (!localPlayer || !currentTile) {
      return new Set<string>()
    }
    return new Set(
      game.map.tiles
        .filter(
          (tile) =>
            cubeDistance(tile, currentTile) === 1 &&
            canAffordMove(localPlayer, tile),
        )
        .map((tile) => tile.id),
    )
  }, [currentTile, game.map.tiles, localPlayer])

  return (
    <div className="panel map-panel">
      <div className="panel-header">
        <strong>Map</strong>
        <div className="map-controls">
          <button
            type="button"
            onClick={() => setZoom((value) => Math.min(2, value + 0.1))}
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setZoom((value) => Math.max(0.6, value - 0.1))}
          >
            -
          </button>
          <button
            type="button"
            onClick={() => setPan((state) => ({ ...state, x: state.x - 20 }))}
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => setPan((state) => ({ ...state, x: state.x + 20 }))}
          >
            →
          </button>
          <button
            type="button"
            onClick={() => setPan((state) => ({ ...state, y: state.y - 20 }))}
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => setPan((state) => ({ ...state, y: state.y + 20 }))}
          >
            ↓
          </button>
        </div>
      </div>
      <svg
        viewBox="-240 -220 480 440"
        className="hex-map"
        role="img"
        aria-label="Procedural game map"
      >
        <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
          {game.map.tiles.map((tile) => {
            const { x, y } = hexToPixel(tile.q, tile.r, 24)
            const occupiedBy = game.players.filter(
              (player) => player.position === tile.id,
            )
            const isReachable = reachable.has(tile.id)
            const isSelected = selectedHexId === tile.id
            return (
              <g
                key={tile.id}
                onClick={() => {
                  setSelectedHexId(tile.id)
                  onSelectHex(tile.id)
                }}
              >
                <polygon
                  points={polygonPoints(x, y, 22)}
                  fill={tileColors[tile.terrain]}
                  stroke={
                    isSelected ? '#111827' : isReachable ? '#f8fafc' : '#0f172a'
                  }
                  strokeWidth={isSelected ? 3 : isReachable ? 2.5 : 1}
                  opacity={tile.isBlocked ? 0.45 : 1}
                />
                <text x={x} y={y - 4} textAnchor="middle" className="hex-label">
                  {tile.terrain[0]}
                </text>
                <text
                  x={x}
                  y={y + 10}
                  textAnchor="middle"
                  className="hex-difficulty"
                >
                  {tile.difficulty}
                </text>
                {occupiedBy.map((player, index) => (
                  <circle
                    key={player.id}
                    cx={x - 8 + index * 12}
                    cy={y + 18}
                    r={5}
                    fill={player.id === playerId ? '#111827' : '#ffffff'}
                    stroke="#111827"
                  />
                ))}
              </g>
            )
          })}
        </g>
      </svg>
      <div className="map-stats">
        <span>Shortest path: {game.map.stats.shortestPathLength}</span>
        <span>Routes: {game.map.stats.routeCount}</span>
        <span>Difficulty: {game.map.stats.difficultyScore}</span>
      </div>
    </div>
  )
}
