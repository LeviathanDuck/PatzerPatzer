# Claude Prompt Queue

> Generated from `docs/prompts/prompt-registry.json` and `docs/prompts/items/`. Do not hand-edit this file.

Use this file to store Claude Code prompts that are available for future use and have not yet been reviewed.

## Queue Index

- [x] CCP-190-F2: Add Optional Engine Controls To Openings Board
  - add optional engine controls to the openings board.

- [x] CCP-190-F1: Add Played-Line Gradient Arrows To Openings Board
  - add played-line gradient or intensity arrows to the openings board.

- [x] CCP-252: Add Openings Session Hamburger And Action Menu
  - add the missing hamburger action menu to the openings session move-list panel.

- [ ] CCP-253: Adopt Shared MoveNavBar In Puzzle Round
  - replace puzzle-round ad hoc move navigation with the shared move-nav bar.

- [ ] CCP-254: Add Puzzle Round Action Menu And Book Toggle
  - add the puzzle-round hamburger menu and book toggle wiring.

- [ ] CCP-255: Add In-Place Preview Mode To Puzzle Library
  - add in-place preview mode to the puzzle library with board, move list, and nav bar.

- [ ] CCP-256: Add Puzzle Library Preview Action Menu And Book Toggle
  - add the preview hamburger menu and book toggle to the puzzle library.

- [x] CCP-257: Chess Board Standard Rollout Batch Manager
  - execute the full chess-board standard rollout batch for openings session and puzzle surfaces.

## Queue

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

## CCP-252 - Add Openings Session Hamburger And Action Menu

```
Prompt ID: CCP-252
Task ID: CCP-252
Source Document: docs/CHESS_BOARD_STANDARD_AUDIT.md
Source Step: Step 1 — Openings: hamburger + action menu
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Queue execution marker step:
- As the first task before startup coordination or implementation work, run:
  - `npm run prompt:start -- CCP-252`
- Only continue implementation work after that command succeeds.
- Leave this prompt queued after marking it started, even if execution later fails, stops midway, or hits a blocker.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same openings-session / move-nav / action-menu / prompt-tracking files.
- If overlapping work exists, stop and report it before editing.

Task: bring the openings session up to the Patzer board standard by adding the missing hamburger action menu to the existing `renderMoveNavBar()` surface and moving the first safe openings-local controls into that overlay.

Inspect first:
- Patzer:
  - `src/openings/view.ts`
  - `src/analyse/analysisControls.ts`
  - `src/styles/main.scss`
  - any shared toggle helpers the openings session can already reuse
- Patzer references:
  - `docs/CHESS_BOARD_STANDARD_AUDIT.md`
  - `docs/reference/LICHESS_ANALYSIS_CONTROLS_AUDIT.md`
- Relevant Lichess source:
  - `~/Development/lichess-source/lila/ui/analyse/src/view/controls.ts`
  - `~/Development/lichess-source/lila/ui/analyse/src/view/actionMenu.ts`
  - `~/Development/lichess-source/lila/ui/analyse/css/_action-menu.scss`

Current repo-grounded target to confirm:
- `src/openings/view.ts` already uses `renderMoveNavBar()` and already wires the book icon through `bookActive` / `onBook`
- the openings move list therefore already matches the left and center parts of the board standard
- the missing piece is the right-side hamburger and a local overlay menu rendered in the same side column as the openings move list
- the first safe actions to migrate are:
  - flip board
  - openings color filter
  - existing engine-display toggles that are already local to this surface

Implementation goal:
- add an openings-local hamburger in `rightSlot`
- add an `.action-menu` overlay inside the openings session side column
- move the first safe openings-local controls into that overlay
- preserve existing explorer behavior and current move-list ownership

Constraints:
- keep this scoped to the openings session view
- do not redesign the openings explorer itself
- do not rewrite engine setting storage owners
- do not introduce a new global menu system
- prefer reusing the existing analysis action-menu structure and shared toggle rows over inventing a second menu pattern

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
- run the most relevant task-specific check you can for the openings session controls surface
- explicitly report:
  - whether the openings session now has the full three-zone nav pattern
  - what moved into the hamburger menu
  - what intentionally remained outside the menu
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results.
```

## CCP-253 - Adopt Shared MoveNavBar In Puzzle Round

