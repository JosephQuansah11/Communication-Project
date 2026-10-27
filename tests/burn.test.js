/**
 * The burn away transition: the generated textures, the shader and the stylesheet.
 *
 * The burn is three pieces working together — a mask carved from noise that dissolves
 * the outgoing slide, sprite strips stepped through frame by frame for the flames and
 * the ash, and a WebGL shader drawing the fire along the same front. These checks hold
 * the maths (which is pure and runs in Node) and the contract between the three, which
 * is where this kind of effect usually breaks silently.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ASH_RAMP,
  FIRE_RAMP,
  ashStrip,
  buildBurnTextures,
  burnStrip,
  dissolveMask,
  fbm,
  noise,
  rampColor,
  rand,
  stripStyle,
  toDataUrl,
} from '../src/lib/burnTexture.ts';
import {
  BURN_FRAGMENT_SHADER,
  BURN_SHADER_INFO,
  BURN_VERTEX_SHADER,
  burnFront,
  burnProgress,
  createBurnRenderer,
} from '../src/lib/burnShader.ts';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const component = readFileSync(new URL('../src/components/BurnTransition.tsx', import.meta.url), 'utf8');

/** The average of a channel across a strip, and how much of it is painted at all. */
function stats(strip) {
  let alpha = 0;
  let red = 0;
  for (let i = 0; i < strip.pixels.length; i += 4) {
    alpha += strip.pixels[i + 3];
    red += strip.pixels[i];
  }
  const count = strip.pixels.length / 4;
  return { alpha: alpha / count, red: red / count };
}

/** One frame of a strip, as a plain array of pixels. */
function frame(strip, index) {
  const per = strip.width / strip.frames;
  const out = [];
  for (let y = 0; y < strip.height; y += 1) {
    for (let x = 0; x < per; x += 1) {
      const offset = (y * strip.width + index * per + x) * 4;
      out.push([strip.pixels[offset], strip.pixels[offset + 1], strip.pixels[offset + 2], strip.pixels[offset + 3]]);
    }
  }
  return out;
}

test('the noise is deterministic, smooth and in range', () => {
  assert.equal(rand(3.2, 7.1, 5), rand(3.2, 7.1, 5), 'the same point gives the same value');
  assert.notEqual(rand(3.2, 7.1, 5), rand(3.2, 7.1, 6), 'a different seed gives a different value');
  for (let i = 0; i < 200; i += 1) {
    const value = fbm(i * 0.37, i * 0.11, 3);
    assert.ok(value >= 0 && value <= 1, `fbm stays in range (${value})`);
  }
  // Smooth: a small step should not be a jump, or the burn edge would be static rather
  // than a shape.
  const a = noise(10, 10, 1);
  const b = noise(10.05, 10, 1);
  assert.ok(Math.abs(a - b) < 0.4, `neighbouring samples are close (${Math.abs(a - b)})`);
  // And it really is fractal: more octaves add finer detail, not a different value.
  const coarse = fbm(4.2, 8.4, 2, 1);
  const fine = fbm(4.2, 8.4, 2, 4);
  assert.ok(Math.abs(coarse - fine) < 0.5, 'the octaves build on each other');
});

