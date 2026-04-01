/**
 * Openings research persistence — separate IndexedDB database.
 *
 * Uses its own DB ('patzer-openings') so opponent-research data never
 * touches the main analysis/puzzle persistence in 'patzer-pro'.
 */

import type { ResearchCollection, OpeningsTool, SavedVariation } from './types';

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
    const req = indexedDB.open('patzer-openings', 3);
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
  } catch (e) {
    console.warn('[openings-db] delete failed', e);
  }
}

/** Clear all openings research data. */
export async function clearAllOpeningsData(): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(['collections', 'session'], 'readwrite');
    tx.objectStore('collections').clear();
    tx.objectStore('session').clear();
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
  } catch (e) {
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
  } catch (e) {
    console.warn('[openings-db] variation delete failed', e);
  }
}
