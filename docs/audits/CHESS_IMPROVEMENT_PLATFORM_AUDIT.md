# Patzer Pro: Imported-Game-Driven Chess Improvement Platform Audit

**Date:** 2026-03-29
**Scope:** Exhaustive research and product audit — what chess-improvement tooling can be built on top of an imported game library
**Status:** Research document, not implementation spec
**Last audited:** 2026-03-30

> **Implementation update (2026-03-30):** Several Phase 1 items from Section 9 are now implemented:
> - GameSummary type and persistence (`stats/types.ts`, `idb/index.ts`) — **done**
> - GameSummary extraction from analyzed games (`stats/extract.ts`) — **done**
> - Backfill for pre-existing analyzed games — **done**
> - Stats controller and routing (`stats/ctrl.ts`) — **done**
> - Weakness aggregation engine with 8 detectors (`stats/weakness.ts`) — **done**
> - Clock data extraction at import — **done**
> - Retro session result persistence — **done**
> - Stats dashboard view — **placeholder only** (framework exists, cards not built)
> - Per-game summary accuracy (basic chart) — **partial**
> - Opening performance table — **not started**
> - Training recommendations UI — **not started**

---

## 1. Executive Summary

### Biggest Opportunities

Patzer Pro already has the hardest infrastructure in place: game import from two platforms, full Stockfish analysis per position, win-chance loss classification, missed-moment detection, a move tree with path-keyed eval cache, retrospection (Learn From Your Mistakes), and a puzzle system with Glicko-2 rating. The codebase is genuinely strong. The gap is not in data access or engine capability — it is in **connecting existing analysis outputs into structured improvement feedback loops**.

The highest-leverage next moves are:

1. **Per-game review summaries** — after batch analysis, generate a structured summary (accuracy, worst phase, biggest miss, opening result, time-control performance) that tells the user *what to work on* rather than just showing numbers.
2. **Weakness categorization from analyzed games** — aggregate move-classification data across the game library to identify recurring error patterns (phase, motif, position type, color, time control).
3. **Training queue generation** — use weakness data to auto-populate puzzle and review queues targeting the user's actual weak spots.
4. **Longitudinal trend tracking** — store per-game summary metrics over time so the user can see whether their accuracy, blunder rate, opening performance, and conversion rate are improving or degrading.

### Strongest Findings

- The win-chance loss model (`src/engine/winchances.ts`) and move classification (`src/engine/tactics.ts`) already produce the raw signal needed for nearly every stat proposed in this audit. The problem is not data generation — it's aggregation, persistence, and presentation.
- The retrospection system (`src/analyse/retro.ts`, `retroCtrl.ts`) is an underappreciated asset. It is one of the few features that creates a *closed training loop* — mistake detection → guided practice → feedback. Most chess tools stop at "show the eval graph."
- Opening data is available via game metadata (ECO codes, opening names from PGN headers) but is not currently aggregated or tracked over time.
- Time/clock data is **not reliably present** in the current import pipeline. This limits time-management analysis significantly.
- The stats page (`/stats`) is currently a placeholder (`h('h1', 'Stats Page')`). There is no aggregation layer.

### What Patzer Should Prioritize

1. Build the stats aggregation layer from existing analyzed-game data (accuracy, classification counts, phase breakdowns, opening results).
2. Surface per-game review summaries immediately after analysis completion.
3. Connect weakness detection to puzzle and training recommendations.
4. Implement longitudinal storage (per-game summary snapshots persisted over time).
5. Build the stats page with high-signal metrics only.

### What to Avoid

- Don't build a vanity-metric dashboard full of 20+ metrics that look impressive but don't change behavior.
- Don't invest in time-management analysis until clock data availability is confirmed and reliable.
- Don't build complex classification taxonomies (positional themes, strategic motifs) that require NLP or position-pattern engines you don't have.
- Don't show aggregate stats without minimum sample sizes.
- Don't display improvement trends until the user has enough analyzed games to make trends meaningful (minimum ~20 games).

---

## 2. Current Patzer Baseline

### What the Repo Already Supports

| Capability | Status | Key Files |
|---|---|---|
| Game import (Lichess, Chess.com, PGN paste) | ✅ Live | `src/import/lichess.ts`, `chesscom.ts`, `pgn.ts` |
| Game library with metadata | ✅ Live | `src/games/view.ts`, `src/import/types.ts` |
| Full-game Stockfish analysis (batch) | ✅ Live | `src/engine/batch.ts`, `ctrl.ts` |
| Background review queue | ✅ Live | `src/engine/reviewQueue.ts` |
| Win-chance loss calculation | ✅ Live | `src/engine/winchances.ts` |
| Move classification (good/inaccuracy/mistake/blunder) | ✅ Live | `src/engine/winchances.ts` (classifyLoss) |
| Missed-moment detection (swing/mate/collapse) | ✅ Live | `src/engine/tactics.ts` |
| Per-game accuracy scoring | ✅ Live | `src/analyse/evalView.ts` |
| Eval bar, eval graph, PV display | ✅ Live | `src/ceval/view.ts`, `src/analyse/evalView.ts` |
| Move glyphs and annotations | ✅ Live | `src/analyse/boardGlyphs.ts` |
| Learn From Your Mistakes (retrospection) | ✅ Live | `src/analyse/retro.ts`, `retroCtrl.ts`, `retroView.ts` |
| Puzzle system with library and round solver | ✅ Live | `src/puzzles/ctrl.ts`, `view.ts`, `puzzleDb.ts` |
| Puzzle Glicko-2 rating | ✅ Live | `src/puzzles/types.ts`, `puzzleDb.ts` |
| Puzzle attempt history (append-only) | ✅ Live | `src/puzzles/puzzleDb.ts` |
| Opening research / opponent prep | ✅ Live | `src/openings/` |
| IndexedDB persistence (games, analysis, puzzles) | ✅ Live | `src/idb/index.ts`, `src/puzzles/puzzleDb.ts` |
| PGN export | ✅ Live | `src/analyse/pgnExport.ts` |
| Stats page | ❌ Placeholder | `src/main.ts` (just `h('h1', 'Stats Page')`) |
| Cross-game aggregation | ❌ Not built | — |
| Longitudinal trend storage | ❌ Not built | — |
| Weakness categorization | ❌ Not built | — |
| Training recommendations | ❌ Not built | — |
| Clock/time data extraction | ⚠️ Uncertain | PGN headers may contain clock info but no extraction pipeline exists |

### Relevant Subsystem Boundaries

