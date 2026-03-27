# Claude Prompt Queue
Use this file to store Claude Code prompts that are available for future use and have not yet been reviewed.
## How to use it
- Keep all created, still-unreviewed prompts here so they remain available to run later.
- Remove prompts from this file only after they have actually been used and then reviewed.
- Do not remove unreviewed prompts just because they belong to a later phase.
- When the user explicitly wants manager prompts available too, manager prompts may also live in this file.
- Do not add review status here.
- Use queue-index checkboxes to show execution state:
  - `- [ ]` means created and queued, but not yet run
  - `- [x]` means run and waiting for review closeout
- Keep a top-of-file queue index that lists only the prompts currently still queued.
- In that queue index, format each item as:
  - first line: `- [ ] CCP-###: Short Task Title`
  - second line: an indented bullet with a brief target description
- Leave one blank line between queue-index items for readability.
- Keep the queue index concise and scan-friendly.
- Keep the queue index in sync with the prompt blocks below:
  - add a new index item when a prompt is created
  - change the matching index item from `- [ ]` to `- [x]` when the prompt is actually run
  - remove the matching index item only when the prompt is removed from this file during review
- Add a scan-friendly Markdown heading immediately before each prompt block:
  - format: `## prompt-id - short task title`
  - keep this heading outside the fenced prompt block
- Use plain fenced Markdown blocks with no language tag for queued prompts.
- Keep the prompt metadata header near the top of each prompt:
  - `Prompt ID: CCP-###`
  - `Task ID: CCP-###`
  - `Parent Prompt ID: CCP-###` if this is a follow-up fix prompt
  - `Source Document: docs/...`
  - `Source Step: ...`
- For a follow-up fix prompt:
  - `Prompt ID` must use the next `-F#` modifier, such as `CCP-013-F1`
  - `Task ID` must stay the root family id, such as `CCP-013`
  - `Parent Prompt ID` should point to the reviewed prompt being fixed
- Once a queued prompt has actually been used in Claude Code and then reviewed:
  - mark its queue-index item as `- [x]` when it is run
  - keep the queue block and queue-index item present until review
  - remove it from this file during review
  - add or update its reviewed entry in `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_LOG.md`

## Queue Index

- [ ] CCP-174: Puzzle V1 Phase 5 Batch Manager
  - execute Puzzle V1 phase batch manager for `CCP-170`, `CCP-171`, `CCP-172`, `CCP-173`.

- [ ] CCP-169: Puzzle V1 Phase 4 Batch Manager
  - execute Puzzle V1 phase batch manager for `CCP-165`, `CCP-166`, `CCP-167`, `CCP-168`.

- [ ] CCP-164: Puzzle V1 Phase 3 Batch Manager
  - execute Puzzle V1 phase batch manager for `CCP-160`, `CCP-161`, `CCP-162`, `CCP-163`.

- [ ] CCP-159: Puzzle V1 Phase 2 Batch Manager
  - execute Puzzle V1 phase batch manager for `CCP-155`, `CCP-156`, `CCP-157`, `CCP-158`.

- [ ] CCP-154: Puzzle V1 Phase 1 Batch Manager
  - execute Puzzle V1 phase batch manager for `CCP-150`, `CCP-151`, `CCP-152`, `CCP-153`.

- [ ] CCP-173: Add Future Hooks For Rated Puzzle Mode
  - add non-user-facing rated-mode hooks without implementing rating progression yet.

- [ ] CCP-172: Improve Imported Puzzle Library Filtering And Loading Scale
  - improve imported-library loading and filter behavior once the product shell is stable.

- [ ] CCP-171: Add Minimal Due-Again Metadata And Filters
  - add lightweight due-again metadata and filtering without a full scheduler.

- [ ] CCP-170: Add Retry-Failed-Earlier Queue
  - add the first repetition-oriented queue using failed/assisted puzzle outcomes.

- [ ] CCP-168: Add Flat Collections, Notes, Tags, And Favorites
  - add the first user-library organization layer on top of canonical puzzle records.

- [ ] CCP-167: Add Move-List Create-Puzzle Flow
  - add the right-click move-list flow for creating user puzzles from analysis positions.

- [ ] CCP-166: Bulk-Save Missed Moments After Review
  - add the focused bulk-save path for failed or missed Learn From Your Mistakes moments.

- [ ] CCP-165: Save Learn From Your Mistakes Moments Into User Library
  - save selected retrospection moments into the canonical user puzzle library.

- [ ] CCP-163: Render Eval-Delta Feedback For Non-Best Moves
  - show solver-perspective eval deltas and better/worse/best feedback on the puzzle board.

- [ ] CCP-162: Log Assisted-Solve And Reveal Reasons
  - record engine-reveal, hint, and other assist reasons in puzzle attempt history.

