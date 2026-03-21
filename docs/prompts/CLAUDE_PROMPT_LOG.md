# Claude Prompt Log

Use this file to track Claude Code prompts from creation through review.

## How to use it

- Add one entry per prompt as soon as the prompt is created.
- Give each prompt a stable identifier in the form `CCP-###`.
- If a prompt is a follow-up fix for a reviewed prompt, keep the same root task id and use a prompt id modifier:
  - `CCP-013-F1`
  - `CCP-013-F2`
- Prompts should also live in `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_QUEUE.md` until they have actually been run and then reviewed.
- On prompt creation, add an unchecked entry here immediately.
- On prompt creation, also add the prompt id and short task title to the top-level checklist index as `- [ ] CCP-### - Short Task Title`.
- On review, update the same entry here rather than creating a second one.
- On review, also flip the matching top-level checklist index item from `- [ ]` to `- [x]`.
- Check the box as soon as the implementation has been reviewed, regardless of whether the review passed cleanly.
- After review, add a short review outcome label such as `passed`, `passed with notes`, `issues found`, or `needs rework`.
- If review finds issues, keep the entry checked and record a brief issue summary under the same entry.
- If the prompt was reviewed but the exact prompt text was not found in `CLAUDE_PROMPT_QUEUE.md`, note that explicitly.

## Template

## Index Template

Keep a top-level checklist index near the top of this file:

```
- [ ] CCP-### - Short Task Title
```

The index is a compact scan list of prompt ids plus short task titles.
It should not include review notes.
It should stay in sync with the detailed entry below.

## CCP-### - Short Task Title

```
- [ ] Reviewed
  - ID: `CCP-###`
  - Task ID: `CCP-###`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/...`
  - Source step: `Priority X, Item Y` or equivalent section label
  - Task: short task title
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
```

## Review rules

- `- [x] Reviewed` means the task was reviewed.
- `- [ ] Reviewed` means the prompt has been created and logged, but has not been reviewed yet.
- `ID` is the unique prompt instance id.
- `Task ID` is the root task family id.
- For a normal prompt, `ID` and `Task ID` are the same.
- For a follow-up fix prompt, `ID` uses the next `-F#` suffix and `Task ID` stays on the root family id.
- `Parent prompt ID` should be `none` for a root prompt and the reviewed prompt id for a follow-up fix prompt.
- `Batch prompt IDs` should be `none` for normal prompts and should list the child prompt ids for a manager/batch-runner prompt.
- Use `Review outcome: passed` when the review found no issues.
- Use `Review outcome: passed with notes` when the change is acceptable but has minor caveats worth recording.
- Use `Review outcome: issues found` when the review found concrete problems.
- Use `Review outcome: needs rework` when the implementation is not ready to accept as-is.
- Use `Claude used: yes` once the prompt id has been reviewed against actual Claude Code work.
- Use `Claude used: no` only for reviewed entries where Claude usage could not be confirmed.
- If review finds issues, replace `Review issues: none` with a short issue list or summary on the same entry.
- Keep the entry compact. This log is for tracking prompt provenance and review state, not for full review writeups.

## Prompt Index

