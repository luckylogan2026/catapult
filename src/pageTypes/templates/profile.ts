import { CONTENT_W, MARGIN, SUBTITLE_H, SUBTITLE_Y, titleSlot } from '../geometry';
import type { PageTypeDef, SlotDef } from '../types';

const TOP = SUBTITLE_Y + SUBTITLE_H + 24;
const GAP = 32;
const COL_W = (CONTENT_W - GAP) / 2;
const ROW_H = (1650 - MARGIN - TOP - GAP) / 2;

// Four labeled subsections: character traits, style, routine, mentors.
function section(id: string, col: number, row: number): SlotDef {
  return {
    id,
    kind: 'text',
    promptKey: id,
    rect: { x: MARGIN + col * (COL_W + GAP), y: TOP + row * (ROW_H + GAP), w: COL_W, h: ROW_H, rot: 0 },
    textStyle: { fontFamily: 'body', fontSize: 32, weight: 400, align: 'left', lineHeight: 1.55 },
  };
}

export const profile: PageTypeDef = {
  type: 'profile',
  textFlow: true,
  defaultTemplateId: 'quadrants',
  templates: [
    {
      id: 'quadrants',
      nameKey: 'quadrants',
      slots: [titleSlot(), section('traits', 0, 0), section('style', 1, 0), section('routine', 0, 1), section('mentors', 1, 1)],
    },
  ],
};
