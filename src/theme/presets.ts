// The four shipped theme presets from the build brief, Section 12.
// The brand default preset id lives in config/brand.json. A board may
// later override any of these values through the theme editor.

export type ThemeColors = {
  background: string;
  surface: string;
  primary: string;
  secondary: string;
  text: string;
  textMuted: string;
};

export type ThemeFonts = { heading: string; body: string };

export type ThemePreset = {
  id: string;
  name: string;
  colors: ThemeColors;
  fonts: ThemeFonts;
};

export const themePresets: ThemePreset[] = [
  {
    id: 'sugarpine-forest',
    name: 'Sugarpine Forest',
    colors: {
      background: '#112B12',
      surface: '#1A3D1B',
      primary: '#D4A853',
      secondary: '#C8D4C4',
      text: '#F7F5F0',
      textMuted: '#9FAF9B',
    },
    fonts: { heading: 'Playfair Display', body: 'DM Sans' },
  },
  {
    id: 'near-black',
    name: 'Near Black',
    colors: {
      background: '#0D1F0E',
      surface: '#152A16',
      primary: '#D4A853',
      secondary: '#C8D4C4',
      text: '#F7F5F0',
      textMuted: '#93A190',
    },
    fonts: { heading: 'Playfair Display', body: 'DM Sans' },
  },
  {
    id: 'neutral-dark',
    name: 'Neutral Dark',
    colors: {
      background: '#131311',
      surface: '#1D1D1A',
      primary: '#E8E0D0',
      secondary: '#8F8C84',
      text: '#F5F2EC',
      textMuted: '#98948B',
    },
    fonts: { heading: 'Playfair Display', body: 'DM Sans' },
  },
  {
    id: 'paper',
    name: 'Paper',
    colors: {
      background: '#F7F5F0',
      surface: '#FFFFFF',
      primary: '#A87D2C',
      secondary: '#5C6B58',
      text: '#1C1C18',
      textMuted: '#6B675F',
    },
    fonts: { heading: 'Playfair Display', body: 'DM Sans' },
  },
];

export function getPreset(id: string): ThemePreset {
  return themePresets.find((p) => p.id === id) ?? themePresets[0];
}
