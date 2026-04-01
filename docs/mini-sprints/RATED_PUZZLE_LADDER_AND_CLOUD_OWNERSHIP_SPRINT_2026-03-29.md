# Rated Puzzle Ladder And Cloud Ownership Sprint

Date: 2026-03-29
Status: mostly done, cloud sync incomplete (audited 2026-03-30)

### Phase Status (as of 2026-03-30)

| Phase | Status | Notes |
|---|---|---|
| Phase 1 — Research & implementation map | **Done** | |
| Phase 2 — Local rating domain foundations | **Done** | `UserPuzzlePerf` with Glicko-2 |
| Phase 3 — Local persistence and restore | **Done** | `puzzleDb.ts` user-perf and rating-history stores |
| Phase 4 — Rated session policy | **Done** | Session mode, difficulty selector |
| Phase 5 — Rated eligibility and selection | **Done** | Cooldown logic, shard fallback |
| Phase 6 — Rated completion and rating updates | **Done** | Glicko-2 calculator |
| Phase 7 — Rated ladder UI and feedback surfaces | **Done** | Rating delta display, difficulty chart |
| Phase 8 — Cloud ownership and sync | **Wired (CCP-463)** | Functions existed as dead code; now called on auth + stream stop. DB name mismatch fixed (CCP-466) |

This sprint defines the tracked prompt family for bringing a Lichess-like rated puzzle ladder to the current Patzer Pro build, while preserving the product decisions already made in chat.

## Locked Product Decisions

- Goal: implement a Lichess-like rated puzzle ladder for the current Patzer build.
- Core ladder scope for the first pass:
  - user puzzle rating
  - rated/casual handling
  - rating-aware selection
  - difficulty offsets
  - immediate round rating diff
- Intentional divergence from Lichess:
  - imported Lichess puzzle ratings stay fixed
  - only the user puzzle rating changes
- Rated mode applies only to `imported-lichess` puzzles.
- `user-library` puzzles remain practice/casual only.
- Rated mode should not disable Patzer tools or exploration globally.
- If the user attempts assistance in rated mode, show a warning with three choices:
  - cancel and do not use the tool
  - switch to casual and continue
  - stay rated and, if tool use proceeds, record an immediate rated failure
- The warning includes a remember-choice toggle scoped to the current puzzle-solving session only.
- Previously correctly solved puzzles may still appear, but they must always score as unrated/casual.
- Failed puzzles are excluded from rated selection until 1 week has passed.
- Cloud/account prompts are part of this family.
- Cloud/product boundaries should stay backend-agnostic even though the current repo already has a Lichess OAuth and server persistence seam.

## Section Managers And Child Prompts

### Full program manager
- `CCP-258`

### Phase 1 — Research, parity re-check, and implementation map
- manager: `CCP-259`
- children:
  - `CCP-260` Recheck Lichess puzzle rating audit against upstream source
  - `CCP-261` Audit current Patzer puzzle runtime and ownership seams
  - `CCP-262` Audit current Patzer auth sync and server ownership seams
  - `CCP-263` Write rated ladder implementation map and file ownership plan
  - `CCP-264` Review rated ladder research and ownership grounding

### Phase 2 — Local rating domain foundations
- manager: `CCP-265`
- children:
  - `CCP-266` Add canonical user puzzle perf types
  - `CCP-267` Add rating history and round delta domain types
  - `CCP-268` Add rated eligibility and outcome domain types
  - `CCP-269` Add difficulty offset domain types and constants
  - `CCP-270` Review local rated ladder domain types

### Phase 3 — Local persistence and restore
- manager: `CCP-271`
- children:
  - `CCP-272` Persist user puzzle perf in puzzle DB
  - `CCP-273` Persist rating history in puzzle DB
  - `CCP-274` Persist rated attempt snapshots and outcome metadata
  - `CCP-275` Wire local perf and history restore seams
  - `CCP-276` Review local rated ladder persistence

### Phase 4 — Rated session policy and assistance handling
- manager: `CCP-277`
- children:
  - `CCP-278` Add rated/practice session owner
  - `CCP-279` Add assistance warning state and session memory
  - `CCP-280` Wire cancel and switch-to-casual assistance branches
  - `CCP-281` Wire stay-rated immediate-fail assistance branch
  - `CCP-282` Review rated session policy and assistance flow

### Phase 5 — Rated eligibility and selection
- manager: `CCP-283`
- children:
  - `CCP-284` Add imported-only rated source gating
  - `CCP-285` Add previously solved casual-only rated rule
  - `CCP-286` Add recent failed one-week rated exclusion rule
  - `CCP-287` Add rating-aware selection with difficulty offsets
  - `CCP-288` Review rated eligibility and selection

### Phase 6 — Rated completion and rating updates
- manager: `CCP-289`
- children:
  - `CCP-290` Add user-only rating calculator service
  - `CCP-291` Wire rated success completion path
  - `CCP-292` Wire rated failure completion path
  - `CCP-293` Write rating snapshots and history on rated completion
  - `CCP-294` Review rated completion and rating updates

### Phase 7 — Rated ladder UI and feedback surfaces
- manager: `CCP-295`
- children:
  - `CCP-296` Add rated/practice and difficulty UI surfaces
  - `CCP-297` Add rated assistance warning modal and remember-choice UI
  - `CCP-298` Add casual-only messaging for repeated solved puzzles
  - `CCP-299` Add current user rating and round rating diff UI
  - `CCP-300` Review rated ladder UI surfaces

### Phase 8 — Cloud ownership, auth seam, and sync
- manager: `CCP-301`
- children:
  - `CCP-302` Add user-scoped server schema for rated puzzle perf and history
  - `CCP-303` Extend Lichess-auth identity seam for rated puzzle ownership
  - `CCP-304` Add server sync contracts for rated puzzle perf and history
  - `CCP-305` Add client push/pull/merge for rated puzzle data
  - `CCP-306` Review rated ladder cloud ownership and sync

## Why This Is Split So Aggressively

This work touches:
- puzzle domain types
- local persistence
- session policy
- repeat eligibility rules
- selection semantics
- rating updates
- UI feedback
- auth and cloud ownership

So the prompt family is intentionally broken into many smaller tracked prompts instead of a few large batches. That is the safer path for a correctness-sensitive feature that wants strong Lichess alignment without casual shortcutting.
