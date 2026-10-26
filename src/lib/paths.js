/**
 * Vector geometry for custom shapes — the maths behind the pen tool, per-corner
 * rounding and the boolean path operations (union, subtract, intersect, exclude).
 *
 * An outline is a list of *rings*. A ring is
 *
 *   { points: [{ x, y, in?, out? }], closed: true }
 *
 * with absolute coordinates: `in` is the cubic control point towards the previous
 * point and `out` the one towards the next, exactly like an SVG path segment
 * `C p.out p1.in p1`. A ring without handles is a straight polygon.
 *
 * Custom shapes (`shape: 'path'`) store their rings in a 0..100 box — the same
 * normalised space the built-in shapes are drawn in — so an element's x/y/w/h,
 * rotation and every existing resize path keep working untouched. Boolean
 * operations run in slide pixels and the result is normalised back.
 *
 * Everything here is dependency free (no DOM) so it can be unit tested in Node.
 */

import { SHAPE_POINTS } from './shapes.js';

/** Sampling used when a curve has to become a polygon (boolean ops, areas). */
export const CURVE_STEPS = 24;
/** Bezier constant that turns a quarter circle into a cubic. */
const KAPPA = 0.5522847498307936;
/** Coordinates are snapped to this grid before they are compared. */
const SNAP = 1e-4;

/* ------------------------------------------------------------------ *
 * Shapes as rings
 * ------------------------------------------------------------------ */

/** The box custom paths are stored in (the same 0..100 space the presets use). */
export const LOCAL_BOX = 100;

/** The boolean path operations, in the order the tools list them. */
export const SHAPE_OPS = [
  { id: 'union', label: 'Union', icon: 'union', title: 'Merge the selected shapes into one' },
  { id: 'subtract', label: 'Subtract', icon: 'subtract', title: 'Cut the upper shapes out of the lowest one' },
  { id: 'intersect', label: 'Intersect', icon: 'intersect', title: 'Keep only where the shapes overlap' },
  { id: 'exclude', label: 'Exclude', icon: 'exclude', title: 'Keep everything except the overlap' },
];

export const SHAPE_OP_LABELS = Object.fromEntries(SHAPE_OPS.map((op) => [op.id, op.label]));

function cornersOf(element = {}) {
  if (element.corners) return element.corners;
  return element.radius || 0;
}

/**
 * Rings in the element's own box (0..w, 0..h) — what the renderer draws.
 *
 * A picture or a video is clipped by its *clip shape* and rounded by its radius
 * rather than by `shape`, so its outline — and every dot that sits on it — follows
 * what is actually on screen instead of the bare box.
 */
export function shapeLocalRings(element = {}) {
  const w = Number(element.w) || 100;
  const h = Number(element.h) || 100;
  const media = element.type === 'image' || element.type === 'video';
  const shape = media
    ? element.clipShape && element.clipShape !== 'none'
      ? element.clipShape
      : 'rect'
    : element.shape || 'rect';
  if (shape === 'path') {
    const rings = element.path?.rings || [];
    // A path with no geometry yet still has to draw something.
    if (!rings.length) return rectRings(0, 0, w, h, cornersOf(element));
    return mapRings(rings, (point) => ({ x: (point.x / LOCAL_BOX) * w, y: (point.y / LOCAL_BOX) * h }));
  }
  if (shape === 'ellipse') return ellipseRings(0, 0, w, h);
  const points = SHAPE_POINTS[shape];
  if (!points) return rectRings(0, 0, w, h, cornersOf(element));
  const rings = polygonRings(points, 0, 0, w, h);
  return element.cornerRadius ? roundRings(rings, element.cornerRadius) : rings;
}

/** Rings in slide coordinates, rotation included — what boolean ops work on. */
export function shapeRings(element = {}) {
  const x = Number(element.x) || 0;
  const y = Number(element.y) || 0;
  const w = Number(element.w) || 100;
  const h = Number(element.h) || 100;
  const rings = shapeLocalRings(element);
  const moved = translateRings(rings, x, y);
  return element.rotation ? rotateRings(moved, x + w / 2, y + h / 2, element.rotation) : moved;
}

/** True when the element has an outline the shape tools can work on. */
export function isPathShape(element) {
  return element?.type === 'shape';
}

