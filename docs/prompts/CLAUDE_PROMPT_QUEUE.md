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


## CCP-019 - Complete Retrospection Lifecycle Handling

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
- `Prompt ID: CCP-019`
- `Task ID: CCP-019`
```

## CCP-020 - Move Retrospection UI Into Analysis Tools

```
Prompt ID: CCP-020
Task ID: CCP-020
Source Document: docs/reference/patzer-retrospection-audit.md
Source Step: Recommended next implementation sequence, Step 3

Task: Move the active retrospection UI out of the bottom control strip and into the analysis tools area so the feature starts behaving like an analysis-owned mode instead of a page-level footer add-on.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- `src/main.ts`
- `src/analyse/retroView.ts` if it exists after the previous step
- `src/analyse/moveList.ts`
- `src/ceval/view.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/reference/patzer-retrospection-audit.md`
- `docs/reference/lichess-retrospection-ux/README.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `src/main.ts`
- `src/analyse/retroView.ts` or the current retrospection UI owner
- analysis-board tools-area render path in the current repo

Because this task affects Lichess-aligned analysis-board UX, inspect relevant Lichess source before deciding implementation details. Start with:
- `~/Development/lichess-source/lila/ui/analyse/src/view/tools.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/retrospect/retroView.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/view/components.ts`

Current repo-grounded diagnosis:
- the audit identifies the current retrospection strip placement as a major UX mismatch versus Lichess
- Patzer currently exposes active retrospection controls in the bottom analysis controls row
- the next safe step is placement/ownership improvement only
- this task should not yet change solve rules, ceval acceptance, or opening logic

Implement only the smallest safe step:
- move the active retrospection UI into the analysis tools area
- preserve the current button set and current retrospection behavior as much as possible
- keep the existing entry affordance behavior unless a tiny relocation of the entry control is clearly required
- do not bundle suppression of other analysis UI yet
- do not redesign the retrospection copy/states broadly
- do not add new solve-loop behavior

A likely safe direction is:
- render the active retrospection box alongside other analysis tools rather than in the bottom control strip
- keep the layout change local to the analysis view owner
- preserve current event handlers and state flow

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
- run the most relevant task-specific check you can for this UX change
- explicitly verify:
  - entering retrospection shows the active session UI in the analysis tools area
  - the current retrospection controls still function from the new placement
  - the bottom control strip no longer carries the active retrospection box
  - normal non-retrospection analysis controls still work
  - there are no console/runtime errors
- report remaining risks and limitations, especially any still-deferred suppression/hiding behavior

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
- `Prompt ID: CCP-020`
- `Task ID: CCP-020`
```

## CCP-021 - Suppress Conflicting Analysis UI During Retrospection

```
Prompt ID: CCP-021
Task ID: CCP-021
Source Document: docs/reference/patzer-retrospection-audit.md
Source Step: Recommended next implementation sequence, Step 4

Task: Add retrospection-specific suppression of conflicting analysis UI so Learn From Mistakes behaves more like a focused board mode and less like normal analysis with extra controls layered on top.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- `src/ceval/view.ts`
- `src/engine/ctrl.ts`
- `src/main.ts`
- `src/analyse/retroView.ts` if it exists
- `src/analyse/evalView.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/reference/patzer-retrospection-audit.md`
- `docs/reference/lichess-retrospection-ux/README.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `src/ceval/view.ts`
- `src/engine/ctrl.ts`
- `src/main.ts`
- current analysis tools-area rendering path

Because this task affects analysis-board mode behavior, inspect relevant Lichess source before deciding implementation details. Start with:
- `~/Development/lichess-source/lila/ui/analyse/src/view/tools.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/view/components.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/autoShape.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/retrospect/retroCtrl.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/ctrl.ts`

Current repo-grounded diagnosis:
- the audit identifies suppression of conflicting analysis UI as a separate parity step after UI relocation
- Patzer still exposes normal analysis guidance and adjacent analysis surfaces too freely during retrospection
- one existing pending prompt already covers hiding engine guidance narrowly, but this task should handle the broader retrospection-specific suppression pass as a single source-backed step
- this task should still stay small and avoid broader solve-loop or opening logic changes

