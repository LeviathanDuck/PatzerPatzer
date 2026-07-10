import { DB_NAME, DB_VERSION, upgradeGameDbSchema, type StoredGameRecord } from '../idb/index';
import type { ImportedGame } from '../import/types';
import { getAccount, listAccounts, type AccountPlatform } from '../accounts';
import { enqueueRemoteSyncDelete, enqueueRemoteSyncUpsert } from '../sync/remoteSync';
import {
  ACCOUNT_REPERTOIRE_DIRECT_GAME_LIMIT,
  createAccountRepertoireSource,
  createRepertoireSource,
  isAccountRepertoireSource,
  isUploadedRepertoireSource,
  repertoireMatchRecordKey,
  type CreateAccountRepertoireSourceInput,
  type RepertoireAccountBuildInfo,
  type RepertoireAccountFilters,
  type RepertoireMatchRecord,
  withRepertoireAccountFilters,
  withRepertoireAccountBuildInfo,
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

export interface RepertoireAccountSourceCandidate {
  accountId: string;
  accountLabel: string;
  accountPlatform: AccountPlatform;
  gameCount: number;
  alreadySource: boolean;
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
  if (isAccountRepertoireSource(source)) {
    if (source.gameCount <= 0) throw new Error('No stored games found for this account.');
    if (!source.accountId) throw new Error('Account-backed repertoire source is missing its account id.');
    return;
  }
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

async function countGamesForAccount(db: IDBDatabase, accountId: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = db.transaction('games', 'readonly')
      .objectStore('games')
      .index('accountId')
      .count(accountId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
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

export async function listUploadedRepertoireSources(): Promise<RepertoireSource[]> {
  return (await listRepertoireSources()).filter(isUploadedRepertoireSource);
}

export async function listRepertoireAccountSourceCandidates(): Promise<RepertoireAccountSourceCandidate[]> {
  const db = await openDb();
  const [accounts, sources] = await Promise.all([
    listAccounts(),
    listRepertoireSources(),
  ]);
  const existingAccountSourceIds = new Set(
    sources
      .filter(isAccountRepertoireSource)
      .map(source => source.accountId)
      .filter((accountId): accountId is string => typeof accountId === 'string' && accountId.length > 0),
  );
  const candidates = await Promise.all(accounts.map(async account => {
    const gameCount = await countGamesForAccount(db, account.id);
    if (gameCount <= 0) return null;
    return {
      accountId: account.id,
      accountLabel: account.displayName,
      accountPlatform: account.platform,
      gameCount,
      alreadySource: existingAccountSourceIds.has(account.id),
    };
  }));
  return candidates
    .filter((candidate): candidate is RepertoireAccountSourceCandidate => candidate !== null)
    .sort((a, b) => a.accountLabel.localeCompare(b.accountLabel) || a.accountId.localeCompare(b.accountId));
}

export async function countRepertoireScanGames(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('games', 'readonly').objectStore('games').count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}














function collectRepertoireScanGamePageCursor(
  db: IDBDatabase,
  limit: number,
  afterGameId: string | null,
): Promise<RepertoireScanGamePage> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let completedResult: RepertoireScanGamePage | undefined;

    const settleResolve = (result: RepertoireScanGamePage): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const settleReject = (error: unknown): void => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    let openedTx: IDBTransaction;
    try {
      openedTx = db.transaction('games', 'readonly');
    } catch (error) {
      settleReject(error);
      return;
    }
    const tx = openedTx;

    tx.oncomplete = () => {
      if (completedResult !== undefined) {
        settleResolve(completedResult);
      } else {
        settleReject(new Error(
          'Repertoire scan game page transaction completed before settling a result (coding invariant violation)',
        ));
      }
    };
    tx.onerror = () => {
      settleReject(tx.error ?? new Error('Repertoire scan game page transaction failed'));
    };
    tx.onabort = () => {
      settleReject(tx.error ?? new DOMException('Repertoire scan game page transaction aborted', 'AbortError'));
    };

    let cursorRequest: IDBRequest<IDBCursorWithValue | null>;
    try {
      const range = afterGameId ? IDBKeyRange.lowerBound(afterGameId, true) : undefined;
      cursorRequest = tx.objectStore('games').openCursor(range);
    } catch (error) {
      settleReject(error);
      try { tx.abort(); } catch { /* Transaction may already be inactive. */ }
      return;
    }

    const games: ImportedGame[] = [];
    let lastGameId: string | null = null;

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        // Exhaustion: record the result but do not resolve here — wait for tx.oncomplete.
        completedResult = { games, nextAfterGameId: lastGameId, hasMore: false };
        return;
      }
      if (games.length >= limit) {
        // Limit reached and a further row exists (the one-past peek the original loop used to
        // decide hasMore): record the result and stop driving the cursor, letting the transaction
        // auto-commit naturally. Settlement still waits on tx.oncomplete.
        completedResult = { games, nextAfterGameId: lastGameId, hasMore: true };
        return;
      }
      const record = cursor.value as StoredGameRecord;
      games.push(storedGameRecordToImportedGame(record));
      lastGameId = record.id;
      try {
        cursor.continue();
      } catch (error) {
        settleReject(error);
        try { tx.abort(); } catch { /* Transaction may already be inactive. */ }
      }
    };
    cursorRequest.onerror = () => {
      settleReject(cursorRequest.error ?? tx.error ?? new Error('Repertoire scan game page cursor failed'));
    };
  });
}












function collectRepertoireAccountGamesCursor(
  db: IDBDatabase,
  accountId: string,
): Promise<ImportedGame[]> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let completedResult: ImportedGame[] | undefined;

    const settleResolve = (result: ImportedGame[]): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const settleReject = (error: unknown): void => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    let openedTx: IDBTransaction;
    try {
      openedTx = db.transaction('games', 'readonly');
    } catch (error) {
      settleReject(error);
      return;
    }
    const tx = openedTx;

    tx.oncomplete = () => {
      if (completedResult !== undefined) {
        settleResolve(completedResult);
      } else {
        settleReject(new Error(
          'Repertoire account games transaction completed before settling a result (coding invariant violation)',
        ));
      }
    };
    tx.onerror = () => {
      settleReject(tx.error ?? new Error('Repertoire account games transaction failed'));
    };
    tx.onabort = () => {
      settleReject(tx.error ?? new DOMException('Repertoire account games transaction aborted', 'AbortError'));
    };

    let cursorRequest: IDBRequest<IDBCursorWithValue | null>;
    try {
      cursorRequest = tx.objectStore('games').index('accountId').openCursor(accountId);
    } catch (error) {
      settleReject(error);
      try { tx.abort(); } catch { /* Transaction may already be inactive. */ }
      return;
    }

    const games: ImportedGame[] = [];

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        // Exhaustion: record the result but do not resolve here — wait for tx.oncomplete.
        completedResult = games;
        return;
      }
      games.push(storedGameRecordToImportedGame(cursor.value as StoredGameRecord));
      try {
        cursor.continue();
      } catch (error) {
        settleReject(error);
        try { tx.abort(); } catch { /* Transaction may already be inactive. */ }
      }
    };
    cursorRequest.onerror = () => {
      settleReject(cursorRequest.error ?? tx.error ?? new Error('Repertoire account games cursor failed'));
    };
  });
}

/**
 * Load a page of games for a repertoire compliance scan using an IDB cursor over the primary key.
 * Rejects on genuine storage failure (DB-open failure or a failed/aborted read transaction)
 * instead of resolving an empty or partial page — see collectRepertoireScanGamePageCursor above
 * and BUG-2026-07-10-009. openDb() rejects on DB-open failure with no catch-to-empty wrapper.
 */
export async function loadRepertoireScanGamePage(
  limit: number,
  afterGameId: string | null = null,
): Promise<RepertoireScanGamePage> {
  const db = await openDb();
  return collectRepertoireScanGamePageCursor(db, limit, afterGameId);
}

/**
 * Load every stored game for an account via the accountId index. Rejects on genuine storage
 * failure (DB-open failure or a failed/aborted read transaction) instead of resolving an empty or
 * partial list — see collectRepertoireAccountGamesCursor above and BUG-2026-07-10-009.
 * openDb() rejects on DB-open failure with no catch-to-empty wrapper.
 */
export async function loadRepertoireAccountGames(accountId: string): Promise<ImportedGame[]> {
  const db = await openDb();
  return collectRepertoireAccountGamesCursor(db, accountId);
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

export async function importAccountRepertoireSource(
  accountId: string,
  options: { allowLargeAccount?: boolean; now?: number } = {},
): Promise<RepertoireSource> {
  const db = await openDb();
  const account = await getAccount(accountId);
  if (!account) throw new Error('Account not found.');
  const gameCount = await countGamesForAccount(db, account.id);
  if (gameCount <= 0) throw new Error('This account has no stored games.');
  if (gameCount > ACCOUNT_REPERTOIRE_DIRECT_GAME_LIMIT && !options.allowLargeAccount) {
    throw new Error(`Account has ${gameCount.toLocaleString()} stored games and needs confirmation before building.`);
  }
  const sourceInput: CreateAccountRepertoireSourceInput = {
    accountId: account.id,
    accountLabel: account.displayName,
    accountPlatform: account.platform,
    gameCount,
  };
  if (options.now !== undefined) sourceInput.now = options.now;
  const source = createAccountRepertoireSource(sourceInput);
  const existing = await getRepertoireSource(source.id);
  if (existing) throw new Error('This account is already a repertoire source.');
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
  if (isAccountRepertoireSource(source)) throw new Error('Account-backed repertoire sources do not support side overrides.');
  const updated = withRepertoireSourceSideOverride(source, sideOverride, now);
  const saved = await saveRepertoireSource(updated);
  if (source.side !== updated.side) await deleteRepertoireSourceScanRecords(id, now);
  return saved;
}

export async function setRepertoireAccountSourceFilters(
  id: string,
  filters: Partial<RepertoireAccountFilters>,
  now = Date.now(),
): Promise<RepertoireSource> {
  const source = await getRepertoireSource(id);
  if (!source) throw new Error('Repertoire source not found.');
  const updated = withRepertoireAccountFilters(source, filters, now);
  return saveRepertoireSource(updated);
}

export async function saveRepertoireAccountBuildInfo(
  id: string,
  sourceVersion: string,
  buildInfo: RepertoireAccountBuildInfo,
  now = Date.now(),
): Promise<RepertoireSource | null> {
  const db = await openDb();
  let saved: RepertoireSource | null = null;
  const tx = db.transaction('repertoire-sources', 'readwrite');
  const store = tx.objectStore('repertoire-sources');
  const req = store.get(id);
  req.onsuccess = () => {
    const source = req.result as RepertoireSource | undefined;
    if (!source || !isAccountRepertoireSource(source) || source.contentVersion !== sourceVersion) return;
    saved = withRepertoireAccountBuildInfo(source, buildInfo, now);
    store.put(saved);
  };
  await txDone(tx);
  if (saved) enqueueSourceUpsert(saved);
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
  if (isAccountRepertoireSource(source)) throw new Error('Account-backed repertoire sources do not have replaceable PGN files.');
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
