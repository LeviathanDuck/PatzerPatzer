# Patzer Pro — Known Issues

Date: 2026-03-20
Source: current code read + validation pass

This file only lists issues that still appear to be current in the live repo.

---

## [HIGH] `npm run typecheck` is wired but surfaces 53 type errors

`tsconfig.json` was added to the repo root, extending `tsconfig.base.json`. The typecheck gate
now runs correctly. As of the last run, `tsc --noEmit` reports 53 errors across the source tree,
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

## [HIGH] In-flight engine stop handling still relies on a boolean flag

`awaitingStopBestmove` in `src/engine/ctrl.ts` is still a single boolean.

Impact:
- rapid stop/start or review-cancel-review sequences can still mis-handle stale `bestmove` output

---

## [HIGH] Persisted analysis restore still lacks cancellation on rapid game switches

`loadAndRestoreAnalysis()` still runs asynchronously from `src/main.ts` without a cancellation
token or equivalent guard.

Impact:
- restore results for one game can still arrive after another game has been loaded
- eval state can be polluted in shared opening paths

---

## [HIGH] Review state is still not explicitly scoped to an active game context

The codebase still relies on shared engine/cache state and path-based storage without a clearly
scoped current-game guard through the full review/restore flow.

Impact:
- stale or delayed engine output can still land in the wrong active game context

---

## [HIGH] Engine lines and arrows do not always update correctly after creating a variation

When a user creates a new variation directly on the board, the live engine lines and arrows can
fail to refresh correctly for the new position. Toggling the engine off and back on appears to
force them back into sync.

Impact:
- side-line exploration is less trustworthy than mainline review
- live review behavior becomes inconsistent exactly where puzzle and mistake exploration will rely on it

---

## [HIGH] Live engine evaluation sometimes stops updating during move navigation

While stepping through moves in a game, the engine can sometimes stop updating or fail to keep
calculating for the current position. The intended behavior is that every live board position
continues evaluating until the requested analysis is complete.

Impact:
- game review becomes unreliable during normal navigation
- users can no longer trust the current PV lines and arrows to match the current position

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

---

## [LOW] Header global menu still contains stub actions

`src/header/index.ts` still logs TODO messages for:

- Clear Local Cache
- Game Review

Impact:
- menu UI is ahead of actual behavior in those entries
