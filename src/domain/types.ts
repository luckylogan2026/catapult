// The canonical data model from the build brief, Section 5, with the four
// approved deviations:
//   a. Page types carry a textFlow flag in the registry. Text-flow pages
//      render mobile-native and scroll during phone playback; the canvas
//      remains the authoring and PDF layout.
//   b. There is no presentation include toggle. Presentation mode plays a
//      chosen playlist fullscreen.
//   c. Order lists contain every page id, included or not. Inclusion is a
//      filter applied at render time, so excluding a page preserves its
//      position for later re-inclusion.
//   d. Board carries a monotonic revision counter for Phase 6 sync. The
//      per-install device id lives in the local kv store, never in the
//      board, because the board travels between devices.

// All block geometry is in canvas units on a fixed 1275 x 1650 logical
// canvas, which is US Letter portrait at 150 DPI. Never store viewport
// pixels.
export const CANVAS_W = 1275;
export const CANVAS_H = 1650;

export type Rect = { x: number; y: number; w: number; h: number };
export type BlockRect = Rect & { rot: number };

export type PageType =
  | 'cover'
  | 'instructions'
  | 'principles'
  | 'daily-ritual'
  | 'vision-board'
  | 'legacy'
  | 'chapters'
  | 'manifesto'
  | 'profile'
  | 'goals'
  | 'affirmations-intro'
  | 'affirmations'
  | 'master-affirmations'
  | 'asp-process'
  | 'free-canvas';

export type BlockKind = 'image' | 'video' | 'text' | 'audio' | 'shape';

export type ChapterStatus = 'past' | 'future' | 'achieved';

export type Block = {
  id: string;
  kind: BlockKind;
  /** Which template slot this block occupies. Meaningless in canvas layout. */
  slotId?: string;
  assetId?: string;
  text?: string;
  caption?: string;
  rect: BlockRect;
  z: number;
  style?: {
    fontFamily?: 'heading' | 'body';
    fontSize?: number;
    color?: string;
    align?: 'left' | 'center' | 'right';
    weight?: number;
    lineHeight?: number;
    italic?: boolean;
    /** Soft dark drop shadow so text stays readable over imagery. */
    shadow?: boolean;
  };
  /** Cover-fit focal point, 0..1 in each axis. Defaults to center. */
  focal?: { x: number; y: number };
  /** How media meets its frame: fill and crop, or shrink to fit whole. */
  fit?: 'cover' | 'contain';
  kenBurns?: { enabled: boolean; from: Rect; to: Rect; durationMs: number };
  chapter?: {
    status: ChapterStatus;
    achievedDate?: string;
  };
};

export type PageInclude = {
  morning: boolean;
  evening: boolean;
  pdf: boolean;
  html: boolean;
};

export type Page = {
  id: string;
  type: PageType;
  title: string;
  /** The comma separated keyword line under the title in the reference format. */
  subtitle: string;
  layout: 'template' | 'canvas';
  /** Which slot arrangement. Ignored when layout is 'canvas'. */
  templateId: string;
  blocks: Block[];
  narrationAssetId?: string;
  /** Page audio loops until the page is left. Defaults off, plays once. */
  audioLoop?: boolean;
  /** Page audio starts with the page, or waits for a tap. */
  audioStart?: 'auto' | 'tap';
  dwellSeconds?: number;
  include: PageInclude;
  /**
   * Vision board and legacy pages: when true, playback expands each
   * filled media cell to its own full screen, in slot order, instead of
   * showing the mosaic as one page. Set per page in the editor.
   */
  expandCells?: boolean;
  /**
   * Per-page master font. When set, every text block on the page renders
   * in this family, overriding the theme pair. Family name from the
   * selectable font list in src/theme/fontChoices.ts.
   */
  masterFont?: string;
  /** Affirmations pages: one screen per affirmation, or a continuous
   * teleprompter roll on a single screen. */
  affirmationDisplay?: 'screens' | 'roll';
  /** Text pages: roll the content like a teleprompter during playback. */
  textRoll?: boolean;
  /** Teleprompter pace for this page. Defaults to normal. */
  rollSpeed?: 'slow' | 'normal' | 'fast';
  /** Computed ambient letterbox fill, cached. Recomputed when media changes. */
  backdrop?: { color: string; blurDataUri: string };
};

