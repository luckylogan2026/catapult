import { titleSlot } from '../geometry';
import type { PageTypeDef } from '../types';

// In authoring this page opens the affirmation list editor, not the
// canvas. In playback each active affirmation gets its own full screen
// with its paired image, a beat of silence, and optionally its audio.
// The affirmations themselves live flat on the board and are shared by
// every page of this type.
export const affirmations: PageTypeDef = {
  type: 'affirmations',
  textFlow: false,
  defaultTemplateId: 'list',
  authoring: 'affirmation-list',
  templates: [{ id: 'list', nameKey: 'list', slots: [titleSlot()] }],
};