- [ ] CCP-161: Add PuzzleMoveQuality Evaluation Layer
  - compute Patzer-specific move-quality feedback separately from strict solution validation.

- [ ] CCP-160: Add Puzzle-Mode Engine Runtime Owner
  - introduce a puzzle-owned engine runtime seam without replacing strict puzzle correctness.

- [ ] CCP-158: Render Puzzle Result States And Navigation
  - show clean/recovered/assisted/skipped result UI and next-navigation controls.

- [ ] CCP-157: Persist Puzzle Attempt Results
  - persist puzzle-round outcomes into the canonical attempt-history model.

- [ ] CCP-156: Validate Strict Solution Moves And Auto-Reply
  - enforce stored-solution move validation and scripted opponent replies.

- [ ] CCP-155: Add Puzzle Round Controller
  - introduce the smallest real controller for puzzle-round state and transitions.

- [ ] CCP-153: Add Puzzle Board Layout Shell
  - add the dedicated puzzle board page shell on top of the shared board subsystem.

- [ ] CCP-152: Open Minimal Puzzle Round From Canonical Puzzle Definition
  - make selecting a canonical puzzle open a minimal dedicated round context.

- [ ] CCP-151: Render Top-Level Puzzle Source Navigator
  - render the first real puzzle-library surface with Imported Puzzles and User Library source sections.

- [ ] CCP-150: Add Puzzle Library Route Owner
  - add a dedicated puzzle product route owner without rebuilding the full round UI.

- [ ] CCP-143: Add Board Consumer Move Hook
  - add a board-consumer move hook seam so board core can notify product owners without hardcoding future puzzle behavior.

- [ ] CCP-144: Move Retrospection Solve Logic Out Of Board Core
  - move analysis-owned retrospection solve interception out of `src/board/index.ts`.

- [ ] CCP-145: Add Canonical Puzzle Domain Types
  - add canonical Puzzle V1 model types separately from the legacy analysis-side `PuzzleCandidate`.

- [ ] CCP-146: Add Puzzle Library Persistence Owner
  - add persistence ownership for puzzle definitions, user metadata, and attempt history.

- [ ] CCP-147: Add Puzzle Source Adapter Seams
  - add adapter seams from Patzer saved moments and imported Lichess records into the canonical puzzle model.

## Queue

## CCP-174 - Puzzle V1 Phase 5 Batch Manager

```
Prompt ID: CCP-174
Task ID: CCP-174
Source Document: docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md
Source Step: Phase 5 — Repetition And Imported-Library Scale / manager prompt
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

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

## CCP-169 - Puzzle V1 Phase 4 Batch Manager

```
Prompt ID: CCP-169
Task ID: CCP-169
Source Document: docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md
Source Step: Phase 4 — User Library Authoring / manager prompt
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Read and follow:
- `/Users/leftcoast/Development/PatzerPatzer/AGENTS.md`
- `/Users/leftcoast/Development/PatzerPatzer/CLAUDE.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/README.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CODEX_PROMPT_INSTRUCTIONS.md`

Batch prompt IDs to execute in order:
- `CCP-165`
- `CCP-166`
- `CCP-167`
- `CCP-168`

Manager-prompt rule:
- `CCP-169` is the manager prompt id only
- do not execute or recurse into `CCP-169` as if it were one of the child prompts

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

Begin with `CCP-165`, `CCP-166`, `CCP-167`, `CCP-168`.
```

## CCP-164 - Puzzle V1 Phase 3 Batch Manager

```
Prompt ID: CCP-164
Task ID: CCP-164
Source Document: docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md
Source Step: Phase 3 — Engine Assist Layer / manager prompt
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Read and follow:
- `/Users/leftcoast/Development/PatzerPatzer/AGENTS.md`
- `/Users/leftcoast/Development/PatzerPatzer/CLAUDE.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/README.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CODEX_PROMPT_INSTRUCTIONS.md`

Batch prompt IDs to execute in order:
- `CCP-160`
- `CCP-161`
- `CCP-162`
- `CCP-163`

Manager-prompt rule:
- `CCP-164` is the manager prompt id only
- do not execute or recurse into `CCP-164` as if it were one of the child prompts

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

Begin with `CCP-160`, `CCP-161`, `CCP-162`, `CCP-163`.
```

## CCP-159 - Puzzle V1 Phase 2 Batch Manager

```
Prompt ID: CCP-159
Task ID: CCP-159
Source Document: docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md
Source Step: Phase 2 — Strict Puzzle Solve Loop / manager prompt
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Read and follow:
- `/Users/leftcoast/Development/PatzerPatzer/AGENTS.md`
- `/Users/leftcoast/Development/PatzerPatzer/CLAUDE.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/README.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CODEX_PROMPT_INSTRUCTIONS.md`

