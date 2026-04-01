# Audit: Learn From Your Mistakes — Moment Selection vs Lichess

**Date:** 2026-03-31
**Scope:** `src/analyse/retro.ts`, `src/analyse/retroCtrl.ts`, `src/analyse/retroMoveHandler.ts`, `src/main.ts` (puzzle creation), `src/engine/batch.ts`, `src/analyse/retroConfig.ts`
**Reference:** `~/Development/lichess-source/lila/ui/analyse/src/retrospect/retroCtrl.ts`, `nodeFinder.ts`

---

## Summary

| # | Question | Status | Severity |
|---|---|---|---|
| 1a | Solution move in retro session (`cand.bestMove`) | Conditionally wrong — live ceval can overwrite parentEval.best | High |
| 1b | `strictSolutionMove` in manual puzzle creation | **Confirmed bug** — set to played move, not engine best | High |
| 2 | Candidate scoring thresholds | Known documented divergence (default is 2× stricter than Lichess) | Low |
| 3 | Near-best acceptance threshold | Match ✓ | None |
| 4 | False-positive candidates (solution = played move) | **Confirmed** — structural root cause identified | High |
| 5 | Depth dependency / eval consistency | **Confirmed** — live ceval can overwrite `parentEval.best` post-batch | High |

---

## Q1a. Solution move in retro session

### How Lichess resolves the solution node

`retroCtrl.ts → jumpToNext()`:

```typescript
const solutionNode = prev.node.children.find(n => !!n.comp)!;
```

The `comp` property is set **server-side** by Lichess's analysis backend on exactly one child: the engine's best move. The solution is frozen at server analysis time and cannot change.

`hasCompChild(prev)` in `nodeFinder.ts` is a **prerequisite** for candidate selection:

```typescript
curr.eval && prev.eval && hasCompChild(prev) && (|povDiff| > 0.1 || missed-mate)
```

If there is no `comp` child, the position is never a candidate. This ensures the solution is always available and always correct.

### How Patzer resolves the solution move

`retro.ts → buildRetroCandidates()`, line 265:

```typescript
bestMove: parentEval.best,
```

`parentEval` is the live `evalCache` entry for the parent position **at the time `buildRetroCandidates` is called**. The `best` field is populated during batch analysis but can be **overwritten at any time** by the live ceval engine.

### When does "solution = played move" occur?

The scenario:

1. Batch review runs at depth D. For parent position P: engine says best move = X (user played Y ≠ X). `parentEval.best = X`, child eval stores `loss > threshold`.
2. User opens analysis. Live ceval runs at depth D+10. At greater depth, engine now evaluates Y (the user's actual move) as best: `parentEval.best` is overwritten to Y.
3. User opens "Learn From Your Mistakes." `buildRetroCandidates` reads `parentEval.best = Y = node.uci`.
4. Candidate is built with `bestMove = Y = node.uci` (played move) but still has the original `loss > threshold` from step 1.
5. Retro session starts and shows: "Find the best move" → solution = the move you played. ✗

**Root divergence:** Lichess uses an immutable server-assigned `comp` child. Patzer uses a mutable `evalCache.best` field that is shared between batch analysis and live ceval. The two writers are not coordinated.

---

## Q1b. `strictSolutionMove` in manual puzzle creation (confirmed bug)

**File:** `src/main.ts`, line 351
**Function:** `createPuzzleFromMove()` (Branch 1: "save this move as a puzzle")

```typescript
strictSolutionMove: node.uci,   // ← BUG: this is the PLAYED (mistake) move
```

`node` here is the mistake move node (the child). `node.uci` is the move the user played that was flagged as a mistake. The puzzle starts at `parent.fen` (the position before the mistake), so the correct solution is `parentEval.best` (the engine's best from that position).

Setting `strictSolutionMove = node.uci` means the puzzle checker requires the user to play the same mistake again to "solve" the puzzle.

Compare with Branch 2 (`createPuzzleFromStart`, line 393):

```typescript
strictSolutionMove: cached.best,   // ✓ correct: engine best from puzzle-start position
```

Branch 2 correctly uses the engine best move. Branch 1 does not.

**Impact:** Any puzzle saved via right-click "Use this move as puzzle start" (Branch 1) will require the user to reproduce their own mistake to solve it.

---

## Q2. Candidate scoring thresholds

### Lichess (`nodeFinder.ts`)

```typescript
Math.abs(winningChances.povDiff('white', prev.eval, curr.eval)) > 0.1
```

`povDiff('white', prev, curr) = (prevWc - currWc) / 2` — always white-perspective, absolute value, threshold **0.1** on the halved scale (= 20 percentage-point swing in raw WC).

### Patzer (`retro.ts`, `retroConfig.ts`)

```typescript
stored.loss = (moverParentWc - moverNodeWc) / 2;
```

`loss >= 0.05` → inaccuracy (= Lichess parity)
`loss >= 0.10` → mistake (default, 2× stricter than Lichess)
`loss >= 0.15` → blunder (3× stricter)

The default `minClassification: 'mistake'` suppresses inaccuracies that Lichess would surface. This is **documented** in `retro.ts` (line 135–138) and `retroConfig.ts` (line 14–19). Not a bug — an intentional configuration choice. Setting `minClassification: 'inaccuracy'` achieves Lichess candidate parity.

**Verdict:** Known, documented divergence. ✓

---

## Q3. Near-best acceptance threshold

### Lichess (`retroCtrl.ts`)

```typescript
const diff = winningChances.povDiff(color, node.ceval!, cur.prev.node.eval!);
if (diff > -0.04) onWin();
```

`povDiff(color, node, prev) = (toPov(color, nodeWc) - toPov(color, prevWc)) / 2`

### Patzer (`retroCtrl.ts`, lines 367–373)

```typescript
const diff = (nodeWc - parentWc) / 2;
if (diff > -0.04) { /* win */ }
```

Both `nodeWc` and `parentWc` are already converted to the mover's perspective via `toPov`. The formulas are mathematically identical.

**Verdict:** Match ✓

---

## Q4. False-positive candidates (session shows misleading exercises)

**Structural cause:** Patzer uses `nodeEval.loss` (computed once at batch time) alongside `parentEval.best` (mutable, can be updated by live ceval). These two fields can diverge:

- `nodeEval.loss` reflects the win-chance drop at **batch depth**
- `parentEval.best` reflects the engine's opinion at **live ceval depth** (which is higher)

After live ceval reruns the parent position at higher depth, `parentEval.best` may change. But `nodeEval.loss` is never recalculated. A candidate built after this divergence has:
- `bestMove = live-ceval best` (potentially = played move)
- `loss = batch-depth loss` (potentially > threshold)

This is an internal inconsistency in the evaluation data that causes the "solution = move I played" symptom.

In addition, shallow-depth analysis (low `reviewDepth`) is more likely to produce noisy `loss` values that contradict the higher-depth live ceval best-move judgment.

**Lichess does not have this problem** because:
1. Server analysis runs at high fixed depth
2. Candidate selection and solution assignment use the same server-computed data
3. `comp` children are immutable once set

---

## Q5. Depth dependency

**Confirmed.** The `loss` field is written once in `batch.ts:185` during the batch review and is never recalculated. The batch runs at `reviewDepth` (configurable, currently defaults to ~18). The live ceval runs at progressively increasing depth (up to 22+).

**Consequence:** If the user runs the game review at a shallow depth (or with fast settings), then opens analysis (causing live ceval to run deeper), then starts "Learn From Your Mistakes," the candidates are built with:

- `loss` = shallow-depth estimate (from batch)
- `parentEval.best` = deep-depth best (from live ceval)

These can disagree, producing false-positive candidates or wrong solution moves.

---

## Ranked Divergences

| Rank | Issue | Severity | Root |
|---|---|---|---|
| 1 | `strictSolutionMove: node.uci` in `createPuzzleFromMove` | **Blocking** | Bug |
| 2 | Live ceval can overwrite `parentEval.best` after batch, invalidating built candidates | **High** | Architecture |
| 3 | `loss` never recalculated after initial batch write; can diverge from current `best` | **High** | Architecture |
| 4 | Default `minClassification: 'mistake'` is 2× stricter than Lichess, suppressing valid moments | **Medium** | Config choice |
| 5 | No `hasCompChild`-equivalent gate; any position with `parentEval.best` can be a candidate | **Medium** | Architecture |

---

## Recommended Fix Prompts

### Fix 1 (Blocking): `createPuzzleFromMove` uses wrong `strictSolutionMove`

**File:** `src/main.ts`, ~line 351
**Fix:** Change `strictSolutionMove: node.uci` to `strictSolutionMove: parentEval?.best ?? node.uci` (use engine best, fall back to played move only if no eval).

### Fix 2 (High): Freeze `bestMove` at batch-analysis time

**File:** `src/engine/batch.ts` + `src/analyse/retro.ts`
**Fix:** When batch analysis completes, store a snapshot of `parentEval.best` in a separate `batchBestMove` field in the eval cache (or in the IDB analysis nodes). `buildRetroCandidates` should read `batchBestMove` rather than the live `parentEval.best`. This prevents live ceval from corrupting the session's solution moves.

Alternatively: store `bestMove` inside the `loss`-bearing child eval entry (so both come from the same analysis pass and cannot diverge).

### Fix 3 (Medium): Consider changing default minClassification to 'inaccuracy'

This is a UX/tuning decision, not a bug fix. Surfacing more moments aligns with Lichess behavior but may produce more exercises than desired. Separate prompt.

---

*No code was changed as part of this audit.*
