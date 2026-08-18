import { CANVAS_H, CANVAS_W } from '../../domain/types';
import type { PageTypeDef, SlotDef, TemplateDef } from '../types';

// Three arrangements differing only in where the title band sits. The
// middle arrangement comes first so boards from before this option keep
// their appearance when the stale template id resolves to the default.

function background(): SlotDef {
  return {
    id: 'background',
    kind: 'media',
    promptKey: 'background',
    rect: { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H, rot: 0 },
  };
}

function band(id: string, nameKey: string, titleY: number, versionY: number): TemplateDef {
  return {
    id,
    nameKey,
    slots: [
      background(),
      {
        id: 'title',
        kind: 'text',
        promptKey: 'title',
        rect: { x: 96, y: titleY, w: 1083, h: 220, rot: 0 },
        textStyle: { fontFamily: 'heading', fontSize: 110, weight: 700, align: 'center', shadow: true },
      },
      {
        id: 'owner',
        kind: 'text',
        promptKey: 'owner',
        rect: { x: 96, y: titleY + 260, w: 1083, h: 70, rot: 0 },
        textStyle: { fontFamily: 'body', fontSize: 40, weight: 500, align: 'center', shadow: true },
      },
      {
        id: 'version',
        kind: 'text',
        promptKey: 'version',
        rect: { x: 96, y: versionY, w: 1083, h: 50, rot: 0 },
        textStyle: { fontFamily: 'body', fontSize: 26, weight: 400, align: 'center', color: 'muted' },
      },
    ],
  };
}

export const cover: PageTypeDef = {
  type: 'cover',
  textFlow: false,
  defaultTemplateId: 'title-middle',
  templates: [
    band('title-middle', 'titleMiddle', 620, 1500),
    band('title-top', 'titleTop', 140, 1500),
    band('title-bottom', 'titleBottom', 1150, 90),
  ],
};
