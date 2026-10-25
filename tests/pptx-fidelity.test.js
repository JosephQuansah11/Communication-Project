import test from 'node:test';
import assert from 'node:assert/strict';
import { importPptx } from '../server/pptx.js';
import { sanitizeHtml, textElementHtml } from '../src/lib/richtext.js';
import { onlineVideoEmbedUrl } from '../shared/video.js';
import { buildFidelityFixture } from './fixture.js';

/** Import the fidelity fixture once; every test reads from the same slide. */
const imported = await (async () => {
  const buffer = await buildFidelityFixture();
  const media = [];
  const deck = await importPptx(buffer, async (ext, data, baseName) => {
    media.push(`${baseName}${ext}`);
    return `/media/fidelity/${baseName}${ext}`;
  });
  return { deck, slide: deck.slides[0], media };
})();

const byName = (name) => imported.slide.elements.find((element) => element.name === name);
const round = (value) => Math.round(value * 100) / 100;

test('text highlight, spacing, bullets and insets survive the import', () => {
  const banner = imported.slide.elements.find((element) => element.text?.includes('Roles of the prophets'));
  assert.ok(banner, 'the banner text box is imported');
  assert.equal(banner.type, 'text');

  // The highlight is what draws the coloured band behind the words.
  const heading = banner.runs.find((run) => run.text.includes('Roles'));
  assert.equal(heading.highlight, '#7F1D1D');
  assert.equal(heading.bold, true);
  assert.equal(heading.color, '#FFFFFF');

  // Paragraph and line spacing reach the HTML the editor renders.
  assert.match(banner.html, /line-height: 0\.9/);
  assert.match(banner.html, /margin: 6px 0 12px/);
  assert.equal(banner.style.lineHeight, 0.9);
  assert.equal(banner.style.align, 'center');

  // The bullet paragraph keeps its marker and its hanging indent.
  assert.match(banner.text, /\u2022 Prophetesses/);
  assert.match(banner.html, /padding-left: 30px/);

  // PowerPoint's own body insets, per side.
  assert.deepEqual(banner.paddingInsets, { top: 2.4, right: 9.6, bottom: 4.8, left: 4.8 });
  assert.equal(banner.padding, 4.8);
  assert.equal(banner.style.valign, 'middle');

  // Runs and plain text stay in step, which is what lets the runs render at all.
  assert.equal(banner.runs.map((run) => run.text).join(''), banner.text);
});

test('the imported formatting survives the editor sanitizer', () => {
  const banner = imported.slide.elements.find((element) => element.text?.includes('Roles of the prophets'));
  // This is the exact path the canvas renders: textElementHtml → sanitizeHtml.
  const rendered = sanitizeHtml(textElementHtml(banner));
  assert.match(rendered, /background-color: #7F1D1D/);
  assert.match(rendered, /margin: 6px 0 12px/);
  assert.match(rendered, /line-height: 0\.9/);
  assert.match(rendered, /padding-left: 30px/);
  assert.match(rendered, /font-weight: 700/);
  assert.match(rendered, /text-align: center/);
  // Nothing was dropped: the sanitizer keeps both paragraphs.
  assert.equal((rendered.match(/<div/g) || []).length, 2);
});

test('an outline-only shape with an empty body is kept', () => {
  const outlined = byName('Outlined');
  assert.ok(outlined, 'the shape is not dropped');
  assert.equal(outlined.type, 'shape');
  assert.equal(outlined.fill, 'transparent');
  assert.equal(outlined.stroke, '#B78B19');
  assert.equal(round(outlined.x), 96);
  assert.equal(round(outlined.y), 192);
});

test('a picture fill becomes the fillImage of the shape', () => {
  const picture = byName('Picture fill');
  assert.ok(picture?.fillImage, 'the picture fill is imported');
  assert.match(picture.fillImage.src, /image1\.png$/);
  assert.equal(picture.fillImage.fit, 'stretch');
});

test('theme tints and group fills are resolved like PowerPoint', () => {
  // accent1 (#FF6B00) at lumMod 40% / lumOff 60% is a much lighter tint.
  const tinted = byName('Tinted');
  assert.ok(tinted.fill.startsWith('#'));
  assert.notEqual(tinted.fill, '#FF6B00');
  const channels = [1, 3, 5].map((offset) => parseInt(tinted.fill.slice(offset, offset + 2), 16));
  assert.ok(Math.min(...channels) > 120, `the tint is lighter than the accent (${tinted.fill})`);

  // The arrow has no fill of its own: it paints with the group's fill.
  const arrow = imported.slide.elements.find((element) => element.shape === 'rightArrow');
  assert.ok(arrow, 'the grouped arrow is imported');
  assert.equal(arrow.fill, '#0EA5E9');
  assert.equal(round(arrow.x), 96);
  assert.equal(round(arrow.y), 384);
  assert.equal(round(arrow.w), 192);
});

test('autofit shrinks the text the way the file asks', () => {
  const shrunk = imported.slide.elements.find((element) => element.text === 'Shrunk to fit');
  assert.equal(shrunk.style.fontSize, 16);
  assert.equal(shrunk.runs[0].fontSize, 16);
});

test('an online video link imports as a playable video with its poster', () => {
  const video = imported.slide.elements.find((element) => element.type === 'video');
  assert.ok(video, 'the online video is imported as a video');
  assert.equal(video.online, true);
  assert.equal(video.provider, 'youtube');
  assert.equal(video.videoId, 'CqLxtfkMILA');
  assert.equal(video.src, 'https://www.youtube.com/watch?v=CqLxtfkMILA');
  assert.equal(video.name, 'Video from YouTube');
  assert.equal(video.expandable, true, 'the editor can open it in the player');
  // The picture beside the link is the poster frame.
  assert.match(video.poster, /image1\.png$/);
  assert.deepEqual([round(video.x), round(video.y), round(video.w), round(video.h)], [672, 528, 480, 144]);
  // And the embed URL the player uses is derived from the link.
  assert.match(onlineVideoEmbedUrl(video.src), /^https:\/\/www\.youtube-nocookie\.com\/embed\/CqLxtfkMILA\?/);
});

test('SmartArt arrives as the shapes PowerPoint renders', () => {
  const first = imported.slide.elements.find((element) => element.text === 'First role');
  const second = imported.slide.elements.find((element) => element.text === 'Second role');
  assert.ok(first && second, 'both diagram nodes are imported');

  // The frame is at (192, 528) 480×144; the drawing is scaled to fill it.
  assert.deepEqual([round(first.x), round(first.y), round(first.w), round(first.h)], [192, 528, 240, 72]);
  assert.deepEqual([round(second.x), round(second.y), round(second.w), round(second.h)], [432, 600, 240, 72]);
  assert.equal(first.fill, '#6366F1');
  assert.equal(second.fill, '#22D3EE');
  assert.equal(first.style.fontSize, 14);

  const left = Math.min(first.x, second.x);
  const top = Math.min(first.y, second.y);
  const right = Math.max(first.x + first.w, second.x + second.w);
  const bottom = Math.max(first.y + first.h, second.y + second.h);
  assert.deepEqual([round(left), round(top), round(right), round(bottom)], [192, 528, 672, 672]);
});
