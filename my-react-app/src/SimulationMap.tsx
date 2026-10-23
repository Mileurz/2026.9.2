import { useEffect, useRef, type MutableRefObject } from 'react'
import { getHeightField, paintHeightField } from './heightField'
import { type NoiseParams } from './perlin'
import type { WeatherCover, WeatherKind } from './weather'

type Offset = { x: number; y: number }

type SimulationMapProps = {
  params: NoiseParams
  running: boolean
  speed: number
  offsetRef: MutableRefObject<Offset>
  coverRef: MutableRefObject<WeatherCover>
  weather: WeatherKind
  onStart: () => void
  onStop: () => void
  onSpeed: (speed: number) => void
  onClose: () => void
  onReset: () => void
}

export function SimulationMap({
  params,
  running,
  speed,
  offsetRef,
  coverRef,
  weather,
  onStart,
  onStop,
  onSpeed,
  onClose,
  onReset,
}: SimulationMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0

    const paint = () => {
      const field = getHeightField(params, offsetRef.current.x, offsetRef.current.y)
      if (canvas.width !== field.width || canvas.height !== field.height) {
        canvas.width = field.width
        canvas.height = field.height
      }
      paintHeightField(ctx, field, coverRef.current)
    }

    paint()
    if (!running && weather !== 'rain' && weather !== 'snow') return

    const tick = () => {
      paint()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [params, running, offsetRef, coverRef, weather])

  return (
    <section className="sim-window" aria-label="Simulation map">
      <header className="noise-window-bar">
        <p className="noise-window-title">Simulation map</p>
        <button type="button" className="window-icon-btn" onClick={onClose}>
          Close
        </button>
      </header>

      <p className={`sim-status ${running ? 'is-running' : ''}`}>
        {running ? 'Running' : 'Stopped'}
      </p>
      <canvas ref={canvasRef} className="noise-canvas" />

      <label className="slider" htmlFor="sim-speed">
        <span className="slider-row">
          <span>Speed</span>
          <span className="slider-value">{speed.toFixed(1)}×</span>
        </span>
        <input
          id="sim-speed"
          type="range"
          min={0.1}
          max={3}
          step={0.1}
          value={speed}
          onChange={(event) => onSpeed(Number(event.target.value))}
        />
      </label>

      <div className="sim-actions">
        <button
          type="button"
          className="apply-btn"
          onClick={onStart}
          disabled={running}
        >
          Start
        </button>
        <button
          type="button"
          className="toolbar-btn"
          onClick={onStop}
          disabled={!running}
        >
          Stop
        </button>
        <button type="button" className="toolbar-btn" onClick={onReset}>
          Reset
        </button>
      </div>
    </section>
  )
}
