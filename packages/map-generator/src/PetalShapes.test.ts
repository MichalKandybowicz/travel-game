import { describe, expect, it } from 'vitest'
import { getMinimumPetalCount } from '../../shared/src/index.js'
import { axialDistance } from './HexGrid.js'
import { createShapedPetals } from './PetalShapes.js'

describe('petal shapes', () => {
  it.each(['LINE', 'C', 'L', 'S'] as const)(
    'keeps %s connected without loops or shortcut contacts at every supported size',
    (shape) => {
      for (let count = getMinimumPetalCount(shape); count <= 12; count += 1) {
        const petals = createShapedPetals(shape, count)
        expect(petals).toHaveLength(count)
        for (let left = 0; left < petals.length; left += 1) {
          for (let right = left + 1; right < petals.length; right += 1) {
            const a = petals[left]!
            const b = petals[right]!
            const distance = axialDistance(
              { q: a.u, r: a.v },
              { q: b.u, r: b.v },
            )
            if (right === left + 1) expect(distance).toBe(1)
            else expect(distance).toBeGreaterThan(1)
          }
        }
      }
    },
  )

  it('makes a straight line with equal direction and spacing', () => {
    const petals = createShapedPetals('LINE', 12)
    const firstStep = {
      u: petals[1]!.u - petals[0]!.u,
      v: petals[1]!.v - petals[0]!.v,
    }
    for (let index = 1; index < petals.length; index += 1) {
      expect({
        u: petals[index]!.u - petals[index - 1]!.u,
        v: petals[index]!.v - petals[index - 1]!.v,
      }).toEqual(firstStep)
    }
  })

  it('opens C to the right with both endpoints beyond its spine', () => {
    const petals = createShapedPetals('C', 12)
    const xs = petals.map((petal) => petal.u + petal.v)
    expect(xs[0]).toBeGreaterThan(Math.min(...xs))
    expect(xs.at(-1)).toBeGreaterThan(Math.min(...xs))
    expect(xs.at(-1)).toBe(xs[0])
  })
})
