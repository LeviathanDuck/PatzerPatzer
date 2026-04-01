# Mini Sprint — Opponent Research Platform

Date: 2026-03-29
Status: partially implemented (audited 2026-03-30)
Source audit: [docs/research/OPPONENT_RESEARCH_AUDIT.md](/Users/leftcoast/Development/PatzerPatzer/docs/research/OPPONENT_RESEARCH_AUDIT.md)
Scope: Rename "Openings" to "Opponents", add scouting features (deviation detection, termination profile, sparklines, recommendations, traps, ORP variation save), strengthen data honesty

### Phase Status (as of 2026-03-30)

| Phase | Status | Notes |
|---|---|---|
| Phase 0 — Rename to Opponents | **Done** | Route, nav, and user-facing text updated |
| Phase 1 — Rating Sparkline | **Done** | Typecheck issues fixed (CCP-458) |
| Phase 2 — Termination Profile | **Done** | Analytics + display. Typecheck fixed (CCP-460) |
| Phase 3 — Deviation Detection | **Done** | Engine, summary panel, and move-row markers (CCP-468) |
| Phase 4 — Recommendations | **Not started** | |
| Phase 5 — Traps | **Code only** | `openings/traps.ts` detection logic exists, no UI |
| Phase 6 — Sample Size Warnings | **Not started** | |
| Phase 7 — Recency-Weighted Default | **Not started** | |
| Phase 8 — Save to ORP | **Not started** | ORP drill system deferred |
| Phase 9 — Research Tasks | **Not started** | |

---

## Goal

Transform the current "Openings" page into a full "Opponents" research platform. The opening tree becomes a sub-tool within the Opponents section. New scouting features turn imported game history into actionable pre-game preparation.

**User priorities**: Blitz (primary), Rapid (secondary). Personal use AND for others.

---

## Relationship to CCP-323 Tool Suite Sprint

This sprint is the **new source of truth** for opponent research work.

| CCP-323 Phase | Status | This Sprint |
|---|---|---|
| Phases 1-4: Tool rail, analytics, repertoire, prep report foundations | Done | Reused as infrastructure |
| Phase 5: Prep Report interactive modules | Partial | **Absorbed** — Phases 4, 5, 6, 7 of this sprint cover remaining work |
| Phase 6: Style dashboard | Not started | **Not in this sprint** — remains in CCP-323 |
| Phase 7: Practice Against Them | Not started | **Not in this sprint** — remains in CCP-323 |

CCP-323 Phases 6-7 can proceed independently after this sprint.

---

## Phase 0 — Rename "Openings" to "Opponents"

### Task 0.1: Route and navigation rename

**Files**: `src/router.ts`, `src/header/index.ts`, `src/main.ts`

Changes:
- `router.ts:10` — `'openings'` → `'opponents'`; add backward-compat entry `{ pattern: ['openings'], name: 'opponents' }` so old bookmarks work
- `header/index.ts:90` — `case 'openings':` → `case 'opponents':`
- `header/index.ts:101` — label `'Openings'` → `'Opponents'`, href `'#/opponents'`, section `'opponents'`
- `main.ts:969` — route case `'openings'` → `'opponents'`
- `main.ts:1180,1200` — route name checks `'openings'` → `'opponents'`

**Acceptance**: `#/opponents` works. Old `#/openings` URLs redirect correctly. Nav shows "Opponents".

### Task 0.2: User-facing text rename

**Files**: `src/openings/view.ts`

Changes (user-facing strings only):
- Lines 80, 93: `'Opening Preparation'` → `'Opponent Research'`
- Line 112: empty-state title → `'Opponent Research'`
- Line 1103: session fallback title → `'Opponent Research'`
- Line 1297: menu title attr → `'Opponents menu'`

**Leave unchanged**: CSS class names (`.openings__*`), file paths (`src/openings/`), IDB name (`patzer-openings`), internal function names, puzzle filter tab "Openings" label in `puzzles/view.ts` (refers to ECO codes, not the page).

**Acceptance**: All user-visible text says "Opponent(s)". No behavioral changes.

**Dependencies**: None. Do first.

---

## Phase 1 — Rating Sparkline on Collection Cards

### Task 1.1: Sparkline data extraction and SVG rendering

**Files**: `src/openings/view.ts`

**Data source**: `ResearchGame[]` already has `whiteRating`/`blackRating` + `date`. The existing `computeCardStats` function (view.ts ~line 137) already iterates games and tracks peak/current rating.

