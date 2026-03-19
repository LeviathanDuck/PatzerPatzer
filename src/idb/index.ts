// IndexedDB persistence layer.
// DB name: 'patzer-pro', version 3, three object stores.
// Mirrors the pattern of lichess-org/lila: ui/analyse/src/idbTree.ts

import type { ImportedGame } from '../import/types';
import type { PuzzleCandidate } from '../tree/types';

// --- Stored schemas ---

export interface StoredGames {
  games:      ImportedGame[];
  selectedId: string | null;
  path?:      string;
}

// Bumped when the analysis node schema changes. Records from older versions are discarded.
export const ANALYSIS_VERSION = 2; // path-keyed nodes (was node.id-keyed in v1)

export type AnalysisStatus = 'idle' | 'partial' | 'complete';

export interface StoredNodeEntry {
  nodeId: string;
  path:   string;
  fen:    string;
  cp?:    number;
  mate?:  number;
  best?:  string;
  loss?:  number;
  delta?: number;
}

export interface StoredAnalysis {
  gameId:          string;
  analysisVersion: number;
  analysisDepth:   number;
  status:          AnalysisStatus;
  updatedAt:       number; // Date.now()
  nodes:           Record<string, StoredNodeEntry>; // keyed by path
}

// --- Puzzle state ---
// Module-level; set at startup via setSavedPuzzles() and mutated by savePuzzle().

export let savedPuzzles: PuzzleCandidate[] = [];

export function setSavedPuzzles(puzzles: PuzzleCandidate[]): void {
  savedPuzzles = puzzles;
}

// --- DB connection ---

let _idb: IDBDatabase | undefined;

function openGameDb(): Promise<IDBDatabase> {
  if (_idb) return Promise.resolve(_idb);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('patzer-pro', 3);
    req.onupgradeneeded = (e: IDBVersionChangeEvent) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('game-library'))     db.createObjectStore('game-library');
      if (!db.objectStoreNames.contains('puzzle-library'))   db.createObjectStore('puzzle-library');
      if (!db.objectStoreNames.contains('analysis-library')) db.createObjectStore('analysis-library');
    };
    req.onsuccess = () => { _idb = req.result; resolve(_idb); };
    req.onerror   = () => reject(req.error);
  });
}

// --- Game library ---

export async function saveGamesToIdb(
  games: ImportedGame[], selectedId: string | null, path: string,
): Promise<void> {
  try {
    const db = await openGameDb();
    const tx = db.transaction('game-library', 'readwrite');
    tx.objectStore('game-library').put(
      { games, selectedId, path } satisfies StoredGames,
      'imported-games',
    );
  } catch (e) {
    console.warn('[idb] save failed', e);
  }
}

export async function loadGamesFromIdb(): Promise<StoredGames | undefined> {
  try {
    const db = await openGameDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction('game-library', 'readonly')
        .objectStore('game-library').get('imported-games');
      req.onsuccess = () => resolve(req.result as StoredGames | undefined);
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[idb] load failed', e);
    return undefined;
  }
}

// --- Analysis ---

export async function saveAnalysisToIdb(
  status: AnalysisStatus,
  gameId: string,
  nodes:  Record<string, StoredNodeEntry>,
  depth:  number,
): Promise<void> {
  try {
    const db = await openGameDb();
    const record: StoredAnalysis = {
      gameId,
      analysisVersion: ANALYSIS_VERSION,
      analysisDepth:   depth,
      status,
      updatedAt:       Date.now(),
      nodes,
    };
    const tx = db.transaction('analysis-library', 'readwrite');
    tx.objectStore('analysis-library').put(record, gameId);
  } catch (e) {
    console.warn('[idb] analysis save failed', e);
  }
}

export async function loadAnalysisFromIdb(gameId: string): Promise<StoredAnalysis | undefined> {
  try {
    const db = await openGameDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction('analysis-library', 'readonly')
        .objectStore('analysis-library').get(gameId);
      req.onsuccess = () => resolve(req.result as StoredAnalysis | undefined);
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[idb] analysis load failed', e);
    return undefined;
  }
}

export async function clearAnalysisFromIdb(gameId: string): Promise<void> {
  try {
    const db = await openGameDb();
    const tx = db.transaction('analysis-library', 'readwrite');
    tx.objectStore('analysis-library').delete(gameId);
  } catch (e) {
    console.warn('[idb] analysis clear failed', e);
  }
}

// --- Puzzles ---

async function savePuzzlesToIdb(): Promise<void> {
  try {
    const db = await openGameDb();
    const tx = db.transaction('puzzle-library', 'readwrite');
    tx.objectStore('puzzle-library').put(savedPuzzles, 'saved-puzzles');
  } catch (e) {
    console.warn('[idb] puzzle save failed', e);
  }
}

export async function loadPuzzlesFromIdb(): Promise<PuzzleCandidate[]> {
  try {
    const db = await openGameDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction('puzzle-library', 'readonly')
        .objectStore('puzzle-library').get('saved-puzzles');
      req.onsuccess = () => resolve((req.result as PuzzleCandidate[] | undefined) ?? []);
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[idb] puzzle load failed', e);
    return [];
  }
}

export function savePuzzle(c: PuzzleCandidate, redraw: () => void): void {
  const already = savedPuzzles.some(p => p.gameId === c.gameId && p.path === c.path);
  if (already) return;
  savedPuzzles = [...savedPuzzles, c];
  void savePuzzlesToIdb();
  redraw();
}
