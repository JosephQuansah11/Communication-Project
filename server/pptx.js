import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import path from 'node:path';
import crypto from 'node:crypto';
import { normalizeAnimations, presetToEffect, subtypeToDirection } from '../shared/animations.js';
import { similarBackgroundSvg, themePalette } from '../shared/backgrounds.js';
import { onlineVideoLabel, parseOnlineVideo } from '../shared/video.js';
import { parseTiming } from './timing.js';

/**
 * Native PPTX importer.
 *
 * Parses the OOXML presentation package without any external office runtime:
 * slide order, theme colours, shape trees (including nested groups), text runs,
 * tables, pictures, audio, video and slide animations. Coordinates are converted
 * from EMU to CSS pixels (96 dpi).
 */

const EMU_PER_PX = 9525;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
  allowBooleanAttributes: true,
});

export class ImportError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const asArray = (value) => (value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]);
const px = (emu) => Math.round(((Number(emu) || 0) / EMU_PER_PX) * 100) / 100;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const SHAPE_MAP = {
  rect: 'rect',
  roundRect: 'roundRect',
  ellipse: 'ellipse',
  triangle: 'triangle',
  rtTriangle: 'triangle',
  diamond: 'diamond',
  star5: 'star5',
  star4: 'star4',
  hexagon: 'hexagon',
  pentagon: 'pentagon',
  chevron: 'chevron',
  rightArrow: 'rightArrow',
  leftArrow: 'leftArrow',
  upArrow: 'upArrow',
  downArrow: 'downArrow',
  parallelogram: 'parallelogram',
  trapezoid: 'trapezoid',
  plus: 'plus',
  homePlate: 'pentagon',
  donut: 'ellipse',
  flowChartProcess: 'rect',
  flowChartDecision: 'diamond',
  flowChartTerminator: 'roundRect',
};

const hexToRgb = (hex) => [1, 3, 5].map((offset) => parseInt(String(hex).slice(offset, offset + 2), 16));

function rgbToHsl(r, g, b) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === red) h = ((green - blue) / d + (green < blue ? 6 : 0)) / 6;
  else if (max === green) h = ((blue - red) / d + 2) / 6;
  else h = ((red - green) / d + 4) / 6;
  return { h, s, l };
}

function hslToRgb(h, s, l) {
  if (!s) return [l, l, l].map((value) => value * 255);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t) => {
    let value = t;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return p + (q - p) * 6 * value;
    if (value < 1 / 2) return q;
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
    return p;
  };
  return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)].map((value) => value * 255);
}

/**
 * PowerPoint tints and shades a colour by moving its luminance (`lumMod` /
 * `lumOff`, the "lighter 60%" family) or scaling it (`shade` / `tint`). Applying
 * them keeps themed shapes the colour the file actually shows.
 */
function applyColorMods(hex, node) {
  if (!hex || !node) return hex;
  const lumMod = Number(node.lumMod?.['@_val']);
  const lumOff = Number(node.lumOff?.['@_val']);
  const shade = Number(node.shade?.['@_val']);
  const tint = Number(node.tint?.['@_val']);
  if (!lumMod && !lumOff && !shade && !tint) return hex;
  let [r, g, b] = hexToRgb(hex);
  if (lumMod || lumOff) {
    const hsl = rgbToHsl(r, g, b);
    const l = clamp(hsl.l * (lumMod ? lumMod / 100000 : 1) + (lumOff ? lumOff / 100000 : 0), 0, 1);
    [r, g, b] = hslToRgb(hsl.h, hsl.s, l);
  }
  if (shade) [r, g, b] = [r, g, b].map((value) => value * (shade / 100000));
  if (tint) {
    const amount = tint / 100000;
    [r, g, b] = [r, g, b].map((value) => value * amount + 255 * (1 - amount));
  }
  return rgbToHex(r, g, b);
}

/** Colour-scheme aliases: `bg1`/`tx1` are the background/text slots of `lt1`/`dk1`. */
const SCHEME_ALIASES = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2', phClr: 'accent1' };

function readColor(node, theme, fallback = null) {
  if (!node) return fallback;
  const srgb = node.srgbClr;
  if (srgb?.['@_val']) return applyColorMods(normalizeHex(srgb['@_val']), srgb);
  const scheme = node.schemeClr;
  if (scheme?.['@_val']) {
    const key = SCHEME_ALIASES[scheme['@_val']] || scheme['@_val'];
    const mapped = theme.colors?.[key];
    return applyColorMods(mapped || fallback, scheme);
  }
  const sys = node.sysClr;
  if (sys?.['@_lastClr']) return applyColorMods(normalizeHex(sys['@_lastClr']), sys);
  const scrgb = node.scrGbClr;
  if (scrgb) {
    const r = Math.round((Number(scrgb['@_r']) || 0) / 100000 * 255);
    const g = Math.round((Number(scrgb['@_g']) || 0) / 100000 * 255);
    const b = Math.round((Number(scrgb['@_b']) || 0) / 100000 * 255);
    return applyColorMods(rgbToHex(r, g, b), scrgb);
  }
  if (node.gradFill) {
    const stops = asArray(node.gradFill.gsLst?.gs);
    const first = stops[0];
    if (first) return readColor(first, theme, fallback);
  }
  if (node.prstClr) return presetColor(node.prstClr['@_val']) || fallback;
  return fallback;
}

