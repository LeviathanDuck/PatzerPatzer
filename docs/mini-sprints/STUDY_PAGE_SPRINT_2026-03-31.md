# Study Page Sprint Plan

**Created:** 2026-03-31
**Status:** Planning
**Scope:** New top-level product surface — Study Library, Game Annotation, and Repetition Practice
**Estimated Phases:** 9
**Estimated Prompts:** 45–65

---

## Goal

Add a **Study** page to Patzer Pro — a new top-level route (`#/study`) that serves as the central hub for saving, organizing, annotating, and drilling chess material from any source.

The Study page combines three capabilities into one integrated surface:

1. **Study Library** — A user-managed collection of saved games, positions, and annotated move sequences. Content enters from anywhere in the app (right-click a move, save from the board, import PGN directly). Each item supports annotations, notes, tags, and folder organization.

2. **Game Annotation Workspace** — A full-featured study environment for annotating games with text comments, symbolic move assessments (NAGs), colored arrows and shapes, engine analysis, variations, and position bookmarks. Follows established open-source annotation patterns.

3. **Repetition Practice** — A training engine that drills move sequences extracted from study items using auto-graded board interaction and spaced-interval review scheduling.

## Why

Every other tool in Patzer Pro generates insights — analysis finds mistakes, puzzles extract tactical patterns, openings research maps opponent tendencies. But there is no place to **collect, organize, annotate, and train on** the material those tools produce. The Study page is the connective tissue that makes all other tools more valuable.

The strongest opportunity in the market is bridging annotation and practice. Existing tools let you annotate games OR drill positions, but none let you annotate a game, mark key positions, and then drill those positions with spaced repetition in one seamless workflow. This is the gap Patzer Pro fills.

## Current State Assessment

### What already exists that we can reuse

| Primitive | Location | What it provides |
|-----------|---------|-----------------|
| Chessground board | `src/board/index.ts` | Interactive board with move hooks, promotion, orientation, resize |
| Move hook system | `onBoardUserMove`, `onBeforeBoardUserMove` | Intercept user moves for grading or annotation |
| TreeNode structure | `src/tree/types.ts` | Full move tree with comments, glyphs, shapes, eval fields |
| PGN parsing | `src/tree/pgn.ts` | PGN → TreeNode with variations, NAGs, comments |
| Tree operations | `src/tree/ops.ts` | Path navigation, mainline extraction, node add/delete/promote |
| chessops | dependency | Move validation, FEN computation, SAN conversion |
| Context menu | `src/main.ts` lines 168–273 | Right-click on moves with desktop + touch support |
| IndexedDB pattern | `src/idb/index.ts` | Per-record stores with indexes, migration pattern |
| PuzzleUserMeta model | `src/puzzles/types.ts` | Folders, tags, notes, favorite, dueAt pattern |
| RetroCtrl pattern | `src/analyse/retroCtrl.ts` | Session state machine (feedback, outcomes, completion) |
| Move list rendering | `src/analyse/moveList.ts` | Inline mainline + variation tree with context handlers |
| Eval bar and graph | `src/analyse/evalView.ts` | Position evaluation visualization |
| Engine integration | `src/engine/ctrl.ts` | Live Stockfish analysis, eval cache, PV state |
| Board cosmetics | `src/board/cosmetics.ts` | Theme, zoom, piece sets, persisted settings |
| Analysis controls | `src/analyse/analysisControls.ts` | Move nav bar, control bar, hamburger menu |
| Games library | `src/games/view.ts` | Game list rendering with metadata, badges, filters |
| Router | `src/router.ts` | Hash-based routing, ready to extend |
| Snabbdom rendering | throughout | VNode-based UI pattern |
| SavedVariation type | `src/openings/types.ts` | UCI/SAN sequences with training color |
| Opening tree builder | `src/openings/tree.ts` | Frequency graph with transposition handling via normalized FEN |

### What does NOT exist yet

- Study Library persistence (IDB stores for studies, practice lines, position progress)
- Study Library browser UI (`#/study` route)
- Study detail/annotation workspace
- "Save to Library" action wired into the context menu and board
- Per-position user annotations (text notes on specific moves)
- NAG insertion UI (keyboard-driven glyph toolbar)
- Variation fold/expand in the move list
- Practice line extraction from study items
- Drill session controller (state machine for learn/review/quiz flow)
- Scheduling engine (interval calculation, due dates)
- Session builder (due queue assembly)
- Move grader (SAN comparison for auto-grading)
- Board adapter for drill mode (auto-play opponent, intercept user moves for grading)
- Practice dashboard (due count, session entry)
- Drill session UI (feedback strip, retry flow, session summary)
- PGN import directly to study library (repertoire upload)
- Position bookmarking within studies

---

## Architecture Strategy

### New subsystem: `src/study/`

The Study page is a new top-level subsystem following the established ctrl.ts + view.ts pattern. It does NOT live inside `src/openings/` — it is cross-product (content enters from openings, analysis, puzzles, and manual input).

```
src/study/
  ├── types.ts              — All Study domain types
  ├── studyDb.ts            — IDB CRUD for all study stores
  ├── studyCtrl.ts          — Library state management
  ├── saveAction.ts         — "Save to Library" capture logic
  ├── libraryView.ts        — Library browser (#/study)
  ├── studyDetailView.ts    — Study detail + annotation workspace (#/study/:id)
  ├── annotationCtrl.ts     — Annotation state (active glyph, comment editing)
  ├── annotationView.ts     — Annotation UI (glyph toolbar, comment panel)
  ├── moveListStudy.ts      — Study-mode move list (with fold/expand, annotation display)
  └── practice/
      ├── types.ts           — Drill-specific types
      ├── scheduler.ts       — Interval calculation (pure functions)
      ├── grader.ts          — Move comparison (pure function)
      ├── drillCtrl.ts       — Drill session state machine
      ├── sessionBuilder.ts  — Due queue assembly
      ├── boardAdapter.ts    — drillCtrl ↔ Chessground bridge
      └── drillView.ts       — Drill session UI
```

### IDB schema extension

Add new object stores to the `patzer-pro` database (version bump):

| Store | Key | Indexes | Purpose |
|-------|-----|---------|---------|
| `studies` | `id` | `createdAt`, `updatedAt`, `source`, `favorite` | Study items |
| `practice-lines` | `id` | `studyItemId`, `status` | Trainable sequences |
| `position-progress` | `key` | `nextDueAt` | Per-position mastery tracking |
| `drill-attempts` | auto | `positionKey`, `timestamp` | Attempt history |

### Routing

Add two new routes:
- `#/study` → Study Library browser
- `#/study/:id` → Study detail view (annotation workspace + practice entry)

### Non-destructive integration

The Study page shares the Chessground board but does NOT modify the analysis subsystem. It creates its own board instance and controller, avoiding entanglement with the analysis page's state. The "Save to Library" context menu item is the only touch point into `src/main.ts`.

---

## Phase 0: Foundation — Types, Persistence, and Route Shell

**Goal:** Establish the data model, IDB stores, route, and empty page shell. No functionality yet — just the skeleton.

