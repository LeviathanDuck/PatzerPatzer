# Board Interaction And State Effects

This file documents how retrospection changes the behavior of the analysis board itself.

## It is a board mode, not just a panel

The key Lichess truth is:

- retrospection is not merely a panel that shows advice
- it actively changes board navigation, shapes, line visibility, and surrounding UI

That is why treating it as “candidate list + underboard widget” is insufficient.

## Path changes drive the mode

Source:
- `sources/src/ctrl.ts`
- `sources/src/retrospect/retroCtrl.ts`

Confirmed behavior:

- whenever analysis `jump(path)` happens, `retro.onJump()` is called

Meaning:

- the mode is path-aware at all times
- the user does not enter a sealed puzzle room
- regular board navigation still exists, but it is interpreted through retrospection state

## The board is jumped to the pre-mistake position

Source:
- `sources/src/retrospect/retroCtrl.ts`

Confirmed behavior:

- on entry to a candidate, Lichess calls `root.userJump(prev.path)`
- that means the board is positioned before the bad move

This is the core manipulation:

- the user is not asked to inspect the mistake after the fact
- the board is rewound to the decision point

## Normal next-move stepping can be blocked

Source:
- `sources/src/control.ts`
- `sources/src/retrospect/retroCtrl.ts`

Confirmed behavior:

- `control.next(ctrl)` immediately returns if `ctrl.retro?.preventGoingToNextMove()`
- `preventGoingToNextMove()` is true while solving and still on `prev.path`

Meaning:

- Lichess deliberately prevents the user from casually stepping forward into the answer while they
  are supposed to solve the moment

This is a hard UX choice, not an incidental side effect.

## Off-track browsing is explicitly detected

Source:
- `sources/src/retrospect/retroCtrl.ts`
- `sources/src/retrospect/retroView.ts`

Confirmed behavior:

- if solving and current path is no longer `prev.path`, feedback becomes `offTrack`
- the user sees a dedicated “you browsed away” state with resume action

Meaning:

- browsing away is not silently ignored
- it is a first-class state in the mode

## Board arrows change in retrospection

Source:
- `sources/src/autoShape.ts`
- `sources/src/retrospect/retroCtrl.ts`

Confirmed behavior:

- if `showBadNode()` returns a node, Lichess draws a pale red arrow for the bad move
- this visually reminds the user what move was played once the mode wants to show it

This is one of the clearest board-level retrospection affordances.

## Computer lines can be hidden

Source:
- `sources/src/retrospect/retroCtrl.ts`
- `sources/src/ctrl.ts`
- `sources/src/view/tools.ts`
- `sources/src/treeView/inlineView.ts`

Confirmed behavior:

- `hideComputerLine(node)` suppresses line/comment visibility for unsolved learn candidates
- `showBestMoveArrows()` is gated by `!retro.hideComputerLine(this.node)`
- PV rendering is suppressed while solving:
  - `showCevalPvs: !ctrl.retro?.isSolving() && !ctrl.practice`
- fishnet comments in the tree can be replaced by `learnFromThisMistake`

Meaning:

- Lichess actively withholds answer-like computer guidance while the user is solving
- this affects:
  - board arrows
  - PV panel visibility
  - move-tree fishnet comments

That suppression is part of the mode’s integrity.

## Fork UI is hidden while solving

Source:
- `sources/src/fork.ts`
- `sources/css/_tools-mobile.scss`

Confirmed behavior:

- `forkView` returns nothing if `ctrl.retro?.isSolving()`
- on mobile, `.analyse[data-active-mode='retro'] .analyse__fork { display: none; }`

Meaning:

- branch-picking UI is intentionally suppressed while solving
- this reduces accidental line-hopping and visual clutter

## Ceval is still involved

Source:
- `sources/src/ctrl.ts`
- `sources/src/retrospect/retroCtrl.ts`

Confirmed behavior:

- `ctrl.onNewCeval(...)` forwards updates to `retro.onCeval()`
- `retro.forceCeval()` returns true in `eval` feedback state

Meaning:

- retrospection does not just consume precomputed data
- it can force ceval involvement during answer checking

This matters because exact-best-only MVPs can easily drift if they hard-code around this seam.

## Tool conflicts are explicitly managed

Source:
- `sources/src/ctrl.ts`

Confirmed behavior:

- toggling explorer clears retro
- `closeTools()` clears:
  - retro
  - practice
  - explorer
  - action menu

Meaning:

- Lichess treats retrospection as a mutually exclusive board mode with certain other tools

## Patzer takeaway

To feel like Lichess, Patzer retrospection must eventually do all of these:

- rewind to pre-mistake position
- block trivial next-step cheating
- detect off-track browsing
- suppress answer-revealing PV/arrow/comment surfaces while solving
- show retrospection-specific board arrows
- hide fork UI while active
- integrate with ceval and tool-mode switching

Anything less is only partial parity.
