# Source Index

This index is organized by responsibility, not by file extension.

## Routing and server entry

- [sources/conf/routes](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/conf/routes)
  Route map for `/training`, `/streak`, `/storm`, `/racer`, dashboard, replay, history, voting, reporting, and theme/difficulty actions.
- [sources/app/controllers/Puzzle.scala](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/app/controllers/Puzzle.scala)
  Standard puzzle training, streak, replay, history, openings, themes, completion, voting, and reporting routes.
- [sources/app/controllers/Storm.scala](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/app/controllers/Storm.scala)
  Storm home, record, dashboard, API.
- [sources/app/controllers/Racer.scala](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/app/controllers/Racer.scala)
  Racer home, create, join, show, rematch, lobby, API.
- [sources/modules/puzzle/src/main/ui/PuzzleUi.scala](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/modules/puzzle/src/main/ui/PuzzleUi.scala)
  Server-side page shell, JSON wiring, themes/openings pages, player lookup page.

## Standard puzzle runtime

- [sources/ui/puzzle/src/ctrl.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/puzzle/src/ctrl.ts)
  Central controller for classic puzzles.
- [sources/ui/puzzle/src/control.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/puzzle/src/control.ts)
  Navigation commands.
- [sources/ui/puzzle/src/moveTest.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/puzzle/src/moveTest.ts)
  Validates user progress against solution line.
- [sources/ui/puzzle/src/moveTree.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/puzzle/src/moveTree.ts)
  PGN-to-tree and solution-line merging logic.
- [sources/ui/puzzle/src/report.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/puzzle/src/report.ts)
  Multiple-solution reporting based on deep local eval.
- [sources/ui/puzzle/src/session.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/puzzle/src/session.ts)
  Session dots/history strip persistence.
- [sources/ui/puzzle/src/streak.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/puzzle/src/streak.ts)
  Streak-specific persistence and progression.
- [sources/ui/puzzle/src/autoShape.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/puzzle/src/autoShape.ts)
  Engine arrows, hint square, feedback glyphs.
- [sources/ui/puzzle/src/interfaces.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/puzzle/src/interfaces.ts)
  Data contracts.

## Standard puzzle UI

- [sources/ui/puzzle/src/view/main.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/puzzle/src/view/main.ts)
  Top-level page layout.
- [sources/ui/puzzle/src/view/side.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/puzzle/src/view/side.ts)
  Side panel sections: metadata, replay, user rating, config, difficulty.
- [sources/ui/puzzle/src/view/feedback.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/puzzle/src/view/feedback.ts)
  In-play feedback state box.
- [sources/ui/puzzle/src/view/after.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/puzzle/src/view/after.ts)
  Post-completion UI.
- [sources/ui/puzzle/src/view/chessground.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/puzzle/src/view/chessground.ts)
  Standard puzzle chessground config.
- [sources/ui/puzzle/src/view/tree.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/puzzle/src/view/tree.ts)
  Move tree display with puzzle glyphs.

## Shared timed/competitive runtime

- [sources/ui/lib/src/puz/current.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/lib/src/puz/current.ts)
  Current puzzle line playback, expected move, sound.
- [sources/ui/lib/src/puz/run.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/lib/src/puz/run.ts)
  Shared chessground option builder and POV message.
- [sources/ui/lib/src/puz/filters.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/lib/src/puz/filters.ts)
  Fail / slow / skip filters.
- [sources/ui/lib/src/puz/interfaces.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/lib/src/puz/interfaces.ts)
  Shared runtime contracts.
- [sources/ui/lib/src/puz/view/chessground.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/lib/src/puz/view/chessground.ts)
  Shared board config for Storm/Racer.
- [sources/ui/lib/src/puz/view/history.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/lib/src/puz/view/history.ts)
  Post-run history table.
- [sources/ui/lib/src/puz/view/util.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/lib/src/puz/view/util.ts)
  Shared visual helpers / modifiers.

## Storm

- [sources/ui/storm/src/ctrl.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/storm/src/ctrl.ts)
- [sources/ui/storm/src/storm.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/storm/src/storm.ts)
- [sources/ui/storm/src/view/main.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/storm/src/view/main.ts)

## Racer

- [sources/ui/racer/src/ctrl.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/racer/src/ctrl.ts)
- [sources/ui/racer/src/view/main.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/racer/src/view/main.ts)
- [sources/ui/racer/src/view/board.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/racer/src/view/board.ts)

## Styling snapshots

Standard puzzle:
- [sources/ui/puzzle/css/](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/puzzle/css/)

Storm:
- [sources/ui/storm/css/](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/storm/css/)

Racer:
- [sources/ui/racer/css/](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/racer/css/)
