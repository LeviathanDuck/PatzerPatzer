# Mini Sprint — Mobile Analysis Usability

Date: 2026-03-21
Status: proposed
Scope: smallest safe mobile-usability pass for the Patzer analysis board, informed by local Lichess mobile analysis behavior

---

## Goal

Make Patzer’s analysis board usable enough on a phone and very narrow browser window that we can:

- load a game
- step through moves
- run Review
- inspect engine output
- reach the underboard game list
- do basic retrospective testing

without doing a broad visual redesign or destabilizing the current review/engine work.

This sprint is intentionally pre-parity.

The target is:

- mobile-usable
- non-destructive
- architecture-friendly

not:

- full Lichess mobile replication
- final UI polish
- major controller rewrites

---

## Why this sprint is needed

Current Patzer analysis is still fundamentally desktop-first.

Relevant current files:

- [src/main.ts](/Users/leftcoast/Development/PatzerPatzer/src/main.ts)
- [src/styles/main.scss](/Users/leftcoast/Development/PatzerPatzer/src/styles/main.scss)
- [src/analyse/pgnExport.ts](/Users/leftcoast/Development/PatzerPatzer/src/analyse/pgnExport.ts)
- [src/ceval/view.ts](/Users/leftcoast/Development/PatzerPatzer/src/ceval/view.ts)
- [src/board/index.ts](/Users/leftcoast/Development/PatzerPatzer/src/board/index.ts)

Key current limitations:

- the main `.analyse` grid is always a two-column desktop layout
- the grid always reserves:
  - a board column
  - a gauge column
  - a tools column with `minmax(240px, 380px)`
- controls live below tools, not directly below the board
- player strips stay visible even on narrow layouts
- the eval gauge is always part of the layout
- the board resize handle is still present in the desktop style
- there is no mobile-specific control bar behavior
- there is no touch-first move scrub behavior
- tools and underboard are not intentionally reordered for portrait mobile

The biggest practical problem is not “styling.”

It is that the current layout is structurally hostile to narrow screens before any component-level tweaks even begin.

---

## Lichess comparison that matters here

Local Lichess sources used as reference:

- [../lichess-source/lila/ui/analyse/css/_layout.scss](/Users/leftcoast/Development/lichess-source/lila/ui/analyse/css/_layout.scss)
- [../lichess-source/lila/ui/analyse/css/_tools-mobile.scss](/Users/leftcoast/Development/lichess-source/lila/ui/analyse/css/_tools-mobile.scss)
- [../lichess-source/lila/ui/analyse/src/view/controls.ts](/Users/leftcoast/Development/lichess-source/lila/ui/analyse/src/view/controls.ts)
- [../lichess-source/lila/ui/analyse/src/view/components.ts](/Users/leftcoast/Development/lichess-source/lila/ui/analyse/src/view/components.ts)
- [../lichess-source/lila/ui/lib/src/device.ts](/Users/leftcoast/Development/lichess-source/lila/ui/lib/src/device.ts)
- [docs/archive/LICHESS_ANALYSIS_BOARD_MOBILE_AUDIT_2026-03-21.md](/Users/leftcoast/Development/PatzerPatzer/docs/archive/LICHESS_ANALYSIS_BOARD_MOBILE_AUDIT_2026-03-21.md)

The important Lichess lessons for this sprint are:

- portrait mobile uses a different layout mode, not just smaller spacing
- low-value chrome gets hidden first
- controls become board-adjacent and touch-friendly
- engine/review access remains first-class on mobile
- underboard stays secondary

We should copy those principles, not all of the final Lichess complexity.

---

## Non-destructive implementation strategy

This sprint should avoid:

- new analysis ownership in `src/main.ts`
- major review/controller rewrites
- changes to engine protocol/state flow
- large new UI systems
- heavy new route work

This sprint should prefer:

- CSS layout mode additions
- small render-order changes in `src/main.ts`
- minimal mobile-only conditionals
- keeping the existing desktop layout intact

That is the safest way to improve usability without tangling mobile work into the higher-risk review architecture work.

---

## Proposed sprint outcome

After this sprint, portrait mobile should behave more like:

1. board
2. controls
3. tools
4. underboard

with:

- hidden eval gauge
- hidden player strips
- larger tap targets
- a compact, reachable Review button
- readable move list
- no forced desktop-side-by-side overflow

