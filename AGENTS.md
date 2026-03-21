# Patzer Pro — Agent Operating Instructions

These instructions are the repo-wide default for coding and review agents working in this project.

## Project identity

Patzer Pro is a web app for analyzing chess games and generating targeted practice puzzles.

Primary architectural goal:
- follow Lichess-style separation of concerns
- use Lichess as the main reference for analysis-board behavior, move-tree rendering, review workflow, board UI patterns, and engine interaction
- avoid monolithic growth
- move `src/main.ts` toward orchestration/bootstrap only

## Core engineering priorities

1. Correctness
2. Stability / reliability
3. Lichess-aligned behavior
4. Clear subsystem ownership
5. UI polish last

Do not optimize for speed if it increases architectural confusion or regression risk.

## Current repo reality

Do not write instructions or plans against an idealized file tree.
Use the code that actually exists in this repository today.

Current key paths include:
- `src/main.ts` — still contains orchestration plus remaining legacy glue
- `src/analyse/` — analysis rendering and controller code
- `src/board/` — board cosmetics, board integration, orientation behavior
- `src/engine/` — engine state, live eval, batch/review coordination, win chances
- `src/games/` — game list / games view rendering
- `src/import/` — PGN, Chess.com, and Lichess import flows
- `src/idb/index.ts` — IndexedDB persistence
- `src/tree/` — move-tree structures and PGN-to-tree conversion
- `src/ceval/` — engine protocol / ceval UI pieces

If docs and code disagree, trust the code first, then update docs if needed.

Use `docs/FUTURE_FUNCTIONALITY.md` as a reference for longer-range product ideas and intended
future capabilities. Do not treat it as the active implementation roadmap. Active near-term work
should still be grounded in the current codebase plus:
- `docs/NEXT_STEPS.md`
- `docs/KNOWN_ISSUES.md`
- `docs/ARCHITECTURE.md`

Use `docs/WISHLIST.md` as a reference for optional quality-of-life and UI ideas the user may want
to revisit. Do not treat wishlist items as approved or sequenced work. Wishlist items must be
checked against current architecture, current known issues, and active priorities before they are
recommended or implemented.

For Lichess puzzle, retrospection, and Learn From Your Mistakes work, the reference sets in:
- `/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection/README.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection-ux/README.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/README.md`

are mandatory source material, not optional background reading.

## Terminology

In this repo, `Game Review` means the Review-button workflow on the analysis board:

- Stockfish analyzes the selected game
- the resulting review/analysis data is shown in the analysis board
- that review data may also be stored locally for later use by related tools

This is Patzer Pro's term for the Lichess `Request Computer Analysis` / computer-analysis flow.
Do not interpret `Game Review` as generic commentary, PR review, or a separate non-engine feature.

## Mandatory workflow for non-trivial implementation tasks

For every non-trivial task, always do this in order:

1. Inspect the current Patzer Pro codebase first
2. Locate the actual implementation points before assuming file paths
3. Inspect the relevant Lichess source before deciding how to implement
4. Compare:
   - how Patzer Pro currently works
   - how Lichess works
   - where they differ
5. Identify the smallest safe implementation step
6. Explain diagnosis before coding
7. Implement
8. Validate with build + task-specific checks

Never skip steps 1–4 for behavior or architecture work touching core chess features.

## Review workflow

When the task is a code review rather than implementation:

1. Inspect the actual changed files first
2. Compare behavior against the current codebase and the stated task
3. Inspect relevant Lichess source when the change affects Lichess-aligned behavior
4. Prioritize:
   - bugs
   - regressions
   - architectural drift
   - missing validation
   - risky hidden coupling
5. Report findings before summary
6. Check git push state in two stages:
   - use local git state first to identify branch, HEAD, upstream, and ahead/behind status
   - when network access is available, run a remote sync check (`git fetch --prune` for the tracked remote) before claiming a commit is pushed/public

If remote verification cannot be performed, say push/public status is unverified rather than inferred.

Do not praise by default.
Do not turn reviews into rewrite proposals.
Be specific about risk level, affected files, and likely user impact.

## Review output additions

After the main review sections, include a short `Suggested manual tests` section for the user.

Rules:
- keep it scoped to the actual diff only
- prefer 3–6 concrete manual checks
- for each check, include:
  - the action to take
  - the expected result
- prefer high-signal user-facing verification over generic test advice
- if the change is docs-only, prompt-only, or tooling-only, explicitly say that no manual app test is needed
- do not pad the review with speculative test ideas for unchanged areas

## Claude prompt tracking

When Codex is asked to create a prompt for Claude Code:

- first read `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CODEX_PROMPT_INSTRUCTIONS.md` and follow it
- assign or reuse a stable prompt identifier in the form `CCP-###`
- add an entry to `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_LOG.md`
- add the full prompt text to `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_HISTORY.md`
- include the same prompt identifier near the top of the generated Claude prompt
- instruct Claude Code to echo the `Prompt ID` in its final report so the exact prompt instance can be traced later
- include enough metadata to trace the prompt later:
  - task id
  - source document, if applicable
  - source step, if applicable
  - short task title

When Codex is asked to review Claude Code work or to verify whether a prompt/task id was accomplished:

- update `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_LOG.md` as part of the review workflow
- update the matching entry in `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_HISTORY.md`
- if the prompt id is known, mark the history entry heading so it clearly shows the prompt was used in Claude Code
- record review state separately from completion state
- if the prompt id must be inferred rather than confirmed, say so explicitly in both the review response and the log entry

Prompt log expectations:

- `CLAUDE_PROMPT_LOG.md` is the compact index of prompt ids, provenance, and review state
- `CLAUDE_PROMPT_HISTORY.md` is the full archive of generated Claude prompts plus later status updates
- treat prompt creation and prompt review as log-writing tasks, not optional follow-up work

Follow-up fix prompt rule:

- if the user asks in natural language to fix a bug, issue, regression, or missed behavior from an existing `CCP-###` task or reviewed prompt, treat it as a follow-up fix prompt by default
- natural-language signals include phrases like:
  - `I have a bug to fix with this`
  - `I want to fix something from this task`
  - `this needs a follow-up fix`
  - `create a follow-up fix for CCP-###`
- when that intent is clear, do not create a brand-new root `CCP-###`
- instead, keep the same root task family id and use the next follow-up prompt id:
  - original: `CCP-013`
  - first follow-up fix prompt: `CCP-013-F1`
  - second follow-up fix prompt: `CCP-013-F2`
- for follow-up fix prompts:
  - `Prompt ID` is the unique follow-up id, such as `CCP-013-F1`
  - `Task ID` remains the root family id, such as `CCP-013`
  - `Parent Prompt ID` should point to the prompt being fixed
- if the user’s wording is natural-language-only but the current task family is clear from context, infer the follow-up relationship and use the next `-F#` id automatically
- only create a brand-new root `CCP-###` when the user is starting a genuinely new task rather than refining or fixing an existing one

## Lichess-first rule

Lichess is the main architectural and behavioral reference.

For features related to:
- analysis board
- move list / tree rendering
- engine display / PV lines
- review workflow
- board settings
- board scaling
- piece / theme UI
- game-history / analysis workflow patterns

you must inspect the relevant Lichess source first and use it to inform:
- behavior
- module boundaries
- separation of concerns
- naming / structural decisions where appropriate

Do not copy blindly.
Use Lichess as the source of truth for behavior and subsystem shape.

## Retrospection and puzzle-generation rule

For any task involving:
- learn from mistakes
- retrospection
- puzzle candidate extraction
- saved puzzle generation
- "puzzle-worthy moment" heuristics
- review-to-puzzle pipelines

you must treat:
- `/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection/README.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection-ux/README.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/README.md`
- and the linked files in those folders

as mandatory implementation references.

Required process:

1. Inspect the relevant Lichess source files directly
2. Inspect the Patzer research files in:
   - `docs/reference/lichess-retrospection/`
   - `docs/reference/lichess-retrospection-ux/`
   - `docs/reference/lichess-puzzle-ux/`
3. Choose the correct reference family explicitly:
   - use `lichess-retrospection/` for candidate logic, thresholds, and review-to-puzzle reasoning
   - use `lichess-retrospection-ux/` for Learn From Your Mistakes analysis-board UX and board-mode behavior
   - use `lichess-puzzle-ux/` for standalone puzzle product UX, board behavior, themes/openings/history/replay, Storm, and Racer
4. Explicitly state what the source confirms, what is inference, and what is still unknown
5. Replicate the visible Lichess logic pipeline first
6. Defer Patzer-specific heuristic tuning until parity with the visible Lichess logic is achieved

Hard constraint:

- do not invent alternate puzzle heuristics, thresholds, or acceptance rules early just because
  they seem simpler or more intuitive
- do not replace visible Lichess logic with homegrown parameters unless the user explicitly asks
  for a deliberate divergence after parity work
- if the open-source Lichess repo does not prove a rule, say that clearly instead of making one up

No exceptions for puzzle-generation or retrospection work.

## No file-path guessing

Do not assume specific file locations unless:
- explicitly given by the user
- confirmed by searching the repo

Search first.
Then decide.

Do not silently translate between desired names and real ones.
Examples:
- if the repo has `src/analyse/`, do not pretend it is `src/analysis/`
- if persistence lives in `src/idb/index.ts`, do not invent `src/persistence/` unless you are intentionally extracting it

## `main.ts` rule

