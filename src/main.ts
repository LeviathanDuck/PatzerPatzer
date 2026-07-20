import { init, classModule, attributesModule, propsModule, eventListenersModule, h, type VNode } from 'snabbdom';
import { INITIAL_FEN } from 'chessops/fen';
import type { Color } from 'chessops/types';

performance.mark('app-init-start');

import { AnalyseCtrl } from './analyse/ctrl';
import { activeWorkspace, mountWorkspace } from './analyse/workspaceCore';
import { runNavigate } from './analyse/workspaceNavigation';
import {
  applyBoardTheme, applyBoardZoom, applyPieceSet,
  boardWheelNavEnabled,
  reviewDotsUserOnly,
  boardFilters, boardTheme, boardThumbnailUrl, boardZoom,
  BOARD_THEMES_FEATURED,
  filtersAtDefault, piecePreviewUrl, pieceSet,
  PIECE_SETS_FEATURED,
  resetFilters, saveBoardZoom, setFilter,
  reloadBoardAppearancePreferences, resetBoardSettingsRuntimeForDataManagement,
} from './board/cosmetics';
import {
  evalCache,
  bumpEvalCacheRevision, getEvalCacheRevision,
  currentEval, resetCurrentEval, setCurrentEval, clearEvalCache,
  engineEnabled, toggleEngine, analysisDepth,
  multiPv, searchTime, searchUntilDepth,
  evalCurrentPosition,
  cancelSilentEval,
  syncArrow,
  syncArrowForced,
  initEngine,
  setRepertoireArrowShapeProvider,
  setOnLiveEvalImproved,
  setOnLiveEvalInfo,
  setOnLiveEvalUpdated,
  setExtraAutoShapesProvider,
  setExtraArrowSuppressProvider,
  visibleEvalForFen,
  resetEngineSettingsRuntimeForDataManagement,
  type PositionEval,
} from './engine/ctrl';
import {
  reviewDepth,
  REVIEW_DEPTH_CHANGED_EVENT,
  resetReviewSettingsRuntimeForDataManagement,
} from './engine/reviewProfiles';
import {
  analysisComplete,
  setAnalysisComplete,
  resetReviewStatusRuntime,
} from './engine/reviewStatus';
import {
  deriveReviewedStatusIndex,
  type ReviewedGameStatus,
} from './engine/reviewedStatusDerivation';
import { detectMissedMoments, resetMissedMomentConfigRuntimeForDataManagement } from './engine/tactics';
import {
  cgInstance, setOrientation,
  syncBoard, syncBoardAndArrow, flip,
  applyLegalBoardUserMove, completeMove, playUciMove, uciToSan,
  renderBoard, renderPromotionDialog, renderPlayerStrips,
  initGround,
  orientation,
  onBoardUserMove, onBeforeBoardUserMove,
} from './board/index';
import {
  clearPremoveQueue,
  createAnalysisPracticePremoveHost,
  getPremoveQueueStatus,
  getPremoveQueueState,
  setPlayVsComputerPremoveHost,
  type PremoveQueueClearReason,
} from './board/premoves';
import { preloadBoardSounds, playMoveSound } from './board/sound';
import {
  analysisModeSnapshotActive,
  consumeAnalysisModePriorRoute,
  invalidateAnalysisModeSnapshot,
  renderAnalysisModeToggleButton,
} from './board/analysisModeToggle';
import {
  renderCeval, renderPvBox, renderPvBoard, renderEngineSettings,
  isRetroVisibleEngineEnabled, resetRetroVisibleEngineUi,
  forceClearCevalPositionOverride,
  initCevalView,
} from './ceval/view';
import {
  renderAnalysisControls, downloadPgn, initPgnExport, copyLinePgn, isMainlinePath, buildPgn,
} from './analyse/pgnExport';
import { createBoardReviewState, type BoardReviewState } from './analyse/boardReviewState';
import { initPersist, scheduleGamePersist, flushPendingGamePersist } from './analyse/persist';
import {
  initAnalysisControls, renderMoveNavBar, renderActionMenu, renderAnalysisPracticePanel,
  initAnalysisPracticeSlot, activateAnalysisPracticeSlot, deactivateAnalysisPracticeSlot,
} from './analyse/analysisControls';



import {
  initPracticeRouteState,
  bootstrapPracticeRouteState,
  handleRouteTransition,
  reconcileRouteDestination,
} from './study/practice/routeState';
import {
  analysisDesktopLayoutVars,
  beginAnalysisDesktopSplitResize,
  handleAnalysisDesktopSplitKeydown,
} from './analyse/desktopLayout';
import { bindKeyboardHandlers, renderKeyboardHelp } from './keyboard';
import {
  renderGameList, renderGamesView, renderGamesAppearanceSettings, type GamesViewDeps,
  getUserColor, gameResult, gameSourceUrl, renderCompactGameRow,
  reloadGamesAppearancePreferences, resetGamesAccountFilterRuntimeForDataManagement,
  type GameReviewIncompleteStatus,
} from './games/view';
import { renderMoveList } from './analyse/moveList';
import {
  computeAnalysisSummary, renderAnalysisSummary,
  renderEvalBar, renderEvalGraph, renderPostGameSummaryPanel,
  resetAnalysisViewSettingsRuntimeForDataManagement,
} from './analyse/evalView';
import { validateStoredAnalysisRestoreRows } from './analyse/analysisRestoreValidation';
import { renderAnalysisRepertoireCompliance } from './analyse/repertoireComplianceView';
import {
  clearPuzzleCandidates, renderPuzzleCandidates,
  type PuzzleRenderDeps,
} from './puzzles/extract';
import {
  cancelPuzzleLibraryRouteHydration,
  hydratePuzzleLibraryRoute,
  initPuzzlePage,
  initPuzzleRoundShell,
  openPuzzleRoundRoute,
  resetGeneratedPuzzleRuntimeForDataManagement,
  resetPuzzlePgnCacheRuntimeForDataManagement,
  resetPuzzleProgressRuntimeForDataManagement,
  validatePuzzleRoundRouteId,
} from './puzzles/ctrl';
import { renderPuzzleLibrary, renderPuzzleRound, resetPuzzleRoundSaveFlow } from './puzzles/view';
import { savePuzzleDefinition, anchorSolutionLine } from './puzzles/puzzleDb';
import { clearLocalDataForTokenLogout } from './sync/dataManagement';
import { simpleHash } from './puzzles/adapters';
import type { UserLibraryPuzzleDefinition } from './puzzles/types';
import { loadResearchGame } from './openings/db';
import { renderAdminPage } from './admin/view';
import { drainReportOutboxOnInit } from './diagnostics/reporting/reportOutbox';
import {
  REMOTE_SYNC_ANALYSIS_CHANGED_EVENT,
  REMOTE_SYNC_APPLIED_EVENT,
} from './sync/remoteSync';
import { installConsoleMirror } from './diagnostics/consoleMirror';
import { initErrorCapture } from './diagnostics/errorCapture';
import { captureDeviceSignals } from './diagnostics/performance/deviceSignals';
import {
  initLongAnimationFrameObserver,
  initLongTaskObserver,
  initNavigationTimingSummary,
  initResourceTimingSummary,
} from './diagnostics/performance/observers';
import { initWebVitals } from './diagnostics/performance/webVitals';
import { initRejectionCapture } from './diagnostics/rejectionCapture';
import { record as recordDiagnostic } from './diagnostics/record';
import { currentAppRoute } from './diagnostics/route';
import {
  LEGACY_REMOTE_SYNC_OUTBOX_STORAGE_KEY,
  assertReviewStorageDiagnosticContentFree,
  buildReviewStorageCountDiagnostic,
  summarizeOutboxEntries,
  summarizeSerializedOutbox,
} from './diagnostics/reviewStorageDiagnostics';
import { initSession } from './diagnostics/session';
import { Severity } from './diagnostics/types';
import { adminDiagnosticsTokenAvailable } from './diagnostics/adminAccess';
import {
  getReviewErrorSubmitRequest,
  openReviewErrorSubmitFlow,
  renderReviewErrorPackageSubmitModal,
  type ReviewErrorCurrentEngineSettings,
} from './diagnostics/reviewError';
import {
  enqueueBulkReview, enqueueAtFront, appendBulkReviewRunSource, isBulkRunning, initReviewQueue, resumeReviewQueueFromManifest,
  setLibraryGamesForReviewQueue, setReviewRunLibrarySnapshotProvider,
  applyReviewDepthToActiveQueue, fenceReviewQueueForDataManagement, subscribeAcceptedReviewResults,
  subscribeReviewQueueState,
  suspendReviewQueueForLfym, getQueueSummary,
  requestBoardTreeReview, evictBoardTreeReview, cancelBoardTreeReview, subscribeBoardTreeReviewCompletion,
  type AcceptedReviewResult,
} from './engine/reviewQueue';
import type { ReviewRunSourceContext } from './engine/reviewRun';
import { setMissedMoments, clearMissedMoments, getMissedMoments } from './engine/tactics';
import { renderHeader, type HeaderDeps, type HeaderMobileSubmenu } from './header/index';
import { createBrowserAppearanceController, createBrowserInterfaceMotionController } from './appearance/browser';
import { createAdvancedAppearanceController } from './appearance/modal';
import { resetAppearanceAndHelpPreferences } from './appearance/reset';
import {
  ADVANCED_APPEARANCE_REQUEST_EVENT,
  type AdvancedAppearanceRequestDetail,
} from './appearance/entryPoints';
import { runClearLocalDataReset } from './appearance/fullReset';
import { renderNavigatorAppearanceSettings } from './study/navigatorSettings';
import { reloadNavigatorAppearancePreferences } from './study/navigatorSettings';
import { reloadEvalGraphAppearancePreferences } from './analyse/graphSettings';
import { SETTINGS_LIVE_APPLY_EVENT } from './sync/settingsLiveApply';
import {
  type ImportedGame, restoreGameIdCounter,
} from './import/types';
import { enqueueImportEnrichment, enqueueOpponentDeltaBackfill } from './import/enrichment';
import {
  ANALYSIS_VERSION, backfillOpenings, buildAnalysisNodes, clearAnalysisFromIdb,
  isStoredAnalysisLoadable, listAnalysisLibraryClassificationFromIdb, listGameSummaries,
  loadAnalysisFromIdb, loadGamesFromIdb, loadReviewFailureRecords, loadReviewQueueManifest,
  loadReviewRunManifests, loadUserTreeFromIdb,
  loadPuzzlesFromIdb, saveAnalysisToIdb, saveGamesToIdb, saveNavStateToIdb,
  saveRetroResult, saveUserTreeToIdb,
  savedPuzzles, savePuzzle, setSavedPuzzles,
  type RetroSessionResult, type ReviewEngineMetadata, type StoredNodeEntry,
} from './idb/index';
import { backfillGameSummaries } from './stats/extract';
import {
  DATA_MANAGEMENT_LOCAL_CHANGE_EVENT,
  dataManagementScopeMatchesGameId,
  registerDataManagementBeforeDeleteFence,
  type DataManagementLocalChangeDetail,
} from './sync/dataManagementRuntime';
import {
  defaultDurableVersionedOutboxStorage,
  readDurableVersionedOutbox,
} from './sync/versionOutbox';
import { decideRuntimeGameApply, planRemoteSyncRuntimeApply } from './sync/runtimeApply';
import { hydrateStatsRoute } from './stats/urlState';
import { renderStatsPage } from './stats/view';
import { current, onChange, parse as parseRoute, replaceHashRoute, writeHashRoute, type Route } from './router';
import { addNode, deleteNodeAt, mergeUserTreeEdits, nodeAtPath, parentAtPath, pathInit, promoteAt, pruneVariations } from './tree/ops';
import { pgnToTree } from './tree/pgn';
import type { TreeNode } from './tree/types';
import {
  hasAnalysisPlyQuery,
  analysisPlyQueryBelongsToImportedGameRoute,
  parseImportedGameRouteId,
  parsePackedResearchAnalysisRouteId,
  resolveAnalysisMainlinePlyFromQuery,
  serializeAnalysisRouteWithPly,
  serializeAnalysisSelectedGameRoute,
  serializeGenericAnalysisRoute,
} from './analyse/routeState';
import {
  initOpeningsPage,
  invalidateCollections,
  openingsSessionUrlSnapshot,
  beginOpeningsSessionStateNotificationSuppression,
  openCollection,
  presetColorFilter,
  presetSessionDateRange,
  presetSpeedFilter,
  refreshOpeningsSource,
  invalidateOpeningsSourceRefresh,
  shouldRefreshAccountSession,
  shouldInvalidateOpeningsOnRouteChange,
  resolveOpeningsRouteStateColor,
  restoreActiveOpeningsSessionFromUrlState,
  setBoardOrientation,
  setActiveTool,
  setOpeningsSessionStateChangeHandler,
  setRouteRecoveryMessage,
  skipNextSavedSessionResume,
  type OpeningsSessionStateChangeHandler,
} from './openings/ctrl';
import {
  renderOpeningsPage,
  resetOpeningsSaveFlow,
  setOpeningsAnalysisModeEntryHandler,
  syncOpeningsBoard,
} from './openings/view';
import { renderAnalysisExplorerSection } from './openings/explorerView';
import { explorerCtrl } from './openings/explorerCtrl';
import { currentGenerationToken, isGenerationCurrent, isRapid, markNav, onSettle } from './openings/scheduler';
import { resolveOpponentsRouteTarget } from './openings/routeTarget';
import {
  createOpponentsUrlSnapshotScheduler,
  describeOpponentsInvalidParams,
  isOpponentsTreeRoute,
  opponentsEntryHref,
  opponentsRouteTargetRecoveryMessage,
} from './openings/routeOrchestration';
import {
  parseOpponentsTreeUrlState,
  type OpponentsTreeUrlState,
} from './openings/urlState';
import { buildMainlineOpeningProvider, buildRetroCandidates } from './analyse/retro';
import type { RetroCandidate } from './analyse/retro';
import {
  RETRO_CHOICE_SEVERITY_PRESETS,
  buildRetroConfigPreview,
  cloneRetroChoiceSelection,
  createDefaultRetroChoiceSelection,
  filterRetroCandidatesForChoice,
  summarizeRetroChoiceCounts,
  type RetroChoiceSelection,
} from './analyse/retroChoice';
import { makeRetroCtrl } from './analyse/retroCtrl';
import { onRetroConfigChange, retroConfig, resetRetroConfigRuntimeForDataManagement } from './analyse/retroConfig';
import { initRetroMoveHandler } from './analyse/retroMoveHandler';
import {
  renderRetroChoicePage, renderRetroEntry, renderRetroStrip, renderActiveLfymSaveFlowModal,
  resetLfymSaveFlow,
} from './analyse/retroView';
import { renderAnnotationPanel } from './analyse/annotationView';
import { openAnnotationPanel } from './analyse/annotationCtrl';
import {
  clearPendingPracticeStart,
  consumePendingPracticeStart,
  initPractice,
  practiceActive,
  practiceOnCeval,
  practiceOnJump,
  practiceOnUserMove,
  practicePostUserJump,
  practicePreUserJump,
  practiceShapes,
  startPractice,
  stopPractice,
} from './analyse/practice/practiceCtrl';
import { renderPracticeBox, renderPracticeRail } from './analyse/practice/practiceView';


import {
  initEngineDrillHost,
  engineDrillActive,
  engineDrillOnUserMove,
  engineDrillOnCeval,
  engineDrillReadoutVnode,
} from './study/practice/engineDrillHost';
import { scoringEvalOf } from './study/practice/engineDrillCtrl';




import QuestionnaireCtrl from './analyse/questionnaire/questionnaireCtrl';
import renderQuestionnaire from './analyse/questionnaire/questionnaireView';
import { renderStudyLibrary, renderStudyDetailShell } from './study/libraryView';
import EditorCtrl, { type EditorConfig } from './editor/ctrl';
import renderEditor, { resetEditorSaveFlow } from './editor/view';
import { saveCurrentToLibrary } from './study/saveAction';
import { autoFileStudiedGame } from './study/questionnaireAutoFile';
import SaveFlowCtrl, { type SaveFlowContext, type SaveFlowResult } from './save/saveFlowCtrl';
import renderSaveFlowModal from './save/saveFlowView';
import { cancelStudyDetailRouteHydration, flushStudyDetailPersistence, unmountStudyWorkspace } from './study/studyDetailCtrl';
import { isDrillActive, endDrill } from './study/practice/drillView';
import {
  bumpSelectionSurface,
  cancelStudyLibraryRouteHydration,
  hydrateStudyLibraryRoute,
  loadRepertoireSources,
  repertoireSources,
  repertoireSourcesError,
  repertoireSourcesLoaded,
  setStudyGameEnrichmentSource,
} from './study/studyCtrl';
import { buildRepertoireArrowShapes } from './repertoire/arrowShapes';
import { invalidateAccountRepertoireBuilds } from './repertoire/accountSource';
import { showToast } from './ui/toast';
import { controlExplainerAttrs, iconControlExplainerAttrs, initControlExplainers } from './ui/controlExplainer';
import { createBrowserControlHelpController } from './ui/controlHelpPreferences';
import { initBrowserTeachingHelp } from './ui/teachingHelp';
import { TEACHING_TIPS } from './ui/teachingRegistry';
import { listAccounts, type ChessAccount } from './accounts';

console.log('Chess Patzer');
installConsoleMirror();
initSession();
initErrorCapture();
initRejectionCapture();
initWebVitals();
initLongTaskObserver();
initLongAnimationFrameObserver();
initNavigationTimingSummary();
initResourceTimingSummary(currentAppRoute('/'));
captureDeviceSignals();

const patch = init([classModule, attributesModule, propsModule, eventListenersModule]);
const appearanceController = createBrowserAppearanceController();
appearanceController.subscribe(() => redraw());
const interfaceMotionController = createBrowserInterfaceMotionController();
interfaceMotionController.subscribe(() => redraw());
const controlHelpController = createBrowserControlHelpController();
controlHelpController.subscribe(() => redraw());
void controlHelpController.initialize();
const advancedAppearanceController = createAdvancedAppearanceController({ redraw });
window.addEventListener(ADVANCED_APPEARANCE_REQUEST_EVENT, event => {
  const detail = (event as CustomEvent<AdvancedAppearanceRequestDetail>).detail;
  if (detail?.section) advancedAppearanceController.open(detail.section, detail.opener);
});
window.addEventListener(SETTINGS_LIVE_APPLY_EVENT, () => {
  appearanceController.reloadPreference();
  interfaceMotionController.reloadPreference();
  reloadBoardAppearancePreferences();
  reloadEvalGraphAppearancePreferences();
  reloadGamesAppearancePreferences();
  reloadNavigatorAppearancePreferences();
  redraw();
});
const PUBLIC_SOURCE_URL = 'https://github.com/LeviathanDuck/PatzerPatzer';
const PUBLIC_LICENSE_URL = `${PUBLIC_SOURCE_URL}/blob/main/LICENSE`;
const PLATFORM_DISCLAIMER = 'Chess Patzer is not affiliated with or endorsed by Chess.com or Lichess.';
const NAV_STATE_SAVE_MS = 500;

/** True when the game id is a canonical platform game id (set by the import adapters). */
function hasPlatformGameId(game: ImportedGame): boolean {
  return game.id.startsWith('lichess:') || game.id.startsWith('chesscom:');
}

/**
 * Composite fallback key for games without a platform id (PGN paste, or
 * adapter games whose game URL failed to parse).
 * Avoids holding full PGN strings in the dedup Set (anti-pattern AP-6).
 * Format: "white:black:date:result" — compact (~40 chars vs ~10 KB per PGN).
 */
function gameCompositeKey(game: ImportedGame): string {
  return `${game.white ?? ''}:${game.black ?? ''}:${game.date ?? ''}:${game.result ?? ''}`;
}

/**
 * Dedupe by canonical game id: platform ids are globally unique, so re-imports
 * and overlapping batches drop out by construction, while distinct same-day
 * games against the same opponent both survive. Games without a platform id
 * fall back to the composite key so pasting the same PGN twice still dedupes.
 */
function dedupeImportedGames(existing: ImportedGame[], incoming: ImportedGame[]): ImportedGame[] {
  const seenIds = new Set(existing.map(g => g.id));
  const seenKeys = new Set(existing.filter(g => !hasPlatformGameId(g)).map(gameCompositeKey));
  const deduped: ImportedGame[] = [];
  const importedAt = Date.now();
  for (const game of incoming) {
    if (seenIds.has(game.id)) continue;
    if (!hasPlatformGameId(game)) {
      const key = gameCompositeKey(game);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
    }
    seenIds.add(game.id);
    deduped.push({ ...game, importedAt });
  }
  return deduped;
}

// Callbacks injected into import adapters so they can mutate app state
// without creating a circular import on main.ts.
const importCallbacks = {
  addGames(games: ImportedGame[], _first: ImportedGame): void {
    const dedupedGames = dedupeImportedGames(importedGames, games);
    const chesscomIncomingCount = games.filter(game => game.source === 'chesscom').length;
    if (chesscomIncomingCount > 0) {
      const chesscomAddedCount = dedupedGames.filter(game => game.source === 'chesscom').length;
      const dropCount = chesscomIncomingCount - chesscomAddedCount;
      if (dropCount > 0) {
        recordDiagnostic({
          kind: 'api',
          severity: Severity.Info,
          source: 'main.importCallbacks',
          sourceTag: 'import',
          message: 'chesscom-dedupe-drop',
          metadata: {
            platform: 'chesscom',
            dropCount,
            incomingCount: chesscomIncomingCount,
          },
          redactionClass: 'safe',
        });
      }
    }
    const first = dedupedGames[0];
    if (!first) {
      redraw();
      return;
    }
    setImportedGames([...importedGames, ...dedupedGames]);



    flushPendingGamePersist();
    selectedGameId = first.id;
    performance.mark('import-batch-start');
    void saveGamesToIdb(importedGames).finally(() => {
      performance.mark('import-batch-end');
    });
    refreshRegisteredAccounts(); // adapters may have registered a new account

    enqueueImportEnrichment(dedupedGames, { onGameEnriched: applyEnrichmentPatch });
    loadGame(first.pgn); // calls redraw
  },
  redraw(): void { redraw(); },
};

interface SyncedGamesOutcome {
  addedCount: number;
}

function addSyncedGames(games: ImportedGame[]): SyncedGamesOutcome {
  const dedupedGames = dedupeImportedGames(importedGames, games);
  const alreadyImportedCount = games.length - dedupedGames.length;
  recordDiagnostic({
    kind: 'lifecycle',
    severity: Severity.Info,
    source: 'main.addSyncedGames',
    sourceTag: 'import',
    message: 'import-filter-summary',
    metadata: {
      incomingCount: games.length,
      addedCount: dedupedGames.length,
      filters: { 'already-imported': alreadyImportedCount },
    },
    redactionClass: 'safe',
  });
  if (dedupedGames.length === 0) {
    redraw();
    return { addedCount: 0 };
  }
  setImportedGames([...importedGames, ...dedupedGames]);
  // RWP-005 / AUD-0006 (Sol design consult, fix shape B): this callback is
  // intentionally persistence-free. Account sync already durably persisted
  // result.newGames via the delta path (saveGamesDeltaToIdb) and resolved that
  // write BEFORE the header invoked this callback, and enrichment persists each
  // enriched game via saveGameToIdb before onGameEnriched fires. A full-library
  // saveGamesToIdb(importedGames) here re-put every existing row, rewrote the
  // legacy game-library/imported-games aggregate, and enqueued one sync-outbox
  // item per row — redundant churn racing the authoritative writes. Removed.
  refreshRegisteredAccounts();

  enqueueImportEnrichment(dedupedGames, { onGameEnriched: applyEnrichmentPatch });
  redraw();
  return { addedCount: dedupedGames.length };
}

const SAMPLE_PGN = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7';
const BLANK_ANALYSIS_PGN = [
  '[Event "?"]',
  '[Site "ChessPatzer"]',
  '[Date "????.??.??"]',
  '[White "?"]',
  '[Black "?"]',
  '[Result "*"]',
  '',
  '*',
].join('\n');

