import { sampleHeightField, type HeightField } from '../heightField'
import type { NoiseParams } from '../perlin'
import {
  carveRiver,
  corridorMask,
  floodplainMask,
  riverCenter,
  riverHalfWidth,
  riverMask,
  updateRiverFromLand,
} from './Hydrology'

export type RiparianSpecies = 'willow' | 'aspen' | 'poplar' | 'alder' | 'birch' | 'maple'

export type GroundSpot = {
  u: number
  v: number
  yaw: number
  scale: number
}

export type TreeSpot = GroundSpot & { id: string; species: RiparianSpecies }

function hash(i: number) {
  const x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b)
  return ((x ^ (x >>> 13)) >>> 0) / 4294967296
}

function heightAt(field: HeightField, params: NoiseParams, u: number, v: number) {
  return carveRiver(sampleHeightField(field, u, v), u, v, params.seaLevel)
}

function slope(field: HeightField, params: NoiseParams, u: number, v: number) {
  const e = 0.012
  const dx = heightAt(field, params, u + e, v) - heightAt(field, params, u - e, v)
  const dz = heightAt(field, params, u, v + e) - heightAt(field, params, u, v - e)
  return Math.hypot(dx, dz) / (e * 2)
}

export function buildRiparianLayout(field: HeightField, params: NoiseParams) {
  updateRiverFromLand(field, params)
  const sea = params.seaLevel
  const w = riverHalfWidth(sea)

  const grass: GroundSpot[] = []
  const shrubs: GroundSpot[] = []
  const reeds: GroundSpot[] = []
  const rocks: GroundSpot[] = []
  const wood: GroundSpot[] = []
  const trees: TreeSpot[] = []

  for (let i = 0; i < 720 && grass.length < 340; i += 1) {
    const u = hash(i * 3 + 1)
    const v = hash(i * 5 + 2)
    const n = heightAt(field, params, u, v)
    const corridor = corridorMask(u, v, sea)
    if (n < 0.03 || n > 0.26 || riverMask(u, v, sea) > 0.4) continue
    if (corridor > 0.72 && hash(i + 9) > 0.18) continue
    if (slope(field, params, u, v) > 8) continue
    const density = corridor > 0.35 ? 0.35 : 0.75 + hash(i) * 0.25
    if (hash(i + 11) > density) continue
    grass.push({ u, v, yaw: hash(i + 4) * Math.PI * 2, scale: 0.55 + hash(i + 6) * 0.5 })
  }

  for (let i = 0; i < 400 && shrubs.length < 70; i += 1) {
    const u = hash(i * 7 + 3)
    const v = hash(i * 11 + 8)
    const n = heightAt(field, params, u, v)
    const d = Math.abs(v - riverCenter(u))
    if (n < 0.04 || n > 0.22) continue
    if (d < w + 0.08 || d > w + 0.2) continue
    if (slope(field, params, u, v) > 7) continue
    shrubs.push({ u, v, yaw: hash(i) * Math.PI * 2, scale: 0.7 + hash(i + 2) * 0.45 })
  }

  for (let i = 0; i < 280 && reeds.length < 160; i += 1) {
    const u = 0.08 + hash(i * 13) * 0.84
    const side = i % 2 === 0 ? 1 : -1
    const v = riverCenter(u) + side * (w * 0.92 + hash(i) * 0.02)
    if (v < 0.06 || v > 0.94) continue
    if (riverMask(u, v, sea) > 0.62) continue
    if (floodplainMask(u, v, sea) < 0.2) continue
    reeds.push({ u, v, yaw: hash(i + 1) * Math.PI * 2, scale: 0.75 + hash(i + 3) * 0.5 })
  }

  for (let i = 0; i < 160 && rocks.length < 42; i += 1) {
    const u = hash(i * 17 + 4)
    const v = riverCenter(u) + (hash(i * 3) - 0.5) * (w * 2.2)
    if (v < 0.07 || v > 0.93) continue
    if (corridorMask(u, v, sea) < 0.12) continue
    rocks.push({ u, v, yaw: hash(i) * Math.PI * 2, scale: 0.55 + hash(i + 5) * 0.7 })
  }

  for (let i = 0; i < 90 && wood.length < 22; i += 1) {
    const u = 0.14 + hash(i * 19) * 0.72
    const side = i % 2 === 0 ? 1 : -1
    const v = riverCenter(u) + side * (w + 0.02 + hash(i) * 0.012)
    if (floodplainMask(u, v, sea) < 0.15) continue
    wood.push({ u, v, yaw: hash(i + 8) * Math.PI * 2, scale: 0.85 + hash(i) * 0.3 })
  }

  const speciesCycle: RiparianSpecies[] = ['willow', 'aspen', 'poplar', 'alder', 'birch', 'maple']
  for (let i = 0; i < 500 && trees.length < 96; i += 1) {
    const u = hash(i * 23 + 6)
    const v = hash(i * 29 + 1)
    const n = heightAt(field, params, u, v)
    const d = Math.abs(v - riverCenter(u))
    if (n < 0.05 || n > 0.24) continue
    if (corridorMask(u, v, sea) > 0.18) continue
    if (slope(field, params, u, v) > 6.2) continue
    if (hash(i + 21) > 0.62) continue
    let species: RiparianSpecies = 'maple'
    if (d < w + 0.2) species = speciesCycle[i % 3]
    else species = speciesCycle[3 + (i % 3)]
    trees.push({
      id: `T-${species}-${Math.round(u * 10000)}-${Math.round(v * 10000)}`,
      u,
      v,
      species,
      yaw: hash(i + 12) * Math.PI * 2,
      scale: 0.72 + hash(i + 14) * 0.5,
    })
  }

  return { grass, shrubs, reeds, rocks, wood, trees }
}
