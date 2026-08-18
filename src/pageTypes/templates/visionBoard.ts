import type { BlockRect } from '../../domain/types';
import { CONTENT_W, MARGIN, SUBTITLE_H, SUBTITLE_Y, subtitleSlot, titleSlot } from '../geometry';
import type { PageTypeDef, SlotDef, TemplateDef } from '../types';

const TOP = SUBTITLE_Y + SUBTITLE_H + 40;
const BOTTOM = 1650 - MARGIN;
const H = BOTTOM - TOP;
const GAP = 18;

function cell(id: string, rect: BlockRect): SlotDef {
  return { id, kind: 'media', promptKey: 'cell', rect };
}

// Three mosaic arrangements: three, five, and eight cells. Cells take
// video as readily as stills, and never carry captions.
function mosaic(id: string, nameKey: string, cells: BlockRect[]): TemplateDef {
  return {
    id,
    nameKey,
    slots: [titleSlot(), subtitleSlot('keywords'), ...cells.map((r, i) => cell(`cell-${i + 1}`, r))],
  };
}

const colW = (CONTENT_W - GAP) / 2;
const thirdW = (CONTENT_W - GAP * 2) / 3;
const rowH2 = (H - GAP) / 2;
const rowH3 = (H - GAP * 2) / 3;

export const visionBoardTemplates: TemplateDef[] = [
  mosaic('mosaic-3', 'mosaicThree', [
    { x: MARGIN, y: TOP, w: CONTENT_W, h: rowH2, rot: 0 },
    { x: MARGIN, y: TOP + rowH2 + GAP, w: colW, h: rowH2, rot: 0 },
    { x: MARGIN + colW + GAP, y: TOP + rowH2 + GAP, w: colW, h: rowH2, rot: 0 },
  ]),
  mosaic('mosaic-5', 'mosaicFive', [
    { x: MARGIN, y: TOP, w: colW, h: rowH2, rot: 0 },
    { x: MARGIN + colW + GAP, y: TOP, w: colW, h: rowH2, rot: 0 },
    { x: MARGIN, y: TOP + rowH2 + GAP, w: thirdW, h: rowH2, rot: 0 },
    { x: MARGIN + thirdW + GAP, y: TOP + rowH2 + GAP, w: thirdW, h: rowH2, rot: 0 },
    { x: MARGIN + (thirdW + GAP) * 2, y: TOP + rowH2 + GAP, w: thirdW, h: rowH2, rot: 0 },
  ]),
  mosaic(
    'mosaic-8',
    'mosaicEight',
    [0, 1, 2].flatMap((row) =>
      [0, 1, 2].map((col) => ({
        x: MARGIN + col * (thirdW + GAP),
        y: TOP + row * (rowH3 + GAP),
        w: thirdW,
        h: rowH3,
        rot: 0,
      })),
    ).filter((_, i) => i !== 4)
      .map((r, i) => (i === 3 ? { ...r, w: thirdW * 2 + GAP } : r)),
  ),
];

export const visionBoard: PageTypeDef = {
  type: 'vision-board',
  textFlow: false,
  defaultTemplateId: 'mosaic-3',
  templates: visionBoardTemplates,
};
