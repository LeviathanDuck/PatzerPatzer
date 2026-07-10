// Study Library IDB persistence — CRUD for studies, practice-lines, position-progress, drill-attempts, folders.
// Uses the shared 'patzer-pro' database opened by src/idb/index.ts.
// Adapted from lichess-org/lila: ui/analyse/src/idbTree.ts cursor patterns.

import { DB_NAME, DB_VERSION, upgradeGameDbSchema } from '../idb/index';
import { compileGameFilterQuery, type CompiledGameFilterEvaluator } from '../gameFilters/filterCore';
import type { GameFilterDateRange, GameFilterProjection, GameFilterQuery } from '../gameFilters/types';
import type { StudyItem, TrainableSequence, PositionProgress, DrillAttempt, StudyFolder } from './types';
import { enqueueRemoteSyncDelete, enqueueRemoteSyncUpsert, type RemoteSyncStoreName } from '../sync/remoteSync';
import { record, Severity } from '../diagnostics';
import { isHidden } from './hiddenItems';

type StudyStoreName =
  | 'studies'
  | 'practice-lines'
  | 'position-progress'
  | 'drill-attempts'
  | 'folders';

export type StudyQueryRunnerIndex = 'createdAt' | 'updatedAt' | 'source' | 'object-store';

export interface StudyQueryProjectionContext {
  hidden: boolean;
}

export interface StudyQueryRunnerRequest {
  query: GameFilterQuery;
  projectItem(
    item: StudyItem,
    context: StudyQueryProjectionContext,
  ): GameFilterProjection;
}

export interface StudyQueryRunnerResult {
  ids: string[];
  totalVisible: number;
  totalMatchedIncludingHidden: number;
  queryHash: string;
  runner: 'study-idb';
  indexUsed: StudyQueryRunnerIndex;
  scannedCount: number;
}

interface StudyQueryCursorPlan {
  indexUsed: StudyQueryRunnerIndex;
  range: IDBKeyRange | null;
  invalid: boolean;
}

interface StudyQueryCursorResult {
  ids: string[];
  totalVisible: number;
  totalMatchedIncludingHidden: number;
  scannedCount: number;
}

class StudyQueryCursorReadError {
  constructor(readonly error: unknown) {}
}

class StudyQueryProjectionError {
  constructor(readonly error: unknown) {}
}

const INDEXED_STUDY_SOURCES: ReadonlySet<StudyItem['source']> = new Set([
  'analysis',
  'openings',
  'puzzles',
  'manual',
  'import',
]);

function classifyStudyError(error: unknown): string {
  if (error instanceof DOMException) return error.name || 'DOMException';
  if (error instanceof Error) return error.name || error.constructor.name || 'Error';
  return typeof error;
}

function studyRouteLabel(): string {
  if (typeof window === 'undefined') return 'unknown';
  const hash = window.location.hash;
  if (hash === '#/study' || hash === '#/study/') return 'study-library';
  if (hash.startsWith('#/study/')) return 'study-detail';
  return 'other';
}

function recordStudyIdbReadFail(storeName: StudyStoreName, error: unknown): void {
  record({
    kind: 'idb',
    severity: Severity.Error,
    source: 'study/studyDb',
    sourceTag: 'study-idb-read-fail',
    message: 'study-idb-read-fail',
    metadata: {
      storeName,
      errorClass: classifyStudyError(error),
      route: studyRouteLabel(),
    },
    redactionClass: 'safe',
  });
}

function txStoreName(tx: IDBTransaction): string {
  const storeNames = Array.from(tx.objectStoreNames);
  return storeNames.length === 1 ? storeNames[0]! : storeNames.join(',');
}

function recordStudyTxFail(tx: IDBTransaction, eventLabel: string, operationType?: string): void {
  record({
    kind: 'idb',
    severity: Severity.Error,
    source: 'study/studyDb',
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
      recordStudyTxFail(tx, 'onerror', operationType);
      reject(tx.error);
    };
    tx.onabort = () => {
      recordStudyTxFail(tx, 'onabort', operationType);
      reject(tx.error);
    };
  });
}

function enqueueStudyPut(storeName: RemoteSyncStoreName, itemKey: string, payload: unknown, updatedAt = Date.now()): void {
  try {
    enqueueRemoteSyncUpsert(storeName, itemKey, payload, updatedAt);
  } catch (e) {
    console.warn('[studyDb] Remote sync enqueue failed', e);
  }
}

function enqueueStudyDelete(storeName: RemoteSyncStoreName, itemKey: string): void {
  try {
    enqueueRemoteSyncDelete(storeName, itemKey);
  } catch (e) {
    console.warn('[studyDb] Remote sync delete enqueue failed', e);
  }
}

function drillAttemptSyncKey(attempt: DrillAttempt): string {
  return `${attempt.positionKey}::${attempt.sequenceId}::${attempt.timestamp}`;
}

// Re-use the shared IDB connection so version negotiation happens once.
// We open it ourselves here so study code doesn't pull in unrelated idb exports.
let _db: IDBDatabase | undefined;

