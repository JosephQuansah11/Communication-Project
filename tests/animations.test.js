/**
 * The object-animation vocabulary: what the editor offers, and the keyframes that
 * draw it.
 *
 * `shared/animations.js` is the list the dropdowns read; `src/lib/animations.js` maps
 * each effect onto a keyframe name; the stylesheet holds the keyframes themselves.
 * The third link is the one that breaks quietly — an effect listed but never drawn
 * simply does nothing during a show — so it is checked here against the stylesheet.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ANIMATION_KINDS,
  EFFECT_CATALOG,
  EFFECT_IDS,
  effectLabel,
  effectsForKind,
  normalizeAnimation,
  normalizeAnimations,
} from '../shared/animations.js';
import { animationStyle, keyframeFor, resolveElementAnimation } from '../src/lib/animations.js';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

const animation = (extra) => ({
  id: 'a1',
  targetId: 't1',
  targetIds: ['t1'],
  kind: 'entrance',
  effect: 'fade',
  direction: null,
  duration: 500,
  delay: 0,
  trigger: 'click',
  group: 0,
  order: 0,
  path: null,
  ...extra,
});

test('the catalog is well formed', () => {
  const ids = EFFECT_CATALOG.map((effect) => effect.id);
  assert.deepEqual(ids, [...new Set(ids)], 'effect ids are unique');
  for (const effect of EFFECT_CATALOG) {
    assert.ok(effect.label, `${effect.id} has a label`);
    assert.ok(Array.isArray(effect.kinds) && effect.kinds.length, `${effect.id} names a kind`);
    for (const kind of effect.kinds) {
      assert.ok(ANIMATION_KINDS.includes(kind), `${effect.id} uses a known kind (${kind})`);
    }
  }
  assert.equal(effectLabel('pop'), 'Pop');
  assert.equal(effectLabel('nonsense'), 'nonsense');
});

test('the effects this round added are offered for the right kinds', () => {
  const entrance = effectsForKind('entrance').map((effect) => effect.id);
  const emphasis = effectsForKind('emphasis').map((effect) => effect.id);

  // Popping to show, and a drip that falls in: both arrive and both leave.
  assert.ok(entrance.includes('pop'), 'Pop is an entrance');
  assert.ok(entrance.includes('waterDrip'), 'Water drip is an entrance');
  assert.ok(effectsForKind('exit').some((effect) => effect.id === 'pop'));
  assert.ok(effectsForKind('exit').some((effect) => effect.id === 'waterDrip'));

  // Waving and water: movements of an object already on screen.
  assert.ok(emphasis.includes('wave'), 'Wave is an emphasis');
  assert.ok(emphasis.includes('waterWave'), 'Water wave is an emphasis');
  // Bounce works both ways: arriving from off-slide, and bouncing where it stands.
  assert.ok(entrance.includes('bounce'));
  assert.ok(emphasis.includes('bounce'), 'Bounce can bounce in place');
});

test('every effect maps onto keyframes the stylesheet actually defines', () => {
  for (const effect of EFFECT_CATALOG) {
    if (effect.id === 'path') continue; // drawn from the motion path's own variables
    for (const kind of effect.kinds) {
      const name = keyframeFor(animation({ effect: effect.id, kind }));
      assert.ok(new RegExp(`@keyframes ${name}\\b`).test(css), `${effect.id} as ${kind} draws @keyframes ${name}`);
      if (kind === 'exit') {
        assert.ok(name.endsWith('-out'), `${effect.id} exit reads its motion backwards (${name})`);
      }
    }
  }
test('the new effects name the keyframes they were written for', () => {
  assert.equal(keyframeFor(animation({ effect: 'pop', kind: 'entrance' })), 'anim-pop');
  assert.equal(keyframeFor(animation({ effect: 'pop', kind: 'exit' })), 'anim-pop-out');
  assert.equal(keyframeFor(animation({ effect: 'waterDrip', kind: 'entrance' })), 'anim-water-drip');
  assert.equal(keyframeFor(animation({ effect: 'waterDrip', kind: 'exit' })), 'anim-water-drip-out');
  assert.equal(keyframeFor(animation({ effect: 'wave', kind: 'emphasis' })), 'anim-wave');
  assert.equal(keyframeFor(animation({ effect: 'waterWave', kind: 'emphasis' })), 'anim-water-wave');
  // Bounce is the one effect with two sets of keyframes.
  assert.equal(keyframeFor(animation({ effect: 'bounce', kind: 'entrance' })), 'anim-bounce');
  assert.equal(keyframeFor(animation({ effect: 'bounce', kind: 'exit' })), 'anim-bounce-out');
  assert.equal(keyframeFor(animation({ effect: 'bounce', kind: 'emphasis' })), 'anim-bounce-in-place');
  // An unknown effect still draws something rather than nothing.
  assert.equal(keyframeFor(animation({ effect: 'nonsense' })), 'anim-fade');
});

test('the new effects are timed to move the way their name says', () => {
  const style = (extra) => animationStyle(resolveElementAnimation([animation(extra)], 't1', 1), { width: 1280, height: 720 });

  // Pop overshoots on the way in; a drip accelerates as it falls and lands softly.
  assert.match(style({ effect: 'pop', duration: 400 }).animationTimingFunction, /cubic-bezier/);
  assert.equal(style({ effect: 'waterDrip', duration: 700 }).animationTimingFunction, 'cubic-bezier(0.45, 0, 0.55, 1)');
  // The waving pair are eased movements, and they play twice.
  assert.equal(style({ effect: 'wave', kind: 'emphasis', group: 0, duration: 900 }).animationIterationCount, 2);
  assert.equal(style({ effect: 'waterWave', kind: 'emphasis', group: 0, duration: 900 }).animationIterationCount, 2);
  assert.equal(style({ effect: 'waterWave', kind: 'emphasis', group: 0, duration: 900 }).animationTimingFunction, 'ease-in-out');
  // Everything else still plays once.
  assert.equal(style({ effect: 'pop', duration: 400 }).animationIterationCount, 1);
});

test('an emphasis animation returns the object to where it started', () => {
  // Emphasis effects must not hold their last frame, or the object would stay moved.
  for (const effect of ['wave', 'waterWave', 'bounce']) {
    const style = animationStyle(resolveElementAnimation([animation({ effect, kind: 'emphasis', group: 0 })], 't1', 1));
    assert.equal(style.animationFillMode, 'none', `${effect} leaves the object as it found it`);
  }
  // Entrances and exits do hold, so an object waits hidden and stays revealed.
  assert.equal(animationStyle(resolveElementAnimation([animation({ effect: 'pop' })], 't1', 0)).animationFillMode, 'both');
});

test('the new effects survive normalization from a saved deck', () => {
  for (const effect of ['pop', 'waterDrip', 'wave', 'waterWave']) {
    const kind = effectsForKind('emphasis').some((entry) => entry.id === effect) ? 'emphasis' : 'entrance';
    const normalized = normalizeAnimation({ targetId: 't1', kind, effect });
    assert.equal(normalized.effect, effect, `${effect} is kept as it was saved`);
  }
  // An id nobody knows falls back to the preset table rather than breaking the slide.
  assert.equal(normalizeAnimation({ targetId: 't1', kind: 'entrance', effect: 'wobble' }).effect, 'fade');
  assert.equal(normalizeAnimations([{ targetId: 't1', effect: 'pop' }]).length, 1);
  assert.ok(EFFECT_IDS.includes('pop'));
});

});
