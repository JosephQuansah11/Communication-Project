import { pointsAttr } from '../lib/annotations.js';

export {
  ANNOTATION_TOOLS,
  PEN_COLORS,
  annotationTool,
  distanceToStroke,
  newStroke,
  strokeAt,
} from '../lib/annotations.js';

/**
 * Annotation overlay for presenting.
 *
 * Strokes are stored in slide-relative percentages (0–100), so the same drawing
 * lands in the same place on the presenter console, the audience output and the
 * live audience page, whatever the window size. `vector-effect` keeps the pen
 * width in device pixels while the viewBox stretches.
 */
export default function AnnotationLayer({ strokes = [], laser = null, className = '' }) {
  if (!strokes.length && !laser) return null;
  return (
    <svg
      className={`annotation-layer ${className}`.trim()}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {strokes.map((stroke) =>
        stroke.points?.length > 1 ? (
          <polyline
            key={stroke.id}
            points={pointsAttr(stroke)}
            fill="none"
            stroke={stroke.color}
            strokeWidth={stroke.width}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={stroke.opacity ?? 1}
            vectorEffect="non-scaling-stroke"
          />
        ) : null
      )}
      {laser && (
        <g>
          <circle cx={laser.x} cy={laser.y} r="1.6" fill="#f43f5e" opacity="0.35" />
          <circle cx={laser.x} cy={laser.y} r="0.7" fill="#f43f5e" opacity="0.95" />
        </g>
      )}
    </svg>
  );
}
