import type { HeightField } from '../heightField'
import { sampleHeightField } from '../heightField'
import type { NoiseParams } from '../perlin'
import type { BeaverAgent, BeaverTask } from './Beaver'
import { canBuild, canChew, emptyReproduction, roamFor, stageSpeed, stepPopulation } from './Population'
import { emptySuccession, stepSuccession } from './Succession'
import { applySeasonKnobs, emptySeason, stepSeasonFromDays } from './Season'
import { emptyClock, ensureClock } from './SimulationEngine'
import { emptyWildlife, stepWildlife } from './Wildlife'
import {
  beginDispersal,
  canDisperse,
  emptyTerritory,
  kindForSite,
  recordTrail,
  scoreProspect,
  searchProspect,
  settleBeaver,
  stepTrails,
  trailSteer,
} from './Territory'
import { colonyStorage, ensureKnobs, fitColonyToLand, type ColonyState } from './Colony'
import { ensureHistory, recordTimeline } from './Timeline'
import {
  damWorkSlot,
  emptyDam,
  maintainDam,
  placeBranchOnDam,
} from './Dam'
import {
  emptyLodge,
  lodgeApproach,
  lodgeReady,
  maintainLodge,
  placeBranchOnLodge,
} from './Lodge'
import {
  carveRiver,
  defaultHydro,
  emptyHydro,
  isInundated,
  localWaterN,
  riverCenter,
  riverDistance,
  stepHydrology,
  type HydroState,
} from './Hydrology'
import {
  approachBranch,
  approachPoint,
  chewTree,
  emptyForest,
  findBranch,
  findTree,
  indexForest,
  isBranchBuildable,
  isTreeValidTarget,
  pickBuildingBranch,
  pickPreferredTree,
  stepForest,
  syncForest,
  type BranchResource,
  type TreeSeed,
} from './TreeResource'

export type BeaverWorld = {
  params: NoiseParams
  field: HeightField
  seedTrees: TreeSeed[]
  hydro?: HydroState
}

function clamp(value: number, a: number, b: number) {
  return Math.min(b, Math.max(a, value))
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function wrapAngle(a: number) {
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

function dist(a: BeaverAgent, u: number, v: number) {
  return Math.hypot(a.u - u, a.v - v)
}

function hash(id: string, salt: number) {
  let h = salt >>> 0
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

export function sampleBeaverGround(world: BeaverWorld, u: number, v: number) {
  const sea = world.params.seaLevel
  const n = carveRiver(sampleHeightField(world.field, u, v), u, v, sea)
  const hydro = world.hydro ?? defaultHydro
  const water = localWaterN(u, v, hydro, sea)
  const inRiver = isInundated(n, u, v, hydro, sea)
  return { n, inRiver, water }
}

function slope(world: BeaverWorld, u: number, v: number) {
  const e = 0.012
  const a = sampleBeaverGround(world, u - e, v).n
  const b = sampleBeaverGround(world, u + e, v).n
  const c = sampleBeaverGround(world, u, v - e).n
  const d = sampleBeaverGround(world, u, v + e).n
  return Math.hypot(b - a, d - c) / (e * 2)
}

function walkable(world: BeaverWorld, u: number, v: number, loose = false) {
  if (u < 0.04 || u > 0.96 || v < 0.04 || v > 0.96) return false
  const steep = slope(world, u, v)
  if (steep > (loose ? 26 : 11.5)) return false
  const g = sampleBeaverGround(world, u, v)
  const sea = world.params.seaLevel
  if (g.n < sea - 0.035 && !g.inRiver) return false
  if (g.n > 0.55 && steep > (loose ? 8 : 5.5)) return false
  return true
}

function landJob(task: BeaverTask) {
  return task === 'MOVE_TO_TREE' || task === 'CHEW_TREE' || task === 'COLLECT_BRANCH' || task === 'MOVE_TO_BRANCH'
}

function denSlot(b: BeaverAgent, home: { u: number; v: number }) {
  const a = hash(b.id, 2) * Math.PI * 2
  const r = 0.01 + hash(b.id, 4) * 0.018
  return {
    u: clamp(home.u + Math.sin(a) * r, 0.06, 0.94),
    v: clamp(home.v + Math.cos(a) * r, 0.06, 0.94),
  }
}

function minSep(a: BeaverAgent, b: BeaverAgent) {
  if (a.lifeStage === 'kit' || b.lifeStage === 'kit') return 0.012
  return 0.02
}

function separateBeavers(colony: ColonyState, world: BeaverWorld) {
  const list = colony.beavers
  for (let pass = 0; pass < 2; pass += 1) {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i]
        const b = list[j]
        let du = a.u - b.u
        let dv = a.v - b.v
        let d = Math.hypot(du, dv)
        const need = minSep(a, b)
        if (d < 0.00015) {
          du = 0.01
          dv = 0.006 * (i % 2 === 0 ? 1 : -1)
          d = Math.hypot(du, dv)
        }
        if (d >= need) continue
        const nx = du / d
        const ny = dv / d
        const push = (need - d) * 0.52
        const au = clamp(a.u + nx * push, 0.05, 0.95)
        const av = clamp(a.v + ny * push, 0.05, 0.95)
        const bu = clamp(b.u - nx * push, 0.05, 0.95)
        const bv = clamp(b.v - ny * push, 0.05, 0.95)
        if (walkable(world, au, av, true)) {
          a.u = au
          a.v = av
        }
        if (walkable(world, bu, bv, true)) {
          b.u = bu
          b.v = bv
        }
        if (a.position) {
          a.position.u = a.u
          a.position.v = a.v
        }
        if (b.position) {
          b.position.u = b.u
          b.position.v = b.v
        }
      }
    }
  }
}

function recoverBeaver(b: BeaverAgent, world: BeaverWorld, den: { u: number; v: number }) {
  if (landJob(b.currentTask) || b.carrying || b.currentTask === 'CHEW_TREE') return
  if (walkable(world, b.u, b.v, true)) return
  const c = riverCenter(b.u)
  const tries = [
    { u: b.u, v: clamp(b.v + Math.sign(c - b.v) * 0.02, 0.06, 0.94) },
    { u: clamp(lerp(b.u, den.u, 0.35), 0.06, 0.94), v: clamp(lerp(b.v, den.v, 0.35), 0.06, 0.94) },
    den,
  ]
  for (const t of tries) {
    if (walkable(world, t.u, t.v)) {
      b.u = t.u
      b.v = t.v
      if (b.position) {
        b.position.u = t.u
        b.position.v = t.v
      }
      return
    }
  }
  b.u = den.u
  b.v = den.v
  if (b.position) {
    b.position.u = den.u
    b.position.v = den.v
  }
}

function shorePoint(along: number, side: number) {
  const u = clamp(along, 0.1, 0.9)
  const v = riverCenter(u) + side * (0.05 + Math.abs(Math.sin(along * 9)) * 0.014)
  return { u, v: clamp(v, 0.08, 0.92) }
}

