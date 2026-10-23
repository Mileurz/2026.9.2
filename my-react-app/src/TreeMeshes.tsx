import { useMemo } from 'react'
import { Quaternion, Vector3 } from 'three'
import type { TreeKind } from './treeCatalog'

const bark = { roughness: 0.94, metalness: 0.02 } as const
const paper = { roughness: 0.98, metalness: 0, flatShading: true } as const
const wood = { roughness: 0.72, metalness: 0.04 } as const
const stem = '#8a8882'

function seedFrom(id: string) {
  let h = 2166136261
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return h >>> 0
}

function makeRng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function Stick({
  a,
  b,
  r0,
  r1,
  color,
}: {
  a: [number, number, number]
  b: [number, number, number]
  r0: number
  r1: number
  color: string
}) {
  const pose = useMemo(() => {
    const start = new Vector3(...a)
    const end = new Vector3(...b)
    const dir = end.clone().sub(start)
    const length = Math.max(dir.length(), 0.001)
    const mid = start.clone().add(end).multiplyScalar(0.5)
    const quat = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize())
    return { mid: mid.toArray() as [number, number, number], quat, length }
  }, [a, b])

  return (
    <mesh position={pose.mid} quaternion={pose.quat}>
      <cylinderGeometry args={[r1, r0, pose.length, 5]} />
      <meshStandardMaterial color={color} {...bark} />
    </mesh>
  )
}

type Limb = {
  a: [number, number, number]
  b: [number, number, number]
  r0: number
  r1: number
  leaf?: [number, number, number]
}

function growLimbs(
  id: string,
  opts: {
    height: number
    arms: number
    droop: number
    twigs: boolean
    leaves: number
  },
) {
  const rand = makeRng(seedFrom(id))
  const limbs: Limb[] = []
  const tips: [number, number, number][] = []
  const h = opts.height
  limbs.push({
    a: [0, 0, 0],
    b: [0, h, 0],
    r0: 0.018,
    r1: 0.008,
  })

  for (let i = 0; i < opts.arms; i += 1) {
    const y = 0.22 + rand() * (h - 0.3)
    const ang = i * 2.2 + rand() * 1.4
    const reach = 0.12 + rand() * 0.22
    const tip: [number, number, number] = [
      Math.cos(ang) * reach,
      y + (0.08 + rand() * 0.16) * (1 - opts.droop) - opts.droop * (0.08 + rand() * 0.18),
      Math.sin(ang) * reach,
    ]
    limbs.push({
      a: [0, y, 0],
      b: tip,
      r0: 0.007,
      r1: 0.003,
    })
    tips.push(tip)
    if (opts.twigs) {
      const tw: [number, number, number] = [
        tip[0] + Math.cos(ang + 0.8) * 0.08,
        tip[1] + 0.04 - opts.droop * 0.06,
        tip[2] + Math.sin(ang + 0.8) * 0.08,
      ]
      limbs.push({ a: tip, b: tw, r0: 0.003, r1: 0.002 })
      tips.push(tw)
    }
  }

  const leaves: [number, number, number][] = []
  for (let i = 0; i < opts.leaves; i += 1) {
    const tip = tips[Math.floor(rand() * tips.length)] ?? [0, h, 0]
    leaves.push([
      tip[0] + (rand() - 0.5) * 0.08,
      tip[1] + (rand() - 0.4) * 0.06,
      tip[2] + (rand() - 0.5) * 0.08,
    ])
  }
  return { limbs, leaves }
}

function BranchTree({
  id,
  height,
  arms,
  droop,
  twigs,
  leaves,
  leafColor,
  barkColor = stem,
  leafScale = 0.035,
}: {
  id: string
  height: number
  arms: number
  droop: number
  twigs: boolean
  leaves: number
  leafColor?: string
  barkColor?: string
  leafScale?: number
}) {
  const grown = useMemo(
    () => growLimbs(id, { height, arms, droop, twigs, leaves }),
    [id, height, arms, droop, twigs, leaves],
  )

  return (
    <group>
      {grown.limbs.map((limb, i) => (
        <Stick key={i} a={limb.a} b={limb.b} r0={limb.r0} r1={limb.r1} color={barkColor} />
      ))}
      {leafColor
        ? grown.leaves.map((pos, i) => (
            <mesh key={`l${i}`} position={pos} scale={leafScale * (0.7 + (i % 3) * 0.15)}>
              <icosahedronGeometry args={[1, 0]} />
              <meshStandardMaterial color={leafColor} roughness={0.88} />
            </mesh>
          ))
        : null}
    </group>
  )
}

