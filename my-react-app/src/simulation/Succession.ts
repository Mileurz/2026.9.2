import { sampleHeightField, type HeightField } from '../heightField'
import type { NoiseParams } from '../perlin'
import type { DamState } from './Dam'
import {
  carveRiver,
  corridorMask,
  floodplainMask,
  isInundated,
  localWaterN,
  riverCenter,
  riverDistance,
  riverHalfWidth,
  riverMask,
  streamAlong,
  type HydroState,
} from './Hydrology'
import type { LodgeState } from './Lodge'
import type { TerritoryState } from './Territory'
import {
  isStanding,
  type ForestState,
  type TreeResource,
  type TreeSpecies,
} from './TreeResource'

export type WetlandKind = 'reed' | 'cattail' | 'sedge' | 'grass' | 'aquatic'

export type WetlandStem = {
  id: string
  kind: WetlandKind
  u: number
  v: number
  yaw: number
  scale: number
  age: number
  vigor: number
}

export type MemoryMark = {
  u: number
  v: number
  age: number
}

export type SuccessionState = {
  plants: WetlandStem[]
  oldShore: MemoryMark[]
  paths: MemoryMark[]
  marshAge: number
  wetlandArea: number
  floodedForestArea: number
  wetGrid: Float32Array
  shoreGrid: Float32Array
  nextId: number
  tick: number
}

type ColonyEco = {
  forest: ForestState
  hydro: HydroState
  dam: DamState
  lodge: LodgeState
  territory: TerritoryState
  succession: SuccessionState
  season?: { vegetation: number }
  knobs?: { flood: number }
}

export const COVER_GRID = 28

const MAX_KIND: Record<WetlandKind, number> = {
  reed: 220,
  cattail: 160,
  sedge: 200,
  grass: 240,
  aquatic: 140,
}

function clamp(value: number, a: number, b: number) {
  return Math.min(b, Math.max(a, value))
}

