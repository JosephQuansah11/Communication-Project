/**
 * Annotation vocabulary shared by the presenter, the audience output and the live
 * audience page: the tools, the pen colours and the small geometry helpers.
 *
 * Strokes are stored in slide-relative percentages (0–100), so the same drawing
 * lands in the same place on every screen whatever its size.
 */
export const ANNOTATION_TOOLS = [
  { id: 'pointer', label: 'Pointer', icon: 'pointer', shortcut: 'Ctrl+Alt+A', color: null },
  { id: 'laser', label: 'Laser', icon: 'laser', shortcut: 'Ctrl+L', color: '#f43f5e' },
  { id: 'pen', label: 'Pen', icon: 'pen', shortcut: 'Ctrl+P', color: '#f43f5e', width: 3 },
  { id: 'highlighter', label: 'Highlighter', icon: 'highlight', shortcut: 'Ctrl+H', color: '#fbbf24', width: 14, opacity: 0.35 },
  { id: 'eraser', label: 'Eraser', icon: 'eraser', shortcut: 'Ctrl+E', color: null },
];

export const PEN_COLORS = ['#f43f5e', '#fbbf24', '#22d3ee', '#34d399', '#ffffff', '#0f172a'];

export function annotationTool(id) {
  return ANNOTATION_TOOLS.find((tool) => tool.id === id) || ANNOTATION_TOOLS[0];
}

export function newStroke(tool, point, overrides = {}) {
  const preset = annotationTool(tool);
  return {
    id: `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    tool,
    color: overrides.color || preset.color || '#f43f5e',
    width: overrides.width || preset.width || 3,
    opacity: preset.opacity ?? 1,
    points: [point],
  };
}

/** Distance from a point to the closest point of a stroke, used by the eraser. */
export function distanceToStroke(stroke, point) {
  let best = Infinity;
  for (const candidate of stroke?.points || []) {
    best = Math.min(best, Math.hypot(candidate.x - point.x, candidate.y - point.y));
  }
  return best;
}

/** SVG `points` attribute for a stroke. */
export function pointsAttr(stroke) {
  return (stroke?.points || []).map((point) => `${point.x},${point.y}`).join(' ');
}

/** The closest stroke to a point within `radius`, or -1. */
export function strokeAt(strokes = [], point, radius = 6) {
  let bestIndex = -1;
  let best = Infinity;
  strokes.forEach((stroke, index) => {
    const distance = distanceToStroke(stroke, point);
    if (distance < best) {
      best = distance;
      bestIndex = index;
    }
  });
  return best <= radius ? bestIndex : -1;
}