Batch prompt IDs to execute in order:
- `CCP-155`
- `CCP-156`
- `CCP-157`
- `CCP-158`

Manager-prompt rule:
- `CCP-159` is the manager prompt id only
- do not execute or recurse into `CCP-159` as if it were one of the child prompts

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

Begin with `CCP-155`, `CCP-156`, `CCP-157`, `CCP-158`.
```

## CCP-154 - Puzzle V1 Phase 1 Batch Manager

```
Prompt ID: CCP-154
Task ID: CCP-154
Source Document: docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md
Source Step: Phase 1 — Minimal Puzzle Product Shell / manager prompt
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Read and follow:
- `/Users/leftcoast/Development/PatzerPatzer/AGENTS.md`
- `/Users/leftcoast/Development/PatzerPatzer/CLAUDE.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/README.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CODEX_PROMPT_INSTRUCTIONS.md`

Batch prompt IDs to execute in order:
- `CCP-150`
- `CCP-151`
- `CCP-152`
- `CCP-153`

Manager-prompt rule:
- `CCP-154` is the manager prompt id only
- do not execute or recurse into `CCP-154` as if it were one of the child prompts

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

Begin with `CCP-150`, `CCP-151`, `CCP-152`, `CCP-153`.
```

## CCP-173 - Add Future Hooks For Rated Puzzle Mode

```
Prompt ID: CCP-173
Task ID: CCP-173
Source Document: docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md
Source Step: Phase 5 — Repetition And Imported-Library Scale / Task 4
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

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

## CCP-168 - Add Flat Collections, Notes, Tags, And Favorites

```
Prompt ID: CCP-168
Task ID: CCP-168
Source Document: docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md
Source Step: Phase 4 — User Library Authoring / Task 4
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle-library / metadata / collection files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step to add the first user-library organization layer: flat collections, notes, tags, and favorites on top of canonical puzzle records.

Inspect first:
- Patzer: canonical puzzle model, user puzzle metadata model, puzzle persistence owner, puzzle library UI
- Patzer references: `docs/PUZZLE_V1_PLAN.md`, `docs/PuzzlePlanNotes.md`, `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
- Lichess references: none required for notes/tags/favorites parity; inspect only if a library interaction pattern clearly benefits from it

Constraints:
- keep collections flat, not nested
- preserve global completion state per puzzle
- allow multi-collection membership
- do not introduce cloud/user-account assumptions
- if the full UI is too large, choose the smallest honest metadata editing surface that still establishes the model cleanly

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
- run the most relevant task-specific check you can for metadata/collection behavior
- explicitly report:
  - build result
  - what collection and metadata behavior now exists
  - how multi-collection membership works
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

## CCP-167 - Add Move-List Create-Puzzle Flow

```
Prompt ID: CCP-167
Task ID: CCP-167
Source Document: docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md
Source Step: Phase 4 — User Library Authoring / Task 3
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same move-list / context-menu / puzzle-authoring files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step to add the move-list right-click flow for creating user puzzles from analysis positions, including the two explicit authoring branches defined in the product plan.

Inspect first:
- Patzer: `src/analyse/moveList.ts`, existing context-menu actions, puzzle persistence owner, canonical puzzle model
- Patzer references: `docs/PUZZLE_V1_PLAN.md`, `docs/PuzzlePlanNotes.md`, `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
- Lichess references: inspect only where move-list interaction patterns are relevant; this is a Patzer-specific authoring feature, not Lichess parity work

Constraints:
- support the two explicit branches:
  - selected move is the puzzle solution move
  - selected move is the puzzle start position
- keep the answer-key logic explicit and reviewable
- do not broaden this into arbitrary desktop import
- prefer a minimal honest authoring dialog over a large authoring UI system

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
- run the most relevant task-specific check you can for the move-list authoring flow
- explicitly report:
  - build result
  - how the two authoring branches now work
  - what puzzle data is created from each branch
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

## CCP-166 - Bulk-Save Missed Moments After Review

```
Prompt ID: CCP-166
Task ID: CCP-166
Source Document: docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md
Source Step: Phase 4 — User Library Authoring / Task 2
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same retrospection-session / save-flow / puzzle-library files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step to add the focused post-session bulk-save path for failed or missed Learn From Your Mistakes moments.

Inspect first:
- Patzer: retrospection controller/view, puzzle persistence owner, user-library save flow from prior task
- Patzer references: `docs/PUZZLE_V1_PLAN.md`, `docs/NEXT_STEPS.md`, `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
- Lichess references: `docs/reference/lichess-retrospection-ux/README.md`

Constraints:
- scope this to the post-session bulk-save path
- do not redesign the whole retrospection end-state UI
- keep the save target inside the canonical puzzle library
- preserve first-attempt outcome information instead of flattening it away during save

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
- run the most relevant task-specific check you can for the bulk-save flow
- explicitly report:
  - build result
  - how failed or missed moments are now bulk-saved
  - what still remains deferred in library authoring
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

