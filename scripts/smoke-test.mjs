/**
 * End-to-end smoke test for a running QuandrionSlideMaster instance.
 *
 * Works against the dev server, a production server, or the packaged
 * application: it exercises static delivery, the deck API, media upload,
 * native PPTX import and the live WebSocket room.
 *
 * Usage: node scripts/smoke-test.mjs [baseUrl]     (default http://localhost:3000)
 */
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { buildPptxFixture } from '../tests/fixture.js';

const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const wsBase = base.replace(/^http/, 'ws');
const checks = [];

function pass(label, detail = '') {
  checks.push(`  ok   ${label}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  // 1. The UI is served.
  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200, 'index.html should be served');
  const html = await page.text();
  assert.match(html, /<div id="root">/, 'the SPA shell should be present');
  pass('serves the client', `${(html.length / 1024).toFixed(1)} kB`);

  const script = html.match(/src="([^"]+\.js)"/)?.[1];
  assert.ok(script, 'the client bundle should be referenced');
  const bundle = await fetch(`${base}${script}`);
  assert.equal(bundle.status, 200, 'the client bundle should be served');
  pass('serves the client bundle', script);

  // 2. Health and fonts.
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.equal(health.ok, true, 'health check should pass');
  pass('health', `converter=${Boolean(health.converter)}`);

  const fonts = await (await fetch(`${base}/api/fonts`)).json();
  assert.ok(Array.isArray(fonts.families), 'font families should be listed');
  pass('system fonts', `${fonts.families.length} families`);

  // 3. Deck round trip.
  const deckId = `smoke-${Date.now().toString(36)}`;
  const deck = {
    id: deckId,
    title: 'Smoke test deck',
    width: 1280,
    height: 720,
    slides: [
      {
        id: 'smoke-slide',
        background: { color: '#0b1120', gradient: { from: '#312e81', to: '#6366f1', angle: 135 } },
        elements: [
          {
            id: 'smoke-text',
            type: 'text',
            x: 60,
            y: 80,
            w: 640,
            h: 200,
            text: 'Title Body',
            html: '<h1>Title</h1><p><span style="background-color: #fef08a">Body</span><sup>1</sup></p>',
            style: { fontSize: 26 },
          },
        ],
      },
    ],
  };
  const saved = await fetch(`${base}/api/decks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deck }),
  });
  assert.equal(saved.status, 200, 'the deck should save');
  const readBack = await (await fetch(`${base}/api/decks/${deckId}`)).json();
  assert.equal(readBack.deck.slides[0].elements[0].html, deck.slides[0].elements[0].html, 'rich text should round-trip');
  assert.equal(readBack.deck.slides[0].background.gradient.angle, 135, 'the gradient should round-trip');
  pass('deck create + read', deckId);

  // 4. Multipart media upload (multer -> busboy).
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
    'base64'
  );
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), 'pixel.png');
  const uploaded = await (await fetch(`${base}/api/decks/${deckId}/assets`, { method: 'POST', body: form })).json();
  assert.match(uploaded.url || '', /^\/media\//, 'the asset should return a media URL');
  const media = await fetch(`${base}${uploaded.url}`);
  assert.equal(media.status, 200, 'the uploaded asset should be served');
  pass('media upload + serve', uploaded.url);

  // 5. Native PPTX import.
  const pptx = await buildPptxFixture();
  const importForm = new FormData();
  importForm.append('file', new Blob([pptx]), 'integration.pptx');
  const imported = await (await fetch(`${base}/api/import`, { method: 'POST', body: importForm })).json();
  assert.ok(imported.deck?.slides?.length >= 1, 'the PPTX should import into a deck');
  pass('PPTX import', `${imported.deck.slides.length} slide(s)`);

  // 6. Live WebSocket room (host + audience) — navigation carries the animation step.
  const live = await new Promise((resolve, reject) => {
    const host = new WebSocket(`${wsBase}/ws`);
    const timer = setTimeout(() => reject(new Error('WebSocket host timed out')), 8000);
    host.on('open', () => host.send(JSON.stringify({ type: 'host', deck, slideIndex: 0 })));
    host.on('message', (raw) => {
      const message = JSON.parse(String(raw));
      if (message.type !== 'hosted') return;
      clearTimeout(timer);
      const viewer = new WebSocket(`${wsBase}/ws`);
      const viewerTimer = setTimeout(() => reject(new Error('WebSocket viewer timed out')), 8000);
      viewer.on('open', () => viewer.send(JSON.stringify({ type: 'join', code: message.code, name: 'Smoke' })));
      viewer.on('message', (viewerRaw) => {
        const viewerMessage = JSON.parse(String(viewerRaw));
        if (viewerMessage.type === 'session') {
          // The presenter plays animation step 3; the audience must follow it.
          host.send(JSON.stringify({ type: 'navigate', slideIndex: 0, step: 3 }));
          return;
        }
        if (viewerMessage.type === 'navigate') {
          clearTimeout(viewerTimer);
          viewer.close();
          host.close();
          resolve({ code: message.code, navigate: viewerMessage });
        }
      });
      viewer.on('error', reject);
    });
    host.on('error', reject);
  });
  pass('live WebSocket room', `code ${live.code}`);
  assert.equal(live.navigate.slideIndex, 0, 'the audience follows the slide');
  assert.equal(live.navigate.step, 3, 'the audience follows the animation step');
  pass('animation step relayed to the audience', `slide ${live.navigate.slideIndex}, step ${live.navigate.step}`);

  // 7. Clean up everything this run created.
  const removed = await fetch(`${base}/api/decks/${deckId}`, { method: 'DELETE' });
  assert.equal(removed.status, 200, 'the smoke deck should delete');
  if (imported.deck?.id) await fetch(`${base}/api/decks/${imported.deck.id}`, { method: 'DELETE' });
  pass('deck delete');

  console.log(`\nSmoke test against ${base}\n`);
  console.log(checks.join('\n'));
  console.log(`\n  ${checks.length} checks passed.\n`);
}

main().catch((error) => {
  console.error(`\nSmoke test failed: ${error.message}\n`);
  if (checks.length) console.error(checks.join('\n'));
  process.exit(1);
});
