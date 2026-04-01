# Prompt Registry Workflow

This is the canonical source of truth for prompt workflow in Patzer Pro.

If any other prompt doc disagrees with this file, this file wins.

Deprecated or removed prompt docs are non-authoritative and must never be followed for current work.

## Read This First

If the task involves any of the following:
- prompt creation
- prompt review
- prompt tracking
- manager prompts
- follow-up fix prompts
- prompt workflow changes

read this file first, then the relevant process doc.

## Canonical Prompt Docs

- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/PROMPT_REGISTRY_README.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/PROMPT_ID_PROCESS.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/PROMPT_CREATION_PROCESS.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/PROMPT_REVIEW_PROCESS.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/PROMPT_MANAGER_PROCESS.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/PROMPT_USER_GUIDE.md`

## Authority And Ownership

The prompt registry is prompt-only.

It owns:
- prompt lifecycle
- prompt IDs and task IDs
- prompt parent/child relationships
- review state
- queue state
- prompt metadata and provenance
- prompt taxonomy fields:
  - `kind`
  - `category`
- optional sprint linkage metadata on prompt records:
  - `sprintId`
  - `sprintPhaseId`
  - `sprintTaskId`

It does not own:
- sprint rollups
- sprint phase progress
- sprint analytics
- non-prompt planning systems

Canonical files:
- registry: `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/prompt-registry.json`
- prompt bodies: `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/items/CCP-###.md`

