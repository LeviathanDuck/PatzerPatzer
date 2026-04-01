# Architectural Decisions

Significant design decisions for Patzer Pro, with rationale and
performance implications.

---

## AD-01: Per-Game IDB Records (Planned)

**Decision:** Restructure the `game-library` IDB store from a single
record containing all games to individual records keyed by `gameId`.

**Reason:** The single-record pattern forces the entire game library to
be serialized, deserialized, and held in memory as one unit. This creates
a hard scaling wall — at 10k games (~30 MB), startup becomes slow; at
30k games (~90 MB), the app may fail to load on memory-constrained
devices. Every import rewrites the entire library.

**Alternatives considered:**
- *Paginated single record:* Split the array into chunks (e.g., 100 games
  per record). Reduces single-record size but still requires manual
  pagination logic and prevents index-based queries. Rejected as a
  half-measure.
- *Keep single record with lazy PGN loading:* Store metadata in the
  single record, PGN in a separate per-game store. Reduces memory but
  the metadata array itself becomes a bottleneck at 60k+ games. Rejected
  as insufficient.

**Performance implications:**
- Startup: loads zero or minimal game data instead of entire library
- Import: writes only new game records, not the full library
- Queries: use IDB indexes instead of in-memory filtering
- Memory: only selected game's data in memory at any time

**Lichess alignment:** Lichess stores analysis trees per-game in IDB
(`ui/analyse/src/idbTree.ts`). Game data comes from the server, never
bulk-loaded from IDB.

**Status:** Planned. Tracked as PD-01 in `docs/PERFORMANCE_DEBT.md`.

---

## AD-02: 200ms Engine Throttle (Planned)

**Decision:** Throttle engine UI updates to one redraw per 200ms.

**Reason:** Stockfish emits 10-50+ info lines per second during analysis.
Without throttling, each triggers a full VDOM diff and DOM patch. This
causes visible jank and wastes CPU on rendering updates the user cannot
perceive.

**Alternatives considered:**
- *Per-depth throttle:* Only redraw when search depth increases. Rejected
  because depth increases are irregular and this would make evaluation
  bar updates feel stuttery.
- *requestAnimationFrame only:* Cap at 60fps (~16ms). Rejected because
  even 60 redraws/second is excessive for engine output that changes
  meaningfully every 200-500ms.

**Performance implications:**
- Reduces engine-triggered redraws from 10-50/s to 5/s maximum
- Frees main thread for user interaction during analysis
- Matches Lichess behavior exactly

**Lichess alignment:** `ui/lib/src/ceval/ctrl.ts` uses explicit 200ms
throttle on `onEmit()`.

**Status:** Planned. Tracked as PD-03.

---

## AD-03: rAF-Gated Redraws (Planned)

**Decision:** Gate all `redraw()` calls through `requestAnimationFrame`
to collapse multiple synchronous calls into one frame.

**Reason:** 80+ call sites trigger `redraw()`. During rapid interactions
(scrolling, engine cycling, batch analysis progress), multiple redraws
can fire in the same frame. Each regenerates the full VDOM tree. rAF
gating ensures at most one patch per frame.

**Alternatives considered:**
- *Microtask batching (queueMicrotask):* Fires too early — before
  browser paint. Would batch within a single synchronous block but not
  across event callbacks.
- *Explicit dirty flag + manual flush:* More control but requires every
  state mutation to set the flag. Easy to forget. rAF is automatic.

**Performance implications:**
- Eliminates redundant VDOM diffs within a single frame
- Simple to implement (~5 lines wrapping existing redraw)
- No behavioral change — same final state, fewer intermediate patches

**Lichess alignment:** Lichess manages redraws through its own
orchestration layer; the principle of "one render per frame" is implicit.

**Status:** Planned. Tracked as PD-04.

---

## AD-04: Differential Sync (Planned)

**Decision:** Push and pull operations must transfer only records changed
since the last sync, not the full dataset.

**Reason:** Full-dump sync sends the entire game library + analysis on
every operation. At 30k games, this is 200+ MB per direction. It takes
minutes, blocks the UI, and risks network timeouts.

**Alternatives considered:**
- *Compression only:* Gzip the full payload. Reduces bandwidth by ~70%
  but still sends 60+ MB and requires full materialization on both ends.
  Not sufficient alone.
- *Server-triggered push:* Server detects changes and pushes to client
  via WebSocket. More complex. Not justified for a manual-sync model.

