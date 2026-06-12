// IndexedDB persistence layer.
// DB name: 'patzer-pro' — see DB_VERSION and openGameDb() for the current schema.
// Mirrors the pattern of lichess-org/lila: ui/analyse/src/idbTree.ts

import type { ImportedGame } from '../import/types';
import type { ChessAccount } from '../accounts';
import type { PuzzleCandidate, TreeNode } from '../tree/types';
import { classifyLoss, type MoveLabel } from '../engine/winchances';
import type { RetroOutcome } from '../analyse/retroCtrl';
import type { GameSummary } from '../stats/types';
import { classifyOpening } from '../openings/eco';
import type { RemoteSyncStoreName } from '../sync/remoteSync';

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function enqueueMainDbPut(storeName: RemoteSyncStoreName, itemKey: string, payload: unknown, updatedAt = Date.now()): void {
  void import('../sync/remoteSync')
    .then(({ enqueueRemoteSyncUpsert }) => enqueueRemoteSyncUpsert(storeName, itemKey, payload, updatedAt))
    .catch(e => console.warn('[idb] Remote sync enqueue failed', e));
}

function enqueueMainDbDelete(storeName: RemoteSyncStoreName, itemKey: string): void {
  void import('../sync/remoteSync')
    .then(({ enqueueRemoteSyncDelete }) => enqueueRemoteSyncDelete(storeName, itemKey))
    .catch(e => console.warn('[idb] Remote sync delete enqueue failed', e));
}

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
  accountId:        string | null;
  importedAt:       number;
  updatedAt:        number;
}

// --- DB connection ---

export const DB_NAME = 'patzer-pro';
export const DB_VERSION = 12;

let _idb: IDBDatabase | undefined;

function ensureIndex(
  store: IDBObjectStore,
  name: string,
  keyPath: string | string[],
  options?: IDBIndexParameters,
): void {
  if (!store.indexNames.contains(name)) store.createIndex(name, keyPath, options);
}

function ensureStore(
  db: IDBDatabase,
  event: IDBVersionChangeEvent,
  name: string,
  options?: IDBObjectStoreParameters,
): IDBObjectStore {
  if (!db.objectStoreNames.contains(name)) return db.createObjectStore(name, options);
  const tx = (event.target as IDBOpenDBRequest).transaction;
  if (!tx) throw new Error(`IndexedDB upgrade transaction missing for ${name}.`);
  return tx.objectStore(name);
}

export function upgradeGameDbSchema(db: IDBDatabase, event: IDBVersionChangeEvent): void {
  ensureStore(db, event, 'game-library');
  ensureStore(db, event, 'puzzle-library');
  ensureStore(db, event, 'analysis-library');
  ensureStore(db, event, 'retro-results');
  ensureStore(db, event, 'game-summaries');

  // Per-game store: each game is an individual record keyed by game id.
  // Indexes support filtered queries without loading all games into memory.
  // Adapted from lichess-org/lila: ui/lib/src/objectStorage.ts cursor patterns.
  const gamesStore = ensureStore(db, event, 'games', { keyPath: 'id' });
  ensureIndex(gamesStore, 'date',             'date',             { unique: false });
  ensureIndex(gamesStore, 'importedUsername', 'importedUsername', { unique: false });
  ensureIndex(gamesStore, 'source',           'source',           { unique: false });
  ensureIndex(gamesStore, 'timeClass',        'timeClass',        { unique: false });
  ensureIndex(gamesStore, 'eco',              'eco',              { unique: false });
  ensureIndex(gamesStore, 'opening',          'opening',          { unique: false });
  ensureIndex(gamesStore, 'accountId',        'accountId',        { unique: false });


  const studiesStore = ensureStore(db, event, 'studies', { keyPath: 'id' });
  ensureIndex(studiesStore, 'createdAt', 'createdAt', { unique: false });
  ensureIndex(studiesStore, 'updatedAt', 'updatedAt', { unique: false });
  ensureIndex(studiesStore, 'source',    'source',    { unique: false });
  ensureIndex(studiesStore, 'favorite',  'favorite',  { unique: false });

  const practiceStore = ensureStore(db, event, 'practice-lines', { keyPath: 'id' });
  ensureIndex(practiceStore, 'studyItemId', 'studyItemId', { unique: false });
  ensureIndex(practiceStore, 'status',      'status',      { unique: false });

  const progressStore = ensureStore(db, event, 'position-progress', { keyPath: 'key' });
  ensureIndex(progressStore, 'nextDueAt', 'nextDueAt', { unique: false });

  const attemptsStore = ensureStore(db, event, 'drill-attempts', { autoIncrement: true });
  ensureIndex(attemptsStore, 'positionKey', 'positionKey', { unique: false });
  ensureIndex(attemptsStore, 'timestamp',   'timestamp',   { unique: false });

  // v9: study folder hierarchy store
  const foldersStore = ensureStore(db, event, 'folders', { keyPath: 'id' });
  ensureIndex(foldersStore, 'parentId',  'parentId',  { unique: false });
  ensureIndex(foldersStore, 'createdAt', 'createdAt', { unique: false });


  const accountsStore = ensureStore(db, event, 'accounts', { keyPath: 'id' });
  ensureIndex(accountsStore, 'category', 'category', { unique: false });
  ensureIndex(accountsStore, 'platform', 'platform', { unique: false });
}

