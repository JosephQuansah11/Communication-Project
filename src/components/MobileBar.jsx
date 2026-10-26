import Icon from './Icon.jsx';

/**
 * The phone's bottom bar.
 *
 * A phone has no room for a slide rail and an inspector beside the canvas, so both
 * become sheets that slide in over it — these buttons open and close them, and keep
 * undo and present within thumb reach. It is hidden on wide screens by CSS, so the
 * same tree serves both.
 */
export default function MobileBar({
  railOpen,
  inspectorOpen,
  onToggleRail,
  onToggleInspector,
  onUndo,
  canUndo,
  onPresent,
}) {
  return (
    <nav className="mobile-bar" aria-label="Editor">
      <button
        type="button"
        className={`mobile-bar-btn${railOpen ? ' on' : ''}`}
        aria-pressed={railOpen}
        onClick={onToggleRail}
      >
        <Icon name="layers" size={20} />
        <span>Slides</span>
      </button>
      <button
        type="button"
        className={`mobile-bar-btn${inspectorOpen ? ' on' : ''}`}
        aria-pressed={inspectorOpen}
        onClick={onToggleInspector}
      >
        <Icon name="settings" size={20} />
        <span>Tools</span>
      </button>
      <button type="button" className="mobile-bar-btn" disabled={!canUndo} onClick={onUndo}>
        <Icon name="undo" size={20} />
        <span>Undo</span>
      </button>
      <button type="button" className="mobile-bar-btn primary" onClick={onPresent}>
        <Icon name="presentation" size={20} />
        <span>Present</span>
      </button>
    </nav>
  );
}
