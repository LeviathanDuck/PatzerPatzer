// Study Library IDB persistence — CRUD for studies, practice-lines, position-progress, drill-attempts, folders.
// Uses the shared 'patzer-pro' database opened by src/idb/index.ts.
// Adapted from lichess-org/lila: ui/analyse/src/idbTree.ts cursor patterns.

import { DB_NAME, DB_VERSION } from '../idb/index';
import type { StudyItem, TrainableSequence, PositionProgress, DrillAttempt, StudyFolder } from './types';

// Re-use the shared IDB connection so version negotiation happens once.
// We open it ourselves here so study code doesn't pull in unrelated idb exports.
let _db: IDBDatabase | undefined;

function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e: IDBVersionChangeEvent) => {
      // Mirror the study-store creation from src/idb/index.ts so that a fresh
      // #/study boot — which may open the shared DB before loadGamesFromIdb() runs —
      // still creates the Phase 0 study stores during the upgrade.
      // Adapted from lichess-org/lila: ui/analyse/src/idbTree.ts (shared-DB upgrade pattern).
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('studies')) {
        const studiesStore = db.createObjectStore('studies', { keyPath: 'id' });
        studiesStore.createIndex('createdAt', 'createdAt', { unique: false });
        studiesStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        studiesStore.createIndex('source',    'source',    { unique: false });
        studiesStore.createIndex('favorite',  'favorite',  { unique: false });
      }
      if (!db.objectStoreNames.contains('practice-lines')) {
        const practiceStore = db.createObjectStore('practice-lines', { keyPath: 'id' });
        practiceStore.createIndex('studyItemId', 'studyItemId', { unique: false });
        practiceStore.createIndex('status',      'status',      { unique: false });
      }
      if (!db.objectStoreNames.contains('position-progress')) {
        const progressStore = db.createObjectStore('position-progress', { keyPath: 'key' });
        progressStore.createIndex('nextDueAt', 'nextDueAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('drill-attempts')) {
        const attemptsStore = db.createObjectStore('drill-attempts', { autoIncrement: true });
        attemptsStore.createIndex('positionKey', 'positionKey', { unique: false });
        attemptsStore.createIndex('timestamp',   'timestamp',   { unique: false });
      }
      // v9: study folder hierarchy store
      if (!db.objectStoreNames.contains('folders')) {
        const foldersStore = db.createObjectStore('folders', { keyPath: 'id' });
        foldersStore.createIndex('parentId',  'parentId',  { unique: false });
        foldersStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
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
    console.warn('[studyDb] getStudiesPaginated failed', e);
    return [];
  }
}

export async function deleteStudy(id: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction('studies', 'readwrite');
    tx.objectStore('studies').delete(id);
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
    console.warn('[studyDb] listPracticeLines failed', e);
    return [];
  }
}

export async function deletePracticeLine(id: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction('practice-lines', 'readwrite');
    tx.objectStore('practice-lines').delete(id);
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
    console.warn('[studyDb] listFolders failed', e);
    return [];
  }
}

export async function deleteFolder(id: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction('folders', 'readwrite');
    tx.objectStore('folders').delete(id);
  } catch (e) {
    console.warn('[studyDb] deleteFolder failed', e);
  }
}
