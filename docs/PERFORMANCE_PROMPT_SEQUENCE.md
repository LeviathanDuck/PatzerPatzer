# Performance Fix Prompt Sequence

Sequential Claude Code prompts to implement fixes from the 2026-03-30
Performance & Scalability Audit.

**Source:** `docs/audits/PERFORMANCE_SCALABILITY_AUDIT_2026-03-30.md`
**Debt tracker:** `docs/PERFORMANCE_DEBT.md`

---

## Phase Overview

### Phase 1 — Critical Quick Fixes (No Architecture Changes)
Small, safe fixes that improve correctness and performance immediately.
No dependencies. Can be done in any order.

| Prompt | Target | PD Item |
|--------|--------|---------|
| 1.1 | Fix sync IDB version mismatch | PD-02 |
| 1.2 | Add engine update throttle (200ms) | PD-03 |
| 1.3 | rAF-gate the redraw function | PD-04 (partial) |
| 1.4 | Throttle wheel-scroll redraws | PD-04 (partial) |
| 1.5 | Increase Lichess import max | PD-16 |
| 1.6 | Add NNUE prefetch hint | PD-20 |
| 1.7 | Request persistent storage | PD-22 |
| 1.8 | Cache filteredSummaries | PD-23 |
| 1.9 | Cache game summaries in stats controller | PD-14 |

### Phase 2 — Game Library Restructure (Foundation)
The single most important architectural change. Unblocks later phases.

| Prompt | Target | PD Item |
|--------|--------|---------|
| 2.1 | Add per-game IDB store with indexes | PD-01 (part 1) |
| 2.2 | Migrate save path to per-game records | PD-01 (part 2) |
| 2.3 | Migrate load path to on-demand reads | PD-01 (part 3) |
| 2.4 | Update deduplication to use composite keys | PD-15 |
| 2.5 | Update sync client for per-game records | PD-06 (partial) |

### Phase 3 — Puzzle Subsystem Scaling
Fix O(n*m) query patterns and unbounded stores in puzzles.

| Prompt | Target | PD Item |
|--------|--------|---------|
| 3.1 | Replace listPuzzleDefinitions getAll with cursor | PD-09 |
| 3.2 | Batch retry queue construction | PD-10 |
| 3.3 | Add puzzle attempt retention policy | PD-12 |
| 3.4 | Deduplicate puzzle attempts on pull | PD-11 |
| 3.5 | Cap shard cache with LRU eviction | PD-19 |

### Phase 4 — Server & Sync Hardening
Batch inserts and differential sync.

| Prompt | Target | PD Item |
|--------|--------|---------|
| 4.1 | Batch server game inserts | PD-07 (part 1) |
| 4.2 | Batch server analysis and puzzle inserts | PD-07 (part 2) |
| 4.3 | Add updatedAt tracking for differential sync | PD-06 (part 1) |
| 4.4 | Implement server-side since parameter | PD-06 (part 2) |
| 4.5 | Update sync client for differential push/pull | PD-06 (part 3) |

### Phase 5 — UI Responsiveness & Perceived Speed
Virtualization, skeleton UI, and import UX.

| Prompt | Target | PD Item |
|--------|--------|---------|
| 5.1 | Add game list pagination | PD-08 |
| 5.2 | Add skeleton UI for route loading | PD-18 |
| 5.3 | Add import progress counter | Audit J3 |
| 5.4 | Remove unused Stockfish directory | PD-21 |

---

# Full Prompt Sequence

---

## Phase 1 — Critical Quick Fixes

---

### Prompt 1.1 — Fix Sync IDB Version Mismatch

#### Goal
Fix the bug where `sync/client.ts` opens the `patzer-pro` IDB database at
version 1 instead of the current version, causing sync to silently miss stores
created in later schema versions.

#### Context
- The main IDB module (`src/idb/index.ts`) opens `patzer-pro` at the current
  version (believed to be 5). The sync client hardcodes version 1.
- Stores like `game-summaries` and `retro-results` exist only in later versions.
- This is a data integrity bug: sync may silently drop data.
- Audit reference: PD-02 (Critical severity)

#### Instructions for Claude Code

**SEARCH FIRST**
- Find where the IDB database version is defined in `src/idb/index.ts`.
  Look for the `onupgradeneeded` handler or version constant.
- Find where `src/sync/client.ts` opens the same database. Look for
  `openIdb`, `indexedDB.open`, or similar calls.

**COMPARE**
- Confirm the version number mismatch between the two files.
- List which stores are created at each version level.

**PLAN BEFORE CODING**
Output:
- The exact version number used in `src/idb/index.ts`
- The exact version number used in `src/sync/client.ts`
- Which stores would be inaccessible due to the mismatch
- The fix: extract a shared constant or update the hardcoded value

**IMPLEMENT**
- Extract the IDB version as a named export from `src/idb/index.ts`
  (e.g., `export const PATZER_PRO_IDB_VERSION = 5;`)
- Import and use that constant in `src/sync/client.ts`
- Do the same for the puzzle database version if it has a similar pattern

**VERIFY**
- Confirm both files reference the same version constant
- Confirm no other files hardcode IDB version numbers

#### Scope Constraints
- Max files: 2 (`src/idb/index.ts`, `src/sync/client.ts`)
- No behavioral changes beyond fixing the version
- Do not restructure sync logic

---

### Prompt 1.2 — Add 200ms Engine Update Throttle

#### Goal
Throttle engine-triggered UI redraws to a maximum of one per 200ms, matching
the Lichess pattern.

#### Context
- Stockfish emits 10-50+ info lines per second during analysis. Each can
  trigger `redraw()`, causing full VDOM diffs at high frequency.
- Lichess explicitly throttles engine `onEmit()` at 200ms in
  `ui/lib/src/ceval/ctrl.ts`.
- Audit reference: PD-03 (Critical severity)

#### Instructions for Claude Code

