import { bodySlot, subtitleSlot, titleSlot } from '../geometry';
import type { PageTypeDef } from '../types';

export const instructions: PageTypeDef = {
  type: 'instructions',
  textFlow: true,
  defaultTemplateId: 'prose',
  templates: [
    {
      id: 'prose',
      nameKey: 'prose',
      slots: [titleSlot(), subtitleSlot('dateCreated'), bodySlot()],
    },
  ],
};
