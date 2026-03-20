# Patzer Pro — Game Review Audit

Date: 2026-03-20
Scope: current Patzer Pro implementation of "Request Computer Analysis" / "Game Review" compared against the Lichess analysis-board computer-analysis flow

---

## What this audit covers

This document audits the current Patzer Pro "Game Review" flow:

- how the user requests review
- what state changes happen
- how the engine is driven
- how results are stored and surfaced
- where the implementation diverges from Lichess

This is not a code-change plan by itself. It is a diagnosis and comparison document.

---

## Primary local implementation points

Current Patzer Pro Game Review behavior is mainly owned by:

- `src/analyse/pgnExport.ts`
  - review button label and click behavior
  - stop / re-analyze behavior
- `src/engine/batch.ts`
  - batch queue construction
  - sequential engine driving
  - review result storage into `evalCache`
  - completion bookkeeping
- `src/engine/ctrl.ts`
  - engine lifecycle
  - protocol wiring
  - live eval state shared with batch review
  - stale-bestmove handling
- `src/main.ts`
  - game loading
  - restore flow
  - active game selection
  - route-level orchestration
- `src/idb/index.ts`
  - persisted analysis save/load

---

## Relevant Lichess systems

The most relevant Lichess source paths for this comparison are:

- `ui/analyse/src/ctrl.ts`
- `ui/analyse/src/view/controls.ts`
- `ui/analyse/src/practice/practiceCtrl.ts`
- `ui/lib/src/ceval/protocol.ts`
- `ui/lib/src/ceval/view/main.ts`
- `ui/lib/src/ceval/view/settings.ts`
- `ui/chart/src/acpl.ts`

Reference links:

- [Lichess lila repository](https://github.com/lichess-org/lila)
- [analyse ctrl](https://github.com/lichess-org/lila/blob/master/ui/analyse/src/ctrl.ts)
- [analyse controls](https://github.com/lichess-org/lila/blob/master/ui/analyse/src/view/controls.ts)
- [practice controller](https://github.com/lichess-org/lila/blob/master/ui/analyse/src/practice/practiceCtrl.ts)
- [ceval protocol](https://github.com/lichess-org/lila/blob/master/ui/lib/src/ceval/protocol.ts)
- [ceval main view](https://github.com/lichess-org/lila/blob/master/ui/lib/src/ceval/view/main.ts)
- [ceval settings](https://github.com/lichess-org/lila/blob/master/ui/lib/src/ceval/view/settings.ts)
- [ACPL chart](https://github.com/lichess-org/lila/blob/master/ui/chart/src/acpl.ts)

---

## Patzer Pro: current request-review flow

### Entry points

Patzer Pro currently exposes review in two user-facing ways:

1. The Games view "Review" button loads a game, navigates to analysis, and calls `startBatchWhenReady()`.
2. The analysis page underboard `Review` / `Re-analyze` button in `src/analyse/pgnExport.ts` starts or resets review from the current game.

This means "Game Review" is currently a batch-analysis action attached to the analysis board, not a distinct product-mode controller.

### Current button behavior

`renderAnalysisControls()` in `src/analyse/pgnExport.ts` uses one button with three states:

- `Review`
- `%` progress while batch is running
- `Re-analyze` after completion

Click behavior:

- if batch is running, it tries to stop the engine, preserve partial state, and save partial analysis
- if analysis is complete, it clears prior analysis state and restarts
- otherwise it calls `startBatchWhenReady()`

This is clean at the label level, but the underlying control flow is still fragile.

### Current batch-review execution model

The review pipeline in `src/engine/batch.ts`:

1. builds a queue from the current mainline
2. skips nodes already present in `evalCache`
3. evaluates nodes sequentially with `protocol.go(reviewDepth)`
4. stores batch results into `evalCache`
5. computes delta/loss against the parent
6. saves partial analysis to IndexedDB after each completed node
7. marks analysis complete and triggers a live re-eval for the current interactive node after batch finishes

This is a reasonable local implementation for a browser-first app.

### Current data model

Game Review currently depends on a shared mutable state model:

- `evalCache`
- `currentEval`
- `batchQueue`
- `batchDone`
- `batchAnalyzing`
- `analysisComplete`
- selected game state owned by `main.ts`

Persisted results are saved by game id, version, depth, and path-keyed node entries in IndexedDB.

### Current output surface

When review data lands successfully, Patzer Pro surfaces it through:

- move-list glyphs and mate labels
- eval graph
- analysis summary / accuracy
- puzzle candidate extraction

This is good product direction. Review is already useful to downstream workflows.

---

## Lichess: high-level computer-analysis model

Lichess separates several concerns more clearly than Patzer Pro currently does:

- live ceval is one concern
- board navigation is one concern
- analysis-tree ownership is one concern
- practice / learn-from-mistakes style review is one concern
- charting / annotations / move labels are consumers of analysis state

Lichess does not treat computer analysis as just a button that starts an engine loop. It treats it as part of a broader analysis controller model with stronger path and state ownership.

That matters because Lichess is designed around preventing stale engine output from mutating the wrong current position or wrong user-visible state.

---

## Where Patzer Pro matches Lichess well

### 1. The overall mental model is correct

Patzer Pro is broadly following the right product idea:

- analyze the game move by move
- cache/store evaluations per move path
- derive review labels from evaluation swings
- surface the results in graph, move list, and summary

This is the right conceptual direction.

### 2. Batch review is aligned with the product need

Using a sequential mainline queue in `src/engine/batch.ts` is a reasonable local equivalent for "analyze the whole game" behavior.

For a browser-local product, this is the smallest viable version of Lichess-style review.

### 3. Review output already connects to real learning features

Patzer Pro already turns review output into:

- accuracy summary
- move labels
- missed-tactic detection
- puzzle candidate extraction

This is stronger than a raw engine-only analysis board.

---

## Where Patzer Pro diverges from Lichess in important ways

### 1. Review is not owned by a dedicated review-mode controller

Patzer Pro Game Review is still a cross-cutting batch action spread across:

- `pgnExport.ts`
- `batch.ts`
- `ctrl.ts`
- `main.ts`

Lichess-style analysis behavior is more controller-driven, with clearer ownership over:

- current path
- active analysis context
- ceval state
- downstream practice/review behavior

In Patzer Pro, the current Game Review feature is functionally real but architecturally still transitional.

### 2. Live eval and batch review share fragile engine state

Patzer Pro uses the same engine protocol object and overlapping mutable engine state for:

- live analysis
- threat mode
- batch review
- stop/restart handling

This creates edge-case pressure around:

- stale `bestmove`
- path drift
- active-game drift
- navigation while review is running

Lichess is much stricter about gating engine output against the current analysis state.

### 3. Active-game scoping is still too weak

Patzer Pro restore/review coordination still depends on top-level selected game state in `main.ts`.

That means Game Review correctness can still be affected by:

- rapid game switching
- restore finishing after a new game is loaded
- shared path names across different trees/openings

This is one of the largest trust gaps versus Lichess.

### 4. Review is still coupled to underboard control placement

The current review action lives in the underboard controls area via `renderAnalysisControls()`.

This makes the feature feel more like a secondary utility than a first-class board mode.

Lichess treats computer analysis and related learning flows as integral to the analysis experience, not as an underboard add-on.

### 5. Review completion semantics are thinner than Lichess

Patzer Pro currently sets review completion based on finishing the batch queue and storing mainline evals.

Lichess's broader analysis/review model supports richer downstream behavior:

- stronger move annotations
- practice mode transitions
- more integrated chart/review interplay
- more mature mode switching

Patzer Pro is not wrong here. It is just earlier-stage.

---

## Current user experience of Game Review in Patzer Pro

### What feels good

- it is easy to start
- the label states are understandable
- progress is visible as percentage
- results feed into multiple surfaces
- the user can re-run the analysis

### What feels weak

- review does not feel like entering a dedicated review mode
- progress is mostly numeric, not interaction-rich
- stop/restart confidence is not high because the engine state model is fragile
- review is visually secondary despite being one of the app's central product actions
- the user still has to trust that graph, arrows, and labels remain synchronized during review

---

## Confirmed current risks specific to Game Review

### 1. Stop/restart bookkeeping is still fragile

The current stop handling still relies on `awaitingStopBestmove` as a single boolean.

Risk:

- stale engine output can still be misinterpreted
- review-cancel-review sequences are still risky

### 2. Review state is not strongly isolated from live analysis state

The same engine and overlapping state paths support:

- live eval
- batch review
- threat mode

Risk:

- harder-to-reason-about transitions
- subtle regressions when adjusting one mode

### 3. Restore and review are not strongly scoped to the active game

Risk:

- analysis from one game can still pollute another
- trust in persisted review is weaker than it should be

### 4. Some review consumers are still less trustworthy than the batch pipeline itself

Even if batch eval collection completes, the user-facing outputs can still drift:

- graph display
- arrows
- side-variation behavior
- review annotations

This means "batch finished" does not always equal "review UX is trustworthy."

---

## Honest assessment

Patzer Pro's current Game Review is good enough to prove the product direction.

It is not yet good enough to be treated as a solved subsystem.

The strongest truth here is:

- the review math and storage direction are solid
- the engine coordination and ownership boundaries are not yet solid enough

So compared to Lichess:

- Patzer Pro is conceptually aligned
- Patzer Pro is behaviorally promising
- Patzer Pro is structurally behind

That is a respectable place to be, but it is still a trust gap.

---

## Best next conclusions from this audit

### Highest-priority follow-up

- make review start/stop and stale-engine handling more robust
- make active-game scoping explicit through review and restore
- reduce `main.ts` ownership of review/load orchestration

### Second-priority follow-up

- formalize review as a first-class analysis-board mode rather than an underboard utility action
- strengthen the user-visible synchronization between batch state and graph/move-list/arrow state

### Third-priority follow-up

- only after the above, build richer "learn from mistakes" or guided-review flows

---

## Bottom line

Patzer Pro already has a real Game Review feature.

It is not a fake button and not a cosmetic stub.

But compared to Lichess, it is still best understood as:

- a credible first implementation of whole-game computer analysis
- with good downstream learning hooks
- still missing the controller rigor and state safety required for full trust
