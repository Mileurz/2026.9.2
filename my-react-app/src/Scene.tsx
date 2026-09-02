import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'

function Cube() {
  return (
    <mesh>
      <boxGeometry args={[1.2, 1.2, 1.2]} />
      <meshStandardMaterial color="#c084fc" metalness={0.25} roughness={0.35} />
    </mesh>
  )
}

export function Scene() {
  return (
    <Canvas
      className="scene-canvas"
      style={{ position: 'absolute', inset: 0 }}
      camera={{ position: [2.4, 1.8, 2.8], fov: 50 }}
      dpr={[1, 2]}
    >
      <color attach="background" args={['#0c0d12']} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[4, 6, 3]} intensity={1.4} />
      <directionalLight position={[-3, -2, -4]} intensity={0.35} />
      <Cube />
      <OrbitControls makeDefault enableDamping />
    </Canvas>
  )
}
