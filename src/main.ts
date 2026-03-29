import { init, classModule, attributesModule, eventListenersModule, h, type VNode } from 'snabbdom';
import { AnalyseCtrl } from './analyse/ctrl';
import {
  applyBoardTheme, applyBoardZoom, applyPieceSet,
  boardWheelNavEnabled,
  reviewDotsUserOnly,
  boardFilters, boardTheme, boardThumbnailUrl, boardZoom,
  BOARD_THEMES_FEATURED,
  clearBoardLocalData,
  filtersAtDefault, piecePreviewUrl, pieceSet,
  PIECE_SETS_FEATURED,
  resetFilters, saveBoardZoom, setFilter,
} from './board/cosmetics';
import {
  evalCache,
  currentEval, resetCurrentEval, setCurrentEval, clearEvalCache,
  engineEnabled, analysisDepth,
  evalCurrentPosition,
  syncArrow,
  initEngine,
  setOnLiveEvalImproved,
  type PositionEval,
} from './engine/ctrl';
import {
  batchAnalyzing,
  batchState, setBatchState,
  analysisComplete, setAnalysisComplete,
  reviewDepth,
  resetBatchState,
  startBatchWhenReady,
  initBatch,
} from './engine/batch';
import { detectMissedMoments } from './engine/tactics';
import {
  cgInstance, setOrientation,
  syncBoard, syncBoardAndArrow, flip,
  completeMove, uciToSan,
  renderBoard, renderPromotionDialog, renderPlayerStrips,
  initGround, cgInstance,
} from './board/index';
import { preloadBoardSounds, playMoveSound } from './board/sound';
import {
  renderCeval, renderPvBox, renderPvBoard, renderEngineSettings,
  initCevalView,
} from './ceval/view';
import {
  renderAnalysisControls, downloadPgn, initPgnExport, copyLinePgn, isMainlinePath,
} from './analyse/pgnExport';
import { bindKeyboardHandlers, renderKeyboardHelp } from './keyboard';
import {
  renderGameList, renderGamesView, type GamesViewDeps,
  getUserColor, gameResult, gameSourceUrl, renderCompactGameRow,
} from './games/view';
import { renderMoveList } from './analyse/moveList';
import {
  computeAnalysisSummary, renderAnalysisSummary,
  renderEvalBar, renderEvalGraph,
} from './analyse/evalView';
import {
  clearPuzzleCandidates, renderPuzzleCandidates,
  type PuzzleRenderDeps,
} from './puzzles/extract';
import { initPuzzlePage, loadLibraryCounts, openPuzzleRound } from './puzzles/ctrl';
import { renderPuzzleLibrary, renderPuzzleRound } from './puzzles/view';
import { savePuzzleDefinition } from './puzzles/puzzleDb';
import { simpleHash } from './puzzles/adapters';
import type { UserLibraryPuzzleDefinition } from './puzzles/types';
import { renderAdminPage } from './admin/view';
import {
  enqueueBulkReview, isBulkRunning, initReviewQueue,
} from './engine/reviewQueue';
import { setMissedMoments, clearMissedMoments, getMissedMoments } from './engine/tactics';
import { renderHeader, type HeaderDeps } from './header/index';
import {
  type ImportedGame, restoreGameIdCounter,
} from './import/types';
import {
  ANALYSIS_VERSION, buildAnalysisNodes, clearAllIdbData, clearAnalysisFromIdb,
  loadAnalysisFromIdb, loadGamesFromIdb,
  loadPuzzlesFromIdb, saveAnalysisToIdb, saveGamesToIdb, saveNavStateToIdb,
  savedPuzzles, savePuzzle, setSavedPuzzles,
} from './idb/index';
import { current, onChange, type Route } from './router';
import { deleteNodeAt, nodeAtPath, parentAtPath, pathInit, promoteAt, pruneVariations } from './tree/ops';
import { pgnToTree } from './tree/pgn';
import { initOpeningsPage, invalidateCollections } from './openings/ctrl';
import { renderOpeningsPage, renderAnalysisExplorerSection } from './openings/view';
import { explorerCtrl } from './openings/explorerCtrl';
import { buildMainlineOpeningProvider, buildRetroCandidates } from './analyse/retro';
import { makeRetroCtrl } from './analyse/retroCtrl';
import { onRetroConfigChange } from './analyse/retroConfig';
import { initRetroMoveHandler } from './analyse/retroMoveHandler';
import { renderRetroEntry, renderRetroStrip } from './analyse/retroView';

console.log('Patzer Pro');

