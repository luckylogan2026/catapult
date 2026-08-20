import { useMemo, useState } from 'react';
import { strings, trackerItems } from '../../config';
import { useBoardContext } from '../board/BoardContext';
import { ratedSessionCount } from '../playback/streak';
import {
  addDays,
  chartDates,
  correlations,
  dailyRatings,
  dayValue,
  itemValue,
  rollingSeries,
  type DayRatings,
} from './progress';

const tk = strings.tracker;

// The progress view: 28-day rolling averages, hand-rolled SVG, and
// correlations that stay locked until 60 rated sessions because early
// patterns mislead. No new dependencies anywhere in here.

const W = 640;
const H = 260;
const PAD_L = 26;
const PAD_R = 10;
const PAD_T = 10;
const PAD_B = 22;

function x(i: number, count: number): number {
  if (count <= 1) return PAD_L;
  return PAD_L + (i / (count - 1)) * (W - PAD_L - PAD_R);
}

function y(v: number): number {
  return PAD_T + ((10 - v) / 9) * (H - PAD_T - PAD_B);
}

// A point with no drawable neighbor never shows up in a path, so the
// first rated days would render an empty chart without these.
function isolatedPoints(series: (number | null)[]): { i: number; v: number }[] {
  return series
    .map((v, i) => ({ i, v }))
    .filter(
      (p): p is { i: number; v: number } =>
        p.v !== null && series[p.i - 1] == null && series[p.i + 1] == null,
    );
}

