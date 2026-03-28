/**
 * Openings subsystem controller — opponent-research prep tool.
 *
 * This is the ownership entry point for the openings page.
 * Separated from analysis/puzzle persistence by design.
 */

import type { ResearchCollection, ResearchGame, ResearchSource } from './types';
import {
  loadCollections, saveCollection, deleteCollection as dbDeleteCollection,
  saveSessionState, loadSessionState, clearSessionState,
  type StoredOpeningsSession,
} from './db';
import { buildOpeningTree, OpeningTreeBuilder, nodeAtMoves, findSampleGames, type OpeningTreeNode } from './tree';
import type { ImportSpeed, ImportDateRange } from '../import/filters';

export type OpeningsPage = 'library' | 'loading' | 'session';

let _currentPage: OpeningsPage = 'library';
let _collections: ResearchCollection[] = [];
let _collectionsLoaded = false;

// --- Import workflow state ---
export type ImportStep = 'idle' | 'source' | 'details' | 'importing' | 'done';

let _importStep: ImportStep = 'idle';
let _importSource: ResearchSource = 'lichess';
let _importUsername = '';
let _importColor: 'white' | 'black' | 'both' = 'both';
let _importError: string | null = null;
let _importProgress = 0;
let _importAbort: AbortController | null = null;
let _lastCreatedCollection: ResearchCollection | null = null;

// --- Import filter state (mirrors header import filters) ---
let _importSpeeds = new Set<ImportSpeed>();
let _importDateRange: ImportDateRange = '1month';
let _importCustomFrom = '';
let _importCustomTo = '';
let _importRated = true;
let _importMaxGames = Infinity;

/** Initialize the openings page state. Call once on route entry, not on every render. */
export function initOpeningsPage(page: OpeningsPage = 'library'): void {
  _currentPage = page;
}

/** Mark collections as stale so the next render reloads them from DB. */
export function invalidateCollections(): void {
  _collectionsLoaded = false;
}

/** Current openings page mode. */
export function openingsPage(): OpeningsPage {
  return _currentPage;
}

/** Whether saved collections have been loaded from IndexedDB. */
export function collectionsLoaded(): boolean {
  return _collectionsLoaded;
}

/** Current list of saved research collections. */
export function collections(): readonly ResearchCollection[] {
  return _collections;
}

/** Add a collection to the in-memory list (after save). */
export function addCollection(c: ResearchCollection): void {
  _collections = [c, ..._collections];
}

/** Delete a collection by id. */
export async function removeCollection(id: string, redraw: () => void): Promise<void> {
  await dbDeleteCollection(id);
  _collections = _collections.filter(c => c.id !== id);
  redraw();
}

/** Rename a collection. */
export async function renameCollection(id: string, newName: string, redraw: () => void): Promise<void> {
  const col = _collections.find(c => c.id === id);
  if (!col) return;
  col.name = newName;
  col.updatedAt = Date.now();
  await saveCollection(col);
  redraw();
}

// --- Import workflow accessors ---
export function importStep(): ImportStep { return _importStep; }
export function importSource(): ResearchSource { return _importSource; }
export function importUsername(): string { return _importUsername; }
export function importColor(): 'white' | 'black' | 'both' { return _importColor; }
export function importError(): string | null { return _importError; }

export function setImportStep(step: ImportStep): void { _importStep = step; }
export function setImportSource(source: ResearchSource): void { _importSource = source; }
export function setImportUsername(username: string): void { _importUsername = username; }
export function setImportColor(color: 'white' | 'black' | 'both'): void { _importColor = color; }
export function setImportError(err: string | null): void { _importError = err; }
export function importSpeeds(): ReadonlySet<ImportSpeed> { return _importSpeeds; }
export function setImportSpeeds(s: Set<ImportSpeed>): void { _importSpeeds = s; }
export function importDateRange(): ImportDateRange { return _importDateRange; }
export function setImportDateRange(r: ImportDateRange): void { _importDateRange = r; }
export function importCustomFrom(): string { return _importCustomFrom; }
export function setImportCustomFrom(v: string): void { _importCustomFrom = v; }
export function importCustomTo(): string { return _importCustomTo; }
export function setImportCustomTo(v: string): void { _importCustomTo = v; }
export function importRated(): boolean { return _importRated; }
export function setImportRated(v: boolean): void { _importRated = v; }
export function importMaxGames(): number { return _importMaxGames; }
export function setImportMaxGames(v: number): void { _importMaxGames = v <= 0 ? Infinity : v; }
export function importProgress(): number { return _importProgress; }
export function setImportProgress(n: number): void { _importProgress = n; }
export function importAbort(): AbortController | null { return _importAbort; }
export function setImportAbort(ctrl: AbortController | null): void { _importAbort = ctrl; }
export function lastCreatedCollection(): ResearchCollection | null { return _lastCreatedCollection; }
export function setLastCreatedCollection(c: ResearchCollection | null): void { _lastCreatedCollection = c; }

