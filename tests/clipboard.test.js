import test from 'node:test';
import assert from 'node:assert/strict';
import { pastedImageFile, planPaste, readClipboard, writeClipboardText } from '../src/lib/clipboard.js';

/** A stand-in for `navigator.clipboard`. */
const fakeClipboard = ({ items = null, text = null, failRead = false, failText = false } = {}) => ({
  read: items
    ? async () => {
        if (failRead) throw new Error('denied');
        return items;
      }
    : undefined,
  readText: text !== null
    ? async () => {
        if (failText) throw new Error('denied');
        return text;
      }
    : undefined,
});

const item = (types, contents) => ({
  types,
  getType: async (type) => ({
    text: async () => contents[type] ?? '',
    ...contents[type],
  }),
});

test('a picture on the clipboard comes back as an image', async () => {
  const blob = { size: 12 };
  const payload = await readClipboard(
    fakeClipboard({ items: [{ types: ['image/png'], getType: async () => blob }] })
  );
  assert.equal(payload.kind, 'image');
  assert.equal(payload.type, 'image/png');
  assert.equal(payload.blob, blob);
});

test('formatted text is preferred over its plain-text twin', async () => {
  const payload = await readClipboard(
    fakeClipboard({
      items: [
        {
          types: ['text/html', 'text/plain'],
          getType: async (type) => ({ text: async () => (type === 'text/html' ? '<b>Bold</b>' : 'Bold') }),
        },
      ],
    })
  );
  assert.equal(payload.kind, 'html');
  assert.equal(payload.html, '<b>Bold</b>');
});

test('plain text is used when there is nothing richer', async () => {
  assert.deepEqual(await readClipboard(fakeClipboard({ items: [{ types: ['text/plain'], getType: async () => ({ text: async () => 'hello' }) }] })), {
    kind: 'text',
    text: 'hello',
  });
  assert.deepEqual(await readClipboard(fakeClipboard({ text: 'typed' })), { kind: 'text', text: 'typed' });
});

test('a refused or empty clipboard reads as nothing', async () => {
  assert.equal(await readClipboard(undefined), null);
  assert.equal(await readClipboard(fakeClipboard()), null);
  assert.equal(await readClipboard(fakeClipboard({ items: [], text: '' })), null);
  assert.equal(await readClipboard(fakeClipboard({ items: [{ types: ['image/png'], getType: async () => { throw new Error('no'); } }] })), null);
  // read() fails, so the fallback has to answer instead.
  assert.deepEqual(await readClipboard(fakeClipboard({ items: [], text: 'fallback', failRead: true })), { kind: 'text', text: 'fallback' });
  assert.equal(await readClipboard(fakeClipboard({ text: 'nope', failText: true })), null);
});

test('writing text reports whether the clipboard accepted it', async () => {
  const written = [];
  const clipboard = { writeText: async (value) => written.push(value) };
  assert.equal(await writeClipboardText('hello', clipboard), true);
  assert.deepEqual(written, ['hello']);
  assert.equal(await writeClipboardText('', clipboard), false);
  assert.equal(await writeClipboardText('x', { writeText: async () => { throw new Error('denied'); } }), false);
  assert.equal(await writeClipboardText('x', undefined), false);
});

test('a pasted picture becomes an uploadable file', () => {
  const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
  const file = pastedImageFile({ blob, type: 'image/png' }, 42);
  assert.equal(file.name, 'pasted-42.png');
  assert.equal(file.type, 'image/png');
  assert.equal(file.size, 3);
  assert.equal(typeof file.arrayBuffer, 'function');
  assert.equal(pastedImageFile({ blob, type: 'image/jpeg' }, 7).name, 'pasted-7.jpg');
  assert.equal(pastedImageFile({ blob }, 7).name, 'pasted-7.png');
  assert.equal(pastedImageFile({ blob, type: 'image/svg+xml' }, 7).name, 'pasted-7.svg');
  assert.equal(pastedImageFile(null), null);
});

test('a picture on the clipboard always wins a paste', () => {
  const picture = { type: 'image/png' };
  const plan = planPaste({ files: [picture], text: 'ignored' }, { elements: [{ id: 'a' }], text: 'ignored' });
  assert.deepEqual(plan, { kind: 'image', file: picture });
  // Even beside a file we cannot use, a picture is still a picture.
  assert.equal(planPaste({ files: [{ type: 'text/plain' }, picture] }).kind, 'image');
});

test('the app pastes its own objects back when the clipboard still holds them', () => {
  const app = { elements: [{ id: 'a' }], text: 'Hello', wrote: true };
  assert.deepEqual(planPaste({ text: 'Hello' }, app), { kind: 'elements', elements: app.elements });
  // Nothing on the clipboard at all — the objects are the best guess.
  assert.deepEqual(planPaste({}, app), { kind: 'elements', elements: app.elements });
  // The mirror never reached the clipboard, so the system one is older and unrelated.
  assert.deepEqual(planPaste({ text: 'something else' }, { ...app, wrote: false }), {
    kind: 'elements',
    elements: app.elements,
  });
  // Someone copied new text elsewhere: that wins.
  assert.deepEqual(planPaste({ text: 'something else' }, app), { kind: 'text', text: 'something else' });
});

test('pasting without app objects falls back to the clipboard content', () => {
  assert.deepEqual(planPaste({ html: '<b>Bold</b>', text: 'Bold' }), { kind: 'html', html: '<b>Bold</b>' });
  assert.deepEqual(planPaste({ text: 'plain' }), { kind: 'text', text: 'plain' });
  assert.deepEqual(planPaste({}), { kind: 'none' });
  assert.deepEqual(planPaste(), { kind: 'none' });
  // An empty app clipboard changes nothing.
  assert.deepEqual(planPaste({ text: 'plain' }, { elements: [], text: '' }), { kind: 'text', text: 'plain' });
});
