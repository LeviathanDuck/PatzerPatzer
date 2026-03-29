# Lichess Analysis Controls Audit

## Purpose

This document audits how Lichess structures the analysis controls area, compares it against Patzer Pro's current analysis board, and lays out a safe step-by-step parity plan.

The goal is not "make the buttons look more like Lichess" in isolation.

The real goal is:

- give Patzer one analysis-owned controls subsystem
- stop scattering related actions across the control bar, ceval gear, and global header menu
- add missing Lichess-inspired buttons and menus without breaking existing analysis-board behavior
- preserve Patzer-specific styling freedom, including iOS-style toggles, while aligning behavior and ownership with Lichess

## Source Files Inspected

### Patzer Pro

- `src/main.ts`
- `src/analyse/pgnExport.ts`
- `src/ceval/view.ts`
- `src/header/index.ts`
- `src/engine/ctrl.ts`
- `src/engine/batch.ts`
- `src/board/cosmetics.ts`
- `src/board/sound.ts`
- `src/analyse/retroConfig.ts`
- `src/openings/explorerConfig.ts`
- `src/styles/main.scss`

### Lichess

- `~/Development/lichess-source/lila/ui/analyse/src/view/controls.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/view/actionMenu.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/view/tools.ts`
- `~/Development/lichess-source/lila/ui/analyse/css/_tools.scss`
- `~/Development/lichess-source/lila/ui/analyse/css/_tools-mobile.scss`
- `~/Development/lichess-source/lila/ui/analyse/css/_action-menu.scss`

## What Lichess Actually Does

Lichess treats "Analysis controls" as a dedicated analysis-board subsystem.

It is made of two connected parts:

- a small control bar below the board
- an analysis-owned action menu opened by the right-side hamburger button

The control bar and the action menu are not independent convenience widgets. They are one coordinated system.

### Lichess control bar

From `ui/analyse/src/view/controls.ts`, the control bar actions are:

- `first`
- `prev`
- `next`
- `last`
- `scrub-help` on mobile
- `opening-explorer`
- `menu`
- `analysis`
- `engine-mode`

The visual layout is:

- left side: tool or mode access
- middle: jump buttons
- right side: hamburger menu

Important behavior:

- the right-side hamburger opens the analysis action menu, not the global site menu
- the opening explorer has a dedicated control-bar button
- mobile has a ceval/practice/retro control-mode button
- desktop can surface practice directly in the bar
- controls and tools area are linked by state, not glued together ad hoc

### Lichess action menu

From `ui/analyse/src/view/actionMenu.ts`, the hamburger menu includes these families of controls:

#### Tools

- Flip board
- Board editor
- Practice with computer
- Learn from your mistakes
- Continue from here
- To study
- Clear saved moves

#### Display

- Inline notation
- Disclosure buttons
- Move annotations on board
- Variation opacity slider

#### Computer analysis

- Computer analysis
- Best move arrow
- Piece maneuver arrows
- Evaluation gauge

#### Replay mode

- autoplay speed buttons

### Lichess menu placement and behavior

From `ui/analyse/src/view/tools.ts` and `_action-menu.scss`:

- the action menu lives inside the tools column
- it overlays that column with `position: absolute; inset: 0`
- it is scrollable
- it visually feels like a local analysis panel, not a global modal
- it replaces other tool content cleanly while open

This is why the Lichess menu feels coherent: it is local to the analysis board.

## What Patzer Does Today

Patzer currently spreads analysis-related controls across three different ownership areas.

### 1. Controls below the board / move list

From `src/main.ts` and `src/analyse/pgnExport.ts`:

- `Review` / `Re-analyze`
- retrospection entry button
- previous move
- next move

Current limitation:

- this area is not a real analysis-controls subsystem yet
- it is a custom row mixing navigation and review actions
- it does not own the rest of the analysis settings story

### 2. Engine header + gear in the tools column

From `src/ceval/view.ts`:

- engine toggle
- current eval pearl
- engine label / status
- engine settings gear

Current engine settings include:

- lines
- review depth
- analysis depth
- arrows
- all lines
- played
- labels
- label size
- review
- board review

This is analysis-board-local, which is good, but the scope is too narrow compared to Lichess. It only owns engine display settings, not broader analysis controls.

### 3. Global header menu

From `src/header/index.ts`, the global menu currently owns several settings that are analysis-adjacent:

- Flip board
- Export PGN
- Board wheel navigation
- Review dots: user only
- Board sounds
- volume
- Detection Settings
- Mistake Detection
- Board Settings submenu

This creates ownership drift:

- some analysis controls are under the board
- some are in the tools column gear
- some are in the site header global menu

That is the main architectural mismatch with Lichess.

## Direct Comparison

### Lichess controls Patzer already has somewhere

- previous / next move
- Review / re-analyze equivalent workflow
- opening explorer, but not as a dedicated control-bar tool toggle
- learn from your mistakes, but as a separate entry button rather than action-menu tooling
- flip board
- engine toggle
- best move arrows
- move annotations on board, partly via board review glyph toggles

### Lichess controls Patzer does not have, or does not expose the same way

- first / last move jump buttons in the main analysis controls row
- right-side analysis hamburger menu
- board-editor action from analysis
- continue-from-here actions
- study export action with local analysis ownership
- disclosure buttons toggle
- inline-notation toggle
- variation opacity control
- evaluation gauge toggle in the action menu
- replay-mode autoplay controls
- piece maneuver arrows as a distinct concept

### Patzer controls that are currently misplaced

These are real settings, but they live in the wrong UI owner if Patzer wants Lichess-like analysis controls:

- flip board
- review dots user-only
- board wheel navigation
- some review-annotation toggles
- mistake-detection entry point
- maybe export actions, depending on final desired layout

## Current Patzer Persistence Map

This matters because parity work should move UI ownership first, not rewrite storage blindly.

### Engine / analysis settings

From `src/engine/ctrl.ts`:

- `patzer.multiPv`
- `patzer.analysisDepth`
- `patzer.showArrowLabels`
- `patzer.showReviewLabels`
- `patzer.showBoardReviewGlyphs`
- `patzer.arrowLabelSize`

From `src/engine/batch.ts`:

- `patzer.reviewDepth`

### Board / board-adjacent settings

From `src/board/cosmetics.ts`:

- `boardWheelNavEnabled`
- `reviewDotsUserOnly`
- `boardZoom`
- `boardTheme`
- `pieceSet`
- `boardFilter.*`

From `src/board/sound.ts`:

- `boardSoundEnabled`
- `boardSoundVolume`

### Learn From Your Mistakes settings

From `src/analyse/retroConfig.ts`:

- `retroConfig`

### Opening explorer settings

From `src/openings/explorerConfig.ts`:

- `explorer.db2.standard`
- `explorer.speed`
- `analyse.explorer.rating`
- `explorer.mode`
- `analyse.explorer.player.name`
- `explorer.player.name.previous`
- `analyse.explorer.since-2.*`
- `analyse.explorer.until-2.*`

This is important because Patzer already has a strong persistence seam for explorer settings. That makes an explorer control-bar button much safer than it might look.

## Why Patzer Feels Different Right Now

Patzer does not only look different from Lichess. It behaves differently because control ownership is fragmented.

That causes several problems:

- users must hunt across multiple menus for related analysis settings
- adding new analysis actions risks touching `main.ts`, `ceval/view.ts`, and `header/index.ts` together
- the current control row cannot grow cleanly because it is not backed by a single controller/state model
- the global menu is doing analysis-board work that should be local to the analysis board

The risk is not just UI clutter.

The risk is that every new button becomes another one-off placement decision.

## Safe Parity Strategy

Yes, there is a safe way to do this.

Do not start by shuffling random buttons into a prettier row.

Start by creating a Patzer-owned analysis-controls subsystem, then migrate existing actions into it in phases.

### Rule 1

Move UI ownership before changing storage ownership.

If a setting is already stored correctly, do not rewrite persistence just because the button moves into the analysis menu.

### Rule 2

Separate:

- control-bar actions
- action-menu sections
- engine settings internals

The Lichess action menu can reuse existing Patzer settings instead of replacing them immediately.

### Rule 3

Use the Lichess structure, but allow Patzer styling to diverge.

That means:

- Lichess-like control placement and menu behavior
- Patzer-specific visual polish such as iOS-style toggles

The toggle skin is a styling layer, not a behavior layer.

## Recommended Phased Plan

### Phase 0: audit freeze and ownership map

Goal:

- define one analysis-controls owner module under `src/analyse/`

Do first:

- inventory every analysis-board-local action
- explicitly mark which settings stay in existing state modules
- decide which header-menu actions should migrate into analysis controls

Suggested owner:

- new module family under `src/analyse/`, for example:
  - `analysisControls.ts`
  - `analysisActionMenu.ts`
  - `analysisControlsView.ts`

