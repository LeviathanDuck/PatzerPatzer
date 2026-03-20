# Patzer Pro — Analysis Board UI Audit

Date: 2026-03-20
Scope: current Patzer Pro analysis-board interface, interaction model, and visual/layout behavior compared against the Lichess analysis board page

---

## What this audit covers

This document compares the current Patzer Pro analysis board UI against the Lichess analysis board in terms of:

- layout structure
- interaction model
- board controls
- move list behavior
- ceval / PV presentation
- underboard workflow
- overall UX coherence

This is a UI and interaction audit, not a pixel-perfect stylesheet diff.

---

## Primary local implementation points

The current Patzer Pro analysis-board UI is mainly composed in:

- `src/main.ts`
  - overall analysis page layout
  - route rendering
  - navigation controls placement
- `src/board/index.ts`
  - board rendering
  - move input
  - promotion overlay
  - player strips
- `src/ceval/view.ts`
  - engine header
  - PV lines
  - floating PV preview board
  - engine settings panel
- `src/analyse/moveList.ts`
  - move tree rendering
- `src/analyse/evalView.ts`
  - eval bar
  - eval graph
  - analysis summary
- `src/analyse/pgnExport.ts`
  - underboard review/export controls
- `src/styles/main.scss`
  - analysis grid layout
  - ceval, graph, move list, and underboard styling
- `src/header/index.ts`
  - top navigation and global settings / import surface

---

## Relevant Lichess systems

The most relevant Lichess source areas for this comparison are:

- `ui/analyse/src/view/main.ts`
- `ui/analyse/src/view/controls.ts`
- `ui/analyse/src/view/components.ts`
- `ui/analyse/css/_layout.scss`
- `ui/analyse/css/_tools.scss`
- `ui/lib/src/ceval/view/main.ts`
- `ui/lib/src/ceval/view/settings.ts`
- `ui/lib/css/ceval/_ctrl.scss`
- `ui/lib/css/ceval/_pv.scss`
- `ui/lib/css/ceval/_eval-gauge.scss`

Reference links:

