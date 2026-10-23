import { useEffect, useRef } from 'react'
import { getHeightField, paintHeightField } from './heightField'
import {
  getShapeOption,
  shapeOptions,
  type NoiseParams,
  type ShapeOp,
} from './perlin'
import { weatherOptions, type WeatherKind } from './weather'

type NoiseViewProps = {
  params: NoiseParams
  onChange: (next: NoiseParams) => void
  onClose: () => void
  onApply: () => void
  applied: boolean
  weather: WeatherKind
  intensity: number
  onWeather: (weather: WeatherKind) => void
  onIntensity: (value: number) => void
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  display: string
}) {
  const id = `slider-${label.toLowerCase().replace(/\s+/g, '-')}`

  return (
    <label className="slider" htmlFor={id}>
      <span className="slider-row">
        <span>{label}</span>
        <span className="slider-value">{display}</span>
      </span>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

export function NoiseView({
  params,
  onChange,
  onClose,
  onApply,
  applied,
  weather,
  intensity,
  onWeather,
  onIntensity,
}: NoiseViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const size = params.sampleSize
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const field = getHeightField(params)
    paintHeightField(ctx, field)
  }, [params])

  const patch = (next: Partial<NoiseParams>) => {
    onChange({ ...params, ...next })
  }

  const set = (key: keyof NoiseParams, value: number) => {
    patch({ [key]: value })
  }

  const shape = getShapeOption(params.shape)

  const a = params.persistence.toFixed(2)
  const l = params.lacunarity.toFixed(2)
  const f = params.frequency.toFixed(2)

  return (
    <section className="noise-window" aria-label="2D noise map">
      <header className="noise-window-bar">
        <p className="noise-window-title">Height field</p>
        <button type="button" className="window-icon-btn" onClick={onClose}>
          Close
        </button>
      </header>

      <canvas ref={canvasRef} className="noise-canvas" />
      <p className="noise-equation">
        n = <span className="sigma">Σ</span>
        <sub>i=0</sub>
        <sup>{params.octaves - 1}</sup> {a}
        <sup>i</sup> · perlin({l}
        <sup>i</sup> · {f} · x, {l}
        <sup>i</sup> · {f} · y)
      </p>
      <p className="noise-equation noise-shape-eq">
        H = sea(n) + plains(n<sup>k</sup>) + ridged(1 − |n|)
      </p>
      {params.shape !== 'none' ? (
        <p className="noise-equation noise-shape-eq">
          s(n) = {shape.label.toLowerCase()}(n, {shape.format(params.shapeAmount)})
        </p>
      ) : null}

      <div className="slider-group">
        <p className="slider-heading">Equation</p>
        <Slider
          label="Frequency f"
          value={params.frequency}
          min={0.45}
          max={2.4}
          step={0.01}
          display={f}
          onChange={(value) => set('frequency', value)}
        />
        <Slider
          label="Octaves"
          value={params.octaves}
          min={1}
          max={8}
          step={1}
          display={String(params.octaves)}
          onChange={(value) => set('octaves', value)}
        />
        <Slider
          label="Persistence a"
          value={params.persistence}
          min={0.15}
          max={0.9}
          step={0.01}
          display={a}
          onChange={(value) => set('persistence', value)}
        />
        <Slider
          label="Lacunarity l"
          value={params.lacunarity}
          min={1.2}
          max={3.5}
          step={0.05}
          display={l}
          onChange={(value) => set('lacunarity', value)}
        />
        <Slider
          label="Height"
          value={params.height}
          min={0.6}
          max={3.2}
          step={0.05}
          display={params.height.toFixed(2)}
          onChange={(value) => set('height', value)}
        />
      </div>

      <div className="slider-group">
        <p className="slider-heading">From noise</p>
        <Slider
          label="Sea level"
          value={params.seaLevel ?? 0.1}
          min={-0.2}
          max={0.45}
          step={0.01}
          display={(params.seaLevel ?? 0.1).toFixed(2)}
          onChange={(value) => set('seaLevel', value)}
        />
        <Slider
          label="Ridged mountains"
          value={params.mountains ?? 0.92}
          min={0}
          max={1.5}
          step={0.02}
          display={(params.mountains ?? 0.92).toFixed(2)}
          onChange={(value) => set('mountains', value)}
        />
      </div>

      <div className="slider-group">
        <p className="slider-heading">Shaping</p>
        <label className="slider" htmlFor="shape-op">
          <span className="slider-row">
            <span>Operation</span>
            <span className="slider-value">{shape.label}</span>
          </span>
          <select
            id="shape-op"
            className="shape-select"
            value={params.shape}
            onChange={(event) => {
              const next = event.target.value as ShapeOp
              const option = getShapeOption(next)
              patch({ shape: next, shapeAmount: option.defaultAmount })
            }}
          >
            {shapeOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {params.shape !== 'none' ? (
          <Slider
            label={shape.sliderLabel}
            value={params.shapeAmount}
            min={shape.min}
            max={shape.max}
            step={shape.step}
            display={shape.format(params.shapeAmount)}
            onChange={(value) => set('shapeAmount', value)}
          />
        ) : null}
      </div>

      <div className="slider-group">
        <p className="slider-heading">Weather</p>
        <label className="slider" htmlFor="weather-kind">
          <span className="slider-row">
            <span>Condition</span>
            <span className="slider-value">
              {weatherOptions.find((option) => option.id === weather)?.label}
            </span>
          </span>
          <select
            id="weather-kind"
            className="shape-select"
            value={weather}
            onChange={(event) => onWeather(event.target.value as WeatherKind)}
          >
            {weatherOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {weather !== 'clear' ? (
          <Slider
            label="Intensity"
            value={intensity}
            min={0.25}
            max={2}
            step={0.05}
            display={`${intensity.toFixed(2)}×`}
            onChange={onIntensity}
          />
        ) : null}
        <p className="noise-equation noise-shape-eq">
          {weather === 'rain'
            ? 'Rain stays on the surface and pools downhill while the simulation runs.'
            : weather === 'snow'
              ? 'Snow stays on the surface and keeps packing while the simulation runs.'
              : weather === 'fog'
                ? 'Fog hangs in the air. It does not pile on the mesh.'
                : weather === 'night'
                  ? 'Night sky. Star particles only; nothing piles on the mesh.'
                  : weather === 'aurora'
                    ? 'Aurora is a particle curtain over a night sky. Intensity changes how bright it runs.'
                    : 'Clear. Use Reset on the simulation map to melt piled snow and water.'}
        </p>
      </div>

      <div className="slider-group">
        <p className="slider-heading">Resolution</p>
        <Slider
          label="Noise field"
          value={params.sampleSize}
          min={128}
          max={512}
          step={64}
          display={`${params.sampleSize} px`}
          onChange={(value) => set('sampleSize', value)}
        />
        <Slider
          label="3D plane"
          value={params.planeSegments}
          min={48}
          max={160}
          step={1}
          display={`${params.planeSegments} × ${params.planeSegments}`}
          onChange={(value) => set('planeSegments', value)}
        />
      </div>

      <button type="button" className="apply-btn" onClick={onApply}>
        {applied ? 'Reapply height field to 3D plane' : 'Apply height field to 3D plane'}
      </button>
    </section>
  )
}
