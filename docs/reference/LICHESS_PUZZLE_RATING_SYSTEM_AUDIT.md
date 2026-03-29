# Lichess Puzzle Rating System Audit

## Purpose

This document audits how Lichess implements puzzle rating end to end and explains what Patzer Pro would need in order to replicate it as exactly as possible.

This is not just "Lichess uses Glicko."

The real system includes:

- a puzzle rating stored on every puzzle
- a user puzzle rating stored as its own performance bucket
- rating-aware puzzle selection
- solve-time user and puzzle rating updates
- casual-vs-rated solve handling
- difficulty offsets layered on top of rating-aware selection
- rating history and dashboard metrics derived from that system

## Source Files Inspected

### Lichess puzzle module

- `~/Development/lichess-source/lila/modules/puzzle/src/main/Puzzle.scala`
- `~/Development/lichess-source/lila/modules/puzzle/src/main/PuzzleFinisher.scala`
- `~/Development/lichess-source/lila/modules/puzzle/src/main/PuzzleComplete.scala`
- `~/Development/lichess-source/lila/modules/puzzle/src/main/PuzzleSelector.scala`
- `~/Development/lichess-source/lila/modules/puzzle/src/main/PuzzleSession.scala`
- `~/Development/lichess-source/lila/modules/puzzle/src/main/PuzzleDifficulty.scala`
- `~/Development/lichess-source/lila/modules/puzzle/src/main/PuzzleTrust.scala`
- `~/Development/lichess-source/lila/modules/puzzle/src/main/PuzzleApi.scala`
- `~/Development/lichess-source/lila/modules/puzzle/src/main/PuzzleDashboard.scala`
- `~/Development/lichess-source/lila/modules/puzzle/src/main/JsonView.scala`
- `~/Development/lichess-source/lila/modules/puzzle/src/main/PuzzleForm.scala`
- `~/Development/lichess-source/lila/modules/puzzle/src/main/PuzzlePath.scala`
- `~/Development/lichess-source/lila/modules/puzzle/src/main/PuzzleTier.scala`
- `~/Development/lichess-source/lila/modules/puzzle/src/main/ui/PuzzleUi.scala`

### Lichess rating / user / history support

- `~/Development/lichess-source/lila/modules/rating/src/main/Glicko.scala`
- `~/Development/lichess-source/lila/modules/rating/src/main/Perf.scala`
- `~/Development/lichess-source/lila/modules/rating/src/main/PerfType.scala`
- `~/Development/lichess-source/lila/modules/user/src/main/UserPerfsRepo.scala`
- `~/Development/lichess-source/lila/modules/history/src/main/HistoryApi.scala`
- `~/Development/lichess-source/lila/app/controllers/Puzzle.scala`

### Patzer files compared

- [src/puzzles/types.ts](/Users/leftcoast/Development/PatzerPatzer/src/puzzles/types.ts)
- [src/puzzles/puzzleDb.ts](/Users/leftcoast/Development/PatzerPatzer/src/puzzles/puzzleDb.ts)
- [src/puzzles/ctrl.ts](/Users/leftcoast/Development/PatzerPatzer/src/puzzles/ctrl.ts)
- [docs/PUZZLE_V1_PLAN.md](/Users/leftcoast/Development/PatzerPatzer/docs/PUZZLE_V1_PLAN.md)
- [docs/NEXT_STEPS.md](/Users/leftcoast/Development/PatzerPatzer/docs/NEXT_STEPS.md)

---

## Exact Lichess data model

### 1. Every puzzle has its own Glicko

In `Puzzle.scala`, every puzzle stores:

- `glicko: Glicko`
- `plays: Int`
- `vote: Float`

So the puzzle itself is rated as if it were an opponent in a rating system.

This is the first important point:

- Lichess puzzle difficulty is not a static CSV number after import
- it is a live rating attached to the puzzle record

The client-facing JSON exposes that live rating:

- `JsonView.puzzleJsonBase(...)` returns `"rating" -> puzzle.glicko.intRating`

### 2. Every user has a separate puzzle performance rating

Lichess has a dedicated performance type:

- `PerfType.Puzzle`

from `modules/rating/src/main/PerfType.scala`.

The user puzzle rating is not mixed into game ratings like blitz or rapid. It is its own performance bucket stored in the user perfs document.

The actual performance object is a normal `Perf`, which wraps:

- `glicko`
- `nb`
- `recent`
- `latest`

