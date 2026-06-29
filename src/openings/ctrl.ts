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
import { createAccountResearchCollection } from './routeTarget';
import { getPlayStrengthLevel, exitPlayMode } from '../engine/ctrl';



import { listAccounts, type AccountCategory, type ChessAccount } from '../accounts';
import { loadGamesByAccountFromIdb } from '../idb';
import { DEFAULT_STRENGTH_LEVEL } from '../engine/types';
import { cancelPlayMove } from '../engine/playMove';
import { OpeningTreeBuilder, nodeAtMoves, findSampleGames, type OpeningTreeNode, type SampleGameMatch } from './tree';
import type { ImportSpeed, ImportDateRange } from '../import/filters';
import {
  computeCollectionSummary, computePrepReport, computePrepReportLines,
  computeStyleViewModel,
  type CollectionSummary, type PrepReportData, type PrepReportLines, type StyleViewModel,
} from './analytics';
import {
  cancelTreeEval,
  isTreeEvalEnabled,
  startTreeEvalDeepening,
  startTreeEvalPass1,
} from './treeEval';
import type { OpponentsTreeUrlState, OpponentsUrlRange, OpponentsUrlSpeed, OpponentsUrlTarget } from './urlState';
import { filterGamesByDateCutoff } from './dateFilter';
import {
  createOpeningTreeBuildContext,
  openingTreeBuildMilestonesForProgress,
  recordOpeningTreeBuildEvent,
  recordOpeningTreeBuildFailure,
  type OpeningTreeBuildContext,
  type OpeningTreeSnapshotMode,
} from './treeBuildDiagnostics';
import { getDeviceMetadata } from '../diagnostics/session';

export type OpeningsPage = 'library' | 'loading' | 'session';

/** Date range options for the session-level opening tree filter. */
export const SESSION_DATE_RANGE_OPTIONS = [
  { value: 'last-week',    label: 'Last Week',    days: 7   },
  { value: 'last-month',   label: 'Last Month',   days: 30  },
  { value: 'last-3months', label: 'Last 3 Months', days: 90 },
  { value: 'last-6months', label: 'Last 6 Months', days: 180 },
] as const;

export type TreeEvalThoroughness = 'fast' | 'balanced' | 'deep';

export const TREE_EVAL_THOROUGHNESS_OPTIONS: readonly { value: TreeEvalThoroughness; label: string }[] = [
  { value: 'fast',     label: 'Fast' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'deep',     label: 'Deep' },
] as const;

export type SampleGamesSortMode = 'recent' | 'rating';
export type SampleGamesResultFilter = 'all' | 'wins' | 'losses';
export type OpeningsRoutePathRestoreStatus = 'exact' | 'partial' | 'root';
export interface OpeningsRoutePathRestoreResult {
  status: OpeningsRoutePathRestoreStatus;
  requested: string[];
  applied: string[];
}

export interface OpenCollectionOptions {
  initialPath?: string[];
  onInitialPathResolved?: (result: OpeningsRoutePathRestoreResult) => void;
}

const TREE_BUILD_CHUNK_SIZE = 200;
const SMALL_TREE_SNAPSHOT_GAME_LIMIT = 1000;
const LARGE_TREE_SNAPSHOT_INTERVAL_MS = 2500;
const SAMPLE_GAMES_SCAN_LIMIT = 250;

export type OpeningsSessionStateChangeHandler = (snapshot: OpponentsTreeUrlState | null) => void;

let _currentPage: OpeningsPage = 'library';
let _collections: ResearchCollection[] = [];
let _collectionsLoaded = false;
let _sampleGamesSortMode: SampleGamesSortMode = 'recent';
let _sampleGamesResultFilter: SampleGamesResultFilter = 'all';
let _routeRecoveryMessage: string | null = null;
let _skipNextSavedSessionResume = false;
let _sessionStateChangeHandler: OpeningsSessionStateChangeHandler | null = null;
let _sessionStateNotificationSuppression = 0;


let _accounts: ChessAccount[] = [];
let _accountsLoaded = false;

export function registryAccounts(): readonly ChessAccount[] { return _accounts; }
export function accountsLoaded(): boolean { return _accountsLoaded; }

export async function loadRegistryAccounts(redraw: () => void): Promise<void> {
  if (_accountsLoaded) return;
  // Optimistic flag: render-triggered calls must not stack parallel reads
  // while the first lookup is still in flight.
  _accountsLoaded = true;
  _accounts = await listAccounts();
  redraw();
}

export async function refreshRegistryAccounts(redraw: () => void): Promise<readonly ChessAccount[]> {
  _accounts = await listAccounts();
  _accountsLoaded = true;
  redraw();
  return _accounts;
}




const _importedSpeedsCache = new Map<string, Set<string>>();

/** Distinct non-empty timeClass values present in an account's imported games (cached). */
export async function getImportedSpeedsForAccount(accountId: string): Promise<Set<string>> {
  const cached = _importedSpeedsCache.get(accountId);
  if (cached) return cached;
  const records = await loadGamesByAccountFromIdb(accountId);
  const speeds = new Set<string>();
  for (const record of records) {
    if (record.timeClass) speeds.add(record.timeClass);
  }
  _importedSpeedsCache.set(accountId, speeds);
  return speeds;
}

