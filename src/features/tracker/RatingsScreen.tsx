import { useMemo, useRef, useState } from 'react';
import { strings, trackerItems, type TrackerItem } from '../../config';
import type { Board, PlaylistId } from '../../domain/types';
import { useBoardContext } from '../board/BoardContext';
import { localDate, mergePendingRatings } from '../playback/streak';

const tk = strings.tracker;

// The pre-practice rating screen. Every item on one screen, no
// scrolling: each item is a label over a full-width tap bar of discrete
// segments. The bar starts empty (no thumb, no default) so nothing
// anchors the answer; tap or drag and release to set it. Used twice a
// day for years: fast, thumb-only, boring on purpose. No previous
// scores shown, no colors, no commentary.

function isWeekend(): boolean {
  const d = new Date().getDay();
  return d === 0 || d === 6;
}

export function itemsFor(playlistId: PlaylistId): TrackerItem[] {
  const set = playlistId === 'morning' ? trackerItems.morning : trackerItems.evening;
  return set.filter((it) => !(it.weekdaysOnly && isWeekend()));
}

function valueAt(clientX: number, el: HTMLElement, min: number): number {
  const rect = el.getBoundingClientRect();
  const frac = Math.min(0.999, Math.max(0, (clientX - rect.left) / rect.width));
  const count = 10 - min + 1;
  return min + Math.floor(frac * count);
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
  const dragging = useRef<string | null>(null);

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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between border-b border-text-muted/15 px-4 py-1.5">
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

      {/* The inner column is capped by item count so a tall desktop
          window centers a compact block instead of spreading rows
          across the whole height; on a phone the cap exceeds the
          viewport and the rows spread evenly to fill it exactly. */}
      <div className="flex grow flex-col items-center justify-center overflow-y-auto px-3 py-1">
        <div
          className="flex w-full max-w-md grow flex-col justify-evenly"
          style={{ maxHeight: items.length * 62 }}
        >
        {items.map((item) => {
          const values: number[] = [];
          for (let v = item.min; v <= 10; v++) values.push(v);
          const selected = scores[item.key];
          return (
            <div key={item.key} className="w-full shrink-0 py-[1px]">
              <p
                className="font-body text-sm font-medium leading-tight text-text md:text-base"
                onPointerDown={() => {
                  longPress.current = window.setTimeout(() => setAnchorFor(item.key), 450);
                }}
                onPointerUp={() => window.clearTimeout(longPress.current)}
                onPointerLeave={() => window.clearTimeout(longPress.current)}
                onMouseEnter={() => anchors[item.key] && setAnchorFor(item.key)}
                onMouseLeave={() => setAnchorFor((k) => (k === item.key ? null : k))}
              >
                {item.label}
                {anchorFor === item.key && anchors[item.key] && (
                  <span className="ml-2 font-normal text-text-muted">10: {anchors[item.key]}</span>
                )}
              </p>
              <div
                role="slider"
                aria-label={item.label}
                aria-valuemin={item.min}
                aria-valuemax={10}
                aria-valuenow={selected}
                tabIndex={0}
                className="mt-[2px] flex h-5 w-full cursor-pointer select-none overflow-hidden rounded border border-text-muted/25 md:h-7"
                style={{ touchAction: 'none' }}
                onPointerDown={(ev) => {
                  dragging.current = item.key;
                  try {
                    ev.currentTarget.setPointerCapture(ev.pointerId);
                  } catch {
                    // Synthetic events carry no active pointer; taps still work.
                  }
                  const v = valueAt(ev.clientX, ev.currentTarget, item.min);
                  setScores((s) => ({ ...s, [item.key]: v }));
                }}
                onPointerMove={(ev) => {
                  if (dragging.current !== item.key) return;
                  const v = valueAt(ev.clientX, ev.currentTarget, item.min);
                  setScores((s) => ({ ...s, [item.key]: v }));
                }}
                onPointerUp={() => {
                  dragging.current = null;
                }}
                onKeyDown={(ev) => {
                  if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
                  ev.preventDefault();
                  const delta = ev.key === 'ArrowRight' ? 1 : -1;
                  setScores((s) => {
                    const cur = s[item.key];
                    const next = cur === undefined ? (delta > 0 ? item.min : 10) : Math.min(10, Math.max(item.min, cur + delta));
                    return { ...s, [item.key]: next };
                  });
                }}
              >
                {values.map((v) => (
                  <span
                    key={v}
                    className={`pointer-events-none flex flex-1 items-center justify-center border-r border-text-muted/15 font-body text-xs leading-none last:border-r-0 md:text-sm ${
                      selected === undefined
                        ? 'text-text-muted'
                        : v === selected
                          ? 'bg-primary font-semibold text-background'
                          : v < selected
                            ? 'bg-primary/20 text-text'
                            : 'text-text-muted'
                    }`}
                  >
                    {v}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
        </div>
      </div>

      <div className="shrink-0 border-t border-text-muted/15 px-4 py-2">
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
