import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import { onAuthStateChanged } from 'firebase/auth'
import { Vector3 } from 'three'
import { AccountBar } from './AccountBar'
import { BeaverInspect } from './components/BeaverInspect'
import { ColonyStats } from './components/ColonyStats'
import { Cover } from './Cover'
import { auth } from './firebase'
import { NoiseView } from './NoiseView'
import { completeParams, defaultNoiseParams, type NoiseParams } from './perlin'
import { Scene } from './Scene'
import { SimulationMap } from './SimulationMap'
import type { BeaverAgent } from './simulation/Beaver'
import { colonyHeadline, createFoundingColony, emptyKnobs, ensureKnobs } from './simulation/Colony'
import { lodgeStageLabel } from './simulation/Lodge'
import { colonyCensus } from './simulation/Population'
import { applySeasonKnobs, seasonLabel, stepSeasonFromDays } from './simulation/Season'
import { successionStats } from './simulation/Succession'
import { wildlifeStats } from './simulation/Wildlife'
import {
  DAYS_PER_YEAR,
  calendarOf,
  ensureClock,
  pauseSim,
  setSimSpeed,
  type SimSpeed,
} from './simulation/SimulationEngine'
import { forestStats } from './simulation/TreeResource'
import { scatterTreesOnLand, type TreeSpot } from './TreeField'
import { DEFAULT_TREE_KIND, TREE_CATALOG, type TreeKind } from './treeCatalog'
import { loadUserSite, saveUserSite } from './userSite'
import { VoxelScene } from './VoxelScene'
import { clearWeatherCover, createWeatherCover, type WeatherKind } from './weather'
import './App.css'

