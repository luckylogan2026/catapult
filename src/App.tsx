import { useEffect } from 'react';
import { brand, strings } from './config';
import { applyBrandDefaultTheme } from './theme/applyTheme';

// Phase 0 shell. Proves the theme system, fonts, and offline install
// path before any product surface exists.
export default function App() {
  useEffect(() => {
    applyBrandDefaultTheme();
  }, []);

  return (
    <main className="flex h-full flex-col items-center justify-center gap-5 bg-background px-8 text-center">
      <h1 className="font-heading text-6xl font-semibold text-primary">{brand.appName}</h1>
      <p className="max-w-sm font-body text-lg text-secondary">{strings.shell.tagline}</p>
      <p className="font-body text-sm text-text-muted">{strings.shell.phaseNote}</p>
    </main>
  );
}