function openGameDb(): Promise<IDBDatabase> {
  if (_idb) return Promise.resolve(_idb);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e: IDBVersionChangeEvent) => {
      const db = (e.target as IDBOpenDBRequest).result;
      upgradeGameDbSchema(db, e);
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
    accountId:        game.accountId        ?? null,
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
    const records = games.map(importedGameToRecord);
    // Write individual records to the new per-game store.
    const gamesTx = db.transaction('games', 'readwrite');
    const gamesStore = gamesTx.objectStore('games');
    for (const record of records) gamesStore.put(record);
    await txDone(gamesTx);

    // Also write legacy array record for backward compatibility during transition.
    const legacyTx = db.transaction('game-library', 'readwrite');
    legacyTx.objectStore('game-library').put(
      { games } satisfies StoredGameLibrary,
      'imported-games',
    );
    await txDone(legacyTx);

    for (const record of records) {
      enqueueMainDbPut('games', record.id, record, record.updatedAt);
    }
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
    const record = importedGameToRecord(game);
    const tx = db.transaction('games', 'readwrite');
    tx.objectStore('games').put(record);
    await txDone(tx);
    enqueueMainDbPut('games', record.id, record, record.updatedAt);
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
    await txDone(tx);
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
  if (record.accountId        !== null && record.accountId !== undefined) game.accountId = record.accountId;
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
 * Load all games belonging to one registry account, via the `accountId` index
 * (no full-store scan). Used by the Opponents page shared-store read path.
 */
export async function loadGamesByAccountFromIdb(accountId: string): Promise<StoredGameRecord[]> {
  try {
    const db = await openGameDb();
    return await new Promise((resolve, reject) => {
      const req = db.transaction('games', 'readonly')
        .objectStore('games').index('accountId').getAll(accountId);
      req.onsuccess = () => resolve((req.result as StoredGameRecord[] | undefined) ?? []);
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[idb] account games load failed', e);
    return [];
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

// --- Chess account registry ---
// Store plumbing only. The public API for account records is src/accounts;
// other modules must import from there rather than calling these helpers.

/**
 * Persist an account record. Unlike the warn-and-continue game helpers, save
 * errors propagate: import flows must not silently proceed believing an
 * account was registered when the write failed.
 */
export async function saveAccountToIdb(account: ChessAccount): Promise<void> {
  const db = await openGameDb();
  const tx = db.transaction('accounts', 'readwrite');
  tx.objectStore('accounts').put(account);
  await txDone(tx);
}

/**
 * Read one account record. Errors propagate rather than mapping to undefined:
 * registerAccount uses this lookup to decide create-vs-update, and a swallowed
 * read error would silently rebuild an existing account and reset its
 * addedAt/sync cursors. "Not found" and "read failed" must stay distinct.
 */
export async function getAccountFromIdb(id: string): Promise<ChessAccount | undefined> {
  const db = await openGameDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('accounts', 'readonly').objectStore('accounts').get(id);
    req.onsuccess = () => resolve(req.result as ChessAccount | undefined);
    req.onerror   = () => reject(req.error);
  });
}

export async function listAccountsFromIdb(): Promise<ChessAccount[]> {
  try {
    const db = await openGameDb();
    return await new Promise((resolve, reject) => {
      const req = db.transaction('accounts', 'readonly').objectStore('accounts').getAll();
      req.onsuccess = () => resolve((req.result as ChessAccount[] | undefined) ?? []);
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[idb] account list failed', e);
    return [];
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
    await txDone(tx);
    enqueueMainDbPut('analysis', gameId, record, record.updatedAt);
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
    await txDone(tx);
    enqueueMainDbDelete('analysis', gameId);
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
    await txDone(tx);
    enqueueMainDbPut('retro-results', result.gameId, result, result.savedAt);
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
    await txDone(tx);
    const analyzedAt = Date.parse(summary.analyzedAt);
    enqueueMainDbPut('game-summaries', summary.gameId, summary, Number.isNaN(analyzedAt) ? Date.now() : analyzedAt);
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
    const updatedRecords: StoredGameRecord[] = [];
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
      record.updatedAt = Date.now();
      store.put(record);
      updatedRecords.push(record);
      count++;
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
    for (const record of updatedRecords) {
      enqueueMainDbPut('games', record.id, record, record.updatedAt);
    }
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
    const tx = db.transaction(['game-library', 'puzzle-library', 'analysis-library', 'retro-results', 'game-summaries', 'games', 'studies', 'practice-lines', 'position-progress', 'drill-attempts', 'folders', 'accounts'], 'readwrite');
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
    tx.objectStore('folders').clear();
    tx.objectStore('accounts').clear();
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
    await txDone(tx);
    enqueueMainDbPut('saved-review-puzzles', 'saved-puzzles', savedPuzzles, Date.now());
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
