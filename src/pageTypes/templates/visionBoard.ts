import type { BlockRect } from '../../domain/types';
import { CONTENT_W, MARGIN, TITLE_H, TITLE_Y, titleSlot } from '../geometry';
import type { PageTypeDef, SlotDef, TemplateDef } from '../types';

const TOP = TITLE_Y + TITLE_H + 40;
const BOTTOM = 1650 - MARGIN;
const H = BOTTOM - TOP;
const GAP = 18;

function cell(id: string, rect: BlockRect): SlotDef {
  return { id, kind: 'media', promptKey: 'cell', rect };
}

// Arrangements for one through six pictures per page. Cells take video as
// readily as stills, and never carry captions. The per-page expandCells
// toggle turns any arrangement into one picture per screen in playback.
function arrangement(id: string, nameKey: string, cells: BlockRect[]): TemplateDef {
  return {
    id,
    nameKey,
    slots: [titleSlot(), ...cells.map((r, i) => cell(`cell-${i + 1}`, r))],
  };
}

const halfW = (CONTENT_W - GAP) / 2;
const thirdW = (CONTENT_W - GAP * 2) / 3;
const halfH = (H - GAP) / 2;

export const visionBoardTemplates: TemplateDef[] = [
  arrangement('cells-1', 'cellsOne', [{ x: MARGIN, y: TOP, w: CONTENT_W, h: H, rot: 0 }]),
  arrangement('cells-2', 'cellsTwo', [
    { x: MARGIN, y: TOP, w: halfW, h: H, rot: 0 },
    { x: MARGIN + halfW + GAP, y: TOP, w: halfW, h: H, rot: 0 },
  ]),
  arrangement('cells-3', 'cellsThree', [
    { x: MARGIN, y: TOP, w: CONTENT_W, h: halfH, rot: 0 },
    { x: MARGIN, y: TOP + halfH + GAP, w: halfW, h: halfH, rot: 0 },
    { x: MARGIN + halfW + GAP, y: TOP + halfH + GAP, w: halfW, h: halfH, rot: 0 },
  ]),
  arrangement('cells-4', 'cellsFour', [
    { x: MARGIN, y: TOP, w: halfW, h: halfH, rot: 0 },
    { x: MARGIN + halfW + GAP, y: TOP, w: halfW, h: halfH, rot: 0 },
    { x: MARGIN, y: TOP + halfH + GAP, w: halfW, h: halfH, rot: 0 },
    { x: MARGIN + halfW + GAP, y: TOP + halfH + GAP, w: halfW, h: halfH, rot: 0 },
  ]),
  arrangement('cells-5', 'cellsFive', [
    { x: MARGIN, y: TOP, w: halfW, h: halfH, rot: 0 },
    { x: MARGIN + halfW + GAP, y: TOP, w: halfW, h: halfH, rot: 0 },
    { x: MARGIN, y: TOP + halfH + GAP, w: thirdW, h: halfH, rot: 0 },
    { x: MARGIN + thirdW + GAP, y: TOP + halfH + GAP, w: thirdW, h: halfH, rot: 0 },
    { x: MARGIN + (thirdW + GAP) * 2, y: TOP + halfH + GAP, w: thirdW, h: halfH, rot: 0 },
  ]),
  arrangement(
    'cells-6',
    'cellsSix',
    [0, 1].flatMap((row) =>
      [0, 1, 2].map((col) => ({
        x: MARGIN + col * (thirdW + GAP),
        y: TOP + row * (halfH + GAP),
        w: thirdW,
        h: halfH,
        rot: 0,
      })),
    ),
  ),
];

export const visionBoard: PageTypeDef = {
  type: 'vision-board',
  textFlow: false,
  cellExpansion: true,
  defaultTemplateId: 'cells-3',
  templates: visionBoardTemplates,
};