**SEARCH FIRST**
- Find the engine output callback chain in `src/engine/ctrl.ts` or related
  engine files. Trace how engine info/bestmove events reach `redraw()`.
- Identify all paths where engine output triggers a UI update.

**LICHESS REFERENCE**
- Read `~/Development/lichess-source/lila/ui/lib/src/ceval/ctrl.ts`.
- Find the 200ms throttle on `onEmit()` or the equivalent.
- Also check `~/Development/lichess-source/lila/ui/lib/src/async.ts` for
  the throttle utility implementation.

**COMPARE**
- Document: Lichess throttles at 200ms. Patzer Pro does not throttle.

**PLAN BEFORE CODING**
Output:
- The exact function(s) in Patzer Pro where engine output triggers redraw
- The Lichess throttle pattern being adopted
- The implementation: a simple throttle wrapper around the redraw call
- Confirmation that bestmove callbacks are NOT throttled (only info lines)

**IMPLEMENT**
- Add a throttle utility (or inline closure) that limits the engine-to-redraw
  path to one call per 200ms.
- Do NOT throttle bestmove/final result callbacks — only ongoing info updates.
- Pattern:
  ```typescript
  let lastEmit = 0;
  function throttledRedraw(): void {
    const now = performance.now();
    if (now - lastEmit < 200) return;
    lastEmit = now;
    redraw();
  }
  ```
- Use this throttled function in the engine output handler instead of
  calling `redraw()` directly.

**VERIFY**
- Engine still updates the eval bar and PV lines, just at <=5 updates/sec
- bestmove results still appear immediately
- No visual regression in analysis mode

#### Scope Constraints
- Max files: 1-2 (engine ctrl + possibly main.ts if callback is wired there)
- Do not change engine protocol logic
- Do not change eval cache behavior

---

### Prompt 1.3 — rAF-Gate the Redraw Function

#### Goal
Wrap the global `redraw()` function in a `requestAnimationFrame` gate so
that multiple synchronous calls within a single frame produce only one
DOM patch.

#### Context
- The current `redraw()` function (`src/main.ts`) immediately calls
  `patch(vnode, view(currentRoute))`. With 80+ call sites, multiple
  redraws can fire in the same frame.
- This is wasted work — only the last patch in a frame is visible.
- Audit reference: PD-04 (High severity, partial fix)

#### Instructions for Claude Code

**SEARCH FIRST**
- Find the `redraw()` function definition in `src/main.ts`.
- Count or estimate how many call sites invoke it.
- Check if any call sites depend on synchronous DOM updates (e.g., reading
  DOM measurements immediately after redraw).

**PLAN BEFORE CODING**
Output:
- The current redraw implementation
- Whether any callers depend on synchronous patching
- The rAF-gated implementation
- Risk assessment: what could break

**IMPLEMENT**
Replace the redraw function with an rAF-gated version:

```typescript
let redrawScheduled = false;
function redraw(): void {
  if (redrawScheduled) return;
  redrawScheduled = true;
  requestAnimationFrame(() => {
    redrawScheduled = false;
    vnode = patch(vnode, view(currentRoute));
  });
}
```

If any callers need synchronous redraw (e.g., for immediate DOM measurement),
provide a separate `redrawSync()` function for those specific cases only.

**VERIFY**
- App renders correctly on all routes
- Rapid interactions (scrolling, engine cycling) feel smoother
- No blank or stale frames

#### Scope Constraints
- Max files: 1 (`src/main.ts`)
- Do not modify any call sites — only the redraw function itself
- Do not add memoization or view caching in this step

---

### Prompt 1.4 — Throttle Wheel-Scroll Redraws

#### Goal
Prevent the wheel event listener from triggering redraws at full scroll
frequency. Limit to one effective navigation per 50ms.

#### Context
- `src/main.ts` has a wheel event listener that fires `redraw()` on every
  10px delta. Fast scrolling generates dozens of redraws per second.
- With rAF gating (Prompt 1.3), this is partially mitigated, but the
  underlying event handler still fires navigation logic on every scroll tick.
- Audit reference: PD-04 (partial), Audit J4

#### Instructions for Claude Code

**SEARCH FIRST**
- Find the wheel event listener in `src/main.ts`. It should be near
  lines 1074-1089.
- Understand what it does: likely advances/retreats the move tree by one
  ply per scroll event.

**PLAN BEFORE CODING**
Output:
- The current wheel handler behavior
- How many redraws it triggers during fast scrolling
- The throttle approach: minimum 50ms between effective scroll actions

**IMPLEMENT**
Add a timestamp check to the wheel handler:

```typescript
let lastWheel = 0;
// In the wheel handler:
const now = performance.now();
if (now - lastWheel < 50) return;
lastWheel = now;
// ... existing navigation logic ...
```

**VERIFY**
- Wheel scrolling through moves still works
- Scrolling feels smooth, not choppy
- No moves are "skipped" (each scroll tick navigates one ply)

#### Scope Constraints
- Max files: 1 (`src/main.ts`)
- Only modify the wheel handler
- Do not change the navigation logic itself

---

### Prompt 1.5 — Increase Lichess Import Max

#### Goal
Increase the Lichess API game import limit from 30 to 300 to reduce the
number of manual import clicks needed for users with large game histories.

#### Context
- `src/import/lichess.ts` hardcodes `max=30` in the Lichess API URL.
- Importing 1000 games requires 34 clicks. This is unnecessary friction.
- The Lichess API supports much higher values.
- Audit reference: PD-16 (Medium severity)

#### Instructions for Claude Code

**SEARCH FIRST**
- Find the Lichess API URL construction in `src/import/lichess.ts`.
- Confirm the current `max` parameter value.
- Check if there are any comments about why 30 was chosen.

**PLAN BEFORE CODING**
Output:
- Current max value
- Proposed new value (300)
- Why 300: balances single-request size with practical import batching
- Any downstream impact (parsing, storage)

**IMPLEMENT**
- Change `max=30` to `max=300` in the API URL.
- No other changes.

