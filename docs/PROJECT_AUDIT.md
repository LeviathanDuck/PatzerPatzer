# Patzer Pro — Project Audit

Date: 2026-03-19
Auditor: Claude Sonnet 4.6 (code review pass)
Scope: Full codebase read — all source files, all docs

---

## Section 1: High-Level System Overview

### What exists

A single-page chess analysis app served as a static bundle. There is no backend. All data is browser-local.

**Game import flow**

The header contains a unified search bar. The user enters a Chess.com or Lichess username and clicks Import. `fetchChesscomGames` or `fetchLichessGames` calls the respective public API, returns raw game objects, and filters them by rated/speed/date filters. Games are normalized into `ImportedGame` records keyed by a sequential `game-${n}` id. Games can also be imported by PGN paste. On success `importedGames` (module-level array) is updated and `saveGamesToIdb()` persists it. The first game from the batch is auto-loaded.

**Analysis engine**

Stockfish 18 smallnet runs in the main thread via `@lichess-org/stockfish-web` (Emscripten pthreads). Communication is UCI. `StockfishProtocol` wraps the module and exposes `setPosition`, `go`, `stop`. There is no Web Worker. Engine output is parsed in `parseEngineLine()` which is called from `protocol.onMessage()`. Evaluation is stored in a module-level `Map<TreePath, PositionEval>` called `evalCache`.

**Review pipeline (batch analysis)**

When the user clicks "Review", `startBatchAnalysis()` builds a queue of mainline nodes that lack a cached eval. It feeds them one at a time through `evalBatchItem()`, driven by the `bestmove` UCI response. Results accumulate in `evalCache`. On completion `saveAnalysisToIdb('complete')` persists the cache to IndexedDB under the game's id. On page reload `loadAndRestoreAnalysis()` repopulates `evalCache` from the stored record.

**Live analysis (interactive)**

When the user navigates to a move and the engine is on, `evalCurrentPosition()` sends `setPosition` + `go depth 30 MultiPV N`. Results update `currentEval` incrementally. This is transient — it is not written to `evalCache` unless a batch review ran first.

**UI rendering**

Snabbdom `patch()` is called by `redraw()`. Every stateful change in the app calls `redraw()` at its end. The board is a Chessground instance stored in `cgInstance`. Board state is updated via `cgInstance.set()` (direct, not Snabbdom). The move tree, eval bar, PV lines, graph, player strips, summary, controls, and header are all pure Snabbdom vnodes rebuilt on every `redraw()`.

**Persistence**

Three IndexedDB object stores in one DB (`patzer-pro` version 3): `game-library` (one record: the full game list + selectedId), `analysis-library` (one record per gameId), `puzzle-library` (one record: all saved puzzles). All reads are async; there is no loading-state gate before the first render.

---

## Section 2: Architecture Audit

### A. Code organization

The entire frontend is one file: `src/main.ts` (~4241 lines). Supporting files are small and clean:
- `src/tree/types.ts` — pure type definitions (81 lines)
- `src/tree/ops.ts` — tree operations (137 lines)
- `src/tree/pgn.ts` — PGN → tree (102 lines)
- `src/analyse/ctrl.ts` — cursor state (38 lines)
- `src/ceval/protocol.ts` — Stockfish wrapper (182 lines)
- `src/ceval/worker.ts` — placeholder stub (17 lines, not used)
- `src/router.ts` — hash router (47 lines)

**Problems with this structure:**

All application logic — game import, engine management, board rendering, move list, eval graph, puzzle extraction, games view, keyboard handler, IDB persistence, UI settings — lives as module-level variables and free functions in `main.ts`. There is no isolation between concerns. Changing the engine lifecycle touches the same file as the move list renderer. Adding a new route view requires editing the same 4000-line file.

This is not the Lichess model, which splits `ctrl.ts` from `view/`, `ceval/ctrl.ts` from `ceval/view/`, etc. The CLAUDE.md instructions to follow Lichess module patterns have not been applied at the file level.

**Duplication risks:**

Import filters exist in two places. `renderImportFilters()` (lines ~3298) renders an older-style inline filter row. The header panel's `renderHeader()` (lines ~1459) renders a more polished filter section with the same `importFilterSpeeds`, `importFilterDateRange`, etc. state. Both are wired to the same module-level state, so they won't desync, but one of them is dead UI — the header panel filter is always visible when the panel is open; the standalone `renderImportFilters` appears to be unused in the current route layout.