/** Normalise rings into the fields of a custom-path shape element. */
export function ringsToPathShape(rings = [], overrides = {}) {
  const bounds = ringsBounds(rings);
  const w = Math.max(0.5, bounds.w);
  const h = Math.max(0.5, bounds.h);
  const round = (value) => Math.round(value * 1000) / 1000;
  const local = mapRings(rings, (point) => ({
    x: round(((point.x - bounds.x) / w) * LOCAL_BOX),
    y: round(((point.y - bounds.y) / h) * LOCAL_BOX),
  }));
  return {
    shape: 'path',
    x: round(bounds.x),
    y: round(bounds.y),
    w: round(w),
    h: round(h),
    rotation: 0,
    corners: undefined,
    cornerRadius: undefined,
    path: { rings: local },
    ...overrides,
  };
}

/** Rings of a custom path in slide coordinates. */
export function pathRings(element = {}) {
  return shapeRings(element);
}

/**
 * Move one anchor (or handle) of a custom path. `local` is in the element's box.
 * `rings` is the outline the drag started from — a preset shape is converted to a
 * path the moment a dot is grabbed, so the drag has to work from those rings
 * rather than from whatever the element holds now.
 */
export function movePathPoint(element, ringIndex, pointIndex, local, handle = null, rings = null) {
  const next = cloneRings(rings || element.path?.rings || []);
  const ring = next[ringIndex];
  if (!ring) return next;
  const point = ring.points[pointIndex];
  if (!point) return next;
  const target = {
    x: (local.x / (element.w || 1)) * LOCAL_BOX,
    y: (local.y / (element.h || 1)) * LOCAL_BOX,
  };
  if (handle === 'in' || handle === 'out') {
    if (point[handle]) point[handle] = target;
  } else {
    const shift = { x: target.x - point.x, y: target.y - point.y };
    point.x = target.x;
    point.y = target.y;
    // Anchors carry their handles along, the way a node editor expects.
    for (const key of ['in', 'out']) {
      if (point[key]) point[key] = { x: point[key].x + shift.x, y: point[key].y + shift.y };
    }
  }
  return next;
}

/** Drop an anchor out of a ring, keeping at least two points. */
export function removePathPoint(element, ringIndex, pointIndex, rings = null) {
  const next = cloneRings(rings || element.path?.rings || []);
  const ring = next[ringIndex];
  if (!ring) return next;
  const minimum = ring.closed === false ? 2 : 3;
  if ((ring.points || []).length <= minimum) return next;
  ring.points.splice(pointIndex, 1);
  return next;
}

/**
 * Bend one edge of a ring so the curve passes through `target` — what dragging
 * the middle of an edge does in an image editor.
 *
 * A cubic whose two control points sit at `(4P - M) / 3` (P the dragged point, M
 * the middle of the edge) passes exactly through P at its halfway point, so the
 * edge follows the pointer instead of merely leaning towards it.
 */
export function bendRingSegment(ring, segmentIndex, target) {
  const next = cloneRings([ring])[0];
  const points = next.points || [];
  const count = ring.closed === false ? points.length - 1 : points.length;
  if (segmentIndex < 0 || segmentIndex >= count) return next;
  const a = points[segmentIndex];
  const b = points[(segmentIndex + 1) % points.length];
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const control = { x: (4 * target.x - mid.x) / 3, y: (4 * target.y - mid.y) / 3 };
  a.out = { x: control.x, y: control.y };
  b.in = { x: control.x, y: control.y };
  return next;
}

/** The point in the middle of a segment — where its bend handle sits. */
export function ringSegmentMidpoint(ring, segmentIndex) {
  const points = ring?.points || [];
  const count = ring.closed === false ? points.length - 1 : points.length;
  if (segmentIndex < 0 || segmentIndex >= count) return null;
  const a = points[segmentIndex];
  const b = points[(segmentIndex + 1) % points.length];
  if (!a.out && !b.in) return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return cubicAt(a, a.out || a, b.in || b, b, 0.5);
}

