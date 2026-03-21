# Puzzle Pipeline: What The Open-Source Repo Actually Shows

This file separates the visible public puzzle system from the less visible upstream mining problem.

## What Is Clearly Visible

### 1. Stored puzzle shape

From `modules/puzzle/src/main/Puzzle.scala`, a published puzzle stores:

- `id`
- `gameId`
- `fen`
- `line: NonEmptyList[Uci.Move]`
- `glicko`
- `plays`
- `vote`
- `themes`

Important meaning:

- the stored puzzle starts from a FEN before the first move in `line`
- `line.head` is the initial move after the start position
- `line.tail` is the remaining continuation

### 2. Client/runtime puzzle payload

From `modules/puzzle/src/main/JsonView.scala`:

- `solution` sent to clients is `puzzle.line.tail.map(_.uci)`
- the standalone payload also exposes:
  - `fenAfterInitialMove`
  - `lastMove = puzzle.line.head.uci`

Meaning:

- the player is shown the position after the initial move context is established
- the remaining line is the solution path

This is a published-puzzle runtime representation, not a mining algorithm.

### 3. Puzzle branch-tree reconstruction

Also in `JsonView.scala`, `makeTree(puzzle)` rebuilds a branch tree from `puzzle.line.tail`.

Meaning:

- public puzzles are served from a precomputed line
- the client is not discovering the line dynamically from game analysis

### 4. Post-creation tagging

From `PuzzleTagger.scala`:

- `opening` / `middlegame` / `endgame` theme is inferred from `Divider`
- hidden `checkFirst` is added if the first continuation gives check and the puzzle is not mate in
  one

This is enrichment after puzzle existence, not proof of how the puzzle was mined.

### 5. Post-solve rating logic

From `PuzzleFinisher.scala`:

- puzzle/user ratings update after solves
- theme classes influence rating weight

Again:

- this affects puzzle difficulty tracking
- it does not create puzzles

### 6. Faulty-puzzle / multiple-solution reporting

From `ui/puzzle/src/report.ts` plus `ui/lib/src/ceval/winningChances.ts`:

- Lichess has a visible client-side path for reporting puzzles that appear to have multiple
  solutions
- this is one of the strongest visible clues about what Lichess considers puzzle ambiguity

Confirmed checks before reporting:

- user must be logged in
- puzzle must be in `view` mode
- not in threat mode
- puzzle cannot be a mate-themed puzzle
- piece count must be greater than 7
- active engine must support the needed worker/import behavior
- report dialog must not have been hidden recently
- current node must align with the solution path

Confirmed eval-quality gates:

- local eval depth must be at least `18`
- and either:
  - depth is above `50`
  - or nodes are above `25,000,000`
- both best and second-best PVs must exist
- both must have more than one move
- `winningChances.hasMultipleSolutions(...)` must pass
- the trigger must happen twice before the report dialog appears

This still is not the upstream mining algorithm.
But it is concrete evidence about what Lichess considers too ambiguous for a good puzzle.

## What The Repo Does Not Clearly Show

The following are not clearly exposed as a complete open-source pipeline here:

- a first-class module that scans analyzed games and emits `Puzzle` records
- the exact tactical and engine criteria for deciding a moment is worth publication
- how many engine passes or line-stability checks are required
- how source games are filtered before mining
- how human play data interacts with engine-only quality checks before final publication

This means there is a real evidence boundary:

- we can describe the public puzzle object and runtime with confidence
- we cannot fully reconstruct the upstream mining algorithm from this repo alone

## Best Supported Inference

Strong but still partial inference:

- public puzzles are almost certainly created from analyzed tactical moments with a start FEN and a
  concrete continuation line
- their runtime structure is compatible with a "mistake moment + best line" model
- but the publication pipeline appears stricter and more curated than retrospection

Why that inference is reasonable:

- published puzzles require a stable line
- themes imply downstream tactical interpretation
- rating and replay systems imply a durable puzzle identity

Why it is still not proof:

- none of the checked code actually contains the upstream selector that says "this analyzed game
  moment becomes puzzle X"

## Practical Guidance For Patzer

If the goal is a local puzzle finder for imported, already-analyzed games:

- use Lichess retrospection as the primary behavioral reference
- use public puzzle shape as a later persistence/reference model
- do not wait for a mythical fully visible Lichess mining algorithm in this repo, because it is not
  exposed clearly enough

The safest Patzer strategy is:

1. build local candidate mining from reviewed mainline swings
2. require a stored best alternative line
3. support puzzle-like solve flow on top of that
4. later add stricter gates for what counts as "saved puzzle worthy"

That path is actually supported by visible code