**Implementation**:
1. Extract `(date, rating)` pairs for the target player, sorted by date
2. Render inline SVG (~120x24px) with `polyline` using the pattern from `src/analyse/evalView.ts`
3. Add: peak marker (dot at max), current rating label, trend arrow (last 20% vs first 20%)
4. Graceful degradation: hide sparkline when < 5 rated games

**Acceptance**: Collection cards show rating sparkline. Peak, current, trend visible. No sparkline for sparse data.

**Dependencies**: None. Parallel with Phase 0.

---

## Phase 2 — Termination Profile + Game Length

### Task 2.1: PGN metadata extraction functions

**Files**: `src/openings/analytics.ts`

Add two new pure functions:

**`computeTerminationProfile(games, target)`** → `TerminationProfile`
- Regex parse `[Termination "..."]` from stored PGN text
- Lichess values: "Normal" (resign), "Time forfeit" (flag), "Abandoned", etc.
- Chess.com values: similar patterns, normalize to common enum
- Return: `{ resignation, timeout, checkmate, drawAgreement, stalemate, other, total }`

**`computeGameLengthProfile(games, target)`** → `GameLengthProfile`
- Count moves in PGN movetext via regex (count move number tokens)
- Return: `{ avgLength, avgWinLength, avgLossLength, shortGamePct }`
- Filter by games where target played

**Acceptance**: Pure functions with correct counting. Handle both Lichess and Chess.com PGN formats.

### Task 2.2: Display in Prep Report

**Files**: `src/openings/view.ts`

Add two sections to the Prep Report tool:
1. **Termination Profile** — stat cards: resign %, timeout %, checkmate %
2. **Game Length** — avg win length vs loss length

Flag rate gets highlight when > 15% (actionable for blitz prep). All stats show `(n=X)`.

**Acceptance**: Sections appear in Prep Report. Flag rate highlighted for blitz collections.

**Dependencies**: 2.1 → 2.2.

---

## Phase 3 — Deviation Point Detection

### Task 3.1: Deviation detection engine

**Files**: new `src/openings/deviation.ts`

Walk the opponent's tree, compare each node's top move against the Lichess explorer's top move for that FEN. Divergences = deviation points.

```typescript
interface DeviationPoint {
  path: string[];           // UCI moves from root
  sans: string[];           // SAN for display
  fen: string;
  opponentMove: string;     // SAN opponent plays
  theoryMove: string;       // SAN explorer's top move
  opponentFrequency: number;
  gamesAtNode: number;
  depth: number;
}
```

**Implementation**:
1. BFS walk of tree, depth ≤ 12, nodes with ≥ 3 games only
2. For each node FEN, query `explorerCtrl` (reuse existing singleton with per-FEN cache)
3. Rate limit: 250ms between queries, max 50 per scan
4. Cache results per collection+filter combo in module-level Map
5. Async with progressive results — call `redraw()` as each result arrives
6. Expose: `scanDeviations(tree, explorerCtrl, redraw): Promise<DeviationPoint[]>`

**Acceptance**: Deviation points correctly identified. Rate limiting prevents API abuse. Cache works across tree navigation.

### Task 3.2: Deviation markers in tree view

**Files**: `src/openings/view.ts`

1. In `renderMoveRow`: if deviation exists at this node, show indicator icon + tooltip showing theory move
2. Add "Theory Deviations" summary panel below played lines (top 5 deviations)

**Acceptance**: Deviation points visually marked. Summary panel shows top deviations.

### Task 3.3: Deviation scanning UX

**Files**: `src/openings/ctrl.ts`, `src/openings/view.ts`

Add controller state:
- `_deviationResults: DeviationPoint[]`, `_deviationLoading: boolean`, `_deviationProgress: number`
- "Scan for deviations" button (manual trigger, not automatic)
- Progress indicator while scanning

**Acceptance**: User manually triggers scan. Progress shown. Results persist within session.

**Dependencies**: 3.1 → 3.2 → 3.3. Requires working explorerCtrl (already exists).

---

## Phase 4 — Opening Recommendations from Weakness Data

### Task 4.1: Recommendation engine

**Files**: `src/openings/analytics.ts`

New function `computeOpeningRecommendations(weakness, lines, totalGames)`:
- Convert `WeaknessModule` weak lines (opponentWinPct < 0.30) into actionable cards
- Include move sequences, opponent score, game count, confidence level
- Output: `OpeningRecommendation[]` with `reason`, `confidence`, `actionLabel`

