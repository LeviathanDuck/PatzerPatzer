/**
 * Openings subsystem view — renders the openings page shell.
 *
 * Adapted from Lichess ctrl/view separation pattern.
 * Import workflow follows OpeningTree-style: source -> details -> actions.
 */
import { h, type VNode } from 'snabbdom';
import { renderToggleRow } from '../ui';
import { Chessground as makeChessground } from '@lichess-org/chessground';
import type { Api as CgApi } from '@lichess-org/chessground/api';
import type { Config as CgConfig } from '@lichess-org/chessground/config';
import type { Key } from '@lichess-org/chessground/types';
import type { DrawShape } from '@lichess-org/chessground/draw';
import { parseFen, makeFen } from 'chessops/fen';
import { parsePgn, startingPosition } from 'chessops/pgn';
import { parseSan, makeSan, makeSanAndPlay } from 'chessops/san';
import { chessgroundDests } from 'chessops/compat';
import { Chess, normalizeMove } from 'chessops/chess';
import { parseUci } from 'chessops/util';
import { randomMasterGame } from '../showcase/masterGames';
import type { MasterGame } from '../showcase/masterGames';
import { bindBoardResizeHandle } from '../board/index';
import { REPERTOIRE_ALT_ARROW_BRUSH, REPERTOIRE_ARROW_BRUSH } from '../board/arrowBrushes';
import { chessBoardAnimationConfig, onBoardAnimationChange } from '../board/animation';
import { renderMoveList } from '../analyse/moveList';
import { formatScore, renderEvalBar } from '../analyse/evalView';
import type { TreeNode } from '../tree/types';
import { accountSection, updateAccount, type ChessAccount, type AccountSection, type AccountCategory } from '../accounts';
import { deleteImportedAccountAndGames } from '../sync/dataManagement';
import { computeAccountCardStats, PRIMARY_CARD_SPEEDS, type AccountCardStats, type AccountSpeedStat } from './accountCardStats';
import {
  collections, collectionsLoaded, collectionsLoadError, loadSavedCollections,
  registryAccounts, accountsLoaded, loadRegistryAccounts, openAccountResearch,
  refreshRegistryAccounts, invalidateImportedSpeeds, getImportedSpeedsForAccount,
  openingsPage, activeCollection, activeGames, sessionNode, sessionPath, openingTree, sampleGames,
  openingsSessionUrlSnapshot,
  boardOrientation, flipBoard, colorFilter, setColorFilter, speedFilter, setSpeedFilter,
  routeRecoveryMessage,
  sampleGamesSortMode, setSampleGamesSortMode, sampleGamesResultFilter, setSampleGamesResultFilter,
  sessionDateRange, setSessionDateRange, SESSION_DATE_RANGE_OPTIONS,
  sessionCustomFrom, sessionCustomTo, presetSessionCustomFrom, presetSessionCustomTo,
  setSessionCustomFrom, setSessionCustomTo, excludedUndatedCount,
  treeEvalThoroughness, setTreeEvalThoroughness, TREE_EVAL_THOROUGHNESS_OPTIONS,
  triggerTreeEvalForCurrentNode, openingsBoardSoundEnabled, setOpeningsBoardSoundEnabled,
  playOpeningsMoveSound,
  openCollection, closeSession, presetColorFilter, presetSpeedFilter, presetSessionDateRange, navigateToMove, navigateBack, navigateToRoot, navigateToPath, navigateToEnd,
  removeCollection, renameCollection,
  treeBuilding, treeBuildProgress, treeBuildTotal, cappedGamesCount, loadFullMobileTree,
  isFetching, importStep, importSource, importUsername, importColor, importError,
  importCategory, setImportCategory,
  importProgress, importMonth, cancelImport,
  importSpeeds, setImportSpeeds, importDateRange, setImportDateRange,
  importCustomFrom, setImportCustomFrom, importCustomTo, setImportCustomTo,
  importRated, setImportRated, importMaxGames, setImportMaxGames,
  setImportStep, setImportSource, setImportUsername, setImportColor,
  resetImport,
  deviationResults, deviationLoading, deviationProgress, deviationTotal,
  startDeviationScan, recencyMode, setRecencyMode,
} from './ctrl';
import {
  SPEED_OPTIONS, DATE_RANGE_OPTIONS,
  importFilters,
  currentImportDateRangeConfig, importSyncFilterKey,
  type ImportSpeed, type ImportDateRange,
} from '../import/filters';
import { syncAccountGamesWithBackfill, peekAccountSync, type AccountSyncWithBackfillResult } from '../import/accountSync';
import { enqueueImportEnrichment } from '../import/enrichment';
import type { ResearchCollection, ResearchGame, ResearchSource } from './types';
import type { OpeningTreeNode, SampleGameMatch } from './tree';
import { executeResearchImport } from './import';
import { openingDataHasMove } from './explorer';
import { explorerCtrl } from './explorerCtrl';
import { reportIssue } from '../diagnostics/reporting/reportAction';
import { clearCevalPositionOverride, renderCeval, renderPvBox, renderEngineSettings, setCevalPositionOverride } from '../ceval/view';
import { renderMoveNavBar } from '../analyse/analysisControls';
import {
  engineEnabled, evalCurrentPosition,
  buildEngineArrowShapes,
  visibleEvalForFen,
  showEngineArrows, setShowEngineArrows,
  arrowAllLines, setArrowAllLines,
  showArrowLabels, setShowArrowLabels,
  stopProtocol,
  syncArrowForced,
} from '../engine/ctrl';
import {
  cancelTreeEval,
  getTreeEval,
  getTreeEvalStatus,
  initTreeEval,
  isTreeEvalEnabled,
  setTreeEvalEnabled,
  type TreeEvalEntry,
} from './treeEval';
import {
  contextFromRootAndMoves,
  fenOnlyPositionContext,
  type EnginePositionContext,
} from '../engine/positionContext';
import { saveOrpLineToLibrary } from '../study/saveAction';
import { saveStudy } from '../study/studyDb';
import type { StudyItem } from '../study/types';
import SaveFlowCtrl, { type SaveFlowContext, type SaveFlowResult } from '../save/saveFlowCtrl';
import renderSaveFlowModal from '../save/saveFlowView';
import { repertoireSources } from '../study/studyCtrl';
import { buildRepertoireArrowShapes } from '../repertoire/arrowShapes';
import {
  markNav, currentGenerationToken, isGenerationCurrent, onSettle, isRapid,
} from './scheduler';
import {
  renderExplorerDbTabs,
  renderExplorerConfigPanel,
  renderExplorerPanel,
  type OpeningTreeExplorerHost,
} from './explorerView';
import { opponentsEntryHref } from './routeOrchestration';
import { enterAnalysisMode, renderAnalysisModeToggleButton } from '../board/analysisModeToggle';

let _openingsCg: CgApi | undefined;
let _lastOpeningsAutoShapesHash: string | null = null;




let _showTreeArrows: boolean = true;
function showTreeArrows(): boolean { return _showTreeArrows; }
function toggleTreeArrows(): void { _showTreeArrows = !_showTreeArrows; }
let _lastBoardFen: string = '';
const STANDARD_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
// Tracks the FEN when the user has played a legal off-tree move in browse mode.
// null = board is showing the current sessionNode().fen (in-tree position).
// non-null = board is showing a transient analysis position beyond the tree.
let _offTreeFen: string | null = null;

type OpeningTreeColumnOrder = 'tree-left' | 'engine-left';
interface OpeningTreeDesktopLayoutPrefs {
  order: OpeningTreeColumnOrder;
  leftSlotPct: number;
}

const OPENINGS_TREE_LAYOUT_STORAGE_KEY = 'patzer.openings.treeLayout.v1';
const OPENINGS_TREE_LAYOUT_DEFAULT: OpeningTreeDesktopLayoutPrefs = {
  order:       'tree-left',
  leftSlotPct: 60,
};
const OPENINGS_TREE_LEFT_SLOT_FALLBACK_MIN = 264;
const OPENINGS_TREE_RIGHT_SLOT_FALLBACK_MIN = 240;

function clampOpeningTreeLeftSlotPct(pct: number): number {
  if (!Number.isFinite(pct)) return OPENINGS_TREE_LAYOUT_DEFAULT.leftSlotPct;
  return Math.max(18, Math.min(82, Math.round(pct * 10) / 10));
}

function isOpeningTreeColumnOrder(value: unknown): value is OpeningTreeColumnOrder {
  return value === 'tree-left' || value === 'engine-left';
}

function readOpeningTreeDesktopLayoutPrefs(): OpeningTreeDesktopLayoutPrefs {
  try {
    const raw = localStorage.getItem(OPENINGS_TREE_LAYOUT_STORAGE_KEY);
    if (!raw) return { ...OPENINGS_TREE_LAYOUT_DEFAULT };
    const parsed = JSON.parse(raw) as Partial<OpeningTreeDesktopLayoutPrefs>;
    return {
      order:       isOpeningTreeColumnOrder(parsed.order) ? parsed.order : OPENINGS_TREE_LAYOUT_DEFAULT.order,
      leftSlotPct: clampOpeningTreeLeftSlotPct(Number(parsed.leftSlotPct)),
    };
  } catch {
    return { ...OPENINGS_TREE_LAYOUT_DEFAULT };
  }
}

let _openingTreeDesktopLayout = readOpeningTreeDesktopLayoutPrefs();

function persistOpeningTreeDesktopLayoutPrefs(): void {
  try {
    localStorage.setItem(OPENINGS_TREE_LAYOUT_STORAGE_KEY, JSON.stringify(_openingTreeDesktopLayout));
  } catch {
    // Ignore storage failures; the layout remains usable for the current session.
  }
}

function openingTreeSlotVars(pct = _openingTreeDesktopLayout.leftSlotPct): string {
  const left = clampOpeningTreeLeftSlotPct(pct);
  const right = Math.max(0, 100 - left);
  return `---openings-left-slot-fr:${left}fr;---openings-right-slot-fr:${right}fr;`;
}

function applyOpeningTreeSlotVars(workspace: HTMLElement, pct = _openingTreeDesktopLayout.leftSlotPct): void {
  const left = clampOpeningTreeLeftSlotPct(pct);
  workspace.style.setProperty('---openings-left-slot-fr', `${left}fr`);
  workspace.style.setProperty('---openings-right-slot-fr', `${Math.max(0, 100 - left)}fr`);
}

function openingTreeSlotMinimums(workspace: HTMLElement): { left: number; right: number } {
  const nav = workspace.querySelector('.openings__nav-slot .move-nav-bar') as HTMLElement | null;
  const navWidth = nav ? Math.ceil(Math.max(nav.scrollWidth, nav.getBoundingClientRect().width)) + 12 : 0;
  const moveList = workspace.querySelector('.openings__data-column--engine .openings__move-list') as HTMLElement | null;
  const moveListWidth = moveList ? Math.ceil(Math.max(moveList.getBoundingClientRect().width, moveList.scrollWidth)) : 0;
  return {
    left:  Math.max(OPENINGS_TREE_LEFT_SLOT_FALLBACK_MIN, navWidth),
    right: Math.max(OPENINGS_TREE_RIGHT_SLOT_FALLBACK_MIN, Math.min(360, moveListWidth)),
  };
}

function clampOpeningTreeLeftSlotPctForWorkspace(pct: number, workspace: HTMLElement | null): number {
  if (!workspace) return clampOpeningTreeLeftSlotPct(pct);
  const columns = workspace.querySelector('.openings__right-columns') as HTMLElement | null;
  const width = columns?.getBoundingClientRect().width ?? 0;
  if (width <= 0) return clampOpeningTreeLeftSlotPct(pct);
  const mins = openingTreeSlotMinimums(workspace);
  const minPct = Math.min(48, (mins.left / width) * 100);
  const maxPct = Math.max(52, 100 - (mins.right / width) * 100);
  if (minPct >= maxPct) return 50;
  return Math.round(Math.max(minPct, Math.min(maxPct, pct)) * 10) / 10;
}

function setOpeningTreeLeftSlotPct(
  pct: number,
  redraw: () => void,
  workspace: HTMLElement | null = null,
): void {
  _openingTreeDesktopLayout = {
    ..._openingTreeDesktopLayout,
    leftSlotPct: clampOpeningTreeLeftSlotPctForWorkspace(pct, workspace),
  };
  persistOpeningTreeDesktopLayoutPrefs();
  if (workspace) applyOpeningTreeSlotVars(workspace);
  redraw();
}

function toggleOpeningTreeColumnOrder(redraw: () => void): void {
  _openingTreeDesktopLayout = {
    ..._openingTreeDesktopLayout,
    order: _openingTreeDesktopLayout.order === 'tree-left' ? 'engine-left' : 'tree-left',
  };
  persistOpeningTreeDesktopLayoutPrefs();
  redraw();
}

function openingTreePctFromPointer(clientX: number, workspace: HTMLElement): number {
  const columns = workspace.querySelector('.openings__right-columns') as HTMLElement | null;
  if (!columns) return _openingTreeDesktopLayout.leftSlotPct;
  const rect = columns.getBoundingClientRect();
  const handle = columns.querySelector('.openings__split-handle') as HTMLElement | null;
  const handleWidth = handle?.getBoundingClientRect().width ?? 10;
  const available = Math.max(1, rect.width - handleWidth);
  const rawLeftPx = clientX - rect.left - (handleWidth / 2);
  return clampOpeningTreeLeftSlotPctForWorkspace((rawLeftPx / available) * 100, workspace);
}

function beginOpeningTreeColumnResize(event: PointerEvent, redraw: () => void): void {
  if (event.button !== 0) return;
  const handle = event.currentTarget as HTMLElement | null;
  const workspace = handle?.closest('.openings__right-workspace') as HTMLElement | null;
  if (!handle || !workspace) return;
  event.preventDefault();
  handle.setPointerCapture?.(event.pointerId);
  document.body.classList.add('openings-column-resizing');

  const move = (moveEvent: PointerEvent) => {
    const pct = openingTreePctFromPointer(moveEvent.clientX, workspace);
    _openingTreeDesktopLayout = { ..._openingTreeDesktopLayout, leftSlotPct: pct };
    applyOpeningTreeSlotVars(workspace, pct);
  };

  const stop = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
    document.body.classList.remove('openings-column-resizing');
    persistOpeningTreeDesktopLayoutPrefs();
    redraw();
  };

  move(event);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', stop);
  window.addEventListener('pointercancel', stop);
}

function handleOpeningTreeSplitKeydown(event: KeyboardEvent, redraw: () => void): void {
  const delta = event.key === 'ArrowLeft' ? -2 : event.key === 'ArrowRight' ? 2 : 0;
  if (delta === 0) return;
  event.preventDefault();
  const workspace = (event.currentTarget as HTMLElement | null)?.closest('.openings__right-workspace') as HTMLElement | null;
  setOpeningTreeLeftSlotPct(_openingTreeDesktopLayout.leftSlotPct + delta, redraw, workspace);
}

function openingsPositionContext(fen: string, surface = 'openings-live'): EnginePositionContext {
  const root = openingTree();
  const node = sessionNode();
  const path = sessionPath();
  if (!_offTreeFen && root && node && node.fen === fen) {
    return contextFromRootAndMoves({
      initialFen: root.fen,
      moves: path,
      currentFen: fen,
      surface,
      path: path.join('/'),
    });
  }

  return fenOnlyPositionContext(
    fen,
    surface,
    _offTreeFen ? 'off-tree-position-no-unique-history' : 'missing-opening-tree-path',
  );
}

let _sampleRenderPathKey = '';
let _sampleRenderLimit = 25;
let _samplePreviewGameId: string | null = null;
let _samplePreviewFen: string | null = null;
let _samplePreviewStyle = '';
let _samplePreviewTimer: ReturnType<typeof setTimeout> | null = null;
const _sampleFinalFenCache = new Map<string, string | null>();

const SAMPLE_INITIAL_BATCH = 25;
const SAMPLE_BATCH_SIZE = 25;
const SAMPLE_PREVIEW_SIZE = 180;

// ─── Import animation state ───────────────────────────────────────────────────
// While isFetching(), the board plays through a random master game to give the
// user something engaging to watch. State lives at module level so it persists
// across Snabbdom patch cycles during the fetch.
let _animGame:    MasterGame | null = null;
let _animMoveIdx: number = 0;
let _animTimer:   ReturnType<typeof setTimeout> | null = null;
let _animPos:     Chess | null = null;

const ANIM_MOVE_MS = 300; // ms per move

// --- Openings action-menu state ---
// Mirrors the analysis action-menu pattern in src/analyse/analysisControls.ts
let _openingsMenuOpen = false;
let _dateRangePopupOpen = false;

let _expandedCardKey: string | null = null;


let _expandedMenuKey: string | null = null;
// Inline tag-add input state for the edit menu, mirrors src/study/libraryView.ts _editingTagId.
let _editingAccountTagId: string | null = null;
let _editingAccountTagValue = '';
// Busy/error state for the edit menu's destructive delete action.
let _accountActionRunningId: string | null = null;
let _accountActionError: string | null = null;



let _accountReorderMode = false;


let _archiveCollapsed = false;
// Drag state for the in-progress reorder gesture: the account id being dragged,
// and the current drop target (`anchorId: null` means "append to end of section").
let _draggingAccountId: string | null = null;
let _dragOverTarget: { section: AccountSection; anchorId: string | null; before: boolean } | null = null;

interface AccountPeekViewState { scopeKey: string; loading: boolean; supported: boolean; count: number; notImported: boolean; }
const _peekState = new Map<string, AccountPeekViewState>();
const _peekGen = new Map<string, number>();
const _peekTimer = new Map<string, ReturnType<typeof setTimeout>>();
const _importedSpeedsView = new Map<string, Set<string>>();
const _importedSpeedsLoading = new Set<string>();
let _accountSyncRunningId: string | null = null;

let _accountSyncAbort: AbortController | null = null;
const _accountSyncMessages = new Map<string, string>();
const _accountSyncErrors = new Map<string, string>();


const _accountCardStats = new Map<string, AccountCardStats>();
const _accountCardStatsLoading = new Set<string>();
const _accountCardStatsError = new Set<string>();

// Icon codepoints reused from analysisControls.ts conventions.
// Adapted from lichess-org/lila: ui/lib/src/licon.ts
const ICON_FLIP       = '\ue020'; // licon.ChasingArrows — flip board

function reportOpeningsIssue(): void {
  const session = reportIssue({ triggeredBy: 'opponents-route', route: '/openings' });
  console.info('[diagnostics] report issue session', session);
}

function platformLabel(platform: ChessAccount['platform']): string {
  return platform === 'chesscom' ? 'Chess.com' : 'Lichess';
}


function formatLongSyncDate(timestamp: number | null): string {
  if (timestamp === null) return 'never';
  const d = new Date(timestamp);
  const month = d.toLocaleDateString(undefined, { month: 'long' });
  const day = d.getDate();
  const v = day % 100;
  const suffix = v >= 11 && v <= 13 ? 'th'
    : day % 10 === 1 ? 'st'
    : day % 10 === 2 ? 'nd'
    : day % 10 === 3 ? 'rd'
    : 'th';
  return `${month} ${day}${suffix} ${d.getFullYear()}`;
}