```
Prompt ID: CCP-253
Task ID: CCP-253
Source Document: docs/CHESS_BOARD_STANDARD_AUDIT.md
Source Step: Step 2 — Puzzle round: add MoveNavBar
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Queue execution marker step:
- As the first task before startup coordination or implementation work, run:
  - `npm run prompt:start -- CCP-253`
- Only continue implementation work after that command succeeds.
- Leave this prompt queued after marking it started, even if execution later fails, stops midway, or hits a blocker.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle-round / move-list / move-nav / prompt-tracking files.
- If overlapping work exists, stop and report it before editing.

Task: replace the puzzle round’s ad hoc move navigation with the shared `renderMoveNavBar()` standard so the round uses the same board-nav pattern as analysis and openings before adding the hamburger/menu layer.

Inspect first:
- Patzer:
  - `src/puzzles/view.ts`
  - `src/puzzles/ctrl.ts`
  - `src/analyse/analysisControls.ts`
  - `src/styles/main.scss`
- Patzer references:
  - `docs/CHESS_BOARD_STANDARD_AUDIT.md`
  - `docs/reference/lichess-puzzle-ux/README.md`
  - `docs/reference/lichess-puzzle-ux/BOARD_AND_INTERACTION_MODEL.md`
- Relevant Lichess source:
  - `~/Development/lichess-source/lila/ui/puzzle/src/view/main.ts`
  - `~/Development/lichess-source/lila/ui/puzzle/src/view/chessground.ts`

Current repo-grounded target to confirm:
- the puzzle round already has a move list in `src/puzzles/view.ts`
- it does not yet use the shared `renderMoveNavBar()` standard
- this step should swap in the shared nav bar without yet fully landing the puzzle-round hamburger menu or full puzzle-round action menu

Implementation goal:
- render the shared move-nav bar in the puzzle round beside the move list
- wire first / prev / next / last correctly for the current puzzle-round state
- preserve current strict puzzle behavior
- prepare a clean seam for the later puzzle-round hamburger menu prompt

Constraints:
- keep this step scoped to puzzle-round navigation only
- do not add the puzzle-round action menu yet
- do not add opening-explorer behavior yet unless a tiny placeholder hook is strictly required by `renderMoveNavBar()`
- do not weaken puzzle validation or solve-state rules
- do not redesign the puzzle side column

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
- run the most relevant task-specific check you can for puzzle-round navigation
- explicitly report:
  - whether the puzzle round now uses `renderMoveNavBar()`
  - what navigation callbacks are wired
  - what puzzle behavior intentionally remains unchanged
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results.
```

## CCP-254 - Add Puzzle Round Action Menu And Book Toggle

```
Prompt ID: CCP-254
Task ID: CCP-254
Source Document: docs/CHESS_BOARD_STANDARD_AUDIT.md
Source Step: Step 3 — Puzzle round: action menu
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Queue execution marker step:
- As the first task before startup coordination or implementation work, run:
  - `npm run prompt:start -- CCP-254`
- Only continue implementation work after that command succeeds.
- Leave this prompt queued after marking it started, even if execution later fails, stops midway, or hits a blocker.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle-round / action-menu / opening-explorer / prompt-tracking files.
- If overlapping work exists, stop and report it before editing.

Task: complete the puzzle round’s board-standard controls by adding the hamburger action menu and wiring the book icon to the opening explorer for the current puzzle position.

Inspect first:
- Patzer:
  - `src/puzzles/view.ts`
  - `src/puzzles/ctrl.ts`
  - `src/openings/explorerCtrl.ts`
  - `src/analyse/analysisControls.ts`
  - `src/styles/main.scss`
- Patzer references:
  - `docs/CHESS_BOARD_STANDARD_AUDIT.md`
  - `docs/reference/lichess-puzzle-ux/README.md`
  - `docs/reference/lichess-puzzle-ux/FILTERS_THEMES_AND_SELECTION.md`
- Relevant Lichess source:
  - `~/Development/lichess-source/lila/ui/analyse/src/view/actionMenu.ts`
  - `~/Development/lichess-source/lila/ui/analyse/src/view/controls.ts`
  - `~/Development/lichess-source/lila/ui/analyse/css/_action-menu.scss`

Current repo-grounded target to confirm:
- after the previous step, the puzzle round should already have the shared nav bar
- this step should finish the pattern by adding:
  - a hamburger menu in the right slot
  - a puzzle-round action menu overlay
  - book icon behavior for the puzzle round FEN through `explorerCtrl`
- the first safe menu items are:
  - flip board
  - auto-next
  - engine display settings already owned elsewhere

Implementation goal:
- make the puzzle round match the full board standard
- wire the book icon honestly to the current puzzle position
- keep the action menu local to the puzzle side column
- preserve puzzle-round solve behavior

Constraints:
- keep this scoped to puzzle-round controls and local menu behavior
- do not redesign puzzle session layout broadly
- do not change puzzle selection, rating, or library flows
- do not rewrite engine setting storage owners
- do not invent a separate menu pattern when the existing `.action-menu` structure can be reused

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
- run the most relevant task-specific check you can for puzzle-round controls
- explicitly report:
  - whether the puzzle round now has book + nav + hamburger
  - what appears in the puzzle-round action menu
  - how the explorer is wired from the puzzle round
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results.
```

