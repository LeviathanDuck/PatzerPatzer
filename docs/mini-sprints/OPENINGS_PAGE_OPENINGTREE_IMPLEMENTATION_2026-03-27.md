# Openings Page Implementation Sprint

Date: 2026-03-27

## Purpose

Build the first real Patzer Pro openings-prep product using OpeningTree as the product-flow reference and Lichess opening surfaces as the visual/interaction reference where appropriate.

Hard product rules:
- openings prep is a separate workflow from analysis and game review
- opponent-research imports must not use the main analysis game library
- opponent-research persistence must be separate from the current analysis/puzzle persistence path
- the openings page should reuse the shared board subsystem rather than inventing a second board implementation
- played-line list styling should be informed by Lichess opening surfaces for percentages, line rows, and move prominence

## Current repo reality

- [main.ts](/Users/leftcoast/Development/PatzerPatzer/src/main.ts) still renders the openings route as a placeholder
- there is no real [src/openings](/Users/leftcoast/Development/PatzerPatzer/src/openings) subsystem yet
- the current IndexedDB owner in [index.ts](/Users/leftcoast/Development/PatzerPatzer/src/idb/index.ts) is analysis/puzzle oriented and should not become the opponent-research owner
- the shared board subsystem already exists in [src/board](/Users/leftcoast/Development/PatzerPatzer/src/board) and should be reused

## Reference model

OpeningTree behaviors to emulate at the product level:
- source -> details -> filters -> actions import flow
- saved research collections that can be reopened later
- position-frequency tree built from imported games
- board-centered browsing with a move navigator and aggregate report
- optional opening-book comparison

Lichess behaviors to emulate where relevant:
- subsystem separation
- board ownership discipline
- clean route ownership
- opening-style list rows and percentages informed by local Lichess opening references in:
  - [FILTERS_THEMES_AND_SELECTION.md](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/FILTERS_THEMES_AND_SELECTION.md)
  - [PuzzleUi.scala](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/modules/puzzle/src/main/ui/PuzzleUi.scala)
  - [_openings.scss](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/puzzle/css/_openings.scss)

## Phase plan

### Phase 0 — Ownership And Separate Research Persistence

1. CCP-178 — Establish Openings Subsystem And Real Route Owner
2. CCP-179 — Add Separate Openings Research DB And Canonical Types
3. CCP-180 — Add Opening Research Source Adapter Contract
4. CCP-181 — Add Saved Research Collection Library Shell
5. CCP-182 — Phase 0 manager

### Phase 1 — Opponent Research Import Flow

1. CCP-183 — Render Openings Import Workflow Shell
2. CCP-184 — Add Opponent Research Import Pipeline
3. CCP-185 — Add Opening Research Import Progress And Collection Creation
4. CCP-186 — Persist And Reload Opening Research Collections
5. CCP-187 — Phase 1 manager

### Phase 2 — Tree Build And Board Shell

1. CCP-188 — Build Opening Tree Aggregation Engine
2. CCP-189 — Add Opening Session Controller And Nav State
3. CCP-190 — Render Opening Prep Board Shell Using Shared Board Subsystem
4. CCP-191 — Add Opening Navigator And Position Sync
5. CCP-192 — Phase 2 manager

### Phase 3 — Played Lines, Percentages, And Report Surface

1. CCP-193 — Render Played Lines Panel With Counts And Percentages
2. CCP-194 — Bring Played Lines Styling Toward Lichess Opening DB Conventions
3. CCP-195 — Add Current Position Report And Sample Games Panel
4. CCP-196 — Add Optional Lichess Explorer Comparison Surface
5. CCP-197 — Phase 3 manager

### Phase 4 — Collections Management And Product Polish

1. CCP-198 — Add Research Collections Management Surface
2. CCP-199 — Add Sample Game Actions And Reopen Workflow
3. CCP-200 — Add Honest Openings Empty States And Route Polish
4. CCP-201 — Add Preparation Perspective Controls And Final Openings Shell Validation
5. CCP-202 — Phase 4 manager

## Execution order

Run phases in order. Do not skip Phase 0.

Hard dependency notes:
- separate openings persistence must land before opponent imports
- opponent import flow must land before tree building
- tree/session ownership must land before played-line UI
- Lichess-inspired played-line styling should not be attempted before real data rows exist

## Out of scope for this sprint

- full repertoire trainer
- engine-driven opening evaluation
- login/cloud sync
- tournament/event source breadth beyond the smallest safe import sources
- mixing opponent research into the main analysis game library