const patch = init([classModule, attributesModule, eventListenersModule]);
const PUBLIC_SOURCE_URL = 'https://github.com/LeviathanDuck/PatzerPatzer';
const PUBLIC_LICENSE_URL = `${PUBLIC_SOURCE_URL}/blob/main/LICENSE`;
const NAV_STATE_SAVE_MS = 500;

function dedupeImportedGames(existing: ImportedGame[], incoming: ImportedGame[]): ImportedGame[] {
  const seenPgns = new Set(existing.map(game => game.pgn));
  const deduped: ImportedGame[] = [];
  const importedAt = Date.now();
  for (const game of incoming) {
    if (seenPgns.has(game.pgn)) continue;
    seenPgns.add(game.pgn);
    deduped.push({ ...game, importedAt });
  }
  return deduped;
}

// Callbacks injected into import adapters so they can mutate app state
// without creating a circular import on main.ts.
const importCallbacks = {
  addGames(games: ImportedGame[], _first: ImportedGame): void {
    const dedupedGames = dedupeImportedGames(importedGames, games);
    const first = dedupedGames[0];
    if (!first) {
      redraw();
      return;
    }
    importedGames = [...importedGames, ...dedupedGames];
    selectedGameId = first.id;
    void saveGamesToIdb(importedGames);
    loadGame(first.pgn); // calls redraw
    // Auto-review: queue all newly imported games for background engine review.
    if (importFilters.autoReview && dedupedGames.length > 0) {
      enqueueBulkReview(dedupedGames);
    }
  },
  redraw(): void { redraw(); },
};

const SAMPLE_PGN = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7';

let importedGames: ImportedGame[] = [];
let selectedGameId: string | null = null;
let selectedGamePgn: string | null = null;
/**
 * True once the initial IDB game-library load attempt has completed (whether the
 * stored library was empty or had games). Used to distinguish "still loading" from
 * "genuinely empty" in route rendering.
 */
let gamesLibraryLoaded = false;

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

/**
 * Render the move-list context menu overlay.
 * Positioned at cursor coords using fixed positioning.
 * Mirrors lichess-org/lila: ui/analyse/src/treeView/contextMenu.ts view()
 */
function renderContextMenu(): VNode | null {
  if (!contextMenuPath || !contextMenuPos) return null;
  const node       = nodeAtPath(ctrl.root, contextMenuPath);
  const title      = node?.san ?? contextMenuPath;
  const onMainline = isMainlinePath(ctrl.root, contextMenuPath);
  const copyLabel  = onMainline ? 'Copy main line PGN' : 'Copy variation PGN';
  return h('div#move-ctx-menu.visible', {
    on: { contextmenu: (e: Event) => e.preventDefault() },
    hook: {
      insert: vnode => positionContextMenu(vnode.elm as HTMLElement, contextMenuPos!),
      postpatch: (_old, vnode) => positionContextMenu(vnode.elm as HTMLElement, contextMenuPos!),
    },
  }, [
    h('p.title', title),
    // Copy PGN — mirrors lichess-org/lila: contextMenu.ts clipboard copy action (CCP-026)
    h('a', {
      on: { click: () => { copyLinePgn(contextMenuPath!); contextMenuPath = null; contextMenuPos = null; redraw(); } },
    }, copyLabel),
    // Delete from here — mirrors lichess-org/lila: contextMenu.ts deleteFromHere action (CCP-027)
    h('a', {
      on: { click: () => {
        const path = contextMenuPath!;
        contextMenuPath = null; contextMenuPos = null;
        deleteVariation(path);
      } },
    }, 'Delete from here'),
    // Promote variation / Make main line — mirrors lichess-org/lila: contextMenu.ts promote actions (CCP-028)
    // Only shown for non-mainline nodes: promoting a mainline node is a no-op.
    !onMainline ? h('a', {
      on: { click: () => {
        const path = contextMenuPath!;
        contextMenuPath = null; contextMenuPos = null;
        promoteAt(ctrl.root, path, false);
        redraw();
      } },
    }, 'Promote variation') : null,
    !onMainline ? h('a', {
      on: { click: () => {
        const path = contextMenuPath!;
        contextMenuPath = null; contextMenuPos = null;
        promoteAt(ctrl.root, path, true);
        redraw();
      } },
    }, 'Make main line') : null,
    // --- Create Puzzle actions (CCP-167) ---
    // Only shown when a game is loaded (selectedGameId present).
    // Branch 1: right-clicked move IS the solution; puzzle starts at parent position.
    selectedGameId && node?.uci ? h('a.ctx-puzzle', {
      on: { click: () => {
        const path = contextMenuPath!;
        contextMenuPath = null; contextMenuPos = null;
        createPuzzleFromSolution(path);
      } },
    }, 'Create Puzzle (solution)') : null,
    // Branch 2: right-clicked position IS the puzzle start; engine best move is the solution.
    selectedGameId ? h('a.ctx-puzzle', {
      on: { click: () => {
        const path = contextMenuPath!;
        contextMenuPath = null; contextMenuPos = null;
        createPuzzleFromStart(path);
      } },
    }, 'Create Puzzle (start)') : null,
  ]);
}

