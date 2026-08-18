import { useEffect, useRef, useState } from 'react';
import { db } from '../../db/db';
import { assetObjectUrl } from '../../assetPipeline/importAssets';
import type { Board, Page } from '../../domain/types';
import type { Screen } from './screens';

// Page audio for playback. One audio element for the whole session, so
// a track started on one page (the affirmations intro, the meditation)
// keeps playing across following screens until another audio source
// takes over or the session ends. An audio element with Media Session
// metadata keeps playing on Android with the screen off, which the
// morning ritual depends on.

type Source = { assetId: string; loop: boolean } | null;

function sourceForScreen(screen: Screen | undefined): { src: Source; tap: boolean; page?: Page } {
  if (!screen) return { src: null, tap: false };
  if (screen.kind === 'master' && screen.entry.audioAssetId) {
    return { src: { assetId: screen.entry.audioAssetId, loop: false }, tap: false };
  }
  const page = screen.kind === 'affirmation' ? (screen.introPage ?? screen.page) : screen.page;
  if (page.narrationAssetId) {
    return {
      src: { assetId: page.narrationAssetId, loop: page.audioLoop ?? false },
      tap: page.audioStart === 'tap',
      page,
    };
  }
  return { src: null, tap: false, page };
}

export function useScreenAudio(board: Board, screen: Screen | undefined, active: boolean) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentId = useRef<string | null>(null);
  const [pendingTap, setPendingTap] = useState(false);

  useEffect(() => {
    if (!audioRef.current) audioRef.current = new Audio();
    const audio = audioRef.current;
    return () => {
      audio.pause();
      audio.src = '';
      currentId.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !active) return;
    const { src, tap } = sourceForScreen(screen);

    // No audio of its own: whatever is playing carries on.
    if (!src) {
      setPendingTap(false);
      return;
    }
    if (currentId.current === src.assetId) {
      audio.loop = src.loop;
      return;
    }

    let cancelled = false;
    void (async () => {
      const asset = await db.assets.get(src.assetId);
      if (!asset || cancelled) return;
      audio.pause();
      audio.src = assetObjectUrl(asset.id, asset.blob);
      audio.loop = src.loop;
      currentId.current = src.assetId;
      if (tap) {
        setPendingTap(true);
      } else {
        setPendingTap(false);
        void audio.play().catch(() => setPendingTap(true));
      }
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: sourceForScreen(screen).page?.title ?? board.meta.title,
          artist: board.meta.title,
        });
        navigator.mediaSession.setActionHandler('play', () => void audio.play());
        navigator.mediaSession.setActionHandler('pause', () => audio.pause());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [screen, active, board.meta.title]);

  const startPending = () => {
    const audio = audioRef.current;
    if (!audio || !pendingTap) return;
    setPendingTap(false);
    void audio.play().catch(() => {});
  };

  const stop = () => {
    audioRef.current?.pause();
  };

  return { pendingTap, startPending, stop };
}
