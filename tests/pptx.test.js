import test from 'node:test';
import assert from 'node:assert/strict';
import { importPptx, ImportError, isLegacyOfficeBuffer } from '../server/pptx.js';
import { buildPptxFixture } from './fixture.js';

test('imports a PPTX package with shapes, groups, images and tables', async () => {
  const buffer = await buildPptxFixture();
  const saved = [];
  const result = await importPptx(buffer, async (ext, data, base) => {
    saved.push({ ext, size: data.length, base });
    return `/media/test/${base}${ext}`;
  });

  assert.equal(result.width, 1280);
  assert.equal(result.height, 720);
  assert.equal(result.slides.length, 2);

  const [slide1, slide2] = result.slides;
  assert.equal(slide1.background.color, '#0B1120');
  assert.ok(slide1.background.image === null);

  const title = slide1.elements.find((element) => element.text === 'Imported headline');
  assert.ok(title, 'title text imported');
  assert.equal(title.type, 'text');
  assert.equal(title.style.color, '#FF6B00', 'theme accent1 resolved');
  assert.equal(title.style.fontFamily, 'Georgia');
  assert.equal(title.style.fontSize, 44);
  assert.equal(title.style.bold, true);
  assert.equal(Math.round(title.x), 96);
  assert.equal(Math.round(title.y), 96);

  const body = slide1.elements.find((element) => element.text.includes('Second line & entities.'));
  assert.ok(body, 'paragraphs and escaped entities imported');
  assert.equal(body.text, 'Native PPTX import.\nSecond line & entities.');
  assert.ok(body.runs.some((run) => run.italic), 'inline italic run preserved');
  assert.equal(body.style.valign, 'middle');

  const picture = slide1.elements.find((element) => element.type === 'image');
  assert.ok(picture, 'picture imported');
  assert.match(picture.src, /^\/media\/test\/.+\.png$/);
  assert.equal(picture.clipShape, 'ellipse');
  assert.equal(saved.length, 1);
  assert.ok(saved[0].size > 20);

  const grouped = slide1.elements.find((element) => element.text === 'Grouped pill');
  assert.ok(grouped, 'nested group shape imported');
  assert.equal(grouped.fill, '#6366F1');
  assert.equal(grouped.stroke, '#A5B4FC');
  assert.equal(Math.round(grouped.x), 96);
  assert.equal(Math.round(grouped.y), 480);
  assert.equal(Math.round(grouped.w), 320);
  assert.equal(Math.round(grouped.h), 64);

  const tableElement = slide2.elements.find((element) => element.type === 'table');
  assert.ok(tableElement, 'table imported');
  assert.equal(tableElement.table.rows, 3);
  assert.equal(tableElement.table.cols, 3);
  assert.equal(tableElement.table.cells['0,0'].value, 'Metric');
  assert.equal(tableElement.table.cells['0,0'].style.bold, true);
  assert.equal(tableElement.table.cells['0,0'].style.color, '#FFFFFF');
  assert.equal(tableElement.table.cells['1,1'].value, '42000');
  assert.equal(Math.round(tableElement.x), 64);
  assert.ok(Math.abs(tableElement.table.colWidths.reduce((a, b) => a + b, 0) - tableElement.w) < 1);
});

test('rejects zip files without a presentation', async () => {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  zip.file('hello.txt', 'not a deck');
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  await assert.rejects(
    () => importPptx(buffer, async () => '/media/x.bin'),
    (error) => error instanceof ImportError && /does not contain a PowerPoint/.test(error.message)
  );
});

test('recognises legacy OLE and zip magic', () => {
  assert.equal(isLegacyOfficeBuffer(Buffer.from([0xd0, 0xcf, 0x11, 0xe0])), true);
  assert.equal(isLegacyOfficeBuffer(Buffer.from([0x50, 0x4b, 0x03, 0x04])), false);
});