/** Straighten an edge again (the inverse of a bend). */
export function straightenRingSegment(ring, segmentIndex) {
  const next = cloneRings([ring])[0];
  const points = next.points || [];
  const count = ring.closed === false ? points.length - 1 : points.length;
  if (segmentIndex < 0 || segmentIndex >= count) return next;
  delete points[segmentIndex].out;
  delete points[(segmentIndex + 1) % points.length].in;
  return next;
}
/**
 * Add an anchor on a segment, splitting the curve so the outline does not move.
 * `t` runs from the start of the segment (0) to its end (1).
 */
export function insertRingPoint(ring, segmentIndex, t) {
  const points = ring?.points || [];
  const count = ring.closed === false ? points.length - 1 : points.length;
  if (segmentIndex < 0 || segmentIndex >= count) return cloneRings([ring])[0];
  const a = points[segmentIndex];
  const b = points[(segmentIndex + 1) % points.length];
  const clamped = Math.min(0.999, Math.max(0.001, t));
  const straight = !a.out && !b.in;
  const next = cloneRings([ring])[0];
  if (straight) {
    next.points.splice(segmentIndex + 1, 0, {
      x: a.x + (b.x - a.x) * clamped,
      y: a.y + (b.y - a.y) * clamped,
    });
    return next;
  }
  // de Casteljau: split the cubic at `t` into two cubics that trace the same curve.
  const c1 = a.out || { x: a.x, y: a.y };
  const c2 = b.in || { x: b.x, y: b.y };
  const lerp = (p, q) => ({ x: p.x + (q.x - p.x) * clamped, y: p.y + (q.y - p.y) * clamped });
  const p01 = lerp(a, c1);
  const p12 = lerp(c1, c2);
  const p23 = lerp(c2, b);
  const p012 = lerp(p01, p12);
  const p123 = lerp(p12, p23);
  const mid = lerp(p012, p123);
  next.points[segmentIndex] = { x: a.x, y: a.y, out: p01 };
  const inserted = { x: mid.x, y: mid.y, in: p012, out: p123 };
  const closing = next.points[(segmentIndex + 1) % next.points.length];
  if (b.in) closing.in = p23;
  next.points.splice(segmentIndex + 1, 0, inserted);
  return next;
}

/**
 * The closest point on an outline: which ring, which segment, how far along it and
 * where. Used to drop a new anchor on the segment the user double-clicked.
 */
export function nearestOnRings(rings = [], target = { x: 0, y: 0 }, steps = CURVE_STEPS) {
  let best = null;
  rings.forEach((ring, ringIndex) => {
    const points = ring.points || [];
    const count = ring.closed === false ? points.length - 1 : points.length;
    for (let index = 0; index < count; index += 1) {
      const a = points[index];
      const b = points[(index + 1) % points.length];
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps;
        const point =
          a.out || b.in
            ? cubicAt(a, a.out || a, b.in || b, b, t)
            : { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        const distance = Math.hypot(point.x - target.x, point.y - target.y);
        if (!best || distance < best.distance) best = { ringIndex, segmentIndex: index, t, point, distance };
      }
    }
  });
  return best;
}


/* ------------------------------------------------------------------ *
 * Building outlines
 * ------------------------------------------------------------------ */

/**
 * Corner radii for a rectangle, in the order Figma shows them: top-left,
 * top-right, bottom-right, bottom-left. Accepts a number, an array or an object.
 * Radii that would overlap on a side are scaled down together, exactly like CSS
 * border-radius does, so a rounded rectangle can never fold over itself.
 */
export function cornerValues(corners, w, h) {
  let list;
  if (Array.isArray(corners)) list = corners.slice(0, 4);
  else if (corners && typeof corners === 'object') list = [corners.tl, corners.tr, corners.br, corners.bl];
  else list = [corners, corners, corners, corners];
  let [tl, tr, br, bl] = list.map((value) => Math.max(0, Number(value) || 0));

  const limit = Math.min(Math.abs(w), Math.abs(h)) / 2;
  let scale = 1;
  const fit = (a, b, side) => {
    const sum = a + b;
    if (sum > side && sum > 0) scale = Math.min(scale, side / sum);
  };
  fit(tl, tr, Math.abs(w));
  fit(bl, br, Math.abs(w));
  fit(tl, bl, Math.abs(h));
  fit(tr, br, Math.abs(h));
  if (scale < 1) [tl, tr, br, bl] = [tl, tr, br, bl].map((value) => value * scale);
  return [tl, tr, br, bl].map((value) => Math.max(0, Math.min(limit, value)));
}

