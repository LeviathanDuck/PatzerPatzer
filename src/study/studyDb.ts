// Study Library IDB persistence — CRUD for studies, practice-lines, position-progress, drill-attempts, folders.
// Uses the shared 'chess-patzer' database opened by src/idb/index.ts.
// Adapted from lichess-org/lila: ui/analyse/src/idbTree.ts cursor patterns.

import { DB_NAME, DB_VERSION, upgradeGameDbSchema } from '../idb/index';
import { compileGameFilterQuery, type CompiledGameFilterEvaluator } from '../gameFilters/filterCore';
import type { GameFilterDateRange, GameFilterProjection, GameFilterQuery } from '../gameFilters/types';
import type { StudyItem, TrainableSequence, PositionProgress, DrillAttempt, StudyFolder } from './types';
import { enqueueRemoteSyncDelete, enqueueRemoteSyncUpsert, type RemoteSyncStoreName } from '../sync/remoteSync';
import { record, Severity } from '../diagnostics';
import { isHidden } from './hiddenItems';
import type {
  SrsScheduleRecord,
  SrsAttemptRecord,
  SrsTraversalPlan,
  SrsPracticeSessionRow,
  SrsSessionState,
  SrsSessionProgress,
  SrsPersistenceResult,
  SrsPersistenceFailure,
  SrsPersistenceFailureCode,
  SrsLadderConfig,
  SrsValidatedLadderConfig,
  SrsSourceVersion,
  SrsAttemptServiceResult,
  SrsAttemptServiceRejected,
} from './practice/srsTypes';
import {
  asPersistableScheduleRecord,
  asPersistableAttemptRecord,
  validateLadderConfig,
  transitionSchedule,
} from './practice/scheduler';
import { revalidateTraversalPlan } from './practice/sessionBuilder';
import { planLegacyMigration, validateReviewedPathMappingEntries } from './practice/migration';
import type {
  LegacyReviewedPathMapping,
  LegacyMigrationPlanResult,
  LegacyMigrationDecisionAuthorityEntry,
} from './practice/migration';
import { stampLinkedSourceProvenance } from './practice/linkedSource';
import { acceptedPlan } from './practice/linkedStudyMerge';
import type {
  AcceptedMergePlan,
  MergePlan,
  LocalMergeState,
  LocalDecisionState,
} from './practice/linkedStudyMerge';

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







  try {
    if (error instanceof DOMException) {
      try { return error.name || 'DOMException'; } catch { return 'DOMException'; }
    }
    if (error instanceof Error) {
      try {
        if (error.name) return error.name;
      } catch { /* hostile `name` accessor — fall through to the constructor name */ }
      try {
        const ctorName = error.constructor?.name;
        if (ctorName) return ctorName;
      } catch { /* hostile `constructor` accessor — fall through to the neutral fallback */ }
      return 'Error';
    }
    return typeof error;
  } catch {
    return 'UnknownError';
  }
}











function safeDiag(v: unknown): string {
  try {
    return String(v);
  } catch {
    return `<uncoercible ${typeof v}>`;
  }
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














interface SrsCompletionApplied {
  readonly nextSchedule: SrsScheduleRecord;
  readonly nextSession: SrsPracticeSessionRow;
}

interface StudyPracticeOutboxItem {
  readonly store: RemoteSyncStoreName;
  readonly itemKey: string;
  readonly payload: unknown;
  readonly updatedAt: number;
}

/** The outbox upserts a committed completion produces: the appended attempt, the advanced SRS row,
 *  and the advanced session checkpoint. Keys mirror the durable store key paths exactly
 *  (attemptId / targetId / sessionId); `targetId` is the decision UUID (never a `decisionId` field). */
export function buildSrsCompletionOutboxItems(
  applied: SrsCompletionApplied,
  attempt: SrsAttemptRecord,
): readonly StudyPracticeOutboxItem[] {
  return [
    { store: 'study-practice-attempts', itemKey: attempt.attemptId, payload: attempt, updatedAt: attempt.completedAt },
    { store: 'study-practice-srs', itemKey: applied.nextSchedule.targetId, payload: applied.nextSchedule, updatedAt: applied.nextSchedule.updatedAt },
    { store: 'study-practice-sessions', itemKey: applied.nextSession.sessionId, payload: applied.nextSession, updatedAt: applied.nextSession.updatedAt },
  ];
}

/** The outbox upserts a committed enrollment produces: the lesson, each decision-identity row, and
 *  each initial SRS schedule row, in parent-before-child order (lesson → decisions → srs). */
export function buildEnrollmentOutboxItems(
  lesson: StudyPracticeLessonRow,
  decisions: readonly StudyPracticeDecisionRow[],
  srsRows: readonly SrsScheduleRecord[],
): readonly StudyPracticeOutboxItem[] {
  const items: StudyPracticeOutboxItem[] = [
    { store: 'study-practice-lessons', itemKey: lesson.lessonId, payload: lesson, updatedAt: lesson.updatedAt },
  ];
  for (const decision of decisions) {
    items.push({
      store: 'study-practice-decisions',
      itemKey: decision.decisionId,
      payload: decision,
      updatedAt: decision.updatedAt ?? lesson.updatedAt,
    });
  }
  for (const row of srsRows) {
    items.push({ store: 'study-practice-srs', itemKey: row.targetId, payload: row, updatedAt: row.updatedAt });
  }
  return items;
}

function enqueueStudyPracticeOutboxItems(items: readonly StudyPracticeOutboxItem[]): void {
  for (const item of items) {
    enqueueStudyPut(item.store, item.itemKey, item.payload, item.updatedAt);
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
    await saveStudyStrict(item);
  } catch (e) {
    console.warn('[studyDb] saveStudy failed', e);
  }
}

/**
 * Persist a StudyItem or reject. User-initiated save flows use this seam so a
 * generated item cannot be presented as saved before its IndexedDB transaction
 * commits. `saveStudy` above deliberately remains the named best-effort wrapper
 * for legacy/background callers that have not yet adopted fail-closed handling.
 */
export async function saveStudyStrict(item: StudyItem): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('studies', 'readwrite');
  const transactionDone = txDone(tx, 'put');
  const request = tx.objectStore('studies').put(item);
  const requestDone = new Promise<void>((resolve, reject) => {
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  await Promise.all([requestDone, transactionDone]);
  enqueueStudyPut('studies', item.id, item, item.updatedAt);
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






















type StudyPracticeStoreName =
  | 'study-practice-lessons'
  | 'study-practice-decisions'
  | 'study-practice-srs'
  | 'study-practice-attempts'
  | 'study-practice-sessions';

/**
 * Minimal persistence-boundary row shape for `study-practice-lessons`. The canonical authored-lesson
 * contract (roles, prompts, hints, trainability) arrives with Package D / D1; B4a only needs the key
 * plus the §14.1 indexed fields to provide additive CRUD, so this is intentionally a structural
 * superset-friendly shape (extra authored fields are preserved untouched on round-trip).
 */
export interface StudyPracticeLessonRow {
  /** Primary key; caller-generated UUID. */
  readonly lessonId: string;
  /** Indexed — owning Study item. */
  readonly studyItemId: string;
  /** Compound-index component (`[studyItemId, chapterId]`); absent rows just skip that index. */
  readonly chapterId?: string;
  /** Indexed — last mutation instant, UTC epoch ms. */
  readonly updatedAt: number;
}













export interface StudyPracticeDecisionRow {
  /** Primary key; caller-generated UUID (the durable Required-decision identity). */
  readonly decisionId: string;
  /** Indexed — owning lesson. */
  readonly lessonId: string;
  /** Compound-index component (`[lessonId, chapterId]`). */
  readonly chapterId?: string;
  /** Indexed — source lineage grouping key. */
  readonly sourceLineageId: string;
  /** Indexed — decision lifecycle status. */
  readonly status: string;
  /** Last mutation instant, UTC epoch ms. */
  readonly updatedAt?: number;
  /** Exact authored node-id path (continuity key part 1; 2-char ids concatenated). */
  readonly authoredPath?: string;
  /** Expected authored move (continuity key part 2). */
  readonly uci?: string;
  /** Persisted authored `BranchRole` (validated back into the union on read). */
  readonly role?: string;
  /** Persisted authored `DecisionTrainability` (validated back into the union on read). */
  readonly trainability?: string;
}

function recordPracticeIdbReadFail(storeName: StudyPracticeStoreName, error: unknown): void {
  record({
    kind: 'idb',
    severity: Severity.Error,
    source: 'study/studyDb',
    sourceTag: 'study-practice-idb-read-fail',
    message: 'study-practice-idb-read-fail',
    metadata: {
      storeName,
      errorClass: classifyStudyError(error),
      route: studyRouteLabel(),
    },
    redactionClass: 'safe',
  });
}















async function practicePut(storeName: StudyPracticeStoreName, value: unknown): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readwrite');
  const done = txDone(tx, 'put');
  tx.objectStore(storeName).put(value);
  await done;
}








async function practiceAdd(
  storeName: StudyPracticeStoreName,
  value: unknown,
): Promise<{ readonly duplicate: boolean }> {
  const db = await openDb();
  return new Promise<{ readonly duplicate: boolean }>((resolve, reject) => {
    let duplicate = false;
    let tx: IDBTransaction;
    try {
      tx = db.transaction(storeName, 'readwrite');
    } catch (e) {
      reject(e);
      return;
    }
    let req: IDBRequest;
    try {
      req = tx.objectStore(storeName).add(value);
    } catch (e) {
      reject(e);
      return;
    }
    req.onerror = (event: Event) => {
      const err = req.error;
      if (err && err.name === 'ConstraintError') {
        // Duplicate key: keep the first-write truth. Prevent the default abort so the tx completes.
        duplicate = true;
        event.preventDefault();
      }
      // Any other error is left to abort the transaction (handled by tx.onabort/onerror below).
    };
    tx.oncomplete = () => resolve({ duplicate });
    tx.onerror = () => {







      if (duplicate) return;
      recordStudyTxFail(tx, 'onerror', 'add');
      reject(tx.error);
    };
    tx.onabort = () => {
      if (duplicate) { resolve({ duplicate: true }); return; }
      recordStudyTxFail(tx, 'onabort', 'add');
      reject(tx.error ?? new DOMException(`Practice add (${storeName}) transaction aborted`, 'AbortError'));
    };
  });
}

async function practiceDelete(storeName: StudyPracticeStoreName, key: IDBValidKey): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readwrite');
  const done = txDone(tx, 'delete');
  tx.objectStore(storeName).delete(key);
  await done;
}

async function practiceGet<T>(storeName: StudyPracticeStoreName, key: IDBValidKey): Promise<T | undefined> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch (e) {
    recordPracticeIdbReadFail(storeName, e);
    throw e;
  }
  return new Promise<T | undefined>((resolve, reject) => {
    let req: IDBRequest<T | undefined>;
    try {
      req = db.transaction(storeName, 'readonly').objectStore(storeName).get(key) as IDBRequest<T | undefined>;
    } catch (e) {
      recordPracticeIdbReadFail(storeName, e);
      reject(e);
      return;
    }
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      recordPracticeIdbReadFail(storeName, req.error);
      reject(req.error);
    };
  });
}

/**
 * Bounded index cursor collector for the practice stores. Walks `index(indexName).openCursor(range,
 * direction)` (or the object store when `indexName` is null), collecting at most `limit` records that
 * pass the optional `accept` filter, then STOPS driving the cursor and settles from `tx.oncomplete`
 * (never from the cursor callback) — the same abort-safe pattern as `collectStudyPaginatedCursor`
 * (BUG-2026-07-10-001). This is the ONLY read path for practice list/due queries; there is no
 * unbounded getAll() (memo risk #11 / CR-2).
 */
function collectBoundedPracticeCursor<T>(
  db: IDBDatabase,
  storeName: StudyPracticeStoreName,
  indexName: string | null,
  range: IDBKeyRange | null,
  direction: IDBCursorDirection,
  limit: number,
  accept?: (value: T) => boolean,
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let completedResult: T[] | undefined;
    const results: T[] = [];

    const settleResolve = (r: T[]): void => { if (!settled) { settled = true; resolve(r); } };
    const settleReject = (e: unknown): void => { if (!settled) { settled = true; reject(e); } };

    // A non-positive/non-finite limit reads nothing (bounded by contract; never an unbounded scan).
    if (!Number.isFinite(limit) || limit <= 0) { resolve([]); return; }

    let tx: IDBTransaction;
    try {
      tx = db.transaction(storeName, 'readonly');
    } catch (error) {
      settleReject(error);
      return;
    }

    tx.oncomplete = () => {
      if (completedResult !== undefined) settleResolve(completedResult);
      else settleReject(new Error(
        `Practice cursor (${storeName}) transaction completed before settling a result (coding invariant violation)`,
      ));
    };
    tx.onerror = () => {
      recordStudyTxFail(tx, 'onerror', 'read');
      settleReject(tx.error ?? new Error(`Practice cursor (${storeName}) transaction failed`));
    };
    tx.onabort = () => {
      recordStudyTxFail(tx, 'onabort', 'read');
      settleReject(tx.error ?? new DOMException(`Practice cursor (${storeName}) transaction aborted`, 'AbortError'));
    };

    let cursorRequest: IDBRequest<IDBCursorWithValue | null>;
    try {
      const store = tx.objectStore(storeName);
      const source: IDBObjectStore | IDBIndex = indexName ? store.index(indexName) : store;
      cursorRequest = source.openCursor(range, direction);
    } catch (error) {
      settleReject(error);
      try { tx.abort(); } catch { /* may already be inactive */ }
      return;
    }

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) { completedResult = results; return; }
      const value = cursor.value as T;
      if (!accept || accept(value)) {
        results.push(value);
        if (results.length >= limit) {
          // Cap reached: record and stop driving the cursor; auto-commit fires tx.oncomplete.
          completedResult = results;
          return;
        }
      }
      try {
        cursor.continue();
      } catch (error) {
        settleReject(error);
        try { tx.abort(); } catch { /* may already be inactive */ }
      }
    };
    cursorRequest.onerror = () => {
      settleReject(cursorRequest.error ?? tx.error ?? new Error(`Practice cursor (${storeName}) failed`));
    };
  });
}

// --- study-practice-lessons ------------------------------------------------

export function savePracticeLesson(row: StudyPracticeLessonRow): Promise<void> {
  return practicePut('study-practice-lessons', row);
}
export function getPracticeLesson(lessonId: string): Promise<StudyPracticeLessonRow | undefined> {
  return practiceGet<StudyPracticeLessonRow>('study-practice-lessons', lessonId);
}
export function deletePracticeLesson(lessonId: string): Promise<void> {
  return practiceDelete('study-practice-lessons', lessonId);
}
/** Bounded list of a Study item's lessons via the `studyItemId` index. */
export async function listPracticeLessonsByStudyItem(
  studyItemId: string,
  limit: number,
): Promise<StudyPracticeLessonRow[]> {
  const db = await openDb();
  return collectBoundedPracticeCursor<StudyPracticeLessonRow>(
    db, 'study-practice-lessons', 'studyItemId', IDBKeyRange.only(studyItemId), 'next', limit,
  );
}

// --- study-practice-decisions ----------------------------------------------