let importedGames: ImportedGame[] = [];
setReviewRunLibrarySnapshotProvider(() => importedGames);

function setImportedGames(next: ImportedGame[]): void {
  importedGames = next;
  setLibraryGamesForReviewQueue(importedGames);
  invalidateAccountRepertoireBuilds();
}






function applyEnrichmentPatch(gameId: string, patch: Partial<ImportedGame>): void {
  const idx = importedGames.findIndex(g => g.id === gameId);
  if (idx === -1) return;
  const next = importedGames.slice();
  next[idx] = { ...next[idx]!, ...patch };
  setImportedGames(next);
  redraw();
}
// Registered chess accounts cache for the games-view account lens.
// Loaded at boot and refreshed after imports (adapters register accounts).
let registeredAccounts: ChessAccount[] = [];
let registeredAccountsHydrationGeneration = 0;

function refreshRegisteredAccounts(): void {
  const generation = ++registeredAccountsHydrationGeneration;
  void listAccounts().then(accounts => {
    if (generation !== registeredAccountsHydrationGeneration) return;
    registeredAccounts = accounts;
    redraw();
  });
}
let selectedGameId: string | null = null;
let selectedGamePgn: string | null = null;
let syntheticAnalysisBoardCreatedAt: number | null = null;
let savedAnalysisBoardSignature = '';
/**
 * True once the initial IDB game-library load attempt has completed (whether the
 * stored library was empty or had games). Used to distinguish "still loading" from
 * "genuinely empty" in route rendering.
 */
let gamesLibraryLoaded = false;
/**
 * True when the initial (or latest) IDB game-library hydration REJECTED with a storage failure
 * rather than resolving. Distinguishes "storage error" from "genuinely empty library" so the
 * games surfaces render an honest error state instead of the empty state (BUG-2026-07-10-007).
 * `gamesLibraryLoaded` is still set true alongside it so the loading skeletons release (a rejected
 * hydration must not eternal-spin the shell); this flag routes those released surfaces to the
 * error card. Cleared on any subsequent successful hydration.
 */
let gameLibraryHydrationError = false;
let gameLibraryHydrationGeneration = 0;






function analysisMoveListGetEval(path: string): PositionEval | undefined {
  return evalCache.get(path);
}

// --- Move-list context menu state ---
// Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts contextMenuPath
let contextMenuPath: string | null = null;
let contextMenuPos:  { x: number; y: number } | null = null;
let _contextMenuCloseListener: (() => void) | null = null;

function openContextMenu(path: string, e: MouseEvent): void {
  contextMenuPath = path;
  const targetRect = (e.currentTarget as HTMLElement | null)?.getBoundingClientRect?.();
  contextMenuPos  = {
    x: e.clientX || targetRect?.left || 0,
    y: e.clientY || targetRect?.top || 0,
  };
  // Close on next click anywhere on the document.
  // Mirrors lichess-org/lila: contextMenu.ts document.addEventListener('click', close)
  if (_contextMenuCloseListener) document.removeEventListener('click', _contextMenuCloseListener);
  _contextMenuCloseListener = () => {
    contextMenuPath = null;
    contextMenuPos  = null;
    _contextMenuCloseListener = null;
    redraw();
  };
  // Use capture to run before Snabbdom click handlers so the menu closes even if
  // the user clicks inside the move list.
  document.addEventListener('click', _contextMenuCloseListener, { once: true });
  redraw();
}

function positionContextMenu(menu: HTMLElement, coords: { x: number; y: number }): void {
  const menuWidth = menu.offsetWidth + 4;
  const menuHeight = menu.offsetHeight + 4;
  const left = window.innerWidth - coords.x < menuWidth ? window.innerWidth - menuWidth : coords.x;
  const top = window.innerHeight - coords.y < menuHeight ? window.innerHeight - menuHeight : coords.y;
  menu.style.left = `${Math.max(0, left)}px`;
  menu.style.top = `${Math.max(0, top)}px`;
}









function contextMenuTitle(node: TreeNode | undefined): string {
  if (!node) return 'Move';
  if (!node.san) return 'Initial position';
  const turn = Math.ceil(node.ply / 2);
  const dots = node.ply % 2 === 1 ? '.' : '...';
  const glyphSuffix = (node.glyphs ?? []).map(g => g.symbol).join('');
  return `${turn}${dots} ${node.san}${glyphSuffix}`;
}

/**
 * Render the move-list context menu overlay.
 * Positioned at cursor coords using fixed positioning.
 * Mirrors lichess-org/lila: ui/analyse/src/treeView/contextMenu.ts view()
 */
function renderContextMenu(): VNode | null {
  if (!contextMenuPath || !contextMenuPos) return null;
  const node       = nodeAtPath(ctrl.root, contextMenuPath);
  const title      = contextMenuTitle(node);
  const onMainline = isMainlinePath(ctrl.root, contextMenuPath);
  const copyLabel  = onMainline ? 'Copy main line PGN' : 'Copy variation PGN';
  const canOpenReviewErrorBug = Boolean(
    node?.uci &&
    selectedGameId &&
    analysisComplete &&
    analyzedGameIds.has(selectedGameId) &&
    adminDiagnosticsTokenAvailable(),
  );
  return h('div#move-ctx-menu.visible', {
    on: { contextmenu: (e: Event) => e.preventDefault() },
    hook: {
      insert: vnode => {
        const elm = vnode.elm as HTMLElement;
        positionContextMenu(elm, contextMenuPos!);
        elm.addEventListener('keydown', event => {
          if ((event.key !== 'Enter' && event.key !== ' ') || event.repeat) return;
          const target = event.target as HTMLElement;
          if (target.getAttribute('role') !== 'button') return;
          event.preventDefault();
          target.click();
        });
      },
      postpatch: (_old, vnode) => positionContextMenu(vnode.elm as HTMLElement, contextMenuPos!),
    },
  }, [
    h('p.title', title),

    h('a', {
      attrs: { role: 'button', tabindex: '0', ...controlExplainerAttrs({ label: copyLabel, description: 'Copy PGN for this line to the clipboard.' }) },
      on: { click: () => { copyLinePgn(contextMenuPath!); contextMenuPath = null; contextMenuPos = null; redraw(); } },
    }, copyLabel),

    h('a', {
      attrs: { role: 'button', tabindex: '0', ...controlExplainerAttrs({ label: 'Delete from here', description: 'Delete this move and every following move in the variation.' }) },
      on: { click: () => {
        const path = contextMenuPath!;
        contextMenuPath = null; contextMenuPos = null;
        deleteVariation(path);
      } },
    }, 'Delete from here'),


    !onMainline ? h('a', {
      attrs: { role: 'button', tabindex: '0', ...controlExplainerAttrs({ label: 'Promote variation', description: 'Move this variation ahead of sibling variations.' }) },
      on: { click: () => {
        const path = contextMenuPath!;
        contextMenuPath = null; contextMenuPos = null;
        promoteAt(ctrl.root, path, false);
        syncArrow();
        redraw();
      } },
    }, 'Promote variation') : null,
    !onMainline ? h('a', {
      attrs: { role: 'button', tabindex: '0', ...controlExplainerAttrs({ label: 'Make main line', description: 'Promote this variation to the game main line.' }) },
      on: { click: () => {
        const path = contextMenuPath!;
        contextMenuPath = null; contextMenuPos = null;
        promoteAt(ctrl.root, path, true);
        syncArrow();
        redraw();
      } },
    }, 'Make main line') : null,



    h('a.ctx-annotate.ctx-annotate--comment', {
      attrs: { role: 'button', tabindex: '0', ...controlExplainerAttrs({ label: 'Comment on this move', description: 'Open the comment editor for this move.' }) },
      on: { click: () => {
        const path = contextMenuPath!;
        contextMenuPath = null; contextMenuPos = null;
        navigate(path);
        openAnnotationPanel('comments');
        redraw();
      } },
    }, [
      h('span.ctx-icon', {
        props: {
          innerHTML:
            '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M2 2h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6l-3.6 3V12H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/></svg>',
        },
      }),
      'Comment on this move',
    ]),
    h('a.ctx-annotate.ctx-annotate--glyph', {
      attrs: { role: 'button', tabindex: '0', ...controlExplainerAttrs({ label: 'Annotate with glyphs', description: 'Open the chess-glyph editor for this move.' }) },
      on: { click: () => {
        const path = contextMenuPath!;
        contextMenuPath = null; contextMenuPos = null;
        navigate(path);
        openAnnotationPanel('glyphs');
        redraw();
      } },
    }, [
      h('span.ctx-icon.ctx-icon--glyph', '!?'),
      'Annotate with glyphs',
    ]),



    h('a', {
      attrs: { role: 'button', tabindex: '0', ...controlExplainerAttrs({ label: 'Save to Library', description: 'Open the save flow for this game position.' }) },
      on: { click: () => {
        const path = contextMenuPath!;
        contextMenuPath = null; contextMenuPos = null;
        openGameSaveFlow('right-click', { sourcePath: path });
      } },
    }, 'Save to Library'),
    canOpenReviewErrorBug ? h('a.ctx-review-error-bug', {
      attrs: { role: 'button', tabindex: '0', ...controlExplainerAttrs({ label: 'Review Error Bug', description: 'Open a diagnostic report for the analysis at this move.' }) },
      on: { click: () => {
        const path = contextMenuPath!;
        const gameId = selectedGameId!;
        contextMenuPath = null; contextMenuPos = null;
        openReviewErrorSubmitFlow({ gameId, path });
        redraw();
      } },
    }, 'Review Error Bug') : null,



    selectedGameId && node?.uci ? h('a.ctx-puzzle', {
      attrs: { role: 'button', tabindex: '0', ...controlExplainerAttrs({ label: 'Create Puzzle from solution', description: 'Use this move as the puzzle solution.' }) },
      on: { click: () => {
        const path = contextMenuPath!;
        contextMenuPath = null; contextMenuPos = null;
        createPuzzleFromSolution(path);
      } },
    }, 'Create Puzzle (solution)') : null,
    // Branch 2: right-clicked position IS the puzzle start; engine best move is the solution.
    selectedGameId ? h('a.ctx-puzzle', {
      attrs: { role: 'button', tabindex: '0', ...controlExplainerAttrs({ label: 'Create Puzzle from start', description: 'Use this position as the puzzle start and the engine move as its solution.' }) },
      on: { click: () => {
        const path = contextMenuPath!;
        contextMenuPath = null; contextMenuPos = null;
        createPuzzleFromStart(path);
      } },
    }, 'Create Puzzle (start)') : null,
  ]);
}

function currentReviewErrorEngineSettings(): ReviewErrorCurrentEngineSettings {
  return {
    liveAnalysisDepth: analysisDepth,
    multiPv,
    engineEnabled,
    searchUntilDepth,
    ...(!searchUntilDepth ? { searchTimeMs: searchTime } : {}),
  };
}

function renderReviewErrorSubmitOverlay(): VNode | null {
  const request = getReviewErrorSubmitRequest();
  const requestGame = request ? importedGames.find(game => game.id === request.gameId) : undefined;
  const requestReviewEngine = request ? analyzedReviewEngine.get(request.gameId) : undefined;
  return renderReviewErrorPackageSubmitModal({
    ...(requestGame ? { game: requestGame } : {}),
    root: ctrl.root,
    currentEngineSettings: currentReviewErrorEngineSettings(),
    reviewDepth,
    analysisComplete: Boolean(request && selectedGameId === request.gameId && analysisComplete && analyzedGameIds.has(request.gameId)),
    ...(requestReviewEngine ? { reviewEngine: requestReviewEngine } : {}),
    redraw,
  });
}




/** Transient confirmation message shown after puzzle creation. */
let puzzleCreateMsg: string | null = null;
let puzzleCreateMsgTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Retro session outcomes captured when the user exits a retro session.
 * Keyed by candidate ply — used to attach first-attempt outcome data when
 * saving puzzle candidates from the post-retro candidates panel.
 * Reset each time a new retro session starts.
 */
let lastRetroOutcomes: Map<number, 'win' | 'fail' | 'view' | 'skip'> | null = null;

/**
 * Wraps savePuzzle to attach the retro session outcome for the candidate's ply,
 * if a retro session was just exited. Passes through unmodified when no outcome
 * is available (e.g. candidate was never reached, or saved outside a retro session).
 */
function savePuzzleWithRetroOutcome(c: import('./tree/types').PuzzleCandidate, redraw: () => void): void {
  const outcome = lastRetroOutcomes?.get(c.ply);
  savePuzzle(outcome ? { ...c, retroOutcome: outcome } : c, redraw);
}

function flashPuzzleMsg(msg: string): void {
  puzzleCreateMsg = msg;
  clearTimeout(puzzleCreateMsgTimer);
  puzzleCreateMsgTimer = setTimeout(() => { puzzleCreateMsg = null; redraw(); }, 2500);
  redraw();
}

/**
 * Branch 1 — "Use as puzzle solution":
 * The right-clicked move IS the answer. Puzzle starts at the parent position.
 */
function createPuzzleFromSolution(path: string): void {
  const node = nodeAtPath(ctrl.root, path);
  const parent = parentAtPath(ctrl.root, path);
  if (!node?.uci || !parent?.fen) {
    flashPuzzleMsg('Cannot create puzzle: invalid position');
    return;
  }
  const parentPath = pathInit(path);
  const parentEval = evalCache.get(parentPath);

  const idBase = selectedGameId
    ? `${selectedGameId}_sol_${path}`
    : `user_sol_${simpleHash(parent.fen + node.uci)}`;

  const def: UserLibraryPuzzleDefinition = {
    id: idBase,
    sourceKind: 'user-library',
    startFen: parent.fen,
    // Anchor the answer to the clicked move: the cached PV is only saved when its
    // head IS this move, else fall back to [node.uci] (Decision 7 / BUG-030).
    solutionLine: anchorSolutionLine(parentEval?.moves, node.uci),
    strictSolutionMove: node.uci,
    createdAt: Date.now(),
    sourcePath: parentPath,
    sourceReason: 'manual',
  };
  if (selectedGameId) def.sourceGameId = selectedGameId;

  // Success UI only after an actual write; a rejected save reports the refusal.
  void savePuzzleDefinition(def).then(result => {
    if (result.ok) {
      flashPuzzleMsg(`Puzzle saved — solution: ${node.san ?? node.uci}`);
    } else {
      flashPuzzleMsg(`Could not save puzzle (${result.reason})`);
    }
  });
}

/**
 * Branch 2 — "Use as puzzle start":
 * The right-clicked position IS where the puzzle begins.
 * Engine best move from evalCache becomes the solution.
 */
function createPuzzleFromStart(path: string): void {
  const node = nodeAtPath(ctrl.root, path);
  if (!node?.fen) {
    flashPuzzleMsg('Cannot create puzzle: invalid position');
    return;
  }
  const cached = evalCache.get(path);
  if (!cached?.best) {
    flashPuzzleMsg('No engine data for this position — run analysis first');
    return;
  }

  // Anchor the answer to the engine best move: the cached PV is only saved when
  // its head IS cached.best (cached.best may differ from cached.moves[0]), else
  // fall back to [cached.best] (Decision 7 / BUG-030).
  const solutionLine = anchorSolutionLine(cached.moves, cached.best);

  const idBase = selectedGameId
    ? `${selectedGameId}_start_${path}`
    : `user_start_${simpleHash(node.fen + cached.best)}`;

  const def: UserLibraryPuzzleDefinition = {
    id: idBase,
    sourceKind: 'user-library',
    startFen: node.fen,
    solutionLine,
    strictSolutionMove: cached.best,
    createdAt: Date.now(),
    sourcePath: path,
    sourceReason: 'manual',
  };
  if (selectedGameId) def.sourceGameId = selectedGameId;

  // Success UI only after an actual write; a rejected save reports the refusal.
  void savePuzzleDefinition(def).then(result => {
    if (result.ok) {
      flashPuzzleMsg(`Puzzle saved — start position after ${node.san ?? '...'}`);
    } else {
      flashPuzzleMsg(`Could not save puzzle (${result.reason})`);
    }
  });
}

const analyzedGameIds:      Set<string>                                              = new Set();
const missedTacticGameIds:  Set<string>                                              = new Set();
const analyzedGameAccuracy: Map<string, { white: number | null; black: number | null }> = new Map();
const analyzedReviewEngine: Map<string, ReviewEngineMetadata>                         = new Map();
const reviewedStatusIndex:  Map<string, ReviewedGameStatus>                           = new Map();







const reviewIncompleteIndex: Map<string, GameReviewIncompleteStatus> = new Map();







setStudyGameEnrichmentSource({ analyzedGameIds });

function setReviewedStatus(
  gameId: string,
  options: {
    analysisUpdatedAt: number;
    reviewEngine?: ReviewEngineMetadata;
    accuracy?: { white: number | null; black: number | null };
    missedMomentCount?: number;
  },
): void {
  const status: ReviewedGameStatus = {
    gameId,
    reviewed: true,
    analysisUpdatedAt: options.analysisUpdatedAt,
    source: 'analysis-library',
  };
  if (options.reviewEngine !== undefined) status.reviewEngine = options.reviewEngine;
  if (options.accuracy !== undefined) status.accuracy = options.accuracy;
  if (options.missedMomentCount !== undefined) status.missedMomentCount = options.missedMomentCount;
  reviewedStatusIndex.set(gameId, status);
}

function clearReviewedStatus(gameId: string): void {
  reviewedStatusIndex.delete(gameId);
}

function getActivePgn(): string {
  return selectedGamePgn ?? SAMPLE_PGN;
}

// Build a nested array of primitives and JSON.stringify ONCE at the top.
// Children must return raw data (not a stringified signature): stringifying at every
// node re-escapes the level below it (" -> \", \ -> \\), so the signature length grew
// O(2^depth) and OOM-crashed the renderer on normal-depth games (every analysis-board load).
function treeMutationData(node: TreeNode): unknown[] {
  return [
    node.id,
    node.ply,
    node.san ?? '',
    node.uci ?? '',
    node.fen,

    (node.comments ?? []).map(c => [c.id, c.text]),
    (node.glyphs ?? []).map(g => g.id),

    (node.shapes ?? []).map(s => [s.orig, s.dest ?? '', s.brush ?? '']),
    node.children.map(treeMutationData),
  ];
}
function treeMutationSignature(node: TreeNode): string {
  return JSON.stringify(treeMutationData(node));
}






function treeHasAnnotations(node: TreeNode): boolean {
  if ((node.comments?.length ?? 0) > 0 || (node.glyphs?.length ?? 0) > 0) return true;
  return node.children.some(treeHasAnnotations);
}

function markCurrentAnalysisBoardClean(): void {
  savedAnalysisBoardSignature = treeMutationSignature(ctrl.root);
}

function currentAnalysisBoardHasUnsavedMoveChanges(): boolean {
  return treeMutationSignature(ctrl.root) !== savedAnalysisBoardSignature;
}

function padDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