**Why this phase first:** Every subsequent phase depends on the types and persistence layer. Getting this right prevents rework.

### Task 0.1: Study domain types

**Diagnosis:** No study-related types exist in the repo. All downstream work depends on canonical type definitions.

**Small safe step:** Create `src/study/types.ts` with all domain types:

```typescript
// Core study item
interface StudyItem {
  id: string;
  pgn: string;                     // full PGN (source of truth for move tree)
  title: string;                   // user-editable
  source: StudySource;             // where it came from
  sourceGameId?: string;           // if saved from an imported game
  sourcePath?: string;             // TreePath to the position where user saved
  white?: string;                  // player names from PGN headers
  black?: string;
  result?: string;
  eco?: string;
  opening?: string;
  tags: string[];
  folders: string[];
  favorite: boolean;
  notes?: string;                  // game-level free-text notes
  createdAt: number;
  updatedAt: number;
}

type StudySource = 'analysis' | 'openings' | 'puzzles' | 'manual' | 'import';

// Trainable sequence for repetition practice
interface TrainableSequence {
  id: string;
  studyItemId: string;
  label: string;
  moves: string[];                 // UCI notation
  sans: string[];                  // SAN notation
  fens: string[];                  // FEN after each move (pre-computed on save)
  trainAs: 'white' | 'black';
  startPly: number;                // 0 = from beginning
  status: 'active' | 'paused';
  createdAt: number;
  updatedAt: number;
}

// Per-position mastery (the scheduling unit)
interface PositionProgress {
  key: string;                     // normalized FEN (board + side + castling + ep)
  level: number;                   // 0–6
  nextDueAt: number;               // epoch ms; 0 = not yet learned
  attempts: number;
  correct: number;
  incorrect: number;
  streak: number;                  // consecutive correct
  lastAttemptAt: number;
  sequenceIds: string[];           // which sequences contain this position
}

// Single drill attempt record
interface DrillAttempt {
  positionKey: string;
  sequenceId: string;
  timestamp: number;
  result: 'correct' | 'incorrect';
  userMove?: string;               // SAN of what user played (if incorrect)
  expectedMove: string;            // SAN of correct move
  attemptsBeforeCorrect: number;
}
```

**Why safe:** Pure type file, no runtime behavior, no imports from existing modules. Cannot break anything.

**Files:** `src/study/types.ts` (new)

**Validation:** `npx tsc --noEmit` passes. No build impact (no runtime code).

---

### Task 0.2: Study IDB persistence layer

**Diagnosis:** The `patzer-pro` IDB database (currently v6) needs 4 new object stores. The existing migration pattern in `src/idb/index.ts` handles version bumps cleanly.

**Small safe step:** Add the 4 new stores to `src/idb/index.ts` (bump to v7) and create `src/study/studyDb.ts` with CRUD operations for all study stores.

**Why safe:** The `onupgradeneeded` handler only runs on version mismatch. Existing stores are untouched. New stores are created alongside existing ones.

**Files:**
- `src/idb/index.ts` (extend — add stores in upgrade handler)
- `src/study/studyDb.ts` (new — CRUD operations)

**Validation:** `npm run build` + `npx tsc --noEmit`. Manually verify existing IDB data survives the version bump (open app, confirm games/analysis/puzzles still load).

---

### Task 0.3: Route and page shell

**Diagnosis:** The router in `src/router.ts` needs two new patterns. The app bootstrap in `src/main.ts` needs route dispatch for the study page.

**Small safe step:** Add `#/study` and `#/study/:id` routes. Create `src/study/libraryView.ts` with a minimal placeholder render function. Wire route dispatch in `src/main.ts` to render the placeholder when the route matches. Add "Study" to the navigation menu.

**Why safe:** New routes don't conflict with existing routes. The placeholder view is a simple `h('div.study-page', 'Study Library — coming soon')`. The navigation menu addition is a single `h('a')` element.

**Files:**
- `src/router.ts` (extend — add two route patterns)
- `src/study/libraryView.ts` (new — placeholder)
- `src/main.ts` (extend — route dispatch + nav menu item)

**Validation:** `npm run build` + `npx tsc --noEmit`. Navigate to `#/study` and see the placeholder. Existing routes still work.

---

## Phase 1: Save Action — "Save to Library" from Anywhere

**Goal:** Users can save any game from any surface to the Study Library with one click.

**Why this phase:** This is the entry point for ALL content. Everything downstream depends on it. It also starts populating the library immediately, so by the time the annotation workspace ships, users already have material.

### Task 1.1: Save action core logic

**Diagnosis:** No "Save to Library" function exists. Need a single function that captures the current game context (PGN, metadata, source path) and persists a StudyItem.

**Small safe step:** Create `src/study/saveAction.ts` exporting `saveCurrentToLibrary(pgn: string, metadata: Partial<StudyItem>): Promise<StudyItem>`. This function generates an ID, populates defaults (title from PGN headers or "Untitled Study"), timestamps, and writes to IDB.

**Why safe:** Pure new module. No existing code modified. The function is called by the context menu (Task 1.2) — until then it's inert.

**Files:** `src/study/saveAction.ts` (new)

**Validation:** `npx tsc --noEmit`. Unit-testable: call the function with a PGN string, verify IDB write.

---

### Task 1.2: Context menu integration — "Save to Library"

**Diagnosis:** The context menu in `src/main.ts` (lines 210–272) renders menu items for copy PGN, delete, promote, and create puzzle. Adding "Save to Library" follows the same pattern.

**Small safe step:** Add a new menu item to `renderContextMenu()`: "Save to Library." On click, call `saveCurrentToLibrary()` with the current game PGN and metadata (source = 'analysis', sourceGameId = selected game ID, sourcePath = context menu path). Show a brief toast/notification: "Saved to Library."

**Why safe:** Additive — one new `h('div.context-action')` in the menu. Does not modify existing menu items. The save function is already implemented in Task 1.1.

**Files:** `src/main.ts` (extend — add menu item in renderContextMenu)

**Validation:** `npm run build` + `npx tsc --noEmit`. Right-click a move → "Save to Library" appears → click it → verify IDB contains the study item (check via dev tools Application > IndexedDB).

---

### Task 1.3: Board gear/menu integration — "Save game to Library"

**Diagnosis:** The analysis controls hamburger menu (`src/analyse/analysisControls.ts`) and the openings action menu both have menu item patterns. Adding a "Save game" action follows the same pattern.

**Small safe step:** Add "Save game to Library" as a menu item in the analysis controls hamburger menu. On click, call `saveCurrentToLibrary()` with the full current game PGN.

**Why safe:** One new menu item. Does not modify existing items.

**Files:** `src/analyse/analysisControls.ts` (extend — add menu item)

**Validation:** `npm run build` + `npx tsc --noEmit`. Open hamburger menu → "Save game to Library" appears → click → saved.

---

### Task 1.4: Toast notification for save confirmation

**Diagnosis:** No toast/notification system exists in the app. Need a minimal one for save confirmations and later for drill feedback.

**Small safe step:** Create `src/ui/toast.ts` — a minimal toast that shows a brief message at the bottom of the screen for 2 seconds, then auto-dismisses. CSS animation (fade in, hold, fade out). Single exported function: `showToast(message: string, durationMs?: number)`.

