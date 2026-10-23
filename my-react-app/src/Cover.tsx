type CoverProps = {
  folding: boolean
  onStart: () => void
  onFoldEnd: () => void
}

export function Cover({ folding, onStart, onFoldEnd }: CoverProps) {
  return (
    <div
      className={`cover ${folding ? 'is-folding' : ''}`}
      role="dialog"
      aria-label="BEAVER NOISE cover"
    >
      <div className="cover-fold" aria-hidden="true">
        <div className="cover-panel cover-panel-tl" />
        <div className="cover-panel cover-panel-tr" />
        <div className="cover-panel cover-panel-bl" />
        <div className="cover-panel cover-panel-br" onAnimationEnd={(event) => {
          if (event.animationName === 'fold-br') onFoldEnd()
        }} />
      </div>

      <div className="cover-content">
        <p className="site-mark">Studio</p>
        <h1 className="cover-title">BEAVER NOISE</h1>
        <button type="button" className="cover-start" onClick={onStart} disabled={folding}>
          Start
        </button>
      </div>
    </div>
  )
}
