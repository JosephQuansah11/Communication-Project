/**
 * Rate limiting for the things that fire hundreds of times a second: pointer
 * moves, drawing strokes, deck refreshes. Everything here is dependency free and
 * takes its clock as an argument, so it can be tested without waiting.
 *
 * `createThrottle` runs the first call straight away and then at most once per
 * window, with a trailing call so the last value is never lost.
 * `createCoalesce` keeps only the newest call and runs it on the next tick —
 * what a drag preview wants, where intermediate positions do not matter.
 */
export function createThrottle(fn, waitMs = 80, { now = () => Date.now(), schedule = setTimeout, cancel = clearTimeout } = {}) {
  let lastRun = -Infinity;
  let timer = null;
  let pending = null;

  const run = () => {
    timer = null;
    const args = pending;
    pending = null;
    if (!args) return;
    lastRun = now();
    fn(...args);
  };

  const throttled = (...args) => {
    const elapsed = now() - lastRun;
    if (elapsed >= waitMs) {
      if (timer) {
        cancel(timer);
        timer = null;
      }
      lastRun = now();
      fn(...args);
      return true;
    }
    pending = args;
    if (!timer) timer = schedule(run, waitMs - elapsed);
    return false;
  };

  throttled.flush = () => {
    if (timer) {
      cancel(timer);
      timer = null;
    }
    if (pending) run();
  };
  throttled.cancel = () => {
    if (timer) cancel(timer);
    timer = null;
    pending = null;
  };
  return throttled;
}

/** Run at most once per animation frame, always with the newest arguments. */
export function createCoalesce(fn, { schedule = requestAnimationFrame, cancel = cancelAnimationFrame } = {}) {
  let frame = null;
  let pending = null;
  const run = () => {
    frame = null;
    const args = pending;
    pending = null;
    if (args) fn(...args);
  };
  const coalesced = (...args) => {
    pending = args;
    if (frame === null) frame = schedule(run);
    return true;
  };
  /** Apply the newest arguments right now — what the end of a drag needs. */
  coalesced.flush = () => {
    if (frame !== null) {
      cancel(frame);
      frame = null;
    }
    run();
  };
  coalesced.cancel = () => {
    if (frame !== null) cancel(frame);
    frame = null;
    pending = null;
  };
  return coalesced;
}

/** Milliseconds since the last call, or Infinity the first time. */
export function createGate(intervalMs, { now = () => Date.now() } = {}) {
  let last = -Infinity;
  return () => {
    const elapsed = now() - last;
    if (elapsed < intervalMs) return false;
    last = now();
    return true;
  };
}
