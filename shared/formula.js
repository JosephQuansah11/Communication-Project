/**
 * Tiny spreadsheet engine used by QuandrionSlideMaster tables.
 * Supports A1 references, ranges, arithmetic/comparison/text operators and
 * ~40 Excel-compatible functions. Formulas are stored per cell and evaluated
 * with cycle detection, so presentation tables behave like real spreadsheets.
 */

export const ERRORS = {
  DIV0: '#DIV/0!',
  VALUE: '#VALUE!',
  REF: '#REF!',
  NAME: '#NAME?',
  NA: '#N/A',
  NUM: '#NUM!',
  CIRC: '#CIRC!',
};

export class FormulaError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const err = (code) => {
  throw new FormulaError(code);
};

/* ------------------------------------------------------------------ *
 * Address helpers
 * ------------------------------------------------------------------ */

export function colToLabel(index) {
  let label = '';
  let n = index;
  while (n >= 0) {
    label = String.fromCharCode((n % 26) + 65) + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
}

export function labelToCol(label) {
  let n = 0;
  for (const ch of label.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function cellAddress(row, col) {
  return `${colToLabel(col)}${row + 1}`;
}

export function parseAddress(address) {
  const m = /^\$?([A-Za-z]+)\$?(\d+)$/.exec(address.trim());
  if (!m) return null;
  return { row: Number(m[2]) - 1, col: labelToCol(m[1]) };
}

/* ------------------------------------------------------------------ *
 * Tokenizer
 * ------------------------------------------------------------------ */

const REF_RE = /^\$?[A-Za-z]{1,3}\$?\d+/;

function tokenize(input) {
  const tokens = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '"') {
      let value = '';
      i++;
      while (i < input.length) {
        if (input[i] === '"') {
          if (input[i + 1] === '"') {
            value += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        value += input[i++];
      }
      tokens.push({ type: 'string', value });
      continue;
    }
    const numMatch = /^(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/.exec(input.slice(i));
    if (numMatch) {
      tokens.push({ type: 'number', value: Number(numMatch[0]) });
      i += numMatch[0].length;
      continue;
    }
    if (ch === '$' || /[A-Za-z]/.test(ch)) {
      const refMatch = REF_RE.exec(input.slice(i));
      if (refMatch) {
        const raw = refMatch[0];
        i += raw.length;
        let end = null;
        if (input[i] === ':') {
          const second = REF_RE.exec(input.slice(i + 1));
          if (second) {
            end = second[0];
            i += 1 + second[0].length;
          }
        }
        tokens.push({ type: 'ref', start: raw, end });
        continue;
      }
      const fnMatch = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(input.slice(i));
      if (fnMatch) {
        i += fnMatch[0].length;
        if (input[i] === '(') {
          tokens.push({ type: 'func', value: fnMatch[0].toUpperCase() });
        } else if (fnMatch[0].toUpperCase() === 'TRUE' || fnMatch[0].toUpperCase() === 'FALSE') {
          tokens.push({ type: 'boolean', value: fnMatch[0].toUpperCase() === 'TRUE' });
        } else {
          tokens.push({ type: 'name', value: fnMatch[0] });
        }
        continue;
      }
    }
    const two = input.slice(i, i + 2);
    if (['<=', '>=', '<>', '!='].includes(two)) {
      tokens.push({ type: 'op', value: two === '!=' ? '<>' : two });
      i += 2;
      continue;
    }
    if ('+-*/^&%(),:<>='.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }
    err(ERRORS.NAME);
  }
  return tokens;
}

/* ------------------------------------------------------------------ *
 * Parser (Pratt)
 * ------------------------------------------------------------------ */

const BINARY_PRECEDENCE = {
  '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1,
  '&': 2,
  '+': 3, '-': 3,
  '*': 4, '/': 4,
  '^': 5,
};

function parse(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];

  function parseExpression(minPrec = 0) {
    let left = parseUnary();
    while (pos < tokens.length) {
      const token = tokens[pos];
      if (token.type !== 'op' || !(token.value in BINARY_PRECEDENCE)) break;
      const prec = BINARY_PRECEDENCE[token.value];
      if (prec < minPrec) break;
      pos++;
      const right = parseExpression(prec + 1);
      left = { type: 'binary', op: token.value, left, right };
    }
    return left;
  }

  function parseUnary() {
    const token = peek();
    if (token && token.type === 'op' && (token.value === '-' || token.value === '+')) {
      pos++;
      return { type: 'unary', op: token.value, operand: parseUnary() };
    }
    let node = parsePrimary();
    while (peek() && peek().type === 'op' && peek().value === '%') {
      pos++;
      node = { type: 'percent', operand: node };
    }
    return node;
  }

  function parsePrimary() {
    const token = tokens[pos++];
    if (!token) err(ERRORS.VALUE);
    if (token.type === 'number') return { type: 'number', value: token.value };
    if (token.type === 'string') return { type: 'string', value: token.value };
    if (token.type === 'boolean') return { type: 'boolean', value: token.value };
    if (token.type === 'ref') return { type: 'ref', start: token.start, end: token.end };
    if (token.type === 'name') err(ERRORS.NAME);
    if (token.type === 'func') {
      if (peek()?.value !== '(') err(ERRORS.VALUE);
      pos++;
      const args = [];
      if (peek()?.value !== ')') {
        for (;;) {
          if (peek()?.value === ',' || peek()?.value === ')') {
            args.push({ type: 'blank' });
          } else {
            args.push(parseExpression());
          }
          if (peek()?.value === ',') {
            pos++;
            continue;
          }
          break;
        }
      }
      if (peek()?.value !== ')') err(ERRORS.VALUE);
      pos++;
      return { type: 'func', name: token.value, args };
    }
    if (token.type === 'op' && token.value === '(') {
      const expr = parseExpression();
      if (peek()?.value !== ')') err(ERRORS.VALUE);
      pos++;
      return expr;
    }
    err(ERRORS.NAME);
  }

  const ast = parseExpression();
  if (pos < tokens.length) err(ERRORS.NAME);
  return ast;
}

export function parseFormula(formula) {
  const text = String(formula || '').replace(/^=/, '').trim();
  if (!text) return null;
  return parse(tokenize(text));
}

/* ------------------------------------------------------------------ *
 * Values & coercion
 * ------------------------------------------------------------------ */

function isError(value) {
  return typeof value === 'string' && Object.values(ERRORS).includes(value);
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (isError(value)) err(value);
  const cleaned = String(value).replace(/,/g, '').trim();
  if (cleaned === '') return 0;
  const n = Number(cleaned);
  if (Number.isNaN(n)) err(ERRORS.VALUE);
  return n;
}

function toText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return formatNumber(value);
  return String(value);
}

function toBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (value === null || value === undefined || value === '') return false;
  if (isError(value)) err(value);
  const text = String(value).trim().toUpperCase();
  if (text === 'TRUE') return true;
  if (text === 'FALSE') return false;
  return Boolean(text);
}

export function excelSerial(date) {
  const epoch = Date.UTC(1899, 11, 30);
  return (date.getTime() - epoch) / 86400000;
}

function fromSerial(serial) {
  const epoch = Date.UTC(1899, 11, 30);
  return new Date(epoch + serial * 86400000);
}

class RangeValue {
  constructor(values) {
    this.values = values;
  }
}

function flatten(args) {
  const out = [];
  for (const arg of args) {
    if (arg instanceof RangeValue) {
      for (const row of arg.values) for (const value of row) out.push(value);
    } else {
      out.push(arg);
    }
  }
  return out;
}

function numericArgs(args) {
  const flat = flatten(args);
  const nums = [];
  for (const value of flat) {
    if (value === null || value === undefined || value === '') continue;
    if (typeof value === 'boolean') {
      nums.push(value ? 1 : 0);
      continue;
    }
    if (isError(value)) err(value);
    if (typeof value === 'number') nums.push(value);
    else {
      const n = Number(String(value).replace(/,/g, ''));
      if (!Number.isNaN(n)) nums.push(n);
    }
  }
  return nums;
}

function scalar(value) {
  if (value instanceof RangeValue) {
    const first = value.values[0]?.[0];
    return first ?? null;
  }
  return value;
}

/* ------------------------------------------------------------------ *
 * Criteria (COUNTIF / SUMIF / AVERAGEIF)
 * ------------------------------------------------------------------ */

function makeCriteria(criteria) {
  let raw = criteria instanceof RangeValue ? criteria.values[0]?.[0] : criteria;
  if (raw === null || raw === undefined) raw = '';
  if (typeof raw === 'number' || typeof raw === 'boolean') {
    return (value) => {
      if (typeof value === 'number') return value === Number(raw);
      return String(value) === String(raw);
    };
  }
  let op = '=';
  let operand = String(raw);
  const m = /^(<=|>=|<>|<|>|=)?(.*)$/s.exec(operand);
  if (m) {
    op = m[1] || '=';
    operand = m[2];
  }
  const numeric = operand.trim() !== '' && !Number.isNaN(Number(operand));
  const numOperand = numeric ? Number(operand) : null;
  const lower = operand.toLowerCase();
  const wildcard = operand.includes('*') || operand.includes('?');
  const regex = wildcard
    ? new RegExp(`^${operand.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i')
    : null;

  return (value) => {
    if (op === '=' || op === '<>') {
      let equal;
      if (numeric && typeof value === 'number') equal = value === numOperand;
      else if (numeric && typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) equal = Number(value) === numOperand;
      else if (regex) equal = regex.test(String(value ?? ''));
      else equal = String(value ?? '').toLowerCase() === lower;
      return op === '=' ? equal : !equal;
    }
    if (typeof value === 'boolean') value = value ? 1 : 0;
    const left = typeof value === 'number' ? value : Number(String(value ?? '').replace(/,/g, ''));
    const right = numOperand;
    if (Number.isNaN(left) || right === null) return false;
    if (op === '<') return left < right;
    if (op === '>') return left > right;
    if (op === '<=') return left <= right;
    if (op === '>=') return left >= right;
    return false;
  };
}

/* ------------------------------------------------------------------ *
 * Functions
 * ------------------------------------------------------------------ */

const FUNCTIONS = {
  SUM: (args) => numericArgs(args).reduce((a, b) => a + b, 0),
  SUMSQ: (args) => numericArgs(args).reduce((a, b) => a + b * b, 0),
  PRODUCT: (args) => {
    const nums = numericArgs(args);
    return nums.length ? nums.reduce((a, b) => a * b, 1) : 0;
  },
  AVERAGE: (args) => {
    const nums = numericArgs(args);
    if (!nums.length) err(ERRORS.DIV0);
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  },
  MIN: (args) => {
    const nums = numericArgs(args);
    return nums.length ? Math.min(...nums) : 0;
  },
  MAX: (args) => {
    const nums = numericArgs(args);
    return nums.length ? Math.max(...nums) : 0;
  },
  MEDIAN: (args) => {
    const nums = numericArgs(args).sort((a, b) => a - b);
    if (!nums.length) err(ERRORS.NUM);
    const mid = Math.floor(nums.length / 2);
    return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
  },
  COUNT: (args) => numericArgs(args).length,
  COUNTA: (args) => flatten(args).filter((v) => v !== null && v !== undefined && v !== '').length,
  COUNTBLANK: (args) => flatten(args).filter((v) => v === null || v === undefined || v === '').length,
  COUNTIF: (args) => {
    const range = args[0];
    if (!(range instanceof RangeValue)) err(ERRORS.VALUE);
    const test = makeCriteria(args[1]);
    return flatten([range]).filter((v) => test(v)).length;
  },
  SUMIF: (args) => {
    const range = args[0];
    if (!(range instanceof RangeValue)) err(ERRORS.VALUE);
    const test = makeCriteria(args[1]);
    const sumRange = args[2] instanceof RangeValue ? args[2] : range;
    let total = 0;
    range.values.forEach((row, r) =>
      row.forEach((value, c) => {
        if (test(value)) total += toNumber(sumRange.values[r]?.[c] ?? 0);
      })
    );
    return total;
  },
  AVERAGEIF: (args) => {
    const range = args[0];
    if (!(range instanceof RangeValue)) err(ERRORS.VALUE);
    const test = makeCriteria(args[1]);
    const avgRange = args[2] instanceof RangeValue ? args[2] : range;
    let total = 0;
    let count = 0;
    range.values.forEach((row, r) =>
      row.forEach((value, c) => {
        if (test(value)) {
          total += toNumber(avgRange.values[r]?.[c] ?? 0);
          count++;
        }
      })
    );
    if (!count) err(ERRORS.DIV0);
    return total / count;
  },
  IF: (args) => (toBool(scalar(args[0])) ? scalar(args[1]) : args.length > 2 ? scalar(args[2]) : false),
  IFERROR: (args) => {
    try {
      const value = scalar(args[0]);
      if (isError(value)) return scalar(args[1]);
      return value;
    } catch (e) {
      if (e instanceof FormulaError) return scalar(args[1]);
      throw e;
    }
  },
  IFNA: (args) => {
    try {
      const value = scalar(args[0]);
      if (value === ERRORS.NA) return scalar(args[1]);
      return value;
    } catch (e) {
      if (e instanceof FormulaError && e.code === ERRORS.NA) return scalar(args[1]);
      throw e;
    }
  },
  AND: (args) => flatten(args).every((v) => toBool(v)),
  OR: (args) => flatten(args).some((v) => toBool(v)),
  NOT: (args) => !toBool(scalar(args[0])),
  XOR: (args) => flatten(args).filter((v) => toBool(v)).length % 2 === 1,
};

function roundWith(args, fn) {
  const value = toNumber(scalar(args[0]));
  const digits = Math.trunc(toNumber(scalar(args[1] ?? 0)));
  const factor = Math.pow(10, digits);
  return fn(Number((value * factor).toPrecision(15))) / factor;
}

Object.assign(FUNCTIONS, {
  ROUND: (args) => roundWith(args, (n) => Math.round(n)),
  ROUNDUP: (args) => roundWith(args, (n) => Math.ceil(n)),
  ROUNDDOWN: (args) => roundWith(args, (n) => Math.floor(n)),
  MROUND: (args) => {
    const n = toNumber(scalar(args[0]));
    const m = toNumber(scalar(args[1]));
    if (!m) return 0;
    return Math.round(n / m) * m;
  },
  ABS: (args) => Math.abs(toNumber(scalar(args[0]))),
  SQRT: (args) => {
    const n = toNumber(scalar(args[0]));
    if (n < 0) err(ERRORS.NUM);
    return Math.sqrt(n);
  },
  POWER: (args) => Math.pow(toNumber(scalar(args[0])), toNumber(scalar(args[1]))),
  EXP: (args) => Math.exp(toNumber(scalar(args[0]))),
  LN: (args) => {
    const n = toNumber(scalar(args[0]));
    if (n <= 0) err(ERRORS.NUM);
    return Math.log(n);
  },
  LOG: (args) => Math.log(toNumber(scalar(args[0]))) / Math.log(toNumber(scalar(args[1] ?? 10))),
  LOG10: (args) => Math.log10(toNumber(scalar(args[0]))),
  MOD: (args) => {
    const divisor = toNumber(scalar(args[1]));
    if (!divisor) err(ERRORS.DIV0);
    return toNumber(scalar(args[0])) % divisor;
  },
  INT: (args) => Math.floor(toNumber(scalar(args[0]))),
  TRUNC: (args) => {
    const n = toNumber(scalar(args[0]));
    return n < 0 ? Math.ceil(n) : Math.floor(n);
  },
  SIGN: (args) => Math.sign(toNumber(scalar(args[0]))),
  PI: () => Math.PI,
  RAND: () => Math.random(),
  RANDBETWEEN: (args) => {
    const low = Math.ceil(toNumber(scalar(args[0])));
    const high = Math.floor(toNumber(scalar(args[1])));
    return low + Math.floor(Math.random() * (high - low + 1));
  },
  CONCAT: (args) => flatten(args).map(toText).join(''),
  CONCATENATE: (args) => flatten(args).map(toText).join(''),
  TEXTJOIN: (args) => {
    const delimiter = toText(scalar(args[0]));
    const ignoreEmpty = toBool(scalar(args[1]));
    const values = flatten(args.slice(2)).map(toText);
    return (ignoreEmpty ? values.filter((v) => v !== '') : values).join(delimiter);
  },
  LEN: (args) => toText(scalar(args[0])).length,
  LEFT: (args) => toText(scalar(args[0])).slice(0, args.length > 1 ? toNumber(scalar(args[1])) : 1),
  RIGHT: (args) => {
    const text = toText(scalar(args[0]));
    const n = args.length > 1 ? toNumber(scalar(args[1])) : 1;
    return n <= 0 ? '' : text.slice(-n);
  },
  MID: (args) => {
    const text = toText(scalar(args[0]));
    const start = Math.max(1, toNumber(scalar(args[1])));
    const len = toNumber(scalar(args[2]));
    return text.slice(start - 1, start - 1 + len);
  },
  UPPER: (args) => toText(scalar(args[0])).toUpperCase(),
  LOWER: (args) => toText(scalar(args[0])).toLowerCase(),
  PROPER: (args) =>
    toText(scalar(args[0])).replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase()),
  TRIM: (args) => toText(scalar(args[0])).trim().replace(/\s+/g, ' '),
  SUBSTITUTE: (args) => toText(scalar(args[0])).split(toText(scalar(args[1]))).join(toText(scalar(args[2]))),
  REPLACE: (args) => {
    const text = toText(scalar(args[0]));
    const start = toNumber(scalar(args[1])) - 1;
    const len = toNumber(scalar(args[2]));
    return text.slice(0, start) + toText(scalar(args[3])) + text.slice(start + len);
  },
  REPT: (args) => toText(scalar(args[0])).repeat(Math.max(0, toNumber(scalar(args[1])))),
  FIND: (args) => {
    const idx = toText(scalar(args[1])).indexOf(toText(scalar(args[0])));
    if (idx < 0) err(ERRORS.VALUE);
    return idx + 1;
  },
  SEARCH: (args) => {
    const idx = toText(scalar(args[1])).toLowerCase().indexOf(toText(scalar(args[0])).toLowerCase());
    if (idx < 0) err(ERRORS.VALUE);
    return idx + 1;
  },
  VALUE: (args) => toNumber(scalar(args[0])),
  T: (args) => (typeof scalar(args[0]) === 'string' ? scalar(args[0]) : ''),
  N: (args) => (typeof scalar(args[0]) === 'number' ? scalar(args[0]) : 0),
  VLOOKUP: (args) => {
    const lookup = scalar(args[0]);
    const range = args[1];
    if (!(range instanceof RangeValue)) err(ERRORS.VALUE);
    const colIndex = Math.floor(toNumber(scalar(args[2])));
    const exact = args.length > 3 ? !toBool(scalar(args[3])) : true;
    if (colIndex < 1 || colIndex > (range.values[0]?.length || 0)) err(ERRORS.REF);
    let found = null;
    let last = null;
    for (const row of range.values) {
      const key = row[0];
      last = row;
      if (exact) {
        if (String(key).toLowerCase() === String(lookup).toLowerCase()) return row[colIndex - 1] ?? ERRORS.NA;
      } else if (toNumber(key) <= toNumber(lookup)) {
        found = row;
      }
    }
    if (!exact) return (found || last)?.[colIndex - 1] ?? ERRORS.NA;
    return ERRORS.NA;
  },
  HLOOKUP: (args) => {
    const lookup = scalar(args[0]);
    const range = args[1];
    if (!(range instanceof RangeValue)) err(ERRORS.VALUE);
    const rowIndex = Math.floor(toNumber(scalar(args[2])));
    const row = range.values[rowIndex - 1];
    if (!row) err(ERRORS.REF);
    for (let c = 0; c < row.length; c++) {
      if (String(range.values[0][c]).toLowerCase() === String(lookup).toLowerCase()) return row[c] ?? ERRORS.NA;
    }
    return ERRORS.NA;
  },
  INDEX: (args) => {
    const range = args[0];
    const values = range instanceof RangeValue ? range.values : [[range]];
    const r = Math.max(1, Math.floor(toNumber(scalar(args[1]))));
    const c = args.length > 2 ? Math.max(1, Math.floor(toNumber(scalar(args[2])))) : 1;
    if (!values[r - 1]) err(ERRORS.REF);
    return values[r - 1][c - 1] ?? null;
  },
  MATCH: (args) => {
    const lookup = scalar(args[0]);
    const range = args[1];
    if (!(range instanceof RangeValue)) err(ERRORS.VALUE);
    const flat = flatten([range]);
    const matchType = args.length > 2 ? toNumber(scalar(args[2])) : 1;
    if (matchType === 0) {
      for (let i = 0; i < flat.length; i++) {
        if (String(flat[i]).toLowerCase() === String(lookup).toLowerCase()) return i + 1;
      }
      return ERRORS.NA;
    }
    let best = -1;
    for (let i = 0; i < flat.length; i++) {
      if (toNumber(flat[i]) <= toNumber(lookup)) best = i;
    }
    return best >= 0 ? best + 1 : ERRORS.NA;
  },
  CHOOSE: (args) => {
    const idx = Math.floor(toNumber(scalar(args[0])));
    if (idx < 1 || idx >= args.length) err(ERRORS.VALUE);
    return scalar(args[idx]);
  },
  TODAY: () => excelSerial(new Date()),
  NOW: () => {
    const now = new Date();
    return excelSerial(now) + (now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds()) / 86400;
  },
  DATE: (args) =>
    excelSerial(new Date(Date.UTC(toNumber(scalar(args[0])), toNumber(scalar(args[1])) - 1, toNumber(scalar(args[2]))))),
  YEAR: (args) => fromSerial(toNumber(scalar(args[0]))).getUTCFullYear(),
  MONTH: (args) => fromSerial(toNumber(scalar(args[0]))).getUTCMonth() + 1,
  DAY: (args) => fromSerial(toNumber(scalar(args[0]))).getUTCDate(),
  DAYS: (args) => toNumber(scalar(args[0])) - toNumber(scalar(args[1])),
  PMT: (args) => {
    const rate = toNumber(scalar(args[0]));
    const nper = toNumber(scalar(args[1]));
    const pv = toNumber(scalar(args[2]));
    if (!rate) return -pv / nper;
    const factor = Math.pow(1 + rate, nper);
    return (-rate * pv * factor) / (factor - 1);
  },
  FV: (args) => {
    const rate = toNumber(scalar(args[0]));
    const nper = toNumber(scalar(args[1]));
    const pmt = toNumber(scalar(args[2]));
    const pv = toNumber(scalar(args[3] ?? 0));
    if (!rate) return -(pv + pmt * nper);
    const factor = Math.pow(1 + rate, nper);
    return -(pv * factor + pmt * ((factor - 1) / rate));
  },
});
/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

export function formatNumber(value, pattern = '#,##0.##########') {
  if (!Number.isFinite(value)) return String(value);
  const negative = value < 0;
  const abs = Math.abs(value);
  const decimalPattern = pattern.split('.')[1] || '';
  const decimals = decimalPattern.replace(/[^0#]/g, '').length;
  const grouping = pattern.includes(',');
  let text = abs.toFixed(decimals);
  if (decimalPattern.endsWith('#') && text.includes('.')) {
    text = text.replace(/0+$/, '').replace(/\.$/, '');
  }
  if (grouping) {
    const [intPart, decPart] = text.split('.');
    text = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (decPart ? `.${decPart}` : '');
  }
  return negative ? `-${text}` : text;
}

export const NUMBER_FORMATS = [
  { id: 'general', label: 'General', pattern: null },
  { id: 'number', label: 'Number 1,234.56', pattern: '#,##0.00' },
  { id: 'integer', label: 'Integer 1,235', pattern: '#,##0' },
  { id: 'currency-usd', label: 'Currency $1,234.56', pattern: '$#,##0.00' },
  { id: 'currency-eur', label: 'Currency €1,234.56', pattern: '€#,##0.00' },
  { id: 'currency-gbp', label: 'Currency £1,234.56', pattern: '£#,##0.00' },
  { id: 'percent', label: 'Percent 12.34%', pattern: '0.00%' },
  { id: 'percent-whole', label: 'Percent 12%', pattern: '0%' },
  { id: 'date', label: 'Date 2026-10-23', pattern: 'date' },
  { id: 'date-long', label: 'Date Oct 23, 2026', pattern: 'date-long' },
  { id: 'time', label: 'Time 14:30', pattern: 'time' },
  { id: 'text', label: 'Text', pattern: 'text' },
  { id: 'accounting', label: 'Accounting', pattern: 'accounting' },
  { id: 'scientific', label: 'Scientific 1.23E+03', pattern: 'scientific' },
];

export function formatCellValue(value, format = 'general', currencySymbol) {
  if (value === null || value === undefined || value === '') return '';
  if (isError(value)) return value;
  if (format === 'text') return toText(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value !== 'number') {
    const asNumber = String(value).trim() !== '' && !Number.isNaN(Number(String(value).replace(/,/g, '')));
    if (!asNumber) return String(value);
    value = Number(String(value).replace(/,/g, ''));
  }
  const serialToDate = () => fromSerial(value);
  switch (format) {
    case 'general':
      return formatNumber(value);
    case 'number':
      return formatNumber(value, '#,##0.00');
    case 'integer':
      return formatNumber(value, '#,##0');
    case 'currency-usd':
      return `${value < 0 ? '-' : ''}$${formatNumber(Math.abs(value), '#,##0.00')}`;
    case 'currency-eur':
      return `${value < 0 ? '-' : ''}€${formatNumber(Math.abs(value), '#,##0.00')}`;
    case 'currency-gbp':
      return `${value < 0 ? '-' : ''}£${formatNumber(Math.abs(value), '#,##0.00')}`;
    case 'percent':
      return `${formatNumber(value * 100, '#,##0.00')}%`;
    case 'percent-whole':
      return `${formatNumber(value * 100, '#,##0')}%`;
    case 'date':
      return serialToDate().toISOString().slice(0, 10);
    case 'date-long':
      return serialToDate().toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
      });
    case 'time':
      return serialToDate().toISOString().slice(11, 16);
    case 'accounting':
      return `${value < 0 ? '-' : ''}$${formatNumber(Math.abs(value), '#,##0.00')}`;
    case 'scientific':
      return value.toExponential(2).replace('e', 'E');
    default:
      if (format === 'currency') {
        return `${value < 0 ? '-' : ''}${currencySymbol || '$'}${formatNumber(Math.abs(value), '#,##0.00')}`;
      }
      return formatNumber(value, format.includes('0') || format.includes('#') ? format : '#,##0.##########');
  }
}

/* ------------------------------------------------------------------ *
 * Evaluation
 * ------------------------------------------------------------------ */

export function getCellRaw(table, row, col) {
  return table?.cells?.[`${row},${col}`] || null;
}

export function evaluateTable(table) {
  const rows = table?.rows || 0;
  const cols = table?.cols || 0;
  const cache = new Map();
  const visiting = new Set();

  function evalCell(row, col) {
    if (row < 0 || col < 0 || row >= rows || col >= cols) err(ERRORS.REF);
    const key = `${row},${col}`;
    if (cache.has(key)) return cache.get(key);
    if (visiting.has(key)) err(ERRORS.CIRC);
    visiting.add(key);
    const cell = getCellRaw(table, row, col);
    let result;
    if (!cell) result = null;
    else if (cell.formula && String(cell.formula).trim().startsWith('=')) {
      try {
        const ast = parseFormula(cell.formula);
        result = ast ? evalNode(ast) : null;
      } catch (e) {
        result = e instanceof FormulaError ? e.code : ERRORS.VALUE;
      }
    } else {
      result = cell.value ?? null;
      if (
        typeof result === 'string' &&
        result.trim() !== '' &&
        !Number.isNaN(Number(result.replace(/,/g, ''))) &&
        /^-?[\d,]+(\.\d+)?$/.test(result.trim())
      ) {
        result = Number(result.replace(/,/g, ''));
      }
    }
    visiting.delete(key);
    cache.set(key, result);
    return result;
  }

  function evalNode(node) {
    switch (node.type) {
      case 'number':
        return node.value;
      case 'string':
        return node.value;
      case 'boolean':
        return node.value;
      case 'blank':
        return null;
      case 'percent':
        return toNumber(scalar(evalNode(node.operand))) / 100;
      case 'ref': {
        const start = parseAddress(node.start);
        if (!start) err(ERRORS.REF);
        if (node.end) {
          const end = parseAddress(node.end);
          if (!end) err(ERRORS.REF);
          const r1 = Math.min(start.row, end.row);
          const r2 = Math.max(start.row, end.row);
          const c1 = Math.min(start.col, end.col);
          const c2 = Math.max(start.col, end.col);
          const values = [];
          for (let r = r1; r <= r2; r++) {
            const row = [];
            for (let c = c1; c <= c2; c++) row.push(evalCell(r, c));
            values.push(row);
          }
          return new RangeValue(values);
        }
        return evalCell(start.row, start.col);
      }
      case 'unary': {
        const value = toNumber(scalar(evalNode(node.operand)));
        return node.op === '-' ? -value : value;
      }
      case 'binary':
        return evalBinary(node);
      case 'func': {
        const fn = FUNCTIONS[node.name];
        if (!fn) err(ERRORS.NAME);
        const args = node.args.map((arg) => evalNode(arg));
        return fn(args);
      }
      default:
        err(ERRORS.VALUE);
    }
  }

  function evalBinary(node) {
    const left = scalar(evalNode(node.left));
    if (node.op === '&') return toText(left) + toText(scalar(evalNode(node.right)));
    if (['=', '<>', '<', '>', '<=', '>='].includes(node.op)) {
      const right = scalar(evalNode(node.right));
      let a = left;
      let b = right;
      if (typeof a === 'number' || typeof b === 'number') {
        a = toNumber(a);
        b = toNumber(b);
      } else {
        a = toText(a).toLowerCase();
        b = toText(b).toLowerCase();
      }
      switch (node.op) {
        case '=': return a === b;
        case '<>': return a !== b;
        case '<': return a < b;
        case '>': return a > b;
        case '<=': return a <= b;
        case '>=': return a >= b;
      }
    }
    const a = toNumber(left);
    const b = toNumber(scalar(evalNode(node.right)));
    switch (node.op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/':
        if (b === 0) err(ERRORS.DIV0);
        return a / b;
      case '^': return Math.pow(a, b);
      default: err(ERRORS.VALUE);
    }
  }

  const values = [];
  const display = [];
  const errors = [];
  for (let r = 0; r < rows; r++) {
    const rowValues = [];
    const rowDisplay = [];
    for (let c = 0; c < cols; c++) {
      const value = evalCell(r, c);
      rowValues.push(value);
      const cell = getCellRaw(table, r, c);
      const format = cell?.format || cell?.style?.format || 'general';
      const text = cell?.formula
        ? formatCellValue(value, format)
        : formatCellValue(cell?.value ?? value, format);
      rowDisplay.push(isError(value) ? value : text);
      if (isError(value)) errors.push({ row: r, col: c, code: value });
    }
    values.push(rowValues);
    display.push(rowDisplay);
  }
  return { values, display, errors, get: (row, col) => cache.get(`${row},${col}`) ?? null };
}

/* ------------------------------------------------------------------ *
 * Table helpers
 * ------------------------------------------------------------------ */

export function emptyTable(rows = 5, cols = 4) {
  return {
    rows,
    cols,
    colWidths: Array(cols).fill(120),
    rowHeights: Array(rows).fill(32),
    cells: {},
    headerRow: true,
    headerCol: false,
  };
}

export function ensureCell(table, row, col) {
  const key = `${row},${col}`;
  if (!table.cells[key]) table.cells[key] = { value: '' };
  return table.cells[key];
}

export function resizeTable(table, rows, cols) {
  const next = {
    ...table,
    rows,
    cols,
    colWidths: Array.from({ length: cols }, (_, i) => table.colWidths?.[i] || 120),
    rowHeights: Array.from({ length: rows }, (_, i) => table.rowHeights?.[i] || 32),
    cells: {},
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = `${r},${c}`;
      if (table.cells[key]) next.cells[key] = table.cells[key];
    }
  }
  return next;
}

export function applyFormatToRange(table, range, patch) {
  const { r1, c1, r2, c2 } = range;
  const cells = { ...table.cells };
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const key = `${r},${c}`;
      const current = cells[key] || { value: '' };
      cells[key] = { ...current, style: { ...(current.style || {}), ...patch } };
    }
  }
  return { ...table, cells };
}

export function clearRange(table, range) {
  const cells = { ...table.cells };
  for (let r = range.r1; r <= range.r2; r++) {
    for (let c = range.c1; c <= range.c2; c++) {
      const key = `${r},${c}`;
      if (cells[key]) cells[key] = { value: '', style: cells[key].style };
    }
  }
  return { ...table, cells };
}

