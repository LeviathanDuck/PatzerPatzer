# Patzer Pro — Architecture Reference

Date: 2026-03-19 (updated — Steps 1/2/3/4/7 complete)
Based on: full read of src/main.ts (4241 lines original; ~3061 lines after Steps 1/2/3/4/7),
all supporting files, Lichess reference source

This document describes the system in two states: current reality and the intended target after
the refactor described in REFACTOR_PLAN.md. All current-state claims are grounded in actual code.

---

## Part 1: Current Reality

### 1.1 Module structure (as-built)

```
src/
  main.ts              — ~3061 lines (reduced from 4241): bootstrap, route dispatch,
                         game library state, IDB persistence, engine, board sync, nav,
                         analysis rendering, import panel render, header/shell render.
                         Remaining subsystems: B, C, D, E, F, G, H, I, J, K, N, O.
  router.ts            — hash router: 47 lines, exports Route, current(), onChange()

  engine/
    winchances.ts      — ✓ EXTRACTED (Step 1): rawWinChances(), evalWinChances(),
                         WIN_CHANCE_MULTIPLIER, WinChancesEval interface

  board/
    cosmetics.ts       — ✓ EXTRACTED (Step 2): zoom/theme/piece set/filters, apply
                         functions, renderBoardSettings(), renderFilterSlider(),
                         saveBoardZoom(). Boot side-effects run at import time.

  import/
    types.ts           — ✓ EXTRACTED (Step 3/4): ImportedGame interface, nextGameId(),
                         restoreGameIdCounter(), parsePgnHeader(), parseRating(),
                         timeClassFromTimeControl(), ImportCallbacks interface
    filters.ts         — ✓ EXTRACTED (Step 4): importFilters state object, ImportSpeed,
                         ImportDateRange, filterGamesByDate()
    chesscom.ts        — ✓ EXTRACTED (Step 4): chesscom state, fetchChesscomGames(),
                         importChesscom()
    lichess.ts         — ✓ EXTRACTED (Step 4): lichess state, fetchLichessGames(),
                         importLichess()
    pgn.ts             — ✓ EXTRACTED (Step 4): pgnState, importPgn()

  games/
    view.ts            — ✓ EXTRACTED (Step 7, run early): renderGamesView(),
                         renderGameList(), all filter/sort state, GamesViewDeps interface.
                         Main.ts provides deps via gamesViewDeps() factory.

  analyse/
    ctrl.ts            — AnalyseCtrl: cursor-only (path, node, nodeList, mainline)
  ceval/
    protocol.ts        — StockfishProtocol: UCI wrapper, runs on MAIN THREAD (182 lines)
    worker.ts          — stub: 17 lines, posts { type: 'ready' }, does nothing else
  tree/
    types.ts           — TreeNode, TreePath, EvalScore, MoveClassification, PuzzleCandidate
    ops.ts             — tree traversal and mutation (addNode, childById, nodeAtPath, etc.)
    pgn.ts             — PGN → TreeNode tree builder (uses chessops)
  styles/
    main.scss          — all CSS: ~1800+ lines
```

The 15 subsystems inside main.ts and their approximate line ranges:

| ID | Subsystem | Line range | Lines |
|----|-----------|-----------|-------|
| A | Board Cosmetics (theme, piece set, zoom, filters) | ~124–248 | ~124 |
| B | Game Library State + Metadata Helpers | ~250–295, ~3527–3545 | ~150 |
| C | IDB Persistence (3 stores) | ~297–440 | ~143 |
| D | Engine Lifecycle (init, enable, toggle, ready) | ~519–640 | ~121 |
| E | Engine Evaluation — Live Interactive | ~641–987 | ~346 |
| F | Batch Review (queue, advance, classify) | ~988–1265 | ~277 |
| G | Board Sync + Chessground Init | ~1266–1610 | ~344 |
| H | Navigation (navigate, next, prev, branch) | ~1611–1760 | ~150 |
| I | App Shell + Routing UI (nav, header, menus) | ~1761–2130 | ~369 |
| J | Analysis Rendering (move list, eval bar, graph, ceval box) | ~2131–3015 | ~884 |
| K | Puzzle Extraction + Display | ~3016–3210 | ~194 |
| L | Game Import (Chess.com, Lichess, PGN paste) | ~3211–3760 | ~549 |
| M | Games View (table, sort, filter) | ~3761–3960 | ~199 |
| N | Keyboard Navigation | ~4000–4150 | ~150 |
| O | Bootstrap + Route Dispatch | ~4151–4241 | ~90 |