- [ ] CCP-065 - Add Toggle For Review Label Visibility
- [x] CCP-015-F3 - Restore Per-Candidate Show Engine Toggle In Mistakes Mode
- [x] CCP-021-F1 - Fix Retrospection Tools Render Corruption
- [x] CCP-015-F2 - Per-Candidate Engine Guidance Toggle In Retrospection
- [x] CCP-017 - Remove Clear Variations Button
- [x] CCP-013 - Retrospection Lifecycle Wiring
- [x] CCP-013-F1 - Finish Retrospection Lifecycle Wiring
- [x] CCP-014-F1 - Hide Find Puzzles Button During Mistakes Rollout
- [x] CCP-012 - Retrospection Controller Skeleton
- [x] CCP-016 - Use Persisted Review Labels In UI
- [x] CCP-015-F1 - Hide Engine Guidance During Retrospection
- [x] CCP-018 - Extract Retrospection UI Ownership
- [x] CCP-019 - Complete Retrospection Lifecycle Handling
- [x] CCP-020 - Move Retrospection UI Into Analysis Tools
- [x] CCP-021 - Suppress Conflicting Analysis UI During Retrospection
- [x] CCP-022 - Persist Retrospection Best-Line Context
- [x] CCP-023 - Add Book-Aware Retrospection Cancellation
- [x] CCP-024 - Add Near-Best Acceptance Parity
- [x] CCP-025 - Add Move-List Context Menu Infrastructure
- [x] CCP-026 - Add Copy Mainline And Variation PGN Actions
- [x] CCP-027 - Add Delete-From-Here Variation Action
- [x] CCP-028 - Add Variation Promotion And Make-Mainline Actions
- [x] CCP-015 - Minimal Retrospection Solve Loop
- [x] CCP-014 - Enter Retrospection For Current Game
- [x] CCP-011 - Retrospection Candidate Builder
- [x] CCP-010 - Fix Sparse Move-List Row Spacing
- [x] CCP-009 - Sticky Move-List Action Strip
- [x] CCP-008 - Move Clear Variations Into Bottom Action Strip
- [x] CCP-007 - Small Review-State Messaging Improvement
- [x] CCP-006 - Honest Minimum Analysis-Game Route Surface
- [x] CCP-005 - Clear Side Variations And Restore Mainline Order
- [x] CCP-004 - Variation Remove Button Visual Alignment
- [x] CCP-003 - First Move-List Variation Removal Affordance
- [x] CCP-030 - First Safe Typecheck Error Slice
- [x] CCP-031 - Fix Board Wheel Navigation Selector
- [x] CCP-032 - Replace Stop Boolean With Search Tokens
- [x] CCP-033 - Fix Imported-Game Orientation Propagation
- [x] CCP-006-F1 - Fix Analysis-Game Empty-Library Loading State
- [x] CCP-034 - Improve Eval Graph Hover And Scrub
- [x] CCP-035 - Fix Engine Arrowhead Rendering
- [x] CCP-036 - Implement Honest Minimum Puzzles Route
- [x] CCP-037 - Fetch Multi-Month Chess.com Archives
- [x] CCP-038 - Replace Header Game Review Stub
- [x] CCP-040 - Eval Graph Display Refresh
- [x] CCP-041 - Review Annotation Color Parity
- [x] CCP-042 - Move Review Button Beside Navigation Controls
- [x] CCP-043 - Replace Player-Strip Result Markers
- [x] CCP-044 - Add Eval Labels To Engine Arrows
- [x] CCP-045 - Prevent Duplicate Reimports
- [x] CCP-046 - Import Only New Games Since Last Import
- [x] CCP-047 - Header Platform Toggle UX
- [x] CCP-056 - Add Main-Menu Toggle For Board Wheel Navigation
- [x] CCP-057 - Fix Live Engine Stall During Move Navigation
- [x] CCP-048 - Highlight Massive Engine Improvements
- [x] CCP-049 - Show KO Mate Notation
- [x] CCP-050 - Winner-Color Eval Bar On Mate
- [x] CCP-051 - KO Overlay On Losing King For M1
- [x] CCP-052 - Hide Arrows During Game Review
- [x] CCP-053 - Toggle Review Dots To User Perspective Only
- [x] CCP-055 - Mate Display KO Polish
- [x] CCP-058 - Fix White KO Eval-Graph Direction
- [x] CCP-059 - Add Mobile Analysis Stack Layout
- [x] CCP-060 - Hide Mobile Analysis Chrome
- [x] CCP-061 - Make Mobile Controls Board-Adjacent
- [x] CCP-062 - Make Mobile Tools Stack Readable
- [x] CCP-063 - Make Underboard Secondary On Mobile
- [x] CCP-064 - Add One Minimal Mobile Touch Improvement
- [x] CCP-043-F1 - Winner And Loser Player-Strip Boxes
- [ ] CCP-044-F1 - Refine Engine Arrow Eval Labels

## Log

## CCP-065 - Add Toggle For Review Label Visibility

```
- [ ] Reviewed
  - ID: `CCP-065`
  - Task ID: `CCP-065`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/archive/MOVE_QUALITY_AUDIT_2026-03-20.md`
  - Source step: `Lichess-style move review label visibility parity`
  - Task: verify exact Lichess move-review label rendering and add a persisted engine-setting toggle that shows or hides visible review labels in Patzer
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-044-F1 - Refine Engine Arrow Eval Labels

```
- [ ] Reviewed
  - ID: `CCP-044-F1`
  - Task ID: `CCP-044`
  - Parent prompt ID: `CCP-044`
  - Batch prompt IDs: none
  - Source document: `docs/WISHLIST.md`
  - Source step: `Add tag or label next to engine move arrows showing what their eval is`
  - Task: refine engine-arrow eval labels so they are off by default, configurable in engine settings, and integrated into arrowheads for primary, secondary, and played arrows
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-043-F1 - Winner And Loser Player-Strip Boxes

```
- [x] Reviewed
  - ID: `CCP-043-F1`
  - Task ID: `CCP-043`
  - Parent prompt ID: `CCP-043`
  - Batch prompt IDs: none
  - Source document: `docs/WISHLIST.md`
  - Source step: `Remove the 1 / 0 / ½ single-game result markers from the player strip by default`
  - Task: replace the current player-strip winner star with styled green/red winner-loser boxes containing username, rating, and board color
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-015-F3 - Restore Per-Candidate Show Engine Toggle In Mistakes Mode

