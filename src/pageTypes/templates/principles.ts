import { TITLE_H, TITLE_Y, bodySlot, titleSlot } from '../geometry';
import type { PageTypeDef } from '../types';

// Pasted prose: the user pastes or types their numbered principles as one
// body of text and it fills the page. Overflow beyond the canvas scrolls
// here and in phone playback, and becomes continuation screens in
// playback and continuation pages in PDF export.
export const principles: PageTypeDef = {
  type: 'principles',
  textFlow: true,
  defaultTemplateId: 'prose',
  templates: [{ id: 'prose', nameKey: 'prose', slots: [titleSlot(), bodySlot('body', TITLE_Y + TITLE_H + 44, 1650 - (TITLE_Y + TITLE_H + 44) - 96)] }],
};
