import { Fragment } from 'react';
import { strings } from '../../config';
import { CANVAS_H, CANVAS_W, type Board, type Page } from '../../domain/types';
import { getPageTypeDef, getTemplate } from '../../pageTypes/registry';
import { MediaContent } from './MediaContent';
import { MediaSlot } from './MediaSlot';
import { TextBlockView } from './TextBlockView';
import { CanvasBlockFrame, type SnapLines } from './CanvasBlockFrame';
import { textStyleCss } from './blockStyle';
import { FormattedText } from './FormattedText';
import { fontStack } from '../../theme/fontChoices';
import { appearanceVars } from '../../theme/pageAppearance';
import { swapSlots, updateBlock } from './boardOps';
import { useBoardContext } from '../board/BoardContext';

type SlotStrings = Record<string, { slots?: Record<string, string> }>;

function promptFor(page: Page, key?: string): string {
  const table = (strings.pageTypes as SlotStrings)[page.type]?.slots ?? {};
  return (key && table[key]) || strings.editor.textPlaceholder;
}

// Renders one page at natural canvas size (1275 x 1650 units). The parent
// scales it with a transform. Interactive on the working canvas, inert in
// thumbnails.
export function PageView({
  board: _board,
  page,
  variant,
  selectedBlockId,
  editingBlockId,
  onSelectBlock,
  onStartEdit,
  onEndEdit,
  scale = 1,
  snapLines,
  onSnapLines,
}: {
  board: Board;
  page: Page;
  variant: 'canvas' | 'thumb' | 'play';
  selectedBlockId?: string | null;
  editingBlockId?: string | null;
  onSelectBlock?: (id: string | null) => void;
  onStartEdit?: (id: string) => void;
  onEndEdit?: () => void;
  scale?: number;
  snapLines?: SnapLines | null;
  onSnapLines?: (l: SnapLines | null) => void;
}) {
  const { mutate } = useBoardContext();
  const def = getPageTypeDef(page.type);
  const template = getTemplate(def, page.templateId);
  const interactive = variant === 'canvas';

  const pageH = Math.max(
    CANVAS_H,
    ...page.blocks.map((b) => b.rect.y + b.rect.h + 96),
  );

  const commitText = (blockId: string, text: string) => {
    mutate((b) => updateBlock(b, page.id, blockId, { text }));
    onEndEdit?.();
  };

  const body =
    page.layout === 'canvas' ? (
      // Canvas layout: every block free-transforms.
      <>
        {[...page.blocks]
          .sort((a, b) => a.z - b.z)
          .map((block) => {
            const inner =
              block.kind === 'text' ? (
                <TextBlockView
                  block={block}
                  editing={editingBlockId === block.id}
                  selected={selectedBlockId === block.id}
                  onStartEdit={() => onStartEdit?.(block.id)}
                  onCommit={(t) => commitText(block.id, t)}
                />
              ) : (
                <MediaContent block={block} variant={variant === "canvas" ? "canvas" : variant === "play" ? "canvas" : "thumb"} kenBurns={variant === "play" && block.kind === "image" && !!block.kenBurns?.enabled} />
              );
            if (!interactive) {
              return (
                <div
                  key={block.id}
                  className="absolute overflow-hidden"
                  style={{
                    left: block.rect.x,
                    top: block.rect.y,
                    width: block.rect.w,
                    height: block.rect.h,
                    transform: `rotate(${block.rect.rot}deg)`,
                    zIndex: block.z,
                  }}
                >
                  {inner}
                </div>
              );
            }
            return (
              <CanvasBlockFrame
                key={block.id}
                block={block}
                siblings={page.blocks}
                scale={scale}
                selected={selectedBlockId === block.id}
                onSelect={() => onSelectBlock?.(block.id)}
                onChange={(rect) => mutate((b) => updateBlock(b, page.id, block.id, { rect }))}
                onSnapLines={(l) => onSnapLines?.(l)}
              >
                {block.kind === 'text' && editingBlockId === block.id ? (
                  <div className="pointer-events-auto h-full w-full">
                    <TextBlockView
                      block={block}
                      editing
                      selected
                      onStartEdit={() => {}}
                      onCommit={(t) => commitText(block.id, t)}
                    />
                  </div>
                ) : (
                  inner
                )}
              </CanvasBlockFrame>
            );
          })}
        {interactive && snapLines?.v !== undefined && (
          <div className="absolute top-0 h-full w-px bg-primary/70" style={{ left: snapLines.v }} />
        )}
        {interactive && snapLines?.h !== undefined && (
          <div className="absolute left-0 h-px w-full bg-primary/70" style={{ top: snapLines.h }} />
        )}
      </>
    ) : (
      // Template layout: slots position everything.
      <>
        {template.slots.map((slot) => {
          const block = page.blocks.find((b) => b.slotId === slot.id);
          if (slot.kind === 'media') {
            return (
              <MediaSlot
                key={slot.id}
                page={page}
                slot={slot}
                block={block}
                prompt={promptFor(page, slot.promptKey)}
                selected={interactive && !!block && selectedBlockId === block.id}
                onSelect={() => block && onSelectBlock?.(block.id)}
                onSwap={(fromId, toSlot) => mutate((b) => swapSlots(b, page.id, fromId, toSlot))}
                onPatch={(patch) => block && mutate((b) => updateBlock(b, page.id, block.id, patch))}
                onCreateEmpty={() => {
                  const id = crypto.randomUUID();
                  mutate((b) => ({
                    ...b,
                    pages: b.pages.map((p) =>
                      p.id === page.id
                        ? {
                            ...p,
                            blocks: [
                              ...p.blocks,
                              {
                                id,
                                kind: 'image' as const,
                                slotId: slot.id,
                                rect: { ...slot.rect },
                                z: template.slots.findIndex((s) => s.id === slot.id),
                                chapter: { status: 'future' as const },
                              },
                            ],
                          }
                        : p,
                    ),
                  }));
                  onSelectBlock?.(id);
                }}
                variant={variant}
              />
            );
          }
          if (!block) return <Fragment key={slot.id} />;
          return (
            <div
              key={slot.id}
              className={`absolute ${interactive ? 'overflow-y-auto' : 'overflow-hidden'}`}
              style={{
                left: slot.rect.x,
                top: slot.rect.y,
                width: slot.rect.w,
                height: slot.rect.h,
                zIndex: block.z,
              }}
              onClick={(e) => {
                if (!interactive) return;
                e.stopPropagation();
                onSelectBlock?.(block.id);
              }}
            >
              {interactive ? (
                <TextBlockView
                  block={block}
                  placeholder={promptFor(page, slot.promptKey)}
                  editing={editingBlockId === block.id}
                  selected={selectedBlockId === block.id}
                  onStartEdit={() => onStartEdit?.(block.id)}
                  onCommit={(t) => commitText(block.id, t)}
                />
              ) : (
                <FormattedText text={block.text ?? ''} style={textStyleCss(block.style)} />
              )}
            </div>
          );
        })}
        {/* Item-flow blocks stack below the template slots. */}
        {page.blocks
          .filter((b) => b.slotId?.startsWith('item-'))
          .sort((a, b) => a.rect.y - b.rect.y)
          .map((block, i) => (
            <div
              key={block.id}
              className="absolute"
              style={{
                left: block.rect.x,
                top: block.rect.y,
                width: block.rect.w,
                minHeight: block.rect.h,
                zIndex: block.z,
              }}
              onClick={(e) => {
                if (!interactive) return;
                e.stopPropagation();
                onSelectBlock?.(block.id);
              }}
            >
              <div className="flex gap-4">
                <span className="shrink-0 font-heading text-[40px] text-primary">{i + 1}</span>
                <div className="min-w-0 grow">
                  {interactive ? (
                    <TextBlockView
                      block={block}
                      editing={editingBlockId === block.id}
                      selected={selectedBlockId === block.id}
                      onStartEdit={() => onStartEdit?.(block.id)}
                      onCommit={(t) => commitText(block.id, t)}
                    />
                  ) : (
                    <FormattedText text={block.text ?? ''} style={textStyleCss(block.style)} />
                  )}
                </div>
              </div>
            </div>
          ))}
      </>
    );

  // A per-page master font overrides both theme font variables locally,
  // so every text block on the page follows it.
  const fontVars = page.masterFont
    ? ({
        '--tc-font-heading': fontStack(page.masterFont),
        '--tc-font-body': fontStack(page.masterFont),
      } as React.CSSProperties)
    : undefined;

  return (
    <div
      className="relative bg-background"
      style={{ width: CANVAS_W, height: pageH, ...fontVars, ...appearanceVars(page) }}
      onClick={() => interactive && onSelectBlock?.(null)}
    >
      {body}
    </div>
  );
}
