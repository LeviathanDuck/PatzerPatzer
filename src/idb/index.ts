// IndexedDB persistence layer.
// DB name: 'patzer-pro', version 3, three object stores.
// Mirrors the pattern of lichess-org/lila: ui/analyse/src/idbTree.ts

import type { ImportedGame } from '../import/types';
import type { PuzzleCandidate, TreeNode } from '../tree/types';
import { classifyLoss, type MoveLabel } from '../engine/winchances';
import type { RetroOutcome } from '../analyse/retroCtrl';
import type { GameSummary } from '../stats/types';
import { classifyOpening } from '../openings/eco';

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

// --- Retro session result ---

/**
 * Persisted outcome record for a single "Learn From Your Mistakes" session.
 * Stored in the 'retro-results' IDB object store, keyed by gameId.
 * Each gameId stores only the latest session; older sessions are overwritten.
 */
export interface RetroSessionResult {
  /** ID of the game the session was run against. */
  gameId: string;
  /** Date.now() when the record was last written. */
  savedAt: number;
  /** Total number of mistake candidates in the session. */
  totalCandidates: number;
  /**
   * Per-ply outcomes recorded during the session.
   * Keyed by ply number (as string for JSON compatibility).
   */
  outcomes: Record<string, RetroOutcome>;
  /** True when every candidate has been resolved (win, fail, view, or skip). */
  complete: boolean;
}

// --- Per-game record type ---

/**
 * Schema for the per-game `games` object store.
 * Keyed by `id`. Replaces the legacy single-array `game-library` record.
 * Mirrors the target structure from docs/DATA_ARCHITECTURE.md.
 */
export interface StoredGameRecord {
  id:               string;
  pgn:              string;
  white:            string | null;
  black:            string | null;
  result:           string | null;
  date:             string | null;
  timeClass:        string | null;
  opening:          string | null;
  eco:              string | null;
  source:           'lichess' | 'chesscom' | 'pgn' | null;
  whiteRating:      number | null;
  blackRating:      number | null;
  importedUsername: string | null;
  importedAt:       number;
  updatedAt:        number;
}

// --- DB connection ---

export const DB_NAME = 'patzer-pro';
export const DB_VERSION = 8;

let _idb: IDBDatabase | undefined;

function openGameDb(): Promise<IDBDatabase> {
  if (_idb) return Promise.resolve(_idb);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e: IDBVersionChangeEvent) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('game-library'))     db.createObjectStore('game-library');
      if (!db.objectStoreNames.contains('puzzle-library'))   db.createObjectStore('puzzle-library');
      if (!db.objectStoreNames.contains('analysis-library')) db.createObjectStore('analysis-library');
      if (!db.objectStoreNames.contains('retro-results'))    db.createObjectStore('retro-results');
      if (!db.objectStoreNames.contains('game-summaries'))   db.createObjectStore('game-summaries');
      // Per-game store: each game is an individual record keyed by game id.
      // Indexes support filtered queries without loading all games into memory.
      // Adapted from lichess-org/lila: ui/lib/src/objectStorage.ts cursor patterns.
      if (!db.objectStoreNames.contains('games')) {
        const gamesStore = db.createObjectStore('games', { keyPath: 'id' });
        gamesStore.createIndex('date',             'date',             { unique: false });
        gamesStore.createIndex('importedUsername', 'importedUsername', { unique: false });
        gamesStore.createIndex('source',           'source',           { unique: false });
        gamesStore.createIndex('timeClass',        'timeClass',        { unique: false });
      }
      // v8: eco and opening indexes for opening-based filtering
      if (e.oldVersion < 8 && db.objectStoreNames.contains('games')) {
        const gamesStore = (e.target as IDBOpenDBRequest).transaction!.objectStore('games');
        if (!gamesStore.indexNames.contains('eco'))     gamesStore.createIndex('eco',     'eco',     { unique: false });
        if (!gamesStore.indexNames.contains('opening')) gamesStore.createIndex('opening', 'opening', { unique: false });
      }
      // Study Library stores (v7) — Adapted from docs/mini-sprints/STUDY_PAGE_SPRINT_2026-03-31.md
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
    };
    req.onsuccess = () => { _idb = req.result; resolve(_idb); };
    req.onerror   = () => reject(req.error);
  });
}

// --- Game library ---

