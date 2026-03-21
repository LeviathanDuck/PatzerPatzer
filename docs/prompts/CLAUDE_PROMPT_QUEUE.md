# Claude Prompt Queue

Use this file to store Claude Code prompts that are ready to run in a future Claude session.

## How to use it

- Add full copy-paste-ready prompts here when they are created.
- Do not add review status here.
- Do not add queue status text by default. A queued prompt is simply present in this file.
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

## Queue

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

## CCP-032 - Replace Stop Boolean With Search Tokens

```
Prompt ID: CCP-032
Task ID: CCP-032
Source Document: docs/KNOWN_ISSUES.md
Source Step: [HIGH] In-flight engine stop handling still relies on a boolean flag

Task: Replace the remaining boolean stop-bookkeeping seam with a more reliable per-search token/counter so stale interrupted-search `bestmove` output is handled correctly.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- `src/engine/ctrl.ts`
- `src/main.ts`
- `src/board/index.ts`
- `src/ceval/protocol.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/KNOWN_ISSUES.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `src/engine/ctrl.ts`
- `src/ceval/protocol.ts`
- `src/main.ts`

Because this task affects analysis-board engine lifecycle behavior, inspect relevant Lichess source before deciding implementation details. Start with:
- `~/Development/lichess-source/lila/ui/lib/src/ceval/ctrl.ts`
- `~/Development/lichess-source/lila/ui/lib/src/ceval/protocol.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/ctrl.ts`

Current repo-grounded diagnosis:
- the known-issues file still tracks in-flight stop handling as a distinct gap
- `src/engine/ctrl.ts` still carries stop-state bookkeeping that can be too coarse during rapid stop/start sequences
- the remaining risk is stale `bestmove` output from an interrupted search being mistaken for the current search result
- this task should stay focused on stop bookkeeping only

Implement only the smallest safe step:
- replace the remaining coarse boolean-style stop bookkeeping with a per-search token, counter, or equivalently precise seam
- keep the change local to engine stop/start correctness
- preserve the already-fixed navigation and restore reliability behavior
- do not redesign the entire engine lifecycle
- do not bundle unrelated UI or persistence work

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
  - rapid stop/start sequences do not let stale `bestmove` output corrupt the current node
  - pending evaluation for the current node still resumes correctly
  - no regression is introduced to live current-node updates
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
- `Prompt ID: CCP-032`
- `Task ID: CCP-032`
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

## CCP-040 - Eval Graph Display Refresh

```
Prompt ID: CCP-040
Task ID: CCP-040
Source Document: docs/WISHLIST.md
Source Step: Changes to how the eval graph is displayed and formatted

Task: Take the first small safe wishlist step on eval-graph presentation by improving one clear display/formatting seam without redesigning the whole graph.

Before editing, inspect:
- `docs/WISHLIST.md`
- `docs/ARCHITECTURE.md`
- `docs/NEXT_STEPS.md`
- `docs/KNOWN_ISSUES.md`
- `src/analyse/evalView.ts`
- `src/styles/main.scss`
- `AGENTS.md`
- `CLAUDE.md`

Because this touches analysis-board graph UX, inspect relevant Lichess chart/analysis graph source first.

Implement only the smallest safe formatting/display improvement you can justify from the current code and Lichess comparison.
Do not bundle hover/scrub fixes already tracked elsewhere.
Do not redesign the review pipeline.

Validation:
- run `npm run build`
- verify the graph still renders for analyzed games
- verify empty/partial states still behave honestly

Also include a short manual test checklist.
In your final report, repeat:
- `Prompt ID: CCP-040`
- `Task ID: CCP-040`
```

## CCP-042 - Move Review Button Beside Navigation Controls

```
Prompt ID: CCP-042
Task ID: CCP-042
Source Document: docs/WISHLIST.md
Source Step: Move the analysis-page Review / Re-analyze button beside the move-navigation buttons

Task: Move the analysis-page `Review` / `Re-analyze` control into the navigation-controls row in the smallest extraction-friendly way.

Before editing, inspect:
- `docs/WISHLIST.md`
- `docs/ARCHITECTURE.md`
- `docs/NEXT_STEPS.md`
- `docs/KNOWN_ISSUES.md`
- `src/main.ts`
- `src/analyse/pgnExport.ts`
- `src/styles/main.scss`
- `AGENTS.md`
- `CLAUDE.md`

Inspect relevant Lichess analysis-board control placement before deciding implementation details.

Implement only the smallest safe layout ownership step:
- relocate the review button near `Prev` / `Flip` / `Next`
- avoid adding more control-layout glue to `src/main.ts`
- do not redesign other controls

Validation:
- run `npm run build`
- verify Review/Re-analyze still works from the new location
- verify the old underboard location is gone

Also include a short manual test checklist.
In your final report, repeat:
- `Prompt ID: CCP-042`
- `Task ID: CCP-042`
```

