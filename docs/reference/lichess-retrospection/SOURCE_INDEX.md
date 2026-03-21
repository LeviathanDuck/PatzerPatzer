# Source Index

This index maps the relevant Lichess source files to the questions they answer.

## Retrospection Candidate Discovery

### `ui/analyse/src/nodeFinder.ts`

Why it matters:
- contains the actual `evalSwings(...)` candidate selector used by retrospection
- defines the hard minimum conditions for a move to become a learn candidate

Confirmed responsibilities:
- filter mainline nodes to candidate mistakes
- require both current and previous evals
- require a computer alternative move on the previous node
- apply the visible swing threshold and mate-loss fallback rule

Questions this file answers:
- what counts as a candidate?
- what exact eval threshold is used?
- does Lichess require a stored best alternative line first?

## Advice And Eval Normalization

### `modules/tree/src/main/Advice.scala`

Why it matters:
- defines the move-quality labels that turn raw eval changes into review language

Confirmed responsibilities:
- classify cp-based mistakes using winning-chances loss thresholds
- classify mate-created and mate-lost cases separately
- assign `Inaccuracy`, `Mistake`, or `Blunder`

Questions this file answers:
- what exact thresholds back Lichess move-quality labels?
- how are mate cases treated?

### `ui/lib/src/ceval/winningChances.ts`

Why it matters:
- exposes the actual UI-side winning-chances transform used for eval comparison

Confirmed responsibilities:
- convert cp and mate scores into bounded winning-chances values
- compute `povDiff(...)`
- expose "similar enough" logic for puzzle-fault checks

Questions this file answers:
- what logistic coefficient is used?
- how does Lichess compare two evals in normalized space?

## Retrospection Controller

### `ui/analyse/src/retrospect/retroCtrl.ts`

Why it matters:
- the main source of truth for Learn From Your Mistakes control flow
- owns current candidate, feedback state, solved bookkeeping, and answer evaluation

Confirmed responsibilities:
- rebuild candidate list for the chosen color
- choose the next unsolved candidate
- derive `fault`, `prev`, and `solution`
- jump the board to the pre-mistake node
- cancel opening-theory moments using explorer data
- evaluate user answers through direct checks and ceval fallback
- hide computer lines until solved
- prevent normal next-move stepping in solving state

Questions this file answers:
- how does the board enter solve mode?
- what is the feedback state machine?
- when is a move accepted or rejected?
- how are opening moves cancelled?
- when does ceval fallback activate?

## Retrospection View

### `ui/analyse/src/retrospect/retroView.ts`

Why it matters:
- defines the user-facing solve loop states and transitions
- exposes progress logic and how incomplete/full analysis affects the end state

Confirmed responsibilities:
- render `find`, `offTrack`, `fail`, `win`, `view`, `eval`, and `end`
- show progress count
- expose "view solution", "skip", "next", "do it again", and color-flip actions

Questions this file answers:
- what does the user see in each state?
- what actions are available after success or failure?
- how does Lichess handle the no-mistakes / finished state?

## Analysis Controller Integration

### `ui/analyse/src/ctrl.ts`

Why it matters:
- retrospection is not self-contained; the main analysis controller wires it into path changes,
  ceval updates, line visibility, and tool toggles

Confirmed responsibilities relevant to retrospection:
- call `retro.onJump()` when path changes
- call `retro.onCeval()` when local ceval updates arrive on the current path
- call `retro.onMergeAnalysisData()` after server analysis data merges
- create/destroy retrospection via `toggleRetro()`
- suppress or force computer-line behavior through `hideComputerLine()` and `forceCeval()`
- close retrospection when conflicting tools are enabled

Questions this file answers:
- how does retrospection hook into normal board movement?
- how is ceval forwarded into the solve loop?
- what analysis-board UI behaviors change while retrospection is active?

## Public Puzzle Shape

### `modules/puzzle/src/main/Puzzle.scala`

Why it matters:
- canonical stored puzzle shape

Confirmed responsibilities:
- define puzzle ID, source game ID, start FEN, solution line, themes, rating, and play counts
- define `initialPly`, `fenAfterInitialMove`, and solving color

Questions this file answers:
- what does a published Lichess puzzle fundamentally store?
- where does the puzzle start relative to the first move in the line?

### `modules/puzzle/src/main/JsonView.scala`

Why it matters:
- shows how stored puzzle data is exposed to clients

Confirmed responsibilities:
- expose `solution` as `puzzle.line.tail`
- expose `fen`, `lastMove`, branch tree, initial ply, rating, and themes

Questions this file answers:
- what does the client receive for puzzle playback?
- how does Lichess derive the branch tree from the stored line?

## Public Puzzle Tagging and Rating

### `modules/puzzle/src/main/PuzzleTagger.scala`

Why it matters:
- visible example of post-creation puzzle enrichment

Confirmed responsibilities:
- add phase themes using `Divider`
- add hidden `checkFirst` theme when the first continuation move checks the king

Questions this file answers:
- what downstream tagging is performed after puzzle creation?
- what extra themes are inferred mechanically?

### `modules/puzzle/src/main/PuzzleFinisher.scala`

Why it matters:
- puzzle post-solve rating logic

Confirmed responsibilities:
- update puzzle/user Glicko after solves
- adjust rating weights by theme and solve result

Questions this file answers:
- how are already-created puzzles scored and updated?
- which themes are considered obvious or hinting?

Important non-answer:
- this file does not generate puzzles from games

### `ui/puzzle/src/report.ts`

Why it matters:
- shows one of the few visible quality-control paths for rejecting or reporting ambiguous puzzles

Confirmed responsibilities:
- detect apparent multiple-solution published puzzles from deep local eval
- gate reporting on strict depth/node/PV conditions

Questions this file answers:
- what puzzle ambiguity is bad enough to flag?
- what deep-search confidence does Lichess want before calling a puzzle faulty?

## What Is Not Visible Enough

The open-source repo does not clearly expose a complete, first-class "mine analyzed games into
public puzzle records" pipeline analogous to `retroCtrl.ts` for retrospection.

That means the following remain `unknown` or only partly inferable from this repo:

- the full upstream candidate-mining algorithm for public puzzles
- the full acceptance criteria for "puzzle-worthy" moments at ingestion time
- how source-game pools and analysis quality gates are combined before publication
- what non-public heuristics reject otherwise tactical-looking moments

Practical consequence:
- for Patzer Pro local imported-game puzzle finding, retrospection logic is the strongest direct
  reference
- public puzzle files are still useful, but mainly for storage/runtime shape rather than mining
