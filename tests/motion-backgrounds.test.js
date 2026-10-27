/**
 * Looping motion backgrounds and video backgrounds.
 *
 * Every scene declares how it moves: three are drawn and animated by CSS, and two run
 * on the physics in `lib/motionPhysics.js` (a ball that bounces off the slide's own
 * edges, coins thrown from one hand). These checks read the stylesheet and the scene
 * registry to prove that whichever driver a scene names is really there — that is the
 * silent-break link between the catalog and what actually moves.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MOTION_BACKGROUNDS,
  MOTION_IDS,
  isMotionBackground,
  motionBackgroundCss,
  motionLabel,
  motionLoopSeconds,
  normalizeBackgroundVideo,
  normalizeMotionBackground,
  safeMediaSrc,
  videoBackgroundCss,
} from '../src/lib/motionBackgrounds.js';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const scenes = readFileSync(new URL('../src/components/motionScenes.jsx', import.meta.url), 'utf8');

/** The scenes CSS animates on its own, and the ones that need physics. */
const CSS_SCENES = ['openBook', 'keyboard', 'microphone'];
const PHYSICS_SCENES = ['bouncingBall', 'fallingCoin'];

test('the library offers the scenes the editor shows', () => {
  const ids = MOTION_BACKGROUNDS.map((scene) => scene.id);
  assert.deepEqual(ids, [...new Set(ids)], 'ids are unique');
  for (const scene of MOTION_BACKGROUNDS) {
    assert.ok(scene.label, `${scene.id} has a label`);
    assert.ok(scene.hint, `${scene.id} explains itself`);
  }
  // The five the gallery lists.
  assert.deepEqual(MOTION_IDS, ['bouncingBall', 'fallingCoin', 'openBook', 'keyboard', 'microphone']);
  assert.equal(motionLabel('bouncingBall'), 'Bouncing ball');
  assert.equal(motionLabel('nonsense'), 'nonsense');
});

test('every scene the stylesheet animates has keyframes that repeat forever', () => {
  for (const id of CSS_SCENES) {
    assert.ok(new RegExp(`@keyframes motion-${id}-`).test(css), `styles.css defines keyframes for ${id}`);
    assert.ok(new RegExp(`\\.motion-${id}\\b`).test(css), `styles.css styles .motion-${id}`);
    assert.ok(new RegExp(`\\b${id}:\\s*\\w+`).test(scenes), `motionScenes.jsx registers ${id}`);
  }
  // A background scene has to loop: that is the whole point of it.
  const uses = [...css.matchAll(/animation:\s*(motion-[\w-]+)[^;]*;/g)];
  assert.ok(uses.length >= CSS_SCENES.length, `the scenes are animated (${uses.length} animations)`);
  for (const [declaration, name] of uses) {
    assert.match(declaration, /infinite/, `${name} loops forever`);
    assert.ok(new RegExp(`@keyframes ${name}\\b`).test(css), `@keyframes ${name} exists`);
  }
});

