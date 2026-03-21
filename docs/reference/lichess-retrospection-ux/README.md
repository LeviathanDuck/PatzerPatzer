# Lichess Retrospection UX Reference

This folder is the UX and board-interaction companion to:

- [docs/reference/lichess-retrospection/README.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection/README.md)
- [docs/reference/lichess-puzzle-ux/README.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/README.md)

That earlier folder documents:

- candidate logic
- thresholds
- source-backed puzzle-generation limits
- Patzer implementation implications

This folder documents a different question:

- how Learn From Your Mistakes is actually experienced on the Lichess analysis board
- where the UI entry points live
- where the retrospection box renders
- what other UI gets hidden or suppressed while solving
- how board arrows, next/prev controls, fork UI, PV display, and mobile controls change
- what source files define those behaviors

This folder should be treated as mandatory reference material for any Patzer work involving:

- retrospection UX
- Learn From Mistakes board mode
- board interaction during mistake solving
- move-blocking / next-move suppression
- engine-line hiding during solve mode
- retro-specific arrows and feedback box layout
- mobile or accessibility behavior for retrospection

## What is in here

- [UX_SOURCE_MAP.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection-ux/UX_SOURCE_MAP.md)
  Exact source inventory and why each file matters.
- [ENTRY_POINTS_AND_LAYOUT.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection-ux/ENTRY_POINTS_AND_LAYOUT.md)
  Where the feature is launched from and where its UI appears.
- [BOARD_INTERACTION_AND_STATE_EFFECTS.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection-ux/BOARD_INTERACTION_AND_STATE_EFFECTS.md)
  How retrospection changes board behavior, move stepping, arrows, PVs, and tree UI.
- [MOBILE_AND_ACCESSIBILITY.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection-ux/MOBILE_AND_ACCESSIBILITY.md)
  Mobile control-bar behavior and NVUI behavior.
- [STYLING_AND_VISUAL_STRUCTURE.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection-ux/STYLING_AND_VISUAL_STRUCTURE.md)
  Retrospection box styling, training-box structure, and related layout rules.

## Source snapshots

Copied Lichess source snapshots live under:

- [docs/reference/lichess-retrospection-ux/sources/](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection-ux/sources/)

These are local reference copies for audit and prompt-writing use. They are not Patzer runtime code.

## Core bottom line

Lichess Learn From Your Mistakes is not just:

- candidate logic
- plus a button
- plus a modal

It is a full analysis-board mode that changes:

- entry surfaces
- active control mode
- tool-column content
- PV visibility
- computer-line visibility
- next-move behavior
- fork/variation visibility
- board auto-shapes
- mobile control bar state
- accessibility/NVUI presentation

Any Patzer attempt to imitate the feature only at the data layer and not at the board-mode UX
layer will drift from Lichess immediately.