/** A rectangle, with an independent radius per corner, as a bezier ring. */
export function rectRings(x, y, w, h, corners = 0) {
  const [tl, tr, br, bl] = cornerValues(corners, w, h);
  const x1 = x + w;
  const y1 = y + h;
  const points = [];
  const corner = (cx, cy, fromX, fromY, toX, toY, radius) => {
    if (!radius) {
      points.push({ x: fromX, y: fromY });
      return;
    }
    points.push({ x: fromX, y: fromY, out: { x: fromX + (cx - fromX) * KAPPA, y: fromY + (cy - fromY) * KAPPA } });
    points.push({ x: toX, y: toY, in: { x: toX + (cx - toX) * KAPPA, y: toY + (cy - toY) * KAPPA } });
  };
  // Clockwise on screen: each corner is entered from the previous edge and left
  // along the next one, so the arc always bulges towards the corner itself.
  corner(x, y, x, y + tl, x + tl, y, tl);
  corner(x1, y, x1 - tr, y, x1, y + tr, tr);
  corner(x1, y1, x1, y1 - br, x1 - br, y1, br);
  corner(x, y1, x + bl, y1, x, y1 - bl, bl);
  return [{ closed: true, points }];
}

/** An ellipse as four cubic arcs. */
export function ellipseRings(x, y, w, h) {
  const rx = w / 2;
  const ry = h / 2;
  const cx = x + rx;
  const cy = y + ry;
  const ox = rx * KAPPA;
  const oy = ry * KAPPA;
  return [
    {
      closed: true,
      points: [
        { x: cx, y: y, in: { x: cx - ox, y }, out: { x: cx + ox, y } },
        { x: x + w, y: cy, in: { x: x + w, y: cy - oy }, out: { x: x + w, y: cy + oy } },
        { x: cx, y: y + h, in: { x: cx + ox, y: y + h }, out: { x: cx - ox, y: y + h } },
        { x, y: cy, in: { x, y: cy + oy }, out: { x, y: cy - oy } },
      ],
    },
  ];
}

/** A polygon from points given in a 0..100 box (the built-in shape tables). */
export function polygonRings(points100, x = 0, y = 0, w = 100, h = 100) {
  return [ringFromPoints(points100.map(([px, py]) => [x + (px / 100) * w, y + (py / 100) * h]), true)];
}

/**
 * Round the sharp corners of a ring — Figma's corner radius on a polygon or a
 * custom path. A corner is replaced by a small curve that cuts it off; the radius
 * is capped by half of the shorter edge so neighbours can never overlap.
 */
export function roundRing(ring, radius) {
  const points = ring?.points || [];
  const r = Math.max(0, Number(radius) || 0);
  if (!r || points.length < 3 || ring.closed === false || isCurved(ring)) return cloneRings([ring])[0];
  const out = [];
  const unit = (from, to) => {
    const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    return { x: (to.x - from.x) / length, y: (to.y - from.y) / length, length };
  };
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length];
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const back = unit(current, previous);
    const forward = unit(current, next);
    const cut = Math.min(r, back.length / 2, forward.length / 2);
    if (cut <= 0.01) {
      out.push({ x: current.x, y: current.y });
      continue;
    }
    const a = { x: current.x + back.x * cut, y: current.y + back.y * cut };
    const b = { x: current.x + forward.x * cut, y: current.y + forward.y * cut };
    out.push({ x: a.x, y: a.y, out: { x: a.x + (current.x - a.x) * KAPPA, y: a.y + (current.y - a.y) * KAPPA } });
    out.push({ x: b.x, y: b.y, in: { x: b.x + (current.x - b.x) * KAPPA, y: b.y + (current.y - b.y) * KAPPA } });
  }
  return { closed: true, points: out };
}

export function roundRings(rings = [], radius) {
  return rings.map((ring) => roundRing(ring, radius));
}

