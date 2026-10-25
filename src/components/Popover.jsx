import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const GAP = 6;
const MARGIN = 10;

/**
 * A floating layer anchored to a trigger.
 *
 * Ribbon menus must be able to escape their container: the ribbon body scrolls
 * horizontally, so an absolutely positioned dropdown would be clipped. The
 * popover therefore renders into `document.body` on a fixed layer, positions
 * itself under the trigger, flips above it when there is no room below, and
 * clamps to the viewport. It closes on an outside click, Escape, resize or
 * scroll.
 */
export default function Popover({ anchorRef, open, onClose, align = 'start', className = '', children }) {
  const layerRef = useRef(null);
  const [position, setPosition] = useState(null);

  const place = useCallback(() => {
    const anchor = anchorRef?.current;
    const layer = layerRef.current;
    if (!anchor || !layer) return;
    const rect = anchor.getBoundingClientRect();
    const width = layer.offsetWidth;
    const height = layer.offsetHeight;

    let top = rect.bottom + GAP;
    if (top + height > window.innerHeight - MARGIN && rect.top - GAP - height > MARGIN) {
      top = rect.top - GAP - height;
    }
    let left = align === 'end' ? rect.right - width : rect.left;
    left = Math.min(Math.max(MARGIN, left), Math.max(MARGIN, window.innerWidth - width - MARGIN));

    setPosition({ top: Math.max(MARGIN, top), left });
  }, [anchorRef, align]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    place();
    // A second pass after paint keeps the layer inside the viewport even when the
    // content grew while measuring (images, wrapped captions…).
    const frame = requestAnimationFrame(place);
    return () => cancelAnimationFrame(frame);
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (layerRef.current?.contains(event.target)) return;
      if (anchorRef?.current?.contains(event.target)) return;
      onClose?.();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, onClose, place, anchorRef]);

  if (!open) return null;

  return createPortal(
    <div
      ref={layerRef}
      className={`popover-layer ${className}`.trim()}
      style={position ? { top: `${position.top}px`, left: `${position.left}px` } : { top: 0, left: 0, visibility: 'hidden' }}
    >
      {children}
    </div>,
    document.body
  );
}
