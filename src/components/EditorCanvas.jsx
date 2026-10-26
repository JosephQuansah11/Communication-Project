import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ElementView from './ElementView.jsx';
import Icon from './Icon.jsx';
import TextToolbar from './TextToolbar.jsx';
import { backgroundStyles } from '../lib/backgrounds.js';
import { createCoalesce } from '../lib/throttle.js';
import { boundsOf, idsInBox, offsetChanges, rotateAround, scaleToBounds, selectionElements } from '../lib/selection.js';
import {
  LOCAL_BOX,
  cloneRings,
  bendRingSegment,
  insertRingPoint,
  movePathPoint,
  nearestOnRings,
  rectRings,
  removePathPoint,
  ringSegmentMidpoint,
  ringsToD,
  shapeLocalRings,
  straightenRingSegment,
} from '../lib/paths.js';

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/**
 * Hold on to the pointer so a drag that leaves the window still finishes.
 * Browsers throw when the pointer is already gone (a synthetic event, a lost
 * gesture, a second pointer) — a drag that simply ends there is fine.
 */
function capturePointer(node, pointerId) {
  try {
    node?.setPointerCapture?.(pointerId);
  } catch {
    /* the pointer is already gone */
  }
}
/** The four corners of a rectangle, in the order Figma lists them. */
const CORNERS = [
  { key: 'tl', x: 0, y: 0 },
  { key: 'tr', x: 1, y: 0 },
  { key: 'br', x: 1, y: 1 },
  { key: 'bl', x: 0, y: 1 },
];

/** The four corner radii of a shape, per corner when it has them, uniform otherwise. */
const cornerList = (element) => {
  const source = element?.corners;
  if (source && typeof source === 'object') {
    return { tl: source.tl || 0, tr: source.tr || 0, br: source.br || 0, bl: source.bl || 0 };
  }
  const radius = Number(element?.radius) || 0;
  return { tl: radius, tr: radius, br: radius, bl: radius };
};

/** Corner widgets only make sense on a rectangle, where Figma offers four of them. */
const hasCornerWidgets = (element) => {
  // Rects and round-rects round their own corners; a picture does too while it is
  // not clipped into a preset outline.
  if (element?.type === 'shape') return !element.shape || element.shape === 'rect' || element.shape === 'roundRect';
  if (element?.type === 'image' || element?.type === 'video') return !element.clipShape || element.clipShape === 'none';
  return false;
};

/**
 * The Vector Edit overlay that sits on top of the object being reshaped.
 *
 * It is drawn from the outline the element *currently* has — a rectangle, a preset
 * polygon or a custom path — so the dots are always in the right place without the
 * element having to be a path yet: grabbing one is what turns it into one. Orange
 * squares are the anchors (corners and curve points), orange diamonds bend the edge
 * they sit on, and the round dots pull a point's curve handles. The outline itself
 * is a target: hover it for a "+" cursor and click to drop a point on it, or drag
 * it to pull the edge into a curve.
 */
