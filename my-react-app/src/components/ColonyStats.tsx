import { useState } from 'react'
import { type ColonyKnobs } from '../simulation/Colony'
import { SIM_SPEEDS, type SimSpeed } from '../simulation/SimulationEngine'

const TAGS = ['Time', 'Beavers', 'Water', 'Forest', 'Season'] as const
type ColonyTag = (typeof TAGS)[number]

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

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
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
}) {
  const [tag, setTag] = useState<ColonyTag>('Time')

  return (
    <section className="inspect-window resource-window" aria-label="Colony">
      <header className="noise-window-bar">
        <p className="noise-window-title">Colony</p>
        <button type="button" className="window-icon-btn" onClick={onClose}>
          Close
        </button>
      </header>
      <div className="colony-tags" role="tablist" aria-label="Colony conditions">
        {TAGS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tag === name}
            className={tag === name ? 'is-active' : ''}
            onClick={() => setTag(name)}
          >
            {name}
          </button>
        ))}
      </div>
      {tag === 'Time' ? (
        <div className="sim-clock">
          <p>Year {year}</p>
          <p>{month}</p>
          <p>Day {day}</p>
          <p className="colony-now">{headline}</p>
          <div className="sim-clock-speeds" role="group" aria-label="Simulation speed">
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
          <button type="button" className="colony-restart" onClick={onRestart}>
            Restart colony
          </button>
          <p className="colony-note">Simplified wetland model — not measured hydrology.</p>
          <Slider
            label="Day of year"
            value={dayOfYear}
            min={1}
            max={365}
            step={1}
            display={String(dayOfYear)}
            onChange={onDayOfYear}
          />
        </div>
      ) : null}
      {tag === 'Beavers' ? (
        <>
          <dl className="inspect-list">
            <Stat label="Population" value={population} />
            <Stat label="Adults" value={adults} />
            <Stat label="Subadults" value={subadults} />
            <Stat label="Yearlings" value={yearlings} />
            <Stat label="Kits" value={kits} />
            <Stat label="Lodge Stage" value={lodgeStage} />
            <Stat label="Lodge Material" value={lodgeMaterial.toFixed(1)} />
            <Stat label="Lodge Size" value={lodgeSize.toFixed(2)} />
          </dl>
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
        </>
      ) : null}
      {tag === 'Water' ? (
        <>
          <dl className="inspect-list">
            <Stat label="Dam Length" value={damLength.toFixed(2)} />
            <Stat label="Dam Height" value={damHeight.toFixed(3)} />
            <Stat label="Dam Material" value={damMaterial.toFixed(1)} />
            <Stat label="Construction Progress" value={`${Math.round(constructionProgress * 100)}%`} />
            <Stat label="Water Level" value={waterLevel.toFixed(3)} />
            <Stat label="Pond Area" value={pondArea.toFixed(2)} />
            <Stat label="Flooded Area" value={floodedArea.toFixed(2)} />
          </dl>
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
        </>
      ) : null}
      {tag === 'Forest' ? (
        <>
          <dl className="inspect-list">
            <Stat label="Available Branches" value={availableBranches} />
            <Stat label="Wood Collected" value={woodCollected.toFixed(1)} />
            <Stat label="Trees Remaining" value={treesRemaining} />
            <Stat label="Trees Cut" value={treesCut} />
            <Stat label="Dead Trees" value={deadTrees} />
            <Stat label="Flooded Forest Area" value={floodedForestArea.toFixed(2)} />
          </dl>
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
        </>
      ) : null}
      {tag === 'Season' ? (
        <>
          <dl className="inspect-list">
            <Stat label="Season" value={season} />
            <Stat label="Wetland Area" value={wetlandArea.toFixed(2)} />
            <Stat label="Wetland Wildlife" value={wetlandWildlife} />
          </dl>
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
        </>
      ) : null}
    </section>
  )
}
