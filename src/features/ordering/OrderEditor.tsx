import { useState } from 'react';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { strings } from '../../config';
import { CANVAS_W, type Board, type OutputTarget, type Page } from '../../domain/types';
import { useBoardContext } from '../board/BoardContext';
import { orderForTarget } from '../../db/boardRepo';
import {
  moveInTargetOrder,
  setInclude,
  setTargetLinked,
  setTargetOrder,
} from '../authoring/boardOps';
import { PageView } from '../authoring/PageView';

const o = strings.order;
type PageTypeStrings = Record<string, { name: string }>;

// The dedicated ordering screen. Four targets, each with its own full
// order list (every page, included or not, so exclusion preserves
// position). Drag works, and the move buttons are first-class because
// dragging a thirty item list on a phone is miserable.
export function OrderEditor({ onBack }: { onBack: () => void }) {
  const { board, mutate } = useBoardContext();
  const [target, setTarget] = useState<OutputTarget>('morning');
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  if (!board) return null;

  const linked =
    target === 'pdf'
      ? board.settings.pdfOrder.linkedToMorning
      : target === 'html'
        ? board.settings.htmlOrder.linkedToMorning
        : false;
  const orderEditable = !(target === 'pdf' || target === 'html') || !linked;
  const order = orderForTarget(board, target);
  const byId = new Map(board.pages.map((p) => [p.id, p]));
  const rows = order.map((id) => byId.get(id)).filter((p): p is Page => !!p);

  const tabs: { key: OutputTarget; label: string }[] = [
    { key: 'morning', label: o.targetMorning },
    { key: 'evening', label: o.targetEvening },
    { key: 'pdf', label: o.targetPdf },
    { key: 'html', label: o.targetHtml },
  ];

  const onDragEnd = (e: DragEndEvent) => {
    if (!orderEditable) return;
    const overId = e.over?.id;
    if (!overId || e.active.id === overId) return;
    const from = order.indexOf(String(e.active.id));
    const to = order.indexOf(String(overId));
    if (from < 0 || to < 0) return;
    mutate((b) => setTargetOrder(b, target, arrayMove(order, from, to)));
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-text-muted/15 px-4 py-2">
        <button
          type="button"
          onClick={onBack}
          className="rounded border border-text-muted/30 px-2.5 py-1.5 font-body text-xs text-text-muted hover:text-text"
        >
          {strings.common.back}
        </button>
        <h1 className="font-heading text-lg text-primary">{o.title}</h1>
      </header>

      <div className="flex gap-1 border-b border-text-muted/15 px-4 py-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTarget(t.key)}
            className={`rounded px-3 py-1.5 font-body text-sm ${
              target === t.key ? 'bg-primary font-medium text-background' : 'text-text-muted hover:text-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {(target === 'pdf' || target === 'html') && (
        <div className="flex items-center gap-3 border-b border-text-muted/15 bg-surface/40 px-4 py-2">
          <span className="font-body text-xs text-text-muted">{linked ? o.linkedToMorning : ''}</span>
          <button
            type="button"
            className="rounded border border-text-muted/30 px-2 py-1 font-body text-xs text-text-muted hover:text-text"
            onClick={() => mutate((b) => setTargetLinked(b, target as 'pdf' | 'html', !linked))}
          >
            {linked ? o.unlink : o.relink}
          </button>
        </div>
      )}

      <div className="min-h-0 grow overflow-y-auto p-4">
        {rows.length === 0 ? (
          <p className="font-body text-sm text-text-muted">{o.empty}</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={rows.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              <div className="mx-auto flex max-w-2xl flex-col gap-1.5">
                {rows.map((page, i) => (
                  <OrderRow
                    key={page.id}
                    board={board}
                    page={page}
                    target={target}
                    index={i}
                    count={rows.length}
                    draggable={orderEditable}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}

function OrderRow({
  board,
  page,
  target,
  index,
  count,
  draggable,
}: {
  board: Board;
  page: Page;
  target: OutputTarget;
  index: number;
  count: number;
  draggable: boolean;
}) {
  const { mutate } = useBoardContext();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
    disabled: !draggable,
  });
  const included = page.include[target];
  const typeName = (strings.pageTypes as PageTypeStrings)[page.type]?.name ?? page.type;
  const thumbW = 56;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
      className={`flex items-center gap-3 rounded border px-2 py-1.5 ${
        included ? 'border-text-muted/20 bg-surface/50' : 'border-text-muted/10 opacity-55'
      }`}
    >
      <div
        className="relative shrink-0 cursor-grab touch-none overflow-hidden rounded-sm border border-text-muted/20"
        style={{ width: thumbW, height: thumbW * (1650 / 1275) }}
        {...attributes}
        {...listeners}
      >
        <div style={{ transform: `scale(${thumbW / CANVAS_W})`, transformOrigin: 'top left' }}>
          <PageView board={board} page={page} variant="thumb" />
        </div>
      </div>
      <div className="min-w-0 grow">
        <div className="truncate font-body text-sm text-text">{page.title || typeName}</div>
        <div className="truncate font-body text-xs text-text-muted">
          {typeName}
          {!included ? ` · ${o.excluded}` : ''}
        </div>
      </div>
      <label className="flex items-center gap-1 font-body text-[11px] text-text-muted">
        <input
          type="checkbox"
          checked={included}
          onChange={(ev) => mutate((b) => setInclude(b, page.id, target, ev.target.checked))}
          className="h-3.5 w-3.5 accent-[var(--tc-primary)]"
        />
        {o.includeToggle}
      </label>
      <div className="flex flex-col gap-0.5">
        <button
          type="button"
          title={strings.common.moveUp}
          disabled={!draggable || index === 0}
          className="rounded border border-text-muted/30 px-1.5 font-body text-xs text-text-muted enabled:hover:text-text disabled:opacity-30"
          onClick={() => mutate((b) => moveInTargetOrder(b, target, page.id, -1))}
        >
          ↑
        </button>
        <button
          type="button"
          title={strings.common.moveDown}
          disabled={!draggable || index === count - 1}
          className="rounded border border-text-muted/30 px-1.5 font-body text-xs text-text-muted enabled:hover:text-text disabled:opacity-30"
          onClick={() => mutate((b) => moveInTargetOrder(b, target, page.id, 1))}
        >
          ↓
        </button>
      </div>
    </div>
  );
}
