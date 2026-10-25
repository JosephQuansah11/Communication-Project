import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANNOTATION_TOOLS,
  PEN_COLORS,
  annotationTool,
  distanceToStroke,
  newStroke,
  pointsAttr,
  strokeAt,
} from '../src/lib/annotations.js';

test('the annotation tools cover pointer, laser, pen, highlighter and eraser', () => {
  assert.deepEqual(
    ANNOTATION_TOOLS.map((tool) => tool.id),
    ['pointer', 'laser', 'pen', 'highlighter', 'eraser']
  );
  for (const tool of ANNOTATION_TOOLS) {
    assert.ok(tool.label && tool.icon && tool.shortcut, `${tool.id} is described`);
  }
  assert.equal(annotationTool('nope').id, 'pointer');
  assert.ok(PEN_COLORS.length >= 4);
});

test('a stroke takes its colour and width from the tool', () => {
  const pen = newStroke('pen', { x: 10, y: 20 });
  assert.equal(pen.tool, 'pen');
  assert.equal(pen.color, '#f43f5e');
  assert.equal(pen.width, 3);
  assert.equal(pen.opacity, 1);
  assert.deepEqual(pen.points, [{ x: 10, y: 20 }]);

  const marker = newStroke('highlighter', { x: 0, y: 0 });
  assert.equal(marker.width, 14);
  assert.ok(marker.opacity < 1, 'the highlighter is translucent');

  const custom = newStroke('pen', { x: 0, y: 0 }, { color: '#22d3ee' });
  assert.equal(custom.color, '#22d3ee');
  assert.notEqual(newStroke('pen', { x: 0, y: 0 }).id, custom.id, 'strokes have unique ids');
});

test('the eraser finds the stroke closest to a point', () => {
  const first = { ...newStroke('pen', { x: 10, y: 10 }), points: [{ x: 10, y: 10 }, { x: 40, y: 40 }] };
  const second = { ...newStroke('pen', { x: 80, y: 80 }), points: [{ x: 80, y: 80 }, { x: 90, y: 90 }] };

  assert.equal(Math.round(distanceToStroke(first, { x: 40, y: 40 })), 0);
  assert.equal(Math.round(distanceToStroke(first, { x: 13, y: 14 })), 5);
  assert.equal(strokeAt([first, second], { x: 82, y: 82 }), 1);
  assert.equal(strokeAt([first, second], { x: 60, y: 10 }), -1, 'nothing within reach');
  assert.equal(strokeAt([], { x: 0, y: 0 }), -1);
  assert.equal(distanceToStroke({}, { x: 0, y: 0 }), Infinity);
});

test('strokes serialise to an SVG points attribute', () => {
  assert.equal(pointsAttr({ points: [{ x: 1, y: 2 }, { x: 3.5, y: 4 }] }), '1,2 3.5,4');
  assert.equal(pointsAttr(null), '');
});
