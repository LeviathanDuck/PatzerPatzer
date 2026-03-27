# Claude Batch Manager Template

Use this when you want Codex to generate a single Claude Code manager prompt that runs a contiguous batch of already-queued prompts automatically.

This is a prompt-generation template for Codex, not a prompt to hand directly to Claude unchanged.

## Purpose

Generate a guarded automatic batch-manager prompt for Claude Code that:
- reads queued prompts from `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_QUEUE.md`
- executes a contiguous queued range in order
- performs internal validation/self-check after each prompt
- stops immediately on a real issue
- may mark child prompt queue-index checkboxes as run in `CLAUDE_PROMPT_QUEUE.md`
- does **not** remove prompts from queue/log/history/review docs
- is itself tracked as a prompt artifact in the prompt-log workflow without being re-queued into the runnable batch range

## Important manager-prompt rules

- the manager prompt itself must have its own `Prompt ID` and `Task ID`
- the manager prompt must **not** include itself in the execution batch
- the manager prompt is a runner/controller prompt, not one of the queued implementation prompts it runs
- unless the user explicitly asks otherwise, treat the manager prompt as a tracked execution artifact, not as a queued implementation prompt to be re-consumed by the batch it launches
- the manager prompt must never tell Claude to derive a batch range that could include the manager prompt itself
- the manager prompt must never instruct Claude to re-read or re-run the manager prompt as if it were one of the queued child prompts

## Codex instructions

When using this template, Codex should:

1. Inspect:
   - `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_QUEUE.md`
   - `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_LOG.md`
   - `/Users/leftcoast/Development/PatzerPatzer/AGENTS.md`
   - `/Users/leftcoast/Development/PatzerPatzer/CLAUDE.md`
2. Determine the next contiguous queued prompt range from the queue file unless the user explicitly gives a custom start/end or explicit prompt IDs.
3. Assign the manager prompt its own stable `CCP-###` identifier.
4. Ensure the manager prompt's own `Prompt ID` is not listed in the execution range.
5. Add a matching log entry for the manager prompt to `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_LOG.md`.
6. In that manager log entry, include the exact child prompt ids the batch will run as `Batch prompt IDs`.
7. Do **not** add the manager prompt to `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_QUEUE.md` unless the user explicitly asks to store manager prompts there.
8. Output only the final Claude Code manager prompt in a single fenced Markdown code block.

## How to determine the queued batch range

Unless the user gives a custom range, interpret:
- “next queued range”
- “next batch”
- “next N queued prompts”
- similar phrasing

as:
- inspect `CLAUDE_PROMPT_QUEUE.md`
- take the next contiguous queued `CCP-###` headings in file order
- stop after the requested count, if one is given

If the queue contains mixed families, preserve file order.
Do not reorder by numeric ID unless the queue file is already in that order.

## Required manager-prompt content

The final manager prompt should include:

- repository path
- its own `Prompt ID` and `Task ID`
- mandatory repo instructions:
  - `/Users/leftcoast/Development/PatzerPatzer/AGENTS.md`
  - `/Users/leftcoast/Development/PatzerPatzer/CLAUDE.md`
- prompt source:
  - `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_QUEUE.md`
- relevant research-reference paths when applicable
- the exact prompt IDs to execute, in order
- an explicit rule that the manager prompt's own `Prompt ID` is metadata for the runner only and is not one of the child prompts to execute
- a clear `Begin with ...` line

## Required execution rules inside the manager prompt

The final manager prompt must tell Claude Code:

- execute queued prompts one after another automatically
- read each queued prompt exactly as written from `CLAUDE_PROMPT_QUEUE.md`
- do not modify:
  - `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_QUEUE.md`, except to change child prompt queue-index items from `- [ ]` to `- [x]` when those child prompts are actually run
  - `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_LOG.md`
  - `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_HISTORY.md`
  - `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/code-review.md`
- perform internal validation/self-check only
- stop immediately if:
  - build fails
  - required validation fails
  - a real issue is found in the internal self-check
  - the prompt cannot be completed safely
  - repo state becomes too uncertain to continue
- do not continue past a known issue just to finish the batch
- do not reorder prompts
- do not create new prompts during the batch
- do not execute, re-queue, or otherwise recurse into the manager prompt itself
- do not remove child prompts from the queue; review still owns removal

## Required progress reporting inside the manager prompt

After each completed prompt, Claude should report briefly:
- Prompt ID
- task title
- build result
- validation result
- internal check result
- whether the batch will continue or stop

If the batch stops, Claude should clearly report:
- which Prompt ID stopped the batch
- why it stopped
- what issue or failure was found

If the batch finishes, Claude should give a compact summary of completed Prompt IDs.

## Reusable Codex request template

Use this with Codex when you want a new manager prompt:

```text
Use /Users/leftcoast/Development/PatzerPatzer/docs/prompts/codexinstructionstopromptclaude.md as the template.

First inspect the relevant prompt queue, prompt log, and any referenced source docs so the batch-manager prompt is grounded in the real repo state.

Then output only the final Claude Code prompt for this task:

Create a guarded automatic batch-manager prompt for Claude Code that will execute the next contiguous queued range from /Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_QUEUE.md.

Requirements for the manager prompt:
- The manager prompt itself must have its own Prompt ID and Task ID.
- The manager prompt must not include itself in the execution batch.
- The manager prompt must be logged in `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_LOG.md` as a manager/run prompt artifact.
- The manager log entry must include the exact selected child prompt ids as `Batch prompt IDs`.
- The manager prompt should not be added to `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_QUEUE.md` unless I explicitly ask for manager prompts to be queued there.
- The manager prompt must tell Claude to inspect the queue file and derive the next contiguous queued range in file order.
- If I specify a count, Claude should process only that many queued prompts from the front of the contiguous range.
- If I specify an explicit start/end or explicit prompt IDs, use those instead.
- The manager prompt must tell Claude to read the queued prompts exactly as written from CLAUDE_PROMPT_QUEUE.md.
- Claude must execute the selected queued prompts sequentially in the exact order provided.
- Claude must not modify:
  - /Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_QUEUE.md, except to mark a child prompt's queue-index checkbox from `- [ ]` to `- [x]` once that child prompt is actually run
  - /Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_LOG.md
  - /Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_HISTORY.md
  - /Users/leftcoast/Development/PatzerPatzer/docs/prompts/code-review.md
- Claude must do internal validation/self-check only.
- External review and tracking are handled separately in Codex.
- Claude must leave the queued prompt blocks and queue-index entries present after checking them off; formal review removes them later.
- Claude must stop immediately if:
  - build fails
  - required validation fails
  - a real issue is found in the internal self-check
  - the prompt cannot be completed safely
  - repo state becomes too uncertain to continue
- Claude must not continue past a known issue just to finish the batch.
- Claude must not reorder prompts.
- Claude must not create new prompts during the batch.
- Claude must not execute or recurse into the manager prompt itself.
- Claude must give a short progress update after each completed prompt with:
  - Prompt ID
  - task title
  - build result
  - validation result
  - internal check result
  - whether the batch will continue or stop
- If the batch stops, Claude must clearly report:
  - which Prompt ID stopped the batch
  - why it stopped
  - what issue or failure was found
- If the batch finishes, Claude must give a compact summary of completed Prompt IDs.

Return:
- a final Claude Code manager prompt only
- in a single fenced markdown code block
- no extra commentary
```
