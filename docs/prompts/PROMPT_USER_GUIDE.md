# Prompt User Guide

You do not need exact magic words to trigger the prompt workflow.

These are preferred example phrasings, not required incantations.

## Create A New Prompt

Examples:
- `Create a prompt for Claude to ...`
- `Queue a prompt for ...`
- `Write a prompt to implement ...`

## Create A Follow-Up Fix Prompt

Examples:
- `Create a follow-up fix prompt for CCP-123 to ...`
- `Fix the bug from CCP-123`
- `There is a regression from CCP-123`

## Review Prompt Work

Examples:
- `Review CCP-123`
- `Check whether CCP-123 was completed correctly`
- `Verify this prompt`

## Create A Manager Prompt

Examples:
- `Create a manager prompt for CCP-120 through CCP-126`
- `Make a batch manager for these prompts`
- `Create one prompt to run all of these`

## Change The Workflow Itself

Examples:
- `Update our prompt workflow so that ...`
- `Change how prompt ids work`
- `Simplify the prompt process docs`
- `Change how prompts are tracked`

Default assumption:
- if you say `Update our prompt workflow so that ...`, agents must automatically apply the workflow-change propagation rule
- you do not need to add `and follow the workflow-change propagation rule`

To force the full workflow-change sweep, say:
- `Update our prompt workflow so that ... and follow the workflow-change propagation rule`
- `Change our prompt process and check every canonical prompt doc plus AGENTS.md and CLAUDE.md`
- `Audit and update the entire prompt workflow, not just one doc`

Those phrasings should trigger:
- reading every canonical prompt workflow doc
- checking both `AGENTS.md` and `CLAUDE.md`
- removing conflicting old wording
- explicitly reporting which files were checked and changed

When the workflow change involves prompt creation or dashboard labeling, the sweep should also
verify whether prompt taxonomy rules are clear across:
- allocator input
- registry `kind`
- registry `category`
- dashboard presentation

## Allow One-Off Untracked Code Work

Tracked prompts are the default for ALL code work — including small or one-line changes.

The agent will ask before making any code change that is not already covered by an active
tracked prompt. If you want to bypass that, say so explicitly.

Examples:
- `Do this as a one-off untracked code change`
- `Handle this without creating a tracked prompt`
- `Skip the gate for this one`

Note: each new request in the same session is a fresh gate check, even if a CCP prompt
is already running. The active prompt only covers work explicitly described in that prompt.

## Ask The Agent To Clarify

Examples:
- `If this request is ambiguous, ask before changing the workflow`
- `If this could mean more than one process, clarify first`
