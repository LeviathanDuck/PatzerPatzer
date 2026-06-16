import { accountId, type AccountCategory, type AccountPlatform, type ChessAccount } from '../accounts';
import {
  DB_NAME as MAIN_DB_NAME,
  DB_VERSION as MAIN_DB_VERSION,
  setSavedPuzzles,
  type StoredAnalysis,
  type StoredGameRecord,
  type RetroSessionResult,
} from '../idb';
import { upgradeGameDbSchema } from '../idb';
import type { ImportedGame } from '../import/types';
import type { GameSummary } from '../stats/types';
import type { PuzzleCandidate } from '../tree/types';
import type { PuzzleAttempt, PuzzleDefinition, PuzzleUserMeta } from '../puzzles/types';
import { enqueueRemoteSyncDelete, flushRemoteSyncOutbox, type RemoteSyncStoreName } from './remoteSync';

type AccountManagementRecord = ChessAccount & { fallback: boolean };

export interface AccountDataSummary {
  account: AccountManagementRecord;
  gameCount: number;
  reviewCount: number;
  generatedPuzzleCount: number;
  lastSyncedAt: number | null;
}

export interface PuzzleDataSummary {
  userDefinitions: number;
  importedDefinitions: number;
  attempts: number;
  meta: number;
  ratingHistory: number;
  hasPerf: boolean;
  legacySavedReviewPuzzles: number;
  hasActiveSession: boolean;
  pgnCacheEntries: number;
}

export interface LibraryDataSummary {
  games: number;
  reviewGames: number;
  analysis: number;
  summaries: number;
  retroResults: number;
  generatedPuzzles: number;
  legacySavedReviewPuzzles: number;
}

export interface SettingsResetGroup {
  id: string;
  title: string;
  description: string;
  keys: string[];
  prefixes?: string[];
}

export interface DataManagementSnapshot {
  accounts: AccountDataSummary[];
  library: LibraryDataSummary;
  puzzles: PuzzleDataSummary;
  settingsGroups: SettingsResetGroup[];
}

export interface DataManagementResult {
  success: boolean;
  message: string;
  counts: Record<string, number>;
  error?: string;
}

const PUZZLE_DB_NAME = 'patzer-puzzle-v1';
const PUZZLE_DB_VERSION = 3;
const PGN_DB_NAME = 'patzer-puzzle-pgn';
const PGN_DB_VERSION = 1;
const PGN_CACHE_STORE = 'puzzle-pgn-cache';

const PUZZLE_SESSION_KEY = 'puzzleSession';
const PUZZLE_QUEUE_KEY = 'puzzleSessionQueue';
const PUZZLE_AUTO_NEXT_KEY = 'puzzleAutoNext';

const SETTINGS_GROUPS: SettingsResetGroup[] = [
  {
    id: 'board',
    title: 'Board appearance and controls',
    description: 'Theme, pieces, zoom, board filters, wheel navigation, review dots, and sound.',
    keys: ['boardZoom', 'boardTheme', 'pieceSet', 'boardWheelNavEnabled', 'reviewDotsUserOnly', 'boardSoundEnabled', 'boardSoundVolume'],
    prefixes: ['boardFilter.'],
  },
  {
    id: 'engine-review',
    title: 'Engine and review',
    description: 'Engine search, arrows, review labels, play strength, graph, and review depth.',
    keys: [
      'patzer.multiPv',
      'patzer.analysisDepth',
      'patzer.searchTime',
      'patzer.searchUntilDepth',
      'patzer.showEngineArrows',
      'patzer.arrowAllLines',
      'patzer.showArrowLabels',
      'patzer.showReviewLabels',
      'patzer.showBoardReviewGlyphs',
      'patzer.arrowLabelSize',
      'patzer.playStrengthLevel',
      'patzer.reviewDepth',
      'patzer.postGameSummaryOpen',
      'patzer.evalGraphHeightPct',
    ],
  },
  {
    id: 'import-games',
    title: 'Import and game list',
    description: 'Auto-review import preferences and game-list account filters.',
    keys: ['patzer.autoReview', 'patzer.autoReviewConfirmed', 'patzer.autoReviewDepth', 'patzer.games.accountFilter.v1'],
  },
  {
    id: 'detection',
    title: 'Detection and Learn From Your Mistakes',
    description: 'Missed-moment and LFYM candidate-selection settings.',
    keys: ['missedMomentConfig', 'retroConfig'],
  },
  {
    id: 'puzzle-ui',
    title: 'Puzzle UI session',
    description: 'Auto-next and active puzzle session resume state.',
    keys: [PUZZLE_AUTO_NEXT_KEY, PUZZLE_SESSION_KEY, PUZZLE_QUEUE_KEY],
  },
  {
    id: 'opening-explorer',
    title: 'Opening explorer',
    description: 'Explorer enabled state, database, filters, player history, and date bounds.',
    keys: [
      'analyse.explorer.enabled',
      'explorer.db2.standard',
      'explorer.speed',
      'analyse.explorer.rating',
      'explorer.mode',
      'analyse.explorer.player.name',
      'explorer.player.name.previous',
    ],
    prefixes: ['analyse.explorer.since-2.', 'analyse.explorer.until-2.'],
  },
];

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function ensureIndex(store: IDBObjectStore, name: string, keyPath: string | string[], options?: IDBIndexParameters): void {
  if (!store.indexNames.contains(name)) store.createIndex(name, keyPath, options);
}

