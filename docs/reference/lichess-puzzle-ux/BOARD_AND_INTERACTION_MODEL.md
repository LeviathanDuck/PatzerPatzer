# Board and Interaction Model

This document focuses on how puzzle products manipulate chessground, move legality, tree state, arrows, and board controls.

## Standard puzzle board

The standard puzzle board config is in:
- [sources/ui/puzzle/src/view/chessground.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/puzzle/src/view/chessground.ts)

Key properties:
- coordinates follow user prefs
- destinations and highlights follow prefs
- drag/select modes follow move-event prefs
- promotion flow is supported
- premoves can become enabled in certain post-user-move states
- drawable arrows are always enabled
- context menu is disabled

## When the user is allowed to move

Classic puzzle move permission is derived from:
- current node ply
- puzzle POV
- whether the next node exists
- whether the next node is marked `fail`
- whether the controller is in `view`

This matters because Lichess puzzles are not just "board always movable if it is your turn."
The board is explicitly gated by puzzle solve state.

## Tree and jump behavior

Classic puzzles still keep a tree and move list:
- [sources/ui/puzzle/src/view/tree.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/puzzle/src/view/tree.ts)
- [sources/ui/puzzle/src/control.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/puzzle/src/control.ts)

Important behavior:
- tree rows are clickable
- jump controls navigate first/prev/next/last
- `last()` and `first()` are puzzle-aware and account for `initialPath`
- the active move and current puzzle start move are visually distinct
- node puzzle status (`good`, `fail`, `win`, `retry`) becomes move-list classes and glyphs

## Hinting, arrows, and annotations

Standard puzzle auto-shapes are in:
- [sources/ui/puzzle/src/autoShape.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/puzzle/src/autoShape.ts)

Confirmed behavior:
- hovering ceval lines can produce pale blue arrows
- analysis mode can add green best arrows and blue/grey alternatives
- threat mode adds red threat arrows
- hinting can place a green hint square
- puzzle feedback states add glyph-like annotations

This means the standard puzzle board is not "engine free" in all contexts.
It can expose engine/PV visuals when analysis is enabled.

## Multiple-solution monitoring

Classic puzzle mode also uses board-local ceval for quality control:
- [sources/ui/puzzle/src/report.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/puzzle/src/report.ts)

Important facts:
- only runs in `view` mode
- avoids mate puzzles
- avoids 7-piece tablebase positions
- uses deep local eval thresholds
- can trigger a report dialog for ambiguous puzzles

So the board is not only a solve surface. It is also a post-completion quality-audit surface.

## Shared Storm/Racer board model

Storm and Racer do not use the standard puzzle controller.
They use the shared runtime under `ui/lib/src/puz`.

Core files:
- [sources/ui/lib/src/puz/current.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/lib/src/puz/current.ts)
- [sources/ui/lib/src/puz/run.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/lib/src/puz/run.ts)
- [sources/ui/lib/src/puz/view/chessground.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/lib/src/puz/view/chessground.ts)

Shared model:
- each timed puzzle has a line string
- `CurrentPuzzle` tracks `moveIndex`
- board FEN is rebuilt from the puzzle's starting FEN plus line prefix
- expected move is derived directly from the next line move
- the board is a simpler solving surface without standard puzzle tree UX

## Storm board behavior

Storm:
- starts with a "move to start" affordance
- uses countdown/run clock semantics
- has explicit end/reload buttons
- keeps the board and side stats tight and speed-oriented

Key files:
- [sources/ui/storm/src/ctrl.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/storm/src/ctrl.ts)
- [sources/ui/storm/src/view/main.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/storm/src/view/main.ts)

## Racer board behavior

Racer:
- hides the real puzzle board before race start for spectators/non-players
- shows a countdown overlay
- pushes score and rank into the primary experience
- has skip support
- uses websocket updates for race state

Key files:
- [sources/ui/racer/src/ctrl.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/racer/src/ctrl.ts)
- [sources/ui/racer/src/view/board.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/racer/src/view/board.ts)
- [sources/ui/racer/src/view/main.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/racer/src/view/main.ts)

## Important product distinction

Standard training:
- rich metadata
- move tree
- post-solve voting/reporting
- theme/opening/replay/history ecosystem

Storm/Racer:
- simplified board loop
- run-scoring and speed pressure
- shared low-friction puzzle line playback

Patzer should not collapse these into one imagined "puzzle mode."
