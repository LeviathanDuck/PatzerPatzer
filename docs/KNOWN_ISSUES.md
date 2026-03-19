# Patzer Pro — Known Issues

Date: 2026-03-19
Source: Engineering audit of full codebase

---

## [CRITICAL] Game-id collision on reload + import

Game ids are generated as `game-${++gameIdCounter}` where `gameIdCounter` starts at 0 every page load. The counter is never persisted to IDB or localStorage.

When a user reloads and then imports new games, the new game ids (`game-1`, `game-2`, ...) collide with the ids of games that were already stored in IDB from a previous session.

Root cause: `gameIdCounter` is initialized as `let gameIdCounter = 0` at module scope and is never read from or written to any storage.

Impact: Duplicate game ids in `importedGames`. `selectedGameId`, `analyzedGameIds`, `missedTacticGameIds`, `analyzedGameAccuracy`, and IDB analysis records will point at the wrong game after the first collision. Analysis data from a previous session could be displayed for a different game. This affects any user who imports games across multiple page sessions.

---

## [CRITICAL] Wheel scroll navigation non-functional

The mousewheel scroll handler (around line 4188 in main.ts) checks for the board element using:
```
document.querySelector('.analyse__board-wrap')
```
The actual CSS class rendered by `routeContent` is `div.analyse__board.main-board` with an inner wrapper `div.analyse__board-inner`. There is no element with class `analyse__board-wrap` in the DOM.

Root cause: Class name mismatch between the wheel event handler and the rendered board structure.

Impact: Mouse wheel scrolling over the board to navigate moves does not work. The handler silently returns on every scroll event because `boardWrap` is always null.

---

## [HIGH] Engine bestmove can write into wrong game's evalCache

When a user starts batch review of game A, then loads game B before the engine finishes, the following race occurs:
- `loadGame()` resets batch state flags and clears `evalCache`
- The engine has already sent `go` for a position from game A
- When `bestmove` arrives, `awaitingStopBestmove` was reset by `loadGame()`
- The handler calls `evalCache.set(evalNodePath, stored)` with a path from game A's tree
- `evalCache` now contains a path from game A's analysis contaminating game B's context
- If game A and game B share an opening (common paths), the wrong eval is displayed for game B's early moves

Root cause: `evalNodePath` is a bare string with no game-id scope. There is no check in the bestmove handler to verify that the completed position belongs to the currently loaded game.

Impact: Wrong eval labels, graph data, and accuracy for game B. Severity increases if both games start with the same opening moves (identical path prefix → identical collision).

---

## [HIGH] loadAndRestoreAnalysis race on game switch

`loadAndRestoreAnalysis(gameId)` is async (IDB read). If the user loads game A, then quickly loads game B before the IDB read for A completes, the A callback will run and write A's eval entries into `evalCache`. At that point `ctrl` has been replaced with game B's tree.

Root cause: No cancellation mechanism. The async callback has no way to know that the game context changed while it was waiting on IDB.

Impact: Paths from game A's analysis appear in `evalCache` while game B is active. If A and B share opening path prefixes, the wrong eval is shown. The corruption resolves only when the user runs a new batch review that overwrites the contaminated entries.

---

## [HIGH] Puzzle play system is a stub

The `#/puzzles` route renders `h('h1', 'Puzzles Page')`. Extracted puzzle candidates can be saved to IDB but cannot be played. There is no interface to browse saved puzzles, no interactive puzzle-solving mode, and no state machine for puzzle play (find/eval/win/fail/view states).

Root cause: Phase 12 of the sprint plan (Puzzle System) has not been implemented beyond candidate extraction.

Impact: A major advertised feature of the app is entirely non-functional.

---

## [MEDIUM] stale awaitingStopBestmove flag

`awaitingStopBestmove` is a single boolean. If `protocol.stop()` is called twice in rapid succession (e.g. user double-clicks Review to stop, or clicks Review/Cancel/Review quickly), the flag may be set once but two stale bestmoves arrive. The second stale bestmove arrives after the flag was already cleared by the first one, and is processed as a real result.

Root cause: Single boolean cannot count pending stops. Should be a counter (or use a session token pattern).

Impact: A stale bestmove from a previous position may be processed as the result for the current position. Wrong eval stored in `evalCache` for one position. Rare in normal use, but reproducible with rapid Review toggles.

---

## [MEDIUM] Partial analysis state shows wrong UI label