**VERIFY**
- Lichess import still works
- Larger batches import correctly

#### Scope Constraints
- Max files: 1 (`src/import/lichess.ts`)
- One number change. No other modifications.

---

### Prompt 1.6 — Add NNUE Prefetch Hint

#### Goal
Add a `<link rel="prefetch">` tag for the NNUE weight file so the browser
fetches it in idle time before the user activates the engine.

#### Context
- The NNUE file is ~15 MB and only downloaded when the engine first activates.
- A prefetch hint lets the browser download it during idle time.
- Audit reference: PD-20 (Low severity, quick win)

#### Instructions for Claude Code

**SEARCH FIRST**
- Find the HTML entry point (likely `public/index.html`).
- Find the NNUE filename in `public/stockfish-web/`. It should be a `.nnue`
  file like `nn-4ca89e4b3abf.nnue`.

**PLAN BEFORE CODING**
Output:
- The HTML file to modify
- The exact NNUE filename to prefetch
- The link tag to add

**IMPLEMENT**
Add to the `<head>` of `index.html`:
```html
<link rel="prefetch" href="/stockfish-web/nn-4ca89e4b3abf.nnue" as="fetch" crossorigin>
```

Use the actual filename found in the codebase.

**VERIFY**
- Page still loads correctly
- Browser network tab shows the NNUE file being prefetched during idle

#### Scope Constraints
- Max files: 1 (`public/index.html`)
- One line addition

---

### Prompt 1.7 — Request Persistent Storage

#### Goal
Call `navigator.storage.persist()` to request durable storage, preventing
the browser from evicting IDB data under storage pressure.

#### Context
- Without persistent storage, browsers can evict IDB data when disk space
  is low. This could silently delete game libraries and analysis.
- The request should happen early in the app lifecycle.
- Audit reference: PD-22 (Low severity, quick win)

#### Instructions for Claude Code

**SEARCH FIRST**
- Find the app initialization in `src/main.ts`. Locate where async startup
  work happens (after first render).
- Check if `navigator.storage.persist` is already called anywhere.

**PLAN BEFORE CODING**
Output:
- Where to place the persist() call
- Error handling approach (fail silently — not all browsers support it)

**IMPLEMENT**
Add after the first render in `src/main.ts`:

```typescript
// Request durable storage to prevent IDB eviction
if (navigator.storage?.persist) {
  navigator.storage.persist().catch(() => {});
}
```

**VERIFY**
- No errors on startup
- No behavioral change

#### Scope Constraints
- Max files: 1 (`src/main.ts`)
- 3 lines of code

---

### Prompt 1.8 — Cache filteredSummaries Result

#### Goal
Cache the filtered summaries array so it is not recomputed on every call
within a single render cycle.

#### Context
- `src/stats/ctrl.ts` has `filteredSummaries()` which runs `.filter()` on
  every call. Multiple view functions may call it during one render.
- Audit reference: PD-23 (Low severity)

#### Instructions for Claude Code

**SEARCH FIRST**
- Read `src/stats/ctrl.ts` fully. It is small (~79 lines).
- Identify `filteredSummaries()`, `setTimeFilter()`, and `loadSummaries()`.

**PLAN BEFORE CODING**
Output:
- Current: filter runs on every call
- Fix: cache result, invalidate when filter or data changes
- Files: 1 (src/stats/ctrl.ts)

**IMPLEMENT**
Add a cached result variable:

```typescript
let _filteredCache: GameSummary[] | null = null;

export function filteredSummaries(): GameSummary[] {
  if (_filteredCache) return _filteredCache;
  _filteredCache = _timeFilter === 'all'
    ? _summaries
    : _summaries.filter(s => s.timeClass === _timeFilter);
  return _filteredCache;
}
```

Invalidate `_filteredCache = null` in `setTimeFilter()` and after
`_summaries` is updated in `loadSummaries()`.

**VERIFY**
- Stats page still shows correct filtered data
- Changing the time filter updates the display

#### Scope Constraints
- Max files: 1 (`src/stats/ctrl.ts`)
- No changes to view rendering

---

### Prompt 1.9 — Cache Game Summaries in Stats Controller

#### Goal
Prevent the stats controller from re-loading all game summaries from IDB
every time the user navigates to the stats page.

#### Context
- `src/stats/ctrl.ts` calls `listGameSummaries()` (a full `getAll()` on the
  IDB `game-summaries` store) every time `initStatsPage()` is called.
- Summaries only change when new analysis completes.
- Audit reference: PD-14 (Medium severity)

#### Instructions for Claude Code

**SEARCH FIRST**
- Read `src/stats/ctrl.ts`. Find `initStatsPage()` and `loadSummaries()`.
- Identify what triggers re-entry (route changes back to stats).

**PLAN BEFORE CODING**
Output:
- Current: full IDB scan on every stats page entry
- Fix: check if summaries are already loaded; only reload if stale
- Staleness signal: a generation counter incremented when analysis completes

**IMPLEMENT**
- Add a module-level `_loadedGeneration` counter.
- Export a function `invalidateSummariesCache()` that increments the counter.
- In `initStatsPage()`, skip `loadSummaries()` if `_summariesLoaded` is
  true AND generation has not changed.
- Call `invalidateSummariesCache()` from the batch analysis completion
  handler (in `src/engine/batch.ts` or wherever summaries are saved).

**VERIFY**
- Stats page shows data on first visit
- Navigating away and back does NOT re-query IDB
- After running analysis on a new game, stats page shows updated data

#### Scope Constraints
- Max files: 2 (`src/stats/ctrl.ts`, the file that calls
  `saveGameSummary()` after analysis)
- Do not restructure the stats controller

---

## Phase 2 — Game Library Restructure

---

### Prompt 2.1 — Add Per-Game IDB Store Schema

#### Goal
Add a new `games` object store to the `patzer-pro` IDB database with
per-game records and indexes, alongside the existing `game-library` store.

#### Context
- Currently, all games are stored as a single array in one IDB record.
  This is the #1 scaling blocker (PD-01, Critical).
