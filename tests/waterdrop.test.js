/**
 * The water drop shape.
 *
 * A drop is a rectangle whose four corners are *elliptical* — each with its own horizontal
 * and vertical radius — and every edge's radii add up to the whole edge, so there is no
 * straight part left: four arcs meet at the middle of each side. That is what makes it
 * read as water rather than as a rounded rectangle, and it is what these checks hold,
 * along with the wiring that lets text sit inside the drop and the outline breathe.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BLOB_STEPS,
  SHAPE_MAP,
  SHAPES,
  WATER_DROP,
  WATER_DROP_POLYGON,
  WATER_DROP_ROUND,
  blobCss,
  blobPoints,
  blobRadii,
  canWobble,
  clipPathFor,
  shapeBlob,
} from '../src/lib/shapes.js';
import { blobRings, ringsToD, shapeLocalRings } from '../src/lib/paths.js';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const view = readFileSync(new URL('../src/components/ElementView.jsx', import.meta.url), 'utf8');
const inspector = readFileSync(new URL('../src/components/Inspector.jsx', import.meta.url), 'utf8');

/** The corners of the box a blob touches, and how much of it the blob covers. */
function polygonArea(points) {
  let total = 0;
  for (let index = 0; index < points.length; index += 1) {
    const [x0, y0] = points[index];
    const [x1, y1] = points[(index + 1) % points.length];
    total += x0 * y1 - x1 * y0;
  }
  return Math.abs(total) / 2;
}

test('a drop has no straight sides at all', () => {
  const { rx, ry } = WATER_DROP;
  assert.equal(rx.length, 4, 'one horizontal radius per corner');
  assert.equal(ry.length, 4, 'and one vertical');
  for (const value of [...rx, ...ry]) {
    assert.ok(value > 0 && value < 1, `a radius is a fraction of the box (${value})`);
  }
  // Top, bottom, left and right: the two radii that meet along an edge fill it, which is
  // what leaves no straight segment behind.
  assert.equal(rx[0] + rx[1], 1, 'the top edge is all corner');
  assert.equal(rx[2] + rx[3], 1, 'and so is the bottom');
  assert.equal(ry[0] + ry[3], 1, 'the left edge too');
  assert.equal(ry[1] + ry[2], 1, 'and the right');
  // The round shape it breathes towards is the plain ellipse.
  assert.deepEqual(WATER_DROP_ROUND, { rx: [0.5, 0.5, 0.5, 0.5], ry: [0.5, 0.5, 0.5, 0.5] });
});

test('the radii can be mixed between the drop and a circle', () => {
  assert.deepEqual(blobRadii(WATER_DROP, WATER_DROP_ROUND, 0), WATER_DROP, 'nothing moves at 0');
  assert.deepEqual(blobRadii(WATER_DROP, WATER_DROP_ROUND, 1), WATER_DROP_ROUND, 'and it is round at 1');
  const half = blobRadii(WATER_DROP, WATER_DROP_ROUND, 0.5);
  assert.equal(half.rx[0], (WATER_DROP.rx[0] + 0.5) / 2, 'halfway is halfway');
  assert.equal(half.ry[3], (WATER_DROP.ry[3] + 0.5) / 2);
  // And it clamps, so a phase out of range cannot invent a shape.
  assert.deepEqual(blobRadii(WATER_DROP, WATER_DROP_ROUND, -3), WATER_DROP);
  assert.deepEqual(blobRadii(WATER_DROP, WATER_DROP_ROUND, 4), WATER_DROP_ROUND);
  // Halfway is still a valid blob: every edge still fills up.
  assert.equal(half.rx[0] + half.rx[1], 1, 'the top edge is still all corner');
  assert.equal(half.ry[1] + half.ry[2], 1, 'and the right');
});

