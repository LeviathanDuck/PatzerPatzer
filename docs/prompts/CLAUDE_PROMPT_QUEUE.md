# Claude Prompt Queue

> Generated from `docs/prompts/prompt-registry.json` and `docs/prompts/items/`. Do not hand-edit this file.

Use this file to store Claude Code prompts that are available for future use and have not yet been reviewed.

## Queue Index

- [ ] CCP-153-F1: Center Puzzle Board And Add Left Library Pane
  - refine the puzzle page so the board is immediately present and centered, with source and library navigation in a left pane.

- [ ] CCP-166-F1: Preserve Retro Bulk-Save First-Attempt Outcome
  - preserve first-attempt outcome information when retrospection bulk-save writes failed, viewed, or skipped moments into the puzzle library.

- [ ] CCP-168-F1: Fix Puzzle Metadata Editor exactOptionalPropertyTypes Gap
  - fix the puzzle metadata editor so notes and tags editing is type-safe under exactOptionalPropertyTypes.

- [x] CCP-174: Puzzle V1 Phase 5 Batch Manager
  - execute Puzzle V1 phase batch manager for `CCP-170`, `CCP-171`, `CCP-172`, `CCP-173`.

- [x] CCP-173: Add Future Hooks For Rated Puzzle Mode
  - add non-user-facing rated-mode hooks without implementing rating progression yet.

- [x] CCP-172: Improve Imported Puzzle Library Filtering And Loading Scale
  - improve imported-library loading and filter behavior once the product shell is stable.

- [x] CCP-171: Add Minimal Due-Again Metadata And Filters
  - add lightweight due-again metadata and filtering without a full scheduler.

- [x] CCP-170: Add Retry-Failed-Earlier Queue
  - add the first repetition-oriented queue using failed/assisted puzzle outcomes.

## Queue

## CCP-153-F1 - Center Puzzle Board And Add Left Library Pane

```
Prompt ID: CCP-153-F1
Task ID: CCP-153
Parent Prompt ID: CCP-153
Source Document: docs/PUZZLE_V1_PLAN.md
Source Step: Puzzle Board Layout
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup state step:
- As the first task before startup coordination or implementation work, run:
  - `npm run prompt:start -- CCP-153-F1`
- Only continue implementation work after that command succeeds.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle-view / layout / board-shell / prompt-tracking files.
- If overlapping work exists, stop and report it before editing.

Task: refine the Puzzle V1 page shell so the chessboard is the immediate centered focal point when the user opens the puzzles page, and the library/source navigation lives as a left-side window/pane beside it.

Source-backed intent to preserve:
- `docs/PUZZLE_V1_PLAN.md` already says the desired V1 layout includes:
  - centered chessboard
  - left sidebar for source and library selection
- the board should therefore be present immediately on the puzzles page, not hidden behind a library-first shell that delays board presence

Inspect first:
- Patzer:
  - `src/puzzles/view.ts`
  - `src/puzzles/index.ts`
  - any current shared board mounting used by the puzzle route
  - any puzzle-specific styles currently controlling page layout
- Patzer references:
  - `docs/PUZZLE_V1_PLAN.md`
  - `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
  - `docs/reference/lichess-puzzle-ux/README.md`
  - `docs/reference/lichess-puzzle-ux/STANDARD_PUZZLE_FLOW.md`
  - `docs/reference/lichess-puzzle-ux/BOARD_AND_INTERACTION_MODEL.md`
- Relevant Lichess source:
  - `~/Development/lichess-source/lila/ui/puzzle/src/view/main.ts`
  - `~/Development/lichess-source/lila/ui/puzzle/src/view/chessground.ts`
  - any closely related Lichess puzzle layout/CSS files you need to confirm board-vs-side-column structure

Current problem to confirm:
- the existing Patzer puzzle page shell does not yet reflect the intended product layout strongly enough
- the page should open with the board already present as the visual center
- source/library navigation should read as a left window/pane, not as the primary page replacing the board

Implementation goal:
- keep this as a layout-shell refinement, not a full puzzle-product redesign
- the board should be mounted and visible immediately on the puzzles page
- the board should be visually centered as the main content area
- source/library navigation should sit in a left-side pane/window
- preserve the current shared-board ownership direction and avoid analysis-page copy/paste drift

