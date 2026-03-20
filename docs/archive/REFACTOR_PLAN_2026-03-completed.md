# Patzer Pro — Refactor Plan (Completed Archive)

Date: 2026-03-20
Status: completed and archived

This file is a historical record of the completed refactor phase. It is not an active planning
document. Current architecture and active priorities now live in:

- `docs/ARCHITECTURE.md`
- `docs/NEXT_STEPS.md`
- `docs/KNOWN_ISSUES.md`

This plan replaces the older extraction order that assumed `src/main.ts` still contained most of
the application. That is no longer true. The refactor is now in a later stage: many modules are
already extracted, and the priority has shifted from “split the monolith” to “finish ownership
cleanly and close correctness gaps”.

---

## Completed extractions

These areas are already extracted from the original large `main.ts` implementation:

- `src/board/cosmetics.ts`
- `src/board/index.ts`
- `src/engine/winchances.ts`
- `src/engine/ctrl.ts`
- `src/engine/batch.ts`
- `src/analyse/moveList.ts`
- `src/analyse/evalView.ts`
- `src/analyse/pgnExport.ts`
- `src/ceval/view.ts`
- `src/header/index.ts`
- `src/games/view.ts`
- `src/import/chesscom.ts`
- `src/import/lichess.ts`
- `src/import/pgn.ts`
- `src/import/filters.ts`
- `src/import/types.ts`
- `src/puzzles/extract.ts`
- `src/keyboard.ts`

This means the old step list centered on shrinking a 3000–4000 line `main.ts` is obsolete.

---

## Current refactor goal

The new goal is:

1. keep `src/main.ts` as a thin coordinator
2. finish remaining subsystem ownership seams
3. remove correctness hazards introduced by cross-module async/state coupling
4. restore trustworthy validation

---

## Remaining refactor work

### Step A — Fix validation baseline

Create a real TypeScript project entrypoint so `npm run typecheck` validates the repo instead of
printing TypeScript help.

Why first:
- every remaining refactor step is harder to trust without it
- this is a low-risk, high-leverage cleanup

Expected scope:
- add `tsconfig.json` extending `tsconfig.base.json`, or update the script to point at the base file

### Step B — Extract game library ownership

Current problem:
- game library state still lives in `src/main.ts`
- id generation helpers live in `src/import/types.ts`
- metadata helpers live in `src/games/view.ts`

Target:
- create a dedicated game-library module, or explicitly keep only the thin coordinator in `main.ts`

Notes:
- `loadGame()` is a cross-system coordinator and may be safest in `main.ts`
- do not force a circular dependency between games and engine modules

### Step C — Move analysis restore responsibilities out of `main.ts`

Current problem:
- persisted analysis restore still lives in `src/main.ts`
- it reads IDB state, updates engine cache state, updates UI state, and redraws

Target:
- move restore logic nearer the engine/review subsystem, while keeping cross-system orchestration
  explicit and non-circular

### Step D — Tighten engine lifecycle correctness

Current problem:
- `awaitingStopBestmove` is still a boolean
- in-flight engine results are not explicitly scoped to a current game id
- async restore has no cancellation token

Target:
- replace boolean stop bookkeeping with a counter or token
- scope review results to the active game
- add cancellation for restore-on-switch flow

This step is refactor plus correctness, but the structural cleanup is what makes the bug fixes safe.

### Step E — Persist engine settings

Current problem:
- `reviewDepth`, `analysisDepth`, and `multiPv` reset on reload
- persisted analysis can be rejected unexpectedly because local settings revert

Target:
- move these settings into explicit persisted ownership

### Step F — Clean up route ownership

Current problem:
- `analysis-game` route is placeholder-only
- `puzzles`, `openings`, and `stats` are still placeholders

Target:
- make `analysis-game` functional first
- keep puzzle work as a separate small task from any future route scaffolding

---

## Explicit non-goals right now

Do not treat these as refactor prerequisites for the next sprint unless priorities change:

- full engine Web Worker migration
- broad redesign of `AnalyseCtrl`
- openings tool
- stats dashboard
- full puzzle play system

Those may matter later, but they are not the smallest safe next steps for the current repo.

---

## Refactor sequencing guidance

Preferred order:

1. validation baseline
2. game library ownership
3. analysis restore cleanup
4. engine correctness cleanup
5. engine settings persistence
6. route-specific follow-up work

This order keeps the project moving toward clearer boundaries without pretending the remaining work
is still “split a giant main.ts”.
