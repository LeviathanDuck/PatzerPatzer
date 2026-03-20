# Patzer Pro — Project Audit Follow-up

Date: 2026-03-20
Scope: current source tree, current docs, `npm run build`, `npm run typecheck`, Lichess-oriented behavior comparison

---

## Executive summary

Patzer Pro has a real and worthwhile product direction:

- import a user's own games
- analyze them locally with Stockfish
- review mistakes in a Lichess-style environment
- extract puzzle candidates for later study

That direction still holds up.

The strongest parts of the current project are no longer hypothetical:

- the analysis board is real
- the move tree is real
- live engine analysis is real
- batch review is real
- local persistence is real

The project is no longer blocked by a giant-monolith problem. A substantial extraction has already happened.

The current risk is different:

- engine/review correctness is not fully trustworthy yet
- active-game restore and analysis scoping are still fragile
- validation is still not clean
- route/product completeness still lags behind the core analysis ambition

This means the project should still be treated as a stabilization and refactor-first effort, not as a feature-expansion phase.

---

## Product goals vs current reality

The current product goal in `PRD.md` is still sound:

- help users import games
- analyze them
- review mistakes
- turn mistakes into targeted practice

That is also the right product sequence.

What is working today:

- Chess.com import
- Lichess import
- PGN paste import
- PGN to tree conversion
- board move navigation
- side variation creation
- live engine evaluation
- batch review
- eval graph
- move classifications
- PGN export
- puzzle candidate extraction
- browser-local persistence

What is still incomplete at product level:

- `analysis-game` route is placeholder-only
- `puzzles` route is placeholder-only
- no real puzzle-play workflow
- `openings` and `stats` routes are placeholders

So the core product loop exists, but the full product surface does not.

---

## Lichess comparison

Patzer Pro is most aligned with Lichess in these areas:

- path-based move-tree model
- Chessground board ownership pattern
- Snabbdom render flow
- move-list / variation rendering approach
- ceval / PV presentation model
- win-chance-based review logic
- ACPL-style graph direction

Patzer Pro is less aligned with Lichess in these areas:

- controller composition and state ownership
- safe coordination of async engine output with navigation state
- persisted analysis restore flow
- route completeness for analysis workflows

The main difference is not that Patzer Pro chose the wrong chess UI ideas. The main difference is that Lichess has stronger controller boundaries and better protection against stale analysis state landing in the wrong place.

---

## Current strengths

### 1. The project has real subsystem progress

The app is no longer centered around one giant frontend file.

Real extracted subsystems now exist for:

- board rendering and input
- board cosmetics and settings
- engine lifecycle and live eval
- batch review
- move list rendering
- eval graph and summary rendering
- ceval / PV display
- imports
- IndexedDB persistence

This is meaningful progress and should not be understated.

### 2. The board stack is technically credible

The board implementation uses:

- `@lichess-org/chessground`
- `chessops`
- normalized move handling
- promotion flow
- variation insertion into the move tree

That is the correct technical foundation for a Lichess-style local analysis board.

### 3. The review model is pointed in the right direction

The project is correctly centered on:

- live analysis
- batch review
- accuracy summary
- move quality labels
- extracting tactical follow-up material

That is a coherent product story.

---

## Current weaknesses

### 1. Engine correctness is still the largest product risk

The engine subsystem still relies on shared mutable module state in `src/engine/ctrl.ts`.

Important coordination still depends on:

- `engineSearchActive`
- `awaitingStopBestmove`
- `pendingEval`
- shared `currentEval`
- shared `evalCache`

This is enough to work in normal cases, but it is still weaker than Lichess-style control flow when the user:

- navigates rapidly
- creates variations while the engine is running
- switches games quickly
- toggles review / engine / threat mode in quick succession

This is the most important trust problem in the product.

### 2. Restore and active-game scoping are still too weak

Persisted analysis restore still runs from `src/main.ts`.

