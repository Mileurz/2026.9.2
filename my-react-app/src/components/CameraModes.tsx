import type { CameraMode } from './CameraRig'

const MODES: { id: CameraMode; label: string }[] = [
  { id: 'free', label: 'Free' },
  { id: 'follow', label: 'Follow' },
  { id: 'colony', label: 'Colony' },
  { id: 'dam', label: 'Dam' },
  { id: 'ecology', label: 'Ecology' },
  { id: 'compare', label: 'Before / After' },
]

export function CameraModes({
  mode,
  compareSide,
  onMode,
  onCompareSide,
}: {
  mode: CameraMode
  compareSide: 'before' | 'after'
  onMode: (mode: CameraMode) => void
  onCompareSide: (side: 'before' | 'after') => void
}) {
  return (
    <div className="camera-bar" role="group" aria-label="Camera">
      {MODES.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`toolbar-btn ${mode === item.id ? 'is-active' : ''}`}
          onClick={() => onMode(item.id)}
        >
          {item.label}
        </button>
      ))}
      {mode === 'compare' ? (
        <>
          <button
            type="button"
            className={`toolbar-btn ${compareSide === 'before' ? 'is-active' : ''}`}
            onClick={() => onCompareSide('before')}
          >
            Before
          </button>
          <button
            type="button"
            className={`toolbar-btn ${compareSide === 'after' ? 'is-active' : ''}`}
            onClick={() => onCompareSide('after')}
          >
            After
          </button>
        </>
      ) : null}
    </div>
  )
}
