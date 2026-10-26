import { useCallback, useEffect, useState } from 'react';
import { WORKSPACE_BACKGROUND_DEFAULT, workspaceBackgroundStyles } from '../lib/backgrounds.js';

/**
 * The picture painted behind the workspace (the window background).
 *
 * WPS lets you skin the window itself, so the same thing is possible here: an
 * image, its fit, opacity and blur, remembered per browser.
 */
const STORAGE_KEY = 'quandrion:workspace-background';

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...WORKSPACE_BACKGROUND_DEFAULT };
    return { ...WORKSPACE_BACKGROUND_DEFAULT, ...JSON.parse(raw) };
  } catch {
    return { ...WORKSPACE_BACKGROUND_DEFAULT };
  }
}

export function useWorkspaceBackground() {
  const [background, setBackground] = useState(read);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(background));
    } catch {
      /* storage is optional — the picture then lasts for the session */
    }
  }, [background]);

  const update = useCallback((changes) => {
    setBackground((current) => ({ ...current, ...changes }));
  }, []);

  const clear = useCallback(() => setBackground({ ...WORKSPACE_BACKGROUND_DEFAULT }), []);

  return { background, update, clear, styles: workspaceBackgroundStyles(background) };
}
