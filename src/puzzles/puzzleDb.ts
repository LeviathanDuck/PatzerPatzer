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
  UserPuzzlePerf,
  PuzzleRatingHistoryEntry,
  RatedEligibility,
} from './types';
import { DEFAULT_USER_PUZZLE_PERF } from './types';
import { loadManifest, loadFilteredShard, findMatchingShards } from './shardLoader';
import { lichessShardRecordToDefinition, type LichessShardRecord } from './adapters';
import { enqueueRemoteSyncDelete, enqueueRemoteSyncUpsert, type RemoteSyncStoreName } from '../sync/remoteSync';
import { record, Severity } from '../diagnostics';

function txStoreName(tx: IDBTransaction): string {
  const storeNames = Array.from(tx.objectStoreNames);
  return storeNames.length === 1 ? storeNames[0]! : storeNames.join(',');
}

function recordPuzzleTxFail(tx: IDBTransaction, eventLabel: string, operationType?: string): void {
  record({
    kind: 'idb',
    severity: Severity.Error,
    source: 'puzzles/puzzleDb',
    sourceTag: 'idb',
    message: `IDB transaction ${eventLabel}`,
    metadata: {
      storeName: txStoreName(tx),
      operation: operationType ?? (tx.mode === 'readonly' ? 'read' : 'write'),
      mode: tx.mode,
      errorName: tx.error?.name ?? 'UnknownError',
    },
    redactionClass: 'safe',
  });
}

function txDone(tx: IDBTransaction, operationType?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => {
      recordPuzzleTxFail(tx, 'onerror', operationType);
      reject(tx.error);
    };
    tx.onabort = () => {
      recordPuzzleTxFail(tx, 'onabort', operationType);
      reject(tx.error);
    };
  });
}

function enqueuePuzzlePut(storeName: RemoteSyncStoreName, itemKey: string, payload: unknown, updatedAt = Date.now()): void {
  try {
    enqueueRemoteSyncUpsert(storeName, itemKey, payload, updatedAt);
  } catch (e) {
    console.warn('[puzzleDb] Remote sync enqueue failed', e);
  }
}

function enqueuePuzzleDelete(storeName: RemoteSyncStoreName, itemKey: string): void {
  try {
    enqueueRemoteSyncDelete(storeName, itemKey);
  } catch (e) {
    console.warn('[puzzleDb] Remote sync delete enqueue failed', e);
  }
}

function puzzleAttemptSyncKey(attempt: Pick<PuzzleAttempt, 'puzzleId' | 'startedAt' | 'completedAt'>): string {
  return `${attempt.puzzleId}::${attempt.startedAt}::${attempt.completedAt}`;
}

function ratingHistorySyncKey(entry: PuzzleRatingHistoryEntry): string {
  return `${entry.timestamp}::${entry.rating}::${entry.deviation}`;
}

// --- DB connection ---

export const DB_NAME = 'patzer-puzzle-v1';
export const DB_VERSION = 3;

const STORE_DEFINITIONS    = 'definitions';
const STORE_ATTEMPTS       = 'attempts';
const STORE_USER_META      = 'user-meta';
/** Single record keyed by 'puzzle' — stores the user's current puzzle rating (UserPuzzlePerf). */
const STORE_USER_PERF      = 'user-perf';
/** Append-only rating history entries (PuzzleRatingHistoryEntry), auto-increment key. */
const STORE_RATING_HISTORY = 'rating-history';
const LOCAL_NODE_SYNC_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

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

      // user-perf — single record keyed by the literal string 'puzzle'.
      // Stores UserPuzzlePerf: the user's current Glicko-2 puzzle rating.
      // Migrated from DB_VERSION 1 → 2.
      if (!db.objectStoreNames.contains(STORE_USER_PERF)) {
        db.createObjectStore(STORE_USER_PERF);
      }

      // rating-history — append-only PuzzleRatingHistoryEntry records.
      // Auto-increment key; indexed by timestamp for ordered reads.
      // Migrated from DB_VERSION 1 → 2.
      if (!db.objectStoreNames.contains(STORE_RATING_HISTORY)) {
        const historyStore = db.createObjectStore(STORE_RATING_HISTORY, { autoIncrement: true });
        historyStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror   = () => reject(req.error);
  });
}

// --- Definitions ---

