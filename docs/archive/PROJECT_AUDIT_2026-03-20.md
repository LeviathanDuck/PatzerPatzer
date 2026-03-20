# Patzer Pro — Project Audit

Date: 2026-03-20
Scope: current source tree, package scripts, current docs reconciliation

---

## Executive summary

Patzer Pro is in a healthier place than the older audit described. The project is no longer
centered around a 4000-line `main.ts`; a meaningful extraction pass has already happened.

The main project risks have changed:

- less risk from monolithic file growth
- more risk from stale docs and incomplete validation
- ongoing correctness risk in engine stop/restore behavior
- remaining subsystem ambiguity around game-library ownership

The app already has a working local analysis loop:

- import games from Chess.com, Lichess, or PGN
- load a game into the analysis board
- run live engine analysis
- run batch review
- persist games, analysis, and saved puzzles to IndexedDB

But it is still not accurate to describe the project as architecturally finished.

---

## What is already working

### Core analysis loop

The following real capabilities exist today:

- PGN to move-tree conversion
- move navigation
- board synchronization through Chessground
- live engine evaluation
- batch game review
- eval graph and move labels
- PGN export
- saved puzzle candidate extraction

### Current extracted subsystems

The repo now has active extracted modules for:

- board cosmetics
- board/ground behavior
- engine lifecycle/live eval
- batch review
- win-chance logic
- move list rendering
- eval graph / summary rendering
- ceval / PV display
- header / import panel
- keyboard shortcuts
- game-table rendering
- import adapters
- puzzle candidate extraction

This is substantial progress relative to the older audit baseline.

---

## What is still incomplete

### Remaining architecture gaps

- `src/main.ts` still owns top-level game library state and `loadGame()` orchestration
- persisted analysis restore still lives in `src/main.ts`
- there is no dedicated game-library module yet
- the engine worker module is still a stub

### Remaining product placeholders

- `analysis-game` route
- `puzzles` route
- `openings` route
- `stats` route

### Validation gap

The repo builds, but the typecheck script is currently ineffective because it is not wired to a
real project config.

---

## Current highest risks

### 1. Tooling confidence is overstated

The build passes, but the typecheck script does not validate the codebase. This increases risk for
every refactor task.

### 2. Engine stop/restore correctness is still fragile

The stop-state bookkeeping and async restore flow still have edge-case correctness risk during
rapid user interactions.

### 3. Docs have lagged behind the code

Several planning docs still describe a much earlier refactor phase. This is dangerous because it
can cause the next sprint to optimize for the wrong problem.

### 4. Puzzle work is still only partial

Puzzle extraction exists, but the route-level product is still placeholder-only.

---

## Audit conclusion

The project is no longer blocked on a giant-file extraction strategy. The correct next phase is:

1. update docs to current reality
2. restore trustworthy validation
3. finish remaining game/analysis ownership seams
4. fix engine correctness edge cases
5. only then schedule the next small product-facing steps

That is the current best path for keeping Patzer Pro aligned with its stated refactor-first goals.
