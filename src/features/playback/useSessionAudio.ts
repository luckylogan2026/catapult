import { useCallback, useEffect, useRef } from 'react';
import { db } from '../../db/db';
import { assetObjectUrl } from '../../assetPipeline/importAssets';
import type { Playlist } from '../../domain/types';

// The session background track: loops at a low volume for the whole
// run, fades in over two seconds at the start and out over three at the
// end, and ducks to a quarter of its volume whenever narration,
// affirmation audio, or speech is in the foreground.

const BASE_VOLUME = 0.3;
const DUCK_FACTOR = 0.25;
const FADE_IN_MS = 2000;
const FADE_OUT_MS = 3000;

export function useSessionAudio(playlist: Playlist | undefined) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const targetRef = useRef(BASE_VOLUME);
  const rampTimer = useRef<number | undefined>(undefined);

  const rampTo = useCallback((target: number, ms: number, thenStop = false) => {
    const audio = audioRef.current;
    if (!audio) return;
    window.clearInterval(rampTimer.current);
    const start = audio.volume;
    const t0 = performance.now();
    rampTimer.current = window.setInterval(() => {
      const f = Math.min(1, (performance.now() - t0) / ms);
      audio.volume = start + (target - start) * f;
      if (f >= 1) {
        window.clearInterval(rampTimer.current);
        if (thenStop) audio.pause();
      }
    }, 50);
  }, []);

  useEffect(() => {
    const trackId = playlist?.backgroundTrackAssetId;
    if (!trackId) return;
    let cancelled = false;
    const audio = new Audio();
    audioRef.current = audio;
    void (async () => {
      const asset = await db.assets.get(trackId);
      if (!asset || cancelled) return;
      audio.src = assetObjectUrl(asset.id, asset.blob);
      audio.loop = true;
      audio.volume = 0;
      try {
        await audio.play();
        rampTo(BASE_VOLUME, FADE_IN_MS);
      } catch {
        // Autoplay refusal: the first user gesture in the deck will not
        // retry automatically; keep quiet rather than surprise later.
      }
    })();
    return () => {
      cancelled = true;
      // Session end: fade out over three seconds, then stop. The element
      // lives in this closure, so the fade outlasts the unmount.
      rampTo(0, FADE_OUT_MS, true);
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlist?.backgroundTrackAssetId]);

  /** Duck under foreground audio, recover when it ends. */
  const setDucked = useCallback(
    (ducked: boolean) => {
      targetRef.current = ducked ? BASE_VOLUME * DUCK_FACTOR : BASE_VOLUME;
      rampTo(targetRef.current, 350);
    },
    [rampTo],
  );

  /** The session is over: fade the track out and stop it. */
  const fadeOut = useCallback(() => rampTo(0, FADE_OUT_MS, true), [rampTo]);

  return { setDucked, fadeOut };
}
