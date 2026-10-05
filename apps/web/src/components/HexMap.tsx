import {
  canAffordMove,
  getEffectiveMoveRequirements,
  getReachableMovePaths,
  getMoveRequirements,
  getTerrainCost,
  type MoveRequirement,
} from '@game-engine'
import type { GameState, HexTile, MovementPool, PlayerState } from '@shared'
import { useEffect, useMemo, useRef, useState } from 'react'
import { movementLabels, movementUnitLabel, terrainLabels } from '../labels.js'
import { playerColor, playerSymbol } from '../playerColors.js'
import { PlayerBadge } from './PlayerBadge.js'
import { PlayerSymbol } from './PlayerSymbol.js'
import { TerrainIcon } from './TerrainIcon.js'

const tilePalette: Record<
  HexTile['terrain'],
  { light: string; dark: string; edge: string }
> = {
  UNKNOWN: { light: '#737b80', dark: '#444d52', edge: '#8c979a' },
  START: { light: '#e3b76e', dark: '#8a6036', edge: '#f5d89c' },
  GOAL: { light: '#efae6a', dark: '#a55234', edge: '#ffd29b' },
  JUNGLE: { light: '#4e9973', dark: '#205645', edge: '#81bf91' },
  WATER: { light: '#57a9b7', dark: '#235979', edge: '#8ad0cf' },
  DESERT: { light: '#ddbd79', dark: '#a47447', edge: '#f4d99c' },
  RUBBLE: { light: '#aca596', dark: '#655c55', edge: '#d1c6ae' },
  CAMP: { light: '#a286a9', dark: '#604960', edge: '#c4a9bc' },
  MOUNTAIN: { light: '#647c7c', dark: '#293f47', edge: '#9eb1a9' },
}

const MAX_ZOOM = 24
const MIN_ZOOM = 0.25
const FOCUS_ZOOM_MULTIPLIER = 0.8
const FOCUS_MIN_ZOOM = 1.1
const HEX_SPACING = 39
const HEX_RADIUS = 26
const BUTTON_ZOOM_FACTOR = 1.5
const BUTTON_PAN_FRACTION = 0.75
const movementTypes = ['GREEN', 'BLUE', 'YELLOW', 'WILD'] as const
const emptyPayment = (): MovementPool => ({
  GREEN: 0,
  BLUE: 0,
  YELLOW: 0,
  WILD: 0,
})

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
      Math.max(
        FOCUS_MIN_ZOOM,
        (mapView.width / 400) * FOCUS_ZOOM_MULTIPLIER,
        (mapView.height / 340) * FOCUS_ZOOM_MULTIPLIER,
      ),
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
  CAMP: 'Koszt pola 1–3: punkty dowolnego koloru.',
  MOUNTAIN: 'Pole zablokowane; nie można na nie wejść.',
  GOAL: 'Koszt pola 5–8: punkty dowolnego koloru. Wejście kończy grę zwycięstwem.',
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
  focusOnPlayer: string | undefined
  focusHexRequest: { hexId: string } | undefined
  canChooseStart: boolean
  onSelectHex: (
    hexId: string,
    anyMovementSpent?: MovementPool,
  ) => Promise<boolean>
  onMoveDragon: (dragonId: string, targetHexId: string) => Promise<boolean>
  onChooseStart: (hexId: string) => void
  blockTargeting: boolean
  onBlockHex: (hexId: string) => void
}

