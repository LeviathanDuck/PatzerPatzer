# Mini Sprint — Opponent Research Completion

Supersedes: SPR-006, SPR-008, SPR-009

Consolidates unfinished work from three overlapping opponent research sprints into a single
completion sprint. Foundation work (SPR-007) is already done. This sprint finishes the
remaining feature gaps and practice system.

## Context

The Opponents page (formerly Openings) has a working foundation: import workflow, tree
aggregation, board navigation, played-lines visualization, tool rail with 4 tools
(Repertoire, Prep Report, Style, Practice), shared analytics, deviation detection engine,
and trap detection. What remains is presentation/integration gaps and practice completion.

Key user decisions for this sprint:
- Sparklines on collection cards: **deferred** (not included)
- Recency threshold must be much higher than 90 games
- "Save to training" targets the Study Library, not a standalone ORP system
- Recommendation engine must use ECO codes and classified opening names, not raw move sequences

## Phase 1 — Research and Planning

### Task 1 — Grounding and implementation map

Produce a design doc that maps existing opponent research code (`src/openings/`) against the
remaining work in this sprint. Identify which files own each feature, what's stubbed vs
missing, and the safe implementation order.

**Files**: design doc only (no code)
**Acceptance**: Design doc exists, references current file structure, identifies gaps per task.

## Phase 2 — Import and Data Integrity

### Task 2 — PGN file upload

Add real file input to the openings import workflow. Currently paste-only (textarea in
`view.ts`). Add a file input element that accepts `.pgn` files via browse or drag-and-drop.
Parse the file contents and feed them into the existing PGN import pipeline.

**Files**: `src/openings/view.ts` (1 file)
**Acceptance**: Users can import PGN via file upload or paste. Both paths produce the same result.

### Task 3 — Global sample size warnings

Every percentage and statistic in the Prep Report must show its sample size. Small
collections (< N games) get an explicit warning. Unreliable stats (small denominators)
are visually dimmed. This is a data honesty pass across all Prep Report surfaces.

**Files**: `src/openings/view.ts`, `src/openings/analytics.ts` (2 files)
**Acceptance**: Every percentage has visible sample size. Small collections warned. Unreliable stats dimmed.

## Phase 3 — Prep Report Core Features

### Task 4 — Termination and game length profile

Extract termination type (resignation, timeout, checkmate, etc.) and game length distribution
from PGN metadata. Render this data in the Prep Report as a visual profile — how the
opponent's games typically end and how long they last.

**Files**: `src/openings/analytics.ts`, `src/openings/view.ts` (2 files)
**Acceptance**: Prep Report shows termination breakdown and game length distribution with correct data.

### Task 5 — Deviation markers in tree view

The deviation detection engine (already done) finds where the opponent diverges from theory.
This task renders those results in the move tree: indicator icons on deviation nodes with
tooltips showing the theory move, plus a "Theory Deviations" summary panel below played lines
showing the top 5 deviations.

**Files**: `src/openings/view.ts` (1 file)
**Acceptance**: Deviation points visually marked in tree. Summary panel shows top deviations.

### Task 6 — Vulnerable positions in Prep Report

Display the trap/repeated-loss patterns that the detection engine already finds. Show
positions where the opponent repeatedly wins — position description with ECO/opening name
context, loss count, loss rate, and a clickable link to navigate to that position in the tree.

**Files**: `src/openings/view.ts` (1 file)
**Acceptance**: Vulnerable positions panel shows in Prep Report with navigable links.

## Phase 4 — Prep Report Intelligence

### Task 7 — Recommendation engine with opening names

Build on the existing weakness detection in `analytics.ts` to generate actionable study
recommendations. Each recommendation must reference the opponent's weak lines by their
ECO code and classified opening name (e.g., "B12 Caro-Kann: Advance Variation"), not raw
move sequences. Confidence rating based on sample size.

**Files**: `src/openings/analytics.ts` (1 file)
**Acceptance**: Recommendations generated when weak lines exist. Uses ECO/opening names. Confidence based on sample size.

### Task 8 — Recommendation cards in Prep Report

