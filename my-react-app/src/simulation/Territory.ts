import { sampleHeightField, type HeightField } from '../heightField'
import type { NoiseParams } from '../perlin'
import type { BeaverAgent } from './Beaver'
import type { DamState } from './Dam'
import {
  carveRiver,
  corridorMask,
  floodplainMask,
  isInundated,
  riverCenter,
  riverDistance,
  riverDownstreamSign,
  riverHalfWidth,
  riverMask,
  streamAlong,
  type HydroState,
} from './Hydrology'
import type { LodgeState } from './Lodge'
import { isStanding, isTreeValidTarget, type ForestState } from './TreeResource'

export type ProspectKind = 'dam' | 'lodge'

export type ProspectSite = {
  u: number
  v: number
  score: number
  kind: ProspectKind
  claimedBy: string | null
}

export type TrailMark = {
  u: number
  v: number
  age: number
}

export type TerritoryState = {
  trails: TrailMark[]
  prospects: ProspectSite[]
}

type ColonySpace = {
  home: { u: number; v: number }
  dam: DamState
  lodge: LodgeState
  hydro: HydroState
  forest: ForestState
  beavers: BeaverAgent[]
  territory: TerritoryState
  season?: { spring: number; disperse: number }
}

function clamp(value: number, a: number, b: number) {
  return Math.min(b, Math.max(a, value))
}

export function emptyTerritory(): TerritoryState {
  return { trails: [], prospects: [] }
}

export function recordTrail(space: TerritoryState, u: number, v: number) {
  const last = space.trails[space.trails.length - 1]
  if (last && Math.hypot(last.u - u, last.v - v) < 0.012) {
    last.u = u
    last.v = v
    last.age = 0
    return
  }
  space.trails.push({ u, v, age: 0 })
  if (space.trails.length > 96) space.trails.shift()
}

export function stepTrails(space: TerritoryState, dt: number) {
  for (const mark of space.trails) mark.age += dt
  space.trails = space.trails.filter((mark) => mark.age < 28)
}

/** Pull toward reused slides so hauling follows worn land trails. */
export function trailSteer(space: TerritoryState, u: number, v: number) {
  let bu = 0
  let bv = 0
  let w = 0
  for (const mark of space.trails) {
    const d = Math.hypot(mark.u - u, mark.v - v)
    if (d > 0.042 || d < 0.002) continue
    const k = (1 - mark.age / 28) * Math.exp((-d * d) / 0.0004)
    bu += (mark.u - u) * k
    bv += (mark.v - v) * k
    w += k
  }
  if (w < 0.04) return { u: 0, v: 0 }
  return { u: bu / w, v: bv / w }
}

function trailField(space: TerritoryState, u: number, v: number) {
  let w = 0
  for (const mark of space.trails) {
    const d = Math.hypot(mark.u - u, mark.v - v)
    if (d > 0.05) continue
    w += (1 - mark.age / 28) * Math.exp(-d * d / 0.00055)
  }
  return Math.min(1, w * 0.45)
}

function foodField(forest: ForestState, u: number, v: number) {
  let w = 0
  for (const tree of forest.trees) {
    if (tree.ecoState === 'dead' || tree.ecoState === 'snag' || tree.ecoState === 'fallen_dead') continue
    if (!isStanding(tree.currentState) && tree.currentState !== 'FALLEN' && tree.currentState !== 'STUMP') continue
    const d = Math.hypot(tree.position.u - u, tree.position.v - v)
    if (d > 0.09) continue
    const pref = tree.species === 'willow' || tree.species === 'aspen' || tree.species === 'poplar' ? 1 : 0.45
    w += pref * Math.exp(-d * d / 0.0018)
  }
  return Math.min(1, w * 0.22)
}

