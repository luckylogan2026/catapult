import { CANVAS_H, CANVAS_W } from '../domain/types';
import type { SlotDef } from './types';

// Shared layout constants for the standard templates, in canvas units on
// the 1275 x 1650 page.
export const MARGIN = 96;
export const CONTENT_W = CANVAS_W - MARGIN * 2;
export const TITLE_Y = MARGIN;
export const TITLE_H = 120;
export const SUBTITLE_Y = TITLE_Y + TITLE_H + 12;
export const SUBTITLE_H = 52;
export const BODY_Y = SUBTITLE_Y + SUBTITLE_H + 48;
export const BODY_H = CANVAS_H - BODY_Y - MARGIN;

export function titleSlot(promptKey = 'title'): SlotDef {
  return {
    id: 'title',
    kind: 'text',
    promptKey,
    rect: { x: MARGIN, y: TITLE_Y, w: CONTENT_W, h: TITLE_H, rot: 0 },
    textStyle: { fontFamily: 'heading', fontSize: 84, weight: 600, align: 'left' },
  };
}

export function subtitleSlot(promptKey = 'subtitle'): SlotDef {
  return {
    id: 'subtitle',
    kind: 'text',
    promptKey,
    rect: { x: MARGIN, y: SUBTITLE_Y, w: CONTENT_W, h: SUBTITLE_H, rot: 0 },
    textStyle: { fontFamily: 'body', fontSize: 30, weight: 500, align: 'left', color: 'muted' },
  };
}

export function bodySlot(promptKey = 'body', y = BODY_Y, h = BODY_H): SlotDef {
  return {
    id: 'body',
    kind: 'text',
    promptKey,
    rect: { x: MARGIN, y, w: CONTENT_W, h, rot: 0 },
    textStyle: { fontFamily: 'body', fontSize: 34, weight: 400, align: 'left', lineHeight: 1.6 },
  };
}