Two game list renderers exist: `renderGameList()` (for the underboard in the analysis view) and the header panel's game list in `renderHeader()`. They share the same data but render differently with only partial code reuse through `renderCompactGameRow()`. This is justified by different contexts but represents latent maintenance risk.

### B. State management

Module-level variables drive all state. Key state items:

| Variable | What it tracks |
|---|---|
| `importedGames` | All imported games |
| `selectedGameId` | Currently selected game |
| `ctrl` | AnalyseCtrl (cursor into tree) |
| `evalCache` | Map<path, PositionEval> — analysis results |
| `currentEval` | Live engine eval for current position |
| `batchAnalyzing`, `batchQueue`, `batchDone` | Batch review state |
| `analysisComplete` | Whether batch is done for current game |
| `engineEnabled`, `engineReady` | Engine lifecycle |
| `cgInstance` | Chessground API instance |

**Desync risks:**

1. `evalCache` is not scoped to a game. When a game is loaded via `loadGame()`, `evalCache.clear()` is called. If the user switches games while a batch is running (batch from game A is in flight), the async bestmove callback will write into `evalCache` under the new game's paths. The guard is that `loadGame()` resets `batchAnalyzing = false` and clears the queue — but if the engine has already sent `go` and the bestmove hasn't returned yet, the handler will still run and call `evalCache.set(evalNodePath, stored)` where `evalNodePath` belongs to game A's tree but `evalCache` now belongs to game B. There is no game-id tag on `evalNodePath`.

2. `analysisComplete` is a simple boolean — not scoped per game. The `analyzedGameIds` Set tracks which games completed analysis, but `analysisComplete` only reflects the current session's most recent batch. If you analyze game A, switch to game B (which was pre-loaded from IDB with status 'complete'), `analysisComplete` starts as `false` until `loadAndRestoreAnalysis()` finishes its async chain and calls `redraw()`. During this window the UI shows "Review" instead of "Re-analyze" for an already-analyzed game.

3. `currentEval` is not reset atomically with path changes. `navigate()` calls `evalCurrentPosition()` which first checks `evalCache.get(ctrl.path)`. If the cache is empty for this position, `currentEval` retains the previous position's eval until the engine responds. The eval bar and PV box show stale data for one render frame. This is a cosmetic issue, not a correctness issue, but it differs from Lichess behavior where the pearl is cleared on position change.

4. The `ctrl` object is replaced wholesale on `loadGame()` (`ctrl = new AnalyseCtrl(pgnToTree(...))`). Any reference to the old `ctrl` in a closure that runs after this point (e.g. a queued async callback) will use the old tree. The main risk is an in-flight `loadAndRestoreAnalysis` from a previous game.

### C. Data modeling

**Game identity:**

Games use `game-${++gameIdCounter}` sequential ids. `gameIdCounter` starts at 0 and is never persisted. On page reload, IDB restores `importedGames` with their stored ids (e.g. `game-7`). New imports after restore will increment from 0 again, producing `game-1`, `game-2`, etc. — potentially colliding with stored ids that pre-date the session. This is a real collision bug for long-term users.

Example: User has 10 games stored (`game-1` through `game-10`). Reloads. Imports 2 more. They get `game-1` and `game-2`, colliding with existing games. `importedGames` now contains duplicates with the same id. `selectedGameId`, `analyzedGameIds`, `missedTacticGameIds` all key by this id — they will silently point at wrong games.

**Analysis storage:**

`StoredNodeEntry` records `nodeId` (2-char), `path`, `fen`, and the eval fields. Keyed by path in the `nodes` Record. This is correct after the ANALYSIS_VERSION 2 migration. Before v2, records were keyed by `nodeId`, which was ambiguous (same move in different positions gets the same 2-char id). The version guard correctly rejects old records.

`ANALYSIS_VERSION` is hardcoded at 2. Changing `reviewDepth` does NOT bump the version — it rejects stored records via `stored.analysisDepth !== reviewDepth` check. This is correct behavior but means changing the depth slider and switching back silently discards stored analysis without the user being informed.

**PGN metadata:**

`parsePgnHeader` uses a regex that works for standard PGN quoting but will misparse values containing `"` or unusual whitespace. This is acceptable for the common case but fragile for edge-case PGNs.

### D. Persistence layer

Three IDB stores under DB version 3. `onupgradeneeded` only adds new stores if they don't exist — it does not handle version downgrades or migrations between data formats beyond ANALYSIS_VERSION.

`saveGamesToIdb()` is called from `navigate()` (every move navigation). This means every arrow-key press triggers an IDB write. For a 100-move game, rapid keyboard navigation fires 100 IDB transactions. This is a minor performance concern but not currently breaking.

