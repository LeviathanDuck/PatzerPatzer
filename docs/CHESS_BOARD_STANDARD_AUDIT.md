# Chess Board Standard — Audit & Implementation Plan

**Date:** 2026-03-29
**Status:** Plan approved, implementation pending

---

## The Standard

Every chess board in Patzer Pro that has a move list should use the same three-element nav bar pattern established on the analysis board:

```
[Book icon]  [⏮ ◀ ▶ ⏭]  [☰ Hamburger]
```

- **Book icon (left of nav)** — toggles the Opening Explorer for the current position
- **Navigation buttons (centre)** — first / prev / next / last move
- **Hamburger (right of nav)** — opens a page-specific action menu overlay with display settings

This is implemented via `renderMoveNavBar()` in `src/analyse/analysisControls.ts`.
Pass `MoveNavOverride` to supply custom nav callbacks, book state/handler, and right slot.

The action menu overlay (`.action-menu`) renders inside the tools/side column with `position: absolute; inset: 0`, exactly as the analysis board action menu does.

---

## Page Audit

### 1. Analysis Board ✅ COMPLETE

**Files:** `src/main.ts`, `src/analyse/analysisControls.ts`

| Element | Status |
|---|---|
| Move list | ✅ `renderMoveList()` inside `.analyse__moves.areplay` |
| MoveNavBar | ✅ `renderMoveNavBar()` — full three-zone bar |
| Book icon | ✅ `renderExplorerEntry()` wired to analysis explorer |
| Hamburger | ✅ `toggleActionMenu()` → `renderActionMenu()` overlay |
| Action menu | ✅ Full display settings (see below) |

**Action menu contents:**
- Tools section: Flip board, Learn From Your Mistakes
- Display section: Move markers on board, Move labels, Review dots (my moves only), Engine arrows, All lines, Played move arrow, Arrow labels, Label size slider

---

### 2. Openings Session ⚠️ MISSING HAMBURGER

**Files:** `src/openings/view.ts`

| Element | Status |
|---|---|
| Move list | ✅ `renderOpeningsMoveList()` → `renderMoveList()` inside `.analyse__moves.areplay` |
| MoveNavBar | ✅ `renderMoveNavBar()` with `MoveNavOverride` |
| Book icon | ✅ Wired to `explorerCtrl.toggle()` |
| Hamburger | ❌ `rightSlot` is empty |
| Action menu | ❌ Does not exist |

**Action menu to build (Step 1):**
- Flip board (currently a standalone button in the session header)
- Color filter: White / Black / Both (currently standalone buttons in session header)
- Engine display settings (arrows, labels, etc.)

---

### 3. Puzzle Round ⚠️ MISSING EVERYTHING

**Files:** `src/puzzles/view.ts`, `src/puzzles/ctrl.ts`

| Element | Status |
|---|---|
| Move list | ✅ `renderPuzzleMoveList()` inside `.analyse__moves.areplay` |
| MoveNavBar | ❌ Uses ad-hoc navigation, no `renderMoveNavBar()` |
| Book icon | ❌ Not present |
| Hamburger | ❌ Not present |
| Action menu | ❌ Does not exist |

**Current nav:** Inline buttons or keyboard only; no unified nav bar.

**Action menu to build (Steps 2–3):**
- Flip board
- Auto-next toggle (currently lives in session sidebar only)
- Engine display settings

**Book icon (Step 3):**
- Wire to opening explorer using the current puzzle FEN
- `explorerCtrl` already exists and handles FEN-based lookups

---

### 4. Puzzle Library ❌ MISSING MOVE LIST + EVERYTHING

**Files:** `src/puzzles/view.ts`, `src/puzzles/ctrl.ts`

| Element | Status |
|---|---|
| Move list | ❌ Board is decorative (`mountIdleBoard`) — no move list at all |
| MoveNavBar | ❌ Not present |
| Book icon | ❌ Not present |
| Hamburger | ❌ Not present |
| Action menu | ❌ Does not exist |

**Current behaviour:** Clicking a puzzle in the list navigates away to `#/puzzles/:id` (the round).

**Desired behaviour (Step 4):**
- Clicking a puzzle in the list loads it onto the library board in-place (no navigation)
- Shows the puzzle move list beside the board
- Shows `renderMoveNavBar()` with full standard nav
- A "Play" button (or double-click) navigates to the round

**Action menu to build (Step 5):**
- Flip board
- Engine display settings
- Any puzzle-preview-specific settings

---

## Implementation Steps

### Step 1 — Openings: hamburger + action menu
**Scope:** `src/openings/view.ts` only
**Work:**
1. Add `_openingsMenuOpen: boolean` state + `toggleOpeningsMenu()` in the view
2. Create `renderOpeningsActionMenu()` — overlay with `.action-menu` structure:
   - Tools: Flip board, Color filter (White / Black / Both)
   - Display: Engine arrows, engine label settings
3. Pass hamburger button via `rightSlot` in `renderMoveNavBar` call
4. Render `renderOpeningsActionMenu()` inside `.openings__session-panel` (same column as the move list)

---

### Step 2 — Puzzle round: add MoveNavBar
**Scope:** `src/puzzles/view.ts` only
**Work:**
1. Identify the current puzzle nav buttons and remove / replace them
2. Call `renderMoveNavBar([], { canPrev, canNext, first, prev, next, last, bookActive, onBook, rightSlot })` with puzzle's navigation callbacks
3. Render it in the same position the old nav sat

---

### Step 3 — Puzzle round: action menu
**Scope:** `src/puzzles/view.ts` only
**Work:**
1. Add `_puzzleMenuOpen: boolean` state + toggle
2. Create `renderPuzzleActionMenu()`:
   - Tools: Flip board, Auto-next toggle
   - Display: Engine arrows, labels
3. Pass hamburger as `rightSlot`
4. Render overlay inside `.puzzle__side` column

---

### Step 4 — Puzzle library: in-place preview mode
**Scope:** `src/puzzles/view.ts`, `src/puzzles/ctrl.ts`
**Work:**
1. Add `_previewPuzzleId: string | null` state to ctrl
2. `selectPuzzleFromList()` sets `_previewPuzzleId` + loads puzzle onto board instead of routing away
3. Replace `mountIdleBoard` with `mountPuzzleBoard` when a preview puzzle is loaded
4. Add move list + `renderMoveNavBar()` beside the board
5. Add "Play this puzzle" button that navigates to the round

---

### Step 5 — Puzzle library: action menu + book
**Scope:** `src/puzzles/view.ts` only
**Depends on:** Step 4
**Work:**
1. Add hamburger + `renderPuzzleLibraryActionMenu()` (flip board, engine settings)
2. Wire book icon to `explorerCtrl` for the preview puzzle's FEN

---

## Shared infrastructure (already complete)

- `renderMoveNavBar(leftNodes, nav?)` — `src/analyse/analysisControls.ts`
- `MoveNavOverride` interface — `src/analyse/analysisControls.ts`
- `.move-nav-bar` / `__left` / `__middle` / `__right` CSS — `src/styles/main.scss`
- `.action-menu` overlay CSS — `src/styles/main.scss`
- `renderToggleRow()` — `src/ui.ts`
- `explorerCtrl` — `src/openings/explorerCtrl.ts`

All new action menus should use `renderToggleRow()` for settings toggles and follow the `.action-menu` CSS structure already defined.
