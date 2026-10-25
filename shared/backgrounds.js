/**
 * Generated "similar" backgrounds.
 *
 * Imported decks very often draw their design with a picture that lives in the
 * slide layout or the master (or with a theme fill). When that picture is not in
 * the package — linked media, a theme-only look, a trimmed file — the slide would
 * lose its layout entirely and fall back to plain white. Instead of that, a
 * background is *synthesised* from the deck's own theme colours: same palette,
 * same light/dark mood, a soft gradient with a few translucent shapes.
 *
 * The generator is shared by the importer (server) and the editor (client) and is
 * deterministic for a given seed, so the same deck always regenerates the same
 * look.
 */

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Theme colours in a sensible order: accents first, then light/dark and links. */
const THEME_ORDER = [
  'accent1',
  'accent2',
  'accent3',
  'accent4',
  'accent5',
  'accent6',
  'dk2',
  'lt2',
  'dk1',
  'lt1',
  'hlink',
  'folHlink',
];

export function themePalette(theme = {}) {
  const colors = theme?.colors || {};
  const list = [];
  for (const key of THEME_ORDER) if (colors[key]) list.push(colors[key]);
  for (const value of Object.values(colors)) if (value) list.push(value);
  return [...new Set(list.map((value) => String(value).toLowerCase()).filter((value) => HEX.test(value)))];
}

/** A palette for a slide with no theme: its own background, fills and text. */
export function slidePalette(slide = {}) {
  const colors = [];
  if (slide.background?.color) colors.push(slide.background.color);
  if (slide.background?.gradient?.from) colors.push(slide.background.gradient.from);
  for (const element of slide.elements || []) {
    if (typeof element.fill === 'string' && element.fill.startsWith('#')) colors.push(element.fill);
    if (element.style?.color) colors.push(element.style.color);
  }
  return [...new Set(colors.filter((value) => HEX.test(String(value))))];
}

function seededRandom(seed) {
  let state = 2166136261;
  for (const character of String(seed ?? 'slidesmith')) {
    state ^= character.charCodeAt(0);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822507);
    state = Math.imul(state ^ (state >>> 13), 3266489909);
    return ((state ^= state >>> 16) >>> 0) / 4294967296;
  };
}

function mix(hex, target, amount) {
  const value = String(hex).replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  if (!/^[0-9a-f]{6}$/i.test(full)) return hex;
  const channels = [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16));
  const mixed = channels.map((channel) => Math.round(channel + (target - channel) * amount));
  return `#${mixed.map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * An SVG background built from a palette: a soft diagonal gradient in the base
 * colour with the accent colours blurred across it, so an imported deck keeps a
 * look that matches its theme instead of a bare white slide.
 */
export function similarBackgroundSvg({ colors = [], width = 1280, height = 720, seed = 'slidesmith', intensity = 1 } = {}) {
  const palette = (colors || []).map((value) => String(value).toLowerCase()).filter((value) => HEX.test(value));
  const base = palette[0] || '#0f172a';
  const accents = palette.slice(1).length ? palette.slice(1) : ['#6366f1', '#22d3ee'];
  const random = seededRandom(seed);
  const count = Math.min(5, Math.max(2, accents.length));
  const short = Math.min(width, height);

  const blobs = [];
  for (let index = 0; index < count; index += 1) {
    blobs.push({
      color: accents[index % accents.length],
      cx: Math.round(random() * width),
      cy: Math.round(random() * height),
      r: Math.round(short * (0.3 + random() * 0.32)),
      opacity: (0.14 + random() * 0.22 * intensity).toFixed(2),
    });
  }

  const sweep = accents[0];
  const blur = Math.max(24, Math.round(short * 0.09));

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '  <defs>',
    '    <linearGradient id="base" x1="0%" y1="0%" x2="100%" y2="100%">',
    `      <stop offset="0%" stop-color="${base}"/>`,
    `      <stop offset="55%" stop-color="${mix(base, 0, 0.18)}"/>`,
    `      <stop offset="100%" stop-color="${mix(base, 255, 0.1)}"/>`,
    '    </linearGradient>',
    '    <linearGradient id="sweep" x1="0%" y1="100%" x2="100%" y2="0%">',
    `      <stop offset="0%" stop-color="${sweep}" stop-opacity="0.5"/>`,
    `      <stop offset="100%" stop-color="${sweep}" stop-opacity="0"/>`,
    '    </linearGradient>',
    `    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">`,
    `      <feGaussianBlur stdDeviation="${blur}"/>`,
    '    </filter>',
    '  </defs>',
    `  <rect width="${width}" height="${height}" fill="url(#base)"/>`,
    '  <g filter="url(#soft)">',
    ...blobs.map(
      (blob) =>
        `    <circle cx="${blob.cx}" cy="${blob.cy}" r="${blob.r}" fill="${blob.color}" opacity="${blob.opacity}"/>`
    ),
    '  </g>',
    `  <rect width="${width}" height="${height}" fill="url(#sweep)"/>`,
    '</svg>',
  ].join('\n');
}
