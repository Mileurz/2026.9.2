export type WeatherKind = 'clear' | 'rain' | 'snow' | 'fog' | 'night' | 'aurora'

export const weatherOptions: { id: WeatherKind; label: string }[] = [
  { id: 'clear', label: 'Clear' },
  { id: 'rain', label: 'Rain' },
  { id: 'snow', label: 'Snow' },
  { id: 'fog', label: 'Fog' },
  { id: 'night', label: 'Night' },
  { id: 'aurora', label: 'Aurora' },
]

export function isNightSky(kind: WeatherKind) {
  return kind === 'night' || kind === 'aurora'
}

export function sceneAtmosphere(kind: WeatherKind) {
  if (isNightSky(kind)) {
    return {
      bg: '#070b16',
      fog: ['#0b1222', 11, 34] as [string, number, number],
      ambient: 0.16,
      hemiSky: '#9bb4e0',
      hemiGround: '#141c28',
      hemi: 0.2,
      sun: kind === 'aurora' ? 0.22 : 0.28,
      fill: 0.08,
    }
  }
  if (kind === 'fog') {
    return {
      bg: '#d0d3d6',
      fog: ['#c4c8cc', 1.4, 10] as [string, number, number],
      ambient: 0.78,
      hemiSky: '#ffffff',
      hemiGround: '#e8e8e8',
      hemi: 0.55,
      sun: 0.55,
      fill: 0.22,
    }
  }
  if (kind === 'snow') {
    return {
      bg: '#f3f6f8',
      fog: ['#e6ecf0', 9, 30] as [string, number, number],
      ambient: 0.62,
      hemiSky: '#ffffff',
      hemiGround: '#e8e8e8',
      hemi: 0.55,
      sun: 1.45,
      fill: 0.22,
    }
  }
  if (kind === 'rain') {
    return {
      bg: '#e4e8ea',
      fog: ['#cfd5d9', 11, 36] as [string, number, number],
      ambient: 0.62,
      hemiSky: '#ffffff',
      hemiGround: '#e8e8e8',
      hemi: 0.55,
      sun: 1.45,
      fill: 0.22,
    }
  }
  return {
    bg: '#ffffff',
    fog: ['#ffffff', 22, 54] as [string, number, number],
    ambient: 0.62,
    hemiSky: '#ffffff',
    hemiGround: '#e8e8e8',
    hemi: 0.55,
    sun: 1.45,
    fill: 0.22,
  }
}

export const COVER_SIZE = 64
const SNOW_MAX = 1.85
const WATER_MAX = 1.6

export type WeatherCover = {
  size: number
  snow: Float32Array
  water: Float32Array
}

export type HeightSample = (u: number, v: number) => number

export function createWeatherCover(size = COVER_SIZE): WeatherCover {
  return {
    size,
    snow: new Float32Array(size * size),
    water: new Float32Array(size * size),
  }
}

export function clearWeatherCover(cover: WeatherCover) {
  cover.snow.fill(0)
  cover.water.fill(0)
}

function sampleGrid(values: Float32Array, size: number, u: number, v: number) {
  const x = Math.min(1, Math.max(0, u)) * (size - 1)
  const y = Math.min(1, Math.max(0, v)) * (size - 1)
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(x0 + 1, size - 1)
  const y1 = Math.min(y0 + 1, size - 1)
  const tx = x - x0
  const ty = y - y0
  const h00 = values[y0 * size + x0]
  const h10 = values[y0 * size + x1]
  const h01 = values[y1 * size + x0]
  const h11 = values[y1 * size + x1]
  return h00 * (1 - tx) * (1 - ty) + h10 * tx * (1 - ty) + h01 * (1 - tx) * ty + h11 * tx * ty
}

export function sampleSnow(cover: WeatherCover, u: number, v: number) {
  return sampleGrid(cover.snow, cover.size, u, v)
}

export function sampleWater(cover: WeatherCover, u: number, v: number) {
  return sampleGrid(cover.water, cover.size, u, v)
}

function surfaceY(
  sampleH: HeightSample,
  cover: WeatherCover,
  i: number,
  heightScale: number,
) {
  const size = cover.size
  const x = i % size
  const y = (i - x) / size
  const u = size <= 1 ? 0 : x / (size - 1)
  const v = size <= 1 ? 0 : y / (size - 1)
  return sampleH(u, v) * heightScale + cover.snow[i] * 0.52 + cover.water[i] * 0.3
}

