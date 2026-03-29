# Claude Prompt Queue

> Generated from `docs/prompts/prompt-registry.json` and `docs/prompts/items/`. Do not hand-edit this file.

Use this file to store Claude Code prompts that are available for future use and have not yet been reviewed.

## Queue Index

- [x] CCP-190-F3: Openings Board Arrow And Engine Batch Manager
  - execute the openings board follow-up batch for arrows and engine controls.

- [x] CCP-190-F2: Add Optional Engine Controls To Openings Board
  - add optional engine controls to the openings board.

- [x] CCP-190-F1: Add Played-Line Gradient Arrows To Openings Board
  - add played-line gradient or intensity arrows to the openings board.

- [ ] CCP-069-F1: Keep Eval Graph Markers Fixed During Resize
  - keep eval-graph markers fixed-size during resize and move the grey middle line behind the graph.

- [x] CCP-239: Opening Explorer Tablebase Panel
  - add the optional explorer tablebase panel for low-piece-count positions.

- [x] CCP-153-F3: Unify Puzzle Trigger Move And Pre-Solve Navigation
  - unify the trigger move and cached game context into one pre-solve move path, and add puzzle-aware arrow-key navigation.

- [ ] CCP-241: Extract Analysis Controls Owner
  - extract a real analysis-controls owner under `src/analyse/` for control-bar and menu state.

- [ ] CCP-242: Add Analysis Control Bar Shell
  - add the Lichess-style analysis control-bar shell with first/last and hamburger.

- [ ] CCP-243: Add Analysis Action Menu Overlay
  - add the analysis-local hamburger menu overlay inside the tools column.

- [ ] CCP-244: Move Existing Analysis Actions Into Menu
  - move the first safe set of existing analysis-local actions into the new menu.

- [ ] CCP-245: Add Opening Explorer Control-Bar Button
  - add the opening explorer button to the analysis control bar as a real local tool.

- [ ] CCP-246: Split Engine Gear And Analysis Menu
  - split engine gear and analysis menu ownership more honestly.

- [ ] CCP-247: Remove Duplicate Header Analysis Items
  - remove duplicated analysis-local items from the global header menu.

## Queue

## CCP-190-F3 - Openings Board Arrow And Engine Batch Manager

```
Prompt ID: CCP-190-F3
Task ID: CCP-190
Parent Prompt ID: CCP-190
Source Document: ad hoc user request
Source Step: openings board arrow-and-engine follow-up batch
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Queue execution marker step:
- As the first task before startup coordination or implementation work, run:
  - `npm run prompt:start -- CCP-190-F3`
- Only continue implementation work after that command succeeds.
- Leave this prompt queued after marking it started, even if execution later fails, stops midway, or hits a blocker.

Read and follow:
- `/Users/leftcoast/Development/PatzerPatzer/AGENTS.md`
- `/Users/leftcoast/Development/PatzerPatzer/CLAUDE.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/README.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CODEX_PROMPT_INSTRUCTIONS.md`

Batch prompt IDs to execute in order:
- `CCP-190-F1`
- `CCP-190-F2`

Manager-prompt rule:
- `CCP-190-F3` is the manager prompt id only
- do not execute or recurse into `CCP-190-F3` as if it were one of the child prompts

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same openings board, ceval, or prompt-tracking files.
- If overlapping work exists, stop and report it before editing.

Task:
- read the child prompts exactly as written from their prompt item files in `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/items/`
- execute them sequentially in the exact order listed above
- perform internal validation and self-check after each prompt
- stop immediately on any real issue, failed validation, unsafe repo state, or unresolved architectural blocker

Prompt sources:
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/prompt-registry.json`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/items/CCP-190-F1.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/items/CCP-190-F2.md`

Do not modify:
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/README.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CODEX_PROMPT_INSTRUCTIONS.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/code-review.md`

Execution rules:
- do not reorder child prompts
- do not create new prompts during the batch
- do not continue past a known issue just to finish the batch
- if a child prompt's startup state step already ran successfully in the current batch flow, do not rerun it a second time just because the child prompt text repeats it
- before starting each child prompt's startup coordination or implementation work, run `npm run prompt:start -- <CHILD_PROMPT_ID>` if that child has not already been marked started in the current batch flow
- only continue into a child prompt after that command succeeds
- use internal validation/self-check only; external review and prompt closeout happen separately

