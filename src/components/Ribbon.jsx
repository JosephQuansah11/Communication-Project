import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import Popover from './Popover.jsx';
import { FILE_ITEMS, RIBBON_TABS, ribbonTab } from '../lib/ribbon.js';

/**
 * The WPS-style ribbon: File button, quick-access cluster, the tab strip and the
 * group row of the active tab.
 *
 * The component is deliberately generic — every control is described in
 * `lib/ribbon.js`. `renderItem(item)` lets the editor draw the controls that need
 * their own widget (colour pickers, selects, the shape grid…); when it returns
 * nothing the item becomes a plain button that calls `onAction(item.id)`.
 */
export default function Ribbon({
  activeTab,
  onTabChange,
  onAction,
  state = {},
  disabled = {},
  renderItem,
  brand,
  quick,
  right,
  fileLabel = 'File',
}) {
  const [fileOpen, setFileOpen] = useState(false);
  const fileRef = useRef(null);
  const tab = ribbonTab(activeTab);

  const drawItem = (item, options = {}) => {
    const custom = renderItem?.(item);
    if (custom) return <div className="ribbon-control" key={item.id}>{custom}</div>;
    const large = item.size === 'large';
    return (
      <button
        key={item.id}
        type="button"
        role={options.menu ? 'menuitem' : undefined}
        className={`ribbon-item ${large ? 'large' : 'small'}${state[item.id] ? ' on' : ''}${item.danger ? ' danger' : ''}${
          options.menu ? ' menu-item' : ''
        }`}
        title={item.title || item.label}
        aria-pressed={item.toggle ? Boolean(state[item.id]) : undefined}
        disabled={Boolean(disabled[item.id])}
        onClick={() => {
          options.closeMenu?.();
          onAction?.(item.id);
        }}
      >
        <Icon name={item.icon} size={large ? 21 : 16} />
        <span>{item.label}</span>
      </button>
    );
  };

  return (
    <header className="ribbon">
      <div className="ribbon-top">
        <div className="ribbon-file-wrap">
          <button
            type="button"
            ref={fileRef}
            className={`ribbon-file${fileOpen ? ' on' : ''}`}
            aria-expanded={fileOpen}
            aria-haspopup="menu"
            onClick={() => setFileOpen((value) => !value)}
          >
            <Icon name="menu" size={18} />
            {fileLabel}
            <Icon name="chevronDown" size={14} />
          </button>
          <Popover anchorRef={fileRef} open={fileOpen} onClose={() => setFileOpen(false)} className="ribbon-file-layer">
            <div className="ribbon-file-menu" role="menu" aria-label="File">
              <span className="ribbon-file-title">Presentation</span>
              {FILE_ITEMS.map((item) => drawItem(item, { menu: true, closeMenu: () => setFileOpen(false) }))}
            </div>
          </Popover>
        </div>

        <div className="ribbon-quick">{quick}</div>

        <nav className="ribbon-tabs" role="tablist" aria-label="Ribbon tabs">
          {RIBBON_TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={entry.id === tab.id}
              className={`ribbon-tab${entry.id === tab.id ? ' on' : ''}`}
              onClick={() => {
                setFileOpen(false);
                onTabChange?.(entry.id);
              }}
            >
              {entry.label}
            </button>
          ))}
        </nav>

        <div className="ribbon-right">{right}</div>
      </div>

      <div className="ribbon-body" role="tabpanel" aria-label={`${tab.label} tab`}>
        {brand ? <div className="ribbon-body-brand">{brand}</div> : null}
        {tab.groups.map((group) => (
          <div className="ribbon-group" key={`${tab.id}-${group.id}`}>
            <div className="ribbon-group-items">{group.items.map((item) => drawItem(item))}</div>
            <span className="ribbon-group-label">{group.label}</span>
          </div>
        ))}
      </div>
    </header>
  );
}
