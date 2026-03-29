# Mini Sprint — Analysis Controls Parity

Date: 2026-03-29
Status: proposed
Source audit: [docs/reference/LICHESS_ANALYSIS_CONTROLS_AUDIT.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/LICHESS_ANALYSIS_CONTROLS_AUDIT.md)
Scope: smallest safe sequence to move Patzer's analysis controls toward Lichess-style ownership and behavior without destabilizing the analysis board

---

## Goal

Bring Patzer's analysis board closer to Lichess "Analysis controls" by:

- creating one analysis-owned controls subsystem
- adding a right-side analysis hamburger menu in the tools area
- adding missing high-value control-bar buttons
- moving analysis-local settings out of the global header menu
- preserving existing working persistence where possible

This sprint is about ownership and behavior first.

It is not a broad visual redesign.

---

## Why this sprint is needed

Patzer currently has analysis-board controls split across:

- [src/main.ts](/Users/leftcoast/Development/PatzerPatzer/src/main.ts)
- [src/analyse/pgnExport.ts](/Users/leftcoast/Development/PatzerPatzer/src/analyse/pgnExport.ts)
- [src/ceval/view.ts](/Users/leftcoast/Development/PatzerPatzer/src/ceval/view.ts)
- [src/header/index.ts](/Users/leftcoast/Development/PatzerPatzer/src/header/index.ts)

That fragmentation is the real problem.

The biggest risks today are:

- new buttons have no obvious owner
- analysis-local settings are spread between the control row, ceval gear, and header menu
- Lichess-like additions such as a hamburger menu or explorer button would be awkward to bolt on cleanly
- `src/main.ts` is still too exposed to control-bar growth

The source-backed diagnosis is documented in:

- [docs/reference/LICHESS_ANALYSIS_CONTROLS_AUDIT.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/LICHESS_ANALYSIS_CONTROLS_AUDIT.md)

---

## Lichess comparison that matters here

Local Lichess sources used as reference:

- [../lichess-source/lila/ui/analyse/src/view/controls.ts](/Users/leftcoast/Development/lichess-source/lila/ui/analyse/src/view/controls.ts)
- [../lichess-source/lila/ui/analyse/src/view/actionMenu.ts](/Users/leftcoast/Development/lichess-source/lila/ui/analyse/src/view/actionMenu.ts)
- [../lichess-source/lila/ui/analyse/src/view/tools.ts](/Users/leftcoast/Development/lichess-source/lila/ui/analyse/src/view/tools.ts)
- [../lichess-source/lila/ui/analyse/css/_tools.scss](/Users/leftcoast/Development/lichess-source/lila/ui/analyse/css/_tools.scss)
- [../lichess-source/lila/ui/analyse/css/_tools-mobile.scss](/Users/leftcoast/Development/lichess-source/lila/ui/analyse/css/_tools-mobile.scss)
- [../lichess-source/lila/ui/analyse/css/_action-menu.scss](/Users/leftcoast/Development/lichess-source/lila/ui/analyse/css/_action-menu.scss)

The important Lichess lessons for this sprint are:

- the control bar and the action menu are one subsystem
- the right-side hamburger opens an analysis-local menu, not a site-global menu
- opening explorer is a first-class control-bar tool
- move navigation includes first/last as well as prev/next
- display toggles and analysis-local actions live in the analysis menu
- the tools area cleanly hosts overlays such as explorer, retro, practice, and action menu

We should copy that structure first.

Patzer styling can still diverge later.

---

## Non-destructive implementation strategy

This sprint should avoid:

- a wide controls rewrite in one patch
- rewriting storage keys just because buttons move
- large new feature logic in [src/main.ts](/Users/leftcoast/Development/PatzerPatzer/src/main.ts)
- bundling optional Lichess features such as tablebase-like extras or board editor behavior too early

This sprint should prefer:

- extracting one analysis-controls owner under `src/analyse/`
- creating a menu shell before migrating all settings
- moving existing working actions into better ownership before adding new ones
- keeping current storage seams in place unless they are actively wrong
- adding missing parity buttons only after the control/menu shell exists

That is the safest way to add more controls without making the board brittle.

---

## Explicit decision points and placeholders

These do not block the sprint plan, but they should be answered when the relevant task lands.

### Decision 1 — Does engine on/off stay in the ceval header?

Recommended default:

- yes, keep engine on/off in the ceval header for now
- move display-oriented toggles into the analysis action menu

Reason:

- lowest-risk split between engine-search ownership and analysis-display ownership

### Decision 2 — Does `Export PGN` move into the analysis menu?