/** Render the openings page (library or session). */
export function renderOpeningsPage(redraw: () => void): VNode {
  const page = openingsPage();
  if (page === 'loading') return renderRouteLoadingPage();
  if (page === 'session') return renderSessionPage(redraw);
  return renderLibraryPage(redraw);
}

function renderRouteRecoveryBanner(): VNode | null {
  const message = routeRecoveryMessage();
  return message
    ? h('div.openings__route-recovery', { attrs: { role: 'status' } }, message)
    : null;
}

function renderRouteLoadingPage(): VNode {
  return h('div.openings', [
    h('div.openings__header', [
      h('h1.openings__title', 'Opening Tree'),
    ]),
    h('div.openings__body', [
      h('div.openings__loading', 'Restoring opening tree\u2026'),
    ]),
  ]);
}

// ========== Library page ==========










function renderLibraryLoadError(): VNode {
  return h('div.openings__loading.openings__loading--error', [
    h('p', 'Couldn’t load your saved research — a storage error occurred.'),
    h('p', 'Your research is not lost. Reload to try again.'),
    h('button.openings__new-btn', {
      attrs: { type: 'button' },
      on: { click: () => { window.location.reload(); } },
    }, 'Reload'),
  ]);
}

function renderLibraryPage(redraw: () => void): VNode {
  if (!collectionsLoaded()) {
    void loadSavedCollections(redraw);
    return h('div.openings', [
      h('div.openings__header', [
        h('h1.openings__title', 'Opening Tree'),
      ]),
      h('div.openings__body', [
        h('div.openings__loading', 'Loading collections\u2026'),
      ]),
    ]);
  }

  if (!accountsLoaded()) void loadRegistryAccounts(redraw);
  const saved = collections();
  const accounts = registryAccounts();
  const step = importStep();

  return h('div.openings', [
    h('div.openings__header', [
      h('h1.openings__title', 'Opening Tree'),
      step === 'idle'
        ? h('button.openings__new-btn', {
            on: { click: () => { setImportStep('details'); redraw(); } },
          }, 'New Research')
        : null,
    ]),
    renderRouteRecoveryBanner(),
    step !== 'idle'
      ? renderImportWorkflow(redraw)
      // Storage-failure state (BUG-2026-07-10-013 P2): the saved-collections load rejected AND there
      // are no collections to show — render an honest error card in place of the silent empty state
      // (accounts load separately, so keep any accounts section visible). A resume-only failure keeps
      // the collections (saved.length > 0), so it falls through to the normal branch below and the
      // collections surface is never nuked.
      : collectionsLoadError() && saved.length === 0
        ? h('div.openings__body', [
            accounts.length > 0 ? renderAccountsSection(accounts, redraw) : null,
            renderLibraryLoadError(),
          ])
        : h('div.openings__body', saved.length === 0 && accounts.length === 0
            ? [renderEmptyState(redraw)]
            : [
                accounts.length > 0 ? renderAccountsSection(accounts, redraw) : null,
                saved.length > 0 ? renderCollectionList(saved, redraw) : null,
              ],
          ),
  ]);
}










function syncBackfillTargetStartMs(): number {
  const range = sessionDateRange();
  if (range === null) return 0;
  if (range === 'custom') {
    const from = sessionCustomFrom();
    if (!from) return 0;
    const ts = Date.parse(`${from}T00:00:00Z`);
    return Number.isNaN(ts) ? 0 : ts;
  }
  const entry = (SESSION_DATE_RANGE_OPTIONS as readonly { value: string; days: number }[]).find(o => o.value === range);
  return entry ? Date.now() - entry.days * 86_400_000 : 0;
}







async function runAccountSync(account: ChessAccount, redraw: () => void): Promise<void> {
  if (_accountSyncRunningId !== null) return;
  const filterKey = importSyncFilterKey(importFilters.rated, importFilters.speeds);
  const filterMismatch = account.newestGameTimestamp !== null && account.syncFilterKey !== filterKey;
  const needsFallback = account.newestGameTimestamp === null || filterMismatch;
  _accountSyncRunningId = account.id;
  _accountSyncAbort = new AbortController();
  _accountSyncMessages.delete(account.id);
  _accountSyncErrors.delete(account.id);
  redraw();
  try {
    const result: AccountSyncWithBackfillResult = await syncAccountGamesWithBackfill(account, {
      rated: importFilters.rated,
      speeds: importFilters.speeds,
      syncDateRange: currentImportDateRangeConfig(),
      backfillTargetStartMs: syncBackfillTargetStartMs(),
      signal: _accountSyncAbort.signal,
      onProgress: count => {
        _accountSyncMessages.set(account.id, `Fetched ${count} game${count === 1 ? '' : 's'}...`);
        redraw();
      },
      ...(needsFallback ? { fallbackDateRange: currentImportDateRangeConfig() } : {}),
    });






    if (result.newGames.length > 0) {
      enqueueImportEnrichment(result.newGames, { onGameEnriched: () => redraw() });
    }
    invalidateImportedSpeeds(account.id);
    resetAccountPeek(account.id);
    const refreshedAccounts = await refreshRegistryAccounts(redraw);
    const refreshedAccount = refreshedAccounts.find(a => a.id === account.id) ?? account;
    if (activeCollection()?.id === `account:${account.id}`) {
      await openAccountResearch(refreshedAccount, redraw);
    }
    const olderAdded = result.older?.addedCount ?? 0;
    const summary = result.addedCount === 0
      ? 'No new games to import'
      : `Imported ${result.addedCount} new game${result.addedCount === 1 ? '' : 's'}${
          olderAdded > 0 ? ` (${olderAdded} older)` : ''}`;
    _accountSyncMessages.set(account.id, result.aborted
      ? `Sync stopped — ${summary.charAt(0).toLowerCase()}${summary.slice(1)}`
      : summary);
  } catch (err) {
    _accountSyncErrors.set(account.id, err instanceof Error ? err.message : 'Sync failed.');
  } finally {
    _accountSyncRunningId = null;
    _accountSyncAbort = null;
    redraw();
  }
}


const _accountSyncPromise = new Map<string, Promise<void>>();


function startAccountSync(account: ChessAccount, redraw: () => void): Promise<void> {
  const existing = _accountSyncPromise.get(account.id);
  if (existing) return existing;
  const p = runAccountSync(account, redraw).finally(() => {
    if (_accountSyncPromise.get(account.id) === p) _accountSyncPromise.delete(account.id);
  });
  _accountSyncPromise.set(account.id, p);
  return p;
}









const PEEK_STANDARD_SPEEDS: readonly ImportSpeed[] = SPEED_OPTIONS.map(o => o.value);






function ensureAccountPeek(account: ChessAccount, redraw: () => void): void {
  const imported = _importedSpeedsView.get(account.id);
  if (imported === undefined) {
    if (!_importedSpeedsLoading.has(account.id)) {
      _importedSpeedsLoading.add(account.id);
      void getImportedSpeedsForAccount(account.id)
        .then(set => { _importedSpeedsView.set(account.id, set); _importedSpeedsLoading.delete(account.id); redraw(); })
        .catch(() => { _importedSpeedsLoading.delete(account.id); });
    }
    return;
  }
  const selected = speedFilter();
  const effective = selected.size === 0
    ? PEEK_STANDARD_SPEEDS.filter(v => imported.has(v))
    : PEEK_STANDARD_SPEEDS.filter(v => selected.has(v) && imported.has(v));
  const notImported = selected.size > 0 && effective.length === 0;
  const canPeek = !notImported && effective.length > 0 && account.newestGameTimestamp !== null;
  const scopeKey = `${account.newestGameTimestamp}|${importFilters.rated}|${[...effective].sort().join(',')}|${notImported}`;
  const existing = _peekState.get(account.id);
  if (existing && existing.scopeKey === scopeKey) return;
  if (!canPeek) {
    _peekState.set(account.id, { scopeKey, loading: false, supported: false, count: 0, notImported });
    return;
  }
  const prevTimer = _peekTimer.get(account.id);
  if (prevTimer) clearTimeout(prevTimer);
  _peekState.set(account.id, { scopeKey, loading: true, supported: true, count: 0, notImported: false });
  const gen = (_peekGen.get(account.id) ?? 0) + 1;
  _peekGen.set(account.id, gen);
  const timer = setTimeout(() => {
    _peekTimer.delete(account.id);
    void peekAccountSync(account, { rated: importFilters.rated, speeds: new Set(effective) })
      .then(res => {
        if (_peekGen.get(account.id) !== gen) return;
        _peekState.set(account.id, { scopeKey, loading: false, supported: res.supported, count: res.newGameCount, notImported: false });
        redraw();
      })
      .catch(() => {
        if (_peekGen.get(account.id) !== gen) return;
        _peekState.set(account.id, { scopeKey, loading: false, supported: false, count: 0, notImported: false });
        redraw();
      });
  }, 400);
  _peekTimer.set(account.id, timer);
}


function resetAccountPeek(accountId: string): void {
  _peekState.delete(accountId);
  _importedSpeedsView.delete(accountId);
  _accountCardStats.delete(accountId);
  _accountCardStatsLoading.delete(accountId);
  _accountCardStatsError.delete(accountId);
  const timer = _peekTimer.get(accountId);
  if (timer) { clearTimeout(timer); _peekTimer.delete(accountId); }
}






function ensureAccountCardStats(account: ChessAccount, redraw: () => void): void {
  if (_accountCardStats.has(account.id) || _accountCardStatsLoading.has(account.id) || _accountCardStatsError.has(account.id)) {
    return;
  }
  _accountCardStatsLoading.add(account.id);
  void computeAccountCardStats(account)
    .then(stats => {
      _accountCardStatsLoading.delete(account.id);
      _accountCardStats.set(account.id, stats);
      redraw();
    })
    .catch(() => {
      _accountCardStatsLoading.delete(account.id);
      _accountCardStatsError.add(account.id);
      redraw();
    });
}


function renderPreLoadSyncArea(account: ChessAccount, redraw: () => void): VNode {
  const message = _accountSyncMessages.get(account.id);
  const error = _accountSyncErrors.get(account.id);
  const running = _accountSyncRunningId === account.id;
  ensureAccountPeek(account, redraw);
  const peek = _peekState.get(account.id);
  const hasNew = !!(peek && peek.supported && peek.count > 0);
  const peekText = peek?.notImported ? 'Selected time control not imported yet'
    : peek?.loading ? 'Checking for new games…'
    : peek?.supported ? (peek.count > 0 ? `Sync in ${peek.count} new game${peek.count === 1 ? '' : 's'}` : 'Up to date')
    : '';


  const oldest = account.oldestGameTimestamp;
  const newest = account.newestGameTimestamp;
  const coverage = newest === null ? null
    : oldest !== null && oldest <= 0 ? `Imported: full history — ${formatLongSyncDate(newest)}`
    : oldest !== null ? `Imported: ${formatLongSyncDate(oldest)} — ${formatLongSyncDate(newest)}`
    : null;
  // Gap hint: the selected Period reaches further back than coverage.
  const backfillTarget = syncBackfillTargetStartMs();
  const hasGap = oldest !== null && oldest > 0 && backfillTarget < oldest;
  // Wider-safety-fetch warning, mirroring the header sync menu.
  const filterKey = importSyncFilterKey(importFilters.rated, importFilters.speeds);
  const filterMismatch = newest !== null && account.syncFilterKey !== filterKey;

  return h('div.openings__preload-sync', [
    h('div.openings__preload-sync-row', [
      h('span.openings__preload-sync-date', `Last synced ${formatLongSyncDate(account.lastSyncedAt)}`),
      h('button.openings__preload-sync-refresh', {
        attrs: { type: 'button', title: 'Check for new games' },
        on: { click: (e: Event) => { e.stopPropagation(); resetAccountPeek(account.id); redraw(); } },
      }, '⟳'),
      running ? h('button.openings__preload-sync-btn', {
        attrs: { type: 'button', title: 'Stop after the current batch; games fetched so far are kept' },
        on: { click: (e: Event) => { e.stopPropagation(); _accountSyncAbort?.abort(); } },
      }, 'Cancel') : null,
      h('button.openings__preload-sync-btn', {
        attrs: { type: 'button', disabled: _accountSyncRunningId !== null },
        on: { click: (e: Event) => { e.stopPropagation(); void startAccountSync(account, redraw); } },
      }, running ? 'Syncing…' : 'Sync'),
    ]),
    coverage ? h('div.openings__preload-sync-peek', coverage) : null,
    hasGap && !running
      ? h('div.openings__preload-sync-peek', 'Selected period is older than imported history — Sync will fetch the missing older games')
      : null,
    filterMismatch && !running
      ? h('div.openings__preload-sync-peek', 'Filter changed; the next sync runs a wider safety fetch and dedupes existing games')
      : null,
    peekText ? h('div.openings__preload-sync-peek', { class: { 'has-new': hasNew } }, peekText) : null,
    error ? h('div.openings__preload-sync-error', error)
      : message ? h('div.openings__preload-sync-msg', message) : null,
  ]);
}

function renderPreLoadFilterPanel(onBuild: () => void | Promise<void>, redraw: () => void, account?: ChessAccount): VNode {
  // Pre-load keeps color implicit; Build starts from the target's saved side or White.
  const speeds = speedFilter();
  const toggleSpeed = (value: string): void => {
    let next: Set<string>;
    if (speeds.size === 0) next = new Set([value]);
    else if (speeds.has(value)) {
      next = speeds.size === 1 ? new Set() : new Set([...speeds].filter(s => s !== value));
    } else {
      next = new Set(speeds);
      next.add(value);
      if (SPEED_OPTIONS.every(s => next.has(s.value))) next = new Set();
    }
    presetSpeedFilter(next);
    redraw();
  };

  const range = sessionDateRange();
  const periodBtn = (value: string | null, label: string): VNode =>
    h('button.openings__preload-period', {
      class: { active: range === value },
      attrs: { type: 'button' },
      on: { click: (e: Event) => { e.stopPropagation(); presetSessionDateRange(value); redraw(); } },
    }, label);

  return h('div.openings__preload-panel', {
    on: { click: (e: Event) => e.stopPropagation() },
  }, [
    h('div.openings__preload-section', [
      h('div.openings__preload-label', 'Time control'),
      h('div.openings__preload-row', SPEED_OPTIONS.map(({ value, label, icon }) =>
        h('button.openings__preload-speed', {
          class: { active: speeds.size === 0 || speeds.has(value) },
          attrs: { type: 'button', 'data-icon': icon },
          on: { click: (e: Event) => { e.stopPropagation(); toggleSpeed(value); } },
        }, label),
      )),
    ]),
    h('div.openings__preload-section', [
      h('div.openings__preload-label', 'Period'),
      h('div.openings__preload-row', [
        periodBtn(null, 'All time'),
        ...SESSION_DATE_RANGE_OPTIONS.map(o => periodBtn(o.value, o.label)),
        periodBtn('custom', 'Custom'),
      ]),
      // Custom from/to date inputs — visible only when 'custom' period is selected.
      range === 'custom' ? h('div.openings__preload-custom-range', [
        h('span.openings__preload-custom-label', 'From'),
        h('input.openings__preload-date-input', {
          attrs: { type: 'date' },
          props: { value: sessionCustomFrom() },
          on: { change: (e: Event) => { presetSessionCustomFrom((e.target as HTMLInputElement).value); redraw(); } },
        }),
        h('span.openings__preload-custom-label', 'To'),
        h('input.openings__preload-date-input', {
          attrs: { type: 'date' },
          props: { value: sessionCustomTo() },
          on: { change: (e: Event) => { presetSessionCustomTo((e.target as HTMLInputElement).value); redraw(); } },
        }),
      ]) : null,
    ]),
    account ? renderPreLoadSyncArea(account, redraw) : null,
    h('button.openings__preload-build', {
      attrs: { type: 'button' },
      on: { click: (e: Event) => { e.stopPropagation(); void onBuild(); } },
    }, 'Build tree'),
  ]);
}






function accountCategoryLabel(category: AccountCategory): string {
  if (category === 'mine') return 'Mine';
  if (category === 'opponent') return 'Opponent';
  if (category === 'study') return 'Study';
  const raw = String(category);
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'Mine';
}


function accountProfileUrl(account: ChessAccount): string {
  return account.platform === 'chesscom'
    ? `https://www.chess.com/member/${encodeURIComponent(account.username)}`
    : `https://lichess.org/@/${encodeURIComponent(account.username)}`;
}


function renderAccountSpeedColumn(
  speed: typeof PRIMARY_CARD_SPEEDS[number],
  stat: AccountSpeedStat | undefined,
  lifetimeBest: number | undefined,
): VNode {
  const opt = SPEED_OPTIONS.find(o => o.value === speed);
  return h('div.openings__card-speed-col', [
    h('div.openings__card-speed-hdr', [
      opt ? h('span.openings__card-speed-icon', { attrs: { 'data-icon': opt.icon } }) : null,
      h('span.openings__card-speed-name', opt?.label ?? speed),
    ]),
    stat?.current !== undefined
      ? h('div.openings__card-stat', [h('span', 'Now'), h('span', `${stat.current}`)]) : null,
    stat?.peak !== undefined
      ? h('div.openings__card-stat', [h('span', 'Peak'), h('span', `${stat.peak}`)]) : null,


    lifetimeBest !== undefined
      ? h('div.openings__card-stat.muted', [h('span', 'Life'), h('span', `${lifetimeBest}`)]) : null,
    h('div.openings__card-stat.muted', [h('span', 'Games'), h('span', `${stat?.games ?? 0}`)]),
    stat ? renderSparkline(stat.series) : null,
  ]);
}






function renderAccountStatsBody(account: ChessAccount, redraw: () => void): VNode {
  ensureAccountCardStats(account, redraw);
  if (_accountCardStatsError.has(account.id)) {
    return h('p.openings__account-stats-msg.error', 'Stats unavailable right now.');
  }
  const stats = _accountCardStats.get(account.id);
  if (!stats) {
    return h('div.openings__card-speeds.openings__account-stats-skeleton', {
      attrs: { style: `grid-template-columns:repeat(${PRIMARY_CARD_SPEEDS.length},minmax(0,1fr))` },
    }, PRIMARY_CARD_SPEEDS.map(() => h('div.openings__card-speed-col.openings__account-stats-skeleton-col')));
  }


  const displayedSpeeds = PRIMARY_CARD_SPEEDS.filter(speed => (stats.bySpeed.get(speed)?.games ?? 0) > 0);
  if (displayedSpeeds.length === 0) {
    return h('p.openings__account-stats-msg', 'No games imported yet.');
  }
  return h('div.openings__card-speeds', {
    attrs: { style: `grid-template-columns:repeat(${displayedSpeeds.length},minmax(0,1fr))` },
  }, displayedSpeeds.map(speed =>
    renderAccountSpeedColumn(speed, stats.bySpeed.get(speed), account.lifetimeBest?.[speed])));
}


