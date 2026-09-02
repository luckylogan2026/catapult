import { useCallback, useEffect, useRef, useState } from 'react';
import { strings } from '../../config';
import type { PlaylistId } from '../../domain/types';
import { useBoardContext } from '../board/BoardContext';
import { kvGet, kvSet } from '../../db/kv';
import { ensureBackdrops } from '../../lib/backdrop';
import { buildScreens, drawAffirmations, screenKey, type Screen } from './screens';
import { ScreenView } from './ScreenView';
import { useScreenAudio } from './useScreenAudio';
import { CompletionScreen } from './CompletionScreen';
import { PostShiftScreen, needsPostShift } from '../tracker/PostShiftScreen';
import { useSessionAudio } from './useSessionAudio';
import { localDate } from './streak';
import type { RollScrub } from './Teleprompter';

const p = strings.playback;

// The swipe deck. The single most important interaction in the product:
// the page tracks the finger one to one, a flick past twenty percent of
// the width or a fast flick commits, short drags spring back, gestures
// interrupt mid-animation, the first and last screens rubber-band, and
// a dead zone at the left edge leaves the browser's back gesture alone.
const COMMIT_FRACTION = 0.2;
const COMMIT_VELOCITY = 0.5; // px per ms
const EDGE_DEAD_ZONE = 24;

