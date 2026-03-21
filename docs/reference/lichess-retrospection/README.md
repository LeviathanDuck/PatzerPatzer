# Lichess Retrospection Research

This folder is the high-detail reference set for how Lichess analysis retrospection works, what
the open-source repo does and does not reveal about puzzle generation, and what Patzer Pro can
safely borrow for local reviewed-game puzzle finding.

For the separate UX and board-interaction reference set, use:

- [docs/reference/lichess-retrospection-ux/README.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection-ux/README.md)

For the separate standalone puzzle-product reference set, use:

- [docs/reference/lichess-puzzle-ux/README.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/README.md)

This research is intentionally strict about evidence:

- `confirmed` means the behavior is directly visible in the checked source files
- `inference` means the conclusion is strongly suggested by the visible code
- `unknown` means the open-source repo does not expose enough of the upstream pipeline to prove it

Use this folder when answering questions such as:

- How does Lichess choose "Learn from your mistakes" moments?
- What exact thresholds does it use?
- How does the board transition into solve mode?
- When does it use local ceval fallback instead of exact move matching?
- What opening/book exceptions does it apply?
- What does the public puzzle module prove about puzzle shape and runtime?
- What puzzle-generation logic is missing from the open-source repo?
- What is the safest way for Patzer Pro to build a local puzzle finder from reviewed imported games?

## File Guide

- [SOURCE_INDEX.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection/SOURCE_INDEX.md)
  Source inventory, ownership boundaries, and why each file matters.
- [RETROSPECTION_FLOW.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection/RETROSPECTION_FLOW.md)
  End-to-end Learn From Your Mistakes control flow, state machine, board transitions, and solve
  semantics.
- [ANALYSIS_AND_ADVICE_FOUNDATIONS.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection/ANALYSIS_AND_ADVICE_FOUNDATIONS.md)
  The underlying winning-chances math and move-classification logic that make a moment
  "mistake-worthy" before retrospection ever runs.
- [PARAMETERS_AND_THRESHOLDS.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection/PARAMETERS_AND_THRESHOLDS.md)
  Concrete numeric thresholds, gating rules, and candidate requirements.
- [PUZZLE_PIPELINE_VISIBLE.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection/PUZZLE_PIPELINE_VISIBLE.md)
  What the public puzzle module exposes about puzzle structure, serving, tagging, and what is not
  visible about upstream mining.
- [PATZER_IMPLICATIONS.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection/PATZER_IMPLICATIONS.md)
  Concrete implementation implications for Patzer Pro's local reviewed-game puzzle finder.

## Core Bottom Line

Lichess retrospection is not a generic puzzle browser. It is a personalized training loop built
from already-analyzed mainline game data on the analysis board. The key visible ingredients are:

- candidate selection from reviewed mainline eval swings
- a requirement that the pre-mistake node already contains a computer alternative child
- a board jump to the position before the mistake
- a dedicated feedback state machine
- opening/book cancellation in early standard positions
- exact-solution acceptance in obvious cases and local-ceval fallback in less certain cases

The open-source puzzle module, by contrast, clearly shows how already-created puzzles are stored,
served, themed, and rated, but it does not fully expose the upstream mining pipeline that turns raw
analyzed games into published puzzles.

That distinction matters for Patzer Pro:

- Lichess retrospection is the best reference for a local "learn from mistakes" feature
- Lichess puzzle serving is a secondary reference for long-term saved-puzzle shape and runtime
- the upstream "what is puzzle-worthy" mining algorithm is only partially inferable from this repo
