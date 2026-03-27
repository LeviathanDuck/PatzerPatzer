# Codex Prompt Instructions

Use this file when Codex is asked to create prompts for later execution, including prompts intended for Claude Code or for Codex itself.

These instructions extend:
- `/Users/leftcoast/Development/PatzerPatzer/AGENTS.md`
- `/Users/leftcoast/Development/PatzerPatzer/CLAUDE.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/README.md`

## Scope

These rules apply when Codex is:
- generating a new implementation prompt
- generating a follow-up fix prompt
- generating a review prompt
- generating a prompt for Codex itself
- generating a prompt for Claude Code

Before doing any of those actions, re-read:
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/README.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CODEX_PROMPT_INSTRUCTIONS.md`

## Registry Rule

Prompt tracking is registry-first.

That means:
- create or update the prompt body in `docs/prompts/items/CCP-###.md`
- create or update the prompt record in `docs/prompts/prompt-registry.json`
- refresh generated artifacts with `npm run prompts:refresh`

Do not hand-edit:
- `docs/prompts/CLAUDE_PROMPT_QUEUE.md`
- `docs/prompts/CLAUDE_PROMPT_LOG.md`
- `docs/prompts/CLAUDE_PROMPT_HISTORY.md`

Those are generated reports only.

## Core Rule

Every Codex-created code-work prompt must explicitly include a coordination check step for other active tools or agents touching the same codebase.

For Codex itself in this thread, that coordination check is a hard gate:
- the first assistant message for any non-trivial implementation, refactor, or review task must be only the coordination question
- send that question as a normal visible assistant chat message, not commentary and not a collapsible work update
- do not inspect files, run tools, or touch the repo before the user answers
- do not hide the coordination question inside commentary about next steps

## Prompt Metadata

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

## Grounding Requirements

Codex should ground the generated prompt in the actual repo before writing it.

Do not guess file paths if the repo can be inspected first.

Before generating the prompt, identify:
- the real implementation points
- the likely smallest safe change area
- whether a Lichess reference is required
- whether the task overlaps another active tool's ownership

## Small-Step Bias

Prompts created by Codex should:
- ask for the smallest safe implementation step
- avoid bundling adjacent cleanup
- keep validation specific to the requested change
- request diagnosis before editing

## Logging Rule

If the repo's prompt-tracking workflow is in use, Codex should update the registry and prompt item files when creating the prompt.

For normal runnable prompts:
- create the prompt body file in `docs/prompts/items/`
- add a prompt record with:
  - `status: created`
  - `reviewOutcome: pending`
  - `queueState: queued-pending`
  - `createdBy: Codex`
  - `createdAt` set to the current ISO datetime
- generated prompt bodies should instruct the executing model to:
  - run `npm run prompt:start -- <PROMPT_ID>` as the first execution step
  - only continue implementation work after that command succeeds

For manager prompts:
- track the manager prompt as its own registry item
- include exact `batchPromptIds`
- do not add it to the queue unless the user explicitly wants queued manager prompts
- if manager-only behavior is not explicitly requested, later manager review should review child prompts too

After mutating prompt tracking:
- run `npm run prompts:refresh`

## Follow-Up Fix Rule

If the new prompt is fixing a previously reviewed prompt:
- reuse the same root `Task ID`
- assign the next `-F#` prompt id
- set `parentPromptId` to the prompt being fixed

## Output Rule

When the user asks Codex to return a copy/paste prompt:
- return only the final prompt content
- wrap it in a single fenced Markdown code block
- do not add commentary before or after the code block unless the user explicitly asks for it