Recommended default:

- not in the first pass
- keep it where it is until the core action menu is stable

Reason:

- export is useful from analysis, but it is not the highest-value parity item

### Decision 3 — Does `Mistake Detection` move out of the header menu now?

Recommended default:

- defer the move in this sprint
- keep the existing modal owner and only revisit placement after core analysis controls are stable

Reason:

- the current sprint is about board controls parity first, not all analysis-related settings at once

### Decision 4 — Which toggles get iOS-style treatment?

Recommended default:

- use iOS-style switches only inside the new analysis action menu
- do not restyle every existing toggle in the app during this sprint

Reason:

- keeps styling work scoped to the new subsystem

### Decision 5 — Which Lichess actions are intentionally deferred?

Recommended default:

- defer:
  - board editor
  - continue from here
  - to study
  - replay/autoplay controls

Reason:

- these are useful, but not required to make Patzer's control system feel structurally Lichess-like

---

## Proposed sprint outcome

After this sprint, Patzer analysis should have:

1. a real analysis-controls owner
2. a right-side hamburger button in the analysis controls row
3. a local action menu opening inside the tools area
4. first / prev / next / last navigation in the control bar
5. an opening explorer button in the control bar
6. migrated analysis-local display/settings rows in the analysis menu
7. fewer duplicated analysis settings in the header menu

This is enough to make the analysis board feel much more Lichess-like without yet copying every optional tool.

---

## Sprint tasks

## Task 1 — Extract a dedicated analysis-controls owner

### Diagnosis

Patzer's analysis controls are still composed directly in [src/main.ts](/Users/leftcoast/Development/PatzerPatzer/src/main.ts) and [src/analyse/pgnExport.ts](/Users/leftcoast/Development/PatzerPatzer/src/analyse/pgnExport.ts), while related settings live elsewhere.

There is no single subsystem that owns:

- control-bar state
- hamburger visibility
- active analysis-local tool/menu state

### Small safe step

Create an analysis-controls owner under `src/analyse/` that owns:

- action-menu open/closed state
- control-bar tool state
- a render seam for the control bar
- a render seam for the action menu

The first pass can wrap existing behavior.

It does not need to invent final Lichess parity immediately.

### Why safe

- creates the missing architectural seam
- reduces future `main.ts` growth
- does not require changing settings storage yet

### Files

- [src/main.ts](/Users/leftcoast/Development/PatzerPatzer/src/main.ts)
- [src/analyse/pgnExport.ts](/Users/leftcoast/Development/PatzerPatzer/src/analyse/pgnExport.ts)
- new files under `src/analyse/`

---

## Task 2 — Add the Lichess-style control bar shell

### Diagnosis

Patzer's current controls row is custom and incomplete:

- no first / last
- no right-side hamburger
- no dedicated explorer button
- review and navigation are mixed without a wider control model

### Small safe step

Render a real control-bar shell with three zones:

- left: explorer / mode entry area
- middle: first / prev / next / last
- right: hamburger menu button

Near-term safe version:

- keep `Review` / `Re-analyze` available
- keep retrospection entry available
- add first / last
- add hamburger shell even if its first menu contents are limited

### Why safe

- surface change backed by the new owner from Task 1
- adds missing parity buttons without rewriting the tools column yet

### Files

- new analysis-controls view files under `src/analyse/`
- [src/styles/main.scss](/Users/leftcoast/Development/PatzerPatzer/src/styles/main.scss)

---

## Task 3 — Add the analysis-local hamburger menu overlay

### Diagnosis

Lichess's menu works because it is local to the tools area.

Patzer currently has no analysis-local menu overlay; the global header menu is doing too much of that work.

### Small safe step

Create a tools-area overlay menu that:

- opens from the right-side hamburger
- lives inside `.analyse__tools`
- overlays local tool content
- scrolls independently
- closes cleanly without disturbing board state

First-pass menu sections should exist even if some sections are still placeholders.

### Placeholder rule

If a section is not ready for real controls yet, use an honest placeholder row such as:

- `Coming in later parity pass`

Do not invent non-working fake controls.

### Why safe

- localizes future settings growth
- matches the Lichess ownership model
- allows gradual migration instead of one big menu rewrite

### Files

- new analysis action-menu view/state files under `src/analyse/`
- [src/main.ts](/Users/leftcoast/Development/PatzerPatzer/src/main.ts)
- [src/styles/main.scss](/Users/leftcoast/Development/PatzerPatzer/src/styles/main.scss)

---

## Task 4 — Move existing analysis-local actions into the new menu

### Diagnosis

