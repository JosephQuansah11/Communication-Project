/**
 * A water drop's outline: a rectangle whose corners are **elliptical** — each corner has
 * its own horizontal and vertical radius — which is what gives a blob its bulge. The
 * numbers are fractions of the box, the same shape CSS writes as
 * `border-radius: 38% 62% 46% 54% / 46% 51% 49% 54%`.
 *
 * Every edge's radii add up to 100%, so the sides have no straight part at all: four
 * arcs meet at the middle of each edge, and that is what makes it read as water rather
 * than as a rounded rectangle.
 */
export const WATER_DROP = {
  rx: [0.38, 0.62, 0.46, 0.54],
  ry: [0.46, 0.51, 0.49, 0.54],
};

/** The round shape a drop breathes towards, and back from. */
export const WATER_DROP_ROUND = { rx: [0.5, 0.5, 0.5, 0.5], ry: [0.5, 0.5, 0.5, 0.5] };

/** How many points a step traces around one corner of the polygon approximation. */
export const BLOB_STEPS = 10;

/** Two sets of radii mixed together, `t` = 0 for the first and 1 for the second. */
export function blobRadii(from = WATER_DROP, to = WATER_DROP_ROUND, t = 0) {
  const mix = Math.min(1, Math.max(0, t));
  return {
    rx: from.rx.map((value, index) => value + (to.rx[index] - value) * mix),
    ry: from.ry.map((value, index) => value + (to.ry[index] - value) * mix),
  };
}

/** The radii as the CSS `border-radius` shorthand: `38% 62% 46% 54% / 46% 51% 49% 54%`. */
export function blobCss(radii = WATER_DROP) {
  const percent = (values) => values.map((value) => `${Math.round(value * 1000) / 10}%`).join(' ');
  return `${percent(radii.rx)} / ${percent(radii.ry)}`;
}

/**
 * One corner of a blob: a quarter ellipse, sampled `steps` times, from the point where it
 * leaves one edge to the point where it meets the next.
 *
 * `sx`/`sy` say which way the corner lies from the middle of the box, and `swap` says which
 * of the two edges the arc leaves first — the two together keep the trace running clockwise
 * round the outline, so the polygon is a single closed loop rather than four arcs joined by
 * diagonals.
 */
function cornerPoints(cx, cy, rx, ry, sx, sy, steps, swap) {
  const points = [];
  for (let step = 0; step <= steps; step += 1) {
    const angle = (Math.PI / 2) * (step / steps);
    const along = swap ? Math.sin(angle) : Math.cos(angle);
    const across = swap ? Math.cos(angle) : Math.sin(angle);
    points.push([cx + sx * rx * (1 - along), cy + sy * ry * (1 - across)]);
  }
  return points;
}

/**
 * The blob as a polygon in a 0..100 box, for the places that can only take a
 * `clip-path` — a picture cropped into the shape, and the shape's thumbnail.
 *
 * The curves are sampled rather than exact, so this is the one place the shape is an
 * approximation; the shape itself is drawn from `blobRings` and is exact.
 */
export function blobPoints(radii = WATER_DROP, steps = BLOB_STEPS) {
  const [tlx, trx, brx, blx] = radii.rx.map((value) => value * 100);
  const [tly, tryy, bry, bly] = radii.ry.map((value) => value * 100);
  return [
    ...cornerPoints(0, 0, tlx, tly, 1, 1, steps, false),
    ...cornerPoints(100, 0, trx, tryy, -1, 1, steps, true),
    ...cornerPoints(100, 100, brx, bry, -1, -1, steps, false),
    ...cornerPoints(0, 100, blx, bly, 1, -1, steps, true),
  ];
}

export const WATER_DROP_POLYGON = `polygon(${blobPoints()
  .map(([x, y]) => `${Math.round(x * 100) / 100}% ${Math.round(y * 100) / 100}%`)
  .join(', ')})`;

