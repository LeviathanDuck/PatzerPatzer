// Study Library IDB persistence — CRUD for studies, practice-lines, position-progress, drill-attempts, folders.
// Uses the shared 'patzer-pro' database opened by src/idb/index.ts.
// Adapted from lichess-org/lila: ui/analyse/src/idbTree.ts cursor patterns.

import { DB_NAME, DB_VERSION, upgradeGameDbSchema } from '../idb/index';
import type { StudyItem, TrainableSequence, PositionProgress, DrillAttempt, StudyFolder } from './types';
import { enqueueRemoteSyncDelete, enqueueRemoteSyncUpsert, type RemoteSyncStoreName } from '../sync/remoteSync';
import { record, Severity } from '../diagnostics';

type StudyStoreName =
  | 'studies'
  | 'practice-lines'
  | 'position-progress'
  | 'drill-attempts'
  | 'folders';

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
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction('studies', 'readonly').objectStore('studies').get(id);
      req.onsuccess = () => resolve(req.result as StudyItem | undefined);
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    recordStudyIdbReadFail('studies', e);
    console.warn('[studyDb] getStudy failed', e);
    return undefined;
  }
}

export async function listStudies(): Promise<StudyItem[]> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction('studies', 'readonly').objectStore('studies').getAll();
      req.onsuccess = () => resolve((req.result as StudyItem[] | undefined) ?? []);
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    recordStudyIdbReadFail('studies', e);
    console.warn('[studyDb] listStudies failed', e);
    return [];
  }
}

/**
 * Load a page of studies using an IDB cursor over the given index.
 * Skips the first `offset` records, then collects up to `limit`.
 * Replaces full getAll() for the library view — satisfies CR-2 / CR-3.
 * Adapted from lichess-org/lila: ui/analyse/src/idbTree.ts cursor patterns.
 */
export async function getStudiesPaginated(
  sortIndex: 'createdAt' | 'updatedAt',
  direction: IDBCursorDirection,
  offset: number,
  limit: number,
): Promise<StudyItem[]> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const index = db.transaction('studies', 'readonly')
        .objectStore('studies').index(sortIndex);
      const req = index.openCursor(null, direction);
      const results: StudyItem[] = [];
      let skipped = 0;

      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) { resolve(results); return; }
        if (skipped < offset) {
          skipped++;
          cursor.continue();
          return;
        }
        results.push(cursor.value as StudyItem);
        if (results.length >= limit) { resolve(results); return; }
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    recordStudyIdbReadFail('studies', e);
    console.warn('[studyDb] getStudiesPaginated failed', e);
    return [];
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
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction('practice-lines', 'readonly').objectStore('practice-lines').get(id);
      req.onsuccess = () => resolve(req.result as TrainableSequence | undefined);
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    recordStudyIdbReadFail('practice-lines', e);
    console.warn('[studyDb] getPracticeLine failed', e);
    return undefined;
  }
}

export async function listPracticeLines(studyItemId?: string): Promise<TrainableSequence[]> {
  try {
    const db = await openDb();
    if (studyItemId) {
      return new Promise((resolve, reject) => {
        const index = db.transaction('practice-lines', 'readonly')
          .objectStore('practice-lines').index('studyItemId');
        const req = index.getAll(studyItemId);
        req.onsuccess = () => resolve((req.result as TrainableSequence[] | undefined) ?? []);
        req.onerror   = () => reject(req.error);
      });
    }
    return new Promise((resolve, reject) => {
      const req = db.transaction('practice-lines', 'readonly').objectStore('practice-lines').getAll();
      req.onsuccess = () => resolve((req.result as TrainableSequence[] | undefined) ?? []);
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    recordStudyIdbReadFail('practice-lines', e);
    console.warn('[studyDb] listPracticeLines failed', e);
    return [];
  }
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
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction('position-progress', 'readonly').objectStore('position-progress').get(key);
      req.onsuccess = () => resolve(req.result as PositionProgress | undefined);
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    recordStudyIdbReadFail('position-progress', e);
    console.warn('[studyDb] getPositionProgress failed', e);
    return undefined;
  }
}

export async function listDuePositions(now = Date.now()): Promise<PositionProgress[]> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const index = db.transaction('position-progress', 'readonly')
        .objectStore('position-progress').index('nextDueAt');
      // Get all positions with nextDueAt <= now (due or overdue).
      const req = index.getAll(IDBKeyRange.upperBound(now));
      req.onsuccess = () => resolve((req.result as PositionProgress[] | undefined) ?? []);
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    recordStudyIdbReadFail('position-progress', e);
    console.warn('[studyDb] listDuePositions failed', e);
    return [];
  }
}

export async function listAllPositionProgress(): Promise<PositionProgress[]> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction('position-progress', 'readonly').objectStore('position-progress').getAll();
      req.onsuccess = () => resolve((req.result as PositionProgress[] | undefined) ?? []);
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    recordStudyIdbReadFail('position-progress', e);
    console.warn('[studyDb] listAllPositionProgress failed', e);
    return [];
  }
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
  try {
    const db = await openDb();
    if (positionKey) {
      return new Promise((resolve, reject) => {
        const index = db.transaction('drill-attempts', 'readonly')
          .objectStore('drill-attempts').index('positionKey');
        const req = index.getAll(positionKey);
        req.onsuccess = () => resolve((req.result as DrillAttempt[] | undefined) ?? []);
        req.onerror   = () => reject(req.error);
      });
    }
    return new Promise((resolve, reject) => {
      const req = db.transaction('drill-attempts', 'readonly').objectStore('drill-attempts').getAll();
      req.onsuccess = () => resolve((req.result as DrillAttempt[] | undefined) ?? []);
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    recordStudyIdbReadFail('drill-attempts', e);
    console.warn('[studyDb] listDrillAttempts failed', e);
    return [];
  }
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
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction('folders', 'readonly').objectStore('folders').get(id);
      req.onsuccess = () => resolve(req.result as StudyFolder | undefined);
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    recordStudyIdbReadFail('folders', e);
    console.warn('[studyDb] getFolder failed', e);
    return undefined;
  }
}

export async function listFolders(): Promise<StudyFolder[]> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction('folders', 'readonly').objectStore('folders').getAll();
      req.onsuccess = () => resolve((req.result as StudyFolder[] | undefined) ?? []);
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    recordStudyIdbReadFail('folders', e);
    console.warn('[studyDb] listFolders failed', e);
    return [];
  }
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
