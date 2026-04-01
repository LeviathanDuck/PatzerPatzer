# Patzer Pro Performance & Scalability Audit

**Date:** 2026-03-30
**Auditor:** Claude (code-level inspection of Patzer Pro + Lichess source)

---

## 1. Executive Summary

### Overall Health
Patzer Pro is a **functionally rich, rapidly growing app** with solid architectural bones (Snabbdom, Chessground, path-keyed eval cache, async IDB persistence) but significant **scalability debt** that will become visible well before 30k games. The app was designed for a single developer with a few hundred games and has not yet been stress-tested against the data volumes specified in this audit.

### Top Performance Strengths
1. **Engine architecture is sound** — Stockfish 18 via Emscripten pthreads yields to the event loop; UI stays responsive during analysis
2. **Deferred boot** — engine, NNUE weights, and analysis data load lazily; first paint is fast
3. **Eval cache design** — O(1) Map lookups by tree path, no tree traversal for display
4. **Batch analysis is incremental** — saves partial progress to IDB after each position
5. **Openings tree chunked build** — 200-game chunks with setTimeout(0) yielding prevent main-thread lockup

### Top Performance Risks
1. **Entire game library stored as single IDB record and loaded into memory at startup** — will fail at scale
2. **No code splitting** — 803 KB monolithic JS bundle (187 KB gzipped)
3. **Full VDOM regeneration on every state change** — 80+ redraw() call sites, no memoization
4. **Full-table-scan patterns everywhere** — game library, puzzle definitions, game summaries, sync push/pull
5. **Server sync uses sequential single-row INSERTs** — 30k games would take 5+ minutes
6. **Sync client opens IDB at wrong version (v1 vs v5)** — likely data-loss bug
7. **Unbounded append-only stores** (puzzle attempts, rating history) — no retention policy
8. **No virtualization** for game lists, puzzle lists, or move lists

