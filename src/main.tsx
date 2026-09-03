import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Chrome fires this once, early; the first-run walkthrough offers a
// real Install button when it has been captured.
window.addEventListener('beforeinstallprompt', (ev) => {
  ev.preventDefault();
  (window as unknown as { __installPrompt?: Event }).__installPrompt = ev;
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
