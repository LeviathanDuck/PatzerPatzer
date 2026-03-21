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

- CCP-065: Add Toggle For Review Label Visibility
  - Verify exact Lichess move-review label rendering and add a persisted engine-setting toggle that shows or hides those labels in Patzer.

- CCP-030: First Safe Typecheck Error Slice
  - Clear the first cohesive `npm run typecheck` error cluster in analysis view files without tackling the full backlog.

- CCP-031: Fix Board Wheel Navigation Selector
  - Fix the board hit-target seam so wheel navigation actually triggers over the real analysis board.

- CCP-033: Fix Imported-Game Orientation Propagation
  - Make imported games consistently orient the board to the importing user when that side is known.

- CCP-006-F1: Fix Analysis-Game Empty-Library Loading State
  - Stop `analysis-game` from showing fake permanent loading when the library is actually empty.

- CCP-034: Improve Eval Graph Hover And Scrub
  - Make the eval graph more useful with a first hover/scrub interaction improvement.

- CCP-035: Fix Engine Arrowhead Rendering
  - Restore visible arrowheads on live engine arrows without changing arrow meaning.

- CCP-036: Implement Honest Minimum Puzzles Route
  - Replace the placeholder puzzles route with the smallest real workflow supported by current puzzle data.

- CCP-037: Fetch Multi-Month Chess.com Archives
  - Import Chess.com games across the necessary archive months instead of only the newest month.

- CCP-038: Replace Header Game Review Stub
  - Replace or honestly disable the header `Game Review` stub instead of leaving a fake action.

- CCP-044-F1: Refine Engine Arrow Eval Labels
  - Make engine-arrow eval labels optional, off by default, and integrated into arrowheads for primary, secondary, and played arrows.

## Queue

## CCP-065 - Add Toggle For Review Label Visibility