- **Engine output** lives in `src/engine/` — produces `PositionEval` with `loss`, `label`, `best`, `bestLine`
- **Analysis storage** lives in `src/idb/index.ts` — `StoredAnalysis` with per-node evals keyed by path
- **Game metadata** lives in `src/import/types.ts` — `ImportedGame` with ratings, date, timeClass, source, result
- **Puzzle data** lives in `src/puzzles/` — attempt history, definitions, user-meta, rating history
- **Retro candidates** built in `src/analyse/retro.ts` — `RetroCandidate[]` per analyzed game

### Current Limits

1. **No aggregation layer**: Every stat is per-game, computed on-the-fly for display. There is no service that walks the full analyzed-game library and produces cross-game summaries.
2. **No longitudinal storage**: Per-game accuracy and classification data is stored inside `StoredAnalysis` objects but never extracted into a time-series or summary table.
3. **No weakness taxonomy**: Move classifications are mechanical (loss threshold → label). There is no phase detection (opening/middlegame/endgame), no motif detection, no structural pattern recognition.
4. **Clock data not extracted**: `ImportedGame` has `timeClass` (bullet/blitz/rapid/classical) but no per-move clock times. PGN headers may contain `%clk` annotations but the parser does not extract them.
5. **Opening data is metadata-only**: Games have ECO codes and opening names from PGN headers, but there is no aggregation of opening repertoire, deviation points, or per-opening win rates.
6. **No game-phase boundary detection**: There is no algorithm to identify where the opening ends, the middlegame begins, or the endgame starts.

---

## 3. Improvement Taxonomy

Every plausible improvement category derivable from imported game analysis, organized by feasibility.

### Tier 1: Derivable Now (From Existing Analysis Data)

These require only aggregation over data Patzer already produces.

#### 3.1 Move Quality Distribution
- **What it measures**: Count and distribution of good moves, inaccuracies, mistakes, and blunders across all analyzed games.
- **Why it matters**: The most basic improvement signal. Reducing blunder rate is the single highest-leverage improvement for most club players.
- **Data needed**: `PositionEval.label` from `StoredAnalysis` nodes.
- **Patzer has this data**: ✅ Yes, stored per-node in analysis cache.
- **Signal quality**: High. Direct and unambiguous.
- **Failure modes**: Shallow analysis depth (< 16) may misclassify some positions. Opening book moves classified as "good" inflate accuracy.

#### 3.2 Per-Game Accuracy Trends
- **What it measures**: Accuracy score per game over time.
- **Why it matters**: Shows whether a player is getting more or less precise. But noisy — single-game accuracy swings widely by opponent strength and position complexity.
- **Data needed**: Per-game accuracy (already computed in `evalView.ts`), game date.
- **Patzer has this data**: ✅ Yes, accuracy is computed per-game. Needs persistence as a time-series.
- **Signal quality**: Medium. Noisy per-game, meaningful as a moving average over 20+ games.
- **Failure modes**: Players who face much stronger opponents may show lower accuracy without playing worse. Players who play only simple positions may show inflated accuracy.

#### 3.3 Performance by Color
- **What it measures**: Win rate, accuracy, blunder rate split by white vs. black.
- **Why it matters**: Significant color asymmetry often indicates opening repertoire problems or difficulty with specific position types.
- **Data needed**: `ImportedGame.result`, player color (derivable from `importedUsername` vs. `white`/`black`), per-game accuracy.
- **Patzer has this data**: ✅ Yes.
- **Signal quality**: Medium-high. Color asymmetry is a real and actionable signal for most players.
- **Failure modes**: Small sample sizes can produce spurious asymmetry. Players who play different openings as white vs. black (everyone) confound this with opening quality.

#### 3.4 Performance by Time Control
- **What it measures**: Win rate, accuracy, blunder rate split by time control.
- **Why it matters**: Many players have significant gaps between rapid and blitz performance. Identifying this helps focus training.
- **Data needed**: `ImportedGame.timeClass`, per-game accuracy, result.
- **Patzer has this data**: ✅ Yes.
- **Signal quality**: Medium. Useful for self-awareness but the prescription is usually obvious ("you blunder more in blitz" → "play slower" or "do more tactics").
- **Failure modes**: Players who only play one time control get no signal.

#### 3.5 Performance vs. Opponent Strength
- **What it measures**: Win rate and accuracy bucketed by opponent rating (e.g., 200-point bands).
- **Why it matters**: Shows where the player "hits a wall." Useful for identifying ceiling effects.
- **Data needed**: `ImportedGame.whiteRating`, `blackRating`, game result, per-game accuracy.
- **Patzer has this data**: ✅ Yes.
- **Signal quality**: Medium. Interesting but rarely actionable — knowing you lose more against 1800s than 1600s doesn't directly tell you what to fix.
- **Failure modes**: Rating pools differ across platforms. Chess.com 1500 ≠ Lichess 1500. Mixing platforms without normalization produces misleading buckets.

#### 3.6 Blunder-Frequency Trends
- **What it measures**: Average blunders per game over time, as a moving average.
- **Why it matters**: The most actionable single metric for most improving players. Blunder reduction correlates strongly with rating gain.
- **Data needed**: Blunder count per analyzed game (from `StoredAnalysis` nodes), game date.
- **Patzer has this data**: ✅ Yes.
- **Signal quality**: High. Direct, meaningful, and actionable.
- **Failure modes**: Same as accuracy — opponent strength and position complexity add noise.

#### 3.7 Missed-Moment Frequency
- **What it measures**: Average swing/collapse/missed-mate moments per game.
- **Why it matters**: Missed moments are the most costly errors. Tracking their frequency is a strong proxy for tactical awareness.
- **Data needed**: `MissedMoment[]` per game (already computed by `tactics.ts`).
- **Patzer has this data**: ✅ Yes, in `_missedMomentsMap`.
- **Signal quality**: High. These are the positions where games are won and lost.
- **Failure modes**: Very low-rated games may have so many missed moments that the metric saturates.

#### 3.8 Retrospection Success Rate
- **What it measures**: How often the user finds the best move in Learn From Your Mistakes sessions.
- **Why it matters**: Measures whether the user can find correct moves when prompted — a direct training-effectiveness metric.
- **Data needed**: RetroCtrl session data (wins, fails, skips per session).
- **Patzer has this data**: ⚠️ Computed during sessions but not persisted across sessions. Would need persistence.
- **Signal quality**: High. Directly measures learning.
- **Failure modes**: Users who only attempt easy candidates inflate their success rate. Needs to be paired with candidate difficulty.

### Tier 2: Requires Additional Derived Layers

These need new algorithms or classification systems built on top of existing data.

