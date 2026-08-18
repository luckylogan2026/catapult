import { bodySlot, subtitleSlot, titleSlot } from '../geometry';
import type { PageTypeDef } from '../types';

// Pasted prose: category headings and numbered goals live in one pasted
// text. Bullet and numbered lines format automatically.
export const goals: PageTypeDef = {
  type: 'goals',
  textFlow: true,
  defaultTemplateId: 'prose',
  templates: [{ id: 'prose', nameKey: 'prose', slots: [titleSlot(), subtitleSlot(), bodySlot()] }],
};
