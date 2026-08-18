import { brand, strings } from '../../config';
import type { Block, Board, ChapterStatus, Page } from '../../domain/types';
import { useBoardContext } from '../board/BoardContext';
import { removeBlock, removeItemBlock, updateBlock, addPage, createPage } from './boardOps';
import { getPageTypeDef } from '../../pageTypes/registry';
import { useAssetUrl } from './useAssetUrl';

const e = strings.editor;

// Controls for the selected block, shown under the page inspector strip.
export function BlockInspector({ page, block }: { board: Board; page: Page; block: Block }) {
  const { mutate } = useBoardContext();
  const def = getPageTypeDef(page.type);
  const isItem = !!block.slotId?.startsWith('item-');
  const patch = (p: Partial<Block>) => mutate((b) => updateBlock(b, page.id, block.id, p));

  const slot = def.templates
    .find((t) => t.id === page.templateId)
    ?.slots.find((s) => s.id === block.slotId);
  const isChapterTile = !!slot?.chapterTile;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-text-muted/15 bg-surface/60 px-4 py-2">
      {block.kind === 'text' && (
        <>
          <label className="flex items-center gap-1 font-body text-xs text-text-muted">
            Aa
            <input
              type="number"
              min={16}
              max={200}
              value={block.style?.fontSize ?? 34}
              onChange={(ev) => patch({ style: { ...block.style, fontSize: Number(ev.target.value) } })}
              className="w-16 rounded border border-text-muted/30 bg-background px-1 py-0.5 text-text"
            />
          </label>
          <div className="flex overflow-hidden rounded border border-text-muted/30">
            {(['left', 'center', 'right'] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => patch({ style: { ...block.style, align: a } })}
                className={`px-2 py-0.5 font-body text-xs ${
                  (block.style?.align ?? 'left') === a ? 'bg-primary text-background' : 'text-text-muted'
                }`}
              >
                {a[0].toUpperCase()}
              </button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded border border-text-muted/30">
            <button
              type="button"
              title={e.bulletList}
              onClick={() => patch({ text: toggleListPrefix(block.text ?? '', 'bullet') })}
              className="px-2 py-0.5 font-body text-xs text-text-muted hover:text-text"
            >
              • {e.bulletList}
            </button>
            <button
              type="button"
              title={e.numberList}
              onClick={() => patch({ text: toggleListPrefix(block.text ?? '', 'number') })}
              className="px-2 py-0.5 font-body text-xs text-text-muted hover:text-text"
            >
              1. {e.numberList}
            </button>
          </div>
          <ColorControl block={block} onPatch={patch} />
          <label className="flex items-center gap-1.5 font-body text-xs text-text-muted">
            <input
              type="checkbox"
              checked={block.style?.shadow ?? false}
              onChange={(ev) => patch({ style: { ...block.style, shadow: ev.target.checked } })}
              className="h-3.5 w-3.5 accent-[var(--tc-primary)]"
            />
            {e.textShadowLabel}
          </label>
        </>
      )}

      {(block.kind === 'image' || block.kind === 'video') && block.assetId && (
        <>
          <FocalPicker block={block} onChange={(focal) => patch({ focal })} />
          <div className="flex overflow-hidden rounded border border-text-muted/30">
            {(['cover', 'contain'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => patch({ fit: f })}
                className={`px-2 py-0.5 font-body text-xs ${
                  (block.fit ?? 'cover') === f ? 'bg-primary text-background' : 'text-text-muted'
                }`}
              >
                {f === 'cover' ? e.fitFill : e.fitContain}
              </button>
            ))}
          </div>
          {block.kind === 'image' && (
            <label className="flex items-center gap-1.5 font-body text-xs text-text-muted">
              <input
                type="checkbox"
                checked={block.kenBurns?.enabled ?? false}
                onChange={(ev) =>
                  patch({
                    kenBurns: {
                      enabled: ev.target.checked,
                      from: block.kenBurns?.from ?? { x: 0, y: 0, w: 1, h: 1 },
                      to: block.kenBurns?.to ?? { x: 0.05, y: 0.05, w: 0.9, h: 0.9 },
                      durationMs: block.kenBurns?.durationMs ?? 8000,
                    },
                  })
                }
                className="h-3.5 w-3.5 accent-[var(--tc-primary)]"
              />
              {e.kenBurnsLabel}
            </label>
          )}
          <button
            type="button"
            className="rounded border border-text-muted/30 px-2 py-0.5 font-body text-xs text-text-muted hover:text-text"
            onClick={() => patch({ assetId: undefined })}
          >
            {strings.common.remove}
          </button>
        </>
      )}

      {isChapterTile && (
        <ChapterControls block={block} onPatch={patch} />
      )}

      {page.layout === 'canvas' && (
        <div className="flex gap-1">
          <button
            type="button"
            title="z+"
            className="rounded border border-text-muted/30 px-2 py-0.5 font-body text-xs text-text-muted"
            onClick={() => patch({ z: block.z + 1 })}
          >
            ↥
          </button>
          <button
            type="button"
            title="z-"
            className="rounded border border-text-muted/30 px-2 py-0.5 font-body text-xs text-text-muted"
            onClick={() => patch({ z: Math.max(0, block.z - 1) })}
          >
            ↧
          </button>
        </div>
      )}

      {(isItem || page.layout === 'canvas') && (
        <button
          type="button"
          className="ml-auto rounded border border-text-muted/30 px-2 py-0.5 font-body text-xs text-text-muted hover:text-text"
          onClick={() =>
            mutate((b) => (isItem ? removeItemBlock(b, page.id, block.id) : removeBlock(b, page.id, block.id)))
          }
        >
          {isItem ? e.removeItem : strings.common.delete}
        </button>
      )}
    </div>
  );
}

