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

## CCP-056

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
