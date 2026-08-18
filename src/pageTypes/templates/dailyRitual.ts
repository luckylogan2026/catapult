import { BODY_Y, CONTENT_W, MARGIN, subtitleSlot, titleSlot } from '../geometry';
import type { PageTypeDef } from '../types';

export const dailyRitual: PageTypeDef = {
  type: 'daily-ritual',
  textFlow: true,
  defaultTemplateId: 'steps',
  templates: [{ id: 'steps', nameKey: 'steps', slots: [titleSlot(), subtitleSlot()] }],
  itemFlow: {
    region: { x: MARGIN, y: BODY_Y, w: CONTENT_W, h: 1650 - BODY_Y - MARGIN },
    itemH: 110,
    gap: 24,
    itemStyle: { fontFamily: 'body', fontSize: 36, weight: 400, align: 'left', lineHeight: 1.4 },
  },
};
