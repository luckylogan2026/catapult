import { useRef, useState } from 'react';
import { strings } from '../../config';
import type { Board, MasterAffirmation } from '../../domain/types';
import { useBoardContext } from '../board/BoardContext';
import { importFiles } from '../../assetPipeline/importAssets';
import { useAsset, useAssetUrl } from './useAssetUrl';

const e = strings.editor;

// The authoring surface for master affirmations: longer declarations,
// paragraph length, each optionally carrying its own audio (a dictated
// mp3, for example). Playback gives each active entry its own screen and
// plays its audio when present.
export function MasterAffirmationEditor() {
  const { board, mutate } = useBoardContext();
  if (!board) return null;
  const list = board.masterAffirmations ?? [];

  const patch = (id: string, p: Partial<MasterAffirmation>) =>
    mutate((b: Board) => ({
      ...b,
      masterAffirmations: (b.masterAffirmations ?? []).map((a) =>
        a.id === id ? { ...a, ...p } : a,
      ),
    }));

  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-2xl text-text">
          {strings.pageTypes['master-affirmations'].name}
        </h2>
        <button
          type="button"
          className="rounded bg-primary px-3 py-1.5 font-body text-sm font-medium text-background"
          onClick={() =>
            mutate((b: Board) => ({
              ...b,
              masterAffirmations: [
                ...(b.masterAffirmations ?? []),
                { id: crypto.randomUUID(), text: '', active: true },
              ],
            }))
          }
        >
          {e.masterAffirmationAdd}
        </button>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {list.map((a) => (
          <MasterRow key={a.id} entry={a} onPatch={(p) => patch(a.id, p)} />
        ))}
      </div>
    </div>
  );
}

function MasterRow({
  entry,
  onPatch,
}: {
  entry: MasterAffirmation;
  onPatch: (p: Partial<MasterAffirmation>) => void;
}) {
  const { board, mutate } = useBoardContext();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const audio = useAsset(entry.audioAssetId);
  const { url } = useAssetUrl(entry.audioAssetId, 'full');
  const secs = audio?.durationMs ? Math.round(audio.durationMs / 1000) : null;

  const pickAudio = async (file: File | undefined) => {
    if (!file || !board) return;
    setBusy(true);
    try {
      const [r] = await importFiles([file], { archiveOriginals: board.settings.archiveOriginals });
      if (r) onPatch({ audioAssetId: r.asset.id });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded border border-text-muted/20 bg-surface/50 p-3">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={entry.active}
          title={e.affirmationActive}
          onChange={(ev) => onPatch({ active: ev.target.checked })}
          className="mt-1 h-4 w-4 accent-[var(--tc-primary)]"
        />
        <textarea
          value={entry.text}
          placeholder={e.masterAffirmationTextLabel}
          onChange={(ev) => onPatch({ text: ev.target.value })}
          rows={3}
          className="min-w-0 grow resize-y rounded border border-transparent bg-transparent px-1 font-body text-sm leading-relaxed text-text outline-none placeholder:text-text-muted/50 focus:border-text-muted/30"
        />
        <button
          type="button"
          title={strings.common.delete}
          className="rounded px-2 py-1 font-body text-sm text-text-muted hover:text-text"
          onClick={() =>
            mutate((b: Board) => ({
              ...b,
              masterAffirmations: (b.masterAffirmations ?? []).filter((x) => x.id !== entry.id),
            }))
          }
        >
          ✕
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2 pl-7">
        <span className="font-body text-xs text-text-muted">{e.masterAffirmationAudio}</span>
        {url && <audio controls src={url} className="h-8 max-w-72" />}
        {secs !== null && (
          <span className="font-body text-xs text-text-muted">
            {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}
          </span>
        )}
        <button
          type="button"
          disabled={busy}
          className="rounded border border-text-muted/30 px-2 py-0.5 font-body text-xs text-text-muted hover:text-text"
          onClick={() => fileRef.current?.click()}
        >
          {entry.audioAssetId ? e.pageAudioReplace : e.pageAudioAdd}
        </button>
        {entry.audioAssetId && (
          <button
            type="button"
            className="rounded border border-text-muted/30 px-2 py-0.5 font-body text-xs text-text-muted hover:text-text"
            onClick={() => onPatch({ audioAssetId: undefined })}
          >
            {strings.common.remove}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          hidden
          onChange={(ev) => {
            const f = ev.target.files?.[0];
            ev.target.value = '';
            void pickAudio(f);
          }}
        />
      </div>
    </div>
  );
}
