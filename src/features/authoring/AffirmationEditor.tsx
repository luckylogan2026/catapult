import { useRef, useState } from 'react';
import { strings } from '../../config';
import type { Affirmation, Board } from '../../domain/types';
import { useBoardContext } from '../board/BoardContext';
import { useImport } from './ImportContext';
import { importFiles } from '../../assetPipeline/importAssets';
import { useAssetUrl } from './useAssetUrl';
import { clearExampleAffirmations } from './boardOps';

const e = strings.editor;

// The authoring surface for affirmation pages: a manageable list, not a
// canvas. Each row is one affirmation with its paired image, emotion tag,
// and active toggle. Playback gives each active row its own screen.
export function AffirmationEditor() {
  const { board, mutate } = useBoardContext();
  if (!board) return null;
  const hasExamples = board.affirmations.some((a) => a.example);

  const patch = (id: string, p: Partial<Affirmation>) =>
    mutate((b: Board) => ({
      ...b,
      affirmations: b.affirmations.map((a) => (a.id === id ? { ...a, ...p } : a)),
    }));

  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-2xl text-text">{e.affirmationListTitle}</h2>
        <div className="flex gap-2">
          {hasExamples && (
            <button
              type="button"
              className="rounded border border-text-muted/30 px-3 py-1.5 font-body text-sm text-text-muted hover:text-text"
              onClick={() => mutate(clearExampleAffirmations)}
            >
              {e.affirmationClearExamples}
            </button>
          )}
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
          <AffirmationRow key={a.id} affirmation={a} onPatch={(p) => patch(a.id, p)} />
        ))}
      </div>
    </div>
  );
}

function AffirmationRow({
  affirmation,
  onPatch,
}: {
  affirmation: Affirmation;
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
    <div className="flex items-center gap-3 rounded border border-text-muted/20 bg-surface/50 p-2">
      <input
        type="checkbox"
        checked={affirmation.active}
        title={strings.editor.affirmationActive}
        onChange={(ev) => onPatch({ active: ev.target.checked })}
        className="h-4 w-4 accent-[var(--tc-primary)]"
      />
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
      <div className="min-w-0 grow">
        <input
          value={affirmation.text}
          placeholder={strings.editor.affirmationTextLabel}
          onChange={(ev) => onPatch({ text: ev.target.value })}
          className="w-full bg-transparent font-body text-text outline-none placeholder:text-text-muted/50"
        />
        <div className="flex items-center gap-2">
          <input
            value={affirmation.emotionTag ?? ''}
            placeholder={strings.editor.affirmationEmotionLabel}
            onChange={(ev) => onPatch({ emotionTag: ev.target.value })}
            className="w-40 bg-transparent font-body text-xs text-text-muted outline-none placeholder:text-text-muted/40"
          />
          {affirmation.example && (
            <span className="rounded bg-text-muted/20 px-1.5 font-body text-[10px] text-text-muted">
              {strings.editor.affirmationExampleTag}
            </span>
          )}
        </div>
      </div>
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
  );
}
