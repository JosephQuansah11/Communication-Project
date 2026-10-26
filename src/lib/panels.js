/**
 * The sizes of the editor's two side panels.
 *
 * Both can be hidden to give the canvas the whole window, and both can be dragged
 * wider or narrower. The sizes are remembered per browser so the workspace comes back
 * the way it was left, and every value is clamped: a panel can never be dragged so
 * narrow that its controls vanish, nor so wide that the canvas disappears.
 */

/** How narrow and how wide each panel may be dragged, in pixels. */
export const PANEL_LIMITS = {
  rail: { min: 150, max: 460 },
  tools: { min: 260, max: 640 },
};

/** The widths a fresh workspace starts with. */
export const DEFAULT_PANEL_SIZES = { rail: 233, tools: 360 };

const STORAGE_KEY = 'quandrion.panels';

/** Keep a width inside its limits, and turn anything unusable into the default. */
export function clampPanelWidth(side, value) {
  const limits = PANEL_LIMITS[side] || PANEL_LIMITS.tools;
  const fallback = DEFAULT_PANEL_SIZES[side] ?? limits.min;
  // null and '' would both read as 0 and silently become the minimum, which is a
  // worse answer than the default a fresh workspace gets.
  if (value === null || value === undefined || value === '') return fallback;
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.min(limits.max, Math.max(limits.min, number));
}

/** A width as the browser should write it. */
export function panelWidthStyle(sizes = {}) {
  return {
    '--rail-w': `${clampPanelWidth('rail', sizes.rail)}px`,
    '--tools-w': `${clampPanelWidth('tools', sizes.tools)}px`,
  };
}

/**
 * Read the remembered sizes. Anything missing, corrupt or out of range falls back to
 * the default, so a bad stored value can never leave the editor unusable.
 */
export function loadPanelSizes(storage) {
  const store = storage || (typeof localStorage === 'undefined' ? null : localStorage);
  const sizes = { ...DEFAULT_PANEL_SIZES };
  if (!store) return sizes;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return sizes;
    const parsed = JSON.parse(raw);
    for (const side of Object.keys(DEFAULT_PANEL_SIZES)) {
      if (parsed?.[side] !== undefined) sizes[side] = clampPanelWidth(side, parsed[side]);
    }
  } catch {
    /* a private-mode browser or a corrupt value: the defaults are fine */
  }
  return sizes;
}

/** Remember the sizes. Failing to store them is never worth an error. */
export function savePanelSizes(sizes, storage) {
  const store = storage || (typeof localStorage === 'undefined' ? null : localStorage);
  if (!store) return;
  try {
    store.setItem(
      STORAGE_KEY,
      JSON.stringify({
        rail: clampPanelWidth('rail', sizes?.rail),
        tools: clampPanelWidth('tools', sizes?.tools),
      })
    );
  } catch {
    /* storage full or blocked: the layout simply will not be remembered */
  }
}
