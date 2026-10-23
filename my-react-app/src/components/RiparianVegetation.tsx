import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef, type MutableRefObject } from 'react'
import { Color, InstancedMesh, Object3D } from 'three'
import { getHeightField, sampleHeightField } from '../heightField'
import type { NoiseParams } from '../perlin'
import {
  carveRiver,
  floodplainMask,
  riverCenter,
  riverHalfWidth,
  riverMask,
  riverWayVersion,
  updateRiverFromLand,
} from '../simulation/Hydrology'

const dummy = new Object3D()
const wood = new Color('#c4a06a')

const WOOD = 26

type Spot = { u: number; v: number; lie: boolean; r: number; sy: number }

function placeWood(params: NoiseParams, ox: number, oy: number): Spot[] {
  const field = getHeightField(params, ox, oy)
  updateRiverFromLand(field, params)
  const sea = params.seaLevel
  const w = riverHalfWidth(sea)
  const spots: Spot[] = []
  for (let i = 0; i < 80 && spots.length < WOOD; i += 1) {
    const u = 0.12 + ((i * 37) % 76) / 100
    const side = i % 2 === 0 ? 1 : -1
    const v = riverCenter(u) + side * (w + 0.018 + (i % 5) * 0.004)
    if (v < 0.08 || v > 0.92) continue
    if (riverMask(u, v, sea) > 0.55) continue
    if (floodplainMask(u, v, sea) < 0.18) continue
    spots.push({
      u,
      v,
      lie: i % 3 !== 0,
      r: 0.85 + (i % 4) * 0.12,
      sy: i % 3 === 0 ? 0.55 : 0.9,
    })
  }
  return spots
}

function writeWood(
  mesh: InstancedMesh | null,
  spots: Spot[],
  params: NoiseParams,
  ox: number,
  oy: number,
) {
  if (!mesh) return
  const field = getHeightField(params, ox, oy)
  const sea = params.seaLevel
  const fit = params.worldSize / 7.2
  spots.forEach((hit, i) => {
    const n = carveRiver(sampleHeightField(field, hit.u, hit.v), hit.u, hit.v, sea)
    dummy.position.set(
      (hit.u - 0.5) * params.worldSize,
      n * params.height + (hit.lie ? 0.035 * fit : 0.04 * fit),
      (hit.v - 0.5) * params.worldSize,
    )
    dummy.rotation.set(hit.lie ? Math.PI * 0.5 : 0, i * 0.7, hit.lie ? 0.08 : 0)
    dummy.scale.set(hit.r * fit, hit.sy * fit, hit.r * fit)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
  })
  mesh.count = spots.length
  mesh.instanceMatrix.needsUpdate = true
}

export function RiparianVegetation({
  params,
  offsetRef,
}: {
  params: NoiseParams
  offsetRef: MutableRefObject<{ x: number; y: number }>
}) {
  const woodRef = useRef<InstancedMesh>(null)
  const spots = useRef(placeWood(params, offsetRef.current.x, offsetRef.current.y))
  const wayVer = useRef(-1)

  useLayoutEffect(() => {
    spots.current = placeWood(params, offsetRef.current.x, offsetRef.current.y)
    writeWood(woodRef.current, spots.current, params, offsetRef.current.x, offsetRef.current.y)
  }, [params, offsetRef])

  useFrame(() => {
    const ox = offsetRef.current.x
    const oy = offsetRef.current.y
    const field = getHeightField(params, ox, oy)
    updateRiverFromLand(field, params)
    if (wayVer.current !== riverWayVersion()) {
      wayVer.current = riverWayVersion()
      spots.current = placeWood(params, ox, oy)
    }
    writeWood(woodRef.current, spots.current, params, ox, oy)
  })

  return (
    <instancedMesh ref={woodRef} args={[undefined, undefined, WOOD]} frustumCulled={false} raycast={() => {}}>
      <cylinderGeometry args={[0.045, 0.05, 0.22, 10]} />
      <meshStandardMaterial color={wood} roughness={0.78} metalness={0.03} />
    </instancedMesh>
  )
}
