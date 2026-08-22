import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { strings } from '../../config';
import { CANVAS_W, CANVAS_H, type OutputTarget, type Page as PageT } from '../../domain/types';
import { useBoardContext } from '../board/BoardContext';
import { getPageTypeDef, pageTypeRegistry } from '../../pageTypes/registry';
import { ImportProvider, useImport } from './ImportContext';
import {
  addItemBlock,
  addPage,
  createPage,
  resnapToTemplate,
  slotsOfPage,
  updatePage,
  setInclude,
} from './boardOps';
import { PageRail } from './PageRail';
import { PageView } from './PageView';
import { BlockInspector } from './BlockInspector';
import { AffirmationEditor } from './AffirmationEditor';
import { OrderEditor } from '../ordering/OrderEditor';
import type { SnapLines } from './CanvasBlockFrame';
import { fontChoices } from '../../theme/fontChoices';
import { useAsset } from './useAssetUrl';
import { importFiles as importFilesRaw } from '../../assetPipeline/importAssets';
import { SettingsPanel } from '../settings/SettingsPanel';
import { RecordButton } from './RecordButton';
import { useSyncEngine, ConflictDialog } from '../sync/SyncSection';
import { MeditationLibraryPanel } from './MeditationLibraryPanel';
import { PlaybackScreen } from '../playback/PlaybackScreen';
import { pageIsLight, themeIsLightNow } from '../../theme/pageAppearance';
import { RatingsScreen } from '../tracker/RatingsScreen';
import { AnchorsScreen, shouldOfferAnchors } from '../tracker/AnchorsScreen';
import { ProgressView } from '../tracker/ProgressView';
import { hasRatingFor } from '../playback/streak';
import type { PlaylistId } from '../../domain/types';

const e = strings.editor;
type PageTypeStrings = Record<string, { name: string; description: string }>;

export function EditorScreen() {
  return (
    <ImportProvider slotsOf={slotsOfPage}>
      <EditorInner />
    </ImportProvider>
  );
}

