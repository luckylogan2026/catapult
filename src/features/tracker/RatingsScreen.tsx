import { useMemo, useRef, useState } from 'react';
import { strings, trackerItems, type TrackerItem } from '../../config';
import type { Board, PlaylistId } from '../../domain/types';
import { useBoardContext } from '../board/BoardContext';
import { localDate, mergePendingRatings } from '../playback/streak';

const tk = strings.tracker;

// The pre-practice rating screen. Every item on one scrolling page,
// large tap rows, skippable always. Used twice a day for years: fast,
// thumb-only, boring on purpose. No previous scores shown, no colors,
// no commentary.

function isWeekend(): boolean {
  const d = new Date().getDay();
  return d === 0 || d === 6;
}

export function itemsFor(playlistId: PlaylistId): TrackerItem[] {
  const set = playlistId === 'morning' ? trackerItems.morning : trackerItems.evening;
  return set.filter((it) => !(it.weekdaysOnly && isWeekend()));
}

export function RatingsScreen({
  playlistId,
  onDone,
}: {
  playlistId: PlaylistId;
  onDone: () => void;
}) {
  const { board, mutate } = useBoardContext();
  const items = useMemo(() => itemsFor(playlistId), [playlistId]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [anchorFor, setAnchorFor] = useState<string | null>(null);
  const longPress = useRef<number | undefined>(undefined);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  if (!board) return null;
  const anchors = board.settings.anchors ?? {};
  const answered = Object.keys(scores).length;

  const writePending = (sc?: Record<string, number>) => {
    const entry = {
      date: localDate(),
      playlistId,
      ratedAt: new Date().toISOString(),
      scores: sc && Object.keys(sc).length ? sc : undefined,
    };
    mutate(
      (b: Board) => ({
        ...b,
        pendingRatings: mergePendingRatings(b.pendingRatings ?? [], [entry]),
      }),
      { undoable: false },
    );
    onDone();
  };

  const pick = (item: TrackerItem, value: number) => {
    const wasNew = scores[item.key] === undefined;
    setScores((s) => ({ ...s, [item.key]: value }));
    // First answer on a row walks the page forward so the thumb never
    // has to scroll; re-taps just change the value in place.
    if (wasNew) {
      const idx = items.findIndex((it) => it.key === item.key);
      const next = items[idx + 1];
      if (next) rowRefs.current[next.key]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between border-b border-text-muted/15 px-4 py-2.5">
        <span className="font-body text-xs tracking-[0.2em] text-text-muted">
          {tk.positionOf.replace('{n}', String(answered)).replace('{total}', String(items.length))}
        </span>
        <button
          type="button"
          onClick={() => writePending(undefined)}
          className="rounded px-2 py-1 font-body text-sm text-text-muted hover:text-text"
        >
          {tk.skip}
        </button>
      </div>

      <div className="grow overflow-y-auto px-4 pb-6 pt-2">
        <div className="mx-auto flex max-w-md flex-col gap-5">
          {items.map((item) => {
            const values: number[] = [];
            for (let v = item.min; v <= 10; v++) values.push(v);
            const selected = scores[item.key];
            return (
              <div
                key={item.key}
                ref={(el) => {
                  rowRefs.current[item.key] = el;
                }}
                className="scroll-mt-4"
              >
                <p
                  className="font-heading text-lg font-semibold leading-snug text-text"
                  onPointerDown={() => {
                    longPress.current = window.setTimeout(() => setAnchorFor(item.key), 450);
                  }}
                  onPointerUp={() => window.clearTimeout(longPress.current)}
                  onPointerLeave={() => window.clearTimeout(longPress.current)}
                  onMouseEnter={() => anchors[item.key] && setAnchorFor(item.key)}
                  onMouseLeave={() => setAnchorFor((k) => (k === item.key ? null : k))}
                >
                  {item.label}
                </p>
                {anchorFor === item.key && anchors[item.key] && (
                  <p className="mt-1 font-body text-xs text-text-muted">10: {anchors[item.key]}</p>
                )}
                <div className={`mt-2 grid gap-1.5 ${item.min === 0 ? 'grid-cols-6' : 'grid-cols-5'}`}>
                  {values.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => pick(item, v)}
                      className={`rounded-lg border py-2.5 font-body text-base ${
                        selected === v
                          ? 'border-primary bg-surface text-text'
                          : 'border-text-muted/25 text-text hover:border-text-muted/60'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                {item.min === 0 && (
                  <p className="mt-1 font-body text-[11px] text-text-muted">0: {tk.zeroLabel}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="shrink-0 border-t border-text-muted/15 px-4 py-3">
        <button
          type="button"
          disabled={answered === 0}
          onClick={() => writePending({ ...scores })}
          className="mx-auto block w-full max-w-md rounded bg-primary px-8 py-3 font-body text-base font-medium text-background disabled:opacity-40"
        >
          {tk.save}
        </button>
      </div>
    </div>
  );
}
