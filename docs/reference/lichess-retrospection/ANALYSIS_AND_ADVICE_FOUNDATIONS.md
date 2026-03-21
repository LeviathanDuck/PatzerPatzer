# Analysis And Advice Foundations

This file covers the upstream ingredients that make a move even eligible to look "mistake-worthy"
before retrospection starts.

## Why This Matters

Retrospection is downstream of game analysis. It does not invent move quality from nothing.
Lichess first needs:

- analyzed positions with evals and best lines
- move-by-move advice data
- computer alternatives attached to the pre-mistake node

Without that substrate, `evalSwings(...)` cannot produce meaningful learn candidates.

## Winning Chances Math

Source:
- `ui/lib/src/ceval/winningChances.ts`
- `modules/tree/src/main/Advice.scala`

Confirmed UI-side conversion:

- raw winning chances use:
  - `2 / (1 + exp(MULTIPLIER * cp)) - 1`
- with:
  - `MULTIPLIER = -0.00368208`
- centipawns are clamped to `[-1000, 1000]` before conversion

Meaning:

- Lichess normalizes eval swings into bounded winning-chances space
- this is why thresholds like `0.1` and `0.04` are usable across different raw cp positions

Mate conversion:

- mate scores are converted into cp-equivalent buckets:
  - `cp = (21 - min(10, abs(mate))) * 100`
  - sign follows mate sign

Then the same raw winning-chances curve is applied.

## Advice Classification

Source:
- `modules/tree/src/main/Advice.scala`

Confirmed judgement thresholds:

- `0.3` => `Blunder`
- `0.2` => `Mistake`
- `0.1` => `Inaccuracy`

Confirmed delta formula in `CpAdvice.apply(prev, info)`:

- compute previous and current winning chances from cp
- `delta = currentWinningChances - prevWinningChances`
- then adjust by mover color:
  - white move => negate delta
  - black move => keep delta as-is

Interpretation:

- positive final `delta` means the player who just moved made things worse for themselves
- these thresholds are not raw centipawn thresholds
- they are winning-chances loss thresholds

## Mate-Based Advice

Confirmed mate sequence types:

- `MateCreated`
- `MateDelayed`
- `MateLost`

Visible advice outcomes:

### `MateCreated`

Meaning:
- the previous position was not mate, and the next score is a forced mate against the mover

Judgement:
- if `prevPovCpOrZero < -999` => `Inaccuracy`
- else if `prevPovCpOrZero < -700` => `Mistake`
- else => `Blunder`

### `MateLost`

Meaning:
- the mover had a forced mate before, but the next score loses that forced mate

Judgement:
- if `povCpOrZero > 999` => `Inaccuracy`
- else if `povCpOrZero > 700` => `Mistake`
- else => `Blunder`

### `MateDelayed`

Confirmed:
- returns `None`
- does not generate move advice

Important implication:

- not every worsening mate sequence becomes a review label
- Lichess distinguishes "lost mate" from merely "not best mate sequence"

## Relationship To Retrospection

Retrospection does not literally call `Advice.apply(...)` in the visible client code, but the two
systems are aligned around the same winning-chances language:

- advice thresholds:
  - `0.1`, `0.2`, `0.3`
- retrospect candidate floor:
  - `> 0.1`
- ceval fallback accept window:
  - `> -0.04`

This is the visible staircase:

1. analysis builds eval/best-line substrate
2. advice labels moves by win-chance loss
3. retrospection finds candidate swings from reviewed mainline data
4. solve-time acceptance allows near-best outcomes within a smaller margin

## What This Suggests For Patzer

Safe first-pass stance:

- keep Patzer review labels and Patzer retrospection candidates in the same winning-chances space
- do not mix raw-cp thresholds and win-chance thresholds casually
- treat `> 0.1` as the visible Lichess floor for "this might be worth revisiting"
- treat exact-best-only as an MVP simplification, not as a claim of Lichess parity
