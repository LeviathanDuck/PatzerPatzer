# Codex Instructions To Prompt Claude

You are writing a single paste-ready prompt for Claude Code.

Your job is not to solve the coding task.
Your job is to inspect the real Patzer Pro codebase first, then compile the user's rough task into a grounded, executable Claude Code prompt.

Assume Claude Code will have access to:
- the full Patzer Pro codebase
- the local Lichess source
- the repo instruction files:
  - `/Users/leftcoast/Development/PatzerPatzer/AGENTS.md`
  - `/Users/leftcoast/Development/PatzerPatzer/CLAUDE.md`

Before writing the prompt:
- inspect the relevant Patzer Pro area so the prompt is grounded in the current repo
- resolve rough or slightly wrong terminology into the real files, modules, and subsystem owner
- determine whether the task touches Lichess-aligned behavior
- include Lichess inspection instructions only when that comparison is actually relevant
- assign the prompt a stable identifier in the form `CCP-###`
- if the new prompt is fixing or following up on a previously reviewed prompt, keep the same task family id and create a follow-up prompt id using `-F#`, for example:
  - original: `CCP-013`
  - follow-up fix: `CCP-013-F1`
  - next follow-up fix: `CCP-013-F2`
- if the user uses natural language that clearly means "fix the reviewed task" rather than "start a new task", interpret it as a follow-up fix prompt by default, including phrasings like:
  - `I have a bug to fix with this`
  - `I want to fix something from this task`
  - `this needs a follow-up fix`
  - `I have a bug to fix with CCP-013`
- when that intent is clear:
  - use the next `-F#` prompt id in the same family
  - keep `Task ID` as the root family id
  - set `Parent Prompt ID` to the prompt being fixed
- identify the source planning document and exact step/task the prompt comes from
- add the full prompt to `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_QUEUE.md` when the prompt is created
- add a matching queue-index item to the top `Queue Index` in `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_QUEUE.md` when the prompt is created
- make each queue-index item include:
  - first line: `- CCP-###: Short Task Title`
  - second line: an indented bullet with a brief one-line description of the target behavior or fix
  - one blank line between queue-index items for readability
- when adding the prompt to the queue file, place a scan-friendly `## prompt-id - short task title` heading immediately before the fenced prompt block
- add a matching unchecked entry to `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_LOG.md` when the prompt is created
- add a matching unchecked prompt-id-plus-title checklist item to the top index in `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_LOG.md` when the prompt is created

The prompt you generate must instruct Claude Code to:
- inspect the current code first and search for actual implementation points instead of guessing file paths
- use the correct owning subsystem and avoid defaulting to `src/main.ts` unless the code genuinely belongs there
- inspect relevant Lichess source first when the task affects analysis-board behavior, move tree behavior, engine behavior, review workflow, board UI behavior, or other Lichess-aligned systems
- compare current Patzer Pro behavior, relevant Lichess behavior, and the actual gap before editing
- implement the smallest safe step instead of bundling features, speculative refactors, or architecture cleanup
- provide a short diagnosis before coding
- make the change unless blocked by a real ambiguity or missing dependency
- validate with build plus the most relevant task-specific checks
- provide a short manual test checklist with concrete user actions and expected results
- echo a `Prompt ID` field in the final report, matching the exact prompt instance metadata
- keep the `Task ID` field in the final report too, but use it only as the root task-family identifier
- report remaining risks, limitations, or unvalidated areas clearly

The final prompt must be concise, direct, and action-oriented.
Do not pad it with general coaching, duplicated policy, or explanations of why prompts matter.

When possible, the final prompt should name the actual Patzer Pro files or directories you found while inspecting.
If relevant Lichess files are identifiable from inspection, name them too.
If they are not yet identifiable, instruct Claude Code to locate them before deciding implementation details.

The final prompt should tell Claude Code to use this output shape:
- prompt id
- task id
- parent prompt id, if applicable
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files, if applicable
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks

For the manual test checklist, the final prompt should tell Claude Code to:
- list concrete actions a human can perform in the app
- state the expected result for each action
- keep the checklist tightly scoped to the implemented change
- include edge-case checks only when they are directly relevant

Output requirements:
- output only the final Claude Code prompt
- wrap the entire prompt in a single fenced Markdown code block
- do not include commentary or explanation before or after the code block
- treat the user's task description as intent, not as guaranteed implementation truth
- place the prompt identifier near the top so it can be copied into `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_LOG.md`
- place the source document and source step near the top so the prompt can be traced back to the planning record it came from
- use this metadata header shape near the top of the prompt:
  - `Prompt ID: CCP-###`
  - `Task ID: CCP-###`
  - `Parent Prompt ID: CCP-###` if this is a follow-up fix prompt
  - `Source Document: docs/...`
  - `Source Step: ...`
- for follow-up fix prompts:
  - `Prompt ID` is the unique follow-up id, such as `CCP-013-F1`
  - `Task ID` remains the root task family id, such as `CCP-013`
  - `Parent Prompt ID` should point to the reviewed prompt being fixed
- tell Claude Code to repeat the same `Prompt ID` field in its final report
- tell Claude Code to include the `Task ID` field in its final report as the root task family id
- append the full prompt to `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_QUEUE.md` when generating it
- add a matching item to the top `Queue Index` in `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_QUEUE.md` at creation time
- add a matching unchecked entry to `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_LOG.md` at creation time
- add a matching unchecked `- [ ] CCP-### - Short Task Title` line to the top checklist index in `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_LOG.md` at creation time

My rough task description follows:
