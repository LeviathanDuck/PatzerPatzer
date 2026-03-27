# Prompt Workflow

This directory holds the repo-local prompt workflow for Patzer Pro.

Use this README as the canonical starting point for:
- prompt creation
- prompt queueing
- prompt review
- follow-up fix prompts
- manager/batch-runner prompts

If another prompt doc seems to conflict with this file, update the other doc so the workflow stays consistent.

## Start Here

Before doing any prompt-workflow action, re-read:
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/README.md`
- `/Users/leftcoast/Development/PatzerPatzer/AGENTS.md`
- `/Users/leftcoast/Development/PatzerPatzer/CLAUDE.md`

If the action is prompt creation, also re-read:
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CODEX_PROMPT_INSTRUCTIONS.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/codexinstructionstopromptclaude.md`

If the action is review, also re-read:
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/code-review.md`

If the action is manager-prompt creation, also re-read:
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/manager-batch.md`

This re-read is mandatory.
Do not rely on memory alone when mutating queue/log/history files.

## Core Rule

Prompt-workflow actions are operational actions, not just writing tasks.

That means:
- creating a prompt must update the tracking files
- reviewing a prompt must update the tracking files
- changing the prompt workflow must update this README and any supporting docs that now disagree

If the workflow changes and the docs are not updated, the workflow is incomplete.

## Prompt Files

The tracked prompt files are:
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_QUEUE.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_LOG.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_HISTORY.md`

Their responsibilities are:

- `CLAUDE_PROMPT_QUEUE.md`
  - holds created prompts that have not yet been reviewed
  - remains the main available queue of prompts to run later
  - includes a top `Queue Index` listing only still-pending queued prompts
  - uses queue-index checkboxes to show whether a queued prompt has already been run

- `CLAUDE_PROMPT_LOG.md`
  - tracks prompt provenance from creation through review
  - includes a top `Prompt Index` checklist showing review state
  - also stores manager-prompt entries

- `CLAUDE_PROMPT_HISTORY.md`
  - stores historical full prompt text when the workflow calls for it

Status ownership rule:
- `CLAUDE_PROMPT_LOG.md` is the canonical review-status record
- `CLAUDE_PROMPT_QUEUE.md` is a pending-only working set
- `CLAUDE_PROMPT_HISTORY.md` is an archive/audit trail, not the canonical status source

That means:
- if a prompt has been reviewed, it must not remain in `CLAUDE_PROMPT_QUEUE.md`
- if queue and log disagree, fix the queue/log mismatch immediately before doing more prompt work

Queue-state rule:
- `CLAUDE_PROMPT_QUEUE.md` now tracks two pending sub-states in the top queue index:
  - `- [ ] CCP-###: ...` means created and still queued, but not yet run
  - `- [x] CCP-###: ...` means the prompt has been run and is waiting for formal review closeout
- a checked queue-index item is still pending and must remain in the queue until review removes it
- only review removes a prompt from the queue body and queue index

## Prompt Types

There are two main tracked prompt categories:

- Normal runnable prompts
  - these are implementation prompts meant to be executed later
  - they go in the queue
  - they also get logged

- Manager prompts
  - these are runner/controller prompts that launch a batch of other prompts
  - they get logged
  - by default they do not go in the runnable queue unless the user explicitly asks for that

## ID Rules

Every tracked prompt uses:
- `Prompt ID`
- `Task ID`

Default format:
- `CCP-###`

Follow-up fix format:
- original prompt: `CCP-013`
- first fix prompt: `CCP-013-F1`
- second fix prompt: `CCP-013-F2`

Rules:
- `Prompt ID` is the unique prompt instance id
- `Task ID` is the root task-family id
- for a normal root prompt, `Prompt ID` and `Task ID` are the same
- for a follow-up fix prompt:
  - `Prompt ID` uses the next `-F#`
  - `Task ID` stays on the root family id
  - `Parent Prompt ID` points to the prompt being fixed

## Metadata Rules

Generated prompts should include near the top:
- `Prompt ID`
- `Task ID`
- `Parent Prompt ID`, if applicable
- `Source Document`, if applicable
- `Source Step`, if applicable
- `Execution Target`, when useful

