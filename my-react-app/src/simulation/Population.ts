import type { BeaverAgent, LifeStage, Sex } from './Beaver'
import type { LodgeState } from './Lodge'
import type { SeasonState } from './Season'
import type { SimClock } from './SimulationEngine'
import { DAYS_PER_YEAR, SECONDS_PER_SIM_DAY, YEAR_RATE, yearFromDays } from './SimulationEngine'

export { YEAR_RATE }

type ColonyPop = {
  beavers: BeaverAgent[]
  home: { u: number; v: number }
  lodge: LodgeState
  reproduction: ReproductionState
  season?: SeasonState
  clock?: SimClock
  dam?: { pieces: unknown[] }
  forest?: { trees: { species: string; currentState: string; availability: boolean; ecoState?: string }[] }
}

export type ReproductionState = {
  simYears: number
  lastLitterAt: number
  pendingKits: number
  nextBirthIn: number
  nextId: number
  gestationLeft: number
}

export const GESTATION_DAYS = 106
export const NATAL_CAP = 8
export const TOTAL_CAP = 10
export const LITTER_GAP_YEARS = 0.88

export type ColonyCensus = {
  population: number
  adults: number
  subadults: number
  yearlings: number
  kits: number
}

function clamp(value: number, a: number, b: number) {
  return Math.min(b, Math.max(a, value))
}

