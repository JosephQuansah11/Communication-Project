/**
 * Slide animation vocabulary shared by the PPTX importer and the editor.
 *
 * A slide stores `animations`: one entry per effect, targeting an element id.
 * Entries are grouped into "steps" — each step is one click during a
 * presentation, exactly like PowerPoint's animation groups.
 *
 *   {
 *     id, targetId,
 *     kind: 'entrance' | 'exit' | 'emphasis' | 'path',
 *     effect: 'fade' | 'fly' | 'wipe' | ...   (see EFFECT_CATALOG)
 *     direction: 'left' | 'bottom' | 'topRight' | 'horizontal' | ... | null,
 *     duration: 500,        // ms
 *     delay: 0,             // ms, offset inside the step
 *     trigger: 'click' | 'with' | 'after',
 *     group: 0,             // step index (0 based)
 *     order: 0,             // order inside the step
 *     path: null,           // motion-path data for kind === 'path'
 *   }
 */

export const ANIMATION_KINDS = ['entrance', 'exit', 'emphasis', 'path'];
export const ANIMATION_TRIGGERS = ['click', 'with', 'after'];

/** Every effect the renderer knows how to draw. `directions` lists what it accepts. */
export const EFFECT_CATALOG = [
  { id: 'appear', label: 'Appear', kinds: ['entrance', 'exit'] },
  { id: 'fade', label: 'Fade', kinds: ['entrance', 'exit'] },
  {
    id: 'fly',
    label: 'Fly',
    kinds: ['entrance', 'exit'],
    directions: ['left', 'right', 'top', 'bottom', 'topLeft', 'topRight', 'bottomLeft', 'bottomRight'],
  },
  {
    id: 'wipe',
    label: 'Wipe',
    kinds: ['entrance', 'exit'],
    directions: ['left', 'right', 'top', 'bottom', 'topLeft', 'topRight', 'bottomLeft', 'bottomRight', 'horizontal', 'vertical', 'across'],
  },
  { id: 'split', label: 'Split', kinds: ['entrance', 'exit'], directions: ['horizontal', 'vertical', 'across'] },
  { id: 'zoom', label: 'Zoom', kinds: ['entrance', 'exit'], directions: ['in', 'out'] },
  { id: 'circle', label: 'Circle', kinds: ['entrance', 'exit'] },
  { id: 'dissolve', label: 'Dissolve', kinds: ['entrance', 'exit'] },
  { id: 'peek', label: 'Peek', kinds: ['entrance', 'exit'], directions: ['left', 'right', 'top', 'bottom'] },
  { id: 'crawl', label: 'Crawl', kinds: ['entrance', 'exit'], directions: ['left', 'right', 'top', 'bottom'] },
  { id: 'stretch', label: 'Stretch', kinds: ['entrance', 'exit'], directions: ['left', 'right', 'top', 'bottom', 'horizontal', 'vertical'] },
  { id: 'blinds', label: 'Blinds', kinds: ['entrance', 'exit'], directions: ['horizontal', 'vertical'] },
  { id: 'box', label: 'Box', kinds: ['entrance', 'exit'], directions: ['in', 'out'] },
  { id: 'checkerboard', label: 'Checkerboard', kinds: ['entrance', 'exit'], directions: ['horizontal', 'vertical', 'across'] },
  { id: 'wheel', label: 'Wheel', kinds: ['entrance', 'exit'] },
  { id: 'spiral', label: 'Spiral', kinds: ['entrance', 'exit'] },
  { id: 'swivel', label: 'Swivel', kinds: ['entrance', 'exit'], directions: ['horizontal', 'vertical'] },
  { id: 'bounce', label: 'Bounce', kinds: ['entrance', 'exit', 'emphasis'] },
  { id: 'pop', label: 'Pop', kinds: ['entrance', 'exit'] },
  { id: 'waterDrip', label: 'Water drip', kinds: ['entrance', 'exit'] },
  { id: 'bars', label: 'Random bars', kinds: ['entrance', 'exit'], directions: ['horizontal', 'vertical'] },
  { id: 'strips', label: 'Strips', kinds: ['entrance', 'exit'], directions: ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'] },
  { id: 'diamond', label: 'Diamond', kinds: ['entrance', 'exit'] },
  { id: 'plus', label: 'Plus', kinds: ['entrance', 'exit'] },
  { id: 'wedge', label: 'Wedge', kinds: ['entrance', 'exit'] },
  { id: 'flash', label: 'Flash once', kinds: ['entrance', 'exit'] },
  { id: 'boomerang', label: 'Boomerang', kinds: ['entrance', 'exit'] },
  { id: 'pulse', label: 'Pulse', kinds: ['emphasis'] },
  { id: 'grow', label: 'Grow', kinds: ['emphasis'] },
  { id: 'shrink', label: 'Shrink', kinds: ['emphasis'] },
  { id: 'spin', label: 'Spin', kinds: ['emphasis'] },
  { id: 'colorPulse', label: 'Color pulse', kinds: ['emphasis'] },
  { id: 'darken', label: 'Darken', kinds: ['emphasis'] },
  { id: 'lighten', label: 'Lighten', kinds: ['emphasis'] },
  { id: 'transparency', label: 'Transparency', kinds: ['emphasis'] },
  { id: 'underline', label: 'Underline', kinds: ['emphasis'] },
  { id: 'bold', label: 'Bold', kinds: ['emphasis'] },
  { id: 'italic', label: 'Italic', kinds: ['emphasis'] },
  { id: 'blink', label: 'Blink', kinds: ['emphasis'] },
  { id: 'wave', label: 'Wave', kinds: ['emphasis'] },
  { id: 'waterWave', label: 'Water wave', kinds: ['emphasis'] },
  { id: 'path', label: 'Motion path', kinds: ['path'] },
];

export const EFFECT_IDS = EFFECT_CATALOG.map((effect) => effect.id);
const EFFECT_BY_ID = new Map(EFFECT_CATALOG.map((effect) => [effect.id, effect]));

export function effectLabel(id) {
  return EFFECT_BY_ID.get(id)?.label || id;
}

/** Effects valid for a kind — used to populate the editor's dropdowns. */
export function effectsForKind(kind) {
  return EFFECT_CATALOG.filter((effect) => effect.kinds.includes(kind));
}

export function effectTakesDirection(id) {
  return Boolean(EFFECT_BY_ID.get(id)?.directions);
}

export function directionsForEffect(id) {
  return EFFECT_BY_ID.get(id)?.directions || [];
}

export const DIRECTION_LABELS = {
  left: 'From left',
  right: 'From right',
  top: 'From top',
  bottom: 'From bottom',
  topLeft: 'From top left',
  topRight: 'From top right',
  bottomLeft: 'From bottom left',
  bottomRight: 'From bottom right',
  horizontal: 'Horizontal',
  vertical: 'Vertical',
  across: 'Across',
  in: 'In',
  out: 'Out',
};

/**
 * ECMA-376 entrance/exit preset ids. Entrance and exit use the same numbers for
 * the same visual, so one table drives both.
 */
const PRESET_EFFECTS = {
  1: 'appear',
  2: 'fly',
  3: 'blinds',
  4: 'box',
  5: 'checkerboard',
  6: 'circle',
  7: 'crawl',
  8: 'diamond',
  9: 'dissolve',
  10: 'fade',
  11: 'flash',
  12: 'peek',
  13: 'plus',
  14: 'bars',
  15: 'spiral',
  16: 'split',
  17: 'stretch',
  18: 'strips',
  19: 'swivel',
  20: 'wedge',
  21: 'wheel',
  22: 'wipe',
  23: 'zoom',
  25: 'boomerang',
  26: 'bounce',
};

const PRESET_EMPHASIS = {
  1: 'colorPulse',
  2: 'bold',
  3: 'colorPulse',
  4: 'grow',
  5: 'italic',
  6: 'grow',
  7: 'darken',
  8: 'lighten',
  9: 'transparency',
  10: 'colorPulse',
  11: 'colorPulse',
  12: 'colorPulse',
  13: 'colorPulse',
  14: 'colorPulse',
  15: 'colorPulse',
  17: 'underline',
  18: 'bold',
  19: 'italic',
  21: 'grow',
  22: 'transparency',
  23: 'spin',
  26: 'blink',
};

/** `presetSubtype` → the side an element enters from (ECMA-376 direction table). */
const SUBTYPE_DIRECTIONS = {
  1: 'bottom',
  2: 'right',
  3: 'left',
  4: 'top',
  5: 'bottomLeft',
  6: 'bottomRight',
  7: 'topLeft',
  8: 'topRight',
  9: 'horizontal',
  10: 'vertical',
  11: 'across',
  12: 'horizontal',
  13: 'vertical',
};

export function presetToEffect(kind, presetId) {
  const id = Number(presetId);
  if (kind === 'emphasis') return PRESET_EMPHASIS[id] || 'pulse';
  if (kind === 'path') return 'path';
  return PRESET_EFFECTS[id] || 'fade';
}

export function subtypeToDirection(effect, subtype) {
  const allowed = directionsForEffect(effect);
  if (!allowed.length) return null;
  const mapped = SUBTYPE_DIRECTIONS[Number(subtype)];
  if (mapped && allowed.includes(mapped)) return mapped;
  // Effects whose subtype table does not cover every variant get a sane default.
  if (effect === 'split' || effect === 'checkerboard') return 'horizontal';
  if (effect === 'blinds' || effect === 'swivel' || effect === 'stretch') return 'horizontal';
  if (effect === 'box' || effect === 'zoom') return 'in';
  if (effect === 'strips') return 'topRight';
  return allowed[0];
}

const clampNumber = (value, min, max, fallback) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
};