// Turns the block's lines into a bullet or numbered list, or back to
// plain lines when they already are one. Empty lines stay as paragraph
// breaks either way.
function toggleListPrefix(text: string, kind: 'bullet' | 'number'): string {
  const lines = text.split('\n');
  const content = lines.filter((l) => l.trim());
  const strip = (l: string) => l.replace(/^\s*[-*]\s+/, '').replace(/^\s*\d+[.)]\s+/, '');
  const already =
    content.length > 0 &&
    content.every((l) => (kind === 'bullet' ? /^\s*[-*]\s+/.test(l) : /^\s*\d+[.)]\s+/.test(l)));
  let n = 0;
  return lines
    .map((l) => {
      if (!l.trim()) return l;
      const bare = strip(l);
      if (already) return bare;
      n += 1;
      return kind === 'bullet' ? `- ${bare}` : `${n}. ${bare}`;
    })
    .join('\n');
}

// Text color: the theme roles plus white, black, and a free custom pick.
// Roles keep following the theme; a custom hex is fixed.
function ColorControl({ block, onPatch }: { block: Block; onPatch: (p: Partial<Block>) => void }) {
  const current = block.style?.color;
  const swatches: { value: string | undefined; css: string; label: string }[] = [
    { value: undefined, css: 'var(--tc-text)', label: 'text' },
    { value: 'muted', css: 'var(--tc-text-muted)', label: 'muted' },
    { value: 'var(--tc-primary)', css: 'var(--tc-primary)', label: 'accent' },
    { value: 'var(--tc-secondary)', css: 'var(--tc-secondary)', label: 'secondary' },
    { value: '#FFFFFF', css: '#FFFFFF', label: 'white' },
    { value: '#111111', css: '#111111', label: 'black' },
  ];
  return (
    <div className="flex items-center gap-1" title={e.textColorLabel}>
      {swatches.map((s) => (
        <button
          key={s.label}
          type="button"
          title={s.label}
          onClick={() => onPatch({ style: { ...block.style, color: s.value } })}
          className={`h-5 w-5 rounded-full border ${
            current === s.value ? 'border-primary ring-1 ring-primary' : 'border-text-muted/40'
          }`}
          style={{ background: s.css }}
        />
      ))}
      <input
        type="color"
        value={/^#[0-9a-fA-F]{6}$/.test(current ?? '') ? (current as string) : brand.palette.primary}
        onChange={(ev) => onPatch({ style: { ...block.style, color: ev.target.value } })}
        className="h-5 w-6 cursor-pointer rounded border border-text-muted/40 bg-transparent p-0"
        title={e.textColorLabel}
      />
    </div>
  );
}

// Click or drag inside the mini preview to set the cover-fit focal point.
function FocalPicker({ block, onChange }: { block: Block; onChange: (f: { x: number; y: number }) => void }) {
  const { url } = useAssetUrl(block.assetId, block.kind === 'video' ? 'poster' : 'thumb');
  if (!url) return null;
  const focal = block.focal ?? { x: 0.5, y: 0.5 };
  const set = (ev: React.PointerEvent<HTMLDivElement>) => {
    const r = ev.currentTarget.getBoundingClientRect();
    onChange({
      x: Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)),
    });
  };
  return (
    <div
      title={e.focalHint}
      className="relative h-12 w-16 cursor-crosshair overflow-hidden rounded border border-text-muted/30"
      onPointerDown={(ev) => {
        ev.currentTarget.setPointerCapture(ev.pointerId);
        set(ev);
      }}
      onPointerMove={(ev) => ev.buttons === 1 && set(ev)}
    >
      <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />
      <span
        className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-background/60"
        style={{ left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }}
      />
    </div>
  );
}

