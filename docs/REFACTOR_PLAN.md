# Patzer Pro — Refactor Plan for main.ts

Date: 2026-03-19 (updated)
Based on: full read of src/main.ts (4241 lines), all supporting source files, all docs, Lichess
reference files ui/analyse/src/ctrl.ts, treeView/columnView.ts, treeView/treeView.ts

---

## Section 1: Current-state decomposition of main.ts

The file contains 15 identifiable subsystems based on actual line positions. Line ranges are
approximate but grounded in the code read.

---

### [A] Board Cosmetics (Theme, Piece Set, Filters, Zoom)
- Line range: ~124–248
- Responsibilities:
  - localStorage read/write for boardZoom, boardTheme, pieceSet, boardFilters
  - Apply CSS custom properties to document.body on boot and on change
  - Functions: `applyBoardZoom()`, `applyBoardTheme()`, `applyPieceSet()`, `setFilter()`,
    `resetFilters()`, `filtersAtDefault()`, `boardThumbnailUrl()`, `piecePreviewUrl()`
  - Constants: `ZOOM_DEFAULT`, `ZOOM_KEY`, `BOARD_THEME_KEY`, `BOARD_THEME_DEFAULT`,
    `BOARD_THEMES_FEATURED`, `PIECE_SET_KEY`, `PIECE_SET_DEFAULT`, `PIECE_SETS_FEATURED`,
    `PIECE_VARS`, `PIECE_WEBP_SETS`, `FILTER_DEFAULTS`, `FILTER_LS_PREFIX`, `BOARD_THEME_EXT`
- Key state read: `boardZoom`, `boardTheme`, `pieceSet`, `boardFilters`
- Key state mutated: `boardZoom`, `boardTheme`, `pieceSet`, `boardFilters`,
  `document.body.style`, `document.body.dataset`, `document.body.classList`
- Depends on: nothing else in main.ts
- Extraction difficulty: LOW
- Notes: No dependency on ctrl, cgInstance, engine, or import state. The render functions
  `renderBoardSettings()` and `renderFilterSlider()` belong here too — they only read
  `boardFilters`, `boardTheme`, `pieceSet` and call the apply functions.

---

### [B] Game Library State and Game Metadata Helpers
- Line range: ~250–120 (partially interleaved, core at ~250–295 and ~3527–3545)
- Responsibilities:
  - `ImportedGame` interface declaration
  - Module-level game library vars: `importedGames`, `selectedGameId`, `selectedGamePgn`,
    `gameIdCounter`
  - Helper functions: `timeClassFromTimeControl()`, `gameSourceUrl()`, `gameResult()`,
    `getUserColor()`, `renderCompactGameRow()`, `opponentName()`, `parsePgnHeader()`,
    `parseRating()`
  - Constant: `SAMPLE_PGN`
- Key state read: `importedGames`, `selectedGameId`, `chesscomUsername`, `lichessUsername`
- Key state mutated: `importedGames`, `selectedGameId`, `selectedGamePgn`, `gameIdCounter`
- Depends on: nothing else in main.ts (pure functions or reads module state only)
- Extraction difficulty: LOW
- Notes: `getUserColor()` reads `chesscomUsername` and `lichessUsername` as fallbacks —
  this creates a dependency on import form state that must be noted when extracting.
  `renderCompactGameRow()` calls `getUserColor()` and `gameResult()` — keep together.

---

### [C] IndexedDB Persistence
- Line range: ~295–517
- Responsibilities:
  - `StoredGames`, `StoredNodeEntry`, `StoredAnalysis` interfaces, `AnalysisStatus` type
  - `ANALYSIS_VERSION` constant
  - IDB singleton: `_idb`, `openGameDb()`
  - Functions: `saveGamesToIdb()`, `loadGamesFromIdb()`, `saveAnalysisToIdb()`,
    `loadAnalysisFromIdb()`, `clearAnalysisFromIdb()`, `loadAndRestoreAnalysis()`
  - Puzzle persistence: `savedPuzzles`, `savePuzzlesToIdb()`, `loadPuzzlesFromIdb()`,
    `savePuzzle()`
- Key state read: `importedGames`, `selectedGameId`, `ctrl.path`, `ctrl.mainline`,
  `evalCache`, `reviewDepth`, `analyzedGameIds`, `missedTacticGameIds`
- Key state mutated: `savedPuzzles`, `evalCache`, `analysisComplete`, `batchState`,
  `analyzedGameIds`, `missedTacticGameIds`, `analyzedGameAccuracy`, `currentEval`
- Depends on: Engine (reads `reviewDepth`), Analysis Summary (calls `computeAnalysisSummary()`),
  Missed Tactics (calls `detectMissedTactics()`)
- Extraction difficulty: MEDIUM
- Notes: `loadAndRestoreAnalysis()` is the problematic one — it calls `computeAnalysisSummary()`,
  `detectMissedTactics()`, `syncArrow()`, `redraw()`. Pure IDB read/write functions
  (`openGameDb`, `saveGamesToIdb`, `loadGamesFromIdb`, etc.) are extractable immediately.
  `loadAndRestoreAnalysis()` must stay near or import from the engine subsystem.

---

### [D] Win-Chances and Move Classification
- Line range: ~548–593, ~2017–2032
- Responsibilities:
  - Win-chance conversion: `rawWinChances()`, `evalWinChances()`
  - Move loss classification: `classifyLoss()`, `LOSS_THRESHOLDS`
  - Constant: `WIN_CHANCE_MULTIPLIER`
  - Interfaces: `EvalLine`, `PositionEval`
- Key state read: nothing (pure functions)
- Key state mutated: nothing
- Depends on: nothing
- Extraction difficulty: LOW
- Notes: These are pure functions. `PositionEval` and `EvalLine` interfaces must travel
  with them as they are used throughout the engine and rendering subsystems. This is the
  single most portable subsystem in the file.

---

### [E] Engine Lifecycle and Protocol Integration
- Line range: ~519–543 (vars), ~594–828 (engine core), ~881–987 (eval + batch control),
  ~1181–1210 (toggleEngine)
- Responsibilities:
  - Engine state vars: `engineEnabled`, `engineReady`, `engineInitialized`,
    `engineSearchActive`, `awaitingStopBestmove`, `pendingEval`, `evalIsThreat`,
    `threatMode`, `threatEval`
  - Eval state: `currentEval`, `evalCache`, `evalNodeId`, `evalNodePath`, `evalNodePly`,
    `evalParentPath`, `pendingLines`
  - Engine settings: `multiPv`, `analysisDepth`, `reviewDepth`, `showEngineSettings`,
    `showEngineArrows`, `arrowAllLines`, `showPlayedArrow`, `pendingBatchOnReady`
  - Functions: `parseEngineLine()`, `toggleEngine()`, `evalCurrentPosition()`,
    `evalThreatPosition()`, `toggleThreatMode()`, `flipFenColor()`
  - Protocol wire-up: `protocol.onMessage(...)` callback at line ~830
  - Singleton: `protocol` (StockfishProtocol instance)
- Key state read: `ctrl.path`, `ctrl.node.fen`, `ctrl.node.ply`, `batchAnalyzing`,
  `batchQueue`, `batchDone`
- Key state mutated: `engineEnabled`, `engineReady`, `engineInitialized`, `engineSearchActive`,
  `awaitingStopBestmove`, `pendingEval`, `currentEval`, `evalCache`, `evalNodePath`,
  `evalNodePly`, `evalParentPath`, `pendingLines`, `evalIsThreat`, `threatEval`
- Depends on: Board Sync (calls `syncArrow()`, `syncArrowDebounced()`), Batch Analysis
  (calls `advanceBatch()`), App Shell (calls `redraw()`)
- Extraction difficulty: HIGH
- Notes: This is the most entangled subsystem. `parseEngineLine()` calls `advanceBatch()`,
  `syncArrowDebounced()`, `redraw()`. `evalCurrentPosition()` reads `ctrl`. Cannot be
  extracted until its callees are stabilized. This should be extracted last.

---

### [F] Batch Analysis Queue
- Line range: ~641–987 (vars and queue functions, interleaved with engine)
- Responsibilities:
  - Batch state vars: `batchQueue`, `batchDone`, `batchAnalyzing`, `batchState`,
    `analysisRunning`, `analysisComplete`
  - Functions: `startBatchWhenReady()`, `startBatchAnalysis()`, `evalBatchItem()`,
    `advanceBatch()`
  - Post-batch state vars: `analyzedGameIds`, `missedTacticGameIds`, `analyzedGameAccuracy`,
    `pendingBatchOnReady`
  - Constants: `MISSED_TACTIC_THRESHOLD`, `MISSED_TACTIC_MAX_PLY`
- Key state read: `ctrl.mainline`, `evalCache`, `engineEnabled`, `engineReady`,
  `selectedGameId`, `importedGames`
- Key state mutated: `batchQueue`, `batchDone`, `batchAnalyzing`, `batchState`,
  `analysisRunning`, `analysisComplete`, `analyzedGameIds`, `missedTacticGameIds`,
  `analyzedGameAccuracy`, `evalNodePath`, `evalNodePly`, `evalParentPath`, `evalCache`,
  `currentEval`
- Depends on: Engine Lifecycle (calls `toggleEngine()`, `protocol.stop()`, `protocol.go()`),
  IDB Persistence (calls `saveAnalysisToIdb()`), Missed Tactics (calls `detectMissedTactics()`),
  Analysis Summary (calls `computeAnalysisSummary()`)
- Extraction difficulty: HIGH
- Notes: Tightly coupled with engine state. `advanceBatch()` calls `saveAnalysisToIdb()`,
  `redraw()`, `evalBatchItem()`. Cannot be cleanly extracted without first stabilizing
  the engine and IDB subsystems.

---

### [G] Arrow Shapes (autoShape)
- Line range: ~1084–1179
- Responsibilities:
  - Functions: `buildArrowShapes()`, `syncArrow()`, `syncArrowDebounced()`
  - Timer state: `arrowDebounceTimer`, `arrowSuppressUntil`
  - Constant: `ARROW_SETTLE_MS`
- Key state read: `engineEnabled`, `showEngineArrows`, `arrowAllLines`, `showPlayedArrow`,
  `currentEval`, `threatMode`, `threatEval`, `ctrl.node.children`
- Key state mutated: `arrowDebounceTimer`, `arrowSuppressUntil`; side-effects on `cgInstance`
- Depends on: Board (reads `cgInstance`), Engine (reads `currentEval`, `threatEval`)
- Extraction difficulty: MEDIUM
- Notes: Reads `cgInstance` directly. Must be co-located with or import from the board module.
  `evalWinChances()` is called from `buildArrowShapes()` — pure function, easy to import.

---

### [H] Board Sync and Move Input
- Line range: ~1212–1364 (board sync), ~1780–2012 (board init, resize, player strips)
- Responsibilities:
  - Board state vars: `cgInstance`, `orientation`, `pendingPromotion`
  - Functions: `computeDests()`, `uciToSan()`, `onUserMove()`, `completeMove()`,
    `completePromotion()`, `syncBoard()`, `flip()`, `renderBoard()`, `renderPromotionDialog()`
  - Material/clock helpers: `getMaterialDiff()`, `getMaterialScore()`,
    `renderMaterialPieces()`, `formatClock()`, `getClocksAtPath()`, `renderPlayerStrips()`
  - Resize: `bindBoardResizeHandle()`
  - Constants: `PROMOTION_ROLES`, `ROLE_ORDER`, `ROLE_POINTS`
  - Types: `MaterialDiff`, `MaterialDiffSide`
- Key state read: `ctrl.node`, `ctrl.path`, `ctrl.nodeList`, `orientation`, `importedGames`,
  `selectedGameId`, `boardZoom`
- Key state mutated: `cgInstance`, `orientation`, `pendingPromotion`, `boardZoom`
- Depends on: Navigation (calls `navigate()`), App Shell (calls `redraw()`), Board Cosmetics
  (reads `boardZoom`, calls `applyBoardZoom()`)
- Extraction difficulty: MEDIUM
- Notes: `renderBoard()` uses a Snabbdom `insert` hook to initialize `cgInstance` —
  the hook captures `ctrl` and `orientation` from module scope. `syncBoard()` and
  `syncArrow()` must remain callable from Navigation. `renderPlayerStrips()` reads
  `importedGames` and `selectedGameId`.

---

### [I] Navigation
- Line range: ~1366–1407
- Responsibilities:
  - Functions: `navigate()`, `next()`, `prev()`, `first()`, `last()`, `scrollActiveIntoView()`
- Key state read: `ctrl.path`, `ctrl.node.children`, `ctrl.mainline`
- Key state mutated: `ctrl.path` (via `ctrl.setPath()`); calls `syncBoard()`, `evalCurrentPosition()`,
  `saveGamesToIdb()`, `redraw()`, `scrollActiveIntoView()`
- Depends on: Board Sync, Engine Lifecycle, IDB Persistence, App Shell
- Extraction difficulty: LOW
- Notes: `navigate()` is the central integration point — it calls out to board, engine, IDB,
  and render in sequence. The function signatures are clean; the calls are the coupling.
  Extractable by passing dependencies as parameters or by keeping it as thin glue code.

---