// --- Create Puzzle helpers (CCP-167) ---
// These wire the two context-menu authoring branches into puzzle persistence.

/** Transient confirmation message shown after puzzle creation. */
let puzzleCreateMsg: string | null = null;
let puzzleCreateMsgTimer: ReturnType<typeof setTimeout> | undefined;

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
    solutionLine: parentEval?.moves && parentEval.moves.length > 0
      ? parentEval.moves
      : [node.uci],
    strictSolutionMove: node.uci,
    createdAt: Date.now(),
    sourcePath: parentPath,
    sourceReason: 'manual',
  };
  if (selectedGameId) def.sourceGameId = selectedGameId;

  void savePuzzleDefinition(def).then(() => {
    flashPuzzleMsg(`Puzzle saved — solution: ${node.san ?? node.uci}`);
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

  const solutionLine = cached.moves && cached.moves.length > 0
    ? cached.moves
    : [cached.best];

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

  void savePuzzleDefinition(def).then(() => {
    flashPuzzleMsg(`Puzzle saved — start position after ${node.san ?? '...'}`);
  });
}

const analyzedGameIds:      Set<string>                                              = new Set();
const missedTacticGameIds:  Set<string>                                              = new Set();
const analyzedGameAccuracy: Map<string, { white: number | null; black: number | null }> = new Map();

function getActivePgn(): string {
  return selectedGamePgn ?? SAMPLE_PGN;
}

// --- Analysis controller (persists for the session) ---

let ctrl = new AnalyseCtrl(pgnToTree(getActivePgn()));

// Incremented on every loadGame() call. loadAndRestoreAnalysis() captures this value at
// call time and checks it after the IDB await — if changed, the game has switched and the
// restore result is discarded as stale.
// Mirrors the implicit game-scoping in lichess-org/lila: ui/analyse/src/idbTree.ts, where
// the IDB class is owned by the ctrl instance and cannot outlive it.
let restoreGeneration = 0;
let navStateSaveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleNavStateSave(path = ctrl.path): void {
  if (navStateSaveTimer !== null) clearTimeout(navStateSaveTimer);
  const selectedId = selectedGameId;
  navStateSaveTimer = setTimeout(() => {
    navStateSaveTimer = null;
    void saveNavStateToIdb(selectedId, path);
  }, NAV_STATE_SAVE_MS);
}

/**
 * Load a game into the analysis board by PGN.
 * Resets analysis state and re-evaluates if engine is on.
 * When called with source:'queue' the background review queue is driving the load —
 * skip the full reset so the queue state and eval cache are not destroyed.
 */
function loadGame(pgn: string | null, opts?: { source?: 'queue' | 'user' }): void {
  selectedGamePgn = pgn;
  ctrl = new AnalyseCtrl(pgnToTree(getActivePgn()));

  if (opts?.source === 'queue') {
    // Background queue advance: rebuild ctrl only, do not reset batch or eval cache.
    restoreGeneration++;
    return;
  }

  clearEvalCache();
  resetCurrentEval();
  clearPuzzleCandidates();
  resetBatchState();
  // Default orientation to the importing user's perspective when determinable.
  // Leaves orientation unchanged if user side cannot be determined (PGN paste, unknown username).
  if (selectedGameId) {
    const loadedGame = importedGames.find(g => g.id === selectedGameId);
    if (loadedGame) {
      const userColor = getUserColor(loadedGame);
      if (userColor) setOrientation(userColor);
    }
  }
  syncBoardAndArrow();
  scheduleNavStateSave('');
  // Restore persisted analysis from IndexedDB; falls back to live eval if nothing stored.
  // Increment restoreGeneration first so any in-flight restore from the previous game
  // sees a stale generation value and discards its result.
  restoreGeneration++;
  if (selectedGameId) void loadAndRestoreAnalysis(selectedGameId, restoreGeneration);
  else evalCurrentPosition();
  redraw();
}

function loadGameById(gameId: string): boolean {
  const game = importedGames.find(g => g.id === gameId);
  if (!game) return false;
  selectedGameId = game.id;
  loadGame(game.pgn);
  return true;
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
  // Stale data: version or depth changed — discard
  if (stored.analysisVersion !== ANALYSIS_VERSION) return;
  if (stored.analysisDepth !== reviewDepth) return;
  // Repopulate evalCache from stored node entries.
  // Guard: pre-migration records (ANALYSIS_VERSION < 2) lack entry.path — skip them.
  for (const entry of Object.values(stored.nodes)) {
    if (!entry.path) continue; // backward safety: old node.id-keyed record
    const ev: PositionEval = {};
    if (entry.cp    !== undefined) ev.cp    = entry.cp;
    if (entry.mate  !== undefined) ev.mate  = entry.mate;
    if (entry.best  !== undefined) ev.best  = entry.best;
    if (entry.loss  !== undefined) ev.loss  = entry.loss;
    if (entry.delta !== undefined) ev.delta = entry.delta;
    // Carry persisted move-review annotation into the in-memory eval shape so UI
    // consumers can prefer it over recomputing classifyLoss(loss) on every render.
    // Absent on older records (ANALYSIS_VERSION < 3 era) — consumers fall back to
    // classifyLoss(loss) safely.
    if (entry.label    !== undefined) ev.label = entry.label;
    // Restore the persisted primary PV line into PositionEval.moves so that
    // buildRetroCandidates() can expose it as RetroCandidate.bestLine.
    // Absent on older records — consumers treat undefined as no PV available.
    // Mirrors lichess-org/lila: retroCtrl.ts solution node PV moves hydration.
    if (entry.bestLine !== undefined) ev.moves = entry.bestLine;
    evalCache.set(entry.path, ev);
  }
  if (stored.status === 'complete') {
    analyzedGameIds.add(gameId);
    setAnalysisComplete(true);
    setBatchState('complete');
    const game = importedGames.find(g => g.id === gameId);
    const userColor = game ? getUserColor(game) : null;
    const moments = detectMissedMoments(ctrl.mainline, evalCache, userColor);
    setMissedMoments(gameId, moments);
    if (moments.length > 0) missedTacticGameIds.add(gameId);
    // Capture accuracy while evalCache is populated for this game.
    const restoredSummary = computeAnalysisSummary(ctrl.mainline, evalCache);
    if (restoredSummary) {
      analyzedGameAccuracy.set(gameId, { white: restoredSummary.white.accuracy, black: restoredSummary.black.accuracy });
    }
  }
  // Sync display to the restored eval for the current node
  const restoredEval = evalCache.get(ctrl.path);
  if (restoredEval) setCurrentEval(restoredEval);
  syncArrow();
  // Notify retrospection that analysis data is now available.
  // Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts onMergeAnalysisData() retro call.
  ctrl.retro?.onMergeAnalysisData();
  redraw();
}


// --- Navigation ---

// --- Navigation ---
// Single navigation helper: every path change must go through here so that
// board, eval arrow, graph, and move list always stay in sync.
// Mirrors the userJump pattern in lichess-org/lila: ui/analyse/src/ctrl.ts

function navigate(path: string): void {
  // Guard: no-op when already at this path.
  // Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts jump() `pathChanged` guard.
  // Prevents re-entering evalCurrentPosition() — and stopping an active engine search —
  // when the caller passes the current path (e.g. clicking the active move in the
  // move list, clicking the current position in the eval graph).
  if (path === ctrl.path) return;
  // Play move sound when stepping forward one ply (new path is exactly 2 chars longer).
  // Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts jump() isForwardStep + site.sound.move().
  const isForwardStep = path.length === ctrl.path.length + 2;
  ctrl.setPath(path);
  if (isForwardStep) playMoveSound(ctrl.node.san);
  // Notify retrospection of the path change — offTrack detection, later win/fail.
  // Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts jump() retro.onJump() call.
  ctrl.retro?.onJump(path);
  syncBoard();
  syncArrow();
  evalCurrentPosition();
  // Notify opening explorer of the new position.
  // Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts jump() explorer.setNode() call.
  explorerCtrl.setNode(ctrl.node.fen, redraw);
  scheduleNavStateSave(ctrl.path);
  redraw();
  scrollActiveIntoView();
}

// Center the active move vertically in the visible portion of the move list.
// Adapted from lichess-org/lila: ui/analyse/src/treeView/treeView.ts autoScroll()
// Uses getBoundingClientRect geometry to compute exact scroll offset so the active
// move sits in the middle of the visible list area, not just scrolled into view.
// On mobile the move list is not a scroll container (the page scrolls instead),
// so falls back to scrollIntoView on the active element.
let _scrollRaf = 0;
function scrollActiveIntoView(behavior: ScrollBehavior = 'instant'): void {
  cancelAnimationFrame(_scrollRaf);
  _scrollRaf = requestAnimationFrame(() => {
    const scrollView = document.querySelector<HTMLElement>('.analyse__moves');
    const moveEl     = scrollView?.querySelector<HTMLElement>('.move.active');
    if (!scrollView) return;
    if (!moveEl) { scrollView.scrollTo({ top: 0, behavior }); return; }
    // If the container has no overflow (mobile: page scrolls instead), use scrollIntoView.
    if (scrollView.scrollHeight <= scrollView.clientHeight + 2) {
      moveEl.scrollIntoView({ behavior, block: 'center' });
      return;
    }
    const move = moveEl.getBoundingClientRect();
    const view = scrollView.getBoundingClientRect();
    const visibleHeight = Math.min(view.bottom, window.innerHeight) - Math.max(view.top, 0);
    scrollView.scrollTo({
      top: scrollView.scrollTop + move.top - view.top - (visibleHeight - move.height) / 2,
      behavior,
    });
  });
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
  if (ctrl.retro) {
    delete ctrl.retro;
    // Restore arrows that were suppressed during retro mode.
    // buildArrowShapes() gates on ctrl.retro presence — syncArrow() must be
    // called here so arrows re-appear immediately without waiting for the next
    // navigation or engine event.
    syncArrow();
    redraw();
    return;
  }
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
  ctrl.retro = makeRetroCtrl(
    candidates,
    userColor ?? null,
    () => currentEval,
    (path) => evalCache.get(path),
    navigate,
  );
  // Jump to the position before the first candidate mistake.
  // Mirrors lichess-org/lila: retroCtrl.ts jumpToNext → root.userJump(prev.path).
  const first = ctrl.retro.current();
  if (first) navigate(first.parentPath); // navigate calls redraw()
  else redraw(); // no candidates — still redraw to update button state
}

function clearRetroMode(): void {
  if (!ctrl.retro) return;
  delete ctrl.retro;
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
  ctrl.retro = makeRetroCtrl(
    candidates,
    userColor ?? null,
    () => currentEval,
    (path) => evalCache.get(path),
    navigate,
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
function reviewAllGames(games: ImportedGame[]): void {
  if (games.length === 0) return;
  enqueueBulkReview(games);
}

// --- Route views ---

function routeContent(route: Route): VNode {
  const deps: GamesViewDeps = {
    importedGames, selectedGameId,
    analyzedGameIds, missedTacticGameIds, analyzedGameAccuracy,
    savedPuzzles, gameResult, getUserColor, gameSourceUrl, renderCompactGameRow,
    selectGame(game) { selectedGameId = game.id; loadGame(game.pgn); },
    reviewGame(game) {
      selectedGameId = game.id;
      loadGame(game.pgn);
      window.location.hash = '#/analysis';
      startBatchWhenReady();
    },
    reviewAllGames,
    redraw,
  };
  switch (route.name) {
    case 'analysis-game': {
      // Resolve the route's game id against the imported library.
      // Three states:
      //   (a) IDB not yet loaded → show transient loading text until gamesLibraryLoaded.
      //   (b) id not found after load → honest not-found fallback.
      //   (c) id found → fall through to render the full analysis board below.
      //       The game was already selected by the onChange or startup route handler.
      const gameId = route.params['id'] ?? '';
      if (!gamesLibraryLoaded) {
        return h('p', 'Loading…');
      }
      if (!importedGames.find(g => g.id === gameId)) {
        return h('div', [
          h('p', `Game "${gameId}" was not found in the imported library.`),
          h('a', { attrs: { href: '#/games' } }, 'View all games'),
        ]);
      }
      // intentional fallthrough — game is loaded, render the analysis board
    }
    // falls through
    case 'analysis':
      const currentGame = importedGames.find(g => g.id === selectedGameId);
      const currentUserColor = currentGame ? getUserColor(currentGame) : null;
      return h('div.analyse', [
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
        renderEvalBar(engineEnabled, currentEval, ctrl.node.fen),

        // Tools — right column (grid-area: tools)
        // Mirrors lichess-org/lila: ui/analyse/src/view/main.ts div.analyse__tools
        h('div.analyse__tools', [
          // Engine header: toggle + pearl + engine-name/status + settings gear
          // Mirrors lichess-org/lila: ui/lib/src/ceval/view/main.ts renderCeval()
          renderCeval(),
          // Engine settings panel — hidden during active retrospection.
          // Settings are irrelevant while solving; retro is a focused board mode.
          // Mirrors lichess-org/lila: ui/analyse/src/view/tools.ts mode-gate pattern.
          ctrl.retro ? null : renderEngineSettings(),
          // PV lines — hidden whenever retrospection is active and guidance has not
          // been manually revealed for the current candidate.
          // Covers all retro states so the answer is never accidentally visible.
          // Mirrors lichess-org/lila: ui/analyse/src/view/tools.ts
          //   showCeval && !ctrl.retro?.isSolving() && cevalView.renderPvs(ctrl)
          (!ctrl.retro || ctrl.retro.guidanceRevealed()) ? renderPvBox() : null,
          // Move list with internal scroll — mirrors div.analyse__moves.areplay
          h('div.analyse__moves.areplay', [
            renderMoveList(ctrl.root, ctrl.path, p => evalCache.get(p), navigate, currentUserColor, reviewDotsUserOnly, deleteVariation, contextMenuPath, openContextMenu, (() => {
              const moments = selectedGameId ? getMissedMoments(selectedGameId) : [];
              return moments.length > 0 ? moments.reduce((a, b) => a.loss > b.loss ? a : b).path : undefined;
            })()),
          ]),
          // Active retrospection panel — placed after the move list, before analysis summaries.
          // Mirrors lichess-org/lila: ui/analyse/src/view/tools.ts
          //   retroView(ctrl) || explorerView(ctrl) || practiceView(ctrl)
          renderRetroStrip({
            retro:             ctrl.retro,
            navigate,
            redraw,
            uciToSan,
            onRevealGuidance:  () => { ctrl.retro?.revealGuidance(); syncArrow(); redraw(); },
            onClose:           toggleRetro,
            getEvalDepth:      () => currentEval.depth,
          }),
          // Analysis summary and puzzle finder — hidden during active retrospection.
          // These are analysis-complete result panels; they conflict with the focused
          // retro solve mode and match the Lichess pattern of retro replacing explorer/tool panels.
          // Mirrors lichess-org/lila: ui/analyse/src/view/tools.ts
          //   retroView(ctrl) || explorerView(ctrl) || practiceView(ctrl) — retro is exclusive.
          // Use ternary (not &&) to produce null rather than false when retro is active.
          // Raw Snabbdom h() cannot handle boolean children — false in a children array
          // throws "Cannot create property 'elm' on boolean 'false'" and corrupts the VDOM.
          // Mirrors lichess-org/lila: ui/analyse/src/view/tools.ts LooseVNode intent.
          ctrl.retro ? null : (() => {
            const game = importedGames.find(g => g.id === selectedGameId);
            return renderAnalysisSummary(analysisComplete, evalCache, ctrl.mainline, game?.white ?? 'White', game?.black ?? 'Black');
          })(),
          ctrl.retro ? null : (() => {
            const puzzleDeps: PuzzleRenderDeps = {
              mainline:    ctrl.mainline,
              getEval:     p => evalCache.get(p),
              gameId:      selectedGameId,
              currentPath: ctrl.path,
              engineEnabled, batchAnalyzing, batchState,
              savedPuzzles,
              navigate,
              savePuzzle,
              uciToSan,
              redraw,
            };
            return renderPuzzleCandidates(puzzleDeps);
          })(),
          // Opening explorer — hidden during retrospection (same gate as retro/explorer in Lichess).
          // Mirrors lichess-org/lila: ui/analyse/src/view/tools.ts retroView || explorerView pattern.
          ctrl.retro ? null : renderAnalysisExplorerSection(
            ctrl.node.fen,
            cgInstance,
            (uci: string) => {
              const node = nodeAtPath(ctrl.root, ctrl.path);
              const child = node?.children.find(c => c.uci === uci);
              if (child) navigate(ctrl.path + child.id);
            },
            redraw,
          ),
        ]),

        // Controls — below tools (grid-area: controls)
        // Mirrors lichess-org/lila: ui/analyse/src/view/main.ts div.analyse__controls
        // Controls — navigation only; engine toggle + settings moved to renderCeval() header
        // Mirrors lichess-org/lila: ui/analyse/src/view/main.ts div.analyse__controls (jump buttons)
        h('div.analyse__controls', {
          hook: { insert: vnode => attachScrubListener(vnode.elm as HTMLElement) },
        }, [
          // Eval graph rendered as background behind controls on mobile.
          // bg:true strips interactivity — graph still tracks current move position.
          renderEvalGraph(ctrl.mainline, ctrl.path, evalCache, navigate, redraw, currentUserColor, reviewDotsUserOnly, true),
          // Action buttons — desktop only (mobile uses .analyse__actions below the move list).
          renderAnalysisControls([
            // Mistake-review entry: available after review completes.
            // Jumps to the position before the first candidate mistake.
            // Mirrors lichess-org/lila: ui/analyse/src/retrospect/retroView.ts entry affordance.
            renderRetroEntry({
              retro:            ctrl.retro,
              analysisComplete,
              batchAnalyzing,
              onToggle:         toggleRetro,
            }),
          ]),
          // Navigation jump buttons — mirrors lichess-org/lila: ui/analyse/src/view/controls.ts .jumps
          // data-icon values: LessThan \ue027 (prev), GreaterThan \ue026 (next)
          h('div.jumps', [
            h('button.fbt', {
              attrs: { 'data-icon': '\ue027', disabled: ctrl.path === '', title: 'Previous move' },
              on: { click: prev },
            }),
            h('button.fbt', {
              attrs: { 'data-icon': '\ue026', disabled: !ctrl.node.children[0], title: 'Next move' },
              on: { click: next },
            }),
          ]),
        ]),

        // Mobile-only action buttons row — sits below the move list.
        // Hidden on desktop via CSS; desktop shows these inside .analyse__controls.
        h('div.analyse__actions', [
          renderAnalysisControls([
            renderRetroEntry({
              retro:            ctrl.retro,
              analysisComplete,
              batchAnalyzing,
              onToggle:         toggleRetro,
            }),
          ]),
        ]),

        // Underboard — below board (grid-area: under)
        // Import controls moved to header panel; game list appears here and in the header.
        h('div.analyse__underboard', [
          renderEvalGraph(ctrl.mainline, ctrl.path, evalCache, navigate, redraw, currentUserColor, reviewDotsUserOnly),
          renderGameList(deps),
        ]),

        renderKeyboardHelp(),
      ]);
    case 'games':    return renderGamesView(deps);
    case 'puzzles':
      initPuzzlePage('library');
      void loadLibraryCounts(redraw);
      return renderPuzzleLibrary(redraw);
    case 'puzzle-round': {
      const puzzleId = route.params.id ?? '';
      initPuzzlePage('round', puzzleId);
      // openPuzzleRound is called from onChange, not here — calling it
      // in the render function causes an infinite redraw loop because
      // it calls redraw() internally which re-triggers this render.
      return renderPuzzleRound(redraw);
    }
    case 'openings': return renderOpeningsPage(redraw);
    case 'stats':    return h('h1', 'Stats Page');
    case 'admin':    return renderAdminPage(redraw);
    default:         return h('h1', 'Home');
  }
}

/**
 * Dev utility: wipe all IndexedDB stores and reset in-memory state to defaults.
 * Reloads the page so the app boots clean.
 */
async function resetAllData(): Promise<void> {
  if (!confirm('Clear all local Patzer Pro data? This removes imported games, saved analysis, saved puzzle candidates, and local board/settings preferences from this browser.')) return;
  await clearAllIdbData();
  clearBoardLocalData();
  window.location.reload();
}

function view(route: Route): VNode {
  return h('div#shell', [
    renderHeader({
      route,
      importedGames,
      selectedGameId,
      analyzedGameIds,
      missedTacticGameIds,
      importCallbacks,
      onSelectGame: (id, pgn) => { selectedGameId = id; loadGame(pgn); },
      renderGameRow: renderCompactGameRow,
      gameSourceUrl,
      downloadPgn,
      resetAllData,
      onFlipBoard: flip,
      redraw,
    } satisfies HeaderDeps),
    h('main', [routeContent(route)]),
    renderContextMenu(),
    puzzleCreateMsg ? h('div.puzzle-create-toast', puzzleCreateMsg) : null,
    h('footer.app-legal', [
      h('span', 'Patzer Pro source is available under AGPL.'),
      h('a', {
        attrs: {
          href: PUBLIC_SOURCE_URL,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }, 'Source Code'),
      h('span.app-legal__sep', '•'),
      h('a', {
        attrs: {
          href: PUBLIC_LICENSE_URL,
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }, 'License'),
    ]),
    renderPvBoard(),
  ]);
}

// Mousewheel navigation over the board — scroll down = next move, up = prev move.
// Adapted from lichess-org/lila: ui/lib/src/view/controls.ts stepwiseScroll
// Pixel-mode (trackpad) accumulates delta and requires ≥10px before stepping,
// preventing accidental triggers on inertia scrolls.
let wheelPixelAccum = 0;
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
  wheelPixelAccum = 0;
  if (e.deltaY > 0) next();
  else prev();
  redraw();
}, { passive: false });

// --- Bootstrap ---

const app = document.getElementById('app')!;
let currentRoute = current();
// vnode starts as the container element; becomes a VNode after the first patch.
// Typed as the union that Snabbdom's patch() accepts as its first argument.
let vnode: Parameters<typeof patch>[0] = app;

function redraw(): void {
  vnode = patch(vnode, view(currentRoute));
}

// Clears IDB analysis and removes game from in-memory tracking sets.
// Injected into initPgnExport so the re-analyze flow can fully reset a game.
function clearGameAnalysis(gameId: string): void {
  void clearAnalysisFromIdb(gameId);
  analyzedGameIds.delete(gameId);
  missedTacticGameIds.delete(gameId);
  clearMissedMoments(gameId);
}

// Wire all modules before the first render so that view() never calls an
// uninitialised module (which would throw when refreshing on a non-root route).
initGround({
  getCtrl:          () => ctrl,
  navigate,
  getImportedGames: () => importedGames,
  getSelectedGameId:() => selectedGameId,
  redraw,
});
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
});
initEngine({
  getCtrl:       () => ctrl,
  getCgInstance: () => cgInstance,
  redraw,
});
initBatch({
  getCtrl:              () => ctrl,
  getSelectedGameId:    () => selectedGameId,
  getImportedGames:     () => importedGames,
  analyzedGameIds,
  missedTacticGameIds,
  analyzedGameAccuracy,
  getUserColor,
  redraw,
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
    void saveAnalysisToIdb('complete', gameId, nodes, analysisDepth);
  }, LIVE_EVAL_SAVE_DELAY_MS);
});

