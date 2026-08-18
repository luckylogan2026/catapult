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
  /** Installs a brand new board (first run only). */
  adoptBoard: (board: Board) => Promise<void>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

const BoardContext = createContext<BoardContextValue | null>(null);

// baseRevision is the latest live revision, which an undo-restored
// snapshot predates. The stamped revision must stay strictly monotonic
// for Phase 6 sync, so take the max of both.
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
  const [, bump] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    (async () => {
      await requestPersistentStorage();
      const loaded = await loadBoard();
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
      await persistBoard(stamped);
      setBoard(stamped);
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
