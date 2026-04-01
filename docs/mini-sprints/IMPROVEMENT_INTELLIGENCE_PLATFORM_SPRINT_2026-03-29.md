# Mini Sprint — Improvement Intelligence Platform

Date: 2026-03-29
Status: data layer done, UI layer mostly placeholder (audited 2026-03-30)
Source audit: [docs/audits/CHESS_IMPROVEMENT_PLATFORM_AUDIT.md](/Users/leftcoast/Development/PatzerPatzer/docs/audits/CHESS_IMPROVEMENT_PLATFORM_AUDIT.md)
Scope: build the data foundation, weakness diagnosis engine, and stats dashboard that turns Patzer from "analyze individual games" into "understand and improve your chess"

### Task Status (as of 2026-03-30)

| Task | Status | Notes |
|---|---|---|
| Task 1 — Clock data on Lichess import | **Done** | Import adapters extract clocks |
| Task 2 — GameSummary type and persistence | **Done** | `stats/types.ts` has full schema |
| Task 3 — GameSummary extraction | **Done** | `stats/extract.ts` generates from analysis |
| Task 4 — Backfill GameSummaries | **Done** | Backfill for pre-existing analyzed games |
| Task 5 — Stats controller and routing | **Done** | `stats/ctrl.ts` with time-filter |
| Task 6 — Weakness aggregation engine | **Done** | `stats/weakness.ts` with 8 detectors |
| Task 7 — Weakness dashboard panel | **Partial** | `stats/view.ts` has placeholder sections, not full cards |
| Task 8 — Accuracy and blunder trends | **Partial** | SVG polyline chart exists but minimal |
| Task 9a — Opening win rate from import data | **Not started** | No analysis required; pure W/D/L aggregation |
| Task 9 — Opening performance table (full) | **Not started** | No opening-specific stats view |
| Task 10 — Tactical profile | **Not started** | No tactical breakdown view |
| Task 11 — Post-game summary panel | **Not started** | No post-game summary in analysis view |
| Task 12 — Persist retro session results | **Done** | Retro results stored in IDB |
| Task 13 — Training recommendations | **Not started** | Detectors suggest actions but no UI |
| Task 14 — Time management profile | **Not started** | Clock data captured but no stats view |
| Task 15 — Conversion and resourcefulness | **Not started** | Data computed but no view |

---

## Goal

Build a complete improvement intelligence layer on top of Patzer's existing game import and analysis infrastructure:

- persist per-game summary data as games are analyzed
- aggregate summaries into a weakness diagnosis engine
- surface weaknesses, trends, opening health, and tactical profile on a rich stats dashboard
- connect diagnosed weaknesses to concrete training actions (puzzles, retro, openings)
- add a subtle post-game summary panel to the analysis page
- enable clock data capture for future time-management analysis
- persist retro session results for longitudinal tracking

The analysis page is mostly left alone. New tools live in the stats page and menu surfaces.

---

## Why this sprint is needed

Patzer already has the hardest infrastructure built:

- Game import from Lichess, Chess.com, and PGN paste
- Full Stockfish batch analysis with win-chance loss classification
- Missed-moment detection (swing, collapse, missed mate)
- Per-game accuracy scoring
- Learn From Your Mistakes (retrospection) with candidate building and guided practice
- Puzzle system with Glicko-2 rating and attempt history
- Opening research with frequency-weighted trees

The gap is that none of this connects into structured improvement feedback. Every stat is per-game, computed on-the-fly. There is:

- no cross-game aggregation
- no weakness detection
- no longitudinal trend storage
- no training recommendations
- no stats page (placeholder only: `h('h1', 'Stats Page')` in [src/main.ts](/Users/leftcoast/Development/PatzerPatzer/src/main.ts))

A user who has analyzed 50 games has no way to see what they're consistently doing wrong or what to work on next.

---

## User priorities from product discussion

