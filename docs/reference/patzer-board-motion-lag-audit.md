# Patzer Board Motion Lag Audit

Date: 2026-03-21

Scope:
- why piece movement on the analysis board feels laggy or visually hitchy
- especially while stepping through the move list with engine on
- after game review / retrospection data is present
- in board states where arrows, glyphs, and other overlays are active

Method:
- source audit of the current Patzer Pro code
- source comparison against the local Lichess analysis-board implementation
- no browser performance trace was captured in this pass, so the findings below are
  source-backed root-cause analysis rather than measured frame-time profiling

Relevant Patzer files:
- `src/main.ts`
- `src/board/index.ts`
- `src/engine/ctrl.ts`
- `src/ceval/protocol.ts`
- `src/ceval/view.ts`
- `src/analyse/evalView.ts`
- `src/analyse/boardGlyphs.ts`
- `src/idb/index.ts`

Relevant Lichess files:
- `~/Development/lichess-source/lila/ui/analyse/src/ctrl.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/ground.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/autoShape.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/idbTree.ts`
- `~/Development/lichess-source/lila/ui/lib/src/ceval/ctrl.ts`
- `~/Development/lichess-source/lila/ui/lib/src/ceval/view/main.ts`
- `~/Development/lichess-source/lila/ui/lib/src/game/glyphs.ts`
- `~/Development/lichess-source/lila/ui/chart/src/acpl.ts`

---

## Executive Summary

The board lag is not coming from one bad animation setting.

The current Patzer navigation path frequently stacks all of these on the same interaction:

1. Chessground board state update
2. engine stop/start or cache lookup
3. arrow and glyph rebuilds
4. full Snabbdom app patch
5. game-library IndexedDB save
6. scroll-into-view work
7. repeated live-engine `info` updates that trigger more redraws while the move animation is still running

That is the core reason the move animation can feel sticky or ugly.

The strongest source-backed difference from Lichess is:

- Lichess throttles ceval UI emission before it hits the analyse redraw path
- Patzer redraws directly off raw engine `info` lines

The second strongest difference is:

- Lichess does not rewrite a whole imported-game library record on every navigation step
- Patzer does

The third strongest difference is:

- Patzer defaults to a heavier live-analysis workload than Lichess:
  - `multiPv = 3`
  - `analysisDepth = 30`
- Lichess defaults to `multiPv = 1` and a movetime-driven search in `CevalCtrl`

So the lag is very plausibly "too many things trying to draw/update at the same time", but the code shows exactly what those things are.

---

## What Happens On A Single Move Step In Patzer

When the user navigates to another move in `src/main.ts`, `navigate(path)` does this:

- `ctrl.setPath(path)`
- `ctrl.retro?.onJump(path)`
- `syncBoard()`
- `evalCurrentPosition()`
- `saveGamesToIdb(importedGames, selectedGameId, ctrl.path)`
- `redraw()`
- `scrollActiveIntoView()`

Source:
- `src/main.ts:312-327`

That means one move step is not just "animate board to new position".
It is also:

- recompute legal destinations from FEN
- possibly stop the current engine search
- clear/rebuild arrows
- patch the full app shell
- write IndexedDB
- then keep reacting to incoming engine lines

Lichess has a much cleaner separation:

- `jump(path)` updates path state
- `showGround()` applies the board state and auto-shapes
- ceval updates are throttled before they hit redraw

Source:
- `~/Development/lichess-source/lila/ui/analyse/src/ctrl.ts:431-485`
- `~/Development/lichess-source/lila/ui/analyse/src/ctrl.ts:355-367`
- `~/Development/lichess-source/lila/ui/lib/src/ceval/ctrl.ts:onEmit`

---

## Ranked Findings

## 1. High confidence: Patzer redraws on raw engine output too often

Patzer:
- `parseEngineLine()` runs on every raw UCI `info` line
- for the main PV it does:
  - `syncArrowDebounced()`
  - `_redraw()`
  - `ctrl.retro?.onCeval()`

Source:
- `src/engine/ctrl.ts:400-466`

Lichess:
- `CevalCtrl.onEmit` is throttled to `200ms`
- only the throttled emission updates visible ceval state

Source:
- `~/Development/lichess-source/lila/ui/lib/src/ceval/ctrl.ts:onEmit`