function EditorInner() {
  const { board, mutate, undo, redo, canUndo, canRedo, saveState } = useBoardContext();
  const [view, setView] = useState<'edit' | 'order'>('edit');
  const [selectedPageId, setSelectedPageId] = useState<string | null>(board?.pages[0]?.id ?? null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [snapLines, setSnapLines] = useState<SnapLines | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [playing, setPlaying] = useState<PlaylistId | null>(null);
  const [, setRatingTick] = useState(0);
  // Skip for now bypasses the rating gate for this launch only; the
  // questions come back next time because nothing is written.
  const [ratingSkippedFor, setRatingSkippedFor] = useState<PlaylistId | null>(null);
  const [progressOpen, setProgressOpen] = useState(false);
  const [sessionSaved, setSessionSaved] = useState(false);
  const savedTimer = useRef<number | undefined>(undefined);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { busyLabel, notice, clearNotice, importClipboardTo, importFilesTo } = useImport();
  const syncEngine = useSyncEngine();

  const page = board?.pages.find((p) => p.id === selectedPageId) ?? board?.pages[0] ?? null;
  const pageId = page?.id ?? null;

  // Keyboard: undo, redo. Text editing stops propagation before this.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const el = ev.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) return;
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z' && !ev.shiftKey) {
        ev.preventDefault();
        undo();
      } else if (
        ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') ||
        ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && ev.key.toLowerCase() === 'z')
      ) {
        ev.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // Clipboard paste of an image lands in the selected slot, or the first
  // empty media slot of the current page.
  useEffect(() => {
    const onPaste = (ev: ClipboardEvent) => {
      if (!pageId) return;
      const el = ev.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return;
      const items = [...(ev.clipboardData?.items ?? [])];
      const media = items.find((i) => /^(image|video)\//.test(i.type));
      const blob = media?.getAsFile();
      if (blob) {
        ev.preventDefault();
        const slotId = page?.blocks.find((b) => b.id === selectedBlockId && b.slotId)?.slotId;
        void importClipboardTo(blob, { pageId, slotId });
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [pageId, page, selectedBlockId, importClipboardTo]);

  if (!board) return null;

  if (view === 'order') {
    return <OrderEditor onBack={() => setView('edit')} />;
  }

  const def = page ? getPageTypeDef(page.type) : null;
  const names = strings.pageTypes as PageTypeStrings;
  const selectedBlock = page?.blocks.find((b) => b.id === selectedBlockId) ?? null;

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Top bar */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-text-muted/15 px-2 py-2 md:px-4">
        <h1 className="truncate font-heading text-lg text-primary">{board.meta.title}</h1>
        <span className="font-body text-xs text-text-muted">
          {saveState === 'saving' ? strings.common.saving : saveState === 'saved' ? strings.common.saved : ''}
        </span>
        <span className="font-body text-[10px] text-text-muted/60">{__BUILD_ID__}</span>
        {syncEngine.status && (
          <button
            type="button"
            className={
              syncEngine.paused
                ? 'truncate rounded-full bg-amber-400 px-2.5 py-0.5 font-body text-xs font-semibold text-black hover:bg-amber-300'
                : 'truncate font-body text-xs text-text-muted hover:text-text'
            }
            onClick={() => void syncEngine.syncNow()}
            title={strings.sync.title}
          >
            {syncEngine.paused ? strings.sync.pausedPill : syncEngine.status}
          </button>
        )}
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
          <TopButton label={strings.common.undo} disabled={!canUndo} onClick={undo} />
          <TopButton label={strings.common.redo} disabled={!canRedo} onClick={redo} />
          <TopButton label={e.outputOrder} onClick={() => setView('order')} />
          <TopButton label={strings.tracker.progress} onClick={() => setProgressOpen(true)} />
          <TopButton label={e.settings} onClick={() => setSettingsOpen(true)} />
          <button
            type="button"
            className="rounded border border-text-muted/30 px-3 py-1.5 font-body text-sm text-text-muted hover:text-text"
            onClick={() => setAddOpen(true)}
          >
            {e.addPage}
          </button>
          <div className="relative">
            <button
              type="button"
              className="rounded bg-primary px-3 py-1.5 font-body text-sm font-medium text-background hover:opacity-90"
              onClick={() => setPreviewOpen((v) => !v)}
            >
              {strings.playback.preview}
            </button>
            {previewOpen && (
              <div className="absolute right-0 top-full z-40 mt-1 flex w-36 flex-col rounded border border-text-muted/25 bg-surface p-1 shadow-xl">
                {(['morning', 'evening'] as PlaylistId[]).map((pl) => {
                  const isDefault = (new Date().getHours() < 12 ? 'morning' : 'evening') === pl;
                  return (
                    <button
                      key={pl}
                      type="button"
                      className={`rounded px-3 py-1.5 text-left font-body text-sm ${isDefault ? 'font-medium text-text' : 'text-text-muted'} hover:bg-background`}
                      onClick={() => {
                        setPreviewOpen(false);
                        setRatingSkippedFor(null);
                        setPlaying(pl);
                      }}
                    >
                      {pl === 'morning' ? strings.playback.playMorning : strings.playback.playEvening}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex min-h-0 grow flex-col md:flex-row">
        <PageRail
          board={board}
          selectedPageId={pageId}
          onSelect={(id) => {
            setSelectedPageId(id);
            setSelectedBlockId(null);
            setEditingBlockId(null);
          }}
          onDeleted={() => setSelectedPageId(null)}
        />

        <div className="flex min-w-0 grow flex-col">
          {page && def ? (
            <>
              {/* Page inspector strip */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-text-muted/15 px-4 py-2">
                <input
                  value={page.title}
                  placeholder={e.pageTitleLabel}
                  onChange={(ev) => mutate((b) => updatePage(b, page.id, { title: ev.target.value }))}
                  className="w-48 rounded border border-transparent bg-transparent px-1 font-body text-sm text-text outline-none focus:border-text-muted/30"
                />
                {getPageTypeDef(page.type)
                  .templates.find((t) => t.id === page.templateId)
                  ?.slots.some((sl) => sl.id === 'subtitle') && (
                  <input
                    value={page.subtitle}
                    placeholder={e.pageSubtitleLabel}
                    onChange={(ev) => mutate((b) => updatePage(b, page.id, { subtitle: ev.target.value }))}
                    className="w-48 rounded border border-transparent bg-transparent px-1 font-body text-xs text-text-muted outline-none focus:border-text-muted/30"
                  />
                )}
                {def.templates.length > 1 && (
                  <select
                    value={page.templateId}
                    onChange={(ev) => mutate((b) => updatePage(b, page.id, { templateId: ev.target.value }))}
                    className="rounded border border-text-muted/30 bg-background px-2 py-1 font-body text-xs text-text"
                  >
                    {def.templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {(strings.templates as Record<string, string>)[t.nameKey] ?? t.id}
                      </option>
                    ))}
                  </select>
                )}
                {def.authoring === undefined && (
                  <button
                    type="button"
                    className="rounded border border-text-muted/30 px-2 py-1 font-body text-xs text-text-muted hover:text-text"
                    onClick={() => {
                      if (page.layout === 'template') {
                        mutate((b) => updatePage(b, page.id, { layout: 'canvas' }));
                      } else if (window.confirm(e.relockWarning)) {
                        mutate((b) => resnapToTemplate(b, page.id));
                      }
                    }}
                  >
                    {page.layout === 'template' ? e.unlockCanvas : e.relockTemplate}
                  </button>
                )}
                {def.authoring === undefined && (
                  <select
                    title={e.masterFontLabel}
                    value={page.masterFont ?? ''}
                    onChange={(ev) =>
                      mutate((b) => updatePage(b, page.id, { masterFont: ev.target.value || undefined }))
                    }
                    className="rounded border border-text-muted/30 bg-background px-2 py-1 font-body text-xs text-text"
                  >
                    <option value="">{e.masterFontTheme}</option>
                    {fontChoices.map((f) => (
                      <option key={f.family} value={f.family}>
                        {f.family}
                      </option>
                    ))}
                  </select>
                )}
                {def.pageAudio && <PageAudioControl page={page} />}
                {def.meditationBuilder && (
                  <button
                    type="button"
                    className="rounded border border-text-muted/30 px-2 py-1 font-body text-xs text-text-muted hover:text-text"
                    onClick={() => setLibraryOpen(true)}
                  >
                    {strings.meditation.libraryTitle}
                  </button>
                )}
                {getPageTypeDef(page.type)
                  .templates.find((t) => t.id === page.templateId)
                  ?.slots.some((sl) => sl.id === 'background' && sl.kind === 'media') && (
                  <BackgroundControl page={page} onAdjust={(id) => setSelectedBlockId(id)} />
                )}
                {def.authoring === 'affirmation-list' && (
                  <label
                    title={e.affirmationRollHint}
                    className="flex items-center gap-1.5 font-body text-xs text-text-muted"
                  >
                    <input
                      type="checkbox"
                      checked={page.affirmationDisplay === 'roll'}
                      onChange={(ev) =>
                        mutate((b) =>
                          updatePage(b, page.id, { affirmationDisplay: ev.target.checked ? 'roll' : 'screens' }),
                        )
                      }
                      className="h-3.5 w-3.5 accent-[var(--tc-primary)]"
                    />
                    {e.affirmationRoll}
                  </label>
                )}
                {(def.textFlow || page.type === 'free-canvas') && def.authoring === undefined && (
                  <button
                    type="button"
                    title={e.lightPage}
                    onClick={() =>
                      mutate((b) =>
                        updatePage(b, page.id, {
                          appearance: pageIsLight(page)
                            ? themeIsLightNow()
                              ? 'dark'
                              : undefined
                            : themeIsLightNow()
                              ? undefined
                              : 'light',
                        }),
                      )
                    }
                    className="rounded border border-text-muted/30 px-2 py-1 font-body text-sm leading-none text-text-muted hover:text-text"
                  >
                    {pageIsLight(page) ? '☀' : '☾'}
                  </button>
                )}
                {def.textFlow && def.authoring === undefined && (
                  <label className="flex items-center gap-1.5 font-body text-xs text-text-muted">
                    <input
                      type="checkbox"
                      checked={page.textRoll ?? false}
                      onChange={(ev) => mutate((b) => updatePage(b, page.id, { textRoll: ev.target.checked }))}
                      className="h-3.5 w-3.5 accent-[var(--tc-primary)]"
                    />
                    {e.textRoll}
                  </label>
                )}
                {(page.textRoll || page.affirmationDisplay === 'roll') && (
                  <label className="flex items-center gap-1.5 font-body text-xs text-text-muted">
                    {e.rollSpeedLabel}
                    <select
                      value={page.rollSpeed ?? 'normal'}
                      onChange={(ev) =>
                        mutate((b) => updatePage(b, page.id, { rollSpeed: ev.target.value as 'slow' | 'normal' | 'fast' }))
                      }
                      className="rounded border border-text-muted/30 bg-background px-1 py-0.5 font-body text-xs text-text"
                    >
                      <option value="slow">{e.rollSlow}</option>
                      <option value="normal">{e.rollNormal}</option>
                      <option value="fast">{e.rollFast}</option>
                    </select>
                  </label>
                )}
                {def.cellExpansion && (
                  <label
                    title={e.expandCellsHint}
                    className="flex items-center gap-1.5 font-body text-xs text-text-muted"
                  >
                    <input
                      type="checkbox"
                      checked={page.expandCells ?? false}
                      onChange={(ev) => mutate((b) => updatePage(b, page.id, { expandCells: ev.target.checked }))}
                      className="h-3.5 w-3.5 accent-[var(--tc-primary)]"
                    />
                    {e.expandCells}
                  </label>
                )}
                {def.itemFlow && page.layout === 'template' && (
                  <button
                    type="button"
                    className="rounded border border-text-muted/30 px-2 py-1 font-body text-xs text-text-muted hover:text-text"
                    onClick={() => mutate((b) => addItemBlock(b, page.id))}
                  >
                    {e.addItem}
                  </button>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <span className="font-body text-[11px] text-text-muted">{e.includeIn}</span>
                  {(['morning', 'evening', 'pdf', 'html'] as OutputTarget[]).map((t) => (
                    <label key={t} className="flex items-center gap-1 font-body text-[11px] text-text-muted">
                      <input
                        type="checkbox"
                        checked={page.include[t]}
                        onChange={(ev) => mutate((b) => setInclude(b, page.id, t, ev.target.checked))}
                        className="h-3 w-3 accent-[var(--tc-primary)]"
                      />
                      {
                        {
                          morning: e.includeMorning,
                          evening: e.includeEvening,
                          pdf: e.includePdf,
                          html: e.includeHtml,
                        }[t]
                      }
                    </label>
                  ))}
                </div>
              </div>

              {selectedBlock && def.authoring === undefined && (
                <BlockInspector board={board} page={page} block={selectedBlock} />
              )}

              {/* Working area */}
              {def.authoring === 'affirmation-list' ? (
                <div className="min-h-0 grow overflow-y-auto">
                  <AffirmationEditor />
                </div>
              ) : (
                <ScaledCanvas
                  key={page.id}
                  pageHeight={Math.max(CANVAS_H, ...page.blocks.map((b) => b.rect.y + b.rect.h + 96))}
                >
                  {(scale) => (
                    <PageView
                      board={board}
                      page={page}
                      variant="canvas"
                      scale={scale}
                      selectedBlockId={selectedBlockId}
                      editingBlockId={editingBlockId}
                      onSelectBlock={(id) => {
                        setSelectedBlockId(id);
                        if (!id) setEditingBlockId(null);
                      }}
                      onStartEdit={(id) => setEditingBlockId(id)}
                      onEndEdit={() => setEditingBlockId(null)}
                      snapLines={snapLines}
                      onSnapLines={setSnapLines}
                    />
                  )}
                </ScaledCanvas>
              )}
            </>
          ) : (
            <div className="flex grow flex-col items-center justify-center gap-2">
              <p className="font-heading text-2xl text-text">{e.emptyBoardTitle}</p>
              <p className="font-body text-sm text-text-muted">{e.emptyBoardBody}</p>
              <button
                type="button"
                className="mt-2 rounded bg-primary px-4 py-2 font-body text-sm font-medium text-background"
                onClick={() => setAddOpen(true)}
              >
                {e.addPage}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Toasts */}
      {(busyLabel || notice) && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
          <div className="pointer-events-auto flex items-center gap-3 rounded bg-surface px-4 py-2 font-body text-sm text-text shadow-lg">
            {busyLabel ?? notice}
            {notice && (
              <button type="button" className="text-text-muted" onClick={clearNotice}>
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      {/* Add page picker */}
      {addOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
          onClick={() => setAddOpen(false)}
        >
          <div
            className="max-h-full w-full max-w-2xl overflow-y-auto rounded-lg bg-surface p-4"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-xl text-text">{e.addPage}</h2>
              <button
                type="button"
                className="rounded px-2 py-1 font-body text-sm text-text-muted hover:text-text"
                onClick={() => setAddOpen(false)}
              >
                {strings.common.close} ✕
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {pageTypeRegistry.map((d) => (
                <button
                  key={d.type}
                  type="button"
                  className="rounded border border-text-muted/25 p-3 text-left hover:border-primary"
                  onClick={() => {
                    const p = createPage(d.type, names[d.type]?.name ?? d.type);
                    mutate((b) => addPage(b, p, pageId ?? undefined));
                    setSelectedPageId(p.id);
                    setAddOpen(false);
                  }}
                >
                  <span className="block font-body font-medium text-text">{names[d.type]?.name}</span>
                  <span className="block font-body text-xs text-text-muted">{names[d.type]?.description}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} syncEngine={syncEngine} />}

      {progressOpen && <ProgressView onClose={() => setProgressOpen(false)} />}

      {sessionSaved && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-text-muted/25 bg-surface px-5 py-2 font-body text-sm text-text shadow-lg">
          {strings.completion.savedNotice}
        </div>
      )}

      {libraryOpen && <MeditationLibraryPanel onClose={() => setLibraryOpen(false)} />}

      <ConflictDialog engine={syncEngine} />

      {playing &&
        (shouldOfferAnchors(board) ? (
          <AnchorsScreen onDone={() => setRatingTick((n) => n + 1)} />
        ) : !hasRatingFor(board, playing) && ratingSkippedFor !== playing ? (
          <RatingsScreen
            playlistId={playing}
            onDone={() => setRatingTick((n) => n + 1)}
            onCancel={() => setPlaying(null)}
            onSkip={() => setRatingSkippedFor(playing)}
          />
        ) : (
          <PlaybackScreen
            playlistId={playing}
            onExit={() => setPlaying(null)}
            onComplete={() => {
              setPlaying(null);
              setSessionSaved(true);
              window.clearTimeout(savedTimer.current);
              savedTimer.current = window.setTimeout(() => setSessionSaved(false), 4000);
              // A finished session is the natural moment to push; don't
              // wait out the thirty-second debounce. Interactive, so an
              // expired sign-in asks instead of quietly standing down.
              // The short defer lets the completion mutation land in
              // board state first and stays inside the tap's activation
              // window for the popup.
              window.setTimeout(() => void syncEngine.syncNow(), 800);
            }}
          />
        ))}

      {/* Page-level drop target: anywhere on the window that is not a slot. */}
      <WindowDrop onFiles={(files) => pageId && importFilesTo(files, { pageId })} />
    </div>
  );
}

// The audio meditation attached to a page (ASP process). Stored through
// the same content-addressed pipeline; playback plays it on this page.
function PageAudioControl({ page }: { page: PageT }) {
  const { board, mutate } = useBoardContext();
  const fileRef = useRef<HTMLInputElement>(null);
  const asset = useAsset(page.narrationAssetId);
  const secs = asset?.durationMs ? Math.round(asset.durationMs / 1000) : null;
  return (
    <span className="flex items-center gap-1.5 font-body text-xs text-text-muted">
      {e.pageAudioLabel}
      {asset && secs !== null && (
        <span className="text-text">
          {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}
        </span>
      )}
      <button
        type="button"
        className="rounded border border-text-muted/30 px-2 py-0.5 hover:text-text"
        onClick={() => fileRef.current?.click()}
      >
        {asset ? e.pageAudioReplace : e.pageAudioAdd}
      </button>
      <RecordButton onRecorded={(id) => mutate((b) => updatePage(b, page.id, { narrationAssetId: id }))} />
      {asset && (
        <>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={page.audioLoop ?? false}
              onChange={(ev) => mutate((b) => updatePage(b, page.id, { audioLoop: ev.target.checked }))}
              className="h-3 w-3 accent-[var(--tc-primary)]"
            />
            {e.audioLoop}
          </label>
          <select
            value={page.audioStart ?? 'auto'}
            onChange={(ev) =>
              mutate((b) => updatePage(b, page.id, { audioStart: ev.target.value as 'auto' | 'tap' }))
            }
            className="rounded border border-text-muted/30 bg-background px-1 py-0.5 font-body text-xs text-text"
          >
            <option value="auto">{e.audioStartAuto}</option>
            <option value="tap">{e.audioStartTap}</option>
          </select>
          <button
            type="button"
            className="rounded border border-text-muted/30 px-2 py-0.5 hover:text-text"
            onClick={() => mutate((b) => updatePage(b, page.id, { narrationAssetId: undefined }))}
          >
            {strings.common.remove}
          </button>
        </>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        hidden
        onChange={async (ev) => {
          const file = ev.target.files?.[0];
          ev.target.value = '';
          if (!file || !board) return;
          const [r] = await importFilesRaw([file], {
            archiveOriginals: board.settings.archiveOriginals,
          });
          if (r) mutate((b) => updatePage(b, page.id, { narrationAssetId: r.asset.id }));
        }}
      />
    </span>
  );
}

// Explicit background affordance for pages whose full-bleed background
// slot sits underneath the text areas and cannot be clicked directly.
function BackgroundControl({ page, onAdjust }: { page: PageT; onAdjust: (blockId: string) => void }) {
  const { mutate } = useBoardContext();
  const { importFilesTo } = useImport();
  const fileRef = useRef<HTMLInputElement>(null);
  const bg = page.blocks.find((b) => b.slotId === 'background' && b.assetId);
  return (
    <span className="flex items-center gap-1.5 font-body text-xs text-text-muted">
      {e.backgroundLabel}
      <button
        type="button"
        className="rounded border border-text-muted/30 px-2 py-0.5 hover:text-text"
        onClick={() => fileRef.current?.click()}
      >
        {bg ? strings.common.replace : strings.common.add}
      </button>
      {bg && (
        <button
          type="button"
          className="rounded border border-text-muted/30 px-2 py-0.5 hover:text-text"
          onClick={() => onAdjust(bg.id)}
        >
          {e.backgroundAdjust}
        </button>
      )}
      {bg && (
        <button
          type="button"
          className="rounded border border-text-muted/30 px-2 py-0.5 hover:text-text"
          onClick={() =>
            mutate((b) => ({
              ...b,
              pages: b.pages.map((p) =>
                p.id === page.id
                  ? { ...p, blocks: p.blocks.filter((bl) => bl.id !== bg.id) }
                  : p,
              ),
            }))
          }
        >
          {strings.common.remove}
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        hidden
        onChange={(ev) => {
          const files = [...(ev.target.files ?? [])];
          ev.target.value = '';
          if (files.length) void importFilesTo(files, { pageId: page.id, slotId: 'background' });
        }}
      />
    </span>
  );
}

function TopButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded border border-text-muted/30 px-2.5 py-1.5 font-body text-xs text-text-muted enabled:hover:text-text disabled:opacity-40"
    >
      {label}
    </button>
  );
}

// Measures the available area and scales the 1275-unit page to fit its
// width, scrolling vertically when the page overflows.
function ScaledCanvas({
  pageHeight,
  children,
}: {
  pageHeight: number;
  children: (scale: number) => React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const pad = 48;
    const s = Math.min((el.clientWidth - pad) / CANVAS_W, (el.clientHeight - pad) / CANVAS_H);
    setScale(Math.max(0.1, Math.min(1.5, s)));
  }, []);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, [measure]);

  const content = useMemo(() => children(scale), [children, scale]);

  return (
    <div ref={ref} className="min-h-0 grow overflow-auto p-6">
      <div
        className="mx-auto shadow-2xl"
        style={{ width: CANVAS_W * scale, height: pageHeight * scale }}
      >
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>{content}</div>
      </div>
    </div>
  );
}

// Full-window drag and drop for media files, ignoring drops that land on
// a slot (slots handle their own).
function WindowDrop({ onFiles }: { onFiles: (files: File[]) => void }) {
  useEffect(() => {
    const over = (ev: DragEvent) => ev.preventDefault();
    const drop = (ev: DragEvent) => {
      ev.preventDefault();
      const files = [...(ev.dataTransfer?.files ?? [])].filter((f) =>
        /^(image|video|audio)\//.test(f.type),
      );
      if (files.length) onFiles(files);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [onFiles]);
  return null;
}
