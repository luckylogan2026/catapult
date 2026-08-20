import { useMemo, useRef, useState } from 'react';
import { strings, trackerItems, type TrackerItem } from '../../config';
import type { Board, PlaylistId } from '../../domain/types';
import { useBoardContext } from '../board/BoardContext';
import { localDate, mergePendingRatings } from '../playback/streak';

const tk = strings.tracker;

// The pre-practice rating screen. One item at a time, a large tap row,
// auto-advance, back always available, skippable always. Used twice a
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

export function RatingsScreen({
  playlistId,
  onDone,
}: {
  playlistId: PlaylistId;
  onDone: () => void;
}) {
  const { board, mutate } = useBoardContext();
  const items = useMemo(() => itemsFor(playlistId), [playlistId]);
  const [index, setIndex] = useState(0);
  const scoresRef = useRef<Record<string, number>>({});
  const [, bump] = useState(0);
  const [anchorShown, setAnchorShown] = useState(false);
  const longPress = useRef<number | undefined>(undefined);

  if (!board) return null;
  const item = items[index];
  const anchors = board.settings.anchors ?? {};

  const writePending = (scores?: Record<string, number>) => {
    const entry = {
      date: localDate(),
      playlistId,
      ratedAt: new Date().toISOString(),
      scores,
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

  const pick = (value: number) => {
    scoresRef.current[item.key] = value;
    if (index + 1 >= items.length) {
      writePending({ ...scoresRef.current });
    } else {
      setIndex(index + 1);
      setAnchorShown(false);
      bump((n) => n + 1);
    }
  };

  const values: number[] = [];
  for (let v = item.min; v <= 10; v++) values.push(v);
  const selected = scoresRef.current[item.key];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background px-5 py-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => {
            setIndex(Math.max(0, index - 1));
            setAnchorShown(false);
          }}
          className="rounded px-2 py-1 font-body text-sm text-text-muted disabled:opacity-0"
        >
          ← {tk.back}
        </button>
        <span className="font-body text-xs tracking-[0.2em] text-text-muted">
          {tk.positionOf.replace('{n}', String(index + 1)).replace('{total}', String(items.length))}
        </span>
        <button
          type="button"
          onClick={() => writePending(undefined)}
          className="rounded px-2 py-1 font-body text-sm text-text-muted hover:text-text"
        >
          {tk.skip}
        </button>
      </div>

      <div className="flex grow flex-col items-center justify-center gap-8 text-center">
        <p
          className="max-w-md font-heading text-3xl font-semibold leading-snug text-text"
          onPointerDown={() => {
            longPress.current = window.setTimeout(() => setAnchorShown(true), 450);
          }}
          onPointerUp={() => window.clearTimeout(longPress.current)}
          onPointerLeave={() => window.clearTimeout(longPress.current)}
          onMouseEnter={() => anchors[item.key] && setAnchorShown(true)}
          onMouseLeave={() => setAnchorShown(false)}
        >
          {item.label}
        </p>
        {anchorShown && anchors[item.key] && (
          <p className="max-w-md font-body text-sm text-text-muted">10: {anchors[item.key]}</p>
        )}

        <div className="grid w-full max-w-md grid-cols-5 gap-2">
          {values.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => pick(v)}
              className={`rounded-lg border py-4 font-body text-lg ${
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
          <p className="font-body text-xs text-text-muted">0: {tk.zeroLabel}</p>
        )}
      </div>
    </div>
  );
}
