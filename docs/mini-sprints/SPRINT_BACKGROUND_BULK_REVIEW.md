# Sprint Plan: Stable Background Bulk Review

## Goal

Bulk game review should continue running even when the user navigates to a different section
of the app (Puzzles, Openings, Stats, etc.). Each game in the list must show a live progress
percentage while being analyzed. Bulk review settings get a dedicated submenu in the main nav.

Background analysis and interactive game review run on **two completely independent engine
instances**, so neither ever blocks or pauses the other.

**Priority: stability and reliability above all else.** This touches the engine pipeline,
routing, game loading, and header — it must be done in strict order with no shortcuts.

---

## Architecture: Two Engine Instances

Each `StockfishProtocol` instance calls `makeModule()` independently and allocates its own
`SharedArrayBuffer`-backed WASM memory. Two instances can run in parallel because
Emscripten manages their pthreads internally without any shared global state.

### Live Analysis Engine (existing `protocol` in `engine/ctrl.ts`)
- Purpose: interactive analysis on the analysis board, retro ctrl, threat analysis
- Threads: `cores - 1` (existing behavior)
- Hash: 256 MB (existing)
- MultiPV: user-configurable

### Background Review Engine (new `reviewProtocol` in `reviewQueue.ts`)
- Purpose: bulk game review only, never interactive
- Threads: **1** — no pthreads workers spawned, minimal CPU competition
- Hash: **32 MB** — fixed-depth batch analysis; hash barely helps, smaller is fine
- MultiPV: always 1

### Memory budget

| Engine | WASM memory | Hash | Threads overhead | Total |
|--------|------------|------|-----------------|-------|
| Live | 96 MB | 256 MB | ~5 MB (3-7 workers) | ~357 MB |
| Background | 96 MB | 32 MB | 0 MB (1 thread) | ~128 MB |
| **Combined** | | | | **~485 MB** |

Acceptable on any modern desktop or laptop. The WASM binary (`sf_18_smallnet.wasm`) is
browser-cached after the live engine loads it — the background engine's `init()` reuses
the cached binary with no second download.

### Benefit of two engines

- No auto-pause logic needed (Sprint 5 from the original plan is **eliminated**)
- Background batch runs even while the user is actively using the analysis board
- The two systems share zero runtime state — no engine command conflicts possible
- Architecture is simpler and more debuggable

---

## Root Cause Analysis of Current Failures

### 1. `loadGame()` unconditionally destroys the queue

`main.ts loadGame()` always calls `resetBatchState()` (batch.ts:126-133), which sets:
```
batchQueue = [], batchDone = 0, batchAnalyzing = false, batchState = 'idle'
```
`loadGame()` is called when advancing the multi-game queue AND on every route change
to `#/analysis-game/:id`. **Both paths nuke the queue.**

### 2. No per-game AnalyseCtrl

`batch.ts` injects one `_getCtrl` for the entire session. When the route changes and
`loadGame()` replaces the global `ctrl`, `advanceBatch()` now calls `_getCtrl()` on the
wrong tree. Eval cache keys from the old tree are meaningless on the new ctrl.

### 3. Route change handler triggers game loads

`main.ts onChange()` calls `loadGame()` if the route is `analysis-game/:id` and the id
doesn't match `selectedGameId`. There is no guard for "bulk review is active."

---

## Sprint 0 — Make `StockfishProtocol` configurable

**Goal**: Allow the background engine to initialize with different thread/hash settings
than the live engine.

**Files: `src/ceval/protocol.ts` only**

Currently `received()` hardcodes `Threads = cores - 1` and `Hash = 256`. These need to
be overridable so the background engine can run at `Threads=1, Hash=32`.

```typescript
export interface ProtocolConfig {
  threads?: number;  // override — omit to use the default (cores - 1)
  hash?:    number;  // override — omit to use the default (256)
}

export class StockfishProtocol {
  constructor(private config: ProtocolConfig = {}) {}
  ...
  // In received(), when uciok:
  const cores   = navigator.hardwareConcurrency ?? 2;
  const threads = this.config.threads ?? Math.max(1, cores - 1);
  const hash    = this.config.hash    ?? 256;
  this.send(`setoption name Threads value ${threads}`);
  this.send(`setoption name Hash value ${hash}`);
}
```

The existing `protocol` in `engine/ctrl.ts` is instantiated as `new StockfishProtocol()`
with no arguments — **no behavior change for live analysis**.

### Acceptance criteria
- Live engine behavior is identical to today
- `new StockfishProtocol({ threads: 1, hash: 32 })` starts correctly and responds to UCI

---

## Sprint 1 — Isolated background review queue with its own engine

**Goal**: Each queued game has its own `AnalyseCtrl` built at enqueue time. The background
queue has its own `StockfishProtocol` instance, completely independent of live analysis.

**Files: `src/engine/reviewQueue.ts` (new), `src/engine/batch.ts`**

### `reviewQueue.ts` — new module

Owns all multi-game queue state. Never touched by route changes.

```typescript
// One background engine instance for the lifetime of the app.
// Initialized lazily on first bulk review start.
const reviewProtocol = new StockfishProtocol({ threads: 1, hash: 32 });
let reviewEngineReady = false;

export interface ReviewQueueEntry {
  game:      ImportedGame;
  ctrl:      AnalyseCtrl;             // built at enqueue time, never the visible board's ctrl
  cache:     Map<string, PositionEval>; // per-game eval cache, isolated
  done:      number;                  // positions analyzed so far this game
  total:     number;                  // mainline positions in this game
  status:    'pending' | 'analyzing' | 'complete' | 'error';
}

// Public API:
export function enqueueBulkReview(games: ImportedGame[]): void
export function isBulkRunning(): boolean
export function isBulkPaused(): boolean  // manual pause from settings submenu
export function cancelBulkReview(): void
export function pauseBulkReview(): void
export function resumeBulkReview(): void
export function getReviewProgress(gameId: string): number | undefined  // 0–100
export function getQueueSummary(): { total: number; done: number; running: boolean }
```

**Enqueue behavior**: `enqueueBulkReview(games)` builds one `AnalyseCtrl` and one
`Map<string, PositionEval>` per game immediately. Games already in `analyzedGameIds`
are skipped. Games already in the queue are skipped (idempotent).

**Engine lifecycle**: The background engine initializes once (lazily on first enqueue)
and stays running for the session. Never shut down mid-queue.

### Modify `batch.ts` for per-game ctrl injection

`batch.ts` gains an optional injectable `getQueueCtrl?: () => AnalyseCtrl | undefined`.
When this returns a value, `_getCtrl()` uses it. When it returns undefined, falls back
to the injected board ctrl. This lets the queue drive analysis on its own ctrl.

Similarly, `evalCache` access in batch.ts must be injectable or the queue module must
swap in its per-game cache before each game starts. **Preferred**: `reviewQueue.ts`
calls `evalBatchItem` directly using its own protocol and cache, keeping all queue logic
in one module rather than distributing it across batch.ts.

### Acceptance criteria
- Enqueuing 5 games creates 5 `AnalyseCtrl` instances in memory
- Background engine initializes lazily on first call to `enqueueBulkReview`
- Live engine is never touched by the background queue
- Both engines can be running simultaneously without conflicts

---

## Sprint 2 — Route-change resilience

**Goal**: Navigating anywhere in the app does not interrupt or destroy the queue.

**Files: `src/main.ts` (2 targeted changes)**

### Change 1: Guard `loadGame()`

