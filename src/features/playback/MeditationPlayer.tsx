import { useEffect, useMemo, useRef, useState } from 'react';
import { strings } from '../../config';
import type { Board, LibraryRecording, MeditationConfig, MeditationSlot, Page } from '../../domain/types';
import { useBoardContext } from '../board/BoardContext';
import { MeditationEngine, type EngineSegment } from './meditationEngine';

const m = strings.meditation;
const MAX_SLOTS = 5;

const ROLE_ORDER = ['opening', 'body', 'closing', 'full', 'music'] as const;
const ROLE_LABELS: Record<string, string> = {
  opening: m.roleOpening,
  body: m.roleBody,
  closing: m.roleClosing,
  full: m.roleFull,
  music: m.roleMusic,
};

function fmtTime(s: number): string {
  const total = Math.round(s);
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${mm}:${String(ss).padStart(2, '0')}`;
}

function optionLabel(r: { name: string; description?: string }): string {
  return r.description?.trim() || r.name;
}

function groupedOptions(library: LibraryRecording[]) {
  const roleOf = (r: LibraryRecording) => (r.role && r.role !== 'other' ? r.role : 'full');
  return ROLE_ORDER.map((role) => ({
    role,
    label: ROLE_LABELS[role],
    items: library.filter((r) => roleOf(r) === role),
  })).filter((g) => g.items.length);
}

// The meditation builder card: five compact slot rows, music with a
// slider, transport, and a seekable timeline. Slot choices open the
// app's own bottom sheet instead of the unstylable native dropdown, so
// a large library stays organized under role headings.
export function MeditationPlayer({
  page,
  onVoiceActive,
}: {
  page: Page;
  onVoiceActive?: (active: boolean) => void;
}) {
  const { board, mutate } = useBoardContext();
  const engineRef = useRef<MeditationEngine | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pausedUi, setPausedUi] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ elapsed: number; total: number; label?: string } | null>(null);
  const [picker, setPicker] = useState<number | 'music' | null>(null);
  const autoStarted = useRef(false);

  const library = useMemo(() => board?.meditationLibrary ?? [], [board?.meditationLibrary]);
  // The deck freezes its screen list at session start; the live board
  // carries the current configuration.
  const livePage = board?.pages.find((p) => p.id === page.id) ?? page;
  const config: MeditationConfig = livePage.meditation ?? { slots: [] };

  useEffect(() => {
    return () => {
      engineRef.current?.stop();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!playing) {
      setProgress(null);
      return;
    }
    const timer = window.setInterval(() => {
      setProgress(engineRef.current?.progress() ?? null);
    }, 500);
    return () => window.clearInterval(timer);
  }, [playing]);

  useEffect(() => {
    if (autoStarted.current || !board) return;
    if ((livePage.meditation?.slots?.length ?? 0) > 0) {
      autoStarted.current = true;
      void start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board]);

  if (!board) return null;

  const save = (next: MeditationConfig) =>
    mutate(
      (b: Board) => ({
        ...b,
        pages: b.pages.map((p) => (p.id === page.id ? { ...p, meditation: next } : p)),
      }),
      { undoable: false },
    );

  const setSlot = (index: number, value: string) => {
    const slots = [...config.slots];
    if (value === 'empty') slots.splice(index, 1);
    else if (value === 'silence') slots[index] = { kind: 'silence', minutes: 2 };
    else slots[index] = { kind: 'recording', libraryId: value };
    save({ ...config, slots: slots.slice(0, MAX_SLOTS) });
  };

  const start = async () => {
    const engine = new MeditationEngine();
    engineRef.current?.stop();
    engineRef.current = engine;
    engine.onVoiceActive = (a) => onVoiceActive?.(a);
    engine.onEnded = () => {
      setPlaying(false);
      setPausedUi(false);
    };
    const segments: EngineSegment[] = [];
    for (const slot of config.slots) {
      if (slot.kind === 'silence') {
        segments.push({ kind: 'silence', seconds: slot.minutes * 60, label: m.slotSilence });
      } else {
        const rec = library.find((r) => r.id === slot.libraryId);
        if (rec) segments.push({ kind: 'audio', assetId: rec.assetId, label: optionLabel(rec) });
      }
    }
    if (!segments.length) return;
    const musicChoice = config.musicLibraryId
      ? library.find((r) => r.id === config.musicLibraryId)
      : null;
    setLoading(true);
    try {
      await engine.play(
        segments,
        musicChoice
          ? {
              assetId: musicChoice.assetId,
              volume: config.musicVolume ?? 0.5,
              duck: config.musicDuck ?? false,
            }
          : null,
        { title: page.title, artist: board.meta.title },
      );
      setPlaying(true);
      setPausedUi(false);
    } finally {
      setLoading(false);
    }
  };

  const stop = () => {
    engineRef.current?.stop();
    setPlaying(false);
    setPausedUi(false);
  };

  const togglePause = async () => {
    const engine = engineRef.current;
    if (!engine?.playing) return;
    if (engine.paused) {
      await engine.resume();
      setPausedUi(false);
    } else {
      await engine.pause();
      setPausedUi(true);
    }
  };

  const restart = async () => {
    stop();
    await start();
  };

  const slotSummary = (slot: MeditationSlot | null): string => {
    if (slot === null) return m.slotEmpty;
    if (slot.kind === 'silence') return m.slotSilence;
    const rec = library.find((r) => r.id === slot.libraryId);
    return rec ? optionLabel(rec) : m.slotEmpty;
  };

  const rows: (MeditationSlot | null)[] = [...config.slots];
  if (rows.length < MAX_SLOTS) rows.push(null);
  const musicRec = config.musicLibraryId ? library.find((r) => r.id === config.musicLibraryId) : null;

  return (
    <div
      className="pointer-events-auto mx-auto w-full max-w-sm rounded-xl bg-black/60 p-3 backdrop-blur-md"
      onPointerDown={(ev) => ev.stopPropagation()}
      onPointerUp={(ev) => ev.stopPropagation()}
    >
      {library.length === 0 && <p className="font-body text-xs text-white/70">{m.noLibrary}</p>}
      {library.length > 0 && (
        <>
          <div className="flex flex-col gap-1">
            {rows.map((slot, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="w-10 shrink-0 font-body text-[9px] uppercase tracking-wider text-white/40">
                  {m.slotLabel.replace('{n}', String(i + 1))}
                </span>
                <button
                  type="button"
                  onClick={() => setPicker(i)}
                  className={`min-w-0 grow truncate rounded-md border border-white/15 px-2.5 py-1.5 text-left font-body text-xs ${
                    slot === null ? 'text-white/40' : 'text-white'
                  } hover:border-white/30`}
                >
                  {slotSummary(slot)}
                </button>
                {slot?.kind === 'silence' && (
                  <label className="flex shrink-0 items-center gap-1 font-body text-[11px] text-white/60">
                    <input
                      type="number"
                      min={0.1}
                      max={60}
                      step={0.1}
                      value={slot.minutes}
                      onChange={(ev) => {
                        const slots = [...config.slots];
                        slots[i] = {
                          kind: 'silence',
                          minutes: Math.max(0.1, Math.round(Number(ev.target.value) * 10) / 10 || 2),
                        };
                        save({ ...config, slots });
                      }}
                      className="w-12 rounded border border-white/15 bg-black/40 px-1 py-0.5 text-white"
                    />
                    {m.minutesLabel}
                  </label>
                )}
              </div>
            ))}

            <div className="flex items-center gap-1.5">
              <span className="w-10 shrink-0 font-body text-[9px] uppercase tracking-wider text-white/40">
                {m.musicLabel}
              </span>
              <button
                type="button"
                onClick={() => setPicker('music')}
                className={`min-w-0 grow truncate rounded-md border border-white/15 px-2.5 py-1.5 text-left font-body text-xs ${
                  musicRec ? 'text-white' : 'text-white/40'
                } hover:border-white/30`}
              >
                {musicRec ? optionLabel(musicRec) : m.musicNone}
              </button>
            </div>
          </div>

          {config.musicLibraryId && (
            <div className="mt-1.5 flex items-center gap-2 pl-11">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={config.musicVolume ?? 0.5}
                onChange={(ev) => {
                  const v = Number(ev.target.value);
                  engineRef.current?.setMusicVolume(v);
                  save({ ...config, musicVolume: v });
                }}
                className="h-1 min-w-0 grow accent-[var(--tc-primary)]"
              />
              <label className="flex shrink-0 items-center gap-1 font-body text-[10px] text-white/60">
                <input
                  type="checkbox"
                  checked={config.musicDuck ?? false}
                  onChange={(ev) => save({ ...config, musicDuck: ev.target.checked })}
                  className="h-3 w-3 accent-[var(--tc-primary)]"
                />
                {m.musicDuckLabel}
              </label>
            </div>
          )}

          {playing && progress && (
            <div className="mt-2">
              <div
                className="cursor-pointer py-1.5"
                onClick={(ev) => {
                  const r = ev.currentTarget.getBoundingClientRect();
                  const frac = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
                  void engineRef.current?.seek(frac * progress.total);
                  setPausedUi(false);
                }}
              >
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-1.5 rounded-full bg-primary"
                    style={{ width: `${Math.min(100, (progress.elapsed / Math.max(1, progress.total)) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between font-body text-[10px] text-white/60">
                <span>{fmtTime(progress.elapsed)}</span>
                <span className="truncate px-2">{progress.label ?? ''}</span>
                <span>-{fmtTime(Math.max(0, progress.total - progress.elapsed))}</span>
              </div>
            </div>
          )}

          {!playing ? (
            <button
              type="button"
              disabled={loading || !config.slots.length}
              onClick={() => void start()}
              className="mt-2 w-full rounded-md bg-primary py-2 font-body text-sm font-medium text-background disabled:opacity-50"
            >
              {loading ? m.loading : m.play}
            </button>
          ) : (
            <div className="mt-2 flex gap-1.5">
              <button
                type="button"
                disabled={!pausedUi}
                onClick={() => {
                  const engine = engineRef.current;
                  if (engine?.paused) {
                    void engine.resume();
                    setPausedUi(false);
                  }
                }}
                className="grow rounded-md bg-primary py-2 font-body text-xs font-medium text-background disabled:opacity-40"
              >
                {m.play}
              </button>
              <button
                type="button"
                disabled={pausedUi}
                onClick={() => void togglePause()}
                className="grow rounded-md border border-white/20 py-2 font-body text-xs font-medium text-white disabled:opacity-40"
              >
                {m.pause}
              </button>
              <button
                type="button"
                onClick={() => void restart()}
                className="rounded-md border border-white/20 px-3 py-2 font-body text-xs text-white hover:bg-white/10"
              >
                {m.restart}
              </button>
              <button
                type="button"
                onClick={stop}
                className="rounded-md border border-white/20 px-2.5 py-2 font-body text-xs text-white/60 hover:bg-white/10"
              >
                {m.stop}
              </button>
            </div>
          )}

          {picker !== null && (
            <SlotSheet
              library={library}
              isMusic={picker === 'music'}
              current={
                picker === 'music'
                  ? (config.musicLibraryId ?? 'empty')
                  : config.slots[picker as number] === undefined
                    ? 'empty'
                    : config.slots[picker as number].kind === 'silence'
                      ? 'silence'
                      : (config.slots[picker as number] as { libraryId: string }).libraryId
              }
              onPick={(value) => {
                if (picker === 'music') {
                  save({ ...config, musicLibraryId: value === 'empty' ? undefined : value });
                } else {
                  setSlot(picker as number, value);
                }
                setPicker(null);
              }}
              onClose={() => setPicker(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

// The app's own picker: a bottom sheet with role sections, compact and
// scrollable, replacing the native dropdown.
function SlotSheet({
  library,
  isMusic,
  current,
  onPick,
  onClose,
}: {
  library: LibraryRecording[];
  isMusic: boolean;
  current: string;
  onPick: (value: string) => void;
  onClose: () => void;
}) {
  const groups = groupedOptions(library);
  const ordered = isMusic
    ? [...groups].sort((a, b) => (a.role === 'music' ? -1 : b.role === 'music' ? 1 : 0))
    : groups;

  const Row = ({ value, label, muted = false }: { value: string; label: string; muted?: boolean }) => (
    <button
      type="button"
      onClick={() => onPick(value)}
      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left font-body text-sm ${
        current === value ? 'bg-primary/20 text-white' : muted ? 'text-white/50' : 'text-white/85'
      } hover:bg-white/10`}
    >
      <span className="min-w-0 truncate">{label}</span>
      {current === value && <span className="shrink-0 pl-2 text-primary">●</span>}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/50"
      onClick={onClose}
      onPointerDown={(ev) => ev.stopPropagation()}
      onPointerUp={(ev) => ev.stopPropagation()}
    >
      <div
        className="max-h-[70vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-[#141414] p-3 pb-6"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="relative mb-2">
          <div className="mx-auto h-1 w-10 rounded-full bg-white/20" />
          <button
            type="button"
            onClick={onClose}
            className="absolute -top-1 right-0 rounded-full px-2 py-0.5 font-body text-sm text-white/60 hover:text-white"
          >
            ✕
          </button>
        </div>
        <Row value="empty" label={isMusic ? m.musicNone : m.slotEmpty} muted />
        {!isMusic && <Row value="silence" label={m.slotSilence} />}
        {ordered.map((g) => (
          <div key={g.role} className="mt-2">
            <p className="px-3 pb-1 font-body text-[10px] uppercase tracking-[0.2em] text-white/35">
              {g.label}
            </p>
            {g.items.map((r) => (
              <Row key={r.id} value={r.id} label={optionLabel(r)} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