function pickShore(b: BeaverAgent, salt: number) {
  const span = Math.min(roamFor(b), b.sex === 'male' ? 0.2 : 0.13)
  const along = b.homeLocation.u + (hash(b.id, salt) - 0.5) * span
  const side = hash(b.id, salt + 3) > 0.5 ? 1 : -1
  return shorePoint(along, side)
}

function pickSwim(b: BeaverAgent, salt: number) {
  const along = b.u + (hash(b.id, salt) - 0.5) * Math.min(0.14, roamFor(b) * 1.1)
  const u = clamp(along, 0.12, 0.88)
  return { u, v: riverCenter(u) + (hash(b.id, salt + 1) - 0.5) * 0.012 }
}

function pickPatrol(b: BeaverAgent, salt: number) {
  const span = roamFor(b)
  const along = b.homeLocation.u + (hash(b.id, salt) - 0.5) * span * 1.35
  const u = clamp(along, 0.12, 0.88)
  const side = hash(b.id, salt + 2) > 0.5 ? 1 : -1
  return { u, v: clamp(riverCenter(u) + side * 0.03, 0.08, 0.92) }
}

function dayFrac(days: number) {
  return ((days % 1) + 1) % 1
}

function phaseBump(t: number, center: number, width: number) {
  const d = Math.min(Math.abs(t - center), 1 - Math.abs(t - center))
  const x = clamp(1 - d / width, 0, 1)
  return x * x * (3 - 2 * x)
}

/** Nocturnal and crepuscular; winter bouts drift off the 24-hour clock. */
function nightActive(days: number, winter: number, id: string, speed = 1) {
  if (speed >= 20) return 0.82
  const t = dayFrac(days)
  const dusk = phaseBump(t, 0.8, 0.15)
  const dawn = phaseBump(t, 0.22, 0.12)
  const night = t > 0.72 || t < 0.28 ? 0.88 : 0.1
  let a = clamp(dusk * 1.05 + dawn * 0.95 + night * 0.8, 0, 1)
  if (winter > 0.5) a = clamp(0.4 + a * 0.38, 0.3, 0.84)
  return clamp(a * (0.84 + hash(id, 41) * 0.28), 0, 1)
}

function viaWater(
  from: { u: number; v: number },
  dest: { u: number; v: number },
  world: BeaverWorld,
) {
  const here = sampleBeaverGround(world, from.u, from.v)
  const land = Math.hypot(dest.u - from.u, dest.v - from.v)
  const toWater = riverDistance(from.u, from.v)
  const along = Math.abs(dest.u - from.u)
  if (!here.inRiver && toWater > 0.022 && land > 0.04 && along > 0.05 && toWater < land * 0.65) {
    return { u: clamp(from.u, 0.1, 0.9), v: clamp(riverCenter(from.u), 0.08, 0.92) }
  }
  if ((here.inRiver || toWater < 0.018) && along > 0.028) {
    const u = clamp(from.u + Math.sign(dest.u - from.u) * Math.min(along, 0.16), 0.1, 0.9)
    return { u, v: clamp(riverCenter(u), 0.08, 0.92) }
  }
  return dest
}

function lodgeDoor(colony: ColonyState) {
  const lodge = colony.lodge
  if (lodge.locked && lodge.entranceSubmerged) {
    return { u: lodge.entranceU, v: lodge.entranceV }
  }
  return {
    u: colony.home.u,
    v: clamp(riverCenter(colony.home.u), 0.08, 0.92),
  }
}

function sendHome(b: BeaverAgent, colony: ColonyState, world: BeaverWorld) {
  const door = lodgeDoor(colony)
  const den = b.homeLocation
  if (dist(b, den.u, den.v) < 0.016) {
    setTask(b, 'REST', den.u, den.v)
    return
  }
  if (dist(b, door.u, door.v) < 0.018) {
    setTask(b, 'RETURN_HOME', den.u, den.v)
    return
  }
  const dest = viaWater(b, door, world)
  setTask(b, 'RETURN_HOME', dest.u, dest.v)
}

function committedTree(b: BeaverAgent, colony: ColonyState) {
  const tree = findTree(colony.forest, b.targetTreeId)
  if (tree && isTreeValidTarget(tree)) return tree
  if (tree && tree.chewProgress >= 1) return tree
  b.targetTreeId = null
  return undefined
}

function assignTree(b: BeaverAgent, colony: ColonyState, world: BeaverWorld) {
  const held = committedTree(b, colony)
  if (held && isTreeValidTarget(held)) {
    if (b.currentTask !== 'MOVE_TO_TREE' && b.currentTask !== 'CHEW_TREE') {
      const p = approachPoint(held, { u: b.u, v: b.v })
      setTask(b, 'MOVE_TO_TREE', p.u, p.v)
    }
    return true
  }
  const next = pickPreferredTree(colony.forest, { u: b.u, v: b.v })
  if (!next) {
    b.targetTreeId = null
    return false
  }
  b.targetTreeId = next.id
  const p = approachPoint(next, { u: b.u, v: b.v })
  setTask(b, 'MOVE_TO_TREE', p.u, p.v)
  return true
}

function setTask(b: BeaverAgent, task: BeaverTask, u: number, v: number) {
  if (b.currentTask === task) {
    if (
      task === 'MOVE_TO_TREE' ||
      task === 'CHEW_TREE' ||
      task === 'MOVE_TO_BRANCH' ||
      task === 'PICK_UP_BRANCH' ||
      task === 'COLLECT_BRANCH' ||
      task === 'BUILD_DAM' ||
      task === 'BUILD_LODGE' ||
      task === 'SEARCH_HABITAT' ||
      task === 'EVALUATE_SITE'
    ) {
      return
    }
    b.targetU = u
    b.targetV = v
    if (
      task === 'RETURN_HOME' ||
      task === 'REST' ||
      task === 'CARRY_TO_STORAGE' ||
      task === 'TRANSPORT_BRANCH' ||
      task === 'DAM_MAINTENANCE' ||
      task === 'LODGE_MAINTENANCE'
    ) {
      return
    }
  }
  b.currentTask = task
  b.targetU = u
  b.targetV = v
  b.taskAge = 0
}

function committedBranch(b: BeaverAgent, colony: ColonyState) {
  const branch = findBranch(colony.forest, b.targetBranchId)
  if (branch && (isBranchBuildable(branch) || branch.carriedBy === b.id)) return branch
  b.targetBranchId = null
  return undefined
}

function assignBuilding(b: BeaverAgent, colony: ColonyState) {
  const held = committedBranch(b, colony)
  if (held && isBranchBuildable(held) && held.carriedBy !== b.id) {
    if (b.currentTask !== 'COLLECT_BRANCH' && b.currentTask !== 'PICK_UP_BRANCH') {
      const p = approachBranch(held, { u: b.u, v: b.v })
      setTask(b, 'COLLECT_BRANCH', p.u, p.v)
    }
    return true
  }
  const next = pickBuildingBranch(colony.forest, { u: b.u, v: b.v })
  if (!next) {
    b.targetBranchId = null
    return false
  }
  b.targetBranchId = next.id
  const p = approachBranch(next, { u: b.u, v: b.v })
  setTask(b, 'COLLECT_BRANCH', p.u, p.v)
  return true
}

