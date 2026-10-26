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
  directionsForEffect,
  effectLabel,
  effectsForKind,
  normalizeAnimation,
  normalizeAnimations,
} from '../shared/animations.js';
import {
  animationStyle,
  characterRunTime,
  characterStagger,
  characterStyle,
  isPerCharacter,
  keyframeFor,
  resolveElementAnimation,
  splitCharacters,
} from '../src/lib/animations.js';

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

test('Dynamic is offered where a character wave makes sense', () => {
  const entry = EFFECT_CATALOG.find((effect) => effect.id === 'dynamic');
  assert.ok(entry, 'the catalog has it');
  assert.equal(entry.label, 'Dynamic');
  assert.deepEqual(entry.kinds, ['entrance', 'exit', 'emphasis']);
  // The direction picks which end of the text the wave starts from.
  assert.deepEqual(directionsForEffect('dynamic'), ['left', 'right']);
  for (const kind of ['entrance', 'exit', 'emphasis']) {
    assert.ok(effectsForKind(kind).some((effect) => effect.id === 'dynamic'), `offered as ${kind}`);
  }
  assert.equal(isPerCharacter({ effect: 'dynamic' }), true);
  assert.equal(isPerCharacter({ effect: 'wave' }), false);
  assert.equal(isPerCharacter(null), false);
});

test('the character wave has keyframes for each kind', () => {
  assert.equal(keyframeFor({ effect: 'dynamic', kind: 'entrance' }), 'anim-dynamic');
  assert.equal(keyframeFor({ effect: 'dynamic', kind: 'exit' }), 'anim-dynamic-out');
  assert.equal(keyframeFor({ effect: 'dynamic', kind: 'emphasis' }), 'anim-dynamic-emphasis');
  for (const name of ['anim-dynamic', 'anim-dynamic-out', 'anim-dynamic-emphasis']) {
    assert.ok(new RegExp(`@keyframes ${name}\\b`).test(css), `styles.css defines ${name}`);
  }
  assert.match(css, /\.anim-char\s*\{/, 'characters have their own class');
  assert.match(css, /\.anim-char\s*\{[^}]*display:\s*inline-block/, 'a character can move on its own');
});

test('the wave is split into characters, not bytes', () => {
  assert.deepEqual(splitCharacters('hi'), ['h', 'i']);
  assert.deepEqual(splitCharacters('a b'), ['a', ' ', 'b'], 'spaces keep their place');
  assert.deepEqual(splitCharacters(''), []);
  assert.deepEqual(splitCharacters(null), []);
  // A surrogate pair is one character, not two halves of one.
  assert.deepEqual(splitCharacters('🙂!'), ['🙂', '!']);
  assert.equal(splitCharacters('🙂!').length, 2);
});

test('the gap between characters is proportional and bounded', () => {
  const style = { effect: 'dynamic', kind: 'entrance', duration: 600, delay: 0, direction: 'left' };
  // A short word steps in bigger increments than a paragraph, so the wave lands in
  // about the effect's own duration either way.
  assert.equal(characterStagger(style, 1), 140, 'a single character gets the widest step');
  assert.equal(characterStagger(style, 4), 140);
  assert.equal(characterStagger({ ...style, duration: 500 }, 10), 83);
  assert.equal(characterStagger({ ...style, duration: 100 }, 60), 14, 'a long line still moves promptly');
  // The whole wave is the last character's own animation plus every delay before it.
  assert.equal(characterRunTime({ ...style, duration: 500 }, 10), 500 + characterStagger({ ...style, duration: 500 }, 10) * 9);
  assert.equal(characterRunTime({ ...style, duration: 500 }, 1), 500);
});

test('each character is delayed by its place in the text', () => {
  const style = { effect: 'dynamic', kind: 'entrance', duration: 500, delay: 0, direction: 'left' };
  const first = characterStyle(style, 0, 5, true);
  const last = characterStyle(style, 4, 5, true);
  assert.equal(first.animationName, 'anim-dynamic');
  assert.equal(first.animationDuration, '500ms');
  assert.equal(first.animationDelay, '0ms');
  assert.equal(last.animationDelay, `${characterStagger(style, 5) * 4}ms`);
  assert.equal(first.animationFillMode, 'both', 'a character waits hidden and stays put');
  assert.equal(first.animationIterationCount, 1);
  assert.equal(first.animationPlayState, 'running');
  // From the right, the last character is the one that goes first.
  const fromRight = characterStyle({ ...style, direction: 'right' }, 4, 5, true);
  assert.equal(fromRight.animationDelay, '0ms');
  assert.equal(characterStyle({ ...style, direction: 'right' }, 0, 5, true).animationDelay, `${characterStagger(style, 5) * 4}ms`);
  // A step that has not played yet is held on its first frame.
  assert.equal(characterStyle(style, 0, 5, false).animationPlayState, 'paused');
  // The effect's own delay is added to every character.
  assert.equal(characterStyle({ ...style, delay: 200 }, 0, 5, true).animationDelay, '200ms');
});

test('the box itself is left out of a character wave', () => {
  const entry = { ...animation({ effect: 'dynamic', duration: 600 }), targetIds: ['t1'] };
  const resolved = resolveElementAnimation([entry], 't1', 1);
  // The box still animates as a whole when the caller asks for that (a shape, or a
  // box holding rich HTML); the text body is what skips it and hands it to the
  // characters instead.
  const style = animationStyle(resolved, { width: 1280, height: 720 });
  assert.equal(style.animationName, 'anim-dynamic');
  assert.equal(style.animationDuration, '600ms');
});

test('Dynamic survives a save and a reload, direction and all', () => {
  const saved = normalizeAnimation({ targetId: 't1', kind: 'entrance', effect: 'dynamic', direction: 'right' });
  assert.equal(saved.effect, 'dynamic');
  assert.equal(saved.direction, 'right');
  assert.equal(normalizeAnimation({ targetId: 't1', kind: 'emphasis', effect: 'dynamic', direction: 'left' }).kind, 'emphasis');
  assert.equal(normalizeAnimations([{ targetId: 't1', kind: 'entrance', effect: 'dynamic', direction: 'left' }]).length, 1);
  // The direction vocabulary is shared with the importer, so a direction this effect
  // does not list is kept rather than rewritten — and the wave only reverses for
  // 'right', so an unexpected direction simply waves left to right.
  const odd = normalizeAnimation({ targetId: 't1', kind: 'entrance', effect: 'dynamic', direction: 'topLeft' });
  assert.equal(odd.direction, 'topLeft');
  assert.equal(characterStyle(odd, 0, 5, true).animationDelay, '0ms', 'the first character still goes first');
  assert.equal(characterStyle(odd, 4, 5, true).animationDelay, `${characterStagger(odd, 5) * 4}ms`);
});

