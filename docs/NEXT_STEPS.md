# Patzer Pro — Next Steps (Prioritized Roadmap)

Date: 2026-03-19 (updated — post-audit refactor-first edition)
Based on: full audit of src/main.ts (4241 lines), REFACTOR_PLAN.md (11 extraction steps),
KNOWN_ISSUES.md, ARCHITECTURE.md

The refactor (splitting main.ts into modules per REFACTOR_PLAN.md) is now the first priority.
Stability bugs and feature gaps come after. This ordering reflects the reality that main.ts at
4241 lines makes every bug fix and new feature harder to implement correctly and safely.

Each item identifies the extraction step it requires or unblocks. Extraction steps are numbered
as defined in REFACTOR_PLAN.md (Steps 1–11).

---

## Priority 0 — Refactor: Extract main.ts subsystems

These are not optional. Feature work in Priority 2+ will be harder, riskier, and more likely
to introduce regressions if done inside a 4241-line monolith.

Do the extraction steps in order. Each step has a defined "what moves", "why safe now", and
"test checklist" in REFACTOR_PLAN.md Section 5.

---

### Step 1: Extract win-chances pure functions

**What moves:** `winningChances()`, `cpToScore()`, WDL helper — ~lines 487–518 in main.ts
**To:** `src/engine/winchances.ts`
**Why first:** Zero dependencies. Pure math. Cannot break anything.
**Unblocks:** Step 6 (engine eval), Step 7 (batch review)

---

### Step 2: Extract board cosmetics

**What moves:** `applyBoardZoom`, `applyBoardTheme`, `applyPieceSet`, `setFilter`,
`resetFilters`, `filtersAtDefault`, `boardThumbnailUrl`, `piecePreviewUrl`, all BOARD_*/PIECE_*
constants/vars, `boardZoom`, `boardTheme`, `pieceSet`, `boardFilters` — ~lines 124–248
**Also moves:** `renderBoardSettings()`, `renderFilterSlider()` (render functions that only
depend on cosmetics state)
**To:** `src/board/cosmetics.ts`
**Why safe:** No dependency on ctrl, cgInstance, engine, or import state.
**Unblocks:** Step 5 (board/ground), Step 7 (analysis view)

---

### Step 3: Extract import filters constants

**What moves:** `SPEED_FILTERS`, `DATE_RANGE_FILTERS`, `importFilterSpeeds`,
`importFilterDateRange`, `importFilterDateRanges`, `filterGamesByDate` — ~lines 3211–3260
**To:** `src/import/filters.ts`
**Why safe:** Data constants and one pure filter function. No coupling to engine or ctrl.
**Unblocks:** Step 4 (import adapters)

---

### Step 4: Extract import adapters

**What moves:** `fetchChesscomGames`, `importChesscom`, Chess.com form state — to
`src/import/chesscom.ts`. `fetchLichessGames`, `importLichess`, Lichess form state — to
`src/import/lichess.ts`. `pgnInput`, `pgnError`, `importPgn`, `renderPgnImport` — to
`src/import/pgn.ts`.
**Also removes:** `renderChesscomImport`, `renderLichessImport`, `renderImportFilters`
(confirmed dead code — not reachable from any routeContent path).
**Depends on:** Step 3 (filters)
**Why safe:** Import adapters only write to `importedGames` (via a setter import from
games/library.ts after Step 9). The dead code removal reduces main.ts by ~150 lines with
no behavioral change.
**Unblocks:** Step 8 (shell/nav)

---

### Step 5: Extract IDB core

**What moves:** `openGameDb()`, `_idb` singleton, store name constants — ~lines 297–340
**To:** `src/idb/core.ts`
**Why safe:** Pure IDB plumbing. No coupling to application state.
**Unblocks:** Steps 9, 10 (game library, puzzle state — both need IDB)

---

### Step 6: Extract engine lifecycle

