import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef, type MutableRefObject } from 'react'
import { Color, InstancedMesh, Object3D } from 'three'
import { getHeightField, sampleHeightField, type HeightField } from '../heightField'
import type { NoiseParams } from '../perlin'
import type { ColonyState } from '../simulation/Colony'
import { carveRiver, cappedWaterN, defaultHydro } from '../simulation/Hydrology'
import type { LodgePiece, LodgePieceKind } from '../simulation/Lodge'
import { LODGE_DRAW, bindWorldCull } from '../visual'

/** Temporary instanced lodge mass. Replace later with a lodge GLB (chamber, sticks, mud plaster). */

const dummy = new Object3D()
const tint = new Color()
const COLORS: Record<LodgePieceKind, Color> = {
  stick: new Color('#5c442c'),
  branch: new Color('#4a3624'),
  log: new Color('#322418'),
  mud: new Color('#3e3228'),
  reed: new Color('#5a6440'),
}

const KINDS: LodgePieceKind[] = ['stick', 'branch', 'log', 'mud', 'reed']
const MAX = 192

function lodgeY(
  field: HeightField,
  params: NoiseParams,
  u: number,
  v: number,
  lift: number,
  hydro = defaultHydro,
) {
  const raw = sampleHeightField(field, u, v)
  const n = carveRiver(raw, u, v, params.seaLevel)
  const land = n * params.height
  const water = cappedWaterN(n, raw, u, v, hydro, params.seaLevel) * params.height
  return Math.max(land, water) + lift * params.height
}

function posePiece(
  piece: LodgePiece,
  params: NoiseParams,
  field: HeightField,
  fit: number,
  hydro = defaultHydro,
) {
  const x = (piece.u - 0.5) * params.worldSize
  const z = (piece.v - 0.5) * params.worldSize
  const y = lodgeY(field, params, piece.u, piece.v, piece.lift, hydro)
  dummy.position.set(x, y, z)
  if (piece.kind === 'reed') {
    dummy.rotation.set(piece.pitch * 0.2, piece.yaw, piece.roll * 0.2)
  } else if (piece.kind === 'mud') {
    dummy.rotation.set(piece.pitch * 0.35, piece.yaw, piece.roll)
  } else {
    dummy.rotation.set(Math.PI * 0.5 + piece.pitch, piece.yaw, piece.roll)
  }
  dummy.scale.set(piece.sx * fit * LODGE_DRAW, piece.sy * fit * LODGE_DRAW, piece.sz * fit * LODGE_DRAW)
  dummy.updateMatrix()
}

export function LodgeField({
  params,
  offsetRef,
  colonyRef,
}: {
  params: NoiseParams
  offsetRef: MutableRefObject<{ x: number; y: number }>
  colonyRef: MutableRefObject<ColonyState>
}) {
  const refs = useRef<Record<LodgePieceKind, InstancedMesh | null>>({
    stick: null,
    branch: null,
    log: null,
    mud: null,
    reed: null,
  })
  const finger = useRef('')

  useLayoutEffect(() => {
    for (const kind of KINDS) {
      const mesh = refs.current[kind]
      if (mesh) mesh.count = 0
    }
  }, [])

  useFrame(() => {
    const lodge = colonyRef.current.lodge
    const key = `${lodge?.pieces.length ?? 0}|${lodge?.stage ?? ''}|${(lodge?.size ?? 0).toFixed(3)}|${(colonyRef.current.hydro?.upstreamLevel ?? 0).toFixed(3)}`
    if (key === finger.current) return
    finger.current = key
    if (!lodge?.pieces?.length) {
      for (const kind of KINDS) {
        const mesh = refs.current[kind]
        if (mesh) {
          mesh.count = 0
          mesh.instanceMatrix.needsUpdate = true
        }
      }
      return
    }
    const field = getHeightField(params, offsetRef.current.x, offsetRef.current.y)
    const fit = params.worldSize / 7.2
    const hydro = colonyRef.current.hydro ?? defaultHydro
    for (const kind of KINDS) {
      const list = lodge.pieces.filter((p) => p.kind === kind).slice(0, MAX)
      const mesh = refs.current[kind]
      list.forEach((piece, i) => {
        posePiece(piece, params, field, fit, hydro)
        mesh?.setMatrixAt(i, dummy.matrix)
        if (mesh) {
          tint.copy(COLORS[kind])
          tint.offsetHSL(0, 0, ((piece.yaw * 9) % 1) * 0.1 - 0.05)
          mesh.setColorAt(i, tint)
        }
      })
      if (mesh) {
        mesh.count = list.length
        mesh.instanceMatrix.needsUpdate = true
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
        bindWorldCull(mesh, params.worldSize)
      }
    }
  })

  return (
    <group>
      <instancedMesh
        ref={(node) => {
          refs.current.stick = node
        }}
        args={[undefined, undefined, MAX]}
        frustumCulled={true}
        castShadow
      >
        <cylinderGeometry args={[1, 0.62, 1, 5]} />
        <meshStandardMaterial color={COLORS.stick} roughness={0.97} metalness={0} />
      </instancedMesh>
      <instancedMesh
        ref={(node) => {
          refs.current.branch = node
        }}
        args={[undefined, undefined, MAX]}
        frustumCulled={true}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[1, 0.7, 1, 6]} />
        <meshStandardMaterial color={COLORS.branch} roughness={0.95} metalness={0} />
      </instancedMesh>
      <instancedMesh
        ref={(node) => {
          refs.current.log = node
        }}
        args={[undefined, undefined, MAX]}
        frustumCulled={true}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[1, 0.76, 1, 7]} />
        <meshStandardMaterial color={COLORS.log} roughness={0.94} metalness={0} />
      </instancedMesh>
      <instancedMesh
        ref={(node) => {
          refs.current.mud = node
        }}
        args={[undefined, undefined, MAX]}
        frustumCulled={true}
        receiveShadow
      >
        <sphereGeometry args={[1, 7, 6]} />
        <meshStandardMaterial color={COLORS.mud} roughness={0.8} metalness={0} envMapIntensity={0.14} />
      </instancedMesh>
      <instancedMesh
        ref={(node) => {
          refs.current.reed = node
        }}
        args={[undefined, undefined, MAX]}
        frustumCulled={true}
      >
        <cylinderGeometry args={[0.38, 1, 1, 5]} />
        <meshStandardMaterial color={COLORS.reed} roughness={0.97} metalness={0} />
      </instancedMesh>
    </group>
  )
}
