// IndexedDB persistence layer.
// DB name: 'patzer-pro', version 3, three object stores.
// Mirrors the pattern of lichess-org/lila: ui/analyse/src/idbTree.ts

import type { ImportedGame } from '../import/types';
import type { PuzzleCandidate, TreeNode } from '../tree/types';
import { classifyLoss, type MoveLabel } from '../engine/winchances';

// --- Stored schemas ---

export interface StoredGames {
  games:      ImportedGame[];
  selectedId: string | null;
  path?:      string;
}

interface StoredGameLibrary {
  games: ImportedGame[];
}

interface StoredGameNavState {
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
  /** Explicit move-review annotation derived from win-chance loss at analysis time.
   *  Absent on older records (ANALYSIS_VERSION < 3) and on moves with no label (good moves). */
  label?: MoveLabel;
  /**
   * Primary PV move sequence from this position, in UCI notation.
   * Persisted from PositionEval.moves at save time for use by retrospection answer reveal
   * and later near-best parity work.
   * Absent on older records and on positions where the engine produced no PV line.
   * Mirrors lichess-org/lila: RetroCandidate solution line (from comp child moves array).
   */
  bestLine?: string[];
}

export interface StoredAnalysis {
  gameId:          string;
  analysisVersion: number;
  analysisDepth:   number;
  status:          AnalysisStatus;
  updatedAt:       number; // Date.now()
  nodes:           Record<string, StoredNodeEntry>; // keyed by path
}

// --- Analysis serialization ---

/**
 * Serialize the mainline eval cache into the StoredNodeEntry map used by saveAnalysisToIdb.
 * Extracted from main.ts so that analysis serialization has a permanent home in the
 * persistence layer next to the types it produces.
 * Mirrors the self-contained serialization approach in
 * lichess-org/lila: ui/analyse/src/idbTree.ts IdbTree.serializeNode.
 */
export function buildAnalysisNodes(
  mainline: readonly TreeNode[],
  getEval:  (path: string) => { cp?: number; mate?: number; best?: string; loss?: number; delta?: number; moves?: string[] } | undefined,
): Record<string, StoredNodeEntry> {
  const nodes: Record<string, StoredNodeEntry> = {};
  let path = '';
  for (let i = 1; i < mainline.length; i++) {
    const node = mainline[i]!;
    path += node.id;
    const ev = getEval(path);
    if (ev) {
      const entry: StoredNodeEntry = { nodeId: node.id, path, fen: node.fen };
      if (ev.cp    !== undefined) entry.cp    = ev.cp;
      if (ev.mate  !== undefined) entry.mate  = ev.mate;
      if (ev.best  !== undefined) entry.best  = ev.best;
      if (ev.loss  !== undefined) entry.loss  = ev.loss;
      if (ev.delta !== undefined) entry.delta = ev.delta;
      // Persist the primary PV line for retrospection answer reveal and near-best parity.
      // Mirrors lichess-org/lila: retroCtrl.ts solution line from comp child moves array.
      if (ev.moves !== undefined && ev.moves.length > 0) entry.bestLine = ev.moves;
      const label = ev.loss !== undefined ? classifyLoss(ev.loss) : null;
      if (label !== null) entry.label = label;
      nodes[path] = entry;
    }
  }
  return nodes;
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

export async function saveGamesToIdb(games: ImportedGame[]): Promise<void> {
  try {
    const db = await openGameDb();
    const tx = db.transaction('game-library', 'readwrite');
    tx.objectStore('game-library').put(
      { games } satisfies StoredGameLibrary,
      'imported-games',
    );
  } catch (e) {
    console.warn('[idb] save failed', e);
  }
}

export async function saveNavStateToIdb(selectedId: string | null, path: string): Promise<void> {
  try {
    const db = await openGameDb();
    const tx = db.transaction('game-library', 'readwrite');
    tx.objectStore('game-library').put(
      { selectedId, path } satisfies StoredGameNavState,
      'imported-nav',
    );
  } catch (e) {
    console.warn('[idb] nav-state save failed', e);
  }
}

export async function loadGamesFromIdb(): Promise<StoredGames | undefined> {
  try {
    const db = await openGameDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('game-library', 'readonly');
      const store = tx.objectStore('game-library');
      const gamesReq = store.get('imported-games');
      const navReq = store.get('imported-nav');
      let gamesDone = false;
      let navDone = false;
      let libraryRecord: StoredGameLibrary | StoredGames | undefined;
      let navRecord: StoredGameNavState | undefined;

      const maybeResolve = () => {
        if (!gamesDone || !navDone) return;
        if (!libraryRecord && !navRecord) {
          resolve(undefined);
          return;
        }
        const games = libraryRecord?.games ?? [];
        const selectedId = navRecord?.selectedId
          ?? (libraryRecord && 'selectedId' in libraryRecord ? libraryRecord.selectedId : null);
        const path = navRecord?.path
          ?? (libraryRecord && 'path' in libraryRecord ? libraryRecord.path : undefined);
        resolve({
          games,
          selectedId,
          ...(path !== undefined ? { path } : {}),
        });
      };

      gamesReq.onsuccess = () => {
        libraryRecord = gamesReq.result as StoredGameLibrary | StoredGames | undefined;
        gamesDone = true;
        maybeResolve();
      };
      navReq.onsuccess = () => {
        navRecord = navReq.result as StoredGameNavState | undefined;
        navDone = true;
        maybeResolve();
      };
      gamesReq.onerror = () => reject(gamesReq.error);
      navReq.onerror = () => reject(navReq.error);
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

// --- Full reset ---

/**
 * Clear all Patzer Pro IndexedDB data in a single transaction.
 * Called by the "Clear Local Data" action. Leaves the DB schema intact.
 */
export async function clearAllIdbData(): Promise<void> {
  try {
    const db = await openGameDb();
    const tx = db.transaction(['game-library', 'puzzle-library', 'analysis-library'], 'readwrite');
    tx.objectStore('game-library').clear();
    tx.objectStore('puzzle-library').clear();
    tx.objectStore('analysis-library').clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('[idb] clearAllIdbData failed', e);
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