Implement only the smallest safe step:
- suppress the most clearly conflicting analysis UI during active retrospection
- at minimum, inspect whether the correct first-pass set includes:
  - engine PV lines
  - engine arrows / threat arrows
  - any adjacent analysis affordances that make solving noisy
- use the Lichess UX reference to decide the minimal correct suppression set
- do not disable the engine globally unless the inspected source clearly forces that choice
- do not bundle near-best acceptance
- do not bundle opening cancellation
- do not redesign the whole tools column

A likely safe direction is:
- treat active retrospection as a mode gate for selected UI surfaces
- keep suppression close to the owners of those surfaces rather than centralizing more logic in `src/main.ts`
- if some surfaces should remain visible in non-solving retrospection states, preserve that nuance if the current Patzer state model supports it safely

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
  - active retrospection hides the intended conflicting analysis UI
  - leaving retrospection restores normal analysis UI
  - the active retrospection flow itself remains usable
  - normal analysis outside retrospection is unchanged
  - there are no console/runtime errors
- report remaining risks and limitations, especially any suppression still deferred because the current Patzer retro state model is not rich enough yet

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
- `Prompt ID: CCP-021`
- `Task ID: CCP-021`
```

## CCP-022 - Persist Retrospection Best-Line Context

```
Prompt ID: CCP-022
Task ID: CCP-022
Source Document: docs/reference/patzer-retrospection-audit.md
Source Step: Recommended next implementation sequence, Step 5

Task: Persist richer retrospection solution context by adding a stored `bestLine`-style field for reviewed mistake positions, so answer reveal and later parity work are not limited to a single `bestMove` UCI.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- `src/engine/batch.ts`
- `src/idb/index.ts`
- `src/analyse/retro.ts`
- `src/main.ts`
- `src/engine/ctrl.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/reference/patzer-retrospection-audit.md`
- `docs/reference/lichess-retrospection/README.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `src/engine/batch.ts`
- `src/idb/index.ts`
- `src/analyse/retro.ts`
- `src/main.ts`

Because this task affects review-to-retrospection data shape, inspect relevant Lichess source before deciding implementation details. Start with:
- `~/Development/lichess-source/lila/ui/analyse/src/nodeFinder.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/retrospect/retroCtrl.ts`
- any closely related Lichess analysis-data files that clarify how the solution line is represented

Current repo-grounded diagnosis:
- Patzer currently stores `bestMove` for reviewed positions, but not a persisted `bestLine`
- the audit identifies this as the next data-shape step before opening cancellation and near-best acceptance parity
- this task should enrich stored review/retro context without redesigning the whole persistence model
- backward compatibility matters because older saved analysis records will lack the new field

Implement only the smallest safe step:
- add a persisted `bestLine`-style field for reviewed positions where the data already exists or can be captured safely
- hydrate that field through restore so retrospection code can consume it later
- keep the first version limited to what current Patzer review output can store reliably
- do not yet redesign the solve loop to depend on the new field
- do not bundle opening cancellation
- do not bundle near-best acceptance
- do not bundle broad IDB schema churn beyond what is required for this field

A likely safe direction is:
- persist the single-PV move sequence already available at review time
- keep the field optional and backward compatible
- thread it through storage and restore first, then expose it in the retro candidate shape if safe

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
- run the most relevant task-specific check you can for this data-shape change
- explicitly verify:
  - newly saved review data includes the new `bestLine`-style field where expected
  - restoring older saved analysis without that field still works safely
  - current retrospection / review flows do not regress if the field is absent
  - there are no console/runtime errors
- report remaining risks and limitations, especially whether the new field is still single-PV only and how that limits later parity work

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
- `Prompt ID: CCP-022`
- `Task ID: CCP-022`
```

## CCP-023 - Add Book-Aware Retrospection Cancellation

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

## CCP-024 - Add Near-Best Acceptance Parity

