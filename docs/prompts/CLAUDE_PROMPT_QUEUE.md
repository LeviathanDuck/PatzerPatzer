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

- CCP-083: Establish Puzzle Route Ownership
  - Create a real puzzle module seam and route surface so `#/puzzles` no longer depends on placeholder logic in `src/main.ts`.

- CCP-084: Add Puzzle Round Model
  - Introduce Patzer-owned puzzle-round types and a compatibility seam from saved `PuzzleCandidate` records.

- CCP-085: Render Saved Puzzle Library
  - Replace the placeholder puzzles page with a real saved-puzzle list backed by existing local IDB state.

- CCP-086: Add Puzzle Round Controller
  - Create a dedicated puzzle controller for active round state before wiring the full solve loop.

- CCP-087: Validate Puzzle Moves And Auto-Reply
  - Route puzzle-mode board moves through strict solution checking and scripted opponent replies.

- CCP-088: Add Puzzle Feedback And Round Controls
  - Add puzzle-specific feedback and after-round controls instead of reusing generic analysis chrome.

- CCP-089: Add Puzzle Side Panel Metadata
  - Add a lightweight metadata panel for source-game and puzzle context using only data Patzer already owns.

- CCP-090: Persist Local Puzzle Session
  - Save lightweight local puzzle session progress so saved-puzzle rounds can continue cleanly across reloads.

- CCP-091: Tighten Review-To-Puzzle Integration
  - Make Patzer’s game-review and saved-puzzle flow feel like one coherent local workflow.

- CCP-092: Cache Board Move Destinations
  - Stop recomputing legal move destinations from FEN on every navigation step so board sync is cheaper.

- CCP-093: Narrow Board Auto-Shape Updates
  - Switch engine-overlay shape updates to a narrower Chessground path and skip no-op shape rebuilds.

- CCP-094: Remove Board Overlay Fade Animation
  - Remove the Patzer-only arrow and custom-SVG fade animation so move stepping stops re-animating overlays.

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

## CCP-083 - Establish Puzzle Route Ownership

```
Prompt ID: CCP-083
Task ID: CCP-083
Source Document: docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md
Source Step: Task 1 — Establish real puzzle module ownership and route surface
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle / routing / main-shell files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step to create a real puzzle module seam and route `#/puzzles` through it instead of keeping puzzle-page behavior as placeholder logic in `src/main.ts`.

Inspect first:
- Patzer: `src/main.ts`, `src/router.ts`, `src/puzzles/extract.ts`, `src/idb/index.ts`
- Lichess: `~/Development/lichess-source/lila/ui/puzzle/src/ctrl.ts`, `~/Development/lichess-source/lila/ui/puzzle/src/view/main.ts`

Constraints:
- scope this to ownership and route surface only
- do not implement solve-loop behavior, feedback UI, or public-dataset ingestion
- do not add substantial new puzzle logic to `src/main.ts`

Deliverables:
- diagnosis before coding
- exact small step being implemented
- why that step is safely scoped
- implementation
- validation
- short manual test checklist

Validation:
- run `npm run build`
- report Prompt ID, Task ID, build result, intentional behavior change, runtime/console status, and remaining risks
```

## CCP-084 - Add Puzzle Round Model

```
Prompt ID: CCP-084
Task ID: CCP-084
Source Document: docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md
Source Step: Task 2 — Introduce a richer puzzle round model without breaking saved candidates
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle-type / tree-type / IDB files.
- If overlapping work exists, stop and report it before editing.

Task: introduce a Patzer-owned puzzle-round model and a compatibility seam from persisted `PuzzleCandidate` records without bundling UI or route work.

Inspect first:
- Patzer: `src/tree/types.ts`, `src/puzzles/extract.ts`, `src/idb/index.ts`, current `src/puzzles/*`
- Lichess: `~/Development/lichess-source/lila/ui/puzzle/src/interfaces.ts`, `~/Development/lichess-source/lila/ui/puzzle/src/moveTree.ts`

Constraints:
- scope this to types, conversion, and persistence compatibility
- do not implement puzzle-solving UI
- do not redesign the whole IDB layer
- prefer a `src/puzzles/` type owner over overloading generic tree types if that is cleaner

Deliverables:
- diagnosis before coding
- exact small step being implemented
- why that step is safely scoped
- implementation
- validation
- short manual test checklist

