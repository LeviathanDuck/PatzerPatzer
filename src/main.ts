import { init, classModule, attributesModule, eventListenersModule, h, type VNode } from 'snabbdom';
import { AnalyseCtrl } from './analyse/ctrl';
import {
  applyBoardTheme, applyBoardZoom, applyPieceSet,
  boardWheelNavEnabled,
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
  currentEval,
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
  clearPuzzleCandidates, renderPuzzleCandidates, renderFindPuzzlesButton,
  type PuzzleRenderDeps,
} from './puzzles/extract';
import { renderHeader, type HeaderDeps } from './header/index';
import {
  type ImportedGame, restoreGameIdCounter,
} from './import/types';
import {
  ANALYSIS_VERSION, clearAllIdbData, clearAnalysisFromIdb, loadAnalysisFromIdb, loadGamesFromIdb,
  loadPuzzlesFromIdb, saveGamesToIdb, savedPuzzles, savePuzzle,
  setSavedPuzzles,
} from './idb/index';
import { current, onChange, type Route } from './router';
import { deleteNodeAt, nodeAtPath, pathInit, promoteAt, pruneVariations } from './tree/ops';
import { pgnToTree } from './tree/pgn';
import { buildRetroCandidates } from './analyse/retro';
import { makeRetroCtrl } from './analyse/retroCtrl';
import { renderRetroEntry, renderRetroStrip } from './analyse/retroView';

console.log('Patzer Pro');

const patch = init([classModule, attributesModule, eventListenersModule]);
const PUBLIC_SOURCE_URL = 'https://github.com/LeviathanDuck/PatzerPatzer';
const PUBLIC_LICENSE_URL = `${PUBLIC_SOURCE_URL}/blob/main/LICENSE`;

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
  contextMenuPos  = { x: e.clientX, y: e.clientY };
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
    style: { left: contextMenuPos.x + 'px', top: contextMenuPos.y + 'px' },
    on: { contextmenu: (e: Event) => e.preventDefault() },
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
  ]);
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
  // Restore persisted analysis from IndexedDB; falls back to live eval if nothing stored.
  // Increment restoreGeneration first so any in-flight restore from the previous game
  // sees a stale generation value and discards its result.
  restoreGeneration++;
  if (selectedGameId) void loadAndRestoreAnalysis(selectedGameId, restoreGeneration);
  else evalCurrentPosition();
  redraw();
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
  ctrl.setPath(path);
  // Notify retrospection of the path change — offTrack detection, later win/fail.
  // Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts jump() retro.onJump() call.
  ctrl.retro?.onJump(path);
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
    void saveGamesToIdb(importedGames, selectedGameId, ctrl.path);
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
    void saveGamesToIdb(importedGames, selectedGameId, ctrl.path);
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
  const candidates = buildRetroCandidates(
    ctrl.mainline,
    p => evalCache.get(p),
    selectedGameId,
    userColor ?? null,
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
          h('div.analyse__moves', [
            renderMoveList(ctrl.root, ctrl.path, p => evalCache.get(p), navigate, deleteVariation, contextMenuPath, openContextMenu),
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
              savedPuzzles, navigate, savePuzzle, uciToSan, redraw,
            };
            return renderPuzzleCandidates(puzzleDeps);
          })(),
        ]),

        // Controls — below tools (grid-area: controls)
        // Mirrors lichess-org/lila: ui/analyse/src/view/main.ts div.analyse__controls
        // Controls — navigation only; engine toggle + settings moved to renderCeval() header
        // Mirrors lichess-org/lila: ui/analyse/src/view/main.ts div.analyse__controls (jump buttons)
        h('div.analyse__controls', [
          h('button', { on: { click: prev }, attrs: { disabled: ctrl.path === '' } }, '← Prev'),
          h('button', { on: { click: flip } }, 'Flip'),
          h('button', { on: { click: next }, attrs: { disabled: !ctrl.node.children[0] } }, 'Next →'),
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
        ]),

        // Underboard — below board (grid-area: under)
        // Import controls moved to header panel; game list appears here and in the header.
        h('div.analyse__underboard', [
          renderEvalGraph(ctrl.mainline, ctrl.path, evalCache, navigate),
          renderGameList(deps),
        ]),

        renderKeyboardHelp(),
      ]);
    case 'games':    return renderGamesView(deps);
    case 'puzzles': {
      // Minimal honest saved-puzzle list — displays existing saved puzzles from IDB.
      // Full puzzle-solving session is a future task; this task makes the route honest.
      if (savedPuzzles.length === 0) {
        return h('div.puzzles-empty', [
          h('h2', 'Saved Puzzles'),
          h('p', 'No saved puzzles yet.'),
          h('p', 'Review games with the engine to find missed tactics, then save them here.'),
          h('a', { attrs: { href: '#/games' } }, 'Go to My Games'),
        ]);
      }
      return h('div.puzzles-list', [
        h('h2', `Saved Puzzles (${savedPuzzles.length})`),
        h('ul.puzzles-list__items', savedPuzzles.map((p) => {
          const moveNum  = Math.ceil(p.ply / 2);
          const isWhite  = p.ply % 2 === 1;
          const moveTxt  = `${moveNum}${isWhite ? '.' : '…'} ${p.san}`;
          const lossPct  = Math.round(p.loss * 100);
          const href     = p.gameId ? `#/analysis/${p.gameId}` : '#/analysis';
          return h('li.puzzles-list__item', [
            h('span.puzzles-list__move', moveTxt),
            h('span.puzzles-list__loss', `−${lossPct}%`),
            p.gameId
              ? h('a.puzzles-list__link', { attrs: { href } }, 'View in game')
              : null,
          ]);
        })),
      ]);
    }
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
      redraw,
    } satisfies HeaderDeps),
    h('main', [routeContent(route)]),
    renderContextMenu(),
    h('footer.app-legal', [
      h('span', 'Patzer Pro source is available under AGPL-3.0-or-later.'),
      h('span', 'No warranty.'),
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
  // When deep-linking to a specific game, load it before rendering.
  // loadGame() calls redraw() which patches via currentRoute, so return early
  // to avoid a redundant second patch in this handler.
  // Mirrors the pattern in lichess-org/lila: ui/analyse/src/ctrl.ts where the
  // controller is always initialized with the correct game data before rendering.
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

// --- Startup: restore persisted puzzles ---
void loadPuzzlesFromIdb().then(setSavedPuzzles);

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
