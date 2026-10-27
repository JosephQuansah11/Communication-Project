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
const component = readFileSync(new URL('../src/components/SlideTransition.jsx', import.meta.url), 'utf8');

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
  // Burn away rides a line of fire; sparkle scatters points.
  assert.ok(/\.transition-burn\s*\{/.test(css));
  assert.ok(/@keyframes transition-burnAway-sweep\b/.test(css));
  assert.ok(/\.transition-sparkles\s*\{/.test(css));
  assert.ok(/@keyframes transition-sparkle\b/.test(css));
});

test('burn away is a fire: char, a hot line, flames and sparks', () => {
  // The layers the transition draws, and a rule for each of them.
  for (const part of ['burn-ash', 'burn-glow', 'burn-line', 'burn-flames', 'burn-embers']) {
    assert.ok(new RegExp(`\\.transition-burn \\.${part}\\b`).test(css), `${part} is styled`);
    assert.ok(new RegExp(`className="${part}"`).test(component), `${part} is drawn`);
  }
  // The flames flare and the sparks rise, and both keep going for the whole burn.
  assert.ok(/@keyframes transition-burnAway-flame\b/.test(css));
  assert.ok(/@keyframes transition-burnAway-ember\b/.test(css));
  const flame = css.slice(css.indexOf('@keyframes transition-burnAway-flame'), css.indexOf('@keyframes transition-burnAway-ember'));
  assert.match(flame, /transform:\s*scale\(/, 'a flame changes shape');
  const ember = css.slice(css.indexOf('@keyframes transition-burnAway-ember'));
  assert.match(ember.slice(0, 600), /translate\(/, 'a spark drifts sideways');
  assert.match(ember.slice(0, 600), /-140%/, 'and rises off the line');
  // Both loop, so the fire does not go out half way across the slide.
  for (const name of ['transition-burnAway-flame', 'transition-burnAway-ember']) {
    const rule = css.slice(css.indexOf(`animation: ${name}`), css.indexOf(';', css.indexOf(`animation: ${name}`)));
    assert.match(rule, /infinite/, `${name} repeats`);
    assert.match(rule, /var\(--transition-ms/, `${name} is timed off the transition`);
  }
  // White-hot at the core, deep red at the tail: fire, not a colour wash.
  const line = css.slice(css.indexOf('.transition-burn .burn-line'), css.indexOf('.transition-burn .burn-glow'));
  assert.match(line, /rgba\(255, 250, 232/, 'the hottest part is nearly white');
  assert.match(line, /rgba\((7|8)\d, \d+, 4/, 'and it falls away into deep red');
  // The fire is painted, not blended: on a pale slide a screen blend would vanish.
  const band = css.slice(css.indexOf('.transition-burn {'), css.indexOf('@keyframes transition-burnAway-sweep'));
  assert.ok(!/mix-blend-mode/.test(band), 'the fire itself is not blended away');
  assert.match(
    css.slice(css.indexOf('.transition-burn .burn-glow'), css.indexOf('.transition-burn .burn-flames')),
    /mix-blend-mode: screen/,
    'only the halo is'
  );
});

test('burn away sweeps across the slide, and the clip keeps up with the fire', () => {
  const hold = css.slice(css.indexOf('@keyframes transition-burnAway-hold'), css.indexOf('.transition-hold.hold-burnAway'));
  const stops = [...hold.matchAll(/clip-path:\s*polygon\(([^)]*)\)/g)].map((match) => match[1]);
  assert.ok(stops.length >= 4, `several stops, found ${stops.length}`);
  const counts = stops.map((stop) => stop.split(',').filter((pair) => pair.trim()).length);
  assert.deepEqual([...new Set(counts)], [9], 'every stop has the same nine points, so it can interpolate');

  // The front moves left to right: the first x of each stop only ever increases.
  const fronts = stops.map((stop) => Number.parseFloat(stop.split(',')[0]));
  for (let index = 1; index < fronts.length; index += 1) {
    assert.ok(fronts[index] > fronts[index - 1], `stop ${index} is further right (${fronts[index]}%)`);
  }
  assert.equal(fronts[0], 0, 'it starts at the left edge');
  assert.equal(fronts[fronts.length - 1], 100, 'and finishes at the right edge');

  // The band rides the same front, with the same easing, so the fire is always on the
  // edge of the old slide rather than ahead of it or behind it.
  const sweep = css.slice(css.indexOf('@keyframes transition-burnAway-sweep'), css.indexOf('.transition-burn .burn-ash'));
  assert.match(sweep, /left:\s*-?\d+%/, 'the band moves sideways');
  assert.ok(!/translate|top:/.test(sweep), 'and not up or down');
  const holdRule = css.slice(css.indexOf('.transition-hold.hold-burnAway'), css.indexOf('.transition-run.run-burnAway'));
  const bandRule = css.slice(css.indexOf('.transition-burn {'), css.indexOf('@keyframes transition-burnAway-sweep'));
  const easing = /cubic-bezier\(([^)]*)\)/;
  assert.equal(holdRule.match(easing)?.[1], bandRule.match(easing)?.[1], 'the clip and the fire share one easing');
  assert.match(bandRule, /var\(--transition-ms/, 'and one duration');
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
