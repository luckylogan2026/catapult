import { bodySlot, subtitleSlot, titleSlot } from '../geometry';
import type { PageTypeDef } from '../types';

// Pasted prose: the user pastes or types their numbered principles as one
// body of text and it fills the page. Overflow beyond the canvas scrolls
// here and in phone playback, and becomes continuation screens in
// playback and continuation pages in PDF export.
export const principles: PageTypeDef = {
  type: 'principles',
  textFlow: true,
  defaultTemplateId: 'prose',
  templates: [{ id: 'prose', nameKey: 'prose', slots: [titleSlot(), subtitleSlot(), bodySlot()] }],
};
