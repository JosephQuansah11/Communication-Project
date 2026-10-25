import { useCallback, useEffect, useState } from 'react';

/**
 * The window's document tab strip (the WPS-style row of open presentations).
 *
 * The list lives in `localStorage` so the tabs you had open are still there the
 * next time the window opens, and a `storage` listener keeps a second window
 * (library or presenter) in sync.
 */
const STORAGE_KEY = 'slidesmith:window-tabs';
const MAX_TABS = 12;

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { tabs: [], collapsed: false };
    const parsed = JSON.parse(raw);
    const tabs = Array.isArray(parsed?.tabs)
      ? parsed.tabs
          .filter((tab) => tab && typeof tab.id === 'string')
          .map((tab) => ({ id: tab.id, title: tab.title || 'Untitled presentation' }))
          .slice(-MAX_TABS)
      : [];
    return { tabs, collapsed: Boolean(parsed?.collapsed) };
  } catch {
    return { tabs: [], collapsed: false };
  }
}

export function useDocumentTabs() {
  const [state, setState] = useState(read);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage can be unavailable in private mode — tabs are then per session */
    }
  }, [state]);

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === STORAGE_KEY) setState(read());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  /** Add (or refresh) the tab of a deck that is open in this window. */
  const register = useCallback((deck) => {
    if (!deck?.id) return;
    setState((current) => {
      const title = deck.title || 'Untitled presentation';
      const existing = current.tabs.find((tab) => tab.id === deck.id);
      const tabs = existing
        ? current.tabs.map((tab) => (tab.id === deck.id ? { ...tab, title } : tab))
        : [...current.tabs, { id: deck.id, title }].slice(-MAX_TABS);
      return { ...current, tabs };
    });
  }, []);

  const close = useCallback((id) => {
    setState((current) => ({ ...current, tabs: current.tabs.filter((tab) => tab.id !== id) }));
  }, []);

  const setCollapsed = useCallback((collapsed) => {
    setState((current) => ({ ...current, collapsed: Boolean(collapsed) }));
  }, []);

  return { tabs: state.tabs, collapsed: state.collapsed, register, close, setCollapsed };
}
