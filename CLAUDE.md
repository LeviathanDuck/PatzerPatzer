# Patzer Pro — Claude Development Guide

## Project Overview

**Patzer Pro** — hosted at **PatzerPro.com**

A web app for analyzing personal chess games and generating targeted practice puzzles.

Core goals:
- Import batches of user games
- Analyze them in bulk with an engine
- Use analysis board to study the game afterwards
- Extract puzzles for deliberate practice

Reference future-facing product ideas in:
- `docs/FUTURE_FUNCTIONALITY.md`
- `docs/WISHLIST.md`
- `docs/reference/lichess-retrospection/README.md`
- `docs/reference/lichess-retrospection-ux/README.md`
- `docs/reference/lichess-puzzle-ux/README.md`

Use those files as reference context only. Do not treat them as a substitute for the current
codebase, current architecture docs, or active near-term priorities. In particular, wishlist items
are not automatic next steps and must be checked for safety and ordering before implementation.

This is a **multi-tool platform**:
- Game Analysis
- Puzzles
- Opening Trainer
- Stats Dashboard

## Terminology

In Patzer Pro, `Game Review` means the Review-button workflow for a selected game:

- Stockfish analyzes the game
- the analysis is displayed in the analysis board
- the resulting review data may be stored locally for later use by related tools

This is Patzer Pro's term for the Lichess `Request Computer Analysis` / computer-analysis flow.

The app shell, navigation, and routing are tool-agnostic from day one.

---

## Core Philosophy

Patzer Pro exists to **replicate Lichess functionality and behavior as closely as possible**.

This is not a "design a modern app" project.

It is a **faithful adaptation of Lichess concepts, behavior, and architecture**, implemented in a way that is practical for this project.

---

## Core Implementation Rule
## Task Scope Rule (CRITICAL)

Claude must only implement ONE small task at a time.

Constraints:
- Touch a maximum of 1–3 files per task
- Do NOT bundle multiple features together
- Do NOT refactor unrelated code
- Do NOT "improve" adjacent systems

If the requested task is too large:
- Break it into smaller steps
- Implement only the first step


## Pre-Implementation Checklist (MANDATORY)

Before writing any code, Claude must:

1. Locate relevant Lichess source files in:
   ~/Development/lichess-source/lila

2. Identify:
   - which files implement this feature
   - what logic is reusable vs tightly coupled

3. Confirm:
   - this task fits within 1–3 files
   - whether the requested implementation would materially diverge from Lichess behavior, flow,
     terminology, or subsystem shape

If the requested implementation appears to materially diverge from Lichess and the user has not
already explicitly asked for that divergence, Claude must stop and ask whether the divergence is
intentional before coding.

Material divergence includes things like:
- behavior flow changes
- engine/review interaction changes
- move-tree behavior changes
- puzzle/review logic changes
- board interaction model changes
- major UI workflow differences
- architecture or module-boundary choices that depart from the Lichess reference

This confirmation step is not required for:
- copy changes
- purely cosmetic styling
- minor spacing/layout polish
- clearly Patzer-specific additions with no Lichess analog


## Anti-Drift Rule

Claude must NOT:

- redesign UX that already exists in Lichess
- simplify core systems
- introduce new architecture patterns
- replace Lichess patterns with abstractions

## Terminology Clarification Rule

If the user uses unclear or incorrect terminology:

Claude must:
- identify closest Lichess concept
- ask for clarification before implementing


## Prompt Compliance Rule

Claude must:
- follow instructions exactly
- not add extra features

## Prompt Execution Rule

When Claude receives a CCP prompt to execute (i.e. a message whose primary content is a
`CCP-###` prompt body), Claude must:

1. Run `npm run prompt:start -- <PROMPT_ID>` before making any code changes
2. Execute the prompt
3. Run `npm run prompt:complete -- <PROMPT_ID> --checklist "..."` after the work is done

This applies even when the prompt is delivered as the first message in a conversation.
Forgetting to call these commands leaves the prompt stuck at `queued-pending` with no
record that it was ever run.

The checklist passed to `prompt:complete` must contain concrete manual verification steps
matching what was implemented, not generic placeholders.

## Prompt Command Output Rule

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

## Prompt Creation Output Rule

When creating a prompt, Claude must:
1. State the reserved prompt ID to the user before writing the body
2. Output the Pre-Creation Checklist from `PROMPT_CREATION_PROCESS.md` visibly in the
   response so the user can verify each step was followed
3. After `prompt:create`, verify the created registry record uses the correct prompt taxonomy:
   - `kind`
   - `category`
   and confirm they match the repo's actual dashboard conventions before reporting success

## Prompt Tracking Rule

Prompt workflow rules are owned by the canonical prompt docs and AGENTS.md, not by this file.

Role split:
- this file is the concise top-level brief
- `AGENTS.md` contains the fuller operating rules and routing details
- the canonical prompt docs own the actual prompt workflow

