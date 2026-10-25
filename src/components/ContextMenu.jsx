import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';

const MARGIN = 8;

/**
 * A right-click menu.
 *
 * It renders into `document.body` on a fixed layer, so it is never clipped by the
 * canvas, the ribbon or the inspector; it flips up/left when it would leave the
 * viewport, and it closes on an outside click, Escape, scroll or resize.
 *
 * `items` is plain data:
 *   { id, label, icon, shortcut, disabled, danger, separator, onSelect }
 * A `separator: true` entry draws a divider.
 */
export default function ContextMenu({ x, y, items = [], onClose, label = 'Context menu' }) {
  const layerRef = useRef(null);
  const [placement, setPlacement] = useState(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    // Focus the menu so the arrow keys and Enter drive it straight away.
    layer.focus?.();
    const width = layer.offsetWidth;
    const height = layer.offsetHeight;
    const left = Math.max(MARGIN, Math.min(x, window.innerWidth - width - MARGIN));
    const top = Math.max(MARGIN, Math.min(y, window.innerHeight - height - MARGIN));
    setPlacement({ left, top });
  }, [x, y, items.length]);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (layerRef.current?.contains(event.target)) return;
      onClose?.();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('wheel', onClose, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('wheel', onClose);
    };
  }, [onClose]);

  const selectable = items.map((item, index) => (item.separator || item.disabled ? -1 : index)).filter((index) => index >= 0);

  const move = (delta) => {
    if (!selectable.length) return;
    const current = selectable.indexOf(activeIndex);
    const next = current < 0 ? (delta > 0 ? 0 : selectable.length - 1) : (current + delta + selectable.length) % selectable.length;
    setActiveIndex(selectable[next]);
  };

  const run = (item) => {
    if (!item || item.separator || item.disabled) return;
    onClose?.();
    item.onSelect?.();
  };

  return createPortal(
    <div
      ref={layerRef}
      className="context-menu"
      role="menu"
      tabIndex={-1}
      aria-label={label}
      style={{
        left: `${placement?.left ?? x}px`,
        top: `${placement?.top ?? y}px`,
        visibility: placement ? 'visible' : 'hidden',
      }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          move(1);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          move(-1);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          run(items[activeIndex]);
        }
      }}
    >
      {items.map((item, index) =>
        item.separator ? (
          <span key={`sep-${index}`} className="context-sep" />
        ) : (
          <button
            key={item.id || `${item.label}-${index}`}
            type="button"
            role="menuitem"
            className={`context-item${item.danger ? ' danger' : ''}${activeIndex === index ? ' active' : ''}`}
            disabled={Boolean(item.disabled)}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => run(item)}
          >
            {item.icon ? <Icon name={item.icon} size={16} /> : <span className="context-icon-gap" />}
            <span className="context-label">{item.label}</span>
            {item.shortcut && <span className="context-shortcut">{item.shortcut}</span>}
          </button>
        )
      )}
    </div>,
    document.body
  );
}