/** Clear the cached imported-speeds for an account (e.g. after a sync adds games). */
export function invalidateImportedSpeeds(accountId: string): void {
  _importedSpeedsCache.delete(accountId);
}

/**
 * Set the color filter state without rebuilding the active tree.
 * For use immediately before opening a new session: openCollection reads
 * _colorFilter for its initial build, so triggering setColorFilter's rebuild
 * here would race a stale collection's build against the new session's.
 */
export function presetColorFilter(color: 'white' | 'black' | 'both'): void {
  _colorFilter = color;
  if (color === 'white') _boardOrientation = 'white';
  else if (color === 'black') _boardOrientation = 'black';
}

export function sampleGamesSortMode(): SampleGamesSortMode {
  return _sampleGamesSortMode;
}

export function setSampleGamesSortMode(mode: SampleGamesSortMode, redraw?: () => void): void {
  _sampleGamesSortMode = mode;
  redraw?.();
}

export function sampleGamesResultFilter(): SampleGamesResultFilter {
  return _sampleGamesResultFilter;
}

export function setSampleGamesResultFilter(filter: SampleGamesResultFilter, redraw?: () => void): void {
  _sampleGamesResultFilter = filter;
  redraw?.();
}

/**
 * Open a research session for a registered account, built from the shared
 * game store. The session uses a transient collection (id `account:<id>`)
 * that is never saved to the collections store. An aborted signal after the
 * games load cancels the open (the user backed out while loading).
 */
export async function openAccountResearch(account: ChessAccount, redraw: () => void, signal?: AbortSignal): Promise<void> {
  const records = await loadGamesByAccountFromIdb(account.id);
  if (signal?.aborted) return;
  openCollection(createAccountResearchCollection(account, records), redraw);
}

// --- Import workflow state ---
export type ImportStep = 'idle' | 'details';

let _importStep: ImportStep = 'idle';
let _isFetching = false;
let _importSource: ResearchSource = 'chesscom';
let _importUsername = '';
let _importColor: 'white' | 'black' | 'both' = 'both';


let _importCategory: AccountCategory = 'opponent';
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
  _accountsLoaded = false;
}

/** Current openings page mode. */
export function openingsPage(): OpeningsPage {
  return _currentPage;
}

export function setOpeningsPage(page: OpeningsPage): void {
  _currentPage = page;
}

export function routeRecoveryMessage(): string | null {
  return _routeRecoveryMessage;
}

export function setRouteRecoveryMessage(message: string | null): void {
  _routeRecoveryMessage = message;
}

export function skipNextSavedSessionResume(): void {
  _skipNextSavedSessionResume = true;
}

const URL_SPEEDS = new Set<OpponentsUrlSpeed>(['ultrabullet', 'bullet', 'blitz', 'rapid', 'classical']);
const URL_RANGES = new Set<OpponentsUrlRange>(['last-week', 'last-month', 'last-3months', 'last-6months']);

function sessionUrlTargetFor(collection: ResearchCollection): OpponentsUrlTarget {
  const accountPrefix = 'account:';
  if (collection.id.startsWith(accountPrefix)) {
    return { kind: 'account', id: collection.id.slice(accountPrefix.length) };
  }
  return { kind: 'collection', id: collection.id };
}

function normalizedUrlSpeeds(speeds: ReadonlySet<string>): OpponentsUrlSpeed[] {
  return [...speeds].filter((speed): speed is OpponentsUrlSpeed => URL_SPEEDS.has(speed as OpponentsUrlSpeed));
}

function normalizedUrlRange(range: string | null): OpponentsUrlRange | null {
  return URL_RANGES.has(range as OpponentsUrlRange) ? range as OpponentsUrlRange : null;
}

export function openingsSessionUrlSnapshot(): OpponentsTreeUrlState | null {
  if (!_activeCollection || _currentPage !== 'session') return null;
  return {
    target:      sessionUrlTargetFor(_activeCollection),
    tool:        _activeTool,
    color:       _colorFilter,
    speeds:      normalizedUrlSpeeds(_speedFilter),
    range:       normalizedUrlRange(_sessionDateRange),
    orientation: _boardOrientation,
    line:        [..._sessionPath],
  };
}

export function setOpeningsSessionStateChangeHandler(handler: OpeningsSessionStateChangeHandler | null): void {
  _sessionStateChangeHandler = handler;
}

export function beginOpeningsSessionStateNotificationSuppression(): () => void {
  _sessionStateNotificationSuppression++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    _sessionStateNotificationSuppression = Math.max(0, _sessionStateNotificationSuppression - 1);
  };
}

