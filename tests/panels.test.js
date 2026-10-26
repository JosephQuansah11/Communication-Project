/**
 * The side panels can be hidden and dragged wider or narrower, and the editor
 * remembers the sizes. What matters is that no stored or dragged value can ever
 * leave the editor unusable: everything is clamped, and anything corrupt falls back
 * to the default.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PANEL_SIZES,
  PANEL_LIMITS,
  clampPanelWidth,
  loadPanelSizes,
  panelWidthStyle,
  savePanelSizes,
} from '../src/lib/panels.js';

/** A localStorage stand-in, so these run without a browser. */
const fakeStorage = (initial) => {
  const map = new Map(initial ? Object.entries(initial) : []);
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    entries: () => map,
  };
};

test('a width is kept between the limits of its panel', () => {
  assert.equal(clampPanelWidth('rail', 10), PANEL_LIMITS.rail.min);
  assert.equal(clampPanelWidth('rail', 99999), PANEL_LIMITS.rail.max);
  assert.equal(clampPanelWidth('tools', 10), PANEL_LIMITS.tools.min);
  assert.equal(clampPanelWidth('tools', 99999), PANEL_LIMITS.tools.max);
});

test('a width inside the limits is rounded, not moved', () => {
  assert.equal(clampPanelWidth('rail', 300), 300);
  assert.equal(clampPanelWidth('rail', 300.6), 301);
  assert.equal(clampPanelWidth('rail', '280'), 280);
});

test('an unusable width becomes the default rather than a broken layout', () => {
  assert.equal(clampPanelWidth('rail', 'wide'), DEFAULT_PANEL_SIZES.rail);
  assert.equal(clampPanelWidth('rail', null), DEFAULT_PANEL_SIZES.rail);
  assert.equal(clampPanelWidth('rail', Number.NaN), DEFAULT_PANEL_SIZES.rail);
  assert.equal(clampPanelWidth('rail', undefined), DEFAULT_PANEL_SIZES.rail);
});

test('the two panels have their own limits', () => {
  // The tools column carries form fields, so it may not be squeezed as far.
  assert.ok(PANEL_LIMITS.tools.min > PANEL_LIMITS.rail.min);
  assert.ok(PANEL_LIMITS.tools.max > PANEL_LIMITS.rail.max);
});

test('a fresh workspace starts at the default sizes', () => {
  const sizes = loadPanelSizes(fakeStorage());
  assert.deepEqual(sizes, DEFAULT_PANEL_SIZES);
  // And the defaults are within their own limits.
  assert.equal(clampPanelWidth('rail', sizes.rail), sizes.rail);
  assert.equal(clampPanelWidth('tools', sizes.tools), sizes.tools);
});

test('the sizes come back the way they were left', () => {
  const storage = fakeStorage();
  savePanelSizes({ rail: 300, tools: 420 }, storage);
  assert.deepEqual(loadPanelSizes(storage), { rail: 300, tools: 420 });
});

test('storing clamps what it is given', () => {
  const storage = fakeStorage();
  savePanelSizes({ rail: 5000, tools: -20 }, storage);
  assert.deepEqual(loadPanelSizes(storage), {
    rail: PANEL_LIMITS.rail.max,
    tools: PANEL_LIMITS.tools.min,
  });
});

test('a corrupt stored value falls back instead of throwing', () => {
  const storage = fakeStorage({ 'quandrion.panels': '{not json' });
  assert.deepEqual(loadPanelSizes(storage), DEFAULT_PANEL_SIZES);
});

test('a half-written stored value keeps the half that makes sense', () => {
  const storage = fakeStorage({ 'quandrion.panels': JSON.stringify({ rail: 310 }) });
  assert.deepEqual(loadPanelSizes(storage), { rail: 310, tools: DEFAULT_PANEL_SIZES.tools });
});

test('stored values outside the limits are pulled back in', () => {
  const storage = fakeStorage({ 'quandrion.panels': JSON.stringify({ rail: 9000, tools: 1 }) });
  assert.deepEqual(loadPanelSizes(storage), {
    rail: PANEL_LIMITS.rail.max,
    tools: PANEL_LIMITS.tools.min,
  });
});

test('a browser with no storage at all still gets a layout', () => {
  // loadPanelSizes falls back to the real localStorage; null stands in for a browser
  // that blocks it (private mode, a sandboxed frame…).
  assert.deepEqual(loadPanelSizes(null), DEFAULT_PANEL_SIZES);
  // And saving to nowhere is silently ignored.
  assert.doesNotThrow(() => savePanelSizes({ rail: 300, tools: 400 }, null));
});

test('storage that throws is survivable', () => {
  const hostile = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('full'); },
  };
  assert.deepEqual(loadPanelSizes(hostile), DEFAULT_PANEL_SIZES);
  assert.doesNotThrow(() => savePanelSizes({ rail: 300, tools: 400 }, hostile));
});

test('the widths are handed to CSS as variables, already clamped', () => {
  assert.deepEqual(panelWidthStyle({ rail: 300, tools: 420 }), {
    '--rail-w': '300px',
    '--tools-w': '420px',
  });
  const clamped = panelWidthStyle({ rail: 10, tools: 99999 });
  assert.equal(clamped['--rail-w'], `${PANEL_LIMITS.rail.min}px`);
  assert.equal(clamped['--tools-w'], `${PANEL_LIMITS.tools.max}px`);
  // No sizes at all: the defaults, never "NaNpx".
  assert.deepEqual(panelWidthStyle(), {
    '--rail-w': `${DEFAULT_PANEL_SIZES.rail}px`,
    '--tools-w': `${DEFAULT_PANEL_SIZES.tools}px`,
  });
});