After each completed child prompt, report briefly:
- Prompt ID
- task title
- build result
- validation result
- internal check result
- whether the batch will continue or stop
```

## CCP-190-F2 - Add Optional Engine Controls To Openings Board

```
Prompt ID: CCP-190-F2
Task ID: CCP-190
Parent Prompt ID: CCP-190
Source Document: ad hoc user request
Source Step: allow engine controls to be turned on at any time on the openings research board
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Queue execution marker step:
- As the first task before startup coordination or implementation work, run:
  - `npm run prompt:start -- CCP-190-F2`
- Only continue implementation work after that command succeeds.
- Leave this prompt queued after marking it started, even if execution later fails, stops midway, or hits a blocker.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same openings board / ceval / engine integration files.
- If overlapping work exists, stop and report it before editing.

Task: add an openings-board engine control surface so the user can turn engine analysis on at any time while browsing an openings research position without turning the openings page into the analysis page

Inspect first:
- Patzer:
  - `src/openings/view.ts`
  - `src/openings/ctrl.ts`
  - `src/ceval/view.ts`
  - `src/engine/ctrl.ts`
  - `src/board/index.ts`
  - `src/styles/main.scss`
- Lichess references:
  - `docs/reference/lichess-puzzle-ux/BOARD_AND_INTERACTION_MODEL.md`
  - `docs/reference/lichess-puzzle-ux/README.md`

Focus on:
- whether openings can reuse the existing ceval panel safely
- how to provide a FEN source from the openings board/session
- how to keep openings engine controls clearly optional
- how to avoid importing large analysis-board-only UI into openings

Constraints:
- this should be an optional openings-board aid, not a conversion of openings into full analysis mode
- prefer reusing existing ceval and engine owners where safe
- do not add medium-sized new logic to `src/main.ts`
- do not bundle explorer redesign or report redesign into this task

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
- report what engine controls are now available on the openings board
- report how the current openings FEN is routed into engine analysis
- explicitly report:
  - build result
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results.
```

## CCP-190-F1 - Add Played-Line Gradient Arrows To Openings Board

```
Prompt ID: CCP-190-F1
Task ID: CCP-190
Parent Prompt ID: CCP-190
Source Document: ad hoc user request
Source Step: add played-line gradient move arrows to the openings board like a richer opening research surface
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Queue execution marker step:
- As the first task before startup coordination or implementation work, run:
  - `npm run prompt:start -- CCP-190-F1`
- Only continue implementation work after that command succeeds.
- Leave this prompt queued after marking it started, even if execution later fails, stops midway, or hits a blocker.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same openings board / board-shape / shared board integration files.
- If overlapping work exists, stop and report it before editing.

Task: add played-line move arrows to the openings research board so the current position can visually show the available child moves with differentiated gradient or intensity treatment based on line importance, while keeping the existing openings board shell intact

Inspect first:
- Patzer:
  - `src/openings/view.ts`
  - `src/openings/ctrl.ts`
  - `src/openings/tree.ts`
  - `src/board/index.ts`
  - `src/styles/main.scss`
- Lichess references:
  - `docs/reference/lichess-puzzle-ux/BOARD_AND_INTERACTION_MODEL.md`
  - `docs/reference/lichess-puzzle-ux/README.md`

Focus on:
- how the openings board currently sets `lastMove`
- how child moves are represented on the current opening node
- how shared Chessground brushes/shapes are configured today
- the smallest safe way to add auto-shapes without pulling analysis engine arrows into openings

Constraints:
- keep this openings-specific; do not route through the analysis engine arrow pipeline
- do not redesign the openings session layout in this task
- preserve current board navigation behavior
- use the smallest honest intensity/gradient treatment the current Chessground setup can support
- if true color gradients are too invasive, implement a clear stepped importance treatment and say so explicitly

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
- report how move arrows are chosen and how importance is visually encoded
- report whether the arrows update when navigating between openings positions
- explicitly report:
  - build result
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results.
```

## CCP-069-F1 - Keep Eval Graph Markers Fixed During Resize

```
Prompt ID: CCP-069-F1
Task ID: CCP-069
Parent Prompt ID: CCP-069
Source Document: ad hoc user request
Source Step: keep eval-graph styling and markers fixed-size while only vertical graph height changes; ensure the grey middle line renders behind the graph
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Queue execution marker step:
- As the first task before startup coordination or implementation work, run:
  - `npm run prompt:start -- CCP-069-F1`