/** Convert an ImportedGame (optional fields) to a StoredGameRecord (nullable fields). */
function importedGameToRecord(game: ImportedGame): StoredGameRecord {
  return {
    id:               game.id,
    pgn:              game.pgn,
    white:            game.white            ?? null,
    black:            game.black            ?? null,
    result:           game.result           ?? null,
    date:             game.date             ?? null,
    timeClass:        game.timeClass        ?? null,
    opening:          game.opening          ?? null,
    eco:              game.eco              ?? null,
    source:           game.source           ?? null,
    whiteRating:      game.whiteRating      ?? null,
    blackRating:      game.blackRating      ?? null,
    importedUsername: game.importedUsername ?? null,
    importedAt:       game.importedAt       ?? Date.now(),
    updatedAt:        Date.now(),
  };
}

/**
 * Save a batch of games to IDB.
 * Writes each game as an individual record to the `games` store (new path)
 * and also writes the full array to `game-library` (legacy path, backward compat).
 * Both writes share a single transaction per store.
 */
export async function saveGamesToIdb(games: ImportedGame[]): Promise<void> {
  try {
    const db = await openGameDb();
    // Write individual records to the new per-game store.
    const gamesTx = db.transaction('games', 'readwrite');
    const gamesStore = gamesTx.objectStore('games');
    for (const game of games) {
      gamesStore.put(importedGameToRecord(game));
    }
    // Also write legacy array record for backward compatibility during transition.
    const legacyTx = db.transaction('game-library', 'readwrite');
    legacyTx.objectStore('game-library').put(
      { games } satisfies StoredGameLibrary,
      'imported-games',
    );
  } catch (e) {
    console.warn('[idb] save failed', e);
  }
}

/**
 * Save a single game to the per-game `games` store.
 * Use after analysis or when a game's metadata is updated.
 */
