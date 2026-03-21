# Product Map

This document answers the basic question: what does "Lichess puzzle functionality" actually include in source?

## Confirmed puzzle products

### 1. Standard puzzle training
- Main route family: `/training`
- Main UI app: `ui/puzzle/src`
- Main controller: [sources/ui/puzzle/src/ctrl.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/puzzle/src/ctrl.ts)
- Server entry: [sources/app/controllers/Puzzle.scala](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/app/controllers/Puzzle.scala)

This is the classic Lichess tactic trainer with:
- theme / opening angle selection
- difficulty settings
- rating / casual toggle
- session dots
- hint / solution reveal
- vote / report / continue flow
- replay and history/dashboard integration

### 2. Puzzle Streak
- Route: `/streak`
- Server route owned by `controllers.Puzzle`
- Frontend still uses the standard puzzle app with streak data
- Distinct streak state owner: [sources/ui/puzzle/src/streak.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/puzzle/src/streak.ts)

This is not a separate UI app. It is a variant of the standard puzzle controller with:
- different persistence
- different completion behavior
- skip support
- different side panel / feedback and session semantics

### 3. Puzzle Storm
- Route family: `/storm`
- Separate frontend app: `ui/storm/src`
- Main controller: [sources/ui/storm/src/ctrl.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/storm/src/ctrl.ts)
- Server entry: [sources/app/controllers/Storm.scala](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/app/controllers/Storm.scala)

Storm is a speed/timed puzzle product with:
- timed runs
- combo and clock modifiers
- no side move tree
- simpler board-side UI
- separate dashboard/history/high score flows

### 4. Puzzle Racer
- Route family: `/racer`
- Separate frontend app: `ui/racer/src`
- Main controller: [sources/ui/racer/src/ctrl.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/racer/src/ctrl.ts)
- Server entry: [sources/app/controllers/Racer.scala](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/app/controllers/Racer.scala)

Racer is the confirmed multiplayer puzzle product in inspected source.

This is the closest thing to a puzzle "battle mode" that is directly visible here:
- lobby / owner / join / rematch flow
- websocket race state
- track/rank visual layer
- skip button
- countdown
- live score updates

## Shared runtime

Storm and Racer both rely on shared puzzle runtime code in:
- [sources/ui/lib/src/puz/run.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/lib/src/puz/run.ts)
- [sources/ui/lib/src/puz/current.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/lib/src/puz/current.ts)
- [sources/ui/lib/src/puz/filters.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/lib/src/puz/filters.ts)
- [sources/ui/lib/src/puz/view/chessground.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/lib/src/puz/view/chessground.ts)

This shared layer owns:
- per-puzzle line playback
- expected move checking for timed modes
- board config
- shared filters
- run metadata
- combo/history rendering helpers

## Important distinction from retrospection

Retrospection:
- lives inside analysis
- starts from game-review candidate mistakes
- manipulates analysis controller state

Puzzle products:
- start from a prepared puzzle object
- use dedicated puzzle product controllers
- often own their own board state and page layout
- are not analysis-board submodes

## Practical Patzer takeaway

If Patzer wants:
- Learn From Your Mistakes parity, use the retrospection folders first
- standalone local puzzle product parity, use this folder first
- multiplayer/competitive inspiration, Racer is the confirmed source-backed reference