## CCP-165 - Save Learn From Your Mistakes Moments Into User Library

```
Prompt ID: CCP-165
Task ID: CCP-165
Source Document: docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md
Source Step: Phase 4 — User Library Authoring / Task 1
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same retrospection / puzzle-library / save-flow files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step to save selected Learn From Your Mistakes moments into the canonical user puzzle library.

Inspect first:
- Patzer: `src/analyse/retroCtrl.ts`, `src/analyse/retroView.ts`, puzzle persistence owner, puzzle source adapters, any existing saved-moment UI
- Patzer references: `docs/PUZZLE_V1_PLAN.md`, `docs/NEXT_STEPS.md`, `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
- Lichess references: `docs/reference/lichess-retrospection-ux/README.md`, `docs/reference/lichess-puzzle-ux/README.md`

Constraints:
- scope this to saving selected retro moments only
- do not bundle bulk-save at session end yet
- keep the saved record canonical and source-aware
- do not invent a separate storage model for retrospection-only puzzles

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
- run the most relevant task-specific check you can for retro-to-library save flow
- explicitly report:
  - build result
  - how a Learn From Your Mistakes moment is now saved
  - what user-library data is written
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

## CCP-163 - Render Eval-Delta Feedback For Non-Best Moves

```
Prompt ID: CCP-163
Task ID: CCP-163
Source Document: docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md
Source Step: Phase 3 — Engine Assist Layer / Task 4
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle-view / assist-feedback / engine-display files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step to render solver-perspective eval-delta feedback and better/worse/best messaging for non-best moves on the puzzle board.

Inspect first:
- Patzer: the puzzle engine runtime seam, `PuzzleMoveQuality`, puzzle result/feedback UI
- Patzer references: `docs/PUZZLE_V1_PLAN.md`, `docs/PuzzlePlanNotes.md`, `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
- Lichess references: `docs/reference/lichess-puzzle-ux/README.md`

Constraints:
- scope this to the feedback UI layer
- do not override strict correctness
- display eval deltas from the solver’s perspective, not raw white-centric score direction
- only reveal the best move when the user explicitly asks, not as part of generic feedback

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
- run the most relevant task-specific check you can for eval-delta feedback
- explicitly report:
  - build result
  - what better/worse/best feedback is now shown
  - how solver-perspective eval deltas are displayed
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

## CCP-162 - Log Assisted-Solve And Reveal Reasons

```
Prompt ID: CCP-162
Task ID: CCP-162
Source Document: docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md
Source Step: Phase 3 — Engine Assist Layer / Task 3
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle-attempt / persistence / assist-state files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step to log assisted-solve and reveal reasons in puzzle attempt history, so clean/recovered/assisted outcomes are backed by actual recorded reasons.

Inspect first:
- Patzer: puzzle attempt model, persistence owner, puzzle engine runtime seam, any reveal/hint UI already introduced
- Patzer references: `docs/PUZZLE_V1_PLAN.md`, `docs/PuzzlePlanNotes.md`, `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
- Lichess references: `docs/reference/lichess-puzzle-ux/README.md`

Constraints:
- scope this to reason logging only
- do not redesign the entire result-state UI
- keep assistance reasons explicit instead of burying them in generic booleans where possible
- preserve append-only attempt-history semantics

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
- run the most relevant task-specific check you can for assist-reason logging
- explicitly report:
  - build result
  - what assist reasons are now recorded
  - how attempt history changed
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

## CCP-161 - Add PuzzleMoveQuality Evaluation Layer

```
Prompt ID: CCP-161
Task ID: CCP-161
Source Document: docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md
Source Step: Phase 3 — Engine Assist Layer / Task 2
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle-engine / retro / move-quality files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step to add the shared `PuzzleMoveQuality` evaluation concept for Patzer’s assist layer, keeping it separate from strict solution validation.

Inspect first:
- Patzer: the puzzle engine runtime seam, puzzle round controller, `src/analyse/retroCtrl.ts`, any move-quality or eval-delta helpers already present
- Patzer references: `docs/PUZZLE_V1_PLAN.md`, `docs/PuzzlePlanNotes.md`, `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
- Lichess references: `docs/reference/lichess-puzzle-ux/README.md`, `docs/reference/lichess-retrospection-ux/README.md`

Constraints:
- scope this to the move-quality model only
- do not let it override strict correctness
- keep it reusable by both puzzle board and Learn From Your Mistakes
- avoid vague labels; define explicit data fields the UI can later render honestly

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
- run the most relevant task-specific check you can for the new move-quality layer
- explicitly report:
  - build result
  - what `PuzzleMoveQuality` now contains
  - how it stays separate from strict correctness
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

