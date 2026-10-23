import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { Color, InstancedMesh, Object3D } from 'three'
import { getHeightField, sampleHeightField, type HeightField } from '../heightField'
import type { NoiseParams } from '../perlin'
import { carveRiver } from '../simulation/Hydrology'
import type { ColonyState } from '../simulation/Colony'
import { treeMetrics, type TreeResource, type TreeSpecies } from '../simulation/TreeResource'

const dummy = new Object3D()
const tint = new Color()
const trunkColor = new Color('#5a4636')
const paleBark = new Color('#d8d2c4')
const gnawColor = new Color('#6a4e32')
const chipColor = new Color('#c4a06a')
const stumpColor = new Color('#4a3828')
const stressedCanopy = new Color('#c4b06a')
const deadCanopy = new Color('#8a7a52')
const snagBark = new Color('#9a9488')
const deadBark = new Color('#4a4036')
const fallenDead = new Color('#6a6458')

const springLeaf = new Color('#7cb05a')
const autumnLeaf = new Color('#c47838')
const winterLeaf = new Color('#c8c2b0')

const canopyTint: Record<Exclude<TreeSpecies, 'other'>, string> = {
  willow: '#b4b258',
  aspen: '#9cba72',
  poplar: '#7c9c56',
  alder: '#4c6a40',
  birch: '#c4d2a0',
  maple: '#6a8646',
}

const KINDS: Exclude<TreeSpecies, 'other'>[] = ['willow', 'aspen', 'poplar', 'alder', 'birch', 'maple']

function groundY(field: HeightField, params: NoiseParams, u: number, v: number) {
  return carveRiver(sampleHeightField(field, u, v), u, v, params.seaLevel) * params.height
}

function fallEase(t: number) {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (1.15 - 0.15 * x)
}

function barkColor(tree: TreeResource, kind: TreeSpecies, out: Color) {
  if (tree.ecoState === 'snag') {
    out.copy(snagBark)
    return
  }
  if (tree.ecoState === 'dead' || tree.ecoState === 'fallen_dead') {
    out.copy(deadBark)
    return
  }
  out.copy(kind === 'birch' || kind === 'aspen' ? paleBark : trunkColor)
}

function leafColor(
  tree: TreeResource,
  kind: Exclude<TreeSpecies, 'other'>,
  out: Color,
  green = 0.5,
  warmth = 0,
  winter = 0,
) {
  out.set(canopyTint[kind])
  if (tree.ecoState === 'stressed') out.lerp(stressedCanopy, Math.min(1, (tree.floodStress ?? 0) * 1.15))
  else if (tree.ecoState === 'dead' || tree.ecoState === 'fallen_dead') {
    out.copy(deadCanopy)
    return
  }
  out.lerp(springLeaf, Math.min(0.45, green * 0.4))
  out.lerp(autumnLeaf, Math.min(0.7, warmth * 0.85))
  out.lerp(winterLeaf, Math.min(0.55, winter * 0.7))
}

function poseBase(tree: TreeResource, field: HeightField, params: NoiseParams) {
  const x = (tree.position.u - 0.5) * params.worldSize
  const z = (tree.position.v - 0.5) * params.worldSize
  const y = groundY(field, params, tree.position.u, tree.position.v)
  dummy.position.set(x, y, z)
  dummy.rotation.set(0, tree.fallHeading, 0)
  dummy.rotateX(fallEase(tree.fallProgress) * Math.PI * 0.5)
  dummy.rotateY(tree.yaw - tree.fallHeading)
  dummy.scale.set(1, 1, 1)
}