This is enough to make mobile testing realistic.

---

## Phase 1 — Mobile Analysis Layout And Controls

### Task 1 — Add a real mobile analysis layout mode

### Diagnosis

Patzer currently defines only one analysis grid in [src/styles/main.scss](/Users/leftcoast/Development/PatzerPatzer/src/styles/main.scss), and it is always desktop-shaped.

That is the primary blocker.

### Small safe step

Add a portrait-mobile layout block in [src/styles/main.scss](/Users/leftcoast/Development/PatzerPatzer/src/styles/main.scss) that changes `.analyse` to a single-column stack at narrow widths.

Recommended first breakpoint:

- start with `max-width: 800px`

This aligns with Lichess’s shared `small` breakpoint and is the least surprising first threshold.

Recommended first stacked order:

1. `board`
2. `controls`
3. `tools`
4. `under`

Do not introduce `side` and extra layout areas yet unless Patzer actually renders them in a mobile-relevant way.

### Why safe

- CSS-only structural change
- desktop layout remains intact
- no engine or controller logic changes

### Files

- [src/styles/main.scss](/Users/leftcoast/Development/PatzerPatzer/src/styles/main.scss)

---

### Task 2 — Hide low-value chrome on mobile

### Diagnosis

Lichess hides optional board-adjacent chrome on `col1`.
Patzer currently keeps too much desktop chrome active for narrow screens.

### Small safe step

On the new mobile layout:

- hide the eval gauge
- hide player strips
- hide or disable the board resize handle
- reduce large board-adjacent spacing

This should be done in CSS first.

### Why safe

- removes clutter without changing core behavior
- improves usable board space immediately
- low regression risk

### Files

- [src/styles/main.scss](/Users/leftcoast/Development/PatzerPatzer/src/styles/main.scss)

---

### Task 3 — Move board navigation and Review into a mobile-friendly control block

### Diagnosis

Patzer’s current controls live below the tools column in [src/main.ts](/Users/leftcoast/Development/PatzerPatzer/src/main.ts), which is fine for desktop but wrong for portrait mobile.

On a phone, the user needs move navigation and Review immediately below the board.

### Small safe step

Keep the current controls data flow, but change layout and light rendering structure so mobile uses a board-adjacent controls block.

Near-term safe version:

- keep the same existing actions:
  - `Prev`
  - `Flip`
  - `Next`
  - `Review`
  - `Mistakes`
- make them larger touch targets
- allow wrapping into two rows
- keep them visually grouped under the board

This does not need a Lichess-style engine-mode tab yet.

### Why safe

- preserves existing button semantics
- improves reachability without controller changes
- avoids mixing mobile work into engine ownership work

### Files

- [src/main.ts](/Users/leftcoast/Development/PatzerPatzer/src/main.ts)
- [src/analyse/pgnExport.ts](/Users/leftcoast/Development/PatzerPatzer/src/analyse/pgnExport.ts)
- [src/styles/main.scss](/Users/leftcoast/Development/PatzerPatzer/src/styles/main.scss)

---

### Task 4 — Make the tools column readable as a mobile stack

### Diagnosis

Patzer’s tools area is structurally modeled after the desktop Lichess column, but it has not been deliberately adapted for portrait mobile.

The biggest mobile need is not more features. It is readable stacking and sane heights.

### Small safe step

For mobile only:

- remove any expectation that tools must match board height
- allow the tools container to size naturally
- keep ceval above PVs
- keep move list scrollable with a bounded mobile height
- keep retro strip below the move list
- keep summary/puzzle content below retro strip

Recommended first mobile ordering:

1. ceval header
2. engine settings
3. PV box
4. move list
5. retro strip
6. summary / puzzle panels

This is simpler than Lichess mobile ordering, but safe and usable.

### Why safe

- mostly CSS
- preserves existing render tree
- avoids complex mode reordering logic too early

### Files

- [src/styles/main.scss](/Users/leftcoast/Development/PatzerPatzer/src/styles/main.scss)
- [src/main.ts](/Users/leftcoast/Development/PatzerPatzer/src/main.ts)

---

### Task 5 — Make underboard truly secondary on mobile

### Diagnosis

The underboard game list and eval graph matter, but on a phone they should come after board interaction and core analysis tools.

Patzer already renders underboard separately in [src/main.ts](/Users/leftcoast/Development/PatzerPatzer/src/main.ts), so this is mostly a layout discipline issue.

