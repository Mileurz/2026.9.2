/** Uniform UV grid for nearby tree / branch queries. */

export const GRID_CELLS = 10

export function cellOf(u: number, v: number, cells = GRID_CELLS) {
  const x = Math.min(cells - 1, Math.max(0, Math.floor(u * cells)))
  const y = Math.min(cells - 1, Math.max(0, Math.floor(v * cells)))
  return y * cells + x
}

export function emptyBuckets<T>(cells = GRID_CELLS): T[][] {
  return Array.from({ length: cells * cells }, () => [])
}

export function queryCells(
  u: number,
  v: number,
  radius: number,
  visit: (index: number) => void,
  cells = GRID_CELLS,
) {
  const reach = Math.max(1, Math.ceil(radius * cells))
  const cx = Math.min(cells - 1, Math.max(0, Math.floor(u * cells)))
  const cy = Math.min(cells - 1, Math.max(0, Math.floor(v * cells)))
  for (let y = cy - reach; y <= cy + reach; y += 1) {
    if (y < 0 || y >= cells) continue
    for (let x = cx - reach; x <= cx + reach; x += 1) {
      if (x < 0 || x >= cells) continue
      visit(y * cells + x)
    }
  }
}
