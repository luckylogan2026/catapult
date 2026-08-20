import { useEffect, useRef, useState } from 'react';
import { strings, trackerItems } from '../../config';
import { db } from '../../db/db';
import { storageEstimate } from '../../db/storage';
import { useBoardContext } from '../board/BoardContext';
import { getPreset, themePresets, type ThemeColors } from '../../theme/presets';
import { applyBoardTheme } from '../../theme/applyTheme';
import { brand } from '../../config';
import { importFiles } from '../../assetPipeline/importAssets';
import { SyncSection, type useSyncEngine } from '../sync/SyncSection';

const s = strings.settings;
const tk = strings.tracker;

// Every tracker item once, for the anchors editor.
const allTrackerItems = [...trackerItems.morning, ...trackerItems.evening].filter(
  (it, i, arr) => arr.findIndex((o) => o.key === it.key) === i,
);

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

  const colorRef = useRef<HTMLInputElement>(null);

  const effectiveColors = (): ThemeColors => {
    if (!board) return getPreset('sugarpine-forest').colors;
    const preset = getPreset(board.theme.presetId);
    const brandLayer = board.theme.presetId === brand.defaultThemePreset ? brand.palette : {};
    return { ...preset.colors, ...brandLayer, ...board.theme.colors } as ThemeColors;
  };

  const setColor = (key: keyof ThemeColors, value: string) => {
    if (!board) return;
    const nextTheme = { ...board.theme, colors: { ...board.theme.colors, [key]: value } };
    mutate((b) => ({ ...b, theme: nextTheme }));
    applyBoardTheme(nextTheme);
  };

  const resetColors = () => {
    if (!board) return;
    const nextTheme = { ...board.theme, colors: undefined };
    mutate((b) => ({ ...b, theme: nextTheme }));
    applyBoardTheme(nextTheme);
  };

  // Brand colors from an uploaded image: dominant clusters become the
  // palette suggestion, tweakable with the pickers afterwards.
  const extractFromImage = async (file: File) => {
    if (!board) return;
    const bitmap = await createImageBitmap(file);
    const size = 48;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(bitmap, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    bitmap.close();
    const buckets = new Map<string, { r: number; g: number; b: number; n: number }>();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
      const e = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
      e.r += r; e.g += g; e.b += b; e.n += 1;
      buckets.set(key, e);
    }
    const clusters = [...buckets.values()]
      .map((e) => ({ r: e.r / e.n, g: e.g / e.n, b: e.b / e.n, n: e.n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 8);
    if (!clusters.length) return;
    const hex = (c: { r: number; g: number; b: number }) =>
      '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
    const lum = (c: { r: number; g: number; b: number }) => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
    const sat = (c: { r: number; g: number; b: number }) =>
      Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
    const bySat = [...clusters].sort((a, b) => sat(b) * b.n - sat(a) * a.n);
    const primary = bySat[0];
    const secondary = bySat.find((c) => c !== primary && Math.abs(lum(c) - lum(primary)) > 24) ?? bySat[1] ?? primary;
    const darkest = [...clusters].sort((a, b) => lum(a) - lum(b))[0];
    const nextTheme = {
      ...board.theme,
      colors: {
        ...board.theme.colors,
        primary: hex(primary),
        secondary: hex(secondary),
        background: hex(darkest),
        surface: hex({ r: darkest.r * 1.25 + 10, g: darkest.g * 1.25 + 10, b: darkest.b * 1.25 + 10 }),
      },
    };
    mutate((b) => ({ ...b, theme: nextTheme }));
    applyBoardTheme(nextTheme);
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
          <div className="mt-3 border-t border-text-muted/15 pt-3">
            <p className="font-body text-xs font-medium text-text">{s.customColors}</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(
                [
                  ['background', s.colorBackground],
                  ['surface', s.colorSurface],
                  ['primary', s.colorPrimary],
                  ['secondary', s.colorSecondary],
                  ['text', s.colorText],
                  ['textMuted', s.colorTextMuted],
                ] as [keyof ThemeColors, string][]
              ).map(([key, label]) => (
                <label key={key} className="flex flex-col items-start gap-1 font-body text-[10px] text-text-muted">
                  {label}
                  <input
                    type="color"
                    value={effectiveColors()[key]}
                    onChange={(ev) => setColor(key, ev.target.value)}
                    className="h-7 w-full cursor-pointer rounded border border-text-muted/30 bg-transparent p-0"
                  />
                </label>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded border border-text-muted/30 px-2.5 py-1 font-body text-xs text-text-muted hover:text-text"
                onClick={() => colorRef.current?.click()}
                title={s.fromImageHint}
              >
                {s.fromImage}
              </button>
              <button
                type="button"
                className="rounded border border-text-muted/30 px-2.5 py-1 font-body text-xs text-text-muted hover:text-text"
                onClick={resetColors}
              >
                {s.resetColors}
              </button>
              <input
                ref={colorRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(ev) => {
                  const f = ev.target.files?.[0];
                  ev.target.value = '';
                  if (f) void extractFromImage(f);
                }}
              />
            </div>
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

        <label className="mt-3 flex items-start gap-2 font-body text-sm text-text">
          <input
            type="checkbox"
            checked={!!board.settings.postShiftEnabled}
            onChange={(ev) =>
              mutate((b) => ({
                ...b,
                settings: { ...b.settings, postShiftEnabled: ev.target.checked },
              }))
            }
            className="mt-0.5 h-4 w-4 accent-[var(--tc-primary)]"
          />
          {tk.postShiftSetting}
        </label>

        <details className="mt-4 rounded border border-text-muted/20 p-3">
          <summary className="cursor-pointer font-body text-sm font-medium text-text">
            {tk.anchorsSettings}
          </summary>
          <p className="mt-1 font-body text-xs text-text-muted">{tk.anchorsBody}</p>
          {allTrackerItems.map((it) => (
            <label key={it.key} className="mt-2 block font-body text-xs text-text-muted">
              {it.label}
              <input
                type="text"
                value={board.settings.anchors?.[it.key] ?? ''}
                onChange={(ev) =>
                  mutate((b) => ({
                    ...b,
                    settings: {
                      ...b.settings,
                      anchors: { ...(b.settings.anchors ?? {}), [it.key]: ev.target.value },
                    },
                  }))
                }
                className="mt-1 w-full rounded border border-text-muted/30 bg-surface/60 px-2 py-1.5 font-body text-sm text-text outline-none focus:border-primary"
              />
            </label>
          ))}
        </details>

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