export function savePracticeDecision(row: StudyPracticeDecisionRow): Promise<void> {
  return practicePut('study-practice-decisions', row);
}
export function getPracticeDecision(decisionId: string): Promise<StudyPracticeDecisionRow | undefined> {
  return practiceGet<StudyPracticeDecisionRow>('study-practice-decisions', decisionId);
}
export function deletePracticeDecision(decisionId: string): Promise<void> {
  return practiceDelete('study-practice-decisions', decisionId);
}
/** Bounded list of a lesson's decisions via the `lessonId` index. */
export async function listPracticeDecisionsByLesson(
  lessonId: string,
  limit: number,
): Promise<StudyPracticeDecisionRow[]> {
  const db = await openDb();
  return collectBoundedPracticeCursor<StudyPracticeDecisionRow>(
    db, 'study-practice-decisions', 'lessonId', IDBKeyRange.only(lessonId), 'next', limit,
  );
}

// --- study-practice-srs ----------------------------------------------------

/** Persist a schedule row. Funnels through the B1 closed-record guard so no chess material can be
 *  smuggled onto the row. The store key path is `targetId` (== decisionId). */
export function savePracticeSrs(schedule: SrsScheduleRecord): Promise<void> {
  return practicePut('study-practice-srs', asPersistableScheduleRecord(schedule));
}
export function getPracticeSrs(targetId: string): Promise<SrsScheduleRecord | undefined> {
  return practiceGet<SrsScheduleRecord>('study-practice-srs', targetId);
}
export function deletePracticeSrs(targetId: string): Promise<void> {
  return practiceDelete('study-practice-srs', targetId);
}
/**
 * Bounded due query: active schedule rows with `dueAt <= now`, honoring the due-boundary contract
 * (`status === 'active' && dueAt <= now`). Uses the `[lessonId, dueAt]` compound index when a
 * `lessonId` scope is given, otherwise the `dueAt` index. Non-active rows (which may still carry a
 * concrete `dueAt`) are filtered out in the cursor so only genuinely due targets are returned.
 */
export async function listDuePracticeSrs(params: {
  now: number;
  limit: number;
  lessonId?: string;
}): Promise<SrsPersistenceResult<SrsScheduleRecord[]>> {
  const { now, limit, lessonId } = params;








  if (!Number.isFinite(now)) {
    return { ok: false, failure: mkFail('non-finite-number', 'listDuePracticeSrs.now', `due-query clock \`now\` must be finite, got ${safeDiag(now)}`) };
  }
  const db = await openDb();
  const acceptActiveDue = (r: SrsScheduleRecord): boolean =>
    r.status === 'active' && typeof r.dueAt === 'number' && Number.isFinite(r.dueAt) && r.dueAt <= now;
  if (lessonId !== undefined) {
    const range = IDBKeyRange.bound([lessonId, Number.NEGATIVE_INFINITY], [lessonId, now]);
    const value = await collectBoundedPracticeCursor<SrsScheduleRecord>(
      db, 'study-practice-srs', 'lessonId_dueAt', range, 'next', limit, acceptActiveDue,
    );
    return { ok: true, value };
  }
  const range = IDBKeyRange.upperBound(now);
  const value = await collectBoundedPracticeCursor<SrsScheduleRecord>(
    db, 'study-practice-srs', 'dueAt', range, 'next', limit, acceptActiveDue,
  );
  return { ok: true, value };
}






















export async function planStudyPracticeMigration(
  mapping: LegacyReviewedPathMapping,
): Promise<LegacyMigrationPlanResult> {









  let capturedMapping: LegacyReviewedPathMapping;
  try {
    capturedMapping = structuredClone(mapping);
  } catch (e) {
    return { ok: false, failure: { code: 'capture-failed', path: 'mapping', reason: `migration mapping could not be snapshotted (hostile getter / uncloneable value): ${safeDiag(e)}` } };
  }
  if (!isPlainObject(capturedMapping)) {
    return { ok: false, failure: { code: 'not-an-object', path: 'mapping', reason: 'migration mapping is not a plain object' } };
  }
  const capturedEntries = capturedMapping.entries;
  if (!Array.isArray(capturedEntries)) {
    return { ok: false, failure: { code: 'not-an-array', path: 'mapping.entries', reason: 'mapping.entries is not an array' } };
  }













  const structuralRes = validateReviewedPathMappingEntries(capturedEntries, 'mapping', null);
  if (!structuralRes.ok) return { ok: false, failure: structuralRes.failure };

  // Capture + structural validation succeeded — only now perform the bounded legacy/authority/enrollment
  // reads, using EXCLUSIVELY the canonical getter-free capture.
  const legacyRecords = await listAllPositionProgress();
  // Bounded probe over exactly the explicitly-mapped decision ids (mapping-sized, indexed primary-key
  // gets), never an unbounded SRS/decisions scan. One pass builds both the already-enrolled set and the
  // decision/lesson authority. Each `decisionId` is read once from the getter-free capture.
  const mappedTargetIds = new Set<string>();
  for (const entry of capturedEntries) {
    const decisionId = entry?.decisionId;
    if (typeof decisionId === 'string' && decisionId.length > 0) {
      mappedTargetIds.add(decisionId);
    }
  }
  const alreadyEnrolledTargetIds: string[] = [];
  const authorityDecisions: LegacyMigrationDecisionAuthorityEntry[] = [];
  for (const targetId of mappedTargetIds) {
    const existing = await getPracticeSrs(targetId);
    if (existing !== undefined) alreadyEnrolledTargetIds.push(targetId);
    // Referential-integrity authority: the canonical decision row's owning lessonId (bounded get). A
    // decisionId with no row is omitted, so the planner fails the mapping with `unknown-decision`.
    const decisionRow = await getPracticeDecision(targetId);
    if (decisionRow !== undefined) {
      authorityDecisions.push({ decisionId: decisionRow.decisionId, lessonId: decisionRow.lessonId });
    }
  }
  return planLegacyMigration({
    legacyRecords,
    mapping: capturedMapping,
    alreadyEnrolledTargetIds,
    decisionAuthority: { decisions: authorityDecisions },
  });
}

// --- study-practice-attempts (append-only) ---------------------------------







export async function savePracticeAttempt(
  attempt: SrsAttemptRecord,
): Promise<SrsPersistenceResult<SrsAttemptRecord>> {













  const { attemptId, ...rest } = asPersistableAttemptRecord(attempt);
  const { duplicate } = await practiceAdd('study-practice-attempts', { attemptId, ...rest });
  if (duplicate) {
    return { ok: false, failure: mkFail('duplicate-identity', 'attempt.attemptId', `attempt "${safeDiag(attemptId)}" already exists; append-only store never overwrites`) };
  }
  return { ok: true, value: attempt };
}
export function getPracticeAttempt(attemptId: string): Promise<SrsAttemptRecord | undefined> {
  return practiceGet<SrsAttemptRecord>('study-practice-attempts', attemptId);
}
/** Bounded attempt history for one decision via the `decisionId` index (key path `targetId`). */
export async function listPracticeAttemptsByDecision(
  targetId: string,
  limit: number,
): Promise<SrsAttemptRecord[]> {
  const db = await openDb();
  return collectBoundedPracticeCursor<SrsAttemptRecord>(
    db, 'study-practice-attempts', 'decisionId', IDBKeyRange.only(targetId), 'next', limit,
  );
}
/** Bounded attempt list for one session via the `sessionId` index. */
export async function listPracticeAttemptsBySession(
  sessionId: string,
  limit: number,
): Promise<SrsAttemptRecord[]> {
  const db = await openDb();
  return collectBoundedPracticeCursor<SrsAttemptRecord>(
    db, 'study-practice-attempts', 'sessionId', IDBKeyRange.only(sessionId), 'next', limit,
  );
}

// --- Persistence-boundary validation (closes the four recorded B4 residuals) ----
//
// Deserialized IndexedDB rows are UNTRUSTED. These validators treat the input as `unknown`, prove
// every field before dereferencing it, and report a TYPED SrsPersistenceFailure rather than throwing.
// The four recorded B4 residuals (B3F2/B3F3/B3F4 SOL reviews) are closed here at the READ boundary:
//   (a) validatePersistedTraversalPlan validates the COMPLETE plan shape AND cross-list identity
//       (entries ∪ context ∪ repair targetId uniqueness) before any consumer invokes B3 revalidation;
//   (b) only planVersion === 1 is recognized — a missing/unknown version is rejected, never coerced;
//       every numeric field is finite-checked (non-finite fails closed);
//   (c) required identity/display strings B3 accepts when omitted are rejected here — frozen
//       `targetId`, `lessonId`, `status` (active-only), and display `label`;
//   (d) any malformed top-level/list/entry shape returns a typed failure; a defensive try/catch turns
//       even an unexpected throw into a typed failure so the boundary NEVER throws raw.

function mkFail(code: SrsPersistenceFailureCode, path: string, reason: string): SrsPersistenceFailure {
  return { code, path, reason };
}





function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}







function rejectUnknownKeys(v: Record<string, unknown>, allowed: readonly string[], path: string): SrsPersistenceFailure | null {
  const allow = new Set<string>(allowed);
  for (const key of Object.getOwnPropertyNames(v)) {
    if (key === '__proto__') return mkFail('unknown-key', `${path}.__proto__`, 'row carries an own __proto__ payload');
    if (!allow.has(key)) return mkFail('unknown-key', `${path}.${key}`, `undeclared own key "${key}" is not part of the contract`);
  }
  return null;
}
function isNonEmptyString(v: unknown): boolean {
  return typeof v === 'string' && v.length > 0;
}
function isFiniteNumber(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v);
}









function isSafeCounter(v: unknown): boolean {
  return typeof v === 'number' && Number.isSafeInteger(v);
}
// Fields the sealed scheduler actually increments by +1 — `scheduleRevision` and `cleanStreak`
// (scheduler.ts `transitionSchedule`/`buildActiveNext`/`buildGraduatedNext`). These additionally reject
// the MAX_SAFE_INTEGER boundary itself so the applied transition's `+1` stays a representable safe integer
// and the token genuinely advances. MAX_SAFE_INTEGER adjudication: ACCEPT it for compared-only counters
// (`isSafeCounter`), REJECT it for incremented counters (this helper) — the reading that keeps `+1` sound.
function isIncrementableSafeCounter(v: unknown): boolean {
  return typeof v === 'number' && Number.isSafeInteger(v) && v < Number.MAX_SAFE_INTEGER;
}










function rejectNonIndexArrayKeys(arr: readonly unknown[], path: string): SrsPersistenceFailure | null {
  const len = arr.length;
  for (const key of Object.getOwnPropertyNames(arr)) {
    if (key === 'length') continue;
    const idx = Number(key);
    if (!Number.isInteger(idx) || idx < 0 || idx >= len || String(idx) !== key) {
      return mkFail('unknown-key', `${path}.${key}`, `${path} carries a non-index own property "${key}"`);
    }
  }
  return null;
}

const SOURCE_LINKED_KEYS = ['kind', 'sourceRevision'] as const;
const SOURCE_UNLINKED_KEYS = ['kind', 'origin'] as const;


const UNLINKED_ORIGINS: ReadonlySet<string> = new Set(['manual', 'snapshot-import', 'unlinked-from-source']);
const DISPLAY_SNAPSHOT_KEYS = ['label', 'sourceLabel', 'source'] as const;
const FROZEN_SCHEDULE_KEYS = [
  'targetId', 'lessonId', 'targetRevision', 'scheduleRevision', 'configId', 'configVersion',
  'stepIndex', 'status', 'dueAt', 'source', 'capturedAt',
] as const;
const PLAN_ENTRY_KEYS = ['targetId', 'lessonId', 'reviewKind', 'frozenSchedule', 'frozenSource'] as const;
const CONTEXT_ENTRY_KEYS = ['targetId', 'lessonId', 'frozenSource', 'scheduleNeutral'] as const;
const REPAIR_ENTRY_KEYS = ['targetId', 'lessonId', 'frozenSource', 'scheduleNeutral', 'failedMoveKeys'] as const;
const PLAN_KEYS = ['planVersion', 'sessionId', 'traversalId', 'createdAt', 'entries', 'context', 'repair'] as const;
const PROGRESS_KEYS = ['entryCursor', 'completedTargetIds', 'appliedAttemptIds'] as const;
const SESSION_ROW_KEYS = ['sessionId', 'lessonId', 'state', 'updatedAt', 'createdAt', 'progress', 'targetCount', 'plan'] as const;

/** Validate a discriminated `SrsSourceVersion` union. Returns a failure or null. */
function validateSourceVersion(v: unknown, path: string): SrsPersistenceFailure | null {
  if (!isPlainObject(v)) return mkFail('not-an-object', path, 'source version is not an object');
  if (v.kind === 'linked') {
    const extra = rejectUnknownKeys(v, SOURCE_LINKED_KEYS, path);
    if (extra) return extra;
    if (!isSafeCounter(v.sourceRevision)) {
      return mkFail('non-finite-number', `${path}.sourceRevision`, 'linked sourceRevision must be a safe-integer revision counter');
    }
    return null;
  }
  if (v.kind === 'unlinked') {
    const extra = rejectUnknownKeys(v, SOURCE_UNLINKED_KEYS, path);
    if (extra) return extra;






    if (v.origin !== undefined && (typeof v.origin !== 'string' || !UNLINKED_ORIGINS.has(v.origin))) {
      return mkFail('invalid-status', `${path}.origin`, `unlinked origin must be manual|snapshot-import|unlinked-from-source, got ${safeDiag(v.origin)}`);
    }
    return null;
  }
  return mkFail('invalid-source-discriminant', `${path}.kind`, `unknown source discriminant: ${safeDiag(v.kind)}`);
}

/** Validate an `SrsDisplaySnapshot` (source-side snapshot). Requires a non-empty `label` (residual c). */
function validateDisplaySnapshot(v: unknown, path: string): SrsPersistenceFailure | null {
  if (!isPlainObject(v)) return mkFail('not-an-object', path, 'display snapshot is not an object');
  const extra = rejectUnknownKeys(v, DISPLAY_SNAPSHOT_KEYS, path);
  if (extra) return extra;
  if (!isNonEmptyString(v.label)) return mkFail('missing-required-string', `${path}.label`, 'display label is missing/empty');
  if (v.sourceLabel !== undefined && typeof v.sourceLabel !== 'string') {
    return mkFail('missing-required-string', `${path}.sourceLabel`, 'sourceLabel must be a string when present');
  }
  return validateSourceVersion(v.source, `${path}.source`);
}

// Counter-semantics fields (safe-integer) vs timestamps (finite-only). scheduleRevision here is a FROZEN
// snapshot value compared for equality against the current row (scheduler.ts step 8), never incremented,
// so `isSafeCounter` (accepts MAX_SAFE_INTEGER) is correct — not the incrementable guard.
const FROZEN_SCHEDULE_COUNTER_FIELDS = ['targetRevision', 'scheduleRevision', 'configVersion', 'stepIndex'] as const;
const FROZEN_SCHEDULE_TIMESTAMP_FIELDS = ['dueAt', 'capturedAt'] as const;

