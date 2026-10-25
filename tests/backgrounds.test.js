import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PICTURE_FITS,
  WORKSPACE_BACKGROUND_DEFAULT,
  deckPalette,
  normalizePictureFill,
  pictureFillCss,
  picturePatternLayout,
  similarBackgroundDataUrl,
  similarBackgroundFor,
  workspaceBackgroundStyles,
} from '../src/lib/backgrounds.js';
import { similarBackgroundSvg, slidePalette, themePalette } from '../shared/backgrounds.js';
import { createShape, createText, normalizeDeck } from '../src/lib/elements.js';

test('picture fills accept a URL string or an object', () => {
  assert.deepEqual(normalizePictureFill('/media/photo.jpg'), { src: '/media/photo.jpg', fit: 'cover', opacity: 1 });
  assert.deepEqual(normalizePictureFill({ src: ' photo.jpg ', fit: 'tile', opacity: 0.4 }), {
    src: 'photo.jpg',
    fit: 'tile',
    opacity: 0.4,
  });
  assert.equal(normalizePictureFill(null), null);
  assert.equal(normalizePictureFill({ src: '   ' }), null);
  assert.equal(normalizePictureFill({ fit: 'cover' }), null);
});

test('unknown fits fall back to cover and opacity is clamped', () => {
  assert.equal(normalizePictureFill({ src: 'a.png', fit: 'squish' }).fit, 'cover');
  assert.equal(normalizePictureFill({ src: 'a.png', opacity: 5 }).opacity, 1);
  assert.equal(normalizePictureFill({ src: 'a.png', opacity: -2 }).opacity, 0);
  assert.deepEqual(PICTURE_FITS, ['cover', 'contain', 'stretch', 'tile']);
});

test('containers get background CSS for the picture fill', () => {
  assert.equal(pictureFillCss(null), null);
  assert.deepEqual(pictureFillCss({ src: 'a.png' }), {
    backgroundImage: 'url("a.png")',
    backgroundSize: 'cover',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center',
    opacity: 1,
  });
  assert.equal(pictureFillCss({ src: 'a.png', fit: 'contain' }).backgroundSize, 'contain');
  assert.equal(pictureFillCss({ src: 'a.png', fit: 'stretch' }).backgroundSize, '100% 100%');
  assert.equal(pictureFillCss({ src: 'a.png', fit: 'tile' }).backgroundRepeat, 'repeat');
});

test('shapes place the picture with an SVG pattern', () => {
  assert.deepEqual(picturePatternLayout('cover'), { patternWidth: 1, patternHeight: 1, preserveAspectRatio: 'xMidYMid slice' });
  assert.deepEqual(picturePatternLayout('contain'), { patternWidth: 1, patternHeight: 1, preserveAspectRatio: 'xMidYMid meet' });
  assert.deepEqual(picturePatternLayout('stretch'), { patternWidth: 1, patternHeight: 1, preserveAspectRatio: 'none' });
  assert.deepEqual(picturePatternLayout('tile'), { patternWidth: 0.25, patternHeight: 0.25, preserveAspectRatio: 'none' });
  assert.equal(picturePatternLayout('nonsense').preserveAspectRatio, 'xMidYMid slice');
});

test('the window background layer only exists when a picture is set', () => {
  assert.equal(workspaceBackgroundStyles({}), null);
  assert.equal(workspaceBackgroundStyles(WORKSPACE_BACKGROUND_DEFAULT), null);

  const layer = workspaceBackgroundStyles({ image: '/media/window.jpg', fit: 'cover', opacity: 0.4, blur: 8 });
  assert.equal(layer.backgroundImage, 'url("/media/window.jpg")');
  assert.equal(layer.opacity, 0.4);
  assert.equal(layer.filter, 'blur(8px)');
  assert.equal(workspaceBackgroundStyles({ image: 'x.png' }).filter, undefined);
});

