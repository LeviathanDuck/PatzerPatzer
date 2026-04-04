# Request User Guide

This is the shared user-facing phrasing guide for tracked work in Patzer Pro.

Use this guide when you want to ask an agent to:
- create or review prompts
- log bugs or request features as tracked work
- create or audit sprints
- change the prompt or sprint workflow itself

You do not need exact magic words.

These are preferred example phrasings, not required incantations.

## General Rule

Tracked prompts are the default for all code work.

If you ask for a bug fix, feature, refactor, or behavior change and do not explicitly say
otherwise, the agent should treat that as tracked work and either:
- attach the work to an existing `CCP-###`
- create a new tracked prompt
- ask whether you want a tracked prompt before coding

## Create A New Prompt

Examples:
- `Create a prompt for Claude to ...`
- `Queue a prompt for ...`
- `Write a tracked prompt to implement ...`
- `Create a tracked prompt for this code change`

## Create A Follow-Up Fix Prompt

Examples:
- `Create a follow-up fix prompt for CCP-123 to ...`
- `Fix the bug from CCP-123`
- `There is a regression from CCP-123`
- `Create the next fix prompt for CCP-123`

Default interpretation:
- if the current task family is clear, agents should keep the same root `CCP-###` family and use the next `-F#` prompt id automatically

## Review Prompt Work

Examples:
- `Review CCP-123`
- `Check whether CCP-123 was completed correctly`
- `Verify this prompt`
- `Review this tracked prompt and update its status`

## Edit An Existing Unrun Prompt

Examples:
- `Open this prompt in the dashboard and refine the body`
- `Edit this queued prompt before it runs`
- `Update the prompt wording but keep the same CCP id`

Default interpretation:
- only unrun prompts should be edited this way
- dashboard editing keeps the same active `CCP-###` id
- the old version is archived as a hidden superseded reference

## Skip A Queued Prompt

Examples:
- `Skip CCP-123`
- `Remove this prompt from the queue`
- `Do not run this prompt`
- `Mark this queued prompt as skipped`

Default interpretation:
- only unrun queued prompts should be skipped this way
- skipped prompts remain tracked but must never appear as runnable queue work again

## Log A Bug As Tracked Work

Examples:
- `Create a tracked bugfix prompt for this issue`
- `Log this bug in our prompt workflow and queue the fix`
- `Turn this regression into a tracked prompt`
- `Create the prompt needed to fix this bug`

Best-practice wording:
- include the bug symptoms
- include where it happens
- include the expected behavior
- include screenshots, reproduction steps, or affected files when known

## Request A Feature As Tracked Work

Examples:
- `Create a tracked feature prompt for ...`
- `Turn this feature idea into a prompt`
- `Queue the implementation prompt for this feature`
- `Create the prompt needed to ship this behavior`

Best-practice wording:
- include the user-facing goal
- include constraints or non-goals
- include relevant docs, audits, or reference behavior
- say whether this should become a sprint instead of a one-off prompt

## Create A Manager Prompt

Examples:
- `Create a manager prompt for CCP-120 through CCP-126`
- `Make a batch manager for these prompts`
- `Create one prompt to run all of these`
- `Run these prompts in order`
- `Do these prompts one after another`
- `Execute these prompts sequentially`

Default interpretation:
- if you ask an agent to run multiple tracked prompts in sequence, the agent should treat that as a manager-prompt request by default
- you do not need to say `manager` explicitly
- if you want to bypass that and handle each prompt individually, say so explicitly

What the manager should do by default:
- list the child prompts in exact execution order
- read each child prompt body before executing that child
- run each child prompt through its own lifecycle commands
- stop if a child fails or completes with unresolved errors
- report child-by-child outcomes at the end instead of only saying the batch finished

## Create Or Track A Sprint

Examples:
- `Create a sprint plan for this work`
- `Turn this into a sprint`
- `Track this sprint in the dashboard`
- `Create the prompts needed for this sprint and link them correctly`
- `Create the next prompts for the next available sprint phase`

Best-practice wording:
- include the sprint goal
- include the source sprint document when one already exists
- include whether prompts should be created now or whether you only want the sprint tracked first
- if the sprint already exists, use the sprint id or source document so linkage is unambiguous

## Audit A Sprint

Examples:
- `Audit this sprint against implementation`
- `What is actually done in this sprint`
- `What are the next best steps for this sprint`
- `Audit this sprint and normalize it to the current sprint workflow`

Default interpretation:
- sprint audits should compare the sprint doc, sprint registry, linked prompts, code evidence, and review findings
- sprint audits should update sprint tracking truth, not just produce prose

## Change The Workflow Itself

Examples:
- `Update our prompt workflow so that ...`
- `Update our sprint workflow so that ...`
- `Update our workflow for tracked prompts and sprints so that ...`
- `Change how prompt ids work`
- `Simplify the prompt process docs`
- `Change how prompts are tracked`

Default assumption:
- if you say `Update our prompt workflow so that ...`, agents must automatically apply the prompt workflow-change propagation rule
- if you say `Update our sprint workflow so that ...`, agents must automatically apply the sprint workflow-change propagation rule
- you do not need to add `and follow the workflow-change propagation rule`

To force the full workflow-change sweep, say:
- `Update our prompt workflow so that ... and follow the workflow-change propagation rule`
- `Update our sprint workflow so that ... and follow the workflow-change propagation rule`
- `Change our process and check every canonical workflow doc plus AGENTS.md and CLAUDE.md`
- `Audit and update the entire workflow, not just one doc`

Those phrasings should trigger:
- reading every affected canonical workflow doc
- checking both `AGENTS.md` and `CLAUDE.md`
- removing conflicting old wording
- explicitly reporting which files were checked and changed

When the workflow change involves prompt creation or dashboard labeling, the sweep should also
verify whether prompt taxonomy rules are clear across:
- allocator input
- registry `kind`
- registry `category`
- dashboard presentation

## Track And Run (Create + Execute Immediately)

When you want tracked work but don't want to wait — create the prompt and execute it
in the same conversation turn.

Examples:
- `Track and run`
- `Track and run it`
- `Tracked prompt, run it`
- `Create a prompt and run it`
- `Create and execute`
- `Queue it and run`
- `Log it and run`

Default interpretation:
- the agent creates a tracked prompt (reserve → write body → create → fix taxonomy)
  and then immediately starts and executes it in the same session
- the prompt still gets full registry tracking, lifecycle commands, and a checklist
- this is the preferred workflow for iterative design/build sessions where stopping
  to plan a separate execution pass would break the flow

This is different from:
- **create only** — creates the prompt but does not execute it (for later runs)
- **untracked** — executes code with no registry record at all

## Allow One-Off Untracked Code Work

Tracked prompts are the default for ALL code work, including small or one-line changes.

The agent will ask before making any code change that is not already covered by an active
tracked prompt. If you want to bypass that, say so explicitly.

Examples:
- `Do this as a one-off untracked code change`
- `Handle this without creating a tracked prompt`
- `Skip the gate for this one`

Note:
- each new request in the same session is a fresh gate check, even if a CCP prompt is already running
- the active prompt only covers work explicitly described in that prompt

## Ask The Agent To Clarify

Examples:
- `If this request is ambiguous, ask before changing the workflow`
- `If this could mean more than one process, clarify first`
- `If this should be a sprint instead of a single prompt, ask before creating anything`
