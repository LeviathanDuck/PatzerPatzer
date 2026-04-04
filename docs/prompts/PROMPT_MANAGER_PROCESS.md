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

## Default Use Rule

Manager prompts are the default execution mechanism whenever a user asks an agent to run
multiple tracked prompts in sequence.

That means:
- if the request is effectively “run several prompts in order”, agents must normalize it to the manager workflow
- the user does not need to say `manager` explicitly
- if a suitable manager already exists, use it
- if no suitable manager exists, create one before executing the child prompts
- only skip the manager workflow when the user explicitly says to handle the prompts individually

Examples that must trigger the manager workflow:
- `run CCP-120, CCP-121, and CCP-122 in order`
- `do these prompts one after another`
- `execute these prompts sequentially`
- `run all of these prompts`

## Creation Flow

1. reserve a root id with `kind manager`
2. identify the exact ordered child prompt ids that the manager owns
3. write the manager prompt body — must include a `## Lifecycle` section and a concrete execution/reporting structure (see below)
4. finalize it with exact child ids
5. keep it `not-queued` unless the user explicitly wants queued manager prompts

## Required Manager Body Structure

Every manager prompt body must include all of the following:
- `## Summary`
- `## Child Prompt Order`
- `## Execution Rules`
- `## Final Report`
- `## Validation`
- `## Lifecycle`

The manager body must explicitly identify:
- each child prompt id in execution order
- that each child prompt file must be read before execution
- that each child must run its own lifecycle commands
- that the manager must stop on child failure instead of claiming success
- when the manager should finish with clean `prompt:complete` vs `prompt:complete --errors`

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

If one or more child prompts failed, stopped early, or completed with unresolved issues, use:
\```sh
npm run prompt:complete -- CCP-### --errors "brief description of which child prompt failed or stopped and why" --checklist "- [ ] Executed child prompts in the documented order|- [ ] Final report states which child prompt failed or stopped|- [ ] Remaining child prompt status is reported accurately"
\```
```

## Required Manager Rules

Manager prompts must:
- not include themselves in the child list
- execute children in the exact listed order
- not reorder prompts
- read each child prompt body file before executing that child
- not create new prompts during execution unless the workflow explicitly requires it
- require every child prompt to run its own lifecycle commands
- run `prompt:start` and `prompt:complete` for the manager itself, in addition to the lifecycle commands for each child prompt
- stop immediately when a child prompt fails, completes with `--errors`, or cannot be completed cleanly
- never claim manager success if one or more required child prompts failed or were left unresolved
- NEVER pipe any lifecycle command (`prompt:start`, `prompt:complete`) through `head`, `tail`, or any output limiter — doing so kills the `prompts:refresh` subprocess and leaves the dashboard HTML stale; always let the full output run
- not allow an agent to bypass the manager workflow for a multi-prompt sequential request unless the user explicitly requested individual handling

## Completion Rules

Use clean `prompt:complete` for the manager only when:
- every listed child prompt was executed in order
- every listed child prompt completed through its own lifecycle
- no required child prompt ended in an unresolved error state
- the final manager report accurately summarizes the completed child results

Use `prompt:complete --errors` for the manager when:
- any child prompt failed to execute
- any child prompt completed with unresolved issues
- execution stopped early before all required child prompts ran
- the manager cannot truthfully report that the full ordered batch completed cleanly

## Final Report Rules

Every manager prompt must require a final report with:
- the manager prompt id
- the ordered child prompt list
- each child prompt result:
  - completed cleanly
  - completed with errors
  - not run
- the exact stopping point if execution halted early
- any remaining unresolved issues or follow-up prompts created

The final report must not collapse child results into a vague batch summary.

## Review Rules

Default manager review behavior:
- review child prompts too unless the user explicitly asked for `manager-only`
- close out children first
- only then close out the manager

Do not mark a manager prompt reviewed while one or more child prompts remain unreviewed.

## Standard Manager Template

Use this as the default body shape for new manager prompts:

```md
## Summary

Execute the listed child prompts in exact order.

## Child Prompt Order

1. `CCP-###`
2. `CCP-###`

Before executing each child:
- read that child prompt body file fully
- run that child prompt's lifecycle commands

## Execution Rules

- execute children in the exact listed order
- do not reorder children
- do not skip ahead
- stop immediately if a child fails or completes with unresolved errors
- do not claim manager success if a required child did not complete cleanly

## Final Report

Report:
- manager prompt id
- ordered child prompt list
- result for each child:
  - completed cleanly
  - completed with errors
  - not run
- exact stopping point if execution halted early
- any unresolved issues or follow-up prompts created

## Validation

- child 1 executed through its lifecycle
- child 2 executed through its lifecycle
- children were run in the documented order
- final report states child-by-child outcomes accurately

## Lifecycle

Before executing any child prompts, mark this manager as started:
\```sh
npm run prompt:start -- CCP-###
\```

After all child prompts are complete, mark the manager as done:
\```sh
npm run prompt:complete -- CCP-### --checklist "- [ ] Child prompts completed in order|- [ ] Child lifecycle commands were run|- [ ] Final report lists child-by-child outcomes accurately"
\```

If errors or issues were encountered during execution, use `--errors` instead:
\```sh
npm run prompt:complete -- CCP-### --errors "brief description of which child failed or stopped and why" --checklist "- [ ] Executed child prompts in the documented order|- [ ] Final report states which child failed or stopped|- [ ] Remaining child prompt status is reported accurately"
\```
```
