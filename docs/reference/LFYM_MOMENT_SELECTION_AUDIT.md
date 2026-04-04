# Learn From Your Mistakes Moment Selection Audit

Audited for:
- `CCP-594`
- `CCP-594-F1`

Related references:
- [patzer-retrospection-audit.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/patzer-retrospection-audit.md)
- [lichess-retrospection/README.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection/README.md)
- [lichess-retrospection-ux/README.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection-ux/README.md)

Sources inspected:
- `~/Development/lichess-source/lila/ui/analyse/src/retrospect/retroCtrl.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/retrospect/retroView.ts`
- [retro.ts](/Users/leftcoast/Development/PatzerPatzer/src/analyse/retro.ts)
- [retroCtrl.ts](/Users/leftcoast/Development/PatzerPatzer/src/analyse/retroCtrl.ts)
- [retroMoveHandler.ts](/Users/leftcoast/Development/PatzerPatzer/src/analyse/retroMoveHandler.ts)
- [main.ts](/Users/leftcoast/Development/PatzerPatzer/src/main.ts)

## Goal

Answer the original `CCP-594` comparison questions in a durable repo document and identify the highest-confidence divergences that can cause questionable LFYM moments.

## Question 1: Solution Move Assignment

### Patzer

There are two relevant paths in [main.ts](/Users/leftcoast/Development/PatzerPatzer/src/main.ts):

1. `createPuzzleFromPlayedMove(path)`
- `solutionLine` uses `parentEval.moves` when available, else `[node.uci]`
- `strictSolutionMove` is set to `node.uci`

2. `createPuzzleFromStart(path)`
- `solutionLine` uses `cached.moves` when available, else `[cached.best]`
- `strictSolutionMove` is set to `cached.best`

### Answer

For the first path, `node.uci` is the move the user actually played, not the engine best move.

That means:
- this path can absolutely produce "solution = move I played"
- but it is a manual puzzle-save path, not the LFYM candidate-selection controller itself

### Lichess comparison

In Lichess retrospection, the solution is derived from the engine/computer solution node (`comp` child), not from "the move the user played."

### Match or diverge?

Diverge, but in a scoped way:
- this is a real divergence for manually saved puzzle definitions
- it is not direct proof that LFYM candidate selection itself is assigning the wrong solution move

## Question 2: Candidate Scoring Thresholds

### Lichess

In `retroCtrl.ts`, learnable moments are derived from `evalSwings(...)`.
Patzer's own code comments and reference docs correctly note the visible Lichess floor:
- `|povDiff| > 0.1` on the un-halved scale

### Patzer

In [retro.ts](/Users/leftcoast/Development/PatzerPatzer/src/analyse/retro.ts):
- candidate inclusion uses `loss >= retroConfig.minLossThreshold`
- default comment says `0.10 = 10%`

Patzer stores:
- `loss = (moverParentWc - moverNodeWc) / 2`

So on Patzer's halved scale:
- `0.05` is the inaccuracy-like Lichess floor
- `0.10` is stricter

### Match or diverge?

Diverge.

Patzer's default threshold is stricter than the visible Lichess baseline unless the user lowers it.

### Severity

Medium.

This can make Patzer miss borderline learnable moments, but it does not directly explain "solution equals the move I played."

## Question 3: Near-Best Acceptance

### Lichess

In `retroCtrl.ts`, `checkCeval()` accepts the played move when:
- `winningChances.povDiff(color, node.ceval!, cur.prev.node.eval!) > -0.04`

### Patzer

In [retroCtrl.ts](/Users/leftcoast/Development/PatzerPatzer/src/analyse/retroCtrl.ts), the same threshold is implemented:
- `if (diff > -0.04) { ... _feedback = 'win'; ... }`

### Match or diverge?

Match on the threshold itself.

### Important caveat

Patzer's own comments admit a lifecycle gap:
- the `eval` path is only used when `_feedback === 'eval'`
- historically this path was dormant because exact-best handling bypassed it

So the numeric threshold matches Lichess, but the trigger path has been more fragile over time.

### Severity

Medium-high for UX correctness, but not a raw threshold mismatch.

## Question 4: False-Positive Candidate Risks

### Confirmed risk 1: candidate built from shallower data than later live eval