- This prompt creates the new store schema only. Migration and usage come
  in subsequent prompts.
- Reference: `docs/DATA_ARCHITECTURE.md` for the target schema.

#### Instructions for Claude Code

**SEARCH FIRST**
- Read `src/idb/index.ts`. Find the `onupgradeneeded` handler.
- Understand the current version number and existing stores.
- Read `docs/DATA_ARCHITECTURE.md` for the target `games` store schema.

**LICHESS REFERENCE**
- Read `~/Development/lichess-source/lila/ui/lib/src/objectStorage.ts`
  to understand how Lichess structures IDB stores.
- Read `~/Development/lichess-source/lila/ui/analyse/src/idbTree.ts`
  for per-entity keying patterns.

**PLAN BEFORE CODING**
Output:
- Current IDB version and stores
- New store definition: `games` with keyPath `id`
- Indexes to create: `date`, `importedUsername`, `source`, `timeClass`
- Version bump strategy (increment to next version)
- Confirmation that existing stores are untouched

**IMPLEMENT**
- Increment the IDB version by 1.
- In the `onupgradeneeded` handler, add:
  ```typescript
  if (!db.objectStoreNames.contains('games')) {
    const store = db.createObjectStore('games', { keyPath: 'id' });
    store.createIndex('date', 'date', { unique: false });
    store.createIndex('importedUsername', 'importedUsername', { unique: false });
    store.createIndex('source', 'source', { unique: false });
    store.createIndex('timeClass', 'timeClass', { unique: false });
  }
  ```
- Update the shared version constant (from Prompt 1.1).
- Add TypeScript types for the per-game record if not already defined.

**VERIFY**
- App starts without IDB errors
- Existing stores still accessible
- New `games` store exists in DevTools > Application > IndexedDB

#### Scope Constraints
- Max files: 1 (`src/idb/index.ts`)
- Schema addition only. No data migration. No usage changes.

---

### Prompt 2.2 — Migrate Game Save Path to Per-Game Records

#### Goal
Update `saveGamesToIdb()` to write individual game records to the new
`games` store instead of replacing the single `game-library` array.

#### Context
- After Prompt 2.1, the `games` store exists but is empty.
- This prompt changes the write path. The read path changes in Prompt 2.3.
- During migration, write to BOTH stores for backwards compatibility.

#### Instructions for Claude Code

**SEARCH FIRST**
- Find `saveGamesToIdb()` in `src/idb/index.ts`.
- Find all call sites for this function.
- Understand the current save pattern (single put of entire array).

**PLAN BEFORE CODING**
Output:
- Current: `store.put({ games }, 'imported-games')`
- New: write each game as individual record to `games` store
- Dual-write strategy: also maintain the legacy store during transition
- Performance: use a single IDB transaction for all puts

**IMPLEMENT**
- Rewrite `saveGamesToIdb(games: ImportedGame[])` to:
  1. Open a single readwrite transaction spanning both `game-library`
     and `games` stores.
  2. Write each game to the `games` store via `put()`.
  3. Continue writing to `game-library` for backward compat (remove later).
- Ensure all puts happen in one transaction (atomic, efficient).
- Add a helper: `saveGameToIdb(game: ImportedGame)` for saving single games.

**VERIFY**
- Importing games writes to both stores
- No data loss
- Performance: batch write in single transaction should be fast

#### Scope Constraints
- Max files: 1-2 (`src/idb/index.ts`, possibly import callback in `src/main.ts`)
- Do not change the read path yet

---

### Prompt 2.3 — Migrate Game Load Path to On-Demand Reads

#### Goal
Update `loadGamesFromIdb()` to read from the per-game `games` store using
cursors, loading only metadata at startup and PGN on demand.

#### Context
- After Prompt 2.2, games are written to the per-game store.
- This prompt changes how games are loaded at startup and during browsing.
- The startup path should load only game IDs and metadata (not PGN).
- PGN loads on demand when a specific game is selected.

#### Instructions for Claude Code

**SEARCH FIRST**
- Find `loadGamesFromIdb()` in `src/idb/index.ts`.
- Find where it is called in `src/main.ts` (startup sequence).
- Understand what the caller does with the returned games array.
- Find where PGN is accessed (game selection, analysis loading).

**LICHESS REFERENCE**
- Read `~/Development/lichess-source/lila/ui/lib/src/objectStorage.ts`
  for cursor-based iteration patterns.

**PLAN BEFORE CODING**
Output:
- Current: loads ALL games (including PGN) into a single array
- New: load game metadata (id, white, black, date, result, timeClass,
  source, ratings, opening, eco) via cursor. PGN loaded separately.
- New function: `loadGamePgn(gameId: string): Promise<string | null>`
- Impact on callers: they must handle async PGN access
- Files involved (aim for 1-3)

**IMPLEMENT**
- Rewrite `loadGamesFromIdb()` to return lightweight game metadata
  from the `games` store (using cursor or getAll on small stores).
- Add `loadGamePgn(gameId)` that reads a single game record and
  returns its PGN.
- Update the startup sequence in `src/main.ts` to use the new load path.
- Update game selection to load PGN on demand.

**VERIFY**
- App starts and shows game list (without PGN in memory)
- Selecting a game loads its PGN and displays it
- Analysis board works after game selection
- No regressions in game navigation

#### Scope Constraints
- Max files: 2-3 (`src/idb/index.ts`, `src/main.ts`, possibly game
  selection handler)
- This is the most complex prompt in the sequence. If it feels too large,
  split into: (a) new load functions, (b) startup migration, (c) game
  selection migration.

---

### Prompt 2.4 — Update Deduplication to Use Composite Keys

#### Goal
Replace the full-PGN-string Set deduplication with a composite key approach
that does not hold all PGN text in memory.

#### Context
- `dedupeImportedGames()` in `src/main.ts` creates `new Set(existing.map(g => g.pgn))`
  — at 30k games, this holds ~90 MB of strings.