function pickupBranch(b: BeaverAgent, branch: BranchResource) {
  branch.carriedBy = b.id
  branch.availability = false
  branch.stored = false
  b.carrying = true
  b.targetBranchId = branch.id
  b.hunger = clamp(b.hunger - branch.foodAmount * 0.15, 0, 1)
}

function chooseCarryGoal(b: BeaverAgent, colony: ColonyState): 'dam' | 'lodge' | 'cache' {
  const cache = colony.season?.cache ?? 0
  const build = colony.season?.build ?? 1
  if (!colony.willDam) return cache > 0.4 ? 'cache' : 'lodge'
  if (
    colony.dam.pieces.length >= 4 &&
    colony.lodge.locked &&
    colony.lodge.stage !== 'MATURE_LODGE' &&
    colony.lodge.pieces.length < 10 &&
    hash(b.id, 25) > 0.48
  ) {
    return 'lodge'
  }
  if (colony.dam.completion < 0.82 && build > 0.16) {
    if (colony.dam.pieces.length < 8) return 'dam'
    if (b.lifeStage !== 'kit' && hash(b.id, 21) < 0.78) return 'dam'
  }
  if (colony.dam.completion >= 0.82) {
    if (cache > 0.4) return 'cache'
    if (colony.lodge.stage !== 'MATURE_LODGE') return 'lodge'
    return hash(b.id, 23) > 0.5 ? 'cache' : 'lodge'
  }
  if (cache > 0.55 && hash(b.id, 22) < cache * 0.4) return 'cache'
  if (!lodgeReady(colony.lodge, colony.dam, colony.hydro) || !colony.lodge.locked) return 'dam'
  const behind = colony.lodge.materialAmount < colony.dam.materialAmount * 0.68
  if (b.sex === 'female' && colony.lodge.stage !== 'MATURE_LODGE' && behind) return 'lodge'
  return 'dam'
}

function haulSite(colony: ColonyState, goal: 'dam' | 'lodge' | 'cache' | null, beaverId = 'approach') {
  if (goal === 'cache') return colony.storage
  if (goal === 'lodge' && colony.lodge.locked) return lodgeApproach(colony.lodge)
  return damWorkSlot(colony.dam, beaverId, 3)
}

function haulDest(b: BeaverAgent, world: BeaverWorld, colony: ColonyState) {
  if (!b.carrying || !b.carryGoal) b.carryGoal = chooseCarryGoal(b, colony)
  const goal = b.carryGoal ?? chooseCarryGoal(b, colony)
  b.carryGoal = goal
  return carryDestination(b, world, haulSite(colony, goal, b.id))
}

function damBusy(colony: ColonyState) {
  return colony.willDam && colony.dam.completion < 0.82 && (colony.season?.build ?? 1) > 0.16
}

function carryDestination(b: BeaverAgent, world: BeaverWorld, storage: { u: number; v: number }) {
  return viaWater(b, storage, world)
}

function chooseTask(
  b: BeaverAgent,
  world: BeaverWorld,
  colony: ColonyState,
  partner: BeaverAgent | undefined,
  salt: number,
) {
  const homeD = dist(b, b.homeLocation.u, b.homeLocation.v)
  const roam = roamFor(b)
  const season = colony.season
  const winter = season?.winter ?? 0
  const active = nightActive(colony.clock?.days ?? 0, winter, b.id, colony.clock?.speed ?? 1)
  const resident = (b.status ?? 'resident') === 'resident'

  if (b.carrying) {
    const dest = haulDest(b, world, colony)
    setTask(b, b.carryGoal === 'cache' ? 'CARRY_TO_STORAGE' : 'TRANSPORT_BRANCH', dest.u, dest.v)
    return
  }
  if (b.age < 0.17 && resident) {
    sendHome(b, colony, world)
    return
  }
  if (
    resident &&
    active < 0.38 &&
    !b.carrying &&
    !(damBusy(colony) && canBuild(b)) &&
    b.currentTask !== 'CHEW_TREE' &&
    b.currentTask !== 'MOVE_TO_TREE' &&
    b.currentTask !== 'BUILD_DAM' &&
    b.currentTask !== 'DAM_MAINTENANCE'
  ) {
    sendHome(b, colony, world)
    return
  }
  if (resident && winter > 0.55 && (season?.ice ?? 0) > 0.45 && b.hunger < 0.58 && active < 0.62) {
    sendHome(b, colony, world)
    return
  }
  if (b.energy < 0.3) {
    setTask(b, 'REST', b.u, b.v)
    return
  }
  if ((b.status ?? 'resident') === 'dispersing') {
    if ((b.u < 0.14 && (b.dispersalSign || 1) < 0) || (b.u > 0.86 && (b.dispersalSign || 1) > 0)) {
      b.dispersalSign = -(b.dispersalSign || 1)
    }
    const found = searchProspect({ u: b.u, v: b.v }, b.dispersalSign || 1, colony, world.field, world.params)
    if (found) {
      setTask(b, 'EVALUATE_SITE', found.u, found.v)
      return
    }
    const u = clamp(b.u + (b.dispersalSign || 1) * 0.07, 0.12, 0.88)
    setTask(b, 'DISPERSE_ALONG_WATER', u, riverCenter(u))
    return
  }
  if ((b.status ?? 'resident') === 'settled') {
    if (homeD > 0.09) {
      sendHome(b, colony, world)
      return
    }
    if (canChew(b) && b.hunger > 0.62) {
      if (!assignTree(b, colony, world)) setTask(b, 'REST', b.homeLocation.u, b.homeLocation.v)
      return
    }
    const p = pickShore(b, salt)
    setTask(b, hash(b.id, salt) > 0.45 ? 'SWIM' : 'EXPLORE_SHORE', p.u, p.v)
    return
  }
  if (canDisperse(b, colony)) {
    beginDispersal(b, colony)
    const u = clamp(b.u + b.dispersalSign * 0.055, 0.12, 0.88)
    setTask(b, 'DISPERSE_ALONG_WATER', u, riverCenter(u))
    return
  }
  if (homeD > roam) {
    sendHome(b, colony, world)
    return
  }
  if (b.lifeStage === 'kit') {
    const parent = colony.beavers.find((o) => o.id === b.mother || o.id === b.father)
    if (parent && dist(b, parent.u, parent.v) > 0.02 && homeD < roam) {
      const follow = viaWater(b, { u: parent.u, v: parent.v }, world)
      setTask(b, parent.currentTask === 'SWIM' ? 'SWIM' : 'EXPLORE_SHORE', follow.u, follow.v)
      return
    }
    if (b.hunger > 0.5 || hash(b.id, salt) > 0.48) {
      sendHome(b, colony, world)
      return
    }
    const p = pickSwim(b, salt)
    setTask(b, 'SWIM', p.u, p.v)
    return
  }
  const hasKits = b.offspring?.some((id) => colony.beavers.some((o) => o.id === id && o.lifeStage === 'kit'))
  if (resident && b.lifeStage === 'adult' && b.sex === 'female' && hasKits && homeD > 0.055) {
    sendHome(b, colony, world)
    return
  }
  const repro = colony.reproduction
  const expecting = (repro?.gestationLeft ?? 0) > 0 && (repro?.gestationLeft ?? 99) < 28
  const denTime =
    (season?.mate ?? 0) > 0.4 || expecting || (season?.breed ?? 0) > 0.42
  if (
    denTime &&
    b.lifeStage === 'adult' &&
    resident &&
    homeD > 0.04 &&
    (b.sex === 'female' || (season?.mate ?? 0) > 0.48)
  ) {
    sendHome(b, colony, world)
    return
  }
  if (resident && canBuild(b) && damBusy(colony)) {
    b.carryGoal = 'dam'
    if (pickBuildingBranch(colony.forest, { u: b.u, v: b.v }, 0.28)) {
      setTask(b, 'FIND_BUILDING_MATERIAL', b.u, b.v)
      return
    }
    if (canChew(b) && assignTree(b, colony, world)) return
  }
  if (
    resident &&
    canBuild(b) &&
    (season?.build ?? 1) > 0.22 &&
    (colony.lodge.stage !== 'MATURE_LODGE' && colony.lodge.locked) &&
    pickBuildingBranch(colony.forest, { u: b.u, v: b.v }, 0.24)
  ) {
    setTask(b, 'FIND_BUILDING_MATERIAL', b.u, b.v)
    return
  }
  const herb = (season?.green ?? 0) * 0.55 + (season?.vegetation ?? 0) * 0.45
  const woody = (season?.cache ?? 0) * 0.55 + (season?.feed ?? 0) * 0.45 + winter * 0.2
  if (
    canChew(b) &&
    b.hunger > (woody > 0.45 ? 0.48 : 0.78 - herb * 0.22) &&
    b.currentTask !== 'MOVE_TO_TREE' &&
    b.currentTask !== 'CHEW_TREE' &&
    b.currentTask !== 'FIND_TREE'
  ) {
    if (!assignTree(b, colony, world)) setTask(b, 'FIND_TREE', b.u, b.v)
    return
  }
  if (winter > 0.4 && b.hunger > 0.42 && colony.storage) {
    const cache = viaWater(b, colony.storage, world)
    setTask(b, 'SWIM', cache.u, cache.v)
    return
  }
  if (
    colony.lodge.locked &&
    colony.lodge.pieces.length > 0 &&
    colony.lodge.stage !== 'MATURE_LODGE' &&
    canBuild(b) &&
    (season?.build ?? 1) > 0.16 &&
    b.hunger < 0.68 &&
    b.energy > 0.42 &&
    (b.sex === 'female' || hash(b.id, salt) > 0.4)
  ) {
    const site = lodgeApproach(colony.lodge)
    setTask(b, 'LODGE_MAINTENANCE', site.u, site.v)
    return
  }
  if (
    colony.willDam &&
    canBuild(b) &&
    (season?.build ?? 1) > 0.2 &&
    colony.dam.pieces.length > 0 &&
    colony.dam.completion < 0.82 &&
    b.hunger < 0.7 &&
    b.energy > 0.42
  ) {
    const site = damWorkSlot(colony.dam, b.id, 5)
    setTask(b, 'DAM_MAINTENANCE', site.u, site.v)
    return
  }
  if (resident && b.lifeStage === 'adult' && b.sex === 'male' && hash(b.id, salt) > 0.55) {
    const p = pickPatrol(b, salt)
    setTask(b, 'EXPLORE_SHORE', p.u, p.v)
    return
  }
  if (herb > 0.45 && hash(b.id, salt) > 0.4) {
    const p = pickSwim(b, salt)
    setTask(b, 'SWIM', p.u, p.v)
    return
  }
  if (hasKits && homeD > 0.07 && b.energy < 0.64) {
    sendHome(b, colony, world)
    return
  }
  if (partner && partner.currentTask === 'REST' && homeD > 0.09 && b.energy < 0.58) {
    sendHome(b, colony, world)
    return
  }

  if (b.currentTask === 'REST' || b.currentTask === 'RETURN_HOME' || b.currentTask === 'CHEW_TREE') {
    if (hash(b.id, salt) > 0.38) {
      const p = pickSwim(b, salt)
      setTask(b, 'SWIM', p.u, p.v)
    } else {
      const p = pickShore(b, salt)
      setTask(b, 'EXPLORE_SHORE', p.u, p.v)
    }
    return
  }
  if (b.currentTask === 'EXPLORE_SHORE') {
    const p = pickSwim(b, salt)
    setTask(b, 'SWIM', p.u, p.v)
    return
  }
  if (b.currentTask === 'SWIM') {
    if (b.hunger > 0.4 && canChew(b)) {
      if (!assignTree(b, colony, world)) setTask(b, 'FIND_TREE', b.u, b.v)
    } else {
      const p = pickShore(b, salt + 5)
      setTask(b, 'EXPLORE_SHORE', p.u, p.v)
    }
    return
  }
  sendHome(b, colony, world)
}

