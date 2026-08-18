import { useEffect, useRef, useState, type ReactNode } from 'react';

// A teleprompter roll: content enters at mid-screen and rolls up and
// away. Pace is pixels per second so short and long content read at the
// same speed, and the parent hears the end for auto-advance.
const PX_PER_SEC = { slow: 35, normal: 55, fast: 90 } as const;

export function Teleprompter({
  speed = 'normal',
  paused = false,
  onEnd,
  children,
}: {
  speed?: 'slow' | 'normal' | 'fast';
  paused?: boolean;
  onEnd?: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Travel: from half the viewport down to fully past the top.
    const distance = el.scrollHeight + window.innerHeight * 0.5;
    setDurationMs((distance / PX_PER_SEC[speed]) * 1000);
  }, [speed]);

  return (
    <div
      ref={ref}
      className="teleprompter absolute inset-x-0 flex flex-col items-center px-8 text-center"
      style={{
        animationDuration: durationMs ? `${durationMs}ms` : undefined,
        animationPlayState: !durationMs || paused ? 'paused' : 'running',
      }}
      onAnimationEnd={onEnd}
    >
      {children}
    </div>
  );
}
