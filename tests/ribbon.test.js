import test from 'node:test';
import assert from 'node:assert/strict';
import { FILE_ITEMS, KEYBOARD_SHORTCUTS, RIBBON_TABS, ribbonItem, ribbonItemIds, ribbonTab, tabsForItem } from '../src/lib/ribbon.js';
import { SLIDE_LAYOUTS, applySlideLayout, layoutById } from '../src/lib/layouts.js';
import { createSlide, normalizeDeck } from '../src/lib/elements.js';

test('the ribbon exposes the WPS tab strip', () => {
  assert.deepEqual(
    RIBBON_TABS.map((tab) => tab.label),
    ['Home', 'Insert', 'Design', 'Transitions', 'Animations', 'Slide Show', 'Review', 'View', 'Tools']
  );
  assert.equal(new Set(RIBBON_TABS.map((tab) => tab.id)).size, RIBBON_TABS.length);
});

test('every tab is made of named groups with well-formed controls', () => {
  for (const tab of RIBBON_TABS) {
    assert.ok(tab.groups.length > 0, `${tab.id} has groups`);
    for (const group of tab.groups) {
      assert.ok(group.id && group.label, `${tab.id}/${group.id} is labelled`);
      assert.ok(group.items.length > 0, `${tab.id}/${group.id} has controls`);
      for (const item of group.items) {
        assert.equal(typeof item.id, 'string');
        assert.ok(item.id.length > 0);
        assert.ok(item.label, `${item.id} has a caption`);
        assert.ok(item.icon, `${item.id} has an icon`);
        if (item.size) assert.ok(['large', 'small'].includes(item.size), `${item.id} size`);
        if (item.kind) assert.ok(['menu', 'custom'].includes(item.kind), `${item.id} kind`);
      }
    }
  }
});

test('control ids resolve back to their definition and tabs', () => {
  assert.equal(ribbonItem('newSlide')?.label, 'New slide');
  assert.equal(ribbonItem('not-a-control'), null);
  assert.deepEqual(tabsForItem('bgImage'), ['insert', 'design']);
  assert.deepEqual(tabsForItem('newSlide'), ['home', 'insert']);
  assert.ok(ribbonItemIds().includes('file:save') === false, 'file items live outside the tabs');
});

test('the File menu lists the presentation commands', () => {
  assert.ok(FILE_ITEMS.length >= 5);
  for (const item of FILE_ITEMS) {
    assert.ok(item.id.startsWith('file:'), `${item.id} is namespaced`);
    assert.ok(item.label && item.icon);
  }
});

test('ribbonTab falls back to the first tab', () => {
  assert.equal(ribbonTab('design').id, 'design');
  assert.equal(ribbonTab('nope').id, RIBBON_TABS[0].id);
});

test('keyboard shortcuts are key/action pairs', () => {
  assert.ok(KEYBOARD_SHORTCUTS.length > 5);
  for (const entry of KEYBOARD_SHORTCUTS) {
    assert.equal(entry.length, 2);
    assert.ok(entry[0] && entry[1]);
  }
});

test('slide layouts build the expected objects and keep the slide intact', () => {
  assert.deepEqual(
    SLIDE_LAYOUTS.map((layout) => layout.id),
    ['blank', 'title', 'titleContent', 'twoContent', 'sectionHeader', 'pictureRight']
  );
  assert.equal(layoutById('pictureRight').label, 'Picture right');
  assert.equal(layoutById('unknown').id, 'blank');

  const deck = { width: 1280, height: 720 };
  const slide = createSlide({ id: 'slide-1', background: { color: '#123456' }, notes: 'keep me', transition: 'slide' });

  const blank = applySlideLayout(slide, 'blank', deck);
  assert.deepEqual(blank.elements, []);
  assert.equal(blank.id, 'slide-1');
  assert.equal(blank.background.color, '#123456');
  assert.equal(blank.notes, 'keep me');
  assert.equal(blank.transition, 'slide');

  const title = applySlideLayout(slide, 'title', deck);
  assert.equal(title.elements.length, 2);
  assert.ok(title.elements.every((element) => element.type === 'text'));
  assert.ok(title.elements[0].style.bold);

  const twoColumn = applySlideLayout(slide, 'twoContent', deck);
  assert.equal(twoColumn.elements.length, 3);
  const [, left, right] = twoColumn.elements;
  assert.ok(left.x < right.x, 'the two content boxes sit side by side');

  const picture = applySlideLayout(slide, 'pictureRight', deck);
  const container = picture.elements.find((element) => element.type === 'shape');
  assert.equal(container.shape, 'roundRect');
  assert.equal(container.fillImage, null);
  assert.ok(container.x + container.w <= deck.width, 'the picture container stays on the slide');
});

test('a layout keeps normalising cleanly when the deck is loaded again', () => {
  const deck = normalizeDeck({
    id: 'deck-1',
    width: 1280,
    height: 720,
    slides: [applySlideLayout(createSlide(), 'pictureRight', { width: 1280, height: 720 })],
  });
  const shape = deck.slides[0].elements.find((element) => element.type === 'shape');
  assert.equal(shape.fillImage, null);
  assert.equal(deck.slides[0].elements.filter((element) => element.type === 'text').length, 2);
});
