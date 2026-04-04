# Prompt Review Process

Use this file for:
- prompt completion
- prompt review closeout
- fix linkage
- manual checklist expectations

## Completion

Every prompt body includes a `## Lifecycle` section with the exact `prompt:start` and
`prompt:complete` commands pre-filled at creation time. The executor must run those
commands — they are not optional.

If errors occurred during execution, pass `--errors` to `prompt:complete`:

```sh
npm run prompt:complete -- <PROMPT_ID> --errors "brief description" --checklist "- [ ] item one|- [ ] item two"
```

Manual checklist items must be:
- concrete user actions
- paired with expected results
- useful to a human reviewer

If a prompt body is missing its `## Lifecycle` section, that is a creation-time defect.
Run `prompt:start` and `prompt:complete` manually using the commands in `PROMPT_REGISTRY_README.md`,
and note the omission so the creation process can be corrected.

### Output truncation rule (CRITICAL)

Never pipe lifecycle commands through `head`, `tail`, or any output limiter:

```sh
# WRONG — kills prompts:refresh before it runs
npm run prompt:complete -- CCP-### --checklist "..." | head -10

# CORRECT — let the full output run
npm run prompt:complete -- CCP-### --checklist "..."
```

Why this matters: `prompt:complete`, `prompt:start`, and `prompt:skip` end by calling `npm run prompts:refresh`
as a subprocess. Piping through `head` sends SIGPIPE when the line limit is reached, killing the
node process before `prompts:refresh` runs. The registry JSON write happens early and succeeds,
but the dashboard HTML is never regenerated — leaving the dashboard showing stale state (e.g.,
"READY TO RUN" or "STARTED: NOT COMPLETED") even though the registry is correct.

If this happens: run `npm run prompts:refresh` manually (no pipe) to fix the dashboard.

## Review Closeout

Use:

```sh
npm run prompt:review -- <PROMPT_ID> --passed --reviewed-by Codex --review-method full-review
```

Review closeout must:
- set `status: reviewed`
- set `reviewOutcome`
- set `reviewedAt`
- set `reviewedBy`
- set `reviewMethod`
- set `queueState: not-queued`

## Skip / Abandon Before Execution

If a prompt is still queued but should not be run, use:

```sh
npm run prompt:skip -- <PROMPT_ID> [--reason "..."]
```

This is for unrun queued prompts only.

Expected result:
- `status: skipped`
- `queueState: not-queued`
- prompt disappears from queue / next-up / available prompt surfaces

## Review Outcomes

Use:
- `passed`
- `passed with notes`
- `issues found`
- `needs rework`
- `issues resolved`

## Fix Linkage

If a prompt exists specifically to fix issues from an earlier reviewed prompt, complete it
with:

```sh
npm run prompt:complete -- <FIX_PROMPT_ID> --fixes <ORIGINAL_PROMPT_ID> --checklist "- [ ] item one|- [ ] item two"
```

This links:
- `fixesPromptId`
- `fixedByPromptId`
- and updates the original review outcome to `issues resolved` when appropriate

## Review Rules

- do not hand-edit generated queue/log/history docs
- do not mark a manager reviewed while its child prompts remain unreviewed
- do not review a prompt still in `status: reserved`
- do not start, complete, or review a prompt in `status: superseded`
- do not start, complete, or review a prompt in `status: skipped`
- if the prompt-related request is ambiguous, clarify before mutating review state

## Dashboard Prompt Editing

The prompt detail view in the dashboard may overwrite an unrun prompt body directly.

Rules:
- dashboard saves are allowed only before a prompt has been run
- dashboard save writes the real prompt file and regenerates the full prompt workflow artifacts
- dashboard save creates a hidden superseded reference archive for the replaced body
- the active prompt keeps its lifecycle state and gains `lastEditedAt`
- superseded archived records are reference-only and must not be treated as runnable work
