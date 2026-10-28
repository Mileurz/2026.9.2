import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { Color, InstancedMesh, Object3D, Vector3 } from 'three'
import { getHeightField, sampleHeightField, type HeightField } from '../heightField'
import type { NoiseParams } from '../perlin'
import { cappedWaterN, carveRiver, defaultHydro } from '../simulation/Hydrology'
import type { ColonyState } from '../simulation/Colony'
import { treeMetrics, type TreeResource, type TreeSpecies } from '../simulation/TreeResource'
import { BRANCH_DRAW, TREE_DRAW, bindWorldCull } from '../visual'

/** Temporary instanced stand-ins. Replace later with species GLB trees (willow, aspen, alder, birch, maple, poplar). */

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
const STANDING_MAX = 96
const FALL_MAX = 64
const CHIP_MAX = 140
const camPos = new Vector3()

function finishMesh(mesh: InstancedMesh | null, n: number, worldSize: number, colors = false) {
  if (!mesh) return
  mesh.count = n
  mesh.instanceMatrix.needsUpdate = true
  if (colors && mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  bindWorldCull(mesh, worldSize)
}

function groundY(field: HeightField, params: NoiseParams, u: number, v: number) {
  return sampleHeightField(field, u, v) * params.height
}

function branchY(field: HeightField, params: NoiseParams, u: number, v: number, hydro = defaultHydro) {
  const raw = sampleHeightField(field, u, v)
  const n = carveRiver(raw, u, v, params.seaLevel)
  const water = cappedWaterN(n, raw, u, v, hydro, params.seaLevel)
  return Math.max(raw, water) * params.height
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
  const { camera } = useThree()
  const tick = useRef(0)
  const finger = useRef('')

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
    const cut = 0.07 * fit
    camera.getWorldPosition(camPos)
    tick.current += 1
    let chewSum = 0
    let fallSum = 0
    let falling = false
    for (const tree of forest.trees) {
      chewSum += tree.chewProgress
      fallSum += tree.fallProgress
      if (tree.fallProgress > 0.01 && tree.fallProgress < 0.99) falling = true
    }
    const key = `${forest.trees.length}|${forest.branches.length}|${green.toFixed(2)}|${winter.toFixed(2)}|${veg.toFixed(2)}|${Math.round(chewSum * 16)}|${Math.round(fallSum * 40)}`
    if (!falling && key === finger.current && tick.current % 8 !== 0) return
    finger.current = key

    const standing: Record<string, TreeResource[]> = {
      willow: [],
      aspen: [],
      poplar: [],
      alder: [],
      birch: [],
      maple: [],
    }
    const down: TreeResource[] = []
    for (const tree of forest.trees) {
      if (tree.source !== 'riparian') continue
      if (tree.fallProgress > 0.01) {
        if (down.length < FALL_MAX) down.push(tree)
        continue
      }
      const bucket = standing[tree.species]
      if (bucket && bucket.length < STANDING_MAX) bucket.push(tree)
    }

    for (const kind of species) {
      const list = standing[kind] ?? []
      const trunks = trunkRefs.current[kind]
      const canopies = canopyRefs.current[kind]
      list.forEach((tree, i) => {
        const { height, trunkDiameter, tall } = treeMetrics(tree.species, tree.scale, params.worldSize)
        const visH = height * TREE_DRAW
        const x = (tree.position.u - 0.5) * params.worldSize
        const z = (tree.position.v - 0.5) * params.worldSize
        const y = groundY(field, params, tree.position.u, tree.position.v)
        const radius = trunkDiameter * 0.5 * TREE_DRAW * 0.78
        const gnawed = tree.chewProgress > 0.18
        const boleH = gnawed ? Math.max(0.08, visH - cut) : visH
        dummy.position.set(x, y + (gnawed ? cut : 0) + boleH * 0.5, z)
        dummy.rotation.set(0, tree.yaw, 0.02 * ((tree.yaw % 1) - 0.5))
        dummy.scale.set(radius, boleH, radius)
        dummy.updateMatrix()
        if (trunks) {
          trunks.setMatrixAt(i, dummy.matrix)
          barkColor(tree, kind, tint)
          trunks.setColorAt(i, tint)
        }
        const canopyW = kind === 'maple' ? 0.24 : kind === 'willow' ? 0.26 : kind === 'birch' ? 0.15 : 0.17
        const canopyH = kind === 'poplar' ? 0.34 : kind === 'willow' ? 0.11 : 0.18
        const leaf = (tree.ecoState === 'snag' ? 0.03 : 0.28 + 0.72 * (tree.canopy ?? 1)) * veg
        dummy.position.set(x, y + visH * 0.76, z)
        dummy.scale.set(
          canopyW * tree.scale * fit * leaf * TREE_DRAW * 0.82,
          canopyH * tall * tree.scale * fit * leaf * TREE_DRAW * 0.82,
          canopyW * tree.scale * fit * leaf * TREE_DRAW * 0.82,
        )
        dummy.updateMatrix()
        if (canopies) {
          canopies.setMatrixAt(i, dummy.matrix)
          leafColor(tree, kind, tint, green, warmth, winter)
          canopies.setColorAt(i, tint)
        }
      })
      finishMesh(trunks, list.length, params.worldSize, true)
      finishMesh(canopies, list.length, params.worldSize, true)
    }

    down.forEach((tree, i) => {
      const { height, trunkDiameter } = treeMetrics(tree.species, tree.scale, params.worldSize)
      const visH = height * TREE_DRAW
      poseBase(tree, field, params)
      dummy.translateY(cut + (visH - cut) * 0.5)
      dummy.scale.set(
        trunkDiameter * 0.48 * TREE_DRAW * 0.78,
        Math.max(0.05, visH - cut),
        trunkDiameter * 0.48 * TREE_DRAW * 0.78,
      )
      dummy.updateMatrix()
      if (boleRef.current) {
        boleRef.current.setMatrixAt(i, dummy.matrix)
        tint.copy(tree.ecoState === 'fallen_dead' ? fallenDead : trunkColor)
        boleRef.current.setColorAt(i, tint)
      }
    })
    finishMesh(boleRef.current, down.length, params.worldSize, true)

    for (const kind of species) {
      const subset = down.filter((t) => t.species === kind)
      const canopies = canopyRefs.current[`${kind}-fall`]
      subset.forEach((tree, i) => {
        const { height, tall } = treeMetrics(tree.species, tree.scale, params.worldSize)
        poseBase(tree, field, params)
        dummy.translateY(height * TREE_DRAW * 0.76)
        const canopyW = kind === 'maple' ? 0.24 : kind === 'willow' ? 0.26 : kind === 'birch' ? 0.15 : 0.17
        const canopyH = kind === 'poplar' ? 0.34 : kind === 'willow' ? 0.11 : 0.18
        const leaf = (tree.ecoState === 'fallen_dead' ? 0.38 : 0.28 + 0.72 * (tree.canopy ?? 1)) * veg
        dummy.scale.set(
          canopyW * tree.scale * fit * leaf * TREE_DRAW * 0.82,
          canopyH * tall * tree.scale * fit * leaf * TREE_DRAW * 0.82,
          canopyW * tree.scale * fit * leaf * TREE_DRAW * 0.82,
        )
        dummy.updateMatrix()
        if (canopies) {
          canopies.setMatrixAt(i, dummy.matrix)
          leafColor(tree, kind, tint, green, warmth, winter)
          canopies.setColorAt(i, tint)
        }
      })
      finishMesh(canopies, subset.length, params.worldSize, true)
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
      dummy.scale.set(trunkDiameter * 0.52 * TREE_DRAW * 0.78, cut, trunkDiameter * 0.52 * TREE_DRAW * 0.78)
      dummy.updateMatrix()
      stumpRef.current?.setMatrixAt(i, dummy.matrix)
    })
    finishMesh(stumpRef.current, stumps.length, params.worldSize)

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
      dummy.scale.set(
        trunkDiameter * pinch * TREE_DRAW * 0.78,
        cut * 0.55,
        trunkDiameter * 1.05 * TREE_DRAW * 0.78,
      )
      dummy.updateMatrix()
      gnawRef.current?.setMatrixAt(i, dummy.matrix)
    })
    finishMesh(gnawRef.current, gnawed.length, params.worldSize)

    const deep = gnawed.filter((t) => t.chewProgress >= 0.55)
    deep.forEach((tree, i) => {
      const { trunkDiameter } = treeMetrics(tree.species, tree.scale, params.worldSize)
      const x = (tree.position.u - 0.5) * params.worldSize
      const z = (tree.position.v - 0.5) * params.worldSize
      const y = groundY(field, params, tree.position.u, tree.position.v)
      dummy.position.set(x, y + cut * 0.85, z)
      dummy.rotation.set(0, tree.yaw, 0)
      dummy.scale.set(
        trunkDiameter * 1.15 * TREE_DRAW * 0.78,
        cut * 0.7,
        trunkDiameter * 0.38 * TREE_DRAW * 0.78,
      )
      dummy.updateMatrix()
      deepRef.current?.setMatrixAt(i, dummy.matrix)
    })
    finishMesh(deepRef.current, deep.length, params.worldSize)

    let chipCount = 0
    for (const tree of forest.trees) {
      if (tree.source !== 'riparian' || tree.chewProgress < 0.12) continue
      const x = (tree.position.u - 0.5) * params.worldSize
      const z = (tree.position.v - 0.5) * params.worldSize
      if (Math.hypot(camPos.x - x, camPos.z - z) > 3.6) continue
      const n = Math.min(8, 2 + Math.floor(tree.chewProgress * 6))
      const y = groundY(field, params, tree.position.u, tree.position.v)
      for (let k = 0; k < n && chipCount < CHIP_MAX; k += 1) {
        const a = tree.yaw + k * 1.2 + tree.chewProgress
        const r = 0.03 + (k % 3) * 0.012
        dummy.position.set(x + Math.sin(a) * r, y + 0.008 * fit, z + Math.cos(a) * r)
        dummy.rotation.set(0.4, a, 0.2)
        dummy.scale.set(0.01 * fit * (0.7 + (k % 3) * 0.18), 0.004 * fit, 0.018 * fit * BRANCH_DRAW)
        dummy.updateMatrix()
        chipRef.current?.setMatrixAt(chipCount, dummy.matrix)
        chipCount += 1
      }
    }
    finishMesh(chipRef.current, chipCount, params.worldSize)

    const loose = forest.branches.filter((br) => !br.carriedBy && !br.inDam && !br.inLodge)
    loose.forEach((br, i) => {
      const x = (br.u - 0.5) * params.worldSize
      const z = (br.v - 0.5) * params.worldSize
      const y = branchY(field, params, br.u, br.v, colonyRef.current.hydro ?? defaultHydro)
      const lift = br.stored ? 0.016 * fit + (i % 4) * 0.006 * fit : 0.01 * fit
      dummy.position.set(x, y + lift, z)
      dummy.rotation.set(Math.PI * 0.5 + (i % 5) * 0.04, br.yaw, br.stored ? 0.18 : 0.06 + (i % 3) * 0.03)
      dummy.scale.set(
        (0.007 + (i % 4) * 0.0016) * fit,
        br.length * 0.16 * fit * BRANCH_DRAW,
        (0.006 + (i % 3) * 0.0014) * fit,
      )
      dummy.updateMatrix()
      branchRef.current?.setMatrixAt(i, dummy.matrix)
    })
    finishMesh(branchRef.current, loose.length, params.worldSize)
  })

  return (
    <group>
      {species.map((kind) => (
        <group key={kind}>
          <instancedMesh
            ref={(node) => {
              trunkRefs.current[kind] = node
            }}
            args={[undefined, undefined, STANDING_MAX]}
            raycast={() => {}}
            castShadow
          >
            <cylinderGeometry args={[1, 1.18, 1, 6]} />
            <meshStandardMaterial
              color={kind === 'birch' || kind === 'aspen' ? paleBark : trunkColor}
              roughness={0.95}
              metalness={0}
              envMapIntensity={0.12}
            />
          </instancedMesh>
          <instancedMesh
            ref={(node) => {
              canopyRefs.current[kind] = node
            }}
            args={[undefined, undefined, STANDING_MAX]}
            raycast={() => {}}
            castShadow
          >
            <icosahedronGeometry args={[1, 1]} />
            <meshStandardMaterial color={canopyTint[kind]} roughness={0.86} metalness={0} envMapIntensity={0.18} />
          </instancedMesh>
          <instancedMesh
            ref={(node) => {
              canopyRefs.current[`${kind}-fall`] = node
            }}
            args={[undefined, undefined, FALL_MAX]}
            raycast={() => {}}
          >
            <icosahedronGeometry args={[1, 1]} />
            <meshStandardMaterial color={canopyTint[kind]} roughness={0.86} metalness={0} envMapIntensity={0.18} />
          </instancedMesh>
        </group>
      ))}
      <instancedMesh ref={stumpRef} args={[undefined, undefined, 120]} raycast={() => {}}>
        <cylinderGeometry args={[1, 1.08, 1, 6]} />
        <meshStandardMaterial color={stumpColor} roughness={0.96} metalness={0} />
      </instancedMesh>
      <instancedMesh ref={boleRef} args={[undefined, undefined, 120]} raycast={() => {}} castShadow>
        <cylinderGeometry args={[1, 1.08, 1, 6]} />
        <meshStandardMaterial color={trunkColor} roughness={0.94} metalness={0} />
      </instancedMesh>
      <instancedMesh ref={gnawRef} args={[undefined, undefined, 80]} raycast={() => {}}>
        <cylinderGeometry args={[1, 1, 1, 8]} />
        <meshStandardMaterial color={gnawColor} roughness={0.86} />
      </instancedMesh>
      <instancedMesh ref={deepRef} args={[undefined, undefined, 80]} raycast={() => {}}>
        <coneGeometry args={[1, 1, 6]} />
        <meshStandardMaterial color="#3d2c1c" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={chipRef} args={[undefined, undefined, CHIP_MAX]} raycast={() => {}}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={chipColor} roughness={0.9} metalness={0} />
      </instancedMesh>
      <instancedMesh ref={branchRef} args={[undefined, undefined, 240]} raycast={() => {}}>
        <cylinderGeometry args={[1, 0.72, 1, 6]} />
        <meshStandardMaterial color="#6a4e32" roughness={0.92} metalness={0} />
      </instancedMesh>
    </group>
  )
}
