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
  - planned
  - prompt-created
  - started
  - completed
  - reviewed-passed
  - reviewed-with-notes
  - issues-found

3. Audit / implementation reality
- structured task status in the sprint registry:
  - planned
  - not-started
  - implementation-partial
  - implemented
  - verified
  - broken
  - blocked
  - deferred

## Linking Prompt Work

When creating prompts for a sprint task, finalize them with:
- `--sprint-id`
- `--sprint-phase-id`
- `--sprint-task-id`

Example:

```sh
npm run prompt:create -- CCP-999 --prompt-file docs/prompts/items/CCP-999.md --title "..." --task "..." --source-document "docs/mini-sprints/EXAMPLE_SPRINT_2026-04-01.md" --sprint-id SPR-001 --sprint-phase-id SPR-001-P1 --sprint-task-id SPR-001-T01
```

## Refresh

Prompt lifecycle changes affect sprint progress visibility.

Use:

```sh
npm run sprints:refresh
```

or any prompt command that already runs the shared refresh path.
