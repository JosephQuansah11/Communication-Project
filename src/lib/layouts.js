/**
 * Slide layouts for the ribbon's *Layout* menu (WPS/PowerPoint style).
 *
 * `applySlideLayout` returns a copy of the slide with freshly built elements,
 * so the caller can drop it straight into the deck history.
 */

import { createShape, createText } from './elements.js';

export const SLIDE_LAYOUTS = [
  { id: 'blank', label: 'Blank', hint: 'An empty slide' },
  { id: 'title', label: 'Title slide', hint: 'Large title with a subtitle' },
  { id: 'titleContent', label: 'Title and content', hint: 'Title with a body text box' },
  { id: 'twoContent', label: 'Two content', hint: 'Title with two columns' },
  { id: 'sectionHeader', label: 'Section header', hint: 'Centred section title' },
  { id: 'pictureRight', label: 'Picture right', hint: 'Title with a picture container on the right' },
];

export function layoutById(id) {
  return SLIDE_LAYOUTS.find((layout) => layout.id === id) || SLIDE_LAYOUTS[0];
}

const TITLE_STYLE = { fontSize: 44, bold: true, color: '#0f172a', align: 'left', valign: 'top' };
const BODY_STYLE = { fontSize: 22, bold: false, color: '#334155', align: 'left', valign: 'top' };
const CENTER_STYLE = { fontSize: 46, bold: true, color: '#0f172a', align: 'center', valign: 'middle' };

function titleBox(width, text = 'Click to add a title') {
  return createText({
    x: 80,
    y: 64,
    w: width - 160,
    h: 120,
    text,
    style: { ...TITLE_STYLE },
  });
}

function bodyBox(x, y, w, h, text = 'Click to add text') {
  return createText({ x, y, w, h, text, style: { ...BODY_STYLE } });
}

function layoutElements(layoutId, width, height) {
  switch (layoutId) {
    case 'blank':
      return [];
    case 'title':
      return [
        createText({ x: 120, y: height / 2 - 150, w: width - 240, h: 130, text: 'Presentation title', style: { ...CENTER_STYLE } }),
        createText({
          x: 220,
          y: height / 2 + 10,
          w: width - 440,
          h: 90,
          text: 'Subtitle or author',
          style: { ...BODY_STYLE, fontSize: 24, align: 'center' },
        }),
      ];
    case 'titleContent':
      return [titleBox(width), bodyBox(80, 220, width - 160, height - 320)];
    case 'twoContent':
      return [
        titleBox(width),
        bodyBox(80, 220, (width - 200) / 2, height - 320),
        bodyBox(120 + (width - 200) / 2, 220, (width - 200) / 2, height - 320),
      ];
    case 'sectionHeader':
      return [
        createText({
          x: 120,
          y: height / 2 - 90,
          w: width - 240,
          h: 180,
          text: 'Section title',
          style: { ...CENTER_STYLE, fontSize: 52 },
        }),
      ];
    case 'pictureRight': {
      const pictureWidth = Math.round(width * 0.42);
      const pictureHeight = Math.round(height * 0.62);
      return [
        titleBox(Math.round(width * 0.52)),
        bodyBox(80, 240, Math.round(width * 0.42), height - 340),
        createShape('roundRect', {
          x: width - pictureWidth - 70,
          y: Math.round((height - pictureHeight) / 2),
          w: pictureWidth,
          h: pictureHeight,
          fill: '#e2e8f0',
          radius: 28,
          text: '',
          fillImage: null,
        }),
      ];
    }
    default:
      return [];
  }
}

/**
 * Rebuild a slide's elements from a layout. The slide id, background, notes,
 * transition and animations are preserved so a layout is never destructive to
 * the slide itself.
 */
export function applySlideLayout(slide, layoutId, deck = {}) {
  const width = Number(deck.width) || 1280;
  const height = Number(deck.height) || 720;
  return { ...slide, elements: layoutElements(layoutById(layoutId).id, width, height) };
}
