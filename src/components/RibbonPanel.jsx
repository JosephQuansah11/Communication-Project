import Icon from './Icon.jsx';
import { ribbonTab } from '../lib/ribbon.js';

/**
 * The tools of the active tab, drawn down the right-hand column instead of in a
 * second toolbar row across the window.
 *
 * It is the same model the tab strip uses (`lib/ribbon.js`) and the same controls
 * the ribbon used to draw — including the ones the editor draws itself through
 * `renderItem` (colour pickers, the shape grid, the background presets…) — only
 * stacked: every group becomes a titled block of chips, so switching tabs changes
 * what the right column shows.
 */
export default function RibbonPanel({
  activeTab,
  onAction,
  state = {},
  disabled = {},
  renderItem,
  /** 'windows' | 'mac' | …: makes the shortcut hints match the machine. */
  platform = 'other',
  open = true,
  onToggle,
  /** Set false when the panel should stay open (a test, a kiosk view…). */
  collapsible = true,
}) {
  const tab = ribbonTab(activeTab);
  /** Tooltips are written with Ctrl; show the key this machine actually has. */
  const hint = (text) =>
    platform === 'mac' || platform === 'ios'
      ? String(text).replace(/\bCtrl\/Cmd\b|\bCtrl\b|\bCmd\b/g, '⌘').replace(/\s*\+\s*/g, '')
      : String(text).replace(/\bCtrl\/Cmd\b/g, 'Ctrl');

  const drawItem = (item) => {
    const custom = renderItem?.(item);
    if (custom) return <div className="tab-panel-control" key={item.id}>{custom}</div>;
    return (
      <button
        key={item.id}
        type="button"
        className={`ribbon-item ${item.size === 'large' ? 'large' : 'small'}${state[item.id] ? ' on' : ''}${
          item.danger ? ' danger' : ''
        }`}
        title={hint(item.title || item.label)}
        aria-pressed={item.toggle ? Boolean(state[item.id]) : undefined}
        disabled={Boolean(disabled[item.id])}
        onClick={() => onAction?.(item.id)}
      >
        <Icon name={item.icon} size={item.size === 'large' ? 18 : 16} />
        <span>{item.label}</span>
      </button>
    );
  };

  return (
    <section
      className={`tab-panel${open ? '' : ' closed'}`}
      aria-label={`${tab.label} tools`}
      data-tab-panel={tab.id}
    >
      <header className="tab-panel-head">
        <span className="eyebrow">{tab.label} tools</span>
        {collapsible && (
          <button
            type="button"
            className="ghost-btn icon-only"
            aria-expanded={open}
            title={open ? 'Hide these tools' : `Show the ${tab.label} tools`}
            onClick={() => onToggle?.(!open)}
          >
            <Icon name={open ? 'chevronUp' : 'chevronDown'} size={18} />
          </button>
        )}
      </header>
      {open && (
        <div className="tab-panel-body">
          {tab.groups.map((group) => (
            <div className="tab-panel-group" key={`${tab.id}-${group.id}`} data-group={group.id}>
              <span className="tab-panel-label">{group.label}</span>
              <div className="tab-panel-items">{group.items.map((item) => drawItem(item))}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
