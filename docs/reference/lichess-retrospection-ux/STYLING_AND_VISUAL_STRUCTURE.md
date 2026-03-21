# Styling And Visual Structure

This file explains how Lichess visually packages retrospection inside the analysis tool stack.

## Retrospection inherits the training-box visual model

Source:
- `sources/src/retrospect/retroView.ts`
- `sources/css/_training.scss`
- `sources/css/_retro.scss`

Confirmed root class:

- `div.retro-box.training-box.sub-box`

Meaning:

- retrospection is not styled as a random standalone widget
- it explicitly reuses training-box visual structure

## Title row

Source:
- `sources/src/retrospect/retroView.ts`
- `sources/css/_retro.scss`

Confirmed title contents:

- feature title
- progress counter
- close button

Confirmed styling:

- `.retro-box .title` uses flex layout with `justify-content: space-between`

This gives the box a small self-contained tool-panel header.

## Feedback body structure

Source:
- `sources/css/_training.scss`

Confirmed structure:

- `.feedback` is a flexible column area
- on mobile-like single-column layouts:
  - `.view` and `.win` can shift into row flow
- `.find` and `.fail` get extra vertical padding

Meaning:

- the panel is designed to adapt to several solve states, not just one message shape

## Iconography and state color

Source:
- `sources/css/_retro.scss`

Confirmed visual cues:

- `.win .icon` uses success color
- `.fail .icon` uses failure color
- off-track uses separate icon styling

These are lightweight but important state cues.

## Solution/next affordance

Source:
- `sources/css/_retro.scss`

Confirmed `.continue` button styling:

- large, centered, uppercase call-to-action
- blue background
- prominent icon sizing

Meaning:

- Lichess visually emphasizes advancing the retrospection sequence after a result

## Shared tool-column box context

Source:
- `sources/css/_tools.scss`

Confirmed:

- retrospection lives inside `.analyse__tools`
- `.sub-box` receives shared box styling and title styling

So its appearance depends partly on:

- generic tool-column box rules
- plus retrospection-specific overrides

## Fork and controls context

Source:
- `sources/css/_fork.scss`
- `sources/css/_tools.scss`
- `sources/css/_tools-mobile.scss`

Why it matters:

- retrospection styling is inseparable from what gets hidden around it
- fork visibility, controls highlighting, and tool-column border state all shape the perceived mode

## Patzer takeaway

If Patzer wants visual parity later:

- imitate the training-box-in-tools-column pattern
- do not turn retrospection into an unrelated modal or page card
- treat surrounding hide/show behavior as part of the visual design, not just as logic