function ensureStore(
  db: IDBDatabase,
  event: IDBVersionChangeEvent,
  name: string,
  options?: IDBObjectStoreParameters,
): IDBObjectStore {
  if (!db.objectStoreNames.contains(name)) return db.createObjectStore(name, options);
  const tx = (event.target as IDBOpenDBRequest).transaction;
  if (!tx) throw new Error(`IndexedDB upgrade transaction missing for ${name}.`);
  return tx.objectStore(name);
}

function upgradePuzzleDbSchema(db: IDBDatabase, event: IDBVersionChangeEvent): void {
  const definitions = ensureStore(db, event, 'definitions', { keyPath: 'id' });
  ensureIndex(definitions, 'sourceKind', 'sourceKind', { unique: false });
  ensureIndex(definitions, 'createdAt', 'createdAt', { unique: false });

  const attempts = ensureStore(db, event, 'attempts', { autoIncrement: true });
  ensureIndex(attempts, 'puzzleId', 'puzzleId', { unique: false });
  ensureIndex(attempts, 'completedAt', 'completedAt', { unique: false });

  ensureStore(db, event, 'user-meta', { keyPath: 'puzzleId' });
  ensureStore(db, event, 'user-perf');

  const history = ensureStore(db, event, 'rating-history', { autoIncrement: true });
  ensureIndex(history, 'timestamp', 'timestamp', { unique: false });
}

function upgradePgnCacheDb(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(PGN_CACHE_STORE)) db.createObjectStore(PGN_CACHE_STORE);
}

function openDb(name: string, version: number, upgrade?: (db: IDBDatabase, event: IDBVersionChangeEvent) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = event => upgrade?.(req.result, event);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openMainDb(): Promise<IDBDatabase> {
  return openDb(MAIN_DB_NAME, MAIN_DB_VERSION, upgradeGameDbSchema);
}

function openPuzzleDb(): Promise<IDBDatabase> {
  return openDb(PUZZLE_DB_NAME, PUZZLE_DB_VERSION, upgradePuzzleDbSchema);
}

function openPgnCacheDb(): Promise<IDBDatabase> {
  return openDb(PGN_DB_NAME, PGN_DB_VERSION, db => upgradePgnCacheDb(db));
}

function readAll<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(storeName)) {
      resolve([]);
      return;
    }
    const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
    req.onsuccess = () => resolve((req.result as T[] | undefined) ?? []);
    req.onerror = () => reject(req.error);
  });
}

function countStore(db: IDBDatabase, storeName: string): Promise<number> {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(storeName)) {
      resolve(0);
      return;
    }
    const req = db.transaction(storeName, 'readonly').objectStore(storeName).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function countExplicitRecord(db: IDBDatabase, storeName: string, key: IDBValidKey): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(storeName)) {
      resolve(false);
      return;
    }
    const req = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result !== undefined);
    req.onerror = () => reject(req.error);
  });
}

function fallbackPlatform(id: string): AccountPlatform {
  return id.startsWith('chesscom:') ? 'chesscom' : 'lichess';
}

function fallbackUsername(id: string, games: StoredGameRecord[]): string {
  const fromId = id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
  return games.find(game => game.accountId === id)?.importedUsername ?? fromId;
}

function fallbackAccount(id: string, games: StoredGameRecord[]): AccountManagementRecord {
  const platform = fallbackPlatform(id);
  const username = fallbackUsername(id, games).trim().toLowerCase() || 'unknown';
  return {
    id,
    platform,
    username,
    displayName: username,
    category: 'opponent',
    addedAt: 0,
    lastSyncedAt: null,
    newestGameTimestamp: null,
    oldestGameTimestamp: null,
    syncFilterKey: null,
    fallback: true,
  };
}

function normalizeAccount(account: ChessAccount): AccountManagementRecord {
  return { ...account, fallback: false };
}

function importedGameToStoredRecord(game: ImportedGame): StoredGameRecord {
  return {
    id: game.id,
    pgn: game.pgn,
    white: game.white ?? null,
    black: game.black ?? null,
    result: game.result ?? null,
    date: game.date ?? null,
    timeClass: game.timeClass ?? null,
    opening: game.opening ?? null,
    eco: game.eco ?? null,
    source: game.source ?? null,
    whiteRating: game.whiteRating ?? null,
    blackRating: game.blackRating ?? null,
    importedUsername: game.importedUsername ?? null,
    accountId: game.accountId ?? null,
    importedAt: game.importedAt ?? 0,
    updatedAt: game.importedAt ?? 0,
  };
}

