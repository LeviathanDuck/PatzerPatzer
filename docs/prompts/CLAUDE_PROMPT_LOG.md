# Claude Prompt Log

Use this file to track Claude Code prompts that were generated from Codex for Patzer Pro work.

## How to use it

- Add one entry per prompt sent to Claude Code.
- Give each prompt a stable identifier in the form `CCP-###`.
- Create the entry as soon as the prompt is generated.
- Leave the checkbox unchecked at prompt creation time.
- Check the box as soon as the implementation has been reviewed, regardless of whether the review passed cleanly.
- After review, add a short review outcome label such as `passed`, `passed with notes`, `issues found`, or `needs rework`.
- If review finds issues, keep the entry checked and record a brief issue summary under the same entry.

## Template

```md
- [ ] Reviewed
  - ID: `CCP-###`
  - Source document: `docs/...`
  - Source step: `Priority X, Item Y` or equivalent section label
  - Task: short task title
  - Review outcome: pending
  - Review issues: none
```

## Review rules

- `- [x] Reviewed` means the task was reviewed.
- `- [ ] Reviewed` means the task has not been reviewed yet.
- Use `Review outcome: passed` when the review found no issues.
- Use `Review outcome: passed with notes` when the change is acceptable but has minor caveats worth recording.
- Use `Review outcome: issues found` when the review found concrete problems.
- Use `Review outcome: needs rework` when the implementation is not ready to accept as-is.
- If review finds issues, replace `Review issues: none` with a short issue list or summary on the same entry.
- Keep the entry compact. This log is for tracking prompt provenance and review state, not for full review writeups.

## Log

- [x] Reviewed
  - ID: `CCP-003`
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 4, Item 12`
  - Task: first move-list variation removal affordance
  - Review outcome: issues found
  - Review issues: variation deletion is not actually persisted across reload; `saveGamesToIdb()` stores imported game PGN/path, not the mutated move tree, so deleted branches can reappear after reload
