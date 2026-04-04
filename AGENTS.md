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

For the future openings spaced-repetition feature, use this naming consistently in source-controlled
docs, prompts, comments, and plans:

- canonical feature name: `Opening Repetition Practice`
- short internal alias: `ORP`
- acceptable generic category terms:
  - `opening practice`
  - `repertoire practice`
  - `line repetition`
  - `opening drill flow`

Do not use third-party product names or third-party feature names as in-repo shorthand for this
feature. We are building something distinct, and unique. Not a copy cat

## Decision Lock Rule

Before implementing behavior changes, UI changes, or new features, agents must produce an **Implementation Decision Summary**. 

The summary must include:
- feature description
- scope (UI / behavior / architecture)
- Lichess parity vs intentional deviation
- affected subsystem
- expected files
- behavior changes
- edge cases
- acceptance criteria

Agents must:
- ask clarification questions if any item is unclear
- not invent missing decisions
- confirm decisions with the user before implementation

This rule applies to:
- feature implementation
- UI changes
- behavioral changes
- architectural changes

This rule does **not apply to**:
- docs-only edits
- prompt-only work
- audits with no code changes

## Mandatory workflow for non-trivial implementation tasks

For every non-trivial task, always do this in order:

1. Inspect the current Patzer Pro codebase first
2. Locate the actual implementation points before assuming file paths
3. Inspect the relevant Lichess source before deciding how to implement
4. Compare:
   - how Patzer Pro currently works
   - how Lichess works
   - where they differ
   - detect whether the requested implementation would materially diverge from Lichess behavior,
     flow, terminology, or subsystem shape
   - if that divergence is not already explicitly requested by the user, stop and ask whether the
     divergence is intentional before coding
5. Identify the smallest safe implementation step
6. Explain diagnosis before coding
7. Implement
8. Validate with build + task-specific checks

Never skip steps 1–4 for behavior or architecture work touching core chess features.

Material divergence means differences such as:
- behavior flow
- engine/review interaction
- move-tree behavior
- puzzle/review logic
- board interaction model
- major UI workflow differences
- architecture or subsystem ownership choices that depart from the Lichess reference

Do not interrupt for tiny or clearly local differences such as:
- copy changes
- spacing or purely cosmetic styling
- clearly Patzer-specific features that have no Lichess analog

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

## Prompt execution rule

When a CCP prompt body is received for execution (i.e. a message whose primary content
is a `CCP-###` prompt body), the agent must:

1. Run `npm run prompt:start -- <PROMPT_ID>` before making any code changes
2. Execute the prompt
3. Run `npm run prompt:complete -- <PROMPT_ID> --checklist "..."` after the work is done

This applies even when the prompt is the first message in a thread.
Skipping these commands leaves the prompt stuck at `queued-pending` with no record it ran.

The checklist must contain concrete manual verification steps matching what was implemented.

## Prompt command output rule

Lifecycle commands must NEVER have their output truncated:
- never pipe `prompt:reserve`, `prompt:start`, `prompt:skip`, `prompt:complete`, `prompt:create`,
  `prompt:release`, or `prompt:review` through `head`, `tail`, or any output limiter
- always let the full output run so the allocated ID and refresh results are visible
- if a reserve command output was truncated and the ID is unknown, run
  `npm run prompt:reservations` to find it before proceeding — do not re-run the reserve

Why this is critical: every lifecycle command ends by running `npm run prompts:refresh` as a
subprocess. Piping through `head` sends SIGPIPE when the line limit is reached, which kills the
node process before `prompts:refresh` completes. The registry JSON write happens early and
succeeds, but the dashboard HTML is never regenerated — the dashboard then shows stale state
(e.g., "READY TO RUN" or "STARTED: NOT COMPLETED") even though the underlying registry data is
correct. This is a silent failure with no error message.

Recovery if it happens: run `npm run prompts:refresh` manually with no pipe to fix the dashboard.

## Prompt creation output rule

When creating a prompt, the agent must:
1. State the reserved prompt ID visibly before writing the body
2. Output the Pre-Creation Checklist from `PROMPT_CREATION_PROCESS.md` visibly in the
   response so the user can verify each step was followed
3. After `prompt:create`, verify the created registry record uses the correct prompt taxonomy:
   - `kind`
   - `category`
   and confirm they match the repo's actual dashboard conventions before reporting success

## Claude prompt tracking

Prompt workflow rules are owned by the canonical prompt docs, not by this file.

Role split:
- `CLAUDE.md` is the concise top-level brief
- this file is the detailed operating reference
- the canonical prompt docs own the actual prompt workflow

If the task involves:
- prompt creation
- prompt review
- prompt tracking
- manager prompts
- follow-up fix prompts
- prompt workflow changes