Claude execution prompts should also instruct Claude to echo:
- `Prompt ID`
- `Task ID`

in its final report.

## Queue Format

Normal runnable prompts belong in:
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_QUEUE.md`

Queue rules:
- use a scan-friendly heading immediately before each prompt block:
  - `## CCP-### - Short Task Title`
- use a plain fenced Markdown block with no language tag
- maintain the top `Queue Index`

Each queue-index item must use this format:

```md
- [ ] CCP-###: Short Task Title
  - Brief one-line description of the prompt target.
```

Leave one blank line between queue-index items for readability.

The queue index must list only prompts still present in the queue.

Queue-index checkbox rules:
- when a prompt is created, add it as `- [ ]`
- when a prompt is actually run, change only the queue-index checkbox from `- [ ]` to `- [x]`
- do not remove the queue item or prompt block at run time
- review is the only step that removes the queued prompt from `CLAUDE_PROMPT_QUEUE.md`

## Log Format

Every created prompt gets a detailed log entry in:
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_LOG.md`

The log also has a top checklist index.

Prompt-index format:

```md
- [ ] CCP-### - Short Task Title
```

Detailed log-entry format:

```md
- [ ] Reviewed
  - ID: `CCP-###`
  - Task ID: `CCP-###`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/...`
  - Source step: `...`
  - Task: short task title
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
```

For manager prompts:
- `Batch prompt IDs` should list the child prompt ids the manager is intended to run

For normal prompts:
- `Batch prompt IDs: none`

## Normal Prompt Creation Workflow

When creating a normal runnable prompt:

1. Re-read the workflow docs listed in `Start Here`
2. Ground the prompt in the real repo first
3. Assign the next correct `Prompt ID` and `Task ID`
4. Add the full prompt to `CLAUDE_PROMPT_QUEUE.md`
5. Add the matching unchecked item to the top `Queue Index`
6. Add the detailed unchecked entry to `CLAUDE_PROMPT_LOG.md`
7. Add the matching unchecked item to the top `Prompt Index` in the log
8. If needed, update history according to the active workflow
9. Double-check that queue index, queue body, prompt log index, and detailed log entry all match

Do not stop after only generating prompt text in chat.

If the user asks to prebuild prompts for later phases:

1. Create the prompt artifacts in queue/log/history
2. Keep them available in `CLAUDE_PROMPT_QUEUE.md` until they are reviewed
3. Only remove them from the queue after actual use and review

## Prompt Execution Queue Update Workflow

When a queued prompt is actually run:

1. Re-read the workflow docs listed in `Start Here`
2. Find the matching `CCP-###` item in the top `Queue Index`
3. Change only that queue-index checkbox from `- [ ]` to `- [x]`
4. Leave the prompt block itself in `CLAUDE_PROMPT_QUEUE.md`
5. Leave the detailed log entry in `CLAUDE_PROMPT_LOG.md` pending until review
6. Do not remove the prompt from the queue during execution

Execution-state rule:
- queue checkbox state is an execution marker, not a review marker
- reviewed prompts are still removed only by the review workflow
- queue index, queue body, and log must still refer to the same prompt ids after the checkbox update

## Manager Prompt Creation Workflow

When creating a manager prompt:

1. Re-read the workflow docs listed in `Start Here`
2. Ground the manager in the real queue/log state
3. Assign the next correct `Prompt ID` and `Task ID`
4. Add a detailed unchecked entry to `CLAUDE_PROMPT_LOG.md`
5. Add the matching unchecked item to the top `Prompt Index` in the log
6. Record `Batch prompt IDs` in the detailed log entry
7. Do not add the manager prompt to `CLAUDE_PROMPT_QUEUE.md` unless the user explicitly asks for manager prompts to live there
8. Double-check that the manager prompt cannot accidentally include itself in the batch it launches

Manager prompts are tracked artifacts, but not normal queued child prompts by default.

## Review Workflow

When reviewing a prompt:

1. Re-read the workflow docs listed in `Start Here`
2. Find the matching `CCP-###` entry in queue/log/history
3. Review the actual changes using `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/code-review.md`
4. Complete prompt-tracking closeout as one atomic step:
   - remove the prompt block from `CLAUDE_PROMPT_QUEUE.md`
  - remove the matching queue-index item from `CLAUDE_PROMPT_QUEUE.md`, whether it is `[ ]` or `[x]`
  - update the detailed log entry in `CLAUDE_PROMPT_LOG.md`
  - flip the matching top prompt-index item in `CLAUDE_PROMPT_LOG.md` from `[ ]` to `[x]`
  - record `Review outcome`
  - record any short `Review issues`
  - update `CLAUDE_PROMPT_HISTORY.md` if the active workflow expects a reviewed/archive entry
5. If the review found a real repository issue, ask whether it should be added to `docs/KNOWN_ISSUES.md`
6. Run the required invariant verification
7. Only after that verification passes is the review complete

Required invariant verification after review:

```sh
rg -n "CCP-###" docs/prompts/CLAUDE_PROMPT_QUEUE.md docs/prompts/CLAUDE_PROMPT_LOG.md
```

Expected result after a completed review:
- no match in `CLAUDE_PROMPT_QUEUE.md`
- reviewed match in `CLAUDE_PROMPT_LOG.md`

Recommended full audit after review:

```sh
npm run audit:prompts
```

Atomic closeout rule:
- a prompt review is incomplete if any of the following are still true after review:
  - the prompt id still appears anywhere in `CLAUDE_PROMPT_QUEUE.md`
  - the top log checklist still shows `[ ]`
  - the detailed log entry still says `Review outcome: pending`
  - the queue index and queue body disagree about pending prompt ids

Do not describe a review as complete until those invariants pass.

## Review Outcome Labels

Use:
- `passed`
- `passed with notes`
- `issues found`
- `needs rework`

Meaning:
- `passed`
  - reviewed cleanly
- `passed with notes`
  - acceptable, but with minor caveats
- `issues found`
  - concrete problems were identified
- `needs rework`
  - not ready to accept as-is

The checkbox means only whether review happened:
- `[ ]` = not reviewed yet
- `[x]` = reviewed

## Follow-Up Fix Workflow

If a reviewed prompt needs another fix pass:

1. Re-read the workflow docs listed in `Start Here`
2. Reuse the same root `Task ID`
3. Assign the next `-F#` `Prompt ID`
4. Set `Parent Prompt ID` to the prompt being fixed
5. Treat the new prompt as a fresh created prompt for queue/log purposes

Natural-language requests like these should usually trigger this workflow:
- `I have a bug to fix with CCP-013`
- `I want to fix something from this task`
- `this needs a follow-up fix`

## Documentation Sync Rule

Any time the prompt-id process, queue structure, log structure, manager behavior, review behavior, or indexing rules change:

1. Update this README
2. Update every supporting prompt doc that now disagrees
3. Re-read the updated docs
4. Confirm the workflow is consistent again

Do not leave the new rule documented in only one place.

## Double-Check Rule

Every workflow action should trigger a documentation double-check before file mutation.

That means:
- before creating a prompt, re-read the workflow docs
- before reviewing a prompt, re-read the workflow docs
- before creating a manager prompt, re-read the workflow docs
- after mutating queue/log/history files, quickly verify the files still match the documented workflow

If the current docs and the intended action disagree:
- stop
- update the docs first
- then perform the workflow action

## Template Map

Use the template that matches the task:
- `bugfix.md`
  - diagnosing and fixing a specific bug
- `new-feature.md`
  - adding a new feature or workflow in the smallest safe step
- `refactor-step.md`
  - extraction work, ownership cleanup, `main.ts` reduction
- `lichess-parity.md`
  - Lichess-aligned behavior or structure work
- `code-review.md`
  - findings-first review workflow
- `manager-batch.md`
  - Claude batch-runner manager prompts

## Output Convention For Prompt Generation

When Codex is asked to return a final prompt:
- return only the prompt content
- wrap it in a single fenced Markdown code block unless the user explicitly asks for another format
- do not add commentary before or after the code block

## Related Files

These supporting docs must stay aligned with this README:
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CODEX_PROMPT_INSTRUCTIONS.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/codexinstructionstopromptclaude.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/code-review.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/manager-batch.md`
