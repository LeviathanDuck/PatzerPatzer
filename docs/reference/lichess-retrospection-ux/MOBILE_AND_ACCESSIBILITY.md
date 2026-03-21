# Mobile And Accessibility

This file documents the non-desktop retrospection surfaces.

## Mobile control bar

Source:
- `sources/src/view/controls.ts`
- `sources/css/_tools-mobile.scss`

Confirmed behavior:

- mobile analysis has an engine-mode tab that can switch between:
  - `ceval`
  - `practice`
  - `retro`
- the `retro` mode uses a graduate-cap icon
- when active, the same button can show an `X` affordance for leaving the mode
- when active, it shows progress as `current/total`

Meaning:

- on mobile, retrospection is presented as an active board mode selection, not just a button below
  the move summary

## Mobile layout effects

Source:
- `sources/css/_tools-mobile.scss`

Confirmed behavior:

- when active mode is `retro`, the tool column gets highlighted with the same top-border treatment
  used for active tool/mode states
- `.analyse[data-active-mode='retro'] .analyse__fork` is hidden
- the mobile control bar visually distinguishes active retro mode from ceval/practice

This means the mode changes layout emphasis, not just content.

## NVUI / accessible retrospection

Source:
- `sources/src/retrospect/nvuiRetroView.ts`
- `sources/src/view/nvuiView.ts`

Confirmed behavior:

- NVUI gets its own retrospection rendering path
- it renders:
  - a retro toggle button
  - a mistake counter label
  - state-specific spoken/live text
- actions such as:
  - view solution
  - skip
  - resume
  - reset
  - flip
  use focus-friendly hooks

Important implication:

- Lichess did not bolt retrospection onto visual UI only
- it treated it as a first-class mode that also needs an accessible solve loop

## Spoken feedback semantics

Confirmed spoken patterns include:

- announcing the played move and the side to find a better move for
- announcing “you browsed away”
- announcing success
- announcing the solution SAN
- announcing no-mistakes / finished-review states

This is not just decorative accessibility.
It encodes the same solve-state machine in a non-visual form.

## Patzer takeaway

Even if Patzer delays a full accessibility pass, the Lichess model shows that retrospection mode is
not complete if it only works visually on desktop.

The minimum lesson is:

- do not hard-wire the feature to a single screen shape
- keep state transitions and actions structured enough that alternate UIs can reuse them later
