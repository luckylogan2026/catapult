import { useRef, useState } from 'react';
import { strings } from '../../config';
import type { Board, LibraryRecording } from '../../domain/types';
import { useBoardContext } from '../board/BoardContext';
import { importFiles } from '../../assetPipeline/importAssets';
import { RecordButton } from './RecordButton';
import { useAssetUrl } from './useAssetUrl';

const m = strings.meditation;

type Role = NonNullable<LibraryRecording['role']>;
const ROLES: { value: Role; label: string }[] = [
  { value: 'opening', label: m.roleOpening },
  { value: 'body', label: m.roleBody },
  { value: 'closing', label: m.roleClosing },
  { value: 'full', label: m.roleFull },
  { value: 'music', label: m.roleMusic },
];

function guessRole(name: string): Role {
  const n = name.toLowerCase();
  if (n.includes('open') || n.includes('intro')) return 'opening';
  if (n.includes('clos') || n.includes('end') || n.includes('outro')) return 'closing';
  if (n.includes('music') || n.includes('track') || n.includes('ambient')) return 'music';
  if (n.includes('body') || n.includes('main')) return 'body';
  if (n.includes('full')) return 'full';
  return 'full';
}

// The editor's meditation library: the named recordings the player's
// dropdown menus offer. Upload or record, name each entry, remove what
// no longer belongs.
export function MeditationLibraryPanel({ onClose }: { onClose: () => void }) {
  const { board, mutate } = useBoardContext();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  if (!board) return null;
  const library = board.meditationLibrary ?? [];

  const update = (fn: (list: LibraryRecording[]) => LibraryRecording[]) =>
    mutate((b: Board) => ({ ...b, meditationLibrary: fn(b.meditationLibrary ?? []) }));

  const addAsset = (assetId: string, name: string) =>
    update((list) => [...list, { id: crypto.randomUUID(), name, assetId, role: guessRole(name) }]);

  const pickFiles = async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    try {
      for (const f of files) {
        const [r] = await importFiles([f], { archiveOriginals: board.settings.archiveOriginals });
        if (r) addAsset(r.asset.id, f.name.replace(/\.[A-Za-z0-9]+$/, ''));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-lg bg-surface p-4"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-xl text-text">{m.libraryTitle}</h2>
          <button type="button" className="font-body text-sm text-text-muted hover:text-text" onClick={onClose}>
            {strings.common.close}
          </button>
        </div>
        <p className="mt-1 font-body text-xs text-text-muted">{m.libraryBody}</p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            className="rounded border border-text-muted/30 px-3 py-1.5 font-body text-sm text-text hover:border-primary disabled:opacity-50"
            onClick={() => fileRef.current?.click()}
          >
            {m.libraryAdd}
          </button>
          <RecordButton onRecorded={(id) => addAsset(id, `${m.libraryTitle} ${library.length + 1}`)} />
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            multiple
            hidden
            onChange={(ev) => {
              const files = [...(ev.target.files ?? [])];
              ev.target.value = '';
              void pickFiles(files);
            }}
          />
        </div>

        <div className="mt-3 flex flex-col gap-2">
          {library.map((rec) => (
            <LibraryRow
              key={rec.id}
              rec={rec}
              onRename={(name) => update((list) => list.map((r) => (r.id === rec.id ? { ...r, name } : r)))}
              onRole={(role) => update((list) => list.map((r) => (r.id === rec.id ? { ...r, role } : r)))}
              onRemove={() => update((list) => list.filter((r) => r.id !== rec.id))}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function LibraryRow({
  rec,
  onRename,
  onRole,
  onRemove,
}: {
  rec: LibraryRecording;
  onRename: (name: string) => void;
  onRole: (role: Role) => void;
  onRemove: () => void;
}) {
  const { url } = useAssetUrl(rec.assetId, 'full');
  return (
    <div className="flex items-center gap-2 rounded border border-text-muted/20 bg-surface/60 p-2">
      <input
        value={rec.name}
        placeholder={m.libraryNamePlaceholder}
        onChange={(ev) => onRename(ev.target.value)}
        className="min-w-0 grow rounded border border-transparent bg-transparent px-1 font-body text-sm text-text outline-none focus:border-text-muted/30"
      />
      <select
        value={rec.role === 'other' || !rec.role ? 'full' : rec.role}
        onChange={(ev) => onRole(ev.target.value as Role)}
        className="shrink-0 rounded border border-text-muted/30 bg-background px-1 py-1 font-body text-xs text-text"
      >
        {ROLES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      {url && <audio controls src={url} className="h-8 w-40 shrink-0" />}
      <button
        type="button"
        title={strings.common.delete}
        className="shrink-0 rounded px-2 py-1 font-body text-sm text-text-muted hover:text-text"
        onClick={onRemove}
      >
        ✕
      </button>
    </div>
  );
}
