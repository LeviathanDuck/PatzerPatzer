# Performance Guidelines

Mandatory reference for all development on Patzer Pro.
Violations of **Core Rules** must be fixed before merging.

---

## Philosophy

### What "Lichess-level snappiness" means here

Lichess feels instant because it:
- renders page chrome before data arrives
- throttles expensive updates (engine at 200ms)
- never bulk-loads user data into the browser
- defers non-critical work to idle callbacks
- uses code splitting so each page loads only what it needs

Patzer Pro must pursue the same perceived speed. The user should never wait
for the app to "catch up." Every interaction — tool switch, move navigation,
puzzle transition, game list scroll — must feel immediate.

### Governing principles

1. **UI first, data second.** Render the page shell instantly. Fill data asynchronously.
2. **Load only what is needed now.** Never load a full dataset when the user only sees 50 rows.
3. **Never block the main thread on I/O or heavy compute.** If it takes >16ms, defer or offload.
4. **Perceived speed > raw speed.** A 200ms operation that shows progress feels faster than a 100ms operation with a blank screen.
5. **Design for 30k+ games from day one.** Every data path must be evaluated against this target.

---

## Core Rules (Non-Negotiable)

These are hard constraints. Code that violates them must not ship.

### CR-1: No blocking UI on large dataset queries

Any operation that touches more than ~100 records must be async and must not
prevent the user from interacting with the app. This includes IDB reads, server
fetches, and in-memory scans.

### CR-2: No eager full-dataset loading

Never load an entire object store or table into memory unless the total record
count is guaranteed to remain small (< 500 records). Game libraries, analysis
records, puzzle definitions, and attempt histories must be loaded on demand,
paginated, or cursor-iterated.

### CR-3: All large lists must be virtualized or paginated

Any list that can exceed ~200 items must use virtual scrolling (render only
visible rows + buffer) or pagination. This applies to: game lists, puzzle
libraries, attempt histories, opponent game lists, stat tables.

### CR-4: Heavy computation must be deferred or offloaded

Operations that process >1000 records or take >50ms must either:
- run in a Web Worker, or
- be chunked with `setTimeout(fn, 0)` yielding between chunks, or
- be scheduled via `requestIdleCallback`

Examples: PGN parsing of large imports, opening tree building, retro candidate
extraction, summary backfilling.

### CR-5: Game imports must never freeze the UI

The import flow must show progress, allow cancellation, and never block
interaction. Parsing, deduplication, and storage writes must be async.

### CR-6: Analysis data must not be duplicated unnecessarily

Store each piece of analysis data exactly once. Do not store the same eval
in both the tree and a separate cache and the IDB record. The eval cache
(`Map<path, PositionEval>`) is the single source of truth during a session;
IDB is the persistence layer.

### CR-7: IDB records must be individually keyed

Never store a collection as a single record (e.g., all games in one array
under one key). Each entity (game, analysis result, puzzle definition) must
be its own record, keyed by its natural ID, with appropriate indexes.

### CR-8: Sync must be differential

Push and pull operations must transfer only records changed since the last
sync, not the entire dataset. Full-dump sync is forbidden at any scale
beyond initial seed.

### CR-9: Server writes must be batched

Never use sequential single-row INSERT in a loop. Use multi-row INSERT
statements or batch prepared statements. A sync of 10k records must complete
in seconds, not minutes.

### CR-10: Engine UI updates must be throttled

Engine output must be throttled to a maximum of one UI update per 200ms.
This matches the Lichess pattern (`ui/lib/src/ceval/ctrl.ts`). Do not
trigger a full redraw on every engine info line.

---

## Rendering & UI Rules

### R-1: Redraw must be frame-gated

All `redraw()` calls must be collapsed into a single `requestAnimationFrame`
cycle. Multiple synchronous state changes must produce exactly one DOM patch.

