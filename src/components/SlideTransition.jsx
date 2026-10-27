/**
 * Plays a slide transition around a stage.
 *
 * Three layers, all absolutely positioned on top of each other:
 *   .transition-hold  the slide being left behind (only while one is running)
 *   .transition-run   the slide arriving, which carries the animation
 *   .transition-fx    optional decoration — the fire that eats the outgoing slide, or
 *                     the burst of points a sparkle transition lands in
 *
 * The incoming slide is keyed by the run token so React remounts it and the CSS
 * animation starts from the first frame every time, including when the same
 * transition plays twice in a row.
 *
 * Burn away is the one decoration that is not only CSS: the outgoing slide is dissolved
 * by a mask built from noise (`lib/burnTexture.ts`), and the fire along that edge is
 * drawn by a WebGL shader (`lib/burnShader.ts`) inside `BurnTransition.tsx`, which falls
 * back to the CSS fire when a browser has no WebGL. The mask is handed to the stylesheet
 * as `--burn-mask` from here, because it belongs to the *held* slide rather than to the
 * decoration on top of it.
 */
import BurnTransition from './BurnTransition.tsx';
import { burnTextures } from '../lib/burnTexture.ts';

/** Where the sparkle points sit: spread across the slide, each with its own beat. */
const SPARKLE_POINTS = [
  [12, 22, 0], [26, 68, 90], [38, 14, 180], [44, 52, 40], [56, 84, 240],
  [62, 30, 130], [70, 62, 20], [78, 18, 200], [84, 74, 110], [90, 42, 260],
  [18, 44, 300], [32, 88, 160], [50, 8, 70], [66, 46, 330], [74, 90, 210], [88, 12, 140],
];

export default function SlideTransition({ run, hold, children }) {
  const id = run?.id || null;
  const mask = id === 'burnAway' ? burnTextures().mask : null;
  return (
    <div
      className={`slide-transition${id ? ` running t-${id}` : ''}`}
      style={{
        ...(id ? { '--transition-ms': `${run.duration}ms` } : null),
        ...(mask ? { '--burn-mask': `url("${mask}")` } : null),
      }}
    >
      {id && hold ? (
        <div className={`transition-hold hold-${id}`} aria-hidden="true">
          {hold}
        </div>
      ) : null}
      <div key={run?.token || 'slide'} className={`transition-run${id ? ` run-${id}` : ''}`}>
        {children}
      </div>
      {id === 'burnAway' ? <BurnTransition duration={run.duration} token={run.token} /> : null}
      {id === 'sparkle' ? (
        <span className="transition-sparkles" aria-hidden="true">
          {SPARKLE_POINTS.map(([x, y, delay]) => (
            <i key={`${x}-${y}`} style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${delay}ms` }} />
          ))}
        </span>
      ) : null}
    </div>
  );
}