function linePath(series: (number | null)[]): string {
  let path = '';
  let pen = false;
  series.forEach((v, i) => {
    if (v === null) {
      pen = false;
      return;
    }
    path += `${pen ? 'L' : 'M'}${x(i, series.length).toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
  });
  return path;
}

const allItems = [...trackerItems.morning, ...trackerItems.evening].filter(
  (it, i, arr) => arr.findIndex((o) => o.key === it.key) === i,
);

function windowMean(
  days: Map<string, DayRatings>,
  from: string,
  to: string,
  valueOf: (day: DayRatings) => number | null,
): number | null {
  const vals: number[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const day = days.get(d);
    if (!day) continue;
    const v = valueOf(day);
    if (v !== null) vals.push(v);
  }
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

export function ProgressView({ onClose }: { onClose: () => void }) {
  const { board } = useBoardContext();
  const [showRaw, setShowRaw] = useState(false);

  const data = useMemo(() => {
    if (!board) return null;
    const days = dailyRatings(board);
    const dates = chartDates(days);
    const today = dates[dates.length - 1] ?? '';
    return {
      days,
      dates,
      adherence: rollingSeries(days, dates, (d) => dayValue(d, 'adherence')),
      baseline: rollingSeries(days, dates, (d) => dayValue(d, 'baseline')),
      rawAdherence: dates.map((dt) => {
        const d = days.get(dt);
        return d ? dayValue(d, 'adherence') : null;
      }),
      rawBaseline: dates.map((dt) => {
        const d = days.get(dt);
        return d ? dayValue(d, 'baseline') : null;
      }),
      trends: allItems.map((it) => ({
        item: it,
        now: windowMean(days, addDays(today, -27), today, (d) => itemValue(d, it.key)),
        prior: windowMean(days, addDays(today, -55), addDays(today, -28), (d) => itemValue(d, it.key)),
      })),
      rated: ratedSessionCount(board),
      corrs: correlations(days),
    };
  }, [board]);

  if (!board || !data) return null;
  const count = data.dates.length;
  const phrases = tk.inputPhrases as Record<string, string>;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-xl text-text">{tk.progressTitle}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-3 py-1.5 font-body text-sm text-text-muted hover:text-text"
          >
            {strings.common.close}
          </button>
        </div>

        {count === 0 ? (
          <p className="mt-6 font-body text-sm text-text-muted">{tk.notEnoughData}</p>
        ) : (
          <>
            <div className="mt-5 rounded border border-text-muted/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-body text-sm font-medium text-text">{tk.headlineTitle}</p>
                <label className="flex items-center gap-2 font-body text-xs text-text-muted">
                  <input
                    type="checkbox"
                    checked={showRaw}
                    onChange={(ev) => setShowRaw(ev.target.checked)}
                    className="h-3.5 w-3.5 accent-[var(--tc-primary)]"
                  />
                  {tk.rawToggle}
                </label>
              </div>
              <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img">
                {[2, 4, 6, 8, 10].map((v) => (
                  <g key={v}>
                    <line
                      x1={PAD_L}
                      x2={W - PAD_R}
                      y1={y(v)}
                      y2={y(v)}
                      stroke="var(--tc-text-muted)"
                      strokeOpacity="0.15"
                    />
                    <text
                      x={PAD_L - 6}
                      y={y(v) + 3}
                      textAnchor="end"
                      fontSize="10"
                      fill="var(--tc-text-muted)"
                    >
                      {v}
                    </text>
                  </g>
                ))}
                {showRaw &&
                  data.rawAdherence.map((v, i) =>
                    v === null ? null : (
                      <circle key={`a${i}`} cx={x(i, count)} cy={y(v)} r="2" fill="var(--tc-primary)" fillOpacity="0.4" />
                    ),
                  )}
                {showRaw &&
                  data.rawBaseline.map((v, i) =>
                    v === null ? null : (
                      <circle key={`b${i}`} cx={x(i, count)} cy={y(v)} r="2" fill="var(--tc-secondary)" fillOpacity="0.4" />
                    ),
                  )}
                <path d={linePath(data.adherence)} fill="none" stroke="var(--tc-primary)" strokeWidth="2" />
                <path d={linePath(data.baseline)} fill="none" stroke="var(--tc-secondary)" strokeWidth="2" />
                {isolatedPoints(data.adherence).map((p) => (
                  <circle key={`ia${p.i}`} cx={x(p.i, count)} cy={y(p.v)} r="2.5" fill="var(--tc-primary)" />
                ))}
                {isolatedPoints(data.baseline).map((p) => (
                  <circle key={`ib${p.i}`} cx={x(p.i, count)} cy={y(p.v)} r="2.5" fill="var(--tc-secondary)" />
                ))}
                <text x={PAD_L} y={H - 6} fontSize="10" fill="var(--tc-text-muted)">
                  {data.dates[0]}
                </text>
                <text x={W - PAD_R} y={H - 6} textAnchor="end" fontSize="10" fill="var(--tc-text-muted)">
                  {data.dates[count - 1]}
                </text>
              </svg>
              <div className="mt-1 flex flex-wrap gap-4 font-body text-xs text-text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-5 bg-[var(--tc-primary)]" /> {tk.headlineAdherence}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-5 bg-[var(--tc-secondary)]" /> {tk.headlineBaseline}
                </span>
              </div>
            </div>

            <div className="mt-4 rounded border border-text-muted/20 p-3">
              <p className="font-body text-sm font-medium text-text">{tk.itemTrends}</p>
              <div className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                {data.trends.map(({ item, now, prior }) => (
                  <div
                    key={item.key}
                    className="flex items-baseline justify-between gap-2 font-body text-sm"
                  >
                    <span className="truncate text-text-muted">{item.label}</span>
                    <span className="shrink-0 tabular-nums text-text">
                      {now === null ? '·' : now.toFixed(1)}
                      {now !== null && prior !== null && (
                        <span className="ml-1.5 text-xs text-text-muted">
                          {now - prior >= 0 ? '+' : ''}
                          {(now - prior).toFixed(1)}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 rounded border border-text-muted/20 p-3">
              <p className="font-body text-sm font-medium text-text">{tk.correlationsTitle}</p>
              {data.rated < 60 ? (
                <p className="mt-2 font-body text-sm text-text-muted">
                  {tk.correlationsLocked.replace('{n}', String(data.rated))}
                </p>
              ) : data.corrs.length === 0 ? (
                <p className="mt-2 font-body text-sm text-text-muted">{tk.notEnoughData}</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {data.corrs.map((c) => {
                    const template = c.diff >= 0 ? tk.corrHigher : tk.corrLower;
                    const input = phrases[c.inputKey] ?? c.inputKey;
                    return (
                      <li key={`${c.inputKey}:${c.outcomeLabel}`} className="font-body text-sm text-text">
                        {template
                          .replace('{outcome}', c.outcomeLabel)
                          .replace('{diff}', Math.abs(c.diff).toFixed(1))
                          .replace('{input}', input)}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
