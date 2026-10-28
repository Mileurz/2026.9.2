import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type MutableRefObject } from 'react'
import { BufferAttribute, DoubleSide, Mesh, PlaneGeometry, ShaderMaterial } from 'three'
import { getHeightField, sampleHeightField } from '../heightField'
import type { NoiseParams } from '../perlin'
import type { ColonyState } from '../simulation/Colony'
import { carveRiver, defaultHydro, waterSurfaceY } from '../simulation/Hydrology'
import { emptySeason, iceCover } from '../simulation/Season'

const SEG = 40

const VERT = /* glsl */ `
attribute float ice;
varying float vIce;
void main() {
  vIce = ice;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAG = /* glsl */ `
varying float vIce;
void main() {
  if (vIce < 0.12) discard;
  float a = smoothstep(0.12, 0.72, vIce) * 0.52;
  vec3 ice = mix(vec3(0.72, 0.8, 0.84), vec3(0.9, 0.93, 0.95), smoothstep(0.2, 0.85, vIce));
  gl_FragColor = vec4(ice, a);
}
`

export function IceField({
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
    const g = new PlaneGeometry(1, 1, SEG, SEG)
    g.rotateX(-Math.PI / 2)
    g.setAttribute('ice', new BufferAttribute(new Float32Array((SEG + 1) * (SEG + 1)), 1))
    return g
  }, [])
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    [],
  )

  useFrame(() => {
    tick.current += 1
    if (tick.current % 6 !== 1) return
    const colony = colonyRef.current
    if (!colony.season) colony.season = emptySeason()
    if (colony.season.ice < 0.06) {
      if (meshRef.current) meshRef.current.visible = false
      return
    }
    if (meshRef.current) meshRef.current.visible = true
    const field = getHeightField(params, offsetRef.current.x, offsetRef.current.y)
    const hydro = colony.hydro ?? defaultHydro
    const sea = params.seaLevel
    const pos = geo.attributes.position
    const iceAttr = geo.attributes.ice as BufferAttribute
    const cols = SEG + 1
    const rows = SEG + 1
    for (let i = 0; i < pos.count; i += 1) {
      const iu = i % cols
      const iv = Math.floor(i / cols)
      const u = 0.12 + (iu / Math.max(1, cols - 1)) * 0.76
      const v = 0.18 + (iv / Math.max(1, rows - 1)) * 0.64
      const raw = sampleHeightField(field, u, v)
      const n = carveRiver(raw, u, v, sea)
      const ice = iceCover(u, v, n, hydro, sea, colony.season)
      const y = waterSurfaceY(n, raw, u, v, hydro, sea, params.height, true)
      pos.setXYZ(i, (u - 0.5) * params.worldSize, y + (ice > 0.12 ? 0.018 : 0), (v - 0.5) * params.worldSize)
      iceAttr.setX(i, ice)
    }
    pos.needsUpdate = true
    iceAttr.needsUpdate = true
  })

  return <mesh ref={meshRef} geometry={geo} material={material} visible={false} raycast={() => {}} />
}
