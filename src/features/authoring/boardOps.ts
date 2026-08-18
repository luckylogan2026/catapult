import type { Block, Board, OutputTarget, Page } from '../../domain/types';
import { getPageTypeDef, getTemplate, createPage } from '../../pageTypes/registry';
import type { SlotDef } from '../../pageTypes/types';

// Pure board transforms. Every editor surface calls these through
// mutate(), which snapshots for undo, reconciles orders, and persists.

export function slotsOfPage(board: Board, pageId: string): SlotDef[] {
  const page = board.pages.find((p) => p.id === pageId);
  if (!page) return [];
  const def = getPageTypeDef(page.type);
  return getTemplate(def, page.templateId).slots;
}

export function updatePage(board: Board, pageId: string, patch: Partial<Page>): Board {
  return {
    ...board,
    pages: board.pages.map((p) => (p.id === pageId ? { ...p, ...patch } : p)),
  };
}

export function updateBlock(board: Board, pageId: string, blockId: string, patch: Partial<Block>): Board {
  return {
    ...board,
    pages: board.pages.map((p) =>
      p.id === pageId
        ? { ...p, blocks: p.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)) }
        : p,
    ),
  };
}

export function removeBlock(board: Board, pageId: string, blockId: string): Board {
  return {
    ...board,
    pages: board.pages.map((p) =>
      p.id === pageId ? { ...p, blocks: p.blocks.filter((b) => b.id !== blockId) } : p,
    ),
  };
}

export function addPage(board: Board, page: Page, afterId?: string): Board {
  const pages = [...board.pages];
  const at = afterId ? pages.findIndex((p) => p.id === afterId) + 1 : pages.length;
  pages.splice(at || pages.length, 0, page);
  return { ...board, pages };
}

export function deletePage(board: Board, pageId: string): Board {
  return { ...board, pages: board.pages.filter((p) => p.id !== pageId) };
}

export function duplicatePage(board: Board, pageId: string): Board {
  const src = board.pages.find((p) => p.id === pageId);
  if (!src) return board;
  const copy: Page = structuredClone(src);
  copy.id = crypto.randomUUID();
  for (const b of copy.blocks) b.id = crypto.randomUUID();
  return addPage(board, copy, pageId);
}

/** Reorders the authoring rail, which is the board.pages array itself. */
export function movePageInRail(board: Board, pageId: string, toIndex: number): Board {
  const pages = [...board.pages];
  const from = pages.findIndex((p) => p.id === pageId);
  if (from < 0) return board;
  const [page] = pages.splice(from, 1);
  pages.splice(Math.max(0, Math.min(toIndex, pages.length)), 0, page);
  return { ...board, pages };
}

/** Swaps the contents of two template slots on a page. */
export function swapSlots(board: Board, pageId: string, fromBlockId: string, toSlotId: string): Board {
  const page = board.pages.find((p) => p.id === pageId);
  if (!page) return board;
  const from = page.blocks.find((b) => b.id === fromBlockId);
  if (!from || from.slotId === toSlotId) return board;
  const slots = slotsOfPage(board, pageId);
  const fromSlot = slots.find((s) => s.id === from.slotId);
  const toSlot = slots.find((s) => s.id === toSlotId);
  if (!fromSlot || !toSlot) return board;
  const to = page.blocks.find((b) => b.slotId === toSlotId);
  const blocks = page.blocks.map((b) => {
    if (b.id === from.id) return { ...b, slotId: toSlot.id, rect: { ...toSlot.rect } };
    if (to && b.id === to.id) return { ...b, slotId: fromSlot.id, rect: { ...fromSlot.rect } };
    return b;
  });
  return { ...board, pages: board.pages.map((p) => (p.id === pageId ? { ...p, blocks } : p)) };
}

export function setInclude(board: Board, pageId: string, target: OutputTarget, on: boolean): Board {
  return {
    ...board,
    pages: board.pages.map((p) =>
      p.id === pageId ? { ...p, include: { ...p.include, [target]: on } } : p,
    ),
  };
}

/** Moves a page inside one target order list only (deviation c). */
export function moveInTargetOrder(board: Board, target: OutputTarget, pageId: string, delta: number): Board {
  const reorder = (order: string[]): string[] => {
    const i = order.indexOf(pageId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= order.length) return order;
    const next = [...order];
    next.splice(i, 1);
    next.splice(j, 0, pageId);
    return next;
  };
  return mapTargetOrder(board, target, reorder);
}