export async function savePuzzleDefinition(def: PuzzleDefinition): Promise<void> {
  // Validate solution line consistency before persisting.
  if (!def.solutionLine || def.solutionLine.length === 0) {
    console.warn('[puzzleDb] refusing to save definition with empty solutionLine', def.id);
    return;
  }
  if (!def.startFen || def.startFen.split(' ').length < 2) {
    console.warn('[puzzleDb] refusing to save definition with invalid startFen', def.id);
    return;
  }
  // strictSolutionMove must match solutionLine[0]
  if (def.strictSolutionMove && def.strictSolutionMove !== def.solutionLine[0]) {
    console.warn('[puzzleDb] strictSolutionMove mismatch, correcting', def.id);
    def.strictSolutionMove = def.solutionLine[0]!;
  }
  try {
    def.updatedAt = Date.now();
    const db = await openPuzzleDb();
    const tx = db.transaction(STORE_DEFINITIONS, 'readwrite');
    tx.objectStore(STORE_DEFINITIONS).put(def);
    await txDone(tx);
    enqueuePuzzlePut('puzzle-definitions', def.id, def, def.updatedAt ?? Date.now());
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

/**
 * Settle a bounded/offset cursor scan of the definitions store ONLY from the owning
 * transaction's outcome (oncomplete/onerror/onabort) — never from the cursor's own onsuccess.
 * This mirrors collectStudyQueryCursor (src/study/studyDb.ts): a cursor onsuccess that reaches
 * `limit` or exhaustion only records a local `completedResult` and stops driving the cursor,
 * letting the transaction auto-commit naturally; only tx.oncomplete resolves the promise. This
 * closes BUG-2026-07-10-002, where resolving directly from the cursor callback let a transaction
 * abort (or an error swallowed by an outer catch) present as a successful partial or empty list.
 * Adapted from lichess-org/lila: ui/lib/src/objectStorage.ts readCursor pattern.
 */
function collectPuzzleDefinitionCursor(
  db: IDBDatabase,
  limit?: number,
  offset?: number,
): Promise<PuzzleDefinition[]> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let completedResult: PuzzleDefinition[] | undefined;

    const settleResolve = (result: PuzzleDefinition[]): void => {
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
      openedTx = db.transaction(STORE_DEFINITIONS, 'readonly');
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
          'Puzzle definitions cursor transaction completed before settling a result (coding invariant violation)',
        ));
      }
    };
    tx.onerror = () => {
      recordPuzzleTxFail(tx, 'onerror', 'read');
      settleReject(tx.error ?? new Error('Puzzle definitions transaction failed'));
    };
    tx.onabort = () => {
      recordPuzzleTxFail(tx, 'onabort', 'read');
      settleReject(tx.error ?? new DOMException('Puzzle definitions transaction aborted', 'AbortError'));
    };

    let cursorRequest: IDBRequest<IDBCursorWithValue | null>;
    try {
      cursorRequest = tx.objectStore(STORE_DEFINITIONS).openCursor();
    } catch (error) {
      settleReject(error);
      try { tx.abort(); } catch { /* Transaction may already be inactive. */ }
      return;
    }

    const results: PuzzleDefinition[] = [];
    let skipped = 0;

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        // Exhaustion: record the result but do not resolve here — wait for tx.oncomplete.
        completedResult = results;
        return;
      }
      if (offset !== undefined && skipped < offset) {
        skipped++;
        try {
          cursor.continue();
        } catch (error) {
          settleReject(error);
          try { tx.abort(); } catch { /* Transaction may already be inactive. */ }
        }
        return;
      }
      results.push(cursor.value as PuzzleDefinition);
      if (limit !== undefined && results.length >= limit) {
        // Limit reached: record the result and stop driving the cursor (no further continue()),
        // letting the transaction auto-commit naturally. Settlement still waits on tx.oncomplete.
        completedResult = results;
        return;
      }
      try {
        cursor.continue();
      } catch (error) {
        settleReject(error);
        try { tx.abort(); } catch { /* Transaction may already be inactive. */ }
      }
    };
    cursorRequest.onerror = () => {
      settleReject(cursorRequest.error ?? tx.error ?? new Error('Puzzle definitions cursor failed'));
    };
  });
}

/**
 * List puzzle definitions using a cursor, with optional limit and offset.
 * Replaces getAll() to avoid loading the entire store into memory at once.
 * Rejects on genuine storage failure (DB-open failure or a failed/aborted read transaction)
 * instead of resolving an empty or partial list — see collectPuzzleDefinitionCursor above and
 * BUG-2026-07-10-002. Callers already wrap this in try/catch with recordPuzzleLoadFail.
 */
