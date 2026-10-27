import { useMemo } from 'react';
import { evaluateTable } from '../../shared/formula.js';
import { fontStack } from '../lib/fonts.js';

export function tableRows(table) {
  return Math.max(1, Number(table?.rows) || 1);
}

export function tableCols(table) {
  return Math.max(1, Number(table?.cols) || 1);
}

export default function TableGrid({ table, className = '', style, onCellPointerDown, highlight }) {
  const result = useMemo(() => evaluateTable(table), [table]);
  const rows = tableRows(table);
  const cols = tableCols(table);
  const colWidths = table.colWidths?.length === cols ? table.colWidths : Array(cols).fill(1);
  const rowHeights = table.rowHeights?.length === rows ? table.rowHeights : Array(rows).fill(1);

  return (
    <div
      className={`table-grid ${className}`}
      style={{
        display: 'grid',
        gridTemplateColumns: colWidths.map((w) => `${Math.max(1, w)}fr`).join(' '),
        gridTemplateRows: rowHeights.map((h) => `${Math.max(1, h)}fr`).join(' '),
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        ...style,
      }}
    >
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((__, c) => {
          const cell = table.cells?.[`${r},${c}`] || {};
          const cellStyle = cell.style || {};
          const display = result.display[r]?.[c] ?? '';
          const isError = typeof display === 'string' && display.startsWith('#') && display.endsWith('!');
          const isHeader = table.headerRow && r === 0;
          return (
            <div
              key={`${r}-${c}`}
              className="table-cell"
              onPointerDown={onCellPointerDown ? (event) => onCellPointerDown(r, c, event) : undefined}
              style={{
                display: 'flex',
                alignItems: cellStyle.valign === 'middle' ? 'center' : 'flex-start',
                justifyContent:
                  cellStyle.align === 'right' ? 'flex-end' : cellStyle.align === 'center' ? 'center' : 'flex-start',
                padding: '4px 8px',
                overflow: 'hidden',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: `${cellStyle.fontSize || 15}px`,
                lineHeight: 1.25,
                fontFamily: fontStack(cellStyle.fontFamily),
                color: isError ? '#dc2626' : cellStyle.color || (isHeader ? '#f8fafc' : '#0f172a'),
                fontWeight: cellStyle.bold ? 700 : 500,
                fontStyle: cellStyle.italic ? 'italic' : 'normal',
                textDecoration: cellStyle.underline ? 'underline' : 'none',
                backgroundColor: cellStyle.bg || (isHeader ? '#1e293b' : 'transparent'),
                borderRight: '1px solid rgba(148,163,184,0.28)',
                borderBottom: '1px solid rgba(148,163,184,0.28)',
                outline: highlight === `${r},${c}` ? '2px solid var(--accent)' : 'none',
                outlineOffset: '-2px',
                minWidth: 0,
                minHeight: 0,
                ...(cellStyle.borders || {}),
              }}
            >
              {display}
            </div>
          );
        })
      )}
    </div>
  );
}