- Only continue implementation work after that command succeeds.
- Leave this prompt queued after marking it started, even if execution later fails, stops midway, or hits a blocker.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same eval-graph / analysis-view / chart-styling / prompt-tracking files.
- If overlapping work exists, stop and report it before editing.

Task: fix the eval-graph resize behavior so dragging the graph larger only changes its vertical graph area, not the apparent size or shape of internal styling elements like dots and markers, and ensure the grey middle line renders behind the graph rather than in front of it.

Current repo-grounded diagnosis to confirm:
- `src/analyse/evalView.ts` currently renders the graph as a single SVG with:
  - `viewBox="0 0 600 80"`
  - `height: renderedGraphHeight`
  - `preserveAspectRatio: 'none'`
- the graph resize changes SVG height directly
- dots are rendered as SVG `circle` elements inside that same stretched SVG
- because the SVG is being non-uniformly scaled, dots can visually distort from circles into odd stretched shapes as the graph gets taller
- the current middle line / hover line layering also needs verification so the neutral grey midline is behind the main graph content, not sitting visually on top of it

Inspect first:
- Patzer:
  - `src/analyse/evalView.ts`
  - `src/styles/main.scss`
- Patzer references:
  - `docs/reference/LICHESS_ANALYSIS_CONTROLS_AUDIT.md` only if useful for graph placement context
- Relevant Lichess source:
  - `~/Development/lichess-source/lila/ui/chart/src/acpl.ts`
  - `~/Development/lichess-source/lila/ui/chart/src/division.ts`

Implementation goal:
- make eval-graph resize change only the vertical graph space
- keep dots/markers visually circular and the same apparent size regardless of graph height
- keep the line styling honest and stable as the graph is resized
- ensure the grey middle line is behind the graph trace/fill rather than in front of it

Constraints:
- keep this scoped to eval-graph rendering and styling only
- do not redesign the resize handle
- do not bundle unrelated graph fill/color changes unless a tiny shared render fix is required
- do not change graph interaction behavior beyond what is necessary to keep markers and layering correct
- prefer the smallest safe render-structure change over a broad chart rewrite

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
- run the most relevant task-specific check you can for eval-graph resize rendering
- explicitly report:
  - how graph height is now changed
  - why markers/dots keep their shape and size
  - whether the middle line now renders behind the graph content
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results.
```

## CCP-239 - Opening Explorer Tablebase Panel

```
Prompt ID: CCP-239
Task ID: CCP-239
Source Document: docs/reference/OPENING_EXPLORER_AUDIT.md
Source Step: Sprint H — Tablebase (optional / later)
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Queue execution marker step:
- As the first task before startup coordination or implementation work, run:
  - `npm run prompt:start -- CCP-239`
- Only continue implementation work after that command succeeds.
- Leave this prompt queued after marking it started, even if execution later fails, stops midway, or hits a blocker.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same openings explorer / tablebase / prompt-tracking files.
- If overlapping work exists, stop and report it before editing.

Task: add the smallest safe optional tablebase mode to the opening explorer so low-piece-count positions can switch from opening stats to a tablebase-style view with outcome and DTZ/DTM information, following the audited Lichess shape where practical.

Current repo-grounded starting point to confirm:
- Patzer does not currently have an explorer tablebase panel
- there is no piece-count gate that swaps explorer modes
- the current explorer work is still opening-stats only

Inspect first:
- Patzer:
  - `src/openings/explorer.ts`
  - `src/openings/view.ts`
  - `src/openings/ctrl.ts`
  - `src/styles/main.scss`
- Patzer references:
  - `docs/reference/OPENING_EXPLORER_AUDIT.md`
