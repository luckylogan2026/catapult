import { useState } from 'react';
import { strings, trackerItems } from '../../config';
import type { Board } from '../../domain/types';
import { useBoardContext } from '../board/BoardContext';
import { ratedSessionCount } from '../playback/streak';

const tk = strings.tracker;

// The anchors offer: after seven rated sessions the scale has enough
// history to be worth pinning down. Offered at most twice, skippable,
// and always editable later in settings.

const allItems = [...trackerItems.morning, ...trackerItems.evening].filter(
  (it, i, arr) => arr.findIndex((o) => o.key === it.key) === i,
);

export function shouldOfferAnchors(board: Board): boolean {
  if ((board.settings.anchorOffers ?? 0) >= 2) return false;
  const anchors = board.settings.anchors ?? {};
  if (Object.values(anchors).some((v) => v.trim())) return false;
  return ratedSessionCount(board) >= 7;
}

export function AnchorsScreen({ onDone }: { onDone: () => void }) {
  const { mutate } = useBoardContext();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const close = (save: boolean) => {
    mutate(
      (b: Board) => ({
        ...b,
        settings: {
          ...b.settings,
          anchorOffers: (b.settings.anchorOffers ?? 0) + 1,
          anchors: save ? { ...(b.settings.anchors ?? {}), ...drafts } : b.settings.anchors,
        },
      }),
      { undoable: false },
    );
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="mx-auto flex w-full max-w-md grow flex-col overflow-y-auto px-5 py-6">
        <p className="font-heading text-2xl font-semibold text-text">{tk.anchorsTitle}</p>
        <p className="mt-2 font-body text-sm text-text-muted">{tk.anchorsBody}</p>
        {allItems.map((it) => (
          <label key={it.key} className="mt-3 block font-body text-xs text-text-muted">
            {it.label}
            <input
              type="text"
              value={drafts[it.key] ?? ''}
              onChange={(ev) => setDrafts((d) => ({ ...d, [it.key]: ev.target.value }))}
              className="mt-1 w-full rounded border border-text-muted/30 bg-surface/60 px-2 py-1.5 font-body text-sm text-text outline-none focus:border-primary"
            />
          </label>
        ))}
        <div className="mt-6 flex items-center gap-2 pb-4">
          <button
            type="button"
            onClick={() => close(true)}
            className="rounded bg-primary px-6 py-2.5 font-body text-sm font-medium text-background"
          >
            {tk.anchorsSave}
          </button>
          <button
            type="button"
            onClick={() => close(false)}
            className="rounded px-4 py-2.5 font-body text-sm text-text-muted hover:text-text"
          >
            {tk.anchorsSkip}
          </button>
        </div>
      </div>
    </div>
  );
}