test('a colour ramp mixes between its stops', () => {
  assert.deepEqual(rampColor(FIRE_RAMP, 0), [...FIRE_RAMP[0]]);
  assert.deepEqual(rampColor(FIRE_RAMP, 1), [...FIRE_RAMP[FIRE_RAMP.length - 1]]);
  const middle = rampColor(FIRE_RAMP, 0.5);
  assert.ok(middle[0] >= 200 && middle[2] <= 160, `the middle is still fire (${middle})`);

test('the burn strip is a band of flame, not a slab', () => {
  const strip = burnStrip({ frames: 8, width: 64, height: 128, seed: 2 });
  assert.equal(strip.width, 64 * 8, 'the frames are laid out side by side');
  assert.equal(strip.height, 128);
  assert.equal(strip.frames, 8);
  assert.equal(strip.pixels.length, strip.width * strip.height * 4);

  const overall = stats(strip);
  // A flame band covers part of its frame, and it is hot: mostly red, and a good deal
  // of it is not painted at all.
  assert.ok(overall.alpha > 20 && overall.alpha < 200, `it covers part of the frame (${overall.alpha})`);
  assert.ok(overall.red > 120, `and it is hot (red ${overall.red})`);

  // The middle of a frame is hotter than its edges: that is what makes it a band.
  const pixels = frame(strip, 0);
  const per = strip.width / strip.frames;
  const column = (x) => {
    let sum = 0;
    for (let y = 0; y < strip.height; y += 1) sum += pixels[y * per + x][3];
    return sum / strip.height;
  };
  assert.ok(column(Math.floor(per / 2)) > column(1) + 10, 'the middle of the band is painted more than its edge');
  assert.ok(column(Math.floor(per / 2)) > column(per - 2) + 10, 'on both sides');
});

test('the ash strip cools as it runs', () => {
  const strip = ashStrip({ frames: 8, width: 64, height: 128, seed: 4 });
  const first = stats({ ...strip, pixels: new Uint8ClampedArray(frame(strip, 0).flat()) });
  const last = stats({ ...strip, pixels: new Uint8ClampedArray(frame(strip, 7).flat()) });
  // Ash is sparse and dark, and it thins out as the frames go by.
  assert.ok(first.alpha < 90, `ash is sparse (${first.alpha})`);
  assert.ok(first.red < 120, `and dark (red ${first.red})`);
  assert.ok(last.alpha < first.alpha + 1, 'the last frame is no heavier than the first');
});

test('the mask dissolves one side and keeps the other', () => {
  const mask = dissolveMask({ width: 200, height: 80, seed: 5 });
  assert.equal(mask.frames, 1);
  const at = (x, y = 40) => mask.pixels[(y * mask.width + x) * 4 + 3];
  // Opaque on the right (the slide that is left), clear on the left (what has burned).
  assert.equal(at(2), 0, 'the far left is gone');
  assert.equal(at(197), 255, 'the far right is kept');
  // The boundary is tight and ragged rather than a straight fog: within a narrow column
  // the alpha crosses from clear to opaque.
  const column = [];
  for (let x = 80; x < 120; x += 1) column.push(at(x));
  assert.ok(column[0] < 20 && column[column.length - 1] > 235, 'the ramp crosses inside the column');
  const boundary = new Set();
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 70; x < 130; x += 1) {
      if (at(x, y) > 120) {
        boundary.add(x);
        break;
      }
    }
  }
  assert.ok(boundary.size > 6, `the edge wanders down the mask (${boundary.size} columns)`);
  assert.ok(Math.max(...boundary) - Math.min(...boundary) < 60, 'without wandering off the middle');
});

test('the stylesheet can step through a strip', () => {
  const style = stripStyle({ frames: 24 });
  assert.equal(style.frames, 24);
  // One tile per step: the background is as many widths wide as there are frames.
  assert.equal(style.size, 'calc(24 * 100%) 100%');
  assert.equal(stripStyle({ frames: 1 }).frames, 2, 'a strip needs at least two frames to step');
});

test('the textures come out as images in a browser, and as nothing without one', () => {
  // Node has no canvas, so this is the branch that has to be honest about it.
  assert.equal(toDataUrl(burnStrip({ frames: 2, width: 8, height: 8 })), null);
  const textures = buildBurnTextures(1);
  assert.equal(textures.burn, null);
  assert.equal(textures.mask, null);
  assert.equal(textures.style.burn.frames, 24);
  assert.equal(textures.style.ash.size, 'calc(24 * 100%) 100%');
});

  // Out of range is clamped, never extrapolated.
  assert.deepEqual(rampColor(ASH_RAMP, -3), [...ASH_RAMP[0]]);
  assert.deepEqual(rampColor(ASH_RAMP, 9), [...ASH_RAMP[ASH_RAMP.length - 1]]);
});


/* ----------------------------------------------------------------------- *
 * The shader
 * ----------------------------------------------------------------------- */

