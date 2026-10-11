import type { MapShape } from './types.js'

export const MAP_SHAPES = ['RANDOM', 'LINE', 'C', 'L', 'S'] as const

const minimumPetals: Record<MapShape, number> = {
  RANDOM: 3,
  LINE: 3,
  C: 4,
  L: 3,
  S: 6,
}

export const getMinimumPetalCount = (shape: MapShape = 'RANDOM'): number =>
  minimumPetals[shape]
