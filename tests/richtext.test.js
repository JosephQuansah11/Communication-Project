import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyWholeHtmlStyle,
  hasRichHtml,
  htmlToPlainText,
  isBlankHtml,
  plainTextToHtml,
  runsToHtml,
  sanitizeHtml,
  sanitizeStyle,
  textElementHtml,
} from '../src/lib/richtext.js';
import { BACKGROUND_PRESETS, backgroundStyles, describeBackground, gradientCss } from '../src/lib/backgrounds.js';
import { BACKGROUND_DEFAULT, DEFAULT_STYLE, normalizeDeck } from '../src/lib/elements.js';

test('sanitizer keeps the rich-text vocabulary', () => {
  const html =
    '<h1 style="text-align: center; color: #0f172a">Header</h1>' +
    '<h2>Sub header</h2>' +
    '<p><span style="font-weight: 700; background-color: #fef08a">Bold highlight</span>' +
    '<sup>1</sup><sub>2</sub><u>under</u></p>' +
    '<ol><li>One</li><li>Two</li></ol><ul><li>Bullet</li></ul>';

  const clean = sanitizeHtml(html);
  assert.ok(clean.includes('<h1 style="text-align: center; color: #0f172a">'));
  assert.ok(clean.includes('<h2>Sub header</h2>'));
  assert.ok(clean.includes('background-color: #fef08a'));
  assert.ok(clean.includes('<sup>1</sup>'));
  assert.ok(clean.includes('<sub>2</sub>'));
  assert.ok(clean.includes('<ol><li>One</li><li>Two</li></ol>'));
  assert.equal(clean, html);
});

test('sanitizer drops scripts, handlers and unsafe values', () => {
  const clean = sanitizeHtml(
    '<p onclick="alert(1)">Hi<script>alert("x")</script>' +
      '<img src="x" onerror="alert(1)">' +
      '<a href="javascript:alert(1)">bad</a>' +
      '<a href="https://example.com">ok</a>' +
      '<span style="background-image: url(http://evil.test/x.png); color: #fff">styled</span></p>'
  );

  assert.ok(!clean.includes('<script'));
  assert.ok(!clean.includes('alert'));
  assert.ok(!clean.includes('onclick'));
  assert.ok(!clean.includes('onerror'));
  assert.ok(!clean.includes('javascript:'));
  assert.ok(!clean.includes('url('));
  assert.ok(clean.includes('href="https://example.com"'));
  assert.ok(clean.includes('color: #fff'));
});

test('unknown tags are unwrapped but their text survives', () => {
  const clean = sanitizeHtml('<custom-tag>kept<marquee>text</marquee></custom-tag>');
  assert.equal(clean, 'kepttext');
});

test('a dropped void tag does not swallow the rest of the document', () => {
  // Chrome puts this on the clipboard for a copied paragraph; `<meta>` has no
  // closing tag, so treating it as a container would hide everything after it.
  assert.equal(sanitizeHtml('<meta charset="utf-8">just text'), 'just text');
  assert.equal(
    sanitizeHtml('<meta charset=\'utf-8\'><span style="font-weight: bold">Hello</span> world'),
    '<span style="font-weight: bold">Hello</span> world'
  );
  assert.equal(sanitizeHtml('<img src="x.png">caption'), 'caption');
  // A real container is still dropped with its content.
  assert.equal(sanitizeHtml('<style>p { color: red }</style>kept'), 'kept');
  assert.equal(sanitizeHtml('<script>alert(1)</script>kept'), 'kept');
});

test('sanitizeStyle keeps only allowlisted declarations', () => {
  assert.equal(sanitizeStyle('color: #fff; position: fixed; font-weight: 700'), 'color: #fff; font-weight: 700');
  assert.equal(sanitizeStyle('background: url(x)'), '');
  assert.equal(sanitizeStyle('vertical-align: super; font-size: 0.72em'), 'vertical-align: super; font-size: 0.72em');
});