export function HexMap({
  game,
  playerId,
  isActive,
  focusOnPlayer,
  focusHexRequest,
  canChooseStart,
  onSelectHex,
  onMoveDragon,
  onChooseStart,
  blockTargeting,
  onBlockHex,
}: HexMapProps) {
  const [selectedHexId, setSelectedHexId] = useState<string>()
  const [selectedDragonId, setSelectedDragonId] = useState<string>()
  const [inspectedDragonId, setInspectedDragonId] = useState<string>()
  const [inspectedHexId, setInspectedHexId] = useState<string>()
  const [animatedPlayerPosition, setAnimatedPlayerPosition] = useState<{
    x: number
    y: number
  }>()
  const [dragonRenderPositions, setDragonRenderPositions] = useState<
    Record<string, { x: number; y: number }>
  >({})
  const [movingDragonIds, setMovingDragonIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [isAnimatingMove, setIsAnimatingMove] = useState(false)
  const animationIdRef = useRef(0)
  const dragonAnimationIdRef = useRef(0)
  const dragonHexRef = useRef<Record<string, string>>({})
  const latestGameRef = useRef(game)
  latestGameRef.current = game
  const svgRef = useRef<SVGSVGElement>(null)
  const tileInfoDialogRef = useRef<HTMLDialogElement>(null)
  const paymentDialogRef = useRef<HTMLDialogElement>(null)
  const paymentResolverRef = useRef<
    ((payment: MovementPool | undefined | null) => void) | null
  >(null)
  const [pendingPayment, setPendingPayment] = useState<{
    amount: number
    available: MovementPool
  }>()
  const [selectedPayment, setSelectedPayment] =
    useState<MovementPool>(emptyPayment)
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
  const selectedDragon = game.dragons?.find(
    (dragon) => dragon.id === selectedDragonId,
  )
  const selectedDragonTile = game.map.tiles.find(
    (tile) => tile.id === selectedDragon?.position,
  )
  const totalAvailableMovement = localPlayer
    ? localPlayer.availableMovement.GREEN +
      localPlayer.availableMovement.BLUE +
      localPlayer.availableMovement.YELLOW +
      localPlayer.availableMovement.WILD
    : 0
  const canControlDragon = isActive && totalAvailableMovement >= 6
  useEffect(() => {
    if (!selectedDragonId) return
    if (
      !isActive ||
      !game.dragons?.some((dragon) => dragon.id === selectedDragonId)
    ) {
      setSelectedDragonId(undefined)
    }
  }, [game.dragons, isActive, selectedDragonId])
  const startPetalIds = new Set(
    (game.map.startHexIds ?? [game.map.startHexId]).map(
      (id) => game.map.tiles.find((tile) => tile.id === id)?.petalId ?? 0,
    ),
  )
  const isDragonMoveTarget = (tile: HexTile): boolean =>
    Boolean(
      canControlDragon &&
      selectedDragon &&
      selectedDragonTile &&
      cubeDistance(selectedDragonTile, tile) === 1 &&
      !startPetalIds.has(tile.petalId ?? 0) &&
      !tile.isBlocked &&
      !['START', 'GOAL', 'MOUNTAIN', 'UNKNOWN'].includes(tile.terrain) &&
      tile.difficulty >= 0 &&
      !game.players.some((player) => player.position === tile.id) &&
      !game.dragons?.some(
        (dragon) =>
          dragon.id !== selectedDragon.id && dragon.position === tile.id,
      ),
    )
  const inspectedTile = game.map.tiles.find(
    (tile) => tile.id === inspectedHexId,
  )
  const inspectedDragon =
    game.dragons?.find((dragon) => dragon.id === inspectedDragonId) ??
    game.dragons?.find((dragon) => dragon.position === inspectedHexId)
  const inspectedOccupants = game.players.filter(
    (player) => player.position === inspectedHexId,
  )
  const inspectedDistance =
    currentTile && inspectedTile
      ? cubeDistance(currentTile, inspectedTile)
      : undefined
  const dragonDistanceTo = (tile: HexTile | undefined): number => {
    if (!tile || !game.dragons?.length) return Infinity
    return Math.min(
      ...game.dragons.map((dragon) => {
        const dragonTile = game.map.tiles.find(
          (entry) => entry.id === dragon.position,
        )
        return dragonTile ? cubeDistance(dragonTile, tile) : Infinity
      }),
    )
  }
  const inspectedDragonDistance = dragonDistanceTo(inspectedTile)
  const localDragonDistance = dragonDistanceTo(currentTile)
  const inspectedCostHidden =
    inspectedTile?.terrain === 'UNKNOWN' ||
    (inspectedTile?.difficulty ?? -1) < 0 ||
    Boolean(localPlayer?.fogCostsHidden)
  const inspectedRequirements =
    localPlayer && currentTile && inspectedTile && !inspectedCostHidden
      ? getEffectiveMoveRequirements(
          localPlayer,
          currentTile,
          inspectedTile,
          game.map.tiles,
          game.dragons,
        )
      : []
  const inspectedTerrainCost = inspectedTile
    ? getTerrainCost(inspectedTile.terrain, inspectedTile.difficulty)
    : 'BLOCKED'
  const inspectedKnownBlocked = Boolean(
    inspectedTile &&
    inspectedTile.terrain !== 'UNKNOWN' &&
    (inspectedTile.isBlocked || inspectedTerrainCost === 'BLOCKED'),
  )
  const formatRequirements = (requirements: MoveRequirement[]): string =>
    requirements
      .map((requirement) =>
        movementUnitLabel(
          requirement.type === 'ANY' ? 'WILD' : requirement.type,
          requirement.amount,
        ),
      )
      .join(' + ')
  const openTileInfo = (hexId: string) => {
    setInspectedDragonId(undefined)
    setInspectedHexId(hexId)
    if (!tileInfoDialogRef.current?.open) tileInfoDialogRef.current?.showModal()
  }
  const openDragonInfo = (dragonId: string, hexId: string) => {
    setInspectedDragonId(dragonId)
    setInspectedHexId(hexId)
    if (!tileInfoDialogRef.current?.open) tileInfoDialogRef.current?.showModal()
  }
  const startTile = game.map.tiles.find(
    (tile) =>
      tile.id ===
      (game.map.startHexIds?.[Math.floor(game.map.startHexIds.length / 2)] ??
        game.map.startHexId),
  )
  const mapView = useMemo(() => {
    if (
      game.settings.fogMode === 'MEDIUM' ||
      game.settings.fogMode === 'FULL' ||
      (game.settings.fogMode === 'RANGE' &&
        game.settings.terrainVisibilityRange !== 'ALL' &&
        game.settings.costVisibilityRange !== 'ALL')
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
  }, [
    currentTile,
    startTile,
    game.map.tiles,
    game.settings.fogMode,
    game.settings.terrainVisibilityRange,
    game.settings.costVisibilityRange,
  ])
  const [view, setView] = useState(() =>
    focusedView(currentTile ?? startTile, mapView),
  )
  const { zoom, pan } = view
  const focusedGameRef = useRef(game.id)
  const focusedOwnStartRef = useRef(Boolean(currentTile))
  const focusedCampRef = useRef<string | undefined>(undefined)
  const focusedHexRequestRef = useRef(focusHexRequest)

  useEffect(() => {
    if (!focusHexRequest || focusHexRequest === focusedHexRequestRef.current)
      return
    focusedHexRequestRef.current = focusHexRequest
    const tile = game.map.tiles.find(
      (entry) => entry.id === focusHexRequest.hexId,
    )
    if (tile) setView(focusedView(tile, mapView))
  }, [focusHexRequest, game.map.tiles, mapView])

  useEffect(() => {
    if (!focusOnPlayer || focusOnPlayer === focusedCampRef.current) return
    focusedCampRef.current = focusOnPlayer
    setView(focusedView(currentTile, mapView))
  }, [focusOnPlayer, currentTile, mapView])

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
          MIN_ZOOM,
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

  const reachablePaths = useMemo(
    () =>
      isActive && !blockTargeting && playerId
        ? getReachableMovePaths(game, playerId)
        : new Map<string, string[]>(),
    [blockTargeting, game, isActive, playerId],
  )
  const reachable = useMemo(
    () => new Set(reachablePaths.keys()),
    [reachablePaths],
  )
  const tilesByCoordinate = new Map(
    game.map.tiles.map((tile) => [`${tile.q},${tile.r}`, tile]),
  )
  const shortcutOptions =
    isActive &&
    localPlayer?.shortcutMoveAvailable &&
    currentTile &&
    !blockTargeting
      ? game.map.tiles.flatMap((obstacle) => {
          if (
            cubeDistance(currentTile, obstacle) !== 1 ||
            (!obstacle.isBlocked && obstacle.terrain !== 'MOUNTAIN')
          ) {
            return []
          }
          const landing = tilesByCoordinate.get(
            `${2 * obstacle.q - currentTile.q},${2 * obstacle.r - currentTile.r}`,
          )
          if (
            !landing ||
            landing.terrain === 'UNKNOWN' ||
            landing.difficulty < 0
          )
            return []
          const requirements = getEffectiveMoveRequirements(
            localPlayer,
            currentTile,
            landing,
            game.map.tiles,
            game.dragons,
          )
          return requirements.length > 0
            ? [{ obstacle, landing, requirements }]
            : []
        })
      : []
  const inspectedReason = (() => {
    if (!inspectedTile) return ''
    if (inspectedTile.id === currentTile?.id) return 'Jesteś już na tym polu.'
    if (game.status === 'CHOOSING_START') {
      return 'Na początku gry można wybrać tylko wolne pole startowe.'
    }
    if (game.status === 'FINISHED') return 'Gra już się zakończyła.'
    if (localPlayer?.pendingCampReward) return 'Najpierw wybierz runę.'
    if (!isActive) return 'Poczekaj na swoją turę, aby wykonać ruch.'
    if (inspectedTile.terrain === 'UNKNOWN') {
      return 'Pole pozostaje nieodkryte. Zbliż się, aby poznać teren i koszt.'
    }
    if (game.dragons?.some((dragon) => dragon.position === inspectedTile.id)) {
      return 'Na tym polu stoi smok.'
    }
    if (
      game.dragons?.some((dragon) => {
        const dragonTile = game.map.tiles.find(
          (tile) => tile.id === dragon.position,
        )
        return dragonTile
          ? cubeDistance(dragonTile, inspectedTile) === 1
          : false
      })
    ) {
      return 'Smok blokuje pola sąsiadujące ze swoim polem.'
    }
    if (inspectedTile.isBlocked || inspectedTerrainCost === 'BLOCKED') {
      return 'Pole jest zablokowane i nie można na nie wejść.'
    }
    if (
      game.settings.allowSharedTiles === false &&
      !localPlayer?.sharedTileAccessAvailable &&
      inspectedOccupants.some((player) => player.id !== playerId)
    ) {
      return 'Pole zajmuje inny gracz, a wspólne pola są wyłączone.'
    }
    if (
      localPlayer &&
      currentTile &&
      inspectedRequirements.length > 0 &&
      !canAffordMove(
        localPlayer,
        currentTile,
        inspectedTile,
        game.map.tiles,
        game.dragons,
      )
    ) {
      return 'Brakuje punktów ruchu do przejścia na to pole.'
    }
    if (inspectedDistance && inspectedDistance > 1) {
      return 'Nie masz teraz dostępnej trasy do tego pola.'
    }
    return 'Na to pole nie można teraz wejść.'
  })()
  const inspectedActions = (() => {
    if (!inspectedTile) return []
    if (game.status === 'FINISHED') return ['Rozgrywka jest zakończona.']
    if (game.status === 'CHOOSING_START') {
      return ['Wybierz jedno z wolnych pól startowych.']
    }
    if (inspectedTile.terrain === 'UNKNOWN') {
      return ['Zbliż się do pola, aby odsłonić jego teren i koszt.']
    }
    if (inspectedTile.terrain === 'MOUNTAIN') {
      if (localPlayer?.shortcutMoveAvailable && inspectedDistance === 1) {
        return [
          'Zwój pozwala przeskoczyć tę górę na pole dokładnie za nią, jeśli masz punkty ruchu na koszt pola docelowego.',
        ]
      }
      return ['Poszukaj drogi omijającej góry.']
    }
    if (inspectedTile.isBlocked) {
      return ['Wybierz inną trasę lub poczekaj na wygaśnięcie blokady.']
    }
    if (
      game.settings.allowSharedTiles === false &&
      !localPlayer?.sharedTileAccessAvailable &&
      inspectedOccupants.length > 0
    ) {
      return ['Poczekaj, aż gracz opuści pole, albo wybierz inną trasę.']
    }
    const actions = [
      'Zagraj kartę na ruch, użyj runy lub zbliż się przez sąsiednie pola.',
    ]
    if (
      inspectedTile.terrain === 'CAMP' &&
      !localPlayer?.claimedCampIds?.includes(inspectedTile.id)
    ) {
      actions.push('Przy pierwszym wejściu wybierzesz jedną z trzech run.')
    }
    if (inspectedTile.terrain === 'GOAL') {
      actions.push('Wejście na portal kończy grę zwycięstwem.')
    }
    return actions
  })()

  useEffect(
    () => () => {
      animationIdRef.current += 1
      dragonAnimationIdRef.current += 1
    },
    [],
  )

  useEffect(() => {
    const dragons = game.dragons ?? []
    const currentDragonHexes = dragonHexRef.current
    const nextDragonIds = new Set(dragons.map((dragon) => dragon.id))
    const immediatePositions: Record<string, { x: number; y: number }> = {}
    const animations: Array<{
      id: string
      from: { x: number; y: number }
      to: { x: number; y: number }
    }> = []

    for (const key of Object.keys(currentDragonHexes)) {
      if (!nextDragonIds.has(key)) delete currentDragonHexes[key]
    }

    for (const dragon of dragons) {
      const newTile = game.map.tiles.find((tile) => tile.id === dragon.position)
      if (!newTile) continue
      const newPoint = hexToPixel(newTile.q, newTile.r, HEX_SPACING)
      const previousHexId = currentDragonHexes[dragon.id]
      const previousTile = previousHexId
        ? game.map.tiles.find((tile) => tile.id === previousHexId)
        : undefined
      currentDragonHexes[dragon.id] = dragon.position

      if (!previousTile || previousTile.id === newTile.id) {
        immediatePositions[dragon.id] = newPoint
        continue
      }

      animations.push({
        id: dragon.id,
        from: hexToPixel(previousTile.q, previousTile.r, HEX_SPACING),
        to: newPoint,
      })
    }

    if (Object.keys(immediatePositions).length > 0) {
      setDragonRenderPositions((current) => ({
        ...current,
        ...immediatePositions,
      }))
    }
    if (animations.length === 0) {
      setDragonRenderPositions((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([id]) => nextDragonIds.has(id)),
        ),
      )
      return
    }

    const animationId = dragonAnimationIdRef.current + 1
    dragonAnimationIdRef.current = animationId
    setMovingDragonIds(new Set(animations.map((animation) => animation.id)))
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    const duration = reducedMotion ? 80 : 520
    const startedAt = performance.now()

    const frame = (now: number) => {
      if (dragonAnimationIdRef.current !== animationId) return
      const progress = Math.min(1, (now - startedAt) / duration)
      const jump = Math.sin(progress * Math.PI) * (reducedMotion ? 0 : 12)
      setDragonRenderPositions((current) => {
        const next = { ...current }
        for (const animation of animations) {
          next[animation.id] = {
            x:
              animation.from.x + (animation.to.x - animation.from.x) * progress,
            y:
              animation.from.y +
              (animation.to.y - animation.from.y) * progress -
              jump,
          }
        }
        return Object.fromEntries(
          Object.entries(next).filter(([id]) => nextDragonIds.has(id)),
        )
      })

      if (progress < 1) {
        requestAnimationFrame(frame)
      } else {
        setMovingDragonIds(new Set())
      }
    }
    requestAnimationFrame(frame)
  }, [game.dragons, game.map.tiles])

  useEffect(() => {
    if (isAnimatingMove && (game.currentPlayerId !== playerId || !isActive)) {
      animationIdRef.current += 1
      setIsAnimatingMove(false)
      setAnimatedPlayerPosition(undefined)
      paymentDialogRef.current?.close()
    }
  }, [game.currentPlayerId, isActive, isAnimatingMove, playerId])

  const chooseAnyPayment = (
    player: PlayerState,
    from: HexTile,
    to: HexTile,
    tiles: HexTile[],
  ): Promise<MovementPool | undefined | null> => {
    const requirements = getEffectiveMoveRequirements(
      player,
      from,
      to,
      tiles,
      game.dragons,
    )
    const amount = requirements
      .filter((requirement) => requirement.type === 'ANY')
      .reduce((sum, requirement) => sum + requirement.amount, 0)
    if (amount === 0) return Promise.resolve(undefined)
    const available = { ...player.availableMovement }
    for (const requirement of requirements) {
      if (requirement.type === 'ANY') continue
      const colored = Math.min(available[requirement.type], requirement.amount)
      available[requirement.type] -= colored
      available.WILD -= requirement.amount - colored
    }
    if (movementTypes.filter((type) => available[type] > 0).length < 2) {
      return Promise.resolve(undefined)
    }
    setSelectedPayment(emptyPayment())
    setPendingPayment({ amount, available })
    return new Promise((resolve) => {
      paymentResolverRef.current = resolve
      paymentDialogRef.current?.showModal()
    })
  }

  const animateMovePath = async (destinationId: string): Promise<void> => {
    if (isAnimatingMove || !playerId) return
    const path = reachablePaths.get(destinationId)
    if (!path?.length || !currentTile) return

    const animationId = animationIdRef.current + 1
    animationIdRef.current = animationId
    const turnNumber = game.turnNumber
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    const stepDuration = reducedMotion ? 80 : 500
    let from = currentTile
    setIsAnimatingMove(true)
    setAnimatedPlayerPosition(hexToPixel(from.q, from.r, HEX_SPACING))

    try {
      for (const nextHexId of path) {
        const next = game.map.tiles.find((tile) => tile.id === nextHexId)
        if (!next) break
        const liveGame = latestGameRef.current
        const livePlayer = liveGame.players.find(
          (player) => player.id === playerId,
        )
        if (
          animationIdRef.current !== animationId ||
          liveGame.currentPlayerId !== playerId ||
          liveGame.turnNumber !== turnNumber ||
          livePlayer?.position !== from.id
        ) {
          break
        }

        const anyMovementSpent = await chooseAnyPayment(
          livePlayer,
          from,
          next,
          liveGame.map.tiles,
        )
        if (animationIdRef.current !== animationId || anyMovementSpent === null)
          break
        const startPoint = hexToPixel(from.q, from.r, HEX_SPACING)
        const endPoint = hexToPixel(next.q, next.r, HEX_SPACING)
        const startedAt = performance.now()
        const didAnimate = await new Promise<boolean>((resolve) => {
          const frame = (now: number) => {
            if (animationIdRef.current !== animationId) {
              resolve(false)
              return
            }
            const progress = Math.min(1, (now - startedAt) / stepDuration)
            setAnimatedPlayerPosition({
              x: startPoint.x + (endPoint.x - startPoint.x) * progress,
              y: startPoint.y + (endPoint.y - startPoint.y) * progress,
            })
            if (progress === 1) resolve(true)
            else requestAnimationFrame(frame)
          }
          requestAnimationFrame(frame)
        })
        if (!didAnimate) break

        const moved = await onSelectHex(next.id, anyMovementSpent)
        if (!moved) break
        from = next
      }
    } finally {
      if (animationIdRef.current === animationId) {
        setIsAnimatingMove(false)
        setAnimatedPlayerPosition(undefined)
      }
    }
  }
  const connections = useMemo(() => {
    const byCoordinates = new Map(
      game.map.tiles.map((tile) => [`${tile.q},${tile.r}`, tile]),
    )
    const directions = [
      [1, 0],
      [1, -1],
      [0, -1],
    ] as const
    return game.map.tiles.flatMap((tile) =>
      directions.flatMap(([dq, dr]) => {
        const neighbor = byCoordinates.get(`${tile.q + dq},${tile.r + dr}`)
        return neighbor
          ? [
              {
                from: tile,
                to: neighbor,
                fromPoint: hexToPixel(tile.q, tile.r, HEX_SPACING),
                toPoint: hexToPixel(neighbor.q, neighbor.r, HEX_SPACING),
              },
            ]
          : []
      }),
    )
  }, [game.map.tiles])

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
                zoom: Math.min(MAX_ZOOM, current.zoom * BUTTON_ZOOM_FACTOR),
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
                zoom: Math.max(MIN_ZOOM, current.zoom / BUTTON_ZOOM_FACTOR),
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
                pan: {
                  ...current.pan,
                  x:
                    current.pan.x -
                    (mapView.width / current.zoom) * BUTTON_PAN_FRACTION,
                },
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
                pan: {
                  ...current.pan,
                  x:
                    current.pan.x +
                    (mapView.width / current.zoom) * BUTTON_PAN_FRACTION,
                },
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
                pan: {
                  ...current.pan,
                  y:
                    current.pan.y -
                    (mapView.height / current.zoom) * BUTTON_PAN_FRACTION,
                },
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
                pan: {
                  ...current.pan,
                  y:
                    current.pan.y +
                    (mapView.height / current.zoom) * BUTTON_PAN_FRACTION,
                },
              }))
            }
          >
            ↓
          </button>
        </div>
      </div>
      {selectedDragon && (
        <div className="map-dragon-control-notice" role="status">
          <div>
            <strong>Tryb poruszania smokiem</strong>
            <p>
              Kliknij podświetlone sąsiednie pole, aby przesunąć smoka za 6
              dowolnych punktów ruchu.
            </p>
          </div>
          <button type="button" onClick={() => setSelectedDragonId(undefined)}>
            Anuluj
          </button>
        </div>
      )}
      {(localPlayer?.shortcutMoveAvailable ||
        localPlayer?.extraMoveCostPending ||
        localPlayer?.fogCostsHidden ||
        (game.temporaryBlockedHexes?.length ?? 0) > 0 ||
        localDragonDistance <= 1) && (
        <div
          className="map-curse-notices"
          aria-label="Klątwy wpływające na mapę"
        >
          {localPlayer?.shortcutMoveAvailable && (
            <p>
              <strong>Zwój tajemnych przejść:</strong> kliknij sąsiednią górę
              lub pole dokładnie za nią. Skok zużyje punkty ruchu równe kosztowi
              pola docelowego. Możesz wykonać go raz w tej turze.
            </p>
          )}
          {localPlayer?.extraMoveCostPending && (
            <p>
              <strong>Pęknięcie szlaku:</strong> każde przejście do końca rundy
              kosztuje dodatkowy 1 dowolny punkt ruchu. Fioletowe +1 oznacza ten
              koszt przy wyjściach z Twojego pola.
            </p>
          )}
          {localPlayer?.fogCostsHidden && (
            <p>
              <strong>Mgła zapomnienia:</strong> koszty przejść są ukryte do
              końca Twojej tury.
            </p>
          )}
          {(game.temporaryBlockedHexes?.length ?? 0) > 0 && (
            <p>
              <strong>Pieczęć pola:</strong> pole oznaczone fioletowym × jest
              zablokowane.
            </p>
          )}
          {/*{(game.dragons?.length ?? 0) > 0 && (*/}
          {/*  <p>*/}
          {/*    <strong>Smok:</strong> czerwone pulsujące pola są zablokowane*/}
          {/*    przez smoka. Czerwony pierścień oznacza pola z dodatkowym kosztem*/}
          {/*    +2 dowolnego ruchu. Kliknij smoka, aby zobaczyć zasady sterowania.*/}
          {/*  </p>*/}
          {/*)}*/}
          {localDragonDistance <= 1 && (
            <p>
              <strong>Jesteś przy smoku:</strong> pola sąsiadujące ze smokiem są
              zablokowane. Możesz wyjść tylko na pole poza tą strefą, jeśli masz
              wystarczająco punktów ruchu.
            </p>
          )}
        </div>
      )}
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
                stroke={`url(#connection-gradient-${index})`}
                strokeWidth="36"
                strokeLinecap="round"
                opacity="0.96"
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
        {currentTile && shortcutOptions.length > 0 && (
          <g className="map-shortcut-paths" pointerEvents="none">
            {shortcutOptions.map(({ landing }) => {
              const from = hexToPixel(currentTile.q, currentTile.r, HEX_SPACING)
              const to = hexToPixel(landing.q, landing.r, HEX_SPACING)
              return (
                <line
                  key={landing.id}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke="#efb5ff"
                  strokeWidth="2.5"
                  strokeDasharray="4 4"
                  opacity=".9"
                />
              )
            })}
          </g>
        )}
        <g>
          {game.map.tiles.map((tile) => {
            const { x, y } = hexToPixel(tile.q, tile.r, HEX_SPACING)
            const occupiedBy = game.players.filter(
              (player) => player.position === tile.id,
            )
            const isReachable = reachable.has(tile.id)
            const shortcutOption = shortcutOptions.find(
              (option) => option.obstacle.id === tile.id,
            )
            const shortcutLanding = shortcutOption?.landing
            const isShortcutObstacle = Boolean(
              shortcutLanding &&
              reachablePaths.get(shortcutLanding.id)?.[0] ===
                shortcutLanding.id,
            )
            const blockDistance = currentTile
              ? cubeDistance(currentTile, tile)
              : Infinity
            const isBlockTarget =
              blockTargeting &&
              blockDistance >= 1 &&
              blockDistance <= 2 &&
              !tile.isBlocked &&
              !['START', 'GOAL', 'MOUNTAIN', 'UNKNOWN'].includes(
                tile.terrain,
              ) &&
              occupiedBy.length === 0
            const isAvailableStart =
              canChooseStart &&
              game.status === 'CHOOSING_START' &&
              game.currentPlayerId === playerId &&
              (game.map.startHexIds ?? [game.map.startHexId]).includes(
                tile.id,
              ) &&
              occupiedBy.length === 0
            const isSelected = selectedHexId === tile.id
            const tileDragonDistance = dragonDistanceTo(tile)
            const isDragonBlockedZone = tileDragonDistance <= 1
            const isDragonPenaltyZone = tileDragonDistance === 2
            const isDragonTarget = isDragonMoveTarget(tile)
            const isLocalTile = localPlayer?.position === tile.id
            return (
              <g
                key={tile.id}
                className={`map-tile${!blockTargeting && ((isActive && (isReachable || isShortcutObstacle)) || isAvailableStart) ? ' reachable-hex' : ''}${isBlockTarget ? ' curse-target-hex' : ''}${isDragonBlockedZone ? ' dragon-block-zone' : ''}${isDragonPenaltyZone ? ' dragon-penalty-zone' : ''}${isDragonTarget ? ' dragon-target-hex' : ''}`}
                onClick={() => {
                  setSelectedHexId(tile.id)
                  if (isAnimatingMove) return
                  if (blockTargeting) {
                    if (isBlockTarget) onBlockHex(tile.id)
                    else openTileInfo(tile.id)
                    return
                  }
                  if (selectedDragon) {
                    if (isDragonTarget) {
                      void onMoveDragon(selectedDragon.id, tile.id).then(
                        (ok) => {
                          if (ok) setSelectedDragonId(undefined)
                        },
                      )
                    } else {
                      openTileInfo(tile.id)
                    }
                    return
                  }
                  if (isActive && isReachable) {
                    void animateMovePath(tile.id)
                  } else if (
                    isActive &&
                    isShortcutObstacle &&
                    shortcutLanding
                  ) {
                    void animateMovePath(shortcutLanding.id)
                  } else if (isAvailableStart) {
                    onChooseStart(tile.id)
                  } else {
                    openTileInfo(tile.id)
                  }
                }}
              >
                <title>
                  {shortcutOption
                    ? `Skok na ${terrainLabels[shortcutOption.landing.terrain]} — ${localPlayer?.fogCostsHidden ? 'koszt ukryty' : formatRequirements(shortcutOption.requirements)}`
                    : localPlayer?.fogCostsHidden
                      ? `${terrainLabels[tile.terrain]} — koszt spowity klątwą`
                      : tileDescription(tile)}
                </title>
                <polygon
                  points={polygonPoints(x, y, HEX_RADIUS)}
                  fill={tilePalette[tile.terrain].dark}
                  stroke={
                    isDragonTarget
                      ? '#ff3d2e'
                      : isAvailableStart
                        ? '#ffe0a1'
                        : isLocalTile
                          ? '#f5c778'
                          : isSelected
                            ? '#fff2ca'
                            : isReachable || (isActive && isShortcutObstacle)
                              ? '#b7e8cc'
                              : tilePalette[tile.terrain].edge
                  }
                  strokeWidth={
                    isDragonTarget
                      ? 4
                      : isAvailableStart
                        ? 3.5
                        : isLocalTile
                          ? 3.5
                          : isSelected
                            ? 3
                            : isReachable || (isActive && isShortcutObstacle)
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
                {isDragonBlockedZone && (
                  <polygon
                    points={polygonPoints(x, y, HEX_RADIUS - 4)}
                    className="dragon-zone-fill dragon-zone-fill--blocked"
                    pointerEvents="none"
                  />
                )}
                {isDragonPenaltyZone && (
                  <>
                    <polygon
                      points={polygonPoints(x, y, HEX_RADIUS - 5)}
                      className="dragon-zone-fill dragon-zone-fill--penalty"
                      pointerEvents="none"
                    />
                    <g className="dragon-zone-cost" pointerEvents="none">
                      <circle cx={x + 15} cy={y - 15} r="9" />
                      <text x={x + 15} y={y - 11.5} textAnchor="middle">
                        +2
                      </text>
                    </g>
                  </>
                )}
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
                {game.temporaryBlockedHexes?.some(
                  (block) => block.hexId === tile.id,
                ) && (
                  <g pointerEvents="none" aria-hidden="true">
                    <circle
                      cx={x}
                      cy={y}
                      r="17"
                      fill="rgba(68, 19, 89, 0.85)"
                      stroke="#f0afff"
                      strokeWidth="2"
                    />
                    <text
                      x={x}
                      y={y + 6}
                      textAnchor="middle"
                      fill="#fff2ff"
                      fontSize="22"
                      fontWeight="bold"
                    >
                      ✕
                    </text>
                  </g>
                )}
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
                  if (player.id === playerId && isAnimatingMove) return null
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
        <g className="map-dragons">
          {(game.dragons ?? []).map((dragon) => {
            const tile = game.map.tiles.find(
              (entry) => entry.id === dragon.position,
            )
            if (!tile) return null
            const fallbackPoint = hexToPixel(tile.q, tile.r, HEX_SPACING)
            const { x, y } = dragonRenderPositions[dragon.id] ?? fallbackPoint
            const selected = selectedDragonId === dragon.id
            const moving = movingDragonIds.has(dragon.id)
            return (
              <g
                key={dragon.id}
                className={`map-dragon-marker${selected ? ' map-dragon-marker--selected' : ''}${moving ? ' map-dragon-marker--moving' : ''}`}
                onClick={(event) => {
                  event.stopPropagation()
                  if (isActive) {
                    setSelectedDragonId(selected ? undefined : dragon.id)
                    setSelectedHexId(tile.id)
                  }
                  openDragonInfo(dragon.id, tile.id)
                }}
              >
                <title>
                  Smok — kliknij, żeby wybrać kierunek ruchu za 6 dowolnego
                  ruchu
                </title>
                <circle
                  cx={x}
                  cy={y - 2}
                  r={selected ? 18 : 16}
                  fill="#7f1d1d"
                  stroke={selected ? '#fde68a' : '#fecaca'}
                  strokeWidth={selected ? 3.5 : 2.5}
                />
                <text
                  x={x}
                  y={y + 5}
                  textAnchor="middle"
                  fill="#fff7ed"
                  fontSize="22"
                  fontWeight="900"
                  pointerEvents="none"
                >
                  🐉
                </text>
              </g>
            )
          })}
        </g>
        {isAnimatingMove && animatedPlayerPosition && localPlayer && (
          <g
            className="map-player-marker map-player-marker--active map-player-marker--moving"
            pointerEvents="none"
            aria-hidden="true"
          >
            <circle
              cx={animatedPlayerPosition.x}
              cy={animatedPlayerPosition.y + 7}
              r="9"
              fill={playerColor(
                game.players.findIndex((player) => player.id === playerId),
                localPlayer.color,
              )}
              stroke="#fff8cc"
              strokeWidth="2.5"
            />
            <PlayerSymbol
              symbol={playerSymbol(
                game.players.findIndex((player) => player.id === playerId),
                localPlayer.symbol,
              )}
              size={13}
              x={animatedPlayerPosition.x - 6.5}
              y={animatedPlayerPosition.y + 0.5}
            />
          </g>
        )}
        <g className="map-edge-costs" pointerEvents="none">
          {connections.map((connection) => {
            const middleX = (connection.fromPoint.x + connection.toPoint.x) / 2
            const middleY = (connection.fromPoint.y + connection.toPoint.y) / 2
            const deltaX = connection.toPoint.x - connection.fromPoint.x
            const deltaY = connection.toPoint.y - connection.fromPoint.y
            const length = Math.hypot(deltaX, deltaY)
            const perpendicularX = (-deltaY / length) * 5.2
            const perpendicularY = (deltaX / length) * 5.2
            const fromDragonDistance = dragonDistanceTo(connection.from)
            const toDragonDistance = dragonDistanceTo(connection.to)
            const fromDragonBlocked = fromDragonDistance <= 1
            const toDragonBlocked = toDragonDistance <= 1
            const exitsLocalDragonBlock = Boolean(
              currentTile &&
              localPlayer &&
              dragonDistanceTo(currentTile) <= 1 &&
              (connection.from.id === currentTile.id ||
                connection.to.id === currentTile.id) &&
              (connection.from.id === currentTile.id
                ? !toDragonBlocked
                : !fromDragonBlocked),
            )

            if (
              (fromDragonBlocked || toDragonBlocked) &&
              !exitsLocalDragonBlock
            ) {
              return null
            }

            if (
              connection.from.terrain === 'MOUNTAIN' ||
              connection.to.terrain === 'MOUNTAIN' ||
              connection.from.isBlocked ||
              connection.to.isBlocked
            ) {
              return null
            }

            const requirements =
              localPlayer?.fogCostsHidden ||
              connection.from.terrain === 'UNKNOWN' ||
              connection.to.terrain === 'UNKNOWN' ||
              connection.from.difficulty < 0 ||
              connection.to.difficulty < 0
                ? [undefined]
                : exitsLocalDragonBlock && localPlayer && currentTile
                  ? getEffectiveMoveRequirements(
                      localPlayer,
                      currentTile,
                      connection.from.id === currentTile.id
                        ? connection.to
                        : connection.from,
                      game.map.tiles,
                      game.dragons,
                    )
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
        {currentTile && shortcutOptions.length > 0 && (
          <g className="map-shortcut-costs" pointerEvents="none">
            {shortcutOptions.flatMap(({ landing, requirements }) => {
              const obstaclePoint = hexToPixel(
                (currentTile.q + landing.q) / 2,
                (currentTile.r + landing.r) / 2,
                HEX_SPACING,
              )
              const landingPoint = hexToPixel(landing.q, landing.r, HEX_SPACING)
              const x = (obstaclePoint.x + landingPoint.x) / 2
              const y = (obstaclePoint.y + landingPoint.y) / 2
              const shownRequirements = localPlayer?.fogCostsHidden
                ? [undefined]
                : requirements
              return shownRequirements.map((requirement, index) => {
                const cost = edgeCost(requirement)
                const badgeX =
                  x + (index - (shownRequirements.length - 1) / 2) * 12
                return (
                  <g key={`${landing.id}-${index}`}>
                    <circle
                      cx={badgeX}
                      cy={y}
                      r={shownRequirements.length === 1 ? 7 : 5.5}
                      fill={cost.color}
                      stroke="#efb5ff"
                      strokeWidth="1.4"
                    />
                    <text x={badgeX} y={y + 2.3} textAnchor="middle">
                      {cost.label}
                    </text>
                  </g>
                )
              })
            })}
          </g>
        )}
        {localPlayer?.extraMoveCostPending && currentTile && (
          <g className="map-curse-costs" pointerEvents="none">
            {connections
              .filter(
                (connection) =>
                  (connection.from.id === currentTile.id ||
                    connection.to.id === currentTile.id) &&
                  getMoveRequirements(connection.from, connection.to).length >
                    0,
              )
              .map((connection) => {
                const middleX =
                  (connection.fromPoint.x + connection.toPoint.x) / 2
                const middleY =
                  (connection.fromPoint.y + connection.toPoint.y) / 2
                const deltaX = connection.toPoint.x - connection.fromPoint.x
                const deltaY = connection.toPoint.y - connection.fromPoint.y
                const length = Math.hypot(deltaX, deltaY)
                const x = middleX - (deltaY / length) * 13
                const y = middleY + (deltaX / length) * 13

                return (
                  <g key={`${connection.from.id}-${connection.to.id}`}>
                    <circle cx={x} cy={y} r="7" />
                    <text x={x} y={y + 2.3} textAnchor="middle">
                      +1
                    </text>
                  </g>
                )
              })}
          </g>
        )}
      </svg>
      <dialog
        ref={paymentDialogRef}
        className="tile-info-dialog movement-payment-dialog"
        aria-labelledby="movement-payment-title"
        onClose={() => {
          paymentResolverRef.current?.(null)
          paymentResolverRef.current = null
          setPendingPayment(undefined)
        }}
      >
        {pendingPayment && (
          <div className="tile-info-content">
            <header>
              <div>
                <small>Koszt przejścia</small>
                <h2 id="movement-payment-title">Wybierz punkty ruchu</h2>
              </div>
            </header>
            <p>Wydaj {pendingPayment.amount} punktów dowolnego rodzaju.</p>
            <div className="movement-payment-options">
              {movementTypes
                .filter((type) => pendingPayment.available[type] > 0)
                .map((type) => (
                  <div
                    key={type}
                    className="movement-payment-option"
                    data-resource={type.toLowerCase()}
                  >
                    <span>
                      {movementLabels[type]}: {selectedPayment[type]} /{' '}
                      {pendingPayment.available[type]}
                    </span>
                    <div>
                      <button
                        type="button"
                        aria-label={`Odejmij punkt: ${movementLabels[type]}`}
                        disabled={selectedPayment[type] === 0}
                        onClick={() =>
                          setSelectedPayment((current) => ({
                            ...current,
                            [type]: current[type] - 1,
                          }))
                        }
                      >
                        −
                      </button>
                      <button
                        type="button"
                        aria-label={`Dodaj punkt: ${movementLabels[type]}`}
                        disabled={
                          selectedPayment[type] >=
                            pendingPayment.available[type] ||
                          movementTypes.reduce(
                            (sum, key) => sum + selectedPayment[key],
                            0,
                          ) >= pendingPayment.amount
                        }
                        onClick={() =>
                          setSelectedPayment((current) => ({
                            ...current,
                            [type]: current[type] + 1,
                          }))
                        }
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
            </div>
            <div className="movement-payment-actions">
              <button
                type="button"
                onClick={() => paymentDialogRef.current?.close()}
              >
                Anuluj
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={
                  movementTypes.reduce(
                    (sum, type) => sum + selectedPayment[type],
                    0,
                  ) !== pendingPayment.amount
                }
                onClick={() => {
                  paymentResolverRef.current?.(selectedPayment)
                  paymentResolverRef.current = null
                  paymentDialogRef.current?.close()
                }}
              >
                Wykonaj ruch
              </button>
            </div>
          </div>
        )}
      </dialog>
      <dialog
        ref={tileInfoDialogRef}
        className="tile-info-dialog"
        aria-labelledby="tile-info-title"
        onClose={() => {
          setInspectedHexId(undefined)
          setInspectedDragonId(undefined)
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            event.currentTarget.close()
          }
        }}
      >
        {inspectedTile && (
          <div className="tile-info-content">
            <header>
              <div>
                <small>
                  {inspectedDragon ? 'Informacje o smoku' : 'Informacje o polu'}
                </small>
                <h2 id="tile-info-title">
                  {inspectedDragon
                    ? 'Smok'
                    : terrainLabels[inspectedTile.terrain]}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Zamknij informacje o polu"
                onClick={() => tileInfoDialogRef.current?.close()}
              >
                ×
              </button>
            </header>
            {inspectedDragon ? (
              <div className="dragon-info-box">
                <strong>Smok blokuje okolicę</strong>
                <p>
                  Pole smoka i wszystkie pola sąsiednie są niedostępne dla
                  graczy. Pola oddalone o 2 hexy kosztują dodatkowe 2 dowolne
                  punkty ruchu.
                </p>
                <p>
                  W swojej turze możesz kliknąć smoka, a potem sąsiednie pole,
                  żeby przesunąć go za 6 dowolnych punktów ruchu. Smok rusza się
                  też losowo o 1–2 pola po kolejce wszystkich graczy.
                </p>
              </div>
            ) : (
              <p>{terrainRules[inspectedTile.terrain]}</p>
            )}
            <dl>
              <div>
                <dt>Koszt pola</dt>
                <dd>
                  {inspectedKnownBlocked
                    ? 'Wejście niemożliwe'
                    : inspectedCostHidden
                      ? 'Nieznany'
                      : inspectedTerrainCost === 'BLOCKED'
                        ? 'Wejście niemożliwe'
                        : movementUnitLabel(
                            inspectedTerrainCost === 'ANY'
                              ? 'WILD'
                              : inspectedTerrainCost,
                            Math.max(1, inspectedTile.difficulty),
                          )}
                </dd>
              </div>
              <div>
                <dt>Przejście z Twojego pola</dt>
                <dd>
                  {inspectedDistance === 0
                    ? 'Jesteś na tym polu'
                    : inspectedKnownBlocked
                      ? 'Przejście niedostępne'
                      : inspectedCostHidden
                        ? 'Koszt nieznany'
                        : inspectedRequirements.length > 0
                          ? formatRequirements(inspectedRequirements)
                          : inspectedDistance === 1
                            ? 'Przejście niedostępne'
                            : 'Sprawdź po zbliżeniu się do pola'}
                </dd>
              </div>
              {inspectedDragonDistance <= 2 && (
                <div>
                  <dt>Wpływ smoka</dt>
                  <dd>
                    {inspectedDragonDistance <= 1
                      ? 'Pole zablokowane przez smoka'
                      : '+2 dowolnego ruchu przy wejściu'}
                  </dd>
                </div>
              )}
              {inspectedDragon && (
                <div>
                  <dt>Sterowanie smokiem</dt>
                  <dd>6 dowolnych punktów ruchu, ruch na sąsiednie pole</dd>
                </div>
              )}
              {inspectedOccupants.length > 0 && (
                <div>
                  <dt>Gracze na polu</dt>
                  <dd>
                    {inspectedOccupants.map((player) => player.name).join(', ')}
                  </dd>
                </div>
              )}
            </dl>
            <div className="tile-info-status">
              <strong>
                {inspectedDragon
                  ? 'Jak działa smok?'
                  : 'Dlaczego nie można teraz wejść?'}
              </strong>
              <p>
                {inspectedDragon
                  ? 'Kliknięty smok jest wybrany. Czerwone pola wokół niego pokazują zablokowaną strefę, a pierścień dalej pokazuje dodatkowy koszt ruchu.'
                  : inspectedReason}
              </p>
            </div>
            <div className="tile-info-actions">
              <strong>Możliwe działania</strong>
              <ul>
                {(inspectedDragon
                  ? [
                      canControlDragon
                        ? 'Kliknij sąsiednie podświetlone pole, aby przesunąć smoka za 6 dowolnego ruchu.'
                        : 'Potrzebujesz łącznie 6 punktów ruchu, żeby poruszyć smokiem.',
                      'Smok nie może wejść na start, metę, góry, nieznane pola ani pola graczy.',
                    ]
                  : inspectedActions
                ).map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </dialog>
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
      <details className="terrain-rules">
        <summary>Zasady terenów</summary>
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
