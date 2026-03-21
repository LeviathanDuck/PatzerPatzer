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
- On review, update the same entry here rather than creating a second one.
- Check the box as soon as the implementation has been reviewed, regardless of whether the review passed cleanly.
- After review, add a short review outcome label such as `passed`, `passed with notes`, `issues found`, or `needs rework`.
- If review finds issues, keep the entry checked and record a brief issue summary under the same entry.
- If the prompt was reviewed but the exact prompt text was not found in `CLAUDE_PROMPT_QUEUE.md`, note that explicitly.

## Template

## CCP-### - Short Task Title

```
- [ ] Reviewed
  - ID: `CCP-###`
  - Task ID: `CCP-###`
  - Parent prompt ID: none
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
- Use `Review outcome: passed` when the review found no issues.
- Use `Review outcome: passed with notes` when the change is acceptable but has minor caveats worth recording.
- Use `Review outcome: issues found` when the review found concrete problems.
- Use `Review outcome: needs rework` when the implementation is not ready to accept as-is.
- Use `Claude used: yes` once the prompt id has been reviewed against actual Claude Code work.
- Use `Claude used: no` only for reviewed entries where Claude usage could not be confirmed.
- If review finds issues, replace `Review issues: none` with a short issue list or summary on the same entry.
- Keep the entry compact. This log is for tracking prompt provenance and review state, not for full review writeups.

## Log

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
- [ ] Reviewed
  - ID: `CCP-019`
  - Task ID: `CCP-019`
  - Parent prompt ID: none
  - Source document: `docs/reference/patzer-retrospection-audit.md`
  - Source step: `Recommended next implementation sequence, Step 2`
  - Task: replace the inert retrospection `onCeval()` seam with meaningful lifecycle behavior while preserving exact-best MVP solving
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
```

## CCP-020 - Move Retrospection UI Into Analysis Tools

```
- [ ] Reviewed
  - ID: `CCP-020`
  - Task ID: `CCP-020`
  - Parent prompt ID: none
  - Source document: `docs/reference/patzer-retrospection-audit.md`
  - Source step: `Recommended next implementation sequence, Step 3`
  - Task: move the active retrospection UI into the analysis tools area
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
```

## CCP-021 - Suppress Conflicting Analysis UI During Retrospection

```
- [ ] Reviewed
  - ID: `CCP-021`
  - Task ID: `CCP-021`
  - Parent prompt ID: none
  - Source document: `docs/reference/patzer-retrospection-audit.md`
  - Source step: `Recommended next implementation sequence, Step 4`
  - Task: suppress conflicting analysis UI while active retrospection is running
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
```

## CCP-022 - Persist Retrospection Best-Line Context

```
- [ ] Reviewed
  - ID: `CCP-022`
  - Task ID: `CCP-022`
  - Parent prompt ID: none
  - Source document: `docs/reference/patzer-retrospection-audit.md`
  - Source step: `Recommended next implementation sequence, Step 5`
  - Task: persist richer retrospection solution context such as `bestLine`
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
```

## CCP-023 - Add Book-Aware Retrospection Cancellation

```
- [ ] Reviewed
  - ID: `CCP-023`
  - Task ID: `CCP-023`
  - Parent prompt ID: none
  - Source document: `docs/reference/patzer-retrospection-audit.md`
  - Source step: `Recommended next implementation sequence, Step 6`
  - Task: add the first safe opening/book-aware cancellation step for retrospection candidates
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
```

## CCP-024 - Add Near-Best Acceptance Parity

```
- [ ] Reviewed
  - ID: `CCP-024`
  - Task ID: `CCP-024`
  - Parent prompt ID: none
  - Source document: `docs/reference/patzer-retrospection-audit.md`
  - Source step: `Recommended next implementation sequence, Step 7`
  - Task: add the first source-backed near-best acceptance step to retrospection
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
```

## CCP-025 - Add Move-List Context Menu Infrastructure

```
- [ ] Reviewed
  - ID: `CCP-025`
  - Task ID: `CCP-025`
  - Parent prompt ID: none
  - Source document: `docs/reference/lichess-analysis-variation-actions-audit.md`
  - Source step: `Source-backed implementation sequence, Step 1`
  - Task: add move-list context-menu infrastructure for path-based variation actions
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
```

## CCP-026 - Add Copy Mainline And Variation PGN Actions

```
- [ ] Reviewed
  - ID: `CCP-026`
  - Task ID: `CCP-026`
  - Parent prompt ID: none
  - Source document: `docs/reference/lichess-analysis-variation-actions-audit.md`
  - Source step: `Source-backed implementation sequence, Step 2`
  - Task: add context-menu actions to copy mainline and variation PGN from the selected path
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
```

## CCP-027 - Add Delete-From-Here Variation Action

```
- [ ] Reviewed
  - ID: `CCP-027`
  - Task ID: `CCP-027`
  - Parent prompt ID: none
  - Source document: `docs/reference/lichess-analysis-variation-actions-audit.md`
  - Source step: `Source-backed implementation sequence, Step 3`
  - Task: add a move-list context `Delete from here` branch action with active-path repair
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
```

## CCP-028 - Add Variation Promotion And Make-Mainline Actions

```
- [ ] Reviewed
  - ID: `CCP-028`
  - Task ID: `CCP-028`
  - Parent prompt ID: none
  - Source document: `docs/reference/lichess-analysis-variation-actions-audit.md`
  - Source step: `Source-backed implementation sequence, Step 4`
  - Task: add context-menu actions for variation promotion and make-mainline behavior
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
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