```
Prompt ID: CCP-065
Task ID: CCP-065
Source Document: docs/archive/MOVE_QUALITY_AUDIT_2026-03-20.md
Source Step: Lichess-style move review label visibility parity
Execution Target: Claude Code

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, ask whether any other tool, agent, Codex thread, or Claude Code session is currently working in overlapping move-list, review-label, engine-settings, or analysis-rendering files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task:
Verify the exact Lichess behavior for move review labels and implement that behavior in Patzer as closely as possible, with a persisted toggle in engine settings that shows or hides the visible review labels.

Important truthfulness requirement:
- Do not assume Lichess paints `blunder`, `mistake`, or `inaccuracy` text directly onto the board.
- First verify from source how Lichess actually makes those review labels visible.
- If Lichess renders them as move glyphs in the move list/tree and summaries rather than on-board badges, preserve that exact behavior instead of inventing a board-label system.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant local Lichess source before deciding how to implement.
4. Compare:
   - how Lichess stores and renders review labels
   - how Patzer currently stores and renders them
   - where Patzer diverges
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build plus task-specific checks.

Relevant Patzer files to inspect first:
- `src/analyse/moveList.ts`
- `src/analyse/evalView.ts`
- `src/engine/winchances.ts`
- `src/engine/batch.ts`
- `src/engine/ctrl.ts`
- `src/ceval/view.ts`
- `src/styles/main.scss`
- `src/main.ts`
- `src/idb/index.ts`
- `docs/archive/MOVE_QUALITY_AUDIT_2026-03-20.md`

Relevant local Lichess files to inspect first:
- `/Users/leftcoast/Development/lichess-source/lila/ui/analyse/src/treeView/inlineView.ts`
- `/Users/leftcoast/Development/lichess-source/lila/ui/analyse/src/treeView/columnView.ts`
- `/Users/leftcoast/Development/lichess-source/lila/ui/analyse/src/treeView/contextMenu.ts`
- `/Users/leftcoast/Development/lichess-source/lila/ui/analyse/src/view/components.ts`
- `/Users/leftcoast/Development/lichess-source/lila/ui/analyse/src/view/moves.ts`
- `/Users/leftcoast/Development/lichess-source/lila/ui/analyse/src/ctrl.ts`
- `/Users/leftcoast/Development/lichess-source/lila/ui/lib/tree/src/tree.ts`
- `/Users/leftcoast/Development/lichess-source/lila/ui/lib/css/tree/_tree.scss`
- any additional local Lichess files you confirm are the real source of review-glyph rendering

Current repo-grounded behavior to confirm first:
- Patzer already computes and persists review labels such as `inaccuracy`, `mistake`, and `blunder`
- `src/analyse/moveList.ts` currently renders PGN glyphs first, then falls back to stored/computed review glyphs like `??`, `?`, and `?!`
- the current visible review-label behavior is primarily move-list based, not an on-board board-badge system
- there is currently no dedicated setting to hide or show those review labels independently

Requested behavior:
- match Lichess’s visible move-review label behavior as closely as possible
- if Lichess shows review labels as move glyphs in the move list/tree, implement that exact visible behavior and say so explicitly
- do not invent a separate board-overlay label system unless the Lichess source proves it exists
- add a toggle in engine settings to show or hide the visible review labels
- persist that toggle across reloads
- turning the toggle off must hide the visible review labels without deleting stored analysis data
- turning the toggle back on must reveal the same stored review labels again
- the toggle must not change review computation, only visibility
- keep the implementation small and well scoped
- do not add substantial new logic to `src/main.ts`

Implementation guidance:
- prefer placing the setting near the existing engine/review settings in `src/ceval/view.ts`
- if settings persistence already has a natural owner, use that existing subsystem instead of adding a new top-level store in `main.ts`
- make move-list rendering read the toggle before rendering visible review glyphs
- if summary UI also exposes these labels and the Lichess inspection shows they should stay visible, keep scope to move-list glyph visibility only unless there is a tiny safe parity case for broader hiding
- do not change move-quality classification thresholds or winning-chances math in this task

What I want from you before coding:
1. What part of the current Patzer codebase is relevant
2. What Lichess files/systems are relevant
3. The exact diagnosis
4. The exact smallest safe step being implemented
5. Why that step is safe and correctly scoped

Validation requirements:
- run `npm run build`
- run `npm run typecheck` if feasible and report the result honestly
- explicitly report:
  - build result
  - whether typecheck was run and its result
  - exact behavior changed intentionally
  - whether the new toggle persists across reload
  - whether visible review labels still appear correctly when enabled
  - whether they disappear correctly when disabled
  - whether there are console/runtime errors
  - any remaining parity gaps versus Lichess

Suggested manual checks:
- review a game and confirm `??`, `?`, and `?!` style review glyphs appear where Lichess-style move-list review would show them
- toggle the new setting off and confirm the visible glyphs disappear without losing stored review data
- reload the page and confirm the setting persists
- toggle it back on and confirm the same reviewed game shows glyphs again
- confirm restored analysis and fresh live review both behave correctly

Final report requirement:
- include `Prompt ID: CCP-065` and `Task ID: CCP-065` in the final report
```

## CCP-044-F1 - Refine Engine Arrow Eval Labels

