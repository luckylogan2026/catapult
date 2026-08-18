import { BODY_Y, CONTENT_W, MARGIN, subtitleSlot, titleSlot } from '../geometry';
import type { PageTypeDef } from '../types';

// Numbered long-form blocks, one to nine, heading plus paragraph each.
// Items are added through the item flow and scroll past the canvas on
// the phone; PDF export paginates them.
export const principles: PageTypeDef = {
  type: 'principles',
  textFlow: true,
  defaultTemplateId: 'numbered',
  templates: [{ id: 'numbered', nameKey: 'numbered', slots: [titleSlot(), subtitleSlot()] }],
  itemFlow: {
    region: { x: MARGIN, y: BODY_Y, w: CONTENT_W, h: 1650 - BODY_Y - MARGIN },
    itemH: 260,
    gap: 36,
    maxItems: 9,
    itemStyle: { fontFamily: 'body', fontSize: 34, weight: 400, align: 'left', lineHeight: 1.55 },
  },
};
