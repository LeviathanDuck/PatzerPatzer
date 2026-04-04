# Mini Sprint — Puzzle Page Mobile Usability

Date: 2026-03-28
Status: proposed
Scope: smallest safe mobile-usability pass for the live Patzer puzzle page, informed by the existing analysis mobile sprint and local Lichess puzzle/mobile references

---

## Goal

Make Patzer's current puzzle page usable enough on a phone and narrow browser window that we can:

- browse the puzzle library
- configure an imported puzzle session
- start a puzzle session
- interact with the board
- read feedback and session status
- reach engine, move-list, and puzzle controls

without redesigning the full puzzle product or changing puzzle-solve logic.

This sprint is intentionally not a parity sprint.

The target is:

- mobile-usable
- continuity with Patzer analysis mobile styling
- board-first
- touch-friendly

not:

- final puzzle polish
- controller rewrites
- solve-loop feature expansion
- a desktop redesign

---

## Why this sprint is needed

Current Patzer puzzle UI is still structurally desktop-first.

Relevant current files:

- [src/puzzles/view.ts](/Users/leftcoast/Development/PatzerPatzer/src/puzzles/view.ts)
- [src/styles/main.scss](/Users/leftcoast/Development/PatzerPatzer/src/styles/main.scss)
- [docs/PUZZLE_V1_PLAN.md](/Users/leftcoast/Development/PatzerPatzer/docs/PUZZLE_V1_PLAN.md)
- [docs/mini-sprints/MOBILE_ANALYSIS_USABILITY_SPRINT_2026-03-21.md](/Users/leftcoast/Development/PatzerPatzer/docs/mini-sprints/MOBILE_ANALYSIS_USABILITY_SPRINT_2026-03-21.md)

Key current limitations:

- the puzzle grid mostly collapses to one column, but not with deliberate mobile ordering
- library/sidebar surfaces still assume desktop-height panels and long vertical space
- the imported session builder has desktop-sized density and long scrolling stacks
- the round view still treats:
  - session sidebar
  - engine panel
  - move list
  - feedback/actions
  as desktop side surfaces rather than a mobile flow
- buttons and control groupings are not deliberately touch-first
- mobile continuity with the analysis board is weak

The biggest blocker is not isolated spacing.

It is that the current puzzle page has no real mobile layout mode for either:

- library flow
- round flow

---

## Lichess and Patzer continuity references that matter here

Patzer continuity reference:

- [docs/mini-sprints/MOBILE_ANALYSIS_USABILITY_SPRINT_2026-03-21.md](/Users/leftcoast/Development/PatzerPatzer/docs/mini-sprints/MOBILE_ANALYSIS_USABILITY_SPRINT_2026-03-21.md)

Mandatory puzzle/mobile references:

- [docs/reference/lichess-puzzle-ux/README.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/README.md)
- [docs/reference/lichess-puzzle-ux/BOARD_AND_INTERACTION_MODEL.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/BOARD_AND_INTERACTION_MODEL.md)
- [docs/reference/lichess-puzzle-ux/FILTERS_THEMES_AND_SELECTION.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/FILTERS_THEMES_AND_SELECTION.md)
- [docs/reference/lichess-puzzle-ux/sources/ui/puzzle/css/_page.scss](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/puzzle/css/_page.scss)
- [docs/reference/lichess-puzzle-ux/sources/ui/puzzle/src/view/main.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/puzzle/src/view/main.ts)

Important continuity lessons:

- mobile needs its own layout mode, not just smaller spacing
- the board remains primary
- core actions must sit close to the board
- filters and selection must stay reachable on narrow screens
- low-value chrome should compress first
- Patzer should visually feel like the same product as mobile analysis where possible

---

## Non-destructive implementation strategy

This sprint should avoid:

- solve-loop changes
- new engine logic
- new persistence behavior
- route changes
- broad puzzle UX redesign

This sprint should prefer:

- mobile-specific CSS and ordering rules
- small rendering-order adjustments in [src/puzzles/view.ts](/Users/leftcoast/Development/PatzerPatzer/src/puzzles/view.ts)
- keeping desktop puzzle layout intact
- matching the analysis mobile sprint's "board first, tools second" philosophy

That is the safest way to improve puzzle usability without turning mobile work into product rewrites.

---

## Proposed sprint outcome

After this sprint, portrait mobile should behave more like:

### Puzzle library

1. source/library pane
2. board
3. imported session builder controls in readable stacked blocks

### Puzzle round

1. board
2. immediate puzzle feedback and actions
3. engine and move-list surfaces
4. session status and history
5. secondary metadata

with:

- larger tap targets
- condensed spacing
- fewer desktop-height assumptions
- readable stacked sections
- continuity with the analysis mobile pass

---

## Phase 1 — Mobile Puzzle Layout And Flow

