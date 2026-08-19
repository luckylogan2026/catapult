import { db } from '../../db/db';
import { kvGet, kvSet } from '../../db/kv';
import type { Board } from '../../domain/types';
import { referencedAssetIds } from '../exports/visionBundle';
import syncConfig from '../../../config/sync.json';
import brand from '../../../config/brand.json';

// The Google Drive adapter. Auth is the Google Identity Services token
// client with the drive.file scope only: the app can touch nothing in
// Drive except files it created itself. No client secret exists because
// this is a static host; the client id lives in config/sync.json.
//
// Layout in Drive: one app-created folder. board.json is one small
// file; every asset is its own file named by content hash, which is the
// point of content addressing: editing a caption uploads kilobytes, not
// the videos.
//
// The GIS script loads from Google only when the user turns sync on.
// This is the single sanctioned exception to the no-network rule, off
// by default and useless without the owner's explicit connect.

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_NAME = `${brand.appName} Board`;
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

let accessToken: string | null = null;
let tokenExpiry = 0;

// The token survives reloads for its roughly one hour of validity, in
// the same private storage as the board itself. Without this, every
// app open would flash a Google window at the user.
async function loadStoredToken(): Promise<void> {
  if (accessToken) return;
  const stored = await kvGet<{ token: string; expiresAt: number }>('driveToken');
  if (stored && Date.now() < stored.expiresAt - 60000) {
    accessToken = stored.token;
    tokenExpiry = performance.now() + (stored.expiresAt - Date.now());
  }
}

type TokenClient = {
  requestAccessToken: (opts?: { prompt?: string }) => void;
  callback: (resp: { access_token?: string; expires_in?: number; error?: string }) => void;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: {
            client_id: string;
            scope: string;
            callback: TokenClient['callback'];
          }) => TokenClient;
        };
      };
    };
  }
}

export function clientIdConfigured(): boolean {
  return !!syncConfig.googleClientId;
}

async function loadGis(): Promise<void> {
  if (window.google?.accounts) return;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('gis load failed'));
    document.head.appendChild(s);
  });
}

// The Google window opens only for an interactive request, meaning a
// deliberate tap. Background syncs use the stored token while it lasts
// and simply skip when it has expired; they never open anything.
export async function acquireToken(interactive: boolean): Promise<boolean> {
  await loadStoredToken();
  if (accessToken && performance.now() < tokenExpiry - 60000) return true;
  if (!interactive) return false;
  if (!clientIdConfigured()) return false;
  try {
    await loadGis();
  } catch {
    return false;
  }
  return new Promise((resolve) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: syncConfig.googleClientId,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.access_token) {
          accessToken = resp.access_token;
          const expiresInMs = (resp.expires_in ?? 3600) * 1000;
          tokenExpiry = performance.now() + expiresInMs;
          void kvSet('driveConnected', true);
          void kvSet('driveToken', { token: resp.access_token, expiresAt: Date.now() + expiresInMs });
          resolve(true);
        } else {
          resolve(false);
        }
      },
    });
    client.requestAccessToken();
  });
}

async function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API}${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${accessToken}` },
  });
}

async function findOrCreateFolder(): Promise<string> {
  const cached = await kvGet<string>('driveFolderId');
  if (cached) {
    const check = await api(`/files/${cached}?fields=id,trashed`);
    if (check.ok) {
      const j = await check.json();
      if (!j.trashed) return cached;
    }
  }
  const q = encodeURIComponent(
    `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  );
  const list = await api(`/files?q=${q}&fields=files(id)`);
  const found = (await list.json()).files?.[0]?.id;
  if (found) {
    await kvSet('driveFolderId', found);
    return found;
  }
  const created = await api('/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  });
  const id = (await created.json()).id as string;
  await kvSet('driveFolderId', id);
  return id;
}

type RemoteFile = { id: string; name: string; modifiedTime?: string };

async function listFolder(folderId: string): Promise<RemoteFile[]> {
  const out: RemoteFile[] = [];
  let pageToken = '';
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const r = await api(
      `/files?q=${q}&fields=nextPageToken,files(id,name,modifiedTime)&pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ''}`,
    );
    const j = await r.json();
    out.push(...(j.files ?? []));
    pageToken = j.nextPageToken ?? '';
  } while (pageToken);
  return out;
}

