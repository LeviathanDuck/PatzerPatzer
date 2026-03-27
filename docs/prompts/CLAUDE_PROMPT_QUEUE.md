# Claude Prompt Queue

Use this file to store Claude Code prompts that are ready to run in a future Claude session.

## How to use it

- Add full copy-paste-ready prompts here when they are created.
- Do not add review status here.
- Do not add queue status text by default. A queued prompt is simply present in this file.
- Keep a top-of-file queue index that lists only the prompts currently still queued.
- In that queue index, format each item as:
  - first line: `- CCP-###: Short Task Title`
  - second line: an indented bullet with a brief target description
- Leave one blank line between queue-index items for readability.
- Keep the queue index concise and scan-friendly.
- Keep the queue index in sync with the prompt blocks below:
  - add a new index item when a prompt is created
  - remove the matching index item when the prompt is removed from this file during review
- Add a scan-friendly Markdown heading immediately before each prompt block:
  - format: `## prompt-id - short task title`
  - keep this heading outside the fenced prompt block
- Use plain fenced Markdown blocks with no language tag for queued prompts.
- Keep the prompt metadata header near the top of each prompt:
  - `Prompt ID: CCP-###`
  - `Task ID: CCP-###`
  - `Parent Prompt ID: CCP-###` if this is a follow-up fix prompt
  - `Source Document: docs/...`
  - `Source Step: ...`
- For a follow-up fix prompt:
  - `Prompt ID` must use the next `-F#` modifier, such as `CCP-013-F1`
  - `Task ID` must stay the root family id, such as `CCP-013`
  - `Parent Prompt ID` should point to the reviewed prompt being fixed
- Once a queued prompt has actually been used in Claude Code and then reviewed:
  - remove it from this file
  - add or update its reviewed entry in `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_LOG.md`

## Queue Index

- CCP-134: Add Mistake Detection Config Owner
  - Introduce a dedicated persisted config for Learn From Your Mistakes candidate selection without adding the menu yet.

- CCP-135: Add Mistake Detection Menu Modal
  - Add a main-menu `Mistake Detection` modal using the same slider-card style as the existing detection settings UI.

- CCP-136: Wire Mistake Detection Config Into Retrospection
  - Make Learn From Your Mistakes candidate building use the new configurable parameters instead of hard-coded rules.

- CCP-137: Apply Mistake Detection Changes To The Active Analysis Session
  - Rebuild the current retrospection availability or active session when mistake-detection settings change on the analysis board.

- CCP-138: Add Learn-Moment Reason Metadata
  - Carry backend reason codes and human labels through retrospection and saved local puzzle candidates.

- CCP-139: Show Learn-Moment Reason In Success UI
  - Explain why a moment was chosen on retrospection and saved-puzzle success/view states using parameter language.

- CCP-140: Add Collapse Family To Mistake Detection
  - Extend the new settings system with an optional blown-win / failed-conversion family, defaulting it off.

- CCP-141: Add Defensive Resource Family To Mistake Detection
  - Add a narrow optional defensive-resource detector that can surface missed saves as learnable moments.

- CCP-142: Add Punish-The-Blunder Family To Mistake Detection
  - Add an optional family for moments where the opponent erred and the user failed to exploit it.

## Queue

## CCP-134 - Add Mistake Detection Config Owner

```
Prompt ID: CCP-134
Task ID: CCP-134
Source Document: inferred from user request in chat
Source Step: add a configurable Learn From Your Mistakes parameter model in Patzer
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same retrospection / settings / header files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step to introduce a dedicated persisted config owner for Patzer’s Learn From Your Mistakes candidate-selection parameters, keeping the current default behavior intact and not adding the menu UI yet.

Inspect first:
- Patzer: `src/analyse/retro.ts`, `src/main.ts`, `src/header/index.ts`, `src/engine/tactics.ts`
- Lichess: `~/Development/lichess-source/lila/ui/analyse/src/nodeFinder.ts`, `~/Development/lichess-source/lila/ui/analyse/src/retrospect/retroCtrl.ts`
- Patzer research: `docs/reference/lichess-retrospection/README.md`, `docs/reference/lichess-retrospection/PARAMETERS_AND_THRESHOLDS.md`

Constraints:
- scope this to config ownership, defaults, and persistence only
- keep missed-tactic detection config separate unless the code inspection proves a tiny shared helper is safer
- preserve today’s live retrospection behavior when the new config is untouched
- do not add the menu/modal in this task
- do not bundle puzzle-candidate extraction changes

Important product rule:
- Lichess is the reference for which candidate rules exist
- but the existence of a user-facing parameter menu is an intentional Patzer-specific divergence
- do not invent extra knobs beyond the real candidate rules Patzer already uses or can support honestly now

Before coding, provide:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run the most relevant task-specific check you can for config ownership / persistence
- explicitly report:
  - build result
  - what defaults were preserved
  - how the new config is stored
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results.

Output shape:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks
```

