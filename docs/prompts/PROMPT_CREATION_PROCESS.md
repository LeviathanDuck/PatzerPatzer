# Prompt Creation Process

Use this file for:
- creating normal runnable prompts
- creating follow-up fix prompts
- creating manager prompts as tracked artifacts

## Pre-Creation Checklist (must be output visibly before writing any prompt body)

Before writing a prompt body, the agent must output this checklist in the response so the
user can verify each step was followed:

```
- [ ] Read PROMPT_REGISTRY_README.md before starting
- [ ] Read PROMPT_CREATION_PROCESS.md before starting
- [ ] Reserved the prompt ID using the allocator command (not computed manually)
- [ ] Confirmed the reserved ID from the FULL command output (no truncation)
- [ ] Stated the reserved ID to the user before writing the body
- [ ] Prompt body begins with the "Read and follow" header
- [ ] Prompt body includes a ## Lifecycle section with prompt:start and prompt:complete (both variants)
- [ ] Checklist items in ## Lifecycle match the Validation section
- [ ] Verified the created registry entry uses the correct `kind` and `category`
```

This checklist must appear in the agent's response — not silently assumed. If any item
cannot be checked, the agent must stop and resolve it before continuing.

## Standard Creation Flow

For a new root prompt:
1. output the Pre-Creation Checklist
2. read `PROMPT_REGISTRY_README.md` and `PROMPT_CREATION_PROCESS.md`
3. reserve the id — run the full command output, do not truncate
4. state the reserved ID to the user before writing the body
5. write the prompt body file in `docs/prompts/items/`
6. finalize the reserved record with `prompt:create`
7. inspect the created registry entry and verify `kind` + `category`
8. run `npm run prompts:refresh` if the finalize step did not already do it

## Root Prompt Flow

Reserve:

```sh
npm run prompt:reserve -- --title "Short title" --kind feature --created-by Codex
```

Finalize:

```sh
npm run prompt:create -- <PROMPT_ID> --prompt-file docs/prompts/items/<PROMPT_ID>.md --title "Short title" --task "..." --source-document "..."
```

If the prompt belongs to a sprint task, include the sprint linkage fields during finalize:

```sh
npm run prompt:create -- <PROMPT_ID> --prompt-file docs/prompts/items/<PROMPT_ID>.md --title "Short title" --task "..." --source-document "..." --sprint-id SPR-### --sprint-phase-id SPR-###-P# --sprint-task-id SPR-###-T#
```

Default for normal runnable prompts:
- `status: created`
- `reviewOutcome: pending`
- `queueState: queued-pending`

Taxonomy rule:
- `kind` is the structural type, not the human work label
- `category` is the work label
- common root prompt mapping:
  - bug fix work:
    - `kind: normal`
    - `category: bugfix`
  - feature work:
    - `kind: normal`
    - `category: feature`
  - research/audit work:
    - `kind: normal`
    - `category: research`
- do not assume allocator wording automatically maps to final dashboard taxonomy
- after `prompt:create`, verify the new record in `docs/prompts/prompt-registry.json`

## Follow-Up Fix Flow

Use a follow-up prompt when fixing or refining an existing tracked task family.

Reserve:

```sh
npm run prompt:reserve-followup -- <ROOT_TASK_ID> --parent-prompt-id <PROMPT_BEING_FIXED> --created-by Codex
```

Then write the prompt body and finalize with `prompt:create`.

Follow-up rules:
- `Prompt ID` uses the next `-F#`
- `Task ID` stays on the root family
- `parentPromptId` points to the prompt being fixed
- typical taxonomy:
  - `kind: follow-up`
  - `category` reflects the actual work type, for example `bugfix`

## Manager Prompt Flow

Manager prompts are tracked artifacts, not normal queued implementation prompts by default.

Reserve:

```sh
npm run prompt:reserve -- --title "Short title" --kind manager --created-by Codex
```

Finalize with:
- exact `batchPromptIds`
- `kind: manager`
- `queueState: not-queued` unless the user explicitly asks for queued manager prompts
- verify the created record also uses the intended manager category semantics after finalize

## Required Prompt Body Header

Every prompt body must begin with the following two lines before any other content:

```md
Read and follow:
- `/Users/leftcoast/Development/PatzerPatzer/CLAUDE.md`
- `/Users/leftcoast/Development/PatzerPatzer/AGENTS.md`
```

This is not optional. It ensures the executor reads the project rules before making any changes.

## Lifecycle Section (required in every prompt body)

Every prompt body must include a `## Lifecycle` section with the exact commands to run
before and after execution. This section must be written at creation time, using the
reserved prompt ID.

Standard format:

```md
## Lifecycle

Before making any changes, mark this prompt as started:
\```sh
npm run prompt:start -- CCP-###
\```

After all work is complete, mark it as done:
\```sh
npm run prompt:complete -- CCP-### --checklist "- [ ] checklist item one|- [ ] checklist item two"
\```

If errors or issues were encountered during execution, use `--errors` instead:
\```sh
npm run prompt:complete -- CCP-### --errors "brief description of what went wrong" --checklist "- [ ] checklist item one|- [ ] checklist item two"
\```
```

Rules:
- the checklist items must be concrete manual verification steps matching the prompt's validation section
- this section is not optional — a prompt body without it is incomplete
- the executor must run these commands; skipping them leaves the prompt stuck at `queued-pending`
- if anything went wrong during execution — partial failure, incorrect diagnosis, unresolved issues — the executor must use `--errors` so the status reflects `status--run-errors` in the dashboard
- do not use the clean `prompt:complete` if there were known issues; that silently hides the error state

## Creation Rules

All created prompts must:
- use the tracking system
- write prompt bodies under `docs/prompts/items/`
- begin with the "Read and follow" header (CLAUDE.md + AGENTS.md)
- include a `## Lifecycle` section with pre-filled `prompt:start` and `prompt:complete` commands
- use registry-first mutation
- verify final taxonomy fields in the created registry entry:
  - `kind`
  - `category`
- include `--sprint-id`, `--sprint-phase-id`, and `--sprint-task-id` when the prompt belongs to sprint work
- not hand-edit generated queue/log/history docs

Tracked code work is the default.

If the user requests code work and there is no existing CCP prompt yet, the agent must
stop and ask whether this should be handled as a tracked prompt unless the user explicitly
asked for untracked work.
