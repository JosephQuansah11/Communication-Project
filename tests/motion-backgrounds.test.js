/**
 * Looping motion backgrounds and video backgrounds.
 *
 * The scenes are SVG drawn by CSS, so the stylesheet is half of the feature: these
 * checks read it to prove every scene has keyframes that repeat forever, that the
 * speed control reaches them, and that nothing points at a scene or a video source
 * the app cannot actually show.
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

test('every scene has keyframes that repeat forever', () => {
  for (const id of MOTION_IDS) {
    assert.ok(new RegExp(`@keyframes motion-${id}-`).test(css), `styles.css defines keyframes for ${id}`);
    assert.ok(new RegExp(`\\.motion-${id}\\b`).test(css), `styles.css styles .motion-${id}`);
  }
  // A background scene has to loop: that is the whole point of it.
  const uses = [...css.matchAll(/animation:\s*(motion-[\w-]+)[^;]*;/g)];
  assert.ok(uses.length >= MOTION_IDS.length, `the scenes are animated (${uses.length} animations)`);
  for (const [declaration, name] of uses) {
    assert.match(declaration, /infinite/, `${name} loops forever`);
    assert.ok(new RegExp(`@keyframes ${name}\\b`).test(css), `@keyframes ${name} exists`);
  }
});

test('every scene answers the speed control', () => {
  // The renderer sets `--motion-speed` inline; each animation divides its pace by it.
  const uses = [...css.matchAll(/animation:\s*motion-[\w-]+[^;]*;/g)].map((match) => match[0]);
  for (const declaration of uses) {
    assert.match(declaration, /var\(--motion-speed/, declaration);
  }
  assert.equal(motionLoopSeconds(2.4, 1), 2.4);
  assert.equal(motionLoopSeconds(2.4, 2), 1.2);
  assert.equal(motionLoopSeconds(2.4, 0.5), 4.8);
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