## CCP-135 - Add Mistake Detection Menu Modal

```
Prompt ID: CCP-135
Task ID: CCP-135
Source Document: inferred from user request in chat
Source Step: add a main-menu Mistake Detection modal for Learn From Your Mistakes settings
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same header / settings-menu / modal-style files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step to add a new main-menu settings surface titled `Mistake Detection`, using the same slider/modal style as the current detection settings UI, and wire it to the dedicated Learn From Your Mistakes config owner.

Inspect first:
- Patzer: `src/header/index.ts`, `src/styles/main.scss`, the config owner introduced for retrospection mistake detection
- Lichess: inspect only for candidate-rule grounding, not for menu parity, since this settings surface is a Patzer-specific feature
- Patzer research: `docs/reference/lichess-retrospection/README.md`, `docs/reference/lichess-retrospection/PARAMETERS_AND_THRESHOLDS.md`

Constraints:
- scope this to the menu/modal UI and config editing surface
- title it `Mistake Detection`
- place the entry in the main global settings menu
- keep the visual style aligned with the existing `Detection Settings` modal so the UI feels native to Patzer
- do not bundle retrospection-session rebuild logic beyond the minimum config writes needed for the controls to function
- do not silently repurpose the missed-tactic settings modal unless inspection shows that is clearly the safer UX

Important product rule:
- expose only the real relevant retrospection parameters with short descriptions
- do not add speculative advanced controls just because the modal has room

Before coding, provide:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run the most relevant task-specific check you can for the new menu/modal
- explicitly report:
  - build result
  - where the new menu item appears
  - which controls are exposed
  - whether values update the config owner
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results.

Output shape:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks
```

## CCP-136 - Wire Mistake Detection Config Into Retrospection

```
Prompt ID: CCP-136
Task ID: CCP-136
Source Document: inferred from user request in chat
Source Step: apply configurable mistake-detection parameters to Learn From Your Mistakes candidate selection
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same retrospection / candidate-selection / main analysis files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step to make Patzer’s Learn From Your Mistakes candidate builder read the new mistake-detection config instead of relying on hard-coded candidate thresholds and gates.

Inspect first:
- Patzer: `src/analyse/retro.ts`, `src/main.ts`, `src/analyse/retroCtrl.ts`, the new mistake-detection config owner, and `src/engine/winchances.ts`
- Lichess: `~/Development/lichess-source/lila/ui/analyse/src/nodeFinder.ts`, `~/Development/lichess-source/lila/ui/analyse/src/retrospect/retroCtrl.ts`
- Patzer research: `docs/reference/lichess-retrospection/README.md`, `docs/reference/lichess-retrospection/PARAMETERS_AND_THRESHOLDS.md`, `docs/reference/lichess-retrospection/PATZER_IMPLICATIONS.md`

Constraints:
- scope this to candidate-building behavior only
- preserve current default candidate behavior when the config remains at defaults
- keep missed-tactic detection and Learn From Your Mistakes config as separate concepts unless inspection proves a tiny shared helper is clearly safer
- do not bundle active-session rebuild behavior if that would make the change materially larger
- do not bundle puzzle extraction changes

Important product rule:
- keep the configurable parameters anchored to the real Lichess-style candidate logic Patzer already references
- if any current Patzer comments are stale or contradictory about thresholds, fix them as part of the smallest safe truth-alignment needed for this task

Before coding, provide:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run the most relevant task-specific check you can for retrospection candidate selection
- explicitly report:
  - build result
  - which candidate rules are now configurable
  - whether default candidate selection stayed the same
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results.

Output shape:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks
```

## CCP-137 - Apply Mistake Detection Changes To The Active Analysis Session

```
Prompt ID: CCP-137
Task ID: CCP-137
Source Document: inferred from user request in chat
Source Step: apply mistake-detection setting changes immediately on the active analysis board
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same retrospection-session / header-settings / analysis-board files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step to make changes in the `Mistake Detection` settings apply to the active analysis-board context, so retrospection availability and any active session react coherently instead of waiting for a full reload.

Inspect first:
- Patzer: `src/main.ts`, `src/analyse/retroCtrl.ts`, `src/analyse/retro.ts`, `src/header/index.ts`, the new mistake-detection config owner
- Lichess: `~/Development/lichess-source/lila/ui/analyse/src/ctrl.ts`, `~/Development/lichess-source/lila/ui/analyse/src/retrospect/retroCtrl.ts`
- Patzer research: `docs/reference/lichess-retrospection/README.md`, `docs/reference/lichess-retrospection/RETROSPECTION_FLOW.md`

Constraints:
- scope this to applying changed settings to the currently loaded game / analysis board
- prefer the smallest coherent behavior, for example rebuilding retro availability or restarting the active session if needed
- do not redesign the whole retrospection lifecycle
- do not bundle unrelated menu cleanup or summary-panel redesign

Important product rule:
- if fully live in-place mutation is unsafe, choose the smallest honest behavior that still applies the new settings predictably and explain it clearly

Before coding, provide:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run the most relevant task-specific check you can for changing mistake-detection settings while viewing a game on the analysis board
- explicitly report:
  - build result
  - how setting changes affect the active board/session
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results.

Output shape:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks
```

