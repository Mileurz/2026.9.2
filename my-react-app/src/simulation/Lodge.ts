import { sampleHeightField, type HeightField } from '../heightField'
import type { NoiseParams } from '../perlin'
import type { DamState } from './Dam'
import type { HydroState } from './Hydrology'
import {
  baseWaterLevelN,
  carveRiver,
  riverCenter,
  riverDownstreamSign,
  riverHalfWidth,
} from './Hydrology'
import type { BranchResource } from './TreeResource'

export type LodgeStage = 'SMALL_BRANCH_PILE' | 'EARLY_LODGE' | 'ESTABLISHED_LODGE' | 'MATURE_LODGE'

export type LodgePieceKind = 'stick' | 'branch' | 'log' | 'mud' | 'reed'

export type LodgePiece = {
  id: string
  kind: LodgePieceKind
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

export type LodgeState = {
  id: string
  siteU: number
  siteV: number
  locked: boolean
  stage: LodgeStage
  size: number
  height: number
  density: number
  materialAmount: number
  chamberDry: boolean
  entranceSubmerged: boolean
  entranceU: number
  entranceV: number
  entranceYaw: number
  pieces: LodgePiece[]
}

function clamp(value: number, a: number, b: number) {
  return Math.min(b, Math.max(a, value))
}

function hash(id: string, salt: number) {
  let h = salt >>> 0
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

export function emptyLodge(): LodgeState {
  return {
    id: 'L-01',
    siteU: 0.5,
    siteV: 0.5,
    locked: false,
    stage: 'SMALL_BRANCH_PILE',
    size: 0,
    height: 0,
    density: 0,
    materialAmount: 0,
    chamberDry: false,
    entranceSubmerged: false,
    entranceU: 0.5,
    entranceV: 0.5,
    entranceYaw: 0,
    pieces: [],
  }
}

export function lodgeStageLabel(stage: LodgeStage) {
  switch (stage) {
    case 'SMALL_BRANCH_PILE':
      return 'Small branch pile'
    case 'EARLY_LODGE':
      return 'Early lodge'
    case 'ESTABLISHED_LODGE':
      return 'Established lodge'
    case 'MATURE_LODGE':
      return 'Mature lodge'
  }
}

export function lodgeIsHome(lodge: LodgeState) {
  return lodge.locked && lodge.pieces.length > 0
}

export function lodgeHome(lodge: LodgeState) {
  return { u: lodge.siteU, v: lodge.siteV }
}

export function lodgeApproach(lodge: LodgeState) {
  return {
    u: clamp(lodge.siteU, 0.08, 0.92),
    v: clamp(lodge.siteV, 0.08, 0.92),
  }
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

function lodgeSiteFromDam(
  dam: DamState,
  hydro: HydroState,
  params: NoiseParams,
  bankHome: { u: number; v: number },
  field?: HeightField | null,
) {
  const flow = riverDownstreamSign()
  const reach = Math.max(0.03, hydro.pondReach ?? 0.05)
  const u0 = clamp(dam.siteU - flow * (0.032 + reach * 0.35), 0.2, 0.8)
  const sea = params.seaLevel
  const half = riverHalfWidth(sea)
  const side = Math.sign(bankHome.v - riverCenter(u0)) || 1
  let bestU = u0
  let bestV = clamp(riverCenter(u0) + side * half * 0.72, 0.08, 0.92)
  let best = Number.NEGATIVE_INFINITY
  if (field) {
    const water = baseWaterLevelN()
    for (let i = 0; i < 12; i += 1) {
      const u = clamp(u0 + (i - 5) * 0.007, 0.18, 0.82)
      const c = riverCenter(u)
      for (const k of [0.5, 0.7, 0.9, 1.1, 1.3]) {
        const v = clamp(c + side * half * k, 0.08, 0.92)
        const n = carveRiver(sampleHeightField(field, u, v), u, v, sea)
        if (n < water + 0.005) continue
        const steep = slopeAt(field, u, v)
        if (steep > 6.8) continue
        const shore = Math.abs(n - water)
        const score = 0.18 - shore * 1.4 - steep * 0.1 - Math.abs(u - u0) * 0.8
        if (score > best) {
          best = score
          bestU = u
          bestV = v
        }
      }
    }
  }
  return {
    u: bestU,
    v: bestV,
    yaw: Math.atan2(flow * 0.008, riverCenter(bestU) - bestV),
  }
}

export function lodgeSiteFits(
  lodge: LodgeState,
  dam: DamState,
  params: NoiseParams,
  field: HeightField,
) {
  if (!lodge.locked) return false
  const sea = params.seaLevel
  const n = carveRiver(sampleHeightField(field, lodge.siteU, lodge.siteV), lodge.siteU, lodge.siteV, sea)
  const water = baseWaterLevelN()
  if (n < water - 0.004) return false
  if (slopeAt(field, lodge.siteU, lodge.siteV) > 7.2) return false
  if (Math.hypot(lodge.siteU - dam.siteU, lodge.siteV - dam.siteV) > 0.16) return false
  return true
}

export function ensureLodgeSite(
  lodge: LodgeState,
  dam: DamState,
  hydro: HydroState,
  params: NoiseParams,
  bankHome: { u: number; v: number },
  field?: HeightField | null,
) {
  if (!lodge.pieces) lodge.pieces = []
  if (!lodge.id) lodge.id = 'L-01'
  if (dam.pieces.length < 1 && (hydro.effectiveness ?? 0) < 0.03 && !lodge.locked) return
  if (!dam.locked && !lodge.locked) return
  const site = lodgeSiteFromDam(dam, hydro, params, bankHome, field)
  const keep =
    lodge.locked &&
    field &&
    lodgeSiteFits(lodge, dam, params, field) &&
    Math.hypot(site.u - lodge.siteU, site.v - lodge.siteV) < 0.018
  if (keep) {
    lodge.entranceYaw = site.yaw
    refreshEntrance(lodge)
    return
  }
  const du = site.u - lodge.siteU
  const dv = site.v - lodge.siteV
  lodge.siteU = site.u
  lodge.siteV = site.v
  if (lodge.locked && lodge.pieces.length > 0 && Math.hypot(du, dv) > 0.0008) {
    for (const piece of lodge.pieces) {
      piece.u = clamp(piece.u + du, 0.06, 0.94)
      piece.v = clamp(piece.v + dv, 0.06, 0.94)
    }
  }
  lodge.entranceYaw = site.yaw
  lodge.locked = true
  refreshEntrance(lodge)
}

function stageFromMaterial(m: number): LodgeStage {
  if (m < 0.7) return 'SMALL_BRANCH_PILE'
  if (m < 2.1) return 'EARLY_LODGE'
  if (m < 4.6) return 'ESTABLISHED_LODGE'
  return 'MATURE_LODGE'
}

function refreshMetrics(lodge: LodgeState) {
  if (lodge.pieces.length === 0) {
    lodge.stage = 'SMALL_BRANCH_PILE'
    lodge.size = 0
    lodge.height = 0
    lodge.density = 0
    lodge.chamberDry = false
    lodge.entranceSubmerged = false
    refreshEntrance(lodge)
    return
  }
  const m = lodge.materialAmount
  const progress = 1 - Math.exp(-m / 5.4)
  lodge.stage = stageFromMaterial(m)
  lodge.size = 0.01 + progress * 0.028
  lodge.height = 0.014 + progress * 0.048
  lodge.density = Math.min(1, lodge.pieces.length / (6 + progress * 42))
  lodge.chamberDry = lodge.stage !== 'SMALL_BRANCH_PILE'
  lodge.entranceSubmerged = lodge.stage !== 'SMALL_BRANCH_PILE'
  refreshEntrance(lodge)
}

function refreshEntrance(lodge: LodgeState) {
  const reach = Math.max(0.008, lodge.size * 0.72)
  lodge.entranceU = clamp(lodge.siteU + Math.sin(lodge.entranceYaw) * reach, 0.06, 0.94)
  lodge.entranceV = clamp(lodge.siteV + Math.cos(lodge.entranceYaw) * reach, 0.06, 0.94)
}

function inEntranceGap(lodge: LodgeState, u: number, v: number) {
  if (lodge.stage === 'SMALL_BRANCH_PILE') return false
  const du = u - lodge.siteU
  const dv = v - lodge.siteV
  const ang = Math.atan2(du, dv)
  let d = ang - lodge.entranceYaw
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return Math.abs(d) < 0.42 && Math.hypot(du, dv) > lodge.size * 0.28
}

function scatterPose(lodge: LodgeState, key: string, salt: number, kind: LodgePieceKind) {
  const span = Math.max(0.007, lodge.size)
  const r = span * Math.sqrt(hash(key, salt))
  const ang = hash(key, salt + 1) * Math.PI * 2
  const messy = 1.35 - lodge.density * 0.75
  let u = lodge.siteU + Math.sin(ang) * r
  let v = lodge.siteV + Math.cos(ang) * r
  if (inEntranceGap(lodge, u, v) && kind !== 'reed') {
    const shift = 0.55 + hash(key, salt + 2) * 0.35
    u = lodge.siteU + Math.sin(ang + 1.1) * r * shift
    v = lodge.siteV + Math.cos(ang + 1.1) * r * shift
  }
  const dome = Math.max(0, 1 - (r / span) * 0.72)
  let lift = -0.011 + dome * lodge.height * (kind === 'mud' ? 0.58 : 0.92)
  if (kind === 'reed') lift = -0.003 + hash(key, salt + 5) * 0.016
  if (kind === 'stick' && lodge.stage === 'SMALL_BRANCH_PILE') lift = -0.004 + hash(key, salt + 5) * 0.012
  return {
    u: clamp(u, 0.06, 0.94),
    v: clamp(v, 0.06, 0.94),
    lift,
    yaw: ang + (hash(key, salt + 6) - 0.5) * messy * 1.6,
    pitch: (hash(key, salt + 7) - 0.5) * (kind === 'reed' ? 0.18 : 0.5),
    roll: (hash(key, salt + 8) - 0.5) * 0.35,
  }
}

function woodKind(branch: BranchResource): LodgePieceKind {
  if (branch.length > 0.28) return 'log'
  if (branch.length < 0.17) return 'stick'
  return 'branch'
}

export function placeBranchOnLodge(
  lodge: LodgeState,
  branch: BranchResource,
  _field: HeightField,
  _params: NoiseParams,
) {
  void _field
  void _params
  if (lodge.pieces.length >= 180) return
  const kind = woodKind(branch)
  const key = `${branch.id}-${lodge.pieces.length}`
  const pose = scatterPose(lodge, key, 11, kind)
  lodge.pieces.push({
    id: `${key}-wood`,
    kind,
    ...pose,
    sx: kind === 'log' ? 0.01 : kind === 'stick' ? 0.0042 : 0.006,
    sy: kind === 'log' ? 0.042 + branch.length * 0.12 : 0.028 + branch.length * 0.16,
    sz: kind === 'log' ? 0.009 : kind === 'stick' ? 0.004 : 0.0055,
  })
  lodge.materialAmount += Math.max(0.14, branch.woodAmount * 3)
  branch.inLodge = true
  branch.inDam = false
  branch.carriedBy = null
  branch.availability = false
  branch.stored = false
  refreshMetrics(lodge)
  if (lodge.stage !== 'SMALL_BRANCH_PILE' && lodge.pieces.length < 170 && hash(key, 21) > 0.42) {
    const mud = scatterPose(lodge, key, 31, 'mud')
    lodge.pieces.push({
      id: `${key}-mud`,
      kind: 'mud',
      ...mud,
      sx: 0.011 + hash(key, 32) * 0.007,
      sy: 0.007 + hash(key, 33) * 0.005,
      sz: 0.01 + hash(key, 34) * 0.006,
    })
    lodge.materialAmount += 0.045
    refreshMetrics(lodge)
  }
  if (lodge.chamberDry && lodge.pieces.length < 168 && hash(key, 41) > 0.62) {
    const reed = scatterPose(lodge, key, 51, 'reed')
    lodge.pieces.push({
      id: `${key}-reed`,
      kind: 'reed',
      ...reed,
      sx: 0.0035,
      sy: 0.016 + hash(key, 52) * 0.014,
      sz: 0.0035,
    })
    lodge.materialAmount += 0.02
    refreshMetrics(lodge)
  }
}

export function maintainLodge(lodge: LodgeState, beaverId: string) {
  if (lodge.pieces.length < 1 || lodge.pieces.length >= 180) return
  const kind: LodgePieceKind = hash(beaverId, lodge.pieces.length + 9) > 0.45 ? 'mud' : 'reed'
  const key = `${beaverId}-lodge-${lodge.pieces.length}`
  const pose = scatterPose(lodge, key, 44, kind)
  lodge.pieces.push({
    id: key,
    kind,
    ...pose,
    sx: kind === 'reed' ? 0.0036 : 0.012 + hash(key, 55) * 0.007,
    sy: kind === 'reed' ? 0.018 + hash(key, 54) * 0.012 : 0.007,
    sz: kind === 'reed' ? 0.0036 : 0.011 + hash(key, 56) * 0.006,
  })
  lodge.materialAmount += kind === 'mud' ? 0.04 : 0.018
  refreshMetrics(lodge)
}

export function lodgeReady(lodge: LodgeState, dam: DamState, hydro: HydroState) {
  return lodge.locked || dam.pieces.length >= 1 || (hydro.effectiveness ?? 0) > 0.03
}
