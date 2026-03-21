# Patzer Pro — Move Quality Audit

Date: 2026-03-20
Scope: how Patzer Pro decides move-quality notes (`inaccuracy`, `mistake`, `blunder`, missed-tactic style signals), compared against the relevant Lichess move-evaluation and review logic

---

## What this audit covers

This document audits the current Patzer Pro move-quality pipeline:

- how engine output is normalized
- how win chances are computed
- how move loss is computed
- how labels are assigned
- how accuracy is computed
- where Patzer is currently aligned with Lichess
- where Patzer is not actually evaluating moves the same way

This audit explicitly answers these questions:

1. Are Patzer’s before/after eval pairs always the same positions Lichess would compare?
2. Are we normalizing engine scores identically in all cases, especially mate and black-to-move positions?
3. Are we missing Lichess draw handling, tablebase handling, and opening/book exceptions?
4. Should `miss` exist as a move label in Patzer, or remain a separate missed-tactic / puzzle concept?
5. Are our local engine depth and stop/start semantics causing labels to drift even when the formulas match?
6. Are side variations and restored analysis ever causing a move to be judged against the wrong parent eval?

---

## Primary local implementation points

Current Patzer move-quality behavior is mainly owned by:

- `src/engine/ctrl.ts`
  - engine output parsing
  - cp/mate normalization
  - active eval state
- `src/engine/winchances.ts`
  - win-chance conversion
  - loss thresholds
  - label classification
- `src/engine/batch.ts`
  - per-move `loss` computation
  - review completion
  - missed-tactic detection
- `src/analyse/moveList.ts`
  - move glyph rendering
- `src/analyse/evalView.ts`
  - graph dots
  - accuracy
  - summary counts
- `src/main.ts`
  - analysis restore
  - serialization of stored review data

---

## Relevant Lichess systems

The most relevant Lichess sources for this comparison are:

- `ui/lib/src/ceval/winningChances.ts`
- `ui/analyse/src/practice/practiceCtrl.ts`
- `ui/analyse/src/nodeFinder.ts`
- `modules/analyse/src/main/AccuracyPercent.scala`
- `modules/analyse/src/main/Advice.scala`

Reference links:

- [Lichess lila repository](https://github.com/lichess-org/lila)
- [practice controller](https://github.com/lichess-org/lila/blob/master/ui/analyse/src/practice/practiceCtrl.ts)
- [node finder](https://github.com/lichess-org/lila/blob/master/ui/analyse/src/nodeFinder.ts)
- [accuracy percent](https://github.com/lichess-org/lila/blob/master/modules/analyse/src/main/AccuracyPercent.scala)
- [advice classification](https://github.com/lichess-org/lila/blob/master/modules/analyse/src/main/Advice.scala)

Secondary repo-local reference used as a cross-check when direct source details were not all available through raw fetch:

- [docs/reference/lichess-puzzle-reference.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-reference.md)

When this audit draws on that local reference, it is called out as an inference or cross-check rather than treated as the primary source of truth.

---

## Patzer Pro: current move-quality pipeline

### Step 1: Engine scores are normalized to white perspective

In `src/engine/ctrl.ts`, incoming UCI `info score` values are normalized like this:

- if the current evaluated ply is odd, negate the score
- that converts side-to-move scores into white-perspective scores
- the same rule is applied to both cp and mate values

This happens in `parseEngineLine()` before values are written into `currentEval`.

### Step 2: Batch review stores per-node eval

In `src/engine/batch.ts`, each mainline review node stores:

- `cp` or `mate`
- `best`
- `delta`
- `loss`

`loss` is computed from the parent and child win chances, converted into mover perspective.

### Step 3: Win chances are computed from cp/mate

In `src/engine/winchances.ts`, Patzer uses:

- a logistic/sigmoid transform
- cp clamped to `[-1000, 1000]`
- mate converted to a cp-equivalent using the same capped mate-distance style documented in the file comments

### Step 4: `loss` becomes `inaccuracy` / `mistake` / `blunder`

Patzer thresholds are:

- `0.025` -> inaccuracy
- `0.06` -> mistake
- `0.14` -> blunder

These are applied by `classifyLoss()`.

### Step 5: Best-move short-circuit suppresses labels

Move labels are only shown if:

- the move has a computed `loss`
- and the played move was not the engine’s stored `best` move for the parent

This matches the broad Lichess idea that the engine-best move should not receive a negative advice label.

### Step 6: Labels are surfaced in several places

Patzer currently uses the same loss/classification core for:

- move-list glyphs in `src/analyse/moveList.ts`
- graph dot colors in `src/analyse/evalView.ts`
- summary counts and accuracy in `src/analyse/evalView.ts`
- missed-tactic detection in `src/engine/batch.ts`
- puzzle candidate extraction in `src/puzzles/extract.ts`

---

## Lichess: the comparable model

At a high level, Lichess separates several concerns:

- raw ceval / engine scores
- advice classification
- accuracy computation
- learn-from-your-mistakes candidate detection
- opening/book cancellation
- practice-mode answer checking

That separation matters because not every concept in Lichess is just an advice label.

In particular:

- `inaccuracy`, `mistake`, `blunder` belong to advice/review classification
- "learn from your mistakes" candidates use a broader review/practice pipeline
- opening-book cancellation is a practice/review concern, not just a raw advice threshold

---

## Direct answers to the six questions

## 1. Are Patzer’s before/after eval pairs always the same positions Lichess would compare?

Short answer:

- `Partially`, but not always.

### Where Patzer matches

For mainline batch-reviewed moves, Patzer compares:

- parent position eval
- child position eval after the played move

This is the correct basic structure and is the same general kind of comparison Lichess uses for advice-style move judgments.

In `src/engine/batch.ts`, `stored.loss` is computed from:

- `parentEval = evalCache.get(parentPath)`
- `stored = current child node eval`

That is the right before/after pairing for mainline review.

### Where Patzer differs

Patzer does not currently evaluate the same full set of move contexts that Lichess review/practice logic cares about.

Important differences:

- Patzer computes `loss` only during batch review for reviewed mainline nodes.
- Side variations are not part of the batch review pipeline.
- Patzer does not require the Lichess-style "computer alternative child" (`comp`) structure before treating a move as reviewable.
- Patzer labels both players' moves in post-game analysis by actual mover parity, while Lichess practice mode often works from a selected player POV.

### Practical answer

If the question is:

- "For a reviewed mainline move, is Patzer comparing the same parent and child positions Lichess would broadly compare for advice?"

Then the answer is:

- `Usually yes`.

If the question is:

- "Does Patzer cover the same overall set of move contexts and reviewable positions as Lichess?"

Then the answer is:

- `No`.

### Bottom line

Patzer’s before/after pairing is structurally correct for mainline review, but its coverage and surrounding review semantics are thinner than Lichess.

---

## 2. Are we normalizing engine scores identically in all cases, especially mate and black-to-move positions?

Short answer:

- `Mostly yes on core cp/mate normalization`, but `not identically in all cases`.

### Where Patzer matches closely

Patzer normalizes black-to-move positions by negating odd-ply engine scores in `src/engine/ctrl.ts`.

That means:

- positive cp is interpreted consistently from white’s perspective
- mate values are also sign-normalized into white perspective

Patzer also mirrors the documented Lichess-style win-chance transform in `src/engine/winchances.ts`:

- cp clamped to `[-1000, 1000]`
- mate converted to a large cp-equivalent with a cap at mate-in-10
- same logistic coefficient documented in the code comments

### Where Patzer is not identical

Patzer explicitly documents an approximation:

- no tablebase override
- no threefold override
- no 50-move-rule draw override

That matters because Lichess can effectively flatten certain drawn positions into draw-like evaluation semantics, while Patzer keeps using raw engine cp.

### Threat mode note

Patzer threat mode flips the FEN side-to-move and then exempts threat mode from the normal ply-based sign inversion path.

That is reasonable for threat analysis, but it is one more place where "all score normalization" is not literally the same as the normal review path.

### Bottom line

For ordinary cp/mate normalization in mainline review:

- `Patzer is very close`.

For total score semantics across all edge cases:

- `No, not identical`.

---

## 3. Are we missing Lichess draw handling, tablebase handling, and opening/book exceptions?

Short answer:

- `Yes`.

### Draw handling / tablebase / rule-based draw state

Patzer explicitly does not implement the Lichess-style drawn-position overrides noted in `src/engine/winchances.ts`.

Current documented limitation:

- no tablebase draw handling
- no threefold repetition draw override
- no 50-move-rule draw override

Impact:

- in drawn or nearly forced-draw positions, Patzer can still classify moves from raw engine cp in ways Lichess may soften or neutralize

### Opening/book exceptions

Patzer currently does not implement the Lichess opening-explorer cancellation logic for mistake review.

The local reference in [docs/reference/lichess-puzzle-reference.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-reference.md) describes that Lichess can cancel a "mistake" in learn-from-your-mistakes flow if the move is still a common opening move.

Patzer currently has:

- imported opening names in game metadata
- no move-by-move opening/book provider in review classification
- no opening-book cancellation in missed-tactic or puzzle candidate extraction

### Best-alternative structure

Lichess practice/review logic also depends on richer alternative-move structure such as a stored computer line (`comp` child).

Patzer currently stores:

- `best`
- optional PV `moves`

But it does not yet build the richer review/practice structure around those alternatives.

### Bottom line

Yes, Patzer is currently missing several Lichess review-context features beyond the raw advice math.

---

## 4. Should `miss` exist as a move label in Patzer, or remain a separate missed-tactic / puzzle concept?

Short answer:

- `For now, it should remain a separate missed-tactic / puzzle concept.`

### Why

Patzer’s current move-label system is advice-style and simple:

- `inaccuracy`
- `mistake`
- `blunder`

Those labels are driven by one scalar:

- mover-perspective win-chance loss

That system is coherent.

By contrast, a true `miss` label usually implies something more specific:

- a missed tactical opportunity
- or a missed win / missed mate
- often from a chosen player perspective
- often tied to a practice or training workflow

Patzer already has a separate concept for this in `src/engine/batch.ts`:

- `detectMissedTactics()`

That function uses:

- a higher missed-tactic threshold
- user-color filtering
- missed short mate detection
- a ply-based phase gate

This is not the same concept as generic advice.

### Why adding `miss` now would be risky

If `miss` were added directly into the current `classifyLoss()` label layer, it would blur two different systems:

- advice classification
- tactical-opportunity detection

That would make the model less clear, not more accurate.

### Better longer-term path

If Patzer later grows a richer persisted review-annotation layer, it could support:

- advice labels
- tactical opportunity labels
- book marks
- maybe player-targeted review annotations

But with the current architecture, `miss` should stay separate.

### Bottom line

Do not add `miss` as a peer of `inaccuracy` / `mistake` / `blunder` yet.

Keep it as:

- missed-tactic detection
- puzzle extraction / guided review input

---

## 5. Are our local engine depth and stop/start semantics causing labels to drift even when the formulas match?

Short answer:

- `Yes`.

### Depth and engine-environment differences

Patzer’s review labels ultimately depend on the engine evals it produces locally.

Those evals differ from Lichess for several reasons even when the math after that is similar:

- local Stockfish-web instead of Lichess server analysis
- local thread count based on browser hardware
- local hash settings
- `reviewDepth` defaults
- local timing and browser performance

Lichess server analysis also uses its own node-budget and infrastructure model, which is not the same execution environment as Patzer.

So even if the formulas are aligned, the raw eval pairs can differ first.

### Stop/start semantics

Patzer still has known fragility around:

- `awaitingStopBestmove`
- shared engine state between live eval and batch review
- re-entry during navigation

That means the app can sometimes end up with:

- stale eval state
- skipped updates
- temporarily missing or mismatched labels

even if the intended formulas are correct.

### Critical distinction

There are two ways labels can drift:

1. `Math drift`
   The formulas differ.

2. `Input drift`
   The formulas are the same, but the before/after evals are not the same.

Patzer is much closer to Lichess on math than it is on input stability.

### Bottom line

Yes. In current Patzer, input drift from local engine behavior and stop/start state is a real source of label divergence.

---

## 6. Are side variations and restored analysis ever causing a move to be judged against the wrong parent eval?

Short answer:

- `Less than before for restore`, but `yes, side-variation and state-coverage issues still exist`.

### Restore: improved but not fully equivalent to Lichess

Current Patzer `main.ts` now includes a `restoreGeneration` guard plus `selectedGameId` check when restoring analysis.

That means:

- cross-game restore contamination is significantly reduced
- old IDB loads are discarded if the user switched games

So the answer for restored analysis is:

- `This is better than older audits suggested`
- `wrong-parent eval from cross-game restore is now less likely`

### Side variations: the larger issue is incomplete or stale coverage

Patzer batch review computes `loss` for mainline nodes.

It does not build a full persisted reviewed tree for:

- user-created side variations
- alternate engine-comp suggestion branches

Also:

- `buildAnalysisNodes()` serializes current mainline evals, not a fully reviewed tree including side lines

That means side variations are often:

- not fully reviewed
- not fully labeled
- or dependent on live eval state instead of stable batch review state

### Is the parent eval literally wrong, or just incomplete?

Most of the time, the bigger issue is:

- incomplete coverage
- stale display synchronization

rather than a guaranteed literal wrong-parent lookup.

Path-keyed storage helps prevent arbitrary parent mixups inside one loaded game tree.

But side-variation UI can still feel wrong because:

- parent best-move info comes from reviewed mainline state
- variation children may not have corresponding reviewed `loss`
- live engine state can lag after creating variations

So the user-visible effect can still be:

- this move seems judged against the wrong context

even when the lower-level problem is really:

- stale or missing side-line analysis

### Bottom line

- Restored analysis is safer now because of the generation guard.
- Side variations are still not evaluated with the same robustness as mainline reviewed moves.
- The practical risk is still real, but it is more often "incomplete/stale review context" than "completely wrong parent path from another game."

---

## Overall parity assessment

### Where Patzer is already close

- black/white cp normalization
- mate normalization strategy
- sigmoid-based win-chance conversion
- move-loss thresholds
- best-move short-circuit
- Lichess-style accuracy formula direction

### Where Patzer is still behind

- draw handling and tablebase-style overrides
- opening/book exceptions
- dedicated `comp`-style alternative move structure
- richer review/practice semantics
- stable engine state under rapid interaction
- robust side-variation review coverage

### Core conclusion

Patzer is already close to Lichess in the core move-quality math.

Patzer is not yet the same as Lichess in the full move-quality system.

The main remaining differences are not the three thresholds. The main remaining differences are:

- the engine inputs being compared
- missing contextual exceptions
- missing richer review semantics
- thinner state/control robustness

---

## Recommended next implementation conclusions

### 1. Keep advice labels and missed-tactic concepts separate

Do not merge `miss` into `classifyLoss()` yet.

### 2. Preserve the current win-chance thresholds for now

The thresholds are not the main source of mismatch.

### 3. Prioritize engine-state correctness over threshold tweaking

If labels drift, the next most valuable fixes are:

- review/run scoping
- stop/start correctness
- active-game isolation
- side-line analysis handling

### 4. Add richer review annotations only after state ownership is safer

Future additions could include:

- explicit persisted review annotation objects
- book move tagging
- missed-win / missed-mate markers
- player-targeted review mode

### 5. If Lichess parity is the goal, add opening/book exception logic before inventing new label types

That is a more faithful next step than simply adding `miss`.

---

## Final answer in one sentence

Patzer is already using very similar move-quality math to Lichess, but it is still not judging moves the same way overall because the surrounding engine-state stability, draw/book exceptions, and review-context model are not yet at Lichess parity.
