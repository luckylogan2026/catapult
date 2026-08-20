import { useMemo, useRef, useState } from 'react';
import { strings, trackerItems, type TrackerItem } from '../../config';
import type { Board, PlaylistId } from '../../domain/types';
import { useBoardContext } from '../board/BoardContext';
import { localDate, mergePendingRatings } from '../playback/streak';

const tk = strings.tracker;

// The pre-practice rating screen. Every item on one page, one compact
// radio row per item so the whole set fits with minimal scrolling.
// Used twice a day for years: fast, thumb-only, boring on purpose. No
// previous scores shown, no colors, no commentary.

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
  const hasZeroItems = items.some((it) => it.min === 0);

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
    // First answer on a row nudges the page forward so the thumb never
    // has to scroll; re-taps just change the value in place.
    if (wasNew) {
      const idx = items.findIndex((it) => it.key === item.key);
      const next = items[idx + 1];
      if (next) rowRefs.current[next.key]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between border-b border-text-muted/15 px-4 py-2">
        <span className="font-body text-xs tracking-[0.2em] text-text-muted">
          {tk.positionOf.replace('{n}', String(answered)).replace('{total}', String(items.length))}
        </span>
        {hasZeroItems && (
          <span className="font-body text-[11px] text-text-muted">0: {tk.zeroLabel}</span>
        )}
        <button
          type="button"
          onClick={() => writePending(undefined)}
          className="rounded px-2 py-1 font-body text-sm text-text-muted hover:text-text"
        >
          {tk.skip}
        </button>
      </div>

      <div className="grow overflow-y-auto px-3 pb-4 pt-1">
        <div className="mx-auto flex max-w-md flex-col">
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
                className="scroll-mt-2 border-b border-text-muted/10 py-2 last:border-b-0"
              >
                <p
                  className="font-body text-sm font-medium leading-snug text-text"
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
                  <p className="font-body text-xs text-text-muted">10: {anchors[item.key]}</p>
                )}
                <div className="mt-0.5 flex" role="radiogroup" aria-label={item.label}>
                  {values.map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={selected === v}
                      onClick={() => pick(item, v)}
                      className="flex flex-1 flex-col items-center gap-0.5 py-1"
                    >
                      <span
                        className={`h-4 w-4 rounded-full border ${
                          selected === v
                            ? 'border-primary bg-primary'
                            : 'border-text-muted/40'
                        }`}
                      />
                      <span
                        className={`font-body text-[10px] leading-none ${
                          selected === v ? 'text-text' : 'text-text-muted'
                        }`}
                      >
                        {v}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="shrink-0 border-t border-text-muted/15 px-4 py-2.5">
        <button
          type="button"
          disabled={answered === 0}
          onClick={() => writePending({ ...scores })}
          className="mx-auto block w-full max-w-md rounded bg-primary px-8 py-2.5 font-body text-base font-medium text-background disabled:opacity-40"
        >
          {tk.save}
        </button>
      </div>
    </div>
  );
}
