import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bendRingSegment,
  booleanMany,
  booleanRings,
  cornerValues,
  ellipseRings,
  movePathPoint,
  pointInPolylines,
  polylineArea,
  polygonBoolean,
  rectRings,
  ringFromPoints,
  shapeLocalRings,
  ringPolyline,
  ringsBounds,
  ringsPolylines,
  ringsToD,
  ringSegmentMidpoint,
  ringsToPathShape,
  rotateRings,
  straightenRingSegment,
  roundRings,
  shapeRings,
  simplifyPolyline,
} from '../src/lib/paths.js';

const box = { x: 0, y: 0, w: 200, h: 200 };

/** Area of a shape, measured the way the renderer fills it (even-odd). */
function coverage(polys, area = box, steps = 240) {
  let inside = 0;
  for (let i = 0; i < steps; i += 1) {
    for (let j = 0; j < steps; j += 1) {
      const x = area.x + ((i + 0.5) / steps) * area.w;
      const y = area.y + ((j + 0.5) / steps) * area.h;
      if (pointInPolylines({ x, y }, polys)) inside += 1;
    }
  }
  return (inside / (steps * steps)) * area.w * area.h;
}

const square = (x, y, size) => rectRings(x, y, size, size, 0);

test('a rectangle with four independent corner radii keeps its box', () => {
  const rings = rectRings(10, 20, 100, 60, { tl: 20, tr: 0, br: 10, bl: 5 });
  const bounds = ringsBounds(rings);
  assert.deepEqual([bounds.x, bounds.y, bounds.w, bounds.h], [10, 20, 100, 60]);
  // The rounded corners cut the outline, so the sharp corner is no longer inside.
  assert.equal(pointInPolylines({ x: 11, y: 21 }, ringsPolylines(rings)), false);
  assert.equal(pointInPolylines({ x: 12, y: 22 }, ringsPolylines(rings)), false);
  // …but the middle of the top edge still is.
  assert.equal(pointInPolylines({ x: 60, y: 22 }, ringsPolylines(rings)), true);
});

test('corner radii are scaled down like CSS when they would overlap', () => {
  assert.deepEqual(cornerValues([200, 200, 0, 0], 100, 100), [50, 50, 0, 0]);
  // Two 60px corners on a 100px side share it: they scale to 50 each.
  assert.deepEqual(cornerValues([60, 60, 60, 60], 100, 100), [50, 50, 50, 50]);
  assert.deepEqual(cornerValues(20, 100, 100), [20, 20, 20, 20]);
  assert.deepEqual(cornerValues({ tl: 10 }, 100, 100), [10, 0, 0, 0]);
  assert.deepEqual(cornerValues(-5, 100, 100), [0, 0, 0, 0]);
});

test('an ellipse flattens to about pi r squared', () => {
  const rings = ellipseRings(0, 0, 100, 100);
  const polys = ringsPolylines(rings, 32);
  const area = coverage(polys, { x: -2, y: -2, w: 104, h: 104 }, 300);
  assert.ok(Math.abs(area - Math.PI * 50 * 50) < 60, `area was ${area}`);
  const bounds = ringsBounds(rings);
  assert.deepEqual([bounds.x, bounds.y, bounds.w, bounds.h], [0, 0, 100, 100]);
});

test('path data closes rings and writes curves', () => {
  const d = ringsToD(rectRings(0, 0, 10, 10, 4));
  assert.ok(d.startsWith('M '));
  assert.ok(d.includes(' C '));
  assert.ok(d.endsWith('Z'));
  const straight = ringsToD(square(0, 0, 10));
  assert.ok(straight.includes(' L '));
  assert.ok(!straight.includes(' C '));
});

/* ------------------------------------------------------------------ *
 * Boolean operations
 * ------------------------------------------------------------------ */

/** Is the point inside the shape, filled the way the renderer fills it? */
const inside = (point, rings) => pointInPolylines(point, ringsPolylines(rings, 8));

/** Exact even-odd area of non-overlapping rings (holes subtract). */
function areaOf(rings) {
  const polys = ringsPolylines(rings, 32);
  return Math.abs(
    polys.reduce((total, poly) => {
      // A vertex of the ring is a safe probe: rings never cross, so it is either
      // inside another ring or outside it, and it is never inside its own hole.
      const probe = { x: poly[0][0], y: poly[0][1] };
      const depth = polys.reduce((count, other) => (other === poly ? count : count + (pointInPolylines(probe, [other]) ? 1 : 0)), 0);
      return total + (depth % 2 ? -1 : 1) * Math.abs(polylineArea(poly));
    }, 0)
  );
}

