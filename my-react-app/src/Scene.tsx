import { Environment, Grid } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { memo, useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import {
  ACESFilmicToneMapping,
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  DoubleSide,
  LinearFilter,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PCFShadowMap,
  PlaneGeometry,
  Points,
  RGBAFormat,
  UnsignedByteType,
  Vector3,
} from 'three'
import { getHeightField, sampleHeightField, type HeightField } from './heightField'
import { type NoiseParams, noiseToColor } from './perlin'
import { BeaverField } from './components/BeaverField'
import { CameraRig, type CameraMode } from './components/CameraRig'
import { DamField } from './components/DamField'
import { LodgeField } from './components/LodgeField'
import { OverlayField } from './components/OverlayField'
import { TerritoryField } from './components/TerritoryField'
import { ForestField } from './components/ForestField'
import { RiparianEnvironment } from './components/RiparianEnvironment'
import { IceField } from './components/IceField'
import { WetlandField } from './components/WetlandField'
import { WildlifeField } from './components/WildlifeField'
import type { ColonyState } from './simulation/Colony'
import type { SeasonState } from './simulation/Season'
import { marshCoverAt, shoreMemoryAt, type SuccessionState } from './simulation/Succession'
import {
  carveRiver,
  defaultHydro,
  isInundated,
  updateRiverFromLand,
  riverDownstreamSign,
  riparianColor,
  streamAlong,
  waterlineFoam,
  waterSurfaceY,
  waterWetMask,
  type HydroState,
} from './simulation/Hydrology'
import { TreeField, canGrowTree, type TreeSpot } from './TreeField'
import type { TreeKind } from './treeCatalog'
import { SkyField } from './SkyField'
import {
  sampleSnow,
  sampleWater,
  sceneAtmosphere,
  shoreFoam,
  stepSeasonCover,
  stepWeather,
  tintWithCover,
  type WeatherCover,
  type WeatherKind,
} from './weather'

const idleFollow: MutableRefObject<Vector3> = { current: new Vector3() }

type Offset = { x: number; y: number }

type SceneProps = {
  params: NoiseParams
  applied: NoiseParams | null
  running: boolean
  showTerrain: boolean
  offsetRef: MutableRefObject<Offset>
  weather: WeatherKind
  intensity: number
  speed: number
  coverRef: MutableRefObject<WeatherCover>
  plantMode?: boolean
  deleteMode?: boolean
  treeKind?: TreeKind
  trees?: TreeSpot[]
  onPlant?: (spot: TreeSpot) => void
  onRemove?: (id: string) => void
  riparian?: boolean
  wetlandLook?: boolean
  colonyRef?: MutableRefObject<ColonyState>
  selectedBeaverId?: string | null
  onSelectBeaver?: (id: string) => void
  followPos?: MutableRefObject<Vector3>
  followCamera?: boolean
  cameraMode?: CameraMode
  showTerritory?: boolean
  showTreeTargets?: boolean
  showResourceNodes?: boolean
  showWaterChange?: boolean
  showEcologicalZones?: boolean
}

function applyHeightField(
  geo: PlaneGeometry,
  field: HeightField | null,
  worldSize: number,
  heightScale: number,
  cover: WeatherCover | null,
  shoreTex?: DataTexture | null,
  riparian = false,
  seaLevel = 0.1,
  hydro: HydroState = defaultHydro,
  succession?: SuccessionState | null,
  season?: SeasonState | null,
) {
  const pos = geo.attributes.position
  const colors = geo.attributes.color
  if (!geo.attributes.foam) {
    geo.setAttribute('foam', new BufferAttribute(new Float32Array(pos.count), 1))
  }
  const foamAttr = geo.attributes.foam
  const color = new Color()
  if (field && riparian) updateRiverFromLand(field, { seaLevel })

  const sampleH = (u: number, v: number) =>
    field ? sampleHeightField(field, u, v) : 0
  const samplePond = (u: number, v: number) => (cover ? sampleWater(cover, u, v) : 0)

  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const u = x / worldSize + 0.5
    const v = z / worldSize + 0.5
    if (field) {
      const raw = sampleHeightField(field, u, v)
      const n = riparian ? carveRiver(raw, u, v, seaLevel) : raw
      const snow = cover ? sampleSnow(cover, u, v) : 0
      const pond = samplePond(u, v)
      const foam = snow > 0.35
        ? 0
        : riparian
          ? waterlineFoam(n, u, v, hydro, seaLevel) * 0.22
          : shoreFoam(sampleH, samplePond, u, v)
      pos.setY(i, n * heightScale + snow * 0.55 + pond * 0.32)
      let [r, g, b] = tintWithCover(noiseToColor(n), snow, pond)
      if (riparian) {
        const tint = {
          marsh: succession ? marshCoverAt(succession, u, v) : 0,
          shore: succession ? shoreMemoryAt(succession, u, v) : 0,
          green: season?.green ?? 0,
          warmth: season?.warmth ?? 0,
          winter: season?.winter ?? 0,
        }
        const [rr, rg, rb] = tintWithCover(riparianColor(n, u, v, hydro, seaLevel, tint), snow, pond)
        r = Math.round(r + (rr - r) * 0.88)
        g = Math.round(g + (rg - g) * 0.88)
        b = Math.round(b + (rb - b) * 0.88)
      }
      if (foam > 0.04 && !riparian) {
        r = 255
        g = 255
        b = 255
      }
      color.setRGB(r / 255, g / 255, b / 255)
      foamAttr.setX(i, foam)
    } else {
      pos.setY(i, 0)
      color.set('#c5c5c5')
      foamAttr.setX(i, 0)
    }
    colors.setXYZ(i, color.r, color.g, color.b)
  }

  if (shoreTex && field) {
    const size = shoreTex.image.width
    const data = shoreTex.image.data as Uint8Array
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const u = size <= 1 ? 0 : x / (size - 1)
        const v = size <= 1 ? 0 : y / (size - 1)
        const raw = sampleHeightField(field, u, v)
        const n = riparian ? carveRiver(raw, u, v, seaLevel) : raw
        const pond = samplePond(u, v)
        const p = (y * size + x) * 4
        data[p] = Math.round(((n + 1) * 0.5) * 255)
        const wet = riparian && isInundated(n, u, v, hydro, seaLevel)
        data[p + 1] = riparian
          ? wet
            ? streamAlong(u, hydro) < 0.012
              ? 255
              : 90
            : 0
          : Math.round(Math.min(1, pond) * 255)
        data[p + 2] = riparian ? Math.round(waterlineFoam(n, u, v, hydro, seaLevel) * 255) : 0
        data[p + 3] = 255
      }
    }
    shoreTex.needsUpdate = true
  }

  pos.needsUpdate = true
  colors.needsUpdate = true
  foamAttr.needsUpdate = true
  geo.computeVertexNormals()
}

