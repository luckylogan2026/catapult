import { CANVAS_H, CANVAS_W } from '../../domain/types';
import { bodySlot, subtitleSlot, titleSlot } from '../geometry';
import type { PageTypeDef } from '../types';

// The framing page: the thought plus image plus emotion rule and any
// personal cue text.
export const affirmationsIntro: PageTypeDef = {
  type: 'affirmations-intro',
  textFlow: true,
  defaultTemplateId: 'prose',
  templates: [
    {
      id: 'prose',
      nameKey: 'prose',
      slots: [
        {
          id: 'background',
          kind: 'media',
          promptKey: 'background',
          rect: { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H, rot: 0 },
        },
        titleSlot(),
        subtitleSlot(),
        bodySlot(),
      ],
    },
  ],
};
