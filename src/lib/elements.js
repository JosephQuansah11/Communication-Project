import { htmlToPlainText, sanitizeHtml } from './richtext.js';
import { normalizeAnimations } from '../../shared/animations.js';
import { normalizePictureFill } from './backgrounds.js';
import { onlineVideoLabel, parseOnlineVideo } from '../../shared/video.js';

export const uid = (prefix = 'el') =>
  `${prefix}-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 12) : Math.random().toString(36).slice(2, 14)}`;

export const DEFAULT_STYLE = {
  fontFamily: 'system-ui',
  fontSize: 28,
  color: '#0f172a',
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  highlight: null,
  superscript: false,
  subscript: false,
  align: 'left',
  valign: 'top',
  lineHeight: 1.25,
  letterSpacing: 0,
};

export const BACKGROUND_DEFAULT = {
  color: '#ffffff',
  image: null,
  gradient: null,
  fit: 'cover',
  opacity: 1,
  blur: 0,
};

export function createSlide(overrides = {}) {
  return {
    id: uid('slide'),
    elements: [],
    animations: [],
    background: { ...BACKGROUND_DEFAULT },
    notes: '',
    transition: 'fade',
    ...overrides,
  };
}

export function emptyDeck(title = 'Untitled presentation') {
  const now = new Date().toISOString();
  return {
    id: uid('deck'),
    title,
    width: 1280,
    height: 720,
    createdAt: now,
    updatedAt: now,
    slides: [createSlide()],
  };
}

export function createText(overrides = {}) {
  return {
    id: uid(),
    type: 'text',
    x: 120,
    y: 120,
    w: 620,
    h: 120,
    rotation: 0,
    opacity: 1,
    text: 'Double-click to edit',
    html: null,
    style: { ...DEFAULT_STYLE, fontSize: 40, bold: true },
    fill: 'transparent',
    fillImage: null,
    stroke: null,
    strokeWidth: 0,
    radius: 0,
    padding: 8,
    ...overrides,
  };
}

export function createShape(shape = 'rect', overrides = {}) {
  return {
    id: uid(),
    type: 'shape',
    shape,
    x: 160,
    y: 160,
    w: 260,
    h: 260,
    rotation: 0,
    opacity: 1,
    fill: '#6366f1',
    fillImage: null,
    stroke: null,
    strokeWidth: 0,
    radius: shape === 'roundRect' ? 24 : 0,
    text: '',
    html: null,
    style: { ...DEFAULT_STYLE, fontSize: 24, color: '#ffffff', align: 'center', valign: 'middle' },
    ...overrides,
  };
}

export function createImage(src, overrides = {}) {
  return {
    id: uid(),
    type: 'image',
    x: 200,
    y: 160,
    w: 420,
    h: 320,
    rotation: 0,
    opacity: 1,
    src,
    name: 'image',
    fit: 'cover',
    clipShape: 'none',
    crop: { scale: 1, x: 0, y: 0 },
    expandable: true,
    stroke: null,
    strokeWidth: 0,
    radius: 0,
    ...overrides,
  };
}

export function createVideo(src, overrides = {}) {
  return {
    id: uid(),
    type: 'video',
    x: 220,
    y: 160,
    w: 520,
    h: 300,
    rotation: 0,
    opacity: 1,
    src,
    poster: null,
    name: 'video',
    fit: 'cover',
    clipShape: 'none',
    radius: 12,
    controls: true,
    muted: false,
    loop: false,
    autoplay: false,
    expandable: true,
    /** Set when the video is a link to the web rather than a file in the deck. */
    online: false,
    provider: null,
    videoId: null,
    startAt: null,
    ...overrides,
  };
}

/**
 * A video that lives on the web — a YouTube or Vimeo link, played inside the
 * slide by the provider's own player. The poster comes from the provider so the
 * slide still shows something before it is played. Returns null for links that
 * are not a supported online video.
 */
export function createOnlineVideo(url, overrides = {}) {
  const video = parseOnlineVideo(url);
  if (!video) return null;
  return createVideo(video.watchUrl, {
    name: onlineVideoLabel(video.watchUrl),
    poster: video.thumbnailUrl,
    fit: 'contain',
    online: true,
    provider: video.provider,
    videoId: video.id,
    startAt: video.start,
    ...overrides,
  });
}