function notifySessionStateChanged(): void {
  if (_sessionStateNotificationSuppression > 0) return;
  _sessionStateChangeHandler?.(openingsSessionUrlSnapshot());
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
export function importCategory(): AccountCategory { return _importCategory; }
export function setImportCategory(category: AccountCategory): void { _importCategory = category; }
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
  _importCategory = 'opponent';
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
  _importCategory = 'opponent';
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
export function setActiveTool(tool: OpeningsTool): void {
  if (_activeTool === tool) return;
  _activeTool = tool;
  notifySessionStateChanged();
}

let _activeCollection: ResearchCollection | null = null;
let _openingTree: OpeningTreeNode | null = null;
let _visibleTreeBuilder: OpeningTreeBuilder | null = null;
let _visibleTreeBuilderGeneration = 0;
let _openingTreeSnapshotKind: 'full' | 'lazy' = 'full';
let _sessionPath: string[] = []; // list of UCI moves from root
let _sessionNode: OpeningTreeNode | null = null;
let _boardOrientation: 'white' | 'black' = 'white';

let _colorFilter: 'white' | 'black' | 'both' = 'white';
let _speedFilter = new Set<string>(); // empty = all speeds
let _recencyMode: 'recent' | 'all-time' = 'all-time';
let _sessionDateRange: string | null = null;
let _treeEvalThoroughness: TreeEvalThoroughness = 'balanced';
const TREE_EVAL_DWELL_MS = 2_500;
let _treeEvalDwellTimer: ReturnType<typeof setTimeout> | null = null;
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
  if (_sessionDateRange === range) return;
  _sessionDateRange = range;
  setColorFilter(_colorFilter, redraw);
}






export function presetSessionDateRange(range: string | null): void {
  _sessionDateRange = range;
}

/** Games currently in the tree (colour + speed + date filtered). */
export function activeGames(): readonly ResearchGame[] { return _activeGames; }

/** Number of games excluded from the most recent build because their date was missing/unparseable.
 *  Zero when the current range is all-time (null). Available to the view for a "N undated excluded" label. */
let _excludedUndatedCount = 0;
export function excludedUndatedCount(): number { return _excludedUndatedCount; }