```
Prompt ID: CCP-044-F1
Task ID: CCP-044
Parent Prompt ID: CCP-044
Source Document: docs/WISHLIST.md
Source Step: Add tag or label next to engine move arrows showing what their eval is
Execution Target: Codex

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same engine-arrow / ceval-settings / board-draw files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: Refine the recently added engine-arrow eval labels so they become an optional engine setting that is off by default, render as bare numbers inside the arrowheads instead of circled labels, support secondary engine-line arrows, and optionally label the played-move arrow when it differs from the top engine line.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - how Patzer Pro currently works
   - how Lichess handles engine arrows, auto-shapes, and ceval settings
   - where a small Patzer-specific UI divergence is needed for labeled arrowheads
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- This is a follow-up refinement to `CCP-044`, not a new engine-arrow system.
- Keep the setting off by default.
- The setting must be reachable from the engine settings panel.
- Keep the implementation scoped to engine-arrow label behavior and the minimal settings/state required to control it.
- Do not redesign the whole engine settings model.
- Do not bundle unrelated ceval, graph, or move-list changes.
- Do not add substantial new logic to `src/main.ts`.

Relevant current code areas to inspect first:
- `src/engine/ctrl.ts` — engine arrow shape generation, current primary arrow label, played arrow, MultiPV lines
- `src/ceval/view.ts` — engine settings UI
- `src/styles/main.scss` — ceval styling, PV font styling, eval-bar / score styling references
- `src/board/index.ts` — board draw registration if arrow-label rendering touches shape/defs behavior
- `docs/prompts/CLAUDE_PROMPT_HISTORY.md` — prior `CCP-044` notes if useful

Relevant Lichess source to inspect first:
- `~/Development/lichess-source/lila/ui/analyse/src/autoShape.ts`
- `~/Development/lichess-source/lila/ui/lib/src/ceval/view/settings.ts`
- any relevant Lichess ceval / auto-shape CSS or draw-shape references you need for arrow-label feasibility and settings behavior

Current repo-grounded behavior to confirm first:
- `src/engine/ctrl.ts` currently enables `showEngineArrows` by default
- the current primary label is built in `buildPrimaryArrowLabel()` as a separate labeled shape at the arrow destination
- the current label uses a filled circle-style label treatment rather than bare text integrated into the arrowhead
- there is currently no separate setting for arrow eval labels
- secondary engine arrows from MultiPV currently do not get labels
- the played arrow is controlled separately and currently has no eval label path

Requested behavior:
- engine-arrow eval labels should be controlled by a dedicated setting in the engine settings panel
- that setting should default to off
- the visual treatment should be:
  - just the number
  - no surrounding circle
  - placed inside the actual arrowhead area
- use the eval-bar score styling as a shadow/reference idea where helpful
- keep the label about the same size as the current one
- use the same font family as the engine lines / PV lines
- make labels available for subsequent engine-line arrows as well, not just the top line
- add a label path for the played-move arrow when that played arrow is separate from the top engine line
- keep this played-arrow labeling controlled by the same off-by-default label setting unless inspection shows a tiny safer split is required

What I want from you:
- first provide the required pre-implementation output:
  1. what part of the current codebase is relevant
  2. what Lichess files/systems are relevant
  3. the exact diagnosis
  4. the exact small step being implemented
  5. why that step is safe and correctly scoped
- then implement the change
- then validate it

Validation requirements:
- run `npm run build`
- run any task-specific checks you can
- explicitly report:
  - build result
  - feature-specific smoke tests
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - any remaining risks or limitations

Success criteria:
- engine-arrow eval labels are off by default
- the engine settings panel includes a control for the label feature
- primary engine-arrow labels render as bare numbers inside the arrowhead area, not as circled bubbles
- secondary engine-line arrows can also show labels when the setting is enabled
- the played arrow can also show a label when it is separate from the top engine line
- the label font matches the engine-line / PV font family
- label styling remains readable and does not regress non-labeled arrow behavior
```

- remove the current winner star presentation
- render the winner in a clearly designed green box
- render the loser in a clearly designed red box
- keep each player box containing:
  - username
  - rating, when available
  - board-color marker
- keep the result scoped to the player strips only
- preserve material and clock rendering unless a tiny layout adjustment is needed to keep the boxes coherent

Validation requirements:
- run `npm run build`
- run any task-specific checks you can
- explicitly report:
  - build result
  - feature-specific smoke tests
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - any remaining risks or limitations

Success criteria:
- the winner no longer shows only a star
- the winner is shown in a green framed/fill treatment
- the loser is shown in a red framed/fill treatment
- each player strip still shows username, rating, and board-color marker together inside the box
- draw behavior remains sane and does not falsely mark both players as winner/loser
- no unrelated board behavior is changed
```

## CCP-030 - First Safe Typecheck Error Slice

```
Prompt ID: CCP-030
Task ID: CCP-030
Source Document: docs/KNOWN_ISSUES.md
Source Step: [HIGH] `npm run typecheck` is wired but surfaces 53 type errors

