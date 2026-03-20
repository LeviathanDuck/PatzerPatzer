import { init, classModule, attributesModule, eventListenersModule, h, type VNode } from 'snabbdom';
import { AnalyseCtrl } from './analyse/ctrl';
import {
  applyBoardTheme, applyBoardZoom, applyPieceSet,
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
  engineEnabled,
  evalCurrentPosition,
  syncArrow,
  initEngine,
  type PositionEval,
} from './engine/ctrl';
import {
  batchAnalyzing,
  batchState, setBatchState,
  analysisComplete, setAnalysisComplete,
  reviewDepth,
  resetBatchState,
  startBatchWhenReady,
  detectMissedTactics,
  initBatch,
} from './engine/batch';
import {
  cgInstance, setOrientation,
  syncBoard, syncBoardAndArrow, flip,
  completeMove, uciToSan,
  renderBoard, renderPromotionDialog, renderPlayerStrips,
  initGround,
} from './board/index';
import {
  renderCeval, renderPvBox, renderPvBoard, renderEngineSettings,
  initCevalView,
} from './ceval/view';
import {
  renderAnalysisControls, downloadPgn, initPgnExport,
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
import { renderHeader, type HeaderDeps } from './header/index';
import {
  type ImportedGame, restoreGameIdCounter,
} from './import/types';
import {
  ANALYSIS_VERSION, clearAnalysisFromIdb, loadAnalysisFromIdb, loadGamesFromIdb,
  loadPuzzlesFromIdb, saveGamesToIdb, savedPuzzles, savePuzzle,
  setSavedPuzzles, type StoredNodeEntry,
} from './idb/index';
import { current, onChange, type Route } from './router';
import { pathInit } from './tree/ops';
import { pgnToTree } from './tree/pgn';

console.log('Patzer Pro');

const patch = init([classModule, attributesModule, eventListenersModule]);

// Callbacks injected into import adapters so they can mutate app state
// without creating a circular import on main.ts.
const importCallbacks = {
  addGames(games: ImportedGame[], first: ImportedGame): void {
    importedGames = [...importedGames, ...games];
    selectedGameId = first.id;
    void saveGamesToIdb(importedGames, selectedGameId, ctrl.path);
    loadGame(first.pgn); // calls redraw
  },
  redraw(): void { redraw(); },
};

const SAMPLE_PGN = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7';

let importedGames: ImportedGame[] = [];
let selectedGameId: string | null = null;
let selectedGamePgn: string | null = null;

const analyzedGameIds:      Set<string>                                              = new Set();
const missedTacticGameIds:  Set<string>                                              = new Set();
const analyzedGameAccuracy: Map<string, { white: number | null; black: number | null }> = new Map();

function getActivePgn(): string {
  return selectedGamePgn ?? SAMPLE_PGN;
}

// --- Analysis controller (persists for the session) ---

let ctrl = new AnalyseCtrl(pgnToTree(getActivePgn()));

/**
 * Load a game into the analysis board by PGN.
 * Resets analysis state and re-evaluates if engine is on.
 */
function loadGame(pgn: string | null): void {
  selectedGamePgn = pgn;
  ctrl = new AnalyseCtrl(pgnToTree(getActivePgn()));
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
  // Restore persisted analysis from IndexedDB; falls back to live eval if nothing stored
  if (selectedGameId) void loadAndRestoreAnalysis(selectedGameId);
  else evalCurrentPosition();
  redraw();
}

/**
 * Build the nodes record from the current mainline evalCache for IDB serialization.
 */
function buildAnalysisNodes(): Record<string, StoredNodeEntry> {
  const nodes: Record<string, StoredNodeEntry> = {};
  let path = '';
  for (let i = 1; i < ctrl.mainline.length; i++) {
    const node = ctrl.mainline[i]!;
    path += node.id;
    const ev = evalCache.get(path);
    if (ev) {
      const entry: StoredNodeEntry = { nodeId: node.id, path, fen: node.fen };
      if (ev.cp    !== undefined) entry.cp    = ev.cp;
      if (ev.mate  !== undefined) entry.mate  = ev.mate;
      if (ev.best  !== undefined) entry.best  = ev.best;
      if (ev.loss  !== undefined) entry.loss  = ev.loss;
      if (ev.delta !== undefined) entry.delta = ev.delta;
      nodes[path] = entry;
    }
  }
  return nodes;
}

/**
 * Load stored analysis for a game into evalCache and restore completion state.
 * Mirrors the IndexedDB restore pattern in lichess-org/lila: ui/analyse/src/idbTree.ts
 */
async function loadAndRestoreAnalysis(gameId: string): Promise<void> {
  const stored = await loadAnalysisFromIdb(gameId);
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
    evalCache.set(entry.path, ev);
  }
  if (stored.status === 'complete') {
    analyzedGameIds.add(gameId);
    setAnalysisComplete(true);
    setBatchState('complete');
    const game = importedGames.find(g => g.id === gameId);
    const userColor = game ? getUserColor(game) : null;
    if (detectMissedTactics(userColor)) missedTacticGameIds.add(gameId);
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
  redraw();
}


// --- Navigation ---

// --- Navigation ---
// Single navigation helper: every path change must go through here so that
// board, eval arrow, graph, and move list always stay in sync.
// Mirrors the userJump pattern in lichess-org/lila: ui/analyse/src/ctrl.ts

function navigate(path: string): void {
  ctrl.setPath(path);
  syncBoard();
  evalCurrentPosition(); // updates currentEval, arrow, and triggers threat eval if on
  void saveGamesToIdb(importedGames, selectedGameId, ctrl.path);
  redraw();
  scrollActiveIntoView();
}

// Keep the active move visible in the move list after each navigation step.
// Mirrors lichess-org/lila: ui/analyse/src/view/moves.ts (tree scroll helper)
function scrollActiveIntoView(): void {
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>('.move.active')?.scrollIntoView({ block: 'nearest' });
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

// Mirrors lichess-org/lila: ui/analyse/src/control.ts first / last
function first(): void {
  navigate('');
}

function last(): void {
  // Path to the final mainline node = all non-root node IDs concatenated
  navigate(ctrl.mainline.slice(1).reduce((acc, n) => acc + n.id, ''));
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
    redraw,
  };
  switch (route.name) {
    case 'analysis-game':
      return h('h1', `Analysis Game: ${route.params['id']}`);
    case 'analysis':
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
        renderEvalBar(engineEnabled, currentEval),

        // Tools — right column (grid-area: tools)
        // Mirrors lichess-org/lila: ui/analyse/src/view/main.ts div.analyse__tools
        h('div.analyse__tools', [
          // Engine header: toggle + pearl + engine-name/status + settings gear
          // Mirrors lichess-org/lila: ui/lib/src/ceval/view/main.ts renderCeval()
          renderCeval(),
          // Engine settings panel — sits directly below header, above PV lines
          // Mirrors lichess-org/lila: renderCevalSettings() position
          renderEngineSettings(),
          // PV lines — below header (and settings when open)
          renderPvBox(),
          // Move list with internal scroll — mirrors div.analyse__moves.areplay
          h('div.analyse__moves', [renderMoveList(ctrl.root, ctrl.path, p => evalCache.get(p), navigate)]),
          (() => {
            const game = importedGames.find(g => g.id === selectedGameId);
            return renderAnalysisSummary(analysisComplete, evalCache, ctrl.mainline, game?.white ?? 'White', game?.black ?? 'Black');
          })(),
          renderPuzzleCandidates({
            mainline:       ctrl.mainline,
            getEval:        p => evalCache.get(p),
            gameId:         selectedGameId,
            currentPath:    ctrl.path,
            engineEnabled,
            batchAnalyzing,
            batchState,
            savedPuzzles,
            navigate,
            savePuzzle,
            uciToSan,
            redraw,
          } satisfies PuzzleRenderDeps),
        ]),

        // Controls — below tools (grid-area: controls)
        // Mirrors lichess-org/lila: ui/analyse/src/view/main.ts div.analyse__controls
        // Controls — navigation only; engine toggle + settings moved to renderCeval() header
        // Mirrors lichess-org/lila: ui/analyse/src/view/main.ts div.analyse__controls (jump buttons)
        h('div.analyse__controls', [
          h('button', { on: { click: prev }, attrs: { disabled: ctrl.path === '' } }, '← Prev'),
          h('button', { on: { click: flip } }, 'Flip'),
          h('button', { on: { click: next }, attrs: { disabled: !ctrl.node.children[0] } }, 'Next →'),
        ]),

        // Underboard — below board (grid-area: under)
        // Import controls moved to header panel; game list appears here and in the header.
        h('div.analyse__underboard', [
          renderEvalGraph(ctrl.mainline, ctrl.path, evalCache, navigate),
          renderAnalysisControls(),
          renderGameList(deps),
        ]),

        renderKeyboardHelp(),
      ]);
    case 'games':    return renderGamesView(deps);
    case 'puzzles':  return h('h1', 'Puzzles Page');
    case 'openings': return h('h1', 'Openings Page');
    case 'stats':    return h('h1', 'Stats Page');
    default:         return h('h1', 'Home');
  }
}

