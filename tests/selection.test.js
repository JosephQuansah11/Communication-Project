import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alignOffsets,
  boundsOf,
  distributeOffsets,
  duplicateSelection,
  expandGroups,
  groupChanges,
  hasGroup,
  idsInBox,
  keepsProportions,
  resizedBox,
  matchSize,
  offsetChanges,
  pasteElements,
  reorderElements,
  rotateAround,
  scaleToBounds,
  selectionElements,
  ungroupChanges,
} from '../src/lib/selection.js';

/** A minimal element; only the geometry matters to these helpers. */
const el = (id, x, y, w, h, extra = {}) => ({ id, x, y, w, h, type: 'shape', rotation: 0, ...extra });

const three = () => [el('a', 0, 0, 100, 50), el('b', 200, 100, 100, 50), el('c', 400, 300, 100, 50)];

test('boundsOf measures the union of the selection', () => {
  assert.equal(boundsOf([]), null);
  assert.equal(boundsOf(null), null);
  assert.deepEqual(boundsOf([el('a', 10, 20, 100, 40)]), { x: 10, y: 20, w: 100, h: 40 });
  assert.deepEqual(boundsOf(three()), { x: 0, y: 0, w: 500, h: 350 });
});

test('a selection always pulls in the whole group', () => {
  const elements = [
    el('a', 0, 0, 10, 10, { group: 'g1' }),
    el('b', 20, 0, 10, 10, { group: 'g1' }),
    el('c', 40, 0, 10, 10),
  ];
  assert.deepEqual(expandGroups(elements, ['b']), ['a', 'b']);
  assert.deepEqual(expandGroups(elements, ['c']), ['c']);
  assert.deepEqual(expandGroups(elements, []), []);
  assert.deepEqual(selectionElements(elements, ['b']).map((element) => element.id), ['a', 'b']);
});

test('idsInBox takes the objects that sit fully inside the marquee', () => {
  const elements = three();
  const box = { x: -10, y: -10, w: 220, h: 160 };
  assert.deepEqual(idsInBox(elements, box), ['a']);
  assert.deepEqual(idsInBox(elements, box, { contained: false }), ['a', 'b']);
  assert.deepEqual(idsInBox(elements, { x: 0, y: 0, w: 0, h: 0 }), []);
  assert.deepEqual(idsInBox(elements, null), []);
});

test('offsetChanges moves every object by the same amount', () => {
  assert.deepEqual(offsetChanges([el('a', 10, 10, 10, 10)], 5, -2.4), { a: { x: 15, y: 8 } });
});

test('alignOffsets aligns inside the selection box', () => {
  const elements = three();
  const ids = elements.map((element) => element.id);
  const frame = boundsOf(elements);
  assert.deepEqual(alignOffsets(elements, ids, 'left', frame), {
    a: { x: 0, y: 0 },
    b: { x: 0, y: 100 },
    c: { x: 0, y: 300 },
  });
  assert.deepEqual(alignOffsets(elements, ids, 'right', frame), {
    a: { x: 400, y: 0 },
    b: { x: 400, y: 100 },
    c: { x: 400, y: 300 },
  });
  assert.deepEqual(alignOffsets(elements, ids, 'center', frame), {
    a: { x: 200, y: 0 },
    b: { x: 200, y: 100 },
    c: { x: 200, y: 300 },
  });
  assert.deepEqual(alignOffsets(elements, ids, 'middle', frame), {
    a: { x: 0, y: 150 },
    b: { x: 200, y: 150 },
    c: { x: 400, y: 150 },
  });
  assert.deepEqual(alignOffsets(elements, ids, 'unknown', frame), {});
});

test('alignOffsets falls back to the selection box and accepts a slide frame', () => {
  const elements = three();
  assert.deepEqual(alignOffsets(elements, ['a'], 'right'), { a: { x: 0, y: 0 } });
  assert.deepEqual(alignOffsets(elements, ['a'], 'center', { x: 0, y: 0, w: 1000, h: 500 }), {
    a: { x: 450, y: 0 },
  });
});

test('distributeOffsets evens out the gaps and keeps the outer two in place', () => {
  const elements = [el('a', 0, 0, 100, 10), el('b', 150, 0, 100, 10), el('c', 500, 0, 100, 10)];
  const changes = distributeOffsets(elements, ['a', 'b', 'c'], 'h');
  assert.equal(changes.a.x, 0);
  assert.equal(changes.c.x, 500);
  // 600 px of span (0 → 600), 300 px used by the objects, so every gap becomes 150 px.
  assert.equal(changes.b.x, 250);
  assert.deepEqual(distributeOffsets(elements, ['a', 'b'], 'h'), {});
});