async function uploadFile(
  folderId: string,
  name: string,
  blob: Blob,
  existingId?: string,
): Promise<void> {
  const meta = existingId ? {} : { name, parents: [folderId] };
  const boundary = 'catapult' + Math.random().toString(36).slice(2);
  const body = new Blob(
    [
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${boundary}\r\nContent-Type: ${blob.type || 'application/octet-stream'}\r\n\r\n`,
      blob,
      `\r\n--${boundary}--`,
    ],
    { type: `multipart/related; boundary=${boundary}` },
  );
  const url = existingId
    ? `${UPLOAD}/files/${existingId}?uploadType=multipart`
    : `${UPLOAD}/files?uploadType=multipart`;
  const r = await fetch(url, {
    method: existingId ? 'PATCH' : 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body,
  });
  if (!r.ok) throw new Error(`upload failed: ${r.status}`);
}

async function downloadFile(fileId: string): Promise<Blob> {
  const r = await api(`/files/${fileId}?alt=media`);
  if (!r.ok) throw new Error(`download failed: ${r.status}`);
  return r.blob();
}

export type SyncOutcome =
  | { kind: 'idle' }
  | { kind: 'pushed'; assetsUploaded: number }
  | { kind: 'pulled'; board: Board; assetsDownloaded: number }
  | { kind: 'conflict'; remoteBoard: Board; remoteEdited: string; localEdited: string }
  | { kind: 'error'; message: string };

// Pull then push. Compare the remote board's revision against the last
// revision this device synced: remote ahead only means pull, local ahead
// only means push, both ahead means the conflict dialog and never a
// silent overwrite.
export async function syncOnce(board: Board, forcePush = false): Promise<SyncOutcome> {
  try {
    const folderId = await findOrCreateFolder();
    const files = await listFolder(folderId);
    const boardFile = files.find((f) => f.name === 'board.json');
    const lastSynced = (await kvGet<number>('lastSyncedRevision')) ?? -1;

    let remote: Board | null = null;
    if (boardFile) {
      remote = JSON.parse(await (await downloadFile(boardFile.id)).text()) as Board;
    }

    const localAhead = board.revision > lastSynced;
    const remoteAhead = !!remote && remote.revision > lastSynced;

    if (forcePush) {
      const uploaded = await pushBoard(board, folderId, files, boardFile?.id);
      await kvSet('lastSyncedRevision', board.revision);
      return { kind: 'pushed', assetsUploaded: uploaded };
    }

    if (remote && remoteAhead && localAhead && remote.revision !== board.revision) {
      return {
        kind: 'conflict',
        remoteBoard: remote,
        remoteEdited: remote.meta.lastEdited,
        localEdited: board.meta.lastEdited,
      };
    }

    if (remote && remoteAhead && !localAhead) {
      const downloaded = await pullAssets(remote, files);
      await kvSet('lastSyncedRevision', remote.revision);
      return { kind: 'pulled', board: remote, assetsDownloaded: downloaded };
    }

    // Push: local ahead, or nothing remote yet.
    if (localAhead || !remote) {
      const uploaded = await pushBoard(board, folderId, files, boardFile?.id);
      await kvSet('lastSyncedRevision', board.revision);
      return { kind: 'pushed', assetsUploaded: uploaded };
    }

    if (!files.some((f) => f.name === 'Journal') && (board.streak?.completions?.length ?? 0) > 0) {
      await syncJournalSheet(board, folderId, files);
    }
    return { kind: 'idle' };
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : 'sync failed' };
  }
}

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';

async function syncJournalSheet(board: Board, folderId: string, files: RemoteFile[]): Promise<void> {
  try {
    const completions = board.streak?.completions ?? [];
    if (!completions.length) return;
    let sheet = files.find((f) => f.name === 'Journal');
    let sheetId = sheet?.id;
    if (!sheetId) {
      const created = await api('/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Journal',
          mimeType: 'application/vnd.google-apps.spreadsheet',
          parents: [folderId],
        }),
      });
      sheetId = (await created.json()).id as string;
    }
    if (!sheetId) return;
    const rows = [...completions]
      .sort((a, b) => a.completedAt.localeCompare(b.completedAt))
      .map((c) => [
        c.date,
        new Date(c.completedAt).toLocaleTimeString(),
        c.playlistId,
        c.priorities ?? '',
        c.note ?? '',
      ]);
    const values = [['Date', 'Time', 'Playlist', 'Priorities', 'Journal'], ...rows];
    await fetch(`${SHEETS}/${sheetId}/values/A1:clear`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    await fetch(`${SHEETS}/${sheetId}/values/A1?valueInputOption=RAW`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values }),
    });
  } catch {
    // The journal sheet is a convenience mirror; sync itself stays whole.
  }
}

async function pushBoard(
  board: Board,
  folderId: string,
  files: RemoteFile[],
  boardFileId?: string,
): Promise<number> {
  const remoteNames = new Set(files.map((f) => f.name));
  const wanted = referencedAssetIds(board);
  let uploaded = 0;
  for (const id of wanted) {
    const asset = await db.assets.get(id);
    if (!asset) continue;
    const name = `${id}`;
    if (remoteNames.has(name)) continue;
    await uploadFile(folderId, name, asset.blob);
    uploaded++;
  }
  await uploadFile(
    folderId,
    'board.json',
    new Blob([JSON.stringify(board)], { type: 'application/json' }),
    boardFileId,
  );
  await syncJournalSheet(board, folderId, files);
  // Garbage collection: remote assets no board references, untouched for
  // thirty days, go away.
  const grace = Date.now() - 30 * 24 * 3600 * 1000;
  for (const f of files) {
    if (f.name === 'board.json' || f.name === 'Journal' || wanted.has(f.name)) continue;
    if (f.modifiedTime && Date.parse(f.modifiedTime) < grace) {
      await api(`/files/${f.id}`, { method: 'DELETE' }).catch(() => {});
    }
  }
  return uploaded;
}

async function pullAssets(remote: Board, files: RemoteFile[]): Promise<number> {
  const byName = new Map(files.map((f) => [f.name, f]));
  let downloaded = 0;
  for (const id of referencedAssetIds(remote)) {
    if (await db.assets.get(id)) continue;
    const file = byName.get(id);
    if (!file) continue;
    const blob = await downloadFile(file.id);
    const { storeBundleAsset } = await import('../exports/visionBundle');
    await storeBundleAsset(id, blob);
    downloaded++;
  }
  return downloaded;
}