**Acceptance**: Recommendations generated when weak lines exist. Confidence based on sample size.

### Task 4.2: Recommendation cards in Prep Report

**Files**: `src/openings/view.ts`

"Recommended Preparation" section in Prep Report. Clickable cards navigate to the line in Repertoire.

**Acceptance**: Cards appear when weakness data exists. Click navigates to line.

**Dependencies**: 4.1 → 4.2. Uses existing `WeaknessModule` from `analytics.ts`.

---

## Phase 5 — Traps They Fall For

### Task 5.1: Repeated loss pattern detection

**Files**: new `src/openings/traps.ts`

Detect positions where opponent repeatedly loses after a specific move:

```typescript
interface TrapPattern {
  path: string[];
  sans: string[];
  fen: string;
  opponentMove: string;     // The move they keep playing
  losses: number;
  totalAtNode: number;
  avgLossLength: number;     // How quickly they lose after this
  isSignificant: boolean;    // losses >= 3 AND loss rate > 60%
}
```

DFS walk (depth 10), check each node for high loss rate with minimum 3 losses. Cross-reference game length — losses within 10 moves of deviation are more "trap-like". Sort by `losses * lossRate`. Purely tree-internal analysis (no explorer needed).

**Acceptance**: Patterns with 3+ losses at same node detected. Empty array for sparse collections.

### Task 5.2: Vulnerable positions in Prep Report

**Files**: `src/openings/view.ts`

"Vulnerable Positions" section showing trap patterns. Each entry: move sequence, loss count, navigate button. Hidden when no patterns meet threshold.

**Acceptance**: Section appears when patterns detected. Click navigates to position.

**Dependencies**: 5.1 → 5.2. Independent of Phases 3-4.

---

## Phase 6 — Sample Size Warnings Everywhere

### Task 6.1: Global sample size pass

**Files**: `src/openings/view.ts`, `src/openings/analytics.ts`

Cross-cutting quality sweep:
1. Add `(n=X)` to ALL percentage stats — search all `toFixed(0)` + `'%'` patterns
2. Global warning badge on collection cards when < 20 games
3. Persistent banner in Prep Report header when `isSampleSmall`
4. Visual de-emphasis of unreliable stats (frequency < 5 games)

**Acceptance**: Every percentage has visible sample size. Small collections warned. Unreliable stats dimmed.

**Dependencies**: None. Can run anytime.

---

## Phase 7 — Recency-Weighted Default

### Task 7.1: Recency toggle with smart default

**Files**: `src/openings/ctrl.ts`, `src/openings/view.ts`

1. Add `_recencyMode: 'recent' | 'all-time'` state (default: `'recent'`)
2. Prep Report uses `computeLikelyLineModule` (already recency-weighted) as default sort
3. Toggle button: "Recent first" / "All time" in Prep Report header
4. Auto-fallback: if `recencyBuckets.last90 < 10`, switch to all-time with notice

**Acceptance**: Recency-weighted is default. Toggle works. Auto-fallback for sparse recent data.

**Dependencies**: None.

---

## Phase 8 — Save Variation for Opening Repetition Practice (Data Model Only)

### Task 8.1: ORP variation data model

**Files**: `src/openings/types.ts`, `src/openings/db.ts`

```typescript
interface SavedVariation {
  id: string;
  collectionId: string;
  moves: string[];          // UCI
  sans: string[];           // SAN for display
  trainAs: 'white' | 'black';
  label?: string;
  createdAt: number;
  stats?: { attempts: number; correct: number; lastAttempt: number; };
}
```

Add IDB store `'training-variations'` to `patzer-openings` (bump to version 3). Add `saveVariation()`, `loadVariations()`, `deleteVariation()` functions.

### Task 8.2: "Save to training" button

**Files**: `src/openings/view.ts`

Add button in:
1. Repertoire tool's move list (when line ≥ 3 moves)
2. Prep Report's Likely Lines and Target Lines rows

Saves current path as `SavedVariation`. Brief "Saved!" confirmation. **No ORP drill UI** — awaits separate Opening Repetition Practice research.

**Acceptance**: User can save lines. Persists in IDB. No trainer logic.

**Dependencies**: 8.1 → 8.2.

---

## Phase 9 — Research Tasks (No Code)

### Task 9.1: Low-depth engine analysis feasibility (OPUS-SPECIFIC RESEARCH TASK)