export async function listPuzzleDefinitions(limit?: number, offset?: number): Promise<PuzzleDefinition[]> {
  let db: IDBDatabase;
  try {
    db = await openPuzzleDb();
  } catch (e) {
    console.warn('[puzzleDb] definition list failed (db open)', e);
    throw e;
  }
  try {
    return await collectPuzzleDefinitionCursor(db, limit, offset);
  } catch (e) {
    console.warn('[puzzleDb] definition list failed', e);
    throw e;
  }
}

/** Count all puzzle definitions without loading records into memory. */
export async function countPuzzleDefinitions(): Promise<number> {
  try {
    const db = await openPuzzleDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE_DEFINITIONS, 'readonly')
        .objectStore(STORE_DEFINITIONS).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[puzzleDb] definition count failed', e);
    return 0;
  }
}

/** Count puzzle definitions for a given sourceKind using the sourceKind index. */
export async function countPuzzleDefinitionsBySource(sourceKind: string): Promise<number> {
  try {
    const db = await openPuzzleDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE_DEFINITIONS, 'readonly')
        .objectStore(STORE_DEFINITIONS).index('sourceKind')
        .count(IDBKeyRange.only(sourceKind));
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[puzzleDb] definition count by source failed', e);
    return 0;
  }
}

/**
 * List puzzle definitions for a given sourceKind using the sourceKind index.
 * More efficient than listPuzzleDefinitions() + filter when only one source is needed.
 */
export async function listPuzzleDefinitionsBySource(sourceKind: string): Promise<PuzzleDefinition[]> {
  try {
    const db = await openPuzzleDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE_DEFINITIONS, 'readonly')
        .objectStore(STORE_DEFINITIONS).index('sourceKind')
        .getAll(IDBKeyRange.only(sourceKind));
      req.onsuccess = () => resolve((req.result as PuzzleDefinition[]) ?? []);
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[puzzleDb] definition list by source failed', e);
    return [];
  }
}

export async function deletePuzzleDefinition(id: string): Promise<void> {
  try {
    const db = await openPuzzleDb();
    const tx = db.transaction(STORE_DEFINITIONS, 'readwrite');
    tx.objectStore(STORE_DEFINITIONS).delete(id);
    await txDone(tx, 'delete');
    enqueuePuzzleDelete('puzzle-definitions', id);
  } catch (e) {
    console.warn('[puzzleDb] definition delete failed', e);
  }
}

// --- Attempts ---

export async function saveAttempt(attempt: PuzzleAttempt): Promise<void> {
  try {
    attempt.updatedAt = Date.now();
    const db = await openPuzzleDb();
    const tx = db.transaction(STORE_ATTEMPTS, 'readwrite');
    tx.objectStore(STORE_ATTEMPTS).add(attempt);
    await txDone(tx);
    enqueuePuzzlePut('puzzle-attempts', puzzleAttemptSyncKey(attempt), attempt, attempt.updatedAt ?? Date.now());
  } catch (e) {
    console.warn('[puzzleDb] attempt save failed', e);
  }
  // Enforce retention policy: keep only the 20 most recent attempts per puzzle.
  void pruneOldAttempts(attempt.puzzleId, 20);
}

/**
 * Prune attempts for a puzzle, keeping only the `keep` most recent by completedAt.
 * Opens a cursor on the puzzleId index and deletes oldest entries when over the limit.
 */
