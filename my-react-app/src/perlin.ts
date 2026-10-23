const PERM_SIZE = 256

function fade(t: number) {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function lerp(a: number, b: number, t: number) {
  return a + t * (b - a)
}

function grad(hash: number, x: number, y: number) {
  switch (hash & 3) {
    case 0:
      return x + y
    case 1:
      return -x + y
    case 2:
      return x - y
    default:
      return -x - y
  }
}

function buildPermutation(seed: number) {
  const p = new Uint8Array(PERM_SIZE)
  for (let i = 0; i < PERM_SIZE; i += 1) p[i] = i

  let value = seed >>> 0
  for (let i = PERM_SIZE - 1; i > 0; i -= 1) {
    value = (value * 1664525 + 1013904223) >>> 0
    const j = value % (i + 1)
    const swap = p[i]
    p[i] = p[j]
    p[j] = swap
  }

  const perm = new Uint8Array(PERM_SIZE * 2)
  for (let i = 0; i < PERM_SIZE * 2; i += 1) perm[i] = p[i & 255]
  return perm
}

const perm = buildPermutation(20260902)

/** 2D Perlin noise in roughly [-1, 1]. */
export function perlin2(x: number, y: number) {
  const xi = Math.floor(x) & 255
  const yi = Math.floor(y) & 255
  const xf = x - Math.floor(x)
  const yf = y - Math.floor(y)
  const u = fade(xf)
  const v = fade(yf)

  const aa = perm[perm[xi] + yi]
  const ab = perm[perm[xi] + yi + 1]
  const ba = perm[perm[xi + 1] + yi]
  const bb = perm[perm[xi + 1] + yi + 1]

  const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u)
  const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u)
  return lerp(x1, x2, v)
}

export type ShapeOp =
  | 'none'
  | 'power'
  | 'ridged'
  | 'billow'
  | 'terrace'
  | 'gain'
  | 'bias'
  | 'invert'

export type ShapeOption = {
  id: ShapeOp
  label: string
  sliderLabel: string
  min: number
  max: number
  step: number
  defaultAmount: number
  format: (value: number) => string
}

export const shapeOptions: ShapeOption[] = [
  {
    id: 'none',
    label: 'None',
    sliderLabel: 'Mix',
    min: 0,
    max: 1,
    step: 0.01,
    defaultAmount: 1,
    format: (value) => value.toFixed(2),
  },
  {
    id: 'power',
    label: 'Power',
    sliderLabel: 'Exponent',
    min: 0.2,
    max: 4,
    step: 0.05,
    defaultAmount: 2,
    format: (value) => value.toFixed(2),
  },
  {
    id: 'ridged',
    label: 'Ridged',
    sliderLabel: 'Sharpness',
    min: 0.4,
    max: 4,
    step: 0.05,
    defaultAmount: 1.8,
    format: (value) => value.toFixed(2),
  },
  {
    id: 'billow',
    label: 'Billow',
    sliderLabel: 'Roundness',
    min: 0.4,
    max: 4,
    step: 0.05,
    defaultAmount: 1.4,
    format: (value) => value.toFixed(2),
  },
  {
    id: 'terrace',
    label: 'Terrace',
    sliderLabel: 'Steps',
    min: 2,
    max: 30,
    step: 1,
    defaultAmount: 5,
    format: (value) => String(Math.round(value)),
  },
  {
    id: 'gain',
    label: 'Gain',
    sliderLabel: 'Contrast',
    min: 0.15,
    max: 0.85,
    step: 0.01,
    defaultAmount: 0.35,
    format: (value) => value.toFixed(2),
  },
  {
    id: 'bias',
    label: 'Bias',
    sliderLabel: 'Shift',
    min: 0.15,
    max: 0.85,
    step: 0.01,
    defaultAmount: 0.45,
    format: (value) => value.toFixed(2),
  },
  {
    id: 'invert',
    label: 'Invert',
    sliderLabel: 'Mix',
    min: 0,
    max: 1,
    step: 0.01,
    defaultAmount: 1,
    format: (value) => value.toFixed(2),
  },
]

export function getShapeOption(id: ShapeOp) {
  return shapeOptions.find((option) => option.id === id) ?? shapeOptions[0]
}

export type NoiseParams = {
  octaves: number
  persistence: number
  lacunarity: number
  frequency: number
  sampleSize: number
  worldSize: number
  height: number
  planeSegments: number
  shape: ShapeOp
  shapeAmount: number
  seaLevel: number
  mountains: number
}

export function completeParams(params: Partial<NoiseParams> | null | undefined): NoiseParams {
  if (!params || params.seaLevel == null || params.mountains == null) {
    return { ...defaultNoiseParams, ...params }
  }
  return { ...defaultNoiseParams, ...params }
}

