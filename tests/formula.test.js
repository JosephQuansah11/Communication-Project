import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateTable,
  formatCellValue,
  parseFormula,
  resizeTable,
  ERRORS,
} from '../shared/formula.js';

const sheet = (cells, rows = 6, cols = 4) => ({ rows, cols, cells });

test('arithmetic, ranges and precedence', () => {
  const table = sheet({
    '0,0': { value: '10' },
    '0,1': { value: '20' },
    '0,2': { formula: '=SUM(A1:B1)' },
    '1,0': { formula: '=A1*2+B1/4' },
    '1,1': { formula: '=(A1+B1)^2' },
    '1,2': { formula: '=50%*A1' },
  });
  const { values, errors } = evaluateTable(table);
  assert.equal(values[0][2], 30);
  assert.equal(values[1][0], 25);
  assert.equal(values[1][1], 900);
  assert.equal(values[1][2], 5);
  assert.equal(errors.length, 0);
});

test('text, comparison and boolean functions', () => {
  const table = sheet({
    '0,0': { value: '10' },
    '0,1': { formula: '=IF(A1>5,"big","small")' },
    '0,2': { formula: '="Value: "&ROUND(A1/3,2)' },
    '0,3': { formula: '=AND(A1>0,A1<100)' },
  });
  const { values } = evaluateTable(table);
  assert.equal(values[0][1], 'big');
  assert.equal(values[0][2], 'Value: 3.33');
  assert.equal(values[0][3], true);
});

test('lookup, index, match and criteria', () => {
  const table = sheet({
    '0,0': { value: 'Alpha' }, '0,1': { value: '10' },
    '1,0': { value: 'Beta' }, '1,1': { value: '20' },
    '2,0': { value: 'Gamma' }, '2,1': { value: '30' },
    '3,0': { formula: '=VLOOKUP("Beta",A1:B3,2,FALSE)' },
    '3,1': { formula: '=INDEX(B1:B3,3)' },
    '3,2': { formula: '=MATCH("Gamma",A1:A3,0)' },
    '3,3': { formula: '=COUNTIF(B1:B3,">10")' },
    '4,0': { formula: '=SUMIF(B1:B3,">=20")' },
    '4,1': { formula: '=AVERAGEIF(B1:B3,"<30")' },
  });
  const { values } = evaluateTable(table);
  assert.equal(values[3][0], 20);
  assert.equal(values[3][1], 30);
  assert.equal(values[3][2], 3);
  assert.equal(values[3][3], 2);
  assert.equal(values[4][0], 50);
  assert.equal(values[4][1], 15);
});

test('string and date helpers', () => {
  const table = sheet({
    '0,0': { value: '  Hello World  ' },
    '0,1': { formula: '=TRIM(A1)' },
    '0,2': { formula: '=UPPER(LEFT(TRIM(A1),5))' },
    '0,3': { formula: '=TEXTJOIN("-",TRUE,"a","","b")' },
    '1,0': { formula: '=YEAR(DATE(2026,10,23))' },
    '1,1': { formula: '=MONTH(DATE(2026,10,23))' },
    '1,2': { formula: '=DAY(DATE(2026,10,23))' },
  });
  const { values } = evaluateTable(table);
  assert.equal(values[0][1], 'Hello World');
  assert.equal(values[0][2], 'HELLO');
  assert.equal(values[0][3], 'a-b');
  assert.equal(values[1][0], 2026);
  assert.equal(values[1][1], 10);
  assert.equal(values[1][2], 23);
});

test('errors and circular references', () => {
  const table = sheet({
    '0,0': { formula: '=1/0' },
    '0,1': { formula: '=NOPE(1)' },
    '0,2': { formula: '=A3' },
    '0,3': { formula: '=IFERROR(A1,0)' },
    '2,0': { formula: '=C1' },
  });
  const { values } = evaluateTable(table);
  assert.equal(values[0][0], ERRORS.DIV0);
  assert.equal(values[0][1], ERRORS.NAME);
  assert.equal(values[0][2], ERRORS.CIRC);
  assert.equal(values[0][3], 0);
  assert.equal(values[2][0], ERRORS.CIRC);
});

test('number formats, including style.format from imported tables', () => {
  assert.equal(formatCellValue(1234.5, 'currency-usd'), '$1,234.50');
  assert.equal(formatCellValue(0.256, 'percent'), '25.60%');
  assert.equal(formatCellValue(45000, 'date'), '2023-03-15');
  assert.equal(formatCellValue(1234.567, 'number'), '1,234.57');
  const table = sheet({
    '0,0': { value: '1200', formula: undefined, style: { format: 'currency-usd' } },
    '0,1': { formula: '=A1*2', style: { format: 'currency-usd' } },
  });
  const { display } = evaluateTable(table);
  assert.equal(display[0][0], '$1,200.00');
  assert.equal(display[0][1], '$2,400.00');
});

test('resize preserves cells and sizes', () => {
  const table = { rows: 2, cols: 2, colWidths: [100, 120], rowHeights: [30, 40], cells: { '0,0': { value: 'x' }, '1,1': { value: 'y' } } };
  const bigger = resizeTable(table, 3, 3);
  assert.equal(bigger.rows, 3);
  assert.deepEqual(bigger.colWidths, [100, 120, 120]);
  assert.equal(bigger.cells['1,1'].value, 'y');
  assert.equal(bigger.cells['0,0'].value, 'x');
});

test('AST parser rejects malformed input', () => {
  assert.throws(() => parseFormula('=SUM(A1:B2'));
  assert.throws(() => parseFormula('=1+'));
});