async function pruneOldAttempts(puzzleId: string, keep: number): Promise<void> {
  try {
    const db = await openPuzzleDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_ATTEMPTS, 'readwrite');
      const store = tx.objectStore(STORE_ATTEMPTS);
      const entries: Array<{ key: IDBValidKey; completedAt: number; attempt: PuzzleAttempt }> = [];
      const deletedAttempts: PuzzleAttempt[] = [];
      const req = store.index('puzzleId').openCursor(IDBKeyRange.only(puzzleId));
      req.onsuccess = () => {
        const cursor = req.result as IDBCursorWithValue | null;
        if (!cursor) {
          if (entries.length > keep) {
            // Sort ascending by completedAt; delete the oldest (earliest) entries.
            entries.sort((a, b) => a.completedAt - b.completedAt);
            const toDelete = entries.slice(0, entries.length - keep);
            for (const entry of toDelete) {
              store.delete(entry.key);
              deletedAttempts.push(entry.attempt);
            }
          }
          return;
        }
        const attempt = cursor.value as PuzzleAttempt;
        entries.push({
          key: cursor.primaryKey,
          completedAt: attempt.completedAt,
          attempt,
        });
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => {
        for (const attempt of deletedAttempts) {
          enqueuePuzzleDelete('puzzle-attempts', puzzleAttemptSyncKey(attempt));
        }
        resolve();
      };
      tx.onerror = () => {
        recordPuzzleTxFail(tx, 'onerror', 'delete');
        reject(tx.error);
      };
      tx.onabort = () => {
        recordPuzzleTxFail(tx, 'onabort', 'delete');
        reject(tx.error);
      };
    });
  } catch (e) {
    console.warn('[puzzleDb] pruneOldAttempts failed', e);
  }
}

/**
 * Settle a full-scan cursor over the attempts store ONLY from the owning transaction's outcome
 * (oncomplete/onerror/onabort) — never from the cursor's own onsuccess. Parameterizes per-row
 * accumulation (`init`/`visit`) so both `getAllAttemptsByPuzzle` (Map-build) and
 * `listRatedAttempts` (filter-to-array) share identical transaction-settlement plumbing, mirroring
 * `collectPuzzleDefinitionCursor` above and the parameterize-the-visit shape of
 * `collectStudyQueryCursor` (src/study/studyDb.ts). Cursor exhaustion only records a local
 * `completedResult` and stops driving the cursor, letting the transaction auto-commit naturally;
 * only tx.oncomplete resolves the promise. This closes BUG-2026-07-10-004, the sibling of
 * BUG-2026-07-10-002: resolving directly from the cursor callback let a transaction abort (or an
 * error swallowed by an outer catch) present as a successful partial or empty result.
 * Adapted from lichess-org/lila: ui/lib/src/objectStorage.ts readCursor pattern.
 */
function collectAttemptsCursor<T>(
  db: IDBDatabase,
  init: () => T,
  visit: (accumulator: T, attempt: PuzzleAttempt) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let completedResult: T | undefined;

    const settleResolve = (result: T): void => {
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
      openedTx = db.transaction(STORE_ATTEMPTS, 'readonly');
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
          'Puzzle attempts cursor transaction completed before settling a result (coding invariant violation)',
        ));
      }
    };
    tx.onerror = () => {
      recordPuzzleTxFail(tx, 'onerror', 'read');
      settleReject(tx.error ?? new Error('Puzzle attempts transaction failed'));
    };
    tx.onabort = () => {
      recordPuzzleTxFail(tx, 'onabort', 'read');
      settleReject(tx.error ?? new DOMException('Puzzle attempts transaction aborted', 'AbortError'));
    };

    let cursorRequest: IDBRequest<IDBCursorWithValue | null>;
    try {
      cursorRequest = tx.objectStore(STORE_ATTEMPTS).openCursor();
    } catch (error) {
      settleReject(error);
      try { tx.abort(); } catch { /* Transaction may already be inactive. */ }
      return;
    }

    const accumulator = init();

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        // Exhaustion: record the result but do not resolve here — wait for tx.oncomplete.
        completedResult = accumulator;
        return;
      }
      visit(accumulator, cursor.value as PuzzleAttempt);
      try {
        cursor.continue();
      } catch (error) {
        settleReject(error);
        try { tx.abort(); } catch { /* Transaction may already be inactive. */ }
      }
    };
    cursorRequest.onerror = () => {
      settleReject(cursorRequest.error ?? tx.error ?? new Error('Puzzle attempts cursor failed'));
    };
  });
}

/**
 * Load all attempts grouped by puzzleId in a single cursor scan.
 * Use this instead of calling getAttempts() per-puzzle in loops.
 * Replaces N serial IDB transactions with one pass (anti-pattern AP-3 fix).
 * Rejects on genuine storage failure (DB-open failure or a failed/aborted read transaction)
 * instead of resolving an empty Map — see collectAttemptsCursor above and BUG-2026-07-10-004.
 * Callers already wrap this in try/catch with recordPuzzleLoadFail.
 * Adapted from lichess-org/lila: ui/lib/src/objectStorage.ts cursor pattern.
 */
