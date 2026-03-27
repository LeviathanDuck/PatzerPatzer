# Codex Prompt Instructions

Use this file when Codex is asked to create prompts for later execution, including prompts intended
for Claude Code or for Codex itself.

These instructions extend the repo prompt templates. They do not replace:

- `/Users/leftcoast/Development/PatzerPatzer/AGENTS.md`
- `/Users/leftcoast/Development/PatzerPatzer/CLAUDE.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/README.md`

---

## Scope

These rules apply when Codex is:

- generating a new implementation prompt
- generating a follow-up fix prompt
- generating a review prompt
- generating a prompt for Codex itself
- generating a prompt for Claude Code

Before doing any of those actions, Codex should re-read:

- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/README.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CODEX_PROMPT_INSTRUCTIONS.md`

and treat that re-read as mandatory before mutating queue/log/history files.

---

## Core rule

Every Codex-created code-work prompt must explicitly include a coordination check step for other
active tools or agents touching the same codebase.

At minimum, the generated prompt should require the executing model to check whether any other
tool, agent, or parallel coding session is currently working in overlapping files or systems
before beginning repo edits.

Examples of what counts:

- Claude Code
- another Codex thread
- a second local coding tool
- any concurrent agent touching the same repo

The point is to prevent overlapping ownership, duplicated investigation, and conflicting edits.

---

## Required coordination wording

For prompts created by Codex for Codex itself:

- include a startup step telling Codex to check whether any other tool is actively touching the
  same codebase or target files before editing
- if the current thread already has a required coordination question, the generated prompt should
  preserve that requirement rather than weaken it

For prompts created by Codex for Claude Code:

- include a startup step telling Claude Code to ask whether any other tool is currently running
  in overlapping parts of the repo before editing
- if the repo has a stronger Codex-only coordination rule, do not incorrectly force that exact
  Codex wording onto Claude unless the user explicitly wants the same workflow there

---

## Prompt metadata

Every generated prompt should include near the top:

- `Prompt ID`
- `Task ID`
- `Source Document`, if applicable
- `Source Step`, if applicable
- `Execution Target`, when useful

If the prompt is intended for Codex, label it clearly:

- `Execution Target: Codex`

If the prompt is intended for Claude Code, label it clearly:

- `Execution Target: Claude Code`

---

## Grounding requirements

Codex should ground the generated prompt in the actual repo before writing it.

Do not guess file paths if the repo can be inspected first.

Before generating the prompt, identify:

- the real implementation points
- the likely smallest safe change area
- whether a Lichess reference is required
- whether the task overlaps another active tool's ownership

Generated prompts should reflect the real files and seams that currently exist in the repo.

---

## Small-step bias

Prompts created by Codex should:

- ask for the smallest safe implementation step
- avoid bundling adjacent cleanup
- keep validation specific to the requested change
- request diagnosis before editing

If the requested work is large, the generated prompt should narrow the first step instead of
silently bundling multiple tasks together.

---

## Output rule

When the user asks Codex to return a copy/paste prompt, Codex should return only the final prompt
content in a single fenced Markdown code block, unless the user explicitly asks for a different
format.

---

## Logging rule

If the repo's prompt-tracking workflow is in use, Codex should update the relevant queue/log/history
files when creating the prompt.

That includes:

- for normal runnable prompts, adding the full prompt to `CLAUDE_PROMPT_QUEUE.md`
- for normal runnable prompts, adding a matching item to the top `Queue Index` in `CLAUDE_PROMPT_QUEUE.md`
- adding the detailed unchecked prompt entry to `CLAUDE_PROMPT_LOG.md`
- adding the matching unchecked checklist item to the top prompt index in `CLAUDE_PROMPT_LOG.md`

Each queue-index item should include:

- first line: `- [ ] CCP-###: Short Task Title`
- second line: an indented bullet with a brief one-line description of the prompt's target
- one blank line between queue-index items for readability

Queue-index checkbox rules:

- new prompts enter the queue index as `- [ ]`
- when a queued prompt is actually run, the executing agent should update only that queue-index item to `- [x]` as its first execution step
- the checked queue item and full queued prompt block must remain present until formal review removes them
- when review removes a prompt from the queue, the matching item must also be removed from the top
  queue index so the index only reflects still-pending prompts

Important queue boundary:

- `CLAUDE_PROMPT_QUEUE.md` should contain created prompts that are still pending review
- if prompts are drafted early for later phases and the user wants them available, add them to `CLAUDE_PROMPT_QUEUE.md`
- only remove prompts from `CLAUDE_PROMPT_QUEUE.md` after actual use and review

If the generated prompt is for Codex rather than Claude Code, Codex may still reuse the same prompt
ID/logging structure for consistency, but should label the execution target clearly so the prompt's
intended tool is unambiguous.

For manager/batch-runner prompts:

- treat the manager prompt as a tracked prompt artifact with its own `Prompt ID` and `Task ID`
- add a detailed log entry for it in `CLAUDE_PROMPT_LOG.md`
- include `Batch prompt IDs` listing the exact child prompts the manager will run
- do not add the manager prompt to `CLAUDE_PROMPT_QUEUE.md` unless the user explicitly asks for manager prompts to live in the runnable queue
- make sure the generated manager instructions explicitly forbid running or recursing into the manager prompt itself
- when later reviewing a manager prompt, default to reviewing its child prompts too unless the user explicitly asks for `manager-only`

After mutating queue/log/history files, Codex should do a quick documentation-consistency check:

- confirm the file updates still match `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/README.md`
- if the intended action required a new workflow rule, update the docs before considering the task complete
