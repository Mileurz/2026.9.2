import { sampleHeightField, type HeightField } from '../heightField'
import type { NoiseParams } from '../perlin'
import {
  carveRiver,
  riverCenter,
  riverDownstreamSign,
  riverHalfWidth,
  riverWayVersion,
  baseWaterLevelN,
} from './Hydrology'
import type { BranchResource } from './TreeResource'

export type DamPieceKind = 'branch' | 'log' | 'mud' | 'stone' | 'vegetation'

export type DamPiece = {
  id: string
  kind: DamPieceKind
  u: number
  v: number
  lift: number
  yaw: number
  pitch: number
  roll: number
  sx: number
  sy: number
  sz: number
}

export type DamState = {
  siteU: number
  siteV: number
  locked: boolean
  length: number
  height: number
  thickness: number
  materialAmount: number
  completion: number
  density: number
  pieces: DamPiece[]
  wayVersion?: number
}

function clamp(value: number, a: number, b: number) {
  return Math.min(b, Math.max(a, value))
}

function hash(id: string, salt: number) {
  let h = salt >>> 0
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

export function emptyDam(): DamState {
  return {
    siteU: 0.5,
    siteV: 0.5,
    locked: false,
    length: 0,
    height: 0,
    thickness: 0,
    materialAmount: 0,
    completion: 0,
    density: 0,
    pieces: [],
  }
}

function channelHalf(field: HeightField, params: NoiseParams, u: number) {
  const c = riverCenter(u)
  const sea = params.seaLevel
  const water = baseWaterLevelN()
  let half = riverHalfWidth(sea)
  for (let s = 0.008; s < 0.13; s += 0.004) {
    const nL = carveRiver(sampleHeightField(field, u, clamp(c - s, 0.05, 0.95)), u, c - s, sea)
    const nR = carveRiver(sampleHeightField(field, u, clamp(c + s, 0.05, 0.95)), u, c + s, sea)
    if (nL > water + 0.016 && nR > water + 0.016) {
      half = s
      break
    }
    half = s
  }
  return half
}

function slopeAt(field: HeightField, u: number, v: number) {
  const e = 0.01
  return (
    Math.hypot(
      sampleHeightField(field, u + e, v) - sampleHeightField(field, u - e, v),
      sampleHeightField(field, u, v + e) - sampleHeightField(field, u, v - e),
    ) /
    (e * 2)
  )
}

/** True when this dam still sits in a narrow, wet channel on the current land. */
export function damSiteFits(
  dam: DamState,
  field: HeightField,
  params: NoiseParams,
  home: { u: number; v: number },
) {
  if (!dam.locked) return false
  const c = riverCenter(dam.siteU)
  if (Math.abs(dam.siteV - c) > 0.055) return false
  if (Math.abs(dam.siteU - home.u) > 0.22) return false
  const half = channelHalf(field, params, dam.siteU)
  if (half > 0.092 || half < 0.01) return false
  const n = carveRiver(sampleHeightField(field, dam.siteU, c), dam.siteU, c, params.seaLevel)
  if (n > baseWaterLevelN() + 0.02) return false
  if (slopeAt(field, dam.siteU, c) > 9.2) return false
  return true
}

/** Narrow wet channel near home — used to decide whether a dam is worth building. */
export function habitatDamScore(
  field: HeightField,
  params: NoiseParams,
  home: { u: number; v: number },
) {
  const flow = riverDownstreamSign()
  const u = clamp(home.u + flow * 0.03, 0.2, 0.8)
  const half = channelHalf(field, params, u)
  return clamp(1 - (half - 0.018) / 0.09, 0, 1)
}

export function ensureDamSite(
  dam: DamState,
  field: HeightField,
  params: NoiseParams,
  home: { u: number; v: number },
) {
  if (!dam.pieces) dam.pieces = []
  const flow = riverDownstreamSign()
  const way = riverWayVersion()
  if (dam.locked) {
    const nextV = riverCenter(dam.siteU)
    const moved = Math.abs(dam.siteV - nextV) > 0.0035
    dam.siteV = nextV
    const fits = damSiteFits(dam, field, params, home)
    if (fits && (dam.pieces.length > 0 || dam.wayVersion === way)) {
      if (moved && dam.pieces.length > 0) layoutDam(dam)
      dam.wayVersion = way
      return
    }
  }
  let bestU = clamp(home.u + flow * 0.035, 0.2, 0.8)
  let best = Number.POSITIVE_INFINITY
  for (let k = 0; k < 16; k += 1) {
    const u = clamp(home.u + flow * (0.018 + k * 0.007), 0.2, 0.8)
    const half = channelHalf(field, params, u)
    const cost = half * 5.2 + Math.abs(u - home.u) * 1.15
    if (cost < best) {
      best = cost
      bestU = u
    }
  }
  dam.siteU = bestU
  dam.siteV = riverCenter(bestU)
  dam.locked = true
  dam.wayVersion = way
  layoutDam(dam)
}

function refreshMetrics(dam: DamState, field: HeightField, params: NoiseParams) {
  if (dam.pieces.length === 0) {
    dam.length = 0
    dam.height = 0
    dam.thickness = 0
    dam.completion = 0
    dam.density = 0
    return
  }
  const half = channelHalf(field, params, dam.siteU)
  const m = dam.materialAmount
  dam.completion = 1 - Math.exp(-m / 4.6)
  dam.length = 0.038 + dam.completion * Math.min(0.15, half * 2.25)
  dam.height = 0.028 + dam.completion * 0.11
  dam.thickness = 0.014 + dam.completion * 0.048
  dam.density = Math.min(1, dam.pieces.length / (4 + dam.completion * 36))
}

/** Keep sticks on the channel and spread them as the dam grows. */
export function layoutDam(dam: DamState) {
  if (!dam.pieces?.length) return
  const spanL = Math.max(0.034, dam.length)
  const spanT = Math.max(0.012, dam.thickness)
  const crest = Math.max(0.024, dam.height)
  const messy = 1.2 - dam.completion * 0.55
  for (const piece of dam.pieces) {
    const along = (hash(piece.id, 1) - 0.5) * spanL
    const weave = Math.sin(hash(piece.id, 2) * 12.6) * spanT * 0.35
    const drift = (hash(piece.id, 3) - 0.5) * spanT * (0.75 + hash(piece.id, 4) * 0.5) + weave
    const low = piece.kind === 'mud' || piece.kind === 'stone'
    piece.u = clamp(dam.siteU + drift, 0.06, 0.94)
    piece.v = clamp(dam.siteV + along, 0.06, 0.94)
    piece.lift = crest * (low ? 0.14 + hash(piece.id, 5) * 0.32 : 0.22 + hash(piece.id, 5) * 0.78)
    piece.yaw = (hash(piece.id, 6) - 0.5) * messy * 1.15
    piece.pitch = (hash(piece.id, 7) - 0.5) * 0.32
    piece.roll = (hash(piece.id, 8) - 0.5) * 0.28
    if (piece.kind === 'log' && piece.sx < 0.014) {
      piece.sx = 0.02
      piece.sy = Math.max(piece.sy * 1.9, 0.1)
      piece.sz = 0.018
    } else if (piece.kind === 'branch' && piece.sx < 0.01) {
      piece.sx = 0.013
      piece.sy = Math.max(piece.sy * 1.85, 0.08)
      piece.sz = 0.012
    } else if (piece.kind === 'mud' && piece.sx < 0.02) {
      piece.sx = 0.026
      piece.sy = Math.max(piece.sy * 1.8, 0.012)
      piece.sz = 0.022
    } else if (piece.kind === 'stone' && piece.sx < 0.014) {
      piece.sx = 0.018
      piece.sy = Math.max(piece.sy * 1.7, 0.012)
      piece.sz = 0.016
    } else if (piece.kind === 'vegetation' && piece.sx < 0.016) {
      piece.sx = 0.02
      piece.sy = Math.max(piece.sy * 1.7, 0.032)
      piece.sz = 0.02
    }
  }
}

function scatterPose(dam: DamState, key: string, salt: number, kind: DamPieceKind) {
  const spanL = Math.max(0.034, dam.length || 0.038)
  const spanT = Math.max(0.012, dam.thickness || 0.014)
  const crest = Math.max(0.024, dam.height || 0.028)
  const along = (hash(key, salt) - 0.5) * spanL
  const drift = (hash(key, salt + 3) - 0.5) * spanT * (0.7 + hash(key, salt + 4) * 0.8)
  const lift =
    kind === 'mud' || kind === 'stone'
      ? (0.14 + hash(key, salt + 5) * 0.32) * crest
      : (0.22 + hash(key, salt + 5) * 0.78) * crest
  return {
    u: clamp(dam.siteU + drift, 0.06, 0.94),
    v: clamp(dam.siteV + along, 0.06, 0.94),
    lift,
    yaw: (hash(key, salt + 6) - 0.5) * 1.05,
    pitch: (hash(key, salt + 7) - 0.5) * 0.32,
    roll: (hash(key, salt + 8) - 0.5) * 0.28,
  }
}

export function placeBranchOnDam(
  dam: DamState,
  branch: BranchResource,
  field: HeightField,
  params: NoiseParams,
  at?: { u: number; v: number },
) {
  if (dam.pieces.length >= 180) return
  const kind: DamPieceKind = branch.length > 0.28 ? 'log' : 'branch'
  const key = `${branch.id}-${dam.pieces.length}`
  const pose = at
    ? {
        u: clamp(at.u + (hash(key, 11) - 0.5) * 0.006, 0.06, 0.94),
        v: clamp(at.v + (hash(key, 12) - 0.5) * 0.008, 0.06, 0.94),
        lift: (kind === 'log' ? 0.28 : 0.22) * Math.max(0.024, dam.height || 0.028),
        yaw: (hash(key, 13) - 0.5) * 0.55,
        pitch: (hash(key, 14) - 0.5) * 0.18,
        roll: (hash(key, 15) - 0.5) * 0.16,
      }
    : scatterPose(dam, key, 11, kind)
  dam.pieces.push({
    id: `${key}-wood`,
    kind,
    ...pose,
    sx: kind === 'log' ? 0.02 : 0.013,
    sy: kind === 'log' ? 0.09 + branch.length * 0.28 : 0.07 + branch.length * 0.24,
    sz: kind === 'log' ? 0.018 : 0.012,
  })
  dam.materialAmount += branch.woodAmount
  branch.inDam = true
  branch.carriedBy = null
  branch.availability = false
  branch.stored = false
  refreshMetrics(dam, field, params)
  if (dam.pieces.length < 170 && (dam.completion > 0.04 || hash(key, 21) > 0.32)) {
    const mud = at
      ? {
          u: clamp(at.u + (hash(key, 31) - 0.5) * 0.008, 0.06, 0.94),
          v: clamp(at.v + (hash(key, 32) - 0.5) * 0.01, 0.06, 0.94),
          lift: 0.16 * Math.max(0.024, dam.height || 0.028),
          yaw: (hash(key, 33) - 0.5) * 0.7,
          pitch: (hash(key, 34) - 0.5) * 0.2,
          roll: (hash(key, 35) - 0.5) * 0.18,
        }
      : scatterPose(dam, key, 31, 'mud')
    dam.pieces.push({
      id: `${key}-mud`,
      kind: 'mud',
      ...mud,
      sx: 0.024 + hash(key, 32) * 0.014,
      sy: 0.012 + hash(key, 33) * 0.01,
      sz: 0.02 + hash(key, 34) * 0.012,
    })
    dam.materialAmount += 0.05
    refreshMetrics(dam, field, params)
  }
}

export function maintainDam(
  dam: DamState,
  field: HeightField,
  params: NoiseParams,
  beaverId: string,
  at?: { u: number; v: number },
) {
  if (dam.pieces.length < 1 || dam.pieces.length >= 180) return
  const kinds: DamPieceKind[] = ['mud', 'stone', 'vegetation']
  const kind = kinds[Math.floor(hash(beaverId, dam.pieces.length + 9) * kinds.length)] as DamPieceKind
  const key = `${beaverId}-fix-${dam.pieces.length}`
  const pose = at
    ? {
        u: clamp(at.u + (hash(key, 44) - 0.5) * 0.007, 0.06, 0.94),
        v: clamp(at.v + (hash(key, 45) - 0.5) * 0.01, 0.06, 0.94),
        lift: (kind === 'mud' || kind === 'stone' ? 0.16 : 0.28) * Math.max(0.024, dam.height || 0.028),
        yaw: (hash(key, 46) - 0.5) * 0.8,
        pitch: (hash(key, 47) - 0.5) * 0.22,
        roll: (hash(key, 48) - 0.5) * 0.2,
      }
    : scatterPose(dam, key, 44, kind)
  const scale =
    kind === 'stone'
      ? { sx: 0.016 + hash(key, 51) * 0.01, sy: 0.012 + hash(key, 52) * 0.008, sz: 0.014 + hash(key, 53) * 0.01 }
      : kind === 'vegetation'
        ? { sx: 0.02, sy: 0.034 + hash(key, 54) * 0.02, sz: 0.02 }
        : { sx: 0.026 + hash(key, 55) * 0.014, sy: 0.012, sz: 0.022 + hash(key, 56) * 0.012 }
  dam.pieces.push({
    id: key,
    kind,
    ...pose,
    ...scale,
  })
  dam.materialAmount += kind === 'stone' ? 0.06 : 0.035
  refreshMetrics(dam, field, params)
}

/** A bank-to-bank work spot on the upstream face of the dam. */
export function damWorkSlot(dam: DamState, beaverId: string, salt = 1) {
  const span = Math.max(0.036, dam.length || 0.04)
  const side = hash(beaverId, salt) > 0.5 ? 1 : -1
  const along = side * (0.01 + hash(beaverId, salt + 2) * span * 0.42)
  const upstream = -riverDownstreamSign() * (0.008 + hash(beaverId, salt + 3) * 0.012)
  return {
    u: clamp(dam.siteU + upstream, 0.08, 0.92),
    v: clamp(dam.siteV + along, 0.08, 0.92),
  }
}

export function damApproach(dam: DamState, beaverId = 'approach') {
  return damWorkSlot(dam, beaverId, 3)
}

export function damStats(dam: DamState) {
  return {
    length: dam.length * 7.2,
    height: dam.height,
    material: dam.materialAmount,
    progress: dam.completion,
  }
}
