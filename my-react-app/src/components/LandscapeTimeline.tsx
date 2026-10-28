import {
  AXIS_SPAN,
  EVENT_KINDS,
  EVENT_LABELS,
  YEAR_AXIS,
  type EcoEvent,
  type LandscapeCard,
} from '../simulation/Timeline'

function fmt(value: number, digits = 1) {
  const n = Number.isFinite(value) ? value : 0
  return n.toFixed(digits)
}

function cardLine(card: LandscapeCard) {
  return `pond ${fmt(card.pondArea)} · wetland ${fmt(card.wetlandArea)} · ${card.population} beavers · ${card.treesCut} trees cut`
}

export function LandscapeTimeline({
  ageYears,
  liveAgeYears,
  viewing,
  viewingLabel,
  events,
  yearReady,
  liveCard,
  viewCard,
  onScrub,
  onEvent,
  onYear,
  onLive,
}: {
  ageYears: number
  liveAgeYears: number
  viewing: boolean
  viewingLabel: string
  events: EcoEvent[]
  yearReady: number[]
  liveCard: LandscapeCard
  viewCard: LandscapeCard | null
  onScrub: (ageYears: number) => void
  onEvent: (snapshotId: string) => void
  onYear: (year: number) => void
  onLive: () => void
}) {
  const playhead = Math.min(AXIS_SPAN, Math.max(0, ageYears))
  const liveCap = Math.min(AXIS_SPAN, Math.max(0, liveAgeYears))
  return (
    <section className="landscape-timeline" aria-label="Landscape history">
      <div className="timeline-head">
        <div>
          <p className="timeline-kicker">Landscape history</p>
          <p className="timeline-status">
            {viewing
              ? `Viewing ${viewingLabel} (year ${fmt(ageYears)})`
              : `Colony year ${fmt(ageYears)}`}
          </p>
        </div>
        {viewing ? (
          <button type="button" className="timeline-live" onClick={onLive}>
            Return to live
          </button>
        ) : (
          <p className="timeline-hint">Drag to compare earlier and later landscape states</p>
        )}
      </div>
      <div className="timeline-compare">
        <p>
          <span>Live</span> year {fmt(liveAgeYears)} · {cardLine(liveCard)}
        </p>
        {viewing && viewCard ? (
          <p>
            <span>Earlier</span> year {fmt(viewCard.ageYears)} · {cardLine(viewCard)}
          </p>
        ) : null}
      </div>
      <div className="timeline-event-list">
        {EVENT_KINDS.map((kind) => {
          const hit = events.find((event) => event.kind === kind)
          return (
            <button
              key={kind}
              type="button"
              className={hit ? '' : 'is-wait'}
              disabled={!hit}
              title={hit ? `Year ${fmt(hit.ageYears)}` : 'Not yet'}
              onClick={() => {
                if (hit) onEvent(hit.snapshotId)
              }}
            >
              {EVENT_LABELS[kind]}
            </button>
          )
        })}
      </div>
      <div className="timeline-track-wrap">
        <div className="timeline-events">
          {events.map((event) => {
            const left = Math.min(100, (event.ageYears / AXIS_SPAN) * 100)
            return (
              <button
                key={event.kind}
                type="button"
                className="timeline-event"
                style={{ left: `${left}%` }}
                title={`${event.label} · year ${fmt(event.ageYears)}`}
                onClick={() => onEvent(event.snapshotId)}
              />
            )
          })}
        </div>
        <label className="timeline-scrub">
          <span className="sr-only">Scrub colony years</span>
          <input
            type="range"
            min={0}
            max={AXIS_SPAN}
            step={0.05}
            value={playhead}
            onChange={(event) => onScrub(Number(event.target.value))}
          />
        </label>
        <div className="timeline-years">
          {YEAR_AXIS.map((year) => {
            const ready = yearReady.includes(year) || year === 0 || year <= liveCap
            return (
              <button
                key={year}
                type="button"
                className={`timeline-year ${year <= playhead + 0.04 ? 'is-reached' : ''} ${ready ? '' : 'is-wait'}`}
                style={{ left: `${(year / AXIS_SPAN) * 100}%` }}
                disabled={!ready}
                onClick={() => onYear(year)}
              >
                {year}
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}