/** Validate a frozen schedule snapshot: required strings, active-only status, and finite numerics. */
function validateFrozenSchedule(v: unknown, path: string): SrsPersistenceFailure | null {
  if (!isPlainObject(v)) return mkFail('not-an-object', path, 'frozen schedule snapshot is not an object');
  const extra = rejectUnknownKeys(v, FROZEN_SCHEDULE_KEYS, path);
  if (extra) return extra;
  if (!isNonEmptyString(v.targetId)) return mkFail('missing-required-string', `${path}.targetId`, 'frozen targetId is missing/empty');
  if (!isNonEmptyString(v.lessonId)) return mkFail('missing-required-string', `${path}.lessonId`, 'frozen lessonId is missing/empty');
  if (!isNonEmptyString(v.configId)) return mkFail('missing-required-string', `${path}.configId`, 'frozen configId is missing/empty');
  if (v.status !== 'active') return mkFail('invalid-status', `${path}.status`, `frozen schedule must be active, got ${safeDiag(v.status)}`);
  for (const f of FROZEN_SCHEDULE_COUNTER_FIELDS) {
    if (!isSafeCounter(v[f])) return mkFail('non-finite-number', `${path}.${f}`, `${f} must be a safe-integer counter`);
  }
  for (const f of FROZEN_SCHEDULE_TIMESTAMP_FIELDS) {
    if (!isFiniteNumber(v[f])) return mkFail('non-finite-number', `${path}.${f}`, `non-finite ${f}`);
  }
  return validateSourceVersion(v.source, `${path}.source`);
}



function validatePlanEntry(v: unknown, path: string): SrsPersistenceFailure | null {
  if (!isPlainObject(v)) return mkFail('not-an-object', path, 'plan entry is not an object');
  const extra = rejectUnknownKeys(v, PLAN_ENTRY_KEYS, path);
  if (extra) return extra;
  if (!isNonEmptyString(v.targetId)) return mkFail('missing-required-string', `${path}.targetId`, 'entry targetId is missing/empty');
  if (!isNonEmptyString(v.lessonId)) return mkFail('missing-required-string', `${path}.lessonId`, 'entry lessonId is missing/empty');
  if (v.reviewKind !== 'due' && v.reviewKind !== 'early') {
    return mkFail('invalid-status', `${path}.reviewKind`, `entry reviewKind must be due|early, got ${safeDiag(v.reviewKind)}`);
  }
  const sched = validateFrozenSchedule(v.frozenSchedule, `${path}.frozenSchedule`);
  if (sched) return sched;
  const disp = validateDisplaySnapshot(v.frozenSource, `${path}.frozenSource`);
  if (disp) return disp;









  const frozen = v.frozenSchedule as { targetId: unknown; lessonId: unknown };
  if (frozen.targetId !== v.targetId) {
    return mkFail('identity-mismatch', `${path}.frozenSchedule.targetId`, `frozen targetId "${safeDiag(frozen.targetId)}" != entry targetId "${safeDiag(v.targetId)}"`);
  }
  if (frozen.lessonId !== v.lessonId) {
    return mkFail('identity-mismatch', `${path}.frozenSchedule.lessonId`, `frozen lessonId "${safeDiag(frozen.lessonId)}" != entry lessonId "${safeDiag(v.lessonId)}"`);
  }
  return null;
}

/** Validate a schedule-neutral context/repair entry. */
function validateNeutralEntry(v: unknown, path: string, isRepair: boolean): SrsPersistenceFailure | null {
  if (!isPlainObject(v)) return mkFail('not-an-object', path, 'neutral entry is not an object');
  const extra = rejectUnknownKeys(v, isRepair ? REPAIR_ENTRY_KEYS : CONTEXT_ENTRY_KEYS, path);
  if (extra) return extra;
  if (!isNonEmptyString(v.targetId)) return mkFail('missing-required-string', `${path}.targetId`, 'neutral targetId is missing/empty');
  if (!isNonEmptyString(v.lessonId)) return mkFail('missing-required-string', `${path}.lessonId`, 'neutral lessonId is missing/empty');
  if (v.scheduleNeutral !== true) return mkFail('invalid-status', `${path}.scheduleNeutral`, 'scheduleNeutral must be the literal true');
  const disp = validateDisplaySnapshot(v.frozenSource, `${path}.frozenSource`);
  if (disp) return disp;
  if (isRepair && v.failedMoveKeys !== undefined) {
    if (!Array.isArray(v.failedMoveKeys)) return mkFail('not-an-array', `${path}.failedMoveKeys`, 'failedMoveKeys must be an array when present');

    const keyFail = rejectNonIndexArrayKeys(v.failedMoveKeys, `${path}.failedMoveKeys`);
    if (keyFail) return keyFail;
    for (let i = 0; i < v.failedMoveKeys.length; i++) {
      if (typeof v.failedMoveKeys[i] !== 'string') {
        return mkFail('missing-required-string', `${path}.failedMoveKeys[${i}]`, 'failedMoveKeys entries must be strings');
      }
    }
  }
  return null;
}

/**
 * Validate an untrusted deserialized traversal plan. Closes residuals (a)–(d): complete shape,
 * recognized-version-only (planVersion === 1, never coerced), required strings/status, finite
 * numerics, and cross-list `targetId` uniqueness across entries ∪ context ∪ repair. Never throws:
 * an unexpected error is caught and returned as a typed failure.
 */
export function validatePersistedTraversalPlan(raw: unknown): SrsPersistenceResult<SrsTraversalPlan> {
  try {
    if (!isPlainObject(raw)) return { ok: false, failure: mkFail('not-an-object', 'plan', 'plan is not an object') };
    // Closed record: no smuggled chess material / own __proto__ at the top level (findings 6/7).
    const planExtra = rejectUnknownKeys(raw, PLAN_KEYS, 'plan');
    if (planExtra) return { ok: false, failure: planExtra };
    // (b) recognized version only — reject missing/unknown, never coerce.
    if (raw.planVersion !== 1) {
      return { ok: false, failure: mkFail('unrecognized-plan-version', 'plan.planVersion', `unrecognized plan version: ${safeDiag(raw.planVersion)}`) };
    }
    if (!isNonEmptyString(raw.sessionId)) return { ok: false, failure: mkFail('missing-required-string', 'plan.sessionId', 'plan sessionId is missing/empty') };
    if (!isNonEmptyString(raw.traversalId)) return { ok: false, failure: mkFail('missing-required-string', 'plan.traversalId', 'plan traversalId is missing/empty') };
    if (!isFiniteNumber(raw.createdAt)) return { ok: false, failure: mkFail('non-finite-number', 'plan.createdAt', 'plan createdAt is non-finite') };
    if (!Array.isArray(raw.entries)) return { ok: false, failure: mkFail('not-an-array', 'plan.entries', 'plan.entries is not an array') };
    if (!Array.isArray(raw.context)) return { ok: false, failure: mkFail('not-an-array', 'plan.context', 'plan.context is not an array') };
    if (!Array.isArray(raw.repair)) return { ok: false, failure: mkFail('not-an-array', 'plan.repair', 'plan.repair is not an array') };



    for (const [arr, listPath] of [
      [raw.entries, 'plan.entries'], [raw.context, 'plan.context'], [raw.repair, 'plan.repair'],
    ] as const) {
      const keyFail = rejectNonIndexArrayKeys(arr, listPath);
      if (keyFail) return { ok: false, failure: keyFail };
    }

    const seen = new Set<string>();
    const checkDup = (targetId: string, path: string): SrsPersistenceFailure | null => {
      if (seen.has(targetId)) return mkFail('duplicate-identity', path, `targetId "${targetId}" appears more than once across entries/context/repair`);
      seen.add(targetId);
      return null;
    };

    for (let i = 0; i < raw.entries.length; i++) {
      const f = validatePlanEntry(raw.entries[i], `plan.entries[${i}]`);
      if (f) return { ok: false, failure: f };
      const dup = checkDup((raw.entries[i] as { targetId: string }).targetId, `plan.entries[${i}].targetId`);
      if (dup) return { ok: false, failure: dup };
    }
    for (let i = 0; i < raw.context.length; i++) {
      const f = validateNeutralEntry(raw.context[i], `plan.context[${i}]`, false);
      if (f) return { ok: false, failure: f };
      const dup = checkDup((raw.context[i] as { targetId: string }).targetId, `plan.context[${i}].targetId`);
      if (dup) return { ok: false, failure: dup };
    }
    for (let i = 0; i < raw.repair.length; i++) {
      const f = validateNeutralEntry(raw.repair[i], `plan.repair[${i}]`, true);
      if (f) return { ok: false, failure: f };
      const dup = checkDup((raw.repair[i] as { targetId: string }).targetId, `plan.repair[${i}].targetId`);
      if (dup) return { ok: false, failure: dup };
    }
    // Every local branch above is proven; the value is structurally a well-formed SrsTraversalPlan.
    const plan = raw as unknown as SrsTraversalPlan;









    return { ok: true, value: plan };
  } catch (e) {
    return { ok: false, failure: mkFail('not-an-object', 'plan', `unexpected validation error: ${classifyStudyError(e)}`) };
  }
}

const SESSION_STATES: ReadonlySet<SrsSessionState> = new Set<SrsSessionState>(['active', 'partial', 'completed']);

/**
 * Validate an untrusted deserialized session row: the three indexed fields (`sessionId`, `lessonId`,
 * `state`) and other required scalars, the progress cursor + completed-target state, and the embedded
 * plan (via validatePersistedTraversalPlan). Never throws — malformed rows return a typed failure.
 */
export function validatePersistedSessionRow(raw: unknown): SrsPersistenceResult<SrsPracticeSessionRow> {
  try {
    if (!isPlainObject(raw)) return { ok: false, failure: mkFail('not-an-object', 'session', 'session row is not an object') };
    // Closed record: no smuggled chess material / own __proto__ at the top level (findings 6/7).
    const rowExtra = rejectUnknownKeys(raw, SESSION_ROW_KEYS, 'session');
    if (rowExtra) return { ok: false, failure: rowExtra };
    if (!isNonEmptyString(raw.sessionId)) return { ok: false, failure: mkFail('missing-required-string', 'session.sessionId', 'sessionId is missing/empty') };
    if (!isNonEmptyString(raw.lessonId)) return { ok: false, failure: mkFail('missing-required-string', 'session.lessonId', 'lessonId is missing/empty') };
    if (typeof raw.state !== 'string' || !SESSION_STATES.has(raw.state as SrsSessionState)) {
      return { ok: false, failure: mkFail('invalid-status', 'session.state', `state must be active|partial|completed, got ${safeDiag(raw.state)}`) };
    }
    if (!isFiniteNumber(raw.updatedAt)) return { ok: false, failure: mkFail('non-finite-number', 'session.updatedAt', 'updatedAt is non-finite') };
    if (!isFiniteNumber(raw.createdAt)) return { ok: false, failure: mkFail('non-finite-number', 'session.createdAt', 'createdAt is non-finite') };
    if (!isSafeCounter(raw.targetCount)) return { ok: false, failure: mkFail('non-finite-number', 'session.targetCount', 'targetCount must be a safe-integer count') };

    const progress = raw.progress;
    if (!isPlainObject(progress)) return { ok: false, failure: mkFail('not-an-object', 'session.progress', 'progress is not an object') };
    const progressExtra = rejectUnknownKeys(progress, PROGRESS_KEYS, 'session.progress');
    if (progressExtra) return { ok: false, failure: progressExtra };
    if (!isFiniteNumber(progress.entryCursor)) return { ok: false, failure: mkFail('non-finite-number', 'session.progress.entryCursor', 'entryCursor is non-finite') };
    for (const listName of ['completedTargetIds', 'appliedAttemptIds'] as const) {
      const list = progress[listName];
      if (!Array.isArray(list)) return { ok: false, failure: mkFail('not-an-array', `session.progress.${listName}`, `${listName} is not an array`) };


      const keyFail = rejectNonIndexArrayKeys(list, `session.progress.${listName}`);
      if (keyFail) return { ok: false, failure: keyFail };
      for (let i = 0; i < list.length; i++) {
        if (typeof list[i] !== 'string') return { ok: false, failure: mkFail('missing-required-string', `session.progress.${listName}[${i}]`, `${listName} entries must be strings`) };
      }
    }

    // Validate + compose the embedded plan BEFORE the checkpoint invariants so the invariants can read
    // the plan's proven entries (targetCount denominator, completed-target membership set).
    const planResult = validatePersistedTraversalPlan(raw.plan);
    if (!planResult.ok) return planResult;
    const plan = planResult.value;

    // --- NORMATIVE CHECKPOINT INVARIANTS S1–S9 (see SrsPracticeSessionRow doc) --------------------
    const sessionId = raw.sessionId as string;
    const lessonId = raw.lessonId as string;
    const targetCount = raw.targetCount as number;
    const entryCursor = progress.entryCursor as number;
    const completedTargetIds = progress.completedTargetIds as readonly string[];
    const appliedAttemptIds = progress.appliedAttemptIds as readonly string[];

    // S1: session/plan identity coherence.
    if (plan.sessionId !== sessionId) {
      return { ok: false, failure: mkFail('identity-mismatch', 'session.plan.sessionId', `plan.sessionId "${plan.sessionId}" != session.sessionId "${sessionId}"`) };
    }
    // S2: single-lesson coherence across every plan entry/context/repair.
    for (const e of plan.entries) {
      if (e.lessonId !== lessonId) return { ok: false, failure: mkFail('identity-mismatch', 'session.plan.entries', `entry lessonId "${e.lessonId}" != session lessonId "${lessonId}"`) };
    }
    for (const c of plan.context) {
      if (c.lessonId !== lessonId) return { ok: false, failure: mkFail('identity-mismatch', 'session.plan.context', `context lessonId "${c.lessonId}" != session lessonId "${lessonId}"`) };
    }
    for (const r of plan.repair) {
      if (r.lessonId !== lessonId) return { ok: false, failure: mkFail('identity-mismatch', 'session.plan.repair', `repair lessonId "${r.lessonId}" != session lessonId "${lessonId}"`) };
    }
    // S3: targetCount is the scored-entry denominator.
    if (targetCount !== plan.entries.length) {
      return { ok: false, failure: mkFail('checkpoint-invariant', 'session.targetCount', `targetCount ${targetCount} != plan.entries.length ${plan.entries.length}`) };
    }


    if (!Number.isSafeInteger(entryCursor) || entryCursor < 0 || entryCursor > targetCount) {
      return { ok: false, failure: mkFail('checkpoint-invariant', 'session.progress.entryCursor', `entryCursor ${entryCursor} must be an integer in [0, ${targetCount}]`) };
    }
    // S5/S6: every completed target is a known scored target, with no duplicates.
    const scoredIds = new Set(plan.entries.map(e => e.targetId));
    const seenCompleted = new Set<string>();
    for (const id of completedTargetIds) {
      if (!scoredIds.has(id)) return { ok: false, failure: mkFail('checkpoint-invariant', 'session.progress.completedTargetIds', `completed target "${id}" is not a scored plan entry`) };
      if (seenCompleted.has(id)) return { ok: false, failure: mkFail('duplicate-identity', 'session.progress.completedTargetIds', `completed target "${id}" is duplicated`) };
      seenCompleted.add(id);
    }
    // S7/S8: applied attempt ids are non-empty and unique (session idempotency ledger).
    const seenApplied = new Set<string>();
    for (const id of appliedAttemptIds) {
      if (id.length === 0) return { ok: false, failure: mkFail('missing-required-string', 'session.progress.appliedAttemptIds', 'applied attempt id is empty') };
      if (seenApplied.has(id)) return { ok: false, failure: mkFail('duplicate-identity', 'session.progress.appliedAttemptIds', `applied attempt id "${id}" is duplicated`) };
      seenApplied.add(id);
    }
    // S9: a `completed` session has every scored target done and the cursor at the end.
    if (raw.state === 'completed' && (completedTargetIds.length !== targetCount || entryCursor !== targetCount)) {
      return { ok: false, failure: mkFail('checkpoint-invariant', 'session.state', `state 'completed' requires completedTargetIds.length (${completedTargetIds.length}) === targetCount (${targetCount}) and entryCursor (${entryCursor}) === targetCount`) };
    }




    if (completedTargetIds.length !== entryCursor) {
      return { ok: false, failure: mkFail('checkpoint-invariant', 'session.progress.completedTargetIds', `completedTargetIds.length (${completedTargetIds.length}) must equal entryCursor (${entryCursor})`) };
    }
    for (let i = 0; i < entryCursor; i++) {
      const expected = plan.entries[i]?.targetId;
      if (completedTargetIds[i] !== expected) {
        return { ok: false, failure: mkFail('checkpoint-invariant', `session.progress.completedTargetIds[${i}]`, `completedTargetIds[${i}] "${safeDiag(completedTargetIds[i])}" must equal plan.entries[${i}].targetId "${safeDiag(expected)}" (cursor–ledger prefix)`) };
      }
    }

    return { ok: true, value: raw as unknown as SrsPracticeSessionRow };
  } catch (e) {
    return { ok: false, failure: mkFail('not-an-object', 'session', `unexpected validation error: ${classifyStudyError(e)}`) };
  }
}

