# Sprint Audit Process

Use this file when auditing sprint implementation and progress.

## Required Comparison Inputs

Every sprint audit must compare:
- the sprint markdown doc
- the sprint registry entry
- linked prompts in `docs/prompts/prompt-registry.json`
- linked prompt review outcomes
- actual implementation evidence in the codebase
- linked audits
- unresolved issues and follow-up prompts

## Required Audit Outputs

Every sprint audit must produce:
- sprint status by phase/task
- prompt coverage gaps
- implementation vs plan gaps
- reviewed-but-broken findings
- unreviewed execution risk
- exact next-best-step recommendations
- dashboard-ready recommendation items

## Hard Rule

Sprint audits must update the sprint registry, not only a prose audit doc.

Prose audit docs remain valuable, but the sprint registry must receive:
- updated sprint/task statuses
- linked audit references
- recommended next steps
- completion summary updates when appropriate

## Audit Completion Command

After an audit determines explicit task outcomes, update sprint truth with:

```sh
npm run sprint:audit:complete -- --sprint-id SPR-### --audit-document docs/audits/FOO.md --title "Sprint audit" --completion-summary "..." --findings "3 tasks confirmed done, 1 mismatch: T04 partial implementation found" --task-outcomes "SPR-###-T01:Audit Confirmed Done|SPR-###-T02:Audit Found Mismatch"
```

Use `--normalized yes` when the audit also confirms the sprint doc now matches the current normalized sprint workflow.

Rules:
- `--audit-document` must point to an existing audit doc before the command runs
- audit refs are stored as repo-relative paths, not absolute filesystem paths
- `--findings` is a freeform text summary of what the audit found; stored on the audit ref and displayed in the sprint detail view when the audit row is expanded
- `--task-outcomes` may only use:
  - `Audit Confirmed Done`
  - `Audit Found Mismatch`
- `Audit Confirmed Done` requires confirmed implementation evidence in the codebase — a completed or reviewed prompt is not sufficient on its own
- A task with implementation evidence of **Partial** or **Not started** MUST be `Audit Found Mismatch`; the only exception is an intentional deferral to a future sprint, which must be stated explicitly in the audit doc with a reason

This command must be followed by dashboard regeneration through the script itself. The latest completed audit becomes the manager of audit truth for that sprint.

## Mismatch Auto-Clear on Refresh

When the dashboard refresh button is clicked, `sprint:recompute` runs automatically. As part of recompute, any task with `auditState: "Audit Found Mismatch"` will have that state **automatically cleared** if all its linked prompts have been reviewed and passed.

This means:
- The mismatch panel updates on refresh once follow-up work is reviewed — no new audit required
- The signal is prompt review (not just completion) — running a prompt is not sufficient evidence
- Clearing only happens on `reviewed-passed` or `reviewed-with-notes` execution state
- A new audit is still needed to **add** new mismatches or **confirm** tasks as done with implementation evidence

## Audit Log in the Sprint Detail View

Every completed audit is appended to the sprint's `auditRefs` array in the registry. The sprint detail panel in the dashboard shows an **Audits** section listing every audit ever run for that sprint.

Each audit row shows (collapsed):
- audit title and status badge
- type · date · source document · findings excerpt

Clicking a row expands it to show:
- full source document path
- audit ID, type, status, date
- task outcomes as labeled pills (green = confirmed done, red = mismatch)
- full findings text if `--findings` was passed

This provides a permanent timestamped record of what each audit found, visible inline without opening the audit doc.

## Terminal Sprints

Sprints with status `Superseded` or `Retired` do not require auditing. Their action panels
(audit, mismatch follow-up, next-phase prompts) are suppressed on the dashboard. If an audit
is run anyway, the terminal status is preserved — `sprint:recompute` will not overwrite it.

## Normalization Requirement

Every sprint audit must also check whether the sprint markdown doc is normalized to the current sprint workflow.

If not:
- record that mismatch in the audit
- normalize the sprint doc and registry structure
- only then treat next-phase prompt generation as reliable

## Mismatch Follow-up Panel

When a sprint has tasks with `Audit Found Mismatch`, the dashboard automatically shows a
**"Unfinished Work — Follow-up Prompts Needed"** panel. This panel:

- Lists each mismatch task with its real name, gap description, and previously-linked prompts
- Provides a **"Copy Follow-up Prompt"** button that puts agent-ready language in the clipboard
- The copied prompt instructs an agent to create one tracked follow-up prompt per mismatch task
  with proper sprint linkage

This panel appears and disappears automatically based on audit state — no manual configuration needed.
When mismatch work has been implemented, run a later sprint audit to decide whether those tasks now
qualify for `Audit Confirmed Done`. The panel disappears only after audit truth changes.

## Bootstrap Audit

Use `/Users/leftcoast/Development/PatzerPatzer/docs/audits/SPRINT_VS_IMPLEMENTATION_AUDIT_2026-03-30.md`
as the initial backfill baseline for current sprints.

After backfill, it remains a time-stamped audit artifact, not the live status store.
