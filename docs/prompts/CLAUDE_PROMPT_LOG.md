# Claude Prompt Log

Use this file to track Claude Code prompts from creation through review.

## How to use it

- Add one entry per prompt as soon as the prompt is created.
- Give each prompt a stable identifier in the form `CCP-###`.
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
- Use `Review outcome: passed` when the review found no issues.
- Use `Review outcome: passed with notes` when the change is acceptable but has minor caveats worth recording.
- Use `Review outcome: issues found` when the review found concrete problems.
- Use `Review outcome: needs rework` when the implementation is not ready to accept as-is.
- Use `Claude used: yes` once the prompt id has been reviewed against actual Claude Code work.
- Use `Claude used: no` only for reviewed entries where Claude usage could not be confirmed.
- If review finds issues, replace `Review issues: none` with a short issue list or summary on the same entry.
- Keep the entry compact. This log is for tracking prompt provenance and review state, not for full review writeups.

## Log

## CCP-010 - Fix Sparse Move-List Row Spacing

```
- [x] Reviewed
  - ID: `CCP-010`
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
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 4, Item 12`
  - Task: first move-list variation removal affordance
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: variation deletion is not actually persisted across reload; `saveGamesToIdb()` stores imported game PGN/path, not the mutated move tree, so deleted branches can reappear after reload
```
