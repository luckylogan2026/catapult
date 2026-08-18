import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';
import { db } from '../../db/db';
import { getDeviceId } from '../../db/kv';
import { SCHEMA_VERSION, type Asset, type Board } from '../../domain/types';
import { strings } from '../../config';

// The .vision bundle: a zip holding board.json, every referenced asset
// as assets/<hash>.<ext>, and a manifest with the schema version and
// device id. It is the backup format and, later, the sync payload.
// Media is stored uncompressed inside the zip because it is already
// compressed; the JSON gets deflate.

type Manifest = {
  schemaVersion: number;
  deviceId: string;
  exportedAt: string;
};

function extFor(mime: string): string {
  const map: Record<string, string> = {
    'image/webp': 'webp',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/wav': 'wav',
    'audio/webm': 'weba',
    'audio/ogg': 'ogg',
  };
  return map[mime] ?? 'bin';
}

function mimeFor(ext: string): string {
  const map: Record<string, string> = {
    webp: 'image/webp',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    wav: 'audio/wav',
    weba: 'audio/webm',
    ogg: 'audio/ogg',
  };
  return map[ext] ?? 'application/octet-stream';
}

/** Every asset id the board references, from any field that can hold one. */
export function referencedAssetIds(board: Board): Set<string> {
  const ids = new Set<string>();
  for (const page of board.pages) {
    if (page.narrationAssetId) ids.add(page.narrationAssetId);
    for (const b of page.blocks) if (b.assetId) ids.add(b.assetId);
  }
  for (const a of board.affirmations) {
    if (a.imageAssetId) ids.add(a.imageAssetId);
    if (a.audioAssetId) ids.add(a.audioAssetId);
  }
  for (const m of board.masterAffirmations ?? []) {
    if (m.audioAssetId) ids.add(m.audioAssetId);
  }
  for (const pl of board.playlists) {
    if (pl.backgroundTrackAssetId) ids.add(pl.backgroundTrackAssetId);
  }
  return ids;
}

export async function exportVisionBundle(board: Board): Promise<Blob> {
  const ids = referencedAssetIds(board);
  const files: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};

  const manifest: Manifest = {
    schemaVersion: board.schemaVersion,
    deviceId: await getDeviceId(),
    exportedAt: new Date().toISOString(),
  };
  files['manifest.json'] = [strToU8(JSON.stringify(manifest, null, 2)), { level: 6 }];
  files['board.json'] = [strToU8(JSON.stringify(board)), { level: 6 }];

  for (const id of ids) {
    const asset = await db.assets.get(id);
    if (!asset) continue;
    files[`assets/${id}.${extFor(asset.mime)}`] = [
      new Uint8Array(await asset.blob.arrayBuffer()),
      { level: 0 },
    ];
  }

  const zipped = zipSync(files);
  const copy = new Uint8Array(zipped.length);
  copy.set(zipped);
  return new Blob([copy.buffer], { type: 'application/octet-stream' });
}

export function bundleFilename(board: Board): string {
  const date = new Date().toISOString().slice(0, 10);
  const owner = board.meta.ownerName.trim().replace(/\s+/g, '-') || 'board';
  return `${owner}-vision-${date}.vision`;
}

export type ImportResult =
  | { ok: true; board: Board; assetCount: number }
  | { ok: false; reason: string };

// Reads and validates a bundle. Assets go straight into the store
// (content addressing makes re-import harmless); the caller decides
// when to adopt the board, after confirming the replacement.
export async function importVisionBundle(file: Blob): Promise<ImportResult> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    return { ok: false, reason: strings.settings.importInvalid };
  }
  const boardRaw = entries['board.json'];
  const manifestRaw = entries['manifest.json'];
  if (!boardRaw || !manifestRaw) return { ok: false, reason: strings.settings.importInvalid };

  let manifest: Manifest;
  let board: Board;
  try {
    manifest = JSON.parse(strFromU8(manifestRaw));
    board = JSON.parse(strFromU8(boardRaw));
  } catch {
    return { ok: false, reason: strings.settings.importInvalid };
  }

  // Never open a bundle from a newer app. Migrating forward is fine,
  // guessing at an unknown future schema is not.
  if (manifest.schemaVersion > SCHEMA_VERSION) {
    return { ok: false, reason: strings.settings.importNewer };
  }
  if (!board?.id || !Array.isArray(board.pages)) {
    return { ok: false, reason: strings.settings.importInvalid };
  }

  let assetCount = 0;
  for (const [path, data] of Object.entries(entries)) {
    const m = /^assets\/([0-9a-f]{64})\.([A-Za-z0-9]+)$/.exec(path);
    if (!m) continue;
    const [, id, ext] = m;
    const copy = new Uint8Array(data.length);
    copy.set(data);
    const blob = new Blob([copy.buffer], { type: mimeFor(ext.toLowerCase()) });
    const existing = await db.assets.get(id);
    if (!existing) {
      await storeBundleAsset(id, blob);
      assetCount++;
    }
  }

  return { ok: true, board, assetCount };
}

// Stores a bundle asset under its original content-addressed id. The id
// must NOT be recomputed here: the stored bytes of a downscaled image
// differ from the original bytes the id was derived from, and the board
// references the original id. Thumbnails, posters, and dimensions are
// rebuilt on this device instead of traveling in the bundle.
async function storeBundleAsset(id: string, blob: Blob): Promise<void> {
  const kind: Asset['kind'] = blob.type.startsWith('video/')
    ? 'video'
    : blob.type.startsWith('audio/')
      ? 'audio'
      : 'image';
  const base: Asset = {
    id,
    kind,
    mime: blob.type,
    bytes: blob.size,
    blob,
    addedAt: new Date().toISOString(),
  };
  try {
    if (kind === 'image') {
      const { processImage } = await import('../../assetPipeline/image');
      const p = await processImage(blob);
      await db.assets.put({ ...base, thumbBlob: p.thumbBlob, width: p.width, height: p.height });
    } else if (kind === 'video') {
      const { processVideo } = await import('../../assetPipeline/video');
      const p = await processVideo(blob);
      await db.assets.put({
        ...base,
        thumbBlob: p.thumbBlob,
        posterBlob: p.posterBlob,
        width: p.width,
        height: p.height,
        durationMs: p.durationMs,
      });
    } else {
      const { audioDurationMs } = await import('../../assetPipeline/audio');
      await db.assets.put({ ...base, durationMs: await audioDurationMs(blob).catch(() => undefined) });
    }
  } catch {
    // A decode failure should not sink the restore; the asset stays
    // usable without its derived extras.
    await db.assets.put(base);
  }
}
