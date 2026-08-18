import type { PlaylistId, SessionCompletion } from '../../domain/types';

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

/** Records today's completion for a playlist, one entry per day, the
 * note replacing any earlier one. */
export function recordCompletion(
  completions: SessionCompletion[],
  playlistId: PlaylistId,
  note: string,
): SessionCompletion[] {
  const date = localDate();
  const rest = completions.filter((c) => !(c.date === date && c.playlistId === playlistId));
  return [
    ...rest,
    { date, playlistId, completedAt: new Date().toISOString(), note: note.trim() || undefined },
  ];
}