```typescript
function loadGame(pgn: string, opts?: { source?: 'queue' | 'user' }): void {
  if (opts?.source === 'queue') {
    // Background queue advance: rebuild ctrl only.
    // Do NOT call resetBatchState(). Do NOT call clearEvalCache().
    // The queue module owns those — main.ts must not touch them.
    ctrl = new AnalyseCtrl(pgnToTree(pgn));
    restoreGeneration++;
    return;
  }
  // Normal user path — unchanged
  ...
}
```

### Change 2: Guard the `onChange` handler

```typescript
// In main.ts onChange():
// While bulk review is running, ignore analysis-game deep links.
// The visible board is independent of what the queue is analyzing.
if (isBulkRunning() && (route.name === 'analysis-game')) {
  selectedGameId = route.params.id;
  vnode = patch(vnode, view(currentRoute));
  return;
}
```

### Remove `onQueuedBatchComplete` and `gameAnalysisQueue` from `main.ts`

These are replaced entirely by `reviewQueue.ts` internals. `main.ts` no longer manages
any queue state — it only calls `enqueueBulkReview(games)` and reads `isBulkRunning()`.

### Acceptance criteria
- Start bulk review of 10 games, navigate to Puzzles → Openings → Stats → Games
- Return to Games tab — all 10 games are analyzed with correct results
- The visible analysis board is completely unaffected throughout

---

## Sprint 3 — Per-game progress display in the games list

**Goal**: Games being analyzed show a live progress percentage on their row.

**Files: `src/games/view.ts`, `src/styles/main.scss`**

### Progress badge on game rows

```typescript
// In renderGameRow / renderCompactGameRow:
const progress = getReviewProgress(game.id);
// priority: in-progress > analyzed > missed-tactic > none
if (progress !== undefined && progress < 100) {
  badges.push(h('span.game-row__progress', `${Math.round(progress)}%`));
} else if (analyzedIds.has(game.id)) {
  // existing analyzed badge
}
```

Progress updates fire on each bestmove from the background engine. `advanceBatch()`
already calls `_redraw()` after each position — that redraw path repaints the games
list automatically. No new redraw wiring needed.

### Analyzing row style

```scss
.game-list__row.analyzing {
  background: #181d28;
}

.game-row__progress {
  color: #7eb6d9;
  font-size: 0.78em;
  font-variant-numeric: tabular-nums;
  min-width: 2.8ch;
  text-align: right;
}
```

### Queue summary line

When `isBulkRunning()`, above the game list:

```
h('div.games-view__queue-status',
  `Reviewing ${summary.total} games — ${summary.done} complete`)
```

Disappears automatically when queue finishes (no special teardown needed — next redraw
sees `!isBulkRunning()` and omits the element).

### Acceptance criteria
- Row shows "37%" while that game is being analyzed
- Percentage ticks up with each bestmove (~every 1-3 seconds at depth 16)
- Row switches to analyzed badge immediately after that game completes
- Queue summary line visible and accurate throughout

---

## Sprint 4 — Bulk Review settings submenu in the header

**Goal**: Dedicated submenu in the main nav for bulk review settings and queue controls.

**Files: `src/header/index.ts`, `src/styles/main.scss`**

### New nav entry with live badge

Add "Review" to `navLinks`. When `isBulkRunning()`, the item shows a count badge:

```
Analysis  Games  Puzzles  Openings  Stats  Review [●7]
```

The badge count = games remaining in queue. Updates on every redraw.

```scss
.review-queue-badge {
  background: #3a6ea8;
  border-radius: 8px;
  font-size: 0.7em;
  padding: 0 5px;
  margin-left: 4px;
  font-variant-numeric: tabular-nums;
}
```

### Submenu layout

Clicking "Review" opens a dropdown (same pattern as the existing global settings menu):

```
┌──────────────────────────────────┐
│  Bulk Review Settings             │
├──────────────────────────────────┤
│  Analysis Depth                   │
│  ○ 12  ○ 14  ● 16  ○ 18  ○ 20    │
├──────────────────────────────────┤
│  Auto-review on import            │
│  [✓] Review new games after       │
│      importing automatically      │
├──────────────────────────────────┤
│  Queue                            │
│  7 games remaining                │
│                                   │
│  [ Pause ]  [ Cancel ]            │
└──────────────────────────────────┘
```

