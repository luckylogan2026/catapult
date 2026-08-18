import { CANVAS_H, CANVAS_W } from '../../domain/types';
import { bodySlot, titleSlot } from '../geometry';
import type { PageTypeDef } from '../types';

// The framing page: the thought plus image plus emotion rule and any
// personal cue text. Its background image and its audio carry across
// every affirmation screen during playback, the audio continuing as
// long as no video with sound takes over.
export const affirmationsIntro: PageTypeDef = {
  type: 'affirmations-intro',
  textFlow: true,
  pageAudio: true,
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
        bodySlot(),
      ],
    },
  ],
};
