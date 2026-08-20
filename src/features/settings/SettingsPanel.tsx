import { useEffect, useRef, useState } from 'react';
import { strings } from '../../config';
import { db } from '../../db/db';
import { storageEstimate } from '../../db/storage';
import { useBoardContext } from '../board/BoardContext';
import { themePresets } from '../../theme/presets';
import { applyBoardTheme } from '../../theme/applyTheme';
import { importFiles } from '../../assetPipeline/importAssets';
import { SyncSection, type useSyncEngine } from '../sync/SyncSection';

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
export function SettingsPanel({
  onClose,
  syncEngine,
}: {
  onClose: () => void;
  syncEngine?: ReturnType<typeof useSyncEngine>;
}) {
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
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const trackRef = useRef<HTMLInputElement>(null);
  const trackTarget = useRef<'morning' | 'evening'>('morning');

  useEffect(() => {
    const load = () => setVoices(speechSynthesis.getVoices());
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
    return () => speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  const setTrack = (pl: 'morning' | 'evening', assetId: string | undefined) =>
    mutate((b) => ({
      ...b,
      playlists: b.playlists.map((x) => (x.id === pl ? { ...x, backgroundTrackAssetId: assetId } : x)),
    }));

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
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-lg bg-surface p-4"
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
          <p className="font-body text-sm font-medium text-text">{s.themeTitle}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {themePresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  const nextTheme = { ...board.theme, presetId: preset.id };
                  mutate((b) => ({ ...b, theme: nextTheme }));
                  applyBoardTheme(nextTheme);
                }}
                className={`flex items-center gap-2 rounded-md border px-2.5 py-2 text-left font-body text-xs ${
                  board.theme.presetId === preset.id
                    ? 'border-primary text-text'
                    : 'border-text-muted/30 text-text-muted'
                }`}
              >
                <span
                  className="inline-block h-4 w-4 shrink-0 rounded-full border border-text-muted/40"
                  style={{ background: preset.colors.background }}
                />
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: preset.colors.primary }}
                />
                {preset.name}
              </button>
            ))}
          </div>
        </div>

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

        {syncEngine && <SyncSection engine={syncEngine} />}

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
              <button
                type="button"
                className="rounded border border-text-muted/30 px-2 py-0.5 text-xs text-text-muted hover:text-text"
                onClick={() => {
                  trackTarget.current = pl.id;
                  trackRef.current?.click();
                }}
              >
                {s.backgroundTrackLabel}{pl.backgroundTrackAssetId ? ' ✓' : ''}
              </button>
              {pl.backgroundTrackAssetId && (
                <button
                  type="button"
                  className="rounded border border-text-muted/30 px-1.5 py-0.5 text-[10px] text-text-muted hover:text-text"
                  onClick={() => setTrack(pl.id, undefined)}
                >
                  {strings.common.remove}
                </button>
              )}
              <label className="flex items-center gap-1 text-xs text-text-muted">
                <input
                  type="checkbox"
                  checked={pl.autoAdvance}
                  onChange={(ev) =>
                    mutate((b) => ({
                      ...b,
                      playlists: b.playlists.map((x) =>
                        x.id === pl.id ? { ...x, autoAdvance: ev.target.checked } : x,
                      ),
                    }))
                  }
                  className="h-3.5 w-3.5 accent-[var(--tc-primary)]"
                />
                {s.autoAdvanceLabel}
              </label>
              {pl.autoAdvance && (
                <label className="flex items-center gap-1 text-xs text-text-muted">
                  {s.dwellLabel}
                  <input
                    type="number"
                    min={2}
                    max={120}
                    value={pl.dwellSeconds}
                    onChange={(ev) =>
                      mutate((b) => ({
                        ...b,
                        playlists: b.playlists.map((x) =>
                          x.id === pl.id
                            ? { ...x, dwellSeconds: Math.max(2, Number(ev.target.value) || 6) }
                            : x,
                        ),
                      }))
                    }
                    className="w-14 rounded border border-text-muted/30 bg-background px-1 py-0.5 text-text"
                  />
                </label>
              )}
              <label className="flex items-center gap-1 text-xs text-text-muted">
                <input
                  type="checkbox"
                  checked={pl.ttsEnabled}
                  onChange={(ev) =>
                    mutate((b) => ({
                      ...b,
                      playlists: b.playlists.map((x) =>
                        x.id === pl.id ? { ...x, ttsEnabled: ev.target.checked } : x,
                      ),
                    }))
                  }
                  className="h-3.5 w-3.5 accent-[var(--tc-primary)]"
                />
                {s.ttsLabel}
              </label>
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
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-text-muted/15 pt-3">
            <label className="flex items-center gap-1 font-body text-xs text-text-muted">
              {s.ttsVoiceLabel}
              <select
                value={board.settings.ttsVoiceURI ?? ''}
                onChange={(ev) =>
                  mutate((b) => ({
                    ...b,
                    settings: { ...b.settings, ttsVoiceURI: ev.target.value || undefined },
                  }))
                }
                className="max-w-48 rounded border border-text-muted/30 bg-background px-1 py-0.5 text-text"
              >
                <option value=""></option>
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1 font-body text-xs text-text-muted">
              {s.ttsRateLabel}
              <input
                type="range"
                min={0.5}
                max={1.4}
                step={0.05}
                value={board.settings.ttsRate || 0.9}
                onChange={(ev) =>
                  mutate((b) => ({
                    ...b,
                    settings: { ...b.settings, ttsRate: Number(ev.target.value) },
                  }))
                }
              />
            </label>
          </div>
          <p className="mt-2 font-body text-[11px] text-text-muted">{s.autoAdvanceHint}</p>
          <p className="mt-1 font-body text-[11px] text-text-muted">{s.ttsDeviceNote}</p>
          <input
            ref={trackRef}
            type="file"
            accept="audio/*"
            hidden
            onChange={async (ev) => {
              const f = ev.target.files?.[0];
              ev.target.value = '';
              if (!f || !board) return;
              const [r] = await importFiles([f], { archiveOriginals: board.settings.archiveOriginals });
              if (r) setTrack(trackTarget.current, r.asset.id);
            }}
          />
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