Constraints:
- scope this to puzzle-page layout and initial board presence only
- do not bundle strict solve-loop work
- do not redesign puzzle persistence, filtering, or attempt history
- do not add new medium-sized puzzle logic to `src/main.ts`
- do not let the left library pane become a full separate app shell rewrite
- if a minimal route/view split is needed to keep the board present immediately, keep it small and explicit

Before coding, provide:
- prompt id
- task id
- parent prompt id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run the most relevant task-specific check you can for puzzle-page layout behavior
- explicitly report:
  - whether the board is now present immediately on the puzzles page
  - how the centered-board layout is achieved
  - how the left library/source pane is structured
  - what current puzzle/library behavior remains intentionally deferred
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results.

Output shape:
- prompt id
- task id
- parent prompt id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks
```

## CCP-166-F1 - Preserve Retro Bulk-Save First-Attempt Outcome

```
Prompt ID: CCP-166-F1
Task ID: CCP-166
Parent Prompt ID: CCP-166
Source Document: docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md
Source Step: Phase 4 — User Library Authoring / Task 2 / follow-up fix
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Queue execution marker step:
- As the first task before startup coordination or implementation work, run:
  - `npm run prompt:start -- CCP-166-F1`
- Only continue implementation work after that command succeeds.
- Leave this prompt queued after marking it started, even if execution later fails, stops midway, or hits a blocker.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same retrospection-session, puzzle-library, or puzzle-attempt persistence files.
- If overlapping work exists, stop and report it before editing.

Task: fix the Phase 4 bulk-save path so it preserves first-attempt outcome information when failed, viewed, or skipped Learn From Your Mistakes moments are saved into the canonical puzzle library.

Grounding:
- Current gap from review: `src/analyse/retroView.ts` bulk-save writes only puzzle definitions via `retroCandidateToDefinition(...)` and `savePuzzleDefinition(...)`
- Current retro outcome source: `src/analyse/retroCtrl.ts`
- Current canonical puzzle persistence: `src/puzzles/puzzleDb.ts`
- Current puzzle attempt model: `src/puzzles/types.ts`

Inspect first:
- Patzer:
  - `src/analyse/retroView.ts`
  - `src/analyse/retroCtrl.ts`
  - `src/puzzles/puzzleDb.ts`
  - `src/puzzles/types.ts`
  - `src/puzzles/adapters.ts`
- Patzer references:
  - `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
  - current review finding for `CCP-166`
- Lichess references:
  - inspect only if a retrospection-to-puzzle outcome mapping question genuinely needs confirmation

Constraints:
- keep this scoped to preserving first-attempt outcome information during bulk-save
- do not redesign the broader puzzle repetition system
- do not invent a large new retrospection export model
- use the canonical puzzle attempt / metadata owners that already exist
- preserve current bulk-save UX unless a tiny honest label tweak is required

Before coding, provide:
- prompt id
- task id
- parent prompt id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run `npm run typecheck -- --pretty false`
- run the most relevant task-specific check you can for retro bulk-save attempt persistence
- explicitly report:
  - how first-attempt outcome information is now preserved
  - what puzzle-library records are written during bulk-save
  - whether any solve-result mapping was inferred rather than directly proven
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results.

Output shape:
- prompt id
- task id
- parent prompt id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks
```

## CCP-168-F1 - Fix Puzzle Metadata Editor exactOptionalPropertyTypes Gap

```
Prompt ID: CCP-168-F1
Task ID: CCP-168
Parent Prompt ID: CCP-168
Source Document: docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md
Source Step: Phase 4 — User Library Authoring / Task 4 / follow-up fix
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Queue execution marker step:
- As the first task before startup coordination or implementation work, run:
  - `npm run prompt:start -- CCP-168-F1`
- Only continue implementation work after that command succeeds.
- Leave this prompt queued after marking it started, even if execution later fails, stops midway, or hits a blocker.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle metadata, puzzle view, or puzzle types files.
- If overlapping work exists, stop and report it before editing.

Task: fix the Phase 4 puzzle metadata editor so the notes and tags editing surface is compatible with `exactOptionalPropertyTypes` without redesigning the metadata UI.

Grounding:
- Current gap from review: `src/puzzles/view.ts` still assigns explicit `undefined` into optional `PuzzleUserMeta.notes` and `PuzzleUserMeta.tags`
- Canonical metadata model lives in `src/puzzles/types.ts`
- Persistence owner lives in `src/puzzles/puzzleDb.ts`

Inspect first:
- Patzer:
  - `src/puzzles/view.ts`
  - `src/puzzles/types.ts`
  - `src/puzzles/ctrl.ts`
  - `src/puzzles/puzzleDb.ts`
- Patzer references:
  - `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
  - current review finding for `CCP-168`
