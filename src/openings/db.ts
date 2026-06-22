/**
 * Openings research persistence — separate IndexedDB database.
 *
 * Uses its own DB ('patzer-openings') so opponent-research data never
 * touches the main analysis/puzzle persistence in 'patzer-pro'.
 */

import type { ResearchCollection, OpeningsTool, SavedVariation } from './types';
import { enqueueRemoteSyncDelete, enqueueRemoteSyncUpsert, type RemoteSyncStoreName } from '../sync/remoteSync';
import { record, Severity } from '../diagnostics';

const DB_NAME = 'patzer-openings';
const DB_VERSION = 3;

function classifyOpeningsError(error: unknown): string {
  if (error instanceof DOMException) return error.name || 'DOMException';
  if (error instanceof Error) return error.name || error.constructor.name || 'Error';
  return typeof error;
}

function openingsRouteLabel(): string {
  if (typeof window === 'undefined') return 'unknown';
  return window.location.hash.startsWith('#/openings') ? 'openings' : 'other';
}

function recordOrpLoadFail(error: unknown): void {
  record({
    kind: 'idb',
    severity: Severity.Error,
    source: 'openings/db',
    sourceTag: 'orp-load-fail',
    message: 'orp-load-fail',
    metadata: {
      errorClass: classifyOpeningsError(error),
      route: openingsRouteLabel(),
    },
    redactionClass: 'safe',
  });
}

function recordOrpSaveFail(error: unknown): void {
  record({
    kind: 'idb',
    severity: Severity.Error,
    source: 'openings/db',
    sourceTag: 'orp-save-fail',
    message: 'orp-save-fail',
    metadata: {
      errorClass: classifyOpeningsError(error),
      route: openingsRouteLabel(),
    },
    redactionClass: 'safe',
  });
}

function txStoreName(tx: IDBTransaction): string {
  const storeNames = Array.from(tx.objectStoreNames);
  return storeNames.length === 1 ? storeNames[0]! : storeNames.join(',');
}

function recordOpeningsTxFail(tx: IDBTransaction, eventLabel: string, operationType?: string): void {
  record({
    kind: 'idb',
    severity: Severity.Error,
    source: 'openings/db',
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
      recordOpeningsTxFail(tx, 'onerror', operationType);
      reject(tx.error);
    };
    tx.onabort = () => {
      recordOpeningsTxFail(tx, 'onabort', operationType);
      reject(tx.error);
    };
  });
}

function enqueueOpeningsPut(storeName: RemoteSyncStoreName, itemKey: string, payload: unknown, updatedAt = Date.now()): void {
  try {
    enqueueRemoteSyncUpsert(storeName, itemKey, payload, updatedAt);
  } catch (e) {
    console.warn('[openings-db] Remote sync enqueue failed', e);
  }
}

function enqueueOpeningsDelete(storeName: RemoteSyncStoreName, itemKey: string): void {
  try {
    enqueueRemoteSyncDelete(storeName, itemKey);
  } catch (e) {
    console.warn('[openings-db] Remote sync delete enqueue failed', e);
  }
}

/** Persisted session resume state. */
export interface StoredOpeningsSession {
  /** Collection ID that was open. */
  collectionId: string;
  /** UCI move path at time of save. */
  path: string[];
  /** Board orientation. */
  orientation: 'white' | 'black';
  /**
   * Active tool at time of save. Optional for backward compatibility with
   * records written before this field existed. Falls back to 'repertoire' on restore.
   */
  activeTool?: OpeningsTool;
  /** Timestamp of last save. */
  savedAt: number;
}

let _db: IDBDatabase | undefined;

function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e: IDBVersionChangeEvent) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('collections')) {
        db.createObjectStore('collections', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('session')) {
        db.createObjectStore('session');
      }
      if (!db.objectStoreNames.contains('training-variations')) {
        db.createObjectStore('training-variations', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror   = () => reject(req.error);
  });
}