```
- [x] Reviewed
  - ID: `CCP-015-F3`
  - Task ID: `CCP-015`
  - Parent prompt ID: `CCP-015-F2`
  - Source document: `docs/reference/patzer-retrospection-audit.md`
  - Source step: `Learn From Mistakes guidance behavior follow-up fix`
  - Task: restore the per-candidate `Show engine` behavior in Learn From Mistakes and document it explicitly if it is a Patzer deviation from Lichess
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-021-F1 - Fix Retrospection Tools Render Corruption

```
- [x] Reviewed
  - ID: `CCP-021-F1`
  - Task ID: `CCP-021`
  - Parent prompt ID: `CCP-021`
  - Source document: `docs/reference/patzer-retrospection-audit.md`
  - Source step: `Recommended next implementation sequence, Step 4 follow-up fix`
  - Task: fix the retrospection render corruption bug causing duplicated panels, poisoned tools UI, and Snabbdom boolean-child patch failures
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-015-F2 - Per-Candidate Engine Guidance Toggle In Retrospection

```
- [x] Reviewed
  - ID: `CCP-015-F2`
  - Task ID: `CCP-015`
  - Parent prompt ID: `CCP-015-F1`
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 3, Item 10`
  - Task: keep engine guidance off by default in retrospection, allow per-candidate reveal, and reset to hidden on the next mistake
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-017 - Remove Clear Variations Button

```
- [x] Reviewed
  - ID: `CCP-017`
  - Task ID: `CCP-017`
  - Parent prompt ID: none
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 4, Item 12`
  - Task: remove the move-list `Clear variations` button while keeping per-variation `×` deletion
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-013 - Retrospection Lifecycle Wiring

```
- [x] Reviewed
  - ID: `CCP-013`
  - Task ID: `CCP-013`
  - Parent prompt ID: none
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 3, Item 10`
  - Task: wire retrospection into analysis lifecycle events
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: lifecycle hooks are currently dead because no `RetroCtrl` instance is attached to `ctrl`, and ceval updates still do not call `retro.onCeval()`
```

## CCP-013-F1 - Finish Retrospection Lifecycle Wiring

```
- [x] Reviewed
  - ID: `CCP-013-F1`
  - Task family: `CCP-013`
  - Parent prompt: `CCP-013`
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 3, Item 10`
  - Task: finish the missing live lifecycle and ceval wiring from `CCP-013`
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: closes the dead-hook and ceval-caller gaps, but bundles unrelated review-controls/export UI movement outside the scoped lifecycle fix
```

## CCP-014-F1 - Hide Find Puzzles Button During Mistakes Rollout

```
- [x] Reviewed
  - ID: `CCP-014-F1`
  - Task ID: `CCP-014`
  - Parent prompt ID: `CCP-014`
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 3, Item 10`
  - Task: hide the visible `Find Puzzles` button while keeping the current mistakes rollout intact
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: hides `Find Puzzles`, but the underlying `CCP-014` empty-candidate bug remains because the `Mistakes` button still opens an empty active session instead of failing honestly
```

## CCP-012 - Retrospection Controller Skeleton

```
- [x] Reviewed
  - ID: `CCP-012`
  - Task ID: `CCP-012`
  - Parent prompt ID: none
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 3, Item 10`
  - Task: add a dedicated retrospection controller/state owner
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-016 - Use Persisted Review Labels In UI

```
- [x] Reviewed
  - ID: `CCP-016`
  - Task ID: `CCP-016`
  - Parent prompt ID: none
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 3, Item 11`
  - Task: use persisted review labels in move-list and summary UI
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: the persisted-label hydration and UI fallback changes look correct, but the local task is bundled with unrelated retrospection lifecycle, entry, and controls work in `src/main.ts` and `src/engine/ctrl.ts`, so the prompt execution is not cleanly scoped
```

## CCP-015-F1 - Hide Engine Guidance During Retrospection

```
- [x] Reviewed
  - ID: `CCP-015-F1`
  - Task ID: `CCP-015`
  - Parent prompt ID: `CCP-015`
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 3, Item 10`
  - Task: hide engine lines and arrows while Learn From Mistakes / retrospection mode is active
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: engine PV lines and arrows are hidden only while `ctrl.retro?.isSolving()` is true, not for the full time retrospection mode is active, so guidance returns in other retro states like `win` / `view`
```

## CCP-018 - Extract Retrospection UI Ownership

```
- [x] Reviewed
  - ID: `CCP-018`
  - Task ID: `CCP-018`
  - Parent prompt ID: none
  - Source document: `docs/reference/patzer-retrospection-audit.md`
  - Source step: `Recommended next implementation sequence, Step 1`
  - Task: extract retrospection entry and active-session rendering out of `src/main.ts` into `src/analyse/`
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-019 - Complete Retrospection Lifecycle Handling