function applyWaterSurface(
  geo: PlaneGeometry,
  field: HeightField | null,
  params: NoiseParams,
  hydro: HydroState,
  riparian: boolean,
) {
  const pos = geo.attributes.position
  if (!geo.attributes.wet) {
    geo.setAttribute('wet', new BufferAttribute(new Float32Array(pos.count), 1))
  }
  const wetAttr = geo.attributes.wet
  const sea = params.seaLevel
  for (let i = 0; i < pos.count; i += 1) {
    if (!field) {
      pos.setY(i, 0)
      wetAttr.setX(i, 0)
      continue
    }
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const u = x / params.worldSize + 0.5
    const v = z / params.worldSize + 0.5
    const raw = sampleHeightField(field, u, v)
    const n = riparian ? carveRiver(raw, u, v, sea) : raw
    pos.setY(i, waterSurfaceY(n, raw, u, v, hydro, sea, params.height, riparian))
    wetAttr.setX(i, waterWetMask(n, u, v, hydro, sea, riparian))
  }
  pos.needsUpdate = true
  wetAttr.needsUpdate = true
  geo.computeBoundingSphere()
}

const FOAM_NOISE = `
float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float foamValue(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
float foamLive(vec2 uv, float t) {
  vec2 along = uv * vec2(86.0, 260.0) + vec2(t * 1.8, t * -0.35);
  vec2 chop = uv * vec2(190.0, 420.0) + vec2(t * -3.4, t * 1.6);
  vec2 specks = uv * vec2(480.0, 620.0) + vec2(t * 2.2, t * -2.8);
  float n = 0.42 * foamValue(along) + 0.38 * foamValue(chop) + 0.2 * foamValue(specks);
  float drift = 0.5 + 0.5 * sin(uv.x * 140.0 - t * 5.2 + foamValue(uv * 90.0 + t));
  n = mix(n, n * drift, 0.38);
  return smoothstep(0.62, 0.86, n);
}
`

