# Lichess Puzzle UX and Runtime Reference

This folder is the Patzer Pro source-of-truth reference for how Lichess puzzle functionality is actually built in the open-source repo.

Use this folder for any work related to:
- puzzle UX
- puzzle board behavior
- puzzle training flow
- puzzle filters, themes, openings, replay, history, dashboard
- Puzzle Streak
- Puzzle Storm
- Puzzle Racer
- any Patzer feature that wants to feel like Lichess puzzle products

This folder is intentionally broader than `docs/reference/lichess-retrospection-ux/`.

Scope:
- `lichess-retrospection-ux/` is for Learn From Your Mistakes on the analysis board
- `lichess-puzzle-ux/` is for the standalone puzzle product family

Hard rule:
- for puzzle UX, runtime, or board-state behavior, inspect this folder first
- then inspect the copied source snapshots here
- then inspect upstream Lichess source if you still need more detail
- do not invent puzzle-product behavior from memory

Important boundary:
- standard `/training` puzzles, Puzzle Streak, Puzzle Storm, and Puzzle Racer are related but not the same product
- the open-source repo clearly exposes these as separate apps with some shared runtime code
- there is no confirmed standalone "puzzle battle" product in the inspected source under that exact name
- the closest confirmed multiplayer puzzle product in source is Puzzle Racer

Start here:
- [PRODUCT_MAP.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/PRODUCT_MAP.md)
- [SOURCE_INDEX.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/SOURCE_INDEX.md)
- [STANDARD_PUZZLE_FLOW.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/STANDARD_PUZZLE_FLOW.md)
- [BOARD_AND_INTERACTION_MODEL.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/BOARD_AND_INTERACTION_MODEL.md)
- [FILTERS_THEMES_AND_SELECTION.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/FILTERS_THEMES_AND_SELECTION.md)
- [COMPETITIVE_AND_ALT_MODES.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/COMPETITIVE_AND_ALT_MODES.md)
- [PATZER_IMPLICATIONS.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/PATZER_IMPLICATIONS.md)

Copied source snapshots live in:
- [sources/](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/)

Related references:
- [docs/reference/lichess-retrospection/README.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection/README.md)
- [docs/reference/lichess-retrospection-ux/README.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection-ux/README.md)