Generated files:
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_QUEUE.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_LOG.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_HISTORY.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/dashboard.html`

Do not hand-edit generated files.

## Lifecycle Summary

## Prompt Taxonomy

Prompt records use two separate classification fields:

- `kind`
  - structural prompt type
  - examples:
    - `normal`
    - `fix`
    - `follow-up`
    - `manager`
- `category`
  - work category / product meaning
  - examples:
    - `bugfix`
    - `feature`
    - `research`
    - `manager`
    - `wiring`

Critical rule:
- do not treat allocator input labels as if they were automatically the final dashboard taxonomy
- `kind` and `category` are not interchangeable
- when in doubt, inspect a known-good existing prompt record before claiming a new prompt is classified correctly

Canonical examples:
- root implementation prompt for a bug:
  - `kind: normal`
  - `category: bugfix`
- direct post-review bug-fix prompt:
  - `kind: fix`
  - `category: bugfix`
- follow-up prompt fixing an earlier prompt:
  - `kind: follow-up`
  - `category` should still reflect the work category such as `bugfix` or `feature`
- manager prompt:
  - `kind: manager`
  - `category: manager` or another explicit category when intentionally differentiated

Post-create verification rule:
- after `prompt:create`, inspect the new registry record and confirm both `kind` and `category`
  match the intended taxonomy and at least one known-good comparable prompt
- if the taxonomy is wrong, correct the registry metadata and regenerate prompt artifacts before
  reporting the prompt as successfully created

Prompt states:
- `reserved`
- `created`
- `reviewed`

Queue states:
- `not-queued`
- `queued-pending`
- `queued-started`
- `queued-run`

Normal lifecycle:
1. reserve id
2. write prompt body
3. finalize prompt record (`prompt:create`) → `status: created`, `queueState: queued-pending`
4. start execution (`prompt:start`) → `queueState: queued-started`
5. execute the prompt work
6. complete prompt (`prompt:complete`) → `queueState: queued-run`
7. review prompt (`prompt:review`) → `status: reviewed`

Execution rule:
- `prompt:start` must be called before any code changes begin
- `prompt:complete` must be called after the work is done, with a concrete manual checklist
- if errors or issues were encountered, `prompt:complete` must be called with `--errors "description"` — this sets `status--run-errors` in the dashboard so the problem is visible
- using the clean `prompt:complete` when there were known issues silently hides the error state — do not do this
- skipping steps 4 or 6 leaves the prompt stuck at `queued-pending` with no execution record
- this applies even when a prompt is delivered as the first message in a conversation

## Command Map

- reserve root prompt:
  - `npm run prompt:reserve -- --title "..." --kind feature --created-by Codex`
- reserve follow-up prompt:
  - `npm run prompt:reserve-followup -- CCP-123 --parent-prompt-id CCP-123 --created-by Codex`
- finalize reserved prompt:
  - `npm run prompt:create -- <PROMPT_ID> --prompt-file docs/prompts/items/<PROMPT_ID>.md --title "..." --task "..." --source-document "..." [--sprint-id SPR-### --sprint-phase-id SPR-###-P# --sprint-task-id SPR-###-T#]`
- list reservations:
  - `npm run prompt:reservations`
- release reservation:
  - `npm run prompt:release -- <PROMPT_ID> --note "reason"`
- start prompt:
  - `npm run prompt:start -- <PROMPT_ID>`
- complete prompt (clean):
  - `npm run prompt:complete -- <PROMPT_ID> --checklist "..."`
- complete prompt (with errors):
  - `npm run prompt:complete -- <PROMPT_ID> --errors "brief description" --checklist "..."`
- review prompt:
  - `npm run prompt:review -- <PROMPT_ID> ...`
- regenerate docs and audit:
  - `npm run prompts:refresh`

Important command interpretation note:
- allocator flags such as `--kind feature` or `--kind manager` are part of the reservation flow
- they do not by themselves guarantee that the final created prompt will use the correct dashboard
  taxonomy without verification
- the final registry record is the source of truth; always verify it after `prompt:create`

## Which Doc To Read

- reserve, release, allocator, `-F#`:
  - `PROMPT_ID_PROCESS.md`
- create a new prompt:
  - `PROMPT_CREATION_PROCESS.md`
- create a follow-up fix prompt:
  - `PROMPT_ID_PROCESS.md`
  - `PROMPT_CREATION_PROCESS.md`
- execute a prompt (start + complete lifecycle):
  - `PROMPT_REVIEW_PROCESS.md` (see Completion section)
- review / close out prompt work:
  - `PROMPT_REVIEW_PROCESS.md`
- create or reason about manager prompts:
  - `PROMPT_MANAGER_PROCESS.md`
- ask how to phrase requests:
  - `PROMPT_USER_GUIDE.md`
- change the workflow itself:
  - this file, then every affected process doc

## User Language / Trigger Map

Exact phrasing is not required.

Examples below are representative, not exhaustive. If intent is reasonably clear, the
agent must follow the matching workflow automatically. If intent is materially ambiguous
or spans multiple workflows, the agent must clarify before mutating files.

Prompt creation triggers:
- `create a prompt`
- `write a prompt`
- `design a prompt`
- `queue this`
- `add this to the queue`
- `make a prompt for Claude`

Prompt review triggers:
- `review CCP-###`
- `review this prompt`
- `did this get done`
- `verify this task`
- `check this prompt`

Follow-up fix triggers:
- `fix this prompt`
- `follow up on this task`
- `there is a bug from CCP-###`
- `create a fix prompt`

Manager prompt triggers:
- `create a manager`
- `make a batch manager`
- `run these prompts in order`
- `create a prompt to run all of these`

Workflow change triggers:
- `update our prompt process`
- `change how prompt ids work`
- `simplify the prompt workflow`
- `change the review process`
- `change the manager process`
- `change how prompts are tracked`

Hard-wired interpretation rule:
- if the user says `update our prompt workflow so that ...`, the agent must automatically treat that as a full workflow-change request
- the workflow-change propagation rule is implied by default for that phrasing and does not need to be restated by the user
- the same default applies to close variants such as:
  - `update our prompt process so that ...`
  - `change our prompt workflow so that ...`
  - `change how prompts are tracked so that ...`

Workflow change guarantee:
- when the user asks to change `our process`, `the prompt workflow`, `the review process`, or `how prompts are tracked`, the agent must treat that as a full workflow-change request
- that means reading every canonical prompt workflow doc plus `AGENTS.md` and `CLAUDE.md` before making changes
- if the user wants to make that explicit, they can say:
  - `follow the workflow-change propagation rule`
  - `check every canonical prompt doc`
  - `update the whole prompt process, not just one file`

## Tracked Prompt Gate

Tracked prompts are the default for all code work.

Before ANY code change — regardless of size — the agent must determine whether the work
is already covered by an existing tracked CCP prompt.

If it is not already covered, the agent must stop and ask whether the work should be
handled as a tracked prompt before code changes begin.

Code work may begin only if one of these is true:
1. the work is explicitly covered by an existing CCP prompt's stated scope
2. a new tracked prompt has been created for it
3. the user explicitly says the work should be untracked

Key rules:
- "small" or "trivial" changes are NOT exceptions — a one-line change still requires the gate check
- the gate resets for every distinct user request, even within the same conversation session
- the existing CCP prompt exception is scope-limited: it only covers work explicitly described
  in that prompt — a new or different request in the same session is a new gate check

This gate applies to:
- bug fixes
- new features
- refactors
- behavior changes
- follow-up fixes

This gate does not apply to:
- docs-only work
- prompt-only work
- reviews or audits with no code mutation

## Glossary

- `Prompt ID`
  - the unique prompt instance id, for example `CCP-123` or `CCP-123-F1`
- `Task ID`
  - the root family id for the task
- `root prompt`
  - the first prompt in a task family, for example `CCP-123`
- `follow-up fix`
  - a prompt in the same task family using the next `-F#` id
- `manager prompt`
  - a tracked runner/controller prompt that orchestrates child prompts
- `reserved`
  - id allocated, prompt not yet finalized for execution
- `created`
  - finalized prompt record ready for execution or review workflow
- `reviewed`
  - prompt review closed out

## Templates Vs Workflow

Template docs may help shape prompt contents, but they do not define workflow.

That means docs like:
- `bugfix.md`
- `new-feature.md`
- `refactor-step.md`
- `lichess-parity.md`

are optional templates/reference only. They do not define ID allocation, queueing, review,
or registry mutation rules.

## Workflow Change Propagation Rule

Any prompt workflow change is incomplete until:
1. the implementation or tooling change is done
2. every file in the canonical file list below has been read and assessed
3. every file that contains relevant content has been updated — not just the ones that seem obviously affected
4. `AGENTS.md` and `CLAUDE.md` are checked for duplicate sections — both copies must be updated
5. deprecated or removed docs are not left conflicting with the new rules
6. the final task response explicitly lists every file that was checked and every file that was changed

Canonical file list — every one of these must be read on every workflow change:
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/PROMPT_REGISTRY_README.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/PROMPT_ID_PROCESS.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/PROMPT_CREATION_PROCESS.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/PROMPT_REVIEW_PROCESS.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/PROMPT_MANAGER_PROCESS.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/PROMPT_USER_GUIDE.md`
- `/Users/leftcoast/Development/PatzerPatzer/AGENTS.md`
- `/Users/leftcoast/Development/PatzerPatzer/CLAUDE.md`

Structural changes — if the change affects prompt body format or required sections:
- every canonical doc above must be updated, not just the ones that seem relevant
- the prompt body template in `PROMPT_CREATION_PROCESS.md` is the source of truth for body format
- `PROMPT_MANAGER_PROCESS.md` must always be checked when body format changes, since manager bodies follow the same format rules
- `CLAUDE.md` must be checked for duplicate rule sections — if a rule appears more than once, all copies must be updated
- `AGENTS.md` must always be checked and updated alongside `CLAUDE.md` — both files give agents their operating rules and must stay in sync with each other
