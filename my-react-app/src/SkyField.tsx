import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
} from 'three'
import type { WeatherKind } from './weather'

function StarField({
  worldSize,
  intensity,
}: {
  worldSize: number
  intensity: number
}) {
  const pointsRef = useRef<Points>(null)
  const count = 520

  const { geometry } = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const span = worldSize * 1.35
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() * 2 - 1) * span
      positions[i * 3 + 1] = 4.2 + Math.random() * 9.5
      positions[i * 3 + 2] = (Math.random() * 2 - 1) * span
    }
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(positions, 3))
    return { geometry: geo }
  }, [worldSize])

  useEffect(
    () => () => {
      geometry.dispose()
    },
    [geometry],
  )

  useFrame(({ clock }) => {
    const mat = pointsRef.current?.material
    if (!mat || Array.isArray(mat)) return
    const t = clock.elapsedTime
    mat.opacity = 0.42 + intensity * 0.28 + Math.sin(t * 1.4) * 0.08
  })

  return (
    <points ref={pointsRef} geometry={geometry} frustumCulled={false} raycast={() => {}}>
      <pointsMaterial
        color="#eef4ff"
        size={0.045}
        sizeAttenuation
        transparent
        opacity={0.7}
        depthWrite={false}
      />
    </points>
  )
}

function AuroraField({
  worldSize,
  intensity,
  speed,
}: {
  worldSize: number
  intensity: number
  speed: number
}) {
  const pointsRef = useRef<Points>(null)
  const count = 2400
  const green = useMemo(() => new Color('#3dff9a'), [])
  const cyan = useMemo(() => new Color('#4ae6ff'), [])
  const magenta = useMemo(() => new Color('#d56bff'), [])
  const mix = useMemo(() => new Color(), [])

  const { geometry, band, along, lift } = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const band = new Float32Array(count)
    const along = new Float32Array(count)
    const lift = new Float32Array(count)
    const half = worldSize * 0.58
    const tint = new Color()
    for (let i = 0; i < count; i += 1) {
      const sheet = i % 6
      const u = Math.random()
      const x = (u * 2 - 1) * half + (sheet - 2.5) * 0.35
      const y = 2.6 + sheet * 0.42 + Math.random() * 1.8
      const z = -worldSize * 0.22 + sheet * 0.55 + (Math.random() - 0.5) * 1.4
      positions[i * 3] = x
      positions[i * 3 + 1] = y
      positions[i * 3 + 2] = z
      band[i] = sheet
      along[i] = u
      lift[i] = Math.random()
      tint.copy(green).lerp(sheet % 2 ? cyan : magenta, sheet / 6)
      colors[i * 3] = tint.r
      colors[i * 3 + 1] = tint.g
      colors[i * 3 + 2] = tint.b
    }
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(positions, 3))
    geo.setAttribute('color', new BufferAttribute(colors, 3))
    return { geometry: geo, band, along, lift }
  }, [worldSize, cyan, green, magenta])

  useEffect(
    () => () => {
      geometry.dispose()
    },
    [geometry],
  )

  useFrame(({ clock }, dt) => {
    const attr = pointsRef.current?.geometry.attributes.position
    const colorAttr = pointsRef.current?.geometry.attributes.color
    if (!attr || !colorAttr) return
    const t = clock.elapsedTime
    const pace = 0.35 + speed * 0.25
    const half = worldSize * 0.62

    for (let i = 0; i < count; i += 1) {
      let x = attr.getX(i)
      let y = attr.getY(i)
      const z = attr.getZ(i)
      const u = along[i]
      const sheet = band[i]
      x += Math.sin(t * 0.55 * pace + u * 8 + sheet) * dt * 0.55
      y += Math.sin(t * 1.1 * pace + x * 0.35 + lift[i] * 6) * dt * 0.42 * intensity
      if (x > half) x -= half * 2
      if (x < -half) x += half * 2
      const base = 2.55 + sheet * 0.42
      if (y > base + 2.4) y = base
      if (y < base - 0.15) y = base + 1.6
      attr.setXYZ(i, x, y, z)

      const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.3 + u * 12 + sheet))
      mix.copy(green).lerp(sheet % 2 ? cyan : magenta, 0.25 + 0.55 * lift[i])
      mix.multiplyScalar(0.65 + pulse * 0.55 * intensity)
      colorAttr.setXYZ(i, mix.r, mix.g, mix.b)
    }
    attr.needsUpdate = true
    colorAttr.needsUpdate = true
  })

  return (
    <points ref={pointsRef} geometry={geometry} frustumCulled={false} raycast={() => {}}>
      <pointsMaterial
        vertexColors
        size={0.11 * Math.min(1.6, 0.7 + intensity * 0.4)}
        sizeAttenuation
        transparent
        opacity={0.82}
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </points>
  )
}

export function SkyField({
  weather,
  worldSize,
  intensity,
  speed,
}: {
  weather: WeatherKind
  worldSize: number
  intensity: number
  speed: number
}) {
  if (weather !== 'night' && weather !== 'aurora') return null
  return (
    <group>
      <StarField worldSize={worldSize} intensity={intensity} />
      {weather === 'aurora' ? (
        <AuroraField worldSize={worldSize} intensity={intensity} speed={speed} />
      ) : null}
    </group>
  )
}
