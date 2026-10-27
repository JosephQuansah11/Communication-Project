/**
 * The textures a burn needs, generated instead of downloaded.
 *
 * The reference burn (the Chernobyl pen) composites four pre-rendered sprite strips —
 * a burn strip, a burn-line strip and two ash strips — and steps through their frames
 * with `steps()` so the fire plays like film rather than sliding. This module builds
 * those strips from noise instead, so the app ships no binary art and nothing is
 * fetched, and it builds the dissolve mask that hides the outgoing slide along the same
 * noisy front the fire is drawn on.
 *
 * The pixel maths is pure and works on plain arrays, so `tests/burn.test.js` can check
 * it without a browser; only `toDataUrl` touches a canvas.
 */

/** The fire's own colours: white-hot core, amber, ember red. */
export const FIRE_RAMP: readonly (readonly [number, number, number])[] = [
  [255, 250, 232],
  [255, 226, 150],
  [255, 176, 56],
  [244, 122, 24],
  [176, 48, 12],
];

/** Cooled ash, from fresh char to nothing. */
export const ASH_RAMP: readonly (readonly [number, number, number])[] = [
  [10, 7, 6],
  [38, 24, 16],
  [86, 62, 44],
  [140, 120, 106],
];

/** Deterministic hash noise, the same shape as the shader's `rand`. */
export function rand(x: number, y: number, seed = 1): number {
  const value = Math.sin(x * 12.9898 + y * 4.1414 + seed * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0 || 1)));
  return t * t * (3 - 2 * t);
}

/** Value noise: the bilinear blend of four hashes, so it is smooth rather than static. */
export function noise(x: number, y: number, seed = 1): number {
  const bx = Math.floor(x);
  const by = Math.floor(y);
  const fx = smoothstep(0, 1, x - bx);
  const fy = smoothstep(0, 1, y - by);
  const top = rand(bx, by, seed) * (1 - fx) + rand(bx + 1, by, seed) * fx;
  const bottom = rand(bx, by + 1, seed) * (1 - fx) + rand(bx + 1, by + 1, seed) * fx;
  return top * (1 - fy) + bottom * fy;
}

/**
 * Fractal noise: four octaves of value noise, each finer and fainter than the last.
 * This is what makes a burn edge ragged at every scale at once.
 */
export function fbm(x: number, y: number, seed = 1, octaves = 4): number {
  let total = 0;
  let amplitude = 0.5;
  let frequencyX = x;
  let frequencyY = y;
  let norm = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += noise(frequencyX, frequencyY, seed + octave) * amplitude;
    norm += amplitude;
    frequencyX *= 2;
    frequencyY *= 2;
    amplitude *= 0.6;
  }
  return total / norm;
}

/** Where a colour sits on a ramp, `t` in 0–1. */
export function rampColor(ramp: readonly (readonly [number, number, number])[], t: number): [number, number, number] {
  const clamped = Math.min(1, Math.max(0, t));
  const scaled = clamped * (ramp.length - 1);
  const index = Math.min(ramp.length - 2, Math.floor(scaled));
  const mix = scaled - index;
  const [r0, g0, b0] = ramp[index];
  const [r1, g1, b1] = ramp[index + 1];
  return [
    Math.round(r0 + (r1 - r0) * mix),
    Math.round(g0 + (g1 - g0) * mix),
    Math.round(b0 + (b1 - b0) * mix),
  ];
}

/** A strip of frames laid out side by side, ready to be stepped through. */
export interface Strip {
  readonly width: number;
  readonly height: number;
  readonly frames: number;
  readonly pixels: Uint8ClampedArray;
}

export interface StripOptions {
  /** How many frames the strip holds. More frames, smoother fire. */
  frames?: number;
  /** One frame's size in pixels. */
  width?: number;
  height?: number;
  seed?: number;
  /** How far through its life the strip runs: 0 = freshly burning, 1 = gone. */
  from?: number;
  to?: number;
}

/**
 * The burn strip: the fire itself, one frame after another. Each frame is a band of
 * flame with a white-hot core, and the band cools and thins as the strip runs.
 */
export function burnStrip(options: StripOptions = {}): Strip {
  const frames = options.frames ?? 24;
  const width = options.width ?? 96;
  const height = options.height ?? 256;
  const seed = options.seed ?? 1;
  const from = options.from ?? 0;
  const to = options.to ?? 1;
  const pixels = new Uint8ClampedArray(width * frames * height * 4);

  for (let frame = 0; frame < frames; frame += 1) {
    const life = from + ((to - from) * frame) / Math.max(1, frames - 1);
    // The flame leans and flickers: a slow drift so consecutive frames differ.
    const drift = life * 6 + seed;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        // Across the band: hot in the middle, cooler at the edges.
        const across = Math.abs(x / width - 0.5) * 2;
        // Flames are thin and tall, so the noise varies quickly across the band and
        // slowly up it — the other way round and every flame becomes a streak.
        const grain = fbm(x * 0.17, y * 0.022 + drift, seed, 4);
        const tongues = fbm(x * 0.07 + 4, y * 0.012 - drift * 0.5, seed + 9, 3);
        const heat = (1 - across) * 1.2 + grain * 0.24 + tongues * 0.2;
        const edge = smoothstep(0.5, 0.95, heat);
        const alpha = Math.round(255 * edge * (1 - life * 0.55) * 0.85);
        const [r, g, b] = rampColor(FIRE_RAMP, Math.min(1, heat * (1.1 - life * 0.3)));
        const offset = ((frame * height + y) * width + x) * 4;
        pixels[offset] = r;
        pixels[offset + 1] = g;
        pixels[offset + 2] = b;
        pixels[offset + 3] = alpha;
      }
    }
  }
  return { width: width * frames, height, frames, pixels };
}

