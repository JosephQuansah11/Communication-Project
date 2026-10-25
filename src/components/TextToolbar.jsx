import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

/** Block-level formats: headers, sub headers and body copy. */
const BLOCKS = [
  { tag: 'h1', label: 'H1', title: 'Header' },
  { tag: 'h2', label: 'H2', title: 'Sub header' },
  { tag: 'h3', label: 'H3', title: 'Small header' },
  { tag: 'p', label: 'Body', title: 'Body text' },
];

const HIGHLIGHTS = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fecdd3', '#fed7aa', '#e9d5ff', 'transparent'];
const COLORS = [
  '#0f172a', '#334155', '#64748b', '#94a3b8', '#ffffff',
  '#dc2626', '#ea580c', '#f59e0b', '#16a34a', '#2563eb', '#7c3aed', '#db2777',
];

function command(name, value) {
  try {
    document.execCommand('styleWithCSS', false, true);
  } catch {
    /* older browsers ignore styleWithCSS */
  }
  try {
    return document.execCommand(name, false, value);
  } catch {
    return false;
  }
}

/** Sizes offered by the toolbar; the current size is added when it is unusual. */
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 72, 96];

/** True when part of the box's text is highlighted (not just a caret). */
function hasTextSelected(node) {
  const selection = document.getSelection();
  if (!node || !selection || selection.isCollapsed || !selection.rangeCount) return false;
  const anchor = selection.anchorNode;
  return Boolean(anchor && (anchor === node || node.contains(anchor)));
}