function bindLandShader(material: MeshStandardMaterial, shoreTex: DataTexture, riparian = false) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 }
    shader.uniforms.uShore = { value: shoreTex }
    shader.uniforms.uRiparian = { value: riparian ? 1 : 0 }
    material.userData.uTime = shader.uniforms.uTime
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
attribute float foam;
varying float vFoam;
varying vec2 vFoamUv;`,
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
vFoam = foam;
vFoamUv = uv;`,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
uniform float uTime;
uniform float uRiparian;
uniform sampler2D uShore;
varying float vFoam;
varying vec2 vFoamUv;
${FOAM_NOISE}`,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
vec4 landShore = texture2D(uShore, vFoamUv);
float landWet = max(landShore.g, landShore.b * 0.65) * uRiparian;
roughnessFactor = mix(roughnessFactor, 0.34, clamp(landWet * 0.82, 0.0, 0.78));`,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `#include <opaque_fragment>
vec4 wetShore = texture2D(uShore, vFoamUv);
float wet = max(wetShore.g, wetShore.b * 0.55) * uRiparian;
float grain = foamValue(vFoamUv * 86.0);
gl_FragColor.rgb *= mix(vec3(1.0), vec3(0.46, 0.5, 0.48), clamp(wet * 0.72, 0.0, 0.7));
gl_FragColor.rgb *= 0.94 + grain * 0.08;
float live = foamLive(vFoamUv, uTime);
gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.86, 0.88, 0.86), clamp(vFoam * live * 0.28, 0.0, 0.35));`,
    )
  }
  material.customProgramCacheKey = () => `land-wet-shore-${riparian ? 1 : 0}`
}

function bindWaterShader(material: MeshPhysicalMaterial, shoreTex: DataTexture, riparian = false) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 }
    shader.uniforms.uShore = { value: shoreTex }
    shader.uniforms.uFlow = { value: 1 }
    shader.uniforms.uRiparian = { value: riparian ? 1 : 0 }
    material.userData.uTime = shader.uniforms.uTime
    material.userData.uFlow = shader.uniforms.uFlow
    material.userData.uRiparian = shader.uniforms.uRiparian
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
attribute float wet;
varying float vWet;
varying vec2 vShoreUv;
uniform float uTime;`,
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
vWet = wet;
vShoreUv = uv;
float chop = sin(uv.x * 52.0 + uTime * 1.55) * 0.0032 + sin(uv.y * 38.0 - uTime * 1.12) * 0.0024;
transformed.y += chop * wet;`,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
uniform float uTime;
uniform float uFlow;
uniform float uRiparian;
uniform sampler2D uShore;
varying float vWet;
varying vec2 vShoreUv;
${FOAM_NOISE}`,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
if (vWet < 0.42) discard;`,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `#include <opaque_fragment>
vec4 shore = texture2D(uShore, vShoreUv);
float bank = 1.0 - smoothstep(0.42, 0.92, vWet);
float depth = smoothstep(0.48, 1.0, vWet);
gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.22, 0.28, 0.24), depth * 0.38 * uRiparian);
gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.28, 0.3, 0.26), bank * 0.45 * uRiparian);
vec2 flowUv = vShoreUv + vec2(uTime * 0.012 * uFlow, 0.0);
float live = foamLive(flowUv, uTime);
float rim = max(shore.b, bank * 0.55);
float current = 0.5 + 0.5 * sin(vShoreUv.x * 18.0 - uTime * uFlow * 0.9);
float gloss = (0.018 + 0.03 * current) * uRiparian * (1.0 - bank * 0.6);
gl_FragColor.rgb += vec3(gloss * 0.72, gloss * 0.82, gloss);
gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.82, 0.86, 0.84), clamp(rim * live * 0.32, 0.0, 0.4));
gl_FragColor.a *= mix(1.0, 0.78, bank);`,
    )
  }
  material.customProgramCacheKey = () => `water-shore-blend-${riparian ? 1 : 0}`
}

function createSkirtGeometry(segments: number) {
  const cols = segments + 1
  const topBottom = cols * 2 * 4
  const positions = new Float32Array((topBottom + 4) * 3)
  const indices: number[] = []

  for (let side = 0; side < 4; side += 1) {
    const base = side * cols * 2
    for (let i = 0; i < cols - 1; i += 1) {
      const t0 = base + i * 2
      const b0 = t0 + 1
      const t1 = t0 + 2
      const b1 = t0 + 3
      indices.push(t0, b0, t1, b0, b1, t1)
    }
  }

  const b = topBottom
  indices.push(b, b + 1, b + 2, b, b + 2, b + 3)

  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(positions, 3))
  geo.setIndex(indices)
  return geo
}

function updateSkirt(
  skirt: BufferGeometry,
  top: PlaneGeometry,
  segments: number,
  yBottom: number,
) {
  const cols = segments + 1
  const src = top.attributes.position
  const dst = skirt.attributes.position
  const edgeAt = [
    (i: number) => i,
    (i: number) => i * cols + (cols - 1),
    (i: number) => segments * cols + (cols - 1 - i),
    (i: number) => (segments - i) * cols,
  ]

  let d = 0
  for (const indexAt of edgeAt) {
    for (let i = 0; i < cols; i += 1) {
      const si = indexAt(i)
      const x = src.getX(si)
      const y = src.getY(si)
      const z = src.getZ(si)
      dst.setXYZ(d, x, y, z)
      dst.setXYZ(d + 1, x, yBottom, z)
      d += 2
    }
  }

  const half = Math.abs(src.getX(0))
  dst.setXYZ(d, -half, yBottom, half)
  dst.setXYZ(d + 1, half, yBottom, half)
  dst.setXYZ(d + 2, half, yBottom, -half)
  dst.setXYZ(d + 3, -half, yBottom, -half)

  dst.needsUpdate = true
  skirt.computeVertexNormals()
}

