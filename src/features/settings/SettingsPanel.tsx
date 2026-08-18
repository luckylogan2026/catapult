import { useEffect, useRef, useState } from 'react';
import { strings } from '../../config';
import { db } from '../../db/db';
import { storageEstimate } from '../../db/storage';
import { useBoardContext } from '../board/BoardContext';

const s = strings.settings;

function fmtBytes(n: number): string {
  if (n > 1024 * 1024 * 1024) return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (n > 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

// Minimal settings for now: the autosave explanation, the storage
// readout the performance guardrails call for, the originals toggle,
// and Start over, which wipes the device copy and returns to setup.
// The theme editor and playback settings arrive in later phases.
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { board, mutate, adoptBoard } = useBoardContext();
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void storageEstimate().then(setUsage);
    void navigator.storage?.persisted?.().then(setPersisted);
  }, []);

  const saveBackup = async () => {
    if (!board) return;
    setBusy(s.exporting);
    setNotice(null);
    try {
      const { exportVisionBundle, bundleFilename } = await import('../exports/visionBundle');
      const blob = await exportVisionBundle(board);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = bundleFilename(board);
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    } finally {
      setBusy(null);
    }
  };

  const loadBackup = async (file: File) => {
    setNotice(null);
    if (board && !window.confirm(s.importConfirmReplace)) return;
    setBusy(s.importing);
    try {
      const { importVisionBundle } = await import('../exports/visionBundle');
      const result = await importVisionBundle(file);
      if (!result.ok) {
        setNotice(result.reason);
        return;
      }
      await adoptBoard(result.board);
      setNotice(
        s.importSummary
          .replace('{pages}', String(result.board.pages.length))
          .replace('{affirmations}', String(result.board.affirmations.length))
          .replace('{assets}', String(result.assetCount)),
      );
    } finally {
      setBusy(null);
    }
  };

  const savePdf = async () => {
    if (!board) return;
    setNotice(null);
    setBusy(s.exportingPdf.replace('{n}', '1').replace('{total}', '?'));
    try {
      const { exportPdf, pdfFilename } = await import('../exports/pdfExport');
      const blob = await exportPdf(board, (done, total) =>
        setBusy(s.exportingPdf.replace('{n}', String(Math.min(done + 1, total))).replace('{total}', String(total))),
      );
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = pdfFilename(board);
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    } finally {
      setBusy(null);
    }
  };

  const [htmlInfo, setHtmlInfo] = useState<{ tooBig: boolean; size: string } | null>(null);

  const saveHtml = async (single: boolean) => {
    if (!board) return;
    setNotice(null);
    setBusy(s.exportingHtml);
    try {
      const { buildHtmlExport } = await import('../exports/htmlExport');
      const result = await buildHtmlExport(board);
      const mb = (result.totalMediaBytes / (1024 * 1024)).toFixed(1) + ' MB';
      setHtmlInfo({ tooBig: !result.singleFile, size: mb });
      const blob = single ? result.singleFile : result.zip;
      if (!blob) {
        setNotice(s.exportHtmlSingleTooBig.replace('{size}', mb));
        return;
      }
      const date = new Date().toISOString().slice(0, 10);
      const owner = board.meta.ownerName.trim().replace(/s+/g, '-') || 'board';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = single ? `${owner}-vision-${date}.html` : `${owner}-vision-${date}-html.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    } finally {
      setBusy(null);
    }
  };

  const startOver = async () => {
    if (!window.confirm(s.startOverConfirm)) return;
    await db.boards.clear();
    await db.assets.clear();
    window.location.reload();
  };

  if (!board) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg bg-surface p-5"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-xl text-text">{s.title}</h2>
          <button type="button" className="font-body text-sm text-text-muted hover:text-text" onClick={onClose}>
            {strings.common.close}
          </button>
        </div>

        <p className="mt-3 font-body text-sm text-secondary">{s.autosaveNote}</p>

        <div className="mt-4 rounded border border-text-muted/20 p-3">
          <p className="font-body text-sm font-medium text-text">{s.backupTitle}</p>
          <p className="mt-1 font-body text-xs text-text-muted">{s.backupBody}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!!busy}
              className="rounded border border-text-muted/30 px-3 py-1.5 font-body text-sm text-text hover:border-primary disabled:opacity-50"
              onClick={saveBackup}
            >
              {s.exportBackup}
            </button>
            <button
              type="button"
              disabled={!!busy}
              className="rounded border border-text-muted/30 px-3 py-1.5 font-body text-sm text-text hover:border-primary disabled:opacity-50"
              onClick={() => importRef.current?.click()}
            >
              {s.importBackup}
            </button>
            {busy && <span className="font-body text-xs text-text-muted">{busy}</span>}
            {notice && <span className="font-body text-xs text-secondary">{notice}</span>}
          </div>
          <input
            ref={importRef}
            type="file"
            accept=".vision,application/octet-stream,application/zip"
            hidden
            onChange={(ev) => {
              const f = ev.target.files?.[0];
              ev.target.value = '';
              if (f) void loadBackup(f);
            }}
          />
        </div>

        <div className="mt-4 rounded border border-text-muted/20 p-3 font-body text-sm text-text">
          {usage && (
            <p>
              {s.storageUsage}: {fmtBytes(usage.usage)} / {fmtBytes(usage.quota)}
            </p>
          )}
          {persisted !== null && (
            <p className="mt-1 text-xs text-text-muted">
              {persisted ? s.storagePersistent : s.storageNotPersistent}
            </p>
          )}
        </div>

        <div className="mt-4 rounded border border-text-muted/20 p-3">
          <p className="font-body text-sm font-medium text-text">{s.exportTitle}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!!busy}
              className="rounded border border-text-muted/30 px-3 py-1.5 font-body text-sm text-text hover:border-primary disabled:opacity-50"
              onClick={savePdf}
            >
              {s.exportPdf}
            </button>
            <button
              type="button"
              disabled={!!busy}
              className="rounded border border-text-muted/30 px-3 py-1.5 font-body text-sm text-text hover:border-primary disabled:opacity-50"
              onClick={() => saveHtml(false)}
            >
              {s.exportHtml}
            </button>
            <button
              type="button"
              disabled={!!busy || !!htmlInfo?.tooBig}
              title={htmlInfo?.tooBig ? s.exportHtmlSingleTooBig.replace('{size}', htmlInfo.size) : undefined}
              className="rounded border border-text-muted/30 px-3 py-1.5 font-body text-sm text-text hover:border-primary disabled:opacity-40"
              onClick={() => saveHtml(true)}
            >
              {s.exportHtmlSingle}
            </button>
          </div>
        </div>

        <div className="mt-4 rounded border border-text-muted/20 p-3">
          <p className="font-body text-sm font-medium text-text">{s.affirmationPlayTitle}</p>
          {board.playlists.map((pl) => (
            <div key={pl.id} className="mt-2 flex flex-wrap items-center gap-2 font-body text-sm text-text">
              <span className="w-16 text-text-muted">{pl.name}</span>
              <select
                value={pl.affirmationMode}
                onChange={(ev) =>
                  mutate((b) => ({
                    ...b,
                    playlists: b.playlists.map((x) =>
                      x.id === pl.id
                        ? { ...x, affirmationMode: ev.target.value as 'shuffle' | 'sequential' }
                        : x,
                    ),
                  }))
                }
                className="rounded border border-text-muted/30 bg-background px-2 py-1 text-xs"
              >
                <option value="sequential">{s.affirmationModeAll}</option>
                <option value="shuffle">{s.affirmationModeShuffle}</option>
              </select>
              {pl.affirmationMode === 'shuffle' && (
                <label className="flex items-center gap-1 text-xs text-text-muted">
                  {s.affirmationCountLabel}
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={pl.shuffleCount}
                    onChange={(ev) =>
                      mutate((b) => ({
                        ...b,
                        playlists: b.playlists.map((x) =>
                          x.id === pl.id
                            ? { ...x, shuffleCount: Math.max(1, Number(ev.target.value) || 1) }
                            : x,
                        ),
                      }))
                    }
                    className="w-16 rounded border border-text-muted/30 bg-background px-1 py-0.5 text-text"
                  />
                </label>
              )}
            </div>
          ))}
        </div>

        <label className="mt-4 flex items-start gap-2 font-body text-sm text-text">
          <input
            type="checkbox"
            checked={board.settings.archiveOriginals}
            onChange={(ev) =>
              mutate((b) => ({
                ...b,
                settings: { ...b.settings, archiveOriginals: ev.target.checked },
              }))
            }
            className="mt-0.5 h-4 w-4 accent-[var(--tc-primary)]"
          />
          {s.archiveOriginals}
        </label>

        <div className="mt-6 border-t border-text-muted/20 pt-4">
          <p className="font-body text-xs text-text-muted">{s.startOverWarning}</p>
          <button
            type="button"
            className="mt-2 rounded border border-red-400/50 px-3 py-1.5 font-body text-sm text-red-300 hover:bg-red-400/10"
            onClick={startOver}
          >
            {s.startOver}
          </button>
        </div>
      </div>
    </div>
  );
}
