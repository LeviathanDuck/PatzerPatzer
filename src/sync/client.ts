// ---------------------------------------------------------------------------
// Client-side sync service for Chess Patzer.
// Manual push/pull between IndexedDB and the server's SQLite database.
// Last-write-wins conflict resolution by timestamp.
// ---------------------------------------------------------------------------

const LAST_SYNC_KEY = 'lastSyncedAt';

import {
  clearClientAuth,
  completeClientLoginIfPresent,
  getClientAuthStatus,
  startClientLogin,
  type ClientAuthStatus,
} from '../auth/lichessClient';
import { record, Severity } from '../diagnostics';

export { LOGIN_MODAL_EVENT, requestLogin } from '../auth/lichessClient';

// --- Last sync tracking ---

export function getLastSyncedAt(): string | null {
  return localStorage.getItem(LAST_SYNC_KEY);
}

function setLastSyncedAt(): void {
  localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
}

// --- HTTP helpers ---
// Session cookie is sent automatically for same-origin requests.

/** Classify a fetch failure into a stable label for diagnostics. No credentials are included. */
function classifyFailure(status: number | undefined, error?: unknown): string {
  if (error !== undefined && (status === undefined || status === 0)) {
    const msg = error instanceof Error ? error.message.toLowerCase() : '';
    if (msg.includes('timeout')) return 'timeout';
    return 'network-error';
  }
  if (status === 401 || status === 403) return 'unauthorized';
  if (status !== undefined && status >= 500) return 'server-error';
  if (status !== undefined && status >= 400) return 'client-error';
  return 'unknown';
}

function errorClass(error: unknown): string {
  if (error instanceof DOMException) return error.name || 'DOMException';
  if (error instanceof Error) return error.name || error.constructor.name || 'Error';
  return typeof error;
}

function isAuthPath(path: string): boolean {
  return path.startsWith('/api/auth') || path.startsWith('/api/patzer-auth');
}

function classifyAuthFailure(status: number | undefined, error?: unknown): string {
  if (error !== undefined && (status === undefined || status === 0)) return classifyFailure(status, error);
  if (status === 401) return 'session-missing';
  if (status === 403) return 'auth-rejected';
  if (status !== undefined && status >= 500) return 'auth-server-error';
  if (status !== undefined && status >= 400) return 'auth-rejected';
  return 'unknown';
}

function failureClassFor(path: string, status: number | undefined, error?: unknown): string {
  return isAuthPath(path) ? classifyAuthFailure(status, error) : classifyFailure(status, error);
}

function syncEndpointClass(method: 'GET' | 'POST', path: string): string {
  if (!path.startsWith('/api/sync/')) return isAuthPath(path) ? 'auth-session' : 'other-api';
  if (method === 'GET') return 'sync-read';
  if (method === 'POST') return 'sync-write';
  return 'sync-route';
}