## CCP-160 - Add Puzzle-Mode Engine Runtime Owner

```
Prompt ID: CCP-160
Task ID: CCP-160
Source Document: docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md
Source Step: Phase 3 — Engine Assist Layer / Task 1
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle-round / engine / ceval files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step to add a puzzle-owned engine runtime seam for Patzer’s assist layer, without replacing strict puzzle correctness.

Inspect first:
- Patzer: puzzle round/view files, `src/engine/ctrl.ts`, `src/ceval/view.ts`, any engine integration introduced by prior phases
- Patzer references: `docs/PUZZLE_V1_PLAN.md`, `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
- Lichess references: `docs/reference/lichess-puzzle-ux/README.md`, `docs/reference/lichess-puzzle-ux/BOARD_AND_INTERACTION_MODEL.md`, `~/Development/lichess-source/lila/ui/puzzle/src/ctrl.ts`

Constraints:
- scope this to engine runtime ownership only
- do not let engine feedback become the correctness model
- do not regress analysis-board engine behavior
- keep the puzzle-owned engine seam separate from board core
- prefer an explicit puzzle owner over ad hoc checks scattered across engine code

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
- run the most relevant task-specific check you can for the puzzle engine seam
- explicitly report:
  - build result
  - what puzzle-owned engine seam was added
  - how strict correctness remains separate
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

## CCP-158 - Render Puzzle Result States And Navigation

```
Prompt ID: CCP-158
Task ID: CCP-158
Source Document: docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md
Source Step: Phase 2 — Strict Puzzle Solve Loop / Task 4
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle-view / result-state / navigation-control files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step to render puzzle result-state UI for clean / recovered / assisted / skipped outcomes, plus the minimal navigation controls needed to continue through a puzzle session.

Inspect first:
- Patzer: the puzzle round controller, attempt persistence, current puzzle view/layout files
- Patzer references: `docs/PUZZLE_V1_PLAN.md`, `docs/PuzzlePlanNotes.md`, `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
- Lichess references: `docs/reference/lichess-puzzle-ux/README.md`, `docs/reference/lichess-puzzle-ux/STANDARD_PUZZLE_FLOW.md`, `~/Development/lichess-source/lila/ui/puzzle/src/view/feedback.ts`, `~/Development/lichess-source/lila/ui/puzzle/src/view/after.ts`

Constraints:
- scope this to result-state and session navigation UI
- do not add engine-assist overlays yet
- do not add spaced-repetition queue behavior yet
- keep the result-state language aligned with Patzer’s defined solve states

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
- run the most relevant task-specific check you can for result-state rendering and navigation
- explicitly report:
  - build result
  - what result states are now shown
  - what navigation controls were added
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

## CCP-157 - Persist Puzzle Attempt Results

```
Prompt ID: CCP-157
Task ID: CCP-157
Source Document: docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md
Source Step: Phase 2 — Strict Puzzle Solve Loop / Task 3
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle-round / persistence / attempt-history files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step to persist puzzle-round outcomes into the canonical attempt-history model.

Inspect first:
- Patzer: the puzzle round controller, canonical puzzle attempt types, puzzle persistence owner
- Patzer references: `docs/PUZZLE_V1_PLAN.md`, `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
- Lichess references: `docs/reference/lichess-puzzle-ux/README.md`, `~/Development/lichess-source/lila/ui/puzzle/src/session.ts`

Constraints:
- scope this to attempt persistence only
- do not add spaced-repetition queue behavior yet
- keep append-only attempt history semantics
- do not collapse clean/recovered/assisted/skipped into one boolean
- do not bundle new library filtering UI

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
- run the most relevant task-specific check you can for attempt persistence
- explicitly report:
  - build result
  - what attempt records are now persisted
  - what result states are recorded
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

## CCP-156 - Validate Strict Solution Moves And Auto-Reply

```
Prompt ID: CCP-156
Task ID: CCP-156
Source Document: docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md
Source Step: Phase 2 — Strict Puzzle Solve Loop / Task 2
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle-round / move-validation / board-move files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step to enforce strict stored-solution move validation and scripted opponent replies for puzzle rounds.

Inspect first:
- Patzer: the puzzle round controller, board integration seam, canonical puzzle definition model
- Patzer references: `docs/PUZZLE_V1_PLAN.md`, `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
- Lichess references: `docs/reference/lichess-puzzle-ux/README.md`, `docs/reference/lichess-puzzle-ux/STANDARD_PUZZLE_FLOW.md`, `~/Development/lichess-source/lila/ui/puzzle/src/moveTest.ts`, `~/Development/lichess-source/lila/ui/puzzle/src/ctrl.ts`

