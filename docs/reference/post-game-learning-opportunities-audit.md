# Post-Game Learning Opportunities Audit

Date: 2026-03-27

Scope:
- what additional "learnable moments" Patzer Pro could extract after a game is reviewed
- how those ideas compare to Lichess, Chess.com, Aimchess, ChessTempo, and DecodeChess
- how each idea would add to, change, or interact with Patzer Pro's current implementation

This document is a product-and-implementation synthesis.
It is not a pure Lichess parity document.

Use this when answering:
- what kinds of post-game learning should Patzer support beyond missed tactics?
- which ideas are already mostly supported by the current review data model?
- which ideas require new infrastructure instead of just a new filter or menu?
- what should come next if the goal is "help me improve from my own reviewed games" rather than
  "just show me engine mistakes"?

---

## Executive Summary

Patzer already has the beginnings of a strong post-game learning stack, but it is currently
weighted toward one class of lesson:

- missed tactical opportunities
- clear retrospective mistake replay
- stricter saved puzzle extraction

That is good, but narrow.

The strongest competing products do something broader:

- Lichess turns reviewed mistakes into retryable board exercises
- Chess.com turns reviewed games into multi-angle insight categories
- Aimchess turns many analyzed games into weakness categories plus targeted drills
- ChessTempo turns mistakes into repeatable, motif-focused training sets
- DecodeChess turns notable positions into explanation-first learning

The big opportunity for Patzer is not merely "more puzzles".
It is to build more kinds of learnable moments from the reviewed game data you already store.

The best next families are:

1. blown wins / failed conversion
2. missed defensive resources
3. punish-the-blunder moments
4. opening departure moments
5. endgame technique moments
6. tactical motif moments
7. recurring habit insights across many games
8. explanation moments that tell the user why the move was bad

The key product rule:

- do not collapse all of these into one giant "puzzle finder"

Patzer should keep separate concepts for:

- missed moment
- retrospection candidate
- saved puzzle candidate
- recurring weakness insight
- explanation card

Those are related, but they are not the same thing.

---

## Current Patzer Baseline

Relevant current files:

- [src/engine/tactics.ts](/Users/leftcoast/Development/PatzerPatzer/src/engine/tactics.ts)
- [src/header/index.ts](/Users/leftcoast/Development/PatzerPatzer/src/header/index.ts)
- [src/analyse/retro.ts](/Users/leftcoast/Development/PatzerPatzer/src/analyse/retro.ts)
- [src/analyse/retroCtrl.ts](/Users/leftcoast/Development/PatzerPatzer/src/analyse/retroCtrl.ts)
- [src/puzzles/extract.ts](/Users/leftcoast/Development/PatzerPatzer/src/puzzles/extract.ts)
- [src/puzzles/index.ts](/Users/leftcoast/Development/PatzerPatzer/src/puzzles/index.ts)
- [docs/reference/lichess-retrospection/PATZER_IMPLICATIONS.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection/PATZER_IMPLICATIONS.md)

### 1. Missed-moment detection

Patzer already has a configurable missed-moment system in
[src/engine/tactics.ts](/Users/leftcoast/Development/PatzerPatzer/src/engine/tactics.ts).

Current categories:

- `swing`
- `missed-mate`
- `collapse`

Current user-facing settings live in the header global menu in
[src/header/index.ts](/Users/leftcoast/Development/PatzerPatzer/src/header/index.ts):

- swing threshold
- missed mate in N
- near-win floor
- collapse drop
- max ply

What this already gives Patzer:

- tactical-opportunity badges
- configurable post-review missed-moment detection
- a clean model for category-based post-game filtering

What it does not yet give:

- interactive board training
- explanation of why the moment mattered
- motif tagging
- cross-game weakness summaries

### 2. Learn From Your Mistakes retrospection

Patzer has a separate retrospection pipeline in
[src/analyse/retro.ts](/Users/leftcoast/Development/PatzerPatzer/src/analyse/retro.ts)
and [src/analyse/retroCtrl.ts](/Users/leftcoast/Development/PatzerPatzer/src/analyse/retroCtrl.ts).

Current live candidate logic:

- only reviewed mainline moves
- only the user's color
- require eval on parent and played node
- require stored best move on the parent position
- include:
  - `mistake`
  - `blunder`
  - missed mate in 3 or less
