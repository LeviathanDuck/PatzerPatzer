# Claude Prompt Queue

Use this file to store Claude Code prompts that are ready to run in a future Claude session.

## How to use it

- Add full copy-paste-ready prompts here when they are created.
- Do not add review status here.
- Do not add queue status text by default. A queued prompt is simply present in this file.
- Keep a top-of-file queue index that lists only the prompts currently still queued.
- In that queue index, format each item as:
  - first line: `- CCP-###: Short Task Title`
  - second line: an indented bullet with a brief target description
- Leave one blank line between queue-index items for readability.
- Keep the queue index concise and scan-friendly.
- Keep the queue index in sync with the prompt blocks below:
  - add a new index item when a prompt is created
  - remove the matching index item when the prompt is removed from this file during review
- Add a scan-friendly Markdown heading immediately before each prompt block:
  - format: `## prompt-id - short task title`
  - keep this heading outside the fenced prompt block
- Use plain fenced Markdown blocks with no language tag for queued prompts.
- Keep the prompt metadata header near the top of each prompt:
  - `Prompt ID: CCP-###`
  - `Task ID: CCP-###`
  - `Parent Prompt ID: CCP-###` if this is a follow-up fix prompt
  - `Source Document: docs/...`
  - `Source Step: ...`
- For a follow-up fix prompt:
  - `Prompt ID` must use the next `-F#` modifier, such as `CCP-013-F1`
  - `Task ID` must stay the root family id, such as `CCP-013`
  - `Parent Prompt ID` should point to the reviewed prompt being fixed
- Once a queued prompt has actually been used in Claude Code and then reviewed:
  - remove it from this file
  - add or update its reviewed entry in `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_LOG.md`

## Queue Index

- CCP-095: Establish Lichess Dataset Workspace
  - Add a repo-safe ignored local workspace for raw Lichess puzzle downloads and generated shard output.

- CCP-096: Add Lichess Puzzle Download Script
  - Add an explicit script to fetch the official `lichess_db_puzzle.csv.zst` export into the local dataset workspace.

- CCP-097: Build Lichess Puzzle Shard Pipeline
  - Convert the official export into Patzer-friendly generated manifest and shard files instead of loading raw CSV in the browser.

- CCP-098: Add Imported Puzzle Loader Seam
  - Add Patzer-owned imported-puzzle types and a loader that adapts generated Lichess shards into the app’s puzzle model.

- CCP-099: Add Imported Puzzle Source Switch
  - Let the puzzles page switch between local saved puzzles and imported Lichess puzzles.

- CCP-100: Open Imported Lichess Puzzle Rounds
  - Open imported Lichess puzzle records inside Patzer’s own puzzle controller and board flow.

- CCP-101: Add Imported Puzzle Filters And Paging
  - Add basic rating, theme, and opening filters plus lazy shard paging for the imported Lichess library.

## Queue

## CCP-095 - Establish Lichess Dataset Workspace

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

## CCP-096 - Add Lichess Puzzle Download Script

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

## CCP-097 - Build Lichess Puzzle Shard Pipeline

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

## CCP-098 - Add Imported Puzzle Loader Seam

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

## CCP-099 - Add Imported Puzzle Source Switch

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

## CCP-100 - Open Imported Lichess Puzzle Rounds

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

## CCP-101 - Add Imported Puzzle Filters And Paging

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
