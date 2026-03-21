# Prompt Templates

These are repo-local prompt templates for Codex and Claude workflows.

Use them when you want reusable task framing inside the repository without relying on Codex runtime skills.

Start each session by pointing the model at:
- `/Users/leftcoast/Development/PatzerPatzer/AGENTS.md`
- `/Users/leftcoast/Development/PatzerPatzer/CLAUDE.md`

When Codex is creating prompts, also read:
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CODEX_PROMPT_INSTRUCTIONS.md`

Then use the template that matches the task:
- `code-review.md` — review local changes with findings-first output and suggested manual tests
- `lichess-parity.md` — Lichess-aligned behavior or structure work
- `manager-batch.md` — create a Claude Code batch-manager prompt that runs the next contiguous queued prompt range
- `refactor-step.md` — extraction work, `main.ts` reduction, coupling reduction
- `bugfix.md` — diagnosing and fixing a specific bug
- `new-feature.md` — adding a new feature or workflow in the smallest safe step

These templates are intentionally short.
They should reinforce repo rules, not replace them.

Formatting convention for prompt-generation workflows:
- when Codex is asked to return a final prompt for Claude Code, return only the prompt content
- wrap the entire prompt in a single fenced Markdown code block unless the user explicitly asks for plain text instead
- do not add commentary before or after the code block
- prompt-generation templates should also ask Claude Code to include a short manual test checklist with concrete actions and expected results for the implemented change

Prompt tracking convention:
- track Claude Code prompts in:
  - `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_QUEUE.md`
  - `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_LOG.md`
  - `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_HISTORY.md`
- for Codex-created prompts, follow the extra coordination and formatting rules in:
  - `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CODEX_PROMPT_INSTRUCTIONS.md`
- assign each prompt a stable identifier in the form `CCP-###`
- when a new prompt is a follow-up fix for a previously reviewed prompt, keep the same task family id and add a follow-up modifier to the prompt id:
  - original prompt: `CCP-013`
  - first follow-up fix prompt: `CCP-013-F1`
  - second follow-up fix prompt: `CCP-013-F2`
- use `-F#` as the modifier for follow-up fix prompts because it stays readable, sorts predictably, and makes the relationship explicit
- include that identifier near the top of the generated prompt
- include a matching `Task ID` near the top of the generated prompt for family tracking
- instruct Claude to echo the `Prompt ID` in the final report so the exact prompt instance is reported back after execution
- for follow-up fix prompts:
  - `Prompt ID` should be the unique follow-up id, such as `CCP-013-F1`
  - `Task ID` should stay the root family id, such as `CCP-013`
  - include `Parent Prompt ID`, such as `CCP-013`
- include `Source Document` and `Source Step` metadata near the top of the generated prompt
- when a new prompt is generated, append the full prompt to `CLAUDE_PROMPT_QUEUE.md`
- when a new prompt is generated, also add a matching item to the top `Queue Index` in `CLAUDE_PROMPT_QUEUE.md`
- each queue-index item should include:
  - first line: `- CCP-###: Short Task Title`
  - second line: an indented bullet with a brief one-line description of what the prompt is meant to target
  - one blank line between queue-index items for readability
- when appending to `CLAUDE_PROMPT_QUEUE.md`, place a scan-friendly `## prompt-id - short task title` heading immediately before the fenced prompt block
- use plain fenced Markdown blocks with no language tag for queue entries and log entries
- when a new prompt is generated, also add an unchecked entry to `CLAUDE_PROMPT_LOG.md`
- when a new prompt is generated, also add a matching unchecked prompt-id-plus-title item to the top checklist index in `CLAUDE_PROMPT_LOG.md`
- when appending to `CLAUDE_PROMPT_LOG.md`, place a scan-friendly `## prompt-id - short task title` heading immediately before the fenced log entry block
- when appending to `CLAUDE_PROMPT_HISTORY.md`, use a plain fenced block with no language tag for the stored full prompt text
- use the log checkbox only to indicate whether review happened:
  - checked means reviewed
  - unchecked means created/logged but not reviewed yet
- keep the top-of-file prompt-id checklist index in `CLAUDE_PROMPT_LOG.md` in sync with the detailed log entries:
  - add `- [ ] CCP-### - Short Task Title` when the prompt is created
  - flip it to `- [x] CCP-### - Short Task Title` when the prompt is reviewed
  - keep the index compact and title-based, with no review notes
- record review quality separately with `Review outcome`, for example:
  - `passed`
  - `passed with notes`
  - `issues found`
  - `needs rework`
- when doing a code review, remove the matching prompt from `CLAUDE_PROMPT_QUEUE.md`
- when doing a code review, also remove the matching item from the top `Queue Index` in `CLAUDE_PROMPT_QUEUE.md`
- when doing a code review, update the matching `CCP-###` item in `CLAUDE_PROMPT_LOG.md`
- when doing a code review, also update the matching top checklist item in `CLAUDE_PROMPT_LOG.md` from unchecked to checked
- if a reviewed prompt needs another fixing pass and the user asks for a follow-up prompt, create a new prompt entry using the same root `Task ID` with the next `-F#` modifier on `Prompt ID`
- treat natural-language follow-up requests as follow-up fix prompts by default when they clearly refer to an existing reviewed `CCP-###`, for example:
  - `I have a bug to fix with CCP-013`
  - `I want to fix something from CCP-013`
  - `This needs a bug-fix prompt from CCP-013`
  - `I have a bug to fix with this` when the current task family is clear from context
- in those cases:
  - use the next `-F#` prompt id in that family
  - keep `Task ID` as the root family id
  - set `Parent Prompt ID` to the prompt being fixed
- if the review is for a prompt id but the exact queued prompt text cannot be found, say so explicitly and update only the log entry with that uncertainty noted
- when a code review finds a real current issue worth tracking, explicitly ask whether it should be added to `/Users/leftcoast/Development/PatzerPatzer/docs/KNOWN_ISSUES.md`
