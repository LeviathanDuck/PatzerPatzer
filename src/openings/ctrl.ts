/**
 * Openings subsystem controller — opponent-research prep tool.
 *
 * This is the ownership entry point for the openings page.
 * Separated from analysis/puzzle persistence by design.
 */

import type { ResearchCollection, ResearchGame, ResearchSource, OpeningsTool, PracticeSession } from './types';
import {
  loadCollections, saveCollection, deleteCollection as dbDeleteCollection,
  saveSessionState, loadSessionState, clearSessionState,
  type StoredOpeningsSession,
} from './db';
import { getPlayStrengthLevel, exitPlayMode } from '../engine/ctrl';
import { DEFAULT_STRENGTH_LEVEL } from '../engine/types';
import { cancelPlayMove } from '../engine/playMove';
import { OpeningTreeBuilder, nodeAtMoves, findSampleGames, type OpeningTreeNode } from './tree';
import type { ImportSpeed, ImportDateRange } from '../import/filters';
import {
  computeCollectionSummary, computePrepReport, computePrepReportLines,
  computeStyleViewModel,
  type CollectionSummary, type PrepReportData, type PrepReportLines, type StyleViewModel,
} from './analytics';

export type OpeningsPage = 'library' | 'loading' | 'session';

/** Date range options for the session-level opening tree filter. */
export const SESSION_DATE_RANGE_OPTIONS = [
  { value: 'last-week',    label: 'Last Week',    days: 7   },
  { value: 'last-month',   label: 'Last Month',   days: 30  },
  { value: 'last-3months', label: 'Last 3 Months', days: 90 },
  { value: 'last-6months', label: 'Last 6 Months', days: 180 },
] as const;

let _currentPage: OpeningsPage = 'library';
let _collections: ResearchCollection[] = [];
let _collectionsLoaded = false;

// --- Import workflow state ---
export type ImportStep = 'idle' | 'details';

let _importStep: ImportStep = 'idle';
let _isFetching = false;
let _importSource: ResearchSource = 'chesscom';
let _importUsername = '';
let _importColor: 'white' | 'black' | 'both' = 'both';
let _importError: string | null = null;
let _importProgress = 0;
let _importAbort: AbortController | null = null;
let _importMonth: string | null = null;
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

