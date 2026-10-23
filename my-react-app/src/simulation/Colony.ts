import { sampleHeightField, type HeightField } from '../heightField'
import type { NoiseParams } from '../perlin'
import type { BeaverAgent } from './Beaver'
import { emptyHydro, riverWayVersion, type HydroState, riverCenter, riverHalfWidth } from './Hydrology'
import { emptyDam, ensureDamSite, habitatDamScore, type DamState } from './Dam'
import { emptyLodge, ensureLodgeSite, lodgeHome, lodgeIsHome, type LodgeState } from './Lodge'
import { emptyReproduction, type ReproductionState } from './Population'
import { emptySeason, type SeasonState } from './Season'
import { emptySuccession, type SuccessionState } from './Succession'
import { emptyTerritory, type TerritoryState } from './Territory'
import { emptyForest, type ForestState } from './TreeResource'
import { emptyClock, type SimClock } from './SimulationEngine'
import { emptyWildlife, type WildlifeState } from './Wildlife'

export type ColonyKnobs = {
  activity: number
  breed: number
  vegetation: number
  snow: number
  flow: number
  water: number
  flood: number
  regen: number
  wildlife: number
}

export function emptyKnobs(): ColonyKnobs {
  return {
    activity: 1,
    breed: 1,
    vegetation: 1,
    snow: 1,
    flow: 1,
    water: 0,
    flood: 1,
    regen: 1,
    wildlife: 1,
  }
}

export function ensureKnobs(space: ColonyKnobs | undefined): ColonyKnobs {
  const next = space ?? emptyKnobs()
  if (next.activity === undefined) next.activity = 1
  if (next.breed === undefined) next.breed = 1
  if (next.vegetation === undefined) next.vegetation = 1
  if (next.snow === undefined) next.snow = 1
  if (next.flow === undefined) next.flow = 1
  if (next.water === undefined) next.water = 0
  if (next.flood === undefined) next.flood = 1
  if (next.regen === undefined) next.regen = 1
  if (next.wildlife === undefined) next.wildlife = 1
  return next
}

export type ColonyState = {
  home: { u: number; v: number }
  storage: { u: number; v: number }
  woodCollected: number
  beavers: BeaverAgent[]
  forest: ForestState
  dam: DamState
  hydro: HydroState
  lodge: LodgeState
  reproduction: ReproductionState
  territory: TerritoryState
  succession: SuccessionState
  wildlife: WildlifeState
  season: SeasonState
  clock: SimClock
  knobs: ColonyKnobs
  willDam: boolean
  willDamDecided: boolean
  landFitAt: number
}

export function colonyStorage(home: { u: number; v: number }) {
  return {
    u: Math.min(0.92, Math.max(0.08, home.u - 0.014)),
    v: Math.min(0.92, Math.max(0.08, home.v + 0.02)),
  }
}

export function colonyHome(seaLevel = 0.1, field?: HeightField | null) {
  const w = riverHalfWidth(seaLevel)
  if (!field) {
    const u = 0.46
    const c = riverCenter(u)
    return { u, v: Math.min(0.92, Math.max(0.08, c + (w + 0.022))) }
  }
  let bestU = 0.46
  let bestV = 0.5
  let best = Number.NEGATIVE_INFINITY
  for (let i = 0; i < 20; i += 1) {
    const u = 0.22 + i * 0.028
    const c = riverCenter(u)
    for (const side of [-1, 1]) {
      const v = Math.min(0.92, Math.max(0.08, c + side * (w + 0.024)))
      const n = sampleHeightField(field, u, v)
      if (n < seaLevel + 0.004) continue
      const e = 0.01
      const steep =
        Math.hypot(
          sampleHeightField(field, u + e, v) - sampleHeightField(field, u - e, v),
          sampleHeightField(field, u, v + e) - sampleHeightField(field, u, v - e),
        ) /
        (e * 2)
      if (steep > 6.5) continue
      const score = (n - seaLevel) * 0.55 - Math.abs(u - 0.48) * 0.7 - steep * 0.08
      if (score > best) {
        best = score
        bestU = u
        bestV = v
      }
    }
  }
  return { u: bestU, v: bestV }
}

