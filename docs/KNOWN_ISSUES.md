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

## [MEDIUM] Import-panel auto-review checkbox does not appear to reliably trigger review on import

The auto-review checkbox in the import UI does not appear to work reliably. Users can enable it
but imported games still may not enter review automatically.

Impact:
- import automation is not trustworthy
- users can believe new games will be reviewed automatically when that follow-up never starts

Current code paths:
- `src/header/index.ts` renders the import-panel auto-review checkbox and the review-menu auto-review toggle
- `src/main.ts` checks `importFilters.autoReview` after import completion to decide whether to enqueue review

Likely current cause:
- auto-review state appears split between `importFilters.autoReview` and a separate persisted review-queue setting, so the visible checkbox state and the actual post-import review trigger may not stay in sync

## [MEDIUM] Mistake Detection severity controls are ambiguous and may look broken

In the `Mistake Detection` modal, the `Inaccuracy` / `Mistake` / `Blunder` controls currently act
as a pill picker for the single `minClassification` setting, but the UI can make it look like
selecting those options should reveal or update additional sliders. Right now the only visible
slider nearby is `Missed Mate in N`, which makes the severity controls feel incomplete or broken.

Impact:
- users cannot tell whether the severity buttons are working as intended
- the settings UI creates confusion about whether more parameters should appear for each severity level

Current code path:
- `src/header/index.ts` renders `Minimum Severity` as a pill selector and `Missed Mate in N` as a separate slider in `renderRetroModal()`

Current behavior from code inspection:
- selecting `Inaccuracy`, `Mistake`, or `Blunder` only updates `retroConfig.minClassification`
- it does not currently swap in or retune additional slider values