When the task involves prompt creation, prompt review, prompt tracking, manager prompts,
follow-up fix prompts, or prompt workflow changes — Claude must first read:
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/PROMPT_REGISTRY_README.md`

Then read the matching process doc (see AGENTS.md for the full routing table and hard rules).

For manager prompts specifically, Claude must follow the stricter manager-body standard in
`PROMPT_MANAGER_PROCESS.md`.

Tracked Prompt Gate:
- before ANY code change — regardless of size — Claude must determine whether the work is already covered by an existing `CCP-###` prompt
- if it is not already tracked, Claude must stop and ask whether the work should be handled as a tracked prompt before making code changes
- tracked prompts are the default for all code work
- untracked code work is allowed only when the user explicitly opts out
- "small" or "trivial" changes are NOT exceptions — a one-line change still requires the gate check
- the gate resets for every distinct user request, even within the same conversation session
- the existing CCP prompt exception is scope-limited: it only covers work explicitly described in that prompt — a new or different request in the same session is a new gate check
- this gate does not apply to docs-only work, prompt-only work, or reviews/audits with no code mutation

## Sprint Tracking Rule

Sprint workflow rules are owned by the canonical sprint docs and AGENTS.md, not by this file.

Role split:
- this file is the concise top-level brief
- `AGENTS.md` contains the fuller operating rules and routing details
- the canonical sprint docs own the actual sprint workflow

When the task involves sprint creation, sprint tracking, sprint progress, sprint audits,
sprint dashboard work, prompt-to-sprint linkage, or sprint workflow changes — Claude must first read:
- `/Users/leftcoast/Development/PatzerPatzer/docs/mini-sprints/SPRINT_REGISTRY_README.md`

Then read the matching process doc (see AGENTS.md for the full routing table and hard rules).

## Stop Condition

Claude must stop if:
- task exceeds 3 files
- unclear requirements
- no Lichess reference

Claude should treat the Lichess source code as the **primary source of truth**.

Priority order:

1. Reuse or closely adapt Lichess-origin code, patterns, and behavior
2. Reuse Lichess ecosystem libraries (especially Chessground)
3. Adapt Lichess patterns into this project's stack when necessary
4. Only invent new systems when no Lichess reference exists

Claude should **not redesign features that already exist in Lichess**.

## Retrospection / Puzzle Research Rule

For retrospection, puzzle extraction, or Learn From Your Mistakes work, follow the
Retrospection and puzzle-generation rule in AGENTS.md. The reference docs in
`docs/reference/lichess-retrospection*/` and `docs/reference/lichess-puzzle-ux/` are mandatory.

---

## Navigation Structure

Persistent top navigation.

Routes:
- /
- /analysis
- /analysis/:gameId
- /puzzles
- /puzzles/:setId
- /openings
- /stats
- /admin

---

## Development Workflow

- Small incremental changes only
- No large rewrites unless requested
- Preserve git history
- Developer commits manually

Workflow:
1. Claude writes/modifies code
2. Developer tests locally
3. Developer reviews via git diff
4. Developer commits
5. Developer pushes

## Definition of Done

A task is complete when:
- feature works in browser
- matches Lichess behavior
- meets acceptance criteria


## Bug Fix Protocol

When fixing bugs:
1. Identify expected behavior
2. Compare with current
3. Fix root issue only

---

## File Discipline Rule

Claude must:
- only modify files relevant to the current task
- not create new files unless one of the following applies:
  - the task explicitly requires a new module
  - the code clearly belongs in a new subsystem file (following Lichess module structure)
  - a new `ctrl.ts` or `view.ts` is needed for a new tool being built

Claude must NOT create new files to:
- split code that belongs together
- add abstraction layers not present in Lichess
- work around the 1–3 file limit by creating throwaway helpers

---

## UI States

Every tool must support:
- loading
- empty
- error
- ready

---

## Mobile Behavior

UI must adapt to mobile similar to Lichess.

---

## Open Source / License Rule

This project intentionally reuses Lichess-compatible concepts.

Requirements:
- preserve license notices where required (AGPL-3.0 for Lichess-derived code)
- track reused/adapted code
- do NOT copy branding or logos
- keep Patzer Pro branding original

If code is directly adapted:
- note it in a comment: `// Adapted from lichess-org/lila: <path>`

---

## Documentation

All research and notes live in:
`/docs`

Claude should consult these when relevant.

## Doc Line Item Dating Rule (MANDATORY)

Any time a new item is added to any of the following tracking docs — or any other doc that
functions as a running log of issues, ideas, or action items — that item **must include the date
it was added**. This is automatic. Do not skip it.

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

## Goal

Patzer Pro should feel like:

"A personal Lichess-style analysis and training environment built around your own games."

Claude should optimize for:
- fidelity to Lichess behavior
- functional correctness
- incremental progress

NOT:
- modern UI trends
- unnecessary abstraction
- reinventing solved problems