test('the radii are also written the way CSS writes them', () => {
  assert.equal(blobCss(WATER_DROP), '38% 62% 46% 54% / 46% 51% 49% 54%');
  assert.equal(blobCss(WATER_DROP_ROUND), '50% 50% 50% 50% / 50% 50% 50% 50%');
  // The stylesheet's wobble has to walk between exactly those two strings, or the text
  // inside the drop would drift away from the outline it is clipped by.
test('the drop is traced as a polygon where only a clip will do', () => {
  const points = blobPoints();
  assert.equal(points.length, 4 * (BLOB_STEPS + 1), 'a sampled step per corner');
  for (const [x, y] of points) {
    assert.ok(x >= -0.01 && x <= 100.01, `x stays in the box (${x})`);
    assert.ok(y >= -0.01 && y <= 100.01, `y stays in the box (${y})`);
  }
  // It touches every side of its box — a drop is as wide and as tall as its box.
  assert.ok(Math.min(...points.map(([x]) => x)) < 0.01, 'reaches the left edge');
  assert.ok(Math.max(...points.map(([x]) => x)) > 99.99, 'and the right');
  assert.ok(Math.min(...points.map(([, y]) => y)) < 0.01, 'the top');
  assert.ok(Math.max(...points.map(([, y]) => y)) > 99.99, 'and the bottom');
  // A blob fills most of its box (a rectangle would be 10 000, a circle about 7 854).
  const area = polygonArea(points);
  assert.ok(area > 7500 && area < 8200, `a blob covers most of its box (${Math.round(area)})`);
  // The trace runs around the outline, so neighbouring samples are close together.
  for (let index = 1; index < points.length; index += 1) {
    const step = Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]);
    assert.ok(step < 22, `the outline is followed smoothly (${step.toFixed(1)})`);
  }
  // More steps only ever describe the same shape more finely.
  assert.ok(Math.abs(polygonArea(blobPoints(WATER_DROP, 40)) - area) < 40, 'the finer trace agrees');
});

test('the shape itself is drawn exactly, as a ring of elliptical corners', () => {
  const w = 300;
  const h = 340;
  const rings = blobRings(0, 0, w, h);
  assert.equal(rings.length, 1, 'one ring');
  assert.equal(rings[0].closed, true, 'closed');
  assert.equal(rings[0].points.length, 8, 'two points per corner, as rectRings has');
  for (const point of rings[0].points) {
    assert.ok(point.x >= -0.01 && point.x <= w + 0.01, 'inside the box across');
    assert.ok(point.y >= -0.01 && point.y <= h + 0.01, 'and down');
  }
  // The corners meet at the middle of each edge — that is what "no straight sides" means
  // as geometry: the arc leaving a corner and the arc arriving at the next are the same
  // point, so the outline is four arcs and nothing else.
  const at = (index) => rings[0].points[index];
  assert.ok(Math.abs(at(1).x - at(2).x) < 0.01 && Math.abs(at(1).y - at(2).y) < 0.01, 'top edge, midway');
  assert.ok(Math.abs(at(3).x - at(4).x) < 0.01 && Math.abs(at(3).y - at(4).y) < 0.01, 'right edge');
  assert.ok(Math.abs(at(5).x - at(6).x) < 0.01 && Math.abs(at(5).y - at(6).y) < 0.01, 'bottom edge');
  assert.ok(Math.abs(at(7).x - at(0).x) < 0.01 && Math.abs(at(7).y - at(0).y) < 0.01, 'left edge');
  assert.ok(Math.abs(at(1).x - 0.38 * w) < 1e-9, 'the top edge is met at the top-left radius');
  assert.ok(Math.abs(at(7).y - 0.46 * h) < 1e-9, 'and the left edge at its own');
  // Every handle points at the corner it belongs to, so each arc bulges outwards.
  assert.ok(at(0).out.y < at(0).y, 'the top-left arc leaves the left edge heading for the corner');
  assert.ok(at(1).in.x < at(1).x, 'and arrives on the top edge from the same corner');
  // The radii are what is passed in: the round shape is a different outline…
  const round = blobRings(0, 0, w, h, WATER_DROP_ROUND);
  assert.notEqual(ringsToD(rings), ringsToD(round), 'a circle is not a drop');
  // …but it has the same commands, which is what lets the browser morph between them.
  const commands = (d) => d.replace(/[-\d.]+/g, '#');
  assert.equal(commands(ringsToD(rings)), commands(ringsToD(round)), 'the two paths match command for command');
  // Degenerate radii fall back to a plain rectangle rather than a broken path.
  const square = blobRings(0, 0, 100, 100, { rx: [0, 0, 0, 0], ry: [0, 0, 0, 0] });
  assert.equal(square[0].points.length, 4, 'four square corners');
});

