/**
 * Looping motion backgrounds: the scenes a slide can wear behind its content.
 *
 * Each one is drawn as an inline SVG and animated by CSS (`styles.css`), so it loops
 * for as long as the slide is on screen without a media file, a network request or a
 * decoder. `MotionBackground.jsx` draws them; the ids here are what a slide stores in
 * `background.motion.id`, and `tests/motion-backgrounds.test.js` checks that every id
 * has the keyframes that bring it to life.
 *
 * A slide can also wear a real video (`background.video`), which the same renderer
 * plays on a loop, muted.
 */

export const MOTION_BACKGROUNDS = [
  { id: 'bouncingBall', label: 'Bouncing ball', hint: 'A ball bounces across the floor, squashing as it lands.' },
  { id: 'fallingCoin', label: 'Falling coin', hint: 'Coins spin and drop past the slide, over and over.' },
  { id: 'openBook', label: 'Open book', hint: 'An open book with its pages turning, one after another.' },
  { id: 'keyboard', label: 'Playing keyboard', hint: 'Keys press themselves in a steady rhythm.' },
  { id: 'microphone', label: 'Jumping microphone', hint: 'A microphone jumps into the scene and settles, over and over.' },
];

export const MOTION_IDS = MOTION_BACKGROUNDS.map((scene) => scene.id);

const BY_ID = new Map(MOTION_BACKGROUNDS.map((scene) => [scene.id, scene]));

export function isMotionBackground(id) {
  return BY_ID.has(id);
}

export function motionLabel(id) {
  return BY_ID.get(id)?.label || id;
}

const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
};

/**
 * Sanitize a stored scene: an id we know, with its opacity, blur and speed pulled
 * into range. Anything unrecognised is `null`, which means "no motion scene".
 */
export function normalizeMotionBackground(value) {
  if (!value) return null;
  const source = typeof value === 'string' ? { id: value } : value;
  if (!isMotionBackground(source.id)) return null;
  return {
    id: source.id,
    opacity: clamp(source.opacity, 0, 1, 0.45),
    blur: clamp(source.blur, 0, 40, 0),
    /** 1 = the scene's own pace; higher is faster. */
    speed: clamp(source.speed, 0.25, 3, 1),
  };
}

/** How long one loop of a scene takes, in seconds, once its speed is applied. */
export function motionLoopSeconds(base = 2.6, speed = 1) {
  return Number((base / clamp(speed, 0.25, 3, 1)).toFixed(3));
}

/**
 * The styles a motion scene is painted with: a low opacity so slide content stays
 * readable, an optional blur, and `--motion-speed` for the CSS to divide by.
 */
export function motionBackgroundCss(motion) {
  const scene = normalizeMotionBackground(motion);
  if (!scene) return null;
  return {
    opacity: scene.opacity,
    filter: scene.blur ? `blur(${scene.blur}px)` : undefined,
    '--motion-speed': String(scene.speed),
  };
}

/* ----------------------------------------------------------------------- *
 * Video backgrounds
 *
 * `background.video` is `{ src, name, fit, opacity, blur, loop, muted }`: a file the
 * deck uploaded or a URL. It plays muted on a loop, because that is the only kind of
 * autoplay a browser allows without asking.
 * ----------------------------------------------------------------------- */

const VIDEO_FITS = ['cover', 'contain', 'stretch'];

/** Only a source we can actually fetch: a path, an http(s) URL or a data URL. */
export function safeMediaSrc(src) {
  const value = typeof src === 'string' ? src.trim() : '';
  if (!value) return '';
  if (/^data:(video|image)\//i.test(value)) return value;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^\/[^/]/.test(value)) return value;
  return '';
}

export function normalizeBackgroundVideo(value) {
  if (!value) return null;
  const source = typeof value === 'string' ? { src: value } : value;
  const src = safeMediaSrc(source.src);
  if (!src) return null;
  return {
    src,
    name: source.name ? String(source.name) : '',
    fit: VIDEO_FITS.includes(source.fit) ? source.fit : 'cover',
    opacity: clamp(source.opacity, 0, 1, 1),
    blur: clamp(source.blur, 0, 40, 0),
    /** Both default to on: a background video loops silently. */
    loop: source.loop !== false,
    muted: source.muted !== false,
  };
}

/** The styles a video background is painted with. */
export function videoBackgroundCss(video) {
  const clip = normalizeBackgroundVideo(video);
  if (!clip) return null;
  return {
    opacity: clip.opacity,
    filter: clip.blur ? `blur(${clip.blur}px)` : undefined,
    objectFit: clip.fit === 'stretch' ? 'fill' : clip.fit,
  };
}
