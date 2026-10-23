import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import ElementView from './ElementView.jsx';
import Icon from './Icon.jsx';

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export default function EditorCanvas({
  deck,
  slide,
  selectedId,
  zoom,
  onZoom,
  onSelect,
  onPreviewElement,
  onCommitElement,
  onBegin,
  onEnd,
  onOpenTable,
  onExpand,
  onDropFile,
  editingTextId,
  onStartTextEdit,
  onEndTextEdit,
}) {
  const wrapRef = useRef(null);
  const [fit, setFit] = useState(0.5);
  const dragRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  useLayoutEffect(() => {
    const node = wrapRef.current;
    if (!node) return undefined;
    const update = () => {
      const width = node.clientWidth - 96;
      const height = node.clientHeight - 72;
      setFit(Math.max(0.1, Math.min(width / deck.width, height / deck.height)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [deck.width, deck.height]);

  const scale = Math.max(0.08, fit * zoom);
  const selection = slide.elements?.find((element) => element.id === selectedId);

  useEffect(() => {
    const stop = () => {
      if (dragRef.current) {
        dragRef.current = null;
        setDragging(false);
        onEnd();
      }
    };
    window.addEventListener('pointerup', stop);
    return () => window.removeEventListener('pointerup', stop);
  }, [onEnd]);

  const startMove = (event, element) => {
    if (event.button !== 0) return;
    if (event.target.closest('.resize-handle') || event.target.closest('.rotate-handle')) return;
    onSelect(element.id);
    if (editingTextId === element.id) return;
    event.stopPropagation();
    onBegin();
    dragRef.current = {
      mode: 'move',
      startX: event.clientX,
      startY: event.clientY,
      element: { x: element.x, y: element.y, w: element.w, h: element.h, rotation: element.rotation || 0 },
    };
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const startResize = (event, element, dir) => {
    event.stopPropagation();
    event.preventDefault();
    onSelect(element.id);
    onBegin();
    dragRef.current = {
      mode: 'resize',
      dir,
      startX: event.clientX,
      startY: event.clientY,
      element: { x: element.x, y: element.y, w: element.w, h: element.h, rotation: element.rotation || 0 },
    };
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const startRotate = (event, element, wrapper) => {
    event.stopPropagation();
    event.preventDefault();
    onSelect(element.id);
    onBegin();
    const rect = wrapper.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    dragRef.current = {
      mode: 'rotate',
      centerX,
      centerY,
      startAngle: (Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180) / Math.PI,
      element: { rotation: element.rotation || 0 },
    };
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    event.preventDefault();
    if (drag.mode === 'rotate') {
      const angle = (Math.atan2(event.clientY - drag.centerY, event.clientX - drag.centerX) * 180) / Math.PI;
      let rotation = drag.element.rotation + (angle - drag.startAngle);
      if (event.shiftKey) rotation = Math.round(rotation / 15) * 15;
      onPreviewElement(selectedId, { rotation: Math.round(rotation * 10) / 10 });
      return;
    }
    const dx = (event.clientX - drag.startX) / scale;
    const dy = (event.clientY - drag.startY) / scale;
    const start = drag.element;
    if (drag.mode === 'move') {
      const x = Math.round(start.x + dx);
      const y = Math.round(start.y + dy);
      onPreviewElement(selectedId, { x, y });
      return;
    }
    let { x, y, w, h } = start;
    if (drag.dir.includes('e')) w = Math.max(12, start.w + dx);
    if (drag.dir.includes('s')) h = Math.max(12, start.h + dy);
    if (drag.dir.includes('w')) {
      w = Math.max(12, start.w - dx);
      x = start.x + (start.w - w);
    }
    if (drag.dir.includes('n')) {
      h = Math.max(12, start.h - dy);
      y = start.y + (start.h - h);
    }
    if (event.shiftKey && drag.dir.length === 2) {
      const ratio = start.w / start.h;
      if (w / h > ratio) w = h * ratio;
      else h = w / ratio;
      if (drag.dir.includes('w')) x = start.x + (start.w - w);
      if (drag.dir.includes('n')) y = start.y + (start.h - h);
    }
    onPreviewElement(selectedId, { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
  };

  const endDrag = () => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    onEnd();
  };


  const onDrop = (event) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const point = {
      x: Math.max(0, Math.min(deck.width, (event.clientX - rect.left) / scale)),
      y: Math.max(0, Math.min(deck.height, (event.clientY - rect.top) / scale)),
    };
    for (const file of event.dataTransfer.files || []) onDropFile(file, point);
  };

  const background = slide.background || {};

  return (
    <div className="canvas-area">
      <div className="canvas-scroll" ref={wrapRef} onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
        <div
          className="canvas-stage-wrap"
          style={{ width: `${deck.width * scale}px`, height: `${deck.height * scale}px` }}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div
            className={`canvas-stage ${dragging ? 'dragging' : ''}`}
            style={{
              width: `${deck.width}px`,
              height: `${deck.height}px`,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              backgroundColor: background.color || '#ffffff',
            }}
            onPointerDown={() => onSelect(null)}
          >
            {background.image && (
              <div
                className="canvas-bg-image"
                style={{
                  backgroundImage: `url("${background.image}")`,
                  backgroundSize: background.fit === 'contain' ? 'contain' : background.fit === 'stretch' ? '100% 100%' : 'cover',
                  opacity: background.opacity ?? 1,
                  filter: background.blur ? `blur(${background.blur}px)` : undefined,
                }}
              />
            )}
            {slide.elements?.length === 0 && (
              <div className="empty-slide-hint">
                <Icon name="sparkle" size={26} />
                <strong>Start your story</strong>
                <span>Add text, media, a shape or an Excel-style table from the toolbar.</span>
              </div>
            )}
            {slide.elements?.map((element) => {
              const selected = element.id === selectedId;
              return (
                <div
                  key={element.id}
                  className={`canvas-element ${selected ? 'selected' : ''} ${editingTextId === element.id ? 'editing' : ''}`}
                  style={{
                    left: `${element.x}px`,
                    top: `${element.y}px`,
                    width: `${element.w}px`,
                    height: `${element.h}px`,
                    transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
                    zIndex: selected ? 999 : undefined,
                  }}
                  onPointerDown={(event) => startMove(event, element)}
                  onPointerMove={onPointerMove}
                  onPointerUp={endDrag}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    if (element.type === 'text') onStartTextEdit(element.id);
                    else if (element.type === 'table') onOpenTable(element);
                    else onExpand(element);
                  }}
                >
                  <ElementView
                    element={{ ...element, x: 0, y: 0, rotation: 0, expandable: false }}
                    editingText={editingTextId === element.id}
                    onTextCommit={(text, options) => {
                      if (!options?.cancel) onCommitElement(element.id, { text });
                      onEndTextEdit();
                    }}
                    preview
                    mediaInteractive={false}
                    onTableDoubleClick={() => onOpenTable(element)}
                  />
                  {selected && !editingTextId && (
                    <>
                      <div className="selection-outline" />
                      {HANDLES.map((dir) => (
                        <span
                          key={dir}
                          className={`resize-handle h-${dir}`}
                          onPointerDown={(event) => startResize(event, element, dir)}
                          onPointerMove={onPointerMove}
                          onPointerUp={endDrag}
                        />
                      ))}
                      <span
                        className="rotate-handle"
                        title="Rotate"
                        onPointerDown={(event) => startRotate(event, element, event.currentTarget.parentElement)}
                      >
                        <Icon name="redo" size={12} />
                      </span>
                      <span className="element-tag">
                        {element.type} · {Math.round(element.w)}×{Math.round(element.h)}
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="canvas-zoom">
        <button type="button" className="ghost-btn icon-only" onClick={() => onZoom(Math.max(0.25, zoom - 0.1))} title="Zoom out">
          <Icon name="zoomOut" size={15} />
        </button>
        <button type="button" className="zoom-value" onClick={() => onZoom(1)} title="Reset zoom">
          {Math.round(scale * 100)}%
        </button>
        <button type="button" className="ghost-btn icon-only" onClick={() => onZoom(Math.min(3, zoom + 0.1))} title="Zoom in">
          <Icon name="zoomIn" size={15} />
        </button>
      </div>
      {selection && (
        <div className="canvas-coords" aria-hidden="true">
          x {Math.round(selection.x)} · y {Math.round(selection.y)}
        </div>
      )}
    </div>
  );
}