/** Sanitize one animation entry. Returns null when it cannot target anything. */
export function normalizeAnimation(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const kind = ANIMATION_KINDS.includes(raw.kind) ? raw.kind : 'entrance';
  const effect = EFFECT_IDS.includes(raw.effect) ? raw.effect : presetToEffect(kind, raw.effect);
  const targetIds = Array.isArray(raw.targetIds)
    ? raw.targetIds.filter(Boolean).map(String)
    : raw.targetId
      ? [String(raw.targetId)]
      : [];
  if (!targetIds.length) return null;
  const direction = raw.direction && DIRECTION_LABELS[raw.direction] ? raw.direction : null;
  return {
    id: raw.id ? String(raw.id) : `anim-${index}-${Math.random().toString(36).slice(2, 8)}`,
    targetId: targetIds[0],
    targetIds,
    kind,
    effect,
    direction: effectTakesDirection(effect) ? direction || directionsForEffect(effect)[0] : null,
    duration: clampNumber(raw.duration, 0, 20000, 500),
    delay: clampNumber(raw.delay, 0, 60000, 0),
    trigger: ANIMATION_TRIGGERS.includes(raw.trigger) ? raw.trigger : 'click',
    group: clampNumber(raw.group, 0, 500, 0),
    order: clampNumber(raw.order, 0, 500, index),
    /** Auto steps play themselves once the slide appears (no click needed). */
    auto: Boolean(raw.auto),
    autoDelay: clampNumber(raw.autoDelay, 0, 60000, 0),
    path:
      raw.path && typeof raw.path === 'object'
        ? { points: Array.isArray(raw.path.points) ? raw.path.points : [], relative: raw.path.relative !== false }
        : null,
    spid: raw.spid ? String(raw.spid) : null,
  };
}

/** Normalize a whole slide's animation list: sanitized, ordered, groups renumbered. */
export function normalizeAnimations(animations) {
  const list = (Array.isArray(animations) ? animations : [])
    .map((animation, index) => normalizeAnimation(animation, index))
    .filter(Boolean);
  list.sort((a, b) => a.group - b.group || a.order - b.order || a.delay - b.delay);
  const groups = new Map();
  for (const animation of list) {
    if (!groups.has(animation.group)) groups.set(animation.group, groups.size);
    animation.group = groups.get(animation.group);
  }
  return list;
}

/** Number of click steps a slide needs (0 when nothing is animated). */
export function animationStepCount(animations) {
  if (!Array.isArray(animations) || !animations.length) return 0;
  return animations.reduce((max, animation) => Math.max(max, animation.group + 1), 0);
}

/** The animations that belong to one step. */
export function animationsForStep(animations, step) {
  return (Array.isArray(animations) ? animations : []).filter((animation) => animation.group === step);
}

/** The animations of one element that have already played at the given step. */
export function playedAnimationsFor(animations, targetId, step) {
  return (Array.isArray(animations) ? animations : []).filter(
    (animation) => animation.group < step && (animation.targetId === targetId || animation.targetIds?.includes(targetId))
  );
}