function Precipitation({
  weather,
  params,
  coverRef,
  offsetRef,
  colonyRef,
}: {
  weather: WeatherKind
  params: NoiseParams
  coverRef: MutableRefObject<WeatherCover>
  offsetRef: MutableRefObject<Offset>
  colonyRef?: MutableRefObject<ColonyState>
}) {
  const pointsRef = useRef<Points>(null)
  const count = 640

  const { geometry, fall } = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const speeds = new Float32Array(count)
    const half = params.worldSize * 0.5
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() * 2 - 1) * half
      positions[i * 3 + 1] = 1.2 + Math.random() * 7.5
      positions[i * 3 + 2] = (Math.random() * 2 - 1) * half
      speeds[i] = 0.35 + Math.random() * 0.45
    }
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(positions, 3))
    return { geometry: geo, fall: speeds }
  }, [count, params.worldSize])

  useEffect(
    () => () => {
      geometry.dispose()
    },
    [geometry],
  )

  useFrame((_, dt) => {
    const seasonSnow = colonyRef?.current.season?.snow ?? 0
    const snowing = weather === 'snow' || seasonSnow > 0.38
    const raining = weather === 'rain'
    const points = pointsRef.current
    if (points) points.visible = snowing || raining
    if (!snowing && !raining) return
    const attr = points?.geometry.attributes.position
    if (!attr) return
    const half = params.worldSize * 0.5
    const field = getHeightField(params, offsetRef.current.x, offsetRef.current.y)
    const vy = snowing ? 0.42 : 2.1
    const drift = snowing ? 0.28 : 0.1
    const mat = points.material as { color?: Color; size?: number; opacity?: number }
    if (mat.color) mat.color.set(snowing ? '#f4f7fa' : '#9fd4ea')
    if (mat.size !== undefined) mat.size = snowing ? 0.07 : 0.035
    if (mat.opacity !== undefined) mat.opacity = snowing ? 0.55 + seasonSnow * 0.35 : 0.7

    for (let i = 0; i < count; i += 1) {
      let x = attr.getX(i) + drift * dt * Math.sin(i * 0.17)
      let y = attr.getY(i) - fall[i] * vy * dt
      let z = attr.getZ(i)
      const u = x / params.worldSize + 0.5
      const v = z / params.worldSize + 0.5
      let ground = -0.2
      if (y < 1.15) {
        const n = sampleHeightField(field, u, v)
        const snow = sampleSnow(coverRef.current, u, v)
        const pond = sampleWater(coverRef.current, u, v)
        ground = n * params.height + snow * 0.55 + pond * 0.32
      }
      if (y <= ground + 0.04) {
        x = (Math.random() * 2 - 1) * half
        z = (Math.random() * 2 - 1) * half
        y = 6.2 + Math.random() * 3.4
      }
      attr.setXYZ(i, x, y, z)
    }
    attr.needsUpdate = true
  })

  return (
    <points ref={pointsRef} geometry={geometry} frustumCulled={false} raycast={() => {}} visible={false}>
      <pointsMaterial
        color="#f4f7fa"
        size={0.07}
        sizeAttenuation
        transparent
        opacity={0.72}
        depthWrite={false}
      />
    </points>
  )
}

