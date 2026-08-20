import { strings } from '../../config';
import type { Board, PlaylistId } from '../../domain/types';
import { useBoardContext } from '../board/BoardContext';
import { localDate } from '../playback/streak';

const tk = strings.tracker;

// The optional single post-session item. Off by default; asked once per
// session, after the last page and before the completion screen. Its
// score is stored apart from the baselines and never mixed into them.

export function needsPostShift(board: Board, playlistId: PlaylistId): boolean {
  if (!board.settings.postShiftEnabled) return false;
  const date = localDate();
  const pending = (board.pendingRatings ?? []).find(
    (p) => p.date === date && p.playlistId === playlistId,
  );
  if (pending) return pending.postShift === undefined;
  const completion = board.streak.completions.find(
    (c) => c.date === date && c.playlistId === playlistId && !!c.ratedAt,
  );
  if (completion) return completion.postShift === undefined;
  return false;
}

export function PostShiftScreen({
  playlistId,
  onDone,
}: {
  playlistId: PlaylistId;
  onDone: () => void;
}) {
  const { mutate } = useBoardContext();

  const write = (value?: number) => {
    if (value !== undefined) {
      const date = localDate();
      mutate(
        (b: Board) => {
          // The score lands wherever today's rating lives: the pending
          // entry before the session is saved, the completion after a
          // repeat run. First write wins; a repeat run never overwrites.
          const pendings = b.pendingRatings ?? [];
          const pending = pendings.find((p) => p.date === date && p.playlistId === playlistId);
          if (pending) {
            if (pending.postShift !== undefined) return b;
            return {
              ...b,
              pendingRatings: pendings.map((p) =>
                p === pending ? { ...p, postShift: value } : p,
              ),
            };
          }
          return {
            ...b,
            streak: {
              completions: b.streak.completions.map((c) =>
                c.date === date && c.playlistId === playlistId && !!c.ratedAt && c.postShift === undefined
                  ? { ...c, postShift: value }
                  : c,
              ),
            },
          };
        },
        { undoable: false },
      );
    }
    onDone();
  };

  const values: number[] = [];
  for (let v = 1; v <= 10; v++) values.push(v);

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-background px-5 py-6">
      <div className="flex items-center justify-between">
        <span className="font-body text-xs tracking-[0.2em] text-text-muted">{tk.postShiftTitle}</span>
        <button
          type="button"
          onClick={() => write(undefined)}
          className="rounded px-2 py-1 font-body text-sm text-text-muted hover:text-text"
        >
          {tk.skip}
        </button>
      </div>

      <div className="flex grow flex-col items-center justify-center gap-8 text-center">
        <p className="max-w-md font-heading text-3xl font-semibold leading-snug text-text">
          {tk.postShiftItem}
        </p>
        <div className="grid w-full max-w-md grid-cols-5 gap-2">
          {values.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => write(v)}
              className="rounded-lg border border-text-muted/25 py-4 font-body text-lg text-text hover:border-text-muted/60"
            >
              {v}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
