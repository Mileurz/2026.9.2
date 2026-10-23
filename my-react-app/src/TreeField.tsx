import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef, type MutableRefObject } from 'react'
import { Color, Group, Mesh, MeshStandardMaterial, type Object3D } from 'three'
import { getHeightField, sampleHeightField, type HeightField } from './heightField'
import type { NoiseParams } from './perlin'
import { CatalogTree } from './TreeMeshes'
import { DEFAULT_TREE_KIND, isTreeKind, type TreeKind } from './treeCatalog'
import {
  carveRiver,
  defaultHydro,
  isInundated,
  localWaterN,
  riverMask,
  type HydroState,
} from './simulation/Hydrology'
import { sampleSnow, sampleWater, type WeatherCover, type WeatherKind } from './weather'
import type { ColonyState } from './simulation/Colony'

export type TreeSpot = {
  id: string
  kind: TreeKind
  u: number
  v: number
  scale: number
  yaw: number
}

type Offset = { x: number; y: number }

const snowWhite = new Color('#f4f7fa')

export function isPlantableLand(n: number, pond: number, water = 0.02) {
  return n > water + 0.016 && pond < 0.08
}

function carvedHeight(params: NoiseParams, field: HeightField, u: number, v: number) {
  return carveRiver(sampleHeightField(field, u, v), u, v, params.seaLevel)
}

function landSlope(params: NoiseParams, field: HeightField, u: number, v: number) {
  const e = 0.01
  const dx =
    (carvedHeight(params, field, u + e, v) - carvedHeight(params, field, u - e, v)) *
    params.height /
    (2 * e * params.worldSize)
  const dz =
    (carvedHeight(params, field, u, v + e) - carvedHeight(params, field, u, v - e)) *
    params.height /
    (2 * e * params.worldSize)
  return Math.hypot(dx, dz)
}

export function canGrowTree(
  params: NoiseParams,
  field: HeightField,
  cover: WeatherCover,
  u: number,
  v: number,
  hydro: HydroState = defaultHydro,
) {
  if (u < 0.02 || u > 0.98 || v < 0.02 || v > 0.98) return false
  const n = carvedHeight(params, field, u, v)
  const pond = sampleWater(cover, u, v)
  const water = localWaterN(u, v, hydro, params.seaLevel)
  if (!isPlantableLand(n, pond, water)) return false
  if (riverMask(u, v, params.seaLevel) > 0.28) return false
  if (isInundated(n, u, v, hydro, params.seaLevel)) return false
  if (landSlope(params, field, u, v) > 0.62) return false
  return true
}

export function scatterTreesOnLand(
  params: NoiseParams,
  offset: { x: number; y: number },
  cover: WeatherCover,
  kind: TreeKind,
  existing: TreeSpot[],
): TreeSpot[] {
  const field = getHeightField(params, offset.x, offset.y)
  const next = existing.filter((spot) => canGrowTree(params, field, cover, spot.u, spot.v))
  const tooClose = (u: number, v: number, gap: number) =>
    next.some((spot) => Math.hypot(spot.u - u, spot.v - v) < gap)

  const tryPlant = (u: number, v: number, gap: number) => {
    if (!canGrowTree(params, field, cover, u, v) || tooClose(u, v, gap)) return
    next.push({
      id: `scatter-${Math.round(Math.random() * 1e9)}`,
      kind,
      u,
      v,
      scale: 0.4 + Math.random() * 0.28,
      yaw: Math.random() * Math.PI * 2,
    })
  }

  for (let i = 0; i < 900; i += 1) {
    if (Math.random() < 0.2) continue
    tryPlant(Math.random(), Math.random(), 0.016 + Math.random() * 0.08)
  }

  const planted = next.length
  for (let i = existing.length; i < planted; i += 1) {
    if (Math.random() > 0.28) continue
    const host = next[i]
    const a = Math.random() * Math.PI * 2
    const r = 0.012 + Math.random() * 0.028
    tryPlant(host.u + Math.cos(a) * r, host.v + Math.sin(a) * r, 0.014)
  }

  return next
}

function surfaceY(
  params: NoiseParams,
  cover: WeatherCover,
  offset: Offset,
  u: number,
  v: number,
) {
  const field = getHeightField(params, offset.x, offset.y)
  const n = carveRiver(sampleHeightField(field, u, v), u, v, params.seaLevel)
  const snow = sampleSnow(cover, u, v)
  const pond = sampleWater(cover, u, v)
  return {
    n,
    pond,
    y: n * params.height + snow * 0.55 + pond * 0.32,
  }
}

function setPickable(root: Object3D, on: boolean) {
  root.traverse((obj) => {
    if (!(obj as Mesh).isMesh) return
    obj.raycast = on ? Mesh.prototype.raycast : () => {}
  })
}

function dustTree(root: Object3D, amount: number) {
  root.traverse((obj) => {
    const mesh = obj as Mesh
    if (!mesh.isMesh) return
    const mat = mesh.material
    if (!(mat instanceof MeshStandardMaterial)) return
    if (!mat.userData.baseColor) mat.userData.baseColor = mat.color.clone()
    mat.color.copy(mat.userData.baseColor).lerp(snowWhite, amount)
  })
}