Why this matters:
- engine search produces many `info` lines per second
- Patzer lets those lines drive UI work directly
- piece animation is then competing with:
  - repeated Snabbdom patching
  - repeated arrow shape churn
  - repeated retro ceval checks

This is the single strongest likely cause of "board move animation feels bad while engine is on".

Recommended fix:
- introduce a throttled engine-UI emission layer
- keep raw parsing internal, but only publish UI updates every 150-200ms
- mirror the Lichess `CevalCtrl.onEmit` pattern instead of redrawing from raw `info`

Smallest safe step:
- add a throttled `scheduleEngineUiRefresh()` in `src/engine/ctrl.ts`
- update `currentEval` immediately in memory
- only call `_redraw()` and `syncArrowDebounced()` from the throttled path

---

## 2. High confidence: Patzer persists the entire game library on every navigation step

Patzer:
- `navigate(path)` always does `saveGamesToIdb(importedGames, selectedGameId, ctrl.path)`
- `saveGamesToIdb` writes `{ games, selectedId, path }`
- that means the full `ImportedGame[]` array is written to IndexedDB repeatedly during move stepping

Source:
- `src/main.ts:323-326`
- `src/idb/index.ts:120-133`

Lichess:
- `setPath()` calls `idbTree.saveMoves()`
- but `IdbTree.saveMoves()` returns early unless the tree is dirty
- pure navigation does not force a heavy full-library persistence write

Source:
- `~/Development/lichess-source/lila/ui/analyse/src/ctrl.ts:303-313`
- `~/Development/lichess-source/lila/ui/analyse/src/idbTree.ts:88-106`

Why this matters:
- IndexedDB itself is async, but preparing large objects and starting a readwrite transaction still adds work
- Patzer is writing much more data than necessary for "I stepped to another move"

Recommended fix:
- stop writing the full game library on every move step
- persist only lightweight nav state, and debounce it

Best direction:
- split `selectedId/path` from the full imported-game payload
- debounce nav-state persistence by 300-1000ms
- only write the full game library when imports actually change

Smallest safe step:
- replace `saveGamesToIdb(importedGames, selectedGameId, ctrl.path)` inside `navigate()` with a debounced lightweight nav-state save

---

## 3. High confidence: Patzer defaults to a heavier live-engine workload than Lichess

Patzer defaults:
- `multiPv = 3`
- `analysisDepth = 30`

Source:
- `src/engine/ctrl.ts:128-135`

Lichess defaults:
- `storedPv = 1`
- `storedMovetime = 8000`
- search is movetime-driven by default, not hard-coded depth 30 multipv 3

Source:
- `~/Development/lichess-source/lila/ui/lib/src/ceval/ctrl.ts:20-24`
- `~/Development/lichess-source/lila/ui/lib/src/ceval/ctrl.ts:get search`

Why this matters:
- MultiPV 3 produces more engine output
- depth 30 is expensive, especially when restarting on every navigation
- more lines means more parsing, more redraw triggers, more arrow candidates, more overlay churn

Recommended fix:
- reduce the live-analysis default workload

Safe options:
- default `multiPv` to `1`
- keep higher MultiPV as an opt-in setting
- consider lowering default live depth or switching to a movetime model for interactive browsing

Important nuance:
- this is not just a performance tweak
- it also makes Patzer more Lichess-aligned

---

## 4. High confidence: Arrow and overlay updates are heavier than they need to be

Patzer rebuilds all board overlays through `buildArrowShapes()`:

- best-move arrow
- secondary PV arrows
- optional arrow labels
- played-move arrow
- board review glyphs
- KO overlay

Source:
- `src/engine/ctrl.ts:174-245`

And applies them with:
- `cg.set({ drawable: { autoShapes: buildArrowShapes() } })`

Source:
- `src/engine/ctrl.ts:360-391`

Lichess does:
- `this.chessground?.setAutoShapes(computeAutoShapes(this))`

Source:
- `~/Development/lichess-source/lila/ui/analyse/src/ctrl.ts:707-708`

Why this matters:
- Patzer’s overlay set can include multiple custom SVG shapes and text labels
- they are rebuilt often
- they are pushed through generic `cg.set(...)` drawable updates
- the board move animation is then competing with overlay DOM churn

This gets worse because the current defaults can include:
- all engine lines
- played arrow
- board review glyphs