function ChapterControls({
  block,
  onPatch,
}: {
  block: Block;
  onPatch: (p: Partial<Block>) => void;
}) {
  const { mutate } = useBoardContext();
  const status = block.chapter?.status ?? 'future';
  const labels: Record<ChapterStatus, string> = {
    past: e.chapterPast,
    future: e.chapterFuture,
    achieved: e.chapterAchieved,
  };

  const setStatus = (next: ChapterStatus) => {
    onPatch({
      chapter: {
        status: next,
        achievedDate: next === 'achieved' ? new Date().toISOString() : block.chapter?.achievedDate,
      },
    });
    // Marking achieved offers to mirror the tile onto the Legacy page.
    if (next === 'achieved' && block.assetId && window.confirm(e.mirrorToLegacy)) {
      mutate((b) => {
        let legacy = b.pages.find((p) => p.type === 'legacy');
        let next2 = b;
        if (!legacy) {
          legacy = createPage('legacy', (strings.pageTypes as Record<string, { name: string }>)['legacy'].name);
          next2 = addPage(b, legacy);
        }
        const target = next2.pages.find((p) => p.id === legacy!.id)!;
        const slots = getPageTypeDef('legacy').templates.find((t) => t.id === target.templateId)!.slots;
        const empty = slots.find(
          (s) => s.kind === 'media' && !target.blocks.some((bl) => bl.slotId === s.id && bl.assetId),
        );
        if (!empty) return next2;
        const mirrored = {
          id: crypto.randomUUID(),
          kind: block.kind,
          slotId: empty.id,
          assetId: block.assetId,
          caption: block.caption,
          rect: { ...empty.rect },
          z: Math.max(0, ...target.blocks.map((bl) => bl.z)) + 1,
          focal: block.focal,
        };
        return {
          ...next2,
          pages: next2.pages.map((p) =>
            p.id === target.id ? { ...p, blocks: [...p.blocks, mirrored] } : p,
          ),
        };
      });
    }
  };

  return (
    <>
      <input
        value={block.caption ?? ''}
        placeholder={strings.pageTypes.chapters.slots.tile}
        onChange={(ev) => onPatch({ caption: ev.target.value })}
        className="w-40 rounded border border-text-muted/30 bg-background px-2 py-0.5 font-body text-xs text-text"
      />
      {!block.assetId && (
        <>
          <div className="flex overflow-hidden rounded border border-text-muted/30">
            {(['left', 'center', 'right'] as const).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => onPatch({ style: { ...block.style, align: a } })}
                className={`px-2 py-0.5 font-body text-xs ${
                  (block.style?.align ?? 'left') === a ? 'bg-primary text-background' : 'text-text-muted'
                }`}
              >
                {a[0].toUpperCase()}
              </button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded border border-text-muted/30">
            <button
              type="button"
              onClick={() => onPatch({ caption: toggleListPrefix(block.caption ?? '', 'bullet') })}
              className="px-2 py-0.5 font-body text-xs text-text-muted hover:text-text"
            >
              • {e.bulletList}
            </button>
            <button
              type="button"
              onClick={() => onPatch({ caption: toggleListPrefix(block.caption ?? '', 'number') })}
              className="px-2 py-0.5 font-body text-xs text-text-muted hover:text-text"
            >
              1. {e.numberList}
            </button>
          </div>
        </>
      )}
      <div className="flex overflow-hidden rounded border border-text-muted/30">
        {(Object.keys(labels) as ChapterStatus[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setStatus(k)}
            className={`px-2 py-0.5 font-body text-xs ${
              status === k ? 'bg-primary text-background' : 'text-text-muted'
            }`}
          >
            {labels[k]}
          </button>
        ))}
      </div>
    </>
  );
}
