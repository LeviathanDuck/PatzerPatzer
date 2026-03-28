# Patzer Pro — Puzzle V1 Plan

This document defines the first real puzzle-product plan for Patzer Pro.

Status note:
- the initial Puzzle V1 implementation sequence has now been completed in code
- this document should now be read as the product-intent and gap-reference doc for the live
  puzzle product, not as a statement that Puzzle V1 does not exist yet

It is intentionally stricter than brainstorming notes. Where earlier notes were too broad or
internally inconsistent, this plan chooses a smaller, safer V1 shape.

## Current Repo Reality

Patzer Pro now has both:

- the original review-driven puzzle foundation work
- a live standalone Puzzle V1 surface

Review-side foundation already present:

- game import from multiple sources
- analysis board and Game Review flow
- bulk review
- Learn From Your Mistakes / retrospection candidate building
- saved puzzle-candidate extraction and persistence

Current live puzzle-product reality:

- live `#/puzzles` and `#/puzzles/:id` routes
- standalone puzzle library and round views
- canonical puzzle domain types
- Puzzle V1 persistence for definitions, attempts, and user metadata
- imported Lichess shard loading plus user-library puzzle support
- retry/due-again and future rated-mode hooks

What the repo still does not have:

- a fully built-out board ownership architecture
- a fully stabilized final puzzle UX
- a server/user-account system

Board ownership is still a target state, not fully current reality.

Target board ownership architecture:

- shared board subsystem
- analysis board
- puzzle board

Current reality:

- the shared board subsystem is only partially formalized
- the analysis board is still the more mature board product
- the puzzle board now exists as a live second product board, but the shared-board boundary is not
  yet clean enough to call finished

## V1 Product Goal

Puzzle V1 should let the user:

- review games in Patzer Pro
- save learnable moments into a personal puzzle library
- load puzzles from two top-level sources:
  - Imported Puzzles (Lichess database)
  - User Library (personal Patzer-owned saved puzzles)
- solve those puzzles in a dedicated puzzle board
- retain permanent attempt history per puzzle
- retry earlier failed or assisted puzzles later

Puzzle V1 is not trying to ship:

- account login
- cloud sync
- rated puzzle progression
- a full source-game ingestion pipeline for all imported Lichess puzzles
- nested folder trees
- a full spaced-repetition scheduler

## Lichess Reference And Intentional Divergences

Lichess remains the reference for:

- puzzle-board solve flow
- puzzle-round feedback rhythm
- opponent move playback at puzzle start
- move-tree visibility rules
- puzzle-session progression behavior
- overall separation between board runtime and puzzle product logic

Patzer V1 intentionally diverges from Lichess in these ways:

- Patzer allows free side-variation exploration during puzzle solving. Lichess locks the board to
  the solution path during solving. Patzer lets the user explore freely using the full move tree,
  but strict correctness grading still applies — the attempt log records whether the user found the
  stored solution, not whether they explored alternatives along the way.
- Patzer may run engine evaluation quietly in the background during puzzle solving.
- Patzer may show graded move-quality feedback for non-solution moves.
- Patzer may allow optional engine reveal tools during puzzle solving.
- Patzer personal puzzles are user-library items with notes, tags, folders, and persistent
  attempt history.

These are deliberate product decisions, not accidental parity drift.

Important constraint:

- Lichess-style strict stored solution remains the correctness model.
- Engine feedback is an assist layer, not the source of truth for whether a puzzle is solved.

## Puzzle Sources

V1 supports two top-level puzzle sources in the same product:

1. Imported Puzzles
- sourced from the downloaded Lichess puzzle database already stored in the repo
- stable external puzzle identity

2. User Library
- sourced from Patzer-reviewed games and user-created puzzle saves
- user-owned metadata and organization

These sources should share one puzzle runtime, but they should not share one naive flat data model.

Recommended model:

- one shared puzzle-round runtime
- distinct source-specific puzzle definitions
- shared solve-result and attempt-log model

In practice this means a discriminated union, not one loose catch-all object.

## Core Data Model

Puzzle V1 should separate these concepts:

### PuzzleDefinition

The canonical puzzle itself.

Required fields for all puzzle definitions:

- `id`
- `sourceKind` (`imported-lichess` or `user-library`)
- `startFen`
- `solutionLine`
- `strictSolutionMove`
- `createdAt` or imported-source timestamp where applicable

Imported Lichess puzzle definition should include:

- source puzzle id
- rating
- rating deviation
- popularity
- plays
- themes
- opening tags
- game URL

User-library puzzle definition should include:

- full PGN where available
- source game id where available
- source path / move reference
- source reason
- title
- notes
- tags
- created timestamp

### UserPuzzleMetadata

User-owned mutable metadata attached to a puzzle:

- folder memberships
- notes
- custom tags
- favorite/star state
- hidden/completed filters if needed later

Do not bake these into solve-attempt state.

### PuzzleAttempt

Append-only solve history for a user and a puzzle.

Required fields:

- `puzzleId`
- `startedAt`
- `completedAt`
- `resultState`
- `failureReasons[]`
- `firstWrongPly` when applicable
- `usedHint`
- `usedEngineReveal`
- `openedNotesDuringSolve`
- `revealedSolution`
- `skipped`

This model is required because a single boolean like "failed first attempt" is not enough for
spaced repetition, library sorting, or future rated mode.

## Solve States

V1 solve states:

- `clean-solve`
- `recovered-solve`
- `assisted-solve`
- `skipped`

Failure/assistance reasons should be logged in detail:

- wrong first move
- wrong later move
- hint used
- engine arrows shown
- engine lines shown
- notes opened during solve
- solution revealed
- skip pressed

Rules:

- strict solution is required for a puzzle to count as solved
- any assistance or wrong move means the solve is not clean
- global completion/repetition status is puzzle-based, not folder-based

Shared result model rule:

- Learn From Your Mistakes outcomes must use the same solve-state and result concepts as puzzle
  attempts (`clean-solve`, `recovered-solve`, `assisted-solve`, `skipped`)
- this is required so that LFYM moments saved into the user puzzle library already carry compatible
  attempt history rather than requiring a separate conversion step
- LFYM and the puzzle library share one result model, not two parallel models that must be reconciled
  later

## Strict Validation vs Graded Feedback

Patzer V1 uses two separate ideas:

1. Strict validation
- determines whether the puzzle is actually solved
- uses the stored solution

2. Graded feedback
- explains whether a non-solution move improved or worsened the position
- may display eval delta and `better / worse / best` style feedback

For all puzzle sources in V1:

- stored solution wins
- engine feedback does not override puzzle correctness

If the stored solution says move A and the background engine prefers move B:

- move A remains the required solve move
- the UI may say the engine prefers B and show the eval difference

This is an intentional Patzer divergence and must be documented clearly in the product.

## Engine Behavior

V1 requirement:

- the engine runs in the background during puzzle solving

Required UI behavior on non-best move:

- show eval delta from the user's solving perspective
- show a better/worse/best label
- prompt retry on anything less than the stored best move
- only reveal best move if the user explicitly asks

Perspective rule:

- eval delta is shown relative to the solving side, not raw white-centric eval
- if Black improves from `-2.0` to `-4.0`, that should display as a positive improvement for
  the solver

Planned concept:

- `PuzzleMoveQuality` should be the shared assist-feedback concept used in:
  - puzzle board
  - Learn From Your Mistakes retrospective mode

Important limitation:

- engine-always-on is a hard V1 requirement, but it is also a real performance risk
- this must be treated as a product choice with validation and profiling, not as a free behavior

## Personal Puzzle Creation Paths

Approved personal puzzle creation paths for V1:

- save from Learn From Your Mistakes
- bulk-save missed moments after review
- right-click move and create puzzle manually

Manual creation requires two explicit flows:

1. Selected move is the puzzle solution
- puzzle starts from the move before
- selected move becomes the required solution

2. Selected move is the puzzle start position
- engine best move becomes the required solution
- user must be allowed to verify that move before saving

Important distinction:

- a manually saved move is not automatically a canonical tactical puzzle
- Patzer should still allow the user to create it, but the creation flow must define whether this
  is a true solution move or a start-position drill

### Learn From Your Mistakes Session-End Flow

When a Learn From Your Mistakes session ends, the product should offer a focused follow-up:

- redo only the moments the user got wrong on the first attempt
- save selected failed moments into the personal puzzle library for later review

The save action should confirm silently and keep the user on the analysis page. Navigation to
`/puzzles` is the user's choice afterward.

Rule:

- LFYM and the puzzle library must share one storage and result model, not two separate systems
  that require later reconciliation
- this means LFYM moments saved to the library are already canonical puzzle definitions with
  compatible attempt history at save time

### Expanded Detection Families As Puzzle Pipeline Inputs

The current learnable-moment detection supports `swing` and `missed-mate` families. Additional
detection families are being added:

- `collapse` (blown wins / failed conversion)
- defensive resource (missed saves while already worse)
- punish-the-blunder (opponent erred and the user failed to exploit it)