/** Save a research collection. Overwrites if the same id exists. */
export async function saveCollection(collection: ResearchCollection): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction('collections', 'readwrite');
    tx.objectStore('collections').put(collection);
    await txDone(tx);
    enqueueOpeningsPut('opening-collections', collection.id, collection, collection.updatedAt);
  } catch (e) {
    console.warn('[openings-db] save failed', e);
  }
}

/** Load all saved research collections. */
export async function loadCollections(): Promise<ResearchCollection[]> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('collections', 'readonly');
      const req = tx.objectStore('collections').getAll();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[openings-db] load failed', e);
    return [];
  }
}

/** Delete a research collection by id. */
export async function deleteCollection(id: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction('collections', 'readwrite');
    tx.objectStore('collections').delete(id);
    await txDone(tx, 'delete');
    enqueueOpeningsDelete('opening-collections', id);
  } catch (e) {
    console.warn('[openings-db] delete failed', e);
  }
}

/** Clear all openings research data. */
export async function clearAllOpeningsData(): Promise<void> {
  try {
    const collections = await loadCollections();
    const session = await loadSessionState();
    const variations = await loadVariations();
    const db = await openDb();
    const tx = db.transaction(['collections', 'session', 'training-variations'], 'readwrite');
    tx.objectStore('collections').clear();
    tx.objectStore('session').clear();
    tx.objectStore('training-variations').clear();
    await txDone(tx, 'clear');
    for (const collection of collections) enqueueOpeningsDelete('opening-collections', collection.id);
    if (session) enqueueOpeningsDelete('opening-session', 'current');
    for (const variation of variations) enqueueOpeningsDelete('opening-training-variations', variation.id);
  } catch (e) {
    console.warn('[openings-db] clear failed', e);
  }
}

/** Save current session resume state. */
export async function saveSessionState(state: StoredOpeningsSession): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction('session', 'readwrite');
    tx.objectStore('session').put(state, 'current');
    await txDone(tx);
    enqueueOpeningsPut('opening-session', 'current', state, state.savedAt);
  } catch (e) {
    console.warn('[openings-db] session save failed', e);
  }
}

/** Load saved session resume state. */
export async function loadSessionState(): Promise<StoredOpeningsSession | undefined> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('session', 'readonly');
      const req = tx.objectStore('session').get('current');
      req.onsuccess = () => resolve(req.result ?? undefined);
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[openings-db] session load failed', e);
    return undefined;
  }
}

/** Clear saved session state. */
export async function clearSessionState(): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction('session', 'readwrite');
    tx.objectStore('session').delete('current');
    await txDone(tx, 'delete');
    enqueueOpeningsDelete('opening-session', 'current');
  } catch (e) {
    console.warn('[openings-db] session clear failed', e);
  }
}

// ---------------------------------------------------------------------------
// ORP — saved training variations
// ---------------------------------------------------------------------------

/** Save a variation for Opening Repetition Practice. */
export async function saveVariation(variation: SavedVariation): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction('training-variations', 'readwrite');
    tx.objectStore('training-variations').put(variation);
    await txDone(tx);
    enqueueOpeningsPut('opening-training-variations', variation.id, variation, Date.now());
  } catch (e) {
    recordOrpSaveFail(e);
    console.warn('[openings-db] variation save failed', e);
  }
}

/** Load all saved training variations. */
export async function loadVariations(): Promise<SavedVariation[]> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('training-variations', 'readonly');
      const req = tx.objectStore('training-variations').getAll();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    recordOrpLoadFail(e);
    console.warn('[openings-db] variation load failed', e);
    return [];
  }
}

/** Delete a saved training variation by id. */
export async function deleteVariation(id: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction('training-variations', 'readwrite');
    tx.objectStore('training-variations').delete(id);
    await txDone(tx, 'delete');
    enqueueOpeningsDelete('opening-training-variations', id);
  } catch (e) {
    console.warn('[openings-db] variation delete failed', e);
  }
}