### 1.2 State model — current

All state is declared as module-level `let` variables in main.ts. There is no state container
object. Lifetime is the browser session (page load to reload).

**Game library:**
- `importedGames: ImportedGame[]` — all imported games in memory
- `selectedGameId: string | null` — id of game in analysis view
- `selectedGamePgn: string | null` — PGN string of current game
- `gameIdCounter: number` — sequential counter, NOT persisted (known collision bug)

**Analysis cursor:**
- `ctrl: AnalyseCtrl` — cursor-only: holds root tree, path, node, nodeList, mainline
- Replaced by `new AnalyseCtrl(pgnToTree(...))` on each game load

**Engine:**
- `protocol: StockfishProtocol` — singleton, session lifetime
- `engineEnabled: boolean`, `engineReady: boolean`, `engineInitialized: boolean`
- `engineSearchActive: boolean` — true between `go` and `bestmove`
- `awaitingStopBestmove: boolean` — single boolean, should be counter (known issue)
- `pendingEval: boolean` — user navigated while engine was computing

**Eval state:**
- `evalCache: Map<TreePath, PositionEval>` — batch results, path-keyed, cleared on game load
- `currentEval: PositionEval` — live engine output for current position
- `evalNodePath: string` — path the engine is computing (not scoped to game id — known bug)
- `evalNodePly: number`, `evalParentPath: string`
- `pendingLines: EvalLine[]` — accumulates secondary PV lines during search

**Batch review:**
- `batchQueue: BatchItem[]`, `batchDone: number`, `batchAnalyzing: boolean`
- `batchState: 'idle' | 'analyzing' | 'complete'`
- `reviewDepth: number` (default 16, not persisted), `analysisDepth: number` (default 30)
- `multiPv: number` (default 3), `analysisRunning: boolean`, `analysisComplete: boolean`

**Post-analysis:**
- `analyzedGameIds: Set<string>` — session-only set of completed games
- `missedTacticGameIds: Set<string>` — session-only
- `analyzedGameAccuracy: Map<string, {white, black}>` — volatile, not persisted (known issue)
- `puzzleCandidates: PuzzleCandidate[]` — volatile, extracted from current game
- `savedPuzzles: PuzzleCandidate[]` — persisted to IDB

**Board/UI:**
- `cgInstance: CgApi | undefined` — Chessground API reference
- `orientation: 'white' | 'black'`
- `pvBoard: {fen, uci} | null` — hover preview board state
- `boardZoom`, `boardTheme`, `pieceSet`, `boardFilters` — localStorage-backed
- Panel open/close flags: `showImportPanel`, `showEngineSettings`, `showGlobalMenu`,
  `showBoardSettings`, `pvMode`, `pvBoardActive`, etc.
- Import form state: `importPlatform`, `chesscomUsername`, `lichessUsername`,
  `importFilterSpeeds`, `importFilterDateRange`, `importLoading`, `importError`

### 1.3 IDB persistence — current

DB name: `patzer-pro`, version 3, opened via `openGameDb()` singleton.

Three object stores:

| Store | Key | Contents |
|-------|-----|----------|
| `game-library` | `'imported-games'` | `{ games: ImportedGame[], selectedId, path }` |
| `analysis-library` | `gameId` | `{ gameId, analysisVersion, analysisDepth, status, updatedAt, nodes }` |
| `puzzle-library` | `'saved-puzzles'` | `PuzzleCandidate[]` |

`ANALYSIS_VERSION = 2` guards against loading stale IDB records after schema changes.

Write triggers:
- `saveGamesToIdb()` — every navigation and game load
- `saveAnalysisToIdb(status)` — after each batch position ('partial') and on completion
- `savePuzzlesToIdb()` — when a puzzle is saved

Read triggers (startup only):
- `loadGamesFromIdb()` — restores `importedGames`, `selectedGameId`, boots `ctrl`
- `loadAndRestoreAnalysis(gameId)` — restores `evalCache` for most recently loaded game
- `loadPuzzlesFromIdb()` — restores `savedPuzzles`

