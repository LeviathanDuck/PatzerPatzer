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

## CCP-015-F1 — Created

- Task: hide engine guidance during retrospection
- Task ID: `CCP-015`
- Parent prompt ID: `CCP-015`
- Source document: `docs/NEXT_STEPS.md`
- Source step: `Priority 3, Item 10`
- Status: created
- Review outcome: pending
- Commit: unknown
- Notes: follow-up fix prompt to conceal engine guidance while the user is solving mistakes

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