function FacetTree() {
  return (
    <group>
      <mesh position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.012, 0.02, 0.44, 6]} />
        <meshStandardMaterial color="#6b675f" {...bark} />
      </mesh>
      <mesh position={[-0.08, 0.52, 0.02]} rotation={[0.15, 0.4, -0.35]}>
        <octahedronGeometry args={[0.2, 0]} />
        <meshStandardMaterial color="#c5d07a" {...paper} />
      </mesh>
      <mesh position={[0.1, 0.58, -0.04]} rotation={[-0.2, 0.7, 0.25]}>
        <octahedronGeometry args={[0.16, 0]} />
        <meshStandardMaterial color="#9aaa58" {...paper} />
      </mesh>
      <mesh position={[0.02, 0.72, 0.06]} rotation={[0.1, -0.3, 0.1]}>
        <octahedronGeometry args={[0.14, 0]} />
        <meshStandardMaterial color="#d6de8e" {...paper} />
      </mesh>
    </group>
  )
}

function PaperTree({ color, layers }: { color: string; layers: number }) {
  return (
    <group>
      <mesh position={[0, 0.16, 0]}>
        <cylinderGeometry args={[0.01, 0.014, 0.32, 5]} />
        <meshStandardMaterial color="#5a5854" {...bark} />
      </mesh>
      {Array.from({ length: layers }, (_, i) => {
        const t = i / Math.max(layers - 1, 1)
        return (
          <mesh key={i} position={[0, 0.28 + i * 0.09, 0]}>
            <coneGeometry args={[0.16 - t * 0.09, 0.12, 4]} />
            <meshStandardMaterial color={color} {...paper} />
          </mesh>
        )
      })}
    </group>
  )
}

function OrigamiTree() {
  return (
    <group>
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.01, 0.016, 0.36, 5]} />
        <meshStandardMaterial color="#6a6862" {...bark} />
      </mesh>
      <mesh position={[0, 0.46, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[0.2, 0.34, 4]} />
        <meshStandardMaterial color="#1e5a32" {...paper} />
      </mesh>
    </group>
  )
}

function SpruceTree() {
  const greens = ['#1b4a28', '#2a6a38', '#163820']
  return (
    <group>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.018, 0.028, 0.24, 6]} />
        <meshStandardMaterial color="#4a4036" {...bark} />
      </mesh>
      {[0.28, 0.42, 0.56, 0.68].map((y, i) => (
        <mesh key={y} position={[0, y, 0]}>
          <coneGeometry args={[0.2 - i * 0.038, 0.2, 7]} />
          <meshStandardMaterial color={greens[i % greens.length]} {...paper} />
        </mesh>
      ))}
    </group>
  )
}

function PineTree() {
  return (
    <group>
      <mesh position={[0, 0.1, 0]}>
        <cylinderGeometry args={[0.014, 0.02, 0.2, 6]} />
        <meshStandardMaterial color="#5c5348" {...bark} />
      </mesh>
      <mesh position={[0, 0.28, 0]}>
        <coneGeometry args={[0.18, 0.16, 5]} />
        <meshStandardMaterial color="#8fbf6a" {...paper} />
      </mesh>
      <mesh position={[0, 0.4, 0]}>
        <coneGeometry args={[0.13, 0.16, 5]} />
        <meshStandardMaterial color="#a8d07c" {...paper} />
      </mesh>
      <mesh position={[0, 0.52, 0]}>
        <coneGeometry args={[0.08, 0.14, 5]} />
        <meshStandardMaterial color="#6f9a4e" {...paper} />
      </mesh>
    </group>
  )
}

function SpiralTree() {
  return (
    <group>
      <mesh position={[0, 0.16, 0]}>
        <cylinderGeometry args={[0.01, 0.014, 0.32, 5]} />
        <meshStandardMaterial color="#6a6860" {...bark} />
      </mesh>
      {[0.34, 0.46, 0.58, 0.68].map((y, i) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, i * 0.4]}>
          <torusGeometry args={[0.09 - i * 0.012, 0.012, 6, 10]} />
          <meshStandardMaterial color="#c9d98a" roughness={0.86} />
        </mesh>
      ))}
    </group>
  )
}

function WoodConeTree() {
  return (
    <group>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.03, 0.04, 0.12, 8]} />
        <meshStandardMaterial color="#8a6238" {...wood} />
      </mesh>
      <mesh position={[0, 0.22, 0]}>
        <coneGeometry args={[0.16, 0.2, 8]} />
        <meshStandardMaterial color="#c4a06a" {...wood} />
      </mesh>
      <mesh position={[0, 0.38, 0]}>
        <coneGeometry args={[0.11, 0.18, 8]} />
        <meshStandardMaterial color="#b08958" {...wood} />
      </mesh>
      <mesh position={[0, 0.52, 0]}>
        <coneGeometry args={[0.06, 0.14, 8]} />
        <meshStandardMaterial color="#d2b48c" {...wood} />
      </mesh>
    </group>
  )
}

function WoodPawnTree() {
  return (
    <group>
      <mesh position={[0, 0.08, 0]}>
        <cylinderGeometry args={[0.05, 0.07, 0.16, 10]} />
        <meshStandardMaterial color="#8b5a2b" {...wood} />
      </mesh>
      <mesh position={[0, 0.24, 0]}>
        <sphereGeometry args={[0.09, 10, 8]} />
        <meshStandardMaterial color="#c9a36a" {...wood} />
      </mesh>
      <mesh position={[0, 0.36, 0]}>
        <sphereGeometry args={[0.055, 10, 8]} />
        <meshStandardMaterial color="#b8894a" {...wood} />
      </mesh>
    </group>
  )
}

