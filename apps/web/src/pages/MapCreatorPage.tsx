import { analyzeMap, generateMap } from '@map-generator'
import type { CustomMap, HexTile, MapSettings, TerrainType } from '@shared'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { TerrainIcon } from '../components/TerrainIcon.js'
import { terrainLabels } from '../labels.js'
import { defaultSettings, useGameStore } from '../store.js'
import { loadCustomMaps, saveCustomMap } from '../customMaps.js'

const editableTerrains: TerrainType[] = [
  'JUNGLE',
  'WATER',
  'DESERT',
  'RUBBLE',
  'CAMP',
  'MOUNTAIN',
]

const terrainColors: Record<TerrainType, string> = {
  UNKNOWN: '#334155',
  START: '#b783cf',
  GOAL: '#8b5fc7',
  JUNGLE: '#4e9973',
  WATER: '#57a9b7',
  DESERT: '#ddbd79',
  RUBBLE: '#8f8799',
  CAMP: '#a286a9',
  MOUNTAIN: '#536b79',
}

const pixel = (tile: HexTile) => ({
  x: 31 * (Math.sqrt(3) * tile.q + (Math.sqrt(3) / 2) * tile.r),
  y: 31 * ((3 / 2) * tile.r),
})

const points = (x: number, y: number) =>
  Array.from({ length: 6 }, (_, index) => {
    const angle = ((60 * index - 30) * Math.PI) / 180
    return `${x + 25 * Math.cos(angle)},${y + 25 * Math.sin(angle)}`
  }).join(' ')

type Tool = TerrainType | 'SET_START' | 'SET_GOAL'

