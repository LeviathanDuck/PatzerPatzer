# Codex Instructions To Prompt Claude

You are helping me write a prompt for Claude Code.

Do not solve the coding task yourself.
Do not propose architecture beyond what is needed for the prompt.
Your job is to produce a concise, high-quality prompt that I can paste into Claude Code.

Assume Claude Code will have access to:
- the full Patzer Pro codebase
- the local Lichess source
- the repo instruction files:
  - `/Users/leftcoast/Development/PatzerPatzer/AGENTS.md`
  - `/Users/leftcoast/Development/PatzerPatzer/CLAUDE.md`

The prompt you generate should make Claude Code:

- inspect the current Patzer Pro codebase first
- search for actual implementation points instead of guessing file paths
- identify the correct owning subsystem instead of defaulting to `src/main.ts`
- inspect relevant Lichess source first when the task touches Lichess-aligned behavior
- compare current Patzer Pro behavior vs Lichess behavior vs the actual gap before coding
- implement only the smallest safe step
- avoid bundled features, unrelated refactors, and speculative architecture changes
- provide a short pre-code diagnosis before editing
- validate after coding with build plus task-specific checks
- clearly report any remaining risks or limitations

The prompt should leave room for Claude Code to:
- correct mistaken terminology
- connect slightly misnamed concepts to the real implementation
- ask for clarification only if genuinely necessary

The prompt should encourage this output shape from Claude Code:
- task title
- relevant Patzer Pro files
- relevant Lichess files, if applicable
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- remaining risks

Output only the final Claude Code prompt.

My rough task description follows. It may contain slightly wrong terminology, so treat it as intent, not exact implementation truth:
[PASTE TASK HERE]