Constraints:
- scope this to strict correctness only
- stored solution must win over engine preference
- do not add graded engine feedback yet
- do not add result persistence yet
- keep auto-reply behavior driven by stored solution line, not by live ceval

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
- run the most relevant task-specific check you can for strict validation and auto-reply
- explicitly report:
  - build result
  - how strict solution validation now works
  - how opponent auto-reply now works
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

## CCP-155 - Add Puzzle Round Controller

```
Prompt ID: CCP-155
Task ID: CCP-155
Source Document: docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md
Source Step: Phase 2 — Strict Puzzle Solve Loop / Task 1
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle-round / puzzle-view / board-integration files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step to introduce a real puzzle round controller that owns round state and transitions for the dedicated puzzle board.

Inspect first:
- Patzer: the Phase 1 route/round/layout files, canonical puzzle types, puzzle persistence owner
- Patzer references: `docs/PUZZLE_V1_PLAN.md`, `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
- Lichess references: `docs/reference/lichess-puzzle-ux/README.md`, `docs/reference/lichess-puzzle-ux/STANDARD_PUZZLE_FLOW.md`, `~/Development/lichess-source/lila/ui/puzzle/src/ctrl.ts`, `~/Development/lichess-source/lila/ui/puzzle/src/moveTree.ts`

Constraints:
- scope this to round-state ownership only
- do not add engine-assist behavior yet
- do not conflate round state with persistence state
- keep strict-solution ownership explicit
- keep board-core ownership separate from puzzle-round controller ownership

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
- run the most relevant task-specific check you can for round-state transitions
- explicitly report:
  - build result
  - what the new puzzle round controller owns
  - what is still intentionally deferred
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

## CCP-153 - Add Puzzle Board Layout Shell

```
Prompt ID: CCP-153
Task ID: CCP-153
Source Document: docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md
Source Step: Phase 1 — Minimal Puzzle Product Shell / Task 4
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle-view / board-layout / shared-board files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step to add the dedicated puzzle board layout shell on top of the shared board subsystem, without yet implementing the full strict solve loop.

Inspect first:
- Patzer: the Phase 1 route/round work, `src/board/index.ts`, any board-layout or player-strip helpers currently reused by analysis
- Patzer references: `docs/PUZZLE_V1_PLAN.md`, `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
- Lichess references: `docs/reference/lichess-puzzle-ux/README.md`, `docs/reference/lichess-puzzle-ux/BOARD_AND_INTERACTION_MODEL.md`, `~/Development/lichess-source/lila/ui/puzzle/src/view/main.ts`, `~/Development/lichess-source/lila/ui/puzzle/src/view/chessground.ts`

Constraints:
- scope this to layout shell only
- reuse the shared board subsystem instead of copying the analysis page wholesale
- do not re-introduce puzzle-specific ownership into board core
- do not add full result/feedback widgets yet
- be explicit about what is shared-board reuse versus puzzle-only layout

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
- run the most relevant task-specific check you can for the puzzle page shell
- explicitly report:
  - build result
  - what shared board pieces are reused
  - what puzzle-only layout shell was added
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

## CCP-152 - Open Minimal Puzzle Round From Canonical Puzzle Definition

```
Prompt ID: CCP-152
Task ID: CCP-152
Source Document: docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md
Source Step: Phase 1 — Minimal Puzzle Product Shell / Task 3
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle-selection / route / round-state files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step to make selecting a canonical Puzzle V1 definition open a minimal dedicated puzzle-round context, without implementing the full solve loop yet.

Inspect first:
- Patzer: the Phase 1 route owner, library navigator, canonical puzzle types, puzzle persistence owner
- Patzer references: `docs/PUZZLE_V1_PLAN.md`, `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
- Lichess references: `docs/reference/lichess-puzzle-ux/README.md`, `docs/reference/lichess-puzzle-ux/STANDARD_PUZZLE_FLOW.md`, `~/Development/lichess-source/lila/ui/puzzle/src/ctrl.ts`

Constraints:
- scope this to opening a round context only
- do not implement strict move validation yet
- do not add engine-assist behavior yet
- make source identity explicit so imported and user-library puzzles open through one round seam without becoming one shallow object

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
- run the most relevant task-specific check you can for opening a round context
- explicitly report:
  - build result
  - how a canonical puzzle now opens
  - what round behavior is still intentionally absent
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

## CCP-151 - Render Top-Level Puzzle Source Navigator

```
Prompt ID: CCP-151
Task ID: CCP-151
Source Document: docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md
Source Step: Phase 1 — Minimal Puzzle Product Shell / Task 2
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle-route / library-view / layout files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step to render the first real puzzle-library surface with the two top-level Puzzle V1 source distinctions: `Imported Puzzles` and `User Library`.

Inspect first:
- Patzer: the Phase 1 route owner, canonical puzzle model, puzzle persistence owner, puzzle source adapters
- Patzer references: `docs/PUZZLE_V1_PLAN.md`, `docs/PuzzlePlanNotes.md`, `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
- Lichess references: `docs/reference/lichess-puzzle-ux/README.md`, `docs/reference/lichess-puzzle-ux/FILTERS_THEMES_AND_SELECTION.md`, `~/Development/lichess-source/lila/ui/puzzle/src/view/side.ts`

