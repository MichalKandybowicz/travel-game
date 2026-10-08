import { describe, expect, it, vi } from 'vitest'
import { SeededRandom } from '../../map-generator/src/index.js'
import { pickCheapestMarketCard } from './MarketSelection.js'

describe('cheapest market card selection', () => {
  const candidates = ['ranger', 'adventurer', 'herbalist', 'scout']

  it('guarantees the first cheapest offer even with a high random roll', () => {
    const random = new SeededRandom('guaranteed-cheapest')
    vi.spyOn(random, 'next').mockReturnValue(0.999)
    expect(pickCheapestMarketCard(random, candidates, 0)).toBe('adventurer')
  })

  it.each([
    [1, 0.7],
    [2, 0.4],
    [3, 0.2],
  ])('uses the threshold after %i cheapest offers', (count, chance) => {
    const random = new SeededRandom('cheapest-threshold')
    const next = vi.spyOn(random, 'next')
    next.mockReturnValue(chance - 0.000001)
    expect(pickCheapestMarketCard(random, candidates, count)).toBe('adventurer')
    next.mockReturnValue(chance)
    expect(pickCheapestMarketCard(random, candidates, count)).toBeUndefined()
  })

  it('uses the next cheapest card when a cheaper card is unavailable', () => {
    const random = new SeededRandom('remaining-cheapest')
    expect(
      pickCheapestMarketCard(random, ['ranger', 'scout', 'herbalist'], 0),
    ).toBe('herbalist')
    expect(pickCheapestMarketCard(random, [], 0)).toBeUndefined()
  })

  it('selects between equally cheap cards', () => {
    const random = new SeededRandom('tied-cheapest')
    const next = vi.spyOn(random, 'next')
    next.mockReturnValue(0)
    expect(
      pickCheapestMarketCard(
        random,
        ['herbalist', 'seasoned_sailor', 'ranger'],
        0,
      ),
    ).toBe('herbalist')
    next.mockReturnValue(0.999)
    expect(
      pickCheapestMarketCard(
        random,
        ['herbalist', 'seasoned_sailor', 'ranger'],
        0,
      ),
    ).toBe('seasoned_sailor')
  })
})
