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

// The owner scopes a track: audio started for a page keeps playing only
// while screens of that owner are active (the intro track spans the
// affirmation screens it introduces), and stops as soon as an unrelated
// screen arrives.
function ownerOf(screen: Screen): string {
  if (screen.kind === 'master') return `${screen.page.id}:${screen.entry.id}`;
  if (screen.kind === 'affirmation' || screen.kind === 'affirmation-roll')
    return screen.introPage?.id ?? screen.page.id;
  return screen.page.id;
}

function sourceForScreen(screen: Screen | undefined): { src: Source; tap: boolean; page?: Page } {
  if (!screen) return { src: null, tap: false };
  if (screen.kind === 'master' && screen.entry.audioAssetId) {
    return { src: { assetId: screen.entry.audioAssetId, loop: false }, tap: false };
  }
  const page =
    screen.kind === 'affirmation' || screen.kind === 'affirmation-roll'
      ? (screen.introPage ?? screen.page)
      : screen.page;
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
  const currentOwner = useRef<string | null>(null);
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
    const owner = screen ? ownerOf(screen) : null;

    // No audio of its own: the playing track continues only while it
    // still owns the active screen, and stops otherwise.
    if (!src) {
      setPendingTap(false);
      if (currentOwner.current && currentOwner.current !== owner) {
        audio.pause();
        currentId.current = null;
        currentOwner.current = null;
      }
      return;
    }
    if (currentId.current === src.assetId) {
      audio.loop = src.loop;
      currentOwner.current = owner;
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
      currentOwner.current = owner;
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
