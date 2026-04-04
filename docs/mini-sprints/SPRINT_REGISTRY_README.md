# Sprint Registry Workflow

This is the canonical source of truth for sprint tracking workflow in Patzer Pro.

If any other sprint-tracking doc disagrees with this file, this file wins.

Deprecated or removed sprint docs are non-authoritative and must never be followed for current workflow.

## Read This First

If the task involves any of the following:
- sprint creation
- sprint progress tracking
- sprint audits
- sprint dashboard behavior
- linking prompts to sprint tasks
- sprint workflow changes

read this file first, then the relevant sprint process doc.

## Canonical Sprint Docs

- `/Users/leftcoast/Development/PatzerPatzer/docs/mini-sprints/SPRINT_REGISTRY_README.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/mini-sprints/SPRINT_CREATION_PROCESS.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/mini-sprints/SPRINT_PROGRESS_PROCESS.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/mini-sprints/SPRINT_AUDIT_PROCESS.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/PROMPT_USER_GUIDE.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/mini-sprints/SPRINT_USER_GUIDE.md`

Responsibility split:
- `CLAUDE.md` = concise top-level execution brief that tracked prompt bodies point agents to first
- `AGENTS.md` = detailed operating rules and routing table for repo work
- sprint workflow docs in this folder = canonical operational source of truth for sprint creation, seeding, progress, audits, and workflow changes

If `CLAUDE.md` is slimmed down or reorganized, sprint workflow behavior still comes from this canonical sprint doc set plus `AGENTS.md`, not from older expectations about what used to live in `CLAUDE.md`.

## Authority And Ownership

The sprint registry is the structured source of truth for:
- sprint ids
- sprint metadata
- phases and tasks
- normalized sprint structure readiness
- dependencies
- linked audits
- recommended next steps
- dashboard-visible progress structure

It does not replace:
- the sprint markdown doc as the narrative human plan
- the prompt registry as the source of prompt lifecycle truth

Canonical files:
- sprint registry: `/Users/leftcoast/Development/PatzerPatzer/docs/mini-sprints/sprint-registry.json`
- sprint status doc: `/Users/leftcoast/Development/PatzerPatzer/docs/mini-sprints/SPRINT_STATUS.md`

Generated dashboard surface:
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/dashboard.html`

## Hybrid Model

Patzer uses a hybrid sprint model:
- sprint markdown doc = human plan and narrative
- sprint registry = structured progress and linkage data
- prompt registry = execution unit lifecycle

The dashboard reads both registries.

Sprint dashboard prompt panels use a layered model:
- the generated prompt template is canonical
- saved dashboard panel bodies are stored per sprint and per panel under `panelNotes`:
  - `audit`
  - `mismatch`
  - `nextPhase`
  - `appendRequest`
- when a saved body is overwritten, the previous body is archived as a `RETIRED-SPRINT-PANEL-DONOTRUN-REFERENCE-ONLY-<SPRINT_ID>-<PANEL>-V#` entry in the sprint registry
- the active panel note tracks `supersededVersionIds` pointing to those retired entries
- sprint panel editing must never directly mutate sprint phases, tasks, or prompt linkage

## Command Map

- create or register a sprint:
  - `npm run sprint:create -- --title "..." --source-document docs/mini-sprints/FOO.md`
- seed one sprint's phase/task structure after creation:
  - `npm run sprint:seed -- --sprint-id SPR-###`
- backfill sprint registry from sprint docs and the bootstrap audit:
  - `npm run sprint:backfill -- --confirm-overwrite`
- recompute sprint states from linked prompts and latest audit truth:
  - `npm run sprint:recompute`
- complete a sprint audit and update latest audit truth:
  - `npm run sprint:audit:complete -- --sprint-id SPR-### --audit-document docs/audits/FOO.md ...`
- save a sprint dashboard panel body:
  - `npm run sprint:panel-note:set -- --sprint-id SPR-### --panel nextPhase --body "..."`
- clear a saved sprint dashboard panel body:
  - `npm run sprint:panel-note:clear -- --sprint-id SPR-### --panel nextPhase`
- show sprint status in terminal:
  - `npm run sprint:status`
