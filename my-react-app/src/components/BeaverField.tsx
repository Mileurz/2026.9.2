import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef, useState, type MutableRefObject } from 'react'
import { Group, Vector3 } from 'three'
import { getHeightField } from '../heightField'
import type { NoiseParams } from '../perlin'
import type { TreeSpot } from '../TreeField'
import { poseForTask } from '../simulation/Beaver'
import { stageScale } from '../simulation/Population'
import type { ColonyState } from '../simulation/Colony'
import { sampleBeaverGround, stepColony } from '../simulation/BeaverMovement'
import { consumeSimTime, ensureClock } from '../simulation/SimulationEngine'
import { riverWayVersion, updateRiverFromLand } from '../simulation/Hydrology'
import { buildRiparianLayout } from '../simulation/RiparianBiome'
import { plantedKindToSpecies, type TreeSeed } from '../simulation/TreeResource'
import { BeaverModel, type BeaverVisual } from './BeaverModel'

const scratch = new Vector3()
const camOffset = new Vector3()
const camTarget = new Vector3()

function LiveBeaver({
  id,
  params,
  colonyRef,
  selected,
  onSelect,
  worldRef,
}: {
  id: string
  params: NoiseParams
  colonyRef: MutableRefObject<ColonyState>
  selected: boolean
  onSelect: (id: string) => void
  worldRef: MutableRefObject<{ field: ReturnType<typeof getHeightField> } | null>
}) {
  const ref = useRef<Group>(null)
  const visual = useRef<BeaverVisual>({
    pose: 'walk',
    wet: 0.1,
    moving: false,
    carrying: false,
    branchLength: 0.25,
  })
  const placed = useRef(false)

  useFrame((_, dt) => {
    const group = ref.current
    const agent = colonyRef.current.beavers.find((b) => b.id === id)
    if (!group || !agent) {
      if (group) group.visible = false
      return
    }
    group.visible = true
    const field = worldRef.current?.field ?? getHeightField(params, 0, 0)
    const world = { params, field, seedTrees: [] as TreeSeed[], hydro: colonyRef.current.hydro }
    const g = sampleBeaverGround(world, agent.u, agent.v)
    const x = (agent.u - 0.5) * params.worldSize
    const z = (agent.v - 0.5) * params.worldSize
    const y = (g.inRiver ? g.water : g.n) * params.height + (g.inRiver ? 0.016 : 0.006)
    const moving = agent.speed > 0.004
    const e = 0.014
    const nL = moving ? sampleBeaverGround(world, agent.u - e, agent.v).n : g.n
    const nR = moving ? sampleBeaverGround(world, agent.u + e, agent.v).n : g.n
    const pitch = moving ? Math.atan2((nR - nL) * params.height, e * 2 * params.worldSize) * 0.22 : 0
    if (!placed.current) {
      group.position.set(x, y, z)
      group.rotation.y = agent.heading
      placed.current = true
    } else {
      group.position.x = x
      group.position.z = z
      group.position.y += (y - group.position.y) * (1 - Math.exp(-10 * dt))
    }
    const yaw = agent.heading
    const dyaw = Math.atan2(Math.sin(yaw - group.rotation.y), Math.cos(yaw - group.rotation.y))
    group.rotation.y += dyaw * (1 - Math.exp(-5.2 * dt))
    group.rotation.x += (pitch - group.rotation.x) * (1 - Math.exp(-3.2 * dt))
    const sexScale = agent.sex === 'male' ? 1.04 : 0.98
    group.scale.setScalar(sexScale * stageScale(agent.lifeStage ?? 'adult'))
    const held = colonyRef.current.forest?.branches.find((br) => br.id === agent.targetBranchId)
    visual.current.pose = poseForTask(agent.currentTask, g.inRiver, agent.carrying)
    visual.current.wet = agent.wet
    visual.current.moving = agent.speed > 0.006
    visual.current.carrying = agent.carrying
    visual.current.branchLength = held?.length ?? 0.22
  })

  return (
    <group
      ref={ref}
      onPointerDown={(event) => {
        event.stopPropagation()
        onSelect(id)
      }}
    >
      <mesh visible={false} position={[0, 0.05, 0]}>
        <sphereGeometry args={[0.1, 8, 8]} />
      </mesh>
      {selected ? (
        <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
          <ringGeometry args={[0.055, 0.068, 32]} />
          <meshBasicMaterial color="#2c2c2c" transparent opacity={0.42} />
        </mesh>
      ) : null}
      <BeaverModel visual={visual} />
    </group>
  )
}