### [J] Move List and Tree View Rendering
- Line range: ~2014–2337
- Responsibilities:
  - Move classification display: `GLYPH_COLORS`, `renderMoveSpan()`
  - Inline variation rendering: `renderInlineNodes()`
  - Column view rendering: `renderColumnNodes()`, `renderMoveList()`
- Key state read: `evalCache`, `ctrl.path`, `ctrl.root.children`, `ctrl.node`
- Key state mutated: nothing (pure render functions)
- Depends on: Navigation (handlers call `navigate()`), Win-Chances (calls `classifyLoss()`)
- Extraction difficulty: LOW
- Notes: These are pure render functions that only read shared state and call `navigate()`
  on click. They are almost identical to the Lichess `treeView/columnView.ts` and
  `treeView/inlineView.ts` pattern and can be moved with minimal risk.

---

### [K] Eval Bar, Eval Graph, and Analysis Summary
- Line range: ~2339–2376 (eval bar), ~2378–2550 (eval graph), ~2034–2195 (summary)
- Responsibilities:
  - Eval bar: `evalPct()`, `renderEvalBar()`, `EVAL_BAR_TICKS`, `formatScore()`
  - Eval graph: `renderEvalGraph()`, `detectPhases()`, `countMajorsMinors()`, `GRAPH_W`,
    `GRAPH_H`
  - Analysis summary: `moveAccuracyFromDiff()`, `aggregateAccuracy()`,
    `computeAnalysisSummary()`, `renderAnalysisSummary()`
  - Types: `PlayerSummary`, `AnalysisSummary`
- Key state read: `currentEval`, `evalCache`, `ctrl.mainline`, `ctrl.path`,
  `analysisComplete`, `importedGames`, `selectedGameId`, `engineEnabled`
- Key state mutated: nothing (pure render and computation)
- Depends on: Navigation (graph click calls `navigate()`), Win-Chances (calls `evalWinChances()`)
- Extraction difficulty: LOW-MEDIUM
- Notes: `computeAnalysisSummary()` is called from both render (`renderAnalysisSummary()`)
  and from `advanceBatch()` / `loadAndRestoreAnalysis()` in the engine/IDB subsystems.
  The computation logic must remain importable from wherever `advanceBatch` lives.

---

### [L] Engine Lines (ceval view): PV Box, PV Board, Engine Settings
- Line range: ~2570–2948
- Responsibilities:
  - Engine header: `renderCeval()`
  - PV rendering: `renderPvMoves()`, `renderPvBox()`
  - PV board preview: `renderPvBoard()`, `playPvUciList()`
  - Engine settings panel: `renderEngineSettings()`
  - State vars: `pvBoard`, `pvBoardPos`, `showEngineSettings`
- Key state read: `engineEnabled`, `engineReady`, `batchAnalyzing`, `batchDone`,
  `batchQueue`, `currentEval`, `ctrl.node.fen`, `ctrl.path`, `multiPv`, `showEngineArrows`,
  `arrowAllLines`, `showPlayedArrow`, `reviewDepth`, `analysisDepth`
- Key state mutated: `pvBoard`, `pvBoardPos`, `showEngineSettings`, `multiPv`,
  `reviewDepth`, `analysisDepth`, `showEngineArrows`, `arrowAllLines`, `showPlayedArrow`,
  `pendingLines`, `currentEval`
- Depends on: Navigation (calls `navigate()`, `playPvUciList()` calls `navigate()`),
  Engine Lifecycle (calls `toggleEngine()`, `evalCurrentPosition()`), App Shell (calls `redraw()`)
- Extraction difficulty: MEDIUM
- Notes: `renderCeval()` calls `toggleEngine()`. `renderEngineSettings()` calls
  `evalCurrentPosition()` when multiPv changes. These can be passed as callbacks if extracted.

---

### [M] Puzzle Candidates and PGN Export
- Line range: ~2950–3101 (puzzle extraction + PGN), ~3183–3230 (puzzle candidate list render)
- Responsibilities:
  - Puzzle types: `PuzzleCandidate` interface
  - Puzzle state: `puzzleCandidates`
  - Functions: `extractPuzzleCandidates()`, `renderPuzzleCandidates()`
  - PGN export: `buildPgn()`, `downloadPgn()`, `renderAnalysisControls()`
  - Constant: `PUZZLE_CANDIDATE_MIN_LOSS`
- Key state read: `ctrl.mainline`, `evalCache`, `selectedGameId`, `importedGames`,
  `batchState`, `analysisComplete`, `batchAnalyzing`, `batchQueue`, `batchDone`,
  `engineEnabled`, `ctrl.path`, `savedPuzzles`
- Key state mutated: `puzzleCandidates`, `showExportMenu`, `batchAnalyzing`, `batchState`,
  `analysisRunning`, `evalCache`, `currentEval`
- Depends on: IDB (calls `savePuzzle()`, `saveAnalysisToIdb()`, `clearAnalysisFromIdb()`),
  Batch (calls `startBatchWhenReady()`), Navigation (calls `navigate()`), App Shell (calls `redraw()`)
- Extraction difficulty: MEDIUM
- Notes: `renderAnalysisControls()` contains the Review button logic which calls
  `startBatchWhenReady()`, `protocol.stop()`, and resets batch state variables directly.
  This is a rendering function that reaches deeply into engine and batch state.

---

### [N] Game Import (Chess.com, Lichess, PGN Paste, Filters)
- Line range: ~3232–3591 (import logic), ~3418–3527 (dead render functions)
- Responsibilities:
  - Import filter types and state: `ImportSpeed`, `ImportDateRange`, `importFilterRated`,
    `importFilterSpeeds`, `importFilterDateRange`, `importFilterCustomFrom`,
    `importFilterCustomTo`
  - Import options: `SPEED_OPTIONS`, `DATE_RANGE_OPTIONS`
  - Filter logic: `filterGamesByDate()`
  - Chess.com: `chesscomUsername`, `chesscomLoading`, `chesscomError`,
    `fetchChesscomGames()`, `importChesscom()`, `normalizeChesscomResult()`
  - Lichess: `lichessUsername`, `lichessLoading`, `lichessError`,
    `fetchLichessGames()`, `importLichess()`
  - PGN paste: `pgnInput`, `pgnError`, `pgnKey`, `importPgn()`
  - Constants: `CHESSCOM_BASE`
  - Dead render functions: `renderChesscomImport()`, `renderLichessImport()`,
    `renderImportFilters()` (confirmed not called from `routeContent`)
- Key state read: `importedGames`, `selectedGameId`
- Key state mutated: `importedGames`, `selectedGameId`, `chesscomLoading`, `chesscomError`,
  `lichessLoading`, `lichessError`, `pgnInput`, `pgnError`, `pgnKey`, `gameIdCounter`
- Depends on: Game Library (mutates `importedGames`), IDB (calls `saveGamesToIdb()`),
  `loadGame()` (calls it after successful import), App Shell (calls `redraw()`)
- Extraction difficulty: LOW-MEDIUM
- Notes: The three dead render functions (`renderChesscomImport`, `renderLichessImport`,
  `renderImportFilters`) should be deleted, not moved. The fetch functions have no coupling
  to board, engine, or tree state — they only produce `ImportedGame[]` arrays.

---

### [O] Header, Navigation, Games View, and Route Shell
- Line range: ~1409–1431 (nav), ~1444–1777 (header + global menu + board settings render),
  ~3593–3941 (games view), ~3943–4039 (routeContent, resetAllData, view),
  ~4126–4200 (keyboard help), ~4200–4241 (bootstrap + keyboard + wheel handlers)
- Responsibilities:
  - App nav: `navLinks`, `activeSection()`, `renderNav()`
  - Header: `renderHeader()` (largest single function, ~200 lines)
  - Global menu and board settings render: `renderGlobalMenu()`, `renderBoardSettings()`,
    `closeGlobalMenu()`, `renderFilterSlider()`
  - Panel state: `showImportPanel`, `showGlobalMenu`, `showBoardSettings`, `showExportMenu`
  - Games view: `renderGamesView()`, `renderGameList()`, `renderResultIcon()`,
    `renderSortTh()`, `filteredGames()`, `gamesFilterActive()`, `clearGamesFilters()`,
    `toggleGamesSort()`, `opponentName()`
  - Games filter state: `gamesFilterResults`, `gamesFilterSpeeds`, `gamesFilterOpponent`,
    `gamesFilterColor`, `gamesSortField`, `gamesSortDir`
  - Constants: `SPEED_ICONS`
  - Route shell: `routeContent()`, `view()`, `resetAllData()`
  - Keyboard: `previousBranch()`, `nextBranch()`, `nextSibling()`, `prevSibling()`,
    `playBestMove()`, `renderKeyboardHelp()`, `showKeyboardHelp`
  - Bootstrap: `app`, `currentRoute`, `vnode`, `redraw()`, `onChange()` subscription,
    startup IDB loads
  - Wheel handler: `wheelPixelAccum`, wheel event listener
- Key state read: almost all module state
- Key state mutated: `showImportPanel`, `showGlobalMenu`, `showBoardSettings`,
  `gamesFilterResults`, `gamesFilterSpeeds`, `gamesFilterOpponent`, `gamesFilterColor`,
  `gamesSortField`, `gamesSortDir`, `showKeyboardHelp`, `vnode`, `currentRoute`
- Depends on: everything
- Extraction difficulty: HIGH (for header), MEDIUM (for games view independently)
- Notes: `routeContent()` and `view()` should remain in main.ts as the bootstrap/orchestration
  layer. `renderHeader()` can be extracted to a header module after the import subsystem is
  extracted. `renderGamesView()` is relatively self-contained and is a good early extraction
  candidate since it only reads `importedGames`, game filter state, and `analyzedGameIds`.

---

## Section 2: Coupling Map

The following module-level variables are written from more than one subsystem.

---

**evalCache**
- Type: `Map<string, PositionEval>`
- Written by: Engine Lifecycle (`evalCurrentPosition()` indirectly via bestmove handler),
  Batch Analysis (`advanceBatch()`, `evalBatchItem()`), IDB Persistence (`loadAndRestoreAnalysis()`),
  Route Shell (cleared in `reviewClick()` within `renderAnalysisControls()`), `loadGame()`
- Read by: Move List, Eval Graph, Analysis Summary, Batch Analysis, PGN Export, IDB Persistence,
  Engine Lifecycle
- Refactor risk: HIGH
- Strategy: Define a single owner (Engine/Batch module). All other subsystems receive read
  access via an exported getter or by being passed the Map. Writes only from engine/batch/IDB.

---

**ctrl**
- Type: `AnalyseCtrl`
- Written by: `loadGame()` (replaces the instance), Bootstrap startup code
- Read by: Navigation, Board Sync, Move List, Eval Graph, Analysis Summary, Engine Lifecycle,
  Batch Analysis, PGN Export, Puzzle Extraction, IDB Persistence, Arrow Shapes
- Refactor risk: HIGH
- Strategy: `ctrl` should live in an analysis module that owns game loading. All other
  subsystems accept `ctrl` as a parameter or import it from a single module.

---

**currentEval**
- Type: `PositionEval`
- Written by: Engine Lifecycle (`parseEngineLine()`), Batch Analysis (`evalBatchItem()`
  resets it), IDB Persistence (`loadAndRestoreAnalysis()` restores from cache),
  `loadGame()` (resets to `{}`), `renderEngineSettings()` (resets on multiPv change),
  bestmove handler (sets `.best`)
- Read by: Eval Bar, Engine Lines (PV box), Arrow Shapes, Keyboard (`playBestMove()`)
- Refactor risk: HIGH
- Strategy: Owned by Engine module. Read-only access exported. Render subsystems pass
  it in as a parameter or import it from the engine module.

---

**importedGames**
- Type: `ImportedGame[]`
- Written by: Import subsystem (`importChesscom()`, `importLichess()`, `importPgn()`),
  Bootstrap IDB restore, `loadGame()` does not write it but reads it
- Read by: Header, Games View, Player Strips, Analysis Summary, Batch Analysis, Games View,
  Bootstrap, `getUserColor()`, `opponentName()`, `renderCompactGameRow()`
- Refactor risk: MEDIUM
- Strategy: Owned by Game Library module. Import functions update it and call a callback
  or directly mutate the exported array. Read access is acceptable across modules.

---

**selectedGameId**
- Type: `string | null`
- Written by: Import subsystem (on successful import), Games View row click, Header game
  item click, `loadGame()` does not write it — it is written by the caller before `loadGame()`
  is invoked
- Read by: Player Strips, Analysis Summary, IDB Persistence, Batch Analysis, Games View,
  Header
- Refactor risk: MEDIUM
- Strategy: Owned by Game Library module alongside `importedGames`. Mutation only through
  explicit game-load events.

---

**analysisComplete / batchState / batchAnalyzing**
- Type: `boolean` / `BatchState` / `boolean`
- Written by: Batch Analysis (`startBatchAnalysis()`, `advanceBatch()`), IDB Persistence
  (`loadAndRestoreAnalysis()`), `loadGame()`, `reviewClick()` (inside render function)
- Read by: Engine Lines, Analysis Controls, PV Box, Analysis Summary, Puzzle Candidates
- Refactor risk: HIGH
- Strategy: Own all three in a single Batch module. Render functions receive them as
  arguments or read from module exports.

---