Task: Reduce the current typecheck backlog by fixing only the first cohesive error slice from the live compiler output, without trying to clear the whole repo in one prompt.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- `tsconfig.json`
- `tsconfig.base.json`
- `src/analyse/evalView.ts`
- `src/analyse/moveList.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/KNOWN_ISSUES.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `tsconfig.json`
- `tsconfig.base.json`
- `src/analyse/evalView.ts`
- `src/analyse/moveList.ts`

Lichess inspection is probably not needed for this task because it is TypeScript correctness cleanup, not behavior parity work. Do not force a Lichess detour unless the actual fix depends on understanding a Lichess-aligned data shape.

Current repo-grounded diagnosis:
- `npm run typecheck -- --pretty false` currently reports many errors across the repo
- the first cohesive cluster is in `src/analyse/evalView.ts` and `src/analyse/moveList.ts`
- that cluster is dominated by `exactOptionalPropertyTypes` and `possibly undefined` errors around mainline indexing and optional phase-divider fields
- the smallest safe step is to clear just this first analysis-view cluster, not the entire backlog

Implement only the smallest safe step:
- fix the current type errors in `src/analyse/evalView.ts` and `src/analyse/moveList.ts`
- keep the task scoped to that cluster only
- preserve current runtime behavior
- do not opportunistically fix unrelated files from the broader compiler output
- do not loosen compiler settings
- do not bundle refactors beyond what is required for safe typing

Before coding, provide:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files, if applicable
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run typecheck -- --pretty false`
- run `npm run build`
- explicitly report whether the targeted `src/analyse/evalView.ts` and `src/analyse/moveList.ts` errors are gone
- report the remaining compiler-error count or remaining compiler files if the full backlog still exists
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
- relevant Lichess files, if applicable
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks

In your final report, repeat:
- `Prompt ID: CCP-030`
- `Task ID: CCP-030`
```

## CCP-031 - Fix Board Wheel Navigation Selector

```
Prompt ID: CCP-031
Task ID: CCP-031
Source Document: docs/KNOWN_ISSUES.md
Source Step: [HIGH] Wheel scroll navigation is still non-functional

Task: Fix wheel-based board navigation by correcting the actual board hit-target seam, without bundling broader input-system work.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- `src/main.ts`
- `src/styles/main.scss`
- `src/board/index.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/KNOWN_ISSUES.md`
- relevant Lichess controls/wheel source

Relevant Patzer Pro files already identified from current repo inspection:
- `src/main.ts`
- `src/styles/main.scss`
- `src/board/index.ts`

Because this task affects analysis-board interaction behavior, inspect relevant Lichess source before deciding implementation details. Start with:
- `~/Development/lichess-source/lila/ui/lib/src/view/controls.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/view/components.ts`

Current repo-grounded diagnosis:
- the wheel listener in `src/main.ts` still targets `.analyse__board-wrap`
- the live rendered board container is `div.analyse__board.main-board`
- so wheel events over the actual board area never satisfy the containment check
- this is a small selector / hit-target correctness bug, not a broad navigation redesign

Implement only the smallest safe step:
- make wheel navigation hit the real board container
- preserve the existing thresholding and next/prev semantics
- do not redesign keyboard navigation
- do not bundle unrelated board input cleanup

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
- explicitly verify:
  - wheel scrolling over the analysis board steps through moves
  - wheel scrolling outside the board does not trigger move navigation
  - pinch-zoom / ctrl-wheel remains unaffected
- report whether behavior changed intentionally
- report whether there are console/runtime errors
- report remaining risks and limitations

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

In your final report, repeat:
- `Prompt ID: CCP-031`
- `Task ID: CCP-031`
```


## CCP-033 - Fix Imported-Game Orientation Propagation

```
Prompt ID: CCP-033
Task ID: CCP-033
Source Document: docs/KNOWN_ISSUES.md
Source Step: [HIGH] Imported-game board orientation does not always match the importing user's side

