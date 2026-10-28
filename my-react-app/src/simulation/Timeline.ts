import type { ColonyState } from './Colony'
import { DAYS_PER_YEAR, START_DAYS, ensureClock, pauseSim } from './SimulationEngine'
import { colonyCensus } from './Population'
import { forestStats } from './TreeResource'

export const YEAR_AXIS = [0, 1, 2, 3, 5, 10, 20] as const
export const YEAR_SNAPSHOTS = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
] as const
export const AXIS_SPAN = 20

export const EVENT_KINDS = [
  'founding',
  'first-tree',
  'first-dam',
  'first-lodge',
  'first-kits',
  'major-pond',
  'first-dispersal',
  'secondary-dam',
  'wetland',
] as const

export type EcoEventKind = (typeof EVENT_KINDS)[number]

export const EVENT_LABELS: Record<EcoEventKind, string> = {
  founding: 'Founding Pair Arrives',
  'first-tree': 'First Tree Cut',
  'first-dam': 'First Dam',
  'first-lodge': 'First Lodge',
  'first-kits': 'First Kits',
  'major-pond': 'Major Pond Expansion',
  'first-dispersal': 'First Dispersal',
  'secondary-dam': 'Secondary Dam',
  wetland: 'Wetland Expansion',
}

export type LandscapeCard = {
  ageYears: number
  pondArea: number
  wetlandArea: number
  treesCut: number
  population: number
  damCompletion: number
}

export type HistorySnapshot = {
  id: string
  ageYears: number
  label: string
  event?: EcoEventKind
  yearMark?: number
  card: LandscapeCard
  colony: ColonyState
}

export type EcoEvent = {
  kind: EcoEventKind
  label: string
  ageYears: number
  snapshotId: string
}

export type ColonyHistory = {
  events: EcoEvent[]
  snapshots: HistorySnapshot[]
  seen: Partial<Record<EcoEventKind, true>>
  yearMarksTaken: number[]
  viewingId: string | null
  live: ColonyState | null
  baselineWetland: number
}

export function colonyAgeYears(colony: ColonyState) {
  const days = ensureClock(colony.clock).days
  const age = (days - START_DAYS) / DAYS_PER_YEAR
  return Number.isFinite(age) ? Math.max(0, age) : 0
}

export function emptyHistory(): ColonyHistory {
  return {
    events: [],
    snapshots: [],
    seen: {},
    yearMarksTaken: [],
    viewingId: null,
    live: null,
    baselineWetland: 0,
  }
}

export function ensureHistory(colony: ColonyState): ColonyHistory {
  if (!colony.history) colony.history = emptyHistory()
  return colony.history
}

export function landscapeCard(colony: ColonyState): LandscapeCard {
  const finite = (n: number) => (Number.isFinite(n) ? n : 0)
  const cut = colony.forest ? forestStats(colony.forest).treesCut : 0
  return {
    ageYears: colonyAgeYears(colony),
    pondArea: finite(colony.hydro?.pondArea ?? 0),
    wetlandArea: finite(colony.succession?.wetlandArea ?? 0),
    treesCut: finite(cut),
    population: colonyCensus(colony.beavers).population,
    damCompletion: finite(colony.dam?.completion ?? 0),
  }
}

function cloneBody(colony: ColonyState): ColonyState {
  return structuredClone({
    home: colony.home,
    storage: colony.storage,
    woodCollected: colony.woodCollected,
    beavers: colony.beavers,
    forest: colony.forest,
    dam: colony.dam,
    hydro: colony.hydro,
    lodge: colony.lodge,
    reproduction: colony.reproduction,
    territory: colony.territory,
    succession: colony.succession,
    wildlife: colony.wildlife,
    season: colony.season,
    clock: colony.clock,
    knobs: colony.knobs,
    willDam: colony.willDam,
    willDamDecided: colony.willDamDecided,
    landFitAt: colony.landFitAt,
  })
}

function applyBody(target: ColonyState, source: ColonyState) {
  const history = target.history
  Object.assign(target, structuredClone(source))
  target.history = history
}

function pushSnapshot(
  colony: ColonyState,
  label: string,
  event?: EcoEventKind,
  yearMark?: number,
) {
  const hist = ensureHistory(colony)
  const ageYears = colonyAgeYears(colony)
  const id = event ? `e:${event}` : yearMark != null ? `y:${yearMark}` : `t:${ageYears.toFixed(3)}`
  const snap: HistorySnapshot = {
    id,
    ageYears,
    label,
    event,
    yearMark,
    card: landscapeCard(colony),
    colony: cloneBody(colony),
  }
  const i = hist.snapshots.findIndex((s) => s.id === id)
  if (i >= 0) hist.snapshots[i] = snap
  else hist.snapshots.push(snap)
  hist.snapshots.sort((a, b) => a.ageYears - b.ageYears)
  return snap
}