test('the shader is the fire: noise, a hot edge, and a sweep across', () => {
  const source = readFileSync(new URL('../src/lib/burnShader.ts', import.meta.url), 'utf8');
  for (const uniform of BURN_SHADER_INFO.uniforms) {
    assert.ok(new RegExp(`uniform[^;]*\\b${uniform}\\b`).test(BURN_FRAGMENT_SHADER), `${uniform} is declared`);
    assert.ok(new RegExp(`getUniformLocation\\(program, '${uniform}'\\)`).test(source), `${uniform} is wired up`);
  }
  assert.match(BURN_VERTEX_SHADER, /attribute vec2 a_position/, 'the vertex shader takes the quad');
  // Fractal noise, four octaves — the same maths the mask is built with.
  assert.match(BURN_FRAGMENT_SHADER, /float fbm\(vec2 n\)/, 'it has fractal noise');
  assert.match(BURN_FRAGMENT_SHADER, /for \(int i = 0; i < 4; i\+\+\)/, 'with several octaves');
  // The front crosses sideways, with a white-hot core right on it.
  assert.match(BURN_FRAGMENT_SHADER, /uv\.x - front/, 'the distance to the front is measured across');
  assert.match(BURN_FRAGMENT_SHADER, /exp\(-abs\(distanceToFront\) \* 110\.0\)/, 'with a white-hot core');
  // Nothing is drawn at the very start or the very end, or the fire would pop.
  assert.match(BURN_FRAGMENT_SHADER, /smoothstep\(0\.0, 0\.06, u_progress\)/, 'it fades in');
  assert.match(BURN_FRAGMENT_SHADER, /1\.0 - smoothstep\(0\.94, 1\.0, u_progress\)/, 'and out');
  // The noise is squared against the slide, not the narrow band the canvas covers.
  assert.match(BURN_FRAGMENT_SHADER, /uv\.x \* u_aspect/, 'the noise follows the slide shape');
});

test('the front crosses the slide at an even pace', () => {
  assert.equal(burnProgress(0, 1500), 0);
  assert.equal(burnProgress(750, 1500), 0.5);
  assert.equal(burnProgress(1500, 1500), 1);
  // It never overshoots, and a nonsense duration cannot divide by zero.
  assert.equal(burnProgress(3000, 1500), 1);
  assert.equal(burnProgress(-200, 1500), 0);
  assert.equal(burnProgress(500, 0), 1);
  assert.equal(burnProgress(500, Number.NaN), 1);

  // The band starts just off the left edge and finishes just past the right one, so the
  // fire sweeps in and out rather than appearing and vanishing in place.
  assert.ok(burnFront(0) < 0, 'it starts off the left');
  assert.ok(burnFront(1) > 1, 'and leaves past the right');
  assert.equal(burnFront(0.5), 0.5, 'crossing the middle halfway through');
  assert.ok(burnFront(0.3) < burnFront(0.7), 'always moving the same way');
  assert.equal(burnFront(-4), burnFront(0), 'clamped');
  assert.equal(burnFront(9), burnFront(1), 'clamped');
});

test('a browser without WebGL gets no renderer, not a broken one', () => {
  // Node has no canvas at all: the caller has to be able to fall back to the CSS fire.
  assert.equal(createBurnRenderer(null), null);
  assert.equal(createBurnRenderer({}), null);
});


/* ----------------------------------------------------------------------- *
 * The stylesheet's half of the bargain
 * ----------------------------------------------------------------------- */