Recommended fix:
- switch arrow application to `setAutoShapes(...)`
- compute a stable overlay signature and skip updates when shapes are effectively unchanged
- do not rebuild labels/glyph SVG strings if the visible move set did not change

Smallest safe step:
- replace `cg.set({ drawable: { autoShapes: ... } })` with `cg.setAutoShapes(...)`
- add a cached last-shape signature in `src/engine/ctrl.ts`

---

## 5. High confidence: Patzer animates every new shape node with a fade-in

Patzer CSS:
- `.cg-shapes g[cgHash], .cg-custom-svgs g[cgHash] { animation: engine-arrow-fade-in 130ms ease-out; }`

Source:
- `src/styles/main.scss:1280-1293`

Why this matters:
- every time the shape set changes, newly inserted shape groups animate
- during live search, that can mean repeated fade-ins while the board itself is also animating pieces
- the effect may look elegant in isolation, but under rapid engine churn it increases visual instability

Lichess:
- no equivalent default fade-in animation was found in the relevant analysis-board sources inspected here

Assessment:
- likely not the root cause alone
- very plausible amplifier of the perceived lag/jank

Recommended fix:
- do not animate every live-search shape insertion
- only fade on first appearance of a new settled arrow state, or on bestmove change
- optionally disable fade while engine is actively searching

---

## 6. Medium confidence: `syncBoard()` recomputes legal destinations from FEN on every jump

Patzer:
- `syncBoard()` calls `computeDests(node.fen)`
- `computeDests()` does:
  - `parseFen`
  - `Chess.fromSetup`
  - `chessgroundDests`

Source:
- `src/board/index.ts:71-79`
- `src/board/index.ts:238-253`

Lichess:
- `makeCgOpts()` uses `this.node.dests()`
- that is a cached node-level seam, not a fresh FEN reconstruction on every board sync

Source:
- `~/Development/lichess-source/lila/ui/analyse/src/ctrl.ts:371-393`

Why this matters:
- on its own, this is moderate cost
- stacked with engine churn and redraws, it becomes part of the hitch budget

Recommended fix:
- cache destination maps by path or FEN
- or attach computed dests to tree nodes

Smallest safe step:
- add a `Map<string, Map<Key, Key[]>>` cache keyed by FEN in `src/board/index.ts`

---

## 7. Medium confidence: Full-shell redraws cause graph, move list, and tool column to re-render during engine activity

Patzer redraw path:
- `redraw()` is full `patch(vnode, view(currentRoute))`

Source:
- `src/main.ts:705-706`

That means engine-driven redraws also rebuild:
- player strips
- move list
- analysis summary area
- eval graph SVG
- underboard game list
- tool column

Lichess also redraws its view tree, so full redraw alone is not the bug.
The difference is frequency and coupling:

- Lichess throttles ceval emission
- Patzer redraws off raw engine messages

Patzer’s eval graph is also pure SVG rebuilt in view code, not a persistent chart instance.

Source:
- `src/analyse/evalView.ts:284-489`
- compare with Lichess chart instance reuse in `~/Development/lichess-source/lila/ui/chart/src/acpl.ts`

Recommended fix:
- reduce redraw frequency first
- then, if needed, split the heaviest live-analysis surfaces from the rest of the shell

Best order:
1. throttle engine UI emission
2. remove nav-time IDB write
3. only then judge whether view decomposition is still necessary

---

## 8. Medium confidence: Engine stop/start churn during rapid navigation is rough on board feel

Patzer:
- `evalCurrentPosition()` stops an active search when the user navigates away
- queues `pendingEval`
- clears arrows immediately
- starts a new search once the prior stop resolves

Source:
- `src/engine/ctrl.ts:605-662`

This is not inherently wrong.
But combined with:
- depth 30
- MultiPV 3
- raw `info`-driven redraws
- fade-in overlays

it creates exactly the kind of "board just moved, but the UI is still shuddering around it" feeling the user described.

Recommended fix:
- keep the stop/queue model
- but introduce a very small navigation settle window before starting the next visible UI refresh
- do not redraw the full shell immediately when only `pendingEval` changed

---

## 9. Lower confidence but plausible: Main-thread engine coordination magnifies the impact of the above

Patzer’s `StockfishProtocol` notes:
- `stockfish-web runs in the MAIN THREAD`