/**
 * Dev utility: wipe all IndexedDB stores and reset in-memory state to defaults.
 * Reloads the page so the app boots clean.
 */
async function resetAllData(): Promise<void> {
  if (!confirm('Clear all local Patzer Pro data? This removes imported games, saved analysis, puzzles, and local board/settings preferences from this browser.')) return;
  try {
    const db = await openGameDb();
    const tx = db.transaction(['game-library', 'puzzle-library', 'analysis-library'], 'readwrite');
    tx.objectStore('game-library').clear();
    tx.objectStore('puzzle-library').clear();
    tx.objectStore('analysis-library').clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('[reset] IDB clear failed', e);
  }
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
      redraw,
    } satisfies HeaderDeps),
    h('main', [routeContent(route)]),
    renderPvBoard(),
  ]);
}

// Mousewheel navigation over the board — scroll down = next move, up = prev move.
// Adapted from lichess-org/lila: ui/lib/src/view/controls.ts stepwiseScroll
// Pixel-mode (trackpad) accumulates delta and requires ≥10px before stepping,
// preventing accidental triggers on inertia scrolls.
let wheelPixelAccum = 0;
document.addEventListener('wheel', (e: WheelEvent) => {
  if (e.ctrlKey) return; // allow pinch-zoom
  const boardWrap = document.querySelector('.analyse__board-wrap');
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
initCevalView({
  getCtrl:  () => ctrl,
  navigate,
  redraw,
});
initPgnExport({
  getCtrl:            () => ctrl,
  getImportedGames:   () => importedGames,
  getSelectedGameId:  () => selectedGameId,
  buildAnalysisNodes,
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
  buildAnalysisNodes,
  getUserColor,
  redraw,
});
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
  vnode = patch(vnode, view(currentRoute));
});

