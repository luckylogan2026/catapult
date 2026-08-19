import { useEffect, useRef, useState } from 'react';
import { db } from '../../db/db';
import { assetObjectUrl } from '../../assetPipeline/importAssets';
import type { Board, Page, Playlist } from '../../domain/types';
import type { Screen } from './screens';
import { speakText, type TtsHandle } from './tts';

// Foreground audio for playback: recorded audio and text to speech.
// Precedence per screen: the screen's own recording (a master entry's
// audio, an affirmation's audio) beats page audio, and any recording
// beats text to speech. A page track keeps playing across the screens
// it owns (the intro track spans its affirmation screens) and stops
// when an unrelated screen arrives. Media Session metadata keeps audio
// alive with the phone screen off. The onForeground signal drives the
// background track's ducking.

type Source = { assetId: string; loop: boolean } | null;

function ownerOf(screen: Screen): string {
  if (screen.kind === 'master') return `${screen.page.id}:${screen.entry.id}`;
  return screen.page.id;
}

function sourceForScreen(screen: Screen | undefined): { src: Source; tap: boolean; page?: Page } {
  if (!screen) return { src: null, tap: false };
  if (screen.kind === 'master' && screen.entry.audioAssetId) {
    return { src: { assetId: screen.entry.audioAssetId, loop: false }, tap: false };
  }
  if (screen.kind === 'affirmation' && screen.affirmation.audioAssetId) {
    return { src: { assetId: screen.affirmation.audioAssetId, loop: false }, tap: false };
  }
  // The intro's audio does not carry into the affirmation screens; its
  // background image does, but sound stops when its page is left.
  const page = screen.page;
  if (page.narrationAssetId) {
    return {
      src: { assetId: page.narrationAssetId, loop: page.audioLoop ?? false },
      tap: page.audioStart === 'tap',
      page,
    };
  }
  return { src: null, tap: false, page };
}

// Text to speech applies to an affirmation screen without a recording,
// and to a text page carrying [pause] markers without a recording.
function ttsTextFor(screen: Screen | undefined): { text: string; pauseSeconds: number } | null {
  if (!screen) return null;
  if (screen.kind === 'affirmation' && !screen.affirmation.audioAssetId) {
    return { text: screen.affirmation.text, pauseSeconds: 0 };
  }
  if (screen.kind === 'page' && !screen.page.narrationAssetId) {
    const body = screen.page.blocks
      .filter((b) => b.kind === 'text' && /\[pause\]/i.test(b.text ?? ''))
      .map((b) => b.text ?? '')
      .join('\n');
    if (body.trim()) return { text: body, pauseSeconds: screen.page.pauseSeconds ?? 3 };
  }
  return null;
}

export function useScreenAudio(
  board: Board,
  playlist: Playlist | undefined,
  screen: Screen | undefined,
  active: boolean,
  onForeground: (activeAudio: boolean) => void,
) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentId = useRef<string | null>(null);
  const currentOwner = useRef<string | null>(null);
  const ttsRef = useRef<TtsHandle | null>(null);
  const [pendingTap, setPendingTap] = useState(false);

  useEffect(() => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.onplay = () => onForeground(true);
      audio.onpause = () => onForeground(false);
      audio.onended = () => onForeground(false);
      audioRef.current = audio;
    }
    const audio = audioRef.current;
    return () => {
      audio.pause();
      audio.src = '';
      currentId.current = null;
      ttsRef.current?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!active) {
      // The session content is over or paused out: nothing pending may
      // start late on top of the ending screen.
      ttsRef.current?.cancel();
      audio.pause();
      return;
    }
    const { src, tap } = sourceForScreen(screen);
    const owner = screen ? ownerOf(screen) : null;

    ttsRef.current?.cancel();
    ttsRef.current = null;

    if (!src) {
      setPendingTap(false);
      if (currentOwner.current && currentOwner.current !== owner) {
        audio.pause();
        currentId.current = null;
        currentOwner.current = null;
      }
      // No recording: text to speech when the playlist asks for it.
      // Owner decision: speech stays silent while the playlist carries
      // background music; recordings still play and duck the music.
      const tts =
        playlist?.ttsEnabled && !playlist?.backgroundTrackAssetId ? ttsTextFor(screen) : null;
      if (tts) {
        ttsRef.current = speakText(tts.text, {
          voiceURI: board.settings.ttsVoiceURI,
          rate: board.settings.ttsRate || 0.9,
          pauseMs: tts.pauseSeconds * 1000,
          onActive: onForeground,
        });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, active, board.meta.title, playlist?.ttsEnabled]);

  const startPending = () => {
    const audio = audioRef.current;
    if (!audio || !pendingTap) return;
    setPendingTap(false);
    void audio.play().catch(() => {});
  };

  const stop = () => {
    audioRef.current?.pause();
    ttsRef.current?.cancel();
  };

  return { pendingTap, startPending, stop };
}