**What moves:** `engineEnabled`, `engineReady`, `engineInitialized`, `engineSearchActive`,
`awaitingStopBestmove`, `pendingEval`, `toggleEngine`, `startBatchWhenReady`,
`pendingBatchOnReady` — ~lines 519–640
**To:** `src/engine/lifecycle.ts`
**Depends on:** Step 1 (winchances is a dependency of eval, keep lifecycle clean)
**Why safe:** Lifecycle state is read/written only by engine functions. No UI rendering
depends on it directly (UI reads `engineEnabled` only in renderCeval and renderEngineSettings —
those will import from this module after Step 7).
**Unblocks:** Step 7 (engine eval needs lifecycle state)

---

### Step 7: Extract engine eval and batch review

**What moves:** `evalCache`, `currentEval`, `evalNodePath`, `evalNodePly`, `evalParentPath`,
`pendingLines`, `parseEngineLine`, `evalCurrentPosition`, `evalThreatPosition`,
`toggleThreatMode`, `evalBatchItem`, `startBatchAnalysis`, `advanceBatch`,
`detectMissedTactics`, `computeAnalysisSummary`, `buildArrowShapes`, `syncArrowDebounced`,
`batchQueue`, `batchDone`, `batchAnalyzing`, `batchState`, `reviewDepth`, `analysisDepth`,
`multiPv`, `analysisRunning`, `analysisComplete`, `analyzedGameIds`, `missedTacticGameIds`,
`analyzedGameAccuracy`, `saveAnalysisToIdb`, `loadAndRestoreAnalysis` — ~lines 440–1265
**To:** `src/engine/eval.ts`
**Depends on:** Steps 1, 5, 6
**Why safe at this step:** After Steps 1, 5, 6, the only remaining coupling is to `ctrl`
(imported from analyse/ctrl.ts), `cgInstance` (imported from board/ground.ts after Step 5),
and `selectedGameId` (imported from games/library.ts after Step 9). Use a setter function
until Step 9 is complete.
**This is the largest single extraction.** Split into two commits if needed: (a) move state
vars and pure functions, (b) move IDB functions.
**Unblocks:** Step 10 (analysis view), Step 11 (keyboard nav)

---

### Step 8: Extract shell nav and header

**What moves:** `renderNav`, `renderHeader`, `renderGlobalMenu`, `closeGlobalMenu`,
`activeSection`, `navLinks`, panel open/close flags (`showImportPanel`, `showEngineSettings`,
`showGlobalMenu`, `showBoardSettings`) — ~lines 1761–2130
**To:** `src/shell/nav.ts`
**Depends on:** Step 4 (import adapters — header dispatches to them)
**Why safe:** Nav rendering has no engine or IDB coupling. Panel flags are UI-only.
**Unblocks:** Final main.ts cleanup

---

### Step 9: Extract game library

**What moves:** `ImportedGame` interface, `importedGames`, `selectedGameId`,
`selectedGamePgn`, `gameIdCounter`, `SAMPLE_PGN`, `timeClassFromTimeControl`,
`gameSourceUrl`, `gameResult`, `getUserColor`, `renderCompactGameRow`, `opponentName`,
`parsePgnHeader`, `parseRating`, `saveGamesToIdb`, `loadGamesFromIdb`, `loadGame` — ~lines
250–295, ~3527–3545, ~1520–1600
**To:** `src/games/library.ts`
**Also extracts:** `renderGamesView`, `renderGameList`, games view filter/sort state — to
`src/games/view.ts`
**Depends on:** Step 5 (IDB core)
**Why safe at this step:** After Steps 5–7, game library state is read by fewer remaining
functions in main.ts. `loadGame()` still calls `loadAndRestoreAnalysis()` (engine/eval.ts)
and `syncBoard()` (board/ground.ts) — wire via imports.
**Unblocks:** Step 10, Step 11

---

### Step 10: Extract analysis board rendering