function filterByDateRange(games: ResearchGame[], range: string | null): ResearchGame[] {
  if (!range) {
    _excludedUndatedCount = 0;
    return games;
  }
  // Compute cutoff as a local calendar date string (YYYY-MM-DD) so games on the
  // boundary day are never wrongly dropped by UTC-midnight timezone arithmetic.
  const entry = (SESSION_DATE_RANGE_OPTIONS as readonly { value: string; days: number }[]).find(o => o.value === range);
  const cutoffMs = entry ? Date.now() - entry.days * 86_400_000 : 0;
  const cd = new Date(cutoffMs);
  const cutoffDateStr = `${cd.getFullYear()}-${String(cd.getMonth() + 1).padStart(2, '0')}-${String(cd.getDate()).padStart(2, '0')}`;

  const result = filterGamesByDateCutoff(games, cutoffDateStr);
  _excludedUndatedCount = result.excludedUndated;
  return result.games;
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
export function setBoardOrientation(orientation: 'white' | 'black'): void {
  if (_boardOrientation === orientation) return;
  _boardOrientation = orientation;
  notifySessionStateChanged();
}
export function flipBoard(): void {
  _boardOrientation = _boardOrientation === 'white' ? 'black' : 'white';
  notifySessionStateChanged();
}
export function openingTree(): OpeningTreeNode | null { return _openingTree; }
export function colorFilter(): 'white' | 'black' | 'both' { return _colorFilter; }
export function speedFilter(): ReadonlySet<string> { return _speedFilter; }
export function treeEvalThoroughness(): TreeEvalThoroughness { return _treeEvalThoroughness; }

export function setTreeEvalThoroughness(level: TreeEvalThoroughness, redraw: () => void): void {
  _treeEvalThoroughness = level;
  triggerTreeEvalForCurrentNode();
  redraw();
}

export function triggerTreeEvalForCurrentNode(): void {
  cancelTreeEvalDwellTimer();
  if (!_sessionNode || !isTreeEvalEnabled()) {
    cancelTreeEval();
    return;
  }
  const node = _sessionNode;
  const pathKey = _sessionPath.join('/');
  startTreeEvalPass1(node, _treeEvalThoroughness, {
    onPass2Complete: () => scheduleTreeEvalDwell(node.fen, pathKey),
  });
}

function cancelTreeEvalDwellTimer(): void {
  if (_treeEvalDwellTimer) {
    clearTimeout(_treeEvalDwellTimer);
    _treeEvalDwellTimer = null;
  }
}

function cancelTreeEvalWork(): void {
  cancelTreeEvalDwellTimer();
  cancelTreeEval();
}

function scheduleTreeEvalDwell(fen: string, pathKey: string): void {
  cancelTreeEvalDwellTimer();
  _treeEvalDwellTimer = setTimeout(() => {
    _treeEvalDwellTimer = null;
    if (!isTreeEvalEnabled()) return;
    if (!_sessionNode || _sessionNode.fen !== fen || _sessionPath.join('/') !== pathKey) return;
    startTreeEvalDeepening(_sessionNode, _treeEvalThoroughness);
  }, TREE_EVAL_DWELL_MS);
}

/** Update the speed filter and rebuild the tree. */
export function setSpeedFilter(speeds: Set<string>, redraw: () => void): void {
  _speedFilter = speeds;
  setColorFilter(_colorFilter, redraw);
}





export function presetSpeedFilter(speeds: Set<string>): void {
  _speedFilter = speeds;
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

  // Keep an existing tree visible while the rebuild runs. This avoids a blank
  // panel during expensive large-account filter changes; the final snapshot
  // still resets to the rebuilt root to preserve existing filter behavior.
  cancelTreeEvalWork();
  if (!_openingTree) {
    const emptyBuilder = new OpeningTreeBuilder();
    _openingTree = emptyBuilder.freeze();
    _visibleTreeBuilder = null;
    _visibleTreeBuilderGeneration = 0;
    _openingTreeSnapshotKind = 'full';
    _sessionPath = [];
    _sessionNode = _openingTree;
  }
  invalidateSampleCache();
  notifySessionStateChanged();

  // Start chunked async build — same as openCollection().
  _treeBuildProgress = 0;
  _lastProgressRedrawAt = 0;
  _treeBuildTotal = games.length;
  _treeBuilding = true;
  const generation = ++_buildGeneration;
  _activeBuildCount++;
  redraw();

  const CHUNK = TREE_BUILD_CHUNK_SIZE;
  const buildContext = createOpeningTreeBuildContext({
    reason: 'filter-rebuild',
    collection: _activeCollection,
    filteredGames: games.length,
    colorFilter: _colorFilter,
    speedFilter: _speedFilter,
    dateRange: _sessionDateRange,
    activeTool: _activeTool,
    chunkSize: CHUNK,
    buildGeneration: generation,
  });
  _lastTreeBuildContext = buildContext;
  let nextMilestoneIndex = 0;
  const builder = new OpeningTreeBuilder();
  let index = 0;
  let chunkCount = 0;
  let lastSnapshotAt = monotonicNow();
  recordOpeningTreeBuildEvent(buildContext, { phase: 'start', progressGames: 0, activeBuildCount: _activeBuildCount });

  function processChunk(): void {



    if (generation !== _buildGeneration) {
      recordOpeningTreeBuildEvent(buildContext, {
        phase: 'stale-suppressed',
        phaseDetail: 'stale-suppressed',
        progressGames: index,
        supersededByGeneration: _buildGeneration,
        cancelReason: _treeBuilding ? 'superseded-by-newer-build' : 'session-closed',
        activeBuildCount: _activeBuildCount,
        positionsCount: builder.positions.size,
        nodeCount: builder.positions.size,
      });
      _activeBuildCount = Math.max(0, _activeBuildCount - 1);
      return;
    }
    try {
      const end = Math.min(index + CHUNK, games.length);
      const chunkStartedAt = monotonicNow();
      builder.addGames(games.slice(index, end));
      const chunkDurationMs = monotonicNow() - chunkStartedAt;
      index = end;
      chunkCount++;
      _treeBuildProgress = index;
      recordOpeningTreeBuildEvent(buildContext, {
        phase: 'chunk',
        phaseDetail: 'add-games',
        progressGames: index,
        chunkIndex: chunkCount,
        chunkDurationMs,
        positionsCount: builder.positions.size,
        nodeCount: builder.positions.size,
      });

      const milestoneResult = openingTreeBuildMilestonesForProgress(games.length, index, nextMilestoneIndex);
      nextMilestoneIndex = milestoneResult.nextIndex;
      for (const milestone of milestoneResult.milestones) {
        recordOpeningTreeBuildEvent(buildContext, {
          phase: 'milestone',
          progressGames: index,
          milestonePercent: milestone,
        });
      }

      const done = index >= games.length;
      const snapshotMode = shouldPublishTreeSnapshot({
        done,
        chunkCount,
        totalGames: games.length,
        lastSnapshotAt,
        now: monotonicNow(),
      });
      if (snapshotMode) {
        publishTreeSnapshot({
          builder,
          buildContext,
          progressGames: index,
          snapshotMode,
          resetPath: snapshotMode === 'final',
          triggerEval: snapshotMode === 'final',
        });
        lastSnapshotAt = monotonicNow();
      }


      const nowMs = monotonicNow();
      if (nowMs - _lastProgressRedrawAt >= 200) {
        _lastProgressRedrawAt = nowMs;
        redraw();
      }

      if (!done) {
        setTimeout(processChunk, 0);
      } else {
        _treeBuilding = false;
        _activeBuildCount = Math.max(0, _activeBuildCount - 1);
        recordOpeningTreeBuildEvent(buildContext, {
          phase: 'complete',
          phaseDetail: 'complete',
          progressGames: index,
          activeBuildCount: _activeBuildCount,
          positionsCount: builder.positions.size,
          nodeCount: builder.positions.size,
          snapshotMode: 'lazy-current',
        });
        redraw();
      }
    } catch (error) {
      _treeBuilding = false;
      _activeBuildCount = Math.max(0, _activeBuildCount - 1);
      recordOpeningTreeBuildFailure(buildContext, index, error);
      redraw();
      throw error;
    }
  }

  setTimeout(processChunk, 0);
}
export function sessionPath(): readonly string[] { return _sessionPath; }
export function sessionNode(): OpeningTreeNode | null { return _sessionNode; }

let _treeBuildProgress = 0;
let _treeBuildTotal = 0;
let _treeBuilding = false;


let _lastProgressRedrawAt = 0;





let _buildGeneration = 0;



let _activeBuildCount = 0;
let _lastTreeBuildContext: OpeningTreeBuildContext | null = null;

export function treeBuildProgress(): number { return _treeBuildProgress; }
export function treeBuildTotal(): number { return _treeBuildTotal; }
export function treeBuilding(): boolean { return _treeBuilding; }

function monotonicNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function isMobileTreeBuildDevice(): boolean {
  const deviceClass = getDeviceMetadata().deviceClass;
  return deviceClass === 'mobile' || deviceClass === 'tablet';
}

function shouldPublishTreeSnapshot(options: {
  done: boolean;
  chunkCount: number;
  totalGames: number;
  lastSnapshotAt: number;
  now: number;
}): OpeningTreeSnapshotMode | null {
  if (options.done) return 'final';
  if (options.totalGames <= SMALL_TREE_SNAPSHOT_GAME_LIMIT) {
    return options.chunkCount % 4 === 0 ? 'interim' : null;
  }
  if (isMobileTreeBuildDevice()) return null;
  return options.now - options.lastSnapshotAt >= LARGE_TREE_SNAPSHOT_INTERVAL_MS ? 'interim' : null;
}

function publishTreeSnapshot(options: {
  builder: OpeningTreeBuilder;
  buildContext: OpeningTreeBuildContext;
  progressGames: number;
  snapshotMode: OpeningTreeSnapshotMode;
  resetPath: boolean;
  triggerEval: boolean;
}): void {
  const snapshotStartedAt = monotonicNow();
  const requestedPath = options.resetPath ? [] : _sessionPath;
  const snapshot = options.builder.snapshotAtMoves(requestedPath);
  _openingTree = snapshot.root;
  _sessionPath = snapshot.appliedPath;
  _sessionNode = snapshot.current;
  _visibleTreeBuilder = options.builder;
  _visibleTreeBuilderGeneration = options.buildContext.buildGeneration;
  _openingTreeSnapshotKind = 'lazy';
  invalidateSampleCache();
  if (options.triggerEval) triggerTreeEvalForCurrentNode();
  recordOpeningTreeBuildEvent(options.buildContext, {
    phase: 'snapshot',
    phaseDetail: 'current-path-snapshot',
    progressGames: options.progressGames,
    snapshotDurationMs: monotonicNow() - snapshotStartedAt,
    positionsCount: snapshot.positionsCount,
    nodeCount: snapshot.nodeCount,
    snapshotMode: 'lazy-current',
  });
}

function visibleLazyBuilder(): OpeningTreeBuilder | null {
  return _openingTreeSnapshotKind === 'lazy' ? _visibleTreeBuilder : null;
}

function currentVisibleBuildContext(): OpeningTreeBuildContext | null {
  if (!_lastTreeBuildContext || _lastTreeBuildContext.buildGeneration !== _visibleTreeBuilderGeneration) return null;
  return _lastTreeBuildContext;
}

function refreshVisibleLazySnapshot(
  moves: readonly string[],
  options: { persist: boolean; triggerEval: boolean; notify: boolean; allowPartial?: boolean },
): OpeningsRoutePathRestoreResult | null {
  const builder = visibleLazyBuilder();
  if (!builder) return null;

  const snapshotStartedAt = monotonicNow();
  const snapshot = builder.snapshotAtMoves(moves);
  if (!options.allowPartial && snapshot.status !== 'exact') return null;
  _openingTree = snapshot.root;
  _sessionPath = snapshot.appliedPath;
  _sessionNode = snapshot.current;

  if (options.persist) persistSession();
  if (options.triggerEval) triggerTreeEvalForCurrentNode();
  if (options.notify) notifySessionStateChanged();

  const context = currentVisibleBuildContext();
  if (context) {
    recordOpeningTreeBuildEvent(context, {
      phase: 'snapshot',
      phaseDetail: 'current-path-snapshot',
      progressGames: _treeBuildProgress,
      snapshotDurationMs: monotonicNow() - snapshotStartedAt,
      positionsCount: snapshot.positionsCount,
      nodeCount: snapshot.nodeCount,
      snapshotMode: 'lazy-current',
    });
  }

  return {
    status: snapshot.status,
    requested: snapshot.requestedPath,
    applied: snapshot.appliedPath,
  };
}

function ensureFullOpeningTreeSnapshot(): OpeningTreeNode | null {
  const builder = visibleLazyBuilder();
  if (!_openingTree || !builder) return _openingTree;








  if (isMobileTreeBuildDevice()) {
    const context = currentVisibleBuildContext();
    if (context) {
      recordOpeningTreeBuildEvent(context, {
        phase: 'snapshot',
        progressGames: _treeBuildProgress,
        positionsCount: builder.positions.size,
        nodeCount: builder.positions.size,
        snapshotMode: 'skipped',
      });
    }
    return _openingTree;
  }

  const positionsCount = builder.positions.size;
  const context = currentVisibleBuildContext();
  const freezeStartedAt = monotonicNow();
  const nextTree = builder.freeze();
  const freezeDurationMs = monotonicNow() - freezeStartedAt;
  if (context) {
    recordOpeningTreeBuildEvent(context, {
      phase: 'snapshot',
      phaseDetail: 'freeze',
      progressGames: _treeBuildProgress,
      freezeDurationMs,
      positionsCount,
      nodeCount: positionsCount,
      snapshotMode: 'full-on-demand',
    });
  }

  const renderStartedAt = monotonicNow();
  _openingTree = nextTree;
  _sessionNode = nodeAtMoves(_openingTree, [..._sessionPath]) ?? _openingTree;
  _openingTreeSnapshotKind = 'full';
  if (context) {
    recordOpeningTreeBuildEvent(context, {
      phase: 'snapshot',
      phaseDetail: 'render-snapshot',
      progressGames: _treeBuildProgress,
      snapshotDurationMs: monotonicNow() - renderStartedAt,
      positionsCount,
      nodeCount: positionsCount,
      snapshotMode: 'full-on-demand',
    });
  }

  return _openingTree;
}

function navigateToClosestPath(moves: string[], persist: boolean): OpeningsRoutePathRestoreResult {
  const requested = [...moves];
  const lazyResult = refreshVisibleLazySnapshot(requested, { persist, triggerEval: true, notify: true, allowPartial: true });
  if (lazyResult) return lazyResult;

  if (!_openingTree || moves.length === 0) {
    _sessionPath = [];
    _sessionNode = _openingTree;
    if (persist) persistSession();
    triggerTreeEvalForCurrentNode();
    notifySessionStateChanged();
    return { status: moves.length === 0 ? 'exact' : 'root', requested, applied: [] };
  }

  const applied: string[] = [];
  let node: OpeningTreeNode = _openingTree;
  for (const move of moves) {
    const child = node.children.find(c => c.uci === move);
    if (!child) break;
    applied.push(move);
    node = child;
  }

  _sessionPath = applied;
  _sessionNode = node;
  if (persist) persistSession();
  triggerTreeEvalForCurrentNode();
  notifySessionStateChanged();

  return {
    status: applied.length === moves.length ? 'exact' : applied.length > 0 ? 'partial' : 'root',
    requested,
    applied,
  };
}

/** Open a saved research collection: show the board immediately, build tree in background. */
export function openCollection(collection: ResearchCollection, redraw: () => void, options: OpenCollectionOptions = {}): void {
  _activeTool = 'opening-tree';
  _activeCollection = collection;

  // Set orientation before entering session
  if (_colorFilter === 'white') _boardOrientation = 'white';
  else if (_colorFilter === 'black') _boardOrientation = 'black';

  // Keep an existing tree visible while the rebuild runs, mirroring setColorFilter().
  // This prevents a blank panel when switching collections; the first new snapshot from
  // the incoming build will replace the visible tree. Only initialise an empty root
  // when no tree exists yet (first open in the session).
  cancelTreeEvalWork();
  if (!_openingTree) {
    const emptyBuilder = new OpeningTreeBuilder();
    _openingTree = emptyBuilder.freeze();
    _visibleTreeBuilder = null;
    _visibleTreeBuilderGeneration = 0;
    _openingTreeSnapshotKind = 'full';
    _sessionPath = [];
    _sessionNode = _openingTree;
  }
  invalidateSampleCache();
  _importStep = 'idle';
  _currentPage = 'session';
  notifySessionStateChanged();

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
  _lastProgressRedrawAt = 0;
  _treeBuildTotal = games.length;
  _treeBuilding = true;
  const generation = ++_buildGeneration;
  _activeBuildCount++;
  redraw();

  const CHUNK = TREE_BUILD_CHUNK_SIZE;
  const buildContext = createOpeningTreeBuildContext({
    reason: 'open-collection',
    collection,
    filteredGames: games.length,
    colorFilter: _colorFilter,
    speedFilter: _speedFilter,
    dateRange: _sessionDateRange,
    activeTool: _activeTool,
    chunkSize: CHUNK,
    buildGeneration: generation,
  });
  _lastTreeBuildContext = buildContext;
  let nextMilestoneIndex = 0;
  const builder = new OpeningTreeBuilder();
  let index = 0;
  let chunkCount = 0;
  let lastSnapshotAt = monotonicNow();
  recordOpeningTreeBuildEvent(buildContext, { phase: 'start', progressGames: 0, activeBuildCount: _activeBuildCount });

  function processChunk(): void {



    if (generation !== _buildGeneration) {
      recordOpeningTreeBuildEvent(buildContext, {
        phase: 'stale-suppressed',
        phaseDetail: 'stale-suppressed',
        progressGames: index,
        supersededByGeneration: _buildGeneration,
        cancelReason: _treeBuilding ? 'superseded-by-newer-build' : 'session-closed',
        activeBuildCount: _activeBuildCount,
        positionsCount: builder.positions.size,
        nodeCount: builder.positions.size,
      });
      _activeBuildCount = Math.max(0, _activeBuildCount - 1);
      return;
    }
    try {
      const end = Math.min(index + CHUNK, games.length);
      const chunkStartedAt = monotonicNow();
      builder.addGames(games.slice(index, end));
      const chunkDurationMs = monotonicNow() - chunkStartedAt;
      index = end;
      chunkCount++;
      _treeBuildProgress = index;
      recordOpeningTreeBuildEvent(buildContext, {
        phase: 'chunk',
        phaseDetail: 'add-games',
        progressGames: index,
        chunkIndex: chunkCount,
        chunkDurationMs,
        positionsCount: builder.positions.size,
        nodeCount: builder.positions.size,
      });

      const milestoneResult = openingTreeBuildMilestonesForProgress(games.length, index, nextMilestoneIndex);
      nextMilestoneIndex = milestoneResult.nextIndex;
      for (const milestone of milestoneResult.milestones) {
        recordOpeningTreeBuildEvent(buildContext, {
          phase: 'milestone',
          progressGames: index,
          milestonePercent: milestone,
        });
      }

      const done = index >= games.length;
      const snapshotMode = shouldPublishTreeSnapshot({
        done,
        chunkCount,
        totalGames: games.length,
        lastSnapshotAt,
        now: monotonicNow(),
      });
      if (snapshotMode) {
        publishTreeSnapshot({
          builder,
          buildContext,
          progressGames: index,
          snapshotMode,
          resetPath: false,
          triggerEval: snapshotMode === 'final' && !options.initialPath,
        });
        lastSnapshotAt = monotonicNow();
      }


      const nowMs = monotonicNow();
      if (nowMs - _lastProgressRedrawAt >= 200) {
        _lastProgressRedrawAt = nowMs;
        redraw();
      }

      if (!done) {
        setTimeout(processChunk, 0);
      } else {
        if (options.initialPath) {
          const result = navigateToClosestPath(options.initialPath, false);
          options.onInitialPathResolved?.(result);
          invalidateSampleCache();
          notifySessionStateChanged();
        }
        _treeBuilding = false;
        _activeBuildCount = Math.max(0, _activeBuildCount - 1);
        recordOpeningTreeBuildEvent(buildContext, {
          phase: 'complete',
          phaseDetail: 'complete',
          progressGames: index,
          activeBuildCount: _activeBuildCount,
          positionsCount: builder.positions.size,
          nodeCount: builder.positions.size,
          snapshotMode: 'lazy-current',
        });
        redraw();
      }
    } catch (error) {
      _treeBuilding = false;
      _activeBuildCount = Math.max(0, _activeBuildCount - 1);
      recordOpeningTreeBuildFailure(buildContext, index, error);
      redraw();
      throw error;
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
    const nextPath = [..._sessionPath, uci];
    if (refreshVisibleLazySnapshot(nextPath, { persist: true, triggerEval: true, notify: true })) return;
    _sessionPath = nextPath;
    _sessionNode = child;
    persistSession();
    triggerTreeEvalForCurrentNode();
    notifySessionStateChanged();
  }
}

/** Navigate back one move. */
export function navigateBack(): void {
  if (_sessionPath.length === 0 || !_openingTree) return;
  const nextPath = _sessionPath.slice(0, -1);
  if (refreshVisibleLazySnapshot(nextPath, { persist: true, triggerEval: true, notify: true })) return;
  _sessionPath = nextPath;
  _sessionNode = nodeAtMoves(_openingTree, _sessionPath) ?? _openingTree;
  persistSession();
  triggerTreeEvalForCurrentNode();
  notifySessionStateChanged();
}

/** Navigate to root. */
export function navigateToRoot(): void {
  if (!_openingTree) return;
  if (refreshVisibleLazySnapshot([], { persist: true, triggerEval: true, notify: true })) return;
  _sessionPath = [];
  _sessionNode = _openingTree;
  persistSession();
  triggerTreeEvalForCurrentNode();
  notifySessionStateChanged();
}

/** Navigate to the deepest position following the most popular child at each step. */
export function navigateToEnd(): void {
  if (!_openingTree) return;
  const builder = visibleLazyBuilder();
  if (builder) {
    const nextPath = builder.mostPopularPathFromMoves(_sessionPath);
    if (nextPath.length !== _sessionPath.length) {
      refreshVisibleLazySnapshot(nextPath, { persist: true, triggerEval: true, notify: true });
    }
    return;
  }
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
    triggerTreeEvalForCurrentNode();
    notifySessionStateChanged();
  }
}

/** Navigate to a specific path (list of UCI moves). */
export function navigateToPath(moves: string[]): void {
  if (!_openingTree) return;
  const lazyResult = refreshVisibleLazySnapshot(moves, { persist: true, triggerEval: true, notify: true });
  if (lazyResult) return;
  const target = nodeAtMoves(_openingTree, moves);
  if (target) {
    _sessionPath = [...moves];
    _sessionNode = target;
    persistSession();
    triggerTreeEvalForCurrentNode();
    notifySessionStateChanged();
  }
}

// --- Cached sample games (avoid re-parsing PGN on every render) ---
export interface SampleGamesState {
  games: SampleGameMatch[];
  total: number;
  loading: boolean;
  pathKey: string;
}

let _cachedSamplesPath: string = '';
let _cachedSamples: SampleGameMatch[] = [];
let _cachedSamplesLoading = false;
let _cachedSamplesScheduledPath = '';
let _cachedSamplesGeneration = 0;

const scheduleIdle = (cb: () => void): void => {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(cb, { timeout: 350 });
  } else {
    setTimeout(cb, 0);
  }
};

