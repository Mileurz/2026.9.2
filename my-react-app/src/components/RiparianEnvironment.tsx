import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef, type MutableRefObject } from 'react'
import { Color, InstancedMesh, Object3D } from 'three'
import { getHeightField, sampleHeightField, type HeightField } from '../heightField'
import type { NoiseParams } from '../perlin'
import type { ColonyState } from '../simulation/Colony'
import {
  carveRiver,
  defaultHydro,
  isInundated,
  riverWayVersion,
  type HydroState,
  updateRiverFromLand,
} from '../simulation/Hydrology'
import { buildRiparianLayout, type GroundSpot } from '../simulation/RiparianBiome'

const dummy = new Object3D()
const grassColor = new Color('#66764a')
const shrubColor = new Color('#556844')
const reedColor = new Color('#6a7246')
const rockColor = new Color('#7c7872')
const woodColor = new Color('#c4a06a')

function surfaceY(field: HeightField, params: NoiseParams, u: number, v: number) {
  return carveRiver(sampleHeightField(field, u, v), u, v, params.seaLevel) * params.height
}

function writeGround(
  mesh: InstancedMesh | null,
  spots: GroundSpot[],
  field: HeightField,
  params: NoiseParams,
  opts: { lie?: boolean; yLift: number; sx: number; sy: number; sz: number; drown?: number },
  hydro: HydroState = defaultHydro,
) {
  if (!mesh) return
  const fit = params.worldSize / 7.2
  const drown = opts.drown ?? 0
  spots.forEach((spot, i) => {
    const wet = isInundated(
      carveRiver(sampleHeightField(field, spot.u, spot.v), spot.u, spot.v, params.seaLevel),
      spot.u,
      spot.v,
      hydro,
      params.seaLevel,
    )
    const sink = wet ? drown : 0
    dummy.position.set(
      (spot.u - 0.5) * params.worldSize,
      surfaceY(field, params, spot.u, spot.v) + opts.yLift * fit * (1 - sink * 0.4),
      (spot.v - 0.5) * params.worldSize,
    )
    dummy.rotation.set(opts.lie ? Math.PI * 0.5 : 0, spot.yaw, opts.lie ? 0.06 : 0)
    dummy.scale.set(
      spot.scale * opts.sx * fit,
      spot.scale * opts.sy * fit * (1 - sink * (opts.lie ? 0.15 : 0.7)),
      spot.scale * opts.sz * fit,
    )
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
  })
  mesh.count = spots.length
  mesh.instanceMatrix.needsUpdate = true
}

export function RiparianEnvironment({
  params,
  offsetRef,
  colonyRef,
}: {
  params: NoiseParams
  offsetRef: MutableRefObject<{ x: number; y: number }>
  colonyRef?: MutableRefObject<ColonyState>
}) {
  const grassRef = useRef<InstancedMesh>(null)
  const shrubRef = useRef<InstancedMesh>(null)
  const reedRef = useRef<InstancedMesh>(null)
  const rockRef = useRef<InstancedMesh>(null)
  const woodRef = useRef<InstancedMesh>(null)
  const wayVer = useRef(-1)
  const skip = useRef(0)
  const layout = useRef(buildRiparianLayout(getHeightField(params, 0, 0), params))

  const paint = (field: HeightField) => {
    const L = layout.current
    const hydro = colonyRef?.current.hydro ?? defaultHydro
    const drown = Math.min(0.72, (colonyRef?.current.succession?.marshAge ?? 0) * 0.08)
    const veg = 0.35 + 0.65 * (colonyRef?.current.season?.vegetation ?? 1)
    writeGround(grassRef.current, L.grass, field, params, { yLift: 0.02, sx: 0.7, sy: 0.55 * veg, sz: 0.7, drown }, hydro)
    writeGround(shrubRef.current, L.shrubs, field, params, { yLift: 0.045, sx: 0.95, sy: 0.72 * veg, sz: 0.95, drown: drown * 0.55 }, hydro)
    writeGround(reedRef.current, L.reeds, field, params, { yLift: 0.07, sx: 0.42, sy: 1.15 * veg, sz: 0.42, drown: drown * 0.25 }, hydro)
    writeGround(rockRef.current, L.rocks, field, params, { yLift: 0.02, sx: 0.85, sy: 0.42, sz: 0.85, drown: 0 }, hydro)
    writeGround(woodRef.current, L.wood, field, params, {
      lie: true,
      yLift: 0.03,
      sx: 1,
      sy: 1,
      sz: 1,
      drown: drown * 0.2,
    }, hydro)
  }

  useLayoutEffect(() => {
    const field = getHeightField(params, offsetRef.current.x, offsetRef.current.y)
    updateRiverFromLand(field, params)
    layout.current = buildRiparianLayout(field, params)
    paint(field)
  }, [params, offsetRef])

  useFrame(() => {
    const field = getHeightField(params, offsetRef.current.x, offsetRef.current.y)
    updateRiverFromLand(field, params)
    if (wayVer.current !== riverWayVersion()) {
      wayVer.current = riverWayVersion()
      layout.current = buildRiparianLayout(field, params)
      paint(field)
      return
    }
    skip.current += 1
    if (skip.current % 5 !== 0) return
    paint(field)
  })

  return (
    <group>
      <instancedMesh ref={grassRef} args={[undefined, undefined, 340]} frustumCulled={false} raycast={() => {}}>
        <coneGeometry args={[0.06, 0.14, 5]} />
        <meshStandardMaterial color={grassColor} roughness={0.96} metalness={0} />
      </instancedMesh>
      <instancedMesh
        ref={shrubRef}
        args={[undefined, undefined, 70]}
        frustumCulled={false}
        raycast={() => {}}
        castShadow
        receiveShadow
      >
        <icosahedronGeometry args={[0.08, 0]} />
        <meshStandardMaterial color={shrubColor} roughness={0.93} metalness={0} />
      </instancedMesh>
      <instancedMesh ref={reedRef} args={[undefined, undefined, 160]} frustumCulled={false} raycast={() => {}}>
        <cylinderGeometry args={[0.01, 0.014, 0.38, 4]} />
        <meshStandardMaterial color={reedColor} roughness={0.94} metalness={0} />
      </instancedMesh>
      <instancedMesh
        ref={rockRef}
        args={[undefined, undefined, 42]}
        frustumCulled={false}
        raycast={() => {}}
        castShadow
        receiveShadow
      >
        <dodecahedronGeometry args={[0.07, 0]} />
        <meshStandardMaterial color={rockColor} roughness={0.97} metalness={0.02} flatShading />
      </instancedMesh>
      <instancedMesh
        ref={woodRef}
        args={[undefined, undefined, 22]}
        frustumCulled={false}
        raycast={() => {}}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[0.045, 0.05, 0.22, 10]} />
        <meshStandardMaterial color={woodColor} roughness={0.8} metalness={0.03} />
      </instancedMesh>
    </group>
  )
}
