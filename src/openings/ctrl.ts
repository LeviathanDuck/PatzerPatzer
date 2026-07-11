/**
 * Openings subsystem controller — opponent-research prep tool.
 *
 * This is the ownership entry point for the openings page.
 * Separated from analysis/puzzle persistence by design.
 */

import { normalizeOpeningsTool } from './types';
import type { ResearchCollection, ResearchGame, ResearchSource, OpeningsTool } from './types';
import {
  loadCollections, saveCollection, deleteCollection as dbDeleteCollection,
  saveSessionState, loadSessionState, clearSessionState,
  type StoredOpeningsSession,
} from './db';
import { createAccountResearchCollection } from './routeTarget';
import { engineEnabled } from '../engine/ctrl';



import { listAccounts, type AccountCategory, type ChessAccount } from '../accounts';
import { loadGamesByAccountFromIdb } from '../idb';
import { OpeningTreeBuilder, nodeAtMoves, findSampleGames, type OpeningTreeNode, type SampleGameMatch } from './tree';
import type { ImportSpeed, ImportDateRange } from '../import/filters';
import {
  cancelTreeEval,
  isTreeEvalEnabled,
  startTreeEvalDeepening,
  startTreeEvalPass1,
} from './treeEval';
import { SETTLE_QUIET_MS } from './scheduler';
import type { OpponentsTreeUrlState, OpponentsUrlRange, OpponentsUrlSpeed, OpponentsUrlTarget } from './urlState';
import { filterGamesByDateCutoff, filterGamesByCustomRange } from './dateFilter';
import { playMoveSound } from '../board/sound';
import {
  createOpeningTreeBuildContext,
  openingTreeBuildMilestonesForProgress,
  recordOpeningTreeBuildEvent,
  recordOpeningTreeBuildFailure,
  type OpeningTreeBuildContext,
  type OpeningTreeSnapshotMode,
} from './treeBuildDiagnostics';
import { getDeviceMetadata } from '../diagnostics/session';
import { contextFromRootAndMoves, type EnginePositionContext } from '../engine/positionContext';
import { opponentsTreeUrlScopesMatch } from './routeOrchestration';
import {
  DEFAULT_OPENINGS_TREE_COLOR,
  normalizeOpeningsTreeColor,
  openingsTargetColorKey,
  readOpeningsTargetColor,
  resolveOpeningsRouteColor,
  resolveOpeningsSessionColor,
  writeOpeningsTargetColor,
  type OpeningsTreeColor,
} from './color';

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

const OPENINGS_BOARD_SOUND_KEY = 'patzer.openings.boardSoundEnabled';

export function openingsBoardSoundEnabled(): boolean {
  return localStorage.getItem(OPENINGS_BOARD_SOUND_KEY) !== 'false';
}

export function setOpeningsBoardSoundEnabled(enabled: boolean): void {
  localStorage.setItem(OPENINGS_BOARD_SOUND_KEY, String(enabled));
}

export function playOpeningsMoveSound(san: string | undefined): void {
  if (!openingsBoardSoundEnabled()) return;
  playMoveSound(san);
}

export interface OpeningsRoutePathRestoreResult {
  status: OpeningsRoutePathRestoreStatus;
  requested: string[];
  applied: string[];
}

export interface OpenCollectionOptions {
  initialPath?: string[];
  color?: OpeningsTreeColor;
  onInitialPathResolved?: (result: OpeningsRoutePathRestoreResult) => void;
}

const TREE_BUILD_CHUNK_SIZE = 200;
const SMALL_TREE_SNAPSHOT_GAME_LIMIT = 1000;
const LARGE_TREE_SNAPSHOT_INTERVAL_MS = 2500;
const SAMPLE_GAMES_SCAN_LIMIT = 250;



const MOBILE_INITIAL_GAME_CAP = 3000;

export type OpeningsSessionStateChangeHandler = (snapshot: OpponentsTreeUrlState | null) => void;

let _currentPage: OpeningsPage = 'library';
let _collections: ResearchCollection[] = [];
let _collectionsLoaded = false;





let _collectionsLoadError = false;
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
 * For route/import preload paths that need to stage side-only state before
 * openCollection receives the same color through OpenCollectionOptions.
 */
