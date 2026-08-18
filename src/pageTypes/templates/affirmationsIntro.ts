import { bodySlot, subtitleSlot, titleSlot } from '../geometry';
import type { PageTypeDef } from '../types';

// The framing page: the thought plus image plus emotion rule and any
// personal cue text.
export const affirmationsIntro: PageTypeDef = {
  type: 'affirmations-intro',
  textFlow: true,
  defaultTemplateId: 'prose',
  templates: [{ id: 'prose', nameKey: 'prose', slots: [titleSlot(), subtitleSlot(), bodySlot()] }],
};