### Task 1 — Add a real mobile puzzle layout mode

### Diagnosis

The current puzzle mobile rule in [src/styles/main.scss](/Users/leftcoast/Development/PatzerPatzer/src/styles/main.scss) only collapses the grid to one column.

That is not enough.

It does not define a deliberate mobile layout for:

- `.puzzle--library`
- `.puzzle--with-session`
- board-first ordering
- side-surface stacking

### Small safe step

Add a real mobile layout block at a narrow breakpoint, starting with:

- `max-width: 800px`

for both library and round variants so the page has intentional ordering rather than generic collapse.

Keep desktop layout untouched.

### Why safe

- mostly CSS structural work
- no solve-state changes
- preserves current desktop behavior

### Files

- [src/styles/main.scss](/Users/leftcoast/Development/PatzerPatzer/src/styles/main.scss)

---

### Task 2 — Make the puzzle library and imported-session builder usable on mobile

### Diagnosis

The imported-session builder is one of the densest surfaces on the puzzle page.

On mobile it currently risks:

- deep vertical scrolling
- crowded theme/opening selectors
- weak start-session affordance
- desktop-sized control density

### Small safe step

For mobile only:

- stack the imported-session builder as a readable card flow
- keep the start action obvious and reachable
- reduce density in rating controls, tabs, and theme/opening lists
- make the source/library sidebar feel like a primary mobile surface rather than a desktop aside

### Why safe

- view/CSS work only
- no changes to imported-session logic
- directly improves the first-touch puzzle workflow

### Files

- [src/puzzles/view.ts](/Users/leftcoast/Development/PatzerPatzer/src/puzzles/view.ts)
- [src/styles/main.scss](/Users/leftcoast/Development/PatzerPatzer/src/styles/main.scss)

---

### Task 3 — Make puzzle feedback and core actions board-adjacent on mobile

### Diagnosis

On mobile, the user needs immediate access to:

- feedback state
- next/retry/skip/hint controls
- any visible engine reveal controls

The current round layout still treats feedback as one side-panel region among several.

### Small safe step

Reorder or restack the mobile round layout so feedback/actions appear directly below the board, ahead of lower-priority side content.

Keep desktop ordering intact.

### Why safe

- layout and render-order adjustment only
- no puzzle-result logic changes
- aligns with the same board-adjacent control principle used in the analysis mobile sprint

### Files

- [src/puzzles/view.ts](/Users/leftcoast/Development/PatzerPatzer/src/puzzles/view.ts)
- [src/styles/main.scss](/Users/leftcoast/Development/PatzerPatzer/src/styles/main.scss)

---

### Task 4 — Make engine, move list, and session surfaces readable as a mobile stack

### Diagnosis

The live puzzle round contains several side surfaces that matter on mobile:

- engine panel
- move list
- session info
- session history

Right now they are mostly desktop cards living in a collapsed single-column layout.

### Small safe step

For mobile only:

- remove desktop height assumptions
- make these surfaces stack in a clear priority order
- ensure move list stays readable and scrollable
- keep engine information available without dominating the screen
- make session history/status visible but secondary to active solving

### Why safe

- primarily CSS with light view ordering if needed
- no controller changes
- directly improves readability of already-built surfaces

### Files

- [src/puzzles/view.ts](/Users/leftcoast/Development/PatzerPatzer/src/puzzles/view.ts)
- [src/styles/main.scss](/Users/leftcoast/Development/PatzerPatzer/src/styles/main.scss)

---

### Task 5 — Add one minimal touch/mobile polish pass for continuity

### Diagnosis

Even after stacking is fixed, the page will still feel rough if:

- tap targets stay too small
- spacing remains desktop-tight
- button groups wrap poorly
- section rhythm differs sharply from Patzer mobile analysis

### Small safe step

Add one small continuity pass focused on:

- touch-target sizing
- wrapped action groups
- spacing rhythm
- mobile-only readability polish

This should be the smallest step that makes the page feel intentionally mobile rather than merely collapsed.

### Why safe

- no product-logic change
- low regression risk
- good final polish step for the sprint

### Files

- [src/styles/main.scss](/Users/leftcoast/Development/PatzerPatzer/src/styles/main.scss)
- [src/puzzles/view.ts](/Users/leftcoast/Development/PatzerPatzer/src/puzzles/view.ts) if one or two extra hooks are needed

---

## Recommended prompt execution order

1. `CCP-204` — Add real mobile puzzle layout mode
2. `CCP-205` — Make library/import builder usable on mobile
3. `CCP-206` — Move feedback/actions board-adjacent on mobile
4. `CCP-207` — Make engine/move/session surfaces readable as a mobile stack
5. `CCP-208` — Add one small touch/mobile polish pass
6. `CCP-209` — Manager prompt for the full batch

The manager prompt should execute the runnable task prompts in the order above.