## CCP-138 - Add Learn-Moment Reason Metadata

```
Prompt ID: CCP-138
Task ID: CCP-138
Source Document: docs/reference/post-game-learning-opportunities-audit.md
Source Step: Best next implementation direction — add reason metadata before expanding learnable-moment families
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same retrospection / puzzle-source / type-definition files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step to add backend reason metadata for Patzer learnable moments, so both Learn From Your Mistakes candidates and saved local puzzle candidates can carry a stable reason code, human label, and short reason summary without changing the visible UI yet.

Inspect first:
- Patzer: `src/analyse/retro.ts`, `src/tree/types.ts`, `src/puzzles/extract.ts`, `src/puzzles/round.ts`, `src/puzzles/types.ts`
- Lichess: `~/Development/lichess-source/lila/ui/analyse/src/nodeFinder.ts`, `~/Development/lichess-source/lila/ui/analyse/src/retrospect/retroCtrl.ts`
- Patzer research: `docs/reference/post-game-learning-opportunities-audit.md`, `docs/reference/lichess-retrospection/README.md`

Constraints:
- scope this to type shape, metadata propagation, and backend ownership only
- do not add success-panel UI in this task
- do not add new candidate families yet
- preserve current candidate selection behavior
- keep the reason model simple and explicit:
  - stable machine-readable code
  - user-facing label
  - short summary string
- if parameter snapshots are needed, keep them compact and honest

Important product rule:
- this metadata must make the detection logic easier to understand, not harder
- prefer a small explicit schema over clever generic abstractions

Before coding, provide:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run the most relevant task-specific check you can for metadata propagation
- explicitly report:
  - build result
  - which objects now carry reason metadata
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results.

Output shape:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks
```

## CCP-139 - Show Learn-Moment Reason In Success UI

```
Prompt ID: CCP-139
Task ID: CCP-139
Source Document: docs/reference/post-game-learning-opportunities-audit.md
Source Step: Best next implementation direction — explain why a learnable moment was chosen
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same retrospection view / puzzle round view files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step to show the backend learn-moment reason on successful or solution-shown states, both in Learn From Your Mistakes and in saved local puzzle rounds, using the language of the configured parameters instead of generic prose.

Inspect first:
- Patzer: `src/analyse/retroView.ts`, `src/puzzles/view.ts`, `src/puzzles/types.ts`, the reason metadata added in the previous step
- Lichess: inspect relevant retrospection and puzzle success-state surfaces for layout/reference, but treat this reason text as a Patzer-specific explanation feature
- Patzer research: `docs/reference/post-game-learning-opportunities-audit.md`

Constraints:
- scope this to terminal/success/view states only
- do not redesign the whole retro or puzzle feedback UI
- keep the explanation short and parameter-grounded
- prefer a "Chosen because..." or equivalent pattern instead of long prose
- if saved imported Lichess puzzles do not have equivalent metadata, do not fake it

Important product rule:
- the explanation must reflect the real detector that chose the moment
- it must not claim tactical, defensive, or conversion reasons that were not actually used

Before coding, provide:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run the most relevant task-specific check you can for retrospection and saved-puzzle terminal states
- explicitly report:
  - build result
  - where the reason text appears
  - how it behaves for local saved puzzles vs imported puzzles
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results.

Output shape:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks
```

## CCP-140 - Add Collapse Family To Mistake Detection

```
Prompt ID: CCP-140
Task ID: CCP-140
Source Document: docs/reference/post-game-learning-opportunities-audit.md
Source Step: Best next implementation direction — promote blown wins / failed conversion into a first-class training lane
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same mistake-detection config / retrospection candidate-selection / header settings files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step to add a first-class optional `collapse` family to the new `Mistake Detection` settings, using Patzer’s existing blown-win semantics and making it available to Learn From Your Mistakes candidate selection with its own toggle and parameters.

Inspect first:
- Patzer: `src/engine/tactics.ts`, `src/analyse/retro.ts`, `src/header/index.ts`, the new mistake-detection config owner and active-session wiring
- Lichess: inspect the current retrospection and winning-chances references for baseline candidate logic, but treat `collapse` as a Patzer-specific extension rather than a Lichess parity feature
- Patzer research: `docs/reference/post-game-learning-opportunities-audit.md`, `docs/reference/lichess-retrospection/PATZER_IMPLICATIONS.md`

Constraints:
- scope this to the `collapse` family only
- default this family to off
- give it its own enable toggle and only the minimum relevant parameters
- carry reason metadata when the family triggers
- do not add defensive or punish families in this task
- do not automatically feed `collapse` moments into saved puzzles unless inspection proves that is already the safest current path

Important product rule:
- make this detector easy to understand:
  - user was clearly better
  - one move threw away enough of that advantage
- if the existing `tactics.ts` collapse rules are the right substrate, reuse them honestly instead of inventing a second unrelated definition

Before coding, provide:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run the most relevant task-specific check you can for enabling/disabling the collapse family on reviewed games
- explicitly report:
  - build result
  - which settings were added
  - how the collapse family affects candidate selection
  - whether default behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results.

Output shape:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks
```