- Relevant Lichess source:
  - `~/Development/lichess-source/lila/ui/analyse/src/explorer/tablebaseView.ts`
  - `~/Development/lichess-source/lila/ui/analyse/src/explorer/explorerView.ts`
  - `~/Development/lichess-source/lila/ui/analyse/css/explorer/_explorer.scss`

Implementation goal:
- detect when the explorer should switch to a tablebase path
- render a distinct tablebase view with move outcome badges and DTZ / DTM style data when available
- keep the feature optional and honest if endpoint or variant support is limited

Constraints:
- keep this small and isolated
- do not redesign the main explorer UI
- if Patzer does not yet have a safe tablebase endpoint/config seam, add the smallest honest seam rather than hard-coding a messy dependency
- be explicit about which variants/positions are supported
- preserve the normal explorer mode when tablebase is unavailable

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
- run the most relevant task-specific check you can for the tablebase gate/view
- explicitly report:
  - how tablebase mode is entered
  - what endpoint or data source is used
  - which tablebase fields are shown
  - what happens when tablebase is unavailable
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results.

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
```

## CCP-153-F3 - Unify Puzzle Trigger Move And Pre-Solve Navigation

```
Prompt ID: CCP-153-F3
Task ID: CCP-153
Parent Prompt ID: CCP-153-F2
Source Document: docs/PUZZLE_V1_PLAN.md
Source Step: Puzzle Round Move List Continuity And Pre-Solve Navigation
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Queue execution marker step:
- As the first task before startup coordination or implementation work, run:
  - `npm run prompt:start -- CCP-153-F3`
- Only continue implementation work after that command succeeds.
- Leave this prompt queued after marking it started, even if execution later fails, stops midway, or hits a blocker.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle-round / move-list / PGN-cache / navigation / prompt-tracking files.
- If overlapping work exists, stop and report it before editing.

Task: fix the puzzle-round move-list continuity bug so the auto-played trigger move and the cached full-game PGN context are no longer treated like disconnected move sources, and add pre-solve keyboard navigation so the user can arrow back through already-known context moves before solving.

Current repo-grounded issue to confirm:
- `src/puzzles/view.ts` currently renders pre-puzzle context from `rc.gameTree` via `renderContextMoves(...)`, then renders the active puzzle line from a separate `rc.treeRoot` via `renderMoveList(...)`
- `src/puzzles/ctrl.ts` auto-applies the trigger move directly to Chessground in `mountPuzzleBoard(...)`
- the board therefore starts from the post-trigger position, but the visible move-list flow is split across two different tree owners
- during active solve, navigation is intentionally blocked unless `rc.mode === 'view'` or `rc.analysisMode`, so left/right arrow navigation before solving does not currently exist
- the result is that the last move played before the solve starts can feel visually detached from the move list, and the user cannot step backward through the already-known pre-solve path with arrow keys

Inspect first:
- Patzer:
  - `src/puzzles/ctrl.ts`
  - `src/puzzles/view.ts`
  - `src/analyse/moveList.ts`
  - `src/keyboard.ts`
  - any puzzle route/view wiring that owns keyboard behavior
- Patzer references:
  - `docs/PUZZLE_V1_PLAN.md`
  - `docs/reference/lichess-puzzle-ux/README.md`
  - `docs/reference/lichess-puzzle-ux/STANDARD_PUZZLE_FLOW.md`
  - `docs/reference/lichess-puzzle-ux/BOARD_AND_INTERACTION_MODEL.md`
- Relevant Lichess source:
  - `~/Development/lichess-source/lila/ui/puzzle/src/moveTree.ts`
  - `~/Development/lichess-source/lila/ui/puzzle/src/view/tree.ts`
  - `~/Development/lichess-source/lila/ui/puzzle/src/control.ts`
  - `~/Development/lichess-source/lila/ui/puzzle/src/view/chessground.ts`

Implementation goal:
- make the pre-solve puzzle board state and the visible move-list path feel continuous
- ensure the auto-played trigger move is represented in the same navigable move flow as the puzzle board state, not as an effectively disconnected visual seam
- allow pre-solve left/right navigation through already-known context + trigger moves
- keep future solution moves hidden until they are legitimately reached or the round is in view/analysis mode
- preserve strict puzzle correctness and do not turn the puzzle page into unrestricted full-analysis mode during solve