test('scaleToBounds maps the whole selection onto the new box', () => {
  const elements = [el('a', 0, 0, 100, 100), el('b', 100, 0, 100, 100)];
  const changes = scaleToBounds(elements, ['a', 'b'], { x: 0, y: 0, w: 200, h: 100 }, { x: 0, y: 0, w: 400, h: 200 });
  assert.deepEqual(changes, {
    a: { x: 0, y: 0, w: 200, h: 200 },
    b: { x: 200, y: 0, w: 200, h: 200 },
  });
});

test('rotateAround spins the members about the group centre', () => {
  const elements = [el('a', 0, 0, 100, 100)];
  assert.deepEqual(rotateAround(elements, ['a'], { x: 50, y: 50 }, 90), {
    a: { x: 0, y: 0, rotation: 90 },
  });
  const pair = [el('a', 0, 0, 100, 100), el('b', 100, 0, 100, 100)];
  const turned = rotateAround(pair, ['a', 'b'], { x: 100, y: 50 }, 90);
  assert.equal(turned.a.rotation, 90);
  // `b`'s centre (150, 50) swings to (100, 100), so its box lands on (50, 50).
  assert.deepEqual(turned.b, { x: 50, y: 50, rotation: 90 });
  assert.deepEqual(rotateAround(elements, ['a'], { x: 0, y: 0 }, 0), {});
});

test('matchSize copies the first object size onto the rest', () => {
  const elements = [el('a', 0, 0, 100, 40), el('b', 0, 0, 60, 80), el('c', 0, 0, 30, 30)];
  assert.deepEqual(matchSize(elements, ['a', 'b', 'c'], 'w'), { b: { w: 100 }, c: { w: 100 } });
  assert.deepEqual(matchSize(elements, ['a', 'b', 'c'], 'h'), { b: { h: 40 }, c: { h: 40 } });
  assert.deepEqual(matchSize(elements, ['a', 'b', 'c'], 'both'), {
    b: { w: 100, h: 40 },
    c: { w: 100, h: 40 },
  });
  assert.deepEqual(matchSize(elements, ['a'], 'both'), {});
});

test('groupChanges groups the selection and ungroupChanges breaks it apart', () => {
  const elements = [el('a', 0, 0, 10, 10), el('b', 20, 0, 10, 10)];
  assert.deepEqual(groupChanges(elements, ['a', 'b'], 'g-1'), { a: { group: 'g-1' }, b: { group: 'g-1' } });
  assert.deepEqual(groupChanges(elements, ['a'], 'g-1'), {});
  assert.equal(hasGroup(elements, ['a', 'b']), false);

  const members = [el('a', 0, 0, 10, 10, { group: 'g-1' }), el('b', 20, 0, 10, 10, { group: 'g-1' })];
  assert.equal(hasGroup(members, ['a']), true);
  assert.deepEqual(ungroupChanges(members, ['a']), { a: { group: null }, b: { group: null } });
  assert.deepEqual(ungroupChanges(elements, ['a']), {});
});

test('reorderElements moves the selection in the stack', () => {
  const elements = [el('a', 0, 0, 10, 10), el('b', 0, 0, 10, 10), el('c', 0, 0, 10, 10), el('d', 0, 0, 10, 10)];
  const ids = ['a', 'c'];
  const order = (list) => list.map((element) => element.id);
  assert.deepEqual(order(reorderElements(elements, ids, 1)), ['b', 'a', 'd', 'c']);
  assert.deepEqual(order(reorderElements(elements, ids, -1)), ['a', 'c', 'b', 'd']);
  assert.deepEqual(order(reorderElements(elements, ids, Number.MAX_SAFE_INTEGER)), ['b', 'd', 'a', 'c']);
  assert.deepEqual(order(reorderElements(elements, ids, -Number.MAX_SAFE_INTEGER)), ['a', 'c', 'b', 'd']);
  assert.equal(reorderElements(elements, []).length, 4);
});

test('duplicateSelection copies the selection with fresh ids and groups', () => {
  const elements = [
    el('a', 10, 10, 10, 10, { group: 'g1' }),
    el('b', 30, 10, 10, 10, { group: 'g1' }),
    el('c', 50, 10, 10, 10),
  ];
  const { copies, ids } = duplicateSelection(elements, ['a', 'c'], 24);
  // Selecting one member of a group copies the whole group, as PowerPoint does.
  assert.equal(copies.length, 3);
  assert.equal(ids.length, 3);
  assert.notEqual(copies[0].id, 'a');
  assert.deepEqual({ x: copies[0].x, y: copies[0].y }, { x: 34, y: 34 });
  assert.equal(copies[0].group, copies[1].group, 'the copies share one new group');
  assert.notEqual(copies[0].group, 'g1', 'the copy gets its own group id');
  assert.equal(copies[2].group, undefined, 'ungrouped objects stay ungrouped');
  assert.equal(duplicateSelection(elements, []).copies.length, 0);
});