/** Cancel any in-progress import. */
export function cancelImport(): void {
  if (_importAbort) {
    _importAbort.abort();
    _importAbort = null;
  }
  _importStep = 'details';
  _importProgress = 0;
  _importError = 'Import cancelled.';
}

/** Reset import workflow to idle. */
export function resetImport(): void {
  if (_importAbort) {
    _importAbort.abort();
    _importAbort = null;
  }
  _importStep = 'idle';
  _importUsername = '';
  _importColor = 'both';
  _importError = null;
  _importProgress = 0;
  _lastCreatedCollection = null;
  _importSpeeds = new Set();
  _importDateRange = '1month';
  _importCustomFrom = '';
  _importCustomTo = '';
  _importRated = true;
  _importMaxGames = Infinity;
}

// --- Session state (browsing a collection) ---

let _activeCollection: ResearchCollection | null = null;
let _openingTree: OpeningTreeNode | null = null;
let _sessionPath: string[] = []; // list of UCI moves from root
let _sessionNode: OpeningTreeNode | null = null;
let _boardOrientation: 'white' | 'black' = 'white';

let _colorFilter: 'white' | 'black' | 'both' = 'white';

export function activeCollection(): ResearchCollection | null { return _activeCollection; }
export function boardOrientation(): 'white' | 'black' { return _boardOrientation; }
export function flipBoard(): void { _boardOrientation = _boardOrientation === 'white' ? 'black' : 'white'; }
export function openingTree(): OpeningTreeNode | null { return _openingTree; }
export function colorFilter(): 'white' | 'black' | 'both' { return _colorFilter; }

/** Change which color's games are included in the tree and rebuild. */
export function setColorFilter(color: 'white' | 'black' | 'both', redraw?: () => void): void {
  _colorFilter = color;
  if (!_activeCollection) return;
  const target = _activeCollection.target?.toLowerCase() ?? '';
  let games = _activeCollection.games;
  if (color !== 'both' && target) {
    games = games.filter(g => {
      const isWhite = g.white?.toLowerCase() === target;
      const isBlack = g.black?.toLowerCase() === target;
      return color === 'white' ? isWhite : isBlack;
    });
  }
  _openingTree = buildOpeningTree(games);
  _sessionPath = [];
  _sessionNode = _openingTree;
  invalidateSampleCache();
  if (color === 'white') _boardOrientation = 'white';
  else if (color === 'black') _boardOrientation = 'black';
}
export function sessionPath(): readonly string[] { return _sessionPath; }
export function sessionNode(): OpeningTreeNode | null { return _sessionNode; }

let _treeBuildProgress = 0;
let _treeBuildTotal = 0;
let _treeBuilding = false;

export function treeBuildProgress(): number { return _treeBuildProgress; }
export function treeBuildTotal(): number { return _treeBuildTotal; }
export function treeBuilding(): boolean { return _treeBuilding; }

/** Open a saved research collection: show the board immediately, build tree in background. */
export function openCollection(collection: ResearchCollection, redraw: () => void): void {
  _activeCollection = collection;

  // Set orientation before entering session
  if (_colorFilter === 'white') _boardOrientation = 'white';
  else if (_colorFilter === 'black') _boardOrientation = 'black';

  // Enter session immediately with an empty tree — board shows starting position
  const emptyBuilder = new OpeningTreeBuilder();
  _openingTree = emptyBuilder.freeze();
  _sessionPath = [];
  _sessionNode = _openingTree;
  invalidateSampleCache();
  _currentPage = 'session';

  // Filter games by color
  const target = collection.target?.toLowerCase() ?? '';
  let games = collection.games;
  if (_colorFilter !== 'both' && target) {
    games = games.filter(g => {
      const isWhite = g.white?.toLowerCase() === target;
      const isBlack = g.black?.toLowerCase() === target;
      return _colorFilter === 'white' ? isWhite : isBlack;
    });
  }

  // Start background tree build
  _treeBuildProgress = 0;
  _treeBuildTotal = games.length;
  _treeBuilding = true;
  redraw();

  const CHUNK = 200;
  const builder = new OpeningTreeBuilder();
  let index = 0;
  let chunkCount = 0;

  function processChunk(): void {
    const end = Math.min(index + CHUNK, games.length);
    builder.addGames(games.slice(index, end));
    index = end;
    chunkCount++;
    _treeBuildProgress = index;

    const done = index >= games.length;
    // Freeze the tree periodically (every 4 chunks) or on the final chunk.
    // freeze() does a full DFS so we don't want to call it on every chunk.
    if (done || chunkCount % 4 === 0) {
      _openingTree = builder.freeze();
      _sessionNode = nodeAtMoves(_openingTree, [..._sessionPath]) ?? _openingTree;
      invalidateSampleCache();
    }
    redraw();

    if (!done) {
      setTimeout(processChunk, 0);
    } else {
      _treeBuilding = false;
      redraw();
    }
  }

  setTimeout(processChunk, 0);
}