async function apiGet<T>(path: string): Promise<T> {
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(path, { credentials: 'same-origin' });
  } catch (err) {
    const latencyMs = Date.now() - t0;
    record({
      kind: isAuthPath(path) ? 'api' : 'sync',
      severity: Severity.Error,
      sourceTag: 'sync',
      message: `GET ${syncEndpointClass('GET', path)} network error`,
      metadata: {
        endpointClass: syncEndpointClass('GET', path),
        httpStatus: null,
        latencyMs,
        failureClass: failureClassFor(path, undefined, err),
        errorClass: errorClass(err),
      },
      redactionClass: 'safe',
    });
    throw err;
  }
  if (!res.ok) {
    const latencyMs = Date.now() - t0;
    record({
      kind: isAuthPath(path) ? 'api' : 'sync',
      severity: Severity.Error,
      sourceTag: 'sync',
      message: `GET ${syncEndpointClass('GET', path)} failed`,
      metadata: {
        endpointClass: syncEndpointClass('GET', path),
        httpStatus: res.status,
        latencyMs,
        failureClass: failureClassFor(path, res.status),
      },
      redactionClass: 'safe',
    });
    throw new Error(`GET ${path}: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = {
    method: 'POST',
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(path, opts);
  } catch (err) {
    const latencyMs = Date.now() - t0;
    record({
      kind: isAuthPath(path) ? 'api' : 'sync',
      severity: Severity.Error,
      sourceTag: 'sync',
      message: `POST ${syncEndpointClass('POST', path)} network error`,
      metadata: {
        endpointClass: syncEndpointClass('POST', path),
        httpStatus: null,
        latencyMs,
        failureClass: failureClassFor(path, undefined, err),
        errorClass: errorClass(err),
      },
      redactionClass: 'safe',
    });
    throw err;
  }
  if (!res.ok) {
    const latencyMs = Date.now() - t0;
    record({
      kind: isAuthPath(path) ? 'api' : 'sync',
      severity: Severity.Error,
      sourceTag: 'sync',
      message: `POST ${syncEndpointClass('POST', path)} failed`,
      metadata: {
        endpointClass: syncEndpointClass('POST', path),
        httpStatus: res.status,
        latencyMs,
        failureClass: failureClassFor(path, res.status),
      },
      redactionClass: 'safe',
    });
    throw new Error(`POST ${path}: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// --- Auth check ---

export interface AuthStatus {
  authenticated: boolean;
  username:      string | null;
  displayName?:  string | null;
  email?:        string | null;
  userId?:       string | null;
  isAdmin:       boolean;
  source:        'server' | 'client' | 'none';
  provider?:     'patzer' | 'lichess' | null;
}

export async function checkAuth(): Promise<AuthStatus> {
  const completedClientLogin = await completeClientLoginIfPresent();
  if (completedClientLogin) return completedClientLogin;

  try {
    const status = await apiGet<Partial<AuthStatus>>('/api/auth/status');
    if (status.authenticated) {
      return {
        authenticated: true,
        username:      status.username ?? null,
        displayName:   status.displayName ?? status.username ?? null,
        email:         status.email ?? null,
        userId:        status.userId ?? null,
        isAdmin:       !!status.isAdmin,
        source:        'server',
        provider:      status.provider ?? null,
      };
    }
  } catch {
    // Static deployments serve index.html for /api/*, so fall through to
    // browser-side Lichess auth when the server auth API is unavailable.
  }

  return getClientAuthStatus() satisfies ClientAuthStatus;
}

/** Start browser-side Lichess OAuth. */
export async function login(): Promise<void> {
  await startClientLogin();
}

/** Clear the server-side session and the session cookie. */
export async function logout(): Promise<void> {
  clearClientAuth();
  try {
    await apiPost('/api/auth/logout');
  } catch { /* ignore — cookie cleared on server */ }
}

// --- IDB helpers (read all records from a store) ---

import { DB_NAME as MAIN_DB_NAME, DB_VERSION as MAIN_DB_VERSION, upgradeGameDbSchema } from '../idb/index';

const PUZZLE_DB_NAME = 'patzer-puzzle-v1';
const PUZZLE_DB_VERSION = 3;

function ensureIndex(
  store: IDBObjectStore,
  name: string,
  keyPath: string | string[],
  options?: IDBIndexParameters,
): void {
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

function upgradeForDb(name: string): ((db: IDBDatabase, event: IDBVersionChangeEvent) => void) | undefined {
  if (name === MAIN_DB_NAME) return upgradeGameDbSchema;
  if (name === PUZZLE_DB_NAME) return upgradePuzzleDbSchema;
  return undefined;
}

function openIdb(name: string, version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = event => {
      upgradeForDb(name)?.(req.result, event);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function readAllFromStore(db: IDBDatabase, storeName: string): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(storeName)) return resolve([]);
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}




function countFromStore(db: IDBDatabase, storeName: string): Promise<number> {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(storeName)) return resolve(0);
    const store = db.transaction(storeName, 'readonly').objectStore(storeName);
    if (typeof store.count === 'function') {
      const req = store.count();
      req.onsuccess = () => resolve(typeof req.result === 'number' ? req.result : 0);
      req.onerror = () => reject(req.error);
      return;
    }
    const req = store.getAll();
    req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result.length : 0);
    req.onerror = () => reject(req.error);
  });
}

function readLegacyImportedGameCount(db: IDBDatabase): Promise<number> {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains('game-library')) return resolve(0);
    const req = db.transaction('game-library', 'readonly').objectStore('game-library').get('imported-games');
    req.onsuccess = () => {
      const games = (req.result as { games?: unknown[] } | undefined)?.games;
      resolve(Array.isArray(games) ? games.length : 0);
    };
    req.onerror = () => reject(req.error);
  });
}