function storedRecordToImportedGame(record: StoredGameRecord): ImportedGame {
  const game: ImportedGame = { id: record.id, pgn: record.pgn };
  if (record.white !== null) game.white = record.white;
  if (record.black !== null) game.black = record.black;
  if (record.result !== null) game.result = record.result;
  if (record.date !== null) game.date = record.date;
  if (record.timeClass !== null) game.timeClass = record.timeClass;
  if (record.opening !== null) game.opening = record.opening;
  if (record.eco !== null) game.eco = record.eco;
  if (record.source === 'lichess' || record.source === 'chesscom') game.source = record.source;
  if (record.whiteRating !== null) game.whiteRating = record.whiteRating;
  if (record.blackRating !== null) game.blackRating = record.blackRating;
  if (record.importedUsername !== null) game.importedUsername = record.importedUsername;
  if (record.accountId !== null) game.accountId = record.accountId;
  game.importedAt = record.importedAt;
  return game;
}

function puzzleDefinitionSourceGameId(definition: PuzzleDefinition): string | undefined {
  return definition.sourceKind === 'user-library' ? definition.sourceGameId : undefined;
}

function puzzleAttemptKey(attempt: Pick<PuzzleAttempt, 'puzzleId' | 'startedAt' | 'completedAt'>): string {
  return `${attempt.puzzleId}::${attempt.startedAt}::${attempt.completedAt}`;
}

function ratingHistoryKey(entry: { timestamp: number; rating: number; deviation: number }): string {
  return `${entry.timestamp}::${entry.rating}::${entry.deviation}`;
}

function legacySavedPuzzleKey(): string {
  return 'saved-puzzles';
}

function enqueueDelete(store: RemoteSyncStoreName, itemKey: string): void {
  try {
    enqueueRemoteSyncDelete(store, itemKey, Date.now());
  } catch (error) {
    console.warn('[data-management] RemoteSync tombstone enqueue failed', store, itemKey, error);
  }
}

async function flushTombstones(): Promise<DataManagementResult> {
  const result = await flushRemoteSyncOutbox();
  if (result.success) return { success: true, message: 'Changes queued and flushed to the token database.', counts: result.counts ?? {} };
  return {
    success: false,
    message: result.error || 'Changes were made locally, but tombstones did not flush.',
    counts: result.counts ?? {},
    ...(result.error !== undefined ? { error: result.error } : {}),
  };
}

function collectSettingKeys(group: SettingsResetGroup): string[] {
  const keys = new Set(group.keys);
  for (const prefix of group.prefixes ?? []) {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) keys.add(key);
    }
  }
  return [...keys];
}

function reviewGameIdsForAccount(games: StoredGameRecord[], accountIdValue: string): Set<string> {
  return new Set(games.filter(game => gameAccountId(game) === accountIdValue).map(game => game.id));
}

function gameAccountId(game: StoredGameRecord): string | null {
  if (game.accountId) return game.accountId;
  if (!game.importedUsername) return null;
  const platform = game.source === 'chesscom' ? 'chesscom' : game.source === 'lichess' ? 'lichess' : null;
  return platform ? accountId(platform, game.importedUsername) : null;
}

function collectReviewKeysForGameIds(
  gameIds: Set<string>,
  analysis: StoredAnalysis[],
  summaries: GameSummary[],
  retroResults: RetroSessionResult[],
): { analysisKeys: string[]; summaryKeys: string[]; retroKeys: string[] } {
  return {
    analysisKeys: analysis.filter(item => gameIds.has(item.gameId)).map(item => item.gameId),
    summaryKeys: summaries.filter(item => gameIds.has(item.gameId)).map(item => item.gameId),
    retroKeys: retroResults.filter(item => gameIds.has(item.gameId)).map(item => item.gameId),
  };
}

async function deleteMainStoreKeys(storeName: string, keys: string[]): Promise<number> {
  if (keys.length === 0) return 0;
  const db = await openMainDb();
  try {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    for (const key of keys) store.delete(key);
    await txDone(tx);
    return keys.length;
  } finally {
    db.close();
  }
}

async function readLegacyImportedGames(db: IDBDatabase): Promise<StoredGameRecord[]> {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains('game-library')) {
      resolve([]);
      return;
    }
    const req = db.transaction('game-library', 'readonly').objectStore('game-library').get('imported-games');
    req.onsuccess = () => {
      const games = (req.result as { games?: unknown[] } | undefined)?.games;
      resolve(Array.isArray(games)
        ? games.filter((game): game is ImportedGame => !!game && typeof game === 'object' && typeof (game as ImportedGame).id === 'string' && typeof (game as ImportedGame).pgn === 'string')
          .map(importedGameToStoredRecord)
        : []);
    };
    req.onerror = () => reject(req.error);
  });
}

async function readImportedGameRecords(db: IDBDatabase): Promise<StoredGameRecord[]> {
  const records = await readAll<StoredGameRecord>(db, 'games');
  return records.length > 0 ? records : readLegacyImportedGames(db);
}

