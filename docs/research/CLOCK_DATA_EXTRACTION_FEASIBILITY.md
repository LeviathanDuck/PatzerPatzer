# Feasibility Study: Clock Data Extraction from Opponent Research Games

**Date**: 2026-03-30
**Prompt**: CCP-447
**Status**: Research deliverable — no code changes

---

## 1. Lichess PGN Clock Format and Extraction

### Format

Lichess embeds clock data as PGN comments using the `%clk` annotation:

```
1. e4 { [%clk 0:05:00] } 1... c5 { [%clk 0:05:00] } 2. Nf3 { [%clk 0:04:57] }
```

Format is `[%clk H:MM:SS]` (hours, minutes, seconds). Some games include tenths: `[%clk 0:00:03.2]`.

### Regex

```regex
/\[%clk\s+(\d+):(\d{2}):(\d{2}(?:\.\d)?)\]/g
```

### Current Parser Support

**Already handled.** The PGN parser at `src/tree/pgn.ts` (lines 52-61) already extracts `%clk` via chessops's `parseComment()` and stores it as `clock` (centiseconds) on each `TreeNode`.

### API Gap

The openings research Lichess fetch (`src/openings/import.ts`, line 103) does **not** include `clocks=true`. The main game import (`src/import/lichess.ts`, line 22) does. Adding `params.set('clocks', 'true')` to the research import URL is a one-line fix.

---

## 2. Chess.com PGN Clock Format

Chess.com uses the same `%clk` format:

```
1. e4 {[%clk 0:09:59.2]} 1... e5 {[%clk 0:09:58.8]}
```

Minor differences:
- Chess.com consistently includes tenths of seconds
- Chess.com may omit the space after `%clk`

The chessops parser and the regex above handle both formats. **No format-specific branching needed.** Chess.com always includes clock data (no opt-in parameter required).

---

## 3. Analytics Unlocked by Clock Data

### 3a. Time Pressure Detection

Identify when the opponent enters time pressure (e.g., below 30s in a 5-minute game). Cross-reference with the move where they leave book.

### 3b. Flagging / Timeout Tendencies

The existing `TerminationProfile` tracks timeout outcomes. Clock data adds nuance: how often does the opponent reach time pressure even in games they don't flag?

### 3c. Move Speed In/Out of Book

By comparing clock consumption in the opening vs middle game:
- **Prepared lines**: moves played with <2-3s indicate known theory
- **Book exit point**: the move where time-per-move spikes
- **Preparation depth**: average ply where move speed exceeds a threshold

If an opponent spends <2s per move through move 12 in the Sicilian but 30s+ on move 13, their preparation ends at move 12.

### 3d. Time Allocation Profile

Aggregate clock data across games: what percentage of time consumed at each move number? Front-loaders vs rush-the-opening players.

### 3e. Clock-Correlated Blunder Rate (Future)

When engine analysis is available on research games, combining clock + eval changes reveals whether mistakes cluster under time pressure. Deferred but clock extraction is a prerequisite.

---

## 4. Storage Approach

### Recommendation: Extend ResearchGame (Option A)

Add `clocks?: number[]` to `ResearchGame`. Extract once at import time.

**Pros**: Pre-extracted data available instantly. Clean separation. Backward compatible (optional field). Modest storage cost (~1-2KB per game).

**Alternative** (extract on-demand from PGN): No schema change, but re-parsing PGN for every analytics run adds latency and fragility.

### Implementation (3 changes)

1. Add `clocks?: number[]` to `ResearchGame` in `types.ts`
2. In `pgnToResearchGame()` in `import.ts`, walk the mainline collecting `node.clock` values
3. Add `params.set('clocks', 'true')` to the Lichess research fetch URL

Touches 2 files, well within the 1-3 file constraint.

---

## 5. Risks and Limitations

### 5a. Missing Clock Data

- Lichess: only with `clocks=true` (currently missing from research import)
- Chess.com: always included
- PGN paste/upload: depends on source
- Older games: some platforms didn't record clocks

All clock-dependent analytics must degrade gracefully when `clocks` is undefined.

### 5b. Increment and Delay

Clock remaining can increase between moves due to increment. Time spent calculation must account for this:

```
timeSpent = previousClock - currentClock + increment
```

Increment derived from `TimeControl` header (e.g., `300+3`).

### 5c. Correspondence / Daily Games

Daily games have fundamentally different clock format. Already filtered in Chess.com fetch. Clock analytics should be restricted to real-time time controls.

### 5d. Storage Migration

Existing collections lack clock data. Options:
- Accept (simplest, recommended)
- Offer "re-extract clocks" action (nice-to-have)

### 5e. "Book Exit" Detection Accuracy

Fast moves could indicate: known theory, premoves, simple recaptures, or habitual fast play. Cross-referencing move speed with opening tree frequency data improves accuracy.

---

## Summary

Clock data extraction is highly feasible. The hard parts are already solved:
- PGN parser already extracts `%clk` via chessops
- Both platforms use the same format
- `TreeNode` already has a `clock` field

Remaining work is minimal: one API parameter, one optional field, a few lines of extraction code. The analytics unlocked (preparation depth, time pressure, book exit) are directly relevant to opponent research.
