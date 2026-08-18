import type { Affirmation, Block, Board, MasterAffirmation, Page, PlaylistId } from '../../domain/types';
import { pagesForTarget } from '../../db/boardRepo';
import { getPageTypeDef } from '../../pageTypes/registry';

// Playback flattens the page list into screens. Most pages are one
// screen. Vision pages with the one-picture-per-screen toggle expand to
// one screen per filled cell. An affirmations page becomes one screen
// per drawn affirmation, and a master affirmations page one per active
// entry. The source page rides along so audio, dwell, and backdrop
// rules can look it up.

export type Screen =
  | { kind: 'page'; page: Page; textFlow: boolean }
  | { kind: 'cell'; page: Page; block: Block }
  | { kind: 'affirmation'; page: Page; affirmation: Affirmation; introPage?: Page }
  | { kind: 'master'; page: Page; entry: MasterAffirmation };

export function screenKey(s: Screen): string {
  if (s.kind === 'page') return s.page.id;
  if (s.kind === 'cell') return `${s.page.id}:${s.block.id}`;
  if (s.kind === 'affirmation') return `${s.page.id}:${s.affirmation.id}`;
  return `${s.page.id}:${s.entry.id}`;
}

// Draws the affirmations for one session: the full active pool in order,
// or a shuffled subset. The shuffle avoids repeats across sessions by
// rotating through a shuffled ring; the ring position persists in the
// caller (kv store) between sessions.
export function drawAffirmations(
  pool: Affirmation[],
  mode: 'shuffle' | 'sequential',
  count: number,
  ringSeed: number,
  ringPosition: number,
): { drawn: Affirmation[]; nextPosition: number } {
  const active = pool.filter((a) => a.active && a.text.trim());
  if (mode === 'sequential' || active.length === 0) {
    return { drawn: active, nextPosition: ringPosition };
  }
  // Seeded Fisher-Yates so every session sees the same ring order until
  // the pool itself changes.
  const ring = [...active];
  let s = ringSeed || 1;
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  for (let i = ring.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [ring[i], ring[j]] = [ring[j], ring[i]];
  }
  const n = Math.min(count, ring.length);
  const drawn: Affirmation[] = [];
  for (let i = 0; i < n; i++) {
    drawn.push(ring[(ringPosition + i) % ring.length]);
  }
  return { drawn, nextPosition: (ringPosition + n) % ring.length };
}

export function buildScreens(
  board: Board,
  playlistId: PlaylistId,
  affirmationDraw: Affirmation[],
): Screen[] {
  const pages = pagesForTarget(board, playlistId);
  const introPage = board.pages.find((p) => p.type === 'affirmations-intro');
  const screens: Screen[] = [];

  for (const page of pages) {
    const def = getPageTypeDef(page.type);

    if (def.authoring === 'affirmation-list') {
      for (const affirmation of affirmationDraw) {
        screens.push({ kind: 'affirmation', page, affirmation, introPage });
      }
      continue;
    }

    if (def.authoring === 'master-affirmation-list') {
      for (const entry of board.masterAffirmations ?? []) {
        if (entry.active && entry.text.trim()) screens.push({ kind: 'master', page, entry });
      }
      continue;
    }

    if (def.cellExpansion && page.expandCells) {
      const cells = page.blocks
        .filter((b) => b.slotId?.startsWith('cell-') && b.assetId)
        .sort((a, b) => (a.slotId ?? '').localeCompare(b.slotId ?? '', undefined, { numeric: true }));
      if (cells.length) {
        for (const block of cells) screens.push({ kind: 'cell', page, block });
        continue;
      }
    }

    screens.push({ kind: 'page', page, textFlow: def.textFlow });
  }
  return screens;
}