function canalWidth(field: HeightField, params: NoiseParams, u: number) {
  const c = riverCenter(u)
  const sea = params.seaLevel
  const water = 0.02
  let half = riverHalfWidth(sea)
  for (let s = 0.01; s < 0.12; s += 0.006) {
    const nL = carveRiver(sampleHeightField(field, u, clamp(c - s, 0.05, 0.95)), u, c - s, sea)
    const nR = carveRiver(sampleHeightField(field, u, clamp(c + s, 0.05, 0.95)), u, c + s, sea)
    if (nL > water + 0.018 && nR > water + 0.018) {
      half = s
      break
    }
    half = s
  }
  return half
}

function occupancy(
  u: number,
  v: number,
  originU: number,
  hydro: HydroState,
  sea: number,
  forest: ForestState,
  space: TerritoryState,
  alongScale: number,
  acrossScale: number,
) {
  const along = Math.abs(u - originU)
  const stream = Math.abs(streamAlong(u, hydro))
  const across = riverDistance(u, v)
  const corridor = corridorMask(u, v, sea)
  const flood = floodplainMask(u, v, sea)
  const shore = riverMask(u, v, sea)
  const alongFall = Math.exp(-Math.min(along, stream) / alongScale)
  const acrossFall = Math.exp(-across / acrossScale)
  const ribbon = Math.max(corridor, flood * 0.85, shore * 0.7) * (0.38 + 0.62 * alongFall) * (0.25 + 0.75 * acrossFall)
  const food = foodField(forest, u, v)
  const trail = trailField(space, u, v)
  return clamp(ribbon * 0.78 + food * 0.34 + trail * 0.4, 0, 1)
}

export function territoryIntensity(
  u: number,
  v: number,
  colony: ColonySpace,
  field: HeightField,
  params: NoiseParams,
) {
  const sea = params.seaLevel
  const hydro = colony.hydro
  const n = carveRiver(sampleHeightField(field, u, v), u, v, sea)
  const wet = isInundated(n, u, v, hydro, sea)
  const origin = colony.lodge.locked ? colony.lodge.siteU : colony.home.u
  const alongScale = 0.07 + (hydro.pondReach ?? 0.05) * 0.85
  const acrossScale = 0.028 + (hydro.pondSpread ?? 0.02) * 0.7
  let w = occupancy(u, v, origin, hydro, sea, colony.forest, colony.territory, alongScale, acrossScale)
  if (wet) w = Math.max(w, 0.55 * occupancy(u, v, origin, hydro, sea, colony.forest, colony.territory, alongScale * 1.15, acrossScale * 1.35))
  for (const site of colony.territory.prospects) {
    if (!site.claimedBy) continue
    const local = occupancy(u, v, site.u, hydro, sea, colony.forest, colony.territory, 0.045, 0.022)
    w = Math.max(w, local * 0.62)
  }
  return clamp(w, 0, 1)
}

export function inCoreTerritory(
  u: number,
  v: number,
  colony: ColonySpace,
  field: HeightField,
  params: NoiseParams,
) {
  return territoryIntensity(u, v, colony, field, params) > 0.4
}

export function scoreProspect(
  u: number,
  v: number,
  colony: ColonySpace,
  field: HeightField,
  params: NoiseParams,
) {
  const natal = colony.lodge.locked ? { u: colony.lodge.siteU, v: colony.lodge.siteV } : colony.home
  const away = Math.hypot(u - natal.u, v - natal.v)
  if (away < 0.1 || away > 0.42) return 0
  if (inCoreTerritory(u, v, colony, field, params)) return 0
  const sea = params.seaLevel
  const width = canalWidth(field, params, u)
  const narrow = clamp(1 - (width - 0.018) / 0.08, 0, 1)
  const corridor = corridorMask(u, v, sea)
  const food = foodField(colony.forest, u, v)
  let trees = 0
  for (const tree of colony.forest.trees) {
    if (!isTreeValidTarget(tree)) continue
    if (Math.hypot(tree.position.u - u, tree.position.v - v) < 0.11) trees += 1
  }
  const treeScore = clamp(trees / 5, 0, 1)
  let crowding = 0
  for (const other of colony.territory.prospects) {
    if (Math.hypot(other.u - u, other.v - v) < 0.08) crowding += 1
  }
  return narrow * 1.4 + corridor * 0.7 + food * 1.1 + treeScore * 1.3 - crowding * 0.8 + away * 0.35
}

