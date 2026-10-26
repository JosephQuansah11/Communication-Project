import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countInElement,
  countMatches,
  deckMatches,
  makeMatcher,
  replaceDeck,
  replaceHtml,
  replaceText,
} from '../src/lib/findreplace.js';
import { createShape, createSlide, createTable, createText, emptyDeck } from '../src/lib/elements.js';

const matcher = (query, options) => makeMatcher(query, options);

test('the matcher ignores case unless asked not to', () => {
  assert.equal(countMatches('Revenue revenue REVENUE', matcher('revenue')), 3);
  assert.equal(countMatches('Revenue revenue', matcher('revenue', { matchCase: true })), 1);
  assert.equal(makeMatcher(''), null);
  assert.equal(makeMatcher('   ').query, '   ');
});

test('whole words only match whole words', () => {
  assert.equal(countMatches('cat catalogue cat', matcher('cat', { wholeWord: true })), 2);
  assert.equal(countMatches('cat catalogue', matcher('cat')), 2);
});

test('the query is taken literally, not as a pattern', () => {
  assert.equal(countMatches('cost (net) 100%', matcher('(net)')), 1);
  assert.equal(countMatches('a.b', matcher('a.b')), 1);
  assert.equal(countMatches('axb', matcher('a.b')), 0);
  // A replacement is literal too, so $& never leaks into the text.
  assert.equal(replaceText('a b', matcher('b'), '$&!'), 'a $&!');
});

test('replacing in html only touches the text, never the markup', () => {
  const html = '<span style="color: #ff0000">Red red</span>';
  const next = replaceHtml(html, matcher('red'), 'blue');
  assert.equal(next, '<span style="color: #ff0000">blue blue</span>');
  // Entities are decoded for the match and encoded again afterwards.
  assert.equal(replaceHtml('R&amp;D team', matcher('R&D'), 'Research'), 'Research team');
  assert.equal(replaceHtml('a &lt; b', matcher('<'), '>'), 'a &gt; b');
  assert.equal(replaceHtml('x &amp; y', matcher('&'), '+'), 'x + y');
  assert.equal(replaceHtml('<b>x</b>', matcher('y'), 'z'), '<b>x</b>');
});

test('every piece of writing in an element is counted', () => {
  assert.equal(countInElement(createText({ text: 'Hello hello' }), matcher('hello')), 2);
  assert.equal(countInElement(createShape('rect', { text: 'Box' }), matcher('box')), 1);
  assert.equal(countInElement(createText({ html: '<b>Bold</b> plain', text: 'Bold plain' }), matcher('plain')), 1);
  const runs = { type: 'text', runs: [{ text: 'Hello ' }, { text: 'world', bold: true }], text: 'Hello world' };
  assert.equal(countInElement(runs, matcher('world')), 1);
  const table = createTable(2, 2);
  table.table.cells['0,0'] = { value: 'Total' };
  table.table.cells['0,1'] = { value: '=SUM(A1:A2)' };
  assert.equal(countInElement(table, matcher('total')), 1);
  assert.equal(countInElement(table, matcher('SUM')), 0, 'formulas are left alone');
});

test('matches are found across every slide', () => {
  const deck = emptyDeck('Deck');
  const first = createSlide();
  first.elements = [createText({ text: 'Quarterly revenue' })];
  first.notes = 'Mention revenue twice: revenue';
  const second = createSlide();
  second.elements = [createShape('rect', { text: 'Revenue chart' }), createTable(2, 2)];
  second.elements[1].table.cells['0,0'] = { value: 'revenue' };
  deck.slides = [first, second];

  const found = deckMatches(deck, 'revenue');
  assert.equal(found.length, 4);
  assert.deepEqual(found.map((hit) => [hit.slideIndex, hit.where, hit.count]), [
    [0, 'notes', 2],
    [0, 'text box', 1],
    [1, 'shape text', 1],
    [1, 'table', 1],
  ]);
  assert.equal(deckMatches(deck, 'nothing here').length, 0);
  assert.equal(deckMatches(deck, '').length, 0);
});

test('replace all rewrites the whole deck and leaves the original alone', () => {
  const deck = emptyDeck('Deck');
  const first = createSlide();
  const text = createText({ text: 'Alpha beta alpha', html: '<span style="color: #0f172a">Alpha beta alpha</span>' });
  const table = createTable(2, 2);
  table.table.cells['0,0'] = { value: 'alpha' };
  table.table.cells['0,1'] = { value: '=A1&"alpha"' };
  first.elements = [text, table];
  first.notes = 'Alpha in the notes';
  const second = createSlide();
  second.elements = [createText({ text: 'alpha again' })];
  deck.slides = [first, second];

  const result = replaceDeck(deck, 'alpha', 'Omega');
  assert.equal(result.count, 5);
  assert.equal(result.slides, 2);
  const [nextFirst, nextSecond] = result.deck.slides;
  assert.equal(nextFirst.elements[0].text, 'Omega beta Omega');
  assert.equal(nextFirst.elements[0].html, '<span style="color: #0f172a">Omega beta Omega</span>');
  assert.equal(nextFirst.elements[1].table.cells['0,0'].value, 'Omega');
  assert.equal(nextFirst.elements[1].table.cells['0,1'].value, '=A1&"alpha"');
  assert.equal(nextFirst.notes, 'Omega in the notes');
  assert.equal(nextSecond.elements[0].text, 'Omega again');
  // The deck that was searched is untouched.
  assert.equal(deck.slides[0].elements[0].text, 'Alpha beta alpha');
  assert.equal(deck.slides[0].notes, 'Alpha in the notes');
});

test('a replacement can be empty, and nothing else changes', () => {
  const deck = emptyDeck('Deck');
  const slide = createSlide();
  slide.elements = [createText({ text: 'keep drop keep' })];
  deck.slides = [slide];
  const result = replaceDeck(deck, 'drop ', '');
  assert.equal(result.count, 1);
  assert.equal(result.deck.slides[0].elements[0].text, 'keep keep');
  assert.equal(result.deck.slides.length, 1);
});

test('imported runs are replaced and their plain mirror follows', () => {
  const deck = emptyDeck('Deck');
  const slide = createSlide();
  slide.elements = [
    { id: 'run-1', type: 'text', runs: [{ text: 'Hello ' }, { text: 'world', bold: true }], text: 'Hello world' },
  ];
  deck.slides = [slide];
  const result = replaceDeck(deck, 'world', 'there');
  const element = result.deck.slides[0].elements[0];
  assert.equal(result.count, 1);
  assert.deepEqual(element.runs.map((run) => run.text), ['Hello ', 'there']);
  assert.equal(element.runs[1].bold, true, 'formatting survives');
  assert.equal(element.text, 'Hello there');
});