Validation:
- run `npm run build`
- report Prompt ID, Task ID, build result, compatibility results, runtime/console status, and remaining risks
```

## CCP-085 - Render Saved Puzzle Library

```
Prompt ID: CCP-085
Task ID: CCP-085
Source Document: docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md
Source Step: Task 3 — Replace the placeholder puzzles route with a saved-puzzle library view
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle route / puzzle view / saved-puzzle files.
- If overlapping work exists, stop and report it before editing.

Task: replace the placeholder puzzles page with a real saved-puzzle library view backed by current local IDB state, while keeping the page focused on browsing rather than full round solving.

Inspect first:
- Patzer: `src/main.ts`, `src/idb/index.ts`, `src/puzzles/extract.ts`, current `src/puzzles/*`
- Lichess: `~/Development/lichess-source/lila/ui/puzzle/src/view/main.ts`, `~/Development/lichess-source/lila/ui/puzzle/src/view/side.ts`

Constraints:
- scope this to the saved-puzzle library page
- do not implement the full solve loop here
- do not invent rating/theme/popularity metadata Patzer does not own
- do not pull in the public Lichess puzzle database

Deliverables:
- diagnosis before coding
- exact small step being implemented
- why that step is safely scoped
- implementation
- validation
- short manual test checklist

Validation:
- run `npm run build`
- report Prompt ID, Task ID, build result, saved-puzzle library behavior, runtime/console status, and remaining risks
```

## CCP-086 - Add Puzzle Round Controller

```
Prompt ID: CCP-086
Task ID: CCP-086
Source Document: docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md
Source Step: Task 4 — Add a minimal puzzle round controller
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle controller / board integration / route-selection files.
- If overlapping work exists, stop and report it before editing.

Task: create a dedicated minimal puzzle round controller that owns active puzzle state, phase, and solution progress before the full solve loop is wired into the board.

Inspect first:
- Patzer: `src/analyse/ctrl.ts`, `src/analyse/retroCtrl.ts`, current `src/puzzles/*`, `src/board/index.ts` as needed
- Lichess: `~/Development/lichess-source/lila/ui/puzzle/src/ctrl.ts`, `~/Development/lichess-source/lila/ui/puzzle/src/interfaces.ts`

Constraints:
- scope this to controller ownership and minimal state only
- do not yet wire full move validation or scripted replies
- do not reimplement the full retrospection controller
- do not add substantial puzzle state logic to `src/main.ts`

Deliverables:
- diagnosis before coding
- exact small step being implemented
- why that step is safely scoped
- implementation
- validation
- short manual test checklist

Validation:
- run `npm run build`
- report Prompt ID, Task ID, build result, controller-state behavior, runtime/console status, and remaining risks
```

## CCP-087 - Validate Puzzle Moves And Auto-Reply

```
Prompt ID: CCP-087
Task ID: CCP-087
Source Document: docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md
Source Step: Task 5 — Route board moves through strict puzzle validation and scripted replies
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle controller / board move-handling / tree path files.
- If overlapping work exists, stop and report it before editing.

Task: wire puzzle-mode board moves through strict solution validation and scripted reply playback, keeping the solve loop puzzle-owned rather than analysis-owned.

Inspect first:
- Patzer: `src/board/index.ts`, `src/analyse/retroCtrl.ts`, current `src/puzzles/*`, related tree helpers
- Lichess: `~/Development/lichess-source/lila/ui/puzzle/src/moveTest.ts`, `~/Development/lichess-source/lila/ui/puzzle/src/view/chessground.ts`, `~/Development/lichess-source/lila/ui/puzzle/src/ctrl.ts`

Constraints:
- scope this to puzzle-mode move validation and auto-replies
- do not add live-engine hints or public-dataset logic
- do not break normal analysis-board move handling

Deliverables:
- diagnosis before coding
- exact small step being implemented
- why that step is safely scoped
- implementation
- validation
- short manual test checklist

Validation:
- run `npm run build`
- report Prompt ID, Task ID, build result, puzzle move-validation behavior, runtime/console status, and remaining risks
```

## CCP-088 - Add Puzzle Feedback And Round Controls

```
Prompt ID: CCP-088
Task ID: CCP-088
Source Document: docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md
Source Step: Task 6 — Add puzzle feedback and round controls
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle view / feedback / control-bar files.
- If overlapping work exists, stop and report it before editing.

Task: add puzzle-specific feedback and round controls for correct, wrong, solved, next, and view-solution states instead of leaning on generic analysis-board UI.

