import { sampleHeightField, type HeightField } from '../heightField'
import type { NoiseParams } from '../perlin'
import {
  carveRiver,
  isInundated,
  riverCenter,
  riverDistance,
  riverHalfWidth,
  streamAlong,
  type HydroState,
} from './Hydrology'
import type { SuccessionState } from './Succession'

export type WildlifeKind = 'duck' | 'bird' | 'frog' | 'fish' | 'insect'

export type WildlifeAgent = {
  id: string
  kind: WildlifeKind
  u: number
  v: number
  heading: number
  phase: number
  lift: number
  visible: number
}

export type WildlifeState = {
  agents: WildlifeAgent[]
  richness: number
  nextId: number
  tick: number
}

type ColonyLife = {
  hydro: HydroState
  succession: SuccessionState
  wildlife: WildlifeState
  dam: { locked: boolean; siteU: number; siteV: number }
  lodge: { locked: boolean; siteU: number; siteV: number }
  beavers: { u: number; v: number }[]
  season?: { winter: number; ice: number; vegetation: number }
  knobs?: { wildlife: number }
}

const CAP: Record<WildlifeKind, number> = {
  duck: 4,
  bird: 8,
  frog: 10,
  fish: 12,
  insect: 24,
}

function clamp(value: number, a: number, b: number) {
  return Math.min(b, Math.max(a, value))
}

