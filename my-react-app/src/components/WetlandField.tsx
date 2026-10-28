import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef, type MutableRefObject } from 'react'
import { Color, InstancedMesh, Object3D, Vector3 } from 'three'
import { bindWorldCull } from '../visual'
import { getHeightField, sampleHeightField, type HeightField } from '../heightField'
import type { NoiseParams } from '../perlin'
import type { ColonyState } from '../simulation/Colony'
import { carveRiver, cappedWaterN, defaultHydro } from '../simulation/Hydrology'
import { emptySuccession, type WetlandKind, type WetlandStem } from '../simulation/Succession'

const dummy = new Object3D()
const KIND_COLOR: Record<WetlandKind, Color> = {
  reed: new Color('#6a7348'),
  cattail: new Color('#5c6840'),
  sedge: new Color('#7a8a4e'),
  grass: new Color('#6e824c'),
  aquatic: new Color('#3d5a48'),
}
const deadStem = new Color('#6a5a40')
const headColor = new Color('#5a402c')
const shoreColor = new Color('#a89878')
const pathColor = new Color('#4a3c30')
const seasonTint = new Color()
const KINDS: WetlandKind[] = ['reed', 'cattail', 'sedge', 'grass', 'aquatic']
const camPos = new Vector3()
const MAX: Record<WetlandKind, number> = {
  reed: 220,
  cattail: 160,
  sedge: 200,
  grass: 240,
  aquatic: 140,
}

function surfaceY(
  field: HeightField,
  params: NoiseParams,
  u: number,
  v: number,
  hydro = defaultHydro,
  float = false,
) {
  const raw = sampleHeightField(field, u, v)
  const n = carveRiver(raw, u, v, params.seaLevel)
  const water = cappedWaterN(n, raw, u, v, hydro, params.seaLevel)
  const h = float ? Math.max(n, water) : n
  return h * params.height
}

function poseStem(
  plant: WetlandStem,
  field: HeightField,
  params: NoiseParams,
  hydro = defaultHydro,
  veg = 1,
) {
  const fit = params.worldSize / 7.2
  const grow = (0.18 + plant.age * 0.82) * (0.4 + 0.6 * veg)
  const x = (plant.u - 0.5) * params.worldSize
  const z = (plant.v - 0.5) * params.worldSize
  const aquatic = plant.kind === 'aquatic'
  const y = surfaceY(field, params, plant.u, plant.v, hydro, aquatic)
  dummy.position.set(x, y, z)
  dummy.rotation.set(aquatic ? Math.PI * 0.5 : 0, plant.yaw, aquatic ? 0.08 : 0)
  const sx =
    plant.kind === 'reed' || plant.kind === 'cattail'
      ? 0.38
      : plant.kind === 'aquatic'
        ? 0.9
        : 0.7
  const sy =
    plant.kind === 'cattail'
      ? 1.35
      : plant.kind === 'reed'
        ? 1.12
        : plant.kind === 'sedge'
          ? 0.48
          : plant.kind === 'aquatic'
            ? 0.22
            : 0.52
  dummy.scale.set(
    plant.scale * sx * fit * (0.7 + grow * 0.3),
    plant.scale * sy * fit * grow,
    plant.scale * sx * fit * (0.7 + grow * 0.3),
  )
  dummy.updateMatrix()
}

