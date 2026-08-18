import { TITLE_H, TITLE_Y, bodySlot, titleSlot } from '../geometry';
import type { PageTypeDef } from '../types';

// Pasted prose, like Principles: type or paste the ritual steps as one
// text and it fills the page.
export const dailyRitual: PageTypeDef = {
  type: 'daily-ritual',
  textFlow: true,
  defaultTemplateId: 'prose',
  templates: [{ id: 'prose', nameKey: 'prose', slots: [titleSlot(), bodySlot('body', TITLE_Y + TITLE_H + 44, 1650 - (TITLE_Y + TITLE_H + 44) - 96)] }],
};