/** SVG path data for a list of rings. */
export function ringsToD(rings = []) {
  const round = (value) => Math.round(value * 1000) / 1000;
  return rings
    .filter((ring) => (ring.points || []).length >= 2)
    .map((ring) => {
      const points = ring.points;
      let d = `M ${round(points[0].x)} ${round(points[0].y)}`;
      const segments = ring.closed === false ? points.length - 1 : points.length;
      for (let index = 0; index < segments; index += 1) {
        const from = points[index];
        const to = points[(index + 1) % points.length];
        if (from.out || to.in) {
          const c1 = from.out || from;
          const c2 = to.in || to;
          d += ` C ${round(c1.x)} ${round(c1.y)} ${round(c2.x)} ${round(c2.y)} ${round(to.x)} ${round(to.y)}`;
        } else {
          d += ` L ${round(to.x)} ${round(to.y)}`;
        }
      }
      return ring.closed === false ? d : `${d} Z`;
    })
    .join(' ');
}

/* ------------------------------------------------------------------ *
 * Boolean operations
 * ------------------------------------------------------------------ */

const snap = (value) => Math.round(value / SNAP) * SNAP;
const keyOf = (point) => `${snap(point[0])}|${snap(point[1])}`;

/** Parameter of the intersection of segment a→b with c→d, or null when they miss. */
function intersectParams(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]];
  const s = [d[0] - c[0], d[1] - c[1]];
  const denominator = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(denominator) < 1e-12) return null; // parallel or collinear
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / denominator;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / denominator;
  const inside = (value) => value >= -1e-9 && value <= 1 + 1e-9;
  if (!inside(t) || !inside(u)) return null;
  return { t: Math.min(1, Math.max(0, t)), u: Math.min(1, Math.max(0, u)) };
}

/** Cut one polygon into its edges, subdivided at the given `t` values. */
function splitPolyline(poly, cuts) {
  const pieces = [];
  for (let index = 0; index < poly.length; index += 1) {
    const a = poly[index];
    const b = poly[(index + 1) % poly.length];
    const params = [0, ...cuts.filter((cut) => cut.edge === index).map((cut) => cut.t).sort((m, n) => m - n), 1];
    for (let step = 0; step < params.length - 1; step += 1) {
      const t0 = Math.min(1, Math.max(0, params[step]));
      const t1 = Math.min(1, Math.max(0, params[step + 1]));
      if (t1 - t0 < 1e-9) continue;
      pieces.push([
        [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0],
        [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1],
      ]);
    }
  }
  return pieces;
}

/** Where a point projects onto the line through a→b, or null when it is off it. */
function projectionOnLine(a, b, point) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (length < 1e-9) return null;
  const offset = ((point[0] - a[0]) * dy - (point[1] - a[1]) * dx) / length;
  if (Math.abs(offset) > 1e-6) return null;
  return ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (length * length);
}

/** Split every polygon of `subject` against every polygon of `clip`. */
function splitAgainst(subject, clip) {
  const cuts = subject.map(() => []);
  for (let s = 0; s < subject.length; s += 1) {
    const poly = subject[s];
    for (let index = 0; index < poly.length; index += 1) {
      const a = poly[index];
      const b = poly[(index + 1) % poly.length];
      for (const other of clip) {
        for (let j = 0; j < other.length; j += 1) {
          const c = other[j];
          const d = other[(j + 1) % other.length];
          const hit = intersectParams(a, b, c, d);
          if (hit) {
            cuts[s].push({ edge: index, t: hit.t });
            continue;
          }
          // Collinear edges are cut at each other's ends, so a shared stretch ends
          // up as an identical segment on both sides instead of a fuzzy overlap.
          for (const point of [c, d]) {
            const t = projectionOnLine(a, b, point);
            if (t !== null) cuts[s].push({ edge: index, t });
          }
        }
      }
    }
  }
  return subject.map((poly, index) => splitPolyline(poly, cuts[index]));
}

function midpoint(segment) {
  return { x: (segment[0][0] + segment[1][0]) / 2, y: (segment[0][1] + segment[1][1]) / 2 };
}

/** A point just off the middle of a segment, on one side of the direction of travel. */
function sidePoint(segment, sign, distance = 1e-3) {
  const dx = segment[1][0] - segment[0][0];
  const dy = segment[1][1] - segment[0][1];
  const length = Math.hypot(dx, dy) || 1;
  const mid = midpoint(segment);
  return { x: mid.x + (-dy / length) * distance * sign, y: mid.y + (dx / length) * distance * sign };
}