/** Get sample games matching the current path. Cached until path changes. */
export function sampleGames(redraw?: () => void): SampleGamesState {
  const pathKey = _sessionPath.join('/');
  const total = _sessionNode?.total ?? 0;
  if (!_activeCollection) return { games: [], total: 0, loading: false, pathKey };
  if (_treeBuilding) return { games: [], total, loading: true, pathKey };

  if (pathKey !== _cachedSamplesPath && pathKey !== _cachedSamplesScheduledPath) {
    const collection = _activeCollection;
    const path = [..._sessionPath];
    const generation = ++_cachedSamplesGeneration;
    const buildContext = _lastTreeBuildContext;
    _cachedSamplesScheduledPath = pathKey;
    _cachedSamplesLoading = true;
    _cachedSamples = [];
    scheduleIdle(() => {
      if (generation !== _cachedSamplesGeneration || _activeCollection?.id !== collection.id) {
        buildContext && recordOpeningTreeBuildEvent(buildContext, {
          phase: 'sample-stale',
          phaseDetail: 'sample-scan',
          progressGames: _treeBuildProgress,
          sampleLimit: SAMPLE_GAMES_SCAN_LIMIT,
        });
        return;
      }
      const scanStartedAt = monotonicNow();
      const matches = findSampleGames(collection.games, path, SAMPLE_GAMES_SCAN_LIMIT);
      const sampleScanDurationMs = monotonicNow() - scanStartedAt;
      if (generation !== _cachedSamplesGeneration || _sessionPath.join('/') !== pathKey) {
        buildContext && recordOpeningTreeBuildEvent(buildContext, {
          phase: 'sample-stale',
          phaseDetail: 'sample-scan',
          progressGames: _treeBuildProgress,
          sampleScanDurationMs,
          sampleMatchCount: matches.length,
          sampleLimit: SAMPLE_GAMES_SCAN_LIMIT,
        });
        return;
      }
      _cachedSamplesPath = pathKey;
      _cachedSamplesScheduledPath = '';
      _cachedSamples = matches;
      _cachedSamplesLoading = false;
      buildContext && recordOpeningTreeBuildEvent(buildContext, {
        phase: 'sample-scan',
        phaseDetail: 'sample-scan',
        progressGames: _treeBuildProgress,
        sampleScanDurationMs,
        sampleMatchCount: matches.length,
        sampleLimit: SAMPLE_GAMES_SCAN_LIMIT,
      });
      redraw?.();
    });
  }

  return {
    games: pathKey === _cachedSamplesPath ? _cachedSamples : [],
    total,
    loading: _cachedSamplesLoading || pathKey !== _cachedSamplesPath,
    pathKey,
  };
}

