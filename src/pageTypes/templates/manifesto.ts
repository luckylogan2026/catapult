import { bodySlot, titleSlot } from '../geometry';
import type { PageTypeDef } from '../types';

// Long-form third person prose, single column, generous line height.
export const manifesto: PageTypeDef = {
  type: 'manifesto',
  textFlow: true,
  defaultTemplateId: 'prose',
  templates: [
    {
      id: 'prose',
      nameKey: 'prose',
      slots: [
        titleSlot(),
        {
          ...bodySlot(),
          textStyle: { fontFamily: 'body', fontSize: 34, weight: 400, align: 'left', lineHeight: 1.8 },
        },
      ],
    },
  ],
};
