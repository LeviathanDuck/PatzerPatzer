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