function hash(id: string, salt: number) {
  let h = salt >>> 0
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

export function emptySuccession(): SuccessionState {
  return {
    plants: [],
    oldShore: [],
    paths: [],
    marshAge: 0,
    wetlandArea: 0,
    floodedForestArea: 0,
    wetGrid: new Float32Array(COVER_GRID * COVER_GRID),
    shoreGrid: new Float32Array(COVER_GRID * COVER_GRID),
    nextId: 1,
    tick: 0,
  }
}

export function ensureSuccession(space: SuccessionState | undefined): SuccessionState {
  if (!space) return emptySuccession()
  if (!space.plants) space.plants = []
  if (!space.oldShore) space.oldShore = []
  if (!space.paths) space.paths = []
  if (!space.wetGrid || space.wetGrid.length !== COVER_GRID * COVER_GRID) {
    space.wetGrid = new Float32Array(COVER_GRID * COVER_GRID)
  }
  if (!space.shoreGrid || space.shoreGrid.length !== COVER_GRID * COVER_GRID) {
    space.shoreGrid = new Float32Array(COVER_GRID * COVER_GRID)
  }
  if (space.marshAge === undefined) space.marshAge = 0
  if (space.nextId === undefined) space.nextId = 1
  if (space.tick === undefined) space.tick = 0
  return space
}

export function normalizeTreeEco(tree: TreeResource) {
  if (!tree.ecoState) tree.ecoState = 'living'
  if (tree.floodStress === undefined) tree.floodStress = 0
  if (tree.floodAge === undefined) tree.floodAge = 0
  if (tree.snagAge === undefined) tree.snagAge = 0
  if (tree.canopy === undefined) tree.canopy = 1
}

function floodTolerance(species: TreeSpecies) {
  switch (species) {
    case 'willow':
      return 0.84
    case 'alder':
      return 0.72
    case 'poplar':
      return 0.5
    case 'aspen':
      return 0.46
    case 'birch':
      return 0.36
    case 'maple':
      return 0.2
    default:
      return 0.32
  }
}

function sampleCover(grid: Float32Array, u: number, v: number) {
  const n = COVER_GRID
  const x = clamp(u, 0, 1) * (n - 1)
  const y = clamp(v, 0, 1) * (n - 1)
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(n - 1, x0 + 1)
  const y1 = Math.min(n - 1, y0 + 1)
  const fx = x - x0
  const fy = y - y0
  const a = grid[y0 * n + x0]
  const b = grid[y0 * n + x1]
  const c = grid[y1 * n + x0]
  const d = grid[y1 * n + x1]
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy
}

export function marshCoverAt(space: SuccessionState, u: number, v: number) {
  return sampleCover(space.wetGrid, u, v)
}

export function shoreMemoryAt(space: SuccessionState, u: number, v: number) {
  return sampleCover(space.shoreGrid, u, v)
}

function splat(grid: Float32Array, u: number, v: number, amount: number, radius: number) {
  const n = COVER_GRID
  const col = u * (n - 1)
  const row = v * (n - 1)
  const reach = Math.max(1, Math.ceil(radius * n))
  for (let j = -reach; j <= reach; j += 1) {
    for (let i = -reach; i <= reach; i += 1) {
      const x = Math.round(col) + i
      const y = Math.round(row) + j
      if (x < 0 || y < 0 || x >= n || y >= n) continue
      const du = x / (n - 1) - u
      const dv = y / (n - 1) - v
      const w = Math.exp(-(du * du + dv * dv) / (radius * radius * 0.55))
      const idx = y * n + x
      grid[idx] = Math.min(1, grid[idx] + amount * w)
    }
  }
}

function blocked(u: number, v: number, colony: ColonyEco) {
  if (colony.dam.locked && Math.hypot(u - colony.dam.siteU, v - colony.dam.siteV) < 0.018) return true
  if (colony.lodge.locked && Math.hypot(u - colony.lodge.siteU, v - colony.lodge.siteV) < 0.022) return true
  return false
}

function spawnDeadwood(forest: ForestState, tree: TreeResource) {
  const n = 2 + Math.floor(tree.scale * 2)
  for (let i = 0; i < n; i += 1) {
    const ang = tree.fallHeading + (i - (n - 1) * 0.5) * 0.34 + (hash(tree.id, 70 + i) - 0.5) * 0.5
    const dist = 0.012 + tree.height * 0.012 + i * 0.005
    const u = clamp(tree.position.u + Math.sin(ang) * dist, 0.04, 0.96)
    const v = clamp(tree.position.v + Math.cos(ang) * dist, 0.04, 0.96)
    forest.branches.push({
      id: `${tree.id}-dw-${i}`,
      sourceTree: tree.id,
      position: { u, v },
      u,
      v,
      yaw: ang,
      length: 0.14 + hash(tree.id, 80 + i) * 0.2,
      woodAmount: tree.woodValue * 0.05,
      foodAmount: 0.01,
      availability: true,
      carriedBy: null,
      stored: false,
      inDam: false,
      inLodge: false,
      deadwood: true,
    })
  }
  tree.branched = true
}

function stepTreeFlood(
  tree: TreeResource,
  forest: ForestState,
  wet: boolean,
  nearWet: boolean,
  depth: number,
  dt: number,
) {
  normalizeTreeEco(tree)
  if (tree.chewProgress >= 1) return
  const tol = floodTolerance(tree.species)
  if (tree.ecoState === 'fallen_dead') {
    if (tree.fallProgress < 1) {
      tree.fallProgress = clamp(tree.fallProgress + dt * (0.1 + tree.fallProgress * 0.35), 0, 1)
      tree.currentState = tree.fallProgress >= 1 ? 'FALLEN' : 'FALLING'
      tree.availability = false
      if (tree.fallProgress >= 1 && !tree.branched) spawnDeadwood(forest, tree)
    }
    tree.canopy = 0
    return
  }
  if (tree.ecoState === 'snag') {
    tree.snagAge += dt
    tree.canopy = 0.03
    tree.availability = false
    const wait = 18 + hash(tree.id, 5) * 16
    if (tree.snagAge > wait) tree.ecoState = 'fallen_dead'
    return
  }
  if (tree.ecoState === 'dead') {
    tree.snagAge += dt
    tree.canopy = clamp(tree.canopy - dt * 0.04, 0.08, 1)
    tree.availability = false
    if (tree.snagAge > 9 + hash(tree.id, 6) * 8) tree.ecoState = 'snag'
    return
  }
  if (wet) {
    tree.floodAge += dt
    const load = 0.35 + clamp(depth * 14, 0, 1.4)
    tree.floodStress = clamp(tree.floodStress + dt * 0.042 * (1.05 - tol) * load, 0, 1)
  } else {
    tree.floodAge = Math.max(0, tree.floodAge - dt * 0.35)
    if (nearWet) tree.floodStress = clamp(tree.floodStress + dt * 0.007 * (1 - tol), 0, 1)
    else if (tree.ecoState === 'living' || tree.ecoState === 'stressed') {
      tree.floodStress = clamp(tree.floodStress - dt * 0.008, 0, 1)
    }
  }
  if (tree.floodStress >= 0.72 && tree.floodAge > 6) {
    tree.ecoState = 'dead'
    tree.availability = false
    tree.foodValue *= 0.15
    tree.snagAge = 0
    tree.canopy = 0.28
    return
  }
  if (tree.floodStress >= 0.28) {
    tree.ecoState = 'stressed'
    tree.canopy = clamp(1 - tree.floodStress * 0.7, 0.32, 1)
    tree.foodValue = Math.max(0.05, tree.foodValue * (1 - dt * 0.01))
    return
  }
  tree.ecoState = 'living'
  tree.canopy = clamp(0.86 + (1 - tree.floodStress) * 0.14, 0.86, 1)
}

function countKind(plants: WetlandStem[], kind: WetlandKind) {
  let n = 0
  for (const p of plants) if (p.kind === kind) n += 1
  return n
}

function pickKind(depth: number, wet: boolean, flood: number, corridor: number, salt: number): WetlandKind | null {
  if (wet && depth > 0.01 && depth < 0.055 && salt > 0.35) return 'aquatic'
  if (wet && depth >= -0.004 && depth < 0.03 && salt > 0.22) return 'cattail'
  if ((wet || flood > 0.45) && depth < 0.022 && salt > 0.18) return 'reed'
  if (flood > 0.28 && depth < 0.012 && salt > 0.12) return 'sedge'
  if (corridor > 0.2 && depth < 0.006 && !wet && salt > 0.08) return 'grass'
  if (wet && depth < 0.018) return salt > 0.5 ? 'reed' : 'sedge'
  return null
}

function trySpawnPlant(
  colony: ColonyEco,
  field: HeightField,
  params: NoiseParams,
  salt: number,
) {
  const space = colony.succession
  const u = 0.1 + hash(`p${space.nextId}`, salt) * 0.8
  const v = 0.16 + hash(`p${space.nextId}`, salt + 3) * 0.68
  if (blocked(u, v, colony)) return
  const sea = params.seaLevel
  const n = carveRiver(sampleHeightField(field, u, v), u, v, sea)
  const water = localWaterN(u, v, colony.hydro, sea)
  const wet = isInundated(n, u, v, colony.hydro, sea)
  const depth = water - n
  const flood = floodplainMask(u, v, sea)
  const corridor = corridorMask(u, v, sea)
  if (riverMask(u, v, sea) > 0.72 && streamAlong(u, colony.hydro) > 0.02) return
  const kind = pickKind(depth, wet, flood, corridor, hash(`k${space.nextId}`, salt + 9))
  if (!kind) return
  if (countKind(space.plants, kind) >= MAX_KIND[kind]) return
  if (space.plants.some((p) => Math.hypot(p.u - u, p.v - v) < (kind === 'grass' ? 0.012 : 0.016))) return
  const cluster = space.plants.find((p) => p.kind === kind && Math.hypot(p.u - u, p.v - v) < 0.05)
  const scale = 0.65 + hash(`s${space.nextId}`, salt + 4) * 0.55
  space.plants.push({
    id: `W-${kind}-${space.nextId}`,
    kind,
    u: clamp(u + (cluster ? (hash(`c${space.nextId}`, 1) - 0.5) * 0.01 : 0), 0.06, 0.94),
    v: clamp(v + (cluster ? (hash(`c${space.nextId}`, 2) - 0.5) * 0.01 : 0), 0.06, 0.94),
    yaw: hash(`y${space.nextId}`, 8) * Math.PI * 2,
    scale,
    age: 0.04,
    vigor: 0.55 + hash(`v${space.nextId}`, 11) * 0.45,
  })
  space.nextId += 1
}

function rememberShore(space: SuccessionState, field: HeightField, params: NoiseParams, hydro: HydroState) {
  const sea = params.seaLevel
  const reach = riverHalfWidth(sea) + (hydro.pondSpread ?? 0.02) + 0.04
  for (let i = 0; i < 22; i += 1) {
    const u = 0.12 + (i / 21) * 0.76
    const c = riverCenter(u)
    for (const side of [-1, 1] as const) {
      let edgeV: number | null = null
      for (let s = 0.006; s < reach; s += 0.01) {
        const v0 = clamp(c + side * s, 0.08, 0.92)
        const v1 = clamp(c + side * (s + 0.01), 0.08, 0.92)
        const n0 = carveRiver(sampleHeightField(field, u, v0), u, v0, sea)
        const n1 = carveRiver(sampleHeightField(field, u, v1), u, v1, sea)
        if (isInundated(n0, u, v0, hydro, sea) !== isInundated(n1, u, v1, hydro, sea)) {
          edgeV = v0
          break
        }
      }
      if (edgeV === null) continue
      if (space.oldShore.length >= 220) continue
      if (space.oldShore.some((m) => Math.hypot(m.u - u, m.v - edgeV) < 0.02)) continue
      space.oldShore.push({ u, v: edgeV, age: 0 })
    }
  }
}

function rememberPaths(space: SuccessionState, territory: TerritoryState) {
  for (const mark of territory.trails) {
    const hit = space.paths.find((p) => Math.hypot(p.u - mark.u, p.v - mark.v) < 0.016)
    if (hit) {
      hit.age = Math.min(hit.age, 8)
      continue
    }
    space.paths.push({ u: mark.u, v: mark.v, age: 0 })
    if (space.paths.length > 90) space.paths.shift()
  }
}

function rebuildCover(space: SuccessionState) {
  space.wetGrid.fill(0)
  space.shoreGrid.fill(0)
  for (const plant of space.plants) {
    const w = clamp(plant.age * plant.vigor, 0, 1) * (plant.kind === 'grass' ? 0.22 : 0.34)
    splat(space.wetGrid, plant.u, plant.v, w, plant.kind === 'aquatic' ? 0.03 : 0.024)
  }
  for (const mark of space.oldShore) {
    splat(space.shoreGrid, mark.u, mark.v, 0.55, 0.016)
  }
}

function measureAreas(
  colony: ColonyEco,
  field: HeightField,
  params: NoiseParams,
) {
  const space = colony.succession
  const sea = params.seaLevel
  const n = COVER_GRID
  const cell = (params.worldSize * params.worldSize) / (n * n)
  let wet = 0
  for (let j = 0; j < n; j += 1) {
    const v = n <= 1 ? 0.5 : j / (n - 1)
    for (let i = 0; i < n; i += 1) {
      const u = n <= 1 ? 0.5 : i / (n - 1)
      const h = carveRiver(sampleHeightField(field, u, v), u, v, sea)
      const inundated = isInundated(h, u, v, colony.hydro, sea)
      const marsh = space.wetGrid[j * n + i]
      const flood = floodplainMask(u, v, sea)
      if (marsh > 0.12 || (inundated && riverMask(u, v, sea) < 0.55) || (flood > 0.55 && space.marshAge > 2 && marsh > 0.04)) {
        wet += cell
      }
    }
  }
  space.wetlandArea = wet
  let forest = 0
  const treeCell = (params.worldSize * 0.048) ** 2
  for (const tree of colony.forest.trees) {
    const h = carveRiver(sampleHeightField(field, tree.position.u, tree.position.v), tree.position.u, tree.position.v, sea)
    if (!isInundated(h, tree.position.u, tree.position.v, colony.hydro, sea)) continue
    forest += treeCell
  }
  space.floodedForestArea = forest
}

export function successionStats(forest: ForestState, space: SuccessionState) {
  let remaining = 0
  let cut = 0
  let dead = 0
  for (const tree of forest.trees) {
    if (tree.chewProgress >= 1) cut += 1
    if (tree.ecoState === 'dead' || tree.ecoState === 'snag' || tree.ecoState === 'fallen_dead') dead += 1
    else if (
      (tree.ecoState === 'living' || tree.ecoState === 'stressed' || !tree.ecoState) &&
      isStanding(tree.currentState)
    ) {
      remaining += 1
    }
  }
  return {
    wetlandArea: space.wetlandArea,
    treesRemaining: remaining,
    treesCut: cut,
    deadTrees: dead,
    floodedForestArea: space.floodedForestArea,
  }
}

export function stepSuccession(
  colony: ColonyEco,
  field: HeightField,
  params: NoiseParams,
  dt: number,
) {
  const space = ensureSuccession(colony.succession)
  colony.succession = space
  const dtc = Math.min(2, Math.max(0, dt))
  const sea = params.seaLevel
  const hydro = colony.hydro
  const bank = riverHalfWidth(sea)
  space.tick += 1
  const effect = hydro.effectiveness ?? 0
  if (effect > 0.05) space.marshAge += dtc * (0.05 + effect * 0.14)

  for (const tree of colony.forest.trees) {
    const u = tree.position.u
    const v = tree.position.v
    const n = carveRiver(sampleHeightField(field, u, v), u, v, sea)
    const water = localWaterN(u, v, hydro, sea)
    const wet = isInundated(n, u, v, hydro, sea)
    const spread = bank + (hydro.pondSpread ?? 0.02) * 0.85
    const nearWet = !wet && riverDistance(u, v) < spread + 0.03 && streamAlong(u, hydro) < 0.04
    stepTreeFlood(tree, colony.forest, wet, nearWet, water - n, dtc * (colony.knobs?.flood ?? 1))
  }

  for (const plant of space.plants) {
    const n = carveRiver(sampleHeightField(field, plant.u, plant.v), plant.u, plant.v, sea)
    const water = localWaterN(plant.u, plant.v, hydro, sea)
    const wet = isInundated(n, plant.u, plant.v, hydro, sea)
    const depth = water - n
    let fit = 1
    if (plant.kind === 'aquatic') fit = wet && depth > 0.006 ? 1 : 0.35
    else if (plant.kind === 'cattail') fit = depth < 0.034 ? 1 : 0.4
    else if (plant.kind === 'reed') fit = depth < 0.026 ? 1 : 0.45
    else if (plant.kind === 'sedge') fit = depth < 0.014 ? 1 : 0.3
    else fit = wet && depth > 0.012 ? 0.25 : 1
    const veg = colony.season?.vegetation ?? 1
    const grow = dtc * 0.032 * plant.vigor * fit * (0.55 + clamp(space.marshAge / 10, 0, 0.7)) * (0.35 + veg * 0.75)
    plant.age = clamp(plant.age + grow - dtc * 0.018 * (1.05 - veg) - dtc * 0.01 * (1 - fit), 0, 1)
  }
  space.plants = space.plants.filter((p) => p.age > 0.02)

  const attempts =
    space.marshAge < 0.35 ? 0 : 1 + Math.min(7, Math.floor(space.marshAge * 0.55 + effect * 3.2))
  if (space.tick % 6 === 0) {
    for (let i = 0; i < attempts; i += 1) trySpawnPlant(colony, field, params, space.tick * 13 + i * 17)
  }
  if (space.tick % 8 === 0) rememberShore(space, field, params, hydro)
  rememberPaths(space, colony.territory)
  for (const mark of space.oldShore) mark.age += dtc
  for (const mark of space.paths) mark.age += dtc * 0.15
  if (space.tick % 10 === 0) {
    rebuildCover(space)
    measureAreas(colony, field, params)
  }
}