### 1.4 Rendering pipeline — current

```
State mutation
    → redraw()
    → vnode = patch(vnode, view(currentRoute))
    → view() calls renderHeader(route) + routeContent(route)
    → routeContent() dispatches to subsystem render functions
    → Snabbdom diffs old vnode vs new vnode
    → Minimal DOM updates applied
```

Chessground is NOT re-rendered via Snabbdom on navigation. Updates go through:
- `syncBoard()` — sets FEN, lastMove, movable dests via `cgInstance.set()`
- `syncArrow()` / `syncArrowDebounced()` — sets autoShapes via `cgInstance.set()`

The Chessground element uses `key: 'board'` in the Snabbdom vnode so it is never unmounted.
The `insert` hook fires exactly once (Chessground initialization). This is the correct pattern.

During batch analysis, `redraw()` is throttled: batch engine lines do not call `redraw()` inside
`parseEngineLine()` (guarded by `!batchAnalyzing`). Only `advanceBatch()` calls `redraw()`.

### 1.5 Engine lifecycle — current

Stockfish 18 smallnet runs on the MAIN THREAD via Emscripten pthreads with SharedArrayBuffer.
The `worker.ts` stub is not connected. `StockfishProtocol` in `ceval/protocol.ts` calls
`module.uci()` directly.

Init sequence:
```
toggleEngine()
    → engineEnabled = true
    → protocol.init('/stockfish-web')
        → dynamic import sf_18_smallnet.js
        → allocate SharedArrayBuffer (1536 pages = 96 MB)
        → makeModule() (Emscripten init)
        → fetch NNUE file, setNnueBuffer
        → send 'uci'
    → onMessage() receives UCI responses
        → 'uciok': send Threads, Hash, 'ucinewgame', 'isready'
        → 'readyok': engineReady = true, start eval or batch
```

UCI message routing is handled by `protocol.onMessage` callback, which calls
`parseEngineLine()` in main.ts. This is a 250-line function that handles both live
interactive eval and batch review with branching on `batchAnalyzing`.

### 1.6 Known structural defects — current

1. `evalNodePath` and `evalCache` are not scoped to a game id. Cross-game contamination
   is possible when the user switches games while the engine is running.
2. `loadAndRestoreAnalysis()` is async with no cancellation token. A rapid game switch
   can cause game A's eval to be written into evalCache while game B is active.
3. `gameIdCounter` starts at 0 on every page load and is never persisted. Games imported
   across sessions will collide at `game-1`, `game-2`, etc.
4. `awaitingStopBestmove` is a single boolean. Rapid stop/start cycles can cause a stale
   bestmove to be processed as a real result.
5. Three render functions (`renderChesscomImport`, `renderLichessImport`, `renderImportFilters`)
   exist in main.ts but are not reachable from any `routeContent` path — they are dead code.
6. The wheel scroll handler queries `.analyse__board-wrap` which does not exist in the DOM.
   The actual wrapping element uses `.analyse__board.main-board`. Wheel navigation is broken.

---

## Part 2: Target Architecture

### 2.1 Design principles

The target architecture is a direct consequence of extracting the 15 subsystems from main.ts
into their natural boundaries. No new patterns are introduced. The state model remains
module-level variables — they are moved to the file that owns them. The Snabbdom/Chessground
rendering pipeline is preserved exactly.

The constraints from CLAUDE.md that govern the target:
- All UI rendered via Snabbdom `h()` — no direct DOM manipulation
- Chessground manages board rendering via `cgInstance.set()` — no Snabbdom on board element
- Engine in a Web Worker (CLAUDE.md requirement, currently violated)
- TypeScript strict mode, no React, no component framework

### 2.2 Target file structure

