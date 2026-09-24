import { canAffordMove, getTerrainCost } from '@game-engine'
import type { GameState, HexTile } from '@shared'
import { useMemo, useState } from 'react'
import { movementLabels, terrainLabels } from '../labels.js'
import { playerColor } from '../playerColors.js'
import { TerrainIcon } from './TerrainIcon.js'

const tileColors: Record<HexTile['terrain'], string> = {
  UNKNOWN: '#334155',
  START: '#60a5fa',
  GOAL: '#f97316',
  JUNGLE: '#22c55e',
  WATER: '#38bdf8',
  VILLAGE: '#facc15',
  RUBBLE: '#a8a29e',
  CAMP: '#c084fc',
  MOUNTAIN: '#334155',
}

const terrainOrder: HexTile['terrain'][] = [
  'START',
  'JUNGLE',
  'WATER',
  'VILLAGE',
  'RUBBLE',
  'CAMP',
  'MOUNTAIN',
  'GOAL',
]

const terrainRules: Record<HexTile['terrain'], string> = {
  UNKNOWN: 'Typ i koszt pola pozostają ukryte.',
  START: 'Powrót kosztuje 1 punkt dowolnego koloru.',
  JUNGLE: 'Koszt z pola: zielone lub uniwersalne punkty.',
  WATER: 'Koszt z pola: niebieskie lub uniwersalne punkty.',
  VILLAGE: 'Koszt z pola: żółte lub uniwersalne punkty.',
  RUBBLE:
    'Koszt z pola (1–3): punkty dowolnego koloru. Bez dodatkowego efektu.',
  CAMP: 'Koszt 1 punkt dowolnego koloru. Obecnie bez dodatkowego efektu.',
  MOUNTAIN: 'Pole zablokowane; nie można na nie wejść.',
  GOAL: 'Wejście kosztuje 1 punkt dowolnego koloru i kończy grę zwycięstwem.',
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

const tileDescription = (tile: HexTile): string => {
  if (tile.terrain === 'UNKNOWN') return 'Nieodkryte pole'
  if (tile.difficulty < 0) {
    return `${terrainLabels[tile.terrain]} — koszt nieznany`
  }
  const costType = getTerrainCost(tile.terrain, tile.difficulty)
  if (tile.isBlocked || costType === 'BLOCKED') {
    return `${terrainLabels[tile.terrain]}: pole zablokowane`
  }
  const color = costType === 'ANY' ? 'dowolny' : movementLabels[costType]
  return `${terrainLabels[tile.terrain]} — koszt: ${Math.max(1, tile.difficulty)}; rodzaj ruchu: ${color}`
}

interface HexMapProps {
  game: GameState
  playerId: string | undefined
  isActive: boolean
  onSelectHex: (hexId: string) => void
}

export function HexMap({ game, playerId, isActive, onSelectHex }: HexMapProps) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [selectedHexId, setSelectedHexId] = useState<string>()
  const localPlayer = game.players.find((player) => player.id === playerId)
  const currentTile = game.map.tiles.find(
    (tile) => tile.id === localPlayer?.position,
  )
  const mapView = useMemo(() => {
    if (
      game.settings.fogMode === 'MEDIUM' ||
      game.settings.fogMode === 'FULL'
    ) {
      const point = currentTile
        ? hexToPixel(currentTile.q, currentTile.r, 24)
        : { x: 0, y: 0 }
      return { centerX: point.x, centerY: point.y, width: 360, height: 330 }
    }
    const points = game.map.tiles.map((tile) => hexToPixel(tile.q, tile.r, 24))
    const xs = points.map((point) => point.x)
    const ys = points.map((point) => point.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    return {
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
      width: Math.max(480, maxX - minX + 72),
      height: Math.max(440, maxY - minY + 72),
    }
  }, [currentTile, game.map.tiles, game.settings.fogMode])

  const reachable = useMemo(() => {
    if (!localPlayer || !currentTile) {
      return new Set<string>()
    }
    return new Set(
      game.map.tiles
        .filter(
          (tile) =>
            cubeDistance(tile, currentTile) === 1 &&
            !tile.isBlocked &&
            (game.settings.allowSharedTiles !== false ||
              !game.players.some(
                (player) =>
                  player.id !== localPlayer.id && player.position === tile.id,
              )) &&
            canAffordMove(localPlayer, tile),
        )
        .map((tile) => tile.id),
    )
  }, [
    currentTile,
    game.map.tiles,
    game.players,
    game.settings.allowSharedTiles,
    localPlayer,
  ])

  return (
    <div className="panel map-panel">
      <div className="panel-header">
        <strong>Mapa</strong>
        <div className="map-controls">
          <button
            type="button"
            disabled={!currentTile}
            onClick={() => {
              if (currentTile) {
                const point = hexToPixel(currentTile.q, currentTile.r, 24)
                setPan({
                  x: point.x - mapView.centerX,
                  y: point.y - mapView.centerY,
                })
              }
            }}
          >
            Pokaż mnie
          </button>
          <button
            type="button"
            onClick={() => setZoom((value) => Math.min(4, value + 0.2))}
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setZoom((value) => Math.max(0.6, value - 0.2))}
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
        viewBox={`${mapView.centerX + pan.x - mapView.width / (2 * zoom)} ${mapView.centerY + pan.y - mapView.height / (2 * zoom)} ${mapView.width / zoom} ${mapView.height / zoom}`}
        className="hex-map"
        role="img"
        aria-label="Mapa gry"
      >
        <g>
          {game.map.tiles.map((tile) => {
            const { x, y } = hexToPixel(tile.q, tile.r, 24)
            const occupiedBy = game.players.filter(
              (player) => player.position === tile.id,
            )
            const isReachable = reachable.has(tile.id)
            const isSelected = selectedHexId === tile.id
            const isLocalTile = localPlayer?.position === tile.id
            return (
              <g
                key={tile.id}
                className={
                  isActive && isReachable ? 'reachable-hex' : undefined
                }
                onClick={() => {
                  setSelectedHexId(tile.id)
                  if (isActive && isReachable) {
                    onSelectHex(tile.id)
                  }
                }}
              >
                <title>{tileDescription(tile)}</title>
                <polygon
                  points={polygonPoints(x, y, 22)}
                  fill={tileColors[tile.terrain]}
                  stroke={
                    isLocalTile
                      ? '#fef08a'
                      : isSelected
                        ? '#111827'
                        : isReachable
                          ? '#f8fafc'
                          : '#0f172a'
                  }
                  strokeWidth={
                    isLocalTile ? 4 : isSelected ? 3 : isReachable ? 2.5 : 1
                  }
                  opacity={
                    tile.terrain === 'UNKNOWN'
                      ? 0.85
                      : tile.isBlocked
                        ? 0.45
                        : 1
                  }
                />
                <g transform={`translate(${x} ${y - 5})`}>
                  <TerrainIcon terrain={tile.terrain} />
                </g>
                <text
                  x={x}
                  y={y + 10}
                  textAnchor="middle"
                  className="hex-difficulty"
                >
                  {tile.terrain === 'UNKNOWN'
                    ? ''
                    : tile.difficulty < 0
                      ? '?'
                      : tile.terrain === 'MOUNTAIN'
                        ? '×'
                        : Math.max(1, tile.difficulty)}
                </text>
                {occupiedBy.map((player, index) => {
                  const number =
                    game.players.findIndex((entry) => entry.id === player.id) +
                    1
                  const markerX = x + (index - (occupiedBy.length - 1) / 2) * 13
                  const markerY = y + 17
                  return (
                    <g key={player.id} className="map-player-marker">
                      <title>{`${player.name}${player.id === playerId ? ' (Ty)' : ''}`}</title>
                      <circle
                        cx={markerX}
                        cy={markerY}
                        r={player.id === playerId ? 9 : 7.5}
                        fill={playerColor(number - 1)}
                        stroke={player.id === playerId ? '#fff8cc' : '#0f172a'}
                        strokeWidth={player.id === playerId ? 2.5 : 1.5}
                      />
                      <text x={markerX} y={markerY + 3} textAnchor="middle">
                        {number}
                      </text>
                    </g>
                  )
                })}
              </g>
            )
          })}
        </g>
      </svg>
      <div className="player-location-legend" aria-label="Pozycje graczy">
        {game.players.map((player, index) => (
          <span key={player.id} className="player-location-item">
            <span
              className="player-number"
              style={{ backgroundColor: playerColor(index) }}
            >
              {index + 1}
            </span>
            {player.name}
            {player.id === playerId ? ' (Ty)' : ''}
          </span>
        ))}
      </div>
      <div className="terrain-legend" aria-label="Legenda terenów">
        {terrainOrder.map((terrain) => (
          <span key={terrain} className="terrain-legend-item">
            <svg viewBox="-14 -14 28 28" aria-hidden="true">
              <polygon
                points={polygonPoints(0, 0, 13)}
                fill={tileColors[terrain]}
              />
              <TerrainIcon terrain={terrain} />
            </svg>
            {terrainLabels[terrain]}
          </span>
        ))}
      </div>
      <details className="terrain-rules">
        <summary>Zasady terenów</summary>
        <p>
          Liczba na polu oznacza koszt wejścia. Można przejść tylko na sąsiednie
          pole. Uniwersalne punkty ruchu zastępują wymagany kolor.
        </p>
        <ul>
          {terrainOrder.map((terrain) => (
            <li key={terrain}>
              <strong>{terrainLabels[terrain]}:</strong> {terrainRules[terrain]}
            </li>
          ))}
        </ul>
      </details>
      {game.settings.fogMode === 'NONE' && (
        <div className="map-stats">
          <span>Najkrótsza trasa: {game.map.stats.shortestPathLength}</span>
          <span>Trasy: {game.map.stats.routeCount}</span>
          <span>Trudność: {game.map.stats.difficultyScore}</span>
        </div>
      )}
    </div>
  )
}