Patzer builds candidates from cached reviewed evals in [retro.ts](/Users/leftcoast/Development/PatzerPatzer/src/analyse/retro.ts).

Later, live engine updates can:
- deepen parent/node evals
- change which move looks best
- vindicate the original game move

This is exactly why the current tree now has:
- live best-move tracking in [retroCtrl.ts](/Users/leftcoast/Development/PatzerPatzer/src/analyse/retroCtrl.ts)
- background diff refresh in [retroMoveHandler.ts](/Users/leftcoast/Development/PatzerPatzer/src/analyse/retroMoveHandler.ts)

So yes: shallow or stale evals can create questionable moments.

### Confirmed risk 2: manual puzzle-save path can encode the played move as strict solution

As above, `createPuzzleFromPlayedMove()` is a real divergence.

### Confirmed risk 3: Patzer has extra candidate families beyond the simplest Lichess swing path

Patzer candidate building includes:
- missed mate
- swing
- collapse
- optional defensive family

These can be good product ideas, but they are broader than the simplest visible Lichess learn-from-mistakes pipeline.

### Match or diverge?

Diverge.

### Severity

High for UX trust when a flagged moment later looks dubious.

## Question 5: Depth Dependency

### Lichess

Lichess `checkCeval()` uses explicit readiness gates:
- depth >= 18
- or depth >= 14 with enough time

### Patzer

Patzer currently uses depth gates in [retroCtrl.ts](/Users/leftcoast/Development/PatzerPatzer/src/analyse/retroCtrl.ts):
- if `!ev.depth || ev.depth < 14` return

Patzer does not track the full Lichess millis-based readiness rule in the same way.

Candidate extraction itself still depends on the reviewed cache quality present at build time.

### Match or diverge?

Partial match.

Patzer has a real depth gate, but it is simpler than the Lichess readiness model and still more sensitive to cache quality at session-build time.

## Ranked Divergences

### 1. High: manual puzzle-save path can encode the played move as the strict solution

File:
- [main.ts](/Users/leftcoast/Development/PatzerPatzer/src/main.ts)

Impact:
- directly explains "solution = move I played" for that manual path

### 2. High: candidate quality still depends heavily on cached analysis depth at session-build time

Files:
- [retro.ts](/Users/leftcoast/Development/PatzerPatzer/src/analyse/retro.ts)
- [retroMoveHandler.ts](/Users/leftcoast/Development/PatzerPatzer/src/analyse/retroMoveHandler.ts)
- [retroCtrl.ts](/Users/leftcoast/Development/PatzerPatzer/src/analyse/retroCtrl.ts)

Impact:
- questionable moments can surface before deeper eval vindicates the game move

### 3. Medium-high: Patzer's candidate families are broader than the plain visible Lichess swing path

File:
- [retro.ts](/Users/leftcoast/Development/PatzerPatzer/src/analyse/retro.ts)

Impact:
- more potential for "why was this flagged?" moments

### 4. Medium: stricter default loss threshold than visible Lichess baseline

File:
- [retro.ts](/Users/leftcoast/Development/PatzerPatzer/src/analyse/retro.ts)

Impact:
- fewer moments than Lichess parity, but not usually misleading solution assignment by itself

## Recommended Follow-Up Directions

### 1. Separate manual puzzle-save correctness from LFYM candidate correctness

The `strictSolutionMove: node.uci` path should be treated as its own bug family if users are seeing "solution = move I played" in saved puzzles.

### 2. Keep improving live-vindication / deeper-eval correction before changing thresholds blindly

The stronger root-cause risk is stale or shallow candidate data, not only the threshold numbers.

### 3. Re-audit collapse/defensive additions if parity with Lichess is the goal

Those extra families may be useful, but they should be called out as deliberate Patzer divergence rather than assumed Lichess parity.

## Summary

The strongest source-confirmed answer is:
- yes, there is at least one Patzer path where the played move becomes the strict solution
- that path is in manual puzzle-save creation, not the core LFYM candidate builder

The broader LFYM trust issue is more likely caused by:
- candidate selection from shallower cached evals
- later live-engine vindication
- Patzer-specific candidate-family expansion beyond the plain Lichess baseline