async function readGameCountWithLegacyFallback(db: IDBDatabase): Promise<number> {
  const games = await countFromStore(db, 'games');
  return games > 0 ? games : readLegacyImportedGameCount(db);
}

/** Read records from a store where updatedAt > since. Falls back to getAll when since is undefined. */
function readFromStoreSince(db: IDBDatabase, storeName: string, since: number | undefined): Promise<unknown[]> {
  if (since === undefined) return readAllFromStore(db, storeName);
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(storeName)) return resolve([]);
    const results: unknown[] = [];
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result as IDBCursorWithValue | null;
      if (!cursor) { resolve(results); return; }
      const record = cursor.value as { updatedAt?: number };
      if (typeof record.updatedAt === 'number' && record.updatedAt > since) {
        results.push(record);
      }
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

function writeToStore(db: IDBDatabase, storeName: string, records: unknown[], keyPath?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(storeName)) return resolve();
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    for (const record of records) {
      if (keyPath) {
        store.put(record);
      } else {
        store.add(record);
      }
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- Push to server ---

export interface SyncResult {
  success: boolean;
  error?: string;
  counts?: Record<string, number>;
}

export interface AccountSettingSyncItem {
  key: string;
  value: string;
  updatedAt: number;
  deleted?: boolean;
}

export async function pullAccountSettings(since?: number): Promise<AccountSettingSyncItem[]> {
  const query = since !== undefined ? `?since=${encodeURIComponent(String(since))}` : '';
  const result = await apiGet<{ settings?: AccountSettingSyncItem[] }>(`/api/sync/settings${query}`);
  return Array.isArray(result.settings) ? result.settings : [];
}

export async function pushAccountSettings(settings: AccountSettingSyncItem[]): Promise<SyncResult> {
  try {
    if (settings.length === 0) return { success: true, counts: {} };
    const result = await apiPost<{ ok?: boolean; count?: number }>('/api/sync/settings', { settings });
    return { success: result.ok !== false, counts: { settings: result.count ?? settings.length } };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Settings sync failed' };
  }
}

export async function pushToServer(): Promise<SyncResult> {
  try {
    const counts: Record<string, number> = {};
    const lastSync = getLastSyncedAt();
    const since = lastSync ? new Date(lastSync).getTime() : undefined;




    const mainDb = await openIdb(MAIN_DB_NAME, MAIN_DB_VERSION);
    let games = await readFromStoreSince(mainDb, 'games', since);
    if (games.length === 0 && since === undefined) {
      games = await readAllFromStore(mainDb, 'game-library');
    }
    if (games.length > 0) {
      await apiPost('/api/sync/games', { games });
      counts.games = games.length;
    }

    // Push analysis results
    const analysis = await readFromStoreSince(mainDb, 'analysis-library', since);
    if (analysis.length > 0) {
      await apiPost('/api/sync/analysis', { analysis });
      counts.analysis = analysis.length;
    }
    mainDb.close();

    // Push puzzle data from puzzle IDB
    const puzzleDb = await openIdb(PUZZLE_DB_NAME, PUZZLE_DB_VERSION);
    const definitions = await readFromStoreSince(puzzleDb, 'definitions', since);
    const attempts = await readFromStoreSince(puzzleDb, 'attempts', since);
    const meta = await readFromStoreSince(puzzleDb, 'user-meta', since);

    if (definitions.length > 0 || attempts.length > 0 || meta.length > 0) {
      await apiPost('/api/sync/puzzles', { definitions, attempts, meta });
      counts.definitions = definitions.length;
      counts.attempts = attempts.length;
      counts.meta = meta.length;
    }
    puzzleDb.close();

    setLastSyncedAt();
    return { success: true, counts };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Push failed' };
  }
}

// --- Pull from server ---

/**
 * Return the maximum completedAt timestamp already stored in puzzle-attempts.
 * Opens cursor on completedAt index in 'prev' direction for an O(1) max read.
 */
function getLocalMaxAttemptCompletedAt(db: IDBDatabase): Promise<number> {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains('attempts')) { resolve(0); return; }
    const req = db.transaction('attempts', 'readonly')
      .objectStore('attempts').index('completedAt')
      .openCursor(null, 'prev');
    req.onsuccess = () => {
      const cursor = req.result as IDBCursorWithValue | null;
      if (!cursor) { resolve(0); return; }
      const attempt = cursor.value as { completedAt?: number };
      resolve(typeof attempt.completedAt === 'number' ? attempt.completedAt : 0);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function pullFromServer(): Promise<SyncResult> {
  try {
    const counts: Record<string, number> = {};
    const lastSync = getLastSyncedAt();
    const sinceParam = lastSync ? `?since=${new Date(lastSync).getTime()}` : '';

    // Pull games — write to the per-game store (keyPath: 'id', so put() uses record.id).
    const gamesResult = await apiGet<{ games: unknown[] }>(`/api/sync/games${sinceParam}`);
    if (gamesResult.games.length > 0) {
      const mainDb = await openIdb(MAIN_DB_NAME, MAIN_DB_VERSION);
      await writeToStore(mainDb, 'games', gamesResult.games, 'id');
      mainDb.close();
      counts.games = gamesResult.games.length;
    }

    // Pull analysis
    const analysisResult = await apiGet<{ analysis: unknown[] }>(`/api/sync/analysis${sinceParam}`);
    if (analysisResult.analysis.length > 0) {
      const mainDb = await openIdb(MAIN_DB_NAME, MAIN_DB_VERSION);
      await writeToStore(mainDb, 'analysis-library', analysisResult.analysis, 'gameId');
      mainDb.close();
      counts.analysis = analysisResult.analysis.length;
    }

    // Pull puzzles
    const puzzleResult = await apiGet<{ definitions: unknown[]; attempts: unknown[]; meta: unknown[] }>(`/api/sync/puzzles${sinceParam}`);
    const puzzleDb = await openIdb(PUZZLE_DB_NAME, PUZZLE_DB_VERSION);
    if (puzzleResult.definitions.length > 0) {
      await writeToStore(puzzleDb, 'definitions', puzzleResult.definitions, 'id');
      counts.definitions = puzzleResult.definitions.length;
    }
    if (puzzleResult.meta.length > 0) {
      await writeToStore(puzzleDb, 'user-meta', puzzleResult.meta, 'puzzleId');
      counts.meta = puzzleResult.meta.length;
    }
    // Attempts: only append attempts newer than the local maximum completedAt.
    // Repeated pulls would otherwise accumulate duplicate records in the
    // auto-increment store. Uses the completedAt index cursor for an O(1) max lookup.
    if (puzzleResult.attempts.length > 0) {
      const localMax = await getLocalMaxAttemptCompletedAt(puzzleDb);
      const newAttempts = (puzzleResult.attempts as Array<{ completedAt?: number }>)
        .filter(a => typeof a.completedAt === 'number' && a.completedAt > localMax);
      if (newAttempts.length > 0) {
        await writeToStore(puzzleDb, 'attempts', newAttempts);
        counts.attempts = newAttempts.length;
      }
    }
    puzzleDb.close();

    setLastSyncedAt();
    return { success: true, counts };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Pull failed' };
  }
}

// --- Data counts (for admin UI) ---

export interface DataCounts {
  games: number;
  analysis: number;
  puzzleDefinitions: number;
  puzzleAttempts: number;
  puzzleMeta: number;
}

export async function getLocalDataCounts(): Promise<DataCounts> {
  try {
    const mainDb = await openIdb(MAIN_DB_NAME, MAIN_DB_VERSION);
    const gameCount = await readGameCountWithLegacyFallback(mainDb);
    const analysis = await countFromStore(mainDb, 'analysis-library');
    mainDb.close();

    const puzzleDb = await openIdb(PUZZLE_DB_NAME, PUZZLE_DB_VERSION);
    const defs = await countFromStore(puzzleDb, 'definitions');
    const attempts = await countFromStore(puzzleDb, 'attempts');
    const meta = await countFromStore(puzzleDb, 'user-meta');
    puzzleDb.close();

    return {
      games: gameCount,
      analysis,
      puzzleDefinitions: defs,
      puzzleAttempts: attempts,
      puzzleMeta: meta,
    };
  } catch {
    return { games: 0, analysis: 0, puzzleDefinitions: 0, puzzleAttempts: 0, puzzleMeta: 0 };
  }
}
