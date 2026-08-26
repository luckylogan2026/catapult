import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Board } from '../../domain/types';
import { loadBoard, persistBoard, reconcileOrders } from '../../db/boardRepo';
import { requestPersistentStorage } from '../../db/storage';
import { ensureTemplateBlocks } from './normalize';

// Undo is snapshot based: the board JSON is small (media lives in the
// asset table), so each undo step stores a full clone. This covers block
// edits, page edits, and deletions uniformly with no per-command inverse
// logic to get wrong.
//
// The stacks live in refs, not state: stack pushes must happen exactly
// once per mutation, and React state updaters are not a safe place for
// side effects (they can run twice under StrictMode and run later than
// the call site expects).
const UNDO_DEPTH = 50;

export type SaveState = 'idle' | 'saving' | 'saved';

type BoardContextValue = {
  board: Board | null;
  loaded: boolean;
  saveState: SaveState;
  /** Applies a pure producer, reconciles order lists, persists, autosaves. */
  mutate: (producer: (board: Board) => Board, opts?: { undoable?: boolean }) => void;
  /** Installs a replacement board and returns it as stamped. */
  adoptBoard: (board: Board) => Promise<Board>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

const BoardContext = createContext<BoardContextValue | null>(null);

// baseRevision is the latest live revision, which an undo-restored
// snapshot predates. The stamped revision must stay strictly monotonic
// for Phase 6 sync, so take the max of both.
// A browser can discard an IndexedDB it considers corrupted after an
// unclean shutdown, taking the board with it. localStorage lives in a
// separate storage subsystem and survives that, so a lean emergency
// copy of the board (structure and text; media stays content-addressed
// on Drive) is refreshed there at most once a minute. Startup falls
// back to it when the database comes up empty, and the next sync
// re-downloads any missing media.
const EMERGENCY_KEY = 'emergencyBoard';
let lastEmergencySave = 0;
function saveEmergencyCopy(board: Board, force = false): void {
  const now = Date.now();
  if (!force && now - lastEmergencySave < 60000) return;
  lastEmergencySave = now;
  try {
    localStorage.setItem(EMERGENCY_KEY, JSON.stringify(board));
  } catch {
    // Quota or privacy mode: the emergency net is best-effort only.
  }
}
export function clearEmergencyCopy(): void {
  try {
    localStorage.removeItem(EMERGENCY_KEY);
  } catch {
    // ignore
  }
}
function loadEmergencyCopy(): Board | null {
  try {
    const raw = localStorage.getItem(EMERGENCY_KEY);
    if (!raw) return null;
    const b = JSON.parse(raw) as Board;
    return b?.id && Array.isArray(b.pages) ? b : null;
  } catch {
    return null;
  }
}

function stamp(board: Board, baseRevision: number): Board {
  return {
    ...board,
    revision: Math.max(board.revision, baseRevision) + 1,
    meta: { ...board.meta, lastEdited: new Date().toISOString() },
  };
}

export function BoardProvider({ children }: { children: ReactNode }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const boardRef = useRef<Board | null>(null);
  const undoRef = useRef<Board[]>([]);
  const redoRef = useRef<Board[]>([]);
  const savedTimer = useRef<number | undefined>(undefined);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const [, bump] = useReducer((x: number) => x + 1, 0);

  // Cross-tab coordination on this device. A second open instance (the
  // installed window plus a browser tab, say) must not fork the board's
  // history; whoever saves last is adopted by the rest.
  useEffect(() => {
    const channel = new BroadcastChannel('board-sync');
    channel.onmessage = (ev: MessageEvent<{ revision: number }>) => {
      const current = boardRef.current;
      if (!current || ev.data.revision <= current.revision) return;
      void loadBoard().then((fresh) => {
        if (fresh && fresh.revision > (boardRef.current?.revision ?? 0)) {
          boardRef.current = fresh;
          setBoard(fresh);
        }
      });
    };
    channelRef.current = channel;
    return () => channel.close();
  }, []);

  useEffect(() => {
    (async () => {
      await requestPersistentStorage();
      let loaded = await loadBoard();
      if (!loaded) {
        const emergency = loadEmergencyCopy();
        if (emergency) {
          await persistBoard(emergency);
          loaded = emergency;
          console.warn('board restored from the emergency copy after an empty database');
        }
      }
      const existing = loaded ? ensureTemplateBlocks(loaded) : null;
      boardRef.current = existing;
      setBoard(existing);
      setLoaded(true);
    })();
  }, []);

  const apply = useCallback((next: Board) => {
    const stamped = stamp(next, boardRef.current?.revision ?? 0);
    boardRef.current = stamped;
    setBoard(stamped);
    saveEmergencyCopy(stamped);
    setSaveState('saving');
    void persistBoard(stamped).then(() => {
      setSaveState('saved');
      window.clearTimeout(savedTimer.current);
      savedTimer.current = window.setTimeout(() => setSaveState('idle'), 1500);
    });
  }, []);

  const mutate = useCallback(
    (producer: (b: Board) => Board, opts?: { undoable?: boolean }) => {
      const current = boardRef.current;
      if (!current) return;
      if (opts?.undoable !== false) {
        undoRef.current = [...undoRef.current.slice(-(UNDO_DEPTH - 1)), structuredClone(current)];
        redoRef.current = [];
      }
      apply(reconcileOrders(ensureTemplateBlocks(producer(current))));
      bump();
    },
    [apply],
  );

  const adoptBoard = useCallback(
    async (b: Board) => {
      const stamped = stamp(reconcileOrders(b), boardRef.current?.revision ?? 0);
      boardRef.current = stamped;
      saveEmergencyCopy(stamped, true);
      await persistBoard(stamped);
      setBoard(stamped);
      return stamped;
    },
    [],
  );

  const undo = useCallback(() => {
    const current = boardRef.current;
    const restored = undoRef.current.pop();
    if (!current || !restored) return;
    redoRef.current.push(structuredClone(current));
    apply(restored);
    bump();
  }, [apply]);

  const redo = useCallback(() => {
    const current = boardRef.current;
    const restored = redoRef.current.pop();
    if (!current || !restored) return;
    undoRef.current.push(structuredClone(current));
    apply(restored);
    bump();
  }, [apply]);

  return (
    <BoardContext.Provider
      value={{
        board,
        loaded,
        saveState,
        mutate,
        adoptBoard,
        undo,
        redo,
        canUndo: undoRef.current.length > 0,
        canRedo: redoRef.current.length > 0,
      }}
    >
      {children}
    </BoardContext.Provider>
  );
}

export function useBoardContext(): BoardContextValue {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error('useBoardContext requires a BoardProvider ancestor');
  return ctx;
}
