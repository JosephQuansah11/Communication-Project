/**
 * The clipboard: reading the system one, writing to it, and deciding what a paste
 * should do.
 *
 * Reading the system clipboard is only allowed from a user gesture — a click on our
 * own context menu, a toolbar button or Ctrl+V — and some browsers refuse it
 * altogether, so every path can fail and the caller has to cope with `null`. The
 * browser's own `paste` event is the more reliable route for pictures (see
 * `planPaste`), and both are pure enough to be tested without a browser.
 *
 * `readClipboard` returns the richest thing on the clipboard:
 *   { kind: 'image', blob, type }
 *   { kind: 'html',  html }
 *   { kind: 'text',  text }
 * or null when there is nothing readable.
 */
export async function readClipboard(clipboard = globalThis.navigator?.clipboard) {
  if (!clipboard) return null;

  if (typeof clipboard.read === 'function') {
    try {
      const items = await clipboard.read();
      for (const item of items || []) {
        const types = item.types || [];
        const imageType = types.find((type) => String(type).startsWith('image/'));
        if (imageType) return { kind: 'image', blob: await item.getType(imageType), type: imageType };
        const htmlType = types.find((type) => type === 'text/html');
        if (htmlType) {
          const html = await (await item.getType(htmlType)).text();
          if (html) return { kind: 'html', html };
        }
        const textType = types.find((type) => type === 'text/plain');
        if (textType) {
          const text = await (await item.getType(textType)).text();
          if (text) return { kind: 'text', text };
        }
      }
    } catch {
      /* fall through to readText, which needs fewer permissions */
    }
  }

  if (typeof clipboard.readText === 'function') {
    try {
      const text = await clipboard.readText();
      if (text) return { kind: 'text', text };
    } catch {
      /* denied */
    }
  }

  return null;
}

/** Put plain text on the clipboard, ignoring a refusal (the app keeps its own copy). */
export async function writeClipboardText(text, clipboard = globalThis.navigator?.clipboard) {
  if (!text || typeof clipboard?.writeText !== 'function') return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Wrap a clipboard picture in a `File` so it can be uploaded and placed exactly
 * like a picture the user picked from disk (the name is what the asset keeps).
 */
export function pastedImageFile(payload, stamp = Date.now()) {
  const blob = payload?.blob;
  if (!blob) return null;
  const type = String(payload.type || blob.type || 'image/png');
  const extension = type.includes('jpeg') ? 'jpg' : (type.split('/')[1] || 'png').split('+')[0];
  if (typeof File !== 'function') return blob;
  return new File([blob], `pasted-${stamp}.${extension}`, { type });
}

/**
 * What a `paste` event should do.
 *
 * The event is the reliable path: the browser hands over a screenshot, a copied
 * picture or formatted text without asking for any permission. `appClipboard` is
 * what the app itself put on the clipboard (`{ elements, text }`), so its own
 * objects win over the plain-text mirror we wrote beside them.
 *
 * Returns one of:
 *   { kind: 'image',    file }
 *   { kind: 'elements', elements }
 *   { kind: 'html',     html }
 *   { kind: 'text',     text }
 *   { kind: 'none' }
 */
export function planPaste({ files = [], html = '', text = '' } = {}, appClipboard = null) {
  const image = [...files].find((file) => String(file?.type || '').startsWith('image/'));
  if (image) return { kind: 'image', file: image };

  // The app's own objects win over the plain-text mirror we wrote beside them —
  // unless the mirror never made it to the clipboard, in which case the system
  // clipboard holds something older and unrelated.
  const own = String(appClipboard?.text || '').trim();
  const stale = !own || appClipboard?.wrote === false;
  if (appClipboard?.elements?.length && (stale || !text.trim() || text.trim() === own)) {
    return { kind: 'elements', elements: appClipboard.elements };
  }

  if (html) return { kind: 'html', html };
  if (text) return { kind: 'text', text };
  return { kind: 'none' };
}