function formatSyntheticAnalysisBoardTitle(createdAt: number): string {
  const date = new Date(createdAt);
  const yyyy = date.getFullYear();
  const mm = padDatePart(date.getMonth() + 1);
  const dd = padDatePart(date.getDate());
  const hh = padDatePart(date.getHours());
  const min = padDatePart(date.getMinutes());
  return `Analysis Board - ${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function currentAnalysisBoardPgnForLibrary(): string {
  if (
    syntheticAnalysisBoardCreatedAt === null
    && !currentAnalysisBoardHasUnsavedMoveChanges()
    && selectedGamePgn
  ) {
    return selectedGamePgn;
  }
  return buildPgn(false);
}










let _activeGameSaveFlow: SaveFlowCtrl | null = null;
let _gameSaveFlowGeneration = 0;
let _gameSaveFlowPending = false;

function resetGameSaveFlow(): void {
  _gameSaveFlowGeneration++;
  _gameSaveFlowPending = false;
  _activeGameSaveFlow = null;
}





function gameSaveFlowContext(
  entry: 'menu' | 'right-click' | 'confirm-dialog',
  sourcePath?: string,
): SaveFlowContext {
  if (entry === 'right-click') {
    const node = sourcePath !== undefined ? nodeAtPath(ctrl.root, sourcePath) : undefined;
    return {
      line: `From move list — right-click · ${contextMenuTitle(node)}`,
      source: 'Right-click move-list save (GD-1 universal save path)',
    };
  }
  if (entry === 'confirm-dialog') {
    return {
      line: 'From Analysis board — save before opening a new board',
      source: 'Unsaved-changes confirm — New Board (GD-1 universal save path)',
    };
  }
  return {
    line: 'From Analysis board — manual save',
    source: 'Board menu — Save to Library',
  };
}





function persistGameSaveFlowResult(
  baseMetadata: Parameters<typeof saveCurrentToLibrary>[1],
  result: SaveFlowResult,
  owner: SaveFlowCtrl,
  generation: number,
  redraw: () => void,
  onSaved?: (saved: boolean) => void,
): void {
  if (
    _gameSaveFlowPending
    || _activeGameSaveFlow !== owner
    || _gameSaveFlowGeneration !== generation
  ) return;

  const metadata: Parameters<typeof saveCurrentToLibrary>[1] = { ...baseMetadata };
  if (result.mode === 'quick') {
    metadata.uncategorized = true;
  } else if (result.destination !== undefined) {
    metadata.destination = result.destination;
  }
  if (result.purpose !== undefined) metadata.purpose = result.purpose;
  if (result.notes !== undefined) metadata.notes = result.notes;
  if (result.tags.length > 0) metadata.tags = result.tags;

  // Freeze both the payload and dirty baseline at submit time. A user edit made while IDB is
  // pending must remain dirty after this write; an old route/board must never clean the new one.
  const pgn = currentAnalysisBoardPgnForLibrary();
  const savedSignature = treeMutationSignature(ctrl.root);
  const sourceGameId = selectedGameId;
  const syntheticCreatedAt = syntheticAnalysisBoardCreatedAt;
  const title = syntheticCreatedAt !== null
    ? formatSyntheticAnalysisBoardTitle(syntheticCreatedAt)
    : undefined;
  _gameSaveFlowPending = true;

  void saveCurrentToLibrary(pgn, {
    source: 'analysis',
    ...(sourceGameId ? { sourceGameId } : {}),
    ...metadata,
    ...(title ? { title } : {}),
  }).then(() => {
    if (_activeGameSaveFlow !== owner || _gameSaveFlowGeneration !== generation) return;
    savedAnalysisBoardSignature = savedSignature;
    resetGameSaveFlow();
    showToast('Saved to Library');
    redraw();
    onSaved?.(true);
  }).catch(error => {
    if (_activeGameSaveFlow !== owner || _gameSaveFlowGeneration !== generation) return;
    _gameSaveFlowPending = false;
    console.warn('[analysis] save to library failed', error);
    showToast('Could not save to Library. Check storage and try again.');
    redraw();
    onSaved?.(false);
  });
}







function openGameSaveFlow(
  entry: 'menu' | 'right-click' | 'confirm-dialog',
  baseMetadata: Parameters<typeof saveCurrentToLibrary>[1] = {},
  after?: { onSaved?: (saved: boolean) => void; onCancelled?: () => void },
): void {
  resetGameSaveFlow();
  const generation = _gameSaveFlowGeneration;
  const flow = new SaveFlowCtrl({
    itemType: 'game',
    context: gameSaveFlowContext(entry, baseMetadata.sourcePath),
    onResolve: result => {
      persistGameSaveFlowResult(baseMetadata, result, flow, generation, redraw, after?.onSaved);
    },
    onCancel: () => {
      if (_activeGameSaveFlow !== flow || _gameSaveFlowGeneration !== generation) return;
      resetGameSaveFlow();
      redraw();
      after?.onCancelled?.();
    },
  }, redraw);
  _activeGameSaveFlow = flow;
  redraw();
}

function renderActiveGameSaveFlowModal(): VNode | null {
  return _activeGameSaveFlow ? renderSaveFlowModal(_activeGameSaveFlow) : null;
}

// --- Analysis controller (persists for the session) ---

let ctrl = new AnalyseCtrl(pgnToTree(getActivePgn()));
markCurrentAnalysisBoardClean();
markUserTreeSaveBaseline();
let researchAnalysisLoadingId: string | null = null;
let researchAnalysisError: { id: string; message: string } | null = null;

// Incremented on every loadGame() call. loadAndRestoreAnalysis() captures this value at
// call time and checks it after the IDB await — if changed, the game has switched and the
// restore result is discarded as stale.
// Mirrors the implicit game-scoping in lichess-org/lila: ui/analyse/src/idbTree.ts, where
// the IDB class is owned by the ctrl instance and cannot outlive it.
let restoreGeneration = 0;
let reviewedStateHydrationGeneration = 0;
let navStateSaveTimer: ReturnType<typeof setTimeout> | null = null;







const boardReviewPageSessionUuid: string = (() => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* fall through to the time+random id below */ }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
})();






const boardReview: BoardReviewState = createBoardReviewState({
  getCtrl:            () => ctrl,
  getGeneration:      () => restoreGeneration,
  pageSessionUuid:    boardReviewPageSessionUuid,
  buildPgnSnapshot:   () => buildPgn(false),
  nodeAtPath,
  applyAcceptedEval,
  setAnalysisComplete,
  clearPartialEval:   clearBoardReviewPartialEval,
  redraw,
  requestBoardTreeReview,
  evictBoardTreeReview,
  cancelBoardTreeReview,
});

function scheduleNavStateSave(path = ctrl.path): void {
  if (navStateSaveTimer !== null) clearTimeout(navStateSaveTimer);
  const selectedId = selectedGameId;
  navStateSaveTimer = setTimeout(() => {
    navStateSaveTimer = null;
    void saveNavStateToIdb(selectedId, path);
  }, NAV_STATE_SAVE_MS);
}










let userTreeSaveTimer: ReturnType<typeof setTimeout> | null = null;
let lastUserTreeSaveSignature: string | undefined;
const USER_TREE_SAVE_MS = 800;

/**
 * Reset the auto-save baseline to the current tree without scheduling a save. Used right after
 * a fresh game load (nothing to persist yet) and right after a restore-merge completes (the
 * merge restores prior edits, it is not itself a new edit) so neither moment triggers a
 * redundant immediate re-save.
 */
function markUserTreeSaveBaseline(): void {
  lastUserTreeSaveSignature = treeMutationSignature(ctrl.root);
}

function scheduleUserTreeSave(): void {
  if (syntheticAnalysisBoardCreatedAt !== null || !selectedGameId) return;
  const signature = treeMutationSignature(ctrl.root);
  if (signature === lastUserTreeSaveSignature) return;
  lastUserTreeSaveSignature = signature;
  const gameId = selectedGameId;




  scheduleGamePersist(gameId);
  if (userTreeSaveTimer !== null) clearTimeout(userTreeSaveTimer);
  userTreeSaveTimer = setTimeout(() => {
    userTreeSaveTimer = null;
    // Stale-guard: the game (or board) may have switched during the debounce window.
    if (selectedGameId !== gameId) return;
    void saveUserTreeToIdb(gameId, ctrl.root);
  }, USER_TREE_SAVE_MS);
}

function isImportedGameAnalysisRoute(route: Route): boolean {
  if (route.name !== 'analysis-game') return false;
  const routeId = route.params['id'] ?? '';
  return !routeId.startsWith('research:') && parseImportedGameRouteId(routeId) !== null;
}

function hasRouteOwnedAnalysisPly(route: Route): boolean {
  return isImportedGameAnalysisRoute(route) && hasAnalysisPlyQuery(route.query ?? '');
}

function routeOwnsAnalysisPlyForGame(route: Route, gameId: string | null): boolean {
  return analysisPlyQueryBelongsToImportedGameRoute(
    route.params['id'] ?? '',
    route.query ?? '',
    gameId,
  );
}

function currentRouteOwnsAnalysisPlyForSelectedGame(): boolean {
  return routeOwnsAnalysisPlyForGame(currentRoute, selectedGameId);
}

function readLegacyRemoteSyncOutboxSummary() {
  try {
    return summarizeSerializedOutbox(globalThis.localStorage?.getItem(LEGACY_REMOTE_SYNC_OUTBOX_STORAGE_KEY) ?? null);
  } catch {
    return summarizeSerializedOutbox(null);
  }
}

function recordReviewStorageCountsAfterHydration(input: {
  generation: number;
  startedAt: number;
  completedAnalysisCount: number;
  derivedReviewedCount: number;
  completedAnalysisWithoutGame: number;
  staleRuntimeEntriesCleared: number;
}): void {
  void (async () => {
    const [
      summaries,
      queueManifest,
      runManifests,
      failureRecords,
      durableOutboxEntries,
    ] = await Promise.all([
      listGameSummaries(),
      loadReviewQueueManifest(),
      loadReviewRunManifests(),
      loadReviewFailureRecords(),
      readDurableVersionedOutbox(defaultDurableVersionedOutboxStorage()).catch(() => []),
    ]);

    if (input.generation !== reviewedStateHydrationGeneration) return;

    const completedAnalysisGameIds = new Set(reviewedStatusIndex.keys());
    const summaryWithoutCompletedAnalysis = summaries
      .filter(summary => !completedAnalysisGameIds.has(summary.gameId))
      .length;
    const queueSummary = getQueueSummary();
    const diagnostic = buildReviewStorageCountDiagnostic({
      trigger: 'post-reviewed-derivation',
      generation: input.generation,
      durationMs: Date.now() - input.startedAt,
      analysis: {
        totalStored: input.completedAnalysisCount,
        completeStored: input.completedAnalysisCount,
        partialStored: 0,
        loadableComplete: input.completedAnalysisCount,
        completedWithoutCurrentGame: input.completedAnalysisWithoutGame,
      },
      summaries: {
        totalStored: summaries.length,
        withoutCompletedAnalysis: summaryWithoutCompletedAnalysis,
      },
      reviewedIndex: {
        derived: input.derivedReviewedCount,
        runtime: reviewedStatusIndex.size,
        staleRuntimeEntriesCleared: input.staleRuntimeEntriesCleared,
      },
      runtimeMaps: {
        analyzedGameIds: analyzedGameIds.size,
        analyzedGameAccuracy: analyzedGameAccuracy.size,
        analyzedReviewEngine: analyzedReviewEngine.size,
        missedTacticGameIds: missedTacticGameIds.size,
      },
      queueManifests: {
        reviewQueueEntries: queueManifest.length,
        reviewRunManifests: runManifests.length,
        reviewFailureRecords: failureRecords.length,
        runtimeQueueTotal: queueSummary.total,
        runtimeQueueDone: queueSummary.done,
        runtimeQueueFailed: queueSummary.failed,
        runtimeQueueSkipped: queueSummary.skipped,
        runtimeQueueRemainingGames: queueSummary.remainingGames,
        activeBatchGames: queueSummary.activeBatchGameIds.length,
      },
      outbox: {
        legacy: readLegacyRemoteSyncOutboxSummary(),
        durable: summarizeOutboxEntries(durableOutboxEntries),
        transientPending: 0,
      },
    });
    assertReviewStorageDiagnosticContentFree(diagnostic);
    recordDiagnostic({
      kind: 'sync',
      severity: Severity.Info,
      source: 'main.reviewStorageDiagnostics',
      sourceTag: 'review-storage',
      message: 'review-storage-counts',
      metadata: diagnostic,
      redactionClass: 'safe',
    });
  })().catch(() => {
    recordDiagnostic({
      kind: 'sync',
      severity: Severity.Warn,
      source: 'main.reviewStorageDiagnostics',
      sourceTag: 'review-storage',
      message: 'review-storage-counts-failed',
      metadata: {
        category: 'review-storage-counts',
        trigger: 'post-reviewed-derivation',
      },
      redactionClass: 'safe',
    });
  });
}

function positionEvalFromStoredNode(entry: StoredNodeEntry): PositionEval | null {
  // Backward safety: skip only pre-migration node.id-keyed records (no path field). The root's
  // path is the empty string '' (falsy but legitimate) — it must hydrate into evalCache, not be
  // dropped (BUG-2026-07-10-035), so ply-1 mistake candidates survive reload.
  if (typeof entry.path !== 'string') return null;
  const ev: PositionEval = {};
  if (entry.cp    !== undefined) ev.cp    = entry.cp;
  if (entry.mate  !== undefined) ev.mate  = entry.mate;
  if (entry.best  !== undefined) ev.best  = entry.best;
  if (entry.loss  !== undefined) ev.loss  = entry.loss;
  if (entry.delta !== undefined) ev.delta = entry.delta;
  if (entry.label !== undefined) ev.label = entry.label;
  if (entry.bestLine !== undefined) ev.moves = entry.bestLine;


  if (entry.depth !== undefined) ev.depth = entry.depth;
  return ev;
}

function evalCacheFromStoredNodes(nodes: Record<string, StoredNodeEntry>): Map<string, PositionEval> {
  const cache = new Map<string, PositionEval>();
  for (const entry of Object.values(nodes)) {
    const ev = positionEvalFromStoredNode(entry);
    if (ev) cache.set(entry.path, ev);
  }
  return cache;
}

/**
 * Load a game into the analysis board by PGN.
 * Resets analysis state and re-evaluates if engine is on.
 * When called with source:'queue' the background review queue is driving the load —
 * skip the full reset so the queue state and eval cache are not destroyed.
 */
function loadGame(pgn: string | null, opts?: { source?: 'queue' | 'user'; syntheticCreatedAt?: number }): void {
  performance.mark('game-load-start');



  boardReview.evict();
  // A game/board switch replaces the tree the practice session was playing on.
  endPracticeSession('game-switch');



  if (questionnaireCtrl) closeQuestionnaireModule();
  // Root cause of BUG-2026-07-05-013: `ctrl` (and its root tree) is about to be replaced below,
  // which invalidates any open move-list context menu's captured path. Two callers used to
  // clear this manually before calling loadGame(); most did not, so an open menu could survive
  // a non-click-driven game switch (background queue advance, popstate/hash-route navigation,
  // programmatic retro/compare-panel selection) that never fires the document click listener
  // that normally closes the menu. Clearing it here covers every current and future caller.
  contextMenuPath = null;
  contextMenuPos = null;
  selectedGamePgn = pgn;
  syntheticAnalysisBoardCreatedAt = opts?.syntheticCreatedAt ?? null;





  cancelSilentEval();
  performance.mark('pgn-parse-start');
  ctrl = new AnalyseCtrl(pgnToTree(getActivePgn()));
  markCurrentAnalysisBoardClean();
  // Baseline BEFORE any async merge below: prevents a redraw firing mid-merge from comparing
  // this fresh tree against the PREVIOUS game's signature and scheduling a save of the
  // not-yet-merged tree under the new gameId (which would clobber that game's stored edits).
  markUserTreeSaveBaseline();
  performance.mark('pgn-parse-end');

  if (opts?.source === 'queue') {
    // Background queue advance: rebuild ctrl only, do not reset review status or eval cache.
    restoreGeneration++;
    performance.mark('game-load-end');
    return;
  }

  clearEvalCache();
  resetCurrentEval();
  clearPuzzleCandidates();
  resetReviewStatusRuntime();
  // Default orientation to the importing user's perspective when determinable;
  // fall back to 'white' so orientation always resets on game load.
  if (selectedGameId) {
    const loadedGame = importedGames.find(g => g.id === selectedGameId);
    if (loadedGame) {
      const userColor = getUserColor(loadedGame);
      setOrientation(userColor ?? 'white');
    } else {
      setOrientation('white');
    }
  } else {
    setOrientation('white');
  }
  syncBoardAndArrow();
  if (!currentRouteOwnsAnalysisPlyForSelectedGame()) scheduleNavStateSave('');
  // Restore persisted analysis from IndexedDB; falls back to live eval if nothing stored.
  // Increment restoreGeneration first so any in-flight restore from the previous game
  // sees a stale generation value and discards its result.
  restoreGeneration++;
  if (selectedGameId) {
    void loadAndRestoreAnalysis(selectedGameId, restoreGeneration);
    void loadAndMergeUserTree(selectedGameId, restoreGeneration);
  } else {
    evalCurrentPosition();
  }
  redraw();
  performance.mark('game-load-end');
}

function openNewAnalysisBoard(): void {


  flushPendingGamePersist();
  selectedGameId = null;

  loadGame(BLANK_ANALYSIS_PGN, { syntheticCreatedAt: Date.now() });
}







function openAnalysisBoardFromEditor(pgn: string): void {
  flushPendingGamePersist();
  selectedGameId = null;

  loadGame(pgn, { syntheticCreatedAt: Date.now() });
  writeHashRoute('#/analysis');
}






function requestAnalysisBoardTransition(onProceed: () => void): void {
  if (!currentAnalysisBoardHasUnsavedMoveChanges()) {
    onProceed();
    return;
  }

  const saveFirst = window.confirm(
    'This board has unsaved move changes. OK saves it to the Study Library first. Cancel discards the changes.',
  );
  if (!saveFirst) {
    onProceed();
    return;
  }









  openGameSaveFlow('confirm-dialog', {}, {
    onSaved: saved => { if (saved) onProceed(); },
  });
}

function requestNewAnalysisBoard(): void {
  requestAnalysisBoardTransition(openNewAnalysisBoard);
}







function exitAnalysisModeToggle(): void {
  requestAnalysisBoardTransition(() => {
    const priorRoute = consumeAnalysisModePriorRoute();
    if (priorRoute) writeHashRoute(priorRoute);
    else openNewAnalysisBoard();
  });
}

function loadGameById(gameId: string): boolean {
  if (gameId.startsWith('research:')) {
    void loadResearchGameByRouteId(gameId);
    return true;
  }
  const importedGameId = parseImportedGameRouteId(gameId);
  if (!importedGameId) return false;
  const game = importedGames.find(g => g.id === importedGameId);
  if (!game) return false;
  flushPendingGamePersist();
  selectedGameId = game.id;
  loadGame(game.pgn);
  return true;
}

async function loadResearchGameByRouteId(routeId: string): Promise<void> {
  const parsed = parsePackedResearchAnalysisRouteId(routeId);
  if (!parsed) {
    researchAnalysisError = { id: routeId, message: 'Invalid research game route.' };
    researchAnalysisLoadingId = null;
    redraw();
    return;
  }

  researchAnalysisLoadingId = routeId;
  researchAnalysisError = null;
  let loaded: Awaited<ReturnType<typeof loadResearchGame>>;
  try {
    loaded = await loadResearchGame(parsed.collectionId, parsed.gameId);
  } catch (e) {



    if (currentRoute.name !== 'analysis-game' || currentRoute.params['id'] !== routeId) return;
    researchAnalysisLoadingId = null;
    researchAnalysisError = {
      id: routeId,
      message: 'Could not open this research game because the openings store could not be read. Your data is not lost — reload to try again.',
    };
    console.warn('[openings] research game load failed', e);
    redraw();
    return;
  }
  if (currentRoute.name !== 'analysis-game' || currentRoute.params['id'] !== routeId) return;
  researchAnalysisLoadingId = null;
  if (!loaded) {
    flushPendingGamePersist();
    selectedGameId = null;
    researchAnalysisError = { id: routeId, message: 'Research game was not found in the openings store.' };
    redraw();
    return;
  }

  flushPendingGamePersist();
  selectedGameId = routeId;
  loadGame(loaded.game.pgn);
  jumpToMainlinePly(parsed.ply);




}

function jumpToMainlinePly(ply: number): void {
  const nodes = ctrl.mainline.slice(1, Math.max(1, ply + 1));
  const path = nodes.reduce((acc, node) => acc + node.id, '');
  if (path) navigate(path);
  else redraw();
}

function replaceCurrentAnalysisPlyRoute(route: Route, ply: number | null): void {
  const routeId = route.params['id'] ?? '';
  const importedGameId = parseImportedGameRouteId(routeId);
  const baseRoute = serializeAnalysisSelectedGameRoute(importedGameId);
  currentRoute = replaceHashRoute(serializeAnalysisRouteWithPly(baseRoute, ply)).route;
}

function syncAnalysisAfterRoutePlyApplied(): void {
  syncBoard();
  syncArrow();
  evalCurrentPosition();
  explorerCtrl.setNode(ctrl.node.fen, redraw);
  redraw();
  requestActiveMoveScroll();
}

function applyRouteOwnedAnalysisPly(route: Route, opts: { sync?: boolean } = {}): boolean {
  if (!hasRouteOwnedAnalysisPly(route)) return false;
  if (!routeOwnsAnalysisPlyForGame(route, selectedGameId)) return false;

  const recovery = resolveAnalysisMainlinePlyFromQuery(ctrl.root, route.query ?? '');
  const routePly = recovery.status === 'exact' || recovery.status === 'deepest-valid'
    ? recovery.resolvedPly
    : null;
  replaceCurrentAnalysisPlyRoute(route, routePly);

  const beforePath = ctrl.path;
  ctrl.setPath(recovery.resolvedPath);
  const changedPath = ctrl.path !== beforePath;
  if (recovery.status !== 'invalid') scheduleNavStateSave(ctrl.path);
  if (opts.sync && changedPath) syncAnalysisAfterRoutePlyApplied();
  return true;
}

function replaceAnalysisRouteForCurrentPath(): void {
  if (!isImportedGameAnalysisRoute(currentRoute)) return;
  const nextPly = isMainlinePath(ctrl.root, ctrl.path) ? ctrl.node.ply : null;
  replaceCurrentAnalysisPlyRoute(currentRoute, nextPly);
}

/**
 * Load stored analysis for a game into evalCache and restore completion state.
 * Mirrors the IndexedDB restore pattern in lichess-org/lila: ui/analyse/src/idbTree.ts
 */
async function loadAndRestoreAnalysis(gameId: string, generation: number): Promise<void> {
  const stored = await loadAnalysisFromIdb(gameId);
  // Stale: game switched while IDB was loading — discard to prevent cross-game contamination.
  if (generation !== restoreGeneration || selectedGameId !== gameId) return;
  if (!stored) return;







  if (!isStoredAnalysisLoadable(stored)) return;
  // Repopulate evalCache from stored node entries.
  // Guard: pre-migration records (ANALYSIS_VERSION < 2) lack entry.path — skip them.
  const restoreValidation = validateStoredAnalysisRestoreRows(stored.nodes, ctrl.mainline);
  if (restoreValidation.diagnostics.skippedRows > 0) {
    recordDiagnostic({
      kind: 'idb',
      severity: Severity.Warn,
      source: 'main.loadAndRestoreAnalysis',
      sourceTag: 'analysis-restore',
      message: 'analysis-restore-skipped-stale-rows',
      metadata: {
        totalRows: restoreValidation.diagnostics.totalRows,
        acceptedRows: restoreValidation.diagnostics.acceptedRows,
        skippedRows: restoreValidation.diagnostics.skippedRows,
        skipReasons: restoreValidation.diagnostics.skipReasons,
        skippedSamples: restoreValidation.diagnostics.skippedSamples.map(sample => ({
          path: sample.path,
          reason: sample.reason,
        })),
        sampleLimit: restoreValidation.diagnostics.sampleLimit,
      },
      redactionClass: 'safe',
    });
  }
  for (const entry of restoreValidation.acceptedEntries) {
    const ev = positionEvalFromStoredNode(entry);
    if (ev) evalCache.set(entry.path, ev);
  }


  if (restoreValidation.acceptedEntries.length > 0) bumpEvalCacheRevision();
  if (stored.status === 'complete') {
    analyzedGameIds.add(gameId);
    if (stored.reviewEngine) analyzedReviewEngine.set(gameId, stored.reviewEngine);
    else analyzedReviewEngine.delete(gameId);
    setAnalysisComplete(true);
    const game = importedGames.find(g => g.id === gameId);
    const userColor = game ? getUserColor(game) : null;
    const moments = detectMissedMoments(ctrl.mainline, evalCache, userColor);
    setMissedMoments(gameId, moments);
    if (moments.length > 0) missedTacticGameIds.add(gameId);
    else missedTacticGameIds.delete(gameId);
    // Capture accuracy while evalCache is populated for this game.
    const restoredSummary = computeAnalysisSummary(ctrl.mainline, evalCache);
    const accuracy = restoredSummary
      ? { white: restoredSummary.white.accuracy, black: restoredSummary.black.accuracy }
      : undefined;
    if (restoredSummary) {
      analyzedGameAccuracy.set(gameId, accuracy!);
    } else analyzedGameAccuracy.delete(gameId);
    setReviewedStatus(gameId, {
      analysisUpdatedAt: stored.updatedAt,
      ...(stored.reviewEngine !== undefined ? { reviewEngine: stored.reviewEngine } : {}),
      ...(accuracy !== undefined ? { accuracy } : {}),
      missedMomentCount: moments.length,
    });
  } else {
    analyzedGameIds.delete(gameId);
    analyzedReviewEngine.delete(gameId);
    analyzedGameAccuracy.delete(gameId);
    missedTacticGameIds.delete(gameId);
    clearReviewedStatus(gameId);
    clearMissedMoments(gameId);
  }
  // Sync display to the restored eval for the current node
  const restoredEval = evalCache.get(ctrl.path);
  if (restoredEval) setCurrentEval(restoredEval, { owner: 'analysis-live', fen: ctrl.node.fen, path: ctrl.path });
  syncArrow();
  // Notify retrospection that analysis data is now available.
  // Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts onMergeAnalysisData() retro call.
  ctrl.retro?.onMergeAnalysisData();
  redraw();
}

/**
 * Load stored user-tree edits (extra variations plus comments/glyphs/nags) for a game and merge
 * them into ctrl.root. Runs alongside loadAndRestoreAnalysis, guarded the same way: a stale
 * generation/gameId (the user switched games while this IDB read was in flight) discards the
 * result instead of merging into the wrong board (BUG-2026-07-05-012).
 * Mirrors lichess-org/lila: ui/analyse/src/idbTree.ts IdbTree.merge().
 */
async function loadAndMergeUserTree(gameId: string, generation: number): Promise<void> {
  const stored = await loadUserTreeFromIdb(gameId);
  if (generation !== restoreGeneration || selectedGameId !== gameId) return; // stale
  if (!stored) return;
  // A stored tree whose root FEN no longer matches this game's root is dropped, not guessed
  // (e.g. the game's PGN content changed under the same id).
  if (stored.root.fen !== ctrl.root.fen) return;
  mergeUserTreeEdits(ctrl.root, stored.root);
  // The merge restores prior edits — it is not itself a new edit, so it must not immediately
  // re-trigger scheduleUserTreeSave on the next redraw.
  markUserTreeSaveBaseline();
  redraw();
}

function evalEntriesMatch(a: PositionEval | undefined, b: PositionEval): boolean {
  if (!a) return false;
  return a.cp === b.cp
    && a.mate === b.mate
    && a.best === b.best
    && a.loss === b.loss
    && a.delta === b.delta
    && a.depth === b.depth
    && JSON.stringify(a.moves ?? []) === JSON.stringify(b.moves ?? []);
}

function hydrateOpenDisplayFromAcceptedReviewResult(result: AcceptedReviewResult): void {






  if (boardReview.tryHydrateAccepted(result)) return;

  if (!isImportedGameAnalysisRoute(currentRoute)) return;
  if (selectedGameId !== result.gameId) return;
  if ((currentRoute.params['id'] ?? '') !== result.gameId) return;

  const node = nodeAtPath(ctrl.root, result.nodePath);
  if (!node || node.fen !== result.fen) return;

  applyAcceptedEval(result, node);
}

/**
 * Apply an accepted, already exact-FEN-bound review result to the foreground eval display. Shared by
 * BOTH the imported-game hydration path above and the board-tree state machine (via its injected
 * `applyAcceptedEval` dep) so the display mutation is single-sourced. Callers MUST have validated the
 * node/FEN binding first — this only guards depth/no-op churn, then writes.
 */
function applyAcceptedEval(result: AcceptedReviewResult, node: TreeNode): void {
  const existing = evalCache.get(result.nodePath);
  if (existing?.depth !== undefined && result.eval.depth !== undefined && existing.depth > result.eval.depth) return;
  if (evalEntriesMatch(existing, result.eval)) return;

  evalCache.set(result.nodePath, { ...result.eval });
  bumpEvalCacheRevision();
  if (ctrl.path === result.nodePath) {
    setCurrentEval(result.eval, { owner: 'analysis-live', fen: node.fen, path: result.nodePath });
    syncArrow();
  }
  redraw();
}






function clearBoardReviewPartialEval(): void {
  clearEvalCache();
  resetCurrentEval();
  bumpEvalCacheRevision();
  syncArrow();
}

async function hydrateReviewedStateFromIdb(): Promise<void> {
  const hydrationStartedAt = Date.now();
  const generation = ++reviewedStateHydrationGeneration;
  let classification: Awaited<ReturnType<typeof listAnalysisLibraryClassificationFromIdb>>;
  try {






    classification = await listAnalysisLibraryClassificationFromIdb(ANALYSIS_VERSION);
  } catch (error) {
    console.warn('[analysis-state] reviewed-state hydration failed', error);
    return;
  }
  if (generation !== reviewedStateHydrationGeneration) return;
  const records = classification.complete;

  const libraryGamesById = new Map(importedGames.map(game => [game.id, game]));
  const derivedReviewedStatus = deriveReviewedStatusIndex({
    games: importedGames,
    completedAnalysis: records,
  });
  const staleGameIds = new Set<string>([
    ...reviewedStatusIndex.keys(),
    ...analyzedGameIds,
    ...analyzedReviewEngine.keys(),
    ...analyzedGameAccuracy.keys(),
    ...missedTacticGameIds,
  ]);
  reviewedStatusIndex.clear();
  for (const [gameId, status] of derivedReviewedStatus.index) reviewedStatusIndex.set(gameId, status);
  analyzedGameIds.clear();
  analyzedReviewEngine.clear();
  analyzedGameAccuracy.clear();
  missedTacticGameIds.clear();

  // Partial/version-stale never overload reviewed === true anywhere: this index is populated
  // and read independently of reviewedStatusIndex/analyzedGameIds above.
  reviewIncompleteIndex.clear();
  for (const record of classification.partial) {
    if (!libraryGamesById.has(record.gameId)) continue;
    reviewIncompleteIndex.set(record.gameId, { classification: 'partial', updatedAt: record.updatedAt });
  }
  for (const record of classification.versionStale) {
    if (!libraryGamesById.has(record.gameId)) continue;
    reviewIncompleteIndex.set(record.gameId, { classification: 'version-stale', updatedAt: record.updatedAt });
  }

  for (const record of records) {
    const game = libraryGamesById.get(record.gameId);
    if (!game) continue;
    staleGameIds.delete(record.gameId);
    analyzedGameIds.add(record.gameId);
    if (record.reviewEngine) analyzedReviewEngine.set(record.gameId, record.reviewEngine);
    const cache = evalCacheFromStoredNodes(record.nodes);
    clearMissedMoments(record.gameId);
    try {
      const recordCtrl = new AnalyseCtrl(pgnToTree(game.pgn));
      const userColor = getUserColor(game);
      const moments = detectMissedMoments(recordCtrl.mainline, cache, userColor);
      setMissedMoments(record.gameId, moments);
      if (moments.length > 0) missedTacticGameIds.add(record.gameId);
      const summary = computeAnalysisSummary(recordCtrl.mainline, cache);
      const accuracy = summary
        ? { white: summary.white.accuracy, black: summary.black.accuracy }
        : undefined;
      if (summary) {
        analyzedGameAccuracy.set(record.gameId, accuracy!);
      }
      setReviewedStatus(record.gameId, {
        analysisUpdatedAt: record.updatedAt,
        ...(record.reviewEngine !== undefined ? { reviewEngine: record.reviewEngine } : {}),
        ...(accuracy !== undefined ? { accuracy } : {}),
        missedMomentCount: moments.length,
      });
    } catch (error) {
      console.warn('[analysis-state] reviewed-state detail hydration failed', record.gameId, error);
    }
  }
  for (const gameId of staleGameIds) {
    if (!reviewedStatusIndex.has(gameId)) clearReviewedStatus(gameId);
    clearMissedMoments(gameId);
  }
  const staleRuntimeEntriesCleared = staleGameIds.size;

  redraw();
  recordReviewStorageCountsAfterHydration({
    generation,
    startedAt: hydrationStartedAt,
    completedAnalysisCount: records.length,
    derivedReviewedCount: derivedReviewedStatus.index.size,
    completedAnalysisWithoutGame: derivedReviewedStatus.completedAnalysisWithoutGame,
    staleRuntimeEntriesCleared,
  });
}

interface RemoteSyncRemoteSyncAppliedDetail {
  stores?: readonly string[];
}

function remoteSyncRemoteSyncStores(event: Event): Set<string> {
  const detail = (event as CustomEvent<RemoteSyncRemoteSyncAppliedDetail>).detail;
  return new Set(Array.isArray(detail?.stores) ? detail.stores : []);
}

function restoreGameIdCounterFromLibrary(games: ImportedGame[]): void {
  const maxId = Math.max(0, ...games
    .filter(g => g.id.startsWith('game-'))
    .map(g => parseInt(g.id.slice(5), 10) || 0));
  restoreGameIdCounter(maxId);
}

function replaceDeletedAnalysisGameRoute(): void {









  const previousRoute = currentRoute;
  const destinationRoute = replaceHashRoute(serializeGenericAnalysisRoute()).route;
  handleRouteTransition({ previousRoute, destinationRoute });
  previousRouteForPracticeLifecycle = destinationRoute;
  currentRoute = destinationRoute;
}

async function rehydrateRuntimeAfterRemoteSyncPull(event: Event): Promise<void> {
  const stores = remoteSyncRemoteSyncStores(event);
  const plan = planRemoteSyncRuntimeApply(stores);
  const gameGeneration = plan.games ? ++gameLibraryHydrationGeneration : gameLibraryHydrationGeneration;
  const accountGeneration = plan.accounts ? ++registeredAccountsHydrationGeneration : registeredAccountsHydrationGeneration;

  try {
    const [stored, accounts, puzzles] = await Promise.all([
      plan.games ? loadGamesFromIdb() : Promise.resolve(undefined),
      plan.accounts ? listAccounts() : Promise.resolve(undefined),
      plan.puzzles ? loadPuzzlesFromIdb() : Promise.resolve(undefined),
    ]);
    if (plan.games && gameGeneration !== gameLibraryHydrationGeneration) return;

    let needsRedraw = plan.settings || plan.openings;

    if (plan.accounts && accountGeneration === registeredAccountsHydrationGeneration && accounts) {
      registeredAccounts = accounts;





      needsRedraw = true;
    }

    if (plan.puzzles && puzzles) {
      setSavedPuzzles(puzzles);
      needsRedraw = true;
    }

    if (plan.openings || plan.games || plan.accounts) {
















      void refreshOpeningsSource(redraw, {
        collections: plan.openings,
        accounts: plan.accounts,
        accountSession: shouldRefreshAccountSession(plan, isOpponentsTreeRoute(currentRoute)),
      });
    }

    if (plan.games) {
      gamesLibraryLoaded = true;
      // A successful rehydrate clears any earlier startup storage-failure state — exactly
      // parallel to the startup .then's reset (BUG-2026-07-10-007 review finding I-1), so a
      // stale error card never outlives a hydration that actually delivered the library.
      gameLibraryHydrationError = false;
      const previousSelectedId = selectedGameId;
      const previousSelectedPgn = selectedGamePgn;
      const rawRouteGameId = currentRoute.name === 'analysis-game'
        ? (currentRoute.params['id'] ?? null)
        : null;
      const routeGameId = rawRouteGameId && !rawRouteGameId.startsWith('research:')
        ? parseImportedGameRouteId(rawRouteGameId)
        : null;
      const storedGames = stored?.games ?? [];
      setImportedGames(storedGames);
      restoreGameIdCounterFromLibrary(storedGames);

      const gameDecision = decideRuntimeGameApply({
        games: storedGames,
        storedSelectedId: stored?.selectedId ?? null,
        previousSelectedId,
        previousSelectedPgn,
        routeGameId,
      });

      if (gameDecision.routeGameDeleted) replaceDeletedAnalysisGameRoute();

      if (gameDecision.selectedGame) {






        if (gameDecision.shouldReloadBoard) flushPendingGamePersist();
        selectedGameId = gameDecision.selectedGame.id;
        selectedGamePgn = gameDecision.selectedGame.pgn;
        if (gameDecision.shouldReloadBoard) {
          loadGame(gameDecision.selectedGame.pgn);
          applyRouteOwnedAnalysisPly(currentRoute, { sync: true });
        } else {
          needsRedraw = true;
        }
      } else if (gameDecision.shouldReloadBoard) {
        flushPendingGamePersist();
        selectedGameId = null;
        selectedGamePgn = null;
        restoreGameIdCounter(0);
        loadGame(null);
      } else {
        selectedGameId = previousSelectedId;
        selectedGamePgn = previousSelectedPgn;
        needsRedraw = true;
      }

      if (storedGames.length > 0) {
        void backfillGameSummaries(storedGames);
        void backfillOpenings();
      }
    }

    if (plan.review || plan.games) void hydrateReviewedStateFromIdb();
    if (needsRedraw) redraw();
  } catch (error) {
    console.warn('[remote-sync] Runtime rehydration after pull failed', error);
  }
}


// --- Navigation ---

// --- Navigation ---
// Single navigation helper: every path change must go through here so that
// board, eval arrow, graph, and move list always stay in sync.
// Mirrors the userJump pattern in lichess-org/lila: ui/analyse/src/ctrl.ts

function analysisRepertoireArrowsActive(): boolean {
  return explorerCtrl.enabled
    && explorerCtrl.config.db === 'repertoire'
    && repertoireSourcesLoaded()
    && !repertoireSourcesError();
}

function scheduleAnalysisRepertoireArrowRefresh(): void {
  if (!analysisRepertoireArrowsActive()) return;
  const token = currentGenerationToken();
  onSettle(() => {
    if (!isGenerationCurrent(token)) return;
    syncArrowForced();
  });
}








// Engine on/off state recorded when practice forced the engine on; null = nothing to restore.
let prePracticeEngineWasOff: boolean | null = null;
// True while a navigate() call is caused by applying a move (user move or engine reply),
// as opposed to browsing. Distinguishes lila's playUci→jump from userJump.
let practiceMoveNavigation = false;


let drillFenBeforeUserMove: string | null = null;
let drillEvalBeforeUserMove: { cp?: number; mate?: number; depth?: number; best?: string } | null = null;

function togglePracticeSession(): void {
  if (practiceActive()) {
    endPracticeSession();
    return;
  }
  // Close exclusive tools first — lila closeTools() equivalent.
  if (ctrl.retro || ctrl.retroChoice) toggleRetro();

  if (questionnaireCtrl) closeQuestionnaireModule();
  // Practice needs the live engine for verdicts and hints; force it on and remember.
  prePracticeEngineWasOff = !engineEnabled;
  if (!engineEnabled) toggleEngine();
  // The visible engine display defaults OFF regardless of the underlying on/off state above —
  // verdict/reply evals keep running internally via the forced-on engine. Shares the reveal/hide
  // flag with retro (mutually exclusive), so this also guards against a stale "revealed" state
  // left over from a previous session.
  resetRetroVisibleEngineUi();
  startPractice();
  syncBoard();
  redraw();
}

function endPracticeSession(reason: PremoveQueueClearReason = 'practice-reset'): void {
  if (!practiceActive()) return;
  stopPractice(reason); // cancels pending replies, exits play mode, clears practice shapes
  if (prePracticeEngineWasOff && engineEnabled) toggleEngine();
  prePracticeEngineWasOff = null;
  // Reset the shared reveal flag so it doesn't leak into the next retro/practice session, and
  // resync arrows immediately — buildArrowShapes() gates on practiceActive() via the suppress
  // provider below, so this must run now rather than waiting on the next navigation/engine event
  // (mirrors toggleRetro()'s identical arrow-restore cleanup for the same suppression mechanism).
  resetRetroVisibleEngineUi();
  syncBoard();
  syncArrow();
  redraw();
}










let questionnaireCtrl: QuestionnaireCtrl | null = null;
// gameId the currently-open questionnaireCtrl belongs to — guards a stale instance surviving a
// same-tick game switch race (mirrors gameIdForRetro/gameIdForRebuild capture in startRetroSession).
let questionnaireGameId: string | null = null;

/** Short "vs Opponent · Opening · Time class" line for the questionnaire's draw pre-question
 *  (QuestionnaireContext.line) — degrades gracefully when a field is unavailable. */
function questionnaireContextLine(game: ImportedGame): string {
  const userColor = getUserColor(game);
  const opponent = userColor === 'white' ? game.black : userColor === 'black' ? game.white : undefined;
  const parts = [
    opponent ? `vs ${opponent}` : undefined,
    game.opening,
    game.timeClass ? game.timeClass.charAt(0).toUpperCase() + game.timeClass.slice(1) : undefined,
  ].filter((part): part is string => !!part);
  return parts.join(' · ');
}










function openQuestionnaireModule(): void {
  const gameId = selectedGameId;
  const game = gameId ? importedGames.find(g => g.id === gameId) : undefined;
  if (!gameId || !game) return;
  const result = gameResult(game);
  if (!result) return; // no determinable win/loss/draw — nothing to seed the wizard with
  if (practiceActive()) endPracticeSession();
  if (ctrl.retro || ctrl.retroChoice) toggleRetro();
  if (explorerCtrl.enabled) explorerCtrl.toggle();
  questionnaireGameId = gameId;
  questionnaireCtrl = new QuestionnaireCtrl(
    {
      result,
      context: { line: questionnaireContextLine(game) },
      onComplete: completion => {






        applyEnrichmentPatch(gameId, { questionnaire: completion.answers });






        scheduleGamePersist(gameId);
        flushPendingGamePersist();
        // Silent Study auto-file (P2-QST-5, GD-2 — system-initiated, so this NEVER opens the T2
        // save-flow modal). Fire-and-forget like every other background IDB write in this file;
        // a failure is logged inside autoFileStudiedGame and never surfaced to the user, since
        // this path must never block or prompt.
        const studiedGame = importedGames.find(g => g.id === gameId);
        if (studiedGame) void autoFileStudiedGame(studiedGame, completion.answers);
        redraw();
      },
    },
    redraw,
  );
  redraw();
}

function closeQuestionnaireModule(): void {
  if (!questionnaireCtrl) return;
  questionnaireCtrl = null;
  questionnaireGameId = null;
  redraw();
}

function toggleQuestionnaireModule(): void {
  if (questionnaireCtrl && questionnaireGameId === selectedGameId) closeQuestionnaireModule();
  else openQuestionnaireModule();
}

// Analysis adapter for the generic P0 navigation primitive (D-core-04, src/analyse/
// workspaceNavigation.ts). `runNavigate` owns the no-op guard, the cursor transition, the direct
// Chessground sync, and the terminal redraw + active-move-scroll, in that order; this function
// supplies every Analysis-specific side effect (practice, premoves, retro, explorer, engine
// arrows/eval, route/nav-state persistence, move sound) as hooks at the three defined points, so
// the exact step order of the pre-extraction implementation is preserved byte-for-byte.
function navigate(path: string): void {
  // practiceBrowse/practiceFromPath are computed in beforeTransition (mirrors lila userJump
  // practice.preUserJump timing — while the cursor is still at the OLD path) and read again in
  // afterTransition (practicePostUserJump), so they're captured here rather than passed through
  // the generic primitive, which knows nothing about practice mode.
  let practiceBrowse = false;
  let practiceFromPath = ctrl.path;
  runNavigate(path, {
    getPath: () => ctrl.path,
    setPath: p => ctrl.setPath(p),
    syncBoard,
    redraw,
    requestActiveMoveScroll: () => requestActiveMoveScroll(),
    beforeTransition: (fromPath, toPath) => {
      markNav();
      // Practice browse detection — mirrors lila userJump practice.preUserJump: a path change
      // NOT caused by move application pauses the session (off-track).
      practiceBrowse = practiceActive() && !practiceMoveNavigation;
      practiceFromPath = fromPath;
      if (practiceBrowse && getPremoveQueueState().intents.length > 0) {
        clearPremoveQueue('navigation');
      }
      if (practiceBrowse) practicePreUserJump(practiceFromPath, toPath);
    },
    afterTransition: (fromPath, toPath) => {
      // Play move sound when stepping forward one ply (new path is exactly 2 chars longer).
      // Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts jump() isForwardStep + site.sound.move().
      const isForwardStep = toPath.length === fromPath.length + 2;
      if (isForwardStep) playMoveSound(ctrl.node.san);
      // Notify retrospection of the path change — offTrack detection, later win/fail.
      // Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts jump() retro.onJump() call.
      ctrl.retro?.onJump(toPath);
      // Practice path-change hooks — mirrors lila jump() practice.onJump() + userJump's
      // postUserJump (resume when browsing back to a position where it's the user's turn).
      if (practiceActive()) {
        practiceOnJump();
        if (practiceBrowse) practicePostUserJump(practiceFromPath, toPath);
      }
      explorerCtrl.clearStaleHovering(ctrl.node.fen);
    },
    afterBoardSync: () => {
      syncArrowForced();
      scheduleAnalysisRepertoireArrowRefresh();
      evalCurrentPosition();
      // Notify opening explorer of the new position.
      // Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts jump() explorer.setNode() call.
      explorerCtrl.setNode(ctrl.node.fen, redraw);
      scheduleNavStateSave(ctrl.path);
      replaceAnalysisRouteForCurrentPath();
      practiceMoveNavigation = false;
    },
  });
}

// Center the active move vertically in the visible portion of the move list.
// Adapted from lichess-org/lila: ui/analyse/src/treeView/treeView.ts autoScroll()
// Uses getBoundingClientRect geometry to compute exact scroll offset so the active
// move sits in the middle of the visible list area, not just scrolled into view.
// On mobile the move list is not a scroll container (the page scrolls instead),
// so falls back to scrollIntoView on the active element.
let _scrollRaf = 0;
let _scrollMeasureRaf = 0;
let _scrollRetryTimer = 0;
let _scrollRequestId = 0;
let _pendingActiveMoveScroll = false;
let _pendingActiveMoveScrollBehavior: ScrollBehavior = 'instant';
function scrollActiveIntoView(behavior: ScrollBehavior = 'instant', preferredRoot?: HTMLElement): void {
  const requestId = ++_scrollRequestId;
  cancelAnimationFrame(_scrollRaf);
  cancelAnimationFrame(_scrollMeasureRaf);
  clearTimeout(_scrollRetryTimer);








  let settled = false;
  const run = (attempt = 0) => {
    _scrollRaf = requestAnimationFrame(() => {
      _scrollMeasureRaf = requestAnimationFrame(() => {
        if (requestId !== _scrollRequestId) return;
        const visibleMoveRoot = Array.from(document.querySelectorAll<HTMLElement>('.analyse__moves')).find(el => {
          const rect = el.getBoundingClientRect();
          const styles = getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && styles.display !== 'none' && styles.visibility !== 'hidden';
        }) ?? null;
        const moveRoot = preferredRoot?.isConnected ? preferredRoot : visibleMoveRoot;
        const scrollView = moveRoot?.querySelector<HTMLElement>('.tview2-column') ?? moveRoot;
        const moveEl     = moveRoot?.querySelector<HTMLElement>('.move.active, move.active');
        if (!moveRoot || !scrollView) return;
        if (!moveEl) {
          if (scrollView.scrollTop !== 0) {
            if (behavior === 'smooth') scrollView.scrollTo({ top: 0, behavior });
            else scrollView.scrollTop = 0;
          } else {
            settled = true;
          }
        } else if (scrollView.scrollHeight <= scrollView.clientHeight + 2) {
          // If the container has no overflow (mobile: page scrolls instead), use scrollIntoView.
          const move = moveEl.getBoundingClientRect();
          const offCenter = Math.abs(move.top + move.height / 2 - window.innerHeight / 2);
          if (attempt === 0 || offCenter > 1) {
            moveEl.scrollIntoView({ behavior, block: 'center' });
          } else {
            settled = true;
          }
        } else {
          const move = moveEl.getBoundingClientRect();
          const view = scrollView.getBoundingClientRect();
          const visibleHeight = Math.min(view.bottom, window.innerHeight) - Math.max(view.top, 0);
          const offCenter = move.top - view.top - (visibleHeight - move.height) / 2;
          if (attempt === 0 || Math.abs(offCenter) > 1) {
            const nextScrollTop = scrollView.scrollTop + offCenter;
            if (behavior === 'smooth') scrollView.scrollTo({ top: nextScrollTop, behavior });
            else scrollView.scrollTop = nextScrollTop;
          } else {
            settled = true;
          }
        }
        if (!settled && attempt < 4 && requestId === _scrollRequestId) {
          _scrollRetryTimer = window.setTimeout(() => run(attempt + 1), 80);
        }
      });
    });
  };
  run();
}

function requestActiveMoveScroll(behavior: ScrollBehavior = 'instant'): void {
  _pendingActiveMoveScroll = true;
  _pendingActiveMoveScrollBehavior = behavior;
  scrollActiveIntoView(behavior);
}

function flushPendingActiveMoveScroll(vnode: VNode): void {
  if (!_pendingActiveMoveScroll) return;
  if (!(vnode.elm instanceof HTMLElement)) return;
  const behavior = _pendingActiveMoveScrollBehavior;
  _pendingActiveMoveScroll = false;
  scrollActiveIntoView(behavior, vnode.elm);
}

function next(): void {
  const child = ctrl.node.children[0];
  if (!child) return;
  navigate(ctrl.path + child.id);
}

function prev(): void {
  if (ctrl.path === '') return;
  navigate(pathInit(ctrl.path));
}

function jumpToStart(): void {
  navigate('');
}

function jumpToLast(): void {
  let node = ctrl.root;
  let path = '';
  while (node.children.length > 0) {
    const firstChild = node.children[0]!;
    path += firstChild.id;
    node = firstChild;
  }
  navigate(path);
}

// Horizontal scrub gesture on the controls bar — swipe left/right to navigate moves.
// Fast swipe (high velocity) jumps to game start or end.
// Adapted from lichess-org/lila: ui/analyse/src/view/controls.ts scrubControl()
let _scrubLast: number[] = [];
let _scrubStartX = 0;
let _scrubActive = false;

function attachScrubListener(el: HTMLElement): void {
  // Touch/stylus devices only — pointer with no fine hover
  if (!window.matchMedia('(hover: none)').matches) return;

  el.addEventListener('pointerdown', (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    _scrubStartX = e.clientX;
    _scrubLast   = [];
    _scrubActive = true;
    el.setPointerCapture(e.pointerId);
  });

  el.addEventListener('pointermove', (e: PointerEvent) => {
    if (!_scrubActive) return;
    const dx = e.clientX - _scrubStartX;
    if (Math.abs(dx) < 8) return;
    _scrubStartX = e.clientX;
    if (dx > 0) next(); else prev();
    _scrubLast.push(dx);
    redraw();
  });

  el.addEventListener('pointerup', () => {
    if (!_scrubActive) return;
    _scrubActive = false;
    const recent = _scrubLast.slice(-3);
    if (recent.length > 0) {
      const v = recent.reduce((a, b) => a + b, 0) / recent.length;
      if (v > 16) jumpToLast();
      else if (v < -16) jumpToStart();
    }
    _scrubLast = [];
  });
}

/**
 * Remove all side-variation branches from the tree, restoring the move list to
 * the imported/mainline move order. evalCache and review state are unaffected.
 * Repairs the active path if it was inside a deleted branch.
 * Mirrors lichess-org/lila: ui/lib/src/tree/ops.ts updateAll walking pattern.
 */
function clearVariations(): void {
  pruneVariations(ctrl.root);
  // Repair current path if it is now invalid (was inside a deleted variation).
  let repairPath = ctrl.path;
  while (repairPath !== '' && !nodeAtPath(ctrl.root, repairPath)) {
    repairPath = pathInit(repairPath);
  }
  if (repairPath !== ctrl.path) {
    navigate(repairPath);
  } else {
    ctrl.setPath(ctrl.path); // refresh ctrl.mainline / nodeList after tree mutation
    syncBoard();
    syncArrow();
    scheduleNavStateSave(ctrl.path);
    redraw();
  }
}

/**
 * Remove a side variation branch from the tree.
 * If the active path is inside the deleted branch, navigate to the branch root's parent.
 * Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts deleteNode path-repair logic.
 */
function deleteVariation(path: string): void {
  deleteNodeAt(ctrl.root, path);
  if (ctrl.path.startsWith(path)) {
    // Active node was inside the deleted variation — move up to its parent.
    navigate(pathInit(path));
  } else {
    syncArrow();
    scheduleNavStateSave(ctrl.path);
    redraw();
  }
}

// Mirrors lichess-org/lila: ui/analyse/src/control.ts first / last
function first(): void {
  navigate('');
}

function last(): void {
  // Path to the final mainline node = all non-root node IDs concatenated
  navigate(ctrl.mainline.slice(1).reduce((acc, n) => acc + n.id, ''));
}

/**
 * Toggle the per-game retrospection session.
 * Activating: builds candidates, attaches RetroCtrl, jumps to the position before
 * the first candidate mistake so the user can try to find the better move.
 * Deactivating: clears ctrl.retro — all lifecycle hooks silently no-op.
 *
 * Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts toggleRetro +
 * retroCtrl.ts jumpToNext → root.userJump(prev.path).
 */
function toggleRetro(): void {
  // Practice and retro are mutually exclusive — mirrors lila closeTools() on entry.
  if (practiceActive()) endPracticeSession();

  if (questionnaireCtrl) closeQuestionnaireModule();
  if (ctrl.retro) {



    cancelSilentEval();
    // Capture outcomes before the session is cleared so they remain available
    // when the user saves candidates from the post-retro candidates panel.
    lastRetroOutcomes = new Map(
      ctrl.retro.candidates
        .map(c => [c.ply, ctrl.retro!.getOutcome(c.ply)] as const)
        .filter((entry): entry is [number, 'win' | 'fail' | 'view' | 'skip'] => entry[1] !== undefined),
    );
    delete ctrl.retro;
    delete ctrl.retroActiveSelection;
    resetRetroVisibleEngineUi();
    // Restore arrows that were suppressed during retro mode.
    // buildArrowShapes() gates on ctrl.retro presence — syncArrow() must be
    // called here so arrows re-appear immediately without waiting for the next
    // navigation or engine event.
    syncArrow();
    redraw();
    return;
  }
  if (ctrl.retroChoice) {
    delete ctrl.retroChoice;
    redraw();
    return;
  }
  openRetroChoicePage();
}

function buildCurrentRetroCandidateList(): {
  candidates: RetroCandidate[];
  userColor: 'white' | 'black' | null;
} {
  const game = importedGames.find(g => g.id === selectedGameId);
  const userColor = game ? getUserColor(game) : null;
  const openingProvider = buildMainlineOpeningProvider(
    ctrl.mainline,
    Boolean(game?.opening || game?.eco),
  );
  const candidates = buildRetroCandidates(
    ctrl.mainline,
    p => evalCache.get(p),
    selectedGameId,
    userColor ?? null,
    openingProvider,
  );
  return { candidates, userColor: userColor ?? null };
}

function openRetroChoicePage(): void {
  const { candidates, userColor } = buildCurrentRetroCandidateList();
  ctrl.retroChoice = {
    candidates,
    userColor,
    selection: createDefaultRetroChoiceSelection(),
  };
  redraw();
}

function updateRetroChoiceSelection(selection: RetroChoiceSelection): void {
  if (!ctrl.retroChoice) return;
  ctrl.retroChoice = { ...ctrl.retroChoice, selection };
  redraw();
}

function rebuildRetroChoicePage(): void {
  if (!ctrl.retroChoice) return;
  const { candidates, userColor } = buildCurrentRetroCandidateList();
  ctrl.retroChoice = {
    ...ctrl.retroChoice,
    candidates,
    userColor,
  };
  redraw();
}

function getRetroConfigCountSummary() {
  const currentMinLossThreshold = retroConfig.minLossThreshold;
  const currentCandidates = buildCurrentRetroCandidateList().candidates;
  const broadPreviewThreshold = Math.min(
    currentMinLossThreshold,
    ...RETRO_CHOICE_SEVERITY_PRESETS.map(preset => preset.generationLossThreshold),
  );



  const hasReviewedGame = Boolean(
    selectedGameId && analysisComplete && analyzedGameIds.has(selectedGameId),
  );
  try {
    retroConfig.minLossThreshold = broadPreviewThreshold;
    const { candidates } = buildCurrentRetroCandidateList();
    const summary = summarizeRetroChoiceCounts(candidates, createDefaultRetroChoiceSelection());
    return {
      ...summary,
      total: currentCandidates.length,
      configPreview: hasReviewedGame ? buildRetroConfigPreview(currentCandidates) : null,
    };
  } finally {
    retroConfig.minLossThreshold = currentMinLossThreshold;
  }
}

function beginRetroChoiceSession(): void {
  const choice = ctrl.retroChoice;
  if (!choice) return;
  const selectedCandidates = filterRetroCandidatesForChoice(choice.candidates, choice.selection);
  if (selectedCandidates.length === 0) {
    redraw();
    return;
  }
  delete ctrl.retroChoice;
  ctrl.retroActiveSelection = cloneRetroChoiceSelection(choice.selection);
  startRetroSession(selectedCandidates, choice.userColor);
}

function startRetroSession(candidates: RetroCandidate[], userColor: 'white' | 'black' | null): void {
  // LFYM should own the board and live engine while solving. If the selected game is the active
  // queue entry, pause the queue and leave resume as an explicit user action.
  suspendReviewQueueForLfym(selectedGameId);
  if (!engineEnabled) toggleEngine();
  resetRetroVisibleEngineUi();
  // Reset cached outcomes — a new session for this game is starting.
  lastRetroOutcomes = null;
  const gameIdForRetro = selectedGameId;
  ctrl.retro = makeRetroCtrl(
    candidates,
    userColor,
    () => currentEval,
    (path) => evalCache.get(path),
    navigate,
    gameIdForRetro ? (outcomes, total) => {
      if (outcomes.size === 0) return;
      const result: RetroSessionResult = {
        gameId:          gameIdForRetro,
        savedAt:         Date.now(),
        totalCandidates: total,
        outcomes:        Object.fromEntries([...outcomes.entries()].map(([k, v]) => [String(k), v])),
        complete:        outcomes.size === total && total > 0,
      };
      void saveRetroResult(result);
    } : undefined,
  );
  // Jump to the position before the first candidate mistake.
  // Mirrors lichess-org/lila: retroCtrl.ts jumpToNext → root.userJump(prev.path).
  const first = ctrl.retro.current();
  if (first) {
    if (first.parentPath === ctrl.path) {
      // Entering LFYM changes both render state and arrow ownership even when the board cursor is
      // already at the solve position. The shared navigation primitive intentionally no-ops for
      // the same path, so mirror Lichess jumpToNext()'s unconditional shape refresh + safeRedraw
      // at this mode-transition owner without restarting board, engine, route, or explorer work.
      syncArrow();
      redraw();
    } else {
      navigate(first.parentPath); // navigate owns board/arrow sync and redraw for a real jump.
    }
  }
  else redraw(); // no candidates — still redraw to update button state
}

function clearRetroMode(): void {
  if (ctrl.retroChoice) {
    delete ctrl.retroChoice;
    return;
  }
  if (!ctrl.retro) return;


  cancelSilentEval();
  lastRetroOutcomes = new Map(
    ctrl.retro.candidates
      .map(c => [c.ply, ctrl.retro!.getOutcome(c.ply)] as const)
      .filter((entry): entry is [number, 'win' | 'fail' | 'view' | 'skip'] => entry[1] !== undefined),
  );
  delete ctrl.retro;
  delete ctrl.retroActiveSelection;
  resetRetroVisibleEngineUi();
  syncArrow();
}

/**
 * Rebuild the active retrospection session using the current retroConfig.
 * Called when mistake-detection settings change while a session is running.
 * Re-runs candidate building with the new parameters and restarts from the
 * first unsolved candidate — preserving color filter and eval cache.
 *
 * When no session is active this is a no-op; the next toggleRetro() call
 * will build candidates with the updated config automatically.
 */
function rebuildRetroSession(): void {
  if (!ctrl.retro) return;
  suspendReviewQueueForLfym(selectedGameId);
  if (!engineEnabled) toggleEngine();
  resetRetroVisibleEngineUi();
  const game = importedGames.find(g => g.id === selectedGameId);
  const userColor = game ? getUserColor(game) : null;
  const openingProvider = buildMainlineOpeningProvider(
    ctrl.mainline,
    Boolean(game?.opening || game?.eco),
  );
  const rebuiltCandidates = buildRetroCandidates(
    ctrl.mainline,
    p => evalCache.get(p),
    selectedGameId,
    userColor ?? null,
    openingProvider,
  );
  const candidates = ctrl.retroActiveSelection
    ? filterRetroCandidatesForChoice(rebuiltCandidates, ctrl.retroActiveSelection)
    : rebuiltCandidates;
  const gameIdForRebuild = selectedGameId;
  ctrl.retro = makeRetroCtrl(
    candidates,
    userColor ?? null,
    () => currentEval,
    (path) => evalCache.get(path),
    navigate,
    gameIdForRebuild ? (outcomes, total) => {
      if (outcomes.size === 0) return;
      const result: RetroSessionResult = {
        gameId:          gameIdForRebuild,
        savedAt:         Date.now(),
        totalCandidates: total,
        outcomes:        Object.fromEntries([...outcomes.entries()].map(([k, v]) => [String(k), v])),
        complete:        outcomes.size === total && total > 0,
      };
      void saveRetroResult(result);
    } : undefined,
  );
  syncArrow();
  const first = ctrl.retro.current();
  if (first) navigate(first.parentPath);
  else redraw();
}

// --- Multi-game analysis queue ---

/**
 * Hand the selected games to the background review queue.
 * reviewQueue.ts drives all game loading and engine coordination independently.
 */
function reviewAllGames(games: ImportedGame[], sourceContext?: ReviewRunSourceContext): void {
  if (games.length === 0) return;
  recordDiagnostic({
    kind: 'lifecycle',
    severity: Severity.Info,
    source: 'main.reviewAllGames',
    sourceTag: 'review-queue',
    message: 'import-auto-review-queued',
    metadata: {
      queuedCount: games.length,
    },
    redactionClass: 'safe',
  });
  appendBulkReviewRunSource(games, undefined, sourceContext);
}

function selectedGameReviewActive(): boolean {
  const summary = getQueueSummary();
  return selectedGameId !== null && summary.currentGameId === selectedGameId && summary.running;
}

function selectedGameReviewState(): 'idle' | 'analyzing' | 'complete' {
  if (selectedGameReviewActive()) return 'analyzing';
  return analysisComplete ? 'complete' : 'idle';
}

// --- Route views ---







let editorCtrl: EditorCtrl | undefined;

// Mirrors lila's EditorCtrl.makeEditorUrl: the start position at white
// orientation serializes to the bare route so a freshly-opened editor doesn't
// carry a noisy fen/color query string.
function serializeEditorRoute(fen: string, orientation: Color): string {
  if (fen === INITIAL_FEN && orientation === 'white') return '#/editor';
  const params = new URLSearchParams();
  params.set('fen', fen);
  if (orientation === 'black') params.set('color', 'black');
  return `#/editor?${params.toString()}`;
}