export function FollowBeaver({
  enabled,
  followPos,
}: {
  enabled: boolean
  followPos: MutableRefObject<Vector3>
}) {
  const { camera, controls } = useThree()
  useFrame((_, dt) => {
    if (!enabled || !controls) return
    const c = controls as unknown as { target: Vector3; update: () => void }
    const k = 1 - Math.exp(-2.1 * dt)
    c.target.lerp(followPos.current, k)
    camOffset.copy(camera.position).sub(c.target)
    const span = camOffset.length()
    const want = span < 1.5 ? 2.1 : span > 3.4 ? 2.8 : span
    camOffset.multiplyScalar(span > 0.001 ? want / span : 1)
    camTarget.copy(c.target).add(camOffset)
    camera.position.lerp(camTarget, k * 0.35)
    c.update()
  })
  return null
}

export function BeaverField({
  params,
  trees,
  colonyRef,
  selectedId,
  onSelect,
  followId,
  followPos,
  offsetRef,
}: {
  params: NoiseParams
  trees: TreeSpot[]
  colonyRef: MutableRefObject<ColonyState>
  selectedId: string | null
  onSelect: (id: string) => void
  followId: string | null
  followPos: MutableRefObject<Vector3>
  offsetRef: MutableRefObject<{ x: number; y: number }>
}) {
  const [roster, setRoster] = useState(() => colonyRef.current.beavers.map((b) => b.id))
  const rosterKey = useRef(roster.join('|'))
  const worldRef = useRef<{ field: ReturnType<typeof getHeightField> } | null>(null)
  const layoutKey = useRef('')
  const seedTreesRef = useRef<TreeSeed[]>([])
  const plantedSeeds = useMemo(
    () =>
      trees.flatMap((t) => {
        const species = plantedKindToSpecies(t.kind)
        if (!species) return []
        return [
          {
            id: t.id,
            species,
            u: t.u,
            v: t.v,
            yaw: t.yaw,
            scale: t.scale,
            source: 'planted' as const,
          },
        ]
      }),
    [trees],
  )

  useFrame((_, dt) => {
    const field = getHeightField(params, offsetRef.current.x, offsetRef.current.y)
    worldRef.current = { field }
    updateRiverFromLand(field, params)
    const landKey = `${riverWayVersion()}|${plantedSeeds.length}|${params.seaLevel.toFixed(3)}`
    if (landKey !== layoutKey.current) {
      layoutKey.current = landKey
      const layout = buildRiparianLayout(field, params)
      seedTreesRef.current = [
        ...layout.trees.map((t) => ({
          id: t.id,
          species: t.species,
          u: t.u,
          v: t.v,
          yaw: t.yaw,
          scale: t.scale,
          source: 'riparian' as const,
        })),
        ...plantedSeeds,
      ]
    }
    const seedTrees = seedTreesRef.current
    const clock = ensureClock(colonyRef.current.clock)
    colonyRef.current.clock = clock
    const { simDt, motionDt } = consumeSimTime(clock, dt)
    stepColony(colonyRef.current, { params, field, seedTrees, hydro: colonyRef.current.hydro }, simDt, motionDt)
    const ids = colonyRef.current.beavers.map((b) => b.id)
    const key = ids.join('|')
    if (key !== rosterKey.current) {
      rosterKey.current = key
      setRoster(ids)
    }
    const follow = followId
      ? colonyRef.current.beavers.find((b) => b.id === followId)
      : null
    if (follow) {
      const g = sampleBeaverGround({ params, field, seedTrees }, follow.u, follow.v)
      scratch.set(
        (follow.u - 0.5) * params.worldSize,
        (g.inRiver ? g.water : g.n) * params.height + 0.14,
        (follow.v - 0.5) * params.worldSize,
      )
      followPos.current.lerp(scratch, 0.35)
    }
  })

  return (
    <group>
      {roster.map((id) => (
        <LiveBeaver
          key={id}
          id={id}
          params={params}
          colonyRef={colonyRef}
          selected={selectedId === id}
          onSelect={onSelect}
          worldRef={worldRef}
        />
      ))}
    </group>
  )
}