function accountTotalGamesCached(account: ChessAccount): number | undefined {
  const stats = _accountCardStats.get(account.id);
  if (!stats) return undefined;
  return [...stats.bySpeed.values()].reduce((sum, sp) => sum + sp.games, 0);
}


async function setAccountSection(account: ChessAccount, section: AccountSection, redraw: () => void): Promise<void> {
  if (accountSection(account) === section) return;
  await updateAccount(account.id, { section });
  await refreshRegistryAccounts(redraw);
}


async function setAccountCategory(account: ChessAccount, category: AccountCategory, redraw: () => void): Promise<void> {
  if (account.category === category) return;
  await updateAccount(account.id, { category });
  await refreshRegistryAccounts(redraw);
}


function sortedSectionAccounts(accounts: readonly ChessAccount[], section: AccountSection): ChessAccount[] {
  return accounts
    .filter(a => accountSection(a) === section)
    .sort((a, b) => (a.order ?? a.addedAt) - (b.order ?? b.addedAt) || a.displayName.localeCompare(b.displayName));
}







function computeInsertOrder(siblings: readonly ChessAccount[], index: number): number {
  const before = siblings[index - 1];
  const after = siblings[index];
  const beforeOrder = before ? (before.order ?? before.addedAt) : undefined;
  const afterOrder = after ? (after.order ?? after.addedAt) : undefined;
  if (beforeOrder !== undefined && afterOrder !== undefined) return (beforeOrder + afterOrder) / 2;
  if (beforeOrder !== undefined) return beforeOrder + 1;
  if (afterOrder !== undefined) return afterOrder - 1;
  return Date.now();
}









async function handleAccountDrop(
  targetSection: AccountSection,
  anchorId: string | null,
  before: boolean,
  redraw: () => void,
): Promise<void> {
  const draggedId = _draggingAccountId;
  _draggingAccountId = null;
  _dragOverTarget = null;
  if (!draggedId) { redraw(); return; }
  const dragged = registryAccounts().find(a => a.id === draggedId);
  if (!dragged) { redraw(); return; }
  const siblings = sortedSectionAccounts(registryAccounts(), targetSection).filter(a => a.id !== draggedId);
  let index = siblings.length;
  if (anchorId) {
    const anchorIndex = siblings.findIndex(a => a.id === anchorId);
    if (anchorIndex !== -1) index = before ? anchorIndex : anchorIndex + 1;
  }
  const order = computeInsertOrder(siblings, index);
  const sectionChanged = accountSection(dragged) !== targetSection;
  if (!sectionChanged && order === (dragged.order ?? dragged.addedAt)) { redraw(); return; }
  await updateAccount(draggedId, sectionChanged ? { section: targetSection, order } : { order });
  await refreshRegistryAccounts(redraw);
}


async function addAccountTag(account: ChessAccount, raw: string, redraw: () => void): Promise<void> {
  const tag = raw.trim().toLowerCase();
  if (!tag) return;
  const existing = account.tags ?? [];
  if (existing.includes(tag)) return;
  await updateAccount(account.id, { tags: [...existing, tag] });
  await refreshRegistryAccounts(redraw);
}


async function removeAccountTag(account: ChessAccount, tag: string, redraw: () => void): Promise<void> {
  const existing = account.tags ?? [];
  if (!existing.includes(tag)) return;
  await updateAccount(account.id, { tags: existing.filter(t => t !== tag) });
  await refreshRegistryAccounts(redraw);
}








async function deleteAccountFromLibrary(account: ChessAccount, redraw: () => void): Promise<void> {
  if (_accountActionRunningId !== null) return;
  const totalGames = accountTotalGamesCached(account);
  const gamesPhrase = totalGames !== undefined
    ? `${totalGames} imported game${totalGames === 1 ? '' : 's'}`
    : 'all of its imported games';
  const confirmed = confirm(
    `Delete "${account.displayName}" from the library?\n\n`
    + `This permanently removes the account record and ${gamesPhrase} for this account, `
    + `including any analysis, review data, and generated puzzles tied to those games. `
    + `Other accounts are left untouched. This cannot be undone.`,
  );
  if (!confirmed) return;
  _accountActionRunningId = account.id;
  _accountActionError = null;
  redraw();
  try {
    const result = await deleteImportedAccountAndGames(account.id);
    if (!result.success) {
      _accountActionError = result.message;
      return;
    }
    _expandedMenuKey = null;
    await refreshRegistryAccounts(redraw);
  } catch (err) {
    _accountActionError = err instanceof Error ? err.message : 'Delete failed.';
  } finally {
    _accountActionRunningId = null;
    redraw();
  }
}


function renderAccountTagChips(account: ChessAccount): VNode | null {
  const tags = account.tags ?? [];
  if (tags.length === 0) return null;
  return h('div.openings__account-tags', tags.map(tag => h('span.study-tag', { key: tag }, tag)));
}






function renderAccountEditMenu(account: ChessAccount, redraw: () => void): VNode {
  const currentSection = accountSection(account);
  const tags = account.tags ?? [];
  const isEditingTag = _editingAccountTagId === account.id;
  const busy = _accountActionRunningId === account.id;

  const sectionBtn = (value: AccountSection, label: string): VNode => h('button.openings__account-menu-section-btn', {
    class: { active: currentSection === value },
    attrs: { type: 'button', disabled: busy, title: `Move to ${label}`, 'aria-label': `Move ${account.displayName} to ${label}` },
    on: { click: (e: Event) => { e.stopPropagation(); void setAccountSection(account, value, redraw); } },
  }, label);

  const categoryBtn = (value: AccountCategory, label: string): VNode => h('button.openings__account-menu-section-btn', {
    class: { active: account.category === value },
    attrs: { type: 'button', disabled: busy, title: `Set category to ${label}`, 'aria-label': `Set ${account.displayName} category to ${label}` },
    on: { click: (e: Event) => { e.stopPropagation(); void setAccountCategory(account, value, redraw); } },
  }, label);

  return h('div.openings__account-menu', {
    on: { click: (e: Event) => e.stopPropagation() },
  }, [
    h('div.openings__account-menu-row', [
      h('div.openings__account-menu-label', 'Category'),
      h('div.openings__account-menu-section-row', [
        categoryBtn('mine', 'Mine'),
        categoryBtn('study', 'Study'),
        categoryBtn('opponent', 'Opponent'),
      ]),
    ]),
    h('div.openings__account-menu-row', [
      h('div.openings__account-menu-label', 'Move to section'),
      h('div.openings__account-menu-section-row', [
        sectionBtn('research', 'Research'),
        sectionBtn('study', 'Study'),
        sectionBtn('archive', 'Archive'),
      ]),
    ]),
    h('div.openings__account-menu-row', [
      h('div.openings__account-menu-label', 'Tags'),
      h('div.openings__account-menu-tags', [
        ...tags.map(tag => h('span.study-tag', { key: tag }, [
          tag,
          h('button.study-tag__remove', {
            attrs: { type: 'button', title: `Remove tag "${tag}"`, 'aria-label': `Remove tag "${tag}"` },
            on: { click: (e: Event) => { e.stopPropagation(); void removeAccountTag(account, tag, redraw); } },
          }, '×'),
        ])),
        isEditingTag
          ? h('input.study-tag__input', {
              attrs: { placeholder: 'Add tag…' },
              props: { value: _editingAccountTagValue },
              hook: { insert: (vnode) => (vnode.elm as HTMLInputElement).focus() },
              on: {
                click: (e: Event) => e.stopPropagation(),
                input: (e: Event) => { _editingAccountTagValue = (e.target as HTMLInputElement).value; },
                blur: () => {
                  const raw = _editingAccountTagValue;
                  _editingAccountTagId = null;
                  _editingAccountTagValue = '';
                  if (raw.trim()) void addAccountTag(account, raw, redraw);
                  else redraw();
                },
                keydown: (e: KeyboardEvent) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') { _editingAccountTagId = null; _editingAccountTagValue = ''; redraw(); }
                },
              },
            })
          : h('button.study-tag__add', {
              attrs: { type: 'button', title: 'Add tag', 'aria-label': `Add a tag to ${account.displayName}` },
              on: { click: (e: Event) => {
                e.stopPropagation();
                _editingAccountTagId = account.id;
                _editingAccountTagValue = '';
                redraw();
              } },
            }, '+'),
      ]),
    ]),
    h('div.openings__account-menu-row', [
      h('div.openings__account-menu-label', 'Prepped lines'),
      // Reserved placeholder — no behavior yet; future prepped-line indicator slot.
      h('span.openings__account-menu-placeholder', { attrs: { title: 'Prepped-line indicators are coming soon' } }, 'Coming soon'),
    ]),
    h('div.openings__account-menu-divider'),
    _accountActionError ? h('p.openings__account-menu-error', _accountActionError) : null,
    h('button.openings__account-menu-delete', {
      attrs: {
        type: 'button',
        disabled: busy,
        title: `Delete ${account.displayName} from the library`,
        'aria-label': `Delete ${account.displayName} from the library`,
      },
      on: { click: (e: Event) => { e.stopPropagation(); void deleteAccountFromLibrary(account, redraw); } },
    }, busy ? 'Deleting…' : 'Delete from library'),
  ]);
}










function renderAccountCard(
  account: ChessAccount,
  redraw: () => void,
  section: AccountSection,
  reorderMode: boolean,
): VNode {
  const key = `account:${account.id}`;
  const expanded = _expandedCardKey === key;
  const menuOpen = _expandedMenuKey === account.id;
  const dragOver = reorderMode && _dragOverTarget?.section === section && _dragOverTarget.anchorId === account.id
    ? (_dragOverTarget.before ? 'top' : 'bottom')
    : null;
  return h('div.openings__collection-row', {
    key,
    class: {
      'openings__collection-row--dragging': reorderMode && _draggingAccountId === account.id,
      'openings__collection-row--drag-over-top': dragOver === 'top',
      'openings__collection-row--drag-over-bottom': dragOver === 'bottom',
    },
    attrs: reorderMode ? { draggable: 'true' } : {},
    on: reorderMode ? {
      dragstart: (e: DragEvent) => {
        e.stopPropagation();
        _draggingAccountId = account.id;
        e.dataTransfer?.setData('text/plain', account.id);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      },
      dragend: () => { _draggingAccountId = null; _dragOverTarget = null; redraw(); },
      dragover: (e: DragEvent) => {
        if (!_draggingAccountId || _draggingAccountId === account.id) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const before = (e.clientY - rect.top) < rect.height / 2;
        if (_dragOverTarget?.section !== section || _dragOverTarget.anchorId !== account.id || _dragOverTarget.before !== before) {
          _dragOverTarget = { section, anchorId: account.id, before };
          redraw();
        }
      },
      drop: (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const before = _dragOverTarget?.anchorId === account.id ? _dragOverTarget.before : true;
        void handleAccountDrop(section, account.id, before, redraw);
      },
    } : {
      click: () => { _expandedCardKey = expanded ? null : key; _expandedMenuKey = null; redraw(); },
    },
  }, [
    h('div.openings__card-top', [
      h('span.openings__collection-name', account.displayName),
      h('div.openings__account-actions', [
        h('span.openings__account-badge', {
          attrs: { title: 'Account category' },
        }, accountCategoryLabel(account.category)),
        h('button.openings__account-gear-btn', {
          class: { active: menuOpen },
          attrs: {
            type: 'button',
            title: `Edit account: ${account.displayName}`,
            'aria-label': `Edit account: ${account.displayName}`,
            'aria-expanded': String(menuOpen),
          },
          on: { click: (e: Event) => {
            e.stopPropagation();
            _accountActionError = null;
            if (menuOpen) {
              _expandedMenuKey = null;
            } else {
              _expandedMenuKey = account.id;
              _expandedCardKey = null;
            }
            redraw();
          } },
        }, '✎'),
        h('button.openings__account-open-btn', {
          class: { active: expanded },
          attrs: {
            type: 'button',
            title: `Open filters for ${account.displayName}`,
            'aria-label': `Open filters for ${account.displayName}`,
          },
          on: { click: (event: Event) => {
            event.stopPropagation();
            _expandedCardKey = expanded ? null : key;
            _expandedMenuKey = null;
            redraw();
          }},
        }, '+'),
      ]),
    ]),
    menuOpen ? renderAccountEditMenu(account, redraw) : null,
    h('div.openings__account-platform-row', [
      h('a.openings__account-platform-link', {
        attrs: {
          href: accountProfileUrl(account),
          target: '_blank',
          rel: 'noopener noreferrer',
          title: `Open ${account.displayName} on ${platformLabel(account.platform)}`,
        },
        on: { click: (e: Event) => e.stopPropagation() },
      }, `${platformLabel(account.platform)} ↗`),
    ]),
    renderAccountTagChips(account),
    h('div.openings__account-divider'),
    renderAccountStatsBody(account, redraw),
    expanded
      ? renderPreLoadFilterPanel(async () => {
          _expandedCardKey = null;
          const pending = _accountSyncPromise.get(account.id);
          if (pending) { try { await pending; } catch { /* sync failure must not block build */ } }
          // BUG-2026-07-10-007 slice 2: loadGamesByAccountFromIdb now REJECTS on a storage failure
          // (no longer masks it as an empty account). Surface it through the existing per-account
          // error affordance (renderPreLoadSyncArea reads _accountSyncErrors) instead of leaving the
          // Build silently dead with an unhandled rejection. That affordance only renders while the
          // card is expanded, and this Build handler just collapsed it (_expandedCardKey = null), so
          // re-expand this card on failure to make the error visible rather than set-but-hidden.
          void openAccountResearch(account, redraw).catch(err => {
            _accountSyncErrors.set(account.id, err instanceof Error ? err.message : 'Couldn’t load games.');
            _expandedCardKey = key;
            redraw();
          });
        }, redraw, account)
      : null,
  ]);
}

const ACCOUNT_SECTION_DEFS: ReadonlyArray<{ section: AccountSection; title: string; emptyText: string; collapsible: boolean }> = [
  { section: 'research', title: 'Research', emptyText: 'No research targets yet.', collapsible: false },
  { section: 'study', title: 'Study', emptyText: 'No study targets yet.', collapsible: false },
  { section: 'archive', title: 'Archive', emptyText: 'Archive is empty.', collapsible: true },
];







function renderAccountSectionBlock(
  def: typeof ACCOUNT_SECTION_DEFS[number],
  accounts: ChessAccount[],
  reorderMode: boolean,
  redraw: () => void,
): VNode {
  const collapsed = def.collapsible && _archiveCollapsed;
  const dragOverEnd = reorderMode && _dragOverTarget?.section === def.section && _dragOverTarget.anchorId === null;


  const header: (VNode | null)[] = [
    def.collapsible
      ? h('span.openings__section-chevron', { attrs: { 'aria-hidden': 'true' } }, collapsed ? '▸' : '▾')
      : null,
    h('span.openings__section-title', def.title),
    h('span.openings__section-count', `${accounts.length}`),
  ];
  const toggleCollapse = () => { _archiveCollapsed = !_archiveCollapsed; redraw(); };
  const body = collapsed ? null : h('div.openings__collections', {
    class: { 'openings__collections--drag-over-end': dragOverEnd },
    on: reorderMode ? {
      dragover: (e: DragEvent) => {
        if (!_draggingAccountId) return;
        e.preventDefault();
        if (_dragOverTarget?.section !== def.section || _dragOverTarget.anchorId !== null) {
          _dragOverTarget = { section: def.section, anchorId: null, before: true };
          redraw();
        }
      },
      drop: (e: DragEvent) => { e.preventDefault(); void handleAccountDrop(def.section, null, true, redraw); },
    } : {},
  }, accounts.length > 0
      ? accounts.map(account => renderAccountCard(account, redraw, def.section, reorderMode))
      : [h('p.openings__account-section-empty', def.emptyText)]);
  return h('div.openings__account-section', {
    key: `account-section:${def.section}`,
    class: { 'openings__account-section--collapsible': def.collapsible },
  }, [
    h('div.openings__account-section-header', def.collapsible ? {
      class: { 'openings__account-section-header--toggle': true },
      attrs: {
        role: 'button',
        tabindex: '0',
        title: collapsed ? 'Expand Archive' : 'Collapse Archive',
        'aria-expanded': String(!collapsed),
        'aria-label': collapsed ? 'Expand Archive section' : 'Collapse Archive section',
      },
      on: {
        click: toggleCollapse,
        keydown: (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCollapse(); }
        },
      },
    } : {}, header),
    body,
  ]);
}







function renderAccountsSection(accounts: readonly ChessAccount[], redraw: () => void): VNode {
  const reorderMode = _accountReorderMode;
  return h('div.openings__accounts', [
    h('div.openings__accounts-toolbar', [
      h('p.openings__hint', reorderMode
        ? 'Drag cards to reorder within a section, or across sections to move them.'
        : 'Imported accounts — click to research from the shared game library.'),
      h('button.openings__reorder-toggle', {
        class: { active: reorderMode },
        attrs: { type: 'button', title: reorderMode ? 'Done reordering' : 'Reorder accounts', 'aria-pressed': String(reorderMode) },
        on: { click: () => {
          _accountReorderMode = !_accountReorderMode;
          _draggingAccountId = null;
          _dragOverTarget = null;
          _expandedCardKey = null;
          _expandedMenuKey = null;
          redraw();
        } },
      }, reorderMode ? 'Done' : 'Reorder'),
    ]),
    ...ACCOUNT_SECTION_DEFS.map(def =>
      renderAccountSectionBlock(def, sortedSectionAccounts(accounts, def.section), reorderMode, redraw)),
  ]);
}

function renderEmptyState(redraw: () => void): VNode {
  return h('div.openings__empty', [
    h('div.openings__empty-icon', '\u265E'),
    h('h2.openings__empty-title', 'Opening Tree'),
    h('p', 'Research your opponents\u2019 openings by importing their games.'),
    h('p.openings__hint', 'Accounts imported anywhere in Patzer Pro appear here automatically.'),
    h('button.openings__start-btn', {
      on: { click: () => { setImportStep('details'); redraw(); } },
    }, 'Start New Research'),
  ]);
}

// ---- Collection card stats ----

interface SpeedStat {
  count: number;
  peakRating?: number;
  currentRating?: number;
  avgOppRating?: number;
}

interface CardStats {
  wins: number;
  draws: number;
  losses: number;
  bySpeed: Map<string, SpeedStat>;
}