**orientation**
- Type: `'white' | 'black'`
- Written by: `flip()`, `loadGame()` (when user color is determinable)
- Read by: Board Sync, Arrow Shapes, Player Strips, PV Board, Promotion Dialog
- Refactor risk: LOW
- Strategy: Own in Board module. Exported; callers use the exported value.

---

**cgInstance**
- Type: `CgApi | undefined`
- Written by: `renderBoard()` insert hook, `renderBoard()` destroy hook
- Read by: `syncBoard()`, `syncArrow()`, `syncArrowDebounced()`, `flip()`
- Refactor risk: LOW
- Strategy: Own in Board module. Arrow functions accept cgInstance as a parameter or
  import it from Board module.

---

**showImportPanel / showGlobalMenu / showBoardSettings / showEngineSettings**
- Type: `boolean`
- Written by: Header render, Global menu render, Engine settings render, `closeGlobalMenu()`
- Read by: Header render, Global menu render, Engine settings render
- Refactor risk: LOW
- Strategy: Own in their respective UI modules. These are purely local UI state.

---

**SAFE NOW** — subsystems that can be extracted immediately with low risk:

1. Board Cosmetics [A] — zero dependencies on other subsystems
2. Win-Chances and Move Classification [D] — pure functions only
3. Game Import fetch functions from [N] — `fetchChesscomGames()`, `fetchLichessGames()`,
   `filterGamesByDate()`, `normalizeChesscomResult()` — produce data only, no side effects
4. Move List and Tree View Rendering [J] — pure render functions, receive ctrl/evalCache
   as needed

---

**SAFE AFTER X** — subsystems that need a prerequisite step:

5. IDB pure read/write functions from [C] — safe after [D] moves (needs `PositionEval` type)
6. Navigation [I] — safe after Board Sync [H] is extracted (navigate calls syncBoard)
7. Arrow Shapes [G] — safe after Board [H] is extracted (needs cgInstance)
8. Eval Bar, Eval Graph, Analysis Summary [K] — safe after [D] moves
9. Engine Lines view [L] — safe after Engine state [E] is defined as importable exports
10. Games View from [O] — safe after Game Library types [B] are extracted

---

**DO NOT TOUCH YET** — too coupled, leave until end:

11. Engine Lifecycle [E] — reads ctrl, calls syncArrow, calls advanceBatch, calls redraw
12. Batch Analysis [F] — reads ctrl.mainline, calls protocol, calls IDB, calls computeAnalysisSummary
13. Header render [O] — calls importChesscom/importLichess, reads all import state, calls redraw
14. `loadAndRestoreAnalysis()` [C] — calls computeAnalysisSummary, detectMissedTactics, syncArrow, redraw

---

## Section 3: Lichess Architecture Comparison

---

### [Board Cosmetics] → Lichess: `ui/dasher/src/board.ts`, `ui/dasher/src/piece.ts`
- Match quality: MATCHES
- Gap: Lichess has a full Dasher modal with tabs. Patzer Pro has a settings panel within
  the global menu. Functionally equivalent: both apply CSS vars to body and persist to
  localStorage. The `applyBoardTheme`, `applyPieceSet`, `propSliders` patterns are
  directly adapted.
- Matters for this project: NO (cosmetics work correctly)

---

### [AnalyseCtrl / Game State] → Lichess: `ui/analyse/src/ctrl.ts`
- Match quality: WEAKER
- Gap: Lichess's `AnalyseCtrl` owns `tree`, `ceval`, `path`, `node`, and all sub-controllers
  (`retro`, `practice`, `explorer`, `fork`, `idbTree`). In Patzer Pro, `AnalyseCtrl` is
  only a cursor (path/node/nodeList/mainline). Everything else — engine, batch, IDB,
  eval cache — lives as bare module-level globals in main.ts. The Lichess `ctrl.ts` is
  ~600 lines and owns composition of all subsystems; Patzer Pro's "ctrl" is 38 lines.
- Matters for this project: YES — this is the core architectural gap. The refactor should
  move toward a richer ctrl object, not necessarily matching Lichess 1:1, but at minimum
  owning game state (tree, path, current node) and providing stable references to engine
  and IDB.

---

### [Tree View / Move List] → Lichess: `ui/analyse/src/treeView/columnView.ts`,
  `ui/analyse/src/treeView/inlineView.ts`
- Match quality: MATCHES
- Gap: Patzer Pro's `renderColumnNodes()` and `renderInlineNodes()` match the Lichess
  `ColumnView.renderNodes()` and `InlineView.sidelineNodes()` structure very closely.
  CSS class names (`tview2`, `tview2-column`, `move`, `index`, `san`, `glyph`, `interrupt`,
  `lines`, `line`) match exactly. The `concealOf` pattern from Lichess (for study hiding)
  is absent, but that is an intentional divergence for scope reasons.
- Matters for this project: NO (move list is correct and well-matched)

---

### [Engine/ceval] → Lichess: `ui/lib/src/ceval/ctrl.ts`, `ui/lib/src/ceval/protocol.ts`,
  `ui/lib/src/ceval/engines/stockfishWebEngine.ts`
- Match quality: DIVERGES
- Gap: Lichess's `CevalCtrl` is a standalone class with its own lifecycle, event emission,
  and clear interface. `StockfishProtocol` in Patzer Pro is well-adapted from the Lichess
  pattern and is correctly factored. The gap is that all the engine lifecycle management
  that Lichess puts in `CevalCtrl` (toggle, pending evals, multiPv, arrow debounce) is
  scattered across main.ts as module globals. Lichess also runs the engine in a Web Worker;
  Patzer Pro does not.
- Matters for this project: YES — a `CevalCtrl`-equivalent class would dramatically reduce
  the coupling in the engine subsystem and enable the Worker migration.

---

### [Eval Cache] → Lichess: `ui/analyse/src/evalCache.ts`
- Match quality: WEAKER
- Gap: Lichess has a dedicated `EvalCache` class that mediates server-eval fetches. Patzer
  Pro uses a bare `Map<TreePath, PositionEval>` at module scope, written from at least 5
  different call sites. The evalCache is the single biggest shared-mutation risk in the
  codebase. Lichess also attaches evals to tree nodes (`node.eval`, `node.ceval`) as the
  canonical store, with the cache as a layer. Patzer Pro has no eval on tree nodes.
- Matters for this project: YES — the path-scoped Map is correct in concept but dangerous
  in practice without ownership discipline.

---

### [IDB Tree] → Lichess: `ui/analyse/src/idbTree.ts`
- Match quality: DIVERGES
- Gap: Lichess's `IdbTree` is a class that caches tree nodes (not evals) in IDB keyed by
  game position. Patzer Pro's IDB stores eval results per mainline path, which is a different
  schema appropriate for its local-only model. The actual DB operations are clean.
- Matters for this project: NO for schema (intentional divergence); YES for coupling
  (`loadAndRestoreAnalysis()` calls render and engine functions).

---

### [Keyboard / control.ts] → Lichess: `ui/analyse/src/keyboard.ts`,
  `ui/analyse/src/control.ts`
- Match quality: MATCHES (navigation functions), WEAKER (previousBranch)
- Gap: Lichess's `control.ts previousBranch` walks `ctrl.nodeList` backwards from current
  position — clean O(n) walk. Patzer Pro's `previousBranch()` (lines ~4049–4068) does a
  manual tree re-traversal from root per step with questionable logic. The other navigation
  functions (`next`, `prev`, `first`, `last`, `nextBranch`, `nextSibling`, `prevSibling`)
  closely match Lichess.
- Matters for this project: YES (previousBranch bug is documented in KNOWN_ISSUES.md)

---

### [autoShape] → Lichess: `ui/analyse/src/autoShape.ts`
- Match quality: MATCHES
- Gap: Brush colors (paleBlue, paleGrey, red), lineWidth scaling formula, and the settle
  delay pattern all match Lichess exactly. The threat mode arrow (red) matches. The played
  move arrow (red, lineWidth 9) is a Patzer Pro addition not present in Lichess's autoShape
  but is correct behavior.
- Matters for this project: NO (works correctly)

---

### [Win-Chances + Accuracy] → Lichess: `ui/lib/src/ceval/winningChances.ts`,
  `modules/analyse/src/main/AccuracyPercent.scala`
- Match quality: MATCHES
- Gap: The sigmoid formula, multiplier, cp clamping, and mover-perspective normalization
  all match Lichess exactly. The `moveAccuracyFromDiff()` and `aggregateAccuracy()`
  functions match `AccuracyPercent.scala` exactly, including the sliding-window volatility
  weight and harmonic mean combination. This is the strongest Lichess-parity in the codebase.
- Matters for this project: NO (correct and well-verified)

---

## Section 4: Target File Structure

The following is the proposed structure after full refactor, justified by actual code in main.ts.

```
src/
  main.ts                         (~300-400 lines, bootstrap + orchestration only)
  router.ts                       (unchanged, 47 lines)

  analyse/
    ctrl.ts                       (unchanged for now, 38 lines — cursor only)
    view.ts                       (NEW — analysis board vnode layout)
    moveList.ts                   (NEW — move list + tree view rendering)
    summary.ts                    (NEW — accuracy summary computation + render)

  board/
    index.ts                      (NEW — board init, syncBoard, syncArrow, resize, player strips)
    settings.ts                   (NEW — theme/piece/filter/zoom, all localStorage)

  engine/
    ctrl.ts                       (NEW — engine lifecycle, toggle, eval current, threat mode)
    batch.ts                      (NEW — batch analysis queue, advanceBatch, missed tactics)
    winChances.ts                  (NEW — rawWinChances, evalWinChances, classifyLoss)
    types.ts                       (NEW — EvalLine, PositionEval, BatchItem, PositionEval)

  games/
    index.ts                      (NEW — importedGames state, getUserColor, gameResult,
                                   renderCompactGameRow, game metadata helpers)
    import/
      chesscom.ts                  (NEW — fetchChesscomGames, importChesscom, normalizeChesscomResult)
      lichess.ts                   (NEW — fetchLichessGames, importLichess)
      pgn.ts                       (NEW — importPgn, parsePgnHeader, parseRating, pgnKey state)
      filters.ts                   (NEW — filterGamesByDate, SPEED_OPTIONS, DATE_RANGE_OPTIONS,
                                   importFilter* state, ImportSpeed, ImportDateRange types)
    view.ts                        (NEW — renderGamesView, renderGameList, filteredGames,
                                   games filter state, sort state, SPEED_ICONS)

  idb/
    index.ts                       (NEW — openGameDb, StoredGames, StoredAnalysis, all IDB functions)

  header/
    index.ts                       (NEW — renderHeader, renderNav, renderGlobalMenu,
                                   showImportPanel, showGlobalMenu, showBoardSettings state)

  puzzles/
    extract.ts                     (NEW — extractPuzzleCandidates, renderPuzzleCandidates,
                                   PuzzleCandidate interface, PUZZLE_CANDIDATE_MIN_LOSS)

  tree/
    types.ts                       (unchanged, 81 lines)
    ops.ts                         (unchanged, 137 lines)
    pgn.ts                         (unchanged, 102 lines)

  ceval/
    protocol.ts                    (unchanged, 182 lines)
    worker.ts                      (unchanged, stub)
```

---

### What remains in main.ts (~300–400 lines)

After full extraction, main.ts contains only:

1. Imports of all module exports
2. Snabbdom `patch` initialization
3. `view(route)` — assembles header + routeContent, calls module render functions
4. `routeContent(route)` — dispatches to per-route views
5. `redraw()` — the patch cycle
6. `onChange()` subscription to router
7. Bootstrap startup: IDB restore calls (delegated to idb/ and games/ modules)
8. Document keyboard event listener (delegated calls into keyboard module)
9. Document wheel event listener (fixed class name, delegated call)
10. `resetAllData()` utility (can stay or move to idb/)

---

### Each new file — key exports and approximate line counts

