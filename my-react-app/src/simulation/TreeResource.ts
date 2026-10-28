import type { NoiseParams } from '../perlin'
import { cellOf, emptyBuckets, queryCells } from '../spatial'
import type { Uv } from './Beaver'
import type { RiparianSpecies } from './RiparianBiome'
import { riverCenter, riverDistance } from './Hydrology'
import { YEAR_RATE } from './SimulationEngine'

export type TreeState =
  | 'HEALTHY'
  | 'GNAWED'
  | 'HEAVILY_GNAWED'
  | 'FALLING'
  | 'FALLEN'
  | 'HARVESTED'
  | 'STUMP'

export type EcoState = 'living' | 'stressed' | 'dead' | 'snag' | 'fallen_dead'

export type TreeSpecies = RiparianSpecies | 'other'

export type TreeResource = {
  id: string
  species: TreeSpecies
  position: Uv
  height: number
  trunkDiameter: number
  health: number
  foodValue: number
  woodValue: number
  distanceToWater: number
  currentState: TreeState
  chewProgress: number
  availability: boolean
  yaw: number
  scale: number
  source: 'riparian' | 'planted'
  fallProgress: number
  fallHeading: number
  settleAge: number
  branched: boolean
  ecoState: EcoState
  floodStress: number
  floodAge: number
  snagAge: number
  canopy: number
  regenAge: number
}

export type BranchResource = {
  id: string
  sourceTree: string
  position: Uv
  u: number
  v: number
  yaw: number
  length: number
  woodAmount: number
  foodAmount: number
  availability: boolean
  carriedBy: string | null
  stored: boolean
  inDam: boolean
  inLodge: boolean
  deadwood?: boolean
}

export type ForestState = {
  trees: TreeResource[]
  branches: BranchResource[]
}

const treeIndex = new Map<string, TreeResource>()
const branchIndex = new Map<string, BranchResource>()
let treeBuckets: TreeResource[][] = emptyBuckets()
let branchBuckets: BranchResource[][] = emptyBuckets()
let indexedForest: ForestState | null = null
let indexedTreeN = -1
let indexedBranchN = -1

export function indexForest(forest: ForestState, force = false) {
  if (
    !force &&
    indexedForest === forest &&
    indexedTreeN === forest.trees.length &&
    indexedBranchN === forest.branches.length
  ) {
    return
  }
  indexedForest = forest
  indexedTreeN = forest.trees.length
  indexedBranchN = forest.branches.length
  treeIndex.clear()
  branchIndex.clear()
  treeBuckets = emptyBuckets()
  branchBuckets = emptyBuckets()
  for (const tree of forest.trees) {
    treeIndex.set(tree.id, tree)
    treeBuckets[cellOf(tree.position.u, tree.position.v)].push(tree)
  }
  for (const branch of forest.branches) {
    branchIndex.set(branch.id, branch)
    branchBuckets[cellOf(branch.u, branch.v)].push(branch)
  }
}

function nearbyTrees(u: number, v: number, radius: number, visit: (tree: TreeResource) => void) {
  queryCells(u, v, radius, (cell) => {
    for (const tree of treeBuckets[cell]) {
      if (Math.hypot(tree.position.u - u, tree.position.v - v) <= radius) visit(tree)
    }
  })
}

function nearbyBranches(u: number, v: number, radius: number, visit: (branch: BranchResource) => void) {
  queryCells(u, v, radius, (cell) => {
    for (const branch of branchBuckets[cell]) {
      if (Math.hypot(branch.u - u, branch.v - v) <= radius) visit(branch)
    }
  })
}

export type TreeSeed = {
  id: string
  species: TreeSpecies
  u: number
  v: number
  yaw: number
  scale: number
  source: 'riparian' | 'planted'
}

const SPECIES_PREF: Record<TreeSpecies, number> = {
  willow: 1,
  aspen: 0.94,
  poplar: 0.9,
  alder: 0.74,
  birch: 0.66,
  maple: 0.2,
  other: 0.1,
}

function clamp(value: number, a: number, b: number) {
  return Math.min(b, Math.max(a, value))
}

