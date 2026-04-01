# Feasibility Study: Low-Depth Stockfish Analysis of Opponent Research Collections

**Date**: 2026-03-30
**Prompt**: CCP-446 (Opus-specific research task)
**Status**: Research deliverable — no code changes

---

## 1. Can Stockfish at Depth 8-10 Process 1000 Games in < 60 Seconds?

### Current Architecture

Patzer Pro runs **two independent Stockfish WASM instances**:

- **Primary engine** (`src/engine/ctrl.ts`): Full-thread, high-hash live analysis. Defaults to `navigator.hardwareConcurrency - 1` threads, 256 MB hash.
- **Background review engine** (`src/engine/reviewQueue.ts`): Constrained at `Threads=1, Hash=32`. Runs game reviews without blocking UI.

Both use `@lichess-org/stockfish-web` via `src/ceval/protocol.ts`. A third instance would allocate ~96 MB WASM memory.

### Throughput Estimate

- Typical game: ~40 moves = ~80 positions
- 1000 games = ~80,000 positions
- At depth 8 with Threads=1, Hash=16: ~10 ms/position on modern hardware

**Result: 80,000 x 10ms = ~800 seconds (~13 minutes)**

### Verdict: No, Not Within 60 Seconds

Realistic targets:

| Strategy | Time |
|---|---|
| 200-300 games at depth 8 | ~2-3 minutes |
| 1000 games with selective position sampling (~15-20 positions/game) | ~3-5 minutes |
| Depth 4-6 instead of 8-10 | Still ~3-5 minutes for 1000 games |

Users should expect a progress bar, not instant results.

### Recommendation: Reuse Existing Background Engine

Rather than spawning a third Stockfish instance, reuse `reviewProtocol` from `reviewQueue.ts` when idle. Avoids 96 MB memory overhead. Tradeoff: collection analysis and game review cannot run simultaneously (acceptable for separate workflows).

---

## 2. What Useful Data Would Low-Depth Analysis Yield?

### 2a. Blunder Detection — High Value, Reliable at Depth 8

Depth 8 detects: hanging pieces (depth 2-4 sufficient), simple tactical oversights (depth 6-8), one-move blunders with eval swing > 200 cp.

The existing `evalWinChances()` and `classifyLoss()` from `src/engine/winchances.ts` work regardless of depth.

**Limitation**: Misses deep tactical sequences (4+ move combos). ~10-20% false positive/negative rate vs depth 16.

### 2b. Phase Accuracy — Moderate Value

Per-position evals enable accuracy by game phase:
- Opening (moves 1-15)
- Middlegame (moves 16-35)
- Endgame (moves 36+)

Depth 8 is sufficient because averaging over many positions and games smooths out noise. Statistical aggregate use case.

### 2c. Time-Pressure Correlation — Requires Clock Data

Not feasible without per-move clock extraction. If clock data were added, correlating accuracy drops with remaining time at depth 8 would be meaningful.

### 2d. Other Useful Derivatives

- Opening deviation quality (did leaving book cause eval drop?)
- Comeback/collapse patterns
- Tactical vulnerability score (% of games with blunder > 200 cp)
- Endgame conversion rate

---

## 3. Integration Path

### 3a. Batch Trigger

Collection card adds "Analyze" button. Controller parses each `ResearchGame.pgn` via `pgnToTree()`, builds position list, feeds positions to engine at shallow depth. Mirrors `reviewQueue.ts` pattern.

### 3b. Results in Openings IDB

New `collection-analysis` object store in `patzer-openings` (version bump to 4):

```typescript
interface CollectionAnalysis {
  collectionId: string;
  depth: number;
  analyzedAt: number;
  gameResults: Array<{
    gameId: string;
    accuracy: { white: number | null; black: number | null };
    blunderCount: number;
    phaseAccuracy?: { opening: number; middlegame: number; endgame: number };
  }>;
  aggregate: {
    avgAccuracy: number;
    blunderRate: number;
    phaseProfile: { opening: number; middlegame: number; endgame: number };
  };
}
```

Store only aggregates per game, not per-position evals. Keeps IDB footprint small.

### 3c. Engine Reuse

Reuse `reviewProtocol` with mutual exclusion: if bulk review is running, disable collection analysis (and vice versa).

---

## 4. UI Sketch

**Before analysis**: `[ Analyze Collection ]` button on card

**During**: `[ ████████░░░░░░  57/143 games  |  Cancel ]`

**After**: Accuracy badges on card:
```
Avg Accuracy: 72.4%  |  Blunder Rate: 8.2%
Opening: 81%  |  Middlegame: 69%  |  Endgame: 67%
```

Per-game accuracy badges in the sample games view (green > 80%, yellow 60-80%, red < 60%).

---

## 5. Does This Cross the Architecture Boundary?

**No, if done correctly.** Results stored in `patzer-openings` IDB (not `patzer-pro`). The eval data serves the research workflow and belongs with research data.

Runtime coupling via shared engine is acceptable — an operational constraint, not an architectural violation.

**What would violate the boundary** (must not do):
- Storing collection analysis in `patzer-pro` IDB
- Feeding research game evals into the Stats dashboard
- Using `buildAnalysisNodes()` / `saveAnalysisToIdb()` for research games

---

## 6. Risks and Limitations

| Risk | Severity | Mitigation |
|---|---|---|
| 1000-game analysis takes 10+ minutes | Medium | Progress bar, cancel/pause, 200-game initial cap |
| Third WASM instance causes OOM on 8 GB | High | Reuse `reviewProtocol` instead |
| Depth 8 misclassifies complex positions | Medium | Label as "Quick Analysis", show depth indicator |
| False blunder detection in sharp positions | Medium | Use win-chance loss (sigmoid) not raw cp delta |
| Engine contention with review queue | Medium | Mutual exclusion — only one runs at a time |
| Scope creep into full game analysis | High | Store only aggregates, no per-position evals |

---

## Recommendations

1. **Start with a 200-game cap** — keeps analysis under 3 minutes
2. **Reuse `reviewProtocol`** — no third engine instance
3. **Store only aggregates** — not per-position evals
4. **Use depth 8 default** — sweet spot for speed vs blunder detection
5. **Add clock data extraction first** if time-pressure correlation is desired
6. **Target the prep-report tool** as primary consumer

---

## Summary

Low-depth collection analysis is feasible and architecturally clean. Main constraint: 1000 games at depth 8 takes ~10 minutes, not 60 seconds. A 200-game initial cap with progress UI makes this practical. The existing background engine can be reused. Blunder detection and phase accuracy are the highest-value outputs. Clock/time-pressure analysis requires separate PGN parser enhancement.