/**
 * True when two shapes overlap along a shared edge — the clip's interior is on the
 * same side as the subject's, rather than the two merely touching.
 */
function overlapAlongEdge(segment, subjectPolys, clipPolys) {
  const right = sidePoint(segment, 1);
  const interior = pointInPolylines(right, subjectPolys) ? right : sidePoint(segment, -1);
  return pointInPolylines(interior, clipPolys);
}

/** Inside a shape, ignoring points that sit exactly on its outline. */
function insideStrict(point, polys) {
  if (onPolylinesBoundary(point, polys)) return false;
  return pointInPolylines(point, polys);
}

/** Two shapes drawn on top of each other — the classic degenerate boolean case. */
function sameOutline(a, b, tol = 1e-6) {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    const ringA = a[index];
    const ringB = b[index];
    if (ringA.length !== ringB.length) return false;
    for (let point = 0; point < ringA.length; point += 1) {
      if (Math.hypot(ringA[point][0] - ringB[point][0], ringA[point][1] - ringB[point][1]) > tol) return false;
    }
  }
  return true;
}

/**
 * Walk the surviving segments into rings. At a junction the straightest
 * continuation is taken, which is what traces the outline of the result.
 */
function chainSegments(segments) {
  const outgoing = new Map();
  segments.forEach((segment, index) => {
    const key = keyOf(segment[0]);
    if (!outgoing.has(key)) outgoing.set(key, []);
    outgoing.get(key).push(index);
  });
  const used = new Array(segments.length).fill(false);
  const rings = [];
  for (let start = 0; start < segments.length; start += 1) {
    if (used[start]) continue;
    const points = [];
    let current = start;
    let guard = 0;
    while (current !== undefined && current !== null && !used[current] && guard <= segments.length) {
      guard += 1;
      used[current] = true;
      points.push(segments[current][0]);
      const end = segments[current][1];
      const candidates = (outgoing.get(keyOf(end)) || []).filter((index) => !used[index]);
      if (!candidates.length) break;
      if (candidates.length === 1) {
        current = candidates[0];
        continue;
      }
      const direction = [end[0] - segments[current][0][0], end[1] - segments[current][0][1]];
      const length = Math.hypot(direction[0], direction[1]) || 1;
      let best = candidates[0];
      let bestDot = -Infinity;
      for (const candidate of candidates) {
        const next = segments[candidate][1];
        const dot =
          (direction[0] / length) * ((next[0] - end[0]) / length) +
          (direction[1] / length) * ((next[1] - end[1]) / length);
        if (dot > bestDot) {
          bestDot = dot;
          best = candidate;
        }
      }
      current = best;
    }
    const clean = simplifyPolyline(points);
    if (clean.length >= 3) rings.push(clean);
  }
  return rings;
}

export function polylinesToRings(polys = []) {
  return polys.map((poly) => ({ closed: true, points: poly.map(([x, y]) => ({ x, y })) }));
}

/** One boolean step between two flattened shapes (arrays of polygons). */
export function polygonBoolean(subject, clip, op) {
  if (!subject.length) return op === 'union' ? clip.map((poly) => poly.slice()) : [];
  if (!clip.length) return op === 'intersect' ? [] : subject.map((poly) => poly.slice());

  if (op === 'exclude') {
    // Union minus intersection is exactly what an even-odd fill of both draws.
    return [...subject.map((poly) => poly.slice()), ...clip.map((poly) => poly.slice())];
  }

  if (sameOutline(subject, clip)) {
    if (op === 'union' || op === 'intersect') return subject.map((poly) => poly.slice());
    return [];
  }

  const keep = [];
  for (const segment of splitAgainst(subject, clip).flat()) {
    const mid = midpoint(segment);
    const interior = insideStrict(mid, clip);
    // A shared edge lies on the other outline too: it belongs to a union and to an
    // intersection, and a subtraction keeps it only when the two shapes merely
    // touch along it (rather than overlapping).
    const shared = !interior && onPolylinesBoundary(mid, clip);
    if (op === 'union' && !interior) keep.push(segment);
    else if (op === 'intersect' && (interior || shared)) keep.push(segment);
    else if (op === 'subtract' && !interior && (!shared || !overlapAlongEdge(segment, subject, clip))) {
      keep.push(segment);
    }
  }
  for (const segment of splitAgainst(clip, subject).flat()) {
    const mid = midpoint(segment);
    const interior = insideStrict(mid, subject);
    if (op === 'union' && !interior) keep.push(segment);
    else if (op === 'intersect' && interior) keep.push(segment);
    // A subtracted shape is cut out of the base, so its inner edges run the other way.
    else if (op === 'subtract' && interior) keep.push([segment[1], segment[0]]);
  }

  return chainSegments(keep);
}