```
Prompt ID: CCP-024
Task ID: CCP-024
Source Document: docs/reference/patzer-retrospection-audit.md
Source Step: Recommended next implementation sequence, Step 7

Task: Add the first source-backed near-best acceptance step to retrospection so Patzer can move beyond exact-best-only solving and start matching Lichess's ceval-assisted acceptance behavior.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- `src/analyse/retroCtrl.ts`
- `src/board/index.ts`
- `src/engine/ctrl.ts`
- `src/analyse/retro.ts`
- `src/main.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/reference/patzer-retrospection-audit.md`
- `docs/reference/lichess-retrospection/README.md`
- `docs/reference/lichess-retrospection-ux/README.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `src/analyse/retroCtrl.ts`
- `src/board/index.ts`
- `src/engine/ctrl.ts`

Because this task affects the core retrospection solve semantics, inspect relevant Lichess source before deciding implementation details. Start with:
- `~/Development/lichess-source/lila/ui/analyse/src/retrospect/retroCtrl.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/ctrl.ts`
- any related Lichess ceval helper files the research docs identify for readiness and acceptance thresholds

Current repo-grounded diagnosis:
- Patzer currently uses an exact-best-only retrospection solve loop
- the audit identifies near-best acceptance parity as a deliberately late step
- by the time this task is attempted, the earlier controller, UI, and solution-context steps should already be in place
- this task should use the documented Lichess ceval-assisted behavior as the baseline, not invented local heuristics

Implement only the smallest safe step:
- add the first source-backed near-best acceptance path for retrospection
- use the documented Lichess logic and thresholds as closely as current Patzer data allows
- if current data still cannot support full parity, implement the smallest honest subset and call out the gap explicitly
- do not invent custom "feels right" thresholds
- do not bundle broader puzzle product behavior
- do not bundle opening/book work if it is still incomplete

A likely safe direction is:
- introduce the `eval` state where the controller needs ceval to judge a move
- use the documented readiness and acceptance behavior from the research docs as the reference
- preserve exact-best acceptance as the fast path where it already applies

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
  - exact best-move attempts still pass immediately
  - near-best attempts follow the new ceval-assisted path when appropriate
  - clearly bad moves still fail
  - retrospection does not get stuck in an unresolved `eval` state
  - there are no console/runtime errors
- report remaining risks and limitations, especially any still-unimplemented Lichess parity details

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
- `Prompt ID: CCP-024`
- `Task ID: CCP-024`
```

## CCP-025 - Add Move-List Context Menu Infrastructure

```
Prompt ID: CCP-025
Task ID: CCP-025
Source Document: docs/reference/lichess-analysis-variation-actions-audit.md
Source Step: Source-backed implementation sequence, Step 1

Task: Add the smallest safe move-list context-menu infrastructure to Patzer’s analysis board so move nodes can expose path-based actions in a Lichess-like way, without yet implementing the full action set.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- `src/analyse/moveList.ts`
- `src/main.ts`
- `src/tree/ops.ts`
- `src/styles/main.scss`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/ARCHITECTURE.md`
- `docs/NEXT_STEPS.md`
- `docs/reference/lichess-analysis-variation-actions-audit.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `src/analyse/moveList.ts`
- `src/main.ts`
- `src/styles/main.scss`

Because this task affects Lichess-aligned move-tree interaction, inspect relevant Lichess source before deciding implementation details. Start with:
- `~/Development/lichess-source/lila/ui/analyse/src/treeView/treeView.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/treeView/contextMenu.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/treeView/inlineView.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/treeView/columnView.ts`

Current repo-grounded diagnosis:
- Patzer’s move list already supports direct move clicking and inline one-at-a-time variation deletion
- it does not yet have a path-based move action surface like Lichess analysis
- the audit shows Lichess uses a dedicated move-tree context menu opened by right click / long press / related contextual interaction
- the safest first step is infrastructure only: open/close state, target path, basic rendering shell, and visual targeting
- this task should not yet add the whole action set

Implement only the smallest safe step:
- add move-list context-menu infrastructure for a selected move path
- support opening the menu from a move node in a Lichess-like contextual way for the current platform assumptions
- render a minimal menu shell positioned relative to the interaction
- visually mark the targeted move while the menu is open
- do not yet add the full action set beyond maybe one inert placeholder item if needed for rendering verification
- do not remove existing inline variation deletion yet unless inspection shows it blocks the infrastructure itself
- do not bundle PGN export, promotion, or delete-from-here behavior in this step

