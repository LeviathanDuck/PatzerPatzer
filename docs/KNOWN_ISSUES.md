# Patzer Pro — Known Issues

Date: 2026-03-21
Source: current code read + latest local validation pass + reviewed prompt outcomes

This file only lists issues that still appear to be current in the live repo.

---

## [HIGH] In-flight engine stop handling still relies on a boolean flag

`awaitingStopBestmove` in `src/engine/ctrl.ts` is still a single boolean.

Impact:
- rapid stop/start or review-cancel-review sequences can still mis-handle stale `bestmove` output

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

## [MEDIUM] `analysis-game` route can still get stuck in a fake loading state

`analysis-game` is no longer a pure placeholder, but `src/main.ts` still uses
`importedGames.length === 0` as a proxy for “IDB is still loading”.

Impact:
- deep-linking to `#/analysis/:id` can get stuck on permanent `Loading…` text when the imported
  library is genuinely empty
- missing-game handling is still weaker than it should be before startup library state is known

## [MEDIUM] Played-move arrow can get stuck and stop updating, especially with engine off

The played-move arrow can sometimes remain stuck on an old move instead of updating as the user
navigates through the game. It appears to refresh more reliably when the engine is enabled, but
can fail to update when the engine is off.

Impact:
- move navigation feedback becomes misleading even outside live engine analysis
- users can mistake an old played-move arrow for the current position's played continuation

Current code paths:
- `src/engine/ctrl.ts` builds and syncs the played-move arrow together with engine arrows
- `src/main.ts` navigation flow relies on arrow resync during move stepping
- `src/board/index.ts` applies the resulting auto-shapes to Chessground
