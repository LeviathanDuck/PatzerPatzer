# Study Library + Repetition Practice — Planning Document

Date: 2026-03-30
Status: Planning (not yet started)

---

## Executive Summary

The Study Library is a user-managed collection of saved games, positions, and annotated
move sequences that becomes the connective tissue between all existing Patzer Pro tools.
Repetition Practice is a content-agnostic training engine that works on any material
saved in the library, using position-aware spaced-repetition scheduling.

This document defines the feature scope, architecture, integration points, IDB schema,
module structure, phasing, and open questions.

---

## Relationship to Existing Roadmap

### Where this fits

The Study Library sits between the current Puzzle V1 product and the planned ORP
(Opening Repetition Practice) feature. It provides the **universal save target** and
**shared drill engine** that both systems — and future features — can build on.

| Current state | Study Library role |
|---|---|
| Analysis board → review → puzzle candidates | Library becomes the canonical save target for reviewed moments |
| Puzzle V1 user-library definitions | Future: puzzle saves can optionally also create library entries |
| Openings research → "Save line for practice" | Library entry + practice line in one action |
| User-uploaded opening repertoire PGNs | Library becomes the canonical home for labeled opening-repertoire study items |
| ORP (planned, not started) | ORP becomes a specialized view over library items with opening-sourced practice lines |
| Stats dashboard (data ready, views needed) | Future: practice statistics feed into the stats surface |

### Sequencing with current priorities

Per `docs/NEXT_STEPS.md`, the current highest-leverage work is:

1. Stats dashboard cards (data layer ready, UI needed)
2. Post-game summary panel
3. Opponent research completion
4. End-to-end sync validation

The Study Library is **not a prerequisite** for any of those items and should not
block them. It is a **new product track** that can be built incrementally alongside
those priorities once Phase 0 is approved.

### Relationship to ORP

`docs/NEXT_STEPS.md` item 6 describes ORP as "types defined, no practice interface."
The Study Library's Repetition Practice engine is the **general-purpose version** of
what ORP needs. Once the drill engine exists:

- ORP becomes a specialized entry point: "practice openings from your research"
- The drill engine, scheduler, and grader are shared infrastructure
- ORP-specific behavior (opening tree integration, opponent-aware line selection)
  layers on top

This means ORP implementation should wait for or build on top of the Study Library
drill engine rather than creating a parallel system.

### Additional repertoire role

The Study Library should also support user-uploaded opening repertoire as a first-class content type.
That means:

- users can upload or paste PGNs of the opening lines they prefer to play
- those imports become explicitly labeled opening-repertoire study items, not just generic PGNs
- that repertoire data should later be reusable outside the Study Library itself

Important distinction:
- this is not only a future repetition-practice input
- it is also the source of truth for user-owned repertoire that other surfaces can reference

---

## Feature Specification

### Study Library

#### How content enters the library

| Entry point | Interaction | What is saved |
|---|---|---|
| Move list context menu (any page) | Right-click → "Save to Library" | Full game PGN + metadata + path to clicked position |
| Board settings/gear menu | "Save this game to Library" | Full game PGN + metadata, path = current position |
| Openings research | "Save line for practice" | PGN of the line + practice line auto-created |
| Game analysis (post-review) | "Save to Library" | Full game PGN + analysis metadata |
| PGN upload | Paste or file upload in library | One or more study items from PGN |
| Repertoire upload | Paste or file upload PGNs of preferred opening lines | One or more labeled opening-repertoire study items |
| Manual entry | Create from empty board | New study, user builds the tree |
| Puzzle session (future) | "Save position" | Study from puzzle FEN + solution line |

**Critical UX rule:** The primary save action (right-click → "Save to Library") must be
**one click with zero friction**. No modal, no form, no confirmation dialog. Title is
auto-generated. Organization happens later in the library browser.

#### What a study item contains

```typescript
interface StudyRecord {
  id: string;                          // UUID
  title: string;                       // user-editable, auto-generated on save
  pgn: string;                         // full PGN preserving headers, variations, comments, NAGs
  sourceTool: StudySourceTool;         // which tool/page it came from
  sourceGameId: string | null;         // if saved from an imported game
  sourcePath: TreePath | null;         // path to the position that triggered the save

  // PGN-derived metadata (extracted on save, updated on PGN edit)
  white: string | null;
  black: string | null;
  result: string | null;
  eco: string | null;
  opening: string | null;

  // User organization
  tags: string[];                      // user-defined tags
  folders: string[];                   // folder memberships
  favorite: boolean;

  // Annotations
  notes: string | null;                // game-level free-text notes

  // Timestamps
  createdAt: number;
  updatedAt: number;
  lastPracticedAt: number | null;
}

type StudySourceTool =
  | 'analysis'
  | 'openings'
  | 'puzzles'
  | 'import'
  | 'manual';
```