let _sessionSaveTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced session state persistence. */
function persistSession(): void {
  if (_sessionSaveTimer) clearTimeout(_sessionSaveTimer);
  _sessionSaveTimer = setTimeout(() => {
    _sessionSaveTimer = null;
    if (_activeCollection) {
      void saveSessionState({
        collectionId: _activeCollection.id,
        path: [..._sessionPath],
        orientation: _boardOrientation,
        savedAt: Date.now(),
      });
    }
  }, 500);
}

/** Navigate to a child move by UCI. */
export function navigateToMove(uci: string): void {
  if (!_sessionNode) return;
  const child = _sessionNode.children.find(c => c.uci === uci);
  if (child) {
    _sessionPath = [..._sessionPath, uci];
    _sessionNode = child;
    persistSession();
  }
}

/** Navigate back one move. */
export function navigateBack(): void {
  if (_sessionPath.length === 0 || !_openingTree) return;
  _sessionPath = _sessionPath.slice(0, -1);
  _sessionNode = nodeAtMoves(_openingTree, _sessionPath) ?? _openingTree;
  persistSession();
}

/** Navigate to root. */
export function navigateToRoot(): void {
  if (!_openingTree) return;
  _sessionPath = [];
  _sessionNode = _openingTree;
  persistSession();
}

/** Navigate to a specific path (list of UCI moves). */
export function navigateToPath(moves: string[]): void {
  if (!_openingTree) return;
  const target = nodeAtMoves(_openingTree, moves);
  if (target) {
    _sessionPath = [...moves];
    _sessionNode = target;
    persistSession();
  }
}

// --- Cached sample games (avoid re-parsing PGN on every render) ---
let _cachedSamplesPath: string = '';
let _cachedSamples: ResearchGame[] = [];

/** Get sample games matching the current path. Cached until path changes. */
export function sampleGames(limit = 5): ResearchGame[] {
  if (!_activeCollection) return [];
  const pathKey = _sessionPath.join('/');
  if (pathKey !== _cachedSamplesPath) {
    _cachedSamplesPath = pathKey;
    _cachedSamples = findSampleGames(_activeCollection.games, _sessionPath, limit);
  }
  return _cachedSamples;
}

function invalidateSampleCache(): void {
  _cachedSamplesPath = '';
  _cachedSamples = [];
}

/** Close the current session, return to library. */
export function closeSession(): void {
  invalidateSampleCache();
  _activeCollection = null;
  _openingTree = null;
  _sessionPath = [];
  _sessionNode = null;
  _currentPage = 'library';
  void clearSessionState();
}

/** Load saved research collections from the openings DB. */
export async function loadSavedCollections(redraw: () => void): Promise<void> {
  if (_collectionsLoaded) return;
  try {
    const loaded = await loadCollections();
    loaded.sort((a, b) => b.createdAt - a.createdAt);
    _collections = loaded;
    _collectionsLoaded = true;

    // Try to resume a saved session
    const session = await loadSessionState();
    if (session && _currentPage === 'library') {
      const col = _collections.find(c => c.id === session.collectionId);
      if (col) {
        openCollection(col, redraw);
        if (session.path.length > 0) navigateToPath(session.path);
        if (session.orientation) _boardOrientation = session.orientation;
      }
    }
  } catch (e) {
    console.warn('[openings] failed to load collections', e);
    _collections = [];
    _collectionsLoaded = true;
  }
  redraw();
}