function renderRouteContent(route: Route): VNode {
  const deps: GamesViewDeps = {
    importedGames, selectedGameId,
    accounts: registeredAccounts,
    reviewedStatusIndex,
    reviewIncompleteIndex,
    analyzedGameIds, missedTacticGameIds, analyzedGameAccuracy,
    savedPuzzles, gameResult, getUserColor, gameSourceUrl, renderCompactGameRow,
    selectGame(game) {
      flushPendingGamePersist();
      selectedGameId = game.id;
      loadGame(game.pgn);
    },
    reviewGame(game) {
      flushPendingGamePersist();
      selectedGameId = game.id;
      loadGame(game.pgn);
      writeHashRoute(serializeAnalysisSelectedGameRoute(game.id));
      enqueueAtFront([game], reviewDepth);
    },
    reviewAllGames,
    redraw,
  };
  if (route.name === 'games') deps.routeQuery = route.query ?? '';
  switch (route.name) {
    case 'analysis-game': {
      // Resolve the route's game id against the imported library.
      // Three states:
      //   (a) IDB not yet loaded → show transient loading text until gamesLibraryLoaded.
      //   (b) id not found after load → honest not-found fallback.
      //   (c) id found → fall through to render the full analysis board below.
      //       The game was already selected by the onChange or startup route handler.
      const gameId = route.params['id'] ?? '';
      if (gameId.startsWith('research:')) {
        if (researchAnalysisError?.id === gameId) {
          return h('div', [
            h('p', researchAnalysisError.message),
            h('a', { attrs: { href: '#/opponents', ...controlExplainerAttrs({ label: 'Back to Opening Tree', description: 'Leave this research-game error and return to Opening Tree.' }) } }, 'Back to Opening Tree'),
          ]);
        }
        if (researchAnalysisLoadingId === gameId || selectedGameId !== gameId) {
          return h('div.analyse', [
            h('div.analyse__board.main-board', [
              h('div.analyse__board-inner.skeleton-board', 'Loading research game...'),
            ]),
            h('div.analyse__tools', [
              h('div.skeleton-block'),
            ]),
          ]);
        }
      }
      if (!gamesLibraryLoaded) {
        return h('div.analyse', [
          h('div.analyse__board.main-board', [
            h('div.analyse__board-inner.skeleton-board', 'Loading game…'),
          ]),
          h('div.analyse__tools', [
            h('div.skeleton-block'),
          ]),
        ]);
      }
      const importedGameId = parseImportedGameRouteId(gameId);
      if (!importedGameId || !importedGames.find(g => g.id === importedGameId)) {
        return h('div', [
          h('p', `Game "${importedGameId ?? gameId}" was not found in the imported library.`),
          h('a', { attrs: { href: '#/games', ...controlExplainerAttrs({ label: 'View all games', description: 'Leave this missing game and open the Games library.' }) } }, 'View all games'),
        ]);
      }
      // intentional fallthrough — game is loaded, render the analysis board
    }
    // falls through
    case 'analysis':
      const currentGame = importedGames.find(g => g.id === selectedGameId);
      const currentUserColor = currentGame ? getUserColor(currentGame) : null;


      const currentOpponentName = currentGame
        ? (currentUserColor === 'white' ? currentGame.black
          : currentUserColor === 'black' ? currentGame.white
          : undefined)
        : undefined;
      const retroChoiceOpen = !!ctrl.retroChoice;
      const retroToolOpen = !!ctrl.retro || retroChoiceOpen;




      const engineDisplayHiddenByDefault = !!ctrl.retro || practiceActive();
      const retroVisibleEngineEnabled = engineDisplayHiddenByDefault ? isRetroVisibleEngineEnabled() : engineEnabled;
      // retroSolving: true while user is in the LFYM attempt phase (find | fail).
      // Used to suppress the eval pearl, eval bar value, and PV lines — all of which
      // would reveal the engine's assessment of the position and spoil the puzzle.
      // Resets automatically on the next render after jumpToNext() sets feedback='find'.
      // Mirrors lichess-org/lila: showCevalPvs: !ctrl.retro?.isSolving() && !ctrl.practice
      const retroSolving = ctrl.retro?.isSolving() ?? false;
      const showRetroPv = !engineDisplayHiddenByDefault || (ctrl.retro?.guidanceRevealed() ?? false) || (retroVisibleEngineEnabled && !retroSolving);



      const renderAnalysisNav = () => renderMoveNavBar([
        analysisModeSnapshotActive()
          ? renderAnalysisModeToggleButton(true, () => exitAnalysisModeToggle())
          : null,
      ], ctrl.retro ? undefined : {
        bookActive: explorerCtrl.enabled,
        onBook: () => {


          const opening = !explorerCtrl.enabled;
          explorerCtrl.toggle();
          if (opening && questionnaireCtrl) closeQuestionnaireModule();
          explorerCtrl.setNode(ctrl.node.fen, redraw);
          syncArrowForced();
          scheduleAnalysisRepertoireArrowRefresh();
          redraw();
        },
      });
      const renderAnalysisSummaryForCurrentGame = () => renderAnalysisSummary(
        analysisComplete,
        evalCache,
        ctrl.mainline,
        currentGame?.white ?? 'White',
        currentGame?.black ?? 'Black',
        analysisComplete && selectedGameId ? analyzedReviewEngine.get(selectedGameId) : undefined,
      );
      const renderAnalysisExplorerForCurrentNode = () => renderAnalysisExplorerSection(
        ctrl.node.fen,
        cgInstance,
        (uci: string) => {
          const node = nodeAtPath(ctrl.root, ctrl.path);
          const child = node?.children.find(c => c.uci === uci);
          if (child) navigate(ctrl.path + child.id);
          else playUciMove(uci);
        },
        redraw,
        (() => {
          let path = '';
          return ctrl.nodeList.map((node, index) => {
            if (index > 0) path += node.id;
            return {
              fen: node.fen,
              path,
              uci: node.uci ?? null,
              san: node.san ?? null,
              ply: node.ply,
            };
          });
        })(),
        navigate,
        () => ctrl.node.fen,
      );
      const renderAnalysisRepertoireForCurrentGame = () => renderAnalysisRepertoireCompliance({
        game:          currentGame,
        mainline:      ctrl.mainline,
        sources:       repertoireSources(),
        sourcesLoaded: repertoireSourcesLoaded(),
        sourcesError:  repertoireSourcesError(),
        loadSources:   loadRepertoireSources,
        navigate,
        redraw,
        currentNavigationToken: currentGenerationToken,
        isNavigationTokenCurrent: isGenerationCurrent,
      });
      const renderAnalysisSplitHandle = () => h('div.analyse__split-handle', {
        attrs: {
          role:               'separator',
          tabindex:           '0',
          'aria-orientation': 'horizontal',
          ...iconControlExplainerAttrs({ label: 'Resize Analysis panels', description: 'Drag or use arrow keys to resize the Analysis panels.' }),
        },
        on: {
          pointerdown: (event: PointerEvent) => beginAnalysisDesktopSplitResize(event, redraw),
          keydown:     (event: KeyboardEvent) => handleAnalysisDesktopSplitKeydown(event, redraw),
        },
      }, [
        h('span.analyse__split-handle-grip', { attrs: { 'aria-hidden': 'true' } }),
      ]);
      const renderRetroPanels = (): (VNode | null)[] => [
        // Active retrospection panels replace normal context tools while solving.
        // Mirrors lichess-org/lila: ui/analyse/src/view/tools.ts retro/explorer exclusivity.
        renderRetroStrip({
          retro:             ctrl.retro,
          navigate,
          redraw,
          uciToSan,
          onClose:           toggleRetro,
          getEvalDepth:      () => currentEval.depth,
          ...(currentOpponentName !== undefined ? { opponentName: currentOpponentName } : {}),
        }),
        renderRetroChoicePage({
          choice:            ctrl.retroChoice,
          onSelectionChange: updateRetroChoiceSelection,
          onBegin:           beginRetroChoiceSession,
          onClose:           toggleRetro,
        }),
      ];
      const renderAnalysisPuzzleCandidates = () => {
        const puzzleDeps: PuzzleRenderDeps = {
          mainline:    ctrl.mainline,
          getEval:     p => evalCache.get(p),
          gameId:      selectedGameId,
          currentPath: ctrl.path,
          engineEnabled, batchAnalyzing: selectedGameReviewActive(), batchState: selectedGameReviewState(),
          savedPuzzles,
          navigate,
          savePuzzle: savePuzzleWithRetroOutcome,
          uciToSan,
          redraw,
        };
        return renderPuzzleCandidates(puzzleDeps);
      };
      // Shared middle lower slot (desktop): Book explorer or active LFYM panels.
      // Empty when neither is open — the split divider only exists alongside this content.
      // Practice replaces the shared lower panel content while active, like retro.
      // Mirrors lichess-org/lila: ui/analyse/src/view/tools.ts practice exclusivity.
      const renderPracticePanel = (): VNode =>
        renderPracticeBox({
          turnColor: () => (ctrl.node.fen.includes(' w ') ? 'white' : 'black'),
          redraw,
          onClose: () => endPracticeSession(),
        });








      const questionnaireOpenForCurrentGame = !!questionnaireCtrl && questionnaireGameId === selectedGameId;
      const questionnaireEligible = !!currentGame
        && !!selectedGameId
        && analysisComplete
        && analyzedGameIds.has(selectedGameId)
        && !currentGame.questionnaire
        && gameResult(currentGame) !== null;
      // The Manual Review button now STAYS present after the Post Game Review Questions are filed
      // (owner 2026-07-06, terminology realignment): it flips from the open-ring (unsatisfied) cue
      // to the checked (satisfied) cue and keeps toggling the study-tools module for re-review/edit.
      const questionnaireCompletedForCurrentGame = !!currentGame
        && !!selectedGameId
        && !!currentGame.questionnaire;







      const questionnaireNeedsCategorization = !questionnaireEligible
        && !!currentGame
        && !!selectedGameId
        && !currentGame.questionnaire
        && gameResult(currentGame) !== null
        && treeHasAnnotations(ctrl.root);
      const renderQuestionnairePanel = (): VNode | null =>
        questionnaireCtrl ? renderQuestionnaire(questionnaireCtrl) : null;






      const renderAnnotationForCurrentNode = (): VNode | null =>
        renderAnnotationPanel({ root: ctrl.root, path: ctrl.path, redraw });
      const renderAnalysisMiddleLowerChildren = (): VNode[] => {
        const annotation = renderAnnotationForCurrentNode();
        if (annotation) return [annotation];
        return (
          practiceActive()
            ? [renderPracticePanel()]
            : retroToolOpen
              ? renderRetroPanels()
              : questionnaireOpenForCurrentGame
                ? [renderQuestionnairePanel()]
                : [renderAnalysisExplorerForCurrentNode()]
        ).filter((node): node is VNode => node !== null);
      };
      // Secondary info module (desktop): report cards, repertoire compliance, puzzle info.
      // Structurally independent of the engine/moves/nav module — rendered below the nav.
      const renderAnalysisSecondaryChildren = (): VNode[] => [
        renderAnalysisSummaryForCurrentGame(),
        renderAnalysisRepertoireForCurrentGame(),
        renderAnalysisPuzzleCandidates(),
      ].filter((node): node is VNode => node !== null);



      const renderAnalysisMobileContextChildren = (): VNode[] => {
        const annotation = renderAnnotationForCurrentNode();
        if (annotation) return [annotation];
        return (
          practiceActive()
            ? [renderPracticePanel()]
            : retroToolOpen
              ? renderRetroPanels()
              : questionnaireOpenForCurrentGame
                ? [renderQuestionnairePanel()]
                : [
                    renderAnalysisExplorerForCurrentNode(),
                    renderAnalysisSummaryForCurrentGame(),
                    renderAnalysisRepertoireForCurrentGame(),
                    renderAnalysisPuzzleCandidates(),
                  ]
        ).filter((node): node is VNode => node !== null);
      };
      forceClearCevalPositionOverride('analysis-render');
      return h('div.analyse', {
        class: { 'analyse--retro-tool-open': retroToolOpen },
      }, [
        // Board — left column (grid-area: board)
        // Mirrors lichess-org/lila: ui/analyse/src/view/main.ts div.analyse__board.main-board
        (() => {
          const [topStrip, bottomStrip] = renderPlayerStrips();
          return h('div.analyse__board.main-board', [
            topStrip,
            h('div.analyse__board-inner', [renderBoard(), renderPromotionDialog()]),
            bottomStrip,
          ]);
        })(),

        // Eval gauge — between board and tools (grid-area: gauge)
        // Mirrors lichess-org/lila: ui/analyse/css/_layout.scss .eval-gauge grid-area
        // Pass empty eval during LFYM attempt so the bar shows neutral 50% with no score.
        // The bar element stays in the layout (no jarring disappearance) but reveals nothing.
        renderEvalBar(retroVisibleEngineEnabled, retroSolving ? {} : visibleEvalForFen(ctrl.node.fen), ctrl.node.fen),

        // Tools — right column (grid-area: tools)
        // Mirrors lichess-org/lila: ui/analyse/src/view/main.ts div.analyse__tools
        h('div.analyse__tools', {
          attrs: { style: analysisDesktopLayoutVars() },
        }, [
          h('div.analyse__engine-block', [
            // Engine header: toggle + pearl + engine-name/status + settings gear
            // Mirrors lichess-org/lila: ui/lib/src/ceval/view/main.ts renderCeval()
            renderCeval({ retroHiddenByDefault: engineDisplayHiddenByDefault, retroSolving }),
            // The visible engine UI is independent from LFYM's background engine usage.
            // Keep the header/settings mounted during retro so the user can opt into
            // visible analysis without tearing down the hidden engine session.
            renderEngineSettings(),
            // PV lines — hidden whenever retrospection is active and guidance has not
            // been manually revealed for the current candidate.
            // Covers all retro states so the answer is never accidentally visible.
            // Mirrors lichess-org/lila: ui/analyse/src/view/tools.ts
            //   showCeval && !ctrl.retro?.isSolving() && cevalView.renderPvs(ctrl)
            showRetroPv ? renderPvBox() : null,
          ]),
          // Shared middle area: move list always; Book/LFYM content joins below with a
          // resizable split only while open. Nav is NOT here — it anchors in
          // .analyse__controls so middle content can never move it.
          (() => {
            const lowerChildren = renderAnalysisMiddleLowerChildren();
            const shared = lowerChildren.length > 0;
            return h('div.analyse__moves-stack', {
              class: { 'analyse__moves-stack--shared': shared },
            }, [
              // Move list with internal scroll — mirrors div.analyse__moves.areplay
              h('div.analyse__moves.areplay', {
                hook: {
                  insert: flushPendingActiveMoveScroll,
                  postpatch: (_oldVnode, vnode) => flushPendingActiveMoveScroll(vnode),
                },
              }, [
                renderMoveList(ctrl.root, ctrl.path, analysisMoveListGetEval, navigate, currentUserColor, reviewDotsUserOnly, deleteVariation, contextMenuPath, openContextMenu, (() => {
                  const moments = selectedGameId ? getMissedMoments(selectedGameId) : [];
                  return moments.length > 0 ? moments.reduce((a, b) => a.loss > b.loss ? a : b).path : undefined;
                })(), undefined, undefined, undefined, undefined, (() => {
                  const reviewEngine = analysisComplete && selectedGameId ? analyzedReviewEngine.get(selectedGameId) : undefined;


                  return { showComments: true, ...(reviewEngine ? { reviewEngine } : {}) };
                })(), getEvalCacheRevision()),
              ]),





              ...(shared
                ? [
                    renderAnalysisSplitHandle(),
                    h('div.analyse__middle-lower', lowerChildren),
                  ]
                : []),
              h('div.analyse__mobile-moves-context', renderAnalysisMobileContextChildren()),
            ]);
          })(),



          renderAnalysisPracticePanel(redraw),
          // Analysis-local action menu — overlays the tools column when opened.
          // position: absolute; inset: 0 on .action-menu ensures it covers all tool content.
          // Returns null when closed, so tools render normally.
          // Mirrors lichess-org/lila: ui/analyse/src/view/tools.ts ctrl.actionMenu() && actionMenu(ctrl)
          renderActionMenu(),
        ]),

        // Controls — below tools (grid-area: controls)
        // Mirrors lichess-org/lila: ui/analyse/src/view/main.ts div.analyse__controls
        // Controls — navigation only; engine toggle + settings moved to renderCeval() header
        // Mirrors lichess-org/lila: ui/analyse/src/view/main.ts div.analyse__controls (jump buttons)
        h('div.analyse__controls', {
          class: { 'analyse__controls--premove-queue': getPremoveQueueState().intents.length > 0 || getPremoveQueueStatus() !== null },
          hook: { insert: vnode => attachScrubListener(vnode.elm as HTMLElement) },
        }, [
          // Eval graph rendered as background behind controls on mobile.
          // bg:true strips interactivity — graph still tracks current move position.
          renderEvalGraph(
            ctrl.mainline,
            ctrl.path,
            evalCache,
            navigate,
            redraw,
            currentUserColor,
            reviewDotsUserOnly,
            true,
            analysisComplete && selectedGameId ? analyzedReviewEngine.get(selectedGameId) : undefined,
            getEvalCacheRevision(),
          ),
          h('div.analyse__mobile-controls-nav', [






            renderAnalysisNav(),
          ]),


          renderPracticeRail({ redraw, drillReadout: engineDrillReadoutVnode() }),



          h('div.analyse__desktop-controls-nav', [
            renderAnalysisNav(),
          ]),
          // Secondary info module — report cards, repertoire compliance, puzzle info.
          // Extra information below the nav; structurally independent of the primary module.
          h('div.analyse__secondary', renderAnalysisSecondaryChildren()),
        ]),

        // Underboard — below board (grid-area: under)
        // Import controls moved to header panel; game list appears here and in the header.
        h('div.analyse__underboard', [

          renderEvalGraph(
            ctrl.mainline,
            ctrl.path,
            evalCache,
            navigate,
            redraw,
            currentUserColor,
            reviewDotsUserOnly,
            false,
            analysisComplete && selectedGameId ? analyzedReviewEngine.get(selectedGameId) : undefined,
            getEvalCacheRevision(),
          ),


          renderAnalysisControls(
            [
              renderRetroEntry({
                retro:            ctrl.retro,
                choiceOpen:       retroChoiceOpen,
                analysisComplete,
                batchAnalyzing:    selectedGameReviewActive(),
                onToggle:         toggleRetro,
              }),




              (questionnaireEligible || questionnaireCompletedForCurrentGame)
                ? h('button.btn-study-tools', {
                    class: {
                      'btn-study-tools--active': questionnaireOpenForCurrentGame,
                      'btn-study-tools--done': questionnaireCompletedForCurrentGame && !questionnaireOpenForCurrentGame,
                    },
                    attrs: {
                      ...controlExplainerAttrs({
                        label: questionnaireOpenForCurrentGame
                          ? 'Close manual review'
                          : questionnaireCompletedForCurrentGame
                            ? 'Reopen manual review tools'
                            : 'Manual review',
                        description: questionnaireCompletedForCurrentGame
                          ? 'Reopen the completed Post Game Review Questions.'
                          : 'Study this game with the Post Game Review Questions.',
                      }),
                    },
                    on: { click: () => toggleQuestionnaireModule() },
                  }, [
                    questionnaireCompletedForCurrentGame
                      ? h('span.qnr-pulse.qnr-pulse--satisfied', '✓')
                      : h('span.qnr-pulse.qnr-pulse--unsatisfied'),
                    questionnaireOpenForCurrentGame ? ' Close' : ' Manual Review',
                  ])
                : null,




              questionnaireNeedsCategorization
                ? h('button.btn-study-tools', {
                    attrs: controlExplainerAttrs({ label: 'Not yet in your Study Library', description: 'Run the Post Game Review Questions before categorizing this game.' }),
                    on: { click: () => toggleQuestionnaireModule() },
                  }, [
                    h('span.qnr-pulse.qnr-pulse--unsatisfied'),
                    ' Not yet in your Study Library',
                  ])
                : null,
            ].filter((n): n is VNode => n !== null)
          ),
          // Post-game summary panel — collapsible, appears only after analysis completes.
          renderPostGameSummaryPanel(
            analysisComplete,
            evalCache,
            ctrl.mainline,
            importedGames.find(g => g.id === selectedGameId)?.white ?? 'White',
            importedGames.find(g => g.id === selectedGameId)?.black ?? 'Black',
            currentUserColor,
            navigate,
            redraw,
          ),
          gameLibraryHydrationError ? renderGamesLoadError() : renderGameList(deps),
        ]),

        renderKeyboardHelp(),
      ]);
    case 'games':
      // Storage-failure error state takes precedence over the loading skeleton and the empty
      // state so a failed hydration is never misread as an empty library (BUG-2026-07-10-007).
      if (gameLibraryHydrationError) return renderGamesLoadError();
      if (!gamesLibraryLoaded) {
        return h('div.games-view__loading', [
          h('div.skeleton-block'),
          h('div.skeleton-block'),
          h('div.skeleton-block'),
        ]);
      }
      return renderGamesView(deps);
    case 'puzzles':
      if (!gamesLibraryLoaded) {
        return h('div.puzzle-library.puzzle-library--loading', [
          h('div.skeleton-block'),
          h('div.skeleton-block'),
        ]);
      }
      return renderPuzzleLibrary(redraw);
    case 'puzzle-round': {
      const puzzleId = route.params.id ?? '';
      initPuzzleRoundShell(puzzleId);
      // openPuzzleRound is called from onChange, not here — calling it
      // in the render function causes an infinite redraw loop because
      // it calls redraw() internally which re-triggers this render.
      return renderPuzzleRound(redraw);
    }
    case 'opponents':
      if (!gamesLibraryLoaded) {
        return h('div.openings-page.openings-page--loading', [
          h('div.skeleton-block'),
          h('div.skeleton-block'),
        ]);
      }
      return renderOpeningsPage(redraw);
    case 'stats':
      if (!gamesLibraryLoaded) {
        return h('div.stats-page.stats-page--loading', [
          h('div.skeleton-block'),
          h('div.skeleton-block'),
          h('div.skeleton-block'),
        ]);
      }
      return renderStatsPage(redraw);
    case 'sync':
    case 'admin':    return renderAdminPage(redraw);
    case 'study':    return renderStudyLibrary(redraw);
    case 'study-detail': return renderStudyDetailShell(route.params['id'] ?? '', redraw, route.query ?? '');
    case 'editor': {
      if (!editorCtrl) {
        const params = new URLSearchParams(route.query ?? '');
        const fenParam = params.get('fen');
        const colorParam = params.get('color');
        // Built incrementally (rather than `fen: fenParam ?? undefined`) because
        // EditorConfig's optional fields disallow explicit `undefined` under
        // exactOptionalPropertyTypes — omitting the key is required, not equivalent.
        const config: EditorConfig = {
          onChange: fen => { replaceHashRoute(serializeEditorRoute(fen, editorCtrl!.bottomColor())); },
          onAnalysisBoard: openAnalysisBoardFromEditor,
        };
        if (fenParam) config.fen = fenParam;
        if (colorParam === 'black') config.orientation = 'black';
        editorCtrl = new EditorCtrl(config, redraw);
      }
      return renderEditor(editorCtrl);
    }
    default:         return h('h1', 'Home');
  }
}