Inspect first:
- Patzer: `src/analyse/retroView.ts`, current `src/puzzles/*`, any small main-shell render seam only if required
- Lichess: `~/Development/lichess-source/lila/ui/puzzle/src/view/feedback.ts`, `~/Development/lichess-source/lila/ui/puzzle/src/view/after.ts`, `~/Development/lichess-source/lila/ui/puzzle/src/view/main.ts`

Constraints:
- scope this to puzzle feedback and control UI
- do not redesign the whole analysis tools column
- do not bundle session history or public puzzle metadata

Deliverables:
- diagnosis before coding
- exact small step being implemented
- why that step is safely scoped
- implementation
- validation
- short manual test checklist

Validation:
- run `npm run build`
- report Prompt ID, Task ID, build result, puzzle feedback/control behavior, runtime/console status, and remaining risks
```

## CCP-089 - Add Puzzle Side Panel Metadata

```
Prompt ID: CCP-089
Task ID: CCP-089
Source Document: docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md
Source Step: Task 7 — Add the puzzle metadata / side-panel surface
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle view / metadata / source-game link files.
- If overlapping work exists, stop and report it before editing.

Task: add a lightweight puzzle metadata side panel using source-game and puzzle context Patzer already owns, without inventing public puzzle-catalog semantics.

Inspect first:
- Patzer: `src/idb/index.ts`, `src/puzzles/extract.ts`, current `src/puzzles/*`, `src/games/view.ts` if existing metadata helps
- Lichess: `~/Development/lichess-source/lila/ui/puzzle/src/view/side.ts`, `~/Development/lichess-source/lila/ui/puzzle/src/interfaces.ts`

Constraints:
- scope this to metadata display
- do not invent ratings, vote counts, or theme tags Patzer does not own
- do not bundle session persistence or new routing systems

Deliverables:
- diagnosis before coding
- exact small step being implemented
- why that step is safely scoped
- implementation
- validation
- short manual test checklist

Validation:
- run `npm run build`
- report Prompt ID, Task ID, build result, metadata-panel behavior, runtime/console status, and remaining risks
```

## CCP-090 - Persist Local Puzzle Session

```
Prompt ID: CCP-090
Task ID: CCP-090
Source Document: docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md
Source Step: Task 8 — Persist lightweight local puzzle session state
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle session / local persistence / IDB files.
- If overlapping work exists, stop and report it before editing.

Task: persist a lightweight local puzzle session so saved-puzzle progress can survive reloads and continue cleanly, without introducing account or server assumptions.

Inspect first:
- Patzer: `src/idb/index.ts`, current `src/puzzles/*`, `src/main.ts` only for the minimum restore seam if required
- Lichess: `~/Development/lichess-source/lila/ui/puzzle/src/session.ts`, `~/Development/lichess-source/lila/ui/puzzle/src/ctrl.ts`

Constraints:
- scope this to lightweight local session state
- do not redesign the whole puzzle store
- do not introduce server, account, or rating assumptions
- do not bundle broader review-data persistence changes

Deliverables:
- diagnosis before coding
- exact small step being implemented
- why that step is safely scoped
- implementation
- validation
- short manual test checklist

Validation:
- run `npm run build`
- report Prompt ID, Task ID, build result, local puzzle-session behavior, runtime/console status, and remaining risks
```

## CCP-091 - Tighten Review-To-Puzzle Integration

```
Prompt ID: CCP-091
Task ID: CCP-091
Source Document: docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md
Source Step: Task 9 — Tighten review-to-puzzle integration
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same review / retrospection / saved-puzzle integration files.
- If overlapping work exists, stop and report it before editing.

Task: tighten the bridge from Patzer’s game-review flow to its saved-puzzle flow so the puzzle page feels like a direct downstream tool of review data rather than a parallel subsystem.

Inspect first:
- Patzer: `src/puzzles/extract.ts`, `src/analyse/retroCtrl.ts`, `src/analyse/retroView.ts`, `src/idb/index.ts`, current `src/puzzles/*`
- Lichess: `~/Development/lichess-source/lila/ui/puzzle/src/ctrl.ts`, `~/Development/lichess-source/lila/ui/puzzle/src/moveTree.ts`

Constraints:
- scope this to the review-to-puzzle bridge
- do not start public-dataset ingestion work
- do not collapse retrospection and puzzles into one controller unless the code clearly supports that as a tiny safe step

Deliverables:
- diagnosis before coding
- exact small step being implemented
- why that step is safely scoped
- implementation
- validation
- short manual test checklist

