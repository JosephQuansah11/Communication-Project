import Icon from './Icon.jsx';

const ACCENTS = ['#c1797f', '#b8825f', '#a4646a', '#cf9276', '#8f6f7d', '#9fc6c0', '#a8c69c', '#e8b978'];

function accentFor(id = '') {
  let hash = 0;
  for (const character of String(id)) hash = (hash * 31 + character.charCodeAt(0)) % 9973;
  return ACCENTS[hash % ACCENTS.length];
}

function initialFor(title = '') {
  const match = String(title).trim().match(/[a-z0-9]/i);
  return match ? match[0].toUpperCase() : 'P';
}

/**
 * The document tab strip — the row of open presentations under the ribbon.
 *
 * Clicking a tab switches presentations, the × closes it, middle-click also
 * closes, and the + button starts a new one. Collapsing leaves a slim bar so the
 * workspace keeps the space.
 */
export default function DocumentTabs({
  tabs = [],
  activeId,
  onSelect,
  onClose,
  onNew,
  collapsed = false,
  onToggleCollapse,
  newLabel = 'New',
}) {
  if (collapsed) {
    return (
      <div className="doc-tabs collapsed">
        <button
          type="button"
          className="doc-tab-collapse"
          onClick={() => onToggleCollapse?.(false)}
          title="Show the open presentations"
        >
          <Icon name="layers" size={17} />
          {tabs.length} open
          <Icon name="chevronDown" size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="doc-tabs" role="tablist" aria-label="Open presentations">
      <div className="doc-tab-strip">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tab"
            tabIndex={0}
            aria-selected={tab.id === activeId}
            className={`doc-tab${tab.id === activeId ? ' on' : ''}`}
            onClick={() => onSelect?.(tab.id)}
            onAuxClick={(event) => {
              if (event.button === 1) {
                event.preventDefault();
                onClose?.(tab.id);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') onSelect?.(tab.id);
            }}
          >
            <span className="doc-tab-icon" style={{ background: accentFor(tab.id) }} aria-hidden="true">
              {initialFor(tab.title)}
            </span>
            <span className="doc-tab-title" title={tab.title}>{tab.title}</span>
            <button
              type="button"
              className="doc-tab-close"
              title="Close this tab"
              onClick={(event) => {
                event.stopPropagation();
                onClose?.(tab.id);
              }}
            >
              <Icon name="close" size={13} />
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="doc-tab-new" onClick={() => onNew?.()} title="New presentation">
        <Icon name="plus" size={17} /> {newLabel}
      </button>
      <button
        type="button"
        className="doc-tab-collapse"
        onClick={() => onToggleCollapse?.(true)}
        title="Collapse the tab bar"
      >
        <Icon name="chevronDown" size={17} />
      </button>
    </div>
  );
}