`saveAnalysisToIdb('partial')` is called from `advanceBatch()` after every analyzed position. For a 60-move game, this is 60 IDB writes during batch. Each write serializes the entire `evalCache` into a `Record<string, StoredNodeEntry>`. This is O(n²) over the course of a batch. For a 100-move game: 100 writes, each serializing up to 100 entries = 10,000 object serializations. Not a problem at current scale, but it will degrade for large games or slow IDB implementations.

The IDB singleton `_idb` is cached in a module-level variable. There is no error path for a failed open that re-tries — the Promise rejects and subsequent calls use `_idb = undefined`. All subsequent save/load functions will re-open the DB, so this self-heals on the next call.

---

## Section 3: Stability and Reliability Audit

### Issue 1: Game-id collision on reload + import

**Problem:** `gameIdCounter` is not persisted. Reloading and importing new games creates ids that collide with stored game ids.
**Root cause:** `gameIdCounter = 0` initializes at module start. IDB restore does not update this counter.
**Impact:** Duplicate ids in `importedGames`. `selectedGameId` may point to wrong game. Analysis records in IDB may be associated with wrong game after collision.
**Severity: HIGH**

### Issue 2: Engine bestmove arrives after game switch

**Problem:** User starts batch review of game A, then immediately selects game B. `loadGame()` clears the queue and resets flags. The engine has already sent `go depth 16` for a position from game A's tree. When `bestmove` arrives, `awaitingStopBestmove` is false (it was reset by `loadGame()`), so the handler runs `advanceBatch()` or writes to `evalCache` with `evalNodePath` from game A, but `evalCache` is now expected to hold game B's data.
**Root cause:** No game-id tag on `evalNodePath`. Async engine callback does not validate that the current game context matches the queued position.
**Impact:** Game B's `evalCache` may receive corrupted entries from game A's analysis. Resulting eval labels, graph, and accuracy values will be wrong.
**Severity: HIGH**

### Issue 3: stale `awaitingStopBestmove` can corrupt eval

**Problem:** `awaitingStopBestmove` is set in `evalBatchItem` when `wasActive` is true. The stale-bestmove mechanism depends on this flag being set exactly once per stop. If two stops are issued in rapid succession (e.g. user clicks Review, then immediately clicks Review again to cancel, then clicks Review a third time), the flag state can get out of sync. The discarded bestmove handler resets the flag and clears `currentEval` — if a real bestmove arrives before the new search begins, it would be treated as a stale result and discarded.
**Root cause:** Single boolean flag cannot represent multiple pending stops.
**Impact:** Lost evaluation results; engine searches run but produce no output.
**Severity: MEDIUM**

### Issue 4: `loadAndRestoreAnalysis` race with `loadGame`

**Problem:** `loadAndRestoreAnalysis` is async. If the user loads game A (which starts `loadAndRestoreAnalysis(A)`), then quickly loads game B before the IDB read completes, the A callback will complete and write A's eval data into `evalCache`. At this point `ctrl` has been replaced by game B's tree. The paths from game A's analysis will exist in `evalCache` but may coincidentally match paths in game B's tree if early moves are identical (common openings), producing wrong eval annotations.
**Root cause:** No cancellation mechanism for in-flight IDB reads.
**Impact:** Wrong eval labels and graph data for game B positions that share a path prefix with game A.
**Severity: MEDIUM**

### Issue 5: `previousBranch()` implementation is incorrect

