# Claude Prompt History

Use this file to archive the full text of Claude Code prompts generated from Codex for Patzer Pro work.

## How to use it

- Add one entry per generated Claude prompt.
- Use the same stable identifier as `CLAUDE_PROMPT_LOG.md`, in the form `CCP-###`.
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