function arrive(b: BeaverAgent, world: BeaverWorld, colony: ColonyState, partner: BeaverAgent | undefined, salt: number) {
  const atHome = dist(b, b.homeLocation.u, b.homeLocation.v) < 0.016
  switch (b.currentTask) {
    case 'REST': {
      const wait =
        (b.lifeStage === 'kit' ? 14 : 7) +
        hash(b.id, 11) * 5 +
        (nightActive(colony.clock?.days ?? 0, colony.season?.winter ?? 0, b.id, colony.clock?.speed ?? 1) < 0.38 ? 16 : 0)
      if (b.taskAge > wait) chooseTask(b, world, colony, partner, salt)
      break
    }
    case 'EXPLORE_SHORE':
    case 'SWIM':
      chooseTask(b, world, colony, partner, salt + 1)
      break
    case 'FIND_TREE':
      if (!assignTree(b, colony, world)) {
        const p = pickShore(b, salt)
        setTask(b, 'EXPLORE_SHORE', p.u, p.v)
      }
      break
    case 'MOVE_TO_TREE': {
      const tree = committedTree(b, colony)
      if (!tree || !isTreeValidTarget(tree)) {
        b.targetTreeId = null
        if (!assignTree(b, colony, world)) setTask(b, 'RETURN_HOME', b.homeLocation.u, b.homeLocation.v)
      } else if (dist(b, tree.position.u, tree.position.v) < 0.028) {
        setTask(b, 'CHEW_TREE', b.u, b.v)
      }
      break
    }
    case 'FIND_BRANCH':
    case 'FIND_BUILDING_MATERIAL':
      if (!assignBuilding(b, colony) && b.taskAge > 2.4) {
        const p = pickShore(b, salt)
        setTask(b, 'EXPLORE_SHORE', p.u, p.v)
      }
      break
    case 'MOVE_TO_BRANCH':
    case 'COLLECT_BRANCH': {
      const branch = committedBranch(b, colony)
      if (!branch || !isBranchBuildable(branch)) {
        b.targetBranchId = null
        if (!assignBuilding(b, colony)) setTask(b, 'RETURN_HOME', b.homeLocation.u, b.homeLocation.v)
      } else if (b.taskAge > 0.35) {
        pickupBranch(b, branch)
        const dest = haulDest(b, world, colony)
        setTask(b, 'TRANSPORT_BRANCH', dest.u, dest.v)
      }
      break
    }
    case 'CARRY_TO_STORAGE':
    case 'TRANSPORT_BRANCH': {
      const site = haulSite(colony, b.carryGoal, b.id)
      if (Math.hypot(b.u - site.u, b.v - site.v) < 0.016) {
        if (b.carryGoal === 'cache') {
          const br = committedBranch(b, colony)
          if (br && br.carriedBy === b.id) {
            br.stored = true
            br.carriedBy = null
            br.u = site.u
            br.v = site.v
            br.position.u = site.u
            br.position.v = site.v
          }
          b.carrying = false
          b.targetBranchId = null
          b.carryGoal = null
          setTask(b, 'REST', site.u, site.v)
        } else {
          setTask(b, b.carryGoal === 'lodge' ? 'BUILD_LODGE' : 'BUILD_DAM', site.u, site.v)
        }
      }
      break
    }
    case 'DAM_MAINTENANCE':
      if (b.taskAge > 2.2) {
        maintainDam(colony.dam, world.field, world.params, b.id, { u: b.u, v: b.v })
        b.energy = clamp(b.energy - 0.04, 0.05, 1)
        b.carryGoal = damBusy(colony) ? 'dam' : b.carryGoal
        if (!assignBuilding(b, colony)) {
          if (damBusy(colony) && assignTree(b, colony, world)) break
          const p = pickShore(b, salt)
          setTask(b, 'EXPLORE_SHORE', p.u, p.v)
        }
      }
      break
    case 'LODGE_MAINTENANCE':
      if (b.taskAge > 0.9) {
        maintainLodge(colony.lodge, b.id)
        b.energy = clamp(b.energy - 0.04, 0.05, 1)
        if (!assignBuilding(b, colony)) {
          const p = pickShore(b, salt)
          setTask(b, 'EXPLORE_SHORE', p.u, p.v)
        }
      }
      break
    case 'RETURN_HOME':
      if (atHome) setTask(b, 'REST', b.homeLocation.u, b.homeLocation.v)
      else sendHome(b, colony, world)
      break
    case 'DISPERSE_ALONG_WATER':
      setTask(b, 'SEARCH_HABITAT', b.u, b.v)
      break
    case 'SEARCH_HABITAT': {
      const found = searchProspect({ u: b.u, v: b.v }, b.dispersalSign || 1, colony, world.field, world.params)
      if (found) setTask(b, 'EVALUATE_SITE', found.u, found.v)
      else {
        const u = clamp(b.u + (b.dispersalSign || 1) * 0.07, 0.12, 0.88)
        setTask(b, 'DISPERSE_ALONG_WATER', u, riverCenter(u))
      }
      break
    }
    case 'EVALUATE_SITE':
      if (b.taskAge > 1.3) {
        const score = scoreProspect(b.u, b.v, colony, world.field, world.params)
        if (score > 1.55) {
          settleBeaver(
            b,
            { u: b.u, v: b.v, score, kind: kindForSite(b.u, b.v, world.params), claimedBy: null },
            colony.territory,
          )
          setTask(b, 'REST', b.u, b.v)
        } else {
          const u = clamp(b.u + (b.dispersalSign || 1) * 0.06, 0.12, 0.88)
          setTask(b, 'DISPERSE_ALONG_WATER', u, riverCenter(u))
        }
      }
      break
  }
}

function tryStep(world: BeaverWorld, u: number, v: number, loose = false) {
  if (!loose) return walkable(world, u, v, false)
  if (u < 0.04 || u > 0.96 || v < 0.04 || v > 0.96) return false
  const g = sampleBeaverGround(world, u, v)
  if (g.inRiver) return true
  return g.n < 0.52
}

