import { useCallback, useEffect, useRef, useState } from 'react';
import { strings } from '../../config';
import type { Board, Page } from '../../domain/types';
import { useBoardContext } from '../board/BoardContext';
import { kvGet, kvSet } from '../../db/kv';
import {
  acquireToken,
  clientIdConfigured,
  markRemoteSeen,
  syncOnce,
  type SyncDiag,
  type SyncOutcome,
} from './drive';
import { mergeCompletions, mergePendingRatings } from '../playback/streak';

const y = strings.sync;

// The sync surface in settings, plus the background triggers: on app
// open when online, thirty seconds after the last edit, and the Sync
// now button. Failures are a quiet status line, never a modal, and
// never block offline use. The conflict dialog is the one exception,
// because losing a morning's work to a silent overwrite would be worse
// than any bug in this app.

type ConflictState = {
  remoteBoard: Board;
  remoteStamp: string | null;
  remoteEdited: string;
  localEdited: string;
};

export function useSyncEngine() {
  const { board, mutate, adoptBoard } = useBoardContext();
  const [status, setStatus] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  // True while a background sync could not sign in silently: the
  // header shows a loud reconnect pill instead of quiet grey text.
  const [paused, setPaused] = useState(false);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const busy = useRef(false);
  const debounce = useRef<number | undefined>(undefined);
  const boardRef = useRef(board);
  boardRef.current = board;

  useEffect(() => {
    void kvGet<boolean>('driveConnected').then((v) => setConnected(!!v));
  }, []);

  const run = useCallback(
    async (interactive: boolean) => {
      const b = boardRef.current;
      if (!b || busy.current || !navigator.onLine || !clientIdConfigured()) return;
      busy.current = true;
      try {
        if (!(await acquireToken(interactive))) {
          setStatus(interactive ? y.statusError : y.reconnectHint);
          if (!interactive) setPaused(true);
          return;
        }
        setPaused(false);
        setConnected(true);
        setStatus(y.syncing);
        const outcome: SyncOutcome = await syncOnce(b);
        if (outcome.kind === 'pushed') {
          setStatus(
            outcome.journalError
              ? y.journalFailed.replace('{code}', outcome.journalError)
              : y.statusPushed,
          );
        } else if (outcome.kind === 'pulled') {
          const merged: Board = {
            ...outcome.board,
            streak: {
              completions: mergeCompletions(
                b.streak?.completions ?? [],
                outcome.board.streak?.completions ?? [],
              ),
            },
            pendingRatings: mergePendingRatings(
              b.pendingRatings ?? [],
              outcome.board.pendingRatings ?? [],
            ),
          };
          const stored = await adoptBoard(merged);
          await kvSet('lastSyncedRevision', stored.revision);
          setStatus(y.statusPulled);
        } else if (outcome.kind === 'conflict') {
          setConflict(outcome);
          setStatus(null);
        } else if (outcome.kind === 'error') {
          setStatus(y.statusError);
        } else {
          setStatus(
            outcome.journalError
              ? y.journalFailed.replace('{code}', outcome.journalError)
              : y.statusIdle,
          );
        }
      } finally {
        busy.current = false;
      }
    },
    [adoptBoard],
  );

  // On open, once, when the owner has connected before.
  const openedRef = useRef(false);
  useEffect(() => {
    if (openedRef.current || !board || !connected) return;
    openedRef.current = true;
    void run(false);
  }, [board, connected, run]);

  // Thirty seconds after the last edit.
  useEffect(() => {
    if (!connected || !board) return;
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => void run(false), 30000);
    return () => window.clearTimeout(debounce.current);
  }, [board, connected, run]);

  const resolveConflict = useCallback(
    async (choice: 'local' | 'remote' | 'both') => {
      const c = conflict;
      const b = boardRef.current;
      if (!c || !b) return;
      setConflict(null);
      if (choice === 'remote') {
        // The adopted board's stamped revision becomes the synced marker,
        // so the next comparison sees both sides level. Completions
        // always merge; a conflict must not erase finished sessions.
        const stored = await adoptBoard({
          ...c.remoteBoard,
          streak: {
            completions: mergeCompletions(
              b.streak?.completions ?? [],
              c.remoteBoard.streak?.completions ?? [],
            ),
          },
          pendingRatings: mergePendingRatings(
            b.pendingRatings ?? [],
            c.remoteBoard.pendingRatings ?? [],
          ),
        });
        await kvSet('lastSyncedRevision', stored.revision);
        await markRemoteSeen(c.remoteStamp);
        setStatus(y.statusPulled);
        return;
      } else if (choice === 'both') {
        // Keep both: the local board stays, and divergent remote pages
        // come in as copies with a suffix.
        const localById = new Map(b.pages.map((p) => [p.id, JSON.stringify(p)]));
        const divergent = c.remoteBoard.pages.filter(
          (p) => !localById.has(p.id) || localById.get(p.id) !== JSON.stringify(p),
        );
        mutate((cur) => ({
          ...cur,
          pages: [
            ...cur.pages,
            ...divergent.map((p): Page => {
              const copy = structuredClone(p);
              copy.id = crypto.randomUUID();
              for (const bl of copy.blocks) bl.id = crypto.randomUUID();
              copy.title = `${copy.title} (Drive)`;
              return copy;
            }),
          ],
        }));
      }
      // Keep local and keep both end with this device's board pushed up
      // as the truth, skipping conflict detection once, with the
      // remote's completions folded in first.
      mutate((cur) => ({
        ...cur,
        streak: {
          completions: mergeCompletions(
            cur.streak?.completions ?? [],
            c.remoteBoard.streak?.completions ?? [],
          ),
        },
        pendingRatings: mergePendingRatings(
          cur.pendingRatings ?? [],
          c.remoteBoard.pendingRatings ?? [],
        ),
      }));
      busy.current = true;
      try {
        setStatus(y.syncing);
        const b2 = boardRef.current;
        if (b2) {
          const outcome = await syncOnce(b2, true);
          setStatus(outcome.kind === 'pushed' ? y.statusPushed : y.statusError);
        }
      } finally {
        busy.current = false;
      }
    },
    [conflict, adoptBoard, mutate],
  );

  return {
    status,
    paused,
    connected,
    conflict,
    resolveConflict,
    syncNow: () => run(true),
    // Quiet immediate push, for natural sync points like a finished
    // session. Never opens the sign-in popup.
    syncSoon: () => run(false),
  };
}

