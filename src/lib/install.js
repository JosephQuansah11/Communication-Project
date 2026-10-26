/**
 * Installing the app on a phone.
 *
 * Android (Chrome, Edge, Samsung Internet) fires `beforeinstallprompt`, which can be
 * held and replayed from a button. iOS Safari has no such event — installing means
 * Share ▸ "Add to Home Screen" — so the only honest thing to do there is say so.
 *
 * Everything here is a thin wrapper over the browser APIs; the decisions are pure
 * functions so they can be tested without a browser.
 */

/** How the phone can install this app, if it can. */
export function installRoute({ userAgent = '', standalone = false, hasPrompt = false } = {}) {
  if (standalone) return 'installed';
  const ua = String(userAgent);
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && /Mobile/.test(ua));
  if (ios) return 'ios-share';
  if (hasPrompt) return 'prompt';
  return 'unavailable';
}

/** The wording shown for each route. */
export const INSTALL_HINTS = {
  installed: 'QuandrionSlideMaster is already installed — it is running from your home screen.',
  'ios-share': 'On iPhone or iPad: tap Share, then “Add to Home Screen”.',
  prompt: 'Install QuandrionSlideMaster on this device.',
  unavailable: 'Open this in Chrome, Edge or Safari on your phone to install it to the home screen.',
};

/** True when the app is already running as an installed app. */
export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
    window.navigator?.standalone === true
  );
}

let deferred = null;
const listeners = new Set();

/**
 * Watch for the install prompt and keep it, so a button can trigger it later.
 * Returns a function that asks the browser to show the prompt, or null when it
 * cannot (iOS, or a browser that never offered one).
 */
export function watchInstallPrompt() {
  if (typeof window === 'undefined') return () => {};
  const onPrompt = (event) => {
    event.preventDefault();
    deferred = event;
    listeners.forEach((fn) => fn(true));
  };
  const onInstalled = () => {
    deferred = null;
    listeners.forEach((fn) => fn(false));
  };
  window.addEventListener('beforeinstallprompt', onPrompt);
  window.addEventListener('appinstalled', onInstalled);
  return () => {
    window.removeEventListener('beforeinstallprompt', onPrompt);
    window.removeEventListener('appinstalled', onInstalled);
  };
}

/** How this device can install the app right now. */
export function currentInstallRoute() {
  return installRoute({
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    standalone: isStandalone(),
    hasPrompt: Boolean(deferred),
  });
}

/** Ask the browser to install the app. Resolves to whether it was accepted. */
export async function promptInstall() {
  if (!deferred) return false;
  const event = deferred;
  deferred = null;
  try {
    event.prompt();
    const choice = await event.userChoice;
    return choice?.outcome === 'accepted';
  } catch {
    return false;
  }
}

/**
 * Register the service worker so the app opens offline and can be installed.
 * Development is skipped: Vite's dev server serves modules one by one, and a cached
 * shell would hide every change.
 */
export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  if (!import.meta.env?.PROD) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* installation still works without the offline cache */
    });
  });
}