function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e: IDBVersionChangeEvent) => {
      const db = (e.target as IDBOpenDBRequest).result;
      upgradeGameDbSchema(db, e);
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror   = () => reject(req.error);
  });
}

// --- Studies ---

export async function saveStudy(item: StudyItem): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction('studies', 'readwrite');
    tx.objectStore('studies').put(item);
    await txDone(tx);
    enqueueStudyPut('studies', item.id, item, item.updatedAt);
  } catch (e) {
    console.warn('[studyDb] saveStudy failed', e);
  }
}

export async function getStudy(id: string): Promise<StudyItem | undefined> {
  // Un-swallowed (BUG-2026-07-10-008 P2): a genuine storage failure must REJECT so callers can
  // distinguish it from a genuinely-missing key, rather than masking every failure as "not found"
  // (which, for updateStudy, silently DROPS the update). Same posture as listStudies (P1): record +
  // rethrow on DB-open failure, record + reject on the synchronous db.transaction() throw and on the
  // request onerror. A genuinely-missing key still resolves undefined from onsuccess.
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch (e) {
    recordStudyIdbReadFail('studies', e);
    console.warn('[studyDb] getStudy failed (db open)', e);
    throw e;
  }
  return new Promise<StudyItem | undefined>((resolve, reject) => {
    let req: IDBRequest<StudyItem | undefined>;
    try {
      req = db.transaction('studies', 'readonly').objectStore('studies').get(id) as IDBRequest<StudyItem | undefined>;
    } catch (e) {
      recordStudyIdbReadFail('studies', e);
      console.warn('[studyDb] getStudy failed (transaction)', e);
      reject(e);
      return;
    }
    req.onsuccess = () => resolve(req.result as StudyItem | undefined);
    req.onerror   = () => {
      recordStudyIdbReadFail('studies', req.error);
      console.warn('[studyDb] getStudy failed (request)', req.error);
      reject(req.error);
    };
  });
}

export async function listStudies(): Promise<StudyItem[]> {
  // Un-swallowed (BUG-2026-07-10-008 P1): a genuine storage failure must REJECT so the library
  // caller can distinguish it from a legitimately empty store and render an error state, rather
  // than masking every failure as an empty library. Mirrors getStudiesPaginated's posture:
  // record + rethrow on DB-open failure, and record + reject on both the synchronous
  // db.transaction() throw and the request onerror (the latter already propagated because the
  // promise is returned, not awaited — the fix adds the missing diagnostics on that path). A
  // legitimately empty store still resolves [] from onsuccess: no-data != failure is preserved.
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch (e) {
    recordStudyIdbReadFail('studies', e);
    console.warn('[studyDb] listStudies failed (db open)', e);
    throw e;
  }
  return new Promise<StudyItem[]>((resolve, reject) => {
    let req: IDBRequest<StudyItem[]>;
    try {
      req = db.transaction('studies', 'readonly').objectStore('studies').getAll() as IDBRequest<StudyItem[]>;
    } catch (e) {
      recordStudyIdbReadFail('studies', e);
      console.warn('[studyDb] listStudies failed (transaction)', e);
      reject(e);
      return;
    }
    req.onsuccess = () => resolve((req.result as StudyItem[] | undefined) ?? []);
    req.onerror   = () => {
      recordStudyIdbReadFail('studies', req.error);
      console.warn('[studyDb] listStudies failed (request)', req.error);
      reject(req.error);
    };
  });
}














function collectStudyPaginatedCursor(
  db: IDBDatabase,
  sortIndex: 'createdAt' | 'updatedAt',
  direction: IDBCursorDirection,
  offset: number,
  limit: number,
): Promise<StudyItem[]> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let completedResult: StudyItem[] | undefined;

    const settleResolve = (result: StudyItem[]): void => {
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
      openedTx = db.transaction('studies', 'readonly');
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
          'Study paginated cursor transaction completed before settling a result (coding invariant violation)',
        ));
      }
    };
    tx.onerror = () => {
      recordStudyTxFail(tx, 'onerror', 'read');
      settleReject(tx.error ?? new Error('Study paginated cursor transaction failed'));
    };
    tx.onabort = () => {
      recordStudyTxFail(tx, 'onabort', 'read');
      settleReject(tx.error ?? new DOMException('Study paginated cursor transaction aborted', 'AbortError'));
    };

    let cursorRequest: IDBRequest<IDBCursorWithValue | null>;
    try {
      cursorRequest = tx.objectStore('studies').index(sortIndex).openCursor(null, direction);
    } catch (error) {
      settleReject(error);
      try { tx.abort(); } catch { /* Transaction may already be inactive. */ }
      return;
    }

    const results: StudyItem[] = [];
    let skipped = 0;

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        // Exhaustion: record the result but do not resolve here — wait for tx.oncomplete.
        completedResult = results;
        return;
      }
      if (skipped < offset) {
        skipped++;
        try {
          cursor.continue();
        } catch (error) {
          settleReject(error);
          try { tx.abort(); } catch { /* Transaction may already be inactive. */ }
        }
        return;
      }
      results.push(cursor.value as StudyItem);
      if (results.length >= limit) {
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
      settleReject(cursorRequest.error ?? tx.error ?? new Error('Study paginated cursor failed'));
    };
  });
}

