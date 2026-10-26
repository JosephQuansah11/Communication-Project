/**
 * One place that knows which operating system the app is running on, so the
 * launcher, the shortcut hints and the browser window all behave the way the
 * user's machine expects. Dependency free (no DOM, no Node globals at import
 * time), so both the server and the client can use it and it can be tested.
 */

/** Normalise a server-side `process.platform` value. */
export function detectServerPlatform(value = '') {
  const name = String(value || '').toLowerCase();
  if (name.startsWith('win')) return 'windows';
  if (name === 'darwin' || name === 'macos') return 'mac';
  if (name.includes('linux') || name.includes('freebsd') || name.includes('openbsd')) return 'linux';
  return 'other';
}

/**
 * Work out the client's platform from what the browser exposes: the modern
 * `userAgentData.platform` first, then the legacy `platform`, then the UA string.
 */
export function detectClientPlatform({ userAgentData, platform, userAgent } = {}) {
  const modern = String(userAgentData?.platform || '').toLowerCase();
  const legacy = String(platform || '').toLowerCase();
  const ua = String(userAgent || '').toLowerCase();
  const combined = `${modern} ${legacy} ${ua}`;
  if (/android/.test(combined)) return 'android';
  if (/(iphone|ipad|ipod|ios)/.test(combined)) return 'ios';
  if (/(mac|darwin|iphone|ipad)/.test(combined)) return 'mac';
  if (/win/.test(combined)) return 'windows';
  if (/(linux|x11|cros|bsd)/.test(combined)) return 'linux';
  return 'other';
}

/** The key that stands in for "the command key" on this platform. */
export function modifierKey(platform) {
  return platform === 'mac' || platform === 'ios' ? '⌘' : 'Ctrl';
}

/** Format a shortcut written with `Mod` into what the user should actually press. */
export function shortcutLabel(combo, platform) {
  const text = String(combo || '');
  if (platform === 'mac' || platform === 'ios') {
    return text
      .replace(/\bMod\b/g, '⌘')
      .replace(/\bShift\b/g, '⇧')
      .replace(/\bAlt\b/g, '⌥')
      .replace(/\s*\+\s*/g, '');
  }
  return text.replace(/\bMod\b/g, 'Ctrl');
}

/** A friendly name for the platform, used in the UI and the startup log. */
export function platformLabel(platform) {
  return (
    {
      windows: 'Windows',
      mac: 'macOS',
      linux: 'Linux',
      android: 'Android',
      ios: 'iOS',
    }[platform] || 'your system'
  );
}

/**
 * How to open a URL in the user's browser. Returning the command instead of
 * running it keeps the platform rules in one testable place.
 */
export function openCommand(platform, url, browserPath = null) {
  if (browserPath) return { command: browserPath, args: [`--app=${url}`, '--new-window', '--window-size=1440,900'] };
  if (platform === 'windows') return { command: 'cmd', args: ['/c', 'start', '', url] };
  if (platform === 'mac') return { command: 'open', args: [url] };
  return { command: 'xdg-open', args: [url] };
}
