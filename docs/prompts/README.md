# Prompt Templates

These are repo-local prompt templates for Codex and Claude workflows.

Use them when you want reusable task framing inside the repository without relying on Codex runtime skills.

Start each session by pointing the model at:
- `/Users/leftcoast/Development/PatzerPatzer/AGENTS.md`
- `/Users/leftcoast/Development/PatzerPatzer/CLAUDE.md`

Then use the template that matches the task:
- `code-review.md` — review local changes with findings-first output and suggested manual tests
- `lichess-parity.md` — Lichess-aligned behavior or structure work
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
- assign each prompt a stable identifier in the form `CCP-###`
- include that identifier near the top of the generated prompt
- include a matching `Task ID` near the top of the generated prompt so Claude can echo it in the final report
- include `Source Document` and `Source Step` metadata near the top of the generated prompt
- when a new prompt is generated, append the full prompt to `CLAUDE_PROMPT_QUEUE.md`
- when appending to `CLAUDE_PROMPT_QUEUE.md`, place a scan-friendly `## CCP-### - short task title` heading immediately before the fenced prompt block
- use plain fenced Markdown blocks with no language tag for queue entries and log entries
- when a new prompt is generated, also add an unchecked entry to `CLAUDE_PROMPT_LOG.md`
- when appending to `CLAUDE_PROMPT_LOG.md`, place a scan-friendly `## CCP-### - short task title` heading immediately before the fenced log entry block
- when appending to `CLAUDE_PROMPT_HISTORY.md`, use a plain fenced block with no language tag for the stored full prompt text
- use the log checkbox only to indicate whether review happened:
  - checked means reviewed
  - unchecked means created/logged but not reviewed yet
- record review quality separately with `Review outcome`, for example:
  - `passed`
  - `passed with notes`
  - `issues found`
  - `needs rework`
- when doing a code review, remove the matching prompt from `CLAUDE_PROMPT_QUEUE.md`
- when doing a code review, update the matching `CCP-###` item in `CLAUDE_PROMPT_LOG.md`
- if the review is for a prompt id but the exact queued prompt text cannot be found, say so explicitly and update only the log entry with that uncertainty noted
- when a code review finds a real current issue worth tracking, explicitly ask whether it should be added to `/Users/leftcoast/Development/PatzerPatzer/docs/KNOWN_ISSUES.md`