Per-position annotations (text notes + drawn arrows/highlights) are stored within the
PGN itself using Lichess-compatible comment encoding (`{ [%cal ...] [%csl ...] }`).
This avoids a separate annotation store and keeps the PGN as the single source of truth
for the move tree.

#### Library browser (`#/library`)

- Top-level route, visible in main navigation
- List view: title, source icon, date, tags, favorite star
- Sort by: date created, title, last practiced
- Filter by: folder, tag, source tool, favorite
- Click opens study detail view
- Bulk actions: delete, move to folder, tag

#### Study detail view (`#/library/:id`)

- Chessground board with the saved game's move tree
- Move list with full navigation (reuse existing `moveList.ts` rendering)
- Notes panel for game-level notes
- Edit title, tags, folders inline
- "Practice this line" action → enters repetition practice mode
- Position selector: user chooses where practice begins
- Variation selector: user chooses which lines to practice

### Repetition Practice

#### Core loop

1. User selects a study item and marks a move path as a **practice line** with a
   **training color** (which side they play)
2. System presents positions sequentially on the board
3. At each position where it's the user's turn, the board is interactive
4. User plays a move; system grades by comparing against the stored line (exact match)
5. **Correct:** brief feedback, auto-play opponent's response, advance
6. **Incorrect:** "Try again" (up to 3 attempts) → then show the correct move
7. Each position's mastery is tracked independently (confidence level 0–6)
8. Positions scheduled for review at growing intervals

#### Scheduling

| Confidence | Interval |
|---|---|
| 0 | New (not yet seen) |
| 1 | 1 day |
| 2 | 3 days |
| 3 | 1 week |
| 4 | 2 weeks |
| 5 | 1 month |
| 6 | 3 months |

- Incorrect answer drops confidence by 2 (minimum 1)
- Correct answer increments confidence by 1 (maximum 6)
- `dueAt` = timestamp of last review + interval for current confidence

#### Practice line selection

- Default: mainline of the study is the practice line
- User can select a specific variation to practice
- User can choose a starting position ("Practice from here")
- One study can have multiple practice lines (mainline + key variations)

```typescript
interface PracticeLine {
  id: string;                          // UUID
  studyId: string;                     // parent study
  label: string;                       // auto-generated or user-edited
  startPath: TreePath;                 // where practice begins
  endPath: TreePath | null;            // where practice ends (null = end of line)
  trainAs: 'white' | 'black';         // which side the user plays
  createdAt: number;
}
```

#### Position scheduling record

```typescript
interface PositionSchedule {
  fen: string;                         // position identity (primary key)
  practiceLineId: string;             // which line first introduced this position
  confidence: number;                  // 0–6
  dueAt: number | null;               // null = never practiced, ready for first review
  lastReviewedAt: number | null;
  totalReviews: number;
  totalCorrect: number;
  createdAt: number;
}
```

**Position-aware scheduling:**

- Scheduling is by position (FEN), not by individual move-in-line
- If the same position appears in multiple lines (shared opening prefixes,
  transpositions), it is scheduled once
- During whole-line practice, non-due positions are played for context ("warmup")
  but don't affect scheduling — unless the user gets them wrong

#### Session assembly

1. Gather all positions where `dueAt <= now` or `dueAt IS NULL` (new positions)
2. Group by practice line
3. Sort by most overdue first
4. Present sequentially within each line
5. At session end: show summary (positions reviewed, accuracy, confidence changes)

#### Practice dashboard

- "X positions due for review" count
- "Start Practice" button (launches session with all due positions)
- Per-study breakdown of due counts
- No gamification. No points, XP, streaks, ranks, or leaderboards.

---

## Reusable Primitives

### From existing codebase

| Primitive | Location | Reuse for |
|---|---|---|
| Context menu handlers | `src/analyse/moveList.ts` (`buildContextHandlers`) | "Save to Library" right-click on move list |
| Move list rendering | `src/analyse/moveList.ts` | Study detail view move list |
| Chessground board lifecycle | `src/board/index.ts` | Study board + practice board |
| Tree types + ops | `src/tree/types.ts`, `src/tree/ops.ts` | Study tree navigation, practice line extraction |
| PGN ↔ tree conversion | `src/tree/pgn.ts` | Study PGN import/export |
| RetroCtrl session pattern | `src/analyse/retroCtrl.ts` | Drill controller session model |
| PuzzleUserMeta model | `src/puzzles/types.ts` | Inspiration for PositionSchedule (folders, tags, favorite, dueAt) |
| Puzzle round controller | `src/puzzles/ctrl.ts` | Inspiration for drill controller (move matching, feedback states) |
| UCI move matching | `src/puzzles/ctrl.ts` (`uciMatches`, `altCastles`) | Drill grader move comparison |
| IDB patterns | `src/idb/index.ts`, `src/puzzles/puzzleDb.ts` | Study library persistence |
| Router patterns | `src/router.ts` | New library/study routes |
| Header nav integration | `src/header/index.ts` | "Library" nav item |

### From Lichess source

| Pattern | Lichess path | Adaptation |
|---|---|---|
| Study controller | `ui/analyse/src/study/` | Study detail page controller |
| Study form | `ui/analyse/src/study/studyForm.ts` | Study metadata editing |
| Practice mode | `ui/analyse/src/study/practice/` | Drill engine reference |

---

## New Modules

### Module structure

```text
src/
  library/
    types.ts          — StudyRecord, PracticeLine, PositionSchedule, session types
    ctrl.ts           — library page controller (list, filter, sort, CRUD)
    view.ts           — library browser + study detail rendering
    db.ts             — Study Library IndexedDB (separate DB: patzer-study-v1)
    drill/
      ctrl.ts         — drill session controller (position presentation, grading, feedback)
      scheduler.ts    — spaced-repetition scheduling logic (pure functions)
      view.ts         — drill board, feedback panel, session summary
```

This follows the established Lichess-inspired pattern:
- `ctrl.ts` + `view.ts` per surface
- `types.ts` for shared types
- `db.ts` for persistence (same pattern as `src/puzzles/puzzleDb.ts`)
- `drill/` subdirectory for the practice subsystem (keeps library browsing separate from practice)

### Route additions

```typescript
// In src/router.ts
{ pattern: ['library', ':id', 'practice'], name: 'study-practice' },
{ pattern: ['library', ':id'], name: 'study-detail' },
{ pattern: ['library'], name: 'library' },
```

### Header integration

Add "Library" to the main navigation in `src/header/index.ts`, positioned after
"Puzzles" in the nav order.

---

## IDB Schema

### New database: `patzer-study-v1`

Follows the established pattern of separate databases per product surface
(`patzer-pro` for games/analysis, `patzer-puzzle-v1` for puzzles).

```
Database: patzer-study-v1
Version: 1

Store: studies
  Key: id (keyPath)
  Record: StudyRecord
  Indexes:
    createdAt       — chronological ordering
    updatedAt       — recently modified
    lastPracticedAt — practice recency sort
    sourceTool      — filter by origin
    favorite        — quick favorite filter

Store: practice-lines
  Key: id (keyPath)
  Record: PracticeLine
  Indexes:
    studyId         — all lines for a study

Store: position-schedules
  Key: fen (keyPath)
  Record: PositionSchedule
  Indexes:
    dueAt           — due position queries (most critical index)
    practiceLineId  — positions in a specific line
    confidence      — filter by mastery level

Store: practice-sessions
  Key: id (keyPath, auto-generated)
  Record: PracticeSession {
    id: string,
    startedAt: number,
    completedAt: number | null,
    positionsReviewed: number,
    positionsCorrect: number,
    studyIds: string[],       // which studies were covered
  }
  Indexes:
    completedAt     — session history ordering
```

### Size estimates

| Component | Per study | 1,000 studies |
|---|---|---|
| StudyRecord (with PGN) | ~5 KB | ~5 MB |
| PracticeLines (avg 3/study) | ~300 B each | ~900 KB |
| PositionSchedules (avg 30/study) | ~200 B each | ~6 MB |
| PracticeSessions | ~200 B each | negligible |
| **Total** | | **~12 MB** |

Well within IDB quotas even at scale.

### Migration path

No migration needed for existing databases. The study library is a new database
(`patzer-study-v1`) that does not touch `patzer-pro` or `patzer-puzzle-v1`.

---

## Architectural Decisions

### AD-1: Separate IDB database

**Decision:** Study Library gets its own IndexedDB database (`patzer-study-v1`).

**Rationale:** Follows the precedent set by `patzer-puzzle-v1`. Avoids version-bump
cascades on the main `patzer-pro` database. Allows independent schema evolution.
Study data lifecycle (user-curated, long-lived) differs from game import data
(bulk-imported, disposable).

### AD-2: FEN-keyed position scheduling

**Decision:** Position scheduling uses FEN as the primary key, not path-in-line.