function hash(id: string, salt: number) {
  let h = salt >>> 0
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

export function emptyWildlife(): WildlifeState {
  return { agents: [], richness: 0, nextId: 1, tick: 0 }
}

export function ensureWildlife(space: WildlifeState | undefined): WildlifeState {
  if (!space) return emptyWildlife()
  if (!space.agents) space.agents = []
  if (space.richness === undefined) space.richness = 0
  if (space.nextId === undefined) space.nextId = 1
  if (space.tick === undefined) space.tick = 0
  return space
}

export function wildlifeLabel(richness: number) {
  if (richness < 0.12) return 'Sparse'
  if (richness < 0.35) return 'Low'
  if (richness < 0.65) return 'Moderate'
  return 'High'
}

export function wildlifeStats(space: WildlifeState) {
  return {
    wetlandWildlife: wildlifeLabel(space.richness),
    wildlifeCount: space.agents.filter((a) => a.visible > 0.35).length,
  }
}

function habitatScore(hydro: HydroState, succession: SuccessionState, season?: ColonyLife['season']) {
  const e = hydro.effectiveness ?? 0
  const pond = Math.min(1, (hydro.pondArea ?? 0) / 6)
  const wet = Math.min(1, (succession.wetlandArea ?? 0) / 10)
  const marsh = Math.min(1, (succession.marshAge ?? 0) / 8)
  if (e < 0.06) return clamp(pond * 0.08, 0, 0.08)
  const winter = season?.winter ?? 0
  const ice = season?.ice ?? 0
  return clamp((e * 0.38 + pond * 0.32 + wet * 0.2 + marsh * 0.1) * (1 - winter * 0.55 - ice * 0.25), 0, 1)
}

function targets(score: number): Record<WildlifeKind, number> {
  return {
    duck: Math.min(CAP.duck, Math.floor(score * 4.2)),
    bird: Math.min(CAP.bird, Math.floor(score * 7.4)),
    frog: Math.min(CAP.frog, score < 0.18 ? 0 : Math.floor(score * 9)),
    fish: Math.min(CAP.fish, Math.floor(score * 11)),
    insect: Math.min(CAP.insect, Math.floor(score * 22)),
  }
}

function occupied(u: number, v: number, colony: ColonyLife) {
  if (colony.dam.locked && Math.hypot(u - colony.dam.siteU, v - colony.dam.siteV) < 0.024) return true
  if (colony.lodge.locked && Math.hypot(u - colony.lodge.siteU, v - colony.lodge.siteV) < 0.028) return true
  return false
}

function wetAt(field: HeightField, params: NoiseParams, hydro: HydroState, u: number, v: number) {
  const n = carveRiver(sampleHeightField(field, u, v), u, v, params.seaLevel)
  return isInundated(n, u, v, hydro, params.seaLevel)
}

function pickWet(
  field: HeightField,
  params: NoiseParams,
  colony: ColonyLife,
  salt: string,
  shore: boolean,
) {
  const hydro = colony.hydro
  const sea = params.seaLevel
  const spread = riverHalfWidth(sea) + (hydro.pondSpread ?? 0.02)
  for (let k = 0; k < 10; k += 1) {
    const u = 0.14 + hash(salt, k + 1) * 0.72
    const along = streamAlong(u, hydro)
    if (along > 0.04) continue
    const v = clamp(riverCenter(u) + (hash(salt, k + 3) - 0.5) * spread * 2.1, 0.08, 0.92)
    if (occupied(u, v, colony)) continue
    const wet = wetAt(field, params, hydro, u, v)
    if (shore) {
      const edge = wetAt(field, params, hydro, u, clamp(v + 0.012, 0.08, 0.92)) !== wet
      if (edge || (!wet && riverDistance(u, v) < spread + 0.02)) return { u, v }
    } else if (wet) return { u, v }
  }
  return null
}

function pickAir(colony: ColonyLife, salt: string) {
  const plants = colony.succession.plants
  if (plants.length > 4) {
    const p = plants[Math.floor(hash(salt, 4) * plants.length)]
    if (p && !occupied(p.u, p.v, colony)) return { u: p.u, v: p.v }
  }
  const u = 0.16 + hash(salt, 5) * 0.68
  const v = clamp(riverCenter(u) + (hash(salt, 6) - 0.5) * 0.08, 0.1, 0.9)
  if (occupied(u, v, colony)) return null
  return { u, v }
}

function makeAgent(kind: WildlifeKind, u: number, v: number, space: WildlifeState): WildlifeAgent {
  const id = `W-${kind}-${space.nextId}`
  space.nextId += 1
  return {
    id,
    kind,
    u,
    v,
    heading: hash(id, 2) * Math.PI * 2,
    phase: hash(id, 3) * Math.PI * 2,
    lift: kind === 'bird' ? 0.35 + hash(id, 4) * 0.4 : kind === 'insect' ? 0.45 + hash(id, 4) * 0.4 : 0,
    visible: 0.02,
  }
}

function nudgeFromBeavers(a: WildlifeAgent, colony: ColonyLife) {
  if (a.kind === 'insect' || a.kind === 'fish') return
  for (const b of colony.beavers) {
    const d = Math.hypot(a.u - b.u, a.v - b.v)
    if (d > 0.034 || d < 0.001) continue
    a.heading = Math.atan2(a.u - b.u, a.v - b.v)
    break
  }
}

function stepAgent(
  a: WildlifeAgent,
  field: HeightField,
  params: NoiseParams,
  colony: ColonyLife,
  dt: number,
) {
  const hydro = colony.hydro
  a.phase += dt * (a.kind === 'insect' ? 4.2 : a.kind === 'fish' ? 2.4 : 1.1)
  a.visible = clamp(a.visible + dt * 0.45, 0, 1)
  nudgeFromBeavers(a, colony)
  const turn = Math.sin(a.phase * (a.kind === 'duck' ? 0.7 : 1.3)) * 0.55
  if (a.kind === 'duck') {
    a.heading += turn * dt * 0.35
    const step = 0.008 * dt
    a.u = clamp(a.u + Math.sin(a.heading) * step, 0.12, 0.88)
    a.v = clamp(a.v + Math.cos(a.heading) * step, 0.1, 0.9)
    if (!wetAt(field, params, hydro, a.u, a.v)) {
      a.v += (riverCenter(a.u) - a.v) * 0.12
      a.heading += (hash(a.id, colony.wildlife.tick) - 0.5) * 0.4
    }
    a.lift = 0.02 + Math.sin(a.phase) * 0.008
    return
  }
  if (a.kind === 'fish') {
    a.heading += turn * dt * 1.1
    const step = 0.014 * dt
    a.u = clamp(a.u + Math.sin(a.heading) * step, 0.12, 0.88)
    a.v = clamp(a.v + Math.cos(a.heading) * step, 0.1, 0.9)
    if (!wetAt(field, params, hydro, a.u, a.v)) a.v += (riverCenter(a.u) - a.v) * 0.2
    a.lift = -0.04 - Math.abs(Math.sin(a.phase * 1.6)) * 0.02
    return
  }
  if (a.kind === 'frog') {
    if (Math.sin(a.phase) > 0.92) {
      a.u = clamp(a.u + Math.sin(a.heading) * dt * 0.03, 0.12, 0.88)
      a.v = clamp(a.v + Math.cos(a.heading) * dt * 0.03, 0.1, 0.9)
      a.lift = 0.04
    } else {
      a.lift *= 0.8
      if (hash(a.id, Math.floor(a.phase)) > 0.994) a.heading += (hash(a.id, 9) - 0.5) * 1.2
    }
    return
  }
  if (a.kind === 'bird') {
    const flying = Math.sin(a.phase * 0.35) > 0.55
    a.lift = flying ? 0.55 + Math.sin(a.phase * 3) * 0.08 : 0.22 + Math.sin(a.phase) * 0.02
    if (flying) {
      a.heading += turn * dt * 0.5
      a.u = clamp(a.u + Math.sin(a.heading) * dt * 0.02, 0.12, 0.88)
      a.v = clamp(a.v + Math.cos(a.heading) * dt * 0.02, 0.1, 0.9)
    }
    return
  }
  a.heading += dt * 0.7
  a.u = clamp(a.u + Math.sin(a.heading) * dt * 0.012, 0.12, 0.88)
  a.v = clamp(a.v + Math.cos(a.heading) * dt * 0.012, 0.1, 0.9)
  a.lift = 0.4 + Math.sin(a.phase * 2.2) * 0.12
}

export function stepWildlife(
  colony: ColonyLife,
  field: HeightField,
  params: NoiseParams,
  dt: number,
  visDt = dt,
) {
  const space = ensureWildlife(colony.wildlife)
  colony.wildlife = space
  const eco = Math.min(2, Math.max(0, dt))
  const vis = Math.min(0.05, Math.max(0, visDt))
  space.tick += 1
  const score = habitatScore(colony.hydro, colony.succession, colony.season) * (colony.knobs?.wildlife ?? 1)
  space.richness += (clamp(score, 0, 1) - space.richness) * (1 - Math.exp(-0.12 * eco))
  const want = targets(space.richness)

  const homeU = colony.lodge.siteU
  const homeV = colony.lodge.siteV
  for (const a of space.agents) {
    const far = Math.hypot(a.u - homeU, a.v - homeV) > 0.4
    if (far && space.tick % 3 !== 0) {
      a.phase += vis * 0.5
      continue
    }
    stepAgent(a, field, params, colony, vis * (far ? 3 : 1))
  }

  if (space.tick % 18 === 0) {
    for (const kind of Object.keys(want) as WildlifeKind[]) {
      const live = space.agents.filter((a) => a.kind === kind)
      if (live.length < want[kind]) {
        const at =
          kind === 'bird' || kind === 'insect'
            ? pickAir(colony, `${space.nextId}${kind}`)
            : pickWet(field, params, colony, `${space.nextId}${kind}`, kind === 'frog')
        if (at) space.agents.push(makeAgent(kind, at.u, at.v, space))
      } else if (live.length > want[kind]) {
        const extra = live[live.length - 1]
        extra.visible = Math.max(0, extra.visible - 0.35)
        if (extra.visible < 0.08) space.agents = space.agents.filter((a) => a.id !== extra.id)
      }
    }
  }
}
