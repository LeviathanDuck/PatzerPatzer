# Parameters And Thresholds

This file is the compact rules catalog for everything visible in Lichess source that influences
retrospection candidate selection, solve acceptance, and puzzle-adjacent labeling.

## Retrospection Candidate Requirements

Source:
- `ui/analyse/src/nodeFinder.ts`
- `ui/analyse/src/retrospect/retroCtrl.ts`

A move is a learn candidate only if all of these are true:

1. It is on the mainline slice being evaluated.
2. It passes the color filter:
   - white review: odd ply
   - black review: even ply
3. The current node has `curr.eval`.
4. The previous node has `prev.eval`.
5. The previous node has a computer child:
   - `prev.children.some(c => !!c.comp)`
6. One of the swing conditions is true:
   - `abs(winningChances.povDiff('white', prev.eval, curr.eval)) > 0.1`
   - or `prev.eval.mate` existed, `curr.eval.mate` does not, and `abs(prev.eval.mate) <= 3`

This is the most important visible rule set in the entire research set.

## Move-Advice Thresholds

Source:
- `modules/tree/src/main/Advice.scala`
- `ui/lib/src/ceval/winningChances.ts`

Confirmed cp-based move labels:

- `0.3` winning-chances loss => `Blunder`
- `0.2` winning-chances loss => `Mistake`
- `0.1` winning-chances loss => `Inaccuracy`

Confirmed winning-chances coefficient:

- `MULTIPLIER = -0.00368208`

Confirmed cp clamp before conversion:

- `[-1000, 1000]`

This matters because Lichess retrospection's `> 0.1` candidate floor is not arbitrary. It sits
exactly on the visible inaccuracy threshold line.

## Retrospection Candidate Exclusions

Confirmed exclusions:

- already solved plies
- plies added to `explorerCancelPlies`

Opening cancellation rule:

- only in standard chess
- only when `game.division` is present
- only before middle-game boundary
- if master explorer says the played move is still a real opening move, the candidate is skipped

Explorer opening inclusion threshold:

- a master move is considered meaningful enough if:
  - `m.white + m.draws + m.black > 1`

That is a low threshold. It is not "very common opening move"; it is "more than one recorded master
game outcome total."

## Retrospection Solve Acceptance

### Immediate success

The attempt is accepted immediately if any of these are true:

- the move UCI is in `openingUcis`
- SAN ends with `#`
- the resulting node is marked `comp`

### Immediate failure

The attempt fails immediately if:

- the resulting node has `node.eval`

This is how Lichess fast-rejects known bad or already-evaluated alternatives.

### Ceval fallback acceptance

If neither immediate case applies:

- feedback becomes `eval`
- ceval must become "ready"
- then the move passes if:
  - `winningChances.povDiff(color, node.ceval!, cur.prev.node.eval!) > -0.04`

This means:

- the move may still lose a little value relative to the pre-mistake position
- but not more than a 0.04 winning-chances drop from the reviewed baseline

For Patzer, this is the single strongest visible numeric hint for a future "close enough" rule.

## Ceval Readiness Thresholds

Ceval is considered ready if either:

- `depth >= 18`
- or `depth >= 14 && millis > 6000`

Interpretation:

- depth 18 is treated as strong enough outright
- depth 14 is accepted only with enough elapsed time

## View Progress Thresholds

Source:
- `ui/analyse/src/retrospect/retroView.ts`

Eval progress bar thresholds:

- `minDepth = 8`
- `maxDepth = 18`

These are display thresholds, not solve acceptance thresholds.

## Puzzle Tagging Thresholds Visible In Public Module

Source:
- `modules/puzzle/src/main/PuzzleTagger.scala`
- `modules/puzzle/src/main/PuzzleFinisher.scala`

### Phase tagging

Using `Divider(List(position.board))`:

- `Division(None, Some(_), _)` => `endgame`
- `Division(Some(_), None, _)` => `middlegame`
- otherwise => `opening`

This is post-creation classification, not candidate mining.

### `checkFirst` theme

Added if:

- puzzle is not `mateIn1`
- the first continuation move after the initial move results in check

Again, this is post-creation enrichment, not mining.

### Rating weight by theme visibility

Visible in `PuzzleFinisher.scala`, not for generation but for post-solve Glicko updates:

- obvious theme, correct solve => `0.1`
- obvious theme, failed solve => `0.4`
- hinting theme, correct solve => `0.2`
- hinting theme, failed solve => `0.7`
- non-hinting theme, correct solve => `0.7`
- non-hinting theme, failed solve => `0.8`

This is useful because it shows Lichess explicitly distinguishes:

- obvious puzzles
- hinting puzzles
- non-hinting puzzles

But it still does not tell us how a moment becomes a public puzzle in the first place.

## Faulty-Puzzle / Multiple-Solution Thresholds

Source:
- `ui/lib/src/ceval/winningChances.ts`
- `ui/puzzle/src/report.ts`
- `ui/lib/tests/winningChances.test.ts`

Visible similarity threshold:

- `areSimilarEvals(...)` is true if:
  - `povDiff(pov, bestEval, secondBestEval) < 0.14`

Visible multiple-solution threshold:

- `hasMultipleSolutions(...)` is true if either:
  - second-best winning chances for the solving side are at least `0.3524`
  - or `areSimilarEvals(...)` is true

Visible reporting-quality gates before Lichess even proposes reporting a puzzle as faulty:

- local eval depth at least `18`
- and either:
  - `depth > 50`
  - or `nodes > 25_000_000`
- best PV exists
- second-best PV exists
- both PVs have more than one move
- the multiple-solution condition triggers twice in a row

What this does and does not mean:

- this is not a public-puzzle generator threshold
- it is a visible ambiguity threshold for saying a published puzzle may be faulty or too
  multi-solution
- it is still one of the best concrete clues about what Lichess considers too loose for high puzzle
  quality

## What Thresholds Are Not Visible

The open-source repo does not clearly expose numeric upstream thresholds for public puzzle mining
such as:

- minimum eval swing to become a public puzzle
- minimum line depth or tactical forcing-ness
- rejection of quiet strategic moves
- uniqueness requirements for first move
- line stability requirements across multiple engine passes
- source-game quality requirements beyond using the larger Lichess game corpus

Those remain `unknown` from the checked code here.

## Safe Takeaways For Patzer

Confirmed safe takeaways:

- a `> 0.1` winning-chances swing is Lichess's visible floor for retrospection candidates
- missed mate in 3 or less is explicitly special-cased
- a stored engine alternative line is required
- opening/book cancellation matters before middle game
- near-best acceptance can use a small negative margin rather than exact-best only

Unsafe overclaim:

- saying "Lichess public puzzles are generated with the exact same thresholds"

The visible source does not prove that
