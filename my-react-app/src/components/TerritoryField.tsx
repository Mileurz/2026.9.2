import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type MutableRefObject } from 'react'
import { BufferAttribute, DoubleSide, Mesh, PlaneGeometry, ShaderMaterial } from 'three'
import { getHeightField, sampleHeightField } from '../heightField'
import type { NoiseParams } from '../perlin'
import type { ColonyState } from '../simulation/Colony'
import { carveRiver, cappedWaterN, defaultHydro } from '../simulation/Hydrology'
import { emptyTerritory, territoryIntensity } from '../simulation/Territory'

const SEG_U = 52
const SEG_V = 24

const VERT = /* glsl */ `
attribute float intensity;
varying float vI;
void main() {
  vI = intensity;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAG = /* glsl */ `
varying float vI;
void main() {
  if (vI < 0.09) discard;
  float a = smoothstep(0.09, 0.58, vI) * 0.28;
  gl_FragColor = vec4(0.41, 0.50, 0.36, a);
}
`

export function TerritoryField({
  params,
  offsetRef,
  colonyRef,
}: {
  params: NoiseParams
  offsetRef: MutableRefObject<{ x: number; y: number }>
  colonyRef: MutableRefObject<ColonyState>
}) {
  const meshRef = useRef<Mesh>(null)
  const tick = useRef(0)
  const geo = useMemo(() => {
    const g = new PlaneGeometry(1, 1, SEG_U, SEG_V)
    g.rotateX(-Math.PI / 2)
    g.setAttribute('intensity', new BufferAttribute(new Float32Array((SEG_U + 1) * (SEG_V + 1)), 1))
    return g
  }, [])
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        side: DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    [],
  )

  useFrame(() => {
    tick.current += 1
    if (tick.current % 8 !== 1) return
    const colony = colonyRef.current
    if (!colony.territory) colony.territory = emptyTerritory()
    const field = getHeightField(params, offsetRef.current.x, offsetRef.current.y)
    const hydro = colony.hydro ?? defaultHydro
    const sea = params.seaLevel
    const pos = geo.attributes.position
    const intens = geo.attributes.intensity as BufferAttribute
    const cols = SEG_U + 1
    const rows = SEG_V + 1
    for (let i = 0; i < pos.count; i += 1) {
      const iu = i % cols
      const iv = Math.floor(i / cols)
      const u = 0.1 + (iu / Math.max(1, cols - 1)) * 0.8
      const v = 0.16 + (iv / Math.max(1, rows - 1)) * 0.68
      const w = territoryIntensity(u, v, colony, field, params)
      const raw = sampleHeightField(field, u, v)
      const n = carveRiver(raw, u, v, sea)
      const water = cappedWaterN(n, raw, u, v, hydro, sea)
      pos.setXYZ(
        i,
        (u - 0.5) * params.worldSize,
        Math.max(n, water) * params.height + 0.05,
        (v - 0.5) * params.worldSize,
      )
      intens.setX(i, w)
    }
    pos.needsUpdate = true
    intens.needsUpdate = true
    geo.computeVertexNormals()
    if (meshRef.current) meshRef.current.visible = true
  })

  return <mesh ref={meshRef} geometry={geo} material={material} raycast={() => {}} />
}