first read:
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/PROMPT_REGISTRY_README.md`

Treat that file as the source of truth for:
- prompt lifecycle
- prompt IDs and task IDs
- parent/child prompt relationships
- queue state
- review state
- prompt metadata and provenance
- prompt taxonomy:
  - `kind`
  - `category`

Do not follow removed, renamed, or superseded prompt-workflow docs just because they are mentioned
elsewhere in the repo. If a referenced prompt doc does not exist, treat it as stale guidance and
fall back to the canonical prompt-registry doc set below.

then read the relevant process doc:
- id reservation / follow-up ids / release:
  - `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/PROMPT_ID_PROCESS.md`
- prompt creation:
  - `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/PROMPT_CREATION_PROCESS.md`
- prompt review / closeout:
  - `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/PROMPT_REVIEW_PROCESS.md`
- manager prompts:
  - `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/PROMPT_MANAGER_PROCESS.md`
- shared user request phrasing / examples:
  - `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/PROMPT_USER_GUIDE.md`

Hard rules:
- deprecated or removed prompt docs are non-authoritative and must not be followed
- do not hand-edit generated prompt artifacts:
  - `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_QUEUE.md`
  - `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_LOG.md`
  - `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_HISTORY.md`
  - `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/dashboard.html`
- the canonical prompt records live in:
  - `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/prompt-registry.json`
  - `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/items/CCP-###.md`
- if the user’s natural language clearly maps to one prompt workflow, follow that workflow even if the user did not use the exact process name
- if prompt-related intent is materially ambiguous, ask a clarifying question before mutating files
- if the user asks to change prompt IDs, prompt creation, prompt review, manager prompts, prompt tracking, or the prompt docs themselves, treat it as a workflow-change request and update the canonical prompt docs before considering the work complete
- if the user says `update our prompt workflow so that ...`, automatically treat that as a full workflow-change request with the workflow-change propagation rule implied by default
- do not assume allocator input labels are the same thing as final registry/dashboard taxonomy; verify the final created prompt record after `prompt:create`
- if the user asks to run multiple tracked prompts in order, sequentially, or one after another, default to the manager-prompt workflow even if the user does not explicitly say `manager`
- only bypass the manager workflow for a multi-prompt request when the user explicitly asks to handle the prompts individually
- when creating a manager prompt, follow the stricter manager-body standard in `PROMPT_MANAGER_PROCESS.md`
- dashboard prompt editing is part of the official prompt workflow:
  - only edit prompts that are still `created` / `queued-pending`
  - keep registry-owned metadata locked
  - treat superseded archived versions as reference-only, never runnable prompts
  - treat skipped prompts as non-runnable queue removals; if a prompt is skipped it must never be treated as available to run

Tracked Prompt Gate:
- before ANY code change — regardless of size — first determine whether the work is already covered by an existing `CCP-###` prompt
- if it is not already tracked, stop and ask whether the work should be handled as a tracked prompt before making code changes
- tracked prompts are the default for all code work
- untracked code work is allowed only when the user explicitly opts out
- "small" or "trivial" changes are NOT exceptions — a one-line change still requires the gate check
- the gate resets for every distinct user request, even within the same conversation session
- the existing CCP prompt exception is scope-limited: it only covers work explicitly described in that prompt — a new or different request in the same session is a new gate check
- this gate does not apply to docs-only work, prompt-only work, or reviews/audits with no code mutation

## Sprint tracking

Sprint workflow rules are owned by the canonical sprint docs, not by this file.

Role split:
- `CLAUDE.md` is the concise top-level brief
- this file is the detailed operating reference
- the canonical sprint docs own the actual sprint workflow

If the task involves:
- sprint creation
- sprint tracking
- sprint progress reporting
- sprint audits
- sprint dashboard work
- prompt-to-sprint linkage
- sprint workflow changes

first read:
- `/Users/leftcoast/Development/PatzerPatzer/docs/mini-sprints/SPRINT_REGISTRY_README.md`

then read the relevant process doc:
- sprint creation / registration:
  - `/Users/leftcoast/Development/PatzerPatzer/docs/mini-sprints/SPRINT_CREATION_PROCESS.md`
- sprint progress / task state / dashboard rollups:
  - `/Users/leftcoast/Development/PatzerPatzer/docs/mini-sprints/SPRINT_PROGRESS_PROCESS.md`
- sprint audits / next-best-step updates:
  - `/Users/leftcoast/Development/PatzerPatzer/docs/mini-sprints/SPRINT_AUDIT_PROCESS.md`
- shared user request phrasing / examples:
  - `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/PROMPT_USER_GUIDE.md`
- sprint-specific phrasing supplement:
  - `/Users/leftcoast/Development/PatzerPatzer/docs/mini-sprints/SPRINT_USER_GUIDE.md`