```
src/engine/winChances.ts
  Contains: rawWinChances, evalWinChances, classifyLoss, WIN_CHANCE_MULTIPLIER, LOSS_THRESHOLDS
  Exports: rawWinChances, evalWinChances, classifyLoss, LOSS_THRESHOLDS
  Approx lines: 40

src/engine/types.ts
  Contains: EvalLine, PositionEval, BatchItem, BatchState, AnalysisStatus interfaces
  Exports: all
  Approx lines: 50

src/board/settings.ts
  Contains: all board cosmetics vars, constants, and apply/filter functions
  Exports: applyBoardTheme, applyPieceSet, applyBoardZoom, setFilter, resetFilters,
           filtersAtDefault, boardThumbnailUrl, piecePreviewUrl,
           boardZoom, boardTheme, pieceSet, boardFilters,
           BOARD_THEMES_FEATURED, PIECE_SETS_FEATURED
  Approx lines: 130

src/board/index.ts
  Contains: cgInstance, orientation, pendingPromotion, computeDests, uciToSan,
            onUserMove, completeMove, completePromotion, syncBoard, flip, renderBoard,
            renderPromotionDialog, bindBoardResizeHandle, getMaterialDiff, getMaterialScore,
            renderMaterialPieces, formatClock, getClocksAtPath, renderPlayerStrips
  Exports: cgInstance, orientation, syncBoard, flip, renderBoard, renderPlayerStrips,
           renderPromotionDialog, onUserMove
  Approx lines: 300

src/games/index.ts
  Contains: ImportedGame, importedGames, selectedGameId, selectedGamePgn, SAMPLE_PGN,
            getUserColor, gameResult, gameSourceUrl, timeClassFromTimeControl,
            renderCompactGameRow, opponentName
  Exports: all
  Approx lines: 130

src/games/import/filters.ts
  Contains: ImportSpeed, ImportDateRange, importFilter* state vars, SPEED_OPTIONS,
            DATE_RANGE_OPTIONS, filterGamesByDate
  Exports: all
  Approx lines: 70

src/games/import/chesscom.ts
  Contains: chesscomUsername, chesscomLoading, chesscomError, CHESSCOM_BASE,
            normalizeChesscomResult, fetchChesscomGames, importChesscom
  Exports: chesscomUsername, chesscomLoading, chesscomError, importChesscom
  Approx lines: 110

src/games/import/lichess.ts
  Contains: lichessUsername, lichessLoading, lichessError, fetchLichessGames, importLichess
  Exports: lichessUsername, lichessLoading, lichessError, importLichess
  Approx lines: 80

src/games/import/pgn.ts
  Contains: pgnInput, pgnError, pgnKey, parsePgnHeader, parseRating, importPgn, renderPgnImport
  Exports: pgnInput, pgnError, pgnKey, parsePgnHeader, parseRating, importPgn, renderPgnImport
  Approx lines: 70

src/games/view.ts
  Contains: gamesFilter* state, gamesSortField, gamesSortDir, SPEED_ICONS, filteredGames,
            toggleGamesSort, gamesFilterActive, clearGamesFilters, renderGamesView,
            renderGameList, renderResultIcon, renderSortTh
  Exports: renderGamesView, renderGameList
  Approx lines: 350

src/idb/index.ts
  Contains: _idb, openGameDb, StoredGames, StoredNodeEntry, StoredAnalysis, ANALYSIS_VERSION,
            saveGamesToIdb, loadGamesFromIdb, saveAnalysisToIdb, loadAnalysisFromIdb,
            clearAnalysisFromIdb, savedPuzzles, savePuzzlesToIdb, loadPuzzlesFromIdb, savePuzzle
  Exports: all
  Approx lines: 200

src/analyse/moveList.ts
  Contains: GLYPH_COLORS, renderMoveSpan, renderInlineNodes, renderColumnNodes, renderMoveList
  Exports: renderMoveList
  Approx lines: 130

src/analyse/summary.ts
  Contains: moveAccuracyFromDiff, aggregateAccuracy, computeAnalysisSummary, renderAnalysisSummary,
            PlayerSummary, AnalysisSummary
  Exports: computeAnalysisSummary, renderAnalysisSummary
  Approx lines: 100

src/analyse/view.ts
  Contains: routeContent analysis case vnode assembly, renderEvalBar, renderEvalGraph,
            renderAnalysisControls (the review/export button row),
            formatScore, evalPct, EVAL_BAR_TICKS, GRAPH_W, GRAPH_H,
            detectPhases, countMajorsMinors
  Exports: renderAnalysisView (wraps the full analysis section)
  Approx lines: 350

src/engine/ctrl.ts
  Contains: engine state vars, protocol singleton, parseEngineLine, toggleEngine,
            evalCurrentPosition, evalThreatPosition, toggleThreatMode, flipFenColor,
            arrowDebounceTimer, arrowSuppressUntil, ARROW_SETTLE_MS
  Exports: engineEnabled, engineReady, currentEval, evalCache, toggleEngine,
           evalCurrentPosition, startBatchWhenReady
  Approx lines: 350

src/engine/batch.ts
  Contains: batchQueue, batchDone, batchAnalyzing, batchState, analysisRunning, analysisComplete,
            analyzedGameIds, missedTacticGameIds, analyzedGameAccuracy,
            MISSED_TACTIC_THRESHOLD, MISSED_TACTIC_MAX_PLY, BatchItem,
            startBatchAnalysis, startBatchWhenReady, evalBatchItem, advanceBatch, detectMissedTactics
  Exports: batchAnalyzing, batchState, analysisComplete, analyzedGameIds, missedTacticGameIds,
           analyzedGameAccuracy, startBatchWhenReady, startBatchAnalysis
  Approx lines: 150

src/header/index.ts
  Contains: showImportPanel, showGlobalMenu, showBoardSettings, renderHeader, renderNav,
            renderGlobalMenu, closeGlobalMenu, navLinks, activeSection, renderFilterSlider,
            renderBoardSettings
  Exports: renderHeader
  Approx lines: 350

src/puzzles/extract.ts
  Contains: PuzzleCandidate, puzzleCandidates, PUZZLE_CANDIDATE_MIN_LOSS,
            extractPuzzleCandidates, renderPuzzleCandidates
  Exports: PuzzleCandidate, extractPuzzleCandidates, renderPuzzleCandidates
  Approx lines: 90
```

---

## Section 5: Mandatory Extraction Sequence

Steps are ordered from safest (zero dependencies changed) to most complex (high coupling).
Each step must be verified before the next begins.

---

## Step 1 — Extract Win-Chances and Classification Types ✓ COMPLETED

**Completed:** 2026-03-19. Extracted to `src/engine/winchances.ts`. `classifyLoss()` and
`MoveLabel` were not moved in this step (they remain in main.ts; they will move with
`src/analyse/view.ts` in Step 8). Only the pure win-chance math was extracted.

**Goal:** Move the pure computation functions and engine types to their own files so all
other subsystems can import them without depending on main.ts.

**Move:**
- `EvalLine`, `PositionEval` interfaces
- `WIN_CHANCE_MULTIPLIER`, `rawWinChances()`, `evalWinChances()`
- `LOSS_THRESHOLDS`, `classifyLoss()`, `MoveLabel` type

**From:** `src/main.ts` lines ~522–547, ~575–592, ~2017–2032
**To:** `src/engine/winChances.ts` and `src/engine/types.ts`

**Why safe now:** These are pure functions with no imports from anywhere in main.ts.
They have no side effects and do not read any module-level state.

**What must not change:** The exact sigmoid formula, multiplier value, cp clamping range,
mate conversion, and classification thresholds. These match Lichess exactly and must not
be altered.

**Remaining dependencies:** None. These files import only from chessops or nothing.

**How to test:**
- [ ] TypeScript build passes with no errors after adding imports to main.ts
- [ ] Engine toggle on → navigate to an analyzed position → eval bar displays correct score
- [ ] Move list shows ??, ?, ?! labels at same positions as before

**What could go wrong:** Import path errors if `src/engine/` directory does not exist.
**How to diagnose:** Check TS errors on build.
**Roll back if:** Any eval label disappears from the move list or eval bar shows wrong values.

**Estimated line reduction in main.ts:** ~65 lines

---

## Step 2 — Extract Board Cosmetics ✓ COMPLETED

**Completed:** 2026-03-19. Extracted to `src/board/cosmetics.ts` (plan named it
`board/settings.ts` — actual file is `board/cosmetics.ts`). Startup apply calls run at
module import time. Added `saveBoardZoom(zoom)` setter to work around ESM binding
restriction (cannot assign to imported `let` from outside the module).

**Goal:** Move all board theme/piece set/filter/zoom logic into its own module so the
header and global menu can import apply functions directly.

**Move:**
- All constants: `ZOOM_DEFAULT`, `ZOOM_KEY`, `BOARD_THEME_KEY`, `BOARD_THEME_DEFAULT`,
  `BOARD_THEMES_FEATURED`, `PIECE_SET_KEY`, `PIECE_SET_DEFAULT`, `PIECE_SETS_FEATURED`,
  `PIECE_VARS`, `PIECE_WEBP_SETS`, `FILTER_DEFAULTS`, `FILTER_LS_PREFIX`, `BOARD_THEME_EXT`
- All state vars: `boardZoom`, `boardTheme`, `pieceSet`, `boardFilters`
- All functions: `applyBoardZoom()`, `applyBoardTheme()`, `applyPieceSet()`, `setFilter()`,
  `resetFilters()`, `filtersAtDefault()`, `boardThumbnailUrl()`, `piecePreviewUrl()`
- Render functions: `renderBoardSettings()`, `renderFilterSlider()`
- Startup body application code (the `applyBoardZoom(boardZoom)` etc. calls at module scope)

**From:** `src/main.ts` lines ~124–248, ~1666–1729
**To:** `src/board/settings.ts`

**Why safe now:** This subsystem has zero dependencies on any other part of main.ts. It
only touches `document.body` and `localStorage`. The render functions return vnodes and
call only the apply functions in this same module.

**What must not change:** CSS variable names (`---zoom`, `---board-brightness`, etc.),
`document.body.dataset.board`, `document.body.dataset.pieceSet`, `simple-board` class toggle.

**Remaining dependencies:** None beyond DOM APIs.

**How to test:**
- [ ] Build passes with no TS errors
- [ ] Board theme tiles in settings panel still apply themes visually
- [ ] Piece set tiles still apply piece sets
- [ ] Brightness/contrast/hue sliders still affect the board
- [ ] Settings persist across page reload (localStorage)
- [ ] Board zoom handle still resizes the board

**What could go wrong:** The startup `applyBoardZoom(boardZoom)` call order matters — it
must run before first render. Ensure the module's top-level initialization runs on import.
**How to diagnose:** If the board shows the wrong theme on load, the apply call is not
running at module import time.
**Roll back if:** Board theme or piece set does not persist/apply correctly.

**Estimated line reduction in main.ts:** ~130 lines

---

## Step 3 — Extract Game Library Helpers and Types ✓ COMPLETED (partial)

**Completed:** 2026-03-19. `ImportedGame`, `nextGameId()`, `restoreGameIdCounter()`,
`parsePgnHeader()`, `parseRating()`, `timeClassFromTimeControl()`, and `ImportCallbacks`
extracted to `src/import/types.ts`. This is the subset needed to unblock Step 4; the
full game library state (`importedGames`, `selectedGameId`, etc.) and rendering helpers
(`renderCompactGameRow`, `getUserColor`, `gameResult`) remain in main.ts and will move
with `src/games/library.ts` in a later step.

**Goal:** Move `ImportedGame` interface, game metadata helpers, and the shared compact
game row renderer to a dedicated module so import adapters and views can import them.

**Move:**
- `ImportedGame` interface
- `importedGames`, `selectedGameId`, `selectedGamePgn`, `gameIdCounter` (state vars)
- `SAMPLE_PGN`
- `timeClassFromTimeControl()`, `gameSourceUrl()`, `gameResult()`, `renderCompactGameRow()`
- `parsePgnHeader()`, `parseRating()` (used by import adapters)

**From:** `src/main.ts` lines ~28–120, ~3527–3545
**To:** `src/games/index.ts`

**Why safe now:** These are data types, pure helper functions, and shared state variables.
`parsePgnHeader()` and `parseRating()` have no dependencies. `renderCompactGameRow()` calls
`getUserColor()` and `gameResult()` — keep them together in the same file.
`getUserColor()` reads `chesscomUsername` and `lichessUsername` — note the dependency
and have it accept optional name overrides or import from the import module.

**What must not change:** `ImportedGame` field names (used throughout IDB serialization).
`gameIdCounter` collision bug should NOT be fixed in this step — that is a separate bugfix.

**Remaining dependencies:** `getUserColor()` reads `chesscomUsername`/`lichessUsername`
from the import subsystem. Resolve by making `getUserColor()` accept an optional
`importedUsername` parameter (which already exists on the `ImportedGame` type) as the
primary lookup, and fall back to module-level usernames only if needed.

**How to test:**
- [ ] Build passes with no TS errors
- [ ] Game list in header panel renders correctly with result dots, dates, badges
- [ ] Compact game row in games view renders correctly

**What could go wrong:** `getUserColor()` referencing `chesscomUsername`/`lichessUsername`
from a different module creates a circular dependency risk.
**How to diagnose:** TS circular import error on build.
**Roll back if:** Game rows render without opponent names or result colors.

**Estimated line reduction in main.ts:** ~120 lines

---

## Step 4 — Extract Game Import Adapters and Filters ✓ COMPLETED

**Completed:** 2026-03-19. Extracted to `src/import/filters.ts`, `src/import/chesscom.ts`,
`src/import/lichess.ts`, `src/import/pgn.ts` (plan named the dir `src/games/import/` —
actual location is `src/import/`). Dead render functions deleted. `ImportCallbacks`
interface added to `src/import/types.ts`; `importCallbacks` object defined in main.ts
bridges the adapters to main.ts state without circular imports. `restoreGameIdCounter()`
added to fix game-id collision across sessions (fix applied during IDB restore).

**Goal:** Move all three import adapters and import filter state to their own files.
Delete the three dead render functions in this step.

**Move:**
- `src/games/import/filters.ts`: `ImportSpeed`, `ImportDateRange`, `importFilterRated`,
  `importFilterSpeeds`, `importFilterDateRange`, `importFilterCustomFrom`,
  `importFilterCustomTo`, `SPEED_OPTIONS`, `DATE_RANGE_OPTIONS`, `filterGamesByDate()`
- `src/games/import/chesscom.ts`: `chesscomUsername`, `chesscomLoading`, `chesscomError`,
  `CHESSCOM_BASE`, `normalizeChesscomResult()`, `fetchChesscomGames()`, `importChesscom()`
