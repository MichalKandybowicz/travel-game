import type { MapShape } from '../../shared/src/index.js'
import { HEX_DIRECTIONS } from './HexGrid.js'

const alternating = (length: number, first: number, second: number): number[] =>
  Array.from({ length }, (_, index) => (index % 2 === 0 ? first : second))

export const createShapedPetals = (
  shape: Exclude<MapShape, 'RANDOM'>,
  count: number,
): Array<{ u: number; v: number }> => {
  const steps = count - 1
  let directions: number[]
  switch (shape) {
    case 'LINE':
      directions = Array<number>(steps).fill(0)
      break
    case 'L': {
      const vertical = Math.floor(steps / 2)
      directions = [
        ...Array<number>(vertical).fill(4),
        ...alternating(steps - vertical, 5, 0),
      ]
      break
    }
    case 'C': {
      const arm = Math.floor(steps / 3)
      // The top arm must end in direction 3 to turn down without touching itself.
      directions = [
        ...alternating(arm, arm % 2 === 0 ? 2 : 3, arm % 2 === 0 ? 3 : 2),
        ...Array<number>(steps - 2 * arm).fill(4),
        ...alternating(arm, 5, 0),
      ]
      break
    }
    case 'S': {
      let middle = Math.max(1, Math.floor(steps / 3))
      if (middle % 2 === 0) middle -= 1
      const spine = middle > 1 ? 2 : 1
      const top = Math.floor((steps - middle - 2 * spine) / 2)
      const bottom = steps - middle - 2 * spine - top
      directions = [
        ...alternating(top, top % 2 === 0 ? 2 : 3, top % 2 === 0 ? 3 : 2),
        ...Array<number>(spine).fill(4),
        ...alternating(middle, 5, 0),
        ...Array<number>(spine).fill(4),
        ...alternating(bottom, 3, 2),
      ]
      break
    }
  }
  const petals = [{ u: 0, v: 0 }]
  for (const direction of directions) {
    const [du, dv] = HEX_DIRECTIONS[direction]!
    const previous = petals.at(-1)!
    petals.push({ u: previous.u + du, v: previous.v + dv })
  }
  return petals
}
