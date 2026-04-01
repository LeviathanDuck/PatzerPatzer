// ---------------------------------------------------------------------------
// Client-side sync service for Patzer Pro.
// Manual push/pull between IndexedDB and the server's SQLite database.
// Last-write-wins conflict resolution by timestamp.
// ---------------------------------------------------------------------------

const LAST_SYNC_KEY = 'lastSyncedAt';

// --- Last sync tracking ---

export function getLastSyncedAt(): string | null {
  return localStorage.getItem(LAST_SYNC_KEY);
}

function setLastSyncedAt(): void {
  localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
}

// --- HTTP helpers ---
// Session cookie is sent automatically for same-origin requests.

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = {
    method: 'POST',
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(`POST ${path}: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

// --- Auth check ---

export async function checkAuth(): Promise<{ authenticated: boolean; username: string | null }> {
  try {
    return await apiGet<{ authenticated: boolean; username: string | null }>('/api/auth/status');
  } catch {
    return { authenticated: false, username: null };
  }
}

/** Redirect the browser to the Lichess OAuth consent page. */
export function login(): void {
  window.location.href = '/api/lichess/connect';
}

/** Clear the server-side session and the session cookie. */
export async function logout(): Promise<void> {
  try {
    await apiPost('/api/auth/logout');
  } catch { /* ignore — cookie cleared on server */ }
}

// --- IDB helpers (read all records from a store) ---

import { DB_NAME as MAIN_DB_NAME, DB_VERSION as MAIN_DB_VERSION } from '../idb/index';

function openIdb(name: string, version: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
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

export async function pushToServer(): Promise<SyncResult> {
  try {
    const counts: Record<string, number> = {};
    const lastSync = getLastSyncedAt();
    const since = lastSync ? new Date(lastSync).getTime() : undefined;

    // Push games from the per-game store (new path after CCP-486/487 migration).
    // Falls back to game-library legacy store if the new store is empty
    // (e.g. user has not re-imported since the schema migration).
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
    const puzzleDb = await openIdb('patzer-puzzle-v1', 2);
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
    const puzzleDb = await openIdb('patzer-puzzle-v1', 2);
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
    const games = await readAllFromStore(mainDb, 'games');
    const analysis = await readAllFromStore(mainDb, 'analysis-library');
    mainDb.close();

    const puzzleDb = await openIdb('patzer-puzzle-v1', 2);
    const defs = await readAllFromStore(puzzleDb, 'definitions');
    const attempts = await readAllFromStore(puzzleDb, 'attempts');
    const meta = await readAllFromStore(puzzleDb, 'user-meta');
    puzzleDb.close();

    return {
      games: games.length,
      analysis: analysis.length,
      puzzleDefinitions: defs.length,
      puzzleAttempts: attempts.length,
      puzzleMeta: meta.length,
    };
  } catch {
    return { games: 0, analysis: 0, puzzleDefinitions: 0, puzzleAttempts: 0, puzzleMeta: 0 };
  }
}
