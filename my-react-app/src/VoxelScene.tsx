import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { Color, InstancedMesh, Object3D } from 'three'
import { getHeightField, sampleHeightField } from './heightField'
import { noiseToColor, type NoiseParams } from './perlin'
import { SkyField } from './SkyField'
import {
  sampleSnow,
  sampleWater,
  sceneAtmosphere,
  stepWeather,
  tintWithCover,
  type WeatherCover,
  type WeatherKind,
} from './weather'

type Offset = { x: number; y: number }

type VoxelSceneProps = {
  params: NoiseParams
  running: boolean
  offsetRef: MutableRefObject<Offset>
  weather: WeatherKind
  intensity: number
  speed: number
  coverRef: MutableRefObject<WeatherCover>
}

const GRID = 32
const MAX_LAYERS = 14

function VoxelTerrain({
  params,
  running,
  offsetRef,
  weather,
  intensity,
  speed,
  coverRef,
}: VoxelSceneProps) {
  const meshRef = useRef<InstancedMesh>(null)
  const maxCount = GRID * GRID * MAX_LAYERS
  const dummy = useMemo(() => new Object3D(), [])
  const tint = useMemo(() => new Color(), [])
  const cell = params.worldSize / GRID

  const paint = () => {
    const mesh = meshRef.current
    if (!mesh) return

    const field = getHeightField(params, offsetRef.current.x, offsetRef.current.y)
    const y0 = -Math.max(0.45, params.height * 0.28)
    let i = 0

    for (let z = 0; z < GRID; z += 1) {
      for (let x = 0; x < GRID; x += 1) {
        const n = sampleHeightField(field, (x + 0.5) / GRID, (z + 0.5) / GRID)
        const u = (x + 0.5) / GRID
        const v = (z + 0.5) / GRID
        const snow = sampleSnow(coverRef.current, u, v)
        const pond = sampleWater(coverRef.current, u, v)
        const top = n * params.height + snow * 0.55 + pond * 0.32
        const layers = Math.max(1, Math.min(MAX_LAYERS, Math.round((top - y0) / cell)))
        const [r, g, b] = tintWithCover(noiseToColor(n), snow, pond)
        tint.setRGB(r / 255, g / 255, b / 255)
        const wx = (x + 0.5) * cell - params.worldSize / 2
        const wz = (z + 0.5) * cell - params.worldSize / 2

        for (let k = 0; k < layers; k += 1) {
          dummy.position.set(wx, y0 + (k + 0.5) * cell, wz)
          dummy.updateMatrix()
          mesh.setMatrixAt(i, dummy.matrix)
          mesh.setColorAt(i, tint)
          i += 1
        }
      }
    }

    mesh.count = i
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }

  const ready = useRef(false)

  useLayoutEffect(() => {
    ready.current = false
  }, [params, cell])

  useFrame((_, dt) => {
    const field = getHeightField(params, offsetRef.current.x, offsetRef.current.y)
    if (weather === 'rain' || weather === 'snow') {
      const pace = running ? speed : 0.18
      stepWeather(
        coverRef.current,
        (u, v) => sampleHeightField(field, u, v),
        weather,
        Math.min(0.05, dt),
        pace,
        intensity,
        params.height,
      )
    }
    if (!ready.current && meshRef.current) {
      paint()
      ready.current = true
      return
    }
    if (running || weather === 'rain' || weather === 'snow') paint()
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, maxCount]} frustumCulled={false}>
      <boxGeometry args={[cell * 0.94, cell * 0.94, cell * 0.94]} />
      <meshStandardMaterial roughness={0.86} metalness={0.02} />
    </instancedMesh>
  )
}

export function VoxelScene({
  params,
  running,
  offsetRef,
  weather,
  intensity,
  speed,
  coverRef,
}: VoxelSceneProps) {
  const look = sceneAtmosphere(weather)

  return (
    <Canvas
      className="scene-canvas"
      gl={{ alpha: false, antialias: true }}
      onCreated={({ gl }) => {
        gl.setClearColor(look.bg, 1)
      }}
      style={{ position: 'absolute', inset: 0, background: look.bg }}
      camera={{ position: [11.2, 6.2, 12.8], fov: 40 }}
      dpr={[1, 1.75]}
    >
      <color attach="background" args={[look.bg]} />
      <fog attach="fog" args={look.fog} />
      <ambientLight intensity={look.ambient} />
      <hemisphereLight color={look.hemiSky} groundColor={look.hemiGround} intensity={look.hemi} />
      <directionalLight position={[9, 15, 6]} intensity={look.sun} />
      <directionalLight position={[-6, 4, -5]} intensity={look.fill} />
      <SkyField
        weather={weather}
        worldSize={params.worldSize}
        intensity={intensity}
        speed={speed}
      />
      <VoxelTerrain
        params={params}
        running={running}
        offsetRef={offsetRef}
        weather={weather}
        intensity={intensity}
        speed={speed}
        coverRef={coverRef}
      />
      <OrbitControls makeDefault enableDamping />
    </Canvas>
  )
}