export function kindForSite(u: number, v: number, params: NoiseParams): ProspectKind {
  const half = riverHalfWidth(params.seaLevel)
  return riverDistance(u, v) > half * 0.55 ? 'lodge' : 'dam'
}

export function searchProspect(
  from: { u: number; v: number },
  sign: number,
  colony: ColonySpace,
  field: HeightField,
  params: NoiseParams,
) {
  let best: ProspectSite | null = null
  for (let k = 3; k < 14; k += 1) {
    const u = clamp(from.u + sign * (0.018 + k * 0.018), 0.12, 0.88)
    const c = riverCenter(u)
    const half = canalWidth(field, params, u)
    const candidates = [
      { u, v: c },
      { u, v: clamp(c + half * 0.7, 0.08, 0.92) },
      { u, v: clamp(c - half * 0.7, 0.08, 0.92) },
    ]
    for (const p of candidates) {
      const score = scoreProspect(p.u, p.v, colony, field, params)
      if (!best || score > best.score) {
        best = { u: p.u, v: p.v, score, kind: kindForSite(p.u, p.v, params), claimedBy: null }
      }
    }
  }
  return best && best.score > 1.55 ? best : null
}

export function dispersalSignFor(colony: ColonySpace) {
  const flow = riverDownstreamSign()
  const origin = colony.lodge.locked ? colony.lodge.siteU : colony.home.u
  let down = 0
  let up = 0
  for (const tree of colony.forest.trees) {
    if (!isTreeValidTarget(tree)) continue
    const along = (tree.position.u - origin) * flow
    if (along > 0.04) down += 1
    else if (along < -0.04) up += 1
  }
  return down >= up ? flow : -flow
}

export function canDisperse(b: BeaverAgent, colony: ColonySpace) {
  if (b.status && b.status !== 'resident') return false
  if (b.mother === null && b.father === null) return false
  if (b.lifeStage !== 'subadult' && b.lifeStage !== 'adult') return false
  if (b.age < 1.9) return false
  const springGo = (colony.season?.disperse ?? 0) > 0.3 || (colony.season?.spring ?? 0) > 0.42
  if (!springGo) return false
  if (b.energy < 0.5 || b.health < 0.55 || b.carrying) return false
  if (colony.beavers.some((o) => o.status === 'dispersing' || o.status === 'settled')) return false
  const natal = colony.beavers.filter((o) => (o.status ?? 'resident') === 'resident').length
  const olderYoung = colony.beavers.filter(
    (o) =>
      (o.status ?? 'resident') === 'resident' &&
      o.mother !== null &&
      (o.lifeStage === 'yearling' || o.lifeStage === 'subadult' || o.lifeStage === 'adult'),
  ).length
  return natal >= 6 || olderYoung >= 2
}

export function beginDispersal(b: BeaverAgent, colony: ColonySpace) {
  b.status = 'dispersing'
  b.partner = null
  b.carryGoal = null
  b.dispersalSign = dispersalSignFor(colony)
  b.homeLodge = ''
}

export function settleBeaver(b: BeaverAgent, site: ProspectSite, space: TerritoryState) {
  b.status = 'settled'
  b.homeLocation = { u: site.u, v: site.v }
  b.homeLodge = site.kind === 'lodge' ? 'prospect-lodge' : 'prospect-dam'
  site.claimedBy = b.id
  const existing = space.prospects.find((p) => Math.hypot(p.u - site.u, p.v - site.v) < 0.03)
  if (existing) existing.claimedBy = b.id
  else space.prospects.push({ ...site, claimedBy: b.id })
}