initReviewQueue({
  analyzedGameIds,
  missedTacticGameIds,
  analyzedGameAccuracy,
  getUserColor,
  redraw,
});
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

onChange(route => {
  currentRoute = route;
  // While the background review queue is running, don't allow route changes to
  // trigger loadGame() — the queue drives all game loading.
  if (isBulkRunning() && (route.name === 'analysis-game' || route.name === 'analysis')) {
    selectedGameId = route.params?.['id'] ?? selectedGameId;
    vnode = patch(vnode, view(currentRoute));
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
    void openPuzzleRound(puzzleId, redraw);
    return; // openPuzzleRound calls redraw() when ready
  }
  if (route.name === 'openings') {
    initOpeningsPage('library');
    invalidateCollections();
  }
  if (route.name === 'analysis-game') {
    const id = route.params['id'] ?? '';
    const game = importedGames.find(g => g.id === id);
    if (game && game.id !== selectedGameId) {
      selectedGameId = game.id;
      loadGame(game.pgn); // calls redraw() which patches with the updated state
      return;
    }
  }
  vnode = patch(vnode, view(currentRoute));
});

// First render — all modules are initialised so view() is safe to call.
vnode = patch(app, view(currentRoute));

// If the initial route is openings, initialise page state.
if (currentRoute.name === 'openings') {
  initOpeningsPage('library');
  invalidateCollections();
}