// --- study-practice-sessions -----------------------------------------------

/** Persist a session row (frozen plan + progress checkpoint). B4a is CRUD only — the atomic
 *  attempt+SRS+session checkpoint transaction is B4b. */
export function savePracticeSession(row: SrsPracticeSessionRow): Promise<void> {
  return practicePut('study-practice-sessions', row);
}
/**
 * Read a session row and validate it at the untrusted-persistence boundary. Resolves `null` when no
 * row exists; otherwise a typed SrsPersistenceResult (ok → validated row; failure → typed rejection,
 * never a raw throw for malformed data). This is where the four recorded B4 residuals are closed on
 * read.
 */
export async function getPracticeSession(
  sessionId: string,
): Promise<SrsPersistenceResult<SrsPracticeSessionRow> | null> {
  const raw = await practiceGet<unknown>('study-practice-sessions', sessionId);
  if (raw === undefined) return null;
  return validatePersistedSessionRow(raw);
}
export function deletePracticeSession(sessionId: string): Promise<void> {
  return practiceDelete('study-practice-sessions', sessionId);
}
/**
 * Bounded list of sessions in a given lifecycle state via the `state` index. Each row is validated at
 * the persistence boundary, so the caller receives typed results (ok/failure) and never a raw throw
 * for a malformed persisted row.
 */
export async function listPracticeSessionsByState(
  state: SrsSessionState,
  limit: number,
): Promise<SrsPersistenceResult<SrsPracticeSessionRow>[]> {
  const db = await openDb();
  const rows = await collectBoundedPracticeCursor<unknown>(
    db, 'study-practice-sessions', 'state', IDBKeyRange.only(state), 'next', limit,
  );
  return rows.map(validatePersistedSessionRow);
}















const ATTEMPT_SCHEDULED_KEYS = ['scheduleRevision', 'configVersion', 'stepIndex', 'dueAt'] as const;
const ATTEMPT_RECORD_KEYS = [
  'attemptId', 'targetId', 'lessonId', 'targetRevision', 'sessionId', 'traversalId', 'mode',
  'scheduled', 'completedAt', 'reviewKind', 'firstAttemptResult', 'assistanceTypes', 'failedMoveKeys',
  'forceAddedAt', 'snapshot',
] as const;
const ATTEMPT_REVIEW_KINDS: ReadonlySet<string> = new Set(['due', 'early']);
const ATTEMPT_FIRST_RESULTS: ReadonlySet<string> = new Set(['clean', 'failed']);

/** Validate the frozen `SrsScheduledSnapshot` on an attempt: a closed record of four finite numerics. */
function validateAttemptScheduledSnapshot(v: unknown, path: string): SrsPersistenceFailure | null {
  if (!isPlainObject(v)) return mkFail('not-an-object', path, 'scheduled snapshot is not an object');
  const extra = rejectUnknownKeys(v, ATTEMPT_SCHEDULED_KEYS, path);
  if (extra) return extra;
  // scheduleRevision/configVersion/stepIndex are CAS counters compared for equality against the current
  // row (scheduler.ts step 8) — safe integers. dueAt is a timestamp — finite-only.
  for (const f of ['scheduleRevision', 'configVersion', 'stepIndex'] as const) {
    if (!isSafeCounter(v[f])) return mkFail('non-finite-number', `${path}.${f}`, `${f} must be a safe-integer counter`);
  }
  if (!isFiniteNumber(v.dueAt)) return mkFail('non-finite-number', `${path}.dueAt`, 'non-finite dueAt');
  return null;
}

/** Validate a required array-of-strings field (`assistanceTypes`/`failedMoveKeys`): it must be an ARRAY
 *  (never a bare object) whose OWN property names are exactly its indices (+`length`), with string
 *  elements. */
function validateAttemptStringArray(v: unknown, path: string): SrsPersistenceFailure | null {
  if (!Array.isArray(v)) return mkFail('not-an-array', path, `${path} must be an array`);
  // Own-key exactness via the shared F4 helper (a clone-preserved `assistanceTypes.pgn = "1. e4"` is
  // rejected before it can reach the kernel-`applied` path), then the string-element check on top.
  const keyFail = rejectNonIndexArrayKeys(v, path);
  if (keyFail) return keyFail;
  for (let i = 0; i < v.length; i++) {
    if (typeof v[i] !== 'string') return mkFail('missing-required-string', `${path}[${i}]`, `${path} entries must be strings`);
  }
  return null;
}












function validateAttemptRecordShape(raw: unknown): SrsPersistenceFailure | null {
  try {
    if (!isPlainObject(raw)) return mkFail('not-an-object', 'attempt', 'attempt is not a plain object');
    const extra = rejectUnknownKeys(raw, ATTEMPT_RECORD_KEYS, 'attempt');
    if (extra) return extra;
    if (!isNonEmptyString(raw.attemptId)) return mkFail('missing-required-string', 'attempt.attemptId', 'attemptId is missing/empty');
    if (!isNonEmptyString(raw.targetId)) return mkFail('missing-required-string', 'attempt.targetId', 'targetId is missing/empty');
    if (!isNonEmptyString(raw.lessonId)) return mkFail('missing-required-string', 'attempt.lessonId', 'lessonId is missing/empty');
    if (!isNonEmptyString(raw.sessionId)) return mkFail('missing-required-string', 'attempt.sessionId', 'sessionId is missing/empty');
    if (!isNonEmptyString(raw.traversalId)) return mkFail('missing-required-string', 'attempt.traversalId', 'traversalId is missing/empty');
    // `mode` is a domain-neutral opaque string (SrsTraversalMode); the kernel treats it as opaque, so the
    // boundary validates it as a non-empty string rather than against an invented closed set.
    if (!isNonEmptyString(raw.mode)) return mkFail('missing-required-string', 'attempt.mode', 'mode must be a non-empty string');
    if (!isSafeCounter(raw.targetRevision)) return mkFail('non-finite-number', 'attempt.targetRevision', 'targetRevision must be a safe-integer counter');
    if (!isFiniteNumber(raw.completedAt)) return mkFail('non-finite-number', 'attempt.completedAt', 'completedAt is non-finite');
    const sched = validateAttemptScheduledSnapshot(raw.scheduled, 'attempt.scheduled');
    if (sched) return sched;
    if (typeof raw.reviewKind !== 'string' || !ATTEMPT_REVIEW_KINDS.has(raw.reviewKind)) {
      return mkFail('invalid-status', 'attempt.reviewKind', `reviewKind must be due|early, got ${safeDiag(raw.reviewKind)}`);
    }
    if (typeof raw.firstAttemptResult !== 'string' || !ATTEMPT_FIRST_RESULTS.has(raw.firstAttemptResult)) {
      return mkFail('invalid-status', 'attempt.firstAttemptResult', `firstAttemptResult must be clean|failed, got ${safeDiag(raw.firstAttemptResult)}`);
    }
    const assist = validateAttemptStringArray(raw.assistanceTypes, 'attempt.assistanceTypes');
    if (assist) return assist;
    const failed = validateAttemptStringArray(raw.failedMoveKeys, 'attempt.failedMoveKeys');
    if (failed) return failed;
    if (raw.forceAddedAt !== undefined && !isFiniteNumber(raw.forceAddedAt)) {
      return mkFail('non-finite-number', 'attempt.forceAddedAt', 'forceAddedAt must be finite when present');
    }
    const snap = validateDisplaySnapshot(raw.snapshot, 'attempt.snapshot');
    if (snap) return snap;
    return null;
  } catch (e) {
    return mkFail('not-an-object', 'attempt', `unexpected attempt validation error: ${classifyStudyError(e)}`);
  }
}










const LADDER_CONFIG_KEYS = [
  'configId', 'configVersion', 'intervalsMs', 'resetStep', 'advanceBy',
  'requiredConsecutiveClean', 'graduation', 'presentationGroups',
] as const;









const GRADUATION_POLICY_KEYS = ['afterConsecutiveClean'] as const;
const PRESENTATION_GROUP_KEYS = ['id', 'label', 'stepIndexes'] as const;

function validateLadderConfigMembers(config: Record<string, unknown>): SrsPersistenceFailure | null {
  // intervalsMs: a plain (own-key-exact) array of finite numbers. Mechanics (positivity / strict
  // increase) remain the sealed validator's job — this is the structural-shape guard.
  if (!Array.isArray(config.intervalsMs)) return mkFail('not-an-array', 'config.intervalsMs', 'intervalsMs must be an array');
  const intervalsKeyFail = rejectNonIndexArrayKeys(config.intervalsMs, 'config.intervalsMs');
  if (intervalsKeyFail) return intervalsKeyFail;
  for (let i = 0; i < config.intervalsMs.length; i++) {
    if (!isFiniteNumber(config.intervalsMs[i])) return mkFail('non-finite-number', `config.intervalsMs[${i}]`, 'intervalsMs entries must be finite numbers');
  }
  if (!isFiniteNumber(config.resetStep)) return mkFail('non-finite-number', 'config.resetStep', 'resetStep must be a finite number');
  if (!isFiniteNumber(config.advanceBy)) return mkFail('non-finite-number', 'config.advanceBy', 'advanceBy must be a finite number');
  if (config.requiredConsecutiveClean !== undefined && !isFiniteNumber(config.requiredConsecutiveClean)) {
    return mkFail('non-finite-number', 'config.requiredConsecutiveClean', 'requiredConsecutiveClean must be a finite number when present');
  }
  // graduation: an optional closed-record `{ afterConsecutiveClean: finite }`.
  if (config.graduation !== undefined) {
    if (!isPlainObject(config.graduation)) return mkFail('not-an-object', 'config.graduation', 'graduation must be a plain object when present');
    const gradExtra = rejectUnknownKeys(config.graduation, GRADUATION_POLICY_KEYS, 'config.graduation');
    if (gradExtra) return gradExtra;
    if (!isFiniteNumber(config.graduation.afterConsecutiveClean)) {
      return mkFail('non-finite-number', 'config.graduation.afterConsecutiveClean', 'graduation.afterConsecutiveClean must be a finite number');
    }
  }
  // presentationGroups: an optional (own-key-exact) array of closed-record SrsPresentationGroup records.
  if (config.presentationGroups !== undefined) {
    if (!Array.isArray(config.presentationGroups)) return mkFail('not-an-array', 'config.presentationGroups', 'presentationGroups must be an array when present');
    const groupsKeyFail = rejectNonIndexArrayKeys(config.presentationGroups, 'config.presentationGroups');
    if (groupsKeyFail) return groupsKeyFail;
    for (let i = 0; i < config.presentationGroups.length; i++) {
      const group = config.presentationGroups[i];
      const groupPath = `config.presentationGroups[${i}]`;
      if (!isPlainObject(group)) return mkFail('not-an-object', groupPath, 'presentation group must be a plain object');
      const groupExtra = rejectUnknownKeys(group, PRESENTATION_GROUP_KEYS, groupPath);
      if (groupExtra) return groupExtra;
      if (!isNonEmptyString(group.id)) return mkFail('missing-required-string', `${groupPath}.id`, 'presentation group id is missing/empty');
      if (typeof group.label !== 'string') return mkFail('missing-required-string', `${groupPath}.label`, 'presentation group label must be a string');
      if (!Array.isArray(group.stepIndexes)) return mkFail('not-an-array', `${groupPath}.stepIndexes`, 'stepIndexes must be an array');
      const stepKeyFail = rejectNonIndexArrayKeys(group.stepIndexes, `${groupPath}.stepIndexes`);
      if (stepKeyFail) return stepKeyFail;
      for (let j = 0; j < group.stepIndexes.length; j++) {
        if (!isFiniteNumber(group.stepIndexes[j])) return mkFail('non-finite-number', `${groupPath}.stepIndexes[${j}]`, 'stepIndexes entries must be finite numbers');
      }
    }
  }
  return null;
}

/**
 * Complete SERVICE-SIDE config shape validation — plain-object + closed-record + identity + version +
 * deep members — i.e. everything the sealed `validateLadderConfig` (scheduler.ts) does NOT check (it
 * validates ladder MECHANICS only). Returns a human-readable reason on failure, or null when the shape is
 * valid. Runs ONCE, on the getter-free post-`structuredClone` config snapshot only — the dual original-object
 * pass was removed with the F7 single-canonicalization seam, since all config use is now confined to that
 * private clone. The mechanics brand (`validateLadderConfig`) runs separately, on the same snapshot.
 */
function validateServiceConfigShape(config: unknown): string | null {
  if (!isPlainObject(config)) {
    return 'ladder config must be a plain object';
  }
  const extraConfigKey = rejectUnknownKeys(config, LADDER_CONFIG_KEYS, 'config');
  if (extraConfigKey) {
    return `ladder config ${extraConfigKey.reason}`;
  }
  if (!isNonEmptyString(config.configId)) {
    return 'ladder config configId must be a non-empty string';
  }
  if (!isSafeCounter(config.configVersion)) {
    return `ladder config configVersion must be a safe-integer version counter, got ${safeDiag(config.configVersion)}`;
  }
  const memberFailure = validateLadderConfigMembers(config);
  if (memberFailure) {
    return `ladder config invalid at ${memberFailure.path}: ${memberFailure.reason}`;
  }
  return null;
}