After a batch is interrupted (user clicks Review to cancel), `batchState` is set to `'idle'` and `analysisComplete` is `false`. On page reload, `loadAndRestoreAnalysis()` restores the stored analysis (status: 'partial') but does not set `analysisComplete = true` — only the `'complete'` status path sets this flag. The Review button thus shows "Review" instead of "Re-analyze" for a game that already has partial analysis in IDB.

Root cause: The IDB restore path does not set `analysisComplete` for partial-status records.

Impact: UI is misleading — the user may not realize partial analysis is already loaded. Clicking "Review" re-runs from scratch (skipping cached positions due to `evalCache.has(path)` check), which is actually correct behavior, but the button label is wrong.

---

## [MEDIUM] Analysis accuracy not persisted across sessions

`analyzedGameAccuracy` is a volatile Map that is populated when batch analysis completes or when analysis is restored from IDB in the current session. It is never written to IDB.

After a page reload, `loadAndRestoreAnalysis()` repopulates `evalCache` for the most-recently loaded game only. The accuracy map for other analyzed games is empty.

Root cause: The Games view's accuracy column (`analyzedGameAccuracy.get(game.id)`) requires in-memory data that is only available while the game's eval is loaded. Accuracy is derived live from `evalCache`, not stored directly.

Impact: The Games view shows accuracy only for the currently loaded game. All other analyzed games show no accuracy data even though they were fully analyzed. This makes the Games view's "Review" column incomplete across sessions.

---

## [MEDIUM] reviewDepth and analysisDepth not persisted

`reviewDepth` (default 16), `analysisDepth` (default 30), and `multiPv` (default 3) are reset to defaults on every page reload. If a user changes review depth to 20, analyzes a game, then reloads, the depth reverts to 16. The stored analysis is rejected because `stored.analysisDepth !== reviewDepth` (20 ≠ 16). The user must re-analyze at depth 16 or manually change the setting back.

Root cause: Engine settings are not written to localStorage.

Impact: Stored analysis can be invalidated by any page reload if the user ever changed review depth from the default.

---

## [MEDIUM] previousBranch keyboard shortcut may mis-navigate

The `previousBranch()` function (Shift+Left) uses a convoluted inner closure to find the parent node of the current path. The implementation re-traverses the tree from root for each path length, and the outer node assignment from `ctrl.nodeList.find(...)` is syntactically present but appears unused in the logic flow. The parent lookup via a manually reconstructed path slice is also unreliable if the path is not evenly divisible.

Root cause: The implementation attempts to adapt Lichess's `previousBranch` but does not cleanly follow the Lichess pattern of walking `nodeList` backwards from the current position.

Impact: Shift+Left may navigate to an incorrect ancestor or may skip forks. Untested against complex variation trees.

---

## [MEDIUM] Chess.com import only fetches most recent archive month

`fetchChesscomGames()` always fetches only `archives[archives.length - 1]` regardless of the selected date range filter. Date filtering is applied post-fetch. If the user selects a 3-month or 1-year range, only the most recent month's games are returned and filtered, missing all prior months.

Root cause: The multi-archive loop was not implemented — fetching multiple months is more complex due to rate limiting and sequential async fetches.

Impact: Chess.com users who expect "1 year" to actually fetch a year of games will get only 1 month. The filters appear to work (the date filter narrows the fetched games) but the source data is already truncated.

---

## [LOW] Eval display has one-frame stale data on navigation

When navigating to a new position, `evalCurrentPosition()` first checks the cache. If cache miss, `currentEval` retains the previous position's eval until the first UCI info line arrives from the engine. The eval bar and PV box briefly show the previous position's evaluation.

Root cause: `currentEval` is not reset at the start of a cache-miss eval. It is only reset to `{}` on `evalBatchItem()` (batch) and in `awaitingStopBestmove` handling.

Impact: Cosmetic — one redraw frame shows stale eval. Resolves as soon as the engine sends its first info line.

---

## [LOW] PGN parse called twice per import

In `fetchChesscomGames()` and `fetchLichessGames()`, each PGN is validated by calling `pgnToTree(pgn)` and discarding the result. Then when the game is loaded via `loadGame()`, `pgnToTree()` is called again.

Root cause: Validation and loading are separate steps.

Impact: For a 30-game import, 30 extra full PGN parses occur. Negligible at this scale but unnecessary.

---

## [LOW] Board resize handle uses direct DOM mutation

`bindBoardResizeHandle()` uses `document.createElement` and `container.appendChild()` to add a `<cg-resize>` element to the Chessground container. This is direct DOM manipulation that bypasses Snabbdom.

