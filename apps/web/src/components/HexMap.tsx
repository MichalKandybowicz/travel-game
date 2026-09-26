import {
  canAffordMove,
  getMoveRequirements,
  getTerrainCost,
  type MoveRequirement,
} from '@game-engine'
import type { GameState, HexTile } from '@shared'
import { useEffect, useMemo, useRef, useState } from 'react'
import { movementLabels, terrainLabels } from '../labels.js'
import { playerColor, playerSymbol } from '../playerColors.js'
import { PlayerBadge } from './PlayerBadge.js'
import { PlayerSymbol } from './PlayerSymbol.js'
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
const HEX_SPACING = 39
const HEX_RADIUS = 26

type MapView = {
  centerX: number
  centerY: number
  width: number
  height: number
}

const focusedView = (tile: HexTile | undefined, mapView: MapView) => {
  const point = tile
    ? hexToPixel(tile.q, tile.r, HEX_SPACING)
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

const edgeCost = (
  requirement: MoveRequirement | undefined,
): { label: string; color: string } => {
  if (!requirement) {
    return { label: '?', color: '#526873' }
  }
  const colors = {
    GREEN: '#287554',
    BLUE: '#2b7792',
    YELLOW: '#b88436',
    ANY: '#7c6284',
  } as const
  return {
    label: String(requirement.amount),
    color: colors[requirement.type],
  }
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
      const center = point
        ? hexToPixel(point.q, point.r, HEX_SPACING)
        : { x: 0, y: 0 }
      return { centerX: center.x, centerY: center.y, width: 360, height: 330 }
    }
    const points = game.map.tiles.map((tile) =>
      hexToPixel(tile.q, tile.r, HEX_SPACING),
    )
    const xs = points.map((point) => point.x)
    const ys = points.map((point) => point.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    return {
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
      width: Math.max(480, maxX - minX + 90),
      height: Math.max(440, maxY - minY + 90),
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
            (cubeDistance(tile, currentTile) === 1 ||
              (localPlayer.shortcutMoveAvailable &&
                cubeDistance(tile, currentTile) === 2)) &&
            !tile.isBlocked &&
            (game.settings.allowSharedTiles !== false ||
              !game.players.some(
                (player) =>
                  player.id !== localPlayer.id && player.position === tile.id,
              )) &&
            canAffordMove(localPlayer, currentTile, tile, game.map.tiles),
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
  const connections = useMemo(
    () =>
      game.map.tiles.flatMap((tile, tileIndex) =>
        game.map.tiles
          .slice(tileIndex + 1)
          .filter((neighbor) => cubeDistance(tile, neighbor) === 1)
          .map((neighbor) => ({
            from: tile,
            to: neighbor,
            fromPoint: hexToPixel(tile.q, tile.r, HEX_SPACING),
            toPoint: hexToPixel(neighbor.q, neighbor.r, HEX_SPACING),
          })),
      ),
    [game.map.tiles],
  )

  return (
    <div className="panel map-panel">
      <div className="panel-header">
        <strong>Mapa krain</strong>
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
        aria-label="Magiczna mapa krain"
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
          {connections.map((connection, index) => (
            <linearGradient
              key={`connection-gradient-${connection.from.id}-${connection.to.id}`}
              id={`connection-gradient-${index}`}
              gradientUnits="userSpaceOnUse"
              x1={connection.fromPoint.x}
              y1={connection.fromPoint.y}
              x2={connection.toPoint.x}
              y2={connection.toPoint.y}
            >
              <stop stopColor={tilePalette[connection.from.terrain].edge} />
              <stop
                offset="1"
                stopColor={tilePalette[connection.to.terrain].edge}
              />
            </linearGradient>
          ))}
        </defs>
        <g className="map-connections" pointerEvents="none">
          {connections.map((connection, index) => (
            <g key={`${connection.from.id}-${connection.to.id}`}>
              <line
                x1={connection.fromPoint.x}
                y1={connection.fromPoint.y}
                x2={connection.toPoint.x}
                y2={connection.toPoint.y}
                stroke="rgba(9, 20, 31, 0.72)"
                strokeWidth="31"
                strokeLinecap="round"
                className="map-connection-border"
              />
              <line
                x1={connection.fromPoint.x}
                y1={connection.fromPoint.y}
                x2={connection.toPoint.x}
                y2={connection.toPoint.y}
                stroke={`url(#connection-gradient-${index})`}
                strokeWidth="27"
                strokeLinecap="round"
                opacity="0.92"
                className="map-connection-path"
              />
              <line
                x1={connection.fromPoint.x}
                y1={connection.fromPoint.y}
                x2={connection.toPoint.x}
                y2={connection.toPoint.y}
                stroke="rgba(20, 32, 42, 0.42)"
                strokeWidth=".8"
                strokeLinecap="round"
                className="map-connection-center"
              />
            </g>
          ))}
        </g>
        <g>
          {game.map.tiles.map((tile) => {
            const { x, y } = hexToPixel(tile.q, tile.r, HEX_SPACING)
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
                  points={polygonPoints(x, y, HEX_RADIUS)}
                  fill={tilePalette[tile.terrain].dark}
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
                  points={polygonPoints(x, y, HEX_RADIUS - 2.5)}
                  fill={`url(#hex-${tile.terrain})`}
                  stroke="rgba(255, 249, 224, 0.24)"
                  strokeWidth="0.65"
                />
                <path
                  d={`M${x - 16} ${y - 14}L${x} ${y - 22}L${x + 16} ${y - 14}`}
                  fill="none"
                  stroke="rgba(255, 252, 230, 0.25)"
                  strokeWidth="0.9"
                  pointerEvents="none"
                />
                <g
                  transform={`translate(${x} ${y - 3})`}
                  className="terrain-glyph"
                >
                  <TerrainIcon terrain={tile.terrain} scale={1.18} />
                </g>
                {game.status === 'CHOOSING_START' &&
                  tile.terrain === 'START' && (
                    <>
                      <circle
                        cx={x}
                        cy={y + 10}
                        r="6"
                        fill="rgba(9, 31, 36, 0.83)"
                        stroke="rgba(255, 242, 206, 0.58)"
                        strokeWidth="0.8"
                        pointerEvents="none"
                      />
                      <text
                        x={x}
                        y={y + 12.7}
                        textAnchor="middle"
                        className="hex-difficulty"
                      >
                        {(
                          game.map.startHexIds ?? [game.map.startHexId]
                        ).indexOf(tile.id) + 1}
                      </text>
                    </>
                  )}
                {occupiedBy.map((player, index) => {
                  const number =
                    game.players.findIndex((entry) => entry.id === player.id) +
                    1
                  const markerX = x + (index - (occupiedBy.length - 1) / 2) * 13
                  const markerY = y + 7
                  return (
                    <g
                      key={player.id}
                      className={`map-player-marker${player.id === game.currentPlayerId ? ' map-player-marker--active' : ''}`}
                    >
                      <title>{`${player.name}${player.id === playerId ? ' (Ty)' : ''}`}</title>
                      <circle
                        cx={markerX}
                        cy={markerY}
                        r={player.id === playerId ? 9 : 7.5}
                        fill={playerColor(number - 1, player.color)}
                        stroke={player.id === playerId ? '#fff8cc' : '#0f172a'}
                        strokeWidth={player.id === playerId ? 2.5 : 1.5}
                      />
                      <PlayerSymbol
                        symbol={playerSymbol(number - 1, player.symbol)}
                        size={player.id === playerId ? 13 : 11}
                        x={markerX - (player.id === playerId ? 6.5 : 5.5)}
                        y={markerY - (player.id === playerId ? 6.5 : 5.5)}
                      />
                    </g>
                  )
                })}
              </g>
            )
          })}
        </g>
        <g className="map-edge-costs" pointerEvents="none">
          {connections.map((connection) => {
            const middleX = (connection.fromPoint.x + connection.toPoint.x) / 2
            const middleY = (connection.fromPoint.y + connection.toPoint.y) / 2
            const deltaX = connection.toPoint.x - connection.fromPoint.x
            const deltaY = connection.toPoint.y - connection.fromPoint.y
            const length = Math.hypot(deltaX, deltaY)
            const perpendicularX = (-deltaY / length) * 5.2
            const perpendicularY = (deltaX / length) * 5.2

            if (
              connection.from.terrain === 'MOUNTAIN' ||
              connection.to.terrain === 'MOUNTAIN' ||
              connection.from.isBlocked ||
              connection.to.isBlocked
            ) {
              return null
            }

            const requirements =
              connection.from.terrain === 'UNKNOWN' ||
              connection.to.terrain === 'UNKNOWN' ||
              connection.from.difficulty < 0 ||
              connection.to.difficulty < 0
                ? [undefined]
                : getMoveRequirements(connection.from, connection.to)
            if (requirements.length === 0) return null

            if (requirements.length === 1) {
              const cost = edgeCost(requirements[0])
              return (
                <g
                  key={`${connection.from.id}-${connection.to.id}`}
                  className="map-edge-cost"
                >
                  <circle
                    cx={middleX}
                    cy={middleY}
                    r="5"
                    fill={cost.color}
                    fillOpacity=".72"
                    stroke="rgba(255, 250, 230, 0.58)"
                    strokeWidth=".65"
                  />
                  <text x={middleX} y={middleY + 2.25} textAnchor="middle">
                    {cost.label}
                  </text>
                </g>
              )
            }

            return requirements.map((requirement, index) => {
              const direction = index === 0 ? -1 : 1
              const x = middleX + perpendicularX * direction
              const y = middleY + perpendicularY * direction
              const cost = edgeCost(requirement)

              return (
                <g
                  key={`${connection.from.id}-${connection.to.id}-${index}`}
                  className="map-edge-cost"
                >
                  <circle
                    cx={x}
                    cy={y}
                    r="4.7"
                    fill={cost.color}
                    fillOpacity=".72"
                    stroke="rgba(255, 250, 230, 0.55)"
                    strokeWidth=".6"
                  />
                  <text x={x} y={y + 2.25} textAnchor="middle">
                    {cost.label}
                  </text>
                </g>
              )
            })
          })}
        </g>
      </svg>
      <div className="player-location-legend" aria-label="Pozycje graczy">
        {game.players.map((player, index) => (
          <span key={player.id} className="player-location-item">
            <PlayerBadge
              index={index}
              color={player.color}
              symbol={player.symbol}
            />
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
              <TerrainIcon terrain={terrain} scale={1.08} />
            </svg>
            {terrainLabels[terrain]}
          </span>
        ))}
      </div>
      <details className="terrain-rules">
        <summary>Zasady terenów</summary>
        <p>
          Liczba na łączniku przy danym polu oznacza koszt wejścia na to pole.
          Można przejść tylko na sąsiednie pole. Uniwersalne punkty ruchu
          zastępują wymagany kolor.
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
