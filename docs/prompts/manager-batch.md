# Claude Batch Manager Template

Use this when you want Codex to generate a single Claude Code manager prompt that runs a contiguous batch of already-created prompts automatically.

This is a prompt-generation template for Codex, not a prompt to hand directly to Claude unchanged.

## Purpose

Generate a guarded automatic batch-manager prompt for Claude Code that:
- reads its child prompt IDs from the registry-backed prompt system
- executes a contiguous queued range in order
- performs internal validation/self-check after each prompt
- stops immediately on a real issue
- may mark child prompts as run in the registry
- does not perform review closeout
- is itself tracked as a prompt artifact without being re-consumed by the batch it launches

## Important Manager Rules

- the manager prompt itself must have its own `Prompt ID` and `Task ID`
- the manager prompt must not include itself in the execution batch
- the manager prompt is a runner/controller prompt, not one of the queued implementation prompts it runs
- unless the user explicitly asks otherwise, treat the manager prompt as a tracked execution artifact, not as a queued implementation prompt

## Codex Instructions

When using this template, Codex should:

1. Inspect:
   - `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/prompt-registry.json`
   - `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/items/`
   - `/Users/leftcoast/Development/PatzerPatzer/AGENTS.md`
   - `/Users/leftcoast/Development/PatzerPatzer/CLAUDE.md`
2. Determine the next contiguous queued prompt range from the registry unless the user explicitly gives a custom start/end or explicit prompt IDs.
3. Assign the manager prompt its own stable `CCP-###` identifier.
4. Ensure the manager prompt's own `Prompt ID` is not listed in the execution range.
5. Track the manager prompt in `prompt-registry.json`.
6. Record the exact child prompt ids as `batchPromptIds`.
7. Do not queue the manager prompt unless the user explicitly asks for that.
8. Run:
   - `npm run prompts:refresh`
9. Output only the final Claude Code manager prompt in a single fenced Markdown code block.

## Required Manager-Prompt Content

The final manager prompt should include:
- repository path
- its own `Prompt ID` and `Task ID`
- mandatory repo instructions:
  - `/Users/leftcoast/Development/PatzerPatzer/AGENTS.md`
  - `/Users/leftcoast/Development/PatzerPatzer/CLAUDE.md`
- prompt source:
  - `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/prompt-registry.json`
  - `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/items/`
- the exact prompt IDs to execute, in order
- an explicit rule that the manager prompt's own `Prompt ID` is metadata for the runner only and is not one of the child prompts to execute

## Required Execution Rules Inside The Manager Prompt

The final manager prompt must tell Claude Code:
- execute queued prompts one after another automatically
- read each child prompt exactly as written from its prompt item file
- do not perform review closeout on queue/log/history
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
- before starting each child prompt's startup coordination or real work, run `npm run prompt:start -- <CHILD_PROMPT_ID>`
- only continue into the child prompt after that command succeeds

## Reusable Codex Request Template

Use this with Codex when you want a new manager prompt:

```text
Use /Users/leftcoast/Development/PatzerPatzer/docs/prompts/codexinstructionstopromptclaude.md as the template.

First inspect the prompt registry, prompt item files, and any referenced source docs so the batch-manager prompt is grounded in the real repo state.

Then output only the final Claude Code prompt for this task:

Create a guarded automatic batch-manager prompt for Claude Code that will execute the next contiguous queued range from the registry-backed prompt system.

Requirements for the manager prompt:
- The manager prompt itself must have its own Prompt ID and Task ID.
- The manager prompt must not include itself in the execution batch.
- The manager prompt must be tracked in `docs/prompts/prompt-registry.json` as a manager/run prompt artifact.
- The manager record must include the exact selected child prompt ids as `batchPromptIds`.
- The manager prompt should not be queued unless I explicitly ask for manager prompts to be queued.
- The manager prompt must tell Claude to inspect the registry and derive the next contiguous queued range in file order.
- If I specify a count, Claude should process only that many queued prompts from the front of the contiguous range.
- If I specify explicit prompt IDs, use those instead.
- Claude must execute the selected queued prompts sequentially in the exact order provided.
- Claude must do internal validation/self-check only.
- External review and review closeout are handled separately in Codex.
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

Return:
- a final Claude Code manager prompt only
- in a single fenced markdown code block
- no extra commentary
```