A likely safe direction is:
- keep the menu owner near the move-list rendering layer
- pass path/callback data explicitly instead of creating global hidden state
- mirror Lichess’s path-based targeting and “context-menu” highlighting concept

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
  - right-clicking or the chosen equivalent interaction on a move node opens the move-list context menu
  - the menu is associated with the correct move path
  - the targeted move gets a visible active/context state while the menu is open
  - clicking elsewhere closes the menu cleanly
  - normal left-click move navigation still works
  - there are no console/runtime errors
- report remaining risks and limitations, especially any desktop-vs-touch behavior intentionally deferred

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
- `Prompt ID: CCP-025`
- `Task ID: CCP-025`
```

## CCP-026 - Add Copy Mainline And Variation PGN Actions

```
Prompt ID: CCP-026
Task ID: CCP-026
Source Document: docs/reference/lichess-analysis-variation-actions-audit.md
Source Step: Source-backed implementation sequence, Step 2

Task: Add path-based `Copy main line PGN` / `Copy variation PGN` actions to the new move-list context menu using a dedicated line export helper, matching the Lichess variation-export model as closely as current Patzer structure allows.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- `src/analyse/moveList.ts`
- `src/main.ts`
- `src/tree/ops.ts`
- current PGN export helpers in the repo
- `AGENTS.md`
- `CLAUDE.md`
- `docs/reference/lichess-analysis-variation-actions-audit.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `src/analyse/moveList.ts`
- `src/main.ts`
- current PGN export owner in the repo

Because this task affects Lichess-aligned move-tree actions, inspect relevant Lichess source before deciding implementation details. Start with:
- `~/Development/lichess-source/lila/ui/analyse/src/treeView/contextMenu.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/pgnExport.ts`
- `~/Development/lichess-source/lila/ui/lib/src/tree/tree.ts`

Current repo-grounded diagnosis:
- the audit shows Lichess path-based PGN copying is a real move-list action
- Lichess distinguishes between mainline and variation export using the selected path and a dedicated variation-PGN helper
- Patzer does not yet have that move-list export behavior
- the next safe step after context-menu infrastructure is export, because it is non-destructive and path-shaped

Implement only the smallest safe step:
- add `Copy main line PGN` / `Copy variation PGN` actions to the move-list context menu
- export the selected line path, not an invented subtree format
- add or extract the smallest dedicated helper needed for line export if one does not already exist
- keep this scoped to copying text to clipboard from the selected path
- do not bundle delete/promote actions in this step
- do not redesign full PGN export UX elsewhere
- do not bundle touch-specific menu refinements beyond what the menu infrastructure already supports

A likely safe direction is:
- compute the selected node list/path in the move-list action layer
- reuse existing PGN knowledge where possible
- add a variation-line export helper modeled on the Lichess path export behavior

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
  - opening the context menu on a mainline move offers mainline PGN copy
  - opening the context menu on a variation move offers variation PGN copy
  - the copied text represents the selected line path rather than unrelated branches
  - normal move-list navigation still works
  - there are no console/runtime errors
- report remaining risks and limitations, especially any current export-format differences versus Lichess

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
- `Prompt ID: CCP-026`
- `Task ID: CCP-026`
```

## CCP-027 - Add Delete-From-Here Variation Action

```
Prompt ID: CCP-027
Task ID: CCP-027
Source Document: docs/reference/lichess-analysis-variation-actions-audit.md
Source Step: Source-backed implementation sequence, Step 3

Task: Add a path-based `Delete from here` move-list context action with active-path repair, shifting Patzer’s variation deletion model closer to the Lichess branch-deletion behavior.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- `src/analyse/moveList.ts`
- `src/main.ts`
- `src/tree/ops.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/reference/lichess-analysis-variation-actions-audit.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `src/analyse/moveList.ts`
- `src/main.ts`
- `src/tree/ops.ts`

