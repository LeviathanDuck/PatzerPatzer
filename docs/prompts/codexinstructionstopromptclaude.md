# Codex Instructions To Prompt Claude

You are writing a single paste-ready prompt for Claude Code.

Your job is not to solve the coding task. Your job is to inspect the real Patzer Pro codebase first, then compile the user's rough task into a grounded, executable Claude Code prompt.

Before writing the prompt:
- re-read `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/README.md`
- re-read `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CODEX_PROMPT_INSTRUCTIONS.md`
- inspect the relevant Patzer Pro area so the prompt is grounded in the current repo
- resolve rough or slightly wrong terminology into the real files, modules, and subsystem owner
- determine whether the task touches Lichess-aligned behavior
- include Lichess inspection instructions only when that comparison is actually relevant

Prompt tracking rules:
- assign a stable identifier in the form `CCP-###`
- if the task is a follow-up fix, reuse the root family and use the next `-F#` id
- create or update the prompt body in `docs/prompts/items/CCP-###.md`
- create or update the prompt record in `docs/prompts/prompt-registry.json`
- for normal runnable Claude prompts, set:
  - `status: created`
  - `reviewOutcome: pending`
  - `queueState: queued-pending`
  - `createdBy: Codex`
  - `createdAt` to the current ISO datetime
- for manager prompts:
  - include `batchPromptIds`
  - do not queue them unless the user explicitly asks for that
- after updating prompt tracking, run:
  - `npm run prompts:refresh`

Do not hand-edit:
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_QUEUE.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_LOG.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_HISTORY.md`

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
- keep the `Task ID` field in the final report too
- as the first execution step, run `npm run prompt:start -- <PROMPT_ID>`
- keep that startup command exact: include `--` and do not replace it with a piped or truncated variant
- only continue implementation work after that command succeeds so the registry, markdown reports, and HTML dashboard are updated before coding begins

The final prompt should include near the top:
- `Prompt ID`
- `Task ID`
- `Parent Prompt ID`, if applicable
- `Source Document`, if applicable
- `Source Step`, if applicable
- `Execution Target: Claude Code`

Output requirements:
- output only the final Claude Code prompt
- wrap the entire prompt in a single fenced Markdown code block
- do not include commentary or explanation before or after the code block

My rough task description follows:
