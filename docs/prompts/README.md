# Prompt Workflow

This directory holds the repo-local Claude prompt workflow for Patzer Pro.

This workflow now uses:
- one canonical registry file
- one prompt body file per prompt
- generated Markdown reports for human browsing
- a generated HTML dashboard for easier local browsing

Do not hand-edit the generated reports.

## Start Here

Before doing any prompt-workflow action, re-read:
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/README.md`
- `/Users/leftcoast/Development/PatzerPatzer/AGENTS.md`
- `/Users/leftcoast/Development/PatzerPatzer/CLAUDE.md`

If the action is prompt creation, also re-read:
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CODEX_PROMPT_INSTRUCTIONS.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/codexinstructionstopromptclaude.md`

If the action is review, also re-read:
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/code-review.md`

If the action is manager-prompt creation, also re-read:
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/manager-batch.md`

## Coordination Gate

For any non-trivial implementation, refactor, or review task in this thread:
- the first assistant message must be only:
  - `Is Claude Code currently running, and if so reply with the exact Claude Code prompt; otherwise reply ready.`
- send that question as a normal visible assistant chat message, not commentary and not a collapsible work update
- do not inspect files, run tools, review code, or edit the repo before the user answers
- do not bury that question inside a progress update or any other mixed message
- if the user has not replied with either the active Claude Code prompt or `ready`, remain blocked

## Canonical Files

The source of truth is:
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/prompt-registry.json`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/items/CCP-###.md`

Generated user-facing reports are:
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_QUEUE.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_LOG.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_HISTORY.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/dashboard.html`

Meaning:
- the registry is the canonical machine-readable state
- each prompt body lives once in `docs/prompts/items/`
- queue/log/history are generated browsing reports for humans

The user-viewable list works like this:
- `CLAUDE_PROMPT_QUEUE.md` shows prompts whose `queueState` is still pending or run-but-unreviewed
- `CLAUDE_PROMPT_LOG.md` shows the full registry as a review-status dashboard
- `CLAUDE_PROMPT_HISTORY.md` shows the full archived prompt text plus status metadata
- `dashboard.html` shows the same registry in a local browser-friendly view with index-plus-detail browsing

If the generated reports disagree with the registry, fix the registry and regenerate. Do not patch the generated reports directly.

## Commands

Use:

```sh
npm run prompt:start -- CCP-###
```

to atomically mark a prompt as started:
- set `queueState` to `queued-started`
- set `startedAt` if it is missing
- set `claudeUsed` to `true`
- regenerate queue/log/history
- regenerate the HTML dashboard
- run the prompt audit

Startup command rule:
- use the exact plain command form `npm run prompt:start -- <PROMPT_ID>`
- do not omit the `--` argument separator
- do not replace the required startup step with a piped or truncated variant like `| tail -5`
- if shortened terminal output is desired later, keep that as a separate optional manual step, not the required prompt startup command

Use:

```sh
npm run prompts:generate
```

to regenerate the queue/log/history reports from the registry.

Use:

```sh
npm run prompts:dashboard
```

to regenerate the standalone HTML dashboard from the same registry.

Use:

```sh
npm run prompts:refresh
```

to run the standard full refresh:
- regenerate queue/log/history
- regenerate the HTML dashboard
- run the prompt audit

Use:

```sh
npm run audit:prompts
```

to verify:
- registry structure is valid
- prompt body files exist
- manager/child relationships are valid
- generated docs match the checked-in docs exactly

Use:

```sh
npm run prompts:migrate
```

only for one-time migration or repair work when converting old markdown-tracked prompt state into the registry model.

## Prompt Data Model

Each prompt record in `prompt-registry.json` should include the fields the generator and audit expect, including:
- `id`
- `title`
- `taskId`
- `parentPromptId`
- `batchPromptIds`
- `sourceDocument`
- `sourceStep`
- `task`
- `executionTarget`
- `createdBy`
- `createdAt`
- `startedAt`
- `claudeUsed`
- `status`
- `reviewOutcome`
- `reviewIssues`
- `queueState`
- `queueSummary`
- `promptFile`
- `commit`
- `notes`
- `kind`

Important state fields:
- `status`
  - `created`
  - `reviewed`
- `reviewOutcome`
  - `pending`
  - `passed`
  - `passed with notes`
  - `issues found`
  - `needs rework`
- `queueState`
  - `not-queued`
  - `queued-pending`
  - `queued-started`
  - `queued-run`

State ownership rules:
- canonical review status lives in `prompt-registry.json`
- queue/log/history derive from the registry
- prompt body text lives in the per-prompt item file, not in the registry itself

## Prompt Types

There are two main tracked prompt categories:

- Normal runnable prompts
  - implementation prompts meant to be executed later
  - usually appear in the queue when pending review

- Manager prompts
  - controller prompts that run a batch of child prompts
  - tracked in the registry like any other prompt
  - not normally added to the runnable queue unless the user explicitly wants that

## ID Rules

Every tracked prompt uses:
- `Prompt ID`
- `Task ID`

Default format:
- `CCP-###`

Follow-up fix format:
- original prompt: `CCP-013`
- first fix prompt: `CCP-013-F1`
- second fix prompt: `CCP-013-F2`