```
src/
  main.ts                    — ~300–400 lines: bootstrap, route dispatch, top-level
                               event wiring. Owns: redraw(), vnode, app div, keyboard
                               listener, wheel listener, window resize listener.
                               Imports from all extracted modules.

  router.ts                  — unchanged (47 lines, already correct)

  board/
    cosmetics.ts             — ~200 lines: zoom, theme, piece set, filter constants/vars/
                               functions. Exports: applyBoardZoom, applyBoardTheme,
                               applyPieceSet, setFilter, resetFilters, boardZoom,
                               boardTheme, pieceSet, boardFilters, all BOARD_*/PIECE_*
                               constants. renderBoardSettings(), renderFilterSlider().
    ground.ts                — ~180 lines: cgInstance, orientation, syncBoard, syncArrow,
                               syncArrowDebounced, flip, bindBoardResizeHandle,
                               renderBoard, renderPlayerStrips, material diff helpers,
                               computeDests, onUserMove, completeMove, completePromotion,
                               renderPromotionDialog. Depends on: ctrl (import), engine eval.

  games/
    library.ts               — ~180 lines: ImportedGame interface, importedGames,
                               selectedGameId, selectedGamePgn, gameIdCounter, SAMPLE_PGN,
                               timeClassFromTimeControl, gameSourceUrl, gameResult,
                               getUserColor, renderCompactGameRow, opponentName,
                               parsePgnHeader, parseRating, saveGamesToIdb,
                               loadGamesFromIdb.
    view.ts                  — ~200 lines: renderGamesView, renderGameList, games view
                               filter/sort state, filterGamesByDate. Depends on: library.ts.

  import/
    chesscom.ts              — ~160 lines: fetchChesscomGames, importChesscom, import form
                               state for Chess.com. Exports: importChesscom(),
                               renderChesscomPanel() (replaces dead renderChesscomImport).
    lichess.ts               — ~140 lines: fetchLichessGames, importLichess, import form
                               state for Lichess. Exports: importLichess(),
                               renderLichessPanel().
    pgn.ts                   — ~80 lines: pgnInput, pgnError, importPgn, renderPgnImport.
    filters.ts               — ~60 lines: importFilterSpeeds, importFilterDateRange,
                               importFilterDateRanges, filterGamesByDate constants.

  engine/
    lifecycle.ts             — ~120 lines: engineEnabled, engineReady, engineInitialized,
                               toggleEngine, startBatchWhenReady, pendingBatchOnReady.
                               Depends on: ceval/protocol.ts (import), ceval/worker.ts.
    eval.ts                  — ~350 lines: evalCache, currentEval, evalNodePath, evalNodePly,
                               evalParentPath, pendingLines, parseEngineLine,
                               evalCurrentPosition, evalThreatPosition, toggleThreatMode,
                               evalBatchItem, startBatchAnalysis, advanceBatch,
                               detectMissedTactics, computeAnalysisSummary,
                               buildArrowShapes, syncArrowDebounced (arrow part only).
                               Depends on: lifecycle.ts, games/library.ts (selectedGameId),
                               analyse/ctrl.ts.
    winchances.ts            — ~40 lines: winningChances, cpToScore, WDL calculation.
                               No external dependencies. Currently inlined in main.ts
                               around lines 487–518.

  analyse/
    ctrl.ts                  — unchanged: cursor-only AnalyseCtrl (~38 lines)
    view.ts                  — ~900 lines: ALL analysis board render functions:
                               renderMoveSpan, renderInlineNodes, renderColumnNodes,
                               renderMoveList, renderEvalBar, renderEvalGraph, renderCeval,
                               renderPvMoves, renderPvBox, renderPvBoard,
                               renderEngineSettings, renderAnalysisControls,
                               renderAnalysisSummary, renderPuzzleCandidates,
                               classifyLoss, moveAccuracyFromDiff, aggregateAccuracy.
                               Depends on: engine/eval.ts, engine/lifecycle.ts,
                               board/cosmetics.ts, board/ground.ts.

  shell/
    nav.ts                   — ~120 lines: renderNav, renderHeader, renderGlobalMenu,
                               closeGlobalMenu, activeSection, navLinks. Import panel
                               dispatch. Depends on: import/*.ts.
    keyboard.ts              — ~150 lines: previousBranch (to be rewritten), nextBranch,
                               nextSibling, prevSibling, playBestMove, renderKeyboardHelp,
                               keyboard event listener binding. Depends on: analyse/ctrl.ts,
                               engine/eval.ts.

  puzzles/
    extract.ts               — ~80 lines: detectMissedTactics, puzzleCandidates,
                               savePuzzlesToIdb, loadPuzzlesFromIdb, renderPuzzleCandidates.
    play.ts                  — ~200 lines: puzzle play UI (Phase 12, not yet implemented).

  idb/
    core.ts                  — ~80 lines: openGameDb(), _idb singleton, IDB store name
                               constants, low-level get/put helpers.

  ceval/
    protocol.ts              — unchanged: StockfishProtocol (182 lines)
    worker.ts                — to be implemented: proper Web Worker bridge

  tree/
    types.ts                 — unchanged
    ops.ts                   — unchanged
    pgn.ts                   — unchanged
```

