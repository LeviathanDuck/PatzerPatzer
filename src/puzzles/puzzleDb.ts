// ---------------------------------------------------------------------------
// Puzzle V1 — Persistence owner
// Adapted from lichess-org/lila: ui/analyse/src/idbTree.ts (IDB pattern).
//
// Uses a separate IndexedDB database ('patzer-puzzle-v1') so that the legacy
// candidate storage in src/idb/index.ts ('patzer-pro' db, 'puzzle-library'
// store) remains completely untouched. The two systems coexist until the
// legacy path is retired.
//
// Three object stores:
//   definitions — PuzzleDefinition records, keyed by id
//   attempts    — PuzzleAttempt records, keyed by auto-increment
//   user-meta   — PuzzleUserMeta records, keyed by puzzleId
// ---------------------------------------------------------------------------

import type {
  PuzzleDefinition,
  PuzzleAttempt,
  PuzzleUserMeta,
} from './types';

// --- DB connection ---

const DB_NAME = 'patzer-puzzle-v1';
const DB_VERSION = 1;

const STORE_DEFINITIONS = 'definitions';
const STORE_ATTEMPTS    = 'attempts';
const STORE_USER_META   = 'user-meta';

let _db: IDBDatabase | undefined;

function openPuzzleDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e: IDBVersionChangeEvent) => {
      const db = (e.target as IDBOpenDBRequest).result;

      // definitions — keyed by puzzle id
      if (!db.objectStoreNames.contains(STORE_DEFINITIONS)) {
        const store = db.createObjectStore(STORE_DEFINITIONS, { keyPath: 'id' });
        store.createIndex('sourceKind', 'sourceKind', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // attempts — auto-increment key, indexed by puzzleId for lookup
      if (!db.objectStoreNames.contains(STORE_ATTEMPTS)) {
        const store = db.createObjectStore(STORE_ATTEMPTS, { autoIncrement: true });
        store.createIndex('puzzleId', 'puzzleId', { unique: false });
        store.createIndex('completedAt', 'completedAt', { unique: false });
      }

      // user-meta — keyed by puzzleId (one metadata record per puzzle)
      if (!db.objectStoreNames.contains(STORE_USER_META)) {
        db.createObjectStore(STORE_USER_META, { keyPath: 'puzzleId' });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror   = () => reject(req.error);
  });
}

// --- Definitions ---

export async function savePuzzleDefinition(def: PuzzleDefinition): Promise<void> {
  try {
    const db = await openPuzzleDb();
    const tx = db.transaction(STORE_DEFINITIONS, 'readwrite');
    tx.objectStore(STORE_DEFINITIONS).put(def);
  } catch (e) {
    console.warn('[puzzleDb] definition save failed', e);
  }
}

export async function getPuzzleDefinition(id: string): Promise<PuzzleDefinition | undefined> {
  try {
    const db = await openPuzzleDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE_DEFINITIONS, 'readonly')
        .objectStore(STORE_DEFINITIONS).get(id);
      req.onsuccess = () => resolve(req.result as PuzzleDefinition | undefined);
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[puzzleDb] definition get failed', e);
    return undefined;
  }
}

export async function listPuzzleDefinitions(): Promise<PuzzleDefinition[]> {
  try {
    const db = await openPuzzleDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE_DEFINITIONS, 'readonly')
        .objectStore(STORE_DEFINITIONS).getAll();
      req.onsuccess = () => resolve((req.result as PuzzleDefinition[]) ?? []);
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[puzzleDb] definition list failed', e);
    return [];
  }
}

export async function deletePuzzleDefinition(id: string): Promise<void> {
  try {
    const db = await openPuzzleDb();
    const tx = db.transaction(STORE_DEFINITIONS, 'readwrite');
    tx.objectStore(STORE_DEFINITIONS).delete(id);
  } catch (e) {
    console.warn('[puzzleDb] definition delete failed', e);
  }
}

// --- Attempts ---

export async function saveAttempt(attempt: PuzzleAttempt): Promise<void> {
  try {
    const db = await openPuzzleDb();
    const tx = db.transaction(STORE_ATTEMPTS, 'readwrite');
    tx.objectStore(STORE_ATTEMPTS).add(attempt);
  } catch (e) {
    console.warn('[puzzleDb] attempt save failed', e);
  }
}

export async function getAttempts(puzzleId: string): Promise<PuzzleAttempt[]> {
  try {
    const db = await openPuzzleDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ATTEMPTS, 'readonly');
      const index = tx.objectStore(STORE_ATTEMPTS).index('puzzleId');
      const req = index.getAll(puzzleId);
      req.onsuccess = () => resolve((req.result as PuzzleAttempt[]) ?? []);
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[puzzleDb] attempts get failed', e);
    return [];
  }
}

// --- User metadata ---

export async function saveMeta(meta: PuzzleUserMeta): Promise<void> {
  try {
    const db = await openPuzzleDb();
    const tx = db.transaction(STORE_USER_META, 'readwrite');
    tx.objectStore(STORE_USER_META).put(meta);
  } catch (e) {
    console.warn('[puzzleDb] meta save failed', e);
  }
}

export async function getMeta(puzzleId: string): Promise<PuzzleUserMeta | undefined> {
  try {
    const db = await openPuzzleDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE_USER_META, 'readonly')
        .objectStore(STORE_USER_META).get(puzzleId);
      req.onsuccess = () => resolve(req.result as PuzzleUserMeta | undefined);
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[puzzleDb] meta get failed', e);
    return undefined;
  }
}

// --- Full reset ---

/**
 * Clear all Puzzle V1 data. Called during a full data reset.
 * Does NOT touch the legacy 'patzer-pro' puzzle-library store.
 */
export async function clearAllPuzzleV1Data(): Promise<void> {
  try {
    const db = await openPuzzleDb();
    const tx = db.transaction(
      [STORE_DEFINITIONS, STORE_ATTEMPTS, STORE_USER_META],
      'readwrite',
    );
    tx.objectStore(STORE_DEFINITIONS).clear();
    tx.objectStore(STORE_ATTEMPTS).clear();
    tx.objectStore(STORE_USER_META).clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('[puzzleDb] clearAllPuzzleV1Data failed', e);
  }
}
