import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { useMemo, useRef, type MutableRefObject } from 'react'
import { Color, Group, Mesh, MeshStandardMaterial } from 'three'

/**
 * Drop a realistic beaver GLB or GLTF at this public path to replace the stand-in.
 * Simulation in `simulation/` does not read this file.
 */
export const BEAVER_GLTF_URL: string | null = null

export type BeaverPose = 'rest' | 'walk' | 'swim' | 'chew' | 'carry'

export type BeaverVisual = {
  pose: BeaverPose
  wet: number
  moving: boolean
  carrying: boolean
  branchLength: number
}

const dryFur = new Color('#5a3d28')
const wetFur = new Color('#2c1c14')

function CarriedBranch({ visual }: { visual: MutableRefObject<BeaverVisual> }) {
  const stick = useRef<Group>(null)
  const wood = useMemo(
    () => new MeshStandardMaterial({ color: '#c4a06a', roughness: 0.82, metalness: 0.03 }),
    [],
  )
  useFrame(() => {
    const v = visual.current
    if (!stick.current) return
    stick.current.visible = v.carrying
    const len = 0.09 + Math.min(0.22, v.branchLength * 0.28)
    stick.current.scale.set(1, len, 1)
  })
  return (
    <group ref={stick} position={[0.006, -0.002, 0.046]} rotation={[1.08, 0.16, 0.2]} visible={false}>
      <mesh position={[0, 0.48, 0]} material={wood} castShadow>
        <cylinderGeometry args={[0.0065, 0.0085, 1, 6]} />
      </mesh>
    </group>
  )
}

function GltfBeaver({
  url,
  visual,
}: {
  url: string
  visual: MutableRefObject<BeaverVisual>
}) {
  const gltf = useGLTF(url)
  const root = useRef<Group>(null)
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene])
  useFrame((_, dt) => {
    const v = visual.current
    const sit = v.pose === 'rest' ? 0.18 : v.pose === 'swim' ? 0.1 : 0
    if (root.current) {
      root.current.rotation.x += (sit - root.current.rotation.x) * (1 - Math.exp(-4 * dt))
    }
    scene.traverse((obj) => {
      const mesh = obj as Mesh
      if (!mesh.isMesh || !(mesh.material instanceof MeshStandardMaterial)) return
      mesh.material.color.copy(dryFur).lerp(wetFur, v.wet * 0.45)
    })
  })
  return (
    <group ref={root}>
      <primitive object={scene} />
      <CarriedBranch visual={visual} />
    </group>
  )
}

