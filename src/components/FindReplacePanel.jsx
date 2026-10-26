import Icon from './Icon.jsx';

/**
 * The Find & replace panel: what to look for, what to put in its place, how to
 * match, and how much of it the deck holds. It works on every slide at once —
 * text boxes, shape text, table cells and speaker notes.
 */
export default function FindReplacePanel({
  query,
  replacement,
  totals = { occurrences: 0, objects: 0, slides: 0 },
  matchCase,
  wholeWord,
  inputRef,
  replaceInputRef,
  onQuery,
  onReplacement,
  onMatchCase,
  onWholeWord,
  onPrevious,
  onNext,
  onReplace,
  onReplaceAll,
  onClose,
}) {
  const hasMatches = totals.occurrences > 0;
  const key = (event, action) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      action();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose?.();
    }
  };
  return (
    <div className="find-panel" role="dialog" aria-label="Find and replace">
      <div className="find-row">
        <Icon name="search" size={16} />
        <input
          ref={inputRef}
          className="find-input"
          value={query}
          placeholder="Find in every slide"
          onChange={(event) => onQuery?.(event.target.value)}
          onKeyDown={(event) => key(event, () => (event.shiftKey ? onPrevious?.() : onNext?.()))}
        />
        <span className="find-count">
          {!query
            ? ''
            : hasMatches
              ? `${totals.occurrences} in ${totals.objects} object${totals.objects === 1 ? '' : 's'} on ${totals.slides} slide${
                  totals.slides === 1 ? '' : 's'
                }`
              : 'no matches'}
        </span>
        <button type="button" className="find-step" title="Previous match (Shift+Enter)" onClick={onPrevious} disabled={!hasMatches}>
          <Icon name="arrowUp" size={15} />
        </button>
        <button type="button" className="find-step" title="Next match (Enter)" onClick={onNext} disabled={!hasMatches}>
          <Icon name="arrowDown" size={15} />
        </button>
        <button type="button" className="find-step" title="Close (Esc)" onClick={onClose}>
          <Icon name="close" size={15} />
        </button>
      </div>
      <div className="find-row">
        <Icon name="replace" size={16} />
        <input
          ref={replaceInputRef}
          className="find-input"
          value={replacement}
          placeholder="Replace with"
          onChange={(event) => onReplacement?.(event.target.value)}
          onKeyDown={(event) => key(event, () => (event.shiftKey ? onReplace?.() : onReplaceAll?.()))}
        />
        <button type="button" className="wide-btn" title="Replace inside the object the find is on" onClick={onReplace} disabled={!hasMatches}>
          Replace
        </button>
        <button type="button" className="wide-btn primary" title="Replace everywhere in the deck" onClick={onReplaceAll} disabled={!hasMatches}>
          Replace all
        </button>
      </div>
      <div className="find-options">
        <label>
          <input type="checkbox" checked={Boolean(matchCase)} onChange={(event) => onMatchCase?.(event.target.checked)} /> Match case
        </label>
        <label>
          <input type="checkbox" checked={Boolean(wholeWord)} onChange={(event) => onWholeWord?.(event.target.checked)} /> Whole words
        </label>
        <small>Text boxes, shape text, table cells and speaker notes — every slide. Formulas are left alone.</small>
      </div>
    </div>
  );
}
