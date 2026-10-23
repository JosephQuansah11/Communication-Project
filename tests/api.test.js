import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { buildPptxFixture } from './fixture.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3311;
const BASE = `http://127.0.0.1:${PORT}`;

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('server did not start');
}

function openSocket() {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  const inbox = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const message = JSON.parse(String(raw));
    const index = waiters.findIndex((waiter) => waiter.match(message));
    if (index >= 0) {
      const [waiter] = waiters.splice(index, 1);
      waiter.resolve(message);
    } else {
      inbox.push(message);
    }
  });
  const next = (match, timeout = 4000) => {
    const found = inbox.findIndex(match);
    if (found >= 0) return Promise.resolve(inbox.splice(found, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = { match, resolve };
      waiters.push(waiter);
      setTimeout(() => {
        const at = waiters.indexOf(waiter);
        if (at >= 0) waiters.splice(at, 1);
        reject(new Error('timed out waiting for websocket message'));
      }, timeout);
    });
  };
  const open = new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return { ws, open, next };
}

test('API, import pipeline and live WebSocket rooms', async (t) => {
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production' },
    stdio: 'ignore',
  });
  t.after(() => child.kill('SIGTERM'));

  await waitForServer();

  const health = await (await fetch(`${BASE}/api/health`)).json();
  assert.equal(health.ok, true);

  const listed = await (await fetch(`${BASE}/api/decks`)).json();
  assert.ok(Array.isArray(listed.decks));
  assert.ok(listed.decks.some((deck) => deck.id === 'demo'), 'demo deck seeded');

  const demo = (await (await fetch(`${BASE}/api/decks/demo`)).json()).deck;
  assert.ok(demo.slides.length >= 5);

  // Import a real PPTX through the multipart endpoint.
  const fixture = await buildPptxFixture();
  const form = new FormData();
  form.append(
    'file',
    new Blob([fixture], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }),
    'integration.pptx'
  );
  const importedResponse = await fetch(`${BASE}/api/import`, { method: 'POST', body: form });
  assert.equal(importedResponse.status, 200);
  const imported = (await importedResponse.json()).deck;
  assert.equal(imported.slides.length, 2);
  assert.equal(imported.width, 1280);
  assert.ok(imported.slides[0].elements.some((element) => element.type === 'image'));

  const media = imported.slides[0].elements.find((element) => element.type === 'image');
  const mediaResponse = await fetch(`${BASE}${media.src}`);
  assert.equal(mediaResponse.status, 200);
  assert.ok((await mediaResponse.arrayBuffer()).byteLength > 10);

  // Deck persistence round-trip.
  const edited = { ...imported, title: 'Integration test deck', slides: imported.slides };
  const savedResponse = await fetch(`${BASE}/api/decks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deck: edited }),
  });
  assert.equal(savedResponse.status, 200);
  const reloaded = (await (await fetch(`${BASE}/api/decks/${imported.id}`)).json()).deck;
  assert.equal(reloaded.title, 'Integration test deck');

  // Legacy binary without a converter returns an actionable 415.
  const legacy = new FormData();
  legacy.append('file', new Blob([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0])]), 'legacy.ppt');
  const legacyResponse = await fetch(`${BASE}/api/import`, { method: 'POST', body: legacy });
  assert.equal(legacyResponse.status, 415);
  assert.match((await legacyResponse.json()).error, /save the file as \.pptx|LibreOffice/i);


  // Host + audience live room.
  const host = openSocket();
  await host.open;
  host.ws.send(JSON.stringify({ type: 'host', deck: demo, slideIndex: 0 }));
  const hosted = await host.next((message) => message.type === 'hosted');
  assert.match(hosted.code, /^[A-Z2-9]{6}$/);
  const hostSnapshot = await host.next((message) => message.type === 'session');
  assert.equal(hostSnapshot.slideIndex, 0);

  const viewer = openSocket();
  await viewer.open;
  viewer.ws.send(JSON.stringify({ type: 'join', code: hosted.code, name: 'Integration viewer' }));
  const snapshot = await viewer.next((message) => message.type === 'session');
  assert.equal(snapshot.deck.title, demo.title);
  const viewers = await host.next((message) => message.type === 'viewers');
  assert.equal(viewers.count, 1);
  assert.deepEqual(viewers.viewers, ['Integration viewer']);

  host.ws.send(JSON.stringify({ type: 'navigate', slideIndex: 2 }));
  const navigated = await viewer.next((message) => message.type === 'navigate');
  assert.equal(navigated.slideIndex, 2);

  const tableElement = demo.slides[2].elements.find((element) => element.type === 'table');
  const patchedTable = { ...tableElement.table, rows: 1, cols: 1, cells: { '0,0': { value: 'live' } } };
  host.ws.send(JSON.stringify({ type: 'table:update', slideIndex: 2, elementId: tableElement.id, table: patchedTable }));
  const tableMessage = await viewer.next((message) => message.type === 'table');
  assert.equal(tableMessage.table.cells['0,0'].value, 'live');

  host.ws.send(JSON.stringify({ type: 'pointer', x: 24, y: 64 }));
  const pointer = await viewer.next((message) => message.type === 'pointer');
  assert.equal(pointer.x, 24);
  assert.equal(pointer.y, 64);

  viewer.ws.send(JSON.stringify({ type: 'reaction', emoji: '🎉' }));
  const reactionOnHost = await host.next((message) => message.type === 'reaction');
  assert.equal(reactionOnHost.emoji, '🎉');

  viewer.ws.close();
  host.ws.close();

  const deleted = await fetch(`${BASE}/api/decks/${imported.id}`, { method: 'DELETE' });
  assert.equal(deleted.status, 200);
  const missing = await fetch(`${BASE}/api/decks/${imported.id}`);
  assert.equal(missing.status, 404);
});