**What moves:** `renderMoveSpan`, `renderInlineNodes`, `renderColumnNodes`, `renderMoveList`,
`renderEvalBar`, `renderEvalGraph`, `renderCeval`, `renderPvMoves`, `renderPvBox`,
`renderPvBoard`, `renderEngineSettings`, `renderAnalysisControls`, `renderAnalysisSummary`,
`renderPuzzleCandidates`, `classifyLoss`, `moveAccuracyFromDiff`, `aggregateAccuracy` — ~lines
2131–3210
**To:** `src/analyse/view.ts`
**Depends on:** Steps 7, 9 (needs eval state and game library)
**This is the largest render block** (~900 lines). Move in sub-groups by function:
(a) move classification helpers + move list render
(b) eval bar + eval graph
(c) ceval box + PV board + engine settings
**Unblocks:** Final main.ts is now ~700 lines (Steps 8, 11 still pending)

---

### Step 11: Extract board sync and keyboard navigation

**What moves:** `cgInstance`, `orientation`, `syncBoard`, `syncArrow`, `syncArrowDebounced`,
`flip`, `bindBoardResizeHandle`, `renderBoard`, `renderPlayerStrips`, material diff helpers,
`computeDests`, `onUserMove`, `completeMove`, `completePromotion`, `renderPromotionDialog`,
`pvBoard` — ~lines 1266–1610 → `src/board/ground.ts`
**Also moves:** `previousBranch`, `nextBranch`, `nextSibling`, `prevSibling`, `playBestMove`,
`renderKeyboardHelp`, keyboard event listener — ~lines 4000–4150 → `src/shell/keyboard.ts`
**Depends on:** Steps 7, 9, 10
**Why last:** `cgInstance` and `ctrl` are referenced in many places. All dependents must be
extracted first.
**After this step:** main.ts is ~350 lines containing only imports, redraw(), view(),
routeContent(), resetAllData(), wheel event listener, startup sequence.

---

## Priority 1 — Stability bugs

Fix after the extraction step that touches the relevant code. Column shows which step cleans
up the context enough to make the fix safe.

---

### Fix game-id collision on reload + import

**Extraction step context:** Step 9 (games/library.ts)
**What:** In `loadGamesFromIdb()` callback, after restoring `importedGames`, scan all game ids
for the highest numeric suffix and set `gameIdCounter` to that value. Pattern:
`Math.max(...importedGames.map(g => parseInt(g.id.replace('game-', '')) || 0))`
**Why:** `gameIdCounter` starts at 0 every page load. Any reload + import produces collision
at `game-1`, corrupting analysis associations.
**Files:** `src/games/library.ts` (after Step 9), or `src/main.ts` (before Step 9)
**Risk:** Low. Pure initialization logic with no side effects.

---

### Fix wheel scroll CSS class mismatch

**Extraction step context:** Step 11 (board/ground.ts) or fix now in main.ts
**What:** In the wheel event handler, change:
```
document.querySelector('.analyse__board-wrap')
```
to:
```
document.querySelector('.analyse__board.main-board')
```
Verify by inspecting the DOM generated by `renderBoard()` in main.ts ~line 2380.
**Why:** `.analyse__board-wrap` does not exist in the rendered DOM. The handler silently
returns on every scroll event. Mouse wheel navigation is completely non-functional.
**Files:** `src/main.ts` wheel event listener (~line 4188), or `src/shell/keyboard.ts`
after Step 11
**Risk:** Low. One-line string change.

---

### Scope engine eval to current game

**Extraction step context:** Step 7 (engine/eval.ts)
**What:** Add `currentGameId: string | null` to engine/eval.ts. Set it in `loadGame()`.
In the bestmove handler, check `evalBatchItem.gameId === currentGameId` before
`evalCache.set()`. Store game id alongside each batch item.
**Why:** Bestmove callbacks can fire after game switch, writing game A's eval into game B's
evalCache if they share opening path prefixes.
**Files:** `src/engine/eval.ts` (after Step 7), `src/main.ts`/`games/library.ts` loadGame()
**Risk:** Medium. Requires adding gameId field to `BatchItem` and `evalBatchItem` signature.

