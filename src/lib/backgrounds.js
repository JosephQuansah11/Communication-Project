/**
 * Slide background helpers: solid colours, images and CSS gradients.
 *
 * A slide background is a plain object:
 *   { color, image, gradient, fit, opacity, blur }
 * where `gradient` is `{ from, to, angle, type }` (type: 'linear' | 'radial').
 */

import { similarBackgroundSvg, slidePalette, themePalette } from '../../shared/backgrounds.js';

/** Ready-made looks for the background designer in the inspector. */
export const BACKGROUND_PRESETS = [
  { id: 'paper', label: 'Paper white', background: { color: '#ffffff', gradient: null } },
  { id: 'ink', label: 'Ink black', background: { color: '#04060f', gradient: null } },
  { id: 'slate', label: 'Slate', background: { color: '#0f172a', gradient: null } },
  {
    id: 'indigo',
    label: 'Indigo dusk',
    background: { color: '#312e81', gradient: { from: '#312e81', to: '#6366f1', angle: 135, type: 'linear' } },
  },
  {
    id: 'ocean',
    label: 'Ocean',
    background: { color: '#0e7490', gradient: { from: '#0e7490', to: '#22d3ee', angle: 120, type: 'linear' } },
  },
  {
    id: 'sunset',
    label: 'Sunset',
    background: { color: '#9d174d', gradient: { from: '#f97316', to: '#9d174d', angle: 160, type: 'linear' } },
  },
  {
    id: 'aurora',
    label: 'Aurora',
    background: { color: '#065f46', gradient: { from: '#22c55e', to: '#0ea5e9', angle: 200, type: 'linear' } },
  },
  {
    id: 'orchid',
    label: 'Orchid',
    background: { color: '#6b21a8', gradient: { from: '#a855f7', to: '#ec4899', angle: 145, type: 'linear' } },
  },
  {
    id: 'glow',
    label: 'Spotlight',
    background: { color: '#0b1120', gradient: { from: '#1e293b', to: '#0b1120', angle: 0, type: 'radial' } },
  },
  {
    id: 'ember',
    label: 'Ember glow',
    background: { color: '#111827', gradient: { from: '#fbbf24', to: '#111827', angle: 0, type: 'radial' } },
  },
];

export function gradientCss(gradient) {
  if (!gradient) return null;
  const from = gradient.from || '#6366f1';
  const to = gradient.to || '#0ea5e9';
  if (gradient.type === 'radial') return `radial-gradient(circle at 50% 38%, ${from}, ${to})`;
  const angle = Number.isFinite(Number(gradient.angle)) ? Number(gradient.angle) : 135;
  return `linear-gradient(${angle}deg, ${from}, ${to})`;
}

function imageSize(fit) {
  if (fit === 'contain') return 'contain';
  if (fit === 'stretch') return '100% 100%';
  return 'cover';
}

/**
 * Build the styles for a slide background.
 *
 * Returns `{ container, layer }`:
 * - `container` paints the solid colour behind everything (never translucent);
 * - `layer` stacks the image and/or gradient on top, honouring fit, opacity
 *   and blur. `layer` is null when the slide only uses a solid colour.
 */
export function backgroundStyles(background = {}) {
  const bg = background || {};
  const layers = [];
  const sizes = [];
  if (bg.image) {
    layers.push(`url("${bg.image}")`);
    sizes.push(imageSize(bg.fit));
  }
  const gradient = gradientCss(bg.gradient);
  if (gradient) {
    layers.push(gradient);
    sizes.push('cover');
  }
  const container = { backgroundColor: bg.color || '#ffffff' };
  if (!layers.length) return { container, layer: null };
  const layer = {
    backgroundColor: bg.color || '#ffffff',
    backgroundImage: layers.join(', '),
    backgroundSize: sizes.join(', '),
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    opacity: bg.opacity ?? 1,
    filter: bg.blur ? `blur(${bg.blur}px)` : undefined,
  };
  return { container, layer };
}

/** A short human label for what a background currently uses. */
export function describeBackground(background = {}) {
  const parts = [];
  if (background.image) parts.push('image');
  if (background.gradient) parts.push('gradient');
  parts.push('colour');
  return parts.join(' + ');
}

/* ----------------------------------------------------------------------- *
 * Picture fills
 *
 * A picture fill is `{ src, fit, opacity }`. The same shape is used for slide
 * backgrounds, for containers (text boxes and panels) and for shapes, so a
 * picture can be dropped behind anything.
 * ----------------------------------------------------------------------- */

