/**
 * Plays a slide transition around a stage.
 *
 * Three layers, all absolutely positioned on top of each other:
 *   .transition-hold  the slide being left behind (only while one is running)
 *   .transition-run   the slide arriving, which carries the animation
 *   .transition-fx    optional decoration — the glow that sweeps up a burning
 *                     slide, or the burst of points a sparkle transition lands in
 *
 * The incoming slide is keyed by the run token so React remounts it and the CSS
 * animation starts from the first frame every time, including when the same
 * transition plays twice in a row.
 */

/** Where the sparkle points sit: spread across the slide, each with its own beat. */
const SPARKLE_POINTS = [
  [12, 22, 0], [26, 68, 90], [38, 14, 180], [44, 52, 40], [56, 84, 240],
  [62, 30, 130], [70, 62, 20], [78, 18, 200], [84, 74, 110], [90, 42, 260],
  [18, 44, 300], [32, 88, 160], [50, 8, 70], [66, 46, 330], [74, 90, 210], [88, 12, 140],
];

/**
 * The tongues of flame along the burn line: `[how far down the slide, when it flares,
 * how big, how far off the line]`. They sit on the fire itself and lick upward as the
 * burn passes, staggered across the line so they do not form a neat column.
 */
const FLAMES = [
  [6, 0, 0.9, -12], [16, 260, 1.25, 9], [26, 90, 0.75, -6], [35, 380, 1.35, 13],
  [45, 150, 1, -14], [54, 520, 1.2, 8], [64, 40, 0.8, -9], [73, 300, 1.15, 12],
  [82, 610, 0.95, -11], [92, 180, 1.3, 7], [98, 460, 0.85, -5],
];

/** The sparks that come off the fire: `[start height, delay, sideways drift, size]`. */
const EMBERS = [
  [16, 0, -18, 0.7], [24, 220, 12, 1], [33, 460, -24, 0.8], [41, 120, 20, 1.15],
  [50, 600, -14, 0.9], [58, 340, 26, 0.75], [66, 60, -20, 1.05], [74, 500, 16, 0.85],
  [82, 180, -12, 1.2], [90, 420, 22, 0.8], [96, 280, -16, 1], [12, 700, 18, 0.9],
  [28, 640, -26, 0.7], [46, 240, 14, 1.1], [62, 760, -10, 0.95], [86, 560, 24, 0.75],
];

export default function SlideTransition({ run, hold, children }) {
  const id = run?.id || null;
  return (
    <div
      className={`slide-transition${id ? ` running t-${id}` : ''}`}
      style={id ? { '--transition-ms': `${run.duration}ms` } : undefined}
    >
      {id && hold ? (
        <div className={`transition-hold hold-${id}`} aria-hidden="true">
          {hold}
        </div>
      ) : null}
      <div key={run?.token || 'slide'} className={`transition-run${id ? ` run-${id}` : ''}`}>
        {children}
      </div>
      {id === 'burnAway' ? (
        <span className="transition-burn" aria-hidden="true">
          {/* What the fire leaves behind: char, soot and ash, fading out behind the line. */}
          <span className="burn-ash" />
          {/* The halo, so a dark slide looks like it is glowing. */}
          <span className="burn-glow" />
          {/* The fire itself: a hot core with amber either side of it. */}
          <span className="burn-line" />
          <span className="burn-flames">
            {FLAMES.map(([top, delay, scale, offset], index) => (
              <i
                key={`flame-${index}`}
                style={{ top: `${top}%`, animationDelay: `${delay}ms`, '--flame': scale, '--flame-x': `${offset}px` }}
              />
            ))}
          </span>
          <span className="burn-embers">
            {EMBERS.map(([top, delay, drift, scale], index) => (
              <i
                key={`ember-${index}`}
                style={{ top: `${top}%`, animationDelay: `${delay}ms`, '--drift': `${drift}px`, '--ember': scale }}
              />
            ))}
          </span>
        </span>
      ) : null}
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
