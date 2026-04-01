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
- if the prompt-related request is ambiguous, clarify before mutating review state