## CCP-141 - Add Defensive Resource Family To Mistake Detection

```
Prompt ID: CCP-141
Task ID: CCP-141
Source Document: docs/reference/post-game-learning-opportunities-audit.md
Source Step: Best next implementation direction — add missed defensive resources as a separate learnable-moment family
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same mistake-detection config / retrospection selector / winning-chances logic files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step to add a narrow optional defensive-resource family to `Mistake Detection`, so Patzer can surface moments where the user was worse but had a saving move or materially better defense available.

Inspect first:
- Patzer: `src/analyse/retro.ts`, `src/engine/winchances.ts`, `src/header/index.ts`, the new mistake-detection config owner, and any best-line / eval helpers needed to define a conservative defensive-resource rule
- Lichess: inspect retrospection flow and candidate-shape references for controller compatibility, but do not pretend Lichess exposes a direct defensive-resource family here
- Patzer research: `docs/reference/post-game-learning-opportunities-audit.md`, `docs/reference/lichess-retrospection/README.md`

Constraints:
- scope this to the first conservative defensive-resource family only
- default this family to off
- give it an explicit toggle and minimal honest parameters
- require clear source-backed reasoning for the detector design
- carry reason metadata when the family triggers
- do not bundle punish-the-blunder logic in this task
- do not force these moments into saved puzzles yet unless the implementation clearly supports that as a tiny safe step

Important product rule:
- if a trustworthy defensive-resource detector is still too ambiguous, prefer a narrower first pass and explain the limitation
- do not hide weak detector quality behind fancy UI

Before coding, provide:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run the most relevant task-specific check you can for enabling/disabling the defensive family on reviewed games
- explicitly report:
  - build result
  - which parameters were added
  - what exact defensive-resource rule is now used
  - whether default behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results.

Output shape:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks
```

## CCP-142 - Add Punish-The-Blunder Family To Mistake Detection

```
Prompt ID: CCP-142
Task ID: CCP-142
Source Document: docs/reference/post-game-learning-opportunities-audit.md
Source Step: Best next implementation direction — add punish-the-blunder moments as a separate learnable family
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same retrospection selector / puzzle-candidate / review-data files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step to add an optional `punish` family to `Mistake Detection`, so Patzer can surface moments where the opponent made a real error and the user failed to exploit it.

Inspect first:
- Patzer: `src/analyse/retro.ts`, `src/puzzles/extract.ts`, `src/engine/winchances.ts`, `src/header/index.ts`, the new mistake-detection config owner, and any best-line helpers needed for a conservative punish detector
- Lichess: inspect current retrospection and puzzle references for baseline reviewed-moment shape, but do not pretend Lichess exposes this family directly in Learn From Your Mistakes
- Patzer research: `docs/reference/post-game-learning-opportunities-audit.md`

Constraints:
- scope this to the first conservative punish-the-blunder family only
- default this family to off
- give it an explicit toggle and only the minimum honest parameters
- carry reason metadata when the family triggers
- keep the first pass focused on Learn From Your Mistakes candidate selection unless a tiny bridge to saved local puzzles is clearly safe
- do not redesign the whole saved-puzzle pipeline in this task

Important product rule:
- keep the detector simple enough that a human can understand why a position was chosen
- if the detection rule depends on multiple conditions, report them clearly in validation and in the reason metadata

Before coding, provide:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped

Then implement the change directly.

Validation is required after coding:
- run `npm run build`
- run the most relevant task-specific check you can for enabling/disabling the punish family on reviewed games
- explicitly report:
  - build result
  - which parameters were added
  - what exact punish-the-blunder rule is now used
  - whether default behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks and limitations

Also include a short manual test checklist with concrete user actions and expected results.

Output shape:
- prompt id
- task id
- source document
- source step
- task title
- relevant Patzer Pro files
- relevant Lichess files
- diagnosis
- exact small step to implement
- why that step is safely scoped
- implementation
- validation
- manual test checklist
- remaining risks
```