- `src/games/import/lichess.ts`: `lichessUsername`, `lichessLoading`, `lichessError`,
  `fetchLichessGames()`, `importLichess()`
- `src/games/import/pgn.ts`: `pgnInput`, `pgnError`, `pgnKey`, `importPgn()`, `renderPgnImport()`

**DELETE (do not move):** `renderChesscomImport()`, `renderLichessImport()`,
`renderImportFilters()` — confirmed dead code (not called from `routeContent`)

**From:** `src/main.ts` lines ~3232–3591
**To:** As described above

**Why safe now:** The fetch functions are pure async functions that only produce data.
They call `pgnToTree()` for validation (already in `src/tree/pgn.ts`), call `loadGame()`
on success, and call `redraw()`. Pass `loadGame` and `redraw` as callbacks to avoid
circular dependencies, or import them from main.ts temporarily.

**What must not change:** Chess.com API URL format, Lichess PGN split regex,
`importedUsername` being set to lowercased username.

**Remaining dependencies:** Import adapters call `loadGame()` after success. This can be
a callback parameter or the import is done in main.ts using the adapter's data.

**How to test:**
- [ ] Chess.com import works end-to-end: username entry → Import button → games appear
- [ ] Lichess import works end-to-end
- [ ] PGN paste import works
- [ ] Speed filter pills work
- [ ] Date range filter works
- [ ] "Rated only" toggle works

**What could go wrong:** `importChesscom()` calling `loadGame()` — if `loadGame()` is not
yet extracted, it remains in main.ts and the import functions call it via a passed callback.
**How to diagnose:** Import button shows loading state but games do not appear.
**Roll back if:** Any import path stops working.

**Estimated line reduction in main.ts:** ~360 lines (including deletion of dead functions)

---

## Step 5 — Extract IDB Pure Read/Write Functions

**Goal:** Move the IndexedDB layer to its own module so it can be imported by the engine
and game library independently.

**Move:**
- `_idb`, `openGameDb()`
- `StoredGames`, `StoredNodeEntry`, `StoredAnalysis`, `AnalysisStatus`, `ANALYSIS_VERSION`
- `saveGamesToIdb()`, `loadGamesFromIdb()`, `saveAnalysisToIdb()`, `loadAnalysisFromIdb()`,
  `clearAnalysisFromIdb()`
- `savedPuzzles`, `savePuzzlesToIdb()`, `loadPuzzlesFromIdb()`, `savePuzzle()`

**Do NOT move yet:** `loadAndRestoreAnalysis()` — it calls `computeAnalysisSummary()`,
`detectMissedTactics()`, `syncArrow()`, `redraw()` — leave until those are extracted.

**From:** `src/main.ts` lines ~295–517
**To:** `src/idb/index.ts`

**Why safe now:** The pure IDB functions only open the database and read/write data.
They do not call render or navigation functions. `saveAnalysisToIdb()` reads `ctrl.mainline`
and `evalCache` — pass these as parameters when calling.

**What must not change:** DB name `'patzer-pro'`, version `3`, store names `'game-library'`,
`'analysis-library'`, `'puzzle-library'`.

**Remaining dependencies:** `saveAnalysisToIdb()` needs `ctrl.mainline`, `evalCache`,
`selectedGameId`, `reviewDepth` — pass as arguments rather than reading globals.

**How to test:**
- [ ] Build passes
- [ ] Page reload restores imported games from IDB
- [ ] Analyzed game analysis is restored from IDB after reload
- [ ] Saved puzzles persist across reload
- [ ] "Reset" button clears all IDB data and reloads

**What could go wrong:** IDB store name typo causes silent failure on save/load.
**How to diagnose:** Open browser DevTools → Application → IndexedDB and verify stores exist.
**Roll back if:** Games do not persist across reload.

**Estimated line reduction in main.ts:** ~200 lines (loadAndRestoreAnalysis stays for now)

---

## Step 6 — Extract Move List and Tree View Rendering ✓ COMPLETED

**Completed:** 2026-03-19. Extracted to `src/analyse/moveList.ts`. `classifyLoss`,
`MoveLabel`, `LOSS_THRESHOLDS` moved to `src/engine/winchances.ts` (used by moveList,
accuracy summary, and eval graph). `renderMoveList` takes explicit params `(root,
currentPath, getEval, navigate)` — no globals accessed. `getEval` typed structurally so
`moveList.ts` doesn't need to import `PositionEval`. Build confirmed passing at 294.7 KB.

**Goal:** Move the column view tree rendering to its own module matching Lichess's
`treeView/` structure.

**Move:**
- `GLYPH_COLORS`, `renderMoveSpan()`, `renderInlineNodes()`, `renderColumnNodes()`,
  `renderMoveList()`

**From:** `src/main.ts` lines ~2014–2337
**To:** `src/analyse/moveList.ts`

**Why safe now:** These are pure render functions. They read `evalCache` and `ctrl.path`
but do not write any state. The only side-effecting call is the `navigate()` call in click
handlers — pass `navigate` as a parameter or import it from navigation module.

**What must not change:** CSS class names used in the move list (`tview2`, `tview2-column`,
`move`, `active`, `san`, `glyph`, `index`, `interrupt`, `lines`, `line`). These map to
SCSS rules.

**Remaining dependencies:** `evalCache` (read), `ctrl.path` and `ctrl.root.children`
(read), `navigate()` (callback), `classifyLoss()` from engine/winChances.ts,
`pathInit()` from tree/ops.ts.

**How to test:**
- [ ] Move list renders with correct move numbers and variation indentation
- [ ] Active move is highlighted correctly on navigation
- [ ] Clicking a move navigates to that position
- [ ] Blunder/mistake/inaccuracy glyphs appear on analyzed moves
- [ ] Inline variations render inside interrupt blocks

**What could go wrong:** The `parent` parameter threading in `renderMoveSpan()` and
`renderInlineNodes()` — ensure signatures match exactly.
**How to diagnose:** Move list renders empty or shows no active highlight.
**Roll back if:** Move list does not render or navigation via click stops working.

**Estimated line reduction in main.ts:** ~130 lines

---

## Step 7 — Extract Games View ✓ COMPLETED (executed out-of-sequence, before Steps 5–6)

**Completed:** 2026-03-19. Extracted to `src/games/view.ts`. All filter/sort state is
module-level in view.ts. App state passed in via `GamesViewDeps` interface; main.ts builds
this via `gamesViewDeps()` factory. `toggleGamesSort` and `clearGamesFilters` accept
`redraw` as a parameter. `opponentName` accepts `getUserColor` as a parameter.
Build confirmed passing at 293.9 KB with no TS errors.

**Goal:** Move the games view (the `#/games` route) to its own module.

**Move:**
- `GamesResultFilter`, `GamesSortField` types
- `gamesFilterResults`, `gamesFilterSpeeds`, `gamesFilterOpponent`, `gamesFilterColor`,
  `gamesSortField`, `gamesSortDir`, `SPEED_ICONS`
- `toggleGamesSort()`, `gamesFilterActive()`, `clearGamesFilters()`, `filteredGames()`,
  `opponentName()`, `renderResultIcon()`, `renderSortTh()`, `renderGamesView()`,
  `renderGameList()`

**From:** `src/main.ts` lines ~3593–3941
**To:** `src/games/view.ts`

**Why safe now:** `renderGamesView()` reads `importedGames`, `selectedGameId`,
`analyzedGameIds`, `missedTacticGameIds`, `analyzedGameAccuracy`, `savedPuzzles` —
all of which can be imported from their respective modules. It calls `loadGame()`,
`startBatchWhenReady()`, `redraw()`, and `getUserColor()` — pass as callbacks or
import from their eventual homes.

**What must not change:** Games view CSS class names (`games-view`, `games-view__table`,
`games-view__pill`, etc.) — these map to SCSS rules.

**Remaining dependencies:** `importedGames` (read), `loadGame` (callback),
`startBatchWhenReady` (callback), `redraw` (callback), `getUserColor` (import),
`analyzedGameIds`, `missedTacticGameIds`, `analyzedGameAccuracy`, `savedPuzzles`.

**How to test:**
- [ ] Games view renders with all imported games in the table
- [ ] Sort by date/result/opponent/time class works
- [ ] Result filter pills work
- [ ] Opponent search works
- [ ] Row click navigates to `#/analysis` and loads the game
- [ ] Review button in table starts batch analysis

**What could go wrong:** `getUserColor()` circular import if games/view.ts imports from
games/index.ts which imports from import adapters.
**How to diagnose:** TS circular import error.
**Roll back if:** Games view renders empty or filter/sort stops working.

**Estimated line reduction in main.ts:** ~350 lines

---

## Step 8 — Extract Eval Graph, Eval Bar, and Analysis Summary ✓ COMPLETED

**Completed:** 2026-03-19. All moved to `src/analyse/evalView.ts` (plan named it
`summary.ts` + `view.ts` — combined into one file for this step). `EvalEntry` structural
type defined locally so `PositionEval` (still in main.ts) is not needed. `renderAnalysisSummary`
takes `whiteName`/`blackName` params; call site in main.ts does the player lookup.
`computeAnalysisSummary(mainline, evalCache)` takes explicit params — used by
`loadAndRestoreAnalysis` and `advanceBatch` in main.ts with no circular dep.
`classifyLoss`/`MoveLabel` no longer imported by main.ts directly.
Build confirmed passing at 295.1 KB.

**Goal:** Move the eval graph SVG, eval bar, and accuracy summary computations to their
own analysis view module.

**Move:**
- `evalPct()`, `renderEvalBar()`, `EVAL_BAR_TICKS`, `formatScore()`
- `GRAPH_W`, `GRAPH_H`, `countMajorsMinors()`, `detectPhases()`, `renderEvalGraph()`
- `moveAccuracyFromDiff()`, `aggregateAccuracy()`, `computeAnalysisSummary()`,
  `renderAnalysisSummary()`
- Types: `PlayerSummary`, `AnalysisSummary`

**From:** `src/main.ts` lines ~2034–2195, ~2339–2550
**To:** `src/analyse/summary.ts` (accuracy functions) and embed graph/bar in `src/analyse/view.ts`

**Why safe now:** These are pure computation and render functions. They read `evalCache`,
`currentEval`, `ctrl.mainline`, `ctrl.path`, `analysisComplete`, `engineEnabled` but do
not write any state.

**What must not change:** SVG viewBox attributes, `GRAPH_W`/`GRAPH_H` values (CSS depends
on height being 80px), accuracy formula constants.

**Remaining dependencies:** `evalCache` (read), `ctrl.mainline` (read), `currentEval` (read),
`navigate` (callback for graph click), `evalWinChances()` (import from engine/winChances.ts).

**How to test:**
- [ ] Eval bar shows correct fill for analyzed positions
- [ ] Eval graph renders with correct shape after batch analysis
- [ ] Graph click navigates to that position
- [ ] Accuracy summary shows correct % for white and black
- [ ] Phase dividers appear at correct positions on graph

**What could go wrong:** `computeAnalysisSummary()` must remain importable from wherever
`advanceBatch()` lives — ensure the extraction does not create circular dependency with
the engine/batch module.
**How to diagnose:** Accuracy shows 0% or — after batch analysis completes.
**Roll back if:** Graph disappears or accuracy summary is wrong.

**Estimated line reduction in main.ts:** ~250 lines

---

## Step 9 — Extract Puzzle Candidate Extraction ✓ COMPLETED 2026-03-19

**Goal:** Move puzzle candidate scanning and rendering to its own module.

**Move:**
- `PuzzleCandidate` interface, `puzzleCandidates` state var
- `PUZZLE_CANDIDATE_MIN_LOSS`, `extractPuzzleCandidates()`, `renderPuzzleCandidates()`

**From:** `src/main.ts` lines ~2950–3008, ~3183–3230
**To:** `src/puzzles/extract.ts`

**Implemented:**
- `PuzzleCandidate` moved to `src/tree/types.ts` (shared with idb/index.ts)
- `puzzleCandidates` is module-level state in `src/puzzles/extract.ts`
- `clearPuzzleCandidates()` exported for game-load and re-analyze call sites
- `renderPuzzleCandidates()` takes `PuzzleRenderDeps` interface; `uciToSan` injected
- Build verified: 295.7 KB ✓

**Why safe now:** `extractPuzzleCandidates()` only reads `ctrl.mainline` and `evalCache`.
`renderPuzzleCandidates()` reads `puzzleCandidates`, `savedPuzzles`, `batchState`,
`batchAnalyzing`, `engineEnabled` — all importable or passable as arguments.

**What must not change:** `PUZZLE_CANDIDATE_MIN_LOSS` threshold value (matches blunder
threshold). `PuzzleCandidate` field names (used in IDB serialization).

**Remaining dependencies:** `evalCache` (read), `ctrl.mainline` (read), `savedPuzzles`
(read), `navigate` (callback), `savePuzzle` (from idb/), `uciToSan` (from board/).

**How to test:**
- [ ] "Find Puzzles" button extracts candidates after batch analysis
- [ ] Candidate list shows correct move, loss %, and best move
- [ ] Clicking a candidate navigates to that position
- [ ] "Save" button saves the puzzle and shows ✓
- [ ] Saved count persists across reload

