# Patzer Pro — Next Steps

Date: 2026-03-27
Status: Puzzle V1 implementation audit and stabilization roadmap

Patzer Pro is no longer in the "build Puzzle V1 from zero" phase.

The repo now has a real standalone puzzle product surface:

- live `#/puzzles` and `#/puzzles/:id` routes
- `Puzzles` restored in the main header navigation
- top-level `Imported Puzzles` and `User Library` library surfaces
- a dedicated puzzle round controller and round view
- strict solve-result ownership plus attempt persistence
- retry/due-again flows and imported-puzzle shard loading
- review-side puzzle authoring and legacy candidate extraction still present in analysis

That means the next work is no longer "foundations first". The next work is:

- close the gap between the implemented product and the intended Puzzle V1 experience
- stabilize correctness and persistence
- tighten the review-to-puzzle bridge
- fix stale docs and misleading planning artifacts

For any roadmap item involving:
- Learn From Your Mistakes
- retrospection
- puzzle extraction
- puzzle-candidate heuristics
- review-to-puzzle logic

the mandatory reference base is:
- `/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection/README.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection-ux/README.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/README.md`

Rule:
- follow the visible Lichess logic pipeline first
- call out Patzer-specific divergences explicitly
- do not quietly replace Lichess-backed rules with homegrown heuristics

---

## Primary Track — Audit And Stabilize Puzzle V1

### 1. Run a repo-grounded Puzzle V1 implementation audit

Current reality:
- the product now exists in code, but the current docs still describe an earlier build stage
- finishing the build phases did not guarantee that the product feels complete or correct

What this audit should separate:
- implemented and acceptable
- implemented but behaviorally wrong
- implemented but structurally risky
- missing from the intended V1 experience
- explicitly deferred

Why now:
- more build prompts without an audit will create drift instead of finishing work

### 2. Close the biggest UX and behavior gaps between the live puzzle product and `docs/PUZZLE_V1_PLAN.md`

Priority questions:
- does the library feel honest and usable for both `Imported Puzzles` and `User Library`?
- does the round flow feel coherent enough to use repeatedly?
- are the assist-layer behaviors matching the intended Patzer divergences?
- is the current product surfacing the right information at the right time?

Why now:
- the project has moved past "can this exist?" and into "is this actually the right product?"

### 3. Stabilize strict solve correctness, attempt logging, and result-state trustworthiness

Current reality:
- the product has round control, attempts, result states, and move-quality logic
- these now need to be treated as trusted product state, not just implementation milestones

Priority areas:
- strict stored-solution correctness
- failure-reason logging
- clean/recovered/assisted/skipped result integrity
- retry/due-again metadata behavior

Why now:
- repetition features and future rated mode depend on this state being correct

### 4. Tighten review-to-puzzle integration

Current reality:
- analysis still owns legacy candidate extraction and save flows
- standalone puzzle product now exists separately

Next integration goals:
- make the analysis-to-user-library path feel like one product, not two disconnected systems
- verify right-click move authoring, Learn From Your Mistakes saves, and bulk-save flows against the live puzzle library behavior
- reduce overlap and confusion between legacy candidate storage and Puzzle V1 storage

Why now:
- this is one of the main Patzer-specific product promises

### 5. Decide what remains legacy and what becomes the canonical path

Current reality:
- the repo still has both:
  - legacy analysis-side puzzle candidate persistence in `src/idb/index.ts`
  - Puzzle V1 persistence in `src/puzzles/puzzleDb.ts`

Need to decide:
- what stays as analysis-only support
- what should migrate into the Puzzle V1 library path
- what should eventually be removed

Why now:
- leaving both models alive without a cleanup plan will create long-term confusion

---

## Secondary Track — Keep Core App Reliability Honest

### 6. Fix the remaining TypeScript errors surfaced by `npm run typecheck`

Current state:
- the build passes
- typecheck is real, but the project still has unresolved errors

Why now:
- puzzle work is now large enough that typecheck regressions matter more than before

### 7. Keep the clear-local-data path trustworthy

Current state:
- the app now owns more browser-local state than before:
  - games
  - analysis
  - legacy saved puzzle candidates
  - Puzzle V1 data

Why now:
- reset/recovery matters more as local state becomes richer and more confusing

### 8. Continue fixing analysis-board correctness issues that directly affect puzzle generation

Still important:
- engine update reliability on navigation and variation changes
- saved-analysis restore correctness
- active-game scoping
- review-to-retrospection trustworthiness

Why now:
- puzzle quality still depends on review quality

---

## Product Direction Rules

### 9. Do not treat the phased execution doc as the active roadmap anymore

`docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md` is now a record of the initial
implementation sequence, not the current day-to-day plan.

### 10. Do not start rated-mode or auth work yet

Still deferred:
- login / user accounts
- cloud sync
- rated puzzle progression
- full imported-puzzle PGN enrichment

These remain future layers, not current stabilization priorities.

### 11. Keep board ownership cleanup active

Current reality:
- the standalone puzzle product exists, but board ownership is still not a finished abstraction

Rule:
- shared board subsystem changes must remain clearly separate from puzzle-only and analysis-only behavior

---

## Immediate Recommended Next Step

The best next planning artifact is not another build sprint.

It is:
- a Puzzle V1 implementation audit
- followed by a short punch-list sprint of concrete fixes and polish tasks

That is the shortest path from "all phases are built" to "the product actually feels right."
