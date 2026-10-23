export type BeaverTask =
  | 'REST'
  | 'EXPLORE_SHORE'
  | 'SWIM'
  | 'FIND_TREE'
  | 'MOVE_TO_TREE'
  | 'CHEW_TREE'
  | 'RETURN_HOME'
  | 'FIND_BRANCH'
  | 'MOVE_TO_BRANCH'
  | 'PICK_UP_BRANCH'
  | 'CARRY_TO_STORAGE'
  | 'FIND_BUILDING_MATERIAL'
  | 'COLLECT_BRANCH'
  | 'TRANSPORT_BRANCH'
  | 'BUILD_DAM'
  | 'DAM_MAINTENANCE'
  | 'BUILD_LODGE'
  | 'LODGE_MAINTENANCE'
  | 'DISPERSE_ALONG_WATER'
  | 'SEARCH_HABITAT'
  | 'EVALUATE_SITE'

export type LifeStage = 'kit' | 'yearling' | 'subadult' | 'adult'
export type Sex = 'female' | 'male'

export type Uv = { u: number; v: number }

export type BeaverAgent = {
  id: string
  age: number
  sex: Sex
  lifeStage: LifeStage
  mother: string | null
  father: string | null
  partner: string | null
  offspring: string[]
  homeLodge: string
  energy: number
  hunger: number
  health: number
  /** UV position on the land (0–1). Kept in sync with `u` / `v`. */
  position: Uv
  u: number
  v: number
  heading: number
  speed: number
  homeLocation: Uv
  currentTask: BeaverTask
  targetTreeId: string | null
  targetBranchId: string | null
  targetU: number
  targetV: number
  taskAge: number
  carrying: boolean
  carryGoal: 'dam' | 'lodge' | 'cache' | null
  status: 'resident' | 'dispersing' | 'settled'
  dispersalSign: number
  wet: number
}

export function sexLabel(sex: Sex) {
  return sex === 'female' ? 'Female' : 'Male'
}

export function kinLabel(id: string | null | undefined) {
  return id && id.length > 0 ? id : '—'
}

export function offspringLabel(ids: string[] | undefined) {
  if (!ids || ids.length === 0) return '—'
  return ids.join(', ')
}

export function ageLabel(age: number) {
  if (age < 1) return `${(age * 12).toFixed(1)} mo`
  return `${age.toFixed(1)} yr`
}

export function lifeStageLabel(stage: LifeStage) {
  switch (stage) {
    case 'kit':
      return 'Kit'
    case 'yearling':
      return 'Yearling'
    case 'subadult':
      return 'Subadult'
    case 'adult':
      return 'Adult'
  }
}

export function statusLabel(status: BeaverAgent['status'] | undefined) {
  switch (status) {
    case 'dispersing':
      return 'Dispersing'
    case 'settled':
      return 'Settled'
    default:
      return 'Resident'
  }
}

export function taskLabel(task: BeaverTask) {
  switch (task) {
    case 'REST':
      return 'Resting'
    case 'EXPLORE_SHORE':
      return 'Exploring shoreline'
    case 'SWIM':
      return 'Swimming'
    case 'FIND_TREE':
      return 'Searching for a tree'
    case 'MOVE_TO_TREE':
      return 'Approaching a tree'
    case 'CHEW_TREE':
      return 'Chewing a tree'
    case 'RETURN_HOME':
      return 'Returning toward home'
    case 'FIND_BRANCH':
      return 'Looking for a branch'
    case 'MOVE_TO_BRANCH':
      return 'Approaching a branch'
    case 'PICK_UP_BRANCH':
      return 'Picking up a branch'
    case 'CARRY_TO_STORAGE':
      return 'Caching food'
    case 'FIND_BUILDING_MATERIAL':
      return 'Finding building material'
    case 'COLLECT_BRANCH':
      return 'Collecting a branch'
    case 'TRANSPORT_BRANCH':
      return 'Transporting a branch'
    case 'BUILD_DAM':
      return 'Building the dam'
    case 'DAM_MAINTENANCE':
      return 'Maintaining the dam'
    case 'BUILD_LODGE':
      return 'Building the lodge'
    case 'LODGE_MAINTENANCE':
      return 'Maintaining the lodge'
    case 'DISPERSE_ALONG_WATER':
      return 'Dispersing along the waterway'
    case 'SEARCH_HABITAT':
      return 'Searching for habitat'
    case 'EVALUATE_SITE':
      return 'Evaluating a site'
  }
}

export function poseForTask(task: BeaverTask, swimming: boolean, carrying = false) {
  if (task === 'REST') return 'rest' as const
  if (task === 'CHEW_TREE' || task === 'PICK_UP_BRANCH') return 'chew' as const
  if (swimming || task === 'SWIM' || task === 'DISPERSE_ALONG_WATER') return 'swim' as const
  if (carrying || task === 'CARRY_TO_STORAGE' || task === 'TRANSPORT_BRANCH') return 'carry' as const
  if (
    task === 'BUILD_DAM' ||
    task === 'DAM_MAINTENANCE' ||
    task === 'BUILD_LODGE' ||
    task === 'LODGE_MAINTENANCE' ||
    task === 'EVALUATE_SITE'
  ) {
    return 'chew' as const
  }
  if (
    task === 'MOVE_TO_TREE' ||
    task === 'FIND_TREE' ||
    task === 'EXPLORE_SHORE' ||
    task === 'RETURN_HOME' ||
    task === 'MOVE_TO_BRANCH' ||
    task === 'FIND_BRANCH' ||
    task === 'FIND_BUILDING_MATERIAL' ||
    task === 'COLLECT_BRANCH' ||
    task === 'SEARCH_HABITAT'
  ) {
    return 'walk' as const
  }
  return swimming ? ('swim' as const) : ('walk' as const)
}
