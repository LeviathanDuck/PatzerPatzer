# Patzer Implications

This document translates the inspected source into practical rules for Patzer Pro.

## 1. Separate product types cleanly

Lichess source does not support the idea that all puzzle behavior should live in one giant controller.

Observed split:
- standard training product
- streak variant inside standard training
- Storm app
- Racer app
- shared runtime for timed competitive products

Patzer implication:
- if Patzer eventually adds standalone puzzle products, do not force them all into the analysis board
- share runtime where appropriate, but keep product surfaces distinct

## 2. Learn From Mistakes is not the same as standard puzzle training

This folder and the retrospection folders should stay separate.

Retrospection:
- starts from analyzed game mistakes
- runs inside analysis

Puzzle products:
- start from prepared puzzle objects
- own board/page/product logic

Patzer implication:
- a local imported-game puzzle finder can borrow from public puzzle product logic later
- but Lichess retrospection is still the better first reference for local "learn from my mistakes"

## 3. "Battle mode" should not be invented loosely

Source-backed reality:
- Racer is the confirmed multiplayer competitive puzzle reference
- if Patzer wants a battle-like mode, Racer is the correct visible reference

Patzer implication:
- do not create requirements around an imaginary generic Lichess "battle mode"
- explicitly say "Racer-like" if that is the reference

## 4. Standard puzzle solve logic is strict line checking

The standard puzzle trainer checks exact line progress in `moveTest.ts`.

Patzer implication:
- if Patzer wants a classic standalone puzzle product, exact-line validation is the source-backed baseline
- do not mix that up with retrospection's more contextual/analysis-linked flow

## 5. Board UX differs by product

Standard training includes:
- tree
- analysis tools
- feedback area
- session dots
- rating/casual toggle
- hint/solution controls

Storm/Racer instead emphasize:
- speed/score
- combo
- countdown/timers
- minimal board-side control strip

Patzer implication:
- if you eventually build multiple puzzle products, their UI should diverge for product reasons, not just visual preference

## 6. Filters and selection happen at multiple layers

Lichess puzzle selection is shaped by:
- server theme/opening/difficulty/color selection
- replay workflows
- session memory
- run filters for timed products

Patzer implication:
- avoid one overloaded "puzzle filters" abstraction
- keep:
  - selection parameters
  - replay/history parameters
  - timed-run inspection filters
  separate

## 7. The copied sources here are enough to answer most UX/runtime questions

This folder now covers:
- classic puzzle UX and board behavior
- theme/opening/history/replay surface
- streak
- Storm
- Racer
- shared timed puzzle runtime
- server routes and controllers

What this folder does not fully answer:
- the full upstream public puzzle mining algorithm
- non-open-source product logic outside this repo
- any future Lichess behavior added after the inspected snapshot

For mining/generation questions:
- use [docs/reference/lichess-retrospection/README.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection/README.md) alongside this folder