export function createAudio(src, overrides = {}) {
  return {
    id: uid(),
    type: 'audio',
    x: 240,
    y: 240,
    w: 460,
    h: 140,
    rotation: 0,
    opacity: 1,
    src,
    name: 'audio',
    label: 'Audio clip',
    expandable: true,
    ...overrides,
  };
}

export function createTable(rows = 5, cols = 4, overrides = {}) {
  const cells = {};
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells[`${r},${c}`] = {
        value: '',
        style: r === 0 ? { bg: '#1e293b', color: '#f8fafc', bold: true, align: 'left', fontSize: 15 } : { fontSize: 15 },
      };
    }
  }
  return {
    id: uid(),
    type: 'table',
    x: 120,
    y: 150,
    w: 700,
    h: 260,
    rotation: 0,
    opacity: 1,
    table: {
      rows,
      cols,
      colWidths: Array(cols).fill(700 / cols),
      rowHeights: Array(rows).fill(260 / rows),
      headerRow: true,
      headerCol: false,
      cells,
    },
    ...overrides,
  };
}

export function normalizeDeck(deck) {
  if (!deck) return deck;
  const width = Number(deck.width) || 1280;
  const height = Number(deck.height) || 720;
  const slides = (deck.slides || []).map((slide, slideIndex) => ({
    ...slide,
    id: slide.id || uid('slide'),
    background: { ...BACKGROUND_DEFAULT, ...(slide.background || {}) },
    notes: slide.notes || '',
    transition: slide.transition || 'fade',
    animations: normalizeAnimations(slide.animations),
    elements: (slide.elements || []).map((element, index) => normalizeElement(element, index)),
  }));
  if (!slides.length) slides.push(createSlide());
  return { ...deck, width, height, slides, title: deck.title || 'Untitled presentation' };
}

function normalizeElement(element, index) {
  const base = {
    id: element.id || uid(),
    x: Number(element.x) || 0,
    y: Number(element.y) || 0,
    w: Math.max(8, Number(element.w) || 100),
    h: Math.max(8, Number(element.h) || 100),
    rotation: Number(element.rotation) || 0,
    opacity: element.opacity === undefined ? 1 : Number(element.opacity),
    ...element,
  };
  if (base.type === 'text' || base.type === 'shape') {
    base.style = { ...DEFAULT_STYLE, ...(base.style || {}) };
    base.fill = base.fill ?? 'transparent';
    base.fillImage = normalizePictureFill(base.fillImage);
    if (base.html !== undefined && base.html !== null) {
      const clean = sanitizeHtml(base.html);
      base.html = clean || null;
      const plain = htmlToPlainText(base.html);
      if (plain) base.text = plain;
    }
  }
  if (base.type === 'image' || base.type === 'video') {
    base.fit = base.fit || 'cover';
    base.clipShape = base.clipShape || 'none';
    base.crop = { scale: 1, x: 0, y: 0, ...(base.crop || {}) };
  }
  if (base.type === 'table' && base.table) {
    const table = base.table;
    const rows = Math.max(1, Number(table.rows) || 1);
    const cols = Math.max(1, Number(table.cols) || 1);
    base.table = {
      ...table,
      rows,
      cols,
      colWidths: table.colWidths?.length === cols ? table.colWidths : Array.from({ length: cols }, () => base.w / cols),
      rowHeights: table.rowHeights?.length === rows ? table.rowHeights : Array.from({ length: rows }, () => base.h / rows),
      cells: table.cells || {},
    };
  }
  return base;
}

export function duplicateElement(element, offset = 24) {
  return {
    ...JSON.parse(JSON.stringify(element)),
    id: uid(),
    x: element.x + offset,
    y: element.y + offset,
  };
}

export function duplicateSlide(slide) {
  return {
    ...JSON.parse(JSON.stringify(slide)),
    id: uid('slide'),
    elements: slide.elements.map((element) => ({ ...JSON.parse(JSON.stringify(element)), id: uid() })),
  };
}