Source:
- `src/ceval/protocol.ts:1-9`

This is adapted from Lichess’s stockfish-web approach, so it is not automatically "the bug".
But it means Patzer cannot afford extra UI churn on top of engine traffic.

In other words:
- the engine model makes redraw discipline more important, not less

---

## Why It Feels Worse In Specific States

## With engine on

This is the worst case because:
- navigation starts or resumes engine work
- engine emits many `info` lines
- Patzer redraws from those `info` lines
- arrows/glyphs/labels get rebuilt while the piece animation is still settling

## After game review

This often means more overlays are active:
- review dots in graph
- board review glyphs
- played arrows
- retrospective / review state checks

Even if those systems are not individually huge, they add to the shape churn around each move step.

## When multiple arrow layers are active

Patzer can display at once:
- best arrow
- secondary arrows
- played arrow
- board review glyphs
- KO overlay
- optional labels

That is a lot more overlay surface than "just animate the moved piece".

---

## Fix Plan

## Phase 1: Highest-value fixes

### 1. Throttle engine-driven UI updates

Implement:
- a 150-200ms throttle around visible engine UI refresh

Apply it to:
- `_redraw()`
- `syncArrowDebounced()`
- `retro.onCeval()` callbacks that do visible work

Expected result:
- largest immediate improvement during engine-on navigation

### 2. Remove full-library IDB writes from move stepping

Implement:
- lightweight debounced nav-state persistence
- full game-library save only when imports/library contents actually change

Expected result:
- less main-thread work during repeated stepping

### 3. Reduce live-analysis defaults

Implement:
- `multiPv` default from 3 to 1
- consider lower live depth or movetime-driven browsing analysis

Expected result:
- much lower engine output volume
- fewer redraw and shape-update opportunities

---

## Phase 2: Board-shape discipline

### 4. Switch to `cg.setAutoShapes(...)`

Implement:
- dedicated shape application instead of generic drawable merges

### 5. Skip no-op shape updates

Implement:
- last-shape signature cache
- only apply if visible shapes actually changed

### 6. Make fade-in conditional

Implement:
- animate only settled/first-appearance arrows
- not every live-search refresh

---

## Phase 3: Medium-value cleanup

### 7. Cache move destinations

Implement:
- FEN/path keyed dest cache in `src/board/index.ts`

### 8. Stop immediate full redraws for engine bookkeeping-only changes

Implement:
- avoid `_redraw()` when only pending state changed internally
- schedule redraw on animation frame or throttled engine tick

### 9. Consider splitting the heaviest live surfaces

Only if needed after Phase 1 and 2.

Possible candidates:
- eval graph
- underboard game list
- non-board analysis summaries

---

## Recommended Order Of Work

If the goal is "make piece motion feel better as fast as possible", the best sequence is:

1. throttle engine UI emission
2. remove/debounce nav-time full-library saves
3. lower live defaults to MultiPV 1
4. switch arrow updates to `setAutoShapes` with no-op skipping
5. make fade-ins conditional
6. cache `computeDests`

That order gives the highest confidence payoff first.

---

## Suggested Instrumentation Before And After Fixes

To turn this audit into measured proof, add temporary instrumentation around:

- `navigate()`
- `syncBoard()`
- `evalCurrentPosition()`
- `parseEngineLine()` visible refresh path
- `redraw()`
- `saveGamesToIdb()`

Track:
- redraw count per second while engine is searching
- raw engine `info` lines per second
- shape-application count per second
- average `navigate()` wall time
- long tasks over 16ms and 50ms in browser performance tools

Most useful sanity check:
- compare move stepping with engine off vs engine on
- then compare engine on with arrows disabled
- then compare engine on after throttling redraws

That will quickly separate:
- engine-output churn
from
- board overlay churn
from
- persistence churn

---

## Bottom Line

The current lag is not a mystery.

The strongest code-backed reasons are:

1. Patzer redraws from raw engine `info` lines instead of throttling ceval UI updates like Lichess.
2. Patzer writes the full imported-game library record to IndexedDB on every navigation step.
3. Patzer defaults to a heavier live-analysis workload than Lichess.
4. Patzer rebuilds and animates a rich overlay stack during active engine updates.

If those four things are fixed in that order, the board should feel materially better even before any deeper rendering refactor.