const SCHEDULE_ROW_KEYS = [
  'targetId', 'lessonId', 'targetRevision', 'scheduleRevision', 'configId', 'configVersion',
  'stepIndex', 'cleanStreak', 'status', 'dueAt', 'enrolledAt', 'lastCompletedAt', 'lastAttemptId',
  'updatedAt',
] as const;
const SCHEDULE_STATUSES: ReadonlySet<string> = new Set(['active', 'graduated', 'suspended', 'archived']);
// Counter-semantics fields (safe-integer) vs incremented CAS counters (safe-integer below MAX_SAFE_INTEGER,
// since the kernel reads this row then does `scheduleRevision + 1`/`cleanStreak + 1`) vs timestamps
// (finite-only). This general validator keeps its lifecycle-permissive contract — it does NOT impose
// non-negativity (a stored row may be in any lifecycle state; the tighter initial-enrollment validator
// adds the non-negativity these counters require at the ENROLLMENT seam).
const SCHEDULE_ROW_COUNTER_FIELDS = ['targetRevision', 'configVersion', 'stepIndex'] as const;
const SCHEDULE_ROW_INCREMENTED_FIELDS = ['scheduleRevision', 'cleanStreak'] as const;
const SCHEDULE_ROW_TIMESTAMP_FIELDS = ['enrolledAt', 'updatedAt'] as const;









function validateStoredScheduleRow(v: unknown): SrsPersistenceFailure | null {
  try {
    if (!isPlainObject(v)) return mkFail('not-an-object', 'srs', 'stored SRS row is not a plain object');
    const extra = rejectUnknownKeys(v, SCHEDULE_ROW_KEYS, 'srs');
    if (extra) return extra;
    if (!isNonEmptyString(v.targetId)) return mkFail('missing-required-string', 'srs.targetId', 'targetId is missing/empty');
    if (!isNonEmptyString(v.lessonId)) return mkFail('missing-required-string', 'srs.lessonId', 'lessonId is missing/empty');
    if (!isNonEmptyString(v.configId)) return mkFail('missing-required-string', 'srs.configId', 'configId is missing/empty');
    if (typeof v.status !== 'string' || !SCHEDULE_STATUSES.has(v.status)) {
      return mkFail('invalid-status', 'srs.status', `status must be active|graduated|suspended|archived, got ${safeDiag(v.status)}`);
    }
    for (const f of SCHEDULE_ROW_COUNTER_FIELDS) {
      if (!isSafeCounter(v[f])) return mkFail('non-finite-number', `srs.${f}`, `${f} must be a safe-integer counter`);
    }
    for (const f of SCHEDULE_ROW_INCREMENTED_FIELDS) {
      if (!isIncrementableSafeCounter(v[f])) return mkFail('non-finite-number', `srs.${f}`, `${f} must be a safe-integer counter below MAX_SAFE_INTEGER (the kernel advances it by +1)`);
    }
    for (const f of SCHEDULE_ROW_TIMESTAMP_FIELDS) {
      if (!isFiniteNumber(v[f])) return mkFail('non-finite-number', `srs.${f}`, `non-finite ${f}`);
    }
    // `dueAt` is a concrete number for active rows, number|null for non-active (SrsScheduleRecord union).
    if (v.status === 'active') {
      if (!isFiniteNumber(v.dueAt)) return mkFail('non-finite-number', 'srs.dueAt', 'active row dueAt must be finite');
    } else if (v.dueAt !== null && !isFiniteNumber(v.dueAt)) {
      return mkFail('non-finite-number', 'srs.dueAt', 'dueAt must be finite or null');
    }
    if (v.lastCompletedAt !== null && !isFiniteNumber(v.lastCompletedAt)) {
      return mkFail('non-finite-number', 'srs.lastCompletedAt', 'lastCompletedAt must be finite or null');
    }
    if (v.lastAttemptId !== null && !isNonEmptyString(v.lastAttemptId)) {
      return mkFail('missing-required-string', 'srs.lastAttemptId', 'lastAttemptId must be a non-empty string or null');
    }
    return null;
  } catch (e) {
    return mkFail('not-an-object', 'srs', `unexpected stored SRS validation error: ${classifyStudyError(e)}`);
  }
}




























function validateInitialEnrollmentRow(v: unknown): SrsPersistenceFailure | null {
  try {
    // (0) General stored-row shape first (closed keys, plain prototype, finite numerics, closed status
    //     set with neutral diagnostics, nullable-field typing). Reused verbatim — one shape rule set.
    const shape = validateStoredScheduleRow(v);
    if (shape) return shape;
    // Past the shape gate `v` is a plain object with exactly the closed schedule-row key set and every
    // numeric field finite; read own fields directly.
    const row = v as Record<string, unknown>;

    // (1) status — MUST be 'active'. srsTypes.ts:28-30 ("`active` targets participate in due queries;
    //     the three non-active statuses are the only states in which `dueAt` may be null") + :84
    //     ("Enrollment creates the initial row; 'no row' is never due") + scheduler.ts step 6
    //     (`current.status !== 'active'` → `inactive`, never re-advances). A freshly enrolled target
    //     must be schedulable, so its initial status is active; any non-active initial row is
    //     un-schedulable on its first attempt. [FIRM]
    if (row.status !== 'active') {
      return mkFail('invalid-status', 'srs.status', `initial enrollment row status must be 'active', got ${safeDiag(row.status)}`);
    }
    // (2) stepIndex — MUST be 0. srsTypes.ts:82 ("Current ladder position (index into the config's
    //     `intervalsMs`)"): a never-reviewed target sits at the BOTTOM of the ladder, index 0.
    //     scheduler.ts step 3 requires an in-range integer; enrollment pins the initial position to the
    //     ladder floor. [FIRM — the kernel would accept any in-range integer for a first transition, so
    //     "exactly 0" is the initial-ladder-position reading of a never-reviewed target; noted for D1.]
    if (row.stepIndex !== 0) {
      return mkFail('checkpoint-invariant', 'srs.stepIndex', `initial enrollment row stepIndex must be 0 (ladder floor), got ${safeDiag(row.stepIndex)}`);
    }
    // (3) cleanStreak — MUST be 0. srsTypes.ts:83 ("Generic consecutive-clean counter; zero for
    //     configurations that do not use graduation"): a target with no completion history has zero
    //     consecutive clean results. scheduler.ts `buildActiveNext` computes `current.cleanStreak + 1`
    //     on the first clean, so a non-zero initial streak fabricates progress toward graduation. [FIRM]
    if (row.cleanStreak !== 0) {
      return mkFail('checkpoint-invariant', 'srs.cleanStreak', `initial enrollment row cleanStreak must be 0, got ${safeDiag(row.cleanStreak)}`);
    }
    // (4) scheduleRevision / targetRevision / configVersion — MUST be non-negative integers. srsTypes.ts
    //     :73 ("Monotonic local/CAS revision"), :72-73 ("Identity/source revision … append-only …
    //     advances this"), :81 ("Configuration applied at the last scheduling event"): all three are
    //     monotonic whole-number counters that only ever advance (scheduler.ts `buildActiveNext` does
    //     `scheduleRevision + 1`). A negative or fractional value is not a valid counter state; the
    //     reviewer's `scheduleRevision:-9` probe lives here. [AMBIGUOUS base: the contracts do NOT pin
    //     the exact initial base — scheduler.ts step 8 requires only that a first attempt's frozen
    //     snapshot match the row, so the kernel accepts any finite base — therefore the strictest
    //     kernel-accepted reading (a non-negative integer counter) is enforced rather than a specific
    //     base; flagged for D1.]
    for (const f of ['scheduleRevision', 'targetRevision', 'configVersion'] as const) {
      const n = row[f] as number; // finite number guaranteed by the shape validator above
      // Safe-integer (NOT merely Number.isInteger, which accepts float-saturating magnitudes such as
      // `1e100`) + non-negative (the non-negativity these counters already required). scheduleRevision is
      // incremented by the FIRST applied transition (scheduler.ts `scheduleRevision + 1`), so it must also
      // sit strictly below MAX_SAFE_INTEGER for that `+1` to remain representable and actually advance
      // (B4BF12 HIGH: 1e100 enrolled, then 1e100 + 1 === 1e100 => advanced=false). targetRevision and
      // configVersion are compared/stamped here, not incremented, so MAX_SAFE_INTEGER itself is acceptable.
      const okCounter = f === 'scheduleRevision'
        ? isIncrementableSafeCounter(n) && n >= 0
        : isSafeCounter(n) && n >= 0;
      if (!okCounter) {
        return mkFail('checkpoint-invariant', `srs.${f}`, `initial enrollment row ${f} must be a non-negative safe integer${f === 'scheduleRevision' ? ' below MAX_SAFE_INTEGER (it is incremented on the first applied transition)' : ''}, got ${safeDiag(row[f])}`);
      }
    }
    // (5) lastCompletedAt — MUST be null. srsTypes.ts:86-87 ("Last completed scored attempt … or null
    //     before the first completion"): a brand-new enrollment has completed no attempt, so non-null
    //     prior-completion history on an "initial" row is fabricated (the reviewer's arbitrary-dueAt-
    //     with-history and prior-completion probes). [FIRM]
    if (row.lastCompletedAt !== null) {
      return mkFail('checkpoint-invariant', 'srs.lastCompletedAt', `initial enrollment row lastCompletedAt must be null (no completion precedes enrollment), got ${safeDiag(row.lastCompletedAt)}`);
    }
    // (6) lastAttemptId — MUST be null. srsTypes.ts:88-95 ("The idempotency key of the last attempt
    //     applied to this row … or null before the first applied completion"): no attempt has been
    //     applied to a brand-new row. scheduler.ts step 5 keys the idempotent-duplicate check on
    //     `lastAttemptId`, so a fabricated non-null id could mis-mark the first genuine attempt. [FIRM]
    if (row.lastAttemptId !== null) {
      return mkFail('checkpoint-invariant', 'srs.lastAttemptId', `initial enrollment row lastAttemptId must be null (no attempt applied before enrollment), got ${safeDiag(row.lastAttemptId)}`);
    }
    // (7) dueAt — active rows carry a concrete finite instant (srsTypes.ts:100-105 "Non-null for active
    //     rows"), already enforced by the shape validator for the active status above. NO initial-VALUE
    //     constraint is imposed: scheduler.ts step 8 requires only that a first attempt's frozen snapshot
    //     dueAt EQUAL the row's dueAt, so the kernel accepts ANY finite initial dueAt (a caller may
    //     schedule a fresh target due-now or into the future). [GENUINELY AMBIGUOUS — whether enrollment
    //     may caller-schedule the initial dueAt is a product-contract question the sealed contracts do
    //     not answer; the strictest kernel-accepted reading is "finite" (already enforced); NOT invented
    //     as a value rule; flagged for D1.] enrolledAt/updatedAt finiteness is likewise already enforced
    //     by the shape validator (srsTypes.ts:84, :97) with no further sealed-contract initial constraint.
    return null;
  } catch (e) {
    return mkFail('not-an-object', 'srs', `unexpected initial enrollment validation error: ${classifyStudyError(e)}`);
  }
}
































/** Input to the atomic completion service. `config` is the RAW ladder config — the service validates
 *  it internally (the branded validated type is unforgeable outside `scheduler.ts`). `now` is the
 *  explicit session-checkpoint clock (finite; no wall-clock default). `currentSourceById` is the
 *  optional REAL live source-version map used for the sealed B3 plan revalidation composition. */
export interface CompleteStudySrsAttemptInput {
  readonly attempt: SrsAttemptRecord;
  readonly config: SrsLadderConfig;
  readonly now: number;
  readonly currentSourceById?: ReadonlyMap<string, SrsSourceVersion>;
}

function rejectedService(
  outcome: SrsAttemptServiceRejected['outcome'],
  reason: string,
  extra?: Pick<SrsAttemptServiceRejected, 'sessionFailure' | 'staleTargetIds'>,
): SrsAttemptServiceRejected {
  return { outcome, reason, ...(extra ?? {}) };
}

























/**
 * Recursively freeze a plain-data graph produced by `structuredClone`, so an accepted canonical capture
 * cannot be mutated after validation. A structured clone has no getters, no prototype-chain state, and
 * (for a valid record) no non-index array keys, so a recurse over own property names covers the graph.
 */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/**
 * Canonicalize an optional caller `currentSourceById` (memo §6) into a PRIVATE fresh Map of frozen
 * exact `SrsSourceVersion` records. `undefined` stays the explicit "skip live source comparison" value.
 * Otherwise a genuine Map internal slot is required via a built-in Map operation (`Map.prototype.forEach`
 * bypasses caller-overridable `.get`/`.entries`/`[Symbol.iterator]`; a non-Map receiver throws typed).
 * The whole captured entry list is cloned as ONE graph (each source value's accessors read exactly once),
 * every key is validated as a non-empty target ID, and every value is validated against the exact
 * `SrsSourceVersion` rules, then rebuilt as a frozen exact record. The sealed revalidators receive only
 * this private map, so their repeated `.get`/`.kind` reads are harmless.
 */
function canonicalizeSourceById(
  raw: unknown,
):
  | { readonly ok: true; readonly map: ReadonlyMap<string, SrsSourceVersion> | undefined }
  | { readonly ok: false; readonly reason: string } {
  if (raw === undefined) return { ok: true, map: undefined };
  let entryList: Array<[unknown, unknown]>;
  try {
    const collected: Array<[unknown, unknown]> = [];
    // Built-in internal iteration: requires a real [[MapData]] slot (a fake/poisoned non-Map container
    // throws here) and hands each stored VALUE reference to the callback WITHOUT reading its members, so
    // an accessor on a source value (e.g. an alternating `kind` getter) is untouched until the single
    // structuredClone below reads it exactly once.
    Map.prototype.forEach.call(raw as Map<unknown, unknown>, (value: unknown, key: unknown) => {
      collected.push([key, value]);
    });
    entryList = structuredClone(collected);
  } catch (e) {
    return { ok: false, reason: `currentSourceById is not a usable source map: ${classifyStudyError(e)}` };
  }
  const rebuilt = new Map<string, SrsSourceVersion>();
  for (const [key, value] of entryList) {
    if (typeof key !== 'string' || key.length === 0) {
      return { ok: false, reason: `currentSourceById key must be a non-empty target id, got ${safeDiag(key)}` };
    }
    const failure = validateSourceVersion(value, `currentSourceById[${key}]`);
    if (failure) {
      return { ok: false, reason: `currentSourceById value invalid at ${failure.path}: ${failure.reason}` };
    }
    const v = value as { kind: 'linked' | 'unlinked'; sourceRevision?: number; origin?: 'manual' | 'snapshot-import' | 'unlinked-from-source' };
    const rebuiltValue: SrsSourceVersion = v.kind === 'linked'
      ? Object.freeze({ kind: 'linked' as const, sourceRevision: v.sourceRevision as number })
      : v.origin !== undefined
        ? Object.freeze({ kind: 'unlinked' as const, origin: v.origin })
        : Object.freeze({ kind: 'unlinked' as const });
    rebuilt.set(key, rebuiltValue);
  }
  return { ok: true, map: rebuilt };
}

/** Getter-free canonical capture of every service input, or a typed pre-DB rejection. */
interface CanonicalCompleteInput {
  readonly attempt: SrsAttemptRecord;
  readonly config: SrsValidatedLadderConfig;
  readonly now: number;
  readonly sourceById: ReadonlyMap<string, SrsSourceVersion> | undefined;
}
type CanonicalizeResult =
  | { readonly ok: true; readonly canonical: CanonicalCompleteInput }
  | { readonly ok: false; readonly rejection: SrsAttemptServiceRejected };

