# Lichess Analysis Board Mobile / Narrow-Width Audit

Date: 2026-03-21
Scope: exhaustive code-level audit of how Lichess handles the analysis board on mobile devices and extremely narrow browser windows, using the local Lichess source tree

---

## What this document is

This document explains how Lichess handles the analysis board when the viewport is:

- portrait mobile
- phone landscape
- narrow desktop windows
- medium two-column windows
- full desktop width

It focuses on:

- exactly which layout mode is active
- which elements move where
- which elements are hidden or reshaped
- which interactions change on touch/mobile
- which analysis sub-panels remain first-class on narrow widths

This is not a design critique. It is a source-grounded behavior reference for Patzer Pro.

---

## Local Lichess sources inspected

Primary analysis layout and rendering:

- `../lichess-source/lila/ui/analyse/src/view/main.ts`
- `../lichess-source/lila/ui/analyse/src/view/components.ts`
- `../lichess-source/lila/ui/analyse/src/view/tools.ts`
- `../lichess-source/lila/ui/analyse/src/view/controls.ts`
- `../lichess-source/lila/ui/analyse/src/view/roundTraining.ts`
- `../lichess-source/lila/ui/analyse/src/practice/practiceView.ts`
- `../lichess-source/lila/ui/analyse/src/retrospect/retroView.ts`

Primary analysis styling:

- `../lichess-source/lila/ui/analyse/css/_analyse.base.scss`
- `../lichess-source/lila/ui/analyse/css/_layout.scss`
- `../lichess-source/lila/ui/analyse/css/_tools.scss`
- `../lichess-source/lila/ui/analyse/css/_tools-mobile.scss`
- `../lichess-source/lila/ui/analyse/css/_round-underboard.scss`
- `../lichess-source/lila/ui/analyse/css/_round-training.scss`
- `../lichess-source/lila/ui/analyse/css/_training.scss`
- `../lichess-source/lila/ui/analyse/css/_practice.scss`
- `../lichess-source/lila/ui/analyse/css/_retro.scss`
- `../lichess-source/lila/ui/analyse/css/practice/_layout.scss`
- `../lichess-source/lila/ui/analyse/css/practice/_underboard.scss`
- `../lichess-source/lila/ui/analyse/css/_side.scss`
- `../lichess-source/lila/ui/analyse/css/_player-clock.scss`
- `../lichess-source/lila/ui/analyse/css/_fork.scss`

Shared device, breakpoint, and board/layout support:

- `../lichess-source/lila/ui/lib/src/device.ts`
- `../lichess-source/lila/ui/lib/css/abstract/_media-queries.scss`
- `../lichess-source/lila/ui/lib/css/abstract/_variables.scss`
- `../lichess-source/lila/ui/lib/css/layout/_vars.scss`
- `../lichess-source/lila/ui/lib/css/layout/_uniboard.scss`
- `../lichess-source/lila/ui/lib/css/ceval/_eval-gauge.scss`
- `../lichess-source/lila/ui/lib/css/ceval/_pv.scss`

Public upstream reference:

- [Lichess lila repository](https://github.com/lichess-org/lila)

---

## Executive summary

Lichess does not implement the analysis board as a desktop page with a few mobile overrides.

It implements analysis responsiveness as a coordinated system made of:

- CSS-defined layout modes
- a runtime `displayColumns()` helper that reads the active CSS mode
- touch-device behavior changes on top of those modes
- analysis-mode-specific control rewriting on `col1`

The important implementation pattern is:

- CSS decides the structural layout mode
- TypeScript reads that mode
- TypeScript only adds device-specific behavior where interaction actually differs

This is why Lichess mobile analysis feels deliberate instead of merely compressed.

---

## Exact breakpoint model

Lichess defines shared layout thresholds in `ui/lib/css/abstract/_variables.scss`:

- `$small: 800px`
- `$x-large: 1260px`
- `$tall: 600px`
- `$xx-small: 500px`
- `$xxx-small: 400px`

The shared media-query mixins in `ui/lib/css/abstract/_media-queries.scss` are:

- `mq-is-col1`
  - `max-width: at-most($small)` and `orientation: portrait`
- `mq-at-least-col2`
  - `min-width: at-least($small)` or `orientation: landscape`
- `mq-is-col2-squeeze`
  - `max-width: at-most($small)` and `orientation: landscape`
- `mq-at-least-col3`
  - `min-width: at-least($x-large)`

The active column count is written into CSS in `ui/lib/css/layout/_vars.scss`:

- body gets `---display-columns: 1` in `col1`
- body gets `---display-columns: 2` in `col2`
- body gets `---display-columns: 3` in `col3`

Then `displayColumns()` in `ui/lib/src/device.ts` reads `document.body` computed style and returns `1`, `2`, or `3`.

Important implication:

- Lichess does not treat “mobile” as identical to “small width”
- phone landscape is generally promoted to the `col2` family because `mq-at-least-col2` includes `orientation: landscape`

That means:

- portrait phone => `col1`
- phone landscape => `col2-squeeze`
- medium desktop/tablet => `col2`
- wide desktop => `col3`

This is one of the most important architecture lessons in the whole audit.

---

## Core layout shell

The main analysis page is a CSS grid in `ui/analyse/css/_layout.scss`.

The major grid areas are:

- `board`
- `controls`
- `kb-move`
- `tools`
- `side`
- `round-training`
- `under`
- `chat`
- `uchat`
- `gauge`

Lichess does not merely restyle these areas between widths. It rearranges the whole page template.

---

## `col1`: portrait mobile / single-column analysis

### Grid shape

In `col1`, `.analyse` uses:

- `grid-template-rows: auto auto auto minmax(20em, 40vh)`
- grid areas:
  - `board`
  - `controls`
  - `kb-move`
  - `tools`
  - `side`
  - `round-training`
  - `under`
  - `chat`
  - `uchat`

Read in order, the page stacks as:

1. board
2. controls
3. keyboard-move area
4. tools
5. side panel
6. round-training block
7. underboard panels
8. chat
9. chat members

### What is hidden on `col1`

In `_layout.scss` and related shared styles:

- `.eval-gauge` is hidden
- `.keyboard-move` is hidden
- floating player strips are hidden in `_player-clock.scss`

The player-strip comment in source is revealing:

- Lichess explicitly says it hides them in `col1` because showing them would move the whole board and controls down “for little benefit”

That is a strong signal that Lichess prioritizes board compactness over parity with desktop chrome.

### Board treatment on `col1`

From `ui/lib/css/layout/_uniboard.scss`:

- `.main-board cg-board` loses border radius on `col1`

This is a subtle mobile optimization:

- the board becomes visually edge-to-edge instead of looking like a desktop card squeezed into a phone column

### Tools area on `col1`

The tools section gets meaningful vertical presence instead of being collapsed to almost nothing:

- the tools row is part of `minmax(20em, 40vh)`
- move list area remains scrollable
- mobile-specific ordering is applied in `_tools-mobile.scss`

Mobile ordering on `col1`:

- `.sub-box` items get `order: 0`
- `.ceval`, `.pv_box`, `.analyse__fork`, `.gamebook-edit` get `order: 1`
- `.analyse__moves` gets `order: 2`

Practical effect:

- transient or mode-specific panels can appear above the move list
- the move list remains present, but is not always the first thing in the tools stack

This matters because Lichess treats active mode content as more important than preserving one fixed tool order.

### Ceval simplification on `col1`

In `_tools-mobile.scss`:

- `.ceval .cmn-toggle` is hidden
- `.ceval pearl` is hidden
- engine area gets left margin tuning

In `controls.ts`, Lichess moves engine-mode access into the mobile control bar instead of relying on the larger desktop ceval controls.

So on mobile, the ceval box is simplified and the primary engine-mode affordance moves into the bottom board control row.

### PV line treatment on `col1`

From `ui/lib/css/ceval/_pv.scss`:

- `.pv_box` gets mobile-specific background and horizontal padding
- `.pv` font size increases
- PV right-side wrap toggle gets tighter padding

This is important because Lichess does not hide PVs by default on mobile. It reformats them to remain usable.

### Underboard on `col1`

The underboard block stays below round-training and side content.

In `_round-underboard.scss`:

- panel height defaults to `30vh` on `col1`
- only the active underboard panel is displayed
- FEN/PGN panel becomes vertically scrollable

In `_layout.scss`:

- `.analyse__underboard` gets `overflow: hidden` on `col1`

That comment says this helps truncate long study names, which means Lichess is intentionally containing overflow pressure in the mobile stack.

### Round-training / advice summary on `col1`

In `_round-training.scss`:

- `.advice-summary` changes to `row wrap`
- it centers content
- it adds bottom padding and border
- each side takes roughly half width
- the learn-from-mistakes button is reordered after the side summaries

This means advice summary on mobile is not a tall two-block column. It becomes a wrapped summary strip.

### Practice / retro feedback on `col1`

In `_training.scss`:

- `.feedback.view` and `.feedback.win` switch to row layout on `col1`

This is a narrow-screen optimization:

- success/solution states compress horizontally instead of eating too much vertical height

### Inputs on mobile

From `renderInputs()` in `components.ts`:

- PGN import commits on `focusout` for mobile
- Enter-to-submit is not relied on when `isMobile()`

That is a small but important mobile UX adaptation.

---

## `col2`: two-column analysis

### Grid shape

In `_layout.scss`, `col2` uses:

- columns:
  - board width variable
  - gap
  - tools/table width
- areas:
  - `board gauge tools`
  - `kb-move . controls`
  - `under . controls`
  - `under . round-training`
  - `under . side`
  - `chat . side`
  - `uchat . side`

This is not a light desktop mode. It is a distinct layout:

- board and tools sit side by side
- controls move into the right column under tools
- underboard returns beneath the board column
- side content drops under the right-side stack

### What returns in `col2`

Compared with `col1`:

- eval gauge becomes visible
- keyboard-move area becomes visible
- floating player strips are no longer forcibly hidden

### `col2-squeeze`

Lichess has an explicit `mq-is-col2-squeeze` mode:

- same grid relationships as `col2`
- narrower width variables

This is usually the “phone landscape / narrow landscape” case.

Important implementation lesson:

- Lichess does not collapse directly from desktop to stacked mobile
- it has an intermediate squeezed-two-column state for landscape narrow screens

---

## `col3`: wide desktop analysis

In `_layout.scss`, `col3` uses:

- side/chat on the left
- board in the center
- gauge between board and tools
- tools on the right
- controls below tools
- underboard below board
- round-training below tools/controls region

Grid areas:

- `side . board gauge tools`
- `chat . board gauge tools`
- `uchat . kb-move . controls`
- `uchat . under . controls`
- `uchat . under . round-training`

This is the fully expanded analysis page.

On `col3`, chat height is additionally normalized by runtime logic in `view/main.ts`.

---

## Device and interaction model

Lichess uses both:

- `displayColumns()`
- touch/mobile helpers from `device.ts`

These are not interchangeable.

### What counts as mobile UI for controls

In `controls.ts`:

- `isMobileUi()` is `displayColumns() === 1 && isTouchDevice()`

That means:

- a narrow portrait touch device gets mobile control behavior
- a narrow non-touch browser window does not necessarily get the same interaction model

This distinction is very intentional.

### Wheel behavior

In `renderBoard()`:

- mouse-wheel move navigation is only attached when there is no touch support and the `scrollMoves` preference is enabled

So touch environments do not get wheel move stepping bound to the board.

### Touch scrub behavior

In `controls.ts`, the control bar gets pointer listeners:

- `click`
- `hold`
- `hscrub` on touch devices only

On touch/mobile:

- swiping left/right on the controls bar scrubs through moves
- slow movement steps move-by-move
- release velocity can jump to start or end
- a scrub-help icon appears until acknowledged
- acknowledgement is persisted in `localStorage`

This is a major part of Lichess mobile analysis UX. It is not decorative.

Lichess replaces some lost hover/precision affordances with a dedicated gesture on the control row.

---

## Control bar behavior by width

### Desktop-ish behavior

Normally the analysis control row contains:

- jump controls
- opening explorer button when allowed
- menu button
- practice button in certain cases

### Mobile `col1` behavior

On `displayColumns() === 1`:

- if ceval is allowed, Lichess renders a special mobile engine-mode tab
- jump buttons remain central
- first/last buttons are hidden on mobile UI unless study-practice mode
- scrub-help icon may appear between prev/next

In `_tools-mobile.scss`, the control bar is heavily restyled:

- `padding-top: 6px`
- `height: 5rem`
- `touch-action: pan-y`
- buttons become wider tab-like units
- jump cluster gets its own width rules
- active mode buttons show special iconography

This is not a compressed desktop button row. It is a mobile-specific control surface.

### Mobile engine-mode tab

`renderMobileCevalTab()` in `controls.ts` can represent:

- `ceval`
- `practice`
- `retro`

It can show:

- a compact eval string
- ceval toggle switch
- computing state bar
- retro completion count

That means mobile analysis has a single compact “engine mode” affordance instead of trying to expose the full desktop ceval strip.

This is a very important design choice for Patzer:

- mobile does not remove engine/review/practice access
- it condenses mode switching into one first-class control slot

---

## Tools stack behavior

### Render order in the tools region

From `view/tools.ts`, tools region can contain:

1. embedded video
2. ceval
3. ceval PVs
4. move list
5. gamebook edit
6. back-to-live view
7. fork view
8. one of:
   - retrospect view
   - explorer view
   - practice view
9. action menu

This is important because only one of retro/explorer/practice occupies the mode-specific panel slot at a time.

### What changes on mobile

The CSS mobile ordering in `_tools-mobile.scss` deliberately reorders these blocks.

Also:

- when active mode is `practice`, `.analyse__tools .ceval` moves to order `0`
- `.analyse[data-active-mode='practice'] .analyse__fork` is hidden
- `.analyse[data-active-mode='retro'] .analyse__fork` is hidden
- active tool/mode states add border and radius changes to the tools container

This shows that Lichess mobile analysis uses mode-driven tools reshaping, not just mode-driven content rendering.

---

## Move list behavior on narrow widths

From `_tools.scss`:

- `.analyse__moves` is a flex column
- it is scrollable vertically
- overflow-x is hidden

On narrow/mobile:

- move list remains in tools, not under the board
- it is not promoted above the board controls
- it competes with other tools/modes inside the same tools region

This reveals a Lichess priority order:

- board first
- board-adjacent controls second
- analysis panes third

Lichess does not make the move list the primary underboard mobile view the way some chess UIs do.

---

## Eval gauge behavior

From `_layout.scss` and `ui/lib/css/ceval/_eval-gauge.scss`:

- eval gauge is hidden on `col1`
- it is shown from `col2` upward
- width is just the block gap
- it sits as its own dedicated grid area

This is consistent with the general Lichess rule:

- mobile drops thin, low-touch-target chrome first
- it preserves board and control affordances before preserving side instrumentation

---

## Keyboard move area

In `_layout.scss`:

- keyboard move block is hidden by default
- visible from `col2` upward
- gets a dedicated grid area and margin in wider layouts

So keyboard-move entry is treated as a medium-plus feature, not a mobile-first control.

---

## Side panel behavior

`analyse__side` remains part of the layout in all modes, but its position changes:

- in `col1` it comes after tools
- in `col2` it lives in the lower right column
- in `col3` it becomes the left-side area

In `_side.scss`:

- side content aligns to start
- wiki content is scrollable
- wiki mode changes flex behavior

Important practical point:

- Lichess does not suppress the side area entirely on narrow layouts
- it demotes it lower in the stack instead

That is a measured compromise between feature retention and board priority.

---

## Player bars, strips, and board-adjacent metadata

From `view/components.ts`:

- the board may render player strips or player bars depending on context
- `needsInnerCoords` depends on captured pieces, gauge, or player bars

From `_player-clock.scss`:

- floating player strips are absolutely positioned above/below the board
- they are entirely hidden on `col1`

This is another example of Lichess removing optional board-adjacent chrome on narrow portrait layouts to protect board vertical space.

---

## Underboard behavior in detail

### Underboard menu and panels

In `_round-underboard.scss`:

- underboard has a tab/menu row
- each button flexes evenly
- active tab gets accent border
- panel height is variable by width mode

Panel height:

- `30vh` on `col1`
- `240px` from `col2` upward

This is a very concrete responsive decision:

- mobile panel height is viewport-relative
- wider layouts use fixed-height panels

### What underboard contains

The underboard area can include:

- computer analysis request / analysis content
- charts
- crosstable
- FEN / PGN copyables
- future-game-analysis message

The underboard region is not moved into the main mobile control bar. It stays a lower, secondary analysis region.

### Practice underboard styling

In `practice/_underboard.scss`:

- `.feedback` becomes a boxed block
- win/fail states are high-contrast and animated
- ongoing state is left-aligned and vertical
- comment content can span full width

This is a good example of mode-specific underboard UI reusing the same broader layout slots.

---

## Round-training and learn-from-mistakes behavior

From `view/roundTraining.ts`, Lichess renders:

- advice summary per color
- ACPL
- accuracy
- learn-from-your-mistakes button when not in study mode
- recommended puzzle link when available

This block lives in `analyse__round-training`.

On narrow/mobile:

- the advice summary wraps into two half-width side summaries
- the button is visually integrated into that compact wrapped layout

This is important because Lichess does not force “learn from mistakes” to open a separate page affordance on mobile. It remains part of the analysis page structure.

---

## Practice and retrospect boxes

### Practice view

From `practiceView.ts` and `_practice.scss`:

- practice feedback uses a fixed-height box feel
- verdict colors are strong and semantic
- comment row can show best-move links and hint actions

### Retrospect view

From `retroView.ts` and `_retro.scss`:

- retrospection renders as `retro-box training-box sub-box`
- title includes progress count and a close button
- feedback states include:
  - `find`
  - `offTrack`
  - `fail`
  - `win`
  - `view`
  - `eval`
  - `end`

Retrospect is not implemented as a separate responsive page. It is one of the mode panels inside the tools region.

That is a major layout lesson:

- Lichess keeps learn/practice/review in the same responsive shell
- it swaps the active tools-mode panel rather than jumping to a radically different page layout

---

## Practice-specific analysis layout

In `ui/analyse/css/practice/_layout.scss`, Lichess adjusts the main analysis grid when practice mode owns the page.

Practice layout differs from normal analysis:

- in single-column practice:
  - `board`
  - `controls`
  - `kb-move`
  - `under`
  - `tools`
  - `side`
- `analyse__acpl` is hidden

At `col2`:

- `board gauge tools`
- `under . controls`
- `side . kb-move`

At `col3`:

- `side . board gauge tools`
- `. . under . controls`
- `. . kb-move . controls`

Important conclusion:

- Lichess is willing to alter the grid template for special analysis modes
- it does not insist on one rigid layout for every analysis-related submode

---

## Main runtime layout coordination

From `view/main.ts`:

- analysis redraws on resize when `displayColumns()` changes
- chat height is fixed only when not in study and columns are at least `3`

This means:

- layout mode changes are treated as a semantic transition, not merely passive CSS changes
- some JS behavior reacts specifically to column-count changes

Again, Lichess treats layout mode as application state, not just styling.

---

## Exact behavior answers

### Where do the main elements go on portrait mobile?

- board at top
- control bar directly below board
- tools stack below controls
- side content below tools
- round-training below side
- underboard below round-training
- chat below that

Hidden or simplified:

- eval gauge hidden
- keyboard move hidden
- floating player strips hidden
- ceval controls simplified
- control bar rewritten for mobile interaction

### What happens on phone landscape or very narrow landscape?

- Lichess generally enters the `col2` family because landscape counts toward `mq-at-least-col2`
- if width is still under the small breakpoint, it uses `col2-squeeze`
- board and tools become side-by-side again
- gauge returns
- keyboard move returns
- underboard moves back under the board column

### What happens to move navigation on touch/mobile?

- wheel scrolling is not used
- control bar gets swipe scrubbing
- mobile may hide first/last buttons
- help affordance explains scrubbing
- hold still supports repeated prev/next stepping

### What happens to engine/review/practice access on mobile?

- it is not removed
- it is condensed into the mobile engine-mode control tab
- retro/practice/explorer still render as first-class tools-region panels

### Does Lichess move everything under the board on mobile?

- no
- it keeps a board-first vertical stack
- tools remain their own section
- underboard remains a later, secondary section

That is a very important non-obvious design choice.

---

## Structural lessons for Patzer Pro

### 1. Base responsive behavior on layout modes, not ad hoc width checks

Lichess’s strongest pattern is:

- CSS owns the mode
- TS reads the mode
- UI logic branches on the mode only where needed

Patzer should imitate this pattern rather than scattering viewport checks through unrelated modules.

### 2. Treat portrait mobile and phone landscape differently

Lichess does not collapse all phones into one layout.

This is especially important for chess because:

- landscape can support side-by-side board/tools
- portrait usually cannot

### 3. Rewrite the control bar for mobile instead of shrinking desktop controls

This is one of the clearest places where Lichess is more mature than many chess UIs.

It uses:

- bigger tap targets
- simplified mode tabs
- gesture-based navigation

### 4. Hide low-value board chrome on `col1`

Lichess drops:

- eval gauge
- keyboard move
- floating player strips

It protects:

- board size
- immediate board controls
- core engine/review mode access

### 5. Keep analysis modes inside one responsive shell

Practice, retrospect, explorer, and regular analysis all stay inside the same overall layout model.

That is better than building separate pages with separate mobile behavior for each mode.

### 6. Preserve a board-first priority order

On narrow layouts, Lichess consistently prioritizes:

1. board
2. immediate controls
3. active tool/mode content
4. secondary analysis blocks

That priority order is visible across the entire implementation.

---

## Bottom-line assessment

Lichess mobile analysis is strong because it is not merely responsive styling.

It is a coordinated system where:

- layout is mode-driven
- mobile interaction is intentionally different
- active analysis modes remain first-class
- optional chrome is removed before core analysis affordances are removed

The single most important insight for Patzer Pro is this:

Lichess does not try to preserve the desktop analysis arrangement on portrait mobile. It preserves the analysis workflow while changing the structure.

That is the model worth following.
