# Entry Points And Layout

This file answers two practical questions:

1. Where does the user enter Learn From Your Mistakes?
2. Where does the feature render once active?

## Entry point 1: action menu

Source:
- `sources/src/view/actionMenu.ts`

Confirmed behavior:

- the action menu can render a `Learn From Your Mistakes` link with a `GraduateCap` icon
- availability is gated by:
  - `ctrl.hasFullComputerAnalysis()`
  - `!ctrl.isEmbed`
  - `!ctrl.retro`

Meaning:

- Lichess does not offer retrospection before full computer analysis is available
- it also does not offer the entry while retrospection is already active

This is a strong UX rule for Patzer:

- do not expose the mode early just because some partial review data exists

## Entry point 2: advice summary / round training area

Source:
- `sources/src/view/roundTraining.ts`

Confirmed behavior:

- when server analysis is visible, the underboard training/advice area renders:
  - white advice summary
  - a central `Learn From Your Mistakes` button
  - black advice summary

Important UX implication:

- on desktop-like analysis pages, the feature is presented as part of the post-analysis review
  surface, not as a separate app route

This matters for Patzer because it reinforces:

- retrospection is an analysis-board mode
- not a detached puzzle page

## Mobile entry surface

Source:
- `sources/src/view/controls.ts`
- `sources/css/_tools-mobile.scss`

Confirmed behavior:

- mobile UI uses an engine-mode control button that can be in:
  - `ceval`
  - `practice`
  - `retro`
- when mode is `retro`, the button shows progress as `current/total`
- the button also behaves as a toggle target

Meaning:

- mobile does not simply mirror desktop buttons
- retrospection becomes one of the board’s active operating modes

## Where the retrospection box renders

Source:
- `sources/src/view/tools.ts`
- `sources/src/retrospect/retroView.ts`

Confirmed rendering location:

- the retrospection box renders inside `div.analyse__tools`
- it occupies the same tool-column area where explorer or practice can appear
- it is chosen through:
  - `retroView(ctrl) || explorerView(ctrl) || practiceView(ctrl)`

That ordering matters:

- if retro is active, it wins the tool slot
- it is not an overlay floating independently from the analysis tool stack

## Box structure

Source:
- `sources/src/retrospect/retroView.ts`
- `sources/css/_retro.scss`
- `sources/css/_training.scss`

Confirmed structure:

- root class:
  - `div.retro-box.training-box.sub-box`
- title row:
  - feature name
  - progress count
  - close button
- feedback body:
  - one of the state-specific views

This means retrospection is visually presented as:

- a specialized training box
- using the same broad visual vocabulary as practice mode

## Co-location with other analysis tools

Source:
- `sources/src/view/tools.ts`

Confirmed neighboring elements:

- ceval header may still render
- PV list may render unless solving suppresses it
- move list still exists in the same tool column
- fork view may exist but gets suppressed while solving
- action menu can still exist separately

So the actual experience is not “hide the analysis board and open a practice page.”
It is:

- stay on the analysis board
- switch the tool stack and interaction rules into retrospection mode

## Patzer takeaway

If Patzer wants Lichess-like UX:

- the main entry surfaces should be tied to reviewed-game analysis surfaces
- the active experience should live inside the existing board/tool layout
- the feature should feel like a board mode, not a route jump to a separate puzzle subsystem