---

### Add cancellation token to loadAndRestoreAnalysis

**Extraction step context:** Step 7 (engine/eval.ts)
**What:** Add `let loadAnalysisToken = 0` to engine/eval.ts. In `loadGame()`, increment it
and capture the value. `loadAndRestoreAnalysis()` captures the token at call time and checks
it before any `evalCache.set()` call. If the token changed, abandon the restore.
**Why:** Async IDB reads from game A complete after game B is loaded, corrupting evalCache.
**Files:** `src/engine/eval.ts` (after Step 7), `loadGame()` in games/library.ts
**Risk:** Medium. Token must be incremented before the IDB read starts.

---

### Fix awaitingStopBestmove to use a counter

**Extraction step context:** Step 6 (engine/lifecycle.ts)
**What:** Change `awaitingStopBestmove: boolean` to `awaitingStopCount: number`. Increment
on each `protocol.stop()` call. Decrement (not reset to false) on each stale bestmove.
Process bestmove as real only when `awaitingStopCount === 0`.
**Why:** Rapid Review toggle can produce two pending stop bestmoves. The second arrives
after the flag was cleared by the first, and is processed as a real result.
**Files:** `src/engine/lifecycle.ts` (after Step 6), or `src/main.ts` before Step 6
**Risk:** Low-medium. Behavioral change in an edge case. Normal usage is unaffected.

---

## Priority 2 — Feature gaps (critical to stated purpose)

These are features that are either entirely missing or broken in ways that affect core use.

---

### Implement puzzle play interface

**Extraction step context:** After Step 10 (all rendering extracted, clear space in main.ts)
**What:** Implement `#/puzzles` route. Add to `routeContent('puzzles')` in main.ts (then
move to `src/puzzles/play.ts` after the route dispatch is wired). Minimum viable version:
- List saved puzzles from `savedPuzzles`
- When selected: load puzzle.fen into a board, show side to move
- Accept user move input via Chessground
- Compare played move to `puzzle.bestMove`
- Show success or failure feedback with the correct move
- Next/previous puzzle navigation
**Why:** The puzzle system is the second core feature. It is entirely a stub (`h('h1', 'Puzzles Page')`).
**Files:** `src/puzzles/play.ts` (new), `src/main.ts` routeContent dispatch
**Lichess reference:** `ui/puzzle/src/ctrl.ts`, `ui/puzzle/src/moveTree.ts`

---

### Insert computer best-move node after batch analysis

**Extraction step context:** Step 7 (engine/eval.ts — advanceBatch)
**What:** After each batch position's bestmove arrives, if the played move is classified as
mistake or blunder (loss above threshold), insert a variation child node at the parent with:
- `comp: true` on the `TreeNode`
- the engine's best UCI as the move
This mirrors the Lichess `comp` node in the game tree. Add `comp?: boolean` to `TreeNode`
in `src/tree/types.ts`.
**Why:** Move list shows blunder annotations but no best alternative. User knows they blundered
but cannot see the correct move without running live engine at every mistake.
**Files:** `src/tree/types.ts`, `src/engine/eval.ts` (advanceBatch or bestmove handler)
**Lichess reference:** `ui/lib/src/tree/types.ts` — `comp` field on Node

---

### Fix previousBranch implementation

**Extraction step context:** Step 11 (shell/keyboard.ts)
**What:** Rewrite `previousBranch()`. The current implementation re-traverses the tree from
root with a manually reconstructed path slice. It does not reliably find fork parents in
complex variation trees. Replace with the Lichess pattern: walk `ctrl.nodeList` backwards
from the current index, find the first node where `node.children.length > 1`, navigate to
that path.
**Why:** Shift+Left keyboard shortcut may mis-navigate or skip variation forks.
**Files:** `src/shell/keyboard.ts` (after Step 11), or `src/main.ts` before Step 11
**Lichess reference:** `ui/analyse/src/control.ts` — `previousBranch` function

