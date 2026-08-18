import { CONTENT_W, MARGIN, SUBTITLE_H, SUBTITLE_Y, subtitleSlot, titleSlot } from '../geometry';
import type { PageTypeDef, SlotDef } from '../types';

const TOP = SUBTITLE_Y + SUBTITLE_H + 40;
const GAP = 18;
const COLS = 3;
const ROWS = 3;
const TILE_W = (CONTENT_W - GAP * (COLS - 1)) / COLS;
const TILE_H = (1650 - MARGIN - TOP - GAP * (ROWS - 1)) / ROWS;

// A three-across grid of tiles: image plus caption plus status. Empty
// tiles render as a subtle outline. Marking a tile achieved timestamps
// it and offers to mirror it onto the Legacy page.
const tiles: SlotDef[] = Array.from({ length: COLS * ROWS }, (_, i) => ({
  id: `tile-${i + 1}`,
  kind: 'media',
  promptKey: 'tile',
  chapterTile: true,
  rect: {
    x: MARGIN + (i % COLS) * (TILE_W + GAP),
    y: TOP + Math.floor(i / COLS) * (TILE_H + GAP),
    w: TILE_W,
    h: TILE_H,
    rot: 0,
  },
}));

export const chapterGridTemplates = [
  { id: 'grid-9', nameKey: 'gridNine', slots: [titleSlot(), subtitleSlot(), ...tiles] },
];

export const chapters: PageTypeDef = {
  type: 'chapters',
  textFlow: false,
  defaultTemplateId: 'grid-9',
  templates: chapterGridTemplates,
};
