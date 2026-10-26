import test from 'node:test';
import assert from 'node:assert/strict';
import { INSTALL_HINTS, installRoute } from '../src/lib/install.js';

test('each phone is told how to install the app', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Mobile Safari/537.36';
  const desktop = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36';

  // iOS Safari never fires an install prompt: the Share menu is the only way.
  assert.equal(installRoute({ userAgent: iphone }), 'ios-share');
  assert.equal(installRoute({ userAgent: iphone, hasPrompt: true }), 'ios-share');

  // Android and Chrome hand over a prompt that can be replayed from a button.
  assert.equal(installRoute({ userAgent: android, hasPrompt: true }), 'prompt');
  // Until that prompt arrives there is nothing to replay.
  assert.equal(installRoute({ userAgent: android }), 'unavailable');
  assert.equal(installRoute({ userAgent: desktop, hasPrompt: true }), 'prompt');

  // An iPad reports itself as a Mac, and is caught by the Mobile token.
  assert.equal(
    installRoute({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }),
    'ios-share'
  );
  // A real Mac is not a phone.
  assert.equal(installRoute({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15' }), 'unavailable');

  // Already installed: there is nothing left to do.
  assert.equal(installRoute({ userAgent: android, standalone: true }), 'installed');
  assert.equal(installRoute({ userAgent: iphone, standalone: true }), 'installed');
});

test('every install route has something to say', () => {
  for (const route of ['installed', 'ios-share', 'prompt', 'unavailable']) {
    assert.equal(typeof INSTALL_HINTS[route], 'string', route);
    assert.ok(INSTALL_HINTS[route].length > 20, `${route} explains itself`);
  }
  assert.match(INSTALL_HINTS['ios-share'], /Add to Home Screen/i);
});
