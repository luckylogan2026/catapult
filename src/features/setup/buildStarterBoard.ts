import starter from '../../../config/starter-template.json';
import { strings } from '../../config';
import { createBoard } from '../../db/boardRepo';
import { createPage } from '../../pageTypes/registry';
import type { Board, PageType } from '../../domain/types';

type PageTypeStrings = Record<string, { name: string }>;

// Instantiates the starter template: every page type scaffolded with its
// prompts, no personal content, and the example affirmations marked so
// one action removes them.
export function buildStarterBoard(ownerName: string, title: string, presetId: string): Board {
  const board = createBoard(ownerName, title, presetId);
  const names = strings.pageTypes as PageTypeStrings;

  board.pages = (starter.pages as { type: PageType }[]).map(({ type }) =>
    createPage(type, names[type]?.name ?? type),
  );

  // Prefill the cover from setup so the first open is not a blank page.
  const cover = board.pages.find((p) => p.type === 'cover');
  if (cover) {
    for (const block of cover.blocks) {
      if (block.slotId === 'title') block.text = title;
      if (block.slotId === 'owner') block.text = ownerName;
      if (block.slotId === 'version') block.text = board.meta.version;
    }
  }

  board.affirmations = starter.affirmations.map((text) => ({
    id: crypto.randomUUID(),
    text,
    active: true,
    example: true,
  }));

  return board;
}
