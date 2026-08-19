import { useEffect, useMemo, useRef, useState } from 'react';
import { strings } from '../../config';
import type { Board, MeditationConfig, MeditationSlot, Page } from '../../domain/types';
import { useBoardContext } from '../board/BoardContext';
import { MeditationEngine, type EngineSegment } from './meditationEngine';

const m = strings.meditation;
const MAX_SLOTS = 5;

// The meditation builder on the player: up to five slots, each a library
// recording or a timed silence, plus optional music with a volume
// slider. The configuration persists on the page and syncs. Phone-first:
// one compact card of dropdowns and a single Begin button.
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
  const [loading, setLoading] = useState(false);

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
    engine.onEnded = () => setPlaying(false);
    const segments: EngineSegment[] = [];
    for (const slot of config.slots) {
      if (slot.kind === 'silence') segments.push({ kind: 'silence', seconds: slot.minutes * 60 });
      else {
        const rec = library.find((r) => r.id === slot.libraryId);
        if (rec) segments.push({ kind: 'audio', assetId: rec.assetId });
      }
    }
    if (!segments.length) return;
    const musicRec = config.musicLibraryId
      ? library.find((r) => r.id === config.musicLibraryId)
      : null;
    setLoading(true);
    try {
      await engine.play(
        segments,
        musicRec
          ? {
              assetId: musicRec.assetId,
              volume: config.musicVolume ?? 0.5,
              duck: config.musicDuck ?? false,
            }
          : null,
        { title: page.title, artist: board.meta.title },
      );
      setPlaying(true);
    } finally {
      setLoading(false);
    }
  };

  const stop = () => {
    engineRef.current?.stop();
    setPlaying(false);
  };

  const rows: (MeditationSlot | null)[] = [...config.slots];
  if (rows.length < MAX_SLOTS) rows.push(null);

  return (
    <div className="pointer-events-auto mx-auto w-full max-w-sm rounded-lg bg-black/55 p-3 backdrop-blur-sm">
      {library.length === 0 && (
        <p className="font-body text-xs text-white/70">{m.noLibrary}</p>
      )}
      {library.length > 0 && (
        <>
          <div className="flex flex-col gap-1.5">
            {rows.map((slot, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="w-12 shrink-0 font-body text-[10px] uppercase tracking-wide text-white/50">
                  {m.slotLabel.replace('{n}', String(i + 1))}
                </span>
                <select
                  value={slot === null ? 'empty' : slot.kind === 'silence' ? 'silence' : slot.libraryId}
                  onChange={(ev) => setSlot(i, ev.target.value)}
                  className="min-w-0 grow rounded border border-white/20 bg-black/40 px-2 py-1.5 font-body text-sm text-white"
                >
                  <option value="empty">{m.slotEmpty}</option>
                  <option value="silence">{m.slotSilence}</option>
                  {library.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                {slot?.kind === 'silence' && (
                  <label className="flex shrink-0 items-center gap-1 font-body text-xs text-white/70">
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
                      className="w-14 rounded border border-white/20 bg-black/40 px-1 py-1 text-white"
                    />
                    {m.minutesLabel}
                  </label>
                )}
              </div>
            ))}
          </div>

          <div className="mt-2 flex items-center gap-1.5">
            <span className="w-12 shrink-0 font-body text-[10px] uppercase tracking-wide text-white/50">
              {m.musicLabel}
            </span>
            <select
              value={config.musicLibraryId ?? ''}
              onChange={(ev) => save({ ...config, musicLibraryId: ev.target.value || undefined })}
              className="min-w-0 grow rounded border border-white/20 bg-black/40 px-2 py-1.5 font-body text-sm text-white"
            >
              <option value="">{m.musicNone}</option>
              {library.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          {config.musicLibraryId && (
            <div className="mt-1.5 flex items-center gap-2 pl-14">
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
                className="min-w-0 grow accent-[var(--tc-primary)]"
              />
              <label className="flex shrink-0 items-center gap-1 font-body text-[11px] text-white/70">
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

          <button
            type="button"
            disabled={loading || !config.slots.length}
            onClick={() => (playing ? stop() : void start())}
            className={`mt-2.5 w-full rounded py-2 font-body text-sm font-medium ${
              playing ? 'bg-white/20 text-white' : 'bg-primary text-background'
            } disabled:opacity-50`}
          >
            {loading ? m.loading : playing ? m.stop : m.play}
          </button>
        </>
      )}
    </div>
  );
}
