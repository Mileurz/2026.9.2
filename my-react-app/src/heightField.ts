import { fbm2, noiseToColor, type NoiseParams } from './perlin'
import { sampleSnow, sampleWater, shoreFoam, tintWithCover, type WeatherCover } from './weather'

export type HeightField = {
  width: number
  height: number
  values: Float32Array
}

let cacheKey = ''
let cached: HeightField | null = null

export function createHeightField(resolution: number): HeightField {
  return {
    width: resolution,
    height: resolution,
    values: new Float32Array(resolution * resolution),
  }
}

/** Fill a height field from the noise stack (fBm + shaping). Values stay in [-1, 1]. */
export function fillHeightField(
  field: HeightField,
  params: NoiseParams,
  offsetX = 0,
  offsetY = 0,
) {
  const { width, height, values } = field
  const denomX = Math.max(1, width - 1)
  const denomY = Math.max(1, height - 1)

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      values[y * width + x] = fbm2(x / denomX, y / denomY, params, offsetX, offsetY)
    }
  }
}

function fieldKey(params: NoiseParams, offsetX: number, offsetY: number) {
  return [
    params.sampleSize,
    params.octaves,
    params.persistence,
    params.lacunarity,
    params.frequency,
    params.shape,
    params.shapeAmount,
    params.seaLevel,
    params.mountains,
    offsetX,
    offsetY,
  ].join('|')
}

/** Rebuild only when the noise stack or offset actually changed. */
export function getHeightField(
  params: NoiseParams,
  offsetX = 0,
  offsetY = 0,
): HeightField {
  const key = fieldKey(params, offsetX, offsetY)
  if (cached && cacheKey === key) return cached

  if (!cached || cached.width !== params.sampleSize) {
    cached = createHeightField(params.sampleSize)
  }

  fillHeightField(cached, params, offsetX, offsetY)
  cacheKey = key
  return cached
}

export function sampleHeightField(field: HeightField, u: number, v: number) {
  const x = Math.min(1, Math.max(0, u)) * (field.width - 1)
  const y = Math.min(1, Math.max(0, v)) * (field.height - 1)
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(x0 + 1, field.width - 1)
  const y1 = Math.min(y0 + 1, field.height - 1)
  const tx = x - x0
  const ty = y - y0

  const i = field.width
  const h00 = field.values[y0 * i + x0]
  const h10 = field.values[y0 * i + x1]
  const h01 = field.values[y1 * i + x0]
  const h11 = field.values[y1 * i + x1]

  return h00 * (1 - tx) * (1 - ty) + h10 * tx * (1 - ty) + h01 * (1 - tx) * ty + h11 * tx * ty
}

export function paintHeightField(
  ctx: CanvasRenderingContext2D,
  field: HeightField,
  cover?: WeatherCover | null,
) {
  const { width, height, values } = field
  const image = ctx.createImageData(width, height)
  const { data } = image

  for (let i = 0; i < values.length; i += 1) {
    const x = i % width
    const y = (i - x) / width
    const u = width <= 1 ? 0 : x / (width - 1)
    const v = height <= 1 ? 0 : y / (height - 1)
    let rgb = noiseToColor(values[i])
    if (cover) rgb = tintWithCover(rgb, sampleSnow(cover, u, v), sampleWater(cover, u, v))
    const foam = shoreFoam(
      (su, sv) => sampleHeightField(field, su, sv),
      (su, sv) => (cover ? sampleWater(cover, su, sv) : 0),
      u,
      v,
    )
    if (foam > 0.05) {
      rgb = [
        Math.round(rgb[0] + (255 - rgb[0]) * foam),
        Math.round(rgb[1] + (255 - rgb[1]) * foam),
        Math.round(rgb[2] + (255 - rgb[2]) * foam),
      ]
    }
    const p = i * 4
    data[p] = rgb[0]
    data[p + 1] = rgb[1]
    data[p + 2] = rgb[2]
    data[p + 3] = 255
  }

  ctx.putImageData(image, 0, 0)
}
