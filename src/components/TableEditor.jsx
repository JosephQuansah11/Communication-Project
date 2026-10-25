import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import {
  applyFormatToRange,
  clearRange,
  colToLabel,
  evaluateTable,
  formatCellValue,
  NUMBER_FORMATS,
} from '../../shared/formula.js';

const FUNCTIONS = [
  'SUM', 'AVERAGE', 'COUNT', 'COUNTA', 'MIN', 'MAX', 'IF', 'IFERROR', 'ROUND', 'ABS', 'SQRT', 'POWER',
  'VLOOKUP', 'HLOOKUP', 'INDEX', 'MATCH', 'COUNTIF', 'SUMIF', 'AVERAGEIF', 'CONCAT', 'TEXTJOIN', 'LEN',
  'LEFT', 'RIGHT', 'MID', 'UPPER', 'LOWER', 'TRIM', 'TODAY', 'DATE', 'PMT',
];

const rect = (selection) => ({
  r1: Math.min(selection.r1, selection.r2),
  r2: Math.max(selection.r1, selection.r2),
  c1: Math.min(selection.c1, selection.c2),
  c2: Math.max(selection.c1, selection.c2),
});

const inSelection = (selection, r, c) => {
  const box = rect(selection);
  return r >= box.r1 && r <= box.r2 && c >= box.c1 && c <= box.c2;
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const clampCell = (table, r, c) => ({
  r: Math.max(0, Math.min(table.rows - 1, r)),
  c: Math.max(0, Math.min(table.cols - 1, c)),
});

export default function TableEditor({ element, onChange, onClose, live = false }) {
  const [table, setTable] = useState(() => clone(element.table));
  const [selection, setSelection] = useState({ r1: 0, c1: 0, r2: 0, c2: 0 });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [barValue, setBarValue] = useState('');
  const [dragging, setDragging] = useState(false);
  const gridRef = useRef(null);
  const inputRef = useRef(null);
  const barRef = useRef(null);

  const result = useMemo(() => evaluateTable(table), [table]);
  const active = { r: selection.r1, c: selection.c1 };
  const activeCell = table.cells?.[`${active.r},${active.c}`] || {};
  const activeAddress = `${colToLabel(active.c)}${active.r + 1}`;
  const activeStyle = activeCell.style || {};

  useEffect(() => {
    const cell = table.cells?.[`${active.r},${active.c}`];
    setBarValue(cell?.formula || cell?.value || '');
  }, [selection.r1, selection.c1, table]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  useEffect(() => {
    const onUp = () => setDragging(false);
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, []);

  const emit = useCallback(
    (next) => {
      setTable(next);
      onChange?.(next);
    },
    [onChange]
  );

  const updateCell = useCallback(
    (r, c, raw, options = {}) => {
      const cells = { ...table.cells };
      const key = `${r},${c}`;
      const existing = cells[key] || { value: '' };
      const text = String(raw ?? '');
      if (text.startsWith('=') && text.length > 1) {
        cells[key] = { ...existing, value: '', formula: text };
      } else if (text.startsWith('=')) {
        cells[key] = { ...existing, value: '', formula: undefined };
      } else {
        cells[key] = { ...existing, value: text, formula: undefined };
      }
      emit({ ...table, cells });
      setEditing(false);
      if (options.move) {
        const next = clampCell(table, r + options.move.dr, c + options.move.dc);
        setSelection({ r1: next.r, c1: next.c, r2: next.r, c2: next.c });
      }
    },
    [table, emit]
  );

  const startEditing = useCallback(
    (initial) => {
      const current = table.cells?.[`${active.r},${active.c}`];
      setDraft(initial !== undefined ? initial : current?.formula || current?.value || '');
      setEditing(true);
    },
    [table, active.r, active.c]
  );

  const selectCell = (r, c, extend = false) => {
    setSelection((current) => (extend ? { ...current, r2: r, c2: c } : { r1: r, c1: c, r2: r, c2: c }));
    setEditing(false);
  };

  const move = (dr, dc, extend = false) => {
    const next = clampCell(table, active.r + dr, active.c + dc);
    setSelection((current) => (extend ? { ...current, r2: next.r, c2: next.c } : { r1: next.r, c1: next.c, r2: next.r, c2: next.c }));
    setEditing(false);
    gridRef.current?.focus();
  };

  const onGridKeyDown = (event) => {
    if (editing) return;
    const key = event.key;
    if (key === 'ArrowDown') {
      event.preventDefault();
      move(1, 0, event.shiftKey);
      return;
    }
    if (key === 'ArrowUp') {
      event.preventDefault();
      move(-1, 0, event.shiftKey);
      return;
    }
    if (key === 'ArrowRight') {
      event.preventDefault();
      move(0, 1, event.shiftKey);
      return;
    }
    if (key === 'ArrowLeft') {
      event.preventDefault();
      move(0, -1, event.shiftKey);
      return;
    }
    if (key === 'Tab') {
      event.preventDefault();
      move(0, event.shiftKey ? -1 : 1);
      return;
    }
    if (key === 'Enter' || key === 'F2') {
      event.preventDefault();
      startEditing();
      return;
    }
    if (key === 'Delete' || key === 'Backspace') {
      event.preventDefault();
      emit(clearRange(table, rect(selection)));
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === 'a') {
      event.preventDefault();
      setSelection({ r1: 0, c1: 0, r2: table.rows - 1, c2: table.cols - 1 });
      return;
    }
    if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      startEditing(key);
    }
  };

  const patchRange = (patch) => emit(applyFormatToRange(table, rect(selection), patch));

  const setFormat = (format) => {
    const box = rect(selection);
    const cells = { ...table.cells };
    for (let r = box.r1; r <= box.r2; r++) {
      for (let c = box.c1; c <= box.c2; c++) {
        const key = `${r},${c}`;
        cells[key] = { ...(cells[key] || { value: '' }), format };
      }
    }
    emit({ ...table, cells });
  };

  const insertRow = () => {
    const at = active.r + 1;
    const cells = {};
    for (const [key, value] of Object.entries(table.cells)) {
      const [r, c] = key.split(',').map(Number);
      cells[`${r >= at ? r + 1 : r},${c}`] = value;
    }
    emit({
      ...table,
      rows: table.rows + 1,
      rowHeights: [...(table.rowHeights || []).slice(0, at), 36, ...(table.rowHeights || []).slice(at)],
      cells,
    });
    setSelection({ r1: at, c1: 0, r2: at, c2: 0 });
  };

  const insertColumn = () => {
    const at = active.c + 1;
    const cells = {};
    for (const [key, value] of Object.entries(table.cells)) {
      const [r, c] = key.split(',').map(Number);
      cells[`${r},${c >= at ? c + 1 : c}`] = value;
    }
    emit({
      ...table,
      cols: table.cols + 1,
      colWidths: [...(table.colWidths || []).slice(0, at), 120, ...(table.colWidths || []).slice(at)],
      cells,
    });
    setSelection({ r1: 0, c1: at, r2: 0, c2: at });
  };

  const deleteRow = () => {
    if (table.rows <= 1) return;
    const at = active.r;
    const cells = {};
    for (const [key, value] of Object.entries(table.cells)) {
      const [r, c] = key.split(',').map(Number);
      if (r === at) continue;
      cells[`${r > at ? r - 1 : r},${c}`] = value;
    }
    emit({ ...table, rows: table.rows - 1, rowHeights: (table.rowHeights || []).filter((_, i) => i !== at), cells });
    setSelection({ r1: Math.max(0, at - 1), c1: active.c, r2: Math.max(0, at - 1), c2: active.c });
  };

  const deleteColumn = () => {
    if (table.cols <= 1) return;
    const at = active.c;
    const cells = {};
    for (const [key, value] of Object.entries(table.cells)) {
      const [r, c] = key.split(',').map(Number);
      if (c === at) continue;
      cells[`${r},${c > at ? c - 1 : c}`] = value;
    }
    emit({ ...table, cols: table.cols - 1, colWidths: (table.colWidths || []).filter((_, i) => i !== at), cells });
    setSelection({ r1: active.r, c1: Math.max(0, at - 1), r2: active.r, c2: Math.max(0, at - 1) });
  };

  const commitBar = () => {
    updateCell(active.r, active.c, barValue, { move: { dr: 1, dc: 0 } });
    gridRef.current?.focus();
  };

  const box = rect(selection);
  const selectedValues = [];
  for (let r = box.r1; r <= box.r2; r++) {
    for (let c = box.c1; c <= box.c2; c++) {
      const value = result.values[r]?.[c];
      if (typeof value === 'number') selectedValues.push(value);
    }
  }
  const statusSum = selectedValues.reduce((a, b) => a + b, 0);
  const columnTemplate = `34px ${Array.from({ length: table.cols }, (_, c) => `minmax(96px, ${Math.max(96, Math.round(table.colWidths?.[c] || 110))}fr)`).join(' ')}`;

  return (
    <div className={`table-editor-overlay ${live ? 'live' : ''}`} role="dialog" aria-modal="true">
      <div className="table-editor">
        <header className="table-editor-top">
          <div className="table-editor-title">
            <span className="table-icon"><Icon name="table" size={22} /></span>
            <div>
              <strong>Spreadsheet table</strong>
              <small>{live ? 'Live edit · audience updates instantly' : `${table.rows} rows × ${table.cols} columns`}</small>
            </div>
          </div>
          <div className="table-editor-actions">
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                const original = clone(element.table);
                setTable(original);
                onChange?.(original);
              }}
            >
              Reset
            </button>
            <button type="button" className="primary-btn small" onClick={onClose}>
              <Icon name="check" size={19} /> Done
            </button>
            <button type="button" className="ghost-btn icon-only" onClick={onClose} title="Close">
              <Icon name="close" />
            </button>
          </div>
        </header>

        <div className="sheet-toolbar">
          <button type="button" className="sheet-btn" title="Bold" onClick={() => patchRange({ bold: !activeStyle.bold })}>
            <Icon name="bold" size={19} />
          </button>
          <button type="button" className="sheet-btn" title="Italic" onClick={() => patchRange({ italic: !activeStyle.italic })}>
            <Icon name="italic" size={19} />
          </button>
          <button type="button" className="sheet-btn" title="Underline" onClick={() => patchRange({ underline: !activeStyle.underline })}>
            <Icon name="underline" size={19} />
          </button>
          <span className="sheet-divider" />
          <button type="button" className="sheet-btn" title="Align left" onClick={() => patchRange({ align: 'left' })}>
            <Icon name="alignLeft" size={19} />
          </button>
          <button type="button" className="sheet-btn" title="Align center" onClick={() => patchRange({ align: 'center' })}>
            <Icon name="alignCenter" size={19} />
          </button>
          <button type="button" className="sheet-btn" title="Align right" onClick={() => patchRange({ align: 'right' })}>
            <Icon name="alignRight" size={19} />
          </button>
          <span className="sheet-divider" />
          <label className="sheet-color" title="Text colour">
            <Icon name="font" size={18} />
            <input type="color" value={activeStyle.color || '#0f172a'} onChange={(event) => patchRange({ color: event.target.value })} />
          </label>
          <label className="sheet-color" title="Fill colour">
            <Icon name="fill" size={18} />
            <input type="color" value={activeStyle.bg || '#ffffff'} onChange={(event) => patchRange({ bg: event.target.value })} />
          </label>
          <select
            className="sheet-select"
            value={activeStyle.fontSize || 15}
            onChange={(event) => patchRange({ fontSize: Number(event.target.value) })}
            title="Font size"
          >
            {[10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 28, 32, 40, 48].map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
          <select
            className="sheet-select wide"
            value={activeCell.format || 'general'}
            onChange={(event) => setFormat(event.target.value)}
            title="Number format"
          >
            {NUMBER_FORMATS.map((format) => (
              <option key={format.id} value={format.id}>{format.label}</option>
            ))}
          </select>
          <span className="sheet-divider" />
          <select
            className="sheet-select"
            defaultValue=""
            onChange={(event) => {
              const name = event.target.value;
              if (!name) return;
              setBarValue(`=${name}(`);
              barRef.current?.focus();
              event.target.value = '';
            }}
            title="Insert function"
          >
            <option value="">fx</option>
            {FUNCTIONS.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <button type="button" className="sheet-btn text" onClick={insertRow} title="Insert row below">+ row</button>
          <button type="button" className="sheet-btn text" onClick={insertColumn} title="Insert column right">+ col</button>
          <button type="button" className="sheet-btn text" onClick={deleteRow} title="Delete row">− row</button>
          <button type="button" className="sheet-btn text" onClick={deleteColumn} title="Delete column">− col</button>
          <label className="sheet-check" title="Style the first row as a header">
            <input
              type="checkbox"
              checked={Boolean(table.headerRow)}
              onChange={(event) => emit({ ...table, headerRow: event.target.checked })}
            />
            Header
          </label>
        </div>

        <div className="formula-row">
          <span className="name-box">{activeAddress}</span>
          <span className="fx-label">fx</span>
          <input
            ref={barRef}
            className="formula-input"
            value={barValue}
            onChange={(event) => setBarValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitBar();
              }
              if (event.key === 'Escape') {
                const cell = table.cells?.[`${active.r},${active.c}`];
                setBarValue(cell?.formula || cell?.value || '');
                gridRef.current?.focus();
              }
            }}
            placeholder="Type a value or a formula like =SUM(A1:A5)"
          />
          {activeCell.formula && <span className="formula-badge">formula</span>}
        </div>

        <div className="sheet-scroll" ref={gridRef} tabIndex={0} onKeyDown={onGridKeyDown} role="grid" aria-label="Table cells">
          <div className="sheet-grid" style={{ gridTemplateColumns: columnTemplate }}>
            <div className="sheet-corner" />
            {Array.from({ length: table.cols }).map((_, c) => (
              <div
                key={`col-${c}`}
                className="sheet-colhead"
                onClick={() => setSelection({ r1: 0, c1: c, r2: table.rows - 1, c2: c })}
              >
                {colToLabel(c)}
              </div>
            ))}
            {Array.from({ length: table.rows }).map((_, r) => (
              <RowFragment
                key={`row-${r}`}
                r={r}
                table={table}
                result={result}
                selection={selection}
                active={active}
                editing={editing}
                draft={draft}
                setDraft={setDraft}
                inputRef={inputRef}
                onSelect={selectCell}
                onStartEditing={startEditing}
                onDragStart={(c) => {
                  setDragging(true);
                  setSelection({ r1: r, c1: c, r2: r, c2: c });
                  setEditing(false);
                }}
                onDragEnter={(c) => {
                  if (!dragging) return;
                  setSelection((current) => ({ ...current, r2: r, c2: c }));
                }}
                onCommitCell={updateCell}
              />
            ))}
          </div>
        </div>

        <footer className="table-editor-status">
          <span>
            {box.r1 === box.r2 && box.c1 === box.c2
              ? `Cell ${activeAddress}`
              : `${colToLabel(box.c1)}${box.r1 + 1}:${colToLabel(box.c2)}${box.r2 + 1}`}
          </span>
          <span>Count {selectedValues.length}</span>
          <span>Sum {formatCellValue(statusSum, 'number')}</span>
          <span>Average {selectedValues.length ? formatCellValue(statusSum / selectedValues.length, 'number') : '—'}</span>
          {result.errors.length > 0 && <span className="sheet-error">{result.errors.length} formula error(s)</span>}
          <span className="sheet-hint">Enter edits · Tab moves · Shift+arrows select</span>
        </footer>
      </div>
    </div>
  );
}

