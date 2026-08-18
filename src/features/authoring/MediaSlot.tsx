import { useRef, useState, type DragEvent } from 'react';
import { strings } from '../../config';
import { useImport } from './ImportContext';
import { MediaContent } from './MediaContent';
import { FormattedText } from './FormattedText';
import type { Block, Page } from '../../domain/types';
import type { SlotDef } from '../../pageTypes/types';

const SWAP_MIME = 'application/x-catapult-slot';

// A template slot for media. Empty: a drop zone with the prompt and the
// import methods. Filled: the media, draggable to another slot to swap,
// with a focal point drag when selected. Chapter tiles add a caption and
// a status ring in the inspector.
export function MediaSlot({
  page,
  slot,
  block,
  prompt,
  selected,
  onSelect,
  onSwap,
  onCreateEmpty,
  onPatch,
  variant,
}: {
  page: Page;
  slot: SlotDef;
  block?: Block;
  prompt: string;
  selected: boolean;
  onSelect: () => void;
  onSwap: (fromBlockId: string, toSlotId: string) => void;
  onCreateEmpty?: () => void;
  onPatch: (patch: Partial<Block>) => void;
  variant: 'canvas' | 'thumb';
}) {
  const { importFilesTo, importUrlTo } = useImport();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const panRef = useRef<{ startX: number; startY: number; focal: { x: number; y: number }; w: number; h: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const filled = !!block?.assetId;
  const target = { pageId: page.id, slotId: slot.id };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const fromId = e.dataTransfer.getData(SWAP_MIME);
    if (fromId) {
      onSwap(fromId, slot.id);
      return;
    }
    const files = [...e.dataTransfer.files];
    if (files.length) void importFilesTo(files, target);
  };

  const textTile = slot.chapterTile && !!block && !block.assetId && !!block.caption?.trim();

  if (variant === 'thumb') {
    return (
      <div className="absolute overflow-hidden" style={rectCss(slot)}>
        {filled && block ? (
          <div className="relative h-full w-full">
            <MediaContent block={block} variant="thumb" />
            {slot.chapterTile && <ChapterOverlay block={block} />}
          </div>
        ) : textTile && block ? (
          <div className="relative h-full w-full">
            <TextTile block={block} />
            <ChapterOverlay block={block} captionShown />
          </div>
        ) : (
          <div className="h-full w-full border border-dashed border-text-muted/25" />
        )}
      </div>
    );
  }

  return (
    <div
      className={`group absolute overflow-hidden ${selected ? 'ring-2 ring-primary' : ''} ${
        dragOver ? 'ring-2 ring-secondary' : ''
      }`}
      style={rectCss(slot)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {filled && block ? (
        // Selected: dragging pans the picture inside its frame (the
        // focal point), so faces stay in view. Unselected: dragging
        // moves the content to another slot to swap.
        <div
          className="relative h-full w-full"
          draggable={!selected}
          title={selected ? strings.editor.dragToReposition : undefined}
          style={selected ? { cursor: 'grab', touchAction: 'none' } : undefined}
          onDragStart={(e) => {
            e.dataTransfer.setData(SWAP_MIME, block.id);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onPointerDown={(e) => {
            if (!selected) return;
            e.stopPropagation();
            const el = e.currentTarget;
            el.setPointerCapture(e.pointerId);
            panRef.current = {
              startX: e.clientX,
              startY: e.clientY,
              focal: block.focal ?? { x: 0.5, y: 0.5 },
              w: el.clientWidth,
              h: el.clientHeight,
            };
          }}
          onPointerMove={(e) => {
            const p = panRef.current;
            if (!p) return;
            const clamp = (v: number) => Math.min(1, Math.max(0, v));
            onPatch({
              focal: {
                x: clamp(p.focal.x - (e.clientX - p.startX) / p.w),
                y: clamp(p.focal.y - (e.clientY - p.startY) / p.h),
              },
            });
          }}
          onPointerUp={(e) => {
            if (panRef.current) (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            panRef.current = null;
          }}
        >
          <MediaContent block={block} variant="canvas" />
          {slot.chapterTile && <ChapterOverlay block={block} />}
        </div>
      ) : block && slot.chapterTile ? (
        // A text chapter, or one still being written: the caption is
        // edited directly in the tile.
        <div
          className={`relative h-full w-full border p-3 ${
            textTile ? 'border-text-muted/30 bg-surface/70' : 'border-dashed border-text-muted/40 bg-surface/40'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
        >
          {selected ? (
            <textarea
              autoFocus
              value={block.caption ?? ''}
              placeholder={prompt}
              onChange={(ev) => onPatch({ caption: ev.target.value })}
              onClick={(ev) => ev.stopPropagation()}
              className="h-full w-full resize-none bg-transparent font-body text-[26px] leading-snug text-text outline-none placeholder:text-text-muted/50"
              style={{ textAlign: block.style?.align ?? 'left' }}
            />
          ) : block.caption?.trim() ? (
            <div className="h-full w-full overflow-y-auto">
              <FormattedText
                text={block.caption}
                style={{
                  fontFamily: 'var(--tc-font-body)',
                  fontSize: 26,
                  lineHeight: 1.35,
                  color: 'var(--tc-text)',
                  textAlign: (block.style?.align ?? 'left') as React.CSSProperties['textAlign'],
                }}
              />
            </div>
          ) : (
            <span className="font-body text-[26px] text-text-muted/60">{prompt}</span>
          )}
          <ChapterOverlay block={block} captionShown />
        </div>
      ) : (
        <button
          type="button"
          className="flex h-full w-full flex-col items-center justify-center gap-2 border border-dashed border-text-muted/40 bg-surface/40 p-3 text-center"
          onClick={(e) => {
            e.stopPropagation();
            if (slot.chapterTile) onCreateEmpty?.();
            else {
              onSelect();
              fileRef.current?.click();
            }
          }}
        >
          <span className="font-body text-[26px] text-text-muted">{prompt}</span>
          <span className="font-body text-[20px] text-text-muted/70">
            {slot.chapterTile ? strings.editor.chapterAddText : strings.import.dropHere}
          </span>
        </button>
      )}

      {selected && (
        <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-1 rounded bg-background/85 p-1">
          <SlotButton label={strings.import.fromFiles} onClick={() => fileRef.current?.click()} />
          <SlotButton label={strings.import.fromCamera} onClick={() => cameraRef.current?.click()} />
          <SlotButton
            label={strings.import.fromUrl}
            onClick={() => {
              const url = window.prompt(strings.import.urlPrompt);
              if (url) void importUrlTo(url, target);
            }}
          />
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) void importFilesTo(files, target);
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) void importFilesTo(files, target);
        }}
      />
    </div>
  );
}

function SlotButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="rounded px-2 py-1 font-body text-[22px] text-text hover:bg-surface"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {label}
    </button>
  );
}

// A caption-only chapter: the caption becomes the tile itself.
function TextTile({ block }: { block: Block }) {
  return (
    <div className="h-full w-full overflow-hidden border border-text-muted/30 bg-surface/70 p-3">
      <FormattedText
        text={block.caption ?? ''}
        style={{
          fontFamily: 'var(--tc-font-body)',
          fontSize: 26,
          lineHeight: 1.35,
          color: 'var(--tc-text)',
          textAlign: (block.style?.align ?? 'left') as React.CSSProperties['textAlign'],
        }}
      />
    </div>
  );
}

// Chapter tiles carry a caption bar and a status treatment. Achieved
// tiles get the gold ring and mark; the rest stay quiet.
function ChapterOverlay({ block, captionShown }: { block: Block; captionShown?: boolean }) {
  const status = block.chapter?.status;
  return (
    <>
      {block.caption && !captionShown && (
        <div className="absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1 font-body text-[22px] leading-tight text-white">
          {block.caption}
        </div>
      )}
      {status === 'achieved' && (
        <>
          <div className="pointer-events-none absolute inset-0 border-[3px] border-primary" />
          <span className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-primary font-body text-[18px] text-background">
            ✓
          </span>
        </>
      )}
    </>
  );
}

function rectCss(slot: SlotDef): React.CSSProperties {
  return {
    left: slot.rect.x,
    top: slot.rect.y,
    width: slot.rect.w,
    height: slot.rect.h,
  };
}