function ProceduralBeaver({ visual }: { visual: MutableRefObject<BeaverVisual> }) {
  const gait = useRef(0)
  const body = useRef<Group>(null)
  const tail = useRef<Group>(null)
  const head = useRef<Group>(null)
  const fl = useRef<Group>(null)
  const fr = useRef<Group>(null)
  const hl = useRef<Group>(null)
  const hr = useRef<Group>(null)
  const furMat = useMemo(
    () =>
      new MeshStandardMaterial({
        color: dryFur.clone(),
        roughness: 0.96,
        metalness: 0,
        envMapIntensity: 0.28,
      }),
    [],
  )
  const muzzleMat = useMemo(
    () => new MeshStandardMaterial({ color: '#3a281c', roughness: 0.9, metalness: 0 }),
    [],
  )
  const tailMat = useMemo(
    () => new MeshStandardMaterial({ color: '#2a221a', roughness: 0.78, metalness: 0.04 }),
    [],
  )
  const eyeMat = useMemo(
    () => new MeshStandardMaterial({ color: '#0c0a09', roughness: 0.22, metalness: 0.08 }),
    [],
  )
  const noseMat = useMemo(
    () => new MeshStandardMaterial({ color: '#16110e', roughness: 0.45, metalness: 0 }),
    [],
  )
  const pawMat = useMemo(
    () => new MeshStandardMaterial({ color: '#3a2a20', roughness: 0.88, metalness: 0 }),
    [],
  )

  useFrame((_, dt) => {
    const v = visual.current
    const swim = v.pose === 'swim'
    const walk = v.pose === 'walk' || v.pose === 'carry'
    gait.current += dt * (swim ? 5.4 : walk && v.moving ? 5.8 : 0.7)
    const g = gait.current
    const sit = v.pose === 'rest' ? 0.28 : 0
    const chew = v.pose === 'chew' ? 1 : 0
    furMat.color.copy(dryFur).lerp(wetFur, v.wet)
    if (body.current) {
      body.current.rotation.x += ((sit * 0.32 + (swim ? 0.14 : 0)) - body.current.rotation.x) * (1 - Math.exp(-5 * dt))
      body.current.rotation.z = Math.sin(g) * (walk && v.moving ? 0.045 : 0)
      body.current.position.y = (walk && v.moving ? Math.sin(g * 2) * 0.004 : 0) + sit * 0.01
    }
    if (head.current) {
      const hold = v.carrying ? 0.14 : 0
      head.current.rotation.x = -0.08 + hold + chew * Math.sin(g * 3.2) * 0.12
    }
    if (tail.current) {
      tail.current.rotation.y = Math.sin(g * (swim ? 2.1 : 1)) * (swim ? 0.22 : walk && v.moving ? 0.08 : 0.02)
      tail.current.rotation.x = 0.12 + (swim ? -0.08 : 0)
    }
    const stride = Math.sin(g) * (walk && v.moving ? 0.28 : 0)
    if (fl.current) fl.current.rotation.x = stride
    if (fr.current) fr.current.rotation.x = -stride
    if (hl.current) hl.current.rotation.x = stride * 0.55 + (swim ? 0.55 : 0)
    if (hr.current) hr.current.rotation.x = -stride * 0.55 + (swim ? 0.55 : 0)
  })

  return (
    <group ref={body}>
      <mesh position={[0, 0.048, 0.008]} scale={[1.18, 0.82, 1.92]} castShadow material={furMat}>
        <sphereGeometry args={[0.055, 22, 16]} />
      </mesh>
      <mesh position={[0, 0.042, 0.055]} scale={[1.05, 0.7, 0.85]} castShadow material={furMat}>
        <sphereGeometry args={[0.04, 16, 12]} />
      </mesh>
      <group ref={head} position={[0, 0.058, 0.092]}>
        <mesh scale={[0.95, 0.82, 1.05]} castShadow material={furMat}>
          <sphereGeometry args={[0.032, 16, 12]} />
        </mesh>
        <mesh position={[0, -0.006, 0.026]} scale={[0.88, 0.7, 1.12]} castShadow material={muzzleMat}>
          <sphereGeometry args={[0.018, 12, 10]} />
        </mesh>
        <mesh position={[0, -0.004, 0.044]} material={noseMat}>
          <sphereGeometry args={[0.006, 8, 6]} />
        </mesh>
        <mesh position={[-0.016, 0.006, 0.014]} material={eyeMat}>
          <sphereGeometry args={[0.0042, 8, 6]} />
        </mesh>
        <mesh position={[0.016, 0.006, 0.014]} material={eyeMat}>
          <sphereGeometry args={[0.0042, 8, 6]} />
        </mesh>
        <mesh position={[-0.024, 0.016, 0.002]} rotation={[0.15, 0.2, -0.45]} scale={[0.7, 1, 0.45]} material={furMat}>
          <sphereGeometry args={[0.01, 8, 6]} />
        </mesh>
        <mesh position={[0.024, 0.016, 0.002]} rotation={[0.15, -0.2, 0.45]} scale={[0.7, 1, 0.45]} material={furMat}>
          <sphereGeometry args={[0.01, 8, 6]} />
        </mesh>
        <CarriedBranch visual={visual} />
      </group>
      <group ref={fl} position={[-0.032, 0.016, 0.048]}>
        <mesh material={pawMat}>
          <capsuleGeometry args={[0.009, 0.014, 4, 8]} />
        </mesh>
      </group>
      <group ref={fr} position={[0.032, 0.016, 0.048]}>
        <mesh material={pawMat}>
          <capsuleGeometry args={[0.009, 0.014, 4, 8]} />
        </mesh>
      </group>
      <group ref={hl} position={[-0.028, 0.015, -0.038]}>
        <mesh material={pawMat}>
          <capsuleGeometry args={[0.011, 0.012, 4, 8]} />
        </mesh>
        <mesh position={[0, -0.01, 0.01]} rotation={[0.4, 0, 0]} scale={[1.3, 0.35, 1.6]} material={pawMat}>
          <sphereGeometry args={[0.012, 8, 6]} />
        </mesh>
      </group>
      <group ref={hr} position={[0.028, 0.015, -0.038]}>
        <mesh material={pawMat}>
          <capsuleGeometry args={[0.011, 0.012, 4, 8]} />
        </mesh>
        <mesh position={[0, -0.01, 0.01]} rotation={[0.4, 0, 0]} scale={[1.3, 0.35, 1.6]} material={pawMat}>
          <sphereGeometry args={[0.012, 8, 6]} />
        </mesh>
      </group>
      <group ref={tail} position={[0, 0.026, -0.118]} rotation={[0.12, 0, 0]}>
        <mesh scale={[1.85, 0.16, 1.55]} castShadow material={tailMat}>
          <sphereGeometry args={[0.048, 14, 10]} />
        </mesh>
      </group>
    </group>
  )
}

export function BeaverModel({ visual }: { visual: MutableRefObject<BeaverVisual> }) {
  if (BEAVER_GLTF_URL) return <GltfBeaver url={BEAVER_GLTF_URL} visual={visual} />
  return <ProceduralBeaver visual={visual} />
}

if (BEAVER_GLTF_URL) useGLTF.preload(BEAVER_GLTF_URL)
