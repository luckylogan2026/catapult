import { db } from '../../db/db';
import { kvGet, kvSet } from '../../db/kv';
import type { Board, PlaylistId, SessionCompletion } from '../../domain/types';
import { referencedAssetIds } from '../exports/visionBundle';
import { frozenPendings } from '../playback/streak';
import { trackerItems } from '../../config';
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
            error_callback?: (err: { type?: string }) => void;
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
    // A blocked or closed popup must not leave the caller waiting
    // forever: GIS reports it through error_callback, and a timeout
    // covers the cases where nothing is reported at all.
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    window.setTimeout(() => finish(false), 120000);
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: syncConfig.googleClientId,
      scope: SCOPE,
      error_callback: () => finish(false),
      callback: (resp) => {
        if (resp.access_token) {
          accessToken = resp.access_token;
          const expiresInMs = (resp.expires_in ?? 3600) * 1000;
          tokenExpiry = performance.now() + expiresInMs;
          void kvSet('driveConnected', true);
          void kvSet('driveToken', { token: resp.access_token, expiresAt: Date.now() + expiresInMs });
          void kvSet('driveUser', null);
          void kvSet('driveFolderId', null);
          finish(true);
        } else {
          finish(false);
        }
      },
    });
    // Always show the account list: a silent auto-pick of the wrong
    // Google account sends the user to an empty Drive with no clue why.
    client.requestAccessToken({ prompt: 'select_account' });
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

const RESUMABLE_THRESHOLD = 4 * 1024 * 1024;
const CHUNK = 8 * 1024 * 1024; // a multiple of 256 KiB, as the API requires

async function uploadFile(
  folderId: string,
  name: string,
  blob: Blob,
  existingId?: string,
): Promise<void> {
  // Large files go through the resumable protocol in chunks; the
  // single-shot multipart request is unreliable beyond a few megabytes
  // and music tracks can be hundreds.
  if (blob.size > RESUMABLE_THRESHOLD) {
    const initUrl = existingId
      ? `${UPLOAD}/files/${existingId}?uploadType=resumable`
      : `${UPLOAD}/files?uploadType=resumable`;
    const init = await fetch(initUrl, {
      method: existingId ? 'PATCH' : 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': blob.type || 'application/octet-stream',
        'X-Upload-Content-Length': String(blob.size),
      },
      body: JSON.stringify(existingId ? {} : { name, parents: [folderId] }),
    });
    if (!init.ok) throw new Error(`resumable init failed: ${init.status}`);
    const session = init.headers.get('Location');
    if (!session) throw new Error('resumable session missing');
    for (let start = 0; start < blob.size; start += CHUNK) {
      const end = Math.min(start + CHUNK, blob.size);
      const r = await fetch(session, {
        method: 'PUT',
        headers: { 'Content-Range': `bytes ${start}-${end - 1}/${blob.size}` },
        body: blob.slice(start, end),
      });
      if (r.status === 308) continue;
      if (r.ok) return;
      throw new Error(`resumable chunk failed: ${r.status}`);
    }
    return;
  }
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
  | { kind: 'idle'; journalError?: string }
  | { kind: 'pushed'; assetsUploaded: number; journalError?: string }
  | { kind: 'pulled'; board: Board; assetsDownloaded: number }
  | {
      kind: 'conflict';
      remoteBoard: Board;
      remoteStamp: string | null;
      remoteEdited: string;
      localEdited: string;
    }
  | { kind: 'error'; message: string };

/** What this device saw on its last sync, for the Settings readout.
 * Comparing two devices' readouts side by side names any split
 * (different accounts, different folders, stale pushes) directly. */
export type SyncDiag = {
  at: string;
  account: string | null;
  folderId: string | null;
  remoteStamp: string | null;
  remoteRevision: number | null;
  localRevision: number;
  lastSyncedRevision: number;
  lastRemoteStamp: string | null;
  outcome: string;
};

export async function accountEmail(): Promise<string | null> {
  const cached = await kvGet<string>('driveUser');
  if (cached) return cached;
  try {
    const r = await api('/about?fields=user(emailAddress)');
    if (!r.ok) return null;
    const email = (await r.json()).user?.emailAddress as string | undefined;
    if (email) await kvSet('driveUser', email);
    return email ?? null;
  } catch {
    return null;
  }
}

/** Drive's own identity for the current board.json: its modifiedTime.
 * "Has Drive changed since I last looked" must be judged by this and
 * never by revision numbers, which are per-device counters and not
 * comparable across devices. */
async function remoteBoardStamp(folderId: string): Promise<string | null> {
  const files = await listFolder(folderId);
  return files.find((f) => f.name === 'board.json')?.modifiedTime ?? null;
}