/** Synchronous sample read for tests/debug tools that do not have a redraw loop. */
export function sampleGamesNow(limit = Number.POSITIVE_INFINITY): SampleGameMatch[] {
  if (!_activeCollection) return [];
  const pathKey = _sessionPath.join('/');
  if (pathKey !== _cachedSamplesPath) {
    _cachedSamplesPath = pathKey;
    _cachedSamples = findSampleGames(_activeCollection.games, _sessionPath, limit);
    _cachedSamplesLoading = false;
    _cachedSamplesScheduledPath = '';
  }
  return _cachedSamples;
}

function invalidateSampleCache(): void {
  _cachedSamplesPath = '';
  _cachedSamplesScheduledPath = '';
  _cachedSamples = [];
  _cachedSamplesLoading = false;
  _cachedSamplesGeneration++;
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
    const lines = computePrepReportLines(ensureFullOpeningTreeSnapshot(), colorPerspective, 8);
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
      ensureFullOpeningTreeSnapshot(),
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
  notifySessionStateChanged();
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
  notifySessionStateChanged();
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
  cancelTreeEvalWork();



  _buildGeneration++;
  _treeBuilding = false;
  _activeTool = 'opening-tree';
  _practiceSession = null;          // practice session must be cleared on close
  invalidateSampleCache();
  _activeCollection = null;
  _openingTree = null;
  _visibleTreeBuilder = null;
  _visibleTreeBuilderGeneration = 0;
  _openingTreeSnapshotKind = 'full';
  _sessionPath = [];
  _sessionNode = null;
  _currentPage = 'library';
  _sessionDateRange = null;
  _activeGames = [];
  void clearSessionState();
  notifySessionStateChanged();
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
    const shouldResumeSession = !_skipNextSavedSessionResume;
    _skipNextSavedSessionResume = false;
    if (session && _currentPage === 'library' && shouldResumeSession) {
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