/** Boolean operation between two shapes given as rings (curves are flattened). */
export function booleanRings(aRings, bRings, op, steps = CURVE_STEPS) {
  const subject = ringsPolylines(aRings, steps);
  const clip = ringsPolylines(bRings, steps);
  return polylinesToRings(polygonBoolean(subject, clip, op));
}

/** Fold a list of shapes with one operation, bottom-most first. */
export function booleanMany(ringSets = [], op, steps = CURVE_STEPS) {
  const flattened = ringSets.map((rings) => ringsPolylines(rings, steps));
  if (!flattened.length) return [];
  let result = flattened[0];
  for (let index = 1; index < flattened.length; index += 1) {
    result = polygonBoolean(result, flattened[index], op);
    if (!result.length && op !== 'union') break;
  }
  return polylinesToRings(result);
}

/* ------------------------------------------------------------------ *
 * Rings
 * ------------------------------------------------------------------ */

/** Build a ring from `[[x, y], …]` pairs. */
export function ringFromPoints(points, closed = true) {
  return { closed, points: points.map(([x, y]) => ({ x, y })) };
}

export function cloneRings(rings = []) {
  return rings.map((ring) => ({
    closed: ring.closed !== false,
    points: (ring.points || []).map((point) => {
      const copy = { x: point.x, y: point.y };
      if (point.in) copy.in = { x: point.in.x, y: point.in.y };
      if (point.out) copy.out = { x: point.out.x, y: point.out.y };
      return copy;
    }),
  }));
}

/** Map every point (and handle) of every ring. */
export function mapRings(rings = [], fn) {
  const mapPoint = (point) => {
    const moved = fn({ x: point.x, y: point.y });
    const out = { x: moved.x, y: moved.y };
    if (point.in) out.in = fn({ x: point.in.x, y: point.in.y });
    if (point.out) out.out = fn({ x: point.out.x, y: point.out.y });
    return out;
  };
  return rings.map((ring) => ({ closed: ring.closed !== false, points: (ring.points || []).map(mapPoint) }));
}

export function translateRings(rings, dx, dy) {
  return mapRings(rings, (point) => ({ x: point.x + dx, y: point.y + dy }));
}

/** Rotate rings around a centre by `degrees` (screen coordinates, y downwards). */
export function rotateRings(rings, cx, cy, degrees) {
  const angle = (Number(degrees) || 0) * (Math.PI / 180);
  if (!angle) return cloneRings(rings);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return mapRings(rings, (point) => {
    const dx = point.x - cx;
    const dy = point.y - cy;
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
  });
}

/**
 * Bounds of the rings. `handles` includes the bezier control points, which is what
 * an editor wants when it has to keep them on screen; the curve itself always stays
 * inside the box of its points and handles, so both answers are safe.
 */
export function ringsBounds(rings = [], { handles = false } = {}) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x, y) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const ring of rings) {
    for (const point of ring.points || []) {
      add(point.x, point.y);
      if (handles) {
        if (point.in) add(point.in.x, point.in.y);
        if (point.out) add(point.out.x, point.out.y);
      }
    }
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** True when the ring has at least one bezier handle. */
export function isCurved(ring) {
  return (ring.points || []).some((point) => point.in || point.out);
}

function cubicAt(p0, c1, c2, p1, t) {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p1.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p1.y,
  };
}

