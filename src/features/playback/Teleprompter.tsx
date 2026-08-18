import { useEffect, useRef, useState, type ReactNode } from 'react';

// A teleprompter roll: content enters at mid-screen and rolls up and
// away, then loops endlessly while the screen stays active. Entering
// the screen always restarts from the beginning. Pace is pixels per
// second so short and long content read at the same speed, and the
// first completed pass notifies the parent for auto-advance.
const PX_PER_SEC = { slow: 35, normal: 55, fast: 90 } as const;

export function Teleprompter({
  speed = 'normal',
  active = true,
  paused = false,
  onEnd,
  children,
}: {
  speed?: 'slow' | 'normal' | 'fast';
  /** Whether this screen is the one on stage. Becoming active restarts the roll. */
  active?: boolean;
  /** A deck pause holds the roll in place without restarting it. */
  paused?: boolean;
  onEnd?: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  // Remount the animated node each time the screen becomes active, so
  // the roll starts from the beginning on every entry.
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    if (active) setRunId((n) => n + 1);
  }, [active]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const distance = el.scrollHeight + window.innerHeight * 0.5;
    setDurationMs((distance / PX_PER_SEC[speed]) * 1000);
  }, [speed, runId]);

  return (
    <div
      key={runId}
      ref={ref}
      className="teleprompter absolute inset-x-0 flex flex-col items-center px-8 text-center"
      style={{
        animationDuration: durationMs ? `${durationMs}ms` : undefined,
        animationIterationCount: 'infinite',
        animationPlayState: !durationMs || paused || !active ? 'paused' : 'running',
      }}
      onAnimationIteration={onEnd}
    >
      {children}
    </div>
  );
}