export function PlaybackScreen({
  playlistId,
  onExit,
  onComplete,
}: {
  playlistId: PlaylistId;
  onExit: () => void;
  /** Called instead of onExit when the session ended via Save and
   * finish, so the caller can confirm the save. */
  onComplete?: () => void;
}) {
  const { board, mutate } = useBoardContext();
  const [screens, setScreens] = useState<Screen[] | null>(null);
  const [index, setIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [animating, setAnimating] = useState(false);
  // Crossfade bookkeeping: non-drag advances fade, per the brief. Only
  // finger drags slide, because the page must track the finger.
  const [fadeFrom, setFadeFrom] = useState<number | null>(null);
  const fadeTimer = useRef<number | undefined>(undefined);
  const [chrome, setChrome] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [postShiftOpen, setPostShiftOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startY: number; lastX: number; lastY?: number; lastT: number; active: boolean; horizontal?: boolean } | null>(null);
  // Vertical drags on a rolling screen scrub the teleprompter directly.
  const rollScrub = useRef<RollScrub | null>(null);

  const playlist = board?.playlists.find((pl) => pl.id === playlistId);

  // Build the screen list once per session: draw affirmations from the
  // rotating ring, fill in missing backdrops, then freeze the list so a
  // background autosave never reshuffles mid-run.
  useEffect(() => {
    if (!board || !playlist) return;
    let cancelled = false;
    void (async () => {
      const ringKey = `affirmationRing:${playlistId}`;
      const ring = (await kvGet<{ seed: number; position: number }>(ringKey)) ?? {
        seed: Math.floor(Math.random() * 2147483647) || 1,
        position: 0,
      };
      const { drawn, nextPosition } = drawAffirmations(
        board.affirmations,
        playlist.affirmationMode,
        playlist.shuffleCount,
        ring.seed,
        ring.position,
      );
      await kvSet(ringKey, { seed: ring.seed, position: nextPosition });

      const built = buildScreens(board, playlistId, drawn);
      if (cancelled) return;
      setScreens(built);

      const withBackdrops = await ensureBackdrops(board, built.map((s) => s.page.id));
      if (withBackdrops && !cancelled) {
        mutate(() => withBackdrops, { undoable: false });
        setScreens(buildScreens(withBackdrops, playlistId, drawn));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistId]);

  const count = screens?.length ?? 0;
  const current = screens?.[index];
  const { setDucked, fadeOut } = useSessionAudio(playlist);
  const [voiceActive, setVoiceActive] = useState(false);
  const onForeground = useCallback(
    (a: boolean) => {
      setDucked(a);
      setVoiceActive(a);
    },
    [setDucked],
  );
  // Browser vertical gestures must not run the session: a downward
  // drag at the top would otherwise trigger pull-to-refresh, reload
  // the page, and dump the user back into the editor mid-session.
  useEffect(() => {
    const root = document.documentElement;
    const prevRoot = root.style.overscrollBehaviorY;
    const prevBody = document.body.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = 'none';
    document.body.style.overscrollBehaviorY = 'none';
    return () => {
      root.style.overscrollBehaviorY = prevRoot;
      document.body.style.overscrollBehaviorY = prevBody;
    };
  }, []);

  // Keep the screen on for the whole run: a session is read, not
  // tapped, and the phone's idle timeout would otherwise darken the
  // affirmations mid-roll. Re-acquired when the tab comes back, and
  // the phone's own power button still works as usual.
  useEffect(() => {
    type WakeLockLike = { release: () => Promise<void> };
    type NavWake = { wakeLock?: { request: (t: 'screen') => Promise<WakeLockLike> } };
    const nav = navigator as unknown as NavWake;
    if (!nav.wakeLock) return;
    let lock: WakeLockLike | null = null;
    let alive = true;
    const acquire = async () => {
      if (!alive || document.visibilityState !== 'visible') return;
      try {
        lock = await nav.wakeLock!.request('screen');
        (lock as unknown as EventTarget).addEventListener?.('release', () => {
          if (alive && document.visibilityState === 'visible') void acquire();
        });
      } catch {
        // Denied or unsupported in this context: the run still plays.
      }
    };
    const onVis = () => void acquire();
    void acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release().catch(() => {});
    };
  }, []);

  const { pendingTap, startPending, stop } = useScreenAudio(
    board!,
    playlist,
    current,
    !!screens && !completed,
    onForeground,
  );

  const goTo = useCallback(
    (next: number, mode: 'slide' | 'fade' = 'fade') => {
      if (!count) return;
      if (next >= count) {
        setCompleted(true);
        return;
      }
      setCompleted(false);
      const clamped = Math.max(0, Math.min(count - 1, next));
      setIndex((prev) => {
        if (clamped !== prev && mode === 'fade') {
          setFadeFrom(prev);
          window.clearTimeout(fadeTimer.current);
          fadeTimer.current = window.setTimeout(() => setFadeFrom(null), 420);
        }
        return clamped;
      });
      setDragX(0);
      setAnimating(mode === 'slide');
      setProgress(0);
    },
    [count],
  );

  useEffect(() => {
    if (completed) {
      stop();
      fadeOut();
      // A repeat run of an already-saved session has nothing left to
      // record: skip the end page and return to the editor.
      const done = board?.streak.completions.some(
        (c) => c.date === localDate() && c.playlistId === playlistId,
      );
      if (done) {
        onExit();
        return;
      }
      setPostShiftOpen(board ? needsPostShift(board, playlistId) : false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed]);

  const advance = useCallback((mode: 'slide' | 'fade' = 'fade') => goTo(index + 1, mode), [goTo, index]);
  const back = useCallback((mode: 'slide' | 'fade' = 'fade') => goTo(index - 1, mode), [goTo, index]);

  // Dwell timer with the hairline progress at the very bottom edge.
  const autoAdvance = playlist?.autoAdvance ?? false;
  const dwellMs = ((current?.page.dwellSeconds ?? playlist?.dwellSeconds ?? 6) * 1000) || 6000;
  const isRoll =
    current?.kind === 'affirmation-roll' ||
    (current?.kind === 'page' && current.textFlow && !!current.page.textRoll);
  useEffect(() => {
    // Audio owns the page: the countdown starts only after the voice or
    // narration finishes. Looping audio holds the page for a swipe.
    if (!autoAdvance || paused || !screens || index >= count - 1 || isRoll || voiceActive) return;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const f = (t - start) / dwellMs;
      if (f >= 1) {
        advance();
        return;
      }
      setProgress(f);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autoAdvance, paused, index, dwellMs, advance, screens, count, isRoll, voiceActive]);

  // Keyboard: arrows, space, escape.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const el = ev.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) return;
      if (ev.key === 'ArrowRight' || ev.key === ' ') {
        ev.preventDefault();
        advance();
      } else if (ev.key === 'ArrowLeft') {
        ev.preventDefault();
        back();
      } else if (ev.key === 'Escape') {
        stop();
        onExit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [advance, back, onExit, stop]);

  // Pointer gestures.
  const width = () => containerRef.current?.clientWidth ?? window.innerWidth;

  const onPointerDown = (ev: React.PointerEvent) => {
    // The completion and post-shift screens own their pointers: the
    // deck's capture would retarget pointerup to the container and
    // real clicks on their buttons would never fire. (Programmatic
    // .click() in tests bypasses the pointer pipeline, which is why
    // this went unseen until a human clicked Save and finish.)
    if (completed) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    if (ev.clientX < EDGE_DEAD_ZONE) return;
    drag.current = {
      startX: ev.clientX,
      startY: ev.clientY,
      lastX: ev.clientX,
      lastT: performance.now(),
      active: true,
    };
    setAnimating(false);
    containerRef.current?.setPointerCapture(ev.pointerId);
  };

  const onPointerMove = (ev: React.PointerEvent) => {
    if (completed) return;
    const d = drag.current;
    if (!d?.active) return;
    const dx = ev.clientX - d.startX;
    const dy = ev.clientY - d.startY;
    if (d.horizontal === undefined) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      d.horizontal = Math.abs(dx) > Math.abs(dy);
      if (!d.horizontal) {
        // On a rolling screen the vertical drag drives the roll; on
        // everything else it is left to the page (native scroll).
        if (isRoll && rollScrub.current) {
          d.lastY = ev.clientY;
          return;
        }
        d.active = false;
        return;
      }
    }
    if (d.horizontal === false) {
      rollScrub.current?.(ev.clientY - (d.lastY ?? ev.clientY));
      d.lastY = ev.clientY;
      return;
    }
    d.lastX = ev.clientX;
    d.lastT = performance.now();
    // Rubber-band at the start; the end commits to the completion screen.
    const atStart = index === 0 && dx > 0;
    setDragX(atStart ? dx * 0.3 : dx);
  };

  const onPointerUp = (ev: React.PointerEvent) => {
    if (completed) {
      drag.current = null;
      return;
    }
    const d = drag.current;
    drag.current = null;
    if (!d?.horizontal) {
      // A tap: center third pauses, left sixth goes back, the rest
      // advances. Desktop clicks behave the same.
      if (d && Math.abs(ev.clientX - d.startX) < 6 && Math.abs(ev.clientY - d.startY) < 6) {
        const w = width();
        if (pendingTap) {
          startPending();
        } else if (ev.clientX < w / 6) {
          back();
        } else if (ev.clientX < (w * 2) / 3) {
          setPaused((v) => !v);
          setChrome((v) => !v);
        } else {
          advance();
        }
      }
      setDragX(0);
      setAnimating(true);
      return;
    }
    const dx = ev.clientX - d.startX;
    const dt = Math.max(1, performance.now() - d.lastT);
    const velocity = Math.abs(ev.clientX - d.lastX) / dt;
    const commit = Math.abs(dx) > width() * COMMIT_FRACTION || velocity > COMMIT_VELOCITY;
    if (commit && dx < 0) advance('slide');
    else if (commit && dx > 0) back('slide');
    else {
      setDragX(0);
      setAnimating(true);
    }
  };

  if (!board || !playlist) return null;
  if (!screens) {
    return <div className="fixed inset-0 z-50 bg-background" />;
  }
  if (!count) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background">
        <p className="font-body text-text-muted">{p.empty}</p>
        <button
          type="button"
          className="rounded border border-text-muted/40 px-4 py-2 font-body text-sm text-text"
          onClick={onExit}
        >
          {strings.common.close}
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 select-none overflow-hidden bg-background"
      style={{ touchAction: isRoll ? 'none' : 'pan-y' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        drag.current = null;
        setDragX(0);
        setAnimating(true);
      }}
    >
      {/* The deck: current screen plus one each side, nothing else mounted. */}
      {screens.map((s, i) => {
        const inFade = fadeFrom !== null && (i === index || i === fadeFrom);
        if (Math.abs(i - index) > 1 && !inFade) return null;
        const style: React.CSSProperties = inFade
          ? {
              transform: 'translateX(0)',
              zIndex: i === index ? 2 : 1,
              animation: i === index ? 'deck-fade-in 400ms ease both' : 'deck-fade-out 400ms ease both',
            }
          : {
              transform: `translateX(calc(${(i - index) * 100}% + ${dragX}px))`,
              transition: animating ? 'transform 320ms cubic-bezier(0.22, 0.9, 0.3, 1)' : 'none',
            };
        return (
          <div key={screenKey(s)} className="absolute inset-0 overflow-hidden" style={style}>
            <ScreenView
              board={board}
              screen={s}
              active={i === index}
              paused={paused}
              onRollEnd={i === index && autoAdvance && !paused ? () => advance() : undefined}
              rollScrub={i === index ? rollScrub : undefined}
              onVoiceActive={onForeground}
            />
          </div>
        );
      })}

      {completed && postShiftOpen && (
        <PostShiftScreen playlistId={playlistId} onDone={() => setPostShiftOpen(false)} />
      )}
      {completed && !postShiftOpen && (
        <CompletionScreen
          playlistId={playlistId}
          onBack={() => setCompleted(false)}
          onClose={() => {
            stop();
            (onComplete ?? onExit)();
          }}
        />
      )}

      {/* Tap-to-start page audio */}
      {pendingTap && (
        <button
          type="button"
          className="absolute bottom-16 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/55 px-5 py-2.5 font-body text-sm text-white"
          onClick={startPending}
        >
          {p.playAudio}
        </button>
      )}

      {/* Hairline dwell progress, dim enough to ignore. */}
      {autoAdvance && !paused && (
        <div className="absolute bottom-0 left-0 h-px w-full bg-white/10">
          <div className="h-px bg-white/35" style={{ width: `${progress * 100}%` }} />
        </div>
      )}

      {/* Chrome: nearly invisible until a center tap. */}
      {chrome && (
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-black/50 to-transparent px-4 py-3">
          <span className="font-body text-sm text-white/80">
            {playlist.name} · {index + 1}/{count}
            {paused && autoAdvance ? ` · ${p.paused}` : ''}
          </span>
          <button
            type="button"
            className="rounded-full bg-black/40 px-3 py-1.5 font-body text-sm text-white"
            onClick={(ev) => {
              ev.stopPropagation();
              stop();
              onExit();
            }}
            onPointerDown={(ev) => ev.stopPropagation()}
          >
            {strings.common.close}
          </button>
        </div>
      )}
    </div>
  );
}
