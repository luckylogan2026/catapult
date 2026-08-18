import { useEffect, useRef, useState } from 'react';
import { strings } from '../../config';
import { importBlob } from '../../assetPipeline/importAssets';
import { useBoardContext } from '../board/BoardContext';

// In-app audio recording through MediaRecorder. One tap to record, one
// to stop; the take lands in the asset store and the caller wires it to
// its page, affirmation, or master entry.
export function RecordButton({ onRecorded }: { onRecorded: (assetId: string) => void }) {
  const { board } = useBoardContext();
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      window.clearInterval(timer.current);
      recRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const start = async () => {
    setError(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (ev) => ev.data.size && chunks.current.push(ev.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' });
        if (blob.size && board) {
          const r = await importBlob(blob, {
            filename: 'recording.webm',
            archiveOriginals: board.settings.archiveOriginals,
          });
          onRecorded(r.asset.id);
        }
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
      setElapsed(0);
      timer.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    } catch {
      setError(true);
    }
  };

  const stop = () => {
    window.clearInterval(timer.current);
    recRef.current?.stop();
    recRef.current = null;
    setRecording(false);
  };

  return (
    <button
      type="button"
      title={error ? strings.editor.recordError : undefined}
      className={`rounded border px-2 py-0.5 font-body text-xs ${
        recording
          ? 'border-red-400 bg-red-500/20 text-red-300'
          : error
            ? 'border-red-400/50 text-red-300'
            : 'border-text-muted/30 text-text-muted hover:text-text'
      }`}
      onClick={() => (recording ? stop() : void start())}
    >
      {recording
        ? `${strings.editor.recordStop} ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`
        : strings.editor.recordStart}
    </button>
  );
}