function hash(id: string, salt: number) {
  let h = salt >>> 0
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

export function emptyForest(): ForestState {
  return { trees: [], branches: [] }
}

export function treeMetrics(species: TreeSpecies, scale: number, worldSize: number) {
  const fit = worldSize / 7.2
  const tall = species === 'poplar' ? 1.42 : species === 'willow' ? 0.82 : species === 'aspen' ? 1.12 : 1
  const height = 0.36 * tall * scale * fit
  const trunkDiameter = 0.044 * (species === 'poplar' ? 1.12 : species === 'willow' ? 0.82 : 1) * scale * fit
  return { height, trunkDiameter, fit, tall }
}

export function plantedKindToSpecies(kind: string): TreeSpecies | null {
  if (kind === 'rock') return null
  if (kind === 'willow') return 'willow'
  return 'other'
}

export function createTreeResource(seed: TreeSeed, params: NoiseParams): TreeResource {
  const { height, trunkDiameter } = treeMetrics(seed.species, seed.scale, params.worldSize)
  const distanceToWater = riverDistance(seed.u, seed.v)
  const food = (0.55 + seed.scale * 0.4) * (0.35 + SPECIES_PREF[seed.species])
  return {
    id: seed.id,
    species: seed.species,
    position: { u: seed.u, v: seed.v },
    height,
    trunkDiameter,
    health: 1,
    foodValue: food,
    woodValue: height * trunkDiameter * 14,
    distanceToWater,
    currentState: 'HEALTHY',
    chewProgress: 0,
    availability: true,
    yaw: seed.yaw,
    scale: seed.scale,
    source: seed.source,
    fallProgress: 0,
    fallHeading: Math.atan2(0, riverCenter(seed.u) - seed.v) + (hash(seed.id, 9) - 0.5) * 0.55,
    settleAge: 0,
    branched: false,
    ecoState: 'living',
    floodStress: 0,
    floodAge: 0,
    snagAge: 0,
    canopy: 1,
    regenAge: 0,
  }
}

export function isStanding(state: TreeState) {
  return state === 'HEALTHY' || state === 'GNAWED' || state === 'HEAVILY_GNAWED'
}

export function isTreeValidTarget(tree: TreeResource) {
  const eco = tree.ecoState ?? 'living'
  return tree.availability && isStanding(tree.currentState) && (eco === 'living' || eco === 'stressed')
}

export function treePreference(tree: TreeResource, from: Uv) {
  const species = SPECIES_PREF[tree.species]
  const water = 1 - clamp(tree.distanceToWater / 0.16, 0, 1)
  const d = tree.trunkDiameter
  const medium = Math.exp(-((d - 0.046) * (d - 0.046)) / (2 * 0.016 * 0.016))
  const largePen = d > 0.072 ? (d - 0.072) * 9 : 0
  const farPen = tree.distanceToWater > 0.11 ? (tree.distanceToWater - 0.11) * 7 : 0
  const dist = Math.hypot(from.u - tree.position.u, from.v - tree.position.v)
  const invest = tree.chewProgress > 0.04 ? 0.28 : 0
  return species * 1.5 + water * 1.2 + medium * 0.95 - largePen - farPen - dist * 0.65 + invest
}

export function pickPreferredTree(
  forest: ForestState,
  from: Uv,
  allow?: (tree: TreeResource) => boolean,
): TreeResource | null {
  indexForest(forest)
  let best: TreeResource | null = null
  let score = -Infinity
  const consider = (tree: TreeResource) => {
    if (!isTreeValidTarget(tree)) return
    if (tree.distanceToWater > 0.22) return
    if (allow && !allow(tree)) return
    const s = treePreference(tree, from)
    if (s > score) {
      score = s
      best = tree
    }
  }
  nearbyTrees(from.u, from.v, 0.2, consider)
  if (best) return best
  nearbyTrees(from.u, from.v, 0.38, consider)
  if (best) return best
  for (const tree of forest.trees) consider(tree)
  return best
}

export function approachPoint(tree: TreeResource, from: Uv) {
  let du = from.u - tree.position.u
  let dv = from.v - tree.position.v
  const len = Math.hypot(du, dv) || 1
  const stand = 0.01 + tree.trunkDiameter * 0.12
  return {
    u: clamp(tree.position.u + (du / len) * stand, 0.06, 0.94),
    v: clamp(tree.position.v + (dv / len) * stand, 0.06, 0.94),
  }
}

function standingFromChew(tree: TreeResource) {
  if (tree.ecoState === 'dead' || tree.ecoState === 'snag' || tree.ecoState === 'fallen_dead') return
  if (tree.chewProgress < 0.2) tree.currentState = 'HEALTHY'
  else if (tree.chewProgress < 0.55) tree.currentState = 'GNAWED'
  else tree.currentState = 'HEAVILY_GNAWED'
}

export function chewTree(tree: TreeResource, dt: number, energy: number) {
  if (!isTreeValidTarget(tree)) return
  const hardness = 0.42 + tree.trunkDiameter * 11
  const rate = (0.048 * Math.max(0.25, energy)) / hardness
  tree.chewProgress = clamp(tree.chewProgress + dt * rate, 0, 1)
  tree.health = clamp(1 - tree.chewProgress, 0, 1)
  tree.foodValue = Math.max(0, tree.foodValue - dt * rate * 0.85)
  if (tree.chewProgress >= 1) {
    tree.currentState = 'FALLING'
    tree.availability = false
    return
  }
  standingFromChew(tree)
}

function spawnBranches(forest: ForestState, tree: TreeResource) {
  const n = 4 + Math.floor(tree.scale * 3)
  for (let i = 0; i < n; i += 1) {
    const ang = tree.fallHeading + (i - (n - 1) * 0.5) * 0.28 + (hash(tree.id, 20 + i) - 0.5) * 0.4
    const dist = 0.01 + tree.height * 0.016 + i * 0.004
    const u = clamp(tree.position.u + Math.sin(ang) * dist, 0.04, 0.96)
    const v = clamp(tree.position.v + Math.cos(ang) * dist, 0.04, 0.96)
    const length = 0.16 + hash(tree.id, 40 + i) * 0.22
    forest.branches.push({
      id: `${tree.id}-br-${i}`,
      sourceTree: tree.id,
      position: { u, v },
      u,
      v,
      yaw: ang,
      length,
      woodAmount: tree.woodValue * (0.06 + length * 0.12),
      foodAmount: tree.foodValue * (0.04 + hash(tree.id, 50 + i) * 0.05),
      availability: true,
      carriedBy: null,
      stored: false,
      inDam: false,
      inLodge: false,
    })
  }
  tree.woodValue *= 0.45
  tree.branched = true
}

export function isBranchFree(branch: BranchResource) {
  return branch.availability && !branch.carriedBy && !branch.stored && !branch.inDam && !branch.inLodge
}

export function isBranchBuildable(branch: BranchResource) {
  return !branch.carriedBy && !branch.inDam && !branch.inLodge && (branch.availability || branch.stored)
}

export function findBranch(forest: ForestState, id: string | null | undefined) {
  if (!id) return undefined
  indexForest(forest)
  return branchIndex.get(id) ?? forest.branches.find((b) => b.id === id)
}

export function pickNearbyBranch(forest: ForestState, from: Uv, maxDist = 0.22) {
  indexForest(forest)
  let best: BranchResource | null = null
  let score = -Infinity
  nearbyBranches(from.u, from.v, maxDist, (branch) => {
    if (!isBranchFree(branch)) return
    const d = Math.hypot(from.u - branch.u, from.v - branch.v)
    if (d > maxDist) return
    const s = 1.2 - d * 4 + branch.woodAmount * 0.15 - branch.length * 0.35
    if (s > score) {
      score = s
      best = branch
    }
  })
  return best
}

export function pickBuildingBranch(forest: ForestState, from: Uv, maxDist = 0.28): BranchResource | null {
  indexForest(forest)
  let best: BranchResource | null = null
  let score = -Infinity
  nearbyBranches(from.u, from.v, maxDist, (branch) => {
    if (!isBranchBuildable(branch)) return
    const d = Math.hypot(from.u - branch.u, from.v - branch.v)
    if (d > maxDist) return
    const s = 1.15 - d * 3.6 + branch.woodAmount * 0.2 - branch.length * 0.22 + (branch.stored ? 0.12 : 0)
    if (s > score) {
      score = s
      best = branch
    }
  })
  return best
}

export function approachBranch(branch: BranchResource, from: Uv) {
  let du = from.u - branch.u
  let dv = from.v - branch.v
  const len = Math.hypot(du, dv) || 1
  const stand = 0.01
  return {
    u: clamp(branch.u + (du / len) * stand, 0.06, 0.94),
    v: clamp(branch.v + (dv / len) * stand, 0.06, 0.94),
  }
}

export function forestStats(forest: ForestState) {
  return {
    availableBranches: forest.branches.filter(isBranchFree).length,
    treesCut: forest.trees.filter((t) => t.chewProgress >= 1).length,
  }
}

export function isFloodKilled(tree: TreeResource) {
  return tree.ecoState === 'dead' || tree.ecoState === 'snag' || tree.ecoState === 'fallen_dead'
}

export function stepForest(
  forest: ForestState,
  visDt: number,
  ecoDt = visDt,
  season?: { vegetation: number; green: number },
) {
  const vis = Math.min(0.05, Math.max(0, visDt))
  const eco = Math.min(2, Math.max(0, ecoDt))
  for (const branch of forest.branches) {
    if (!branch.position) branch.position = { u: branch.u, v: branch.v }
    if (branch.woodAmount === undefined) branch.woodAmount = 0.08
    if (branch.sourceTree === undefined) branch.sourceTree = ''
    if (branch.availability === undefined) branch.availability = true
    if (branch.carriedBy === undefined) branch.carriedBy = null
    if (branch.stored === undefined) branch.stored = false
    if (branch.inDam === undefined) branch.inDam = false
    if (branch.inLodge === undefined) branch.inLodge = false
    if (branch.foodAmount === undefined) branch.foodAmount = 0.02
  }
  for (const tree of forest.trees) {
    if (!tree.ecoState) tree.ecoState = 'living'
    if (tree.floodStress === undefined) tree.floodStress = 0
    if (tree.canopy === undefined) tree.canopy = 1
    if (tree.regenAge === undefined) tree.regenAge = 0
    tree.distanceToWater = riverDistance(tree.position.u, tree.position.v)
    if (tree.currentState === 'STUMP') {
      const growing = (season?.vegetation ?? 0) > 0.38 && (season?.green ?? 0) > 0.28
      if (growing && !isFloodKilled(tree)) {
        tree.regenAge += eco * YEAR_RATE
        if (tree.regenAge > 1.2) {
          tree.currentState = 'HEALTHY'
          tree.chewProgress = 0
          tree.availability = true
          tree.health = 0.72
          tree.scale = Math.min(1.15, tree.scale * 0.58 + 0.12)
          tree.height *= 0.62
          tree.trunkDiameter *= 0.78
          tree.woodValue = tree.height * tree.trunkDiameter * 14
          tree.foodValue = 0.38 + tree.scale * 0.32
          tree.canopy = 0.55
          tree.ecoState = 'living'
          tree.floodStress = 0
          tree.floodAge = 0
          tree.fallProgress = 0
          tree.settleAge = 0
          tree.branched = false
          tree.regenAge = 0
        }
      }
      continue
    }
    if (isFloodKilled(tree) && tree.chewProgress < 1) continue
    if (tree.chewProgress < 1 && isStanding(tree.currentState)) continue

    if (tree.chewProgress >= 1 && tree.currentState !== 'FALLEN' && tree.currentState !== 'HARVESTED') {
      tree.currentState = 'FALLING'
      tree.availability = false
    }
    if (tree.currentState === 'FALLING') {
      const accel = 0.38 + tree.fallProgress * 1.25
      tree.fallProgress = clamp(tree.fallProgress + vis * accel, 0, 1)
      if (tree.fallProgress >= 1) {
        tree.currentState = 'FALLEN'
        if (!tree.branched) spawnBranches(forest, tree)
      }
    } else if (tree.currentState === 'FALLEN') {
      tree.settleAge += vis
      if (tree.settleAge > 0.28) tree.currentState = 'HARVESTED'
    } else if (tree.currentState === 'HARVESTED') {
      tree.settleAge += vis
      if (tree.settleAge > 0.75) tree.currentState = 'STUMP'
    }
  }
}

export function syncForest(forest: ForestState, seeds: TreeSeed[], params: NoiseParams) {
  const have = new Set(forest.trees.map((t) => t.id))
  for (const seed of seeds) {
    if (forest.trees.length >= 240) break
    if (have.has(seed.id)) continue
    const near = forest.trees.some(
      (t) => Math.hypot(t.position.u - seed.u, t.position.v - seed.v) < 0.016,
    )
    if (near) continue
    forest.trees.push(createTreeResource(seed, params))
    have.add(seed.id)
  }
  if (forest.branches.length > 160) {
    forest.branches = forest.branches.filter(
      (b) => b.carriedBy || b.inDam || b.inLodge || b.availability || !b.stored,
    )
    if (forest.branches.length > 160) forest.branches = forest.branches.slice(-140)
  }
}

export function findTree(forest: ForestState, id: string | null | undefined) {
  if (!id) return undefined
  indexForest(forest)
  return treeIndex.get(id) ?? forest.trees.find((t) => t.id === id)
}