Constraints:
- scope this to top-level source navigation only
- do not build the full filter system yet
- do not build solve-loop UI yet
- keep Imported Puzzles and User Library distinct at the UI and data level
- prefer a minimal but honest navigator over a fake finished library

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
- run the most relevant task-specific check you can for the new navigator
- explicitly report:
  - build result
  - how Imported Puzzles and User Library are rendered
  - what library behavior is still intentionally deferred
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

## CCP-150 - Add Puzzle Library Route Owner

```
Prompt ID: CCP-150
Task ID: CCP-150
Source Document: docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md
Source Step: Phase 1 — Minimal Puzzle Product Shell / Task 1
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same router / main / puzzle-owner files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step to add a dedicated puzzle product route owner for Puzzle V1, without rebuilding the full round UI yet.

Inspect first:
- Patzer: `src/main.ts`, `src/router.ts`, the canonical puzzle model/persistence/adapter files created in Phase 0
- Patzer references: `docs/PUZZLE_V1_PLAN.md`, `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
- Lichess references: `docs/reference/lichess-puzzle-ux/README.md`, `docs/reference/lichess-puzzle-ux/PRODUCT_MAP.md`, `docs/reference/lichess-puzzle-ux/STANDARD_PUZZLE_FLOW.md`, `~/Development/lichess-source/lila/ui/puzzle/src/view/main.ts`

Constraints:
- scope this to route ownership and entry wiring only
- do not add the full puzzle board layout yet
- avoid growing `src/main.ts` with medium-sized puzzle logic
- if a new puzzle owner module is safer, prefer that
- keep future imported/user-library source distinctions intact

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
- run the most relevant task-specific check you can for route ownership
- explicitly report:
  - build result
  - what route owner or route seam was added
  - what behavior stayed intentionally minimal
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

## CCP-143 - Add Board Consumer Move Hook

```
Prompt ID: CCP-143
Task ID: CCP-143
Source Document: docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md
Source Step: Phase 0 — Ownership And Data Foundations / Task 1
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same board / analysis / move-handling files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step to introduce a board-consumer move hook seam so `src/board/index.ts` can notify product owners about user move handling without forcing future puzzle or analysis-only behavior to live inside board core.

Inspect first:
- Patzer: `src/board/index.ts`, `src/main.ts`, `src/analyse/ctrl.ts`, `src/analyse/retroCtrl.ts`
- Patzer references: `docs/PUZZLE_V1_PLAN.md`, `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
- Lichess references: `docs/reference/lichess-puzzle-ux/README.md`, `docs/reference/lichess-puzzle-ux/BOARD_AND_INTERACTION_MODEL.md`, `docs/reference/lichess-retrospection-ux/README.md`, `docs/reference/lichess-retrospection-ux/BOARD_INTERACTION_AND_STATE_EFFECTS.md`, `~/Development/lichess-source/lila/ui/analyse/src/ground.ts`, `~/Development/lichess-source/lila/ui/puzzle/src/view/chessground.ts`

Constraints:
- scope this to the seam only
- preserve current analysis-board behavior
- do not rebuild puzzle mode
- do not silently expand `src/main.ts`
- do not move retrospection ownership fully in this task if doing so would make the change materially larger
- prefer a small callback / hook / event seam over a broad board-mode framework

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
- run the most relevant task-specific check you can for board move handling / hook wiring
- explicitly report:
  - build result
  - what new board-consumer seam was added
  - what behavior stayed unchanged
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

## CCP-144 - Move Retrospection Solve Logic Out Of Board Core

```
Prompt ID: CCP-144
Task ID: CCP-144
Source Document: docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md
Source Step: Phase 0 — Ownership And Data Foundations / Task 2
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same board / retrospection / analysis lifecycle files.
- If overlapping work exists, stop and report it before editing.

Task: using the new board-consumer seam, take the smallest safe step to move analysis-owned retrospection solve interception out of `src/board/index.ts` and into an analysis-owned module.

Inspect first:
- Patzer: `src/board/index.ts`, `src/main.ts`, `src/analyse/ctrl.ts`, `src/analyse/retroCtrl.ts`, `src/analyse/retroView.ts`
- Patzer references: `docs/PUZZLE_V1_PLAN.md`, `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
- Lichess references: `docs/reference/lichess-retrospection-ux/README.md`, `docs/reference/lichess-retrospection-ux/BOARD_INTERACTION_AND_STATE_EFFECTS.md`, `~/Development/lichess-source/lila/ui/analyse/src/retrospect/retroCtrl.ts`, `~/Development/lichess-source/lila/ui/analyse/src/ground.ts`

