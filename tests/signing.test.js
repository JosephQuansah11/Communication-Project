import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_TIMESTAMP_URL, PUBLISHER, psQuote, signFile, signingConfig } from '../scripts/sign-exe.mjs';

/** A throwaway file, so the signing paths have something real to work on. */
const fakeExe = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'quandrion-sign-')), 'QuandrionSlideMaster.exe');
fs.writeFileSync(fakeExe, 'not really an executable');

test('the app has a publisher name', () => {
  assert.equal(PUBLISHER, 'josephQuansah11');
});

test('signing picks the method the environment asks for', () => {
  // Nothing configured: nothing to do.
  assert.equal(signingConfig({}).method, 'none');
  assert.equal(signingConfig({}).required, false);
  assert.equal(signingConfig({}).timestamp, DEFAULT_TIMESTAMP_URL);

  // A certificate file wins, and its path is made absolute.
  const withPfx = signingConfig({ SLIDESMITH_CERT_PFX: 'certs/publisher.pfx', SLIDESMITH_CERT_PASSWORD: 'secret' });
  assert.equal(withPfx.method, 'pfx');
  assert.equal(withPfx.pfx, path.resolve('certs/publisher.pfx'));
  assert.equal(withPfx.password, 'secret');

  // A store thumbprint comes next; spaces and case in it do not matter.
  const withThumb = signingConfig({ SLIDESMITH_CERT_SHA1: 'AB CD EF 12' });
  assert.equal(withThumb.method, 'store');
  assert.equal(withThumb.thumbprint, 'ABCDEF12');

  // A custom command is the fallback, and it can override the timestamp server.
  const withCommand = signingConfig({ SLIDESMITH_SIGN_COMMAND: 'signtool sign {file}', SLIDESMITH_TIMESTAMP_URL: 'http://ts.example' });
  assert.equal(withCommand.method, 'command');
  assert.equal(withCommand.timestamp, 'http://ts.example');

  // Release builds can insist on a signature.
  assert.equal(signingConfig({ SLIDESMITH_REQUIRE_SIGNING: '1' }).required, true);
});

test('PowerShell values are quoted so paths cannot break out', () => {
  assert.equal(psQuote('C:\\build\\QuandrionSlideMaster.exe'), "'C:\\build\\QuandrionSlideMaster.exe'");
  assert.equal(psQuote("it's here"), "'it''s here'");
});

test('an unconfigured build reports that it is unsigned instead of failing', async () => {
  const lines = [];
  const result = await signFile(fakeExe, {
    env: {},
    log: (line) => lines.push(String(line)),
  });
  assert.equal(result.signed, false);
  assert.equal(result.reason, 'not-configured');
  assert.equal(result.publisher, 'josephQuansah11');
  assert.ok(lines.some((line) => line.includes('SLIDESMITH_CERT_PFX')), 'it says how to configure signing');
});

test('a missing certificate file is reported, not thrown, unless signing is required', async () => {
  const lines = [];
  const soft = await signFile(fakeExe, {
    env: { SLIDESMITH_CERT_PFX: 'build/certs/absent.pfx' },
    log: (line) => lines.push(String(line)),
  });
  assert.equal(soft.signed, false);
  assert.equal(soft.reason, 'missing-certificate');

  await assert.rejects(
    signFile(fakeExe, {
      env: { SLIDESMITH_CERT_PFX: 'build/certs/absent.pfx', SLIDESMITH_REQUIRE_SIGNING: '1' },
      log: () => {},
    }),
    /absent\.pfx does not exist/
  );
});