The element is added inside the Snabbdom `insert` hook and is keyed via the parent `div.cg-wrap` key `'board'`. Because the key prevents Snabbdom from ever recreating the board element, this mutation persists correctly. However, it violates the CLAUDE.md rule against direct DOM manipulation and creates a fragile dependency on the key remaining stable.

Root cause: Chessground's resize handle must be physically inside the board container, which is managed by Chessground, not Snabbdom.

Impact: Currently harmless. Becomes a bug if the board element is ever unmounted.

---

## [LOW] renderChesscomImport, renderLichessImport, renderImportFilters appear to be dead code

These three render functions exist in main.ts but do not appear to be called from `routeContent`. The analysis view's underboard section calls `renderAnalysisControls()` and `renderGameList()` — not these functions. Import is handled exclusively through the header panel.

Root cause: Earlier iteration of the UI included these panels inline in the analysis view. They were replaced by the header panel approach but the old functions were not removed.

Impact: Dead code. No user impact, but ~150 lines of complexity that may confuse future maintenance.

---

## [LOW] `analysis-game` route is a placeholder

`routeContent('analysis-game')` returns `h('h1', 'Analysis Game: ${route.params.id}')`. This was supposed to be a deep-link route that loads a specific game by id from IDB and opens it in the analysis view.

Root cause: Not yet implemented.

Impact: Any URL in the form `#/analysis/game-5` shows a header text instead of loading the game. The URL pattern exists in the router but the view is not functional.

---

## Refactor-Specific Risks

These risks were identified during the full-codebase audit conducted in preparation for
extracting main.ts into modules (see REFACTOR_PLAN.md). They are not pre-existing bugs —
they are failure modes that can be introduced during the extraction process if the relevant
coupling is not handled carefully.

---

## [HIGH] Circular import risk between engine/eval.ts and games/library.ts

During Step 7 (extract engine eval) and Step 9 (extract game library), `engine/eval.ts`
needs `selectedGameId` and `loadAndRestoreAnalysis` is called from `loadGame()` in
`games/library.ts`. If `loadGame()` imports from `engine/eval.ts` and `engine/eval.ts`
imports from `games/library.ts`, a circular dependency forms.

Root cause: `loadGame()` in main.ts currently reads and writes both engine eval state and
game library state in one function, making it a cross-system coordinator.

Impact during refactor: TypeScript module resolution will fail silently or produce runtime
errors if circular imports exist. esbuild may bundle the modules incorrectly.

Mitigation: Extract `loadGame()` into `src/main.ts` (the coordinator file) rather than
into either subsystem module. `main.ts` imports from both and wires them. Alternatively,
pass `selectedGameId` as a function argument into eval functions rather than importing the
variable directly.

---

## [HIGH] cgInstance referenced before Chessground init during render

`cgInstance` is `undefined` until the Snabbdom `insert` hook fires on the board vnode.
Several render functions in main.ts (`renderEvalBar`, `renderBoard`, `syncBoard`, etc.) are
called during the first `redraw()` pass that initializes the board. If any extracted module
tries to call `cgInstance.set()` during the initialization render rather than in the `insert`
hook, it will throw.

Root cause: `cgInstance` initialization is tied to the Snabbdom vnode lifecycle, but its
use is spread across multiple subsystems that will live in different extracted files.

Impact during refactor: `Cannot read properties of undefined (reading 'set')` errors on
startup if extraction reorders the initialization path.

Mitigation: `cgInstance` must stay private to `board/ground.ts`. All other modules that
need to trigger board updates must call exported functions from `board/ground.ts`
(`syncBoard()`, `syncArrow()`) rather than accessing `cgInstance` directly. The `insert`
hook must be the only write site for `cgInstance`.

---

## [HIGH] protocol.onMessage callback closure captures main.ts-scope variables

The `protocol.onMessage` callback is currently a closure over variables in main.ts:
`batchAnalyzing`, `awaitingStopBestmove`, `evalNodePath`, `currentEval`, `pendingLines`,
`ctrl`, `cgInstance`, `evalCache`, `engineSearchActive`, `pendingEval`, and more.

When engine eval is extracted to `engine/eval.ts`, this callback must also move — but it
references functions from multiple extracted modules (`advanceBatch`, `evalCurrentPosition`,
`syncArrowDebounced`). If these are not all wired as imports before the move, the callback
will have broken references.