These families expand what flows into the puzzle library through LFYM saves and bulk-save-after-
review. The save flows and canonical puzzle model must not be designed only for the current
swing/missed-mate shape — they must accommodate moments from any detection family, carrying the
source reason metadata so the library can filter and organize by family later.

### Manual Puzzle Import From Desktop

This is not defined well enough to be core V1.

Recommendation:

- defer wide-format manual puzzle import
- if imported in the early product at all, support only one narrow, explicit format later

"As wide ranging as possible" is not a V1-safe requirement.

## Library Model

Top-level library sections:

- Imported Puzzles
- User Library

User Library organization:

- user-facing "folders"
- sorted alphabetically
- one puzzle may belong to multiple folders

Recommended implementation model:

- flat collections with many-to-many puzzle membership
- not nested folders

Reason:

- nested folder trees plus global completion state add unnecessary complexity to V1
- multiple memberships already imply collection semantics, not a simple filesystem tree

Folder list sort:

- alphabetical

Puzzle list sort inside a user folder:

1. failed-first-attempt / assisted / due-again puzzles
2. unsolved puzzles
3. clean-solved puzzles

## Library Default Load Behavior

When the puzzle page opens:

- show Imported Puzzles and User Library as the top-level distinctions

When a user opens a User Library folder:

- failed-first-attempt or due-again puzzles rise to the top
- unsolved puzzles come next
- clean-solved puzzles remain visible but lower by default

Global completion status is puzzle-based:

- if a puzzle appears in multiple folders, its solve state is shared across them

## Spaced Repetition

Minimum V1 spaced-repetition behavior:

- support retrying earlier failed or assisted puzzles
- preserve enough metadata to schedule future repetitions later

V1 does not need a full repetition algorithm.

Minimum viable implementation:

- every non-clean solve remains globally flagged
- the user can explicitly retry failed/assisted puzzles later
- the model stores timestamps so a future "repeat after one week" rule can be added cleanly

Do not pretend V1 has a full repetition system if it does not.

## Imported Lichess Puzzle Constraints

Imported Lichess puzzles should be treated honestly.

Current reality:

- the official puzzle database gives puzzle records, not full source-game PGN
- current locally generated shard records follow that shape

Therefore:

- full PGN for imported Lichess puzzles is not a reliable V1 requirement
- imported puzzles should use the metadata they actually have:
  - FEN
  - solution moves
  - puzzle metadata
  - source game URL

If full PGN is ever required for imported public puzzles, that is a separate source-game
ingestion pipeline and is out of scope for V1.

## Puzzle Board Layout

Desired V1 layout:

- chessboard centered
- board smaller than the analysis board
- left sidebar for source and library selection
- puzzle progress UI visible during a session
- navigation module present near the move-list area

Important note:

- this layout is a product goal, not the first implementation dependency
- board ownership cleanup and the puzzle data model come first

## Progress UI

The session progress UI should support at least:

- current puzzle position in the loaded session
- visual state per puzzle
- optional auto-next toggle

Target user-facing status colors:

- green: clean solve
- yellow: recovered or assisted solve
- red: skipped

This is a UI simplification over the richer logged result states.

## Board Ownership Prerequisite

Board ownership cleanup is a prerequisite for puzzle V1.

Before the standalone puzzle board is rebuilt, Patzer should explicitly define:

- what belongs to the shared board subsystem
- what belongs to the analysis board only
- what belongs to the puzzle board only

This should be documented with a board capability/ownership matrix.

## Future But Explicitly Out Of Scope For V1

- login and user accounts
- cloud sync
- rated puzzle progression
- puzzle rating changes based on puzzle difficulty
- a `Rated` toggle in the puzzle library
- full PGN enrichment for imported Lichess puzzle database
- nested folder trees
- broad-format desktop puzzle import

These should be preserved as future requirements, not quietly pulled into V1.

## V1 Build Order

1. Board ownership cleanup and capability matrix
2. Puzzle data model
3. Attempt-log and solve-state model
4. Personal puzzle save flow from retrospection/review
5. Minimal user-library browsing
6. Standalone puzzle board runtime
7. Imported Lichess puzzle browsing in the same product
8. Graded move-quality feedback and assist-state logging
9. Retry-failed flow
10. Later repetition rules

## Open Follow-Up Questions

These are narrowed enough to plan later without blocking V1 definition:

- exact wording and UI treatment for graded move-quality messages
- whether notes opened during solve should be hidden until after first attempt
- exact compact session-navigation design
- exact future import format for user-owned desktop puzzle uploads
- exact repetition scheduling rule after V1