export function setTargetOrder(board: Board, target: OutputTarget, pageOrder: string[]): Board {
  return mapTargetOrder(board, target, () => pageOrder);
}

function mapTargetOrder(board: Board, target: OutputTarget, fn: (order: string[]) => string[]): Board {
  if (target === 'morning' || target === 'evening') {
    return {
      ...board,
      playlists: board.playlists.map((pl) =>
        pl.id === target ? { ...pl, pageOrder: fn(pl.pageOrder) } : pl,
      ),
    };
  }
  const key = target === 'pdf' ? ('pdfOrder' as const) : ('htmlOrder' as const);
  const cfg = board.settings[key];
  return { ...board, settings: { ...board.settings, [key]: { ...cfg, pageOrder: fn(cfg.pageOrder) } } };
}

/** Unlinking seeds the target with a copy of the current morning order. */
export function setTargetLinked(board: Board, target: 'pdf' | 'html', linked: boolean): Board {
  const key = target === 'pdf' ? ('pdfOrder' as const) : ('htmlOrder' as const);
  const morning = board.playlists.find((p) => p.id === 'morning')?.pageOrder ?? [];
  return {
    ...board,
    settings: {
      ...board.settings,
      [key]: { linkedToMorning: linked, pageOrder: linked ? board.settings[key].pageOrder : [...morning] },
    },
  };
}

/** Appends an item block for item-flow page types (principles, goals, ritual). */
export function addItemBlock(board: Board, pageId: string): Board {
  const page = board.pages.find((p) => p.id === pageId);
  if (!page) return board;
  const def = getPageTypeDef(page.type);
  const flow = def.itemFlow;
  if (!flow) return board;
  const items = page.blocks.filter((b) => b.slotId?.startsWith('item-'));
  if (flow.maxItems && items.length >= flow.maxItems) return board;
  const index = items.length;
  const block: Block = {
    id: crypto.randomUUID(),
    kind: 'text',
    slotId: `item-${index + 1}`,
    text: '',
    rect: {
      x: flow.region.x,
      y: flow.region.y + index * (flow.itemH + flow.gap),
      w: flow.region.w,
      h: flow.itemH,
      rot: 0,
    },
    z: Math.max(0, ...page.blocks.map((b) => b.z)) + 1,
    style: flow.itemStyle,
  };
  return { ...board, pages: board.pages.map((p) => (p.id === pageId ? { ...p, blocks: [...p.blocks, block] } : p)) };
}

/** Removes an item block and closes the gap below it. */
export function removeItemBlock(board: Board, pageId: string, blockId: string): Board {
  const page = board.pages.find((p) => p.id === pageId);
  if (!page) return board;
  const def = getPageTypeDef(page.type);
  const flow = def.itemFlow;
  if (!flow) return removeBlock(board, pageId, blockId);
  const items = page.blocks
    .filter((b) => b.slotId?.startsWith('item-') && b.id !== blockId)
    .sort((a, b) => a.rect.y - b.rect.y)
    .map((b, i) => ({
      ...b,
      slotId: `item-${i + 1}`,
      rect: { ...b.rect, y: flow.region.y + i * (flow.itemH + flow.gap) },
    }));
  const others = page.blocks.filter((b) => !(b.slotId?.startsWith('item-')) || b.id === blockId);
  const kept = others.filter((b) => b.id !== blockId);
  return {
    ...board,
    pages: board.pages.map((p) => (p.id === pageId ? { ...p, blocks: [...kept, ...items] } : p)),
  };
}

/** Template mode re-snap when returning from canvas layout. */
export function resnapToTemplate(board: Board, pageId: string): Board {
  const page = board.pages.find((p) => p.id === pageId);
  if (!page) return board;
  const slots = slotsOfPage(board, pageId);
  const blocks = page.blocks.map((b) => {
    const slot = b.slotId ? slots.find((s) => s.id === b.slotId) : undefined;
    return slot ? { ...b, rect: { ...slot.rect } } : b;
  });
  return {
    ...board,
    pages: board.pages.map((p) =>
      p.id === pageId ? { ...p, blocks, layout: 'template' as const } : p,
    ),
  };
}

export function clearExampleAffirmations(board: Board): Board {
  return { ...board, affirmations: board.affirmations.filter((a) => !a.example) };
}

export { createPage };