export const SHAPES = [
  { id: 'rect', label: 'Rectangle', css: null },
  { id: 'roundRect', label: 'Rounded rectangle', css: null, radius: true },
  { id: 'ellipse', label: 'Ellipse', css: 'ellipse(50% 50% at 50% 50%)' },
  { id: 'triangle', label: 'Triangle', css: 'polygon(50% 0%, 100% 100%, 0% 100%)' },
  { id: 'diamond', label: 'Diamond', css: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' },
  {
    id: 'star5',
    label: 'Star',
    css: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
  },
  {
    id: 'star4',
    label: 'Sparkle',
    css: 'polygon(50% 0%, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0% 50%, 38% 38%)',
  },
  {
    id: 'hexagon',
    label: 'Hexagon',
    css: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)',
  },
  {
    id: 'pentagon',
    label: 'Pentagon',
    css: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)',
  },
  {
    id: 'chevron',
    label: 'Chevron',
    css: 'polygon(0% 0%, 75% 0%, 100% 50%, 75% 100%, 0% 100%, 25% 50%)',
  },
  {
    id: 'rightArrow',
    label: 'Arrow right',
    css: 'polygon(0% 20%, 60% 20%, 60% 0%, 100% 50%, 60% 100%, 60% 80%, 0% 80%)',
  },
  {
    id: 'leftArrow',
    label: 'Arrow left',
    css: 'polygon(40% 20%, 100% 20%, 100% 80%, 40% 80%, 40% 100%, 0% 50%, 40% 0%)',
  },
  {
    id: 'plus',
    label: 'Plus',
    css: 'polygon(35% 0%, 65% 0%, 65% 35%, 100% 35%, 100% 65%, 65% 65%, 65% 100%, 35% 100%, 35% 65%, 0% 65%, 0% 35%, 35% 35%)',
  },
  {
    id: 'parallelogram',
    label: 'Parallelogram',
    css: 'polygon(20% 0%, 100% 0%, 80% 100%, 0% 100%)',
  },
  {
    id: 'trapezoid',
    label: 'Trapezoid',
    css: 'polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)',
  },
  {
    id: 'waterDrop',
    label: 'Water drop',
    // A picture cropped into the drop can only be clipped with a polygon, so this is the
    // sampled outline; the shape itself is drawn exactly, from its radii.
    css: WATER_DROP_POLYGON,
    /** Shapes with elliptical corners of their own: the drop, and anything like it. */
    blob: WATER_DROP,
    /** Offered a slow wobble between the drop and a circle. */
    wobble: true,
  },
];

export const SHAPE_MAP = Object.fromEntries(SHAPES.map((shape) => [shape.id, shape]));

export function clipPathFor(shapeId) {
  const shape = SHAPE_MAP[shapeId];
  return shape?.css || null;
}

export function isRound(shapeId) {
  return shapeId === 'roundRect';
}

/** The elliptical corner radii a shape is drawn with, or null if it has none. */
export function shapeBlob(shapeId) {
  return SHAPE_MAP[shapeId]?.blob || null;
}

/** Whether a shape is offered the water wobble. */
export function canWobble(shapeId) {
  return Boolean(SHAPE_MAP[shapeId]?.wobble);
}

const STAR5 = [
  [50, 0], [61, 35], [98, 35], [68, 57], [79, 91], [50, 70], [21, 91], [32, 57], [2, 35], [39, 35],
];
const STAR4 = [[50, 0], [62, 38], [100, 50], [62, 62], [50, 100], [38, 62], [0, 50], [38, 38]];
const HEX = [[25, 0], [75, 0], [100, 50], [75, 100], [25, 100], [0, 50]];
const PENT = [[50, 0], [100, 38], [82, 100], [18, 100], [0, 38]];
const CHEVRON = [[0, 0], [75, 0], [100, 50], [75, 100], [0, 100], [25, 50]];
const ARROW_R = [[0, 20], [60, 20], [60, 0], [100, 50], [60, 100], [60, 80], [0, 80]];
const ARROW_L = [[40, 20], [100, 20], [100, 80], [40, 80], [40, 100], [0, 50], [40, 0]];
const PLUS = [
  [35, 0], [65, 0], [65, 35], [100, 35], [100, 65], [65, 65], [65, 100], [35, 100], [35, 65], [0, 65], [0, 35], [35, 35],
];
const PARALLELOGRAM = [[20, 0], [100, 0], [80, 100], [0, 100]];
const TRAPEZOID = [[20, 0], [80, 0], [100, 100], [0, 100]];
const TRIANGLE = [[50, 0], [100, 100], [0, 100]];
const DIAMOND = [[50, 0], [100, 50], [50, 100], [0, 50]];

export const SHAPE_POINTS = {
  triangle: TRIANGLE,
  diamond: DIAMOND,
  star5: STAR5,
  star4: STAR4,
  hexagon: HEX,
  pentagon: PENT,
  chevron: CHEVRON,
  rightArrow: ARROW_R,
  leftArrow: ARROW_L,
  plus: PLUS,
  parallelogram: PARALLELOGRAM,
  trapezoid: TRAPEZOID,
};

export function pointsAttr(shapeId) {
  return (SHAPE_POINTS[shapeId] || []).map(([x, y]) => `${x},${y}`).join(' ');
}