```
- [x] Reviewed
  - ID: `CCP-019`
  - Task ID: `CCP-019`
  - Parent prompt ID: none
  - Source document: `docs/reference/patzer-retrospection-audit.md`
  - Source step: `Recommended next implementation sequence, Step 2`
  - Task: replace the inert retrospection `onCeval()` seam with meaningful lifecycle behavior while preserving exact-best MVP solving
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: the `CCP-019` lifecycle changes are bundled into the same commit as unrelated `CCP-015-F2` guidance-reveal behavior, so the prompt execution is not cleanly isolated
```

## CCP-020 - Move Retrospection UI Into Analysis Tools

```
- [x] Reviewed
  - ID: `CCP-020`
  - Task ID: `CCP-020`
  - Parent prompt ID: none
  - Source document: `docs/reference/patzer-retrospection-audit.md`
  - Source step: `Recommended next implementation sequence, Step 3`
  - Task: move the active retrospection UI into the analysis tools area
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: the active retrospection panel was moved into the tools area, but this prompt execution also bundled the broader `CCP-021` suppression pass by hiding summary/puzzle surfaces during retrospection instead of staying placement-only
```

## CCP-021 - Suppress Conflicting Analysis UI During Retrospection

```
- [x] Reviewed
  - ID: `CCP-021`
  - Task ID: `CCP-021`
  - Parent prompt ID: none
  - Source document: `docs/reference/patzer-retrospection-audit.md`
  - Source step: `Recommended next implementation sequence, Step 4`
  - Task: suppress conflicting analysis UI while active retrospection is running
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: the suppression behavior is present, but the same local prompt execution is bundled with unrelated later work including `bestLine` persistence, near-best retrospection changes, and move-list context-menu actions, so it is not cleanly isolated
```

## CCP-022 - Persist Retrospection Best-Line Context

```
- [x] Reviewed
  - ID: `CCP-022`
  - Task ID: `CCP-022`
  - Parent prompt ID: none
  - Source document: `docs/reference/patzer-retrospection-audit.md`
  - Source step: `Recommended next implementation sequence, Step 5`
  - Task: persist richer retrospection solution context such as `bestLine`
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-023 - Add Book-Aware Retrospection Cancellation

```
- [x] Reviewed
  - ID: `CCP-023`
  - Task ID: `CCP-023`
  - Parent prompt ID: none
  - Source document: `docs/reference/patzer-retrospection-audit.md`
  - Source step: `Recommended next implementation sequence, Step 6`
  - Task: add the first safe opening/book-aware cancellation step for retrospection candidates
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: defines the opening-cancellation seam in `buildRetroCandidates()`, but `toggleRetro()` still calls it without any opening provider, so book-aware suppression is not actually live
```

## CCP-024 - Add Near-Best Acceptance Parity

```
- [x] Reviewed
  - ID: `CCP-024`
  - Task ID: `CCP-024`
  - Parent prompt ID: none
  - Source document: `docs/reference/patzer-retrospection-audit.md`
  - Source step: `Recommended next implementation sequence, Step 7`
  - Task: add the first source-backed near-best acceptance step to retrospection
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: the new `eval` / near-best path is still bypassed when the attempted move already exists in the tree, because `board/index.ts` returns early through the existing-child navigation path before any retro judgment runs
```

## CCP-025 - Add Move-List Context Menu Infrastructure

```
- [x] Reviewed
  - ID: `CCP-025`
  - Task ID: `CCP-025`
  - Parent prompt ID: none
  - Source document: `docs/reference/lichess-analysis-variation-actions-audit.md`
  - Source step: `Source-backed implementation sequence, Step 1`
  - Task: add move-list context-menu infrastructure for path-based variation actions
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: the infrastructure step is bundled with real copy/delete/promote actions in `renderContextMenu()`, so it is not cleanly scoped to menu shell + targeting only
```

## CCP-026 - Add Copy Mainline And Variation PGN Actions

```
- [x] Reviewed
  - ID: `CCP-026`
  - Task ID: `CCP-026`
  - Parent prompt ID: none
  - Source document: `docs/reference/lichess-analysis-variation-actions-audit.md`
  - Source step: `Source-backed implementation sequence, Step 2`
  - Task: add context-menu actions to copy mainline and variation PGN from the selected path
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: `copyLinePgn()` uses `nodeListAt(path)` instead of the Lichess-style extended line path, so it can copy only the moves up to the selected node instead of the full selected mainline/variation
```

## CCP-027 - Add Delete-From-Here Variation Action

```
- [x] Reviewed
  - ID: `CCP-027`
  - Task ID: `CCP-027`
  - Parent prompt ID: none
  - Source document: `docs/reference/lichess-analysis-variation-actions-audit.md`
  - Source step: `Source-backed implementation sequence, Step 3`
  - Task: add a move-list context `Delete from here` branch action with active-path repair
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: the context-menu action reuses `deleteVariation()`, so deleted branches still are not persisted across reload and can reappear because the mutated move tree is not saved as tree state
```

## CCP-028 - Add Variation Promotion And Make-Mainline Actions

```
- [x] Reviewed
  - ID: `CCP-028`
  - Task ID: `CCP-028`
  - Parent prompt ID: none
  - Source document: `docs/reference/lichess-analysis-variation-actions-audit.md`
  - Source step: `Source-backed implementation sequence, Step 4`
  - Task: add context-menu actions for variation promotion and make-mainline behavior
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: after `promoteAt(...)`, the handler only calls `redraw()` and does not refresh `ctrl.setPath(ctrl.path)`, so `ctrl.mainline` / `nodeList` can stay stale after tree reordering
```


## CCP-015 - Minimal Retrospection Solve Loop

```
- [x] Reviewed
  - ID: `CCP-015`
  - Task ID: `CCP-015`
  - Parent prompt ID: none
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 3, Item 10`
  - Task: add exact-best-move-only retrospection solve loop for the current game
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: board moves that already exist as child nodes bypass retrospection win/fail handling entirely, and failed attempts leave new variation clutter in the tree instead of cleaning up the bad retry branch
```