from `modules/rating/src/main/Perf.scala`.

So puzzle rating is structurally a first-class rating domain on Lichess, not a local minigame stat.

### 3. Puzzle rounds are stored separately from ratings

`PuzzleRound.scala` stores:

- puzzle/user pair id
- last result
- fixedAt
- date
- vote
- themes

Important:

- the round record is not the rating record
- it tracks whether the user has played the puzzle and what happened
- the rating itself lives in user perfs and puzzle records

So Lichess separates:

- puzzle metadata
- user puzzle perf
- per-user per-puzzle solve history

That separation is important to replicate.

---

## Exact solve-time rating update flow

The core implementation is in `PuzzleFinisher.scala`.

### Rated vs casual

Lichess does not always rate a puzzle solve.

Before computing ratings, it checks:

- whether the puzzle is marked casual for that user/puzzle
- whether the submitted round is rated

Important branches:

- casual solve: record round, do not update ratings
- unrated solve: record round, do not update ratings
- first rated solve: compute user and puzzle Glicko updates

So exact parity requires a real notion of:

- rated puzzle round
- casual puzzle round
- already-played round

### User vs puzzle are treated like players in a game

When the solve is rated, Lichess computes a Glicko game:

- user = white
- puzzle = black
- result = win if user solved, loss if failed

The code uses:

- user's current puzzle perf as one player
- puzzle's current Glicko plus play count as the other player

Then:

- `calculator.computeGame(...)`

produces updated Glickos for both sides.

This is the core exact mechanism.

### Hard caps on per-solve delta

Lichess caps rating jumps aggressively.

In both the general rating code and puzzle finisher path:

- rating delta is clamped to `Glicko.maxRatingDelta`
- current value in `Glicko.scala`: `700`

Then the result is also passed through:

- `cap`
- `sanityCheck`

So exact parity is not just "run Glicko." It is "run Glicko and then cap/sanity-check the outputs."

### Puzzle rating is not updated for dubious users

Lichess does not always let a user's solve move the puzzle rating.

`PuzzleFinisher.scala` asks:

- `userApi.dubiousPuzzle(me.userId, perf)`

If the user's puzzle skill looks dubious relative to standard rating or other trust heuristics, the puzzle Glicko update can be suppressed.

That means:

- the user may still get a new puzzle rating
- but the puzzle may not move in response to that solve

This is a very important anti-abuse/anti-noise feature.

### Puzzle/player weighting is not symmetrical raw Glicko output

After Glicko computation, Lichess applies `ponder.player(...)` and `ponder.puzzle(...)`.

This is not generic rating boilerplate.

It adjusts the effective update weight based on:

- puzzle angle/theme
- whether the solve was success or failure
- whether the theme is obvious
- whether the theme hints at the answer
- whether the puzzle or player is provisional

Examples from `PuzzleFinisher.scala`:

- obvious themes like mate-in-1 and castling get much lower weight
- hinting themes get lower weight than neutral themes
- failure often carries more weight than success on hinting/obvious themes

This means exact parity with Lichess is not:

- "Glicko-2 on every solve"

It is:

- "Glicko-2 plus Lichess's puzzle-specific weighting layer."

That weighting layer is one of the most important details in the whole system.

### The user perf is updated in the normal user perfs store

After compute:

- `userApi.setPerf(me.userId, PerfType.Puzzle, userPerf.clearRecent)`

So the user's puzzle rating is persisted as their puzzle perf.

### Puzzle history is also written

After a rated update:

- `historyApi.addPuzzle(user = me.value, completedAt = now, perf = userPerf)`

This writes puzzle rating history by day for the user.

So Lichess can later render:

- puzzle rating history
- dashboard performance summaries

### Puzzle play count always increments

The puzzle document increments:

- `plays += 1`

on completion.

So "attempt count" and "rating" evolve together.

---

## Exact puzzle selection behavior

The selector is in `PuzzleSelector.scala`, `PuzzleSession.scala`, and `PuzzlePath.scala`.

### Selection is rating-aware

Lichess does not simply pick any puzzle of the chosen theme.

`PuzzlePathApi.nextFor(...)` uses:

- the user's current puzzle rating
- plus the chosen difficulty offset

and builds a target rating window.

The exact starting target is:

- `perf.glicko.intRating + difficulty.ratingDelta`

### Difficulty is an offset, not a different queue type