Constraints:
- scope this to move-list continuity and pre-solve navigation only
- do not rebuild the whole puzzle round architecture
- do not weaken strict solution-line validation
- do not reveal future solution moves just to make navigation easier
- do not add large new puzzle logic to `src/main.ts`
- if the smallest safe fix is to unify the visible pre-solve path around one tree/path seam rather than maintaining two separate move-list segments, prefer that over UI-only patching
- keyboard behavior should be puzzle-aware and limited to already-known pre-solve positions while the round is still active

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
- run the most relevant task-specific check you can for puzzle-round move-list continuity and keyboard navigation
- explicitly report:
  - whether the trigger move and pre-solve move list now read as one continuous flow
  - how pre-solve backward/forward navigation works
  - what positions remain intentionally unavailable before solve
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks and limitations

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
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks
```

## CCP-241 - Extract Analysis Controls Owner

```
Prompt ID: CCP-241
Task ID: CCP-241
Source Document: docs/mini-sprints/ANALYSIS_CONTROLS_PARITY_SPRINT_2026-03-29.md
Source Step: Task 1 — Extract a dedicated analysis-controls owner
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Queue execution marker step:
- As the first task before startup coordination or implementation work, run:
  - `npm run prompt:start -- CCP-241`
- Only continue implementation work after that command succeeds.
- Leave this prompt queued after marking it started, even if execution later fails, stops midway, or hits a blocker.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same analysis-controls / analysis-menu / ceval / header / prompt-tracking files.
- If overlapping work exists, stop and report it before editing.

Task: extract a real analysis-controls owner under `src/analyse/` so Patzer's control-bar state and future action-menu state stop living as ad hoc render glue in `src/main.ts`.

Inspect first:
- Patzer:
  - `src/main.ts`
  - `src/analyse/pgnExport.ts`
  - `src/ceval/view.ts`
  - `src/header/index.ts`
  - any existing analysis control helpers under `src/analyse/`
- Patzer references:
  - `docs/reference/LICHESS_ANALYSIS_CONTROLS_AUDIT.md`
  - `docs/mini-sprints/ANALYSIS_CONTROLS_PARITY_SPRINT_2026-03-29.md`
- Relevant Lichess source:
  - `~/Development/lichess-source/lila/ui/analyse/src/view/controls.ts`
  - `~/Development/lichess-source/lila/ui/analyse/src/view/tools.ts`

Implementation goal:
- create the smallest safe analysis-controls owner in `src/analyse/`
- move control-bar state and action-menu open/close ownership behind that seam
- preserve current visible behavior as much as possible in this prompt
- reduce future control-bar growth in `src/main.ts`

Constraints:
- do not add the full Lichess menu yet
- do not reshuffle existing settings into new menus yet
- do not rewrite storage keys
- do not add medium-sized new logic to `src/main.ts`
- keep this step architectural and behavior-preserving

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
- run the most relevant task-specific check you can for the extracted analysis-controls seam
- explicitly report:
  - what state now lives under the new analysis-controls owner
  - what remained in place intentionally
  - whether visible analysis-board behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results.
```

## CCP-242 - Add Analysis Control Bar Shell

```
Prompt ID: CCP-242
Task ID: CCP-242
Source Document: docs/mini-sprints/ANALYSIS_CONTROLS_PARITY_SPRINT_2026-03-29.md
Source Step: Task 2 — Add the Lichess-style control bar shell
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Queue execution marker step:
- As the first task before startup coordination or implementation work, run:
  - `npm run prompt:start -- CCP-242`
- Only continue implementation work after that command succeeds.
- Leave this prompt queued after marking it started, even if execution later fails, stops midway, or hits a blocker.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same analysis-controls / analysis-board layout / styles / prompt-tracking files.
- If overlapping work exists, stop and report it before editing.

Task: replace Patzer's current custom analysis controls row with a real Lichess-style control-bar shell that introduces left / middle / right zones, adds first and last jump buttons, and adds the right-side hamburger trigger while keeping current review and retrospection actions accessible.

Inspect first:
- Patzer:
  - `src/main.ts`
  - `src/analyse/pgnExport.ts`
  - any new analysis-controls owner files created by the previous step
  - `src/styles/main.scss`
- Patzer references:
  - `docs/reference/LICHESS_ANALYSIS_CONTROLS_AUDIT.md`
  - `docs/mini-sprints/ANALYSIS_CONTROLS_PARITY_SPRINT_2026-03-29.md`
- Relevant Lichess source:
  - `~/Development/lichess-source/lila/ui/analyse/src/view/controls.ts`
  - `~/Development/lichess-source/lila/ui/analyse/css/_tools.scss`
  - `~/Development/lichess-source/lila/ui/analyse/css/_tools-mobile.scss`

Implementation goal:
- create a three-zone analysis control bar
- add first / prev / next / last navigation
- add a right-side hamburger button that will later open the local action menu
- keep `Review` / `Re-analyze` and the retrospection entry reachable in the new shell

Constraints:
- do not wire the full action menu contents yet
- do not add the opening explorer button yet
- do not move settings out of the header or engine gear yet
- keep mobile from regressing even if full mobile parity is deferred

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
- run the most relevant task-specific check you can for the new control bar
- explicitly report:
  - whether first / last now work
  - where review and retrospection entry now live
  - whether the hamburger trigger exists but remains safely scoped
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results.
```

## CCP-243 - Add Analysis Action Menu Overlay

```
Prompt ID: CCP-243
Task ID: CCP-243
Source Document: docs/mini-sprints/ANALYSIS_CONTROLS_PARITY_SPRINT_2026-03-29.md
Source Step: Task 3 — Add the analysis-local hamburger menu overlay
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Queue execution marker step:
- As the first task before startup coordination or implementation work, run:
  - `npm run prompt:start -- CCP-243`
- Only continue implementation work after that command succeeds.
- Leave this prompt queued after marking it started, even if execution later fails, stops midway, or hits a blocker.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same analysis-menu / tools-panel / ceval / prompt-tracking files.
- If overlapping work exists, stop and report it before editing.

Task: add a Lichess-style analysis-local action-menu overlay inside Patzer's tools column, opened by the control-bar hamburger and structured with honest section shells for future analysis actions and toggles.

Inspect first:
- Patzer:
  - `src/main.ts`
  - any new analysis-controls owner/view files
  - `src/ceval/view.ts`
  - `src/styles/main.scss`
- Patzer references:
  - `docs/reference/LICHESS_ANALYSIS_CONTROLS_AUDIT.md`
  - `docs/mini-sprints/ANALYSIS_CONTROLS_PARITY_SPRINT_2026-03-29.md`
- Relevant Lichess source:
  - `~/Development/lichess-source/lila/ui/analyse/src/view/actionMenu.ts`
  - `~/Development/lichess-source/lila/ui/analyse/src/view/tools.ts`
  - `~/Development/lichess-source/lila/ui/analyse/css/_action-menu.scss`

Implementation goal:
- open a local analysis menu inside `.analyse__tools`
- make it overlay the tools column rather than open a global modal
- give it real section structure, scroll behavior, and close behavior
- use honest placeholders where future items are not wired yet
- keep the visual direction compatible with Patzer's preferred iOS-style toggles later

Constraints:
- do not migrate all settings yet
- do not invent fake working controls for not-yet-implemented items
- do not break ceval, move list, explorer, or retrospection rendering when the menu is closed
- keep this focused on shell + overlay behavior

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
- run the most relevant task-specific check you can for the local action-menu overlay
- explicitly report:
  - where the menu renders
  - how it opens and closes
  - which sections are real vs honest placeholders
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results.
```

## CCP-244 - Move Existing Analysis Actions Into Menu

```
Prompt ID: CCP-244
Task ID: CCP-244
Source Document: docs/mini-sprints/ANALYSIS_CONTROLS_PARITY_SPRINT_2026-03-29.md
Source Step: Task 4 — Move existing analysis-local actions into the new menu
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Queue execution marker step:
- As the first task before startup coordination or implementation work, run:
  - `npm run prompt:start -- CCP-244`
