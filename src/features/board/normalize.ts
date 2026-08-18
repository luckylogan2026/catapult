import type { Block, Board } from '../../domain/types';
import { getPageTypeDef, getTemplate, slotPrompt } from '../../pageTypes/registry';
import { strings } from '../../config';

// Template definitions evolve between app versions. This makes an
// existing board whole against the current registry: any text slot
// without a block gets an empty one, so nothing renders as a dead hole
// and typing works immediately. Media slots stay empty by design.
export function ensureTemplateBlocks(board: Board): Board {
  let changed = false;
  const pages = board.pages.map((page) => {
    const def = getPageTypeDef(page.type);
    const template = getTemplate(def, page.templateId);
    // A stale template id falls back to the first arrangement; persist
    // that resolution so the rest of the app sees a valid id.
    const templateId = template.id;
    const missing = template.slots.filter(
      (s) => s.kind === 'text' && !page.blocks.some((b) => b.slotId === s.id),
    );
    // One-time rename: boards made before the Meditation naming keep the
    // old ASP title in their page record.
    const names = strings.pageTypes as Record<string, { name: string }>;
    const title =
      page.type === 'asp-process' && page.title === 'ASP Process'
        ? names['asp-process'].name
        : page.type === 'chapters' && page.title === 'Chapters'
          ? names['chapters'].name
          : page.title;
    if (!missing.length && templateId === page.templateId && title === page.title) return page;
    changed = true;
    const maxZ = Math.max(0, ...page.blocks.map((b) => b.z));
    const added: Block[] = missing.map((s, i) => ({
      id: crypto.randomUUID(),
      kind: 'text',
      slotId: s.id,
      text: s.prefill ? slotPrompt(page.type, s.promptKey) : '',
      rect: { ...s.rect },
      z: maxZ + i + 1,
      style: s.textStyle,
    }));
    return { ...page, templateId, title, blocks: [...page.blocks, ...added] };
  });
  return changed ? { ...board, pages } : board;
}