## CCP-014 - Enter Retrospection For Current Game

```
- [x] Reviewed
  - ID: `CCP-014`
  - Task ID: `CCP-014`
  - Parent prompt ID: none
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 3, Item 10`
  - Task: add a minimal current-game retrospection entry affordance
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: the `Mistakes` button still enables and opens an empty retro session when there are zero eligible candidates, instead of failing honestly with a disabled/empty state
```

## CCP-011 - Retrospection Candidate Builder

```
- [x] Reviewed
  - ID: `CCP-011`
  - Task ID: `CCP-011`
  - Parent prompt ID: none
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 3, Item 10`
  - Task: introduce a dedicated retrospection candidate shape and builder
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-010 - Fix Sparse Move-List Row Spacing

```
- [x] Reviewed
  - ID: `CCP-010`
  - Task ID: `CCP-010`
  - Parent prompt ID: none
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 4, Item 12`
  - Task: fix excessive vertical spacing in short move lists while preserving the sticky footer
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-009 - Sticky Move-List Action Strip

```
- [x] Reviewed
  - ID: `CCP-009`
  - Task ID: `CCP-009`
  - Parent prompt ID: none
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 4, Item 12`
  - Task: keep the bottom move-list action strip visible while the move list scrolls
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-008 - Move Clear Variations Into Bottom Action Strip

```
- [x] Reviewed
  - ID: `CCP-008`
  - Task ID: `CCP-008`
  - Parent prompt ID: none
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 4, Item 12`
  - Task: move `Clear variations` into a move-list bottom action strip
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-007 - Small Review-State Messaging Improvement

```
- [x] Reviewed
  - ID: `CCP-007`
  - Task ID: `CCP-007`
  - Parent prompt ID: none
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 4, Item 14`
  - Task: small review-state messaging improvement
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-006 - Honest Minimum Analysis-Game Route Surface

```
- [x] Reviewed
  - ID: `CCP-006`
  - Task ID: `CCP-006`
  - Parent prompt ID: none
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 4, Item 13`
  - Task: honest minimum `analysis-game` route surface
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: `analysis-game` can get stuck on a permanent "Loading…" state when the imported library is actually empty or the requested game id is missing before any games are loaded, because `routeContent()` uses `importedGames.length === 0` as an IDB-loading proxy with no separate loaded/empty distinction
```

## CCP-005 - Clear Side Variations And Restore Mainline Order

```
- [x] Reviewed
  - ID: `CCP-005`
  - Task ID: `CCP-005`
  - Parent prompt ID: none
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 4, Item 12`
  - Task: clear user-created side variations and restore move list to mainline order
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-004 - Variation Remove Button Visual Alignment

```
- [x] Reviewed
  - ID: `CCP-004`
  - Task ID: `CCP-004`
  - Parent prompt ID: none
  - Source document: inferred from commit/review history
  - Source step: unknown
  - Task: style variation remove button to match move-list visual language
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none; prompt id was reconstructed after the fact from commit order and review context, so exact original prompt provenance is not confirmed
```

## CCP-003 - First Move-List Variation Removal Affordance

```
- [x] Reviewed
  - ID: `CCP-003`
  - Task ID: `CCP-003`
  - Parent prompt ID: none
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 4, Item 12`
  - Task: first move-list variation removal affordance
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: variation deletion is not actually persisted across reload; `saveGamesToIdb()` stores imported game PGN/path, not the mutated move tree, so deleted branches can reappear after reload
```

## CCP-030 - First Safe Typecheck Error Slice

```
- [x] Reviewed
  - ID: `CCP-030`
  - Task ID: `CCP-030`
  - Parent prompt ID: none
  - Source document: `docs/KNOWN_ISSUES.md`
  - Source step: `[HIGH] npm run typecheck is wired but surfaces 53 type errors`
  - Task: clear the first cohesive typecheck error cluster in `src/analyse/evalView.ts` and `src/analyse/moveList.ts`
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-031 - Fix Board Wheel Navigation Selector

