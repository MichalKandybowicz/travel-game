import { canAffordMove, getTerrainCost } from '@game-engine'
import type { GameState, HexTile } from '@shared'
import { useEffect, useMemo, useRef, useState } from 'react'
import { movementLabels, terrainLabels } from '../labels.js'
import { playerColor } from '../playerColors.js'
import { TerrainIcon } from './TerrainIcon.js'

const tilePalette: Record<
  HexTile['terrain'],
  { light: string; dark: string; edge: string }
> = {
  UNKNOWN: { light: '#40515a', dark: '#1a2d35', edge: '#68808a' },
  START: { light: '#e3b76e', dark: '#8a6036', edge: '#f5d89c' },
  GOAL: { light: '#efae6a', dark: '#a55234', edge: '#ffd29b' },
  JUNGLE: { light: '#4e9973', dark: '#205645', edge: '#81bf91' },
  WATER: { light: '#57a9b7', dark: '#235979', edge: '#8ad0cf' },
  DESERT: { light: '#ddbd79', dark: '#a47447', edge: '#f4d99c' },
  RUBBLE: { light: '#aca596', dark: '#655c55', edge: '#d1c6ae' },
  CAMP: { light: '#a286a9', dark: '#604960', edge: '#c4a9bc' },
  MOUNTAIN: { light: '#647c7c', dark: '#293f47', edge: '#9eb1a9' },
}

const MAX_ZOOM = 12

type MapView = {
  centerX: number
  centerY: number
  width: number
  height: number
}

const focusedView = (tile: HexTile | undefined, mapView: MapView) => {
  const point = tile
    ? hexToPixel(tile.q, tile.r, 24)
    : { x: mapView.centerX, y: mapView.centerY }
  return {
    zoom: Math.min(
      MAX_ZOOM,
      Math.max(1.35, mapView.width / 400, mapView.height / 340),
    ),
    pan: { x: point.x - mapView.centerX, y: point.y - mapView.centerY },
  }
}

const terrainOrder: HexTile['terrain'][] = [
  'START',
  'JUNGLE',
  'WATER',
  'DESERT',
  'RUBBLE',
  'CAMP',
  'MOUNTAIN',
  'GOAL',
]

const terrainRules: Record<HexTile['terrain'], string> = {
  UNKNOWN: 'Typ i koszt pola pozostają ukryte.',
  START: 'Powrót kosztuje 1 punkt dowolnego koloru.',
  JUNGLE: 'Koszt wejścia 1–4: zielone lub uniwersalne punkty.',
  WATER: 'Koszt wejścia 1–3: niebieskie lub uniwersalne punkty.',
  DESERT: 'Koszt wejścia 1–4: żółte lub uniwersalne punkty.',
  RUBBLE: 'Koszt wejścia 2–4: punkty dowolnego koloru.',
  CAMP: 'Koszt wejścia 1–5: punkty dowolnego koloru.',
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
  canChooseStart: boolean
  onSelectHex: (hexId: string) => void
  onChooseStart: (hexId: string) => void
}

