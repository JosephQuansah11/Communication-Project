/**
 * Slide transitions: the catalog the editor offers, and the keyframes that draw it.
 *
 * The catalog and the stylesheet have to agree — a transition listed in one and
 * missing from the other would be a slide that simply jumps. These checks read the
 * stylesheet itself, so the two lists cannot drift apart unnoticed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_TRANSITION,
  TRANSITIONS,
  TRANSITION_IDS,
  isTransition,
  normalizeTransition,
  transitionDuration,
  transitionFor,
  transitionLabel,
  transitionPlays,
} from '../shared/transitions.js';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

/** The ids that actually animate something. */
const ANIMATED = TRANSITION_IDS.filter((id) => id !== 'none');

test('the catalog offers every transition the editor shows', () => {
  const ids = TRANSITIONS.map((transition) => transition.id);
  assert.deepEqual(ids, [...new Set(ids)], 'ids are unique');
  for (const transition of TRANSITIONS) {
    assert.ok(transition.label, `${transition.id} has a label`);
    assert.ok(transition.hint, `${transition.id} explains itself`);
    assert.equal(typeof transition.duration, 'number');
  }
  // The ones this round added, by name, in the order the gallery lists them.
  for (const label of ['Fade', 'Slide', 'Cover', 'Open door', 'Slice', 'Burn away', 'Sparkle', 'None']) {
    assert.ok(TRANSITIONS.some((transition) => transition.label === label), `${label} is offered`);
  }
});

test('a cut is instant and everything else takes time', () => {
  assert.equal(transitionDuration('none'), 0);
  assert.equal(transitionPlays('none'), false);
  for (const id of ANIMATED) {
    assert.ok(transitionDuration(id) > 0, `${id} lasts longer than a frame`);
    assert.equal(transitionPlays(id), true);
  }
  assert.equal(transitionPlays(''), false);
  assert.equal(transitionPlays(null), false);
});

test('an unknown transition becomes the default rather than a broken slide', () => {
  assert.equal(normalizeTransition('openDoor'), 'openDoor');
  assert.equal(normalizeTransition('none'), 'none');
  assert.equal(normalizeTransition('warp'), DEFAULT_TRANSITION);
  assert.equal(normalizeTransition(undefined), DEFAULT_TRANSITION);
  assert.equal(normalizeTransition(null), DEFAULT_TRANSITION);
  assert.equal(isTransition('burnAway'), true);
  assert.equal(isTransition('burnaway'), false);
});

test('looking a transition up never comes back empty', () => {
  assert.equal(transitionFor('sparkle').label, 'Sparkle');
  assert.equal(transitionLabel('slice'), 'Slice');
  // Anything unknown falls back to the default's entry, not undefined.
  assert.equal(transitionFor('nonsense').id, DEFAULT_TRANSITION);
  assert.equal(transitionFor(undefined).label, 'Fade');
});

test('every animated transition has the keyframes that draw it', () => {
  for (const id of ANIMATED) {
    assert.ok(
      new RegExp(`@keyframes transition-${id}\\b`).test(css),
      `styles.css defines @keyframes transition-${id}`
    );
    assert.ok(
      new RegExp(`\\.transition-run\\.run-${id}\\b`).test(css),
      `styles.css binds the arriving slide to run-${id}`
    );
  }
});

test('the transitions that move the outgoing slide animate the hold layer too', () => {
  // Slide shunts the old slide out, and burn away eats it from the bottom up; every
  // other transition leaves the old slide where it is, under the new one.
  for (const id of ['slide', 'burnAway']) {
    assert.ok(new RegExp(`\\.transition-hold\\.hold-${id}\\b`).test(css), `hold-${id} is styled`);
  }
  assert.equal(/\.transition-hold\.hold-fade\b/.test(css), false, 'fade leaves the old slide alone');
});

test('the two decorated transitions have their decoration styled', () => {
  // Burn away sweeps a glowing band up; sparkle scatters points.
  assert.ok(/\.transition-burn\s*\{/.test(css));
  assert.ok(/@keyframes transition-burnAway-sweep\b/.test(css));
  assert.ok(/\.transition-sparkles\s*\{/.test(css));
  assert.ok(/@keyframes transition-sparkle\b/.test(css));
});

test('every transition is layered, never stacked in the flow', () => {
  // The three layers are absolutely positioned on top of each other, so a transition
  // can never push the presenter's chrome around.
  assert.ok(/\.transition-hold,\s*\n\.transition-run\s*\{[^}]*position:\s*absolute/.test(css));
  assert.ok(/\.slide-transition\s*\{[^}]*position:\s*absolute/.test(css));
});

test('the slice transition animates between polygons with the same point count', () => {
  // clip-path only interpolates when both shapes have the same number of points, so
  // every stop of the slice keyframes has to be a sixteen-point polygon.
  const block = css.slice(css.indexOf('@keyframes transition-slice'), css.indexOf('.transition-run.run-slice'));
  const stops = [...block.matchAll(/clip-path:\s*polygon\(([^)]*)\)/g)].map((match) => match[1]);
  assert.ok(stops.length >= 4, `slice has several stops, found ${stops.length}`);
  for (const stop of stops) {
    const points = stop.split(',').map((pair) => pair.trim()).filter(Boolean);
    assert.equal(points.length, 16, `a stop has 16 points, found ${points.length}`);
  }
});