Written deliverable answering:
1. Can Stockfish depth 8-10 process 1000 games in < 60 seconds via existing WASM worker?
2. What data is useful? (blunder detection, phase accuracy, time-pressure correlation)
3. Integration: batch trigger from collection card, results in IDB alongside collection
4. UI sketch: "Analyze collection" button, progress bar, accuracy badges
5. Does this cross the architecture boundary of research vs analysis persistence?

### Task 9.2: Clock data extraction feasibility (RESEARCH)

Written deliverable:
1. Lichess `%clk` extraction from stored PGN — regex feasibility
2. Chess.com clock format differences
3. Analytics unlocked: time pressure, flagging tendencies, move speed in/out of book
4. Storage approach: extend ResearchGame vs extract on-demand

---

## Dependency Graph

```
Phase 0 (Rename) ────────────── do first, standalone
    │
    ├── Phase 1 (Sparkline) ─── parallel with Phase 0
    ├── Phase 6 (Sample Size) ── parallel with anything
    └── Phase 7 (Recency) ────── parallel with anything

Phase 2 (Termination + Length)
    2.1 (extraction) → 2.2 (view)

Phase 3 (Deviation Detection)
    3.1 (engine) → 3.2 (markers) → 3.3 (UX)

Phase 4 (Recommendations)
    4.1 (engine) → 4.2 (cards)

Phase 5 (Traps)
    5.1 (detection) → 5.2 (view)

Phase 8 (Save Variation)
    8.1 (model) → 8.2 (button)

Phase 9 (Research) ────────── anytime, no code
```

**Parallelizable**: Phases 0, 1, 6, 7 can all start simultaneously. Phases 2-5 can start once Phase 0 lands. Phase 8 and 9 are independent.

---

## Files Summary

| Phase | New Files | Modified Files |
|-------|-----------|----------------|
| 0 | 0 | router.ts, header/index.ts, main.ts, openings/view.ts |
| 1 | 0 | openings/view.ts |
| 2 | 0 | openings/analytics.ts, openings/view.ts |
| 3 | 1 (deviation.ts) | openings/ctrl.ts, openings/view.ts |
| 4 | 0 | openings/analytics.ts, openings/view.ts |
| 5 | 1 (traps.ts) | openings/view.ts |
| 6 | 0 | openings/view.ts, openings/analytics.ts |
| 7 | 0 | openings/ctrl.ts, openings/view.ts |
| 8 | 0 | openings/types.ts, openings/db.ts, openings/view.ts |
| 9 | 0 | docs only |

**Total new files**: 2 (deviation.ts, traps.ts). All tasks within 1-3 file limit.

---

## What This Sprint Does NOT Do

- Does not build the Style dashboard (remains in CCP-323 Phase 6)
- Does not build Practice Against Them (remains in CCP-323 Phase 7)
- Does not implement Opening Repetition Practice (ORP) drill flow — only the data model for saved variations
- Does not implement engine analysis of research games — only the feasibility study
- Does not build composite scores, archetypes, psychological profiling, or auto-generated game plans
- Does not rename CSS classes or file paths (internal-only, no user impact)

---

## Minimum Sample Size Rules (enforced across all views)

| Context | Minimum | Behavior below minimum |
|---|---|---|
| Show any percentage stat | — | Always show `(n=X)` label |
| Flag as reliable line | 5 games in that line | Dim unreliable stats |
| Show weakness recommendation | 5 games in weak line | Recommendation hidden |
| Show trap pattern | 3 losses at same node | Pattern hidden |
| Show collection warning | 20 games total | Warning badge on card |
| Show deviation point | 3 games at node | Node skipped in scan |
| Show termination profile | 10 games with termination data | Section hidden |

---

## Risk Notes

1. **Deviation detection rate limiting**: Lichess explorer API has rate limits. The 250ms debounce + 50 query cap should be safe, but monitor for 429 responses.

2. **Termination header inconsistency**: Chess.com PGN format varies by era and game type. The regex parser needs to handle missing/unknown termination gracefully.

3. **Trap detection false positives**: A "trap" is only meaningful if it's a pattern, not a single game. The 3-loss minimum helps, but very aggressive players may trigger false patterns in sharp openings where both sides have losing chances.

4. **View.ts file size**: `openings/view.ts` is already 1880+ lines. If it grows past ~2500 lines, consider extracting tool-specific render functions into separate files (e.g., `prepReportView.ts`).

5. **ECO code platform inconsistency**: Lichess and Chess.com assign slightly different ECO codes and opening names to the same positions. Opening recommendations should use move sequences as the primary key, not ECO codes alone.
