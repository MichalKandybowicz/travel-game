import type { MapSettings } from '../../../packages/shared/src/index.js'

export const normalizeLobbyFogSettings = (
  settings: MapSettings,
): MapSettings => {
  if (settings.fogMode === 'FULL') {
    return {
      ...settings,
      fogMode: 'RANGE',
      terrainVisibilityRange: 2,
      costVisibilityRange: 1,
    }
  }
  if (settings.fogMode === 'MEDIUM') {
    return {
      ...settings,
      fogMode: 'RANGE',
      terrainVisibilityRange: 4,
      costVisibilityRange: 2,
    }
  }
  if (settings.fogMode === 'PETAL') {
    return {
      ...settings,
      fogMode: 'RANGE',
      terrainVisibilityRange: settings.terrainVisibilityRange ?? 4,
      costVisibilityRange: settings.costVisibilityRange ?? 2,
    }
  }
  return settings
}