/**
 * Returns a simple fallback VNode shown when a route render throws.
 * Must be simple enough that it cannot itself throw — no imports from the
 * failing route module, no conditional logic, no external state access.
 * The route name is included as a data attribute for debugging in DevTools
 * but is not displayed to the user.
 */
function renderErrorFallback(route: string): VNode {
  return h('div.route-render-fallback', { attrs: { 'data-route': route } }, [
    h('p.route-render-fallback__message',
      'Something went wrong on this page. Try navigating to another section.'
    ),
  ]);
}

function routeContent(route: Route): VNode {
  try {
    return renderRouteContent(route);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordDiagnostic({
      kind: 'render',
      severity: Severity.Error,
      route: route.name,
      source: 'main.routeContent',
      sourceTag: 'render.route',
      message: `Route render failed: ${message}`,
      metadata: {
        route: route.name,
        message,
        stack: error instanceof Error && error.stack ? error.stack : null,
      },
      redactionClass: {
        route: 'safe',
        message: 'truncate',
        stack: 'truncate',
      },
    });
    return renderErrorFallback(route.name);
  }
}

/**
 * Dev utility: wipe all IndexedDB stores and reset in-memory state to defaults.
 * Reloads the page so the app boots clean.
 */
async function resetAllData(): Promise<void> {
  await runClearLocalDataReset({
    confirmReset: () => confirm('Clear all local Chess Patzer data? This removes imported games, saved analysis, saved puzzle candidates, and local board/settings preferences from this browser.'),
    clearAppearancePreference: () => appearanceController.clearPreference(),
    clearRemainingLocalData: () => clearLocalDataForTokenLogout(),
    reload: () => window.location.reload(),
  });
}

