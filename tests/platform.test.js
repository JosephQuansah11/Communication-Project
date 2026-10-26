import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectClientPlatform,
  detectServerPlatform,
  modifierKey,
  openCommand,
  platformLabel,
  shortcutLabel,
} from '../shared/platform.js';

test('the server platform is normalised', () => {
  assert.equal(detectServerPlatform('win32'), 'windows');
  assert.equal(detectServerPlatform('darwin'), 'mac');
  assert.equal(detectServerPlatform('linux'), 'linux');
  assert.equal(detectServerPlatform('freebsd'), 'linux');
  assert.equal(detectServerPlatform('aix'), 'other');
  assert.equal(detectServerPlatform(), 'other');
});

test('the client platform comes from whatever the browser exposes', () => {
  assert.equal(detectClientPlatform({ userAgentData: { platform: 'Windows' } }), 'windows');
  assert.equal(detectClientPlatform({ userAgentData: { platform: 'macOS' } }), 'mac');
  assert.equal(detectClientPlatform({ platform: 'Linux x86_64' }), 'linux');
  assert.equal(detectClientPlatform({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' }), 'ios');
  assert.equal(detectClientPlatform({ userAgent: 'Mozilla/5.0 (Linux; Android 14)' }), 'android');
  assert.equal(detectClientPlatform({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }), 'windows');
  assert.equal(detectClientPlatform({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' }), 'linux');
  assert.equal(detectClientPlatform({}), 'other');
});

test('shortcuts are written the way the user presses them', () => {
  assert.equal(modifierKey('mac'), '⌘');
  assert.equal(modifierKey('windows'), 'Ctrl');
  assert.equal(shortcutLabel('Mod+S', 'windows'), 'Ctrl+S');
  assert.equal(shortcutLabel('Mod+S', 'linux'), 'Ctrl+S');
  assert.equal(shortcutLabel('Mod+S', 'mac'), '⌘S');
  assert.equal(shortcutLabel('Mod+Shift+Z', 'mac'), '⌘⇧Z');
  assert.equal(shortcutLabel('Mod+Alt+H', 'mac'), '⌘⌥H');
  assert.equal(shortcutLabel('Mod+Shift+Z', 'windows'), 'Ctrl+Shift+Z');
  assert.equal(shortcutLabel('F5', 'mac'), 'F5');
});

test('each platform gets the right way to open a browser', () => {
  assert.deepEqual(openCommand('windows', 'http://x'), { command: 'cmd', args: ['/c', 'start', '', 'http://x'] });
  assert.deepEqual(openCommand('mac', 'http://x'), { command: 'open', args: ['http://x'] });
  assert.deepEqual(openCommand('linux', 'http://x'), { command: 'xdg-open', args: ['http://x'] });
  const app = openCommand('windows', 'http://x', 'C:/Chrome/chrome.exe');
  assert.equal(app.command, 'C:/Chrome/chrome.exe');
  assert.ok(app.args.includes('--app=http://x'), 'a found browser opens as an app window');
});

test('platforms have friendly names', () => {
  assert.equal(platformLabel('windows'), 'Windows');
  assert.equal(platformLabel('mac'), 'macOS');
  assert.equal(platformLabel('linux'), 'Linux');
  assert.equal(platformLabel('plan9'), 'your system');
});
