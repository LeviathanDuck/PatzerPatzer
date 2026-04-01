# Performance Debt Tracker

Known performance issues from the 2026-03-30 audit.
Ordered by priority within each severity tier.

Reference: `docs/audits/PERFORMANCE_SCALABILITY_AUDIT_2026-03-30.md`

---

## Critical

### PD-01: Game library stored as single IDB record

- **Affected:** `src/idb/index.ts` (saveGamesToIdb, loadGamesFromIdb)
- **Impact:** Startup loads entire game library into memory. Every save
  rewrites the full array. At 30k games (~90 MB), app will fail to load.
- **Fix:** Restructure `game-library` store to per-game records keyed by
  `gameId`. Add indexes for `date`, `importedUsername`, `source`,
  `timeClass`. Load metadata on demand.
- **Blocked by:** Nothing. This is the highest-priority refactor.
- **Status:** Open

### PD-02: Sync client opens IDB at wrong version

- **Affected:** `src/sync/client.ts:113`
- **Impact:** `openIdb('patzer-pro', 1)` instead of current version (5).
  Stores created in versions 2-5 are inaccessible. Sync may silently
  drop game summaries and retro results.
- **Fix:** Change to `openIdb('patzer-pro', 5)`. Extract version as shared
  constant from `src/idb/index.ts`.
- **Blocked by:** Nothing. One-line fix.
- **Status:** Open

### PD-03: No engine update throttling

- **Affected:** `src/engine/ctrl.ts` (engine output callback chain)
- **Impact:** Engine fires 10-50+ info lines per second. Each can trigger
  `redraw()`. Causes jank during live analysis, especially MultiPV > 1.
- **Fix:** Add 200ms throttle between engine output and redraw trigger.
  Reference: Lichess `ui/lib/src/ceval/ctrl.ts`.
- **Blocked by:** Nothing.
- **Status:** Open

---

## High

### PD-04: Full VDOM regeneration on every state change

- **Affected:** `src/main.ts:1099-1101` (redraw function)
- **Impact:** 80+ call sites trigger `patch(vnode, view(currentRoute))`,
  regenerating the entire virtual DOM tree. No memoization. Wheel scroll
  events fire redraw on every 10px delta.
- **Fix:** (1) rAF-gate redraw. (2) Throttle wheel redraws to 50ms.
  (3) Memoize stable view subtrees (header, inactive tool panels).
- **Blocked by:** Nothing.
- **Status:** Open

### PD-05: No code splitting

- **Affected:** `build.mjs` (single entry point)
- **Impact:** `public/js/main.js` = 803 KB (187 KB gzipped). All routes
  bundled. Extra parse time on cold load; wasted bandwidth on mobile.
- **Fix:** Route-based code splitting via esbuild `splitting: true` with
  ESM format. Lazy-load puzzles, openings, stats, admin.
- **Blocked by:** May require output format change from IIFE to ESM.
- **Status:** Open

### PD-06: Sync transfers entire dataset

- **Affected:** `src/sync/client.ts`, `server/sync.mjs`
- **Impact:** Push reads ALL records; pull downloads ALL records. At
  30k games + analysis = 200+ MB per operation.
- **Fix:** Track `updatedAt` per record. Push/pull only records changed
  since last sync timestamp. Add `?since=` parameter to server endpoints.
- **Blocked by:** PD-01 (per-game records needed first).
- **Status:** Open

### PD-07: Server uses sequential single-row inserts

- **Affected:** `server/db.mjs:269-271, 292-294, 324-326, 345-347`
- **Impact:** `for (const g of games) await upsertGame(g)` — each game is
  a separate round-trip. 30k games = 300+ seconds.
- **Fix:** Multi-row INSERT: `INSERT INTO games (...) VALUES (...), (...), ...`
  Batch 500-1000 rows per statement.
- **Blocked by:** Nothing.
- **Status:** Open

### PD-08: Game list not virtualized

- **Affected:** Game list rendering (all games as DOM elements)
- **Impact:** At 5k+ games, scrolling becomes choppy. At 10k+, browser
  struggles with DOM node count.
- **Fix:** Implement virtual scrolling — render only visible rows plus
  small buffer. Or pagination (50-100 per page).
- **Blocked by:** PD-01 (per-game records, so list can query by page).
- **Status:** Open

