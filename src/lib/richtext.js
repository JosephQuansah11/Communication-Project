/**
 * Rich-text helpers for slide text boxes.
 *
 * A text box can hold formatted HTML — headings, bold/italic/underline,
 * superscript/subscript, numbered and bulleted lists, paragraph alignment and
 * highlighting. Everything that is written back to a deck passes through
 * `sanitizeHtml`, so a deck stays a plain JSON document with no scripts or
 * inline event handlers.
 *
 * The module is dependency free (no DOM) so it can be unit tested in Node.
 */

const ALLOWED_TAGS = new Set([
  'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'ins', 'mark',
  'sup', 'sub', 'span', 'font', 'a', 'br',
  'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre',
  'ul', 'ol', 'li',
]);

/**
 * Void tags never have children, so a dropped one must not swallow the rest of the
 * document: the clipboard HTML of a copied paragraph often starts with
 * `<meta charset='utf-8'>`, which would otherwise hide everything after it.
 */
const VOID_TAGS = new Set([
  'br', 'hr', 'img', 'meta', 'link', 'input', 'source', 'track', 'area',
  'base', 'col', 'embed', 'param', 'wbr',
]);

/** Tags whose entire subtree is dropped (content included). */
const DROP_TAGS = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript',
  'svg', 'math', 'form', 'input', 'button', 'textarea', 'select', 'link', 'meta',
]);

const ALLOWED_ATTRS = {
  span: ['style'],
  font: ['style'],
  div: ['style'],
  p: ['style'],
  h1: ['style'],
  h2: ['style'],
  h3: ['style'],
  h4: ['style'],
  h5: ['style'],
  h6: ['style'],
  blockquote: ['style'],
  pre: ['style'],
  li: ['style'],
  ul: ['style'],
  ol: ['style'],
  a: ['href'],
};

/** Inline style properties a text box is allowed to persist. */
export const ALLOWED_STYLE_PROPS = new Set([
  'color',
  'background-color',
  'font-size',
  'font-weight',
  'font-style',
  'font-family',
  'text-decoration',
  'text-decoration-line',
  'vertical-align',
  'text-align',
  'line-height',
  'letter-spacing',
  'text-transform',
  'font-variant',
  'white-space',
  'list-style-type',
  'padding-left',
  'margin',
  'margin-left',
  'margin-bottom',
  'text-shadow',
  'border-radius',
  'opacity',
]);