export async function getAllAttemptsByPuzzle(): Promise<Map<string, PuzzleAttempt[]>> {
  let db: IDBDatabase;
  try {
    db = await openPuzzleDb();
  } catch (e) {
    console.warn('[puzzleDb] getAllAttemptsByPuzzle failed (db open)', e);
    throw e;
  }
  try {
    return await collectAttemptsCursor<Map<string, PuzzleAttempt[]>>(
      db,
      () => new Map<string, PuzzleAttempt[]>(),
      (result, attempt) => {
        const list = result.get(attempt.puzzleId);
        if (list) {
          list.push(attempt);
        } else {
          result.set(attempt.puzzleId, [attempt]);
        }
      },
    );
  } catch (e) {
    console.warn('[puzzleDb] getAllAttemptsByPuzzle failed', e);
    throw e;
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
    await txDone(tx);
    enqueuePuzzlePut('puzzle-user-meta', meta.puzzleId, meta, Date.now());
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

// --- User puzzle perf ---

/** The fixed key used for the single UserPuzzlePerf record. */
const USER_PERF_KEY = 'puzzle';

/**
 * Load the user's current puzzle perf from IDB.
 * Returns DEFAULT_USER_PUZZLE_PERF if no record exists yet.
 */
export async function getUserPuzzlePerf(): Promise<UserPuzzlePerf> {
  try {
    const db = await openPuzzleDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE_USER_PERF, 'readonly')
        .objectStore(STORE_USER_PERF).get(USER_PERF_KEY);
      req.onsuccess = () => resolve((req.result as UserPuzzlePerf | undefined) ?? { ...DEFAULT_USER_PUZZLE_PERF });
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[puzzleDb] getUserPuzzlePerf failed', e);
    return { ...DEFAULT_USER_PUZZLE_PERF };
  }
}

/**
 * Persist updated UserPuzzlePerf. Overwrites the single keyed record.
 */
export async function saveUserPuzzlePerf(perf: UserPuzzlePerf): Promise<void> {
  try {
    const db = await openPuzzleDb();
    const tx = db.transaction(STORE_USER_PERF, 'readwrite');
    tx.objectStore(STORE_USER_PERF).put(perf, USER_PERF_KEY);
    await txDone(tx);
    enqueuePuzzlePut('puzzle-user-perf', USER_PERF_KEY, perf, perf.latest ?? Date.now());
  } catch (e) {
    console.warn('[puzzleDb] saveUserPuzzlePerf failed', e);
  }
}

// --- Rating history ---

/**
 * Append a new rating history entry. Written on each rated puzzle completion.
 */
export async function appendRatingHistory(entry: PuzzleRatingHistoryEntry): Promise<void> {
  try {
    const db = await openPuzzleDb();
    const tx = db.transaction(STORE_RATING_HISTORY, 'readwrite');
    tx.objectStore(STORE_RATING_HISTORY).add(entry);
    await txDone(tx);
    enqueuePuzzlePut('puzzle-rating-history', ratingHistorySyncKey(entry), entry, entry.timestamp);
  } catch (e) {
    console.warn('[puzzleDb] appendRatingHistory failed', e);
  }
}

/**
 * Load the full puzzle rating history, ordered by timestamp ascending.
 */
export async function getRatingHistory(): Promise<PuzzleRatingHistoryEntry[]> {
  try {
    const db = await openPuzzleDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE_RATING_HISTORY, 'readonly')
        .objectStore(STORE_RATING_HISTORY).index('timestamp').getAll();
      req.onsuccess = () => resolve((req.result as PuzzleRatingHistoryEntry[]) ?? []);
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[puzzleDb] getRatingHistory failed', e);
    return [];
  }
}

function normalizeServerHistoryEntry(raw: unknown): PuzzleRatingHistoryEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as Record<string, unknown>;
  const timestamp = Number(entry.timestamp ?? entry.timestampMs ?? entry.timestamp_ms);
  const rating = Number(entry.rating);
  const deviation = Number(entry.deviation);
  if (!Number.isFinite(timestamp) || !Number.isFinite(rating) || !Number.isFinite(deviation)) return null;
  return { timestamp, rating, deviation };
}

function isRatedAttempt(attempt: PuzzleAttempt): boolean {
  return attempt.sessionMode === 'rated' || !!(attempt.ratedOutcome && attempt.ratedOutcome !== 'not-rated');
}

