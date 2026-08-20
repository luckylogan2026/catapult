// Typed accessors for the two white-label config files.
// All UI copy comes from strings.json and all branding from brand.json.
// Nothing user-facing may be hardcoded in source.
import brandJson from '../../config/brand.json';
import stringsJson from '../../config/strings.json';
import trackerItemsJson from '../../config/tracker-items.json';

export type BrandConfig = {
  appName: string;
  logoPath: string;
  defaultThemePreset: string;
  palette: {
    background: string;
    surface: string;
    primary: string;
    secondary: string;
    text: string;
    textMuted: string;
  };
  fonts: { heading: string; body: string };
};

export const brand: BrandConfig = brandJson;
export const strings = stringsJson;

export type TrackerItem = {
  key: string;
  label: string;
  /** 1 for outcome scales, 0 where zero means it did not happen. */
  min: 0 | 1;
  type?: 'outcome' | 'input';
  /** Hidden and excluded from averages on weekends when true. */
  weekdaysOnly?: boolean;
};

export const trackerItems: { morning: TrackerItem[]; evening: TrackerItem[] } =
  trackerItemsJson as { morning: TrackerItem[]; evening: TrackerItem[] };
