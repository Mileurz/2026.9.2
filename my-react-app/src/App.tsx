import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import { onAuthStateChanged } from 'firebase/auth'
import { Vector3 } from 'three'
import { AccountBar } from './AccountBar'
import { BeaverInspect } from './components/BeaverInspect'
import { CameraModes } from './components/CameraModes'
import type { CameraMode } from './components/CameraRig'
import { ColonyStats, type OverlayToggles } from './components/ColonyStats'
import { LandscapeTimeline } from './components/LandscapeTimeline'
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
import {
  landscapeCard,
  liveAgeYears,
  restoreSnapshot,
  returnToLive,
  scrubToAge,
  viewingSnapshot,
  type EcoEvent,
  type LandscapeCard,
} from './simulation/Timeline'
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
  const [mapOpen, setMapOpen] = useState(false)
  const [simOpen, setSimOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
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
  const inspectFinger = useRef('')
  const followPos = useRef(new Vector3())
  const [selectedBeaverId, setSelectedBeaverId] = useState<string | null>(null)
  const [inspectBeaver, setInspectBeaver] = useState<BeaverAgent | null>(null)
  const [followCamera, setFollowCamera] = useState(false)
  const [cameraMode, setCameraMode] = useState<CameraMode>('free')
  const [compareSide, setCompareSide] = useState<'before' | 'after'>('before')
  const [layers, setLayers] = useState<OverlayToggles>({
    territory: false,
    treeTargets: false,
    resourceNodes: false,
    waterChange: false,
    ecologicalZones: false,
  })
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
  const [timelineView, setTimelineView] = useState({
    ageYears: 0,
    liveAgeYears: 0,
    viewing: false,
    viewingLabel: '',
    events: [
      {
        kind: 'founding',
        label: 'Founding Pair Arrives',
        ageYears: 0,
        snapshotId: 'e:founding',
      },
    ] as EcoEvent[],
    yearReady: [0],
    liveCard: {
      ageYears: 0,
      pondArea: 0,
      wetlandArea: 0,
      treesCut: 0,
      population: 2,
      damCompletion: 0,
    } as LandscapeCard,
    viewCard: null as LandscapeCard | null,
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
        const next = found
          ? `${found.id}|${found.currentTask}|${found.u.toFixed(3)}|${found.v.toFixed(3)}|${found.lifeStage}|${found.energy.toFixed(2)}|${found.carrying}|${found.age.toFixed(2)}`
          : 'none'
        if (next !== inspectFinger.current) {
          inspectFinger.current = next
          setInspectBeaver(
            found
              ? { ...found, offspring: found.offspring ? [...found.offspring] : [] }
              : null,
          )
        }
      } else if (inspectFinger.current) {
        inspectFinger.current = ''
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
      const hist = colony.history
      const view = viewingSnapshot(colony)
      const liveYears = liveAgeYears(colony)
      const ageYears = view ? view.ageYears : liveYears
      const liveCard = hist?.live ? landscapeCard(hist.live) : landscapeCard(colony)
      const finite = (n: number) => (Number.isFinite(n) ? n : 0)
      const num = (n: number, d = 2) => finite(n).toFixed(d)
      const finger = `${date.day}|${people.population}|${num(dam?.completion ?? 0)}|${num(colony.hydro?.pondArea ?? 0)}|${headline}|${clock.paused}|${clock.speed}|${date.dayOfYear}|${hist?.viewingId ?? 'live'}|${hist?.events.length ?? 0}|${hist?.snapshots.length ?? 0}|${num(ageYears)}`
      if (finger === statsFinger.current) return
      statsFinger.current = finger
      setResourceStats({
        availableBranches: finite(cut.availableBranches),
        woodCollected: finite(colony.woodCollected ?? 0),
        treesCut: finite(cut.treesCut),
        damLength: finite(dam ? dam.length * 7.2 : 0),
        damHeight: finite(dam ? dam.height : 0),
        damMaterial: finite(dam ? dam.materialAmount : 0),
        constructionProgress: finite(dam ? dam.completion : 0),
        waterLevel: finite(colony.hydro?.upstreamLevel ?? 0.02),
        pondArea: finite(colony.hydro?.pondArea ?? 0),
        floodedArea: finite(colony.hydro?.floodedArea ?? 0),
        lodgeStage: colony.lodge ? lodgeStageLabel(colony.lodge.stage) : 'Small branch pile',
        lodgeMaterial: finite(colony.lodge?.materialAmount ?? 0),
        lodgeSize: finite(colony.lodge ? colony.lodge.size * 7.2 : 0),
        population: people.population,
        adults: people.adults,
        subadults: people.subadults,
        yearlings: people.yearlings,
        kits: people.kits,
        wetlandArea: finite(eco.wetlandArea),
        treesRemaining: finite(eco.treesRemaining),
        deadTrees: finite(eco.deadTrees),
        floodedForestArea: finite(eco.floodedForestArea),
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
      setTimelineView({
        ageYears,
        liveAgeYears: liveYears,
        viewing: Boolean(view),
        viewingLabel: view?.label ?? '',
        events: hist?.events ?? [],
        yearReady: hist?.yearMarksTaken ?? [0],
        liveCard,
        viewCard: view?.card ?? null,
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

  function pullTimeline() {
    const colony = colonyRef.current
    const hist = colony.history
    const view = viewingSnapshot(colony)
    const liveYears = liveAgeYears(colony)
    setTimelineView({
      ageYears: view ? view.ageYears : liveYears,
      liveAgeYears: liveYears,
      viewing: Boolean(view),
      viewingLabel: view?.label ?? '',
      events: hist?.events ?? [],
      yearReady: hist?.yearMarksTaken ?? [0],
      liveCard: hist?.live ? landscapeCard(hist.live) : landscapeCard(colony),
      viewCard: view?.card ?? null,
    })
  }

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
          cameraMode={cameraMode}
          showTerritory={layers.territory}
          showTreeTargets={layers.treeTargets}
          showResourceNodes={layers.resourceNodes}
          showWaterChange={layers.waterChange}
          showEcologicalZones={layers.ecologicalZones}
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
          <header className={`ui-overlay has-camera-bar ${tab === 'tree' ? 'has-tree-tools' : ''}`}>
            <div className="ui-overlay-row">
            <div>
              <p className="site-mark">Riparian wetland study</p>
              <h1 className="site-title">BEAVER NOISE</h1>
            </div>
            <div className="toolbar-stack">
            <div className="toolbar">
              <div className="toolbar-row">
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
              </div>
              <div className="toolbar-row">
                <button
                  type="button"
                  className={`toolbar-btn ${colonyOpen ? 'is-active' : ''}`}
                  onClick={() => setColonyOpen((open) => !open)}
                >
                  Record
                </button>
                <button
                  type="button"
                  className={`toolbar-btn ${simOpen ? 'is-active' : ''}`}
                  onClick={() => setSimOpen((open) => !open)}
                >
                  Simulation map
                </button>
                <button
                  type="button"
                  className={`toolbar-btn ${mapOpen ? 'is-active' : ''}`}
                  onClick={() => setMapOpen((open) => !open)}
                >
                  Height field
                </button>
                <button
                  type="button"
                  className={`toolbar-btn ${accountOpen ? 'is-active' : ''}`}
                  onClick={() => setAccountOpen((open) => !open)}
                >
                  Sign in
                </button>
              </div>
            </div>
            {tab !== 'voxel' ? (
              <CameraModes
                mode={cameraMode}
                compareSide={compareSide}
                onMode={(next) => {
                  if (cameraMode === 'compare' && next !== 'compare') {
                    returnToLive(colonyRef.current)
                    statsFinger.current = ''
                    pullTimeline()
                  }
                  if (next === 'follow') {
                    const id = selectedBeaverId ?? colonyRef.current.beavers[0]?.id ?? null
                    if (id) setSelectedBeaverId(id)
                    setFollowCamera(true)
                  } else {
                    setFollowCamera(false)
                  }
                  if (next === 'compare') {
                    setCompareSide('before')
                    const founding = colonyRef.current.history?.snapshots.find(
                      (s) => s.event === 'founding' || s.id === 'e:founding',
                    )
                    if (founding) restoreSnapshot(colonyRef.current, founding.id)
                    statsFinger.current = ''
                    pullTimeline()
                  }
                  setCameraMode(next)
                }}
                onCompareSide={(side) => {
                  setCompareSide(side)
                  if (side === 'before') {
                    const founding = colonyRef.current.history?.snapshots.find(
                      (s) => s.event === 'founding' || s.id === 'e:founding',
                    )
                    if (founding) restoreSnapshot(colonyRef.current, founding.id)
                  } else {
                    returnToLive(colonyRef.current)
                  }
                  statsFinger.current = ''
                  pullTimeline()
                }}
              />
            ) : null}
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
                if (colonyRef.current.history?.viewingId) returnToLive(colonyRef.current)
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
                setCameraMode('free')
                setCompareSide('before')
                setInspectBeaver(null)
                const next = createFoundingColony()
                colonyRef.current = next
                setTimelineView({
                  ageYears: 0,
                  liveAgeYears: 0,
                  viewing: false,
                  viewingLabel: '',
                  events: next.history?.events ?? [],
                  yearReady: next.history?.yearMarksTaken ?? [0],
                  liveCard: landscapeCard(next),
                  viewCard: null,
                })
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
              layers={layers}
              onLayer={(key) => setLayers((prev) => ({ ...prev, [key]: !prev[key] }))}
            />
          ) : null}
          {tab !== 'voxel' && inspectBeaver ? (
            <BeaverInspect
              beaver={inspectBeaver}
              following={cameraMode === 'follow'}
              onFollow={() => {
                if (cameraMode === 'follow') {
                  setFollowCamera(false)
                  setCameraMode('free')
                  return
                }
                setFollowCamera(true)
                setCameraMode('follow')
              }}
              onClose={() => {
                setSelectedBeaverId(null)
                setFollowCamera(false)
              }}
            />
          ) : null}
          {tab !== 'voxel' ? (
            <LandscapeTimeline
              ageYears={timelineView.ageYears}
              liveAgeYears={timelineView.liveAgeYears}
              viewing={timelineView.viewing}
              viewingLabel={timelineView.viewingLabel}
              events={timelineView.events}
              yearReady={timelineView.yearReady}
              liveCard={timelineView.liveCard}
              viewCard={timelineView.viewCard}
              onScrub={(age) => {
                scrubToAge(colonyRef.current, age)
                statsFinger.current = ''
                pullTimeline()
              }}
              onEvent={(id) => {
                restoreSnapshot(colonyRef.current, id)
                statsFinger.current = ''
                pullTimeline()
              }}
              onYear={(year) => {
                if (year >= liveAgeYears(colonyRef.current) - 0.05) returnToLive(colonyRef.current)
                else {
                  const mark = colonyRef.current.history?.snapshots.find((s) => s.yearMark === year)
                  if (mark) restoreSnapshot(colonyRef.current, mark.id)
                  else scrubToAge(colonyRef.current, year)
                }
                statsFinger.current = ''
                pullTimeline()
              }}
              onLive={() => {
                returnToLive(colonyRef.current)
                statsFinger.current = ''
                pullTimeline()
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
                  setCameraMode('free')
                  setCompareSide('before')
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