### 2.3 What remains in main.ts after full extraction

After all 11 extraction steps complete, main.ts will contain only:

1. Imports from all extracted modules
2. `const app = document.getElementById('app')!`
3. `let vnode: VNode`
4. `function redraw()` — calls `patch(vnode, view(currentRoute))`
5. `function view(route)` — calls `renderHeader(route)` + `routeContent(route)`
6. `function routeContent(route)` — dispatches to render functions per route
7. `resetAllData()` — wires all module reset functions
8. Top-level event listener binding (keyboard, wheel, resize)
9. Startup sequence (IDB loads, Chessground init, onChange registration)

Estimated: 300–400 lines.

### 2.4 State ownership after extraction

| State domain | Owns it | File after extraction |
|---|---|---|
| Board cosmetics | `board/cosmetics.ts` | boardZoom, boardTheme, pieceSet, boardFilters |
| Game library | `games/library.ts` | importedGames, selectedGameId, selectedGamePgn, gameIdCounter |
| Analysis cursor | `analyse/ctrl.ts` | ctrl (AnalyseCtrl instance) |
| Chessground instance | `board/ground.ts` | cgInstance, orientation, pvBoard |
| Engine lifecycle | `engine/lifecycle.ts` | engineEnabled, engineReady, engineInitialized |
| Engine eval state | `engine/eval.ts` | evalCache, currentEval, evalNodePath, evalNodePly, evalParentPath, pendingLines |
| Batch review | `engine/eval.ts` | batchQueue, batchDone, batchAnalyzing, batchState, reviewDepth, analysisDepth, multiPv, analysisComplete |
| Post-analysis | `engine/eval.ts` | analyzedGameIds, missedTacticGameIds, analyzedGameAccuracy |
| Import form | `import/chesscom.ts`, `import/lichess.ts`, `import/pgn.ts` | per-platform form state |
| Puzzle state | `puzzles/extract.ts` | puzzleCandidates, savedPuzzles |
| UI panel flags | `shell/nav.ts` | showImportPanel, showEngineSettings, showGlobalMenu, showBoardSettings |

---

## Part 3: Data Flow Diagrams

### 3.1 Game import flow (Chess.com example)

```
User types username → clicks Import
    │
    ▼
importChesscom()                               [import/chesscom.ts after extraction]
    │
    ├── importLoading = true
    ├── redraw()
    │
    ├── fetchChesscomGames(username, filters)
    │       │
    │       ├── GET /pub/player/{user}/games/archives
    │       │        → archives[]
    │       │
    │       └── GET archives[last]             [BUG: only fetches 1 month]
    │               → PGN text
    │               → split by [Event → ImportedGame[]
    │               → pgnToTree() called for validation
    │               → apply speed/date filters
    │               → return filtered ImportedGame[]
    │
    ├── assign game ids: `game-${++gameIdCounter}`   [BUG: counter not persisted]
    │
    ├── importedGames = [...importedGames, ...newGames]
    ├── saveGamesToIdb()                        [async IDB write]
    ├── importLoading = false
    ├── importError = null
    └── redraw()
            │
            ▼
        view(currentRoute)
            │
            ▼
        renderHeader() → renderImportPanel() → renderGameList(importedGames)
        routeContent('analysis') → renderAnalysisControls() → renderGameList()
```

### 3.2 Game load flow

