import { bodySlot, subtitleSlot, titleSlot } from '../geometry';
import type { PageTypeDef } from '../types';

// Pasted prose, like Principles: type or paste the ritual steps as one
// text and it fills the page.
export const dailyRitual: PageTypeDef = {
  type: 'daily-ritual',
  textFlow: true,
  defaultTemplateId: 'prose',
  templates: [{ id: 'prose', nameKey: 'prose', slots: [titleSlot(), subtitleSlot(), bodySlot()] }],
};
