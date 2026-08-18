import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { importBlob, importFiles, importUrl, type ImportedAsset } from '../../assetPipeline/importAssets';
import { PROGRESS_BYTES } from '../../assetPipeline/constants';
import { strings } from '../../config';
import { useBoardContext } from '../board/BoardContext';
import type { Asset, Block, Board } from '../../domain/types';
import type { SlotDef } from '../../pageTypes/types';

// One import service for every method: picker, drop, paste, URL, camera
// roll. All of them funnel into the same content-addressed pipeline and
// the same slot assignment.

export type ImportTarget = { pageId: string; slotId?: string };

type ImportContextValue = {
  importFilesTo: (files: File[], target: ImportTarget) => Promise<void>;
  importUrlTo: (url: string, target: ImportTarget) => Promise<void>;
  importClipboardTo: (blob: Blob, target: ImportTarget) => Promise<void>;
  busyLabel: string | null;
  notice: string | null;
  clearNotice: () => void;
};

const Ctx = createContext<ImportContextValue | null>(null);

function defaultKenBurns() {
  return {
    enabled: true,
    from: { x: 0, y: 0, w: 1, h: 1 },
    to: { x: 0.05, y: 0.05, w: 0.9, h: 0.9 },
    durationMs: 8000,
  };
}

// Places an asset into a slot: reuse the occupying block when one exists,
// otherwise create one. Without a slot id, the first empty media slot of
// the page template takes it (used by paste and page-level drop).
export function assignAsset(
  board: Board,
  target: ImportTarget,
  asset: Asset,
  slotsOf: (board: Board, pageId: string) => SlotDef[],
): Board {
  const page = board.pages.find((p) => p.id === target.pageId);
  if (!page) return board;
  const mediaSlots = slotsOf(board, page.id).filter((s) => s.kind === 'media');
  let slotId = target.slotId;
  if (!slotId) {
    const empty = mediaSlots.find((s) => !page.blocks.some((b) => b.slotId === s.id && b.assetId));
    slotId = (empty ?? mediaSlots[0])?.id;
  }
  if (!slotId) return board;
  const slot = mediaSlots.find((s) => s.id === slotId);
  // Layer media at its slot's position in the template, so a full-bleed
  // background stays behind the text slots that follow it. Canvas mode
  // sorts strictly by z and would otherwise paint media on top.
  const slotZ = slotsOf(board, page.id).findIndex((s) => s.id === slotId);
  const kind: Block['kind'] = asset.kind === 'video' ? 'video' : asset.kind === 'audio' ? 'audio' : 'image';
  const existing = page.blocks.find((b) => b.slotId === slotId);
  const nextBlocks = existing
    ? page.blocks.map((b) =>
        b.id === existing.id
          ? { ...b, kind, assetId: asset.id, z: slotZ >= 0 ? slotZ : b.z, focal: { x: 0.5, y: 0.5 }, kenBurns: kind === 'image' ? (b.kenBurns ?? defaultKenBurns()) : undefined }
          : b,
      )
    : [
        ...page.blocks,
        {
          id: crypto.randomUUID(),
          kind,
          slotId,
          assetId: asset.id,
          rect: slot ? { ...slot.rect } : { x: 96, y: 300, w: 600, h: 400, rot: 0 },
          z: slotZ >= 0 ? slotZ : Math.max(0, ...page.blocks.map((b) => b.z)) + 1,
          focal: { x: 0.5, y: 0.5 },
          kenBurns: kind === 'image' ? defaultKenBurns() : undefined,
        },
      ];
  return {
    ...board,
    pages: board.pages.map((p) => (p.id === page.id ? { ...p, blocks: nextBlocks } : p)),
  };
}

export function ImportProvider({
  children,
  slotsOf,
}: {
  children: ReactNode;
  slotsOf: (board: Board, pageId: string) => SlotDef[];
}) {
  const { board, mutate } = useBoardContext();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const archive = board?.settings.archiveOriginals ?? true;

  const finish = useCallback(
    (results: ImportedAsset[], target: ImportTarget) => {
      if (results.some((r) => r.oversized)) setNotice(strings.import.largeFileWarning);
      for (const r of results) {
        mutate((b) => assignAsset(b, target, r.asset, slotsOf));
      }
    },
    [mutate, slotsOf],
  );

  const importFilesTo = useCallback(
    async (files: File[], target: ImportTarget) => {
      const media = files.filter((f) => /^(image|video|audio)\//.test(f.type));
      if (!media.length) {
        setNotice(strings.import.unsupportedType);
        return;
      }
      const showProgress = media.some((f) => f.size > PROGRESS_BYTES) || media.length > 1;
      try {
        const results = await importFiles(media, {
          archiveOriginals: archive,
          onProgress: showProgress
            ? (p) => setBusyLabel(`${strings.import.importing} ${p.fileIndex + 1}/${p.fileCount}`)
            : undefined,
        });
        finish(results, target);
      } catch {
        setNotice(strings.import.unsupportedType);
      } finally {
        setBusyLabel(null);
      }
    },
    [archive, finish],
  );

  const importUrlTo = useCallback(
    async (url: string, target: ImportTarget) => {
      setBusyLabel(strings.import.importing);
      try {
        finish([await importUrl(url, { archiveOriginals: archive })], target);
      } catch {
        setNotice(strings.import.urlFailed);
      } finally {
        setBusyLabel(null);
      }
    },
    [archive, finish],
  );

  const importClipboardTo = useCallback(
    async (blob: Blob, target: ImportTarget) => {
      try {
        finish([await importBlob(blob, { archiveOriginals: archive })], target);
      } catch {
        setNotice(strings.import.unsupportedType);
      }
    },
    [archive, finish],
  );

  return (
    <Ctx.Provider
      value={{ importFilesTo, importUrlTo, importClipboardTo, busyLabel, notice, clearNotice: () => setNotice(null) }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useImport(): ImportContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useImport requires ImportProvider');
  return ctx;
}
