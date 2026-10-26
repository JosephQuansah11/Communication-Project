import test from 'node:test';
import assert from 'node:assert/strict';
import { TEXT_FITS, hasTextPicture, textMaskStyle } from '../src/lib/textmask.js';

test('a picture is clipped to the letters of the text', () => {
  const style = textMaskStyle({ src: '/uploads/dynamic.png' });

  // The picture sits behind the glyphs and everything else is clipped away.
  assert.equal(style.backgroundImage, 'url("/uploads/dynamic.png")');
  assert.equal(style.WebkitBackgroundClip, 'text');
  assert.equal(style.backgroundClip, 'text');
  assert.equal(style.color, 'transparent');
  assert.equal(style.WebkitTextFillColor, 'transparent');
  assert.equal(style.backgroundRepeat, 'no-repeat');

  // Defaults: cover, centred.
  assert.equal(style.backgroundSize, 'cover');
  assert.equal(style.backgroundPosition, '50% 50%');
});

test('fit, zoom and position shape the picture inside the letters', () => {
  const contain = textMaskStyle({ src: '/a.png', fit: 'contain' });
  assert.equal(contain.backgroundSize, 'contain');

  const stretch = textMaskStyle({ src: '/a.png', fit: 'stretch' });
  assert.equal(stretch.backgroundSize, '100% 100%');

  // Zooming cannot be expressed on top of cover/contain, so it becomes a percentage.
  const zoomed = textMaskStyle({ src: '/a.png', fit: 'cover', scale: 1.5 });
  assert.equal(zoomed.backgroundSize, '150% auto');
  assert.equal(textMaskStyle({ src: '/a.png', fit: 'contain', scale: 2 }).backgroundSize, '200% auto');
  // At 1:1 the fit stands, so a default box is untouched.
  assert.equal(textMaskStyle({ src: '/a.png', fit: 'cover', scale: 1 }).backgroundSize, 'cover');

  const moved = textMaskStyle({ src: '/a.png', x: -25, y: 40 });
  assert.equal(moved.backgroundPosition, '25% 90%');

  // Values outside the sensible range are clamped rather than trusted.
  const wild = textMaskStyle({ src: '/a.png', scale: 99, x: 900, y: -900 });
  assert.equal(wild.backgroundSize, '1000% auto');
  assert.equal(wild.backgroundPosition, '100% 0%');

  // A quote in a file name cannot break out of the url().
  assert.equal(textMaskStyle({ src: '/a"b.png' }).backgroundImage, 'url("/a%22b.png")');
});

test('only a text box with a picture fill is masked', () => {
  assert.equal(textMaskStyle(null), null);
  assert.equal(textMaskStyle({}), null);
  assert.equal(textMaskStyle({ src: '' }), null);

  assert.equal(hasTextPicture({ type: 'text', textImage: { src: '/a.png' } }), true);
  assert.equal(hasTextPicture({ type: 'text' }), false);
  assert.equal(hasTextPicture({ type: 'image', textImage: { src: '/a.png' } }), false);
  assert.equal(hasTextPicture(null), false);

  assert.deepEqual(
    TEXT_FITS.map((entry) => entry.id),
    ['cover', 'contain', 'stretch']
  );
});