export type Asset = {
  /** sha-256 of the content bytes, hex. Content addressed, dedupes for free. */
  id: string;
  kind: 'image' | 'video' | 'audio';
  mime: string;
  bytes: number;
  blob: Blob;
  /** 320px longest edge. Images and video posters. */
  thumbBlob?: Blob;
  /** Frame near the one second mark of a video. */
  posterBlob?: Blob;
  /** Full-resolution original, kept when downscaling and archiving is on. */
  originalBlob?: Blob;
  width?: number;
  height?: number;
  durationMs?: number;
  originalFilename?: string;
  addedAt: string;
};

/**
 * Master affirmations: longer declarations, paragraph length, optionally
 * carrying user-supplied audio (a dictated mp3, for example). Playback
 * gives each active one its own screen, with its audio when present.
 */
export type MasterAffirmation = {
  id: string;
  text: string;
  audioAssetId?: string;
  active: boolean;
};

export type Affirmation = {
  id: string;
  text: string;
  /** The image half of thought plus image plus emotion. */
  imageAssetId?: string;
  /** User recorded audio. Takes precedence over text to speech. */
  audioAssetId?: string;
  emotionTag?: string;
  active: boolean;
  /** Marks the shipped starter examples so they can be cleared in one action. */
  example?: boolean;
};

export type PlaylistId = 'morning' | 'evening';

export type Playlist = {
  id: PlaylistId;
  name: string;
  /**
   * Every page id in this playlist's order, including pages currently
   * excluded from it. Inclusion is a filter at render time (deviation c).
   */
  pageOrder: string[];
  /** Set when the user rearranges this playlist in the order editor.
   * Until then the playlist mirrors the authoring rail order. */
  customized?: boolean;
  affirmationMode: 'shuffle' | 'sequential';
  shuffleCount: number;
  autoAdvance: boolean;
  dwellSeconds: number;
  backgroundTrackAssetId?: string;
  ttsEnabled: boolean;
};

export type OutputTarget = 'morning' | 'evening' | 'pdf' | 'html';

export type Theme = {
  presetId: string;
  /** Sparse overrides on top of the preset, set by the theme editor. */
  colors?: Partial<{
    background: string;
    surface: string;
    primary: string;
    secondary: string;
    text: string;
    textMuted: string;
  }>;
  fonts?: Partial<{ heading: string; body: string }>;
};

export type Settings = {
  /** Global default dwell seconds; a page or playlist may override. */
  dwellSeconds: number;
  /** Keep full-resolution originals when downscaling imports. */
  archiveOriginals: boolean;
  /** PDF and HTML orders. Linked targets follow the morning order. */
  pdfOrder: { linkedToMorning: boolean; pageOrder: string[] };
  htmlOrder: { linkedToMorning: boolean; pageOrder: string[] };
  ttsVoiceURI?: string;
  ttsRate: number;
  /** Passcode hook, disabled in v1 by decision. */
  passcodeEnabled: false;
};

export type SessionCompletion = {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  playlistId: PlaylistId;
  completedAt: string;
  /** The single line of free text from the completion screen. */
  note?: string;
};

export type StreakRecord = {
  completions: SessionCompletion[];
};

export type Board = {
  id: string;
  /** Starts at 1. Migrate forward, never break old bundles. */
  schemaVersion: number;
  /** Monotonic, bumped on every persisted mutation. Phase 6 sync compares it. */
  revision: number;
  meta: {
    ownerName: string;
    title: string;
    /** Free text version label, the reference practice versions the doc. */
    version: string;
    dateCreated: string;
    lastEdited: string;
  };
  theme: Theme;
  settings: Settings;
  pages: Page[];
  affirmations: Affirmation[];
  masterAffirmations?: MasterAffirmation[];
  playlists: Playlist[];
  streak: StreakRecord;
};

export const SCHEMA_VERSION = 1;