## CCP-044 - Add Eval Labels To Engine Arrows

```
Prompt ID: CCP-044
Task ID: CCP-044
Source Document: docs/WISHLIST.md
Source Step: Add tag or label next to engine move arrows showing what their eval is

Task: Add the first safe eval label for engine arrows so the current best-move arrow communicates its score more clearly without cluttering the board.

Before editing, inspect:
- `docs/WISHLIST.md`
- `docs/ARCHITECTURE.md`
- `docs/NEXT_STEPS.md`
- `docs/KNOWN_ISSUES.md`
- `src/engine/ctrl.ts`
- `src/ceval/view.ts`
- `src/board/index.ts`
- `src/styles/main.scss`
- `AGENTS.md`
- `CLAUDE.md`

Inspect relevant Lichess engine-arrow / auto-shape source first.

Implement only the smallest safe step:
- start with the primary engine arrow only unless the current board rendering safely supports more
- keep the label tied to real current eval state
- do not redesign all arrow rendering

Validation:
- run `npm run build`
- verify the label follows the current engine arrow correctly
- verify the board does not become unreadable

Also include a short manual test checklist.
In your final report, repeat:
- `Prompt ID: CCP-044`
- `Task ID: CCP-044`
```

## CCP-045 - Prevent Duplicate Reimports

```
Prompt ID: CCP-045
Task ID: CCP-045
Source Document: docs/WISHLIST.md
Source Step: we shouldn't re import the same games that have already been imported

Task: Prevent obviously duplicate game reimports in the smallest safe way, without redesigning the whole import subsystem.

Before editing, inspect:
- `docs/WISHLIST.md`
- `docs/ARCHITECTURE.md`
- `docs/NEXT_STEPS.md`
- `docs/KNOWN_ISSUES.md`
- `src/main.ts`
- `src/import/chesscom.ts`
- `src/import/lichess.ts`
- `src/import/pgn.ts`
- `src/import/types.ts`
- `AGENTS.md`
- `CLAUDE.md`

Implement only the smallest safe dedupe step:
- define a concrete duplicate identity rule from current imported-game data
- block re-adding exact duplicates
- preserve normal import flow otherwise
- do not bundle incremental-import or “new import” badging yet

Validation:
- run `npm run build`
- verify exact duplicate imports are skipped
- verify genuinely new games still import

Also include a short manual test checklist.
In your final report, repeat:
- `Prompt ID: CCP-045`
- `Task ID: CCP-045`
```

## CCP-046 - Import Only New Games Since Last Import

```
Prompt ID: CCP-046
Task ID: CCP-046
Source Document: docs/WISHLIST.md
Source Step: Import only new games since last import. Freshly imported games from last batch should get a new import identifier

Task: Take the first safe step toward incremental imports by importing only new games since the last batch for the same source/user and marking newly added games with a temporary “new import” indicator.

Before editing, inspect:
- `docs/WISHLIST.md`
- `docs/ARCHITECTURE.md`
- `docs/NEXT_STEPS.md`
- `docs/KNOWN_ISSUES.md`
- `src/main.ts`
- `src/header/index.ts`
- `src/games/view.ts`
- `src/import/chesscom.ts`
- `src/import/lichess.ts`
- `src/import/types.ts`
- `src/idb/index.ts`
- `AGENTS.md`
- `CLAUDE.md`

Implement only the smallest safe step:
- build on top of existing duplicate-prevention logic if present
- keep “new import” marking local and time-bounded
- avoid redesigning the full import history system

Validation:
- run `npm run build`
- verify repeat imports add only new games
- verify newly added games are visibly marked for a limited time

Also include a short manual test checklist.
In your final report, repeat:
- `Prompt ID: CCP-046`
- `Task ID: CCP-046`
```

## CCP-051 - KO Overlay On Losing King For M1

