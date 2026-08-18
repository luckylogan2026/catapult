import { useEffect } from 'react';
import { useBoardContext, BoardProvider } from './features/board/BoardContext';
import { SetupScreen } from './features/setup/SetupScreen';
import { EditorScreen } from './features/authoring/EditorScreen';
import { applyBrandDefaultTheme, applyBoardTheme } from './theme/applyTheme';

function Routes() {
  const { board, loaded } = useBoardContext();

  useEffect(() => {
    if (board) applyBoardTheme(board.theme);
    else applyBrandDefaultTheme();
  }, [board?.theme, board]);

  if (!loaded) return <main className="min-h-full bg-background" />;
  if (!board) return <SetupScreen />;
  return <EditorScreen />;
}

export default function App() {
  return (
    <BoardProvider>
      <Routes />
    </BoardProvider>
  );
}