const ops = (a, b) => ({
  union: areaOf(booleanRings(a, b, 'union')),
  intersect: areaOf(booleanRings(a, b, 'intersect')),
  subtract: areaOf(booleanRings(a, b, 'subtract')),
  exclude: coverage(ringsPolylines(booleanRings(a, b, 'exclude')), { x: -10, y: -10, w: 420, h: 220 }, 420),
});

const near = (actual, expected, tolerance = 1) => assert.ok(
  Math.abs(actual - expected) <= tolerance,
  `expected ${expected}, measured ${actual}`
);

test('two overlapping squares union, subtract, intersect and exclude', () => {
  // A is 0..100, B is 50..150, so they share a 50x100 strip.
  const result = ops(square(0, 0, 100), square(50, 0, 100));
  near(result.union, 15000);
  near(result.intersect, 5000);
  near(result.subtract, 5000);
  near(result.exclude, 10000, 260);
  // The overlap belongs to the union, not to the subtraction.
  const union = booleanRings(square(0, 0, 100), square(50, 0, 100), 'union');
  const subtract = booleanRings(square(0, 0, 100), square(50, 0, 100), 'subtract');
  assert.equal(pointInPolylines({ x: 75, y: 50 }, ringsPolylines(union, 4)), true);
  assert.equal(pointInPolylines({ x: 75, y: 50 }, ringsPolylines(subtract, 4)), false);
  assert.equal(pointInPolylines({ x: 25, y: 50 }, ringsPolylines(subtract, 4)), true);
});

test('two shapes that only touch keep both outlines', () => {
  // Side by side, sharing the edge at x = 100.
  const union = booleanRings(square(0, 0, 100), square(100, 0, 100), 'union');
  near(areaOf(union), 20000);
  assert.equal(pointInPolylines({ x: 50, y: 50 }, ringsPolylines(union, 4)), true);
  assert.equal(pointInPolylines({ x: 150, y: 50 }, ringsPolylines(union, 4)), true);
  // Nothing overlaps, so a subtraction leaves the base alone.
  near(areaOf(booleanRings(square(0, 0, 100), square(100, 0, 100), 'subtract')), 10000);
  near(areaOf(booleanRings(square(0, 0, 100), square(100, 0, 100), 'intersect')), 0);
  // Stacked on top of each other, sharing the edge at y = 100.
  near(areaOf(booleanRings(square(0, 0, 100), square(0, 100, 100), 'union')), 20000);
  near(areaOf(booleanRings(square(0, 0, 100), square(0, 100, 100), 'subtract')), 10000);
});

test('shapes that do not touch stay whole', () => {
  const result = ops(square(0, 0, 100), square(200, 0, 100));
  near(result.union, 20000);
  near(result.intersect, 0);
  near(result.subtract, 10000);
  near(result.exclude, 20000, 260);
});

test('a shape inside another one leaves a hole when subtracted', () => {
  const result = ops(square(0, 0, 100), square(25, 25, 50));
  near(result.union, 10000);
  near(result.intersect, 2500);
  near(result.subtract, 7500);
  near(result.exclude, 7500, 260);
  // The hole is really empty, and the frame around it is still filled.
  const subtract = booleanRings(square(0, 0, 100), square(25, 25, 50), 'subtract');
  assert.equal(ringsPolylines(subtract).length, 2);
  assert.equal(pointInPolylines({ x: 50, y: 50 }, ringsPolylines(subtract)), false);
  assert.equal(pointInPolylines({ x: 10, y: 50 }, ringsPolylines(subtract)), true);
});

test('the same shape twice collapses instead of doubling', () => {
  const result = ops(square(0, 0, 100), square(0, 0, 100));
  near(result.union, 10000);
  near(result.intersect, 10000);
  near(result.subtract, 0);
  near(result.exclude, 0, 260);
});

test('a circle and a square combine', () => {
  const circle = ellipseRings(50, 0, 100, 100);
  const result = ops(square(0, 0, 100), circle);
  // Half of the circle sits over the square, so the overlap is half of it.
  near(result.intersect, (2500 * Math.PI) / 2, 120);
  near(result.union, 10000 + 2500 * Math.PI - result.intersect, 120);
  near(result.subtract, 10000 - result.intersect, 120);
});

test('three shapes fold together', () => {
  // (0,0)+(50,0) give a 150x100 slab; the third square adds its top half.
  const rings = booleanMany([square(0, 0, 100), square(50, 0, 100), square(25, 50, 100)], 'union');
  near(areaOf(rings), 20000, 2);
  const cut = booleanMany([square(0, 0, 200), square(50, 50, 100), square(0, 0, 10)], 'subtract');
  near(areaOf(cut), 40000 - 10000 - 100, 2);
});

/* ------------------------------------------------------------------ *
 * Shape elements
 * ------------------------------------------------------------------ */

