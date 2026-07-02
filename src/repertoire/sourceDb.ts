import { DB_NAME, DB_VERSION, upgradeGameDbSchema } from '../idb/index';
import { enqueueRemoteSyncDelete, enqueueRemoteSyncUpsert } from '../sync/remoteSync';
import {
  createRepertoireSource,
  withRepertoireSourceContent,
  withRepertoireSourceSideOverride,
  type RepertoireScanRun,
  type RepertoireSide,
  type RepertoireSource,
} from './index';

type RepertoireStoreName =
  | 'repertoire-sources'
  | 'repertoire-match-records'
  | 'repertoire-scan-runs';

export interface RepertoireSourceImportInput {
  rawPgn: string;
  filename?: string;
  name?: string;
  now?: number;
}

export interface RepertoireSourceCleanupResult {
  deletedMatchRecordCount: number;
  deletedScanRunCount: number;
}

export interface RepertoireSourceReplaceResult extends RepertoireSourceCleanupResult {
  source: RepertoireSource;
}

let _db: IDBDatabase | undefined;

function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e: IDBVersionChangeEvent) => {
      const db = (e.target as IDBOpenDBRequest).result;
      upgradeGameDbSchema(db, e);
    };
    req.onsuccess = () => {
      _db = req.result;
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function sourceSort(a: RepertoireSource, b: RepertoireSource): number {
  return a.createdAt - b.createdAt || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

function ensureSourceHasGames(source: RepertoireSource): void {
  if (source.gameCount <= 0 || source.chapterCount <= 0) {
    throw new Error('No repertoire games found in PGN.');
  }
}

function enqueueSourceUpsert(source: RepertoireSource): void {
  enqueueRemoteSyncUpsert('repertoire-sources', source.id, source, source.updatedAt);
}

function enqueueDelete(store: RepertoireStoreName, itemKey: string, updatedAt: number): void {
  enqueueRemoteSyncDelete(store, itemKey, updatedAt);
}

async function listMatchRecordKeysForSource(db: IDBDatabase, sourceId: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const req = db
      .transaction('repertoire-match-records', 'readonly')
      .objectStore('repertoire-match-records')
      .index('sourceId')
      .getAllKeys(sourceId);
    req.onsuccess = () => resolve((req.result as IDBValidKey[]).filter((key): key is string => typeof key === 'string'));
    req.onerror = () => reject(req.error);
  });
}

async function listScanRunIdsForSource(db: IDBDatabase, sourceId: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const req = db
      .transaction('repertoire-scan-runs', 'readonly')
      .objectStore('repertoire-scan-runs')
      .getAll();
    req.onsuccess = () => {
      const runs = ((req.result as RepertoireScanRun[] | undefined) ?? []);
      resolve(runs
        .filter(run => Object.prototype.hasOwnProperty.call(run.sourceVersions, sourceId))
        .map(run => run.runId));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function listRepertoireSources(): Promise<RepertoireSource[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('repertoire-sources', 'readonly').objectStore('repertoire-sources').getAll();
    req.onsuccess = () => {
      const sources = (req.result as RepertoireSource[] | undefined) ?? [];
      resolve([...sources].sort(sourceSort));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getRepertoireSource(id: string): Promise<RepertoireSource | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('repertoire-sources', 'readonly').objectStore('repertoire-sources').get(id);
    req.onsuccess = () => resolve(req.result as RepertoireSource | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function saveRepertoireSource(source: RepertoireSource): Promise<RepertoireSource> {
  ensureSourceHasGames(source);
  const db = await openDb();
  const tx = db.transaction('repertoire-sources', 'readwrite');
  tx.objectStore('repertoire-sources').put(source);
  await txDone(tx);
  enqueueSourceUpsert(source);
  return source;
}

export async function importRepertoireSource(input: RepertoireSourceImportInput): Promise<RepertoireSource> {
  const source = await createRepertoireSource(input);
  return saveRepertoireSource(source);
}

export async function renameRepertoireSource(id: string, name: string, now = Date.now()): Promise<RepertoireSource> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Repertoire source name is required.');
  const source = await getRepertoireSource(id);
  if (!source) throw new Error('Repertoire source not found.');
  return saveRepertoireSource({ ...source, name: trimmed, updatedAt: now });
}

export async function setRepertoireSourceSideOverride(
  id: string,
  sideOverride: RepertoireSide | null,
  now = Date.now(),
): Promise<RepertoireSource> {
  const source = await getRepertoireSource(id);
  if (!source) throw new Error('Repertoire source not found.');
  return saveRepertoireSource(withRepertoireSourceSideOverride(source, sideOverride, now));
}

export async function setRepertoireSourceEnabled(
  id: string,
  enabled: boolean,
  now = Date.now(),
): Promise<RepertoireSource> {
  const source = await getRepertoireSource(id);
  if (!source) throw new Error('Repertoire source not found.');
  return saveRepertoireSource({ ...source, enabled, updatedAt: now });
}

export async function deleteRepertoireSourceScanRecords(
  sourceId: string,
  updatedAt = Date.now(),
): Promise<RepertoireSourceCleanupResult> {
  const db = await openDb();
  const [matchKeys, scanRunIds] = await Promise.all([
    listMatchRecordKeysForSource(db, sourceId),
    listScanRunIdsForSource(db, sourceId),
  ]);

  if (matchKeys.length === 0 && scanRunIds.length === 0) {
    return { deletedMatchRecordCount: 0, deletedScanRunCount: 0 };
  }

  const tx = db.transaction(['repertoire-match-records', 'repertoire-scan-runs'], 'readwrite');
  const matchStore = tx.objectStore('repertoire-match-records');
  const scanStore = tx.objectStore('repertoire-scan-runs');
  for (const key of matchKeys) matchStore.delete(key);
  for (const runId of scanRunIds) scanStore.delete(runId);
  await txDone(tx);

  for (const key of matchKeys) enqueueDelete('repertoire-match-records', key, updatedAt);
  for (const runId of scanRunIds) enqueueDelete('repertoire-scan-runs', runId, updatedAt);

  return {
    deletedMatchRecordCount: matchKeys.length,
    deletedScanRunCount: scanRunIds.length,
  };
}

export async function replaceRepertoireSourceFile(
  id: string,
  rawPgn: string,
  now = Date.now(),
): Promise<RepertoireSourceReplaceResult> {
  const source = await getRepertoireSource(id);
  if (!source) throw new Error('Repertoire source not found.');
  const updated = await withRepertoireSourceContent(source, rawPgn, now);
  ensureSourceHasGames(updated);
  await saveRepertoireSource(updated);
  const cleanup = await deleteRepertoireSourceScanRecords(id, now);
  return { source: updated, ...cleanup };
}

export async function deleteRepertoireSource(
  id: string,
  now = Date.now(),
): Promise<RepertoireSourceCleanupResult> {
  const db = await openDb();
  const cleanup = await deleteRepertoireSourceScanRecords(id, now);
  const tx = db.transaction('repertoire-sources', 'readwrite');
  tx.objectStore('repertoire-sources').delete(id);
  await txDone(tx);
  enqueueDelete('repertoire-sources', id, now);
  return cleanup;
}