**What could go wrong:** `renderPuzzleCandidates()` reading `batchState`/`batchAnalyzing`
from module globals — ensure these are imported from the batch module.
**How to diagnose:** "Find Puzzles" button is always disabled.
**Roll back if:** Puzzle extraction produces no candidates on an analyzed game.

**Estimated line reduction in main.ts:** ~80 lines

---

## Step 10 — Extract Header Render ✓ COMPLETED 2026-03-19

**Goal:** Move the full header render function and panel state to a header module.

**Move:**
- `showImportPanel`, `showGlobalMenu`, `showBoardSettings`
- `navLinks`, `activeSection()`, `renderNav()`, `renderHeader()`
- `renderGlobalMenu()`, `closeGlobalMenu()`
- `renderBoardSettings()` and `renderFilterSlider()` can move here or stay in board/settings.ts

**From:** `src/main.ts` lines ~1409–1431, ~1444–1777
**To:** `src/header/index.ts`

**Why safe now:** After Steps 2–4, the header's dependencies (`applyBoardTheme`,
`importChesscom`, `importLichess`, `importFilterSpeeds`, etc.) will already be in their own
modules and importable.

**What must not change:** Header CSS class names (`header`, `header__brand`,
`header__bar`, `header__panel`, etc.), panel open/close behavior.

**Remaining dependencies:** Import state vars from games/import/, apply functions from
board/settings.ts, `renderBoardSettings()` from board/settings.ts, `importedGames` and
game helpers from games/index.ts, `redraw` (callback).

**How to test:**
- [ ] Header renders with brand, search bar, nav tabs, and settings gear
- [ ] Platform toggle switches between Chess.com and Lichess
- [ ] Import panel opens and closes
- [ ] Game list in panel shows imported games
- [ ] Board settings panel opens from global menu
- [ ] Filters panel shows correct active state

**What could go wrong:** Circular dependencies if header imports from modules that import
from header. The header is a pure render function — all state must flow in via imports.
**How to diagnose:** Header does not render or shows blank.
**Roll back if:** Import panel does not open or games do not appear in panel.

**Estimated line reduction in main.ts:** ~350 lines

**Implemented:**
- `src/header/index.ts` created: `importPlatform`, `showImportPanel`, `showGlobalMenu`,
  `showBoardSettings` module state; `renderHeader(deps)`, `renderNav`, `renderGlobalMenu`,
  `closeGlobalMenu`, `activeSection`, `navLinks` all moved here
- `HeaderDeps` interface injects: route, importedGames, selectedGameId, analyzedGameIds,
  missedTacticGameIds, importCallbacks, onSelectGame, renderGameRow, gameSourceUrl,
  downloadPgn, resetAllData, redraw
- main.ts: removed ~282 lines; removed imports for renderBoardSettings, importChesscom,
  importLichess, importPgn, pgnState, DATE_RANGE_OPTIONS, SPEED_OPTIONS, importFilters,
  ImportDateRange, ImportSpeed; added `import { renderHeader, type HeaderDeps } from './header/index'`
- Build verified: 295.4 KB ✓

---

## Step 11 — Extract Engine Lifecycle ✓ COMPLETED 2026-03-19

**Goal:** Move the engine lifecycle, eval management, and batch analysis into dedicated
modules, finally resolving the deepest coupling.

**Move:**
- To `src/engine/ctrl.ts`: engine state vars, `protocol` singleton, `parseEngineLine()`,
  `toggleEngine()`, `evalCurrentPosition()`, `evalThreatPosition()`, `toggleThreatMode()`,
  `flipFenColor()`, arrow debounce state, `buildArrowShapes()`, `syncArrow()`,
  `syncArrowDebounced()`
- To `src/engine/batch.ts`: batch state vars, `BatchItem`, `startBatchAnalysis()`,
  `startBatchWhenReady()`, `evalBatchItem()`, `advanceBatch()`, `detectMissedTactics()`

**From:** `src/main.ts` lines ~519–987, ~1084–1210
**To:** As described above

**Why deferred:** This step requires that `cgInstance` be importable from board/, that
`computeAnalysisSummary()` be importable from analyse/summary.ts, that `saveAnalysisToIdb()`
be importable from idb/, and that `redraw()` is available as a callback. All of these
require Steps 1–10.

**What must not change:** UCI command sequence (uci → uciok → setoption → ucinewgame →
isready → readyok), `ARROW_SETTLE_MS` value, `awaitingStopBestmove` flag semantics,
batch bestmove write pattern.

**Remaining dependencies after extraction:** `ctrl` (read from analyse module),
`cgInstance` (imported from board/), `redraw` (callback from bootstrap),
`saveAnalysisToIdb` (imported from idb/).

**How to test:**
- [ ] Engine toggle (L key) still turns engine on/off
- [ ] Live eval still updates the pearl and eval bar during navigation
- [ ] Batch review completes with correct eval labels in move list
- [ ] Threat mode (x key) shows red arrow
- [ ] Arrow debounce still prevents flickering during live search

**What could go wrong:** Circular imports between engine/ctrl.ts and engine/batch.ts
(batch calls eval functions from ctrl.ts; ctrl calls advanceBatch from batch.ts).
Resolve by passing `advanceBatch` as a callback registered by batch.ts on engine/ctrl.ts.
**How to diagnose:** Engine does not start when toggled on.
**Roll back if:** Engine does not produce evaluations or batch review stops working.

**Estimated line reduction in main.ts:** ~500 lines

**Implemented:**
- `src/engine/ctrl.ts` created: types (`EvalLine`, `PositionEval`), protocol singleton,
  all engine state vars, arrow state, threat mode, setters for external write access,
  batch callback hooks (`setIsBatchActive`, `setOnBatchBestmove`, `setOnEngineReady`),
  `initEngine(deps)`, `parseEngineLine`, `toggleEngine`, `evalCurrentPosition`,
  `evalThreatPosition`, `toggleThreatMode`, `buildArrowShapes`, `syncArrow`,
  `syncArrowDebounced`, `flipFenColor`
- `src/engine/batch.ts` created: types (`BatchItem`, `BatchState`), all batch state vars,
  `initBatch(deps)`, `detectMissedTactics`, `evalBatchItem`, `onBatchBestmove`,
  `advanceBatch`, `startBatchAnalysis`, `startBatchWhenReady`, setters for external writes
- main.ts: removed ~640 lines; added engine/ctrl and engine/batch imports; added
  `initEngine()` + `initBatch()` calls at bootstrap; updated all direct state assignments
  to use setter functions; `getUserColor` kept in main.ts (used by render and deps)
- Circular dependency resolved: ctrl.ts has `setIsBatchActive`/`setOnBatchBestmove`/
  `setOnEngineReady` hooks; batch.ts registers them at `initBatch()` time — no circular import
- Build verified: 298.4 KB ✓

---

After Step 11, main.ts is ~1667 lines. Steps 12–16 continue extracting the remaining
subsystems until main.ts reaches its bootstrap-only target of ~300–400 lines.

---

## Step 12 — Extract Board Sync and Move Handling ✓ COMPLETED 2026-03-19

**Goal:** Move Chessground lifecycle, move input, promotion dialog, player strips, material
diff, and board resize to `src/board/index.ts`.

**Mirrors:** `ui/analyse/src/ground.ts`, `ui/lib/src/game/material.ts`,
`ui/analyse/src/view/clocks.ts`, `ui/analyse/src/view/components.ts`

**Move to `src/board/index.ts`:**
- State vars: `cgInstance`, `orientation`, `pendingPromotion`
- Types: `MaterialDiff`, `MaterialDiffSide`
- Constants: `PROMOTION_ROLES`, `ROLE_ORDER`, `ROLE_POINTS`
- Pure helpers: `computeDests()`, `uciToSan()`, `getMaterialDiff()`, `getMaterialScore()`
- Move handling: `onUserMove()`, `completeMove()`, `completePromotion()`
- Render: `renderPromotionDialog()`, `syncBoard()`, `flip()`, `renderBoard()`
- Material + clock: `renderMaterialPieces()`, `formatClock()`, `getClocksAtPath()`, `renderPlayerStrips()`
- Resize: `bindBoardResizeHandle()`
- Init: `initGround(deps)` to inject callbacks

**Init deps shape:**
```typescript
export function initGround(deps: {
  getCtrl:          () => AnalyseCtrl;
  navigate:         (path: string) => void;
  getImportedGames: () => ImportedGame[];
  getSelectedGameId:() => string | null;
  redraw:           () => void;
}): void
```

**From:** `src/main.ts` lines ~294–722
**To:** `src/board/index.ts`

**Why safe now:** All dependencies are either pure (chessops, board/cosmetics.ts,
engine/ctrl.ts syncArrow) or can be injected via `initGround()`. `syncArrow` can be
imported directly from `engine/ctrl.ts` without circularity since board does not depend
on batch.

**What must not change:** Chessground config options (`viewOnly`, `drawable`, `brushes`,
`movable.showDests`). `orientation` default is `'white'`. The `key: 'board'` on the cg-wrap
vnode — Snabbdom uses this to avoid recreating the element on re-render.

**Exports needed by main.ts:**
- `cgInstance` (passed to `initEngine` via `getCgInstance` callback)
- `orientation` (read by `loadGame` to set user color)
- `setOrientation(v)` setter (used by `loadGame`)
- `syncBoard()` (called from `loadGame`, IDB restore, `navigate`)
- `flip()` (called from keyboard handler + controls button)
- `renderBoard()`, `renderPromotionDialog()`, `renderPlayerStrips()` (called from routeContent)
- `uciToSan` (injected into `renderPuzzleCandidates` PuzzleRenderDeps)
- `completeMove` (called from `playBestMove` keyboard handler)

**Remaining dependencies in board/index.ts:**
- `syncArrow` imported from `engine/ctrl.ts`
- `boardZoom`, `applyBoardZoom`, `saveBoardZoom` imported from `board/cosmetics.ts`
- `getCtrl`, `navigate`, `getImportedGames`, `getSelectedGameId`, `redraw` injected via `initGround()`

**How to test:**
- [ ] Board renders and pieces are draggable / clickable
- [ ] Moves create new variation nodes and navigate to them
- [ ] Pawn promotion dialog appears and piece selection completes the move
- [ ] Flip button and `f` key change board orientation
- [ ] Player strips show correct names, ratings, material badges, and clocks
- [ ] Board resize handle changes zoom and persists to localStorage

**What could go wrong:** `cgInstance` captured in closure before `initGround()` is called.
**How to diagnose:** Board renders but moves are not interactive.
**Roll back if:** Board does not render or moves produce no navigation.

**Estimated line reduction in main.ts:** ~430 lines

**Implemented:**
- `src/board/index.ts` created: `cgInstance`, `orientation`, `setOrientation`, `syncBoard`,
  `syncBoardAndArrow`, `flip`, `completeMove`, `uciToSan`, `renderBoard`, `renderPromotionDialog`,
  `renderPlayerStrips`, `initGround(deps)`, material diff types/constants/helpers, clock helpers,
  board resize handle
- Dep injection via `initGround(deps)`: `getCtrl`, `navigate`, `getImportedGames`,
  `getSelectedGameId`, `redraw` — avoids circular imports with main.ts
- `syncArrow` imported directly from `engine/ctrl.ts` (no circularity — board does not import batch)
- `boardZoom`, `applyBoardZoom`, `saveBoardZoom` imported from `board/cosmetics.ts`
- main.ts: removed ~430 lines; updated `loadGame` to use `setOrientation()` and
  `syncBoardAndArrow()`; added `initGround()` call at bootstrap; `initEngine` getCgInstance
  callback reads live ESM binding from board/index.ts
- Build verified: 299.3 KB ✓

---

## Step 13 — Extract ceval View ✓ COMPLETED 2026-03-19

**Goal:** Move all engine-lines rendering, PV board preview, and engine settings panel to
`src/ceval/view.ts`.

**Mirrors:** `ui/lib/src/ceval/view/main.ts`, `ui/lib/src/ceval/view/settings.ts`

**Move to `src/ceval/view.ts`:**
- State vars: `pvBoard`, `pvBoardPos`, `showEngineSettings`
- Functions: `renderCeval()`, `renderPvMoves()`, `renderPvBox()`, `playPvUciList()`,
  `renderPvBoard()`, `renderEngineSettings()`
- Constant: `MAX_PV_MOVES`
- Init: `initCevalView(deps)` to inject callbacks

**Init deps shape:**
```typescript
export function initCevalView(deps: {
  getCtrl:  () => AnalyseCtrl;
  navigate: (path: string) => void;
  redraw:   () => void;
}): void
```

**From:** `src/main.ts` lines ~724–1111
**To:** `src/ceval/view.ts`

**Why safe now:** All engine state reads (`currentEval`, `engineEnabled`, `engineReady`,
`batchAnalyzing`, `batchDone`, `batchQueue`, `multiPv`, `showEngineArrows`, `arrowAllLines`,
`showPlayedArrow`, `reviewDepth`, `analysisDepth`) are exported from `engine/ctrl.ts` and
`engine/batch.ts` and can be imported directly. `navigate` must be passed as a dep because
it lives in main.ts. `playPvUciList` needs `ctrl` and `navigate` — inject via `initCevalView`.

**What must not change:** `key: 'pv-rows'` on the pv_box element (keeps listeners attached
across renders). `key: 'pv-board-float'` on the floating board overlay.

