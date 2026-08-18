import { useEffect, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { strings } from '../../config';
import { CANVAS_W, type Board, type OutputTarget, type Page } from '../../domain/types';
import { useBoardContext } from '../board/BoardContext';
import { deletePage, duplicatePage, movePageInRail, setInclude } from './boardOps';
import { PageView } from './PageView';

type PageTypeStrings = Record<string, { name: string }>;

// On desktop the rail is the vertical thumbnail column. On a phone it
// becomes a horizontal strip across the top so the canvas keeps the
// full width.
function useIsWide(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => setWide(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return wide;
}

export function PageRail({
  board,
  selectedPageId,
  onSelect,
  onDeleted,
}: {
  board: Board;
  selectedPageId: string | null;
  onSelect: (id: string) => void;
  onDeleted: () => void;
}) {
  const { mutate } = useBoardContext();
  const wide = useIsWide();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const over = e.over;
    if (!over || e.active.id === over.id) return;
    const toIndex = board.pages.findIndex((p) => p.id === over.id);
    mutate((b) => movePageInRail(b, String(e.active.id), toIndex));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext
        items={board.pages.map((p) => p.id)}
        strategy={wide ? verticalListSortingStrategy : horizontalListSortingStrategy}
      >
        <div
          className={
            wide
              ? 'flex h-full w-44 shrink-0 flex-col gap-2 overflow-y-auto border-r border-text-muted/15 bg-surface/40 p-2'
              : 'flex w-full shrink-0 flex-row gap-2 overflow-x-auto border-b border-text-muted/15 bg-surface/40 p-2'
          }
        >
          {board.pages.map((page) => (
            <RailItem
              key={page.id}
              board={board}
              page={page}
              wide={wide}
              selected={page.id === selectedPageId}
              onSelect={() => onSelect(page.id)}
              onDeleted={onDeleted}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function RailItem({
  board,
  page,
  wide,
  selected,
  onSelect,
  onDeleted,
}: {
  board: Board;
  page: Page;
  wide: boolean;
  selected: boolean;
  onSelect: () => void;
  onDeleted: () => void;
}) {
  const { mutate } = useBoardContext();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });
  const typeName = (strings.pageTypes as PageTypeStrings)[page.type]?.name ?? page.type;
  const thumbW = wide ? 104 : 56;
  const scale = thumbW / CANVAS_W;

  const toggles: { key: OutputTarget; label: string }[] = [
    { key: 'morning', label: strings.editor.includeMorning[0] },
    { key: 'evening', label: strings.editor.includeEvening[0] },
    { key: 'pdf', label: strings.editor.includePdf[0] },
    { key: 'html', label: strings.editor.includeHtml[0] },
  ];

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
      className={`group shrink-0 rounded border p-1.5 ${
        selected ? 'border-primary bg-surface' : 'border-transparent hover:border-text-muted/30'
      }`}
    >
      <button type="button" className="block w-full text-left" onClick={onSelect} {...attributes} {...listeners}>
        <div
          className="pointer-events-none relative mx-auto overflow-hidden rounded-sm border border-text-muted/20"
          style={{ width: thumbW, height: thumbW * (1650 / 1275) }}
        >
          <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            <PageView board={board} page={page} variant="thumb" />
          </div>
        </div>
        {wide && (
          <>
            <div className="mt-1 truncate font-body text-xs text-text">{page.title || typeName}</div>
            <div className="truncate font-body text-[10px] text-text-muted">{typeName}</div>
          </>
        )}
        {!wide && (
          <div className="mt-0.5 w-14 truncate text-center font-body text-[9px] text-text-muted">
            {page.title || typeName}
          </div>
        )}
      </button>
      {wide && (
        <div className="mt-1 flex items-center justify-between">
          <div className="flex gap-0.5">
            {toggles.map((t) => (
              <button
                key={t.key}
                type="button"
                title={t.key}
                onClick={() => mutate((b) => setInclude(b, page.id, t.key, !page.include[t.key]))}
                className={`h-4 w-4 rounded-sm font-body text-[9px] leading-4 ${
                  page.include[t.key] ? 'bg-primary/80 text-background' : 'bg-text-muted/20 text-text-muted'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              title={strings.editor.duplicatePage}
              className="rounded px-1 font-body text-[10px] text-text-muted hover:bg-surface hover:text-text"
              onClick={() => mutate((b) => duplicatePage(b, page.id))}
            >
              ⧉
            </button>
            <button
              type="button"
              title={strings.editor.deletePage}
              className="rounded px-1 font-body text-[10px] text-text-muted hover:bg-surface hover:text-text"
              onClick={() => {
                mutate((b) => deletePage(b, page.id));
                onDeleted();
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