test('rounding a polygon corner cuts it off', () => {
  const sharp = square(0, 0, 100);
  const rounded = roundRings(sharp, 20);
  const bounds = ringsBounds(rounded);
  assert.deepEqual([bounds.x, bounds.y, bounds.w, bounds.h], [0, 0, 100, 100]);
  assert.ok(areaOf(rounded) < 10000, 'rounding must remove material');
  assert.ok(areaOf(rounded) > 9400, 'a 20px radius only shaves the corners');
  assert.equal(pointInPolylines({ x: 1, y: 1 }, ringsPolylines(rounded, 8)), false);
  assert.equal(pointInPolylines({ x: 50, y: 1 }, ringsPolylines(rounded, 8)), true);
});

test('every shape kind becomes rings that fill its box', () => {
  const rect = { type: 'shape', shape: 'rect', x: 10, y: 20, w: 100, h: 60 };
  assert.deepEqual(ringsBounds(shapeRings(rect)), { x: 10, y: 20, w: 100, h: 60 });
  const star = { type: 'shape', shape: 'star5', x: 0, y: 0, w: 100, h: 100 };
  const starBounds = ringsBounds(shapeRings(star));
  assert.ok(starBounds.x >= 0 && starBounds.y >= 0);
  assert.ok(starBounds.x + starBounds.w <= 100 && starBounds.y + starBounds.h <= 100);
  assert.ok(areaOf(shapeRings(star)) < 6000, 'a star covers far less than its box');
  assert.equal(inside({ x: 50, y: 50 }, shapeRings(star)), true);
  const round = { type: 'shape', shape: 'star5', x: 0, y: 0, w: 100, h: 100, cornerRadius: 8 };
  assert.ok(areaOf(shapeRings(round)) > areaOf(shapeRings(star)), 'rounding adds area back');
  const circle = { type: 'shape', shape: 'ellipse', x: 0, y: 0, w: 100, h: 100 };
  near(areaOf(shapeRings(circle)), Math.PI * 2500, 60);
});

test('rotation is baked into the rings the tools work on', () => {
  const straight = { type: 'shape', shape: 'rect', x: 0, y: 0, w: 200, h: 100 };
  const turned = { ...straight, rotation: 90 };
  const bounds = ringsBounds(shapeRings(turned));
  near(bounds.w, 100, 1);
  near(bounds.h, 200, 1);
  near(bounds.x, 50, 1);
  near(bounds.y, -50, 1);
  // Rotating the outline never changes how much there is of it.
  near(areaOf(shapeRings(turned)), 20000, 1);
});

test('a custom path normalises into a 0..100 box and comes back', () => {
  const rings = [ringFromPoints([[200, 100], [300, 100], [300, 300], [200, 300]])];
  const fields = ringsToPathShape(rings);
  assert.equal(fields.shape, 'path');
  assert.deepEqual([fields.x, fields.y, fields.w, fields.h], [200, 100, 100, 200]);
  assert.deepEqual(fields.path.rings[0].points.map((point) => [point.x, point.y]), [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ]);
  // Back in slide coordinates the outline is where it started.
  const back = shapeRings({ ...fields, type: 'shape' });
  assert.deepEqual(ringsBounds(back), { x: 200, y: 100, w: 100, h: 200 });
});

test('an anchor drag moves its handles with it', () => {
  const element = {
    type: 'shape',
    shape: 'path',
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    path: {
      rings: [
        {
          closed: true,
          points: [
            { x: 0, y: 0, out: { x: 25, y: 0 } },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
            { x: 0, y: 100 },
          ],
        },
      ],
    },
  };
  const moved = movePathPoint(element, 0, 0, { x: 0, y: 20 });
  assert.deepEqual([moved[0].points[0].x, moved[0].points[0].y], [0, 20]);
  assert.deepEqual([moved[0].points[0].out.x, moved[0].points[0].out.y], [25, 20]);
  // Dragging a handle only moves the handle.
  const curved = movePathPoint(element, 0, 0, { x: 10, y: 30 }, 'out');
  assert.deepEqual([curved[0].points[0].x, curved[0].points[0].y], [0, 0]);
  assert.deepEqual([curved[0].points[0].out.x, curved[0].points[0].out.y], [10, 30]);
});

test('a custom path with no geometry yet still draws its box', () => {
  const empty = { type: 'shape', shape: 'path', x: 0, y: 0, w: 80, h: 40, path: null };
  assert.deepEqual(ringsBounds(shapeRings(empty)), { x: 0, y: 0, w: 80, h: 40 });
});

