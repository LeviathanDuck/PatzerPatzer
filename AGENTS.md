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