### PD-09: listPuzzleDefinitions loads entire store

- **Affected:** `src/puzzles/puzzleDb.ts:114-127`
- **Impact:** `getAll()` on definitions store. At 10k+ puzzles = 10-20 MB
  loaded into memory.
- **Fix:** Use cursor with limit. For library display, paginate. For
  retry/due queue, use index-based queries.
- **Blocked by:** Nothing.
- **Status:** Open

### PD-10: buildRetryQueue has O(n*m) serial IDB queries

- **Affected:** `src/puzzles/ctrl.ts` (retry queue construction)
- **Impact:** Calls `getAttempts(puzzleId)` per puzzle — separate IDB
  transaction each. 5000 puzzles = 5000 round-trips.
- **Fix:** Single cursor over `attempts` store grouped by puzzleId in
  application code.
- **Blocked by:** Nothing.
- **Status:** Open

---

## Medium

### PD-11: Duplicate puzzle attempts on pull

- **Affected:** `src/sync/client.ts:185-188` (marked TODO)
- **Impact:** Every pull re-adds all server attempts without dedup.
  Unbounded growth.
- **Fix:** Track max `startedAt` per puzzle locally. Pull only newer.
- **Status:** Open

### PD-12: Unbounded append-only stores

- **Affected:** `puzzleDb.ts` (attempts, rating-history)
- **Impact:** No retention policy. Unbounded growth over months/years.
- **Fix:** Keep last 20 attempts per puzzle. Aggregate rating history
  to daily granularity after 30 days.
- **Status:** Open

### PD-13: Analysis version discard

- **Affected:** `src/idb/index.ts:444`
- **Impact:** Version bump silently discards all prior analysis.
- **Fix:** Schema migration function instead of discard.
- **Status:** Open

### PD-14: Game summaries full-scanned on stats entry

- **Affected:** `src/stats/ctrl.ts:43` (listGameSummaries)
- **Impact:** Full `getAll()` on every stats page navigation.
- **Fix:** Cache in memory after first load. Invalidate on new analysis.
- **Status:** Open

### PD-15: Deduplication uses full PGN strings in Set

- **Affected:** `src/main.ts:111-121` (dedupeImportedGames)
- **Impact:** At 30k games, creates Set holding ~90 MB of strings.
- **Fix:** Use composite key hash (players + date + result + move count).
- **Blocked by:** PD-01 (after restructure, dedupe can check IDB by key).
- **Status:** Open

### PD-16: Lichess import capped at 30 games

- **Affected:** `src/import/lichess.ts:16` (max=30 hardcoded)
- **Impact:** Importing 1000 games requires 34 manual clicks.
- **Fix:** Increase to 500-1000 or implement paginated auto-fetch.
- **Status:** Open

### PD-17: PGN parsing on main thread

- **Affected:** `src/import/lichess.ts`, `src/import/chesscom.ts`
- **Impact:** UI freezes during large Chess.com imports.
- **Fix:** Move PGN validation to Web Worker or defer to post-import.
- **Status:** Open

### PD-18: No skeleton UI during data loading

- **Affected:** Route rendering during IDB loads
- **Impact:** Blank or "Loading..." screen instead of page shell.
- **Fix:** Render full page skeleton immediately, fill data async.
- **Status:** Open

---

## Low

### PD-19: Shard cache unbounded

- **Affected:** `src/puzzles/ctrl.ts` (_shardCache)
- **Fix:** Cap at ~10 entries with LRU eviction.
- **Status:** Open

### PD-20: No NNUE prefetch hint

- **Affected:** `public/index.html`
- **Fix:** Add `<link rel="prefetch" href="/stockfish-web/nn-*.nnue">`.
- **Status:** Open

### PD-21: Duplicate Stockfish directories

- **Affected:** `public/stockfish/` (unused) and `public/stockfish-web/`
- **Fix:** Remove `public/stockfish/` if unused.
- **Status:** Open

### PD-22: No persistent storage request

- **Affected:** App startup
- **Fix:** Call `navigator.storage.persist()` on first game import.
- **Status:** Open

### PD-23: filteredSummaries recomputes on every call

- **Affected:** `src/stats/ctrl.ts:60-63`
- **Fix:** Cache result, invalidate on filter/data change.
- **Status:** Open