function TerrainPlane({
  params,
  applied,
  running,
  showTerrain,
  offsetRef,
  weather,
  intensity,
  speed,
  coverRef,
  plantMode = false,
  treeKind,
  onPlant,
  riparian = false,
  colonyRef,
}: SceneProps) {
  const meshRef = useRef<Mesh>(null)
  const skirtRef = useRef<Mesh>(null)
  const waterMeshRef = useRef<Mesh>(null)
  const landMatRef = useRef<MeshStandardMaterial>(null)
  const waterMatRef = useRef<MeshPhysicalMaterial>(null)
  const landKey = useRef('')
  const landTick = useRef(0)
  const source = applied ?? (showTerrain ? params : null)
  const yBottom = -Math.max(0.7, params.height * 0.48)

  const shoreTex = useMemo(() => {
    const size = 64
    const tex = new DataTexture(new Uint8Array(size * size * 4), size, size, RGBAFormat, UnsignedByteType)
    tex.needsUpdate = true
    tex.minFilter = LinearFilter
    tex.magFilter = LinearFilter
    return tex
  }, [])

  const { geometry, skirt, water } = useMemo(() => {
    const geo = new PlaneGeometry(
      params.worldSize,
      params.worldSize,
      params.planeSegments,
      params.planeSegments,
    )
    geo.rotateX(-Math.PI / 2)
    geo.setAttribute(
      'color',
      new BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3),
    )
    geo.setAttribute(
      'foam',
      new BufferAttribute(new Float32Array(geo.attributes.position.count), 1),
    )
    const map = applied ?? (showTerrain ? params : null)
    const field = map
      ? getHeightField(map, offsetRef.current.x, offsetRef.current.y)
      : null
    applyHeightField(
      geo,
      field,
      params.worldSize,
      params.height,
      coverRef.current,
      shoreTex,
      riparian,
      params.seaLevel,
    )
    const waterSeg = Math.min(80, Math.max(48, params.planeSegments))
    const waterGeo = new PlaneGeometry(params.worldSize, params.worldSize, waterSeg, waterSeg)
    waterGeo.rotateX(-Math.PI / 2)
    applyWaterSurface(waterGeo, field, params, defaultHydro, riparian)
    const skirtGeo = createSkirtGeometry(params.planeSegments)
    updateSkirt(skirtGeo, geo, params.planeSegments, yBottom)
    return { geometry: geo, skirt: skirtGeo, water: waterGeo }
  }, [params, applied, showTerrain, offsetRef, yBottom, coverRef, shoreTex, riparian])

  useEffect(
    () => () => {
      geometry.dispose()
      skirt.dispose()
      water.dispose()
    },
    [geometry, skirt, water],
  )

  useEffect(
    () => () => {
      shoreTex.dispose()
    },
    [shoreTex],
  )

  useEffect(() => {
    const land = landMatRef.current
    if (land && land.userData.landBound !== riparian) {
      bindLandShader(land, shoreTex, riparian)
      land.userData.landBound = riparian
      land.needsUpdate = true
    }
    const waterMat = waterMatRef.current
    if (waterMat && waterMat.userData.foamBound !== riparian) {
      bindWaterShader(waterMat, shoreTex, riparian)
      waterMat.userData.foamBound = riparian
      waterMat.needsUpdate = true
    }
  }, [geometry, shoreTex, source, riparian])

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime
    if (landMatRef.current?.userData.uTime) landMatRef.current.userData.uTime.value = t
    if (waterMatRef.current?.userData.uTime) waterMatRef.current.userData.uTime.value = t
    const hydro = colonyRef?.current.hydro ?? defaultHydro
    if (waterMatRef.current?.userData.uFlow) {
      waterMatRef.current.userData.uFlow.value = riverDownstreamSign() * (hydro.flow ?? 1)
    }
    if (waterMatRef.current?.userData.uRiparian) waterMatRef.current.userData.uRiparian.value = riparian ? 1 : 0

    const geo = meshRef.current?.geometry
    const skirtGeo = skirtRef.current?.geometry
    if (!(geo instanceof PlaneGeometry) || !skirtGeo) return

    const field = getHeightField(params, offsetRef.current.x, offsetRef.current.y)
    const sampleH = (u: number, v: number) => sampleHeightField(field, u, v)
    const wet = weather === 'rain' || weather === 'snow'
    if (wet) {
      const pace = running ? speed : 0.18
      stepWeather(coverRef.current, sampleH, weather, Math.min(0.05, dt), pace, intensity, params.height)
    }

    if (!running && !wet && !riparian) return
    const season = colonyRef?.current.season
    if (riparian && season && weather !== 'snow') {
      stepSeasonCover(coverRef.current, sampleH, season.snow, Math.min(0.05, dt))
    }
    const ice = season?.ice ?? 0
    const snow = season?.snow ?? 0
    const ox = offsetRef.current.x
    const oy = offsetRef.current.y
    const last = landKey.current.split('|').map(Number)
    landTick.current += 1
    const landDirty =
      landKey.current === '' ||
      wet ||
      Math.hypot(ox - (last[0] || 0), oy - (last[1] || 0)) > 0.0008 ||
      Math.abs(hydro.upstreamLevel - (last[2] || 0)) > 0.002 ||
      Math.abs(hydro.pondArea - (last[3] || 0)) > 0.045 ||
      Math.abs(ice - (last[4] || 0)) > 0.05 ||
      Math.abs(snow - (last[5] || 0)) > 0.05 ||
      (riparian && running && landTick.current % 16 === 0)
    if (landDirty) {
      landKey.current = `${ox}|${oy}|${hydro.upstreamLevel}|${hydro.pondArea}|${ice}|${snow}`
      applyHeightField(
        geo,
        field,
        params.worldSize,
        params.height,
        coverRef.current,
        shoreTex,
        riparian,
        params.seaLevel,
        hydro,
        colonyRef?.current.succession,
        season,
      )
      updateSkirt(skirtGeo, geo, params.planeSegments, yBottom)
      const waterGeo = waterMeshRef.current?.geometry
      if (waterGeo instanceof PlaneGeometry) {
        applyWaterSurface(waterGeo, field, params, hydro, riparian)
      }
    }
    const waterMat = waterMatRef.current
    if (waterMat && riparian) {
      const autumn = season?.autumn ?? 0
      const summer = season?.summer ?? 0
      waterMat.color.setRGB(
        0.14 + autumn * 0.07 + ice * 0.22,
        0.26 + summer * 0.05 + ice * 0.2,
        0.28 - autumn * 0.05 + ice * 0.22,
      )
      waterMat.opacity = 0.58 + ice * 0.18
      waterMat.roughness = 0.2 + ice * 0.48
      waterMat.envMapIntensity = 1.25 - ice * 0.55
    }
  })

  return (
    <group>
      <mesh
        ref={meshRef}
        geometry={geometry}
        receiveShadow={riparian}
        onPointerDown={(event) => {
          if (!plantMode || !onPlant || !source) return
          event.stopPropagation()
          const u = event.point.x / params.worldSize + 0.5
          const v = event.point.z / params.worldSize + 0.5
          if (u < 0 || u > 1 || v < 0 || v > 1) return
          const field = getHeightField(params, offsetRef.current.x, offsetRef.current.y)
          if (!canGrowTree(params, field, coverRef.current, u, v, colonyRef?.current.hydro ?? defaultHydro)) return
          onPlant({
            id: `${Date.now()}-${Math.round(u * 1000)}-${Math.round(v * 1000)}`,
            kind: treeKind ?? 'facet',
            u,
            v,
            scale: 0.52 + Math.random() * 0.16,
            yaw: Math.random() * Math.PI * 2,
          })
        }}
      >
        <meshStandardMaterial
          ref={landMatRef}
          vertexColors={Boolean(source)}
          color={source ? '#ffffff' : '#c5c5c5'}
          roughness={riparian ? 0.9 : weather === 'snow' ? 0.94 : 0.86}
          metalness={0}
          envMapIntensity={riparian ? 0.22 : 0.12}
          wireframe={!source}
        />
      </mesh>
      {source ? (
        <>
          <mesh
            ref={waterMeshRef}
            geometry={water}
            renderOrder={1}
            raycast={() => {}}
          >
            <meshPhysicalMaterial
              ref={waterMatRef}
              color={riparian ? '#2c4a4c' : '#4ec8f0'}
              transparent
              opacity={riparian ? 0.58 : 0.38}
              roughness={riparian ? 0.2 : 0.08}
              metalness={0.02}
              transmission={riparian ? 0.16 : 0.35}
              thickness={riparian ? 0.85 : 0.4}
              ior={1.333}
              envMapIntensity={riparian ? 1.28 : 0.8}
              depthWrite={false}
            />
          </mesh>
          <mesh ref={skirtRef} geometry={skirt} raycast={() => {}} receiveShadow={riparian}>
            <meshStandardMaterial
              color={riparian ? '#8a8478' : '#f2f2f2'}
              roughness={0.96}
              metalness={0}
              side={DoubleSide}
            />
          </mesh>
        </>
      ) : null}
      {source ? (
        <Precipitation
          weather={weather}
          params={params}
          coverRef={coverRef}
          offsetRef={offsetRef}
          colonyRef={colonyRef}
        />
      ) : null}
      {source && riparian ? (
        <RiparianEnvironment params={params} offsetRef={offsetRef} colonyRef={colonyRef} />
      ) : null}
    </group>
  )
}

