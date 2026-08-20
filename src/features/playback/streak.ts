import type { Board, PendingRating, PlaylistId, SessionCompletion } from '../../domain/types';

// Streaks: consecutive calendar days with at least one completed
// session, counted back from today, or from yesterday when today has
// not happened yet. Never a shaming message anywhere; the number just
// reflects reality.

export function localDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function previousDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return localDate(dt);
}

export function computeStreak(
  completions: SessionCompletion[],
  playlistId?: PlaylistId,
): number {
  const days = new Set(
    completions.filter((c) => !playlistId || c.playlistId === playlistId).map((c) => c.date),
  );
  if (!days.size) return 0;
  let cursor = localDate();
  if (!days.has(cursor)) cursor = previousDate(cursor);
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    cursor = previousDate(cursor);
  }
  return streak;
}

/** Union of two completion histories, one entry per day and playlist,
 * the later completion winning. Sync merges with this so no device can
 * erase another's finished sessions. */
export function mergeCompletions(
  a: SessionCompletion[],
  b: SessionCompletion[],
): SessionCompletion[] {
  const byKey = new Map<string, SessionCompletion>();
  for (const c of [...a, ...b]) {
    const key = `${c.date}:${c.playlistId}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, c);
      continue;
    }
    // Later completion wins the record, but the EARLIEST rating wins
    // the rating fields: a re-rating on a second device an hour later
    // is post-practice for the human however fresh the record looks.
    const later = c.completedAt > prev.completedAt ? c : prev;
    const earlierRated = [c, prev]
      .filter((x) => x.ratedAt)
      .sort((x, y) => (x.ratedAt as string).localeCompare(y.ratedAt as string))[0];
    const merged: SessionCompletion = { ...later };
    if (earlierRated && earlierRated.ratedAt !== later.ratedAt) {
      merged.scores = earlierRated.scores;
      merged.ratedAt = earlierRated.ratedAt;
      merged.postShift = earlierRated.postShift;
    }
    byKey.set(key, merged);
  }
  return [...byKey.values()].sort((x, y) => x.completedAt.localeCompare(y.completedAt));
}

/** The same earliest-rating rule for the pending holding area. */
export function mergePendingRatings(
  a: PendingRating[],
  b: PendingRating[],
): PendingRating[] {
  const byKey = new Map<string, PendingRating>();
  for (const p of [...a, ...b]) {
    const key = `${p.date}:${p.playlistId}`;
    const prev = byKey.get(key);
    if (!prev || p.ratedAt < prev.ratedAt) byKey.set(key, p);
  }
  return [...byKey.values()].sort((x, y) => x.ratedAt.localeCompare(y.ratedAt));
}

/** A pending rating for this date and playlist, or a completion that
 * already carries a rating: either satisfies the pre-practice gate. */
export function hasRatingFor(board: Board, playlistId: PlaylistId, date = localDate()): boolean {
  if ((board.pendingRatings ?? []).some((p) => p.date === date && p.playlistId === playlistId)) {
    return true;
  }
  return board.streak.completions.some(
    (c) => c.date === date && c.playlistId === playlistId && !!c.ratedAt,
  );
}

/** Frozen pendings: ratings whose session was never completed. Clean
 * pre-practice data, kept forever. */
export function frozenPendings(board: Board): PendingRating[] {
  const today = localDate();
  const completed = new Set(
    board.streak.completions.map((c) => `${c.date}:${c.playlistId}`),
  );
  return (board.pendingRatings ?? []).filter(
    (p) => p.date < today && !completed.has(`${p.date}:${p.playlistId}`),
  );
}

/** Sessions that carry a rating, completed or frozen. The anchors
 * offer keys off this count. */
export function ratedSessionCount(board: Board): number {
  return (
    board.streak.completions.filter((c) => !!c.ratedAt).length +
    frozenPendings(board).filter((p) => !!p.scores).length
  );
}

/** Records today's completion for a playlist, one entry per day, the
 * note replacing any earlier one. */
export function recordCompletion(
  completions: SessionCompletion[],
  playlistId: PlaylistId,
  note: string,
  priorities = '',
  rating?: { scores?: Record<string, number>; ratedAt?: string; postShift?: number },
): SessionCompletion[] {
  const date = localDate();
  const existing = completions.find((c) => c.date === date && c.playlistId === playlistId);
  const rest = completions.filter((c) => !(c.date === date && c.playlistId === playlistId));
  // The first rating of the day is the clean pre-practice one; a second
  // run's rating follows a dose already administered. Earliest ratedAt
  // keeps scores, ratedAt, and postShift.
  const candidates = [existing, rating].filter(
    (r): r is NonNullable<typeof r> => !!r?.ratedAt,
  );
  const keeper = candidates.sort((x, y) =>
    (x.ratedAt as string).localeCompare(y.ratedAt as string),
  )[0];
  return [
    ...rest,
    {
      date,
      playlistId,
      completedAt: new Date().toISOString(),
      note: note.trim() || undefined,
      priorities: priorities.trim() || undefined,
      scores: keeper?.scores,
      ratedAt: keeper?.ratedAt,
      postShift: keeper?.postShift,
    },
  ];
}