```
User clicks game in list
    │
    ▼
loadGame(game)                                  [main.ts, to move to games/library.ts]
    │
    ├── selectedGameId = game.id
    ├── selectedGamePgn = game.pgn
    ├── ctrl = new AnalyseCtrl(pgnToTree(game.pgn))
    ├── evalCache.clear()
    ├── currentEval = {}
    ├── puzzleCandidates = []
    ├── batchState = 'idle', analysisComplete = false
    ├── saveGamesToIdb()
    ├── syncBoard()                             → cgInstance.set(...)
    ├── syncArrow()                             → cgInstance.set({ autoShapes: [] })
    ├── loadAndRestoreAnalysis(game.id)         [async IDB read — no cancel token: BUG]
    │       │
    │       ▼
    │   IDB.get('analysis-library', game.id)
    │       │
    │       ├── if found and version matches:
    │       │       for each stored node: evalCache.set(path, eval)
    │       │       if status === 'complete': analysisComplete = true
    │       │       redraw()
    │       └── if not found or stale: nothing
    │
    └── redraw()
```

### 3.3 Engine eval flow — live interactive

```
navigate(path) called
    │
    ├── ctrl.setPath(path)
    ├── syncBoard()                             → cgInstance.set(FEN, lastMove, dests)
    └── evalCurrentPosition()
            │
            ├── if batchAnalyzing: return
            ├── if evalCache.has(ctrl.path) and multiPv lines sufficient: use cache
            │       → currentEval = cache entry
            │       → syncArrow()
            │       → redraw()
            │       → return
            │
            ├── if engineSearchActive:
            │       pendingEval = true
            │       return
            │
            ├── engineSearchActive = true
            ├── evalNodePath = ctrl.path
            ├── protocol.setPosition(ctrl.node.fen)
            └── protocol.go(analysisDepth, multiPv)
                    │
                    ▼
            Stockfish UCI output (main thread via Emscripten pthreads)
                    │
                    ▼
            protocol.onMessage callback
                    │
                    ▼
            parseEngineLine(line)
                    │
                    ├── 'info depth N score cp X pv ...'
                    │       → update currentEval or pendingLines
                    │       → syncArrowDebounced()
                    │       → if !batchAnalyzing: redraw()
                    │
                    └── 'bestmove X'
                            ├── if awaitingStopBestmove: discard, reset
                            ├── currentEval.best = bestmove
                            ├── engineSearchActive = false
                            ├── if pendingEval: evalCurrentPosition()
                            └── redraw()
```

### 3.4 Batch review flow

```
User clicks Review button
    │
    ▼
startBatchAnalysis()
    │
    ├── build batchQueue from ctrl.mainline, skip evalCache hits
    ├── batchState = 'analyzing', batchAnalyzing = true
    └── evalBatchItem(batchQueue[0])
            │
            ├── engineSearchActive = true
            ├── evalNodePath = item.path
            ├── currentEval = {}
            ├── protocol.setPosition(item.fen)
            └── protocol.go(reviewDepth, 1)   — always MultiPV=1
                    │
                    ▼
            parseEngineLine() — batch branch
                    │
                    └── 'bestmove X'
                            ├── compute cp delta and win-chance loss
                            ├── evalCache.set(evalNodePath, stored)   [BUG: not game-scoped]
                            └── advanceBatch()
                                    │
                                    ├── batchDone++
                                    ├── saveAnalysisToIdb('partial')
                                    ├── redraw()
                                    ├── if more in queue: evalBatchItem(next)
                                    └── else:
                                            ├── batchAnalyzing = false
                                            ├── analysisComplete = true
                                            ├── analyzedGameIds.add(selectedGameId)
                                            ├── detectMissedTactics()
                                            ├── computeAnalysisSummary() → analyzedGameAccuracy
                                            ├── saveAnalysisToIdb('complete')
                                            ├── evalCache.delete(ctrl.path) — force multiPv re-eval
                                            └── evalCurrentPosition()
```

### 3.5 Startup / IDB restore flow

```
DOMContentLoaded
    │
    ├── applyBoardZoom(), applyBoardTheme(), applyPieceSet()  — localStorage reads
    ├── ctrl = new AnalyseCtrl(pgnToTree(SAMPLE_PGN))        — default board
    ├── app = document.getElementById('app')
    ├── vnode = patch(app, view(currentRoute))
    ├── onChange(route => { currentRoute = route; patch(vnode, view(route)); })
    │
    ├── loadPuzzlesFromIdb()           — async
    │       → savedPuzzles = result
    │       → redraw()
    │
    └── loadGamesFromIdb()             — async
            → importedGames = stored.games
            → selectedGameId = stored.selectedId
            → ctrl = new AnalyseCtrl(pgnToTree(selected game PGN))
            → syncBoard(), syncArrow()
            → loadAndRestoreAnalysis(selectedGameId)   — async, no cancel token
            → redraw()
```

