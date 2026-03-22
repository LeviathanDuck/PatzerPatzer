# Claude Prompt History

Use this file to archive the full text of Claude Code prompts generated from Codex for Patzer Pro work.

## How to use it

- Add one entry per generated Claude prompt.
- Use the same stable identifier as `CLAUDE_PROMPT_LOG.md`.
- For follow-up fix prompts, use the same root task family id plus a `-F#` prompt modifier, such as `CCP-013-F1`.
- Create the history entry at the same time the prompt is generated.
- Keep the full prompt text in a plain fenced code block with no language tag so it can be reused or audited later.
- When a prompt id is reviewed against actual Claude Code work, update the entry heading so it explicitly says `Used in Claude Code`.
- After review, add a short metadata update under the heading with:
  - review date, if known
  - review outcome
  - commit hash, if known
  - short review note
- If the reviewed task id is known but the exact original prompt text is unavailable, create a minimal placeholder entry and say that the original prompt text was not recovered.

## Template

Use this entry shape:

## CCP-### — Created

- Task: short task title
- Task ID: `CCP-###`
- Parent prompt ID: none
- Source document: `docs/...`
- Source step: `Priority X, Item Y` or equivalent section label
- Status: created
- Review outcome: pending
- Commit: unknown
- Notes: none

Follow the metadata with the full Claude prompt in its own plain fenced block:

```
full Claude prompt goes here
```

## History

## CCP-095 — Created

- Task: add a repo-safe ignored local dataset workspace for raw Lichess puzzle downloads and generated shard output
- Task ID: `CCP-095`
- Parent prompt ID: none
- Source document: `docs/mini-sprints/LICHESS_PUZZLE_DATABASE_INTEGRATION_SPRINT_2026-03-21.md`
- Source step: `Task 1 — Establish a repo-safe local dataset workspace`
- Status: created
- Review outcome: pending
- Commit: unknown
- Notes: none