- opening cancellation exists through the opening-provider seam

What this already gives Patzer:

- Lichess-style retryable mistake moments
- a per-game solving loop
- a direct bridge from review to "try the better move"

What it does not yet give:

- configurable candidate families
- clear separation between tactical, strategic, defensive, opening, and endgame lessons
- cross-game aggregation

### 3. Saved puzzle extraction

Patzer also has a stricter saved-puzzle path in
[src/puzzles/extract.ts](/Users/leftcoast/Development/PatzerPatzer/src/puzzles/extract.ts).

Current logic:

- hard-coded `PUZZLE_CANDIDATE_MIN_LOSS = 0.14`
- require stored parent best move
- save position plus best move as a local puzzle candidate

What this already gives Patzer:

- a small, stricter downstream set of review-derived tactical positions
- a clean distinction between "reviewable mistake" and "saveable puzzle"

What it does not yet give:

- motif classification
- quality grading beyond raw loss threshold
- defensive puzzle types
- conversion or endgame-specific drills

---

## What Other Products Teach Us

## Lichess

Primary local references:

- [docs/reference/lichess-retrospection/README.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection/README.md)
- [docs/reference/lichess-retrospection/PARAMETERS_AND_THRESHOLDS.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection/PARAMETERS_AND_THRESHOLDS.md)
- [docs/reference/lichess-retrospection/RETROSPECTION_FLOW.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection/RETROSPECTION_FLOW.md)

What Lichess proves clearly:

- Learn From Your Mistakes is built from reviewed mainline swings
- it uses explicit numeric gates
- it requires an engine alternative line
- it starts from the pre-mistake position
- it cancels opening/book moments in early play
- it is a dedicated board mode, not just a badge list

What Lichess does not fully prove from open source:

- the full upstream public-puzzle mining pipeline
- all the stricter heuristics used to decide "publication-worthy puzzle"

Product lesson for Patzer:

- Lichess is the best reference for replayable mistake moments
- it is not the full reference for every kind of post-game lesson

## Chess.com

Official sources:

- [How does Game Review work?](https://support.chess.com/article/364-how-does-the-game-report-analysis-work)
- [What is Insights on Chess.com?](https://support.chess.com/article/3056-what-is-insights)
- [How can I see my opening stats?](https://support.chess.com/article/2138-how-can-i-see-my-opening-stats)
- [What is Practice on Chess.com?](https://support.chess.com/en/articles/8724749-what-is-practice-on-chess-com)

What Chess.com adds beyond a plain review board:

- game-shape summaries
- phase-based performance
- opening performance and "book exit" style tracking
- found vs missed tactical opportunities
- hanging-piece statistics
- move-quality trends
- piece-specific accuracy
- castling behavior
- time-of-day / calendar performance

Product lesson for Patzer:

- players learn not only from one mistake position
- they also learn from recurring patterns across many reviewed games

This is especially relevant for:

- opening performance
- endgame performance
- time management
- repeated tactical blind spots

## Aimchess

Official source:

- [Aimchess](https://aimchess.com/)

Aimchess is the strongest example of turning reviewed games into training categories instead of only
annotated move labels.

The six top-level weakness categories it advertises are:

- tactics
- endgame
- advantage capitalization
- resourcefulness
- time management
- opening performance

It then maps those categories into drills such as:

- retry mistakes
- advantage capitalization trainer
- opening improver
- defender
- time trainer
- checkmate patterns
- intuition trainer

Product lesson for Patzer:

- the strongest post-game training products separate "what went wrong" from "what drill should fix it"

This is a very good fit for Patzer's local-first model.

## ChessTempo

Official source:

- [ChessTempo mobile](https://cftest.chesstempo.com/mobile/)

What ChessTempo contributes to the model:

- solve past mistakes again
- defensive and winning training sets
- motif-targeted sets
- spaced repetition

Product lesson for Patzer:

- once Patzer can tag moments by type, it can build repeatable local sets instead of one-off review

## DecodeChess

Official source:

- [DecodeChess FAQ](https://decodechess.com/faq/)

What DecodeChess emphasizes:

- notable positions
- threats
- attacking plans
- concepts
- piece functionality
- explanation-first learning

Product lesson for Patzer:

- not every important reviewed moment needs to become a puzzle
- some moments should become explanations

---

## Most Promising New Learnable Moments For Patzer

Below, "implementation fit" describes how naturally the idea plugs into Patzer's current stack.

## 1. Blown Wins / Failed Conversion

Description:

- positions where the user had a strong advantage and failed to convert

Why it matters:

- this teaches "how to win winning positions", not just how to spot tactics

Market support:

- Aimchess calls this "advantage capitalization"
- Chess.com exposes phase/result/shape insights that often surface this pattern indirectly

Implementation fit:

- very high

Why:

- Patzer already has `collapse` in [tactics.ts](/Users/leftcoast/Development/PatzerPatzer/src/engine/tactics.ts)
- that means the detection substrate already exists

How it would add to current implementation:

- upgrade `collapse` from a badge/filter concept into a first-class training lane
- add a "Blown Wins" review mode or saved drill family

What it changes:

- no need to rewrite review math
- mostly changes categorization, surfaces, and drill routing

## 2. Missed Defensive Resources

Description:

- positions where the user was worse but had a saving move, best defense, perpetual idea, or drawing resource

Why it matters:

- current Patzer is much stronger at "you missed a tactic while better or equal" than at "you failed to defend"

Market support:

- Aimchess "resourcefulness"
- ChessTempo defensive problem types

Implementation fit:

- medium

Why:

- Patzer already stores parent best move / best line for reviewed positions
- but the current candidate model is biased toward loss-causing user mistakes, not missed saves while already worse

How it would add to current implementation:

- extend the candidate builder with a defensive-resource family
- likely needs a new selector, not just a threshold tweak

What it changes:

- adds a new candidate type beside current retrospection-safe mistake moments
- should not be folded into the current missed-tactic category

## 3. Punish-The-Blunder Moments

Description:

- opponent made a tactical or strategic error and the user failed to exploit it

Why it matters:

- this teaches tactical alertness from the player's side without requiring that the player's own move was a blunder

Market support:

- Chess.com "found vs missed" tactical ideas
- Aimchess tactics and retry-mistakes framing

Implementation fit:

- medium-high

Why:

- Patzer already has reviewed move pairs and best moves
- this is mostly a perspective change on existing reviewed data

How it would add to current implementation:

- new moment family derived from the move after an opponent mistake
- could feed into saved puzzles more cleanly than current user-blunder-only extraction

What it changes:

- expands local puzzle finding from "my mistakes" to "my missed punishments"

## 4. Opening Departure Moments

Description:

- positions where the user first left book and the new move caused a meaningful drop

Why it matters:

- this is one of the highest-value practical improvement surfaces for club players

Market support:

- Chess.com opening stats
- Aimchess opening performance / opening improver
- Lichess opening cancellation logic already proves that opening-aware gating matters

Implementation fit:

- medium now, high later

Why:

- Patzer has a minimal opening provider for retrospection cancellation
- but not a real book/explorer-backed move-by-move opening model yet

How it would add to current implementation:

- initially, a lightweight "early opening mistake" mode using current PGN opening metadata
- later, a proper "first bad non-book move" insight once a stronger book source exists

What it changes:

- adds a phase-specific family of lessons
- should remain separate from generic retrospection candidates

## 5. Endgame Technique Moments

Description:

- winning endgames not converted
- losing endgames not saved
- technique errors in simplified positions

Why it matters:

- endgames are one of the clearest places where reviewed mistakes translate into reusable skill

Market support:

- Aimchess endgame
- Chess.com game phases
- ChessTempo endgame training

Implementation fit:

- medium

Why:

- Patzer already has reviewed positions and phase-sensitive reasoning can be layered later
- but it does not yet have an explicit endgame classifier or endgame drill lane

How it would add to current implementation:

- add a phase detector and a dedicated endgame-moment filter
- later connect those moments to endgame-specific drills

What it changes:

- probably a new insight/drill family, not a mutation of the existing retrospection controller

## 6. Tactical Motif Moments

Description:

- label moments by motif:
  - fork
  - pin
  - skewer
  - discovered attack
  - hanging piece
  - mate net
  - overload
  - deflection

Why it matters:

- motif tags turn one-off puzzles into reusable training sets

Market support:

- ChessTempo motif taxonomy
- Chess.com found/missed forks, pins, mates
- Aimchess uses tactical categories heavily even when the public marketing is broader

Implementation fit:

- medium-low in the short term

Why:

- Patzer does not currently tag reviewed moments by motif
- this needs a secondary interpretation layer on top of reviewed candidates

How it would add to current implementation:

- add tags to missed moments, retrospection candidates, and saved puzzles
- later allow filtering, batching, and spaced repetition by motif

What it changes:

- more metadata than controller logic
- valuable but probably not the first next step

## 7. Recurring Habit Insights Across Games

Description:

- aggregate patterns across many games such as:
  - most common phase of mistakes
  - openings where you lose advantage
  - pieces you mishandle
  - castling habits
  - time-of-day or time-class patterns

Why it matters:

- this is the biggest gap between Patzer and products like Chess.com / Aimchess

Implementation fit:

- medium for some categories, low for others

Why:

- Patzer already stores imported games, review results, and opening metadata
- but it does not yet have a dedicated insights aggregation/report layer

How it would add to current implementation:

- new analytics layer over reviewed games, not a change to retrospection itself

What it changes:

- creates a second learning surface:
  - per-game training
  - cross-game weakness insights

## 8. Explanation Moments

Description:

- natural-language or structured reason cards like:
  - "left a piece hanging"
  - "allowed a fork"
  - "weakened king safety"
  - "missed a forcing move"
  - "failed to convert after winning material"

Why it matters:

- some users improve faster from understanding than from solving

Market support:

- DecodeChess is the clearest example here

Implementation fit:

- medium if the first version is structured labels
- lower if the goal is rich natural-language explanation

How it would add to current implementation:

- sit on top of reviewed moments and candidate tags
- likely start as terse structured explanations, not LLM prose

What it changes:

- supplements puzzles and retrospection instead of replacing them

---

## What Fits Patzer Best Right Now

These are the strongest immediate fits with the current repo.

## Tier 1: Very natural next steps

1. blown wins / failed conversion
2. missed defensive resources
3. punish-the-blunder moments
4. configurable Learn From Your Mistakes families and thresholds

Why:

- these can be built mostly from reviewed mainline data you already own
- they align with the current `tactics` and `retro` architecture

## Tier 2: Strong but needs a new metadata layer

1. opening departure moments
2. endgame technique moments
3. tactical motif tags

Why:

- the reviewed data is mostly there
- the interpretation layer is not

## Tier 3: New analytics/reporting surface

1. recurring cross-game habit insights
2. time-management insights
3. explanation-first lesson cards

Why:

- these require aggregation or richer explanation infrastructure beyond the current per-game loop

---

## Recommended Product Model For Patzer

Patzer should treat post-game learning as a ladder, not one feature.

## Layer 1: Review labels

What it is:

- inaccuracy / mistake / blunder
- missed moment categories

Current owner:

- [src/engine/winchances.ts](/Users/leftcoast/Development/PatzerPatzer/src/engine/winchances.ts)
- [src/engine/tactics.ts](/Users/leftcoast/Development/PatzerPatzer/src/engine/tactics.ts)

## Layer 2: Interactive per-game drills

What it is:

- Learn From Your Mistakes
- retrying blown wins
- retrying missed defenses

Current owner:

- [src/analyse/retro.ts](/Users/leftcoast/Development/PatzerPatzer/src/analyse/retro.ts)
- [src/analyse/retroCtrl.ts](/Users/leftcoast/Development/PatzerPatzer/src/analyse/retroCtrl.ts)

## Layer 3: Saved local training rounds

What it is:

- stricter saved puzzle candidates
- repeatable local practice

Current owner:

- [src/puzzles/extract.ts](/Users/leftcoast/Development/PatzerPatzer/src/puzzles/extract.ts)
- [src/puzzles/index.ts](/Users/leftcoast/Development/PatzerPatzer/src/puzzles/index.ts)

## Layer 4: Cross-game insights

What it is:

- recurring openings
- conversion weakness
- defensive weakness
- endgame weakness
- tactical blind spots

Current owner:

- not implemented as a real subsystem yet

This separation matters.

Do not overload:

- `missed moment`
with
- `retrospection candidate`
with
- `saved puzzle`
with
- `recurring weakness insight`

They should talk to each other, but remain distinct.

---

## Best Next Implementation Directions

If the goal is "learn to play better after a game is analyzed", the strongest next directions are:

1. Finish configurable Learn From Your Mistakes candidate settings.
2. Promote `collapse` into a first-class conversion-training lane.
3. Add a defensive-resource candidate family.
4. Add a punish-the-blunder candidate family.
5. Add a lightweight cross-game insights surface for:
   - blown wins
   - missed tactics
   - opening trouble
   - endgame trouble
6. Add motif tagging only after the moment families themselves are stable.

---

## Concrete Feature Ideas And Their Implementation Impact

## A. "Retry Blown Wins"

User value:

- teaches conversion

Implementation impact:

- mostly additive to current `tactics.ts`
- probably a new drill entry point rather than a rewrite of `retroCtrl.ts`

## B. "Find the Save"

User value:

- teaches defense, drawing resources, and resilience

Implementation impact:

- needs a new candidate selector
- should not be hacked into `missed tactic`

## C. "Punish Their Mistake"

User value:

- teaches tactical alertness and conversion of opponent errors

Implementation impact:

- probably the strongest next saved-puzzle expansion
- can reuse much of the puzzle-round runtime once candidate generation exists

## D. "Opening Improver"

User value:

- teaches what you are getting wrong early

Implementation impact:

- modest if built first as a local opening-departure report
- stronger later with a real book source

## E. "Endgame Technique"

User value:

- practical rating gain

Implementation impact:

- requires phase detection and dedicated drill routing

## F. "Why This Was Bad"

User value:

- explanation-driven learning, not just retry

Implementation impact:

- best done as a structured explanation layer after tagging improves

---

## Risks And Anti-Patterns

### 1. Treating every reviewed mistake as a puzzle

Bad outcome:

- too many quiet, non-instructive, or overly engineish positions

Current protection:

- Patzer already separates retrospection from saved puzzle extraction

Keep that separation.

### 2. Turning all post-game learning into one settings-heavy subsystem

Bad outcome:

- architecture drift
- muddled ownership

Preferred direction:

- `tactics.ts` for missed moments
- `retro.ts` / `retroCtrl.ts` for interactive per-game replay
- `puzzles/` for saved drills
- future insights module for cross-game patterns

### 3. Copying product surfaces before the data model is ready

Bad outcome:

- nice UI with weak lesson quality

Preferred direction:

- candidate quality first
- explanation and categorization second
- broader analytics surface third

---

## Bottom Line

Patzer is already well-positioned to go beyond "find missed tactics".

The most promising direction is:

- keep Lichess-style retrospection for replaying concrete mistakes
- expand the candidate families beyond plain tactical misses
- add cross-game insight categories inspired by Chess.com and Aimchess
- eventually add motif-tagged and explanation-backed local training sets

If Patzer does this well, it will stop feeling like:

- "a local analysis board with some puzzle extraction"

and start feeling like:

- "a personal improvement system built from my own reviewed games"

---

## Sources

Local Patzer / Lichess research:

- [docs/reference/lichess-retrospection/README.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection/README.md)
- [docs/reference/lichess-retrospection/PARAMETERS_AND_THRESHOLDS.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection/PARAMETERS_AND_THRESHOLDS.md)
- [docs/reference/lichess-retrospection/RETROSPECTION_FLOW.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection/RETROSPECTION_FLOW.md)
- [docs/reference/lichess-retrospection/PATZER_IMPLICATIONS.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection/PATZER_IMPLICATIONS.md)

Official / primary external sources:

- Chess.com: [How does Game Review work?](https://support.chess.com/article/364-how-does-the-game-report-analysis-work)
- Chess.com: [What is Insights on Chess.com?](https://support.chess.com/article/3056-what-is-insights)
- Chess.com: [How can I see my opening stats?](https://support.chess.com/article/2138-how-can-i-see-my-opening-stats)
- Chess.com: [What is Practice on Chess.com?](https://support.chess.com/en/articles/8724749-what-is-practice-on-chess-com)
- Aimchess: [Aimchess product page](https://aimchess.com/)
- ChessTempo: [ChessTempo mobile / feature overview](https://cftest.chesstempo.com/mobile/)
- DecodeChess: [DecodeChess FAQ](https://decodechess.com/faq/)