- After per-game IDB records (Prompt 2.3), deduplication can check existence
  by key directly in IDB.
- Audit reference: PD-15 (Medium severity)

#### Instructions for Claude Code

**SEARCH FIRST**
- Find `dedupeImportedGames()` in `src/main.ts`.
- Understand the current dedup logic.
- Check what unique identifier each `ImportedGame` has.

**PLAN BEFORE CODING**
Output:
- Current: Set of full PGN strings
- New: Check existence by gameId in the IDB `games` store
- OR: Use composite key (players + date + result) as hash
- Choose the approach that avoids loading all PGNs into memory

**IMPLEMENT**
- If games have stable IDs: query IDB for existing IDs, build
  `Set<string>` of IDs only (~20 bytes each vs ~3 KB PGN each).
- If IDs are generated: create a composite key function
  `(white + black + date + result + moveCount)` and dedupe on that.
- Update `dedupeImportedGames()` to use the new approach.

**VERIFY**
- Importing games that already exist does not create duplicates
- Importing new games adds them correctly
- Memory usage during import is dramatically reduced

#### Scope Constraints
- Max files: 1-2 (`src/main.ts`, possibly `src/idb/index.ts` for a
  key-existence query helper)

---

### Prompt 2.5 — Update Sync Client for Per-Game Records

#### Goal
Update the sync client to read from the per-game `games` store instead of
the legacy `game-library` store.

#### Context
- After Prompts 2.1-2.3, games are stored as individual records.
- The sync client still reads from the old `game-library` single-record store.
- This prompt updates the push path to read individual records.

#### Instructions for Claude Code

**SEARCH FIRST**
- Find the push logic in `src/sync/client.ts`.
- Find `readAllFromStore(mainDb, 'game-library')`.
- Understand what format the server expects.

**PLAN BEFORE CODING**
Output:
- Current: reads single `game-library` record, sends as array
- New: reads all records from `games` store, sends as array
- Server format compatibility: confirm server accepts same shape
- Files involved

**IMPLEMENT**
- Update `pushToServer()` to read from the `games` store instead of
  `game-library`.
- Use `readAllFromStore(mainDb, 'games')` or a cursor-based read.
- Ensure the data format matches what the server expects.
- Update `pullFromServer()` to write to the `games` store.

**VERIFY**
- Push sends all games to server
- Pull writes games to the per-game store
- Round-trip (push then pull) preserves all data

#### Scope Constraints
- Max files: 1 (`src/sync/client.ts`)
- Do not implement differential sync yet — that is Phase 4

---

## Phase 3 — Puzzle Subsystem Scaling

---

### Prompt 3.1 — Replace listPuzzleDefinitions getAll with Cursor

#### Goal
Replace the `getAll()` call in `listPuzzleDefinitions()` with a cursor-based
approach that supports pagination and limits.

#### Context
- `src/puzzles/puzzleDb.ts` uses `store.getAll()` to load every puzzle
  definition. At 10k+ puzzles, this is 10-20 MB loaded into memory.
- Audit reference: PD-09 (High severity)

#### Instructions for Claude Code

**SEARCH FIRST**
- Read `src/puzzles/puzzleDb.ts`. Find `listPuzzleDefinitions()`.
- Find all callers of this function (in `ctrl.ts` and elsewhere).
- Understand what callers do with the result.

**LICHESS REFERENCE**
- Read `~/Development/lichess-source/lila/ui/lib/src/objectStorage.ts`.
- Find the cursor-based iteration pattern.

**PLAN BEFORE CODING**
Output:
- Current callers and their actual needs (full list? count? filtered subset?)
- Which callers can work with a paginated/limited result
- The cursor-based implementation
- New function signature (e.g., with `limit` and `offset` params)

**IMPLEMENT**
- Add a paginated version: `listPuzzleDefinitions(opts?: { limit?: number, offset?: number })`.
- Use an IDB cursor internally instead of `getAll()`.
- For callers that need a count, add `countPuzzleDefinitions()` using
  `store.count()`.
- Update callers one at a time, starting with the library list view.

**VERIFY**
- Puzzle library still displays correctly
- Pagination works (if applicable to the view)
- Memory usage reduced for large libraries

#### Scope Constraints
- Max files: 2 (`src/puzzles/puzzleDb.ts`, one caller file)
- Focus on the database layer change; view pagination comes later

---

### Prompt 3.2 — Batch Retry Queue Construction

#### Goal
Replace the serial per-puzzle `getAttempts()` calls in retry queue building
with a single batched cursor scan.

#### Context
- Building the retry queue calls `getAttempts(puzzleId)` for each puzzle —
  a separate IDB transaction per puzzle. At 5000 puzzles, this means 5000
  round-trips.
- Audit reference: PD-10 (High severity)

#### Instructions for Claude Code

**SEARCH FIRST**
- Find `buildRetryQueue` or equivalent in `src/puzzles/ctrl.ts`.
- Find `getAttempts()` in `src/puzzles/puzzleDb.ts`.
- Understand the retry eligibility logic.

**PLAN BEFORE CODING**
Output:
- Current: serial loop, one IDB query per puzzle
- New: single cursor over the `attempts` store, group by puzzleId in memory
- Function: `getAllAttemptsByPuzzle(): Promise<Map<string, PuzzleAttempt[]>>`
- This reads the attempts store once, groups results, returns a Map

**IMPLEMENT**
- Add `getAllAttemptsByPuzzle()` to `puzzleDb.ts` that opens a cursor
  on the `attempts` store, iterates all records, and groups them by
  `puzzleId` into a `Map<string, PuzzleAttempt[]>`.
- Update the retry queue builder to call this once instead of calling
  `getAttempts()` per puzzle.
- Apply the same pattern to `getDuePuzzles()` if it has the same problem.

**VERIFY**
- Retry queue contains the same puzzles as before
- Due queue (if updated) contains the same puzzles as before
- Building the queue is noticeably faster with many puzzles

