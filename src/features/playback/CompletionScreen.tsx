import { useEffect, useRef, useState } from 'react';
import { strings } from '../../config';
import type { PlaylistId } from '../../domain/types';
import { useBoardContext } from '../board/BoardContext';
import { computeStreak, recordCompletion } from './streak';

const c = strings.completion;

// The quiet close of a session: the streak, and a single line for the
// day. Nothing gamified. Voice dictation fills the line where the
// device offers speech recognition.

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getRecognizer(): SpeechRecognitionLike | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export function CompletionScreen({
  playlistId,
  onClose,
}: {
  playlistId: PlaylistId;
  onClose: () => void;
}) {
  const { board, mutate } = useBoardContext();
  const [note, setNote] = useState('');
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const canDictate = typeof window !== 'undefined' && !!getRecognizer();

  useEffect(() => () => recRef.current?.stop(), []);

  if (!board) return null;
  const done = recordPreview(board.streak.completions, playlistId);
  const overall = done.overall;
  const morning = done.morning;
  const evening = done.evening;

  const toggleDictation = () => {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = getRecognizer();
    if (!rec) return;
    recRef.current = rec;
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = false;
    rec.continuous = true;
    rec.onresult = (ev) => {
      const parts: string[] = [];
      for (let i = 0; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) parts.push(r[0].transcript);
      }
      if (parts.length) setNote((n) => (n ? n + ' ' : '') + parts.join(' ').trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
    setListening(true);
  };

  const finish = () => {
    recRef.current?.stop();
    mutate((b) => ({
      ...b,
      streak: { completions: recordCompletion(b.streak.completions, playlistId, note) },
    }));
    onClose();
  };

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-background px-8 text-center">
      <p className="font-body text-sm uppercase tracking-[0.3em] text-text-muted">{c.title}</p>
      <p className="font-heading text-7xl font-semibold text-primary">{overall}</p>
      <p className="font-body text-sm text-text-muted">
        {c.streakLabel} · {c.morningShort} {morning} · {c.eveningShort} {evening}
      </p>

      <div className="relative w-full max-w-lg">
        <textarea
          value={note}
          onChange={(ev) => setNote(ev.target.value)}
          placeholder={c.notePlaceholder}
          rows={6}
          className="w-full resize-y rounded border border-text-muted/30 bg-surface/60 p-3 pb-10 text-left font-body text-sm text-text outline-none placeholder:text-text-muted/50 focus:border-primary"
        />
        {canDictate && (
          <button
            type="button"
            onClick={toggleDictation}
            className={`absolute bottom-3 right-2 rounded-full border px-3 py-1 font-body text-[11px] ${
              listening
                ? 'border-red-400 bg-red-500/20 text-red-300'
                : 'border-text-muted/30 text-text-muted hover:text-text'
            }`}
          >
            {listening ? c.dictateStop : '🎤 ' + c.dictateStart}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={finish}
        className="mt-2 w-full max-w-lg rounded bg-primary px-8 py-3 font-body text-base font-medium text-background"
      >
        {c.finish}
      </button>
    </div>
  );
}

// The streaks as they will read once this session is recorded, so the
// number on screen includes today.
function recordPreview(
  completions: { date: string; playlistId: PlaylistId; completedAt: string; note?: string }[],
  playlistId: PlaylistId,
) {
  const preview = recordCompletion(completions, playlistId, '');
  return {
    overall: computeStreak(preview),
    morning: computeStreak(preview, 'morning'),
    evening: computeStreak(preview, 'evening'),
  };
}
