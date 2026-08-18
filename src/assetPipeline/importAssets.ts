import { db } from '../db/db';
import type { Asset } from '../domain/types';
import { sha256Hex } from './hash';
import { processImage } from './image';
import { processVideo } from './video';
import { audioDurationMs } from './audio';
import { WARN_BYTES } from './constants';

export type ImportProgress = {
  fileIndex: number;
  fileCount: number;
  filename: string;
  phase: 'hashing' | 'processing' | 'storing' | 'done';
};

export type ImportedAsset = {
  asset: Asset;
  deduped: boolean;
  /** True above WARN_BYTES; the UI shows the large file copy, never blocks. */
  oversized: boolean;
};

function kindOf(mime: string): Asset['kind'] | null {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return null;
}

// The single ingest path behind every import method: hash, dedupe against
// the store, process by kind, persist. Returns the stored asset either way.
export async function importBlob(
  blob: Blob,
  opts: { filename?: string; archiveOriginals: boolean; onProgress?: (p: Omit<ImportProgress, 'fileIndex' | 'fileCount'>) => void },
): Promise<ImportedAsset> {
  const kind = kindOf(blob.type);
  if (!kind) throw new Error(`unsupported type: ${blob.type || 'unknown'}`);
  const filename = opts.filename ?? '';
  const oversized = blob.size > WARN_BYTES;

  opts.onProgress?.({ filename, phase: 'hashing' });
  const id = await sha256Hex(blob);
  const existing = await db.assets.get(id);
  if (existing) {
    opts.onProgress?.({ filename, phase: 'done' });
    return { asset: existing, deduped: true, oversized };
  }

  opts.onProgress?.({ filename, phase: 'processing' });
  const base: Asset = {
    id,
    kind,
    mime: blob.type,
    bytes: blob.size,
    blob,
    originalFilename: filename || undefined,
    addedAt: new Date().toISOString(),
  };

  let asset: Asset = base;
  if (kind === 'image') {
    const p = await processImage(blob);
    asset = {
      ...base,
      blob: p.blob,
      thumbBlob: p.thumbBlob,
      width: p.width,
      height: p.height,
      originalBlob: p.downscaled && opts.archiveOriginals ? blob : undefined,
    };
  } else if (kind === 'video') {
    const p = await processVideo(blob);
    asset = {
      ...base,
      thumbBlob: p.thumbBlob,
      posterBlob: p.posterBlob,
      width: p.width,
      height: p.height,
      durationMs: p.durationMs,
    };
  } else {
    asset = { ...base, durationMs: await audioDurationMs(blob).catch(() => undefined) };
  }

  opts.onProgress?.({ filename, phase: 'storing' });
  await db.assets.put(asset);
  opts.onProgress?.({ filename, phase: 'done' });
  return { asset, deduped: false, oversized };
}

export async function importFiles(
  files: File[],
  opts: { archiveOriginals: boolean; onProgress?: (p: ImportProgress) => void },
): Promise<ImportedAsset[]> {
  const results: ImportedAsset[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    results.push(
      await importBlob(f, {
        filename: f.name,
        archiveOriginals: opts.archiveOriginals,
        onProgress: (p) => opts.onProgress?.({ ...p, fileIndex: i, fileCount: files.length }),
      }),
    );
  }
  return results;
}

// Paste of an image or video URL. A user-initiated fetch, the one network
// action authoring performs, and only ever at the user's explicit request.
export async function importUrl(
  url: string,
  opts: { archiveOriginals: boolean },
): Promise<ImportedAsset> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const blob = await res.blob();
  const filename = new URL(url).pathname.split('/').pop() ?? '';
  return importBlob(blob, { filename, archiveOriginals: opts.archiveOriginals });
}

// Object URL cache so repeated renders of the same asset do not mint and
// leak new object URLs.
const urlCache = new Map<string, string>();
export function assetObjectUrl(id: string, blob: Blob, variant: 'full' | 'thumb' | 'poster' = 'full'): string {
  const key = `${id}:${variant}`;
  let url = urlCache.get(key);
  if (!url) {
    url = URL.createObjectURL(blob);
    urlCache.set(key, url);
  }
  return url;
}