### Lichess Comparison
Lichess maintains snappiness through: 200ms engine throttling, requestIdleCallback scheduling, lazy prop evaluation, cursor-based IDB iteration, code splitting via dynamic ESM imports, multi-engine work queuing, Deferred next-puzzle preloading, and stored Map LRU caching. Patzer Pro implements **almost none of these patterns**. The gap is not in the core architecture (which correctly mirrors Lichess's Snabbdom + Chessground + path-keyed approach) but in the **optimization layer** that Lichess adds on top.

### Bottom-Line Assessment
The app will feel fast with <500 games. At 1,000–2,000 games, startup lag and list sluggishness will appear. At 5,000+ games, the single-record game library, full-table scans, and monolithic sync will become serious problems. **The current storage model cannot reach 30k games without architectural changes.** The rendering layer will degrade earlier than necessary due to lack of throttling and memoization.

---

## 2. Method

### Patzer Pro Files Inspected
- **Boot/render:** `src/main.ts` (1304 lines), `src/router.ts` (54 lines), `src/header/index.ts` (836 lines)
- **Storage:** `src/idb/index.ts` (425 lines), `src/sync/client.ts`, `server/db.mjs`, `server/sync.mjs`, `server/auth.mjs`
- **Analysis:** `src/analyse/evalView.ts`, `src/analyse/moveList.ts`, `src/analyse/retro.ts`, `src/analyse/retroCtrl.ts`
- **Engine:** `src/engine/batch.ts`, `src/engine/ctrl.ts`, `src/ceval/protocol.ts`, `src/ceval/view.ts`
- **Puzzles:** `src/puzzles/ctrl.ts` (3334 lines), `src/puzzles/view.ts`, `src/puzzles/puzzleDb.ts`
- **Openings:** `src/openings/ctrl.ts`, `src/openings/view.ts` (2674 lines), `src/openings/db.ts`, `src/openings/explorer.ts`, `src/openings/analytics.ts`, `src/openings/deviation.ts`, `src/openings/traps.ts`, `src/openings/import.ts`, `src/openings/types.ts`
- **Stats:** `src/stats/ctrl.ts` (79 lines)
- **Build:** `build.mjs`, `package.json`, `tsconfig.json`
- **Assets:** `public/js/main.js`, `public/css/main.css`, `public/stockfish-web/`
- **Git history:** All commits since 2026-03-23

### Lichess Files Compared Against
- `ui/lib/src/ceval/ctrl.ts` — engine throttling (200ms), lazy worker init
- `ui/lib/src/ceval/protocol.ts` — MultiPV batching, depth dedup
- `ui/lib/src/ceval/engines/stockfishWebEngine.ts` — SharedArrayBuffer patterns
- `ui/lib/src/tree/tree.ts`, `ui/lib/src/tree/ops.ts` — in-place tree updates, lazy collect
- `ui/lib/src/objectStorage.ts` — async cursor-based IDB iteration
- `ui/lib/src/async.ts` — throttle, debounce, requestIdleCallback
- `ui/lib/src/common.ts` — memoize pattern
- `ui/lib/src/storage.ts` — storedProp, storedMap with LRU
- `ui/puzzle/src/ctrl.ts` — Deferred next-puzzle preloading
- `ui/puzzle/src/session.ts` — session tracking with cap
- `ui/analyse/src/ctrl.ts` — conditional feature init, lazy chat
- `ui/analyse/src/view/main.ts` — resize caching, column detection
- `ui/analyse/src/idbTree.ts` — dirty-flag incremental saves

### Assumptions
- Storage estimates assume average PGN = 3 KB, average analysis record = 15 KB
- "30k games" means 30,000 imported personal games + potentially tens of thousands of opponent research games
- IDB performance estimates based on Chrome/V8; Safari may differ
- Server performance assumes MySQL on same machine (local network)

### Verification Limits
- No profiling data available (no Chrome DevTools traces)
- IDB throughput not measured empirically
- Sync latency not tested with real payloads
- WASM thread scheduling behavior is inferred from Emscripten docs, not measured

---

## 3. Key Findings

### A. App Architecture

#### A1. Monolithic Bundle — No Code Splitting
- **Issue:** Single entry point `src/main.ts` → `public/js/main.js` (803 KB, 187 KB gzipped). All routes, all subsystems, all views bundled together.
- **Why it matters:** User loading the puzzles page downloads all openings, stats, analysis, admin code. Mobile users on slow connections feel this.
- **Evidence:** `build.mjs` defines one entry point. No `import()` calls except for Stockfish engine.
- **Lichess comparison:** Lichess uses `site.asset.loadEsm<Type>('module', opts)` for dynamic ESM loading. NVUI, engine models, keyboard handlers loaded on demand.
- **Risk level:** Medium
- **User-visible impact:** ~200ms extra parse time on cold load; wasted bandwidth on mobile
- **Recommended direction:** Route-based code splitting. Puzzles, openings, stats, and admin should be lazy-loaded chunks.

#### A2. Full VDOM Regeneration on Every State Change
- **Issue:** `redraw()` calls `patch(vnode, view(currentRoute))` — regenerates entire virtual DOM tree from root. 80+ call sites trigger this.
- **Why it matters:** Every mouse click, wheel scroll (10px delta), engine update, and setting change recomputes the full view tree including inactive sections.
- **Evidence:** `src/main.ts:1099-1101` — no memoization, no component-level caching. Wheel listener at lines 1086-1089 fires redraw on every scroll event.
- **Lichess comparison:** Lichess uses `resizeCache` to skip unchanged sections, conditional rendering gated on column-count changes, and `requestIdleCallback` for non-critical updates. Lichess also throttles engine emissions at 200ms.
- **Risk level:** High
- **User-visible impact:** Jank during rapid interactions (scrolling move list, dragging eval graph resize handle, engine cycling). Gets worse as view tree grows.
- **Recommended direction:** (1) Throttle engine-triggered redraws to 200ms (Lichess pattern). (2) Memoize subsections of view() — puzzle view doesn't need to regenerate during analysis mode. (3) Use requestIdleCallback for non-critical UI updates.

#### A3. No Engine Update Throttling
- **Issue:** Engine info lines arrive many times per second. Each `onEngineOutput` can trigger redraw. No 200ms throttle observed.
- **Why it matters:** During live analysis, engine fires 10-50+ updates/second. Without throttling, each triggers a full VDOM diff.
- **Evidence:** `src/engine/ctrl.ts` — engine output callback chain to `redraw()` without intervening throttle.
- **Lichess comparison:** `ui/lib/src/ceval/ctrl.ts` explicitly throttles `onEmit()` at 200ms.
- **Risk level:** High
- **User-visible impact:** Choppy UI during live analysis, especially with MultiPV > 1
- **Recommended direction:** Add 200ms throttle between engine output and redraw trigger.

#### A4. Main.ts Is Too Large (1304 Lines)
- **Issue:** `src/main.ts` contains game management, dedupe logic, import callbacks, analysis restore, context menu, review queue wiring, AND all view routing. It's bootstrap + orchestration + business logic.
- **Why it matters:** Makes code splitting impossible (everything depends on main.ts). Forces full-tree renders because view() lives next to state.
- **Risk level:** Medium (structural debt, not immediate perf issue)
- **Recommended direction:** Extract game library management, import callbacks, and view routing into separate modules.

---

### B. Chessboard / Analysis

#### B1. Arrow Shapes Rebuilt Per Render
- **Issue:** `syncArrow()` rebuilds Chessground shape arrays on every call. Called on navigation, eval updates, and redraws.
- **Why it matters:** Arrow generation is cheap for 1-5 arrows but wasteful when nothing changed.
- **Lichess comparison:** Lichess `autoShape.ts` is called conditionally — only when eval or path actually changes.
- **Risk level:** Low
- **Recommended direction:** Cache last arrow state; skip Chessground setAutoShapes when unchanged.

#### B2. Move List Has No Virtualization
- **Issue:** `renderColumnNodes()` renders the entire game tree as VNodes. For a 200-move game with deep variations, this produces hundreds of DOM elements.
- **Why it matters:** Combined with full-VDOM regeneration (A2), every navigation click in a deeply annotated game triggers hundreds of VNode diffs.
- **Lichess comparison:** Lichess uses collapse state persistence (stored in IDB) to keep deep variations folded. Also uses lazy variation rendering.
- **Risk level:** Low-Medium (affects heavily annotated games only)
- **Recommended direction:** Add variation collapsing. For very long games, consider windowed rendering.

#### B3. Eval Graph Redraws Fully on Navigation
- **Issue:** SVG eval graph (600x80 or scaled) is fully regenerated on every position change — recomputes all data points, all classification dots, all polygons.
- **Why it matters:** Navigation via keyboard arrows at rapid rate triggers expensive SVG rebuilds.
- **Risk level:** Low-Medium
- **Recommended direction:** Cache the static portion of the graph (data points, polygons). Only update the cursor position and hover indicator on navigation.

---

### C. Puzzle Flow

#### C1. No Deferred Next-Puzzle Preloading
- **Issue:** Next puzzle is only loaded when user navigates (hash change). No background preload during current solve.
- **Why it matters:** Creates a perceptible gap between puzzle completion and next puzzle appearing.
- **Lichess comparison:** Lichess uses `next: Deferred<PuzzleData>` — the next puzzle is fetched while solving the current one. When solve completes, next puzzle is already in memory.
- **Risk level:** Medium
- **User-visible impact:** 50-200ms gap between puzzles in rated stream. Feels less "fluid" than Lichess.
- **Recommended direction:** Preload next puzzle definition + PGN while current puzzle is being solved. Patzer already has PGN prefetching for 10 puzzles ahead but does NOT prefetch the definition selection itself.

#### C2. listPuzzleDefinitions() Loads Entire Store
- **Issue:** `puzzleDb.ts:114-127` uses `getAll()` to load every puzzle definition into memory. Called for library display, retry queue building, due-date scanning.
- **Why it matters:** With 10k+ puzzles at ~1-2 KB each = 10-20 MB loaded into memory on every call.
- **Lichess comparison:** Lichess puzzle definitions come from server responses, never bulk-loaded from client storage.
- **Risk level:** High (at scale)
- **User-visible impact:** Sluggish puzzle library opening, slow retry/due queue building
- **Recommended direction:** Use IDB cursors with limits. For retry queue: build incrementally with index queries, not full scan + filter.

#### C3. buildRetryQueue Has O(n*m) Complexity
- **Issue:** For each puzzle definition, calls `getAttempts(puzzleId)` — a separate IDB transaction per puzzle. With 5000 puzzles × 10 attempts each = 5000 IDB round-trips.
- **Why it matters:** Each IDB transaction has overhead (event loop tick + microtask). Serial execution makes this multiplicative.
- **Risk level:** High (at scale)
- **User-visible impact:** Multi-second delay opening retry mode with large puzzle library
- **Recommended direction:** Batch query all attempts in single transaction using cursor, group client-side.

#### C4. Shard Cache Is Unbounded
- **Issue:** `_shardCache: Map<shardId, records[]>` grows without limit. Each loaded shard stays in memory for the session.
- **Why it matters:** If user browses many theme/rating combinations, dozens of shards accumulate.
- **Risk level:** Low-Medium
- **Recommended direction:** Cap shard cache to ~10 entries with LRU eviction.

---

### D. Game Importing

#### D1. Lichess Import Capped at 30 Games
- **Issue:** `src/import/lichess.ts:16` hardcodes `max=30` in the Lichess API URL.
- **Why it matters:** Users wanting to import their full Lichess history (thousands of games) must click Import many times. Each click fetches only 30.
- **Lichess comparison:** Lichess's own API supports streaming NDJSON with no practical limit. The `max` parameter can be much higher.
- **Risk level:** Medium (UX friction, not crash risk)
- **User-visible impact:** Importing 1000 Lichess games requires 34 clicks
- **Recommended direction:** Increase `max` substantially (500-1000) or implement paginated auto-fetch.

#### D2. PGN Parsing on Main Thread
- **Issue:** Each fetched game is validated via `pgnToTree(pgn)` synchronously during the fetch loop. For 500+ games, this blocks the main thread.
- **Why it matters:** UI freezes during large imports.
- **Evidence:** `src/import/lichess.ts:35-68`, `src/import/chesscom.ts:85-121`
- **Risk level:** Medium
- **User-visible impact:** UI unresponsive during Chess.com bulk imports (hundreds of games)
- **Recommended direction:** Move PGN validation to a Web Worker, or defer validation to post-import (validate on first access).

#### D3. Entire Game Library Replaced Atomically on Import
- **Issue:** `saveGamesToIdb()` replaces the single `'imported-games'` record with the full array. After import, the entire library (old + new games) is serialized and written.
- **Why it matters:** With 30k games at ~3 KB PGN each = ~90 MB serialized and written in one IDB put(). This is extremely slow and can exceed IDB transaction time limits.
- **Evidence:** `src/idb/index.ts:156-167`
- **Risk level:** Critical (at scale)
- **User-visible impact:** Import of even 30 new games into a 30k library triggers a 90 MB write
- **Recommended direction:** Switch to individual game records with `gameId` as key. See F1.

#### D4. Deduplication Uses Full PGN Strings in Set
- **Issue:** `dedupeImportedGames()` creates `new Set(existing.map(game => game.pgn))` — stores every PGN string in a Set for comparison.
- **Why it matters:** With 30k games at ~3 KB each, this creates a Set holding ~90 MB of strings in memory.
- **Risk level:** Medium-High (at scale)
- **Recommended direction:** Use a hash of the PGN (or a composite key: players + date + result + move count) instead of the full PGN string.

---

### E. Review Storage / Retrieval

#### E1. Analysis Records Are Reasonably Sized
- **Issue:** None — this area is well-designed.
- **Evidence:** `StoredAnalysis` stores path-keyed nodes at ~250 bytes per node. 50-move game ≈ 12.5 KB. Keyed by gameId with O(1) lookup.
- **Risk level:** Low
- **Note:** The eval cache map design directly mirrors Lichess patterns.

#### E2. Analysis Version Invalidation Discards All Data
- **Issue:** When `ANALYSIS_VERSION` increments, all previously stored analysis is silently discarded on restore (`idb/index.ts:444`).
- **Why it matters:** A developer version bump wipes potentially hundreds of hours of engine analysis.
- **Risk level:** Medium
- **Recommended direction:** Implement schema migration for analysis records rather than version-based discard. At minimum, warn the user.

#### E3. Game Summaries Loaded via Full Table Scan
- **Issue:** `listGameSummaries()` uses `getAll()` on the `game-summaries` store. Called every time the stats page is entered.
- **Why it matters:** At 30k summaries (~450 bytes each ≈ 13.5 MB), this is a full materialization every navigation.
- **Evidence:** `src/stats/ctrl.ts:43` — `listGameSummaries()` called in `loadSummaries()`
- **Risk level:** Medium
- **Recommended direction:** Cache in memory after first load; invalidate only when new analysis completes.

---

### F. Local Storage / Database / Cloud Persistence

#### F1. Game Library Stored as Single Record (CRITICAL)
- **Issue:** All imported games stored as one array in a single IDB record keyed `'imported-games'`. Loaded entirely into memory at startup. Written entirely on every save.
- **Why it matters:** This is the single biggest scalability blocker. At 10k games (~30 MB), startup becomes slow. At 30k games (~90 MB), the app may fail to load on memory-constrained devices. Every import rewrites the entire library.
- **Evidence:** `src/idb/index.ts:156-167` (save), `src/idb/index.ts:182-230` (load)
- **Lichess comparison:** Lichess stores analysis trees per-game in IDB (`idbTree.ts`). Games themselves come from the server, not bulk-loaded from IDB.
- **Risk level:** Critical
- **User-visible impact:** Startup time scales linearly with game count. Will become unusable at 10k+ games.
- **Recommended direction:** Restructure `game-library` to use gameId as key (one record per game). Add indexes on `importedUsername`, `date`, `source`. Load only metadata at startup; load PGN on demand.

#### F2. No IDB Indexes on Game Data
- **Issue:** The `game-library` store has no secondary indexes. No way to query by date, player, time control, or source without loading everything.
- **Why it matters:** Every filter, sort, or search requires full materialization.
- **Risk level:** Critical (tied to F1)
- **Recommended direction:** After restructuring to per-game records, add indexes: `date`, `importedUsername`, `source`, `timeClass`.

#### F3. Sync Client Opens IDB at Wrong Version (BUG)
- **Issue:** `sync/client.ts:113` opens `'patzer-pro'` at version 1. The app's current IDB version is 5. Stores created in versions 2-5 (game-summaries, retro-results) will not be accessible.
- **Why it matters:** Push may silently omit data. Pull may fail to write to stores that don't exist in the v1 schema.
- **Risk level:** Critical (data integrity bug)
- **User-visible impact:** Sync may appear to succeed but lose game summaries and retro results
- **Recommended direction:** Fix to `openIdb('patzer-pro', 5)` immediately. Add a version constant shared between `idb/index.ts` and `sync/client.ts`.

#### F4. Sync Transfers Entire Dataset Every Time
- **Issue:** Push reads ALL games, ALL analysis, ALL puzzles from IDB and POSTs them. Pull downloads ALL from server and writes ALL to IDB. No differential tracking.
- **Why it matters:** At 30k games + analysis = 200+ MB payload each direction. Takes minutes even on fast connections.
- **Evidence:** `sync/client.ts:108-147` (push), `sync/client.ts:151-196` (pull)
- **Risk level:** High
- **User-visible impact:** Sync becomes impractical at scale; UI frozen during operation
- **Recommended direction:** Track dirty flags per record. Push only changed records since last sync timestamp. Server responds with only records newer than client's last pull.

#### F5. Server Uses Sequential Single-Row Inserts
- **Issue:** `server/db.mjs:269-271` — `upsertGames()` awaits each game individually in a for loop. Same pattern for analysis, puzzles, attempts.
- **Why it matters:** 30k games × ~10ms per round-trip = 300+ seconds. Connection pool (10) doesn't help because calls are serial.
- **Risk level:** High
- **User-visible impact:** Sync push takes 5+ minutes at 30k games
- **Recommended direction:** Batch inserts using multi-row `INSERT INTO ... VALUES (...), (...), ...` syntax. Or use MySQL's LOAD DATA INFILE for bulk imports.

#### F6. Duplicate Puzzle Attempts on Pull
- **Issue:** `sync/client.ts:185-188` has a TODO comment acknowledging this. Every pull re-adds all server attempts to local IDB without deduplication.
- **Why it matters:** Unbounded growth of attempts store. Rating history corrupted by duplicates.
- **Risk level:** Medium
- **Recommended direction:** Track last-synced timestamp per store; only pull newer records.

#### F7. Unbounded Append-Only Stores
- **Issue:** `puzzle-attempts` and `rating-history` stores grow without limit. No retention policy.
- **Why it matters:** A user who solves 50 puzzles/day accumulates 18,000 attempt records per year. With multiple attempts per puzzle, growth is faster.
- **Risk level:** Medium (long-term)
- **Recommended direction:** Implement retention: keep last N attempts per puzzle (e.g., 10), aggregate rating history to daily summaries.

---

### G. Lists / Filters / Search

#### G1. Game List Has No Virtualization
- **Issue:** All imported games rendered as DOM elements. With 30k games, this means 30k DOM nodes in the game list.
- **Why it matters:** Browsers struggle with 10k+ DOM nodes. Scrolling becomes choppy, memory usage spikes.
- **Risk level:** High (at scale)
- **User-visible impact:** Game list becomes unusable at 5k+ games
- **Recommended direction:** Implement virtual scrolling (render only visible rows + buffer). Or pagination with 50-100 games per page.

#### G2. filteredSummaries() Recomputes on Every Access
- **Issue:** `stats/ctrl.ts:60-63` — `filteredSummaries()` runs `_summaries.filter(...)` every time it's called, including from multiple view functions in a single render.
- **Why it matters:** Multiple calls per render × 30k records = unnecessary iteration.
- **Risk level:** Low (cheap operation, but wasteful)
- **Recommended direction:** Cache filtered result; invalidate on filter change or data reload.

---

### H. Network / Bundle Loading

#### H1. Single Monolithic JS Bundle
- **Issue:** `public/js/main.js` = 803 KB (187 KB gzipped). Contains all routes.
- **Risk level:** Medium
- **User-visible impact:** ~200ms extra parse time on cold load; ~500ms+ on slow mobile
- **Recommended direction:** Code-split by route. Analysis, puzzles, openings, stats, admin as separate chunks.

#### H2. NNUE Weight File Is 15 MB
- **Issue:** `public/stockfish-web/nn-4ca89e4b3abf.nnue` = 15 MB. Downloaded when engine first activates.
- **Why it matters:** On slow connections, first engine activation has a long delay.
- **Evidence:** No preload hint; no progress indicator during NNUE download.
- **Lichess comparison:** Lichess caches engine models in OPFS/IDB with version stamps. Subsequent loads are instant.
- **Risk level:** Low (one-time cost, cached by browser)
- **Recommended direction:** Add `<link rel="prefetch">` for the NNUE file. Show download progress when engine is first activated.

#### H3. CSS Is 174 KB (29 KB Gzipped)
- **Issue:** Single CSS file includes all tool styles. Not critical but larger than expected.
- **Risk level:** Low
- **Recommended direction:** Consider critical CSS extraction for above-the-fold content. Low priority.

#### H4. Duplicate Stockfish Directories
- **Issue:** Both `public/stockfish/` and `public/stockfish-web/` exist with separate NNUE files (total ~30 MB).
- **Why it matters:** Wasted disk space; potential confusion about which engine is active.
- **Risk level:** Low
- **Recommended direction:** Remove unused `public/stockfish/` directory if `stockfish-web` is the active engine.

---

### I. Memory, CPU, and Scaling Risk

#### I1. In-Memory Game Library at Startup
- **Issue:** All games loaded into `importedGames: ImportedGame[]` at startup. Held in memory for app lifetime.
- **Why it matters:** 30k games × ~3 KB = 90 MB in memory. Plus the deduplication Set (another 90 MB during import).
- **Risk level:** Critical (at scale)
- **Recommended direction:** See F1. Load metadata only; paginate access.

#### I2. evalCache Persists All Evaluated Positions
- **Issue:** `evalCache: Map<path, PositionEval>` holds all evals for current game. Not cleared between games in batch mode.
- **Why it matters:** During batch review of 100+ games, evalCache may accumulate if not properly reset.
- **Risk level:** Low (appears to be reset per game in batch flow)
- **Recommended direction:** Verify evalCache is cleared between batch games. Add explicit clear on game switch.

#### I3. Opening Tree for Large Collections
- **Issue:** `OpeningTreeNode` built in memory from all games in a collection. For 60k opponent games, this tree could be large.
- **Why it matters:** Tree building is chunked (good) but the final tree stays in memory.
- **Evidence:** `src/openings/ctrl.ts` — chunked build with 200 games/chunk
- **Risk level:** Medium
- **Recommended direction:** For very large collections (>10k games), consider depth-limited tree building or on-demand expansion.

---

### J. Perceived Performance UX

#### J1. No Skeleton/Shell UI During Data Loading
- **Issue:** When game library is loading from IDB, the app shows either nothing or "Loading..." text. No skeleton screen, no progressive render.
- **Why it matters:** Users perceive empty screens as slow even when the actual wait is <500ms.
- **Lichess comparison:** Lichess renders page chrome immediately; data fills in progressively.
- **Risk level:** Medium
- **Recommended direction:** Render full page shell (header, nav, empty board, empty panels) immediately. Fill data asynchronously.

#### J2. No Optimistic UI for Puzzle Moves
- **Issue:** During puzzle play, move submission is synchronous (tree walk + validation + board sync). The visual response is immediate.
- **Risk level:** None — this area works well. The 300ms opponent reply delay is intentional and matches Lichess.

#### J3. Import Shows No Progress Indicator
- **Issue:** During import, button text changes to "Importing..." but there's no progress bar, game count, or percentage.
- **Why it matters:** For Chess.com imports pulling hundreds of games across multiple archives, user has no idea how long it will take.
- **Risk level:** Low-Medium
- **Recommended direction:** Show "Importing... (X games found)" with live counter.

#### J4. Wheel Scroll Triggers Full Redraw
- **Issue:** `src/main.ts:1086-1089` — wheel event listener fires `redraw()` on every 10px delta. During fast scrolling, this generates dozens of full VDOM diffs per second.
- **Why it matters:** Scrolling through a long game via wheel becomes a heavy operation.
- **Risk level:** Medium
- **Recommended direction:** Throttle wheel-triggered redraws to requestAnimationFrame or 50ms minimum interval.

---

### K. Additional Areas (Not Requested)

#### K1. No Service Worker / Offline Support
- **Issue:** App has no service worker. Every page load fetches all assets from network.
- **Why it matters:** Returning visits on mobile always pay full load cost. No offline capability.
- **Recommended direction:** Add service worker for asset caching. Low priority but high impact for repeat visitors.

#### K2. No Web Worker for Compute-Heavy Client Operations
- **Issue:** PGN parsing, tree building, deduplication, summary extraction, and retro candidate building all run on main thread.
- **Why it matters:** These operations block the UI during large datasets. Lichess defers heavy work to idle callbacks or Workers.
- **Risk level:** Medium
- **Recommended direction:** Move PGN parsing and summary computation to a dedicated Web Worker.

#### K3. No Compression for Sync Payloads
- **Issue:** Sync pushes raw JSON. PGN text is highly compressible (~70% compression ratio).
- **Why it matters:** 90 MB of games compresses to ~27 MB. On slow connections, this matters.
- **Recommended direction:** Enable gzip/brotli at the HTTP level (server.mjs middleware).

#### K4. localStorage Used for Session State Without Cleanup
- **Issue:** Puzzle session state, queue, and various preferences stored in localStorage. No TTL or cleanup.
- **Why it matters:** localStorage has a 5-10 MB limit. Large puzzle queues can consume significant space.
- **Risk level:** Low
- **Recommended direction:** Add session expiry (Lichess uses 1-hour max). Clean stale entries.

#### K5. No Database Vacuuming / Compaction
- **Issue:** IDB stores accumulate dead space from overwrites (especially game-library's single-record pattern). No explicit compaction.
- **Why it matters:** IDB fragmentation can slow reads over time.
- **Risk level:** Low
- **Recommended direction:** When restructuring to per-game records (F1), IDB will self-manage better. No action needed now.

---

## 4. Performance Debt Added Recently

### Commits Analyzed (2026-03-23 to 2026-03-30)

The last week saw **intensive feature additions** across multiple subsystems:

#### 4a. Openings Subsystem Expansion (HIGH impact)
**Commits:** `7da543e`, `b5d5762`, `f5414d6`, `7ab8b50`

New files added: `src/openings/analytics.ts` (1192 lines), `src/openings/deviation.ts` (214 lines), `src/openings/traps.ts` (144 lines), `src/openings/explorer.ts` reworked (368 lines), `src/openings/view.ts` grew to 2674 lines.

**Performance concerns:**
- **Deviation scan** makes up to 50 queued API calls with 300ms delay between them. No cancellation when user navigates away. Cache per (collectionId, colorFilter) is good.
- **Analytics module** (1192 lines) computes `CollectionSummary`, `PrepReportViewModel`, and `ECO breakdown` — all in-memory, all on main thread. For a 60k-game opponent collection, these aggregations are heavy.
- **Trap detection** does DFS to depth 10 on the full opening tree. For wide trees (many opponent games), this is O(branching^10) worst case.
- **View.ts at 2674 lines** is the largest view file. Full re-render on every state change (no memoization). Many conditional branches evaluated on every redraw.

**Assessment:** These features were built correctly (chunked tree building, cached deviation results, queued API calls) but the **aggregate weight** of analytics, deviation, and traps running together on a large collection has not been stress-tested. This is the highest-risk recent addition.

#### 4b. Puzzle Rating System (MEDIUM impact)
**Commits:** `f5414d6`, `1a04513`

- Glicko-2 rating computation is async (good)
- Rating history is append-only with no retention (concern)
- `buildRetryQueue()` and `getDuePuzzles()` added — both are O(n*m) with serial IDB calls (concern)
- Player strips and session persistence added — localStorage-based, reasonable size

**Assessment:** Rating math itself is fine. The query patterns for retry/due queues will become bottlenecks at 5k+ puzzles.

#### 4c. Server Auth + Sync Infrastructure (MEDIUM impact)
**Commits:** `ef861b5`, `f5414d6`

- Added `server/auth.mjs`, `server/db.mjs`, `server/sync.mjs`
- All sync endpoints use full-table-dump pattern
- Sequential single-row inserts throughout
- IDB version mismatch bug (v1 vs v5) introduced

**Assessment:** This infrastructure works at current scale but has fundamental scaling problems. The version mismatch is a data integrity bug that should be fixed immediately.

#### 4d. UI Polish and Controls Extraction (LOW impact)
**Commits:** `7ab8b50`, `1a04513`, `0e7caa3`, `0e8bd65`

- `src/analyse/analysisControls.ts` extracted (264 lines) — good modularization
- `src/ui.ts` added (29 lines) — UI primitives
- Puzzle player strips, scrollbar styling, slider styling
- CSS grew by ~600 lines in the week

**Assessment:** These are low-risk polish changes. CSS size growth is normal for feature development.

### Summary of Recent Debt
| Area | Risk | Fix Urgency |
|------|------|------------|
| IDB version mismatch in sync | Critical bug | Immediate |
| Openings analytics on large collections | High | Before opponent import scale-up |
| Retry/due queue serial IDB queries | High | Before puzzle library grows |
| Server sequential inserts | High | Before sync is used at scale |
| Full-table sync transfers | High | Before data exceeds 1k games |
| View.ts size (2674 lines) | Medium | Structural debt, not urgent |

---

## 5. Scaling Forecast

### 1,000 Games
- **UX condition:** Good. Startup: ~200ms IDB load. UI responsive.
- **Bottlenecks:** None visible.
- **Storage:** ~3 MB games, ~12 MB analysis, ~5 MB summaries = ~20 MB IDB
- **Assessment:** Comfortable operating range.

### 5,000 Games
- **UX condition:** Noticeable startup lag. Game list scrolling becomes sluggish without virtualization.
- **Bottlenecks:** Game library IDB read (~15 MB single record). Deduplication Set (~15 MB). Game list DOM (~5k nodes).
- **First degradation:** Game list rendering. Import deduplication starts to feel slow.
- **Storage:** ~15 MB games, ~62 MB analysis, ~2 MB summaries = ~80 MB IDB
- **Assessment:** Usable but user notices delay on app load and import.

### 10,000 Games
- **UX condition:** Startup noticeably slow (1-3s). Game list unusable without virtualization. Import triggers ~30 MB IDB write.
- **Bottlenecks:** Single-record game library serialization/deserialization. Full-VDOM redraw with large game list. Stats page full scan.
- **Storage:** ~30 MB games, ~125 MB analysis, ~5 MB summaries = ~160 MB IDB
- **Assessment:** Requires F1 (per-game records) and G1 (virtualization) to remain usable.

### 30,000 Games
- **UX condition:** Without changes: **app may fail to load.** 90 MB single IDB record + 90 MB JS array + 90 MB dedup Set = 270 MB memory at startup.
- **Bottlenecks:** IDB single-record limit. Browser memory pressure. Sync completely impractical (200+ MB payload). Game list DOM crash.
- **Storage:** ~90 MB games, ~375 MB analysis, ~14 MB summaries = ~480 MB IDB
- **Assessment:** Requires architectural changes (F1, F2, F4, G1) to function at all.

### 60,000 Games (Personal + Opponent)
- **UX condition:** Without changes: **non-functional.** Even with F1 fix, need lazy loading, server-side filtering, or partitioned storage.
- **Bottlenecks:** IDB quota pressure (approaching ~1 GB). Sync impossible without differential approach. Opening tree building for 60k opponent games takes significant time even chunked.
- **Storage:** ~180 MB games, ~750 MB analysis, ~27 MB summaries = ~960 MB IDB
- **Assessment:** Requires separation of opponent research collections from personal library. Pagination and server-side queries essential.

### 100,000+ Games
- **UX condition:** Requires fully indexed database with server-side query support. Client stores only active working set.
- **Storage:** ~1.6 GB IDB — may exceed quotas on some browsers.
- **Assessment:** Beyond IDB's practical capacity for a single origin. Needs server-primary architecture with IDB as cache.

---

## 6. Data Footprint Estimates

All estimates assume average game length = 40 moves (80 half-moves).

| Component | Per Record | 1k Games | 10k Games | 30k Games | 60k Games | Basis |
|-----------|-----------|----------|-----------|-----------|-----------|-------|
| Raw PGN (game text) | ~3 KB | 3 MB | 30 MB | 90 MB | 180 MB | Measured: typical PGN range 2-5 KB |
| Game metadata (excl. PGN) | ~200 B | 200 KB | 2 MB | 6 MB | 12 MB | Estimated from ImportedGame fields |
| Analysis record (IDB) | ~12.5 KB | 12.5 MB | 125 MB | 375 MB | 750 MB | Estimated: ~250 B/node × 50 nodes |
| Game summary | ~450 B | 450 KB | 4.5 MB | 13.5 MB | 27 MB | Estimated from GameSummary fields |
| Retro result | ~5 KB | 5 MB | 50 MB | 150 MB | 300 MB | Estimated: 3-10 KB per session |
| Puzzle definition | ~1.5 KB | — | — | — | — | Estimated; grows independently |
| Puzzle attempt | ~400 B | — | — | — | — | Estimated; append-only |
| **Total IDB (games + analysis)** | | **~21 MB** | **~212 MB** | **~635 MB** | **~1.27 GB** | |

**Labels:**
- Raw PGN size: **inferred** from typical Lichess game exports
- Analysis record size: **estimated** from `StoredNodeEntry` field sizes × expected mainline length
- Game summary: **estimated** from `GameSummary` interface field count and types
- Totals: **computed** from component estimates

**Note:** Opponent research collections stored in separate `patzer-openings` IDB. A 60k opponent collection adds another ~180 MB for PGN alone, plus the `OpeningTreeNode` in-memory representation during browsing.

---

## 7. What Will Break First

Ranked by order of likely appearance as data grows:

| # | What Breaks | Approximate Trigger | Symptom | Root Cause |
|---|-------------|-------------------|---------|------------|
| 1 | **Game list scrolling** | 2,000–5,000 games | Choppy scroll, high memory | No virtualization (G1) |
| 2 | **App startup time** | 3,000–5,000 games | 2-5s blank screen | Single-record game library (F1) |
| 3 | **Import responsiveness** | 5,000+ existing games | UI freeze during import | Dedup Set + atomic write (D3, D4) |
| 4 | **Sync push/pull** | 1,000+ games | Minutes-long operation, potential timeout | Full dump + sequential inserts (F4, F5) |
| 5 | **Puzzle retry/due queue** | 3,000+ puzzles | Multi-second delay entering retry mode | Serial IDB queries (C3) |
| 6 | **Stats page load** | 10,000+ analyzed games | 1-2s delay entering stats | Full scan of summaries (E3) |
| 7 | **Opening analytics on large collection** | 10,000+ opponent games | Slow tree build + analytics compute | All in-memory, main thread |
| 8 | **Memory pressure** | 30,000+ games | Browser tab crash or severe slowdown | 90+ MB arrays in memory (I1) |
| 9 | **IDB quota** | 60,000+ games + analysis | Write failures, data loss | Approaching browser limits |
| 10 | **Sync payload size** | 30,000+ games | Network timeout, OOM on parse | No pagination, no compression (F4) |

---

## 8. Recommended Performance Strategy

### Tier 1 — Highest Priority (Fix Before Adding Features)

1. **Restructure game-library to per-game IDB records** (F1, F2)
   - Switch from single `'imported-games'` record to individual records keyed by `gameId`
   - Add indexes: `date`, `importedUsername`, `source`, `timeClass`
   - Load only metadata at startup; load PGN on demand
   - *This unblocks all other scaling improvements*

2. **Fix sync IDB version mismatch** (F3)
   - Change `openIdb('patzer-pro', 1)` → `openIdb('patzer-pro', 5)` in `sync/client.ts`
   - Share version constant between modules

3. **Add engine update throttling** (A3)
   - Implement 200ms throttle between engine output and redraw
   - Matches Lichess pattern exactly
   - Simple change, high impact

4. **Implement virtual scrolling for game list** (G1)
   - Render only visible rows + small buffer
   - Essential for any list exceeding ~500 items

### Tier 2 — Important Next

5. **Implement differential sync** (F4)
   - Track `updatedAt` per record; push/pull only changed records since last sync
   - Server endpoint: `GET /api/sync/games?since=<timestamp>`

6. **Batch server inserts** (F5)
   - Replace sequential single-row inserts with multi-row INSERT
   - 100x improvement for sync push

7. **Add code splitting** (A1, H1)
   - esbuild supports `splitting: true` with ESM format
   - Split puzzles, openings, stats, admin into separate chunks

8. **Throttle/batch redraws** (A2, J4)
   - requestAnimationFrame-gate all redraws
   - Collapse multiple synchronous redraw() calls into one frame
   - Throttle wheel-triggered redraws

9. **Preload next puzzle definition** (C1)
   - While user solves current puzzle, select and load next puzzle in background
   - Mirrors Lichess Deferred pattern

10. **Cache game summaries in memory** (E3)
    - Load once, invalidate on new analysis completion
    - Avoid full IDB scan per stats page entry

### Tier 3 — Longer-Term Hardening

11. **Move PGN parsing to Web Worker** (D2, K2)
12. **Implement retention policies for append-only stores** (F7)
13. **Add IDB cursor-based iteration for puzzle queries** (C2, C3)
14. **Service worker for asset caching** (K1)
15. **Opening tree depth-limiting for very large collections** (I3)
16. **Server-side pagination for sync endpoints** (F4 extension)
17. **NNUE prefetch hint** (H2)
18. **Separation of opponent collections from personal library in storage** (for 60k+ scale)

---

## 9. Quick Wins

These can each be done in <30 minutes with high impact:

| # | Change | Impact | Effort |
|---|--------|--------|--------|
| 1 | Fix sync `openIdb` version: 1 → 5 | Fixes data loss bug | 1 line |
| 2 | Add 200ms throttle to engine redraw | Eliminates analysis jank | ~10 lines |
| 3 | requestAnimationFrame-gate `redraw()` | Prevents redundant renders | ~5 lines |
| 4 | Cache `filteredSummaries()` result | Avoids re-filter per render | ~10 lines |
| 5 | Increase Lichess import `max` from 30 to 500 | Reduces import clicks 17x | 1 line |
| 6 | Add `<link rel="prefetch">` for NNUE file | Faster first engine activation | 1 line |
| 7 | Throttle wheel-scroll redraw to 50ms | Smoother scroll navigation | ~5 lines |
| 8 | Remove unused `public/stockfish/` directory | Save 15+ MB disk | Delete directory |

---

## 10. Architectural Risks Requiring Decisions

### Decision 1: Per-Game Records vs. Paginated Single Record
- **Options:** (a) Restructure to per-game IDB records with indexes, or (b) keep single record but load lazily via pagination
- **Recommendation:** Option (a). Per-game records unlock IDB's native indexing, cursor iteration, and range queries. Option (b) is a band-aid.
- **Trade-off:** Requires migration path for existing users' data.

### Decision 2: Client-Primary vs. Server-Primary at Scale
- **Current:** Client (IDB) is primary, server is backup via manual push/pull.
- **At 60k+ games:** IDB cannot hold the full dataset. Must decide whether server becomes primary (client caches working set) or client partitions data.
- **Recommendation:** Keep client-primary for <30k games. For 30k+, implement server-primary with IDB as cache for recently accessed games.

### Decision 3: Code Splitting Strategy
- **Options:** (a) Route-based splitting (puzzles, openings, stats as chunks), or (b) feature-based splitting (engine, IDB layer, heavy analytics as chunks)
- **Recommendation:** Route-based first (simpler, higher impact). Feature-based later if needed.

### Decision 4: Opponent Data Isolation
- **Current:** Opponent research collections in separate `patzer-openings` IDB. Good isolation.
- **Risk:** If opponent game count grows to 60k, the `patzer-openings` IDB faces similar scaling issues.
- **Recommendation:** Maintain current isolation. Apply same per-record restructuring when opponent data grows.

---

## 11. Concrete Refactor Targets

| # | Target | Files | Description |
|---|--------|-------|-------------|
| 1 | Game library restructuring | `src/idb/index.ts`, `src/main.ts` | Switch from single-record to per-game records with indexes |
| 2 | Redraw batching | `src/main.ts` | Wrap `redraw()` in rAF gate to collapse multiple calls |
| 3 | Engine throttle | `src/engine/ctrl.ts` | Add 200ms throttle between engine output and UI update |
| 4 | Game list virtualization | `src/games/view.ts` or equivalent | Render only visible rows with scroll position tracking |
| 5 | Sync differential | `src/sync/client.ts`, `server/sync.mjs` | Track timestamps, push/pull only changes |
| 6 | Server batch inserts | `server/db.mjs` | Multi-row INSERT for all upsert functions |
| 7 | Puzzle query optimization | `src/puzzles/ctrl.ts`, `src/puzzles/puzzleDb.ts` | Replace serial getAttempts per puzzle with batched cursor query |
| 8 | Code splitting | `build.mjs` | Add route-based entry points for puzzles, openings, stats |

---

## 12. Blind Spots & Missed Opportunities

### Areas Not Asked About But Critical

1. **Error recovery and resilience** — What happens when an IDB write fails mid-import? When sync fails mid-push? There are no transaction rollback patterns. At scale, partial failure becomes likely.

2. **Concurrent tab behavior** — If user opens two tabs, both modify IDB. No locking or conflict detection. Lichess uses BroadcastChannel for tab coordination.

3. **Browser eviction pressure** — IDB data can be evicted by the browser under storage pressure (especially in Firefox's "best-effort" storage). The app has no `navigator.storage.persist()` call to request durable storage. All game data could be silently deleted.

4. **Animation and transition performance** — CSS transitions on board themes, panel slides, and settings may cause layout thrashing. Not audited in depth.

5. **Touch device input latency** — Chessground handles touch well, but the 300ms opponent reply in puzzles plus any main-thread blocking could feel sluggish on mobile.

6. **Font loading** — If custom fonts are used, they may cause FOIT/FOUT. Not inspected.

### Alternative Approaches

1. **SharedWorker for data layer** — Move all IDB access to a SharedWorker. Main thread never blocks on storage. Tabs share a single data connection.

2. **OPFS (Origin Private File System)** — For very large datasets, OPFS offers better performance than IDB. Lichess uses this for engine model caching. Could be used for game PGN storage.

3. **Server-Sent Events for sync** — Instead of manual push/pull, use SSE to stream changes from server to client in real-time. Eliminates full-dump sync entirely.

4. **SQLite-in-browser via sql.js or wa-sqlite** — For complex querying at scale, an actual SQLite database in the browser (via WASM) might outperform IDB for range queries, joins, and aggregations.

### Flawed Assumptions in This Audit's Framing

1. **The audit assumes IDB is the right tool for everything.** At 60k+ games with complex queries, IDB's key-value model becomes limiting. The audit should have explicitly compared IDB vs. OPFS vs. sql.js-in-browser.

2. **The audit treats "Lichess-level snappiness" as a fixed target.** Lichess serves game data from a server with sub-ms Redis lookups and CDN-cached assets. A client-first app can never match this for server-delivered data. The audit should distinguish "board interaction snappiness" (achievable) from "data access snappiness" (architecturally different).

3. **The audit focuses on single-user scale.** If multi-user support is ever needed, every finding about server-side inserts and full-table dumps becomes 10x more urgent.

---

## 13. Final Verdict

### How efficient does Patzer Pro currently appear relative to Lichess?

**Board interaction, engine integration, and puzzle play: 80-90% of Lichess quality.** The core chess experience is good. Chessground works well. Engine yields to the event loop. Puzzle flow is responsive.

**Data management and scaling: 20-30% of Lichess quality.** The single-record game library, full-table scans, lack of indexes, monolithic sync, and no virtualization are fundamentally different from how Lichess handles data. Lichess never bulk-loads user data into the browser — it comes from the server, paginated and indexed.

**Rendering efficiency: 40-50% of Lichess quality.** The lack of engine throttling, no redraw batching, full VDOM regeneration, and no code splitting are all areas where Lichess has explicit optimizations that Patzer Pro doesn't.

### What are the biggest reasons it may not yet feel as snappy?

1. Full VDOM regeneration on every state change (80+ unthrottled redraw calls)
2. Engine updates hitting the view without throttling
3. No code splitting (800 KB parse on cold load)
4. All game data loaded into memory at startup

### At what scale is the current approach likely to start feeling problematic?

**2,000–5,000 games** — game list becomes sluggish, startup lag appears.
**5,000–10,000 games** — imports feel slow, stats page delays, memory pressure starts.
**10,000+ games** — requires architectural changes to function acceptably.
**30,000+ games** — non-functional without restructuring.

### What would you fix first if the goal is "Lichess-like snappiness at scale"?

1. **Restructure game-library to per-game IDB records** — unblocks everything else
2. **Add 200ms engine throttle + rAF redraw batching** — instant snappiness improvement
3. **Virtual scrolling for game list** — prevents the first user-visible degradation
4. **Fix sync IDB version bug** — data integrity issue, trivial fix
5. **Increase Lichess import max from 30** — immediate UX improvement

These five changes, done in order, would take the app from "works at 500 games" to "works well at 10,000+ games" and put it on a path toward 30k+ viability.