/**
 * The ash strip: what the fire leaves behind. It starts as char and cools to dust, so
 * the frames get lighter and sparser as the strip runs.
 */
export function ashStrip(options: StripOptions = {}): Strip {
  const frames = options.frames ?? 24;
  const width = options.width ?? 96;
  const height = options.height ?? 256;
  const seed = options.seed ?? 3;
  const from = options.from ?? 0;
  const to = options.to ?? 1;
  const pixels = new Uint8ClampedArray(width * frames * height * 4);

  for (let frame = 0; frame < frames; frame += 1) {
    const life = from + ((to - from) * frame) / Math.max(1, frames - 1);
    const drift = life * 3;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const cloud = fbm(x * 0.035 + 8, y * 0.03 - drift, seed, 4);
        const speckle = rand(x * 0.7, y * 0.7 + frame, seed + 5);
        // Ash thins out as it cools, and drifts upward.
        const density = cloud * (1 - life * 0.6) + speckle * 0.12 * (1 - life);
        const alpha = Math.round(255 * smoothstep(0.42, 0.78, density) * (1 - life * 0.35));
        const [r, g, b] = rampColor(ASH_RAMP, Math.min(1, density + life * 0.4));
        const offset = ((frame * height + y) * width + x) * 4;
        pixels[offset] = r;
        pixels[offset + 1] = g;
        pixels[offset + 2] = b;
        pixels[offset + 3] = alpha;
      }
    }
  }
  return { width: width * frames, height, frames, pixels };
}

/**
 * The dissolve mask: what is left of the outgoing slide at a given moment.
 *
 * The mask is a wide ramp — transparent on the left, opaque on the right — with a
 * noisy boundary between them. Sliding it across the slide (the stylesheet animates
 * `mask-position`) eats the slide away along that ragged edge, which is the same front
 * the fire is drawn on.
 */
export function dissolveMask(options: { width?: number; height?: number; seed?: number; softness?: number } = {}): Strip {
  const width = options.width ?? 512;
  const height = options.height ?? 288;
  const seed = options.seed ?? 7;
  // A tight boundary: a burn edge is ragged, not a fog. The mask is stretched over twice
  // the slide, so the noise has to be fine enough to read as flame-torn paper rather than
  // weather.
  const softness = options.softness ?? 0.02;
  const pixels = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // The boundary wanders down the mask, so the burn front is never a straight line.
      const wander = (fbm(x * 0.09, y * 0.05, seed, 4) - 0.5) * 0.16;
      // A finer grain on top of it, for the torn edge of the char itself.
      const grain = (fbm(x * 0.42, y * 0.34, seed + 11, 3) - 0.5) * 0.05;
      const ramp = x / width + wander + grain;
      const alpha = Math.round(255 * smoothstep(0.5 - softness, 0.5 + softness, ramp));
      const offset = (y * width + x) * 4;
      // White with varying alpha: the mask only cares about alpha, and a white mask
      // multiplies nothing else away.
      pixels[offset] = 255;
      pixels[offset + 1] = 255;
      pixels[offset + 2] = 255;
      pixels[offset + 3] = alpha;
    }
  }
  return { width, height, frames: 1, pixels };
}

/**
 * How the stylesheet steps through a strip.
 *
 * The strip is laid out as `frames` tiles side by side, so setting the background to
 * `frames × 100%` wide and animating `background-position` from 0 to 100% walks exactly
 * one tile per step — the same trick the reference uses with its pre-rendered strips,
 * but the frame count is ours. The stylesheet takes these as custom properties.
 */
export interface StripStyle {
  readonly frames: number;
  /** `background-size`, as a percentage of the element. */
  readonly size: string;
}

export function stripStyle(strip: Pick<Strip, 'frames'>): StripStyle {
  const frames = Math.max(2, Math.round(strip.frames));
  return { frames, size: `calc(${frames} * 100%) 100%` };
}

/**
 * Turn a strip into something CSS can wear.
 *
 * A canvas is the only way to get an image out of a pixel buffer, so this is the one
 * part that needs a browser; it returns `null` when there is none, which is what lets
 * the unit tests exercise the maths without one.
 */
export function toDataUrl(strip: Strip): string | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = strip.width;
  canvas.height = strip.height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const image = context.createImageData(strip.width, strip.height);
  image.data.set(strip.pixels);
  context.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

/** The strips a burn is drawn with, plus the mask that eats the slide away. */
export interface BurnTextures {
  readonly burn: string | null;
  readonly ash: string | null;
  readonly mask: string | null;
  readonly style: { burn: StripStyle; ash: StripStyle };
}

/** Build every texture a burn needs. The caller caches it: this is not cheap. */
export function buildBurnTextures(seed = 1): BurnTextures {
  const burn = burnStrip({ seed, frames: 24, width: 96, height: 256 });
  const ash = ashStrip({ seed: seed + 3, frames: 24, width: 96, height: 256 });
  return {
    burn: toDataUrl(burn),
    ash: toDataUrl(ash),
    mask: toDataUrl(dissolveMask({ seed: seed + 7 })),
    style: { burn: stripStyle(burn), ash: stripStyle(ash) },
  };
}

let cache: BurnTextures | null = null;

/**
 * The textures for this session, built once.
 *
 * Both the transition that dissolves the slide and the fire drawn over it need the same
 * mask, and neither should pay for it twice.
 */
export function burnTextures(seed = 1): BurnTextures {
  if (!cache) cache = buildBurnTextures(seed);
  return cache;
}