**Rationale:** Transpositions are common in chess openings. The same position reached
via different move orders should only be drilled once. FEN is the natural identity
for "this board state." This matches how Lichess study practice handles shared
positions across chapters.

**Trade-off:** FEN strings are long keys (~70 chars). Acceptable given the expected
store size (<30k records even for heavy users).

### AD-3: PGN as single source of truth for annotations

**Decision:** Per-position annotations (comments, arrows, highlights) are stored
within the PGN string using standard PGN comment syntax, not in a separate store.

**Rationale:** PGN already supports comments (`{ text }`) and Lichess-compatible
shape encoding (`{ [%cal Ge2e4] [%csl Rf3] }`). Keeping annotations in the PGN
means the study is fully portable — export the PGN and all annotations travel with it.
No annotation orphaning if the tree structure changes.

### AD-4: Drill controller follows RetroCtrl session pattern

**Decision:** The drill controller is a self-contained session object with optional
callbacks, following the `makeRetroCtrl()` pattern from `src/analyse/retroCtrl.ts`.

**Rationale:** RetroCtrl proved this pattern works well in the codebase. It:
- Encapsulates session state cleanly
- Uses persistence callbacks (`onPersist`) instead of reaching into external state
- Is testable in isolation
- Integrates with the board via explicit method calls, not implicit coupling

### AD-5: Move matching reuses puzzle infrastructure

**Decision:** The drill grader uses the same `uciMatches()` function and `altCastles`
mapping from `src/puzzles/ctrl.ts`.

**Rationale:** Castle move normalization is a solved problem in the puzzle round
controller. Extracting it into a shared utility (or importing directly) avoids
re-solving the same edge cases.

### AD-6: No gamification

**Decision:** No points, XP, streaks, ranks, or leaderboards in the practice system.

**Rationale:** The feature's value is the drill loop itself. Gamification adds
complexity, creates perverse incentives (optimizing for streaks rather than learning),
and is not part of the Lichess study practice model.

---

## Integration Points (File Touch Map)

### Phase 0 integration (existing files touched)

| File | Change |
|---|---|
| `src/router.ts` | Add `library`, `study-detail`, `study-practice` routes |
| `src/header/index.ts` | Add "Library" nav item |
| `src/main.ts` | Wire library route dispatch + startup |
| `src/analyse/moveList.ts` | Add "Save to Library" to context menu callback |

### Phase 1 integration

| File | Change |
|---|---|
| `src/board/index.ts` | Reuse board lifecycle for practice board |
| `src/analyse/retroCtrl.ts` | Reference only (pattern, not modified) |

### Future integration

| File | Change |
|---|---|
| `src/openings/ctrl.ts` | "Save line for practice" action |
| `src/puzzles/ctrl.ts` | "Save position" action |
| `src/analyse/evalView.ts` | "Save to Library" after review |
| `src/header/index.ts` | "Save game to Library" in board settings menu |

---

## Build Phases

### Phase 0: Study Library Foundation

**Goal:** Users can save content and browse their library.

**New files:**
- `src/library/types.ts`
- `src/library/db.ts`
- `src/library/ctrl.ts`
- `src/library/view.ts`

**Modified files:**
- `src/router.ts` (new routes)
- `src/header/index.ts` (nav item)
- `src/main.ts` (route dispatch)
- `src/analyse/moveList.ts` (context menu save action)

**Deliverables:**
- `StudyRecord` type and IDB store
- Save-to-library action from move list context menu (one-click, no modal)
- Library browser at `#/library` with list, sort, filter
- Study detail view at `#/library/:id` with board + move list
- Edit title, tags, folders
- Favorite toggle
- Delete study

**Not included:** practice lines, drill engine, scheduling.

### Phase 1: Drill Engine

**Goal:** Users can mark practice lines and drill them with spaced-repetition scheduling.

**New files:**
- `src/library/drill/ctrl.ts`
- `src/library/drill/scheduler.ts`
- `src/library/drill/view.ts`

**Modified files:**
- `src/library/types.ts` (add PracticeLine, PositionSchedule types)
- `src/library/db.ts` (add practice-lines, position-schedules, practice-sessions stores)
- `src/library/ctrl.ts` (practice line CRUD, due count queries)
- `src/library/view.ts` (practice line management UI, due count display)
- `src/main.ts` (wire practice route)

**Deliverables:**
- Practice line creation from study detail view
- Training color selection (play as white/black)
- Starting position selection ("Practice from here")
- Drill session controller with:
  - Sequential position presentation
  - Move grading (exact match against stored line)
  - 3-attempt retry on incorrect
  - Opponent auto-play
  - Visual feedback (correct/incorrect)