### Small safe step

On mobile:

- keep underboard below the tools stack
- reduce padding and gaps
- allow graph and game list to stack cleanly
- ensure horizontal overflow is impossible

Do not redesign the underboard in this sprint.

### Why safe

- keeps the current feature surface
- improves readability without expanding scope

### Files

- [src/styles/main.scss](/Users/leftcoast/Development/PatzerPatzer/src/styles/main.scss)

---

### Task 6 — Add one minimal touch usability improvement

### Diagnosis

Lichess has a rich mobile control rewrite and swipe scrubbing system.
Patzer does not need all of that yet, but it should not remain purely desktop-flavored on touch.

### Small safe step

Pick one:

- Option A: larger buttons plus `touch-action` tuning on controls
- Option B: simple horizontal swipe on the controls row for `prev` / `next`

Recommended for this sprint:

- Option A only

Reason:

- much lower risk
- no gesture-state bugs
- enough to improve testing usability right away

Swipe scrubbing can be a follow-up sprint once the mobile layout itself is stable.

### Why safe

- tiny behavior change
- no dependence on engine or move-tree logic

### Files

- [src/styles/main.scss](/Users/leftcoast/Development/PatzerPatzer/src/styles/main.scss)
- optionally [src/main.ts](/Users/leftcoast/Development/PatzerPatzer/src/main.ts) if a small listener is needed

---

## Explicit non-goals for this sprint

Do not do these in the first mobile sprint:

- full Lichess `displayColumns()` architecture
- phone-landscape `col2-squeeze` parity
- mobile engine-mode tabs
- touch scrub navigation
- full underboard panel/tab system
- study/explorer/mobile mode parity
- polished final visual theme

Those are good later steps, but not the smallest safe mobile-usability step.

---

## Recommended implementation order

1. Add the mobile stacked `.analyse` layout.
2. Hide eval gauge, player strips, and resize handle on mobile.
3. Reposition and enlarge the controls / Review cluster under the board.
4. Relax tools sizing and make the move list usable in the mobile stack.
5. Tidy underboard spacing and overflow.
6. Add one very small touch affordance only if the layout is already stable.

This order keeps the work structural first and avoids polishing broken layout.

---

## Acceptance criteria

The sprint is successful if all of these are true on a phone-sized viewport:

- the board is fully visible without horizontal page overflow
- the analysis page no longer looks like a shrunken desktop grid
- `Prev`, `Next`, `Flip`, `Review`, and `Mistakes` are reachable and tappable
- the Review button remains usable during batch review
- ceval and PVs are visible without collapsing the board area
- the move list is readable and scrollable
- the underboard game list is reachable after scrolling
- no desktop-only chrome wastes major board space

And on desktop:

- the current desktop layout still works
- no review behavior changes intentionally
- no engine behavior changes intentionally

---

## Validation checklist after implementation

Manual checks to run:

1. Load `#/analysis` at a narrow portrait width.
   Expected result: board is first, controls are directly below it, no horizontal overflow.

2. Tap `Prev`, `Next`, and `Flip`.
   Expected result: all buttons are easy to hit and still perform the same actions.

3. Start `Review` on a mobile-sized viewport.
   Expected result: the button remains reachable, progress/status is understandable, layout does not jump badly.

4. Inspect ceval and PV area while review is idle and while it is running.
   Expected result: engine UI remains readable and does not squeeze the board off-screen.

5. Scroll through the move list and then continue to the underboard graph/game list.
   Expected result: move list scroll works and the underboard remains reachable below it.

6. Re-open the same page on desktop width.
   Expected result: existing desktop arrangement still renders normally.

---

## Best follow-up sprint after this one

If this sprint succeeds, the next mobile sprint should be:

- introduce a shared layout-mode helper similar to Lichess `displayColumns()`
- add a mobile-specific controls presentation layer
- consider simple touch scrub navigation
- then revisit mobile review/retro mode parity

That is the point where deeper Lichess-style mobile behavior becomes worth the complexity.

---

## Bottom line

Yes, there are Lichess-inspired mobile ideas we can safely borrow now.

The safest ones are:

- a real portrait-mobile stacked layout
- hiding low-value chrome
- putting controls and Review directly under the board
- making tools readable as a vertical stack

That is enough to make Patzer testable on mobile without dragging the project into a premature UI rewrite.