/**
 * The ONE synchronous canonicalization seam (memo §1–§8). Reads each outer property in the fixed order
 * attempt → config → currentSourceById → now, AT MOST ONCE each, cloning composites immediately so a
 * later outer getter cannot mutate an earlier still-raw object; validates ONLY the canonical captures;
 * brands the config exactly once from the same snapshot whose shape was validated; deep-freezes the
 * accepted attempt/config graphs; and rebuilds the source map as a private fresh Map. Any failure
 * resolves a typed pre-DB rejection (`invalid`/`invalid-config`/`non-finite-clock`) — never a raw throw.
 * Its successful return is the proof boundary: the service consumes only `canonical`, so no caller-
 * observable read can occur afterwards.
 */
function canonicalizeCompleteInput(input: CompleteStudySrsAttemptInput): CanonicalizeResult {
  // (1) attempt — read once, clone immediately, validate the clone, deep-freeze.
  let attempt: SrsAttemptRecord;
  try {
    attempt = structuredClone(input.attempt);
  } catch (e) {
    return { ok: false, rejection: rejectedService('invalid', `attempt could not be snapshotted: ${classifyStudyError(e)}`) };
  }
  const attemptFailure = validateAttemptRecordShape(attempt);
  if (attemptFailure) {
    return { ok: false, rejection: rejectedService('invalid', `attempt failed validation at ${attemptFailure.path}: ${attemptFailure.reason}`) };
  }
  deepFreeze(attempt);

  // (2) config — read once, clone immediately, validate shape on the clone, then brand ONCE from that
  //     same snapshot so identity/version/members and the mechanics brand describe one closed object.
  let clonedConfig: SrsLadderConfig;
  try {
    clonedConfig = structuredClone(input.config);
  } catch (e) {
    return { ok: false, rejection: rejectedService('invalid-config', `ladder config could not be snapshotted: ${classifyStudyError(e)}`) };
  }
  const configShapeFailure = validateServiceConfigShape(clonedConfig);
  if (configShapeFailure) {
    return { ok: false, rejection: rejectedService('invalid-config', configShapeFailure) };
  }
  const branded = validateLadderConfig(clonedConfig);
  if (!branded.ok) {
    return { ok: false, rejection: rejectedService('invalid-config', `ladder config invalid: ${branded.reason}`) };
  }
  deepFreeze(clonedConfig);
  const config = branded.config;

  // (3) currentSourceById — read once (a throwing outer getter resolves typed `invalid`, never a raw
  //     throw), canonicalize into a private fresh Map of frozen exact records.
  let sourceResult: ReturnType<typeof canonicalizeSourceById>;
  try {
    sourceResult = canonicalizeSourceById(input.currentSourceById);
  } catch (e) {
    return { ok: false, rejection: rejectedService('invalid', `currentSourceById could not be read: ${classifyStudyError(e)}`) };
  }
  if (!sourceResult.ok) {
    return { ok: false, rejection: rejectedService('invalid', sourceResult.reason) };
  }

  // (4) now — read once into a scalar local; a throwing clock accessor or non-finite value resolves
  //     typed `non-finite-clock` before any DB access, never a raw throw.
  let now: number;
  try {
    now = input.now;
  } catch (e) {
    return { ok: false, rejection: rejectedService('non-finite-clock', `session checkpoint clock \`now\` threw: ${classifyStudyError(e)}`) };
  }
  if (!Number.isFinite(now)) {
    return { ok: false, rejection: rejectedService('non-finite-clock', `session checkpoint clock \`now\` must be finite, got ${safeDiag(now)}`) };
  }

  return { ok: true, canonical: { attempt, config, now, sourceById: sourceResult.map } };
}

/**
 * Atomically score one completed due target. See the block comment above for the full contract.
 * Returns a typed `SrsAttemptServiceResult`: exactly `applied` mutates storage (carrying the next
 * schedule row and advanced session checkpoint); every other outcome leaves all three practice stores
 * byte-identical.
 */
export async function completeStudySrsAttempt(
  input: CompleteStudySrsAttemptInput,
): Promise<SrsAttemptServiceResult> {








  const canonicalization = canonicalizeCompleteInput(input);
  if (!canonicalization.ok) {
    return canonicalization.rejection;
  }
  const { attempt, config, now, sourceById } = canonicalization.canonical;




  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch (e) {
    return rejectedService('db-open-failed', `could not open study database: ${classifyStudyError(e)}`);
  }

  const result = await new Promise<SrsAttemptServiceResult>((resolve) => {
    // A DECIDED rejection (from abortWith) resolves from any terminal event. The APPLIED result is
    // kept separate and resolves ONLY from tx.oncomplete (a successful commit) — so if the SRS/session
    // writes are issued but the transaction later aborts, the applied result is discarded and the
    // caller sees 'transaction-failed', never a false 'applied' (the atomicity guarantee).
    let decided: SrsAttemptServiceRejected | null = null;
    let appliedResult: SrsAttemptServiceResult | null = null;
    let duplicate = false;

    let tx: IDBTransaction;
    try {
      tx = db.transaction(
        ['study-practice-attempts', 'study-practice-srs', 'study-practice-sessions'],
        'readwrite',
      );
    } catch (e) {
      resolve(rejectedService('transaction-failed', `could not open transaction: ${classifyStudyError(e)}`));
      return;
    }
    // Guard the object-store acquisitions (B4BF11 LOW sweep — same class as the enrollment seam). A
    // missing/renamed expected store makes `tx.objectStore()` throw NotFoundError; convert it to a typed
    // `transaction-failed` instead of a raw reject. No request has been issued yet, so nothing committed.
    let attemptsStore: IDBObjectStore;
    let srsStore: IDBObjectStore;
    let sessionsStore: IDBObjectStore;
    try {
      attemptsStore = tx.objectStore('study-practice-attempts');
      srsStore = tx.objectStore('study-practice-srs');
      sessionsStore = tx.objectStore('study-practice-sessions');
    } catch (e) {
      resolve(rejectedService('transaction-failed', `could not acquire a practice object store: ${classifyStudyError(e)}`));
      return;
    }

    const duplicateResult = (): SrsAttemptServiceResult =>
      rejectedService('duplicate', `attempt "${attempt.attemptId}" already exists; nothing changed`);

    // Abort the WHOLE transaction (rolls back every write issued so far) and remember the typed
    // rejection so tx.onabort resolves it.
    const abortWith = (r: SrsAttemptServiceRejected): void => {
      decided = r;
      try { tx.abort(); } catch { /* transaction may already be inactive */ }
    };

    tx.oncomplete = () => {
      if (decided) { resolve(decided); return; }
      if (duplicate) { resolve(duplicateResult()); return; }
      if (appliedResult) { resolve(appliedResult); return; }
      // The transaction committed but no outcome was recorded — a coding invariant violation.
      resolve(rejectedService('transaction-failed', 'transaction completed before an outcome was decided'));
    };
    tx.onerror = () => {
      if (decided) { resolve(decided); return; }
      if (duplicate) { resolve(duplicateResult()); return; }
      // A write that was issued but never committed (appliedResult set, then the tx failed) MUST NOT
      // report 'applied' — fall through to transaction-failed.
      recordStudyTxFail(tx, 'onerror', 'srs-complete');
      resolve(rejectedService('transaction-failed', `transaction failed: ${tx.error?.name ?? 'UnknownError'}`));
    };
    tx.onabort = () => {
      if (decided) { resolve(decided); return; }
      if (duplicate) { resolve(duplicateResult()); return; }
      recordStudyTxFail(tx, 'onabort', 'srs-complete');
      resolve(rejectedService('transaction-failed', `transaction aborted: ${tx.error?.name ?? 'AbortError'}`));
    };

    // --- Step 1: append-only attempt write FIRST (memo item 1). A ConstraintError = duplicate key =
    //     idempotent no-op: preventDefault keeps the transaction alive, we issue NO further writes, and
    //     the original row survives byte-identical. Any other add error / a synchronous throw aborts. ---
    let addReq: IDBRequest;
    try {
      addReq = attemptsStore.add(asPersistableAttemptRecord(attempt));
    } catch (e) {
      abortWith(rejectedService('transaction-failed', `attempt add threw: ${classifyStudyError(e)}`));
      return;
    }
    addReq.onerror = (event: Event) => {
      const err = addReq.error;
      if (err && err.name === 'ConstraintError') {
        duplicate = true;
        event.preventDefault(); // keep the tx alive; it will complete having written nothing
        return;
      }
      // A non-duplicate request error is left to abort the transaction (tx.onabort/onerror handle it).
    };

    // --- Step 2 (issued in parallel with the add): read the current SRS row + the session row. ---
    let current: SrsScheduleRecord | undefined;
    let sessionRaw: unknown;
    let pendingReads = 2;
    let addSettled = false;
    let addSucceeded = false;

    const maybeProceed = (): void => {
      if (decided || duplicate) return;         // duplicate short-circuits: never advance SRS/session
      if (!addSettled || pendingReads > 0) return;
      if (!addSucceeded) return;                 // a non-duplicate add failure already aborted
      proceed();
    };




    let getSrsReq: IDBRequest;
    let getSessReq: IDBRequest;
    try {
      getSrsReq = srsStore.get(attempt.targetId);
      getSessReq = sessionsStore.get(attempt.sessionId);
    } catch (e) {
      abortWith(rejectedService('transaction-failed', `read issuance threw: ${classifyStudyError(e)}`));
      return;
    }
    getSrsReq.onsuccess = () => { current = getSrsReq.result as SrsScheduleRecord | undefined; pendingReads -= 1; maybeProceed(); };
    getSrsReq.onerror = () => abortWith(rejectedService('transaction-failed', `srs read failed: ${getSrsReq.error?.name ?? 'UnknownError'}`));
    getSessReq.onsuccess = () => { sessionRaw = getSessReq.result; pendingReads -= 1; maybeProceed(); };
    getSessReq.onerror = () => abortWith(rejectedService('transaction-failed', `session read failed: ${getSessReq.error?.name ?? 'UnknownError'}`));

    addReq.onsuccess = () => { addSettled = true; addSucceeded = true; maybeProceed(); };
    // If the add errors, addReq.onerror above runs first; mark it settled (non-success) so maybeProceed
    // does not advance. A ConstraintError sets duplicate=true (handled by maybeProceed's early return).
    const originalOnError = addReq.onerror;
    addReq.onerror = (event: Event) => {
      addSettled = true;
      addSucceeded = false;
      (originalOnError as (e: Event) => void).call(addReq, event);
      maybeProceed();
    };

    function proceed(): void {
      // Enrollment + session existence (memo: "no row" is never a valid completion target).
      if (current === undefined) { abortWith(rejectedService('schedule-not-found', `no enrolled SRS row for target "${attempt.targetId}"`)); return; }
      if (sessionRaw === undefined) { abortWith(rejectedService('session-not-found', `no session row for "${attempt.sessionId}"`)); return; }







      const storedFailure = validateStoredScheduleRow(current);
      if (storedFailure) {
        abortWith(rejectedService('invalid', `stored SRS row failed validation at ${storedFailure.path}: ${storedFailure.reason}`));
        return;
      }

      // Untrusted persisted session goes through the B4a read-boundary validator (typed, never throws).
      const sessionResult = validatePersistedSessionRow(sessionRaw);
      if (!sessionResult.ok) {
        abortWith(rejectedService('session-invalid', `persisted session failed validation: ${sessionResult.failure.reason}`, { sessionFailure: sessionResult.failure }));
        return;
      }
      const session = sessionResult.value;
      const plan = session.plan;

      // The completing target must be the session's NEXT unattempted scored entry, or advancing the
      // checkpoint would break the S10 cursor–ledger prefix invariant.
      const cursor = session.progress.entryCursor;
      const expectedEntry = plan.entries[cursor];
      if (!expectedEntry || expectedEntry.targetId !== attempt.targetId) {
        abortWith(rejectedService('session-cursor-mismatch', `completing target "${attempt.targetId}" is not the session's next entry (cursor ${cursor} expects "${expectedEntry?.targetId ?? '<end>'}")`));
        return;
      }















      let transition: ReturnType<typeof transitionSchedule>;
      try {
        transition = transitionSchedule(current, attempt, config);
      } catch (e) {
        abortWith(rejectedService('transaction-failed', `kernel threw: ${classifyStudyError(e)}`));
        return;
      }
      if (transition.outcome !== 'applied') {
        // 'duplicate' here is the in-record lastAttemptId signal (the attempt row was somehow missing
        // yet the SRS already names it) — still a no-op; 'stale'/'inactive'/'invalid' reject likewise.
        abortWith(rejectedService(transition.outcome, `kernel rejected completion: ${transition.outcome}${'reason' in transition && transition.reason ? ` (${transition.reason})` : ''}`));
        return;
      }
      const next = transition.next;


















      const derivedFailure = validateStoredScheduleRow(next);
      if (derivedFailure) {
        abortWith(rejectedService('invalid', `kernel-derived SRS row failed validation at ${derivedFailure.path}: ${derivedFailure.reason}`));
        return;
      }

      // --- Real-map B3 composition: build a LIVE schedule map from actual current SRS rows for every
      //     plan entry (NOT from the plan's own frozen snapshots — that made the read-boundary
      //     composition tautological/dead), then revalidate. Gate on the completing target only: a
      //     stale unrelated entry is revalidated when it is itself reached, not here. ---
      const liveMap = new Map<string, SrsScheduleRecord>();
      liveMap.set(current.targetId, current);
      const otherTargetIds = plan.entries
        .map(e => e.targetId)
        .filter(id => id !== current!.targetId);

      const finishApply = (): void => {
        if (decided) return;








        let revalidation: ReturnType<typeof revalidateTraversalPlan>;
        try {
          revalidation = revalidateTraversalPlan(plan, liveMap, sourceById);
        } catch (e) {
          abortWith(rejectedService('transaction-failed', `plan revalidation threw: ${classifyStudyError(e)}`));
          return;
        }
        const staleForCompleting = revalidation.invalidEntries.filter(e => e.targetId === attempt.targetId);
        if (staleForCompleting.length > 0) {
          abortWith(rejectedService('plan-stale', `plan revalidation invalidated completing target: ${staleForCompleting.map(e => e.reason).join('; ')}`, {
            staleTargetIds: revalidation.invalidEntries.map(e => e.targetId),
          }));
          return;
        }





        try {
          const progress = session.progress;
          const nextProgress: SrsSessionProgress = {
            entryCursor: progress.entryCursor + 1,
            completedTargetIds: [...progress.completedTargetIds, attempt.targetId],
            appliedAttemptIds: [...progress.appliedAttemptIds, attempt.attemptId],
          };
          const allDone = nextProgress.entryCursor === session.targetCount;
          const nextSession: SrsPracticeSessionRow = {
            ...session,
            state: allDone ? 'completed' : 'active',
            updatedAt: now,
            progress: nextProgress,
          };

          // Same-transaction writes: advanced SRS row + advanced session checkpoint. The attempt was
          // already appended in step 1. tx.oncomplete resolves the applied result once all three commit.
          srsStore.put(asPersistableScheduleRecord(next));
          sessionsStore.put(nextSession);
          // Stage (do not resolve) the applied result: tx.oncomplete resolves it only if BOTH writes
          // commit; a later abort discards it and yields 'transaction-failed'.
          appliedResult = { outcome: 'applied', nextSchedule: next, nextSession };
        } catch (e) {
          abortWith(rejectedService('transaction-failed', `checkpoint construction/write threw: ${classifyStudyError(e)}`));
          return;
        }
      };

      if (otherTargetIds.length === 0) { finishApply(); return; }
      let pendingOther = otherTargetIds.length;


      try {
        for (const id of otherTargetIds) {
          const req = srsStore.get(id);
          req.onsuccess = () => {
            const row = req.result as SrsScheduleRecord | undefined;
            if (row) liveMap.set(id, row);
            pendingOther -= 1;
            if (pendingOther === 0) finishApply();
          };
          req.onerror = () => abortWith(rejectedService('transaction-failed', `live schedule read failed for "${id}": ${req.error?.name ?? 'UnknownError'}`));
        }
      } catch (e) {
        abortWith(rejectedService('transaction-failed', `live schedule read issuance threw: ${classifyStudyError(e)}`));
        return;
      }
    }
  });

  // B7 enqueue-after-commit (binding rule 1): the applied result resolves ONLY from tx.oncomplete, so
  // this enqueue runs strictly after the attempt/SRS/session writes are durably committed. Any
  // non-applied outcome enqueues nothing.
  if (result.outcome === 'applied') {
    enqueueStudyPracticeOutboxItems(buildSrsCompletionOutboxItems(result, attempt));
  }
  return result;
}

























































