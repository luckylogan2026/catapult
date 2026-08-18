import { CONTENT_W, MARGIN, TITLE_H, TITLE_Y, titleSlot } from '../geometry';
import type { PageTypeDef, SlotDef } from '../types';

const TOP = TITLE_Y + TITLE_H + 32;
const BOTTOM = 1650 - MARGIN;
const GAP = 36;
const COL_W = (CONTENT_W - GAP) / 2;
const H = BOTTOM - TOP;

// Character traits and Routine get the taller sections; Style and
// Mentors the shorter ones, per the owner's request.
const TALL = Math.round((H - GAP) * 0.58);
const SHORT = H - GAP - TALL;
const HEAD_H = 64;

// Each section is a prefilled heading with a free text box beneath it.
// Body text supports paragraphs, bullet lines, and numbered lines.
function section(id: string, col: number, y: number, h: number): SlotDef[] {
  const x = MARGIN + col * (COL_W + GAP);
  return [
    {
      id: `${id}-heading`,
      kind: 'text',
      promptKey: id,
      prefill: true,
      rect: { x, y, w: COL_W, h: HEAD_H, rot: 0 },
      textStyle: { fontFamily: 'heading', fontSize: 44, weight: 600, align: 'left', color: 'var(--tc-primary)' },
    },
    {
      id,
      kind: 'text',
      promptKey: `${id}Body`,
      rect: { x, y: y + HEAD_H + 12, w: COL_W, h: h - HEAD_H - 12, rot: 0 },
      textStyle: { fontFamily: 'body', fontSize: 30, weight: 400, align: 'left', lineHeight: 1.5 },
    },
  ];
}

export const profile: PageTypeDef = {
  type: 'profile',
  textFlow: true,
  defaultTemplateId: 'sections',
  templates: [
    {
      id: 'sections',
      nameKey: 'sections',
      slots: [
        titleSlot(),
        ...section('traits', 0, TOP, TALL),
        ...section('style', 0, TOP + TALL + GAP, SHORT),
        ...section('routine', 1, TOP, TALL),
        ...section('mentors', 1, TOP + TALL + GAP, SHORT),
      ],
    },
  ],
};
