import type { PageTypeDef } from '../types';

// An empty page with no template, for anything the other types do not
// fit. Opens directly in canvas layout.
export const freeCanvas: PageTypeDef = {
  type: 'free-canvas',
  textFlow: false,
  defaultTemplateId: 'blank',
  defaultLayout: 'canvas',
  templates: [{ id: 'blank', nameKey: 'blank', slots: [] }],
};