export type BoardRevision = { id: string; modifiedTime: string; size: number | null };

/** board.json's version history on Drive (newest first). Drive keeps
 * prior versions of app-written files for thirty days; this is the
 * recovery path when a sync went the wrong way. */
export async function listBoardRevisions(): Promise<BoardRevision[]> {
  const folderId = await findOrCreateFolder();
  const files = await listFolder(folderId);
  const bf = files.find((f) => f.name === 'board.json');
  if (!bf) return [];
  const r = await api(
    `/files/${bf.id}/revisions?fields=revisions(id,modifiedTime,size)&pageSize=200`,
  );
  if (!r.ok) throw new Error(`revisions ${r.status}`);
  const j = (await r.json()) as { revisions?: { id: string; modifiedTime: string; size?: string }[] };
  return (j.revisions ?? [])
    .map((x) => ({ id: x.id, modifiedTime: x.modifiedTime, size: x.size ? Number(x.size) : null }))
    .sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime));
}

export async function downloadBoardRevision(revisionId: string): Promise<Board> {
  const folderId = await findOrCreateFolder();
  const files = await listFolder(folderId);
  const bf = files.find((f) => f.name === 'board.json');
  if (!bf) throw new Error('no board on Drive');
  const r = await api(`/files/${bf.id}/revisions/${revisionId}?alt=media`);
  if (!r.ok) throw new Error(`revision download ${r.status}`);
  return (await r.json()) as Board;
}

/** One-tap recovery for a fresh device: sign-in must already hold a
 * token (call acquireToken(true) first). Downloads the board and its
 * assets from Drive and records the sync markers so the next sync sees
 * a level state. Returns null when Drive has no board. */
export async function restoreFromDrive(
  onProgress?: (stage: 'board' | 'assets', done: number, total: number) => void,
): Promise<{ board: Board; assets: number } | null> {
  onProgress?.('board', 0, 1);
  const folderId = await findOrCreateFolder();
  const files = await listFolder(folderId);
  const bf = files.find((f) => f.name === 'board.json');
  if (!bf) return null;
  const board = JSON.parse(await (await downloadFile(bf.id)).text()) as Board;
  if (!board?.id || !Array.isArray(board.pages)) return null;
  onProgress?.('board', 1, 1);
  const assets = await pullAssets(board, files, (done, total) => onProgress?.('assets', done, total));
  await kvSet('lastRemoteStamp', bf.modifiedTime ?? null);
  return { board, assets };
}

/** Whether this account's Drive already holds a board, for the
 * first-run walkthrough to offer a restore instead of a fresh start. */
export async function driveHasBoard(): Promise<boolean> {
  const folderId = await findOrCreateFolder();
  const files = await listFolder(folderId);
  return files.some((f) => f.name === 'board.json');
}

/** Called by the conflict resolver after adopting the remote board. */
export async function markRemoteSeen(stamp: string | null): Promise<void> {
  await kvSet('lastRemoteStamp', stamp);
}