// If the initial route is a puzzle round, load it now.
if (currentRoute.name === 'puzzle-round') {
  const puzzleId = currentRoute.params['id'] ?? '';
  void openPuzzleRound(puzzleId, redraw);
}

// --- Startup: restore persisted saved puzzle candidates ---
void loadPuzzlesFromIdb().then(puzzles => {
  setSavedPuzzles(puzzles);
  redraw();
});

// --- Startup: restore persisted games ---
// Runs after the initial render so the board already exists when syncBoard is called.
// Mirrors the deferred-load pattern of lichess-org/lila: ui/analyse/src/idbTree.ts merge()
void loadGamesFromIdb().then(stored => {
  gamesLibraryLoaded = true;
  if (!stored || stored.games.length === 0) { redraw(); return; }
  importedGames = stored.games;
  // Restore gameIdCounter so new imports don't collide with existing ids.
  const maxId = Math.max(...stored.games.map(g => parseInt(g.id.replace('game-', '')) || 0));
  restoreGameIdCounter(maxId);
  // When deep-linking to analysis-game at boot, prefer the route's id over the
  // previously selected game so the URL resolves to the intended game immediately.
  const routeGameId = currentRoute.name === 'analysis-game'
    ? (currentRoute.params['id'] ?? null)
    : null;
  const toLoad = (routeGameId !== null ? stored.games.find(g => g.id === routeGameId) : undefined)
    ?? stored.games.find(g => g.id === stored.selectedId)
    ?? stored.games[0]!;
  selectedGameId = toLoad.id;
  selectedGamePgn = toLoad.pgn;
  ctrl = new AnalyseCtrl(pgnToTree(toLoad.pgn));
  clearEvalCache();
  resetCurrentEval();
  // Restore analysis path — ctrl.setPath is a no-op if the path is invalid for this tree
  if (stored.path) ctrl.setPath(stored.path);
  syncBoardAndArrow();
  redraw();
  // Restore persisted engine analysis for this game.
  // Pass restoreGeneration so the guard in loadAndRestoreAnalysis can detect a rapid
  // game switch that occurs before this async restore completes.
  void loadAndRestoreAnalysis(toLoad.id, restoreGeneration);
});

// When mistake-detection settings change, rebuild the active retro session so
// the new parameters take effect immediately without requiring a page reload.
onRetroConfigChange(rebuildRetroSession);