async function filterLegacyImportedGames(gameIds: Set<string>): Promise<number> {
  if (gameIds.size === 0) return 0;
  const db = await openMainDb();
  try {
    const current = await readLegacyImportedGames(db);
    if (current.length === 0) return 0;
    const next = current.filter(game => !gameIds.has(game.id));
    if (next.length === current.length) return 0;
    const tx = db.transaction('game-library', 'readwrite');
    const store = tx.objectStore('game-library');
    if (next.length === 0) store.delete('imported-games');
    else store.put({ games: next.map(storedRecordToImportedGame) }, 'imported-games');
    await txDone(tx);
    return current.length - next.length;
  } finally {
    db.close();
  }
}

async function deleteLegacyImportedGames(): Promise<number> {
  const db = await openMainDb();
  try {
    const current = await readLegacyImportedGames(db);
    if (current.length === 0) return 0;
    const tx = db.transaction('game-library', 'readwrite');
    tx.objectStore('game-library').delete('imported-games');
    await txDone(tx);
    return current.length;
  } finally {
    db.close();
  }
}

async function deletePuzzleDefinitionsByIds(definitionIds: Set<string>): Promise<number> {
  if (definitionIds.size === 0) return 0;
  const db = await openPuzzleDb();
  try {
    const tx = db.transaction('definitions', 'readwrite');
    for (const id of definitionIds) tx.objectStore('definitions').delete(id);
    await txDone(tx);
    return definitionIds.size;
  } finally {
    db.close();
  }
}

async function deletePuzzleAttemptsByPuzzleIds(puzzleIds: Set<string>): Promise<number> {
  if (puzzleIds.size === 0) return 0;
  const db = await openPuzzleDb();
  let deleted = 0;
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('attempts', 'readwrite');
      const store = tx.objectStore('attempts');
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result as IDBCursorWithValue | null;
        if (!cursor) return;
        const attempt = cursor.value as PuzzleAttempt;
        if (puzzleIds.has(attempt.puzzleId)) {
          store.delete(cursor.primaryKey);
          deleted++;
        }
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
  return deleted;
}

async function deletePuzzleMetaByIds(puzzleIds: Set<string>): Promise<number> {
  if (puzzleIds.size === 0) return 0;
  const db = await openPuzzleDb();
  try {
    const tx = db.transaction('user-meta', 'readwrite');
    for (const id of puzzleIds) tx.objectStore('user-meta').delete(id);
    await txDone(tx);
    return puzzleIds.size;
  } finally {
    db.close();
  }
}

async function clearPuzzleStores(storeNames: string[]): Promise<Record<string, number>> {
  const db = await openPuzzleDb();
  const counts: Record<string, number> = {};
  try {
    for (const storeName of storeNames) counts[storeName] = await countStore(db, storeName);
    const tx = db.transaction(storeNames, 'readwrite');
    for (const storeName of storeNames) tx.objectStore(storeName).clear();
    await txDone(tx);
    return counts;
  } finally {
    db.close();
  }
}

async function readGeneratedDefinitions(): Promise<PuzzleDefinition[]> {
  const db = await openPuzzleDb();
  try {
    return (await readAll<PuzzleDefinition>(db, 'definitions')).filter(def => def.sourceKind === 'user-library');
  } finally {
    db.close();
  }
}

