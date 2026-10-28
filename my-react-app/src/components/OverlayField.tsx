import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type MutableRefObject } from 'react'
import { BufferAttribute, Color, DoubleSide, InstancedMesh, Object3D, PlaneGeometry, ShaderMaterial } from 'three'
import { getHeightField, sampleHeightField } from '../heightField'
import type { NoiseParams } from '../perlin'
import type { ColonyState } from '../simulation/Colony'
import {
  carveRiver,
  defaultHydro,
  floodplainMask,
  isInundated,
  riverMask,
} from '../simulation/Hydrology'
import { marshCoverAt } from '../simulation/Succession'
import { findTree } from '../simulation/TreeResource'

const dummy = new Object3D()
const markColor = new Color('#2a2a28')
const woodColor = new Color('#5c4a38')
const SEG = 28
const MAX_MARK = 72

const VERT = /* glsl */ `
attribute float intensity;
varying float vI;
void main() {
  vI = intensity;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const WATER_FRAG = /* glsl */ `
varying float vI;
void main() {
  if (vI < 0.08) discard;
  float a = smoothstep(0.08, 0.7, vI) * 0.2;
  gl_FragColor = vec4(0.32, 0.42, 0.46, a);
}
`

const ZONE_FRAG = /* glsl */ `
varying float vI;
void main() {
  if (vI < 0.08) discard;
  vec3 flood = vec3(0.55, 0.52, 0.42);
  vec3 marsh = vec3(0.38, 0.44, 0.32);
  vec3 col = mix(flood, marsh, smoothstep(0.28, 0.78, vI));
  float a = smoothstep(0.08, 0.65, vI) * 0.16;
  gl_FragColor = vec4(col, a);
}
`

function groundY(params: NoiseParams, u: number, v: number, ox: number, oy: number) {
  const field = getHeightField(params, ox, oy)
  return carveRiver(sampleHeightField(field, u, v), u, v, params.seaLevel) * params.height
}

export function OverlayField({
  params,
  offsetRef,
  colonyRef,
  showTreeTargets,
  showResourceNodes,
  showWaterChange,
  showEcologicalZones,
}: {
  params: NoiseParams
  offsetRef: MutableRefObject<{ x: number; y: number }>
  colonyRef: MutableRefObject<ColonyState>
  showTreeTargets: boolean
  showResourceNodes: boolean
  showWaterChange: boolean
  showEcologicalZones: boolean
}) {
  const targetRef = useRef<InstancedMesh>(null)
  const nodeRef = useRef<InstancedMesh>(null)
  const waterGeo = useMemo(() => {
    const g = new PlaneGeometry(params.worldSize, params.worldSize, SEG, SEG)
    g.rotateX(-Math.PI / 2)
    g.setAttribute('intensity', new BufferAttribute(new Float32Array((SEG + 1) * (SEG + 1)), 1))
    return g
  }, [params.worldSize])
  const zoneGeo = useMemo(() => {
    const g = new PlaneGeometry(params.worldSize, params.worldSize, SEG, SEG)
    g.rotateX(-Math.PI / 2)
    g.setAttribute('intensity', new BufferAttribute(new Float32Array((SEG + 1) * (SEG + 1)), 1))
    return g
  }, [params.worldSize])
  const waterMat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: WATER_FRAG,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    [],
  )
  const zoneMat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: ZONE_FRAG,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    [],
  )
  const tick = useRef(0)

  useFrame(() => {
    tick.current += 1
    if (tick.current % 3 !== 0) return
    const colony = colonyRef.current
    const ox = offsetRef.current.x
    const oy = offsetRef.current.y
    const field = getHeightField(params, ox, oy)
    const size = params.worldSize
    const sea = params.seaLevel
    const hydro = colony.hydro ?? defaultHydro
    const fit = size / 7.2

    const targets = targetRef.current
    if (targets) {
      let n = 0
      if (showTreeTargets && colony.forest) {
        for (const b of colony.beavers) {
          if (!b.targetTreeId || n >= MAX_MARK) continue
          const tree = findTree(colony.forest, b.targetTreeId)
          if (!tree) continue
          const y = groundY(params, tree.position.u, tree.position.v, ox, oy)
          dummy.position.set((tree.position.u - 0.5) * size, y + 0.02, (tree.position.v - 0.5) * size)
          dummy.rotation.set(-Math.PI / 2, 0, 0)
          dummy.scale.set(fit, fit, 1)
          dummy.updateMatrix()
          targets.setMatrixAt(n, dummy.matrix)
          n += 1
        }
      }
      targets.count = n
      targets.instanceMatrix.needsUpdate = true
    }

    const nodes = nodeRef.current
    if (nodes) {
      let n = 0
      if (showResourceNodes && colony.forest) {
        for (const br of colony.forest.branches) {
          if (!br.availability || br.inDam || br.inLodge || n >= MAX_MARK) continue
          const y = groundY(params, br.u, br.v, ox, oy)
          dummy.position.set((br.u - 0.5) * size, y + 0.018, (br.v - 0.5) * size)
          dummy.rotation.set(0, br.yaw, 0)
          dummy.scale.set(0.045 * fit, 0.012 * fit, 0.045 * fit)
          dummy.updateMatrix()
          nodes.setMatrixAt(n, dummy.matrix)
          n += 1
        }
        if (colony.storage && n < MAX_MARK) {
          const y = groundY(params, colony.storage.u, colony.storage.v, ox, oy)
          dummy.position.set((colony.storage.u - 0.5) * size, y + 0.02, (colony.storage.v - 0.5) * size)
          dummy.scale.set(0.07 * fit, 0.016 * fit, 0.07 * fit)
          dummy.updateMatrix()
          nodes.setMatrixAt(n, dummy.matrix)
          n += 1
        }
      }
      nodes.count = n
      nodes.instanceMatrix.needsUpdate = true
    }

    if (tick.current % 9 !== 0) return
    const fillGrid = (geo: PlaneGeometry, kind: 'water' | 'zone') => {
      const pos = geo.attributes.position
      const intens = geo.attributes.intensity as BufferAttribute
      for (let i = 0; i < pos.count; i += 1) {
        const u = pos.getX(i) / size + 0.5
        const v = pos.getZ(i) / size + 0.5
        const h = carveRiver(sampleHeightField(field, u, v), u, v, sea)
        const y = h * params.height + 0.03
        pos.setY(i, y)
        let value = 0
        if (kind === 'water' && showWaterChange) {
          const pond = isInundated(h, u, v, hydro, sea) && riverMask(u, v, sea) < 0.42
          value = pond ? 0.85 : 0
        }
        if (kind === 'zone' && showEcologicalZones) {
          const marsh = colony.succession ? marshCoverAt(colony.succession, u, v) : 0
          const flood = floodplainMask(u, v, sea)
          value = Math.max(marsh * 0.95, flood > 0.45 ? flood * 0.4 : 0)
        }
        intens.setX(i, value)
      }
      pos.needsUpdate = true
      intens.needsUpdate = true
      geo.computeVertexNormals()
    }
    if (showWaterChange) fillGrid(waterGeo, 'water')
    else (waterGeo.attributes.intensity as BufferAttribute).array.fill(0)
    if (showEcologicalZones) fillGrid(zoneGeo, 'zone')
    else (zoneGeo.attributes.intensity as BufferAttribute).array.fill(0)
    waterGeo.attributes.intensity.needsUpdate = true
    zoneGeo.attributes.intensity.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={targetRef} args={[undefined, undefined, MAX_MARK]} frustumCulled={false} raycast={() => {}}>
        <ringGeometry args={[0.055, 0.078, 28]} />
        <meshBasicMaterial color={markColor} transparent opacity={0.55} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={nodeRef} args={[undefined, undefined, MAX_MARK]} frustumCulled={false} raycast={() => {}}>
        <cylinderGeometry args={[1, 1, 1, 6]} />
        <meshBasicMaterial color={woodColor} transparent opacity={0.55} depthWrite={false} />
      </instancedMesh>
      {showWaterChange ? <mesh geometry={waterGeo} material={waterMat} raycast={() => {}} /> : null}
      {showEcologicalZones ? <mesh geometry={zoneGeo} material={zoneMat} raycast={() => {}} /> : null}
    </group>
  )
}
