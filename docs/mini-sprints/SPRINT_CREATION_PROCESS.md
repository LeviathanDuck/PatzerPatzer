# Sprint Creation Process

Use this file for:
- creating new sprint markdown docs
- registering sprints in the sprint registry
- seeding phases/tasks from sprint docs

Routing note:
- tracked prompt bodies still point agents first to `CLAUDE.md` and `AGENTS.md`
- `CLAUDE.md` is now the concise top-level brief
- `AGENTS.md` contains the fuller operating rules
- this file and the other canonical sprint docs remain the source of truth for the actual sprint-creation workflow

## Standard Creation Flow

For a new sprint:
1. read `SPRINT_REGISTRY_README.md`
2. write or update the sprint markdown doc in `docs/mini-sprints/`
3. ensure the sprint markdown doc already uses normalized phase/task structure
4. register the sprint with `sprint:create`
5. seed that sprint's phase/task structure with `sprint:seed`
6. create sprint-linked prompts with exact sprint ids when implementation work begins
7. run a sprint audit after creation or implementation milestones when you need audit truth refreshed through the audit workflow

## Create / Register

```sh
npm run sprint:create -- --title "Mini Sprint — Example" --source-document docs/mini-sprints/EXAMPLE_SPRINT_2026-04-01.md
```

If a sprint already exists for that source document, `sprint:create` now fails by default.
Use `--update-existing` only when you intentionally want to modify the existing sprint record.

```sh
npm run sprint:create -- --title "Mini Sprint — Example" --source-document docs/mini-sprints/EXAMPLE_SPRINT_2026-04-01.md --update-existing
```

## Seed One Sprint

```sh
npm run sprint:seed -- --sprint-id SPR-###
```

Seed rules:
- parses only the target sprint markdown doc
- rebuilds only that sprint's phase/task structure
- relinks prompts only for that sprint's own source document
- preserves unrelated sprints and unrelated prompt linkage
- refreshes sprint outputs after success

## Global Backfill Structure

```sh
npm run sprint:backfill -- --confirm-overwrite
```

Backfill rules:
- reads every current sprint markdown doc
- seeds the sprint registry using sprint docs plus the 2026-03-30 sprint-vs-implementation audit
- creates sprint, phase, and task records
- links matching prompts through `sourceDocument` and `sourceStep`
- marks whether each sprint is normalized enough for reliable next-phase prompt generation

Use global backfill only for migration/bootstrap or deliberate full-registry rebuild work.
It is not the normal follow-up to creating a new sprint.

## Creation Rules

All new sprint plans must result in both:
- a sprint markdown doc
- a sprint registry entry

All new sprint plans are invalid unless the sprint markdown doc already has normalized top-level phases and tasks.

If the user asks to create prompts for a sprint, those prompt records must link back to sprint ids and sprint task ids during `prompt:create`.

For sprint-linked prompts, exact linkage is required:
- `sprintId`
- `sprintPhaseId`
- `sprintTaskId`