```
- [x] Reviewed
  - ID: `CCP-031`
  - Task ID: `CCP-031`
  - Parent prompt ID: none
  - Source document: `docs/KNOWN_ISSUES.md`
  - Source step: `[HIGH] Wheel scroll navigation is still non-functional`
  - Task: fix the board wheel-navigation hit target so wheel scrolling over the analysis board actually steps moves
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-032 - Replace Stop Boolean With Search Tokens

```
- [x] Reviewed
  - ID: `CCP-032`
  - Task ID: `CCP-032`
  - Parent prompt ID: none
  - Source document: `docs/KNOWN_ISSUES.md`
  - Source step: `[HIGH] In-flight engine stop handling still relies on a boolean flag`
  - Task: replace the remaining coarse stop boolean seam with per-search token bookkeeping
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-033 - Fix Imported-Game Orientation Propagation

```
- [x] Reviewed
  - ID: `CCP-033`
  - Task ID: `CCP-033`
  - Parent prompt ID: none
  - Source document: `docs/KNOWN_ISSUES.md`
  - Source step: `[HIGH] Imported-game board orientation does not always match the importing user's side`
  - Task: fix live board orientation so imported games reliably orient to the importing user's side
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-006-F1 - Fix Analysis-Game Empty-Library Loading State

```
- [x] Reviewed
  - ID: `CCP-006-F1`
  - Task ID: `CCP-006`
  - Parent prompt ID: `CCP-006`
  - Source document: `docs/KNOWN_ISSUES.md`
  - Source step: `[MEDIUM] analysis-game route can still get stuck in a fake loading state`
  - Task: separate loading-vs-empty library semantics so `analysis-game` stops showing permanent fake loading text
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-034 - Improve Eval Graph Hover And Scrub

```
- [x] Reviewed
  - ID: `CCP-034`
  - Task ID: `CCP-034`
  - Parent prompt ID: none
  - Source document: `docs/KNOWN_ISSUES.md`
  - Source step: `[MEDIUM] Eval graph hover/scrub behavior is not yet working as expected`
  - Task: add the first safe eval-graph hover/scrub improvement
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: hover indicator still updates only on per-strip `mouseenter`, not nearest-on-`mousemove`
```

## CCP-035 - Fix Engine Arrowhead Rendering

```
- [x] Reviewed
  - ID: `CCP-035`
  - Task ID: `CCP-035`
  - Parent prompt ID: none
  - Source document: `docs/KNOWN_ISSUES.md`
  - Source step: `[MEDIUM] Engine arrows can render without a visible arrowhead`
  - Task: fix engine-arrow rendering so live arrows keep a visible arrowhead
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-036 - Implement Honest Minimum Puzzles Route

```
- [x] Reviewed
  - ID: `CCP-036`
  - Task ID: `CCP-036`
  - Parent prompt ID: none
  - Source document: `docs/KNOWN_ISSUES.md`
  - Source step: `[MEDIUM] Puzzle route is still a placeholder`
  - Task: replace the placeholder puzzles route with the smallest honest saved-puzzle workflow
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-037 - Fetch Multi-Month Chess.com Archives

```
- [x] Reviewed
  - ID: `CCP-037`
  - Task ID: `CCP-037`
  - Parent prompt ID: none
  - Source document: `docs/KNOWN_ISSUES.md`
  - Source step: `[LOW] Chess.com import still fetches only the latest archive month`
  - Task: fetch the necessary Chess.com archive months for the selected date range instead of only the newest month
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-038 - Replace Header Game Review Stub

```
- [x] Reviewed
  - ID: `CCP-038`
  - Task ID: `CCP-038`
  - Parent prompt ID: none
  - Source document: `docs/KNOWN_ISSUES.md`
  - Source step: `[LOW] Header global menu still contains a stub Game Review action`
  - Task: replace the header `Game Review` TODO stub with honest real behavior or an honest disabled state
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-040 - Eval Graph Display Refresh

```
- [x] Reviewed
  - ID: `CCP-040`
  - Task ID: `CCP-040`
  - Parent prompt ID: none
  - Source document: `docs/WISHLIST.md`
  - Source step: `Changes to how the eval graph is displayed and formatted`
  - Task: take the first small safe wishlist step on eval-graph display and formatting
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-041 - Review Annotation Color Parity

