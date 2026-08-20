import type { CSSProperties } from 'react';
import { getPreset } from './presets';

// Per-page appearance, relative to the active theme. A page marked
// light renders on the paper palette, a page marked dark on the near
// black palette, and an unmarked page follows the theme. The editor's
// sun and moon toggle offers whichever direction the theme is not.

function varsFrom(presetId: string): CSSProperties {
  const c = getPreset(presetId).colors;
  return {
    '--tc-background': c.background,
    '--tc-surface': c.surface,
    '--tc-text': c.text,
    '--tc-text-muted': c.textMuted,
    background: c.background,
  } as CSSProperties;
}

export function appearanceVars(page: { appearance?: 'dark' | 'light' }): CSSProperties | undefined {
  if (page.appearance === 'light') return varsFrom('paper');
  if (page.appearance === 'dark') return varsFrom('near-black');
  return undefined;
}

/** Whether the active theme itself is light, read from the live vars. */
export function themeIsLightNow(): boolean {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--tc-background').trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(bg);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 140;
}

/** How this page actually renders right now. */
export function pageIsLight(page: { appearance?: 'dark' | 'light' }): boolean {
  if (page.appearance === 'light') return true;
  if (page.appearance === 'dark') return false;
  return themeIsLightNow();
}
