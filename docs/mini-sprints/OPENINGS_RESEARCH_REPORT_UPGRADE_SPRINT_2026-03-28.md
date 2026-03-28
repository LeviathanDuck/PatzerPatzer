# Openings Research Report Upgrade Sprint

Date: 2026-03-28
Status: proposed

## Purpose

Strengthen the live Patzer Pro openings research product so it behaves more like a serious reusable prep tool rather than a first-pass import-and-browse surface.

This sprint is a follow-on to the existing openings implementation.

The goal is not to replace the current subsystem.

The goal is to upgrade:

- research collection trustworthiness
- import/source integrity
- opening-tree accuracy
- report usefulness at each position
- comparative prep value

## Current repo reality

Patzer already has a real openings subsystem in:

- [src/openings/view.ts](/Users/leftcoast/Development/PatzerPatzer/src/openings/view.ts)
- [src/openings/ctrl.ts](/Users/leftcoast/Development/PatzerPatzer/src/openings/ctrl.ts)
- [src/openings/import.ts](/Users/leftcoast/Development/PatzerPatzer/src/openings/import.ts)
- [src/openings/tree.ts](/Users/leftcoast/Development/PatzerPatzer/src/openings/tree.ts)
- [src/openings/explorer.ts](/Users/leftcoast/Development/PatzerPatzer/src/openings/explorer.ts)
- [src/openings/db.ts](/Users/leftcoast/Development/PatzerPatzer/src/openings/db.ts)

The biggest remaining gaps are:

- saved collections do not preserve enough research metadata
- openings import still reuses shared date-filter state in one place
- PGN import is still paste-only instead of honest upload-capable
- the current tree is move-path based and does not merge transpositions by position
- session reporting is still too raw for real prep work
- move rows and explorer comparison still need stronger comparative meaning

## Hard product rules

- openings research remains separate from analysis import, review, and puzzle persistence
- the openings page continues to reuse the shared board subsystem
- no new medium-sized openings logic should be pushed into `src/main.ts`
- report improvements should be grounded in the current openings subsystem, not a rewrite
- visual hierarchy should continue to respect Lichess-style opening line presentation where relevant

## Phase plan

### Phase 5 — Research Model And Import Integrity

1. CCP-210 — Add Research Settings Snapshot To Saved Collections
2. CCP-211 — Remove Shared Import Filter Mutation From Openings Import
3. CCP-212 — Add Real PGN File Upload Support To Openings Import
4. CCP-213 — Render Collection Summary And Import Provenance Surface
5. CCP-214 — Phase 5 manager

### Phase 6 — Position Graph And Session Report Upgrade

1. CCP-215 — Build Position-Keyed Opening Graph With Transposition Merge
2. CCP-216 — Adapt Openings Session Controller To Graph Navigation
3. CCP-217 — Add Perspective-Relative Move Rows And Default Ordering
4. CCP-218 — Add Current Position Research Summary Panel
5. CCP-219 — Phase 6 manager

### Phase 7 — Comparative Prep And Session Polish

1. CCP-220 — Add Move Row Context Metadata
2. CCP-221 — Strengthen Explorer Comparison Into A Comparative Surface
3. CCP-222 — Persist Openings Session Resume State
4. CCP-223 — Final Openings Research Shell Polish And Validation
5. CCP-224 — Phase 7 manager

### Full batch

1. CCP-225 — Full openings research upgrade manager

## Execution order

Run phases in order.

Hard dependency notes:

- collection metadata should land before collection summary surfaces
- import decoupling should land before further import polish
- position-keyed graph ownership should land before report and comparison upgrades
- perspective-relative reporting should land before final shell polish

## Out of scope for this sprint

- repertoire authoring
- engine-driven move recommendations on the openings board
- login/cloud sync
- tournament/event source expansion
- mixing research collections into the analysis game library