/** Fit modes a picture fill understands. */
export const PICTURE_FITS = ['cover', 'contain', 'stretch', 'tile'];

function fitMode(fit) {
  return PICTURE_FITS.includes(fit) ? fit : 'cover';
}

function pictureSize(fit) {
  if (fit === 'contain') return 'contain';
  if (fit === 'stretch') return '100% 100%';
  if (fit === 'tile') return 'auto';
  return 'cover';
}

/** Sanitize whatever a deck (or the inspector) hands us into `{ src, fit, opacity }`. */
export function normalizePictureFill(fill) {
  if (!fill) return null;
  const source = typeof fill === 'string' ? { src: fill } : fill;
  const src = typeof source.src === 'string' ? source.src.trim() : '';
  if (!src) return null;
  const raw = Number(source.opacity);
  const opacity = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 1;
  return { src, fit: fitMode(source.fit), opacity };
}

/**
 * CSS for painting a picture fill in an HTML container (a text box, a panel or
 * the workspace behind the canvas). Returns null when there is no picture.
 */
export function pictureFillCss(fill) {
  const picture = normalizePictureFill(fill);
  if (!picture) return null;
  return {
    backgroundImage: `url("${picture.src}")`,
    backgroundSize: pictureSize(picture.fit),
    backgroundRepeat: picture.fit === 'tile' ? 'repeat' : 'no-repeat',
    backgroundPosition: 'center',
    opacity: picture.opacity,
  };
}

/**
 * How an SVG `<pattern>` should place a picture inside a shape. Shapes are
 * drawn in a 0–100 viewBox with `objectBoundingBox` units, so a full tile is
 * `1 × 1` and a tiled fill uses quarter tiles.
 */
export function picturePatternLayout(fit) {
  const mode = fitMode(fit);
  if (mode === 'contain') return { patternWidth: 1, patternHeight: 1, preserveAspectRatio: 'xMidYMid meet' };
  if (mode === 'stretch') return { patternWidth: 1, patternHeight: 1, preserveAspectRatio: 'none' };
  if (mode === 'tile') return { patternWidth: 0.25, patternHeight: 0.25, preserveAspectRatio: 'none' };
  return { patternWidth: 1, patternHeight: 1, preserveAspectRatio: 'xMidYMid slice' };
}

/* ----------------------------------------------------------------------- *
 * Workspace (window) background
 *
 * The editor window itself can wear a picture: it is painted behind the canvas
 * area and remembered per browser in localStorage.
 * ----------------------------------------------------------------------- */

export const WORKSPACE_BACKGROUND_DEFAULT = { image: null, fit: 'cover', opacity: 0.35, blur: 0 };

/** Styles for the workspace layer, or null when the window has no picture. */
export function workspaceBackgroundStyles(background = {}) {
  const bg = { ...WORKSPACE_BACKGROUND_DEFAULT, ...(background || {}) };
  const layer = pictureFillCss({ src: bg.image, fit: bg.fit, opacity: bg.opacity });
  if (!layer) return null;
  const blur = Number(bg.blur) || 0;
  return { ...layer, filter: blur ? `blur(${blur}px)` : undefined };
}

/* ----------------------------------------------------------------------- *
 * Generated "similar" backgrounds
 *
 * Imported decks often lose their design picture (it lived in the slide layout
 * or was linked from outside the file). The palette of the deck — its theme, or
 * failing that the colours used on the slide — is enough to generate a similar
 * background so the layout survives.
 * ----------------------------------------------------------------------- */

/** The colours a generated background should be built from. */
export function deckPalette(deck, slide) {
  const theme = themePalette(deck?.theme || {});
  if (theme.length) return theme.slice(0, 6);
  const own = slidePalette(slide || {});
  if (own.length) return own.slice(0, 6);
  return ['#0f172a', '#6366f1', '#22d3ee'];
}

/** A data-URL SVG background built from a palette. */
export function similarBackgroundDataUrl({ colors = [], width = 1280, height = 720, seed = 'quandrion' } = {}) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    similarBackgroundSvg({ colors, width, height, seed })
  )}`;
}

/** Ready-made background for a deck/slide: same palette, similar mood. */
export function similarBackgroundFor(deck, slide) {
  return {
    color: deckPalette(deck, slide)[0] || '#0f172a',
    gradient: null,
    image: similarBackgroundDataUrl({
      colors: deckPalette(deck, slide),
      width: Number(deck?.width) || 1280,
      height: Number(deck?.height) || 720,
      seed: deck?.id || 'quandrion',
    }),
    fit: 'cover',
    opacity: 1,
    blur: 0,
  };
}
