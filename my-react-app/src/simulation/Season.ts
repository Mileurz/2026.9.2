import {
  isInundated,
  riverMask,
  streamAlong,
  type HydroState,
} from './Hydrology'
import { YEAR_RATE, yearFromDays } from './SimulationEngine'

export type SeasonName = 'SPRING' | 'SUMMER' | 'AUTUMN' | 'WINTER'

export type SeasonState = {
  year: number
  phase: number
  name: SeasonName
  spring: number
  summer: number
  autumn: number
  winter: number
  green: number
  warmth: number
  vegetation: number
  snow: number
  ice: number
  flow: number
  activity: number
  mate: number
  breed: number
  disperse: number
  feed: number
  build: number
  cache: number
}

function clamp(value: number, a: number, b: number) {
  return Math.min(b, Math.max(a, value))
}

function wrapDist(phase: number, center: number) {
  const d = Math.abs(phase - center)
  return Math.min(d, 1 - d)
}

function bump(phase: number, center: number, width: number) {
  const t = clamp(1 - wrapDist(phase, center) / width, 0, 1)
  return t * t * (3 - 2 * t)
}

export function emptySeason(): SeasonState {
  return fillSeason({
    year: 0.68,
    phase: 0.68,
    name: 'AUTUMN',
    spring: 0,
    summer: 0,
    autumn: 1,
    winter: 0,
    green: 0.28,
    warmth: 0.45,
    vegetation: 0.52,
    snow: 0.06,
    ice: 0,
    flow: 0.78,
    activity: 1,
    mate: 0,
    breed: 0,
    disperse: 0,
    feed: 1,
    build: 1,
    cache: 1,
  })
}

export function ensureSeason(space: SeasonState | undefined): SeasonState {
  if (!space) return emptySeason()
  if (space.year === undefined) space.year = 0.68
  if (space.mate === undefined) space.mate = 0
  if (space.disperse === undefined) space.disperse = 0
  if (space.phase === undefined) space.phase = space.year % 1
  return fillSeason(space)
}

export function seasonLabel(name: SeasonName) {
  switch (name) {
    case 'SPRING':
      return 'Spring'
    case 'SUMMER':
      return 'Summer'
    case 'AUTUMN':
      return 'Autumn'
    case 'WINTER':
      return 'Winter'
  }
}

function fillSeason(state: SeasonState): SeasonState {
  const phase = ((state.year % 1) + 1) % 1
  const spring = bump(phase, 0.14, 0.22)
  const summer = bump(phase, 0.4, 0.22)
  const autumn = bump(phase, 0.64, 0.2)
  const winter = bump(phase, 0.9, 0.22)
  const sum = spring + summer + autumn + winter || 1
  state.phase = phase
  state.spring = spring / sum
  state.summer = summer / sum
  state.autumn = autumn / sum
  state.winter = winter / sum
  const s = state.spring
  const u = state.summer
  const a = state.autumn
  const w = state.winter
  state.green = s * 1 + u * 0.72 + a * 0.28 + w * 0.08
  state.warmth = u * 1 + a * 0.48 + s * 0.22 + w * 0.02
  state.vegetation = s * 0.72 + u * 1 + a * 0.52 + w * 0.16
  state.snow = w * 0.92 + a * 0.06
  state.ice = w * 0.82
  state.flow = s * 1.38 + u * 0.92 + a * 0.78 + w * 0.32
  state.activity = a * 1 + s * 0.7 + u * 0.78 + w * 0.2
  state.mate = Math.max(bump(phase, 0.09, 0.12), w * 0.52)
  state.breed = bump(phase, 0.38, 0.1)
  state.disperse = bump(phase, 0.26, 0.11)
  state.feed = a * 1 + u * 0.62 + s * 0.48 + w * 0.12
  state.build = a * 1 + s * 0.58 + u * 0.28 + w * 0.06
  state.cache = a * 1 + w * 0.1
  let name: SeasonName = 'SPRING'
  let best = state.spring
  if (state.summer > best) {
    name = 'SUMMER'
    best = state.summer
  }
  if (state.autumn > best) {
    name = 'AUTUMN'
    best = state.autumn
  }
  if (state.winter > best) name = 'WINTER'
  state.name = name
  return state
}

export function applySeasonKnobs(
  state: SeasonState,
  knobs: {
    activity: number
    breed: number
    vegetation: number
    snow: number
    flow: number
  },
) {
  const space = ensureSeason(state)
  space.green = clamp(space.green * knobs.vegetation, 0, 1)
  space.vegetation = clamp(space.vegetation * knobs.vegetation, 0, 1)
  space.snow = clamp(space.snow * knobs.snow, 0, 1)
  space.ice = clamp(space.ice * knobs.snow, 0, 1)
  space.activity = clamp(space.activity * knobs.activity, 0.08, 1.2)
  space.mate = clamp(space.mate * knobs.breed, 0, 1)
  space.breed = clamp(space.breed * knobs.breed, 0, 1)
  space.feed = clamp(space.feed * knobs.activity, 0.08, 1)
  space.build = clamp(space.build * knobs.activity, 0.05, 1)
  space.flow = clamp(space.flow * knobs.flow, 0.15, 2.2)
  return space
}

export function stepSeasonFromDays(state: SeasonState, days: number) {
  const space = ensureSeason(state)
  space.year = yearFromDays(days)
  return fillSeason(space)
}

export function stepSeason(state: SeasonState, dt: number) {
  const space = ensureSeason(state)
  space.year += Math.min(0.05, dt) * YEAR_RATE
  return fillSeason(space)
}

export function iceCover(
  u: number,
  v: number,
  n: number,
  hydro: HydroState,
  sea: number,
  season: SeasonState,
) {
  if (season.ice < 0.08) return 0
  if (!isInundated(n, u, v, hydro, sea)) return 0
  const still = 1 - riverMask(u, v, sea) * 0.72
  const pond = streamAlong(u, hydro) < 0.02 ? 1 : 0.28
  return clamp(season.ice * still * pond, 0, 1)
}