// Opening Tree tools mobile submenu removed with the left tool rail (P2-TREE-2): the tree is the
// only Opening Tree tool now, so there is nothing left to pick from on mobile either.
function buildMobileSubmenus(_route: Route): HeaderMobileSubmenu[] {
  return [];
}

/**
 * Honest error state for the games surfaces when startup hydration REJECTED with a storage failure
 * (BUG-2026-07-10-007). Reuses the existing `.games-view__empty` / `.games-view__pill` affordances
 * (no new component/CSS) — this is the games list's previously-missing error state (UI States rule:
 * every tool must support loading/empty/error/ready). Kept a tiny orchestration-level render
 * helper, not a feature system. The `games-view__empty--error` marker distinguishes it from the
 * "No games imported yet" empty card for both users and the harness.
 */
function renderGamesLoadError(): VNode {
  return h('div.games-view', [
    h('div.games-view__empty.games-view__empty--error', [
      h('p', 'Couldn’t load your games — a storage error occurred.'),
      h('p.games-view__empty-hint', 'Your data is not lost. Reload to try again.'),
      h('button.games-view__pill', {
        attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Reload Games', description: 'Reload the page and retry game-library storage.' }) },
        on: { click: () => { window.location.reload(); } },
      }, 'Reload'),
    ]),
  ]);
}

function view(route: Route): VNode {
  return h('div#shell', [
    renderHeader({
      route,
      importedGames,
      accounts: registeredAccounts,
      mobileSubmenus: buildMobileSubmenus(route),
      navHrefOverrides: { opponents: opponentsEntryHref(openingsSessionUrlSnapshot()) },
      selectedGameId,
      analyzedGameIds,
      missedTacticGameIds,
      importCallbacks,
      onSyncGames: addSyncedGames,
      refreshAccounts: refreshRegisteredAccounts,
      onSelectGame: (id, pgn) => {
        flushPendingGamePersist();
        selectedGameId = id;
        loadGame(pgn);
      },
      renderGameRow: renderCompactGameRow,
      gameSourceUrl,
      downloadPgn,
      resetAllData,
      appearance: appearanceController,
      motion: interfaceMotionController,
      controlHelp: controlHelpController,
      advancedAppearance: advancedAppearanceController,
      renderGamesAppearanceSettings: () => renderGamesAppearanceSettings(redraw),
      renderNavigatorAppearanceSettings: () => renderNavigatorAppearanceSettings(redraw),
      resetAppearance: () => resetAppearanceAndHelpPreferences({
        appearance: appearanceController,
        motion: interfaceMotionController,
        help: controlHelpController,
      }),
      redraw,
    } satisfies HeaderDeps),
    h('main', [routeContent(route)]),
    renderContextMenu(),
    renderReviewErrorSubmitOverlay(),
    renderActiveLfymSaveFlowModal(),
    renderActiveGameSaveFlowModal(),
    puzzleCreateMsg ? h('div.puzzle-create-toast', puzzleCreateMsg) : null,
    h('footer.app-legal', [
      h('div.app-legal__notice', PLATFORM_DISCLAIMER),
      h('div.app-legal__links', [
        h('span', 'Chess Patzer source is available under AGPL.'),
        h('a', {
          attrs: {
            href: PUBLIC_SOURCE_URL,
            target: '_blank',
            rel: 'noopener noreferrer',
            ...controlExplainerAttrs({ label: 'Chess Patzer source code', description: 'Open the public source repository in a new tab.' }),
          },
        }, 'Source Code'),
        h('span.app-legal__sep', '•'),
        h('a', {
          attrs: {
            href: PUBLIC_LICENSE_URL,
            target: '_blank',
            rel: 'noopener noreferrer',
            ...controlExplainerAttrs({ label: 'Chess Patzer license', description: 'Open the public software license in a new tab.' }),
          },
        }, 'License'),
      ]),
    ]),
    renderPvBoard(),
  ]);
}

// Mousewheel navigation over the board — scroll down = next move, up = prev move.
// Adapted from lichess-org/lila: ui/lib/src/view/controls.ts stepwiseScroll
// Pixel-mode (trackpad) accumulates delta and requires ≥10px before stepping,
// preventing accidental triggers on inertia scrolls.
let wheelPixelAccum = 0;
let wheelLastStepAt = 0;
const WHEEL_THROTTLE_MS = 50;
document.addEventListener('wheel', (e: WheelEvent) => {
  if (!boardWheelNavEnabled) return;
  if (e.ctrlKey) return; // allow pinch-zoom
  const boardWrap = document.querySelector('.analyse__board.main-board');
  if (!boardWrap?.contains(e.target as Node)) return;
  e.preventDefault();
  if (e.deltaMode === 0) {
    // Pixel mode: accumulate until threshold to avoid over-triggering on trackpads
    wheelPixelAccum += e.deltaY;
    if (Math.abs(wheelPixelAccum) < 10) return;
  }
  const now = Date.now();
  if (now - wheelLastStepAt < WHEEL_THROTTLE_MS) { wheelPixelAccum = 0; return; }
  wheelLastStepAt = now;
  wheelPixelAccum = 0;
  if (e.deltaY > 0) next();
  else prev();
  redraw();
}, { passive: false });

// --- Bootstrap ---

const app = document.getElementById('app')!;
// Sitewide control explanations are declared by views and owned by one delegated controller.
// Bootstrap it once at the document shell; route patches and redraws require no re-initialization.
initControlExplainers(controlHelpController);
initBrowserTeachingHelp(controlHelpController, TEACHING_TIPS);
let currentRoute = current();
if (isOpponentsTreeRoute(currentRoute)) initOpeningsPage('loading');
// vnode starts as the container element; becomes a VNode after the first patch.
// Typed as the union that Snabbdom's patch() accepts as its first argument.
let vnode: Parameters<typeof patch>[0] = app;

function patchSafely(site: string, oldVnode: Parameters<typeof patch>[0], newVnode: VNode): Parameters<typeof patch>[0] {
  try {
    const committed = patch(oldVnode, newVnode);







    reconcilePracticeOwnerFromAnalysisState(currentRoute);
    return committed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordDiagnostic({
      kind: 'render',
      severity: Severity.Error,
      route: currentRoute.name,
      source: 'main.patch',
      sourceTag: 'render.patch',
      message: `Snabbdom patch failed at ${site}: ${message}`,
      metadata: {
        site,
        route: currentRoute.name,
        message,
        stack: error instanceof Error && error.stack ? error.stack : null,
      },
      redactionClass: {
        site: 'safe',
        route: 'safe',
        message: 'truncate',
        stack: 'truncate',
      },
    });
    // Patch-state preservation: after a caught exception Snabbdom's internal
    // vnode state may be inconsistent. Patching the fallback VNode against
    // oldVnode advances Snabbdom's diffing baseline to a valid, known-good
    // node so the *next* patch call diffs against the fallback rather than
    // the broken pre-failure vnode. Without this step, subsequent patch()
    // calls operate on stale DOM state and may throw secondary errors or
    // show corrupted UI on the next navigation.
    try {
      return patch(oldVnode, renderErrorFallback(currentRoute.name));
    } catch {
      // If even the fallback patch fails (e.g. DOM is severely corrupted),
      // return oldVnode as the last resort so the reference is never null.
      return oldVnode;
    }
  }
}

let _rafScheduled = false;
function redraw(): void {
  if (_rafScheduled) return;
  _rafScheduled = true;
  requestAnimationFrame(() => {
    _rafScheduled = false;
    currentRoute = current();
    vnode = patchSafely('redraw.raf', vnode, view(currentRoute));
    // Board patch above always runs first (P0 — Interaction Priority Principle); this check is
    // a no-op JSON comparison unless the tree's move/annotation content actually changed.
    scheduleUserTreeSave();
  });
}

/** Synchronous redraw for cases that need the DOM updated immediately. */
function redrawSync(): void {
  _rafScheduled = false;
  currentRoute = current();
  vnode = patchSafely('redraw.sync', vnode, view(currentRoute));
  scheduleUserTreeSave();
}

// Clears IDB analysis and removes game from in-memory tracking sets.
// Injected into initPgnExport so the re-analyze flow can fully reset a game.
function clearGameAnalysis(gameId: string): void {
  void clearAnalysisFromIdb(gameId);
  analyzedGameIds.delete(gameId);
  missedTacticGameIds.delete(gameId);
  analyzedReviewEngine.delete(gameId);
  analyzedGameAccuracy.delete(gameId);
  clearReviewedStatus(gameId);
  clearMissedMoments(gameId);
}

function dataManagementChangedStores(detail: DataManagementLocalChangeDetail): string[] {
  const stores = new Set<string>();
  if (detail.domains.includes('games')) {
    stores.add('games');
    stores.add('analysis');
    stores.add('game-summaries');
    stores.add('retro-results');
    stores.add('puzzle-definitions');
    stores.add('puzzle-attempts');
    stores.add('puzzle-user-meta');
    stores.add('saved-review-puzzles');
  } else if (detail.domains.includes('review')) {
    stores.add('analysis');
    stores.add('game-summaries');
    stores.add('retro-results');
  }
  return [...stores];
}

function scopedDataManagementGameIds(detail: DataManagementLocalChangeDetail): string[] {
  if (detail.scope.allGames || detail.scope.allReview) return importedGames.map(game => game.id);
  return [...(detail.scope.gameIds ?? [])];
}

function clearReviewRuntimeForGame(gameId: string): void {
  analyzedGameIds.delete(gameId);
  missedTacticGameIds.delete(gameId);
  analyzedReviewEngine.delete(gameId);
  analyzedGameAccuracy.delete(gameId);
  clearReviewedStatus(gameId);
  clearMissedMoments(gameId);
}

function clearSelectedReviewRuntimeForDataManagement(detail: DataManagementLocalChangeDetail): void {
  for (const gameId of scopedDataManagementGameIds(detail)) clearReviewRuntimeForGame(gameId);
  if (!dataManagementScopeMatchesGameId(detail.scope, selectedGameId)) return;

  clearEvalCache();
  resetCurrentEval();
  clearPuzzleCandidates();
  resetReviewStatusRuntime();
  delete ctrl.retro;
  delete ctrl.retroChoice;
  delete ctrl.retroActiveSelection;
  lastRetroOutcomes = null;
  syncArrow();
  redraw();
}

function recordDataManagementRuntimeReset(
  detail: DataManagementLocalChangeDetail,
  status: 'success' | 'error',
  metadata: Record<string, unknown> = {},
): void {
  recordDiagnostic({
    kind: 'sync',
    severity: status === 'success' ? Severity.Info : Severity.Warn,
    source: 'main.dataManagementRuntime',
    sourceTag: 'sync',
    message: 'data-management-runtime-reset',
    metadata: {
      actionId: detail.actionId,
      kind: detail.kind,
      status,
      ...metadata,
    },
    redactionClass: 'safe',
  });
}