- Only continue implementation work after that command succeeds.
- Leave this prompt queued after marking it started, even if execution later fails, stops midway, or hits a blocker.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same analysis-menu / header-menu / retrospection / board-cosmetics / prompt-tracking files.
- If overlapping work exists, stop and report it before editing.

Task: migrate the first set of already-existing analysis-local actions into the new analysis hamburger menu without rewriting their storage owners.

Inspect first:
- Patzer:
  - `src/header/index.ts`
  - `src/ceval/view.ts`
  - `src/board/cosmetics.ts`
  - `src/analyse/retroConfig.ts`
  - any new analysis-menu files
- Patzer references:
  - `docs/reference/LICHESS_ANALYSIS_CONTROLS_AUDIT.md`
  - `docs/mini-sprints/ANALYSIS_CONTROLS_PARITY_SPRINT_2026-03-29.md`
- Relevant Lichess source:
  - `~/Development/lichess-source/lila/ui/analyse/src/view/actionMenu.ts`

Implementation goal:
- move a first safe set of existing actions into the analysis menu
- recommended first set:
  - Flip board
  - Learn From Your Mistakes entry
  - board review / move annotation display control
  - review dots user-only only if it is safe and still reads as analysis-local
- keep state in the existing owning modules where possible

Constraints:
- do not migrate `Mistake Detection` yet
- do not move board themes / pieces / sounds
- do not silently delete existing header controls unless the replacement is clearly live and safe
- keep this prompt focused on rehoming existing actions, not adding entirely new ones

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
- run the most relevant task-specific check you can for migrated analysis actions
- explicitly report:
  - which existing actions were moved into the analysis menu
  - which ones were intentionally deferred
  - whether existing persistence/storage owners were preserved
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results.
```

## CCP-245 - Add Opening Explorer Control-Bar Button

```
Prompt ID: CCP-245
Task ID: CCP-245
Source Document: docs/mini-sprints/ANALYSIS_CONTROLS_PARITY_SPRINT_2026-03-29.md
Source Step: Task 5 — Add opening explorer as a first-class control-bar tool
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Queue execution marker step:
- As the first task before startup coordination or implementation work, run:
  - `npm run prompt:start -- CCP-245`
- Only continue implementation work after that command succeeds.
- Leave this prompt queued after marking it started, even if execution later fails, stops midway, or hits a blocker.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same analysis-controls / opening-explorer / tools-panel / prompt-tracking files.
- If overlapping work exists, stop and report it before editing.

Task: make opening explorer a first-class control-bar tool, like Lichess, by adding a dedicated explorer button to the analysis controls and wiring it cleanly into Patzer's existing explorer state and tools-column rendering.

Inspect first:
- Patzer:
  - `src/main.ts`
  - `src/openings/explorerCtrl.ts`
  - `src/openings/explorerConfig.ts`
  - any analysis-controls / analysis-menu files created earlier
- Patzer references:
  - `docs/reference/LICHESS_ANALYSIS_CONTROLS_AUDIT.md`
  - `docs/reference/OPENING_EXPLORER_AUDIT.md`
  - `docs/mini-sprints/ANALYSIS_CONTROLS_PARITY_SPRINT_2026-03-29.md`
- Relevant Lichess source:
  - `~/Development/lichess-source/lila/ui/analyse/src/view/controls.ts`
  - `~/Development/lichess-source/lila/ui/analyse/src/view/tools.ts`

Implementation goal:
- add an opening explorer button to the control bar
- make it behave as a real analysis-local tool toggle
- keep it coordinated with the action menu and retrospection so tool ownership stays honest
- reuse existing explorer persistence and controller state instead of inventing a second explorer owner

Constraints:
- do not rebuild explorer internals
- do not add tablebase here
- do not duplicate explorer toggles in multiple places if that can be avoided
- keep this prompt focused on control-bar integration and local tool-state behavior

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
- run the most relevant task-specific check you can for explorer control-bar integration
- explicitly report:
  - how the explorer button behaves
  - how it interacts with the action menu and retrospection
  - whether existing explorer persistence remained intact
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results.
```

## CCP-246 - Split Engine Gear And Analysis Menu

```
Prompt ID: CCP-246
Task ID: CCP-246
Source Document: docs/mini-sprints/ANALYSIS_CONTROLS_PARITY_SPRINT_2026-03-29.md
Source Step: Task 6 — Split engine gear from analysis menu more honestly
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Queue execution marker step:
- As the first task before startup coordination or implementation work, run:
  - `npm run prompt:start -- CCP-246`