test('every scene CSS animates answers the speed control', () => {
  // The renderer sets `--motion-speed` inline; each animation divides its pace by it.
  const uses = [...css.matchAll(/animation:\s*motion-[\w-]+[^;]*;/g)].map((match) => match[0]);
  assert.ok(uses.length, 'there is something to check');
  for (const declaration of uses) {
    assert.match(declaration, /var\(--motion-speed/, declaration);
  }
  assert.equal(motionLoopSeconds(2.4, 1), 2.4);
  assert.equal(motionLoopSeconds(2.4, 2), 1.2);
  assert.equal(motionLoopSeconds(2.4, 0.5), 4.8);
});

test('the physics scenes are the ones that need stepping, and they get it', () => {
  for (const id of PHYSICS_SCENES) {
    assert.ok(new RegExp(`\\.motion-${id}\\b`).test(css), `styles.css paints .motion-${id}`);
    assert.ok(new RegExp(`\\b${id}:\\s*\\w+`).test(scenes), `motionScenes.jsx registers ${id}`);
  }
  // The ball and the coins are moved by the simulation, not by a CSS animation, so
  // the stylesheet must NOT be animating them — a leftover `animation:` would fight
  // the physics for the same transform.
  for (const id of PHYSICS_SCENES) {
    const rules = [...css.matchAll(new RegExp(`\\.motion-${id}[^{]*\\{[^}]*\\}`, 'g'))].map((match) => match[0]);
    assert.ok(rules.length, `${id} is painted`);
    for (const rule of rules) {
      assert.ok(!/animation:/.test(rule), `${id} is left to the physics: ${rule.split('{')[0].trim()}`);
    }
  }
  // And the scene file really does hand them to the loop.
  assert.match(scenes, /usePhysicsLoop\(/, 'the scenes run a frame loop');
  assert.match(scenes, /stepBall\(/, 'the ball is stepped');
  assert.match(scenes, /stepCoin\(/, 'the coins are stepped');
  assert.match(scenes, /createBall\(/, 'the ball is thrown');
  assert.match(scenes, /createCoin\(/, 'the coins are thrown');
});


test('a scene is sanitized into something showable', () => {
  const scene = normalizeMotionBackground({ id: 'openBook', opacity: 0.7, blur: 4, speed: 1.5 });
  assert.deepEqual(scene, { id: 'openBook', opacity: 0.7, blur: 4, speed: 1.5 });
  // A bare id is enough.
  assert.equal(normalizeMotionBackground('keyboard').id, 'keyboard');
  // Out-of-range values are pulled back in, not rejected.
  const clamped = normalizeMotionBackground({ id: 'keyboard', opacity: 9, blur: -4, speed: 99 });
  assert.deepEqual(clamped, { id: 'keyboard', opacity: 1, blur: 0, speed: 3 });
  // A scene nobody knows is no scene at all.
  assert.equal(normalizeMotionBackground({ id: 'fireworks' }), null);
  assert.equal(normalizeMotionBackground(null), null);
  assert.equal(normalizeMotionBackground(''), null);
  assert.equal(isMotionBackground('microphone'), true);
  assert.equal(isMotionBackground('microphone2'), false);
});

test('the scene styles carry the opacity, blur and speed', () => {
  assert.deepEqual(motionBackgroundCss({ id: 'keyboard', opacity: 0.4, blur: 0, speed: 1 }), {
    opacity: 0.4,
    filter: undefined,
    '--motion-speed': '1',
  });
  const blurred = motionBackgroundCss({ id: 'keyboard', opacity: 0.5, blur: 6, speed: 2 });
  assert.equal(blurred.filter, 'blur(6px)');
  assert.equal(blurred['--motion-speed'], '2');
  assert.equal(motionBackgroundCss(null), null);
  assert.equal(motionBackgroundCss({ id: 'nope' }), null);
});

test('a video background keeps only what it can play', () => {
  const clip = normalizeBackgroundVideo({ src: '/media/deck/loop.mp4', name: 'loop.mp4' });
  assert.deepEqual(clip, {
    src: '/media/deck/loop.mp4',
    name: 'loop.mp4',
    fit: 'cover',
    opacity: 1,
    blur: 0,
    loop: true,
    muted: true,
  });
  // A bare URL works too.
  assert.equal(normalizeBackgroundVideo('https://example.com/clip.webm').src, 'https://example.com/clip.webm');
  // Looping and muting are the defaults; both can be turned off.
  const once = normalizeBackgroundVideo({ src: '/media/a.mp4', loop: false, muted: false, fit: 'contain', opacity: 0.5 });
  assert.equal(once.loop, false);
  assert.equal(once.muted, false);
  assert.equal(once.fit, 'contain');
  assert.equal(once.opacity, 0.5);
  // An unknown fit falls back to cover.
  assert.equal(normalizeBackgroundVideo({ src: '/media/a.mp4', fit: 'tile' }).fit, 'cover');
/* ----------------------------------------------------------------------- *
 * The bible: one timeline, closed then open then closed again
 * ----------------------------------------------------------------------- */

/** The body of an `@keyframes` block, braces and all. */
function keyframeBlock(name) {
  const start = css.indexOf(`@keyframes ${name} {`);
  assert.ok(start >= 0, `@keyframes ${name} exists`);
  let depth = 0;
  for (let index = css.indexOf('{', start); index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    else if (css[index] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(start, index + 1);
    }
  }
  return '';
}

/** A keyframe's stops as `{ at: [percentages], body: 'declarations' }`. */
function stops(name) {
  const body = keyframeBlock(name);
  const inner = body.slice(body.indexOf('{') + 1, body.lastIndexOf('}'));
  return [...inner.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((match) => ({
    at: match[1]
      .split(',')
      .map((value) => Number.parseFloat(value))
      .filter((value) => !Number.isNaN(value)),
    body: match[2].trim(),
  }));
}

/** When a transform goes from its resting value to its turned value, in per cent. */
function turnWindow(name, property) {
  const list = stops(name);
  const turned = list.find((stop) => new RegExp(`${property}\\(-?[1-9]`).test(stop.body));
  const before = list[list.indexOf(turned) - 1];
  return { start: before.at[before.at.length - 1], end: turned.at[0], value: turned.body };
}

test('the bible is one timeline: closed, open, then closed again', () => {
  // Every part of the sequence runs for the same cycle, scaled by the speed control.
  const parts = ['shift', 'light', 'glow', 'cover', 'leaf-a', 'leaf-b', 'leaf-c', 'front', 'back'];
  for (const part of parts) {
    assert.ok(new RegExp(`animation(-name)?:[^;]*motion-openBook-${part}\\b`).test(css), `${part} is animated`);
  }
  const rules = [...css.matchAll(/animation:\s*motion-openBook-[\w-]+[^;]*;/g)].map((match) => match[0]);
  assert.ok(rules.length >= parts.length, `${rules.length} animations drive the scene`);
  for (const rule of rules) {
    assert.match(rule, /var\(--motion-speed/, `${rule} follows the speed control`);
    assert.match(rule, /infinite/, `${rule} loops`);
  }
  // The sequence itself is one cycle; only the light and the dust move to their own beat.
  const sequence = ['shift', 'light', 'glow', 'cover', 'leaf-a', 'leaf-b', 'leaf-c'];
  const cycle = [...css.matchAll(/animation:\s*motion-openBook-([\w-]+)[^;]*;/g)].filter((match) =>
    sequence.includes(match[1])
  );
  assert.equal(cycle.length, sequence.length, 'every part of the sequence is animated');
  for (const [rule, part] of cycle) {
    assert.match(rule, /calc\(11s \/ var\(--motion-speed/, `${part} runs for the whole cycle`);
  }

  // The cover swings right back, and comes home again.
  const cover = turnWindow('motion-openBook-cover', 'rotateY');
  assert.ok(cover.value.includes('rotateY(-168deg)'), `the cover opens wide: ${cover.value}`);
  assert.ok(cover.start > 0, 'after a moment standing closed');
  const timing = coverTiming();
  assert.match(stops('motion-openBook-cover')[0].body, /rotateY\(0deg\)/, 'it starts closed');
  assert.match(stops('motion-openBook-cover')[2].body, /rotateY\(0deg\)/, 'and ends closed');
  assert.ok(timing.shutEnd <= 100 && timing.shutStart > timing.openEnd, 'it is open for most of the cycle');
});

/** The cover's own four moments: when it starts to open, when it is open, and the same
    for shutting. */
function coverTiming() {
  const list = stops('motion-openBook-cover');
  return {
    openStart: list[0].at[list[0].at.length - 1],
    openEnd: list[1].at[0],
    shutStart: list[1].at[list[1].at.length - 1],
    shutEnd: list[2].at[0],
  };
}

test('the pages turn one after the other, from the top of the stack down', () => {
  const c = turnWindow('motion-openBook-leaf-c', 'rotateY');
  const b = turnWindow('motion-openBook-leaf-b', 'rotateY');
  const a = turnWindow('motion-openBook-leaf-a', 'rotateY');
  const cover = coverTiming();

  // The cover is out of the way before the first page moves, and the book is only shut
  // again once every page is back.
  assert.ok(cover.openEnd <= c.start, `the cover opens (${cover.openEnd}%) before the first page turns (${c.start}%)`);
  assert.ok(a.end <= cover.shutStart, `the last page is back (${a.end}%) before the cover closes (${cover.shutStart}%)`);

  // One after another, and never two at once.
  assert.ok(c.start < b.start && b.start < a.start, `turn order ${c.start} → ${b.start} → ${a.start}`);
  assert.ok(c.end <= b.start, 'the first page is flat before the second starts');
  assert.ok(b.end <= a.start, 'the second is flat before the third starts');

  // The one that turns first is the one drawn last, which is the one you can see: the
  // cover's inside is painted under the pages, and the cover's face over them.
  const order = ['mb-book-inside', 'mb-book-leaf', 'mb-book-front'].map((name) => scenes.indexOf(name));
  assert.ok(order.every((index) => index > -1), 'every layer is in the scene');
  assert.deepEqual([...order].sort((x, y) => x - y), order, 'the layers are drawn inside → leaves → cover');
  assert.match(css, /\.motion-openBook \.mb-book-leaf-c\b/, 'the leaves are named so the top of the stack turns first');
  assert.match(scenes, /\['a', 'b', 'c'\]/, 'three leaves');

  // All three come back to flat, so the book can close.
  for (const name of ['motion-openBook-leaf-a', 'motion-openBook-leaf-b', 'motion-openBook-leaf-c']) {
    const list = stops(name);
    assert.match(list[0].body, /rotateY\(0deg\)/, `${name} starts flat`);
    assert.match(list[list.length - 1].body, /rotateY\(0deg\)/, `${name} ends flat`);
  }
});

test('the cover is never closed with the wrong face showing', () => {
  const front = stops('motion-openBook-front');
  const back = stops('motion-openBook-back');
  const cover = coverTiming();
  // Closed: the leather and the cross face the room.
  assert.match(front[0].body, /opacity:\s*1/, 'the cover art is up while closed');
  assert.match(back[0].body, /opacity:\s*0/, 'and the pastedown is not');
  // Open: the other way round.
  assert.match(front[1].body, /opacity:\s*0/, 'it is hidden while the book is open');
  assert.match(back[1].body, /opacity:\s*1/, 'and the pastedown shows');
  // The two faces swap over while the cover is on its way back, so the book is never
  // shut with its inside facing the room — and never shows the cross through itself.
  const artBack = front[2].at[0];
  const pastedownGone = back[2].at[0];
  assert.match(front[2].body, /opacity:\s*1/, 'the art comes back');
  assert.match(back[2].body, /opacity:\s*0/, 'and the pastedown goes');
  assert.ok(artBack >= cover.shutStart && artBack < cover.shutEnd, `the swap happens as it swings shut (${cover.shutStart}–${cover.shutEnd}%), not at ${artBack}%`);
  assert.equal(pastedownGone, artBack, 'the two faces swap at the same moment');
});

});

test('a video source that cannot be fetched is refused', () => {
  assert.equal(normalizeBackgroundVideo({}), null);
  assert.equal(normalizeBackgroundVideo({ src: '   ' }), null);
  assert.equal(normalizeBackgroundVideo(null), null);
  // Only a path, an http(s) URL or a data URL: never a script, a file on disk or a
  // scheme that would hand the slide something the browser has to guess about.
  assert.equal(safeMediaSrc('javascript:alert(1)'), '');
  assert.equal(safeMediaSrc('file:///C:/secret.mp4'), '');
  assert.equal(safeMediaSrc('C:\\videos\\loop.mp4'), '');
  assert.equal(safeMediaSrc('vbscript:msgbox'), '');
  assert.equal(safeMediaSrc('/media/deck/loop.mp4'), '/media/deck/loop.mp4');
  assert.equal(safeMediaSrc('http://example.com/a.mp4'), 'http://example.com/a.mp4');
  assert.equal(safeMediaSrc('https://example.com/a.mp4'), 'https://example.com/a.mp4');
  assert.equal(safeMediaSrc('data:video/mp4;base64,AAAA'), 'data:video/mp4;base64,AAAA');
  assert.equal(safeMediaSrc('data:text/html;base64,AAAA'), '');
});

test('the video styles cover the slide the way the fit says', () => {
  assert.deepEqual(videoBackgroundCss({ src: '/media/a.mp4' }), { opacity: 1, filter: undefined, objectFit: 'cover' });
  assert.equal(videoBackgroundCss({ src: '/media/a.mp4', fit: 'stretch' }).objectFit, 'fill');
  assert.equal(videoBackgroundCss({ src: '/media/a.mp4', fit: 'contain', opacity: 0.4 }).objectFit, 'contain');
  assert.equal(videoBackgroundCss({ src: '/media/a.mp4', blur: 3 }).filter, 'blur(3px)');
  assert.equal(videoBackgroundCss(null), null);
});