/**
 * Load a page of studies using an IDB cursor over the given index.
 * Skips the first `offset` records, then collects up to `limit`.
 * Replaces full getAll() for the library view — satisfies CR-2 / CR-3.
 * Adapted from lichess-org/lila: ui/analyse/src/idbTree.ts cursor patterns.
 * Rejects on genuine storage failure (DB-open failure or a failed/aborted read transaction)
 * instead of resolving an empty or partial list — see collectStudyPaginatedCursor above and
 * BUG-2026-07-10-001. Callers already wrap this in try/catch with recordStudyLoadFail.
 */
export async function getStudiesPaginated(
  sortIndex: 'createdAt' | 'updatedAt',
  direction: IDBCursorDirection,
  offset: number,
  limit: number,
): Promise<StudyItem[]> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch (e) {
    recordStudyIdbReadFail('studies', e);
    console.warn('[studyDb] getStudiesPaginated failed (db open)', e);
    throw e;
  }
  try {
    return await collectStudyPaginatedCursor(db, sortIndex, direction, offset, limit);
  } catch (e) {
    recordStudyIdbReadFail('studies', e);
    console.warn('[studyDb] getStudiesPaginated failed', e);
    throw e;
  }
}

function hasStudyQueryRange(range: GameFilterDateRange | undefined): range is GameFilterDateRange {
  return range !== undefined && (range.from !== undefined || range.to !== undefined);
}

function isExactStudySource(value: string): value is StudyItem['source'] {
  return INDEXED_STUDY_SOURCES.has(value as StudyItem['source']);
}

function dateCursorPlan(
  indexUsed: 'createdAt' | 'updatedAt',
  range: GameFilterDateRange,
): StudyQueryCursorPlan {
  const { from, to } = range;
  if (from !== undefined && to !== undefined && from > to) {
    return { indexUsed, range: null, invalid: true };
  }
  if (from !== undefined && to !== undefined) {
    return { indexUsed, range: IDBKeyRange.bound(from, to), invalid: false };
  }
  if (from !== undefined) {
    return { indexUsed, range: IDBKeyRange.lowerBound(from), invalid: false };
  }
  if (to !== undefined) {
    return { indexUsed, range: IDBKeyRange.upperBound(to), invalid: false };
  }
  return { indexUsed, range: null, invalid: false };
}

function planStudyQueryCursor(query: GameFilterQuery): StudyQueryCursorPlan {
  if (hasStudyQueryRange(query.recentlyAdded)) {
    return dateCursorPlan('createdAt', query.recentlyAdded);
  }
  if (hasStudyQueryRange(query.recentlyModified)) {
    return dateCursorPlan('updatedAt', query.recentlyModified);
  }
  if (query.sources?.length === 1 && isExactStudySource(query.sources[0]!)) {
    return {
      indexUsed: 'source',
      range: IDBKeyRange.only(query.sources[0]!),
      invalid: false,
    };
  }
  return { indexUsed: 'object-store', range: null, invalid: false };
}

function emptyStudyQueryResult(
  evaluator: CompiledGameFilterEvaluator,
  indexUsed: StudyQueryRunnerIndex,
): StudyQueryRunnerResult {
  return {
    ids: [],
    totalVisible: 0,
    totalMatchedIncludingHidden: 0,
    queryHash: evaluator.queryHash,
    runner: 'study-idb',
    indexUsed,
    scannedCount: 0,
  };
}

