import test from 'node:test';
import assert from 'node:assert/strict';
import { importPptx, ImportError, isLegacyOfficeBuffer } from '../server/pptx.js';
import { animationStepCount, animationsForStep } from '../shared/animations.js';
import { buildPptxFixture, buildLayoutFixture } from './fixture.js';

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

  const inherited = slide1.elements.find((element) => element.text === 'Inherited body');
  assert.ok(inherited, 'placeholder without its own transform imported');
  assert.equal(Math.round(inherited.x), 64, 'placeholder x inherited from layout');
  assert.equal(Math.round(inherited.y), 168, 'placeholder y inherited from layout');
  assert.equal(Math.round(inherited.w), 840);
  assert.equal(Math.round(inherited.h), 105);

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

test('imports slide animations from the timing tree', async () => {
  const buffer = await buildPptxFixture();
  const { slides } = await importPptx(buffer, async () => '/media/x.bin');
  const [slide1] = slides;

  const animations = slide1.animations;
  assert.ok(Array.isArray(animations), 'animations array present');
  assert.equal(animations.length, 6, 'every effect in the timing tree is imported');

  // Five click groups, in document order.
  assert.deepEqual(
    animations.map((animation) => animation.group),
    [0, 1, 1, 2, 3, 4]
  );

  const fade = animations[0];
  assert.equal(fade.kind, 'entrance');
  assert.equal(fade.effect, 'fade');
  assert.equal(fade.duration, 500);
  assert.equal(fade.trigger, 'click');

  const fly = animations[1];
  assert.equal(fly.effect, 'fly');
  assert.equal(fly.direction, 'top', 'presetSubtype 4 means "from top"');
  assert.equal(fly.duration, 600);

  const zoom = animations[2];
  assert.equal(zoom.effect, 'zoom');
  assert.equal(zoom.trigger, 'with', 'withEffect keeps the same click group');
  assert.equal(zoom.group, fly.group, 'with-previous shares the step');

  const grow = animations[3];
  assert.equal(grow.kind, 'emphasis');
  assert.equal(grow.effect, 'grow');

  const path = animations[4];
  assert.equal(path.kind, 'path');
  assert.equal(path.effect, 'path');
  assert.equal(path.delay, 250);
  assert.ok(path.path.points.length >= 2, 'motion path points parsed');

  const exit = animations[5];
  assert.equal(exit.kind, 'exit');
  assert.equal(exit.effect, 'fade');

  // Every animation points at a real element.
  const ids = new Set(slide1.elements.map((element) => element.id));
  for (const animation of animations) {
    assert.ok(ids.has(animation.targetId), `${animation.id} targets an element`);
  }

  // The grouped pill is animated through its group shape id (spid 5 is the group).
  assert.equal(exit.targetId, animations.find((a) => a.spid === '5').targetId);
});

test('imports the design that lives in the slide layout and the master', async () => {
  const buffer = await buildLayoutFixture();
  const saved = [];
  const result = await importPptx(buffer, async (ext, data, base) => {
    saved.push({ ext, base, data });
    return `/media/test/${base}${ext}`;
  });

  assert.equal(result.slides.length, 3);
  assert.ok(result.theme?.colors?.accent1, 'the deck keeps its theme for later reuse');

  // Slide 1 has no background of its own: the master gradient comes through and
  // the layout's design picture is imported underneath the slide's own objects.
  const [slide1, slide2, slide3] = result.slides;
  assert.equal(slide1.background.color, '#0B1120');
  assert.equal(slide1.background.gradient.from, '#0B1120');
  assert.equal(slide1.background.gradient.to, '#4338CA');
  assert.equal(slide1.background.gradient.angle, 135, 'OOXML angle converted to CSS');
  assert.equal(slide1.background.gradient.type, 'linear');

  const design = slide1.elements.filter((element) => element.designLayer);
  assert.equal(design.length, 2, 'the layout band and the master logo are imported');
  const band = design.find((element) => element.w === 1280);
  assert.ok(band, 'the layout design band is imported');
  assert.equal(Math.round(band.h), 144);
  assert.equal(design.filter((element) => element.w === 1280).length, 1, 'the picture placeholder is skipped');
  const logo = design.find((element) => Math.round(element.w) === 128);
  assert.ok(logo, 'the master logo is imported');
  assert.equal(band.type, 'image');
  assert.match(band.src, /^\/media\/test\/.+\.png$/);

  const title = slide1.elements.find((element) => element.text === 'Design from the layout');
  assert.ok(title, 'the slide content is still imported');
  assert.ok(slide1.elements.indexOf(band) < slide1.elements.indexOf(title), 'design sits behind the content');
  assert.equal(Math.round(title.x), 96, 'the slide keeps its own transform');

  // Slide 2 points at a background picture that is not in the package: a similar
  // background is generated from the theme colours instead.
  assert.match(slide2.background.image, /^\/media\/test\/theme-background-.+\.svg$/);
  const generated = saved.find((entry) => entry.base.startsWith('theme-background'));
  assert.ok(generated, 'a stand-in background was written');
  assert.ok(generated.data.toString('utf8').includes('#ff6b00'), 'the theme accent drives the generated picture');

  // Slide 3 uses a theme background reference (`<p:bgRef>`), which keeps its colour.
  assert.equal(slide3.background.color, '#FF6B00');
  assert.equal(slide3.background.image, null);
});

test('animations are grouped into click steps', async () => {
  const buffer = await buildPptxFixture();
  const { slides } = await importPptx(buffer, async () => '/media/x.bin');
  assert.equal(animationStepCount(slides[0].animations), 5);
  assert.equal(animationsForStep(slides[0].animations, 1).length, 2);
  assert.equal(animationsForStep(slides[0].animations, 3).length, 1);
  assert.equal(animationsForStep(slides[0].animations, 9).length, 0);
  assert.equal(animationStepCount([]), 0);
  assert.equal(animationStepCount(undefined), 0);
});

test('slide two separates an auto step from a click step', async () => {
  const buffer = await buildPptxFixture();
  const { slides } = await importPptx(buffer, async () => '/media/x.bin');
  const animations = slides[1].animations;
  assert.equal(animations.length, 2, 'both effects imported');
  assert.equal(animationStepCount(animations), 2, 'two steps');

  const [auto, click] = animations;
  assert.equal(auto.auto, true, 'a numeric group delay plays by itself');
  assert.equal(auto.autoDelay, 1200, 'the group delay is kept');
  assert.equal(auto.kind, 'entrance');
  assert.equal(auto.effect, 'fade');
  assert.equal(auto.trigger, 'after', 'afterEffect trigger preserved');

  assert.equal(click.auto, false, 'delay="indefinite" waits for the presenter');
  assert.equal(click.trigger, 'click');
  assert.equal(click.direction, 'bottom', 'presetSubtype 1 means "from bottom"');

  // A step is auto only when every effect in it is.
  assert.equal(animationsForStep(animations, 0).every((animation) => animation.auto), true);
  assert.equal(animationsForStep(animations, 1).every((animation) => animation.auto), false);
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
