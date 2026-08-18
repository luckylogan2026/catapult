import { db } from './db';
import { getPreset } from '../theme/presets';
import {
  SCHEMA_VERSION,
  type Board,
  type Page,
  type PageInclude,
  type Playlist,
} from '../domain/types';

export async function loadBoard(): Promise<Board | null> {
  const all = await db.boards.toArray();
  return all[0] ?? null;
}

// Writes the board as given. The caller stamps revision and lastEdited
// (BoardContext.apply), so undo restores also advance the revision,
// which Phase 6 sync requires.
export async function persistBoard(board: Board): Promise<Board> {
  await db.boards.put(board);
  return board;
}

function defaultPlaylist(id: Playlist['id'], name: string): Playlist {
  return {
    id,
    name,
    pageOrder: [],
    affirmationMode: 'shuffle',
    shuffleCount: 8,
    autoAdvance: true,
    dwellSeconds: 6,
    ttsEnabled: false,
  };
}

export function defaultInclude(): PageInclude {
  return { morning: true, evening: true, pdf: true, html: true };
}

export function createBoard(ownerName: string, title: string, presetId: string): Board {
  const now = new Date().toISOString();
  getPreset(presetId); // validates the id, falls back inside getPreset
  return {
    id: crypto.randomUUID(),
    schemaVersion: SCHEMA_VERSION,
    revision: 0,
    meta: { ownerName, title, version: '1.0', dateCreated: now, lastEdited: now },
    theme: { presetId },
    settings: {
      dwellSeconds: 6,
      archiveOriginals: true,
      pdfOrder: { linkedToMorning: true, pageOrder: [] },
      htmlOrder: { linkedToMorning: true, pageOrder: [] },
      ttsRate: 0.9,
      passcodeEnabled: false,
    },
    pages: [],
    affirmations: [],
    playlists: [defaultPlaylist('morning', 'Morning'), defaultPlaylist('evening', 'Evening')],
    streak: { completions: [] },
  };
}

// Keeps every order list consistent with the page set. Call after any
// mutation that adds or removes pages. New pages append to each order,
// removed pages drop out, and existing positions never move (deviation c:
// order lists contain every page, inclusion filters at render).
export function reconcileOrders(board: Board): Board {
  const ids = board.pages.map((p) => p.id);
  const idSet = new Set(ids);
  const fix = (order: string[]): string[] => {
    const kept = order.filter((id) => idSet.has(id));
    const seen = new Set(kept);
    for (const id of ids) if (!seen.has(id)) kept.push(id);
    return kept;
  };
  return {
    ...board,
    playlists: board.playlists.map((pl) => ({ ...pl, pageOrder: fix(pl.pageOrder) })),
    settings: {
      ...board.settings,
      pdfOrder: { ...board.settings.pdfOrder, pageOrder: fix(board.settings.pdfOrder.pageOrder) },
      htmlOrder: { ...board.settings.htmlOrder, pageOrder: fix(board.settings.htmlOrder.pageOrder) },
    },
  };
}

// The effective order for a target, honoring the PDF and HTML link to
// the morning order.
export function orderForTarget(board: Board, target: 'morning' | 'evening' | 'pdf' | 'html'): string[] {
  if (target === 'morning' || target === 'evening') {
    return board.playlists.find((p) => p.id === target)?.pageOrder ?? [];
  }
  const cfg = target === 'pdf' ? board.settings.pdfOrder : board.settings.htmlOrder;
  if (cfg.linkedToMorning) return orderForTarget(board, 'morning');
  return cfg.pageOrder;
}

export function pagesForTarget(board: Board, target: 'morning' | 'evening' | 'pdf' | 'html'): Page[] {
  const byId = new Map(board.pages.map((p) => [p.id, p]));
  return orderForTarget(board, target)
    .map((id) => byId.get(id))
    .filter((p): p is Page => !!p && p.include[target]);
}