function collectStudyQueryCursor(
  db: IDBDatabase,
  indexUsed: StudyQueryRunnerIndex,
  range: IDBKeyRange | null,
  request: StudyQueryRunnerRequest,
  evaluator: CompiledGameFilterEvaluator,
): Promise<StudyQueryCursorResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let completedResult: StudyQueryCursorResult | undefined;

    const settleResolve = (result: StudyQueryCursorResult): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const settleReject = (error: StudyQueryCursorReadError | StudyQueryProjectionError): void => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    let openedTx: IDBTransaction;
    try {
      openedTx = db.transaction('studies', 'readonly');
    } catch (error) {
      settleReject(new StudyQueryCursorReadError(error));
      return;
    }
    const tx = openedTx;

    tx.oncomplete = () => {
      if (completedResult !== undefined) {
        settleResolve(completedResult);
      } else {
        settleReject(new StudyQueryCursorReadError(
          new Error('Study query transaction completed before cursor exhaustion'),
        ));
      }
    };
    tx.onerror = () => {
      recordStudyTxFail(tx, 'onerror', 'read');
      settleReject(new StudyQueryCursorReadError(
        tx.error ?? new Error('Study query transaction failed'),
      ));
    };
    tx.onabort = () => {
      recordStudyTxFail(tx, 'onabort', 'read');
      settleReject(new StudyQueryCursorReadError(
        tx.error ?? new DOMException('Study query transaction aborted', 'AbortError'),
      ));
    };

    let cursorRequest: IDBRequest<IDBCursorWithValue | null>;
    try {
      const store = tx.objectStore('studies');
      const source: IDBObjectStore | IDBIndex = indexUsed === 'object-store'
        ? store
        : store.index(indexUsed);
      cursorRequest = source.openCursor(range);
    } catch (error) {
      settleReject(new StudyQueryCursorReadError(error));
      try { tx.abort(); } catch { /* Transaction may already be inactive. */ }
      return;
    }

    const ids: string[] = [];
    let totalMatchedIncludingHidden = 0;
    let scannedCount = 0;

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        completedResult = {
          ids,
          totalVisible: ids.length,
          totalMatchedIncludingHidden,
          scannedCount,
        };
        return;
      }

      scannedCount++;
      const item = cursor.value as StudyItem;
      try {
        const hidden = isHidden('game', item.id);
        const projected = request.projectItem(item, { hidden });
        const projection = projected.hidden === hidden
          ? projected
          : { ...projected, hidden };
        if (evaluator.matchesIncludingHidden(projection)) {
          totalMatchedIncludingHidden++;
          if (evaluator.matchesVisible(projection)) ids.push(item.id);
        }
      } catch (error) {
        settleReject(new StudyQueryProjectionError(error));
        try { tx.abort(); } catch { /* Transaction may already be inactive. */ }
        return;
      }
      try {
        cursor.continue();
      } catch (error) {
        settleReject(new StudyQueryCursorReadError(error));
        try { tx.abort(); } catch { /* Transaction may already be inactive. */ }
      }
    };
    cursorRequest.onerror = () => {
      settleReject(new StudyQueryCursorReadError(
        cursorRequest.error ?? tx.error ?? new Error('Study query cursor failed'),
      ));
    };
  });
}

function unwrapStudyQueryReadError(error: unknown): unknown {
  return error instanceof StudyQueryCursorReadError ? error.error : error;
}

function throwStudyQueryProjectionError(error: unknown): void {
  if (error instanceof StudyQueryProjectionError) throw error.error;
}

async function collectWithStudyQueryPlan(
  db: IDBDatabase,
  plan: StudyQueryCursorPlan,
  request: StudyQueryRunnerRequest,
  evaluator: CompiledGameFilterEvaluator,
): Promise<StudyQueryRunnerResult> {
  const collected = await collectStudyQueryCursor(db, plan.indexUsed, plan.range, request, evaluator);
  return {
    ...collected,
    queryHash: evaluator.queryHash,
    runner: 'study-idb',
    indexUsed: plan.indexUsed,
  };
}

/**
 * Run a shared Study filter over real IDB cursors while retaining only matching Study IDs and
 * scalar diagnostics. The returned ID order is cursor order for selection scope, not display sort.
 */
export async function collectStudyIdsMatchingQuery(
  request: StudyQueryRunnerRequest,
): Promise<StudyQueryRunnerResult> {
  const evaluator = compileGameFilterQuery(request.query);
  const plan = planStudyQueryCursor(evaluator.query);
  if (plan.invalid) return emptyStudyQueryResult(evaluator, plan.indexUsed);

  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch (error) {
    recordStudyIdbReadFail('studies', error);
    throw error;
  }

  try {
    return await collectWithStudyQueryPlan(db, plan, request, evaluator);
  } catch (error) {
    throwStudyQueryProjectionError(error);
    if (plan.indexUsed !== 'object-store') {
      const fallbackPlan: StudyQueryCursorPlan = {
        indexUsed: 'object-store',
        range: null,
        invalid: false,
      };
      try {
        return await collectWithStudyQueryPlan(db, fallbackPlan, request, evaluator);
      } catch (fallbackError) {
        throwStudyQueryProjectionError(fallbackError);
        const readError = unwrapStudyQueryReadError(fallbackError);
        recordStudyIdbReadFail('studies', readError);
        throw readError;
      }
    }
    const readError = unwrapStudyQueryReadError(error);
    recordStudyIdbReadFail('studies', readError);
    throw readError;
  }
}

export async function deleteStudy(id: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction('studies', 'readwrite');
    tx.objectStore('studies').delete(id);
    await txDone(tx, 'delete');
    enqueueStudyDelete('studies', id);
  } catch (e) {
    console.warn('[studyDb] deleteStudy failed', e);
  }
}

// --- Practice lines ---

export async function savePracticeLine(seq: TrainableSequence): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction('practice-lines', 'readwrite');
    tx.objectStore('practice-lines').put(seq);
    await txDone(tx);
    enqueueStudyPut('practice-lines', seq.id, seq, seq.updatedAt);
  } catch (e) {
    console.warn('[studyDb] savePracticeLine failed', e);
  }
}

