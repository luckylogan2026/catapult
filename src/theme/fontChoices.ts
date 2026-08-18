// Fonts selectable as a per-page master font. The first two are the
// self-hosted brand fonts; the rest ship with every device, so nothing
// here costs bundle size or a network request.
export type FontChoice = { family: string; fallback: 'serif' | 'sans-serif' | 'monospace' };

export const fontChoices: FontChoice[] = [
  { family: 'Playfair Display', fallback: 'serif' },
  { family: 'DM Sans', fallback: 'sans-serif' },
  { family: 'Georgia', fallback: 'serif' },
  { family: 'Times New Roman', fallback: 'serif' },
  { family: 'Arial', fallback: 'sans-serif' },
  { family: 'Trebuchet MS', fallback: 'sans-serif' },
  { family: 'Courier New', fallback: 'monospace' },
];

export function fontStack(family: string): string {
  const c = fontChoices.find((f) => f.family === family);
  return `"${family}", ${c?.fallback ?? 'sans-serif'}`;
}