function ratedAttemptKey(attempt: Pick<PuzzleAttempt, 'puzzleId' | 'completedAt'>): string {
  return `${attempt.puzzleId}::${attempt.completedAt}`;
}

/**
 * List rated puzzle attempts using a transaction-safe cursor scan (BUG-2026-07-10-004).
 * Rejects on genuine storage failure instead of resolving an empty array — see
 * collectAttemptsCursor above. This export exists ONLY for the fault-injection harness
 * (scripts/test-puzzle-definitions-cursor.mjs) and direct dev tooling; production access stays
 * through pullAndMergeRatedAttempts()/pushNewRatedAttempts() under syncRatedLadder(). Do not add
 * new production callers against this export.
 */
export async function listRatedAttempts(): Promise<PuzzleAttempt[]> {
  let db: IDBDatabase;
  try {
    db = await openPuzzleDb();
  } catch (e) {
    console.warn('[puzzleDb] listRatedAttempts failed (db open)', e);
    throw e;
  }
  try {
    return await collectAttemptsCursor<PuzzleAttempt[]>(
      db,
      () => [],
      (result, attempt) => {
        if (isRatedAttempt(attempt)) result.push(attempt);
      },
    );
  } catch (e) {
    console.warn('[puzzleDb] listRatedAttempts failed', e);
    throw e;
  }
}




















function shouldUseNodePuzzleSyncEndpoints(): boolean {
  return LOCAL_NODE_SYNC_HOSTS.has(window.location.hostname);
}

/**
 * Pull UserPuzzlePerf from the server and merge into local IDB.
 * Server wins if it has a higher nb (more rated games).
 * No-op if not authenticated or server returns nothing.
 */
export async function pullAndMergePuzzlePerf(): Promise<void> {
  try {
    const res = await fetch('/api/sync/puzzle-perf');
    if (!res.ok) return;
    const { perf: serverPerf } = await res.json();
    if (!serverPerf) return;
    const localPerf = await getUserPuzzlePerf();
    // Server wins if nb is higher — has more history.
    if (serverPerf.nb > localPerf.nb) {
      const merged: UserPuzzlePerf = {
        glicko: { rating: serverPerf.rating, deviation: serverPerf.deviation, volatility: serverPerf.volatility },
        nb: serverPerf.nb,
        recent: serverPerf.recent_json
          ? JSON.parse(serverPerf.recent_json)
          : (serverPerf.recentJson ? JSON.parse(serverPerf.recentJson) : []),
        latest: serverPerf.latest_at ?? serverPerf.latestAt ?? null,
      };
      await saveUserPuzzlePerf(merged);
    }
  } catch (e) {
    console.warn('[puzzleDb] pullAndMergePuzzlePerf failed', e);
  }
}

/**
 * Pull rating history from the server and append any locally-missing entries.
 * Merge rule: append-only, keyed by timestamp.
 */
export async function pullAndMergePuzzleRatingHistory(): Promise<void> {
  try {
    const res = await fetch('/api/sync/puzzle-rating-history');
    if (!res.ok) return;
    const { history: serverHistory } = await res.json();
    if (!Array.isArray(serverHistory) || serverHistory.length === 0) return;

    const localHistory = await getRatingHistory();
    const localKeys = new Set(localHistory.map(entry => `${entry.timestamp}`));
    const missing = serverHistory
      .map(normalizeServerHistoryEntry)
      .filter((entry): entry is PuzzleRatingHistoryEntry => !!entry)
      .filter(entry => !localKeys.has(`${entry.timestamp}`));
    if (missing.length === 0) return;

    const db = await openPuzzleDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_RATING_HISTORY, 'readwrite');
      const store = tx.objectStore(STORE_RATING_HISTORY);
      for (const entry of missing) store.add(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        recordPuzzleTxFail(tx, 'onerror', 'write');
        reject(tx.error);
      };
    });
  } catch (e) {
    console.warn('[puzzleDb] pullAndMergePuzzleRatingHistory failed', e);
  }
}

/**
 * Pull rated attempts from the server and append locally-missing entries.
 * Merge rule: append-only, keyed by (puzzleId, completedAt).
 */