function PlantedTree({
  spot,
  params,
  offsetRef,
  coverRef,
  weather,
  intensity,
  speed,
  running,
  pickable,
  onRemove,
  colonyRef,
}: {
  spot: TreeSpot
  params: NoiseParams
  offsetRef: MutableRefObject<Offset>
  coverRef: MutableRefObject<WeatherCover>
  weather: WeatherKind
  intensity: number
  speed: number
  running: boolean
  pickable: boolean
  onRemove?: (id: string) => void
  colonyRef?: MutableRefObject<ColonyState>
}) {
  const ref = useRef<Group>(null)
  const fallRef = useRef<Group>(null)
  const stumpRef = useRef<Mesh>(null)
  const gnawRef = useRef<Mesh>(null)
  const frost = useRef(0)
  const kind = isTreeKind(spot.kind) ? spot.kind : DEFAULT_TREE_KIND

  useLayoutEffect(() => {
    if (ref.current) setPickable(ref.current, pickable)
  }, [pickable, kind])

  useFrame((_, dt) => {
    const group = ref.current
    const fall = fallRef.current
    if (!group) return
    const field = getHeightField(params, offsetRef.current.x, offsetRef.current.y)
    const res = colonyRef?.current.forest?.trees.find((t) => t.id === spot.id)
    const marked = Boolean(res && (res.chewProgress > 0.12 || res.fallProgress > 0))
    if (!marked && !canGrowTree(params, field, coverRef.current, spot.u, spot.v)) {
      group.visible = false
      return
    }
    group.visible = true
    const { y } = surfaceY(params, coverRef.current, offsetRef.current, spot.u, spot.v)
    group.position.set(
      (spot.u - 0.5) * params.worldSize,
      y,
      (spot.v - 0.5) * params.worldSize,
    )
    if (fall && res) {
      fall.rotation.set(0, res.fallHeading, 0)
      fall.rotateX(res.fallProgress * res.fallProgress * Math.PI * 0.5)
    }
    if (stumpRef.current) stumpRef.current.visible = Boolean(res && (res.chewProgress > 0.18 || res.fallProgress > 0))
    if (gnawRef.current) {
      gnawRef.current.visible = Boolean(res && res.chewProgress >= 0.2 && res.fallProgress < 0.08)
      const pinch = (res?.chewProgress ?? 0) < 0.55 ? 1 : 0.55
      gnawRef.current.scale.set(pinch, 1, 1.15)
    }
    const piled = sampleSnow(coverRef.current, spot.u, spot.v)
    if (weather === 'snow') {
      if (piled < 0.002 && frost.current > 0.2) frost.current = 0
      const pace = running ? speed : 0.18
      frost.current = Math.min(1, frost.current + dt * (0.08 + pace * 0.1) * intensity)
    } else {
      frost.current = Math.min(1, piled / 0.55)
    }
    dustTree(group, frost.current)
  })

  const cut = 0.05 / Math.max(0.35, spot.scale)

  return (
    <group
      ref={ref}
      scale={spot.scale}
      onPointerDown={(event) => {
        if (!pickable || !onRemove) return
        event.stopPropagation()
        onRemove(spot.id)
      }}
    >
      <mesh ref={stumpRef} position={[0, cut * 0.5, 0]} visible={false} raycast={() => {}}>
        <cylinderGeometry args={[0.045, 0.05, cut, 7]} />
        <meshStandardMaterial color="#4a3828" roughness={0.94} />
      </mesh>
      <mesh ref={gnawRef} position={[0, cut, 0]} rotation={[0, spot.yaw, 0]} visible={false} raycast={() => {}}>
        <cylinderGeometry args={[0.038, 0.04, cut * 0.55, 8]} />
        <meshStandardMaterial color="#6a4e32" roughness={0.86} />
      </mesh>
      <group ref={fallRef} rotation={[0, spot.yaw, 0]}>
        <CatalogTree kind={kind} id={spot.id} />
      </group>
    </group>
  )
}

export function TreeField({
  trees,
  params,
  offsetRef,
  coverRef,
  weather,
  intensity,
  speed,
  running,
  pickable = false,
  onRemove,
  colonyRef,
}: {
  trees: TreeSpot[]
  params: NoiseParams
  offsetRef: MutableRefObject<Offset>
  coverRef: MutableRefObject<WeatherCover>
  weather: WeatherKind
  intensity: number
  speed: number
  running: boolean
  pickable?: boolean
  onRemove?: (id: string) => void
  colonyRef?: MutableRefObject<ColonyState>
}) {
  return (
    <group>
      {trees.map((spot) => (
        <PlantedTree
          key={spot.id}
          spot={spot}
          params={params}
          offsetRef={offsetRef}
          coverRef={coverRef}
          weather={weather}
          intensity={intensity}
          speed={speed}
          running={running}
          pickable={pickable}
          onRemove={onRemove}
          colonyRef={colonyRef}
        />
      ))}
    </group>
  )
}