**Performance implications:**
- Typical sync (10-50 changed records) completes in seconds
- Requires `updatedAt` timestamp on every syncable record
- Requires server endpoint: `GET /api/sync/games?since=<timestamp>`

**Lichess alignment:** Lichess does not use client-server sync (server
is always primary). This is a Patzer-specific concern.

**Status:** Planned. Blocked by AD-01 (per-game records). Tracked as PD-06.

---

## AD-05: Route-Based Code Splitting (Planned)

**Decision:** Split the monolithic JS bundle into route-based chunks.
Puzzles, openings, stats, and admin are lazy-loaded on navigation.

**Reason:** Current bundle is 803 KB (187 KB gzipped). Users loading the
puzzles page download all openings, stats, analysis, and admin code.

**Alternatives considered:**
- *Feature-based splitting:* Split by capability (engine, IDB layer,
  analytics) rather than route. More granular but harder to reason about
  and more complex dependency graph.
- *No splitting, rely on caching:* After first load, browser caches the
  bundle. Acceptable for repeat visits but hurts first visit and mobile.

**Performance implications:**
- Initial load reduced to ~300-400 KB (analysis + shared)
- Each tool loads ~100-200 KB on first navigation
- Requires esbuild `splitting: true` and ESM output format

**Lichess alignment:** Lichess uses `site.asset.loadEsm()` for dynamic
module loading throughout.

**Status:** Planned. Tracked as PD-05.

---

## AD-06: Virtual Scrolling for Large Lists (Planned)

**Decision:** Any list that can exceed 200 items must use virtual
scrolling (render only visible rows plus buffer).

**Reason:** Rendering 5,000+ DOM nodes causes choppy scrolling and high
memory usage. At 30k games, the DOM becomes unusable.

**Alternatives considered:**
- *Pagination (50/page):* Simpler to implement. Acceptable as an interim
  step. However, pagination loses the "browse freely" UX that Lichess
  provides with its scrollable game lists.
- *Infinite scroll with render-on-demand:* Similar to virtual scroll but
  accumulates DOM nodes over time. Degrades eventually.

**Performance implications:**
- DOM node count stays constant (~50-100) regardless of list size
- Requires height estimation per row for scroll position calculation
- Works naturally with IDB cursor queries (fetch page on scroll)

**Lichess alignment:** Lichess game lists use server-side pagination.
The virtual scroll approach is an adaptation for client-primary storage.

**Status:** Planned. Blocked by AD-01. Tracked as PD-08.

---

## AD-07: Client-Primary Storage (Current)

**Decision:** IDB is the primary data store. Server is a backup reached
via manual push/pull.

**Reason:** Patzer Pro is a personal tool. Client-primary avoids server
dependency, works offline, and keeps the architecture simple.

**Alternatives considered:**
- *Server-primary with IDB cache:* Better for multi-device sync and
  very large datasets (60k+). More complex. Requires always-available
  server.
- *Hybrid:* Client-primary up to 30k games; automatic fallback to
  server-primary above that. Complex threshold logic.

**Performance implications:**
- All data must fit within browser IDB quotas (~10-50 GB depending on
  browser)
- Queries must work against IDB indexes, not server-side SQL
- At 60k+ games, this model may need to be revisited (AD-07a)

**Reassessment trigger:** If total IDB usage exceeds 1 GB or user
reports degradation at scale, evaluate server-primary migration.

**Status:** Active.

---

## AD-08: Emscripten Main-Thread Engine (Current)

**Decision:** Stockfish runs on the main thread via Emscripten pthreads,
not in a Web Worker.

**Reason:** A previous Worker-based approach caused recursion crashes.
Emscripten's internal threading model uses SharedArrayBuffer pthreads
and yields to the event loop, keeping the UI responsive.

**Alternatives considered:**
- *Web Worker with message passing:* Standard pattern. Avoids any
  main-thread compute. However, the recursion issue was unresolved, and
  the Emscripten approach works correctly.
- *Dedicated Worker thread per analysis depth:* Over-engineered for
  single-user.

**Performance implications:**
- Engine yields to the event loop (UI stays responsive)
- Requires COOP+COEP headers for SharedArrayBuffer
- Must still throttle UI updates to avoid excessive redraws (AD-02)

**Lichess alignment:** Lichess uses a Web Worker. This is an intentional
divergence due to the recursion issue encountered.

**Status:** Active. Monitor for any main-thread blocking under heavy
multi-PV analysis.
