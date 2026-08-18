import { bodySlot, subtitleSlot, titleSlot } from '../geometry';
import type { PageTypeDef } from '../types';

// A guided sequence page. Body text may carry [pause] markers that insert
// a timed silence during narrated playback. Pause duration is editable in
// the page settings (Phase 3).
export const aspProcess: PageTypeDef = {
  type: 'asp-process',
  textFlow: true,
  defaultTemplateId: 'prose',
  templates: [{ id: 'prose', nameKey: 'prose', slots: [titleSlot(), subtitleSlot(), bodySlot()] }],
};