- Lichess references:
  - none required unless you find a UI-shape question that truly benefits from comparison

Constraints:
- keep this scoped to the metadata editor type-safety gap
- do not redesign favorites, collections, notes, or tags UX
- do not weaken the canonical metadata types just to silence the compiler
- prefer constructing metadata updates without optional keys when values are absent
- preserve current user-visible metadata behavior unless a tiny correctness fix is required

Before coding, provide:
- prompt id
- task id
- parent prompt id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run `npm run typecheck -- --pretty false`
- run the most relevant task-specific check you can for the metadata editing flow
- explicitly report:
  - which `exactOptionalPropertyTypes` failures were fixed
  - whether any puzzle metadata types changed
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results.

Output shape:
- prompt id
- task id
- parent prompt id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks
```

## CCP-174 - Puzzle V1 Phase 5 Batch Manager

```
Prompt ID: CCP-174
Task ID: CCP-174
Source Document: docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md
Source Step: Phase 5 — Repetition And Imported-Library Scale / manager prompt
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Queue execution marker step:
- As the first task before startup coordination or implementation work, run:
  - `npm run prompt:start -- CCP-174`
- Only continue implementation work after that command succeeds.
- Leave this prompt queued after marking it started, even if execution later fails, stops midway, or hits a blocker.

Read and follow:
- `/Users/leftcoast/Development/PatzerPatzer/AGENTS.md`
- `/Users/leftcoast/Development/PatzerPatzer/CLAUDE.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/README.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CODEX_PROMPT_INSTRUCTIONS.md`

Batch prompt IDs to execute in order:
- `CCP-170`
- `CCP-171`
- `CCP-172`
- `CCP-173`

Manager-prompt rule:
- `CCP-174` is the manager prompt id only
- do not execute or recurse into `CCP-174` as if it were one of the child prompts

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same repo areas targeted by this phase.
- If overlapping work exists, stop and report it before editing.

Task:
- read the queued child prompts exactly as written from `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_QUEUE.md`
- execute them sequentially in the exact order listed above
- perform internal validation and self-check after each prompt
- stop immediately on any real issue, failed validation, unsafe repo state, or unresolved architectural blocker

Do not modify:
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_QUEUE.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_LOG.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_HISTORY.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/code-review.md`

Execution rules:
- do not reorder child prompts
- do not create new prompts during the batch
- do not continue past a known issue just to finish the phase
- if an earlier phase prerequisite proves missing, stop and report it clearly
- use internal validation/self-check only; external prompt review and queue/log closeout happen separately
- before starting each child prompt's startup coordination or implementation work, run `npm run prompt:start -- <CHILD_PROMPT_ID>`
- only continue into a child prompt after that command succeeds

After each completed child prompt, report briefly:
- Prompt ID
- task title
- build result
- validation result
- internal check result
- whether the batch will continue or stop

If the batch stops, report:
- which Prompt ID stopped the batch
- why it stopped
- what issue or failure was found

If the batch finishes, report a compact summary of completed Prompt IDs.

Begin with `CCP-170`, `CCP-171`, `CCP-172`, `CCP-173`.
```

## CCP-173 - Add Future Hooks For Rated Puzzle Mode

```
Prompt ID: CCP-173
Task ID: CCP-173
Source Document: docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md
Source Step: Phase 5 — Repetition And Imported-Library Scale / Task 4
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Queue execution marker step:
- As the first task before startup coordination or implementation work, run:
  - `npm run prompt:start -- CCP-173`
- Only continue implementation work after that command succeeds.
- Leave this prompt queued after marking it started, even if execution later fails, stops midway, or hits a blocker.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle-attempt / session / future-mode files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step to add non-user-facing hooks for future rated puzzle mode, without implementing rating progression or exposing a fake rated UI.

Inspect first:
- Patzer: puzzle attempt model, puzzle session/selection state, any future-mode flags already present
- Patzer references: `docs/PUZZLE_V1_PLAN.md`, `docs/FUTURE_FUNCTIONALITY.md`, `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
- Lichess references: `docs/reference/lichess-puzzle-ux/README.md`

Constraints:
- scope this to future hooks only
- do not expose a visible rated mode toggle yet unless the smallest honest hook requires a disabled/internal seam
- do not invent a rating algorithm in this task
- keep the hook compatible with existing attempt history and puzzle identity