## CCP-255 - Add In-Place Preview Mode To Puzzle Library

```
Prompt ID: CCP-255
Task ID: CCP-255
Source Document: docs/CHESS_BOARD_STANDARD_AUDIT.md
Source Step: Step 4 — Puzzle library: in-place preview mode
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Queue execution marker step:
- As the first task before startup coordination or implementation work, run:
  - `npm run prompt:start -- CCP-255`
- Only continue implementation work after that command succeeds.
- Leave this prompt queued after marking it started, even if execution later fails, stops midway, or hits a blocker.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle-library / preview-board / move-list / prompt-tracking files.
- If overlapping work exists, stop and report it before editing.

Task: change the puzzle library from a decorative idle-board list into an in-place preview surface where clicking a puzzle loads it onto the library board, shows its move list, and shows the shared move-nav bar without leaving the page.

Inspect first:
- Patzer:
  - `src/puzzles/view.ts`
  - `src/puzzles/ctrl.ts`
  - `src/analyse/analysisControls.ts`
  - `src/styles/main.scss`
- Patzer references:
  - `docs/CHESS_BOARD_STANDARD_AUDIT.md`
  - `docs/PUZZLE_V1_PLAN.md`
  - `docs/reference/lichess-puzzle-ux/README.md`
  - `docs/reference/lichess-puzzle-ux/BOARD_AND_INTERACTION_MODEL.md`
- Relevant Lichess source:
  - `~/Development/lichess-source/lila/ui/puzzle/src/view/main.ts`
  - `~/Development/lichess-source/lila/ui/puzzle/src/view/chessground.ts`
  - any closely related puzzle preview / session shell files you need

Current repo-grounded target to confirm:
- the puzzle library currently mounts an idle decorative board
- selecting a puzzle from the list routes away into the dedicated puzzle round
- this step should instead load a preview puzzle in place on the library page
- the preview should show:
  - a real board
  - the puzzle move list
  - the shared `renderMoveNavBar()`
  - a clear way to enter the full round afterward

Implementation goal:
- create an in-place preview mode for the puzzle library
- keep browsing and previewing on the same page
- add move-list + nav-bar parity to the preview surface
- preserve the dedicated puzzle round as the actual solve mode

Constraints:
- keep this step scoped to preview-mode behavior
- do not add the puzzle-library hamburger menu yet
- do not redesign the puzzle-round solve flow
- do not bundle rating/history/session analytics work
- prefer a small preview-state seam in `src/puzzles/ctrl.ts` over route-level churn

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
- run the most relevant task-specific check you can for puzzle-library preview mode
- explicitly report:
  - whether puzzle selection now previews in place
  - whether the preview board has a move list and nav bar
  - how the user enters the full puzzle round from preview
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results.
```

## CCP-256 - Add Puzzle Library Preview Action Menu And Book Toggle

