/**
 * Openings research persistence — separate IndexedDB database.
 *
 * Uses its own DB ('patzer-openings') so opponent-research data never
 * touches the main analysis/puzzle persistence in 'patzer-pro'.
 */

import type { ResearchCollection } from './types';

let _db: IDBDatabase | undefined;

function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('patzer-openings', 1);
    req.onupgradeneeded = (e: IDBVersionChangeEvent) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('collections')) {
        db.createObjectStore('collections', { keyPath: 'id' });
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
    const tx = db.transaction('collections', 'readwrite');
    tx.objectStore('collections').clear();
  } catch (e) {
    console.warn('[openings-db] clear failed', e);
  }
}