function computeCardStats(c: ResearchCollection): CardStats {
  const target = c.target?.toLowerCase() ?? '';
  const result: CardStats = { wins: 0, draws: 0, losses: 0, bySpeed: new Map() };
  const oppAccum = new Map<string, { sum: number; n: number }>();

  // Ascending date sort — last entry per speed = most recent (used for currentRating)
  const sorted = [...c.games].sort((a, b) => (a.date ?? '') < (b.date ?? '') ? -1 : 1);

  for (const g of sorted) {
    const isWhite = g.white?.toLowerCase() === target;
    const isBlack = g.black?.toLowerCase() === target;

    if (isWhite || isBlack) {
      if      (g.result === '1-0')      { isWhite ? result.wins++  : result.losses++; }
      else if (g.result === '0-1')      { isBlack ? result.wins++  : result.losses++; }
      else if (g.result === '1/2-1/2')  { result.draws++; }
    }

    const tc = g.timeClass;
    if (!tc) continue;
    if (!result.bySpeed.has(tc)) result.bySpeed.set(tc, { count: 0 });
    const sp = result.bySpeed.get(tc)!;
    sp.count++;

    if (isWhite || isBlack) {
      const myRating  = isWhite ? g.whiteRating : g.blackRating;
      const oppRating = isWhite ? g.blackRating : g.whiteRating;
      if (myRating !== undefined) {
        if (sp.peakRating === undefined || myRating > sp.peakRating) sp.peakRating = myRating;
        sp.currentRating = myRating;
      }
      if (oppRating !== undefined) {
        const acc = oppAccum.get(tc) ?? { sum: 0, n: 0 };
        acc.sum += oppRating; acc.n++;
        oppAccum.set(tc, acc);
      }
    }
  }

  for (const [tc, sp] of result.bySpeed) {
    const acc = oppAccum.get(tc);
    if (acc && acc.n > 0) sp.avgOppRating = Math.round(acc.sum / acc.n);
  }

  return result;
}

// --- Rating sparkline ---

interface RatingPoint { date: string; rating: number; }

function extractRatingSeries(c: ResearchCollection): RatingPoint[] {
  const target = c.target?.toLowerCase() ?? '';
  const points: RatingPoint[] = [];
  for (const g of c.games) {
    if (!g.date) continue;
    const isWhite = g.white?.toLowerCase() === target;
    const isBlack = g.black?.toLowerCase() === target;
    const rating = isWhite ? g.whiteRating : isBlack ? g.blackRating : undefined;
    if (rating !== undefined) points.push({ date: g.date, rating });
  }
  points.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  return points;
}

function renderSparkline(points: RatingPoint[]): VNode | null {
  if (points.length < 5) return null;

  const W = 120, H = 28, PAD_X = 2, PAD_Y = 4;
  const ratings = points.map(p => p.rating);
  const minR = Math.min(...ratings);
  const maxR = Math.max(...ratings);
  const range = maxR - minR || 1;

  const xScale = (W - 2 * PAD_X) / (points.length - 1);
  const yScale = (H - 2 * PAD_Y) / range;
  const px = (i: number) => (PAD_X + i * xScale).toFixed(1);
  const py = (r: number) => (H - PAD_Y - (r - minR) * yScale).toFixed(1);

  const polyPoints = points.map((p, i) => `${px(i)},${py(p.rating)}`).join(' ');

  // Peak index
  let peakIdx = 0;
  for (let i = 1; i < ratings.length; i++) {
    if (ratings[i]! > ratings[peakIdx]!) peakIdx = i;
  }

  // Trend: compare first 20% avg vs last 20% avg
  const chunk = Math.max(1, Math.floor(points.length * 0.2));
  const firstAvg = ratings.slice(0, chunk).reduce((s, v) => s + v, 0) / chunk;
  const lastAvg = ratings.slice(-chunk).reduce((s, v) => s + v, 0) / chunk;
  const delta = lastAvg - firstAvg;
  const trend = delta > 15 ? '\u2191' : delta < -15 ? '\u2193' : '\u2192'; // ↑ ↓ →
  const trendClass = delta > 15 ? 'trend-up' : delta < -15 ? 'trend-down' : 'trend-flat';

  const current = ratings[ratings.length - 1];

  return h('div.openings__sparkline-row', [
    h('svg', {
      attrs: { viewBox: `0 0 ${W} ${H}`, width: W, height: H },
      class: { 'openings__sparkline-svg': true },
    }, [
      h('polyline', {
        attrs: {
          points: polyPoints,
          fill: 'none',
          stroke: 'var(--cg-accent, #629924)',
          'stroke-width': '1.5',
          'stroke-linejoin': 'round',
          'stroke-linecap': 'round',
        },
      }),
      // Peak marker
      h('circle', {
        attrs: {
          cx: px(peakIdx),
          cy: py(ratings[peakIdx]!),
          r: '2',
          fill: 'var(--cg-accent, #629924)',
        },
      }),
    ]),
    h('span.openings__sparkline-current', [
      `${current}`,
      h('span', { class: { [trendClass]: true, 'openings__sparkline-trend': true } }, ` ${trend}`),
    ]),
  ]);
}

function renderCollectionCard(c: ResearchCollection, redraw: () => void): VNode {
  const stats       = computeCardStats(c);
  const total       = stats.wins + stats.draws + stats.losses;
  const wPct        = total > 0 ? (stats.wins   / total) * 100 : 0;
  const dPct        = total > 0 ? (stats.draws  / total) * 100 : 0;
  const lPct        = total > 0 ? (stats.losses / total) * 100 : 0;
  const periodLabel = dateRangeDescription(c.settings).replace(/^ in /, '') || 'all time';
  const speedOrder  = ['bullet', 'blitz', 'rapid', 'classical'];
  const activeSpeeds = speedOrder.filter(s => stats.bySpeed.has(s));

  return h('div.openings__collection-row', {
    key: c.id,
    on: { click: () => {
      _expandedCardKey = _expandedCardKey === c.id ? null : c.id;
      redraw();
    } },
  }, [
    h('div.openings__card-top', [
      h('span.openings__collection-name', c.name),
      h('div.openings__collection-actions', [
        h('button.openings__col-rename', {
          attrs: { title: 'Rename collection', 'aria-label': 'Rename collection' },
          on: { click: (e: Event) => {
            e.stopPropagation();
            const name = prompt('Rename collection:', c.name);
            if (name && name.trim()) void renameCollection(c.id, name.trim(), redraw);
          } },
        }, '\u270E'),
        h('button.openings__col-delete', {
          attrs: { title: 'Delete collection', 'aria-label': 'Delete collection' },
          on: { click: (e: Event) => {
            e.stopPropagation();
            if (confirm(`Delete "${c.name}"? This cannot be undone.`)) {
              void removeCollection(c.id, redraw);
            }
          } },
        }, '\u2715'),
      ]),
    ]),
    h('div.openings__collection-meta', [
      h('span', [c.source, `${c.games.length} game${c.games.length !== 1 ? 's' : ''}`, periodLabel].join(' \u00B7 ')),
      c.games.length < 20 ? h('span.openings__small-sample-badge', { attrs: { title: 'Small sample — statistics may not be reliable' } }, '\u26A0 small sample') : null,
    ]),

    // W / D / L bar
    total > 0 ? h('div.openings__card-wdl', [
      h('div.openings__card-wdl-bar', [
        h('span.wdl-w', { attrs: { style: `width:${wPct.toFixed(1)}%` } },
          wPct > 14 ? `${Math.round(wPct)}%` : ''),
        h('span.wdl-d', { attrs: { style: `width:${dPct.toFixed(1)}%` } },
          dPct > 14 ? `${Math.round(dPct)}%` : ''),
        h('span.wdl-l', { attrs: { style: `width:${lPct.toFixed(1)}%` } },
          lPct > 14 ? `${Math.round(lPct)}%` : ''),
      ]),
      h('div.openings__card-wdl-labels', [
        h('span.wdl-w', `${stats.wins}\u2009W`),
        h('span.wdl-d', `${stats.draws}\u2009D`),
        h('span.wdl-l', `${stats.losses}\u2009L`),
      ]),
    ]) : null,

    // Per-speed columns
    activeSpeeds.length > 0 ? h('div.openings__card-speeds', {
      attrs: { style: `grid-template-columns:repeat(${activeSpeeds.length},minmax(0,1fr))` },
    }, activeSpeeds.map(speed => {
      const sp  = stats.bySpeed.get(speed)!;
      const opt = SPEED_OPTIONS.find(o => o.value === speed);
      return h('div.openings__card-speed-col', [
        h('div.openings__card-speed-hdr', [
          opt ? h('span.openings__card-speed-icon', { attrs: { 'data-icon': opt.icon } }) : null,
          h('span.openings__card-speed-name', opt?.label ?? speed),
          h('span.openings__card-speed-count', `${sp.count}`),
        ]),
        sp.peakRating    !== undefined
          ? h('div.openings__card-stat', [h('span', 'Peak'),    h('span', `${sp.peakRating}`)]) : null,
        sp.currentRating !== undefined
          ? h('div.openings__card-stat', [h('span', 'Now'),     h('span', `${sp.currentRating}`)]) : null,
        sp.avgOppRating  !== undefined
          ? h('div.openings__card-stat.muted', [h('span', 'Avg opp'), h('span', `${sp.avgOppRating}`)]) : null,
      ]);
    })) : null,

    // Rating sparkline
    renderSparkline(extractRatingSeries(c)),

    _expandedCardKey === c.id
      ? renderPreLoadFilterPanel(() => { _expandedCardKey = null; openCollection(c, redraw); }, redraw)
      : null,
  ]);
}

function renderCollectionList(items: readonly ResearchCollection[], redraw: () => void): VNode {
  return h('div.openings__collections', items.map(c => renderCollectionCard(c, redraw)));
}

// ========== Import workflow ==========

function renderImportWorkflow(redraw: () => void): VNode {
  const step = importStep();
  return h('div.openings__import', [
    h('div.openings__import-header', [
      h('span', 'New Opening Tree'),
      h('button.header__panel-btn.--ghost', {
        on: { click: () => { resetImport(); redraw(); } },
      }, 'Cancel'),
    ]),
    step === 'details' ? renderDetailsStep(redraw) : null,
  ]);
}



let _importRedrawTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleImportRedraw(redraw: () => void): void {
  if (_importRedrawTimer !== null) clearTimeout(_importRedrawTimer);
  _importRedrawTimer = setTimeout(() => {
    _importRedrawTimer = null;
    redraw();
  }, 250);
}

function renderDetailsStep(redraw: () => void): VNode {
  const src = importSource();
  const color = importColor();
  const err = importError();
  const speeds = importSpeeds();
  const dateRange = importDateRange();

  const sections: (VNode | null)[] = [];
  const focusUsernameInput = (elm: Element | undefined): void => {
    const input = elm as HTMLInputElement | undefined;
    if (!input) return;
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  };

  // --- Source ---
  const sources: { value: ResearchSource; label: string }[] = [
    { value: 'lichess', label: 'Lichess' },
    { value: 'chesscom', label: 'Chess.com' },
    { value: 'pgn', label: 'PGN Upload' },
  ];
  sections.push(h('div.header__panel-section', [
    h('div.header__panel-label', 'Source'),
    h('div.header__panel-row', sources.map(s =>
      h('button.header__pill', {
        class: { active: src === s.value },
        on: { click: () => { setImportSource(s.value); redraw(); } },
      }, s.label),
    )),
  ]));
  sections.push(h('div.header__panel-divider'));

  // --- Username / PGN input ---
  sections.push(
    src !== 'pgn' ? h('div.header__panel-section', [
      h('div.header__panel-label', 'Username'),
      h('input.header__text-input', {
        attrs: {
          type: 'text',
          placeholder: `${src === 'lichess' ? 'Lichess' : 'Chess.com'} username`,
          autocomplete: 'off',
          'data-lpignore': 'true',
          'data-1p-ignore': 'true',
          'data-bwignore': 'true',
          'data-form-type': 'other',
        },
        props: { value: importUsername() },
        on: { input: (e: Event) => { setImportUsername((e.target as HTMLInputElement).value); scheduleImportRedraw(redraw); } },
        hook: { insert: vnode => focusUsernameInput(vnode.elm as Element | undefined) },
      }),
    ]) : h('div.header__panel-section', [
      h('div.header__panel-label', 'Paste PGN or upload file'),
      h('textarea.header__pgn-input', {
        attrs: { placeholder: 'Paste PGN text here\u2026', rows: '6' },
        on: { input: (e: Event) => { setImportUsername((e.target as HTMLTextAreaElement).value); scheduleImportRedraw(redraw); } },
      }),
      h('div.header__pgn-file-upload', {
        on: {
          dragover: (e: DragEvent) => { e.preventDefault(); (e.currentTarget as HTMLElement).classList.add('dragover'); },
          dragleave: (e: DragEvent) => { (e.currentTarget as HTMLElement).classList.remove('dragover'); },
          drop: (e: DragEvent) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).classList.remove('dragover');
            const file = e.dataTransfer?.files[0];
            if (file && file.name.endsWith('.pgn')) {
              file.text().then(text => { setImportUsername(text); redraw(); });
            }
          },
        },
      }, [
        h('input', {
          attrs: { type: 'file', accept: '.pgn' },
          on: {
            change: (e: Event) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (file) {
                file.text().then(text => { setImportUsername(text); redraw(); });
              }
            },
          },
        }),
        h('span', 'or drag & drop a .pgn file'),
      ]),
    ]),
  );

  // --- Perspective ---
  sections.push(h('div.header__panel-divider'));
  sections.push(h('div.header__panel-section', [
    h('div.header__panel-label', 'Perspective'),
    h('div.header__panel-row', (['white', 'black'] as const).map(c =>
      h('button.header__pill', {
        class: { active: color === c },
        on: { click: () => { setImportColor(c); redraw(); } },
      }, c.charAt(0).toUpperCase() + c.slice(1)),
    )),
  ]));


  if (src !== 'pgn') {
    sections.push(h('div.header__panel-divider'));
    sections.push(h('div.header__panel-section', [
      h('div.header__panel-label', 'Account category'),
      h('div.header__panel-row', ([
        { value: 'mine',     label: 'Mine'     },
        { value: 'opponent', label: 'Opponent' },
        { value: 'study',    label: 'Study'    },
      ] as const).map(({ value, label }) =>
        h('button.header__pill', {
          class: { active: importCategory() === value },
          on: { click: () => { setImportCategory(value); redraw(); } },
        }, label),
      )),
    ]));
  }

  if (src !== 'pgn') {
    // --- Time control ---
    sections.push(h('div.header__panel-divider'));
    sections.push(h('div.header__panel-section', [
      h('div.header__panel-label', 'Time control'),
      h('div.header__panel-row', [
        h('button.header__pill', {
          class: { active: speeds.size === 0 },
          on: { click: () => { setImportSpeeds(new Set()); redraw(); } },
        }, 'All'),
        ...SPEED_OPTIONS.map(({ value, label, icon }) =>
          h('button.header__pill', {
            class: { active: speeds.has(value) },
            attrs: { 'data-icon': icon },
            on: { click: () => {
              const s = new Set(speeds);
              s.has(value) ? s.delete(value) : s.add(value);
              setImportSpeeds(s);
              redraw();
            } },
          }, label),
        ),
      ]),
    ]));

    // --- Period ---
    sections.push(h('div.header__panel-divider'));
    sections.push(h('div.header__panel-section', [
      h('div.header__panel-label', 'Period'),
      h('div.header__panel-row', [
        ...DATE_RANGE_OPTIONS.map(({ value, label }) =>
          h('button.header__pill', {
            class: { active: dateRange === value },
            on: { click: () => { setImportDateRange(value as ImportDateRange); redraw(); } },
          }, label),
        ),
      ]),
      dateRange === 'custom' ? h('div.header__panel-row.--mt', [
        h('span', 'From'),
        h('input.header__date-input', {
          attrs: { type: 'date' },
          props: { value: importCustomFrom() },
          on: { change: (e: Event) => { setImportCustomFrom((e.target as HTMLInputElement).value); redraw(); } },
        }),
        h('span', 'To'),
        h('input.header__date-input', {
          attrs: { type: 'date' },
          props: { value: importCustomTo() },
          on: { change: (e: Event) => { setImportCustomTo((e.target as HTMLInputElement).value); redraw(); } },
        }),
      ]) : null,
    ]));

    // --- Rated only ---
    sections.push(h('div.header__panel-divider'));
    sections.push(h('div.header__panel-section', [
      h('label.header__panel-check', [
        h('input', {
          attrs: { type: 'checkbox' },
          props: { checked: importRated() },
          on: { change: (e: Event) => { setImportRated((e.target as HTMLInputElement).checked); redraw(); } },
        }),
        ' Rated only',
      ]),
    ]));

    // --- Max games ---
    sections.push(h('div.header__panel-divider'));
    sections.push(h('div.header__panel-section', [
      h('div.header__panel-label', 'Max games'),
      h('input.header__text-input.header__text-input--short', {
        attrs: { type: 'number', min: '1', max: '200' },
        props: { value: importMaxGames() },
        on: { change: (e: Event) => { setImportMaxGames(parseInt((e.target as HTMLInputElement).value, 10) || 50); redraw(); } },
      }),
    ]));
  }

  // --- Error + actions ---
  sections.push(h('div.header__panel-divider'));
  sections.push(h('div.header__panel-section', [
    err ? h('div.header__panel-error', err) : null,
    h('button.openings__import-btn', {
      attrs: { disabled: src !== 'pgn' && importUsername().trim() === '' },
      on: { click: () => { void executeResearchImport(redraw); } },
    }, 'Import Games'),
  ]));

  return h('div.openings__step', sections);
}

// ========== Session page (board shell) ==========

/**
 * Openings-local action menu overlay.
 * Renders inside .openings__session-panel with position: absolute; inset: 0.
 * Returns null when the menu is closed so the panel renders normally.
 * Adapted from lichess-org/lila: ui/analyse/src/view/actionMenu.ts structure
 */
function renderOpeningsActionMenu(redraw: () => void): VNode | null {
  if (!_openingsMenuOpen) return null;
  const close = () => { _openingsMenuOpen = false; redraw(); };
  const path = sessionPath();

  return h('div.action-menu', [
    h('button.action-menu__close-btn', {
      attrs: { title: 'Close menu', 'aria-label': 'Close menu' },
      on:    { click: close },
    }, '×'),

    h('h2', 'Tools'),
    h('div.action-menu__tools', [
      // Flip board — mirrors lichess-org/lila: actionMenu.ts ctrl.flip() action
      h('button', {
        attrs: { 'data-icon': ICON_FLIP, title: 'Flip board' },
        on: { click: () => {
          flipBoard();
          if (_openingsCg) _openingsCg.set({ orientation: boardOrientation() });
          close();
        } },
      }, 'Flip board'),
      path.length >= 1 ? h('button', {
        attrs: { 'data-icon': ICON_BOOK, title: 'Save this line to the Study Library' },
        on: { click: () => {
          handleSaveToLibrary(path, redraw);
          close();
        } },
      }, 'Save to Library') : null,
      h('button', {
        attrs: { title: 'Report an issue with the Opening Tree page' },
        on: { click: () => { reportOpeningsIssue(); close(); } },
      }, 'Report issue'),
    ]),

    h('h2', 'Display'),
    h('div.action-menu__display', [
      renderToggleRow('op-engine-arrows', 'Engine arrows', showEngineArrows, (v) => { setShowEngineArrows(v); syncOpeningsAutoShapes(sessionNode()); redraw(); }),
      renderToggleRow('op-engine-line-arrows', 'Engine line arrows', arrowAllLines, (v) => { setArrowAllLines(v); syncOpeningsAutoShapes(sessionNode()); redraw(); }, !showEngineArrows),
      renderToggleRow('op-arrow-labels', 'Arrow labels', showArrowLabels, (v) => { setShowArrowLabels(v); syncOpeningsAutoShapes(sessionNode()); redraw(); }),

      renderToggleRow('op-tree-arrows', 'Tree arrows', showTreeArrows(), (_v) => { toggleTreeArrows(); _lastOpeningsAutoShapesHash = null; syncOpeningsAutoShapes(sessionNode()); redraw(); }),
      renderToggleRow('op-opening-tree-sounds', 'Opening tree sounds', openingsBoardSoundEnabled(), (v) => { setOpeningsBoardSoundEnabled(v); redraw(); }),
    ]),
  ]);
}