test('plain text projection and escaping', () => {
  assert.equal(htmlToPlainText('<h1>Title</h1><p>Line<br>two</p>'), 'Title\nLine\ntwo');
  assert.equal(htmlToPlainText('<ol><li>One</li><li>Two</li></ol>'), '• One\n• Two');
  assert.equal(plainTextToHtml('<b> & "quotes"'), '&lt;b&gt; &amp; "quotes"');
  assert.equal(isBlankHtml('<p><br></p>'), true);
test('imported runs become formatted HTML', () => {
  const runs = [
    { text: 'Bold', bold: true },
    { text: ' and ' },
    { text: 'italic', italic: true, color: '#dc2626' },
    { text: 'x', superscript: true },
  ];
  const text = runs.map((run) => run.text).join('');
  const html = runsToHtml(runs, text);
  assert.ok(html.includes('font-weight: 700'));
  assert.ok(html.includes('font-style: italic'));
  assert.ok(html.includes('color: #dc2626'));
  assert.ok(html.includes('vertical-align: super'));
  assert.ok(html.includes('font-size: 0.72em'));
  assert.equal(htmlToPlainText(html), text);

  // A mismatch between runs and text falls back to the plain string.
  assert.equal(runsToHtml(runs, 'different'), 'different');
});

test('textElementHtml prefers html, then runs, then text', () => {
  assert.equal(textElementHtml({ html: '<h1>Styled</h1>', text: 'Styled' }), '<h1>Styled</h1>');
  assert.equal(textElementHtml({ runs: [{ text: 'run' }], text: 'run' }), 'run');
  assert.equal(textElementHtml({ text: 'plain & simple' }), 'plain &amp; simple');
});

test('box-level formatting wraps, toggles and unwraps', () => {
  const base = plainTextToHtml('Hello');
  const bold = applyWholeHtmlStyle(base, { bold: true });
  assert.equal(bold, '<span style="font-weight: 700">Hello</span>');

  const boldItalic = applyWholeHtmlStyle(bold, { italic: true });
  assert.equal(boldItalic, '<span style="font-weight: 700; font-style: italic">Hello</span>');

  const highlighted = applyWholeHtmlStyle(boldItalic, { highlight: '#fef08a' });
  assert.ok(highlighted.includes('background-color: #fef08a'));
  assert.ok(highlighted.includes('font-weight: 700'));

  const plainAgain = applyWholeHtmlStyle(highlighted, { bold: false, italic: false, highlight: null });
  assert.equal(plainAgain, 'Hello');

  const scripted = applyWholeHtmlStyle(base, { superscript: true });
  assert.ok(scripted.includes('vertical-align: super'));
  assert.equal(
    applyWholeHtmlStyle(scripted, { subscript: true }),
    '<span style="vertical-align: sub; font-size: 0.72em">Hello</span>'
  );
});

test('gradient helpers build linear and radial backgrounds', () => {
  assert.equal(gradientCss({ from: '#000000', to: '#ffffff', angle: 90 }), 'linear-gradient(90deg, #000000, #ffffff)');
  assert.equal(
    gradientCss({ from: '#000000', to: '#ffffff', type: 'radial' }),
    'radial-gradient(circle at 50% 38%, #000000, #ffffff)'
  );
  assert.equal(gradientCss(null), null);

  const solid = backgroundStyles({ color: '#0b1120', gradient: null, image: null });
  assert.equal(solid.container.backgroundColor, '#0b1120');
  assert.equal(solid.layer, null);

  const layered = backgroundStyles({
    color: '#0b1120',
    image: '/media/demo/aurora.svg',
    fit: 'contain',
    gradient: { from: '#312e81', to: '#6366f1', angle: 135 },
    opacity: 0.6,
    blur: 4,
  });
  assert.equal(layered.container.backgroundColor, '#0b1120');
  assert.equal(layered.layer.backgroundImage, 'url("/media/demo/aurora.svg"), linear-gradient(135deg, #312e81, #6366f1)');
  assert.equal(layered.layer.backgroundSize, 'contain, cover');
  assert.equal(layered.layer.opacity, 0.6);
  assert.equal(layered.layer.filter, 'blur(4px)');
});

test('background presets are complete and described', () => {
  assert.ok(BACKGROUND_PRESETS.length >= 8);
  for (const preset of BACKGROUND_PRESETS) {
    assert.ok(preset.id && preset.label);
    assert.ok(preset.background.color, `${preset.id} needs a base colour`);
  }
  assert.equal(
    describeBackground({ color: '#fff', image: 'x', gradient: { from: '#000', to: '#fff' } }),
    'image + gradient + colour'
  );
  assert.equal(describeBackground({ color: '#fff' }), 'colour');
});

  assert.equal(isBlankHtml('<p>hi</p>'), false);
  assert.equal(hasRichHtml('<p>plain</p>'), true);
  assert.equal(hasRichHtml('plain'), false);
});

test('normalizeDeck keeps rich text and gradient backgrounds', () => {
  const deck = normalizeDeck({
    id: 'deck-test',
    title: 'Rich deck',
    slides: [
      {
        id: 'slide-test',
        background: { color: '#0b1120', gradient: { from: '#312e81', to: '#6366f1', angle: 135 } },
        elements: [
          {
            id: 'el-text',
            type: 'text',
            x: 10,
            y: 20,
            w: 300,
            h: 100,
            text: '',
            html: '<h1 onclick="boom()">Title</h1><script>bad()</script><p>Body</p>',
          },
        ],
      },
    ],
  });

  const [slide] = deck.slides;
  assert.equal(slide.background.gradient.angle, 135);
  assert.equal(slide.background.image, null);
  assert.equal(slide.background.fit, 'cover');

  const [element] = slide.elements;
  assert.equal(element.html, '<h1>Title</h1><p>Body</p>');
  assert.equal(element.text, 'Title\nBody');
  assert.equal(element.style.highlight, null);
  assert.equal(element.style.superscript, false);
  assert.equal(element.style.subscript, false);
  assert.equal(element.style.strike, false);
  assert.equal(element.style.align, 'left');
  assert.equal(DEFAULT_STYLE.strike, false);
  assert.equal(BACKGROUND_DEFAULT.gradient, null);
  assert.equal(backgroundStyles(slide.background).layer.backgroundColor, '#0b1120');
});

