# Sprint Creation Process

Use this file for:
- creating new sprint markdown docs
- registering sprints in the sprint registry
- backfilling phases/tasks from sprint docs

## Standard Creation Flow

For a new sprint:
1. read `SPRINT_REGISTRY_README.md`
2. write or update the sprint markdown doc in `docs/mini-sprints/`
3. register the sprint with `sprint:create`
4. run `sprint:backfill` to populate phases/tasks from the markdown doc
5. run `sprints:refresh` if the mutation step did not already do it

## Create / Register

```sh
npm run sprint:create -- --title "Mini Sprint — Example" --source-document docs/mini-sprints/EXAMPLE_SPRINT_2026-04-01.md
```

## Backfill Structure

```sh
npm run sprint:backfill
```

Backfill rules:
- reads every current sprint markdown doc
- seeds the sprint registry using sprint docs plus the 2026-03-30 sprint-vs-implementation audit
- creates sprint, phase, and task records
- links matching prompts through `sourceDocument` and `sourceStep`

## Creation Rules

All new sprint plans must result in both:
- a sprint markdown doc
- a sprint registry entry

If the user asks to create prompts for a sprint, those prompt records must link back to sprint ids and sprint task ids during `prompt:create`.
