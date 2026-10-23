/** Height-based river / pond hydrology, independent of Three.js objects. */

import { sampleHeightField, type HeightField } from '../heightField'
import type { NoiseParams } from '../perlin'

export const BASE_WATER = 0.02
/** Keep the water surface just below the uncarved bank so it never sits on land. */
const BANK_FREEBOARD = 0.008

export type HydroState = {
  damHeight: number
  damU: number
  damV: number
  effectiveness: number
  upstreamLevel: number
  downstreamLevel: number
  pondReach: number
  pondSpread: number
  pondArea: number
  floodedArea: number
  flow: number
}

export function emptyHydro(): HydroState {
  return {
    damHeight: 0,
    damU: 0.5,
    damV: 0.5,
    effectiveness: 0,
    upstreamLevel: BASE_WATER,
    downstreamLevel: BASE_WATER,
    pondReach: 0.05,
    pondSpread: 0.02,
    pondArea: 0,
    floodedArea: 0,
    flow: 1,
  }
}

export const defaultHydro: HydroState = emptyHydro()

function clamp(value: number, a: number, b: number) {
  return Math.min(b, Math.max(a, value))
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

const WAY_SAMPLES = 56
let landCenters: Float32Array | null = null
let landWayKey = ''
let landWayVersion = 0
let landFlowSign = 1

export function riverWayVersion() {
  return landWayVersion
}

function fallbackRiverCenter(u: number) {
  return 0.5 + 0.09 * Math.sin(u * Math.PI * 2.35) + 0.028 * Math.sin(u * 15.7 + 0.6)
}

/** Trace a channel through the Perlin height field so the waterway follows the land. */
export function updateRiverFromLand(
  field: HeightField,
  params: Pick<NoiseParams, 'seaLevel'>,
) {
  let finger = 0
  const step = Math.max(1, (field.values.length / 64) | 0)
  for (let i = 0; i < field.values.length; i += step) finger += field.values[i]
  const key = `${field.width}|${params.seaLevel}|${finger.toFixed(5)}`
  if (landWayKey === key && landCenters) return
  landWayKey = key
  landWayVersion += 1

  const centers = new Float32Array(WAY_SAMPLES)
  const sea = params.seaLevel ?? 0.1
  let prev = 0.5
  for (let i = 0; i < WAY_SAMPLES; i += 1) {
    const u = WAY_SAMPLES <= 1 ? 0.5 : i / (WAY_SAMPLES - 1)
    let bestV = prev
    let best = Number.POSITIVE_INFINITY
    for (let k = 0; k < 40; k += 1) {
      const v = 0.1 + (k / 39) * 0.8
      const n = sampleHeightField(field, u, v)
      const keep = Math.abs(v - prev) * 0.28
      const wetBonus = n < sea ? -0.4 : 0
      const cost = n + keep + wetBonus
      if (cost < best) {
        best = cost
        bestV = v
      }
    }
    prev = prev * 0.42 + bestV * 0.58
    centers[i] = Math.min(0.9, Math.max(0.1, prev))
  }
  landCenters = centers
  const i0 = Math.round(0.18 * (WAY_SAMPLES - 1))
  const i1 = Math.round(0.82 * (WAY_SAMPLES - 1))
  const n0 = sampleHeightField(field, i0 / (WAY_SAMPLES - 1), centers[i0])
  const n1 = sampleHeightField(field, i1 / (WAY_SAMPLES - 1), centers[i1])
  landFlowSign = n1 < n0 ? 1 : -1
}

export function riverCenter(u: number) {
  if (!landCenters) return fallbackRiverCenter(u)
  const t = Math.min(1, Math.max(0, u)) * (landCenters.length - 1)
  const i = Math.floor(t)
  const f = t - i
  const j = Math.min(i + 1, landCenters.length - 1)
  return landCenters[i] * (1 - f) + landCenters[j] * f
}

export function riverDistance(u: number, v: number) {
  return Math.abs(v - riverCenter(u))
}

export function riverHalfWidth(seaLevel = 0.1) {
  return 0.032 + Math.min(0.4, Math.max(0, seaLevel)) * 0.16
}

export function riverMask(u: number, v: number, seaLevel = 0.1) {
  const w = riverHalfWidth(seaLevel)
  return 1 - smoothstep(w * 0.4, w, riverDistance(u, v))
}

export function floodplainMask(u: number, v: number, seaLevel = 0.1) {
  const w = riverHalfWidth(seaLevel)
  return 1 - smoothstep(w, w + 0.082, riverDistance(u, v))
}

/** Open belt beside the channel, reserved for future dam, pond, and lodge. */
export function corridorMask(u: number, v: number, seaLevel = 0.1) {
  const w = riverHalfWidth(seaLevel)
  return 1 - smoothstep(w, w + 0.16, riverDistance(u, v))
}

/** +1 if water flows toward increasing u, -1 toward decreasing u. */
export function riverDownstreamSign() {
  return landFlowSign
}

export function baseWaterLevelN() {
  return BASE_WATER
}

export function waterLevelN(hydro: HydroState = defaultHydro) {
  if (hydro.upstreamLevel === undefined) return BASE_WATER + (hydro.damHeight ?? 0) * 0.085
  return hydro.upstreamLevel
}

export function streamAlong(u: number, hydro: HydroState = defaultHydro) {
  return (u - (hydro.damU ?? 0.5)) * landFlowSign
}

export function localWaterN(u: number, v: number, hydro: HydroState = defaultHydro, _seaLevel = 0.1) {
  void v
  const along = streamAlong(u, hydro)
  const reach = Math.max(0.04, hydro.pondReach ?? 0.05)
  const up = hydro.upstreamLevel ?? BASE_WATER
  const down = hydro.downstreamLevel ?? BASE_WATER
  const tDown = smoothstep(-0.01, 0.022, along)
  const tFar = smoothstep(reach * 0.12, reach, -along)
  const upstream = up + (BASE_WATER - up) * tFar
  return upstream + (down - upstream) * tDown
}

/** Lowest uncarved bank beside the channel — pond water must stay below this. */
export function bankCrestN(u: number, field: HeightField, seaLevel = 0.1) {
  const c = riverCenter(u)
  const hw = riverHalfWidth(seaLevel)
  let crest = 1
  for (const s of [hw * 1.08, hw * 1.28, hw * 1.55]) {
    crest = Math.min(
      crest,
      sampleHeightField(field, u, clamp(c - s, 0, 1)),
      sampleHeightField(field, u, clamp(c + s, 0, 1)),
    )
  }
  return crest
}

/**
 * Water height in normalized units. Fills the carved channel, but never the
 * land surface: dry ground and banks stay above the water mesh.
 */
export function cappedWaterN(
  nCarved: number,
  rawLand: number,
  u: number,
  v: number,
  hydro: HydroState = defaultHydro,
  seaLevel = 0.1,
) {
  const fill = riverMask(u, v, seaLevel)
  const ceiling = nCarved + Math.max(0, rawLand - nCarved) * fill - BANK_FREEBOARD
  return Math.min(localWaterN(u, v, hydro, seaLevel), ceiling)
}

/** World Y for the water mesh: a level plane, never above the uncarved bank. */
export function waterSurfaceY(
  nCarved: number,
  rawLand: number,
  u: number,
  v: number,
  hydro: HydroState,
  seaLevel: number,
  height: number,
  riparian: boolean,
) {
  void nCarved
  if (!riparian) return BASE_WATER * height
  const plane = localWaterN(u, v, hydro, seaLevel)
  return Math.min(plane, rawLand - BANK_FREEBOARD) * height
}

export function waterWetMask(
  nCarved: number,
  u: number,
  v: number,
  hydro: HydroState,
  seaLevel: number,
  riparian: boolean,
) {
  if (!riparian) return nCarved < BASE_WATER ? 1 : 0
  const w = localWaterN(u, v, hydro, seaLevel)
  return nCarved < w && isInundated(nCarved, u, v, hydro, seaLevel) ? 1 : 0
}

export function damEffectiveness(dam: {
  height: number
  completion: number
  density: number
  pieces: unknown[]
}) {
  if (!dam.pieces?.length) return 0
  const crest = clamp(dam.height / 0.09, 0.12, 1)
  return clamp(dam.completion * (0.36 + 0.64 * dam.density) * crest, 0, 1)
}

export function stepHydrology(
  hydro: HydroState,
  dam: {
    siteU: number
    siteV: number
    height: number
    completion: number
    density: number
    pieces: unknown[]
  },
  field: HeightField,
  params: Pick<NoiseParams, 'seaLevel' | 'worldSize'>,
  dt: number,
  seasonFlow = 1,
  waterBias = 0,
) {
  if (hydro.upstreamLevel === undefined) {
    const base = emptyHydro()
    hydro.damU = base.damU
    hydro.damV = base.damV
    hydro.effectiveness = 0
    hydro.upstreamLevel = BASE_WATER
    hydro.downstreamLevel = BASE_WATER
    hydro.pondReach = base.pondReach
    hydro.pondSpread = base.pondSpread
    hydro.pondArea = 0
    hydro.floodedArea = 0
    hydro.flow = 1
  }
  hydro.damU = dam.siteU
  hydro.damV = dam.siteV
  hydro.damHeight = dam.height
  hydro.effectiveness = damEffectiveness(dam)
  const e = hydro.effectiveness
  const crest = bankCrestN(dam.siteU, field, params.seaLevel)
  const targetUp = Math.min(
    BASE_WATER + e * 0.07 + clamp(waterBias, 0, 0.1),
    crest - BANK_FREEBOARD,
  )
  const targetDown = BASE_WATER - e * 0.012
  const targetReach = 0.05 + e * 0.22
  const targetSpread = 0.026 + e * 0.13
  const targetFlow = (1 - e * 0.52) * Math.max(0.22, seasonFlow)
  const k = 1 - Math.exp(-0.04 * Math.max(0, dt))
  hydro.upstreamLevel += (targetUp - hydro.upstreamLevel) * k
  hydro.downstreamLevel += (targetDown - hydro.downstreamLevel) * k
  hydro.pondReach += (targetReach - hydro.pondReach) * k
  hydro.pondSpread += (targetSpread - hydro.pondSpread) * k
  hydro.flow += (targetFlow - hydro.flow) * k
  sampleHydroAreas(hydro, field, params)
}

function sampleHydroAreas(
  hydro: HydroState,
  field: HeightField,
  params: Pick<NoiseParams, 'seaLevel' | 'worldSize'>,
) {
  const n = 34
  const cell = (params.worldSize * params.worldSize) / (n * n)
  const sea = params.seaLevel
  let pond = 0
  let flood = 0
  for (let j = 0; j < n; j += 1) {
    const v = n <= 1 ? 0.5 : j / (n - 1)
    for (let i = 0; i < n; i += 1) {
      const u = n <= 1 ? 0.5 : i / (n - 1)
      const carved = carveRiver(sampleHeightField(field, u, v), u, v, sea)
      if (!isInundated(carved, u, v, hydro, sea)) continue
      if (streamAlong(u, hydro) <= 0.012) pond += cell
      if (riverMask(u, v, sea) < 0.34) flood += cell
    }
  }
  hydro.pondArea = pond
  hydro.floodedArea = flood
}

export function carveRiver(n: number, u: number, v: number, seaLevel = 0.1) {
  const w = riverHalfWidth(seaLevel)
  const d = riverDistance(u, v)
  const channel = 1 - smoothstep(w * 0.32, w, d)
  const bench = 1 - smoothstep(w, w + 0.09, d)
  const along = landFlowSign > 0 ? u : 1 - u
  return n - channel * (0.2 + along * 0.03) - bench * 0.04
}

export function isInundated(
  nCarved: number,
  u: number,
  v: number,
  hydro: HydroState = defaultHydro,
  seaLevel = 0.1,
) {
  const w = localWaterN(u, v, hydro, seaLevel)
  if (nCarved >= w) return false
  const along = streamAlong(u, hydro)
  const d = riverDistance(u, v)
  const bank = riverHalfWidth(seaLevel)
  if (along > 0.014) return d < bank * 1.1
  const near = 1 - smoothstep(0, Math.max(0.04, hydro.pondReach ?? 0.05), -along)
  const spread = bank + (hydro.pondSpread ?? 0.02) * (0.35 + 0.65 * near)
  return d < spread
}

export function waterlineFoam(
  nCarved: number,
  u: number,
  v: number,
  hydro: HydroState = defaultHydro,
  seaLevel = 0.1,
) {
  const w = localWaterN(u, v, hydro, seaLevel)
  const edge = 1 - smoothstep(0, 0.0052, Math.abs(nCarved - w))
  if (edge < 0.04) return 0
  return isInundated(nCarved, u, v, hydro, seaLevel) ? edge * 0.86 : edge * 0.5
}

export function bankFoam(u: number, v: number, seaLevel = 0.1) {
  const d = riverDistance(u, v)
  const w = riverHalfWidth(seaLevel)
  return 1 - smoothstep(0, 0.0036, Math.abs(d - w * 0.92))
}

function grain(u: number, v: number) {
  const s = Math.sin(u * 71.3 + v * 53.9) * 43758.5453
  return s - Math.floor(s)
}

export function riparianColor(
  n: number,
  u: number,
  v: number,
  hydro: HydroState = defaultHydro,
  seaLevel = 0.1,
  tint?: { marsh: number; shore: number; green?: number; warmth?: number; winter?: number },
): [number, number, number] {
  const d = riverDistance(u, v)
  const w = riverHalfWidth(seaLevel)
  const wet = floodplainMask(u, v, seaLevel)
  const corridor = corridorMask(u, v, seaLevel)
  const g = grain(u, v)
  const marsh = tint?.marsh ?? 0
  const oldShore = tint?.shore ?? 0
  let rgb: [number, number, number]
  if (isInundated(n, u, v, hydro, seaLevel) || riverMask(u, v, seaLevel) > 0.5) {
    rgb = mix([34, 52, 50], [46, 62, 56], g)
    if (marsh > 0.08) rgb = mix(rgb, [42, 68, 52], clamp(marsh * 0.55, 0, 0.55))
  } else if (d < w * 1.4) {
    rgb = mix([94, 76, 54], [72, 64, 46], wet * 0.55 + g * 0.45)
    if (marsh > 0.1) rgb = mix(rgb, [70, 92, 54], clamp(marsh, 0, 0.7))
  } else if (corridor > 0.32) {
    rgb = mix([118, 100, 72], [84, 92, 56], 0.32 + g * 0.4)
    if (marsh > 0.12) rgb = mix(rgb, [78, 98, 58], clamp(marsh * 0.85, 0, 0.75))
  } else if (n < 0.11) rgb = mix([88, 100, 56], [60, 84, 50], n / 0.11)
  else if (n < 0.26) rgb = mix([60, 84, 50], [90, 86, 66], (n - 0.11) / 0.15)
  else rgb = mix([112, 108, 98], [156, 154, 148], Math.min(1, (n - 0.26) / 0.38))
  if (oldShore > 0.18) rgb = mix(rgb, [166, 150, 118], clamp(oldShore * 0.72, 0, 0.62))
  const wetWater = isInundated(n, u, v, hydro, seaLevel) || riverMask(u, v, seaLevel) > 0.5
  if (!wetWater) {
    if ((tint?.green ?? 0) > 0.06) rgb = mix(rgb, [68, 118, 56], clamp((tint?.green ?? 0) * 0.42, 0, 0.48))
    if ((tint?.warmth ?? 0) > 0.06) rgb = mix(rgb, [148, 94, 44], clamp((tint?.warmth ?? 0) * 0.5, 0, 0.55))
  }
  if ((tint?.winter ?? 0) > 0.08) rgb = mix(rgb, [206, 214, 218], clamp((tint?.winter ?? 0) * (wetWater ? 0.28 : 0.4), 0, 0.5))
  return rgb
}

function mix(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  const k = Math.min(1, Math.max(0, t))
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ]
}
