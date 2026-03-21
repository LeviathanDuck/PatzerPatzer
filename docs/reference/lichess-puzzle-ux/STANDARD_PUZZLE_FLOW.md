# Standard Puzzle Flow

This document focuses on classic Lichess puzzle training, not Storm or Racer.

## Page assembly

The standard puzzle page is assembled by:
- server route/controller in [sources/app/controllers/Puzzle.scala](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/app/controllers/Puzzle.scala)
- server page shell in [sources/modules/puzzle/src/main/ui/PuzzleUi.scala](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/modules/puzzle/src/main/ui/PuzzleUi.scala)
- browser runtime in [sources/ui/puzzle/src/ctrl.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/puzzle/src/ctrl.ts) and [sources/ui/puzzle/src/view/main.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/puzzle/src/view/main.ts)

The page shell injects:
- `data`
- user prefs
- `showRatings`
- settings like `difficulty` and `color`
- external engine endpoint

## Runtime modes

The central mode field is in `PuzzleCtrl`:
- `play`
- `view`
- `try`

Observed semantics:
- `play` is the normal solving state
- `view` is the completed/solution-viewing state
- `try` appears to support retry / alternate handling around mistakes and solution stepping

## Initial board state

On initiation:
- the PGN is converted into a tree
- the puzzle's `initialPly` determines the starting point
- `initialPath` is derived from the mainline node list
- `pov` is derived from the side to solve
- the controller initially sets path to the node before the first solving move
- then jumps to `initialPath`

This means Lichess standard puzzles are not built like retrospection:
- they start from a prebuilt puzzle object with a known solution line
- the board is prepared around the puzzle's opening context and initial move boundary

## Layout structure

The main view has four major regions:

1. Side panel
- replay progress, if replay mode
- puzzle metadata
- user rating box or streak box
- theme area
- config area

2. Main board
- chessground
- promotion UI

3. Tools column
- ceval voice bar if present
- ceval block if analysis is shown
- move tree / replay tree
- feedback or post-completion panel

4. Bottom controls
- jump first/prev/next/last
- board menu toggle

## Feedback states

During solving, `feedback.ts` renders:
- `init`: "your turn / find the best move"
- `good`: correct move, keep going
- `fail`: wrong move, try something else

Once `mode === 'view'`, feedback switches to the after/summary panel in `after.ts`.

## Solve checking

Standard puzzles use strict line checking in:
- [sources/ui/puzzle/src/moveTest.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/puzzle/src/moveTest.ts)

What it does:
- ignores checks when not under the initial path
- only evaluates positions where the played side matches puzzle POV
- compares the played continuation against `data.puzzle.solution`
- supports alternate castle encodings
- marks nodes as:
  - `good`
  - `fail`
  - `win`

This is a hard, line-based solve model, not ceval-approximate retrospection.

## Solution viewing

The player can:
- ask for a hint
- view the solution

This is controlled by:
- `canViewSolution`
- `showHint`
- `hintHasBeenShown`

The UI exposes:
- `Get a hint`
- `View the solution`

These affordances are not always immediately available:
- display is intentionally delayed for a few seconds after initiation

## Completion

After completion:
- the UI enters `view` mode
- the player sees completion messaging
- authenticated users can vote up/down
- continuation actions appear
- there is a practice/computer link for the final position when appropriate

This lives in [sources/ui/puzzle/src/view/after.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/puzzle/src/view/after.ts).

## Session tracking

Standard training records session rounds in:
- [sources/ui/puzzle/src/session.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/puzzle/src/session.ts)

The session strip in the main view:
- shows prior puzzle results
- highlights the current puzzle
- can link back into earlier puzzles

## Replay, themes, openings, and player lookup

The classic puzzle product is larger than the board view:
- replay mode for recently missed theme puzzles
- theme pages
- opening pages
- player-game lookup pages
- history / dashboard pages

These are routed through `Puzzle.scala` and rendered server-side through `PuzzleUi.scala`.
