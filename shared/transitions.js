/**
 * Slide transitions, shared by the editor, the presenter and the audience page.
 *
 * A slide stores one id in `transition`; the renderer looks the id up here for its
 * label, its description and how long it runs. Everything the catalog lists has a
 * matching `@keyframes transition-<id>` in the stylesheet, which is what actually
 * draws it, and `tests/transitions.test.js` keeps the two lists honest.
 *
 * `duration` is the length of the entry animation in milliseconds. `none` is a cut:
 * the next slide simply appears, with nothing to wait for.
 */

export const TRANSITIONS = [
  { id: 'none', label: 'None', duration: 0, hint: 'Cut straight to this slide.' },
  { id: 'fade', label: 'Fade', duration: 700, hint: 'The slide dissolves in over the one before it.' },
  { id: 'slide', label: 'Slide', duration: 800, hint: 'The slide pushes in from the right, shunting the last one out.' },
  { id: 'cover', label: 'Cover', duration: 800, hint: 'The slide slides in from the right and covers the last one.' },
  { id: 'openDoor', label: 'Open door', duration: 950, hint: 'The slide opens out from the centre line, like double doors.' },
  { id: 'slice', label: 'Slice', duration: 1000, hint: 'The slide arrives in horizontal slices, one band after another.' },
  { id: 'burnAway', label: 'Burn away', duration: 1500, hint: 'A line of fire crosses the last slide from the left and eats it away, leaving char and ash behind.' },
  { id: 'sparkle', label: 'Sparkle', duration: 1100, hint: 'The slide lands behind a burst of sparkling points.' },
];

export const TRANSITION_IDS = TRANSITIONS.map((transition) => transition.id);
export const DEFAULT_TRANSITION = 'fade';

const BY_ID = new Map(TRANSITIONS.map((transition) => [transition.id, transition]));

/** True for any id the catalog knows, including `none`. */
export function isTransition(id) {
  return BY_ID.has(id);
}

/** Anything unknown becomes the default, so a deck can never hold a broken id. */
export function normalizeTransition(id) {
  return isTransition(id) ? id : DEFAULT_TRANSITION;
}

/** The catalog entry for an id, falling back to the default. */
export function transitionFor(id) {
  return BY_ID.get(id) || BY_ID.get(DEFAULT_TRANSITION);
}

export function transitionLabel(id) {
  return transitionFor(id).label;
}

export function transitionDuration(id) {
  return transitionFor(id).duration;
}

/** Whether a transition has anything to animate at all. */
export function transitionPlays(id) {
  return Boolean(id) && id !== 'none' && transitionDuration(id) > 0;
}
