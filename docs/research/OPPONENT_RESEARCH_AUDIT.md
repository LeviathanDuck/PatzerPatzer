# Opponent Research & Scouting Audit

**Date**: 2026-03-29
**Scope**: Exhaustive product/systems research on extracting opponent-prep value from imported game history
**Status**: Research deliverable — not an implementation plan

---

## 1. Executive Summary

### The Opportunity

Patzer Pro already imports opponents' full game histories (Lichess, Chess.com, PGN) and builds
opening trees with win/draw/loss statistics per position. This is a solid foundation. The gap is
that the current tool stops at **"what does this opponent play?"** and never reaches **"what
should I do about it?"**

The strongest opponent-research tools go further: they profile psychological tendencies,
identify exploitable weaknesses by game phase, generate actionable game plans, and flag
time-trouble patterns. Some of this is genuinely useful. Some is noise dressed up as insight.
This audit separates the two.

### Strongest Findings

1. **Opening repertoire analysis is the highest-signal, lowest-risk feature family.** Patzer
   already has 80% of the data it needs. The missing piece is surfacing *actionable prep*: which
   lines does this opponent play badly? Which do they avoid? Where do they deviate from theory?

2. **Color-specific performance asymmetry is underexploited.** Most amateurs have significant
   White/Black performance gaps. Patzer already filters by color but doesn't surface the delta
   as a first-class insight.

3. **Time-trouble analysis is valuable but requires clock data that Patzer partially has.** PGN
   headers include TimeControl but per-move clock data depends on the source platform and PGN
   completeness. Without per-move clocks, time-trouble metrics are impossible.

4. **Psychological profiling (tilt scores, mental stability, post-loss winrate) is the most
   dangerous category.** It sounds impressive but is almost always noise at amateur sample sizes,
   and risks creating false confidence that actively harms prep quality.

5. **Game-phase accuracy (opening/middlegame/endgame split) requires engine analysis of every
   imported game**, which Patzer does not do for opponent research games (by design — research
   collections are separate from the analysis library). This is a hard infrastructure constraint.

### What Patzer Should Prioritize