function App() {
  const [cover, setCover] = useState<'in' | 'folding' | 'out'>('in')
  const [params, setParams] = useState(defaultNoiseParams)
  const [applied, setApplied] = useState<NoiseParams | null>({ ...defaultNoiseParams })
  const [mapOpen, setMapOpen] = useState(true)
  const [simOpen, setSimOpen] = useState(true)
  const [accountOpen, setAccountOpen] = useState(true)
  const [colonyOpen, setColonyOpen] = useState(true)
  const [running, setRunning] = useState(false)
  const [hasSim, setHasSim] = useState(false)
  const [tab, setTab] = useState<'model' | 'voxel' | 'tree' | 'colony'>('model')
  const [treeTool, setTreeTool] = useState<'place' | 'delete'>('place')
  const [treeKind, setTreeKind] = useState<TreeKind>(DEFAULT_TREE_KIND)
  const [speed, setSpeed] = useState(1)
  const [weather, setWeather] = useState<WeatherKind>('clear')
  const [weatherRate, setWeatherRate] = useState(1)
  const [note, setNote] = useState('')
  const [trees, setTrees] = useState<TreeSpot[]>([])
  const [cloudStatus, setCloudStatus] = useState('Not signed in')
  const [user, setUser] = useState<User | null>(null)
  const readyToSave = useRef(false)
  const offsetRef = useRef({ x: 0, y: 0 })
  const coverRef = useRef(createWeatherCover())
  const colonyRef = useRef(createFoundingColony())
  const statsFinger = useRef('')
  const followPos = useRef(new Vector3())
  const [selectedBeaverId, setSelectedBeaverId] = useState<string | null>(null)
  const [inspectBeaver, setInspectBeaver] = useState<BeaverAgent | null>(null)
  const [followCamera, setFollowCamera] = useState(false)
  const [showTerritory, setShowTerritory] = useState(false)
  const [resourceStats, setResourceStats] = useState({
    availableBranches: 0,
    woodCollected: 0,
    treesCut: 0,
    damLength: 0,
    damHeight: 0,
    damMaterial: 0,
    constructionProgress: 0,
    waterLevel: 0.02,
    pondArea: 0,
    floodedArea: 0,
    lodgeStage: 'Small branch pile',
    lodgeMaterial: 0,
    lodgeSize: 0,
    population: 2,
    adults: 2,
    subadults: 0,
    yearlings: 0,
    kits: 0,
    wetlandArea: 0,
    treesRemaining: 0,
    deadTrees: 0,
    floodedForestArea: 0,
    wetlandWildlife: 'Sparse',
    season: 'Autumn',
    clockYear: 1,
    clockMonth: 'September',
    clockDay: 249,
    clockPaused: false,
    clockSpeed: 5 as SimSpeed,
    clockDayOfYear: 249,
    knobs: emptyKnobs(),
    headline: 'Autumn: cutting wood and starting a dam.',
  })

  useEffect(() => {
    if (!auth) return
    return onAuthStateChanged(auth, setUser)
  }, [])

  useEffect(() => {
    if (!user) {
      readyToSave.current = false
      setCloudStatus('Not signed in')
      return
    }

    readyToSave.current = false
    setCloudStatus('Loading…')
    loadUserSite(user)
      .then((site) => {
        if (site) {
          setParams(site.params)
          setApplied(site.params)
          setTab(site.tab)
          setMapOpen(site.mapOpen)
          setSimOpen(site.simOpen)
          setSpeed(site.speed)
          setNote(site.note)
          setCloudStatus('Loaded from your login')
        } else {
          setCloudStatus('New account — saving this studio')
        }
        readyToSave.current = true
      })
      .catch(() => {
        setCloudStatus('Could not load (enable Firestore + test rules)')
        readyToSave.current = true
      })
  }, [user])

  const liveParams = useMemo(() => completeParams(params), [params])
  const liveApplied = useMemo(() => (applied ? completeParams(applied) : null), [applied])
  const onPlant = useCallback((spot: TreeSpot) => {
    setTrees((list) => [...list, spot])
  }, [])
  const onRemove = useCallback((id: string) => {
    setTrees((list) => list.filter((spot) => spot.id !== id))
  }, [])

  useEffect(() => {
    if (!user || !readyToSave.current) return
    const id = window.setTimeout(() => {
      setCloudStatus('Saving…')
      saveUserSite(user, {
        params: liveParams,
        tab,
        mapOpen,
        simOpen,
        speed,
        note,
      })
        .then(() => setCloudStatus('Saved to your login'))
        .catch(() => setCloudStatus('Could not save (enable Firestore + test rules)'))
    }, 800)
    return () => window.clearTimeout(id)
  }, [user, liveParams, tab, mapOpen, simOpen, speed, note])

  useEffect(() => {
    if (tab === 'voxel') {
      setInspectBeaver(null)
      return
    }
    const id = window.setInterval(() => {
      const colony = colonyRef.current
      if (selectedBeaverId) {
        const found = colony.beavers.find((b) => b.id === selectedBeaverId)
        setInspectBeaver(
          found
            ? { ...found, offspring: found.offspring ? [...found.offspring] : [] }
            : null,
        )
      } else {
        setInspectBeaver(null)
      }
      const cut = colony.forest ? forestStats(colony.forest) : { availableBranches: 0, treesCut: 0 }
      const eco = colony.forest && colony.succession
        ? successionStats(colony.forest, colony.succession)
        : { wetlandArea: 0, treesRemaining: 0, treesCut: 0, deadTrees: 0, floodedForestArea: 0 }
      const dam = colony.dam
      const people = colonyCensus(colony.beavers)
      const clock = ensureClock(colony.clock)
      colony.clock = clock
      const date = calendarOf(clock)
      const headline = colonyHeadline(colony)
      const finger = `${date.day}|${people.population}|${(dam?.completion ?? 0).toFixed(2)}|${(colony.hydro?.pondArea ?? 0).toFixed(2)}|${headline}|${clock.paused}|${clock.speed}|${date.dayOfYear}`
      if (finger === statsFinger.current) return
      statsFinger.current = finger
      setResourceStats({
        availableBranches: cut.availableBranches,
        woodCollected: colony.woodCollected ?? 0,
        treesCut: cut.treesCut,
        damLength: dam ? dam.length * 7.2 : 0,
        damHeight: dam ? dam.height : 0,
        damMaterial: dam ? dam.materialAmount : 0,
        constructionProgress: dam ? dam.completion : 0,
        waterLevel: colony.hydro?.upstreamLevel ?? 0.02,
        pondArea: colony.hydro?.pondArea ?? 0,
        floodedArea: colony.hydro?.floodedArea ?? 0,
        lodgeStage: colony.lodge ? lodgeStageLabel(colony.lodge.stage) : 'Small branch pile',
        lodgeMaterial: colony.lodge?.materialAmount ?? 0,
        lodgeSize: colony.lodge ? colony.lodge.size * 7.2 : 0,
        population: people.population,
        adults: people.adults,
        subadults: people.subadults,
        yearlings: people.yearlings,
        kits: people.kits,
        wetlandArea: eco.wetlandArea,
        treesRemaining: eco.treesRemaining,
        deadTrees: eco.deadTrees,
        floodedForestArea: eco.floodedForestArea,
        wetlandWildlife: colony.wildlife ? wildlifeStats(colony.wildlife).wetlandWildlife : 'Sparse',
        season: colony.season ? seasonLabel(colony.season.name) : 'Spring',
        clockYear: date.year,
        clockMonth: date.month,
        clockDay: date.day,
        clockPaused: clock.paused,
        clockSpeed: clock.speed,
        clockDayOfYear: date.dayOfYear,
        knobs: { ...ensureKnobs(colony.knobs) },
        headline,
      })
    }, 180)
    return () => window.clearInterval(id)
  }, [tab, selectedBeaverId])

  useEffect(() => {
    if (cover !== 'folding') return
    const id = window.setTimeout(() => setCover('out'), 1250)
    return () => window.clearTimeout(id)
  }, [cover])

  useEffect(() => {
    if (!running) return

    let raf = 0
    let last = performance.now()

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (tab !== 'colony') {
        const t = now * 0.001
        offsetRef.current.x += speed * dt * (0.04 + 0.028 * Math.sin(t * 0.41 + 1.2))
        offsetRef.current.y += speed * dt * (0.03 + 0.032 * Math.cos(t * 0.27))
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [running, speed, tab])

  return (
    <div className="app">
      {tab === 'voxel' ? (
        <VoxelScene
          params={liveParams}
          running={running}
          offsetRef={offsetRef}
          weather={weather}
          intensity={weatherRate}
          speed={speed}
          coverRef={coverRef}
        />
      ) : (
        <Scene
          params={liveParams}
          applied={liveApplied}
          running={running}
          showTerrain={applied !== null || hasSim}
          offsetRef={offsetRef}
          weather={weather}
          intensity={weatherRate}
          speed={speed}
          coverRef={coverRef}
          plantMode={tab === 'tree' && treeTool === 'place'}
          deleteMode={tab === 'tree' && treeTool === 'delete'}
          treeKind={treeKind}
          trees={trees}
          onPlant={onPlant}
          onRemove={onRemove}
          riparian
          wetlandLook={tab === 'colony'}
          colonyRef={colonyRef}
          selectedBeaverId={selectedBeaverId}
          onSelectBeaver={setSelectedBeaverId}
          followPos={followPos}
          followCamera={followCamera}
          showTerritory={showTerritory}
        />
      )}
      {cover !== 'out' ? (
        <Cover
          folding={cover === 'folding'}
          onStart={() => setCover('folding')}
          onFoldEnd={() => setCover('out')}
        />
      ) : null}
      {cover === 'out' ? (
        <>
          <header className={`ui-overlay ${tab === 'tree' ? 'has-tree-tools' : ''}`}>
            <div className="ui-overlay-row">
            <div>
              <p className="site-mark">Studio</p>
              <h1 className="site-title">BEAVER NOISE</h1>
            </div>
            <div className="toolbar">
              <button
                type="button"
                className={`toolbar-btn ${tab === 'model' ? 'is-active' : ''}`}
                onClick={() => setTab('model')}
              >
                Model
              </button>
              <button
                type="button"
                className={`toolbar-btn ${tab === 'voxel' ? 'is-active' : ''}`}
                onClick={() => setTab('voxel')}
              >
                Voxel
              </button>
              <button
                type="button"
                className={`toolbar-btn ${tab === 'tree' ? 'is-active' : ''}`}
                onClick={() => setTab('tree')}
              >
                Tree
              </button>
              <button
                type="button"
                className={`toolbar-btn ${tab === 'colony' ? 'is-active' : ''}`}
                onClick={() => setTab('colony')}
              >
                Colony
              </button>
              <button
                type="button"
                className="toolbar-btn"
                onClick={() => setColonyOpen((open) => !open)}
              >
                {colonyOpen ? 'Hide colony' : 'Show colony'}
              </button>
              <button
                type="button"
                className="toolbar-btn"
                onClick={() => setSimOpen((open) => !open)}
              >
                {simOpen ? 'Hide simulation' : 'Show simulation'}
              </button>
              <button
                type="button"
                className="toolbar-btn"
                onClick={() => setShowTerritory((open) => !open)}
              >
                {showTerritory ? 'Hide Territory' : 'Show Territory'}
              </button>
              <button
                type="button"
                className="toolbar-btn"
                onClick={() => setMapOpen((open) => !open)}
              >
                {mapOpen ? 'Hide 2D map' : 'Show 2D map'}
              </button>
              <button
                type="button"
                className="toolbar-btn"
                onClick={() => setAccountOpen((open) => !open)}
              >
                {accountOpen ? 'Hide sign in' : 'Sign in'}
              </button>
              <button
                type="button"
                className="toolbar-btn toolbar-btn-accent"
                onClick={() => setApplied({ ...liveParams })}
              >
                Apply height field to 3D plane
              </button>
            </div>
            </div>
            {tab === 'tree' ? (
              <div className="tree-toolbar">
                <div className="tree-toolbar-row">
                <button
                  type="button"
                  className={`toolbar-btn ${treeTool === 'place' ? 'is-active' : ''}`}
                  onClick={() => setTreeTool('place')}
                >
                  Place
                </button>
                <button
                  type="button"
                  className={`toolbar-btn ${treeTool === 'delete' ? 'is-active' : ''}`}
                  onClick={() => setTreeTool('delete')}
                >
                  Delete
                </button>
                <button
                  type="button"
                  className="toolbar-btn"
                  onClick={() => setTrees([])}
                >
                  Clear trees
                </button>
                <button
                  type="button"
                  className="toolbar-btn"
                  onClick={() =>
                    setTrees(
                      scatterTreesOnLand(
                        liveParams,
                        offsetRef.current,
                        coverRef.current,
                        treeKind,
                        trees,
                      ),
                    )
                  }
                >
                  Scatter on land
                </button>
                </div>
                <div className="tree-catalog">
                  {TREE_CATALOG.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`tree-card ${treeKind === item.id ? 'is-active' : ''}`}
                      onClick={() => {
                        setTreeKind(item.id)
                        setTreeTool('place')
                      }}
                    >
                      <span
                        className={`tree-card-swatch is-${item.shape}`}
                        style={{ background: item.swatch }}
                      />
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </header>
          {tab !== 'voxel' && colonyOpen ? (
            <ColonyStats
              year={resourceStats.clockYear}
              month={resourceStats.clockMonth}
              day={resourceStats.clockDay}
              dayOfYear={resourceStats.clockDayOfYear}
              paused={resourceStats.clockPaused}
              simSpeed={resourceStats.clockSpeed}
              onClose={() => setColonyOpen(false)}
              knobs={resourceStats.knobs}
              onKnobs={(patch) => {
                const colony = colonyRef.current
                colony.knobs = { ...ensureKnobs(colony.knobs), ...patch }
                setResourceStats((stats) => ({ ...stats, knobs: { ...colony.knobs } }))
              }}
              onDayOfYear={(dayOfYear) => {
                const colony = colonyRef.current
                const clock = ensureClock(colony.clock)
                const date = calendarOf(clock)
                clock.days = (date.year - 1) * DAYS_PER_YEAR + Math.min(365, Math.max(1, dayOfYear))
                colony.clock = clock
                if (!colony.season) return
                stepSeasonFromDays(colony.season, clock.days)
                applySeasonKnobs(colony.season, ensureKnobs(colony.knobs))
                const next = calendarOf(clock)
                setResourceStats((stats) => ({
                  ...stats,
                  clockYear: next.year,
                  clockMonth: next.month,
                  clockDay: next.day,
                  clockDayOfYear: next.dayOfYear,
                  season: seasonLabel(colony.season.name),
                }))
              }}
              onPause={() => {
                const clock = ensureClock(colonyRef.current.clock)
                colonyRef.current.clock = clock
                pauseSim(clock)
                const date = calendarOf(clock)
                setResourceStats((stats) => ({
                  ...stats,
                  clockPaused: true,
                  clockYear: date.year,
                  clockMonth: date.month,
                  clockDay: date.day,
                }))
              }}
              onSpeed={(speed) => {
                const clock = ensureClock(colonyRef.current.clock)
                colonyRef.current.clock = clock
                setSimSpeed(clock, speed)
                setResourceStats((stats) => ({
                  ...stats,
                  clockPaused: false,
                  clockSpeed: speed,
                }))
              }}
              onRestart={() => {
                statsFinger.current = ''
                setSelectedBeaverId(null)
                setFollowCamera(false)
                setInspectBeaver(null)
                const next = createFoundingColony()
                colonyRef.current = next
                const clock = ensureClock(next.clock)
                const date = calendarOf(clock)
                setResourceStats((stats) => ({
                  ...stats,
                  population: 2,
                  adults: 2,
                  subadults: 0,
                  yearlings: 0,
                  kits: 0,
                  damLength: 0,
                  damHeight: 0,
                  damMaterial: 0,
                  constructionProgress: 0,
                  waterLevel: 0.02,
                  pondArea: 0,
                  floodedArea: 0,
                  lodgeStage: 'Small branch pile',
                  lodgeMaterial: 0,
                  lodgeSize: 0,
                  woodCollected: 0,
                  clockYear: date.year,
                  clockMonth: date.month,
                  clockDay: date.day,
                  clockDayOfYear: date.dayOfYear,
                  clockPaused: false,
                  clockSpeed: clock.speed,
                  season: 'Autumn',
                  headline: colonyHeadline(next),
                  knobs: emptyKnobs(),
                }))
              }}
              headline={resourceStats.headline}
              availableBranches={resourceStats.availableBranches}
              woodCollected={resourceStats.woodCollected}
              treesCut={resourceStats.treesCut}
              damLength={resourceStats.damLength}
              damHeight={resourceStats.damHeight}
              damMaterial={resourceStats.damMaterial}
              constructionProgress={resourceStats.constructionProgress}
              waterLevel={resourceStats.waterLevel}
              pondArea={resourceStats.pondArea}
              floodedArea={resourceStats.floodedArea}
              lodgeStage={resourceStats.lodgeStage}
              lodgeMaterial={resourceStats.lodgeMaterial}
              lodgeSize={resourceStats.lodgeSize}
              population={resourceStats.population}
              adults={resourceStats.adults}
              subadults={resourceStats.subadults}
              yearlings={resourceStats.yearlings}
              kits={resourceStats.kits}
              wetlandArea={resourceStats.wetlandArea}
              treesRemaining={resourceStats.treesRemaining}
              deadTrees={resourceStats.deadTrees}
              floodedForestArea={resourceStats.floodedForestArea}
              wetlandWildlife={resourceStats.wetlandWildlife}
              season={resourceStats.season}
            />
          ) : null}
          {tab !== 'voxel' && inspectBeaver ? (
            <BeaverInspect
              beaver={inspectBeaver}
              following={followCamera}
              onFollow={() => setFollowCamera((on) => !on)}
              onClose={() => {
                setSelectedBeaverId(null)
                setFollowCamera(false)
              }}
            />
          ) : null}
          {accountOpen ? (
            <AccountBar
              cloudStatus={cloudStatus}
              note={note}
              onNote={setNote}
              onClose={() => setAccountOpen(false)}
            />
          ) : null}
          {simOpen ? (
            <div className="maps-slot maps-slot-left">
              <SimulationMap
                params={liveParams}
                running={running}
                speed={speed}
                offsetRef={offsetRef}
                coverRef={coverRef}
                weather={weather}
                onStart={() => {
                  setHasSim(true)
                  setRunning(true)
                }}
                onStop={() => setRunning(false)}
                onSpeed={setSpeed}
                onClose={() => {
                  setRunning(false)
                  setSimOpen(false)
                }}
                onReset={() => {
                  offsetRef.current = { x: 0, y: 0 }
                  clearWeatherCover(coverRef.current)
                  setRunning(false)
                  setHasSim(false)
                  colonyRef.current = createFoundingColony()
                  statsFinger.current = ''
                  setSelectedBeaverId(null)
                  setFollowCamera(false)
                  setInspectBeaver(null)
                }}
              />
            </div>
          ) : null}
          {mapOpen ? (
            <div className="maps-slot maps-slot-right">
              <NoiseView
                params={liveParams}
                applied={applied !== null}
                weather={weather}
                intensity={weatherRate}
                onWeather={setWeather}
                onIntensity={setWeatherRate}
                onChange={setParams}
                onClose={() => setMapOpen(false)}
                onApply={() => setApplied({ ...liveParams })}
              />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

export default App
