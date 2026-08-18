import Dexie, { type EntityTable } from 'dexie';
import type { Asset, Board } from '../domain/types';

// One database, three tables. The board is one JSON document, assets are
// content-addressed binaries, kv holds small local-only values such as
// the per-install device id. Keeping the board small and the binaries
// separate is what Phase 6 sync depends on.

type KvEntry = { key: string; value: unknown };

export const db = new Dexie('catapult') as Dexie & {
  boards: EntityTable<Board, 'id'>;
  assets: EntityTable<Asset, 'id'>;
  kv: EntityTable<KvEntry, 'key'>;
};

db.version(1).stores({
  boards: 'id',
  assets: 'id, kind, addedAt',
  kv: 'key',
});