export function HexMap({
  game,
  playerId,
  isActive,
  canChooseStart,
  onSelectHex,
  onChooseStart,
}: HexMapProps) {
  const [selectedHexId, setSelectedHexId] = useState<string>()
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    panX: number
    panY: number
    worldPerPixel: number
    moved: boolean
  } | null>(null)
  const suppressClickRef = useRef(false)
  const localPlayer = game.players.find((player) => player.id === playerId)
  const currentTile = game.map.tiles.find(
    (tile) => tile.id === localPlayer?.position,
  )
  const startTile = game.map.tiles.find(
    (tile) => tile.id === game.map.startHexId,
  )
  const mapView = useMemo(() => {
    if (
      game.settings.fogMode === 'MEDIUM' ||
      game.settings.fogMode === 'FULL'
    ) {
      const point = currentTile ?? startTile
      const center = point ? hexToPixel(point.q, point.r, 24) : { x: 0, y: 0 }
      return { centerX: center.x, centerY: center.y, width: 360, height: 330 }
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
  }, [currentTile, startTile, game.map.tiles, game.settings.fogMode])
  const [view, setView] = useState(() =>
    focusedView(currentTile ?? startTile, mapView),
  )
  const { zoom, pan } = view
  const focusedGameRef = useRef(game.id)
  const focusedOwnStartRef = useRef(Boolean(currentTile))

  useEffect(() => {
    if (focusedGameRef.current !== game.id) {
      focusedGameRef.current = game.id
      focusedOwnStartRef.current = Boolean(currentTile)
      setView(focusedView(currentTile ?? startTile, mapView))
    } else if (!focusedOwnStartRef.current && currentTile) {
      focusedOwnStartRef.current = true
      setView(focusedView(currentTile, mapView))
    }
  }, [game.id, currentTile, startTile, mapView])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = svg.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      setView((current) => {
        const nextZoom = Math.max(
          0.6,
          Math.min(
            MAX_ZOOM,
            current.zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12),
          ),
        )
        const oldWidth = mapView.width / current.zoom
        const oldHeight = mapView.height / current.zoom
        const screenScale = Math.min(
          rect.width / oldWidth,
          rect.height / oldHeight,
        )
        const fractionX =
          (event.clientX -
            rect.left -
            (rect.width - oldWidth * screenScale) / 2) /
          (oldWidth * screenScale)
        const fractionY =
          (event.clientY -
            rect.top -
            (rect.height - oldHeight * screenScale) / 2) /
          (oldHeight * screenScale)
        const nextWidth = mapView.width / nextZoom
        const nextHeight = mapView.height / nextZoom
        return {
          zoom: nextZoom,
          pan: {
            x: current.pan.x + (fractionX - 0.5) * (oldWidth - nextWidth),
            y: current.pan.y + (fractionY - 0.5) * (oldHeight - nextHeight),
          },
        }
      })
    }
    svg.addEventListener('wheel', handleWheel, { passive: false })
    return () => svg.removeEventListener('wheel', handleWheel)
  }, [mapView])

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
            onClick={() => {
              setView(focusedView(currentTile ?? startTile, mapView))
            }}
          >
            {currentTile ? 'Pokaż mnie' : 'Pokaż start'}
          </button>
          <button
            type="button"
            onClick={() =>
              setView((current) => ({
                ...current,
                zoom: Math.min(MAX_ZOOM, current.zoom + 0.2),
              }))
            }
          >
            +
          </button>
          <button
            type="button"
            onClick={() =>
              setView((current) => ({
                ...current,
                zoom: Math.max(0.6, current.zoom - 0.2),
              }))
            }
          >
            -
          </button>
          <button
            type="button"
            onClick={() =>
              setView((current) => ({
                ...current,
                pan: { ...current.pan, x: current.pan.x - 20 },
              }))
            }
          >
            ←
          </button>
          <button
            type="button"
            onClick={() =>
              setView((current) => ({
                ...current,
                pan: { ...current.pan, x: current.pan.x + 20 },
              }))
            }
          >
            →
          </button>
          <button
            type="button"
            onClick={() =>
              setView((current) => ({
                ...current,
                pan: { ...current.pan, y: current.pan.y - 20 },
              }))
            }
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() =>
              setView((current) => ({
                ...current,
                pan: { ...current.pan, y: current.pan.y + 20 },
              }))
            }
          >
            ↓
          </button>
        </div>
      </div>
      <svg
        ref={svgRef}
        viewBox={`${mapView.centerX + pan.x - mapView.width / (2 * zoom)} ${mapView.centerY + pan.y - mapView.height / (2 * zoom)} ${mapView.width / zoom} ${mapView.height / zoom}`}
        className="hex-map"
        role="img"
        aria-label="Mapa gry"
        onPointerDown={(event) => {
          if (event.button !== 0) return
          const rect = event.currentTarget.getBoundingClientRect()
          dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            panX: pan.x,
            panY: pan.y,
            worldPerPixel: Math.max(
              mapView.width / zoom / rect.width,
              mapView.height / zoom / rect.height,
            ),
            moved: false,
          }
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current
          if (!drag || drag.pointerId !== event.pointerId) return
          if (event.buttons === 0) {
            dragRef.current = null
            return
          }
          const deltaX = event.clientX - drag.startX
          const deltaY = event.clientY - drag.startY
          if (!drag.moved && Math.hypot(deltaX, deltaY) < 5) return
          if (!drag.moved) {
            event.currentTarget.setPointerCapture(event.pointerId)
          }
          drag.moved = true
          suppressClickRef.current = true
          setView((current) => ({
            ...current,
            pan: {
              x: drag.panX - deltaX * drag.worldPerPixel,
              y: drag.panY - deltaY * drag.worldPerPixel,
            },
          }))
        }}
        onPointerUp={(event) => {
          if (dragRef.current?.pointerId !== event.pointerId) return
          dragRef.current = null
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
          }
          window.setTimeout(() => {
            suppressClickRef.current = false
          }, 0)
        }}
        onPointerCancel={() => {
          dragRef.current = null
          suppressClickRef.current = false
        }}
        onPointerLeave={() => {
          if (dragRef.current && !dragRef.current.moved) dragRef.current = null
        }}
        onClickCapture={(event) => {
          if (!suppressClickRef.current) return
          event.preventDefault()
          event.stopPropagation()
          suppressClickRef.current = false
        }}
      >
        <defs>
          {Object.entries(tilePalette).map(([terrain, palette]) => (
            <linearGradient
              key={terrain}
              id={`hex-${terrain}`}
              x1="0"
              y1="0"
              x2="0.85"
              y2="1"
            >
              <stop stopColor={palette.light} />
              <stop offset="1" stopColor={palette.dark} />
            </linearGradient>
          ))}
        </defs>
        <g>
          {game.map.tiles.map((tile) => {
            const { x, y } = hexToPixel(tile.q, tile.r, 24)
            const occupiedBy = game.players.filter(
              (player) => player.position === tile.id,
            )
            const isReachable = reachable.has(tile.id)
            const isAvailableStart =
              canChooseStart &&
              game.status === 'CHOOSING_START' &&
              game.currentPlayerId === playerId &&
              (game.map.startHexIds ?? [game.map.startHexId]).includes(
                tile.id,
              ) &&
              occupiedBy.length === 0
            const isSelected = selectedHexId === tile.id
            const isLocalTile = localPlayer?.position === tile.id
            return (
              <g
                key={tile.id}
                className={`map-tile${(isActive && isReachable) || isAvailableStart ? ' reachable-hex' : ''}`}
                onClick={() => {
                  setSelectedHexId(tile.id)
                  if (isActive && isReachable) {
                    onSelectHex(tile.id)
                  } else if (isAvailableStart) {
                    onChooseStart(tile.id)
                  }
                }}
              >
                <title>{tileDescription(tile)}</title>
                <polygon
                  points={polygonPoints(x, y, 22)}
                  fill="#10272d"
                  stroke={
                    isAvailableStart
                      ? '#ffe0a1'
                      : isLocalTile
                        ? '#f5c778'
                        : isSelected
                          ? '#fff2ca'
                          : isReachable
                            ? '#b7e8cc'
                            : tilePalette[tile.terrain].edge
                  }
                  strokeWidth={
                    isAvailableStart
                      ? 3.5
                      : isLocalTile
                        ? 3.5
                        : isSelected
                          ? 3
                          : isReachable
                            ? 2.5
                            : 1.25
                  }
                />
                <polygon
                  points={polygonPoints(x, y, 19.5)}
                  fill={`url(#hex-${tile.terrain})`}
                  stroke="rgba(255, 249, 224, 0.24)"
                  strokeWidth="0.65"
                />
                <path
                  d={`M${x - 13} ${y - 11}L${x} ${y - 18}L${x + 13} ${y - 11}`}
                  fill="none"
                  stroke="rgba(255, 252, 230, 0.25)"
                  strokeWidth="0.9"
                  pointerEvents="none"
                />
                <g transform={`translate(${x} ${y - 5})`}>
                  <TerrainIcon terrain={tile.terrain} />
                </g>
                {tile.terrain !== 'UNKNOWN' && (
                  <circle
                    cx={x}
                    cy={y + 10.5}
                    r="6.5"
                    fill="rgba(9, 31, 36, 0.83)"
                    stroke="rgba(255, 242, 206, 0.58)"
                    strokeWidth="0.8"
                    pointerEvents="none"
                  />
                )}
                <text
                  x={x}
                  y={y + 13.1}
                  textAnchor="middle"
                  className="hex-difficulty"
                >
                  {tile.terrain === 'UNKNOWN'
                    ? ''
                    : game.status === 'CHOOSING_START' &&
                        tile.terrain === 'START'
                      ? (game.map.startHexIds ?? [game.map.startHexId]).indexOf(
                          tile.id,
                        ) + 1
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
                fill={tilePalette[terrain].light}
                stroke={tilePalette[terrain].edge}
                strokeWidth="1.2"
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

    </div>
  )
}