// Pull then push. Local "ahead" means this device edited since its last
// sync (its own revision counter). Remote "changed" means board.json on
// Drive is not the file this device last pushed or pulled (Drive's
// modifiedTime). Both true means the conflict dialog, never a silent
// overwrite.
export async function syncOnce(board: Board, forcePush = false): Promise<SyncOutcome> {
  try {
    const folderId = await findOrCreateFolder();
    const files = await listFolder(folderId);
    const boardFile = files.find((f) => f.name === 'board.json');
    const lastSynced = (await kvGet<number>('lastSyncedRevision')) ?? -1;
    const lastRemoteStamp = (await kvGet<string | null>('lastRemoteStamp')) ?? null;

    let remote: Board | null = null;
    if (boardFile) {
      remote = JSON.parse(await (await downloadFile(boardFile.id)).text()) as Board;
    }
    const remoteStamp = boardFile?.modifiedTime ?? null;

    const localAhead = board.revision > lastSynced;
    const remoteChanged = !!remote && remoteStamp !== lastRemoteStamp;

    const account = await accountEmail();
    const diag = async (outcome: string) => {
      const snapshot: SyncDiag = {
        at: new Date().toISOString(),
        account,
        folderId,
        remoteStamp,
        remoteRevision: remote?.revision ?? null,
        localRevision: board.revision,
        lastSyncedRevision: lastSynced,
        lastRemoteStamp,
        outcome,
      };
      await kvSet('syncDiag', snapshot);
    };

    const recordPush = async () => {
      await kvSet('lastSyncedRevision', board.revision);
      await kvSet('lastRemoteStamp', await remoteBoardStamp(folderId));
    };

    if (forcePush) {
      const pushed = await pushBoard(board, folderId, files, boardFile?.id);
      await recordPush();
      await diag('force-pushed');
      return { kind: 'pushed', assetsUploaded: pushed.uploaded, journalError: pushed.journalError ?? undefined };
    }

    if (remote && remoteChanged && localAhead) {
      // Two histories that carry the same content have nothing to argue
      // about: record agreement and move on.
      const strip = (b: Board) => JSON.stringify({ ...b, revision: 0, meta: { ...b.meta, lastEdited: '' } });
      if (strip(remote) === strip(board)) {
        await kvSet('lastSyncedRevision', board.revision);
        await kvSet('lastRemoteStamp', remoteStamp);
        await diag('identical');
        return { kind: 'idle' };
      }
      await diag('conflict');
      return {
        kind: 'conflict',
        remoteBoard: remote,
        remoteStamp,
        remoteEdited: remote.meta.lastEdited,
        localEdited: board.meta.lastEdited,
      };
    }

    if (remote && remoteChanged && !localAhead) {
      const downloaded = await pullAssets(remote, files);
      await kvSet('lastRemoteStamp', remoteStamp);
      await diag('pulled');
      return { kind: 'pulled', board: remote, assetsDownloaded: downloaded };
    }

    // Push: local ahead, or nothing remote yet.
    if (localAhead || !remote) {
      const pushed = await pushBoard(board, folderId, files, boardFile?.id);
      await recordPush();
      await diag('pushed');
      return { kind: 'pushed', assetsUploaded: pushed.uploaded, journalError: pushed.journalError ?? undefined };
    }

    let journalError: string | null = null;
    if (
      !files.some((f) => f.name === 'Journal') &&
      ((board.streak?.completions?.length ?? 0) > 0 || frozenPendings(board).length > 0)
    ) {
      journalError = await syncJournalSheet(board, folderId, files);
    }
    const repaired = await repairAssets(board, folderId, files);
    await diag('idle');
    if (repaired.uploaded) {
      return { kind: 'pushed', assetsUploaded: repaired.uploaded, journalError: journalError ?? undefined };
    }
    if (repaired.downloaded) {
      return { kind: 'pulled', board, assetsDownloaded: repaired.downloaded };
    }
    return { kind: 'idle', journalError: journalError ?? undefined };
  } catch (err) {
    return { kind: 'error', message: err instanceof Error ? err.message : 'sync failed' };
  }
}

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';

const morningKeys = trackerItems.morning.map((it) => it.key);
const eveningKeys = trackerItems.evening.map((it) => it.key);
const outcomeKeys = trackerItems.evening.filter((it) => it.type === 'outcome').map((it) => it.key);
const inputKeys = trackerItems.evening.filter((it) => it.type === 'input').map((it) => it.key);

function mean2(values: number[]): number | '' {
  if (!values.length) return '';
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
}

/** Overall streak as it stood on a given date: consecutive completion
 * days ending there. Completions only; frozen pendings never count. */
function streakAsOf(completions: SessionCompletion[], date: string): number {
  const days = new Set(completions.map((c) => c.date));
  let cursor = date;
  let streak = 0;
  while (days.has(cursor)) {
    streak++;
    const [y, m, d] = cursor.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - 1);
    cursor = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }
  return streak;
}

/** Rebuilds the Journal spreadsheet. Returns null on success (or when
 * there is nothing to write), else a short error the status line can
 * show, because a silent console.warn proved undiagnosable in the
 * field. */
