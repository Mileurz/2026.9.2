export const SIM_TICK = 1 / 30
/** Cap work per display frame so 20×/100× cannot freeze the laptop. */
export const MAX_TICKS_PER_FRAME = 18
export const MAX_FRAME_DT = 0.05
export const MAX_MOTION_DT = 0.04
export const DAYS_PER_YEAR = 365
/** About 2.4 minutes per year at 1×, so seasons and gestation stay readable. */
export const SECONDS_PER_SIM_DAY = 0.4
export const YEAR_RATE = 1 / (SECONDS_PER_SIM_DAY * DAYS_PER_YEAR)

export const SIM_SPEEDS = [1, 5, 20, 100] as const
export type SimSpeed = (typeof SIM_SPEEDS)[number]

export type SimClock = {
  paused: boolean
  speed: SimSpeed
  days: number
  acc: number
}

const MONTHS = [
  { name: 'January', days: 31 },
  { name: 'February', days: 28 },
  { name: 'March', days: 31 },
  { name: 'April', days: 30 },
  { name: 'May', days: 31 },
  { name: 'June', days: 30 },
  { name: 'July', days: 31 },
  { name: 'August', days: 31 },
  { name: 'September', days: 30 },
  { name: 'October', days: 31 },
  { name: 'November', days: 30 },
  { name: 'December', days: 31 },
] as const

/** Start in early autumn, when a founding pair would cut wood, raise a dam, and cache food. */
export const START_DAYS = 1 + 0.68 * DAYS_PER_YEAR

export function emptyClock(): SimClock {
  return { paused: false, speed: 5, days: START_DAYS, acc: 0 }
}

export function yearFromDays(days: number) {
  return Math.max(0, (days - 1) / DAYS_PER_YEAR)
}

export function ensureClock(clock: SimClock | undefined): SimClock {
  if (!clock) return emptyClock()
  if (clock.days === undefined) clock.days = 1
  if (clock.acc === undefined) clock.acc = 0
  if (clock.speed === undefined) clock.speed = 1
  if (clock.paused === undefined) clock.paused = false
  return clock
}

export function monthFromDayOfYear(dayOfYear: number) {
  let d = Math.min(DAYS_PER_YEAR, Math.max(1, Math.floor(dayOfYear)))
  for (const month of MONTHS) {
    if (d <= month.days) return month.name
    d -= month.days
  }
  return 'December'
}

export function calendarOf(clock: SimClock) {
  const elapsed = Math.max(1, clock.days)
  const day = Math.floor(elapsed)
  const year = Math.floor((elapsed - 1) / DAYS_PER_YEAR) + 1
  const dayOfYear = Math.floor((elapsed - 1) % DAYS_PER_YEAR) + 1
  return {
    year,
    month: monthFromDayOfYear(dayOfYear),
    day,
    dayOfYear,
  }
}

export function setSimSpeed(clock: SimClock, speed: SimSpeed) {
  clock.paused = false
  clock.speed = speed
}

export function pauseSim(clock: SimClock) {
  clock.paused = true
  clock.acc = 0
}

/** Pull a FPS-independent slice of simulation time. Motion stays capped so high speed does not teleport agents. */
export function consumeSimTime(clock: SimClock, realDt: number) {
  const space = ensureClock(clock)
  if (space.paused) return { simDt: 0, motionDt: 0, days: 0 }
  const frame = Math.min(MAX_FRAME_DT, Math.max(0, realDt))
  space.acc += frame * space.speed
  let simDt = 0
  let n = 0
  while (space.acc >= SIM_TICK && n < MAX_TICKS_PER_FRAME) {
    space.acc -= SIM_TICK
    simDt += SIM_TICK
    n += 1
  }
  if (n >= MAX_TICKS_PER_FRAME) space.acc = Math.min(space.acc, SIM_TICK)
  const days = simDt / SECONDS_PER_SIM_DAY
  space.days += days
  const motionDt = Math.min(MAX_MOTION_DT, frame * Math.min(space.speed, 2.2))
  return { simDt, motionDt, days }
}
