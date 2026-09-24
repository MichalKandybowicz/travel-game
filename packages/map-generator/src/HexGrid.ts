import type { HexTile } from '../../shared/src/index.js'

export const HEX_DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
]

export const hexKey = (q: number, r: number): string => `${q},${r}`

export const axialDistance = (
  source: { q: number; r: number },
  target: { q: number; r: number },
): number => {
  const dq = source.q - target.q
  const dr = source.r - target.r
  const ds = -(source.q + source.r) - -(target.q + target.r)
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds))
}

export const createHexGrid = (radius: number): HexTile[] => {
  const tiles: HexTile[] = []
  for (let q = -radius; q <= radius; q += 1) {
    const rMin = Math.max(-radius, -q - radius)
    const rMax = Math.min(radius, -q + radius)
    for (let r = rMin; r <= rMax; r += 1) {
      tiles.push({
        id: `hex_${q}_${r}`,
        q,
        r,
        terrain: 'RUBBLE',
        difficulty: 1,
        isBlocked: false,
      })
    }
  }
  return tiles
}

export const getNeighborCoordinates = (
  q: number,
  r: number,
): Array<{ q: number; r: number }> =>
  HEX_DIRECTIONS.map(([dq, dr]) => ({ q: q + dq, r: r + dr }))

export const getNeighbors = (tiles: HexTile[], tile: HexTile): HexTile[] => {
  const byKey = new Map(tiles.map((entry) => [hexKey(entry.q, entry.r), entry]))
  return getNeighborCoordinates(tile.q, tile.r)
    .map((coordinate) => byKey.get(hexKey(coordinate.q, coordinate.r)))
    .filter((candidate): candidate is HexTile => Boolean(candidate))
}
