import type { Board } from '../../domain/types';
import { trackerItems } from '../../config';
import { localDate } from '../playback/streak';

// Pure computation for the progress view. Ratings come from completed
// sessions and from frozen pendings alike: an abandoned morning is
// still a real morning, and leaving it out would flatter the baseline.

export type DayRatings = { morning?: Record<string, number>; evening?: Record<string, number> };

export function dailyRatings(board: Board): Map<string, DayRatings> {
  const days = new Map<string, DayRatings>();
  const put = (date: string, playlistId: string, scores?: Record<string, number>) => {
    if (!scores) return;
    const d = days.get(date) ?? {};
    if (playlistId === 'morning') d.morning = scores;
    else d.evening = scores;
    days.set(date, d);
  };
  for (const p of board.pendingRatings ?? []) put(p.date, p.playlistId, p.scores);
  // Completions second: where both exist the completed session wins.
  for (const c of board.streak.completions) if (c.ratedAt) put(c.date, c.playlistId, c.scores);
  return days;
}

export function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return localDate(dt);
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

const morningKeys = trackerItems.morning.map((it) => it.key);
const adherenceKeys = ['i_am_session', 'i_pm_session'];

/** The two headline daily values: how well sessions landed, and the
 * morning baseline composite. */
export function dayValue(day: DayRatings, series: 'adherence' | 'baseline'): number | null {
  if (series === 'adherence') {
    const sc = day.evening ?? {};
    return mean(adherenceKeys.filter((k) => typeof sc[k] === 'number').map((k) => sc[k]));
  }
  const sc = day.morning ?? {};
  return mean(morningKeys.filter((k) => typeof sc[k] === 'number').map((k) => sc[k]));
}

export function itemValue(day: DayRatings, key: string): number | null {
  const sc = { ...(day.morning ?? {}), ...(day.evening ?? {}) };
  return typeof sc[key] === 'number' ? sc[key] : null;
}

/** 28-day trailing mean of a per-day value, for every day in the chart
 * range. Null where the window holds no data at all. */
export function rollingSeries(
  days: Map<string, DayRatings>,
  dates: string[],
  valueOf: (day: DayRatings) => number | null,
): (number | null)[] {
  return dates.map((date) => {
    const window: number[] = [];
    for (let i = 0; i < 28; i++) {
      const d = days.get(addDays(date, -i));
      if (!d) continue;
      const v = valueOf(d);
      if (v !== null) window.push(v);
    }
    return mean(window);
  });
}

/** Chart date range: first rated day through today, clamped to a year. */
export function chartDates(days: Map<string, DayRatings>): string[] {
  if (!days.size) return [];
  const today = localDate();
  let first = [...days.keys()].sort()[0];
  if (first < addDays(today, -364)) first = addDays(today, -364);
  const dates: string[] = [];
  for (let d = first; d <= today; d = addDays(d, 1)) dates.push(d);
  return dates;
}

export function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

export type Correlation = {
  inputKey: string;
  outcomeLabel: string;
  r: number;
  /** Mean outcome on days the input happened minus days it did not,
   * or above versus below the input's median when it always happens. */
  diff: number;
};

/** Input-outcome correlations over the trailing 90 days: Pearson ranks
 * the pairs, a group difference phrases them. Ten paired days minimum
 * per pair; negatives included, because "worse when you skip" is the
 * finding that matters most. */
export function correlations(days: Map<string, DayRatings>): Correlation[] {
  const cutoff = addDays(localDate(), -89);
  const evenings = [...days.entries()]
    .filter(([date, d]) => date >= cutoff && d.evening)
    .map(([, d]) => d.evening as Record<string, number>);
  const inputs = trackerItems.evening.filter((it) => it.type === 'input');
  const outcomes = trackerItems.evening.filter((it) => it.type === 'outcome');
  const out: Correlation[] = [];
  for (const input of inputs) {
    for (const outcome of outcomes) {
      const pairs = evenings
        .filter((sc) => typeof sc[input.key] === 'number' && typeof sc[outcome.key] === 'number')
        .map((sc) => [sc[input.key], sc[outcome.key]] as const);
      if (pairs.length < 10) continue;
      const r = pearson(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
      if (r === null) continue;
      const zeros = pairs.some((p) => p[0] === 0);
      const xs = [...pairs.map((p) => p[0])].sort((a, b) => a - b);
      const split = zeros ? 0.5 : xs[Math.floor(xs.length / 2)];
      const hi = pairs.filter((p) => p[0] > split).map((p) => p[1]);
      const lo = pairs.filter((p) => p[0] <= split).map((p) => p[1]);
      const mh = mean(hi);
      const ml = mean(lo);
      if (mh === null || ml === null) continue;
      out.push({ inputKey: input.key, outcomeLabel: outcome.label, r, diff: mh - ml });
    }
  }
  return out.sort((a, b) => Math.abs(b.r) - Math.abs(a.r)).slice(0, 5);
}
