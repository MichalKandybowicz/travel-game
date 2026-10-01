import type { GameMap, MapSettings } from './types.js'

export const getMaximumPlayers = (
  settings: MapSettings,
  customMap?: GameMap,
): number => {
  if (customMap) return customMap.startHexIds?.length ?? 1
  if (settings.segmentEdgeLength) return settings.segmentEdgeLength
  return { SMALL: 4, MEDIUM: 5, LARGE: 6 }[settings.mapSize]
}