export async function getPracticeLine(id: string): Promise<TrainableSequence | undefined> {
  // Un-swallowed (BUG-2026-07-10-008 P2): reject on a genuine storage failure instead of masking
  // it as "not found". Same posture as getStudy above; a genuinely-missing key still resolves
  // undefined from onsuccess.
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch (e) {
    recordStudyIdbReadFail('practice-lines', e);
    console.warn('[studyDb] getPracticeLine failed (db open)', e);
    throw e;
  }
  return new Promise<TrainableSequence | undefined>((resolve, reject) => {
    let req: IDBRequest<TrainableSequence | undefined>;
    try {
      req = db.transaction('practice-lines', 'readonly').objectStore('practice-lines').get(id) as IDBRequest<TrainableSequence | undefined>;
    } catch (e) {
      recordStudyIdbReadFail('practice-lines', e);
      console.warn('[studyDb] getPracticeLine failed (transaction)', e);
      reject(e);
      return;
    }
    req.onsuccess = () => resolve(req.result as TrainableSequence | undefined);
    req.onerror   = () => {
      recordStudyIdbReadFail('practice-lines', req.error);
      console.warn('[studyDb] getPracticeLine failed (request)', req.error);
      reject(req.error);
    };
  });
}

export async function listPracticeLines(studyItemId?: string): Promise<TrainableSequence[]> {
  // Un-swallowed (BUG-2026-07-10-008 P2): reject on a genuine storage failure instead of masking it
  // as an empty practice-lines panel (which leaves the study-detail panel showing "No practice
  // lines" as if none were saved). Same posture as listStudies (P1). The study-detail caller
  // (studyDetailView.loadPracticeLinesForStudy) now catches the rejection and leaves the "Loading…"
  // state for an honest error. A legitimately empty store still resolves [] from onsuccess.
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch (e) {
    recordStudyIdbReadFail('practice-lines', e);
    console.warn('[studyDb] listPracticeLines failed (db open)', e);
    throw e;
  }
  return new Promise<TrainableSequence[]>((resolve, reject) => {
    let req: IDBRequest<TrainableSequence[]>;
    try {
      const store = db.transaction('practice-lines', 'readonly').objectStore('practice-lines');
      req = (studyItemId
        ? store.index('studyItemId').getAll(studyItemId)
        : store.getAll()) as IDBRequest<TrainableSequence[]>;
    } catch (e) {
      recordStudyIdbReadFail('practice-lines', e);
      console.warn('[studyDb] listPracticeLines failed (transaction)', e);
      reject(e);
      return;
    }
    req.onsuccess = () => resolve((req.result as TrainableSequence[] | undefined) ?? []);
    req.onerror   = () => {
      recordStudyIdbReadFail('practice-lines', req.error);
      console.warn('[studyDb] listPracticeLines failed (request)', req.error);
      reject(req.error);
    };
  });
}

export async function deletePracticeLine(id: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction('practice-lines', 'readwrite');
    tx.objectStore('practice-lines').delete(id);
    await txDone(tx, 'delete');
    enqueueStudyDelete('practice-lines', id);
  } catch (e) {
    console.warn('[studyDb] deletePracticeLine failed', e);
  }
}

// --- Position progress ---

export async function savePositionProgress(progress: PositionProgress): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction('position-progress', 'readwrite');
    tx.objectStore('position-progress').put(progress);
    await txDone(tx);
    enqueueStudyPut('position-progress', progress.key, progress, progress.lastAttemptAt || Date.now());
  } catch (e) {
    console.warn('[studyDb] savePositionProgress failed', e);
  }
}

export async function getPositionProgress(key: string): Promise<PositionProgress | undefined> {
  // Un-swallowed (BUG-2026-07-10-008 P2): DATA-INTEGRITY fix. Previously a masked read failure
  // returned undefined, which the drill scheduler (drillView.persistGrading/seedLearnedPositions)
  // treats as a fresh position (level 0) and runs scheduleNext from scratch — silently RESETTING an
  // existing position's spaced-repetition level. Rejecting on a genuine storage failure lets the
  // drill guards skip the persist and preserve the stored level. A genuinely-missing key still
  // resolves undefined from onsuccess (that legitimately-fresh case is unchanged).
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch (e) {
    recordStudyIdbReadFail('position-progress', e);
    console.warn('[studyDb] getPositionProgress failed (db open)', e);
    throw e;
  }
  return new Promise<PositionProgress | undefined>((resolve, reject) => {
    let req: IDBRequest<PositionProgress | undefined>;
    try {
      req = db.transaction('position-progress', 'readonly').objectStore('position-progress').get(key) as IDBRequest<PositionProgress | undefined>;
    } catch (e) {
      recordStudyIdbReadFail('position-progress', e);
      console.warn('[studyDb] getPositionProgress failed (transaction)', e);
      reject(e);
      return;
    }
    req.onsuccess = () => resolve(req.result as PositionProgress | undefined);
    req.onerror   = () => {
      recordStudyIdbReadFail('position-progress', req.error);
      console.warn('[studyDb] getPositionProgress failed (request)', req.error);
      reject(req.error);
    };
  });
}