Before coding, provide:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run the most relevant task-specific check you can for the future-rated-mode seam
- explicitly report:
  - build result
  - what future hook was added
  - what rated functionality remains intentionally absent
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results.

Output shape:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks
```

## CCP-172 - Improve Imported Puzzle Library Filtering And Loading Scale

```
Prompt ID: CCP-172
Task ID: CCP-172
Source Document: docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md
Source Step: Phase 5 — Repetition And Imported-Library Scale / Task 3
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Queue execution marker step:
- As the first task before startup coordination or implementation work, run:
  - `npm run prompt:start -- CCP-172`
- Only continue implementation work after that command succeeds.
- Leave this prompt queued after marking it started, even if execution later fails, stops midway, or hits a blocker.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same imported-library / filter / loading files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step to improve imported puzzle library filtering and loading scale once the product shell is stable.

Inspect first:
- Patzer: imported puzzle adapters, puzzle library UI, filter/query state, any generated Lichess data loader seams
- Patzer references: `docs/PUZZLE_V1_PLAN.md`, `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
- Lichess references: `docs/reference/lichess-puzzle-ux/README.md`, `docs/reference/lichess-puzzle-ux/FILTERS_THEMES_AND_SELECTION.md`

Constraints:
- scope this to library filtering/loading behavior
- do not restart the imported data model from scratch
- do not require full PGN enrichment
- prefer the smallest safe scale improvement that matches the current generated data shape

Before coding, provide:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run the most relevant task-specific check you can for imported-library filtering and loading
- explicitly report:
  - build result
  - what filtering/loading improvement was added
  - what imported-library limitations still remain
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results.

Output shape:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks
```

## CCP-171 - Add Minimal Due-Again Metadata And Filters

```
Prompt ID: CCP-171
Task ID: CCP-171
Source Document: docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md
Source Step: Phase 5 — Repetition And Imported-Library Scale / Task 2
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Queue execution marker step:
- As the first task before startup coordination or implementation work, run:
  - `npm run prompt:start -- CCP-171`
- Only continue implementation work after that command succeeds.
- Leave this prompt queued after marking it started, even if execution later fails, stops midway, or hits a blocker.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle-library / repetition-metadata / filter files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step to add lightweight due-again metadata and filtering, without pretending a full spaced-repetition scheduler already exists.

Inspect first:
- Patzer: puzzle attempt history, retry queue behavior, puzzle library filter state
- Patzer references: `docs/PUZZLE_V1_PLAN.md`, `docs/PuzzlePlanNotes.md`, `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
- Lichess references: `docs/reference/lichess-puzzle-ux/README.md`

Constraints:
- scope this to minimal due-again metadata and filter behavior
- do not implement a full scheduling algorithm
- keep the semantics honest and explain any heuristic used
- do not regress existing library source distinctions

Before coding, provide:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run the most relevant task-specific check you can for due-again metadata and filters
- explicitly report:
  - build result
  - what due-again metadata now exists
  - what filtering behavior now exists
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results.

Output shape:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks
```

## CCP-170 - Add Retry-Failed-Earlier Queue

```
Prompt ID: CCP-170
Task ID: CCP-170
Source Document: docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md
Source Step: Phase 5 — Repetition And Imported-Library Scale / Task 1
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Queue execution marker step:
- As the first task before startup coordination or implementation work, run:
  - `npm run prompt:start -- CCP-170`
- Only continue implementation work after that command succeeds.
- Leave this prompt queued after marking it started, even if execution later fails, stops midway, or hits a blocker.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle-attempt / library-filter / queue-selection files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step to add the first repetition-oriented queue that lets the user retry puzzles they previously failed or solved only with assistance.

Inspect first:
- Patzer: puzzle attempt history, puzzle library UI, puzzle session/selection seams
- Patzer references: `docs/PUZZLE_V1_PLAN.md`, `docs/PuzzlePlanNotes.md`, `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
- Lichess references: `docs/reference/lichess-puzzle-ux/README.md`

Constraints:
- scope this to retry-failed-earlier behavior only
- do not build a full spaced-repetition scheduler yet
- treat failure/assistance history as global per puzzle
- avoid deleting or permanently hiding previously solved puzzles

Before coding, provide:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run the most relevant task-specific check you can for the retry queue
- explicitly report:
  - build result
  - how the retry-failed-earlier queue is built
  - what attempt states it uses
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results.

Output shape:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks
```
