import { describe, expect, it } from 'vitest'
import type { MapSettings } from '../../../packages/shared/src/index.js'
import { normalizeLobbyFogSettings } from './fogSettings.js'

describe('lobby fog settings', () => {
  it('converts saved presets to custom ranges', () => {
    const settings = { fogMode: 'FULL' } as MapSettings
    expect(normalizeLobbyFogSettings(settings)).toMatchObject({
      fogMode: 'RANGE',
      terrainVisibilityRange: 2,
      costVisibilityRange: 1,
    })
    expect(
      normalizeLobbyFogSettings({ ...settings, fogMode: 'MEDIUM' }),
    ).toMatchObject({
      fogMode: 'RANGE',
      terrainVisibilityRange: 4,
      costVisibilityRange: 2,
    })
  })

  it('keeps custom ranges and disabled fog', () => {
    const settings = {
      fogMode: 'RANGE',
      terrainVisibilityRange: 6,
      costVisibilityRange: 4,
    } as MapSettings
    expect(normalizeLobbyFogSettings(settings)).toEqual(settings)
    expect(
      normalizeLobbyFogSettings({ ...settings, fogMode: 'NONE' }).fogMode,
    ).toBe('NONE')
  })
})