```
- [x] Reviewed
  - ID: `CCP-041`
  - Task ID: `CCP-041`
  - Parent prompt ID: none
  - Source document: `docs/WISHLIST.md`
  - Source step: `Bring review annotation label/colors into Lichess parity`
  - Task: align Patzer review annotation colors and related styling with confirmed Lichess mapping
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-042 - Move Review Button Beside Navigation Controls

```
- [x] Reviewed
  - ID: `CCP-042`
  - Task ID: `CCP-042`
  - Parent prompt ID: none
  - Source document: `docs/WISHLIST.md`
  - Source step: `Move the analysis-page Review / Re-analyze button beside the move-navigation buttons`
  - Task: move the analysis-page Review/Re-analyze control beside Prev/Flip/Next in the smallest safe way
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-043 - Replace Player-Strip Result Markers

```
- [x] Reviewed
  - ID: `CCP-043`
  - Task ID: `CCP-043`
  - Parent prompt ID: none
  - Source document: `docs/WISHLIST.md`
  - Source step: `Remove the 1 / 0 / ½ single-game result markers from the player strip by default`
  - Task: remove the current player-strip result markers and replace them with a clearer minimal winner/loser signal
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-044 - Add Eval Labels To Engine Arrows

```
- [x] Reviewed
  - ID: `CCP-044`
  - Task ID: `CCP-044`
  - Parent prompt ID: none
  - Source document: `docs/WISHLIST.md`
  - Source step: `Add tag or label next to engine move arrows showing what their eval is`
  - Task: add the first safe eval label beside the primary engine arrow
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-045 - Prevent Duplicate Reimports

```
- [x] Reviewed
  - ID: `CCP-045`
  - Task ID: `CCP-045`
  - Parent prompt ID: none
  - Source document: `docs/WISHLIST.md`
  - Source step: `we shouldn't re import the same games that have already been imported`
  - Task: prevent obviously duplicate game reimports in the smallest safe way
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-046 - Import Only New Games Since Last Import

```
- [x] Reviewed
  - ID: `CCP-046`
  - Task ID: `CCP-046`
  - Parent prompt ID: none
  - Source document: `docs/WISHLIST.md`
  - Source step: `Import only new games since last import`
  - Task: take the first safe step toward incremental imports and temporary new-import badging
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-047 - Header Platform Toggle UX

```
- [x] Reviewed
  - ID: `CCP-047`
  - Task ID: `CCP-047`
  - Parent prompt ID: none
  - Source document: `docs/WISHLIST.md`
  - Source step: `In the header, it should default to a chess.com username input field`
  - Task: tighten the header platform-toggle UX while keeping Chess.com as the default
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-048 - Highlight Massive Engine Improvements

```
- [x] Reviewed
  - ID: `CCP-048`
  - Task ID: `CCP-048`
  - Parent prompt ID: none
  - Source document: `docs/WISHLIST.md`
  - Source step: `IF there is an engine line available that has a massive improvement`
  - Task: add a stronger visual highlight for clearly massive engine improvements in the PV list
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-049 - Show KO Mate Notation

```
- [x] Reviewed
  - ID: `CCP-049`
  - Task ID: `CCP-049`
  - Parent prompt ID: none
  - Source document: `docs/WISHLIST.md`
  - Source step: `When mate is played on the board, the analysis engine should show a #KO symbol`
  - Task: replace the current terminal mate notation with #KO in the intended analysis UI
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-050 - Winner-Color Eval Bar On Mate

```
- [x] Reviewed
  - ID: `CCP-050`
  - Task ID: `CCP-050`
  - Parent prompt ID: none
  - Source document: `docs/WISHLIST.md`
  - Source step: `When mate is played on the board, the eval bar should fill up entirely with whatever colour delivered the mate`
  - Task: fix mate-state eval-bar fill so it resolves fully to the winning side
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-051 - KO Overlay On Losing King For M1

```
- [x] Reviewed
  - ID: `CCP-051`
  - Task ID: `CCP-051`
  - Parent prompt ID: none
  - Source document: `docs/WISHLIST.md`
  - Source step: `When M1 is played on the board, the losing king should get a KO symbol over it`
  - Task: add the first safe KO overlay for the losing king on immediate mate positions
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-052 - Hide Arrows During Game Review

```
- [x] Reviewed
  - ID: `CCP-052`
  - Task ID: `CCP-052`
  - Parent prompt ID: none
  - Source document: `docs/WISHLIST.md`
  - Source step: `when game review button is pressed, all arrows should be removed from board until game review is completed`
  - Task: hide board arrows during active batch review and restore them when review finishes
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-053 - Toggle Review Dots To User Perspective Only

```
- [x] Reviewed
  - ID: `CCP-053`
  - Task ID: `CCP-053`
  - Parent prompt ID: none
  - Source document: `docs/WISHLIST.md`
  - Source step: `Setting to toggle only the users whose perspective we are looking at to have their move review annotated dot colour shown`
  - Task: add a setting that filters review-dot visibility to the current user perspective while defaulting to both
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-055 - Mate Display KO Polish