That means top-level app orchestration still owns:

- selected game
- load flow
- tree replacement
- eval reset
- persisted analysis restore
- startup restore

This remains a correctness risk because the restore path does not have a strong cancellation or active-game token model.

### 3. `main.ts` is healthier, but not yet only bootstrap

`src/main.ts` is much smaller than an earlier monolith, but it still owns too much product state and too many cross-subsystem seams.

It is currently still responsible for:

- imported game library state
- selected game state
- `loadGame()`
- restore orchestration
- route placeholder rendering
- startup restore
- wheel navigation

This is still the main structural seam left in the app.

### 4. Product surface completeness still trails the analysis ambition

The project already has a serious analysis board, but several user-facing routes are still placeholders.

That creates a mismatch between:

- what the app suggests it can do
- what the user can actually complete end-to-end

---

## Confirmed current issues

The following issues were confirmed directly from the current repo during this audit.

### Validation

- `npm run build` passes
- `npm run typecheck` fails
- current TypeScript error count: 53

This means build output is still not a trustworthy correctness signal on its own.

### Concrete behavior and runtime issues

- wheel navigation still targets `.analyse__board-wrap`, but the actual board container is `div.analyse__board.main-board`
- `resetAllData()` in `src/main.ts` calls `openGameDb()` without importing it, so the clear-local-data flow is not currently safe
- played-move arrow logic still assumes `ctrl.node.children[0]`, so side-variation semantics remain wrong
- engine stop handling still relies on a single `awaitingStopBestmove` boolean
- restore still lacks strong active-game scoping and cancellation
- `analysis-game` route is still placeholder-only
- `puzzles` route is still placeholder-only

### Validation debt by area

Current `typecheck` failures are spread across:

- analysis rendering
- move-list rendering
- board rendering and Chessground typing
- engine typing
- imports
- keyboard navigation
- router parsing
- `main.ts`

This is not one isolated typing issue. It is still a repo-wide validation cleanup task.

---

## Architectural assessment

Patzer Pro is now in the awkward middle stage that many good refactors go through:

- the old monolith has been broken up enough to show the intended architecture
- but ownership is not yet strong enough to make the whole system robust under stress

That means the next work should not be broad redesign.

The right next move is to tighten the seams that still control correctness:

- engine event coordination
- restore scoping
- game/analysis ownership
- validation

---

## What not to do next

The project should not casually jump into:

- full puzzle-play feature work
- broader openings feature work
- stats dashboard work
- broad UI polish initiatives
- large-scale aesthetic rewrites

Those are downstream of trustworthy analysis.

---

## Recommended high-level plan

### Priority 0 — Restore trustworthy validation

- make `npm run typecheck` clean
- keep the typecheck gate honest
- fix stale README wording about typecheck status

### Priority 1 — Make the analysis loop trustworthy

- fix engine stop/start bookkeeping
- fix stale engine output on navigation / variation changes
- fix restore scoping for rapid game switches
- fix played-arrow behavior in side variations
- fix wheel navigation selector bug
- fix clear-local-data reset path

### Priority 2 — Finish ownership seams

- extract game-library ownership away from `main.ts`
- extract load/restore orchestration into the correct subsystem boundary
- make saved analysis context more explicitly scoped to the active game

### Priority 3 — Finish the honest minimum route surface

- implement a real `analysis-game` route
- implement a minimal real `puzzles` route or stop advertising it as a route-level feature

### Priority 4 — Build the next product layer

- local “learn from mistakes” style guided review
- only after the underlying analysis flow is trustworthy

---

## Final conclusion

Patzer Pro is credible.

It already has enough real chess-analysis functionality that continued investment makes sense.

But the project is not yet at the stage where more product breadth is the right move.

The next successful phase is not “more features.”

It is:

1. make validation trustworthy
2. make analysis trustworthy
3. finish ownership seams
4. then build the next review workflow on top of that safer base