const ICON_BOOK = '\ue03b'; // licon.Book — used by "Save to Library" and the masters-book move icon

/**
 * Opening Tree tool — renders the board column and data columns (tree stats + engine/move
 * list) that make up the Opening Tree experience. This is the only tool the openings session
 * renders (P2-TREE-2: the left tool rail and the four research tools were removed).
 *
 * Ownership boundary: board, player strips, move list, explorer, sample games, engine.
 * Session shell owns: header row, dispatching to this function.
 */
function renderOpeningTreeTool(
  collection: ResearchCollection | null,
  node: OpeningTreeNode | null,
  path: readonly string[],
  redraw: () => void,
): VNode[] {
  const fen = _offTreeFen ?? node?.fen ?? STANDARD_START_FEN;
  const treeColumn = renderOpeningTreeStatsColumn(collection, node, redraw);
  const engineColumn = renderOpeningEngineMoveColumn(node, path, redraw);
  const leftColumn = _openingTreeDesktopLayout.order === 'tree-left' ? treeColumn : engineColumn;
  const rightColumn = _openingTreeDesktopLayout.order === 'tree-left' ? engineColumn : treeColumn;

  return [
    h('div.openings__board-col', [
      renderPlayerStrip(collection, 'top'),
      h('div.openings__board-stage', [
        engineEnabled ? h('div.openings__eval-slot', [
          renderEvalBar(engineEnabled, visibleEvalForFen(fen), fen),
        ]) : null,
        h('div.openings__board-wrap', [
          renderOpeningsBoard(node, redraw),
        ]),
      ]),
      renderOffTreeIndicator(),
      renderPlayerStrip(collection, 'bottom'),
    ]),
    h('div.openings__right-workspace', {
      attrs: { style: openingTreeSlotVars() },
    }, [
      renderOpeningsActionMenu(redraw),
      // Keep the engine override in sync with the current openings position on every render.
      (() => {
        setCevalPositionOverride('openings-live', openingsPositionContext(fen));
        return null;
      })(),
      h('div.openings__right-columns', [
        leftColumn,
        renderOpeningTreeSplitHandle(redraw),
        rightColumn,
      ]),
      h('div.openings__nav-tools-row', [
        h('div.openings__nav-slot', [
          renderOpeningsMoveNavBar(node, path, redraw),
        ]),
        h('div.openings__nav-split-spacer'),
        h('div.openings__future-tools-slot', [
          renderOpeningTreeSwapButton(redraw),
        ]),
      ]),
      h('div.openings__right-underboard', [
        renderFilterBadge(redraw),
        renderOpeningTreeFilterControls(redraw),
        renderDeviationPanel(redraw),
      ]),
    ]),
    h('div.openings__underboard.openings__underboard--board', [
      renderSampleGamesPanel(redraw),
    ]),
  ];
}

function renderOpeningTreeStatsColumn(
  collection: ResearchCollection | null,
  node: OpeningTreeNode | null,
  redraw: () => void,
): VNode {
  return h('section.openings__data-column.openings__data-column--tree', { key: 'openings-tree-column' }, [
    h('div.openings__data-column-inner.openings__data-column-inner--tree', [
      h('div.openings__tree-top', [
        renderColorToggle(collection?.target ?? '', redraw),
        isFetching()
          ? renderFetchBar(redraw)
          : treeBuilding()
            ? renderTreeBuildBar(redraw)
            : renderMobileCapNotice(redraw),
      ]),
      h('div.openings__tree-scroll', [
        node ? renderPlayedLinesPanel(node, redraw) : null,
      ]),
    ]),
  ]);
}

function renderOpeningEngineMoveColumn(
  node: OpeningTreeNode | null,
  path: readonly string[],
  redraw: () => void,
): VNode {
  const tree = openingTree();
  return h('section.openings__data-column.openings__data-column--engine', { key: 'openings-engine-column' }, [
    h('div.openings__data-column-inner.openings__data-column-inner--engine', [
      h('div.openings__engine-fixed', [
        renderCeval(),
        renderEngineSettings({ showArrowSettings: true }),
        engineEnabled ? renderOpeningTreePvBox() : null,
        renderExplorerToggle(node, redraw),
      ]),
      h('div.openings__engine-played-scroll', [
        tree ? renderOpeningsMoveList(tree, path, node, redraw) : null,
      ]),
    ]),
  ]);
}

function renderOpeningTreeSplitHandle(redraw: () => void): VNode {
  return h('div.openings__split-handle', {
    attrs: {
      role:              'separator',
      tabindex:          '0',
      'aria-orientation': 'vertical',
      'aria-label':       'Resize data columns',
      title:              'Resize data columns',
    },
    on: {
      pointerdown: (event: PointerEvent) => beginOpeningTreeColumnResize(event, redraw),
      keydown:     (event: KeyboardEvent) => handleOpeningTreeSplitKeydown(event, redraw),
    },
  }, [
    h('span.openings__split-handle-grip', { attrs: { 'aria-hidden': 'true' } }),
  ]);
}

function renderOpeningTreeSwapButton(redraw: () => void): VNode {
  return h('button.openings__swap-columns-btn', {
    attrs: {
      type:         'button',
      title:        'Swap data columns',
      'aria-label': 'Swap data columns',
    },
    on: { click: () => toggleOpeningTreeColumnOrder(redraw) },
  }, [
    h('span.openings__swap-columns-icon', { attrs: { 'aria-hidden': 'true' } }, 'Swap'),
  ]);
}

function renderOffTreeIndicator(): VNode | null {
  if (!_offTreeFen) return null;
  return h('div.openings__off-tree-indicator', {
    attrs: {
      role: 'status',
      title: 'The board is showing a legal analysis move outside the imported opening tree.',
    },
  }, 'Analysis (off book)');
}

function hasVisibleOpeningEngineLines(): boolean {
  const fen = currentOpeningsBoardFen() ?? sessionNode()?.fen ?? '';
  const visibleEval = fen ? visibleEvalForFen(fen) : {};
  if (visibleEval.cp !== undefined || visibleEval.mate !== undefined || visibleEval.moves?.length) {
    return true;
  }
  return visibleEval.lines?.some(line =>
    line.cp !== undefined || line.mate !== undefined || line.moves?.length,
  ) === true;
}

function renderOpeningTreePvBox(): VNode | null {
  const pvBox = renderPvBox();
  if (!pvBox) return null;
  const stale = isRapid() && hasVisibleOpeningEngineLines();

  return h('div.openings__engine-lines', {
    class: { 'openings__engine-lines--stale': stale },
    attrs: {
      'data-stale': stale ? 'true' : 'false',
      'aria-live': 'polite',
    },
  }, [
    stale
      ? h('div.openings__engine-lines-stale', { attrs: { role: 'status' } }, 'Updating position')
      : null,
    pvBox,
  ]);
}

let _keyHandler: ((e: KeyboardEvent) => void) | null = null;

function renderSessionPage(redraw: () => void): VNode {
  const collection = activeCollection();
  const node = sessionNode();
  const path = sessionPath();

  return h('div.openings.openings--session', {
    hook: {
      insert: () => {
        _keyHandler = (e: KeyboardEvent) => {
          const tag = (e.target as HTMLElement)?.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA') return;
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            navigateBack();
            syncOpeningsBoard(redraw);
            redraw();
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            const cur = sessionNode();
            if (cur && cur.children.length > 0) {
              navigateToMove(cur.children[0]!.uci);
              syncOpeningsBoard(redraw);
              redraw();
            }
          } else if (e.key === 'Home') {
            e.preventDefault();
            navigateToRoot();
            syncOpeningsBoard(redraw);
            redraw();
          }
        };
        document.addEventListener('keydown', _keyHandler);
      },
      destroy: () => {
        if (_keyHandler) {
          document.removeEventListener('keydown', _keyHandler);
          _keyHandler = null;
        }
      },
    },
  }, [
    renderRouteRecoveryBanner(),
    h('div.openings__session-header', [
      h('button.openings__back-lib-btn', {
        on: { click: () => { _openingsCg = undefined; clearCevalPositionOverride('openings-live'); closeSession(); redraw(); } },
      }, '\u2190 Library'),
      h('h2.openings__session-title', collection?.name ?? 'Opening Tree'),
      h('span.openings__session-meta', node
        ? `${node.total} game${node.total !== 1 ? 's' : ''} reached this position`
        : ''),
    ]),
    h('div.openings__session-body.openings__session-body--tree', {
      class: {
        'openings__session-body--eval-on': engineEnabled,
      },
    }, [
      // Opening Tree is the only tool the session renders (P2-TREE-2: left tool rail and the
      // four research tools removed).
      ...renderOpeningTreeTool(collection, node, path, redraw),
    ]),
    renderActiveOpeningsSaveFlowModal(),
  ]);
}

/**
 * Player strip showing the target user and opponent labels around the board.
 * The target (researched player) appears on the side matching their color.
 */
function renderPlayerStrip(
  collection: ResearchCollection | null,
  position: 'top' | 'bottom',
): VNode {
  const target = collection?.target ?? 'Player';
  const orientation = boardOrientation();
  const filter = colorFilter();

  // Determine which color label goes on which side of the board
  // Bottom = the side the board is oriented toward
  // When orientation = 'white': bottom = white, top = black
  // When orientation = 'black': bottom = black, top = white
  const bottomColor: 'white' | 'black' = orientation;
  const topColor: 'white' | 'black' = orientation === 'white' ? 'black' : 'white';
  const stripColor = position === 'bottom' ? bottomColor : topColor;

  // Is the target player on this side?
  let label: string;
  label = stripColor === filter ? target : 'Imported Game Opponents';

  const animLabel = isFetching() && position === 'bottom' && _animGame ? _animGame.label : null;

  return h('div.analyse__player_strip', [
    h('div.player-strip__identity', [
      h('span.player-strip__color-icon', {
        class: {
          'player-strip__color-icon--white': stripColor === 'white',
          'player-strip__color-icon--black': stripColor === 'black',
        },
      }),
      h('span.player-strip__name', animLabel ?? label),
    ]),
  ]);
}

// Icon codepoints for first/prev/next/last navigation buttons.
// Adapted from lichess-org/lila: ui/lib/src/licon.ts
/**
 * Convert the opening session path into a minimal TreeNode chain for renderMoveList.
 * Each node gets a 2-char hex ID so paths concatenate cleanly (e.g. "000102").
 * Adapted from lichess-org/lila: ui/lib/src/tree/types.ts TreeNode shape.
 */
function buildOpeningsMoveTree(
  tree: OpeningTreeNode,
  path: readonly string[],
): { root: TreeNode; currentPath: string } {
  const root: TreeNode = {
    id: '', ply: 0, fen: tree.fen,
    children: [], glyphs: [], comments: [],
  };
  let treeNode = root;
  let openingNode: OpeningTreeNode = tree;
  for (let i = 0; i < path.length; i++) {
    const child = openingNode.children.find(c => c.uci === path[i]);
    if (!child) break;
    const id = i.toString(16).padStart(2, '0');
    const next: TreeNode = {
      id, ply: i + 1, uci: child.uci, san: child.san, fen: child.fen,
      children: [], glyphs: [], comments: [],
    };
    treeNode.children.push(next);
    treeNode = next;
    openingNode = child;
  }
  const currentPath = Array.from(
    { length: path.length },
    (_, i) => i.toString(16).padStart(2, '0'),
  ).join('');
  return { root, currentPath };
}

/**
 * White / Black perspective toggle — placed directly beneath the move list.
 * Replaces the action-menu Color section for faster, always-visible access.
 */
function renderColorToggle(playerName: string, redraw: () => void): VNode {
  const filter = colorFilter();
  return h('div.openings__color-toggle', [
    h('button', {
      class: { active: filter === 'white', 'white-btn': true },
      attrs: { title: 'Show games as White' },
      on: { click: () => {
        if (filter === 'white') return;
        _lastBoardFen = '';
        setColorFilter('white', redraw);
        syncOpeningsBoard(redraw);
        redraw();
      } },
    }, [
      h('span.openings__color-username', filter === 'white' ? playerName : 'Opponents'),
      h('span.openings__color-label', [h('span.openings__color-dot', '○'), '\u00a0White']),
    ]),
    h('button', {
      class: { active: filter === 'black', 'black-btn': true },
      attrs: { title: 'Show games as Black' },
      on: { click: () => {
        if (filter === 'black') return;
        _lastBoardFen = '';
        setColorFilter('black', redraw);
        syncOpeningsBoard(redraw);
        redraw();
      } },
    }, [
      h('span.openings__color-username', filter === 'black' ? playerName : 'Opponents'),
      h('span.openings__color-label', [h('span.openings__color-dot', '●'), '\u00a0Black']),
    ]),
    // Flip button — inline, icon-only, sized like the book button in the nav bar.
    // Adapted from lichess-org/lila: ui/analyse/src/view/actionMenu.ts
    //   attrs: { 'data-icon': licon.ChasingArrows, title: 'Hotkey: f' }
    h('button.openings__color-flip', {
      attrs: { 'data-icon': '\ue020', title: 'Flip board (f)', 'aria-label': 'Flip board' },
      on: { click: () => {
        flipBoard();
        if (_openingsCg) _openingsCg.set({ orientation: boardOrientation() });
        redraw();
      } },
    }),
  ]);
}

/**
 * Render the move list for the current opening line using the analysis-board
 * tview2 column layout, followed by the move-nav-bar navigation bar.
 * Placed between the lines panel and the sample games panel.
 * Adapted from lichess-org/lila: ui/analyse/src/treeView/columnView.ts + controls.ts
 */
let _saveLibFeedback: string | null = null;
let _saveLibFeedbackTimer: ReturnType<typeof setTimeout> | null = null;











let _activeOpeningsSaveFlow: SaveFlowCtrl | null = null;



function openingsSaveFlowContext(sans: string[]): SaveFlowContext {
  const moveTail = sans.length > 0 ? sans.slice(-4).join(' ') : '';
  return {
    line: moveTail ? `From Opening Tree — ${moveTail}` : 'From Opening Tree — current line',
    source: 'Save to Library (opening line)',
  };
}

function persistOpeningsSaveFlowResult(
  path: readonly string[],
  sans: string[],
  trainAs: 'white' | 'black',
  collection: ResearchCollection | null,
  result: SaveFlowResult,
  redraw: () => void,
): void {
  // Opening name and ECO are not yet available from OpeningTreeNode —
  // ECO lookup is a future task. Pass undefined for both fields.
  void saveOrpLineToLibrary([...path], sans, trainAs, collection).then(saved => {
    if (!saved) {
      // null result here means deriveFens rejected the UCI (the too-short guard already
      // fired above, so this branch is an invalid-moves failure, not a length issue).
      _saveLibFeedback = 'Save failed — invalid moves';
      if (_saveLibFeedbackTimer) clearTimeout(_saveLibFeedbackTimer);
      _saveLibFeedbackTimer = setTimeout(() => { _saveLibFeedback = null; redraw(); }, 1800);
      redraw();
      return undefined;
    }

    const item: StudyItem = { ...saved.studyItem };
    if (result.mode === 'quick') {
      item.uncategorized = true;
    } else if (result.destination !== undefined) {
      item.destination = result.destination;
    }
    if (result.purpose !== undefined) item.purpose = result.purpose;
    if (result.notes !== undefined) item.notes = result.notes;
    if (result.tags.length > 0) item.tags = Array.from(new Set([...item.tags, ...result.tags]));

    return saveStudy(item).then(() => {
      _saveLibFeedback = 'Saved to Library!';
      if (_saveLibFeedbackTimer) clearTimeout(_saveLibFeedbackTimer);
      _saveLibFeedbackTimer = setTimeout(() => { _saveLibFeedback = null; redraw(); }, 1800);
      redraw();
    });
  }).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : '';
    _saveLibFeedback = msg ? `Save failed — ${msg}` : 'Save failed';
    if (_saveLibFeedbackTimer) clearTimeout(_saveLibFeedbackTimer);
    _saveLibFeedbackTimer = setTimeout(() => { _saveLibFeedback = null; redraw(); }, 1800);
    redraw();
  });
}

/** Opens the universal save-flow modal for the current opening line (P2-SAVE-1). */
function openOpeningsSaveFlow(
  path: readonly string[],
  sans: string[],
  trainAs: 'white' | 'black',
  collection: ResearchCollection | null,
  redraw: () => void,
): void {
  _activeOpeningsSaveFlow = new SaveFlowCtrl({
    itemType: 'game',
    context: openingsSaveFlowContext(sans),
    onResolve: result => {
      _activeOpeningsSaveFlow = null;
      persistOpeningsSaveFlowResult(path, sans, trainAs, collection, result, redraw);
    },
    onCancel: () => {
      _activeOpeningsSaveFlow = null;
      redraw();
    },
  }, redraw);
  redraw();
}












export function resetOpeningsSaveFlow(): void {
  _activeOpeningsSaveFlow = null;
}

/**
 * Renders the active Opening Tree save-flow modal, or null when none is open. Mounted at the
 * session page root (renderSessionPage) so it overlays regardless of which right-workspace
 * column/tool is active.
 */
function renderActiveOpeningsSaveFlowModal(): VNode | null {
  return _activeOpeningsSaveFlow ? renderSaveFlowModal(_activeOpeningsSaveFlow) : null;
}



function sanSequenceForPath(tree: OpeningTreeNode, path: readonly string[]): string[] {
  const sans: string[] = [];
  let current: OpeningTreeNode = tree;
  for (const uci of path) {
    const child = current.children.find(c => c.uci === uci);
    if (!child) break;
    sans.push(child.san);
    current = child;
  }
  return sans;
}

function handleSaveToLibrary(path: readonly string[], redraw: () => void): void {
  // Guard: canonical helper requires at least 3 half-moves to produce a drillable sequence.
  // Show a specific message rather than silently doing nothing.
  if (path.length < 3) {
    _saveLibFeedback = 'Line too short to practice';
    if (_saveLibFeedbackTimer) clearTimeout(_saveLibFeedbackTimer);
    _saveLibFeedbackTimer = setTimeout(() => { _saveLibFeedback = null; redraw(); }, 1800);
    redraw();
    return;
  }

  const trainAs   = boardOrientation();
  const collection = activeCollection();
  const tree = openingTree();
  const sans = tree ? sanSequenceForPath(tree, path) : [];

  openOpeningsSaveFlow(path, sans, trainAs, collection, redraw);
}