export async function saveGameToIdb(game: ImportedGame): Promise<void> {
  try {
    const db = await openGameDb();
    const tx = db.transaction('games', 'readwrite');
    tx.objectStore('games').put(importedGameToRecord(game));
  } catch (e) {
    console.warn('[idb] single-game save failed', e);
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

/** Convert a stored per-game record back to the ImportedGame shape used at runtime. */
function storedGameRecordToImportedGame(record: StoredGameRecord): ImportedGame {
  const game: ImportedGame = { id: record.id, pgn: record.pgn };
  if (record.white            !== null) game.white            = record.white;
  if (record.black            !== null) game.black            = record.black;
  if (record.result           !== null) game.result           = record.result;
  if (record.date             !== null) game.date             = record.date;
  if (record.timeClass        !== null) game.timeClass        = record.timeClass;
  if (record.opening          !== null) game.opening          = record.opening;
  if (record.eco              !== null) game.eco              = record.eco;
  if (record.source === 'chesscom' || record.source === 'lichess') game.source = record.source;
  if (record.whiteRating      !== null) game.whiteRating      = record.whiteRating;
  if (record.blackRating      !== null) game.blackRating      = record.blackRating;
  if (record.importedUsername !== null) game.importedUsername = record.importedUsername;
  game.importedAt = record.importedAt;
  return game;
}

/**
 * Load all games from the per-game `games` store.
 * Returns the games array and nav state, or undefined if the store is empty.
 * Falls back to the legacy `game-library` path if the new store has no records.
 * Adapted from lichess-org/lila: ui/lib/src/objectStorage.ts getMany() pattern.
 */
export async function loadGamesFromIdb(): Promise<StoredGames | undefined> {
  try {
    const db = await openGameDb();

    // Try the per-game store first — available after CCP-486 migration.
    const gamesFromNewStore = await new Promise<StoredGameRecord[]>((resolve, reject) => {
      const req = db.transaction('games', 'readonly').objectStore('games').getAll();
      req.onsuccess = () => resolve((req.result as StoredGameRecord[] | undefined) ?? []);
      req.onerror   = () => reject(req.error);
    });

    if (gamesFromNewStore.length > 0) {
      // Read nav state from game-library (selectedId / path are stored there).
      const navRecord = await new Promise<StoredGameNavState | undefined>((resolve, reject) => {
        const req = db.transaction('game-library', 'readonly')
          .objectStore('game-library').get('imported-nav');
        req.onsuccess = () => resolve(req.result as StoredGameNavState | undefined);
        req.onerror   = () => reject(req.error);
      });
      const games = gamesFromNewStore.map(storedGameRecordToImportedGame);
      return {
        games,
        selectedId: navRecord?.selectedId ?? null,
        ...(navRecord?.path !== undefined ? { path: navRecord.path } : {}),
      };
    }

    // Legacy fallback: read from game-library single-record store.
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

/**
 * Load the PGN for a single game by id from the per-game `games` store.
 * Returns undefined if the record does not exist (e.g. pre-migration session).
 */
export async function loadGamePgn(gameId: string): Promise<string | undefined> {
  try {
    const db = await openGameDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction('games', 'readonly').objectStore('games').get(gameId);
      req.onsuccess = () => {
        const record = req.result as StoredGameRecord | undefined;
        resolve(record?.pgn);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[idb] loadGamePgn failed', e);
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

// --- Retro session results ---

export async function saveRetroResult(result: RetroSessionResult): Promise<void> {
  if (!result.gameId) return;
  try {
    const db = await openGameDb();
    const tx = db.transaction('retro-results', 'readwrite');
    tx.objectStore('retro-results').put(result, result.gameId);
  } catch (e) {
    console.warn('[idb] retro-result save failed', e);
  }
}

export async function getRetroResult(gameId: string): Promise<RetroSessionResult | undefined> {
  try {
    const db = await openGameDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction('retro-results', 'readonly')
        .objectStore('retro-results').get(gameId);
      req.onsuccess = () => resolve(req.result as RetroSessionResult | undefined);
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[idb] retro-result load failed', e);
    return undefined;
  }
}

export async function listRetroResults(): Promise<RetroSessionResult[]> {
  try {
    const db = await openGameDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction('retro-results', 'readonly')
        .objectStore('retro-results').getAll();
      req.onsuccess = () => resolve((req.result as RetroSessionResult[] | undefined) ?? []);
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[idb] retro-result list failed', e);
    return [];
  }
}

// --- Game summaries ---

export async function saveGameSummary(summary: GameSummary): Promise<void> {
  if (!summary.gameId) return;
  try {
    const db = await openGameDb();
    const tx = db.transaction('game-summaries', 'readwrite');
    tx.objectStore('game-summaries').put(summary, summary.gameId);
  } catch (e) {
    console.warn('[idb] game-summary save failed', e);
  }
}

export async function getGameSummary(gameId: string): Promise<GameSummary | undefined> {
  try {
    const db = await openGameDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction('game-summaries', 'readonly')
        .objectStore('game-summaries').get(gameId);
      req.onsuccess = () => resolve(req.result as GameSummary | undefined);
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[idb] game-summary load failed', e);
    return undefined;
  }
}

export async function listGameSummaries(): Promise<GameSummary[]> {
  try {
    const db = await openGameDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction('game-summaries', 'readonly')
        .objectStore('game-summaries').getAll();
      req.onsuccess = () => resolve((req.result as GameSummary[] | undefined) ?? []);
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[idb] game-summary list failed', e);
    return [];
  }
}

// --- Opening backfill ---

/**
 * Classify existing games that are missing opening or ECO data.
 * Runs in the background at startup — does not block the UI.
 * Returns the count of records updated.
 */
export async function backfillOpenings(): Promise<number> {
  try {
    const db = await openGameDb();
    const records = await new Promise<StoredGameRecord[]>((resolve, reject) => {
      const req = db.transaction('games', 'readonly').objectStore('games').getAll();
      req.onsuccess = () => resolve((req.result as StoredGameRecord[] | undefined) ?? []);
      req.onerror   = () => reject(req.error);
    });
    const toUpdate = records.filter(r => r.opening === null || r.eco === null);
    if (toUpdate.length === 0) return 0;
    const tx = db.transaction('games', 'readwrite');
    const store = tx.objectStore('games');
    let count = 0;
    for (const record of toUpdate) {
      const classified = classifyOpening(record.pgn);
      if (!classified) continue;
      if (record.opening === null) record.opening = classified.name;
      if (record.eco === null) record.eco = classified.eco;
      store.put(record);
      count++;
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
    if (count > 0) console.log(`[idb] Backfilled opening data for ${count} game(s)`);
    return count;
  } catch (e) {
    console.warn('[idb] backfillOpenings failed', e);
    return 0;
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
    const tx = db.transaction(['game-library', 'puzzle-library', 'analysis-library', 'retro-results', 'game-summaries', 'games', 'studies', 'practice-lines', 'position-progress', 'drill-attempts'], 'readwrite');
    tx.objectStore('game-library').clear();
    tx.objectStore('puzzle-library').clear();
    tx.objectStore('analysis-library').clear();
    tx.objectStore('retro-results').clear();
    tx.objectStore('game-summaries').clear();
    tx.objectStore('games').clear();
    tx.objectStore('studies').clear();
    tx.objectStore('practice-lines').clear();
    tx.objectStore('position-progress').clear();
    tx.objectStore('drill-attempts').clear();
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