1. **Weakness diagnosis over progress vanity** — "what should I work on" is the primary question
2. **Tactical weakness detection is highest value** — missed forks, missed moments, tactical blindness
3. **Opening intelligence is close second** — identify weak openings, track repertoire health
4. **Tight puzzle integration** — weaknesses should feed puzzle selection and training queues
5. **Analysis page mostly untouched** — new tools live in stats/dashboard/menu surfaces
6. **Post-game summary welcome but low-key** — placed below existing UI, user scrolls to it
7. **Clock data should be captured going forward** — enables time-management analysis
8. **Go big** — full Phase 1 + substantial Phase 2 from the audit

---

## Key data sources already available

| Data | Source | File |
|---|---|---|
| Per-move eval (cp, mate, best, loss, label) | StoredAnalysis nodes | [src/idb/index.ts](/Users/leftcoast/Development/PatzerPatzer/src/idb/index.ts) |
| Move classification (good/inaccuracy/mistake/blunder) | classifyLoss thresholds | [src/engine/winchances.ts](/Users/leftcoast/Development/PatzerPatzer/src/engine/winchances.ts) |
| Missed moments (swing/collapse/missed mate) | tactics detection | [src/engine/tactics.ts](/Users/leftcoast/Development/PatzerPatzer/src/engine/tactics.ts) |
| Per-game accuracy | exponential decay + sliding window | [src/analyse/evalView.ts](/Users/leftcoast/Development/PatzerPatzer/src/analyse/evalView.ts) |
| Game metadata (ratings, date, time control, result) | ImportedGame | [src/import/types.ts](/Users/leftcoast/Development/PatzerPatzer/src/import/types.ts) |
| Opening info (ECO, name) | PGN headers | [src/import/types.ts](/Users/leftcoast/Development/PatzerPatzer/src/import/types.ts) |
| Retro candidates (mistake positions) | buildRetroCandidates | [src/analyse/retro.ts](/Users/leftcoast/Development/PatzerPatzer/src/analyse/retro.ts) |
| Puzzle attempts + rating | PuzzleAttempt, UserPuzzlePerf | [src/puzzles/puzzleDb.ts](/Users/leftcoast/Development/PatzerPatzer/src/puzzles/puzzleDb.ts) |
| Clock data per move | TreeNode.clock (if PGN has %clk) | [src/tree/types.ts](/Users/leftcoast/Development/PatzerPatzer/src/tree/types.ts) |

---

## Tasks

### Task 1 — Enable clock data on Lichess import

**Files**: [src/import/lichess.ts](/Users/leftcoast/Development/PatzerPatzer/src/import/lichess.ts)
**Depends on**: nothing
**Blocked by**: nothing

Add `clocks=true` parameter to the Lichess game export API call. The PGN parser already handles `%clk` annotations ([src/tree/pgn.ts](/Users/leftcoast/Development/PatzerPatzer/src/tree/pgn.ts) lines 51–61) and stores them on `TreeNode.clock`. The import adapter just doesn't request them.

**Acceptance**:
- Newly imported Lichess games have `TreeNode.clock` populated on each move node
- No behavior change for Chess.com or PGN paste imports
- Existing imported games are unaffected

---

### Task 2 — GameSummary type and persistence

**Files**: `src/stats/types.ts` (new), [src/idb/index.ts](/Users/leftcoast/Development/PatzerPatzer/src/idb/index.ts)
**Depends on**: nothing
**Blocked by**: nothing

Define the `GameSummary` record type:

```typescript
interface GameSummary {
  gameId: string;
  date: string;                    // ISO date from game
  analyzedAt: string;              // ISO timestamp
  source: 'lichess' | 'chesscom' | 'pgn';
  timeClass: string;               // bullet/blitz/rapid/classical
  playerColor: 'white' | 'black';
  opponentRating: number;
  playerRating: number;
  result: string;                  // 1-0, 0-1, 1/2-1/2
  accuracy: number;                // 0-100
  blunderCount: number;
  mistakeCount: number;
  inaccuracyCount: number;
  goodMoveCount: number;
  totalMoves: number;              // player's moves only
  missedMomentCount: number;
  worstLoss: number;               // magnitude of worst single-move loss
  worstLossMove: number;           // ply of worst move
  opening: string;                 // ECO or opening name
  eco: string;                     // ECO code
  hadWinningPosition: boolean;     // win-chance > 0.7 sustained 3+ moves
  converted: boolean;              // had winning position AND won
  hadLosingPosition: boolean;      // win-chance < 0.3 sustained 3+ moves
  survived: boolean;               // had losing position AND drew/won
  retroCandidateCount: number;     // learnable mistake positions
  hasClockData: boolean;           // whether clock times were available
  avgTimePerMove?: number;         // seconds, if clock data present
  timeTroubleMoves?: number;       // moves made with < 30s remaining
  analysisDepth: number;           // depth used for batch analysis
}
```

Add a new IDB object store `game-summaries` to the `patzer-pro` database. Bump DB version. Write `saveGameSummary()`, `getGameSummary(gameId)`, `listGameSummaries()` functions.

**Acceptance**:
- Can save, retrieve, and list GameSummary records
- IDB migration runs without data loss
- Type exported from `src/stats/types.ts`

---

### Task 3 — GameSummary extraction from analyzed games

**Files**: `src/stats/extract.ts` (new), [src/engine/batch.ts](/Users/leftcoast/Development/PatzerPatzer/src/engine/batch.ts)
**Depends on**: Task 2
**Blocked by**: Task 2

Write `extractGameSummary()` — takes a `StoredAnalysis` + `ImportedGame` + game tree and produces a `GameSummary`. This function:

1. Walks StoredAnalysis nodes, counts classifications (good/inaccuracy/mistake/blunder) for the player's moves only
2. Finds worst single-move loss
3. Counts missed moments from existing detection
4. Computes accuracy using existing algorithm (or reads cached value)
5. Detects conversion: scans win-chance values for sustained > 0.7 (3+ consecutive player moves), checks result
6. Detects resourcefulness: scans for sustained < 0.3, checks result
7. Extracts clock data if present (average time per move, time-trouble move count)
8. Pulls opening/ECO from ImportedGame metadata

Hook into batch analysis completion: after `saveAnalysisToIdb()` succeeds, call `extractGameSummary()` and `saveGameSummary()`.

**Acceptance**:
- Analyzing a game automatically produces a GameSummary in IDB
- Summary values match what's visible in the existing per-game eval display
- Clock fields populated when TreeNode.clock data is present

---

### Task 4 — Backfill GameSummaries for existing analyzed games

**Files**: `src/stats/extract.ts`
**Depends on**: Task 3
**Blocked by**: Task 3

On stats page load (or app startup), detect analyzed games in IDB that lack a corresponding GameSummary. For each, load the StoredAnalysis + ImportedGame, run `extractGameSummary()`, and persist.

**Acceptance**:
- Users with previously analyzed games see summaries without re-analyzing
- Backfill runs once per missing game, not on every page load
- Progress indication if backfill is slow (many games)

---

### Task 5 — Stats controller and routing

**Files**: `src/stats/ctrl.ts` (new), [src/main.ts](/Users/leftcoast/Development/PatzerPatzer/src/main.ts) (route wiring only)
**Depends on**: Task 2
**Blocked by**: Task 2

Create `src/stats/ctrl.ts` following the Lichess ctrl + view pattern used by other Patzer subsystems ([src/puzzles/ctrl.ts](/Users/leftcoast/Development/PatzerPatzer/src/puzzles/ctrl.ts), [src/openings/ctrl.ts](/Users/leftcoast/Development/PatzerPatzer/src/openings/ctrl.ts)).

Controller responsibilities:
- Load all GameSummary records on init
- Provide computed aggregates to the view
- Manage filter state (time control filter, date range filter)
- Expose a `redraw` callback

Replace the placeholder in `src/main.ts` route handling with the new stats controller + view.

**Acceptance**:
- `/stats` route loads the new controller
- Controller has access to all GameSummary records
- Placeholder is gone