Hard rules:
- if the user asks to create a sprint plan, create or update both the sprint markdown doc and the sprint registry entry, and treat new sprint plans as invalid unless the sprint markdown doc already has normalized phase/task structure
- the normal sprint creation path is: normalized sprint markdown doc -> `sprint:create` -> `sprint:seed`; do not use global `sprint:backfill` for ordinary new-sprint work
- `sprint:backfill` is migration/bootstrap tooling only and must not be used without its explicit overwrite confirmation
- if the user asks to create prompts for a sprint, prompt records must include exact `sprintId`, `sprintPhaseId`, and `sprintTaskId` linkage at creation time
- if the user asks to review or audit a sprint, use the sprint registry first, then cross-check linked prompts, audits, and code evidence
- sprint detail prompt panels are operational workflow surfaces, not decorative UI:
  - `Copy` uses the current edited textarea contents
  - `Save` persists the current sprint panel body and archives the previous saved version
  - sprint append/update requests from the dashboard must remain agent-mediated and must not directly mutate sprint structure from the UI
- if the user asks to change sprint creation, sprint tracking, sprint audits, sprint dashboard behavior, or sprint docs, treat it as a sprint-workflow change request and update the canonical sprint docs before considering the work complete

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

Hard gate rules:

- for any non-trivial implementation, refactor, or review task, the first assistant message must be only the coordination question
- the coordination question must be sent as a normal visible assistant chat message, not as commentary, a collapsible work update, or any other minimized UI surface
- do not hide the coordination question inside a progress update, multi-part message, or tool summary
- do not run tools, inspect files, review code, or edit the repo before the user answers
- if the user answers anything other than the active Claude Code prompt or `ready`, remain blocked and ask again clearly
- after the user answers, then continue with the normal diagnosis / implementation / review workflow

Before coding, provide:

1. what part of the current codebase is relevant
2. what Lichess files/systems are relevant
3. the exact diagnosis
4. the exact small step being implemented
5. why that step is safe and correctly scoped

## Required validation after coding

After implementation, always run BOTH:

1. `npm run build` — confirms esbuild bundling succeeds
2. `npx tsc --noEmit` — confirms full TypeScript type-checking passes

Both must pass. esbuild does NOT type-check, so a passing build does NOT mean the code is type-safe. Shipping code that passes `npm run build` but fails `npx tsc --noEmit` is a known failure mode that has caused cascading issues across multiple sprints (see `docs/audits/SPRINT_VS_IMPLEMENTATION_AUDIT_2026-03-30.md`).

After both pass, report:

- build result AND typecheck result
- feature-specific smoke tests
- whether behavior changed intentionally
- whether there are console/runtime errors
- any remaining risks or limitations

If validation could not be run, say so explicitly.

## Manual verification checklist requirement

Manual checklist rules are owned by:
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/PROMPT_REVIEW_PROCESS.md`

Do not redefine checklist requirements in this file. Follow the canonical review process doc.

## Fix prompts — linking back to the original reviewed prompt

Fix-prompt linkage rules are owned by:
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/PROMPT_REVIEW_PROCESS.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/PROMPT_CREATION_PROCESS.md`

Use those docs for `--fixes`, follow-up relationships, and review-driven rework flow.

## Setting fixPromptSuggestion during review

`fixPromptSuggestion` behavior is owned by:
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/PROMPT_REVIEW_PROCESS.md`

Do not redefine it here. Follow the canonical review process doc.

## Wiring validation rule

When implementing a new function, service, or data path, verify that it is actually called from at least one live code path. Shipping implemented-but-never-called code is dead code. The audit found multiple instances of functions that were fully implemented but never wired into the runtime (cloud sync, lifecycle hooks, IDB writes). Before marking a task complete, grep for at least one call site outside the defining file.

## Cross-module consistency check

When a task touches persistence (IDB database names, store names, server endpoints), verify that ALL modules referencing that persistence layer use the same identifiers. The audit found a DB name mismatch (`patzer-puzzle-db` vs `patzer-puzzle-v1`) that silently broke sync for weeks.

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

## Doc line item dating rule (MANDATORY)

Any time a new item is added to any tracking doc — or any doc that functions as a running log of
issues, ideas, or action items — that item **must include the date it was added**. This is
automatic. Do not skip it.

Tracked docs:
- `docs/KNOWN_ISSUES.md`
- `docs/NEXT_STEPS.md`
- `docs/FUTURE_FUNCTIONALITY.md`
- `docs/WISHLIST.md`

Format by doc type:

- **KNOWN_ISSUES.md** — entries use `## [SEVERITY] Title` headers; add `_Logged: YYYY-MM-DD_`
  on the line immediately after the header, before the body text
- **WISHLIST.md** — bullet items; add `_(YYYY-MM-DD)_` immediately after the `- [ ]` or `- [x]`
  marker, before the item text
- **NEXT_STEPS.md** — numbered section entries; add `_(added: YYYY-MM-DD)_` after the
  section heading
- **FUTURE_FUNCTIONALITY.md** — bullet items; add `_(YYYY-MM-DD)_` immediately after the `-`
  bullet marker, before the item text

Use the current date from the session context (`currentDate`). Never guess or cache a date.

This rule triggers automatically whenever the user says any of the following (or similar):
- "log a bug"
- "log a known issue"
- "add to the wishlist"
- "add a next step"
- "note this down"
- "add to future functionality"
- "record this"
- "jot this down"

An item added without a date is an incomplete entry.

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
