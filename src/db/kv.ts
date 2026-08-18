import { db } from './db';

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const row = await db.kv.get(key);
  return row?.value as T | undefined;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await db.kv.put({ key, value });
}

// The per-install device id. Lives outside the board on purpose: the
// board travels between devices, the device id must not.
export async function getDeviceId(): Promise<string> {
  const existing = await kvGet<string>('deviceId');
  if (existing) return existing;
  const id = crypto.randomUUID();
  await kvSet('deviceId', id);
  return id;
}