**Why safe:** New module, no dependencies on existing code. Used by the save action but doesn't modify it.

**Files:**
- `src/ui/toast.ts` (new)
- `src/styles/main.scss` (extend — add toast styles)

**Validation:** `npm run build`. Call `showToast('Test')` from console. Toast appears and auto-dismisses.

---

## Phase 2: Study Library Browser

**Goal:** A browsable, filterable, sortable library of saved studies at `#/study`.

### Task 2.1: Study library controller

**Diagnosis:** Need state management for the library page: loaded studies, selected study, filter/sort state, folder/tag state.

**Small safe step:** Create `src/study/studyCtrl.ts` with module-level state following the established pattern (exported getters/setters, init function). Functions: `initStudyLibrary()` (loads from IDB), `studies()`, `selectedStudy()`, `setSelectedStudy()`, `deleteStudy()`, `updateStudy()`, `studyFolders()` (computed from all studies).

**Why safe:** New module following existing ctrl.ts pattern. No coupling to analysis or puzzle controllers.

**Files:** `src/study/studyCtrl.ts` (new)

**Validation:** `npx tsc --noEmit`.

---

### Task 2.2: Library list view

**Diagnosis:** Need a list view rendering saved studies with metadata, similar to how `src/games/view.ts` renders the game list.

**Small safe step:** Implement `src/study/libraryView.ts` (replace the Phase 0 placeholder) with:
- Header: "Study Library" title + "Import PGN" button + search input
- Filter bar: folder pills, tag pills, source filter, favorite toggle
- Sort controls: date saved, title, last practiced
- Study list: rows showing title, source icon, date, tags, favorite star, due-review indicator
- Empty state: "No studies yet. Right-click any move to save it here."
- Click handler: navigate to `#/study/:id`

**Why safe:** Purely additive view rendering. Reads from studyCtrl state. No modification to existing pages.

**Files:**
- `src/study/libraryView.ts` (replace placeholder)
- `src/styles/main.scss` (extend — study library styles)

**Validation:** `npm run build` + `npx tsc --noEmit`. Navigate to `#/study`. If studies exist, they appear in the list. If not, empty state message shows.

---

### Task 2.3: Study metadata editing

**Diagnosis:** Users need to edit title, tags, folders, favorite status, and game-level notes.

**Small safe step:** Add inline editing capabilities to the library view:
- Click title → editable text field, blur/enter saves
- Tag editor: small input + existing tag pills with × remove
- Folder selector: dropdown of existing folders + "New folder" option
- Favorite star toggle
- Notes: expandable textarea in the study row or detail panel

**Why safe:** UI-only changes within the study library view. Calls `updateStudy()` from studyCtrl for persistence.

**Files:**
- `src/study/libraryView.ts` (extend)
- `src/study/studyCtrl.ts` (extend — tag/folder helpers)

**Validation:** `npm run build` + `npx tsc --noEmit`. Edit a study's title → verify it persists across page reload.

---

### Task 2.4: PGN import to library

**Diagnosis:** Users need to import PGN files directly into the study library (e.g., uploading a full opening repertoire PGN).

**Small safe step:** Add "Import PGN" button in the library header. On click, show a modal with a textarea (paste PGN) and a file upload button (.pgn files). On submit, parse PGN using `chessops/pgn` `parsePgn()`. For multi-game PGNs, each game becomes a separate StudyItem. Extract metadata from PGN headers (White, Black, Date, ECO, Opening, Result). Save all items to IDB.

**Why safe:** Reuses existing `chessops/pgn` parser. New UI is contained within the study library. Does not affect existing PGN import flows (game import, openings import).

**Files:**
- `src/study/libraryView.ts` (extend — import modal)
- `src/study/studyCtrl.ts` (extend — import function)

**Validation:** `npm run build` + `npx tsc --noEmit`. Paste a multi-game PGN → all games appear in the library with correct metadata.

---

## Phase 3: Study Detail — Annotation Workspace

**Goal:** A full-featured game annotation environment for a single study item. The user opens a study and sees a board + move list + annotation tools.

### Task 3.1: Study detail page shell

**Diagnosis:** Need a detail view at `#/study/:id` that loads a study item, parses its PGN into a tree, and renders a board + move list.