export const defaultNoiseParams: NoiseParams = {
  octaves: 5,
  persistence: 0.48,
  lacunarity: 2.05,
  frequency: 1.55,
  sampleSize: 256,
  worldSize: 7.2,
  height: 1.05,
  planeSegments: 120,
  shape: 'none',
  shapeAmount: 1,
  seaLevel: 0.08,
  mountains: 0.36,
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function biasCurve(t: number, b: number) {
  const k = Math.min(0.99, Math.max(0.01, b))
  return t / ((1 / k - 2) * (1 - t) + 1)
}

function gainCurve(t: number, g: number) {
  if (t < 0.5) return biasCurve(t * 2, g) / 2
  return 1 - biasCurve(2 - t * 2, g) / 2
}

function lerpValue(a: number, b: number, t: number) {
  return a + (b - a) * t
}

/** Remap fBm from [-1, 1] with a shaping operator. */
export function shapeNoise(value: number, shape: ShapeOp, amount: number) {
  const t = clamp01(value * 0.5 + 0.5)

  switch (shape) {
    case 'power':
      return Math.sign(value) * Math.pow(Math.abs(value), amount)
    case 'ridged':
      return Math.pow(1 - Math.abs(value), amount) * 2 - 1
    case 'billow':
      return Math.pow(Math.abs(value), amount) * 2 - 1
    case 'terrace': {
      const steps = Math.max(2, Math.min(30, Math.round(amount)))
      const q = Math.round(t * (steps - 1)) / (steps - 1)
      return q * 2 - 1
    }
    case 'gain':
      return gainCurve(t, amount) * 2 - 1
    case 'bias':
      return biasCurve(t, amount) * 2 - 1
    case 'invert':
      return lerpValue(value, -value, amount)
    default:
      return value
  }
}

function fbmRaw(
  x: number,
  y: number,
  octaves: number,
  frequency: number,
  persistence: number,
  lacunarity: number,
) {
  let amplitude = 1
  let freq = frequency
  let sum = 0
  let max = 0

  for (let i = 0; i < octaves; i += 1) {
    // a^i · perlin(l^i f x, l^i f y)
    sum += amplitude * perlin2(x * freq, y * freq)
    max += amplitude
    amplitude *= persistence
    freq *= lacunarity
  }

  return max === 0 ? 0 : sum / max
}

/** Sample the noise stack in terrain UV space [0, 1]. */
export function fbmOnWorld(
  x: number,
  z: number,
  params: NoiseParams,
  offsetX = 0,
  offsetY = 0,
) {
  const u = x / params.worldSize + 0.5
  const v = z / params.worldSize + 0.5
  return fbm2(u, v, params, offsetX, offsetY)
}

/**
 * Land height from classic Perlin fBm, matching the height-field equation:
 * n = Σ a^i · perlin(l^i f x, l^i f y)
 * then H = sea(n) + plains(n^k) + ridged(1 − |n|)
 * Shape operators remap H last.
 */
export function fbm2(
  x: number,
  y: number,
  params: NoiseParams,
  offsetX = 0,
  offsetY = 0,
) {
  const { octaves, persistence, lacunarity, frequency } = params
  const seaLevel = params.seaLevel ?? 0.1
  const mountains = params.mountains ?? 0.92
  const px = x + offsetX
  const py = y + offsetY

  const n = fbmRaw(px, py, octaves, frequency, persistence, lacunarity)

  const aboveSea = n - seaLevel
  if (aboveSea < 0) {
    return shapeNoise(Math.max(-1, aboveSea * 0.55), params.shape, params.shapeAmount)
  }

  const plains = Math.pow(aboveSea, 1.65) * 0.48
  const ridged = Math.pow(1 - Math.abs(n), 1.45) * mountains * Math.pow(aboveSea, 0.7)
  const height = plains + ridged
  return shapeNoise(Math.max(0, Math.min(1, height)), params.shape, params.shapeAmount)
}

function mixRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  const k = clamp01(t)
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ]
}

export function noiseToColor(value: number): [number, number, number] {
  const h = Math.max(-1, Math.min(1, value))
  if (h <= 0) return mixRgb([118, 214, 238], [32, 164, 214], clamp01(-h / 0.4))
  if (h < 0.03) return mixRgb([214, 198, 142], [186, 172, 108], h / 0.03)
  if (h < 0.16) return mixRgb([110, 154, 72], [58, 112, 54], (h - 0.03) / 0.13)
  if (h < 0.34) return mixRgb([58, 112, 54], [108, 98, 72], (h - 0.16) / 0.18)
  if (h < 0.55) return mixRgb([108, 98, 72], [140, 136, 130], (h - 0.34) / 0.21)
  return mixRgb([140, 136, 130], [240, 244, 248], (h - 0.55) / 0.45)
}

export function fillNoiseImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  params: NoiseParams,
  offsetX = 0,
  offsetY = 0,
) {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = width <= 1 ? 0 : x / (width - 1)
      const v = height <= 1 ? 0 : y / (height - 1)
      const n = fbm2(u, v, params, offsetX, offsetY)
      const [r, g, b] = noiseToColor(n)
      const i = (y * width + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }
}
