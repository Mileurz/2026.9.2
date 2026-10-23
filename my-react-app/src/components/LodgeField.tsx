import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef, type MutableRefObject } from 'react'
import { Color, InstancedMesh, Object3D } from 'three'
import { getHeightField, sampleHeightField, type HeightField } from '../heightField'
import type { NoiseParams } from '../perlin'
import type { ColonyState } from '../simulation/Colony'
import { carveRiver, cappedWaterN, defaultHydro } from '../simulation/Hydrology'
import type { LodgePiece, LodgePieceKind } from '../simulation/Lodge'

const dummy = new Object3D()
const COLORS: Record<LodgePieceKind, Color> = {
  stick: new Color('#7a5a38'),
  branch: new Color('#5c442c'),
  log: new Color('#3f2e20'),
  mud: new Color('#5a4634'),
  reed: new Color('#6a7a48'),
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
  const water = cappedWaterN(n, raw, u, v, hydro, params.seaLevel) * params.height
  return water + lift * params.height
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
  dummy.scale.set(piece.sx * fit, piece.sy * fit, piece.sz * fit)
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

  useLayoutEffect(() => {
    for (const kind of KINDS) {
      const mesh = refs.current[kind]
      if (mesh) mesh.count = 0
    }
  }, [])

  useFrame(() => {
    const lodge = colonyRef.current.lodge
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
      })
      if (mesh) {
        mesh.count = list.length
        mesh.instanceMatrix.needsUpdate = true
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
        frustumCulled={false}
        castShadow
      >
        <cylinderGeometry args={[1, 0.82, 1, 4]} />
        <meshStandardMaterial color={COLORS.stick} roughness={0.94} />
      </instancedMesh>
      <instancedMesh
        ref={(node) => {
          refs.current.branch = node
        }}
        args={[undefined, undefined, MAX]}
        frustumCulled={false}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[1, 0.86, 1, 5]} />
        <meshStandardMaterial color={COLORS.branch} roughness={0.92} />
      </instancedMesh>
      <instancedMesh
        ref={(node) => {
          refs.current.log = node
        }}
        args={[undefined, undefined, MAX]}
        frustumCulled={false}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[1, 0.9, 1, 6]} />
        <meshStandardMaterial color={COLORS.log} roughness={0.9} />
      </instancedMesh>
      <instancedMesh
        ref={(node) => {
          refs.current.mud = node
        }}
        args={[undefined, undefined, MAX]}
        frustumCulled={false}
        receiveShadow
      >
        <sphereGeometry args={[1, 6, 5]} />
        <meshStandardMaterial color={COLORS.mud} roughness={1} />
      </instancedMesh>
      <instancedMesh
        ref={(node) => {
          refs.current.reed = node
        }}
        args={[undefined, undefined, MAX]}
        frustumCulled={false}
      >
        <cylinderGeometry args={[0.45, 1, 1, 4]} />
        <meshStandardMaterial color={COLORS.reed} roughness={0.96} />
      </instancedMesh>
    </group>
  )
}
