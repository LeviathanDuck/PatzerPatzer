# Patzer Pro — Puzzle V1 Phased Execution Plan

Date: 2026-03-27
Source product plan: [docs/PUZZLE_V1_PLAN.md](/Users/leftcoast/Development/PatzerPatzer/docs/PUZZLE_V1_PLAN.md)
Status: phased execution plan

This plan converts the Puzzle V1 product doc into a safer execution sequence.

It intentionally does **not** queue the full build at once.

Rule:
- define the whole path now
- queue only the current executable phase
- promote later phases into the runnable prompt queue only after review gates pass

Exception:
- if the user explicitly asks for later-phase prompts to be prebuilt, they may be created ahead of time
- that does **not** remove the phase gates below
- later-phase prompts should still be treated as gate-bound and should not be run before the prior phase is accepted

## Current Repo Reality

Current relevant seams in the live repo:

- [src/board/index.ts](/Users/leftcoast/Development/PatzerPatzer/src/board/index.ts)
  - owns core board lifecycle and move handling
  - still contains analysis-owned retrospection solve interception
- [src/main.ts](/Users/leftcoast/Development/PatzerPatzer/src/main.ts)
  - still renders saved puzzle candidates in the analysis tools area
- [src/puzzles/extract.ts](/Users/leftcoast/Development/PatzerPatzer/src/puzzles/extract.ts)
  - still means “saved learnable moments from analysis”, not a standalone puzzle product
- [src/idb/index.ts](/Users/leftcoast/Development/PatzerPatzer/src/idb/index.ts)
  - only persists legacy saved puzzle candidates, not a full puzzle library model
- [src/tree/types.ts](/Users/leftcoast/Development/PatzerPatzer/src/tree/types.ts)
  - defines `PuzzleCandidate`, which is too small for Puzzle V1

Important implication:
- Puzzle V1 cannot safely start from page UI work.
- The first phase must establish ownership seams and the canonical puzzle model first.

## Queue Policy

Prompt policy for this build:

- only the prompts for the active phase belong in the live Claude queue
- later phases should be planned here, not queued yet
- phase promotion requires:
  - review of the prior phase
  - no unresolved architectural blocker in the prior phase gate

## Phase 0 — Ownership And Data Foundations

Goal:
- make the shared-board boundary more honest
- stop board-core work from drifting toward product-specific ownership
- define the canonical puzzle model before rebuilding puzzle UI

Exit criteria:
- board core has a consumer seam for mode-specific move reactions
- analysis-owned retrospection solve logic no longer lives directly in board core
- canonical puzzle model types exist
- persistence seams exist for puzzle definitions, metadata, and attempts
- imported and user-library puzzle sources can both adapt into the canonical model

Queued runnable prompts for this phase:

1. `CCP-143` — Add Board Consumer Move Hook
2. `CCP-144` — Move Retrospection Solve Logic Out Of Board Core
3. `CCP-145` — Add Canonical Puzzle Domain Types
4. `CCP-146` — Add Puzzle Library Persistence Owner
5. `CCP-147` — Add Puzzle Source Adapter Seams

## Phase 1 — Minimal Puzzle Product Shell

Goal:
- create the smallest real puzzle product surface without solving the full interaction model yet

Prompt candidates for later creation:

1. `CCP-150` — Add Puzzle Library Route Owner
2. `CCP-151` — Render Top-Level Puzzle Source Navigator
3. `CCP-152` — Open Minimal Puzzle Round From Canonical Puzzle Definition
4. `CCP-153` — Add Puzzle Board Layout Shell

Manager prompt:
- `CCP-154` — Puzzle V1 Phase 1 Batch Manager

Gate before promotion:
- Phase 0 types and adapters must be accepted
- board ownership seam must be stable enough that puzzle board work does not re-couple to analysis
- a board capability/ownership matrix must exist documenting what belongs to the shared board subsystem, what belongs to the analysis board only, and what belongs to the puzzle board only (required by V1 plan build step 1, may be produced as a Phase 0 review artifact)

