# Patzer Pro — Known Issues

Date: 2026-03-21
Source: current code read + latest local validation pass + reviewed prompt outcomes

This file only lists issues that still appear to be current in the live repo.

---

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

## [HIGH] Learn From Mistakes "View the solution" can keep the board on the original game move

In Learn From Mistakes mode, choosing `View the solution` can display the correct move text in the
retrospection UI while leaving the board on the original move that was played in the game instead
of showing the solution move on the board.

Impact:
- retrospection answer reveal is misleading
- users can be told the correct move without seeing the board actually demonstrate it

Current code paths:
- `src/analyse/retroView.ts` handles the `View the solution` action and board navigation after reveal
- `src/analyse/retroCtrl.ts` switches the retrospection state to `view`

Likely current cause:
- the reveal action currently navigates to the candidate mistake path (`cand.path`) instead of a path that actually shows the solution move on the board