- regenerate sprint status doc, dashboard, and audits:
  - `npm run sprints:refresh`

## Which Doc To Read

- create or register a sprint:
  - `SPRINT_CREATION_PROCESS.md`
- update sprint progress or link prompts:
  - `SPRINT_PROGRESS_PROCESS.md`
- audit sprint implementation:
  - `SPRINT_AUDIT_PROCESS.md`
- ask how to phrase tracked-work requests broadly:
  - `PROMPT_USER_GUIDE.md`
- ask how to phrase sprint-related requests specifically:
  - `SPRINT_USER_GUIDE.md`
- change sprint workflow itself:
  - this file, then every affected sprint process doc

## User Language / Trigger Map

Exact phrasing is not required.

Sprint creation triggers:
- `create a sprint plan`
- `make a sprint for this`
- `turn this into a sprint`

Sprint progress triggers:
- `track this sprint`
- `show sprint progress`
- `link prompts to this sprint`
- `how far are we into this sprint`

Sprint audit triggers:
- `audit this sprint`
- `compare sprint vs implementation`
- `what is actually done`
- `what are the next best steps`

If sprint-related intent is materially ambiguous, the agent must clarify before mutating files.

## Linkage Rule

When prompts are created for sprint work:
- prompt records must link back to the sprint via:
  - `sprintId`
  - `sprintPhaseId`
  - `sprintTaskId`
- prompts for sprint work are invalid unless all three linkage fields are present at creation time

Prompt lifecycle remains owned by the prompt registry.

Sprint progress uses prompt linkage; it does not replace prompt tracking.

Manager-prompt handling:
- child or leaf prompts that implement sprint tasks must carry full sprint linkage
- supervisory manager prompts may remain task-unlinked when they only batch already-linked sprint prompts
- sprint-level review or audit prompts may also remain task-unlinked when they validate the sprint as a whole rather than one task
- task-unlinked supervisory prompts must not be counted as `unassignedPromptIds` sprint debt in the registry or dashboard

## Safe Workflow Path

Normal day-to-day sprint workflow:
1. write a normalized sprint markdown doc
2. run `sprint:create`
3. run `sprint:seed`
4. create sprint-linked prompts with exact sprint ids
5. let `prompt:complete` advance sprint execution truth
6. run `sprint:audit:complete` when you need to correct sprint truth against implementation reality

When using the sprint detail view in the local dashboard:
- every sprint detail must expose editable prompt panels for:
  - sprint audit
  - mismatch follow-up prompt generation, when applicable
  - next-phase prompt generation, when applicable
  - sprint append/update requests
- panels start read-only and require explicit `Edit`
- `Copy` uses the current visible body
- editing opens a `<textarea>` with the current body; locked context lines appear read-only above it
- `Revert to Original` resets the textarea to the original body without leaving edit mode
- `Save` shows a line diff for confirmation before writing; `Decline / Revert` reverts to the original
- `Confirm Save` overwrites the saved sprint panel body and archives the previous version
- `Reset` (during editing) restores the current saved sprint panel body
- previous saved bodies are archived using the `RETIRED-V#` pattern (see archival rules above)
- `lastEditedAt` should be visible when the panel has been edited
- saved sprint panel bodies require the local server (`node server.mjs`) because they write through the dashboard API

Do not use `sprint:backfill` for ordinary sprint work.

`sprint:backfill` is migration/bootstrap tooling only and intentionally requires explicit confirmation because it rebuilds all sprint structure and relinks sprint prompts globally.

## Normalized Sprint Rule

All new sprints must start with normalized phase/task structure in the markdown sprint doc.

If an older sprint is not normalized enough for reliable next-phase prompt generation:
- the dashboard should warn
- the sprint audit process must normalize it
- the sprint is not considered fully aligned with the current sprint workflow until that normalization is done

## Workflow Change Propagation Rule

Any sprint workflow change is incomplete until:
1. the implementation/tooling change is done
2. every affected canonical sprint doc is updated
3. `AGENTS.md` and `CLAUDE.md` are checked and updated if needed
4. prompt docs are updated if prompt linkage behavior changed
5. the final task response explicitly names which agent-facing docs were updated