Render the recommendations from Task 7 as cards in the Prep Report surface. Each card shows
the opening name, the specific weakness, suggested action, confidence level, and sample size.
Cards are navigable — clicking jumps to the relevant position in the tree.

**Files**: `src/openings/view.ts` (1 file)
**Acceptance**: Recommendation cards render in Prep Report. Clickable. Show opening names and confidence.

### Task 9 — Recency toggle

Add a `recencyMode: 'recent' | 'all-time'` toggle to the Prep Report. Default to recent
when enough recent games exist. Auto-fallback to all-time with a notice when the recent
sample is too small. The threshold for "enough recent games" must be substantially higher
than 90 — calibrate based on the actual game counts in typical imported collections.

**Files**: `src/openings/ctrl.ts`, `src/openings/view.ts` (2 files)
**Acceptance**: Toggle visible. Default is smart. Fallback notice shows when sample is sparse.

## Phase 5 — Practice Completion

### Task 10 — Practice line drilling UI

Add UI to load and drill specific saved lines in practice mode. The `SavedVariation` type
already exists. This task adds the ability to select a line from the Study Library and
practice it — the opponent plays the saved moves, the user responds.

**Files**: `src/openings/view.ts`, `src/openings/ctrl.ts` (2 files)
**Acceptance**: User can select a saved line and drill it. Opponent plays the line moves.

### Task 11 — Practice stats persistence

Persist practice session outcomes to IndexedDB: attempts, correct responses, accuracy per
line, last attempt timestamp. The `SavedVariation` type already has `stats` fields — this
task wires them up so data actually gets written and read.

**Files**: `src/openings/ctrl.ts`, `src/openings/db.ts` (2 files)
**Acceptance**: Practice stats persist across sessions. Accuracy and attempt counts visible.

### Task 12 — Practice session resume

Persist practice session state to IndexedDB so that refreshing the page or navigating away
and back resumes the session where it left off. Store current position, move history, and
session config.

**Files**: `src/openings/ctrl.ts`, `src/openings/db.ts` (2 files)
**Acceptance**: Closing and reopening the page resumes the practice session.

## Phase 6 — Study Library Integration

### Task 13 — SavedVariation data model for Study Library

Adapt the `SavedVariation` type to target the Study Library persistence layer instead of a
standalone ORP system. Ensure the data model is compatible with the Study page's existing
types and IDB stores. The Study Library is the canonical home for saved lines.

**Files**: `src/openings/types.ts`, `src/study/` types (2 files)
**Acceptance**: SavedVariation integrates with Study Library data model. No standalone ORP store.

### Task 14 — "Save to training" button

Add a "Save to training" button that saves the current board position/line as a
SavedVariation in the Study Library. Brief confirmation toast on save. Button appears in
the Prep Report and tree view contexts where a saveable position is selected.

**Files**: `src/openings/view.ts`, `src/openings/ctrl.ts` (2 files)
**Acceptance**: Button visible in context. Saves to Study Library. Confirmation shown.

## Dependency order

```
Phase 1 (Research)
  |
  v
Phase 2 (Import + Data Integrity)
  |
  v
Phase 3 (Prep Report Core) -----> Phase 4 (Prep Report Intelligence)
                                        |
                                        v
                                   Phase 5 (Practice)
                                        |
                                        v
                                   Phase 6 (Study Library)
```

Phase 3 and Phase 4 can overlap once Phase 2 lands.
Phase 5 depends on Phase 4 (recommendations inform what to practice).
Phase 6 depends on Phase 5 (drilling needs to work before save-to-library wiring).

## File impact summary

| File | Tasks |
|------|-------|
| `src/openings/view.ts` | Tasks 2, 3, 4, 5, 6, 8, 9, 10, 14 |
| `src/openings/analytics.ts` | Tasks 3, 4, 7 |
| `src/openings/ctrl.ts` | Tasks 9, 10, 11, 12, 14 |
| `src/openings/db.ts` | Tasks 11, 12 |
| `src/openings/types.ts` | Task 13 |
| `src/study/` types | Task 13 |

## Out of scope

- Sparklines on collection cards (deferred)
- ORP drill UI beyond basic line drilling (future sprint)
- Explorer API integration (existing explorer stays as-is)
- Mobile-specific practice layout (future sprint)
