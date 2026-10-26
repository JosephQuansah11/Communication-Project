import { useRef } from 'react';
import { PANEL_LIMITS, clampPanelWidth } from '../lib/panels.js';

/**
 * The grab strip on the inner edge of a side panel: drag it to make the panel wider
 * or narrower.
 *
 * It is a real separator as far as a screen reader is concerned, and it answers the
 * keyboard too — arrow keys move it, Shift moves it further, Home and End jump to the
 * limits — so the layout is adjustable without a mouse. The drag follows the pointer
 * with the panel's own edge as the anchor, and the new width is only committed (and
 * remembered) when the drag ends.
 */
export default function PanelResizer({ side, width, onChange, onCommit, onReset, label }) {
  const startRef = useRef(null);
  const limits = PANEL_LIMITS[side] || PANEL_LIMITS.tools;

  const step = (event, amount) => {
    event.preventDefault();
    onChange(clampPanelWidth(side, width + amount));
    onCommit?.();
  };

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    startRef.current = { x: event.clientX, width };
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      /* A synthetic pointer has nothing to capture; the drag still works. */
    }
  };

  const onPointerMove = (event) => {
    const start = startRef.current;
    if (!start) return;
    // The tools column grows towards the left, the slide rail towards the right.
    const delta = side === 'rail' ? event.clientX - start.x : start.x - event.clientX;
    onChange(clampPanelWidth(side, start.width + delta));
  };

  const onPointerUp = (event) => {
    if (!startRef.current) return;
    startRef.current = null;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      /* Never captured: nothing to release. */
    }
    onCommit?.();
  };

  return (
    <div
      className={`panel-resizer ${side}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label || 'Resize panel'}
      aria-valuenow={width}
      aria-valuemin={limits.min}
      aria-valuemax={limits.max}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onDoubleClick={() => onReset?.()}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={(event) => {
        const big = event.shiftKey ? 48 : 16;
        if (event.key === 'ArrowLeft') return step(event, side === 'rail' ? -big : big);
        if (event.key === 'ArrowRight') return step(event, side === 'rail' ? big : -big);
        if (event.key === 'Home') return step(event, limits.min - width);
        if (event.key === 'End') return step(event, limits.max - width);
        return undefined;
      }}
    />
  );
}
