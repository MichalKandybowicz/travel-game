export class SeededRandom {
  private state: number

  constructor(seed: string) {
    this.state = SeededRandom.hash(seed)
  }

  private static hash(seed: string): number {
    let hash = 2166136261
    for (const char of seed) {
      hash ^= char.charCodeAt(0)
      hash = Math.imul(hash, 16777619)
    }
    return hash >>> 0
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min
  }

  pick<T>(items: T[]): T {
    return items[this.int(0, items.length - 1)]!
  }

  shuffle<T>(items: T[]): T[] {
    const copy = [...items]
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = this.int(0, index)
      ;[copy[index], copy[swapIndex]] = [copy[swapIndex]!, copy[index]!]
    }
    return copy
  }
}