```
Prompt ID: CCP-051
Task ID: CCP-051
Source Document: docs/WISHLIST.md
Source Step: When M1 is played on the board, the losing king should get a KO symbol over it

Task: Add the first safe checkmate KO overlay for the losing king on immediate mate positions, but stop and ask if the required KO graphic/source asset is not already available in the repo.

Before editing, inspect:
- `docs/WISHLIST.md`
- `docs/ARCHITECTURE.md`
- `docs/NEXT_STEPS.md`
- `docs/KNOWN_ISSUES.md`
- `src/board/index.ts`
- `src/styles/main.scss`
- any existing local assets/icons that could supply the KO treatment
- `AGENTS.md`
- `CLAUDE.md`

Implement only the smallest safe step:
- if a suitable KO asset/source already exists or can be represented safely with current local assets, use it
- if the graphic/source is unknown and truly required, stop and ask instead of inventing a random asset
- do not redesign all board overlays

Validation:
- run `npm run build`
- verify the KO marker appears only on the losing king in the intended M1 state
- verify non-mate positions are unaffected

Also include a short manual test checklist.
In your final report, repeat:
- `Prompt ID: CCP-051`
- `Task ID: CCP-051`
```

## CCP-052 - Hide Arrows During Game Review

```
Prompt ID: CCP-052
Task ID: CCP-052
Source Document: docs/WISHLIST.md
Source Step: when game review button is pressed, all arrows should be removed from board until game review is completed

Task: Hide board arrows during active batch game review in the smallest safe way so review runs without board-arrow clutter.

Before editing, inspect:
- `docs/WISHLIST.md`
- `docs/ARCHITECTURE.md`
- `docs/NEXT_STEPS.md`
- `docs/KNOWN_ISSUES.md`
- `src/engine/batch.ts`
- `src/engine/ctrl.ts`
- `src/board/index.ts`
- `src/analyse/pgnExport.ts`
- `AGENTS.md`
- `CLAUDE.md`

Inspect relevant Lichess review/analysis guidance suppression behavior first if applicable.

Implement only the smallest safe step:
- suppress all board arrows during active review
- restore them when review completes or stops
- do not redesign all review UI

Validation:
- run `npm run build`
- verify arrows disappear during review
- verify arrows return after review completion/exit

Also include a short manual test checklist.
In your final report, repeat:
- `Prompt ID: CCP-052`
- `Task ID: CCP-052`
```

## CCP-053 - Toggle Review Dots To User Perspective Only

```
Prompt ID: CCP-053
Task ID: CCP-053
Source Document: docs/WISHLIST.md
Source Step: Setting to toggle only the user's perspective move review annotated dot colour shown

Task: Add the first safe setting that lets the move-list and graph annotation dots show only the current user-perspective player's review marks, while defaulting to the current both-sides view.

Before editing, inspect:
- `docs/WISHLIST.md`
- `docs/ARCHITECTURE.md`
- `docs/NEXT_STEPS.md`
- `docs/KNOWN_ISSUES.md`
- `src/analyse/moveList.ts`
- `src/analyse/evalView.ts`
- `src/games/view.ts`
- `src/header/index.ts`
- `src/board/cosmetics.ts`
- `src/styles/main.scss`
- `AGENTS.md`
- `CLAUDE.md`

Implement only the smallest safe step:
- add one setting with default “show both”
- filter annotation-dot color visibility by current user perspective when enabled
- do not redesign review-label computation

Validation:
- run `npm run build`
- verify default behavior is unchanged
- verify user-perspective-only mode filters annotation dots correctly

Also include a short manual test checklist.
In your final report, repeat:
- `Prompt ID: CCP-053`
- `Task ID: CCP-053`
```

## CCP-055 - Mate Display KO Polish

```
Prompt ID: CCP-055
Task ID: CCP-055
Source Document: inferred from user request in chat
Source Step: mate-display UI polish so checkmate is shown as `#KO!` in the move list and engine display

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Task: implement mate-display UI polish so checkmate is shown as `#KO!` in the move list and engine display, and make the engine-display `#KO!` purple.