**Exports needed by main.ts:**
- `renderCeval()`, `renderPvBox()`, `renderPvBoard()`, `renderEngineSettings()`

**How to test:**
- [ ] Engine toggle renders correctly (Off / On / Loading…)
- [ ] PV lines appear and update during live analysis
- [ ] Hovering a PV move shows the floating board preview
- [ ] Clicking a PV move navigates to that position
- [ ] Engine settings panel opens from gear icon
- [ ] MultiPV slider changes number of rendered PV rows
- [ ] Review depth and analysis depth selects update their values

**What could go wrong:** `playPvUciList` capturing a stale `ctrl` reference.
**How to diagnose:** Clicking a PV move produces no navigation.
**Roll back if:** PV box renders empty or engine settings panel does not open.

**Estimated line reduction in main.ts:** ~390 lines

---

## Step 14 — Extract PGN Export and Analysis Controls ✓ COMPLETED 2026-03-19

**Goal:** Move PGN building, download, export menu state, and `renderAnalysisControls()`
to `src/analyse/pgnExport.ts`.

**Mirrors:** `ui/analyse/src/pgnExport.ts`, `ui/analyse/src/view/controls.ts` (review button)

**Move to `src/analyse/pgnExport.ts`:**
- State var: `showExportMenu`
- Functions: `buildPgn()`, `downloadPgn()`, `renderAnalysisControls()`
- Init: `initPgnExport(deps)` to inject callbacks

**Init deps shape:**
```typescript
export function initPgnExport(deps: {
  getCtrl:          () => AnalyseCtrl;
  getImportedGames: () => ImportedGame[];
  getSelectedGameId:() => string | null;
  redraw:           () => void;
}): void
```

**From:** `src/main.ts` lines ~1123–1289
**To:** `src/analyse/pgnExport.ts`

**Why safe now:** `buildPgn` reads `ctrl.mainline`, `evalCache`, `importedGames`,
`selectedGameId` — all importable or injectable. `renderAnalysisControls` reads batch state
from `engine/batch.ts` and calls `startBatchWhenReady`, `stopProtocol`, setters — all
exported. `clearAnalysisFromIdb`, `clearEvalCache`, `resetCurrentEval`,
`clearPuzzleCandidates`, `resetBatchState`, `syncArrow` — all exported from their modules.

**Exports needed by main.ts:**
- `renderAnalysisControls()`
- `downloadPgn(annotated: boolean)` (still referenced in `renderHeader` for global menu export)

**How to test:**
- [ ] Export PGN button opens the export sub-menu
- [ ] Annotated export contains `[%eval ...]` comments
- [ ] Plain export has no annotations
- [ ] Review button starts batch analysis
- [ ] During analysis, button shows percentage progress
- [ ] Cancel stops analysis and saves partial results
- [ ] Re-analyze clears old results and re-runs

**What could go wrong:** `downloadPgn` referenced in `header/index.ts` HeaderDeps — ensure
it remains importable from `analyse/pgnExport.ts` after move.
**How to diagnose:** Export PGN does nothing or produces empty file.
**Roll back if:** Review button is permanently disabled or export produces no download.

**Estimated line reduction in main.ts:** ~175 lines

**Implementation notes (2026-03-19):**
- `src/analyse/pgnExport.ts` created: `showExportMenu` (module state), `buildPgn`,
  `downloadPgn`, `renderAnalysisControls`, `initPgnExport(deps)`
- Deps shape extended beyond plan: added `buildAnalysisNodes` and `clearGameAnalysis`
  callbacks (needed by review cancel/re-analyze flows)
- `clearGameAnalysis` local function added in main.ts: wraps `clearAnalysisFromIdb` +
  `analyzedGameIds.delete` + `missedTacticGameIds.delete`
- Added missing explicit declarations in main.ts: `analyzedGameIds`, `missedTacticGameIds`,
  `analyzedGameAccuracy` (were latent implicit globals)
- Removed from main.ts imports: `saveAnalysisToIdb`, `setAwaitingStopBestmove`,
  `stopProtocol`, `setBatchAnalyzing`, `batchQueue`, `batchDone`, `analysisRunning`,
  `setAnalysisRunning`, `startBatchAnalysis`
- Build verified: 301.0 KB ✓
- main.ts: 758 lines (down from 902 → 758)

---

## Step 15 — Extract Keyboard Navigation ✓ COMPLETED 2026-03-19

**Goal:** Move all keyboard navigation functions, the keyboard help overlay, and the
document keydown listener to `src/keyboard.ts`.

**Mirrors:** `ui/analyse/src/keyboard.ts`, `ui/analyse/src/control.ts`

**Move to `src/keyboard.ts`:**
- State var: `showKeyboardHelp`
- Functions: `previousBranch()`, `nextBranch()`, `nextSibling()`, `prevSibling()`,
  `playBestMove()`, `renderKeyboardHelp()`
- Document event listener registration: `bindKeyboardHandlers(deps)`

**The navigation helpers `next`, `prev`, `first`, `last`, `navigate`, `scrollActiveIntoView`
stay in main.ts for now** — they are tiny and tightly coupled to the main redraw loop.
`keyboard.ts` calls them via injected callbacks.

**Init deps shape:**
```typescript
export function bindKeyboardHandlers(deps: {
  getCtrl:     () => AnalyseCtrl;
  navigate:    (path: string) => void;
  next:        () => void;
  prev:        () => void;
  first:       () => void;
  last:        () => void;
  flip:        () => void;
  completeMove:(orig: string, dest: string, promotion?: Role) => void;
  redraw:      () => void;
}): void
```

**From:** `src/main.ts` lines ~1446–1584
**To:** `src/keyboard.ts`

**Why safe now:** All keyboard functions depend only on `ctrl` (injectable), navigation
callbacks, engine exports (`toggleEngine`, `toggleThreatMode`, `setShowEngineArrows`,
`syncArrow`, `currentEval`), and board exports (`flip`). These are all importable or
injectable without circularity.

**Exports needed by main.ts:**
- `bindKeyboardHandlers(deps)` (called at bootstrap)
- `renderKeyboardHelp()` (called from routeContent / view)

**How to test:**
- [ ] ← / → navigate prev/next move
- [ ] ↑ / ↓ jump to first/last move
- [ ] Shift + ← / → jump to previous/next branch
- [ ] Shift + ↑ / ↓ switch sibling variation
- [ ] Space plays engine best move
- [ ] l toggles engine, a toggles arrows, x toggles threat, f flips board
- [ ] ? opens and closes the keyboard help overlay

**What could go wrong:** `playBestMove` calling `completeMove` which is in board/index.ts —
inject as a callback dep.
**How to diagnose:** Keyboard shortcuts do nothing or throw console errors.
**Roll back if:** Arrow key navigation stops working.

**Estimated line reduction in main.ts:** ~140 lines

**Implementation notes (2026-03-19):**
- `src/keyboard.ts` created: `showKeyboardHelp` (module state), `previousBranch`,
  `nextBranch`, `nextSibling`, `prevSibling`, `playBestMove`, `renderKeyboardHelp`,
  `bindKeyboardHandlers(deps)` (registers keydown listener)
- `toggleEngine`, `toggleThreatMode`, `setShowEngineArrows`, `showEngineArrows`,
  `syncArrow` imported directly from `engine/ctrl` — no injection needed
- Removed from main.ts: `Role` import, `toggleThreatMode`, `toggleEngine`,
  `setShowEngineArrows`, `showEngineArrows` imports (all moved into keyboard.ts)
- `pathInit` stays in main.ts (still used by `prev()`)
- Build verified: 301.4 KB ✓
- main.ts: 638 lines (down from 758 → 638)

---

## Step 16 — Clean Up main.ts to Bootstrap Only ✓ COMPLETED 2026-03-19

**Goal:** After Steps 12–15, audit main.ts for any remaining extractable code and move
it to its rightful owner. Target: main.ts is ≤ 400 lines containing only bootstrap,
view assembly, route dispatch, `redraw()`, and event wiring.

**Candidates for final extraction:**
- `gameResult()`, `gameSourceUrl()`, `renderCompactGameRow()`, `getUserColor()` → could
  move to `src/games/view.ts` or stay in main.ts as game-library helpers
- `buildAnalysisNodes()` → could move to `src/idb/index.ts` as a pure helper
- `gamesViewDeps()` factory → can be inlined into `routeContent()`
- Navigation helpers `navigate`, `next`, `prev`, `first`, `last`, `scrollActiveIntoView`
  → could move to `src/keyboard.ts` or `src/analyse/controls.ts`

**What must stay in main.ts (bootstrap only):**
- Snabbdom `patch` init
- `app`, `currentRoute`, `vnode`, `redraw()`
- `initEngine()`, `initBatch()`, `initGround()`, `initCevalView()`, `initPgnExport()`,
  `bindKeyboardHandlers()` calls
- `view(route)` — top-level vnode assembly
- `routeContent(route)` — route dispatch
- `onChange()` subscription
- IDB startup restore calls
- Wheel event listener

**From:** `src/main.ts` lines remaining after Steps 12–15
**To:** Most likely no new files needed — inline the factories, delete the dead code

**How to test:**
- [ ] Full smoke test: import games, analyze, navigate, export PGN, puzzles, reset
- [ ] All keyboard shortcuts work
- [ ] Page reload restores state
- [ ] main.ts line count ≤ 400

**Estimated final line count in main.ts:** ~350 lines

**Implementation notes (2026-03-19):**
- Moved `getUserColor`, `gameResult`, `gameSourceUrl`, `renderCompactGameRow` → `src/games/view.ts`
  as exported functions; removed from main.ts
- `gamesViewDeps()` factory inlined into `routeContent()` as a local `deps` object
- Removed unused imports: `evalWinChances`, `rawWinChances`, `formatScore`, `AnalysisSummary`,
  `AnalysisStatus`, `BatchState`, `orientation`, `analysisDepth`, `chesscom`, `lichess`,
  `parsePgnHeader`
- Removed stale extraction comment blocks from Steps 12–15
- Actual final line count: **507 lines** (400 not achievable; `loadGame`, `loadAndRestoreAnalysis`,
  `buildAnalysisNodes`, navigation helpers, and route assembly genuinely belong here)
- Build verified: 301.9 KB ✓
- main.ts: 507 lines (down from 4241 original → 507, −88% total reduction)

---

## Section 6: State Ownership Plan

---

**importedGames**
- Current location: main.ts module scope, declared ~line 250
- Owner after refactor: `src/games/index.ts`
- Access pattern: module-exported array
- Who may read: header/index.ts, games/view.ts, idb/index.ts, analyse/view.ts (player strips),
  engine/batch.ts (getUserColor for missed tactics)
- Who must NOT mutate directly: any render function; only import adapters and bootstrap
- Current risk: Written from 6 call sites including import adapters and bootstrap IDB restore.
  No mutation guard. The risk is low because writes always assign a new array rather than
  mutating in place.

---

**selectedGameId**
- Current location: main.ts module scope
- Owner after refactor: `src/games/index.ts`
- Access pattern: module-exported, mutable only via explicit setter
- Who may read: all rendering modules
- Who must NOT mutate directly: render functions; only game-loading code
- Current risk: Written from header game item click handlers and import adapter success
  handlers. These are legitimate mutation sites. No unexpected mutation detected.

---

**evalCache**
- Current location: main.ts module scope, `const evalCache = new Map<string, PositionEval>()`
- Owner after refactor: `src/engine/ctrl.ts` or `src/engine/batch.ts` (they share it;
  batch writes it, ctrl reads it)
- Access pattern: exported Map; read-only reference for all consumers outside engine/
- Who may read: analyse/moveList.ts, analyse/summary.ts, analyse/view.ts (graph),
  puzzles/extract.ts, idb/index.ts
- Who must NOT mutate directly: any render function, games/view.ts, header/index.ts
- Current risk: HIGH. Written from engine bestmove handler, `advanceBatch()`,
  `loadAndRestoreAnalysis()`, `reviewClick()` (inside render), and `loadGame()`.
  The render-function mutation (`reviewClick` calls `evalCache.clear()`) is a clear
  violation — this should be a dedicated reset function owned by engine/batch.

---

**ctrl (AnalyseCtrl instance)**
- Current location: main.ts module scope, replaced on each `loadGame()`
- Owner after refactor: `src/analyse/ctrl.ts` (extend to hold the active instance),
  or main.ts as the game-loading orchestrator
- Access pattern: exported reference, replaced on game load
- Who may read: all board/engine/tree rendering subsystems
- Who must NOT mutate directly: only `loadGame()` may replace the instance
- Current risk: HIGH. The `ctrl` reference is captured in closures (Snabbdom hooks, event
  handlers). When `loadGame()` replaces it, any stale closure holding the old reference
  will use the old tree. The primary risk case is `loadAndRestoreAnalysis()` which is
  async and may complete after the game has changed.

---

**currentEval**
- Current location: main.ts module scope
- Owner after refactor: `src/engine/ctrl.ts`
- Access pattern: exported; read-only for rendering
- Who may read: analyse/view.ts (eval bar), engine lines (PV box), board/index.ts
  (via syncArrow), keyboard (playBestMove)
- Who must NOT mutate directly: render functions. Only engine/ctrl.ts and engine/batch.ts
  may write `currentEval`.