---

### Task 6 — Weakness aggregation engine

**Files**: `src/stats/weakness.ts` (new)
**Depends on**: Task 5
**Blocked by**: Task 5

Core algorithm: takes all GameSummary records and produces a ranked weakness list.

**Weakness categories to detect**:

| Category | Detection logic | Minimum sample |
|---|---|---|
| High blunder rate | avg blunders/game above threshold (e.g., > 2.0) | 10 games |
| Tactical blindness | avg missed moments/game above threshold | 10 games |
| Conversion failure | conversion rate below threshold (e.g., < 60%) | 5 games with winning position |
| Opening weakness | specific opening with win rate or accuracy significantly below average | 5 games in that opening |
| Color asymmetry | accuracy or win-rate gap > 8 points between white and black | 15 games per color |
| Time-control gap | accuracy gap > 8 points between time controls | 10 games per control |
| Time trouble | > 30% of blunders occur in time trouble (< 30s remaining) | 10 games with clock data |
| Endgame collapse | blunder rate in last 15 moves significantly above game average | 10 games reaching move 30+ |
| Early-game errors | blunder rate in moves 1-15 significantly above average | 10 games |

Each weakness output:

```typescript
interface DiagnosedWeakness {
  category: string;
  severity: 'critical' | 'significant' | 'moderate';
  confidence: 'high' | 'medium' | 'low';
  sampleSize: number;
  description: string;          // human-readable: "You blunder 2.4 times per game on average"
  recommendation: string;       // "Focus on tactical pattern training"
  trainingAction?: {
    type: 'puzzles' | 'retro' | 'openings' | 'review';
    target?: string;            // puzzle theme, opening name, etc.
    label: string;              // "Train fork puzzles"
  };
}
```

Return top 5 weaknesses sorted by severity then confidence.

**Acceptance**:
- Given 20+ GameSummary records, produces ranked weakness list
- Each weakness has description, recommendation, and training action
- Below minimum sample sizes, returns fewer results (not unreliable ones)
- Returns empty list if fewer than 10 analyzed games total

---

### Task 7 — Stats dashboard view: weakness panel

**Files**: `src/stats/view.ts` (new)
**Depends on**: Task 6
**Blocked by**: Task 6

Primary content of the stats page. The "What to work on" panel.

**Layout**:
- Header: "Your Weaknesses" (or "Areas for Improvement")
- If < 10 analyzed games: show "Analyze more games to see your weakness profile" with game count
- Otherwise: render each DiagnosedWeakness as a card:
  - Severity indicator (color or icon)
  - Category label
  - Description text
  - Sample size context ("Based on 34 analyzed games")
  - Training action button/link ("Train this →")
- Maximum 5 weakness cards

**Styling**: Follow existing Patzer conventions. No new design system. Snabbdom `h()` only.

**Acceptance**:
- Stats page shows weakness cards when sufficient data exists
- Insufficient-data state renders cleanly
- Training action links navigate to correct tool/page

---

### Task 8 — Stats dashboard view: accuracy and blunder trends

**Files**: `src/stats/view.ts`
**Depends on**: Task 5
**Blocked by**: Task 5 (can run parallel with Task 6/7 if view file is coordinated)

Add trend charts below the weakness panel.

**Charts**:
1. **Accuracy moving average** — 20-game rolling window, one line per time control if multiple exist
2. **Blunder rate moving average** — same windowing

**Chart rendering**: Use simple canvas or SVG rendering inline (no chart library). Lichess uses custom SVG for eval graphs — follow that pattern. Reference: [src/analyse/evalView.ts](/Users/leftcoast/Development/PatzerPatzer/src/analyse/evalView.ts) eval graph rendering.

