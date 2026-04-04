# Sprint Progress Process

Use this file for:
- tracking how far a sprint has really landed
- linking prompts to sprint tasks
- understanding plan coverage, execution progress, and audit reality

## Progress Model

The sprint dashboard shows three separate layers:

1. Plan coverage
- how many sprint tasks exist
- how many of those tasks have linked prompts

2. Execution progress
- derived from linked prompt lifecycle:
  - `No Prompt Exists Yet`
  - `Prompts Created`
  - `In Progress`
  - `Prompt Complete`
  - `Not Ready Yet`

3. Audit / implementation reality
- latest-audit-managed sprint truth in the sprint registry:
  - `Audit Found Mismatch`
  - `Audit Confirmed Done`

Phase rollups:
- `Incomplete Start State`
- `In Progress`
- `Completed`
- `Completed: Issues Found`
- `Completed: Review Passed`

Sprint rollups (derived from prompt/audit lifecycle):
- `Needs Prompts`
- `Ready to Start`
- `In Progress`
- `Completed Needs Full Review`
- `Completed: With Issues`
- `Completed: Reviews Passed`

Terminal statuses (manually set, never overwritten by recompute):
- `Superseded` — sprint scope was absorbed into a successor sprint. The original sprint's
  work is continued elsewhere. Set `supersededBy` on the sprint record to point to the
  successor sprint ID. Remaining mismatch tasks are expected to be addressed by the
  successor, not by follow-up prompts on this sprint.
- `Retired` — sprint is intentionally abandoned. The planned work is no longer wanted or
  relevant. Use this when priorities have shifted, the feature direction changed, or the
  sprint was exploratory and the decision is to not proceed. Partially-completed work
  remains in the codebase but no further prompts will be generated for this sprint.

## Setting Terminal Statuses

To supersede a sprint (its scope moves to a successor):

```sh
# Manually edit the sprint's status in sprint-registry.json:
#   "status": "Superseded"
#   "supersededBy": "SPR-###"    (the successor sprint ID)
# Then recompute:
npm run sprint:recompute
```

To retire a sprint (work is no longer wanted):

```sh
# Manually edit the sprint's status in sprint-registry.json:
#   "status": "Retired"
#   "retiredReason": "brief explanation"
# Then recompute:
npm run sprint:recompute
```

Terminal statuses suppress all action panels on the dashboard (audit, mismatch follow-up,
next-phase prompts). They are never overwritten by `sprint:recompute`.

## Linking Prompt Work

When creating prompts for a sprint task, exact sprint linkage is required at creation time.

Finalize them with:
- `--sprint-id`
- `--sprint-phase-id`
- `--sprint-task-id`

Example:

```sh
npm run prompt:create -- CCP-999 --prompt-file docs/prompts/items/CCP-999.md --title "..." --task "..." --source-document "docs/mini-sprints/EXAMPLE_SPRINT_2026-04-01.md" --sprint-id SPR-001 --sprint-phase-id SPR-001-P1 --sprint-task-id SPR-001-T01
```

## Command And Status Vocabulary

Keep these vocabularies separate:

- `sprint:create`
  - accepts stored sprint status values like `planned`
  - creates or updates the sprint shell only
- `sprint:seed`
  - derives phase/task structure for one sprint
  - does not invent audit outcomes
- `sprint:audit:complete`
  - accepts task outcomes only:
    - `Audit Confirmed Done`
    - `Audit Found Mismatch`
- `sprint:status` and the dashboard
  - show the derived human-readable task/phase/sprint labels documented in this file

## Refresh

Prompt lifecycle changes affect sprint progress visibility.

Current refresh behavior:
- `prompt:complete` recomputes sprint state and regenerates shared outputs
- `prompt:complete` advances execution truth only; it does not resolve `Audit Found Mismatch`
- `sprint:audit:complete` recomputes sprint state and regenerates shared outputs
- dashboard generation reads the current prompt registry plus sprint registry contract

Manual commands:

```sh
npm run sprint:recompute
npm run sprints:refresh
npm run sprint:status
```

or any prompt command that already runs the shared refresh path.

## Editable Sprint Prompt Panels

In the sprint detail view, every prompt-generation surface is an editable working box:
- `Sprint Audit Prompt`
- `Generate Fix Prompts For Current Problems` when mismatch tasks exist
- `Generate Next Prompts For Planned Work` when the next available phase still needs prompts
- `Request Sprint Update` always

Panel behavior:
- panels start read-only and require explicit `Edit`
- `Copy` uses the current visible panel body
- editing opens a `<textarea>` with the current body; locked context lines appear read-only above it
- `Revert to Original` resets the textarea to the original body without leaving edit mode
- `Cancel` warns before discarding unsaved edits
- `Save` shows a line diff for confirmation before writing; `Decline / Revert` reverts to the original
- `Confirm Save` overwrites the saved panel body and archives the previous version
- `Reset` (during editing) restores the current saved panel body
- `Clear Saved Note` removes the saved panel body and falls back to the generated default
- edited panels show `lastEditedAt`

Panel note persistence rules:
- sprint panel bodies are stored in the sprint registry under `panelNotes`
- valid panel ids are:
  - `audit`
  - `mismatch`
  - `nextPhase`
  - `appendRequest`
- when a saved body is overwritten, the previous body is archived as a `RETIRED-SPRINT-PANEL-DONOTRUN-REFERENCE-ONLY-<SPRINT_ID>-<PANEL>-V#` entry
- the active panel note tracks `supersededVersionIds` pointing to those retired entries
- panel editing must never directly change sprint structure or prompt linkage
- dashboard panel saving requires the local server because it writes through `/api/sprint-panel-note`

CLI equivalents:

```sh
npm run sprint:panel-note:set -- --sprint-id SPR-### --panel audit --body "Updated panel body here"
npm run sprint:panel-note:clear -- --sprint-id SPR-### --panel audit
```

## Audit Truth Update

When a sprint audit finishes, update latest audit truth with:

```sh
npm run sprint:audit:complete -- --sprint-id SPR-### --audit-document docs/audits/FOO.md --task-outcomes "SPR-###-T01:Audit Confirmed Done|SPR-###-T02:Audit Found Mismatch"
```

Use `--normalized yes` when the audit also confirms the sprint now matches the current normalized sprint workflow.

Important:
- follow-up prompts can resolve the underlying implementation work
- but only a later sprint audit should promote a task from `Audit Found Mismatch` to `Audit Confirmed Done`
