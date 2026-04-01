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
- `/Users/leftcoast/Development/PatzerPatzer/docs/mini-sprints/SPRINT_USER_GUIDE.md`

## Authority And Ownership

The sprint registry is the structured source of truth for:
- sprint ids
- sprint metadata
- phases and tasks
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

## Command Map

- create or register a sprint:
  - `npm run sprint:create -- --title "..." --source-document docs/mini-sprints/FOO.md`
- backfill sprint registry from sprint docs and the bootstrap audit:
  - `npm run sprint:backfill`
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
- ask how to phrase sprint-related requests:
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

Prompt lifecycle remains owned by the prompt registry.

Sprint progress uses prompt linkage; it does not replace prompt tracking.

## Workflow Change Propagation Rule

Any sprint workflow change is incomplete until:
1. the implementation/tooling change is done
2. every affected canonical sprint doc is updated
3. `AGENTS.md` and `CLAUDE.md` are checked and updated if needed
4. prompt docs are updated if prompt linkage behavior changed
5. the final task response explicitly names which agent-facing docs were updated