export function ForestField({
  params,
  offsetRef,
  colonyRef,
}: {
  params: NoiseParams
  offsetRef: MutableRefObject<{ x: number; y: number }>
  colonyRef: MutableRefObject<ColonyState>
}) {
  const trunkRefs = useRef<Record<string, InstancedMesh | null>>({})
  const canopyRefs = useRef<Record<string, InstancedMesh | null>>({})
  const stumpRef = useRef<InstancedMesh>(null)
  const boleRef = useRef<InstancedMesh>(null)
  const gnawRef = useRef<InstancedMesh>(null)
  const deepRef = useRef<InstancedMesh>(null)
  const chipRef = useRef<InstancedMesh>(null)
  const branchRef = useRef<InstancedMesh>(null)
  const species = useMemo(() => KINDS, [])

  useLayoutEffect(() => {
    for (const kind of species) {
      const trunks = trunkRefs.current[kind]
      const canopies = canopyRefs.current[kind]
      const fall = canopyRefs.current[`${kind}-fall`]
      if (trunks) trunks.count = 0
      if (canopies) canopies.count = 0
      if (fall) fall.count = 0
    }
    if (stumpRef.current) stumpRef.current.count = 0
    if (boleRef.current) boleRef.current.count = 0
    if (gnawRef.current) gnawRef.current.count = 0
    if (deepRef.current) deepRef.current.count = 0
    if (chipRef.current) chipRef.current.count = 0
    if (branchRef.current) branchRef.current.count = 0
  }, [species])

  useFrame(() => {
    const field = getHeightField(params, offsetRef.current.x, offsetRef.current.y)
    const forest = colonyRef.current.forest
    if (!forest) return
    const season = colonyRef.current.season
    const green = season?.green ?? 0.5
    const warmth = season?.warmth ?? 0
    const winter = season?.winter ?? 0
    const veg = 0.55 + 0.45 * (season?.vegetation ?? 1)
    const fit = params.worldSize / 7.2
    const cut = 0.05 * fit

    for (const kind of species) {
      const standing = forest.trees
        .filter((t) => t.source === 'riparian' && t.species === kind && t.fallProgress < 0.02)
        .slice(0, 64)
      const trunks = trunkRefs.current[kind]
      const canopies = canopyRefs.current[kind]
      standing.forEach((tree, i) => {
        const { height, trunkDiameter, tall } = treeMetrics(tree.species, tree.scale, params.worldSize)
        const x = (tree.position.u - 0.5) * params.worldSize
        const z = (tree.position.v - 0.5) * params.worldSize
        const y = groundY(field, params, tree.position.u, tree.position.v)
        const radius = trunkDiameter * 0.5
        const gnawed = tree.chewProgress > 0.18
        const boleH = gnawed ? Math.max(0.06, height - cut) : height
        dummy.position.set(x, y + (gnawed ? cut : 0) + boleH * 0.5, z)
        dummy.rotation.set(0, tree.yaw, 0)
        dummy.scale.set(radius, boleH, radius)
        dummy.updateMatrix()
        if (trunks) {
          trunks.setMatrixAt(i, dummy.matrix)
          barkColor(tree, kind, tint)
          trunks.setColorAt(i, tint)
        }
        const canopyW = kind === 'maple' ? 0.24 : kind === 'willow' ? 0.22 : kind === 'birch' ? 0.15 : 0.16
        const canopyH = kind === 'poplar' ? 0.3 : kind === 'willow' ? 0.12 : 0.17
        const leaf = (tree.ecoState === 'snag' ? 0.04 : 0.32 + 0.68 * (tree.canopy ?? 1)) * veg
        dummy.position.set(x, y + 0.42 * tall * tree.scale * fit, z)
        dummy.scale.set(
          canopyW * tree.scale * fit * leaf,
          canopyH * tall * tree.scale * fit * leaf,
          canopyW * tree.scale * fit * leaf,
        )
        dummy.updateMatrix()
        if (canopies) {
          canopies.setMatrixAt(i, dummy.matrix)
          leafColor(tree, kind, tint, green, warmth, winter)
          canopies.setColorAt(i, tint)
        }
      })
      if (trunks) {
        trunks.count = standing.length
        trunks.instanceMatrix.needsUpdate = true
        if (trunks.instanceColor) trunks.instanceColor.needsUpdate = true
      }
      if (canopies) {
        canopies.count = standing.length
        canopies.instanceMatrix.needsUpdate = true
        if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true
      }
    }

    const down = forest.trees.filter((t) => t.source === 'riparian' && t.fallProgress > 0.01)
    down.forEach((tree, i) => {
      const { height, trunkDiameter } = treeMetrics(tree.species, tree.scale, params.worldSize)
      poseBase(tree, field, params)
      dummy.translateY(cut + (height - cut) * 0.5)
      dummy.scale.set(trunkDiameter * 0.48, Math.max(0.04, height - cut), trunkDiameter * 0.48)
      dummy.updateMatrix()
      if (boleRef.current) {
        boleRef.current.setMatrixAt(i, dummy.matrix)
        tint.copy(tree.ecoState === 'fallen_dead' ? fallenDead : trunkColor)
        boleRef.current.setColorAt(i, tint)
      }
    })
    if (boleRef.current) {
      boleRef.current.count = down.length
      boleRef.current.instanceMatrix.needsUpdate = true
      if (boleRef.current.instanceColor) boleRef.current.instanceColor.needsUpdate = true
    }

    const fallingCanopy = down
    for (const kind of species) {
      const subset = fallingCanopy.filter((t) => t.species === kind)
      const canopies = canopyRefs.current[`${kind}-fall`]
      subset.forEach((tree, i) => {
        const { tall } = treeMetrics(tree.species, tree.scale, params.worldSize)
        poseBase(tree, field, params)
        dummy.translateY(0.42 * tall * tree.scale * fit)
        const canopyW = kind === 'maple' ? 0.24 : kind === 'willow' ? 0.22 : kind === 'birch' ? 0.15 : 0.16
        const canopyH = kind === 'poplar' ? 0.3 : kind === 'willow' ? 0.12 : 0.17
        const leaf = (tree.ecoState === 'fallen_dead' ? 0.45 : 0.32 + 0.68 * (tree.canopy ?? 1)) * veg
        dummy.scale.set(
          canopyW * tree.scale * fit * leaf,
          canopyH * tall * tree.scale * fit * leaf,
          canopyW * tree.scale * fit * leaf,
        )
        dummy.updateMatrix()
        if (canopies) {
          canopies.setMatrixAt(i, dummy.matrix)
          leafColor(tree, kind, tint, green, warmth, winter)
          canopies.setColorAt(i, tint)
        }
      })
      if (canopies) {
        canopies.count = subset.length
        canopies.instanceMatrix.needsUpdate = true
        if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true
      }
    }

    const stumps = forest.trees.filter(
      (t) => t.source === 'riparian' && (t.chewProgress > 0.18 || t.fallProgress > 0),
    )
    stumps.forEach((tree, i) => {
      const { trunkDiameter } = treeMetrics(tree.species, tree.scale, params.worldSize)
      const x = (tree.position.u - 0.5) * params.worldSize
      const z = (tree.position.v - 0.5) * params.worldSize
      const y = groundY(field, params, tree.position.u, tree.position.v)
      dummy.position.set(x, y + cut * 0.5, z)
      dummy.rotation.set(0, tree.yaw, 0)
      dummy.scale.set(trunkDiameter * 0.52, cut, trunkDiameter * 0.52)
      dummy.updateMatrix()
      stumpRef.current?.setMatrixAt(i, dummy.matrix)
    })
    if (stumpRef.current) {
      stumpRef.current.count = stumps.length
      stumpRef.current.instanceMatrix.needsUpdate = true
    }

    const gnawed = forest.trees.filter(
      (t) => t.source === 'riparian' && t.fallProgress < 0.02 && t.chewProgress >= 0.2,
    )
    gnawed.forEach((tree, i) => {
      const { trunkDiameter } = treeMetrics(tree.species, tree.scale, params.worldSize)
      const x = (tree.position.u - 0.5) * params.worldSize
      const z = (tree.position.v - 0.5) * params.worldSize
      const y = groundY(field, params, tree.position.u, tree.position.v)
      const pinch = tree.chewProgress < 0.55 ? 0.82 : 0.48
      dummy.position.set(x, y + cut, z)
      dummy.rotation.set(0, tree.yaw, 0)
      dummy.scale.set(trunkDiameter * pinch, cut * 0.55, trunkDiameter * 1.05)
      dummy.updateMatrix()
      gnawRef.current?.setMatrixAt(i, dummy.matrix)
    })
    if (gnawRef.current) {
      gnawRef.current.count = gnawed.length
      gnawRef.current.instanceMatrix.needsUpdate = true
    }

    const deep = gnawed.filter((t) => t.chewProgress >= 0.55)
    deep.forEach((tree, i) => {
      const { trunkDiameter } = treeMetrics(tree.species, tree.scale, params.worldSize)
      const x = (tree.position.u - 0.5) * params.worldSize
      const z = (tree.position.v - 0.5) * params.worldSize
      const y = groundY(field, params, tree.position.u, tree.position.v)
      dummy.position.set(x, y + cut * 0.85, z)
      dummy.rotation.set(0, tree.yaw, 0)
      dummy.scale.set(trunkDiameter * 1.15, cut * 0.7, trunkDiameter * 0.38)
      dummy.updateMatrix()
      deepRef.current?.setMatrixAt(i, dummy.matrix)
    })
    if (deepRef.current) {
      deepRef.current.count = deep.length
      deepRef.current.instanceMatrix.needsUpdate = true
    }

    let chipCount = 0
    for (const tree of forest.trees) {
      if (tree.source !== 'riparian' || tree.chewProgress < 0.12) continue
      const n = Math.min(10, 2 + Math.floor(tree.chewProgress * 8))
      const x = (tree.position.u - 0.5) * params.worldSize
      const z = (tree.position.v - 0.5) * params.worldSize
      const y = groundY(field, params, tree.position.u, tree.position.v)
      for (let k = 0; k < n && chipCount < 220; k += 1) {
        const a = tree.yaw + k * 1.2 + tree.chewProgress
        const r = 0.03 + (k % 3) * 0.012
        dummy.position.set(x + Math.sin(a) * r, y + 0.008 * fit, z + Math.cos(a) * r)
        dummy.rotation.set(0.4, a, 0.2)
        dummy.scale.set(0.012 * fit, 0.006 * fit, 0.02 * fit)
        dummy.updateMatrix()
        chipRef.current?.setMatrixAt(chipCount, dummy.matrix)
        chipCount += 1
      }
    }
    if (chipRef.current) {
      chipRef.current.count = chipCount
      chipRef.current.instanceMatrix.needsUpdate = true
    }

    const loose = forest.branches.filter((br) => !br.carriedBy && !br.inDam && !br.inLodge)
    loose.forEach((br, i) => {
      const x = (br.u - 0.5) * params.worldSize
      const z = (br.v - 0.5) * params.worldSize
      const y = groundY(field, params, br.u, br.v)
      const lift = br.stored ? 0.016 * fit + (i % 4) * 0.006 * fit : 0.01 * fit
      dummy.position.set(x, y + lift, z)
      dummy.rotation.set(Math.PI * 0.5, br.yaw, br.stored ? 0.18 : 0.08)
      dummy.scale.set(0.01 * fit, br.length * 0.11 * fit, 0.01 * fit)
      dummy.updateMatrix()
      branchRef.current?.setMatrixAt(i, dummy.matrix)
    })
    if (branchRef.current) {
      branchRef.current.count = loose.length
      branchRef.current.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <group>
      {species.map((kind) => (
        <group key={kind}>
          <instancedMesh
            ref={(node) => {
              trunkRefs.current[kind] = node
            }}
            args={[undefined, undefined, 64]}
            frustumCulled={false}
            raycast={() => {}}
            castShadow
          >
            <cylinderGeometry args={[1, 1.12, 1, 6]} />
            <meshStandardMaterial color={kind === 'birch' || kind === 'aspen' ? paleBark : trunkColor} roughness={0.92} />
          </instancedMesh>
          <instancedMesh
            ref={(node) => {
              canopyRefs.current[kind] = node
            }}
            args={[undefined, undefined, 64]}
            frustumCulled={false}
            raycast={() => {}}
            castShadow
            receiveShadow
          >
            <icosahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color={canopyTint[kind]} roughness={0.88} />
          </instancedMesh>
          <instancedMesh
            ref={(node) => {
              canopyRefs.current[`${kind}-fall`] = node
            }}
            args={[undefined, undefined, 48]}
            frustumCulled={false}
            raycast={() => {}}
            castShadow
          >
            <icosahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color={canopyTint[kind]} roughness={0.88} />
          </instancedMesh>
        </group>
      ))}
      <instancedMesh ref={stumpRef} args={[undefined, undefined, 120]} frustumCulled={false} raycast={() => {}} castShadow>
        <cylinderGeometry args={[1, 1.08, 1, 7]} />
        <meshStandardMaterial color={stumpColor} roughness={0.94} />
      </instancedMesh>
      <instancedMesh ref={boleRef} args={[undefined, undefined, 120]} frustumCulled={false} raycast={() => {}} castShadow>
        <cylinderGeometry args={[1, 1.05, 1, 6]} />
        <meshStandardMaterial color={trunkColor} roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={gnawRef} args={[undefined, undefined, 80]} frustumCulled={false} raycast={() => {}}>
        <cylinderGeometry args={[1, 1, 1, 8]} />
        <meshStandardMaterial color={gnawColor} roughness={0.86} />
      </instancedMesh>
      <instancedMesh ref={deepRef} args={[undefined, undefined, 80]} frustumCulled={false} raycast={() => {}}>
        <coneGeometry args={[1, 1, 6]} />
        <meshStandardMaterial color="#3d2c1c" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={chipRef} args={[undefined, undefined, 220]} frustumCulled={false} raycast={() => {}}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={chipColor} roughness={0.82} />
      </instancedMesh>
      <instancedMesh ref={branchRef} args={[undefined, undefined, 240]} frustumCulled={false} raycast={() => {}} castShadow>
        <cylinderGeometry args={[1, 1.1, 1, 5]} />
        <meshStandardMaterial color={chipColor} roughness={0.8} />
      </instancedMesh>
    </group>
  )
}
