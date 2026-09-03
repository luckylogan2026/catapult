import { useEffect, useRef, useState } from 'react';
import { brand, strings } from '../../config';
import { themePresets } from '../../theme/presets';
import { applyBoardTheme } from '../../theme/applyTheme';
import { createBoard } from '../../db/boardRepo';
import { useBoardContext } from '../board/BoardContext';
import { buildStarterBoard } from './buildStarterBoard';

const s = strings.setup;
const app = (text: string) => text.replaceAll('{app}', brand.appName);

// First run is a walkthrough, not a form: install to the home screen
// (skipped when already installed), connect Google Drive (offering a
// restore when the account already holds a board), then set up the
// board. Every step can be skipped; nothing here is a wall.

type Platform = 'ios-safari' | 'ios-other' | 'android' | 'desktop';

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  const iOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (iOS) {
    const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/.test(ua);
    return otherBrowser ? 'ios-other' : 'ios-safari';
  }
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

function isInstalled(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

type InstallPromptEvent = Event & { prompt: () => Promise<void> };

export function SetupScreen() {
  const { adoptBoard } = useBoardContext();
  const [step, setStep] = useState<1 | 2 | 3>(() => (isInstalled() ? 2 : 1));
  const [platform] = useState<Platform>(detectPlatform);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(
    () => ((window as unknown as { __installPrompt?: InstallPromptEvent }).__installPrompt ?? null),
  );
  const [copied, setCopied] = useState(false);
  const [connected, setConnected] = useState(false);
  const [foundOnDrive, setFoundOnDrive] = useState(false);
  const [account, setAccount] = useState<string | null>(null);
  const [connectNotice, setConnectNotice] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [title, setTitle] = useState(s.titleDefault);
  const [presetId, setPresetId] = useState(brand.defaultThemePreset);
  const [mode, setMode] = useState<'template' | 'empty'>('template');
  const [busy, setBusy] = useState(false);
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  // The install prompt can arrive after mount.
  useEffect(() => {
    const onPrompt = (ev: Event) => {
      ev.preventDefault();
      setInstallPrompt(ev as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard denied: the address is on screen to copy by hand.
    }
  };

  const connect = async () => {
    if (busy) return;
    setBusy(true);
    setConnectNotice(null);
    try {
      const { acquireToken, driveHasBoard, accountEmail } = await import('../sync/drive');
      if (!(await acquireToken(true))) {
        setConnectNotice(s.connectError);
        return;
      }
      setConnected(true);
      const email = await accountEmail();
      setAccount(email);
      let has = false;
      try {
        has = await driveHasBoard();
      } catch {
        has = false;
      }
      setFoundOnDrive(has);
      if (!has) {
        setRestoreNotice(s.connectedAs.replace('{account}', email ?? '?'));
        setStep(3);
      }
    } finally {
      setBusy(false);
    }
  };

  // A fresh device restores a backup from right here, before any board
  // exists. This is how a board travels from desktop to phone.
  const restore = async (file: File) => {
    setBusy(true);
    setRestoreNotice(null);
    try {
      const { importVisionBundle } = await import('../exports/visionBundle');
      const result = await importVisionBundle(file);
      if (!result.ok) {
        setRestoreNotice(result.reason);
        return;
      }
      await adoptBoard(result.board);
      applyBoardTheme(result.board.theme);
    } finally {
      setBusy(false);
    }
  };

  // The same board, from Drive instead of a file: the recovery path for
  // a device whose local storage came up empty.
  const restoreDrive = async () => {
    if (busy) return;
    setBusy(true);
    setRestoreNotice(null);
    try {
      const { acquireToken, restoreFromDrive } = await import('../sync/drive');
      setRestoreNotice(s.restoreDriveSignIn);
      if (!(await acquireToken(true))) {
        setRestoreNotice(s.restoreDriveError);
        return;
      }
      const result = await restoreFromDrive((stage, done, total) => {
        setRestoreNotice(
          stage === 'board'
            ? s.restoreDriveBoard
            : s.restoreDriveAssets.replace('{done}', String(done)).replace('{total}', String(total)),
        );
      });
      if (!result) {
        const { accountEmail } = await import('../sync/drive');
        const email = await accountEmail();
        setRestoreNotice(s.restoreDriveNoneFor.replace('{account}', email ?? '?'));
        return;
      }
      const { kvSet } = await import('../../db/kv');
      const stored = await adoptBoard(result.board);
      await kvSet('lastSyncedRevision', stored.revision);
      applyBoardTheme(stored.theme);
    } catch {
      setRestoreNotice(s.restoreDriveError);
    } finally {
      setBusy(false);
    }
  };

  const begin = async () => {
    if (busy) return;
    setBusy(true);
    const owner = name.trim() || brand.appName;
    const boardTitle = title.trim() || s.titleDefault;
    const board =
      mode === 'template'
        ? buildStarterBoard(owner, boardTitle, presetId)
        : createBoard(owner, boardTitle, presetId);
    await adoptBoard(board);
    applyBoardTheme(board.theme);
  };

  const primary =
    'w-full rounded-md bg-primary px-4 py-3 font-body font-medium text-background disabled:opacity-60';
  const secondary =
    'w-full rounded-md border border-text-muted/30 px-4 py-2.5 font-body text-sm text-text-muted hover:text-text disabled:opacity-60';

  return (
    <main className="flex min-h-full items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md">
        <p className="font-body text-xs uppercase tracking-[0.25em] text-text-muted">
          {s.onboardStep.replace('{n}', String(step))}
        </p>

        {step === 1 && (
          <>
            <h1 className="mt-2 font-heading text-3xl font-semibold text-primary">{s.installTitle}</h1>
            {platform === 'ios-safari' && (
              <p className="mt-4 font-body text-text">{app(s.installIosSafari)}</p>
            )}
            {platform === 'ios-other' && (
              <>
                <p className="mt-4 font-body text-text">{app(s.installIosOther)}</p>
                <p className="mt-3 select-all rounded-md border border-text-muted/30 bg-surface px-3 py-2 font-mono text-sm text-text">
                  {window.location.origin + window.location.pathname}
                </p>
                <button type="button" className={`${secondary} mt-3`} onClick={() => void copyAddress()}>
                  {copied ? s.copied : s.copyLink}
                </button>
              </>
            )}
            {platform === 'android' && (
              <>
                <p className="mt-4 font-body text-text">{app(s.installAndroid)}</p>
                {installPrompt && (
                  <button
                    type="button"
                    className={`${primary} mt-4`}
                    onClick={() => {
                      void installPrompt.prompt();
                      setInstallPrompt(null);
                    }}
                  >
                    {app(s.installAndroidButton)}
                  </button>
                )}
                <p className="mt-3 font-body text-sm text-text-muted">{s.installAndroidManual}</p>
              </>
            )}
            {platform === 'desktop' && (
              <p className="mt-4 font-body text-text">{app(s.installDesktop)}</p>
            )}
            <div className="mt-8 flex flex-col gap-2">
              <button type="button" className={primary} onClick={() => setStep(2)}>
                {platform === 'desktop' ? s.continue : s.installDone}
              </button>
              {platform !== 'desktop' && (
                <button type="button" className={secondary} onClick={() => setStep(2)}>
                  {s.installSkip}
                </button>
              )}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="mt-2 font-heading text-3xl font-semibold text-primary">{s.connectTitle}</h1>
            {!connected && (
              <>
                <p className="mt-4 font-body text-text">{app(s.connectBody)}</p>
                <p className="mt-3 rounded-md border border-text-muted/30 bg-surface px-3 py-2 font-body text-sm text-text-muted">
                  {s.connectVerifyNote}
                </p>
                {connectNotice && (
                  <p className="mt-2 font-body text-xs text-secondary">{connectNotice}</p>
                )}
                <div className="mt-8 flex flex-col gap-2">
                  <button type="button" className={primary} disabled={busy} onClick={() => void connect()}>
                    {s.connectButton}
                  </button>
                  <button type="button" className={secondary} disabled={busy} onClick={() => setStep(3)}>
                    {s.connectSkip}
                  </button>
                  {!isInstalled() && (
                    <button type="button" className={secondary} disabled={busy} onClick={() => setStep(1)}>
                      {s.back}
                    </button>
                  )}
                </div>
              </>
            )}
            {connected && foundOnDrive && (
              <>
                <p className="mt-4 font-body font-medium text-text">{s.foundTitle}</p>
                <p className="mt-2 font-body text-text-muted">{app(s.foundBody)}</p>
                {account && (
                  <p className="mt-2 font-body text-xs text-text-muted">
                    {s.connectedAs.replace('{account}', account)}
                  </p>
                )}
                {restoreNotice && (
                  <p className="mt-3 font-body text-sm text-secondary">{restoreNotice}</p>
                )}
                <div className="mt-8 flex flex-col gap-2">
                  <button type="button" className={primary} disabled={busy} onClick={() => void restoreDrive()}>
                    {s.foundRestore}
                  </button>
                  <button type="button" className={secondary} disabled={busy} onClick={() => setStep(3)}>
                    {s.foundFresh}
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="mt-2 font-heading text-3xl font-semibold text-primary">{s.boardTitle}</h1>
            <p className="mt-3 font-body text-secondary">{s.welcomeBody}</p>

            <label className="mt-8 block font-body text-sm text-text-muted">
              {s.nameLabel}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-md border border-text-muted/30 bg-surface px-3 py-2 font-body text-text outline-none focus:border-primary"
                autoFocus
              />
            </label>

            <label className="mt-4 block font-body text-sm text-text-muted">
              {s.titleLabel}
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-md border border-text-muted/30 bg-surface px-3 py-2 font-body text-text outline-none focus:border-primary"
              />
            </label>

            <div className="mt-6">
              <span className="font-body text-sm text-text-muted">{s.themeLabel}</span>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {themePresets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setPresetId(p.id);
                      applyBoardTheme({ presetId: p.id });
                    }}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left font-body text-sm ${
                      presetId === p.id ? 'border-primary text-text' : 'border-text-muted/30 text-text-muted'
                    }`}
                  >
                    <span
                      className="inline-block h-5 w-5 shrink-0 rounded-full border border-text-muted/40"
                      style={{ background: p.colors.background }}
                    />
                    <span
                      className="inline-block h-3 w-3 shrink-0 rounded-full"
                      style={{ background: p.colors.primary }}
                    />
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6">
              <span className="font-body text-sm text-text-muted">{s.startLabel}</span>
              <div className="mt-2 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setMode('template')}
                  className={`rounded-md border px-4 py-3 text-left ${
                    mode === 'template' ? 'border-primary' : 'border-text-muted/30'
                  }`}
                >
                  <span className="block font-body font-medium text-text">{s.startTemplate}</span>
                  <span className="block font-body text-sm text-text-muted">{s.startTemplateHint}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode('empty')}
                  className={`rounded-md border px-4 py-3 text-left ${
                    mode === 'empty' ? 'border-primary' : 'border-text-muted/30'
                  }`}
                >
                  <span className="block font-body font-medium text-text">{s.startEmpty}</span>
                  <span className="block font-body text-sm text-text-muted">{s.startEmptyHint}</span>
                </button>
              </div>
            </div>

            <button type="button" onClick={begin} disabled={busy} className={`${primary} mt-8`}>
              {s.begin}
            </button>

            <button
              type="button"
              disabled={busy}
              className={`${secondary} mt-3`}
              onClick={() => importRef.current?.click()}
            >
              {strings.settings.importBackup}
            </button>
            <button type="button" disabled={busy} className={`${secondary} mt-3`} onClick={() => void restoreDrive()}>
              {s.restoreDrive}
            </button>
            <button type="button" disabled={busy} className={`${secondary} mt-3`} onClick={() => setStep(2)}>
              {s.back}
            </button>
            {restoreNotice && <p className="mt-2 font-body text-xs text-secondary">{restoreNotice}</p>}
            <input
              ref={importRef}
              type="file"
              accept=".vision,.json,application/json,application/octet-stream,application/zip"
              hidden
              onChange={(ev) => {
                const f = ev.target.files?.[0];
                ev.target.value = '';
                if (f) void restore(f);
              }}
            />
          </>
        )}
      </div>
    </main>
  );
}
