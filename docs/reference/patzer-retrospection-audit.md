# Patzer Retrospection Audit Against Lichess

Date: 2026-03-20
Basis:
- current Patzer source
- `docs/reference/lichess-retrospection/`
- `docs/reference/lichess-retrospection-ux/`
- `docs/reference/lichess-puzzle-ux/`

This document audits Patzer Pro's current Learn From Your Mistakes / retrospection setup against
what the Lichess source visibly does today.

The goal is not to idealize a future architecture.
The goal is to answer:
- what Patzer already has
- what is only partial
- what is still missing for real Lichess-like behavior
- what the next safe implementation sequence should be

---

## Current Patzer surface

Patzer already has a real first-pass retrospection foundation:

- candidate extraction:
  - [src/analyse/retro.ts](/Users/leftcoast/Development/PatzerPatzer/src/analyse/retro.ts)
- session controller:
  - [src/analyse/retroCtrl.ts](/Users/leftcoast/Development/PatzerPatzer/src/analyse/retroCtrl.ts)
- controller attachment point:
  - [src/analyse/ctrl.ts](/Users/leftcoast/Development/PatzerPatzer/src/analyse/ctrl.ts)
- board move interception:
  - [src/board/index.ts](/Users/leftcoast/Development/PatzerPatzer/src/board/index.ts)
- top-level entry and feedback strip:
  - [src/main.ts](/Users/leftcoast/Development/PatzerPatzer/src/main.ts)
- engine/review hooks:
  - [src/engine/ctrl.ts](/Users/leftcoast/Development/PatzerPatzer/src/engine/ctrl.ts)
- review data source:
  - [src/engine/batch.ts](/Users/leftcoast/Development/PatzerPatzer/src/engine/batch.ts)

So this is not a greenfield feature anymore.
The real question is parity and ownership quality, not existence.

---

## Lichess reference baseline

Candidate logic baseline:
- [docs/reference/lichess-retrospection/RETROSPECTION_FLOW.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection/RETROSPECTION_FLOW.md)
- [docs/reference/lichess-retrospection/PARAMETERS_AND_THRESHOLDS.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection/PARAMETERS_AND_THRESHOLDS.md)

UX and board-mode baseline:
- [docs/reference/lichess-retrospection-ux/ENTRY_POINTS_AND_LAYOUT.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection-ux/ENTRY_POINTS_AND_LAYOUT.md)
- [docs/reference/lichess-retrospection-ux/BOARD_INTERACTION_AND_STATE_EFFECTS.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection-ux/BOARD_INTERACTION_AND_STATE_EFFECTS.md)

Important Lichess facts:
- retrospection is an analysis-board mode, not just a strip and a button
- candidate moments come from reviewed mainline swings plus missed-mate cases
- the board jumps to the position before the mistake
- the controller tracks solving feedback states
- controller lifecycle is wired into jump, ceval, and analysis-merge events
- retrospection affects UI visibility, navigation behavior, and tool-column content
- near-best acceptance and `eval` state are part of the real flow
- opening/book cancellation is part of parity behavior

---

## Audit Findings

## 1. Candidate extraction exists and is directionally correct

Patzer status:
- [src/analyse/retro.ts](/Users/leftcoast/Development/PatzerPatzer/src/analyse/retro.ts) builds a dedicated `RetroCandidate`
- it uses:
  - mainline-only traversal
  - mover-color filtering
  - reviewed engine data
  - `bestMove`
  - loss-based classification
  - missed-mate detection

Assessment:
- this is a real implementation, not a placeholder
- it is aligned with the Lichess candidate concept
- it is still an MVP approximation, not full parity

Main source-backed deviations:
- Patzer uses `bestMove` from eval cache instead of a stored `comp` child
- Patzer does not yet store `bestLine`
- Patzer does not yet do opening/book cancellation
- Patzer uses the named `mistake` threshold from `winchances.ts` instead of reproducing the
  exact visible Lichess `povDiff > 0.1` gate

Conclusion:
- acceptable first-pass data seam
- not the current blocker

## 2. The session controller exists but is still structurally incomplete

Patzer status:
- [src/analyse/retroCtrl.ts](/Users/leftcoast/Development/PatzerPatzer/src/analyse/retroCtrl.ts)

What it already does:
- ordered candidate session
- solved tracking
- `find` / `win` / `fail` / `view` / `offTrack` feedback
- `jumpToNext()`
- `skip()`
- `viewSolution()`
- `completion()`
- `reset()`

What it explicitly does not yet do:
- real `onCeval()` logic
- near-best acceptance / `eval` state
- opening cancellation
- board-coupled behavior like hiding computer lines or preventing next-move stepping

Assessment:
- this is the biggest parity gap in the controller layer
- the file itself admits it is incomplete
- it is closer to a session shell than to the full Lichess retro controller

Conclusion:
- this is a real seam, not just polish

## 3. Ownership is still too top-level and too `main.ts`-driven

Patzer status:
- `toggleRetro()` lives in [src/main.ts](/Users/leftcoast/Development/PatzerPatzer/src/main.ts)
- the feedback strip renderer also lives in [src/main.ts](/Users/leftcoast/Development/PatzerPatzer/src/main.ts)
- the "Mistakes" entry button is rendered in the controls area from [src/main.ts](/Users/leftcoast/Development/PatzerPatzer/src/main.ts)

Lichess baseline:
- retrospection is integrated into analyse controller/view ownership, not top-level page glue

Assessment:
- this is architectural drift
- the current implementation works as a bridge, but it is not the right long-term ownership seam
- keeping the feature in `main.ts` will make later parity work harder, especially around tool-column
  rendering and board-mode suppression

Conclusion:
- ownership extraction is a required next-step, not a luxury refactor

## 4. Board interception is present but too simplistic

Patzer status:
- [src/board/index.ts](/Users/leftcoast/Development/PatzerPatzer/src/board/index.ts) intercepts retro solving attempts
- exact `bestMove` succeeds
- any other move fails and returns the user to `parentPath`

Assessment:
- this is a valid MVP loop
- it is not full Lichess behavior

Missing parity details:
- no `eval` state for near-best moves
- no ceval-based acceptance path
- no richer off-track recovery behavior
- no distinction between "wrong move" and "line still needs engine judgement"

Conclusion:
- acceptable MVP solve loop
- but currently too rigid to be called Lichess-like beyond the simplest case

## 5. Lifecycle hooks are partially wired, but not fully exploited

Patzer status:
- [src/main.ts](/Users/leftcoast/Development/PatzerPatzer/src/main.ts) calls:
  - `ctrl.retro?.onJump(path)`
  - `ctrl.retro?.onMergeAnalysisData()`
- [src/engine/ctrl.ts](/Users/leftcoast/Development/PatzerPatzer/src/engine/ctrl.ts) calls:
  - `ctrl.retro?.onCeval()`

Assessment:
- this is good progress
- however, because `onCeval()` is still a stub, the wiring is not yet delivering the Lichess behavior it points at

Conclusion:
- the wiring seam exists
- the logic on the receiving side still needs to be implemented

## 6. The current UX is not yet Lichess-like

Patzer status:
- current retro UI is a bottom controls strip in [src/main.ts](/Users/leftcoast/Development/PatzerPatzer/src/main.ts)
- current entry affordance is a `Mistakes` button in the analysis controls row

Lichess baseline:
- retrospection is exposed through analysis-side surfaces and renders a dedicated tool-column box
- it also changes surrounding board/tool behavior while active

Assessment:
- Patzer has an MVP affordance
- it does not yet replicate the Lichess UX structure

Missing parity items:
- dedicated retrospection panel ownership under analysis UI
- tool-column placement
- clearer state presentation
- suppression/hiding of conflicting computer-line and adjacent analysis affordances while solving

Conclusion:
- UX parity is still early-stage
- this should be improved after controller wiring is stabilized, not before

## 7. Patzer still lacks the source-backed parity exceptions

Missing today:
- opening/book cancellation
- persisted `comp`-style best-line storage
- near-best acceptance through local ceval
- richer state machine parity for `eval` and related transitions

Assessment:
- these are real gaps
- but they are not the right next task if the controller/ownership seams are still incomplete

Conclusion:
- defer until the controller and UI structure are safer

---

## Overall Verdict

Patzer is ahead of the roadmap description.

It already has:
- a candidate model
- a session controller
- lifecycle wiring points
- a first-pass solve loop
- a visible entry affordance

But it is not yet close enough to call the feature Lichess-like from a controller/UX standpoint.

The core problem is no longer "build retrospection."
The core problem is:
- move it out of top-level glue
- complete the controller lifecycle behavior
- then lift the UX into the right analysis-owned surface

---

## Recommended next implementation sequence

This is the source-backed execution order I would use now.

### Step 1. Extract retrospection UI ownership out of `main.ts`

Goal:
- move the retrospection entry button and active-session UI out of top-level page glue and into
  an analysis-owned module

Why first:
- it reduces architectural drift immediately
- it creates the right seam for later Lichess-like tool-column behavior
- it avoids piling more retro-specific behavior into `main.ts`

Likely target:
- a new small module under `src/analyse/`, such as:
  - `retroView.ts`
  - or `retrospectionView.ts`

### Step 2. Complete the controller-side lifecycle behavior

Goal:
- make `onCeval()` and related session logic real instead of a stub

Why second:
- the lifecycle seam already exists
- this is the key missing behavior for parity with Lichess state handling

Scope:
- implement the smallest safe ceval-judgement path
- preserve the exact-best MVP rule unless a source-backed near-best step is intentionally taken

### Step 3. Move the active-session UI into the analysis tools area

Goal:
- stop treating retrospection as a bottom-strip control
- render it as an analysis-owned active panel

Why third:
- this is where Lichess behavior starts to feel structurally right
- it should follow Step 1, not precede it

### Step 4. Add explicit analysis-UI suppression rules during active retrospection

Goal:
- decide what Patzer should hide or mute while retrospection is active

Source-backed targets:
- conflicting computer lines
- adjacent analysis affordances that make solving noisy or confusing

Why fourth:
- this is parity work, but it becomes clearer once the panel is in the right place

### Step 5. Persist richer solution context

Goal:
- add stored best-line / `comp`-equivalent context for each retro candidate

Why fifth:
- it unlocks more faithful answer reveal and later near-best evaluation
- but it should not block the controller/ownership fixes

### Step 6. Add opening/book cancellation only after the core loop is trustworthy

Goal:
- cancel theory/book moments the way Lichess does

Why later:
- it is parity-important
- but it depends on having a stable candidate pipeline and some book provider boundary

### Step 7. Only then consider near-best acceptance parity

Goal:
- introduce Lichess-like ceval-assisted "close enough" acceptance

Why last:
- this is behaviorally subtle
- it is easy to get wrong
- it should not be attempted while the current state ownership is still rough

---

## Concrete next-step recommendation

If I had to pick the single best next task right now, it would be:

`Extract retrospection entry + active-session rendering out of src/main.ts into src/analyse/, keeping behavior unchanged.`

Reason:
- it is small
- it is safe
- it respects the repo’s refactor-first status
- it makes every later Lichess-like retrospection task easier and cleaner

After that, the next task should be:

`Implement real retro controller lifecycle handling for ceval-driven session state, using the existing onJump / onMergeAnalysisData / onCeval hooks.`

Those two tasks are the right bridge from "MVP exists" to "parity work can proceed safely."
