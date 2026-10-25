/**
 * Client-side animation resolution.
 *
 * A slide's `animations` list is a *timeline*: each entry belongs to a click
 * step (`group`). At any point during a show we know how many steps have played,
 * so every element can be rendered from that single number — which is what makes
 * stepping forwards and backwards exact and cheap.
 *
 * An element has at most one active effect at a time:
 *   1. an exit that has already played   → stays hidden
 *   2. an entrance that has not played   → hidden, waiting for its step
 *   3. the latest emphasis / motion path that has played → replays on the step
 *   4. otherwise                        → no animation, natural state
 */

const MOVE_DISTANCE = 16; // % of the element's own size, for fly / peek / crawl

/** Direction → the offset the element comes from. */
const OFFSETS = {
  left: [-MOVE_DISTANCE, 0],
  right: [MOVE_DISTANCE, 0],
  top: [0, -MOVE_DISTANCE],
  bottom: [0, MOVE_DISTANCE],
  topLeft: [-MOVE_DISTANCE, -MOVE_DISTANCE],
  topRight: [MOVE_DISTANCE, -MOVE_DISTANCE],
  bottomLeft: [-MOVE_DISTANCE, MOVE_DISTANCE],
  bottomRight: [MOVE_DISTANCE, MOVE_DISTANCE],
};

/** Direction → the clip-path the element grows out of. */
const CLIPS = {
  left: 'inset(0 100% 0 0)',
  right: 'inset(0 0 0 100%)',
  top: 'inset(0 0 100% 0)',
  bottom: 'inset(100% 0 0 0)',
  topLeft: 'polygon(0 0, 0 0, 0 0)',
  topRight: 'polygon(100% 0, 100% 0, 100% 0)',
  bottomLeft: 'polygon(0 100%, 0 100%, 0 100%)',
  bottomRight: 'polygon(100% 100%, 100% 100%, 100% 100%)',
  horizontal: 'inset(0 50% 0 50%)',
  vertical: 'inset(50% 0 50% 0)',
  across: 'inset(50% 50% 50% 50%)',
  in: 'inset(45% 45% 45% 45%)',
  out: 'inset(45% 45% 45% 45%)',
};

const SHARED_KEYFRAMES = {
  appear: 'anim-appear',
  fade: 'anim-fade',
  fly: 'anim-slide',
  peek: 'anim-slide',
  crawl: 'anim-slide',
  boomerang: 'anim-slide',
  bounce: 'anim-bounce',
  wipe: 'anim-clip',
  box: 'anim-clip',
  diamond: 'anim-clip',
  plus: 'anim-clip',
  wedge: 'anim-clip',
  blinds: 'anim-clip',
  bars: 'anim-clip',
  strips: 'anim-clip',
  checkerboard: 'anim-clip',
  split: 'anim-clip',
  zoom: 'anim-zoom',
  circle: 'anim-zoom',
  spiral: 'anim-spiral',
  wheel: 'anim-spiral',
  swivel: 'anim-swivel',
  dissolve: 'anim-dissolve',
  flash: 'anim-flash',
  stretch: 'anim-stretch',
  pulse: 'anim-pulse',
  grow: 'anim-grow',
  shrink: 'anim-shrink',
  spin: 'anim-spin',
  colorPulse: 'anim-color-pulse',
  darken: 'anim-darken',
  lighten: 'anim-lighten',
  transparency: 'anim-transparency',
  underline: 'anim-underline',
  bold: 'anim-bold',
  italic: 'anim-italic',
  blink: 'anim-blink',
  path: 'anim-path',
};

/** Keyframes are shared; exits read the same motion backwards. */
export function keyframeFor(animation) {
  const base = SHARED_KEYFRAMES[animation.effect] || 'anim-fade';
  return animation.kind === 'exit' ? `${base}-out` : base;
}

function timingFunction(animation) {
  if (animation.effect === 'bounce') return 'cubic-bezier(0.22, 1.2, 0.36, 1)';
  if (animation.effect === 'appear' || animation.effect === 'flash') return 'steps(1, end)';
  if (animation.kind === 'emphasis') return 'ease-in-out';
  return 'cubic-bezier(0.22, 0.61, 0.36, 1)';
}

function fillMode(animation) {
  // Entrances and exits must hold their first frame while waiting and their last
  // frame once done; emphasis effects always return to the natural state.
  return animation.kind === 'emphasis' ? 'none' : 'both';
}