export async function listDuePositions(now = Date.now()): Promise<PositionProgress[]> {
  // Un-swallowed (BUG-2026-07-10-008 P2): reject on a genuine storage failure for parity with the
  // sibling reads (zero live callers today — free parity). A legitimately empty result still
  // resolves [] from onsuccess.
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch (e) {
    recordStudyIdbReadFail('position-progress', e);
    console.warn('[studyDb] listDuePositions failed (db open)', e);
    throw e;
  }
  return new Promise<PositionProgress[]>((resolve, reject) => {
    let req: IDBRequest<PositionProgress[]>;
    try {
      const index = db.transaction('position-progress', 'readonly')
        .objectStore('position-progress').index('nextDueAt');
      // Get all positions with nextDueAt <= now (due or overdue).
      req = index.getAll(IDBKeyRange.upperBound(now)) as IDBRequest<PositionProgress[]>;
    } catch (e) {
      recordStudyIdbReadFail('position-progress', e);
      console.warn('[studyDb] listDuePositions failed (transaction)', e);
      reject(e);
      return;
    }
    req.onsuccess = () => resolve((req.result as PositionProgress[] | undefined) ?? []);
    req.onerror   = () => {
      recordStudyIdbReadFail('position-progress', req.error);
      console.warn('[studyDb] listDuePositions failed (request)', req.error);
      reject(req.error);
    };
  });
}

export async function listAllPositionProgress(): Promise<PositionProgress[]> {
  // Un-swallowed (BUG-2026-07-10-008 P2): reject on a genuine storage failure instead of masking it
  // as an empty progress set (which the practice dashboard/ORP paths treat as "no progress"). Same
  // posture as listStudies (P1). A legitimately empty store still resolves [] from onsuccess.
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch (e) {
    recordStudyIdbReadFail('position-progress', e);
    console.warn('[studyDb] listAllPositionProgress failed (db open)', e);
    throw e;
  }
  return new Promise<PositionProgress[]>((resolve, reject) => {
    let req: IDBRequest<PositionProgress[]>;
    try {
      req = db.transaction('position-progress', 'readonly').objectStore('position-progress').getAll() as IDBRequest<PositionProgress[]>;
    } catch (e) {
      recordStudyIdbReadFail('position-progress', e);
      console.warn('[studyDb] listAllPositionProgress failed (transaction)', e);
      reject(e);
      return;
    }
    req.onsuccess = () => resolve((req.result as PositionProgress[] | undefined) ?? []);
    req.onerror   = () => {
      recordStudyIdbReadFail('position-progress', req.error);
      console.warn('[studyDb] listAllPositionProgress failed (request)', req.error);
      reject(req.error);
    };
  });
}

// --- Drill attempts ---

export async function saveDrillAttempt(attempt: DrillAttempt): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction('drill-attempts', 'readwrite');
    tx.objectStore('drill-attempts').add(attempt);
    await txDone(tx);
    enqueueStudyPut('drill-attempts', drillAttemptSyncKey(attempt), attempt, attempt.timestamp);
  } catch (e) {
    console.warn('[studyDb] saveDrillAttempt failed', e);
  }
}

export async function listDrillAttempts(positionKey?: string): Promise<DrillAttempt[]> {
  // Un-swallowed (BUG-2026-07-10-008 P2): reject on a genuine storage failure for parity with the
  // sibling reads (zero live callers today — free parity). A legitimately empty store still resolves
  // [] from onsuccess.
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch (e) {
    recordStudyIdbReadFail('drill-attempts', e);
    console.warn('[studyDb] listDrillAttempts failed (db open)', e);
    throw e;
  }
  return new Promise<DrillAttempt[]>((resolve, reject) => {
    let req: IDBRequest<DrillAttempt[]>;
    try {
      const store = db.transaction('drill-attempts', 'readonly').objectStore('drill-attempts');
      req = (positionKey
        ? store.index('positionKey').getAll(positionKey)
        : store.getAll()) as IDBRequest<DrillAttempt[]>;
    } catch (e) {
      recordStudyIdbReadFail('drill-attempts', e);
      console.warn('[studyDb] listDrillAttempts failed (transaction)', e);
      reject(e);
      return;
    }
    req.onsuccess = () => resolve((req.result as DrillAttempt[] | undefined) ?? []);
    req.onerror   = () => {
      recordStudyIdbReadFail('drill-attempts', req.error);
      console.warn('[studyDb] listDrillAttempts failed (request)', req.error);
      reject(req.error);
    };
  });
}

// --- Folders ---

/**
 * Persist a folder record (create or update).
 * Keyed by id. Adapted from lichess-org/lila: ui/study/src/studyChapters.ts group-save pattern.
 */
