import {
  ageLabel,
  kinLabel,
  lifeStageLabel,
  offspringLabel,
  sexLabel,
  statusLabel,
  taskLabel,
  type BeaverAgent,
} from '../simulation/Beaver'

export function BeaverInspect({
  beaver,
  following,
  onFollow,
  onClose,
}: {
  beaver: BeaverAgent
  following: boolean
  onFollow: () => void
  onClose: () => void
}) {
  return (
    <section className="inspect-window" aria-label="Beaver record">
      <header className="noise-window-bar">
        <p className="noise-window-title">Beaver</p>
        <button type="button" className="window-icon-btn" onClick={onFollow}>
          {following ? 'Stop follow' : 'Follow'}
        </button>
        <button type="button" className="window-icon-btn" onClick={onClose}>
          Close
        </button>
      </header>
      <dl className="inspect-list">
        <div>
          <dt>Beaver ID</dt>
          <dd>{beaver.id}</dd>
        </div>
        <div>
          <dt>Sex</dt>
          <dd>{sexLabel(beaver.sex)}</dd>
        </div>
        <div>
          <dt>Age</dt>
          <dd>{ageLabel(beaver.age)}</dd>
        </div>
        <div>
          <dt>Life Stage</dt>
          <dd>{lifeStageLabel(beaver.lifeStage)}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{statusLabel(beaver.status)}</dd>
        </div>
        <div>
          <dt>Mother</dt>
          <dd>{kinLabel(beaver.mother)}</dd>
        </div>
        <div>
          <dt>Father</dt>
          <dd>{kinLabel(beaver.father)}</dd>
        </div>
        <div>
          <dt>Partner</dt>
          <dd>{kinLabel(beaver.partner)}</dd>
        </div>
        <div>
          <dt>Offspring</dt>
          <dd>{offspringLabel(beaver.offspring)}</dd>
        </div>
        <div>
          <dt>Energy</dt>
          <dd>{Math.round(beaver.energy * 100)}%</dd>
        </div>
        <div>
          <dt>Current Activity</dt>
          <dd>{taskLabel(beaver.currentTask)}</dd>
        </div>
        <div>
          <dt>Home Lodge</dt>
          <dd>{beaver.homeLodge || '—'}</dd>
        </div>
      </dl>
    </section>
  )
}