/**
 * Wires the generalized seed-analysis handoff (main.ts's openAnalysisBoardFromEditor) into the
 * tree's own Analysis-mode toggle. Set once at bootstrap, mirroring
 * setOpeningsSessionStateChangeHandler's injection pattern in ctrl.ts.
 */
let _onEnterAnalysisMode: ((pgn: string) => void) | null = null;
export function setOpeningsAnalysisModeEntryHandler(handler: ((pgn: string) => void) | null): void {
  _onEnterAnalysisMode = handler;
}








function enterAnalysisModeFromTree(path: readonly string[]): void {
  const snapshot = openingsSessionUrlSnapshot();
  const tree = openingTree();
  if (!snapshot || !tree || !_onEnterAnalysisMode) return;

  const sans = sanSequenceForPath(tree, path);

  cancelTreeEval();
  markNav();

  const { pgn } = enterAnalysisMode({
    surfaceId:   'opening-tree',
    priorRoute:  opponentsEntryHref(snapshot),
    resumeState: snapshot,
    rootFen:     tree.fen,
    sans,
  });
  _onEnterAnalysisMode(pgn);
}

function renderOpeningsMoveList(
  tree: OpeningTreeNode,
  path: readonly string[],
  node: OpeningTreeNode | null,
  redraw: () => void,
): VNode {
  const { root, currentPath } = buildOpeningsMoveTree(tree, path);

  const navigate = (treePath: string) => {
    const depth = treePath.length / 2;
    navigateToPath([...sessionPath().slice(0, depth)]);
    syncOpeningsBoard(redraw);
    redraw();
  };

  return h('div.openings__move-list', [
    h('div.analyse__moves.areplay', [
      renderMoveList(root, currentPath, () => undefined, navigate, null, false),
    ]),
    _saveLibFeedback ? h('div.openings__save-line-row', [
      h('span.openings__save-feedback', _saveLibFeedback),
    ]) : null,
  ]);
}

/**
 * Move-nav-bar navigation controls (first/back/next/last + book/menu) for the
 * Opponents opening tree page. Rendered beneath the opening tree (played-lines)
 * list so the board navigation controls sit below the move rows.
 */
function renderOpeningsMoveNavBar(
  node: OpeningTreeNode | null,
  path: readonly string[],
  redraw: () => void,
): VNode {
  const canPrev = path.length > 0;
  const canNext = node !== null && node.children.length > 0;




  return renderMoveNavBar([
    renderAnalysisModeToggleButton(false, () => enterAnalysisModeFromTree(path)),
  ], {
    canPrev,
    canNext,
    first:      () => { navigateToRoot(); syncOpeningsBoard(redraw); redraw(); },
    prev:       () => { navigateBack(); syncOpeningsBoard(redraw); redraw(); },
    next:       () => {
      if (node && node.children.length > 0) {
        navigateToMove(node.children[0]!.uci);
        syncOpeningsBoard(redraw);
        redraw();
      }
    },
    last:       () => { navigateToEnd(); syncOpeningsBoard(redraw); redraw(); },
    bookActive: explorerCtrl.enabled,
	    onBook:     () => {
	      explorerCtrl.toggle();
	      if (explorerCtrl.enabled && node) explorerCtrl.setNode(node.fen, redraw);
	      syncOpeningsAutoShapes(node);
	      redraw();
	    },
    menuTitle: 'Opening Tree menu',
    menuOpen:  _openingsMenuOpen,
    onMenu:    () => { _openingsMenuOpen = !_openingsMenuOpen; redraw(); },
  });
}

function renderOpeningsBoard(node: OpeningTreeNode | null, redraw: () => void): VNode {
  const fen = node?.fen ?? STANDARD_START_FEN;

  return h('div.cg-wrap.openings__board', {
    key: 'openings-board',
    hook: {
      insert: (vnode) => {
        const dests = destsForFen(fen);
        _lastBoardFen = fen;
        setCevalPositionOverride('openings-live', openingsPositionContext(fen));
        if (engineEnabled) evalCurrentPosition();
        _openingsCg = makeChessground(vnode.elm as HTMLElement, {
          fen,
          orientation: boardOrientation(),
          animation: chessBoardAnimationConfig(),
          viewOnly: false,
          movable: {
            free: false,
            color: 'both',
            dests,
          },
          draggable: {
            enabled: true,
            showGhost: true,
          },
          drawable: {
            enabled: true,
            brushes: {
              green:    { key: 'g',  color: '#15781B', opacity: 0.8,  lineWidth: 10 },
              red:      { key: 'r',  color: '#882020', opacity: 0.8,  lineWidth: 10 },
              blue:     { key: 'b',  color: '#003088', opacity: 0.8,  lineWidth: 10 },
              paleBlue: { key: 'pb', color: '#003088', opacity: 0.65, lineWidth: 15 },
              yellow:   { key: 'y',  color: '#e6a520', opacity: 0.55, lineWidth: 8 },
              paleGrey: { key: 'pg', color: '#888888', opacity: 0.35, lineWidth: 6 },
              repertoire: REPERTOIRE_ARROW_BRUSH,
              repertoireAlt: REPERTOIRE_ALT_ARROW_BRUSH,
              ...FREQ_BRUSHES,
            },
          },
          events: {
            move: (orig, dest) => {
              const uci = `${orig}${dest}`;
              const current = sessionNode();

              // Browse mode: tree children navigate the tree; any other legal move
              // advances as free off-tree analysis (Lichess opening-explorer parity).
              if (current) {
                // Only check tree children when we are at a tree position.
                // If _offTreeFen is set, the board shows an off-tree position so
                // current.children are no longer relevant — continue in off-tree mode.
                if (!_offTreeFen) {
                  const match = current.children.find(c =>
                    c.uci === uci || c.uci.startsWith(uci),
                  );
                  if (match) {
                    navigateToMove(match.uci);
                    syncOpeningsBoard(redraw);
                    redraw();
                    return;
                  }
                }
                // Off-tree legal move (or continuation from an off-tree position):
                // compute the resulting FEN and advance the board directly.
                const baseFen = _offTreeFen ?? current.fen;
                const setup = parseFen(baseFen);
                if (setup.isOk) {
                  const posResult = Chess.fromSetup(setup.value);
                  if (posResult.isOk) {
                    const move = parseUci(uci);
                    if (move) {
                      let san = uci;
                      try { san = makeSan(posResult.value, move); } catch {}
                      posResult.value.play(move);
                      const newFen = makeFen(posResult.value.toSetup());
                      _offTreeFen = newFen;
                      _lastBoardFen = newFen;
                      _openingsCg?.set({
                        fen: newFen,
                        animation: chessBoardAnimationConfig(),
                        lastMove: [orig, dest],
                        movable: { dests: destsForFen(newFen), color: 'both' },
                      });
                      playOpeningsMoveSound(san);
                      scheduleOpeningsEngineEval(newFen);
                      redraw();
                    }
                  }
                }
              }
            },
          },
        });
        bindBoardResizeHandle(vnode.elm as HTMLElement);
        // Reset the diff-guard so the first push after a remount always fires
        // (Chessground starts with no shapes after makeChessground).
        _lastOpeningsAutoShapesHash = null;
        // Draw initial arrows for the starting position.
        syncOpeningsAutoShapes(node);
        // If a fetch is in progress and the animation hasn't started yet, start it
        // now that the board is mounted. The first renderFetchBar call happens in
        // the same patch cycle as this insert hook, so _openingsCg wasn't available
        // there yet — this catches that race.
        if (isFetching() && _animTimer === null && _animGame === null) {
          startImportAnimation(redraw);
        }
      },
      postpatch: () => {








        syncOpeningsAutoShapes(node);
      },
      destroy: () => {
        _lastBoardFen = '';
        _lastOpeningsAutoShapesHash = null;
        if (_openingsCg) {
          _openingsCg.destroy();
          _openingsCg = undefined;
        }
      },
    },
  });
}

// --- Cached dests to avoid recomputing for the same FEN ---
let _cachedDestsFen = '';
let _cachedDests: Map<Key, Key[]> = new Map();

function destsForFen(fen: string): Map<Key, Key[]> {
  if (fen === _cachedDestsFen) return _cachedDests;
  const setup = parseFen(fen);
  const pos = setup.isOk ? Chess.fromSetup(setup.value) : undefined;
  _cachedDests = pos?.isOk ? chessgroundDests(pos.value) : new Map();
  _cachedDestsFen = fen;
  return _cachedDests;
}

// ─── Import animation ─────────────────────────────────────────────────────────

function stopImportAnimation(): void {
  if (_animTimer !== null) {
    clearTimeout(_animTimer);
    _animTimer = null;
  }
  _animGame    = null;
  _animMoveIdx = 0;
  _animPos     = null;
}

function startImportAnimation(redraw: () => void): void {
  stopImportAnimation();
  _animGame    = randomMasterGame();
  _animMoveIdx = 0;

  const setup = parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  try {
    _animPos = setup.isOk ? Chess.fromSetup(setup.value).unwrap() : null;
  } catch {
    _animPos = null;
  }
  if (!_animPos || !_openingsCg) return;

  _openingsCg.set({
    fen:      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    lastMove: [] as Key[],
    movable:  { color: 'both', free: false, dests: new Map() },
    animation: { enabled: true, duration: 200 },
  });
  // Start first move immediately so there is no visible gap between games.
  scheduleNextAnimMove(redraw, 0);
}

function scheduleNextAnimMove(redraw: () => void, delay = ANIM_MOVE_MS): void {
  _animTimer = setTimeout(() => {
    _animTimer = null;
    if (!isFetching() || !_animGame || !_animPos || !_openingsCg) return;

    const uciStr = _animGame.moves[_animMoveIdx];
    if (!uciStr) {
      // Game ended — pick a new random game and restart.
      startImportAnimation(redraw);
      return;
    }

    const move = parseUci(uciStr);
    if (!move || !_animPos.isLegal(move)) {
      // Bad move in dataset — skip to next game gracefully.
      startImportAnimation(redraw);
      return;
    }

    _animPos.play(move);
    const newFen = makeFen(_animPos.toSetup());
    const from   = uciStr.slice(0, 2) as Key;
    const to     = uciStr.slice(2, 4) as Key;
    _openingsCg.set({ fen: newFen, lastMove: [from, to] });

    _animMoveIdx++;
    scheduleNextAnimMove(redraw);
  }, delay);
}

/**
 * Settle-gated engine eval for the openings board.
 *
 * Called on every FEN change during navigation (tree nav and off-tree moves).
 * - Sets the FEN override immediately so any in-flight search can detect staleness.
 * - Stops any in-flight search immediately; the engine will restart after settle.
 * - Records a navigation event (markNav) then schedules eval after SETTLE_QUIET_MS
 *   of silence, dropping the callback if the user navigates again before it fires.
 *
 * Mirrors the Lichess "stop on jump, restart on settle" pattern from
 * ui/analyse/src/ctrl.ts jump() → ceval.stop() / startCeval(), adapted for the
 * openings board's main-thread engine and scheduler settle model.
 */
function scheduleOpeningsEngineEval(fen: string): void {
  // Immediate: keep the override position current for the stale guard.
  setCevalPositionOverride('openings-live', openingsPositionContext(fen));
  // Immediate: cancel the in-flight search so we don't waste time on a stale FEN.
  stopProtocol();
  // Record the navigation event and schedule eval after the quiet period.
  markNav();
  const token = currentGenerationToken();
  onSettle(() => {
    if (!isGenerationCurrent(token)) return; // superseded by a later nav event — drop




    if (_openingsCg) syncOpeningsAutoShapes(sessionNode());
    if (!engineEnabled) return;
    evalCurrentPosition();
  });
}

export function syncOpeningsBoard(_redraw: () => void): void {
  // Stop any running import animation so the board is cleanly handed back.
  if (!isFetching() && _animGame !== null) stopImportAnimation();
  // Any explicit tree navigation clears the transient off-tree analysis position.
  _offTreeFen = null;

  const node = sessionNode();
  if (!_openingsCg || !node) return;
  const fen = node.fen;
  const lastMove = node.uci
    ? [node.uci.slice(0, 2) as Key, node.uci.slice(2, 4) as Key]
    : undefined;
  const currentLastMove = _openingsCg.state.lastMove;
  const ownsLastMove = lastMove === undefined
    ? currentLastMove === undefined
    : currentLastMove?.length === lastMove.length
      && currentLastMove.every((key, index) => key === lastMove[index]);
  explorerCtrl.clearStaleHovering(fen);
  // A same-FEN board owner (for example import animation) may still replace lastMove.
  if (fen === _lastBoardFen && ownsLastMove) return;
  _lastBoardFen = fen;

  // Chessground's runtime config treats a present undefined lastMove as an explicit clear.
  _openingsCg.set({
    fen,
    animation: chessBoardAnimationConfig(),
    orientation: boardOrientation(),
    movable: { dests: destsForFen(fen), color: 'both' },
    lastMove,
  } as CgConfig);
  syncOpeningsAutoShapes(node);
  // Update FEN override and schedule engine eval after settle.
  scheduleOpeningsEngineEval(fen);
}

onBoardAnimationChange('chess', () => {
  if (_animGame !== null || _animTimer !== null) return;
  _openingsCg?.set({ animation: chessBoardAnimationConfig() });
});

// Pre-built opacity brushes for frequency arrows (registered once at board init).
const FREQ_BRUSHES: Record<string, { key: string; color: string; opacity: number; lineWidth: number }> = {};
for (let i = 0; i < 8; i++) {
  // Pre-register 8 brushes with descending opacity: 0.85, 0.70, 0.55, ...
  const opacity = Math.max(0.15, 0.85 - i * 0.1);
  FREQ_BRUSHES[`freq${i}`] = { key: `f${i}`, color: '#15781B', opacity, lineWidth: 10 };
}






















function buildOpeningsAutoShapes(node: OpeningTreeNode | null): DrawShape[] {
  const fen = currentOpeningsBoardFen() ?? node?.fen ?? null;
  return [

    ...(_showTreeArrows && node ? buildFrequencyArrows(node) : []),
    ...(explorerCtrl.enabled && explorerCtrl.config.db === 'repertoire' && !isRapid()
      ? buildRepertoireArrowShapes(repertoireSources(), fen)
      : []),
    ...(isRapid() ? [] : buildEngineArrowShapes(fen ? { fen } : undefined)),
  ];
}

/** Stable string key for a DrawShape array (mirrors engine/ctrl.ts autoShapesHash). */
function openingsAutoShapesHash(shapes: DrawShape[]): string {
  return shapes.map(shape => [
    shape.orig ?? '',
    shape.dest ?? '',
    shape.brush ?? '',
    shape.piece ? `${shape.piece.color}|${shape.piece.role}|${shape.piece.scale ?? ''}` : '',
    shape.modifiers ? `${shape.modifiers.lineWidth ?? ''}|${shape.modifiers.hilite ?? ''}` : '',
    shape.customSvg ? '1' : '',
    shape.label ? `${shape.label.text}|${shape.label.fill ?? ''}` : '',
    shape.below ? '1' : '',
  ].join('~')).join(';');
}




















function syncOpeningsAutoShapes(node: OpeningTreeNode | null): void {
  if (!_openingsCg) return;
  const shapes = buildOpeningsAutoShapes(node);
  const nextHash = openingsAutoShapesHash(shapes);
  if (nextHash === _lastOpeningsAutoShapesHash) return;
  _lastOpeningsAutoShapesHash = nextHash;
  _openingsCg.setAutoShapes(shapes);
}

/**
 * Frequency arrows for child moves.
 * Same green color, width scales with frequency, opacity via pre-registered brushes.
 */
function buildFrequencyArrows(node: OpeningTreeNode): DrawShape[] {
  if (!node.children.length || node.total === 0) return [];
  const maxTotal = node.children[0]!.total;
  if (maxTotal === 0) return [];

  const shapes: DrawShape[] = [];
  const count = Math.min(node.children.length, 8);
  for (let i = 0; i < count; i++) {
    const child = node.children[i]!;
    const ratio = child.total / maxTotal;
    const width = Math.max(3, Math.round(14 * Math.sqrt(ratio)));
    shapes.push({
      orig: child.uci.slice(0, 2) as Key,
      dest: child.uci.slice(2, 4) as Key,
      brush: `freq${i}`,
      modifiers: { lineWidth: width },
    });
  }
  return shapes;
}

function renderMobileCapNotice(redraw: () => void): VNode | null {
  const capped = cappedGamesCount();
  if (capped <= 0) return null;
  const shown = treeBuildTotal();
  const total = shown + capped;
  return h('div.openings__mobile-cap-notice', [
    h('span.openings__mobile-cap-label',
      `Showing ${shown.toLocaleString()} of ${total.toLocaleString()} games (mobile).`),
    h('button.openings__mobile-cap-btn', {
      on: { click: () => { loadFullMobileTree(redraw); } },
    }, 'Load all games'),
  ]);
}

function renderTreeBuildBar(redraw: () => void): VNode {
  // When the fetch→tree-build transition fires, stop the board animation and show
  // the standard starting position oriented for the selected colour.
  if ((_animGame !== null || _animTimer !== null) && _openingsCg) {
    stopImportAnimation();
    const orient: 'white' | 'black' = colorFilter() === 'black' ? 'black' : 'white';
    _openingsCg.set({
      fen:         'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      lastMove:    [] as Key[],
      movable:     { color: 'both', free: false, dests: new Map() },
      animation:   { enabled: false },
      orientation: orient,
    });
  }
  const progress = treeBuildProgress();
  const total = treeBuildTotal();
  const pct = total > 0 ? Math.min(100, Math.round((progress / total) * 100)) : 0;
  return h('div.openings__tree-build', [
    h('div.openings__tree-build-bar', [
      h('div.openings__tree-build-fill', {
        attrs: { style: `width:${pct}%` },
      }),
    ]),
    h('span.openings__tree-build-label', 'Building opening tree\u2026'),

    renderMobileCapNotice(redraw),
  ]);
}

function renderFetchBar(redraw: () => void): VNode {
  // Kick off the board animation the first time this renders (or if it stopped).
  if (_animTimer === null && _animGame === null && _openingsCg) {
    startImportAnimation(redraw);
  }

  const progress = importProgress();
  const month = importMonth();
  let label: string;
  if (progress > 0) {
    const base = `${progress.toLocaleString()} games`;
    label = month ? `Fetching games\u2026 ${base} \u2014 ${month}` : `Fetching games\u2026 ${base}`;
  } else {
    label = 'Connecting\u2026';
  }
  return h('div.openings__tree-build', [
    h('div.openings__tree-build-bar', [
      h('div.openings__tree-build-fill', {
        attrs: { style: 'width:100%;opacity:0.6' },
      }),
    ]),
    h('div.openings__tree-build-footer', [
      h('span.openings__tree-build-label', label),
      h('button.openings__cancel-import-btn', {
        on: { click: () => { cancelImport(); stopImportAnimation(); redraw(); } },
      }, 'Cancel'),
    ]),
  ]);
}