async function handlePuzzleDataManagementChange(detail: DataManagementLocalChangeDetail): Promise<void> {
  try {
    if (detail.kind === 'puzzles.deleteGenerated') {
      const result = await resetGeneratedPuzzleRuntimeForDataManagement(redraw);
      recordDataManagementRuntimeReset(detail, 'success', { ...result });
      return;
    }
    if (detail.kind === 'puzzles.resetProgress') {
      const result = await resetPuzzleProgressRuntimeForDataManagement(redraw);
      recordDataManagementRuntimeReset(detail, 'success', { ...result });
      return;
    }
    if (detail.kind === 'puzzles.clearPgnCache') {
      const result = resetPuzzlePgnCacheRuntimeForDataManagement();
      recordDataManagementRuntimeReset(detail, 'success', { ...result });
      redraw();
    }
  } catch (error) {
    recordDataManagementRuntimeReset(detail, 'error', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function handleSettingsDataManagementChange(detail: DataManagementLocalChangeDetail): void {
  const groupId = detail.scope.settingsGroupId;
  try {
    switch (groupId) {
      case 'board':
        resetBoardSettingsRuntimeForDataManagement();
        syncBoardAndArrow();
        break;
      case 'engine-review':
        resetEngineSettingsRuntimeForDataManagement();
        resetReviewSettingsRuntimeForDataManagement();
        resetAnalysisViewSettingsRuntimeForDataManagement();
        break;
      case 'import-games':
        resetGamesAccountFilterRuntimeForDataManagement();
        break;
      case 'detection':
        resetMissedMomentConfigRuntimeForDataManagement();
        resetRetroConfigRuntimeForDataManagement();
        break;
      case 'puzzle-ui':
        void resetPuzzleProgressRuntimeForDataManagement(redraw).then(result => {
          recordDataManagementRuntimeReset(detail, 'success', { settingsGroupId: groupId, ...result });
        });
        return;
      case 'opening-explorer':
        explorerCtrl.resetRuntimeForDataManagement();
        break;
      default:
        recordDataManagementRuntimeReset(detail, 'error', { settingsGroupId: groupId ?? null, error: 'unknown-settings-group' });
        return;
    }
    recordDataManagementRuntimeReset(detail, 'success', { settingsGroupId: groupId ?? null });
    redraw();
  } catch (error) {
    recordDataManagementRuntimeReset(detail, 'error', {
      settingsGroupId: groupId ?? null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

window.addEventListener(REMOTE_SYNC_ANALYSIS_CHANGED_EVENT, () => {
  void hydrateReviewedStateFromIdb();
});

window.addEventListener(REMOTE_SYNC_APPLIED_EVENT, event => {
  void rehydrateRuntimeAfterRemoteSyncPull(event);
});

window.addEventListener(REVIEW_DEPTH_CHANGED_EVENT, event => {
  const detail = (event as CustomEvent<{ reviewDepth?: number }>).detail;
  applyReviewDepthToActiveQueue(detail?.reviewDepth ?? reviewDepth);
  void hydrateReviewedStateFromIdb();
});

window.addEventListener(DATA_MANAGEMENT_LOCAL_CHANGE_EVENT, event => {
  const detail = (event as CustomEvent<DataManagementLocalChangeDetail>).detail;
  if (!detail) return;
  if (detail.domains.includes('games')) {
    void rehydrateRuntimeAfterRemoteSyncPull(new CustomEvent(DATA_MANAGEMENT_LOCAL_CHANGE_EVENT, {
      detail: { stores: dataManagementChangedStores(detail) },
    }));
    return;
  }
  if (detail.domains.includes('review')) {
    clearSelectedReviewRuntimeForDataManagement(detail);
    void hydrateReviewedStateFromIdb();
  }
  if (detail.domains.includes('puzzles') || detail.domains.includes('pgn-cache')) {
    void handlePuzzleDataManagementChange(detail);
  }
  if (detail.domains.includes('settings')) {
    handleSettingsDataManagementChange(detail);
  }
});















window.addEventListener('pagehide', () => {
  flushPendingGamePersist({ isUnload: true });
  void flushStudyDetailPersistence().catch(() => {});
});

window.addEventListener('beforeunload', () => {
  flushPendingGamePersist({ isUnload: true });
  void flushStudyDetailPersistence().catch(() => {});
});

function landOpponentsLibraryAfterRouteRecovery(message: string): void {
  setRouteRecoveryMessage(message);
  skipNextSavedSessionResume();
  initOpeningsPage('library');
  invalidateCollections();
  redraw();
}

let opponentsTreeHydrationRun = 0;
let releaseOpponentsTreeRouteNotificationSuppression: (() => void) | null = null;
// Save-flow ownership cannot read currentRoute as its "previous" route: redraw() may already have
// refreshed that shared value from location before an asynchronous hashchange handler runs. It also
// cannot rely on hashchange alone because Opening Tree session navigation persists through
// history.replace. Keep one cursor updated by both transition seams.
let previousRouteForSaveFlowOwner: Route = currentRoute;
// Opening Tree's implicit/default route values may be resolved through mutable controller state.
// Preserve the identity as it existed when the cursor advanced; never re-resolve the previous route
// after a color/orientation control has already mutated that state.
let previousOpeningTreeSaveFlowIdentity: string | null = null;

function releaseOpponentsTreeRouteSuppression(release?: () => void): void {
  if (release && releaseOpponentsTreeRouteNotificationSuppression !== release) {
    release();
    return;
  }
  releaseOpponentsTreeRouteNotificationSuppression?.();
  releaseOpponentsTreeRouteNotificationSuppression = null;
}

function setCurrentRouteFromOpeningsSnapshot(route: Route): void {
  currentRoute = route;
  previousRouteForSaveFlowOwner = route;
}

const opponentsUrlSnapshotScheduler = createOpponentsUrlSnapshotScheduler({
  getCurrentRoute: () => currentRoute,
  replaceHashRoute,
  setCurrentRoute: setCurrentRouteFromOpeningsSnapshot,
});

const handleOpeningsSessionStateChange = (
  snapshot: Parameters<OpeningsSessionStateChangeHandler>[0],
  persistImmediately = false,
): void => {
  // Opening Tree move/keyboard/orientation changes notify synchronously, then persist the URL via a
  // debounced history.replace (which emits no hashchange). Reset against the emitted canonical
  // snapshot now, before the view redraw can leave a modal bound to the previous path/collection,
  // and advance the same cursor the later hashchange seam consumes. The scheduler's setCurrentRoute
  // callback above aligns it once more with the exact route history.replace ultimately writes.
  const snapshotRoute = parseRoute(opponentsEntryHref(snapshot));
  const snapshotIdentity = snapshot
    ? openingTreeSaveFlowIdentityFromState(snapshot, snapshot.color)
    : null;
  if (openingTreeSaveFlowOwnerChangedFromIdentities(
    previousRouteForSaveFlowOwner,
    previousOpeningTreeSaveFlowIdentity,
    snapshotRoute,
    snapshotIdentity,
  )) {
    resetOpeningsSaveFlow();
  }
  previousRouteForSaveFlowOwner = snapshotRoute;
  previousOpeningTreeSaveFlowIdentity = snapshotIdentity;
  if (snapshot && currentRoute.name === 'opponents' && !isOpponentsTreeRoute(currentRoute)) {
    // Entering the dedicated tree surface is meaningful browser navigation: preserve the library
    // entry for Back, then let the real hashchange owner advance currentRoute and reuse the active
    // matching session through hydrateOpponentsTreeRoute's fast path. Do not pre-advance
    // currentRoute here — that would make the replace-only scheduler claim the destination before
    // the push transition actually exists.
    opponentsUrlSnapshotScheduler.clear();
    writeHashRoute(opponentsEntryHref(snapshot));
    return;
  }
  if (persistImmediately) {
    opponentsUrlSnapshotScheduler.clear();
    setCurrentRouteFromOpeningsSnapshot(replaceHashRoute(opponentsEntryHref(snapshot)).route);
    return;
  }
  opponentsUrlSnapshotScheduler.schedule(snapshot);
};

setOpeningsSessionStateChangeHandler(handleOpeningsSessionStateChange);















setOpeningsAnalysisModeEntryHandler(pgn => {
  openAnalysisBoardFromEditor(pgn);
  last();
  if (!engineEnabled) toggleEngine();
});

async function hydrateOpponentsTreeRoute(route: Route): Promise<void> {
  const run = ++opponentsTreeHydrationRun;


  invalidateOpeningsSourceRefresh();
  setRouteRecoveryMessage(null);

  const parsed = parseOpponentsTreeUrlState(route.query ?? '');
  const invalidNonLineParams = parsed.invalidParams.filter(p => p.field !== 'line');
  const invalidLineParam = parsed.invalidParams.find(p => p.field === 'line');
  if (invalidNonLineParams.length > 0) {
    landOpponentsLibraryAfterRouteRecovery(
      `Could not restore that opening tree because the URL has invalid parameters: ${describeOpponentsInvalidParams(invalidNonLineParams)}.`,
    );
    return;
  }

  const routeMessages: string[] = [];
  if (invalidLineParam) {
    routeMessages.push(`The URL line "${invalidLineParam.value}" is invalid, so the tree was restored at the root.`);
  }
  const routeState = {
    ...parsed.state,
    color: resolveOpeningsRouteStateColor(parsed.state, parsed.colorExplicit),
  };

  releaseOpponentsTreeRouteSuppression();
  const releaseActiveRestoreSuppression = beginOpeningsSessionStateNotificationSuppression();
  const activeRestoreResult = restoreActiveOpeningsSessionFromUrlState(routeState);
  if (activeRestoreResult) {
    if (activeRestoreResult.status === 'partial') {
      routeMessages.push(
        `The URL line was not available in the filtered tree, so the nearest valid position was restored after ${activeRestoreResult.applied.length} move${activeRestoreResult.applied.length === 1 ? '' : 's'}.`,
      );
    } else if (activeRestoreResult.status === 'root' && activeRestoreResult.requested.length > 0) {
      routeMessages.push('The URL line was not available in the filtered tree, so the tree was restored at the root.');
    }
    setRouteRecoveryMessage(routeMessages[0] ?? null);
    releaseOpponentsTreeRouteSuppression(releaseActiveRestoreSuppression);
    redraw();
    return;
  }
  releaseOpponentsTreeRouteSuppression(releaseActiveRestoreSuppression);

  initOpeningsPage('loading');
  redraw();

  // BUG-2026-07-10-007 slice 2: resolveOpponentsRouteTarget → loadGamesByAccountFromIdb now REJECTS
  // on a storage failure instead of masking it as an empty account. The route callers are bare
  // `void hydrateOpponentsTreeRoute(...)`, so an uncaught reject would be an unhandled rejection AND
  // strand the page on the 'loading' state set just above. Catch it here and land an honest recovery
  // message — deliberately NOT re-mapped onto the 'account-no-games' status, which would re-mask the
  // failure as "account has no games" (the exact defect this case fixes).
  const targetResult = await resolveOpponentsRouteTarget(routeState).catch((err: unknown) => {
    console.warn('[opponents] route target load failed', err);
    return null;
  });
  if (run !== opponentsTreeHydrationRun || !isOpponentsTreeRoute(currentRoute)) return;

  if (targetResult === null) {
    landOpponentsLibraryAfterRouteRecovery(
      'Could not restore that opening tree because a storage error occurred while loading the account’s games. Your data is not lost — reload to try again.',
    );
    return;
  }

  if (targetResult.status !== 'saved-collection' && targetResult.status !== 'account-games') {
    landOpponentsLibraryAfterRouteRecovery(opponentsRouteTargetRecoveryMessage(targetResult));
    return;
  }

  const releaseRouteHydrationSuppression = beginOpeningsSessionStateNotificationSuppression();
  releaseOpponentsTreeRouteNotificationSuppression = releaseRouteHydrationSuppression;

  presetColorFilter(routeState.color);
  presetSpeedFilter(new Set(routeState.speeds));
  presetSessionDateRange(routeState.range);
  openCollection(targetResult.collection, redraw, {
    color: routeState.color,
    initialPath: routeState.line,
    onInitialPathResolved: result => {
      if (run !== opponentsTreeHydrationRun || !isOpponentsTreeRoute(currentRoute)) {
        releaseOpponentsTreeRouteSuppression(releaseRouteHydrationSuppression);
        return;
      }
      if (result.status === 'partial') {
        routeMessages.push(
          `The URL line was not available in the filtered tree, so the nearest valid position was restored after ${result.applied.length} move${result.applied.length === 1 ? '' : 's'}.`,
        );
      } else if (result.status === 'root' && result.requested.length > 0) {
        routeMessages.push('The URL line was not available in the filtered tree, so the tree was restored at the root.');
      }
      setRouteRecoveryMessage(routeMessages[0] ?? null);
      setBoardOrientation(routeState.orientation);
      setActiveTool(routeState.tool);
      syncOpeningsBoard(redraw);
      releaseOpponentsTreeRouteSuppression(releaseRouteHydrationSuppression);
      handleOpeningsSessionStateChange(openingsSessionUrlSnapshot(), true);
      redraw();
    },
  });
  setBoardOrientation(routeState.orientation);
  setActiveTool(routeState.tool);
}









function mountAnalysisWorkspace(): void {
  mountWorkspace({
    id: 'analysis',
    boardInputMode: 'free-analysis',
    getCursor: () => ({
      root: ctrl.root,
      path: ctrl.path,
      node: ctrl.node,
      nodeList: ctrl.nodeList,
      mainline: ctrl.mainline,
    }),
    getOrientation: () => orientation,
    redraw,
    // D-core-22a: Analysis's own add-and-navigate commit, now routed through the shared
    // handleUserMove seam instead of being hardcoded in board/index.ts's applyMoveToTree.
    handleUserMove: (parentPath, node) => {
      addNode(ctrl.root, parentPath, node);
      navigate(parentPath + node.id);
    },
  });
}






function analysisPracticeHostActive(): boolean {
  return activeWorkspace()?.instanceId.startsWith('analysis-') ?? false;
}




function analysisRouteSelectedGameIdentity(route: Route): string | null {
  if (route.name !== 'analysis-game') return null;
  const id = route.params['id'] ?? '';
  if (id.startsWith('research:')) return id;
  return parseImportedGameRouteId(id);
}










let analysisBulkReviewRunningMirror = false;







function analysisRouteExactHostReady(route: Route): boolean {
  if (route.name !== 'analysis-game') return false;
  if (analysisBulkReviewRunningMirror) return false;
  const identity = analysisRouteSelectedGameIdentity(route);
  if (identity === null || identity !== selectedGameId) return false;
  return analysisPracticeHostActive();
}













function reconcilePracticeOwnerFromAnalysisState(route: Route): void {
  if (route.name === 'study-detail') return;
  reconcileRouteDestination(route, analysisRouteExactHostReady(route));
}

// board/index.ts's `orientation` (src/board/index.ts:121-122) is a SINGLE shared module value —
// physical orientation-per-mounted-instance is deferred to D-core-03b (not yet built; see the
// design doc's D-core-03 reconciliation). Study now also drives that shared value via
// setOrientation() while it is mounted (src/study/studyDetailCtrl.ts setStudyDetailOrientation),
// so Analysis's own orientation must be snapshotted before leaving the analysis surface and
// restored when re-entering it, or a Study excursion would silently leave Analysis's board
// flipped. Initialized from the live value so the very first transition has a sane default.
let analysisOrientationBeforeExcursion: 'white' | 'black' = orientation;

// Wire all modules before the first render so that view() never calls an
// uninitialised module (which would throw when refreshing on a non-root route).
//
// CCW-H03a-3: initGround supplies the ANALYSIS-ONLY fallback closures. The board lifecycle now
// owns mode-aware config + dispatch: Study resolves its own reads/writes through its explicit
// shared-tree board-input module, and any module-owned surface never reaches this shared-tree
// resolver at all. Mount validation (workspaceCore.mountWorkspace) plus board/index.ts's guarded
// move-target resolver guarantee only Analysis/free-analysis (or a pre-mount bootstrap) uses these
// closures, so there is no silent per-mode branching to maintain here anymore.
initGround({
  getCtrl: () => ctrl,
  navigate,
  getImportedGames: () => importedGames,
  getSelectedGameId: () => selectedGameId,
  redraw,
});
mountAnalysisWorkspace();
// Retro solve interception: analysis-owned handler subscribes to board move hooks.
// Must be wired after initGround so the board hook seam is available.
initRetroMoveHandler(() => ctrl);
initCevalView({
  getCtrl:  () => ctrl,
  navigate,
  redraw,
});
initPgnExport({
  getCtrl:           () => ctrl,
  getImportedGames:  () => importedGames,
  getSelectedGameId: () => selectedGameId,
  clearGameAnalysis,
  redraw,


  requestBoardTreeAnalysis: () => boardReview.request(),
  getActiveBoardReviewId:   () => boardReview.getActiveId(),
  cancelBoardTreeReview:    () => boardReview.cancelFromControl(),
});



initPersist({
  getImportedGames:  () => importedGames,
  getSelectedGameId: () => selectedGameId,
  onPersisted: (gameId, pgn) => applyEnrichmentPatch(gameId, { pgn }),
});
initAnalysisControls({
  getCtrl:          () => ctrl,
  prev,
  next,
  first,
  last,
  navigate,
  redraw,
  onFlipBoard:      flip,
  onNewBoard:       requestNewAnalysisBoard,
  onToggleRetro:    toggleRetro,

  getOrientation:   () => orientation,

  onTogglePractice: togglePracticeSession,
  getRetroConfigCountSummary,


  onSaveToLibrary: () => {
    openGameSaveFlow('menu');
  },

  getSelectedGameForCompare: () => {
    const game = importedGames.find(g => g.id === selectedGameId);
    return game ? { gameId: game.id, pgn: game.pgn } : null;
  },


  hasCompletedReviewForSelectedGame: () => Boolean(
    selectedGameId && analysisComplete && analyzedGameIds.has(selectedGameId),
  ),



  onToggleQuestionnaire: toggleQuestionnaireModule,
});






initAnalysisPracticeSlot({
  getCursor: () => ({
    root: ctrl.root,
    path: ctrl.path,
    node: ctrl.node,
    nodeList: ctrl.nodeList,
    mainline: ctrl.mainline,
  }),
  getOrientation: () => orientation,
  redraw,
  navigate,
  handleUserMove: (parentPath, node) => {
    addNode(ctrl.root, parentPath, node);
    navigate(parentPath + node.id);
  },
  remountFreeAnalysis: mountAnalysisWorkspace,
});



initPracticeRouteState({
  activateAnalysisPracticeSlot,
  deactivateAnalysisPracticeSlot,
});
bootstrapPracticeRouteState(currentRoute);
initEngine({
  getCtrl:       () => ctrl,
  getCgInstance: () => cgInstance,
  redraw,
});


initPractice({
  getRoot:     () => ctrl.root,
  getPath:     () => ctrl.path,
  bottomColor: () => orientation,
  navigate,
  // Engine replies and "Best was X" playback are move applications, not browsing.
  playUciMove: (uci: string) => {
    practiceMoveNavigation = true;
    try { playUciMove(uci); } finally { practiceMoveNavigation = false; }
  },
  getEval: path => evalCache.get(path),
  redraw,
  onShapesChanged: () => syncArrowForced(),
});
initEngineDrillHost({
  getCurrentFen: () => ctrl.node.fen,
  getCurrentPath: () => ctrl.path,
  navigate,
  playUciMove: (uci: string) => playUciMove(uci),
  getEvalForCurrent: () => evalCache.get(ctrl.path),


  openPgnOnBoard: (pgn: string) => openAnalysisBoardFromEditor(pgn),
  redraw,
  now: () => Date.now(),
});
const analysisPracticePremoveHost = createAnalysisPracticePremoveHost({
  getFen: () => ctrl.node.fen,
  getPath: () => ctrl.path,
  getHumanColor: () => orientation,
  isActive: () => practiceActive(),
  isComputerTurn: () => practiceActive() && (ctrl.node.fen.includes(' w ') ? 'white' : 'black') !== orientation,
  applyLegalUserMove: move => {
    practiceMoveNavigation = true;
    try {
      applyLegalBoardUserMove(move.intent.orig, move.intent.dest, move.intent.promotion);
    } finally {
      practiceMoveNavigation = false;
    }
  },
  syncShapes: () => syncArrowForced(),
  redraw,
});
setPlayVsComputerPremoveHost(analysisPracticePremoveHost);
setExtraAutoShapesProvider(practiceShapes);



setExtraArrowSuppressProvider(() => practiceActive() && !isRetroVisibleEngineEnabled());
// User moves: flag the resulting navigation as move application and set the session
// running before onJump processes it (lila ctrl.userMove ordering).
onBeforeBoardUserMove(() => {




  if (engineDrillActive()) {
    drillFenBeforeUserMove = ctrl.node.fen;


    drillEvalBeforeUserMove = scoringEvalOf(evalCache.get(ctrl.path));
  }
  if (!practiceActive()) return;
  practiceOnUserMove();
  practiceMoveNavigation = true;
});
onBoardUserMove(() => {
  practiceMoveNavigation = false;
  if (drillFenBeforeUserMove !== null) {
    const fenBefore = drillFenBeforeUserMove;
    drillFenBeforeUserMove = null;
    const node = ctrl.node;
    const evalBefore = drillEvalBeforeUserMove;
    drillEvalBeforeUserMove = null;
    if (engineDrillActive() && node.uci !== undefined && node.fen !== fenBefore) {
      engineDrillOnUserMove({
        fenBefore,
        fenAfter: node.fen,
        uci: node.uci,
        ...(node.san !== undefined ? { san: node.san } : {}),
        ...(evalBefore !== null && (evalBefore.cp !== undefined || evalBefore.mate !== undefined)
          ? { evalBefore: {
              ...(evalBefore.cp !== undefined ? { cp: evalBefore.cp } : {}),
              ...(evalBefore.mate !== undefined ? { mate: evalBefore.mate } : {}),
              ...(evalBefore.depth !== undefined ? { depth: evalBefore.depth } : {}),
            } }
          : {}),
      });
      redraw();
    }
  }
});
setRepertoireArrowShapeProvider(() => {
  if (!explorerCtrl.enabled || explorerCtrl.config.db !== 'repertoire') return [];
  if (isRapid()) return [];
  if (!repertoireSourcesLoaded() || repertoireSourcesError()) return [];
  return buildRepertoireArrowShapes(repertoireSources(), ctrl.node.fen);
});
// When live eval produces a deeper result than what's cached, debounce an IDB save
// so the improved evaluation persists across page reloads.
let _liveEvalSaveTimer: ReturnType<typeof setTimeout> | null = null;
const LIVE_EVAL_SAVE_DELAY_MS = 3000;
setOnLiveEvalImproved(() => {
  if (_liveEvalSaveTimer) clearTimeout(_liveEvalSaveTimer);
  _liveEvalSaveTimer = setTimeout(() => {
    _liveEvalSaveTimer = null;
    const gameId = selectedGameId;
    if (!gameId) return;
    const nodes = buildAnalysisNodes(ctrl.mainline, p => evalCache.get(p));











    const stampDepth = analyzedReviewEngine.get(gameId)?.reviewDepth ?? reviewDepth;
    void saveAnalysisToIdb('complete', gameId, nodes, stampDepth);
    // Keep the cached games-list accuracy summary consistent with the deepened evals.
    const summary = computeAnalysisSummary(ctrl.mainline, evalCache);
    if (summary) {
      const accuracy = { white: summary.white.accuracy, black: summary.black.accuracy };
      analyzedGameAccuracy.set(gameId, accuracy);
      const existing = reviewedStatusIndex.get(gameId);
      if (existing) {
        setReviewedStatus(gameId, {
          analysisUpdatedAt: existing.analysisUpdatedAt,
          ...(existing.reviewEngine !== undefined ? { reviewEngine: existing.reviewEngine } : {}),
          accuracy,
          ...(existing.missedMomentCount !== undefined ? { missedMomentCount: existing.missedMomentCount } : {}),
        });
      }
    }
  }, LIVE_EVAL_SAVE_DELAY_MS);
});

registerDataManagementBeforeDeleteFence(async detail => {
  if (!detail.domains.includes('review') && !detail.domains.includes('games')) return undefined;
  if (dataManagementScopeMatchesGameId(detail.scope, selectedGameId) && _liveEvalSaveTimer) {
    clearTimeout(_liveEvalSaveTimer);
    _liveEvalSaveTimer = null;
  }
  return fenceReviewQueueForDataManagement(detail);
});

// Feed live engine updates into the active retro session.
// Info-line updates arrive before the final bestmove cache write. Use them to
// populate the LFYM played-move snapshot immediately so the response boxes can
// show values during exact-win and in-progress live-search cases.
setOnLiveEvalInfo((path, ev) => {
  // Practice verdict/hint gate rides the same live-eval ticks (lila practice.onCeval).
  practiceOnCeval();
  engineDrillOnCeval();
  const cand = ctrl.retro?.current();
  if (!cand) return;
  const snap = ctrl.retro!.getSolvingMoveSnapshot();
  if (!snap) return;

  if (
    path.length === cand.parentPath.length + 2
    && path.startsWith(cand.parentPath)
    && (ev.cp !== undefined || ev.mate !== undefined)
  ) {
    ctrl.retro!.setSolvingMoveSnapshot({ ...snap, solvingMoveCp: ev.cp, solvingMoveMate: ev.mate });
  }
});






setOnLiveEvalUpdated((path, ev) => {
  // Practice verdict/hint gate rides the same live-eval ticks (lila practice.onCeval).
  practiceOnCeval();
  engineDrillOnCeval();
  const cand = ctrl.retro?.current();
  if (!cand) return;

  if (path === cand.parentPath) {

    if (ev.best && ev.depth !== undefined) {
      ctrl.retro!.onEngineUpdate(ev.best, {
        ...(ev.cp !== undefined ? { cp: ev.cp } : {}),
        ...(ev.mate !== undefined ? { mate: ev.mate } : {}),
        depth: ev.depth,
      });
      if (ctrl.retro!.isVindicated()) redraw();
    }




    const snap = ctrl.retro!.getSolvingMoveSnapshot();
    if (snap && snap.solvingMoveUci !== snap.engineBestUci) {
      ctrl.retro!.setSolvingMoveSnapshot({ ...snap, engineBestCp: ev.cp, engineBestMate: ev.mate });
      redraw();
    }
    return;
  }




  if (path.length === cand.parentPath.length + 2 && path.startsWith(cand.parentPath)) {
    const snap = ctrl.retro!.getSolvingMoveSnapshot();
    if (snap) {
      ctrl.retro!.setSolvingMoveSnapshot({ ...snap, solvingMoveCp: ev.cp, solvingMoveMate: ev.mate });
      redraw();
    }
  }
});

initReviewQueue({
  analyzedGameIds,
  missedTacticGameIds,
  analyzedGameAccuracy,
  getUserColor,
  redraw,
  setReviewEngineMetadata: (gameId, metadata) => {
    analyzedReviewEngine.set(gameId, metadata);
    redraw();
  },
});




analysisBulkReviewRunningMirror = isBulkRunning();
subscribeReviewQueueState(() => {
  analysisBulkReviewRunningMirror = isBulkRunning();
});
subscribeAcceptedReviewResults(hydrateOpenDisplayFromAcceptedReviewResult);

subscribeBoardTreeReviewCompletion(evt => boardReview.onCompletion(evt));
preloadBoardSounds();

bindKeyboardHandlers({
  getCtrl:     () => ctrl,
  navigate,
  next,
  prev,
  first,
  last,
  flip,
  completeMove,
  redraw,
});








let previousRouteForSurfaceBump: Route | null = null;






let previousRouteForPracticeLifecycle: Route = currentRoute;

/**
 * Canonical game identity owned by an Analysis route, excluding navigation state.
 *
 * Imported ids are normalized through the same parser used by route hydration. Research routes
 * pack collection, game, and ply into one segment; their owner is the decoded collection+game
 * pair, deliberately excluding ply so moving within one research game does not discard a modal.
 * Tagged JSON keeps imported ids disjoint from research tuples without inventing a board-derived
 * fallback for malformed or generic Analysis routes.
 */
function analysisSaveFlowGameIdentity(route: Route): string | null {
  if (route.name !== 'analysis-game') return null;
  const rawRouteId = route.params['id'] ?? '';
  const importedGameId = parseImportedGameRouteId(rawRouteId);
  if (importedGameId !== null) return `imported:${JSON.stringify(importedGameId)}`;
  const researchGame = parsePackedResearchAnalysisRouteId(rawRouteId);
  return researchGame === null
    ? null
    : `research:${JSON.stringify([researchGame.collectionId, researchGame.gameId])}`;
}

function analysisGameSaveFlowOwnerChanged(previousRoute: Route, destinationRoute: Route): boolean {
  const previousIsAnalysis = previousRoute.name === 'analysis' || previousRoute.name === 'analysis-game';
  const destinationIsAnalysis = destinationRoute.name === 'analysis' || destinationRoute.name === 'analysis-game';
  if (previousIsAnalysis && !destinationIsAnalysis) return true;
  return analysisSaveFlowGameIdentity(previousRoute) !== analysisSaveFlowGameIdentity(destinationRoute);
}

/** Canonical puzzle id owned by a round route, using the exact validator used by route hydration. */
function puzzleRoundSaveFlowIdentity(route: Route): string | null {
  if (route.name !== 'puzzle-round') return null;
  const validation = validatePuzzleRoundRouteId(route.params['id'] ?? '');
  return validation.valid ? validation.id : null;
}

function puzzleRoundSaveFlowOwnerChanged(previousRoute: Route, destinationRoute: Route): boolean {
  const previousOwnsPuzzleFlow = previousRoute.name === 'puzzle-round';
  const destinationOwnsPuzzleFlow = destinationRoute.name === 'puzzle-round';
  if (previousOwnsPuzzleFlow && !destinationOwnsPuzzleFlow) return true;
  return previousOwnsPuzzleFlow
    && destinationOwnsPuzzleFlow
    && puzzleRoundSaveFlowIdentity(previousRoute) !== puzzleRoundSaveFlowIdentity(destinationRoute);
}

/**
 * Exact save target owned by an Opening Tree route.
 *
 * The modal captures the resolved collection, filtered line, and board orientation. Build the
 * identity from the same URL parser and target-color resolver used by hydration, so query order,
 * case-normalized values, duplicate speeds, unknown parameters, and tool-only changes do not
 * over-clear. Invalid routes cannot own a stable save target and therefore compare as null.
 */
function openingTreeSaveFlowIdentityFromState(
  state: OpponentsTreeUrlState,
  resolvedColor: OpponentsTreeUrlState['color'],
): string {
  const target = state.target ? [state.target.kind, state.target.id] : null;
  return JSON.stringify({
    target,
    color: resolvedColor,
    speeds: state.speeds,
    range: state.range,
    orientation: state.orientation,
    line: state.line,
  });
}

function openingTreeSaveFlowIdentity(route: Route): string | null {
  if (!isOpponentsTreeRoute(route)) return null;
  const parsed = parseOpponentsTreeUrlState(route.query ?? '');
  if (parsed.invalidParams.length > 0) return null;
  return openingTreeSaveFlowIdentityFromState(
    parsed.state,
    resolveOpeningsRouteStateColor(parsed.state, parsed.colorExplicit),
  );
}

function openingTreeSaveFlowOwnerChangedFromIdentities(
  previousRoute: Route,
  previousIdentity: string | null,
  destinationRoute: Route,
  destinationIdentity: string | null,
): boolean {
  const previousOwnsOpeningTreeFlow = isOpponentsTreeRoute(previousRoute);
  const destinationOwnsOpeningTreeFlow = isOpponentsTreeRoute(destinationRoute);
  if (previousOwnsOpeningTreeFlow && !destinationOwnsOpeningTreeFlow) return true;
  return previousOwnsOpeningTreeFlow
    && destinationOwnsOpeningTreeFlow
    && previousIdentity !== destinationIdentity;
}

previousOpeningTreeSaveFlowIdentity = openingTreeSaveFlowIdentity(currentRoute);

onChange(route => {




  const previousSaveFlowOwnerRoute = previousRouteForSaveFlowOwner;
  const previousOpeningTreeIdentity = previousOpeningTreeSaveFlowIdentity;
  const destinationOpeningTreeIdentity = openingTreeSaveFlowIdentity(route);
  previousRouteForSaveFlowOwner = route;



  const previousRouteForPractice = previousRouteForPracticeLifecycle;
  previousRouteForPracticeLifecycle = route;
  previousOpeningTreeSaveFlowIdentity = destinationOpeningTreeIdentity;
  if (analysisGameSaveFlowOwnerChanged(previousSaveFlowOwnerRoute, route)) {
    resetGameSaveFlow();
    resetLfymSaveFlow();
  }
  if (puzzleRoundSaveFlowOwnerChanged(previousSaveFlowOwnerRoute, route)) {
    resetPuzzleRoundSaveFlow();
  }
  if (openingTreeSaveFlowOwnerChangedFromIdentities(
    previousSaveFlowOwnerRoute,
    previousOpeningTreeIdentity,
    route,
    destinationOpeningTreeIdentity,
  )) {
    resetOpeningsSaveFlow();
  }


















































  const previousRouteForBump = previousRouteForSurfaceBump;
  previousRouteForSurfaceBump = route;
  if (
    (route.name === 'study-detail'
      && (previousRouteForBump === null
          || previousRouteForBump.name !== 'study-detail'
          || previousRouteForBump.params['id'] !== route.params['id']))
    || (previousRouteForBump?.name === 'study-detail'
        && route.name !== 'study-detail')
    || (previousRouteForBump === null)
  ) {
    bumpSelectionSurface();
  }





  if (
    (currentRoute.name === 'analysis' || currentRoute.name === 'analysis-game')
    && route.name !== 'analysis' && route.name !== 'analysis-game'
  ) {
    flushPendingGamePersist();



    invalidateAnalysisModeSnapshot();
  }





  handleRouteTransition({ previousRoute: previousRouteForPractice, destinationRoute: route });













  if (isDrillActive()) {
    endDrill('route-exit');
  }










  if (route.name !== 'study-detail') {
    // Settles a still-focused comment synchronously before the Study DOM is removed, then begins
    // its strict write without making P0 route navigation wait on IndexedDB.
    void flushStudyDetailPersistence().catch(() => {});
    unmountStudyWorkspace('route-exit');
  }
  // T5-D22b/c per-route workspace mounting (see mountAnalysisWorkspace + the getCtrl/navigate
  // routing wired at initGround() above). Leaving the analysis surface entirely snapshots its
  // current orientation (board/index.ts's `orientation` is one shared module value a Study mount
  // also drives — see analysisOrientationBeforeExcursion's own comment); re-entering it restores
  // that orientation and re-mounts the Analysis workspace instance, so the shared board reads
  // Analysis's session again instead of a stale Study (or other) excursion's session — the core
  // cross-navigation fix this slice exists to prove.
  const wasAnalysisSurface = currentRoute.name === 'analysis' || currentRoute.name === 'analysis-game';
  const enteringAnalysisSurface = route.name === 'analysis' || route.name === 'analysis-game';
  if (wasAnalysisSurface && !enteringAnalysisSurface) {
    analysisOrientationBeforeExcursion = orientation;
  }
  if (!wasAnalysisSurface && enteringAnalysisSurface) {
    setOrientation(analysisOrientationBeforeExcursion);
    mountAnalysisWorkspace();
  }






  currentRoute = route;
  // Practice lives on the analysis board only — leaving it tears the session down
  // (in-board URL updates use history-replace and do not fire this handler).
  if (route.name !== 'analysis' && route.name !== 'analysis-game') endPracticeSession('route-teardown');



  if (route.name !== 'analysis' && route.name !== 'analysis-game') cancelSilentEval();



  if (route.name !== 'analysis' && route.name !== 'analysis-game' && questionnaireCtrl) {
    closeQuestionnaireModule();
  }






  if (route.name === 'analysis' || route.name === 'analysis-game') {
    const pendingPracticeStart = consumePendingPracticeStart(ctrl.root.fen);
    if (pendingPracticeStart) {
      setOrientation(pendingPracticeStart.color);
      togglePracticeSession();
    }
  } else {
    clearPendingPracticeStart();
  }
  if (route.name !== 'puzzles') cancelPuzzleLibraryRouteHydration();
  if (route.name !== 'study') cancelStudyLibraryRouteHydration();
  if (route.name !== 'study-detail') cancelStudyDetailRouteHydration();
  // Any real (non-replace) navigation drops the editor ctrl: leaving the route
  // disposes stale state, and landing on #/editor (fresh entry or a repeat
  // visit) forces the next render to re-parse fen/color from the URL rather
  // than resuming a previous session's board.
  editorCtrl = undefined;





  resetEditorSaveFlow();
  // Finding 2 (Sol fix round 2): route-EXIT invalidation must run on EVERY exit from the Opening
  // Tree surface, so it sits ABOVE the bulk-running / puzzle-round / puzzles early returns below —
  // exiting to any of those destinations returns before the later `!isOpponentsTreeRoute` block and
  // would otherwise leave a pre-exit source refresh live. Only fire on an actual exit (the new route
  // is not the Opening Tree route); navigating INTO the tree is handled by hydrateOpponentsTreeRoute.
  // Bumping the generation on a non-OT -> non-OT hop is a harmless no-op (nothing in flight).
  if (shouldInvalidateOpeningsOnRouteChange(route)) invalidateOpeningsSourceRefresh();
  // While the background review queue is running, don't allow route changes to
  // trigger loadGame() — the queue drives all game loading.
  if (isBulkRunning() && (route.name === 'analysis-game' || route.name === 'analysis')) {
    selectedGameId = route.name === 'analysis-game'
      ? (parseImportedGameRouteId(route.params?.['id'] ?? '') ?? selectedGameId)
      : selectedGameId;
    performance.mark('route-render-start');
    vnode = patchSafely('route.bulk-review', vnode, view(currentRoute));
    performance.mark('route-render-end');
    return;
  }
  // When deep-linking to a specific game, load it before rendering.
  // loadGame() calls redraw() which patches via currentRoute, so return early
  // to avoid a redundant second patch in this handler.
  // Mirrors the pattern in lichess-org/lila: ui/analyse/src/ctrl.ts where the
  // controller is always initialized with the correct game data before rendering.
  // When navigating to a puzzle round, load the puzzle before rendering.
  if (route.name === 'puzzle-round') {
    const puzzleId = route.params['id'] ?? '';
    void openPuzzleRoundRoute(puzzleId, route.query ?? '', redraw);
    return; // openPuzzleRound calls redraw() when ready
  }
  if (route.name === 'puzzles') {
    void hydratePuzzleLibraryRoute(route.query ?? '', redraw);
    return;
  }
  if (isOpponentsTreeRoute(route)) {
    void hydrateOpponentsTreeRoute(route);
    return;
  }
  releaseOpponentsTreeRouteSuppression();
  if (!isOpponentsTreeRoute(route)) {
    opponentsUrlSnapshotScheduler.clear();
    // NOTE: the route-exit invalidateOpeningsSourceRefresh() moved ABOVE the early returns near the
    // top of this handler (Sol fix round 2, finding 2) so it also fires when exiting to the
    // bulk-running / puzzle-round / puzzles destinations, which return before reaching here.
  }
  if (route.name === 'opponents') {
    ++opponentsTreeHydrationRun;
    setRouteRecoveryMessage(null);
    // An explicit accounts-library history entry is authoritative for this load. Without this
    // one-shot suppression, loadSavedCollections() can resume an older persisted tree and its
    // session snapshot immediately promotes #/opponents back into that stale target, corrupting
    // Back/Forward restoration after a different target's recovered route.
    skipNextSavedSessionResume();
    initOpeningsPage('library');
    invalidateCollections();
  }
  if (route.name === 'stats') {
    hydrateStatsRoute(route.query ?? '', redraw);
  }
  if (route.name === 'study') {
    hydrateStudyLibraryRoute(route.query ?? '', redraw);
  }
  if (route.name === 'analysis-game') {
    const id = route.params['id'] ?? '';
    if (id.startsWith('research:')) {
      if (id !== selectedGameId && id !== researchAnalysisLoadingId) void loadResearchGameByRouteId(id);
      performance.mark('route-render-start');
      vnode = patchSafely('route.research-analysis', vnode, view(currentRoute));
      performance.mark('route-render-end');
      return;
    }
    const importedGameId = parseImportedGameRouteId(id);
    const game = importedGameId ? importedGames.find(g => g.id === importedGameId) : undefined;
    if (game && game.id !== selectedGameId) {
      flushPendingGamePersist();
      selectedGameId = game.id;
      loadGame(game.pgn); // calls redraw() which patches with the updated state



      applyRouteOwnedAnalysisPly(route, { sync: true });
      return;
    }
    if (game) {






      if (applyRouteOwnedAnalysisPly(route, { sync: true })) {
        redraw();
        return;
      }
    }
  }
  performance.mark('route-render-start');
  vnode = patchSafely('route.change', vnode, view(currentRoute));
  performance.mark('route-render-end');
});

// First render — all modules are initialised so view() is safe to call.
vnode = patchSafely('bootstrap.initial', app, view(currentRoute));
performance.mark('first-route-render');

drainReportOutboxOnInit();

// If the initial route is openings, initialise page state.
if (isOpponentsTreeRoute(currentRoute)) {
  void hydrateOpponentsTreeRoute(currentRoute);
} else if (currentRoute.name === 'opponents') {
  initOpeningsPage('library');
  invalidateCollections();
}

if (currentRoute.name === 'stats') {
  hydrateStatsRoute(currentRoute.query ?? '', redraw);
}

if (currentRoute.name === 'study') {
  hydrateStudyLibraryRoute(currentRoute.query ?? '', redraw);
}

if (currentRoute.name === 'puzzles') {
  void hydratePuzzleLibraryRoute(currentRoute.query ?? '', redraw);
} else {
  cancelPuzzleLibraryRouteHydration();
}

// If the initial route is a puzzle round, load it now.
if (currentRoute.name === 'puzzle-round') {
  const puzzleId = currentRoute.params['id'] ?? '';
  void openPuzzleRoundRoute(puzzleId, currentRoute.query ?? '', redraw);
}

// Request durable storage so the browser is less likely to evict IDB data.
navigator.storage?.persist?.().catch(() => {});

// --- Startup: restore persisted saved puzzle candidates ---
void loadPuzzlesFromIdb().then(puzzles => {
  setSavedPuzzles(puzzles);
  redraw();
});

// --- Startup: restore persisted games ---
// Runs after the initial render so the board already exists when syncBoard is called.
// Mirrors the deferred-load pattern of lichess-org/lila: ui/analyse/src/idbTree.ts merge()
refreshRegisteredAccounts();
const startupGameLibraryHydration = ++gameLibraryHydrationGeneration;
void loadGamesFromIdb().then(stored => {
  if (startupGameLibraryHydration !== gameLibraryHydrationGeneration) return;
  performance.mark('idb-hydration-complete');
  gamesLibraryLoaded = true;
  gameLibraryHydrationError = false;
  const rawRouteGameId = currentRoute.name === 'analysis-game'
    ? (currentRoute.params['id'] ?? null)
    : null;
  if (rawRouteGameId?.startsWith('research:')) {
    void loadResearchGameByRouteId(rawRouteGameId);
    return;
  }
  const routeGameId = rawRouteGameId ? parseImportedGameRouteId(rawRouteGameId) : null;
  if (!stored || stored.games.length === 0) {
    setImportedGames([]);
    selectedGameId = null;
    selectedGamePgn = null;
    restoreGameIdCounter(0);
    syntheticAnalysisBoardCreatedAt = null;
    performance.mark('pgn-parse-start');
    ctrl = new AnalyseCtrl(pgnToTree(SAMPLE_PGN));
    markCurrentAnalysisBoardClean();
    markUserTreeSaveBaseline();
    performance.mark('pgn-parse-end');
    clearEvalCache();
    resetCurrentEval();
    clearPuzzleCandidates();
    resetReviewStatusRuntime();
    setOrientation('white');
    restoreGeneration++;
    syncBoardAndArrow();
    redraw();
    void hydrateReviewedStateFromIdb();
    return;
  }
  setImportedGames(stored.games);
  // Restore gameIdCounter so new counter ids don't collide with existing ones.
  // Only `game-N` ids participate: platform ids (lichess:/chesscom:) live in a
  // disjoint key space and would parse to NaN here.
  restoreGameIdCounterFromLibrary(stored.games);
  // When deep-linking to analysis-game at boot, prefer the route's id over the
  // previously selected game so the URL resolves to the intended game immediately.
  const routeGame = routeGameId !== null ? stored.games.find(g => g.id === routeGameId) : undefined;
  const toLoad = routeGame
    ?? stored.games.find(g => g.id === stored.selectedId)
    ?? stored.games[0]!;
  selectedGameId = toLoad.id;
  selectedGamePgn = toLoad.pgn;
  // Reconcile a stale deep-link: if the boot URL named an imported analysis game that no longer
  // resolves locally, fall back to the saved game (above) and canonicalize the URL to the generic
  // analysis route so the address bar does not keep pointing at a missing game. Mirrors the
  // route-change/rehydrate handler's routeGameDeleted reconcile. Done before any route-owned ply is
  // applied so a stale ply from the missing-game URL is not replayed.
  const routeGameMissing = currentRoute.name === 'analysis-game'
    && !!rawRouteGameId
    && !rawRouteGameId.startsWith('research:')
    && !routeGame;
  if (routeGameMissing) replaceDeletedAnalysisGameRoute();
  syntheticAnalysisBoardCreatedAt = null;
  performance.mark('pgn-parse-start');
  ctrl = new AnalyseCtrl(pgnToTree(toLoad.pgn));
  markCurrentAnalysisBoardClean();
  // Baseline before the async user-tree merge below — see loadGame()'s identical comment.
  markUserTreeSaveBaseline();
  performance.mark('pgn-parse-end');
  clearEvalCache();
  resetCurrentEval();
  // Set orientation from the user's side before first paint; fall back to 'white'.
  setOrientation(getUserColor(toLoad) ?? 'white');
  const routePlyApplied = applyRouteOwnedAnalysisPly(currentRoute);
  // Restore analysis path — ctrl.setPath is a no-op if the path is invalid for this tree
  if (!routePlyApplied && stored.path) ctrl.setPath(stored.path);
  syncBoardAndArrow();
  redraw();





  void hydrateReviewedStateFromIdb();
  // Restore persisted engine analysis for this game.
  // Pass restoreGeneration so the guard in loadAndRestoreAnalysis can detect a rapid
  // game switch that occurs before this async restore completes.
  void loadAndRestoreAnalysis(toLoad.id, restoreGeneration);
  // Restore persisted user-tree edits (variations/comments/glyphs/nags) for this game —
  // this startup hydration path is the primary "page refresh" scenario for BUG-2026-07-05-012.
  void loadAndMergeUserTree(toLoad.id, restoreGeneration);

  // Backfill missing or stale GameSummary records from compatible completed analysis.
  // Runs in the background after games are loaded; current/newer summaries are preserved.
  void backfillGameSummaries(stored.games);
  // Classify openings for existing games that lack opening/ECO data.
  void backfillOpenings();




  const startOpponentDeltaBackfill = (): void => {
    enqueueOpponentDeltaBackfill(importedGames, { onGameEnriched: applyEnrichmentPatch });
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(startOpponentDeltaBackfill);
  else setTimeout(startOpponentDeltaBackfill, 2000);
  // Resume any bulk review run interrupted by a reload/crash. Reads the review-queue
  // manifest (src/idb/index.ts), rebuilds pending/analyzing/error entries against the
  // games that still exist, and restarts the queue from where it left off.
  void resumeReviewQueueFromManifest(stored.games);
}).catch(err => {
  // BUG-2026-07-10-007: loadGamesFromIdb now REJECTS on a genuine storage failure instead of
  // masking it as an empty library. Without this catch the rejection would be unhandled and
  // `gamesLibraryLoaded` (set only inside the .then above) would never flip true, freezing the
  // games list, /puzzles, /opponents, /stats and the analysis board on their loading skeletons
  // forever. Release the skeleton gate but route to the games-list error state (not the empty
  // state) so a storage failure is never misread as "no games imported yet". The sample analysis
  // board created at startup remains the fallback board.
  if (startupGameLibraryHydration !== gameLibraryHydrationGeneration) return;
  console.warn('[idb] startup games hydration failed', err);
  gamesLibraryLoaded = true;
  gameLibraryHydrationError = true;
  redraw();
});

// Candidate-selection changes rebuild active retro; display-only settings such
// as feedback tone should preserve LFYM progress and only redraw text.
onRetroConfigChange(change => {
  if (change.affectsCandidateSelection) {
    if (ctrl.retro) rebuildRetroSession();
    else if (ctrl.retroChoice) rebuildRetroChoicePage();
    else redraw();
  }
  else redraw();
});