test('the outgoing slide is dissolved by the generated mask', () => {
  const hold = css.slice(css.indexOf('.transition-hold.hold-burnAway'), css.indexOf('.transition-run.run-burnAway'));
  assert.match(hold, /mask-image:\s*var\(--burn-mask/, 'it wears the mask the renderer built');
  assert.match(hold, /mask-size:\s*200% 100%/, 'twice as wide as the slide');
  assert.match(hold, /mask-repeat:\s*no-repeat/, 'and slid, not tiled');
  // The mask is a wide ramp, so sliding it left eats the slide from the left.
  const animation = css.slice(css.indexOf('@keyframes transition-burnAway-hold'), css.indexOf('.transition-hold.hold-burnAway'));
  assert.match(animation, /mask-position:\s*100% 0/, 'it starts showing the kept side');
  assert.match(animation, /mask-position:\s*0% 0/, 'and ends showing the burnt side');
  // Without a canvas there is no mask: the fallback still has to dissolve the slide.
  assert.match(hold, /linear-gradient\(90deg, transparent 0%/, 'the fallback is a plain ramp');
});

test('the strips are stepped through, one frame at a time', () => {
  const strip = css.slice(css.indexOf('.transition-burn .burn-strip {'), css.indexOf('.transition-burn .burn-strip-line'));
  assert.match(strip, /background-image:\s*var\(--burn-strip/, 'it wears the generated strip');
  assert.match(strip, /background-size:\s*var\(--burn-strip-size/, 'sized by the frame count');
  assert.match(strip, /steps\(var\(--burn-frames, 24\), end\)/, 'and stepped, not eased');
  assert.match(strip, /animation:.*var\(--transition-ms/, 'for as long as the transition runs');
  const frames = css.slice(css.indexOf('@keyframes transition-burnAway-frames'), css.indexOf('.transition-burn .burn-ash'));
  assert.match(frames, /background-position:\s*0 0/, 'from the first frame');
  assert.match(frames, /background-position:\s*100% 0/, 'to the last');

  const ash = css.slice(css.indexOf('.transition-burn .burn-ash'), css.indexOf('.transition-burn .burn-glow'));
  assert.match(ash, /background-image:\s*var\(--ash-strip/, 'the ash has its own strip');
  assert.match(ash, /steps\(var\(--ash-frames/, 'stepped as well');
  assert.match(ash, /mix-blend-mode:\s*multiply/, 'and painted rather than screened, so it reads on a pale slide');
  assert.match(ash, /mask-image:\s*linear-gradient\(90deg, #000 0%/, 'kept to the burnt side of the fire');
});

test('the shader and the CSS fire take turns', () => {
  // When the shader is drawing, the CSS fire stands aside; when it is not, the CSS fire
  // is what crosses the slide.
  assert.match(css, /\.transition-burn\[data-mode='shader'\] \.burn-line/, 'the gradient fire hides');
  assert.match(css, /\.transition-burn\[data-mode='shader'\] \.burn-flames/, 'along with its flames');
  assert.match(css, /\.transition-burn \.burn-canvas\s*\{/, 'and the canvas is laid out over the band');
  assert.match(component, /host\.dataset\.mode = renderer \? 'shader' : 'fallback'/, 'the component reports which path ran');
  assert.match(component, /if \(!renderer\) return \(\) => canvas\.remove\(\)/, 'and does nothing else without WebGL');
  // The canvas is built by the effect, not rendered by React: a canvas whose context was
  // handed back cannot be reused, so a remount has to get a fresh element.
  assert.match(component, /document\.createElement\('canvas'\)/, 'the canvas is created in the effect');
  assert.ok(!/<canvas/.test(component), 'and never rendered by React');
  // One frame loop, reporting progress through the DOM rather than state: sixty renders
  // a second for a number nothing renders would be a waste.
  assert.match(component, /requestAnimationFrame\(tick\)/, 'it runs one frame loop');
  assert.match(component, /host\.dataset\.progress/, 'and reports its progress in the DOM');
  assert.ok(!/setProgress/.test(component), 'without a state update per frame');
});

test('the mask and the fire keep the same pace', () => {
  const hold = css.slice(css.indexOf('.transition-hold.hold-burnAway'), css.indexOf('.transition-run.run-burnAway'));
  const band = css.slice(css.indexOf('.transition-burn {'), css.indexOf('@keyframes transition-burnAway-sweep'));
  assert.match(hold, /animation:\s*transition-burnAway-hold var\(--transition-ms[^;]*linear/, 'the mask sweeps evenly');
  assert.match(band, /animation:\s*transition-burnAway-sweep var\(--transition-ms[^;]*linear/, 'and so does the band');
  assert.ok(!/cubic-bezier/.test(hold + band), 'neither of them eases');
  // And the shader is handed the same linear progress.
  const source = readFileSync(new URL('../src/lib/burnShader.ts', import.meta.url), 'utf8');
  assert.match(source, /return Math\.min\(1, Math\.max\(0, elapsedMs \/ durationMs\)\)/, 'the shader is linear too');
});