function renderMoveNav(path: readonly string[], redraw: () => void): VNode {
  const node = sessionNode();
  const canForward = node !== null && node.children.length > 0;
  return h('div.openings__nav', [
    h('button.openings__nav-btn', {
      attrs: { disabled: path.length === 0, title: 'Go to start', 'aria-label': 'Go to start' },
      on: { click: () => { navigateToRoot(); syncOpeningsBoard(redraw); redraw(); } },
    }, '\u23EE'),
    h('button.openings__nav-btn', {
      attrs: { disabled: path.length === 0, title: 'Back one move', 'aria-label': 'Back one move' },
      on: { click: () => { navigateBack(); syncOpeningsBoard(redraw); redraw(); } },
    }, '\u25C0'),
    h('button.openings__nav-btn', {
      attrs: { disabled: !canForward, title: 'Most popular continuation', 'aria-label': 'Most popular continuation' },
      on: { click: () => {
        if (node && node.children.length > 0) {
          navigateToMove(node.children[0]!.uci);
          syncOpeningsBoard(redraw);
          redraw();
        }
      } },
    }, '\u25B6'),
    h('span.openings__nav-depth', `Move ${Math.ceil(path.length / 2)}`),
  ]);
}

/** Render the current line as a clickable breadcrumb trail. */
function renderMovePath(path: readonly string[], redraw: () => void): VNode {
  if (path.length === 0) {
    return h('div.openings__path', [h('span.openings__path-start', 'Starting position')]);
  }

  // Walk the tree to get SAN labels for each step
  const tree = openingTree();
  const labels: { san: string; pathTo: string[] }[] = [];
  if (tree) {
    let current: OpeningTreeNode | undefined = tree;
    for (let i = 0; i < path.length; i++) {
      const child: OpeningTreeNode | undefined = current?.children.find(c => c.uci === path[i]);
      if (!child) break;
      labels.push({ san: child.san, pathTo: path.slice(0, i + 1) as string[] });
      current = child;
    }
  }

  return h('div.openings__path', [
    h('span.openings__path-start', {
      on: { click: () => { navigateToRoot(); syncOpeningsBoard(redraw); redraw(); } },
    }, 'Start'),
    ...labels.map((l, i) => {
      const moveNum = Math.floor(i / 2) + 1;
      const isWhite = i % 2 === 0;
      const prefix = isWhite ? `${moveNum}. ` : (i === 0 ? '1... ' : '');
      return h('span.openings__path-move', {
        on: { click: () => { navigateToPath(l.pathTo); syncOpeningsBoard(redraw); redraw(); } },
      }, `${prefix}${l.san}`);
    }),
  ]);
}

function dateRangeDescription(settings?: { dateRange: string; customFrom?: string; customTo?: string }): string {
  if (!settings) return '';
  switch (settings.dateRange) {
    case '24h':     return ' in the last 24 hours';
    case '1week':   return ' in the last week';
    case '1month':  return ' in the last month';
    case '3months': return ' in the last 3 months';
    case '1year':   return ' in the last year';
    case 'all':     return '';
    case 'custom':
      if (settings.customFrom && settings.customTo) return ` from ${settings.customFrom} to ${settings.customTo}`;
      if (settings.customFrom) return ` since ${settings.customFrom}`;
      return '';
    default:        return '';
  }
}

/**
 * Speed filter chips — Bullet / Blitz / Rapid.
 * Counts are computed from the color-filtered game list so they reflect what's
 * actually in the tree. Toggling a chip rebuilds the tree via setSpeedFilter().
 * Empty filter set = all speeds included (default).
 */
function renderSpeedFilter(redraw: () => void): VNode {
  const collection = activeCollection();
  const filter = speedFilter();
  const color = colorFilter();
  const target = collection?.target?.toLowerCase() ?? '';

  // Count games per timeClass, mirroring the color filter applied during tree build.
  const counts = new Map<string, number>();
  if (collection) {
    let games = collection.games;
    if (target) {
      games = games.filter(g => {
        const isWhite = g.white?.toLowerCase() === target;
        const isBlack = g.black?.toLowerCase() === target;
        return color === 'white' ? isWhite : isBlack;
      });
    }
    for (const g of games) {
      const tc = g.timeClass ?? '';
      if (tc) counts.set(tc, (counts.get(tc) ?? 0) + 1);
    }
  }

  const toggle = (value: string) => {
    let next: Set<string>;
    if (filter.size === 0) {
      // All active → narrow to just this chip.
      next = new Set([value]);
    } else if (filter.has(value)) {
      if (filter.size === 1) {
        // Only active chip → snap back to "all".
        next = new Set();
      } else {
        // Remove from active set.
        next = new Set(filter);
        next.delete(value);
      }
    } else {
      // Add to active set; collapse to "all" if every speed is now selected.
      next = new Set(filter);
      next.add(value);
      if (SPEED_OPTIONS.every(s => next.has(s.value))) next = new Set();
    }
    setSpeedFilter(next, redraw);
    redraw();
  };

  return h('div.openings__speed-filter', [
    h('div.openings__speed-label-row', 'Time control'),
    h('div.openings__speed-chips', SPEED_OPTIONS.map(({ value, label, icon }) => {
      const count = counts.get(value) ?? 0;
      const isActive = filter.size === 0 || filter.has(value);
      return h('button.openings__speed-chip', {
        class: { active: isActive, 'no-games': count === 0 },
        attrs: { title: `${label}: ${count} game${count !== 1 ? 's' : ''}` },
        on: { click: () => toggle(value) },
      }, [
        h('span.openings__speed-icon', { attrs: { 'data-icon': icon } }),
        label,
        h('span.openings__speed-count', `${count}`),
      ]);
    })),
  ]);
}

/**
 * Date range filter row — shown below speed chips in the Opening Tree panel.
 * Default: all time. Active: filters tree to games within the selected window.
 * Popup counts mirror the active tree's filtered game set instead of previewing
 * independent per-range totals.
 */
