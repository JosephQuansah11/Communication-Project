/**
 * Finding and replacing text across a whole deck.
 *
 * Every piece of writing in a presentation is covered: text boxes and shape text
 * (both the plain `text` mirror and its rich `html`, or the imported `runs`),
 * every literal table cell and the speaker notes of every slide. Formulas
 * (`=A1+B1`) are left alone, because replacing inside a formula is never what the
 * user means.
 *
 * The module is dependency free (no DOM) so it can be unit tested in Node.
 */

import { htmlToPlainText } from './richtext.js';

/** Turn a query into a matcher, or null when there is nothing to look for. */
export function makeMatcher(query, { matchCase = false, wholeWord = false } = {}) {
  const needle = String(query ?? '');
  if (!needle) return null;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = wholeWord ? `\\b${escaped}\\b` : escaped;
  return { query: needle, regex: new RegExp(pattern, matchCase ? 'g' : 'gi') };
}

export function countMatches(text, matcher) {
  if (!matcher || text === undefined || text === null) return 0;
  return (String(text).match(matcher.regex) || []).length;
}

/** Replace every occurrence, treating the replacement as literal text. */
export function replaceText(text, matcher, replacement) {
  if (!matcher || text === undefined || text === null) return text;
  const source = String(text);
  if (!countMatches(source, matcher)) return source;
  return source.replace(matcher.regex, () => String(replacement ?? ''));
}

const ENTITIES = [
  ['&nbsp;', ' '],
  ['&lt;', '<'],
  ['&gt;', '>'],
  ['&quot;', '"'],
  ['&#39;', "'"],
  ['&amp;', '&'],
];

const decodeEntities = (value) =>
  ENTITIES.reduce((text, [entity, plain]) => text.split(entity).join(plain), String(value ?? ''));

const encodeEntities = (value) =>
  String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Replace inside the text of an HTML string, never inside a tag or an attribute.
 * Entities are decoded for the match and re-encoded afterwards, so searching for
 * "R&D" finds "R&amp;D" and the markup stays valid.
 */
export function replaceHtml(html, matcher, replacement) {
  if (!matcher) return html;
  return String(html ?? '')
    .split(/(<[^>]*>)/)
    .map((part) => (part.startsWith('<') ? part : encodeEntities(replaceText(decodeEntities(part), matcher, replacement))))
    .join('');
}

/** How many times the query appears in the writing an element carries. */
export function countInElement(element, matcher) {
  if (!element) return 0;
  let total = 0;
  if (element.html) total += countMatches(htmlToPlainText(element.html), matcher);
  else if (element.runs?.length) total += countMatches(element.runs.map((run) => run.text || '').join(''), matcher);
  else total += countMatches(element.text, matcher);
  if (element.type === 'table' && element.table?.cells) {
    for (const cell of Object.values(element.table.cells)) {
      if (typeof cell?.value === 'string' && !cell.value.startsWith('=')) total += countMatches(cell.value, matcher);
    }
  }
  return total;
}

/** Where a match lives, in the words the panel shows. */
const WHERE = { text: 'text box', shape: 'shape text', table: 'table' };

/**
 * Every match in the deck, slide by slide and element by element.
 * `where` is `notes`, `text box`, `shape text` or `table`.
 */
export function deckMatches(deck, query, options) {
  const matcher = makeMatcher(query, options);
  if (!matcher) return [];
  const found = [];
  (deck?.slides || []).forEach((slide, slideIndex) => {
    const notes = countMatches(slide.notes, matcher);
    if (notes) found.push({ slideIndex, slideId: slide.id, elementId: null, where: 'notes', count: notes });
    for (const element of slide.elements || []) {
      const count = countInElement(element, matcher);
      if (count) {
        found.push({
          slideIndex,
          slideId: slide.id,
          elementId: element.id,
          where: WHERE[element.type] || 'object',
          count,
        });
      }
    }
  });
  return found;
}

/** One element with its writing replaced, or null when nothing matched. */
export function replaceInElement(element, matcher, replacement) {
  if (!matcher) return null;
  const next = { ...element };
  let hits = 0;

  if (element.html) {
    const html = replaceHtml(element.html, matcher, replacement);
    if (html !== element.html) {
      hits += countMatches(htmlToPlainText(element.html), matcher);
      next.html = html;
      // The plain mirror has to follow, or the box would render the old words.
      next.text = htmlToPlainText(html);
    }
  } else if (element.runs?.length) {
    const runs = element.runs.map((run) => {
      const text = replaceText(run.text, matcher, replacement);
      if (text !== run.text) hits += countMatches(run.text, matcher);
      return text === run.text ? run : { ...run, text };
    });
    if (hits) {
      next.runs = runs;
      next.text = runs.map((run) => run.text || '').join('');
    }
  } else {
    const text = replaceText(element.text, matcher, replacement);
    if (text !== element.text) {
      hits += countMatches(element.text, matcher);
      next.text = text;
    }
  }

  if (element.type === 'table' && element.table?.cells) {
    const cells = { ...element.table.cells };
    let cellsChanged = false;
    for (const [key, cell] of Object.entries(cells)) {
      if (typeof cell?.value !== 'string' || cell.value.startsWith('=')) continue;
      const value = replaceText(cell.value, matcher, replacement);
      if (value === cell.value) continue;
      hits += countMatches(cell.value, matcher);
      cells[key] = { ...cell, value };
      cellsChanged = true;
    }
    if (cellsChanged) next.table = { ...element.table, cells };
  }

  return hits ? { element: next, hits } : null;
}

/**
 * Replace across the deck. Returns a new deck, how many occurrences changed and
 * how many slides were touched; the original deck is left untouched.
 */
export function replaceDeck(deck, query, replacement, options) {
  const matcher = makeMatcher(query, options);
  if (!matcher || !deck) return { deck, count: 0, slides: 0 };
  let count = 0;
  let slides = 0;

  const nextSlides = (deck.slides || []).map((slide) => {
    let changed = false;
    let next = slide;

    const notes = replaceText(slide.notes, matcher, replacement);
    if (notes !== slide.notes) {
      count += countMatches(slide.notes, matcher);
      next = { ...next, notes };
      changed = true;
    }

    const elements = (slide.elements || []).map((element) => {
      const result = replaceInElement(element, matcher, replacement);
      if (!result) return element;
      count += result.hits;
      changed = true;
      return result.element;
    });
    if (changed) {
      slides += 1;
      next = { ...next, elements };
    }
    return next;
  });

  return { deck: { ...deck, slides: nextSlides }, count, slides };
}