**Rules**:
- Minimum 20 games before showing trends (show "Need N more games" otherwise)
- Always show sample size
- Separate time controls (don't mix blitz and rapid into one line)
- X-axis: game date. Y-axis: metric value.
- Clickable points that show the game details on hover/tap (stretch goal — not required for V1)

**Acceptance**:
- Charts render with real GameSummary data
- Time controls separated
- Minimum-game threshold enforced
- No chart library dependency

---

### Task 9a — Stats dashboard view: opening win rate from import data

**Files**: `src/stats/view.ts`
**Depends on**: Task 5 (stats controller/routing)
**Blocked by**: nothing — no analysis required

Surface-level opening performance table built entirely from raw imported game data.
Every imported game already carries `result`, `white`, `black`, `eco`, and `opening`
fields — no Stockfish review needed.

**Columns**: Opening name (ECO fallback), color played, games, W / D / L, win rate %

**Rules**:
- Aggregate by `opening` field (fall back to `eco` if opening name missing)
- Filter to openings with 5+ games to avoid noise
- Separate rows for White and Black (same opening played as both colors is two rows)
- Default sort: worst win rate first
- Highlight rows where win rate is more than 15 percentage points below the user's
  overall win rate for that color

**Data source**: the imported games array already in memory/IDB — same source the
Opening Tree uses. No dependency on GameSummary or analysis pipeline.

**Note**: accuracy and blunder columns are intentionally absent here — those require
analysis. Task 9 (full table) adds those columns once summaries exist.

**Acceptance**:
- Table renders immediately after import, before any games are reviewed
- Rows sorted worst-first
- Below-average rows visually highlighted
- Hidden when fewer than 3 qualifying openings (5+ games each)
- "Analyzed data available" indicator on rows that also have GameSummary records
  (future hook for Task 9 upgrade)

---

### Task 9 — Stats dashboard view: opening performance table (full)

**Files**: `src/stats/view.ts`
**Depends on**: Task 5, Task 9a (extends it with analysis columns)
**Blocked by**: Task 5

Extends Task 9a with accuracy and blunder data from analyzed games.
Rows that have no GameSummary records show win-rate-only columns; rows with
summaries show the full column set.

Table of the user's openings from analyzed games.

**Columns**: Opening name (or ECO), games played, win rate, average accuracy, average blunders.

**Rules**:
- Only show openings with 5+ analyzed games
- Default sort: worst-performing first (lowest win rate or accuracy)
- Highlight openings significantly below the user's average accuracy (> 5 points below)
- Collapse to top 10 with "show all" toggle if many openings

**Acceptance**:
- Table renders from GameSummary opening/eco fields
- Sorted by worst first
- Below-average openings visually highlighted
- Hidden when insufficient data

---

### Task 10 — Stats dashboard view: tactical profile

**Files**: `src/stats/view.ts`
**Depends on**: Task 5
**Blocked by**: Task 5

Show the user's tactical profile.

**Content**:
- Missed moments per game (average)
- Breakdown by type: swing, collapse, missed mate (if these are stored in GameSummary — may need to extend Task 2/3 to include type breakdown)
- Total missed moments across all games
- If trend data sufficient: missed-moment rate trend (same moving-average approach as Task 8)

**Note**: If missed-moment type breakdown is not in GameSummary, this task should extend the type to include it (coordinate with Task 2).

**Acceptance**:
- Tactical profile section renders on stats page
- Shows per-game average, type breakdown, total
- Trend shown when sufficient data exists

---

### Task 11 — Post-game summary panel on analysis page

**Files**: `src/analyse/summaryView.ts` (new), analysis page view integration
**Depends on**: Task 3 (needs extractGameSummary or equivalent)
**Blocked by**: Task 3

After batch analysis completes, render a collapsible summary panel **below** the existing analysis controls (eval graph, nav buttons, move list). The user scrolls down to see it.

**Content**:
- Accuracy score
- Classification breakdown: "X good, Y inaccuracies, Z mistakes, W blunders"
- Worst move: "Move 23 (Nf3) lost X% win chance" with clickable link to that position
- Opening assessment: opening name + whether evaluation was equal/slight advantage/etc. at end of opening phase
- Conversion note: if a winning position was reached, whether it was converted
- Missed moments count with "Learn from your mistakes" link

**Placement**: Below all existing UI. Collapsible (default expanded first time, remembers state).

**Acceptance**:
- Panel appears after batch analysis completion
- Positioned below existing controls — does not displace anything
- Collapsible with persisted state
- Worst-move link navigates to that position in the analysis board

---

### Task 12 — Persist retro session results

**Files**: [src/analyse/retroCtrl.ts](/Users/leftcoast/Development/PatzerPatzer/src/analyse/retroCtrl.ts), [src/idb/index.ts](/Users/leftcoast/Development/PatzerPatzer/src/idb/index.ts)
**Depends on**: nothing
**Blocked by**: nothing

When a Learn From Your Mistakes session ends (user has attempted all candidates, or navigates away after attempting at least one), persist:

```typescript
interface RetroSessionResult {
  gameId: string;
  completedAt: string;          // ISO timestamp
  candidatesTotal: number;
  candidatesFound: number;      // exact best move
  candidatesNearBest: number;   // acceptable alternative
  candidatesFailed: number;
  candidatesSkipped: number;
}
```

New IDB store `retro-results` in `patzer-pro` database.

**Acceptance**:
- Completing a retro session writes a record to IDB
- Partial sessions (some candidates attempted) also persist
- Can retrieve retro results per game

---

### Task 13 — Training recommendations with puzzle integration

**Files**: `src/stats/weakness.ts`, `src/stats/view.ts`
**Depends on**: Task 7
**Blocked by**: Task 7

Enhance the weakness cards with concrete "Train this" actions:

| Weakness category | Training action |
|---|---|
| Tactical blindness / missed moments | Navigate to puzzle library filtered by relevant themes (fork, pin, skewer, etc.) |
| High blunder rate | Navigate to Learn From Your Mistakes on worst recent game |
| Conversion failure | Surface games where winning position was lost, link to review |
| Opening weakness | Navigate to openings page with the weak opening highlighted |
| Time trouble | Show time-management tip + link to review time-trouble games |

Each action button navigates to the relevant Patzer tool with appropriate context.

**Acceptance**:
- Each weakness card has a working "Train this" action
- Puzzle link filters by relevant theme (if shard metadata supports it)
- Opening link navigates to openings page
- Game review links navigate to analysis page with the relevant game loaded

---

### Task 14 — Clock/time-management profile

**Files**: `src/stats/view.ts`, `src/stats/extract.ts`
**Depends on**: Task 5, Task 1
**Blocked by**: Task 5

If GameSummary records contain clock data (`hasClockData: true`), show a time-management section:

- Average time per move
- Time-trouble frequency (% of games where player had < 30s remaining)
- Blunder-in-time-trouble rate vs. overall blunder rate
- Simple visual: "X% of your blunders happen in time trouble"

Only shown when 10+ games have clock data. Hidden otherwise with no placeholder.

**Acceptance**:
- Time panel renders when clock data present in sufficient games
- Completely hidden when no clock data
- Blunder-in-time-trouble correlation displayed clearly

---

### Task 15 — Conversion and resourcefulness metrics

**Files**: `src/stats/view.ts`
**Depends on**: Task 5, Task 3 (conversion/resourcefulness fields in GameSummary)
**Blocked by**: Task 5

Show conversion and resourcefulness stats on the stats page:

- **Conversion rate**: "You reached a winning position in X games and converted Y of them (Z%)"
- **Resourcefulness rate**: "You were in a losing position in X games and saved Y of them (Z%)"

Only show when at least 5 games had winning/losing positions respectively.

Optionally: list the specific games where conversion failed, as clickable links to review them. This is high-value — the user can go directly to the games where they let a win slip.

**Acceptance**:
- Conversion and resourcefulness stats rendered on stats page
- Sample-size minimums enforced
- Failed-conversion game list links to analysis page (stretch goal)

---

## Task dependency graph

```
Task 1 (clock fix) ─────────────────────── standalone, do first

Task 2 (types + IDB) ──→ Task 3 (extraction) ──→ Task 4 (backfill)
                    │           │
                    │           └──→ Task 11 (post-game summary)
                    │
                    └──→ Task 5 (stats ctrl + route)
                                │
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
              Task 6        Task 8       Task 9
           (weakness)     (trends)    (openings)
                │
                ▼                     Task 10
              Task 7                (tactical)
           (weak panel)
                │
                ▼
           Task 13
        (training recs)
                │
         ┌──────┴──────┐
         ▼             ▼
      Task 14       Task 15
    (clock prof)  (conversion)

Task 12 (retro persist) ─────────────── standalone, parallel with anything
```

**Parallelizable work**:
- Tasks 1 and 2 can start simultaneously
- Task 12 can run any time
- Tasks 8, 9, 10 can run in parallel once Task 5 is done
- Task 11 can run once Task 3 is done (parallel with stats page work)

---

## New files created by this sprint

| File | Purpose |
|---|---|
| `src/stats/types.ts` | GameSummary, DiagnosedWeakness, RetroSessionResult types |
| `src/stats/extract.ts` | GameSummary extraction from analyzed games, backfill logic |
| `src/stats/weakness.ts` | Weakness aggregation engine |
| `src/stats/ctrl.ts` | Stats page controller |
| `src/stats/view.ts` | Stats page Snabbdom views |
| `src/analyse/summaryView.ts` | Post-game summary panel |

---

## Files modified by this sprint

| File | Change |
|---|---|
| `src/import/lichess.ts` | Add `clocks=true` to API call |
| `src/idb/index.ts` | Add `game-summaries` and `retro-results` stores, bump DB version |
| `src/engine/batch.ts` | Hook GameSummary extraction on analysis completion |
| `src/main.ts` | Wire stats route to new controller |
| `src/analyse/retroCtrl.ts` | Persist session results on completion |
| Analysis page view file | Mount summaryView below existing controls |

---

## What this sprint does NOT do

- Does not change the analysis board layout or behavior
- Does not add new UI elements above existing analysis controls
- Does not build spaced repetition or drill modes (Phase 3)
- Does not build periodic reports or coaching summaries (Phase 3)
- Does not build a study plan generator (Phase 3)
- Does not add cross-device sync for stats (requires auth infrastructure)
- Does not add gamification (badges, XP, streaks) — explicitly avoided
- Does not estimate FIDE ratings from accuracy — explicitly avoided
- Does not add social comparison features — explicitly avoided

---

## Minimum sample size rules (enforced across all views)

| Context | Minimum games | Behavior below minimum |
|---|---|---|
| Show any stats page content | 10 analyzed games | "Analyze N more games to see your improvement profile" |
| Show trend charts | 20 analyzed games | "Need N more games for trends" |
| Show per-opening stats | 5 games in that opening | Opening hidden from table |
| Show conversion rate | 5 games with winning position | Metric hidden |
| Show resourcefulness | 5 games with losing position | Metric hidden |
| Show time-management profile | 10 games with clock data | Section hidden |
| Show weakness diagnosis | 10 analyzed games | Weakness panel shows data-needed message |
| Per-weakness minimum | Varies by category (see Task 6) | Weakness not surfaced |

---

## Risk notes

1. **Analysis depth variance**: Games analyzed at different depths produce different classification results. GameSummary should store `analysisDepth` and the stats page should note when data includes mixed depths.

2. **Platform rating mixing**: Chess.com and Lichess ratings are not comparable. Opponent-strength buckets should be platform-scoped or clearly labeled.

3. **Opening classification granularity**: ECO codes can be coarse — multiple different systems share a code. Opening names from PGN headers may be more specific but less consistent. Use both, prefer the name for display.

4. **Conversion detection threshold**: The 0.7 win-chance threshold for "winning position" is a design parameter. Too low = noisy (slight advantages count as "winning"), too high = misses real wins. Start at 0.7, document it, revisit after user feedback.

5. **Backfill performance**: If a user has 200+ analyzed games, backfill on stats page load could be slow. Should run incrementally and show progress.