const CANVAS_GL = { alpha: false, antialias: true, powerPreference: 'high-performance' as const }
const CANVAS_DPR: [number, number] = [1, 1.75]
const SHADOW_MAP: [number, number] = [1536, 1536]
const SHADOWS = { enabled: true, type: PCFShadowMap }

const SPRING_BG = new Color('#d6ddd4')
const SUMMER_BG = new Color('#c8d4b6')
const AUTUMN_BG = new Color('#d6c8b0')
const WINTER_BG = new Color('#e4ebef')
const SPRING_FOG = new Color('#c6cec5')
const SUMMER_FOG = new Color('#c2ccb8')
const AUTUMN_FOG = new Color('#d0c4b0')
const WINTER_FOG = new Color('#dce4e8')

function SeasonAtmosphere({
  colonyRef,
  riparian,
  weather,
}: {
  colonyRef?: MutableRefObject<ColonyState>
  riparian: boolean
  weather: WeatherKind
}) {
  const { scene } = useThree()
  const bg = useRef(new Color('#d6ddd4'))
  const fogC = useRef(new Color('#c6cec5'))
  const want = useRef(new Color())
  const sun = useRef<{ intensity: number; color: Color } | null>(null)
  useFrame((_, dt) => {
    if (!riparian || weather !== 'clear' || !colonyRef) return
    const s = colonyRef.current.season
    if (!s) return
    const k = 1 - Math.exp(-1.5 * dt)
    want.current.setRGB(
      SPRING_BG.r * s.spring + SUMMER_BG.r * s.summer + AUTUMN_BG.r * s.autumn + WINTER_BG.r * s.winter,
      SPRING_BG.g * s.spring + SUMMER_BG.g * s.summer + AUTUMN_BG.g * s.autumn + WINTER_BG.g * s.winter,
      SPRING_BG.b * s.spring + SUMMER_BG.b * s.summer + AUTUMN_BG.b * s.autumn + WINTER_BG.b * s.winter,
    )
    bg.current.lerp(want.current, k)
    if (scene.background instanceof Color) scene.background.copy(bg.current)
    want.current.setRGB(
      SPRING_FOG.r * s.spring + SUMMER_FOG.r * s.summer + AUTUMN_FOG.r * s.autumn + WINTER_FOG.r * s.winter,
      SPRING_FOG.g * s.spring + SUMMER_FOG.g * s.summer + AUTUMN_FOG.g * s.autumn + WINTER_FOG.g * s.winter,
      SPRING_FOG.b * s.spring + SUMMER_FOG.b * s.summer + AUTUMN_FOG.b * s.autumn + WINTER_FOG.b * s.winter,
    )
    fogC.current.lerp(want.current, k)
    const fog = scene.fog
    if (fog) {
      fog.color.copy(fogC.current)
      if ('density' in fog) {
        fog.density = 0.034 + s.winter * 0.012 + s.autumn * 0.006
      }
    }
    if (!sun.current) {
      scene.traverse((obj) => {
        const light = obj as { isDirectionalLight?: boolean; castShadow?: boolean; intensity: number; color: Color }
        if (light.isDirectionalLight && light.castShadow) sun.current = light
      })
    }
    if (sun.current) {
      sun.current.intensity = 0.92 + s.summer * 0.28 - s.winter * 0.18
      sun.current.color.setRGB(1, 0.96 - s.winter * 0.08 + s.autumn * 0.02, 0.86 - s.winter * 0.1 + s.autumn * 0.05)
    }
  })
  return null
}