Rules:
- `Prompt ID` is the unique prompt instance id
- `Task ID` is the root task-family id
- for a normal root prompt, `Prompt ID` and `Task ID` are the same
- for a follow-up fix prompt:
  - `Prompt ID` uses the next `-F#`
  - `Task ID` stays on the root family id
  - `Parent Prompt ID` points to the prompt being fixed

## Prompt Creation Workflow

When creating a normal runnable prompt:

1. Re-read the workflow docs listed in `Start Here`
2. Ground the prompt in the real repo first
3. Assign the next correct `Prompt ID` and `Task ID`
4. Create or update the prompt body file in `docs/prompts/items/`
5. Add or update the prompt record in `prompt-registry.json`
6. Set:
   - `status: created`
   - `reviewOutcome: pending`
   - `queueState: queued-pending` for normal queued prompts
   - `createdBy` to the creating tool or person, for example `Codex`
   - `createdAt` to the creation timestamp in ISO datetime form
7. Run `npm run prompts:refresh`

Do not stop after only generating prompt text in chat.

## Prompt Execution Workflow

When a queued prompt is actually run:

1. Re-read the workflow docs listed in `Start Here`
2. Run:
   - `npm run prompt:start -- <PROMPT_ID>`
   - use that exact command form; do not omit `--` and do not pipe it through helpers like `tail`
3. Leave:
   - `status: created`
   - `reviewOutcome: pending`
4. Continue implementation only after the prompt-start command succeeds

Execution-state rule:
- `queued-started` means the prompt has officially begun and should show up as started in the dashboard
- `queued-run` remains a valid legacy state for older prompt records that were marked as run before this workflow change
- review is the only step that removes a prompt from the queue

## Manager Prompt Creation Workflow

When creating a manager prompt:

1. Re-read the workflow docs listed in `Start Here`
2. Ground the manager in the real queue/log state
3. Assign the next correct `Prompt ID` and `Task ID`
4. Create the prompt body file in `docs/prompts/items/`
5. Add a registry entry with:
   - `kind: manager`
   - exact `batchPromptIds`
   - `status: created`
   - `reviewOutcome: pending`
   - `queueState: not-queued`, unless the user explicitly asked to queue manager prompts
6. Run `npm run prompts:refresh`

Manager prompts are tracked artifacts, but not normal queued child prompts by default.

## Review Workflow

When reviewing a prompt:

1. Re-read the workflow docs listed in `Start Here`
2. Find the matching registry entry and prompt body file
3. Review the actual code changes using `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/code-review.md`
4. Complete prompt closeout as one atomic registry update:
   - set `status: reviewed`
   - set `reviewOutcome`
   - set `reviewIssues`
   - set `queueState: not-queued`
   - update `notes`, `commit`, or `claudeUsed` if needed
5. Run `npm run prompts:refresh`
7. Only after the audit passes is review complete

Manager review rule:
- if the reviewed prompt is a manager prompt with `batchPromptIds`, treat review of that manager as review of the listed child prompts too, unless the user explicitly asks for `manager-only`
- review and close out the child prompts first
- only then review and close out the manager prompt itself
- do not mark a manager prompt reviewed while its child prompts remain unreviewed

## Follow-Up Fix Workflow

If a reviewed prompt needs another fix pass:

1. Re-read the workflow docs listed in `Start Here`
2. Reuse the same root `Task ID`
3. Assign the next `-F#` `Prompt ID`
4. Set `Parent Prompt ID` to the prompt being fixed
5. Treat the new prompt as a fresh created prompt in:
   - `docs/prompts/items/`
   - `prompt-registry.json`
6. Run `npm run prompts:refresh`

Natural-language requests like these should usually trigger this workflow:
- `I have a bug to fix with CCP-013`
- `I want to fix something from this task`
- `this needs a follow-up fix`

## Review Outcome Labels

Use:
- `passed`
- `passed with notes`
- `issues found`
- `needs rework`

Meaning:
- `passed`
  - reviewed cleanly
- `passed with notes`
  - acceptable, but with minor caveats
- `issues found`
  - concrete problems were identified
- `needs rework`
  - not ready to accept as-is

## Documentation Sync Rule

Any time the prompt-id process, registry structure, generation flow, manager behavior, review behavior, or indexing rules change:

1. Update this README
2. Update every supporting prompt doc that now disagrees
3. Re-read the updated docs
4. Regenerate and audit

Do not leave the new rule documented in only one place.

## Template Map

Use the template that matches the task:
- `bugfix.md`
  - diagnosing and fixing a specific bug
- `new-feature.md`
  - adding a new feature or workflow in the smallest safe step
- `refactor-step.md`
  - extraction work, ownership cleanup, `main.ts` reduction
- `lichess-parity.md`
  - Lichess-aligned behavior or structure work
- `code-review.md`
  - findings-first review workflow
- `manager-batch.md`
  - Claude batch-runner manager prompts

## Output Convention For Prompt Generation

When Codex is asked to return a final prompt:
- return only the prompt content
- wrap it in a single fenced Markdown code block unless the user explicitly asks for another format
- do not add commentary before or after the code block

## Related Files

These supporting docs must stay aligned with this README:
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CODEX_PROMPT_INSTRUCTIONS.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/codexinstructionstopromptclaude.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/code-review.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/manager-batch.md`