export function setOpeningsPage(page: OpeningsPage): void {
  _currentPage = page;
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
export function importMonth(): string | null { return _importMonth; }
export function setImportMonth(m: string | null): void { _importMonth = m; }
export function isFetching(): boolean { return _isFetching; }
export function setIsFetching(v: boolean): void { _isFetching = v; }
export function importAbort(): AbortController | null { return _importAbort; }
export function setImportAbort(ctrl: AbortController | null): void { _importAbort = ctrl; }
export function lastCreatedCollection(): ResearchCollection | null { return _lastCreatedCollection; }
export function setLastCreatedCollection(c: ResearchCollection | null): void { _lastCreatedCollection = c; }

/** Cancel any in-progress import. Stops the fetch loop; any previously saved data is preserved. */
export function cancelImport(): void {
  if (_importAbort) {
    _importAbort.abort();
    _importAbort = null;
  }
  _isFetching = false;
  _currentPage = 'library';
  _importStep = 'idle';
  _importProgress = 0;
  _importMonth = null;
  _importError = null;
}

/** Reset import workflow to idle. */
export function resetImport(): void {
  if (_importAbort) {
    _importAbort.abort();
    _importAbort = null;
  }
  _isFetching = false;
  _importStep = 'idle';
  _importUsername = '';
  _importColor = 'both';
  _importError = null;
  _importProgress = 0;
  _importMonth = null;
  _lastCreatedCollection = null;
  _importSpeeds = new Set();
  _importDateRange = '1month';
  _importCustomFrom = '';
  _importCustomTo = '';
  _importRated = true;
  _importMaxGames = Infinity;
}

// --- Session state (browsing a collection) ---

let _activeTool: OpeningsTool = 'opening-tree';

/**
 * Active tool reset contract:
 * - openCollection()  → resets to 'opening-tree' (fresh session always starts at Opening Tree)
 * - closeSession()    → resets to 'opening-tree' (prevents stale tool state between sessions)
 * - normal navigation → tool state persists (tree nav, move clicks do not change tool)
 * - Persisted to IndexedDB via saveSessionState and restored after openCollection() on page load
 */

/** Current active tool in the openings session. Defaults to 'opening-tree' on collection open. */
export function activeTool(): OpeningsTool { return _activeTool; }

/** Switch the active tool in the openings session. */
export function setActiveTool(tool: OpeningsTool): void { _activeTool = tool; }

let _activeCollection: ResearchCollection | null = null;
let _openingTree: OpeningTreeNode | null = null;
let _sessionPath: string[] = []; // list of UCI moves from root
let _sessionNode: OpeningTreeNode | null = null;
let _boardOrientation: 'white' | 'black' = 'white';

let _colorFilter: 'white' | 'black' | 'both' = 'white';
let _speedFilter = new Set<string>(); // empty = all speeds
let _recencyMode: 'recent' | 'all-time' = 'all-time';
let _sessionDateRange: string | null = null;
/** Games currently loaded into the tree (colour + speed + date filtered). */
let _activeGames: ResearchGame[] = [];

export function recencyMode(): 'recent' | 'all-time' { return _recencyMode; }
export function setRecencyMode(mode: 'recent' | 'all-time'): void {
  _recencyMode = mode;
  _prepReportCache = null; // force Prep Report to recompute with new mode
}

/** Active session date range filter (null = all time). */
export function sessionDateRange(): string | null { return _sessionDateRange; }

/** Set the session date range filter and rebuild the tree. */
export function setSessionDateRange(range: string | null, redraw: () => void): void {
  _sessionDateRange = range;
  setColorFilter(_colorFilter, redraw);
}

/** Games currently in the tree (colour + speed + date filtered). */
export function activeGames(): readonly ResearchGame[] { return _activeGames; }

function dateRangeCutoffMs(range: string): number {
  const entry = (SESSION_DATE_RANGE_OPTIONS as readonly { value: string; days: number }[]).find(o => o.value === range);
  return entry ? Date.now() - entry.days * 86_400_000 : 0;
}

function filterByDateRange(games: ResearchGame[], range: string | null): ResearchGame[] {
  if (!range) return games;
  const cutoff = dateRangeCutoffMs(range);
  return games.filter(g => {
    if (!g.date) return false;
    const ts = Date.parse(g.date.replace(/\./g, '-'));
    return !isNaN(ts) && ts >= cutoff;
  });
}

// --- Deviation scan state ---
import { scanDeviations, getCachedDeviations, clearDeviationCache, type DeviationPoint } from './deviation';

let _deviationResults: DeviationPoint[] = [];
let _deviationLoading = false;
let _deviationProgress = 0;
let _deviationTotal = 0;
let _deviationAbort: AbortController | null = null;

export function deviationResults(): readonly DeviationPoint[] { return _deviationResults; }
export function deviationLoading(): boolean { return _deviationLoading; }
export function deviationProgress(): number { return _deviationProgress; }
export function deviationTotal(): number { return _deviationTotal; }

export function startDeviationScan(redraw: () => void): void {
  if (_deviationLoading || !_openingTree || !_activeCollection) return;

  // Check cache first
  const cached = getCachedDeviations(_activeCollection.id, _colorFilter);
  if (cached) {
    _deviationResults = cached;
    _deviationLoading = false;
    redraw();
    return;
  }

  _deviationLoading = true;
  _deviationProgress = 0;
  _deviationTotal = 0;
  _deviationResults = [];
  _deviationAbort = new AbortController();

  scanDeviations(
    _openingTree,
    _activeCollection.id,
    _colorFilter,
    (progress) => {
      _deviationProgress = progress.queried;
      _deviationTotal = progress.total;
      _deviationResults = progress.results;
      _deviationLoading = !progress.done;
      redraw();
    },
    _deviationAbort.signal,
  ).catch(() => {
    _deviationLoading = false;
    redraw();
  });
}

export function cancelDeviationScan(): void {
  _deviationAbort?.abort();
  _deviationLoading = false;
}

export function activeCollection(): ResearchCollection | null { return _activeCollection; }
export function boardOrientation(): 'white' | 'black' { return _boardOrientation; }
export function flipBoard(): void { _boardOrientation = _boardOrientation === 'white' ? 'black' : 'white'; }
export function openingTree(): OpeningTreeNode | null { return _openingTree; }
export function colorFilter(): 'white' | 'black' | 'both' { return _colorFilter; }
export function speedFilter(): ReadonlySet<string> { return _speedFilter; }

/** Update the speed filter and rebuild the tree. */
export function setSpeedFilter(speeds: Set<string>, redraw: () => void): void {
  _speedFilter = speeds;
  setColorFilter(_colorFilter, redraw);
}

/** Change which color's games are included in the tree and rebuild.
 *  Mirrors the openCollection() async chunked pattern so the board flips
 *  immediately while the new tree streams in incrementally.
 */
export function setColorFilter(color: 'white' | 'black' | 'both', redraw: () => void): void {
  _colorFilter = color;

  // Flip board orientation immediately — first visible feedback.
  if (color === 'white') _boardOrientation = 'white';
  else if (color === 'black') _boardOrientation = 'black';

  if (!_activeCollection) { redraw(); return; }

  const target = _activeCollection.target?.toLowerCase() ?? '';
  let games = _activeCollection.games;
  if (color !== 'both' && target) {
    games = games.filter(g => {
      const isWhite = g.white?.toLowerCase() === target;
      const isBlack = g.black?.toLowerCase() === target;
      return color === 'white' ? isWhite : isBlack;
    });
  }
  if (_speedFilter.size > 0) {
    games = games.filter(g => _speedFilter.has(g.timeClass ?? ''));
  }
  games = filterByDateRange(games, _sessionDateRange);
  _activeGames = games;

  // Clear the tree immediately so the view shows an empty state while building.
  const emptyBuilder = new OpeningTreeBuilder();
  _openingTree = emptyBuilder.freeze();
  _sessionPath = [];
  _sessionNode = _openingTree;
  invalidateSampleCache();

  // Start chunked async build — same as openCollection().
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
    if (done || chunkCount % 4 === 0) {
      _openingTree = builder.freeze();
      _sessionNode = _openingTree;
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
  _activeTool = 'opening-tree';
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
  _importStep = 'idle';
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
  if (_speedFilter.size > 0) {
    games = games.filter(g => _speedFilter.has(g.timeClass ?? ''));
  }
  games = filterByDateRange(games, _sessionDateRange);
  _activeGames = games;

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
        activeTool: _activeTool,
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

/** Navigate to the deepest position following the most popular child at each step. */
export function navigateToEnd(): void {
  if (!_openingTree) return;
  let node = _sessionNode;
  const newPath = [..._sessionPath];
  while (node && node.children.length > 0) {
    const child = node.children[0]!;
    newPath.push(child.uci);
    node = child;
  }
  if (newPath.length !== _sessionPath.length) {
    _sessionPath = newPath;
    _sessionNode = node ?? _sessionNode;
    persistSession();
  }
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
  _summaryCache = null;      // analytics must recompute when data changes
  _prepReportCache = null;   // Prep Report view-model must also recompute
  _styleCache = null;        // Style view-model must also recompute
}

// --- Analytics cache ---
// CollectionSummary is the shared base for all dashboard tools.
// It is computed lazily after tree build completes and cached until the
// data changes (collection switch, filter change, tree rebuild).
//
// Invalidation points: same as invalidateSampleCache() — any time the
// underlying game set or tree changes, both caches clear together.
//
// Only available when the tree is fully built (treeBuilding() === false).
// Returns null during tree build or when no collection is open.

let _summaryCache: CollectionSummary | null = null;

/**
 * Get the cached CollectionSummary for the active collection.
 * Computes lazily on first call after tree build completes.
 * Returns null if no collection is open or the tree is still building.
 */
export function getCollectionSummary(): CollectionSummary | null {
  if (!_activeCollection || _treeBuilding) return null;
  if (!_summaryCache) {
    _summaryCache = computeCollectionSummary(_activeGames, _activeCollection.target);
  }
  return _summaryCache;
}

// --- Prep Report view-model ---
// Assembles PrepReportData + PrepReportLines from the cached CollectionSummary.
// Caches the result so the Prep Report view never recomputes analytics per render.
// Invalidated alongside _summaryCache on any data or filter change.

/**
 * Assembled view-model for the Prep Report tool.
 * All three sections are derived from the same underlying game set and tree
 * so they are consistent with each other.
 */
export interface PrepReportViewModel {
  /** Base collection-level scouting facts (reused from _summaryCache). */
  summary: CollectionSummary;
  /** ECO breakdown and overall W/D/L for the Prep Report header/overview sections. */
  report: PrepReportData;
  /** Tree-derived line summaries for likely-lines, strong/weak, and fresh sections. */
  lines: PrepReportLines;
}

let _prepReportCache: PrepReportViewModel | null = null;

/**
 * Get the cached PrepReportViewModel.
 * Computes lazily on first call after tree build completes.
 * Returns null if no collection is open or the tree is still building.
 *
 * Color perspective follows the active color filter so that line analysis
 * is consistent with the current board/filter state.
 */
export function getPrepReportViewModel(): PrepReportViewModel | null {
  if (!_activeCollection || _treeBuilding) return null;
  if (!_prepReportCache) {
    const summary = getCollectionSummary()!; // safe: checked above
    const report  = computePrepReport(_activeGames, _activeCollection.target, summary);
    // For line analysis, 'both' falls back to 'white' perspective as the base pass.
    // The Prep Report view can layer color-specific filtering on top if needed.
    const colorPerspective = _colorFilter === 'both' ? 'white' : _colorFilter;
    const lines = computePrepReportLines(_openingTree, colorPerspective, 8);
    _prepReportCache = { summary, report, lines };
  }
  return _prepReportCache;
}

// --- Style view-model ---
// Wraps StyleData + FormData + RepertoireProfile with confidence annotations.
// Cached and invalidated on the same contract as _prepReportCache.
// Only available when the tree is fully built and a collection is open.

let _styleCache: StyleViewModel | null = null;

/**
 * Get the cached StyleViewModel for the active collection.
 * Computes lazily on first call after tree build completes.
 * Returns null if no collection is open or the tree is still building.
 */
export function getStyleViewModel(): StyleViewModel | null {
  if (!_activeCollection || _treeBuilding) return null;
  if (!_styleCache) {
    const summary = getCollectionSummary()!; // safe: checked above
    _styleCache = computeStyleViewModel(
      _activeGames,
      _openingTree,
      _activeCollection.target,
      summary,
    );
  }
  return _styleCache;
}

// ---------------------------------------------------------------------------
// Practice session ownership
// ---------------------------------------------------------------------------
//
// Practice state lives here (not in view.ts) so board, engine, and UI layers
// can all read from a single source of truth without coupling to each other.
//
// Lifecycle:
//   startPractice()  — allocate session, switch to practice tool
//   stopPractice()   — clear session, return to opening-tree tool
//   practiceSession() — read current session (null = not in practice mode)
//   setPracticeRunning() — pause / resume the auto-advance loop
//   setPracticeOpponentSource() — update coverage state after each half-move
//
// The session is automatically cleared by closeSession().
//
// References:
//   Adapted from lichess-org/lila: ui/analyse/src/practice/practiceCtrl.ts
//   (isMyTurn / running / comment lifecycle pattern)

let _practiceSession: PracticeSession | null = null;

/** Read the active practice session. Null when not in practice mode. */
export function practiceSession(): PracticeSession | null {
  return _practiceSession;
}

/**
 * Start a practice session for the current collection.
 * Switches the active tool to 'practice' and initialises the session at the
 * current board position.
 *
 * @param userColor  The color the user will play ('white' or 'black').
 * @param startFen   FEN at the start of the practice sequence. Defaults to the
 *                   current session node FEN (the position visible on the board).
 */
export function startPractice(
  userColor: 'white' | 'black',
  startFen: string,
  strengthLevel?: number,
): void {
  _practiceSession = {
    userColor,
    moveHistory: [],
    startFen,
    running: true,
    opponentSource: 'repertoire',
    minRepertoireFreq: 2,
    strengthLevel: strengthLevel ?? getPlayStrengthLevel() ?? DEFAULT_STRENGTH_LEVEL,
  };
  _activeTool = 'practice';
}

/**
 * Stop practice mode. Clears the session and returns to the opening-tree tool
 * so the user can continue browsing.
 */
export function stopPractice(): void {
  cancelPlayMove();
  exitPlayMode();
  _practiceSession = null;
  _activeTool = 'opening-tree';
}

/**
 * Pause or resume the practice auto-advance loop.
 * Does nothing if no session is active.
 */
export function setPracticeRunning(running: boolean): void {
  if (_practiceSession) _practiceSession = { ..._practiceSession, running };
}

/**
 * Update the opponent source state at the current board position.
 * Called after each half-move so the UI can show the correct coverage banner.
 *
 * @param source  'repertoire' | 'engine' | 'exhausted'
 */
export function setPracticeOpponentSource(source: PracticeSession['opponentSource']): void {
  if (_practiceSession) _practiceSession = { ..._practiceSession, opponentSource: source };
}

/**
 * Append a UCI move to the current session's move history.
 * Used to track the full sequence played so "restart" can replay from startFen.
 */
export function recordPracticeMove(uci: string): void {
  if (_practiceSession) {
    _practiceSession = {
      ..._practiceSession,
      moveHistory: [..._practiceSession.moveHistory, uci],
    };
  }
}

/** Close the current session, return to library. */
export function closeSession(): void {
  if (_practiceSession) { cancelPlayMove(); exitPlayMode(); }
  _activeTool = 'opening-tree';
  _practiceSession = null;          // practice session must be cleared on close
  invalidateSampleCache();
  _activeCollection = null;
  _openingTree = null;
  _sessionPath = [];
  _sessionNode = null;
  _currentPage = 'library';
  _sessionDateRange = null;
  _activeGames = [];
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
        openCollection(col, redraw); // resets _activeTool to 'opening-tree'
        if (session.path.length > 0) navigateToPath(session.path);
        if (session.orientation) _boardOrientation = session.orientation;
        // Restore active tool — fall back to 'opening-tree' if missing or invalid.
        // 'repertoire' is kept for backwards compatibility with saved sessions.
        const validTools: OpeningsTool[] = ['opening-tree', 'repertoire', 'prep-report', 'style', 'practice'];
        if (session.activeTool && (validTools as string[]).includes(session.activeTool)) {
          // Map legacy 'repertoire' sessions to 'opening-tree'.
          _activeTool = session.activeTool === 'repertoire' ? 'opening-tree' : session.activeTool as OpeningsTool;
        }
      }
    }
  } catch (e) {
    console.warn('[openings] failed to load collections', e);
    _collections = [];
    _collectionsLoaded = true;
  }
  redraw();
}