Root cause: `parseEngineLine()` is a 250-line function that coordinates the entire engine
state machine. It is the single most tightly coupled function in the file.

Impact during refactor: Missing imports cause silent undefined function calls or runtime
errors during analysis.

Mitigation: Extract `parseEngineLine()` as part of Step 7 (engine/eval.ts) and resolve all
imports explicitly before committing. Run a full batch review after each move to verify the
callback still fires correctly.

---

## [MEDIUM] redraw() is called from every extracted module but lives in main.ts

`redraw()` is defined in main.ts and calls `patch(vnode, view(currentRoute))`. Every
subsystem (engine eval, import, games view, board) calls `redraw()` after state changes.
After extraction, `redraw()` must be importable by all extracted modules, or each module
must accept a callback parameter.

Root cause: The re-render trigger is defined in the bootstrap file but is needed everywhere.

Impact during refactor: If `redraw` is not exported or passed correctly, state changes in
extracted modules will not trigger UI updates. Symptoms: analysis runs but move list does
not update; eval bar stays stale.

Mitigation: Export `redraw` from `src/main.ts` and import it in each extracted module that
needs to trigger a re-render. This is a common pattern in Snabbdom-based apps. Alternatively,
use a simple event bus (one function, registered at boot). Do not use an observable library.

---

## [MEDIUM] saveGamesToIdb called from multiple extracted modules

`saveGamesToIdb()` is called from `loadGame()`, navigation functions, and import adapters.
After extraction, it lives in `games/library.ts`. If import adapters (Step 4) are extracted
before the game library (Step 9), they must call a function that does not yet exist in its
final location.

Root cause: Game persistence is a shared side-effect needed by multiple subsystems.

Impact during refactor: If the extraction steps are done out of order, import adapters will
either call the still-in-main.ts version (works) or the not-yet-extracted library version
(breaks).

Mitigation: Extract Steps in the order defined in REFACTOR_PLAN.md. Step 4 (imports) comes
before Step 9 (game library). During Step 4, import adapters continue calling the version
in main.ts. Step 9 moves it to library.ts and updates all call sites.

---

## [MEDIUM] Three dead render functions may have hidden call sites

`renderChesscomImport()`, `renderLichessImport()`, and `renderImportFilters()` appear
unreachable based on audit. They are confirmed not called from `routeContent()`. However,
if any of them are called from inside the header panel rendering path (which was not
exhaustively traced for every branch), their removal during Step 4 will produce a silent
render gap.

Root cause: The header render function is ~200 lines with conditional panel rendering. A
complete call-site trace for all three functions was not done.

Impact during refactor: Removed function causes `undefined is not a function` if a hidden
call site exists.

Mitigation: Before removing, run a codebase-wide grep for `renderChesscomImport`,
`renderLichessImport`, and `renderImportFilters` to verify zero call sites. Only remove
after confirmation.

---

## [LOW] esbuild entry point and output paths must be updated as new files are added

The current esbuild build config (typically `build.js` or `package.json` scripts) has
`src/main.ts` as its entry point. New extracted files are not entry points — they are
imported by main.ts and bundled automatically. However, if any extracted file is accidentally
listed as a separate entry point, esbuild will produce a separate output bundle that is not
loaded by the HTML page.

Root cause: Build config is not automatically updated when new source files are added.

Impact during refactor: New file appears to do nothing — its code runs but the app does not
see it. Hard to diagnose if the output bundle structure is not inspected.

Mitigation: Verify that only `src/main.ts` remains the esbuild entry point after each
extraction step. All new files must be reachable via imports from main.ts.

---

## [LOW] TypeScript strict mode will surface hidden type errors during extraction

main.ts is compiled in strict mode. When functions are moved to new files, their implicit
type dependencies (via closure over module-scope variables) become explicit import types.
Some variables that are typed as `T | undefined` in main.ts context may need explicit
non-null assertions or type narrowing in the extracted module where the control flow is
less obvious to TypeScript.

Root cause: Closure variables carry their types implicitly; explicit imports require the
type to be spelled out. TypeScript may flag `ctrl` as possibly undefined in engine/eval.ts
if ctrl is declared as `let ctrl: AnalyseCtrl` in games/library.ts and engine/eval.ts
imports it without a null guard.

Impact during refactor: Build fails with type errors after extraction. These are real
defects exposed by the move, not false positives. Each must be fixed correctly.

Mitigation: Treat every TypeScript error surfaced during extraction as a real issue, not
something to suppress with `!` or `as`. Fix the underlying type correctly before committing.
