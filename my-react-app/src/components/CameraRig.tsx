import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useRef, type MutableRefObject } from 'react'
import { MathUtils, PerspectiveCamera, Vector3 } from 'three'
import { getHeightField, sampleHeightField } from '../heightField'
import type { NoiseParams } from '../perlin'
import type { ColonyState } from '../simulation/Colony'
import { carveRiver, riverDownstreamSign } from '../simulation/Hydrology'

export type CameraMode = 'free' | 'follow' | 'colony' | 'dam' | 'ecology' | 'compare'

const wantTarget = new Vector3()
const wantPos = new Vector3()
const scratch = new Vector3()
const pool = Array.from({ length: 8 }, () => new Vector3())

function damp(dt: number, rate: number) {
  return 1 - Math.exp(-rate * Math.max(0, dt))
}

function uvY(
  params: NoiseParams,
  field: ReturnType<typeof getHeightField>,
  u: number,
  v: number,
) {
  const n = carveRiver(sampleHeightField(field, u, v), u, v, params.seaLevel)
  return n * params.height
}

function world(params: NoiseParams, u: number, v: number, y: number, out: Vector3) {
  return out.set((u - 0.5) * params.worldSize, y, (v - 0.5) * params.worldSize)
}

function placeShot(target: Vector3, distance: number, azimuth: number, elevation: number, out: Vector3) {
  const el = Math.min(1.15, Math.max(0.18, elevation))
  const d = Math.max(1.15, distance)
  out.set(
    target.x + Math.sin(azimuth) * Math.cos(el) * d,
    target.y + Math.sin(el) * d,
    target.z + Math.cos(azimuth) * Math.cos(el) * d,
  )
  if (out.y < target.y + 0.42) out.y = target.y + 0.42
  return out
}

function mixPoints(points: Vector3[], count: number, out: Vector3) {
  out.set(0, 0, 0)
  if (count <= 0) return { center: out, radius: 1.2 }
  for (let i = 0; i < count; i += 1) out.add(points[i])
  out.multiplyScalar(1 / count)
  let radius = 0.55
  for (let i = 0; i < count; i += 1) radius = Math.max(radius, out.distanceTo(points[i]))
  return { center: out, radius }
}

type Orbit = {
  target: Vector3
  update: () => void
  enableRotate: boolean
  enablePan: boolean
  enableZoom: boolean
  enableDamping: boolean
  dampingFactor: number
}