Constraints:
- preserve current Learn From Your Mistakes behavior
- keep this scoped to ownership cleanup, not feature expansion
- do not add puzzle runtime work
- do not introduce a generic framework unless inspection proves a tiny adapter is necessary
- avoid moving substantial new ownership into `src/main.ts`

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
- run the most relevant task-specific check you can for retrospection move handling
- explicitly report:
  - build result
  - what retrospection logic left board core
  - what owner now handles it
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

## CCP-145 - Add Canonical Puzzle Domain Types

```
Prompt ID: CCP-145
Task ID: CCP-145
Source Document: docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md
Source Step: Phase 0 — Ownership And Data Foundations / Task 3
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle-model / tree-type / persistence files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step to add canonical Puzzle V1 domain types that are richer than the legacy analysis-side `PuzzleCandidate`, while keeping existing saved-candidate behavior intact.

Inspect first:
- Patzer: `src/tree/types.ts`, `src/puzzles/extract.ts`, `src/idb/index.ts`
- Patzer references: `docs/PUZZLE_V1_PLAN.md`, `docs/PuzzlePlanNotes.md`, `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
- Lichess references: `docs/reference/lichess-puzzle-ux/README.md`, `docs/reference/lichess-puzzle-ux/STANDARD_PUZZLE_FLOW.md`, `~/Development/lichess-source/lila/ui/puzzle/src/interfaces.ts`

Constraints:
- add canonical puzzle types only
- do not rebuild the puzzle page
- do not remove or rename the legacy `PuzzleCandidate` type yet
- keep source distinction explicit (`imported-lichess` vs `user-library`)
- include solve-result and failure-reason concepts needed by the Puzzle V1 plan
- avoid speculative fields that the current product plan does not need yet

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
- run the most relevant task-specific check you can for the new type/module boundary
- explicitly report:
  - build result
  - what new canonical types were added
  - what legacy type was intentionally left in place
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

## CCP-146 - Add Puzzle Library Persistence Owner

```
Prompt ID: CCP-146
Task ID: CCP-146
Source Document: docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md
Source Step: Phase 0 — Ownership And Data Foundations / Task 4
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same IDB / persistence / puzzle-model files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step to add a persistence owner for Puzzle V1 definitions, user metadata, and attempt history, while preserving the current legacy saved-candidate storage path until the rebuild is ready to consume the new model.

Inspect first:
- Patzer: `src/idb/index.ts`, `src/tree/types.ts`, the new canonical puzzle type module, `src/main.ts`
- Patzer references: `docs/PUZZLE_V1_PLAN.md`, `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
- Lichess references: `docs/reference/lichess-puzzle-ux/README.md`, `docs/reference/lichess-puzzle-ux/STANDARD_PUZZLE_FLOW.md`

Constraints:
- scope this to persistence ownership and schema only
- do not rebuild puzzle UI
- do not silently break the current saved-candidate flow in analysis
- keep the new canonical puzzle data separate from the legacy candidate list
- choose the smallest honest storage shape that can support definitions, user metadata, and append-only attempts

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
- run the most relevant task-specific check you can for the new persistence owner
- explicitly report:
  - build result
  - what new persistence records or stores were added
  - what legacy path was preserved
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

## CCP-147 - Add Puzzle Source Adapter Seams

```
Prompt ID: CCP-147
Task ID: CCP-147
Source Document: docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md
Source Step: Phase 0 — Ownership And Data Foundations / Task 5
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle-source / adapter / generated-data files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step to add adapter seams that can turn both Patzer saved learnable moments and imported Lichess records into the canonical Puzzle V1 model, without rebuilding library UI or round runtime yet.

Inspect first:
- Patzer: `src/puzzles/extract.ts`, `src/tree/types.ts`, the new canonical puzzle type module, the new puzzle persistence owner, `src/games/view.ts`
- Local imported data: `public/generated/lichess-puzzles/manifest.json` and one representative shard file
- Patzer references: `docs/PUZZLE_V1_PLAN.md`, `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
- Lichess references: `docs/reference/lichess-puzzle-ux/README.md`, `docs/reference/lichess-puzzle-ux/STANDARD_PUZZLE_FLOW.md`

Constraints:
- scope this to adapters only
- do not add puzzle routes or page UI
- do not force imported and user-library sources into one shallow object
- preserve the current analysis-side saved-candidate behavior while adding the new canonical conversion path
- if imported Lichess records do not contain full PGN, do not invent it

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
- run the most relevant task-specific check you can for both adapter paths
- explicitly report:
  - build result
  - what user-library adapter was added
  - what imported-puzzle adapter was added
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
