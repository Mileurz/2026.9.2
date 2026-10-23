import type { User } from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import { completeParams, type NoiseParams } from './perlin'

export type SiteSave = {
  params: NoiseParams
  tab: 'model' | 'voxel' | 'tree' | 'colony'
  mapOpen: boolean
  simOpen: boolean
  speed: number
  note: string
}

export function userDocPath(uid: string) {
  return doc(db!, 'users', uid)
}

export async function loadUserSite(user: User): Promise<SiteSave | null> {
  if (!db) return null
  const snap = await getDoc(userDocPath(user.uid))
  if (!snap.exists()) return null
  const data = snap.data()
  return {
    params: completeParams(data.params),
    tab:
      data.tab === 'voxel'
        ? 'voxel'
        : data.tab === 'tree'
          ? 'tree'
          : data.tab === 'colony'
            ? 'colony'
            : 'model',
    mapOpen: data.mapOpen !== false,
    simOpen: data.simOpen !== false,
    speed: typeof data.speed === 'number' ? data.speed : 1,
    note: typeof data.note === 'string' ? data.note : '',
  }
}

export async function saveUserSite(user: User, site: SiteSave) {
  if (!db) return
  await setDoc(userDocPath(user.uid), {
    email: user.email,
    params: site.params,
    tab: site.tab,
    mapOpen: site.mapOpen,
    simOpen: site.simOpen,
    speed: site.speed,
    note: site.note,
    updatedAt: Date.now(),
  })
}