```
- [x] Reviewed
  - ID: `CCP-055`
  - Task ID: `CCP-055`
  - Parent prompt ID: none
  - Source document: inferred from user request in chat
  - Source step: `mate-display UI polish so checkmate is shown as #KO! in the move list and engine display`
  - Task: implement mate-display UI polish so checkmate is shown as `#KO!` in the move list and engine display, and make the engine-display `#KO!` purple
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-056 - Add Main-Menu Toggle For Board Wheel Navigation

```
- [x] Reviewed
  - ID: `CCP-056`
  - Task ID: `CCP-056`
  - Parent prompt ID: none
  - Source document: inferred from user request in chat
  - Source step: `make board-wheel move navigation a main-menu setting that defaults to off`
  - Task: add a persisted main-menu toggle for board-wheel move navigation and default it to off
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-057 - Fix Live Engine Stall During Move Navigation

```
- [x] Reviewed
  - ID: `CCP-057`
  - Task ID: `CCP-057`
  - Parent prompt ID: none
  - Source document: `docs/KNOWN_ISSUES.md`
  - Source step: `[HIGH] Live per-move engine analysis can stall during move navigation`
  - Task: diagnose and fix the live-engine navigation stall so PV lines and arrows keep matching the current position during move-by-move review
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-058 - Fix White KO Eval-Graph Direction

```
- [x] Reviewed
  - ID: `CCP-058`
  - Task ID: `CCP-058`
  - Parent prompt ID: none
  - Source document: inferred from user request in chat
  - Source step: `eval graph bug where White KO drops to the bottom instead of staying at the top`
  - Task: fix the eval-graph mate bug where a terminal KO/checkmate for White plots at the bottom instead of staying at the top
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-059 - Add Mobile Analysis Stack Layout

```
- [x] Reviewed
  - ID: `CCP-059`
  - Task ID: `CCP-059`
  - Parent prompt ID: none
  - Source document: `docs/mini-sprints/MOBILE_ANALYSIS_USABILITY_SPRINT_2026-03-21.md`
  - Source step: `Task 1 — Add a real mobile analysis layout mode`
  - Task: add the first safe portrait-mobile single-column analysis layout
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-060 - Hide Mobile Analysis Chrome

```
- [ ] Reviewed
  - ID: `CCP-060`
  - Task ID: `CCP-060`
  - Parent prompt ID: none
  - Source document: `docs/mini-sprints/MOBILE_ANALYSIS_USABILITY_SPRINT_2026-03-21.md`
  - Source step: `Task 2 — Hide low-value chrome on mobile`
  - Task: hide eval gauge, player strips, resize handle, and wasteful chrome on the mobile analysis layout
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-061 - Make Mobile Controls Board-Adjacent

```
- [ ] Reviewed
  - ID: `CCP-061`
  - Task ID: `CCP-061`
  - Parent prompt ID: none
  - Source document: `docs/mini-sprints/MOBILE_ANALYSIS_USABILITY_SPRINT_2026-03-21.md`
  - Source step: `Task 3 — Move board navigation and Review into a mobile-friendly control block`
  - Task: make the current analysis controls mobile-friendly and board-adjacent
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-062 - Make Mobile Tools Stack Readable

```
- [ ] Reviewed
  - ID: `CCP-062`
  - Task ID: `CCP-062`
  - Parent prompt ID: none
  - Source document: `docs/mini-sprints/MOBILE_ANALYSIS_USABILITY_SPRINT_2026-03-21.md`
  - Source step: `Task 4 — Make the tools column readable as a mobile stack`
  - Task: relax the desktop tools-column assumptions so mobile ceval, PVs, move list, retro strip, and summary stack readably
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-063 - Make Underboard Secondary On Mobile

```
- [ ] Reviewed
  - ID: `CCP-063`
  - Task ID: `CCP-063`
  - Parent prompt ID: none
  - Source document: `docs/mini-sprints/MOBILE_ANALYSIS_USABILITY_SPRINT_2026-03-21.md`
  - Source step: `Task 5 — Make underboard truly secondary on mobile`
  - Task: tidy mobile underboard spacing and overflow so graph and game list stay reachable below tools
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-064 - Add One Minimal Mobile Touch Improvement

```
- [ ] Reviewed
  - ID: `CCP-064`
  - Task ID: `CCP-064`
  - Parent prompt ID: none
  - Source document: `docs/mini-sprints/MOBILE_ANALYSIS_USABILITY_SPRINT_2026-03-21.md`
  - Source step: `Task 6 — Add one minimal touch usability improvement`
  - Task: add one minimal touch usability improvement using the sprint’s low-risk larger-targets option
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
  - Execution target: `Codex`
```