Requested behavior:
- In the move list, mate should display as `#KO!` instead of the current mate text.
- In the engine display / ceval area, mate should also display as `#KO!`.
- The engine-display `#KO!` should be purple.
- Keep the change scoped to mate presentation only. Do not bundle unrelated engine, review, or move-list changes.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - how Patzer Pro currently works
   - how Lichess works
   - where they differ
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- Lichess is the reference for analysis-board behavior and subsystem shape, but this request is an intentional Patzer-specific UI divergence.
- Do not add substantial new logic to `src/main.ts`.
- Keep the implementation small and scoped.
- Preserve existing non-mate eval formatting behavior.

Relevant current code areas to inspect:
- `src/analyse/moveList.ts` — move-list mate/eval rendering
- `src/analyse/evalView.ts` — shared score formatting and eval display
- `src/ceval/view.ts` — engine display / PV rendering
- `src/styles/main.scss` — engine display and move-list styling

Likely current behavior to confirm first:
- move list currently renders mate text from cached eval
- engine display likely uses shared eval formatting that currently renders `#N`
- mate styling may currently inherit normal eval text color rather than a distinct purple treatment

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
- run the build
- run any task-specific checks you can
- explicitly report:
  - build result
  - feature-specific smoke tests
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - any remaining risks or limitations

Success criteria:
- move list shows `#KO!` for mate positions
- engine display shows `#KO!` for mate positions
- engine-display `#KO!` is purple
- non-mate eval formatting remains unchanged
- no unrelated engine/review behavior is changed
```

## CCP-056 - Add Main-Menu Toggle For Board Wheel Navigation

```
Prompt ID: CCP-056
Task ID: CCP-056
Execution Target: Codex
Source Document: inferred from user request in chat
Source Step: make board-wheel move navigation a main-menu setting that defaults to off

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

This prompt follows the repo's Claude prompt-tracking format, but it is intended for Codex to execute.

Task: change board-wheel move navigation so it is controlled by a toggle in the main menu, with the default state set to off.

Current repo-grounded implementation points already identified:
- `src/main.ts` contains the global `wheel` listener that currently scrolls through moves while the mouse is over the board
- `src/header/index.ts` owns the global settings menu
- `src/board/cosmetics.ts` already contains board-related persisted settings patterns using localStorage

Required workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the exact implementation points before assuming file paths.
3. Inspect relevant Lichess source before deciding implementation details.
4. Compare:
   - how Patzer Pro currently works
   - how Lichess handles nearby settings ownership or board-behavior toggles
   - where this request intentionally diverges
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Relevant files to inspect first:
- `AGENTS.md`
- `CLAUDE.md`
- `docs/ARCHITECTURE.md`
- `docs/NEXT_STEPS.md`
- `docs/KNOWN_ISSUES.md`
- `src/main.ts`
- `src/header/index.ts`
- `src/board/cosmetics.ts`
- `src/styles/main.scss`

Relevant Lichess files/systems to inspect first:
- `~/Development/lichess-source/lila/ui/dasher/src/board.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/ctrl.ts`
- any closely related Lichess setting/menu files you find necessary for board-behavior toggle ownership

Current diagnosis to confirm:
- board-wheel move navigation is currently always on when the mouse is over the board
- there is no user-facing setting for this behavior
- the most likely safe implementation is to add a persisted boolean setting near existing board/global settings ownership, then gate the existing wheel listener on that setting
- because the menu lives in `src/header/index.ts`, the setting should be exposed there rather than as a one-off hidden flag in `src/main.ts`

Implement only the smallest safe step:
- add a persisted on/off setting for board-wheel move navigation
- default it to off for users with no stored preference
- expose it in the existing main/global menu
- gate the current wheel listener on that setting
- keep the change scoped to settings ownership + wheel behavior only

Do not:
- redesign the global menu
- move unrelated logic out of `src/main.ts` unless the smallest safe fix requires a tiny extraction
- bundle other board settings changes
- change unrelated navigation behavior

Before coding, provide:
- prompt id
- task id
- execution target
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
- run the most relevant task-specific check you can
- explicitly report:
  - whether board-wheel move navigation is now off by default
  - whether turning the setting on enables wheel-based move navigation over the board
  - whether turning the setting off disables that behavior again without affecting normal page scroll elsewhere
  - whether the setting persists across reload
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - any remaining risks or limitations

Also include a short manual test checklist with concrete user actions and expected results. Keep it tightly scoped to this change.

Output shape:
- prompt id
- task id
- execution target
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
- `Prompt ID: CCP-056`
- `Task ID: CCP-056`
- `Execution Target: Codex`
```
