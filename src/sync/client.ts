// ---------------------------------------------------------------------------
// Client-side sync service for Patzer Pro.
// Manual push/pull between IndexedDB and the server's SQLite database.
// Last-write-wins conflict resolution by timestamp.
// ---------------------------------------------------------------------------

const AUTH_TOKEN_KEY = 'adminAuthToken';
const LAST_SYNC_KEY = 'lastSyncedAt';

// --- Auth token management ---

export function setAuthToken(token: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function clearAuthToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return !!getAuthToken();
}

// --- Last sync tracking ---

export function getLastSyncedAt(): string | null {
  return localStorage.getItem(LAST_SYNC_KEY);
}

function setLastSyncedAt(): void {
  localStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
}

// --- HTTP helpers ---

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token
    ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: authHeaders() });
  if (!res.ok) throw new Error(`GET ${path}: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path}: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

// --- Auth check ---

export async function checkAuth(): Promise<boolean> {
  try {
    const result = await apiGet<{ authenticated: boolean }>('/api/auth/status');
    return result.authenticated;
  } catch {
    return false;
  }
}

export async function login(token: string): Promise<boolean> {
  try {
    const result = await apiPost<{ authenticated: boolean }>('/api/auth/login', { token });
    if (result.authenticated) {
      setAuthToken(token);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function logout(): void {
  clearAuthToken();
}

// --- IDB helpers (read all records from a store) ---

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

    // Push games from main IDB
    const mainDb = await openIdb('patzer-pro', 1);
    const games = await readAllFromStore(mainDb, 'game-library');
    if (games.length > 0) {
      await apiPost('/api/sync/games', { games });
      counts.games = games.length;
    }

    // Push analysis results
    const analysis = await readAllFromStore(mainDb, 'analysis-library');
    if (analysis.length > 0) {
      await apiPost('/api/sync/analysis', { analysis });
      counts.analysis = analysis.length;
    }
    mainDb.close();

    // Push puzzle data from puzzle IDB
    const puzzleDb = await openIdb('patzer-puzzle-db', 2);
    const definitions = await readAllFromStore(puzzleDb, 'puzzle-definitions');
    const attempts = await readAllFromStore(puzzleDb, 'puzzle-attempts');
    const meta = await readAllFromStore(puzzleDb, 'puzzle-user-meta');

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

export async function pullFromServer(): Promise<SyncResult> {
  try {
    const counts: Record<string, number> = {};

    // Pull games
    const gamesResult = await apiGet<{ games: unknown[] }>('/api/sync/games');
    if (gamesResult.games.length > 0) {
      const mainDb = await openIdb('patzer-pro', 1);
      await writeToStore(mainDb, 'game-library', gamesResult.games, 'id');
      mainDb.close();
      counts.games = gamesResult.games.length;
    }

    // Pull analysis
    const analysisResult = await apiGet<{ analysis: unknown[] }>('/api/sync/analysis');
    if (analysisResult.analysis.length > 0) {
      const mainDb = await openIdb('patzer-pro', 1);
      await writeToStore(mainDb, 'analysis-library', analysisResult.analysis, 'gameId');
      mainDb.close();
      counts.analysis = analysisResult.analysis.length;
    }

    // Pull puzzles
    const puzzleResult = await apiGet<{ definitions: unknown[]; attempts: unknown[]; meta: unknown[] }>('/api/sync/puzzles');
    const puzzleDb = await openIdb('patzer-puzzle-db', 2);
    if (puzzleResult.definitions.length > 0) {
      await writeToStore(puzzleDb, 'puzzle-definitions', puzzleResult.definitions, 'id');
      counts.definitions = puzzleResult.definitions.length;
    }
    if (puzzleResult.meta.length > 0) {
      await writeToStore(puzzleDb, 'puzzle-user-meta', puzzleResult.meta, 'puzzleId');
      counts.meta = puzzleResult.meta.length;
    }
    // Attempts: append-only, don't overwrite
    if (puzzleResult.attempts.length > 0) {
      // TODO: deduplicate by (puzzleId + startedAt) to avoid duplicate imports
      counts.attempts = puzzleResult.attempts.length;
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
    const mainDb = await openIdb('patzer-pro', 1);
    const games = await readAllFromStore(mainDb, 'game-library');
    const analysis = await readAllFromStore(mainDb, 'analysis-library');
    mainDb.close();

    const puzzleDb = await openIdb('patzer-puzzle-db', 2);
    const defs = await readAllFromStore(puzzleDb, 'puzzle-definitions');
    const attempts = await readAllFromStore(puzzleDb, 'puzzle-attempts');
    const meta = await readAllFromStore(puzzleDb, 'puzzle-user-meta');
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