---

### Implement analysis-game deep link route

**Extraction step context:** Step 9 (games/library.ts — loadGame available as module)
**What:** In `routeContent('analysis-game')`, read `route.params.id`, find the matching
game in `importedGames`. If found, call `loadGame(game)` and render the analysis board.
If not found, render an error state (not a placeholder h1). Also handle the case where
IDB hasn't loaded yet (show a loading state).
**Why:** `#/analysis/game-5` URLs show a placeholder h1. Deep links to specific games are
a basic routing requirement.
**Files:** `src/main.ts` — `routeContent('analysis-game')` case
**Risk:** Medium. Must handle the async startup case (IDB not yet restored when link is hit).

---

## Priority 3 — Feature completion

Partially implemented features that need finishing.

---

### Persist engine settings to localStorage

**Extraction step context:** Step 6 (engine/lifecycle.ts)
**What:** Save `reviewDepth`, `analysisDepth`, and `multiPv` to localStorage when they change.
Read them back on initialization. Use the same pattern as `boardZoom` (ZOOM_KEY constant +
`localStorage.getItem` + `parseInt` with fallback).
**Why:** Changing review depth and reloading causes stored analysis to be rejected (depth
mismatch check). Users who set non-default depths must re-analyze every session.
**Files:** `src/engine/eval.ts` or `src/engine/lifecycle.ts` (after Steps 6–7)

---

### Persist accuracy to StoredAnalysis

**Extraction step context:** Step 7 (engine/eval.ts — saveAnalysisToIdb)
**What:** Add `accuracy: { white: number | null, black: number | null }` to the
`StoredAnalysis` interface. Write it from `computeAnalysisSummary()` into the IDB record
when saving `'complete'` status. Read it back in `loadAndRestoreAnalysis()` and populate
`analyzedGameAccuracy` for the restored game.
**Why:** Games view accuracy column shows `—` for all analyzed games after page reload.
Analysis results are restored but accuracy is recomputed from evalCache, which is only loaded
for the currently active game.
**Files:** `src/engine/eval.ts` — `StoredAnalysis` type, `saveAnalysisToIdb()`,
`loadAndRestoreAnalysis()`

---

### Fix partial-analysis Review button label

**Extraction step context:** Step 7 (engine/eval.ts — loadAndRestoreAnalysis)
**What:** In `loadAndRestoreAnalysis()`, when `stored.status === 'partial'`, set
`analysisComplete = false` and set a new flag `analysisHasPartialData = true`. Update the
Review button in `renderAnalysisControls()` to show "Continue Review" when
`analysisHasPartialData && !analysisComplete`.
**Why:** UI shows "Review" for both never-analyzed and interrupted states. Users cannot tell
if partial results are loaded.
**Files:** `src/engine/eval.ts`, `src/analyse/view.ts` (after Step 10)

---

### Fix Chess.com multi-month import

**Extraction step context:** Step 4 (import/chesscom.ts)
**What:** In `fetchChesscomGames()`, determine required archive months from
`importFilterDateRange` before fetching. Fetch months in sequence (most recent first), merge
results, then apply date filtering. The current code fetches only `archives[last]` regardless
of date range selection.
**Why:** Selecting "3 months" or "1 year" returns only the most recent month. The date filter
appears to work but silently truncates the source.
**Files:** `src/import/chesscom.ts` (after Step 4), or `src/main.ts` before Step 4

---

### Remove dead import UI functions