Patzer already has several analysis-local actions, but they are spread across the control row, ceval gear, and global header menu.

The highest-value migration targets already exist:

- Flip board
- Learn From Your Mistakes entry
- review-annotation display settings
- maybe review dots visibility controls

### Small safe step

Move a first set of existing actions into the analysis menu without changing their storage owners.

Recommended first moved items:

- Flip board
- Learn From Your Mistakes
- Move annotations / board review glyph display
- review dots user-only if it is judged analysis-local enough

Keep the actual state in:

- [src/board/cosmetics.ts](/Users/leftcoast/Development/PatzerPatzer/src/board/cosmetics.ts)
- [src/engine/ctrl.ts](/Users/leftcoast/Development/PatzerPatzer/src/engine/ctrl.ts)
- [src/analyse/retroConfig.ts](/Users/leftcoast/Development/PatzerPatzer/src/analyse/retroConfig.ts)

### Why safe

- rehomes UI before storage
- avoids needless persistence churn
- lets the user experience improve early

### Files

- new action-menu files under `src/analyse/`
- [src/header/index.ts](/Users/leftcoast/Development/PatzerPatzer/src/header/index.ts)
- [src/ceval/view.ts](/Users/leftcoast/Development/PatzerPatzer/src/ceval/view.ts)

---

## Task 5 — Add opening explorer as a first-class control-bar tool

### Diagnosis

Patzer already has a real opening explorer, with strong config persistence in [src/openings/explorerConfig.ts](/Users/leftcoast/Development/PatzerPatzer/src/openings/explorerConfig.ts), but it is not presented as a first-class control-bar tool the way Lichess does.

### Small safe step

Add an opening explorer button to the left side of the control bar and hook it into the existing explorer visibility/state seam.

The button should:

- activate/deactivate explorer locally
- coexist cleanly with retrospection and the action menu
- not create a second explorer owner

### Why safe

- explorer already exists
- storage and config are already separated well
- this is mostly ownership and presentation work

### Files

- analysis-controls owner/view
- [src/main.ts](/Users/leftcoast/Development/PatzerPatzer/src/main.ts)
- existing explorer-related modules

---

## Task 6 — Split engine gear from analysis menu more honestly

### Diagnosis

Patzer's engine settings gear currently mixes:

- engine runtime settings
- display toggles
- board review toggles

Lichess separates those concerns more cleanly.

### Small safe step

Keep the engine gear focused on:

- lines
- analysis depth
- review depth

Move broader display-oriented toggles into the analysis menu, such as:

- best move arrow display if desired
- move annotations on board
- evaluation-gauge visibility if that setting lands in the same pass

### Why safe

- improves conceptual ownership without reworking engine internals
- makes room for future menu growth

### Files

- [src/ceval/view.ts](/Users/leftcoast/Development/PatzerPatzer/src/ceval/view.ts)
- new action-menu files under `src/analyse/`

---

## Task 7 — Clean duplicates out of the global header menu

### Diagnosis

Once the new analysis menu exists, leaving duplicate analysis-local items in the header menu will create confusion.

### Small safe step

After migrated controls are stable:

- remove only the duplicated analysis-local entries from the header menu
- leave global app settings alone

Header should still own:

- board themes / pieces / filters
- sounds
- import/global workflows

### Why safe

- cleanup only after replacement is live
- avoids stranded controls

### Files

- [src/header/index.ts](/Users/leftcoast/Development/PatzerPatzer/src/header/index.ts)

---

## Explicitly deferred from this sprint

These are Lichess-inspired, but should not block the first parity pass:

- board editor action
- continue-from-here actions
- to-study action
- replay/autoplay controls
- full mobile ceval/practice/retro mode parity
- a complete rewrite of engine settings UI

They can become follow-up prompts after the control/menu ownership is stable.

---

## Validation expectations

For each implementation step in this sprint, validation should include:

- `npm run build`
- smoke test that board navigation still works
- smoke test that Review / Re-analyze still works
- smoke test that explorer, retrospection, and the action menu do not conflict
- smoke test that migrated settings still persist correctly
- explicit confirmation that no duplicated dead controls remain visible

---

## Recommended prompt sequence

The safest prompt order for this sprint is:

1. Extract analysis-controls owner
2. Add control-bar shell with first / last and hamburger
3. Add analysis-local hamburger menu overlay
4. Move flip-board and Learn From Your Mistakes into the menu
5. Add opening explorer button to the control bar
6. Split display toggles out of engine gear
7. remove duplicate analysis-local items from the global header menu

This keeps the work small, reviewable, and architecture-friendly.