/** Flatten one ring into `[[x, y], …]`, sampling curves `steps` times. */
export function ringPolyline(ring, steps = CURVE_STEPS) {
  const points = ring?.points || [];
  if (points.length < 2) return points.map((point) => [point.x, point.y]);
  const closed = ring.closed !== false;
  const out = [[points[0].x, points[0].y]];
  const segments = closed ? points.length : points.length - 1;
  for (let index = 0; index < segments; index += 1) {
    const from = points[index];
    const to = points[(index + 1) % points.length];
    if (from.out || to.in) {
      const c1 = from.out || { x: from.x, y: from.y };
      const c2 = to.in || { x: to.x, y: to.y };
      for (let step = 1; step <= steps; step += 1) {
        const point = cubicAt(from, c1, c2, to, step / steps);
        out.push([point.x, point.y]);
      }
    } else {
      out.push([to.x, to.y]);
    }
  }
  if (closed && out.length > 1) out.pop();
  return out;
}

export function ringsPolylines(rings = [], steps = CURVE_STEPS) {
  return rings.map((ring) => ringPolyline(ring, steps)).filter((poly) => poly.length >= 3);
}

/** Signed area of a polygon (positive when the points run clockwise on screen). */
export function polylineArea(poly = []) {
  let total = 0;
  for (let index = 0; index < poly.length; index += 1) {
    const [x1, y1] = poly[index];
    const [x2, y2] = poly[(index + 1) % poly.length];
    total += x1 * y2 - x2 * y1;
  }
  return total / 2;
}

/** Even-odd area of a set of polygons — holes count negative, overlaps cancel. */
export function polylinesArea(polys = []) {
  return Math.abs(polys.reduce((total, poly) => total + polylineArea(poly), 0));
}

function onSegment(point, a, b, tol) {
  const cross = (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]);
  if (Math.abs(cross) > tol * Math.max(1, Math.hypot(b[0] - a[0], b[1] - a[1]))) return false;
  const dot = (point[0] - a[0]) * (b[0] - a[0]) + (point[1] - a[1]) * (b[1] - a[1]);
  if (dot < -tol) return false;
  return dot <= (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 + tol;
}

/** True when a point sits on the outline of any polygon (used to dodge degeneracies). */
export function onPolylinesBoundary(point, polys = [], tol = 1e-6) {
  const x = point.x ?? point[0];
  const y = point.y ?? point[1];
  for (const poly of polys) {
    for (let index = 0; index < poly.length; index += 1) {
      if (onSegment([x, y], poly[index], poly[(index + 1) % poly.length], tol)) return true;
    }
  }
  return false;
}

/** Ray casting: is the point inside this polygon? A point on the edge counts as outside. */
export function pointInPolyline(point, poly = []) {
  const x = point.x ?? point[0];
  const y = point.y ?? point[1];
  let inside = false;
  for (let index = 0, previous = poly.length - 1; index < poly.length; previous = index, index += 1) {
    const [xi, yi] = poly[index];
    const [xj, yj] = poly[previous];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Even-odd test across a whole shape (holes and overlaps behave like the fill). */
export function pointInPolylines(point, polys = []) {
  return polys.reduce((inside, poly) => (pointInPolyline(point, poly) ? !inside : inside), false);
}

/** Drop repeated and collinear points so results stay compact. */
export function simplifyPolyline(poly = [], tol = SNAP) {
  const out = [];
  for (const point of poly) {
    const last = out[out.length - 1];
    if (last && Math.abs(last[0] - point[0]) < tol && Math.abs(last[1] - point[1]) < tol) continue;
    out.push([point[0], point[1]]);
  }
  while (out.length > 1) {
    const first = out[0];
    const last = out[out.length - 1];
    if (Math.abs(first[0] - last[0]) < tol && Math.abs(first[1] - last[1]) < tol) out.pop();
    else break;
  }
  if (out.length < 4) return out;
  const clean = [];
  for (let index = 0; index < out.length; index += 1) {
    const previous = out[(index - 1 + out.length) % out.length];
    const current = out[index];
    const next = out[(index + 1) % out.length];
    const cross = (current[0] - previous[0]) * (next[1] - current[1]) - (current[1] - previous[1]) * (next[0] - current[0]);
    if (Math.abs(cross) > tol) clean.push(current);
  }
  return clean.length >= 3 ? clean : out;
}