export async function pullAndMergeRatedAttempts(): Promise<void> {
  try {
    const res = await fetch('/api/sync/puzzle-rated-attempts');
    if (!res.ok) return;
    const { attempts: serverAttempts } = await res.json();
    if (!Array.isArray(serverAttempts) || serverAttempts.length === 0) return;

    const localAttempts = await listRatedAttempts();
    const localKeys = new Set(localAttempts.map(ratedAttemptKey));
    const missing = serverAttempts.filter((attempt: unknown): attempt is PuzzleAttempt => {
      if (!attempt || typeof attempt !== 'object') return false;
      const candidate = attempt as PuzzleAttempt;
      return !!candidate.puzzleId && !!candidate.completedAt && !localKeys.has(ratedAttemptKey(candidate));
    });
    if (missing.length === 0) return;

    const db = await openPuzzleDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_ATTEMPTS, 'readwrite');
      const store = tx.objectStore(STORE_ATTEMPTS);
      for (const attempt of missing) store.add(attempt);
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        recordPuzzleTxFail(tx, 'onerror', 'write');
        reject(tx.error);
      };
    });
  } catch (e) {
    console.warn('[puzzleDb] pullAndMergeRatedAttempts failed', e);
  }
}

/**
 * Push local UserPuzzlePerf to the server if local nb is >= server nb.
 * No-op if not authenticated.
 */
export async function pushPuzzlePerf(): Promise<void> {
  try {
    const localPerf = await getUserPuzzlePerf();
    if (localPerf.nb === 0) return; // nothing rated yet
    await fetch('/api/sync/puzzle-perf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        perf: {
          rating: localPerf.glicko.rating,
          deviation: localPerf.glicko.deviation,
          volatility: localPerf.glicko.volatility,
          nb: localPerf.nb,
          recentJson: JSON.stringify(localPerf.recent),
          latestAt: localPerf.latest,
        },
      }),
    });
  } catch (e) {
    console.warn('[puzzleDb] pushPuzzlePerf failed', e);
  }
}

/**
 * Push local rating history entries newer than the server's latest timestamp.
 * Append-only on the server — no deletions.
 */
export async function pushNewRatingHistory(): Promise<void> {
  try {
    // Get server's latest timestamp
    const res = await fetch('/api/sync/puzzle-rating-history');
    if (!res.ok) return;
    const { history: serverHistory } = await res.json();
    const serverLatest: number = Array.isArray(serverHistory) && serverHistory.length > 0
      ? Math.max(...serverHistory.map((h: Record<string, unknown>) => Number(h.timestamp ?? h.timestampMs ?? h.timestamp_ms ?? 0)))
      : 0;

    const localHistory = await getRatingHistory();
    const newEntries = localHistory.filter(e => e.timestamp > serverLatest);
    if (newEntries.length === 0) return;

    await fetch('/api/sync/puzzle-rating-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        history: newEntries.map(e => ({
          timestampMs: e.timestamp,
          rating: e.rating,
          deviation: e.deviation,
        })),
      }),
    });
  } catch (e) {
    console.warn('[puzzleDb] pushNewRatingHistory failed', e);
  }
}

/**
 * Push rated attempts the server has not seen yet.
 * Merge rule: append-only, keyed by (puzzleId, completedAt).
 */
export async function pushNewRatedAttempts(): Promise<void> {
  try {
    const res = await fetch('/api/sync/puzzle-rated-attempts');
    if (!res.ok) return;
    const { attempts: serverAttempts } = await res.json();
    const serverKeys = new Set(
      (Array.isArray(serverAttempts) ? serverAttempts : [])
        .filter((attempt: unknown): attempt is PuzzleAttempt => !!attempt && typeof attempt === 'object')
        .map(ratedAttemptKey),
    );

    const localAttempts = await listRatedAttempts();
    const newAttempts = localAttempts.filter(attempt => !serverKeys.has(ratedAttemptKey(attempt)));
    if (newAttempts.length === 0) return;

    await fetch('/api/sync/puzzle-rated-attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attempts: newAttempts }),
    });
  } catch (e) {
    console.warn('[puzzleDb] pushNewRatedAttempts failed', e);
  }
}

/**
 * Full rated ladder sync:
 * - perf: server wins when it has more rated rounds (`nb`)
 * - history: append-only, keyed by timestamp
 * - rated attempts: append-only, keyed by (puzzleId, completedAt)
 *
 * Pull first so a fresh device restores ladder state before local additions
 * are pushed back to the server.
 * Called after the user authenticates or on puzzle page entry when online.
 * Preserves local-first offline behavior — gracefully no-ops on network failure.
 */