#### 3.9 Game-Phase Performance
- **What it measures**: Accuracy and error rate in opening, middlegame, and endgame separately.
- **Why it matters**: Pinpoints which phase of the game a player loses most value. Directly prioritizes training.
- **Data needed**: Phase boundaries per game + per-node eval data.
- **Additional layer needed**: Phase boundary detection algorithm. Simple heuristics: opening ends when out of book or after move ~15; endgame begins when total material drops below a threshold (e.g., queens off + limited minor pieces).
- **Signal quality**: Medium-high. Phase is somewhat arbitrary but the signal is useful.
- **Failure modes**: Phase boundaries are fuzzy. A tactical blunder on move 14 could be classified as "opening" or "middlegame" depending on the heuristic. Games that end quickly in the opening (traps, blunders) produce degenerate phase data.

#### 3.10 Opening Repertoire Health
- **What it measures**: Which openings the user plays, how often, with what results, and how deeply they know them.
- **Why it matters**: Identifying weak openings is one of the most actionable improvement paths for players above beginner level.
- **Data needed**: ECO codes and opening names from PGN headers (already in `ImportedGame`), per-game results, per-game accuracy.
- **Additional layer needed**: Aggregation by opening family. Mapping ECO codes to opening families. Tracking "deviation depth" (where the user leaves known theory).
- **Signal quality**: Medium-high for the aggregation, lower for "deviation depth" (needs a reference opening database to compare against).
- **Failure modes**: PGN opening classification can be coarse (multiple very different systems share an ECO code). Short games (< 10 moves) with opening blunders distort opening stats.