- Only continue implementation work after that command succeeds.
- Leave this prompt queued after marking it started, even if execution later fails, stops midway, or hits a blocker.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same ceval-settings / analysis-menu / display-toggle / prompt-tracking files.
- If overlapping work exists, stop and report it before editing.

Task: split Patzer's current engine gear more honestly so engine-search settings stay in the ceval gear while broader analysis display toggles move into the new analysis action menu, using Patzer's preferred iOS-style toggle treatment there if it can be done safely.

Inspect first:
- Patzer:
  - `src/ceval/view.ts`
  - `src/engine/ctrl.ts`
  - any analysis action-menu files created earlier
  - `src/styles/main.scss`
- Patzer references:
  - `docs/reference/LICHESS_ANALYSIS_CONTROLS_AUDIT.md`
  - `docs/mini-sprints/ANALYSIS_CONTROLS_PARITY_SPRINT_2026-03-29.md`
- Relevant Lichess source:
  - `~/Development/lichess-source/lila/ui/analyse/src/view/actionMenu.ts`
  - `~/Development/lichess-source/lila/ui/analyse/src/view/controls.ts`

Implementation goal:
- keep engine gear focused on engine runtime settings like lines and depths
- move display-oriented toggles into the analysis menu
- use one coherent action-menu toggle row style there
- improve ownership clarity without changing underlying storage unless required

Constraints:
- do not redesign all app toggles globally
- do not move board themes, sounds, or broad app settings into this menu
- do not invent new display settings unless a tiny missing seam is required
- keep this step focused on ownership split and menu wiring

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
- run the most relevant task-specific check you can for the engine-gear / analysis-menu split
- explicitly report:
  - which controls remained in the engine gear
  - which controls moved into the analysis menu
  - whether the new toggle styling is scoped correctly
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results.
```

## CCP-247 - Remove Duplicate Header Analysis Items

```
Prompt ID: CCP-247
Task ID: CCP-247
Source Document: docs/mini-sprints/ANALYSIS_CONTROLS_PARITY_SPRINT_2026-03-29.md
Source Step: Task 7 — Clean duplicates out of the global header menu
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Queue execution marker step:
- As the first task before startup coordination or implementation work, run:
  - `npm run prompt:start -- CCP-247`
- Only continue implementation work after that command succeeds.
- Leave this prompt queued after marking it started, even if execution later fails, stops midway, or hits a blocker.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same header-menu / analysis-menu / prompt-tracking files.
- If overlapping work exists, stop and report it before editing.

Task: remove duplicated analysis-local items from the global header menu after their replacements are live in the new analysis controls/menu, while preserving truly global app settings in the header.

Inspect first:
- Patzer:
  - `src/header/index.ts`
  - any analysis action-menu files created earlier
  - `src/board/cosmetics.ts`
  - `src/board/sound.ts`
- Patzer references:
  - `docs/reference/LICHESS_ANALYSIS_CONTROLS_AUDIT.md`
  - `docs/mini-sprints/ANALYSIS_CONTROLS_PARITY_SPRINT_2026-03-29.md`
- Relevant Lichess source:
  - `~/Development/lichess-source/lila/ui/analyse/src/view/actionMenu.ts`

Implementation goal:
- remove only duplicated analysis-local header entries once the analysis-menu replacements are real
- keep truly global header items intact
- leave the header menu cleaner and less confusing after the parity migration

Constraints:
- do not remove anything whose replacement is not actually live
- do not move board themes / pieces / sounds out of the header in this prompt
- do not touch import/global workflows
- keep this as a cleanup pass, not a redesign

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
- run the most relevant task-specific check you can for duplicate-control cleanup
- explicitly report:
  - which header items were removed
  - which header items intentionally remain
  - whether any analysis controls are now stranded or duplicated
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results.
```