function hash(id: string, salt: number) {
  let h = salt >>> 0
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

export function emptyReproduction(): ReproductionState {
  return {
    simYears: 0,
    lastLitterAt: -2,
    pendingKits: 0,
    nextBirthIn: 0,
    nextId: 3,
    gestationLeft: 0,
  }
}

export function stageForAge(age: number): LifeStage {
  if (age < 1) return 'kit'
  if (age < 2) return 'yearling'
  if (age < 3) return 'subadult'
  return 'adult'
}

export function rangeForStage(stage: LifeStage) {
  switch (stage) {
    case 'kit':
      return 0.03
    case 'yearling':
      return 0.08
    case 'subadult':
      return 0.15
    case 'adult':
      return 0.22
  }
}

export function roamFor(b: BeaverAgent) {
  if (b.age < 0.08) return 0.008
  if (b.age < 0.17) return 0.012
  let r = rangeForStage(b.lifeStage ?? 'adult')
  if (b.lifeStage === 'adult' && b.sex === 'female') r *= 0.72
  if (b.lifeStage === 'adult' && b.sex === 'male') r *= 1.12
  return r
}

export function stageSpeed(stage: LifeStage) {
  switch (stage) {
    case 'kit':
      return 0.42
    case 'yearling':
      return 0.68
    case 'subadult':
      return 0.88
    case 'adult':
      return 1
  }
}

export function stageScale(stage: LifeStage) {
  switch (stage) {
    case 'kit':
      return 0.44
    case 'yearling':
      return 0.64
    case 'subadult':
      return 0.84
    case 'adult':
      return 1
  }
}

export function canChew(b: BeaverAgent) {
  return b.lifeStage !== 'kit'
}

export function canBuild(b: BeaverAgent) {
  return b.lifeStage === 'adult' || b.lifeStage === 'subadult' || b.lifeStage === 'yearling'
}

export function colonyCensus(beavers: BeaverAgent[]): ColonyCensus {
  const census: ColonyCensus = { population: beavers.length, adults: 0, subadults: 0, yearlings: 0, kits: 0 }
  for (const b of beavers) {
    if (b.lifeStage === 'adult') census.adults += 1
    else if (b.lifeStage === 'subadult') census.subadults += 1
    else if (b.lifeStage === 'yearling') census.yearlings += 1
    else census.kits += 1
  }
  return census
}

export function normalizeBeaver(b: BeaverAgent, home: { u: number; v: number }, lodgeId: string) {
  if (!b.position) b.position = { u: b.u, v: b.v }
  if (b.mother === undefined) b.mother = null
  if (b.father === undefined) b.father = null
  if (b.partner === undefined) b.partner = null
  if (!b.offspring) b.offspring = []
  if (!b.homeLodge) b.homeLodge = lodgeId
  if (b.health === undefined) b.health = 0.9
  if (b.carryGoal === undefined) b.carryGoal = null
  if (b.status === undefined) b.status = 'resident'
  if (b.dispersalSign === undefined) b.dispersalSign = 1
  b.lifeStage = stageForAge(b.age)
  if (b.status === 'resident') {
    b.homeLocation = home
    b.homeLodge = lodgeId
  }
}

function nextBeaverId(repro: ReproductionState) {
  const id = `B-${String(repro.nextId).padStart(2, '0')}`
  repro.nextId += 1
  return id
}

function makeKit(
  colony: ColonyPop,
  mother: BeaverAgent,
  father: BeaverAgent,
  lodge: LodgeState,
): BeaverAgent {
  const id = nextBeaverId(colony.reproduction)
  const side = hash(id, 3) > 0.5 ? 1 : -1
  const sex: Sex = hash(id, 7) > 0.5 ? 'female' : 'male'
  const den =
    mother.status === 'settled' && mother.homeLocation
      ? mother.homeLocation
      : { u: lodge.siteU, v: lodge.siteV }
  const u = clamp(den.u + (hash(id, 11) - 0.5) * 0.012, 0.08, 0.92)
  const v = clamp(den.v + side * 0.006, 0.08, 0.92)
  mother.offspring = [...mother.offspring, id]
  father.offspring = [...father.offspring, id]
  return {
    id,
    age: 0.02 + hash(id, 13) * 0.04,
    sex,
    lifeStage: 'kit',
    energy: 0.72,
    hunger: 0.35,
    health: 0.88,
    mother: mother.id,
    father: father.id,
    partner: null,
    offspring: [],
    homeLodge: lodge.id ?? 'L-01',
    currentTask: 'REST',
    targetTreeId: null,
    targetBranchId: null,
    position: { u, v },
    u,
    v,
    heading: hash(id, 17) * Math.PI * 2,
    speed: 0,
    homeLocation: { u: den.u, v: den.v },
    targetU: u,
    targetV: v,
    taskAge: 0,
    carrying: false,
    carryGoal: null,
    status: mother.status === 'settled' ? 'settled' : 'resident',
    dispersalSign: 1,
    wet: 0.55,
  }
}

function denReady(lodge: LodgeState, dam?: { pieces: unknown[] }) {
  if (lodge.locked && lodge.pieces.length > 0) return true
  return (dam?.pieces.length ?? 0) >= 1
}

function pairLoners(beavers: BeaverAgent[]) {
  const singles = beavers.filter(
    (b) => (b.lifeStage === 'adult' || b.lifeStage === 'subadult') && b.age >= 2.2 && !b.partner,
  )
  for (const a of singles) {
    if (a.partner) continue
    let best: BeaverAgent | undefined
    let near = 0.14
    for (const o of singles) {
      if (o.id === a.id || o.sex === a.sex || o.partner) continue
      const d = Math.hypot(a.u - o.u, a.v - o.v)
      if (d < near) {
        near = d
        best = o
      }
    }
    if (!best) continue
    a.partner = best.id
    best.partner = a.id
  }
}

export function stepPopulation(colony: ColonyPop, simDt: number, visDt = simDt) {
  if (!colony.reproduction) colony.reproduction = emptyReproduction()
  const repro = colony.reproduction
  if (repro.gestationLeft === undefined) repro.gestationLeft = 0
  const lodge = colony.lodge
  const lodgeId = lodge.id ?? 'L-01'
  lodge.id = lodgeId
  const years = colony.clock ? yearFromDays(colony.clock.days) : repro.simYears + simDt * YEAR_RATE
  const yearDelta = simDt / (SECONDS_PER_SIM_DAY * DAYS_PER_YEAR)
  const simDays = simDt / SECONDS_PER_SIM_DAY
  repro.simYears = years

  for (const b of colony.beavers) {
    normalizeBeaver(b, colony.home, lodgeId)
    b.age += yearDelta
    b.lifeStage = stageForAge(b.age)
    const atDen = Math.hypot(b.u - colony.home.u, b.v - colony.home.v) < 0.024
    if (b.hunger > 0.82 || b.energy < 0.18) b.health = clamp(b.health - visDt * 0.012, 0.2, 1)
    else if (b.currentTask === 'REST' && atDen) b.health = clamp(b.health + visDt * 0.01, 0.2, 1)
    if (b.lifeStage === 'kit') {
      const carer = colony.beavers.find(
        (o) =>
          (o.id === b.mother || o.id === b.father) &&
          Math.hypot(b.u - o.u, b.v - o.v) < 0.045,
      )
      if (carer || atDen) b.hunger = clamp(b.hunger - visDt * 0.055, 0, 1)
    }
  }

  pairLoners(colony.beavers)

  const natal = colony.beavers.filter((b) => (b.status ?? 'resident') === 'resident')
  const kits = natal.filter((b) => b.lifeStage === 'kit' && b.age < 1).length
  let forage = 0
  if (colony.forest?.trees) {
    for (const tree of colony.forest.trees) {
      const eco = tree.ecoState ?? 'living'
      if (!tree.availability) continue
      if (tree.currentState !== 'HEALTHY' && tree.currentState !== 'GNAWED' && tree.currentState !== 'HEAVILY_GNAWED') continue
      if (eco !== 'living' && eco !== 'stressed') continue
      forage += tree.species === 'willow' || tree.species === 'aspen' || tree.species === 'poplar' ? 1 : 0.35
    }
  }
  const foodOk = forage >= 3 || natal.length <= 2
  const room = colony.beavers.length < TOTAL_CAP && natal.length < NATAL_CAP && foodOk

  if (repro.gestationLeft > 0 && repro.pendingKits > 0) {
    repro.gestationLeft -= simDays
    if (repro.gestationLeft > 0) return
    repro.nextBirthIn = 0.35
  }

  if (repro.pendingKits > 0 && repro.gestationLeft <= 0) {
    repro.nextBirthIn -= simDays
    if (repro.nextBirthIn <= 0) {
      const mother = colony.beavers.find(
        (b) =>
          b.lifeStage === 'adult' &&
          b.sex === 'female' &&
          b.partner &&
          ((b.status ?? 'resident') === 'resident' || (b.status ?? 'resident') === 'settled'),
      )
      const father = mother ? colony.beavers.find((b) => b.id === mother.partner) : undefined
      const den = denReady(lodge, colony.dam) || (mother?.status ?? 'resident') === 'settled'
      if (mother && father && den && room && kits < 5) {
        colony.beavers.push(makeKit(colony, mother, father, lodge))
        mother.energy = clamp(mother.energy - 0.08, 0.2, 1)
        mother.health = clamp(mother.health - 0.03, 0.2, 1)
        repro.pendingKits -= 1
        repro.nextBirthIn = 0.7 + hash(mother.id, repro.nextId) * 1.1
      } else if (!room || kits >= 5) {
        repro.pendingKits = 0
      }
    }
    return
  }

  if (!denReady(lodge, colony.dam) && !colony.beavers.some((b) => b.status === 'settled')) return
  if (!room) return
  if (repro.simYears - repro.lastLitterAt < LITTER_GAP_YEARS) return
  const wintering = (colony.season?.winter ?? 0) > 0.28
  const mating = (colony.season?.mate ?? 0) >= 0.18
  const overdue = repro.simYears - repro.lastLitterAt > 1.02
  if (!mating && !wintering && !overdue) return

  const mother = colony.beavers.find(
    (b) =>
      b.lifeStage === 'adult' &&
      b.sex === 'female' &&
      b.partner &&
      b.energy > 0.28 &&
      b.health > 0.42 &&
      ((b.status ?? 'resident') === 'resident' || b.status === 'settled'),
  )
  if (!mother) return
  const father = colony.beavers.find((b) => b.id === mother.partner && (b.lifeStage === 'adult' || b.lifeStage === 'subadult'))
  if (!father) return

  const firstLitter = repro.lastLitterAt < 0
  const roll = hash(mother.id, Math.floor(repro.simYears * 8))
  repro.lastLitterAt = repro.simYears
  repro.pendingKits = firstLitter
    ? 2 + (roll > 0.22 ? 1 : 0) + (roll > 0.62 ? 1 : 0)
    : 2 + (roll > 0.28 ? 1 : 0) + (roll > 0.7 ? 1 : 0)
  repro.gestationLeft = GESTATION_DAYS + (hash(mother.id, 19) - 0.5) * 10
  repro.nextBirthIn = 0
}
