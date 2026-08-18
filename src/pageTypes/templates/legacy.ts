import { visionBoardTemplates } from './visionBoard';
import type { PageTypeDef } from '../types';

// Structurally identical to the vision board, framed in the past tense.
// Achieved chapters accumulate here. The framing lives in strings.json.
export const legacy: PageTypeDef = {
  type: 'legacy',
  textFlow: false,
  cellExpansion: true,
  defaultTemplateId: 'mosaic-3',
  templates: visionBoardTemplates,
};