function ShapeNodeEditor({ element, scale, onPointDrag, onInsert, onRemove, onBend, onStraighten, onSegmentDrag }) {
  const w = Math.max(1, Number(element.w) || 100);
  const h = Math.max(1, Number(element.h) || 100);
  const rings = shapeLocalRings(element);
  const d = ringsToD(rings);
  const toLocal = (point) => ({ x: (point.x / LOCAL_BOX) * w, y: (point.y / LOCAL_BOX) * h });
  const anchor = 9 / scale;
  const dot = 7 / scale;
  const bend = 8 / scale;
  return (
    <svg
      className="node-editor"
      viewBox={`0 0 ${w} ${h}`}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}
    >
      <path className="node-outline" d={d} fill="none" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      <path
        className="node-hit"
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(6, 16 / scale)}
        onPointerDown={(event) => onSegmentDrag(event)}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onInsert(event);
        }}
      />
      {rings.map((ring, ringIndex) =>
        (ring.points || []).map((point, pointIndex) => {
          const at = toLocal(point);
          const out = point.out ? toLocal(point.out) : null;
          const into = point.in ? toLocal(point.in) : null;
          return (
            <g key={`p-${ringIndex}-${pointIndex}`}>
              {out && (
                <>
                  <line className="node-handle-line" x1={at.x} y1={at.y} x2={out.x} y2={out.y} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  <circle
                    className="node-handle"
                    cx={out.x}
                    cy={out.y}
                    r={dot}
                    onPointerDown={(event) => onPointDrag(event, ringIndex, pointIndex, 'out')}
                  />
                </>
              )}
              {into && (
                <>
                  <line className="node-handle-line" x1={at.x} y1={at.y} x2={into.x} y2={into.y} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  <circle
                    className="node-handle"
                    cx={into.x}
                    cy={into.y}
                    r={dot}
                    onPointerDown={(event) => onPointDrag(event, ringIndex, pointIndex, 'in')}
                  />
                </>
              )}
              <rect
                className="node-anchor"
                x={at.x - anchor / 2}
                y={at.y - anchor / 2}
                width={anchor}
                height={anchor}
                onPointerDown={(event) => {
                  if (event.altKey) {
                    event.preventDefault();
                    event.stopPropagation();
                    onRemove(ringIndex, pointIndex);
                    return;
                  }
                  onPointDrag(event, ringIndex, pointIndex);
                }}
              />
            </g>
          );
        })
      )}
      {/* A diamond in the middle of every edge: drag it to bend the edge, the way
          an image editor's Bend tool does. */}
      {rings.map((ring, ringIndex) =>
        (ring.points || []).map((point, segmentIndex) => {
          if ((ring.points || []).length < 3) return null;
          const mid = ringSegmentMidpoint(ring, segmentIndex);
          if (!mid) return null;
          const at = toLocal(mid);
          const curved = Boolean(point.out || ring.points[(segmentIndex + 1) % ring.points.length].in);
          return (
            <rect
              key={`bend-${ringIndex}-${segmentIndex}`}
              className={`node-bend${curved ? ' curved' : ''}`}
              x={at.x - bend / 2}
              y={at.y - bend / 2}
              width={bend}
              height={bend}
              transform={`rotate(45 ${at.x} ${at.y})`}
              onPointerDown={(event) => {
                if (event.altKey && curved) {
                  event.preventDefault();
                  event.stopPropagation();
                  onStraighten(ringIndex, segmentIndex);
                  return;
                }
                onBend(event, ringIndex, segmentIndex);
              }}
            />
          );
        })
      )}
    </svg>
  );
}

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
  tool = 'select',
  nodeEditId = null,
  pointEditId = null,
  onExitPointEdit,
  onToolChange,
  onCreatePath,
  onEnsurePath,
  onPatchPath,
  onPatchCorners,
}) {
  const wrapRef = useRef(null);
  /** The slide itself, used to turn pointer positions into slide coordinates. */
  const stageRef = useRef(null);
  const [fit, setFit] = useState(0.5);
  const dragRef = useRef(null);
  /** Where the pointer was last seen, so a click knows where it landed. */
  const lastPointer = useRef(null);
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
    // Any press that is not on a dot or on the outline locks the custom shape.
    onExitPointEdit?.();
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
    capturePointer(event.currentTarget, event.pointerId);
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
    capturePointer(event.currentTarget, event.pointerId);
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
    capturePointer(event.currentTarget, event.pointerId);
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
    capturePointer(event.currentTarget, event.pointerId);
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
    capturePointer(event.currentTarget, event.pointerId);
  };

  /** Start a marquee on empty canvas; Shift/Ctrl keeps what is already selected. */
  const startMarquee = (event) => {
    // Clicking off the object locks its custom shape.
    onExitPointEdit?.();
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    if (!additive) onSelect(null);
    const start = pointFromEvent(event);
    const box = { x: start.x, y: start.y, w: 0, h: 0 };
    dragRef.current = { mode: 'marquee', additive, start, box };
    setMarquee(box);
    setDragging(true);
    capturePointer(event.currentTarget, event.pointerId);
  };


  /* ---------------------------------------------------------------- *
   * Shape tools: the pen, node editing and corner widgets
   * ---------------------------------------------------------------- */

  /** The pen's work in progress: anchors in slide coordinates. */
  const [pen, setPen] = useState(null);
  const penRef = useRef(null);
  penRef.current = pen;
  /** The primary object's box, used to turn pointer positions into local points. */
  const elementBoxRef = useRef(null);

  const finishPen = (closed = true) => {
    const points = penRef.current?.points || [];
    setPen(null);
    if (points.length >= 2) onCreatePath?.([{ closed, points }]);
    onToolChange?.('select');
  };

  const startPen = (event) => {
    if (event.button !== 0) return;
    const point = pointFromEvent(event);
    const points = penRef.current?.points || [];
    // Clicking the first anchor again closes the outline, the way every pen tool does.
    if (points.length >= 2 && Math.hypot(point.x - points[0].x, point.y - points[0].y) <= 12 / scale) {
      finishPen(true);
      return;
    }
    const next = [...points, { x: point.x, y: point.y }];
    setPen({ points: next, dragging: next.length - 1 });
    capturePointer(event.currentTarget, event.pointerId);
  };

  const queueMove = useRef(null);
  const applyMoveRef = useRef(null);
  if (!queueMove.current) {
    // The newest pointer position is applied once per frame, not once per event.
    queueMove.current = createCoalesce((input) => applyMoveRef.current?.(input));
  }
  useEffect(() => () => queueMove.current?.cancel(), []);

  /** The object whose points or corners are being edited. */
  const nodeElement = nodeEditId ? (slide.elements || []).find((element) => element.id === nodeEditId) : null;

  /** A point in the element's own box (0..w, 0..h) from a pointer event. */
  const localFromEvent = (event, element) => {
    const rect = elementBoxRef.current?.getBoundingClientRect();
    if (!rect || !element) return { x: 0, y: 0 };
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angle = (-(element.rotation || 0) * Math.PI) / 180;
    const dx = event.clientX - cx;
    const dy = event.clientY - cy;
    return {
      x: element.w / 2 + (dx * Math.cos(angle) - dy * Math.sin(angle)) / scale,
      y: element.h / 2 + (dx * Math.sin(angle) + dy * Math.cos(angle)) / scale,
    };
  };

  /**
   * The outline a dot drag works on: the element's own rings when it is already a
   * path, otherwise the rings of the shape it has now — grabbing a dot is what
   * turns a preset shape or a picture into an editable path, so the element only
   * changes when the user actually edits it.
   */
  const ensureRings = (element) => {
    if (element.path?.rings?.length) return cloneRings(element.path.rings);
    const converted = onEnsurePath?.(element);
    if (converted?.length) return converted;
    const w = element.w || 1;
    const h = element.h || 1;
    return cloneRings(
      shapeLocalRings(element).map((ring) => ({
        closed: ring.closed !== false,
        points: ring.points.map((point) => ({
          x: (point.x / w) * LOCAL_BOX,
          y: (point.y / h) * LOCAL_BOX,
          ...(point.in ? { in: { x: (point.in.x / w) * LOCAL_BOX, y: (point.in.y / h) * LOCAL_BOX } } : {}),
          ...(point.out ? { out: { x: (point.out.x / w) * LOCAL_BOX, y: (point.out.y / h) * LOCAL_BOX } } : {}),
        })),
      }))
    );
  };

  /**
   * Grabbing the outline itself: a click drops a new anchor on it, a drag pulls
   * that edge out into a curve (the Bend tool). Which of the two it is only becomes
   * clear once the pointer moves, so the drag starts out as "pending insert".
   */
  const startSegmentDrag = (event, element) => {
    event.stopPropagation();
    event.preventDefault();
    if (!element) return;
    const local = localFromEvent(event, element);
    const target = {
      x: (local.x / (element.w || 1)) * LOCAL_BOX,
      y: (local.y / (element.h || 1)) * LOCAL_BOX,
    };
    const base = ensureRings(element);
    const nearest = nearestOnRings(base, target, 24);
    if (!nearest) return;
    onBegin();
    dragRef.current = {
      mode: 'bend',
      element,
      ringIndex: nearest.ringIndex,
      segmentIndex: nearest.segmentIndex,
      base,
      // A click that never moves adds a point instead of curving the edge.
      pendingInsert: true,
      origin: { x: event.clientX, y: event.clientY },
    };
    setDragging(true);
    capturePointer(event.currentTarget, event.pointerId);
  };

  const startNodeDrag = (event, element, ringIndex, pointIndex, handle = null) => {
    event.stopPropagation();
    event.preventDefault();
    if (!element) return;
    onBegin();
    dragRef.current = { mode: 'node', element, ringIndex, pointIndex, handle, base: ensureRings(element) };
    setDragging(true);
    capturePointer(event.currentTarget, event.pointerId);
  };

  const startCornerDrag = (event, element, key) => {
    event.stopPropagation();
    event.preventDefault();
    onBegin();
    dragRef.current = { mode: 'corner', element, key };
    setDragging(true);
    capturePointer(event.currentTarget, event.pointerId);
  };

  /** Dragging the middle of an edge bends it into a curve. */
  const startBendDrag = (event, element, ringIndex, segmentIndex) => {
    event.stopPropagation();
    event.preventDefault();
    if (!element) return;
    onBegin();
    dragRef.current = { mode: 'bend', element, ringIndex, segmentIndex, base: ensureRings(element) };
    setDragging(true);
    capturePointer(event.currentTarget, event.pointerId);
  };

  /** Enter closes the outline, Esc throws it away, Backspace drops the last anchor. */
  useEffect(() => {
    if (tool !== 'pen') return undefined;
    const onKey = (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        finishPen(true);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setPen(null);
        onToolChange?.('select');
        return;
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        setPen((current) => (current?.points?.length ? { ...current, points: current.points.slice(0, -1) } : current));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /**
   * Everything a drag needs from a pointer event. The event object itself cannot
   * be kept (its `currentTarget` is cleared once the handler returns), and the
   * work below runs on the next frame.
   */
  const moveInput = (event) => ({
    clientX: event.clientX,
    clientY: event.clientY,
    shiftKey: event.shiftKey,
    rect: event.currentTarget.getBoundingClientRect(),
  });

  /** Slide coordinates of a captured input. */
  const inputPoint = (input) => ({
    x: Math.max(0, Math.min(deck.width, (input.clientX - input.rect.left) / scale)),
    y: Math.max(0, Math.min(deck.height, (input.clientY - input.rect.top) / scale)),
  });

  /** The pen's handle, pulled out while an anchor is being dropped. */
  const applyPenHandle = (input) => {
    const current = penRef.current;
    if (!current || current.dragging === null || current.dragging === undefined) return false;
    const index = current.dragging;
    const anchor = current.points[index];
    const point = inputPoint(input);
    setPen({
      ...current,
      points: current.points.map((item, at) =>
        at === index
          ? {
              x: anchor.x,
              y: anchor.y,
              out: { x: point.x, y: point.y },
              in: { x: 2 * anchor.x - point.x, y: 2 * anchor.y - point.y },
            }
          : item
      ),
    });
    return true;
  };

  /**
   * Apply one drag step. Pointer moves arrive far faster than the screen can
   * show them (a 500 Hz mouse would mean 500 renders a second), so the newest
   * input is applied once per animation frame instead.
   */
  const applyMove = (input) => {
    if (applyPenHandle(input)) return;
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.mode === 'node') {
      // Every move recomputes from the outline the drag started with, so it never drifts.
      const local = localFromEvent(input, drag.element);
      onPatchPath?.(drag.element.id, movePathPoint(drag.element, drag.ringIndex, drag.pointIndex, local, drag.handle, drag.base), false);
      return;
    }
    if (drag.mode === 'bend') {
      // The edge follows the pointer: the curve passes through it exactly.
      // A press on the outline that has not moved yet is still a "click to add a
      // point"; only real movement turns it into a bend.
      if (drag.pendingInsert) {
        if (Math.hypot(input.clientX - drag.origin.x, input.clientY - drag.origin.y) < 4) return;
        drag.pendingInsert = false;
      }
      const local = localFromEvent(input, drag.element);
      const target = {
        x: (local.x / (drag.element.w || 1)) * LOCAL_BOX,
        y: (local.y / (drag.element.h || 1)) * LOCAL_BOX,
      };
      const rings = cloneRings(drag.base || []);
      if (rings[drag.ringIndex]) {
        rings[drag.ringIndex] = bendRingSegment(rings[drag.ringIndex], drag.segmentIndex, target);
        onPatchPath?.(drag.element.id, rings, false);
      }
      return;
    }
    if (drag.mode === 'corner') {
      const local = localFromEvent(input, drag.element);
      const { w, h } = drag.element;
      const limit = Math.min(w, h) / 2;
      const reach = {
        tl: Math.max(local.x, local.y),
        tr: Math.max(w - local.x, local.y),
        br: Math.max(w - local.x, h - local.y),
        bl: Math.max(local.x, h - local.y),
      };
      const radius = Math.max(0, Math.min(limit, Math.round(reach[drag.key])));
      onPatchCorners?.({ ...cornerList(drag.element), [drag.key]: radius });
      return;
    }
    if (drag.mode === 'marquee') {
      const point = inputPoint(input);
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
      const angle = (Math.atan2(input.clientY - drag.centerY, input.clientX - drag.centerX) * 180) / Math.PI;
      let rotation = drag.element.rotation + (angle - drag.startAngle);
      if (input.shiftKey) rotation = Math.round(rotation / 15) * 15;
      onPreviewElement(selectedId, { rotation: Math.round(rotation * 10) / 10 });
      return;
    }
    const dx = (input.clientX - drag.startX) / scale;
    const dy = (input.clientY - drag.startY) / scale;

    if (drag.mode === 'move') {
      // One object or the whole selection � the same maths, so a group never drifts.
      onPreviewSelection(offsetChanges(drag.items, dx, dy));
      return;
    }
    if (drag.mode === 'rotateGroup') {
      const angle = (Math.atan2(input.clientY - drag.centerY, input.clientX - drag.centerX) * 180) / Math.PI;
      let delta = angle - drag.startAngle;
      if (input.shiftKey) delta = Math.round(delta / 15) * 15;
      onPreviewSelection(rotateAround(drag.items, idsOf(drag.items), drag.centre, delta));
      return;
    }
    if (drag.mode === 'resizeGroup') {
      const box = resizedBox(drag.box, drag.dir, dx, dy, input.shiftKey);
      onPreviewSelection(scaleToBounds(drag.items, idsOf(drag.items), drag.box, box));
      return;
    }
    onPreviewElement(selectedId, resizedBox(drag.element, drag.dir, dx, dy, input.shiftKey));
  };

  applyMoveRef.current = applyMove;

  const onPointerMove = (event) => {
    // Stop the browser from selecting text while a drag is in flight, then let
    // the frame callback do the work.
    if (dragRef.current || penRef.current?.dragging !== null && penRef.current?.dragging !== undefined) {
      event.preventDefault();
    }
    lastPointer.current = event;
    queueMove.current(moveInput(event));
  };

  const endDrag = () => {
    // Apply the last pointer position before the drag is committed.
    queueMove.current?.flush();
    if (penRef.current?.dragging !== null && penRef.current?.dragging !== undefined) {
      // Releasing after dropping an anchor just stops pulling its handles.
      setPen((current) => (current ? { ...current, dragging: null } : current));
      return;
    }
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
    // A click on the outline — no drag — drops a new anchor where it was clicked.
    if (drag.mode === 'bend' && drag.pendingInsert) {
      const last = lastPointer.current || drag.origin;
      const local = localFromEvent(last, drag.element);
      const target = {
        x: (local.x / (drag.element.w || 1)) * LOCAL_BOX,
        y: (local.y / (drag.element.h || 1)) * LOCAL_BOX,
      };
      const nearest = nearestOnRings(drag.base || [], target, 30);
      if (nearest) {
        const next = cloneRings(drag.base || []);
        next[nearest.ringIndex] = insertRingPoint(next[nearest.ringIndex], nearest.segmentIndex, nearest.t);
        onPatchPath?.(drag.element.id, next, true);
        return;
      }
      onEnd();
      return;
    }
    onEnd();
  };
  endDragRef.current = endDrag;


  const onDrop = (event) => {
    event.preventDefault();
    // The slide itself decides where the file lands: the scroll container is
    // bigger than the stage and padded, so its rect would offset every drop.
    const rect = stageRef.current?.getBoundingClientRect() || event.currentTarget.getBoundingClientRect();
    const point = {
      x: Math.max(0, Math.min(deck.width, (event.clientX - rect.left) / scale)),
      y: Math.max(0, Math.min(deck.height, (event.clientY - rect.top) / scale)),
    };
    for (const file of event.dataTransfer.files || []) onDropFile(file, point);
  };

  /**
   * Ctrl (or ⌘) + wheel zooms the slide, the way every design tool does it; a
   * plain wheel keeps scrolling the canvas. The listener is attached natively so
   * the browser's own page zoom can be prevented.
   */
  useEffect(() => {
    const node = wrapRef.current;
    if (!node || !onZoom) return undefined;
    const onWheel = (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const step = event.deltaY > 0 ? -0.1 : 0.1;
      onZoom(Math.min(3, Math.max(0.25, Math.round((zoom + step) * 100) / 100)));
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [onZoom, zoom]);

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
            ref={stageRef}
            className={`canvas-stage ${dragging ? 'dragging' : ''}`}
            style={{
              width: `${deck.width}px`,
              height: `${deck.height}px`,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              backgroundColor: bgContainer.backgroundColor,
            }}
            onPointerDown={(event) => {
              // The pen owns every click while it is active.
              if (tool === 'pen') {
                event.preventDefault();
                startPen(event);
                return;
              }
              // Element handlers own clicks that land on an object.
              if (event.target.closest('.canvas-element')) return;
              if (event.target.closest('.selection-group')) return;
              if (editingTextId) editEndedAt.current = Date.now();
              startMarquee(event);
            }}
            onDoubleClick={(event) => {
              if (tool === 'pen') {
                // A double-click ends the outline as well.
                event.preventDefault();
                finishPen(true);
                return;
              }
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
                  ref={primary ? elementBoxRef : undefined}
                  data-element-id={element.id}
                  data-element-type={element.type}
                  className={`canvas-element ${selected ? 'selected' : ''} ${selected && isMulti ? 'multi' : ''} ${
                    editingTextId === element.id ? 'editing' : ''
                  } ${nodeEditId === element.id ? 'editing-nodes' : ''}`}
                  style={{
                    left: `${element.x}px`,
                    top: `${element.y}px`,
                    width: `${element.w}px`,
                    height: `${element.h}px`,
                    transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
                    zIndex: primary ? 999 : undefined,
                  }}
                  onPointerDown={(event) => {
                    // The pen and the point editor own the pointer while they are active.
                    if (tool === 'pen') return;
                    if (tool === 'nodes' && nodeEditId === element.id) return;
                    startMove(event, element);
                  }}
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
                  {pointEditId === element.id && !isMulti && !editingTextId && tool === 'select' ? (
                    <ShapeNodeEditor
                      element={element}
                      scale={scale}
                      onPointDrag={(event, ringIndex, pointIndex, handle) =>
                        startNodeDrag(event, element, ringIndex, pointIndex, handle)
                      }
                      onRemove={(ringIndex, pointIndex) => {
                        const rings = ensureRings(element);
                        onPatchPath?.(element.id, removePathPoint(element, ringIndex, pointIndex, rings), true);
                      }}
                      onBend={(event, ringIndex, segmentIndex) => startBendDrag(event, element, ringIndex, segmentIndex)}
                      onSegmentDrag={(event) => startSegmentDrag(event, element)}
                      onStraighten={(ringIndex, segmentIndex) => {
                        const rings = ensureRings(element);
                        if (!rings[ringIndex]) return;
                        rings[ringIndex] = straightenRingSegment(rings[ringIndex], segmentIndex);
                        onPatchPath?.(element.id, rings, true);
                      }}
                      onInsert={(event) => {
                        const local = localFromEvent(event, element);
                        const target = {
                          x: (local.x / (element.w || 1)) * LOCAL_BOX,
                          y: (local.y / (element.h || 1)) * LOCAL_BOX,
                        };
                        const rings = ensureRings(element);
                        const nearest = nearestOnRings(rings, target, 12);
                        if (!nearest) return;
                        const next = cloneRings(rings);
                        next[nearest.ringIndex] = insertRingPoint(next[nearest.ringIndex], nearest.segmentIndex, nearest.t);
                        onPatchPath?.(element.id, next, true);
                      }}
                    />
                  ) : null}
                  {primary &&
                    !isMulti &&
                    !editingTextId &&
                    tool === 'select' &&
                    hasCornerWidgets(element) &&
                    CORNERS.map((corner) => {
                      const radius = cornerList(element)[corner.key] || 0;
                      // The widget sits on the middle of the corner's arc, nudged clear
                      // of the resize handle that shares the corner.
                      // With the edit dots on, the rounding dot steps further inside so it
                      // never sits under the corner anchor.
                      const inset = Math.max(pointEditId === element.id ? 20 : 7, radius * 0.2929 + 3);
                      const size = 9 / scale;
                      return (
                        <span
                          key={corner.key}
                          className="corner-widget"
                          title="Drag to round this corner"
                          style={{
                            left: `${corner.x ? element.w - inset : inset}px`,
                            top: `${corner.y ? element.h - inset : inset}px`,
                            width: `${size}px`,
                            height: `${size}px`,
                            marginLeft: `${-size / 2}px`,
                            marginTop: `${-size / 2}px`,
                          }}
                          onPointerDown={(event) => startCornerDrag(event, element, corner.key)}
                        />
                      );
                    })}
                  {primary && !isMulti && !editingTextId && pointEditId !== element.id && (
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
            {pen && (
              <svg className="pen-layer" width={deck.width} height={deck.height} viewBox={`0 0 ${deck.width} ${deck.height}`}>
                <path
                  className="pen-outline"
                  d={ringsToD([{ closed: false, points: pen.points }])}
                  fill="none"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
                {pen.points.map((point, index) => (
                  <g key={index}>
                    {point.out && (
                      <line
                        className="pen-handle-line"
                        x1={point.x}
                        y1={point.y}
                        x2={point.out.x}
                        y2={point.out.y}
                        strokeWidth={1}
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                    {point.in && (
                      <line
                        className="pen-handle-line"
                        x1={point.x}
                        y1={point.y}
                        x2={point.in.x}
                        y2={point.in.y}
                        strokeWidth={1}
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                    <circle
                      className={`pen-anchor ${index === 0 ? 'first' : ''}`}
                      cx={point.x}
                      cy={point.y}
                      r={5 / scale}
                    />
                  </g>
                ))}
              </svg>
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
      {tool === 'pen' && (
        <div className="canvas-hint">
          <Icon name={tool === 'pen' ? 'pen' : 'node'} size={15} />
          {tool === 'pen'
            ? pen?.points?.length
              ? 'Click to add a point, drag to curve it. Click the first dot or press Enter to close, Esc to cancel.'
              : 'Click the canvas to start drawing a custom shape.'
            : 'Drag an anchor to move it, a diamond to bend that edge, the round dots to curve it · double-click the outline to add a point · Alt-click to remove one.'}
        </div>
      )}
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
      {pointEditId && (
        <div className="canvas-hint">
          <Icon name="node" size={15} />
          Vector edit � drag a square to move a point, drag the outline to curve it, click the outline to add one � Enter or Esc locks the shape
        </div>
      )}
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