export function stepColony(colony: ColonyState, world: BeaverWorld, simDt: number, motionDt = simDt) {
  if (!colony.forest) colony.forest = emptyForest()
  if (!colony.dam) colony.dam = emptyDam()
  if (!colony.hydro) colony.hydro = emptyHydro()
  if (!colony.lodge) colony.lodge = emptyLodge()
  if (!colony.reproduction) colony.reproduction = emptyReproduction()
  if (!colony.territory) colony.territory = emptyTerritory()
  if (!colony.succession) colony.succession = emptySuccession()
  if (!colony.wildlife) colony.wildlife = emptyWildlife()
  if (!colony.season) colony.season = emptySeason()
  colony.clock = ensureClock(colony.clock ?? emptyClock())
  colony.knobs = ensureKnobs(colony.knobs)
  colony.history = ensureHistory(colony)
  if (colony.woodCollected === undefined) colony.woodCollected = 0
  if (colony.history.viewingId) return
  if (simDt <= 0 && motionDt <= 0) return
  syncForest(colony.forest, world.seedTrees, world.params)
  indexForest(colony.forest, true)
  const prevHome = { u: colony.home.u, v: colony.home.v }
  stepSeasonFromDays(colony.season, colony.clock.days)
  applySeasonKnobs(colony.season, colony.knobs)
  const seated = fitColonyToLand(colony, world.field, world.params)
  const eco = Math.min(8, Math.max(0, simDt))
  const vis = Math.min(0.04, Math.max(0, motionDt))
  const work = Math.min(0.55, vis + eco)
  if (eco > 0) {
    stepHydrology(colony.hydro, colony.dam, world.field, world.params, eco, colony.season.flow, colony.knobs.water)
  }
  world.hydro = colony.hydro
  const home = seated.home
  if (seated.jump > 0.018) {
    const du = home.u - prevHome.u
    const dv = home.v - prevHome.v
    for (const b of colony.beavers) {
      if ((b.status ?? 'resident') !== 'resident') continue
      b.u = clamp(b.u + du, 0.05, 0.95)
      b.v = clamp(b.v + dv, 0.05, 0.95)
      b.targetU = clamp(b.targetU + du, 0.05, 0.95)
      b.targetV = clamp(b.targetV + dv, 0.05, 0.95)
      if (b.position) {
        b.position.u = b.u
        b.position.v = b.v
      }
    }
  }
  colony.home = home
  colony.storage = colonyStorage(home)
  for (const b of colony.beavers) {
    if (!b.position) b.position = { u: b.u, v: b.v }
    if (b.targetTreeId === undefined) b.targetTreeId = null
    if (b.targetBranchId === undefined) b.targetBranchId = null
    if (b.carryGoal === undefined) b.carryGoal = null
    if (b.status === undefined) b.status = 'resident'
    if (b.dispersalSign === undefined) b.dispersalSign = 1
    if (b.status === 'resident') b.homeLocation = denSlot(b, home)
    recoverBeaver(b, world, b.status === 'resident' ? b.homeLocation : home)
    if (
      !walkable(world, b.u, b.v, true) &&
      b.status === 'resident' &&
      b.currentTask !== 'RETURN_HOME' &&
      !landJob(b.currentTask) &&
      !b.carrying
    ) {
      setTask(b, 'RETURN_HOME', b.homeLocation.u, b.homeLocation.v)
    }
    b.taskAge += work
    b.energy = clamp(
      b.energy - vis * 0.008 + (b.currentTask === 'REST' ? vis * 0.14 : 0),
      0.05,
      1,
    )
    b.hunger = clamp(b.hunger + vis * 0.018, 0, 1)

    const partner = colony.beavers.find((o) => o.id === b.partner)
    const salt = Math.floor(b.taskAge * 2) + (b.id.length * 17)

    if (
      b.energy < 0.28 &&
      !b.carrying &&
      b.currentTask !== 'REST' &&
      b.currentTask !== 'CHEW_TREE'
    ) {
      setTask(b, 'REST', b.u, b.v)
    }
    if (
      (b.currentTask === 'MOVE_TO_TREE' || b.currentTask === 'COLLECT_BRANCH') &&
      b.taskAge > 28 &&
      b.speed < 0.0008 &&
      dist(b, b.targetU, b.targetV) > 0.025
    ) {
      b.targetTreeId = null
      b.targetBranchId = null
      chooseTask(b, world, colony, partner, salt + 3)
    }

    if (!b.carrying && (b.status ?? 'resident') === 'resident' && canDisperse(b, colony)) {
      beginDispersal(b, colony)
      const u = clamp(b.u + b.dispersalSign * 0.055, 0.12, 0.88)
      setTask(b, 'DISPERSE_ALONG_WATER', u, riverCenter(u))
    }
    if (b.lifeStage === 'kit' && (b.status ?? 'resident') === 'resident' && b.age < 0.17 && !b.carrying) {
      sendHome(b, colony, world)
    }
    if (
      b.lifeStage === 'kit' &&
      (b.currentTask === 'FIND_TREE' ||
        b.currentTask === 'MOVE_TO_TREE' ||
        b.currentTask === 'CHEW_TREE' ||
        b.currentTask === 'FIND_BUILDING_MATERIAL' ||
        b.currentTask === 'COLLECT_BRANCH' ||
        b.currentTask === 'TRANSPORT_BRANCH' ||
        b.currentTask === 'BUILD_DAM' ||
        b.currentTask === 'BUILD_LODGE')
    ) {
      sendHome(b, colony, world)
    }

    if (b.currentTask === 'FIND_TREE') {
      if (!assignTree(b, colony, world)) {
        const p = pickShore(b, salt)
        setTask(b, 'EXPLORE_SHORE', p.u, p.v)
      }
    }
    if (b.currentTask === 'FIND_BRANCH' || b.currentTask === 'FIND_BUILDING_MATERIAL') {
      const felled = findTree(colony.forest, b.targetTreeId)
      const waitingFall =
        !!felled && (felled.currentState === 'FALLING' || (felled.chewProgress >= 1 && !felled.branched))
      if (!assignBuilding(b, colony) && !waitingFall && b.taskAge > 2.8) {
        if (damBusy(colony) && canChew(b) && assignTree(b, colony, world)) {
          b.carryGoal = 'dam'
        } else {
          const p = pickShore(b, salt)
          setTask(b, 'EXPLORE_SHORE', p.u, p.v)
        }
      }
    }

    if (
      b.currentTask === 'REST' &&
      b.status === 'resident' &&
      b.energy > 0.42 &&
      dist(b, b.homeLocation.u, b.homeLocation.v) > 0.022
    ) {
      const tree = committedTree(b, colony)
      if (tree && isTreeValidTarget(tree)) {
        const stand = approachPoint(tree, { u: b.u, v: b.v })
        setTask(b, 'MOVE_TO_TREE', stand.u, stand.v)
      } else {
        chooseTask(b, world, colony, partner, salt + 2)
      }
    }
    const awake = nightActive(colony.clock.days, colony.season?.winter ?? 0, b.id, colony.clock.speed)
    const damJob =
      b.carryGoal === 'dam' ||
      b.currentTask === 'BUILD_DAM' ||
      b.currentTask === 'DAM_MAINTENANCE' ||
      b.currentTask === 'TRANSPORT_BRANCH' ||
      b.currentTask === 'FIND_BUILDING_MATERIAL' ||
      b.currentTask === 'COLLECT_BRANCH'
    if (
      b.status === 'resident' &&
      awake < 0.34 &&
      !b.carrying &&
      !damJob &&
      !(damBusy(colony) && canBuild(b)) &&
      b.currentTask !== 'CHEW_TREE' &&
      b.currentTask !== 'MOVE_TO_TREE' &&
      b.currentTask !== 'REST' &&
      b.currentTask !== 'RETURN_HOME'
    ) {
      sendHome(b, colony, world)
    }

    if (b.currentTask === 'MOVE_TO_TREE' || b.currentTask === 'CHEW_TREE') {
      const tree = committedTree(b, colony)
      if (!tree || (!isTreeValidTarget(tree) && tree.chewProgress < 1)) {
        b.targetTreeId = null
        if (!assignTree(b, colony, world)) setTask(b, 'RETURN_HOME', b.homeLocation.u, b.homeLocation.v)
      } else if (b.currentTask === 'CHEW_TREE' && isTreeValidTarget(tree)) {
        chewTree(tree, work, b.energy)
        b.hunger = clamp(b.hunger - vis * 0.045, 0, 1)
        b.energy = clamp(b.energy - vis * 0.018, 0.05, 1)
        const face = Math.atan2(tree.position.u - b.u, tree.position.v - b.v)
        b.heading = wrapAngle(b.heading + clamp(wrapAngle(face - b.heading), -1.8 * vis, 1.8 * vis))
        if (tree.chewProgress >= 1) {
          b.carryGoal = null
          setTask(b, 'FIND_BUILDING_MATERIAL', b.u, b.v)
        }
      } else if (b.currentTask === 'CHEW_TREE' && tree.chewProgress >= 1) {
        b.carryGoal = null
        setTask(b, 'FIND_BUILDING_MATERIAL', b.u, b.v)
      }
    }

    if (b.currentTask === 'PICK_UP_BRANCH' || b.currentTask === 'COLLECT_BRANCH') {
      const branch = committedBranch(b, colony)
      if (!branch || !isBranchBuildable(branch)) {
        b.targetBranchId = null
        if (!assignBuilding(b, colony)) setTask(b, 'RETURN_HOME', home.u, home.v)
      } else if (dist(b, branch.u, branch.v) < 0.018 && b.taskAge > 0.42) {
        pickupBranch(b, branch)
        const dest = haulDest(b, world, colony)
        setTask(b, 'TRANSPORT_BRANCH', dest.u, dest.v)
      }
    }

    if (b.currentTask === 'BUILD_DAM') {
      const slot = damWorkSlot(colony.dam, b.id, 3)
      if (dist(b, slot.u, slot.v) > 0.02 && b.carrying) {
        setTask(b, 'TRANSPORT_BRANCH', slot.u, slot.v)
      } else if (b.carrying && b.taskAge > 2.8) {
        const br = committedBranch(b, colony)
        if (br && br.carriedBy === b.id) {
          placeBranchOnDam(colony.dam, br, world.field, world.params, { u: b.u, v: b.v })
        }
        b.carrying = false
        b.targetBranchId = null
        b.carryGoal = null
        setTask(b, 'DAM_MAINTENANCE', slot.u, slot.v)
      } else if (!b.carrying && b.taskAge > 0.5) {
        setTask(b, 'DAM_MAINTENANCE', slot.u, slot.v)
      }
    }

    if (b.currentTask === 'BUILD_LODGE') {
      const site = lodgeApproach(colony.lodge)
      if (b.carrying && b.taskAge > 0.55) {
        const br = committedBranch(b, colony)
        if (br && br.carriedBy === b.id) {
          placeBranchOnLodge(colony.lodge, br, world.field, world.params)
        }
        b.carrying = false
        b.targetBranchId = null
        b.carryGoal = null
        setTask(b, 'FIND_BUILDING_MATERIAL', site.u, site.v)
      } else if (!b.carrying) {
        setTask(b, 'FIND_BUILDING_MATERIAL', site.u, site.v)
      }
    }

    if (b.carrying && b.currentTask !== 'BUILD_DAM' && b.currentTask !== 'BUILD_LODGE') {
      const branch = findBranch(colony.forest, b.targetBranchId)
      if (!branch || (branch.carriedBy && branch.carriedBy !== b.id) || branch.inDam || branch.inLodge) {
        b.carrying = false
        b.targetBranchId = null
      } else {
        branch.carriedBy = b.id
        branch.availability = false
        branch.u = b.u
        branch.v = b.v
        branch.position.u = b.u
        branch.position.v = b.v
        const dest = haulDest(b, world, colony)
        b.currentTask = b.carryGoal === 'cache' ? 'CARRY_TO_STORAGE' : 'TRANSPORT_BRANCH'
        b.targetU = dest.u
        b.targetV = dest.v
      }
    }

    if (
      b.currentTask === 'REST' &&
      dist(b, b.homeLocation.u, b.homeLocation.v) < 0.022 &&
      b.taskAge >
        (b.lifeStage === 'kit' ? 14 : 7) +
          hash(b.id, 11) * 5 +
          (awake < 0.38 ? 16 : 0)
    ) {
      chooseTask(b, world, colony, partner, salt)
    }
    if (b.currentTask === 'REST' && b.status === 'dispersing' && b.taskAge > 5) {
      chooseTask(b, world, colony, partner, salt)
    }
    if (b.currentTask === 'DISPERSE_ALONG_WATER' && b.taskAge > 8.5) {
      setTask(b, 'SEARCH_HABITAT', b.u, b.v)
    }
    if (b.currentTask === 'SEARCH_HABITAT' && b.taskAge > 0.9) {
      arrive(b, world, colony, partner, salt)
    }
    if (b.currentTask === 'EVALUATE_SITE' && b.taskAge > 10) {
      arrive(b, world, colony, partner, salt)
    }
    if (
      b.taskAge > 16 &&
      b.currentTask !== 'CHEW_TREE' &&
      b.currentTask !== 'MOVE_TO_TREE' &&
      b.currentTask !== 'MOVE_TO_BRANCH' &&
      b.currentTask !== 'PICK_UP_BRANCH' &&
      b.currentTask !== 'CARRY_TO_STORAGE' &&
      b.currentTask !== 'COLLECT_BRANCH' &&
      b.currentTask !== 'TRANSPORT_BRANCH' &&
      b.currentTask !== 'BUILD_DAM' &&
      b.currentTask !== 'DAM_MAINTENANCE' &&
      b.currentTask !== 'BUILD_LODGE' &&
      b.currentTask !== 'LODGE_MAINTENANCE' &&
      b.currentTask !== 'DISPERSE_ALONG_WATER' &&
      b.currentTask !== 'SEARCH_HABITAT' &&
      b.currentTask !== 'EVALUATE_SITE' &&
      !b.carrying
    ) {
      chooseTask(b, world, colony, partner, salt)
    }

    if (b.currentTask === 'MOVE_TO_TREE') {
      const tree = committedTree(b, colony)
      if (tree) {
        const stand = approachPoint(tree, { u: b.u, v: b.v })
        if (dist(b, tree.position.u, tree.position.v) < 0.026 || dist(b, stand.u, stand.v) < 0.012) {
          setTask(b, 'CHEW_TREE', b.u, b.v)
        } else {
          b.targetU = stand.u
          b.targetV = stand.v
        }
      }
    }
    if (b.currentTask === 'COLLECT_BRANCH' || b.currentTask === 'MOVE_TO_BRANCH') {
      const branch = committedBranch(b, colony)
      if (branch) {
        const stand = approachBranch(branch, { u: b.u, v: b.v })
        b.targetU = stand.u
        b.targetV = stand.v
      }
    }
    if (b.currentTask === 'RETURN_HOME') {
      const door = lodgeDoor(colony)
      const next = dist(b, door.u, door.v) < 0.018 ? b.homeLocation : viaWater(b, door, world)
      b.targetU = next.u
      b.targetV = next.v
    }
    if (b.currentTask === 'TRANSPORT_BRANCH' || b.currentTask === 'CARRY_TO_STORAGE') {
      const dest = haulDest(b, world, colony)
      b.targetU = dest.u
      b.targetV = dest.v
    }
    if (b.currentTask === 'BUILD_DAM' || b.currentTask === 'DAM_MAINTENANCE') {
      const slot = damWorkSlot(colony.dam, b.id, 3)
      b.targetU = slot.u
      b.targetV = slot.v
    }

    const here = sampleBeaverGround(world, b.u, b.v)
    const restingHome =
      b.currentTask === 'REST' &&
      !b.carrying &&
      dist(b, b.homeLocation.u, b.homeLocation.v) < 0.022
    if (restingHome) {
      b.speed = lerp(b.speed, 0, 1 - Math.exp(-3.8 * vis))
      if (b.speed < 0.0015) b.speed = 0
      const inChamber =
        colony.lodge.chamberDry && dist(b, colony.lodge.siteU, colony.lodge.siteV) < 0.02
      b.wet = lerp(
        b.wet,
        inChamber ? 0.12 : here.inRiver ? 1 : 0,
        1 - Math.exp(-(inChamber || here.inRiver ? 2.8 : 0.55) * vis),
      )
      b.position.u = b.u
      b.position.v = b.v
      continue
    }
    const damSlot =
      b.currentTask === 'BUILD_DAM' || b.currentTask === 'DAM_MAINTENANCE'
        ? damWorkSlot(colony.dam, b.id, 3)
        : { u: b.u, v: b.v }
    const atDamWork =
      (b.currentTask === 'BUILD_DAM' || b.currentTask === 'DAM_MAINTENANCE') &&
      dist(b, damSlot.u, damSlot.v) < 0.018
    const moving =
      b.currentTask !== 'REST' &&
      b.currentTask !== 'CHEW_TREE' &&
      b.currentTask !== 'FIND_TREE' &&
      b.currentTask !== 'FIND_BRANCH' &&
      b.currentTask !== 'FIND_BUILDING_MATERIAL' &&
      b.currentTask !== 'PICK_UP_BRANCH' &&
      b.currentTask !== 'BUILD_LODGE' &&
      b.currentTask !== 'SEARCH_HABITAT' &&
      !atDamWork
    const goalU = moving ? b.targetU : b.u
    const goalV = moving ? b.targetV : b.v
    let toU = goalU - b.u
    let toV = goalV - b.v
    const farGoal = Math.hypot(toU, toV)

    const center = riverCenter(b.u)
    const nearLodge =
      b.status === 'resident' && colony.lodge.locked && dist(b, colony.lodge.siteU, colony.lodge.siteV) < 0.04
    const onLandJob = landJob(b.currentTask)
    const waterTravel =
      !onLandJob &&
      (here.inRiver ||
        b.carrying ||
        b.currentTask === 'SWIM' ||
        b.currentTask === 'DISPERSE_ALONG_WATER' ||
        (b.currentTask === 'RETURN_HOME' && farGoal > 0.02) ||
        riverDistance(b.u, b.v) > 0.018)
    if (waterTravel && !nearLodge) {
      toV += (center - b.v) * 2.05
    }
    if (!here.inRiver && !onLandJob && colony.territory) {
      const slide = trailSteer(colony.territory, b.u, b.v)
      toU += slide.u * 1.6
      toV += slide.v * 1.6
    }

    const far = Math.hypot(toU, toV)
    if (moving && farGoal < 0.012) {
      const site = haulSite(colony, b.carryGoal, b.id)
      const hauling = b.currentTask === 'CARRY_TO_STORAGE' || b.currentTask === 'TRANSPORT_BRANCH'
      if (!hauling || Math.hypot(b.u - site.u, b.v - site.v) < 0.018) {
        arrive(b, world, colony, partner, salt)
      }
    }

    const wantHeading = atDamWork
      ? Math.atan2(colony.dam.siteU - b.u, colony.dam.siteV - b.v + 0.0002)
      : far > 0.001
        ? Math.atan2(toU, toV)
        : b.heading
    const dh = wrapAngle(wantHeading - b.heading)
    const turn = here.inRiver ? 2.35 : 1.15
    b.heading = wrapAngle(b.heading + clamp(dh, -turn * vis, turn * vis))

    const aligned = 1 - clamp(Math.abs(wrapAngle(wantHeading - b.heading)) / 1.15, 0, 1)
    const arriveSlow = moving ? clamp(farGoal / 0.028, 0.22, 1) : 0
    const swim = here.inRiver || b.currentTask === 'SWIM' || (b.carrying && riverDistance(b.u, b.v) < 0.035)
    const load = findBranch(colony.forest, b.targetBranchId)
    const burden = b.carrying && load ? 1 / (1 + load.length * 1.7 + load.woodAmount * 0.35) : 1
    const waterBoost = b.carrying && here.inRiver ? 1.35 : 1
    const cruise =
      (swim ? 0.096 : 0.032) *
      burden *
      waterBoost *
      stageSpeed(b.lifeStage ?? 'adult') *
      (0.42 + 0.58 * (colony.season?.activity ?? 1)) *
      (0.55 + 0.45 * awake)
    const targetSpeed = !moving ? 0 : cruise * Math.max(0.35, aligned) * arriveSlow
    const accel = moving ? 1.6 : 3.8
    b.speed = lerp(b.speed, targetSpeed, 1 - Math.exp(-accel * vis))
    if (moving && targetSpeed > 0.004 && b.speed < 0.01) b.speed = Math.max(b.speed, 0.012)
    if (b.speed < 0.0002) b.speed = 0

    if (moving && b.speed > 0.0003) {
      const step = b.speed * vis
      const loose = onLandJob
      const nu = b.u + Math.sin(b.heading) * step
      const nv = b.v + Math.cos(b.heading) * step
      if (tryStep(world, nu, nv, loose)) {
        b.u = clamp(nu, 0.05, 0.95)
        b.v = clamp(nv, 0.05, 0.95)
      } else {
        const alongU = clamp(b.u + Math.sin(b.heading) * step, 0.05, 0.95)
        const alongV = clamp(b.v + Math.cos(b.heading) * step, 0.05, 0.95)
        const goalU = clamp(b.u + Math.sign(b.targetU - b.u) * step, 0.05, 0.95)
        const goalV = clamp(b.v + Math.sign(b.targetV - b.v) * step, 0.05, 0.95)
        const preferV = Math.abs(b.targetV - b.v) >= Math.abs(b.targetU - b.u)
        const axis = preferV
          ? [
              [b.u, alongV],
              [b.u, goalV],
              [alongU, b.v],
              [goalU, b.v],
            ]
          : [
              [alongU, b.v],
              [goalU, b.v],
              [b.u, alongV],
              [b.u, goalV],
            ]
        let stepped = false
        for (const [su, sv] of axis) {
          if (!tryStep(world, su, sv, loose)) continue
          b.u = su
          b.v = sv
          stepped = true
          break
        }
        if (!stepped) {
          const climbU = clamp(b.u + Math.sin(b.heading) * step * 0.55, 0.05, 0.95)
          const climbV = clamp(b.v + Math.cos(b.heading) * step * 0.55, 0.05, 0.95)
          if (tryStep(world, climbU, climbV, true)) {
            b.u = climbU
            b.v = climbV
          } else {
            b.speed *= 0.35
          }
        }
      }
    }

    const wetNow = moving ? sampleBeaverGround(world, b.u, b.v).inRiver : here.inRiver
    const inChamber =
      colony.lodge.chamberDry &&
      b.currentTask === 'REST' &&
      dist(b, colony.lodge.siteU, colony.lodge.siteV) < 0.02
    b.wet = lerp(b.wet, inChamber ? 0.12 : wetNow ? 1 : 0, 1 - Math.exp(-(inChamber || wetNow ? 2.8 : 0.55) * vis))
    b.position.u = b.u
    b.position.v = b.v
    if (moving) recordTrail(colony.territory, b.u, b.v)
  }
  separateBeavers(colony, world)
  if (vis > 0) stepTrails(colony.territory, vis)
  if (eco > 0) stepSuccession(colony, world.field, world.params, eco)
  stepWildlife(colony, world.field, world.params, eco, vis)
  if (eco > 0) stepPopulation(colony, eco, vis)
  if (vis > 0 || eco > 0) stepForest(colony.forest, work, eco * colony.knobs.regen, colony.season)
  if (eco > 0) recordTimeline(colony)
}