---

## Part 4: Module Ownership Table

### 4.1 Current ownership (as of 2026-03-19, after Steps 1/2/3/4/7)

| Concern | Current location | Notes |
|---|---|---|
| Win-chance math | `src/engine/winchances.ts` | ✓ extracted Step 1 |
| Board cosmetics | `src/board/cosmetics.ts` | ✓ extracted Step 2 |
| ImportedGame type + helpers | `src/import/types.ts` | ✓ extracted Step 3 (partial) |
| Import filters state | `src/import/filters.ts` | ✓ extracted Step 4 |
| Chess.com import adapter | `src/import/chesscom.ts` | ✓ extracted Step 4 |
| Lichess import adapter | `src/import/lichess.ts` | ✓ extracted Step 4 |
| PGN paste import | `src/import/pgn.ts` | ✓ extracted Step 4 |
| Games table view | `src/games/view.ts` | ✓ extracted Step 7 (early) |
| Game metadata helpers | main.ts §B (partial) | remaining: getUserColor, gameResult, renderCompactGameRow |
| IDB persistence | main.ts §C | pending Step 5 |
| Engine lifecycle | main.ts §D | pending Step 11 |
| Live eval logic | main.ts §E | pending Step 11 |
| Batch review logic | main.ts §F | pending Step 11 |
| Board sync + Chessground init | main.ts §G | pending future step |
| Navigation | main.ts §H | pending future step |
| App shell + header | main.ts §I | pending Step 10 |
| Analysis rendering | main.ts §J | pending Steps 6/8 |
| Puzzle extraction | main.ts §K | pending Step 9 |
| Keyboard navigation | main.ts §N | pending future step |
| Bootstrap + route dispatch | main.ts §O | stays in main.ts (core) |

### 4.2 Target ownership (after extraction)

| Concern | Target file | Est. lines |
|---|---|---|
| Board cosmetics | `src/board/cosmetics.ts` | ~200 |
| Board sync + Chessground init | `src/board/ground.ts` | ~180 |
| Game metadata helpers + library state | `src/games/library.ts` | ~180 |
| Games table view | `src/games/view.ts` | ~200 |
| IDB core | `src/idb/core.ts` | ~80 |
| IDB game-library reads/writes | `src/games/library.ts` | (included above) |
| IDB analysis reads/writes | `src/engine/eval.ts` | (included below) |
| Engine lifecycle | `src/engine/lifecycle.ts` | ~120 |
| Win-chances math | `src/engine/winchances.ts` | ~40 |
| Live eval + batch review | `src/engine/eval.ts` | ~350 |
| Analysis cursor | `src/analyse/ctrl.ts` | ~38 (unchanged) |
| Analysis board rendering | `src/analyse/view.ts` | ~900 |
| Keyboard navigation | `src/shell/keyboard.ts` | ~150 |
| App shell + header | `src/shell/nav.ts` | ~120 |
| Chess.com import | `src/import/chesscom.ts` | ~160 |
| Lichess import | `src/import/lichess.ts` | ~140 |
| PGN import | `src/import/pgn.ts` | ~80 |
| Import filters | `src/import/filters.ts` | ~60 |
| Puzzle extraction | `src/puzzles/extract.ts` | ~80 |
| Puzzle play (not yet built) | `src/puzzles/play.ts` | ~200 |
| Engine UCI wrapper | `src/ceval/protocol.ts` | ~182 (unchanged) |
| Engine Web Worker bridge | `src/ceval/worker.ts` | ~150 (to be built) |
| Bootstrap + route dispatch | `src/main.ts` | ~350 |

---

## Part 5: Key Design Decisions

### 5.1 Why Snabbdom and not React

CLAUDE.md mandates Snabbdom as the virtual DOM, matching Lichess exactly. The Lichess analysis
board and all associated UI is built entirely on Snabbdom `h()` + `patch()`. Reusing this
pattern keeps the codebase aligned with Lichess reference implementations and avoids component
lifecycle complexity for a mostly-stateless render pipeline.

Every call to `redraw()` rebuilds the entire vnode tree from scratch. Snabbdom patches only
changed DOM nodes. This is correct, efficient Snabbdom usage.

### 5.2 Why Chessground is updated directly, not via Snabbdom

Chessground manages its own internal rendering. Snabbdom should not recreate it. The board
element is keyed with `key: 'board'` so Snabbdom never unmounts it. After the `insert` hook
fires once (initialization), all subsequent board updates go through `cgInstance.set()`.

This is the correct Lichess pattern. `ui/lib/src/game/ground.ts` in the Lichess source uses
the same approach.

### 5.3 Why the engine runs on the main thread (current, and why it must change)

The current `StockfishProtocol` calls `module.uci()` directly on the main thread via
Emscripten pthreads. This works because SharedArrayBuffer enables cross-thread communication
at the WASM level, but the UCI input/output still flows through the main thread JavaScript.

CLAUDE.md requires the engine to run in a Web Worker. `worker.ts` is the stub for this
migration (Step 11 in REFACTOR_PLAN.md). Until that migration, analysis of a long game
causes main-thread jank during batch mode. This is known and accepted.

### 5.4 Why all state is module-level

The codebase uses module-level `let` variables for all state, matching the Lichess pattern
where each UI module owns a private module-level state bag. There is no state container
object, no Redux, no observable system. State is mutated directly and `redraw()` is called
to trigger a vnode rebuild.

This is intentional and matches Lichess. The refactor does not change this pattern — it
only moves the variable declarations to the file that logically owns them.

### 5.5 Why evalCache is path-keyed without game scope

`evalCache` uses `TreePath` (a string like `'0000'`) as the key. Paths are not globally
unique — two different games can share the same opening path prefix. This is a known design
defect (see KNOWN_ISSUES.md). The mitigation is to clear `evalCache` on game load, but
async races can violate this (see loadAndRestoreAnalysis race and engine bestmove race).

The correct fix (scoping paths with game id) is tracked in NEXT_STEPS.md under Priority 1.
It does not require restructuring the cache — only adding a game-id prefix to the key.

### 5.6 Why `AnalyseCtrl` is cursor-only

The Lichess `AnalyseCtrl` (ui/analyse/src/ctrl.ts) is a large class (~800 lines) owning
eval, IDB cache, sub-controllers (retro, practice, fork), and all analysis domain logic.
This project's `AnalyseCtrl` (src/analyse/ctrl.ts, ~38 lines) is a minimal cursor that
holds only the tree reference and the current path.

This was a deliberate scoping decision — all logic that would live in a rich ctrl class
instead lives in main.ts. After extraction, the relevant logic will move to `engine/eval.ts`,
`board/ground.ts`, and `analyse/view.ts`, but `ctrl.ts` itself remains minimal. Expanding
`AnalyseCtrl` into a Lichess-style rich class would require re-routing all the shared
mutable state, which is out of scope for the refactor.

### 5.7 Why `ANALYSIS_VERSION = 2` exists

IDB analysis records store a version number alongside the data. When `ANALYSIS_VERSION`
is incremented, records from previous versions are rejected at load time. This prevents
silent corruption when the analysis data schema changes. The constant is currently 2,
indicating the format has changed at least once from the initial version.

---

## Part 6: Constraints That Must Not Change

The following properties of the current architecture are correct and must be preserved
through the refactor and all future feature work:

1. All UI is rendered via Snabbdom `h()`. No `document.createElement` in render paths.
2. Chessground element keyed with `key: 'board'` — never unmounted.
3. Board updates go through `cgInstance.set()` only — not Snabbdom re-render.
4. `redraw()` is the single re-render trigger — no partial patch calls.
5. `evalCache` is cleared on game load.
6. `ANALYSIS_VERSION` is checked before restoring analysis from IDB.
7. Batch analysis uses `MultiPV=1` at `reviewDepth`. Live analysis uses `multiPv` (default 3)
   at `analysisDepth`. These are different settings for different purposes.
8. `pgnToTree()` (from `src/tree/pgn.ts`) is the single point of PGN parsing.
9. `scalachessCharPair` is used for node id generation (chessops compat).
10. Win-chance sigmoid uses multiplier `-0.00368208` (exact parity with Lichess).
