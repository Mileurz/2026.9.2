/** Render-only scale. Simulation units stay unchanged. */

import { Sphere, Vector3, type InstancedMesh } from 'three'

export const BEAVER_DRAW = 0.76
export const TREE_DRAW = 3.05
export const STEM_DRAW = 2.12
export const LODGE_DRAW = 2.32
export const BRANCH_DRAW = 1.88

const WORLD_CENTER = new Vector3(0, 0.42, 0)

/** Keep instanced fields cullable without recomputing per-instance bounds every frame. */
export function bindWorldCull(mesh: InstancedMesh | null, worldSize = 7.2) {
  if (!mesh) return
  mesh.frustumCulled = true
  if (!mesh.boundingSphere) mesh.boundingSphere = new Sphere()
  mesh.boundingSphere.center.copy(WORLD_CENTER)
  mesh.boundingSphere.radius = worldSize * 0.82
}