- Current risk: HIGH. Written from `parseEngineLine()`, `evalBatchItem()`, `loadGame()`,
  `loadAndRestoreAnalysis()`, and `renderEngineSettings()` (on multiPv change). The
  render-function mutation is a violation.

---

**batchState / batchAnalyzing / analysisComplete**
- Current location: main.ts module scope
- Owner after refactor: `src/engine/batch.ts`
- Access pattern: exported booleans/enum; read by render, written only by batch module
- Who may read: all render subsystems that show analysis state
- Who must NOT mutate directly: render functions, header
- Current risk: HIGH. `batchAnalyzing` and `batchState` are reset from `loadGame()` and
  from the Review button click handler inside `renderAnalysisControls()`. The render
  handler directly mutates batch state — this is wrong and must be corrected during
  extraction by moving the mutation into batch.ts exposed functions.

---

**orientation**
- Current location: main.ts module scope
- Owner after refactor: `src/board/index.ts`
- Access pattern: exported; mutable only via `flip()`
- Who may read: board/index.ts (board init, player strips, promotion dialog, PV board),
  engine autoShape (for future perspective-aware arrow drawing)
- Who must NOT mutate directly: import adapters, render functions (except `flip()`)
- Current risk: LOW. Only `flip()` and `loadGame()` write it. `loadGame()` sets it to the
  user's color — this is correct behavior.

---

**savedPuzzles**
- Current location: main.ts module scope
- Owner after refactor: `src/idb/index.ts`
- Access pattern: exported array; written only by `savePuzzle()` and IDB restore
- Who may read: games/view.ts (puzzle count column), puzzles/extract.ts
- Who must NOT mutate directly: render functions
- Current risk: LOW. Written from `savePuzzle()` (on user action) and startup IDB load.

---

**showImportPanel / showGlobalMenu / showBoardSettings**
- Current location: main.ts module scope
- Owner after refactor: `src/header/index.ts`
- Access pattern: module-local state; not exported
- Who may read: header render only
- Who must NOT mutate directly: board render, engine render
- Current risk: LOW. These are UI-only panel toggles with no cross-module consequences.

---

**Games tab filter state (gamesFilterResults, gamesFilterSpeeds, gamesFilterOpponent,
gamesFilterColor, gamesSortField, gamesSortDir)**
- Current location: main.ts module scope
- Owner after refactor: `src/games/view.ts`
- Access pattern: module-local; not exported
- Who may read: games/view.ts only
- Who must NOT mutate directly: header, analysis view, engine
- Current risk: LOW. Correctly isolated within the games view rendering logic.

---

**Import form state (chesscomUsername, lichessUsername, chesscomLoading, lichessLoading,
chesscomError, lichessError, importFilterSpeeds, importFilterDateRange, pgnInput, pgnError)**
- Current location: main.ts module scope
- Owner after refactor: split across games/import/chesscom.ts, games/import/lichess.ts,
  games/import/pgn.ts, games/import/filters.ts
- Access pattern: module-local within each adapter; username state exported for display
  in the header input field
- Who may read: header render (for showing current username, loading state, error)
- Who must NOT mutate directly: board, engine, games view
- Current risk: LOW. These are correctly contained within the import panel UI.

---

## Section 7: Future Development Rules

---

**Rule 1: main.ts is bootstrap only after refactor**
No new feature logic may be added to main.ts after the refactor is complete. main.ts
contains only: patch initialization, view assembly function, route dispatch, redraw(),
event listener registration, and IDB startup calls. Violations should be caught in code review.
This prevents the original accumulation problem from recurring.

---

**Rule 2: State ownership is one module per domain**
Each module-level state variable must have exactly one owner module that is the only
allowed writer. All other modules receive read access only via imports or function parameters.
This prevents the evalCache and currentEval write-from-anywhere problem.

---

**Rule 3: Render functions are pure**
A render function (any function returning VNode) must not mutate module state directly.
State changes happen in named handler functions; render functions call those handlers via
event callbacks. Violations like the current `reviewClick()` inside `renderAnalysisControls()`
resetting `evalCache` directly are prohibited.

---

**Rule 4: Extract before adding features**
Any new feature that would add more than 20 lines to an already-at-capacity module triggers
an extraction task first. The extraction and the feature are separate commits.
This enforces the principle that feature work does not happen while modules are still too large.

---

**Rule 5: No new globals in main.ts**
After the refactor is complete, zero new module-level variables may be added to main.ts.
New state belongs in the module that owns that domain.

---

**Rule 6: Engine callbacks use session tokens**
Any async callback that writes to evalCache or ctrl-derived state (loadAndRestoreAnalysis,
engine bestmove handler) must validate a session token before committing. Token is set on
each `loadGame()` call and checked in the async callback before any write.
This directly addresses the HIGH severity game-switch race condition.

---

**Rule 7: Separate extraction from behavior change**
A PR that moves code to a new file must not also change the behavior of that code.
Extraction steps are pure file-organization changes. Bug fixes happen in a separate PR
before or after the extraction. This makes extractions easy to review and roll back.

---

**Rule 8: IDB writes are never triggered from render functions**
All IDB writes must be triggered by user action handlers or engine callbacks, never from
within a vnode-building function. Render functions are called multiple times per second
during engine search; an IDB write inside one would trigger excessive transactions.
`saveGamesToIdb()` is currently called from `navigate()`, which is correct behavior.

---

**Rule 9: gameIdCounter is persisted**
After the game library module is extracted, `gameIdCounter` initialization must read the
maximum existing numeric game id from `importedGames` on IDB restore. This is the fix for
the CRITICAL game-id collision bug and must be part of the extraction of games/index.ts.

---

**Rule 10: New route views live in dedicated modules**
When puzzle play (Step 12), openings trainer, or stats are implemented, each gets its own
module under `src/puzzles/`, `src/openings/`, `src/stats/`. The route's vnode is assembled
in that module and returned from `routeContent()` in main.ts. Route views do not accumulate
in main.ts.

---

**Rule 11: Engine settings are persisted on change**
`reviewDepth`, `analysisDepth`, and `multiPv` must be read from localStorage on init and
written on change, using the same pattern as `ZOOM_KEY`. This is a prerequisite for the
engine/ctrl.ts extraction since it affects initialization order.

---

**Rule 12: Dead code is deleted, not moved**
`renderChesscomImport()`, `renderLichessImport()`, and `renderImportFilters()` are deleted
in Step 4. They are not moved to any module. During future development, unused code paths
must be removed at the time they are superseded, not left in place.

---

**Rule 13: loadAndRestoreAnalysis is fully guarded before it ships**
The session token fix (Rule 6) must be applied to `loadAndRestoreAnalysis()` before or
during Step 5 (IDB extraction). The HIGH severity race condition it causes is not acceptable
in a shipped state.

---

**Rule 14: The analysis view uses a single renderAnalysisView() function**
After extraction, `routeContent('analysis')` calls a single `renderAnalysisView()` imported
from `src/analyse/view.ts`. That function owns the CSS grid layout assembly. Inner panels
(move list, PV box, eval bar, summary) are imported from their respective modules.
The current inline case statement in `routeContent` is temporary scaffolding.

---

**Rule 15: Wheel handler class name must match rendered DOM**
The wheel event handler uses `.analyse__board-wrap` which does not exist. After Step 10
(header extraction), fix the handler to use `.analyse__board-inner` which is the actual
wrapper element. This is documented as a CRITICAL known issue.

---

## Section 8: Refactor Completion Criteria

---

### What remains in main.ts (by responsibility, not line count)

When the refactor is complete, main.ts contains:

1. `import` statements for all module exports
2. `const patch = init([...])` — Snabbdom initialization
3. `function view(route)` — assembles `renderHeader(route)` + `routeContent(route)` +
   `renderPvBoard()`
4. `function routeContent(route)` — dispatches to `renderAnalysisView()`, `renderGamesView()`,
   `renderPuzzlesView()` (future), and stub routes
5. `function redraw()` — the `patch(vnode, view(currentRoute))` cycle
6. `onChange()` subscription to router
7. `document.addEventListener('keydown', ...)` — thin wrapper that calls into keyboard
   module functions
8. `document.addEventListener('wheel', ...)` — fixed class name, calls `next()`/`prev()`
9. Bootstrap startup: IDB restore calls delegated to games/ and idb/ modules
10. `resetAllData()` utility or import of it from idb/

Target: ~300–400 lines

---

### What has been extracted (list of files)

After all steps complete:

- `src/engine/winChances.ts` — pure win-chance computation
- `src/engine/types.ts` — engine type interfaces
- `src/engine/ctrl.ts` — engine lifecycle, eval, arrows
- `src/engine/batch.ts` — batch analysis queue
- `src/board/settings.ts` — board cosmetics (theme/piece/filter/zoom)
- `src/board/index.ts` — Chessground init, syncBoard, syncArrow, player strips
- `src/games/index.ts` — game library state, metadata helpers
- `src/games/import/filters.ts` — import filter state and logic
- `src/games/import/chesscom.ts` — Chess.com API adapter
- `src/games/import/lichess.ts` — Lichess API adapter
- `src/games/import/pgn.ts` — PGN paste handler
- `src/games/view.ts` — games view rendering
- `src/idb/index.ts` — IndexedDB persistence
- `src/analyse/moveList.ts` — move list / tree view rendering
- `src/analyse/summary.ts` — accuracy computation and summary render
- `src/analyse/view.ts` — analysis board vnode assembly, eval bar, eval graph
- `src/header/index.ts` — header render, import panel, global menu
- `src/puzzles/extract.ts` — puzzle candidate extraction and render

---

### Behaviors that must still work (concrete test checklist)

Navigation:
- [ ] Arrow keys navigate forward and backward through moves
- [ ] Shift+arrows jump to next/previous fork
- [ ] Shift+up/down cycle through sibling variations
- [ ] Clicking a move in the move list navigates to it
- [ ] Clicking the eval graph navigates to that position
- [ ] Mouse wheel over board navigates (requires class fix)

Engine:
- [ ] L key toggles engine on/off
- [ ] Engine pearl shows correct eval after navigation
- [ ] PV lines show correct moves and scores
- [ ] PV hover board preview appears on mouseover
- [ ] PV click adds moves to tree and navigates
- [ ] Eval bar fills correctly (white winning = more filled)
- [ ] x key toggles threat mode with red arrow
- [ ] Space bar plays engine best move

Board:
- [ ] Moves can be played by drag or click
- [ ] Pawn promotion dialog appears and works
- [ ] Board flip (f key and Flip button) works
- [ ] Engine arrows (paleBlue top line, paleGrey secondary) appear and disappear
- [ ] Board themes, piece sets, and filter sliders work and persist
- [ ] Board resize handle works

Import:
- [ ] Chess.com username import works
- [ ] Lichess username import works
- [ ] PGN paste import works
- [ ] Import filters (speed, date range, rated) apply correctly
- [ ] Games persist across page reload

Analysis:
- [ ] Review button starts batch analysis
- [ ] Progress % shows during batch
- [ ] Blunder/mistake/inaccuracy glyphs appear in move list after batch
- [ ] Eval graph appears after batch
- [ ] Accuracy summary shows correct % for white and black
- [ ] Re-analyze clears and restarts correctly
- [ ] Analysis persists across page reload

Games view:
- [ ] Games table renders all imported games
- [ ] Sort by date/result/opponent/time works
- [ ] Result/speed/color/opponent filters work
- [ ] Review button in games view loads game and starts batch
- [ ] Puzzle count column shows saved puzzle count

Puzzles:
- [ ] Find Puzzles extracts candidates after analysis
- [ ] Clicking a candidate navigates to the mistake position
- [ ] Save stores the puzzle
- [ ] Saved count persists across reload

---

### Architectural signals that indicate stability

1. No module imports from main.ts (all dependencies flow into main.ts, not out of it)
2. `evalCache` is written from exactly two call sites: engine bestmove handler and
   `loadAndRestoreAnalysis()`, both guarded by session token
3. All render functions return VNode without side effects; state mutation is in named
   handler functions only
4. TypeScript strict mode passes with no `any` additions beyond what already exists
5. The Lichess `CevalCtrl`-equivalent (engine/ctrl.ts) exports a clean interface that
   does not expose protocol or internal engine state directly
6. `loadGame()` is the single point of game context reset — no other function clears
   evalCache, replaces ctrl, or resets batch state

---

### When it is safe to resume major feature work

It is safe to resume major feature work (puzzle play, openings trainer, stats dashboard)
after Steps 1–9 are complete (Steps 1–8 extract independent subsystems; Step 9 extracts
puzzle extraction). Steps 10 and 11 (header and engine extraction) may run in parallel with
feature work if the feature lives in a new module that does not touch the remaining globals.

The CRITICAL bugs (game-id collision, wheel scroll) must be fixed independently of refactor
progress — they can be fixed in main.ts at any time before their hosting module is extracted.

The HIGH severity race conditions (engine eval writes to wrong game, loadAndRestoreAnalysis
writes to wrong game) must be fixed before or during Steps 5 and 11 respectively.

Puzzle play (route `#/puzzles`) is the highest-priority feature addition. It can begin
after Step 9 creates `src/puzzles/extract.ts`, since the puzzle play UI will live in
`src/puzzles/play.ts` and `routeContent('puzzles')` will import from it.
