# Prompt Manager Process

Use this file for:
- creating manager prompts
- reasoning about manager-child ownership
- manager execution rules

## What A Manager Prompt Is

A manager prompt is a tracked runner/controller prompt that executes a set of child prompts.

It must:
- have its own `Prompt ID`
- have its own `Task ID`
- record exact `batchPromptIds`
- never recurse into itself

## Creation Flow

1. reserve a root id with `kind manager`
2. write the manager prompt body — must include a `## Lifecycle` section (see below)
3. finalize it with exact child ids
4. keep it `not-queued` unless the user explicitly wants queued manager prompts

## Lifecycle Section (required in manager prompt bodies)

Manager prompt bodies must include a `## Lifecycle` section, just like regular prompts.

Format:

```md
## Lifecycle

Before executing any child prompts, mark this manager as started:
\```sh
npm run prompt:start -- CCP-###
\```

After all child prompts are complete, mark the manager as done:
\```sh
npm run prompt:complete -- CCP-### --checklist "- [ ] All child prompts completed|- [ ] All child prompt checklists verified"
\```
```

## Required Manager Rules

Manager prompts must:
- not include themselves in the child list
- execute children in the exact listed order
- not reorder prompts
- not create new prompts during execution unless the workflow explicitly requires it
- run `prompt:start` and `prompt:complete` for the manager itself, in addition to the lifecycle commands for each child prompt

## Review Rules

Default manager review behavior:
- review child prompts too unless the user explicitly asked for `manager-only`
- close out children first
- only then close out the manager

Do not mark a manager prompt reviewed while one or more child prompts remain unreviewed.
