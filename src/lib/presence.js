/**
 * Tell the server that this window is open, and say goodbye when it closes.
 *
 * The packaged app shuts itself down when the last window goes, which is what stops
 * it from lingering in the background (and holding its own executable open). A
 * heartbeat covers crashes and forced closes; the goodbye covers the ordinary case
 * of closing the window, so the app disappears straight away.
 */
const HEARTBEAT_MS = 2000;

export function startPresence() {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return () => {};
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  const beat = () => {
    try {
      fetch('/api/beat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* the page is going away; nothing to report */
    }
  };

  const goodbye = () => {
    try {
      const body = JSON.stringify({ id, leaving: true });
      // sendBeacon survives the page being torn down, which a fetch may not.
      if (navigator.sendBeacon) navigator.sendBeacon('/api/beat', new Blob([body], { type: 'application/json' }));
      else beat();
    } catch {
      /* nothing more we can do while closing */
    }
  };

  beat();
  const timer = setInterval(beat, HEARTBEAT_MS);
  window.addEventListener('pagehide', goodbye);
  window.addEventListener('beforeunload', goodbye);

  return () => {
    clearInterval(timer);
    window.removeEventListener('pagehide', goodbye);
    window.removeEventListener('beforeunload', goodbye);
  };
}