test('bending an edge makes the curve pass through the dragged point', () => {
  const ring = rectRings(0, 0, 100, 100, 0)[0];
  // The top edge runs from (0,0) to (100,0); drag its middle up to y = -40.
  const bent = bendRingSegment(ring, 0, { x: 50, y: -40 });
  const mid = ringSegmentMidpoint(bent, 0);
  assert.ok(Math.abs(mid.x - 50) < 1e-6 && Math.abs(mid.y + 40) < 1e-6, `midpoint was ${JSON.stringify(mid)}`);
  // Both anchors keep their place; only their handles moved.
  assert.equal(bent.points[0].x, 0);
  assert.equal(bent.points[0].y, 0);
  assert.equal(bent.points[1].y, 0);
  assert.ok(bent.points[0].out && bent.points[1].in);
  // The rest of the outline is untouched, and it still closes.
  assert.equal(bent.points[2].y, 100);
  assert.ok(ringsToD([bent]).includes('C'));
  // Straightening removes the handles again.
  const straight = straightenRingSegment(bent, 0);
  assert.equal(straight.points[0].out, undefined);
  assert.equal(straight.points[1].in, undefined);
  assert.deepEqual(ringSegmentMidpoint(straight, 0), { x: 50, y: 0 });
});

test('a bent edge still encloses a sensible area', () => {
  const ring = rectRings(0, 0, 100, 100, 0)[0];
  const bent = bendRingSegment(ring, 0, { x: 50, y: -50 });
  const area = areaOf([bent]);
  assert.ok(area > 10000, 'bulging outwards adds area');
  assert.ok(area < 16000, 'but not a silly amount');
  const inward = bendRingSegment(ring, 0, { x: 50, y: 60 });
  assert.ok(areaOf([inward]) < 10000, 'bending inwards removes area');
});

test('bend handles only exist where they make sense', () => {
  const ring = rectRings(0, 0, 10, 10, 0)[0];
  assert.equal(bendRingSegment(ring, 9, { x: 0, y: 0 }).points.length, ring.points.length);
  assert.equal(ringSegmentMidpoint(ring, -1), null);
  assert.deepEqual(ringSegmentMidpoint(ring, 0), { x: 5, y: 0 });
});

test('simplifying drops the points that carry no shape', () => {
  assert.deepEqual(
    simplifyPolyline([[0, 0], [50, 0], [100, 0], [100, 100], [0, 100]]),
    [[0, 0], [100, 0], [100, 100], [0, 100]]
  );
  // A doubled point is dropped, and a two point result is left alone.
  assert.deepEqual(simplifyPolyline([[0, 0], [0, 0], [10, 10]]), [[0, 0], [10, 10]]);
  assert.deepEqual(simplifyPolyline([[0, 0], [10, 10], [0, 0]]), [[0, 0], [10, 10]]);
});



test('a picture outlines itself the way it is clipped and rounded', () => {
  const picture = { type: 'image', x: 0, y: 0, w: 200, h: 100, radius: 0 };
  const curved = (rings) => (rings[0].points || []).some((point) => point.in || point.out);

  // Plain picture: the bare box, so the dots sit on its corners.
  const box = shapeLocalRings(picture);
  assert.equal(box.length, 1);
  assert.equal(box[0].points.length, 4);
  assert.equal(curved(box), false);

  // Clipped into an ellipse: the dots follow the ellipse, not the box.
  const clipped = shapeLocalRings({ ...picture, clipShape: 'ellipse' });
  assert.equal(curved(clipped), true, 'a clipped picture curves its outline');
  const ellipse = shapeLocalRings({ type: 'shape', shape: 'ellipse', w: 200, h: 100 });
  assert.deepEqual(clipped, ellipse, 'a clipped picture uses the same outline as the shape');

  // A rounded picture rounds its own outline, which is what the dots sit on.
  assert.equal(curved(shapeLocalRings({ ...picture, radius: 30 })), true, 'a rounded picture curves its corners');
  assert.equal(
    curved(shapeLocalRings({ ...picture, corners: { tl: 40, tr: 0, br: 0, bl: 0 } })),
    true,
    'one rounded corner is enough to curve the outline'
  );

  // A picture clipped into a preset polygon follows that polygon.
  const star = shapeLocalRings({ ...picture, clipShape: 'star5' });
  const starShape = shapeLocalRings({ type: 'shape', shape: 'star5', w: 200, h: 100 });
  assert.deepEqual(star, starShape);
  assert.ok(star[0].points.length >= 10, 'the star keeps its points');
});

test('a video is outlined by its clip shape too', () => {
  const video = { type: 'video', w: 200, h: 100, clipShape: 'roundRect' };
  const rings = shapeLocalRings(video);
  const shape = shapeLocalRings({ type: 'shape', shape: 'roundRect', w: 200, h: 100 });
  assert.deepEqual(rings, shape);
});
