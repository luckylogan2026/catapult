import { useRef, useState } from 'react';
import { strings } from '../../config';
import type { Affirmation, Board } from '../../domain/types';
import { useBoardContext } from '../board/BoardContext';
import { useImport } from './ImportContext';
import { importFiles } from '../../assetPipeline/importAssets';
import { useAssetUrl } from './useAssetUrl';
import { RecordButton } from './RecordButton';

const e = strings.editor;

// The authoring surface for affirmation pages: a manageable list, not a
// canvas. Each row is one affirmation with its paired image, emotion tag,
// and active toggle. Playback gives each active row its own screen.
// Batch paste loads many at once, one per line, and row checkboxes with
// select all support bulk deletion.
export function AffirmationEditor() {
  const { board, mutate } = useBoardContext();
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchText, setBatchText] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  if (!board) return null;
  const allSelected = board.affirmations.length > 0 && selected.size === board.affirmations.length;

  const patch = (id: string, p: Partial<Affirmation>) =>
    mutate((b: Board) => ({
      ...b,
      affirmations: b.affirmations.map((a) => (a.id === id ? { ...a, ...p } : a)),
    }));

  const addBatch = () => {
    const lines = batchText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length) {
      mutate((b: Board) => ({
        ...b,
        affirmations: [
          ...b.affirmations,
          ...lines.map((text) => ({ id: crypto.randomUUID(), text, active: true })),
        ],
      }));
    }
    setBatchText('');
    setBatchOpen(false);
  };

  const deleteSelected = () => {
    if (!selected.size || !window.confirm(e.deleteSelectedConfirm)) return;
    mutate((b: Board) => ({
      ...b,
      affirmations: b.affirmations.filter((a) => !selected.has(a.id)),
    }));
    setSelected(new Set());
  };

  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-2xl text-text">{e.affirmationListTitle}</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded border border-text-muted/30 px-3 py-1.5 font-body text-sm text-text-muted hover:text-text"
            onClick={() =>
              setSelected(allSelected ? new Set() : new Set(board.affirmations.map((a) => a.id)))
            }
          >
            {allSelected ? e.selectNone : e.selectAll}
          </button>
          {selected.size > 0 && (
            <button
              type="button"
              className="rounded border border-red-400/50 px-3 py-1.5 font-body text-sm text-red-300 hover:bg-red-400/10"
              onClick={deleteSelected}
            >
              {e.deleteSelected} ({selected.size})
            </button>
          )}
          <button
            type="button"
            className="rounded border border-text-muted/30 px-3 py-1.5 font-body text-sm text-text-muted hover:text-text"
            onClick={() => setBatchOpen(true)}
          >
            {e.affirmationAddBatch}
          </button>
          <button
            type="button"
            className="rounded bg-primary px-3 py-1.5 font-body text-sm font-medium text-background"
            onClick={() =>
              mutate((b: Board) => ({
                ...b,
                affirmations: [
                  ...b.affirmations,
                  { id: crypto.randomUUID(), text: '', active: true },
                ],
              }))
            }
          >
            {e.affirmationAdd}
          </button>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {board.affirmations.map((a) => (
          <AffirmationRow
            key={a.id}
            affirmation={a}
            checked={selected.has(a.id)}
            onCheck={(on) =>
              setSelected((prev) => {
                const next = new Set(prev);
                if (on) next.add(a.id);
                else next.delete(a.id);
                return next;
              })
            }
            onPatch={(p) => patch(a.id, p)}
          />
        ))}
      </div>

      {batchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
          onClick={() => setBatchOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-lg bg-surface p-4"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h3 className="font-heading text-lg text-text">{e.affirmationAddBatch}</h3>
            <p className="mt-1 font-body text-xs text-text-muted">{e.affirmationBatchHint}</p>
            <textarea
              autoFocus
              value={batchText}
              onChange={(ev) => setBatchText(ev.target.value)}
              rows={10}
              className="mt-3 w-full resize-y rounded border border-text-muted/30 bg-background p-2 font-body text-sm text-text outline-none focus:border-primary"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-text-muted/30 px-3 py-1.5 font-body text-sm text-text-muted"
                onClick={() => setBatchOpen(false)}
              >
                {strings.common.cancel}
              </button>
              <button
                type="button"
                className="rounded bg-primary px-3 py-1.5 font-body text-sm font-medium text-background"
                onClick={addBatch}
              >
                {e.affirmationBatchAdd}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AffirmationRow({
  affirmation,
  checked,
  onCheck,
  onPatch,
}: {
  affirmation: Affirmation;
  checked: boolean;
  onCheck: (on: boolean) => void;
  onPatch: (p: Partial<Affirmation>) => void;
}) {
  const { board, mutate } = useBoardContext();
  const { clearNotice } = useImport();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { url } = useAssetUrl(affirmation.imageAssetId, 'thumb');

  const pickImage = async (files: File[]) => {
    if (!files.length || !board) return;
    setBusy(true);
    clearNotice();
    try {
      const [r] = await importFiles(files.slice(0, 1), {
        archiveOriginals: board.settings.archiveOriginals,
      });
      if (r) onPatch({ imageAssetId: r.asset.id });
    } finally {
      setBusy(false);
    }
  };

  return (
    // Phones: the text takes its own full-width line above the controls;
    // wide screens keep the single row.
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded border border-text-muted/20 bg-surface/50 p-2 md:flex-nowrap">
      <input
        type="checkbox"
        checked={checked}
        title={e.selectAll}
        onChange={(ev) => onCheck(ev.target.checked)}
        className="h-4 w-4 accent-[var(--tc-primary)]"
      />
      <button
        type="button"
        title={e.affirmationActive}
        onClick={() => onPatch({ active: !affirmation.active })}
        className={`shrink-0 rounded-full px-2 py-0.5 font-body text-[10px] ${
          affirmation.active
            ? 'bg-primary/80 text-background'
            : 'border border-text-muted/40 text-text-muted'
        }`}
      >
        {e.affirmationActive}
      </button>
      <button
        type="button"
        className="h-12 w-12 shrink-0 overflow-hidden rounded border border-dashed border-text-muted/40 bg-background"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        title={strings.import.addMedia}
      >
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : null}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(ev) => {
          const files = [...(ev.target.files ?? [])];
          ev.target.value = '';
          void pickImage(files);
        }}
      />
      <div className="order-first w-full min-w-0 md:order-none md:w-auto md:grow">
        <input
          value={affirmation.text}
          placeholder={e.affirmationTextLabel}
          onChange={(ev) => onPatch({ text: ev.target.value })}
          className="w-full bg-transparent font-body text-text outline-none placeholder:text-text-muted/50"
        />
        {affirmation.example && (
          <span className="rounded bg-text-muted/20 px-1.5 font-body text-[10px] text-text-muted">
            {strings.editor.affirmationExampleTag}
          </span>
        )}
      </div>
      <div className="ml-auto flex items-center gap-2">
      <RecordButton onRecorded={(id) => onPatch({ audioAssetId: id })} />
      {affirmation.audioAssetId && (
        <button
          type="button"
          title={strings.common.remove}
          className="rounded border border-text-muted/30 px-1.5 py-0.5 font-body text-[10px] text-text-muted hover:text-text"
          onClick={() => onPatch({ audioAssetId: undefined })}
        >
          ♫ ✕
        </button>
      )}
      <button
        type="button"
        title={strings.common.delete}
        className="rounded px-2 py-1 font-body text-sm text-text-muted hover:text-text"
        onClick={() =>
          mutate((b: Board) => ({
            ...b,
            affirmations: b.affirmations.filter((x) => x.id !== affirmation.id),
          }))
        }
      >
        ✕
      </button>
      </div>
    </div>
  );
}