async function readLegacySavedReviewPuzzles(): Promise<PuzzleCandidate[]> {
  const db = await openMainDb();
  try {
    return new Promise((resolve, reject) => {
      const req = db.transaction('puzzle-library', 'readonly').objectStore('puzzle-library').get(legacySavedPuzzleKey());
      req.onsuccess = () => resolve((req.result as PuzzleCandidate[] | undefined) ?? []);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function writeLegacySavedReviewPuzzles(puzzles: PuzzleCandidate[]): Promise<void> {
  const db = await openMainDb();
  try {
    const tx = db.transaction('puzzle-library', 'readwrite');
    tx.objectStore('puzzle-library').put(puzzles, legacySavedPuzzleKey());
    await txDone(tx);
    setSavedPuzzles(puzzles);
  } finally {
    db.close();
  }
}

async function deleteLegacySavedReviewPuzzles(): Promise<number> {
  const count = (await readLegacySavedReviewPuzzles()).length;
  const db = await openMainDb();
  try {
    const tx = db.transaction('puzzle-library', 'readwrite');
    tx.objectStore('puzzle-library').delete(legacySavedPuzzleKey());
    await txDone(tx);
    setSavedPuzzles([]);
    enqueueDelete('saved-review-puzzles', legacySavedPuzzleKey());
    return count;
  } finally {
    db.close();
  }
}

async function filterLegacySavedReviewPuzzles(gameIds: Set<string>): Promise<number> {
  const current = await readLegacySavedReviewPuzzles();
  const next = current.filter(puzzle => !puzzle.gameId || !gameIds.has(puzzle.gameId));
  if (next.length === current.length) return 0;
  await writeLegacySavedReviewPuzzles(next);
  if (next.length === 0) enqueueDelete('saved-review-puzzles', legacySavedPuzzleKey());
  else {
    try {
      const { enqueueRemoteSyncUpsert } = await import('./remoteSync');
      enqueueRemoteSyncUpsert('saved-review-puzzles', legacySavedPuzzleKey(), next, Date.now());
    } catch (error) {
      console.warn('[data-management] RemoteSync legacy puzzle update failed', error);
    }
  }
  return current.length - next.length;
}

export async function getDataManagementSnapshot(): Promise<DataManagementSnapshot> {
  const mainDb = await openMainDb();
  const puzzleDb = await openPuzzleDb();
  let pgnCacheEntries = 0;
  try {
    const [games, accounts, analysis, summaries, retroResults, legacyPuzzles] = await Promise.all([
      readImportedGameRecords(mainDb),
      readAll<ChessAccount>(mainDb, 'accounts'),
      readAll<StoredAnalysis>(mainDb, 'analysis-library'),
      readAll<GameSummary>(mainDb, 'game-summaries'),
      readAll<RetroSessionResult>(mainDb, 'retro-results'),
      readLegacySavedReviewPuzzles(),
    ]);
    const [definitions, attempts, meta, ratingHistory, hasPerf] = await Promise.all([
      readAll<PuzzleDefinition>(puzzleDb, 'definitions'),
      readAll<PuzzleAttempt>(puzzleDb, 'attempts'),
      readAll<PuzzleUserMeta>(puzzleDb, 'user-meta'),
      readAll<unknown>(puzzleDb, 'rating-history'),
      countExplicitRecord(puzzleDb, 'user-perf', 'puzzle'),
    ]);

    try {
      const pgnDb = await openPgnCacheDb();
      try {
        pgnCacheEntries = await countStore(pgnDb, PGN_CACHE_STORE);
      } finally {
        pgnDb.close();
      }
    } catch {
      pgnCacheEntries = 0;
    }

    const accountsById = new Map(accounts.map(account => [account.id, normalizeAccount(account)]));
    for (const game of games) {
      const resolvedAccountId = gameAccountId(game);
      if (resolvedAccountId && !accountsById.has(resolvedAccountId)) {
        accountsById.set(resolvedAccountId, fallbackAccount(resolvedAccountId, games));
      } else if (!resolvedAccountId && game.importedUsername) {
        const id = accountId(game.source === 'chesscom' ? 'chesscom' : 'lichess', game.importedUsername);
        if (!accountsById.has(id)) accountsById.set(id, fallbackAccount(id, games));
      }
    }

    const analysisIds = new Set(analysis.map(item => item.gameId));
    const summaryIds = new Set(summaries.map(item => item.gameId));
    const retroIds = new Set(retroResults.map(item => item.gameId));
    const userDefinitions = definitions.filter(def => def.sourceKind === 'user-library');
    const localGameIds = new Set(games.map(game => game.id));
    const reviewedGameIds = new Set<string>();
    for (const gameId of analysisIds) if (localGameIds.has(gameId)) reviewedGameIds.add(gameId);
    for (const gameId of summaryIds) if (localGameIds.has(gameId)) reviewedGameIds.add(gameId);
    for (const gameId of retroIds) if (localGameIds.has(gameId)) reviewedGameIds.add(gameId);
    const generatedPuzzleCount = userDefinitions.filter(def => {
      const sourceGameId = puzzleDefinitionSourceGameId(def);
      return sourceGameId ? localGameIds.has(sourceGameId) : false;
    }).length + legacyPuzzles.filter(puzzle => puzzle.gameId && localGameIds.has(puzzle.gameId)).length;

    const accountSummaries = [...accountsById.values()]
      .map(account => {
        const accountGames = games.filter(game => game.accountId === account.id);
        const gameIds = new Set(accountGames.map(game => game.id));
        const reviewCount = [...gameIds].filter(gameId =>
          analysisIds.has(gameId) || summaryIds.has(gameId) || retroIds.has(gameId),
        ).length;
        const generatedPuzzleCount = userDefinitions.filter(def => {
          const sourceGameId = puzzleDefinitionSourceGameId(def);
          return sourceGameId ? gameIds.has(sourceGameId) : false;
        }).length + legacyPuzzles.filter(puzzle => puzzle.gameId && gameIds.has(puzzle.gameId)).length;
        const lastSyncedAt = account.lastSyncedAt ?? (
          accountGames.length > 0 ? Math.max(...accountGames.map(game => game.importedAt ?? 0)) : null
        );
        return {
          account,
          gameCount: accountGames.length,
          reviewCount,
          generatedPuzzleCount,
          lastSyncedAt,
        };
      })
      .sort((a, b) => {
        const categoryOrder = (category: AccountCategory): number => category === 'mine' ? 0 : category === 'opponent' ? 1 : category === 'study' ? 2 : 3;
        return categoryOrder(a.account.category) - categoryOrder(b.account.category)
          || a.account.displayName.localeCompare(b.account.displayName);
      });

    return {
      accounts: accountSummaries,
      library: {
        games: games.length,
        reviewGames: reviewedGameIds.size,
        analysis: analysis.length,
        summaries: summaries.length,
        retroResults: retroResults.length,
        generatedPuzzles: generatedPuzzleCount,
        legacySavedReviewPuzzles: legacyPuzzles.length,
      },
      puzzles: {
        userDefinitions: userDefinitions.length,
        importedDefinitions: definitions.length - userDefinitions.length,
        attempts: attempts.length,
        meta: meta.length,
        ratingHistory: ratingHistory.length,
        hasPerf,
        legacySavedReviewPuzzles: legacyPuzzles.length,
        hasActiveSession: localStorage.getItem(PUZZLE_SESSION_KEY) !== null || localStorage.getItem(PUZZLE_QUEUE_KEY) !== null,
        pgnCacheEntries,
      },
      settingsGroups: SETTINGS_GROUPS,
    };
  } finally {
    mainDb.close();
    puzzleDb.close();
  }
}

export async function deleteAllReviewData(): Promise<DataManagementResult> {
  const mainDb = await openMainDb();
  try {
    const [games, analysis, summaries, retroResults] = await Promise.all([
      readImportedGameRecords(mainDb),
      readAll<StoredAnalysis>(mainDb, 'analysis-library'),
      readAll<GameSummary>(mainDb, 'game-summaries'),
      readAll<RetroSessionResult>(mainDb, 'retro-results'),
    ]);
    const analysisKeys = analysis.map(item => item.gameId);
    const summaryKeys = summaries.map(item => item.gameId);
    const retroKeys = retroResults.map(item => item.gameId);

    await Promise.all([
      deleteMainStoreKeys('analysis-library', analysisKeys),
      deleteMainStoreKeys('game-summaries', summaryKeys),
      deleteMainStoreKeys('retro-results', retroKeys),
    ]);
    for (const key of analysisKeys) enqueueDelete('analysis', key);
    for (const key of summaryKeys) enqueueDelete('game-summaries', key);
    for (const key of retroKeys) enqueueDelete('retro-results', key);
    const gameIds = new Set(games.map(game => game.id));
    const reviewedGameIds = new Set([...analysisKeys, ...summaryKeys, ...retroKeys].filter(gameId => gameIds.has(gameId)));
    const flush = await flushTombstones();
    return {
      ...flush,
      message: `Reset analysis for ${reviewedGameIds.size} game${reviewedGameIds.size === 1 ? '' : 's'}. ${flush.message}`,
      counts: {
        ...flush.counts,
        reviewGames: reviewedGameIds.size,
        analysis: analysisKeys.length,
        gameSummaries: summaryKeys.length,
        retroResults: retroKeys.length,
      },
    };
  } finally {
    mainDb.close();
  }
}

export async function deleteAccountReviewData(accountIdValue: string): Promise<DataManagementResult> {
  const mainDb = await openMainDb();
  try {
    const games = await readImportedGameRecords(mainDb);
    const gameIds = reviewGameIdsForAccount(games, accountIdValue);
    const keys = [...gameIds];
    const [analysis, summaries, retroResults] = await Promise.all([
      readAll<StoredAnalysis>(mainDb, 'analysis-library'),
      readAll<GameSummary>(mainDb, 'game-summaries'),
      readAll<RetroSessionResult>(mainDb, 'retro-results'),
    ]);
    const scopedReviewKeys = collectReviewKeysForGameIds(gameIds, analysis, summaries, retroResults);
    const { analysisKeys, summaryKeys, retroKeys } = scopedReviewKeys;

    await Promise.all([
      deleteMainStoreKeys('analysis-library', analysisKeys),
      deleteMainStoreKeys('game-summaries', summaryKeys),
      deleteMainStoreKeys('retro-results', retroKeys),
    ]);
    for (const key of analysisKeys) enqueueDelete('analysis', key);
    for (const key of summaryKeys) enqueueDelete('game-summaries', key);
    for (const key of retroKeys) enqueueDelete('retro-results', key);
    const flush = await flushTombstones();
    return {
      ...flush,
      message: `Deleted review data for ${keys.length} account game${keys.length === 1 ? '' : 's'}. ${flush.message}`,
      counts: {
        ...flush.counts,
        analysis: analysisKeys.length,
        gameSummaries: summaryKeys.length,
        retroResults: retroKeys.length,
      },
    };
  } finally {
    mainDb.close();
  }
}

export async function deleteAllGames(): Promise<DataManagementResult> {
  const mainDb = await openMainDb();
  try {
    const games = await readImportedGameRecords(mainDb);
    const gameIds = new Set(games.map(game => game.id));
    const [analysis, summaries, retroResults] = await Promise.all([
      readAll<StoredAnalysis>(mainDb, 'analysis-library'),
      readAll<GameSummary>(mainDb, 'game-summaries'),
      readAll<RetroSessionResult>(mainDb, 'retro-results'),
    ]);
    const { analysisKeys, summaryKeys, retroKeys } = collectReviewKeysForGameIds(gameIds, analysis, summaries, retroResults);

    await Promise.all([
      deleteMainStoreKeys('analysis-library', analysisKeys),
      deleteMainStoreKeys('game-summaries', summaryKeys),
      deleteMainStoreKeys('retro-results', retroKeys),
    ]);

    const generatedDefinitions = (await readGeneratedDefinitions())
      .filter(def => {
        const sourceGameId = puzzleDefinitionSourceGameId(def);
        return sourceGameId ? gameIds.has(sourceGameId) : false;
      });
    const generatedIds = new Set(generatedDefinitions.map(def => def.id));
    const attempts = await readPuzzleAttemptsForIds(generatedIds);
    const deletedDefinitions = await deletePuzzleDefinitionsByIds(generatedIds);
    const deletedAttempts = await deletePuzzleAttemptsByPuzzleIds(generatedIds);
    const deletedMeta = await deletePuzzleMetaByIds(generatedIds);
    const legacyPuzzles = await filterLegacySavedReviewPuzzles(gameIds);
    await deleteMainStoreKeys('games', [...gameIds]);
    await deleteLegacyImportedGames();
    const deletedGames = gameIds.size;

    for (const gameId of gameIds) enqueueDelete('games', gameId);
    for (const key of analysisKeys) enqueueDelete('analysis', key);
    for (const key of summaryKeys) enqueueDelete('game-summaries', key);
    for (const key of retroKeys) enqueueDelete('retro-results', key);
    for (const id of generatedIds) {
      enqueueDelete('puzzle-definitions', id);
      enqueueDelete('puzzle-user-meta', id);
    }
    for (const attempt of attempts) enqueueDelete('puzzle-attempts', puzzleAttemptKey(attempt));
    const flush = await flushTombstones();
    return {
      ...flush,
      message: `Deleted ${deletedGames} game${deletedGames === 1 ? '' : 's'} and whole-library derived records. ${flush.message}`,
      counts: {
        ...flush.counts,
        games: deletedGames,
        analysis: analysisKeys.length,
        gameSummaries: summaryKeys.length,
        retroResults: retroKeys.length,
        puzzleDefinitions: deletedDefinitions,
        puzzleAttempts: deletedAttempts,
        puzzleMeta: deletedMeta,
        legacySavedReviewPuzzles: legacyPuzzles,
      },
    };
  } finally {
    mainDb.close();
  }
}

export async function deleteAccountGames(accountIdValue: string): Promise<DataManagementResult> {
  const mainDb = await openMainDb();
  try {
    const games = await readImportedGameRecords(mainDb);
    const gameIds = reviewGameIdsForAccount(games, accountIdValue);
    await deleteAccountReviewData(accountIdValue);

    const generatedDefinitions = (await readGeneratedDefinitions())
      .filter(def => {
        const sourceGameId = puzzleDefinitionSourceGameId(def);
        return sourceGameId ? gameIds.has(sourceGameId) : false;
      });
    const generatedIds = new Set(generatedDefinitions.map(def => def.id));
    const attempts = await readPuzzleAttemptsForIds(generatedIds);
    const deletedDefinitions = await deletePuzzleDefinitionsByIds(generatedIds);
    const deletedAttempts = await deletePuzzleAttemptsByPuzzleIds(generatedIds);
    const deletedMeta = await deletePuzzleMetaByIds(generatedIds);
    const legacyPuzzles = await filterLegacySavedReviewPuzzles(gameIds);
    await deleteMainStoreKeys('games', [...gameIds]);
    await filterLegacyImportedGames(gameIds);
    const deletedGames = gameIds.size;

    for (const gameId of gameIds) enqueueDelete('games', gameId);
    for (const id of generatedIds) enqueueDelete('puzzle-definitions', id);
    for (const definition of generatedDefinitions) {
      enqueueDelete('puzzle-user-meta', definition.id);
    }
    for (const attempt of attempts) enqueueDelete('puzzle-attempts', puzzleAttemptKey(attempt));
    const flush = await flushTombstones();
    return {
      ...flush,
      message: `Deleted ${deletedGames} game${deletedGames === 1 ? '' : 's'} and cascaded derived records. ${flush.message}`,
      counts: {
        ...flush.counts,
        games: deletedGames,
        puzzleDefinitions: deletedDefinitions,
        puzzleAttempts: deletedAttempts,
        puzzleMeta: deletedMeta,
        legacySavedReviewPuzzles: legacyPuzzles,
      },
    };
  } finally {
    mainDb.close();
  }
}

async function readPuzzleAttemptsForIds(puzzleIds: Set<string>): Promise<PuzzleAttempt[]> {
  if (puzzleIds.size === 0) return [];
  const db = await openPuzzleDb();
  try {
    return (await readAll<PuzzleAttempt>(db, 'attempts')).filter(attempt => puzzleIds.has(attempt.puzzleId));
  } finally {
    db.close();
  }
}

async function readAllPuzzleAttempts(): Promise<PuzzleAttempt[]> {
  const db = await openPuzzleDb();
  try {
    return readAll<PuzzleAttempt>(db, 'attempts');
  } finally {
    db.close();
  }
}

export async function deleteGeneratedPuzzleData(): Promise<DataManagementResult> {
  const definitions = await readGeneratedDefinitions();
  const definitionIds = new Set(definitions.map(def => def.id));
  const attempts = await readPuzzleAttemptsForIds(definitionIds);
  const deletedDefinitions = await deletePuzzleDefinitionsByIds(definitionIds);
  const deletedAttempts = await deletePuzzleAttemptsByPuzzleIds(definitionIds);
  const deletedMeta = await deletePuzzleMetaByIds(definitionIds);
  const legacy = await deleteLegacySavedReviewPuzzles();
  for (const id of definitionIds) {
    enqueueDelete('puzzle-definitions', id);
    enqueueDelete('puzzle-user-meta', id);
  }
  for (const attempt of attempts) enqueueDelete('puzzle-attempts', puzzleAttemptKey(attempt));
  const flush = await flushTombstones();
  return {
    ...flush,
    message: `Deleted ${deletedDefinitions} generated puzzle${deletedDefinitions === 1 ? '' : 's'}. ${flush.message}`,
    counts: {
      ...flush.counts,
      puzzleDefinitions: deletedDefinitions,
      puzzleAttempts: deletedAttempts,
      puzzleMeta: deletedMeta,
      legacySavedReviewPuzzles: legacy,
    },
  };
}

export async function resetPuzzleProgress(): Promise<DataManagementResult> {
  const attempts = await readAllPuzzleAttempts();
  const meta = await readPuzzleMetaSnapshot();
  const history = await readRatingHistory();
  const counts = await clearPuzzleStores(['attempts', 'user-meta', 'user-perf', 'rating-history']);
  localStorage.removeItem(PUZZLE_SESSION_KEY);
  localStorage.removeItem(PUZZLE_QUEUE_KEY);
  for (const attempt of attempts) enqueueDelete('puzzle-attempts', puzzleAttemptKey(attempt));
  for (const item of meta) enqueueDelete('puzzle-user-meta', item.puzzleId);
  enqueueDelete('puzzle-user-perf', 'puzzle');
  for (const entry of history) enqueueDelete('puzzle-rating-history', ratingHistoryKey(entry));
  const flush = await flushTombstones();
  return {
    ...flush,
    message: `Reset puzzle progress while preserving puzzle definitions. ${flush.message}`,
    counts: {
      ...flush.counts,
      attempts: counts.attempts ?? 0,
      meta: counts['user-meta'] ?? 0,
      userPerf: counts['user-perf'] ?? 0,
      ratingHistory: counts['rating-history'] ?? 0,
      sessions: 1,
    },
  };
}

async function readPuzzleMetaSnapshot(): Promise<PuzzleUserMeta[]> {
  const db = await openPuzzleDb();
  try {
    return readAll<PuzzleUserMeta>(db, 'user-meta');
  } finally {
    db.close();
  }
}

async function readRatingHistory(): Promise<Array<{ timestamp: number; rating: number; deviation: number }>> {
  const db = await openPuzzleDb();
  try {
    return readAll<Array<{ timestamp: number; rating: number; deviation: number }>[number]>(db, 'rating-history');
  } finally {
    db.close();
  }
}

export async function clearPuzzlePgnCache(): Promise<DataManagementResult> {
  const db = await openPgnCacheDb();
  try {
    const count = await countStore(db, PGN_CACHE_STORE);
    const tx = db.transaction(PGN_CACHE_STORE, 'readwrite');
    tx.objectStore(PGN_CACHE_STORE).clear();
    await txDone(tx);
    return { success: true, message: `Cleared ${count} cached puzzle PGN${count === 1 ? '' : 's'}.`, counts: { pgnCache: count } };
  } finally {
    db.close();
  }
}

export async function resetSettingsGroup(groupId: string): Promise<DataManagementResult> {
  const group = SETTINGS_GROUPS.find(item => item.id === groupId);
  if (!group) return { success: false, message: 'Unknown settings group.', counts: {}, error: 'Unknown settings group.' };
  const keys = collectSettingKeys(group);
  for (const key of keys) {
    localStorage.removeItem(key);
    enqueueDelete('settings', key);
  }
  if (group.id === 'puzzle-ui') {
    localStorage.removeItem(PUZZLE_SESSION_KEY);
    localStorage.removeItem(PUZZLE_QUEUE_KEY);
  }
  const flush = await flushTombstones();
  return {
    ...flush,
    message: `Reset ${group.title.toLowerCase()} settings. ${flush.message}`,
    counts: { ...flush.counts, settings: keys.length },
  };
}