```
Prompt ID: CCP-256
Task ID: CCP-256
Source Document: docs/CHESS_BOARD_STANDARD_AUDIT.md
Source Step: Step 5 — Puzzle library: action menu + book
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Queue execution marker step:
- As the first task before startup coordination or implementation work, run:
  - `npm run prompt:start -- CCP-256`
- Only continue implementation work after that command succeeds.
- Leave this prompt queued after marking it started, even if execution later fails, stops midway, or hits a blocker.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle-library / preview-controls / opening-explorer / prompt-tracking files.
- If overlapping work exists, stop and report it before editing.

Task: finish the puzzle library board-standard rollout by adding the hamburger action menu and book icon behavior to the new in-place preview surface.

Inspect first:
- Patzer:
  - `src/puzzles/view.ts`
  - `src/puzzles/ctrl.ts`
  - `src/openings/explorerCtrl.ts`
  - `src/analyse/analysisControls.ts`
  - `src/styles/main.scss`
- Patzer references:
  - `docs/CHESS_BOARD_STANDARD_AUDIT.md`
  - `docs/PUZZLE_V1_PLAN.md`
  - `docs/reference/lichess-puzzle-ux/README.md`
- Relevant Lichess source:
  - `~/Development/lichess-source/lila/ui/analyse/src/view/controls.ts`
  - `~/Development/lichess-source/lila/ui/analyse/src/view/actionMenu.ts`
  - `~/Development/lichess-source/lila/ui/analyse/css/_action-menu.scss`

Current repo-grounded target to confirm:
- after the previous step, the puzzle library preview should already have the board, move list, and nav bar
- this final step should add:
  - book icon wiring for the preview puzzle FEN
  - a hamburger action menu in the preview side column
  - the first safe preview-specific controls such as flip board and display settings

Implementation goal:
- complete the same three-zone nav standard on the puzzle-library preview surface
- keep the menu local to preview mode
- reuse existing action-menu styling and toggle components
- preserve the dedicated puzzle round as the real solve environment

Constraints:
- keep this scoped to the library preview surface
- do not redesign puzzle browsing or filtering
- do not create a separate explorer implementation for puzzles
- do not rewrite engine setting storage owners
- do not merge library preview and round mode into one controller

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
- run the most relevant task-specific check you can for puzzle-library preview controls
- explicitly report:
  - whether the preview surface now has book + nav + hamburger
  - what appears in the preview action menu
  - how the preview explorer wiring works
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results.
```

## CCP-257 - Chess Board Standard Rollout Batch Manager

```
Prompt ID: CCP-257
Task ID: CCP-257
Source Document: docs/CHESS_BOARD_STANDARD_AUDIT.md
Source Step: Full chess-board standard rollout batch manager
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Queue execution marker step:
- As the first task before startup coordination or implementation work, run:
  - `npm run prompt:start -- CCP-257`
- Only continue implementation work after that command succeeds.
- Leave this prompt queued after marking it started, even if execution later fails, stops midway, or hits a blocker.

Read and follow:
- `/Users/leftcoast/Development/PatzerPatzer/AGENTS.md`
- `/Users/leftcoast/Development/PatzerPatzer/CLAUDE.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/README.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CODEX_PROMPT_INSTRUCTIONS.md`

Batch prompt IDs to execute in order:
- `CCP-252`
- `CCP-253`
- `CCP-254`
- `CCP-255`
- `CCP-256`

Manager-prompt rule:
- `CCP-257` is the manager prompt id only
- do not execute or recurse into `CCP-257` as if it were one of the child prompts

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same openings-session / puzzle-round / puzzle-library / move-nav / action-menu / prompt-tracking files.
- If overlapping work exists, stop and report it before editing.

Task:
- read the child prompts exactly as written from `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/items/`
- execute them sequentially in the exact order listed above
- perform internal validation and self-check after each prompt
- stop immediately on any real issue, failed validation, unsafe repo state, or unresolved architectural blocker

Prompt sources:
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/prompt-registry.json`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/items/CCP-252.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/items/CCP-253.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/items/CCP-254.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/items/CCP-255.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/items/CCP-256.md`

Do not modify:
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/README.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CODEX_PROMPT_INSTRUCTIONS.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/code-review.md`

Execution rules:
- do not reorder child prompts
- do not create new prompts during this batch
- do not continue past a known issue just to finish the batch
- if a child prompt's startup step already ran successfully in the current batch flow, do not rerun it
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

If the batch stops, clearly report:
- which child Prompt ID stopped the batch
- why it stopped
- what issue or failure was found

If the batch finishes, report a compact summary of completed Prompt IDs.
```