Do not add new medium or large feature systems to `src/main.ts`.

`src/main.ts` should be treated as:
- orchestration
- bootstrap
- legacy glue

New logic must go into the correct subsystem/module whenever possible.

If a task would otherwise add substantial logic to `src/main.ts`, first determine:
- which subsystem owns it
- whether a module already exists
- whether a new module should be created

## Subsystem ownership targets

These are target ownership boundaries.
Use them to guide extraction work, but do not misdescribe the current file tree.

- `src/board/`
  - board settings
  - theme/piece/filter logic
  - board orientation logic
  - board-adjacent UI behavior where appropriate

- `src/engine/`
  - UCI protocol integration
  - live analysis
  - review/batch analysis coordination
  - PV parsing
  - engine lifecycle

- `src/analyse/`
  - move list rendering
  - eval graph
  - summary
  - engine lines rendering
  - review-related display logic

- `src/games/`
  - game history / Games tab
  - game filters
  - game-row rendering
  - library-level workflows

- `src/import/`
  - game import
  - import adapters
  - import filtering

- `src/idb/` or a future persistence module
  - IndexedDB
  - serialization
  - restore logic
  - storage versioning

## Refactor-first project status

This project is currently in a refactor phase.

That means:
- no major new feature work should be added casually
- extraction and stabilization take precedence
- new code must respect the current architecture and active priorities
- if a task touches an area scheduled for extraction, prefer the extraction-friendly implementation

When in doubt, do the smaller safer step.

## Refactor execution rules

When doing refactor work:

- extract one subsystem at a time
- do not bundle unrelated redesigns
- do not mix extraction with feature expansion
- preserve behavior
- validate immediately after each step
- update docs after structural changes

Separate:
- extraction tasks
from
- behavior-changing tasks

## Small-task rule

Tasks must stay small and scoped.

Preferred:
- one bug
- one extraction
- one UI parity adjustment
- one workflow improvement

Avoid:
- multi-feature bundles
- broad rewrites
- “while we’re here” additions

Prefer tasks that touch only the minimum necessary files.
If a task expands beyond the smallest safe step, stop and explain why.

## Required pre-implementation output

Before Codex starts any coding, implementation, refactor, or code-review task in this thread, first ask the user this coordination question in chat: is Claude Code currently running, and if so reply with the exact Claude Code prompt; otherwise reply `ready`.

Treat `ready` as the non-conflicting path for docs-only work or when Claude Code is not currently running.

This coordination check applies to Codex in this thread only. Claude Code does not need to ask this question unless the user explicitly requests the same workflow there.

Do not begin repo work until the user has either pasted the Claude Code prompt or replied `ready`.
Use that answer to avoid overlapping file ownership, conflicting edits, or duplicated investigation.

Before coding, provide:

1. what part of the current codebase is relevant
2. what Lichess files/systems are relevant
3. the exact diagnosis
4. the exact small step being implemented
5. why that step is safe and correctly scoped

## Required validation after coding

After implementation, always report:

- build result
- feature-specific smoke tests
- whether behavior changed intentionally
- whether there are console/runtime errors
- any remaining risks or limitations

If validation could not be run, say so explicitly.

## Prompt output rule

When returning a prompt intended for copy/paste into another model or tool, output the prompt inside a single fenced Markdown code block unless the user explicitly asks otherwise.

## Documentation update rules

Update docs only when appropriate and when asked or clearly required by structural change.

When updating docs:

- `docs/KNOWN_ISSUES.md`
  - current real issues only

- `docs/NEXT_STEPS.md`
  - active priorities only

- `docs/ARCHITECTURE.md`
  - actual structure, not idealized structure

- `docs/FUTURE_FUNCTIONALITY.md`
  - future product ideas and longer-range intended capabilities
  - not the active sprint plan or current implementation truth

- `docs/WISHLIST.md`
  - optional quality-of-life ideas and UI wishes
  - reference only, not the active roadmap

- `docs/archive/`
  - completed plans and historical references only

Completed plans should be archived rather than left in the active doc set. Do not treat archived
plans as current roadmap or architecture truth.

Do not overwrite audit history unless explicitly asked.

## Anti-drift rules

Do not:
- invent React-style architecture if the codebase does not use it
- add abstract layers without concrete value
- create non-Lichess-inspired structure for core chess features without justification
- optimize for elegance over repo consistency
- hide uncertainty

If something is unclear, say so explicitly.

## Tone / reasoning standard

Be direct.
Be critical.
Prefer truth over reassurance.

If the current structure is weak, say so.
If the requested approach is risky, say so.
If a safer smaller step is the correct move, say so.

## Final operating rule

Discover first.
Compare to Lichess.
Choose the smallest safe step.
Implement cleanly.
Validate.
Document when necessary.