1. Strengthen the opening tree with deviation-point and novelty detection
2. Add per-opening win/loss performance summaries (opponent's best and worst lines)
3. Surface color asymmetry as a first-class stat
4. Add recency weighting and trend indicators
5. Show sample games inline when browsing the tree

### What Should Be Avoided

1. Psychological profiling scores (tilt, mental stability, resilience)
2. Archetype classification ("aggressive", "solid", "tactical")
3. Game plan generation from insufficient data
4. Any metric presented as a single score when it's actually derived from <30 games
5. Trap detection without engine analysis of opponent games

---

## 2. Current Patzer Baseline

### What Exists

The openings subsystem (`src/openings/`) is a fully implemented opponent-research tool:

| Component | File | What It Does |
|---|---|---|
| Data model | `src/openings/types.ts` | `ResearchGame`, `ResearchCollection`, `ResearchSettings`, `ResearchProvenance` |
| Controller | `src/openings/ctrl.ts` | State machine: library → import → session. Navigation, color/speed filters, session resume |
| Tree builder | `src/openings/tree.ts` | Aggregates games into position tree with win/draw/loss counts, transposition merging, avg rating, last played date. 30-ply depth limit |
| Import pipeline | `src/openings/import.ts` | Fetches from Lichess API, Chess.com API, or PGN paste. Applies date/speed/rated filters |
| Persistence | `src/openings/db.ts` | Separate IndexedDB (`patzer-openings`). Collections + session state |
| Explorer | `src/openings/explorer*.ts` | Lichess Masters/Lichess/Player opening databases for comparison |
| View | `src/openings/view.ts` | Full UI: library cards with win/loss stats, import wizard, session board with tree navigation |

### What the User Sees Today

- **Library view**: Cards per opponent collection showing total games, win/draw/loss bar,
  per-speed-class stats (count, peak rating, current rating, avg opponent rating)
- **Import wizard**: Source → username → filters → fetch → save
- **Session view**: Chessground board with opening tree sidebar showing move options,
  frequency, win/draw/loss per move, sample games for current position
- **Filters**: Color (white/black/both), speed class, date range

### Per-Game Data Available

Each `ResearchGame` stores:
- `pgn` (full game text)
- `white`, `black` (player names)
- `result` ('1-0', '0-1', '1/2-1/2', '*')
- `date` (PGN header date)
- `timeClass` (bullet/blitz/rapid/classical)
- `opening`, `eco` (opening name and ECO code from PGN headers)
- `whiteRating`, `blackRating` (ELO at time of game)
- `source` (lichess/chesscom/pgn)

### What Is NOT Available in Research Games

- **Per-move clock data** — not extracted during import
- **Engine evaluations** — research games are not engine-analyzed
- **Move quality classifications** — no blunder/mistake/inaccuracy labels
- **Game phase boundaries** — no opening/middlegame/endgame split
- **Opponent's opponent data** — only the target player's games
- **Metadata beyond PGN headers** — no tournament info, no arena/swiss context

### Relevant Adjacent Systems

| System | Files | Potential Contribution |
|---|---|---|
| Analysis engine | `src/engine/` | Could analyze opponent games if scoped |
| Tactics detection | `src/engine/tactics.ts` | Swing detection, missed-mate detection |
| Win-chance math | `src/engine/winchances.ts` | Move quality classification |
| Puzzle extraction | `src/puzzles/extract.ts` | Could extract opponent's tactical failures |
| Game library | `src/import/`, `src/games/` | Shares import adapters with openings |

### Current Limitations

1. **No engine analysis of research games.** The architecture deliberately separates research
   collections from the analysis library. This means no eval data, no move quality, no blunder
   counts, no accuracy scores for opponent games.

2. **No per-move clock extraction.** Even though Lichess PGN includes `%clk` annotations and
   Chess.com includes clock data, the import pipeline strips this during header-only parsing.

3. **No derived statistics beyond the opening tree.** The tree gives position-level win/loss
   counts but no aggregated summaries like "opponent's worst opening" or "opponent's endgame
   conversion rate."

4. **No trend analysis.** Games are stored with dates but no temporal aggregation (recent form,
   rating trajectory, repertoire shifts).

5. **30-ply tree depth limit.** The opening tree stops at move 15. This is reasonable for
   opening prep but means middlegame structure information is not captured in the tree.

---

## 3. Competitor Tool Audit

### Source Availability

A reference competitor opponent-research tool was studied for feature comparison. Analysis is
based on the tool's public-facing behavior, UI patterns, and feature descriptions. Some details
are inferred from observable behavior rather than source code.

### What the Reference Tool Provides

#### High-Signal Features (Genuinely Useful)

| Feature | Description | Assessment |
|---|---|---|
| **Opening repertoire analysis** | Win rate per opening by color, weak openings identified, minimum 7 games per weakness | Solid. Minimum game threshold is critical for avoiding noise |
| **Opening weakness detection** | Highlights openings where opponent performs poorly | High value. Direct prep application |
| **Color-specific analysis** | Separate stats for White and Black | Essential. Amateurs often have extreme asymmetry |
| **Time-trouble indicators** | Flag rate (% of games lost on time), time pressure accuracy degradation | Valuable if clock data is available. Flag rate alone is derivable from results + time control |
| **Endgame reached rate** | % of games reaching endgame positions | Useful for deciding whether to simplify or complicate |
| **Resignation rate** | How often they resign vs play on | Modest value. Tells you whether to grind out worse positions |
| **Post-loss winrate** | Win % in the game immediately following a loss | Interesting but requires session/sequential game data |

#### Medium-Signal Features (Potentially Useful, Requires Care)

| Feature | Description | Assessment |
|---|---|---|
| **Game phase accuracy** | Opening/middlegame/endgame accuracy scores | Requires engine analysis of every game. High infrastructure cost. Useful if available |
| **Endgame category performance** | Win rates in specific endgame types (rook, pawn, etc.) | Requires position classification. Valuable for strong players, noisy for amateurs |
| **Blunder rate** | Moves losing 300+ cp per game average | Requires engine analysis. The raw count is less useful than *where* blunders cluster |
| **Anti-repertoire suggestions** | Counter-opening recommendations based on weaknesses | Only as good as the weakness detection. Risky to automate |
| **Head-to-head comparison** | Stats between two specific players | Valuable if sample size is adequate (rarely is below master level) |

#### Low-Signal Features (Noise, Vanity, or Dangerous)

| Feature | Description | Assessment |
|---|---|---|
| **Predictability Score** (0-100) | Composite "predictability" score | **Dangerous.** Single-number composites obscure what's actually known. Creates false confidence. The number itself has no actionable meaning |
| **Tilt Score** | Emotional reactivity measurement | **Noise at amateur level.** Variance in amateur play is so high that isolating "tilt" from normal inconsistency is nearly impossible |
| **Mental Stability Score** (0-100) | Psychological resilience | **Pseudoscience.** You cannot reliably infer psychological state from game results alone. This is correlation dressed as causation |
| **Recovery Score** | Bounce-back speed from losing streaks | **Noise.** Requires long sequences of games and conflates many variables |
| **Archetype System** (26 types) | "Aggressive", "Solid", "Tactical", etc. | **Vanity metric.** Players don't fit neatly into archetypes. A player who plays the Sicilian Dragon and the London System is both "aggressive" and "solid." The classification tells you less than looking at their actual repertoire |
| **Game Plan Generation** | "Complicate in middlegame", "Pressure the clock" | **Actively harmful if taken seriously.** Generic advice derived from noisy aggregate stats. A player who "loses 60% of endgames" might just have a small sample or play lots of rapid |
| **Trap Detection** | Specific tactical positions where opponent was caught | **Misleading.** Traps are position-specific and opponent-move-order-specific. Finding that someone fell for a trap in one game tells you almost nothing about future games |
| **Psychological Exploitation** | "First loss sensitivity", "aggression triggers" | **Ethically questionable and statistically unsound.** You cannot reliably profile psychology from game results. This feature exists to make the product feel powerful, not to provide genuine prep value |

### What Is Transferable to Patzer

| Competitor Feature | Patzer Feasibility | Notes |
|---|---|---|
| Opening win rates by color | **Ready now** | Patzer has all needed data |
| Weak opening detection | **Ready with thresholds** | Need minimum-game-count gating |
| Time class performance splits | **Ready now** | Already partially shown on collection cards |
| Flag/timeout rate | **Derivable** | Would need to check PGN Termination header |
| Resignation rate | **Derivable** | Same — check Termination header |
| Rating trajectory | **Ready now** | Games have ratings and dates |
| Endgame reached rate | **Needs position classifier** | Requires material/piece-count heuristic |
| Game phase accuracy | **Needs engine analysis** | Major infrastructure addition |
| Blunder distribution | **Needs engine analysis** | Not feasible without analyzing opponent games |
| Archetype classification | **Should not build** | Noise |
| Composite scores | **Should not build** | False confidence |
| Psychological profiling | **Should not build** | Pseudoscience |

---

## 4. Opponent Research Taxonomy

### 4.1 Opening Repertoire Analysis

**What it is**: Statistical profile of which openings the opponent plays, how often, and how
well they perform in each.

**Why it matters**: This is the single most actionable category. If you know your opponent plays
the Caro-Kann 80% of the time as Black and scores poorly against the Advance Variation, you
prepare the Advance.

**Raw data needed**: PGN moves (first 10-20 moves), ECO codes, results, color.

**Patzer data status**: ✅ Fully available. The opening tree already aggregates this.

**Reliability**: High for players with 50+ games. Moderate for 20-50 games. Unreliable below 20.

**UX form**: Opening tree (already exists) enhanced with per-line win/loss summaries, "worst
openings" callout cards, deviation-point markers.

**Risks**: Small sample sizes per specific line. A player might have 200 games total but only 3
in the Advance Caro-Kann. Individual line stats need minimum-game thresholds.

### 4.2 Color-Specific Performance

**What it is**: Win/draw/loss rates and rating performance separated by White and Black.

**Why it matters**: Many amateurs have 10+ percentage-point gaps between colors. Knowing this
tells you whether to aim for a complex fight (if they're weaker with the color they have) or a
simple one.

**Raw data needed**: Results, color assignment.

**Patzer data status**: ✅ Fully available. Color filter exists. Summary stats partially shown.

**Reliability**: High. This is one of the most robust opponent statistics.

**UX form**: Side-by-side performance cards. Delta callout if gap > 5%.

**Risks**: Low. The main risk is overweighting this in time controls where variance is naturally
high (bullet).

### 4.3 Deviation Points and Prep Depth

**What it is**: Where does the opponent leave known theory? How deep do they typically prepare?

**Why it matters**: If an opponent consistently deviates at move 6 in the Sicilian, you know
their theory is shallow there. You can prepare to move 10 and get an advantage.

**Raw data needed**: PGN moves cross-referenced against an opening book (Lichess explorer).

**Patzer data status**: ⚠️ Partially available. The opening tree exists, and the Lichess
explorer integration exists, but there's no automated comparison showing "opponent's last book
move" vs "theory continues here."

**Reliability**: Moderate. Deviation might be intentional (a prepared sideline) or ignorance.
Pattern across multiple games is more telling.

**UX form**: In the opening tree, mark the ply where the opponent's most common continuation
diverges from the explorer's most common continuation. Show "deviation frequency" per position.

**Risks**: Conflating intentional sidelines with ignorance. An opponent who always plays 3...a6
in the Ruy Lopez isn't deviating — they're playing the Morphy Defense.

### 4.4 Transposition Habits

**What it is**: Does the opponent reach the same positions via different move orders?

**Why it matters**: If an opponent transposes into the same middlegame structure from three
different openings, you can prepare one structure instead of three openings.

**Raw data needed**: PGN moves, FEN comparison.

**Patzer data status**: ✅ Available. The tree builder already does FEN normalization and
transposition merging. Transposition nodes are flagged.

**Reliability**: High. This is a structural observation, not a statistical inference.

**UX form**: Transposition indicators in the tree (already partially implemented). Could add
a "common structures" summary grouping games by middlegame pawn structure rather than opening
move order.

**Risks**: Low.

### 4.5 Performance by Opening Family

**What it is**: Aggregate win/loss/draw rates grouped by opening family (Sicilian, Queen's
Gambit, King's Indian, etc.) rather than specific variations.

**Why it matters**: More robust than per-variation stats because sample sizes are larger.
Tells you which opening *families* to steer toward or avoid.

**Raw data needed**: ECO codes or opening names (already in ResearchGame), results.

**Patzer data status**: ✅ Available. ECO and opening name are stored. Grouping logic would
need to be added.

**Reliability**: High for frequently played families. Still need minimum game thresholds.

**UX form**: Summary table or bar chart showing win% per opening family, sorted by
performance delta from average.

**Risks**: ECO codes from different platforms may not be perfectly consistent. Opening name
strings vary between Lichess and Chess.com.

### 4.6 Time Control Sensitivity

**What it is**: How does the opponent's performance change across bullet/blitz/rapid/classical?

**Why it matters**: Some players are significantly stronger or weaker in specific time controls.
If you're preparing for a rapid game and they have a 200-point rating gap between blitz and
rapid, that's relevant.

**Raw data needed**: Time class, rating, results.

**Patzer data status**: ✅ Fully available. Collection cards already show per-speed stats.

**Reliability**: High if sample sizes are adequate per time control.

**UX form**: Rating and win% comparison across time controls (partially implemented in
collection cards).

**Risks**: Low. This is straightforward factual reporting.

### 4.7 Recency and Trend Analysis

**What it is**: Has the opponent's repertoire or performance shifted recently? Are they
improving, declining, or stable?

**Why it matters**: An opponent who switched from 1.e4 to 1.d4 three months ago should be
prepped differently than one who's played 1.e4 for years. A player on a losing streak may
be tilting or may have just returned from a break.

**Raw data needed**: Dates, ratings, results, opening choices.

**Patzer data status**: ⚠️ Data exists but no temporal aggregation is implemented. Games have
dates and the tree tracks `lastPlayed`, but there's no "recent vs historical" comparison.

**Reliability**: Moderate. Trends need enough recent games to be meaningful. If the opponent
played 5 games this month, trend data is noise.

**UX form**: "Recent form" indicator (last 20 games vs all games). Rating sparkline.
Repertoire shift callouts ("Started playing 1.d4 as of [date]").

**Risks**: Overreacting to short-term variance. A 3-game losing streak is not a trend.

### 4.8 Result Termination Patterns

**What it is**: How do their games end? Checkmate, resignation, timeout, draw agreement,
stalemate, insufficient material?

**Why it matters**: A player who loses on time 30% of the time is a different prep target than
one who never flags. A player who never resigns will grind out lost positions — you need to
convert cleanly.

**Raw data needed**: PGN Termination header (present in Lichess PGNs, sometimes in Chess.com).

**Patzer data status**: ⚠️ The data may be in the PGN text but is not extracted into
ResearchGame fields. Would need to parse Termination from stored PGN.

**Reliability**: High where termination data exists. Lichess is reliable. Chess.com varies.

**UX form**: Pie chart or stat cards: "Resigns X%", "Flags Y%", "Checkmate Z%".

**Risks**: Missing termination headers from some sources. PGN paste games almost never
have termination data.

### 4.9 Conversion Rate When Better

**What it is**: When the opponent gets a winning position, how often do they actually win?

**Why it matters**: A player who frequently fails to convert advantages is someone you can
afford to play aggressively against — even if they get an edge, they might not hold it.

**Raw data needed**: **Engine evaluation at multiple points in the game.** This requires
analyzing every opponent game with Stockfish.

**Patzer data status**: ❌ Not available. Research games are not engine-analyzed.

**Reliability**: Would be high with engine data. The metric itself is well-defined.

**UX form**: Conversion rate percentage, with breakdown by game phase.

**Risks**: Massive infrastructure requirement. Analyzing 200+ games at meaningful depth
takes significant compute time.

### 4.10 Resilience When Worse

**What it is**: When behind, how often does the opponent save draws or swindle wins?

**Why it matters**: A resilient defender is harder to beat even when you're winning. You need
to be precise. A collapse-prone player is someone you can grind down with steady pressure.

**Raw data needed**: **Engine evaluation at multiple points.** Same constraint as conversion rate.

**Patzer data status**: ❌ Not available without engine analysis.

**Reliability**: Would be moderate. "Resilience" conflates many factors (opponent mistakes,
time pressure, complexity).

**UX form**: "Swindle rate" or "save rate" when down by >1 pawn equivalent.

**Risks**: Same infrastructure constraint. Also, at amateur level, both sides blunder enough
that "resilience" is often just "opponent also blundered."

### 4.11 Endgame Tendencies

**What it is**: Does the opponent reach endgames frequently? How do they perform in specific
endgame types?

**Why it matters**: If an opponent consistently loses rook endgames, steering toward a rook
endgame is a viable strategy.

**Raw data needed**: Position classification (material counts, piece types remaining) at
game phase transitions. Requires either engine analysis or a heuristic phase detector.

**Patzer data status**: ❌ Not directly available. Could approximate with a material-count
heuristic applied to late-game positions (parse PGN, count material after move 30+).

**Reliability**: Moderate with heuristics. High with proper phase classification.

**UX form**: "Endgame reached: X%", performance by endgame type.

**Risks**: Endgame classification is genuinely hard. "Rook endgame" can mean R+5P vs R+5P
or R+P vs R, which are completely different skill domains.

### 4.12 Tactical vs Positional Tendency

**What it is**: Does the opponent prefer sharp, tactical positions or quiet, positional ones?

**Why it matters**: Knowing this helps you choose openings that play to your strengths
against their weaknesses.

**Raw data needed**: **Engine analysis** for tactical complexity measurement, or opening
classification as a rough proxy.

**Patzer data status**: ⚠️ Opening choice is a weak proxy (Sicilian Dragon = tactical,
London System = positional). No direct measurement available.

**Reliability**: Low without engine analysis. Opening choice is suggestive but not definitive.

**UX form**: Could show "sharp openings chosen: X%" based on opening classification.

**Risks**: Labeling a player "tactical" or "positional" from opening choice is a gross
oversimplification. The same player might play tactically sharp openings but handle them
positionally.

### 4.13 Rating Trajectory

**What it is**: Is the opponent's rating trending up, down, or stable?

**Why it matters**: A rapidly improving player may be underrated. A declining player may be
overrated. Both affect how seriously you should take their current rating.

**Raw data needed**: Ratings and dates (already stored per game).

**Patzer data status**: ✅ Fully available.

**Reliability**: High with enough data points. Need 20+ games over a meaningful time span.

**UX form**: Sparkline or mini rating chart on collection card. "Peak: XXXX, Current: XXXX,
Trend: ↑/↓/→".

**Risks**: Low. This is factual reporting. The only risk is over-interpreting short-term
fluctuations.

### 4.14 Opponent-Strength Sensitivity

**What it is**: How does the opponent perform against higher-rated vs lower-rated opponents?

**Why it matters**: Some players "play up" well against stronger opponents but lose to weaker
ones (nerves, overconfidence). Others crumble against strong opposition.

**Raw data needed**: Opponent ratings per game, results.

**Patzer data status**: ✅ Available. `whiteRating` and `blackRating` are stored.

**Reliability**: Moderate. Needs segmentation by rating bands, which reduces sample size.

**UX form**: Win% by opponent rating band (e.g., 0-100 below, ±100, 100+ above).

**Risks**: Small sample sizes per band. A player with 5 games against 1800+ opponents is
not a reliable sample.

### 4.15 Must-Win / Practical Style

**What it is**: Does the opponent play for decisive results or accept draws?

**Why it matters**: A player who rarely draws is either very aggressive or very inconsistent.
A draw-heavy player may be hard to beat but also hard to lose to.

**Raw data needed**: Results (already available).

**Patzer data status**: ✅ Available. Draw rate is trivially computed.

**Reliability**: High.

**UX form**: "Draw rate: X%", "Decisive rate: Y%".

**Risks**: Draw rate varies enormously by time control. Bullet has very few draws. Classical
has many. Must be shown per time control.

### 4.16 Common Losing Patterns

**What it is**: How does the opponent typically lose? Fast attacks, slow grinds, time trouble,
endgame collapses?

**Why it matters**: If you know *how* they lose, you can steer the game toward those conditions.

**Raw data needed**: Termination data, game length, and ideally engine analysis for phase
identification.

**Patzer data status**: ⚠️ Game length is derivable from PGN move count. Termination is
in PGN text but not extracted. Engine analysis not available for research games.

**Reliability**: Moderate with available data. "Short losses" (under 25 moves) vs "long
losses" (over 40 moves) is derivable and somewhat informative.

**UX form**: Loss distribution by game length. Termination breakdown (if available).

**Risks**: Without engine analysis, you can't distinguish "lost a sharp tactical battle in
20 moves" from "played a terrible opening and resigned."

### 4.17 Move Speed in Known vs Unknown Positions

**What it is**: Does the opponent slow down significantly in unfamiliar positions?

**Why it matters**: If they play instantly in book positions but burn clock outside theory,
getting them out of book quickly is a viable strategy.

**Raw data needed**: **Per-move clock data.** This requires `%clk` annotations in PGN.

**Patzer data status**: ❌ Not extracted. Lichess PGNs include `%clk` but the import
pipeline does not parse move annotations, only headers.

**Reliability**: Would be high with clock data. This is one of the most actionable time-based
insights.

**UX form**: "Average time per move: book positions vs novel positions" or "Time spent
on first novelty."

**Risks**: Clock data availability varies by source. Chess.com archive PGN format differs
from Lichess. PGN paste games rarely have clocks.

### 4.18 Early Simplification vs Complication

**What it is**: Does the opponent tend to trade pieces early, keep tension, trade queens early,
or castle late?

**Why it matters**: A player who always trades queens by move 15 is playing for endgames.
A player who castles late may be vulnerable to early attacks.

**Raw data needed**: PGN move parsing for captures, queen exchanges, castling move number.

**Patzer data status**: ⚠️ Derivable from PGN with parsing work. The PGN is stored. Move
parsing would need to identify captures (x notation), castling (O-O), and queen moves.

**Reliability**: Moderate. Castling timing and queen exchange timing are concrete, measurable
events. "Simplification tendency" is harder to define precisely.

**UX form**: "Average castling move: N", "Queen traded by move 15: X%", "Piece exchanges
before move 20: avg N".

**Risks**: These are descriptive stats, not necessarily actionable. Knowing someone castles
on move 8 on average doesn't tell you much unless it's unusually early or late.

---

## 5. High-Signal Features (Ranked by Value)

### Tier 1: Build These First (Data Ready, High Prep Value)

**1. Opening Weakness Detection**
- *What*: Identify the opponent's worst-performing openings (by win rate, by color)
- *Why*: Directly actionable. "They score 35% in the Advance Caro-Kann" means "play the
  Advance Caro-Kann"
- *Data requirement*: Already available (results + opening tree positions)
- *Minimum threshold*: Require ≥5 games in a line before flagging as weak/strong
- *UX*: "Weak openings" and "Strong openings" summary cards on collection report

**2. Repertoire Coverage Map**
- *What*: Visual summary of what the opponent plays at each critical branch point
- *Why*: Shows gaps in their repertoire. If they play 1.e4 90% and 1.d4 10%, they're a 1.e4
  player who occasionally experiments with 1.d4
- *Data requirement*: Already available (opening tree)
- *UX*: Tree view with percentage labels and frequency bars (mostly exists)

**3. Color Performance Asymmetry**
- *What*: Side-by-side White vs Black win/draw/loss with delta callout
- *Why*: If there's a 15% gap, that's a strategic insight worth surfacing prominently
- *Data requirement*: Already available
- *UX*: Dual stat cards with highlighted delta

**4. Recency-Weighted Repertoire**
- *What*: Show what the opponent has been playing *recently* vs historically
- *Why*: A player who switched from 1.e4 to 1.d4 six months ago should be prepped for 1.d4
- *Data requirement*: Already available (dates stored per game)
- *UX*: "Recent (last 3 months)" vs "All time" toggle on the opening tree. Repertoire shift
  callouts

**5. Rating Trajectory**
- *What*: Rating sparkline with peak, current, trend indicator
- *Why*: Quick context on whether opponent is improving, stable, or declining
- *Data requirement*: Already available
- *UX*: Sparkline on collection card header

### Tier 2: Build After Tier 1 (Moderate Data Work, Good Value)

**6. Deviation Point Detection**
- *What*: Where does the opponent's most common move diverge from the Lichess explorer's
  most common move?
- *Why*: Identifies where their theory ends or where they play sidelines
- *Data requirement*: Cross-reference opening tree with explorer data (both available)
- *UX*: Marker on tree nodes where opponent's top choice differs from explorer's top choice

**7. Result Termination Profile**
- *What*: How do their games end? Resignation, timeout, checkmate, draw
- *Why*: Timeout rate is especially useful — if they flag 25% of the time, time pressure is
  a strategy
- *Data requirement*: Parse PGN Termination header (stored in PGN text, not extracted)
- *UX*: Stat cards: "Resigns: X%", "Flags: Y%", "Checkmate: Z%"

**8. Game Length Distribution**
- *What*: Distribution of game length (in moves) for wins vs losses
- *Why*: A player who wins short games but loses long ones prefers blitz-style play
- *Data requirement*: Count moves in stored PGN
- *UX*: Histogram or summary: "Avg win length: N moves, Avg loss length: M moves"

**9. Draw Rate by Time Control**
- *What*: How often they draw, split by time control
- *Why*: A player who draws 40% in rapid but 5% in bullet has very different style by format
- *Data requirement*: Already available
- *UX*: Per-speed draw rate callout

**10. Opponent Strength Performance**
- *What*: Win rate segmented by opponent rating (above, equal, below)
- *Why*: Some players consistently upset stronger opponents; others fold
- *Data requirement*: Ratings and results (available)
- *UX*: Win% chart by rating band (±100, ±200, ±300)

### Tier 3: Build Later (Requires Infrastructure, High Value If Done Right)

**11. Per-Move Clock Extraction**
- *What*: Parse `%clk` annotations from Lichess PGNs to get time-per-move data
- *Why*: Enables time-trouble analysis, move-speed-in-book vs out-of-book comparison
- *Data requirement*: PGN annotation parsing (data exists in PGN text, not extracted)
- *UX*: Time-per-move chart overlaid on opening tree

**12. Middlegame Structure Classification**
- *What*: Classify games by resulting pawn structure (IQP, Maroczy Bind, Carlsbad, etc.)
- *Why*: If an opponent loses 70% of IQP positions, steering toward IQP structures is a plan
- *Data requirement*: Position analysis at move 15-20, pawn structure classifier
- *UX*: "Common structures" section with performance per structure type

**13. Endgame Type Performance**
- *What*: Win rate in rook endgames, minor piece endgames, pure pawn endgames, etc.
- *Why*: Steering toward their weak endgame type is a concrete strategy
- *Data requirement*: Material classification at game end or at move 30+
- *UX*: Performance table by endgame type

---

## 6. Low-Signal / Dangerous Features

### Should Not Build

**1. Composite Scores (Predictability Score, Mental Stability Score, etc.)**
- *Why not*: A single number that combines multiple unrelated metrics provides less information
  than the components. It creates false confidence ("their Predictability Score is 72, so I
  should do X"). There is no "X" that follows from 72. These scores exist to make the product
  feel scientific, not to help prep.

**2. Psychological Profiling (Tilt Score, Recovery Score, Aggression Triggers)**
- *Why not*: You cannot reliably infer psychological state from game results. At amateur level,
  variance in play quality is enormous even within a single session. A "tilt score" is
  measuring noise and calling it signal. **This is the single most likely feature family to
  cause bad prep decisions.**

**3. Archetype Classification**
- *Why not*: Players are not archetypes. The same player may play the Sicilian Dragon
  (aggressive) and the Queen's Gambit Declined (solid) in the same week. Reducing a complex
  player to "Aggressive Type 3" loses information. It's a marketing feature, not a prep feature.

**4. Game Plan Text Generation**
- *Why not*: "Complicate in the middlegame" and "Pressure the clock" are advice so generic
  they apply to every game. Generating them from stats creates an illusion of personalized
  insight. Real game plans come from knowing specific lines and positions, not aggregate stats.

**5. Trap Detection**
- *Why not*: Without engine analysis of opponent games, you can't detect traps. Even with
  engine analysis, a "trap" is a one-time tactical event that rarely repeats. Finding that
  someone fell for a knight fork in one game tells you nothing about future games. The sample
  size is always N=1 per specific trap.

**6. Tactical Motif Frequency**
- *Why not*: "This player falls for pins 30% more than average" requires engine analysis
  of every game and a tactical motif classifier. The infrastructure cost is extreme and the
  prep value is minimal — you can't steer a game toward "more pins."

### Should Be Deprioritized

**7. Head-to-Head Stats**
- *Why*: Sample size is almost always too small. If you've played someone 5 times, the H2H
  stats are noise. If you've played them 50 times, you probably already know their tendencies.

**8. Win Streak / Loss Streak Analysis**
- *Why*: Streaks in chess results are statistically expected from random variance. A 5-game
  losing streak for a 50% win-rate player happens regularly by chance. Reading psychology
  into streaks is a well-documented cognitive bias.

---

## 7. Data/Model Requirements

### What Can Be Built Today (No New Infrastructure)

| Feature | Data Source | Processing |
|---|---|---|
| Opening weakness detection | ResearchGame results + tree positions | Aggregate win% per opening node, threshold filter |
| Color asymmetry | ResearchGame results + color | Simple split |
| Rating trajectory | ResearchGame ratings + dates | Sort, compute deltas |
| Time control sensitivity | ResearchGame timeClass + ratings + results | Group and compare |
| Draw rate by speed | ResearchGame results + timeClass | Count |
| Opponent strength sensitivity | ResearchGame ratings (both players) + results | Band and aggregate |
| Recency weighting | ResearchGame dates | Filter by recency window |
| Repertoire frequency map | Opening tree (exists) | Already built |

### What Requires Moderate Additional Work

| Feature | What's Needed | Effort |
|---|---|---|
| Termination profile | Parse PGN Termination header from stored PGN text | Small — regex on stored PGN |
| Game length distribution | Count moves in stored PGN | Small — PGN parsing |
| Deviation point detection | Cross-reference tree nodes with explorer data | Medium — needs explorer query per position |
| Castling timing | Parse PGN for O-O/O-O-O move number | Small — PGN parsing |
| Queen exchange timing | Parse PGN for queen captures | Small-medium — needs SAN parsing |

### What Requires Significant Infrastructure

| Feature | What's Needed | Effort | Blocker |
|---|---|---|---|
| Per-move clock data | Parse `%clk` from PGN move annotations | Medium | Import pipeline change, not all sources have clocks |
| Game phase accuracy | Engine analysis of every research game | **Major** | Analysis runs on main thread or needs worker pool; 200+ games × depth 18 = hours of compute |
| Endgame type classification | Material counting at late-game positions | Medium | Needs game replay with chessops, position classification |
| Middlegame structure classification | Pawn structure analysis at ~move 15 | Medium-Large | Needs pawn structure taxonomy and classifier |
| Blunder/mistake distribution | Engine analysis per move | **Major** | Same blocker as game phase accuracy |
| Tactical motif detection | Engine analysis + pattern matching | **Major** | Beyond current scope |
| Conversion/resilience rates | Engine eval at multiple game points | **Major** | Same blocker as game phase accuracy |

### Persistence and Reporting Layers Needed

1. **Derived statistics cache**: Once opponent stats are computed, they should be cached per
   collection and invalidated when games are added/removed. Currently no derived-stats layer
   exists in the openings subsystem.

2. **Report snapshot**: A "last computed" timestamp and summary object per collection would
   enable showing stats without recomputing on every view.

3. **Opening taxonomy**: ECO codes and opening names from PGN headers are inconsistent across
   platforms. A normalization layer (mapping common variants to canonical families) would
   improve grouping.

---

## 8. UX / Product Recommendations

### Where Should Opponent Research Live?

| Surface | Content | Why |
|---|---|---|
| **Collection card (library view)** | Quick stats: total games, win/loss/draw bar, peak/current rating, rating sparkline, color performance delta | First glance when choosing which opponent to study |
| **Collection report (new surface)** | Full opponent profile: opening weaknesses, termination profile, game length distribution, trend indicators, strength sensitivity | Dedicated research view, not crammed into tree sidebar |
| **Opening tree sidebar (session view)** | Per-position stats (exists), deviation markers, recent vs all toggle, sample games | In-context prep while navigating specific lines |

### Presentation Principles

1. **Lead with the opening tree.** It's already built and it's the highest-value surface.
   Everything else is supplementary.

2. **Use minimum-game thresholds everywhere.** Never show a "35% win rate" derived from 3
   games without a sample-size warning. Recommended minimums:
   - Per-line stats: ≥5 games
   - Per-family stats: ≥10 games
   - Aggregate stats: ≥20 games

3. **Show sample sizes next to every stat.** "35% (n=20)" is honest. "35%" alone is
   misleading.

4. **Separate "what they play" from "how they do."** The opening tree shows what they play.
   A report surface should show how they perform.

5. **Recency matters more than volume.** A toggle or visual indicator for "last 3 months"
   vs "all time" prevents stale prep.

6. **Don't hide behind composite scores.** Show the actual stats. Let the user draw
   conclusions. A player who flags 30% of the time doesn't need a "time management score
   of 42" — just show "flags 30% of the time."

7. **Warning badges for unreliable data.** If a collection has fewer than 20 games, show
   a global warning: "Small sample — statistics may not be reliable."

### What Should NOT Be a Dedicated Surface

- **Psychological profiles.** No "opponent dossier" page with mental stability charts.
- **Game plan pages.** No "your strategy for this opponent" auto-generated text.
- **Archetype cards.** No "this player is a Tactical Aggressor" badge.

---

## 9. Phased Roadmap

### Phase 1: Smallest Safe Wins (Current Data, No Infrastructure Changes)

**Goal**: Enhance the existing opening tree and collection cards with actionable stats.

1. **Opening weakness/strength callout cards**
   - Compute win% per opening family (group by ECO first letter or opening name prefix)
   - Show "Strongest openings" and "Weakest openings" on collection report
   - Minimum game threshold: 5 per line, 10 per family
   - Files: `src/openings/tree.ts` (aggregation), `src/openings/view.ts` (rendering)

2. **Color performance delta**
   - Surface White vs Black win% with delta callout on collection cards
   - Already partially computed — needs dedicated UI element
   - Files: `src/openings/view.ts`

3. **Rating trajectory sparkline**
   - Sort games by date, extract ratings, render mini sparkline on collection card
   - Files: `src/openings/view.ts` (rendering), possibly a small chart utility

4. **Sample size warnings**
   - Add (n=X) labels to all percentage stats
   - Show global warning badge on collections with <20 games
   - Files: `src/openings/view.ts`

5. **Recency toggle**
   - "Recent (last 3 months)" vs "All time" filter for opening tree
   - Rebuild tree with date filter applied
   - Files: `src/openings/ctrl.ts` (filter state), `src/openings/tree.ts` (filtering)

**Estimated scope**: 2-3 tasks of 1-3 files each.

### Phase 2: Stronger Scouting Summaries (Moderate Data Work)

**Goal**: Add a dedicated collection report surface with derived stats.

6. **Termination profile extraction**
   - Parse PGN Termination header from stored game PGNs
   - Compute resignation rate, flag rate, checkmate rate
   - Files: `src/openings/types.ts` (add derived fields), `src/openings/view.ts` (render)

7. **Game length distribution**
   - Count half-moves per game from PGN
   - Show average game length, win-length vs loss-length
   - Files: utility function, view rendering

8. **Deviation point markers**
   - For each tree node, compare opponent's top move against Lichess explorer's top move
   - Mark nodes where they diverge (opponent plays a sideline or novelty)
   - Files: `src/openings/ctrl.ts` (explorer cross-reference), `src/openings/view.ts`

9. **Draw rate by time control**
   - Already have the data — compute and display per-speed draw percentage
   - Files: `src/openings/view.ts`

10. **Opponent strength bands**
    - Segment results by opponent rating (±100, ±200, ±300)
    - Show win% per band
    - Files: `src/openings/view.ts` (computation + rendering)

**Estimated scope**: 3-5 tasks of 1-3 files each.

### Phase 3: Advanced Opponent Prep (Infrastructure Additions)

**Goal**: Extract deeper insights that require additional data extraction or processing.

11. **Per-move clock extraction**
    - Modify import pipeline to parse `%clk` annotations from Lichess PGNs
    - Store as optional field on ResearchGame or as separate clock-data structure
    - Enable time-per-move overlay on opening tree
    - Files: `src/openings/import.ts`, `src/openings/types.ts`

12. **Endgame type classification**
    - Replay games with chessops to final position or position at move 30+
    - Classify by remaining material (R+P, B+N, pure pawn, etc.)
    - Show endgame type performance table
    - Files: new utility, `src/openings/view.ts`

13. **Castling and queen exchange timing**
    - Parse PGN for castling move number and queen exchange move number
    - Show averages on report
    - Files: utility function, view rendering

14. **Optional engine analysis for research games**
    - Allow user to trigger batch Stockfish analysis on opponent's games
    - Store engine data per research game (separate from main analysis library)
    - Enable blunder distribution, game phase accuracy, conversion rates
    - Files: Major — would require new analysis-for-research pipeline
    - **Note**: This is the single largest infrastructure addition and should be evaluated
      carefully for ROI before building

**Estimated scope**: 5-8 tasks, some requiring new subsystem work.

---

## 10. Final Recommendation

### Build Now

1. **Opening weakness/strength callouts** — highest value, lowest effort
2. **Color performance delta** — trivial to add, always relevant
3. **Sample size warnings** — prevents misuse of existing stats
4. **Recency toggle** — prevents stale prep

### Build Soon

5. **Rating trajectory sparkline** — quick context
6. **Termination profile** — flag rate is genuinely actionable
7. **Deviation point markers** — helps identify where opponent's theory ends

### Build Later (After Validating Demand)

8. **Game length distribution** — useful but not critical
9. **Per-move clock extraction** — high value but moderate infrastructure cost
10. **Endgame classification** — good if chess engine infrastructure evolves

### Wait or Never Build

- **Engine analysis of research games** — Evaluate only after the above features are live
  and users want deeper analysis. The compute cost is real and the marginal value over
  simpler stats may not justify it.
- **Psychological profiling** — Never build. This is the feature most likely to create
  false confidence and bad prep habits.
- **Composite scores** — Never build. Show component stats, not rolled-up numbers.
- **Archetype classification** — Never build. Players are not archetypes.
- **Auto-generated game plans** — Never build. Generic advice is worse than no advice.

### The Bottom Line

Patzer Pro's openings tool already has a strong foundation. The biggest improvements come from
**surfacing what the data already says more clearly** — not from adding complex analytics.
Opening weaknesses, color asymmetry, recency, and sample size honesty are the four highest-ROI
additions. Everything beyond that should be validated by actual use before investing
infrastructure effort.

---

## Appendix: Key File References

| File | Role in Opponent Research |
|---|---|
| `src/openings/types.ts` | ResearchGame, ResearchCollection data model |
| `src/openings/ctrl.ts` | Session state, color/speed filters, navigation |
| `src/openings/tree.ts` | Opening tree builder, transposition merge, position stats |
| `src/openings/import.ts` | Lichess/Chess.com/PGN fetch pipeline |
| `src/openings/db.ts` | IndexedDB persistence (patzer-openings) |
| `src/openings/view.ts` | Full UI rendering (library, session, import) |
| `src/openings/explorer*.ts` | Lichess explorer integration for comparison data |
| `src/import/types.ts` | ImportedGame type (shared with analysis library) |
| `src/import/lichess.ts` | Lichess API adapter |
| `src/import/chesscom.ts` | Chess.com API adapter |
| `src/engine/tactics.ts` | Swing detection (could theoretically apply to research games) |
| `src/engine/winchances.ts` | Move quality classification |
| `src/puzzles/types.ts` | PuzzleDefinition (potential future: puzzles from opponent mistakes) |

## Appendix: Competitor Feature Map

| Competitor Feature | Patzer Recommendation | Rationale |
|---|---|---|
| Opening repertoire analysis | ✅ Build (enhance existing) | Core value, data ready |
| Weak opening detection | ✅ Build | Directly actionable |
| Predictability Score | ❌ Never build | False confidence from composite |
| Tilt Score | ❌ Never build | Pseudoscience at amateur level |
| Mental Stability Score | ❌ Never build | Cannot infer from results |
| Time pressure analysis | ⚠️ Build if clock data available | High value, data-dependent |
| Endgame category performance | ⚠️ Build later | Needs position classification |
| Game phase accuracy | ⚠️ Build much later | Needs engine analysis of all games |
| Archetype system | ❌ Never build | Oversimplification |
| Anti-repertoire suggestions | ⚠️ Consider cautiously | Only if weakness detection is solid |
| Head-to-head | ⚠️ Deprioritize | Sample sizes too small |
| Trap detection | ❌ Never build | N=1 per trap, misleading |
| Game plan generation | ❌ Never build | Generic advice, false personalization |
| Psychological exploitation | ❌ Never build | Ethically dubious, statistically unsound |
| Post-loss winrate | ⚠️ Interesting but noisy | Requires sequential game data |
| Resignation rate | ✅ Build (Phase 2) | Simple, somewhat informative |
| Flag rate | ✅ Build (Phase 2) | Actionable if significant |