test('shapes and text boxes normalise their picture fill on load', () => {
  const deck = normalizeDeck({
    id: 'deck-1',
    slides: [
      {
        id: 'slide-1',
        elements: [
          { id: 's1', type: 'shape', shape: 'rect', fillImage: { src: 'photo.png', fit: 'contain' } },
          { id: 't1', type: 'text', text: 'hi', fillImage: 'plain.png' },
          { id: 't2', type: 'text', text: 'none' },
        ],
      },
    ],
  });
  const [shape, text, plain] = deck.slides[0].elements;
  assert.deepEqual(shape.fillImage, { src: 'photo.png', fit: 'contain', opacity: 1 });
  assert.deepEqual(text.fillImage, { src: 'plain.png', fit: 'cover', opacity: 1 });
  assert.equal(plain.fillImage, null);
});

test('new shapes and text boxes start without a picture fill', () => {
  assert.equal(createShape('ellipse').fillImage, null);
  assert.equal(createText().fillImage, null);
});

test('the theme palette leads with the accent colours', () => {
  const palette = themePalette({
    colors: { dk1: '#000000', lt1: '#FFFFFF', accent1: '#6366F1', accent2: '#22d3ee', accent1dup: '#6366f1' },
  });
  assert.deepEqual(palette, ['#6366f1', '#22d3ee', '#000000', '#ffffff']);
  assert.deepEqual(themePalette({}), []);
  assert.deepEqual(themePalette({ colors: { accent1: 'not-a-colour' } }), []);
});

test('a slide without a theme lends its own colours', () => {
  const palette = slidePalette({
    background: { color: '#0b1120', gradient: { from: '#312e81' } },
    elements: [{ fill: '#6366f1' }, { style: { color: '#f8fafc' } }, { fill: 'transparent' }],
  });
  assert.deepEqual(palette, ['#0b1120', '#312e81', '#6366f1', '#f8fafc']);
});

test('a generated background keeps the palette and is deterministic', () => {
  const options = { colors: ['#0b1120', '#6366f1', '#22d3ee'], width: 1280, height: 720, seed: 'deck-1' };
  const svg = similarBackgroundSvg(options);
  assert.equal(svg, similarBackgroundSvg(options), 'same seed → same picture');
  assert.notEqual(svg, similarBackgroundSvg({ ...options, seed: 'deck-2' }));
  assert.ok(svg.startsWith('<svg '));
  assert.ok(svg.includes('#0b1120'), 'base colour is used');
  assert.ok(svg.includes('#6366f1') && svg.includes('#22d3ee'), 'accents are used');
  assert.ok(svg.includes('feGaussianBlur'), 'shapes are softened');
  assert.equal(svg.includes('NaN'), false);
  assert.ok(svg.includes('width="1280" height="720"'));
});

test('a generated background survives a deck without colours', () => {
  const svg = similarBackgroundSvg({});
  assert.ok(svg.includes('<svg '));
  assert.ok(svg.includes('#0f172a'));
});

test('deckPalette prefers the theme, then the slide, then a default', () => {
  assert.deepEqual(deckPalette({ theme: { colors: { accent1: '#abcdef' } } }, {}), ['#abcdef']);
  assert.deepEqual(deckPalette({}, { background: { color: '#123456' }, elements: [] }), ['#123456']);
  assert.deepEqual(deckPalette({}, {}), ['#0f172a', '#6366f1', '#22d3ee']);
});

test('similarBackgroundFor produces a usable background for a deck', () => {
  const deck = { id: 'deck-9', width: 1280, height: 720, theme: { colors: { accent1: '#ff8800', accent2: '#0044ff' } } };
  const background = similarBackgroundFor(deck, {});
  assert.equal(background.color, '#ff8800');
  assert.equal(background.fit, 'cover');
  assert.equal(background.opacity, 1);
  assert.ok(background.image.startsWith('data:image/svg+xml;charset=utf-8,'));
  const decoded = decodeURIComponent(background.image.split(',')[1]);
  assert.ok(decoded.includes('#ff8800') && decoded.includes('#0044ff'));

  const dataUrl = similarBackgroundDataUrl({ colors: ['#000000'], width: 640, height: 360, seed: 'x' });
  assert.ok(dataUrl.startsWith('data:image/svg+xml'));
});