Task: Fix the board-orientation propagation bug so imported games consistently orient the live board to the importing user's side when that side is known.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- `src/main.ts`
- `src/board/index.ts`
- `src/games/view.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/KNOWN_ISSUES.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `src/main.ts`
- `src/board/index.ts`
- `src/games/view.ts`

Because this task affects board behavior, inspect relevant Lichess source before deciding implementation details. Start with:
- `~/Development/lichess-source/lila/ui/analyse/src/ctrl.ts`
- any relevant Lichess board-orientation owner files you find necessary

Current repo-grounded diagnosis:
- `loadGame()` in `src/main.ts` already derives `userColor` and calls `setOrientation(userColor)`
- `src/board/index.ts` stores orientation separately and applies it to Chessground at creation/update points
- the known issue indicates the orientation change is not always reaching the live board state even when the player-strip perspective is correct
- this is a propagation/state-sync bug, not a request for new orientation features

Implement only the smallest safe step:
- make the importing user's known side reliably propagate to the live board orientation on game load
- preserve current manual flip behavior if it exists
- do not redesign board ownership
- do not bundle unrelated player-strip or board-cosmetic work

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
- explicitly verify:
  - importing a game where the importing user is White orients the board White-at-bottom
  - importing a game where the importing user is Black orients the board Black-at-bottom
  - the board orientation matches the player-strip perspective
  - no console/runtime errors are introduced
- report whether behavior changed intentionally
- report remaining risks and limitations

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

In your final report, repeat:
- `Prompt ID: CCP-033`
- `Task ID: CCP-033`
```

## CCP-006-F1 - Fix Analysis-Game Empty-Library Loading State

```
Prompt ID: CCP-006-F1
Task ID: CCP-006
Parent Prompt ID: CCP-006
Source Document: docs/KNOWN_ISSUES.md
Source Step: [MEDIUM] `analysis-game` route can still get stuck in a fake loading state

Task: Finish the honest minimum `analysis-game` route by separating “library still loading” from “library is empty” so the route stops showing permanent fake loading text.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- `src/main.ts`
- `src/router.ts`
- `src/idb/index.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/KNOWN_ISSUES.md`
- `docs/prompts/CLAUDE_PROMPT_LOG.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `src/main.ts`
- `src/router.ts`
- `src/idb/index.ts`

Because this task affects route behavior and startup loading semantics, inspect relevant Lichess source before deciding implementation details if you need a route/loading reference. Otherwise keep the task local.

Current repo-grounded diagnosis:
- `analysis-game` is no longer a placeholder
- but `routeContent()` in `src/main.ts` still treats `importedGames.length === 0` as a loading proxy
- that means an actually empty library can leave `#/analysis/:id` stuck on permanent `Loading…`
- this exact failure mode is already recorded in the review log for `CCP-006`

Implement only the smallest safe step:
- add a real loaded-vs-empty distinction for the route decision
- keep this scoped to honest `analysis-game` loading/empty/missing states
- do not redesign startup orchestration broadly
- do not bundle unrelated route work

Before coding, provide:
- prompt id
- task id
- parent prompt id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files, if applicable
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- explicitly verify:
  - a valid `analysis-game` route still opens the real analysis board
  - an empty imported library does not get stuck on permanent `Loading…`
  - an unknown game id produces an honest not-found state
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
- relevant Lichess files, if applicable
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks

In your final report, repeat:
- `Prompt ID: CCP-006-F1`
- `Task ID: CCP-006`
```

## CCP-034 - Improve Eval Graph Hover And Scrub

```
Prompt ID: CCP-034
Task ID: CCP-034
Source Document: docs/KNOWN_ISSUES.md
Source Step: [MEDIUM] Eval graph hover/scrub behavior is not yet working as expected

Task: Add the first safe graph-hover/scrub improvement so the eval graph is more useful for review without redesigning the whole graph component.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- `src/analyse/evalView.ts`
- `src/main.ts`
- `src/styles/main.scss`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/KNOWN_ISSUES.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `src/analyse/evalView.ts`
- `src/main.ts`
- `src/styles/main.scss`

Because this task affects analysis-board graph behavior, inspect relevant Lichess source before deciding implementation details. Start with:
- `~/Development/lichess-source/lila/ui/chart/src/acpl.ts`
- `~/Development/lichess-source/lila/ui/chart/src/division.ts`
- any relevant Lichess graph hover/scrub helpers you find necessary

