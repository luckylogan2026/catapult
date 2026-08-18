import { CANVAS_H, CANVAS_W } from '../../domain/types';
import type { PageTypeDef } from '../types';

export const cover: PageTypeDef = {
  type: 'cover',
  textFlow: false,
  defaultTemplateId: 'full-bleed',
  templates: [
    {
      id: 'full-bleed',
      nameKey: 'fullBleed',
      slots: [
        {
          id: 'background',
          kind: 'media',
          promptKey: 'background',
          rect: { x: 0, y: 0, w: CANVAS_W, h: CANVAS_H, rot: 0 },
        },
        {
          id: 'title',
          kind: 'text',
          promptKey: 'title',
          rect: { x: 96, y: 620, w: 1083, h: 220, rot: 0 },
          textStyle: { fontFamily: 'heading', fontSize: 110, weight: 700, align: 'center' },
        },
        {
          id: 'owner',
          kind: 'text',
          promptKey: 'owner',
          rect: { x: 96, y: 880, w: 1083, h: 70, rot: 0 },
          textStyle: { fontFamily: 'body', fontSize: 40, weight: 500, align: 'center' },
        },
        {
          id: 'version',
          kind: 'text',
          promptKey: 'version',
          rect: { x: 96, y: 1500, w: 1083, h: 50, rot: 0 },
          textStyle: { fontFamily: 'body', fontSize: 26, weight: 400, align: 'center', color: 'muted' },
        },
      ],
    },
  ],
};
