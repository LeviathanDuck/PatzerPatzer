# Patzer Pro — Architecture Reference

Date: 2026-03-20
Basis: current source tree read, current build output, current docs reconciliation

This document describes the code that exists today. If this document disagrees with the
codebase, trust the code and update this file again.

---

## Current state

Patzer Pro is no longer a single-file frontend. The app has already moved a substantial amount
of logic out of `src/main.ts`, but it is still in a mid-refactor state rather than a finished
Lichess-style module layout.

Current source layout:

```
src/
  main.ts                 — app bootstrap, route dispatch, game selection/load flow,
                            analysis restore, wheel navigation, startup restore
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
    index.ts              — IndexedDB persistence for games, analysis, puzzles

  import/
    chesscom.ts           — Chess.com import adapter
    lichess.ts            — Lichess import adapter
    pgn.ts                — PGN paste import adapter
    filters.ts            — import filters state
    types.ts              — import/game types + game id counter helpers

  puzzles/
    extract.ts            — puzzle candidate extraction and candidate list render

  tree/
    types.ts              — tree types
    ops.ts                — tree path/traversal/mutation
    pgn.ts                — PGN → tree conversion
```

---

## Ownership reality

### `src/main.ts`

`src/main.ts` is down to roughly 500 lines and is mostly coordinator code now, but it still owns
some important cross-system logic:

- in-memory game library state: `importedGames`, `selectedGameId`, `selectedGamePgn`
- `loadGame()` orchestration
- persisted analysis restore for the current game
- route placeholders for unfinished product areas
- wheel navigation listener
- startup restore flow for games and puzzles

This is much healthier than the previous monolith, but it is not yet a pure bootstrap file.

### `src/analyse/`

This directory now owns most analysis rendering:

- move list
- eval bar
- eval graph
- accuracy / blunder summary
- PGN export controls

`AnalyseCtrl` is still intentionally minimal and holds only cursor state.

### `src/board/`

Board ownership is reasonably clear:

- `cosmetics.ts` owns theme, zoom, piece selection, filter settings, and board settings UI
- `index.ts` owns Chessground, move input, sync, promotion UI, board orientation, and player strips

### `src/engine/`

Engine behavior is split into:

- `ctrl.ts` for live eval, arrows, protocol wiring, and engine lifecycle
- `batch.ts` for full-game review queueing and batch persistence flow
- `winchances.ts` for pure math and move classification

This is a meaningful improvement, but the engine state model still relies on mutable module-level
state and some correctness issues remain in stop/start and restore flows.

### `src/games/`

The Games tab renderers and game metadata helpers live here, but the actual game library state is
still not extracted into a dedicated games-library module.

### `src/import/`

Import adapters are extracted and working:

- Chess.com username import
- Lichess username import
- PGN paste import
- shared filters and ID generation helpers

### `src/idb/`

IndexedDB persistence is consolidated in one module. Current stores:

- `game-library`
- `analysis-library`
- `puzzle-library`

### `src/puzzles/`

Only candidate extraction and candidate-list rendering exist. There is still no proper saved
puzzles route or puzzle play state machine.

---

## Runtime model

State is still primarily module-level state spread across modules, not a centralized controller
object. The current app shape is:

1. `main.ts` owns top-level app state and orchestration
2. module-level subsystems own their local mutable state
3. view functions rebuild Snabbdom VNodes on `redraw()`
4. Chessground is updated directly via `cgInstance.set()`
5. engine output is parsed into live eval state and cached analysis state
6. IndexedDB restores browser-local data on startup

This is acceptable for the current refactor stage, but it means subsystem boundaries still need to
be tightened carefully rather than assumed complete.

---

## Lichess alignment

The codebase is currently closest to Lichess in these areas:

- path-keyed move tree model
- Snabbdom render flow
- Chessground board ownership pattern
- move list / column-view rendering approach
- eval bar / PV / win-chance logic
- batch-review mental model

The largest remaining divergences are structural rather than behavioral:

- no composed controller structure around `AnalyseCtrl`
- engine still runs on the main thread
- review and restore coordination still lives partly in `main.ts`
- puzzles route is not a real subsystem yet

---

## Known architecture gaps

These are the main current boundaries that are still unfinished:

1. Game library ownership is split between `main.ts`, `import/types.ts`, and `games/view.ts`.
2. `loadGame()` and persisted analysis restore still live in `main.ts`.
3. `analysis-game`, `puzzles`, `openings`, and `stats` routes are still placeholders or partial.
4. The engine worker path is still not implemented; `ceval/worker.ts` is a stub.
5. `npm run typecheck` is now wired to a real project config but surfaces 53 type errors that are
   not yet fixed.

---

## Validation reality

As of 2026-03-20:

- `npm run build` passes
- `npm run typecheck` now checks the project: `tsconfig.json` was added to the repo root,
  extending `tsconfig.base.json`. Running it surfaces 53 real type errors across the source tree.
  These errors are deferred and tracked in `docs/KNOWN_ISSUES.md`. The typecheck gate is wired
  but not yet clean.