export function WetlandField({
  params,
  offsetRef,
  colonyRef,
}: {
  params: NoiseParams
  offsetRef: MutableRefObject<{ x: number; y: number }>
  colonyRef: MutableRefObject<ColonyState>
}) {
  const refs = useRef<Record<WetlandKind, InstancedMesh | null>>({
    reed: null,
    cattail: null,
    sedge: null,
    grass: null,
    aquatic: null,
  })
  const headRef = useRef<InstancedMesh>(null)
  const shoreRef = useRef<InstancedMesh>(null)
  const pathRef = useRef<InstancedMesh>(null)
  const { camera } = useThree()
  const tick = useRef(0)
  const finger = useRef('')

  useLayoutEffect(() => {
    for (const kind of KINDS) {
      const mesh = refs.current[kind]
      if (mesh) mesh.count = 0
    }
    if (headRef.current) headRef.current.count = 0
    if (shoreRef.current) shoreRef.current.count = 0
    if (pathRef.current) pathRef.current.count = 0
  }, [])

  useFrame(() => {
    const colony = colonyRef.current
    if (!colony.succession) colony.succession = emptySuccession()
    const space = colony.succession
    const field = getHeightField(params, offsetRef.current.x, offsetRef.current.y)
    const hydro = colony.hydro ?? defaultHydro
    const veg = colony.season?.vegetation ?? 1
    const winter = colony.season?.winter ?? 0
    const warmth = colony.season?.warmth ?? 0
    const fit = params.worldSize / 7.2
    camera.getWorldPosition(camPos)
    tick.current += 1
    const far = camPos.length() > 6.2
    const key = `${space.plants.length}|${space.oldShore.length}|${space.paths.length}|${veg.toFixed(2)}|${winter.toFixed(2)}|${Math.round(hydro.pondArea * 8)}`
    if (key === finger.current && tick.current % (far ? 6 : 3) !== 0) return
    finger.current = key

    for (const kind of KINDS) {
      const mesh = refs.current[kind]
      if (mesh && mesh.material && 'color' in mesh.material) {
        seasonTint.copy(KIND_COLOR[kind]).lerp(deadStem, Math.min(0.7, winter * 0.62 + warmth * 0.28))
        ;(mesh.material as { color: Color }).color.copy(seasonTint)
      }
      const list = space.plants.filter((p) => p.kind === kind).slice(0, MAX[kind])
      list.forEach((plant, i) => {
        poseStem(plant, field, params, hydro, veg)
        mesh?.setMatrixAt(i, dummy.matrix)
      })
      if (mesh) {
        mesh.count = list.length
        mesh.instanceMatrix.needsUpdate = true
        bindWorldCull(mesh, params.worldSize)
      }
    }

    const cattails = space.plants.filter((p) => p.kind === 'cattail' && p.age > 0.28).slice(0, 160)
    cattails.forEach((plant, i) => {
      poseStem(plant, field, params, hydro, veg)
      dummy.translateY(0.16 * fit * plant.scale * plant.age)
      dummy.scale.set(0.018 * fit * plant.scale, 0.028 * fit * plant.scale, 0.018 * fit * plant.scale)
      dummy.updateMatrix()
      headRef.current?.setMatrixAt(i, dummy.matrix)
    })
    if (headRef.current) {
      headRef.current.count = cattails.length
      headRef.current.instanceMatrix.needsUpdate = true
      bindWorldCull(headRef.current, params.worldSize)
    }

    const shores = space.oldShore.slice(0, 220)
    shores.forEach((mark, i) => {
      const y = surfaceY(field, params, mark.u, mark.v, hydro) + 0.008 * fit
      dummy.position.set((mark.u - 0.5) * params.worldSize, y, (mark.v - 0.5) * params.worldSize)
      dummy.rotation.set(0, mark.age * 0.05, 0)
      dummy.scale.set(0.055 * fit, 0.008 * fit, 0.028 * fit)
      dummy.updateMatrix()
      shoreRef.current?.setMatrixAt(i, dummy.matrix)
    })
    if (shoreRef.current) {
      shoreRef.current.count = shores.length
      shoreRef.current.instanceMatrix.needsUpdate = true
      bindWorldCull(shoreRef.current, params.worldSize)
    }

    const paths = space.paths.slice(0, 90)
    paths.forEach((mark, i) => {
      const y = surfaceY(field, params, mark.u, mark.v, hydro) + 0.004 * fit
      dummy.position.set((mark.u - 0.5) * params.worldSize, y, (mark.v - 0.5) * params.worldSize)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(0.04 * fit, 0.004 * fit, 0.028 * fit)
      dummy.updateMatrix()
      pathRef.current?.setMatrixAt(i, dummy.matrix)
    })
    if (pathRef.current) {
      pathRef.current.count = paths.length
      pathRef.current.instanceMatrix.needsUpdate = true
      bindWorldCull(pathRef.current, params.worldSize)
    }
  })

  return (
    <group>
      {KINDS.map((kind) => (
        <instancedMesh
          key={kind}
          ref={(node) => {
            refs.current[kind] = node
          }}
          args={[undefined, undefined, MAX[kind]]}
          raycast={() => {}}
        >
          {kind === 'aquatic' ? (
            <sphereGeometry args={[0.05, 5, 4]} />
          ) : kind === 'sedge' || kind === 'grass' ? (
            <coneGeometry args={[0.05, 0.16, 5]} />
          ) : (
            <cylinderGeometry args={[0.008, 0.012, 0.42, 5]} />
          )}
          <meshStandardMaterial color={KIND_COLOR[kind]} roughness={0.96} metalness={0} />
        </instancedMesh>
      ))}
      <instancedMesh ref={headRef} args={[undefined, undefined, 160]} raycast={() => {}}>
        <sphereGeometry args={[1, 5, 4]} />
        <meshStandardMaterial color={headColor} roughness={0.92} />
      </instancedMesh>
      <instancedMesh ref={shoreRef} args={[undefined, undefined, 220]} raycast={() => {}}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={shoreColor} roughness={0.98} />
      </instancedMesh>
      <instancedMesh ref={pathRef} args={[undefined, undefined, 90]} raycast={() => {}}>
        <cylinderGeometry args={[1, 1, 1, 6]} />
        <meshStandardMaterial color={pathColor} roughness={0.97} />
      </instancedMesh>
    </group>
  )
}
