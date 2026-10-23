import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef, type MutableRefObject } from 'react'
import { Color, InstancedMesh, Object3D } from 'three'
import { getHeightField, sampleHeightField, type HeightField } from '../heightField'
import type { NoiseParams } from '../perlin'
import type { ColonyState } from '../simulation/Colony'
import type { DamPiece, DamPieceKind } from '../simulation/Dam'
import { carveRiver, cappedWaterN, defaultHydro } from '../simulation/Hydrology'

const dummy = new Object3D()
const COLORS: Record<DamPieceKind, Color> = {
  branch: new Color('#8a6240'),
  log: new Color('#6a4a30'),
  mud: new Color('#6b5340'),
  stone: new Color('#8a8478'),
  vegetation: new Color('#5a6c42'),
}

const KINDS: DamPieceKind[] = ['branch', 'log', 'mud', 'stone', 'vegetation']
const MAX = 192

function damY(
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
  return Math.max(land, water) + 0.016 + lift * params.height
}

function posePiece(
  piece: DamPiece,
  params: NoiseParams,
  field: HeightField,
  fit: number,
  hydro = defaultHydro,
) {
  const x = (piece.u - 0.5) * params.worldSize
  const z = (piece.v - 0.5) * params.worldSize
  const y = damY(field, params, piece.u, piece.v, piece.lift, hydro)
  dummy.position.set(x, y, z)
  if (piece.kind === 'branch' || piece.kind === 'log') {
    dummy.rotation.set(Math.PI * 0.5 + piece.pitch, piece.yaw, piece.roll)
  } else {
    dummy.rotation.set(piece.pitch * 0.4, piece.yaw, piece.roll)
  }
  dummy.scale.set(piece.sx * fit, piece.sy * fit, piece.sz * fit)
  dummy.updateMatrix()
}

export function DamField({
  params,
  offsetRef,
  colonyRef,
}: {
  params: NoiseParams
  offsetRef: MutableRefObject<{ x: number; y: number }>
  colonyRef: MutableRefObject<ColonyState>
}) {
  const refs = useRef<Record<DamPieceKind, InstancedMesh | null>>({
    branch: null,
    log: null,
    mud: null,
    stone: null,
    vegetation: null,
  })

  useLayoutEffect(() => {
    for (const kind of KINDS) {
      const mesh = refs.current[kind]
      if (mesh) mesh.count = 0
    }
  }, [])

  useFrame(() => {
    const dam = colonyRef.current.dam
    if (!dam?.pieces?.length) {
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
      const list = dam.pieces.filter((p) => p.kind === kind).slice(0, MAX)
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
          refs.current.branch = node
        }}
        args={[undefined, undefined, MAX]}
        frustumCulled={false}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[1, 0.85, 1, 5]} />
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
        <cylinderGeometry args={[1, 0.92, 1, 6]} />
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
          refs.current.stone = node
        }}
        args={[undefined, undefined, MAX]}
        frustumCulled={false}
        castShadow
        receiveShadow
      >
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color={COLORS.stone} roughness={0.86} />
      </instancedMesh>
      <instancedMesh
        ref={(node) => {
          refs.current.vegetation = node
        }}
        args={[undefined, undefined, MAX]}
        frustumCulled={false}
      >
        <coneGeometry args={[1, 1, 5]} />
        <meshStandardMaterial color={COLORS.vegetation} roughness={0.95} />
      </instancedMesh>
    </group>
  )
}