/** Custom properties the shared keyframes read. */
function animationVariables(animation, size) {
  const variables = {};
  const { effect, direction } = animation;

  if (effect === 'fly' || effect === 'peek' || effect === 'crawl' || effect === 'boomerang') {
    const [tx, ty] = OFFSETS[direction] || OFFSETS.bottom;
    const scale = effect === 'peek' ? 0.4 : effect === 'crawl' ? 1.4 : 1;
    variables['--anim-tx'] = `${(tx * scale).toFixed(2)}%`;
    variables['--anim-ty'] = `${(ty * scale).toFixed(2)}%`;
  } else if (effect === 'wipe' || effect === 'box' || effect === 'diamond' || effect === 'plus' || effect === 'wedge') {
    variables['--anim-clip'] = CLIPS[direction] || CLIPS.left;
  } else if (effect === 'blinds' || effect === 'bars' || effect === 'strips') {
    // Stripe effects are approximated with the matching clip wipe.
    variables['--anim-clip'] = CLIPS[direction === 'vertical' ? 'top' : direction] || CLIPS.left;
  } else if (effect === 'checkerboard' || effect === 'split') {
    variables['--anim-clip'] = CLIPS[direction] || CLIPS.horizontal;
  } else if (effect === 'zoom' || effect === 'circle') {
    variables['--anim-scale'] = effect === 'circle' ? '0.2' : direction === 'out' ? '1.6' : '0.55';
  } else if (effect === 'spiral' || effect === 'wheel') {
    variables['--anim-scale'] = '0.3';
    variables['--anim-rotate'] = effect === 'wheel' ? '180deg' : '-160deg';
  } else if (effect === 'swivel') {
    variables['--anim-rotate'] = direction === 'vertical' ? '80deg' : '-80deg';
  } else if (effect === 'dissolve') {
    variables['--anim-scale'] = '1.04';
  } else if (effect === 'stretch') {
    const horizontal = !['top', 'bottom', 'vertical'].includes(direction);
    variables['--anim-scale'] = horizontal ? '0.05 1' : '1 0.05';
  } else if (effect === 'bounce') {
    variables['--anim-tx'] = '0%';
    variables['--anim-ty'] = '-45%';
  } else if (effect === 'path') {
    const points = animation.path?.points || [];
    const width = size?.width || 1280;
    const height = size?.height || 720;
    const first = points[0] || [0, 0];
    const last = points[points.length - 1] || first;
    variables['--anim-from-tx'] = `${Math.round(first[0] * width)}px`;
    variables['--anim-from-ty'] = `${Math.round(first[1] * height)}px`;
    variables['--anim-to-tx'] = `${Math.round(last[0] * width)}px`;
    variables['--anim-to-ty'] = `${Math.round(last[1] * height)}px`;
  }
  return variables;
}

/**
 * The element's single active animation for a step, or null.
 * @param {Array} animations the slide's animation list
 * @param {string} targetId the element id
 * @param {number} step how many click steps have played (0 = nothing yet)
 */
export function resolveElementAnimation(animations, targetId, step) {
  if (!Array.isArray(animations) || !animations.length || typeof step !== 'number') return null;
  const own = animations
    .filter((animation) => animation.targetId === targetId || animation.targetIds?.includes(targetId))
    .sort((a, b) => a.group - b.group || a.order - b.order);
  if (!own.length) return null;

  const exitPlayed = own.find((animation) => animation.kind === 'exit' && animation.group < step);
  if (exitPlayed) return { animation: exitPlayed, played: true };

  const entrance = own.find((animation) => animation.kind === 'entrance');
  if (entrance && entrance.group >= step) return { animation: entrance, played: false };

  const replayed = own.filter((animation) => animation.kind !== 'entrance' && animation.group < step).pop();
  if (replayed) return { animation: replayed, played: true };

  // A played entrance keeps its keyframe applied so it holds the finished state
  // (and so stepping forwards really animates rather than popping into view).
  if (entrance) return { animation: entrance, played: true };

  return null;
}

/** Inline style for a resolved animation (null when nothing is animating). */
export function animationStyle(resolved, size) {
  if (!resolved) return null;
  const { animation, played } = resolved;
  return {
    animationName: keyframeFor(animation),
    animationDuration: `${Math.max(1, animation.duration || 500)}ms`,
    animationDelay: `${animation.delay || 0}ms`,
    animationTimingFunction: timingFunction(animation),
    animationFillMode: fillMode(animation),
    animationIterationCount: 1,
    animationPlayState: played ? 'running' : 'paused',
    ...animationVariables(animation, size),
  };
}

/** Short label for the editor, e.g. "fly · top · on click". */
export function describeAnimation(animation) {
  const parts = [animation.effect];
  if (animation.direction) parts.push(animation.direction);
  parts.push(
    animation.trigger === 'click' ? 'on click' : animation.trigger === 'after' ? 'after previous' : 'with previous'
  );
  return parts.join(' · ');
}