Current repo-grounded diagnosis:
- `renderEvalGraph()` currently renders clickable strips and dots, but no real hover/scrub state
- the known issue calls out graph review interaction quality rather than missing graph data
- the smallest safe step is likely hover-driven current-position preview or clearer scrub targeting, not a full chart rewrite

Implement only the smallest safe step:
- add the first meaningful hover/scrub behavior improvement to the eval graph
- keep the task scoped to one coherent interaction improvement
- preserve existing click-to-navigate behavior
- do not redesign graph styling broadly
- do not bundle unrelated review-summary work

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
- explicitly verify:
  - hover/scrub gives clearer move targeting than before
  - click navigation still works
  - the graph still renders correctly across analyzed and partially analyzed games
- report whether behavior changed intentionally
- report whether there are console/runtime errors
- report remaining risks and limitations

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

In your final report, repeat:
- `Prompt ID: CCP-034`
- `Task ID: CCP-034`
```

## CCP-035 - Fix Engine Arrowhead Rendering

```
Prompt ID: CCP-035
Task ID: CCP-035
Source Document: docs/KNOWN_ISSUES.md
Source Step: [MEDIUM] Engine arrows can render without a visible arrowhead

Task: Fix the engine-arrow rendering seam so live arrows consistently show a visible arrowhead, without changing the meaning of the arrows themselves.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- `src/board/index.ts`
- `src/engine/ctrl.ts`
- `src/styles/main.scss`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/KNOWN_ISSUES.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `src/board/index.ts`
- `src/engine/ctrl.ts`

Because this task affects board drawable behavior, inspect relevant Lichess source before deciding implementation details. Start with:
- `~/Development/lichess-source/lila/ui/analyse/src/autoShape.ts`
- any relevant Chessground brush/drawable configuration source you find necessary

Current repo-grounded diagnosis:
- `src/engine/ctrl.ts` builds engine/threat/played arrow shapes with several brush names
- `src/board/index.ts` currently customizes only `paleBlue`
- the missing-arrowhead bug suggests the current brush/config seam is incomplete or mismatched for some live arrows
- this task should stay at the rendering seam, not change arrow logic

Implement only the smallest safe step:
- make engine arrows render with a visible arrowhead consistently
- keep the task scoped to brush/drawable/rendering correctness
- preserve existing arrow colors and semantics as much as possible
- do not redesign all board drawable styling
- do not bundle unrelated arrow logic changes

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
- explicitly verify:
  - primary engine arrows show a visible arrowhead
  - threat and secondary arrows remain readable
  - played-move arrow behavior does not regress
- report whether behavior changed intentionally
- report whether there are console/runtime errors
- report remaining risks and limitations

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

In your final report, repeat:
- `Prompt ID: CCP-035`
- `Task ID: CCP-035`
```

## CCP-036 - Implement Honest Minimum Puzzles Route

```
Prompt ID: CCP-036
Task ID: CCP-036
Source Document: docs/KNOWN_ISSUES.md
Source Step: [MEDIUM] Puzzle route is still a placeholder

Task: Replace the placeholder `#/puzzles` route with the smallest honest user-facing workflow built from the puzzle data the repo already has.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- `src/main.ts`
- `src/router.ts`
- `src/puzzles/extract.ts`
- `src/idb/index.ts`
- `src/games/view.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/KNOWN_ISSUES.md`
- `docs/reference/lichess-puzzle-ux/README.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `src/main.ts`
- `src/router.ts`
- `src/puzzles/extract.ts`
- `src/idb/index.ts`

Because this task affects puzzle UX and routing, inspect relevant Lichess source before deciding implementation details. Start with:
- the local puzzle UX research docs in `docs/reference/lichess-puzzle-ux/`
- any directly relevant Lichess puzzle route/view files those docs point to

Current repo-grounded diagnosis:
- the app already extracts puzzle candidates and persists saved puzzles
- but `routeContent()` in `src/main.ts` still renders `h('h1', 'Puzzles Page')`
- the smallest safe step is to make the route honest using existing saved-puzzle data, not to build the full puzzle product

Implement only the smallest safe step:
- replace the placeholder puzzles route with a minimal real view over existing saved puzzle data
- keep this scoped to one honest route surface
- do not build full puzzle solving/runtime/session features in this task
- do not redesign the saved-puzzle model

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
- explicitly verify:
  - `#/puzzles` no longer renders only a placeholder heading
  - saved puzzle data is surfaced honestly
  - empty-state behavior is clear when no saved puzzles exist