`PuzzleDifficulty.scala` defines:

- `Easiest = -600`
- `Easier = -300`
- `Normal = 0`
- `Harder = +300`
- `Hardest = +600`

So difficulty selection is not a separate ladder.

It is:

- "take my current puzzle rating and bias the target puzzle rating window up or down"

This is a very elegant design and important to copy if you want true Lichess parity.

### Selection also uses path tiers

The selector does not pick from the entire puzzle pool every time.

It chooses:

- a path
- a position within that path

with tier fallback:

- `top`
- `good`
- `all`

and compromise widening when selection is too narrow.

This is infrastructure-heavy and more than Patzer currently has.

### Sessions are rating-sticky but can flush

`PuzzleSession.scala` stores:

- difficulty
- color
- current path
- position in path
- session rating snapshot

If the user's rating drifts enough:

- sessions can flush and recreate

This keeps selection aligned to the user's current level.

---

## Exact UI and API exposure

### Puzzle JSON sent to client

`JsonView.scala` exposes:

- puzzle rating
- play count
- user rating
- user provisional flag
- round rating diff after completion

So the client can render:

- current puzzle rating
- user's puzzle rating
- per-round rating change

### Puzzle completion response includes rating diff

After solve completion:

- `JsonView.roundJson.web(...)` includes `ratingDiff`

So the client sees:

- whether the solve succeeded
- how much rating changed

### Difficulty is stored in session/cookie

`PuzzleDifficulty.fromReqSession(...)` reads the difficulty cookie:

- `puz-diff`

So the user's last chosen difficulty survives page reload/navigation.

---

## Dashboard and performance math

Lichess builds puzzle dashboard metrics in `PuzzleDashboard.scala`.

It tracks:

- number of puzzles
- wins
- fixes
- average puzzle rating faced
- derived performance

The derived dashboard performance is:

- `puzzleRatingAvg - 500 + round(1000 * firstWins / nb)`

This is not the same thing as the actual puzzle perf Glicko.

So Lichess has:

- real puzzle rating = Glicko perf
- dashboard performance = summary metric derived from results and average puzzle rating faced

Important distinction:

- do not confuse the dashboard performance metric with the actual ladder rating

---

## Trust / voting / curation interactions

Lichess also uses rating in trust and curation systems.

### Puzzle trust

`PuzzleTrust.scala` uses:

- user's puzzle rating
- puzzle rating
- distance between them
- whether the rating is provisional

to weight votes and trust actions.

That means the puzzle rating system is not isolated. It feeds moderation/curation logic too.

### Puzzle vote is separate from difficulty

Puzzle votes update:

- `voteUp`
- `voteDown`
- denormalized `vote`

from `PuzzleApi.scala`

This is not the same thing as puzzle rating.

So Lichess keeps separate signals for:

- difficulty / solve success rating
- community quality vote

Patzer should keep those separate too.

---

## What Patzer currently has

Patzer does not currently have a real Lichess-like puzzle rating system.

### What Patzer does have

From [src/puzzles/types.ts](/Users/leftcoast/Development/PatzerPatzer/src/puzzles/types.ts):

- `PuzzleSessionMode = 'practice' | 'rated'`
- `PuzzleRatingSnapshot`
- `ratingBefore`
- `ratingAfter`

From [src/puzzles/ctrl.ts](/Users/leftcoast/Development/PatzerPatzer/src/puzzles/ctrl.ts):

- rounds track `currentSessionMode`
- comments explicitly say rated puzzle mode is future work

From [src/puzzles/puzzleDb.ts](/Users/leftcoast/Development/PatzerPatzer/src/puzzles/puzzleDb.ts):

- local puzzle definitions
- attempts
- user metadata

From imported puzzle definitions in [src/puzzles/types.ts](/Users/leftcoast/Development/PatzerPatzer/src/puzzles/types.ts):

- imported Lichess puzzles already store:
  - `rating`
  - `ratingDeviation?`
  - `plays?`
  - popularity/themes/opening tags

### What Patzer does not have

Patzer does not currently have:

- a persistent user puzzle perf
- a live-updating puzzle rating on puzzle records
- solve-time user Glicko updates
- solve-time puzzle Glicko updates
- rated-vs-casual gating
- rating-aware puzzle selection
- difficulty as a target-rating offset
- puzzle rating history
- dashboard metrics based on rated puzzle history
- trust logic for puzzle curation

So the current Patzer state is:

- future hooks exist
- exact Lichess parity does not

---

## What would be required to replicate Lichess exactly

If "exactly" really means exactly, Patzer needs all of the following.

### Layer 1 — Canonical rating data model

Patzer would need:

1. a canonical `Glicko` model
2. a canonical puzzle-user perf record
3. canonical puzzle-record rating fields that can update over time

Minimum new owned concepts:

- `PuzzleGlicko`
- `PuzzlePerf`
- `UserPuzzlePerf`

This should not be hidden inside `PuzzleAttempt`.

### Layer 2 — Rated solve pipeline

Patzer would need:

- rated solve submissions
- casual solve submissions
- first-play detection per user/puzzle
- user perf update on rated solve
- puzzle rating update on rated solve
- rating delta response payload

That means building the equivalent of:

- `PuzzleFinisher`
- `PuzzleComplete`

in Patzer terms.

### Layer 3 — Puzzle selection by rating

Patzer would need:

- user puzzle rating as an input to puzzle selection
- difficulty offsets of `-600/-300/0/+300/+600`
- rating-window search
- fallback widening

This is one of the biggest hidden requirements.

Without it, you can show a rating number, but you still do not have Lichess puzzle progression.

### Layer 4 — History and performance summaries

Patzer would need:

- per-day puzzle rating history
- dashboard summary metrics
- performance over solved sets

### Layer 5 — Trust and curation rules

Strict "exact" parity also implies:

- anti-noise / dubious-user suppression for puzzle rating updates
- maybe later trust weighting for votes

This can be deferred, but exact parity technically includes it.

---

## Strong recommendation for Patzer

Patzer should not try to jump straight to exact full Lichess parity in one pass.

That would be too much system for the current architecture, especially since Patzer:

- is local-first
- has no account system
- has no server-backed user-perf store
- currently uses IndexedDB puzzle persistence only

### Best realistic replication order

#### Phase 1 — local rated puzzle perf only

Add:

- local user puzzle perf in IndexedDB
- local Glicko implementation
- rated/practice mode that actually changes behavior
- ratingBefore / ratingAfter population on attempts

Do not update puzzle ratings yet.

This gives:

- visible progression
- real rating diffs
- simpler validation

#### Phase 2 — local puzzle rating updates

Add:

- live puzzle Glicko on puzzle records
- play-count-based update flow
- capped/sanity-checked rating changes

At this point Patzer starts to resemble Lichess much more closely.

#### Phase 3 — rating-aware selection

Add:

- difficulty offsets
- target-rating windows
- selection based on user puzzle rating

This is the point where Patzer starts to *feel* like Lichess puzzle progression.

#### Phase 4 — dashboard/performance layer

Add:

- history
- rating chart
- dashboard summaries

#### Phase 5 — puzzle-specific weighting and trust

Add:

- obvious-theme downweighting
- hinting-theme downweighting
- dubious-user suppression for puzzle rating movement

This is the last and hardest parity layer.

---

## What Patzer can already reuse

Patzer is not starting from zero.

It already has:

- puzzle definitions
- attempts
- future rating fields
- source puzzle ratings imported from Lichess
- source play counts imported from Lichess
- route/runtime ownership for puzzle rounds

That means Patzer can reuse:

- `PuzzleDefinition`
- `PuzzleAttempt`
- `PuzzleSessionMode`
- `ratingBefore` / `ratingAfter`

But Patzer still needs a real rating owner and update pipeline.

---

## Exact replication checklist

To replicate Lichess exactly, Patzer would need:

- puzzle `Glicko` on every puzzle
- user `PerfType.Puzzle` equivalent
- rated-vs-casual solve handling
- first-play-only rated updates
- user and puzzle updated as a Glicko game
- capped deltas
- sanity checks
- theme-based update weighting
- provisional handling
- dubious-user suppression for puzzle rating movement
- difficulty offsets based on user puzzle rating
- rating-aware puzzle selection
- puzzle rating history
- dashboard performance summaries

If any of those are missing, Patzer can still be Lichess-inspired, but not exact.

---

## Bottom line

Lichess puzzle rating is not a small frontend feature.

It is a product-level system built from:

- user perf storage
- puzzle difficulty storage
- solve history
- Glicko updates
- selection logic
- trust logic
- dashboard/history reporting

Patzer can absolutely replicate it, but only if it treats puzzle rating as a real subsystem, not a number attached to attempts.
