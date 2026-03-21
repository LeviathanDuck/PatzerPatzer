# Patzer Pro — Known Issues

Date: 2026-03-20
Source: current code read + validation pass + reviewed Claude prompt outcomes

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

## [HIGH] In-flight engine stop handling still relies on a boolean flag

`awaitingStopBestmove` in `src/engine/ctrl.ts` is still a single boolean.

Impact:
- rapid stop/start or review-cancel-review sequences can still mis-handle stale `bestmove` output

---

## [HIGH] Live per-move engine analysis can stall during move navigation

While stepping through moves with the live engine enabled, the engine can sometimes stop updating
for the current position. In practice, it may partially fill only the first PV line and then stall
entirely while the user continues clicking through moves.

This is distinct from batch `Review` / `Re-analyze`, which can still complete successfully even
when constant live analysis during navigation is unreliable.

Impact:
- per-move analysis becomes untrustworthy during normal move-by-move review
- PV lines and arrows can stop matching the current board position
- users get inconsistent behavior between live engine analysis and batch review

Current code paths:
- `src/engine/ctrl.ts` owns live engine lifecycle, queued evaluation, and PV updates
- `src/main.ts` navigation flow triggers per-position reevaluation during move navigation

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

## [MEDIUM] Board resize handle does not reliably appear or work in Safari

The draggable board-resize corner can fail to appear or fail to work in Safari, even though the
same resize control is expected to be available on the analysis board.

Impact:
- Safari users can lose access to board resizing entirely
- board layout customization becomes inconsistent across browsers

Current code paths:
- `src/board/index.ts` appends and binds the `cg-resize` drag handle
- `src/styles/main.scss` styles the `cg-resize` element and its visual corner marker

---

## [MEDIUM] `analysis-game` route can still get stuck in a fake loading state

`analysis-game` is no longer a pure placeholder, but `src/main.ts` still uses
`importedGames.length === 0` as a proxy for “IDB is still loading”.

Impact:
- deep-linking to `#/analysis/:id` can get stuck on permanent `Loading…` text when the imported
  library is genuinely empty
- missing-game handling is still weaker than it should be before startup library state is known

---

## [MEDIUM] Book-aware retrospection cancellation seam is defined but not live

`src/analyse/retro.ts` now accepts an opening-provider callback and checks `openingUcis` before
emitting retrospection candidates, but the current activation path in `src/main.ts` still calls
`buildRetroCandidates(...)` without passing any provider.

Impact:
- book/theory moves are not actually filtered out of Learn From Mistakes candidates yet
- the repo now has the cancellation seam, but not the live behavior claimed by the prompt/task

---

## [MEDIUM] Eval graph hover/scrub behavior is not yet working as expected

The review graph should support clearer scan/scrub behavior while the user moves the mouse across
it, but that interaction is not yet behaving as intended.

Impact:
- graph-driven review is weaker than it should be
- the graph is less useful as a navigation and inspection tool during analysis

---

---

## [MEDIUM] Move-list variation context menu can open at the top-left of the page

The variation move context menu should open over the move the user selected in the move list, but
it can instead render at the top-left corner of the page.

Impact:
- variation-management actions feel disconnected from the selected move
- the menu looks broken and is harder to trust during move-tree editing

Current code path:
- `src/main.ts` stores cursor coordinates for the move-list context menu and renders the fixed-position overlay

Likely current cause:
- the overlay is rendered with a Snabbdom `style` object, but the app patcher is currently initialised without Snabbdom's style module, so the intended `left` / `top` positioning is not applied

---