Do not put this new logic into `src/main.ts`.

### Phase 1: extract Patzer control-bar state out of `main.ts`

Goal:

- make current navigation and review actions render through one analysis-controls boundary

Scope:

- first / prev / next / last
- review / re-analyze
- existing retrospection entry

Why first:

- this creates the seam future buttons need
- it reduces the chance that every new control becomes another `main.ts` patch

### Phase 2: add the right-side hamburger action menu shell

Goal:

- create a Lichess-style analysis-local menu that opens inside the tools area

Required behavior:

- control-bar hamburger on the right
- menu overlays the tools column
- menu scrolls
- opening and closing it does not disturb the board or move list

Do not migrate every setting yet.

First just land the shell and basic section structure.

### Phase 3: migrate existing analysis-local actions into the action menu

Move these first because they already exist and are low-risk to re-home:

- Flip board
- Learn from your mistakes
- opening explorer toggle
- engine arrows / review glyph display settings that are clearly analysis-local

Keep existing storage where it already lives.

The change is UI ownership, not a persistence rewrite.

### Phase 4: split "analysis menu" from "engine gear"

Goal:

- narrow the engine gear back toward pure engine-line settings
- move broader display settings into the Lichess-style analysis action menu

Good candidates to move from the current engine gear:

- board review glyphs
- review labels
- maybe played-arrow / arrow-label presentation

Keep pure engine-search settings in the gear:

- lines
- analysis depth
- review depth

### Phase 5: add missing Lichess-parity controls carefully

Add one family at a time:

- opening explorer toggle button in the control bar
- first / last jump buttons if not already landed in Phase 1
- move annotations on board toggle in the menu
- evaluation gauge toggle
- variation opacity slider
- replay mode / autoplay controls

Potential later additions:

- board editor
- continue from here
- to study

These should not be bolted on until the action-menu shell is stable.

### Phase 6: remove duplicated header-menu entries

Only after the new analysis menu is stable:

- remove analysis-board-specific items from the global header menu
- leave truly global settings in the header

Header menu should keep things like:

- app-wide board theme / piece settings
- sounds
- import/global workflows

It should not be the primary owner for analysis-board-local controls.

## Recommended Final Ownership

### Analysis control bar

Should own:

- first / prev / next / last
- opening explorer toggle
- mode buttons or equivalent tool-entry buttons
- right-side hamburger menu trigger

### Analysis action menu

Should own:

- flip board
- learn from your mistakes
- display toggles
- board review annotations toggle
- opening-explorer-related entry points if needed
- autoplay / replay controls
- future analysis-local actions

### Engine gear

Should own:

- engine on/off if kept there
- lines
- depth
- maybe engine-only arrow generation settings

### Global header menu

Should own:

- app-level settings
- import / account / site-wide actions
- not core analysis-board controls

## iOS-Style Toggles

This is safe, but treat it as presentation only.

Recommendation:

- keep the Lichess menu information architecture
- style toggle rows with Patzer's own iOS-like switch controls

That means:

- section headers like Lichess
- local overlay behavior like Lichess
- switch styling like Patzer

Do not change the ownership model just to support a toggle style.

## Most Important Missing Parity Items

If the goal is "feel more like Lichess quickly," the highest-value gaps are:

1. Right-side analysis hamburger menu
2. Opening explorer toggle in the control bar
3. First / last move buttons
4. Action-menu ownership for display toggles
5. Cleaner separation between analysis menu and global header menu

These five changes will move the overall feel much more than cosmetic button restyling alone.

## Strong Recommendation

Do this as a migration, not a single redesign prompt.

The safest implementation order is:

1. Extract analysis-controls owner
2. Add hamburger menu shell
3. Move existing actions into it
4. Add missing parity controls
5. Remove duplicates from the header menu

That order prevents breakage because each phase has a stable owner and a small scope.

## Suggested Prompt Sequence

If this turns into implementation prompts, the safest sequence is:

1. Extract analysis controls out of `src/main.ts`
2. Add Lichess-style analysis hamburger menu shell in the tools column
3. Move flip-board and Learn From Your Mistakes entry into the analysis menu
4. Add first / last move buttons to the control bar
5. Add opening explorer button to the control bar
6. Move display toggles into the analysis menu
7. Add variation opacity and eval-gauge controls
8. Remove duplicated analysis settings from the global menu

This keeps the work reviewable and prevents a wide "controls rewrite" from breaking unrelated board features.
