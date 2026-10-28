import { useState, type ReactNode } from 'react'
import { type ColonyKnobs } from '../simulation/Colony'
import { SIM_SPEEDS, type SimSpeed } from '../simulation/SimulationEngine'

export type OverlayToggles = {
  territory: boolean
  treeTargets: boolean
  resourceNodes: boolean
  waterChange: boolean
  ecologicalZones: boolean
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (value: number) => void
}) {
  const id = `colony-${label.toLowerCase().replace(/\s+/g, '-')}`
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

function Row({ label, value }: { label: string; value: string | number }) {
  const shown =
    typeof value === 'number' ? (Number.isFinite(value) ? value : 0) : value.includes('NaN') ? '0' : value
  return (
    <div>
      <dt>{label}</dt>
      <dd>{shown}</dd>
    </div>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="observe-block">
      <h3>{title}</h3>
      <dl className="observe-list">{children}</dl>
    </section>
  )
}

function LayerToggle({
  label,
  on,
  onToggle,
}: {
  label: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <button type="button" className={`layer-toggle ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={onToggle}>
      <span className="layer-mark" aria-hidden="true" />
      {label}
    </button>
  )
}

export function ColonyStats({
  year,
  month,
  day,
  dayOfYear,
  paused,
  simSpeed,
  onPause,
  onSpeed,
  onRestart,
  onClose,
  knobs,
  onKnobs,
  onDayOfYear,
  availableBranches,
  woodCollected,
  treesCut,
  damLength,
  damHeight,
  damMaterial,
  constructionProgress,
  waterLevel,
  pondArea,
  floodedArea,
  lodgeStage,
  lodgeMaterial,
  lodgeSize,
  population,
  adults,
  subadults,
  yearlings,
  kits,
  wetlandArea,
  treesRemaining,
  deadTrees,
  floodedForestArea,
  wetlandWildlife,
  season,
  headline,
  layers,
  onLayer,
}: {
  year: number
  month: string
  day: number
  dayOfYear: number
  paused: boolean
  simSpeed: SimSpeed
  onPause: () => void
  onSpeed: (speed: SimSpeed) => void
  onRestart: () => void
  onClose: () => void
  knobs: ColonyKnobs
  onKnobs: (patch: Partial<ColonyKnobs>) => void
  onDayOfYear: (dayOfYear: number) => void
  availableBranches: number
  woodCollected: number
  treesCut: number
  damLength: number
  damHeight: number
  damMaterial: number
  constructionProgress: number
  waterLevel: number
  pondArea: number
  floodedArea: number
  lodgeStage: string
  lodgeMaterial: number
  lodgeSize: number
  population: number
  adults: number
  subadults: number
  yearlings: number
  kits: number
  wetlandArea: number
  treesRemaining: number
  deadTrees: number
  floodedForestArea: number
  wetlandWildlife: string
  season: string
  headline: string
  layers: OverlayToggles
  onLayer: (key: keyof OverlayToggles) => void
}) {
  const [calibrate, setCalibrate] = useState(false)

  return (
    <section className="observe-panel" aria-label="Field record">
      <header className="observe-head">
        <div>
          <p className="observe-kicker">Field record</p>
          <h2 className="observe-title">Observation</h2>
        </div>
        <button type="button" className="window-icon-btn" onClick={onClose}>
          Close
        </button>
      </header>
      <p className="observe-lede">{headline}</p>

      <section className="observe-block">
        <h3>Layers</h3>
        <div className="layer-list">
          <LayerToggle label="Show Territory" on={layers.territory} onToggle={() => onLayer('territory')} />
          <LayerToggle label="Show Tree Targets" on={layers.treeTargets} onToggle={() => onLayer('treeTargets')} />
          <LayerToggle
            label="Show Resource Nodes"
            on={layers.resourceNodes}
            onToggle={() => onLayer('resourceNodes')}
          />
          <LayerToggle label="Show Water Change" on={layers.waterChange} onToggle={() => onLayer('waterChange')} />
          <LayerToggle
            label="Show Ecological Zones"
            on={layers.ecologicalZones}
            onToggle={() => onLayer('ecologicalZones')}
          />
        </div>
      </section>

      <Block title="Colony">
        <Row label="Population" value={population} />
        <Row label="Adults" value={adults} />
        <Row label="Subadults" value={subadults} />
        <Row label="Yearlings" value={yearlings} />
        <Row label="Kits" value={kits} />
      </Block>

      <Block title="Dam">
        <Row label="Length" value={`${damLength.toFixed(1)} m`} />
        <Row label="Height" value={`${damHeight.toFixed(2)} m`} />
        <Row label="Material" value={damMaterial.toFixed(1)} />
        <Row label="Construction Progress" value={`${Math.round(constructionProgress * 100)}%`} />
      </Block>

      <Block title="Water">
        <Row label="Water Level" value={waterLevel.toFixed(3)} />
        <Row label="Pond Area" value={pondArea.toFixed(2)} />
        <Row label="Flooded Area" value={floodedArea.toFixed(2)} />
      </Block>

      <Block title="Forest">
        <Row label="Trees Remaining" value={treesRemaining} />
        <Row label="Trees Cut" value={treesCut} />
        <Row label="Dead Trees" value={deadTrees} />
      </Block>

      <Block title="Wetland">
        <Row label="Wetland Area" value={wetlandArea.toFixed(2)} />
        <Row label="Flooded Forest" value={floodedForestArea.toFixed(2)} />
      </Block>

      <Block title="Lodge">
        <Row label="Lodge Stage" value={lodgeStage} />
        <Row label="Lodge Size" value={`${lodgeSize.toFixed(2)} m`} />
      </Block>

      <section className="observe-block">
        <h3>Time</h3>
        <dl className="observe-list">
          <Row label="Year" value={year} />
          <Row label="Month" value={month} />
          <Row label="Day" value={day} />
          <Row label="Simulation Speed" value={paused ? 'Paused' : `${simSpeed}×`} />
        </dl>
        <div className="observe-speeds" role="group" aria-label="Simulation speed">
          <button type="button" className={paused ? 'is-active' : ''} onClick={onPause}>
            Pause
          </button>
          {SIM_SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              className={!paused && simSpeed === speed ? 'is-active' : ''}
              onClick={() => onSpeed(speed)}
            >
              {speed}×
            </button>
          ))}
        </div>
        <button type="button" className="observe-restart" onClick={onRestart}>
          Restart colony
        </button>
      </section>

      <section className="observe-block">
        <button
          type="button"
          className="observe-calibrate"
          aria-expanded={calibrate}
          onClick={() => setCalibrate((open) => !open)}
        >
          {calibrate ? 'Hide calibration' : 'Calibration'}
        </button>
        {calibrate ? (
          <div className="observe-debug">
            <p className="observe-note">Model coefficients. Not field measurements.</p>
            <dl className="observe-list">
              <Row label="Season" value={season} />
              <Row label="Wetland Wildlife" value={wetlandWildlife} />
              <Row label="Available Branches" value={availableBranches} />
              <Row label="Wood Collected" value={woodCollected.toFixed(1)} />
              <Row label="Lodge Material" value={lodgeMaterial.toFixed(1)} />
            </dl>
            <Slider
              label="Day of year"
              value={dayOfYear}
              min={1}
              max={365}
              step={1}
              display={String(dayOfYear)}
              onChange={onDayOfYear}
            />
            <Slider
              label="Activity"
              value={knobs.activity}
              min={0.2}
              max={1.8}
              step={0.05}
              display={`${knobs.activity.toFixed(2)}×`}
              onChange={(value) => onKnobs({ activity: value })}
            />
            <Slider
              label="Breeding"
              value={knobs.breed}
              min={0}
              max={1.8}
              step={0.05}
              display={`${knobs.breed.toFixed(2)}×`}
              onChange={(value) => onKnobs({ breed: value })}
            />
            <Slider
              label="Pond rise"
              value={knobs.water}
              min={0}
              max={0.08}
              step={0.002}
              display={`${Math.round((knobs.water / 0.08) * 100)}%`}
              onChange={(value) => onKnobs({ water: value })}
            />
            <Slider
              label="Flow"
              value={knobs.flow}
              min={0.2}
              max={1.8}
              step={0.05}
              display={`${knobs.flow.toFixed(2)}×`}
              onChange={(value) => onKnobs({ flow: value })}
            />
            <Slider
              label="Tree regrowth"
              value={knobs.regen}
              min={0.2}
              max={2}
              step={0.05}
              display={`${knobs.regen.toFixed(2)}×`}
              onChange={(value) => onKnobs({ regen: value })}
            />
            <Slider
              label="Flood stress"
              value={knobs.flood}
              min={0.2}
              max={2}
              step={0.05}
              display={`${knobs.flood.toFixed(2)}×`}
              onChange={(value) => onKnobs({ flood: value })}
            />
            <Slider
              label="Vegetation"
              value={knobs.vegetation}
              min={0.2}
              max={1.8}
              step={0.05}
              display={`${knobs.vegetation.toFixed(2)}×`}
              onChange={(value) => onKnobs({ vegetation: value })}
            />
            <Slider
              label="Snow"
              value={knobs.snow}
              min={0}
              max={2}
              step={0.05}
              display={`${knobs.snow.toFixed(2)}×`}
              onChange={(value) => onKnobs({ snow: value })}
            />
            <Slider
              label="Wildlife"
              value={knobs.wildlife}
              min={0.2}
              max={1.8}
              step={0.05}
              display={`${knobs.wildlife.toFixed(2)}×`}
              onChange={(value) => onKnobs({ wildlife: value })}
            />
          </div>
        ) : null}
      </section>
    </section>
  )
}
