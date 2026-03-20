# Patzer Pro — Next Steps

Date: 2026-03-20
Status: analysis-board-first roadmap

This list is intentionally small and ordered for safety. It reflects the current repo, where the
next phase should focus on making game analysis and review trustworthy enough to support later
puzzle tooling. Full puzzle work should follow, not lead, the stabilization of the analysis board.

---

## Priority 0 — Restore trustworthy validation

### 1. ✓ Make `npm run typecheck` real — DONE

`tsconfig.json` added. `npm run typecheck` now checks the project and surfaces 53 real type
errors. Errors are deferred and tracked in `docs/KNOWN_ISSUES.md`.

### 2. Fix the 53 type errors surfaced by `npm run typecheck`

Current state:
- `npm run typecheck` exits non-zero with 53 errors
- errors are mostly `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` violations
- the build still passes because esbuild does not type-check

Why now:
- a non-zero typecheck gate provides no regression protection
- fixing the errors makes the gate meaningful for all subsequent work

---

## Priority 1 — Make the analysis board and review loop reliable

### 2. Fix engine update reliability on navigation and variation changes

Current state:
- live engine analysis is not yet fully trustworthy across:
  - move navigation
  - variation creation
  - branch switching
  - other move-state changes

User impact:
- the board can show stale or missing engine lines when the user is actively reviewing a game
- this weakens the review experience and blocks downstream puzzle logic

### 3. Fix saved-analysis restore and active-game scoping

Current state:
- review results and persisted restore flow still need stronger active-game protection
- restore is still async and coordinated from `src/main.ts`

User impact:
- analysis can become untrustworthy when switching games quickly
- puzzle tooling later will depend on this data being correct

### 4. Fix engine stop bookkeeping

Current state:
- `awaitingStopBestmove` in `src/engine/ctrl.ts` is still a single boolean

User impact:
- rapid stop/start sequences can still mis-handle stale `bestmove` output

---

## Priority 2 — Finish the remaining analysis/review ownership seams

### 5. Formalize game and analysis ownership

Current state:
- game library state is still owned by `src/main.ts`
- `loadGame()` and analysis restore coordination are still major cross-system seams

Why now:
- this is one of the last structural gaps that can still create confusing bugs in review flow

### 6. Persist engine settings and review context cleanly

Current state:
- `reviewDepth`, `analysisDepth`, and `multiPv` still reset on reload

Why now:
- saved analysis should be stable, understandable, and reusable across sessions

---

## Priority 3 — Build the next layer of review functionality

### 7. Implement a local per-game “Learn From Mistakes” style review flow

Current state:
- the app can review a game and extract puzzle candidates
- it does not yet have a focused local game-review flow that turns analysis into guided mistake study

Why now:
- this is the right bridge between game review and later puzzle tooling
- it keeps the project centered on strengthening the analysis board before expanding puzzle scope

---

## Priority 4 — Tighten board-review behavior details

### 8. Improve graph, arrows, and move-list review behavior

Current state:
- several analysis-board behaviors still need tightening for review quality:
  - graph scrub / hover behavior
  - move-list eval numbers
  - played-move arrow behavior in side lines
  - clear variations / reset flows

Why now:
- these are high-value improvements once engine correctness is reliable
- they improve the actual quality of game review without jumping ahead to full puzzle mode

### 9. Make small UI improvements that support review clarity

Scope examples:
- game list readability
- settings/menu cleanup
- clearer review-state messaging
- better reset / clear-cache placement

---

## Deferred until the core analysis path is safer and more complete

These should not be casual near-term sprint items:

- full puzzle play mode
- broad saved-puzzles product work beyond minimal support
- openings trainer
- stats dashboard
- engine worker migration
- broad UI polish initiatives

They are all lower-order than trustworthy analysis, stable saved review data, and clear subsystem
ownership.
