import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ElementView from './ElementView.jsx';
import Icon from './Icon.jsx';
import TextToolbar from './TextToolbar.jsx';
import { backgroundStyles } from '../lib/backgrounds.js';
import { boundsOf, idsInBox, offsetChanges, rotateAround, scaleToBounds, selectionElements } from '../lib/selection.js';

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export default function EditorCanvas({
  deck,
  slide,
  selectedIds = [],
  zoom,
  onZoom,
  onSelect,
  onPreviewElement,
  onPreviewSelection,
  onMarquee,
  onBegin,
  onEnd,
  onOpenTable,
  onExpand,
  onDropFile,
  onContextMenu,
  editingTextId,
  onStartTextEdit,
  onEndTextEdit,
  onCreateText,
  textEditorRef,
  fonts = [],
  onPatchTextStyle,
  animStep = null,
}) {
  const wrapRef = useRef(null);
  const [fit, setFit] = useState(0.5);
  const dragRef = useRef(null);
  /** Latest `endDrag`, so the window-level pointerup always runs the current one. */
  const endDragRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  /** The rubber-band rectangle while objects are swept up on empty canvas. */
  const [marquee, setMarquee] = useState(null);


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
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedId = selectedIds.length ? selectedIds[selectedIds.length - 1] : null;
  const selection = slide.elements?.find((element) => element.id === selectedId);
  const selectedElements = useMemo(
    () => (slide.elements || []).filter((element) => selectedSet.has(element.id)),
    [slide, selectedSet]
  );
  /** Two or more objects share one bounding box with its own resize/rotate handles. */
  const isMulti = selectedElements.length > 1;
  const groupBox = isMulti ? boundsOf(selectedElements) : null;
  const groupCentre = groupBox ? { x: groupBox.x + groupBox.w / 2, y: groupBox.y + groupBox.h / 2 } : null;
  const editingElement = editingTextId ? slide.elements?.find((element) => element.id === editingTextId) : null;
  /** Timestamp of the click that closed the inline editor, so the same click cannot also spawn a box. */
  const editEndedAt = useRef(0);

  /** Point of a mouse event in slide coordinates. */
  const pointFromEvent = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(deck.width, (event.clientX - rect.left) / scale)),
      y: Math.max(0, Math.min(deck.height, (event.clientY - rect.top) / scale)),
    };
  };

  /** Topmost element whose rectangle contains a point in slide coordinates. */
  const elementAt = (point) => {
    const list = slide.elements || [];
    for (let index = list.length - 1; index >= 0; index -= 1) {
      const element = list[index];
      if (
        point.x >= element.x &&
        point.x <= element.x + element.w &&
        point.y >= element.y &&
        point.y <= element.y + element.h
      ) {
        return element;
      }
    }
    return null;
  };

  const startTextAt = (event) => {
    if (!onCreateText) return;
    onCreateText(pointFromEvent(event));
  };

  const idsOf = (items) => items.map((item) => item.id);

  /**
   * The box a resize-handle drag produces. Shared by a single object and by a
   * whole selection, so a group grows out of its bounding box exactly the way one
   * object grows out of its own.
   */
  const resizedBox = (box, dir, dx, dy, keepRatio) => {
    let { x, y, w, h } = box;
    if (dir.includes('e')) w = Math.max(12, box.w + dx);
    if (dir.includes('s')) h = Math.max(12, box.h + dy);
    if (dir.includes('w')) {
      w = Math.max(12, box.w - dx);
      x = box.x + (box.w - w);
    }
    if (dir.includes('n')) {
      h = Math.max(12, box.h - dy);
      y = box.y + (box.h - h);
    }
    if (keepRatio && dir.length === 2) {
      const ratio = box.w / box.h;
      if (w / h > ratio) w = h * ratio;
      else h = w / ratio;
      if (dir.includes('w')) x = box.x + (box.w - w);
      if (dir.includes('n')) y = box.y + (box.h - h);
    }
    return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
  };

  // A pointer released anywhere — even outside the window — has to finish the
  // drag, which is what commits the previewed positions into the undo history.
  useEffect(() => {
    const stop = () => endDragRef.current?.();
    window.addEventListener('pointerup', stop);
    return () => window.removeEventListener('pointerup', stop);
  }, []);

  /**
   * Click on an object.
   *
   * - plain click picks it (and its group) and starts a drag;
   * - Shift or Ctrl/Cmd + click adds it to the selection or takes it out;
   * - clicking an object that is *already* selected keeps the whole selection, so
   *   the group can be dragged as one — the PowerPoint rule.
   */
  const startMove = (event, element) => {
    if (event.button !== 0) return;
    if (event.target.closest('.resize-handle') || event.target.closest('.rotate-handle')) return;
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    const alreadySelected = selectedSet.has(element.id);
    if (additive) {
      event.stopPropagation();
      onSelect(element.id, { toggle: true });
      return;
    }
    if (!alreadySelected) onSelect(element.id);
    if (editingTextId === element.id) {
      // The box being edited owns every click inside it — never let it bubble to the canvas.
      event.stopPropagation();
      return;
    }
    event.stopPropagation();
    onBegin();
    const members = alreadySelected ? selectedElements : selectionElements(slide.elements || [], [element.id]);
    dragRef.current = {
      mode: 'move',
      startX: event.clientX,
      startY: event.clientY,
      items: members.map((item) => ({ id: item.id, x: item.x, y: item.y })),
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

  /** Resize handle of the selection box: scales every selected object with it. */
  const startResizeGroup = (event, dir) => {
    event.stopPropagation();
    event.preventDefault();
    if (!groupBox) return;
    onBegin();
    dragRef.current = {
      mode: 'resizeGroup',
      dir,
      startX: event.clientX,
      startY: event.clientY,
      box: { ...groupBox },
      items: selectedElements.map((item) => ({ id: item.id, x: item.x, y: item.y, w: item.w, h: item.h })),
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

  /** Rotate handle of the selection box: spins every object about the group centre. */
  const startRotateGroup = (event, wrapper) => {
    event.stopPropagation();
    event.preventDefault();
    if (!groupCentre) return;
    onBegin();
    const rect = wrapper.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    dragRef.current = {
      mode: 'rotateGroup',
      centerX,
      centerY,
      startAngle: (Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180) / Math.PI,
      centre: { ...groupCentre },
      items: selectedElements.map((item) => ({
        id: item.id,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        rotation: item.rotation || 0,
      })),
    };
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  /** Start a marquee on empty canvas; Shift/Ctrl keeps what is already selected. */
  const startMarquee = (event) => {
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    if (!additive) onSelect(null);
    const start = pointFromEvent(event);
    const box = { x: start.x, y: start.y, w: 0, h: 0 };
    dragRef.current = { mode: 'marquee', additive, start, box };
    setMarquee(box);
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };


  const onPointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    event.preventDefault();
    if (drag.mode === 'marquee') {
      const point = pointFromEvent(event);
      const box = {
        x: Math.min(drag.start.x, point.x),
        y: Math.min(drag.start.y, point.y),
        w: Math.abs(point.x - drag.start.x),
        h: Math.abs(point.y - drag.start.y),
      };
      drag.box = box;
      setMarquee(box);
      return;
    }
    if (drag.mode === 'rotate') {
      const angle = (Math.atan2(event.clientY - drag.centerY, event.clientX - drag.centerX) * 180) / Math.PI;
      let rotation = drag.element.rotation + (angle - drag.startAngle);
      if (event.shiftKey) rotation = Math.round(rotation / 15) * 15;
      onPreviewElement(selectedId, { rotation: Math.round(rotation * 10) / 10 });
      return;
    }
    const dx = (event.clientX - drag.startX) / scale;
    const dy = (event.clientY - drag.startY) / scale;

    if (drag.mode === 'move') {
      // One object or the whole selection — the same maths, so a group never drifts.
      onPreviewSelection(offsetChanges(drag.items, dx, dy));
      return;
    }
    if (drag.mode === 'rotateGroup') {
      const angle = (Math.atan2(event.clientY - drag.centerY, event.clientX - drag.centerX) * 180) / Math.PI;
      let delta = angle - drag.startAngle;
      if (event.shiftKey) delta = Math.round(delta / 15) * 15;
      onPreviewSelection(rotateAround(drag.items, idsOf(drag.items), drag.centre, delta));
      return;
    }
    if (drag.mode === 'resizeGroup') {
      const box = resizedBox(drag.box, drag.dir, dx, dy, event.shiftKey);
      onPreviewSelection(scaleToBounds(drag.items, idsOf(drag.items), drag.box, box));
      return;
    }
    onPreviewElement(selectedId, resizedBox(drag.element, drag.dir, dx, dy, event.shiftKey));
  };

  const endDrag = () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setDragging(false);
    if (drag.mode === 'marquee') {
      setMarquee(null);
      const box = drag.box;
      // A plain click (no sweep) is just a deselect, which already happened.
      if (box && box.w > 3 && box.h > 3) onMarquee?.(idsInBox(slide.elements || [], box), drag.additive);
      return;
    }
    onEnd();
  };
  endDragRef.current = endDrag;


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
  const { container: bgContainer, layer: bgLayer } = backgroundStyles(background);

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
              backgroundColor: bgContainer.backgroundColor,
            }}
            onPointerDown={(event) => {
              // Element handlers own clicks that land on an object.
              if (event.target.closest('.canvas-element')) return;
              if (event.target.closest('.selection-group')) return;
              if (editingTextId) editEndedAt.current = Date.now();
              startMarquee(event);
            }}
            onDoubleClick={(event) => {
              if (editingTextId) return;
              if (Date.now() - editEndedAt.current < 500) return;
              if (event.target.closest('.canvas-element')) return;
              if (elementAt(pointFromEvent(event))) return;
              startTextAt(event);
            }}
            onContextMenu={(event) => {
              // Right-clicking empty canvas: the slide's own menu.
              if (event.target.closest('.canvas-element')) return;
              event.preventDefault();
              onContextMenu?.({ event, element: null, point: pointFromEvent(event) });
            }}
          >
            {bgLayer && <div className="canvas-bg-image" style={bgLayer} />}
            {slide.elements?.length === 0 && (
              <div className="empty-slide-hint">
                <Icon name="sparkle" size={31} />
                <strong>Start your story</strong>
                <span>Double-click anywhere to write, or add media, a shape or an Excel-style table from the toolbar.</span>
              </div>
            )}
            {slide.elements?.map((element) => {
              const selected = selectedSet.has(element.id);
              const primary = element.id === selectedId;
              return (
                <div
                  key={element.id}
                  className={`canvas-element ${selected ? 'selected' : ''} ${selected && isMulti ? 'multi' : ''} ${
                    editingTextId === element.id ? 'editing' : ''
                  }`}
                  style={{
                    left: `${element.x}px`,
                    top: `${element.y}px`,
                    width: `${element.w}px`,
                    height: `${element.h}px`,
                    transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
                    zIndex: primary ? 999 : undefined,
                  }}
                  onPointerDown={(event) => startMove(event, element)}
                  onMouseDown={(event) => {
                    if (editingTextId !== element.id) return;
                    // Clicking the text places the caret normally; clicking anywhere else
                    // inside the box keeps the session alive instead of blurring it.
                    if (event.target.closest('.inline-text-editor')) return;
                    event.preventDefault();
                    event.stopPropagation();
                    const node = textEditorRef?.current;
                    if (!node) return;
                    node.focus();
                    const range = document.createRange();
                    range.selectNodeContents(node);
                    range.collapse(false);
                    const selection = window.getSelection();
                    selection?.removeAllRanges();
                    selection?.addRange(range);
                  }}
                  onPointerMove={onPointerMove}
                  onPointerUp={endDrag}
                  onContextMenu={(event) => {
                    // Right-clicking an object: its own menu (text editing included).
                    event.preventDefault();
                    event.stopPropagation();
                    // Selecting it first makes the menu act on what was clicked.
                    if (editingTextId !== element.id && !selectedSet.has(element.id)) onSelect(element.id);
                    onContextMenu?.({ event, element, point: pointFromEvent(event) });
                  }}
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
                    editorRef={editingTextId === element.id ? textEditorRef : undefined}
                    onTextCommit={(_payload, options) => onEndTextEdit(options)}
                    preview
                    mediaInteractive={false}
                    onTableDoubleClick={() => onOpenTable(element)}
                    animations={slide.animations || []}
                    animStep={animStep}
                    slideSize={{ width: deck.width, height: deck.height }}
                  />
                  {primary && !isMulti && !editingTextId && (
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
                        <Icon name="redo" size={14} />
                      </span>
                      <span className="element-tag">
                        {element.type} · {Math.round(element.w)}×{Math.round(element.h)}
                      </span>
                    </>
                  )}
                </div>
              );
            })}
            {isMulti && groupBox && !editingTextId && (
              /* One bounding box for the whole selection: drag a handle to scale
                 every object with it, or the top handle to spin them together. */
              <div
                className="selection-group"
                style={{ left: groupBox.x, top: groupBox.y, width: groupBox.w, height: groupBox.h }}
              >
                {HANDLES.map((dir) => (
                  <span
                    key={dir}
                    className={`resize-handle h-${dir}`}
                    onPointerDown={(event) => startResizeGroup(event, dir)}
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                  />
                ))}
                <span
                  className="rotate-handle"
                  title="Rotate the selection"
                  onPointerDown={(event) => startRotateGroup(event, event.currentTarget.parentElement)}
                >
                  <Icon name="redo" size={14} />
                </span>
                <span className="group-tag">{selectedElements.length} objects selected</span>
              </div>
            )}
            {marquee && (marquee.w > 2 || marquee.h > 2) && (
              <div
                className="marquee-rect"
                style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
              />
            )}
          </div>
          {editingElement && (
            <TextToolbar
              editorRef={textEditorRef}
              fonts={fonts}
              onPatchStyle={onPatchTextStyle}
              placement={editingElement.y * scale < 110 ? 'below' : 'above'}
              style={
                editingElement.y * scale < 110
                  ? { left: `${editingElement.x * scale}px`, top: `${(editingElement.y + editingElement.h) * scale + 10}px` }
                  : { left: `${editingElement.x * scale}px`, top: `${editingElement.y * scale - 10}px`, transform: 'translateY(-100%)' }
              }
              onDone={onEndTextEdit}
            />
          )}
        </div>
      </div>
      <div className="canvas-zoom">
        <button type="button" className="ghost-btn icon-only" onClick={() => onZoom(Math.max(0.25, zoom - 0.1))} title="Zoom out">
          <Icon name="zoomOut" size={18} />
        </button>
        <button type="button" className="zoom-value" onClick={() => onZoom(1)} title="Reset zoom">
          {Math.round(scale * 100)}%
        </button>
        <button type="button" className="ghost-btn icon-only" onClick={() => onZoom(Math.min(3, zoom + 0.1))} title="Zoom in">
          <Icon name="zoomIn" size={18} />
        </button>
      </div>
      {(groupBox || selection) && (
        <div className="canvas-coords" aria-hidden="true">
          {isMulti ? `${selectedElements.length} objects · ` : ''}
          x {Math.round((groupBox || selection).x)} · y {Math.round((groupBox || selection).y)}
          {isMulti ? ` · ${Math.round(groupBox.w)}×${Math.round(groupBox.h)}` : ''}
        </div>
      )}
    </div>
  );
}
