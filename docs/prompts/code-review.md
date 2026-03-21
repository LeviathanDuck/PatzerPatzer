You are reviewing code changes in this repository.

Read and follow:
- /Users/leftcoast/Development/PatzerPatzer/AGENTS.md
- /Users/leftcoast/Development/PatzerPatzer/CLAUDE.md
- /Users/leftcoast/Development/PatzerPatzer/docs/prompts/README.md

Your job:
- review code changes with a bug/regression/architectural-drift mindset
- inspect the actual changed files first
- compare changes against the existing codebase
- inspect relevant Lichess source when the changed behavior is Lichess-aligned
- report findings first, summary second

Workflow:
1. Re-read `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/README.md` before mutating any prompt-tracking files
2. Detect what changed locally using git
3. Check `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_QUEUE.md` and `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_LOG.md` for the relevant `CCP-###` item
4. Determine whether the changes are:
   - unstaged
   - staged
   - committed locally but not pushed
   - already pushed, if this can be confirmed against the remote
5. Use local git information first, then fetch the tracked remote when network access is available to verify push/public status
6. If remote verification cannot be performed, say clearly that push/public status is unverified and do not guess
7. Review the actual diff, not just filenames
8. Keep the review scoped to the actual changes unless surrounding code creates risk
9. Prioritize:
   - correctness bugs
   - regressions
   - Lichess behavior mismatches
   - architectural drift
   - hidden coupling
   - missing validation
10. If the reviewed change corresponds to a queued prompt, remove that prompt from `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_QUEUE.md` and update its existing entry in `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_LOG.md`
11. When removing the prompt from `CLAUDE_PROMPT_QUEUE.md`, also remove its matching item from the top `Queue Index` in that same file so the index continues to list only still-pending prompts
12. When updating the matching log entry, also update the top checklist index in `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_LOG.md` from `- [ ] CCP-### - Short Task Title` to `- [x] CCP-### - Short Task Title`
13. After updating queue/log state, explicitly verify that the reviewed `CCP-###` no longer appears anywhere in `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_QUEUE.md`
14. After that verification, quickly confirm it still matches `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/README.md`
15. If review finds a real bug, regression, or currently relevant repository issue, explicitly ask the user whether they want it added to `/Users/leftcoast/Development/PatzerPatzer/docs/KNOWN_ISSUES.md`
16. If the review shows the task needs a follow-up fix prompt, note that the next prompt should reuse the same root `Task ID` with the next `-F#` `Prompt ID` modifier

When checking git state, use local information first:
- `git status --short --branch`
- `git branch -vv`
- `git log --oneline --decorate --graph -n 20`
- `git diff`
- `git diff --cached`
- `git diff @{upstream}...HEAD` if upstream exists
- `rg -n "CCP-###" /Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_QUEUE.md /Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_LOG.md`

When verifying push/public status, prefer:
- `git fetch --prune`
- compare `HEAD` to the refreshed upstream ref after fetch

Important rules:
- do not praise by default
- do not rewrite the whole feature unless necessary
- do not assume a change is correct because it compiles
- do not assume code was pushed/public unless verified against the remote, or clearly mark it as unverified
- do not guess file paths; search first
- pay special attention to unnecessary growth in `src/main.ts`

Review output format:
- Prompt log status
- Findings
- Push status
- Validation gaps
- Known-issues follow-up
- Brief summary
- Suggested manual tests

Prompt log status rules:
- if a matching `CCP-###` item is identifiable and no review findings exist, say it should be recorded in `CLAUDE_PROMPT_LOG.md` as `[x] Reviewed` with `Review outcome: passed`
- if the change is acceptable but has minor caveats, say it should be recorded in `CLAUDE_PROMPT_LOG.md` as `[x] Reviewed` with `Review outcome: passed with notes`
- if review findings exist, say it should be recorded in `CLAUDE_PROMPT_LOG.md` as `[x] Reviewed`, but with `Review outcome: issues found` or `Review outcome: needs rework`, and the issue summary should be recorded beside that log entry
- keep the existing `## prompt-id - short task title` heading and fenced log-entry block format when updating the log
- keep the top checklist index in `CLAUDE_PROMPT_LOG.md` synchronized with the detailed log entry status
- keep the top `Queue Index` in `CLAUDE_PROMPT_QUEUE.md` synchronized with the actual queued prompt blocks
- do not leave a reviewed prompt in either the queue index or the queue body
- keep queue/log fenced blocks untagged; do not add a language label such as `text`
- if the matching prompt is still present in `CLAUDE_PROMPT_QUEUE.md`, say it should be removed from the queue after review
- if no prompt item is identifiable, say `No prompt queue/log item identified`
- if a reviewed change has a `CCP-###` id but no log entry exists yet, say that explicitly and create the missing log entry before updating its review fields
- if a reviewed change needs a follow-up fix prompt, include the recommended next prompt id in the prompt-log status, for example `CCP-013-F1`

Known-issues follow-up rules:
- if review finds a real current issue that belongs in the repo bug log, explicitly ask: `Do you want me to add this to docs/KNOWN_ISSUES.md?`
- only do this for real, current issues worth tracking at the repository level
- do not silently add items to `docs/KNOWN_ISSUES.md` during review unless the user explicitly asks
- if no such issue exists, say `No known-issues log follow-up needed`

Suggested manual tests rules:
- only include tests relevant to the actual diff
- keep it short and practical
- prefer 3–6 checks
- each check must include:
  - action
  - expected result
- if no manual app test is needed, say so explicitly

If there are no findings:
- say that explicitly
- include residual risks
- include missing validation, if any