```typescript
// Pattern: rAF-gated redraw
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

### R-2: Throttle high-frequency input triggers

Wheel scroll, pointer drag, and resize events that trigger redraw must be
throttled to at most one redraw per 50ms (wheel/resize) or per
`requestAnimationFrame` (pointer drag).

### R-3: Memoize stable view subtrees

View sections that do not change on most redraws (e.g., the header when only
the board position changed) should use Snabbdom's `thunk()` or manual
memoization to skip regeneration.

Reference: Lichess `resizeCache` pattern in `ui/analyse/src/view/main.ts`.

### R-4: Use requestIdleCallback for non-critical work

Menu initializations, analytics computations, and non-visible prefetches
should be scheduled via `requestIdleCallback` with a 500ms timeout.

Reference: Lichess `ui/lib/src/common.ts` — `requestIdleCallback` usage.

### R-5: Render shell before data

Every route must render its full page skeleton immediately (header, nav,
empty panels, board placeholder). Data fills in asynchronously. The user
must never see a blank page while waiting for IDB or network.

### R-6: Interaction latency budget

| Interaction | Target | Maximum |
|---|---|---|
| Board move (click/drag) | < 16ms | 33ms |
| Move list navigation | < 16ms | 50ms |
| Puzzle move submission | < 16ms | 33ms |
| Tool/page switch | < 50ms | 100ms |
| Engine toggle on/off | < 100ms | 200ms |
| Game list scroll (60fps) | < 16ms | 16ms |

---

## Data Loading Strategy

### DL-1: Startup must load only navigation state

At app boot, load:
- the current route and its minimal state
- the currently selected game ID (not its PGN)
- user preferences (from localStorage)

Do NOT load at startup:
- the full game library
- all puzzle definitions
- all game summaries
- analysis data for unselected games

### DL-2: Load PGN on demand

Game PGN text must not be held in a bulk array. Store PGN as individual IDB
records. Load the PGN for a specific game only when the user selects it.

### DL-3: Prefetch the next likely item

When the user is solving a puzzle, prefetch the next puzzle definition and
its PGN. When the user is browsing a game list, prefetch the PGN of the
hovered or next game.

Reference: Lichess `next: Deferred<PuzzleData>` pattern in
`ui/puzzle/src/ctrl.ts`.

### DL-4: Use IDB cursors for large scans

When iterating over an object store with >500 records, use an IDB cursor
with a limit rather than `getAll()`. Never materialize an entire store
into memory unless the store is known to be small.

Reference: Lichess `ui/lib/src/objectStorage.ts` — cursor-based iteration.

### DL-5: Cache computed aggregates

Aggregations over large datasets (game summaries, accuracy stats, collection
analytics) must be cached in memory after first computation. Invalidate only
when the underlying data changes (new analysis completed, new games imported).

---

## Storage & Scaling Rules

### SS-1: One record per entity

Every game, analysis result, puzzle definition, game summary, and retro
result must be stored as its own IDB record with its natural key.

### SS-2: Required IDB indexes

| Store | Required Indexes |
|---|---|
| games | `date`, `importedUsername`, `source`, `timeClass` |
| analysis-library | (keyed by gameId — sufficient) |
| game-summaries | (keyed by gameId — sufficient) |
| puzzle-definitions | `sourceKind`, `rating`, `createdAt` |
| puzzle-attempts | `puzzleId`, `completedAt` |

### SS-3: Append-only stores must have retention policies

`puzzle-attempts` and `rating-history` must enforce limits:
- attempts: keep last 20 per puzzle, or last 12 months
- rating-history: keep daily aggregates, prune sub-daily entries after 30 days

### SS-4: Share IDB version constants

The IDB database version used in `src/idb/index.ts` must be exported as a
named constant. All other modules that open the same database (including
`sync/client.ts`) must import and use that constant. Never hardcode a
version number in more than one place.

### SS-5: Deduplication must use hashes, not full content

When deduplicating games, use a composite key (players + date + result +
move count) or a content hash. Never hold all PGN strings in a Set.

### SS-6: Sync payloads must be paginated

No single sync request may transfer more than 1000 records. Use
cursor-based pagination with `since` timestamps or offset/limit.

### SS-7: Scaling targets

| Scale | Requirement |
|---|---|
| 1,000 games | Everything fast. No special measures needed. |
| 10,000 games | Per-game IDB records, indexed queries, virtual lists. |
| 30,000 games | Lazy PGN loading, differential sync, server pagination. |
| 60,000+ games | Server-primary with IDB as cache for working set. |

---

## Anti-Patterns (Explicitly Forbidden)

### AP-1: Single-record collections
Storing a variable-length array of entities as one IDB record.
**Why forbidden:** Serialization time grows linearly. Exceeds IDB transaction
limits. Forces full load into memory.

### AP-2: getAll() on large stores
Using `store.getAll()` on any store that can exceed 500 records.
**Why forbidden:** Materializes entire store into memory. No way to limit,
filter, or page.

### AP-3: Sequential single-row server inserts
`for (const r of records) await upsertOne(r);`
**Why forbidden:** O(n) round trips. 30k records = 5+ minutes.

### AP-4: Full-dump sync
Sending the entire game library or analysis set on every push/pull.
**Why forbidden:** Unscalable. Network timeouts. Memory pressure.

### AP-5: Unthrottled engine-to-UI updates
Calling `redraw()` on every engine info line without throttling.
**Why forbidden:** Engine emits 10-50+ updates/second. Causes jank.

### AP-6: Dedup via full-content Set
`new Set(games.map(g => g.pgn))` for deduplication.
**Why forbidden:** Holds entire PGN corpus in memory twice.

### AP-7: Unbounded in-memory caches
Maps, Sets, or arrays that grow without limit during a session.
**Why forbidden:** Memory leak equivalent. Browser tab crashes at scale.

### AP-8: Version-based data discard
Incrementing `ANALYSIS_VERSION` and silently discarding all prior analysis.
**Why forbidden:** Destroys hours of engine computation without warning.

---

## Lichess Performance Patterns to Follow

| Pattern | Lichess Reference | Apply In Patzer Pro |
|---|---|---|
| 200ms engine throttle | `ui/lib/src/ceval/ctrl.ts` | Engine output → redraw path |
| requestIdleCallback | `ui/lib/src/common.ts` | Non-critical init, analytics |
| Deferred next-puzzle | `ui/puzzle/src/ctrl.ts` | Puzzle session flow |
| Cursor-based IDB | `ui/lib/src/objectStorage.ts` | Any large-store iteration |
| storedProp (lazy read) | `ui/lib/src/storage.ts` | localStorage access |
| storedMap with LRU | `ui/lib/src/storage.ts` | Bounded caches |
| Dynamic ESM import | `site.asset.loadEsm()` | Route-based code splitting |
| Dirty-flag IDB saves | `ui/analyse/src/idbTree.ts` | Analysis persistence |
| Conditional feature init | `ui/analyse/src/ctrl.ts` | Explorer, chat, forecast |
| Resize debouncing | `ui/analyse/src/view/main.ts` | Window resize handling |

---

## Reference

- Full audit: `docs/audits/PERFORMANCE_SCALABILITY_AUDIT_2026-03-30.md`
- Lichess source: `~/Development/lichess-source/lila`
- Data architecture: `docs/DATA_ARCHITECTURE.md`
- Performance debt tracker: `docs/PERFORMANCE_DEBT.md`
- Pre-ship checklist: `docs/PERFORMANCE_CHECKLIST.md`
