# Competitive and Alternative Modes

This document covers the non-classic puzzle products that still belong to the Lichess puzzle family.

## Puzzle Streak

Puzzle Streak is not a separate frontend app.
It is a standard puzzle variant layered on top of the classic controller.

Key files:
- [sources/ui/puzzle/src/streak.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/puzzle/src/streak.ts)
- [sources/app/controllers/Puzzle.scala](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/app/controllers/Puzzle.scala)

Confirmed behavior:
- current streak state is locally stored
- it tracks ordered puzzle ids and current index
- win advances streak
- fail clears streak and ends run
- skip behavior is part of streak state
- streak changes the side panel and completion behavior

## Puzzle Storm

Storm is a distinct speed-run product.

Key files:
- [sources/ui/storm/src/ctrl.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/storm/src/ctrl.ts)
- [sources/ui/storm/src/view/main.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/storm/src/view/main.ts)
- [sources/app/controllers/Storm.scala](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/app/controllers/Storm.scala)

Confirmed UX/runtime traits:
- starts with a "move to start" gate
- run clock starts on actual solving
- wrong moves apply a time malus
- combo can add time bonuses
- reload and force-end controls are first-class UI
- duplicate tab detection exists
- late-start expiration exists
- dashboard/high score is a dedicated product surface

Storm is clearly a time-attack product, not a themed study flow.

## Puzzle Racer

Racer is the clearest confirmed multiplayer puzzle product in visible source.

Key files:
- [sources/ui/racer/src/ctrl.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/racer/src/ctrl.ts)
- [sources/ui/racer/src/view/main.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/racer/src/view/main.ts)
- [sources/ui/racer/src/view/board.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/racer/src/view/board.ts)
- [sources/app/controllers/Racer.scala](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/app/controllers/Racer.scala)

Confirmed UX/runtime traits:
- explicit lobby vs non-lobby race types
- owner/start/join flows
- websocket race state
- player tracks and ranks
- live score submission
- skip mechanic
- countdown lights
- rematch/new-race flows
- spectator handling

## About "battle mode"

Important evidence-based conclusion:
- I did not find a standalone puzzle product called "battle" in the inspected puzzle routes/controllers/ui code
- the confirmed multiplayer competitive puzzle product here is Racer
- if someone says "puzzle battle mode" in Patzer planning, the safest source-backed interpretation is probably Racer unless they mean a different non-open-source or renamed surface

So:
- do not claim "Lichess battle mode" unless you can point to exact source
- do treat Racer as the confirmed multiplayer/battle-like reference in this repo

## Shared runtime vs custom product logic

Storm and Racer both use the shared `lib/puz` runtime for:
- board state
- current puzzle line
- run metadata
- filters

But each still owns:
- product-specific controller
- side panel
- scoring/ranking
- pre/post-run UX
- server entrypoints

This is important architectural evidence:
- Lichess does not force all puzzle products into one controller
- shared puzzle mechanics are factored, but product-specific UX still gets separate app layers
