import { brand } from '../config';
import { getPreset, type ThemeColors, type ThemeFonts } from './presets';

// Writes the active theme onto the document root as CSS custom properties.
// Tailwind utilities map onto these variables in index.css, so a theme
// change repaints the whole app without a rebuild or a re-render.
export function applyTheme(colors: ThemeColors, fonts: ThemeFonts): void {
  const root = document.documentElement;
  root.style.setProperty('--tc-background', colors.background);
  root.style.setProperty('--tc-surface', colors.surface);
  root.style.setProperty('--tc-primary', colors.primary);
  root.style.setProperty('--tc-secondary', colors.secondary);
  root.style.setProperty('--tc-text', colors.text);
  root.style.setProperty('--tc-text-muted', colors.textMuted);
  root.style.setProperty('--tc-font-heading', `"${fonts.heading}", serif`);
  root.style.setProperty('--tc-font-body', `"${fonts.body}", sans-serif`);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', colors.background);
}

// The brand default: the preset named in config/brand.json, with the
// brand palette taking precedence over the preset values so a client
// rebrand needs only the JSON edit.
export function applyBrandDefaultTheme(): void {
  const preset = getPreset(brand.defaultThemePreset);
  applyTheme({ ...preset.colors, ...brand.palette }, { ...preset.fonts, ...brand.fonts });
}

// Applies a board's theme: preset colors, then the brand palette when
// the board sits on the brand's default preset (the palette is the
// brand's tuned version of that preset), then any editor overrides.
// A deliberately chosen different preset stays untouched by the brand.
export function applyBoardTheme(theme: {
  presetId: string;
  colors?: Partial<ThemeColors>;
  fonts?: Partial<ThemeFonts>;
}): void {
  const preset = getPreset(theme.presetId);
  const brandLayer = theme.presetId === brand.defaultThemePreset ? brand.palette : {};
  const brandFonts = theme.presetId === brand.defaultThemePreset ? brand.fonts : {};
  applyTheme(
    { ...preset.colors, ...brandLayer, ...theme.colors },
    { ...preset.fonts, ...brandFonts, ...theme.fonts },
  );
}