Because this task affects branch mutation and move-list behavior, inspect relevant Lichess source before deciding implementation details. Start with:
- `~/Development/lichess-source/lila/ui/analyse/src/treeView/contextMenu.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/ctrl.ts`
- `~/Development/lichess-source/lila/ui/lib/src/tree/tree.ts`

Current repo-grounded diagnosis:
- Patzer currently has inline `×` removal for one-at-a-time side variations
- the audit shows Lichess instead exposes a path-based `Delete from here` action
- Lichess also repairs the active path if the deleted branch contained the current node
- the next safe step is to add the path-based deletion action first, not to redesign every deletion affordance at once

Implement only the smallest safe step:
- add a `Delete from here` action to the move-list context menu
- make it delete the selected node and everything beneath it
- repair the active path safely if the current selection is inside the deleted branch
- keep this scoped to branch deletion behavior
- do not yet remove the existing inline `×` affordance unless inspection shows the two models conflict badly
- do not bundle promotion or force-variation behavior
- do not bundle confirmation dialogs beyond the smallest safe version appropriate to current Patzer complexity

A likely safe direction is:
- reuse the current tree deletion primitives where possible
- add a path-shaped delete handler that mirrors Lichess’s active-path repair concept
- keep the mutation owner near existing move-tree orchestration, not buried in the view

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
  - `Delete from here` removes the selected branch from the move tree
  - if the active node is inside that branch, the current path repairs to a valid remaining ancestor path
  - deleting one branch does not damage unrelated branches or the mainline
  - normal move-list navigation still works
  - there are no console/runtime errors
- report remaining risks and limitations, especially how this coexists with the existing inline `×` affordance

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
- `Prompt ID: CCP-027`
- `Task ID: CCP-027`
```

## CCP-028 - Add Variation Promotion And Make-Mainline Actions

```
Prompt ID: CCP-028
Task ID: CCP-028
Source Document: docs/reference/lichess-analysis-variation-actions-audit.md
Source Step: Source-backed implementation sequence, Step 4

Task: Add move-list context actions for `Promote variation` and `Make main line`, using Patzer’s existing tree promotion primitives to align the move-list interaction model more closely with Lichess analysis.

Before editing, inspect the current codebase first and confirm the real implementation points instead of guessing. Start with:
- `src/analyse/moveList.ts`
- `src/main.ts`
- `src/tree/ops.ts`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/reference/lichess-analysis-variation-actions-audit.md`

Relevant Patzer Pro files already identified from current repo inspection:
- `src/analyse/moveList.ts`
- `src/main.ts`
- `src/tree/ops.ts`

Because this task affects variation ordering and mainline structure, inspect relevant Lichess source before deciding implementation details. Start with:
- `~/Development/lichess-source/lila/ui/analyse/src/treeView/contextMenu.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/ctrl.ts`
- `~/Development/lichess-source/lila/ui/lib/src/tree/tree.ts`

Current repo-grounded diagnosis:
- Patzer already has `promoteAt(root, path, toMainline)` in `src/tree/ops.ts`
- but the move list does not yet expose path-based promote/mainline actions
- the audit shows these are core Lichess context actions for variation management
- this is the next safe structural action after export and deletion

Implement only the smallest safe step:
- add `Promote variation` and `Make main line` actions to the move-list context menu where applicable
- use the existing promotion primitive rather than inventing new ordering logic
- update the active analysis path safely after promotion
- keep this scoped to move-tree ordering/mainline ownership
- do not bundle force-variation or collapse/expand-all behavior yet
- do not redesign move-list rendering broadly

A likely safe direction is:
- compute action availability from the selected path and whether it is currently on the mainline
- keep action semantics aligned with the existing tree promotion helper
- preserve current board/path state coherently after tree reordering

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
  - a variation node can be promoted upward
  - a variation node can be made the main line
  - the active path remains coherent after promotion
  - unrelated move-list behavior is unchanged
  - there are no console/runtime errors
- report remaining risks and limitations, especially any remaining differences between Patzer’s tree model and Lichess’s richer context-menu semantics

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
- `Prompt ID: CCP-028`
- `Task ID: CCP-028`
```
