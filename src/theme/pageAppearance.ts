import type { CSSProperties } from 'react';
import { getPreset } from './presets';

// A page marked light renders on the paper palette wherever it appears,
// by overriding the theme variables locally on that page's container.
export function appearanceVars(page: { appearance?: 'dark' | 'light' }): CSSProperties | undefined {
  if (page.appearance !== 'light') return undefined;
  const c = getPreset('paper').colors;
  return {
    '--tc-background': c.background,
    '--tc-surface': c.surface,
    '--tc-text': c.text,
    '--tc-text-muted': c.textMuted,
    background: c.background,
  } as CSSProperties;
}