export function SyncSection({
  engine,
}: {
  engine: ReturnType<typeof useSyncEngine>;
}) {
  const { status, connected, syncNow } = engine;
  const [diag, setDiag] = useState<SyncDiag | null>(null);
  useEffect(() => {
    void kvGet<SyncDiag>('syncDiag').then((d) => setDiag(d ?? null));
  }, [status]);
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '·');
  return (
    <div className="mt-4 rounded border border-text-muted/20 p-3">
      <p className="font-body text-sm font-medium text-text">{y.title}</p>
      <p className="mt-1 font-body text-xs text-text-muted">{y.body}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {!clientIdConfigured() ? (
          <p className="font-body text-xs text-text-muted">{y.notConfigured}</p>
        ) : (
          <>
            <button
              type="button"
              className="rounded border border-text-muted/30 px-3 py-1.5 font-body text-sm text-text hover:border-primary"
              onClick={() => void syncNow()}
            >
              {connected ? y.syncNow : y.connect}
            </button>
            {connected && <span className="font-body text-xs text-secondary">{y.connected}</span>}
            {status && <span className="font-body text-xs text-text-muted">{status}</span>}
          </>
        )}
      </div>
      {diag && (
        <details className="mt-2">
          <summary className="cursor-pointer font-body text-[11px] text-text-muted">{y.details}</summary>
          <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed text-text-muted">
            {[
              `account: ${diag.account ?? '·'}`,
              `folder: ${diag.folderId ?? '·'}`,
              `drive board: rev ${diag.remoteRevision ?? '·'} @ ${fmt(diag.remoteStamp)}`,
              `local: rev ${diag.localRevision}, last synced rev ${diag.lastSyncedRevision}`,
              `last seen drive stamp: ${fmt(diag.lastRemoteStamp)}`,
              `last outcome: ${diag.outcome} @ ${fmt(diag.at)}`,
            ].join('\n')}
          </pre>
        </details>
      )}
    </div>
  );
}

export function ConflictDialog({
  engine,
}: {
  engine: ReturnType<typeof useSyncEngine>;
}) {
  const { conflict, resolveConflict } = engine;
  if (!conflict) return null;
  const fmt = (iso: string) => new Date(iso).toLocaleString();
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6">
      <div className="w-full max-w-md rounded-lg bg-surface p-5">
        <h2 className="font-heading text-xl text-text">{y.conflictTitle}</h2>
        <p className="mt-2 font-body text-sm text-text-muted">
          {y.conflictBody
            .replace('{local}', fmt(conflict.localEdited))
            .replace('{remote}', fmt(conflict.remoteEdited))}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            className="rounded bg-primary px-4 py-2 font-body text-sm font-medium text-background"
            onClick={() => void resolveConflict('local')}
          >
            {y.keepLocal}
          </button>
          <button
            type="button"
            className="rounded border border-text-muted/30 px-4 py-2 font-body text-sm text-text"
            onClick={() => void resolveConflict('remote')}
          >
            {y.keepRemote}
          </button>
          <button
            type="button"
            className="rounded border border-text-muted/30 px-4 py-2 font-body text-sm text-text"
            onClick={() => void resolveConflict('both')}
          >
            {y.keepBoth}
          </button>
        </div>
      </div>
    </div>
  );
}
