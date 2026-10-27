/**
 * Burn away: the fire that crosses the slide, and the strips it is drawn with.
 *
 * The outgoing slide is dissolved by a mask the stylesheet animates (`.hold-burnAway`),
 * so what is left here is everything *on top* of it: a WebGL canvas drawing the fire
 * along that same front, and two generated sprite strips — flames and ash — stepped
 * through frame by frame the way the reference does it with pre-rendered strips.
 *
 * The textures are built once per session and cached: they are noise, not art, and the
 * same burn should look the same every time. If the browser has no WebGL the canvas is
 * simply not drawn and the CSS fire underneath carries the transition on its own, so
 * the effect degrades instead of disappearing.
 */
import { useEffect, useMemo, useRef } from 'react';
import { burnTextures, type BurnTextures } from '../lib/burnTexture.ts';
import { burnProgress, createBurnRenderer, type BurnRenderer } from '../lib/burnShader.ts';

export interface BurnTransitionProps {
  /** How long the burn runs, in milliseconds — the transition's own duration. */
  readonly duration: number;
  /** The run token: a new value restarts the burn, even for the same slide. */
  readonly token: string;
}

export default function BurnTransition({ duration, token }: BurnTransitionProps) {
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const art: BurnTextures = useMemo(() => burnTextures(), []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    /**
     * The canvas is built here rather than rendered by React, for two reasons: React must
     * never touch a canvas's width/height attributes (they are the drawing buffer, not
     * style), and a remount has to get a *fresh* element — a canvas whose WebGL context
     * has been handed back cannot be given a new one, so reusing it would leave the
     * shader permanently unavailable after the first run.
     */
    const canvas = document.createElement('canvas');
    canvas.className = 'burn-canvas';
    host.appendChild(canvas);

    /**
     * Which path is running, and how far it has got, are written straight to the DOM
     * rather than held in state: the stylesheet switches on `data-mode`, and a state
     * update per frame would re-render this component sixty times a second for nothing.
     */
    const renderer: BurnRenderer | null = createBurnRenderer(canvas);
    host.dataset.mode = renderer ? 'shader' : 'fallback';
    canvas.dataset.gl = renderer ? 'ok' : 'unavailable';
    if (!renderer) return () => canvas.remove();

    const bounds = host.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    renderer.resize(bounds.width * ratio, bounds.height * ratio);
    // The slide's own shape, for the noise: the canvas is a narrow band and would
    // otherwise stretch every flame into a vertical streak.
    const stage = host.closest('.slide-transition')?.getBoundingClientRect();
    const aspect = stage && stage.height ? stage.width / stage.height : 16 / 9;

    let frame = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const elapsed = now - started;
      const value = burnProgress(elapsed, duration);
      renderer.draw({ progress: value, time: elapsed, aspect });
      host.dataset.progress = value.toFixed(3);
      if (value < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    const resize = () => {
      const box = host.getBoundingClientRect();
      renderer.resize(box.width * ratio, box.height * ratio);
    };
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      renderer.dispose();
      canvas.remove();
    };
  }, [duration, token]);

  return (
    <span
      ref={hostRef}
      className="transition-burn"
      aria-hidden="true"
      style={
        {
          '--burn-mask': art.mask ? `url("${art.mask}")` : undefined,
          '--burn-strip': art.burn ? `url("${art.burn}")` : undefined,
          '--ash-strip': art.ash ? `url("${art.ash}")` : undefined,
          '--burn-strip-size': art.style.burn.size,
          '--ash-strip-size': art.style.ash.size,
          '--burn-frames': String(art.style.burn.frames),
          '--ash-frames': String(art.style.ash.frames),
        } as React.CSSProperties
      }
    >
      {/* What the fire leaves behind, and the fire itself, as film strips. */}
      <span className="burn-ash" />
      <span className="burn-strip" />
      <span className="burn-strip burn-strip-line" />
      {/* The shader's canvas is added by the effect above. */}
      {/* And the CSS fire, for the browsers without WebGL. */}
      <span className="burn-glow" />
      <span className="burn-line" />
      <span className="burn-flames">
        {FLAMES.map(([top, delay, scale, offset], index) => (
          <i
            key={`flame-${index}`}
            style={{ top: `${top}%`, animationDelay: `${delay}ms`, '--flame': scale, '--flame-x': `${offset}px` } as React.CSSProperties}
          />
        ))}
      </span>
      <span className="burn-embers">
        {EMBERS.map(([top, delay, drift, scale, across], index) => (
          <i
            key={`ember-${index}`}
            style={
              {
                top: `${top}%`,
                animationDelay: `${delay}ms`,
                '--drift': `${drift}px`,
                '--ember': scale,
                '--ember-x': `${across * 100}%`,
              } as React.CSSProperties
            }
          />
        ))}
      </span>
    </span>
  );
}

/** The tongues of flame along the burn line: `[how far down, when it flares, how big, how far off the line]`. */
const FLAMES: readonly (readonly [number, number, number, number])[] = [
  [6, 0, 0.9, -12], [16, 260, 1.25, 9], [26, 90, 0.75, -6], [35, 380, 1.35, 13],
  [45, 150, 1, -14], [54, 520, 1.2, 8], [64, 40, 0.8, -9], [73, 300, 1.15, 12],
  [82, 610, 0.95, -11], [92, 180, 1.3, 7], [98, 460, 0.85, -5],
];

/** The sparks that come off the fire: `[start height, delay, sideways drift, size, how far across the band]`. */
const EMBERS: readonly (readonly [number, number, number, number, number])[] = [
  [16, 0, -18, 0.7, 0.34], [24, 220, 12, 1, 0.5], [33, 460, -24, 0.8, 0.66], [41, 120, 20, 1.15, 0.42],
  [50, 600, -14, 0.9, 0.58], [58, 340, 26, 0.75, 0.72], [66, 60, -20, 1.05, 0.38], [74, 500, 16, 0.85, 0.62],
  [82, 180, -12, 1.2, 0.48], [90, 420, 22, 0.8, 0.7], [96, 280, -16, 1, 0.3], [12, 700, 18, 0.9, 0.54],
  [28, 640, -26, 0.7, 0.44], [46, 240, 14, 1.1, 0.76], [62, 760, -10, 0.95, 0.36], [86, 560, 24, 0.75, 0.6],
];
