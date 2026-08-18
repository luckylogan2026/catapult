import { useBoardContext } from '../board/BoardContext';
import { strings } from '../../config';

// TODO(phase1): replaced by the full editor as authoring lands. This
// placeholder only proves the setup flow hands off to a persisted board.
export function EditorScreen() {
  const { board } = useBoardContext();
  if (!board) return null;
  return (
    <main className="flex min-h-full flex-col items-center justify-center bg-background px-8 text-center">
      <h1 className="font-heading text-4xl text-primary">{board.meta.title}</h1>
      <p className="mt-2 font-body text-text-muted">
        {board.pages.length} {strings.editor.pageRail}
      </p>
    </main>
  );
}
