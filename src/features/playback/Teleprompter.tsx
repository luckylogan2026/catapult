import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';

// A teleprompter roll: content enters at mid-screen and rolls up and
// away, then loops endlessly while the screen stays active. Entering
// the screen always restarts from the beginning. Pace is pixels per
// second so short and long content read at the same speed, and each
// completed pass notifies the parent for auto-advance. The roll is
// driven by a frame loop rather than a CSS animation so a vertical
// swipe can scrub it directly; reduced-motion users keep a plain
// scrollable column instead.
const PX_PER_SEC = { slow: 35, normal: 55, fast: 90 } as const;

export type RollScrub = (dyPixels: number) => void;

export function Teleprompter({
  speed = 'normal',
  active = true,
  paused = false,
  onEnd,
  scrubRef,
  children,
}: {
  speed?: 'slow' | 'normal' | 'fast';
  /** Whether this screen is the one on stage. Becoming active restarts the roll. */
  active?: boolean;
  /** A deck pause holds the roll in place without restarting it. */
  paused?: boolean;
  onEnd?: () => void;
  /** The deck routes vertical drags here while a roll is on stage. */
  scrubRef?: MutableRefObject<RollScrub | null>;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [runId, setRunId] = useState(0);
  const activeRef = useRef(active);
  const pausedRef = useRef(paused);
  const onEndRef = useRef(onEnd);
  activeRef.current = active;
  pausedRef.current = paused;
  onEndRef.current = onEnd;

  useEffect(() => {
    if (active) setRunId((n) => n + 1);
  }, [active]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let offset = 0;
    const distance = () => el.scrollHeight + window.innerHeight * 0.5;
    const apply = () => {
      el.style.transform = `translateY(${window.innerHeight * 0.5 - offset}px)`;
    };
    apply();
    if (scrubRef && activeRef.current) {
      scrubRef.current = (dy) => {
        // Finger up advances the roll, like scrolling a page.
        offset = Math.max(0, Math.min(distance(), offset - dy));
        apply();
      };
    }
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = Math.min(0.25, (t - last) / 1000);
      last = t;
      if (activeRef.current && !pausedRef.current) {
        offset += PX_PER_SEC[speed] * dt;
        if (offset >= distance()) {
          offset = 0;
          onEndRef.current?.();
        }
        apply();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (scrubRef?.current) scrubRef.current = null;
    };
  }, [runId, speed, scrubRef]);

  return (
    <div
      key={runId}
      ref={ref}
      className="teleprompter absolute inset-x-0 flex flex-col items-center px-8 text-center"
    >
      {children}
    </div>
  );
}