export async function syncRatedLadder(): Promise<void> {
  if (!shouldUseNodePuzzleSyncEndpoints()) return;
  await pullAndMergePuzzlePerf();
  await pullAndMergePuzzleRatingHistory();
  await pullAndMergeRatedAttempts();
  await pushPuzzlePerf();
  await pushNewRatingHistory();
  await pushNewRatedAttempts();
}

// --- Rated eligibility helpers ---

/**
 * How long (ms) a recently-failed puzzle is excluded from the rated queue.
 * Source-aligned choice: 7 days (1 week), documented in the sprint plan.
 */
export const RATED_FAILURE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Return the rated eligibility of a puzzle based on attempt history.
 * Checks two rules:
 * 1. Already-solved rule: if the puzzle was previously solved correctly
 *    (any attempt with result 'clean-solve' or 'recovered-solve'), it
 *    cannot score rated again.
 * 2. Recent-failure cooldown: if the puzzle was failed within RATED_FAILURE_COOLDOWN_MS,
 *    it is excluded from the rated queue.
 *
 * Source-confirmed from lichess-org/lila: modules/puzzle/src/main/PuzzleFinisher.scala —
 * prevRound.match case Some(prev) → no rating change on any previously-played puzzle.
 */
export async function getPuzzleRatedEligibility(puzzleId: string): Promise<RatedEligibility> {
  const attempts = await getAttempts(puzzleId);
  if (attempts.length === 0) return { eligible: true };

  const wasCorrectlySolved = attempts.some(
    a => a.result === 'clean-solve' || a.result === 'recovered-solve',
  );
  if (wasCorrectlySolved) {
    return { eligible: false, reason: 'already-solved' };
  }

  const lastAttempt = attempts.reduce((latest, a) =>
    a.completedAt > latest.completedAt ? a : latest,
  );
  const failedRecently =
    (lastAttempt.result === 'failed') &&
    (Date.now() - lastAttempt.completedAt < RATED_FAILURE_COOLDOWN_MS);
  if (failedRecently) {
    return { eligible: false, reason: 'recent-failure-cooldown' };
  }

  return { eligible: true };
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
      [STORE_DEFINITIONS, STORE_ATTEMPTS, STORE_USER_META, STORE_USER_PERF, STORE_RATING_HISTORY],
      'readwrite',
    );
    tx.objectStore(STORE_DEFINITIONS).clear();
    tx.objectStore(STORE_ATTEMPTS).clear();
    tx.objectStore(STORE_USER_META).clear();
    tx.objectStore(STORE_USER_PERF).clear();
    tx.objectStore(STORE_RATING_HISTORY).clear();
    await txDone(tx, 'clear');
  } catch (e) {
    console.warn('[puzzleDb] clearAllPuzzleV1Data failed', e);
  }
}

/**
 * Search shard files for a rated puzzle matching the given rating window.
 * Loads the manifest, selects candidate shards, shuffles and tries up to 2,
 * then returns a random eligible puzzle or null if none found.
 *
 * Moved from ctrl.ts — this is data-layer work (querying external shard files
 * and writing the result to IDB) and belongs in the persistence module.
 * Adapted from lichess-org/lila: ui/puzzle/src/ctrl.ts nextRatedPuzzle.
 */
export async function findRatedPuzzleInShards(
  targetRating: number,
  windowHalf: number,
  excludeIds: Set<string>,
): Promise<PuzzleDefinition | null> {
  let manifest;
  try {
    manifest = await loadManifest();
  } catch {
    return null;
  }

  const rMin = targetRating - windowHalf;
  const rMax = targetRating + windowHalf;
  const candidateShards = findMatchingShards(manifest, { ratingMin: rMin, ratingMax: rMax });
  if (candidateShards.length === 0) return null;

  const shuffledShards = candidateShards.sort(() => Math.random() - 0.5);
  for (const shardMeta of shuffledShards.slice(0, 2)) {
    let records;
    try {
      records = await loadFilteredShard(shardMeta.id, { ratingMin: rMin, ratingMax: rMax });
    } catch {
      continue;
    }
    const eligible = records.filter(r => !excludeIds.has(r.id));
    if (eligible.length === 0) continue;

    const picked = eligible[Math.floor(Math.random() * eligible.length)]!;
    const def = lichessShardRecordToDefinition(picked as LichessShardRecord);
    if (!def) continue;
    await savePuzzleDefinition(def);
    return def;
  }
  return null;
}