test('duplicating a whole group keeps the copies in one new group', () => {
  const elements = [el('a', 0, 0, 10, 10, { group: 'g1' }), el('b', 20, 0, 10, 10, { group: 'g1' })];
  const { copies } = duplicateSelection(elements, ['a'], 24);
  assert.equal(copies.length, 2);
  assert.equal(copies[0].group, copies[1].group);
  assert.notEqual(copies[0].group, 'g1');
});

test('pasting clipboard elements rebuilds them beside the original', () => {
  const elements = [
    el('a', 100, 50, 40, 30, { group: 'g1', text: 'One' }),
    el('b', 140, 50, 40, 30, { group: 'g1', text: 'Two' }),
    el('c', 200, 50, 40, 30, { text: 'Loose' }),
  ];
  const copies = pasteElements(elements, 24);
  assert.equal(copies.length, 3);
  // Fresh ids, offset positions, and nothing shared with the originals.
  assert.deepEqual(copies.map((copy) => copy.id === elements[0].id), [false, false, false]);
  assert.deepEqual(copies.map((copy) => [copy.x, copy.y]), [[124, 74], [164, 74], [224, 74]]);
  assert.deepEqual(copies.map((copy) => copy.text), ['One', 'Two', 'Loose']);
  // The pasted group is its own group: same id for its members, different from the source.
  assert.equal(copies[0].group, copies[1].group);
  assert.notEqual(copies[0].group, 'g1');
  assert.equal(copies[2].group, undefined);
  // Pasting twice keeps the two pastes apart.
  const again = pasteElements(elements, 24);
  assert.notEqual(again[0].group, copies[0].group);
  assert.equal(pasteElements([], 24).length, 0);
  assert.equal(pasteElements([null, undefined], 24).length, 0);
});


test('a picture keeps its proportions when it is enlarged from a corner', () => {
  const photo = { x: 100, y: 100, w: 200, h: 100 };

  // Free resize: the corner follows the pointer on both axes.
  assert.deepEqual(resizedBox(photo, 'se', 50, 10, { lockAspect: false }), { x: 100, y: 100, w: 250, h: 110 });

  // Locked: the ratio 2:1 survives, and the growth is the average of the two axis
  // scales (1.25 and 1.1 -> 1.175), so the corner still follows the pointer.
  const grown = resizedBox(photo, 'se', 50, 10, { lockAspect: true });
  // Whole pixels cannot always hit the ratio exactly: 235/2 is 117.5.
  assert.ok(Math.abs(grown.w / grown.h - 2) < 0.02);
  assert.equal(grown.w, 235);
  assert.equal(grown.h, 118);
  assert.equal(grown.x, 100);
  assert.equal(grown.y, 100);

  // A corner drag that is purely diagonal grows by exactly that factor.
  assert.deepEqual(resizedBox(photo, 'se', 100, 50, { lockAspect: true }), { x: 100, y: 100, w: 300, h: 150 });

  // Dragging a corner inwards shrinks it without flipping the ratio.
  const shrunk = resizedBox(photo, 'nw', 100, 50, { lockAspect: true });
  assert.ok(Math.abs(shrunk.w / shrunk.h - 2) < 0.02);
  assert.equal(shrunk.w, 100);
  assert.equal(shrunk.h, 50);
  // The opposite corner stayed where it was.
  assert.equal(shrunk.x + shrunk.w, photo.x + photo.w);
  assert.equal(shrunk.y + shrunk.h, photo.y + photo.h);

  // An edge handle still stretches that edge only: locking is for corners.
  assert.deepEqual(resizedBox(photo, 'e', 60, 0, { lockAspect: true }), { x: 100, y: 100, w: 260, h: 100 });

  // Nothing collapses to nothing.
  const tiny = resizedBox(photo, 'se', -1000, -1000, { lockAspect: true });
  assert.ok(tiny.w >= 12 && tiny.h >= 12);
});

test('only things that would visibly distort keep their proportions', () => {
  assert.equal(keepsProportions({ type: 'image', w: 100, h: 100 }), true);
  assert.equal(keepsProportions({ type: 'video', w: 100, h: 100 }), true);
  assert.equal(keepsProportions({ type: 'shape', fillImage: { src: '/uploads/a.png' } }), true);
  assert.equal(keepsProportions({ type: 'shape', shape: 'rect' }), false);
  assert.equal(keepsProportions({ type: 'text' }), false);
  assert.equal(keepsProportions(null), false);
});