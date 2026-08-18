import { chapterGridTemplates } from './chapters';
import type { PageTypeDef } from '../types';

// Structurally a My Story grid, framed in the past tense. Achieved
// chapters mirror onto this page as tiles. The framing lives in
// strings.json.
export const legacy: PageTypeDef = {
  type: 'legacy',
  textFlow: false,
  defaultTemplateId: 'grid-9',
  templates: chapterGridTemplates,
};
