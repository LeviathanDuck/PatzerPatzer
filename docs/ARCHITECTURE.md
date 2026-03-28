# Patzer Pro — Architecture Reference

Date: 2026-03-27
Basis: current source tree read, current build output, current docs reconciliation

This document describes the code that exists today. If this document disagrees with the
codebase, trust the code and update this file again.

For detailed Lichess retrospection and puzzle-reference research, use:
- `/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection/README.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-retrospection-ux/README.md`
- `/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/README.md`

---

## Current state

Patzer Pro is no longer a single-file frontend. The app has already moved substantial logic out of
`src/main.ts`, but it is still in a mid-refactor state rather than a finished Lichess-style module
layout.

The biggest change since the earlier architecture snapshot is that the standalone puzzle product is
now live in the app.

Current source layout:

```text
src/
  main.ts                 — app bootstrap, route dispatch, game selection/load flow,
                            analysis restore, startup restore, puzzle product orchestration
  router.ts               — hash routing
  keyboard.ts             — keyboard navigation + help overlay

  analyse/
    ctrl.ts               — analysis cursor only
    evalView.ts           — eval bar, eval graph, analysis summary
    moveList.ts           — move-tree rendering
    pgnExport.ts          — PGN export + review button controls

  board/
    cosmetics.ts          — theme, zoom, piece set, filters, board settings render
    index.ts              — Chessground lifecycle, board sync, move input, player strips

  ceval/
    protocol.ts           — Stockfish protocol wrapper
    view.ts               — ceval header, PV lines, PV preview board, engine settings
    worker.ts             — placeholder stub, not the active engine path

  engine/
    ctrl.ts               — engine lifecycle, live eval, arrows, threat mode
    batch.ts              — batch review pipeline, review state, missed-tactic detection
    winchances.ts         — pure win-chance math + move classification

  games/
    view.ts               — Games tab rendering + game metadata helpers

  header/
    index.ts              — top nav, import panel, global menu

  idb/
    index.ts              — legacy IndexedDB persistence for games, analysis, saved candidates

  import/
    chesscom.ts           — Chess.com import adapter
    lichess.ts            — Lichess import adapter
    pgn.ts                — PGN paste import adapter
    filters.ts            — import filters state
    types.ts              — import/game types + game id counter helpers

  puzzles/
    ctrl.ts               — puzzle route owner, library state, round controller
    view.ts               — puzzle library and round rendering
    types.ts              — canonical puzzle product types
    puzzleDb.ts           — Puzzle V1 IndexedDB ownership
    adapters.ts           — source adapters into canonical puzzle definitions
    shardLoader.ts        — generated Lichess shard loading/filtering
    extract.ts            — legacy analysis-side candidate extraction and candidate list render

  tree/
    types.ts              — tree types
    ops.ts                — tree path/traversal/mutation
    pgn.ts                — PGN → tree conversion
```

---

## Ownership reality

### `src/main.ts`

`src/main.ts` is still coordinator-heavy and now also wires the standalone puzzle product.

It still owns:
- in-memory game library state
- `loadGame()` orchestration
- persisted analysis restore for the current game
- route dispatch into analysis, games, and puzzle product surfaces
- startup restore flow for games and legacy saved puzzle candidates

This is much healthier than the previous monolith, but it is still not a pure bootstrap file.

### `src/analyse/`

This directory owns most analysis rendering:

- move list
- eval bar
- eval graph
- accuracy / blunder summary
- PGN export controls

`AnalyseCtrl` remains intentionally small and mostly cursor-oriented.

### `src/board/`

Board ownership is clearer than before, but still not a finished subsystem contract.

Current reality:
- `cosmetics.ts` owns theme, zoom, piece selection, filter settings, and board settings UI
- `index.ts` owns Chessground, move input, sync, promotion UI, board orientation, and player strips
- both the analysis board and the puzzle board now reuse shared board pieces

Target ownership language still applies:
- shared board subsystem
- analysis board
- puzzle board

But that split should still be treated as a target state rather than a perfectly clean completed
abstraction.

### `src/engine/`

Engine behavior is split into:

- `ctrl.ts` for live eval, arrows, protocol wiring, and engine lifecycle
- `batch.ts` for full-game review queueing and batch persistence flow
- `winchances.ts` for pure math and move classification

This is a real subsystem now, but the engine still runs on the main thread and some correctness
and lifecycle issues remain.

### `src/games/`

The Games tab renderers and metadata helpers live here, but the actual game library state is still
not extracted into a dedicated games-library module.

### `src/header/` and `src/router.ts`

The standalone puzzle product is now exposed as a first-class app area:

- `src/router.ts`
  - live `puzzles` and `puzzle-round` routes
- `src/header/index.ts`
  - `Puzzles` appears in the main header nav and mobile nav
  - active-section logic knows about puzzle routes

### `src/idb/` and `src/puzzles/puzzleDb.ts`

Browser-local persistence is now split across two layers:

- `src/idb/index.ts`
  - legacy persistence for imported games, saved analysis, and legacy saved puzzle candidates
- `src/puzzles/puzzleDb.ts`
  - Puzzle V1 persistence for canonical puzzle definitions, attempts, and user metadata

This split is functional, but it also means the repo currently has two puzzle-related persistence
paths that will need long-term cleanup or clearer separation.

### `src/puzzles/`

`src/puzzles/` now owns a real standalone puzzle product:

- `ctrl.ts`
  - route owner for `#/puzzles` and `#/puzzles/:id`
  - library counts and list browsing state
  - imported/user source selection
  - puzzle round controller ownership
  - retry/due session entry points
- `view.ts`
  - puzzle library surface
  - inline browse pane
  - dedicated puzzle round rendering
  - feedback / result-state / metadata panels
- `types.ts`
  - canonical puzzle definition, attempt, metadata, and move-quality types
- `puzzleDb.ts`
  - separate Puzzle V1 IndexedDB database
- `adapters.ts`
  - adapters from legacy review-derived data and imported Lichess shard records
- `shardLoader.ts`
  - imported Lichess shard manifest and shard loading
- `extract.ts`
  - legacy analysis-side candidate extraction still used by the analysis board

Important caveat:
- the puzzle product now exists
- the analysis-side candidate path still coexists with it
- that coexistence is functional, but it is also a cleanup target

---

## Runtime model

State is still primarily module-level state spread across modules, not a single controller tree.

The current app shape is:

1. `main.ts` owns top-level app orchestration
2. module-level subsystems own their local mutable state
3. view functions rebuild Snabbdom VNodes on `redraw()`
4. Chessground instances are updated directly
5. engine output is parsed into live eval state and cached analysis state
6. IndexedDB restores browser-local data on startup

This is acceptable for the current refactor stage, but subsystem boundaries still need to be kept
honest and documented carefully.

---

## Lichess alignment

The codebase is currently closest to Lichess in these areas:

- path-keyed move tree model
- Snabbdom render flow
- Chessground board ownership pattern
- move list / column-view rendering approach
- eval bar / PV / win-chance logic
- puzzle round / side-panel / session-flow inspiration

The largest remaining divergences are structural rather than behavioral:

- no composed controller structure around `AnalyseCtrl`
- engine still runs on the main thread
- review and restore coordination still lives partly in `main.ts`
- puzzle product and analysis-side candidate extraction still coexist as two partially overlapping systems
- board ownership is improved but not yet formalized enough to call complete

---

## Known architecture gaps

These are the main current boundaries that are still unfinished:

1. Game library ownership is split between `main.ts`, `import/types.ts`, and `games/view.ts`.
2. `loadGame()` and persisted analysis restore still live in `main.ts`.
3. Puzzle V1 exists, but the analysis-side candidate path and Puzzle V1 storage/model still need clearer long-term separation.
4. `analysis-game`, `openings`, and `stats` still need more honest route/product handling than they have today.
5. The engine worker path is still not implemented; `ceval/worker.ts` is a stub.
6. `npm run typecheck` is wired, but the typecheck gate is still not clean.

---

## Validation reality

As of 2026-03-27:

- `npm run build` passes
- `npm run typecheck` is wired to the real project config, but the project still has unresolved type errors