**Small safe step:** Create `src/study/studyDetailView.ts` that:
- Loads the StudyItem from IDB by ID
- Parses PGN into TreeNode via `pgnToTree()`
- Renders the board (new Chessground instance, NOT the analysis page's board)
- Renders the move list (reuse `renderMoveList()` or create a study-specific variant)
- Renders move navigation controls (first/prev/next/last)
- Handles tree navigation (click a move → board updates)

**Why safe:** Creates its own board instance. Does not modify the analysis page. The detail view is a self-contained component.

**Files:**
- `src/study/studyDetailView.ts` (new)
- `src/study/studyCtrl.ts` (extend — study detail state: loaded tree, current path, board instance)

**Validation:** `npm run build` + `npx tsc --noEmit`. Navigate to `#/study/:id` → board shows the saved game → moves are navigable.

**Critical dependency:** This task requires the board to work independently of the analysis controller. The board module currently injects an `AnalyseCtrl` getter. The study detail view needs either:
- A lightweight study-specific controller that satisfies the board's interface requirements
- Or a refactored board init that accepts a more generic controller interface

This is the most architecturally sensitive task in the entire sprint. Investigate the board's actual dependencies before implementing.

---

### Task 3.2: Text comment editing

**Diagnosis:** TreeNode has `comments?: TreeComment[]` but no UI exists for creating or editing them. The PGN annotation standard stores comments in curly braces.

**Small safe step:** Create `src/study/annotationCtrl.ts` for annotation state (currently editing node, comment text, active glyph). Create a comment panel below the move list that:
- Shows the current node's comment text (if any)
- Provides a textarea for editing
- Saves on blur or Enter
- Updates the TreeNode's comments array
- Marks the study as dirty (unsaved changes)

**Why safe:** New UI panel, no modification to existing move list rendering. The TreeComment type already exists.

**Files:**
- `src/study/annotationCtrl.ts` (new)
- `src/study/annotationView.ts` (new — comment panel)
- `src/study/studyDetailView.ts` (extend — render annotation panel)

**Validation:** `npm run build` + `npx tsc --noEmit`. Open a study → navigate to a move → type a comment → navigate away and back → comment persists.

---

### Task 3.3: NAG glyph insertion

**Diagnosis:** Move annotations (!, ?, !!, ??, !?, ?!) need to be addable via keyboard and toolbar. TreeNode has `glyphs?: Glyph[]` but no editing UI exists.

**Small safe step:** Add a glyph toolbar to the annotation workspace — a row of buttons for the 6 most common glyphs (!, ?, !!, ??, !?, ?!) plus position assessments (=, +=, +/-, +-). Clicking a glyph adds it to the current node. Keyboard shortcuts: typing `!` or `?` when the board is focused opens a quick-select dropdown (matching the established desktop study workflow pattern).

**Why safe:** New UI elements in the study detail view. Uses the existing Glyph type from `src/tree/types.ts`.

**Files:**
- `src/study/annotationView.ts` (extend — glyph toolbar)
- `src/study/annotationCtrl.ts` (extend — glyph state)
- `src/study/studyDetailView.ts` (extend — keyboard handlers)

**Validation:** `npm run build` + `npx tsc --noEmit`. Click `!` on the toolbar → glyph appears on the move in the move list. Type `!` on keyboard → quick-select appears.

---

### Task 3.4: Variation creation and management

**Diagnosis:** The existing move list supports variations (created by playing divergent moves on the board). For the study workspace, users need to freely add, promote, and delete variations. The tree operations in `src/tree/ops.ts` already support `addNode()`, `deleteNodeAt()`, `promoteAt()`.

**Small safe step:** Enable variation creation in the study detail view:
- Playing a non-mainline move on the board creates a variation (via `addNode()`)
- Right-click on a variation move shows promote/delete options (reuse context menu pattern)
- Variations render inline in the move list with the existing variation display

**Why safe:** Reuses existing tree operations. The study board's move handler calls `addNode()` for new moves, which is already the pattern in the analysis page.

**Files:**
- `src/study/studyDetailView.ts` (extend — board move handler for variation creation)
- `src/study/moveListStudy.ts` (new or extend — variation rendering with context actions)

**Validation:** `npm run build` + `npx tsc --noEmit`. Open a study → play a different move → variation appears → right-click → promote/delete work.

---

### Task 3.5: Variation fold/expand

**Diagnosis:** Deeply annotated games become overwhelming with all variations visible. No existing tool in the web ecosystem supports fold/expand — this is a differentiator borrowed from desktop study tools.

**Small safe step:** Add fold/expand toggles to variation branch points in the move list. A small ▶/▼ icon next to each variation start. Click to toggle visibility. Fold state is ephemeral (not persisted — resets on page load).

**Why safe:** Pure UI change in the study move list. Does not modify the tree structure.

**Files:**
- `src/study/moveListStudy.ts` (extend — fold/expand state and rendering)
- `src/styles/main.scss` (extend — fold/expand toggle styles)

**Validation:** `npm run build`. Open a study with variations → click fold → variation collapses → click expand → variation reappears.

---

### Task 3.6: Arrow and shape annotation persistence

**Diagnosis:** Chessground already supports drawing arrows and shapes (right-click + drag). The shapes are currently ephemeral — they clear on navigation. For the study workspace, drawn shapes should be saved as annotations on the current node.

**Small safe step:** Hook into Chessground's `drawable.onChange` callback. When shapes change, update the current TreeNode's `shapes` array. When navigating to a node with saved shapes, restore them via Chessground's `drawable.shapes` config. Shapes are serialized as `[%cal]` and `[%csl]` in PGN export.

**Why safe:** Uses existing Chessground drawable API and existing TreeNode.shapes field. No modification to the board core.

**Files:**
- `src/study/studyDetailView.ts` (extend — shape persistence hooks)
- `src/study/studyCtrl.ts` (extend — dirty tracking for shape changes)

**Validation:** `npm run build` + `npx tsc --noEmit`. Draw an arrow → navigate away → navigate back → arrow reappears. Save the study → reload page → arrow persists.

---

### Task 3.7: Engine analysis integration in study workspace

**Diagnosis:** Users need engine analysis available while annotating. The engine subsystem (`src/engine/ctrl.ts`) currently couples to the analysis page's controller. The study workspace needs its own engine toggle.

**Small safe step:** Add an engine toggle button in the study detail view. When enabled, start a Stockfish analysis on the current position. Display eval in a compact panel (eval bar + best line). When the user navigates, cancel the current search and start a new one for the new position.

**Why safe:** The engine protocol (`src/ceval/protocol.ts`) is already abstracted. Creating a second consumer (study page) alongside the existing one (analysis page) is safe as long as only one page is active at a time (hash routing ensures this).

**Files:**
- `src/study/studyDetailView.ts` (extend — engine toggle and eval display)
- `src/study/studyCtrl.ts` (extend — engine state for study page)

**Validation:** `npm run build` + `npx tsc --noEmit`. Open a study → toggle engine → eval appears → navigate → eval updates.

---

### Task 3.8: Position bookmarking

**Diagnosis:** No tool in the market offers position-level bookmarking within games. This is a simple but valuable differentiator.

**Small safe step:** Add a bookmark icon next to each move in the study move list. Click to toggle bookmark. Bookmarked positions are highlighted in the move list (distinct color/icon). A "Bookmarked Positions" filter in the study detail view shows only bookmarked nodes. Bookmarks are stored as a set of TreePath strings on the StudyItem.

**Why safe:** New UI element + new field on StudyItem. No modification to existing tree structure.

**Files:**
- `src/study/types.ts` (extend — add `bookmarks: string[]` to StudyItem)
- `src/study/moveListStudy.ts` (extend — bookmark icon + highlighting)
- `src/study/studyDetailView.ts` (extend — bookmark filter toggle)

**Validation:** `npm run build` + `npx tsc --noEmit`. Click bookmark on a move → icon appears → filter to bookmarks → only bookmarked positions shown.

---

### Task 3.9: Auto-save and PGN export

**Diagnosis:** The study workspace needs to persist annotation changes without explicit save actions (auto-save). It also needs PGN export with all annotations preserved.

**Small safe step:** Implement debounced auto-save (500ms after last change) that serializes the current TreeNode back to PGN (using a tree-to-PGN serializer that preserves comments, NAGs, shapes as `[%cal]`/`[%csl]`, and variations) and writes the updated PGN to the StudyItem in IDB. Add a "Copy PGN" button that copies the annotated PGN to clipboard. Add a "Download PGN" button that triggers a file download.

**PGN interoperability requirement:** The exported PGN must be fully compatible with Lichess Studies import. This means:
- All standard PGN headers preserved (Seven Tag Roster + supplemental tags)
- Comments in curly braces with `[%cal]` and `[%csl]` extensions for arrows/shapes
- `[%eval score,depth]` when engine evaluations are stored
- `[%clk h:mm:ss]` when clock data exists
- NAGs as standard `$N` notation
- Variations as RAV (parenthesized)
- Round-trip validation: export from Patzer → import to Lichess Study → verify comments, glyphs, arrows, variations all survive → export from Lichess → import back to Patzer → verify nothing lost

Similarly, PGN exported from Lichess Studies should import cleanly into Patzer's Study Library (Task 2.4) with all annotations preserved.

**Why safe:** Auto-save writes to IDB only. PGN export is a read-only operation.

**Files:**
- `src/study/studyCtrl.ts` (extend — auto-save with debounce)
- `src/study/pgnExport.ts` (new — tree-to-PGN serializer with annotation extensions)
- `src/study/studyDetailView.ts` (extend — export buttons)

**Validation:** `npm run build` + `npx tsc --noEmit`. Add annotations to a study → wait 1 second → close and reopen → annotations persist. Copy PGN → paste into a PGN viewer → annotations visible.

---

## Phase 4: Repetition Practice — Core Engine

**Goal:** The pure logic layer for repetition practice: scheduling, grading, and drill session control. No UI yet — just testable TypeScript modules.

### Task 4.1: Scheduling engine

**Diagnosis:** No scheduling logic exists. Need pure functions for interval calculation.

**Small safe step:** Create `src/study/practice/scheduler.ts`:
- `INTERVALS_MS`: array of interval durations for levels 0–6 (0, 1d, 3d, 1w, 2w, 1mo, 3mo)
- `scheduleNext(level, wasCorrect, now?)`: returns `{ newLevel, nextDueAt }`
  - Correct: advance 1 level (max 6)
  - Incorrect: drop 2 levels (min 1)
- `isDue(progress, now?)`: returns boolean
- `positionKey(fen)`: strips halfmove clock and fullmove number from FEN

~40 lines. Pure functions, no side effects, no dependencies on other modules.

**Why safe:** Pure math. Zero imports from existing code. Cannot break anything.

**Files:** `src/study/practice/scheduler.ts` (new)

**Validation:** `npx tsc --noEmit`.

---

### Task 4.2: Move grader

**Diagnosis:** No move grading logic exists. Need a pure function that compares user's SAN against expected SAN.

**Small safe step:** Create `src/study/practice/grader.ts`:
- `gradeMove(userSan, expectedSan, alternatives?)`: returns `'correct' | 'incorrect' | 'alternative'`
- Exact SAN match = correct
- Match against alternatives array = alternative (Phase 2: "good but not the book move")
- Otherwise = incorrect

~20 lines. Pure function.

**Why safe:** Pure function, no side effects, no imports.

**Files:** `src/study/practice/grader.ts` (new)

**Validation:** `npx tsc --noEmit`.

---

### Task 4.3: Drill session controller

**Diagnosis:** No drill session state machine exists. Need a controller that manages the learn/review/quiz flow.

**Small safe step:** Create `src/study/practice/drillCtrl.ts` following the RetroCtrl pattern:
- Factory function `createDrillSession(sequences, mode, callbacks)` returning a `DrillSessionCtrl` interface
- State: current sequence index, current ply, feedback state, retry count, session stats
- Methods: `handleUserMove(san)`, `handleNext()`, `skip()`, `endSession()`, `getState()`
- Feedback states: `'idle' | 'awaitingMove' | 'correct' | 'incorrect' | 'retry' | 'showAnswer' | 'sequenceComplete' | 'sessionComplete'`
- Callbacks: `onPositionGraded(key, result)` for persistence, `onSessionComplete(stats)` for UI
- Internal logic: advance through sequence, auto-skip opponent moves, grade user moves, handle retries (max 3), advance to next sequence on completion

~150 lines. No UI, no IDB, no board coupling.

**Why safe:** Follows the established RetroCtrl pattern. Uses callbacks for side effects instead of direct dependencies.

**Files:** `src/study/practice/drillCtrl.ts` (new)

**Validation:** `npx tsc --noEmit`. Manually verify state transitions with console-driven test.

---

### Task 4.4: Session builder

**Diagnosis:** Need logic to assemble drill queues from due positions.

**Small safe step:** Create `src/study/practice/sessionBuilder.ts`:
- `buildReviewSession(sequences, progress, now?)`: returns sorted array of sequences containing due positions
- `buildLearnSession(sequences, progress)`: returns sequences with unlearned positions (level 0)
- `countDuePositions(sequences, progress, now?)`: returns count for dashboard display

~50 lines. Pure functions reading from provided data, no IDB calls.

**Why safe:** Pure functions. No side effects.

**Files:** `src/study/practice/sessionBuilder.ts` (new)

**Validation:** `npx tsc --noEmit`.

---

### Task 4.5: Practice line extraction

**Diagnosis:** Need logic to extract a TrainableSequence from a StudyItem's PGN.

**Small safe step:** Create extraction logic in `src/study/studyCtrl.ts` (or a dedicated `src/study/practice/extractLine.ts`):
- Parse the study's PGN into a tree
- Walk the mainline (or a specified variation path) collecting UCI moves, SAN moves, and FENs
- Determine training color from the study's metadata or let the user choose
- Create a TrainableSequence record and persist to IDB

**Why safe:** Reads from existing PGN, creates new data. Does not modify the study item.

**Files:**
- `src/study/practice/extractLine.ts` (new)
- `src/study/studyDb.ts` (extend — save/load TrainableSequence)

**Validation:** `npx tsc --noEmit`. Extract a line from a study → verify TrainableSequence in IDB has correct moves/sans/fens.

---

## Phase 5: Repetition Practice — Board and UI

**Goal:** Wire the drill engine to Chessground and build the drill session UI.

### Task 5.1: Board adapter for drill mode

**Diagnosis:** Need a bridge between the drill controller and Chessground that handles auto-playing opponent moves, intercepting user moves for grading, showing correct moves after failure, and managing board interactivity.

**Small safe step:** Create `src/study/practice/boardAdapter.ts`:
- `setPosition(fen, orientation)`: set the board to a position
- `animateOpponentMove(from, to, afterFen)`: animate a piece movement, then update position
- `enableUserInput(legalDests)`: make the board interactive for the user's color
- `disableUserInput()`: make the board non-interactive
- `showCorrectMove(from, to)`: animate the correct move (after failure)
- `flashFeedback(type)`: brief visual flash (green = correct, red = incorrect)

Uses Chessground's programmatic API: `cg.set({ fen, orientation, movable: { dests }, animation })`.

**Why safe:** Creates a new Chessground instance for drill mode. Does not touch the analysis board.

**Files:** `src/study/practice/boardAdapter.ts` (new)

**Validation:** `npm run build` + `npx tsc --noEmit`.

---

### Task 5.2: Drill session UI — active session view

**Diagnosis:** Need the full drill session user interface.

**Small safe step:** Create `src/study/practice/drillView.ts` rendering:
- Full-width board (user's color at bottom)
- Sequence label at top ("Sicilian Defense — 6.e5 Main Line")
- Move counter ("Position 7 of 12")
- Feedback strip: "Your turn" / "Correct!" / "Try again (2 left)" / "The move was Nf3"
- "Next" button (visible after correct or showAnswer states)
- "End Session" button
- Session progress bar: "3/8 lines completed"

**Why safe:** New view rendering, contained within the study/practice module.

**Files:**
- `src/study/practice/drillView.ts` (new)
- `src/styles/main.scss` (extend — drill session styles)
- `src/study/studyDetailView.ts` (extend — "Practice this line" button that launches drill)

**Validation:** `npm run build` + `npx tsc --noEmit`. Save a study → click "Practice this line" → drill session starts → play moves → feedback appears.

---

### Task 5.3: Drill session UI — session summary

**Diagnosis:** After completing a drill session, users need a summary of their performance.

**Small safe step:** Add a session summary view that appears when `feedback === 'sessionComplete'`:
- Positions quizzed
- Accuracy percentage
- Sequences completed
- Session duration
- "Practice Again" button (restart)
- "Back to Library" button

**Why safe:** Purely additive to the drill view.

**Files:** `src/study/practice/drillView.ts` (extend — summary section)

**Validation:** Complete a drill session → summary appears with correct stats.

---

### Task 5.4: Practice entry from study detail — "Practice this line"

**Diagnosis:** Need a clear entry point from the study detail view into drill mode.

**Small safe step:** Add a "Practice this line" button in the study detail view. On click:
1. Extract the mainline as a TrainableSequence (if not already extracted)
2. Prompt for training color (White or Black) via a simple 2-button selector
3. Launch the drill session with the extracted sequence
4. The study detail view transitions to the drill view (same route, different render state)

**Why safe:** Builds on Tasks 4.5 (extraction) and 5.2 (drill view). The transition is a controller state change, not a route change.

**Files:**
- `src/study/studyDetailView.ts` (extend — practice button + color selector)
- `src/study/studyCtrl.ts` (extend — practice mode state)

**Validation:** `npm run build` + `npx tsc --noEmit`. Open a study → click "Practice this line" → select color → drill starts.

---

## Phase 6: Scheduling and Review

**Goal:** Connect the scheduling engine to persistence and build the practice dashboard.

### Task 6.1: Progress persistence

**Diagnosis:** The drill controller emits grading events but nothing persists them yet.

**Small safe step:** Wire the drill controller's `onPositionGraded` callback to:
1. Load the PositionProgress for the graded position key
2. Call `scheduleNext()` to compute new level and due date
3. Update the PositionProgress in IDB
4. Append a DrillAttempt record to IDB

**Why safe:** Integration wiring only. The scheduler and IDB operations already exist.

**Files:**
- `src/study/studyCtrl.ts` (extend — wire drill callbacks to IDB persistence)
- `src/study/studyDb.ts` (extend — position progress update helpers)

**Validation:** `npm run build` + `npx tsc --noEmit`. Complete a drill → verify PositionProgress updated in IDB with correct level and due date.

---

### Task 6.2: Practice dashboard

**Diagnosis:** Users need a central entry point showing how many positions are due for review.

**Small safe step:** Add a practice dashboard section to the library view (`#/study`):
- Banner: "X positions due for review" (computed from PositionProgress where nextDueAt <= now)
- "Start Review" button: assembles a review session from all due positions across all sequences, launches drill
- "Learn New Lines" section: shows sequences with unlearned positions (level 0)
- Each study row in the library shows a small indicator if it has due positions

**Why safe:** Reads from PositionProgress store. Launches the drill session (already built). No modification to existing code.

**Files:**
- `src/study/libraryView.ts` (extend — dashboard banner + indicators)
- `src/study/studyCtrl.ts` (extend — due count computation)

**Validation:** `npm run build` + `npx tsc --noEmit`. Complete a drill → wait for due date (or set a test date in the past) → "Start Review" appears → clicking it launches a review session with the correct sequences.

---

### Task 6.3: Learn flow

**Diagnosis:** New sequences need a "learn" mode where the system shows the line first, then quizzes.

**Small safe step:** In the drill controller, when `mode === 'learn'`:
1. First pass: auto-play the entire sequence with a 700ms delay per move (user watches)
2. Second pass: quiz mode — user plays their moves, opponent auto-plays
3. After learning, all positions in the sequence start at level 1 (1-day review)

**Why safe:** Behavioral change within the drill controller only. The board adapter already supports auto-play.

**Files:** `src/study/practice/drillCtrl.ts` (extend — learn mode logic)

**Validation:** Start a learn session on a new sequence → system plays through the line → then quizzes → positions appear in PositionProgress at level 1.

---

## Phase 7: Practice Line Selection

**Goal:** Users can select which moves or where practice should begin within a study.

### Task 7.1: Multi-line extraction

**Diagnosis:** Currently only the mainline is extractable. Users need to practice specific variations.

**Small safe step:** In the study detail view, add a "Practice from here" option to the move list context menu. Right-clicking any move and selecting "Practice from here" extracts a TrainableSequence from that move to the end of its line. This allows users to practice specific variations or start practice from a specific position.

**Files:**
- `src/study/studyDetailView.ts` (extend — context menu in study move list)
- `src/study/practice/extractLine.ts` (extend — extract from arbitrary path + ply)

**Validation:** Right-click a move mid-game → "Practice from here" → drill starts from that position.

---

### Task 7.2: Practice line manager

**Diagnosis:** Users with multiple practice lines per study need to see and manage them.

**Small safe step:** Add a "Practice Lines" panel in the study detail view showing all TrainableSequences for the current study. Each line shows: label, training color, status (active/paused), position count, due count. Actions: pause/resume, delete, rename, "Practice now."

**Files:**
- `src/study/studyDetailView.ts` (extend — practice lines panel)
- `src/study/studyDb.ts` (extend — load lines by studyItemId)

**Validation:** Extract multiple lines → all appear in the panel → pause/resume/delete work.

---

### Task 7.3: Sequence scope selection UI

**Diagnosis:** Users need to choose whether to practice the full game, a specific variation, or just critical positions from a specific starting point.

**Small safe step:** When the user clicks "Practice this line," show a scope selection:
- "Full game" — mainline from move 1
- "From current position" — from the currently selected move to end of line
- "Selected variation" — if a variation is selected, extract that variation
- Training color picker (White / Black)

**Files:**
- `src/study/studyDetailView.ts` (extend — scope selection modal/panel)
- `src/study/practice/extractLine.ts` (extend — extract variation paths)

**Validation:** Select different scopes → verify extracted sequences match the expected move range.

---

## Phase 8: Polish and Integration

**Goal:** Cross-product integration, performance, and UX polish.

### Task 8.1: Save from openings research

**Diagnosis:** Users researching opponent openings should be able to save lines directly to the study library.

**Small safe step:** Add "Save to Library" action in the openings tool. Creates a StudyItem from the current path through the opening tree (reconstruct a minimal PGN from the current UCI move sequence). Optionally also creates a TrainableSequence in one action (since training color is already known in the openings context).

**Files:**
- `src/openings/view.ts` (extend — "Save to Library" button)
- `src/study/saveAction.ts` (extend — accept UCI move array as input)

**Validation:** In openings → navigate to a line → "Save to Library" → appears in study library.

---

### Task 8.2: Save from puzzle session

**Diagnosis:** Users solving puzzles may want to save interesting positions to the library.

**Small safe step:** Add "Save position to Library" in the puzzle session view. Creates a StudyItem from the puzzle's starting FEN and solution line.

**Files:**
- `src/puzzles/ctrl.ts` (extend — save action call)
- `src/study/saveAction.ts` (extend — accept FEN + solution line as input)

**Validation:** Solve a puzzle → "Save to Library" → appears in study library with correct position.

---

### Task 8.3: Keyboard shortcuts for drill mode

**Diagnosis:** Drill sessions should be efficient. Keyboard shortcuts reduce friction.

**Small safe step:** Add keyboard handlers in the drill view:
- Enter / Space → "Next" (advance after correct or showAnswer)
- Escape → end session
- Arrow keys → disabled during drill (prevent accidental board navigation)

**Files:** `src/study/practice/drillView.ts` (extend — keyboard event handlers)

**Validation:** During drill → press Enter after correct → advances. Press Escape → session ends.

---

### Task 8.4: Sound effects for drill feedback

**Diagnosis:** Auditory feedback during drill sessions improves the experience. The board cosmetics system already has a sound toggle.

**Small safe step:** Play a sound on correct move (short confirmation tone) and incorrect move (short error tone). Respect the existing mute toggle in board cosmetics. Use simple HTML5 Audio with pre-loaded samples.

**Files:**
- `src/study/practice/boardAdapter.ts` (extend — sound playback)
- Add two small audio files to `public/` (correct.mp3, incorrect.mp3)

**Validation:** During drill with sound on → correct move plays sound → incorrect plays different sound. Mute toggle silences both.

---

### Task 8.5: Warmup position behavior

**Diagnosis:** During whole-line review, non-due positions are played for context. Getting them wrong should reset them (the "warmup penalty"), but getting them right should not affect scheduling.

**Small safe step:** In the drill controller, when processing a position:
- Check if the position is due (via `isDue()`)
- If due: grade normally, update progress
- If not due (warmup): correct → no progress change. Incorrect → reset to level 1 (creates new review obligation)

**Files:** `src/study/practice/drillCtrl.ts` (extend — warmup position logic)

**Validation:** Practice a line with mixed due/non-due positions → verify only due positions advance on correct → verify non-due positions reset on incorrect.

---

### Task 8.6: Study library performance optimization

**Diagnosis:** Users with hundreds of studies need fast library loading. IDB `getAll()` on a large store can be slow.

**Small safe step:** Implement pagination in the library view (load 50 studies at a time, with "Load more" or infinite scroll). Use IDB cursors with index-based sorting instead of `getAll()` + sort in memory.

**Files:**
- `src/study/studyDb.ts` (extend — paginated query with cursor)
- `src/study/libraryView.ts` (extend — pagination/infinite scroll)

**Validation:** Create 200+ study items → library loads quickly → scrolling is smooth.

---

## Phase 9: Library Navigation and Organization UX

**Goal:** Elevate the study library from a basic list view into a polished, intuitive navigation experience with folders, drag-and-drop organization, multi-select, and flexible view modes.

**Design intent:** The library should feel as natural as a well-designed file manager. Users should be able to create folders, drag studies between them, select multiple items for bulk operations, and navigate their collection without friction. The exact layout pattern (sidebar tree, column view, or something else) should be determined during implementation based on what feels best — the goal is great navigation UX, not commitment to a specific visual paradigm.

**Reference patterns worth studying:**
- Sidebar tree + content area (Gmail, Notion, VS Code explorer)
- Column/breadcrumb drill-down (macOS Finder column view, iCloud.com)
- Flat list with grouping and inline folder expansion
- Kanban-style columns grouped by folder or tag

The right choice depends on how users actually structure their libraries. Start with the simplest pattern that supports the full set of operations, then refine based on real usage.

### Task 9.1: Folder hierarchy data model

**Diagnosis:** The current StudyItem has a flat `folders: string[]` field — just folder name strings with no hierarchy, no ordering, no metadata. A real folder system needs: folder IDs, parent references (for nesting), display order, color/icon (optional), and creation timestamps.

**Small safe step:** Add a `StudyFolder` type to `src/study/types.ts`:
```typescript
interface StudyFolder {
  id: string;
  name: string;
  parentId: string | null;    // null = root level
  order: number;              // display order within parent
  color?: string;             // optional visual identifier
  createdAt: number;
  updatedAt: number;
}
```
Add a `folders` object store to IDB. Update StudyItem's `folders` field to store folder IDs (not names) — or add a `folderIds: string[]` field alongside the existing `folders` for backward compatibility.

**Why safe:** Type addition + IDB store addition. No UI changes. Existing `folders: string[]` data continues to work.

**Files:**
- `src/study/types.ts` (extend — StudyFolder type)
- `src/idb/index.ts` (extend — add folders store, bump version)
- `src/study/studyDb.ts` (extend — folder CRUD)

**Validation:** `npm run build` + `npx tsc --noEmit`. Existing studies still load. New folders store exists in IDB.

---

### Task 9.2: Folder sidebar and navigation

**Diagnosis:** The library view is currently a flat list. Need a folder navigation panel that lets users browse by folder.

**Small safe step:** Add a collapsible sidebar to the library view:
- Root level shows all top-level folders + an "All Studies" option + an "Unfiled" option
- Clicking a folder filters the study list to that folder's contents
- Nested folders (if parentId is set) render as indented children
- Folder expand/collapse toggles for nested folders
- Active folder is highlighted
- Folder count badges (number of studies in each folder)

**Why safe:** Additive UI panel alongside the existing list view. The list view rendering is unchanged — it just receives a folder filter.

**Files:**
- `src/study/libraryView.ts` (extend — sidebar panel + folder filter state)
- `src/study/studyCtrl.ts` (extend — folder navigation state, active folder)
- `src/styles/main.scss` (extend — sidebar layout)

**Validation:** Create folders → they appear in sidebar → click folder → list filters correctly → nested folders indent and expand/collapse.

---

### Task 9.3: Create, rename, and delete folders

**Diagnosis:** Users need basic folder management operations.

**Small safe step:**
- "New Folder" button in the sidebar header → creates folder with editable inline name
- Right-click folder → context menu with Rename and Delete options
- Rename: inline text edit on the folder name
- Delete: confirmation prompt. Option to move contained studies to parent folder or "Unfiled." Does NOT delete the studies themselves.
- "New Subfolder" option inside existing folders (for nesting)

**Files:**
- `src/study/libraryView.ts` (extend — folder management UI)
- `src/study/studyCtrl.ts` (extend — create/rename/delete folder operations)
- `src/study/studyDb.ts` (extend — folder persistence)

**Validation:** Create folder → rename → create subfolder inside it → delete subfolder → studies move to parent.

---

### Task 9.4: Drag-and-drop studies into folders

**Diagnosis:** Users need to organize studies by dragging them into folders in the sidebar.

**Small safe step:** Implement HTML5 Drag and Drop:
- Study rows in the list are `draggable="true"`
- Folders in the sidebar are drop targets
- On dragover: folder highlights to indicate valid drop
- On drop: update the study's `folderIds` to include the target folder
- Visual feedback: study row shows a ghost while dragging, folder shows a highlight ring
- Moving between folders: dragging to a new folder updates the membership

**Technical notes:**
- Use native HTML5 `dragstart`, `dragover`, `drop` events — no library needed for this scope
- `event.dataTransfer.setData('text/plain', studyId)` on dragstart
- `event.preventDefault()` on dragover to allow drop
- Touch/mobile drag: defer to Phase 9.6 (touch events need different handling)

**Why safe:** Event handlers on existing DOM elements. No structural changes to the list or sidebar.

**Files:**
- `src/study/libraryView.ts` (extend — drag source on study rows, drop target on folders)
- `src/study/studyCtrl.ts` (extend — move-to-folder operation)
- `src/styles/main.scss` (extend — drag feedback styles)

**Validation:** Drag a study row → hover over a folder → folder highlights → drop → study now appears in that folder. Drag to a different folder → study moves.

---

### Task 9.5: Multi-select and bulk operations

**Diagnosis:** Users with large libraries need to select multiple studies for bulk operations (move to folder, tag, delete, export).

**Small safe step:**
- Click selects one study (existing behavior)
- Cmd/Ctrl + click toggles individual selection without deselecting others
- Shift + click selects a range (from last selected to clicked)
- Selected items are visually highlighted (distinct from hover)
- When multiple items are selected, a bulk action bar appears at the top: "X selected" + action buttons: Move to Folder, Add Tag, Delete, Export PGN
- Clicking away or pressing Escape clears the selection

**Why safe:** Selection state is ephemeral (in-memory). Bulk operations call existing single-item operations in a loop.

**Files:**
- `src/study/studyCtrl.ts` (extend — selectedIds: Set<string>, selection logic)
- `src/study/libraryView.ts` (extend — multi-select handlers, bulk action bar)
- `src/styles/main.scss` (extend — selection highlight + bulk bar styles)

**Validation:** Cmd+click three studies → all highlighted → "3 selected" bar appears → "Move to Folder" → all three move → Escape → selection clears.

---

### Task 9.6: View mode toggle (list vs grid)

**Diagnosis:** Some users prefer a compact list; others prefer a visual grid with board thumbnails.

**Small safe step:**
- Add a view mode toggle in the library header: list icon / grid icon
- **List view** (default, current): rows with title, metadata, tags, icons
- **Grid view**: cards with a small board thumbnail (render the study's starting position as a static Chessground mini-board), title below, and key metadata
- View mode persisted to localStorage
- Both views respect the same sort/filter/folder state

**Why safe:** Two CSS layouts rendering the same data. The grid view adds small static board renderings (Chessground supports this natively with `viewOnly: true`).

**Files:**
- `src/study/libraryView.ts` (extend — grid rendering, view mode toggle)
- `src/study/studyCtrl.ts` (extend — view mode state + localStorage persistence)
- `src/styles/main.scss` (extend — grid layout styles)

**Validation:** Toggle to grid → studies show as cards with board thumbnails → toggle back to list → standard rows. View mode persists across reload.

---

### Task 9.7: Search across annotations

**Diagnosis:** Users need full-text search across their study library — not just titles but also annotation comments, notes, and tags.

**Small safe step:**
- Search input in the library header (already exists from Phase 2 as a title filter)
- Extend to search across: title, notes, tags, PGN comments (extract text from PGN comment blocks)
- Results highlight which field matched
- Debounced input (300ms) to avoid excessive filtering on every keystroke
- Search is client-side (filter the loaded studies array)

**Performance note:** For libraries with 100+ studies, extracting and searching PGN comments on every keystroke could be slow. Pre-compute a search index on library load: for each study, extract all comment text from the PGN and store as a flat searchable string. This index lives in memory only (not persisted).

**Files:**
- `src/study/studyCtrl.ts` (extend — search index, search function)
- `src/study/libraryView.ts` (extend — search UI, result highlighting)

**Validation:** Type a word that appears in a study's comment → study appears in filtered results. Type a tag name → studies with that tag appear. Clear search → all studies shown.

---

## Validation Expectations

Every task must validate with:
1. `npm run build` — esbuild succeeds
2. `npx tsc --noEmit` — TypeScript type-checking passes
3. Manual verification checklist specific to the task

## Recommended Prompt Sequence

| Phase | Tasks | Estimated CCP Range | Dependencies |
|-------|-------|-------------------|-------------|
| 0 | 0.1, 0.2, 0.3 | CCP-515 to CCP-517 | None |
| 1 | 1.1, 1.2, 1.3, 1.4 | CCP-518 to CCP-521 | Phase 0 |
| 2 | 2.1, 2.2, 2.3, 2.4 | CCP-522 to CCP-525 | Phase 1 |
| 3 | 3.1–3.9 | CCP-526 to CCP-534 | Phase 2 |
| 4 | 4.1–4.5 | CCP-535 to CCP-539 | Phase 0 (types only) |
| 5 | 5.1–5.4 | CCP-540 to CCP-543 | Phases 3 + 4 |
| 6 | 6.1–6.3 | CCP-544 to CCP-546 | Phase 5 |
| 7 | 7.1–7.3 | CCP-547 to CCP-549 | Phase 6 |
| 8 | 8.1–8.6 | CCP-550 to CCP-555 | Phase 7 |
| 9 | 9.1–9.7 | TBD | Phase 2 (minimum) |

**Note:** Phases 3 and 4 can execute in parallel (annotation workspace and drill engine are independent until Phase 5 wires them together).

**Manager prompts:** One per phase, following the `manager-batch.md` template. Each manager prompt batches 3–9 child prompts.

## Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Board coupling to AnalyseCtrl | High | Task 3.1 must investigate board's actual deps. May need a generic controller interface. |
| IDB migration breaks existing data | High | Test version bump carefully. Phase 0.2 validation must confirm existing stores survive. |
| Study PGN size | Medium | Monitor IDB storage. Consider separating large PGNs from metadata if needed. |
| Performance with many studies | Medium | Phase 8.6 adds pagination. Build with lazy loading from the start. |
| Scope creep into analysis page | Medium | Study page creates its own board instance. No shared mutable state with analysis. |
| Drill session feels too slow | Medium | Tune animation timing (200ms slide + 300ms pause = 500ms per opponent move). Faster than the default 700ms in established tools. |
| Review backlog anxiety | Low | Kinder scheduling (1-day first interval, drop-2 on failure). No gamification pressure. |
| Drag-and-drop complexity | Medium | HTML5 DnD API has rough edges especially on mobile/touch. Start with desktop-only drag; defer touch drag to later. |
| Library navigation UX uncertainty | Low | The best layout pattern (sidebar, columns, flat) depends on real usage. Start with sidebar+list, iterate based on feedback. Don't commit to column view prematurely. |
| PGN interop data loss | Medium | Test round-trip with Lichess Studies explicitly. Some annotation types (position bookmarks, practice line assignments) are Patzer-specific and won't survive external round-trip — this is expected and acceptable. |

## Decision Log

| Decision | Rationale |
|----------|-----------|
| New top-level route `#/study` | Study library is cross-product, not scoped to openings or analysis |
| Own Chessground instance | Avoids entanglement with analysis board state |
| IDB in `patzer-pro` database | Library is a core feature, not a separate subsystem |
| Separate StudyItem from TrainableSequence | Saving ≠ drilling. Users should save without committing to practice. |
| 6-level scheduling (not 8) | Simpler. 3-month max interval is sufficient for personal study. |
| Drop-2 on failure (not hard reset) | Kinder. Prevents "one mistake destroys a month of progress." |
| 1-day first interval (not 4 hours) | Reduces review anxiety. Most users don't check every 4 hours. |
| Position-level scheduling by FEN | Eliminates redundant drilling of shared positions across lines. |
| No gamification | Clean, focused tool. No points, streaks, or leaderboards. |
| PGN as source of truth for study content | Preserves full context (headers, variations, comments). |
| Auto-save with debounce | Reduces data loss risk. No explicit "save" button needed. |

---

*End of sprint plan*