function noteEvent(colony: ColonyState, kind: EcoEventKind) {
  const hist = ensureHistory(colony)
  if (hist.seen[kind]) return
  hist.seen[kind] = true
  const snap = pushSnapshot(colony, EVENT_LABELS[kind], kind)
  hist.events.push({
    kind,
    label: EVENT_LABELS[kind],
    ageYears: snap.ageYears,
    snapshotId: snap.id,
  })
}

export function seedTimeline(colony: ColonyState) {
  colony.history = emptyHistory()
  const hist = colony.history
  hist.baselineWetland = colony.succession?.wetlandArea ?? 0
  hist.yearMarksTaken.push(0)
  hist.seen.founding = true
  const snap = pushSnapshot(colony, EVENT_LABELS.founding, 'founding', 0)
  hist.events.push({
    kind: 'founding',
    label: EVENT_LABELS.founding,
    ageYears: 0,
    snapshotId: snap.id,
  })
}

export function recordTimeline(colony: ColonyState) {
  const hist = ensureHistory(colony)
  if (hist.viewingId) return
  const age = colonyAgeYears(colony)
  const cut = colony.forest ? forestStats(colony.forest).treesCut : 0
  const people = colonyCensus(colony.beavers)
  const dam = colony.dam
  const lodge = colony.lodge
  const hydro = colony.hydro
  const wetland = colony.succession?.wetlandArea ?? 0
  if (hist.baselineWetland <= 0 && wetland > 0) hist.baselineWetland = wetland

  for (const year of YEAR_SNAPSHOTS) {
    if (age + 1e-4 < year) break
    if (hist.yearMarksTaken.includes(year)) continue
    hist.yearMarksTaken.push(year)
    pushSnapshot(colony, year === 0 ? 'Year 0' : `Year ${year}`, undefined, year)
  }

  if (cut >= 1) noteEvent(colony, 'first-tree')
  if ((dam?.pieces.length ?? 0) >= 1 || (dam?.completion ?? 0) > 0.04) noteEvent(colony, 'first-dam')
  if ((lodge?.pieces.length ?? 0) >= 3 || (lodge && lodge.stage !== 'SMALL_BRANCH_PILE')) {
    noteEvent(colony, 'first-lodge')
  }
  if (people.kits >= 1) noteEvent(colony, 'first-kits')
  if (hist.seen['first-dam'] && ((hydro?.pondArea ?? 0) > 1.8 || (hydro?.floodedArea ?? 0) > 1.1)) {
    noteEvent(colony, 'major-pond')
  }
  if (colony.beavers.some((b) => (b.status ?? 'resident') === 'dispersing')) {
    noteEvent(colony, 'first-dispersal')
  }
  if (
    hist.seen['first-dam'] &&
    (dam?.completion ?? 0) >= 0.58 &&
    (dam?.pieces.length ?? 0) >= 12 &&
    age > (hist.events.find((e) => e.kind === 'first-dam')?.ageYears ?? 0) + 0.35
  ) {
    noteEvent(colony, 'secondary-dam')
  }
  if (
    hist.seen['first-dam'] &&
    wetland > hist.baselineWetland + 0.85 &&
    wetland > 1.35 &&
    (hydro?.pondArea ?? 0) > 0.35
  ) {
    noteEvent(colony, 'wetland')
  }
}

export function liveAgeYears(colony: ColonyState) {
  const hist = colony.history
  if (hist?.live) return colonyAgeYears(hist.live)
  return colonyAgeYears(colony)
}

export function restoreSnapshot(colony: ColonyState, snapshotId: string) {
  const hist = ensureHistory(colony)
  const snap = hist.snapshots.find((s) => s.id === snapshotId)
  if (!snap) return false
  if (!hist.viewingId) hist.live = cloneBody(colony)
  applyBody(colony, snap.colony)
  colony.history = hist
  hist.viewingId = snap.id
  pauseSim(ensureClock(colony.clock))
  return true
}

export function returnToLive(colony: ColonyState) {
  const hist = ensureHistory(colony)
  if (!hist.viewingId) return
  if (hist.live) applyBody(colony, hist.live)
  hist.viewingId = null
  hist.live = null
}

export function scrubToAge(colony: ColonyState, ageYears: number) {
  const hist = ensureHistory(colony)
  const liveAge = liveAgeYears(colony)
  if (ageYears >= liveAge - 0.02) {
    returnToLive(colony)
    return
  }
  let best: HistorySnapshot | null = null
  for (const snap of hist.snapshots) {
    if (snap.ageYears <= ageYears + 1e-6 && (!best || snap.ageYears >= best.ageYears)) best = snap
  }
  if (best) restoreSnapshot(colony, best.id)
}

export function viewingSnapshot(colony: ColonyState) {
  const hist = colony.history
  if (!hist?.viewingId) return null
  return hist.snapshots.find((s) => s.id === hist.viewingId) ?? null
}
