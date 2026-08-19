import type { Block, BlockRect, PageType, Rect } from '../domain/types';

// Page types are data, not code paths. Adding a fifteenth type means
// adding one definition file under templates/ and listing it in the
// registry index. Nothing else in the app may switch on a page type,
// with one exception: a def may name a custom authoring surface (the
// affirmations list editor) through the authoring field.

export type SlotDef = {
  id: string;
  rect: BlockRect;
  kind: 'media' | 'text';
  /** strings.json key under pageTypes.<type>.slots for the empty prompt. */
  promptKey?: string;
  textStyle?: Block['style'];
  /** Prefill the block with the prompt text instead of a placeholder. */
  prefill?: boolean;
  /** Chapter tiles carry status and caption. */
  chapterTile?: boolean;
};

export type TemplateDef = {
  id: string;
  /** strings.json key under templates for the display name. */
  nameKey: string;
  slots: SlotDef[];
};

/**
 * Repeating content rows (principles, ritual steps, goals). The editor's
 * add-item control appends a text block laid out inside the region; the
 * page grows past the canvas and scrolls in authoring and on the phone,
 * and paginates in PDF export (Phase 4).
 */
export type ItemFlowDef = {
  region: Rect;
  itemH: number;
  gap: number;
  maxItems?: number;
  itemStyle: Block['style'];
};

export type PageTypeDef = {
  type: PageType;
  /**
   * Deviation a: text-flow pages render mobile-native and scroll during
   * phone playback. Fixed-canvas pages scale as designed everywhere.
   */
  textFlow: boolean;
  templates: TemplateDef[];
  defaultTemplateId: string;
  itemFlow?: ItemFlowDef;
  /** Defaults for a freshly added page. */
  defaultLayout?: 'template' | 'canvas';
  /** Offers the per-page one-picture-per-screen playback toggle. */
  cellExpansion?: boolean;
  /** This page carries its own audio (meditation or narration). */
  pageAudio?: boolean;
  /** This page hosts the meditation builder and its library. */
  meditationBuilder?: boolean;
  /** A custom authoring surface replaces the canvas for this type. */
  authoring?: 'affirmation-list' | 'master-affirmation-list';
};
