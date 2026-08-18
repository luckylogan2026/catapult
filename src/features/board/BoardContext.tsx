import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Board } from '../../domain/types';
import { loadBoard, persistBoard, reconcileOrders } from '../../db/boardRepo';
import { requestPersistentStorage } from '../../db/storage';

// Undo is snapshot based: the board JSON is small (media lives in the
// asset table), so each undo step stores a full clone. This covers block
// edits, page edits, and deletions uniformly with no per-command inverse
// logic to get wrong.
const UNDO_DEPTH = 50;

export type SaveState = 'idle' | 'saving' | 'saved';

type BoardContextValue = {
  board: Board | null;
  loaded: boolean;
  saveState: SaveState;
  /** Applies a pure producer, reconciles order lists, persists, autosaves. */
  mutate: (producer: (board: Board) => Board, opts?: { undoable?: boolean }) => void;
  /** Installs a brand new board, replacing none (first run only). */
  adoptBoard: (board: Board) => Promise<void>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

const BoardContext = createContext<BoardContextValue | null>(null);

export function BoardProvider({ children }: { children: ReactNode }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [undoStack, setUndoStack] = useState<Board[]>([]);
  const [redoStack, setRedoStack] = useState<Board[]>([]);
  const savedTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    (async () => {
      await requestPersistentStorage();
      const existing = await loadBoard();
      setBoard(existing);
      setLoaded(true);
    })();
  }, []);

  const persist = useCallback((next: Board) => {
    setSaveState('saving');
    persistBoard(next).then((stored) => {
      setBoard(stored);
      setSaveState('saved');
      window.clearTimeout(savedTimer.current);
      savedTimer.current = window.setTimeout(() => setSaveState('idle'), 1500);
    });
  }, []);

  const mutate = useCallback(
    (producer: (b: Board) => Board, opts?: { undoable?: boolean }) => {
      setBoard((current) => {
        if (!current) return current;
        if (opts?.undoable !== false) {
          setUndoStack((s) => [...s.slice(-(UNDO_DEPTH - 1)), structuredClone(current)]);
          setRedoStack([]);
        }
        const next = reconcileOrders(producer(current));
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const adoptBoard = useCallback(
    async (b: Board) => {
      const stored = await persistBoard(reconcileOrders(b));
      setBoard(stored);
    },
    [],
  );

  const undo = useCallback(() => {
    setBoard((current) => {
      if (!current) return current;
      let restored: Board | null = null;
      setUndoStack((s) => {
        if (!s.length) return s;
        restored = s[s.length - 1];
        setRedoStack((r) => [...r, structuredClone(current)]);
        return s.slice(0, -1);
      });
      if (!restored) return current;
      persist(restored);
      return restored;
    });
  }, [persist]);

  const redo = useCallback(() => {
    setBoard((current) => {
      if (!current) return current;
      let restored: Board | null = null;
      setRedoStack((r) => {
        if (!r.length) return r;
        restored = r[r.length - 1];
        setUndoStack((s) => [...s, structuredClone(current)]);
        return r.slice(0, -1);
      });
      if (!restored) return current;
      persist(restored);
      return restored;
    });
  }, [persist]);

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
        canUndo: undoStack.length > 0,
        canRedo: redoStack.length > 0,
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