- Spaced-repetition scheduler (confidence 0–6, growing intervals)
- Position-aware scheduling (FEN-keyed, transposition-safe)
- Session summary at completion
- Practice dashboard with due counts and "Start Practice" button

### Phase 2: Enhanced Grading + Organization

**Goal:** Richer grading, annotation support, and organizational features.

**Deliverables:**
- Engine-evaluated alternative moves (not just exact match — flag moves that are
  positionally equivalent or better)
- Per-position text annotations in study detail view
- Folder management (create, rename, delete, drag-to-organize)
- PGN repertoire import (paste or upload a PGN file → create multiple study items)
- Labeled opening-repertoire import (uploaded repertoire PGNs are identifiable as preferred lines, not just generic study items)
- Difficulty detection (flag positions where users consistently fail)

### Phase 3: Advanced Features

**Goal:** Power-user features and cross-tool integration.

**Deliverables:**
- Position-mode practice (drill individual positions without line context)
- Custom schedule intervals (user-configurable)
- Practice statistics charts (accuracy over time, mastery progression)
- Keyboard shortcuts for drill navigation
- Cross-surface repertoire reference:
  - on the analysis board and other relevant pages, the book button should eventually be able to show:
    - masters games
    - Lichess games
    - the user's uploaded repertoire overlay
  - from an analysed game position, the user should be able to bring up repertoire information and see what the suggested repertoire move would have been
- Cross-tool auto-save integration:
  - Openings: "Save line for practice" creates study + practice line
  - Puzzles: "Save position" creates study from puzzle FEN
  - Analysis: post-review "Save to Library" action

---

## Risks and Open Questions

### Open Questions

1. **Sync scope:** Should study library data be included in the cloud sync system?
   The sync infrastructure exists but is not yet end-to-end validated. Study data
   is high-value (user-curated) and a strong candidate for sync, but this depends
   on sync stabilization completing first.

2. **Legacy candidate migration:** Should existing legacy saved puzzle candidates
   (`puzzle-library` store in `patzer-pro`) be migratable into study items? This
   could help consolidate the two save-target systems but adds migration complexity.

3. **PGN editing:** Should the study detail view support editing the PGN tree
   (adding moves, variations, deleting lines)? Lichess studies support full tree
   editing. Phase 0 could ship without it, but the architecture should not prevent it.

4. **Multi-study practice sessions:** Should users be able to practice across multiple
   studies in a single session (all due positions regardless of source)? The scheduler
   design supports this (FEN-keyed, study-agnostic), but the session assembly UX
   needs design.

5. **Board ownership:** The study detail view and practice view both need a Chessground
   board instance. The current board ownership model (`src/board/index.ts`) is
   "improved but not yet formalized." Study/practice board integration should follow
   the same shared-board pattern used by the puzzle product.

### Risks

1. **Context menu proliferation:** Adding "Save to Library" to the move list context
   menu means the context menu now serves multiple purposes (promote variation, delete
   node, save to library). Need to keep the menu focused and avoid option overload.

2. **PGN fidelity:** Auto-generating a study from a right-click save requires
   extracting the full PGN from the current game state, including all variations and
   analysis annotations. The existing `src/tree/pgn.ts` handles tree-to-PGN
   conversion, but edge cases (nested variations, clock data, eval comments) need
   verification.

3. **Practice line invalidation:** If a user edits a study's PGN after creating
   practice lines, the practice lines may reference paths that no longer exist.
   The drill controller needs graceful handling for stale paths.

4. **FEN collision:** While rare, different game states can produce identical FEN
   strings (same position reached with different castling rights already consumed,
   or repetition contexts). In practice this is unlikely to cause user-visible
   issues, but it's worth noting.

5. **Scope creep:** The Study Library touches many existing surfaces (move list,
   board settings, openings, puzzles, analysis). Phase 0 deliberately limits
   integration to the move list context menu only. Additional integration points
   should be added one at a time in later phases.

---

## Success Criteria

### Phase 0

- User can right-click a move in the analysis move list and save to library in one click
- Library browser at `#/library` shows saved items with sort/filter
- Study detail view renders the saved game with full move navigation
- User can edit title, tags, and folders
- Data persists across page reloads (IDB)

### Phase 1

- User can create a practice line from any study
- Drill session presents positions and grades moves
- Spaced-repetition scheduling tracks mastery per position
- Due positions are surfaced on the practice dashboard
- Transposition-safe: same position in multiple lines scheduled once

### Overall

- Saving content feels instant and frictionless
- Practice sessions feel responsive and useful
- The library becomes the natural place to organize chess study material
- No gamification — the value is in the drill loop