#### Scope Constraints
- Max files: 2 (`src/puzzles/puzzleDb.ts`, `src/puzzles/ctrl.ts`)
- Do not change retry/due eligibility logic

---

### Prompt 3.3 — Add Puzzle Attempt Retention Policy

#### Goal
Add a cleanup function that prunes old puzzle attempts, keeping only the
most recent N attempts per puzzle.

#### Context
- The `attempts` store is append-only with no retention policy. A user
  solving 50 puzzles/day accumulates 18,000 records/year.
- Audit reference: PD-12 (Medium severity)

#### Instructions for Claude Code

**SEARCH FIRST**
- Read the `attempts` store definition in `src/puzzles/puzzleDb.ts`.
- Find the `puzzleId` index on the attempts store.
- Find where attempts are saved (`saveAttempt()`).

**PLAN BEFORE CODING**
Output:
- Retention policy: keep last 20 attempts per puzzle
- Implementation: background cleanup function called periodically
- When to run: after saving a new attempt, if total for that puzzle > 20

**IMPLEMENT**
- Add `pruneOldAttempts(puzzleId: string, keep: number)` to `puzzleDb.ts`.
  - Open cursor on `puzzleId` index for the given puzzle.
  - Count records. If > `keep`, delete the oldest (by auto-increment key).
- Call `pruneOldAttempts(puzzleId, 20)` after `saveAttempt()`.
- Keep this lightweight — only prunes for the puzzle that was just attempted.

**VERIFY**
- Saving a new attempt still works
- After 21+ attempts on a puzzle, only 20 remain
- Existing puzzles with fewer than 20 attempts are unaffected

#### Scope Constraints
- Max files: 1 (`src/puzzles/puzzleDb.ts`)
- Do not modify attempt recording logic

---

### Prompt 3.4 — Deduplicate Puzzle Attempts on Pull

#### Goal
Fix the sync pull path so it does not re-import puzzle attempts that
already exist locally.

#### Context
- `src/sync/client.ts` has a TODO: "deduplicate by (puzzleId + startedAt)
  to avoid duplicate imports."
- Every pull currently re-adds all server attempts to local IDB.
- Audit reference: PD-11 (Medium severity)

#### Instructions for Claude Code

**SEARCH FIRST**
- Find the puzzle pull logic in `src/sync/client.ts`.
- Find the TODO comment about deduplication.
- Find how attempts are currently written on pull.

**PLAN BEFORE CODING**
Output:
- Current: all server attempts written to local IDB (duplicates possible)
- Fix: before writing, query local max `completedAt` for all attempts,
  only write attempts newer than that timestamp
- Alternative: check by composite key (puzzleId + startedAt)

**IMPLEMENT**
- Before writing pulled attempts, query the local `attempts` store for
  the maximum `completedAt` value.
- Filter incoming attempts to only those with `completedAt` > local max.
- Write only the filtered set.

**VERIFY**
- First pull imports all attempts
- Second pull imports zero duplicates
- New attempts created after first pull are imported on second pull

#### Scope Constraints
- Max files: 1-2 (`src/sync/client.ts`, possibly `src/puzzles/puzzleDb.ts`
  for a max-timestamp helper)

---

### Prompt 3.5 — Cap Shard Cache with LRU Eviction

#### Goal
Limit the puzzle shard in-memory cache to 10 entries with LRU eviction.

#### Context
- `_shardCache` in the puzzle controller grows without limit as the user
  browses different theme/rating combinations.
- Audit reference: PD-19 (Low severity)

#### Instructions for Claude Code

**SEARCH FIRST**
- Find `_shardCache` in `src/puzzles/ctrl.ts`.
- Understand how shards are loaded and cached.

**PLAN BEFORE CODING**
Output:
- Current: `Map<string, records[]>` with no eviction
- Fix: cap at 10 entries; evict least-recently-used on insert

**IMPLEMENT**
- Replace the plain Map with an LRU cache (inline implementation is fine):
  - On get: move entry to "most recent" position.
  - On set: if size > 10, delete the oldest entry.
- A simple approach: use Map ordering (Map preserves insertion order).
  On access, delete and re-insert to move to end. On set, if size > 10,
  delete `map.keys().next().value`.

**VERIFY**
- Shard loading still works
- After browsing 15+ different theme/rating combos, only 10 shards in cache
- Re-accessing a previously cached shard still works (reloads from IDB)

#### Scope Constraints
- Max files: 1 (`src/puzzles/ctrl.ts`)
- Do not change shard loading logic

---

## Phase 4 — Server & Sync Hardening

---

### Prompt 4.1 — Batch Server Game Inserts

#### Goal
Replace the sequential single-row `upsertGame()` loop with batched
multi-row INSERT statements.

#### Context
- `server/db.mjs` uses `for (const g of games) await upsertGame(g)` —
  each game is a separate MySQL round-trip. At 30k games, this takes 300+
  seconds.
- Audit reference: PD-07 (High severity)

#### Instructions for Claude Code

**SEARCH FIRST**
- Read `server/db.mjs`. Find `upsertGame()` and `upsertGames()`.
- Understand the INSERT ... ON DUPLICATE KEY UPDATE pattern used.
- Find the column list and value mapping.

**PLAN BEFORE CODING**
Output:
- Current: sequential `await upsertGame(g)` per game
- New: batch 500 rows per multi-row INSERT statement
- MySQL syntax: `INSERT INTO games (...) VALUES (...), (...), ... ON DUPLICATE KEY UPDATE ...`
- Parameterization strategy (avoid SQL injection)

**IMPLEMENT**
- Create `upsertGamesBatch(games: Game[])` that:
  1. Chunks games into groups of 500.
  2. For each chunk, builds a single INSERT with multiple value tuples.
  3. Uses parameterized queries (? placeholders) to prevent injection.
  4. Executes one statement per chunk.
- Replace `upsertGames()` implementation with the batch version.

**VERIFY**
- Games are correctly upserted (new games inserted, existing games updated)
- 1000 games completes in seconds, not minutes
- No SQL injection risk

