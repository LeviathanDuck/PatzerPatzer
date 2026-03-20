# Patzer Pro — Current Sprint Planning Baseline

Date: 2026-03-20

This replaces the older phase-by-phase bootstrap plan, which no longer reflects the state of the
repo. Patzer Pro already builds, serves, imports games, runs local engine analysis, stores browser
data, and has a partially extracted architecture.

The current sprint baseline is therefore about stabilization and finishing small missing pieces.

---

## Sprint goals

1. keep the current analysis workflow correct and stable
2. reduce remaining architectural ambiguity around game loading and analysis restore
3. improve validation confidence
4. only then ship the smallest user-facing follow-up work

---

## Recommended sprint items

### 1. Fix the TypeScript validation path

Deliverable:
- `npm run typecheck` actually checks the project

Why first:
- every other sprint item benefits from real validation

### 2. Fix wheel navigation over the board

Deliverable:
- scrolling over the board steps through moves again

Why now:
- currently broken
- isolated, low-risk fix

### 3. Clean up game library ownership

Deliverable:
- game library state is no longer loosely split between `main.ts`, import helpers, and games view helpers

Why now:
- this is the main remaining structural ambiguity after the extraction pass

### 4. Make analysis restore safe on rapid game switch

Deliverable:
- restore path has cancellation or active-context guarding

Why now:
- this is a correctness issue in the core analysis workflow

### 5. Fix stale-stop engine bookkeeping

Deliverable:
- stale `bestmove` handling no longer depends on a single boolean

Why now:
- closes a real engine/review edge-case bug

### 6. Persist engine settings

Deliverable:
- review depth, analysis depth, and MultiPV survive reload

Why now:
- improves trust in persisted analysis

### 7. Implement the `analysis-game` route

Deliverable:
- route loads an actual stored game instead of rendering placeholder text

Why now:
- small, useful, and builds on existing core systems

### 8. Replace the puzzles placeholder with a saved-puzzles list

Deliverable:
- users can at least browse saved puzzle records

Why now:
- smallest safe user-facing puzzle step

---

## Out of scope for this sprint

- full puzzle play mode
- openings trainer
- stats dashboard
- engine worker migration
- broad redesign or polish work

Those are larger, lower-order items while refactor/stabilization work is still active.
