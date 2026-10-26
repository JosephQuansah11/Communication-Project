import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePathShape, ringsBounds, ringsInBox, shapeRings } from '../src/lib/paths.js';

test('an outline that lives outside its own box is put back on the object', () => {
  // An imported path whose coordinates are in the wrong space: its editing dots would
  // be drawn far away from the shape, and the selection box would hang away from it.
  const stray = {
    type: 'shape',
    shape: 'path',
    x: 100,
    y: 100,
    w: 400,
    h: 400,
    path: {
      rings: [
        {
          closed: true,
          points: [
            { x: 0, y: 0 },
            { x: 900, y: 0 },
            { x: 900, y: 40 },
            { x: 120, y: 40, out: { x: 5000, y: 40 } },
          ],
        },
      ],
    },
  };
  assert.equal(ringsInBox(stray.path.rings), false, 'the outline is out of its box');

  const fixed = normalizePathShape(stray);
  assert.ok(fixed, 'the element needs fixing');
  assert.equal(fixed.shape, 'path');
  assert.equal(ringsInBox(fixed.path.rings), true, 'every point and handle is back in the box');

  // The shape keeps its geometry and lands exactly on its outline's own bounds.
  const before = ringsBounds(shapeRings(stray));
  const after = ringsBounds(shapeRings({ ...stray, ...fixed }));
  for (const key of ['x', 'y', 'w', 'h']) {
    assert.ok(Math.abs(after[key] - before[key]) < 0.5, `${key} is preserved`);
  }
  assert.equal(fixed.x, Math.round(before.x));
  assert.equal(fixed.w, Math.round(before.w));

  // An outline that is already in its box is left alone, and so is anything that is
  // not a custom path.
  const tidy = {
    type: 'shape',
    shape: 'path',
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    path: { rings: [{ closed: true, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }] }] },
  };
  assert.equal(ringsInBox(tidy.path.rings), true);
  assert.equal(normalizePathShape(tidy), null);
  assert.equal(normalizePathShape({ type: 'image' }), null);
  assert.equal(normalizePathShape(null), null);
});