/** The font family / size the caret or the highlighted text currently uses. */
function selectionFont(node) {
  const selection = document.getSelection();
  const anchor = selection?.anchorNode || null;
  const element = anchor ? (anchor.nodeType === 3 ? anchor.parentElement : anchor) : null;
  if (!element || !node?.contains(element)) return {};
  let family = '';
  try {
    family = String(document.queryCommandValue('fontName') || '');
  } catch {
    family = '';
  }
  family = family.split(',')[0].replace(/["']/g, '').trim();
  const computed = window.getComputedStyle(element);
  if (!family) family = computed.fontFamily.split(',')[0].replace(/["']/g, '').trim();
  const size = Math.round(parseFloat(computed.fontSize)) || null;
  return { family, size };
}

/**
 * Set an exact px size on the highlighted text.
 *
 * `execCommand('fontSize')` only knows the legacy 1–7 sizes, so it is used to mark
 * the selection with `<font size="7">`, which is then rewritten as a span carrying
 * the size the user actually asked for.
 */
function applyFontSize(node, size) {
  try {
    document.execCommand('styleWithCSS', false, false);
    document.execCommand('fontSize', false, '7');
  } catch {
    return false;
  }
  const marks = node.querySelectorAll('font[size="7"]');
  if (!marks.length) return false;
  marks.forEach((mark) => {
    const span = document.createElement('span');
    span.style.fontSize = `${size}px`;
    while (mark.firstChild) span.appendChild(mark.firstChild);
    mark.replaceWith(span);
  });
  return true;
}

export default function TextToolbar({ editorRef, style, placement = 'above', fonts = [], onCommand, onPatchStyle, onDone }) {
  const [state, setState] = useState({});
  const [palette, setPalette] = useState(null);
  const barRef = useRef(null);
  /** The highlighted range, kept while a dropdown has focus. */
  const savedRange = useRef(null);

  const sync = useCallback(() => {
    if (!editorRef?.current) return;
    const node = editorRef.current;
    const read = (name) => {
      try {
        return document.queryCommandState(name);
      } catch {
        return false;
      }
    };
    let block = 'p';
    try {
      block = String(document.queryCommandValue('formatBlock') || 'p').toLowerCase().replace(/[<>]/g, '');
    } catch {
      /* ignore */
    }
    if (!['h1', 'h2', 'h3', 'p'].includes(block)) block = 'p';
    setState({
      bold: read('bold'),
      italic: read('italic'),
      underline: read('underline'),
      superscript: read('superscript'),
      subscript: read('subscript'),
      insertOrderedList: read('insertOrderedList'),
      insertUnorderedList: read('insertUnorderedList'),
      justifyLeft: read('justifyLeft'),
      justifyCenter: read('justifyCenter'),
      justifyRight: read('justifyRight'),
      justifyFull: read('justifyFull'),
      block: block || 'p',
      ...selectionFont(node),
    });
  }, [editorRef]);

  useEffect(() => {
    const onSelectionChange = () => {
      const node = editorRef?.current;
      if (!node) return;
      const anchor = document.getSelection()?.anchorNode || null;
      if (anchor && (anchor === node || node.contains(anchor))) sync();
    };
    document.addEventListener('selectionchange', onSelectionChange);
    sync();
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, [editorRef, sync]);

  const exec = (name, value) => {
    const node = editorRef?.current;
    if (!node) return;
    const anchor = document.getSelection()?.anchorNode || null;
    if (!anchor || !(anchor === node || node.contains(anchor))) node.focus();
    const ok = command(name, value);
    if (!ok && name === 'formatBlock') command(name, `<${value}>`);
    sync();
    onCommand?.();
  };

  /** Keep the highlighted range while a dropdown has the focus. */
  const rememberSelection = () => {
    const node = editorRef?.current;
    const selection = document.getSelection();
    if (!node || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (node.contains(range.commonAncestorContainer)) savedRange.current = range.cloneRange();
  };

  /** Put the caret back in the box with the highlighted range restored. */
  const restoreSelection = () => {
    const node = editorRef?.current;
    if (!node) return false;
    node.focus();
    const range = savedRange.current;
    if (!range) return false;
    const selection = document.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    return true;
  };

  /**
   * Font family and size apply to the highlighted text; with just a caret in the
   * box they apply to the whole box, which is what the inspector's font controls do.
   */
  const applyFamily = (family) => {
    const node = editorRef?.current;
    if (!node || !family) return;
    const highlighted = hasTextSelected(node) || restoreSelection();
    if (!highlighted) {
      onPatchStyle?.({ fontFamily: family });
      sync();
      return;
    }
    exec('fontName', family);
  };

  const applySize = (size) => {
    const node = editorRef?.current;
    if (!node || !size) return;
    const highlighted = hasTextSelected(node) || restoreSelection();
    if (!highlighted) {
      onPatchStyle?.({ fontSize: size });
      sync();
      return;
    }
    applyFontSize(node, size);
    sync();
    onCommand?.();
  };

  const families = [...new Set([state.family, ...(fonts || [])].filter(Boolean))];
  const sizes = [...new Set([...(state.size ? [state.size] : []), ...FONT_SIZES])].sort((a, b) => a - b);

  const button = (name, value, icon, title, active) => (
    <button
      type="button"
      key={`${name}-${value || icon}`}
      className={`tt-btn ${active ? 'on' : ''}`}
      title={title}
      aria-label={title}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => exec(name, value)}
    >
      <Icon name={icon} size={18} />
    </button>
  );

  return (
    <div
      ref={barRef}
      className={`text-toolbar ${placement}`}
      style={style}
      onMouseDown={(event) => event.preventDefault()}
      role="toolbar"
      aria-label="Text formatting"
    >
      <div className="tt-row">
        <div className="tt-group tt-fonts">
          <select
            className="tt-select"
            title="Font family for the highlighted text"
            aria-label="Font family"
            value={state.family || ''}
            onMouseDown={rememberSelection}
            onFocus={rememberSelection}
            onChange={(event) => applyFamily(event.target.value)}
          >
            {!state.family && <option value="">Font</option>}
            {families.map((family) => (
              <option key={family} value={family}>{family}</option>
            ))}
          </select>
          <select
            className="tt-select narrow"
            title="Font size for the highlighted text"
            aria-label="Font size"
            value={state.size || ''}
            onMouseDown={rememberSelection}
            onFocus={rememberSelection}
            onChange={(event) => applySize(Number(event.target.value))}
          >
            {!state.size && <option value="">Size</option>}
            {sizes.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </div>
        <span className="tt-sep" />
        <div className="tt-group" title="Headers, sub headers and body text">
          {BLOCKS.map((block) => (
            <button
              type="button"
              key={block.tag}
              className={`tt-btn tt-block ${state.block === block.tag ? 'on' : ''}`}
              title={block.title}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => exec('formatBlock', block.tag)}
            >
              {block.label}
            </button>
          ))}
        </div>
        <span className="tt-sep" />
        <div className="tt-group">
          {button('bold', undefined, 'bold', 'Bold (Ctrl+B)', state.bold)}
          {button('italic', undefined, 'italic', 'Italic (Ctrl+I)', state.italic)}
          {button('underline', undefined, 'underline', 'Underline (Ctrl+U)', state.underline)}
          {button('superscript', undefined, 'superscript', 'Superscript', state.superscript)}
          {button('subscript', undefined, 'subscript', 'Subscript', state.subscript)}
        </div>
        <span className="tt-sep" />
        <div className="tt-group">
          <button
            type="button"
            className={`tt-btn ${palette === 'highlight' ? 'on' : ''}`}
            title="Highlight"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setPalette((current) => (current === 'highlight' ? null : 'highlight'))}
          >
            <Icon name="highlight" size={18} />
          </button>
          <button
            type="button"
            className={`tt-btn ${palette === 'color' ? 'on' : ''}`}
            title="Text colour"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setPalette((current) => (current === 'color' ? null : 'color'))}
          >
            <Icon name="palette" size={18} />
          </button>
          {button('removeFormat', undefined, 'clearFormat', 'Clear formatting')}
        </div>
      </div>

      <div className="tt-row">
        <div className="tt-group">
          {button('insertOrderedList', undefined, 'listOrdered', 'Numbered list', state.insertOrderedList)}
          {button('insertUnorderedList', undefined, 'listBullet', 'Bulleted list', state.insertUnorderedList)}
        </div>
        <span className="tt-sep" />
        <div className="tt-group">
          {button('justifyLeft', undefined, 'alignLeft', 'Align left', state.justifyLeft)}
          {button('justifyCenter', undefined, 'alignCenter', 'Align centre', state.justifyCenter)}
          {button('justifyRight', undefined, 'alignRight', 'Align right', state.justifyRight)}
          {button('justifyFull', undefined, 'body', 'Justify', state.justifyFull)}
        </div>
        <span className="tt-sep" />
        <button
          type="button"
          className="tt-btn tt-done"
          title="Finish editing"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onDone?.()}
        >
          <Icon name="check" size={17} /> Done
        </button>
      </div>

      {palette && (
        <div className="tt-palette">
          {(palette === 'highlight' ? HIGHLIGHTS : COLORS).map((swatch) => (
            <button
              type="button"
              key={swatch}
              className={`tt-swatch ${swatch === 'transparent' ? 'clear' : ''}`}
              title={swatch === 'transparent' ? 'No highlight' : swatch}
              style={swatch === 'transparent' ? undefined : { background: swatch }}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                exec(palette === 'highlight' ? 'hiliteColor' : 'foreColor', swatch);
                setPalette(null);
              }}
            >
              {swatch === 'transparent' ? <Icon name="close" size={14} /> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