/** Add precipitation and keep it on the mesh; rain/snow pile up over time. */
export function stepWeather(
  cover: WeatherCover,
  sampleH: HeightSample,
  kind: WeatherKind,
  dt: number,
  speed: number,
  intensity: number,
  heightScale: number,
) {
  if (kind !== 'rain' && kind !== 'snow') return

  const size = cover.size
  const rate = dt * (0.07 + speed * 0.12) * intensity
  const { snow, water } = cover

  if (kind === 'snow') {
    for (let i = 0; i < snow.length; i += 1) {
      const x = i % size
      const y = (i - x) / size
      const u = size <= 1 ? 0 : x / (size - 1)
      const v = size <= 1 ? 0 : y / (size - 1)
      const n = sampleH(u, v)
      const land = n > 0 ? 1 : 0.12
      const high = n > 0.18 ? 1.35 : 1
      snow[i] = Math.min(SNOW_MAX, snow[i] + rate * 0.32 * land * high)
    }

    for (let y = 1; y < size - 1; y += 1) {
      for (let x = 1; x < size - 1; x += 1) {
        const i = y * size + x
        if (snow[i] < 0.02) continue
        let best = i
        let bestY = surfaceY(sampleH, cover, i, heightScale)
        const nbr = [i - 1, i + 1, i - size, i + size]
        for (const j of nbr) {
          const sy = surfaceY(sampleH, cover, j, heightScale)
          if (sy + 0.04 < bestY) {
            bestY = sy
            best = j
          }
        }
        if (best !== i) {
          const move = snow[i] * 0.04
          snow[i] -= move
          snow[best] = Math.min(SNOW_MAX, snow[best] + move)
        }
      }
    }
    return
  }

  for (let i = 0; i < water.length; i += 1) {
    water[i] = Math.min(WATER_MAX, water[i] + rate * 0.28)
  }

  for (let pass = 0; pass < 2; pass += 1) {
    for (let y = 1; y < size - 1; y += 1) {
      for (let x = 1; x < size - 1; x += 1) {
        const i = y * size + x
        if (water[i] < 0.008) continue
        let best = i
        let bestY = surfaceY(sampleH, cover, i, heightScale)
        const nbr = [i - 1, i + 1, i - size, i + size]
        for (const j of nbr) {
          const sy = surfaceY(sampleH, cover, j, heightScale)
          if (sy < bestY) {
            bestY = sy
            best = j
          }
        }
        if (best !== i) {
          const drop = surfaceY(sampleH, cover, i, heightScale) - bestY
          const move = Math.min(water[i] * 0.22, 0.04 + drop * 0.08)
          water[i] -= move
          water[best] = Math.min(WATER_MAX, water[best] + move)
        }
      }
    }
  }
}

export function tintWithCover(
  base: [number, number, number],
  snow: number,
  water: number,
): [number, number, number] {
  let r = base[0]
  let g = base[1]
  let b = base[2]
  if (water > 0.04) {
    const t = Math.min(1, water / 0.85)
    r = Math.round(r + (62 - r) * t)
    g = Math.round(g + (186 - g) * t)
    b = Math.round(b + (232 - b) * t)
  }
  if (snow > 0.04) {
    const t = Math.min(1, snow / 0.7)
    r = Math.round(r + (244 - r) * t)
    g = Math.round(g + (248 - g) * t)
    b = Math.round(b + (252 - b) * t)
  }
  return [r, g, b]
}

/** Ease seasonal snow on and off without swapping a weather preset. */
export function stepSeasonCover(
  cover: WeatherCover,
  sampleH: HeightSample,
  snowNeed: number,
  dt: number,
) {
  const size = cover.size
  const k = 1 - Math.exp(-0.22 * Math.max(0, dt))
  const { snow } = cover
  for (let i = 0; i < snow.length; i += 1) {
    const x = i % size
    const y = (i - x) / size
    const u = size <= 1 ? 0 : x / (size - 1)
    const v = size <= 1 ? 0 : y / (size - 1)
    const n = sampleH(u, v)
    const land = n > 0.012 ? 1 : 0.08
    const high = n > 0.16 ? 1.25 : 1
    const target = Math.max(0, snowNeed) * 0.72 * land * high
    snow[i] += (target - snow[i]) * k
    if (snow[i] < 0.004) snow[i] = 0
  }
}

export function shoreFoam(sampleH: HeightSample, samplePond: HeightSample, u: number, v: number) {
  const n = sampleH(u, v)
  const pond = samplePond(u, v)
  const wet = (h: number, p: number) => h <= 0.012 || p > 0.055
  const du = 0.002
  let land = false
  let water = false
  const dirs: [number, number][] = [
    [du, 0],
    [-du, 0],
    [0, du],
    [0, -du],
    [du, du],
    [-du, -du],
  ]
  for (const [ou, ov] of dirs) {
    const hn = sampleH(u + ou, v + ov)
    const pn = samplePond(u + ou, v + ov)
    if (wet(hn, pn)) water = true
    else land = true
  }
  const band = 0.004
  let foam = 0
  if (land && water) foam = Math.max(0, 1 - Math.abs(n) / band)
  if (n <= 0.0015 && n >= -band) foam = Math.max(foam, 1 - Math.abs(n) / band)
  if (pond > 0.04 && pond < 0.052) foam = Math.max(foam, 0.4)
  return Math.min(1, foam)
}