```
Prompt ID: CCP-095
Task ID: CCP-095
Source Document: docs/mini-sprints/LICHESS_PUZZLE_DATABASE_INTEGRATION_SPRINT_2026-03-21.md
Source Step: Task 1 — Establish a repo-safe local dataset workspace
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same repo-config / build / dataset-path files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step toward Lichess puzzle-dataset integration by adding a repo-safe ignored local dataset workspace for raw downloads, preprocessing work files, and generated public shard output.

Inspect first:
- Patzer: `.gitignore`, `package.json`, `build.mjs`, `server.mjs`, current `src/puzzles/*`
- Official source context: confirm the current official Lichess puzzle export details from [database.lichess.org](https://database.lichess.org/)

Constraints:
- scope this to workspace/ignore/guardrail setup only
- do not add the downloader or preprocessing pipeline in this task
- do not commit or vendor any large external data
- keep the generated-output path compatible with the current static `public/` server model

Recommended safe direction to verify first:
- ignore a local raw-data path such as `data/lichess/raw/`
- ignore a local work path such as `data/lichess/work/`
- ignore a generated serve-able path such as `public/generated/lichess-puzzles/`
- add a short repo note if needed so future sessions know raw/exported Lichess data is local-only

Deliverables:
- diagnosis before coding
- exact small step being implemented
- why that step is safely scoped
- implementation
- validation
- short manual test checklist

Validation:
- run the most relevant config/documentation check you can
- report Prompt ID, Task ID, intentional behavior change, runtime/console status, and remaining risks
```

## CCP-096 — Created

- Task: add an explicit script to fetch the official `lichess_db_puzzle.csv.zst` export into the local dataset workspace
- Task ID: `CCP-096`
- Parent prompt ID: none
- Source document: `docs/mini-sprints/LICHESS_PUZZLE_DATABASE_INTEGRATION_SPRINT_2026-03-21.md`
- Source step: `Task 2 — Add an official Lichess puzzle download script`
- Status: created
- Review outcome: pending
- Commit: unknown
- Notes: none

```
Prompt ID: CCP-096
Task ID: CCP-096
Source Document: docs/mini-sprints/LICHESS_PUZZLE_DATABASE_INTEGRATION_SPRINT_2026-03-21.md
Source Step: Task 2 — Add an official Lichess puzzle download script
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same scripts / package metadata / dataset-path files.
- If overlapping work exists, stop and report it before editing.

Task: add an explicit script to download the official `lichess_db_puzzle.csv.zst` export into the local ignored dataset workspace, without tying the download to `npm run build`.

Inspect first:
- Patzer: `package.json`, `build.mjs`, current `scripts/`, `.gitignore`
- Official source: confirm the current puzzle export path and schema from [database.lichess.org](https://database.lichess.org/)

Constraints:
- scope this to the downloader only
- do not add preprocessing or page integration in this task
- do not hook the download into normal frontend build flow
- prefer a dedicated script such as `scripts/puzzles/download-lichess-puzzles.mjs`
- if checksum or metadata capture is practical, keep it minimal and local

Deliverables:
- diagnosis before coding
- exact small step being implemented
- why that step is safely scoped
- implementation
- validation
- short manual test checklist

Validation:
- run the most relevant script-level check you can without forcing a giant download if unnecessary
- report Prompt ID, Task ID, script behavior, runtime/console status, and remaining risks
```

## CCP-097 — Created

- Task: convert the official export into Patzer-friendly generated manifest and shard files instead of loading raw CSV in the browser
- Task ID: `CCP-097`
- Parent prompt ID: none
- Source document: `docs/mini-sprints/LICHESS_PUZZLE_DATABASE_INTEGRATION_SPRINT_2026-03-21.md`
- Source step: `Task 3 — Add a streaming preprocessing pipeline to Patzer shard format`
- Status: created
- Review outcome: pending
- Commit: unknown
- Notes: none

```
Prompt ID: CCP-097
Task ID: CCP-097
Source Document: docs/mini-sprints/LICHESS_PUZZLE_DATABASE_INTEGRATION_SPRINT_2026-03-21.md
Source Step: Task 3 — Add a streaming preprocessing pipeline to Patzer shard format
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same dataset scripts / generated-output paths / puzzle-type files.
- If overlapping work exists, stop and report it before editing.

Task: add the smallest safe preprocessing pipeline that converts the official Lichess puzzle export into Patzer-friendly generated manifest and shard files for the current static app.

Inspect first:
- Patzer: `server.mjs`, `package.json`, current `scripts/`, current `src/puzzles/*`
- Official source: confirm the current CSV fields from [database.lichess.org](https://database.lichess.org/)
- Lichess reference context: inspect the local puzzle data/runtime references that are relevant to how imported records will later be consumed

Constraints:
- scope this to preprocessing only
- do not load raw CSV in the browser
- do not bundle page UI work
- prefer a streaming approach
- if `.zst` decompression requires a tool or dependency, choose the smallest honest path and explain it
- output should be generated into a serve-able ignored path under `public/generated/lichess-puzzles/`

Recommended output shape to evaluate:
- `manifest.json`
- fixed-size shard files with only the fields Patzer needs initially
- optional dev/sample limit support if it helps validation safely

Deliverables:
- diagnosis before coding
- exact small step being implemented
- why that step is safely scoped
- implementation
- validation
- short manual test checklist

Validation:
- run the most relevant script-level check you can
- report Prompt ID, Task ID, generated output shape, runtime/console status, and remaining risks
```

## CCP-098 — Created

- Task: add Patzer-owned imported-puzzle types and a loader that adapts generated Lichess shards into the app’s puzzle model
- Task ID: `CCP-098`
- Parent prompt ID: none
- Source document: `docs/mini-sprints/LICHESS_PUZZLE_DATABASE_INTEGRATION_SPRINT_2026-03-21.md`
- Source step: `Task 4 — Add imported Lichess puzzle types and loader seams`
- Status: created
- Review outcome: pending
- Commit: unknown
- Notes: none

```
Prompt ID: CCP-098
Task ID: CCP-098
Source Document: docs/mini-sprints/LICHESS_PUZZLE_DATABASE_INTEGRATION_SPRINT_2026-03-21.md
Source Step: Task 4 — Add imported Lichess puzzle types and loader seams
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle types / loader / manifest files.
- If overlapping work exists, stop and report it before editing.

Task: add Patzer-owned imported-puzzle types plus a loader seam that reads generated Lichess manifest/shard data and adapts imported rows into the app’s puzzle model.

Inspect first:
- Patzer: current `src/puzzles/*`, `src/tree/types.ts`, `src/idb/index.ts` if relevant
- Lichess: inspect the local puzzle runtime references that matter for puzzle-data shape and round consumption
- Dataset context: generated manifest/shard output from the previous task

Constraints:
- scope this to types and loader ownership
- do not build page UI in this task
- do not silently overload the local saved-puzzle type if a distinct imported type is cleaner
- if the real puzzle route/controller seam from `CCP-083` through `CCP-091` is not present yet, stop and report the dependency gap rather than inventing a parallel path

Deliverables:
- diagnosis before coding
- exact small step being implemented
- why that step is safely scoped
- implementation
- validation
- short manual test checklist

Validation:
- run `npm run build`
- report Prompt ID, Task ID, loader behavior, runtime/console status, and remaining risks
```

## CCP-099 — Created

- Task: let the puzzles page switch between local saved puzzles and imported Lichess puzzles
- Task ID: `CCP-099`
- Parent prompt ID: none
- Source document: `docs/mini-sprints/LICHESS_PUZZLE_DATABASE_INTEGRATION_SPRINT_2026-03-21.md`
- Source step: `Task 5 — Add a puzzle-source switch and imported library surface`
- Status: created
- Review outcome: pending
- Commit: unknown
- Notes: none

```
Prompt ID: CCP-099
Task ID: CCP-099
Source Document: docs/mini-sprints/LICHESS_PUZZLE_DATABASE_INTEGRATION_SPRINT_2026-03-21.md
Source Step: Task 5 — Add a puzzle-source switch and imported library surface
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle page / puzzle view / library files.
- If overlapping work exists, stop and report it before editing.

Task: add the smallest honest page-level switch between Patzer local saved puzzles and imported Lichess puzzles, and render a first imported-library surface from the generated shard data.

Inspect first:
- Patzer: current `src/puzzles/*`, `src/main.ts`, `src/idb/index.ts`, any current puzzle route/view files
- Lichess: inspect the local puzzle page/view references that matter for library presentation and source separation

Constraints:
- scope this to the source switch and imported library surface
- do not bundle solve-loop integration in this task
- keep local saved puzzles and imported Lichess puzzles visually and structurally distinct
- do not invent non-existent Lichess metadata fields
- if the real puzzle route/controller seam from `CCP-083` through `CCP-091` is not present yet, stop and report the dependency gap

Deliverables:
- diagnosis before coding
- exact small step being implemented
- why that step is safely scoped
- implementation
- validation
- short manual test checklist

Validation:
- run `npm run build`
- report Prompt ID, Task ID, imported-library behavior, runtime/console status, and remaining risks
```

## CCP-100 — Created

- Task: open imported Lichess puzzle records inside Patzer’s own puzzle controller and board flow
- Task ID: `CCP-100`
- Parent prompt ID: none
- Source document: `docs/mini-sprints/LICHESS_PUZZLE_DATABASE_INTEGRATION_SPRINT_2026-03-21.md`
- Source step: `Task 6 — Open imported Lichess puzzles in Patzer’s own puzzle controller`
- Status: created
- Review outcome: pending
- Commit: unknown
- Notes: none

```
Prompt ID: CCP-100
Task ID: CCP-100
Source Document: docs/mini-sprints/LICHESS_PUZZLE_DATABASE_INTEGRATION_SPRINT_2026-03-21.md
Source Step: Task 6 — Open imported Lichess puzzles in Patzer’s own puzzle controller
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle controller / board / imported-loader files.
- If overlapping work exists, stop and report it before editing.

Task: wire imported Lichess puzzle records into Patzer’s own puzzle controller and board flow so imported rows open as real playable rounds instead of as a separate product path.

Inspect first:
- Patzer: current `src/puzzles/*`, `src/board/index.ts`, any real puzzle controller/view seam that exists by then
- Lichess: inspect the local puzzle solve-loop references that matter for move-sequence consumption

Constraints:
- scope this to opening imported rounds in the existing Patzer puzzle flow
- do not rebuild the puzzle controller for imported data
- do not start public-dataset filter work here
- if the imported loader or real puzzle controller seams are not present yet, stop and report the dependency gap

Deliverables:
- diagnosis before coding
- exact small step being implemented
- why that step is safely scoped
- implementation
- validation
- short manual test checklist

Validation:
- run `npm run build`
- report Prompt ID, Task ID, imported-round behavior, runtime/console status, and remaining risks
```

## CCP-101 — Created

- Task: add basic rating, theme, and opening filters plus lazy shard paging for the imported Lichess library
- Task ID: `CCP-101`
- Parent prompt ID: none
- Source document: `docs/mini-sprints/LICHESS_PUZZLE_DATABASE_INTEGRATION_SPRINT_2026-03-21.md`
- Source step: `Task 7 — Add basic filters and lazy paging for imported puzzles`
- Status: created
- Review outcome: pending
- Commit: unknown
- Notes: none

```
Prompt ID: CCP-101
Task ID: CCP-101
Source Document: docs/mini-sprints/LICHESS_PUZZLE_DATABASE_INTEGRATION_SPRINT_2026-03-21.md
Source Step: Task 7 — Add basic filters and lazy paging for imported puzzles
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same imported-library / filter / paging files.
- If overlapping work exists, stop and report it before editing.

Task: add the smallest useful filter and lazy-paging layer for the imported Lichess puzzle library so the page stays usable without trying to load the whole imported dataset at once.

Inspect first:
- Patzer: current imported-library page files, loader files, and any generated-manifest assumptions
- Lichess: inspect the local puzzle product references for filter semantics where relevant

Constraints:
- scope this to imported-library usability
- start with rating, themes, and opening tags only if the generated data genuinely supports them
- prefer lazy shard paging over eager full-library loading
- do not bundle extra product modes or dashboard work

Deliverables:
- diagnosis before coding
- exact small step being implemented
- why that step is safely scoped
- implementation
- validation
- short manual test checklist

Validation:
- run `npm run build`
- report Prompt ID, Task ID, filter/paging behavior, runtime/console status, and remaining risks
```

## CCP-083 — Created

- Task: establish a real puzzle module seam and route surface so `#/puzzles` no longer depends on placeholder logic in `src/main.ts`
- Task ID: `CCP-083`
- Parent prompt ID: none
- Source document: `docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md`
- Source step: `Task 1 — Establish real puzzle module ownership and route surface`
- Status: created
- Review outcome: pending
- Commit: unknown
- Notes: none

```
Prompt ID: CCP-083
Task ID: CCP-083
Source Document: docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md
Source Step: Task 1 — Establish real puzzle module ownership and route surface
Execution Target: Claude Code

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle / routing / main-shell files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: take the first smallest safe step toward a real puzzles page by creating an owned puzzle module seam and routing `#/puzzles` through it instead of keeping puzzle-page behavior as placeholder logic inside `src/main.ts`.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - how Patzer currently routes and renders the puzzles page
   - what puzzle-specific ownership Lichess gives its puzzle controller/view layer
   - what the smallest safe Patzer ownership seam is today
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- Keep this scoped to ownership and route surface only.
- Do not implement the solve loop, feedback UI, or public-dataset ingestion in this task.
- Do not bundle broad analysis-page cleanup.
- Do not add substantial new puzzle logic to `src/main.ts`.

Relevant current code areas to inspect first:
- `src/main.ts`
- `src/router.ts`
- `src/puzzles/extract.ts`
- `src/idb/index.ts`

Relevant Lichess source to inspect first:
- `~/Development/lichess-source/lila/ui/puzzle/src/ctrl.ts`
- `~/Development/lichess-source/lila/ui/puzzle/src/view/main.ts`

Current audit-grounded diagnosis to confirm first:
- Patzer already has puzzle extraction and persistence, but no real puzzle page owner.
- `#/puzzles` is still effectively a placeholder route.
- Lichess treats puzzles as a dedicated controller/view subsystem, not as analysis-page residue.

Likely safe direction:
- create a real Patzer-owned seam in `src/puzzles/` such as `ctrl.ts` / `view.ts` or the closest equivalent that fits the current repo
- route `#/puzzles` through that seam
- keep the first rendered surface intentionally minimal

What I want from you:
- first provide the required pre-implementation output:
  1. relevant Patzer Pro files
  2. relevant Lichess files
  3. exact diagnosis
  4. exact small step to implement
  5. why that step is safely scoped
- then implement the change
- then validate it

Validation requirements:
- run `npm run build`
- run the most relevant task-specific check you can
- provide a short manual test checklist with concrete user actions and expected results
- explicitly report:
  - Prompt ID
  - Task ID
  - build result
  - feature-specific smoke tests
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks or limitations
```

## CCP-084 — Created

- Task: introduce a Patzer-owned puzzle-round model and a compatibility seam from persisted `PuzzleCandidate` records
- Task ID: `CCP-084`
- Parent prompt ID: none
- Source document: `docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md`
- Source step: `Task 2 — Introduce a richer puzzle round model without breaking saved candidates`
- Status: created
- Review outcome: pending
- Commit: unknown
- Notes: none

```
Prompt ID: CCP-084
Task ID: CCP-084
Source Document: docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md
Source Step: Task 2 — Introduce a richer puzzle round model without breaking saved candidates
Execution Target: Claude Code

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle-type / tree-type / IDB files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: introduce a Patzer-owned puzzle-round model and a compatibility seam from persisted `PuzzleCandidate` records, without breaking existing saved-puzzle data or bundling route/UI work.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - what Patzer currently stores in `PuzzleCandidate`
   - what Lichess puzzle data and move-tree structures actually require
   - what the smallest safe Patzer round model is for the next puzzle steps
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- Keep this scoped to types / conversion / persistence compatibility.
- Do not implement puzzle solving UI in this task.
- Do not redesign the entire IDB layer.
- Do not overload `src/tree/types.ts` with large puzzle-only behavior if a `src/puzzles/` type owner is cleaner.

Relevant current code areas to inspect first:
- `src/tree/types.ts`
- `src/puzzles/extract.ts`
- `src/idb/index.ts`
- any new `src/puzzles/*` files created by the previous task

Relevant Lichess source to inspect first:
- `~/Development/lichess-source/lila/ui/puzzle/src/interfaces.ts`
- `~/Development/lichess-source/lila/ui/puzzle/src/moveTree.ts`

Current audit-grounded diagnosis to confirm first:
- `PuzzleCandidate` is enough for extraction and save actions, but not enough for a full puzzle round.
- Patzer needs a dedicated puzzle-round model before controller, validation, and session work can land cleanly.

Likely safe direction:
- add `src/puzzles/types.ts` or the closest equivalent
- keep `PuzzleCandidate` compatibility explicit
- add a small conversion seam from saved candidates into the richer round shape

What I want from you:
- first provide the required pre-implementation output:
  1. relevant Patzer Pro files
  2. relevant Lichess files
  3. exact diagnosis
  4. exact small step to implement
  5. why that step is safely scoped
- then implement the change
- then validate it

Validation requirements:
- run `npm run build`
- run the most relevant task-specific check you can
- provide a short manual test checklist with concrete user actions and expected results
- explicitly report:
  - Prompt ID
  - Task ID
  - build result
  - type / persistence compatibility results
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks or limitations
```

## CCP-085 — Created

- Task: replace the placeholder puzzles page with a real saved-puzzle library view backed by current local IDB state
- Task ID: `CCP-085`
- Parent prompt ID: none
- Source document: `docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md`
- Source step: `Task 3 — Replace the placeholder puzzles route with a saved-puzzle library view`
- Status: created
- Review outcome: pending
- Commit: unknown
- Notes: none

```
Prompt ID: CCP-085
Task ID: CCP-085
Source Document: docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md
Source Step: Task 3 — Replace the placeholder puzzles route with a saved-puzzle library view
Execution Target: Claude Code

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle route / puzzle view / IDB-backed library files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: replace the placeholder puzzles page with a real saved-puzzle library view backed by current local IDB state, while keeping the page focused on browsing rather than full round solving.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - how Patzer currently stores and exposes saved puzzles
   - how Lichess puzzle pages present a puzzle-focused entry surface
   - what the smallest honest saved-puzzle library surface is for Patzer now
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- Keep this scoped to the saved-puzzle library page.
- Do not implement the full round solve loop in this task.
- Do not invent fake rating / theme / popularity metadata Patzer does not own.
- Do not pull in the public Lichess puzzle database.

Relevant current code areas to inspect first:
- `src/main.ts`
- `src/idb/index.ts`
- `src/puzzles/extract.ts`
- current `src/puzzles/*` module files

Relevant Lichess source to inspect first:
- `~/Development/lichess-source/lila/ui/puzzle/src/view/main.ts`
- `~/Development/lichess-source/lila/ui/puzzle/src/view/side.ts`

Current audit-grounded diagnosis to confirm first:
- Patzer already persists saved puzzles locally.
- The user still cannot browse those puzzles on a real page.
- The smallest valuable next step is a local library surface, not public catalog expansion.

Likely safe direction:
- render a list of saved puzzles on `#/puzzles`
- show honest local metadata such as source game, move context, and loss severity where available
- prepare a clean selection seam for the later round controller

What I want from you:
- first provide the required pre-implementation output:
  1. relevant Patzer Pro files
  2. relevant Lichess files
  3. exact diagnosis
  4. exact small step to implement
  5. why that step is safely scoped
- then implement the change
- then validate it

Validation requirements:
- run `npm run build`
- run the most relevant task-specific check you can
- provide a short manual test checklist with concrete user actions and expected results
- explicitly report:
  - Prompt ID
  - Task ID
  - build result
  - saved-puzzle library behavior
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks or limitations
```

## CCP-086 — Created

- Task: create a dedicated minimal puzzle round controller that owns active puzzle state, phase, and solution progress
- Task ID: `CCP-086`
- Parent prompt ID: none
- Source document: `docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md`
- Source step: `Task 4 — Add a minimal puzzle round controller`
- Status: created
- Review outcome: pending
- Commit: unknown
- Notes: none

```
Prompt ID: CCP-086
Task ID: CCP-086
Source Document: docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md
Source Step: Task 4 — Add a minimal puzzle round controller
Execution Target: Claude Code

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle controller / board integration / route-selection files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: create a dedicated minimal puzzle round controller that owns active puzzle state, phase, and solution progress before the full solve loop is wired into the board.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - how Patzer currently owns analysis and retrospection session state
   - how Lichess `PuzzleCtrl` owns round state separately from generic board rendering
   - what the smallest clean Patzer controller seam is
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- Keep this scoped to controller ownership and minimal state only.
- Do not yet wire full move validation or scripted replies.
- Do not reimplement the entire retrospection controller.
- Do not add substantial puzzle state logic to `src/main.ts`.

Relevant current code areas to inspect first:
- `src/analyse/ctrl.ts`
- `src/analyse/retroCtrl.ts`
- current `src/puzzles/*` files
- `src/board/index.ts` only as needed to avoid future coupling mistakes

Relevant Lichess source to inspect first:
- `~/Development/lichess-source/lila/ui/puzzle/src/ctrl.ts`
- `~/Development/lichess-source/lila/ui/puzzle/src/interfaces.ts`

Current audit-grounded diagnosis to confirm first:
- Patzer has puzzle-adjacent data but no puzzle-specific controller.
- Without that controller, validation, feedback, and session state would leak into unrelated modules.

Likely safe direction:
- add a minimal `PuzzleCtrl`-style owner in `src/puzzles/`
- keep the initial surface narrow: active puzzle, phase, current move index, solved/failed flags
- let later tasks build on that seam

What I want from you:
- first provide the required pre-implementation output:
  1. relevant Patzer Pro files
  2. relevant Lichess files
  3. exact diagnosis
  4. exact small step to implement
  5. why that step is safely scoped
- then implement the change
- then validate it

Validation requirements:
- run `npm run build`
- run the most relevant task-specific check you can
- provide a short manual test checklist with concrete user actions and expected results
- explicitly report:
  - Prompt ID
  - Task ID
  - build result
  - puzzle-controller state behavior
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks or limitations
```

## CCP-087 — Created

- Task: wire puzzle-mode board moves through strict solution validation and scripted reply playback
- Task ID: `CCP-087`
- Parent prompt ID: none
- Source document: `docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md`
- Source step: `Task 5 — Route board moves through strict puzzle validation and scripted replies`
- Status: created
- Review outcome: pending
- Commit: unknown
- Notes: none

```
Prompt ID: CCP-087
Task ID: CCP-087
Source Document: docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md
Source Step: Task 5 — Route board moves through strict puzzle validation and scripted replies
Execution Target: Claude Code

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle controller / board move-handling / tree path files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: wire puzzle-mode board moves through strict solution validation and scripted reply playback, keeping the solve loop puzzle-owned rather than analysis-owned.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - how Patzer currently accepts user moves on the board
   - how the retrospection flow judges candidate moves today
   - how Lichess puzzle move validation and reply sequencing work
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- Keep this scoped to puzzle-mode move validation and auto-replies.
- Do not add live-engine hints or public-dataset logic.
- Do not break normal analysis-board move handling.
- Preserve existing board reuse where possible, but keep puzzle rules puzzle-owned.

Relevant current code areas to inspect first:
- `src/board/index.ts`
- `src/analyse/retroCtrl.ts`
- current `src/puzzles/*` files
- `src/tree/ops.ts` or related move-tree helpers if needed

Relevant Lichess source to inspect first:
- `~/Development/lichess-source/lila/ui/puzzle/src/moveTest.ts`
- `~/Development/lichess-source/lila/ui/puzzle/src/view/chessground.ts`
- `~/Development/lichess-source/lila/ui/puzzle/src/ctrl.ts`

Current audit-grounded diagnosis to confirm first:
- the biggest missing puzzle behavior is not rendering, it is sequence-aware move validation
- a correct user move must advance the round
- expected reply moves must be played automatically
- a wrong move must fail the round cleanly

Likely safe direction:
- route puzzle-mode user moves through a controller method
- compare them against the expected solution move
- auto-play required reply moves after correct progress
- keep normal analysis-mode user move handling unchanged

What I want from you:
- first provide the required pre-implementation output:
  1. relevant Patzer Pro files
  2. relevant Lichess files
  3. exact diagnosis
  4. exact small step to implement
  5. why that step is safely scoped
- then implement the change
- then validate it

Validation requirements:
- run `npm run build`
- run the most relevant task-specific check you can
- provide a short manual test checklist with concrete user actions and expected results
- explicitly report:
  - Prompt ID
  - Task ID
  - build result
  - puzzle move-validation behavior
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks or limitations
```

## CCP-088 — Created

- Task: add puzzle-specific feedback and round controls for correct, wrong, solved, next, and view-solution states
- Task ID: `CCP-088`
- Parent prompt ID: none
- Source document: `docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md`
- Source step: `Task 6 — Add puzzle feedback and round controls`
- Status: created
- Review outcome: pending
- Commit: unknown
- Notes: none

```
Prompt ID: CCP-088
Task ID: CCP-088
Source Document: docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md
Source Step: Task 6 — Add puzzle feedback and round controls
Execution Target: Claude Code

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle view / feedback / control-bar files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: add puzzle-specific feedback and round controls for correct / wrong / solved / next / view-solution states instead of leaning on generic analysis-board UI.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - how Patzer currently renders analysis and retrospection feedback
   - how Lichess puzzle feedback and after-round controls are separated from board rendering
   - what the smallest honest Patzer puzzle feedback surface is now
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- Keep this scoped to puzzle feedback and control UI.
- Do not redesign the whole analysis tools column.
- Do not bundle session history or public puzzle metadata.
- Keep the UI honest about the local-only puzzle scope.

Relevant current code areas to inspect first:
- `src/analyse/retroView.ts`
- current `src/puzzles/*` files
- any small main-shell render seam only if required

Relevant Lichess source to inspect first:
- `~/Development/lichess-source/lila/ui/puzzle/src/view/feedback.ts`
- `~/Development/lichess-source/lila/ui/puzzle/src/view/after.ts`
- `~/Development/lichess-source/lila/ui/puzzle/src/view/main.ts`

Current audit-grounded diagnosis to confirm first:
- once solve validation exists, Patzer still needs puzzle-native feedback
- this should not be hidden inside generic analysis controls
- Lichess treats puzzle feedback as first-class stateful UI

Likely safe direction:
- add a dedicated feedback strip or panel in `src/puzzles/view.ts`
- support at least: find, wrong, solved, view solution, and next puzzle states
- keep the first UI compact and local-puzzle focused

What I want from you:
- first provide the required pre-implementation output:
  1. relevant Patzer Pro files
  2. relevant Lichess files
  3. exact diagnosis
  4. exact small step to implement
  5. why that step is safely scoped
- then implement the change
- then validate it

Validation requirements:
- run `npm run build`
- run the most relevant task-specific check you can
- provide a short manual test checklist with concrete user actions and expected results
- explicitly report:
  - Prompt ID
  - Task ID
  - build result
  - puzzle feedback/control behavior
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks or limitations
```

## CCP-089 — Created

- Task: add a lightweight puzzle metadata side panel using source-game and puzzle context that Patzer already owns
- Task ID: `CCP-089`
- Parent prompt ID: none
- Source document: `docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md`
- Source step: `Task 7 — Add the puzzle metadata / side-panel surface`
- Status: created
- Review outcome: pending
- Commit: unknown
- Notes: none

```
Prompt ID: CCP-089
Task ID: CCP-089
Source Document: docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md
Source Step: Task 7 — Add the puzzle metadata / side-panel surface
Execution Target: Claude Code

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle view / metadata / source-game link files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: add a lightweight puzzle metadata side panel using source-game and puzzle context that Patzer already owns, without inventing public puzzle-catalog semantics.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - what metadata Patzer already has for saved puzzles
   - how Lichess uses side-panel context to orient the user
   - what the smallest honest Patzer metadata surface is
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- Keep this scoped to metadata display.
- Do not invent ratings, vote counts, or theme tags that Patzer does not own.
- Do not bundle session persistence or new routing systems.

Relevant current code areas to inspect first:
- `src/idb/index.ts`
- `src/puzzles/extract.ts`
- current `src/puzzles/*` files
- `src/games/view.ts` only if existing game-row metadata helps the display

Relevant Lichess source to inspect first:
- `~/Development/lichess-source/lila/ui/puzzle/src/view/side.ts`
- `~/Development/lichess-source/lila/ui/puzzle/src/interfaces.ts`

Current audit-grounded diagnosis to confirm first:
- puzzle rounds need context, but Patzer should only show data it genuinely has
- a small metadata surface improves orientation without pretending the app already has a public puzzle catalog

Likely safe direction:
- add a compact side panel with source-game, move context, side to move, loss severity, and related local fields where available
- leave absent fields absent rather than faking them

What I want from you:
- first provide the required pre-implementation output:
  1. relevant Patzer Pro files
  2. relevant Lichess files
  3. exact diagnosis
  4. exact small step to implement
  5. why that step is safely scoped
- then implement the change
- then validate it

Validation requirements:
- run `npm run build`
- run the most relevant task-specific check you can
- provide a short manual test checklist with concrete user actions and expected results
- explicitly report:
  - Prompt ID
  - Task ID
  - build result
  - metadata-panel behavior
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks or limitations
```

## CCP-090 — Created

- Task: persist a lightweight local puzzle session so saved-puzzle progress can survive reloads and continue cleanly
- Task ID: `CCP-090`
- Parent prompt ID: none
- Source document: `docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md`
- Source step: `Task 8 — Persist lightweight local puzzle session state`
- Status: created
- Review outcome: pending
- Commit: unknown
- Notes: none

```
Prompt ID: CCP-090
Task ID: CCP-090
Source Document: docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md
Source Step: Task 8 — Persist lightweight local puzzle session state
Execution Target: Claude Code

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle session / local persistence / IDB files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: persist a lightweight local puzzle session so saved-puzzle progress can survive reloads and continue cleanly, without introducing account or server assumptions.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - how Patzer currently persists local state for analysis and saved puzzles
   - how Lichess puzzle session state stays lightweight and user-oriented
   - what the smallest safe Patzer session record is
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- Keep this scoped to lightweight local session state.
- Do not redesign the whole puzzle store.
- Do not introduce server, account, or rating assumptions.
- Do not bundle broad review-data persistence changes.

Relevant current code areas to inspect first:
- `src/idb/index.ts`
- current `src/puzzles/*` files
- `src/main.ts` only for the minimum restore seam if required

Relevant Lichess source to inspect first:
- `~/Development/lichess-source/lila/ui/puzzle/src/session.ts`
- `~/Development/lichess-source/lila/ui/puzzle/src/ctrl.ts`

Current audit-grounded diagnosis to confirm first:
- Patzer already persists saved puzzles, but not a puzzle session
- a light local session is a natural fit for the current browser-local architecture

Likely safe direction:
- add a small local session record for recent solved/failed rounds and active-round continuity
- keep persistence explicit and minimal

What I want from you:
- first provide the required pre-implementation output:
  1. relevant Patzer Pro files
  2. relevant Lichess files
  3. exact diagnosis
  4. exact small step to implement
  5. why that step is safely scoped
- then implement the change
- then validate it

Validation requirements:
- run `npm run build`
- run the most relevant task-specific check you can
- provide a short manual test checklist with concrete user actions and expected results
- explicitly report:
  - Prompt ID
  - Task ID
  - build result
  - local puzzle-session behavior
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks or limitations
```

## CCP-091 — Created

- Task: tighten the bridge from Patzer’s game-review flow to its saved-puzzle flow so the puzzle page feels like a direct downstream tool of review data
- Task ID: `CCP-091`
- Parent prompt ID: none
- Source document: `docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md`
- Source step: `Task 9 — Tighten review-to-puzzle integration`
- Status: created
- Review outcome: pending
- Commit: unknown
- Notes: none

```
Prompt ID: CCP-091
Task ID: CCP-091
Source Document: docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md
Source Step: Task 9 — Tighten review-to-puzzle integration
Execution Target: Claude Code

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same review / retrospection / saved-puzzle integration files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: tighten the bridge from Patzer’s game-review flow to its saved-puzzle flow so the puzzle page feels like a direct downstream tool of review data rather than a parallel subsystem.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - how Patzer currently extracts and saves puzzle candidates from review data
   - how Patzer retrospection already models per-candidate solving
   - what the smallest honest review-to-puzzle integration improvement is now
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- Keep this scoped to the review-to-puzzle bridge.
- Do not start public-dataset ingestion work.
- Do not collapse retrospection and puzzles into one controller unless the code clearly supports that as a tiny safe step.
- Preserve the current analysis-board behavior outside the targeted integration seam.

Relevant current code areas to inspect first:
- `src/puzzles/extract.ts`
- `src/analyse/retroCtrl.ts`
- `src/analyse/retroView.ts`
- `src/idb/index.ts`
- current `src/puzzles/*` files

Relevant Lichess source to inspect first:
- `~/Development/lichess-source/lila/ui/puzzle/src/ctrl.ts`
- `~/Development/lichess-source/lila/ui/puzzle/src/moveTree.ts`

Current audit-grounded diagnosis to confirm first:
- Patzer’s real product advantage is review-driven practice, not just a generic puzzle page
- the saved-puzzle flow should feel like a clean continuation of Game Review output

Likely safe direction:
- improve the explicit handoff from extracted/saved candidates into the puzzle page or controller
- keep the bridge local and data-driven
- avoid any broader architecture merge that is larger than this task requires

What I want from you:
- first provide the required pre-implementation output:
  1. relevant Patzer Pro files
  2. relevant Lichess files
  3. exact diagnosis
  4. exact small step to implement
  5. why that step is safely scoped
- then implement the change
- then validate it

Validation requirements:
- run `npm run build`
- run the most relevant task-specific check you can
- provide a short manual test checklist with concrete user actions and expected results
- explicitly report:
  - Prompt ID
  - Task ID
  - build result
  - review-to-puzzle integration behavior
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks or limitations
```

## CCP-041 — Used in Claude Code

- Task: align Patzer review annotation colors and related styling with confirmed Lichess mapping
- Task ID: `CCP-041`
- Parent prompt ID: none
- Source document: `docs/WISHLIST.md`
- Source step: `Bring review annotation label/colors into Lichess parity`
- Status: reviewed
- Review outcome: passed
- Commit: `444a919`
- Notes: current glyph colors, eval-graph dots, and summary colors match the confirmed Lichess theme mappings for blunder, mistake, inaccuracy, brilliant, and interesting labels

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-043 — Used in Claude Code

- Task: remove the current player-strip result markers and replace them with a clearer minimal winner/loser signal
- Task ID: `CCP-043`
- Parent prompt ID: none
- Source document: `docs/WISHLIST.md`
- Source step: `Remove the 1 / 0 / ½ single-game result markers from the player strip by default`
- Status: reviewed
- Review outcome: passed
- Commit: `444a919`
- Notes: player strips now use a restrained winner-only star instead of numeric 1/0/½ result markers, keeping the board header cleaner without inventing match-score semantics

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-047 — Used in Claude Code

- Task: tighten the header import-platform UX while keeping Chess.com as the default
- Task ID: `CCP-047`
- Parent prompt ID: none
- Source document: `docs/WISHLIST.md`
- Source step: `In the header, it should default to a chess.com username input field`
- Status: reviewed
- Review outcome: passed
- Commit: `444a919`
- Notes: the header still defaults to Chess.com and now gives the platform buttons clearer active/inactive titles plus a stronger active-state visual indicator

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-048 — Used in Claude Code

- Task: add a stronger visual highlight for clearly massive engine improvements in the PV list
- Task ID: `CCP-048`
- Parent prompt ID: none
- Source document: `docs/WISHLIST.md`
- Source step: `IF there is an engine line available that has a massive improvement`
- Status: reviewed
- Review outcome: passed
- Commit: `444a919`
- Notes: PV score text now gets a dedicated highlight class for clearly decisive lines without changing the underlying eval logic or cluttering the rest of the ceval box

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-049 — Used in Claude Code

- Task: replace the current terminal mate notation with `#KO` in the intended analysis UI
- Task ID: `CCP-049`
- Parent prompt ID: none
- Source document: `docs/WISHLIST.md`
- Source step: `When mate is played on the board, the analysis engine should show a #KO symbol`
- Status: reviewed
- Review outcome: issues found
- Commit: `444a919`
- Notes: `#KO` is correctly used in `formatScore()` for the eval bar and PV views, but the move list still renders plain `KO`, so the prompt is only partially fulfilled

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-050 — Used in Claude Code

- Task: fix mate-state eval-bar fill so it resolves fully to the winning side
- Task ID: `CCP-050`
- Parent prompt ID: none
- Source document: `docs/WISHLIST.md`
- Source step: `When mate is played on the board, the eval bar should fill up entirely with whatever colour delivered the mate`
- Status: reviewed
- Review outcome: passed
- Commit: `444a919`
- Notes: terminal mate fill now uses FEN side-to-move to resolve the winning color correctly for mate-0 positions instead of always collapsing to black

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-030 — Used in Claude Code

- Task: clear the first cohesive typecheck error cluster in `src/analyse/evalView.ts` and `src/analyse/moveList.ts`
- Task ID: `CCP-030`
- Parent prompt ID: none
- Source document: `docs/KNOWN_ISSUES.md`
- Source step: `[HIGH] npm run typecheck is wired but surfaces 53 type errors`
- Status: reviewed
- Review outcome: passed
- Commit: `a956249`
- Notes: reviewed against the live compiler output; the scoped `evalView.ts` / `moveList.ts` slice is no longer part of the current typecheck backlog, even though broader repo type errors remain

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-031 — Used in Claude Code

- Task: fix the board wheel-navigation hit target so wheel scrolling over the analysis board actually steps moves
- Task ID: `CCP-031`
- Parent prompt ID: none
- Source document: `docs/KNOWN_ISSUES.md`
- Source step: `[HIGH] Wheel scroll navigation is still non-functional`
- Status: reviewed
- Review outcome: passed
- Commit: `a956249`
- Notes: current wheel handler targets `.analyse__board.main-board`, which matches the actual board container and restores scroll-based move stepping over the board surface

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-032 — Used in Claude Code

- Task: replace the remaining coarse stop boolean seam with per-search token bookkeeping
- Task ID: `CCP-032`
- Parent prompt ID: none
- Source document: `docs/KNOWN_ISSUES.md`
- Source step: `[HIGH] In-flight engine stop handling still relies on a boolean flag`
- Status: reviewed
- Review outcome: passed
- Commit: `a956249`
- Notes: current engine lifecycle uses `pendingStopCount` rather than the old boolean seam, which safely handles multiple stale `bestmove` replies during rapid stop/start sequences

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-033 — Used in Claude Code

- Task: fix live board orientation so imported games reliably orient to the importing user's side
- Task ID: `CCP-033`
- Parent prompt ID: none
- Source document: `docs/KNOWN_ISSUES.md`
- Source step: `[HIGH] Imported-game board orientation does not always match the importing user's side`
- Status: reviewed
- Review outcome: passed
- Commit: `a956249`
- Notes: `setOrientation()` now propagates directly into the live Chessground instance so imported-game loads update orientation immediately instead of waiting for a later board rebuild

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-006-F1 — Used in Claude Code

- Task: separate loading-vs-empty library semantics so `analysis-game` stops showing permanent fake loading text
- Task ID: `CCP-006`
- Parent prompt ID: `CCP-006`
- Source document: `docs/KNOWN_ISSUES.md`
- Source step: `[MEDIUM] analysis-game route can still get stuck in a fake loading state`
- Status: reviewed
- Review outcome: passed
- Commit: `a956249`
- Notes: the route now distinguishes real IDB-load-in-progress from a completed-but-empty library via `gamesLibraryLoaded`, so empty/missing game cases no longer masquerade as loading forever

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-034 — Used in Claude Code

- Task: add the first safe eval-graph hover/scrub improvement
- Task ID: `CCP-034`
- Parent prompt ID: none
- Source document: `docs/KNOWN_ISSUES.md`
- Source step: `[MEDIUM] Eval graph hover/scrub behavior is not yet working as expected`
- Status: reviewed
- Review outcome: issues found
- Commit: `a956249`
- Notes: the graph now shows a hover line, but it updates only on per-point `mouseenter` strips rather than true nearest-point `mousemove` scrubbing, so the prompt is only partially fulfilled

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-035 — Used in Claude Code

- Task: fix engine-arrow rendering so live arrows keep a visible arrowhead
- Task ID: `CCP-035`
- Parent prompt ID: none
- Source document: `docs/KNOWN_ISSUES.md`
- Source step: `[MEDIUM] Engine arrows can render without a visible arrowhead`
- Status: reviewed
- Review outcome: passed
- Commit: `a956249`
- Notes: the board now registers the live brushes explicitly and the played-move arrow no longer uses the custom modifier combination that was suppressing the marker arrowhead

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-036 — Used in Claude Code

- Task: replace the placeholder puzzles route with the smallest honest saved-puzzle workflow
- Task ID: `CCP-036`
- Parent prompt ID: none
- Source document: `docs/KNOWN_ISSUES.md`
- Source step: `[MEDIUM] Puzzle route is still a placeholder`
- Status: reviewed
- Review outcome: passed
- Commit: `a956249`
- Notes: `#/puzzles` now renders a real empty state and saved-puzzle list instead of placeholder text, while staying honest about the limited current puzzle workflow

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-037 — Used in Claude Code

- Task: fetch the necessary Chess.com archive months for the selected date range instead of only the newest month
- Task ID: `CCP-037`
- Parent prompt ID: none
- Source document: `docs/KNOWN_ISSUES.md`
- Source step: `[LOW] Chess.com import still fetches only the latest archive month`
- Status: reviewed
- Review outcome: passed
- Commit: `a956249`
- Notes: the importer now computes an archive cutoff month and fetches all relevant archive URLs with `Promise.all`, so broader date ranges can include older eligible games

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-038 — Used in Claude Code

- Task: replace the header `Game Review` TODO stub with honest real behavior or an honest disabled state
- Task ID: `CCP-038`
- Parent prompt ID: none
- Source document: `docs/KNOWN_ISSUES.md`
- Source step: `[LOW] Header global menu still contains a stub Game Review action`
- Status: reviewed
- Review outcome: passed
- Commit: `a956249`
- Notes: the global menu now provides honest behavior by navigating to `#/analysis` when a game is selected and disabling the action when no current game exists

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-022 — Used in Claude Code

- Task: persist richer retrospection solution context such as `bestLine`
- Task ID: `CCP-022`
- Parent prompt ID: none
- Source document: `docs/reference/patzer-retrospection-audit.md`
- Source step: `Recommended next implementation sequence, Step 5`
- Status: reviewed
- Review outcome: passed
- Commit: current `main` / `origin/main`
- Notes: reviewed against the current implementation; `bestLine` is persisted from eval PV moves in IndexedDB, restored into `PositionEval.moves`, and surfaced onto `RetroCandidate.bestLine` without breaking optional backward compatibility

```
Prompt ID: CCP-022
Task ID: CCP-022
Source Document: docs/reference/patzer-retrospection-audit.md
Source Step: Recommended next implementation sequence, Step 5

Task: Persist richer retrospection solution context by adding a stored `bestLine`-style field for reviewed mistake positions, so answer reveal and later parity work are not limited to a single `bestMove` UCI.
```

## CCP-015-F3 — Used in Claude Code

- Task: restore the per-candidate `Show engine` behavior in Learn From Mistakes and document it explicitly if it is a Patzer deviation from Lichess
- Task ID: `CCP-015`
- Parent prompt ID: `CCP-015-F2`
- Source document: `docs/reference/patzer-retrospection-audit.md`
- Source step: `Learn From Mistakes guidance behavior follow-up fix`
- Status: reviewed
- Review outcome: passed
- Commit: `f22ce2a`
- Notes: current implementation restores the Patzer-specific per-candidate `Show engine` reveal behavior; guidance stays hidden by default, `jumpToNext()` resets reveal state, and repo comments now explicitly document that this is a Patzer product deviation from Lichess's implicit `hideComputerLine(...)` model

```
Prompt ID: CCP-015-F3
Task ID: CCP-015
Parent Prompt ID: CCP-015-F2
Source Document: docs/reference/patzer-retrospection-audit.md
Source Step: Learn From Mistakes guidance behavior follow-up fix

Task: Restore the Patzer Learn From Mistakes guidance behavior so engine guidance is hidden by default when entering retrospection, the user can manually reveal it for the current mistake only, and the next mistake resets back to guidance-hidden by default.

This is a focused follow-up fix for a regression in the `CCP-015-F2` guidance behavior. It is also a product-rule documentation task: if Patzer intentionally differs from Lichess here, document that deviation explicitly in the repo.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- `src/analyse/retroCtrl.ts`
- `src/analyse/retroView.ts`
- `src/main.ts`
- `src/engine/ctrl.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/ARCHITECTURE.md`
- `docs/reference/patzer-retrospection-audit.md`
- `docs/reference/lichess-retrospection/README.md`
- `docs/reference/lichess-retrospection-ux/README.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `src/analyse/retroCtrl.ts`
- `src/analyse/retroView.ts`
- `src/main.ts`
- `src/engine/ctrl.ts`

Because this task explicitly asks whether the behavior deviates from Lichess, inspect the relevant Lichess source before deciding implementation details. Start with:
- `~/Development/lichess-source/lila/ui/analyse/src/retrospect/retroView.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/retrospect/retroCtrl.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/ctrl.ts`
- any closely related Lichess tools/ceval files needed to confirm how computer guidance is hidden during retrospection

Current repo-grounded diagnosis:
- Patzer previously introduced a retrospection-local guidance reveal model in `CCP-015-F2`
- the intended Patzer behavior is:
  - entering Learn From Mistakes starts with engine guidance hidden
  - the user may manually reveal guidance for the current mistake only
  - advancing to the next mistake resets guidance back to hidden
- something in later local work appears to have regressed or obscured that behavior in practice
- the user also wants this behavior written down explicitly in the repo so future prompts do not silently remove it
- this may be a deliberate Patzer UX deviation from Lichess, so the implementation must confirm that explicitly and document it if true

Implement only the smallest safe step:
- restore the current-candidate `Show engine` affordance if it is missing or broken
- ensure guidance remains hidden by default whenever retrospection is entered
- ensure the reveal state is local to the current mistake and resets on candidate advance
- keep global engine settings unchanged
- if this is a Patzer-specific deviation from Lichess, document it in the most appropriate repo doc
- do not bundle unrelated retrospection solve-loop work
- do not redesign the tools column

A likely safe direction is:
- verify the reveal control still renders from `src/analyse/retroView.ts`
- verify `guidanceRevealed()` / `revealGuidance()` / reset-on-next still work in `src/analyse/retroCtrl.ts`
- verify PV and arrow gating still depend on the retrospection-local reveal state in `src/main.ts` and `src/engine/ctrl.ts`
- add a short explicit note in repo docs if Patzer intentionally differs from Lichess by exposing a manual reveal button

Before coding, provide:
- prompt id
- task id
- parent prompt id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- whether this is a Lichess deviation or not
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run the most relevant task-specific check you can for this guidance behavior
- explicitly verify:
  - entering Learn From Mistakes hides engine guidance by default
  - a visible affordance exists to reveal guidance for the current mistake
  - revealing guidance does not mutate global engine settings
  - advancing to the next mistake resets guidance back to hidden
  - leaving retrospection restores normal analysis guidance behavior
  - any repo doc note about this behavior is updated
- report whether behavior changed intentionally
- report whether there are console/runtime errors
- report remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results.

Output shape:
- prompt id
- task id
- parent prompt id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- whether this is a Lichess deviation or not
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks

In your final report, repeat:
- `Prompt ID: CCP-015-F3`
- `Task ID: CCP-015`
```

## CCP-021-F1 — Used in Claude Code

- Task: fix the retrospection render corruption bug causing duplicated panels, poisoned tools UI, and Snabbdom boolean-child patch failures
- Task ID: `CCP-021`
- Parent prompt ID: `CCP-021`
- Source document: `docs/reference/patzer-retrospection-audit.md`
- Source step: `Recommended next implementation sequence, Step 4 follow-up fix`
- Status: reviewed
- Review outcome: passed
- Commit: current `main` / `origin/main`
- Notes: reviewed against the current implementation; the unsafe boolean-child `!ctrl.retro && ...` tools-column expressions were replaced with ternaries returning `null`, matching the reported Snabbdom crash seam and leaving no remaining finding in the present code

```
Prompt ID: CCP-021-F1
Task ID: CCP-021
Parent Prompt ID: CCP-021
Source Document: docs/reference/patzer-retrospection-audit.md
Source Step: Recommended next implementation sequence, Step 4 follow-up fix

Task: Fix the active retrospection render corruption bug so entering Learn From Mistakes no longer poisons the tools column, duplicates retrospection panels, or destabilizes adjacent analysis UI after redraws.

Treat this as a focused follow-up fix prompt for the reviewed retrospection UI corruption bug, not as permission to redesign the broader retrospection flow.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- `src/main.ts`
- `src/analyse/retroView.ts`
- `src/analyse/moveList.ts`
- `src/board/index.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/ARCHITECTURE.md`
- `docs/KNOWN_ISSUES.md`
- `docs/reference/patzer-retrospection-audit.md`
- `docs/reference/lichess-retrospection/README.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `src/main.ts`
- `src/analyse/retroView.ts`
- `src/analyse/moveList.ts`
- `src/board/index.ts`

Because this task affects analysis-board rendering and retrospection UI ownership, inspect relevant Lichess source before deciding implementation details. Start with:
- `~/Development/lichess-source/lila/ui/analyse/src/view/tools.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/retrospect/retroView.ts`
- any nearby Lichess analyse view files that clarify how conditional children are rendered safely

Current repo-grounded diagnosis:
- entering `Mistakes` can initially look correct, then later duplicate retrospection panels and corrupt the surrounding analysis UI
- the browser console shows repeated Snabbdom patch failures: `Cannot create property 'elm' on boolean 'false'`
- the stack points through redraws triggered from retrospection navigation and callbacks
- this strongly suggests Patzer is feeding boolean children into a VDOM children array during conditional retrospection rendering, leaving the DOM in a half-patched corrupted state
- the likely hot path is the analysis tools render path in `src/main.ts`, especially conditional expressions that can evaluate to literal `false` instead of a vnode or `null`
- once patching crashes, stale DOM and corrupted shared UI state can make the move list, retrospection panel, and player-strip/material display appear duplicated or poisoned across later game loads

Lichess parity requirement:
- inspect how Lichess conditionally includes/excludes retrospection and tools-column subtrees without returning unsafe boolean children
- use Lichess as the behavioral reference for a clean tools-column render boundary, not for introducing a larger redesign

Implement only the smallest safe step:
- fix the retrospection/tools render path so conditional children never pass raw booleans into Snabbdom
- preserve the current intended Learn From Mistakes UI structure as much as possible
- make sure entering/exiting retrospection redraws cleanly
- do not bundle solve-loop changes
- do not bundle new retrospection features
- do not redesign the tools column beyond what is required to stop the render corruption

A likely safe direction is:
- replace boolean-producing conditional child expressions with explicit `null`/array-safe vnode handling
- keep the ownership where it already lives unless inspection proves a tiny extraction is safer
- validate the exact redraw paths that previously triggered the crash

Before coding, provide:
- prompt id
- task id
- parent prompt id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run the most relevant task-specific check you can for this render bug
- explicitly verify:
  - entering retrospection no longer throws the Snabbdom boolean-child error
  - retrospection panels do not duplicate during navigation / solve actions
  - the move list / tools column stay stable during redraws
  - the player-strip/material display is no longer corrupted by this render failure
  - switching to another game no longer carries the poisoned UI state forward
- report whether behavior changed intentionally
- report whether there are console/runtime errors
- report remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results. Keep it tightly scoped to this fix.

Output shape:
- prompt id
- task id
- parent prompt id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks

In your final report, repeat:
- `Prompt ID: CCP-021-F1`
- `Task ID: CCP-021`
```

## CCP-020 — Used in Claude Code

- Task: move the active retrospection UI into the analysis tools area
- Task ID: `CCP-020`
- Parent prompt ID: none
- Source document: `docs/reference/patzer-retrospection-audit.md`
- Source step: `Recommended next implementation sequence, Step 3`
- Status: reviewed
- Review outcome: issues found
- Commit: local unstaged work
- Notes: original prompt text recovered from the queue during review; the active retrospection strip was moved into the tools area, but the same prompt execution also bundled the broader suppression pass that `CCP-021` was supposed to handle separately

```
Prompt ID: CCP-020
Task ID: CCP-020
Source Document: docs/reference/patzer-retrospection-audit.md
Source Step: Recommended next implementation sequence, Step 3

Task: Move the active retrospection UI out of the bottom control strip and into the analysis tools area so the feature starts behaving like an analysis-owned mode instead of a page-level footer add-on.
```

## CCP-021 — Used in Claude Code

- Task: suppress conflicting analysis UI while active retrospection is running
- Task ID: `CCP-021`
- Parent prompt ID: none
- Source document: `docs/reference/patzer-retrospection-audit.md`
- Source step: `Recommended next implementation sequence, Step 4`
- Status: reviewed
- Review outcome: issues found
- Commit: local unstaged work
- Notes: original prompt text recovered from the queue during review; suppression behavior is present, but the same local execution is bundled with unrelated later work including best-line persistence, near-best retrospection, and move-list context-menu actions

```
Prompt ID: CCP-021
Task ID: CCP-021
Source Document: docs/reference/patzer-retrospection-audit.md
Source Step: Recommended next implementation sequence, Step 4

Task: Add retrospection-specific suppression of conflicting analysis UI so Learn From Mistakes behaves more like a focused board mode and less like normal analysis with extra controls layered on top.
```

## CCP-024 — Used in Claude Code

- Task: add the first source-backed near-best acceptance step to retrospection
- Task ID: `CCP-024`
- Parent prompt ID: none
- Source document: `docs/reference/patzer-retrospection-audit.md`
- Source step: `Recommended next implementation sequence, Step 7`
- Status: reviewed
- Review outcome: issues found
- Commit: local unstaged work
- Notes: original prompt text recovered from the queue during review; the new `eval` path is still bypassed when the attempted move already exists as a child node

```
Prompt ID: CCP-024
Task ID: CCP-024
Source Document: docs/reference/patzer-retrospection-audit.md
Source Step: Recommended next implementation sequence, Step 7

Task: Add the first source-backed near-best acceptance step to retrospection so Patzer can move beyond exact-best-only solving and start matching Lichess's ceval-assisted acceptance behavior.
```

## CCP-025 — Used in Claude Code

- Task: add move-list context-menu infrastructure for path-based variation actions
- Task ID: `CCP-025`
- Parent prompt ID: none
- Source document: `docs/reference/lichess-analysis-variation-actions-audit.md`
- Source step: `Source-backed implementation sequence, Step 1`
- Status: reviewed
- Review outcome: issues found
- Commit: local unstaged work
- Notes: original prompt text recovered from the queue during review; the infrastructure step is bundled with real copy/delete/promote actions instead of staying menu-shell-only

```
Prompt ID: CCP-025
Task ID: CCP-025
Source Document: docs/reference/lichess-analysis-variation-actions-audit.md
Source Step: Source-backed implementation sequence, Step 1

Task: Add the smallest safe move-list context-menu infrastructure to Patzer’s analysis board so move nodes can expose path-based actions in a Lichess-like way, without yet implementing the full action set.
```

## CCP-026 — Used in Claude Code

- Task: add context-menu actions to copy mainline and variation PGN from the selected path
- Task ID: `CCP-026`
- Parent prompt ID: none
- Source document: `docs/reference/lichess-analysis-variation-actions-audit.md`
- Source step: `Source-backed implementation sequence, Step 2`
- Status: reviewed
- Review outcome: issues found
- Commit: local unstaged work
- Notes: original prompt text recovered from the queue during review; `copyLinePgn()` does not extend the selected path through the full line before exporting, so copied PGN can be truncated

```
Prompt ID: CCP-026
Task ID: CCP-026
Source Document: docs/reference/lichess-analysis-variation-actions-audit.md
Source Step: Source-backed implementation sequence, Step 2

Task: Add path-based `Copy main line PGN` / `Copy variation PGN` actions to the new move-list context menu using a dedicated line export helper, matching the Lichess variation-export model as closely as current Patzer structure allows.
```

## CCP-027 — Used in Claude Code

- Task: add a move-list context `Delete from here` branch action with active-path repair
- Task ID: `CCP-027`
- Parent prompt ID: none
- Source document: `docs/reference/lichess-analysis-variation-actions-audit.md`
- Source step: `Source-backed implementation sequence, Step 3`
- Status: reviewed
- Review outcome: issues found
- Commit: local unstaged work
- Notes: original prompt text recovered from the queue during review; the action reuses Patzer’s existing delete flow, so deleted branches still are not persisted across reload

```
Prompt ID: CCP-027
Task ID: CCP-027
Source Document: docs/reference/lichess-analysis-variation-actions-audit.md
Source Step: Source-backed implementation sequence, Step 3

Task: Add a path-based `Delete from here` move-list context action with active-path repair, shifting Patzer’s variation deletion model closer to the Lichess branch-deletion behavior.
```

## CCP-028 — Used in Claude Code

- Task: add context-menu actions for variation promotion and make-mainline behavior
- Task ID: `CCP-028`
- Parent prompt ID: none
- Source document: `docs/reference/lichess-analysis-variation-actions-audit.md`
- Source step: `Source-backed implementation sequence, Step 4`
- Status: reviewed
- Review outcome: issues found
- Commit: local unstaged work
- Notes: original prompt text recovered from the queue during review; promotion handlers reorder the tree but do not refresh `ctrl.setPath(ctrl.path)`, so derived analysis state can remain stale

```
Prompt ID: CCP-028
Task ID: CCP-028
Source Document: docs/reference/lichess-analysis-variation-actions-audit.md
Source Step: Source-backed implementation sequence, Step 4

Task: Add move-list context actions for `Promote variation` and `Make main line`, using Patzer’s existing tree promotion primitives to align the move-list interaction model more closely with Lichess analysis.
```

## CCP-023 — Used in Claude Code

- Task: add the first safe opening/book-aware cancellation step for retrospection candidates
- Task ID: `CCP-023`
- Parent prompt ID: none
- Source document: `docs/reference/patzer-retrospection-audit.md`
- Source step: `Recommended next implementation sequence, Step 6`
- Status: reviewed
- Review outcome: issues found
- Commit: local unstaged work
- Notes: original prompt text recovered from the queue during review; the opening-cancellation seam was added, but no opening provider is passed to `buildRetroCandidates()`, so book-aware suppression is not actually live

```
Prompt ID: CCP-023
Task ID: CCP-023
Source Document: docs/reference/patzer-retrospection-audit.md
Source Step: Recommended next implementation sequence, Step 6

Task: Add the first safe opening/book-aware cancellation step for retrospection so theory moves are less likely to become Learn From Mistakes exercises once a suitable local book signal exists.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- `src/analyse/retro.ts`
- `src/engine/batch.ts`
- `src/idb/index.ts`
- `src/main.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/reference/patzer-retrospection-audit.md`
- `docs/reference/lichess-retrospection/README.md`
- `docs/reference/lichess-puzzle-ux/README.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `src/analyse/retro.ts`
- current review-data and persistence owners

Because this task affects source-backed candidate filtering, inspect relevant Lichess source before deciding implementation details. Start with:
- `~/Development/lichess-source/lila/ui/analyse/src/retrospect/retroCtrl.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/nodeFinder.ts`
- any relevant Lichess explorer/opening hooks that the research docs identify for retrospection cancellation behavior

Current repo-grounded diagnosis:
- the audit identifies opening/book cancellation as a real parity gap
- Patzer currently has no proper book-aware cancellation in retrospection candidate building
- this task must stay small because the repo does not yet have a broad opening-explorer subsystem ready for full parity
- the correct first step is likely a provider boundary or minimal cached signal, not a large book feature

Implement only the smallest safe step:
- add the first source-backed book-aware cancellation seam for retrospection
- keep it limited to candidate suppression/cancellation behavior
- if a real local book provider does not yet exist, implement the smallest boundary that makes the later full feature safe
- do not bundle broader opening-explorer UI
- do not bundle near-best acceptance
- do not redesign retrospection session flow

A likely safe direction is:
- define a small opening/book lookup boundary that retrospection candidate selection can consult
- apply cancellation only when the available signal is trustworthy
- keep unknown/no-data cases explicit rather than inventing theory heuristics

Before coding, provide:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run the most relevant task-specific check you can for this behavior
- explicitly verify:
  - retrospection candidates are cancelled/suppressed only when the new book-aware signal says they should be
  - unknown/no-book cases still behave safely
  - current retrospection flows do not regress when no book data is available
  - there are no console/runtime errors
- report remaining risks and limitations, especially what still remains deferred until a fuller book provider exists

Also include a short manual test checklist with concrete user actions and expected results. Keep it tightly scoped to this change.

Output shape:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks

In your final report, repeat:
- `Prompt ID: CCP-023`
- `Task ID: CCP-023`
```

## CCP-018 — Used in Claude Code

- Task: extract retrospection entry and active-session rendering out of `src/main.ts` into `src/analyse/`
- Task ID: `CCP-018`
- Parent prompt ID: none
- Source document: `docs/reference/patzer-retrospection-audit.md`
- Source step: `Recommended next implementation sequence, Step 1`
- Status: reviewed
- Review outcome: passed
- Commit: `9e2b79f`
- Notes: clean extraction into `src/analyse/retroView.ts`; behavior and placement preserved

```
Prompt ID: CCP-018
Task ID: CCP-018
Source Document: docs/reference/patzer-retrospection-audit.md
Source Step: Recommended next implementation sequence, Step 1

Task: Extract retrospection entry and active-session rendering out of `src/main.ts` into an analysis-owned module under `src/analyse/`, while preserving the current behavior and placement exactly.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- `src/main.ts`
- `src/analyse/ctrl.ts`
- `src/analyse/retro.ts`
- `src/analyse/retroCtrl.ts`
- `src/analyse/moveList.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/ARCHITECTURE.md`
- `docs/NEXT_STEPS.md`
- `docs/reference/patzer-retrospection-audit.md`
- `docs/reference/lichess-retrospection-ux/README.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `src/main.ts`
- `src/analyse/ctrl.ts`
- `src/analyse/retro.ts`
- `src/analyse/retroCtrl.ts`

Because this task affects analysis-board ownership and retrospection UX structure, inspect relevant Lichess source before deciding implementation details. Start with:
- `~/Development/lichess-source/lila/ui/analyse/src/ctrl.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/view/tools.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/retrospect/retroView.ts`

Current repo-grounded diagnosis:
- Patzer already has working first-pass retrospection logic, but the entry button and active retrospection UI still live in `src/main.ts`
- the audit in `docs/reference/patzer-retrospection-audit.md` identifies this as the first structural gap to fix before deeper Lichess parity work
- the safest first step is ownership extraction only, not behavioral change
- this task should not yet move the UI into the tools area or alter solving behavior

Implement only the smallest safe step:
- extract the retrospection entry-button rendering and active-session rendering out of `src/main.ts`
- move that ownership into a small analysis-owned module under `src/analyse/`
- preserve current behavior, labels, actions, and placement exactly for now
- keep `toggleRetro()` orchestration where it already belongs if moving it would expand scope
- do not bundle controller lifecycle changes
- do not bundle UI relocation into the tools column
- do not bundle suppression/hiding rules

A likely safe direction is:
- create a small `src/analyse/retroView.ts` or similarly named module
- move the rendering-only retrospection UI there
- keep event handlers and data passed in explicitly rather than reaching deeper into unrelated module state

Before coding, provide:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run the most relevant task-specific check you can for this structural change
- explicitly verify:
  - the `Mistakes` entry affordance still appears where it did before
  - entering retrospection still works exactly as before
  - the active retrospection strip still renders and behaves as before
  - no retrospection behavior changed intentionally in this extraction step
  - there are no console/runtime errors
- report remaining risks and limitations, especially that the UI is still in the old placement and lifecycle parity is still deferred

Also include a short manual test checklist with concrete user actions and expected results. Keep it tightly scoped to this change.

Output shape:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks

In your final report, repeat:
- `Prompt ID: CCP-018`
- `Task ID: CCP-018`
```

## CCP-019 — Used in Claude Code

- Task: replace the inert retrospection `onCeval()` seam with meaningful lifecycle behavior while preserving exact-best MVP solving
- Task ID: `CCP-019`
- Parent prompt ID: none
- Source document: `docs/reference/patzer-retrospection-audit.md`
- Source step: `Recommended next implementation sequence, Step 2`
- Status: reviewed
- Review outcome: issues found
- Commit: `a63fb71`
- Notes: the `onCeval()` seam and related lifecycle guards became real enough for the current exact-best MVP, but the prompt was executed in the same commit as unrelated `CCP-015-F2` guidance-reveal work

```
Prompt ID: CCP-019
Task ID: CCP-019
Source Document: docs/reference/patzer-retrospection-audit.md
Source Step: Recommended next implementation sequence, Step 2

Task: Implement the next real retrospection controller lifecycle step by replacing the inert `onCeval()` seam with meaningful session behavior, while preserving the current exact-best-move MVP acceptance rule.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- `src/analyse/retroCtrl.ts`
- `src/analyse/ctrl.ts`
- `src/engine/ctrl.ts`
- `src/board/index.ts`
- `src/main.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/reference/patzer-retrospection-audit.md`
- `docs/reference/lichess-retrospection/README.md`
- `docs/reference/lichess-retrospection-ux/README.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `src/analyse/retroCtrl.ts`
- `src/engine/ctrl.ts`
- `src/board/index.ts`
- `src/main.ts`

Because this task affects retrospection controller behavior, inspect relevant Lichess source before deciding implementation details. Start with:
- `~/Development/lichess-source/lila/ui/analyse/src/retrospect/retroCtrl.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/ctrl.ts`

Current repo-grounded diagnosis:
- Patzer already wires `onJump()`, `onMergeAnalysisData()`, and `onCeval()` into the app lifecycle
- but `src/analyse/retroCtrl.ts` still treats `onCeval()` as a stub
- the audit identifies this as the next controller gap after ownership extraction
- this task is not yet the near-best acceptance parity task
- current exact-best success/fail behavior in `src/board/index.ts` should remain the MVP unless a tiny lifecycle correction requires otherwise

Implement only the smallest safe step:
- make `onCeval()` and related controller lifecycle handling real instead of inert
- preserve the existing exact-best-move acceptance rule for now
- use the Lichess controller lifecycle as the reference for state transitions and seams
- do not yet implement near-best acceptance
- do not yet implement opening cancellation
- do not yet redesign the full solve loop
- do not bundle UI relocation or suppression work

A likely safe direction is:
- make the retrospection controller own a more meaningful lifecycle state around ceval availability and active-candidate state
- tighten how `onJump()`, `onMergeAnalysisData()`, and `onCeval()` cooperate
- preserve current board interception, but stop leaving `onCeval()` as a dead seam
- if the current exact-best-only MVP means some Lichess `eval` behavior must still remain deferred, keep that explicit and minimal

Before coding, provide:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run the most relevant task-specific check you can for this behavior
- explicitly verify:
  - retrospection lifecycle hooks are no longer dead/inert
  - entering retrospection still lands on the current candidate start position
  - the current exact-best MVP solve loop still works
  - no unintended regression is introduced to off-track or merge-analysis handling
  - there are no console/runtime errors
- report remaining risks and limitations, especially what still remains deferred until the later near-best parity task

Also include a short manual test checklist with concrete user actions and expected results. Keep it tightly scoped to this change.
```

## CCP-015-F2 — Used in Claude Code

- Task: add a per-candidate engine guidance toggle in retrospection
- Task ID: `CCP-015`
- Parent prompt ID: `CCP-015-F1`
- Source document: `docs/NEXT_STEPS.md`
- Source step: `Priority 3, Item 10`
- Status: reviewed
- Review outcome: passed
- Commit: local unstaged work
- Notes: adds a retro-owned per-candidate guidance reveal flag and resets it on candidate advance, matching the requested default-hidden behavior

```
Prompt ID: CCP-015-F2
Task ID: CCP-015
Parent Prompt ID: CCP-015-F1
Source Document: docs/NEXT_STEPS.md
Source Step: Priority 3, Item 10

Task: Take the next smallest safe follow-up step on retrospection guidance concealment by making engine guidance hidden by default whenever Learn From Mistakes mode is entered, while allowing the user to reveal it manually for the current mistake only, and automatically resetting back to hidden when advancing to the next mistake.

Treat this as a focused follow-up to the retrospection guidance work, not as permission to redesign the engine settings model or broaden the retrospection solve loop.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- `src/main.ts`
- `src/analyse/retroCtrl.ts`
- `src/analyse/ctrl.ts`
- `src/ceval/view.ts`
- `src/engine/ctrl.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/ARCHITECTURE.md`
- `docs/NEXT_STEPS.md`
- `docs/KNOWN_ISSUES.md`
- `docs/reference/lichess-retrospection/README.md`
- `docs/reference/lichess-retrospection-ux/README.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `src/main.ts`
- `src/analyse/retroCtrl.ts`
- `src/analyse/ctrl.ts`
- `src/ceval/view.ts`
- `src/engine/ctrl.ts`

Because this task affects analysis-board and retrospection behavior, inspect relevant Lichess source before deciding implementation details. Start with:
- `~/Development/lichess-source/lila/ui/analyse/src/retrospect/retroView.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/view/tools.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/view/actionMenu.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/ctrl.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/retrospect/retroCtrl.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/autoShape.ts`

Current repo-grounded diagnosis:
- Patzer now hides PV lines and arrows only while `ctrl.retro?.isSolving()` is true
- that means guidance can reappear in other retro states like `win` / `view`
- the current user intent is stronger:
  - entering Learn From Mistakes should start with engine guidance off
  - the user may choose to reveal guidance for the current mistake
  - moving to the next mistake should reset back to the default hidden state
- this should behave like retrospection-local reveal state, not like a permanent mutation of global engine settings such as `showEngineArrows`

Lichess parity requirement:
- inspect how Lichess keeps retrospection guidance under retro-owned control rather than mutating broad engine preferences
- specifically compare:
  - `view/tools.ts` gating of ceval PVs
  - `ctrl.ts` / `autoShape.ts` best-move-arrow suppression hooks
  - `retroCtrl.ts` `hideComputerLine()` and related retro state ownership
- if Patzer needs a temporary simplification, keep it minimal and call it out explicitly

Implement only the smallest safe step:
- make engine guidance hidden by default for the whole time retrospection mode is active
- add a small retrospection-local toggle to reveal engine guidance for the current candidate only
- reset that reveal state automatically whenever retrospection advances to a different candidate
- keep global engine settings unchanged outside retrospection
- keep the existing retro strip / controls layout as intact as possible
- do not redesign ceval settings
- do not bundle unrelated solve-loop fixes or review-controls work

A likely safe direction is:
- store a small “guidance revealed for current candidate” flag in retrospection-owned state
- gate PV rendering and engine/threat arrow rendering on:
  - retrospection active
  - and whether the current candidate’s reveal flag is enabled
- reset the reveal flag inside the candidate-transition seam (`jumpToNext`, `skip`, success advance, etc.) rather than spreading ad hoc resets through UI click handlers

Before coding, provide:
- prompt id
- task id
- parent prompt id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run the most relevant task-specific check you can for this behavior
- explicitly verify:
  - entering retrospection starts with engine guidance hidden
  - the user can reveal engine guidance for the current mistake without changing global engine settings
  - advancing to the next mistake resets guidance back to hidden by default
  - closing retrospection restores normal analysis behavior
  - normal engine guidance outside retrospection is unchanged
- report whether behavior changed intentionally
- report whether there are console/runtime errors
- report remaining risks and limitations, especially whether the reveal toggle is available in all retro states or only the intended subset

Also include a short manual test checklist with concrete user actions and expected results. Keep it tightly scoped to this change.

Output shape:
- prompt id
- task id
- parent prompt id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks

In your final report, repeat:
- `Prompt ID: CCP-015-F2`
- `Task ID: CCP-015`
```

## CCP-015-F1 — Used in Claude Code

- Task: hide engine guidance during retrospection
- Task ID: `CCP-015`
- Parent prompt ID: `CCP-015`
- Source document: `docs/NEXT_STEPS.md`
- Source step: `Priority 3, Item 10`
- Status: reviewed
- Review outcome: issues found
- Commit: `b87e6f1`
- Notes: hides engine PV lines and arrows only during retro solving states, not for the full time retrospection mode is active

```
Prompt ID: CCP-015-F1
Task ID: CCP-015
Parent Prompt ID: CCP-015
Source Document: docs/NEXT_STEPS.md
Source Step: Priority 3, Item 10

Task: Take the smallest safe follow-up step on the current-game retrospection flow by hiding engine guidance while Learn From Mistakes / retrospection mode is active, so the user is not shown engine lines or arrows while trying to find the move.

Treat this as a focused follow-up fix for the current retrospection experience, not as permission to redesign the engine UI or disable the engine backend entirely.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- `src/main.ts`
- `src/ceval/view.ts`
- `src/engine/ctrl.ts`
- `src/analyse/ctrl.ts`
- `src/analyse/retroCtrl.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/ARCHITECTURE.md`
- `docs/NEXT_STEPS.md`
- `docs/KNOWN_ISSUES.md`
- `docs/reference/lichess-retrospection/README.md`
- `docs/reference/lichess-retrospection-ux/README.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `src/main.ts`
- `src/ceval/view.ts`
- `src/engine/ctrl.ts`
- `src/analyse/ctrl.ts`
- `src/analyse/retroCtrl.ts`

Because this task affects analysis-board and retrospection behavior, inspect relevant Lichess source before deciding implementation details. Start with:
- `~/Development/lichess-source/lila/ui/analyse/src/view/tools.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/view/components.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/ctrl.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/retrospect/retroCtrl.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/autoShape.ts`

Current repo-grounded diagnosis:
- Patzer currently renders `renderPvBox()` unconditionally from the analysis board
- Patzer engine arrows are still built in `buildArrowShapes()` whenever the usual engine/threat toggles allow them
- retrospection state now lives on `ctrl.retro`
- this means the user can still see engine guidance while solving a mistakes exercise, which undercuts the whole point of the mode
- the smallest safe step is concealment, not engine shutdown: hide the visible guidance while retrospection is active, without changing saved settings or broader engine behavior

Lichess parity requirement:
- inspect how Lichess suppresses visible computer guidance during retrospection
- specifically compare:
  - `view/tools.ts` hiding ceval PVs during retro solving
  - `view/components.ts` `showCevalPvs`
  - `ctrl.ts` `showBestMoveArrows()`
  - `retroCtrl.ts` `hideComputerLine()` / related retro guidance suppression hooks
- if Patzer needs a temporary simplification, keep it minimal and call it out explicitly

Implement only the smallest safe step:
- hide engine PV lines while retrospection mode is active
- hide engine-generated arrows while retrospection mode is active
- keep the underlying engine state/settings intact unless a tiny reset is clearly required
- keep the retrospection strip and mistake-review controls intact
- do not redesign the ceval header or engine settings panel
- do not disable the engine globally unless inspection shows that visible concealment alone is insufficient
- do not bundle solve-loop fixes or broader retrospection work

A likely safe direction is:
- gate PV rendering in the ceval/analyse view layer based on `ctrl.retro`
- gate engine/threat arrow rendering in the engine layer based on `ctrl.retro`
- keep the decision near the actual owners of those UI surfaces instead of adding more orchestration logic to `src/main.ts`

Before coding, provide:
- prompt id
- task id
- parent prompt id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run the most relevant task-specific check you can for this behavior
- explicitly verify:
  - entering retrospection hides engine PV lines
  - entering retrospection hides visible engine arrows
  - leaving retrospection restores normal engine guidance
  - normal analysis behavior outside retrospection is unchanged
  - engine settings/toggles are not unexpectedly reset by entering or leaving retrospection
- report whether behavior changed intentionally
- report whether there are console/runtime errors
- report remaining risks and limitations, especially whether any guidance is only hidden during active solving versus all retrospection states

Also include a short manual test checklist with concrete user actions and expected results. Keep it tightly scoped to this change.

Output shape:
- prompt id
- task id
- parent prompt id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks

In your final report, repeat:
- `Prompt ID: CCP-015-F1`
- `Task ID: CCP-015`
```

## CCP-014 — Used in Claude Code

- Task: add a minimal current-game retrospection entry affordance
- Task ID: `CCP-014`
- Parent prompt ID: none
- Source document: `docs/NEXT_STEPS.md`
- Source step: `Priority 3, Item 10`
- Status: reviewed
- Review outcome: issues found
- Commit: local unstaged work
- Notes: enters retrospection and jumps to the first candidate when one exists, but still presents a misleading active `Mistakes` state when there are zero eligible candidates

```
Prompt ID: CCP-014
Task ID: CCP-014
Source Document: docs/NEXT_STEPS.md
Source Step: Priority 3, Item 10

Task: Take the next smallest safe step on the local per-game “Learn From Mistakes” flow by adding a minimal current-game entry affordance that jumps the user to the first reviewed mistake position before the mistake, without building the full training loop yet.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- `src/main.ts`
- `src/analyse/pgnExport.ts`
- `src/puzzles/extract.ts`
- any existing retrospection candidate module added for the previous step
- `src/board/index.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/ARCHITECTURE.md`
- `docs/NEXT_STEPS.md`
- `docs/KNOWN_ISSUES.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `src/main.ts`
- `src/analyse/pgnExport.ts`
- `src/puzzles/extract.ts`
- `src/board/index.ts`

Because this task affects analysis-board review flow, inspect relevant Lichess source before deciding implementation details. Start with:
- `~/Development/lichess-source/lila/ui/analyse/src/nodeFinder.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/retrospect/retroCtrl.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/retrospect/retroView.ts`
- any closely related Lichess analyse/retrospect entry-point files you find necessary

Current repo-grounded diagnosis:
- the roadmap now says the first milestone should stay scoped to one reviewed game at a time
- current repo already has underboard review controls in `src/analyse/pgnExport.ts` and the analysis surface is orchestrated from `src/main.ts`
- the previous safe step should have produced a dedicated retrospection candidate builder for current reviewed mainline data
- `CCP-013` review found that retrospection lifecycle wiring is still not fully trustworthy, so this task must not assume full Lichess-style active-session behavior is already working
- the smallest next step is not a full practice state machine
- the smallest next step is a single current-game affordance that becomes available after review and sends the user to the position before the first candidate mistake

Lichess parity requirement:
- use Lichess retrospect entry behavior as the baseline
- verify candidate eligibility against `nodeFinder.ts evalSwings(...)`, not just against existing Patzer candidate output
- specifically compare Patzer’s entry flow against `retroCtrl.ts jumpToNext()` and `retroView.ts` initial `find` state
- do not invent a Patzer-specific entry flow in this task unless current repo constraints force a minimal temporary deviation
- if Patzer cannot yet match Lichess exactly because required data is missing, keep the deviation as small as possible and report it explicitly

Implement only the smallest safe step:
- add a minimal current-game retrospection entry affordance
- keep it scoped to the currently selected reviewed game
- when triggered, jump to the position before the first candidate mistake
- make this an entry/jump affordance only; do not assume `CCP-013` solved full lifecycle behavior if inspection shows it did not
- do not yet score the user move
- do not yet add retry/continue state machine logic
- do not couple this to saved puzzles
- do not add a cross-game queue or inbox
- do not grow `src/main.ts` more than necessary; prefer a small dedicated module/helper if needed

A likely safe direction is:
- surface the entry affordance near existing review controls or another current-game review surface after inspection
- use the dedicated retrospection candidate builder rather than re-deriving candidates from raw UI state, but verify that builder still matches the source-backed `evalSwings(...)` rules before trusting it
- jump to the candidate’s “position before the mistake” in the same spirit as Lichess `jumpToNext()`
- if no candidates exist, fail honestly with a minimal disabled/empty state rather than pretending the mode is available
- if unresolved lifecycle gaps from `CCP-013` make even this entry step unsafe, stop and report that instead of papering over the missing seam

Before coding, provide:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run the most relevant task-specific check you can for this behavior
- explicitly verify:
  - after completing review on a game with eligible mistake candidates, the new affordance appears or becomes enabled
  - activating it jumps to the position before the first mistake candidate
  - games with no eligible candidates do not present a misleading active entry point
  - the candidate used for entry still obeys the source-backed retrospection floor: reviewed mainline move, stored best alternative line, and eligible mistake semantics
  - existing Review / Re-analyze behavior is unchanged
- report whether behavior changed intentionally
- report whether there are console/runtime errors
- report remaining risks and limitations, especially:
  - that the actual solve/accept/reveal loop is intentionally deferred
  - and whether any `CCP-013` lifecycle gaps still remain before true Lichess-style retrospection can work

Also include a short manual test checklist with concrete user actions and expected results. Keep it tightly scoped to this change.

Output shape:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks

In your final report, repeat the same `Task ID: CCP-014`.
```

## CCP-014-F1 — Used in Claude Code

- Task: hide the visible `Find Puzzles` button while keeping the current mistakes rollout intact
- Task ID: `CCP-014`
- Parent prompt ID: `CCP-014`
- Source document: `docs/NEXT_STEPS.md`
- Source step: `Priority 3, Item 10`
- Status: reviewed
- Review outcome: issues found
- Commit: local unstaged work
- Notes: the visible `Find Puzzles` trigger is removed, but the underlying `CCP-014` empty-candidate bug remains because the `Mistakes` button still opens an empty active session instead of failing honestly

```
Prompt ID: CCP-014-F1
Task ID: CCP-014
Parent Prompt ID: CCP-014
Source Document: docs/NEXT_STEPS.md
Source Step: Priority 3, Item 10

Task: Take the smallest safe follow-up step on the current-game mistakes/retrospection entry rollout by removing the visible `Find Puzzles` button from the analysis controls for now, while leaving the underlying puzzle-candidate plumbing intact.

Treat this as a temporary visibility rollback, not as a request to remove the puzzle-candidate subsystem or delete the extraction logic.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- `src/main.ts`
- `src/puzzles/extract.ts`
- `src/analyse/pgnExport.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/ARCHITECTURE.md`
- `docs/NEXT_STEPS.md`
- `docs/KNOWN_ISSUES.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `src/main.ts`
- `src/puzzles/extract.ts`
- `src/analyse/pgnExport.ts`

Because this task affects analysis-board controls layout and review-surface behavior, inspect relevant Lichess source before deciding implementation details. Start with:
- `~/Development/lichess-source/lila/ui/analyse/src/view/controls.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/view/actionMenu.ts`
- any closely related Lichess analysis-controls files you need for parity on minimal visible controls

Current repo-grounded diagnosis:
- the current local analysis controls row includes:
  - navigation buttons
  - review controls via `renderAnalysisControls(...)`
  - the new `Mistakes` entry button
  - and the visible `Find Puzzles` button injected from `renderFindPuzzlesButton(...)`
- right now the user only wants the mistakes entry visible
- the smallest safe step is presentation-only: hide/remove the visible `Find Puzzles` trigger without deleting the puzzle candidate state, extraction logic, or underboard puzzle candidate panel
- this should stay separate from broader retrospection or puzzle-product decisions

Implement only the smallest safe step:
- remove the visible `Find Puzzles` button from the current analysis controls UI for now
- preserve the underlying puzzle extraction/rendering code and saved-puzzle flow unless a tiny cleanup is directly required
- keep the current `Mistakes` button behavior intact
- do not redesign the review controls again
- do not delete puzzle candidate logic
- do not bundle any retrospection-state or solve-loop changes

A likely safe direction is:
- stop passing/rendering `renderFindPuzzlesButton(...)` in the controls surface
- leave `renderPuzzleCandidates(...)`, extraction state, and save-puzzle behavior untouched
- keep this as a UI visibility rollback only

Before coding, provide:
- prompt id
- task id
- parent prompt id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run the most relevant task-specific check you can for this behavior
- explicitly verify:
  - the `Find Puzzles` button is no longer visible in the analysis controls
  - the `Mistakes` button remains visible and unchanged
  - no unrelated review-control layout regression is introduced
  - underlying puzzle candidate UI/plumbing is still present in code and not accidentally removed
- report whether behavior changed intentionally
- report whether there are console/runtime errors
- report remaining risks and limitations, especially that this is only a visibility rollback and not a puzzle-subsystem removal

Also include a short manual test checklist with concrete user actions and expected results. Keep it tightly scoped to this change.

Output shape:
- prompt id
- task id
- parent prompt id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks

In your final report, repeat the same `Task ID: CCP-014`.
```

## CCP-015 — Used in Claude Code

- Task: add an exact-best-move-only retrospection solve loop for the current game
- Source document: `docs/NEXT_STEPS.md`
- Source step: `Priority 3, Item 10`
- Status: reviewed
- Review outcome: issues found
- Commit: local unstaged work
- Notes: adds the first solve loop and retro strip, but existing-child moves bypass win/fail judgment and failed attempts leave retry variations behind

```
Prompt ID: CCP-015
Task ID: CCP-015
Source Document: docs/NEXT_STEPS.md
Source Step: Priority 3, Item 10

Task: Add the smallest safe first-pass solve loop for current-game retrospection so the user can try the exact best move at a reviewed mistake position, then see the stored answer and advance, without adding broad practice-state complexity.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- any existing retrospection candidate/session module added in earlier steps
- `src/board/index.ts`
- `src/main.ts`
- `src/analyse/ctrl.ts`
- `src/engine/ctrl.ts`
- `src/analyse/pgnExport.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/ARCHITECTURE.md`
- `docs/NEXT_STEPS.md`
- `docs/KNOWN_ISSUES.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `src/board/index.ts`
- `src/main.ts`
- `src/analyse/ctrl.ts`
- `src/engine/ctrl.ts`
- `src/analyse/pgnExport.ts`

Because this task affects analysis-board practice behavior, inspect relevant Lichess source before deciding implementation details. Start with:
- `~/Development/lichess-source/lila/ui/analyse/src/retrospect/retroCtrl.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/retrospect/retroView.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/nodeFinder.ts`
- any closely related Lichess analyse/retrospect files you find necessary for first-pass acceptance and answer reveal flow

Current repo-grounded diagnosis:
- the roadmap explicitly says the first-pass acceptance rule should be exact engine best move only
- it also says success should reveal the stored best line and advance, while failure should show the expected move and line and allow continue / retry
- current Patzer repo does not yet have a dedicated retrospection session loop; board input still flows through the normal analysis board wiring
- `CCP-013` review found unresolved lifecycle problems, so this task must verify those seams are actually usable before building solve behavior on top
- the smallest safe step is not full Lichess-style practice parity
- the smallest safe step is a minimal current-game loop with exact-best-move acceptance only

Lichess parity requirement:
- use Lichess retrospect solve/reveal flow as the baseline before any Patzer-specific tuning
- specifically compare against:
  - `retroCtrl.ts` feedback states: `find`, `eval`, `win`, `fail`, `view`, `offTrack`
  - `retroCtrl.ts` `jumpToNext()`, `onJump()`, `onWin()`, `onFail()`, `viewSolution()`, and `skip()`
  - `retroView.ts` messaging and next/solution transitions
- do not tune thresholds, acceptance rules, or reveal sequencing away from Lichess in this task unless Patzer’s current data limitations force a temporary simplification
- if a temporary deviation is necessary, keep it minimal and call it out explicitly in remaining risks
- even though this first pass stays exact-best-only, preserve a controller/state shape that can later grow into Lichess-style `eval` / near-best acceptance instead of hard-coding one-off board checks

Implement only the smallest safe step:
- add a minimal retrospection session state for the current game only
- at a candidate position, accept only the exact stored best move
- on success, show the expected/best line and allow advancing to the next candidate
- on failure, show the expected move and line, then allow retry or continue
- keep the loop sequential through current-game candidates only
- do not add near-best acceptance by eval margin
- do not add opening/book cancellation
- do not add cross-game queueing or saved-puzzles coupling
- do not redesign board move handling broadly
- if inspection shows the unresolved `CCP-013` lifecycle seam still blocks this task, stop and report that rather than building a fake parallel flow

A likely safe direction is:
- intercept board move handling only when a retrospection session is active
- compare the attempted move against the stored candidate best move
- keep the session state in a dedicated small module rather than spreading conditionals across unrelated analysis code
- mirror the Lichess feedback-state progression as closely as current Patzer data allows, even if the first pass omits near-best acceptance
- keep explicit room in the state machine for later `eval` / `offTrack` / `view` parity instead of collapsing everything into a binary pass/fail toggle
- reveal stored answer data only after the user attempt result is known

Before coding, provide:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run the most relevant task-specific check you can for this behavior
- explicitly verify:
  - in retrospection mode, playing the exact stored best move counts as success
  - a non-best move triggers the failure/reveal path instead of silently proceeding
  - after success, the UI can advance to the next candidate
  - after failure, the user can retry or continue
  - normal analysis-board move handling is unchanged when retrospection is not active
  - the implementation does not foreclose later Lichess-style `eval` fallback and off-track handling
- report whether behavior changed intentionally
- report whether there are console/runtime errors
- report remaining risks and limitations, especially:
  - that near-best acceptance and broader practice-state parity are intentionally deferred
  - and whether unresolved `CCP-013` lifecycle gaps still limit true Lichess-style behavior

Also include a short manual test checklist with concrete user actions and expected results. Keep it tightly scoped to this change.

Output shape:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks

In your final report, repeat the same `Task ID: CCP-015`.
```

## CCP-013-F1 — Used in Claude Code

- Task: finish the missing live lifecycle and ceval wiring from `CCP-013`
- Source document: `docs/NEXT_STEPS.md`
- Source step: `Priority 3, Item 10`
- Status: reviewed
- Review outcome: issues found
- Commit: local unstaged work
- Notes: closes the dead-hook and ceval-caller gaps, but also bundles unrelated review-controls/export UI movement outside the scoped lifecycle repair

```
Prompt ID: CCP-013-F1
Task ID: CCP-013
Parent Prompt ID: CCP-013
Source Document: docs/NEXT_STEPS.md
Source Step: Priority 3, Item 10

Task: Finish the missing lifecycle wiring from `CCP-013` by making retrospection lifecycle hooks actually live and by wiring ceval updates into the retrospection controller, without starting the entry UI or solve loop yet.

Treat this as a focused repair prompt for the reviewed gaps in `CCP-013`, not as permission to move on to `CCP-014` or `CCP-015`.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- `src/analyse/retroCtrl.ts`
- `src/analyse/ctrl.ts`
- `src/main.ts`
- `src/engine/ctrl.ts`
- `src/board/index.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/ARCHITECTURE.md`
- `docs/NEXT_STEPS.md`
- `docs/KNOWN_ISSUES.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `src/analyse/retroCtrl.ts`
- `src/analyse/ctrl.ts`
- `src/main.ts`
- `src/engine/ctrl.ts`
- `src/board/index.ts`

Because this task affects analysis-controller lifecycle behavior, inspect relevant Lichess source before deciding implementation details. Start with:
- `~/Development/lichess-source/lila/ui/analyse/src/ctrl.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/retrospect/retroCtrl.ts`
- any closely related ceval hook sites in Lichess analyse ctrl you need for parity

Current repo-grounded diagnosis:
- `CCP-013` review found two concrete gaps:
  - `ctrl.retro?.onJump()` / `onMergeAnalysisData()` were added, but no `RetroCtrl` instance is actually attached anywhere, so those hooks are dead
  - `RetroCtrl.onCeval()` still exists only as a stub and there is still no caller from the engine lifecycle
- the current local code already has the intended seam names, so this should stay a repair of that seam rather than a redesign
- `CCP-014` should not proceed until this lifecycle work is genuinely live

Lichess parity requirement:
- use `ui/analyse/src/ctrl.ts` plus `retrospect/retroCtrl.ts` as the baseline for where retrospection is notified on:
  - jump/path changes
  - merge-analysis-data events
  - ceval updates
- do not broaden this into full solve behavior yet
- if the current Patzer data model forces a temporary simplification, keep it minimal and call it out explicitly

Implement only the smallest safe step:
- make sure a `RetroCtrl` instance can actually be attached at the real current-game lifecycle seam
- make the existing jump/merge hooks operate on a live controller rather than dead optional calls
- wire ceval/update notification from the engine lifecycle into retrospection
- keep this strictly structural
- do not add entry UI
- do not add solve acceptance / win / fail logic beyond what is strictly required for a live lifecycle seam
- do not bundle broader retrospection feature work
- do not dump new mode logic into `src/main.ts` if a smaller controller-owned or analysis-owned seam is safer

A likely safe direction is:
- identify the correct place to instantiate/attach retrospection for the current analysed game state
- preserve the existing hook names if they are already correct
- add the missing engine-side `onCeval()` call at the true ceval update point
- keep inactive retrospection behavior no-op and non-regressive for normal analysis

Before coding, provide:
- prompt id
- task id
- parent prompt id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run the most relevant task-specific check you can for this behavior
- explicitly verify:
  - a `RetroCtrl` instance is now actually attached where the lifecycle hooks can reach it
  - retrospection receives path/jump notifications on a live controller
  - retrospection receives ceval/update notifications from the engine lifecycle
  - normal analysis-board navigation and engine behavior remain unchanged when retrospection is inactive
- report whether behavior changed intentionally
- report whether there are console/runtime errors
- report remaining risks and limitations, especially that entry UI and solve-loop behavior are still deferred to later prompts

Also include a short manual test checklist with concrete user actions and expected results. Keep it tightly scoped to this repair.

Output shape:
- prompt id
- task id
- parent prompt id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks

In your final report, repeat the same `Task ID: CCP-013`.
```

## CCP-016 — Used in Claude Code

- Task: use persisted review labels in move-list and summary UI
- Source document: `docs/NEXT_STEPS.md`
- Source step: `Priority 3, Item 11`
- Status: reviewed
- Review outcome: issues found
- Commit: local unstaged work
- Notes: the label hydration and UI preference logic look correct, but the local work is bundled with unrelated retrospection lifecycle and controls changes outside the scoped label task

```
Prompt ID: CCP-016
Task ID: CCP-016
Source Document: docs/NEXT_STEPS.md
Source Step: Priority 3, Item 11

Task: Take the next smallest safe step on per-move review annotations by making restored analysis carry explicit persisted move labels through to the UI, so move-list and summary rendering can prefer stored review annotations instead of recomputing everything ad hoc from loss.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- `src/idb/index.ts`
- `src/main.ts`
- `src/engine/ctrl.ts`
- `src/analyse/moveList.ts`
- `src/analyse/evalView.ts`
- `src/engine/winchances.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/ARCHITECTURE.md`
- `docs/NEXT_STEPS.md`
- `docs/KNOWN_ISSUES.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `src/idb/index.ts`
- `src/main.ts`
- `src/engine/ctrl.ts`
- `src/analyse/moveList.ts`
- `src/analyse/evalView.ts`
- `src/engine/winchances.ts`

Because this task affects review annotation semantics, inspect relevant Lichess source before deciding implementation details. Start with:
- `~/Development/lichess-source/lila/ui/analyse/src/nodeFinder.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/view/components.ts`
- any closely related Lichess analyse files you find necessary for move-level review annotation usage

Current repo-grounded diagnosis:
- `docs/NEXT_STEPS.md` Item 11 says the project needs to formalize per-move review annotations rather than keep deriving labels ad hoc from eval cache everywhere
- current repo is in an in-between state:
  - `src/idb/index.ts` already persists `label` on `StoredNodeEntry`
  - `src/main.ts` restore flow hydrates `cp`, `mate`, `best`, `loss`, and `delta`, but not `label`
  - `src/engine/ctrl.ts` `PositionEval` has no `label` field yet
  - `src/analyse/moveList.ts` and `src/analyse/evalView.ts` still recompute labels directly from `loss`
- the smallest safe step is not full book support
- the smallest safe step is to carry persisted label annotations through the restore/runtime path and make UI consumers prefer them when present

Implement only the smallest safe step:
- extend the in-memory review/eval shape to carry persisted move labels
- hydrate those labels during analysis restore
- make move-list and summary rendering prefer stored labels when available
- keep a safe fallback to current `classifyLoss(loss)` behavior when a label is absent
- do not add book/opening lookup in this task
- do not redesign the whole analysis storage model
- do not bundle broader review UI redesign

A likely safe direction is:
- add a `label` field to the in-memory eval/review shape in the smallest appropriate place
- hydrate it from `StoredNodeEntry.label`
- update move-list / summary code to read `cached.label` first, then fall back to recomputation for older records or unevaluated paths

Before coding, provide:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run the most relevant task-specific check you can for this behavior
- explicitly verify:
  - restored saved analysis now carries persisted labels into the in-memory path
  - move-list glyph/label rendering prefers stored labels when present
  - analysis summary counts still behave correctly for both new and older records
  - older saved records without `label` still behave safely through fallback logic
  - no book/opening behavior was added in this task
- report whether behavior changed intentionally
- report whether there are console/runtime errors
- report remaining risks and limitations, especially that book-move support is intentionally deferred

Also include a short manual test checklist with concrete user actions and expected results. Keep it tightly scoped to this change.
```

## CCP-013 — Used in Claude Code

- Task: wire retrospection into analysis lifecycle events
- Source document: `docs/NEXT_STEPS.md`
- Source step: `Priority 3, Item 10`
- Status: reviewed
- Review outcome: issues found
- Commit: local unstaged work
- Notes: `ctrl.retro?.onJump()` / `onMergeAnalysisData()` were added, but no `RetroCtrl` instance is attached anywhere, so the hooks are currently dead; `onCeval()` also remains unwired

```
Prompt ID: CCP-013
Task ID: CCP-013
Source Document: docs/NEXT_STEPS.md
Source Step: Priority 3, Item 10

Task: Take the next smallest safe step on Lichess-style retrospection by wiring the dedicated retrospection controller into Patzer’s analysis lifecycle so it can react to jumps, board moves, and ceval updates, without finishing the full solve UX yet.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- any retrospection controller/module added for `CCP-015`
- `src/analyse/ctrl.ts`
- `src/main.ts`
- `src/board/index.ts`
- `src/engine/ctrl.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/ARCHITECTURE.md`
- `docs/NEXT_STEPS.md`
- `docs/KNOWN_ISSUES.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `src/analyse/ctrl.ts`
- `src/main.ts`
- `src/board/index.ts`
- `src/engine/ctrl.ts`

Because this task affects analysis controller lifecycle behavior, inspect relevant Lichess source before deciding implementation details. Start with:
- `~/Development/lichess-source/lila/ui/analyse/src/ctrl.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/retrospect/retroCtrl.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/retrospect/retroView.ts`

Current repo-grounded diagnosis:
- the crucial Lichess behavior is not just candidate selection; it is the lifecycle wiring between the main analysis controller and the retrospection controller
- in Lichess, retrospection is explicitly notified on:
  - jump/path changes
  - user jumps
  - ceval updates
  - mode toggling
- the current Patzer repo has no equivalent lifecycle hooks in `src/analyse/ctrl.ts` or its surrounding orchestration
- without this seam, later UI entry and solve-loop prompts will either fake the feature or scatter retrospection checks through unrelated code

Lichess parity requirement:
- use `ui/analyse/src/ctrl.ts` plus `retrospect/retroCtrl.ts` as the baseline for how retrospection hooks into the analysis lifecycle
- specifically inspect how Lichess calls retrospection on:
  - jump/path changes
  - user jump behavior
  - ceval updates
  - mode toggling
- do not invent a materially different integration pattern in this task unless the current Patzer controller shell forces a minimal temporary deviation

Implement only the smallest safe step:
- wire the dedicated retrospection controller into Patzer’s analysis lifecycle
- add the minimal hooks needed for later entry/solve tasks:
  - path/jump notification
  - user-move notification
  - ceval/update notification where relevant
- keep this task structural
- do not yet implement the full solve feedback UI
- do not yet tune acceptance thresholds
- do not bundle broad controller redesign
- do not dump medium-sized mode logic into `src/main.ts` if a smaller controller-owned seam is safer

A likely safe direction is:
- extend the Patzer analysis/controller layer with a small retrospection-aware lifecycle API
- keep the hooks narrow and named for the actual events they represent
- make later UI and board tasks consume this seam rather than reimplementing event detection

Before coding, provide:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run the most relevant task-specific check you can for this behavior
- explicitly verify:
  - the retrospection controller now receives analysis lifecycle events it needs for later solve flow
  - no normal analysis-board navigation or move handling regresses when retrospection is inactive
  - the change reduces future need to spread retrospection logic through `src/main.ts`
- report whether behavior changed intentionally
- report whether there are console/runtime errors
- report remaining risks and limitations, especially that solve feedback UI and final entry affordance remain separate follow-up tasks

Also include a short manual test checklist with concrete user actions and expected results. Keep it tightly scoped to this change.

Output shape:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks

In your final report, repeat the same `Task ID: CCP-013`.
```

## CCP-012 — Used in Claude Code

- Task: add a dedicated retrospection controller/state owner
- Source document: `docs/NEXT_STEPS.md`
- Source step: `Priority 3, Item 10`
- Status: reviewed
- Review outcome: passed
- Commit: local unstaged work
- Notes: reviewed against the current local `src/analyse/retroCtrl.ts`; dedicated controller skeleton is present and kept isolated from board input and main app wiring

```
Prompt ID: CCP-012
Task ID: CCP-012
Source Document: docs/NEXT_STEPS.md
Source Step: Priority 3, Item 10

Task: Take the next smallest safe step toward Lichess-style “Learn From Your Mistakes” parity by introducing a dedicated retrospection controller module that owns current candidate/session state and feedback state, without wiring it into board input yet.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- any retrospection candidate module added for `CCP-011`
- `src/analyse/ctrl.ts`
- `src/main.ts`
- `src/board/index.ts`
- `src/engine/ctrl.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/ARCHITECTURE.md`
- `docs/NEXT_STEPS.md`
- `docs/KNOWN_ISSUES.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `src/analyse/ctrl.ts`
- `src/main.ts`
- `src/board/index.ts`
- `src/engine/ctrl.ts`

Because this task affects analysis controller ownership and retrospection state semantics, inspect relevant Lichess source before deciding implementation details. Start with:
- `~/Development/lichess-source/lila/ui/analyse/src/retrospect/retroCtrl.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/ctrl.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/nodeFinder.ts`

Current repo-grounded diagnosis:
- the current Patzer repo has no dedicated retrospection controller equivalent
- Lichess post-game learning is not just a view; it is centered around a dedicated controller that owns:
  - current candidate/session state
  - `fault` / `prev` / `solution`
  - feedback states such as `find`, `eval`, `win`, `fail`, `view`, and `offTrack`
  - solved/completion progression helpers
- without that controller seam, later entry UI and solve-loop work will either bloat `src/main.ts` or spread mode state through unrelated modules
- the smallest safe step is not full activation
- the smallest safe step is a dedicated controller/state owner with a narrow API and no board-input wiring yet

Lichess parity requirement:
- treat `retrospect/retroCtrl.ts` as the structural baseline for controller ownership
- mirror the Lichess concepts of `current`, `feedback`, and candidate progression as closely as current Patzer data allows
- do not tune or simplify the state model unless the current Patzer data layer clearly forces it
- if a temporary simplification is necessary, keep it minimal and call it out explicitly

Implement only the smallest safe step:
- add a dedicated retrospection controller/module
- let it own:
  - current candidate/session state
  - feedback state
  - completion/progression helpers
  - basic candidate selection from the already-built retrospection candidate list
- keep it isolated from board input and UI rendering for now
- do not yet hook it into normal navigation or move handling
- do not yet add solve acceptance logic
- do not add cross-game inbox behavior
- do not grow `src/main.ts` unnecessarily

A likely safe direction is:
- add a small retrospection controller in the appropriate subsystem after inspection
- make it expose a minimal API that later tasks can wire into the board and view layers
- keep the first pass current-game-only and mainline-only

Before coding, provide:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run the most relevant task-specific check you can for this behavior
- explicitly verify:
  - the repo now has a dedicated retrospection controller/state owner
  - that controller can hold current candidate/session state without depending on ad hoc UI state
  - the change does not bloat `src/main.ts` with new retrospective mode logic
  - no existing analysis-board behavior changes yet as a side effect
- report whether behavior changed intentionally
- report whether there are console/runtime errors
- report remaining risks and limitations, especially that board-input and navigation wiring are intentionally deferred

Also include a short manual test checklist with concrete user actions and expected results. Keep it tightly scoped to this change.

Output shape:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks

In your final report, repeat the same `Task ID: CCP-012`.
```

## CCP-017 — Used in Claude Code

- Task: remove the move-list `Clear variations` button while keeping per-variation `×` deletion
- Source document: `docs/NEXT_STEPS.md`
- Source step: `Priority 4, Item 12`
- Status: reviewed
- Review outcome: passed
- Commit: `72f879d`
- Notes: reviewed against the actual commit and queued prompt; clean UI rollback that preserves per-variation deletion and leaves the underlying clear-all plumbing available for later reuse

```
Prompt ID: CCP-017
Task ID: CCP-017
Source Document: docs/NEXT_STEPS.md
Source Step: Priority 4, Item 12

Task: Remove the current move-list `Clear variations` button for now, while keeping the underlying variation-deletion plumbing intact and preserving the per-variation `×` affordance.

Treat the request as a deliberate temporary rollback of a cluttering UI control, not as a request to remove variation cleanup support entirely.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- `src/analyse/moveList.ts`
- `src/main.ts`
- `src/styles/main.scss`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/ARCHITECTURE.md`
- `docs/NEXT_STEPS.md`
- `docs/KNOWN_ISSUES.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `src/analyse/moveList.ts`
- `src/main.ts`
- `src/styles/main.scss`

Because this task affects move-list behavior and UI ownership, inspect relevant Lichess source before deciding implementation details. Start with:
- `~/Development/lichess-source/lila/ui/analyse/src/treeView/columnView.ts`
- any closely related Lichess move-list / variation-removal files you find necessary for comparison

Current repo-grounded diagnosis:
- the move list currently renders a bottom `Clear variations` action strip from `src/analyse/moveList.ts`
- the actual clear-all implementation still lives in `clearVariations()` in `src/main.ts`
- one-at-a-time variation deletion is separate and still rendered as a small `×` control beside each side variation
- the request is to reduce clutter by removing the clear-all button for now, not to remove the underlying variation-pruning logic

Implement only the smallest safe step:
- remove the current `Clear variations` button from the UI
- keep the per-variation `×` remove affordance working
- keep the underlying `clearVariations()` plumbing available in code for now unless a tiny cleanup is obviously safe
- remove or trim now-unused move-list action-strip styling only if it is directly tied to the removed button
- do not redesign the move list
- do not change one-at-a-time variation deletion semantics
- do not bundle broader variation-management cleanup

A likely safe direction is:
- stop passing/rendering the clear-all action through the move-list UI
- preserve the existing delete-per-variation path untouched
- keep this as a presentation-level rollback, not a behavior redesign

Before coding, provide:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run the most relevant task-specific check you can for this behavior
- explicitly verify:
  - the `Clear variations` button no longer appears in the move-list UI
  - per-variation `×` deletion still appears and still works
  - no move-list layout regression was introduced by removing the action strip
  - no unrelated variation behavior changed
- report whether behavior changed intentionally
- report whether there are console/runtime errors
- report remaining risks and limitations, especially that the underlying clear-all plumbing still exists in code and could be reintroduced later

Also include a short manual test checklist with concrete user actions and expected results. Keep it tightly scoped to this change.

Output shape:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks

In your final report, repeat the same `Task ID: CCP-017`.
```

## CCP-011 — Used in Claude Code

- Task: introduce a dedicated retrospection candidate shape and builder
- Source document: `docs/NEXT_STEPS.md`
- Source step: `Priority 3, Item 10`
- Status: reviewed
- Review outcome: passed
- Commit: `422d301`
- Notes: reviewed against the actual commit and the queued prompt text; pure builder extracted into `src/analyse/retro.ts` without coupling to the saved-puzzles subsystem

```
Prompt ID: CCP-011
Task ID: CCP-011
Source Document: docs/NEXT_STEPS.md
Source Step: Priority 3, Item 10

Task: Take the first smallest safe step toward a local per-game “Learn From Mistakes” flow by introducing a dedicated retrospection candidate shape and a pure builder that derives those candidates from completed review data, without adding the training UI yet.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- `src/puzzles/extract.ts`
- `src/engine/batch.ts`
- `src/tree/types.ts`
- `src/analyse/evalView.ts`
- `src/main.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/ARCHITECTURE.md`
- `docs/NEXT_STEPS.md`
- `docs/KNOWN_ISSUES.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `src/puzzles/extract.ts`
- `src/engine/batch.ts`
- `src/tree/types.ts`
- `src/analyse/evalView.ts`
- `src/main.ts`

Because this task affects analysis review semantics, inspect relevant Lichess source before deciding implementation details. Start with:
- `~/Development/lichess-source/lila/ui/analyse/src/retrospect/retroCtrl.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/retrospect/retroView.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/nodeFinder.ts`
- any closely related Lichess analyse/retrospect files you find necessary for mistake-candidate extraction shape

Current repo-grounded diagnosis:
- `docs/NEXT_STEPS.md` now gives a much more specific MVP shape for a local per-game “Learn From Mistakes” flow
- current repo already has some of the raw ingredients:
  - `src/engine/batch.ts` computes reviewed mainline eval data including `loss`, `best`, and missed-tactic signals
  - `src/puzzles/extract.ts` already scans reviewed mainline data into `PuzzleCandidate[]`, but that shape is puzzle-oriented and blunder-only
  - `src/tree/types.ts` currently defines `PuzzleCandidate`, but there is no dedicated retrospective candidate type
- the smallest safe step is not to build the training loop yet
- the smallest safe step is to formalize a dedicated retrospective candidate shape and pure extraction path so later UI work stops depending on ad hoc puzzle-oriented state

Lichess parity requirement:
- use Lichess retrospect behavior as the baseline, not just loose inspiration
- specifically compare Patzer’s candidate extraction against:
  - `retrospect/retroCtrl.ts` current/fault/prev/solution structure
  - `nodeFinder.ts` `evalSwings(...)`
- do not tune thresholds, acceptance logic, or sequencing away from Lichess in this task unless the current Patzer data model clearly cannot support parity yet
- if a temporary deviation from Lichess is necessary, keep it minimal and call it out explicitly in remaining risks

Implement only the smallest safe step:
- introduce a dedicated per-game retrospection candidate type matching the current roadmap intent as closely as the existing data safely supports
- build a pure candidate-extraction function from reviewed mainline data
- keep this separate from the saved-puzzles subsystem
- keep the first version mainline-only
- include mistake / blunder level moves and missed mate-in-3 style cases when the current reviewed data supports them
- do not add the actual training UI yet
- do not add cross-game inbox behavior
- do not invent major new ownership in `src/main.ts`

A likely safe direction is:
- add a small dedicated retrospection module in the most appropriate existing area after inspection
- define a candidate shape that can safely include current repo-backed fields such as:
  - `gameId`
  - `path`
  - `fenBefore`
  - `playedMove`
  - `bestMove`
  - `classification`
  - `loss`
  - `isMissedMate`
  - `playerColor`
- include `bestLine` only if the currently stored review data already supports it safely without speculative reconstruction; otherwise, leave that as a clearly noted follow-up
- mirror Lichess retrospection concepts as closely as current Patzer data allows before introducing Patzer-specific adjustments
- keep the builder pure and reusable by later UI/session steps

Before coding, provide:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run the most relevant task-specific check you can for this behavior
- explicitly verify:
  - the repo now has a dedicated retrospection candidate shape separate from `PuzzleCandidate`
  - the extraction path builds candidates from completed review data rather than from ad hoc UI state
  - mistake/blunder candidates still reflect current reviewed mainline data correctly
  - the change does not couple the new shape to the saved-puzzles subsystem
- report whether behavior changed intentionally
- report whether there are console/runtime errors
- report remaining risks and limitations, especially any fields from the roadmap MVP that are still not safely derivable from current review output

Also include a short manual test checklist with concrete user actions and expected results. Keep it tightly scoped to this change.

Output shape:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks

In your final report, repeat the same `Task ID: CCP-011`.
```

## CCP-006 — Used in Claude Code

- Task: honest minimum `analysis-game` route surface
- Source document: `docs/NEXT_STEPS.md`
- Source step: `Priority 4, Item 13`
- Status: reviewed
- Review outcome: issues found
- Commit: `b21200c`
- Notes: route honesty improved, but `analysis-game` can still render a permanent "Loading…" state when there are no imported games because empty library and loading are not distinguished

```
Prompt ID: CCP-006
Task ID: CCP-006
Source Document: docs/NEXT_STEPS.md
Source Step: Priority 4, Item 13

Task: Implement the honest minimum route surface by taking the smallest safe step to replace one route-level placeholder with a real minimal workflow, starting with `analysis-game`.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- `src/router.ts`
- `src/main.ts`
- `src/games/view.ts`
- `src/idb/index.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/ARCHITECTURE.md`
- `docs/NEXT_STEPS.md`
- `docs/KNOWN_ISSUES.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `src/router.ts`
- `src/main.ts`
- `src/games/view.ts`
- `src/idb/index.ts`

Because this task affects analysis-board workflow shape and route honesty, inspect relevant Lichess source before deciding implementation details. Start with:
- `~/Development/lichess-source/lila/ui/analyse/src/ctrl.ts`
- any closely related Lichess analyse route / deep-link files you find necessary for minimal route-entry behavior

Current repo-grounded diagnosis:
- `docs/NEXT_STEPS.md` Item 13 says `analysis-game` and `puzzles` are still route-level placeholders
- current code confirms:
  - `src/router.ts` defines an `analysis-game` route
  - `src/main.ts` currently renders only a placeholder heading for `analysis-game`
  - `src/main.ts` also renders only a placeholder heading for `puzzles`
- the smallest safe step is not to implement both routes at once
- the smallest safe step is to make one of them honest and minimally functional first
- `analysis-game` is the better first target because it sits closer to the existing analysis-board workflow and imported-game state

Implement only the smallest safe step:
- replace the `analysis-game` placeholder with the minimum real behavior that makes the route honest
- keep this scoped to `analysis-game` only
- do not implement the `puzzles` route in this task
- do not redesign routing broadly
- do not bundle new product behavior beyond what is required for a minimal truthful route
- do not grow `src/main.ts` unnecessarily if a tiny helper extraction is clearly safer

A likely safe direction is:
- make `#/analysis/:id` resolve to an actual imported game when the id exists
- load that game into the existing analysis-board flow
- handle missing/unknown ids honestly with a minimal fallback message instead of a fake workflow
- preserve the current analysis page behavior for normal `#/analysis`

Before coding, provide:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run the most relevant task-specific check you can for this behavior
- explicitly verify:
  - visiting a valid `#/analysis/:id` route opens the intended imported game in the analysis board
  - visiting an unknown id gives an honest minimal fallback instead of pretending the route works
  - normal `#/analysis` behavior is unchanged
  - no placeholder heading remains for `analysis-game`
- report whether behavior changed intentionally
- report whether there are console/runtime errors
- report remaining risks and limitations, especially that `puzzles` route honesty is intentionally deferred to a follow-up step

Also include a short manual test checklist with concrete user actions and expected results. Keep it tightly scoped to this change.

Output shape:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks

In your final report, repeat the same `Task ID: CCP-006`.
```

## CCP-010 — Used in Claude Code

- Task: fix excessive vertical spacing in short move lists while preserving the sticky footer
- Source document: `docs/NEXT_STEPS.md`
- Source step: `Priority 4, Item 12`
- Status: reviewed
- Review outcome: passed
- Commit: `35788dd`
- Notes: reviewed against the actual commit and the queued prompt text

```text
Prompt ID: CCP-010
Task ID: CCP-010
Source Document: docs/NEXT_STEPS.md
Source Step: Priority 4, Item 12

Task: Take the next smallest safe step on move-list layout cleanup by fixing the new excessive vertical spacing that appears when the move list is shorter than the move-list panel, while preserving the sticky bottom `Clear variations` strip added in `CCP-009`.

Treat the rough request as intent, not guaranteed implementation truth. The current repo now has a pinned bottom action strip for `Clear variations`, but on shorter games the move rows are spaced far apart and no longer pack naturally the way they did before this recent layout work.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- `src/styles/main.scss`
- `src/analyse/moveList.ts`
- `src/main.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/ARCHITECTURE.md`
- `docs/NEXT_STEPS.md`
- `docs/KNOWN_ISSUES.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `src/styles/main.scss`
- `src/analyse/moveList.ts`
- `src/main.ts`

Because this task affects move-list / analysis-board layout behavior, inspect relevant Lichess source before deciding implementation details. Start with:
- `~/Development/lichess-source/lila/ui/lib/css/tree/_tree.scss`
- `~/Development/lichess-source/lila/ui/analyse/css/_tools.scss`
- any closely related Lichess move-list layout files you need to compare normal row packing versus scroll/panel layout

Current repo-grounded diagnosis:
- `docs/NEXT_STEPS.md` Priority 4, Item 12 still owns move-list review behavior cleanup
- the sticky footer work in `CCP-009` changed `.analyse__moves`, `.move-list-inner`, and `.tview2-column` layout behavior in `src/styles/main.scss`
- the current bad behavior appears only when the move list is too short to need scrolling
- the move rows should still pack naturally at the top of the list, with the action strip pinned at the bottom of the panel
- this task should stay focused on the spacing regression, not on new controls or tree behavior

Implement only the smallest safe step:
- fix the excessive vertical spacing in short move lists
- preserve the sticky bottom `Clear variations` strip behavior from `CCP-009`
- preserve normal scroll behavior for long move lists
- prefer the smallest CSS/layout correction that restores natural move-row packing
- do not bundle new variation-management actions
- do not redesign the tools column broadly
- do not change move-tree logic unless absolutely required for the layout fix

Before coding, provide:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run the most relevant task-specific check you can for this behavior
- explicitly verify:
  - short move lists no longer show large vertical gaps between rows
  - long move lists still scroll correctly
  - the `Clear variations` strip remains pinned at the bottom of the move-list panel
  - no obvious regression is introduced in variation rows or mainline row alignment
- report whether behavior changed intentionally
- report whether there are console/runtime errors
- report remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results. Keep it tightly scoped to this change.

Output shape:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks

In your final report, repeat the same `Task ID: CCP-010`.
```

## CCP-007 — Used in Claude Code

- Task: small review-state messaging improvement
- Source document: `docs/NEXT_STEPS.md`
- Source step: `Priority 4, Item 14`
- Status: reviewed
- Review outcome: passed
- Commit: `a6d7726`
- Notes: reviewed against the actual commit; implementation stayed narrowly scoped to analysis controls rather than broader game-list messaging

```text
Prompt text not recovered from the original creation step. The prompt intent is preserved by the matching queue entry and reviewed commit.
```

## CCP-009 — Used in Claude Code

## CCP-008 — Used in Claude Code

- Task: move `Clear variations` into a move-list bottom action strip
- Source document: `docs/NEXT_STEPS.md`
- Source step: `Priority 4, Item 12`
- Status: reviewed
- Review outcome: passed
- Commit: `5e3f99f`
- Notes: reviewed against the actual commit and the queued prompt text

```
Prompt ID: CCP-008
Task ID: CCP-008
Source Document: docs/NEXT_STEPS.md
Source Step: Priority 4, Item 12

Task: Take the next smallest safe step on move-list variation cleanup by moving the current `Clear variations` control out of the top of the move list and into a small bottom action strip that lives inside the move-list area, with brief styling that matches the existing move-list visual language.

Treat the rough request as intent, not guaranteed implementation truth. The current repo already has a top-of-move-list `Clear variations` button wired from `src/main.ts`, and variation row removal lives in `src/analyse/moveList.ts`. Ground your work in the code that exists today.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- `src/analyse/moveList.ts`
- `src/styles/main.scss`
- `src/main.ts`
- `src/tree/ops.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/ARCHITECTURE.md`
- `docs/NEXT_STEPS.md`
- `docs/KNOWN_ISSUES.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `src/analyse/moveList.ts`
- `src/styles/main.scss`
- `src/main.ts`
- `src/tree/ops.ts`

Because this task affects move-list / analysis-board behavior and ownership, inspect relevant Lichess source before deciding implementation details. Start with:
- `~/Development/lichess-source/lila/ui/analyse/src/treeView/columnView.ts`
- `~/Development/lichess-source/lila/ui/analyse/css/_tools.scss`
- any closely related Lichess move-list / tree-view files you need for bottom-of-panel action placement

Current repo-grounded diagnosis:
- `docs/NEXT_STEPS.md` Priority 4, Item 12 still owns clear-variations / move-list cleanup work
- the current `Clear variations` control is rendered from `src/main.ts` above `renderMoveList(...)`
- the move list itself is rendered in `src/analyse/moveList.ts`
- move-list styling and scroll-container behavior live in `src/styles/main.scss`
- the rough request about a “small strip of potential options” should be interpreted as a small move-list-owned bottom action strip, not as a broader feature bundle unless the current code clearly requires it

Implement only the smallest safe step:
- move the clear-variations affordance into the bottom of the move-list area
- keep ownership with the move-list rendering/styling layer instead of adding more UI glue to `src/main.ts`
- style it lightly so it fits the current move-list / interrupt-block visual language
- if the current code supports it cleanly, use a small bottom action strip/container that can hold this action and future move-list actions
- do not bundle new variation-management behavior beyond what is needed for this placement/styling step
- do not redesign the move list broadly
- do not change tree mutation semantics unless a tiny ownership adjustment is required

Before coding, provide:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run the most relevant task-specific check you can for this behavior
- explicitly verify:
  - `Clear variations` is no longer rendered at the top of the move list
  - the action now appears at the bottom inside the move-list area
  - the action still appears only when side variations exist
  - the clear-variations behavior itself still works
  - the move-list scroll behavior is still usable after the layout change
- report whether behavior changed intentionally
- report whether there are console/runtime errors
- report remaining risks and limitations, especially if the “bottom action strip” is intentionally minimal and not yet a broader options tray

Also include a short manual test checklist with concrete user actions and expected results. Keep it tightly scoped to this change.

Output shape:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks

In your final report, repeat the same `Task ID: CCP-008`.
```

## CCP-005 — Used in Claude Code

- Task: clear user-created side variations and restore move list to mainline order
- Source document: `docs/NEXT_STEPS.md`
- Source step: `Priority 4, Item 12`
- Status: reviewed
- Review outcome: passed
- Commit: `0f52625`
- Notes: reviewed against the actual commit and the queued prompt text

```
Prompt ID: CCP-005
Task ID: CCP-005
Source Document: docs/NEXT_STEPS.md
Source Step: Priority 4, Item 12

Task: Take the next smallest safe step on variation cleanup by adding a move-list action to clear user-created side variations and reset the tree view back to the imported/mainline move order, without wiping engine evaluation or completed review data for the mainline.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- `src/analyse/moveList.ts`
- `src/tree/ops.ts`
- `src/main.ts`
- `src/board/index.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/ARCHITECTURE.md`
- `docs/NEXT_STEPS.md`
- `docs/KNOWN_ISSUES.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `src/analyse/moveList.ts`
- `src/tree/ops.ts`
- `src/main.ts`
- `src/board/index.ts`

Because this task affects analysis-board move-tree behavior, inspect relevant Lichess source before deciding implementation details. Start with:
- `~/Development/lichess-source/lila/ui/analyse/src/treeView/columnView.ts`
- `~/Development/lichess-source/lila/ui/lib/src/tree/tree.ts`
- any closely related Lichess tree-view or variation-management files you find necessary for reset / clear-variation behavior

Current repo-grounded diagnosis:
- `docs/NEXT_STEPS.md` still lists clear-variations / reset flows as unfinished under Priority 4, Item 12
- the repo already has the first per-variation remove affordance in `src/analyse/moveList.ts` and branch deletion support in `src/tree/ops.ts`
- current code also shows the active path is repaired when a deleted variation contains the current node
- the next remaining safe step is not broader move-list polish
- it is the explicit move-list action to clear user-created side variations and restore the visible tree to the imported/mainline move order
- this must stay careful about not wiping mainline eval data or completed review data

Implement only the smallest safe step:
- add a single move-list action to clear user-created side variations
- keep this scoped to resetting the move tree back to the imported/mainline move order
- do not wipe mainline engine evaluation
- do not wipe completed game-review data for the mainline
- do not redesign variation persistence broadly
- do not bundle unrelated graph or route work
- do not turn this into a general tree-management rewrite

A likely safe direction is:
- define exactly which non-mainline branches count as removable user-created variations
- add one clear/reset action in the move-list area
- remove those side branches while preserving the mainline path and current-path validity
- keep eval/review caches intact unless a very small targeted repair is required for correctness

Before coding, provide:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run the most relevant task-specific check you can for this behavior
- explicitly verify:
  - after creating side variations, the new clear/reset action removes user-created side branches
  - the imported/mainline move order remains intact
  - the active path is repaired to a valid remaining path after reset
  - mainline engine evaluation and completed review data are not wiped by the reset action
  - existing one-at-a-time variation removal still works
- report whether behavior changed intentionally
- report whether there are console/runtime errors
- report remaining risks and limitations, especially any persistence limitations that remain for later cleanup

Also include a short manual test checklist with concrete user actions and expected results. Keep it tightly scoped to this change.

Output shape:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks

In your final report, repeat the same `Task ID: CCP-005`.
```

## CCP-004 — Used in Claude Code

- Task: style variation remove button to match move-list visual language
- Source document: inferred from commit/review history
- Source step: unknown
- Status: reviewed
- Review outcome: passed
- Commit: `165eae0`
- Notes: prompt text not recovered; prompt id was reconstructed after the fact from commit order and review context

```
Prompt text not recovered. This history entry was reconstructed after review from the commit history and review thread.
```

## CCP-003 — Used in Claude Code

- Task: first move-list variation removal affordance
- Source document: `docs/NEXT_STEPS.md`
- Source step: `Priority 4, Item 12`
- Status: reviewed
- Review outcome: issues found
- Commit: `526eaf9`
- Notes: variation deletion is not actually persisted across reload; `saveGamesToIdb()` stores imported game PGN/path, not the mutated move tree, so deleted branches can reappear after reload

```
Prompt text not recovered. This history entry was reconstructed after review from the prompt log and review thread.
```

## CCP-056 — Reviewed

- Task: add a persisted main-menu toggle for board-wheel move navigation and default it to off
- Task ID: `CCP-056`
- Parent prompt ID: none
- Source document: inferred from user request in chat
- Source step: `make board-wheel move navigation a main-menu setting that defaults to off`
- Execution target: `Codex`
- Status: reviewed
- Review outcome: passed
- Commit: `444a919`
- Notes: current code stores the wheel-navigation preference in `src/board/cosmetics.ts`, exposes it in the global menu in `src/header/index.ts`, and gates the board listener in `src/main.ts`; the default remains off when no localStorage preference exists

## CCP-040 — Reviewed

- Task: take the first small safe wishlist step on eval-graph display and formatting
- Task ID: `CCP-040`
- Parent prompt ID: none
- Source document: `docs/WISHLIST.md`
- Source step: `Changes to how the eval graph is displayed and formatted`
- Status: reviewed
- Review outcome: passed
- Commit: `444a919`
- Notes: `src/analyse/evalView.ts` now uses the already-computed divider data to render visible Opening / Middlegame / Endgame chart labels without changing the hover/scrub behavior tracked separately

## CCP-042 — Reviewed

- Task: move the analysis-page Review/Re-analyze control beside Prev/Flip/Next in the smallest safe way
- Task ID: `CCP-042`
- Parent prompt ID: none
- Source document: `docs/WISHLIST.md`
- Source step: `Move the analysis-page Review / Re-analyze button beside the move-navigation buttons`
- Status: reviewed
- Review outcome: passed
- Commit: `444a919`
- Notes: `renderAnalysisControls()` now renders in the controls row beside Prev/Flip/Next, and the old underboard placement is gone without adding broader control-layout glue

## CCP-044 — Reviewed

- Task: add the first safe eval label beside the primary engine arrow
- Task ID: `CCP-044`
- Parent prompt ID: none
- Source document: `docs/WISHLIST.md`
- Source step: `Add tag or label next to engine move arrows showing what their eval is`
- Status: reviewed
- Review outcome: passed
- Commit: `444a919`
- Notes: `src/engine/ctrl.ts` now attaches a Chessground square label derived from `formatScore(currentEval)` to the primary engine-arrow destination, without expanding the feature to secondary arrows

## CCP-045 — Reviewed

- Task: prevent obviously duplicate game reimports in the smallest safe way
- Task ID: `CCP-045`
- Parent prompt ID: none
- Source document: `docs/WISHLIST.md`
- Source step: `we shouldn't re import the same games that have already been imported`
- Status: reviewed
- Review outcome: passed
- Commit: `444a919`
- Notes: `dedupeImportedGames()` in `src/main.ts` now blocks exact-PGN duplicates against both the existing library and duplicates within the incoming batch, while leaving the rest of the import flow unchanged

## CCP-046 — Reviewed

- Task: take the first safe step toward incremental imports and temporary new-import badging
- Task ID: `CCP-046`
- Parent prompt ID: none
- Source document: `docs/WISHLIST.md`
- Source step: `Import only new games since last import`
- Status: reviewed
- Review outcome: passed
- Commit: `444a919`
- Notes: newly kept imports are stamped with `importedAt`, persisted through the normal game-library save path, and surfaced as time-bounded `NEW` badges in both compact game rows and the full Games table

## CCP-057 — Reviewed

- Task: diagnose and fix the live-engine navigation stall so PV lines and arrows keep matching the current position during move-by-move review
- Task ID: `CCP-057`
- Parent prompt ID: none
- Source document: `docs/KNOWN_ISSUES.md`
- Source step: `[HIGH] Live per-move engine analysis can stall during move navigation`
- Execution target: `Codex`
- Status: reviewed
- Review outcome: passed
- Commit: `444a919`
- Notes: current `src/engine/ctrl.ts` clears `engineSearchActive` before resuming `pendingEval` after discarding a stale interrupted-search `bestmove`, which prevents the permanent live-analysis stall during rapid navigation and keeps reevaluation flowing on the active node

## CCP-051 — Reviewed

- Task: add the first safe KO overlay for the losing king on immediate mate positions
- Task ID: `CCP-051`
- Parent prompt ID: none
- Source document: `docs/WISHLIST.md`
- Source step: `When M1 is played on the board, the losing king should get a KO symbol over it`
- Execution target: `Codex`
- Status: reviewed
- Review outcome: passed
- Commit: `94ea40e`
- Notes: `src/engine/ctrl.ts` uses the existing Chessground square-label seam to place a KO label on the losing king only when the current eval is terminal mate, without inventing a new board asset pipeline

## CCP-052 — Reviewed

- Task: hide board arrows during active batch game review and restore them when review finishes
- Task ID: `CCP-052`
- Parent prompt ID: none
- Source document: `docs/WISHLIST.md`
- Source step: `when game review button is pressed, all arrows should be removed from board until game review is completed`
- Execution target: `Codex`
- Status: reviewed
- Review outcome: passed
- Commit: `94ea40e`
- Notes: live board arrows are now suppressed whenever batch review is active, and `syncArrow()` is called on review start, stop, and completion so the board returns cleanly to normal engine-arrow behavior

## CCP-053 — Reviewed

- Task: add a setting that filters review-dot visibility to the current user perspective while defaulting to both
- Task ID: `CCP-053`
- Parent prompt ID: none
- Source document: `docs/WISHLIST.md`
- Source step: `Setting to toggle only the users whose perspective we are looking at to have their move review annotated dot colour shown`
- Execution target: `Codex`
- Status: reviewed
- Review outcome: passed
- Commit: `94ea40e`
- Notes: the persisted `reviewDotsUserOnly` setting now flows from `src/board/cosmetics.ts` through the header menu into both move-list and eval-graph review-annotation rendering, while preserving the current both-sides default

## CCP-055 — Reviewed

- Task: implement mate-display UI polish so checkmate is shown as `#KO!` in the move list and engine display, and make the engine-display `#KO!` purple
- Task ID: `CCP-055`
- Parent prompt ID: none
- Source document: inferred from user request in chat
- Source step: `mate-display UI polish so checkmate is shown as #KO! in the move list and engine display`
- Execution target: `Codex`
- Status: reviewed
- Review outcome: passed
- Commit: `94ea40e`
- Notes: move-list mate display, shared score formatting, and ceval styling now consistently use `#KO!`, with a dedicated purple treatment for the engine-display KO state

## CCP-058 — Reviewed

- Task: fix the eval-graph mate bug where a terminal KO/checkmate for White plots at the bottom instead of staying at the top
- Task ID: `CCP-058`
- Parent prompt ID: none
- Source document: inferred from user request in chat
- Source step: `eval graph bug where White KO drops to the bottom instead of staying at the top`
- Execution target: `Codex`
- Status: reviewed
- Review outcome: passed
- Commit: `94ea40e`
- Notes: `src/analyse/evalView.ts` now uses the FEN side-to-move to special-case terminal KO graph placement, so White KO stays at the top and Black KO stays at the bottom

## CCP-059 — Reviewed

- Task: add the first safe portrait-mobile single-column analysis layout
- Task ID: `CCP-059`
- Parent prompt ID: none
- Source document: `docs/mini-sprints/MOBILE_ANALYSIS_USABILITY_SPRINT_2026-03-21.md`
- Source step: `Task 1 — Add a real mobile analysis layout mode`
- Execution target: `Codex`
- Status: reviewed
- Review outcome: passed
- Commit: `94ea40e`
- Notes: `src/styles/main.scss` adds a narrow-screen `.analyse` single-column layout with the intended board, controls, tools, underboard order while leaving desktop layout intact

## CCP-060 — Reviewed

- Task: hide low-value desktop chrome on mobile to preserve board space
- Task ID: `CCP-060`
- Parent prompt ID: none
- Source document: `docs/mini-sprints/MOBILE_ANALYSIS_USABILITY_SPRINT_2026-03-21.md`
- Source step: `Task 2 — Hide low-value chrome on mobile`
- Execution target: `Codex`
- Status: reviewed
- Review outcome: passed
- Commit: `94ea40e`
- Notes: the mobile breakpoint now hides the eval bar, player strips, and resize handle while tightening surrounding spacing to reclaim space for the board

## CCP-061 — Reviewed

- Task: make the current analysis controls mobile-friendly and board-adjacent
- Task ID: `CCP-061`
- Parent prompt ID: none
- Source document: `docs/mini-sprints/MOBILE_ANALYSIS_USABILITY_SPRINT_2026-03-21.md`
- Source step: `Task 3 — Move board navigation and Review into a mobile-friendly control block`
- Execution target: `Codex`
- Status: reviewed
- Review outcome: passed
- Commit: `94ea40e`
- Notes: the mobile controls block now sits directly below the board, allows wrapping, and enlarges button tap targets without changing the existing analysis-control semantics

## CCP-062 — Reviewed

- Task: relax the desktop tools-column assumptions so mobile ceval, PVs, move list, retro strip, and summary stack readably
- Task ID: `CCP-062`
- Parent prompt ID: none
- Source document: `docs/mini-sprints/MOBILE_ANALYSIS_USABILITY_SPRINT_2026-03-21.md`
- Source step: `Task 4 — Make the tools column readable as a mobile stack`
- Execution target: `Codex`
- Status: reviewed
- Review outcome: passed
- Commit: `94ea40e`
- Notes: the mobile breakpoint removes fixed-height tools assumptions, lets the tools area size naturally, and bounds the move list with its own scrollable mobile height

## CCP-063 — Reviewed

- Task: tidy mobile underboard spacing and overflow so graph and game list stay reachable below tools
- Task ID: `CCP-063`
- Parent prompt ID: none
- Source document: `docs/mini-sprints/MOBILE_ANALYSIS_USABILITY_SPRINT_2026-03-21.md`
- Source step: `Task 5 — Make underboard truly secondary on mobile`
- Execution target: `Codex`
- Status: reviewed
- Review outcome: passed
- Commit: `94ea40e`
- Notes: the mobile underboard keeps graph and game-list content below the tools stack with reduced gaps and explicit width/overflow constraints to avoid horizontal spill

## CCP-064 — Reviewed

- Task: add one minimal touch usability improvement using the sprint’s low-risk larger-targets option
- Task ID: `CCP-064`
- Parent prompt ID: none
- Source document: `docs/mini-sprints/MOBILE_ANALYSIS_USABILITY_SPRINT_2026-03-21.md`
- Source step: `Task 6 — Add one minimal touch usability improvement`
- Execution target: `Codex`
- Status: reviewed
- Review outcome: passed
- Commit: `94ea40e`
- Notes: the same mobile controls block now uses larger tap targets plus `touch-action: pan-y`, which is the intended minimal-touch improvement without adding gesture logic

## CCP-043-F1 — Reviewed

- Task: replace the current player-strip winner star with styled green/red winner-loser boxes containing username, rating, and board color
- Task ID: `CCP-043`
- Parent prompt ID: `CCP-043`
- Source document: `docs/WISHLIST.md`
- Source step: `Remove the 1 / 0 / ½ single-game result markers from the player strip by default`
- Execution target: `Codex`
- Status: reviewed
- Review outcome: passed
- Commit: local worktree (uncommitted)
- Notes: the current local player-strip implementation replaces the old winner-only star with boxed winner/loser identity clusters in `src/board/index.ts` and `src/styles/main.scss`, while keeping the rest of the strip layout intact

## CCP-044-F1 — Reviewed

- Task: refine engine-arrow eval labels so they are off by default, configurable in engine settings, and integrated into arrowheads for primary, secondary, and played arrows
- Task ID: `CCP-044`
- Parent prompt ID: `CCP-044`
- Source document: `docs/WISHLIST.md`
- Source step: `Add tag or label next to engine move arrows showing what their eval is`
- Execution target: `Codex`
- Status: reviewed
- Review outcome: passed
- Commit: local worktree (uncommitted)
- Notes: the current local engine-arrow implementation adds a persisted `showArrowLabels` setting in `src/engine/ctrl.ts`, exposes it in `src/ceval/view.ts`, and renders enabled labels through Chessground `customSvg` centered on the arrow label position for primary, secondary, and eligible played arrows

## CCP-065 — Reviewed

- Task: verify exact Lichess move-review label rendering and add a persisted engine-setting toggle that shows or hides visible review labels in Patzer
- Task ID: `CCP-065`
- Parent prompt ID: none
- Source document: `docs/archive/MOVE_QUALITY_AUDIT_2026-03-20.md`
- Source step: `Lichess-style move review label visibility parity`
- Execution target: `Claude Code`
- Status: reviewed
- Review outcome: passed
- Commit: local worktree (uncommitted)
- Notes: the current local implementation keeps review-label visibility in the move list, adds a persisted `showReviewLabels` setting in `src/engine/ctrl.ts`, exposes it in `src/ceval/view.ts`, and gates move-list review-glyph fallback in `src/analyse/moveList.ts` without changing review computation or stored analysis data

## CCP-043-F2 — Reviewed

- Task: refine the player-strip winner/loser boxes so they hug the displayed identity width and use border-only styling without a background fill
- Task ID: `CCP-043`
- Parent prompt ID: `CCP-043-F1`
- Source document: `docs/WISHLIST.md`
- Source step: `Remove the 1 / 0 / ½ single-game result markers from the player strip by default`
- Execution target: `Codex`
- Status: reviewed
- Review outcome: passed
- Commit: `ef3ed70`
- Notes: the current implementation keeps the winner/loser identity cluster intact while changing `.player-strip__identity` to size to content instead of stretching and removing the earlier fill treatment in favor of border-only winner/loser color cues

## CCP-044-F3 — Reviewed

- Task: refine move-arrow label typography so the numbers are much smaller and less bold while keeping the current shadow
- Task ID: `CCP-044`
- Parent prompt ID: `CCP-044-F2`
- Source document: `ad hoc user request`
- Source step: `reduce move-arrow label size and font weight`
- Execution target: `Codex`
- Status: reviewed
- Review outcome: passed
- Commit: `934a960`
- Notes: the current implementation reduces arrow-label SVG text from the earlier oversized `font-size="22"` and `font-weight="700"` to `font-size="12"` and `font-weight="500"` in `src/engine/ctrl.ts` while preserving the existing shadow stroke treatment.

## CCP-067-F1 — Reviewed

- Task: fix eval-graph fill so white territory rises from the bottom of the graph instead of shading from the middle line
- Task ID: `CCP-067`
- Parent prompt ID: `CCP-067`
- Source document: `ad hoc user request`
- Source step: `make eval-graph white fill rise from the bottom of the chart instead of the center line`
- Execution target: `Codex`
- Status: reviewed
- Review outcome: passed
- Commit: `9a7a823`
- Notes: the current implementation closes the white fill polygon to the bottom of the graph instead of the center line, so white territory now rises from the bottom while keeping graph interaction intact.

## CCP-044-F4 — Reviewed

- Task: refine engine-arrow labels to 10/400/2 and make both arrows and labels fade in subtly on first appearance
- Task ID: `CCP-044`
- Parent prompt ID: `CCP-044-F3`
- Source document: `ad hoc user request`
- Source step: `reduce arrow label typography to 10/400/2 and add subtle fade-in for new arrow labels and arrows`
- Execution target: `Codex`
- Status: reviewed
- Review outcome: passed
- Commit: `9a7a823`
- Notes: `src/engine/ctrl.ts` now uses `font-size="10"`, `font-weight="400"`, and `stroke-width="2"` for arrow-label SVG text, and `src/styles/main.scss` adds a short fade-in animation for arrow/label shape groups.

## CCP-069 — Reviewed

- Task: refine the eval graph so it uses a center drag handle, keeps Lichess-style white fill, and removes phase labels
- Task ID: `CCP-069`
- Parent prompt ID: none
- Source document: `ad hoc user request`
- Source step: `replace eval-graph slider with a center drag handle, keep Lichess-style white fill, and remove phase labels`
- Execution target: `Codex`
- Status: reviewed
- Review outcome: passed
- Commit: `4f2aa23`
- Notes: the current graph uses a center-bottom resize handle with bounded drag-based height control and no longer renders the earlier on-chart phase labels.

## CCP-067 — Reviewed

- Task: bring the eval-graph fill behavior into Lichess parity so White advantage fills white
- Task ID: `CCP-067`
- Parent prompt ID: none
- Source document: `docs/WISHLIST.md`
- Source step: `Changes to how the eval graph is displayed and formatted`
- Execution target: `Codex`
- Status: reviewed
- Review outcome: passed
- Commit: `4891f59`
- Notes: the original parity step replaced the old neutral center-closed fill with a Lichess-inspired white/black territory model using clipped graph areas above and below the origin.

## CCP-068 — Reviewed

- Task: add a small bottom-center eval-graph control that enlarges graph height from 100% up to 300%
- Task ID: `CCP-068`
- Parent prompt ID: none
- Source document: `ad hoc user request`
- Source step: `add a bottom-center eval-graph height toggle from 100% to 300%`
- Execution target: `Codex`
- Status: reviewed
- Review outcome: passed
- Commit: `4f2aa23`
- Notes: the current graph-height control is a small center-bottom drag handle rather than a click toggle, but it provides the requested 100% to 300% bounded resize behavior.

## CCP-066 — Reviewed

- Task: add a search bar to both the underboard games list and the Games page using the smallest safe shared search/filter step
- Task ID: `CCP-066`
- Parent prompt ID: none
- Source document: `ad hoc user request`
- Source step: `add a search bar to the underboard games list and the Games history page`
- Execution target: `Codex`
- Status: reviewed
- Review outcome: issues found
- Commit: `934a960`
- Notes: the underboard compact game list still has no search bar, and the Games page still exposes only the older opponent-only search instead of a shared broader text search across both surfaces.

## CCP-035-F1 — Reviewed

- Task: fix the remaining engine-arrowhead instability so line-count or nearby arrow-setting changes do not make the main arrowhead disappear
- Task ID: `CCP-035`
- Parent prompt ID: `CCP-035`
- Source document: `docs/KNOWN_ISSUES.md`
- Source step: `[MEDIUM] Changing engine line count can make the main engine arrowhead disappear`
- Execution target: `Codex`
- Status: reviewed
- Review outcome: passed
- Commit: `1d43adc`
- Notes: the current engine-arrow path uses stable registered brush keys and plain red played-arrow brushes, which removes the earlier line-count/settings transition seam that could drop the main arrowhead marker.

## CCP-044-F2 — Reviewed

- Task: refine engine-arrow label styling so the text is smaller and visually matches the eval-bar score
- Task ID: `CCP-044`
- Parent prompt ID: `CCP-044-F1`
- Source document: `docs/WISHLIST.md`
- Source step: `Add tag or label next to engine move arrows showing what their eval is`
- Execution target: `Codex`
- Status: reviewed
- Review outcome: issues found
- Commit: `934a960`
- Notes: this refinement did not land as requested before the later `CCP-044-F3` and `CCP-044-F4` follow-ups changed the label styling in a different direction, so the original eval-bar-matching step is not cleanly present as its own completed prompt.

## CCP-066-F1 — Used in Claude Code

- Task: add the missing search bar to the compact games list beneath the analysis board
- Task ID: `CCP-066`
- Parent prompt ID: `CCP-066`
- Source document: `docs/prompts/CLAUDE_PROMPT_LOG.md`
- Source step: `CCP-066 review issue — underboard list still has no search bar`
- Execution target: `Codex`
- Status: reviewed
- Review outcome: issues found
- Commit: `2ed815a`
- Notes: the underboard compact list in `src/games/view.ts` still renders without any search control, so this follow-up did not actually land.

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-070 — Used in Claude Code

- Task: copy the Lichess board review glyph SVG system into Patzer as the source layer without wiring it into the board yet
- Task ID: `CCP-070`
- Parent prompt ID: none
- Source document: `ad hoc user request`
- Source step: `copy Lichess board move-review glyph SVGs exactly into Patzer as the source glyph layer`
- Execution target: `Codex`
- Status: reviewed
- Review outcome: issues found
- Commit: `e1a3068`
- Notes: `src/analyse/boardGlyphs.ts` exists and matches the Lichess source layer, but the same landing also bundled board wiring and the settings toggle, so the source-only step was not isolated.

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-071 — Used in Claude Code

- Task: render Lichess-style board review glyph SVG badges on the analysis board using destination-square anchoring and stacking
- Task ID: `CCP-071`
- Parent prompt ID: none
- Source document: `ad hoc user request`
- Source step: `render Lichess-style move-review glyph SVGs on the analysis board in the same way Lichess does`
- Execution target: `Codex`
- Status: reviewed
- Review outcome: passed
- Commit: `e1a3068`
- Notes: the current board-shape pipeline now renders review glyph SVG badges for the active node via `annotationShapes(...)` and destination-square anchoring in `src/engine/ctrl.ts`.

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-072 — Used in Claude Code

- Task: add a persisted engine-settings toggle for board review glyphs and default it on
- Task ID: `CCP-072`
- Parent prompt ID: none
- Source document: `ad hoc user request`
- Source step: `add an engine-settings toggle for board review glyphs and default it on`
- Execution target: `Codex`
- Status: reviewed
- Review outcome: passed
- Commit: `e1a3068`
- Notes: `showBoardReviewGlyphs` now persists in `src/engine/ctrl.ts`, and `src/ceval/view.ts` exposes the board-review checkbox in engine settings with a default-on posture.

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-073 — Used in Claude Code

- Task: clear the first cohesive current typecheck slice across board, ceval, and engine files without tackling the whole backlog
- Task ID: `CCP-073`
- Parent prompt ID: none
- Source document: `docs/KNOWN_ISSUES.md`
- Source step: `[HIGH] npm run typecheck is wired but surfaces type errors`
- Execution target: `Codex`
- Status: reviewed
- Review outcome: passed
- Commit: `2ed815a`
- Notes: the current repo `npm run typecheck -- --pretty false` passes cleanly, so this board/ceval/engine slice is no longer part of the backlog.

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-074 — Used in Claude Code

- Task: clear the next cohesive current typecheck slice across games, imports, keyboard, router, and shell files
- Task ID: `CCP-074`
- Parent prompt ID: none
- Source document: `docs/KNOWN_ISSUES.md`
- Source step: `[HIGH] npm run typecheck is wired but surfaces type errors`
- Execution target: `Codex`
- Status: reviewed
- Review outcome: passed
- Commit: `2ed815a`
- Notes: the current repo `npm run typecheck -- --pretty false` also passes for the import/shell slice, so this follow-on typecheck task is complete too.

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-075 — Used in Claude Code

- Task: fix the board resize handle so it appears and works reliably in Safari
- Task ID: `CCP-075`
- Parent prompt ID: none
- Source document: `docs/KNOWN_ISSUES.md`
- Source step: `[MEDIUM] Board resize handle does not reliably appear or work in Safari`
- Execution target: `Codex`
- Status: reviewed
- Review outcome: passed
- Commit: `2ed815a`
- Notes: the board resize handle now uses pointer-aware binding in `src/board/index.ts` plus stronger Safari-friendly CSS in `src/styles/main.scss`, which is the intended small reliability step.

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-076 — Used in Claude Code

- Task: make the existing book-aware retrospection cancellation seam live by wiring an opening provider into active candidate generation
- Task ID: `CCP-076`
- Parent prompt ID: none
- Source document: `docs/KNOWN_ISSUES.md`
- Source step: `[MEDIUM] Book-aware retrospection cancellation seam is defined but not live`
- Execution target: `Codex`
- Status: reviewed
- Review outcome: passed
- Commit: `2ed815a`
- Notes: `toggleRetro()` in `src/main.ts` now builds and passes a live opening provider into `buildRetroCandidates(...)`, so the earlier dead opening-cancellation seam is now actually active.

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-077 — Used in Claude Code

- Task: tighten eval-graph hover and scrub interaction so graph-driven review works as intended
- Task ID: `CCP-077`
- Parent prompt ID: none
- Source document: `docs/KNOWN_ISSUES.md`
- Source step: `[MEDIUM] Eval graph hover/scrub behavior is not yet working as expected`
- Execution target: `Codex`
- Status: reviewed
- Review outcome: passed
- Commit: `2ed815a`
- Notes: `src/analyse/evalView.ts` now uses nearest-point `pointermove` / scrub handling instead of the earlier fixed-strip hover model, which resolves the dead-zone issue from the prior graph review.

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-078 — Used in Claude Code

- Task: fix the move-list variation context menu so it opens over the selected move instead of at the page origin
- Task ID: `CCP-078`
- Parent prompt ID: none
- Source document: `docs/KNOWN_ISSUES.md`
- Source step: `[MEDIUM] Move-list variation context menu can open at the top-left of the page`
- Execution target: `Codex`
- Status: reviewed
- Review outcome: passed
- Commit: `2ed815a`
- Notes: `openContextMenu(...)` and `positionContextMenu(...)` in `src/main.ts` now derive stable coordinates from the event/target and clamp the menu into the viewport, so the top-left placement bug is gone.

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-079 — Used in Claude Code

- Task: reduce the on-board review glyph badge scale from 40% to 20% while preserving the existing badge system
- Task ID: `CCP-079`
- Parent prompt ID: none
- Source document: `ad hoc user request`
- Source step: `reduce on-board review glyph SVG scale from 40% to 20%`
- Execution target: `Codex`
- Status: reviewed
- Review outcome: issues found
- Commit: `2ed815a`
- Notes: `src/analyse/boardGlyphs.ts` still uses `transform="matrix(.4 0 0 .4 ...)"`, so the requested 20% reduction never landed.

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-083 — Used in Claude Code

- Task: establish a real puzzle module seam and route surface so `#/puzzles` no longer depends on placeholder logic in `src/main.ts`
- Task ID: `CCP-083`
- Parent prompt ID: none
- Source document: `docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md`
- Source step: `Task 1 — Establish real puzzle module ownership and route surface`
- Execution target: `Claude Code`
- Status: reviewed
- Review outcome: passed
- Commit: `6b58ee3`
- Notes: the app now routes `#/puzzles` and `#/puzzles/:id` through the owned `src/puzzles/index.ts` seam and delegates route rendering out of `src/main.ts`.

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-084 — Used in Claude Code

- Task: introduce a Patzer-owned puzzle-round model and a compatibility seam from persisted `PuzzleCandidate` records
- Task ID: `CCP-084`
- Parent prompt ID: none
- Source document: `docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md`
- Source step: `Task 2 — Introduce a richer puzzle round model without breaking saved candidates`
- Execution target: `Claude Code`
- Status: reviewed
- Review outcome: passed
- Commit: `6b58ee3`
- Notes: `src/puzzles/types.ts` and `src/puzzles/round.ts` now own the round model and compatibility conversion from saved candidates.

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-085 — Used in Claude Code

- Task: replace the placeholder puzzles page with a real saved-puzzle library view backed by current local IDB state
- Task ID: `CCP-085`
- Parent prompt ID: none
- Source document: `docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md`
- Source step: `Task 3 — Replace the placeholder puzzles route with a saved-puzzle library view`
- Execution target: `Claude Code`
- Status: reviewed
- Review outcome: passed
- Commit: `6b58ee3`
- Notes: `renderPuzzleLibrary(...)` in `src/puzzles/view.ts` now gives `#/puzzles` a real saved-puzzle library surface with empty-state and list behavior.

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-086 — Used in Claude Code

- Task: create a dedicated minimal puzzle round controller that owns active puzzle state, phase, and solution progress
- Task ID: `CCP-086`
- Parent prompt ID: none
- Source document: `docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md`
- Source step: `Task 4 — Add a minimal puzzle round controller`
- Execution target: `Claude Code`
- Status: reviewed
- Review outcome: passed
- Commit: `6b58ee3`
- Notes: `src/puzzles/ctrl.ts` now owns minimal round state, progress, feedback, and result handling instead of leaving that logic in analysis glue.

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-087 — Used in Claude Code

- Task: wire puzzle-mode board moves through strict solution validation and scripted reply playback
- Task ID: `CCP-087`
- Parent prompt ID: none
- Source document: `docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md`
- Source step: `Task 5 — Route board moves through strict puzzle validation and scripted replies`
- Execution target: `Claude Code`
- Status: reviewed
- Review outcome: issues found
- Commit: `6b58ee3`
- Notes: the validation and auto-reply seam exists, but `restoreRoundBoard(...)` replays puzzle progress with `playUciMove(...)`, which can mutate the live source-game analysis tree by inserting best-line variations.

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-088 — Used in Claude Code

- Task: add puzzle-specific feedback and round controls for correct, wrong, solved, next, and view-solution states
- Task ID: `CCP-088`
- Parent prompt ID: none
- Source document: `docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md`
- Source step: `Task 6 — Add puzzle feedback and round controls`
- Execution target: `Claude Code`
- Status: reviewed
- Review outcome: passed
- Commit: `6b58ee3`
- Notes: `renderPuzzleRound(...)` now provides puzzle-owned feedback text and round controls instead of reusing generic analysis controls.

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-089 — Used in Claude Code

- Task: add a lightweight puzzle metadata side panel using source-game and puzzle context that Patzer already owns
- Task ID: `CCP-089`
- Parent prompt ID: none
- Source document: `docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md`
- Source step: `Task 7 — Add the puzzle metadata / side-panel surface`
- Execution target: `Claude Code`
- Status: reviewed
- Review outcome: passed
- Commit: `6b58ee3`
- Notes: the puzzle route now renders a lightweight source-game metadata panel with move, loss, opening, and source-game context.

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-090 — Used in Claude Code

- Task: persist a lightweight local puzzle session so saved-puzzle progress can survive reloads and continue cleanly
- Task ID: `CCP-090`
- Parent prompt ID: none
- Source document: `docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md`
- Source step: `Task 8 — Persist lightweight local puzzle session state`
- Execution target: `Claude Code`
- Status: reviewed
- Review outcome: passed
- Commit: `6b58ee3`
- Notes: `src/puzzles/session.ts` plus puzzle-session IDB load/save now preserve local saved-puzzle progress across reloads.

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-091 — Used in Claude Code

- Task: tighten the bridge from Patzer’s game-review flow to its saved-puzzle flow so the puzzle page feels like a direct downstream tool of review data
- Task ID: `CCP-091`
- Parent prompt ID: none
- Source document: `docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md`
- Source step: `Task 9 — Tighten review-to-puzzle integration`
- Execution target: `Claude Code`
- Status: reviewed
- Review outcome: passed
- Commit: `6b58ee3`
- Notes: the existing review-derived candidate flow now links cleanly into the owned puzzle route via saved puzzles and route ids instead of a placeholder page.

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-092 — Used in Claude Code

- Task: stop recomputing legal move destinations from FEN on every navigation step and move to a cached destination seam
- Task ID: `CCP-092`
- Parent prompt ID: none
- Source document: `docs/reference/patzer-board-motion-lag-audit.md`
- Source step: `Next deep fix 1 — cache legal move destinations instead of recomputing them on every navigation step`
- Execution target: `Claude Code`
- Status: reviewed
- Review outcome: passed
- Commit: `6b58ee3`
- Notes: `src/board/index.ts` now caches Chessground destination maps by FEN instead of recomputing them on every board sync.

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-093 — Used in Claude Code

- Task: switch engine-overlay updates onto a narrower Chessground auto-shape path and skip no-op shape rebuilds
- Task ID: `CCP-093`
- Parent prompt ID: none
- Source document: `docs/reference/patzer-board-motion-lag-audit.md`
- Source step: `Next deep fix 2 — switch to narrower Chessground auto-shape updates and skip no-op shape rebuilds`
- Execution target: `Claude Code`
- Status: reviewed
- Review outcome: passed
- Commit: `cb0e443`
- Notes: `applyAutoShapes(...)` in `src/engine/ctrl.ts` now hashes the outgoing payload and avoids pushing unchanged auto-shape sets back into Chessground.

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```

## CCP-094 — Used in Claude Code

- Task: remove the Patzer board-overlay fade so arrows and custom SVG overlays appear immediately during move stepping
- Task ID: `CCP-094`
- Parent prompt ID: none
- Source document: `docs/reference/patzer-board-motion-lag-audit.md`
- Source step: `Next deep fix 3 — remove Patzer overlay fade animation from board arrows and custom SVGs`
- Execution target: `Claude Code`
- Status: reviewed
- Review outcome: passed
- Commit: `cb0e443`
- Notes: the current board overlay CSS no longer carries a Patzer-specific fade animation for arrow/custom SVG layers, so overlay stepping uses the immediate baseline.

```
Prompt text not recovered. This history entry was reconstructed from the prompt queue and review state.
```