/** Input to the atomic enrollment service. All rows are caller-supplied and validated internally; the
 *  initial SRS rows carry their own enrollment state (see the block comment's rule-4 note). */
export interface EnrollStudyPracticeLessonInput {
  readonly lesson: StudyPracticeLessonRow;
  readonly decisions: readonly StudyPracticeDecisionRow[];
  readonly srsRows: readonly SrsScheduleRecord[];
}

export type EnrollStudyPracticeLessonOutcome =
  /** Lesson row + all decision rows + all initial SRS rows committed together in one transaction. */
  | 'enrolled'
  /** Pre-DB canonical validation or cross-row coherence failed. Zero writes — no transaction opened. */
  | 'invalid'
  /** A lessonId/decisionId/targetId already existed (append-only ConstraintError). Whole transaction
   *  aborted: NOTHING committed in any store (a partial enrollment is impossible). */
  | 'duplicate'
  /** The IndexedDB database could not be opened/upgraded BEFORE any transaction was created. Zero writes. */
  | 'db-open-failed'
  /** The IndexedDB transaction errored/aborted (raw storage failure). Zero committed writes. */
  | 'transaction-failed';

export interface EnrollStudyPracticeLessonResult {
  readonly outcome: EnrollStudyPracticeLessonOutcome;
  readonly reason?: string;
}

function rejectedEnrollment(
  outcome: Exclude<EnrollStudyPracticeLessonOutcome, 'enrolled'>,
  reason: string,
): EnrollStudyPracticeLessonResult {
  return { outcome, reason };
}

const LESSON_ROW_KEYS = ['lessonId', 'studyItemId', 'chapterId', 'updatedAt'] as const;

/** Total service-side shape validator for a caller-supplied `study-practice-lessons` row: closed record,
 *  non-empty identity strings, optional `chapterId` string, finite `updatedAt`. Reuses the shared B4a
 *  read-boundary helpers so there is one rule set; never throws (a defensive catch converts any
 *  unexpected error). */
function validateLessonRowShape(v: unknown): SrsPersistenceFailure | null {
  try {
    if (!isPlainObject(v)) return mkFail('not-an-object', 'lesson', 'lesson row is not a plain object');
    const extra = rejectUnknownKeys(v, LESSON_ROW_KEYS, 'lesson');
    if (extra) return extra;
    if (!isNonEmptyString(v.lessonId)) return mkFail('missing-required-string', 'lesson.lessonId', 'lessonId is missing/empty');
    if (!isNonEmptyString(v.studyItemId)) return mkFail('missing-required-string', 'lesson.studyItemId', 'studyItemId is missing/empty');
    if (v.chapterId !== undefined && !isNonEmptyString(v.chapterId)) {
      return mkFail('missing-required-string', 'lesson.chapterId', 'chapterId, when present, must be a non-empty string');
    }
    if (!isFiniteNumber(v.updatedAt)) return mkFail('non-finite-number', 'lesson.updatedAt', 'updatedAt must be a finite number');
    return null;
  } catch (e) {
    return mkFail('not-an-object', 'lesson', `unexpected lesson validation error: ${classifyStudyError(e)}`);
  }
}

const DECISION_ROW_KEYS = ['decisionId', 'lessonId', 'chapterId', 'sourceLineageId', 'status', 'updatedAt', 'authoredPath', 'uci', 'role', 'trainability'] as const;

/** Total service-side shape validator for a caller-supplied `study-practice-decisions` row: closed
 *  record, non-empty identity/lineage/status strings, optional `chapterId` string, optional finite
 *  `updatedAt`. Same helper set as the lesson/schedule validators; never throws. */
function validateDecisionRowShape(v: unknown, path: string): SrsPersistenceFailure | null {
  try {
    if (!isPlainObject(v)) return mkFail('not-an-object', path, 'decision row is not a plain object');
    const extra = rejectUnknownKeys(v, DECISION_ROW_KEYS, path);
    if (extra) return extra;
    if (!isNonEmptyString(v.decisionId)) return mkFail('missing-required-string', `${path}.decisionId`, 'decisionId is missing/empty');
    if (!isNonEmptyString(v.lessonId)) return mkFail('missing-required-string', `${path}.lessonId`, 'lessonId is missing/empty');
    if (v.chapterId !== undefined && !isNonEmptyString(v.chapterId)) {
      return mkFail('missing-required-string', `${path}.chapterId`, 'chapterId, when present, must be a non-empty string');
    }
    if (!isNonEmptyString(v.sourceLineageId)) return mkFail('missing-required-string', `${path}.sourceLineageId`, 'sourceLineageId is missing/empty');
    if (!isNonEmptyString(v.status)) return mkFail('missing-required-string', `${path}.status`, 'status is missing/empty');
    if (v.updatedAt !== undefined && !isFiniteNumber(v.updatedAt)) {
      return mkFail('non-finite-number', `${path}.updatedAt`, 'updatedAt, when present, must be a finite number');
    }



    const authoredPath = v.authoredPath;
    if (authoredPath !== undefined) {
      if (typeof authoredPath !== 'string' || !isNonEmptyString(authoredPath)) {
        return mkFail('missing-required-string', `${path}.authoredPath`, 'authoredPath, when present, must be a non-empty string');
      }
      if (authoredPath.length % 2 !== 0) {
        return mkFail('missing-required-string', `${path}.authoredPath`, 'authoredPath, when present, must be a concatenation of 2-char node ids (even length)');
      }
    }
    if (v.uci !== undefined && !isNonEmptyString(v.uci)) {
      return mkFail('missing-required-string', `${path}.uci`, 'uci, when present, must be a non-empty string');
    }
    if (v.role !== undefined && !isNonEmptyString(v.role)) {
      return mkFail('missing-required-string', `${path}.role`, 'role, when present, must be a non-empty string');
    }
    if (v.trainability !== undefined && !isNonEmptyString(v.trainability)) {
      return mkFail('missing-required-string', `${path}.trainability`, 'trainability, when present, must be a non-empty string');
    }
    return null;
  } catch (e) {
    return mkFail('not-an-object', path, `unexpected decision validation error: ${classifyStudyError(e)}`);
  }
}

/** Getter-free canonical capture of every enrollment input, or a typed pre-DB rejection. */
interface CanonicalEnrollInput {
  readonly lesson: StudyPracticeLessonRow;
  readonly decisions: readonly StudyPracticeDecisionRow[];
  readonly srsRows: readonly SrsScheduleRecord[];
}
type EnrollCanonicalizeResult =
  | { readonly ok: true; readonly canonical: CanonicalEnrollInput }
  | { readonly ok: false; readonly rejection: EnrollStudyPracticeLessonResult };

/**
 * The ONE synchronous canonicalization seam for enrollment (mirrors `canonicalizeCompleteInput`). Reads
 * each outer property in the fixed order lesson → decisions → srsRows, AT MOST ONCE each, cloning
 * composites immediately so a later outer getter cannot mutate an earlier still-raw object; validates
 * ONLY the canonical captures with the shared validator families; deep-freezes the accepted graphs; and
 * enforces cross-row coherence. Any failure resolves a typed pre-DB `invalid` rejection — never a raw
 * throw. Its successful return is the proof boundary: the service consumes only `canonical`.
 */
function canonicalizeEnrollInput(input: EnrollStudyPracticeLessonInput): EnrollCanonicalizeResult {
  // (1) lesson — read once, clone immediately, validate the clone, deep-freeze.
  let lesson: StudyPracticeLessonRow;
  try {
    lesson = structuredClone(input.lesson) as StudyPracticeLessonRow;
  } catch (e) {
    return { ok: false, rejection: rejectedEnrollment('invalid', `lesson could not be snapshotted: ${classifyStudyError(e)}`) };
  }
  const lessonFailure = validateLessonRowShape(lesson);
  if (lessonFailure) {
    return { ok: false, rejection: rejectedEnrollment('invalid', `lesson failed validation at ${lessonFailure.path}: ${lessonFailure.reason}`) };
  }
  deepFreeze(lesson);

  // (2) decisions — read once, clone the WHOLE array as ONE graph, own-key-exact + per-element valid.
  let decisions: StudyPracticeDecisionRow[];
  try {
    decisions = structuredClone(input.decisions) as StudyPracticeDecisionRow[];
  } catch (e) {
    return { ok: false, rejection: rejectedEnrollment('invalid', `decisions could not be snapshotted: ${classifyStudyError(e)}`) };
  }
  if (!Array.isArray(decisions)) {
    return { ok: false, rejection: rejectedEnrollment('invalid', 'decisions must be an array') };
  }
  const decisionsKeyFail = rejectNonIndexArrayKeys(decisions, 'decisions');
  if (decisionsKeyFail) {
    return { ok: false, rejection: rejectedEnrollment('invalid', `decisions array invalid at ${decisionsKeyFail.path}: ${decisionsKeyFail.reason}`) };
  }
  for (let i = 0; i < decisions.length; i++) {
    const f = validateDecisionRowShape(decisions[i], `decisions[${i}]`);
    if (f) return { ok: false, rejection: rejectedEnrollment('invalid', `decision failed validation at ${f.path}: ${f.reason}`) };
  }
  deepFreeze(decisions);









  let srsRows: SrsScheduleRecord[];
  try {
    srsRows = structuredClone(input.srsRows) as SrsScheduleRecord[];
  } catch (e) {
    return { ok: false, rejection: rejectedEnrollment('invalid', `initial SRS rows could not be snapshotted: ${classifyStudyError(e)}`) };
  }
  if (!Array.isArray(srsRows)) {
    return { ok: false, rejection: rejectedEnrollment('invalid', 'srsRows must be an array') };
  }
  const srsKeyFail = rejectNonIndexArrayKeys(srsRows, 'srsRows');
  if (srsKeyFail) {
    return { ok: false, rejection: rejectedEnrollment('invalid', `srsRows array invalid at ${srsKeyFail.path}: ${srsKeyFail.reason}`) };
  }
  for (let i = 0; i < srsRows.length; i++) {
    const f = validateInitialEnrollmentRow(srsRows[i]);
    if (f) return { ok: false, rejection: rejectedEnrollment('invalid', `initial SRS row [${i}] failed validation at ${f.path}: ${f.reason}`) };
  }
  deepFreeze(srsRows);













  const decisionIds = new Set<string>();
  for (const d of decisions) {
    if (d.lessonId !== lesson.lessonId) {
      return { ok: false, rejection: rejectedEnrollment('invalid', `decision "${safeDiag(d.decisionId)}" lessonId "${safeDiag(d.lessonId)}" does not match lesson "${safeDiag(lesson.lessonId)}"`) };
    }
    decisionIds.add(d.decisionId);
  }
  for (const row of srsRows) {
    if (!decisionIds.has(row.targetId)) {
      return { ok: false, rejection: rejectedEnrollment('invalid', `initial SRS row targetId "${safeDiag(row.targetId)}" is not one of the enrolled decisions`) };
    }
    if (row.lessonId !== lesson.lessonId) {
      return { ok: false, rejection: rejectedEnrollment('invalid', `initial SRS row "${safeDiag(row.targetId)}" lessonId "${safeDiag(row.lessonId)}" does not match lesson "${safeDiag(lesson.lessonId)}"`) };
    }
  }

  return { ok: true, canonical: { lesson, decisions, srsRows } };
}

/**
 * Atomically enroll one lesson: its lesson row, decision-identity rows, and initial SRS schedule rows,
 * ALL in one IndexedDB transaction. See the block comment above for the full contract. Returns a typed
 * `EnrollStudyPracticeLessonResult`: exactly `enrolled` mutates storage; every other outcome leaves all
 * three practice stores byte-identical (a partial enrollment is impossible).
 */