When queue is paused, "Pause" becomes "Resume".
When queue is empty / not running, the Queue section shows "No review running."

### Settings persistence (localStorage)

- `patzer.reviewDepth` — already exists in `batch.ts`; wire the UI controls to `setReviewDepth()`
- `patzer.autoReview` — new boolean; when true, calls `enqueueBulkReview(newGames)` at the end of any import

### Acceptance criteria
- Depth selection updates `reviewDepth` and persists across page reload
- Auto-review checkbox persists and triggers bulk review after next import
- Pause/resume/cancel all work correctly
- Badge count decrements as games complete
- Submenu closes on outside click (same pattern as existing menus)

---

## Implementation Order and Dependencies

```
Sprint 0 (protocol.ts — configurable engine options)
    └── Sprint 1 (reviewQueue.ts + batch.ts — two-engine architecture)
            └── Sprint 2 (main.ts — route-change resilience)
                    ├── Sprint 3 (games/view.ts — progress display)
                    └── Sprint 4 (header/index.ts — settings submenu)
```

Sprints 3 and 4 are independent of each other after Sprint 2. Either can go first.

Sprint 0 is small (one file, one change) and should be verified with a build before
Sprint 1 begins.

---

## Critical Constraints

### One bestmove at a time, per engine

Each engine has its own in-flight search state. The background engine must follow the
same discipline as the live engine: never send `go` before receiving `bestmove` for
the current position. `reviewQueue.ts` must track its own `engineSearchActive` flag
(same pattern as `engine/ctrl.ts`'s `engineSearchActive`).

### AnalyseCtrl memory budget

Each `AnalyseCtrl` holds the full move tree in memory. At 50 games × ~60 nodes:
manageable (~3k objects). For queues over ~200 games, build ctrl **lazily** — only when
the game enters the `'analyzing'` slot — rather than eagerly at enqueue time. Sprint 1
can build eagerly; add lazy construction if memory becomes a concern.

### IDB saves use per-game cache

`saveAnalysisToIdb('complete', gameId, buildAnalysisNodes(entry.ctrl.mainline, p => entry.cache.get(p)), depth)`

The per-game `entry.cache` must be passed, not the global `evalCache` from `engine/ctrl.ts`.
This is the only IDB correctness constraint — get it right in Sprint 1.

### Background engine hash size

`Hash=32` is sufficient for fixed-depth batch analysis. The hash table helps most in
interactive analysis where the same position is re-evaluated repeatedly. In batch mode
(each position evaluated once to a fixed depth), the hash provides minimal benefit.

### Do not toggle the background engine between games

The background engine should stay running (`isready` / ready state) throughout the
entire queue. Only the first enqueue call needs to init and wait for `readyok`. After
that, just `ucinewgame` + `position fen` + `go` per position.

---

## Files Created / Modified

| Sprint | File | Change Type |
|--------|------|-------------|
| 0 | `src/ceval/protocol.ts` | Modify — add `ProtocolConfig` constructor param |
| 1 | `src/engine/reviewQueue.ts` | **New module** |
| 1 | `src/engine/batch.ts` | Modify — accept queue ctrl + cache injection |
| 2 | `src/main.ts` | Modify — guard `loadGame` + `onChange`; remove queue state |
| 3 | `src/games/view.ts` | Modify — progress badge on rows |
| 3 | `src/styles/main.scss` | Modify — `.analyzing` row + badge styles |
| 4 | `src/header/index.ts` | Modify — Review submenu |
| 4 | `src/styles/main.scss` | Modify — submenu + queue badge styles |

**Total: 6 files touched, 1 new file. No Sprint 5 (auto-pause eliminated by two-engine design).**
