/**
 * Pictures shown through text.
 *
 * A text box can carry a picture as its fill: the letters become the window, so a
 * word like "dynamic" shows the photo cut to the exact shape of its own letters.
 * The browser does the work with `background-clip: text` — the picture is painted
 * behind the text and everything but the glyphs is clipped away — which keeps the
 * text crisp, selectable and still editable.
 *
 * The element stores `textImage: { src, fit, scale, x, y }`, the same shape the
 * picture fills of a shape use, so the inspector can offer the same controls.
 */

/** How the picture is laid out behind the letters. */
export const TEXT_FITS = [
  { id: 'cover', label: 'Cover' },
  { id: 'contain', label: 'Contain' },
  { id: 'stretch', label: 'Stretch' },
];

/** Clamp a percentage into a sane range. */
const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

/**
 * The CSS that turns a text box into a window onto a picture, or null when the
 * element has no picture fill.
 *
 * `scale` only takes over from the fit when it is not 1: `cover` and `contain` are
 * what make a picture sit well inside letters, and CSS cannot express "cover, then
 * 1.5×", so zooming switches to an explicit percentage.
 */
export function textMaskStyle(image) {
  if (!image?.src) return null;
  const fit = TEXT_FITS.some((entry) => entry.id === image.fit) ? image.fit : 'cover';
  const scale = clamp(image.scale ?? 1, 0.1, 10);
  const x = clamp(image.x, -100, 100);
  const y = clamp(image.y, -100, 100);

  let size = 'cover';
  if (fit === 'stretch') size = '100% 100%';
  else if (fit === 'contain') size = scale === 1 ? 'contain' : `${Math.round(scale * 100)}% auto`;
  else if (scale !== 1) size = `${Math.round(scale * 100)}% auto`;

  return {
    backgroundImage: `url("${String(image.src).replace(/"/g, '%22')}")`,
    backgroundSize: size,
    backgroundRepeat: 'no-repeat',
    // The picture always stays inside the letters: 0% and 100% are the edges.
    backgroundPosition: `${clamp(50 + x, 0, 100)}% ${clamp(50 + y, 0, 100)}%`,
    // The letters are the mask: the text itself is painted transparent so only the
    // picture behind it shows.
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: 'transparent',
  };
}

/** True when the element is a text box showing a picture through its letters. */
export function hasTextPicture(element) {
  return Boolean(element?.type === 'text' && element.textImage?.src);
}

