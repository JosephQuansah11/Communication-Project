import { useEffect, useState } from 'react';

export const SYSTEM_UI_STACK =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif';
export const SYSTEM_SERIF_STACK = 'Georgia, "Times New Roman", Times, serif';
export const SYSTEM_MONO_STACK = '"SF Mono", "Cascadia Code", Consolas, "Liberation Mono", Menlo, monospace';

const FALLBACK_FAMILIES = [
  'system-ui', 'Segoe UI', 'Arial', 'Helvetica', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Calibri', 'Inter',
  'Roboto', 'Ubuntu', 'Noto Sans', 'DejaVu Sans', 'Liberation Sans', 'Open Sans', 'Lato', 'Montserrat',
  'Georgia', 'Times New Roman', 'Cambria', 'Garamond', 'Palatino Linotype', 'Book Antiqua', 'Merriweather',
  'Consolas', 'Courier New', 'Cascadia Code', 'Menlo', 'Monaco', 'Fira Code', 'Source Code Pro',
];

const SERIF_HINTS = ['georgia', 'times', 'serif', 'cambria', 'garamond', 'palatino', 'merriweather', 'book antiqua'];
const MONO_HINTS = ['mono', 'consolas', 'courier', 'menlo', 'monaco', 'code', 'cascadia', 'terminal'];

export function fallbackFor(family) {
  const lower = String(family || '').toLowerCase();
  if (MONO_HINTS.some((hint) => lower.includes(hint))) return SYSTEM_MONO_STACK;
  if (SERIF_HINTS.some((hint) => lower.includes(hint))) return SYSTEM_SERIF_STACK;
  return SYSTEM_UI_STACK;
}

export function fontStack(family) {
  const value = String(family || 'system-ui').trim();
  if (!value) return SYSTEM_UI_STACK;
  if (value === 'system-ui') return SYSTEM_UI_STACK;
  if (/^(serif|sans-serif|monospace|cursive|fantasy)$/i.test(value)) return value;
  return `"${value.replace(/"/g, '')}", ${fallbackFor(value)}`;
}

function detectFamily(family) {
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return false;
    const text = 'mmmmmmmmmmlliWwQ@0123456789';
    const size = 72;
    const widthFor = (font) => {
      context.font = `${size}px ${font}`;
      return context.measureText(text).width;
    };
    const baseSans = widthFor('monospace');
    const baseSerif = widthFor('serif');
    context.font = `${size}px "${family}", monospace`;
    const wideSans = context.measureText(text).width;
    context.font = `${size}px "${family}", serif`;
    const wideSerif = context.measureText(text).width;
    return Math.abs(wideSans - baseSans) > 0.5 || Math.abs(wideSerif - baseSerif) > 0.5;
  } catch {
    return false;
  }
}

export async function listSystemFonts() {
  const found = new Set();
  let source = 'detected';
  try {
    if (typeof window.queryLocalFonts === 'function') {
      const faces = await window.queryLocalFonts();
      const unique = new Map();
      for (const face of faces) {
        if (!unique.has(face.family)) unique.set(face.family, face.fullName || face.postscriptName);
      }
      for (const family of unique.keys()) found.add(family);
      if (found.size) source = 'local-font-access';
    }
  } catch {
    /* Permission denied or unsupported — fall back to probing. */
  }

  if (!found.size) {
    for (const family of FALLBACK_FAMILIES) {
      if (family === 'system-ui' || detectFamily(family)) found.add(family);
    }
  } else {
    for (const family of FALLBACK_FAMILIES) found.add(family);
  }

  return {
    families: [...found].sort((a, b) => a.localeCompare(b)),
    source,
    strategy: 'system',
  };
}

let cache = null;

export function useSystemFonts(extraFamilies = []) {
  const [state, setState] = useState(cache || { families: FALLBACK_FAMILIES, source: 'loading', strategy: 'system' });
  useEffect(() => {
    let alive = true;
    if (!cache) {
      listSystemFonts().then((result) => {
        cache = result;
        if (alive) setState(result);
      });
    }
    return () => {
      alive = false;
    };
  }, []);
  const merged = [...new Set([...state.families, ...(extraFamilies || []).filter(Boolean)])].sort((a, b) =>
    a.localeCompare(b)
  );
  return { ...state, families: merged };
}
