# Openings Opponent Tool Suite Sprint

Date: 2026-03-29
Status: prompts created, not yet implemented (audited 2026-03-30)

### Phase Status (as of 2026-03-30)

| Phase | Status | Notes |
|---|---|---|
| Phase 1 — Grounding & Implementation Map | **Prompts ran, unreviewed** | CCP-324–330 started but not reviewed |
| Phase 2 — Session Tool Shell & Mode Architecture | **Prompts ran, unreviewed** | CCP-331–338 started but not reviewed |
| Phase 3 — Shared Opponent Analytics Foundation | **Prompts ran, unreviewed** | CCP-339–346 started but not reviewed |
| Phase 4 — Repertoire Tool Full Page Upgrade | **Prompts ran, unreviewed** | CCP-347–352 started but not reviewed |
| Phase 5 — Prep Report Dashboard | **Not started** | CCP-355 manager ran, children unreviewed |
| Phase 6 — Style Dashboard | **Not started** | Prompts created but not queued |
| Phase 7 — Practice Against Them | **Not started** | Prompts created but not queued |

No left-rail UI framework, tool views, or dashboards have been built yet. Analytics computation exists in `openings/analytics.ts` but is not structured as a multi-tool shared service.

## Purpose

Upgrade the current openings session from a mostly tree-first opponent-research surface into a full opponent tool suite with a persistent left rail and four first-class tools.

This sprint is not a rewrite of the openings subsystem.

It is a structured upgrade of the current openings session around the four grouped tools locked by product direction:

- Repertoire
- Prep Report
- Style
- Practice Against Them

## Locked Product Decisions

- The openings session gets a persistent left-side tool rail.
- Selecting a tool changes the main session content area; the active tool owns the page instead of living as a small nested widget.
- The top-level tool categories are locked to:
  - Repertoire
  - Prep Report
  - Style
  - Practice Against Them
- Repertoire is the current opening-tree experience, upgraded into a first-class full-page tool.
- Prep Report is the actionable opponent-preparation dashboard.
- Style groups together style, form, predictability, and behavior cues instead of fragmenting them into many top-level tools.
- Practice Against Them is a board-led training surface.
- Practice Against Them must stay honest:
  - the opponent follows imported repertoire only while the current branch is supported strongly enough by imported game history
  - once that certainty is exhausted, engine play takes over and the UI must say so clearly
- `Practice Against Them` is not the future openings spaced-repetition feature.
- When the future spaced-repetition layer is referenced in repo docs and plans, call it `Opening Repetition Practice` (`ORP`).
- Prompts in this sprint should let Claude use strong product and design judgment.
- The prompts should define the product and implementation work, not micromanage Claude’s cosmetic design choices.

## Current Repo Reality

Patzer already has a real openings subsystem in:

- [src/openings/view.ts](/Users/leftcoast/Development/PatzerPatzer/src/openings/view.ts)
- [src/openings/ctrl.ts](/Users/leftcoast/Development/PatzerPatzer/src/openings/ctrl.ts)
- [src/openings/types.ts](/Users/leftcoast/Development/PatzerPatzer/src/openings/types.ts)
- [src/openings/import.ts](/Users/leftcoast/Development/PatzerPatzer/src/openings/import.ts)
- [src/openings/tree.ts](/Users/leftcoast/Development/PatzerPatzer/src/openings/tree.ts)
- [src/openings/db.ts](/Users/leftcoast/Development/PatzerPatzer/src/openings/db.ts)
- [src/openings/explorerCtrl.ts](/Users/leftcoast/Development/PatzerPatzer/src/openings/explorerCtrl.ts)

Useful current reference surfaces also already exist in:

- [src/puzzles/view.ts](/Users/leftcoast/Development/PatzerPatzer/src/puzzles/view.ts) — left sidebar and board-led tool composition
- [src/styles/main.scss](/Users/leftcoast/Development/PatzerPatzer/src/styles/main.scss) — existing openings and puzzle styling

The biggest gaps today are:

- no canonical active-tool model inside the openings session
- no persistent left tool rail for opponent research
- no shared opponent-analytics layer above imported research games
- no full-page Prep Report dashboard
- no full-page Style dashboard
- no Practice Against Them controller or board-led tool surface
- no honest handoff model from known opponent repertoire to engine-driven opponent play

## Product Direction From Research

The current openings subsystem already has enough raw material to support much richer opponent research than the page currently exposes.

The main product lesson from the market and feature audit is:

- do not explode this into many tiny top-level tools
- group the opponent-prep experience into a few strong product surfaces
- make each surface answer a different prep question clearly

The grouped tools in this sprint should answer:

- Repertoire — what they play
- Prep Report — what I should prepare
- Style — what kind of opponent this is right now
- Practice Against Them — how I can rehearse against their likely repertoire before the engine has to improvise

This sprint does not cover:
- `Opening Repetition Practice` (`ORP`)
- a general spaced-repetition training system for openings
- long-term line-retention scheduling beyond the opponent-research tool suite

## Hard Engineering Rules