export function CameraRig({
  mode,
  params,
  offsetRef,
  colonyRef,
  followPos,
  selectedId,
}: {
  mode: CameraMode
  params: NoiseParams
  offsetRef: MutableRefObject<{ x: number; y: number }>
  colonyRef?: MutableRefObject<ColonyState>
  followPos: MutableRefObject<Vector3>
  selectedId: string | null
}) {
  const { camera } = useThree()
  const controlsRef = useRef<Orbit>(null)
  const azSmooth = useRef(0.72)
  const size = params.worldSize

  useFrame((_, dt) => {
    const controls = controlsRef.current
    if (!controls) return
    const cam = camera as PerspectiveCamera
    const colony = colonyRef?.current
    const offset = offsetRef.current
    const field = getHeightField(params, offset.x, offset.y)
    const ground = (u: number, v: number) => uvY(params, field, u, v)
    const free = mode === 'free'
    controls.enableDamping = true
    controls.dampingFactor = free ? 0.048 : 0.062
    controls.enableRotate = free
    controls.enablePan = free
    controls.enableZoom = free || mode === 'ecology' || mode === 'compare'

    if (free) {
      controls.update()
      return
    }

    let azimuth = 0.72
    let elevation = 0.42
    let distance = size * 0.42
    let fov = 42
    wantTarget.set(0, size * 0.08, 0)

    if (mode === 'follow') {
      const beaver = selectedId ? colony?.beavers.find((b) => b.id === selectedId) : colony?.beavers[0]
      if (followPos.current.lengthSq() > 0.0001) wantTarget.copy(followPos.current)
      else if (beaver) {
        const y = ground(beaver.u, beaver.v)
        world(params, beaver.u, beaver.v, y + 0.04, wantTarget)
      }
      const heading = beaver?.heading ?? azSmooth.current
      const behind = heading + Math.PI
      azSmooth.current += Math.atan2(Math.sin(behind - azSmooth.current), Math.cos(behind - azSmooth.current)) * damp(dt, 0.55)
      azimuth = azSmooth.current
      elevation = 0.34
      distance = 2.85
      fov = 38
    } else if (mode === 'dam' && colony) {
      const dam = colony.dam
      const u = dam?.siteU ?? colony.home.u
      const v = dam?.siteV ?? colony.home.v
      const y = ground(u, v)
      world(params, u, v, y + 0.05, wantTarget)
      const down = riverDownstreamSign()
      azimuth = down >= 0 ? 0.95 : 2.18
      elevation = 0.3
      distance = 2.15 + (dam?.length ?? 0) * size * 0.45
      fov = 34
    } else if (mode === 'colony' && colony) {
      let n = 0
      const push = (u: number, v: number, lift = 0.04) => {
        if (n >= pool.length) return
        world(params, u, v, ground(u, v) + lift, pool[n])
        n += 1
      }
      push(colony.home.u, colony.home.v)
      if (colony.dam) push(colony.dam.siteU, colony.dam.siteV, 0.06)
      if (colony.lodge) push(colony.lodge.siteU, colony.lodge.siteV, 0.05)
      const hydro = colony.hydro
      if (hydro) {
        const down = riverDownstreamSign()
        const pondU = Math.min(
          0.92,
          Math.max(0.08, (hydro.damU ?? colony.dam.siteU) - down * (hydro.pondReach ?? 0.08) * 0.45),
        )
        push(pondU, hydro.damV ?? colony.dam.siteV, 0.02)
      }
      const trails = colony.territory?.trails ?? []
      if (trails.length) {
        const mid = trails[Math.floor(trails.length * 0.5)]
        push(mid.u, mid.v)
      }
      const { center, radius } = mixPoints(pool, n, scratch)
      wantTarget.copy(center)
      azimuth = 0.78
      elevation = 0.4
      distance = Math.min(size * 0.72, Math.max(3.4, radius * 2.55 + 1.5))
      fov = 40
    } else {
      const colonyHome = colony?.home ?? { u: 0.48, v: 0.5 }
      const dam = colony?.dam
      const hydro = colony?.hydro
      const u = hydro?.damU ?? dam?.siteU ?? colonyHome.u
      const v = hydro?.damV ?? dam?.siteV ?? colonyHome.v
      const pondU = Math.min(0.9, Math.max(0.1, u - riverDownstreamSign() * 0.08))
      const y = ground(pondU, v)
      world(params, 0.48, 0.5, y * 0.4 + size * 0.04, wantTarget)
      if (mode === 'compare') {
        azimuth = 0.52
        elevation = 0.48
        distance = size * 0.92
        fov = 44
      } else {
        azimuth = 0.58
        elevation = 0.5
        distance = size * 0.88
        fov = 46
      }
    }

    placeShot(wantTarget, distance, azimuth, elevation, wantPos)
    const lookK = damp(dt, mode === 'follow' ? 1.45 : 1.12)
    const moveK = damp(dt, mode === 'follow' ? 0.92 : 0.78)
    controls.target.lerp(wantTarget, lookK)
    cam.position.lerp(wantPos, moveK)
    cam.fov = MathUtils.lerp(cam.fov, fov, damp(dt, 0.9))
    cam.updateProjectionMatrix()
    controls.update()
  })

  return (
    <OrbitControls
      ref={controlsRef as never}
      makeDefault
      enableDamping
      dampingFactor={0.048}
      rotateSpeed={0.42}
      panSpeed={0.38}
      zoomSpeed={0.48}
      minDistance={1.15}
      maxDistance={size * 2.35}
      maxPolarAngle={Math.PI * 0.47}
      minPolarAngle={0.12}
    />
  )
}