// First render — all modules are initialised so view() is safe to call.
vnode = patch(app, view(currentRoute));

// --- Startup: restore persisted puzzles ---
void loadPuzzlesFromIdb().then(setSavedPuzzles);

// --- Startup: restore persisted games ---
// Runs after the initial render so the board already exists when syncBoard is called.
// Mirrors the deferred-load pattern of lichess-org/lila: ui/analyse/src/idbTree.ts merge()
void loadGamesFromIdb().then(stored => {
  if (!stored || stored.games.length === 0) return;
  importedGames = stored.games;
  // Restore gameIdCounter so new imports don't collide with existing ids.
  const maxId = Math.max(...stored.games.map(g => parseInt(g.id.replace('game-', '')) || 0));
  restoreGameIdCounter(maxId);
  // Restore the previously selected game, or fall back to the first one
  const toLoad = stored.games.find(g => g.id === stored.selectedId) ?? stored.games[0]!;
  selectedGameId = toLoad.id;
  selectedGamePgn = toLoad.pgn;
  ctrl = new AnalyseCtrl(pgnToTree(toLoad.pgn));
  clearEvalCache();
  resetCurrentEval();
  // Restore analysis path — ctrl.setPath is a no-op if the path is invalid for this tree
  if (stored.path) ctrl.setPath(stored.path);
  syncBoardAndArrow();
  redraw();
  // Restore persisted engine analysis for this game
  void loadAndRestoreAnalysis(toLoad.id);
});