- openings research remains separate from analysis import, review, and puzzle persistence
- the openings page continues to reuse the shared board subsystem
- no new medium-sized openings logic should be pushed into `src/main.ts`
- analytics and tool-mode ownership should live inside the openings subsystem, not drift into unrelated modules
- dashboards must stay grounded in what the imported openings research data can actually support today
- fake certainty is worse than a smaller honest tool

## Phase Plan

### Phase 1 — Grounding, Repo Audit, And Implementation Map

- CCP-324 — manager
- CCP-325 — Audit current openings session shell and ownership seams
- CCP-326 — Audit puzzle sidebar and library patterns relevant to the openings tool rail
- CCP-327 — Recheck Lichess references for board tool layout and practice flow
- CCP-328 — Audit current opponent analytics seams from imported research data
- CCP-329 — Audit current board, engine, and practice seams for Practice Against Them
- CCP-330 — Grounding and implementation map review

### Phase 2 — Session Tool Shell And Mode Architecture

- CCP-331 — manager
- CCP-332 — Add canonical openings tool types and session tool state
- CCP-333 — Add active tool selection accessors and reset rules
- CCP-334 — Render persistent left tool rail in the openings session
- CCP-335 — Refactor the session main content to active-tool takeover layout
- CCP-336 — Extract the current session experience into a dedicated Repertoire tool owner
- CCP-337 — Persist active tool selection in openings session resume state
- CCP-338 — Tool shell and mode architecture review

### Phase 3 — Shared Opponent Analytics Foundation

- CCP-339 — manager
- CCP-340 — Add canonical opponent analytics types and dashboard section models
- CCP-341 — Add base collection analytics loader from imported research games
- CCP-342 — Add repertoire breadth, predictability, and opening concentration metrics
- CCP-343 — Add recency and form analytics from imported opponent game history
- CCP-344 — Add Prep Report analytics summaries from current collection history
- CCP-345 — Add analytics cache and controller owner seam
- CCP-346 — Opponent analytics foundation review

### Phase 4 — Repertoire Tool Full Page Upgrade

- CCP-347 — manager
- CCP-348 — Render Repertoire as a first-class full-page tool
- CCP-349 — Add Repertoire overview dashboard section above the tree experience
- CCP-350 — Add Repertoire summary modules for perspective, speed, and recency
- CCP-351 — Add line insight cards tied to practical opponent-prep signals
- CCP-352 — Strengthen sample-game and current-position interplay inside Repertoire
- CCP-353 — Polish Repertoire full-page interaction coherence
- CCP-354 — Repertoire tool review

### Phase 5 — Prep Report Dashboard

- CCP-355 — manager
- CCP-356 — Add canonical Prep Report section model and view owner
- CCP-357 — Derive likely lines and expected repertoire modules
- CCP-358 — Derive targetable weaknesses and practical prep notes
- CCP-359 — Render Prep Report as a full-page openings tool dashboard
- CCP-360 — Add interactive likely-line and target-line modules to Prep Report
- CCP-361 — Add actionable prep cards and opponent-plan summary modules
- CCP-362 — Prep Report review

### Phase 6 — Style Dashboard

- CCP-363 — manager
- CCP-364 — Add style profile synthesis model and owner seam
- CCP-365 — Derive style axes from repertoire, results, and predictability analytics
- CCP-366 — Derive recent form, stability, and volatility signals for Style
- CCP-367 — Render Style as a full-page openings tool dashboard
- CCP-368 — Add player-card, archetype, and style-axis modules
- CCP-369 — Add form, stability, and behavioral tendency modules to Style
- CCP-370 — Style dashboard review

### Phase 7 — Practice Against Them Tool

- CCP-371 — manager
- CCP-372 — Recheck Practice Against Opponent seams and closest references
- CCP-373 — Add Practice Against Them session types and controller ownership
- CCP-374 — Add opponent repertoire move-selection service from opening-tree data
- CCP-375 — Add honest engine handoff policy after repertoire confidence is exhausted
- CCP-376 — Render Practice Against Them as a full-page board-led tool surface
- CCP-377 — Wire practice session controls, board flow, and phase transitions
- CCP-378 — Practice Against Them and tool-suite integration review

## Files In Scope

Primary current owners:

- `src/openings/view.ts`
- `src/openings/ctrl.ts`
- `src/openings/types.ts`
- `src/openings/tree.ts`
- `src/openings/db.ts`
- `src/openings/import.ts`
- `src/styles/main.scss`

Shared references that may be used where appropriate:

- `src/puzzles/view.ts`
- `src/engine/ctrl.ts`
- `src/ceval/view.ts`
- `src/board/index.ts`

## Execution Order

Run phases in order.

Dependency notes:

- the tool-shell phase depends on the grounding phase
- dashboard phases depend on the analytics foundation
- Repertoire should land before Prep Report and Style so the shared shell is exercised on the default tool first
- Practice Against Them should follow the shell and analytics work so it can plug into the real active-tool architecture instead of inventing a parallel flow
