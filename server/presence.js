/**
 * Who is still looking at the app.
 *
 * The packaged application runs a server in the background, and the only thing
 * keeping it alive is a browser window showing the UI. Every page sends a
 * heartbeat; when the last one stops — the window was closed, the tab crashed, the
 * machine went to sleep — the app shuts itself down instead of lingering as an
 * invisible process holding the executable open.
 *
 * A page that says goodbye (closing the window) is treated more quickly than one
 * that simply goes quiet, but not instantly: a reload looks exactly like a close,
 * so there is a short grace period for the new page to announce itself.
 */
export function createPresence({
  /** How long a page may stay quiet before it is considered gone. */
  graceMs = 6000,
  /** How often the tracker looks for quiet pages. */
  intervalMs = 2000,
  /** How long to wait after an explicit goodbye before checking. */
  farewellMs = 1500,
  now = Date.now,
  timers = { setInterval, clearInterval, setTimeout, clearTimeout },
  onIdle = () => {},
} = {}) {
  const pages = new Map();
  let armed = false;
  let fired = false;
  let ticker = null;
  let farewell = null;

  /** Forget the pages that have gone quiet, and say how many are left. */
  const live = () => {
    const cutoff = now() - graceMs;
    for (const [id, seen] of pages) {
      if (seen < cutoff) pages.delete(id);
    }
    return pages.size;
  };

  const stop = () => {
    if (ticker) timers.clearInterval(ticker);
    if (farewell) timers.clearTimeout(farewell);
    ticker = null;
    farewell = null;
  };

  const check = () => {
    if (!armed || fired) return;
    if (live() > 0) return;
    fired = true;
    stop();
    onIdle();
  };

  const watch = () => {
    if (ticker) return;
    ticker = timers.setInterval(check, intervalMs);
    ticker?.unref?.();
  };

  return {
    /** A page is open: remember it, and start watching once the first one arrives. */
    beat(id) {
      if (!id) return;
      pages.set(String(id), now());
      if (armed) return;
      armed = true;
      watch();
    },
    /** A page closed on purpose. A reload comes straight back, so give it a moment. */
    drop(id) {
      if (!id) return;
      pages.delete(String(id));
      if (!armed || fired) return;
      if (farewell) timers.clearTimeout(farewell);
      farewell = timers.setTimeout(() => {
        farewell = null;
        check();
      }, farewellMs);
      farewell?.unref?.();
    },
    /** Pages known to be open right now. */
    count: () => live(),
    /** True once a page has ever said hello — before that, nothing may shut down. */
    armed: () => armed,
    stop,
  };
}
