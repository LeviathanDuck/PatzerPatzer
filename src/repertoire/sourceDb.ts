import { DB_NAME, DB_VERSION, upgradeGameDbSchema, type StoredGameRecord } from '../idb/index';
import type { ImportedGame } from '../import/types';
import { enqueueRemoteSyncDelete, enqueueRemoteSyncUpsert } from '../sync/remoteSync';
import {
  createRepertoireSource,
  repertoireMatchRecordKey,
  type RepertoireMatchRecord,
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

export interface RepertoireScanGamePage {
  games: ImportedGame[];
  nextAfterGameId: string | null;
  hasMore: boolean;
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

function enqueueMatchRecordUpsert(record: RepertoireMatchRecord): void {
  enqueueRemoteSyncUpsert('repertoire-match-records', record.key, record, record.scannedAt);
}

function enqueueScanRunUpsert(run: RepertoireScanRun): void {
  enqueueRemoteSyncUpsert('repertoire-scan-runs', run.runId, run, run.updatedAt);
}

function enqueueDelete(store: RepertoireStoreName, itemKey: string, updatedAt: number): void {
  enqueueRemoteSyncDelete(store, itemKey, updatedAt);
}

function storedGameRecordToImportedGame(record: StoredGameRecord): ImportedGame {
  const game: ImportedGame = { id: record.id, pgn: record.pgn };
  if (record.white            !== null) game.white            = record.white;
  if (record.black            !== null) game.black            = record.black;
  if (record.result           !== null) game.result           = record.result;
  if (record.date             !== null) game.date             = record.date;
  if (record.timeClass        !== null) game.timeClass        = record.timeClass;
  if (record.opening          !== null) game.opening          = record.opening;
  if (record.eco              !== null) game.eco              = record.eco;
  if (record.source === 'chesscom' || record.source === 'lichess') game.source = record.source;
  if (record.whiteRating      !== null) game.whiteRating      = record.whiteRating;
  if (record.blackRating      !== null) game.blackRating      = record.blackRating;
  if (record.importedUsername !== null) game.importedUsername = record.importedUsername;
  if (record.accountId        !== null) game.accountId        = record.accountId;
  game.importedAt = record.importedAt;
  return game;
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

export async function countRepertoireScanGames(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('games', 'readonly').objectStore('games').count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadRepertoireScanGamePage(
  limit: number,
  afterGameId: string | null = null,
): Promise<RepertoireScanGamePage> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const games: ImportedGame[] = [];
    let lastGameId: string | null = null;
    const range = afterGameId ? IDBKeyRange.lowerBound(afterGameId, true) : undefined;
    const req = db.transaction('games', 'readonly').objectStore('games').openCursor(range);
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        resolve({ games, nextAfterGameId: lastGameId, hasMore: false });
        return;
      }
      if (games.length >= limit) {
        resolve({ games, nextAfterGameId: lastGameId, hasMore: true });
        return;
      }
      const record = cursor.value as StoredGameRecord;
      games.push(storedGameRecordToImportedGame(record));
      lastGameId = record.id;
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function listRepertoireMatchRecordsForGameIds(
  gameIds: readonly string[],
): Promise<RepertoireMatchRecord[]> {
  if (gameIds.length === 0) return [];
  const db = await openDb();
  const results = await Promise.all(gameIds.map(gameId => new Promise<RepertoireMatchRecord[]>((resolve, reject) => {
    const req = db
      .transaction('repertoire-match-records', 'readonly')
      .objectStore('repertoire-match-records')
      .index('gameId')
      .getAll(gameId);
    req.onsuccess = () => resolve((req.result as RepertoireMatchRecord[] | undefined) ?? []);
    req.onerror = () => reject(req.error);
  })));
  return results.flat();
}

export async function listRepertoireDivergenceMatchRecords(): Promise<RepertoireMatchRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db
      .transaction('repertoire-match-records', 'readonly')
      .objectStore('repertoire-match-records')
      .index('status')
      .getAll('diverged');
    req.onsuccess = () => resolve((req.result as RepertoireMatchRecord[] | undefined) ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function listRepertoireReportGames(
  gameIds: readonly string[],
): Promise<ImportedGame[]> {
  const uniqueGameIds = [...new Set(gameIds.filter(id => id.trim() !== ''))];
  if (uniqueGameIds.length === 0) return [];
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const games: ImportedGame[] = [];
    let pending = uniqueGameIds.length;
    let settled = false;
    const tx = db.transaction('games', 'readonly');
    const store = tx.objectStore('games');
    const rejectOnce = (error: unknown): void => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const maybeResolve = (): void => {
      if (settled || pending > 0) return;
      settled = true;
      resolve(games);
    };

    tx.onabort = () => rejectOnce(tx.error);
    tx.onerror = () => rejectOnce(tx.error);

    for (const gameId of uniqueGameIds) {
      const req = store.get(gameId);
      req.onsuccess = () => {
        const record = req.result as StoredGameRecord | undefined;
        if (record) games.push(storedGameRecordToImportedGame(record));
        pending -= 1;
        maybeResolve();
      };
      req.onerror = () => rejectOnce(req.error);
    }
  });
}

export async function listRepertoireScanRuns(): Promise<RepertoireScanRun[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('repertoire-scan-runs', 'readonly').objectStore('repertoire-scan-runs').getAll();
    req.onsuccess = () => resolve((req.result as RepertoireScanRun[] | undefined) ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function saveRepertoireMatchRecords(records: readonly RepertoireMatchRecord[]): Promise<void> {
  if (records.length === 0) return;
  const db = await openDb();
  const tx = db.transaction('repertoire-match-records', 'readwrite');
  const store = tx.objectStore('repertoire-match-records');
  for (const record of records) store.put(record);
  await txDone(tx);
  for (const record of records) enqueueMatchRecordUpsert(record);
}

export async function saveRepertoireScanRun(run: RepertoireScanRun): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('repertoire-scan-runs', 'readwrite');
  tx.objectStore('repertoire-scan-runs').put(run);
  await txDone(tx);
  enqueueScanRunUpsert(run);
}

export async function getCurrentRepertoireMatchRecord(
  sourceId: string,
  sourceVersion: string,
  gameId: string,
): Promise<RepertoireMatchRecord | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db
      .transaction('repertoire-match-records', 'readonly')
      .objectStore('repertoire-match-records')
      .get(repertoireMatchRecordKey(sourceId, gameId));
    req.onsuccess = () => {
      const record = req.result as RepertoireMatchRecord | undefined;
      resolve(record?.sourceVersion === sourceVersion ? record : undefined);
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
  const updated = withRepertoireSourceSideOverride(source, sideOverride, now);
  const saved = await saveRepertoireSource(updated);
  if (source.side !== updated.side) await deleteRepertoireSourceScanRecords(id, now);
  return saved;
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