#### Scope Constraints
- Max files: 1 (`server/db.mjs`)
- Only modify game insert logic. Analysis and puzzle inserts in next prompt.

---

### Prompt 4.2 — Batch Server Analysis and Puzzle Inserts

#### Goal
Apply the same batched multi-row INSERT pattern to analysis results,
puzzle definitions, puzzle attempts, and puzzle user meta.

#### Context
- Same sequential-insert problem as games, affecting all sync entity types.
- Audit reference: PD-07 (High severity, continued)

#### Instructions for Claude Code

**SEARCH FIRST**
- Find `upsertAnalysis()`, `upsertPuzzleDefinitions()`,
  `insertPuzzleAttempts()`, `upsertPuzzleUserMetaBatch()` in `server/db.mjs`.
- Understand each table's column list and upsert pattern.

**PLAN BEFORE CODING**
Output:
- List of functions to batch
- Column lists for each table
- Batch size (500 rows per statement)
- Any differences in upsert vs insert-only semantics

**IMPLEMENT**
- Apply the same batch pattern from Prompt 4.1 to each function.
- For insert-only tables (attempts, rating-history), use plain INSERT.
- For upsert tables, use INSERT ... ON DUPLICATE KEY UPDATE.

**VERIFY**
- All sync entity types upsert/insert correctly in batch
- Performance improvement measurable (orders of magnitude faster)

#### Scope Constraints
- Max files: 1 (`server/db.mjs`)
- Pattern repetition from Prompt 4.1

---

### Prompt 4.3 — Add updatedAt Tracking for Differential Sync

#### Goal
Add `updatedAt` timestamps to all IDB records that participate in sync,
enabling differential push/pull in subsequent prompts.

#### Context
- Differential sync requires knowing which records changed since last sync.
- Each game, analysis result, puzzle definition, and user meta record needs
  an `updatedAt` field set on every write.
- Audit reference: PD-06 (High severity, groundwork)

#### Instructions for Claude Code

**SEARCH FIRST**
- Find all IDB write functions in `src/idb/index.ts` and
  `src/puzzles/puzzleDb.ts`.
- Check which record types already have `updatedAt` fields.
- Find where `lastSyncedAt` is stored (likely localStorage).

**PLAN BEFORE CODING**
Output:
- Which record types need `updatedAt` added
- Which already have it
- Where to set the timestamp (in each save/put function)
- Type changes needed

**IMPLEMENT**
- For each write function that doesn't already set `updatedAt`:
  add `updatedAt: Date.now()` to the record before `put()`.
- Update TypeScript types to include `updatedAt: number`.
- Ensure `updatedAt` is set on both new records and updates.

**VERIFY**
- Saving a game sets `updatedAt`
- Saving analysis sets `updatedAt`
- Saving puzzle definitions/meta sets `updatedAt`
- Existing functionality unchanged

#### Scope Constraints
- Max files: 2 (`src/idb/index.ts`, `src/puzzles/puzzleDb.ts`)
- Timestamp addition only. No sync logic changes yet.

---

### Prompt 4.4 — Implement Server-Side Since Parameter

#### Goal
Add `?since=<timestamp>` query parameter support to all GET sync endpoints
so clients can request only records updated after a given time.

#### Context
- After Prompt 4.3, all records have `updatedAt` timestamps.
- Server endpoints need to support filtering by this timestamp.
- Audit reference: PD-06 (High severity, continued)

#### Instructions for Claude Code

**SEARCH FIRST**
- Read `server/sync.mjs`. Find all GET endpoints.
- Read `server/db.mjs`. Find `getAllGames()`, `getAllAnalysis()`,
  `getAllPuzzleDefinitions()`, etc.

**PLAN BEFORE CODING**
Output:
- Current: `getAllGames()` returns all records
- New: `getGamesSince(timestamp)` returns records where `updated_at > ?`
- Endpoints to modify: GET /api/sync/games, /analysis, /puzzles
- Index needed: `idx_games_updated(updated_at)` etc.

**IMPLEMENT**
- Add optional `since` parameter parsing in each GET handler.
- Add filtered query functions: `getGamesSince(ts)`, `getAnalysisSince(ts)`, etc.
- Add `updated_at` indexes if not present (via migration or inline).
- When `since` is not provided, fall back to returning all records
  (backwards compatible).

**VERIFY**
- `GET /api/sync/games` still returns all games (no param)
- `GET /api/sync/games?since=1711756800000` returns only recent games
- Correct records returned based on timestamp

#### Scope Constraints
- Max files: 2 (`server/sync.mjs`, `server/db.mjs`)

---

### Prompt 4.5 — Update Sync Client for Differential Push/Pull

#### Goal
Update the sync client to push only changed records and pull only records
newer than the last sync timestamp.

#### Context
- After Prompts 4.3-4.4, records have `updatedAt` and the server supports
  `?since=`. This prompt connects them.
- Audit reference: PD-06 (High severity, completion)

#### Instructions for Claude Code

**SEARCH FIRST**
- Read `src/sync/client.ts`. Find `pushToServer()` and `pullFromServer()`.
- Find where `lastSyncedAt` is stored.

**PLAN BEFORE CODING**
Output:
- Current push: reads ALL records, sends ALL
- New push: read records where `updatedAt > lastSyncedAt`, send only those
- Current pull: fetches ALL from server, writes ALL
- New pull: fetch with `?since=lastSyncedAt`, write only returned records
- Update `lastSyncedAt` after successful sync

**IMPLEMENT**
- In `pushToServer()`:
  - Read `lastSyncedAt` from localStorage.
  - Query IDB for records with `updatedAt > lastSyncedAt`.
  - Send only those records.
  - Update `lastSyncedAt` on success.
- In `pullFromServer()`:
  - Include `?since=lastSyncedAt` in GET requests.
  - Write only returned records (upsert into local IDB).
  - Update `lastSyncedAt` on success.

