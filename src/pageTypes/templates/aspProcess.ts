import { CANVAS_H, CANVAS_W } from '../../domain/types';
import { bodySlot, subtitleSlot, titleSlot } from '../geometry';
import type { PageTypeDef } from '../types';

// The Meditation page: a full-bleed background image or video, the
// user's own audio recording attached through the page audio control,
// and optional guiding text. Text may carry [pause] markers for the
// text to speech path (Phase 3).
export const aspProcess: PageTypeDef = {
  type: 'asp-process',
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