function SceneView({
  params,
  applied,
  running,
  showTerrain,
  offsetRef,
  weather,
  intensity,
  speed,
  coverRef,
  plantMode = false,
  deleteMode = false,
  treeKind,
  trees = [],
  onPlant,
  onRemove,
  riparian = false,
  wetlandLook = false,
  colonyRef,
  selectedBeaverId = null,
  onSelectBeaver,
  followPos,
  followCamera = false,
  cameraMode = 'free',
  showTerritory = false,
  showTreeTargets = false,
  showResourceNodes = false,
  showWaterChange = false,
  showEcologicalZones = false,
}: SceneProps) {
  const hasLand = applied !== null || showTerrain
  const look = useMemo(
    () =>
      riparian && weather === 'clear'
        ? {
            bg: '#cfc6b6',
            fog: ['#c8c0b0', 0.038] as [string, number],
            ambient: 0.22,
            hemiSky: '#d4dde0',
            hemiGround: '#5c5a48',
            hemi: 0.42,
            sun: 1.05,
            fill: 0.12,
          }
        : sceneAtmosphere(weather),
    [riparian, weather],
  )
  const landscape = riparian || wetlandLook
  const clearColor = look.bg

  return (
    <Canvas
      className="scene-canvas"
      shadows={riparian ? SHADOWS : false}
      gl={CANVAS_GL}
      onCreated={({ gl, scene }) => {
        gl.setClearColor(clearColor, 1)
        gl.toneMapping = ACESFilmicToneMapping
        gl.toneMappingExposure = 1.04
        gl.shadowMap.type = PCFShadowMap
        scene.background = new Color(clearColor)
      }}
      style={{
        position: 'absolute',
        inset: 0,
        background: clearColor,
        cursor: plantMode ? 'crosshair' : deleteMode || riparian ? 'pointer' : 'auto',
      }}
      camera={{
        position: landscape
          ? [params.worldSize * 0.78, params.worldSize * 0.46, params.worldSize * 0.96]
          : [params.worldSize * 0.9, params.worldSize * 0.52, params.worldSize * 1.05],
        fov: 42,
      }}
      dpr={CANVAS_DPR}
    >
      <color attach="background" args={[look.bg]} />
      {riparian && weather === 'clear' ? (
        <fogExp2 attach="fog" args={look.fog as [string, number]} />
      ) : (
        <fog attach="fog" args={look.fog as [string, number, number]} />
      )}
      <ambientLight intensity={look.ambient} />
      <hemisphereLight color={look.hemiSky} groundColor={look.hemiGround} intensity={look.hemi} />
      <directionalLight
        position={[params.worldSize * 0.72, params.worldSize * 0.58, params.worldSize * 0.22]}
        intensity={look.sun}
        color="#fff4e4"
        castShadow={riparian}
        shadow-mapSize={SHADOW_MAP}
        shadow-bias={-0.00028}
        shadow-normalBias={0.028}
        shadow-camera-near={0.4}
        shadow-camera-far={params.worldSize * 3.2}
        shadow-camera-left={-params.worldSize * 0.68}
        shadow-camera-right={params.worldSize * 0.68}
        shadow-camera-top={params.worldSize * 0.68}
        shadow-camera-bottom={-params.worldSize * 0.68}
      />
      <directionalLight position={[-5.2, 3.4, -4.2]} intensity={look.fill} color="#b8c4c8" />
      {riparian && weather === 'clear' ? (
        <Environment preset="forest" background={false} environmentIntensity={0.48} />
      ) : null}
      {riparian ? <SeasonAtmosphere colonyRef={colonyRef} riparian={riparian} weather={weather} /> : null}
      <SkyField
        weather={weather}
        worldSize={params.worldSize}
        intensity={intensity}
        speed={speed}
      />
      {!hasLand ? (
        <Grid
          infiniteGrid
          fadeDistance={36}
          fadeStrength={1.15}
          cellSize={1}
          cellThickness={0.55}
          cellColor={look.bg === '#070b16' ? '#2a3140' : '#d0d0d0'}
          sectionSize={4}
          sectionThickness={1.05}
          sectionColor={look.bg === '#070b16' ? '#3a4254' : '#c5c5c5'}
        />
      ) : null}
      <TerrainPlane
        params={params}
        applied={applied}
        running={running}
        showTerrain={showTerrain}
        offsetRef={offsetRef}
        weather={weather}
        intensity={intensity}
        speed={speed}
        coverRef={coverRef}
        plantMode={plantMode}
        treeKind={treeKind}
        onPlant={onPlant}
        riparian={riparian}
        colonyRef={colonyRef}
      />
      {hasLand ? (
        <TreeField
          trees={trees}
          params={params}
          offsetRef={offsetRef}
          coverRef={coverRef}
          weather={weather}
          intensity={intensity}
          speed={speed}
          running={running}
          pickable={deleteMode}
          onRemove={onRemove}
          colonyRef={colonyRef}
        />
      ) : null}
      {hasLand && riparian && colonyRef ? (
        <ForestField params={params} offsetRef={offsetRef} colonyRef={colonyRef} />
      ) : null}
      {hasLand && riparian && colonyRef ? (
        <WetlandField params={params} offsetRef={offsetRef} colonyRef={colonyRef} />
      ) : null}
      {hasLand && riparian && colonyRef ? (
        <WildlifeField params={params} offsetRef={offsetRef} colonyRef={colonyRef} />
      ) : null}
      {hasLand && riparian && colonyRef ? (
        <IceField params={params} offsetRef={offsetRef} colonyRef={colonyRef} />
      ) : null}
      {hasLand && riparian && colonyRef ? (
        <DamField params={params} offsetRef={offsetRef} colonyRef={colonyRef} />
      ) : null}
      {hasLand && riparian && colonyRef ? (
        <LodgeField params={params} offsetRef={offsetRef} colonyRef={colonyRef} />
      ) : null}
      {hasLand && riparian && colonyRef && showTerritory ? (
        <TerritoryField params={params} offsetRef={offsetRef} colonyRef={colonyRef} />
      ) : null}
      {hasLand && riparian && colonyRef && (showTreeTargets || showResourceNodes || showWaterChange || showEcologicalZones) ? (
        <OverlayField
          params={params}
          offsetRef={offsetRef}
          colonyRef={colonyRef}
          showTreeTargets={showTreeTargets}
          showResourceNodes={showResourceNodes}
          showWaterChange={showWaterChange}
          showEcologicalZones={showEcologicalZones}
        />
      ) : null}
      {hasLand && riparian && colonyRef && followPos ? (
        <BeaverField
          params={params}
          trees={trees}
          colonyRef={colonyRef}
          selectedId={selectedBeaverId}
          onSelect={(id) => onSelectBeaver?.(id)}
          followId={selectedBeaverId}
          followPos={followPos}
          offsetRef={offsetRef}
        />
      ) : null}
      <CameraRig
        mode={followCamera && cameraMode === 'free' ? 'follow' : cameraMode}
        params={params}
        offsetRef={offsetRef}
        colonyRef={colonyRef}
        followPos={followPos ?? idleFollow}
        selectedId={selectedBeaverId}
      />
    </Canvas>
  )
}

export const Scene = memo(SceneView)
