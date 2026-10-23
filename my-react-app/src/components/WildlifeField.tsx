import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef, type MutableRefObject } from 'react'
import { Color, InstancedMesh, Object3D } from 'three'
import { getHeightField, sampleHeightField, type HeightField } from '../heightField'
import type { NoiseParams } from '../perlin'
import type { ColonyState } from '../simulation/Colony'
import { carveRiver, cappedWaterN, defaultHydro } from '../simulation/Hydrology'
import { emptyWildlife, type WildlifeAgent, type WildlifeKind } from '../simulation/Wildlife'

const dummy = new Object3D()
const COLORS: Record<WildlifeKind, Color> = {
  duck: new Color('#5a5344'),
  bird: new Color('#4a463c'),
  frog: new Color('#4a5c3a'),
  fish: new Color('#3a4a44'),
  insect: new Color('#8a7a48'),
}
const KINDS: WildlifeKind[] = ['duck', 'bird', 'frog', 'fish', 'insect']
const MAX: Record<WildlifeKind, number> = {
  duck: 4,
  bird: 8,
  frog: 10,
  fish: 12,
  insect: 24,
}

function groundY(field: HeightField, params: NoiseParams, a: WildlifeAgent, hydro = defaultHydro) {
  const raw = sampleHeightField(field, a.u, a.v)
  const n = carveRiver(raw, a.u, a.v, params.seaLevel)
  const water = cappedWaterN(n, raw, a.u, a.v, hydro, params.seaLevel)
  const fit = params.worldSize / 7.2
  if (a.kind === 'duck' || a.kind === 'fish') return Math.max(n, water) * params.height + a.lift * fit
  if (a.kind === 'insect' || a.kind === 'bird') return Math.max(n, water) * params.height + (0.04 + a.lift * 0.16) * fit
  return n * params.height + 0.01 * fit + a.lift * 0.05 * fit
}

function pose(a: WildlifeAgent, field: HeightField, params: NoiseParams, hydro = defaultHydro) {
  const fit = params.worldSize / 7.2
  dummy.position.set((a.u - 0.5) * params.worldSize, groundY(field, params, a, hydro), (a.v - 0.5) * params.worldSize)
  dummy.rotation.set(a.kind === 'fish' ? 0.2 : 0, a.heading, a.kind === 'insect' ? a.phase * 0.4 : 0)
  const show = 0.35 + a.visible * 0.65
  if (a.kind === 'duck') dummy.scale.set(0.055 * fit * show, 0.028 * fit * show, 0.04 * fit * show)
  else if (a.kind === 'bird') dummy.scale.set(0.018 * fit * show, 0.012 * fit * show, 0.022 * fit * show)
  else if (a.kind === 'frog') dummy.scale.set(0.016 * fit * show, 0.012 * fit * show, 0.018 * fit * show)
  else if (a.kind === 'fish') dummy.scale.set(0.022 * fit * show, 0.008 * fit * show, 0.01 * fit * show)
  else dummy.scale.set(0.006 * fit * show, 0.006 * fit * show, 0.006 * fit * show)
  dummy.updateMatrix()
}

export function WildlifeField({
  params,
  offsetRef,
  colonyRef,
}: {
  params: NoiseParams
  offsetRef: MutableRefObject<{ x: number; y: number }>
  colonyRef: MutableRefObject<ColonyState>
}) {
  const refs = useRef<Record<WildlifeKind, InstancedMesh | null>>({
    duck: null,
    bird: null,
    frog: null,
    fish: null,
    insect: null,
  })

  useLayoutEffect(() => {
    for (const kind of KINDS) {
      const mesh = refs.current[kind]
      if (mesh) mesh.count = 0
    }
  }, [])

  useFrame(() => {
    const colony = colonyRef.current
    if (!colony.wildlife) colony.wildlife = emptyWildlife()
    const field = getHeightField(params, offsetRef.current.x, offsetRef.current.y)
    const hydro = colony.hydro ?? defaultHydro
    for (const kind of KINDS) {
      const mesh = refs.current[kind]
      const list = colony.wildlife.agents.filter((a) => a.kind === kind && a.visible > 0.04).slice(0, MAX[kind])
      list.forEach((agent, i) => {
        pose(agent, field, params, hydro)
        mesh?.setMatrixAt(i, dummy.matrix)
      })
      if (mesh) {
        mesh.count = list.length
        mesh.instanceMatrix.needsUpdate = true
      }
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
          frustumCulled={false}
          raycast={() => {}}
        >
          {kind === 'insect' ? (
            <sphereGeometry args={[1, 4, 3]} />
          ) : kind === 'frog' ? (
            <sphereGeometry args={[1, 5, 4]} />
          ) : (
            <sphereGeometry args={[1, 6, 5]} />
          )}
          <meshStandardMaterial
            color={COLORS[kind]}
            roughness={kind === 'fish' ? 0.35 : 0.9}
            metalness={kind === 'fish' ? 0.08 : 0}
            transparent={kind === 'fish' || kind === 'insect'}
            opacity={kind === 'fish' ? 0.45 : kind === 'insect' ? 0.55 : 1}
            depthWrite={kind !== 'insect' && kind !== 'fish'}
          />
        </instancedMesh>
      ))}
    </group>
  )
}