- [Lichess lila repository](https://github.com/lichess-org/lila)
- [analyse view main](https://github.com/lichess-org/lila/blob/master/ui/analyse/src/view/main.ts)
- [analyse controls](https://github.com/lichess-org/lila/blob/master/ui/analyse/src/view/controls.ts)
- [analyse components](https://github.com/lichess-org/lila/blob/master/ui/analyse/src/view/components.ts)
- [analyse layout css](https://github.com/lichess-org/lila/blob/master/ui/analyse/css/_layout.scss)
- [analyse tools css](https://github.com/lichess-org/lila/blob/master/ui/analyse/css/_tools.scss)
- [ceval main view](https://github.com/lichess-org/lila/blob/master/ui/lib/src/ceval/view/main.ts)
- [ceval settings](https://github.com/lichess-org/lila/blob/master/ui/lib/src/ceval/view/settings.ts)
- [ceval controls css](https://github.com/lichess-org/lila/blob/master/ui/lib/css/ceval/_ctrl.scss)
- [ceval PV css](https://github.com/lichess-org/lila/blob/master/ui/lib/css/ceval/_pv.scss)
- [eval gauge css](https://github.com/lichess-org/lila/blob/master/ui/lib/css/ceval/_eval-gauge.scss)

---

## Current Patzer Pro analysis-board structure

The main analysis page in `src/main.ts` currently renders:

- board column
- eval gauge column
- tools column
- controls row
- underboard section

That is the correct macro-level shape and is clearly inspired by the Lichess analysis page.

The current visible pieces are:

- board with top and bottom player strips
- vertical eval bar beside the board
- ceval header with engine toggle and settings
- PV lines box
- scrollable move list
- accuracy / summary panel
- puzzle candidate area
- a small navigation row with `Prev`, `Flip`, `Next`
- underboard eval graph and review/export controls
- game list beneath the board

This is a serious analysis page, not a toy board.

---

## Where Patzer Pro matches Lichess well

### 1. The top-level board layout is directionally right

Patzer Pro correctly uses the familiar analysis split:

- board
- gauge
- tools
- controls
- underboard

This is the most important Lichess alignment at layout level, and it is already present.

### 2. Board ownership is solid

`src/board/index.ts` owns:

- Chessground lifecycle
- legal move destinations
- move input
- variation creation
- promotion overlay
- orientation
- player strips

This is much closer to Lichess than ad hoc DOM-driven board code would be.

### 3. Ceval presentation is meaningfully Lichess-inspired

Patzer Pro already has:

- engine toggle
- pearl-style eval number
- engine status text
- settings gear
- PV rows
- hoverable PV moves
- floating PV preview board

That is a good and ambitious amount of ceval UI for the current stage of the app.

### 4. The move list is using the right tree-view mental model

The move list is not a flat SAN log. It is a column-style move-tree presentation with:

- move-number indexing
- variation interruption blocks
- active move highlighting
- engine-derived move labels

That is the correct direction for a Lichess-style analysis board.

### 5. The underboard graph belongs here

Putting the eval graph under the board is the correct analysis-board placement. It keeps graph review close to navigation and board context.

---

## Where Patzer Pro diverges from Lichess in important UI ways

### 1. The page still feels composed from subsystems rather than from one coherent board experience

Patzer Pro has the right pieces, but they still feel slightly assembled rather than fully integrated.

Examples:

- navigation controls are isolated from review controls
- review controls live underboard instead of feeling like core board controls
- puzzle candidate UI sits in the same tools stack as ceval and move list
- games list sits beneath the board, which competes with graph/review space

Lichess is stronger at making all these elements feel like one board-centric workflow.

### 2. The control hierarchy is still awkward

In Patzer Pro:

- engine controls live in ceval
- navigation controls live below tools
- review/export controls live under the board
- board settings live in the global header menu

This spreads board-related interaction across too many zones.

The result is that the user has to remember:

- where engine settings are
- where navigation is
- where review is
- where board settings are

Lichess is better at making the board controls feel like one family, even when they are distributed across the page.

### 3. The underboard section is overloaded

Patzer Pro underboard currently mixes:

- eval graph
- review/export controls
- game list

That means one region is trying to be:

- chart area
- action area
- library area

This weakens the board-review focus.

Lichess analysis underboard space is more disciplined. Patzer Pro currently asks that region to do too many jobs.

### 4. The Games list competes with the analysis board

Having a game list directly under the board is useful, but it also causes two problems:

- it increases page vertical density around the core analysis workflow
- it visually competes with graph/review information

This is practical during development, but it is not yet as clean as Lichess's board-first analysis posture.

### 5. The review action is visually underpowered

The `Review` button is important product behavior, but it lives in a modest underboard utility block beside PGN export.

That undersells one of the app's main value propositions.

If the product is meant to be centered on game review, the interface should communicate that more clearly.

### 6. The move navigation row is still too bare

`Prev`, `Flip`, and `Next` are useful, but the current controls row still feels transitional.

It does not yet feel like a polished analysis-control strip with:

- richer board-mode actions
- consistent control grouping
- stronger review affordances

### 7. Some interactions are present but not yet trustworthy

A Lichess-like analysis board is not just about rendering the controls. It is about the controls always matching the current position.

Patzer Pro still has known trust gaps around:

- wheel navigation
- graph scrub behavior
- played-arrow behavior in side lines
- live engine refresh after variation creation

So some UI parity exists in appearance before it exists in reliability.

---

## Board interaction audit

### Move input and variation creation

This is one of Patzer Pro's strongest areas.

The board supports:

- legal move entry through Chessground
- castling normalization
- promotion dialog
- following existing children when a move already exists
- creating a new variation when it does not

That is strongly aligned with what an analysis board should do.

### Orientation and player strips

The app correctly tracks board orientation and renders player strips with:

- player names
- ratings
- result badge
- material imbalance
- clocks when available

This is a thoughtful analysis-board feature set and clearly modeled on Lichess patterns.

### Wheel and keyboard navigation

The presence of wheel and keyboard navigation is good.

The problem is reliability:

- wheel navigation is currently broken by the selector mismatch
- keyboard navigation exists, but some variation navigation paths are still in the "works, but still brittle" category

This is a case where parity exists at feature level but not yet at trust level.

---

## Ceval / PV UI audit

### Strengths

- ceval header is recognizable and compact
- PV lines are readable
- first move emphasis is handled well
- hover preview board is a strong feature
- settings are directly adjacent to ceval

### Weaknesses

- the engine status language is still fairly minimal
- review progress is shown numerically but not spatially integrated into the board experience
- settings persistence is missing, so the UI feels less stable across reloads
- PV / arrow / current-position synchronization is still not consistently trustworthy

Compared to Lichess, Patzer Pro has most of the right visual ingredients, but less behavioral polish.

---

## Eval graph audit

### What is already good

- correct location under the board
- clear background and dot-based move markers
- current-position indicator
- move classification coloring
- phase-divider ambition

### What is still weak

- scrub/hover behavior is still not where it should be
- graph trust is weakened when batch review and live state drift apart
- graph integration feels secondary instead of central during review

The graph is already useful, but it is not yet at the "board review cockpit" quality that Lichess reaches.

---

## Visual design audit

### Positive

- the app clearly avoids generic component-library UI
- the analysis page has a strong dark-board / dark-tooling identity
- the ceval and PV styling are purposeful
- the board settings and piece/theme support give the app personality

### Negative

- some regions feel denser than they should
- hierarchy between primary and secondary controls is still unclear
- important actions are not always visually emphasized in proportion to their product importance
- some interface choices still feel like temporary placement decisions rather than final UX decisions

This is not a "bad-looking" board. It is a board whose product hierarchy is still settling.

---

## Honest assessment

Patzer Pro's analysis board is already much closer to Lichess in spirit than in finish.

That is an important distinction.

In spirit:

- yes, strongly aligned

In subsystem choices:

- yes, mostly aligned

In visible feature set:

- surprisingly far along

In interaction polish and workflow coherence:

- still clearly behind

The current board already proves that the project understands what kind of analysis environment it wants to be.

The main gap is no longer "we do not know what to build."

The main gap is:

- control hierarchy
- workflow coherence
- interaction reliability

---

## Best next conclusions from this audit

### Highest-priority UI follow-up

- make board interactions trustworthy before chasing more UI parity
- fix wheel navigation
- fix graph interaction quality
- fix side-variation arrow semantics
- fix engine refresh consistency when creating variations

### Second-priority UI follow-up

- reduce underboard overload
- decide whether the game list should remain underboard or move back toward a more library-centric area
- make review controls feel first-class rather than auxiliary

### Third-priority UI follow-up

- improve control grouping so engine, navigation, review, and board configuration feel like one system

---

## Bottom line

Patzer Pro already has a credible analysis-board UI.

Compared to Lichess, the biggest gap is not missing widgets. The biggest gap is that the current interface still feels like several good analysis subsystems sharing a page, rather than one deeply unified analysis-board experience.

That is a real but very fixable stage of maturity.