export function MapCreatorPage() {
  const location = useLocation()
  const account = useGameStore((state) => state.account)
  const [settings, setSettings] = useState<MapSettings>(() => ({
    ...defaultSettings,
    seed: `MAP-${Math.floor(Math.random() * 1000000)}`,
  }))
  const [map, setMap] = useState(() => generateMap(settings))
  const [name, setName] = useState('Moja magiczna mapa')
  const [customMaps, setCustomMaps] = useState<CustomMap[]>([])
  const [selectedMapId, setSelectedMapId] = useState('')
  const [tool, setTool] = useState<Tool>('JUNGLE')
  const [difficulty, setDifficulty] = useState(2)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    panX: number
    panY: number
    worldPerPixelX: number
    worldPerPixelY: number
    moved: boolean
    captured: boolean
  } | null>(null)
  const suppressTileClickRef = useRef(false)
  const accountToken = account?.token
  useEffect(() => {
    if (!accountToken) return
    void loadCustomMaps(accountToken)
      .then((maps) => {
        setCustomMaps(maps)
        const mapId = (location.state as { customMapId?: string } | null)
          ?.customMapId
        const selectedMap = maps.find((customMap) => customMap.id === mapId)
        if (!selectedMap) return
        setSelectedMapId(selectedMap.id)
        setName(selectedMap.name)
        setSettings(selectedMap.settings)
        setMap(selectedMap.map)
      })
      .catch((caught: unknown) => {
        setMessage(
          caught instanceof Error
            ? caught.message
            : 'Nie udało się wczytać zapisanych map.',
        )
      })
  }, [accountToken, location.state])

  const bounds = useMemo(() => {
    const coordinates = map.tiles.map(pixel)
    const xs = coordinates.map(({ x }) => x)
    const ys = coordinates.map(({ y }) => y)
    const minX = Math.min(...xs) - 35
    const minY = Math.min(...ys) - 35
    return {
      x: minX,
      y: minY,
      width: Math.max(...xs) - minX + 35,
      height: Math.max(...ys) - minY + 35,
    }
  }, [map.tiles])
  const visibleBounds = useMemo(() => {
    const width = bounds.width / zoom
    const height = bounds.height / zoom
    return {
      x: bounds.x + (bounds.width - width) / 2 + pan.x,
      y: bounds.y + (bounds.height - height) / 2 + pan.y,
      width,
      height,
    }
  }, [bounds, pan, zoom])

  const updateZoom = (nextZoom: number) => {
    const normalizedZoom = Math.min(4, Math.max(1, nextZoom))
    setZoom(normalizedZoom)
    if (normalizedZoom === 1) setPan({ x: 0, y: 0 })
  }

  if (!account) return <Navigate to="/" replace />

  const editTile = (tileId: string) => {
    setMap((current) => {
      let startHexIds = [...(current.startHexIds ?? [])]
      let goalHexId = current.goalHexId
      if (tool === 'SET_START') {
        if (startHexIds.includes(tileId) && startHexIds.length > 1) {
          startHexIds = startHexIds.filter((id) => id !== tileId)
        } else if (startHexIds.length < 4 && tileId !== goalHexId) {
          startHexIds.push(tileId)
        }
      } else if (tool === 'SET_GOAL' && !startHexIds.includes(tileId)) {
        goalHexId = tileId
      }
      const tiles = current.tiles.map((tile) => {
        if (tool === 'SET_START' || tool === 'SET_GOAL') {
          const endpoint: TerrainType = startHexIds.includes(tile.id)
            ? 'START'
            : tile.id === goalHexId
              ? 'GOAL'
              : tile.terrain === 'START' || tile.terrain === 'GOAL'
                ? 'RUBBLE'
                : tile.terrain
          return {
            ...tile,
            terrain: endpoint,
            difficulty:
              endpoint === 'START' || endpoint === 'GOAL' ? 1 : tile.difficulty,
            isBlocked: endpoint === 'MOUNTAIN',
          }
        }
        if (
          tile.id !== tileId ||
          startHexIds.includes(tile.id) ||
          tile.id === goalHexId
        ) {
          return tile
        }
        return {
          ...tile,
          terrain: tool,
          difficulty: tool === 'MOUNTAIN' ? 0 : difficulty,
          isBlocked: tool === 'MOUNTAIN',
        }
      })
      const next = {
        ...current,
        tiles,
        startHexIds,
        startHexId: startHexIds[0] ?? '',
        goalHexId,
      }
      return { ...next, stats: analyzeMap(next) }
    })
    setMessage('')
  }

  return (
    <main className="page shell journey-page map-creator-page">
      <nav className="journey-nav">
        <Link className="home-brand" to="/">
          <span className="home-brand-mark">⬡</span>
          <span>
            TRAVEL<span className="home-brand-accent">GAME</span>
          </span>
        </Link>
        <span className="journey-nav-label">Kreator map</span>
      </nav>
      <header className="journey-header map-creator-header">
        <div>
          <span className="home-eyebrow">WŁASNA KRAINA</span>
          <h1>Kreator map</h1>
          <p>Wygeneruj bazę, zmień pola i zapisz mapę na swoim koncie.</p>
        </div>
        <Link to="/">Wróć</Link>
      </header>
      <div className="map-creator-layout">
        <aside className="panel map-editor-tools">
          <label>
            Nazwa mapy
            <input
              value={name}
              maxLength={40}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Edytuj zapisaną mapę
            <select
              value={selectedMapId}
              onChange={(event) => {
                const nextId = event.target.value
                setSelectedMapId(nextId)
                const selectedMap = customMaps.find(
                  (customMap) => customMap.id === nextId,
                )
                if (selectedMap) {
                  setName(selectedMap.name)
                  setSettings(selectedMap.settings)
                  setMap(selectedMap.map)
                } else {
                  const nextSettings = {
                    ...defaultSettings,
                    seed: `MAP-${Math.floor(Math.random() * 1000000)}`,
                  }
                  setName('Moja magiczna mapa')
                  setSettings(nextSettings)
                  setMap(generateMap(nextSettings))
                }
                updateZoom(1)
                setMessage('')
              }}
            >
              <option value="">Nowa mapa</option>
              {customMaps.map((customMap) => (
                <option key={customMap.id} value={customMap.id}>
                  {customMap.name}
                </option>
              ))}
            </select>
          </label>
          <div className="map-editor-generation">
            <label>
              Rozmiar
              <select
                value={settings.mapSize}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    mapSize: event.target.value as MapSettings['mapSize'],
                  })
                }
              >
                <option value="SMALL">Mała</option>
                <option value="MEDIUM">Średnia</option>
                <option value="LARGE">Duża</option>
              </select>
            </label>
            <label>
              Płatki
              <select
                value={settings.petalCount}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    petalCount: Number(event.target.value),
                  })
                }
              >
                {Array.from({ length: 6 }, (_, index) => index + 1).map(
                  (count) => (
                    <option key={count}>{count}</option>
                  ),
                )}
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                const nextSettings = {
                  ...settings,
                  seed: `MAP-${Math.floor(Math.random() * 1000000)}`,
                }
                setSettings(nextSettings)
                setMap(generateMap(nextSettings))
                updateZoom(1)
                setMessage('')
              }}
            >
              Wygeneruj bazę
            </button>
          </div>
          <strong>Narzędzie</strong>
          <div className="map-editor-terrain-tools">
            {editableTerrains.map((terrain) => (
              <button
                key={terrain}
                type="button"
                aria-pressed={tool === terrain}
                onClick={() => setTool(terrain)}
              >
                {terrainLabels[terrain]}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={tool === 'SET_START'}
              onClick={() => setTool('SET_START')}
            >
              Starty ({map.startHexIds?.length ?? 0}/4)
            </button>
            <button
              type="button"
              aria-pressed={tool === 'SET_GOAL'}
              onClick={() => setTool('SET_GOAL')}
            >
              Portal
            </button>
          </div>
          {tool !== 'SET_START' &&
            tool !== 'SET_GOAL' &&
            tool !== 'MOUNTAIN' && (
              <label>
                Koszt pola: {difficulty}
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={difficulty}
                  onChange={(event) =>
                    setDifficulty(Number(event.target.value))
                  }
                />
              </label>
            )}
          <div className="map-editor-stats">
            <span>Najkrótsza droga: {map.stats.shortestPathLength}</span>
            <span>Trasy ze startu: {map.stats.routeCount}</span>
          </div>
          <button
            type="button"
            className="primary-button"
            disabled={
              saving ||
              !name.trim() ||
              map.startHexIds?.length !== 4 ||
              !Number.isFinite(map.stats.shortestPathLength)
            }
            onClick={async () => {
              setSaving(true)
              try {
                const savedMap = await saveCustomMap(account.token, {
                  ...(selectedMapId ? { id: selectedMapId } : {}),
                  name: name.trim(),
                  settings,
                  map,
                })
                setCustomMaps((maps) => [
                  savedMap,
                  ...maps.filter((customMap) => customMap.id !== savedMap.id),
                ])
                setSelectedMapId(savedMap.id)
                setMessage(
                  selectedMapId
                    ? 'Zmiany mapy zostały zapisane.'
                    : 'Mapa została zapisana na Twoim koncie.',
                )
              } catch (caught) {
                setMessage(
                  caught instanceof Error
                    ? caught.message
                    : 'Nie udało się zapisać mapy.',
                )
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? 'Zapisywanie…' : 'Zapisz mapę'}
          </button>
          {message && <p className="map-editor-message">{message}</p>}
        </aside>
        <section className="panel map-editor-canvas">
          <div className="map-editor-canvas-header">
            <p>Kliknij heks, aby zastosować wybrane narzędzie.</p>
            <div className="map-editor-zoom" aria-label="Powiększenie mapy">
              <button
                type="button"
                aria-label="Oddal mapę"
                disabled={zoom <= 1}
                onClick={() => updateZoom(zoom - 0.25)}
              >
                −
              </button>
              <button
                type="button"
                className="map-editor-zoom-value"
                title="Resetuj widok"
                onClick={() => {
                  setPan({ x: 0, y: 0 })
                  updateZoom(1)
                }}
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                aria-label="Przybliż mapę"
                disabled={zoom >= 4}
                onClick={() => updateZoom(zoom + 0.25)}
              >
                +
              </button>
            </div>
          </div>
          <svg
            viewBox={`${visibleBounds.x} ${visibleBounds.y} ${visibleBounds.width} ${visibleBounds.height}`}
            aria-label="Edytowana mapa"
            onWheel={(event) => {
              event.preventDefault()
              updateZoom(zoom + (event.deltaY < 0 ? 0.25 : -0.25))
            }}
            onPointerDown={(event) => {
              if (zoom <= 1 || event.button !== 0) return
              const rect = event.currentTarget.getBoundingClientRect()
              dragRef.current = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                panX: pan.x,
                panY: pan.y,
                worldPerPixelX: visibleBounds.width / rect.width,
                worldPerPixelY: visibleBounds.height / rect.height,
                moved: false,
                captured: false,
              }
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current
              if (!drag || drag.pointerId !== event.pointerId) {
                return
              }
              const deltaX = event.clientX - drag.startX
              const deltaY = event.clientY - drag.startY
              if (Math.hypot(deltaX, deltaY) <= 4) return
              drag.moved = true
              if (!drag.captured) {
                drag.captured = true
                event.currentTarget.setPointerCapture(event.pointerId)
              }
              const maxPanX = (bounds.width - visibleBounds.width) / 2
              const maxPanY = (bounds.height - visibleBounds.height) / 2
              setPan({
                x: Math.max(
                  -maxPanX,
                  Math.min(maxPanX, drag.panX - deltaX * drag.worldPerPixelX),
                ),
                y: Math.max(
                  -maxPanY,
                  Math.min(maxPanY, drag.panY - deltaY * drag.worldPerPixelY),
                ),
              })
            }}
            onPointerUp={(event) => {
              const drag = dragRef.current
              if (!drag || drag.pointerId !== event.pointerId) return
              if (drag.moved) {
                suppressTileClickRef.current = true
                window.setTimeout(() => {
                  suppressTileClickRef.current = false
                }, 0)
              }
              dragRef.current = null
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId)
              }
            }}
            onPointerCancel={() => {
              dragRef.current = null
              suppressTileClickRef.current = false
            }}
            onClickCapture={(event) => {
              if (!suppressTileClickRef.current) return
              suppressTileClickRef.current = false
              event.preventDefault()
              event.stopPropagation()
            }}
          >
            {map.tiles.map((tile) => {
              const { x, y } = pixel(tile)
              return (
                <g
                  key={tile.id}
                  className="map-editor-tile"
                  onClick={() => editTile(tile.id)}
                >
                  <polygon
                    points={points(x, y)}
                    fill={terrainColors[tile.terrain]}
                    stroke="#f5d89c"
                    strokeWidth="1"
                  />
                  <g transform={`translate(${x} ${y - 3})`}>
                    <TerrainIcon terrain={tile.terrain} scale={1.05} />
                  </g>
                  {!['START', 'GOAL', 'MOUNTAIN'].includes(tile.terrain) && (
                    <text x={x} y={y + 17} textAnchor="middle">
                      {tile.difficulty}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        </section>
      </div>
    </main>
  )
}
