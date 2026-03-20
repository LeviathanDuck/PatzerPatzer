# Patzer Pro — Known Issues

Date: 2026-03-20
Source: current code read + validation pass

This file only lists issues that still appear to be current in the live repo.

---

## [HIGH] `npm run typecheck` is wired but surfaces 53 type errors

`tsconfig.json` was added to the repo root, extending `tsconfig.base.json`. The typecheck gate
now runs correctly. As of the latest audit run on 2026-03-20, `tsc --noEmit` reports 53 errors across the source tree,
primarily:

- `noUncheckedIndexedAccess` violations (array index access without undefined guards)
- `exactOptionalPropertyTypes` violations
- `possibly 'undefined'` errors on node/child access patterns

These errors are deferred. The build still passes because esbuild does not type-check.

Impact:
- type safety is not enforced at the gate level until these errors are resolved
- refactor work that introduces new type errors will not cause `typecheck` to regress detectably
  until the baseline is clean

---

## [HIGH] Wheel scroll navigation is still non-functional

The wheel listener in `src/main.ts` still checks:

```ts
document.querySelector('.analyse__board-wrap')
```

The actual rendered board container is `div.analyse__board.main-board`.

Impact:
- wheel-based move navigation over the board does not trigger

---

## [HIGH] Clear-local-data reset flow is currently broken

`resetAllData()` in `src/main.ts` still calls `openGameDb()`, but `openGameDb` is not imported
from `src/idb/index.ts`.

Impact:
- the “Clear all local Patzer Pro data” path is not currently trustworthy
- cleanup/reset behavior can fail before IDB stores are cleared
- the UI advertises a recovery path that is not currently safe

---

## [HIGH] In-flight engine stop handling still relies on a boolean flag

`awaitingStopBestmove` in `src/engine/ctrl.ts` is still a single boolean.

Impact:
- rapid stop/start or review-cancel-review sequences can still mis-handle stale `bestmove` output

---

## [HIGH] Review state is still not explicitly scoped to an active game context

The codebase still relies on shared engine/cache state and path-based storage without a clearly
scoped current-game guard through the full review/restore flow.

Impact:
- stale or delayed engine output can still land in the wrong active game context

---

## [HIGH] Imported-game board orientation does not always match the importing user's side

When a game is loaded, the app keeps the importing user displayed as the bottom player in the
player-strip UI, which is correct, but the actual Chessground board orientation does not always
flip to the same side.

Current code in `src/main.ts` already attempts to derive the importing user's color on `loadGame()`
and calls `setOrientation(userColor)`, so the current behavior suggests the orientation update is
not fully propagating to the live board state.

Impact:
- the board and surrounding player UI can disagree about who is at the bottom
- analysis review becomes confusing when the imported user's perspective is expected but not shown

---

## [LOW] Played-arrow still appears on side-variation nodes it doesn't apply to

The played-move arrow (showing the first child of the current node) is still drawn even when the
current node is inside a side variation rather than the original game line.

Impact:
- arrows can communicate the wrong thing while the user explores side lines

Current code path:
- `src/engine/ctrl.ts` `buildArrowShapes()` derives the played arrow from `ctrl.node.children[0]`,
  which assumes the current node is still on the played line

---

## [MEDIUM] Engine settings are not persisted

`reviewDepth`, `analysisDepth`, and `multiPv` are still module-level values that reset on reload.

Impact:
- stored analysis can appear to stop matching after a reload if the previous session used
  different settings

---

## [MEDIUM] `analysis-game` route is still a placeholder

The route exists in the router, but `src/main.ts` still renders only a header string for it.

Impact:
- deep-linking directly to a stored game is not functional

---

## [MEDIUM] Eval graph hover/scrub behavior is not yet working as expected

The review graph should support clearer scan/scrub behavior while the user moves the mouse across
it, but that interaction is not yet behaving as intended.

Impact:
- graph-driven review is weaker than it should be
- the graph is less useful as a navigation and inspection tool during analysis

---

## [MEDIUM] Engine arrows can render without a visible arrowhead

Sometimes the live engine arrows draw with only the shaft visible and the arrowhead missing,
which makes the intended destination less clear than it should be during analysis.

Impact:
- engine guidance is harder to read at a glance
- users can misread the intended move destination when the arrowhead is missing

Current code paths:
- `src/engine/ctrl.ts` builds the engine and played-move arrow shapes
- `src/board/index.ts` configures the Chessground drawable brushes and arrow rendering

---

## [HIGH] Underboard eval graph can remain blank during analysis-page Review/Re-analyze

The analysis-page `Review` / `Re-analyze` control is intended to run batch review and progressively
populate the underboard eval graph from review data. Currently, after clicking `Review` beneath the
board, the eval graph can remain blank with no plotted data instead of filling in as review
progresses or after review completes.

Impact:
- a core analysis/review workflow is not trustworthy
- users do not get expected visual feedback while batch review is running
- completed review can still appear unevaluated from the graph display alone

Current code paths:
- `src/analyse/pgnExport.ts` triggers the analysis-page `Review` / `Re-analyze` action
- `src/engine/batch.ts` is responsible for batch review progress and eval-cache population
- `src/analyse/evalView.ts` renders the underboard eval graph from cached review data
- `src/main.ts` wires the underboard graph into the analysis page

---

## [MEDIUM] Puzzle route is still a placeholder

Puzzle candidate extraction and puzzle saving both exist, but `#/puzzles` still renders only a
placeholder heading.

Impact:
- the puzzle subsystem is not yet a real user-facing workflow

---

## [LOW] Chess.com import still fetches only the latest archive month

`fetchChesscomGames()` still requests only the newest archive URL and then applies date filtering
after fetch.

Impact:
- broader date ranges on Chess.com do not yet fetch a true multi-month set

---

## [LOW] Played-move arrow behavior is wrong in side variations

The “what was played in the game” arrow should disappear when the user enters a non-game variation
and only return when the current path is back on the actual played game line.

Impact:
- board arrows can communicate the wrong thing while exploring side lines

Current code path:
- `src/engine/ctrl.ts` still derives the played arrow from `ctrl.node.children[0]`, which assumes
  the current node is still on the played line

---

## [LOW] Header global menu still contains stub actions

`src/header/index.ts` still logs TODO messages for:

- Clear Local Cache
- Game Review

Impact:
- menu UI is ahead of actual behavior in those entries
