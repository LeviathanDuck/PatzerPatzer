# Patzer Implications

This file turns the Lichess research into concrete implementation guidance for Patzer Pro.

## What Patzer Can Safely Replicate First

From visible Lichess retrospection behavior, Patzer can safely adopt this first-pass local model:

1. Build candidates only from reviewed mainline moves.
2. Require:
   - previous eval
   - current eval
   - stored best move / best line at the previous node
3. Start with:
   - `mistake`
   - `blunder`
   - missed mate in 3 or less
4. Jump to the position before the mistake.
5. Store:
   - game identifier
   - path
   - FEN before
   - played move
   - best move
   - best line
   - classification
   - loss
   - missed-mate flag
   - player color
6. Use a dedicated retrospection controller instead of burying the mode in `src/main.ts`.
7. Integrate that controller with:
   - path changes
   - user move / jump flow
   - ceval updates
   - computer-line visibility

## What Patzer Should Defer

These are real Lichess-adjacent ideas, but they should not lead the first version:

- opening explorer cancellation
- near-best acceptance via local ceval fallback
- broader cross-game training queue
- side-line-aware retrospection beyond mainline-only first pass
- public-puzzle-style saved puzzle identity and difficulty system

Reason:

- Patzer still benefits more from a stable reviewed-game loop than from early cleverness

## What "Puzzle-Worthy" Can Mean In Patzer First

The visible Lichess code supports a narrower initial claim:

- "review-worthy mistake moment"

It does not fully support a stronger claim:

- "publication-worthy tactical puzzle moment"

For Patzer, the first local puzzle finder should therefore separate:

- `review candidate`
- `retrospection candidate`
- `saved puzzle candidate`

Those should not be treated as identical from day one.

## Recommended Local Candidate Ladder

### Tier 1: Retrospection-safe

Use when:
- mainline reviewed move
- persisted best move exists
- loss threshold is strong enough
- or missed mate-in-3 is visible

This tier maps most directly to Lichess retrospection.

### Tier 2: Puzzle-candidate

Add stricter filters later, such as:

- the engine line is forcing enough
- the best move is materially different from the played move
- the continuation is stable enough to save
- the moment is not just quiet positional drift

These are sensible future directions, but the visible Lichess repo does not fully specify them.

## Key Research Conclusions

### Confirmed

- Lichess retrospection uses a real candidate selector with explicit numeric gates
- it requires an engine alternative line
- it enters solve mode from the pre-mistake position
- it uses a dedicated feedback controller

### Strong inference

- Lichess public puzzles likely come from a stricter, more curated version of "interesting analyzed
  moment plus stable continuation line"

### Unknown

- the exact upstream public-puzzle mining thresholds and rejection heuristics

## Recommended Patzer Build Order

1. finish stable review annotations and best-line persistence
2. implement Lichess-style retrospection candidate building
3. implement retrospection controller and solve flow
4. record which candidates users actually solve/fail
5. only then add stricter local saved-puzzle gating

This sequence matches what the visible source actually supports.