export async function enrollStudyPracticeLesson(
  input: EnrollStudyPracticeLessonInput,
): Promise<EnrollStudyPracticeLessonResult> {
  // --- Single synchronous canonicalization seam. Reads each outer property at most once, clones + deep-
  //     freezes the captures, validates ONLY the getter-free canonical graphs and their cross-row
  //     coherence, all BEFORE the sole `await openDb()`. Any malformed/incoherent input resolves a typed
  //     pre-DB `invalid`, never a raw throw. Past this point the service consults ONLY `canonical`. ---
  const canonicalization = canonicalizeEnrollInput(input);
  if (!canonicalization.ok) {
    return canonicalization.rejection;
  }
  const { lesson, decisions, srsRows } = canonicalization.canonical;

  // openDb() is the ONLY await, BEFORE the transaction is created. A DB open/upgrade failure resolves a
  // typed `db-open-failed` result rather than rejecting raw.
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch (e) {
    return rejectedEnrollment('db-open-failed', `could not open study database: ${classifyStudyError(e)}`);
  }

  const result = await new Promise<EnrollStudyPracticeLessonResult>((resolve) => {
    // A DECIDED rejection (from abortWith on a synchronous issuance throw) resolves from the terminal
    // event. A `duplicateKey` (first ConstraintError) resolves a typed `duplicate` from onabort/onerror.
    // Success resolves 'enrolled' ONLY from tx.oncomplete — all three stores committed together.
    let decided: EnrollStudyPracticeLessonResult | null = null;
    let duplicateKey: string | null = null;

    let tx: IDBTransaction;
    try {
      tx = db.transaction(
        ['study-practice-lessons', 'study-practice-decisions', 'study-practice-srs'],
        'readwrite',
      );
    } catch (e) {
      resolve(rejectedEnrollment('transaction-failed', `could not open transaction: ${classifyStudyError(e)}`));
      return;
    }
    // Guard the object-store acquisitions (B4BF11 LOW). A missing/renamed expected store makes
    // `tx.objectStore()` throw NotFoundError; outside a guard that raw-rejects the enrollment promise
    // instead of the service's typed result. Convert it to a typed `transaction-failed` — no add() has
    // been issued yet, so nothing committed.
    let lessonsStore: IDBObjectStore;
    let decisionsStore: IDBObjectStore;
    let srsStore: IDBObjectStore;
    try {
      lessonsStore = tx.objectStore('study-practice-lessons');
      decisionsStore = tx.objectStore('study-practice-decisions');
      srsStore = tx.objectStore('study-practice-srs');
    } catch (e) {
      resolve(rejectedEnrollment('transaction-failed', `could not acquire a practice object store: ${classifyStudyError(e)}`));
      return;
    }

    const duplicateResult = (): EnrollStudyPracticeLessonResult =>
      rejectedEnrollment('duplicate', `${duplicateKey} already exists; nothing committed (append-only enrollment)`);

    // Abort the WHOLE transaction (rolls back every add issued so far) and remember the typed rejection
    // so tx.onabort resolves it — a partial enrollment can never survive.
    const abortWith = (r: EnrollStudyPracticeLessonResult): void => {
      decided = r;
      try { tx.abort(); } catch { /* transaction may already be inactive */ }
    };

    tx.oncomplete = () => {
      if (decided) { resolve(decided); return; }
      if (duplicateKey) { resolve(duplicateResult()); return; }
      resolve({ outcome: 'enrolled' });
    };
    tx.onerror = () => {
      if (decided) { resolve(decided); return; }
      if (duplicateKey) { resolve(duplicateResult()); return; }
      recordStudyTxFail(tx, 'onerror', 'srs-enroll');
      resolve(rejectedEnrollment('transaction-failed', `transaction failed: ${tx.error?.name ?? 'UnknownError'}`));
    };
    tx.onabort = () => {
      if (decided) { resolve(decided); return; }
      if (duplicateKey) { resolve(duplicateResult()); return; }
      recordStudyTxFail(tx, 'onabort', 'srs-enroll');
      resolve(rejectedEnrollment('transaction-failed', `transaction aborted: ${tx.error?.name ?? 'AbortError'}`));
    };

    // add()-only append: a duplicate key raises a ConstraintError that is NOT preventDefault()'d, so it
    // aborts the WHOLE transaction (rolling back any rows already added) — the first duplicate's label is
    // remembered so tx.onabort resolves a typed `duplicate`. A synchronous issuance throw aborts likewise
    // as `transaction-failed`. Returns false when it aborted so the caller stops issuing further writes.
    const addGuarded = (store: IDBObjectStore, value: unknown, label: string): boolean => {
      let req: IDBRequest;
      try {
        req = store.add(value);
      } catch (e) {
        abortWith(rejectedEnrollment('transaction-failed', `${label} add threw: ${classifyStudyError(e)}`));
        return false;
      }
      req.onerror = () => {
        const err = req.error;
        if (err && err.name === 'ConstraintError' && duplicateKey === null) {
          // Remember the duplicate; do NOT preventDefault => the ConstraintError aborts the whole tx.
          duplicateKey = label;
        }
        // Any non-duplicate request error is left to abort the transaction (tx.onabort/onerror handle it).
      };
      return true;
    };

    // Issue every add inside the single transaction, in a fixed order (lesson → decisions → SRS). The
    // SRS rows funnel through the closed-record persistence guard so no chess material can be smuggled on.
    if (!addGuarded(lessonsStore, lesson, `lesson "${lesson.lessonId}"`)) return;
    for (const d of decisions) {
      if (!addGuarded(decisionsStore, d, `decision "${d.decisionId}"`)) return;
    }
    for (const row of srsRows) {
      if (!addGuarded(srsStore, asPersistableScheduleRecord(row), `srs "${row.targetId}"`)) return;
    }
  });

  // B7 enqueue-after-commit (binding rule 1): 'enrolled' resolves ONLY from tx.oncomplete, so this
  // enqueue runs strictly after the lesson/decision/SRS rows are durably committed. A duplicate or
  // failed enrollment enqueues nothing.
  if (result.outcome === 'enrolled') {
    enqueueStudyPracticeOutboxItems(buildEnrollmentOutboxItems(lesson, decisions, srsRows));
  }
  return result;
}


















/** Lightweight, non-authoritative study metadata for the verified Lichess Library cache. */
export interface CachedLichessStudyMetadata {
  readonly studyId: string;
  readonly title: string;
  readonly author: string;
  readonly chapterList: readonly string[];
  readonly revisionCursor: number;
  readonly fetchedAt: number;
}

/** Max cache entries before LRU eviction (bounded per AP-7). */
export const LICHESS_LIBRARY_CACHE_MAX_ENTRIES = 200;

// Insertion-ordered Map used as an LRU: a `get` re-inserts (moves the key to the newest position); a
// `put` beyond the cap evicts the oldest (first) key. Module-scoped so it is session-lived, never
// persisted and never synced.
const lichessStudyMetadataCache = new Map<string, CachedLichessStudyMetadata>();

/** Insert/update a cached metadata entry, evicting the oldest entries past the bound (LRU). */
export function putLichessStudyMetadata(entry: CachedLichessStudyMetadata): void {
  // Refresh recency: delete any existing entry so the re-insert appends at the newest position.
  lichessStudyMetadataCache.delete(entry.studyId);
  lichessStudyMetadataCache.set(entry.studyId, entry);
  while (lichessStudyMetadataCache.size > LICHESS_LIBRARY_CACHE_MAX_ENTRIES) {
    const oldest = lichessStudyMetadataCache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    lichessStudyMetadataCache.delete(oldest);
  }
}

/** Read a cached metadata entry and mark it most-recently-used. */
export function getLichessStudyMetadata(studyId: string): CachedLichessStudyMetadata | undefined {
  const entry = lichessStudyMetadataCache.get(studyId);
  if (entry === undefined) return undefined;
  lichessStudyMetadataCache.delete(studyId);
  lichessStudyMetadataCache.set(studyId, entry);
  return entry;
}

/**
 * Drop a cached entry — used when a linked source is removed / turned private on refresh (§5: drop
 * cached metadata, never serve stale private content). This NEVER cascades into any local Study or
 * lesson deletion; it only clears the evictable metadata cache.
 */
export function dropLichessStudyMetadata(studyId: string): void {
  lichessStudyMetadataCache.delete(studyId);
}

/** Clear the entire cache (test/reset seam). */
export function clearLichessStudyMetadataCache(): void {
  lichessStudyMetadataCache.clear();
}

/** Current cache size (bounds/eviction assertions). */
export function lichessStudyMetadataCacheSize(): number {
  return lichessStudyMetadataCache.size;
}

export type StudyMetadataFreshness = 'current' | 'stale' | 'unknown';

/**
 * Compare a cached revision cursor against the freshly-resolved one. A non-finite cursor is 'unknown'
 * (never silently treated as current); a higher current revision is 'stale'. This is how the client
 * surfaces "may be out of date" without ever serving stale content as current.
 */
export function classifyStudyMetadataFreshness(
  cachedRevision: number,
  currentRevision: number,
): StudyMetadataFreshness {
  if (!Number.isFinite(cachedRevision) || !Number.isFinite(currentRevision)) return 'unknown';
  if (currentRevision > cachedRevision) return 'stale';
  return 'current';
}


















/** Bounded read caps for the local-leg assembly (CR-2: never getAll() an entire store). */
const MERGE_LOCAL_LESSON_LIMIT = 500;
const MERGE_LOCAL_DECISION_LIMIT = 2000;
const MERGE_LOCAL_ATTEMPT_LIMIT = 500;

/** New/replacement decision rows are created UNTRAINABLE (never auto-enrolled): the absence of an SRS
 *  row is the not-enrolled signal, and this freeform lifecycle status records the intent honestly. */
const MERGE_UNTRAINABLE_STATUS = 'untrainable';
const MERGE_ARCHIVED_STATUS = 'archived';













export async function assembleLocalMergeState(studyItemId: string): Promise<LocalMergeState | undefined> {
  const item = await getStudy(studyItemId);
  if (item === undefined) return undefined;

  const lessons = await listPracticeLessonsByStudyItem(studyItemId, MERGE_LOCAL_LESSON_LIMIT);
  const primaryLessonId = lessons[0]?.lessonId ?? studyItemId;

  const decisions: LocalDecisionState[] = [];
  for (const lesson of lessons) {
    const rows = await listPracticeDecisionsByLesson(lesson.lessonId, MERGE_LOCAL_DECISION_LIMIT);
    for (const row of rows) {
      const srs = await getPracticeSrs(row.decisionId);
      const attempts = await listPracticeAttemptsByDecision(row.decisionId, MERGE_LOCAL_ATTEMPT_LIMIT);
      decisions.push({
        decisionId: row.decisionId,
        ...(row.status !== undefined ? { status: row.status } : {}),
        ...(srs !== undefined ? { srs } : {}),
        ...(attempts.length > 0 ? { attempts } : {}),
      });
    }
  }

  return {
    studyItemId,
    lessonId: primaryLessonId,
    decisions,
    ...(item.notes !== undefined ? { notes: item.notes } : {}),
    ...(item.localProvenanceLayers !== undefined ? { localProvenanceLayers: item.localProvenanceLayers } : {}),
    ...(item.linkedSourceProvenance !== undefined ? { linkedSourceProvenance: item.linkedSourceProvenance } : {}),
  };
}

/** Outcome tally of an applied merge (diagnostic; the writes themselves are the effect). */
export interface MergeApplyResult {
  readonly newDecisions: number;
  readonly archivedDecisions: number;
  readonly suspendedSchedules: number;
  readonly archivedSchedules: number;
  readonly provenanceStamped: boolean;
}

/** Build a fresh, UNTRAINABLE decision row for a new/replacement decision. Never reuses an archived id;
 *  never creates an SRS row (so it is not auto-enrolled). */
function buildUntrainableDecisionRow(
  decisionId: string,
  lessonId: string,
  chapterId: string | undefined,
  sourceLineageId: string,
  now: number,
): StudyPracticeDecisionRow {
  return {
    decisionId,
    lessonId,
    ...(chapterId !== undefined ? { chapterId } : {}),
    sourceLineageId,
    status: MERGE_UNTRAINABLE_STATUS,
    updatedAt: now,
  };
}

/** Flip a schedule row to a non-active status WITHOUT touching progress identity (level/step/streak) —
 *  training is halted, the row is kept, attempts are never read/mutated. Funnels through the closed-record
 *  guard via `savePracticeSrs`. */
function toInactiveSchedule(
  rec: SrsScheduleRecord,
  status: 'suspended' | 'archived',
  now: number,
): SrsScheduleRecord {
  return { ...rec, status, dueAt: rec.dueAt, updatedAt: now };
}

/**
 * Apply an EXPLICITLY-ACCEPTED merge plan onto EXISTING practice stores, append-only. This is the gated
 * write path: it accepts ONLY an `AcceptedMergePlan` (mintable solely via `acceptMergePlan`), is NEVER
 * auto-called (no producer path invokes it), and NEVER routes through the flat `saveOrpLineToLibrary`
 * overwrite (which would drop `linkedSourceProvenance` and clobber My-notes). Per class:
 *   - new-in-source / expected-move-or-path-change(added) → `savePracticeDecision` (fresh id, untrainable,
 *     NO SRS row → not auto-enrolled);
 *   - expected-move-or-path-change(removed) → KEEP the old decision row, flip status → archived (id never
 *     reused), and archive its SRS row (append-only history; no delete);
 *   - removed / ambiguous(removed) → SRS row → suspended (training halted), decision row + attempts + notes
 *     preserved, NO delete;
 *   - ambiguous(added) → NO automatic write (routes to explicit update review — zero mastery transfer);
 *   - unchanged / presentation-only-change → SRS UNTOUCHED (progress preserved);
 *   - provenance → re-stamp ONLY `linkedSourceProvenance` by MERGING onto the existing StudyItem, so
 *     My-analysis / My-notes layers and free-text notes survive verbatim.
 */
export async function applyAcceptedMerge(accepted: AcceptedMergePlan): Promise<MergeApplyResult> {
  const plan: MergePlan = acceptedPlan(accepted);
  const now = Date.now();
  let newDecisions = 0;
  let archivedDecisions = 0;
  let suspendedSchedules = 0;
  let archivedSchedules = 0;

  // A fail-closed plan can never be accepted (acceptMergePlan throws), so `plan.failClosed` is always
  // undefined here; guard defensively so an apply still mutates nothing if that ever changes.
  if (plan.failClosed === undefined) {
    for (const entry of plan.entries) {
      switch (entry.cls) {
        case 'unchanged':
        case 'presentation-only-change':
          // Progress preserved — SRS rows untouched. (Presentation refresh onto the local tree is D5/D12
          // UI work, deliberately out of D6's apply to avoid a flat StudyItem clobber.)
          break;

        case 'new-in-source': {
          if (entry.incoming) {
            await savePracticeDecision(buildUntrainableDecisionRow(
              entry.incoming.identity.decisionId,
              entry.incoming.identity.lessonId,
              entry.incoming.identity.chapterId,
              entry.incoming.identity.sourceLineageId ?? plan.sourceLineageId,
              now,
            ));
            newDecisions++;
          }
          break;
        }

        case 'expected-move-or-path-change': {
          if (entry.side === 'added' && entry.incoming) {
            // Mint the NEW decision (fresh id from D1's derive), untrainable, no SRS row.
            await savePracticeDecision(buildUntrainableDecisionRow(
              entry.replacementDecisionId ?? entry.incoming.identity.decisionId,
              entry.incoming.identity.lessonId,
              entry.incoming.identity.chapterId,
              entry.incoming.identity.sourceLineageId ?? plan.sourceLineageId,
              now,
            ));
            newDecisions++;
          } else if (entry.side === 'removed' && entry.baseline) {
            // Archive the REPLACED decision: keep the row, flip status → archived (id never reused).
            const existing = await getPracticeDecision(entry.baseline.identity.decisionId);
            if (existing !== undefined) {
              await savePracticeDecision({ ...existing, status: MERGE_ARCHIVED_STATUS, updatedAt: now });
              archivedDecisions++;
            }
            if (entry.local?.srs !== undefined) {
              await savePracticeSrs(toInactiveSchedule(entry.local.srs, 'archived', now));
              archivedSchedules++;
            }
          }
          break;
        }

        case 'removed':
        case 'ambiguous': {
          // Removed / rewritten / ambiguous material → training suspended, notes/history preserved, no
          // delete (P2-ORP-18). Only the removed-side local material is suspended; ambiguous added-side
          // enters explicit review with NO automatic write (zero heuristic mastery transfer, P2-ORP-17).
          if (entry.side === 'removed' && entry.local?.srs !== undefined) {
            await savePracticeSrs(toInactiveSchedule(entry.local.srs, 'suspended', now));
            suspendedSchedules++;
          }
          break;
        }
      }
    }
  }

  // Provenance re-stamp — MERGE onto the existing StudyItem so My-notes / My-analysis / free-text notes
  // survive verbatim; only `linkedSourceProvenance` changes. NEVER a fresh-literal rebuild.
  let provenanceStamped = false;
  const item = await getStudy(plan.studyItemId);
  if (item !== undefined) {
    const stamp = stampLinkedSourceProvenance({
      incoming: plan.incomingProvenance,
      ...(item.localProvenanceLayers !== undefined ? { existingLocalLayers: item.localProvenanceLayers } : {}),
      ...(item.notes !== undefined ? { existingNotes: item.notes } : {}),
    });
    const updated: StudyItem = { ...item, linkedSourceProvenance: stamp.linkedSourceProvenance, updatedAt: now };
    await saveStudyStrict(updated);
    provenanceStamped = true;
  }

  return { newDecisions, archivedDecisions, suspendedSchedules, archivedSchedules, provenanceStamped };
}