Validation:
- run `npm run build`
- report Prompt ID, Task ID, build result, review-to-puzzle integration behavior, runtime/console status, and remaining risks
```

## CCP-092 - Cache Board Move Destinations

```
Prompt ID: CCP-092
Task ID: CCP-092
Source Document: docs/reference/patzer-board-motion-lag-audit.md
Source Step: Next deep fix 1 — cache legal move destinations instead of recomputing them on every navigation step
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same board / tree / navigation files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step to stop recomputing legal move destinations from FEN on every analysis-board navigation step, using a cached node-owned or equivalent cache seam that better matches Lichess behavior.

Inspect first:
- Patzer: `src/board/index.ts`, `src/main.ts`, `src/analyse/ctrl.ts`, `src/tree/*` as needed to locate the best ownership seam for cached destination data
- Lichess: `~/Development/lichess-source/lila/ui/analyse/src/ctrl.ts`, especially `makeCgOpts()` and the current `node.dests()` usage

Constraints:
- scope this to legal-destination caching / reuse only
- do not bundle broader move-generation rewrites
- do not redesign full navigation ownership
- do not add substantial new logic to `src/main.ts`

Deliverables:
- diagnosis before coding
- exact small step being implemented
- why that step is safely scoped
- implementation
- validation
- short manual test checklist

Validation:
- run `npm run build`
- run the most relevant task-specific check you can for repeated move stepping on the analysis board
- report Prompt ID, Task ID, build result, task-specific findings, runtime/console status, intentional behavior change, and remaining risks
```

## CCP-093 - Narrow Board Auto-Shape Updates

```
Prompt ID: CCP-093
Task ID: CCP-093
Source Document: docs/reference/patzer-board-motion-lag-audit.md
Source Step: Next deep fix 2 — switch to narrower Chessground auto-shape updates and skip no-op shape rebuilds
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same engine-overlay / board-shape / Chessground integration files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step to reduce board-overlay churn by switching Patzer’s engine auto-shape updates onto the narrower Chessground path Lichess uses, and skip pushing shapes when the computed shape payload has not actually changed.

Inspect first:
- Patzer: `src/engine/ctrl.ts`, `src/analyse/boardGlyphs.ts`, `src/board/index.ts` as needed for the live Chessground API surface
- Lichess: `~/Development/lichess-source/lila/ui/analyse/src/ctrl.ts`, `~/Development/lichess-source/lila/ui/analyse/src/autoShape.ts`

Constraints:
- scope this to auto-shape update behavior and no-op skipping
- do not redesign the overlay feature set itself
- do not bundle typography, arrow-style, or glyph-style changes
- preserve current overlay semantics unless a tiny compatibility fix is required

Deliverables:
- diagnosis before coding
- exact small step being implemented
- why that step is safely scoped
- implementation
- validation
- short manual test checklist

Validation:
- run `npm run build`
- run the most relevant task-specific check you can for repeated move stepping with engine arrows / labels / glyphs enabled
- report Prompt ID, Task ID, build result, task-specific findings, runtime/console status, intentional behavior change, and remaining risks
```

## CCP-094 - Remove Board Overlay Fade Animation

```
Prompt ID: CCP-094
Task ID: CCP-094
Source Document: docs/reference/patzer-board-motion-lag-audit.md
Source Step: Next deep fix 3 — remove Patzer overlay fade animation from board arrows and custom SVGs
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same board-style / arrow-style / custom-SVG files.
- If overlapping work exists, stop and report it before editing.

Task: remove the current Patzer board-overlay fade animation so engine arrows, review glyphs, and other custom board SVG overlays appear immediately during move stepping instead of re-animating on each update.

Inspect first:
- Patzer: `src/styles/main.scss`, `src/engine/ctrl.ts`, `src/analyse/boardGlyphs.ts`
- Lichess: inspect the relevant board-shape styling paths and confirm whether Lichess uses an equivalent fade here; if not, use the no-animation baseline

Constraints:
- scope this to removing the board-overlay fade effect
- do not bundle new animation systems or arrow-style redesigns
- preserve the existing overlay visuals aside from their appearance timing
- if a tiny selector cleanup is needed, keep it minimal

Deliverables:
- diagnosis before coding
- exact small step being implemented
- why that step is safely scoped
- implementation
- validation
- short manual test checklist

Validation:
- run `npm run build`
- run the most relevant task-specific check you can for repeated move stepping with overlay features enabled
- report Prompt ID, Task ID, build result, task-specific findings, runtime/console status, intentional behavior change, and remaining risks
```

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