export async function saveFolder(folder: StudyFolder): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction('folders', 'readwrite');
    tx.objectStore('folders').put(folder);
    await txDone(tx);
    enqueueStudyPut('folders', folder.id, folder, folder.updatedAt);
  } catch (e) {
    console.warn('[studyDb] saveFolder failed', e);
  }
}

export async function getFolder(id: string): Promise<StudyFolder | undefined> {
  // Un-swallowed (BUG-2026-07-10-008 P2): reject on a genuine storage failure for parity with the
  // sibling getters (zero live callers today — free parity). A genuinely-missing key still resolves
  // undefined from onsuccess.
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch (e) {
    recordStudyIdbReadFail('folders', e);
    console.warn('[studyDb] getFolder failed (db open)', e);
    throw e;
  }
  return new Promise<StudyFolder | undefined>((resolve, reject) => {
    let req: IDBRequest<StudyFolder | undefined>;
    try {
      req = db.transaction('folders', 'readonly').objectStore('folders').get(id) as IDBRequest<StudyFolder | undefined>;
    } catch (e) {
      recordStudyIdbReadFail('folders', e);
      console.warn('[studyDb] getFolder failed (transaction)', e);
      reject(e);
      return;
    }
    req.onsuccess = () => resolve(req.result as StudyFolder | undefined);
    req.onerror   = () => {
      recordStudyIdbReadFail('folders', req.error);
      console.warn('[studyDb] getFolder failed (request)', req.error);
      reject(req.error);
    };
  });
}

export async function listFolders(): Promise<StudyFolder[]> {
  // Un-swallowed (BUG-2026-07-10-008 P1): a genuine storage failure must REJECT rather than
  // masking it as a flat/empty folder tree. Same posture as listStudies above — the folder
  // caller (studyCtrl.loadFolders) already self-heals a rejection by not latching
  // `_foldersLoaded` and clearing its in-flight promise, so a later render retries. A
  // legitimately empty store still resolves [] from onsuccess.
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch (e) {
    recordStudyIdbReadFail('folders', e);
    console.warn('[studyDb] listFolders failed (db open)', e);
    throw e;
  }
  return new Promise<StudyFolder[]>((resolve, reject) => {
    let req: IDBRequest<StudyFolder[]>;
    try {
      req = db.transaction('folders', 'readonly').objectStore('folders').getAll() as IDBRequest<StudyFolder[]>;
    } catch (e) {
      recordStudyIdbReadFail('folders', e);
      console.warn('[studyDb] listFolders failed (transaction)', e);
      reject(e);
      return;
    }
    req.onsuccess = () => resolve((req.result as StudyFolder[] | undefined) ?? []);
    req.onerror   = () => {
      recordStudyIdbReadFail('folders', req.error);
      console.warn('[studyDb] listFolders failed (request)', req.error);
      reject(req.error);
    };
  });
}

export async function deleteFolder(id: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction('folders', 'readwrite');
    tx.objectStore('folders').delete(id);
    await txDone(tx, 'delete');
    enqueueStudyDelete('folders', id);
  } catch (e) {
    console.warn('[studyDb] deleteFolder failed', e);
  }
}







/**
 * Derive the effective home-folder id for a StudyItem. `homeFolderId` is `undefined` on every
 * item written before this field existed — that legacy state (NOT an explicit "no home") derives
 * to the first entry of `folders[]` (insertion order), or `null` if `folders` is empty (unfiled
 * -> section-derived placement). An explicit `null` already stored on the record (set by
 * `promoteOrClearHomeOnRemoval` in studyCtrl.ts when no alias remains after a home-folder
 * removal) is authoritative and returned as-is — it must never be re-derived back to
 * `folders[0]`.
 *
 * Pure and non-destructive: this is a READ-TIME default only — it does not persist anything.
 * Mirrors the read-time-safe posture of `planStudyFolderMigration`/`migrateStudyFolders` above
 * without forcing a batch rewrite of every legacy item just to backfill this field; the
 * studyCtrl.ts semantics functions persist an explicit value going forward once they touch a
 * record (e.g. `rehomeGame`, `promoteOrClearHomeOnRemoval`).
 */
export function deriveHomeFolderId(
  item: Pick<StudyItem, 'homeFolderId' | 'folders'>,
): string | null {
  if (item.homeFolderId !== undefined) return item.homeFolderId;
  // Same defensive treatment as planStudyFolderMigration below: IDB does not enforce TS types at
  // read time, so a legacy or partially-written record may lack `.folders` entirely.
  const folders = item.folders ?? [];
  return folders.length > 0 ? folders[0]! : null;
}









export interface FolderMigrationCollision {
  name: string;
  matchCount: number;
  resolvedFolderId: string;
}

export interface FolderMigrationPlan {
  /** StudyItem.id -> rewritten `.folders` array; present only for items that actually changed. */
  itemUpdates: Map<string, string[]>;
  /** New StudyFolder records to persist for names with no backing record — the confirmed orphan
   *  case (a name typed directly into `.folders` with no StudyFolder record ever created). */
  newFolders: StudyFolder[];
  /** Name collisions resolved during planning (earliest `createdAt` won), for diagnostics. */
  collisions: FolderMigrationCollision[];
}