const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^<>]*?)?)\/?>/g;
const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function decodeEntities(value) {
  return String(value ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function isSafeStyleValue(value) {
  if (!value) return false;
  if (value.length > 160) return false;
  if (/url\s*\(|expression\s*\(|javascript:|[\\<>"]/i.test(value)) return false;
  return true;
}

/** Keep only allowlisted declarations from an inline `style` attribute. */
export function sanitizeStyle(value) {
  if (!value) return '';
  return String(value)
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const index = part.indexOf(':');
      if (index < 0) return null;
      const prop = part.slice(0, index).trim().toLowerCase();
      const val = part.slice(index + 1).trim().replace(/\s+/g, ' ');
      if (!ALLOWED_STYLE_PROPS.has(prop)) return null;
      if (!isSafeStyleValue(val)) return null;
      return `${prop}: ${val}`;
    })
    .filter(Boolean)
    .join('; ');
}

function sanitizeAttrs(name, raw) {
  const allowed = ALLOWED_ATTRS[name];
  if (!allowed || !raw) return '';
  const out = [];
  ATTR_RE.lastIndex = 0;
  let match;
  while ((match = ATTR_RE.exec(raw))) {
    const key = match[1].toLowerCase();
    if (!allowed.includes(key)) continue;
    const value = match[3] ?? match[4] ?? match[5] ?? '';
    if (key === 'style') {
      const style = sanitizeStyle(value);
      if (style) out.push(`style="${escapeAttr(style)}"`);
      continue;
    }
    if (key === 'href') {
      const href = value.trim();
      if (!/^(https?:|mailto:|tel:|#|\/)/i.test(href)) continue;
      out.push(`href="${escapeAttr(href)}"`);
      continue;
    }
    out.push(`${key}="${escapeAttr(value)}"`);
  }
  return out.length ? ` ${out.join(' ')}` : '';
}

/**
 * Strip everything that is not part of the rich-text vocabulary.
 * Unknown tags are unwrapped (their text is kept), dangerous tags are dropped
 * with their contents, and event handlers / scripts never survive.
 */
export function sanitizeHtml(html) {
  if (html === undefined || html === null) return '';
  const source = String(html);
  if (!source) return '';
  let out = '';
  let cursor = 0;
  const stack = [];
  const dropped = [];
  TAG_RE.lastIndex = 0;
  let match;
  while ((match = TAG_RE.exec(source))) {
    const text = source.slice(cursor, match.index);
    if (!dropped.length) out += text;
    cursor = match.index + match[0].length;
    const full = match[0];
    const name = match[1].toLowerCase();
    const rawAttrs = match[2] || '';
    const closing = full.startsWith('</');
    const selfClosing = /\/>$/.test(full) || VOID_TAGS.has(name);

    if (dropped.length) {
      if (closing && name === dropped[dropped.length - 1]) dropped.pop();
      else if (!closing && !selfClosing && DROP_TAGS.has(name)) dropped.push(name);
      continue;
    }

    if (DROP_TAGS.has(name)) {
      if (!closing && !selfClosing) dropped.push(name);
      continue;
    }

    if (!ALLOWED_TAGS.has(name)) continue;

    if (closing) {
      const index = stack.lastIndexOf(name);
      if (index < 0) continue;
      for (let i = stack.length - 1; i >= index; i -= 1) out += `</${stack[i]}>`;
      stack.length = index;
      continue;
    }

    const attrs = sanitizeAttrs(name, rawAttrs);
    out += `<${name}${attrs}>`;
    if (!selfClosing) stack.push(name);
  }
  if (!dropped.length) out += source.slice(cursor);
  while (stack.length) out += `</${stack.pop()}>`;
  return out;
}

/** Plain-text projection of formatted HTML (used for search, notes and fallbacks). */
export function htmlToPlainText(html) {
  if (!html) return '';
  const text = decodeEntities(
    String(html)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(div|p|h[1-6]|blockquote|pre)>/gi, '\n')
      .replace(/<li[^>]*>/gi, '\n• ')
      .replace(/<\/li>/gi, '')
      .replace(/<[^>]*>/g, '')
  );
  return text.replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** True when the sanitized markup actually carries formatting. */
export function hasRichHtml(html) {
  if (!html) return false;
  const sanitized = sanitizeHtml(html);
  if (!sanitized) return false;
  return /<([a-z][a-z0-9]*)(\s[^>]*)?>/i.test(sanitized);
}

/** Plain text to safe HTML, keeping line breaks. */
export function plainTextToHtml(text) {
  return escapeHtml(text).replace(/\n/g, '<br>');
}

function runToHtml(run) {
  const styles = [];
  if (run.color) styles.push(`color: ${run.color}`);
  if (run.highlight) styles.push(`background-color: ${run.highlight}`);
  if (run.bold) styles.push('font-weight: 700');
  if (run.italic) styles.push('font-style: italic');
  if (run.underline) styles.push('text-decoration: underline');
  if (run.fontFamily) styles.push(`font-family: ${run.fontFamily}`);
  if (run.superscript) styles.push('vertical-align: super', 'font-size: 0.72em');
  else if (run.subscript) styles.push('vertical-align: sub', 'font-size: 0.72em');
  else if (run.fontSize) styles.push(`font-size: ${run.fontSize}px`);
  const body = plainTextToHtml(run.text || '');
  if (!styles.length) return body;
  return `<span style="${escapeAttr(sanitizeStyle(styles.join('; ')))}">${body}</span>`;
}

/** Convert imported PPTX runs into the same HTML vocabulary the editor writes. */
export function runsToHtml(runs, text) {
  if (!Array.isArray(runs) || !runs.length) return '';
  const joined = runs.map((run) => run.text || '').join('');
  if (text !== undefined && text !== null && joined !== text) return plainTextToHtml(text);
  return runs.map((run) => runToHtml(run)).join('');
}

/**
 * The HTML that should be rendered/edited for a text element: explicit `html`
 * first, then imported runs, then the plain `text`.
 */
export function textElementHtml(element) {
  if (!element) return '';
  if (element.html) {
    const sanitized = sanitizeHtml(element.html);
    if (sanitized) return sanitized;
  }
  if (Array.isArray(element.runs) && element.runs.length) {
    const fromRuns = runsToHtml(element.runs, element.text);
    if (fromRuns) return fromRuns;
  }
  return plainTextToHtml(element.text || '');
}

function parseStyleMap(style) {
  const map = {};
  String(style || '')
    .split(';')
    .forEach((part) => {
      const index = part.indexOf(':');
      if (index < 0) return;
      const prop = part.slice(0, index).trim().toLowerCase();
      const value = part.slice(index + 1).trim();
      if (prop && value) map[prop] = value;
    });
  return map;
}

/**
 * If the markup is exactly one wrapper `<span>` (the shape this module writes),
 * split it into its style attribute and inner content. Returns null otherwise.
 */
function splitWrapperSpan(html) {
  const source = String(html || '').trim();
  if (!/^<span(\s[^>]*)?>/i.test(source)) return null;
  const openEnd = source.indexOf('>');
  const openTag = source.slice(0, openEnd + 1);
  let depth = 0;
  let closeStart = -1;
  const re = /<(\/?)span(\s[^>]*)?>/gi;
  let match;
  while ((match = re.exec(source))) {
    if (match[1]) {
      depth -= 1;
      if (depth === 0) {
        closeStart = match.index;
        break;
      }
    } else {
      depth += 1;
    }
  }
  if (closeStart < 0) return null;
  const closeEnd = source.indexOf('>', closeStart) + 1;
  if (source.slice(closeEnd).trim()) return null;
  const styleMatch = /style="([^"]*)"/i.exec(openTag);
  return { inner: source.slice(openEnd + 1, closeStart), style: styleMatch ? styleMatch[1] : '' };
}

/**
 * Apply box-level formatting to a whole text box by wrapping its content in a
 * single styled span (and reusing/replacing the previous wrapper on repeat
 * calls, so toggles round-trip cleanly).
 */
export function applyWholeHtmlStyle(html, changes = {}) {
  const safe = sanitizeHtml(html);
  const wrapper = splitWrapperSpan(safe);
  const inner = wrapper ? wrapper.inner : safe;
  const styles = parseStyleMap(wrapper ? wrapper.style : '');

  const set = (prop, value) => {
    if (value) styles[prop] = value;
    else delete styles[prop];
  };

  if (changes.bold !== undefined) set('font-weight', changes.bold ? '700' : '');
  if (changes.italic !== undefined) set('font-style', changes.italic ? 'italic' : '');
  if (changes.underline !== undefined || changes.strike !== undefined) {
    const decoration = styles['text-decoration'] || '';
    const underline = changes.underline !== undefined ? changes.underline : decoration.includes('underline');
    const strike = changes.strike !== undefined ? changes.strike : decoration.includes('line-through');
    set('text-decoration', [underline ? 'underline' : '', strike ? 'line-through' : ''].filter(Boolean).join(' '));
  }
  if (changes.highlight !== undefined) set('background-color', changes.highlight || '');
  if (changes.superscript !== undefined || changes.subscript !== undefined) {
    const mode = changes.superscript ? 'super' : changes.subscript ? 'sub' : '';
    set('vertical-align', mode);
    set('font-size', mode ? '0.72em' : '');
  }
  if (changes.color !== undefined) set('color', changes.color || '');
  if (changes.fontFamily !== undefined) set('font-family', changes.fontFamily || '');
  if (changes.fontSize !== undefined) set('font-size', changes.fontSize ? `${changes.fontSize}px` : '');

  const styleText = sanitizeStyle(
    Object.entries(styles)
      .map(([prop, value]) => `${prop}: ${value}`)
      .join('; ')
  );
  return styleText ? `<span style="${escapeAttr(styleText)}">${inner}</span>` : inner;
}

/**
 * Rewrite (or remove) one inline style property on **every** tag of an html
 * fragment.
 *
 * This is what makes a box-level change visible: text imported from PowerPoint
 * carries `font-family` (and often size/colour) inside its own spans, so setting
 * the font of the whole box has to clear those inner values or the text keeps
 * the font it came with.
 */
export function overrideInlineStyle(html, property, value) {
  const name = String(property || '').toLowerCase();
  if (!name) return String(html ?? '');
  return String(html ?? '').replace(/\s*style="([^"]*)"/gi, (match, styleText) => {
    const map = parseStyleMap(styleText);
    if (!(name in map)) return match;
    if (value) map[name] = value;
    else delete map[name];
    const cleaned = sanitizeStyle(
      Object.entries(map)
        .map(([prop, val]) => `${prop}: ${val}`)
        .join('; ')
    );
    return cleaned ? ` style="${escapeAttr(cleaned)}"` : '';
  });
}

/** True when a text box has nothing visible in it. */
export function isBlankHtml(html) {
  return htmlToPlainText(html).length === 0;
}

export { escapeHtml, decodeEntities };