#### 3.11 Opening Retention and Prep Drift
- **What it measures**: Whether the user plays their "intended" opening moves consistently, or deviates/forgets preparation.
- **Why it matters**: Many improving players lose games because they forget their own preparation and improvise poorly.
- **Data needed**: A reference repertoire (could be built from the user's own most-played lines), game-by-game opening moves, deviation point detection.
- **Additional layer needed**: Repertoire model (user's "intended" moves per position), deviation detection algorithm.
- **Signal quality**: Medium. Only useful if the user has a somewhat consistent repertoire. Beginners who play random openings get no signal.
- **Failure modes**: Players who intentionally vary their openings will show as "drifting" when they're actually exploring. Need to distinguish intentional variety from forgetfulness.

#### 3.12 Conversion Rate (Winning → Won)
- **What it measures**: How often the user converts a winning position (e.g., win-chance > 70%) into an actual win.
- **Why it matters**: Many club players gain winning positions but fail to convert. This is one of the most common and most fixable weaknesses.
- **Data needed**: Per-move win-chance data (from eval cache), game result.
- **Additional layer needed**: Algorithm to detect "winning position achieved" moments and track whether the game was ultimately won. Specifically: find the first position where win-chance exceeds threshold, then check final result.
- **Signal quality**: High. Directly actionable — poor converters need endgame training and technique practice.
- **Failure modes**: The threshold for "winning" matters. Win-chance > 70% is reasonable. Win-chance > 90% is too generous (nearly everyone converts those). Win-chance > 55% is too noisy.

#### 3.13 Resourcefulness When Worse
- **What it measures**: How often the user recovers from losing positions (win-chance < 30%) to draw or win.
- **Why it matters**: Defensive skill and resilience are trainable. Players who resign too early or collapse under pressure benefit from seeing this data.
- **Data needed**: Same as conversion — per-move win-chance data + game result.
- **Additional layer needed**: Algorithm to detect "losing position" moments and check recovery.
- **Signal quality**: Medium. Resourcefulness is partly about opponent errors, not just player skill. But the trend is meaningful.
- **Failure modes**: Against weaker opponents, "resourcefulness" may just mean "opponent blundered back." The metric improves if contextualized by opponent strength.

#### 3.14 Endgame-Specific Performance
- **What it measures**: Accuracy and error rate specifically in endgame positions.
- **Why it matters**: Endgame is the most trainable phase. Players who know basic endgames convert more and save more.
- **Data needed**: Phase boundaries (see 3.9) + per-position eval data.
- **Additional layer needed**: Endgame classification. Material count at phase boundary. Specific endgame types (K+P vs K, rook endgames, etc.) via piece counting.
- **Signal quality**: Medium-high for aggregate, high for specific endgame types if enough games exist.
- **Failure modes**: Many games never reach a proper endgame. Sample size for specific endgame types may be very small.

#### 3.15 Tactical Pattern Recognition
- **What it measures**: What types of tactical patterns the user misses (forks, pins, discovered attacks, etc.).
- **Why it matters**: Identifying which tactical motifs a player consistently misses enables targeted puzzle training.
- **Data needed**: Missed-moment positions + tactical motif classification.
- **Additional layer needed**: Motif detection engine. This is non-trivial — would need either a pattern-matching algorithm over piece positions, or Lichess puzzle theme tags (which are available for imported Lichess puzzles but not for user-game-derived positions).
- **Signal quality**: High if classification is accurate. Low if classification is noisy.
- **Failure modes**: Tactical motif classification is hard to do well without a dedicated system. Misclassification undermines the entire signal. Consider using Lichess puzzle themes as a proxy rather than building a classifier.

### Tier 3: Requires Clock/Time Data

These are only possible if per-move clock times are available.

#### 3.16 Time Management Profile
- **What it measures**: How the user distributes thinking time across the game — early vs. late, simple vs. complex positions.
- **Why it matters**: Time trouble is one of the most common causes of blunders. Understanding time allocation helps players adjust.
- **Data needed**: Per-move clock times from PGN `%clk` annotations.
- **Patzer has this data**: ⚠️ Uncertain. Lichess PGNs include `%clk` annotations. Chess.com PGNs may not. The current parser does not extract them.
- **Signal quality**: High where available. Time-trouble blunders are a distinct and fixable problem.
- **Failure modes**: Clock data may not be present in all games. Correspondence games have no meaningful time data.

#### 3.17 Time-Trouble Blunder Correlation
- **What it measures**: Whether blunders correlate with low remaining time.
- **Why it matters**: If 80% of a player's blunders happen in the last 2 minutes, the prescription is "manage time better" not "study tactics harder."
- **Data needed**: Per-move clock + per-move classification.
- **Signal quality**: Very high. One of the most actionable insights possible.
- **Failure modes**: Same as above — requires clock data.

#### 3.18 Think-Time vs. Move Quality
- **What it measures**: Whether moves the player thinks longer about are actually better.
- **Why it matters**: Calibration — some players overthink simple positions and rush complex ones.
- **Data needed**: Per-move clock + per-move eval loss.
- **Signal quality**: Medium. Interesting for self-awareness but hard to act on.
- **Failure modes**: Clock data granularity matters. If only remaining-time is available (not time-spent-on-move), delta computation adds noise.

### Tier 4: Speculative / High-Infrastructure

These are technically possible but require significant additional infrastructure.

#### 3.19 Positional/Strategic Pattern Recognition
- **What it measures**: Recurring positional weaknesses — handling isolated pawns, playing against the bishop pair, managing space advantages, etc.
- **Why it matters**: Strategic weaknesses are harder to detect than tactical ones but equally important for improvement above intermediate level.
- **Data needed**: Position classification engine (pawn structure, piece activity, space, king safety).
- **Additional layer needed**: A full positional evaluation taxonomy — essentially a chess knowledge base mapped to positions. This is a research project, not a feature.
- **Signal quality**: Potentially very high, but extremely hard to build reliably.
- **Failure modes**: Misclassification. Overfitting to engine evaluations (engine says a position is equal but the human consistently misplays it — the metric needs to detect the human difficulty, not the objective evaluation).

#### 3.20 Opponent-Specific Preparation Tracking
- **What it measures**: For players who face the same opponents repeatedly (club play, leagues), track per-opponent tendencies and preparation effectiveness.
- **Why it matters**: Useful for competitive players in fixed pools.
- **Data needed**: Opponent identification + opening tracking + game results.
- **Signal quality**: High for the use case, but narrow audience.
- **Failure modes**: Only useful if you face the same opponents regularly. Most online players don't.

---

## 4. Stat Inventory

Exhaustive inventory of stats Patzer could generate, grouped by family.

### Family A: Game-Level Summary Stats

| Stat | Signal | Data Source | Derivable Now? |
|---|---|---|---|
| Accuracy score (per game) | High | Eval cache + accuracy algorithm | ✅ Already computed |
| Move-quality distribution (good/inaccuracy/mistake/blunder counts) | High | StoredAnalysis node labels | ✅ Needs aggregation only |
| Blunder count | High | StoredAnalysis node labels | ✅ |
| Worst move (largest loss) | High | Max loss from eval nodes | ✅ |
| Best move (found engine's top choice in hardest position) | Medium | Eval cache comparison | ✅ |
| Missed moments count (swing/mate/collapse) | High | `_missedMomentsMap` | ✅ |
| Game result | High | `ImportedGame.result` | ✅ |
| Opening played (ECO/name) | Medium | PGN headers | ✅ |
| Opponent rating | Medium | `ImportedGame` ratings | ✅ |
| Time control | Medium | `ImportedGame.timeClass` | ✅ |
| Game length (moves) | Low-Medium | Mainline length | ✅ |
| Retro candidate count | Medium | `buildRetroCandidates()` output | ✅ |
| Retro solve rate (per game) | High | RetroCtrl session — needs persistence | ⚠️ |

### Family B: Cross-Game Aggregate Stats

| Stat | Signal | Minimum Games | Derivable Now? |
|---|---|---|---|
| Average accuracy | Medium | 10+ | Needs aggregation layer |
| Accuracy moving average (last N games) | High | 20+ | Needs aggregation layer |
| Blunder rate (per game average) | High | 10+ | Needs aggregation layer |
| Blunder rate trend | High | 20+ | Needs aggregation + time series |
| Win/draw/loss ratio | Medium | 20+ | ✅ (simple count) |
| Win rate by color | Medium-High | 20+ per color | Needs split aggregation |
| Win rate by time control | Medium | 20+ per control | Needs split aggregation |
| Win rate by opening family | Medium-High | 10+ per opening | Needs opening aggregation |
| Accuracy by color | Medium-High | 20+ per color | Needs split aggregation |
| Accuracy by time control | Medium | 20+ per control | Needs split aggregation |
| Accuracy by opponent rating bucket | Medium | 10+ per bucket | Needs bucketed aggregation |
| Missed-moment rate trend | High | 20+ | Needs aggregation + time series |
| Conversion rate (winning → won) | High | Games with winning position (varies) | Needs new algorithm |
| Resourcefulness (losing → saved) | Medium | Games with losing position (varies) | Needs new algorithm |
| Average game length by result | Low | 20+ | Simple |
| Opening repertoire breadth | Low-Medium | 30+ | ECO code count |

### Family C: Phase-Specific Stats (Requires Phase Boundaries)

| Stat | Signal | Additional Layer | Derivable Now? |
|---|---|---|---|
| Opening accuracy | Medium-High | Phase boundary detection | ❌ |
| Middlegame accuracy | Medium-High | Phase boundary detection | ❌ |
| Endgame accuracy | High | Phase boundary detection | ❌ |
| Blunders by phase | High | Phase boundary detection | ❌ |
| Phase where most value is lost | High | Phase boundary + loss aggregation | ❌ |

### Family D: Opening-Specific Stats (Requires Opening Aggregation)

| Stat | Signal | Additional Layer | Derivable Now? |
|---|---|---|---|
| Most-played openings | Medium | ECO aggregation | Simple |
| Win rate per opening | Medium-High | ECO aggregation + results | Simple |
| Accuracy per opening | Medium-High | ECO aggregation + per-game accuracy | Needs layer |
| Opening deviation frequency | Medium | Reference repertoire model | ❌ |
| Opening depth (average moves in book) | Medium | Opening database comparison | ❌ |
| Worst-performing openings | High | ECO + win rate + accuracy | Needs layer |

### Family E: Puzzle-Derived Stats (Already Partially Built)

| Stat | Signal | Derivable Now? |
|---|---|---|
| Puzzle rating (Glicko-2) | High | ✅ Already built |
| Puzzle rating trend | High | ✅ Rating history stored |
| Solve rate by difficulty | Medium-High | ✅ Attempt history |
| Solve rate by theme | Medium-High | ⚠️ Theme data on Lichess imports only |
| Average solve time | Medium | ⚠️ Timestamps in attempts but not surfaced |
| Clean solve rate vs. assisted/recovered | High | ✅ Attempt results |
| Failure reason distribution | High | ✅ `failureReasons[]` in attempts |

### Family F: Time-Dependent Stats (Requires Clock Data)

| Stat | Signal | Derivable Now? |
|---|---|---|
| Time per move distribution | High | ❌ Needs `%clk` extraction |
| Time-trouble frequency | High | ❌ |
| Blunder rate in time trouble | Very High | ❌ |
| Think-time vs. accuracy correlation | Medium | ❌ |
| Time allocation by phase | Medium | ❌ |

### Signal Classification Summary

**High-signal, immediately actionable** (build first):
- Blunder rate and trend
- Missed-moment frequency and trend
- Accuracy trend (moving average)
- Conversion rate
- Per-opening win rate (for identifying weak openings)
- Phase-specific error rate (once boundaries exist)
- Puzzle rating trend
- Retro solve rate

**Medium-signal, useful for context** (build second):
- Color asymmetry
- Time-control performance splits
- Opponent-strength buckets
- Opening repertoire breadth
- Game length patterns
- Puzzle theme performance

**Low-signal or vanity** (avoid or deprioritize):
- Total games played (not an improvement metric)
- Average game length (rarely actionable)
- "Most common opening" without performance context
- Win streak tracking (encourages result-orientation over process)
- Raw win/loss count (should always be contextualized by opponent strength)
- Percentile rankings against an imagined population (no reliable reference)

---

## 5. Training / Improvement Systems

All the ways Patzer could convert imported-game analysis into concrete improvement workflows.

### 5.1 Post-Game Review Summary (High Priority)

**What**: After batch analysis completes, generate a structured one-page summary of the game.

**Components**:
- Overall accuracy score
- Move-quality distribution (pie or bar chart)
- Worst 1–3 errors with position + best move + win-chance loss
- Phase breakdown (if phase detection exists)
- Opening result (name, evaluation out of opening)
- Whether a winning position was achieved and whether it was converted
- Number of retro-eligible positions
- One-sentence "focus area" recommendation

**Why it works**: Forces the user to confront their actual errors rather than just scrolling through an eval graph. The "focus area" recommendation is the bridge from analysis to training.

**Data needed**: All from existing `StoredAnalysis` + `ImportedGame` metadata. No new infrastructure except a summary-generation function and a view.

**Files touched**: New function in `src/analyse/` (summary generator), view addition in `src/analyse/evalView.ts` or new `src/analyse/summaryView.ts`.

### 5.2 Weakness Aggregation Dashboard (High Priority)

**What**: Across all analyzed games, identify the user's top 3–5 recurring weakness categories.

**Categories** (in priority order):
1. **Blunder-prone phase**: "You lose most value in the middlegame" or "Your endgames cost you the most"
2. **Tactical blindness**: "You miss winning tactics X% of the time when they're available"
3. **Conversion failure**: "You reach winning positions in X% of games but only win Y%"
4. **Opening weakness**: "Your Sicilian Najdorf loses X% more than your average"
5. **Color asymmetry**: "You score 15% worse as Black"
6. **Time-control gap**: "Your blitz accuracy is 12 points below your rapid"

**Why it works**: Aggregated weaknesses are far more actionable than per-game stats. A player who sees "you blunder more in the middlegame" knows to study middlegame strategy and tactics. A player who sees "your Najdorf loses too much" knows to either fix or drop that opening.

**Data needed**: Per-game accuracy, classification counts, phase breakdown (if available), opening aggregation, color split, time-control split.

**Prerequisites**: Aggregation layer over analyzed games. Phase boundary detection for full value.

### 5.3 Training Queue Generator (High Priority)

**What**: Automatically generate a prioritized training queue from weakness analysis.

**Mechanism**:
1. Analyze weakness categories (section 5.2)
2. For each weakness, suggest a concrete training action:
   - Tactical weakness → queue puzzles matching weak themes
   - Opening weakness → queue opening prep review
   - Endgame weakness → queue endgame study positions
   - Conversion failure → queue "convert this advantage" drills (custom puzzle type)
   - Blunder tendency → queue Learn From Your Mistakes sessions
3. Present as a to-do list with clear, specific items

**Why it works**: Closes the loop between "here's what's wrong" and "here's what to do about it." Most chess tools stop at diagnosis.

**Data needed**: Weakness analysis output + puzzle theme mapping + opening data.

**Prerequisites**: Weakness aggregation (5.2), puzzle theme indexing, possibly custom puzzle types for non-tactical weaknesses.

### 5.4 Learn From Your Mistakes — Extended (Already Partially Built)

**What**: The existing retrospection system, enhanced with:
- Persistence of per-game retro results (how many found, which were hard)
- Aggregate retro success rate over time
- "Hardest mistakes" collection — positions the user failed to solve in retro, saved for future re-testing
- Spaced repetition on failed retro positions

**Why it works**: Retro is already the best training loop in Patzer. Enhancing it with persistence and repetition makes it much more powerful.

**Data needed**: RetroCtrl session results → persistent storage. Currently computed but not saved.

**Files touched**: `src/analyse/retroCtrl.ts` (persist results), new IDB store or additions to existing stores.

### 5.5 Mistake Repetition Drill

**What**: Collect positions where the user made mistakes across multiple games. Present them as a drill: "Find the best move in positions where you previously went wrong."

**Mechanism**:
1. From all analyzed games, collect positions where user played an inaccuracy/mistake/blunder
2. Group by similarity (same opening, same type of position, same piece configuration — or just present chronologically)
3. Present as a puzzle-like drill: show position, user tries to find the best move
4. Track success rate over time

**Why it works**: Directly trains on the user's actual weaknesses, not generic puzzles. This is the most targeted form of tactical training possible from imported games.

**Data needed**: StoredAnalysis nodes with `label` !== 'good', position FEN, best move.

**Prerequisites**: A drill presentation mode (similar to puzzle round, but sourced from game analysis data). Could reuse the existing puzzle round UI with a new data source.

### 5.6 Opening Repertoire Tracker

**What**: Build a picture of the user's opening repertoire from their games, track consistency, and identify problem lines.

**Components**:
1. **Repertoire map**: From all games, build a frequency tree of the user's opening moves
2. **Consistency score**: How often the user plays their "main" move in each position
3. **Problem lines**: Openings where accuracy or win rate is significantly below average
4. **Deviation alerts**: When the user deviates from their usual repertoire, flag the game
5. **Prep depth**: How many moves deep the user typically plays "in prep" before improvising

**Why it works**: Opening preparation is one of the most structured ways to improve. Knowing your weak spots and inconsistencies lets you focus prep time efficiently.

**Data needed**: ECO codes, opening names, per-game accuracy, per-game results, move sequences from PGN.

**Prerequisites**: Opening aggregation layer. Repertoire tree builder (already partially exists in `src/openings/tree.ts` for opponent research — could be adapted for self-research).

### 5.7 Endgame Drill Queue

**What**: From games that reached endgame positions, extract the critical moments and present them as training positions.

**Mechanism**:
1. Detect endgame phase (material-based threshold)
2. Within endgame, find positions with significant eval change (user made a mistake or missed a win)
3. Save these as endgame drill positions
4. Present as a study queue with engine verification

**Why it works**: Endgame technique is the most trainable chess skill. Drilling on your own endgame mistakes is the highest-signal practice available.

**Data needed**: Phase boundary detection + eval data from StoredAnalysis.

**Prerequisites**: Phase detection, drill presentation mode.

### 5.8 "Your Worst Moves" Review Journal

**What**: A curated collection of the user's worst moves across all analyzed games, presented as a study journal.

**Mechanism**:
1. Collect the N worst moves (by loss magnitude) across all games
2. Present each with: position, played move, best move, eval change, game context
3. Allow the user to annotate with personal notes
4. Track whether the user has reviewed each position
5. Periodically re-test: show the position without hints, see if user finds the right move now

**Why it works**: Forces confrontation with patterns of failure. The re-test mechanism creates a feedback loop.

**Data needed**: StoredAnalysis nodes sorted by loss. Position context from game tree.

**Prerequisites**: Aggregation over multiple games' analysis data. Note-taking UI. Re-test mechanism (drill mode).

---

## 6. Progress Tracking Over Time

### What Should Be Stored

For longitudinal tracking, Patzer needs a time-series data structure — a persistent record of key metrics per game, ordered by date.

**Proposed: GameSummary record** (persisted per analyzed game)

```
GameSummary {
  gameId: string
  date: Date
  source: 'lichess' | 'chesscom'
  timeClass: string
  playerColor: 'white' | 'black'
  opponentRating: number
  result: string
  accuracy: number
  blunderCount: number
  mistakeCount: number
  inaccuracyCount: number
  missedMomentCount: number
  worstLoss: number
  opening: string (ECO or name)
  totalMoves: number
  hadWinningPosition: boolean
  converted: boolean
  retroCandidateCount: number
  retroSolveRate?: number  // if retro was completed
  analyzedAt: Date
}
```

This is the atomic unit of longitudinal data. Everything else is derived by aggregating these records.

**Storage**: New IDB store `game-summaries`, or a new table if server-side. Append-only, one record per analyzed game.

### What Trends Matter

**Primary trends** (show on stats page):
1. **Accuracy moving average** (20-game window) — the north-star improvement metric
2. **Blunder rate moving average** — the most actionable trend
3. **Missed-moment rate moving average** — proxy for tactical awareness

**Secondary trends** (show on demand):
4. Conversion rate over time
5. Opening win-rate changes for specific openings
6. Puzzle rating trend (already stored)
7. Phase-specific accuracy trends (if phase detection exists)

**Do not show**:
- Raw per-game accuracy as a scatter plot without a trend line (too noisy, discouraging)
- Win/loss streaks (encourages result-orientation)
- "Rating equivalent" derived from accuracy (unreliable, creates false expectations)

### How to Show Improvement Honestly

**Rules for honest progress tracking**:

1. **Always show sample size**: "Based on your last 47 analyzed games" — never present stats without context.
2. **Use confidence bands**: When sample sizes are small (< 20 games), show wide error bars or state "insufficient data."
3. **Require minimum games before showing trends**: No trend charts until at least 20 analyzed games.
4. **Separate time controls**: Don't mix blitz and rapid accuracy into one trend — they're fundamentally different.
5. **Don't compare against imagined benchmarks**: Patzer should not say "your accuracy is in the top 30% of players" — there is no reliable reference population.
6. **Show improvement rate, not just level**: "Your blunder rate has decreased 15% over the last 30 games" is more motivating and accurate than "Your blunder rate is 1.2 per game."
7. **Acknowledge noise**: Accompany trend charts with a note like "Individual games vary widely. Focus on the trend over 20+ games."

### What Milestones Are Meaningful

- First 10 analyzed games — baseline established
- First blunder-rate improvement (20-game window drops below previous 20-game window)
- First opening mastered (opening played 10+ times with above-average accuracy)
- Puzzle rating milestones (every 100 points)
- Retro solve rate improvement
- First game with zero blunders in an analyzed game

---

## 7. Best UX Forms

### Stats Page (`/stats`)

**What belongs here**:
- Overview dashboard: total analyzed games, average accuracy, blunder rate, puzzle rating
- Accuracy trend chart (moving average, separated by time control)
- Blunder rate trend chart
- Top weaknesses list (3–5 items with training recommendations)
- Opening performance table (openings with 5+ games, sorted by win rate or accuracy)
- Color split comparison (white vs. black accuracy and win rate)
- Time-control comparison

**What does NOT belong here**:
- Every possible stat (information overload kills utility)
- Per-game details (that's the analysis page)
- Puzzle details (that's the puzzle page)

**Key UX principle**: The stats page should answer ONE question: "What should I work on next?" Everything else is secondary.

### Game Analysis Page (`/analysis/:gameId`)

**What belongs here**:
- Post-game summary panel (after analysis completes)
- "Start Review" and "Learn From Your Mistakes" entry points
- Eval graph with clickable missed moments
- Move quality annotations in the move list
- Per-game accuracy display

**Addition**: A "Game Verdict" banner at the top of the analysis page after review completes: "You played well in the opening but lost the game with a middlegame blunder on move 23. Your biggest improvement opportunity was [finding Nf6+ on move 23]."

### Puzzle Page (`/puzzles`)

**What belongs here**:
- Puzzle rating and trend mini-chart (already partially built)
- "Train Your Weaknesses" queue — puzzles targeted at the user's diagnosed weak spots
- Puzzle solve history and performance by theme
- Link back to source game for user-library puzzles

### Openings Page (`/openings`)

**What belongs here**:
- Personal repertoire view (from analyzed games, not just opponent research)
- Per-opening performance stats
- Problem lines highlighted
- "Your prep depth" indicator per opening

### Reports / Summaries (New Surface)

Consider a periodic summary (weekly or per-N-games) that aggregates recent performance:
- "This week you analyzed 8 games. Your accuracy improved by 3 points. Your biggest weakness was endgame conversion (3 games with a winning position that ended in draws). Recommended: practice endgame technique."

This could be a section on the stats page or a dismissible notification after reaching a milestone.

---

## 8. Reliability and Risk Analysis

### Sample-Size Problems

**Risk**: Most aggregate stats become misleading below ~20 games. Per-opening stats need 10+ games per opening. Phase-specific stats need even more.

**Mitigation**: Show minimum-sample warnings prominently. Hide stats below minimum thresholds rather than showing unreliable numbers with caveats.

### Engine-Dependence Problems

**Risk**: All move classification depends on Stockfish analysis quality. Shallow analysis (low depth) produces unreliable classifications. The user's analysis depth setting directly affects data quality.

**Mitigation**:
- Track and display the analysis depth used for each game.
- Warn when stats are based on shallow analysis (depth < 16).
- Do not mix analysis depths in aggregate stats without disclosure.

### Metadata Gaps

**Risk**:
- Clock data may not be present in PGNs from all sources.
- ECO codes may be missing or inaccurate.
- Rating data from different platforms is not comparable (Chess.com Elo ≠ Lichess Glicko).

**Mitigation**:
- Never mix platforms in rating-based analysis without disclosure.
- Treat missing metadata as missing, not zero.
- Don't attempt time analysis without confirmed clock data.

### False Confidence

**Risk**: Showing precise numbers (e.g., "Your accuracy is 67.3%") creates false confidence in the precision of the measurement. A single game can swing accuracy by several points.

**Mitigation**: Round aggressively. Show ranges or confidence intervals. Use qualitative labels ("Good," "Needs work") alongside numbers.

### Misclassification

**Risk**: The move-classification thresholds (loss > 0.15 = blunder) are reasonable but arbitrary. A 0.149 loss is functionally identical to a 0.151 loss but classified differently.

**Mitigation**: Don't over-index on exact boundary counts. Use continuous metrics (average loss, total value lost) alongside categorical ones. Show distributions, not just categories.

### Recency Bias

**Risk**: Users will weight recent games more heavily. A bad week might feel like regression even against a positive trend.

**Mitigation**: Always show the long-term trend alongside recent performance. Default time windows to at least 20 games.

### Survivorship Bias

**Risk**: Players who analyze only their losses (looking for mistakes) will have worse aggregate stats than players who analyze all games. Players who import only recent games may miss context.

**Mitigation**: Encourage analyzing all games, not just losses. Track and display what fraction of imported games have been analyzed.

### Vanity Metrics

**Risk**: Metrics like "games analyzed," "puzzles solved," "streak length" feel productive but don't measure improvement. They encourage volume over quality.

**Mitigation**: Deprioritize activity metrics. Lead with quality metrics (accuracy trend, blunder rate, solve rate on hard puzzles). If showing activity metrics, never as the primary display.

### Misleading Aggregate Stats

**Risk**: Average accuracy across all games conflates different contexts. A player who plays 50% bullet and 50% classical will have a meaningless average accuracy.

**Mitigation**: Always segment by time control. Show weighted averages only within consistent contexts.

---

## 9. Phased Product Roadmap

### Phase 1: Smallest Safe Wins Using Current Data

**Goal**: Surface useful insights from data Patzer already generates, with minimal new infrastructure.

**Tasks**:

1. **Per-game summary generation** (1–2 files)
   - After batch analysis completes, compute and display: accuracy, classification counts, worst move, missed moment count
   - Show as a collapsible panel on the analysis page
   - Data: already in `StoredAnalysis` and `evalView.ts` accuracy computation

2. **GameSummary persistence** (1–2 files)
   - When analysis completes, extract and store a `GameSummary` record (see section 6)
   - New IDB store or addition to existing `patzer-pro` database
   - This is the prerequisite for everything in Phase 2+

3. **Basic stats page: accuracy and blunder trends** (1–2 files)
   - Replace the placeholder stats page
   - Show: total analyzed games, accuracy moving average chart, blunder rate moving average chart
   - Minimum 10 games before showing charts, 20 before showing trends
   - Data: aggregated from `GameSummary` records

4. **Opening performance table** (1–2 files)
   - On the stats page, list openings played (from PGN headers/ECO)
   - Show: games played, win rate, average accuracy
   - Sorted by "worst performing" to surface actionable openings
   - Data: `ImportedGame` metadata + `GameSummary` accuracy

5. **Persist retro session results** (1 file)
   - When a Learn From Your Mistakes session ends, save: game ID, candidates found, candidates total, timestamp
   - Data: `RetroCtrl` session state → new IDB record

**Prerequisite infrastructure**: GameSummary persistence layer (task 2 unlocks tasks 3 and 4).

**Estimated scope**: 6–8 small tasks, ~8–12 files total.

### Phase 2: Stronger Analysis-Derived Improvement Tools

**Goal**: Build the cross-game analysis and weakness detection that makes Patzer a genuine improvement tool.

**Tasks**:

1. **Weakness aggregation engine**
   - Analyze all GameSummary records to identify top weakness categories
   - Output: ranked list of weakness areas with confidence levels
   - Categories: blunder-prone phase (basic: early/middle/late by ply), tactical blindness, conversion failure, opening weakness, color asymmetry, time-control gap

2. **Phase boundary detection**
   - Simple heuristic: opening = moves 1–15 or until first major eval swing; endgame = position with ≤ 1 minor piece per side + queens off
   - Add phase labels to GameSummary (or compute on-the-fly from stored analysis)

3. **Conversion rate tracking**
   - For each game, detect if a "winning position" was achieved (win-chance > 0.7 sustained for 3+ moves)
   - Track whether the game was won
   - Show as a stat: "You convert winning positions X% of the time"

4. **Training queue recommendations**
   - Based on weakness analysis, generate specific training suggestions
   - Link to: puzzle themes, retro sessions, opening prep
   - Show on stats page and/or as a global recommendation bar

5. **Mistake repetition drills**
   - Collect error positions across games
   - Present as a drill mode (reuse puzzle round UI)
   - Track drill success rate

6. **Personal repertoire view** (in openings page)
   - Build a frequency tree from the user's own games (adapt `src/openings/tree.ts`)
   - Show win rate and accuracy per branch
   - Highlight weak lines

**Prerequisites**: Phase 1 complete (GameSummary persistence, basic stats page).

**Estimated scope**: 8–12 small tasks, more files than Phase 1 due to new algorithms and views.

### Phase 3: Richer Longitudinal Coaching / Training Systems

**Goal**: Full improvement tracking and training loop integration.

**Tasks**:

1. **Periodic progress reports**
   - Generate weekly/monthly summaries comparing recent performance to historical baseline
   - Highlight improvements and regressions
   - Suggest adjusted training focus

2. **Spaced repetition on failed positions**
   - Positions where user made mistakes or failed retro → enter a spaced repetition queue
   - Re-present at increasing intervals
   - Track mastery over time

3. **Clock data extraction and time analysis** (if data available)
   - Parse `%clk` annotations from PGNs
   - Compute time-per-move, time-trouble frequency, blunder-in-time-trouble correlation
   - Show as a time management profile

4. **Improvement-after-intervention tracking**
   - After the user works on a diagnosed weakness (does opening prep, completes puzzle drills), track whether the weakness metric improves
   - Show: "After your Sicilian prep session, your Sicilian accuracy improved from 58% to 72% over the next 8 games"

5. **Study plan generator**
   - Based on all available data, generate a prioritized study plan
   - Concrete items: "Review your last 3 endgame losses," "Practice 20 fork puzzles," "Drill your Caro-Kann main line"
   - Checkable list with completion tracking

6. **Cross-device sync for training state** (depends on auth/sync infrastructure)
   - Sync GameSummary, training progress, drill state across devices
   - Required for the "portable training platform" vision

**Prerequisites**: Phase 2 complete, auth/sync infrastructure (for task 6).

**Estimated scope**: Large. Some tasks (spaced repetition, clock analysis) are substantial.

---

## 10. Final Recommendation

### What Patzer Should Build Next

**Immediate priority**: GameSummary persistence layer + per-game review summary.

This is the single highest-leverage change. It:
- Creates the data foundation for everything in Phase 2 and 3
- Immediately improves the post-analysis experience
- Is achievable in 2–3 small tasks
- Requires no new infrastructure beyond a new IDB store and a summary computation function

**Second priority**: Basic stats page with accuracy trend, blunder rate trend, and opening performance table.

This transforms Patzer from "a tool that analyzes individual games" into "a tool that tracks your chess improvement." The data is already there — it just needs aggregation and presentation.

**Third priority**: Persist retro session results and show retro success rate.

Learn From Your Mistakes is Patzer's best training loop. Making it persistent and trackable makes it genuinely useful for improvement, not just a one-off exercise.

### What Should Wait

- **Phase boundary detection**: Useful but not critical. Can use simple ply-based heuristics initially (opening = moves 1–12, endgame = last 15 moves or material threshold).
- **Tactical motif classification**: Hard to do well. Better to use Lichess puzzle themes as a proxy until a proper classifier exists.
- **Clock/time analysis**: Depends on data availability. Don't build infrastructure for data you might not have.
- **Spaced repetition**: Valuable but complex. Get the basic drill system working first.
- **AI-generated study plans**: Tempting but premature. Get the data foundation right first.

### What Should Probably Never Be Built

1. **"Estimated FIDE rating from accuracy"** — unreliable, creates false expectations, encourages gaming the metric instead of improving.
2. **Social comparison features** ("You're better than 60% of users") — no reliable reference population, encourages result-orientation.
3. **Win streak tracking as a primary metric** — encourages playing weaker opponents and avoiding challenges.
4. **"Chess personality type" classification** — gimmicky, not actionable, pattern-matches on noise.
5. **Detailed positional/strategic weakness detection without a proper engine** — misclassification would be worse than no classification. If Patzer can't reliably detect "you're bad at isolated pawn positions," it shouldn't claim to.
6. **Gamification features (badges, XP, levels)** — distract from actual improvement, encourage volume over quality, attract the wrong kind of engagement.
7. **"Optimal move" highlighting on every position** — the engine's best move is often not the most instructive move. Over-reliance on engine agreement as a quality metric is misleading for human learning.
8. **Complex multi-axis spider/radar charts** — look sophisticated, communicate poorly, encourage comparing unrelated dimensions.

---

## Appendix A: Data Dependency Matrix

| Feature | ImportedGame metadata | StoredAnalysis evals | Phase boundaries | Clock data | Opening aggregation | GameSummary persistence | Retro persistence |
|---|---|---|---|---|---|---|---|
| Per-game summary | ✅ | ✅ | — | — | — | — | — |
| Accuracy trend | ✅ | ✅ | — | — | — | ✅ | — |
| Blunder rate trend | — | ✅ | — | — | — | ✅ | — |
| Opening performance | ✅ | ✅ | — | — | ✅ | ✅ | — |
| Phase-specific errors | — | ✅ | ✅ | — | — | ✅ | — |
| Conversion rate | — | ✅ | — | — | — | ✅ | — |
| Training recommendations | ✅ | ✅ | ✅ | — | ✅ | ✅ | — |
| Time management | ✅ | ✅ | — | ✅ | — | — | — |
| Retro success tracking | — | — | — | — | — | — | ✅ |
| Mistake repetition drills | — | ✅ | — | — | — | — | — |
| Progress reports | ✅ | ✅ | ✅ | — | ✅ | ✅ | ✅ |

## Appendix B: Current Repo File Reference

| Subsystem | Key Files |
|---|---|
| Game import | `src/import/lichess.ts`, `src/import/chesscom.ts`, `src/import/pgn.ts`, `src/import/types.ts` |
| Game library | `src/games/view.ts` |
| Engine analysis | `src/engine/ctrl.ts`, `src/engine/batch.ts`, `src/engine/winchances.ts`, `src/engine/tactics.ts` |
| Analysis UI | `src/analyse/ctrl.ts`, `src/analyse/evalView.ts`, `src/analyse/moveList.ts` |
| Retrospection | `src/analyse/retro.ts`, `src/analyse/retroCtrl.ts`, `src/analyse/retroView.ts` |
| Puzzles | `src/puzzles/ctrl.ts`, `src/puzzles/view.ts`, `src/puzzles/puzzleDb.ts`, `src/puzzles/types.ts` |
| Openings | `src/openings/ctrl.ts`, `src/openings/view.ts`, `src/openings/tree.ts`, `src/openings/types.ts` |
| Persistence | `src/idb/index.ts`, `src/puzzles/puzzleDb.ts` |
| Move tree | `src/tree/types.ts`, `src/tree/ops.ts`, `src/tree/pgn.ts` |
| Board | `src/board/index.ts`, `src/board/cosmetics.ts` |
| App shell | `src/main.ts`, `src/router.ts` |
| Stats page | `src/main.ts` (placeholder only) |

## Appendix C: Key Thresholds and Algorithms Already Implemented

**Win-chance sigmoid** (`src/engine/winchances.ts`):
```
sigmoid(cp) = 2 / (1 + e^(-0.00368208 * cp)) - 1
cp clamped to [-1000, 1000]
mate: cp = (21 - min(10, |mate|)) × 100
```

**Move classification** (`src/engine/winchances.ts`):
```
loss < 0.05 → good
0.05 ≤ loss < 0.10 → inaccuracy
0.10 ≤ loss < 0.15 → mistake
loss ≥ 0.15 → blunder
```

**Missed moment detection** (`src/engine/tactics.ts`):
```
Swing: loss > 0.15 AND parent has best move
Missed mate: parent shows mate ≤ 3 AND played move doesn't deliver
Collapse: mover win-chance ≥ 65% AND loss ≥ 0.15
```

**Accuracy scoring** (`src/analyse/evalView.ts`):
```
Per-move accuracy from exponential decay on win-chance loss
Sliding-window standard deviations
Final = (weighted_mean + harmonic_mean) / 2, clamped [0, 100]
```

**Puzzle Glicko-2** (`src/puzzles/types.ts`):
```
Default: rating=1500, deviation=500, volatility=0.09
Bounds: 400–4000 rating, 45–500 deviation
Max delta per solve: ±700
```

---

*End of audit. This document should be treated as a research artifact for product planning, not an implementation spec. Implementation should follow Patzer's existing task-scope rules (1–3 files per task, one feature at a time).*