**VERIFY**
- First sync (no lastSyncedAt) syncs everything
- Second sync transfers only changes since first sync
- Data integrity preserved across multiple sync cycles

#### Scope Constraints
- Max files: 1 (`src/sync/client.ts`)
- Do not change server endpoints (already done in 4.4)

---

## Phase 5 — UI Responsiveness & Perceived Speed

---

### Prompt 5.1 — Add Game List Pagination

#### Goal
Add simple pagination (50 games per page) to the game list view so the
DOM never renders more than 50 game rows at once.

#### Context
- Currently, all imported games are rendered as DOM elements.
- At 5k+ games, scrolling becomes choppy; at 10k+, the browser struggles.
- Audit reference: PD-08 (High severity)
- Full virtual scrolling is complex. Pagination is a practical first step.

#### Instructions for Claude Code

**SEARCH FIRST**
- Find where the game list is rendered. Look in `src/games/view.ts` or
  the view function in `src/main.ts`.
- Find how games are passed to the view (the `importedGames` array).
- Understand the current filtering/sorting logic.

**PLAN BEFORE CODING**
Output:
- Current: renders all games as DOM elements
- New: render only `games.slice(pageStart, pageStart + 50)`
- UI: page indicator + prev/next buttons
- State: `currentPage` module-level variable
- Reset page to 0 on filter change or new import

**IMPLEMENT**
- Add `let _currentPage = 0;` to the game list module.
- In the view, slice the games array: `games.slice(page * 50, (page + 1) * 50)`.
- Add prev/next page buttons below the list.
- Show "Page X of Y" or "Showing 1-50 of 3000".
- Reset `_currentPage = 0` when filters change or games are imported.

**VERIFY**
- Game list shows 50 games at a time
- Page navigation works
- Filters reset to page 1
- Performance: smooth even with 10k+ total games

#### Scope Constraints
- Max files: 1-2 (game list view + possibly state module)
- Simple pagination only. No virtual scrolling in this step.

---

### Prompt 5.2 — Add Skeleton UI for Route Loading

#### Goal
Render a page skeleton (header, nav, empty content area) immediately on
route change, before async data loads complete.

#### Context
- Some routes show "Loading..." text or blank content while IDB data loads.
- Users perceive this as slowness even if the actual wait is < 500ms.
- Audit reference: PD-18 (Medium severity)

#### Instructions for Claude Code

**SEARCH FIRST**
- Find the `view()` function in `src/main.ts` that renders per route.
- Identify which routes have async data loading (stats, games, puzzles).
- Find the loading state indicators.

**LICHESS REFERENCE**
- Note: Lichess renders page chrome (header, board, panels) immediately.
  Data fills in asynchronously.

**PLAN BEFORE CODING**
Output:
- Which routes show blank or minimal content during load
- What the skeleton should look like (same layout, empty panels)
- Where to add the skeleton rendering

**IMPLEMENT**
- For each route with async data, ensure the view function renders the
  full page structure (header, nav, panels, placeholders) even when data
  is not yet loaded.
- Replace "Loading..." text with subtle placeholder content (empty table
  with correct column headers, empty board area, etc.).
- Data fills in when `redraw()` fires after async load completes.

**VERIFY**
- All routes show structured content immediately (no blank screens)
- Data fills in when available
- No layout shifts when data arrives

#### Scope Constraints
- Max files: 2-3 (view functions for affected routes)
- Layout structure only. No new data loading logic.

---

### Prompt 5.3 — Add Import Progress Counter

#### Goal
Show a live game count during import ("Importing... (X games found)")
instead of just "Importing...".

#### Context
- During Chess.com imports that pull hundreds of games across multiple
  archives, the user has no idea of progress.
- Audit reference: Audit finding J3

#### Instructions for Claude Code

**SEARCH FIRST**
- Find the import UI in `src/header/index.ts`.
- Find the "Importing..." button text.
- Find how imported games accumulate during the fetch.
- Check Chess.com import (`src/import/chesscom.ts`) — it fetches
  multiple archives. Can we count games as they arrive?

**PLAN BEFORE CODING**
Output:
- Current: button shows "Importing..."
- New: button shows "Importing... (X games)"
- How to track count: callback or shared counter updated per archive fetch
- Files involved

**IMPLEMENT**
- Add a counter variable visible to the import UI.
- During Chess.com multi-archive fetch, increment the counter as each
  archive's games are parsed.
- During Lichess fetch, set counter to total after parse.
- Update button text to include the count.
- Trigger `redraw()` when counter updates (throttled if needed).

**VERIFY**
- Chess.com import shows rising game count
- Lichess import shows final count
- Counter resets between imports

#### Scope Constraints
- Max files: 2-3 (`src/header/index.ts`, `src/import/chesscom.ts`,
  possibly `src/import/lichess.ts`)

---

### Prompt 5.4 — Remove Unused Stockfish Directory

#### Goal
Remove the unused `public/stockfish/` directory to save ~15 MB of disk
space and eliminate confusion about which engine is active.

#### Context
- Both `public/stockfish/` and `public/stockfish-web/` exist.
- The app uses `stockfish-web` (Stockfish 18 smallnet).
- The old `stockfish/` directory contains unused Stockfish 16 files.
- Audit reference: PD-21 (Low severity)

#### Instructions for Claude Code

**SEARCH FIRST**
- Confirm that no code references files in `public/stockfish/`.
- Search for `stockfish/` (without `-web`) in all TypeScript and JavaScript
  files.
- Check `src/ceval/protocol.ts` for the engine path.

**PLAN BEFORE CODING**
Output:
- Files in `public/stockfish/` (list them)
- Confirmation that nothing references them
- Safe to delete

**IMPLEMENT**
- Delete the `public/stockfish/` directory.

**VERIFY**
- Engine still works (uses `public/stockfish-web/`)
- No broken references
- Build succeeds

#### Scope Constraints
- Max files: 0 code files changed. 1 directory deleted.
- Verify before deleting.
