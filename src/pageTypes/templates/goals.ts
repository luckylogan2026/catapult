import { BODY_Y, CONTENT_W, MARGIN, subtitleSlot, titleSlot } from '../geometry';
import type { PageTypeDef } from '../types';

// Categorized numbered lists with user-defined category headings. Each
// item is a category section: a heading line followed by its numbered
// goals, added through the item flow.
export const goals: PageTypeDef = {
  type: 'goals',
  textFlow: true,
  defaultTemplateId: 'categories',
  templates: [{ id: 'categories', nameKey: 'categories', slots: [titleSlot(), subtitleSlot()] }],
  itemFlow: {
    region: { x: MARGIN, y: BODY_Y, w: CONTENT_W, h: 1650 - BODY_Y - MARGIN },
    itemH: 300,
    gap: 40,
    itemStyle: { fontFamily: 'body', fontSize: 34, weight: 400, align: 'left', lineHeight: 1.55 },
  },
};