**Extraction step context:** Step 4 (confirmed dead during extraction)
**What:** Remove `renderChesscomImport()`, `renderLichessImport()`, and
`renderImportFilters()` from main.ts. These three functions (~150 lines total) are not
reachable from any `routeContent` path. Import is handled exclusively through the header
panel. Verify no call sites exist before removing.
**Why:** Dead code adds ~150 lines to a 4241-line file. The dead code removal is safe and
should happen as part of Step 4 extraction, not separately.
**Files:** `src/main.ts` (during Step 4 extraction)

---

## Priority 4 — Architecture improvements

Do these after Priority 0 (extraction) is complete. These require the modular structure.

---

### Move Stockfish to a Web Worker

**Extraction step context:** After Step 7 (engine/eval.ts and engine/lifecycle.ts extracted)
**What:** Implement `src/ceval/worker.ts` as a proper Web Worker that loads Stockfish and
bridges UCI messages via `postMessage`/`onmessage`. Update `StockfishProtocol` in
`src/ceval/protocol.ts` to communicate via the worker instead of calling `module.uci()`
directly.
**Why:** CLAUDE.md requires the engine to run in a Web Worker. Running Stockfish on the main
thread causes UI jank during batch analysis of long games.
**Files:** `src/ceval/worker.ts` (implement the stub), `src/ceval/protocol.ts`
**Lichess reference:** `ui/lib/src/ceval/engines/stockfishWebEngine.ts`
**Risk:** HIGH. SharedArrayBuffer and Emscripten pthreads interact with Worker in non-obvious
ways. This is a significant engineering task requiring browser testing.

---

### Attach batch evals to tree nodes

**Extraction step context:** After Steps 7, 10 (engine/eval.ts and analyse/view.ts extracted)
**What:** After batch analysis completes for a position, populate `node.eval` on the
corresponding `TreeNode` with the result (matching the `ServerEval` type in
`src/tree/types.ts`). Keep `evalCache` as a fast-access overlay. Adjust `renderMoveSpan`,
`renderEvalGraph`, and `computeAnalysisSummary` to prefer `node.eval` over
`evalCache.get(path)` when available.
**Why:** Eval data attached to tree nodes is portable, survives game-switch, and matches
the Lichess architecture where nodes carry their own eval.
**Files:** `src/tree/types.ts`, `src/engine/eval.ts`, `src/analyse/view.ts`
**Lichess reference:** `ui/lib/src/tree/types.ts` — `eval` field on Node

---

### Evaluate requestAnimationFrame batching for redraw()

**Extraction step context:** After all extraction (main.ts ~350 lines, clear view of redraw)
**What:** Wrap `redraw()` with rAF batching: if a redraw is already scheduled for this frame,
skip the redundant call. This prevents multiple Snabbdom patch calls on rapid key repeats
(e.g., holding arrow key through a 100-move game triggers a full vnode rebuild per keydown).
**Why:** Current behavior is correct but CPU-expensive on fast keyboard navigation.
**Files:** `src/main.ts` — `redraw()` function only
**Lichess reference:** Lichess uses a similar batching approach in some UI modules

---

## Completion Criteria for Priority 0

The extraction is complete when:

1. `src/main.ts` is ≤400 lines
2. All 11 extraction steps have been committed
3. The following behaviors are unchanged (manually verified):
   - Game import (Chess.com, Lichess, PGN paste) completes without error
   - Imported games appear in Games view and analysis game list
   - Clicking a game loads it into the analysis board
   - Move navigation works (next, prev, first, last, click on move, keyboard arrows)
   - Shift+Left/Right navigate branches (even if previousBranch is still buggy)
   - Engine toggle works: Off → On → analysis starts
   - Batch review runs to completion and annotates the move list
   - Eval bar and eval graph update correctly during and after batch
   - Board theme, piece set, zoom, and filter changes apply immediately
   - IDB restore on page reload restores the previously loaded game and its analysis
   - Puzzle candidates appear after batch review completes

Feature work (Priority 1–4) may begin after this criteria is met.