/**
 * Pure planning step for the StudyItem.folders name->id migration (P2-LIB-11). Given the
 * currently-persisted folder records and a batch of study items, computes which items need
 * their `.folders` array rewritten from names to ids, which brand-new StudyFolder records must
 * be synthesized for orphaned names, and which name collisions were resolved. Never drops a
 * membership entry: an unmatched name always synthesizes a folder; a name matching two or more
 * records resolves to the earliest-created match, deterministically, never a silent guess.
 *
 * Idempotent and self-detecting: an entry that already equals a known folder id is left alone,
 * so re-running against already-migrated items returns an empty plan (no IDB writes needed) —
 * this also means it is safe to call on every library load rather than gated behind a one-time
 * flag, which self-heals any name-based entry a not-yet-updated caller creates later (T5-D02
 * finishes repointing every UI call site at ids).
 */
export function planStudyFolderMigration(
  items: readonly StudyItem[],
  existingFolders: readonly StudyFolder[],
  now: number = Date.now(),
): FolderMigrationPlan {
  const knownIds = new Set(existingFolders.map(f => f.id));
  const byName = new Map<string, StudyFolder[]>();
  for (const f of existingFolders) {
    const list = byName.get(f.name);
    if (list) list.push(f); else byName.set(f.name, [f]);
  }

  const itemUpdates = new Map<string, string[]>();
  const newFolders: StudyFolder[] = [];
  const collisions: FolderMigrationCollision[] = [];
  let synthSeq = 0;

  const resolveName = (name: string): string => {
    const matches = byName.get(name);
    if (!matches || matches.length === 0) {
      const synthesized: StudyFolder = {
        id:        `folder_${now}_${synthSeq++}`,
        name,
        createdAt: now,
        updatedAt: now,
      };
      byName.set(name, [synthesized]);
      knownIds.add(synthesized.id);
      newFolders.push(synthesized);
      return synthesized.id;
    }
    if (matches.length === 1) return matches[0]!.id;
    const earliest = [...matches].sort((a, b) => a.createdAt - b.createdAt)[0]!;
    collisions.push({ name, matchCount: matches.length, resolvedFolderId: earliest.id });
    return earliest.id;
  };

  for (const item of items) {





    const itemFolders = item.folders ?? [];
    if (itemFolders.length === 0) continue;
    if (itemFolders.every(entry => knownIds.has(entry))) continue;
    const seen = new Set<string>();
    const next: string[] = [];
    for (const entry of itemFolders) {
      const id = knownIds.has(entry) ? entry : resolveName(entry);
      if (!seen.has(id)) { seen.add(id); next.push(id); }
    }
    itemUpdates.set(item.id, next);
  }

  return { itemUpdates, newFolders, collisions };
}

function recordFolderMigrationCollision(collision: FolderMigrationCollision): void {
  record({
    kind: 'idb',
    severity: Severity.Warn,
    source: 'study/studyDb',
    sourceTag: 'folder-migration-name-collision',
    message: 'folder-migration-name-collision',
    metadata: {
      name: collision.name,
      matchCount: collision.matchCount,
      resolvedFolderId: collision.resolvedFolderId,
    },
    redactionClass: 'safe',
  });
}

/**
 * Apply a FolderMigrationPlan: persist synthesized folder records, log any collisions, then
 * rewrite + persist each affected StudyItem. Mutates `items` in place by index (same shape
 * callers already keep for in-memory study lists).
 */
export async function applyStudyFolderMigrationPlan(
  items: StudyItem[],
  plan: FolderMigrationPlan,
): Promise<void> {
  for (const folder of plan.newFolders) {
    await saveFolder(folder);
  }
  for (const collision of plan.collisions) {
    recordFolderMigrationCollision(collision);
  }
  for (let i = 0; i < items.length; i++) {
    const nextFolders = plan.itemUpdates.get(items[i]!.id);
    if (!nextFolders) continue;
    const migrated: StudyItem = { ...items[i]!, folders: nextFolders };
    items[i] = migrated;
    await saveStudy(migrated);
  }
}

/**
 * Plan and apply the folder-ID migration for a batch of already-loaded StudyItems in one call.
 * Returns the folder list the caller should hold onto afterward (existingFolders plus any newly
 * synthesized records) — callers keep this as their in-memory folder state.
 */
export async function migrateStudyFolders(
  items: StudyItem[],
  existingFolders: readonly StudyFolder[],
): Promise<StudyFolder[]> {
  const plan = planStudyFolderMigration(items, existingFolders);
  if (plan.newFolders.length === 0 && plan.itemUpdates.size === 0) return [...existingFolders];
  await applyStudyFolderMigrationPlan(items, plan);
  return [...existingFolders, ...plan.newFolders];
}