function normalizeHex(value) {
  const raw = String(value || '').replace(/^#/, '').toUpperCase();
  if (/^[0-9A-F]{6}$/.test(raw)) return `#${raw}`;
  if (/^[0-9A-F]{8}$/.test(raw)) return `#${raw.slice(2)}`;
  if (/^[0-9A-F]{3}$/.test(raw)) return `#${raw.split('').map((c) => c + c).join('')}`;
  return null;
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')}`;
}

function presetColor(val) {
  const map = {
    black: '#000000', white: '#FFFFFF', red: '#FF0000', green: '#00B050', blue: '#0070C0',
    yellow: '#FFFF00', orange: '#FFA500', gray: '#808080', grey: '#808080', darkGray: '#404040',
  };
  return map[val] || null;
}

function parseTheme(xmlText) {
  const theme = { colors: {}, majorFont: 'system-ui', minorFont: 'system-ui', shapeStyle: null };
  if (!xmlText) return theme;
  const xml = parser.parse(xmlText);
  const scheme = xml?.theme?.themeElements?.clrScheme;
  if (scheme) {
    for (const key of ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink']) {
      const value = readColor(scheme[key], { colors: {} }, null);
      if (value) theme.colors[key] = value;
    }
  }
  const fontScheme = xml?.theme?.themeElements?.fontScheme;
  if (fontScheme) {
    theme.majorFont = fontScheme.majorFont?.latin?.['@_typeface'] || 'system-ui';
    theme.minorFont = fontScheme.minorFont?.latin?.['@_typeface'] || 'system-ui';
  }
  // The theme's default shape look, used by shapes that declare no formatting.
  const shapeStyle = xml?.theme?.objectDefaults?.spDef?.style;
  if (shapeStyle?.fillRef || shapeStyle?.lnRef) {
    theme.shapeStyle = { fillRef: shapeStyle.fillRef, lnRef: shapeStyle.lnRef };
  }
  return theme;
}

function readXfrm(node) {
  const xfrm = node?.xfrm;
  if (!xfrm) return null;
  const off = xfrm.off;
  const ext = xfrm.ext;
  if (!off || !ext) return null;
  return {
    x: px(off['@_x']),
    y: px(off['@_y']),
    w: px(ext['@_cx']),
    h: px(ext['@_cy']),
    rot: (Number(xfrm['@_rot']) || 0) / 60000,
    flipH: xfrm['@_flipH'] === '1' || xfrm['@_flipH'] === 'true',
    flipV: xfrm['@_flipV'] === '1' || xfrm['@_flipV'] === 'true',
  };
}

/** Points in hundredths (OOXML `sz`, `spcPts`) → the px value the app stores. */
const ptsToPx = (value) => Math.round(((Number(value) || 0) / 100) * 100) / 100;
/** EMU → px, for indents and text-body insets. */
const emuToPx = (value) => Math.round(((Number(value) || 0) / EMU_PER_PX) * 10) / 10;

const escapeHtmlText = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Attribute values keep their entities (`&#8226;`); decode them the way text is. */
const decodeEntities = (value) =>
  String(value ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

/** Wingdings / symbol bullets arrive as private-use code points; show something safe. */
const BULLET_FALLBACKS = { '\uf0a7': '\u25aa', '\uf0d8': '\u25b8', '\uf0e0': '\u27a4', '\uf075': '\u25cf', '\uf0fc': '\u2714', '\uf06e': '\u25cf' };
const safeBullet = (char) => {
  const value = decodeEntities(char);
  if (!value) return '\u2022';
  const code = value.charCodeAt(0);
  return code >= 0xe000 && code <= 0xf8ff ? BULLET_FALLBACKS[value] || '\u2022' : value;
};

const ROMAN = [
  [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'],
  [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
];

/** The marker for an auto-numbered paragraph (`a:buAutoNum`). */
function autoNumber(type, index) {
  const roman = (value) =>
    ROMAN.reduce((text, [size, glyph]) => glyph.repeat(Math.floor(value / size)) + text, '') || String(value);
  const alpha = (value) => {
    let rest = value;
    let out = '';
    while (rest > 0) {
      const remainder = (rest - 1) % 26;
      out = String.fromCharCode(97 + remainder) + out;
      rest = Math.floor((rest - 1) / 26);
    }
    return out;
  };
  const name = String(type || 'arabicPeriod');
  const base = name.replace(/(Period|ParenR|ParenBoth)$/, '');
  const prefix = /ParenBoth$/.test(name) ? '(' : '';
  const suffix = /(ParenR|ParenBoth)$/.test(name) ? ')' : '.';
  if (base === 'alphaLc') return `${prefix}${alpha(index)}${suffix}`;
  if (base === 'alphaUc') return `${prefix}${alpha(index).toUpperCase()}${suffix}`;
  if (base === 'romanLc') return `${prefix}${roman(index)}${suffix}`;
  if (base === 'romanUc') return `${prefix}${roman(index).toUpperCase()}${suffix}`;
  return `${prefix}${index}${suffix}`;
}

function parseRunStyle(rPr, theme) {
  const style = {};
  if (!rPr) return style;
  if (rPr['@_sz']) style.fontSize = ptsToPx(rPr['@_sz']);
  if (rPr['@_b'] === '1') style.bold = true;
  if (rPr['@_i'] === '1') style.italic = true;
  if (rPr['@_u'] && rPr['@_u'] !== 'none') style.underline = true;
  if (rPr['@_strike'] && rPr['@_strike'] !== 'noStrike') style.strike = true;
  if (rPr['@_cap'] === 'all') style.caps = true;
  const baseline = Number(rPr['@_baseline'] || 0);
  if (baseline > 0) style.superscript = true;
  else if (baseline < 0) style.subscript = true;
  const color = readColor(rPr.solidFill, theme);
  if (color) style.color = color;
  // PowerPoint's text highlight — the colour band behind a run (its "banners").
  const highlight = readColor(rPr.highlight, theme);
  if (highlight) style.highlight = highlight;
  const latin = rPr.latin?.['@_typeface'];
  if (latin) {
    if (latin === '+mj-lt') style.fontFamily = theme.majorFont;
    else if (latin === '+mn-lt') style.fontFamily = theme.minorFont;
    else if (!latin.startsWith('+')) style.fontFamily = latin;
  }
  return style;
}

function mapAlign(algn) {
  switch (algn) {
    case 'ctr': return 'center';
    case 'r': return 'right';
    case 'just': return 'justify';
    case 'dist': return 'justify';
    default: return 'left';
  }
}

/**
 * Paragraph-level formatting: alignment, line spacing, space before/after, the
 * indent PowerPoint hangs a bullet from, and the bullet itself.
 */
function readParagraphFormat(pPr = {}) {
  const format = { align: null, bullet: null, indent: null, hanging: null, lineHeight: null, spaceBefore: null, spaceAfter: null };
  if (pPr['@_algn']) format.align = mapAlign(pPr['@_algn']);
  const percent = pPr.lnSpc?.spcPct?.['@_val'];
  const exact = pPr.lnSpc?.spcPts?.['@_val'];
  if (percent) format.lineHeight = Math.round(Number(percent) / 1000) / 100;
  else if (exact) format.lineHeight = ptsToPx(exact);
  if (pPr.spcBef?.spcPts?.['@_val']) format.spaceBefore = ptsToPx(pPr.spcBef.spcPts['@_val']);
  if (pPr.spcAft?.spcPts?.['@_val']) format.spaceAfter = ptsToPx(pPr.spcAft.spcPts['@_val']);
  if (pPr['@_marL']) format.indent = emuToPx(pPr['@_marL']);
  if (pPr['@_indent']) format.hanging = emuToPx(pPr['@_indent']);
  if (pPr.buChar) format.bullet = { char: safeBullet(pPr.buChar['@_char']) };
  else if (pPr.buAutoNum) format.bullet = { auto: pPr.buAutoNum['@_type'] || 'arabicPeriod' };
  return format;
}

/** One run as a styled `<span>` — the vocabulary the editor's rich text uses. */
function runHtml(text, style = {}) {
  const css = [];
  if (style.fontFamily) css.push(`font-family: ${String(style.fontFamily).replace(/["']/g, '')}`);
  if (style.fontSize) css.push(`font-size: ${style.fontSize}px`);
  if (style.color) css.push(`color: ${style.color}`);
  if (style.highlight) css.push(`background-color: ${style.highlight}`);
  if (style.bold) css.push('font-weight: 700');
  if (style.italic) css.push('font-style: italic');
  if (style.strike) css.push('text-decoration: line-through');
  else if (style.underline) css.push('text-decoration: underline');
  if (style.superscript) css.push('vertical-align: super');
  else if (style.subscript) css.push('vertical-align: sub');
  if (style.caps) css.push('text-transform: uppercase');
  const body = escapeHtmlText(text).replace(/\u000B/g, '<br>');
  if (!body) return '';
  return css.length ? `<span style="${css.join('; ')}">${body}</span>` : body;
}

/** One paragraph as a `<div>` carrying the spacing PowerPoint gave it. */
function paragraphHtml(inner, format) {
  const css = [];
  if (format.align && format.align !== 'left') css.push(`text-align: ${format.align}`);
  if (format.lineHeight) css.push(`line-height: ${format.lineHeight}`);
  if (format.spaceBefore || format.spaceAfter) {
    css.push(`margin: ${format.spaceBefore || 0}px 0 ${format.spaceAfter || 0}px`);
  }
  if (format.indent) css.push(`padding-left: ${format.indent}px`);
  return `<div${css.length ? ` style="${css.join('; ')}"` : ''}>${inner}</div>`;
}

/**
 * Text of a `txBody`: the plain text, the per-run styling the editor renders, and
 * — when the file uses paragraph-level formatting — the equivalent HTML.
 *
 * Runs are kept in step with the plain text (every bullet marker and line break is
 * a run of its own) so the client can render the runs directly, and the HTML uses
 * the same span/div vocabulary the editor's own rich text does.
 */
function paragraphsFromTextBody(txBody, theme) {
  const paragraphs = asArray(txBody?.p);
  const runs = [];
  const blocks = [];
  const lines = [];
  let firstStyle = {};
  let alignment = null;
  let lineHeight = null;
  let anyFormatting = false;
  const counters = new Map();

  for (const paragraph of paragraphs) {
    const pPr = paragraph.pPr || {};
    const format = readParagraphFormat(pPr);
    if (format.align && !alignment) alignment = format.align;
    if (format.lineHeight && !lineHeight) lineHeight = format.lineHeight;
    // A box with several paragraphs is laid out from the HTML, so every paragraph
    // keeps its own spacing, alignment and bullet — exactly as the file has them.
    if (
      paragraphs.length > 1 ||
      format.spaceBefore ||
      format.spaceAfter ||
      format.indent ||
      format.bullet ||
      format.lineHeight ||
      (format.align && format.align !== 'left')
    ) {
      anyFormatting = true;
    }
    const paragraphDefault = parseRunStyle(pPr.defRPr, theme);

    const paragraphRuns = [];
    if (format.bullet) {
      const key = format.bullet.auto || 'char';
      const next = (counters.get(key) || 0) + 1;
      counters.set(key, next);
      const marker = format.bullet.auto ? autoNumber(format.bullet.auto, next) : format.bullet.char;
      paragraphRuns.push({ text: `${marker} `, marker: true });
    }

    const runNodes = [...asArray(paragraph.r), ...asArray(paragraph.fld)];
    const breaks = asArray(paragraph.br).length;
    const pieces = [];
    for (const node of runNodes) {
      const style = { ...paragraphDefault, ...parseRunStyle(node.rPr || node.fldPr, theme) };
      const text = String(node.t ?? node.fld?.['#text'] ?? '').replace(/\u000B/g, '\n');
      if (!Object.keys(firstStyle).length && Object.keys(style).length) firstStyle = style;
      pieces.push({ text, style });
    }
    if (breaks > 0) {
      // `<a:br/>` elements sit between runs; keep them as runs of their own.
      if (pieces.length > 1) {
        const spread = [];
        pieces.forEach((piece, index) => {
          spread.push(piece);
          if (index < pieces.length - 1) spread.push({ text: '\n'.repeat(breaks), style: {} });
        });
        pieces.length = 0;
        pieces.push(...spread);
      } else {
        pieces.push({ text: '\n'.repeat(breaks), style: {} });
      }
    }
    paragraphRuns.push(...pieces);

    if (paragraph.endParaRPr && !Object.keys(firstStyle).length) {
      firstStyle = parseRunStyle(paragraph.endParaRPr, theme);
    }

    // Paragraphs are separated by a line break, in the runs as well as the text.
    if (runs.length && paragraphRuns.length) runs.push({ text: '\n' });
    runs.push(
      ...paragraphRuns.map((run) => ({
        text: run.text,
        ...(run.marker ? { marker: true } : {}),
        ...(run.style && Object.keys(run.style).length ? run.style : {}),
      }))
    );
    lines.push(paragraphRuns.map((run) => run.text).join(''));
    blocks.push(paragraphHtml(paragraphRuns.map((run) => runHtml(run.text, run.style)).join(''), format));
  }

  const bodyPr = txBody?.bodyPr || {};
  const inset = (name, fallback) => (bodyPr['@_' + name] !== undefined ? emuToPx(bodyPr['@_' + name]) : fallback);

  return {
    text: lines.join('\n').replace(/\u000B/g, '\n'),
    style: firstStyle,
    // `alignment` is already the editor's vocabulary (left/center/right/justify).
    alignment: alignment || 'left',
    runs,
    // Only worth carrying when the file actually used paragraph-level formatting.
    html: anyFormatting ? blocks.join('') : '',
    lineHeight,
    // PowerPoint shrinks text with `normAutofit`; the scale keeps it inside the box.
    fontScale: bodyPr.normAutofit?.['@_fontScale'] ? Number(bodyPr.normAutofit['@_fontScale']) / 100000 : 1,
    anchor: bodyPr['@_anchor'] === 'ctr' ? 'middle' : bodyPr['@_anchor'] === 'b' ? 'bottom' : 'top',
    // PowerPoint's own defaults apply when a body does not set its insets.
    insets: {
      top: inset('tIns', 4.8),
      right: inset('rIns', 9.6),
      bottom: inset('bIns', 4.8),
      left: inset('lIns', 9.6),
    },
  };
}


/**
 * The fill of a shape. `a:grpFill` means "use the fill of the group this shape
 * sits in", which is how PowerPoint builds grouped artwork; `inherited` is that
 * group's fill, carried down by the walker.
 *
 * Note the `!== undefined` tests: an empty OOXML element (`<a:noFill/>`) parses to
 * an empty string, which is falsy — so a plain truthiness test would miss it.
 */
function readFill(spPr, theme, inherited = null) {
  if (!spPr) return inherited;
  if (spPr.grpFill !== undefined) return inherited;
  if (spPr.noFill !== undefined) return 'transparent';
  const solid = readColor(spPr.solidFill, theme);
  if (solid) return solid;
  if (spPr.gradFill) {
    const stops = asArray(spPr.gradFill.gsLst?.gs);
    if (stops.length >= 2) {
      const colors = stops.map((stop) => readColor(stop, theme)).filter(Boolean);
      if (colors.length >= 2) return `linear-gradient(135deg, ${colors[0]}, ${colors[colors.length - 1]})`;
    }
  }
  if (spPr.pattFill) return readColor(spPr.pattFill.fgClr, theme) || null;
  return null;
}

/**
 * The fill a shape takes from its theme style reference (`p:style/fillRef`) when
 * it declares no fill of its own — the default for shapes drawn in PowerPoint.
 */
function styleFill(style, theme) {
  const ref = style?.fillRef;
  if (!ref || String(ref['@_idx'] || '0') === '0') return null;
  return readColor(ref, theme);
}

/** The line a shape takes from `p:style/lnRef` when it declares no `a:ln`. */
function styleStroke(style, theme) {
  const ref = style?.lnRef;
  if (!ref || String(ref['@_idx'] || '0') === '0') return null;
  const color = readColor(ref, theme);
  return color ? { stroke: color, strokeWidth: 1 } : null;
}

/**
 * The look a shape gets when it declares nothing at all: the theme's own shape
 * defaults (`objectDefaults/spDef`), which is what PowerPoint draws.
 */
function defaultShapeStyle(node, theme) {
  const isTextBox = node?.nvSpPr?.cNvSpPr?.['@_txBox'] === '1';
  if (isTextBox) return null;
  return node?.style || theme.shapeStyle || null;
}

function readStroke(spPr, theme) {
  const ln = spPr?.ln;
  // An empty `<a:ln/>` means "the theme's line"; `<a:ln><a:noFill/></a:ln>` is none.
  if (!ln || ln.noFill !== undefined) return { stroke: null, strokeWidth: 0 };
  return {
    stroke: readColor(ln.solidFill, theme),
    strokeWidth: ln['@_w'] ? px(ln['@_w']) : 1,
    dash: ln.prstDash?.['@_val'] || null,
  };
}

/**
 * A picture fill (`a:blipFill`): an image painted inside a shape or text box —
 * very common in designed decks, and the shape has no other fill.
 */
async function readPictureFill(spPr, rels, mediaUrlFor) {
  const blipFill = spPr?.blipFill;
  const blip = blipFill?.blip;
  if (!blip) return null;
  const relId = blip['@_r:embed'] || blip['@_embed'] || blip['@_r:link'] || blip['@_link'];
  if (!relId) return null;
  const src = await mediaUrlFor(rels, relId);
  if (!src) return null;
  const fit = blipFill.tile !== undefined ? 'tile' : blipFill.stretch !== undefined ? 'stretch' : 'cover';
  const alpha = blip.alphaModFix?.['@_amt'] !== undefined ? Number(blip.alphaModFix['@_amt']) / 100000 : 1;
  return { src, fit, opacity: Math.round(Math.min(1, Math.max(0, alpha)) * 100) / 100 };
}

/** Union of every shape box in a (possibly grouped) shape tree. */
function spTreeBounds(container, bounds = null) {
  for (const key of ['sp', 'pic', 'graphicFrame', 'cxnSp']) {
    for (const node of asArray(container?.[key])) {
      const xfrm = node.spPr?.xfrm || node.graphicFrame?.xfrm || node.xfrm;
      if (!xfrm?.off || !xfrm?.ext) continue;
      const x = px(xfrm.off['@_x']);
      const y = px(xfrm.off['@_y']);
      const right = x + px(xfrm.ext['@_cx']);
      const bottom = y + px(xfrm.ext['@_cy']);
      bounds = bounds
        ? { left: Math.min(bounds.left, x), top: Math.min(bounds.top, y), right: Math.max(bounds.right, right), bottom: Math.max(bounds.bottom, bottom) }
        : { left: x, top: y, right, bottom };
    }
  }
  for (const group of asArray(container?.grpSp)) bounds = spTreeBounds(group, bounds);
  return bounds;
}

/**
 * SmartArt: PowerPoint keeps the *rendered* drawing of a diagram beside its data
 * (`drawing3.xml` next to `data3.xml`). Reading that drawing keeps the shapes, the
 * layout and the text of the diagram exactly as the file shows them.
 *
 * The drawing's own coordinate space comes from its declared box, or — as most
 * producers leave that empty — from the extent of the shapes it contains.
 */
async function diagramDrawing(node, { zip, rels }) {
  const relIds = node.graphic?.graphicData?.relIds;
  const dataId = relIds?.['@_r:dm'] || relIds?.['@_dm'];
  if (!dataId) return null;
  const target = rels?.[dataId]?.target;
  const number = String(target || '').match(/data(\d+)\.xml$/)?.[1];
  if (!number) return null;
  const xml = await readXml(zip, `ppt/diagrams/drawing${number}.xml`);
  if (!xml) return null;
  const tree = parser.parse(xml)?.drawing?.spTree;
  if (!tree) return null;

  const xfrm = tree.grpSpPr?.xfrm;
  const bounds = spTreeBounds(tree);
  const width = px(xfrm?.ext?.['@_cx']) || (bounds ? bounds.right - bounds.left : 0) || 1;
  const height = px(xfrm?.ext?.['@_cy']) || (bounds ? bounds.bottom - bounds.top : 0) || 1;
  return {
    tree,
    offsetX: px(xfrm?.off?.['@_x']) || (bounds ? bounds.left : 0),
    offsetY: px(xfrm?.off?.['@_y']) || (bounds ? bounds.top : 0),
    width,
    height,
  };
}

function parseTable(graphicFrame, theme) {
  const tbl = graphicFrame?.graphic?.graphicData?.tbl;
  if (!tbl) return null;
  const gridCols = asArray(tbl.tblGrid?.gridCol);
  const colWidths = gridCols.map((c) => px(c['@_w']));
  const trs = asArray(tbl.tr);
  const rowHeights = trs.map((tr) => px(tr['@_h']));
  const cells = {};
  const tableStyle = tbl.tblPr?.tableStyleId?.['#text'] || tbl.tblPr?.tableStyleId || null;

  trs.forEach((tr, r) => {
    asArray(tr.tc).forEach((tc, c) => {
      const { text, style, alignment } = paragraphsFromTextBody(tc.txBody, theme);
      const tcPr = tc.tcPr;
      const fill = tcPr ? readColor(tcPr.solidFill, theme) : null;
      cells[`${r},${c}`] = {
        value: text,
        style: {
          ...(style.bold ? { bold: true } : {}),
          ...(style.italic ? { italic: true } : {}),
          ...(style.underline ? { underline: true } : {}),
          ...(style.color ? { color: style.color } : {}),
          ...(fill ? { bg: fill } : {}),
          ...(alignment ? { align: alignment } : {}),
          ...(tcPr?.['@_anchor'] === 'ctr' ? { valign: 'middle' } : {}),
          ...(style.fontSize ? { fontSize: Math.round(style.fontSize * 0.9) } : {}),
        },
      };
    });
  });

  return {
    rows: trs.length,
    cols: Math.max(gridCols.length, ...trs.map((tr) => asArray(tr.tc).length), 1),
    colWidths: colWidths.length ? colWidths : undefined,
    rowHeights: rowHeights.length ? rowHeights : undefined,
    cells,
    headerRow: true,
    tableStyle,
  };
}

function relsPathFor(partPath) {
  const dir = path.posix.dirname(partPath);
  const base = path.posix.basename(partPath);
  return path.posix.join(dir, '_rels', `${base}.rels`);
}

async function loadRels(zip, partPath) {
  const xmlText = await readXml(zip, relsPathFor(partPath));
  if (!xmlText) return {};
  const xml = parser.parse(xmlText);
  const rels = {};
  for (const rel of asArray(xml?.Relationships?.Relationship)) {
    const target = String(rel['@_Target'] || '');
    const type = String(rel['@_Type'] || '');
    const mode = rel['@_TargetMode'];
    let resolved = target;
    if (mode !== 'External' && !target.startsWith('/')) {
      resolved = path.posix.normalize(path.posix.join(path.posix.dirname(partPath), target));
    }
    rels[rel['@_Id']] = { target: resolved, rawTarget: target, type, external: mode === 'External' };
  }
  return rels;
}

async function readXml(zip, name) {
  const file = zip.file(name);
  if (!file) return null;
  return file.async('text');
}

/**
 * The URL of an external relationship — a video, picture or clip that lives on
 * the web rather than inside the package. Returns null for package-internal ones.
 */
function externalUrl(rels, relId) {
  const rel = rels?.[relId];
  if (!rel?.external) return null;
  return rel.target || rel.rawTarget || null;
}

function safeName(name) {
  return String(name).replace(/[^A-Za-z0-9._-]/g, '_').slice(-80);
}

function collectPlaceholders(spTree) {
  const map = {};
  for (const shape of asArray(spTree?.sp)) {
    const ph = shape.nvSpPr?.nvPr?.ph;
    if (!ph) continue;
    const xfrm = readXfrm(shape.spPr);
    if (!xfrm) continue;
    if (ph['@_idx'] !== undefined) map[`idx:${ph['@_idx']}`] = xfrm;
    if (ph['@_type']) map[`type:${ph['@_type']}`] = xfrm;
    if (ph['@_idx'] === undefined && !ph['@_type']) map['idx:0'] = xfrm;
  }
  return map;
}

function inheritedXfrm(node, context) {
  const ph =
    node.nvSpPr?.nvPr?.ph ||
    node.nvPicPr?.nvPr?.ph ||
    node.nvGraphicFramePr?.nvPr?.ph;
  if (!ph) return null;
  const idx = ph['@_idx'];
  const type = ph['@_type'];
  const keys = [];
  if (idx !== undefined) keys.push(`idx:${idx}`);
  if (type) keys.push(`type:${type}`);
  for (const source of [context.layout, context.master]) {
    for (const key of keys) {
      if (source[key]) return source[key];
    }
  }
  return null;
}

/**
 * @param {Buffer} buffer pptx package
 * @param {(ext: string, data: Buffer, baseName: string) => Promise<string>} saveMedia
 */
export async function importPptx(buffer, saveMedia) {
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new ImportError('That file is not a PPTX package (it could not be opened as a ZIP archive).');
  }
  if (!zip.file('ppt/presentation.xml')) {
    throw new ImportError('The file does not contain a PowerPoint presentation (ppt/presentation.xml missing).');
  }

  const presentationXml = await readXml(zip, 'ppt/presentation.xml');
  const presentation = parser.parse(presentationXml);
  const sldSz = presentation?.presentation?.sldSz || {};
  const width = clamp(px(sldSz['@_cx']) || 1280, 320, 3840);
  const height = clamp(px(sldSz['@_cy']) || 720, 200, 2160);

  const themeXml = (await readXml(zip, 'ppt/theme/theme1.xml')) || (await readXml(zip, 'ppt/theme/theme2.xml'));
  const theme = parseTheme(themeXml);

  const presentationRels = await loadRels(zip, 'ppt/presentation.xml');
  const slideIds = asArray(presentation?.presentation?.sldIdLst?.sldId);
  const slidePaths = slideIds
    .map((entry) => presentationRels[entry['@_r:id'] || entry['@_id']]?.target)
    .filter((target) => target && target.startsWith('ppt/slides/'));

  if (!slidePaths.length) {
    for (const name of Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))) {
      slidePaths.push(name);
    }
    slidePaths.sort((a, b) => Number(a.match(/(\d+)/)?.[1] || 0) - Number(b.match(/(\d+)/)?.[1] || 0));
  }

  const mediaCache = new Map();
  const fontNames = new Set();

  async function mediaUrlFor(rels, relId) {
    if (!relId) return null;
    const rel = rels[relId];
    if (!rel) return null;
    if (rel.external) return rel.rawTarget;
    if (mediaCache.has(rel.target)) return mediaCache.get(rel.target);
    const file = zip.file(rel.target);
    if (!file) return null;
    const data = await file.async('nodebuffer');
    const ext = path.posix.extname(rel.target).toLowerCase() || '.bin';
    const base = `${crypto.randomBytes(5).toString('hex')}-${safeName(path.posix.basename(rel.target, ext))}`;
    const url = await saveMedia(ext, data, base);
    mediaCache.set(rel.target, url);
    return url;
  }

  const slides = [];
  for (let index = 0; index < slidePaths.length; index++) {
    const slidePath = slidePaths[index];
    const slideXml = await readXml(zip, slidePath);
    if (!slideXml) continue;
    const slide = parser.parse(slideXml);
    const rels = await loadRels(zip, slidePath);
    const sld = slide?.sld;
    const spTree = sld?.cSld?.spTree;
    const elements = [];
    /** OOXML shape id → imported element ids (a group maps to all of its children). */
    const spidToElements = new Map();
    const registerElement = (spid, ids) => {
      if (spid === null || spid === undefined || !ids.length) return;
      const key = String(spid);
      spidToElements.set(key, [...(spidToElements.get(key) || []), ...ids]);
    };

    const backgroundOptions = { saveMedia, width, height, seed: `${slidePath}-${index}` };
    let background = await parseBackground(sld?.cSld?.bg, rels, theme, mediaUrlFor, backgroundOptions);
    const placeholderContext = { layout: {}, master: {} };
    /** Decorative pictures inherited from the slide layout and the master. */
    const designElements = [];
    const layoutRel = Object.values(rels).find((rel) => /slideLayout$/.test(rel.type));
    if (layoutRel) {
      const layoutXml = await readXml(zip, layoutRel.target);
      if (layoutXml) {
        const layout = parser.parse(layoutXml);
        const layoutRels = await loadRels(zip, layoutRel.target);
        const layoutTree = layout?.sldLayout?.cSld?.spTree;
        if (!background) {
          const layoutBg = await parseBackground(
            layout?.sldLayout?.cSld?.bg,
            layoutRels,
            theme,
            mediaUrlFor,
            backgroundOptions
          );
          if (layoutBg) background = layoutBg;
        }
        placeholderContext.layout = collectPlaceholders(layoutTree);
        const masterRel = Object.values(layoutRels).find((rel) => /slideMaster$/.test(rel.type));
        if (masterRel) {
          const masterXml = await readXml(zip, masterRel.target);
          if (masterXml) {
            const master = parser.parse(masterXml);
            const masterTree = master?.sldMaster?.cSld?.spTree;
            const masterRels = await loadRels(zip, masterRel.target);
            placeholderContext.master = collectPlaceholders(masterTree);
            // The master background is the last fallback before plain white.
            if (!background) {
              const masterBg = await parseBackground(
                master?.sldMaster?.cSld?.bg,
                masterRels,
                theme,
                mediaUrlFor,
                backgroundOptions
              );
              if (masterBg) background = masterBg;
            }
            designElements.push(...(await collectDesignPictures(masterTree, masterRels, mediaUrlFor)));
          }
        }
        designElements.push(...(await collectDesignPictures(layoutTree, layoutRels, mediaUrlFor)));
      }
    }

    async function walk(container, transform) {
      const children = [];
      for (const key of ['sp', 'pic', 'graphicFrame', 'grpSp', 'cxnSp']) {
        for (const child of asArray(container?.[key])) children.push({ kind: key, node: child });
      }

      for (const { kind, node } of children) {
        if (kind === 'grpSp') {
          const grpXfrm = readXfrm(node.grpSpPr);
          const chOff = node.grpSpPr?.xfrm?.chOff;
          const chExt = node.grpSpPr?.xfrm?.chExt;
          let next = transform;
          if (grpXfrm && chOff && chExt) {
            const chx = px(chOff['@_x']);
            const chy = px(chOff['@_y']);
            const chw = px(chExt['@_cx']) || 1;
            const chh = px(chExt['@_cy']) || 1;
            next = {
              ox: transform.ox + grpXfrm.x,
              oy: transform.oy + grpXfrm.y,
              sx: transform.sx * (grpXfrm.w / chw),
              sy: transform.sy * (grpXfrm.h / chh),
              cx: chx,
              cy: chy,
            };
          }
          // A group can carry its own fill; children using `a:grpFill` paint with
          // it, which is how grouped artwork keeps its colour.
          next = { ...next, fill: readFill(node.grpSpPr, theme) || transform.fill || null };
          const before = elements.length;
          await walk(node, next);
          // Animating a group animates every shape inside it.
          registerElement(shapeId(node), elements.slice(before).map((element) => element.id));
          continue;
        }

        const xfrm = readXfrm(node.spPr || node.graphicFrame || node) || inheritedXfrm(node, placeholderContext);
        if (!xfrm) continue;
        const geo = transform;
        const x = geo.ox + (xfrm.x - geo.cx) * geo.sx;
        const y = geo.oy + (xfrm.y - geo.cy) * geo.sy;
        const w = xfrm.w * geo.sx;
        const h = xfrm.h * geo.sy;
        if (w < 1 || h < 1) continue;
        const spid = shapeId(node);
        const pushed = () => registerElement(spid, [elements[elements.length - 1].id]);

        if (kind === 'pic') {
          const blip = node.blipFill?.blip;
          const embedId = blip?.['@_r:embed'] || blip?.['@_embed'];
          const linkId = blip?.['@_r:link'] || blip?.['@_link'];
          const nvPr = node.nvPicPr?.nvPr || {};
          const videoFile = nvPr.videoFile;
          const audioFile = nvPr.audioFile;
          // `p14:media` (the modern form PowerPoint writes for a video) sits in
          // the extension list rather than directly under `nvPr`.
          const extMedia = asArray(nvPr.extLst?.ext).map((ext) => ext.media).find(Boolean) || null;
          const mediaNode = videoFile || audioFile || nvPr.media || extMedia;
          const mediaRelId =
            mediaNode?.['@_r:link'] || mediaNode?.['@_link'] || mediaNode?.['@_r:embed'] || mediaNode?.['@_embed'] || null;
          const mediaRel = mediaRelId ? rels[mediaRelId] : null;
          // The picture beside a media link is its poster frame.
          const poster = mediaNode && embedId ? await mediaUrlFor(rels, embedId) : null;

          let src = null;
          let mediaType = 'image';
          if (mediaNode) {
            mediaType = videoFile ? 'video' : audioFile ? 'audio' : /audio/i.test(mediaRel?.type || '') ? 'audio' : 'video';
            // An external relationship is a link to the web: an online video, or a
            // picture or clip that lives somewhere else.
            src = mediaRel?.external ? mediaRel.target : await mediaUrlFor(rels, mediaRelId);
          }
          if (!src) src = (await mediaUrlFor(rels, embedId)) || (linkId ? externalUrl(rels, linkId) || (await mediaUrlFor(rels, linkId)) : null);
          if (!src) continue;
          if (mediaType === 'image' && /\.(mp4|m4v|mov|webm|ogv|avi)$/i.test(src)) mediaType = 'video';
          if (mediaType === 'image' && /\.(mp3|wav|m4a|ogg|aac|flac)$/i.test(src)) mediaType = 'audio';
          // A YouTube or Vimeo link plays through the provider's player.
          const online = mediaType === 'video' ? parseOnlineVideo(src) : null;
          const prstGeom = node.spPr?.prstGeom?.['@_prst'];
          const stroke = readStroke(node.spPr, theme);
          elements.push({
            id: `el-${index}-${elements.length}-${crypto.randomBytes(3).toString('hex')}`,
            type: mediaType,
            x, y, w, h,
            rotation: xfrm.rot,
            src: online ? online.watchUrl : src,
            name:
              node.nvPicPr?.cNvPr?.['@_name'] ||
              (online ? onlineVideoLabel(online.watchUrl) : path.posix.basename(String(mediaRel?.target || src))),
            fit: 'cover',
            clipShape: prstGeom && prstGeom !== 'rect' ? SHAPE_MAP[prstGeom] || 'rect' : 'none',
            expandable: mediaType === 'image' || Boolean(online),
            poster: mediaType === 'image' ? null : poster,
            online: Boolean(online),
            provider: online?.provider || null,
            videoId: online?.id || null,
            stroke: stroke.stroke,
            strokeWidth: stroke.strokeWidth,
            opacity: 1,
          });
          pushed();
          continue;
        }

        if (kind === 'graphicFrame') {
          const table = parseTable(node, theme);
          if (table) {
            elements.push({
              id: `el-${index}-${elements.length}-${crypto.randomBytes(3).toString('hex')}`,
              type: 'table',
              x, y, w, h,
              rotation: xfrm.rot,
              table: {
                ...table,
                colWidths: scaleArray(table.colWidths, w),
                rowHeights: scaleArray(table.rowHeights, h),
              },
            });
            pushed();
            continue;
          }
          // SmartArt: walk the pre-rendered drawing so the diagram arrives with
          // the same shapes, colours and text the file shows in PowerPoint.
          const diagram = await diagramDrawing(node, { zip, rels });
          if (diagram) {
            const sx = w / diagram.width;
            const sy = h / diagram.height;
            await walk(diagram.tree, {
              ox: x - diagram.offsetX * sx,
              oy: y - diagram.offsetY * sy,
              sx,
              sy,
              cx: 0,
              cy: 0,
            });
          }
          continue;
        }

        const txBody = node.txBody;
        const geom = node.spPr?.prstGeom?.['@_prst'] || 'rect';
        // The shape's own fill, the fill of the group it sits in, or the one its
        // theme style asks for — in that order, exactly like PowerPoint.
        const shapeStyle = defaultShapeStyle(node, theme);
        const fill = readFill(node.spPr, theme, transform.fill) ?? styleFill(shapeStyle, theme);
        const declared = readStroke(node.spPr, theme);
        const stroke = !node.spPr?.ln ? styleStroke(shapeStyle, theme) || declared : declared;
        const shapeKind = SHAPE_MAP[geom] || 'rect';

        if (txBody?.p) {
          const { text, style, alignment, runs, html, lineHeight, fontScale, anchor, insets } = paragraphsFromTextBody(txBody, theme);
          if (style.fontFamily) fontNames.add(style.fontFamily);
          const placeholder = node.nvSpPr?.nvPr?.ph;
          const isTitle = placeholder?.['@_type'] === 'title' || placeholder?.['@_type'] === 'ctrTitle';
          const pictureFill = await readPictureFill(node.spPr, rels, mediaUrlFor);
          // A shape with no text still has to be drawn when it has a fill or an outline.
          if (!text.trim() && (!fill || fill === 'transparent') && !pictureFill && !stroke.stroke) continue;
          const scale = fontScale && fontScale < 1 ? fontScale : 1;
          const fontSize = Number(style.fontSize || (isTitle ? 40 : 18)) * scale;
          elements.push({
            id: `el-${index}-${elements.length}-${crypto.randomBytes(3).toString('hex')}`,
            type: 'text',
            x, y, w, h,
            rotation: xfrm.rot,
            name: node.nvSpPr?.cNvPr?.['@_name'] || null,
            text,
            runs: scale === 1 ? runs : runs.map((run) => (run.fontSize ? { ...run, fontSize: Math.round(run.fontSize * scale * 10) / 10 } : run)),
            html,
            style: {
              fontFamily: style.fontFamily || theme.minorFont,
              fontSize: Math.round(fontSize * 10) / 10,
              color: style.color || '#111827',
              bold: Boolean(style.bold),
              italic: Boolean(style.italic),
              underline: Boolean(style.underline),
              align: alignment,
              valign: anchor,
              lineHeight: lineHeight || 1.2,
              letterSpacing: 0,
            },
            fill: fill && fill !== 'transparent' ? fill : 'transparent',
            fillImage: pictureFill,
            stroke: stroke.stroke,
            strokeWidth: stroke.strokeWidth,
            // PowerPoint's own body insets, per side, plus the left inset as the
            // single padding the editor's own controls work with.
            padding: insets.left,
            paddingInsets: insets,
            radius: shapeKind === 'roundRect' ? 16 : 0,
            opacity: 1,
          });
          pushed();
        } else {
          const isConnector = kind === 'cxnSp';
          const pictureFill = await readPictureFill(node.spPr, rels, mediaUrlFor);
          if (!fill && !stroke.stroke && !isConnector && !pictureFill) continue;
          elements.push({
            id: `el-${index}-${elements.length}-${crypto.randomBytes(3).toString('hex')}`,
            type: 'shape',
            x, y, w, h,
            rotation: xfrm.rot,
            name: node.nvSpPr?.cNvPr?.['@_name'] || null,
            shape: isConnector ? 'rect' : shapeKind,
            fill: fill || 'transparent',
            fillImage: pictureFill,
            stroke: stroke.stroke || (isConnector ? '#64748b' : null),
            strokeWidth: stroke.strokeWidth || (isConnector ? 2 : 0),
            opacity: 1,
            text: '',
          });
          pushed();
        }
      }
    }

    await walk(spTree, { ox: 0, oy: 0, sx: 1, sy: 1, cx: 0, cy: 0 });
    const order = { shape: 0, image: 1, video: 1, audio: 1, text: 1, table: 2 };
    elements.sort((a, b) => (order[a.type] ?? 1) - (order[b.type] ?? 1));

    // Animations are read after the walk so every shape id can be resolved.
    const animations = mapAnimations(parseTiming(sld?.timing), spidToElements);

    slides.push({
      id: `slide-${crypto.randomUUID()}`,
      // Inherited design pictures sit above the background and below the slide's
      // own objects, which is exactly where the layout put them.
      elements: [...designElements, ...elements],
      animations,
      background: background || { color: '#ffffff', image: null, gradient: null, fit: 'cover', opacity: 1 },
      notes: '',
      transition: 'fade',
    });
  }

  if (!slides.length) throw new ImportError('No slides could be found in this presentation.');

  return {
    width,
    height,
    slides,
    fonts: Array.from(fontNames),
    // Kept on the deck so the editor can regenerate a similar background later.
    theme: { colors: theme.colors, majorFont: theme.majorFont, minorFont: theme.minorFont },
  };
}

/** The OOXML shape id an animation targets (`<p:cNvPr id="…">`). */
function shapeId(node) {
  return (
    node?.nvSpPr?.cNvPr?.['@_id'] ??
    node?.nvPicPr?.cNvPr?.['@_id'] ??
    node?.nvGraphicFramePr?.cNvPr?.['@_id'] ??
    node?.nvGrpSpPr?.cNvPr?.['@_id'] ??
    node?.nvCxnSpPr?.cNvPr?.['@_id'] ??
    null
  );
}

/**
 * Turn raw timing entries into slide animations, resolving each shape id to the
 * element (or elements, for a grouped shape) it points at. Effects whose target
 * is not on the slide are dropped rather than left dangling.
 */
function mapAnimations(rawAnimations, spidToElements) {
  const mapped = [];
  for (const raw of rawAnimations) {
    const targetIds = spidToElements.get(raw.spid);
    if (!targetIds || !targetIds.length) continue;
    const effect = presetToEffect(raw.kind, raw.presetId);
    mapped.push({
      id: `anim-${crypto.randomBytes(4).toString('hex')}`,
      targetIds,
      kind: raw.kind,
      effect,
      direction: subtypeToDirection(effect, raw.subtype),
      duration: raw.duration,
      delay: raw.delay,
      trigger: raw.trigger,
      group: raw.group,
      order: raw.order,
      auto: raw.auto,
      autoDelay: raw.autoDelay,
      path: raw.path,
      spid: raw.spid,
    });
  }
  return normalizeAnimations(mapped);
}

function scaleArray(values, target) {
  if (!values || !values.length) return undefined;
  const total = values.reduce((a, b) => a + b, 0);
  if (!total) return values;
  const scaled = values.map((v) => (v / total) * target);
  scaled[scaled.length - 1] += target - scaled.reduce((a, b) => a + b, 0);
  return scaled;
}

async function parseBackground(bg, rels, theme, mediaUrlFor, options = {}) {
  if (!bg) return null;

  // `<p:bgRef>` points at a theme fill (and a scheme colour) instead of spelling
  // the fill out — very common in WPS and Office templates.
  if (bg.bgRef) {
    const color = readColor(bg.bgRef, theme, null) || theme.colors?.lt1 || '#ffffff';
    return { color, image: null, gradient: null, fit: 'cover', opacity: 1 };
  }

  const bgPr = bg.bgPr;
  if (!bgPr) return null;
  const color = readColor(bgPr.solidFill, theme, null);

  if (bgPr.blipFill?.blip) {
    const blip = bgPr.blipFill.blip;
    const relId = blip['@_r:embed'] || blip['@_embed'] || blip['@_r:link'] || blip['@_link'];
    let image = await mediaUrlFor(rels, relId);
    // The picture is not in the package (linked or stripped): keep the layout by
    // generating a similar background from the theme colours.
    if (!image) image = await synthesizeBackground(theme, options);
    if (image) return { color: color || '#ffffff', image, fit: 'cover', opacity: 1 };
  }

  if (bgPr.gradFill) {
    const stops = asArray(bgPr.gradFill.gsLst?.gs)
      .map((stop) => readColor(stop, theme))
      .filter(Boolean);
    if (stops.length >= 2) {
      return {
        color: stops[0],
        image: null,
        gradient: {
          from: stops[0],
          to: stops[stops.length - 1],
          angle: gradientAngle(bgPr.gradFill),
          type: bgPr.gradFill.path ? 'radial' : 'linear',
        },
        fit: 'cover',
        opacity: 1,
      };
    }
  }

  if (bgPr.pattFill) {
    const pattern = readColor(bgPr.pattFill.fgClr, theme);
    if (pattern) return { color: pattern, image: null, gradient: null, fit: 'cover', opacity: 1 };
  }

  if (color) return { color, image: null, gradient: null, fit: 'cover', opacity: 1 };
  return null;
}

/** OOXML stores gradient angles in 1/60000th of a degree, CSS starts at "up". */
function gradientAngle(gradFill) {
  const raw = Number(gradFill?.lin?.['@_ang']);
  if (!Number.isFinite(raw)) return 135;
  return Math.round((raw / 60000 + 90) % 360);
}

/**
 * Generate a stand-in background picture from the deck's theme colours. Used
 * when an imported slide points at a background image that is not in the file.
 */
async function synthesizeBackground(theme, options = {}) {
  if (!options.saveMedia) return null;
  const svg = similarBackgroundSvg({
    colors: themePalette(theme),
    width: options.width || 1280,
    height: options.height || 720,
    seed: options.seed || 'theme-background',
  });
  const buffer = Buffer.from(svg, 'utf8');
  return options.saveMedia('.svg', buffer, `theme-background-${crypto.randomBytes(3).toString('hex')}`);
}

/**
 * Pictures that belong to the *design* — a layout or master background image,
 * banner or logo. Placeholders are skipped (the slide supplies those), but the
 * decorative pictures are imported so an imported slide keeps the layout it was
 * authored with.
 */
async function collectDesignPictures(spTree, rels, mediaUrlFor) {
  const found = [];
  if (!spTree || !rels) return found;

  const candidates = [
    ...asArray(spTree.pic).map((node) => ({ node, blip: node.blipFill?.blip, holder: node.nvPicPr?.nvPr })),
    ...asArray(spTree.sp).map((node) => ({ node, blip: node.spPr?.blipFill?.blip, holder: node.nvSpPr?.nvPr })),
  ];

  for (const { node, blip, holder } of candidates) {
    if (!blip || holder?.ph) continue;
    const xfrm = readXfrm(node.spPr);
    if (!xfrm || xfrm.w < 24 || xfrm.h < 24) continue;
    const relId = blip['@_r:embed'] || blip['@_embed'];
    const src = await mediaUrlFor(rels, relId);
    if (!src) continue;
    const prstGeom = node.spPr?.prstGeom?.['@_prst'];
    found.push({
      id: `bg-${crypto.randomBytes(5).toString('hex')}`,
      type: 'image',
      x: xfrm.x,
      y: xfrm.y,
      w: xfrm.w,
      h: xfrm.h,
      rotation: xfrm.rot,
      src,
      name: path.posix.basename(String(rels[relId]?.target || src)),
      fit: 'cover',
      clipShape: prstGeom && prstGeom !== 'rect' ? SHAPE_MAP[prstGeom] || 'none' : 'none',
      expandable: true,
      stroke: null,
      strokeWidth: 0,
      opacity: 1,
      designLayer: true,
    });
  }
  return found;
}

export function isLegacyOfficeBuffer(buffer) {
  if (!buffer || buffer.length < 4) return false;
  return buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0;
}

export function isZipBuffer(buffer) {
  return buffer && buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}