function WoodStackTree() {
  return (
    <group>
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.03, 0.04, 0.1, 10]} />
        <meshStandardMaterial color="#7a5230" {...wood} />
      </mesh>
      {[0.14, 0.24, 0.34].map((y, i) => (
        <mesh key={y} position={[0, y, 0]}>
          <cylinderGeometry args={[0.12 - i * 0.015, 0.12 - i * 0.015, 0.08, 12]} />
          <meshStandardMaterial color={i % 2 ? '#e0c9a0' : '#c4a06a'} {...wood} />
        </mesh>
      ))}
    </group>
  )
}

function WoodEggTree() {
  return (
    <group>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.025, 0.035, 0.12, 8]} />
        <meshStandardMaterial color="#d8c3a5" {...wood} />
      </mesh>
      <mesh position={[0, 0.28, 0]} scale={[1, 1.35, 1]}>
        <sphereGeometry args={[0.12, 12, 10]} />
        <meshStandardMaterial color="#efe4d2" {...wood} />
      </mesh>
    </group>
  )
}

function RockPile({ id }: { id: string }) {
  const rand = makeRng(seedFrom(id))
  const chunks = Array.from({ length: 2 + Math.floor(rand() * 3) }, (_, i) => ({
    x: (rand() - 0.5) * 0.16,
    y: 0.035 + rand() * 0.04,
    z: (rand() - 0.5) * 0.16,
    sx: 0.1 + rand() * 0.12,
    sy: 0.06 + rand() * 0.08,
    sz: 0.09 + rand() * 0.12,
    rx: rand() * 0.9,
    ry: rand() * Math.PI * 2,
    rz: rand() * 0.7,
    c: i % 3 === 0 ? '#7a7670' : i % 3 === 1 ? '#908a84' : '#686460',
  }))
  return (
    <group>
      {chunks.map((chunk, i) => (
        <mesh
          key={i}
          position={[chunk.x, chunk.y, chunk.z]}
          rotation={[chunk.rx, chunk.ry, chunk.rz]}
          scale={[chunk.sx, chunk.sy, chunk.sz]}
        >
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color={chunk.c} roughness={0.97} metalness={0.02} flatShading />
        </mesh>
      ))}
    </group>
  )
}

function BushTree({ id }: { id: string }) {
  const rand = makeRng(seedFrom(id))
  const puffs = Array.from({ length: 7 }, (_, i) => ({
    x: (rand() - 0.5) * 0.22,
    y: 0.16 + rand() * 0.16,
    z: (rand() - 0.5) * 0.22,
    s: 0.07 + rand() * 0.05,
    c: i % 2 ? '#d2c878' : '#c4b05a',
  }))
  return (
    <group>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.012, 0.016, 0.12, 5]} />
        <meshStandardMaterial color={stem} {...bark} />
      </mesh>
      {puffs.map((puff, i) => (
        <mesh key={i} position={[puff.x, puff.y, puff.z]} scale={puff.s}>
          <icosahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color={puff.c} roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}

export function CatalogTree({ kind, id }: { kind: TreeKind; id: string }) {
  switch (kind) {
    case 'facet':
      return <FacetTree />
    case 'paper':
      return <PaperTree color="#245c32" layers={3} />
    case 'pine':
      return <PineTree />
    case 'spruce':
      return <SpruceTree />
    case 'origami':
      return <OrigamiTree />
    case 'spiral':
      return <SpiralTree />
    case 'woodCone':
      return <WoodConeTree />
    case 'woodPawn':
      return <WoodPawnTree />
    case 'woodStack':
      return <WoodStackTree />
    case 'woodEgg':
      return <WoodEggTree />
    case 'bare':
      return <BranchTree id={id} height={0.72} arms={7} droop={0.15} twigs leaves={0} />
    case 'gold':
      return (
        <BranchTree
          id={id}
          height={0.68}
          arms={6}
          droop={0.2}
          twigs
          leaves={18}
          leafColor="#e2c35a"
        />
      )
    case 'mist':
      return (
        <BranchTree
          id={id}
          height={0.7}
          arms={8}
          droop={0.05}
          twigs
          leaves={22}
          leafColor="#d5e0c8"
          leafScale={0.028}
        />
      )
    case 'willow':
      return (
        <BranchTree
          id={id}
          height={0.62}
          arms={9}
          droop={0.85}
          twigs
          leaves={26}
          leafColor="#d4b43a"
          leafScale={0.03}
        />
      )
    case 'sapling':
      return (
        <BranchTree
          id={id}
          height={0.58}
          arms={4}
          droop={0.1}
          twigs={false}
          leaves={10}
          leafColor="#7aa35a"
        />
      )
    case 'bush':
      return <BushTree id={id} />
    case 'rock':
      return <RockPile id={id} />
    default:
      return <FacetTree />
  }
}