**Problem:** The `previousBranch` function (lines ~4049–4069) attempts to walk up the path to find the nearest fork. The inner closure that finds the parent node uses an inefficient re-traversal from root, but more critically, the condition `ctrl.path.startsWith(path) && path.length === ctrl.nodeList.indexOf(n) * 2` on line ~4053 will not correctly resolve a parent node because `ctrl.nodeList.indexOf(n)` searches for `n` which is `undefined` at that point (the `const node = ...` line never actually evaluates correctly within the while loop body — `ctrl.nodeList.find(...)` returns the node but it's not used). The function likely works for simple cases but may mis-navigate on complex variation trees.
**Root cause:** Overly complex implementation that does not cleanly adapt the Lichess `previousBranch` pattern. The Lichess version simply walks `nodeList` backwards.
**Impact:** Shift+Left keyboard shortcut may navigate to wrong node.
**Severity: MEDIUM**

### Issue 6: Wheel scroll target check uses `.analyse__board-wrap` but the CSS class is `.analyse__board`

**Problem:** The wheel event handler (line ~4188) checks `document.querySelector('.analyse__board-wrap')`. Looking at the rendered HTML structure in `routeContent`, the board container is `div.analyse__board.main-board`, not `.analyse__board-wrap`. The wheel scroll will never trigger because `boardWrap` will always be null.
**Root cause:** Class name mismatch between the wheel handler and the actual rendered DOM.
**Impact:** Mouse wheel navigation over the board does not work.
**Severity: HIGH** (feature is advertised and non-functional)

### Issue 7: `pgnToTree` called twice per import (validate + load)

**Problem:** `fetchChesscomGames` calls `pgnToTree(pgn)` for validation and discards the result, then `importChesscom` calls `loadGame(game.pgn)` which calls `pgnToTree(getActivePgn())` again. For a 30-game import batch, this is 31 full PGN parses where 30 are wasted.
**Root cause:** Validation reparse is a guard against malformed PGN, but the result is not reused.
**Impact:** Slow import for large batches. Minor but avoidable.
**Severity: LOW**

### Issue 8: `analysisDepth` / `reviewDepth` changes not persisted

**Problem:** `multiPv`, `analysisDepth`, and `reviewDepth` are module-level variables reset to defaults on every page load. There is no localStorage persistence for engine settings. The user configures depth 20 for review, does a review, reloads — settings revert to 16. The stored analysis will be rejected on reload (`stored.analysisDepth !== reviewDepth`), forcing a full re-analysis.
**Root cause:** Engine settings are not persisted.
**Impact:** Stored analysis is discarded whenever the user reloads with a different review depth than was used for analysis. Currently the default always matches, but any change causes this.
**Severity: MEDIUM**

### Issue 9: Accuracy data is not persisted to IDB

**Problem:** `analyzedGameAccuracy` Map is populated at analysis completion but is never written to IDB. On page reload with restored analysis, `computeAnalysisSummary()` re-derives accuracy from `evalCache`, but `evalCache` is only populated for the game that is currently loaded. Games that were analyzed in a previous session but are not the current game have no accuracy data available.
**Root cause:** The accuracy map is volatile; only `evalCache` data is persisted.
**Impact:** The Games view shows accuracy (%) for the currently loaded game but shows nothing for other analyzed games across sessions. This makes the Games view's Review column incomplete.
**Severity: MEDIUM**

### Issue 10: Puzzle extraction is manual and discards data on game switch

**Problem:** `puzzleCandidates` is populated by an explicit "Find Puzzles" button click, not automatically after batch analysis. It is reset to `[]` in `loadGame()`. Saved puzzles persist (IDB), but unsaved candidates from a session are lost on game switch. More importantly, the puzzle-play interface (navigating to a candidate and solving it interactively) does not exist — `routeContent('puzzles')` returns `h('h1', 'Puzzles Page')` (placeholder).
**Root cause:** Phase 12 (Puzzle System) has not been implemented beyond candidate extraction and saving.
**Impact:** Puzzle system is not usable. Extracted puzzles can be saved but cannot be played.
**Severity: HIGH** (major advertised feature is a stub)

---

## Section 4: Lichess Comparison (Engineering Level)

### Analysis pipeline

Lichess: Fishnet (distributed Stockfish cluster) → server stores evals in MongoDB → client loads fully annotated game tree.

Patzer Pro: Local Stockfish in main thread → client-side `evalCache` Map → IDB persistence.

The functional model is identical. The architecture differs in scale (local vs distributed). The batch queue pattern (`evalBatchItem` → bestmove → `advanceBatch`) correctly mirrors the sequential-position analysis approach. **Match: good for single-user local use.**

### Move tree model

Lichess: `TreeNode` with recursive `children[]`, path string concatenation, immutable path as cache key.

Patzer Pro: Identical model. `TreeNode` type, `TreePath = string`, 2-char node ids from `scalachessCharPair`. Path operations (`pathHead`, `pathTail`, `pathInit`, `pathLast`) match Lichess `ui/lib/src/tree/path.ts` exactly. **Match: excellent.**

### Evaluation storage

Lichess: `ServerEval` (server-side) attached to tree nodes; `ClientEval` (ceval) overlaid in browser memory. Separate fields on the node.

Patzer Pro: `evalCache` Map separate from the tree. Evals are not attached to `TreeNode.eval` or `TreeNode.ceval`. This is a divergence. The move list and graph read from `evalCache.get(path)` rather than `node.eval`. This means:
- Variations have no eval data (evalCache only covers mainline batch positions)
- PGN export annotations come from `evalCache`, not from tree nodes
- The Lichess `node.eval` field (populated by server analysis) and `node.ceval` (from browser engine) pattern is not implemented

This divergence is intentional (no server) but has downstream consequences: if the code ever needs to support loaded PGNs with embedded eval annotations, those would need to be read from tree nodes, not `evalCache`. **Divergence: intentional but creates inconsistency.**

### Rendering model

Lichess: Snabbdom + column view tree rendering, Chessground via hook.

Patzer Pro: Same. `renderColumnNodes` + `renderInlineNodes` match the Lichess column view architecture closely. Move list structure (`tview2`, `tview2-column`, `move`, `index`, `san`, `glyph`, `interrupt`, `lines`, `line`) matches Lichess CSS class names. **Match: good.**

### State handling

Lichess: `AnalyseCtrl` is the central controller, owns tree, path, and references to ceval, practice, etc.

Patzer Pro: `AnalyseCtrl` is minimal (cursor only). Everything else is module-level globals. This means the separation Lichess achieves through controller composition (ctrl.ceval, ctrl.practice, ctrl.explorer) does not exist. **Divergence: weaker, but acceptable for current scope.**

### Win-chance calculation

The sigmoid formula, multiplier (-0.00368208), cp clamping to [-1000, 1000], mate conversion, and mover-perspective normalization all match Lichess exactly. Move classification thresholds (0.025/0.06/0.14) match Lichess `practiceCtrl.ts`. **Match: excellent.**

---

## Section 5: Engine-Review Capability Comparison vs Lichess

### A. Review workflow

**Lichess:**
- User clicks "Request Computer Analysis" on a finished game
- Analysis is queued on Fishnet, runs asynchronously, result is stored server-side
- Result is permanent — any session, any device
- The analyzed game tree includes `node.eval`, `node.ceval`, and engine variation (`comp` child node) for each position
- "Learn from your mistakes" is a separate interactive mode built on the analyzed tree

**Patzer Pro:**
- User clicks "Review" button in the analysis view
- Batch runs locally in the same session
- Result is stored in IDB — survives reload, but is browser/device specific
- Eval data is stored in `evalCache`, not on tree nodes
- No equivalent of "Learn from your mistakes" interactive mode — only passive annotation
- No `comp` child node (engine best move variation is not inserted into the tree)

**Assessment:** The mechanical pipeline is equivalent. The result persistence model is weaker (local only). The interactive mistake-review workflow is completely missing.

### B. Live analysis tools

| Feature | Lichess | Patzer Pro | Status |
|---|---|---|---|
| Engine on/off toggle | Yes | Yes | Match |
| Eval bar (gauge) | Yes | Yes | Match |
| PV lines (1–5) | Yes, configurable | Yes, 1–5 slider | Match |
| Eval score display | Yes, centipawn + mate | Yes | Match |
| Best move arrow | Yes, paleBlue | Yes, paleBlue | Match |
| Secondary line arrows | Yes, paleGrey scaled | Yes | Match |
| Played move arrow | Yes | Yes | Match |
| Threat mode (x key) | Yes | Yes | Match |
| PV hover board preview | Yes | Yes | Match |
| PV click to navigate | Yes | Yes | Match |
| MultiPV setting | Yes | Yes | Match |
| Depth configurable | No (Lichess uses time-based) | Yes | Divergence |
| Engine name display | Yes | Yes | Match |
| Local engine (ceval) vs server eval toggle | Yes | N/A (local only) | N/A |

Live analysis tools are a strong match to Lichess.

### C. Post-game review features

| Feature | Lichess | Patzer Pro | Status |
|---|---|---|---|
| Move classification (inaccuracy/mistake/blunder) | Yes | Yes | Match |
| PGN glyph display (??/?) | Yes | Yes | Match |
| Accuracy calculation | Yes | Yes (Lichess formula) | Match |
| Win% graph | Yes, SVG | Yes, SVG | Match |
| Phase dividers on graph | Yes | Yes | Match |
| Graph click to navigate | Yes | Yes | Match |
| Accuracy summary panel | Yes | Yes, white+black | Match |
| Engine best line per move | Yes (via comp node) | Partial (via current eval only) | Weak |
| "Learn from mistakes" interactive | Yes | No | Missing |
| Opening explorer integration | Yes | No | Missing |
| Computer suggestion node in tree | Yes (`comp: true` child) | No | Missing |
| Annotated PGN export | Yes | Yes | Match |
| Move list glyphs from analysis | Yes | Yes (from evalCache loss field) | Match |

### D. State and data model differences

In Lichess, server analysis writes `node.eval` (permanent server eval) onto tree nodes. The client ceval writes `node.ceval` (transient). The tree is thus self-contained — you can navigate the tree and find eval data on the node itself.

In Patzer Pro, the tree has no eval data on nodes. `evalCache` is the only eval store. This means:
- The tree cannot be serialized with evals attached (PGN export reads evalCache separately)
- Variation moves have no eval
- If `evalCache` is not populated (e.g. page reload before restoring analysis), the move list shows no annotations, the graph is empty

This is architecturally weaker than Lichess but is a deliberate simplification for a single-user local-only workflow.

Durability comparison:
- Lichess: permanent, server-stored, accessible from any device
- Patzer Pro: IDB-only, survives reload, lost if IDB is cleared or browser profile is deleted

For a personal tool this is acceptable.

### E. Missing review tools

1. "Learn from Mistakes" interactive mode — the main Lichess mistake-review workflow
2. Engine best-move variation inserted into the tree as a `comp: true` child node
3. Opening explorer integration (does the mistake occur in a known opening?)
4. Per-move engine best-move display in the move list (shown alongside the played move)
5. Tablebase integration for endgame positions
6. Puzzle play view (extracted puzzles cannot be played back)
7. Multiple-game batch review (review all games in a queue without loading each one)
8. Practice/training mode per Lichess's practice module

### F. Priority judgment

The current review system is **useful but incomplete**. It correctly identifies blunders/mistakes, shows the eval graph, displays accuracy, and exports annotated PGN. A chess player can use it to understand where they went wrong in a game.

What makes it not "Lichess-comparable" yet:
- No interactive mistake correction workflow
- No computer alternative move visible in the tree
- Puzzle play is entirely absent
- Review state is fragile (game-id collision bug, game-switch race condition)

Before it can be considered Lichess-comparable for the core workflow, priority items are: game-id persistence fix, the comp-move insertion, and at minimum a basic puzzle-play interface.

---

## Section 6: Feature Completeness Audit

### Analysis board

**Current state:** Board renders, moves are playable, variations work, PGN loads correctly, player strips with material diff and clocks render, board flipping works, keyboard navigation works, promotion dialog works.

**Missing:** Coordinates toggle. Annotations panel (squares/arrows) user drawing works via Chessground but there is no persist/load mechanism. The `analysis-game` route (deep link by id) returns a placeholder h1.

**Fragile:** Board resize handle appends a DOM element after Chessground init — this direct DOM mutation bypasses Snabbdom and will survive re-renders only because `key: 'board'` prevents the cg-wrap from being recreated. If Snabbdom ever unmounts and remounts the board (e.g. route change and back), the resize handle is re-bound but the previous one is orphaned.

**Misleading:** The wheel scroll navigation is broken (wrong CSS class). Keyboard navigation shows "Shift+arrows for branch/sibling" in the help overlay but `previousBranch` implementation is suspect.

### Review system

**Current state:** Batch analysis works. Eval labels appear in move list. Accuracy summary displays. Graph renders and is clickable. Annotated PGN export works.

**Missing:** Computer best-move node in tree. Interactive mistake-review mode. Partial analysis state shows "Review" instead of "Re-analyze" after page reload even if IDB has partial data.

**Fragile:** Game-switch during batch can corrupt evalCache. Game-id collision on reload + import.

**Misleading:** The analysis summary panel shows after even 4 eval cache entries (`evalCache.size < 4` threshold is very low — a partially analyzed game will show an accuracy figure that may be based on only 4 moves).

### Engine lines

**Current state:** MultiPV 1–5, PV renders correctly, hover board preview works, click-to-navigate PV moves works, arrows on board work.

**Missing:** Infinite analysis mode (Lichess stops at depth and re-evaluates; Patzer Pro uses fixed depth then stops). The live engine does not re-evaluate after the depth limit is reached unless the user navigates.

**Fragile:** Stale eval display between navigation steps (currentEval holds previous position data for one frame).

### Move list

**Current state:** Column view with inline variations, move number re-anchoring after variation blocks, glyph display, active move highlight, click navigation.

**Missing:** Context menu (delete variation, promote to mainline). These operations are implemented in `tree/ops.ts` (`deleteNodeAt`, `promoteAt`) but there is no UI to invoke them.

**Fragile:** Inline variation rendering depth is unbounded — deeply nested variations may render correctly or may overflow.

### Eval graph

**Current state:** SVG, win-chance scale, move dots, click navigation, phase dividers, current-position marker.

**Missing:** Hover tooltip showing eval value at a position. Graph does not display until analysis runs — there is no indication of "pending" state beyond the "Analyze game to see graph" placeholder.

**Fragile:** The graph only covers mainline positions in `evalCache`. If analysis is partial (batch interrupted), the graph shows only analyzed positions with gaps at unanalyzed ones.

### Games tab

**Current state:** Table view with sort (date, result, opponent, time class), filter (result, speed, color, opponent name), analyzed/missed-tactic badges, accuracy display for analyzed games, Review button, external source link.

**Missing:** Pagination for large game lists. Opening statistics across games. Bulk operations.

**Fragile:** Accuracy shows only for games analyzed in the current session or whose analysis was restored. Games analyzed in a previous session (whose evalCache was not restored this session) show no accuracy.

### Game import

**Current state:** Chess.com API, Lichess API, PGN paste, filters (speed/rated/date), unified header bar.

**Missing:** Batch import across multiple archive months (currently only fetches the most recent month from Chess.com). PGN file upload. De-duplication of games already imported.

**Fragile:** Chess.com fetches only one month regardless of date filter settings — the filter is applied post-fetch. A user who selects "1 year" but whose most recent archive month has no games will see an empty result even if previous months have games.

**Misleading:** The `renderChesscomImport()` and `renderLichessImport()` functions render standalone import forms that appear inside the analysis view's underboard panel. But the analysis view's `routeContent` does not include these — they appear to be orphaned UI from an earlier iteration that was replaced by the header panel approach. The header is the only active import path.

### Board UI system

**Current state:** Board themes (15+), piece sets (17+), brightness/contrast/hue sliders, board zoom (resize handle), all persisted to localStorage.

**Missing:** Mobile-responsive layout (no media queries verified in the SCSS). The board settings are accessible only through the global settings menu (⚙), which is reasonable.

**Fragile:** Piece set images are loaded from `/piece/<name>/<file>.svg` paths that must exist on the server. There is no fallback if an image fails to load.

---

## Section 7: Progress vs CLAUDE.md + Sprint Direction

### Following CLAUDE.md principles

**Correct:**
- Snabbdom for all rendering — no React, no raw DOM manipulation (except the resize handle)
- Chessground for board UI
- chessops for chess logic
- No Express backend
- IndexedDB for persistence
- Win-chance formula matches Lichess exactly
- Move tree structure matches Lichess types
- Path-based tree navigation matches Lichess

**Violations:**
- One file for everything violates the intended module structure (though CLAUDE.md's task-scope rule may have driven this by limiting file count per task)
- The `src/ceval/worker.ts` file is a stub that does nothing. Stockfish runs on the main thread, which deviates from "Run engine in a Web Worker — never on the main thread" from CLAUDE.md
- CLAUDE.md requires `---zoom` CSS custom property for board zoom, but the code uses `---zoom` (triple dash). The SCSS must accept this or the zoom won't work
- `scrollActiveIntoView` uses `document.querySelector` DOM manipulation, which CLAUDE.md prohibits. The `pvBoard` mousemove handler also directly manipulates `overlay.style.left` to avoid Snabbdom redraw — this is pragmatic but violates the "no DOM manipulation" rule strictly read

### Build priority order vs CLAUDE.md

CLAUDE.md lists: setup → board → analysis shell → move tree → engine → import → puzzle extraction → puzzle play → persistence → admin.

Current state: setup, board, analysis, move tree, engine, import, persistence — all done. Puzzle extraction started, puzzle play is a stub.

**Premature polishing:** The board settings system (theme tiles, piece sets, filter sliders) and the Games view (sortable table, multiple filters, color chips, accuracy display) are polished beyond what is needed for the core analysis workflow. These are nice features but were implemented before the puzzle play system, which is a higher-priority item per the sprint plan.

**Missing before polishing:** The `analysis-game` route (deep linking to a specific game by id) is a placeholder — this is a core routing feature that should have been implemented before UI polish.

### Wasted effort

The standalone `renderChesscomImport`, `renderLichessImport`, and `renderImportFilters` functions in `main.ts` appear to be unused in the current route layout (all import is via the header panel). These are dead code that adds ~150 lines of complexity.

---

## Section 8: Technical Debt and Risks

### Immediate risks (must fix soon)

1. **Game-id collision** — sequential counter not persisted. Will affect any user who has imported games across multiple sessions.

2. **Wheel scroll broken** — wrong CSS class in the wheel event handler. Mouse wheel navigation over the board does not work.

3. **Game-switch engine race** — eval writes from a previous game's batch can corrupt the current game's evalCache.

4. **Puzzle play missing** — extracted puzzles can be saved but cannot be played. The Puzzles route is a placeholder.

### Medium-term risks

5. **Main-thread engine** — Stockfish runs on the main thread via Emscripten pthreads. If the browser throttles SharedArrayBuffer threads (e.g. in a cross-origin context), the engine initialization will fail silently. The worker.ts stub suggests this was originally intended to be a Web Worker — that architecture should be completed.

6. **Eval not on tree nodes** — `evalCache` is a Map, not tree-node properties. Any future feature that needs to serialize the annotated tree (e.g. a server sync, multi-device sync, or enhanced PGN viewer) will require a data migration.

7. **`previousBranch` logic bug** — Shift+Left may not correctly navigate in complex variation trees. Needs testing and likely a rewrite to match the Lichess `control.ts` pattern.

8. **IDB write frequency** — saving game state on every navigation step is expensive for long games with rapid keyboard use.

9. **Accuracy not persisted** — Games view accuracy column is incomplete across sessions.

### Future scaling risks

10. **Single file architecture** — `main.ts` at 4241 lines will become unmaintainable. Any feature addition to the analysis view requires touching the same file as import, routing, and persistence.

11. **`importedGames` as in-memory array** — no indexed access. Every game list scan is O(n). For hundreds of games, operations like `importedGames.find(g => g.id === ...)` will slow. Not critical now.

12. **IDB schema versioning** — there is no forward migration path beyond `onupgradeneeded`. A schema change requires manual version bump and data migration code.

---

## Section 9: Recommended Next Steps (Prioritized)

### Priority 1 — Stability fixes

**Task: Fix game-id collision**
Replace sequential `gameIdCounter` with a persisted max-id that is read from IDB on startup and initialized from the stored game list.
Files: `src/main.ts` (gameIdCounter initialization + IDB restore)

**Task: Fix wheel scroll class name**
Change `.analyse__board-wrap` to `.analyse__board-inner` (or whatever wraps the board) in the wheel event handler.
Files: `src/main.ts`

**Task: Fix engine race on game switch**
Add a session token or game-id tag to `evalNodePath` tracking so the bestmove handler can verify it is writing into the correct game's eval context before committing to `evalCache`.
Files: `src/main.ts`

**Task: Fix `loadAndRestoreAnalysis` race**
Track a `currentLoadToken` that is bumped on each `loadGame()`. The async IDB callback checks the token before writing to `evalCache`.
Files: `src/main.ts`

### Priority 2 — Core workflow gaps

**Task: Puzzle play interface**
Implement the `#/puzzles` route to show saved puzzles and support interactive solving. This is the most significant missing feature.
Files: `src/main.ts` (route + view), potentially a new `src/puzzle/` module

**Task: Computer best-move node insertion**
After batch analysis, insert a `comp: true` child node at each mistake position containing the engine's best UCI move. This enables move list display of the best alternative.
Files: `src/main.ts` (advanceBatch), `src/tree/types.ts` (add comp flag), `src/tree/ops.ts`

**Task: Fix `previousBranch` implementation**
Rewrite to match Lichess `ui/analyse/src/control.ts previousBranch` — walk nodeList backwards from current position.
Files: `src/main.ts`

**Task: `analysis-game` route**
Implement the `analysis-game` route to load a game by its stored id from IDB when the URL is `#/analysis/:id`.
Files: `src/main.ts`, `src/router.ts`

### Priority 3 — Feature completion

**Task: Persist engine settings**
Save `reviewDepth`, `analysisDepth`, `multiPv` to localStorage on change.
Files: `src/main.ts`

**Task: Persist accuracy to IDB**
Include per-game accuracy (white, black) in `StoredAnalysis`. Restore it on `loadAndRestoreAnalysis`.
Files: `src/main.ts`

**Task: Chess.com multi-month import**
Fetch the correct archive months based on the selected date range filter, not just the most recent.
Files: `src/main.ts` (fetchChesscomGames)

**Task: Remove dead import UI**
Remove `renderChesscomImport`, `renderLichessImport`, `renderImportFilters` if they are confirmed unused in the current layout.
Files: `src/main.ts`

### Priority 4 — Architecture (do last, not first)

**Task: Split main.ts into modules**
Extract game import, engine controller, board rendering, move list, games view into separate TS files matching the Lichess module structure.

**Task: Move engine to Web Worker**
Implement the worker bridge that `src/ceval/worker.ts` was intended to provide. Move Stockfish initialization off the main thread.

**Task: Attach evals to tree nodes**
Populate `node.eval` from batch analysis results (matching Lichess's `ServerEval` model) alongside maintaining `evalCache` for backward compatibility.