export function presetColorFilter(color: OpeningsTreeColor): void {
  _colorFilter = normalizeOpeningsTreeColor(color);
  _boardOrientation = _colorFilter;
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
export async function openAccountResearch(
  account: ChessAccount,
  redraw: () => void,
  signal?: AbortSignal,
  options: OpenCollectionOptions = {},
): Promise<void> {
  const records = await loadGamesByAccountFromIdb(account.id);
  if (signal?.aborted) return;
  openCollection(createAccountResearchCollection(account, records), redraw, options);
}

// --- Import workflow state ---
export type ImportStep = 'idle' | 'details';

let _importStep: ImportStep = 'idle';
let _isFetching = false;
let _importSource: ResearchSource = 'chesscom';
let _importUsername = '';
let _importColor: OpeningsTreeColor = DEFAULT_OPENINGS_TREE_COLOR;


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

function targetColorKeyForCollection(collection: ResearchCollection): string {
  const target = sessionUrlTargetFor(collection);
  return openingsTargetColorKey(target.kind, target.id);
}

export function targetColorKeyForUrlTarget(target: OpponentsUrlTarget | undefined): string | null {
  return target ? openingsTargetColorKey(target.kind, target.id) : null;
}

export function resolveOpeningsTargetColor(target: OpponentsUrlTarget | undefined): OpeningsTreeColor {
  const targetKey = targetColorKeyForUrlTarget(target);
  if (_activeCollection && targetColorKeyForCollection(_activeCollection) === targetKey) return _colorFilter;
  return readOpeningsTargetColor(targetKey, DEFAULT_OPENINGS_TREE_COLOR);
}

export function resolveOpeningsRouteStateColor(
  state: OpponentsTreeUrlState,
  colorExplicit: boolean,
): OpeningsTreeColor {
  if (!colorExplicit) return resolveOpeningsTargetColor(state.target);
  return resolveOpeningsRouteColor(state.color, colorExplicit, targetColorKeyForUrlTarget(state.target));
}

function persistActiveTargetColor(): void {
  if (!_activeCollection) return;
  writeOpeningsTargetColor(targetColorKeyForCollection(_activeCollection), _colorFilter);
}

function normalizedUrlSpeeds(speeds: ReadonlySet<string>): OpponentsUrlSpeed[] {
  return [...speeds].filter((speed): speed is OpponentsUrlSpeed => URL_SPEEDS.has(speed as OpponentsUrlSpeed));
}

function normalizedUrlRange(range: string | null): OpponentsUrlRange | null {
  return URL_RANGES.has(range as OpponentsUrlRange) ? range as OpponentsUrlRange : null;
}

export function openingsSessionUrlSnapshot(): OpponentsTreeUrlState | null {
  if (_currentPage !== 'session') return null;
  return activeOpeningsSessionUrlSnapshot();
}

function activeOpeningsSessionUrlSnapshot(): OpponentsTreeUrlState | null {
  if (!_activeCollection) return null;
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

export function restoreActiveOpeningsSessionFromUrlState(
  state: OpponentsTreeUrlState,
): OpeningsRoutePathRestoreResult | null {
  const currentSnapshot = activeOpeningsSessionUrlSnapshot();
  if (!currentSnapshot || !_openingTree) return null;
  if (!opponentsTreeUrlScopesMatch(currentSnapshot, state)) return null;

  _currentPage = 'session';
  _importStep = 'idle';
  _boardOrientation = state.orientation;
  _activeTool = state.tool;
  return navigateToClosestPath(state.line, false);
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








export function collectionsLoadError(): boolean {
  return _collectionsLoadError;
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
export function importColor(): OpeningsTreeColor { return _importColor; }
export function importError(): string | null { return _importError; }

export function setImportStep(step: ImportStep): void { _importStep = step; }
export function setImportSource(source: ResearchSource): void { _importSource = source; }
export function setImportUsername(username: string): void { _importUsername = username; }
export function setImportColor(color: OpeningsTreeColor): void { _importColor = normalizeOpeningsTreeColor(color); }
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
  _importColor = DEFAULT_OPENINGS_TREE_COLOR;
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

let _colorFilter: OpeningsTreeColor = DEFAULT_OPENINGS_TREE_COLOR;
let _speedFilter = new Set<string>(); // empty = all speeds
let _recencyMode: 'recent' | 'all-time' = 'all-time';
let _sessionDateRange: string | null = null;
/** Custom absolute date range bounds (YYYY-MM-DD). Used when _sessionDateRange === 'custom'. */
let _sessionCustomFrom = '';
let _sessionCustomTo = '';
let _treeEvalThoroughness: TreeEvalThoroughness = 'balanced';
const TREE_EVAL_DWELL_MS = 2_500;
let _treeEvalDwellTimer: ReturnType<typeof setTimeout> | null = null;
/** Settle timer for tree-eval pass-1 start. Separate from the deepening dwell timer. */
let _treeEvalPass1SettleTimer: ReturnType<typeof setTimeout> | null = null;
/** Games currently loaded into the tree (colour + speed + date filtered). */
let _activeGames: ResearchGame[] = [];

export function recencyMode(): 'recent' | 'all-time' { return _recencyMode; }
export function setRecencyMode(mode: 'recent' | 'all-time'): void {
  _recencyMode = mode;
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

/** Accessor for the custom-range lower bound (YYYY-MM-DD). Non-empty only when relevant. */
export function sessionCustomFrom(): string { return _sessionCustomFrom; }
/** Accessor for the custom-range upper bound (YYYY-MM-DD). Non-empty only when relevant. */
export function sessionCustomTo(): string { return _sessionCustomTo; }





export function presetSessionCustomFrom(v: string): void { _sessionCustomFrom = v; }
export function presetSessionCustomTo(v: string): void { _sessionCustomTo = v; }





export function setSessionCustomFrom(v: string, redraw: () => void): void {
  _sessionCustomFrom = v;
  if (_sessionDateRange === 'custom') setColorFilter(_colorFilter, redraw);
}
export function setSessionCustomTo(v: string, redraw: () => void): void {
  _sessionCustomTo = v;
  if (_sessionDateRange === 'custom') setColorFilter(_colorFilter, redraw);
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


  if (range === 'custom') {
    const from = _sessionCustomFrom || null;
    const to   = _sessionCustomTo   || null;
    const result = filterGamesByCustomRange(games, from, to);
    _excludedUndatedCount = result.excludedUndated;
    return result.games;
  }

  // Rolling preset: compute cutoff as a local calendar date string (YYYY-MM-DD) so
  // games on the boundary day are never wrongly dropped by UTC-midnight timezone arithmetic.
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
export function colorFilter(): OpeningsTreeColor { return _colorFilter; }
export function speedFilter(): ReadonlySet<string> { return _speedFilter; }
export function treeEvalThoroughness(): TreeEvalThoroughness { return _treeEvalThoroughness; }

export function setTreeEvalThoroughness(level: TreeEvalThoroughness, redraw: () => void): void {
  _treeEvalThoroughness = level;
  triggerTreeEvalForCurrentNode();
  redraw();
}

export function triggerTreeEvalForCurrentNode(): void {
  cancelTreeEvalDwellTimer();
  // Cancel any pending pass-1 settle (this nav event supersedes the previous one).
  cancelTreeEvalPass1SettleTimer();
  if (!_sessionNode || !isTreeEvalEnabled()) {
    cancelTreeEval();
    return;
  }




  if (isMobileTreeBuildDevice() && engineEnabled) {
    cancelTreeEval();
    return;
  }
  // Gate pass-1 behind settle — rapid navigation must not churn tree-eval pass-1.
  // Each call cancels and restarts this timer, so only the final navigation position
  // in a rapid burst starts pass-1. Deepening (pass-2) keeps its TREE_EVAL_DWELL_MS delay.
  // FEN + pathKey guard drops stale callbacks if the session moves on before the timer fires,
  // matching the guard pattern used in scheduleTreeEvalDwell.
  const node = _sessionNode;
  const pathKey = _sessionPath.join('/');
  _treeEvalPass1SettleTimer = setTimeout(() => {
    _treeEvalPass1SettleTimer = null;
    if (!_sessionNode || _sessionNode.fen !== node.fen || _sessionPath.join('/') !== pathKey) return;
    if (!isTreeEvalEnabled()) return;
    startTreeEvalPass1(node, _treeEvalThoroughness, {
      onPass2Complete: () => scheduleTreeEvalDwell(node.fen, pathKey),
      positionContextFor: openingTreeEvalPositionContextFor,
    });
  }, SETTLE_QUIET_MS);
}

function openingTreeEvalPositionContextFor(target: OpeningTreeNode): EnginePositionContext | undefined {
  if (!_openingTree || !_sessionNode) return undefined;
  const moves = target === _sessionNode
    ? _sessionPath
    : _sessionNode.children.includes(target)
      ? [..._sessionPath, target.uci]
      : null;
  if (!moves) return undefined;
  return contextFromRootAndMoves({
    initialFen: _openingTree.fen,
    moves,
    currentFen: target.fen,
    surface: 'opening-tree-eval',
    path: moves.join('/'),
  });
}

function cancelTreeEvalDwellTimer(): void {
  if (_treeEvalDwellTimer) {
    clearTimeout(_treeEvalDwellTimer);
    _treeEvalDwellTimer = null;
  }
}

function cancelTreeEvalPass1SettleTimer(): void {
  if (_treeEvalPass1SettleTimer !== null) {
    clearTimeout(_treeEvalPass1SettleTimer);
    _treeEvalPass1SettleTimer = null;
  }
}

function cancelTreeEvalWork(): void {
  cancelTreeEvalDwellTimer();
  cancelTreeEvalPass1SettleTimer();
  cancelTreeEval();
}

function scheduleTreeEvalDwell(fen: string, pathKey: string): void {
  cancelTreeEvalDwellTimer();
  _treeEvalDwellTimer = setTimeout(() => {
    _treeEvalDwellTimer = null;
    if (!isTreeEvalEnabled()) return;
    if (!_sessionNode || _sessionNode.fen !== fen || _sessionPath.join('/') !== pathKey) return;
    startTreeEvalDeepening(_sessionNode, _treeEvalThoroughness, openingTreeEvalPositionContextFor);
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
export function setColorFilter(color: OpeningsTreeColor, redraw: () => void): void {
  _colorFilter = normalizeOpeningsTreeColor(color);

  // Flip board orientation immediately — first visible feedback.
  _boardOrientation = _colorFilter;
  persistActiveTargetColor();

  if (!_activeCollection) { redraw(); return; }

  const target = _activeCollection.target?.toLowerCase() ?? '';
  let games = _activeCollection.games;
  if (target) {
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




  if (shouldUseLightTreeMode() && !_mobileLoadFull && games.length > MOBILE_INITIAL_GAME_CAP) {
    _cappedGamesCount = games.length - MOBILE_INITIAL_GAME_CAP;
    games = games.slice(0, MOBILE_INITIAL_GAME_CAP);
  } else {
    _cappedGamesCount = 0;
  }
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



let _mobileLoadFull = false;


let _cappedGamesCount = 0;

export function treeBuildProgress(): number { return _treeBuildProgress; }
export function treeBuildTotal(): number { return _treeBuildTotal; }
export function treeBuilding(): boolean { return _treeBuilding; }

export function cappedGamesCount(): number { return _cappedGamesCount; }





export function loadFullMobileTree(redraw: () => void): void {
  _mobileLoadFull = true;
  setColorFilter(_colorFilter, redraw);
}

function monotonicNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function isMobileTreeBuildDevice(): boolean {
  const deviceClass = getDeviceMetadata().deviceClass;
  return deviceClass === 'mobile' || deviceClass === 'tablet';
}






const LOW_MEMORY_HEAP_RATIO = 0.85;
function isLowMemoryMode(): boolean {
  const mem = typeof performance !== 'undefined'
    ? (performance as Performance & { memory?: { usedJSHeapSize?: number; jsHeapSizeLimit?: number } }).memory
    : undefined;
  if (!mem || !mem.usedJSHeapSize || !mem.jsHeapSizeLimit) return false;
  return mem.usedJSHeapSize / mem.jsHeapSizeLimit >= LOW_MEMORY_HEAP_RATIO;
}


function shouldUseLightTreeMode(): boolean {
  return isMobileTreeBuildDevice() || isLowMemoryMode();
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








  if (shouldUseLightTreeMode()) {
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
  const sameCollection = _activeCollection?.id === collection.id;
  const nextColor = options.color
    ? normalizeOpeningsTreeColor(options.color)
    : readOpeningsTargetColor(targetColorKeyForCollection(collection), DEFAULT_OPENINGS_TREE_COLOR);
  _colorFilter = nextColor;
  _boardOrientation = nextColor;
  if (options.color) writeOpeningsTargetColor(targetColorKeyForCollection(collection), nextColor);
  _activeTool = 'opening-tree';
  _activeCollection = collection;

  // Keep an existing tree visible only for same-collection rebuilds, mirroring
  // setColorFilter(). Different collection opens must not show the previous
  // collection's tree while the incoming build is still loading.
  cancelTreeEvalWork();
  if (!sameCollection || !_openingTree) {
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
  if (target) {
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




  if (shouldUseLightTreeMode() && !_mobileLoadFull && games.length > MOBILE_INITIAL_GAME_CAP) {
    _cappedGamesCount = games.length - MOBILE_INITIAL_GAME_CAP;
    games = games.slice(0, MOBILE_INITIAL_GAME_CAP);
  } else {
    _cappedGamesCount = 0;
  }
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
        color: _colorFilter,
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
    const previousPathLength = _sessionPath.length;
    const nextPath = [..._sessionPath, uci];
    const lazyResult = refreshVisibleLazySnapshot(nextPath, { persist: true, triggerEval: true, notify: true });
    if (lazyResult) {
      if (
        nextPath.length === previousPathLength + 1
        && lazyResult.status === 'exact'
        && lazyResult.applied.length === nextPath.length
      ) {
        playOpeningsMoveSound(child.san);
      }
      return;
    }
    _sessionPath = nextPath;
    _sessionNode = child;
    persistSession();
    triggerTreeEvalForCurrentNode();
    notifySessionStateChanged();
    if (nextPath.length === previousPathLength + 1) playOpeningsMoveSound(child.san);
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
  const previousPath = _sessionPath;
  const isOneStepForward = moves.length === previousPath.length + 1
    && previousPath.every((move, index) => moves[index] === move);
  const lazyResult = refreshVisibleLazySnapshot(moves, { persist: true, triggerEval: true, notify: true });
  if (lazyResult) {
    if (isOneStepForward && lazyResult.status === 'exact' && lazyResult.applied.length === moves.length) {
      playOpeningsMoveSound(_sessionNode?.san);
    }
    return;
  }
  const target = nodeAtMoves(_openingTree, moves);
  if (target) {
    _sessionPath = [...moves];
    _sessionNode = target;
    persistSession();
    triggerTreeEvalForCurrentNode();
    notifySessionStateChanged();
    if (isOneStepForward) playOpeningsMoveSound(target.san);
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
    const games = _activeGames;
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
      const matches = findSampleGames(games, path, SAMPLE_GAMES_SCAN_LIMIT);
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
    _cachedSamples = findSampleGames(_activeGames, _sessionPath, limit);
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
}

/** Close the current session, return to library. */
export function closeSession(): void {
  cancelTreeEvalWork();



  _buildGeneration++;
  _treeBuilding = false;
  _activeTool = 'opening-tree';
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
  _sessionCustomFrom = '';
  _sessionCustomTo = '';
  _activeGames = [];

  _mobileLoadFull = false;
  _cappedGamesCount = 0;
  void clearSessionState();
  notifySessionStateChanged();
}

/** Load saved research collections from the openings DB. */
export async function loadSavedCollections(redraw: () => void): Promise<void> {
  if (_collectionsLoaded) return;

  // Step 1 — load the saved collections. loadCollections() now REJECTS on a genuine storage failure
  // (BUG-2026-07-10-013 P1) instead of masking it as an empty library. A failure here makes the
  // whole library unavailable: clear the list, latch the error flag so the view can render an
  // honest error state (UI States rule) instead of a silent empty library, and stop — there is
  // nothing to resume onto.
  let loaded: ResearchCollection[];
  try {
    loaded = await loadCollections();
  } catch (e) {
    console.warn('[openings] failed to load collections', e);
    _collections = [];
    _collectionsLoadError = true;
    _collectionsLoaded = true;
    redraw();
    return;
  }
  loaded.sort((a, b) => b.createdAt - a.createdAt);
  _collections = loaded;
  _collectionsLoadError = false;
  _collectionsLoaded = true;

  // Step 2 — try to resume the saved session. This is a SEPARATE concern from loading the library
  // (previously they shared one try/catch, so a loadSessionState reject would WIPE the collections
  // just loaded above). loadSessionState() now REJECTS on a genuine storage failure (P2) instead of
  // masking it as "no session". On failure the resume is not possible: keep the loaded collections,
  // do NOT fabricate an empty session, fall back to the fresh-entry path (land on the library with
  // collections intact) and latch the error signal. The session read is only attempted when a
  // resume is actually wanted, so an ignored read never raises a spurious error signal.
  const shouldResumeSession = !_skipNextSavedSessionResume;
  _skipNextSavedSessionResume = false;
  if (shouldResumeSession) {
    try {
      const session = await loadSessionState();
      if (session && _currentPage === 'library') {
        const col = _collections.find(c => c.id === session.collectionId);
        if (col) {
          const restoredColor = resolveOpeningsSessionColor(session.color, targetColorKeyForCollection(col));
          openCollection(col, redraw, { color: restoredColor }); // resets _activeTool to 'opening-tree'
          if (session.path.length > 0) navigateToPath(session.path);
          if (session.orientation) _boardOrientation = session.orientation;
          // Restore active tool — fall back to 'opening-tree' if missing or invalid.
          // Legacy 'repertoire' sessions migrate to 'opponent-repertoire'.
          const restoredTool = session.activeTool ? normalizeOpeningsTool(session.activeTool) : null;
          if (restoredTool) _activeTool = restoredTool;
        }
      }
    } catch (e) {
      console.warn('[openings] failed to resume saved session', e);
      // Resume-not-possible: keep the loaded collections (never wipe them), do not fabricate a
      // session, and surface the storage error. _currentPage stays 'library' (fresh-entry path).
      _collectionsLoadError = true;
    }
  }

  redraw();
}