- report whether behavior changed intentionally
- report whether there are console/runtime errors
- report remaining risks and limitations

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

In your final report, repeat:
- `Prompt ID: CCP-036`
- `Task ID: CCP-036`
```

## CCP-037 - Fetch Multi-Month Chess.com Archives

```
Prompt ID: CCP-037
Task ID: CCP-037
Source Document: docs/KNOWN_ISSUES.md
Source Step: [LOW] Chess.com import still fetches only the latest archive month

Task: Make Chess.com import respect broader date ranges by fetching the necessary archive months instead of only the newest archive.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- `src/import/chesscom.ts`
- `src/import/filters.ts`
- `src/import/types.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/KNOWN_ISSUES.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `src/import/chesscom.ts`
- `src/import/filters.ts`
- `src/import/types.ts`

Lichess inspection is not required for this task because it is a Chess.com importer correctness issue.

Current repo-grounded diagnosis:
- `fetchChesscomGames()` fetches the archive index successfully
- but then it still fetches only `archives[archives.length - 1]`
- date filtering happens after fetch, so wider date ranges are artificially truncated to one month
- this task should stay narrowly focused on fetching the right archive months

Implement only the smallest safe step:
- fetch the set of archive months needed for the current date-filter window
- keep the existing filtering and normalization flow as intact as possible
- do not redesign the whole import UI
- do not bundle unrelated importer cleanup

Before coding, provide:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files, if applicable
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run the most relevant task-specific check you can for importer behavior
- explicitly verify:
  - broader Chess.com date ranges fetch more than one month when needed
  - narrow ranges still behave correctly
  - duplicate games are not introduced by multi-month fetch
- report whether behavior changed intentionally
- report whether there are console/runtime errors
- report remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results.

Output shape:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files, if applicable
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks

In your final report, repeat:
- `Prompt ID: CCP-037`
- `Task ID: CCP-037`
```

## CCP-038 - Replace Header Game Review Stub

```
Prompt ID: CCP-038
Task ID: CCP-038
Source Document: docs/KNOWN_ISSUES.md
Source Step: [LOW] Header global menu still contains a stub Game Review action

Task: Replace the header `Game Review` TODO stub with the smallest honest real behavior, or disable it honestly if no safe real behavior fits the current app architecture.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- `src/header/index.ts`
- `src/main.ts`
- `src/analyse/pgnExport.ts`
- `src/engine/batch.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/KNOWN_ISSUES.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `src/header/index.ts`
- `src/main.ts`
- `src/analyse/pgnExport.ts`
- `src/engine/batch.ts`

Because this task touches analysis/review workflow behavior, inspect relevant Lichess source before deciding implementation details if a direct UX comparison is needed. Otherwise keep the change scoped to honest non-stub behavior.

Current repo-grounded diagnosis:
- the global menu still logs `TODO: game review settings`
- Patzer already has real review behavior elsewhere on the analysis board
- the issue is not “build full game review from scratch”; it is “stop exposing a fake menu action”
- the smallest safe step may be to wire the item to an existing real review flow or to disable/hide it honestly

Implement only the smallest safe step:
- replace the stub `Game Review` menu behavior with an honest real action or honest disabled state
- keep this scoped to the global-menu entry only
- do not redesign the whole header menu
- do not bundle broader game-review architecture changes

Before coding, provide:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files, if applicable
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- explicitly verify:
  - the global menu no longer triggers a TODO stub for `Game Review`
  - the replacement behavior is honest and does not mislead the user
  - unrelated header actions still work
- report whether behavior changed intentionally
- report whether there are console/runtime errors
- report remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results.

Output shape:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files, if applicable
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks

In your final report, repeat:
- `Prompt ID: CCP-038`
- `Task ID: CCP-038`
```