async function syncJournalSheet(
  board: Board,
  folderId: string,
  files: RemoteFile[],
): Promise<string | null> {
  try {
    const completions = board.streak?.completions ?? [];
    const frozen = frozenPendings(board);
    if (!completions.length && !frozen.length) return null;
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
      if (!created.ok) return `create ${created.status}`;
      sheetId = (await created.json()).id as string;
    }
    if (!sheetId) return 'create failed';

    // One row per session: completions, plus frozen pendings whose
    // session never happened. Dropping the frozen rows would make the
    // dataset lie, because abandoned mornings are not random mornings.
    type Row = {
      date: string;
      stamp: string;
      playlistId: PlaylistId;
      priorities: string;
      note: string;
      scores?: Record<string, number>;
      postShift?: number;
      completed: boolean;
    };
    const entries: Row[] = [
      ...completions.map((c) => ({
        date: c.date,
        stamp: c.completedAt,
        playlistId: c.playlistId,
        priorities: c.priorities ?? '',
        note: c.note ?? '',
        scores: c.scores,
        postShift: c.postShift,
        completed: true,
      })),
      ...frozen.map((p) => ({
        date: p.date,
        stamp: p.ratedAt,
        playlistId: p.playlistId,
        priorities: '',
        note: '',
        scores: p.scores,
        postShift: p.postShift,
        completed: false,
      })),
    ].sort((a, b) => a.date.localeCompare(b.date) || a.stamp.localeCompare(b.stamp));

    const rows = entries.map((r) => {
      const sc = r.scores ?? {};
      const has = (k: string) => typeof sc[k] === 'number';
      const cell = (k: string) => (has(k) ? sc[k] : '');
      const isMorning = r.playlistId === 'morning';
      // Inputs scored 0 mean "did not happen" and are excluded from the
      // mean; weekend-skipped items are simply absent from scores.
      const inputVals = inputKeys.filter((k) => has(k) && sc[k] > 0).map((k) => sc[k]);
      return [
        r.date,
        new Date(r.stamp).toLocaleTimeString(),
        r.playlistId,
        r.priorities,
        r.note,
        streakAsOf(completions, r.date),
        ...morningKeys.map((k) => (isMorning ? cell(k) : '')),
        isMorning ? mean2(morningKeys.filter(has).map((k) => sc[k])) : '',
        ...eveningKeys.map((k) => (isMorning ? '' : cell(k))),
        isMorning ? '' : mean2(outcomeKeys.filter(has).map((k) => sc[k])),
        isMorning ? '' : mean2(inputVals),
        r.postShift ?? '',
        r.completed ? 'TRUE' : 'FALSE',
      ];
    });
    const values = [
      [
        'Date', 'Time', 'Playlist', 'Priorities', 'Journal', 'Streak',
        ...morningKeys, 'morning_composite',
        ...eveningKeys, 'outcome_composite', 'input_composite',
        'post_shift', 'practice_completed',
      ],
      ...rows,
    ];
    // Clear the whole grid, not one cell: a deleted entry must vanish
    // from the sheet on the next sync.
    await fetch(`${SHEETS}/${sheetId}/values/A1:ZZ:clear`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const write = await fetch(`${SHEETS}/${sheetId}/values/A1?valueInputOption=RAW`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values }),
    });
    if (!write.ok) {
      // A 403 here usually means the Sheets API is not enabled in the
      // Cloud project. The board sync stays whole either way.
      console.warn('journal sheet write failed', write.status, await write.text().catch(() => ''));
      return `write ${write.status}`;
    }
    return null;
  } catch (err) {
    console.warn('journal sheet sync failed', err);
    return err instanceof Error ? err.message : 'failed';
  }
}

// Uploads referenced assets Drive lacks and downloads ones this device
// lacks, without touching the board itself.
async function repairAssets(
  board: Board,
  folderId: string,
  files: RemoteFile[],
): Promise<{ uploaded: number; downloaded: number }> {
  const wanted = referencedAssetIds(board);
  const remoteNames = new Map(files.map((f) => [f.name, f]));
  let uploaded = 0;
  let downloaded = 0;
  for (const id of wanted) {
    const local = await db.assets.get(id);
    const remote = remoteNames.get(id);
    if (local && !remote) {
      await uploadFile(folderId, id, local.blob);
      uploaded++;
    } else if (!local && remote) {
      const blob = await downloadFile(remote.id);
      const { storeBundleAsset } = await import('../exports/visionBundle');
      await storeBundleAsset(id, blob);
      downloaded++;
    }
  }
  return { uploaded, downloaded };
}

async function pushBoard(
  board: Board,
  folderId: string,
  files: RemoteFile[],
  boardFileId?: string,
): Promise<{ uploaded: number; journalError: string | null }> {
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
  const journalError = await syncJournalSheet(board, folderId, files);
  // Garbage collection: remote assets no board references, untouched for
  // thirty days, go away.
  const grace = Date.now() - 30 * 24 * 3600 * 1000;
  for (const f of files) {
    if (f.name === 'board.json' || f.name === 'Journal' || wanted.has(f.name)) continue;
    if (f.modifiedTime && Date.parse(f.modifiedTime) < grace) {
      await api(`/files/${f.id}`, { method: 'DELETE' }).catch(() => {});
    }
  }
  return { uploaded, journalError };
}

async function pullAssets(
  remote: Board,
  files: RemoteFile[],
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const byName = new Map(files.map((f) => [f.name, f]));
  const wanted: string[] = [];
  for (const id of referencedAssetIds(remote)) {
    if (await db.assets.get(id)) continue;
    if (byName.has(id)) wanted.push(id);
  }
  let downloaded = 0;
  onProgress?.(0, wanted.length);
  for (const id of wanted) {
    const file = byName.get(id)!;
    const blob = await downloadFile(file.id);
    const { storeBundleAsset } = await import('../exports/visionBundle');
    await storeBundleAsset(id, blob);
    downloaded++;
    onProgress?.(downloaded, wanted.length);
  }
  return downloaded;
}