test('a shape element set to the drop is drawn as the drop', () => {
  const rings = shapeLocalRings({ type: 'shape', shape: 'waterDrop', w: 200, h: 240 });
  assert.equal(rings[0].points.length, 8, 'the blob, not a four-point rectangle');
  // It starts where the left edge is met, a little below the top-left corner: 46% of 240.
  assert.equal(rings[0].points[0].x, 0);
  assert.ok(Math.abs(rings[0].points[0].y - 110.4) < 1e-9, 'the drop meets its left edge 46% down');
  assert.match(ringsToD(rings), /^M 0 110\.4/, 'and the path starts there');
  // A picture or a video cropped into the drop uses the same outline.
  assert.equal(shapeLocalRings({ type: 'image', clipShape: 'waterDrop', w: 200, h: 240 })[0].points.length, 8);
  // And every other shape is untouched by any of this.
  assert.equal(shapeLocalRings({ type: 'shape', shape: 'rect', w: 200, h: 240 })[0].points.length, 4);
  assert.equal(shapeLocalRings({ type: 'shape', shape: 'triangle', w: 200, h: 240 })[0].points.length, 3);
});

test('the drop is in the catalogue, and the catalogue knows what it can do', () => {
  const entry = SHAPE_MAP.waterDrop;
  assert.ok(entry, 'it is in the list of shapes');
  assert.equal(entry.label, 'Water drop');
  assert.equal(SHAPES.filter((shape) => shape.blob).length, 1, 'it is the only blob so far');
  assert.equal(shapeBlob('waterDrop'), WATER_DROP, 'its radii come from the catalogue');
  assert.equal(shapeBlob('rect'), null, 'a rectangle is not a blob');
  assert.equal(canWobble('waterDrop'), true);
test('the renderer lets the drop breathe, shine, and hold its text', () => {
  // The outline is morphed by SMIL between the drop and the circle, from the same two
  // paths, so no frame loop and no state is needed — and a thumbnail stays still.
  assert.match(view, /const blob = shapeBlob\(element\.shape\)/);
  assert.match(view, /element\.wobble !== false && !preview && motionAllowed\(\)/);
  assert.match(view, /<animate[\s\S]{0,400}?attributeName="d"/);
  assert.match(view, /values=\{`\$\{d\};\$\{wobbleD\};\$\{d\}`\}/, 'it goes out and comes back');
  assert.match(view, /dur="6s"/, 'slowly, on the same loop the CSS clip uses');
  // Text inside the drop is clipped to the drop, and rides the same wobble.
  assert.match(view, /borderRadius: blobCss\(blob\)/);
  assert.match(view, /animation: textWobble \? 'drop-wobble 6s infinite' : undefined/);
  assert.match(view, /const textWobble = blob && element\.wobble !== false && !preview && motionAllowed\(\)/);
  // The shine is painted only where it makes sense: a filled drop, not a photo or a hole.
  assert.match(view, /const shine = blob && element\.shine !== false && !picture && element\.fill !== 'transparent'/);
  // Reduced motion is honoured rather than assumed away.
  assert.match(view, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.shape-clip-blob \{ animation: none !important; \}/);
  // And the highlights are styled as water, not as opaque dots.
  assert.match(css, /\.shape-shine ellipse \{[\s\S]*?fill: #ffffff;[\s\S]*?opacity: 0\.34;/);
});

test('the inspector offers the drop its two switches', () => {
  assert.match(inspector, /const isBlob = Boolean\(SHAPE_MAP\[kind\]\?\.blob\)/);
  assert.match(inspector, /\{isBlob && \(/);
  assert.match(inspector, /label="Wobble"[\s\S]{0,120}?checked=\{element\.wobble !== false\}/);
  assert.match(inspector, /label="Shine"[\s\S]{0,120}?checked=\{element\.shine !== false\}/);
  // The corner fields stay for rectangles: a drop has its own corners and no radius field.
  assert.match(inspector, /const isRect = !element\.shape \|\| kind === 'rect' \|\| kind === 'roundRect'/);
});

  assert.equal(canWobble('star5'), false);
  // A picture cropped into the drop is clipped with the sampled polygon.
  assert.equal(clipPathFor('waterDrop'), WATER_DROP_POLYGON);
  assert.match(WATER_DROP_POLYGON, /^polygon\(0% 46%, /, 'the trace starts where the left edge is met');
  assert.equal(WATER_DROP_POLYGON.split(',').length, 4 * (BLOB_STEPS + 1), 'one point per sample');
});

  const wobble = css.slice(css.indexOf('@keyframes drop-wobble'), css.indexOf('.shape-clip-blob'));
  assert.match(wobble, new RegExp(`border-radius:\\s*${blobCss(WATER_DROP).replace(/[()/]/g, '\\$&')}`), 'it starts at the drop');
  assert.match(wobble, /border-radius:\s*50% 50% 50% 50% \/ 50% 50% 50% 50%/, 'rounds off in the middle');
  assert.match(wobble, /100% \{[^}]*38% 62% 46% 54%/, 'and comes back');
});
