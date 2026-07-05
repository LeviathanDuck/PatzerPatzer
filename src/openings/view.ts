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
import type { TreeComment, TreeNode } from '../tree/types';
import { nagToGlyph } from '../tree/pgn';
import { accountSection, updateAccount, type ChessAccount, type AccountSection, type AccountCategory } from '../accounts';
import { deleteImportedAccountAndGames } from '../sync/dataManagement';
import { computeAccountCardStats, PRIMARY_CARD_SPEEDS, type AccountCardStats, type AccountSpeedStat } from './accountCardStats';
import {
  collections, collectionsLoaded, loadSavedCollections,
  registryAccounts, accountsLoaded, loadRegistryAccounts, openAccountResearch,
  refreshRegistryAccounts, invalidateImportedSpeeds, getImportedSpeedsForAccount,
  openingsPage, activeCollection, activeGames, sessionNode, sessionPath, openingTree, sampleGames,
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
  resetImport, activeTool, setActiveTool, getCollectionSummary, getPrepReportViewModel,
  getStyleViewModel,
  practiceSession, startPractice, stopPractice,
  recordPracticeMove, setPracticeOpponentSource,
  deviationResults, deviationLoading, deviationProgress, deviationTotal,
  startDeviationScan, recencyMode, setRecencyMode,
} from './ctrl';
import { planOpponentTurn } from './practice';
import type { OpeningsTool } from './types';
import {
  SPEED_OPTIONS, DATE_RANGE_OPTIONS,
  importFilters,
  currentImportDateRangeConfig, importSyncFilterKey,
  type ImportSpeed, type ImportDateRange,
} from '../import/filters';
import { syncAccountGamesWithBackfill, peekAccountSync, type AccountSyncWithBackfillResult } from '../import/accountSync';
import { fetchChesscomSpeedTotals } from '../import/chesscom';
import { fetchLichessSpeedTotals } from '../import/lichess';
import type { ResearchCollection, ResearchGame, ResearchSource } from './types';
import type { OpeningTreeNode, SampleGameMatch } from './tree';
import { executeResearchImport } from './import';
import {
  ExplorerBookAuthError,
  isExplorerBookAuthError,
  type OpeningMoveStats,
  type ExplorerDb,
  type TablebaseData,
  type TablebaseMoveStats,
  type TablebaseCategory,
  openingDataHasMove,
} from './explorer';
import { explorerCtrl, MAX_EXPLORER_DEPTH } from './explorerCtrl';
import { ALL_SPEEDS, ALL_RATINGS, ALL_MODES } from './explorerConfig';
import { reportIssue } from '../diagnostics/reporting/reportAction';
import { renderCeval, renderPvBox, renderEngineSettings, setCevalPositionOverride } from '../ceval/view';
import { renderMoveNavBar } from '../analyse/analysisControls';
import {
  engineEnabled, evalCurrentPosition, currentEval,
  buildEngineArrowShapes,
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
import { playMoveWithDelay, cancelPlayMove } from '../engine/playMove';
import { STRENGTH_LEVELS } from '../engine/types';
import { renderStrengthSelector } from '../engine/strengthView';
import { setPlayStrengthLevel, getPlayStrengthLevel } from '../engine/ctrl';
import {
  contextFromRootAndMoves,
  fenOnlyPositionContext,
  type EnginePositionContext,
} from '../engine/positionContext';
import {
  computeOpponentRepertoireProfile, computePrepReport, computePrepReportLines,
  computeLikelyLineModule, computeWeaknessModule, computePrepNotes,
  computeTerminationProfile, computeGameLengthProfile,
  computeOpeningRecommendations, buildPracticeCandidates,
  MIN_COLLECTION_SIZE, MIN_RELIABLE_SAMPLE, isCollectionSmall, isStatReliable,
  type PrepLine, type LikelyLineEntry, type StyleViewModel,
} from './analytics';
import { detectTrapPatterns } from './traps';
import { saveOrpLineToLibrary } from '../study/saveAction';
import {
  repertoireSources,
  repertoireSourcesLoaded,
  repertoireSourcesError,
  loadRepertoireSources,
  setRepertoireSourceEnabled,
  ensureRepertoireAccountSourceBuilds,
} from '../study/studyCtrl';
import {
  buildRepertoireExplorerModel,
  repertoireSourceSideBadge,
  type RepertoireExplorerLinePosition,
  type RepertoireExplorerPositionAnnotation,
  type RepertoireExplorerPriorMatch,
  type RepertoireExplorerSourceGroup,
} from '../repertoire/explorerViewModel';
import { isAccountRepertoireSource, repertoireAccountFilterSummary } from '../repertoire';
import { buildRepertoireArrowShapes } from '../repertoire/arrowShapes';
import { clearLichessApiLoginData, requestBookLogin } from '../auth/lichessBookAuth';
import {
  markNav, currentGenerationToken, isGenerationCurrent, onSettle, isRapid,
} from './scheduler';

let _openingsCg: CgApi | undefined;
let _lastOpeningsAutoShapesHash: string | null = null;




let _showTreeArrows: boolean = true;
function showTreeArrows(): boolean { return _showTreeArrows; }
function toggleTreeArrows(): void { _showTreeArrows = !_showTreeArrows; }
let _lastBoardFen: string = '';
let _lastBoardPractice: boolean = false;
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

function practicePlayPositionContext(
  session: NonNullable<ReturnType<typeof practiceSession>>,
  node: OpeningTreeNode,
): EnginePositionContext {
  return contextFromRootAndMoves({
    initialFen: session.startFen,
    moves: session.moveHistory,
    currentFen: node.fen,
    surface: 'opening-practice-play',
    path: session.moveHistory.join('/'),
  });
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
const _accountSyncMessages = new Map<string, string>();
const _accountSyncErrors = new Map<string, string>();


const _accountCardStats = new Map<string, AccountCardStats>();
const _accountCardStatsLoading = new Set<string>();
const _accountCardStatsError = new Set<string>();
let _bookAuthNotice = '';
let _repertoireExplorerNotice = '';
let _expandedRepertoireAnnotationKey: string | null = null;

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
      h('h1.openings__title', 'Opponent Research'),
    ]),
    h('div.openings__body', [
      h('div.openings__loading', 'Restoring opening tree\u2026'),
    ]),
  ]);
}

// ========== Library page ==========