## Phase 2 — Strict Puzzle Solve Loop

## Phase 1.5 — Restore Puzzle Header Entry

Goal:
- reintroduce the top-level `Puzzles` header entry only after the minimal puzzle product shell is real

Prompt candidate for later creation:

1. `CCP-175` — Restore Puzzles Header Entry

Gate before promotion:
- Phase 1 route owner, top-level source navigator, minimal round opening, and puzzle board layout shell must all be reviewed and accepted
- the `#/puzzles` surface must be a real usable product shell, not a placeholder or dead route
- the header change must stay scoped to navigation visibility and active-state behavior, not broader puzzle UX expansion

## Phase 2 — Strict Puzzle Solve Loop

Goal:
- make one puzzle round honestly playable using strict stored-solution validation

Prompt candidates for later creation:

1. `CCP-155` — Add Puzzle Round Controller
2. `CCP-156` — Validate Strict Solution Moves And Auto-Reply
3. `CCP-157` — Persist Puzzle Attempt Results
4. `CCP-158` — Render Puzzle Result States And Navigation

Manager prompt:
- `CCP-159` — Puzzle V1 Phase 2 Batch Manager

Gate before promotion:
- puzzle rounds can open from canonical source data
- solve state and attempt ownership are defined in code, not just docs

## Phase 3 — Engine Assist Layer

Goal:
- add Patzer-specific assist behavior on top of the strict solve loop without replacing it

Prompt candidates for later creation:

1. `CCP-160` — Add Puzzle-Mode Engine Runtime Owner
2. `CCP-161` — Add `PuzzleMoveQuality` Evaluation Layer
3. `CCP-162` — Log Assisted-Solve And Reveal Reasons
4. `CCP-163` — Render Eval-Delta Feedback For Non-Best Moves

Manager prompt:
- `CCP-164` — Puzzle V1 Phase 3 Batch Manager

Gate before promotion:
- strict solve loop must already be correct without the assist layer
- engine-assist work must remain clearly separate from correctness state

## Phase 4 — User Library Authoring

Goal:
- let users create and organize personal puzzles from Patzer review workflows

Prompt candidates for later creation:

1. `CCP-165` — Save Learn From Your Mistakes Moments Into User Library
2. `CCP-166` — Bulk-Save Missed Moments After Review
3. `CCP-167` — Add Move-List Create-Puzzle Flow
4. `CCP-168` — Add Flat Collections, Notes, Tags, And Favorites

Manager prompt:
- `CCP-169` — Puzzle V1 Phase 4 Batch Manager

Gate before promotion:
- canonical puzzle model and persistence must already exist
- solve history must be global per puzzle, not folder-local

## Phase 5 — Repetition And Imported-Library Scale

Goal:
- make the library useful over time instead of just loadable once

Prompt candidates for later creation:

1. `CCP-170` — Add Retry-Failed-Earlier Queue
2. `CCP-171` — Add Minimal Due-Again Metadata And Filters
3. `CCP-172` — Improve Imported Puzzle Library Filtering And Loading Scale
4. `CCP-173` — Add Future Hooks For Rated Puzzle Mode

Manager prompt:
- `CCP-174` — Puzzle V1 Phase 5 Batch Manager

Gate before promotion:
- attempt history must already be trusted
- imported and user-library sources must already coexist in one product shell

## Explicit Deferrals

Not part of the current queued phase:

- login or user accounts
- cloud sync
- full PGN enrichment for imported Lichess puzzles
- nested folder trees
- broad desktop import of arbitrary personal puzzle formats
- rated puzzle progression

## Why This Order

This order is intentionally conservative.

If Puzzle V1 starts with route/UI work first:
- the product will guess at a data model that is not built yet
- board ownership drift will return
- imported and user-library puzzles will be forced into one shallow object too early
- later prompts will need follow-up rewrites instead of clean reviewable steps

The current executable phase is therefore not “build the page”.
It is “make the page rebuildable on honest foundations”.
