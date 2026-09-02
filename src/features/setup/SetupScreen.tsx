import { useRef, useState } from 'react';
import { brand, strings } from '../../config';
import { themePresets } from '../../theme/presets';
import { applyBoardTheme } from '../../theme/applyTheme';
import { createBoard } from '../../db/boardRepo';
import { useBoardContext } from '../board/BoardContext';
import { buildStarterBoard } from './buildStarterBoard';

const s = strings.setup;

export function SetupScreen() {
  const { adoptBoard } = useBoardContext();
  const [name, setName] = useState('');
  const [title, setTitle] = useState(s.titleDefault);
  const [presetId, setPresetId] = useState(brand.defaultThemePreset);
  const [mode, setMode] = useState<'template' | 'empty'>('template');
  const [busy, setBusy] = useState(false);
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  // A fresh device restores a backup from right here, before any board
  // exists. This is how a board travels from desktop to phone.
  const restore = async (file: File) => {
    setBusy(true);
    setRestoreNotice(null);
    try {
      const { importVisionBundle } = await import('../exports/visionBundle');
      const result = await importVisionBundle(file);
      if (!result.ok) {
        setRestoreNotice(result.reason);
        return;
      }
      await adoptBoard(result.board);
      applyBoardTheme(result.board.theme);
    } finally {
      setBusy(false);
    }
  };

  // The same board, from Drive instead of a file: the recovery path for
  // a device whose local storage came up empty.
  const restoreDrive = async () => {
    if (busy) return;
    setBusy(true);
    setRestoreNotice(null);
    try {
      const { acquireToken, restoreFromDrive } = await import('../sync/drive');
      setRestoreNotice(s.restoreDriveSignIn);
      if (!(await acquireToken(true))) {
        setRestoreNotice(s.restoreDriveError);
        return;
      }
      const result = await restoreFromDrive((stage, done, total) => {
        setRestoreNotice(
          stage === 'board'
            ? s.restoreDriveBoard
            : s.restoreDriveAssets.replace('{done}', String(done)).replace('{total}', String(total)),
        );
      });
      if (!result) {
        setRestoreNotice(s.restoreDriveNone);
        return;
      }
      const { kvSet } = await import('../../db/kv');
      const stored = await adoptBoard(result.board);
      await kvSet('lastSyncedRevision', stored.revision);
      applyBoardTheme(stored.theme);
    } catch {
      setRestoreNotice(s.restoreDriveError);
    } finally {
      setBusy(false);
    }
  };

  const begin = async () => {
    if (busy) return;
    setBusy(true);
    const owner = name.trim() || brand.appName;
    const boardTitle = title.trim() || s.titleDefault;
    const board =
      mode === 'template'
        ? buildStarterBoard(owner, boardTitle, presetId)
        : createBoard(owner, boardTitle, presetId);
    await adoptBoard(board);
    applyBoardTheme(board.theme);
  };

  return (
    <main className="flex min-h-full items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md">
        <h1 className="font-heading text-4xl font-semibold text-primary">{s.welcomeTitle}</h1>
        <p className="mt-3 font-body text-secondary">{s.welcomeBody}</p>

        <label className="mt-8 block font-body text-sm text-text-muted">
          {s.nameLabel}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-md border border-text-muted/30 bg-surface px-3 py-2 font-body text-text outline-none focus:border-primary"
            autoFocus
          />
        </label>

        <label className="mt-4 block font-body text-sm text-text-muted">
          {s.titleLabel}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-md border border-text-muted/30 bg-surface px-3 py-2 font-body text-text outline-none focus:border-primary"
          />
        </label>

        <div className="mt-6">
          <span className="font-body text-sm text-text-muted">{s.themeLabel}</span>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {themePresets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPresetId(p.id);
                  applyBoardTheme({ presetId: p.id });
                }}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left font-body text-sm ${
                  presetId === p.id ? 'border-primary text-text' : 'border-text-muted/30 text-text-muted'
                }`}
              >
                <span
                  className="inline-block h-5 w-5 shrink-0 rounded-full border border-text-muted/40"
                  style={{ background: p.colors.background }}
                />
                <span
                  className="inline-block h-3 w-3 shrink-0 rounded-full"
                  style={{ background: p.colors.primary }}
                />
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <span className="font-body text-sm text-text-muted">{s.startLabel}</span>
          <div className="mt-2 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setMode('template')}
              className={`rounded-md border px-4 py-3 text-left ${
                mode === 'template' ? 'border-primary' : 'border-text-muted/30'
              }`}
            >
              <span className="block font-body font-medium text-text">{s.startTemplate}</span>
              <span className="block font-body text-sm text-text-muted">{s.startTemplateHint}</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('empty')}
              className={`rounded-md border px-4 py-3 text-left ${
                mode === 'empty' ? 'border-primary' : 'border-text-muted/30'
              }`}
            >
              <span className="block font-body font-medium text-text">{s.startEmpty}</span>
              <span className="block font-body text-sm text-text-muted">{s.startEmptyHint}</span>
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={begin}
          disabled={busy}
          className="mt-8 w-full rounded-md bg-primary px-4 py-3 font-body font-medium text-background disabled:opacity-60"
        >
          {s.begin}
        </button>

        <button
          type="button"
          disabled={busy}
          className="mt-3 w-full rounded-md border border-text-muted/30 px-4 py-2.5 font-body text-sm text-text-muted hover:text-text disabled:opacity-60"
          onClick={() => importRef.current?.click()}
        >
          {strings.settings.importBackup}
        </button>
        <button
          type="button"
          disabled={busy}
          className="mt-3 w-full rounded-md border border-text-muted/30 px-4 py-2.5 font-body text-sm text-text-muted hover:text-text disabled:opacity-60"
          onClick={() => void restoreDrive()}
        >
          {s.restoreDrive}
        </button>
        {restoreNotice && <p className="mt-2 font-body text-xs text-secondary">{restoreNotice}</p>}
        <input
          ref={importRef}
          type="file"
          accept=".vision,.json,application/json,application/octet-stream,application/zip"
          hidden
          onChange={(ev) => {
            const f = ev.target.files?.[0];
            ev.target.value = '';
            if (f) void restore(f);
          }}
        />
      </div>
    </main>
  );
}