function renderDateRangeFilter(redraw: () => void): VNode {
  const activeRange = sessionDateRange();
  const currentActiveGames = activeGames();
  const activeCount = currentActiveGames.length;

  // Compute the actual date span of the active tree game set for the "All" label.
  function formatMonthYear(dateStr: string): string {
    const ts = Date.parse(dateStr.replace(/\./g, '-'));
    if (isNaN(ts)) return '';
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
  let spanLabel = '';
  if (currentActiveGames.length > 0) {
    let earliest = '', latest = '';
    for (const g of currentActiveGames) {
      if (!g.date) continue;
      if (!earliest || g.date < earliest) earliest = g.date;
      if (!latest   || g.date > latest)   latest   = g.date;
    }
    if (earliest && latest) {
      const from = formatMonthYear(earliest);
      const to   = formatMonthYear(latest);
      spanLabel  = from === to ? from : `${from} – ${to}`;
    }
  }


  function customRangeBtnLabel(): string {
    const from = sessionCustomFrom();
    const to   = sessionCustomTo();
    const suffix = ` (${activeCount})`;
    if (from && to)  return `${from} – ${to}${suffix}`;
    if (from)        return `From ${from}${suffix}`;
    if (to)          return `To ${to}${suffix}`;
    return `Custom${suffix}`;
  }

  const activePresetLabel = activeRange && activeRange !== 'custom'
    ? (SESSION_DATE_RANGE_OPTIONS as readonly { value: string; label: string }[]).find(o => o.value === activeRange)?.label ?? activeRange
    : null;


  const undated = excludedUndatedCount();

  const closePopup = () => { _dateRangePopupOpen = false; redraw(); };

  return h('div.openings__date-range-row', [
    // Backdrop to dismiss popup on click-outside.
    _dateRangePopupOpen ? h('div.openings__date-popup-backdrop', {
      on: { click: closePopup },
    }) : null,
    h('div.openings__date-range-btn-wrap', [
      // Main trigger button.
      h('button.openings__date-range-btn', {
        class: { active: !!activeRange },
        on: { click: () => { _dateRangePopupOpen = !_dateRangePopupOpen; redraw(); } },
      }, activeRange === 'custom'
        ? [customRangeBtnLabel()]
        : activeRange
          ? [activePresetLabel, ` (${activeCount})`]
          : [spanLabel ? `All (${activeCount}) · ${spanLabel}` : `All (${activeCount})`],
      ),
      // Inline × to clear active range.
      activeRange ? h('button.openings__date-range-clear', {
        attrs: { title: 'Clear date filter' },
        on: { click: () => { setSessionDateRange(null, redraw); _dateRangePopupOpen = false; redraw(); } },
      }, '\u00d7') : null,

      _dateRangePopupOpen ? h('div.openings__date-range-popup', [
        ...SESSION_DATE_RANGE_OPTIONS.map(opt =>
          h('button.openings__date-range-option', {
            class: { active: activeRange === opt.value },
            on: { click: () => { setSessionDateRange(opt.value, redraw); _dateRangePopupOpen = false; redraw(); } },
          }, [
            h('span', opt.label),
            h('span.openings__date-range-count', `${activeCount}`),
          ]),
        ),
        // Custom absolute range option — keeps popup open so user can fill in dates.
        h('button.openings__date-range-option', {
          class: { active: activeRange === 'custom' },
          on: { click: () => { setSessionDateRange('custom', redraw); redraw(); } },
        }, h('span', 'Custom range')),
        activeRange === 'custom' ? h('div.openings__date-range-custom', [
          h('div.openings__date-range-custom-row', [
            h('label.openings__date-range-custom-label', 'From'),
            h('input.openings__date-range-custom-input', {
              attrs: { type: 'date' },
              props: { value: sessionCustomFrom() },
              on: { change: (e: Event) => { setSessionCustomFrom((e.target as HTMLInputElement).value, redraw); } },
            }),
          ]),
          h('div.openings__date-range-custom-row', [
            h('label.openings__date-range-custom-label', 'To'),
            h('input.openings__date-range-custom-input', {
              attrs: { type: 'date' },
              props: { value: sessionCustomTo() },
              on: { change: (e: Event) => { setSessionCustomTo((e.target as HTMLInputElement).value, redraw); } },
            }),
          ]),
        ]) : null,
      ]) : null,
    ]),
    // Excluded-undated count hint — only shown when a bounded (non-all-time) range is active.
    (activeRange && undated > 0)
      ? h('span.openings__date-range-undated', `${undated} undated excluded`)
      : null,
  ]);
}

/**
 * Filter badges shown at the top of each tool panel when speed or date filters are active.
 * Each badge has an × to clear that individual filter and trigger a tree rebuild.
 */
function renderFilterBadge(redraw: () => void): VNode | null {
  const range = sessionDateRange();
  const speeds = speedFilter();
  if (!range && speeds.size === 0) return null;

  const badges: VNode[] = [];

  if (speeds.size > 0) {
    const speedLabels = SPEED_OPTIONS
      .filter(o => speeds.has(o.value))
      .map(o => o.label)
      .join(', ');
    badges.push(h('span.openings__filter-badge', [
      speedLabels,
      h('button.openings__filter-badge-clear', {
        attrs: { title: 'Clear speed filter' },
        on: { click: () => { setSpeedFilter(new Set(), redraw); redraw(); } },
      }, '\u00d7'),
    ]));
  }

  if (range) {

    const rangeLabel = range === 'custom'
      ? (() => {
          const from = sessionCustomFrom();
          const to   = sessionCustomTo();
          if (from && to)  return `${from} \u2013 ${to}`;
          if (from)        return `From ${from}`;
          if (to)          return `To ${to}`;
          return 'Custom range';
        })()
      : (SESSION_DATE_RANGE_OPTIONS as readonly { value: string; label: string }[]).find(o => o.value === range)?.label ?? range;
    badges.push(h('span.openings__filter-badge', [
      rangeLabel,
      h('button.openings__filter-badge-clear', {
        attrs: { title: 'Clear date filter' },
        on: { click: () => { setSessionDateRange(null, redraw); redraw(); } },
      }, '\u00d7'),
    ]));
  }

  return h('div.openings__filter-badge-row', badges);
}

// --- Deviation scan panel ---

function renderDeviationPanel(redraw: () => void): VNode {
  const results = deviationResults();
  const loading = deviationLoading();
  const progress = deviationProgress();
  const total = deviationTotal();

  return h('div.openings__deviation-panel', [
    h('div.openings__deviation-header', [
      h('span.openings__pr-section-title', 'Theory Deviations'),
      loading
        ? h('span.openings__deviation-progress', `Scanning ${progress}/${total}...`)
        : h('button.openings__deviation-scan-btn', {
            on: { click: () => startDeviationScan(redraw) },
          }, results.length > 0 ? 'Rescan' : 'Scan for deviations'),
    ]),

    results.length > 0 ? h('div.openings__deviation-list',
      results.slice(0, 8).map(d =>
        h('div.openings__deviation-row', {
          on: { click: () => { navigateToPath(d.path.slice(0, -1)); syncOpeningsBoard(redraw); redraw(); } },
        }, [
          h('span.openings__deviation-moves', d.sans.slice(0, 4).join(' ')),
          h('span.openings__deviation-detail', [
            h('span.openings__deviation-opp', `plays ${d.opponentMove}`),
            h('span.openings__deviation-theory', `theory: ${d.theoryMove}`),
          ]),
          h('span.openings__deviation-count', `(n=${d.gamesAtNode})`),
        ])
      )
    ) : (!loading ? h('div.openings__deviation-empty', 'Click "Scan" to find where they leave theory') : null),
  ]);
}

function renderPlayedLinesPanel(node: OpeningTreeNode, redraw: () => void): VNode {
  const dateLabel = dateRangeDescription(activeCollection()?.settings);
  initTreeEval({ redraw });
  return h('div.openings__lines-panel', [
    // Position header: game count + result bar — visually separated from moves
    h('div.openings__pos-header', [
      h('div.openings__pos-summary', [
        h('span.openings__pos-total', `${node.total} game${node.total !== 1 ? 's' : ''}`),
        h('span.openings__pos-label', `reached this position${dateLabel}`),
      ]),
      renderResultBar(node),
    ]),
    // Played lines
    node.children.length === 0
      ? h('div.openings__moves-empty', 'No further moves in this collection.')
      : h('div.openings__moves',
          node.children.map(child => renderMoveRow(child, node.fen, redraw)),
        ),
    renderTreeEvalControls(redraw),
  ]);
}

function renderOpeningTreeFilterControls(redraw: () => void): VNode {
  return h('div.openings__underboard-filters', [
    renderSpeedFilter(redraw),
    renderDateRangeFilter(redraw),
  ]);
}

function renderTreeEvalControls(redraw: () => void): VNode {
  const enabled = isTreeEvalEnabled();
  const status = getTreeEvalStatus();
  const active = enabled && status.inProgress;
  const refining = active && status.phase === 'refining';
  const thoroughness = treeEvalThoroughness();
  return h('div.openings__tree-eval-controls', [
    h('label.openings__tree-eval-toggle', [
      h('input', {
        attrs: {
          type: 'checkbox',
          checked: enabled,
        },
        on: {
          change: (event: Event) => {
            const on = (event.currentTarget as HTMLInputElement).checked;
            setTreeEvalEnabled(on);
            if (!on) cancelTreeEval();
            else triggerTreeEvalForCurrentNode();
            redraw();
          },
        },
      }),
      h('span.openings__tree-eval-switch'),
      h('span.openings__tree-eval-label', 'Tree eval'),
      h('span.openings__tree-eval-activity', {
        class: {
          'openings__tree-eval-activity--active': active,
          'openings__tree-eval-activity--refining': refining,
        },
        attrs: {
          title: active ? (refining ? 'Tree eval refining' : 'Tree eval evaluating') : 'Tree eval idle',
          'aria-hidden': 'true',
        },
      }, active ? [
        h('img.openings__tree-eval-activity-icon', {
          attrs: {
            src: '/images/loading-icons/loading-still.png',
            alt: '',
          },
        }),
      ] : []),
    ]),
    h('div.openings__tree-eval-levels', {
      class: { 'openings__tree-eval-levels--disabled': !enabled },
    }, TREE_EVAL_THOROUGHNESS_OPTIONS.map(option =>
      h('button.openings__tree-eval-level', {
        class: { active: thoroughness === option.value },
        attrs: {
          type: 'button',
          disabled: !enabled,
          title: `${option.label} tree eval thoroughness`,
        },
        on: { click: () => setTreeEvalThoroughness(option.value, redraw) },
      }, option.label),
    )),
  ]);
}

function renderMoveRow(child: OpeningTreeNode, parentFen: string, redraw: () => void): VNode {
  const gameLabel = child.total === 1 ? 'game' : 'games';

  // Check if this move is a known deviation from theory
  const path = sessionPath();
  const deviations = deviationResults();
  const deviation = deviations.find(d => {
    if (d.path.length !== path.length + 1) return false;
    for (let i = 0; i < path.length; i++) {
      if (d.path[i] !== path[i]) return false;
    }
    return d.path[path.length] === child.uci;
  });

  return h('div.openings__move-row', {
    key: child.uci,
    class: { 'openings__move-row--deviation': !!deviation },
    on: { click: () => { navigateToMove(child.uci); syncOpeningsBoard(redraw); redraw(); } },
  }, [
    h('div.openings__move-line', [
      h('span.openings__move-san', [
        child.san,
        deviation ? h('span.openings__deviation-badge', {
          attrs: { title: `Deviates from theory: ${deviation.theoryMove}` },
        }, '\u2197') : null,  // ↗
      ]),
      renderMoveEvalSlot(child, parentFen),
      h('span.openings__move-count', `${child.total} ${gameLabel}`),
    ]),
    renderResultBar(child),
  ]);
}

function renderMoveEvalSlot(child: OpeningTreeNode, parentFen: string): VNode {
  const entry = isTreeEvalEnabled() ? getTreeEval(child.fen) : undefined;
  const bookIcon = renderMastersBookIcon(parentFen, child.uci);
  if (!entry || (entry.cp === undefined && entry.mate === undefined)) {
    return h('span.openings__move-eval', bookIcon ? [bookIcon] : []);
  }
  const swing = formatTreeEvalSwing(entry.swing);
  return h('span.openings__move-eval', [
    h('strong.openings__move-score', {
      class: treeEvalScoreClasses(entry, child.fen),
    }, formatScore(entry)),
    swing
      ? h('span.openings__move-swing', {
          class: {
            'openings__move-swing--bad': entry.swing !== undefined && entry.swing <= -0.08,
            'openings__move-swing--good': entry.swing !== undefined && entry.swing >= 0.08,
          },
        }, swing)
      : null,
    bookIcon,
  ]);
}

function renderMastersBookIcon(parentFen: string, uci: string): VNode | null {
  if (!explorerCtrl.enabled || explorerCtrl.config.db !== 'masters') return null;
  if (!openingDataHasMove(explorerCtrl.current(parentFen), uci)) return null;
  return h('span.openings__move-book', {
    attrs: {
      'data-icon': ICON_BOOK,
      title: 'In masters database',
      'aria-label': 'In masters database',
    },
  });
}

function currentOpeningsBoardFen(): string | null {
  return _offTreeFen ?? sessionNode()?.fen ?? null;
}

function restoreOpeningsExplorerAutoShapes(): void {
  _lastOpeningsAutoShapesHash = null;
  syncOpeningsAutoShapes(sessionNode());
}

// Move-row hover handling invalidates the auto-shapes diff guard after pushing a transient
// arrow directly to the board, so leave can restore the canonical composite.
function clearOpeningsAutoShapesHash(): void {
  _lastOpeningsAutoShapesHash = null;
}

function playOpeningsExplorerMove(uci: string, redraw: () => void): void {
  const current = sessionNode();
  if (!current) return;

  if (!_offTreeFen) {
    const child = current.children.find(candidate => candidate.uci === uci || candidate.uci.startsWith(uci));
    if (child) {
      navigateToMove(child.uci);
      const newNode = sessionNode();
      if (newNode) explorerCtrl.setNode(newNode.fen, redraw);
      syncOpeningsBoard(redraw);
      redraw();
      return;
    }
  }

  const baseFen = _offTreeFen ?? current.fen;
  const setup = parseFen(baseFen);
  if (!setup.isOk) return;
  const posResult = Chess.fromSetup(setup.value);
  if (!posResult.isOk) return;
  const parsed = parseUci(uci);
  if (!parsed) return;
  const move = normalizeMove(posResult.value, parsed);
  if (!('from' in move) || !posResult.value.isLegal(move)) return;

  const san = makeSan(posResult.value, move);
  posResult.value.play(move);
  const newFen = makeFen(posResult.value.toSetup());
  _offTreeFen = newFen;
  _lastBoardFen = newFen;
  explorerCtrl.clearStaleHovering(newFen);
  _openingsCg?.set({
    fen: newFen,
    animation: chessBoardAnimationConfig(),
    lastMove: [uci.slice(0, 2) as Key, uci.slice(2, 4) as Key],
    movable: { dests: destsForFen(newFen), color: 'both' },
  });
  explorerCtrl.setNode(newFen, redraw);
  playOpeningsMoveSound(san);
  scheduleOpeningsEngineEval(newFen);
  redraw();
}

function treeEvalScoreClasses(entry: TreeEvalEntry, fen: string): Record<string, boolean> {
  const isKo = entry.mate === 0;
  const isPositive = entry.cp !== undefined ? entry.cp > 0 : entry.mate !== undefined ? entry.mate > 0 : null;
  const stm = fen.split(' ')[1];
  const cpStm = entry.cp !== undefined ? (stm === 'w' ? entry.cp : -entry.cp) : undefined;
  const isMassive = (cpStm !== undefined && cpStm > 200)
    || (entry.mate !== undefined && ((stm === 'w' && entry.mate > 0) || (stm === 'b' && entry.mate < 0)));
  return {
    'pv__score--white':   isPositive === true,
    'pv__score--black':   isPositive === false,
    'pv__score--ko':      isKo,
    'pv__score--massive': isMassive,
  };
}

function formatTreeEvalSwing(swing: number | undefined): string {
  if (swing === undefined) return '';
  const percent = Math.round(swing * 100);
  const sign = percent > 0 ? '+' : percent < 0 ? '\u2212' : '';
  return `(${sign}${Math.abs(percent)}%)`;
}

/**
 * Lichess masters-database-style result bar.
 * Segments use display:inline-block with percentage width — the same
 * technique as lichess-org/lila ui/analyse/src/explorer/explorerView.ts.
 * Labels appear inside segments when wide enough.
 */
/**
 * Lichess masters-database-style result bar.
 * Segments use inline-block with percentage widths set via the style attribute.
 * Note: Snabbdom's styleModule is not loaded in this app, so we use
 * attrs.style (string) instead of the style object.
 * Adapted from lichess-org/lila: ui/analyse/src/explorer/explorerView.ts
 */
function renderResultBar(node: { white: number; draws: number; black: number }): VNode {
  const sum = node.white + node.draws + node.black || 1;
  const wPct = (node.white * 100) / sum;
  const dPct = (node.draws * 100) / sum;
  const bPct = (node.black * 100) / sum;
  const wW = Math.round(wPct * 10) / 10;
  const dW = Math.round(dPct * 10) / 10;
  const bW = Math.round(bPct * 10) / 10;
  // Lichess convention: show label if segment > 12%, show '%' if > 20%
  const label = (p: number) => p > 12 ? `${Math.round(p)}${p > 20 ? '%' : ''}` : '';
  return h('div.openings__result-bar', [
    h('span.openings__bar-w', { attrs: { style: `width:${wW}%` } }, label(wPct)),
    h('span.openings__bar-d', { attrs: { style: `width:${dW}%` } }, label(dPct)),
    h('span.openings__bar-b', { attrs: { style: `width:${bW}%` } }, label(bPct)),
  ]);
}

// ========== Sample games panel ==========

function renderSampleGamesPanel(redraw: () => void): VNode {
  const samples = sampleGames(redraw);
  if (_sampleRenderPathKey !== samples.pathKey) {
    _sampleRenderPathKey = samples.pathKey;
    _sampleRenderLimit = SAMPLE_INITIAL_BATCH;
  }

  const title = `Example Games${samples.total > 0 ? ` (${samples.total})` : ''}`;
  if (samples.loading) {
    return h('div.openings__samples', [
      h('h3.openings__samples-title', title),
      renderSampleGamesControls(redraw),
      h('div.openings__samples-empty', 'Loading example games...'),
    ]);
  }

  const games = applySampleGameControls(samples.games);
  if (samples.games.length === 0) {
    return h('div.openings__samples', [
      h('h3.openings__samples-title', title),
      renderSampleGamesControls(redraw),
      h('div.openings__samples-empty', 'No games match this position.'),
    ]);
  }

  if (games.length === 0) {
    return h('div.openings__samples', [
      h('h3.openings__samples-title', title),
      renderSampleGamesControls(redraw),
      h('div.openings__samples-empty', 'No games match the current filters.'),
    ]);
  }

  const visibleGames = games.slice(0, _sampleRenderLimit);
  return h('div.openings__samples', [
    h('h3.openings__samples-title', title),
    renderSampleGamesControls(redraw),
    h('div.openings__samples-list', {
      hook: {
        insert: vnode => bindSampleListScroll(vnode.elm as HTMLElement, games.length, redraw),
        update: vnode => bindSampleListScroll(vnode.elm as HTMLElement, games.length, redraw),
        destroy: vnode => unbindSampleListScroll(vnode.elm as HTMLElement),
      },
    }, visibleGames.map(game => renderSampleGameRow(game, redraw))),
  ]);
}

function renderSampleGamesControls(redraw: () => void): VNode {
  const sort = sampleGamesSortMode();
  const filter = sampleGamesResultFilter();
  const nextFilter = filter === 'all' ? 'wins' : filter === 'wins' ? 'losses' : 'all';
  const filterLabel = filter === 'all' ? 'All' : filter === 'wins' ? 'Wins' : 'Losses';

  return h('div.openings__sample-controls', [
    h('button.openings__speed-chip.openings__sample-control-chip', {
      class: { active: sort === 'recent' },
      attrs: { type: 'button', title: 'Sort example games' },
      on: { click: () => {
        _sampleRenderLimit = SAMPLE_INITIAL_BATCH;
        setSampleGamesSortMode(sort === 'recent' ? 'rating' : 'recent', redraw);
      } },
    }, [
      h('span.openings__speed-icon', { attrs: { 'data-icon': sort === 'recent' ? 'D' : 'R' } }),
      sort === 'recent' ? 'Most recent' : 'Highest rating',
    ]),
    h('button.openings__speed-chip.openings__sample-control-chip', {
      class: { active: filter !== 'all' },
      attrs: { type: 'button', title: 'Filter example games by result' },
      on: { click: () => {
        _sampleRenderLimit = SAMPLE_INITIAL_BATCH;
        setSampleGamesResultFilter(nextFilter, redraw);
      } },
    }, [
      h('span.openings__speed-icon', { attrs: { 'data-icon': filter === 'wins' ? 'W' : filter === 'losses' ? 'L' : 'A' } }),
      filterLabel,
    ]),
  ]);
}

function applySampleGameControls(games: SampleGameMatch[]): SampleGameMatch[] {
  const target = activeCollection()?.target;
  const filter = sampleGamesResultFilter();
  const filtered = filter === 'all'
    ? [...games]
    : games.filter(game => sampleGameOutcomeForTarget(game, target) === (filter === 'wins' ? 'win' : 'loss'));

  if (sampleGamesSortMode() === 'rating') {
    filtered.sort((a, b) => sampleGameSortRating(b, target) - sampleGameSortRating(a, target));
  } else {
    filtered.sort((a, b) => sampleGameDateValue(b) - sampleGameDateValue(a));
  }
  return filtered;
}

function sampleGameDateValue(game: ResearchGame): number {
  if (!game.date) return 0;
  const parsed = Date.parse(game.date.replace(/\./g, '-'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function sampleGameSortRating(game: ResearchGame, target?: string): number {
  const normalizedTarget = target?.trim().toLowerCase();
  if (normalizedTarget) {
    if (game.white?.trim().toLowerCase() === normalizedTarget && game.whiteRating) return game.whiteRating;
    if (game.black?.trim().toLowerCase() === normalizedTarget && game.blackRating) return game.blackRating;
  }
  const ratings = [game.whiteRating, game.blackRating].filter((rating): rating is number => !!rating && rating > 0);
  return ratings.length > 0 ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : 0;
}

function bindSampleListScroll(el: HTMLElement, total: number, redraw: () => void): void {
  const existing = (el as HTMLElement & { _sampleScrollHandler?: EventListener })._sampleScrollHandler;
  if (existing) el.removeEventListener('scroll', existing);

  const handler = () => {
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (remaining > 80 || _sampleRenderLimit >= total) return;
    _sampleRenderLimit = Math.min(total, _sampleRenderLimit + SAMPLE_BATCH_SIZE);
    redraw();
  };

  (el as HTMLElement & { _sampleScrollHandler?: EventListener })._sampleScrollHandler = handler;
  el.addEventListener('scroll', handler, { passive: true });
}

function unbindSampleListScroll(el: HTMLElement): void {
  const existing = (el as HTMLElement & { _sampleScrollHandler?: EventListener })._sampleScrollHandler;
  if (!existing) return;
  el.removeEventListener('scroll', existing);
  delete (el as HTMLElement & { _sampleScrollHandler?: EventListener })._sampleScrollHandler;
}

/** Extract game URL from PGN headers (Site for Lichess, Link for Chess.com). */
function extractGameUrl(pgn: string): string | null {
  // Try [Link "..."] first (Chess.com)
  const linkMatch = pgn.match(/\[Link\s+"([^"]+)"\]/);
  if (linkMatch?.[1]) return linkMatch[1];
  // Try [Site "..."] (Lichess — contains https://lichess.org/...)
  const siteMatch = pgn.match(/\[Site\s+"(https?:\/\/[^"]+)"\]/);
  if (siteMatch?.[1]) return siteMatch[1];
  return null;
}

type SampleGameOutcome = 'win' | 'loss' | 'draw' | null;

function sampleGameOutcomeForTarget(game: ResearchGame, target?: string): SampleGameOutcome {
  const normalizedTarget = target?.trim().toLowerCase();
  if (!normalizedTarget) return null;

  const result = game.result?.trim();
  if (!result || result === '*') return null;
  if (result === '1/2-1/2' || result === '\u00BD-\u00BD') return 'draw';

  const isTargetWhite = game.white?.trim().toLowerCase() === normalizedTarget;
  const isTargetBlack = game.black?.trim().toLowerCase() === normalizedTarget;
  if (!isTargetWhite && !isTargetBlack) return null;

  if ((isTargetWhite && result === '1-0') || (isTargetBlack && result === '0-1')) return 'win';
  if ((isTargetWhite && result === '0-1') || (isTargetBlack && result === '1-0')) return 'loss';
  return null;
}

function renderSampleGameRow(game: SampleGameMatch, redraw: () => void): VNode {
  const result = game.result ?? '*';
  const targetOutcome = sampleGameOutcomeForTarget(game, activeCollection()?.target);
  const info: string[] = [];
  if (game.opening) info.push(game.opening);
  if (game.date) info.push(game.date);
  if (game.timeClass) info.push(game.timeClass);
  const gameUrl = extractGameUrl(game.pgn);
  const collection = activeCollection();
  const analyzeUrl = collection
    ? `#/analysis/research:${encodeURIComponent(collection.id)}:${encodeURIComponent(game.id)}:${sessionPath().length}`
    : null;

  return h('div.openings__sample-row', {
    key: game.id,
    class: { 'openings__sample-row--clickable': !!gameUrl },
    on: gameUrl ? { click: () => window.open(gameUrl, '_blank') } : {},
  }, [
    h('div.openings__sample-players', [
      h('div.openings__sample-player-lines', [
        renderSamplePlayerLine('white', game.white, game.whiteRating),
        renderSamplePlayerLine('black', game.black, game.blackRating),
      ]),
      h('span.openings__sample-result', {
        class: {
          'openings__sample-result--win': targetOutcome === 'win',
          'openings__sample-result--loss': targetOutcome === 'loss',
          'openings__sample-result--draw': targetOutcome === 'draw',
        },
      }, result),
    ]),
    info.length > 0
      ? h('div.openings__sample-info', info.join(' \u00B7 '))
      : null,
    h('div.openings__sample-actions', [
      h('button.openings__sample-copy', {
        attrs: { title: 'Analyze this game' },
        on: { click: (e: Event) => {
          e.stopPropagation();
          if (analyzeUrl) window.open(analyzeUrl, '_blank');
        } },
      }, 'Analyze'),
      gameUrl
        ? renderSampleSourceLink(game, gameUrl, redraw)
        : null,
    ]),
    game.sampleNextMove ? h('span.openings__sample-next-move', game.sampleNextMove) : null,
  ]);
}

function renderSampleSourceLink(game: SampleGameMatch, gameUrl: string, redraw: () => void): VNode {
  const label = game.source === 'chesscom' ? 'Chess.com' : 'Lichess';
  return h('span.openings__sample-link-wrap', [
    h('a.openings__sample-link', {
      attrs: {
        href: gameUrl,
        target: '_blank',
        rel: 'noopener',
        title: `View on ${label}`,
      },
      on: {
        click: (event: Event) => event.stopPropagation(),
        mouseenter: (event: MouseEvent) => scheduleSamplePreview(game, event.currentTarget as HTMLElement, redraw),
        mouseleave: () => clearSamplePreview(redraw),
      },
    }, label),
    _samplePreviewGameId === game.id && _samplePreviewFen
      ? renderSamplePreviewBoard(_samplePreviewFen)
      : null,
  ]);
}

function scheduleSamplePreview(game: SampleGameMatch, anchor: HTMLElement, redraw: () => void): void {
  clearSamplePreviewTimer();
  const rect = anchor.getBoundingClientRect();
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - SAMPLE_PREVIEW_SIZE - 8));
  const above = rect.top >= SAMPLE_PREVIEW_SIZE + 12;
  const top = above ? rect.top - SAMPLE_PREVIEW_SIZE - 8 : Math.min(rect.bottom + 8, window.innerHeight - SAMPLE_PREVIEW_SIZE - 8);
  _samplePreviewStyle = `left:${left}px;top:${Math.max(8, top)}px;width:${SAMPLE_PREVIEW_SIZE}px;height:${SAMPLE_PREVIEW_SIZE}px;`;
  _samplePreviewTimer = setTimeout(() => {
    const cacheKey = game.id;
    const cached = _sampleFinalFenCache.has(cacheKey) ? _sampleFinalFenCache.get(cacheKey)! : computeFinalFen(game.pgn);
    if (!_sampleFinalFenCache.has(cacheKey)) _sampleFinalFenCache.set(cacheKey, cached);
    if (!cached) return;
    _samplePreviewGameId = game.id;
    _samplePreviewFen = cached;
    redraw();
  }, 200);
}

function clearSamplePreview(redraw: () => void): void {
  clearSamplePreviewTimer();
  _samplePreviewGameId = null;
  _samplePreviewFen = null;
  redraw();
}

function clearSamplePreviewTimer(): void {
  if (_samplePreviewTimer !== null) clearTimeout(_samplePreviewTimer);
  _samplePreviewTimer = null;
}

function renderSamplePreviewBoard(fen: string): VNode {
  const config = {
    fen,
    orientation: boardOrientation(),
    coordinates: false,
    viewOnly: true,
    movable: { free: false },
    drawable: { enabled: false, visible: false },
  };
  return h('div.openings__sample-preview', {
    attrs: { style: _samplePreviewStyle },
  }, [
    h('div.openings__sample-preview-board.cg-wrap.is2d', {
      hook: {
        insert: (vnode: VNode) => ((vnode.elm as HTMLElement & { _cg?: CgApi })._cg = makeChessground(vnode.elm as HTMLElement, config)),
        update: (old: VNode, vnode: VNode) => {
          const cg = (old.elm as HTMLElement & { _cg?: CgApi })._cg;
          if (cg) {
            (vnode.elm as HTMLElement & { _cg?: CgApi })._cg = cg;
            cg.set(config);
          }
        },
        destroy: (vnode: VNode) => (vnode.elm as HTMLElement & { _cg?: CgApi })._cg?.destroy(),
      },
    }),
  ]);
}

function computeFinalFen(pgn: string): string | null {
  try {
    const parsed = parsePgn(pgn);
    const game = parsed[0];
    if (!game) return null;
    const setup = startingPosition(game.headers);
    if (setup.isErr) return null;
    const pos = setup.value;
    let node = game.moves.children[0];
    while (node) {
      const move = parseSan(pos, node.data.san);
      if (!move) return null;
      makeSanAndPlay(pos, move);
      node = node.children[0];
    }
    return makeFen(pos.toSetup());
  } catch {
    return null;
  }
}

function renderSamplePlayerLine(color: 'white' | 'black', name: string | undefined, rating: number | undefined): VNode {
  return h('div.openings__sample-player-line', [
    h(`span.openings__sample-color-icon.openings__sample-color-icon--${color}`),
    h('span.openings__sample-player-name', [
      name || '?',
      rating && rating > 0 ? ` (${rating})` : '',
    ]),
  ]);
}

function extractLichessUrl(pgn: string): string {
  const site = pgn.match(/\[Site\s+"([^"]+)"]/)?.[1];
  return site && site.includes('lichess.org') ? site : '#';
}

function renderExplorerToggle(node: OpeningTreeNode | null, redraw: () => void): VNode | null {
  if (!explorerCtrl.enabled) return null;
  const host: OpeningTreeExplorerHost = {
    board: () => _openingsCg,
    getCurrentFen: currentOpeningsBoardFen,
    restoreAutoShapes: restoreOpeningsExplorerAutoShapes,
    clearAutoShapesHash: clearOpeningsAutoShapesHash,
    playMove: playOpeningsExplorerMove,
    syncBoard: syncOpeningsBoard,
  };
  return h('div.openings__explorer', [
    renderExplorerDbTabs(node, redraw, host),
    explorerCtrl.configOpen ? renderExplorerConfigPanel(redraw) : renderExplorerPanel(node, redraw, host),
  ]);
}
