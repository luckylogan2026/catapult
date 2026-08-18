import { subtitleSlot, titleSlot } from '../geometry';
import type { PageTypeDef } from '../types';

// Master affirmations: longer declarations, paragraph length, each
// optionally carrying its own audio (a self-dictated mp3, for example).
// Authoring opens the master list editor. In playback each active entry
// gets its own screen and plays its audio when present.
export const masterAffirmations: PageTypeDef = {
  type: 'master-affirmations',
  textFlow: false,
  defaultTemplateId: 'list',
  authoring: 'master-affirmation-list',
  templates: [{ id: 'list', nameKey: 'list', slots: [titleSlot(), subtitleSlot()] }],
};