function renderLibraryPage(redraw: () => void): VNode {
  if (!collectionsLoaded()) {
    void loadSavedCollections(redraw);
    return h('div.openings', [
      h('div.openings__header', [
        h('h1.openings__title', 'Opponent Research'),
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
      h('h1.openings__title', 'Opponent Research'),
      step === 'idle'
        ? h('button.openings__new-btn', {
            on: { click: () => { setImportStep('details'); redraw(); } },
          }, 'New Research')
        : null,
    ]),
    renderRouteRecoveryBanner(),
    step !== 'idle'
      ? renderImportWorkflow(redraw)
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
  _accountSyncMessages.delete(account.id);
  _accountSyncErrors.delete(account.id);
  redraw();
  try {
    const result: AccountSyncWithBackfillResult = await syncAccountGamesWithBackfill(account, {
      rated: importFilters.rated,
      speeds: importFilters.speeds,
      syncDateRange: currentImportDateRangeConfig(),
      backfillTargetStartMs: syncBackfillTargetStartMs(),
      onProgress: count => {
        _accountSyncMessages.set(account.id, `Fetched ${count} game${count === 1 ? '' : 's'}...`);
        redraw();
      },
      ...(needsFallback ? { fallbackDateRange: currentImportDateRangeConfig() } : {}),
    });
    invalidateImportedSpeeds(account.id);
    resetAccountPeek(account.id);
    const refreshedAccounts = await refreshRegistryAccounts(redraw);
    const refreshedAccount = refreshedAccounts.find(a => a.id === account.id) ?? account;
    if (activeCollection()?.id === `account:${account.id}`) {
      await openAccountResearch(refreshedAccount, redraw);
    }
    const olderAdded = result.older?.addedCount ?? 0;
    _accountSyncMessages.set(account.id, result.addedCount === 0
      ? 'No new games to import'
      : `Imported ${result.addedCount} new game${result.addedCount === 1 ? '' : 's'}${
          olderAdded > 0 ? ` (${olderAdded} older)` : ''}`);
  } catch (err) {
    _accountSyncErrors.set(account.id, err instanceof Error ? err.message : 'Sync failed.');
  } finally {
    _accountSyncRunningId = null;
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
  return h('div.openings__preload-sync', [
    h('div.openings__preload-sync-row', [
      h('span.openings__preload-sync-date', `Last synced ${formatLongSyncDate(account.lastSyncedAt)}`),
      h('button.openings__preload-sync-refresh', {
        attrs: { type: 'button', title: 'Check for new games' },
        on: { click: (e: Event) => { e.stopPropagation(); resetAccountPeek(account.id); redraw(); } },
      }, '⟳'),
      h('button.openings__preload-sync-btn', {
        attrs: { type: 'button', disabled: _accountSyncRunningId !== null },
        on: { click: (e: Event) => { e.stopPropagation(); void startAccountSync(account, redraw); } },
      }, running ? 'Syncing…' : 'Sync'),
    ]),
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
          void openAccountResearch(account, redraw);
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
    h('h2.openings__empty-title', 'Opponent Research'),
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
      h('span', 'New Opponent Research'),
      h('button.header__panel-btn.--ghost', {
        on: { click: () => { resetImport(); redraw(); } },
      }, 'Cancel'),
    ]),
    step === 'details' ? renderDetailsStep(redraw) : null,
  ]);
}


let _researchTotals: Partial<Record<ImportSpeed, number>> | null = null;
let _researchTotalsLoading = false;
let _researchTotalsKey = '';
let _researchTotalsGen = 0;
let _researchTotalsTimer: ReturnType<typeof setTimeout> | null = null;






function ensureResearchTotals(redraw: () => void): void {
  const src = importSource();
  const username = importUsername().trim();
  if (src === 'pgn' || !username) {
    _researchTotalsKey = '';
    _researchTotals = null;
    _researchTotalsLoading = false;
    return;
  }
  const key = `${src}|${username.toLowerCase()}`;
  if (_researchTotalsKey === key) return;
  _researchTotalsKey = key;
  _researchTotals = null;
  _researchTotalsLoading = true;
  const gen = ++_researchTotalsGen;
  if (_researchTotalsTimer !== null) clearTimeout(_researchTotalsTimer);
  _researchTotalsTimer = setTimeout(() => {
    _researchTotalsTimer = null;
    const fetchTotals = src === 'chesscom' ? fetchChesscomSpeedTotals : fetchLichessSpeedTotals;
    void fetchTotals(username)
      .then(totals => {
        if (_researchTotalsGen !== gen) return;
        _researchTotals = totals;
        _researchTotalsLoading = false;
        redraw();
      })
      .catch(() => {
        if (_researchTotalsGen !== gen) return;
        _researchTotalsLoading = false;
        redraw();
      });
  }, 400);
}

function renderDetailsStep(redraw: () => void): VNode {
  const src = importSource();
  const color = importColor();
  const err = importError();
  const speeds = importSpeeds();
  const dateRange = importDateRange();
  ensureResearchTotals(redraw);
  const researchTotalsSum = _researchTotals
    ? Object.values(_researchTotals).reduce((sum, n) => sum + (n ?? 0), 0)
    : 0;

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
        on: { input: (e: Event) => { setImportUsername((e.target as HTMLInputElement).value); redraw(); } },
        hook: { insert: vnode => focusUsernameInput(vnode.elm as Element | undefined) },
      }),
    ]) : h('div.header__panel-section', [
      h('div.header__panel-label', 'Paste PGN or upload file'),
      h('textarea.header__pgn-input', {
        attrs: { placeholder: 'Paste PGN text here\u2026', rows: '6' },
        on: { input: (e: Event) => { setImportUsername((e.target as HTMLTextAreaElement).value); redraw(); } },
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
      _researchTotalsLoading ? h('p.header__panel-hint', 'Checking games…') : null,
      h('div.header__panel-row', [
        h('button.header__pill', {
          class: { active: speeds.size === 0 },
          on: { click: () => { setImportSpeeds(new Set()); redraw(); } },
        }, _researchTotals && researchTotalsSum > 0 ? `All · ${researchTotalsSum.toLocaleString()}` : 'All'),
        ...SPEED_OPTIONS.map(({ value, label, icon }) => {
          const total = _researchTotals?.[value];
          return h('button.header__pill', {
            class: { active: speeds.has(value) },
            attrs: { 'data-icon': icon },
            on: { click: () => {
              const s = new Set(speeds);
              s.has(value) ? s.delete(value) : s.add(value);
              setImportSpeeds(s);
              redraw();
            } },
          }, total !== undefined ? `${label} · ${total.toLocaleString()}` : label);
        }),
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
        attrs: { title: 'Report an issue with the Opponent Research page' },
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

// Tool rail icon codepoints — Adapted from lichess-org/lila: ui/lib/src/licon.ts
const ICON_BRANCH    = '\ue003'; // licon.Branch     → Opening Tree (branching variations)
const ICON_BOOK      = '\ue03b'; // licon.Book       → Opponent's Repertoire
const ICON_BAR_GRAPH = '\ue03c'; // licon.BarGraph   → Prep Report
const ICON_EYE       = '\ue054'; // licon.Eye        → Style
const ICON_SWORDS    = '\ue033'; // licon.Swords     → Practice Against Them

export interface OpeningsToolDef { id: OpeningsTool; label: string; icon: string }

export const OPENINGS_TOOL_DEFS: OpeningsToolDef[] = [
  { id: 'opening-tree',         label: 'Tree',                  icon: ICON_BRANCH },
  { id: 'opponent-repertoire',  label: "Opponent's Repertoire", icon: ICON_BOOK },
  { id: 'prep-report',          label: 'Report',                icon: ICON_BAR_GRAPH },
  { id: 'style',                label: 'Style',                 icon: ICON_EYE },
  { id: 'practice',             label: 'Practice',              icon: ICON_SWORDS },
];

/**
 * Persistent left tool rail for the openings session.
 * Switching tools updates activeTool() without leaving the current collection context.
 */
function renderToolRail(redraw: () => void): VNode {
  const current = activeTool();
  return h('nav.openings__tool-rail', OPENINGS_TOOL_DEFS.map(def =>
    h('button.openings__tool-rail-btn', {
      class: { 'openings__tool-rail-btn--active': current === def.id },
      attrs: { title: def.label },
      on: { click: () => { setActiveTool(def.id); redraw(); } },
    }, [
      h('span.openings__tool-rail-icon', { attrs: { 'data-icon': def.icon } }),
      h('span.openings__tool-rail-label', def.label),
    ]),
  ));
}

const TOOL_NAMES: Record<OpeningsTool, string> = {
  'opening-tree':         'Opening Tree',
  'opponent-repertoire':  "Opponent's Repertoire",
  'prep-report':          'Prep Report',
  'style':                'Style',
  'practice':             'Practice Against Them',
};

/**
 * Placeholder for tools not yet implemented.
 * Spans the full content area (board + panel columns) via grid-column in CSS.
 */
function renderToolPlaceholder(tool: OpeningsTool): VNode {
  return h('div.openings__tool-content.openings__tool-content--placeholder', [
    h('div.openings__tool-placeholder-inner', [
      h('h3', TOOL_NAMES[tool]),
      h('p', 'This tool is coming soon.'),
    ]),
  ]);
}

/**
 * High-signal opponent-repertoire overview strip.
 * Shows opponent W/D/L, opponent-repertoire breadth, and recency from the analytics cache.
 * Returns null if analytics are not yet available (tree still building).
 */
function renderOpponentRepertoireOverview(collection: ResearchCollection): VNode | null {
  const summary = getCollectionSummary();
  if (!summary) return null;

  const tree    = openingTree();
  const profile = computeOpponentRepertoireProfile(collection.games, tree, collection.target ?? '');
  const report  = computePrepReport(collection.games, collection.target ?? '', summary);

  const wdl   = report.overall;
  const total = wdl.total || 1;
  const wPct  = (wdl.wins   / total * 100).toFixed(0);
  const dPct  = (wdl.draws  / total * 100).toFixed(0);
  const lPct  = (wdl.losses / total * 100).toFixed(0);

  // Breadth label based on normalized entropy
  let breadthLabel: string;
  if (profile.distinctFirstMoves <= 1)       breadthLabel = 'Single line';
  else if (profile.normalizedEntropy < 0.35) breadthLabel = 'Narrow';
  else if (profile.normalizedEntropy < 0.65) breadthLabel = 'Moderate';
  else                                        breadthLabel = 'Broad';

  const recentGames = summary.recency.last90;

  return h('div.openings__opponent-repertoire-overview', [
    // W/D/L bar
    h('div.openings__overview-wdl', [
      h('div.openings__overview-wdl-bar', [
        h('span.wdl-w', { attrs: { style: `width:${wPct}%` } }, wdl.wins > 0 ? `${wPct}%` : ''),
        h('span.wdl-d', { attrs: { style: `width:${dPct}%` } }, wdl.draws > 0 ? `${dPct}%` : ''),
        h('span.wdl-l', { attrs: { style: `width:${lPct}%` } }, wdl.losses > 0 ? `${lPct}%` : ''),
      ]),
      h('div.openings__overview-wdl-counts', [
        h('span.wdl-w', `${wdl.wins}W`),
        h('span.wdl-d', `${wdl.draws}D`),
        h('span.wdl-l', `${wdl.losses}L`),
      ]),
    ]),
    // Quick stats row
    h('div.openings__overview-stats', [
      h('div.openings__overview-stat', [
        h('span.openings__overview-stat-label', "Opponent's Repertoire"),
        h('span.openings__overview-stat-value', breadthLabel),
      ]),
      h('div.openings__overview-stat', [
        h('span.openings__overview-stat-label', 'Openings'),
        h('span.openings__overview-stat-value', `${profile.distinctEcos}`),
      ]),
      h('div.openings__overview-stat', [
        h('span.openings__overview-stat-label', 'Last 90d'),
        h('span.openings__overview-stat-value', `${recentGames}`),
      ]),
    ]),
    profile.isSampleSmall
      ? h('div.openings__overview-caveat', `Small sample (${summary.totalGames} games) — stats are estimates`)
      : null,
  ]);
}

const SPEED_LABELS: Record<string, string> = {
  bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid', classical: 'Classical',
};

/**
 * Opponent-repertoire summary modules: perspective split and time-control breakdown.
 * Speed cards are clickable to filter the session to that time control.
 * All data from cached CollectionSummary — no additional computation.
 */
function renderOpponentRepertoireSummaryModules(redraw: () => void): VNode | null {
  const summary = getCollectionSummary();
  if (!summary) return null;

  const activeSpeeds = speedFilter();

  function miniWdlBar(wdl: { wins: number; draws: number; losses: number; total: number }): VNode {
    const t = wdl.total || 1;
    const wP = (wdl.wins   / t * 100).toFixed(0);
    const dP = (wdl.draws  / t * 100).toFixed(0);
    const lP = (wdl.losses / t * 100).toFixed(0);
    return h('div.openings__mini-wdl', [
      h('span.wdl-w', { attrs: { style: `width:${wP}%` } }),
      h('span.wdl-d', { attrs: { style: `width:${dP}%` } }),
      h('span.wdl-l', { attrs: { style: `width:${lP}%` } }),
    ]);
  }

  // Perspective split
  const perspSection = h('div.openings__sum-section', [
    h('div.openings__sum-title', 'By Color'),
    h('div.openings__sum-perspective', [
      h('div.openings__sum-color', [
        h('span.openings__sum-color-dot.white-dot', '○'),
        h('span', `White: ${summary.asWhite.total}`),
        summary.asWhite.total > 0 ? miniWdlBar(summary.asWhite) : null,
      ]),
      h('div.openings__sum-color', [
        h('span.openings__sum-color-dot.black-dot', '●'),
        h('span', `Black: ${summary.asBlack.total}`),
        summary.asBlack.total > 0 ? miniWdlBar(summary.asBlack) : null,
      ]),
    ]),
  ]);

  // Time control cards
  const topSpeeds = summary.bySpeed.slice(0, 4);
  const speedSection = topSpeeds.length > 0 ? h('div.openings__sum-section', [
    h('div.openings__sum-title', 'By Time Control'),
    h('div.openings__sum-speeds', topSpeeds.map(sp => {
      const isActive = activeSpeeds.has(sp.timeClass);
      return h('button.openings__sum-speed-card', {
        class: { 'openings__sum-speed-card--active': isActive },
        attrs: { title: isActive ? 'Remove filter' : `Filter to ${sp.timeClass}` },
        on: { click: () => {
          const next = new Set(activeSpeeds as Set<string>);
          if (isActive) next.delete(sp.timeClass);
          else          next.add(sp.timeClass);
          setSpeedFilter(next as Set<string>, redraw);
          redraw();
        } },
      }, [
        h('span.openings__sum-speed-name', SPEED_LABELS[sp.timeClass] ?? sp.timeClass),
        h('span.openings__sum-speed-count', `${sp.wdl.total}`),
        miniWdlBar(sp.wdl),
      ]);
    })),
  ]) : null;

  // Recency row
  const recencySection = h('div.openings__sum-section', [
    h('div.openings__sum-title', 'Recency'),
    h('div.openings__sum-recency', [
      h('span', `30d: ${summary.recency.last30}`),
      h('span', `90d: ${summary.recency.last90}`),
      h('span', `1yr: ${summary.recency.last365}`),
    ]),
  ]);

  return h('div.openings__opponent-repertoire-summary', [
    perspSection,
    speedSection,
    recencySection,
  ]);
}

/**
 * Interactive line-insight cards for the Opponent's Repertoire panel.
 * Cards are derived from PrepReportLines (Phase 3 analytics) and are clickable
 * to navigate the board/tree to the target branch position.
 */
function renderLineInsightCards(redraw: () => void): VNode | null {
  const tree = openingTree();
  if (!tree) return null;

  const perspective = colorFilter();
  const lines = computePrepReportLines(tree, perspective, 8);

  const hasAny = lines.likelyLines.length > 0;
  if (!hasAny) return null;

  function renderLineCard(line: PrepLine, onClick: () => void): VNode {
    const moveSan = line.sans.slice(0, 4).join(' ') + (line.sans.length > 4 ? '…' : '');
    const winPct  = (line.opponentWinPct * 100).toFixed(0);
    return h('button.openings__insight-card', { on: { click: onClick } }, [
      h('span.openings__insight-moves', moveSan),
      h('span.openings__insight-meta', [
        h('span.openings__insight-freq', `${line.frequency}g`),
        line.isReliable
          ? h('span.openings__insight-pct', `${winPct}%W`)
          : null,
      ]),
    ]);
  }

  function navTo(line: PrepLine): void {
    navigateToPath(line.moves);
    syncOpeningsBoard(redraw);
    redraw();
  }

  const sections: VNode[] = [];

  if (lines.likelyLines.length > 0) {
    sections.push(h('div.openings__insight-group', [
      h('div.openings__insight-group-label', 'Most Played'),
      ...lines.likelyLines.slice(0, 2).map(l => renderLineCard(l, () => navTo(l))),
    ]));
  }

  if (lines.strongLines.length > 0) {
    sections.push(h('div.openings__insight-group', [
      h('div.openings__insight-group-label', 'Strong Lines'),
      ...lines.strongLines.slice(0, 2).map(l => renderLineCard(l, () => navTo(l))),
    ]));
  }

  if (lines.weakLines.length > 0) {
    sections.push(h('div.openings__insight-group', [
      h('div.openings__insight-group-label', 'Weak Scoring'),
      ...lines.weakLines.slice(0, 2).map(l => renderLineCard(l, () => navTo(l))),
    ]));
  }

  if (lines.freshLines.length > 0) {
    sections.push(h('div.openings__insight-group', [
      h('div.openings__insight-group-label', 'Recent Additions'),
      ...lines.freshLines.slice(0, 2).map(l => renderLineCard(l, () => navTo(l))),
    ]));
  }

  if (sections.length === 0) return null;

  return h('div.openings__line-insights', [
    h('div.openings__insights-header', 'Line Insights'),
    ...sections,
  ]);
}

/**
 * Prep Report tool — full-page opponent dossier.
 * Spans both board and panel columns (grid-column: 2 / -1) via openings__tool-content.
 * Answers: what to prepare, what to avoid, what to expect.
 */
function renderPrepReportTool(redraw: () => void): VNode {
  const collection = activeCollection();
  const vm = getPrepReportViewModel();

  // Loading state — tree still building
  if (!vm || !collection) {
    return h('div.openings__tool-content', [
      renderFilterBadge(redraw),
      h('div.openings__prep-report', [
        h('div.openings__pr-header', [
          h('span.openings__pr-label', 'Prep Report'),
          collection ? h('span.openings__pr-context', collection.target) : null,
        ]),
        treeBuilding()
          ? h('div.openings__pr-loading', 'Building tree\u2026')
          : h('div.openings__pr-loading', 'Open a collection to see the Prep Report.'),
      ]),
    ]);
  }

  const { summary, report, lines } = vm;
  const total = summary.overall.total || 1;
  const isSparse = isCollectionSmall(summary.overall.total);
  const wPct = (summary.overall.wins   / total * 100).toFixed(0);
  const dPct = (summary.overall.draws  / total * 100).toFixed(0);
  const lPct = (summary.overall.losses / total * 100).toFixed(0);

  // Likely lines (recency-weighted)
  const colorPerspective = colorFilter();
  const likelyModule = computeLikelyLineModule(openingTree(), colorPerspective, 8, 8, recencyMode());

  // Weakness module
  const tree = openingTree();
  const profile = computeOpponentRepertoireProfile(collection.games, tree, collection.target ?? '');
  const weaknessModule = computeWeaknessModule(lines, summary.overall.total);

  // Prep notes
  const notes = computePrepNotes(summary, profile, lines);

  function navToLine(line: PrepLine): void {
    navigateToPath(line.moves);
    setActiveTool('opening-tree');
    redraw();
  }

  // Likely-line row: shows recency boost badge when line was played within 90 days.
  function renderLikelyLineRow(line: LikelyLineEntry, onClick: () => void): VNode {
    const moveSan = line.sans.slice(0, 5).join(' ') + (line.sans.length > 5 ? '\u2026' : '');
    const boostRecent  = line.recencyBoost >= 2.0;  // ≤30d
    const boostFresh   = line.recencyBoost >= 1.5 && line.recencyBoost < 2.0;  // ≤90d
    return h('button.openings__pr-line-row', {
      class: { 'openings__pr-unreliable': !isStatReliable(line.frequency) },
      attrs: { title: "Open in Opponent's Repertoire" },
      on: { click: onClick },
    }, [
      h('span.openings__pr-line-moves', moveSan),
      h('span.openings__pr-line-meta', [
        h('span.openings__pr-line-freq', `${line.frequency}g`),
        boostRecent
          ? h('span.openings__pr-boost-badge.openings__pr-boost--hot', '\u2191 now')
          : boostFresh
            ? h('span.openings__pr-boost-badge.openings__pr-boost--fresh', '\u2191 recent')
            : null,
        !line.isReliable ? h('span.openings__pr-line-caveat', `n=${line.frequency}`) : null,
      ]),
      h('span.openings__pr-line-nav', '\u2192'),
    ]);
  }

  // Target-line row: shows opponent's poor win % as the "why to aim here" signal.
  function renderTargetLineRow(line: PrepLine, onClick: () => void): VNode {
    const moveSan    = line.sans.slice(0, 5).join(' ') + (line.sans.length > 5 ? '\u2026' : '');
    const oppWinPct  = (line.opponentWinPct * 100).toFixed(0);
    return h('button.openings__pr-target-row', {
      class: { 'openings__pr-unreliable': !isStatReliable(line.frequency) },
      attrs: { title: "Open in Opponent's Repertoire" },
      on: { click: onClick },
    }, [
      h('span.openings__pr-line-moves', moveSan),
      h('span.openings__pr-line-meta', [
        h('span.openings__pr-line-freq', `${line.frequency}g`),
        h('span.openings__pr-target-score', `opp ${oppWinPct}%W (n=${line.frequency})`),
        line.isRecent ? h('span.openings__pr-line-recent', 'recent') : null,
      ]),
      h('span.openings__pr-line-nav', '\u2192'),
    ]);
  }

  return h('div.openings__tool-content', [
    renderFilterBadge(redraw),
    h('div.openings__prep-report', [

      // Header with recency toggle
      h('div.openings__pr-header', [
        h('span.openings__pr-label', 'Prep Report'),
        h('span.openings__pr-context', `${collection.target} · ${summary.totalGames} games`),
        h('div.openings__pr-recency-toggle', [
          h('button', {
            class: { 'openings__pr-recency-btn': true, active: recencyMode() === 'recent' },
            on: { click: () => { setRecencyMode('recent'); redraw(); } },
          }, 'Recent first'),
          h('button', {
            class: { 'openings__pr-recency-btn': true, active: recencyMode() === 'all-time' },
            on: { click: () => { setRecencyMode('all-time'); redraw(); } },
          }, 'All time'),
        ]),
      ]),

      // Auto-fallback notice when recent data is too sparse
      recencyMode() === 'recent' && summary.recency.last90 < 10
        ? h('div.openings__pr-sparse-banner', '\u26A0 Fewer than 10 games in the last 90 days — showing all-time data.')
        : null,

      // Small-sample warning banner
      isSparse ? h('div.openings__pr-sparse-banner', `\u26A0 Small sample (n=${summary.overall.total}) — statistics may not be reliable with fewer than ${MIN_COLLECTION_SIZE} games.`) : null,

      // Prep notes strip
      notes.length > 0 ? h('div.openings__pr-notes', notes.map(note =>
        h('div.openings__pr-note', {
          class: { 'openings__pr-note--low': note.confidence === 'low' },
        }, [
          h('span.openings__pr-note-title', note.title),
          h('span.openings__pr-note-body',  note.body),
        ])
      )) : null,

      // Overview: W/D/L bar + quick stats
      h('div.openings__pr-overview', [
        h('div.openings__pr-wdl', [
          h('div.openings__pr-wdl-bar', {
            class: { 'openings__pr-unreliable': !isStatReliable(summary.overall.total) },
          }, [
            h('span.wdl-w', { attrs: { style: `width:${wPct}%` } }, summary.overall.wins > 0   ? `${wPct}%` : ''),
            h('span.wdl-d', { attrs: { style: `width:${dPct}%` } }, summary.overall.draws > 0  ? `${dPct}%` : ''),
            h('span.wdl-l', { attrs: { style: `width:${lPct}%` } }, summary.overall.losses > 0 ? `${lPct}%` : ''),
          ]),
          h('div.openings__pr-wdl-counts', [
            h('span.wdl-w', `${summary.overall.wins}W`),
            h('span.wdl-d', `${summary.overall.draws}D`),
            h('span.wdl-l', `${summary.overall.losses}L`),
            h('span.openings__pr-sample', `n=${summary.overall.total}`),
          ]),
        ]),
        // Top openings
        report.topEcos.length > 0 ? h('div.openings__pr-ecos', [
          h('div.openings__pr-section-title', 'Top Openings'),
          ...report.topEcos.slice(0, 5).map(eco =>
            h('div.openings__pr-eco-row', {
              class: { 'openings__pr-unreliable': !isStatReliable(eco.count) },
            }, [
              h('span.openings__pr-eco-name', eco.opening),
              h('span.openings__pr-eco-count', `${eco.count}g`),
              h('span.openings__pr-eco-pct', `${Math.round(eco.count / total * 100)}%`),
              h('span.openings__pr-sample', `n=${eco.count}`),
            ])
          ),
        ]) : null,
      ]),

      // Two-column section grid: likely lines + target lines
      h('div.openings__pr-columns', [

        // Likely lines column — what the opponent is most likely to play
        h('div.openings__pr-col', [
          h('div.openings__pr-section-title', [
            'Likely Lines',
            h('span.openings__pr-section-hint', ' — expect these'),
          ]),
          likelyModule.lines.length > 0
            ? h('div.openings__pr-lines', likelyModule.lines.slice(0, 6).map(l =>
                renderLikelyLineRow(l, () => navToLine(l))
              ))
            : h('div.openings__pr-empty', 'Not enough data.'),
          !likelyModule.hasSufficientData
            ? h('div.openings__pr-caveat', 'Small sample — estimates are rough.')
            : null,
        ]),

        // Target lines column — lines to steer toward where opponent underperforms
        h('div.openings__pr-col', [
          h('div.openings__pr-section-title', [
            'Target Lines',
            h('span.openings__pr-section-hint', ' — steer here'),
          ]),
          lines.weakLines.length > 0
            ? h('div.openings__pr-lines', lines.weakLines.slice(0, 6).map(l =>
                renderTargetLineRow(l, () => navToLine(l))
              ))
            : h('div.openings__pr-empty', 'No reliable target lines found.'),
          lines.weakLines.length > 0
            ? h('div.openings__pr-caveat', "Lines where opponent wins under 30%. Click to open in Opponent's Repertoire.")
            : weaknessModule.entries.length > 0
              ? h('div.openings__pr-caveat', `${weaknessModule.entries.length} prep signal${weaknessModule.entries.length > 1 ? 's' : ''} detected below.`)
              : null,
        ]),
      ]),

      // Risk signals strip — drift and fresh-risk lines that don't meet target threshold
      weaknessModule.entries.filter(e => e.category !== 'low-score').length > 0
        ? h('div.openings__pr-risk-strip', [
            h('div.openings__pr-section-title', 'Prep Signals'),
            h('div.openings__pr-weaknesses', weaknessModule.entries
              .filter(e => e.category !== 'low-score')
              .map(e =>
                h('button.openings__pr-weakness-row', {
                  class: { [`openings__pr-weakness--${e.category}`]: true },
                  on: { click: () => navToLine(e.line) },
                }, [
                  h('span.openings__pr-weakness-label', e.label),
                  h('span.openings__pr-weakness-moves',
                    e.line.sans.slice(0, 4).join(' ') + (e.line.sans.length > 4 ? '\u2026' : '')),
                  h('span.openings__pr-weakness-freq', `${e.line.frequency}g`),
                  h('span.openings__pr-line-nav', '\u2192'),
                ])
              )
            ),
            weaknessModule.caveats.length > 0
              ? h('div.openings__pr-caveat', weaknessModule.caveats[0]!)
              : null,
          ])
        : null,

    ]),

    // --- Termination profile + game length ---
    renderTerminationAndLength(collection),

    // --- Opening recommendations ---
    renderRecommendations(weaknessModule, lines, summary.overall.total, navToLine),

    // --- Vulnerable positions (traps they fall for) ---
    renderVulnerablePositions(collection, redraw),
  ]);
}

// --- Termination + Game Length section ---

function renderTerminationAndLength(collection: ResearchCollection | null): VNode | null {
  if (!collection) return null;
  const target = collection.target ?? '';
  const term = computeTerminationProfile(collection.games, target);
  const len = computeGameLengthProfile(collection.games, target);

  if (term.total < 10 && len.totalCounted < 10) return null;

  const pct = (n: number, total: number) => total > 0 ? Math.round((n / total) * 100) : 0;
  const flagPct = pct(term.timeout, term.total);
  const isHighFlag = flagPct > 15;

  return h('div.openings__pr-term-section', [
    // Termination profile
    term.total >= 10 ? h('div.openings__pr-term-grid', [
      h('div.openings__pr-section-title', `How Games End (n=${term.total})`),
      h('div.openings__pr-term-stats', [
        h('div.openings__pr-term-stat', [
          h('span.openings__pr-term-label', 'Resign'),
          h('span.openings__pr-term-value', `${pct(term.resignation, term.total)}%`),
        ]),
        h('div.openings__pr-term-stat', {
          class: { 'openings__pr-term-stat--highlight': isHighFlag },
        }, [
          h('span.openings__pr-term-label', 'Timeout'),
          h('span.openings__pr-term-value', `${flagPct}%`),
          isHighFlag ? h('span.openings__pr-term-flag', '\u231B pressure!') : null,
        ]),
        h('div.openings__pr-term-stat', [
          h('span.openings__pr-term-label', 'Checkmate'),
          h('span.openings__pr-term-value', `${pct(term.checkmate, term.total)}%`),
        ]),
        h('div.openings__pr-term-stat', [
          h('span.openings__pr-term-label', 'Draw'),
          h('span.openings__pr-term-value', `${pct(term.drawAgreement + term.stalemate, term.total)}%`),
        ]),
      ]),
    ]) : null,

    // Game length
    len.totalCounted >= 10 ? h('div.openings__pr-length-grid', [
      h('div.openings__pr-section-title', `Game Length (n=${len.totalCounted})`),
      h('div.openings__pr-term-stats', [
        h('div.openings__pr-term-stat', [
          h('span.openings__pr-term-label', 'Avg'),
          h('span.openings__pr-term-value', `${len.avgLength} moves`),
        ]),
        h('div.openings__pr-term-stat', [
          h('span.openings__pr-term-label', 'Wins'),
          h('span.openings__pr-term-value', len.avgWinLength > 0 ? `${len.avgWinLength} moves` : '\u2014'),
        ]),
        h('div.openings__pr-term-stat', [
          h('span.openings__pr-term-label', 'Losses'),
          h('span.openings__pr-term-value', len.avgLossLength > 0 ? `${len.avgLossLength} moves` : '\u2014'),
        ]),
        len.shortGamePct > 0 ? h('div.openings__pr-term-stat', [
          h('span.openings__pr-term-label', 'Short (<20)'),
          h('span.openings__pr-term-value', `${len.shortGamePct}%`),
        ]) : null,
      ]),
    ]) : null,
  ]);
}

// --- Vulnerable positions (traps they fall for) ---

function renderVulnerablePositions(
  collection: ResearchCollection | null,
  redraw: () => void,
): VNode | null {
  if (!collection || !openingTree()) return null;

  const patterns = detectTrapPatterns(
    openingTree()!,
    colorFilter(),
    collection.games,
    collection.target ?? '',
  );
  const significant = patterns.filter(p => p.isSignificant);
  if (significant.length === 0) return null;

  return h('div.openings__pr-traps', [
    h('div.openings__pr-section-title', 'Vulnerable Positions'),
    h('div.openings__pr-traps-list', significant.slice(0, 6).map(trap =>
      h('button.openings__pr-trap-card', {
        class: { 'openings__pr-unreliable': !isStatReliable(trap.totalAtNode) },
        on: { click: () => { navigateToPath(trap.path.slice(0, -1)); setActiveTool('opening-tree'); syncOpeningsBoard(redraw); redraw(); } },
      }, [
        h('div.openings__pr-trap-moves', trap.sans.slice(0, 5).join(' ')),
        h('div.openings__pr-trap-detail', [
          h('span', `plays ${trap.opponentMove}`),
          h('span.openings__pr-trap-losses', `loses ${trap.losses}/${trap.totalAtNode} (${Math.round(trap.losses / trap.totalAtNode * 100)}%)`),
        ]),
        h('span.openings__pr-line-nav', '\u2192'),
      ])
    )),
  ]);
}

// --- Opening recommendations section ---

function renderRecommendations(
  weakness: import('./analytics').WeaknessModule,
  lines: import('./analytics').PrepReportLines,
  totalGames: number,
  navToLine: (line: PrepLine) => void,
): VNode | null {
  const recs = computeOpeningRecommendations(weakness, lines, totalGames);
  if (recs.length === 0) return null;

  return h('div.openings__pr-recs', [
    h('div.openings__pr-section-title', 'Recommended Preparation'),
    h('div.openings__pr-recs-list', recs.map(rec =>
      h('button.openings__pr-rec-card', {
        class: { [`openings__pr-rec--${rec.confidence}`]: true },
        on: { click: () => navToLine(rec.line) },
      }, [
        h('div.openings__pr-rec-action', rec.actionLabel),
        h('div.openings__pr-rec-reason', rec.reason),
        h('span.openings__pr-line-nav', '\u2192'),
      ])
    )),
  ]);
}

/**
 * Style dashboard — renders a full-page portrait of the opponent's opening identity:
 * first-move tendencies, predictability, recent form, and synthesized style signals.
 *
 * Grounded in `StyleViewModel` which wraps only what the imported data can honestly support.
 * Signals are labeled as 'descriptive', 'interpretive', or 'cautious' to control display tone.
 */
function renderStyleTool(redraw: () => void): VNode {
  const collection = activeCollection();
  const vm = getStyleViewModel();

  if (!vm || !collection) {
    return h('div.openings__tool-content', [
      renderFilterBadge(redraw),
      h('div.openings__style', [
        h('div.openings__style-header', [
          h('span.openings__style-label', 'Style'),
        ]),
        treeBuilding()
          ? h('div.openings__style-loading', 'Building tree\u2026')
          : h('div.openings__style-loading', 'Open a collection to see Style.'),
      ]),
    ]);
  }

  return h('div.openings__tool-content', [
    renderFilterBadge(redraw),
    h('div.openings__style', [
      renderStyleHeader(collection, vm),
      renderStylePlayerCard(vm),
      renderStyleAxesBars(vm),
      renderStyleSignals(vm),
      renderStyleFirstMoves(vm),
      renderStyleForm(vm),
      renderStyleBehavioral(vm),
    ]),
  ]);
}

function renderStyleHeader(collection: ResearchCollection, vm: StyleViewModel): VNode {
  const conf = vm.overallConfidence;
  const confLabel = conf === 'insufficient' ? 'Insufficient data'
    : conf === 'low'          ? 'Low confidence'
    : conf === 'medium'       ? 'Medium confidence'
    : 'High confidence';
  const n = vm.form.baseline.wdl.total;

  return h('div.openings__style-header', [
    h('span.openings__style-label', 'Style'),
    h('span.openings__style-context', `${collection.target} · ${n} games`),
    h('span.openings__style-confidence', {
      class: { [`openings__style-conf--${conf}`]: true },
    }, confLabel),
  ]);
}

/**
 * Derive a single archetype label from the StyleViewModel.
 * Labels are useful descriptions, not personality verdicts.
 * Uses a priority-ordered check so the most distinctive trait wins.
 */
function deriveArchetype(vm: StyleViewModel): { label: string; qualifier: string } | null {
  if (vm.overallConfidence === 'insufficient') return null;

  const { profile, form } = vm;
  const n = form.baseline.wdl.total;
  if (n < 5) return null;

  const drawRate = form.baseline.wdl.draws / (n || 1);
  const gambitsSignal = vm.signals.find(s => s.label.includes('named gambits'));
  const gambitsHighPct = (() => {
    if (!gambitsSignal) return 0;
    const m = gambitsSignal.label.match(/^(\d+)%/);
    return m ? parseInt(m[1]!, 10) : 0;
  })();

  // Ordered priority checks
  if (gambitsHighPct >= 30) {
    return { label: 'Gambit Player', qualifier: `${gambitsHighPct}% of games involve named gambits` };
  }
  if (profile.normalizedEntropy < 0.3 && profile.topFirstMovePct >= 0.7) {
    return {
      label: 'One-Trick Specialist',
      qualifier: `${Math.round(profile.topFirstMovePct * 100)}% of games open the same way`,
    };
  }
  if (profile.normalizedEntropy < 0.45) {
    return { label: 'Book Player', qualifier: 'Consistent, narrow opponent opening repertoire' };
  }
  if (drawRate >= 0.35) {
    return { label: 'Draw Specialist', qualifier: `${Math.round(drawRate * 100)}% draw rate` };
  }
  if (profile.normalizedEntropy > 0.65) {
    return { label: 'Versatile Opponent', qualifier: 'Broad, unpredictable opponent repertoire' };
  }
  return { label: 'Solid Opponent Repertoire', qualifier: 'Moderate opening variety' };
}

/**
 * Player card — at-a-glance identity panel.
 * Shows the archetype label (if derivable) and overall W/D/L as a bar.
 */
function renderStylePlayerCard(vm: StyleViewModel): VNode | null {
  const n = vm.form.baseline.wdl.total;
  if (n < 5) return null;

  const archetype = deriveArchetype(vm);
  const wdl = vm.form.baseline.wdl;
  const t   = wdl.total || 1;
  const wP  = (wdl.wins   / t * 100).toFixed(0);
  const dP  = (wdl.draws  / t * 100).toFixed(0);
  const lP  = (wdl.losses / t * 100).toFixed(0);

  return h('div.openings__style-player-card', [
    archetype ? h('div.openings__style-archetype', [
      h('span.openings__style-archetype-label', archetype.label),
      h('span.openings__style-archetype-qualifier', archetype.qualifier),
    ]) : null,
    h('div.openings__style-card-wdl', [
      h('div.openings__style-wdl-bar', [
        h('span.wdl-w', { attrs: { style: `width:${wP}%` } }),
        h('span.wdl-d', { attrs: { style: `width:${dP}%` } }),
        h('span.wdl-l', { attrs: { style: `width:${lP}%` } }),
      ]),
      h('div.openings__style-wdl-counts', [
        h('span.wdl-w', `${wdl.wins}W`),
        h('span.wdl-d', `${wdl.draws}D`),
        h('span.wdl-l', `${wdl.losses}L`),
      ]),
    ]),
  ]);
}

/**
 * Style-axis bars — compact visual representation of key style dimensions.
 * Each axis is a labeled bar placed between two poles.
 */
function renderStyleAxesBars(vm: StyleViewModel): VNode | null {
  const n = vm.form.baseline.wdl.total;
  if (n < 10) return null;

  const { profile } = vm;

  // Predictability axis: narrow (0) → broad (1)
  const predictPct = Math.round(profile.normalizedEntropy * 100);

  // Comfort zone: concentrated (high top3EcoPct) → varied (low top3EcoPct)
  // Invert so "concentrated" = left pole on bar
  const comfortPct = Math.round((1 - profile.top3EcoPct) * 100);

  const axes: Array<{ label: string; leftPole: string; rightPole: string; pct: number }> = [];

  if (profile.distinctFirstMoves > 1) {
    axes.push({ label: 'Opponent repertoire breadth', leftPole: 'Narrow', rightPole: 'Broad', pct: predictPct });
  }
  if (profile.top3EcoPct > 0) {
    axes.push({ label: 'Opening variety', leftPole: 'Concentrated', rightPole: 'Varied', pct: comfortPct });
  }

  if (axes.length === 0) return null;

  return h('div.openings__style-axes', [
    h('div.openings__style-section-title', 'Style axes'),
    h('div.openings__style-axes-list',
      axes.map(axis =>
        h('div.openings__style-axis-row', [
          h('span.openings__style-axis-label', axis.label),
          h('div.openings__style-axis-track', [
            h('span.openings__style-axis-pole', axis.leftPole),
            h('div.openings__style-axis-bar-wrap', [
              h('div.openings__style-axis-bar', {
                attrs: { style: `left:${axis.pct}%` },
              }),
            ]),
            h('span.openings__style-axis-pole', axis.rightPole),
          ]),
        ])
      )
    ),
  ]);
}

function renderStyleSignals(vm: StyleViewModel): VNode | null {
  const { signals } = vm;
  if (signals.length === 0) return null;

  const descriptive  = signals.filter(s => s.type === 'descriptive');
  const interpretive = signals.filter(s => s.type === 'interpretive');
  const cautious     = signals.filter(s => s.type === 'cautious');

  function renderSignal(s: (typeof signals)[number]): VNode {
    return h('div.openings__style-signal', {
      class: {
        [`openings__style-signal--${s.type}`]: true,
        [`openings__style-signal--${s.confidence}`]: true,
      },
    }, [
      h('span.openings__style-signal-label', s.label),
      s.caveat ? h('span.openings__style-signal-caveat', s.caveat) : null,
    ]);
  }

  return h('div.openings__style-signals', [
    descriptive.length > 0 ? h('div.openings__style-signals-group', [
      h('div.openings__style-signals-title', 'Observed facts'),
      ...descriptive.map(renderSignal),
    ]) : null,
    interpretive.length > 0 ? h('div.openings__style-signals-group', [
      h('div.openings__style-signals-title', 'Inferences'),
      ...interpretive.map(renderSignal),
    ]) : null,
    cautious.length > 0 ? h('div.openings__style-signals-group', [
      h('div.openings__style-signals-title', 'Behavioral tendencies'),
      ...cautious.map(renderSignal),
    ]) : null,
  ]);
}

function renderStyleFirstMoves(vm: StyleViewModel): VNode {
  const { asWhite, asBlack } = vm.style;

  function renderMoveBar(m: (typeof asWhite.firstMoves)[number]): VNode {
    const pct = Math.round(m.pct * 100);
    return h('div.openings__style-move-row', [
      h('span.openings__style-move-san', m.san),
      h('div.openings__style-move-bar-wrap', [
        h('div.openings__style-move-bar', {
          attrs: { style: `width:${pct}%` },
        }),
      ]),
      h('span.openings__style-move-pct', `${pct}%`),
      h('span.openings__style-move-count', `(${m.count}g)`),
    ]);
  }

  return h('div.openings__style-first-moves', [
    h('div.openings__style-fm-col', [
      h('div.openings__style-section-title', 'As White'),
      asWhite.firstMoves.length > 0
        ? h('div.openings__style-move-list', asWhite.firstMoves.slice(0, 5).map(renderMoveBar))
        : h('div.openings__style-empty', 'No data'),
    ]),
    h('div.openings__style-fm-col', [
      h('div.openings__style-section-title', 'As Black'),
      asBlack.firstMoves.length > 0
        ? h('div.openings__style-move-list', asBlack.firstMoves.slice(0, 5).map(renderMoveBar))
        : h('div.openings__style-empty', 'No data'),
    ]),
  ]);
}

function renderStyleForm(vm: StyleViewModel): VNode | null {
  const { form } = vm;
  const baseline = form.baseline.wdl;
  const last90   = form.last90.wdl;
  const last30   = form.last30.wdl;

  if (baseline.total < 5) return null;

  function wdlBar(wdl: typeof baseline): VNode {
    const t = wdl.total || 1;
    const wP = (wdl.wins   / t * 100).toFixed(0);
    const dP = (wdl.draws  / t * 100).toFixed(0);
    const lP = (wdl.losses / t * 100).toFixed(0);
    return h('div.openings__style-wdl-row', [
      h('div.openings__style-wdl-bar', [
        h('span.wdl-w', { attrs: { style: `width:${wP}%` } }),
        h('span.wdl-d', { attrs: { style: `width:${dP}%` } }),
        h('span.wdl-l', { attrs: { style: `width:${lP}%` } }),
      ]),
      h('div.openings__style-wdl-counts', [
        h('span.wdl-w', `${wdl.wins}W`),
        h('span.wdl-d', `${wdl.draws}D`),
        h('span.wdl-l', `${wdl.losses}L`),
        h('span.openings__style-wdl-total', `n=${wdl.total}`),
      ]),
    ]);
  }

  const trendLabel = form.recentTrend === 'improving'    ? '\u2191 Improving recently'
    : form.recentTrend === 'declining'    ? '\u2193 Declining recently'
    : form.recentTrend === 'stable'       ? '\u2014 Stable'
    : null;

  return h('div.openings__style-form', [
    h('div.openings__style-section-title', 'Form'),
    h('div.openings__style-form-periods', [
      h('div.openings__style-form-row', [
        h('span.openings__style-form-label', 'All time'),
        wdlBar(baseline),
      ]),
      last90.total >= 3 ? h('div.openings__style-form-row', [
        h('span.openings__style-form-label', 'Last 90d'),
        wdlBar(last90),
      ]) : null,
      last30.total >= 3 ? h('div.openings__style-form-row', [
        h('span.openings__style-form-label', 'Last 30d'),
        wdlBar(last30),
      ]) : null,
    ]),
    trendLabel ? h('div.openings__style-trend', trendLabel) : null,
    form.recentTrend !== 'insufficient-data'
      ? h('div.openings__style-form-caveat', 'Based on win-rate change only — not engine-backed.')
      : null,
  ]);
}

/**
 * Behavioral tendency module — shows opening commitment, opponent-repertoire switching signals,
 * and stability indicators derived from FormData and OpponentRepertoireProfile.
 *
 * Deliberately avoids psychological claims. Language stays at the level of
 * observable patterns in the game history.
 */
function renderStyleBehavioral(vm: StyleViewModel): VNode | null {
  const { form, profile } = vm;
  const n = form.baseline.wdl.total;
  if (n < 10) return null;

  const items: VNode[] = [];

  // Opening variety (top3EcoPct) is already shown as a style axis bar — omitted here to avoid duplication.

  // --- Opening switching — recent vs all-time ---
  // If the recent top opening differs from the baseline top opening, they may have switched lines.
  const recentEco   = form.last90.topEco;
  const baselineEco = form.baseline.topEco;
  if (recentEco && baselineEco && recentEco !== baselineEco && form.last90.datedGameCount >= 5) {
    items.push(h('div.openings__style-behavioral-row', [
      h('span.openings__style-behavioral-label', 'Recent opening shift'),
      h('span.openings__style-behavioral-detail',
        `${baselineEco} historically → ${recentEco} in last 90 days`,
      ),
      h('span.openings__style-behavioral-caveat', 'May reflect prep change or one-off experiment.'),
    ]));
  }

  // --- No switching indicator (stability) ---
  if (recentEco && baselineEco && recentEco === baselineEco && form.last90.datedGameCount >= 5) {
    items.push(h('div.openings__style-behavioral-row', [
      h('span.openings__style-behavioral-label', 'Stable opening choice'),
      h('span.openings__style-behavioral-detail',
        `Same primary opening (${baselineEco}) in recent and all-time games`,
      ),
    ]));
  }

  if (items.length === 0) return null;

  return h('div.openings__style-behavioral', [
    h('div.openings__style-section-title', 'Behavioral tendencies'),
    h('div.openings__style-behavioral-caveat-banner',
      'These are observed patterns only — not psychological assessments.'),
    h('div.openings__style-behavioral-list', items),
  ]);
}

/**
 * Practice Against Them — board-led training mode.
 *
 * Returns two grid children: board column + practice panel.
 * The board is always visible as the center of gravity.
 *
 * Pre-session (no active PracticeSession):
 *   Shows color picker + "Start" button.
 *
 * Active session:
 *   Shows opponent source banner (opponent-repertoire / engine / exhausted),
 *   session info, and a Stop button.
 *
 * Game loop automation (opponent auto-play) is NOT wired in this prompt.
 * That comes in the next prompt. This shell establishes ownership and layout only.
 */
function renderPracticeTool(
  collection: ResearchCollection | null,
  node: OpeningTreeNode | null,
  redraw: () => void,
): VNode[] {
  const session = practiceSession();

  return [
    // Board column — same layout as Opening Tree
    h('div.openings__board-col', [
      renderPlayerStrip(collection, 'top'),
      h('div.openings__board-wrap', [
        renderOpeningsBoard(node, redraw),
      ]),
      renderPlayerStrip(collection, 'bottom'),
    ]),

    // Practice panel
    h('div.openings__session-panel openings__practice-panel', [
      session
        ? renderPracticeActivePanel(node, session, redraw)
        : renderPracticeSetupPanel(collection, node, redraw),
    ]),
  ];
}

/**
 * Pre-session panel: color picker and Start Practice button.
 */
function renderPracticeSetupPanel(
  collection: ResearchCollection | null,
  node: OpeningTreeNode | null,
  redraw: () => void,
): VNode {
  // Pick a default start color: play as the non-opponent side.
  // If color filter is set, user plays opposite of opponent's usual color.
  const suggestedColor: 'white' | 'black' =
    colorFilter() === 'black' ? 'white' : 'black';

  const target = collection?.target ?? 'them';

  let _selectedColor: 'white' | 'black' = suggestedColor;

  function handleStart(color: 'white' | 'black') {
    const fen = node?.fen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    startPractice(color, fen);
    redraw();
  }

  return h('div.openings__practice-setup', [
    h('div.openings__practice-setup-title', `Practice Against ${target}`),
    h('div.openings__practice-setup-desc',
      `Play from the current position. ${target} will respond using their imported opening lines while opponent-repertoire data is available, then the engine takes over.`),
    h('div.openings__practice-color-picker', [
      h('span.openings__practice-color-label', 'You play as'),
      h('div.openings__practice-color-btns', [
        h('button.openings__practice-color-btn', {
          class: { 'openings__practice-color-btn--active': suggestedColor === 'white' },
          on: { click: () => { _selectedColor = 'white'; handleStart('white'); } },
        }, 'White'),
        h('button.openings__practice-color-btn', {
          class: { 'openings__practice-color-btn--active': suggestedColor === 'black' },
          on: { click: () => { _selectedColor = 'black'; handleStart('black'); } },
        }, 'Black'),
      ]),
    ]),
    h('div.openings__practice-strength', [
      h('span.openings__practice-strength-label', 'Engine strength'),
      renderStrengthSelector(getPlayStrengthLevel(), (level) => {
        setPlayStrengthLevel(level);
        redraw();
      }),
    ]),
    h('div.openings__practice-setup-note',
      'Selecting a color starts practice immediately.'),
  ]);
}

/**
 * Active session panel: opponent source banner + session info + Stop button.
 */
function renderPracticeActivePanel(
  node: OpeningTreeNode | null,
  session: ReturnType<typeof practiceSession>,
  redraw: () => void,
): VNode {
  if (!session) return h('div'); // type narrowing only; never reached

  // Read source from session state — set by schedulePracticeOpponentResponse after each opponent turn.
  // Calling planOpponentTurn here would invoke random move selection on every render, which is wrong.
  const source = session.opponentSource;
  const engineStrength = source === 'engine'
    ? STRENGTH_LEVELS[(session.strengthLevel ?? 4) - 1] ?? STRENGTH_LEVELS[3]!
    : null;
  const sourceBannerText = source === 'opponent-repertoire'
    ? 'Playing from imported opponent repertoire'
    : source === 'engine' && engineStrength
      ? `Engine playing at Level ${engineStrength.level} (${engineStrength.label} ~${engineStrength.uciElo} Elo)`
      : source === 'engine'
        ? 'Engine has taken over — opponent repertoire data exhausted'
        : 'No moves available — practice has ended at this branch';

  const sourceBannerClass = source === 'opponent-repertoire'
    ? 'openings__practice-source--opponent-repertoire'
    : source === 'engine'
      ? 'openings__practice-source--engine'
      : 'openings__practice-source--exhausted';

  // Compute total opponent frequency from node data — pure, no random selection.
  const totalFreq = buildPracticeCandidates(node).reduce((s, c) => s + c.frequency, 0);

  const moveCount = session.moveHistory.length;

  return h('div.openings__practice-active', [
    h('div.openings__practice-source-banner', {
      class: { [sourceBannerClass]: true },
    }, [
      h('span.openings__practice-source-icon',
        source === 'opponent-repertoire' ? '●' : source === 'engine' ? '⚡' : '✕'),
      h('span.openings__practice-source-text', sourceBannerText),
    ]),

    totalFreq > 0
      ? h('div.openings__practice-freq-note',
        `Opponent played this position ${totalFreq} time${totalFreq !== 1 ? 's' : ''} in imported games`)
      : null,

    h('div.openings__practice-controls', [
      h('div.openings__practice-stat', `Moves played: ${moveCount}`),
      h('div.openings__practice-stat', `Playing as: ${session.userColor}`),
    ]),

    h('button.openings__practice-stop-btn', {
      on: { click: () => { stopPractice(); redraw(); } },
    }, 'Stop Practice'),
  ]);
}

/**
 * Practice tool owner — renders the board column and session panel that make up
 * the current opening-tree experience. Returns two grid children so the session body
 * can spread them into the layout alongside the tool rail.
 *
 * Ownership boundary: board, player strips, move list, explorer, sample games, engine.
 * Session shell owns: header row, tool rail, dispatching to this function.
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
          renderEvalBar(engineEnabled, currentEval, fen),
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
        setCevalPositionOverride(openingsPositionContext(fen));
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
  if (currentEval.cp !== undefined || currentEval.mate !== undefined || currentEval.moves?.length) {
    return true;
  }
  return currentEval.lines?.some(line =>
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

/**
 * Opponent's Repertoire dashboard — shows the prep-zone analytics for the active collection.
 * Overview, summary modules, and line insight cards without a board.
 * Spans the full content area via openings__tool-content grid layout.
 */
function renderOpponentRepertoireDashboard(
  collection: ResearchCollection | null,
  redraw: () => void,
): VNode {
  return h('div.openings__tool-content', [
    h('div.openings__prep-zone', treeBuilding()
      ? [h('div.openings__prep-zone-loading', 'Building tree\u2026')]
      : [
          collection ? renderOpponentRepertoireOverview(collection) : null,
          renderOpponentRepertoireSummaryModules(redraw),
          renderLineInsightCards(redraw),
        ]
    ),
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
        on: { click: () => { _openingsCg = undefined; setCevalPositionOverride(null); closeSession(); redraw(); } },
      }, '\u2190 Library'),
      h('h2.openings__session-title', collection?.name ?? 'Opponent Research'),
      h('span.openings__session-meta', node
        ? `${node.total} game${node.total !== 1 ? 's' : ''} reached this position`
        : ''),
    ]),
    h('div.openings__session-body', {
      class: {
        'openings__session-body--tree':    activeTool() === 'opening-tree',
        'openings__session-body--eval-on': activeTool() === 'opening-tree' && engineEnabled,
      },
    }, [
      renderToolRail(redraw),
      // Active tool owns the main content area.
      ...(activeTool() === 'opening-tree'
        ? renderOpeningTreeTool(collection, node, path, redraw)
        : activeTool() === 'opponent-repertoire'
          ? [renderOpponentRepertoireDashboard(collection, redraw)]
          : activeTool() === 'prep-report'
            ? [renderPrepReportTool(redraw)]
            : activeTool() === 'style'
              ? [renderStyleTool(redraw)]
              : activeTool() === 'practice'
                ? renderPracticeTool(collection, node, redraw)
                : [renderToolPlaceholder(activeTool())]),
    ]),
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

  // Derive SAN sequence by walking the opening tree along the path.
  const tree = openingTree();
  const sans: string[] = [];
  if (tree) {
    let current: import('./tree').OpeningTreeNode = tree;
    for (const uci of path) {
      const child = current.children.find(c => c.uci === uci);
      if (!child) break;
      sans.push(child.san);
      current = child;
    }
  }

  // Opening name and ECO are not yet available from OpeningTreeNode —
  // ECO lookup is a future task. Pass undefined for both fields.
  void saveOrpLineToLibrary([...path], sans, trainAs, collection).then(result => {
    if (result) {
      _saveLibFeedback = 'Saved to Library!';
    } else {
      // null result here means deriveFens rejected the UCI (the too-short guard already
      // fired above, so this branch is an invalid-moves failure, not a length issue).
      _saveLibFeedback = 'Save failed — invalid moves';
    }
    if (_saveLibFeedbackTimer) clearTimeout(_saveLibFeedbackTimer);
    _saveLibFeedbackTimer = setTimeout(() => { _saveLibFeedback = null; redraw(); }, 1800);
    redraw();
  }).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : '';
    _saveLibFeedback = msg ? `Save failed — ${msg}` : 'Save failed';
    if (_saveLibFeedbackTimer) clearTimeout(_saveLibFeedbackTimer);
    _saveLibFeedbackTimer = setTimeout(() => { _saveLibFeedback = null; redraw(); }, 1800);
    redraw();
  });
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

  return renderMoveNavBar([], {
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
    menuTitle: 'Opponents menu',
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
        setCevalPositionOverride(openingsPositionContext(fen));
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
              const session = practiceSession();

              if (session && session.running) {
                // Practice mode: only accept moves on the user's turn.
                // The FEN turn character determines whose move it is.
                const fen = current?.fen ?? STANDARD_START_FEN;
                const fenTurn = fen.split(' ')[1]; // 'w' or 'b'
                const isUserTurn =
                  (session.userColor === 'white' && fenTurn === 'w') ||
                  (session.userColor === 'black' && fenTurn === 'b');

                if (!isUserTurn) return; // Not user's turn — board reverts automatically

                if (current) {
                  // Navigate tree if move is in children; otherwise no tree movement.
                  // Chessground already validated legality via dests.
                  const match = current.children.find(c =>
                    c.uci === uci || c.uci.startsWith(uci),
                  );
                  if (match) {
                    navigateToMove(match.uci);
                    recordPracticeMove(match.uci);
                    syncOpeningsBoard(redraw);
                    redraw();
                    // Schedule the opponent's response after user's move lands.
                    schedulePracticeOpponentResponse(redraw);
                  } else {
                    // Move is legal but not in the tree: board will revert (no tree navigation).
                    // The user played an off-tree move — just revert silently.
                    syncOpeningsBoard(redraw);
                  }
                }
              } else {
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
  setCevalPositionOverride(openingsPositionContext(fen));
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

function syncOpeningsBoard(_redraw: () => void): void {
  // Stop any running import animation so the board is cleanly handed back.
  if (!isFetching() && _animGame !== null) stopImportAnimation();
  // Any explicit tree navigation clears the transient off-tree analysis position.
  _offTreeFen = null;

  const node = sessionNode();
  if (!_openingsCg || !node) return;
  const fen = node.fen;
  explorerCtrl.clearStaleHovering(fen);
  const session = practiceSession();
  const isPractice = !!session;
  // Skip only if neither FEN nor practice mode has changed.
  // Must re-sync on practice start/stop even at the same FEN so movable.color updates.
  if (fen === _lastBoardFen && isPractice === _lastBoardPractice) return;
  _lastBoardFen = fen;
  _lastBoardPractice = isPractice;

  // In practice mode, restrict movable.color to the user's color.
  // In browse mode, allow both sides to move freely.
  const movableColor: 'white' | 'black' | 'both' = session ? session.userColor : 'both';

  _openingsCg.set({
    fen,
    animation: chessBoardAnimationConfig(),
    orientation: boardOrientation(),
    movable: { dests: destsForFen(fen), color: movableColor },
    ...(node.uci ? { lastMove: [node.uci.slice(0, 2) as Key, node.uci.slice(2, 4) as Key] } : {}),
  });
  syncOpeningsAutoShapes(node);
  // Update FEN override and schedule engine eval after settle.
  scheduleOpeningsEngineEval(fen);
}

onBoardAnimationChange('chess', () => {
  if (_animGame !== null || _animTimer !== null) return;
  _openingsCg?.set({ animation: chessBoardAnimationConfig() });
});

// Practice opponent response scheduling.
// After the user plays a move, the opponent responds after a short delay.
// Uses a single pending timer so rapid user actions don't queue multiple responses.
let _practiceOpponentTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Schedule the opponent's practice response after the user's move.
 * Cancels any pending timer first (prevents double-responses on rapid input).
 *
 * Opponent-repertoire phase: picks a weighted move from the current node's children
 * and navigates to it after PRACTICE_OPPONENT_DELAY_MS.
 *
 * Engine phase: updates the source banner and defers auto-play to a future prompt.
 * The engine banner is set so the view communicates the handoff honestly.
 *
 * Exhausted phase: updates source to 'exhausted' — UI already shows the banner.
 */
const PRACTICE_OPPONENT_DELAY_MS = 400;

function schedulePracticeOpponentResponse(redraw: () => void): void {
  if (_practiceOpponentTimer !== null) {
    clearTimeout(_practiceOpponentTimer);
    _practiceOpponentTimer = null;
  }

  _practiceOpponentTimer = setTimeout(() => {
    _practiceOpponentTimer = null;
    const session = practiceSession();
    if (!session || !session.running) return;

    const node = sessionNode();
    const plan = planOpponentTurn(node, session);

    // Always update the source so the banner stays accurate.
    setPracticeOpponentSource(plan.source);

    if (plan.action === 'play-opponent-repertoire' && plan.moveUci) {
      // Opponent plays from imported opponent repertoire.
      navigateToMove(plan.moveUci);
      recordPracticeMove(plan.moveUci);
      syncOpeningsBoard(redraw);
      redraw();
    } else if (plan.action === 'request-engine') {
      if (!node) { redraw(); return; }
      // Engine plays at the session's selected strength level.
      const strengthConfig = STRENGTH_LEVELS[(session.strengthLevel ?? 4) - 1] ?? STRENGTH_LEVELS[3]!;
      playMoveWithDelay({
        position: practicePlayPositionContext(session, node),
        strength: strengthConfig,
        onMove: (uci) => {
          navigateToMove(uci);
          recordPracticeMove(uci);
          syncOpeningsBoard(redraw);
          redraw();
        },
        onError: () => redraw(),
      });
      redraw();
    } else {
      // Exhausted: session continues but no auto-play. Banner explains state.
      redraw();
    }
  }, PRACTICE_OPPONENT_DELAY_MS);
}

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
    ...(isRapid() ? [] : buildEngineArrowShapes()),
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

type ExplorerMoveRowInteractionOptions = {
  fen: string;
  rowSelector: string;
  board: () => CgApi | undefined;
  getCurrentFen: () => string | null | undefined;
  restoreAutoShapes: () => void;
  onMoveClick?: ((uci: string) => void) | undefined;
  ignoreClickSelector?: string | undefined;
  onDirectAutoShapesSet?: (() => void) | undefined;
};

type ExplorerMoveRowsElement = HTMLElement & {
  _explorerMoveRowInteractionOptions?: ExplorerMoveRowInteractionOptions;
  _explorerMoveRowInteractionsBound?: boolean;
};

function currentOpeningsBoardFen(): string | null {
  return _offTreeFen ?? sessionNode()?.fen ?? null;
}

function rowFromEventTarget(target: EventTarget | null, root: HTMLElement, selector: string): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  const row = target.closest(selector);
  return row instanceof HTMLElement && root.contains(row) ? row : null;
}

function eventStayedWithinRow(event: MouseEvent, row: HTMLElement): boolean {
  return event.relatedTarget instanceof Node && row.contains(event.relatedTarget);
}

function explorerHoverShape(uci: string): DrawShape | null {
  if (uci.length < 4) return null;
  return {
    orig: uci.slice(0, 2) as Key,
    dest: uci.slice(2, 4) as Key,
    brush: 'blue',
  };
}

function restoreOpeningsExplorerAutoShapes(): void {
  _lastOpeningsAutoShapesHash = null;
  syncOpeningsAutoShapes(sessionNode());
}

function restoreAnalysisExplorerAutoShapes(): void {
  syncArrowForced();
}

function clearExplorerMoveHover(opts: ExplorerMoveRowInteractionOptions): void {
  explorerCtrl.setHovering(opts.fen, null);
  opts.board()?.setAutoShapes([]);
  opts.onDirectAutoShapesSet?.();
  opts.restoreAutoShapes();
}

function fenMatchesExplorerRow(opts: ExplorerMoveRowInteractionOptions): boolean {
  return opts.getCurrentFen() === opts.fen;
}

function showExplorerMoveHover(uci: string, opts: ExplorerMoveRowInteractionOptions): void {
  if (!fenMatchesExplorerRow(opts)) {
    clearExplorerMoveHover(opts);
    return;
  }
  const shape = explorerHoverShape(uci);
  if (!shape) return;
  explorerCtrl.setHovering(opts.fen, uci);
  opts.board()?.setAutoShapes([shape]);
  opts.onDirectAutoShapesSet?.();
}

function handleExplorerMoveClick(uci: string, opts: ExplorerMoveRowInteractionOptions): void {
  if (!fenMatchesExplorerRow(opts)) {
    clearExplorerMoveHover(opts);
    return;
  }
  opts.onMoveClick?.(uci);
}

function currentExplorerMoveRowOptions(root: ExplorerMoveRowsElement): ExplorerMoveRowInteractionOptions | null {
  return root._explorerMoveRowInteractionOptions ?? null;
}

function bindExplorerMoveRowInteractions(root: ExplorerMoveRowsElement, opts: ExplorerMoveRowInteractionOptions): void {
  root._explorerMoveRowInteractionOptions = opts;
  if (root._explorerMoveRowInteractionsBound) return;
  root._explorerMoveRowInteractionsBound = true;

  root.addEventListener('mouseover', (event: MouseEvent) => {
    const opts = currentExplorerMoveRowOptions(root);
    if (!opts) return;
    const row = rowFromEventTarget(event.target, root, opts.rowSelector);
    if (!row || eventStayedWithinRow(event, row)) return;
    const uci = row.getAttribute('data-uci');
    if (uci) showExplorerMoveHover(uci, opts);
  });

  root.addEventListener('mouseout', (event: MouseEvent) => {
    const opts = currentExplorerMoveRowOptions(root);
    if (!opts) return;
    const row = rowFromEventTarget(event.target, root, opts.rowSelector);
    if (!row || eventStayedWithinRow(event, row)) return;
    clearExplorerMoveHover(opts);
  });

  root.addEventListener('mouseleave', () => {
    const opts = currentExplorerMoveRowOptions(root);
    if (opts) clearExplorerMoveHover(opts);
  });

  root.addEventListener('click', (event: MouseEvent) => {
    const opts = currentExplorerMoveRowOptions(root);
    if (!opts) return;
    const target = event.target as HTMLElement | null;
    if (target && opts.ignoreClickSelector && target.closest(opts.ignoreClickSelector)) return;
    const row = rowFromEventTarget(event.target, root, opts.rowSelector);
    const uci = row?.getAttribute('data-uci');
    if (uci) handleExplorerMoveClick(uci, opts);
  });
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

function repertoireLineForOpenings(path: readonly string[]): RepertoireExplorerLinePosition<readonly string[]>[] {
  const tree = openingTree();
  if (!tree) return [];
  const line: RepertoireExplorerLinePosition<readonly string[]>[] = [
    { fen: tree.fen, path: [], ply: 0 },
  ];
  let current: OpeningTreeNode | undefined = tree;
  const currentPath: string[] = [];
  for (const uci of path) {
    const child: OpeningTreeNode | undefined = current?.children.find(candidate => candidate.uci === uci);
    if (!child) break;
    currentPath.push(uci);
    line.push({
      fen: child.fen,
      path: [...currentPath],
      uci: child.uci,
      san: child.san,
      ply: currentPath.length,
    });
    current = child;
  }
  return line;
}

function nagSymbols(nags: readonly number[]): string {
  return nags.map(nag => nagToGlyph(nag)?.symbol ?? `$${nag}`).join(' ');
}

function annotationCommentTexts(comments: readonly TreeComment[]): string[] {
  return comments.map(comment => comment.text.trim()).filter(text => text.length > 0);
}

function firstCommentLine(comments: readonly TreeComment[]): string {
  for (const comment of comments) {
    const line = comment.text.split(/\r?\n/).map(part => part.trim()).find(Boolean);
    if (line) return line;
  }
  return '';
}

function repertoireAnnotationKey(
  fen: string,
  group: RepertoireExplorerSourceGroup,
  entry: RepertoireExplorerSourceGroup['entries'][number],
  entryIndex: number,
): string {
  return `${group.source.id}:${fen}:${entry.uci}:${entryIndex}`;
}

function renderRepertoireAnnotationBlock(
  nags: readonly number[],
  comments: readonly TreeComment[],
  modifier: string,
): VNode | null {
  const nagText = nagSymbols(nags);
  const texts = annotationCommentTexts(comments);
  if (!nagText && texts.length === 0) return null;
  return h(`div.repertoire__annotation.${modifier}`, [
    nagText ? h('div.repertoire__annotation-nags', nagText) : null,
    ...texts.map((text, index) => h('div.repertoire__annotation-text', { key: String(index) }, text)),
  ]);
}

function renderRepertoireChip(source: RepertoireExplorerSourceGroup['source'], accentIndex: number): VNode {
  return h(`span.repertoire__chip.repertoire__accent--${accentIndex % 8}`, [
    h('span.repertoire__chip-dot'),
    h('span.repertoire__chip-name', source.name),
    h('span.repertoire__side-badge', repertoireSourceSideBadge(source.side)),
  ]);
}

function renderAccountResultBar(stats: NonNullable<RepertoireExplorerSourceGroup['entries'][number]['accountStats']>): VNode {
  const total = stats.games || 1;
  const winPct = (stats.wins * 100) / total;
  const drawPct = (stats.draws * 100) / total;
  const lossPct = (stats.losses * 100) / total;
  const label = `${stats.wins}W ${stats.draws}D ${stats.losses}L`;
  return h('span.repertoire__account-result', {
    attrs: {
      title: label,
      'aria-label': label,
    },
  }, [
    h('span.repertoire__account-result-bar', [
      h('span.wdl-w.repertoire__account-result-segment', { attrs: { style: `width:${winPct.toFixed(1)}%` } }),
      h('span.wdl-d.repertoire__account-result-segment', { attrs: { style: `width:${drawPct.toFixed(1)}%` } }),
      h('span.wdl-l.repertoire__account-result-segment', { attrs: { style: `width:${lossPct.toFixed(1)}%` } }),
    ]),
    h('span.repertoire__account-result-counts', label),
  ]);
}

function renderAccountMoveStats(entry: RepertoireExplorerSourceGroup['entries'][number]): VNode | null {
  const stats = entry.accountStats;
  if (!stats) return null;
  return h('span.repertoire__account-stats', [
    h('span', `${stats.games.toLocaleString()} game${stats.games === 1 ? '' : 's'}`),
    h('span.repertoire__source-sep', '·'),
    h('span', `${stats.winPercent}% wins`),
    renderAccountResultBar(stats),
  ]);
}

function toggleRepertoireSourceFromExplorer(
  source: RepertoireExplorerSourceGroup['source'],
  redraw: () => void,
  restoreAutoShapes?: () => void,
): void {
  _repertoireExplorerNotice = '';
  void setRepertoireSourceEnabled(source.id, !source.enabled)
    .then(() => {
      restoreAutoShapes?.();
      redraw();
    })
    .catch(() => {
      _repertoireExplorerNotice = `Could not update ${source.name}.`;
      redraw();
    });
}

function repertoireMoveListHook(
  fen: string,
  onMoveClick?: (uci: string) => void,
  cgBoard?: CgApi,
  getCurrentFen: () => string | null | undefined = currentOpeningsBoardFen,
  restoreAutoShapes: () => void = restoreOpeningsExplorerAutoShapes,
) {
  const bind = (vnode: import('snabbdom').VNode) => {
    const el = vnode.elm as ExplorerMoveRowsElement;
    const usesOpeningsBoard = restoreAutoShapes === restoreOpeningsExplorerAutoShapes;
    bindExplorerMoveRowInteractions(el, {
      fen,
      rowSelector: '.repertoire__move-row',
      board: () => cgBoard ?? (usesOpeningsBoard ? _openingsCg : undefined),
      getCurrentFen,
      restoreAutoShapes,
      onMoveClick,
      ignoreClickSelector: '.repertoire__annotation-toggle',
      onDirectAutoShapesSet: usesOpeningsBoard ? () => { _lastOpeningsAutoShapesHash = null; } : undefined,
    });
  };
  return {
    insert: bind,
    postpatch: (_old: import('snabbdom').VNode, vnode: import('snabbdom').VNode) => bind(vnode),
  };
}

function renderRepertoireMoveRows(
  group: RepertoireExplorerSourceGroup,
  fen: string,
  redraw: () => void,
  onMoveClick?: (uci: string) => void,
  cgBoard?: CgApi,
  getCurrentFen?: () => string | null | undefined,
  restoreAutoShapes?: () => void,
): VNode | null {
  if (group.error) return h('div.repertoire__source-error.repertoire__source-error--inline', group.error);
  if (!group.entries.length) return null;
  return h('div.repertoire__move-list', {
    hook: repertoireMoveListHook(fen, onMoveClick, cgBoard, getCurrentFen, restoreAutoShapes),
  }, group.entries.map((entry, entryIndex) => {
    const nags = nagSymbols(entry.nags);
    const preview = firstCommentLine(entry.comments);
    const annotationKey = repertoireAnnotationKey(fen, group, entry, entryIndex);
    const expanded = _expandedRepertoireAnnotationKey === annotationKey;
    const expandedLabel = expanded ? `Collapse annotation for ${entry.san}` : `Expand annotation for ${entry.san}`;
    return h('div.repertoire__move-row', {
      key: annotationKey,
      class: { 'repertoire__move-row--expanded': expanded },
      attrs: {
        'data-uci': entry.uci,
        title: `Play repertoire move ${entry.san}`,
        'aria-label': `Play repertoire move ${entry.san}`,
      },
    }, [
      h('div.repertoire__move-main', [
        h('span.repertoire__move-san', entry.san),
        entry.accountStats ? null : entry.isMain ? h('span.repertoire__main-tag', 'main') : null,
        nags ? h('span.repertoire__nags', nags) : null,
        group.expectedReply ? h('span.repertoire__reply-tag', 'expected reply') : null,
        renderAccountMoveStats(entry),
      ]),
      preview ? h('button.repertoire__comment-preview.repertoire__annotation-toggle', {
        attrs: {
          type: 'button',
          title: expandedLabel,
          'aria-label': expandedLabel,
          'aria-expanded': String(expanded),
        },
        on: {
          click: (e: MouseEvent) => {
            e.stopPropagation();
            _expandedRepertoireAnnotationKey = expanded ? null : annotationKey;
            redraw();
          },
        },
      }, preview) : null,
      expanded ? renderRepertoireAnnotationBlock(entry.nags, entry.comments, 'repertoire__annotation--expanded') : null,
    ]);
  }));
}

function renderRepertoirePositionAnnotations(annotations: readonly RepertoireExplorerPositionAnnotation[]): VNode | null {
  const visible = annotations.filter(annotation =>
    annotation.nags.length > 0 || annotationCommentTexts(annotation.comments).length > 0,
  );
  if (!visible.length) return null;

  return h('div.annotation-panel.repertoire__position-annotations', [
    h('h3.annotation-panel__title', 'Position comments'),
    ...visible.map((annotation, annotationIndex) => h('div.repertoire__position-annotation', {
      key: `${annotation.source.id}:${annotation.sourceGameIndex}:${annotation.chapterIndex}:${annotationIndex}`,
    }, [
      renderRepertoireChip(annotation.source, annotation.accentIndex),
      renderRepertoireAnnotationBlock(annotation.nags, annotation.comments, 'repertoire__annotation--position'),
    ])),
  ]);
}

function renderRepertoireSourceGroup(
  group: RepertoireExplorerSourceGroup,
  fen: string,
  redraw: () => void,
  onMoveClick?: (uci: string) => void,
  cgBoard?: CgApi,
  getCurrentFen?: () => string | null | undefined,
  restoreAutoShapes?: () => void,
): VNode {
  const accountSource = isAccountRepertoireSource(group.source);
  const accountState = group.accountBuildState;
  const accountMessage = accountSource && accountState
    ? accountState.state === 'loading'
      ? 'Loading account games...'
      : accountState.state === 'building' || accountState.state === 'publishing'
        ? `Building account model ${accountState.processedGameCount.toLocaleString()}/${accountState.filteredGameCount.toLocaleString()} games...`
        : accountState.state === 'empty'
          ? accountState.filteredGameCount === 0
            ? 'No account games match these filters.'
            : 'No account moves found after filters.'
          : accountState.state === 'error'
            ? accountState.message ?? 'Could not build this account source.'
            : group.entries.length === 0
              ? 'No account move at this position.'
              : null
    : null;
  return h(`section.repertoire__explorer-group.repertoire__accent--${group.accentIndex}`, { key: group.source.id }, [
    h('div.repertoire__explorer-group-header', [
      h('span.repertoire__source-summary', [
        renderRepertoireChip(group.source, group.accentIndex),
        accountSource ? h('span.repertoire__filter-summary', repertoireAccountFilterSummary(group.source)) : null,
      ]),
      h('button.repertoire__source-toggle', {
        attrs: {
          title: group.source.enabled ? `Disable ${group.source.name}` : `Enable ${group.source.name}`,
          'aria-label': group.source.enabled ? `Disable ${group.source.name}` : `Enable ${group.source.name}`,
        },
        class: { active: group.source.enabled },
        on: { click: () => toggleRepertoireSourceFromExplorer(group.source, redraw, restoreAutoShapes) },
      }, group.source.enabled ? 'On' : 'Off'),
    ]),
    group.expectedReply
      ? h('div.repertoire__expected-reply', 'Expected replies from the opponent line')
      : null,
    renderRepertoireMoveRows(group, fen, redraw, onMoveClick, cgBoard, getCurrentFen, restoreAutoShapes),
    accountMessage ? h('div.repertoire__account-empty', accountMessage) : null,
  ]);
}

function moveNumberLabel(position: RepertoireExplorerLinePosition<unknown> | null): string {
  if (!position?.ply) return '';
  return `move ${Math.max(1, Math.ceil(position.ply / 2))}`;
}

function renderRepertoireOutOfLine<Path>(
  match: RepertoireExplorerPriorMatch<Path> | null,
  onJumpToPrior?: (path: Path) => void,
): VNode {
  const leftBy = match?.leftBy ?? null;
  const moveLabel = leftBy?.san
    ? ` since ${leftBy.san}${moveNumberLabel(leftBy) ? ` (${moveNumberLabel(leftBy)})` : ''}`
    : '';
  const canJump = match?.matched.path !== undefined && onJumpToPrior;
  return h('div.repertoire__out-of-line', [
    h('span', match ? `Out of repertoire${moveLabel}.` : 'No repertoire match for this line.'),
    canJump
      ? h('button.repertoire__jump', {
          attrs: {
            title: 'Jump to deepest repertoire match',
            'aria-label': 'Jump to deepest repertoire match',
          },
          on: { click: () => onJumpToPrior(match.matched.path as Path) },
        }, 'Jump')
      : null,
  ]);
}

function renderRepertoireExplorerPanel<Path = unknown>(
  fen: string | null,
  redraw: () => void,
  opts: {
    line?: RepertoireExplorerLinePosition<Path>[];
    onMoveClick?: (uci: string) => void;
    onJumpToPrior?: (path: Path) => void;
    cgBoard?: CgApi;
    getCurrentFen?: () => string | null | undefined;
    restoreAutoShapes?: () => void;
  } = {},
): VNode {
  if (!fen) return h('div.openings__explorer-empty', 'No position selected.');
  if (!repertoireSourcesLoaded()) {
    loadRepertoireSources(redraw);
    return h('div.openings__explorer-box', { class: { loading: true } }, [
      h('div.overlay'),
      h('div.openings__explorer-message', h('p', 'Loading repertoire sources...')),
    ]);
  }
  if (repertoireSourcesError()) {
    return h('div.openings__explorer-box', [
      h('div.openings__explorer-message', [
        h('strong', 'Could not load repertoire sources'),
        h('p.openings__explorer-explanation', 'Open Study Library and try again.'),
      ]),
    ]);
  }

  ensureRepertoireAccountSourceBuilds(redraw);
  const model = buildRepertoireExplorerModel(repertoireSources(), fen, opts.line);
  if (model.sources.length === 0) {
    return h('div.openings__explorer-box', [
      h('div.openings__explorer-message', [
        h('strong', 'No repertoire sources'),
        h('p.openings__explorer-explanation', [
          'Upload a repertoire PGN in ',
          h('a.repertoire__empty-link', {
            attrs: {
              href: '#/study',
              title: 'Open Study Library to upload a repertoire PGN',
              'aria-label': 'Open Study Library to upload a repertoire PGN',
            },
          }, 'Study Library'),
          '.',
        ]),
      ]),
    ]);
  }
  if (model.enabledSources.length === 0) {
    return h('div.openings__explorer-box', [
      h('div.openings__explorer-message', [
        h('strong', 'No sources enabled'),
        h('p.openings__explorer-explanation', 'Enable a repertoire source in Study Library.'),
      ]),
    ]);
  }

  return h('div.openings__explorer-box.repertoire__explorer-box', [
    h('div.repertoire__explorer-list',
      model.groups.map(group => renderRepertoireSourceGroup(
        group,
        fen,
        redraw,
        opts.onMoveClick,
        opts.cgBoard,
        opts.getCurrentFen,
        opts.restoreAutoShapes,
      )),
    ),
    !model.hasCurrentMatch && !model.hasPendingAccountBuild
      ? renderRepertoireOutOfLine(model.deepestPriorMatch, opts.onJumpToPrior)
      : null,
    renderRepertoirePositionAnnotations(model.positionAnnotations),
    _repertoireExplorerNotice ? h('div.repertoire__source-status', _repertoireExplorerNotice) : null,
  ]);
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

// ========== Lichess Explorer comparison ==========

/**
 * Tablebase view — renders per-move outcome badges and DTZ/DTM data.
 * Adapted from lichess-org/lila: ui/analyse/src/explorer/tablebaseView.ts
 */

/** Which result class to apply based on category and side to move.
 *  In Lichess's naming: 'loss' means the side to move WINS (opponent loses).
 *  'win' means the side to move LOSES (opponent wins).
 *  Adapted from lichess-org/lila: ui/analyse/src/explorer/explorerUtil.ts winnerOf()
 */
function tablebaseCategoryClass(fen: string, category: TablebaseCategory): string {
  const turnWhite = (fen.split(' ')[1] ?? 'w') === 'w';
  if (category === 'loss' || category === 'blessed-loss' || category === 'syzygy-loss' || category === 'maybe-loss') {
    return turnWhite ? 'white' : 'black';
  }
  if (category === 'win' || category === 'cursed-win' || category === 'syzygy-win' || category === 'maybe-win') {
    return turnWhite ? 'black' : 'white';
  }
  return 'draws';
}

const CATEGORY_LABELS: Record<TablebaseCategory, string> = {
  'loss':         'Winning',
  'maybe-loss':   'Win or 50-move',
  'blessed-loss': 'Win (prevented by 50-move)',
  'syzygy-loss':  'Win (prior mistake)',
  'unknown':      'Unknown',
  'draw':         'Draw',
  'cursed-win':   'Loss (saved by 50-move)',
  'maybe-win':    'Loss or 50-move',
  'syzygy-win':   'Loss (prior mistake)',
  'win':          'Losing',
};

function renderTablebaseMoveRow(fen: string, move: TablebaseMoveStats, onMoveClick: (uci: string) => void): VNode {
  const cls = tablebaseCategoryClass(fen, move.category);
  const badge: VNode[] = [];
  if (move.checkmate)              badge.push(h(`result.${cls}`, 'Checkmate'));
  else if (move.stalemate)         badge.push(h('result.draws', 'Stalemate'));
  else if (move.insufficient_material) badge.push(h('result.draws', 'Insufficient'));
  else if (move.dtz === 0)         badge.push(h('result.draws', 'Draw'));
  else if (move.dtz !== undefined) badge.push(h(`result.${cls}`, { attrs: { title: 'Distance To Zeroing' } }, `DTZ ${Math.abs(move.dtz)}`));
  else if (move.dtm !== undefined) badge.push(h(`result.${cls}`, { attrs: { title: 'Distance To Mate' } }, `DTM ${Math.abs(move.dtm)}`));
  else                             badge.push(h(`result.${cls}`, CATEGORY_LABELS[move.category] ?? move.category));

  return h('tr.tablebase__row', {
    attrs: { 'data-uci': move.uci },
    on: { click: () => onMoveClick(move.uci) },
  }, [
    h('td.tablebase__san', move.san),
    h('td.tablebase__result', badge),
  ]);
}

function renderTablebaseSection(
  fen: string,
  title: string,
  moves: TablebaseMoveStats[],
  onMoveClick: (uci: string) => void,
): VNode | null {
  if (!moves.length) return null;
  return h('div.tablebase__section', [
    h('div.tablebase__section-title', title),
    h('table.tablebase', [
      h('tbody', moves.map(m => renderTablebaseMoveRow(fen, m, onMoveClick))),
    ]),
  ]);
}

/**
 * Full tablebase panel — groups moves by outcome category.
 * Mirrors lichess-org/lila: ui/analyse/src/explorer/explorerView.ts tablebase block.
 */
function renderTablebasePanel(data: TablebaseData, _redraw: () => void): VNode {
  const onMoveClick = (uci: string) => {
    explorerCtrl.hovering = { fen: data.fen, uci };
    _redraw();
  };

  if (data.checkmate) return h('div.openings__explorer-box', [h('div.openings__explorer-message', [h('strong', 'Checkmate')])]);
  if (data.stalemate) return h('div.openings__explorer-box', [h('div.openings__explorer-message', [h('strong', 'Stalemate')])]);

  const sections = [
    renderTablebaseSection(data.fen, 'Winning',                data.moves.filter(m => m.category === 'loss'),        onMoveClick),
    renderTablebaseSection(data.fen, 'Win or 50-move draw',    data.moves.filter(m => m.category === 'maybe-loss'),  onMoveClick),
    renderTablebaseSection(data.fen, 'Win (50-move)',           data.moves.filter(m => m.category === 'blessed-loss'),onMoveClick),
    renderTablebaseSection(data.fen, 'Win (prior mistake)',     data.moves.filter(m => m.category === 'syzygy-loss'), onMoveClick),
    renderTablebaseSection(data.fen, 'Unknown',                 data.moves.filter(m => m.category === 'unknown'),     onMoveClick),
    renderTablebaseSection(data.fen, 'Drawing',                 data.moves.filter(m => m.category === 'draw'),        onMoveClick),
    renderTablebaseSection(data.fen, 'Loss (50-move)',          data.moves.filter(m => m.category === 'cursed-win'),  onMoveClick),
    renderTablebaseSection(data.fen, 'Loss or 50-move draw',   data.moves.filter(m => m.category === 'maybe-win'),   onMoveClick),
    renderTablebaseSection(data.fen, 'Loss (prior mistake)',    data.moves.filter(m => m.category === 'syzygy-win'),  onMoveClick),
    renderTablebaseSection(data.fen, 'Losing',                  data.moves.filter(m => m.category === 'win'),         onMoveClick),
  ].filter(Boolean) as VNode[];

  return h('div.openings__explorer-box.tablebase-view', [
    h('div.tablebase__header', [
      h('span.tablebase__label', 'Tablebase'),
      h('span.tablebase__pieces', `${data.moves.length} move${data.moves.length !== 1 ? 's' : ''}`),
    ]),
    sections.length ? h('div.tablebase__body', sections) : h('div.openings__explorer-message', 'No tablebase data for this position.'),
  ]);
}

/**
 * Render the appropriate error box for a failed explorer request.
 * 401 errors get a "Connect to Lichess" prompt instead of the generic message.
 */
function renderPlayerNamePrompt(redraw: () => void): VNode {
  return h('div.openings__explorer-box', [
    h('div.openings__explorer-message', [
      h('strong', 'Enter a player name'),
      h('p.openings__explorer-explanation', 'Open the settings panel and enter a Lichess username to search player games.'),
      h('button.openings__explorer-retry', {
        on: { click: () => { explorerCtrl.toggleConfig(); redraw(); } },
      }, 'Open settings'),
    ]),
  ]);
}

function connectBookAccess(fen: string, redraw: () => void): void {
  _bookAuthNotice = '';
  void requestBookLogin(redraw).then(() => {
    explorerCtrl.reload(fen, redraw);
    redraw();
  }).catch(error => {
    explorerCtrl.loading = false;
    explorerCtrl.failing = error instanceof Error ? error : new Error('Lichess book login failed.');
    redraw();
  });
}

function resetBookConnection(redraw: () => void): void {
  _bookAuthNotice = 'Resetting Lichess book connection...';
  explorerCtrl.loading = true;
  explorerCtrl.failing = null;
  redraw();

  void clearLichessApiLoginData().then(result => {
    explorerCtrl.loading = false;
    explorerCtrl.failing = new ExplorerBookAuthError();
    _bookAuthNotice = result.warnings.length > 0
      ? `Browser Lichess login data cleared. ${result.warnings.join(' ')}`
      : 'Lichess book connection reset. Connect to Lichess again.';
    redraw();
  }).catch(error => {
    explorerCtrl.loading = false;
    explorerCtrl.failing = error instanceof Error ? error : new Error('Failed to reset Lichess book connection.');
    _bookAuthNotice = '';
    redraw();
  });
}

function renderExplorerErrorBox(err: Error, fen: string, redraw: () => void): VNode {
  const isAuthError = isExplorerBookAuthError(err)
    || err.message.includes('401')
    || err.message.includes('Unauthorized')
    || err.message.includes('Not connected');
  if (isAuthError) {
    return h('div.openings__explorer-box', { class: { reduced: true } }, [
      h('div.overlay'),
      h('div.openings__explorer-message', [
        h('strong', 'Lichess book access required'),
        h('p.openings__explorer-explanation', 'The opening book uses a separate Lichess connection.'),
        _bookAuthNotice
          ? h('p.openings__explorer-explanation.openings__explorer-explanation--notice', _bookAuthNotice)
          : null,
        h('div.openings__explorer-auth-actions', [
          h('button.openings__explorer-connect-btn', {
            attrs: { type: 'button' },
            on: { click: () => connectBookAccess(fen, redraw) },
          }, 'Connect to Lichess'),
          h('button.openings__explorer-retry.openings__explorer-reset-btn', {
            attrs: { type: 'button' },
            on: { click: () => resetBookConnection(redraw) },
          }, 'Reset connection'),
        ]),
      ]),
    ]);
  }
  return h('div.openings__explorer-box', { class: { reduced: true } }, [
    h('div.overlay'),
    h('div.openings__explorer-message', [
      h('h3', 'Oops, sorry!'),
      h('p.openings__explorer-explanation', err.message),
      h('button.openings__explorer-retry', {
        on: { click: () => { explorerCtrl.reload(fen, redraw); redraw(); } },
      }, 'Retry'),
    ]),
  ]);
}

function renderExplorerToggle(node: OpeningTreeNode | null, redraw: () => void): VNode | null {
  if (!explorerCtrl.enabled) return null;
  return h('div.openings__explorer', [
    h('div.openings__explorer-header', [
      h('button.openings__explorer-gear', {
        attrs: { title: 'Configure explorer', 'aria-label': 'Configure explorer' },
        on: { click: () => { explorerCtrl.toggleConfig(); redraw(); } },
      }, '\u2699\uFE0F'),
    ]),
    renderExplorerDbTabs(node, redraw),
    explorerCtrl.configOpen ? renderExplorerConfigPanel(redraw) : renderExplorerPanel(node, redraw),
  ]);
}

function renderExplorerDbTabs(node: OpeningTreeNode | null, redraw: () => void, restoreAutoShapes: () => void = restoreOpeningsExplorerAutoShapes): VNode {
  const db = explorerCtrl.config.db;
  const setDb = (d: ExplorerDb) => {
    explorerCtrl.setDb(d);
    if (node && d !== 'repertoire') explorerCtrl.setNode(node.fen, redraw);
    restoreAutoShapes();
    redraw();
  };
  return h('div.openings__explorer-tabs', [
    h(`button.openings__explorer-tab${db === 'masters' ? '.active' : ''}`, {
      attrs: { title: 'Show Masters explorer', 'aria-label': 'Show Masters explorer' },
      on: { click: () => setDb('masters') },
    }, 'Masters'),
    h(`button.openings__explorer-tab${db === 'lichess' ? '.active' : ''}`, {
      attrs: { title: 'Show Lichess explorer', 'aria-label': 'Show Lichess explorer' },
      on: { click: () => setDb('lichess') },
    }, 'Lichess'),
    h(`button.openings__explorer-tab${db === 'player' ? '.active' : ''}`, {
      attrs: { title: 'Show Player explorer', 'aria-label': 'Show Player explorer' },
      on: { click: () => setDb('player') },
    }, 'Player'),
    h(`button.openings__explorer-tab${db === 'repertoire' ? '.active' : ''}`, {
      attrs: { title: 'Show Repertoire explorer', 'aria-label': 'Show Repertoire explorer' },
      on: { click: () => setDb('repertoire') },
    }, 'Repertoire'),
  ]);
}

/**
 * Config panel — DB-specific filter controls.
 * Adapted from lichess-org/lila: ui/analyse/src/explorer/explorerConfig.ts view()
 */
function renderExplorerConfigPanel(redraw: () => void): VNode {
  const cfg = explorerCtrl.config;
  const db = cfg.db;

  const toggleBtn = <T>(label: string, active: boolean, onClick: () => void) =>
    h('button.openings__explorer-filter-btn', {
      class: { active },
      on: { click: () => { onClick(); redraw(); } },
    }, label);

  const speedSection = () => h('div.openings__explorer-config-section', [
    h('label', 'Time control'),
    h('div.openings__explorer-filter-row',
      ALL_SPEEDS.map(s => toggleBtn(s, cfg.speeds.includes(s), () => cfg.toggleSpeed(s))),
    ),
  ]);

  const ratingSection = () => h('div.openings__explorer-config-section', [
    h('label', 'Avg rating'),
    h('div.openings__explorer-filter-row',
      ALL_RATINGS.map(r => toggleBtn(String(r), cfg.ratings.includes(r), () => cfg.toggleRating(r))),
    ),
  ]);

  const modeSection = () => h('div.openings__explorer-config-section', [
    h('label', 'Mode'),
    h('div.openings__explorer-filter-row',
      ALL_MODES.map(m => toggleBtn(m, cfg.modes.includes(m), () => cfg.toggleMode(m))),
    ),
  ]);

  const dateInput = (label: string, value: string, onChange: (v: string) => void, type: 'number' | 'month') =>
    h('label.openings__explorer-date-label', [
      label,
      h('input', {
        attrs: { type, value, placeholder: type === 'number' ? 'YYYY' : 'YYYY-MM', min: type === 'number' ? '1952' : '1952-01' },
        on: { change: (e: Event) => { onChange((e.target as HTMLInputElement).value); redraw(); } },
      }),
    ]);

  const dateSection = (type: 'number' | 'month') =>
    h('div.openings__explorer-config-section', [
      dateInput('Since', cfg.since(), v => cfg.setSince(v), type),
      dateInput('Until', cfg.until(), v => cfg.setUntil(v), type),
    ]);

  const playerSection = () => h('div.openings__explorer-config-section', [
    h('label', 'Player'),
    h('input.openings__explorer-player-input', {
      attrs: { type: 'text', placeholder: 'Lichess username', value: cfg.playerName },
      on: {
        change: (e: Event) => {
          cfg.setPlayerName((e.target as HTMLInputElement).value.trim());
          redraw();
        },
      },
    }),
    cfg.playerPrevious.length ? h('div.openings__explorer-player-prev',
      cfg.playerPrevious.slice(0, 10).map(name =>
        h('button.openings__explorer-prev-btn', {
          on: { click: () => { cfg.setPlayerName(name); redraw(); } },
        }, name),
      ),
    ) : null,
    h('div.openings__explorer-color-row', [
      h('label', 'Color'),
      toggleBtn('White', cfg.color === 'white', () => { cfg.color = 'white'; }),
      toggleBtn('Black', cfg.color === 'black', () => { cfg.color = 'black'; }),
    ]),
  ]);

  const sections: VNode[] = [];
  if (db === 'masters') sections.push(dateSection('number'));
  if (db === 'lichess') { sections.push(speedSection(), ratingSection(), dateSection('month')); }
  if (db === 'player') { sections.push(playerSection(), speedSection(), modeSection(), dateSection('month')); }

  return h('div.openings__explorer-config', [
    ...sections,
    h('button.openings__explorer-config-close', {
      on: { click: () => { explorerCtrl.toggleConfig(); redraw(); } },
    }, 'Done'),
  ]);
}

/**
 * Explorer panel — handles all four UI states: loading, error, empty, and data.
 * Mirrors lichess-org/lila: ui/analyse/src/explorer/explorerView.ts main() function.
 *
 * - Preserves stale cached data under a loading overlay (`.loading` class)
 * - `.reduced` class when movesAway > 2 (position moved far from book)
 * - "Max depth reached" when at or beyond MAX_EXPLORER_DEPTH
 * - Queue position message when player DB is indexing
 * - Error state with retry button
 */
function renderExplorerPanel(node: OpeningTreeNode | null, redraw: () => void): VNode {
  if (!node) return h('div.openings__explorer-empty', 'No position selected.');
  if (explorerCtrl.config.db === 'repertoire') {
    return renderRepertoireExplorerPanel(node.fen, redraw, {
      line: repertoireLineForOpenings(sessionPath()),
      onMoveClick: (uci: string) => {
        playOpeningsExplorerMove(uci, redraw);
      },
      onJumpToPrior: (path: readonly string[]) => {
        navigateToPath([...path]);
        syncOpeningsBoard(redraw);
        redraw();
      },
      getCurrentFen: currentOpeningsBoardFen,
      restoreAutoShapes: restoreOpeningsExplorerAutoShapes,
    });
  }

  const data = explorerCtrl.current(node.fen);
  if (!data && !explorerCtrl.loading && !explorerCtrl.failing && !explorerCtrl.needsPlayerName) {
    explorerCtrl.setNode(node.fen, redraw);
  }

  const loading = explorerCtrl.loading;
  const failing = explorerCtrl.failing;
  const movesAway = explorerCtrl.movesAway;
  const isMasters = explorerCtrl.config.db === 'masters';

  // Player DB needs a username before we can fetch
  if (explorerCtrl.needsPlayerName) return renderPlayerNamePrompt(redraw);

  // Tablebase mode — ≤7 pieces
  if (explorerCtrl.tablebaseData) return renderTablebasePanel(explorerCtrl.tablebaseData, redraw);

  // Error state — 401 shows a connect prompt; other errors show retry
  if (failing && !data) return renderExplorerErrorBox(failing, node.fen, redraw);

  // Empty state — no data and no longer loading
  if (!loading && !data) {
    const tooDeep = movesAway >= MAX_EXPLORER_DEPTH;
    const queuePos = (data as import('./explorer').OpeningData | undefined)?.queuePosition;
    return h('div.openings__explorer-box', { class: { reduced: movesAway > 2 } }, [
      h('div.openings__explorer-message', [
        h('strong', tooDeep ? 'Max depth reached' : 'No game found'),
        queuePos
          ? h('p.openings__explorer-explanation', `Indexing ${queuePos} other players first\u2026`)
          : !tooDeep
            ? h('p.openings__explorer-explanation', 'Try adjusting the filters.')
            : null,
      ]),
    ]);
  }

  // Data available — show with loading overlay if refreshing
  if (data) {
    const hasContent = data.moves.length > 0 || (data.topGames?.length ?? 0) > 0 || (data.recentGames?.length ?? 0) > 0;
    const queuePos = data.queuePosition;

    const content = hasContent
      ? h('div.openings__explorer-data', [
          data.opening
            ? h('div.openings__explorer-opening', data.opening.name)
            : null,
          renderExplorerMovesTable(data, node.fen, redraw),
          renderExplorerGamesTable('Top games', data.topGames ?? [], isMasters),
          renderExplorerGamesTable('Recent games', data.recentGames ?? [], isMasters),
        ])
      : h('div.openings__explorer-message', [
          h('strong', movesAway >= MAX_EXPLORER_DEPTH ? 'Max depth reached' : 'No game found'),
          queuePos
            ? h('p.openings__explorer-explanation', `Indexing ${queuePos} other players first\u2026`)
            : null,
        ]);

    return h('div.openings__explorer-box', { class: { loading, reduced: movesAway > 2 && !hasContent } }, [
      h('div.overlay'),
      content,
    ]);
  }

  // Still waiting on first response
  return h('div.openings__explorer-box', { class: { loading: true } }, [
    h('div.overlay'),
    h('div.openings__explorer-message', h('p', 'Loading\u2026')),
  ]);
}

/**
 * Top/recent games table — adapted from lichess-org/lila: ui/analyse/src/explorer/explorerView.ts showGameTable()
 * Columns: ratings (stacked), player names (stacked), result badge, month/year, speed icon (non-masters).
 * Row click opens the game on Lichess in a new tab.
 */
function renderExplorerGamesTable(
  title: string,
  games: import('./explorer').OpeningGame[],
  isMasters: boolean,
): VNode | null {
  if (!games.length) return null;
  const colSpan = isMasters ? 4 : 5;

  const resultBadge = (winner?: 'white' | 'black') =>
    winner === 'white'
      ? h('result.white', '1-0')
      : winner === 'black'
        ? h('result.black', '0-1')
        : h('result.draws', '\u00BD-\u00BD');

  const openGame = (gameId: string) => {
    const url = isMasters
      ? `https://lichess.org/import/master/${gameId}`
      : `https://lichess.org/${gameId}`;
    window.open(url, '_blank', 'noopener');
  };

  return h('table.explorer-games', [
    h('thead', h('tr', h('th', { attrs: { colspan: colSpan } }, title))),
    h('tbody',
      games.map(game =>
        h('tr', {
          key: game.id,
          attrs: { 'data-id': game.id, 'data-uci': game.uci ?? '' },
          on: { click: () => openGame(game.id) },
        }, [
          h('td.ratings', [
            h('span', String(game.white.rating)),
            h('span', String(game.black.rating)),
          ]),
          h('td.players', [
            h('span', game.white.name),
            h('span', game.black.name),
          ]),
          h('td', resultBadge(game.winner)),
          h('td.date', game.month ?? game.year ?? ''),
          !isMasters
            ? h('td.speed', game.speed ? h('span', { attrs: { title: game.speed } }, speedGlyph(game.speed)) : '')
            : null,
        ]),
      ),
    ),
  ]);
}

/** Simple text glyph for speed — no icon font required. */
function speedGlyph(speed: string): string {
  const glyphs: Record<string, string> = {
    ultraBullet: '\u26a1\u26a1', bullet: '\u26a1', blitz: '\uD83D\uDD25',
    rapid: '\u23F1', classical: '\u231B', correspondence: '\u2709',
  };
  return glyphs[speed] ?? speed;
}

/** Compact number formatter: 12400 → "12.4k", 1200000 → "1.2M". */
function compactNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Render a stacked W/D/B result bar — adapted from Lichess explorerView.ts resultBar(). */
function renderExplorerResultBar(move: OpeningMoveStats): VNode {
  const sum = move.white + move.draws + move.black || 1;
  const seg = (key: 'white' | 'draws' | 'black') => {
    const pct = (move[key] * 100) / sum;
    const width = Math.round((move[key] * 1000) / sum) / 10;
    return h(`span.${key}`, { attrs: { style: `width: ${width}%` } },
      pct > 12 ? `${Math.round(pct)}${pct > 20 ? '%' : ''}` : '');
  };
  return h('div.bar', [seg('white'), seg('draws'), seg('black')]);
}

/**
 * Lichess-style moves table with result bar, hover arrows, and click-to-play.
 * Adapted from lichess-org/lila: ui/analyse/src/explorer/explorerView.ts showMoveTable()
 * and ui/analyse/src/explorer/explorerUtil.ts moveArrowAttributes().
 *
 * @param onMoveClick — optional; defaults to openings navigateToMove. Analysis board passes its own.
 * @param cgBoard     — optional; defaults to openings board. Analysis board passes its Chessground.
 */
function renderExplorerMovesTable(
  data: import('./explorer').OpeningData,
  fen: string,
  redraw: () => void,
  onMoveClick?: (uci: string) => void,
  cgBoard?: CgApi,
  getCurrentFen: () => string | null | undefined = currentOpeningsBoardFen,
  restoreAutoShapes: () => void = restoreOpeningsExplorerAutoShapes,
): VNode {
  const sumTotal = (data.white ?? 0) + (data.draws ?? 0) + (data.black ?? 0) || 1;

  type SumRow = { uci: ''; san: string; white: number; black: number; draws: number };
  type AnyRow = OpeningMoveStats | SumRow;
  const rows: AnyRow[] = data.moves.length > 1
    ? [...data.moves, { uci: '' as '', san: '\u03A3', white: data.white ?? 0, black: data.black ?? 0, draws: data.draws ?? 0 }]
    : [...data.moves];

  const defaultMoveClick = (uci: string) => {
    playOpeningsExplorerMove(uci, redraw);
  };
  const handleMoveClick = onMoveClick ?? defaultMoveClick;
  const usesOpeningsBoard = restoreAutoShapes === restoreOpeningsExplorerAutoShapes;
  const bind = (vnode: import('snabbdom').VNode) => {
    const el = vnode.elm as ExplorerMoveRowsElement;
    bindExplorerMoveRowInteractions(el, {
      fen,
      rowSelector: 'tr',
      board: () => cgBoard ?? (usesOpeningsBoard ? _openingsCg : undefined),
      getCurrentFen,
      restoreAutoShapes,
      onMoveClick: handleMoveClick,
      onDirectAutoShapesSet: usesOpeningsBoard ? () => { _lastOpeningsAutoShapesHash = null; } : undefined,
    });
  };

  return h('table.explorer-moves', {
    hook: {
      insert: bind,
      postpatch: (_old: import('snabbdom').VNode, vnode: import('snabbdom').VNode) => bind(vnode),
    },
  }, [
    h('thead', h('tr', [
      h('th', 'Move'), h('th', '%'), h('th', 'Games'), h('th', 'W/D/B'),
    ])),
    h('tbody', rows.map(move => {
      const total = move.white + move.draws + move.black || 1;
      const isSum = move.uci === '';
      return h(isSum ? 'tr.sum' : 'tr', {
        key: move.uci || '\u03A3',
        attrs: move.uci ? { 'data-uci': move.uci } : {},
      }, [
        h('td', move.san),
        h('td', `${((total / sumTotal) * 100).toFixed(0)}%`),
        h('td', compactNum(total)),
        h('td', renderExplorerResultBar(move as OpeningMoveStats)),
      ]);
    })),
  ]);
}

// ========== Analysis board explorer integration ==========

/**
 * Explorer section for the analysis board tools column.
 * Uses the same ExplorerCtrl singleton as the openings page.
 * Adapted from lichess-org/lila: ui/analyse/src/explorer/explorerView.ts default export.
 *
 * @param fen         — current board FEN (from ctrl.node.fen)
 * @param cg          — analysis board Chessground instance (for hover arrows)
 * @param onMoveClick — called when a move row is clicked; should advance the analysis tree
 * @param redraw      — analysis board redraw function
 */
export function renderAnalysisExplorerSection(
  fen: string,
  cg: CgApi | undefined,
  onMoveClick: (uci: string) => void,
  redraw: () => void,
  line?: RepertoireExplorerLinePosition<string>[],
  onJumpToPath?: (path: string) => void,
  getCurrentFen: () => string | null | undefined = () => fen,
): VNode | null {
  if (!explorerCtrl.enabled) return null;

  const isMasters = explorerCtrl.config.db === 'masters';

  return h('div.openings__explorer', [
    h('div.openings__explorer-header', [
      h('button.openings__explorer-gear', {
        attrs: { title: 'Configure explorer', 'aria-label': 'Configure explorer' },
        on: { click: () => { explorerCtrl.toggleConfig(); redraw(); } },
      }, '\u2699\uFE0F'),
    ]),
    renderExplorerDbTabs(null, redraw, restoreAnalysisExplorerAutoShapes),
    explorerCtrl.configOpen
      ? renderExplorerConfigPanel(redraw)
      : renderAnalysisExplorerPanel(fen, isMasters, cg, onMoveClick, redraw, line, onJumpToPath, getCurrentFen),
  ]);
}

/**
 * FEN-based explorer panel for the analysis board (no OpeningTreeNode dependency).
 * Mirrors renderExplorerPanel() but uses a plain FEN and custom move/arrow callbacks.
 */
function renderAnalysisExplorerPanel(
  fen: string,
  isMasters: boolean,
  cg: CgApi | undefined,
  onMoveClick: (uci: string) => void,
  redraw: () => void,
  line?: RepertoireExplorerLinePosition<string>[],
  onJumpToPath?: (path: string) => void,
  getCurrentFen: () => string | null | undefined = () => fen,
): VNode {
  if (explorerCtrl.config.db === 'repertoire') {
    const opts: {
      line?: RepertoireExplorerLinePosition<string>[];
      onMoveClick: (uci: string) => void;
      onJumpToPrior?: (path: string) => void;
      cgBoard?: CgApi;
      getCurrentFen: () => string | null | undefined;
      restoreAutoShapes: () => void;
    } = {
      onMoveClick,
      getCurrentFen,
      restoreAutoShapes: restoreAnalysisExplorerAutoShapes,
    };
    if (line) opts.line = line;
    if (onJumpToPath) opts.onJumpToPrior = onJumpToPath;
    if (cg) opts.cgBoard = cg;
    return renderRepertoireExplorerPanel(fen, redraw, opts);
  }

  const data = explorerCtrl.current(fen);
  if (!data && !explorerCtrl.loading && !explorerCtrl.failing && !explorerCtrl.needsPlayerName) {
    explorerCtrl.setNode(fen, redraw);
  }

  const loading = explorerCtrl.loading;
  const failing = explorerCtrl.failing;
  const movesAway = explorerCtrl.movesAway;

  if (explorerCtrl.needsPlayerName) return renderPlayerNamePrompt(redraw);

  if (explorerCtrl.tablebaseData) return renderTablebasePanel(explorerCtrl.tablebaseData, redraw);

  if (failing && !data) return renderExplorerErrorBox(failing, fen, redraw);

  if (!loading && !data) {
    const tooDeep = movesAway >= MAX_EXPLORER_DEPTH;
    return h('div.openings__explorer-box', { class: { reduced: movesAway > 2 } }, [
      h('div.openings__explorer-message', [
        h('strong', tooDeep ? 'Max depth reached' : 'No game found'),
        !tooDeep ? h('p.openings__explorer-explanation', 'Try adjusting the filters.') : null,
      ]),
    ]);
  }

  if (data) {
    const hasContent = data.moves.length > 0 || (data.topGames?.length ?? 0) > 0 || (data.recentGames?.length ?? 0) > 0;
    const content = hasContent
      ? h('div.openings__explorer-data', [
          data.opening ? h('div.openings__explorer-opening', data.opening.name) : null,
          renderExplorerMovesTable(data, fen, redraw, onMoveClick, cg, getCurrentFen, restoreAnalysisExplorerAutoShapes),
          renderExplorerGamesTable('Top games', data.topGames ?? [], isMasters),
          renderExplorerGamesTable('Recent games', data.recentGames ?? [], isMasters),
        ])
      : h('div.openings__explorer-message', [
          h('strong', movesAway >= MAX_EXPLORER_DEPTH ? 'Max depth reached' : 'No game found'),
        ]);
    return h('div.openings__explorer-box', { class: { loading, reduced: movesAway > 2 && !hasContent } }, [
      h('div.overlay'),
      content,
    ]);
  }

  return h('div.openings__explorer-box', { class: { loading: true } }, [
    h('div.overlay'),
    h('div.openings__explorer-message', h('p', 'Loading\u2026')),
  ]);
}