/** Re-seat home, dam, and lodge when the land or waterway actually changes. */
export function fitColonyToLand(
  colony: ColonyState,
  field: HeightField,
  params: NoiseParams,
  force = false,
) {
  const way = riverWayVersion()
  if (colony.willDam === undefined) colony.willDam = true
  if (colony.willDamDecided === undefined) colony.willDamDecided = false
  if (colony.landFitAt === undefined) colony.landFitAt = -1
  if (!force && colony.landFitAt === way && colony.willDamDecided) {
    const home = lodgeIsHome(colony.lodge) ? lodgeHome(colony.lodge) : colony.home
    return { home, bank: colony.home, jump: 0 }
  }
  const bank = colonyHome(params.seaLevel, field)
  if (!colony.willDamDecided) {
    colony.willDam = habitatDamScore(field, params, bank) > 0.34
    colony.willDamDecided = true
  }
  if (colony.willDam) ensureDamSite(colony.dam, field, params, bank)
  ensureLodgeSite(colony.lodge, colony.dam, colony.hydro, params, bank, field)
  const home = lodgeIsHome(colony.lodge) ? lodgeHome(colony.lodge) : bank
  const prev = colony.home
  const jump = Math.hypot(home.u - (prev?.u ?? home.u), home.v - (prev?.v ?? home.v))
  colony.landFitAt = way
  return { home, bank, jump }
}

export function colonyHeadline(colony: ColonyState) {
  const s = colony.season
  const dam = colony.dam
  const kits = colony.beavers.filter((b) => b.lifeStage === 'kit').length
  const winter = s?.winter ?? 0
  const build = s?.build ?? 0
  const cache = s?.cache ?? 0
  const disperse = s?.disperse ?? 0
  if (winter > 0.55) return 'Winter rest in the lodge. Adults mate.'
  if ((s?.mate ?? 0) > 0.4) return 'Winter mating. Kits after about 106 days.'
  if (kits > 0) return `Kits in the colony (${kits}). Adults feed and maintain.`
  if (disperse > 0.4) return 'Spring: older young may leave along the waterway.'
  if (colony.willDamDecided && !colony.willDam) return 'Bank living: forage along the shore — this reach is a poor dam site.'
  if ((dam?.completion ?? 0) < 0.12 && build > 0.3) return 'Autumn: cutting wood and starting a dam.'
  if ((dam?.completion ?? 0) > 0 && (dam?.completion ?? 0) < 0.75) return 'Dam rising. Pond water begins to back up.'
  if (colony.lodge && colony.lodge.stage !== 'MATURE_LODGE' && colony.lodge.pieces.length > 0) {
    return 'Lodge growing in the pond. Wetland plants follow the new shoreline.'
  }
  if (cache > 0.4) return 'Food cache for winter. Dam and lodge held.'
  return `Colony of ${colony.beavers.length}. Pond and wetland change with the years.`
}

export function createFoundingColony(): ColonyState {
  const home = colonyHome()
  const male: BeaverAgent = {
    id: 'B-01',
    age: 4.6,
    sex: 'male',
    lifeStage: 'adult',
    energy: 0.82,
    hunger: 0.58,
    health: 0.92,
    mother: null,
    father: null,
    offspring: [],
    homeLodge: 'L-01',
    currentTask: 'EXPLORE_SHORE',
    targetTreeId: null,
    targetBranchId: null,
    position: { u: home.u - 0.018, v: home.v },
    u: home.u - 0.018,
    v: home.v,
    heading: 0.4,
    speed: 0,
    homeLocation: { ...home },
    partner: 'B-02',
    targetU: home.u - 0.05,
    targetV: home.v,
    taskAge: 0,
    carrying: false,
    carryGoal: null,
    status: 'resident',
    dispersalSign: 1,
    wet: 0.15,
  }
  const female: BeaverAgent = {
    id: 'B-02',
    age: 4.2,
    sex: 'female',
    lifeStage: 'adult',
    energy: 0.78,
    hunger: 0.64,
    health: 0.9,
    mother: null,
    father: null,
    offspring: [],
    homeLodge: 'L-01',
    currentTask: 'REST',
    targetTreeId: null,
    targetBranchId: null,
    position: { u: home.u + 0.012, v: home.v + 0.006 },
    u: home.u + 0.012,
    v: home.v + 0.006,
    heading: 3.4,
    speed: 0,
    homeLocation: { ...home },
    partner: 'B-01',
    targetU: home.u,
    targetV: home.v,
    taskAge: 0,
    carrying: false,
    carryGoal: null,
    status: 'resident',
    dispersalSign: 1,
    wet: 0.1,
  }
  return {
    home,
    storage: colonyStorage(home),
    woodCollected: 0,
    beavers: [male, female],
    forest: emptyForest(),
    dam: emptyDam(),
    hydro: emptyHydro(),
    lodge: emptyLodge(),
    reproduction: emptyReproduction(),
    territory: emptyTerritory(),
    succession: emptySuccession(),
    wildlife: emptyWildlife(),
    season: emptySeason(),
    clock: emptyClock(),
    knobs: emptyKnobs(),
    willDam: true,
    willDamDecided: false,
    landFitAt: -1,
  }
}