function RowFragment({
  r,
  table,
  result,
  selection,
  active,
  editing,
  draft,
  setDraft,
  inputRef,
  onSelect,
  onStartEditing,
  onDragStart,
  onDragEnter,
  onCommitCell,
}) {
  return (
    <>
      <div className={`sheet-rowhead ${active.r === r ? 'active' : ''}`} onClick={() => onSelect(r, 0)}>
        {r + 1}
      </div>
      {Array.from({ length: table.cols }).map((_, c) => {
        const cell = table.cells?.[`${r},${c}`] || {};
        const style = cell.style || {};
        const display = result.display?.[r]?.[c] ?? '';
        const isActive = active.r === r && active.c === c;
        const selected = inSelection(selection, r, c);
        const isEditing = editing && isActive;
        const error = typeof display === 'string' && display.startsWith('#') && display.endsWith('!');
        return (
          <div
            key={`${r}-${c}`}
            className={`sheet-cell ${selected ? 'selected' : ''} ${isActive ? 'active' : ''} ${error ? 'error' : ''}`}
            style={{
              backgroundColor: style.bg || (table.headerRow && r === 0 ? '#1e293b' : '#ffffff'),
              color: error ? '#dc2626' : style.color || (table.headerRow && r === 0 ? '#f8fafc' : '#0f172a'),
              fontWeight: style.bold ? 700 : 400,
              fontStyle: style.italic ? 'italic' : 'normal',
              textDecoration: style.underline ? 'underline' : 'none',
              justifyContent: style.align === 'right' ? 'flex-end' : style.align === 'center' ? 'center' : 'flex-start',
              fontSize: `${Math.max(11, Math.min(22, (style.fontSize || 15) * 0.82))}px`,
            }}
            onMouseDown={() => onDragStart(c)}
            onMouseEnter={() => onDragEnter(c)}
            onDoubleClick={() => {
              onSelect(r, c);
              onStartEditing();
            }}
          >
            {isEditing ? (
              <input
                ref={inputRef}
                className="cell-input"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onMouseDown={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    onCommitCell(r, c, draft, { move: { dr: event.shiftKey ? -1 : 1, dc: 0 } });
                  }
                  if (event.key === 'Tab') {
                    event.preventDefault();
                    onCommitCell(r, c, draft, { move: { dr: 0, dc: event.shiftKey ? -1 : 1 } });
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    onCommitCell(r, c, cell.formula || cell.value || '', {});
                  }
                  event.stopPropagation();
                }}
                onBlur={() => onCommitCell(r, c, draft, {})}
              />
            ) : (
              <span className="sheet-value">{display}</span>
            )}
          </div>
        );
      })}
    </>
  );
}
