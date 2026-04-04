# Patzer Pro — Known Issues

Date: 2026-04-03
Source: current code read + latest local validation pass + reviewed prompt outcomes

This file only lists issues that still appear to be current in the live repo.

---
prompting template idea 

Text 
```
I want you to design the necessary number of prompts (often at least 2-3 minimum, but more are expected and required to follow our guideliens for complicated issues) to fix this known issue 
```
---

## [ ] [MEDIUM] Played-move arrow can get stuck and stop updating, especially with engine off

_Logged: 2026-03-21_

The played-move arrow can sometimes remain stuck on a previous move instead of updating as the
user navigates through the game. The arrow shows a real move from elsewhere in the game rather
than the current position's played continuation. It appears to refresh more reliably when the
engine is enabled, but can fail to update when the engine is off. Reproduction is inconsistent
and the exact trigger is unknown.

Target behavior:
- the played-move arrow must always reflect the last move played at the current board position,
  regardless of whether the engine is on or off — matching Lichess analysis board behavior
- the toggle to hide/show the played-move arrow is already implemented and must be preserved

Impact:
- move navigation feedback becomes misleading even outside live engine analysis
- users can mistake an old played-move arrow for the current position's played continuation

Current code paths:
- `src/engine/ctrl.ts` builds and syncs the played-move arrow together with engine arrows
- `src/main.ts` navigation flow relies on arrow resync during move stepping
- `src/board/index.ts` applies the resulting auto-shapes to Chessground

Likely current cause:
- the played-move arrow is computed inside the engine update path rather than unconditionally
  on every navigation step, so when the engine is off or not firing, the arrow is never resynced

## [ ] [HIGH] Learn From Mistakes "View the solution" can keep the board on the original game move

_Logged: 2026-03-21_

In Learn From Mistakes mode, choosing `View the solution` can display the correct move text in the
retrospection UI while leaving the board on the original move that was played in the game instead
of showing the solution move on the board.

Target behavior:
- the board should animate the solution move from the puzzle-start position
- the move tree should navigate to the node where the solution move lands, making it the active position
- the engine panel should become visible to the user at this point (engine runs in background
  throughout LFYM, but is hidden during the solve phase — reveal makes it visible)
- the engine should be analyzing the solution position shown on the board
- from this point the user can freely navigate the move tree in all directions, as if on a full
  analysis board — LFYM solve restrictions are lifted after reveal

Impact:
- retrospection answer reveal is misleading
- users can be told the correct move without seeing the board actually demonstrate it

Current code paths:
- `src/analyse/retroView.ts` handles the `View the solution` action and board navigation after reveal
- `src/analyse/retroCtrl.ts` switches the retrospection state to `view`

Likely current cause:
- the reveal action currently navigates to the candidate mistake path (`cand.path`) instead of a
  path that actually shows the solution move on the board
- the engine visibility and target are not updated as part of the reveal transition

## [ ] [MEDIUM] Import-panel auto-review checkbox does not appear to reliably trigger review on import

_Logged: 2026-03-21_

The auto-review checkbox in the import UI does not appear to work reliably. Users can enable it
but imported games still may not enter review automatically.

Target behavior:
- replace the existing checkbox with a **toggle** styled to match the site
- when the toggle is turned on, a second confirmation toggle appears inline with the label
  "Are you sure?" and the existing yellow warning text beneath it:
  "Large imports may take a long time to review. Each game runs through the engine at the
  configured review depth."
- both toggles must be on for auto-review to activate
- when both are on, a **depth selector** appears inline below the confirmation toggle:
  - range: 2–18, integer steps of 1
  - each depth value shows a static estimated time multiplier relative to depth 2 (1×),
    based on known Stockfish exponential scaling (~2–3× per ply)
- on import: all imported games that have not been previously reviewed are immediately
  enqueued for review at the selected depth
- the selected auto-review depth does NOT change the default review depth used elsewhere
- the selected auto-review depth is persisted across sessions (localStorage)

Impact:
- import automation is not trustworthy
- users can believe new games will be reviewed automatically when that follow-up never starts

Current code paths:
- `src/header/index.ts` renders the import-panel auto-review checkbox and the review-menu auto-review toggle
- `src/main.ts` checks `importFilters.autoReview` after import completion to decide whether to enqueue review

Likely current cause:
- auto-review state appears split between `importFilters.autoReview` and a separate persisted review-queue setting, so the visible checkbox state and the actual post-import review trigger may not stay in sync

## [ ] [LOW] Opening Tree player strip does not make White vs Black clear enough

_Logged: 2026-03-28_

On the Opponent Research Opening Tree page, the color toggle uses unicode text characters (`○`/`●`)
for the White/Black indicators instead of the CSS circle style used everywhere else in the app.

Target behavior:
- replace the `○`/`●` unicode characters in `renderColorToggle()` with the same CSS circle pattern
  used by `.player-strip__color-icon` on the analysis board:
  - an `h('span')` with class `player-strip__color-icon--white` or `player-strip__color-icon--black`
  - 11px diameter, border-radius 50%, with background and border matching the existing SCSS rules
- no other changes to the player strip layout or behavior

Impact:
- the user can misread which side the researched player is on
- color-specific opening-tree filtering is harder to trust at a glance than it should be

Current code paths:
- `src/openings/view.ts` — `renderColorToggle()` uses `.openings__color-dot` with text characters
- `src/board/index.ts` — `.player-strip__color-icon` is the reference style to match
- `src/styles/main.scss` — `.player-strip__color-icon` SCSS rules already exist and can be reused

## [ ] [MEDIUM] LFYM engine output is not correctly suppressed and surfaced during solve mode

_Logged 2026-04-03_

During LFYM solve mode, engine output (eval bar, arrows, engine lines) is not correctly managed.
The engine always runs in the background during LFYM, but its output should be suppressed from
rendering by default — mimicking the perception of "engine off" without actually disabling it.
Currently the output state is split across two buttons, creating inconsistent behaviour.

Target behavior:
- during LFYM solve mode, engine output (eval bar, arrows, engine lines) is suppressed from
  rendering by default at each new puzzle position — the engine panel is visible in the UI but
  appears as if the engine is off
- this is a rendering suppression, not CSS hiding — the engine is always running in the background
  doing evaluation work for the puzzle path immediately when a puzzle loads
- the "Show Engine" button in the LFYM retrospection corner panel must be removed — it is
  duplicate functionality and causes a split-control problem
- when the user toggles the main Stockfish button on during LFYM, all engine output immediately
  populates for the current board position, using the user's normal saved settings (depth, arrow
  visibility, label preferences, etc.) — no second button required
- if the user normally has arrows off, arrows stay off even when they turn the engine on in LFYM
- the engine analyzes whichever position is currently on the board when it becomes visible
- engine visibility stays on for the remainder of that puzzle if the user turned it on
- when the user navigates to the next puzzle, engine output resets to the suppressed/hidden state
  regardless of whether it was on for the previous puzzle
- a **"Try another move"** button should be added to the LFYM retrospection panel; clicking it
  resets the board to the puzzle start position and re-suppresses engine output, allowing the
  user to attempt a different move without advancing to the next puzzle

Impact:
- the engine lines panel misleads rather than helps during puzzle solving
- users cannot trust the displayed continuations or centipawn values
- turning the engine on requires two separate button presses instead of one

Current code paths:
- `src/analyse/retroView.ts` renders the LFYM retrospection panel including the "Show Engine" button
- `src/engine/ctrl.ts` owns ceval target selection and line output
- `src/analyse/retroCtrl.ts` manages active puzzle state and engine visibility flags

Likely current cause:
- engine visibility during LFYM is split between the main Stockfish toggle and a separate
  "Show Engine" button in the retro panel; they do not share state so turning one on does not
  surface all engine output until the second is also triggered


## [ ] [LOW] LFYM wrong move auto-resets instead of waiting for user input

_Logged 2026-04-03_

After the user plays an incorrect move in LFYM puzzle mode, the board automatically resets to the
puzzle start position after a short delay. The reset should not be automatic — the wrong move
position should stay on the board until the user explicitly clicks "Try another move" from the
LFYM panel.

Target behavior:
- remove the auto-reset timer entirely
- after a wrong move, the board holds on the resulting position indefinitely
- the wrong-move indicator remains visible
- the "Try another move" button (see engine output issue above) is the only reset path —
  clicking it resets the board to the puzzle start position and re-suppresses engine output

Impact:
- the user can miss the "wrong move" feedback entirely if the reset fires before they register it
- the UX feels abrupt and removes the user's ability to study the position they landed in

Current code paths:
- `src/analyse/retroMoveHandler.ts` triggers the wrong-move feedback and schedules the board reset

## [ ] [LOW] LFYM shows eval text before the user has made a move attempt

_Logged 2026-04-03_

At the puzzle start position in LFYM, eval text appears in two places it should not:
1. The red mistake arrow on the board is decorated with a centipawn or mate eval label
2. Eval text appears in the LFYM retrospection panel before the user has attempted any move

Target behavior:
- the red mistake arrow should remain exactly as-is (same color, same squares) but with no eval
  label attached — it is a puzzle-start indicator, not an engine line annotation
- no eval text of any kind should appear in the LFYM panel until after the user makes their
  first move attempt
- post-move eval feedback (cp diff, move comparison) remains unchanged — only the pre-attempt
  state is affected

Impact:
- eval numbers at puzzle start mislead the user before they have attempted anything
- the mistake arrow eval label can be mistaken for an engine line annotation
- the panel feels noisy when it should be clean and focused on the puzzle

Current code paths:
- `src/analyse/retroView.ts` renders the LFYM panel and builds board auto-shapes
- `src/analyse/retroCtrl.ts` manages puzzle state including the pre-attempt phase
- the red mistake arrow is likely built through the same shape-building path as engine-line
  arrows, which attach eval labels by default

## [ ] [HIGH] Opening tree crashes the web app when loading accounts with ~27,000 games

_Logged: 2026-04-03_

Attempting to load a large account (approximately 27,000 games) into the opening tree view causes
the web app to crash. The crash is triggered by the volume of games being processed in the opening
tree build, not by import itself.

Target behavior:
- the opening tree must load incrementally or in a way that does not block the main thread
- extremely large game libraries (25,000+ games) must not crash or freeze the browser tab
- if full processing takes time, a loading indicator should be shown while tree construction
  runs in the background

Impact:
- the opening tree feature is completely unusable for heavy users with large game libraries
- a browser tab crash is the worst possible failure mode — no error feedback to the user

Current code paths:
- `src/openings/` — opening tree construction and rendering
- the tree-building logic processes all imported games synchronously on the main thread,
  which exhausts memory or execution time for very large libraries

Likely current cause:
- opening tree construction iterates over all games at once on the main thread with no chunking,
  pagination, or background worker offload — at ~27,000 games this exceeds browser limits

## [ ] [HIGH] Engine arrows analyze wrong position during LFYM puzzle solve

_Logged: 2026-04-03_

When the user enables the engine during LFYM puzzle solve mode, the engine arrows and analysis
lines sometimes reflect a position that is not the current board position — the engine is
evaluating and drawing arrows for a stale or incorrect position. This does not happen every time;
it appears intermittently.

Target behavior:
- when the user enables the engine during LFYM, the engine must immediately analyze the current
  board position — the position physically shown on the board at the moment the toggle fires
- all arrows and engine lines must correspond to that position only
- if the board position changes (navigation, move played), engine output must re-anchor to the
  new position

Impact:
- engine arrows actively mislead the user — they describe a position the user is not looking at
- intermittent nature makes the bug hard to trust or diagnose at a glance
- a user studying with the engine on may draw completely wrong conclusions from stale arrows

Current code paths:
- `src/engine/ctrl.ts` — manages engine target position and builds arrow output
- `src/analyse/retroCtrl.ts` — manages puzzle state and engine visibility flags during LFYM
- `src/analyse/retroView.ts` — renders engine toggle and drives board shape updates

Likely current cause:
- the engine's target position (`path` / FEN) is likely not re-anchored to the current board
  position at the moment the user enables the engine — it may be using a cached or stale path
  from a previous navigation event

---

## [ ] [MEDIUM] Eval performance box (vs best engine line) sometimes never loads in LFYM

_Logged: 2026-04-03_

After the user plays a move in LFYM, the "Eval performance against best engine line" box
(the comparison box showing their move vs the engine's best continuation) sometimes remains
completely blank and never populates. This is intermittent — it loads correctly on other attempts.

Target behavior:
- after every user move attempt in LFYM, the eval performance box must always populate with the
  engine's best-line comparison data
- if the engine has not finished evaluating at the moment the move is played, the box should wait
  for the result and populate when it arrives — it should never remain permanently blank

Impact:
- users cannot see how their move compared to the engine's best line
- intermittent failure makes the feature unreliable even when the rest of the LFYM flow works

Current code paths:
- `src/analyse/retroCtrl.ts` — computes the eval comparison data after a move is played
- `src/analyse/retroView.ts` — renders the eval performance box

Likely current cause:
- the eval comparison may be computed before the engine result for the puzzle-start position has
  arrived; if the engine result is not yet available at move-play time, the comparison is skipped
  rather than deferred

---

## [ ] [MEDIUM] Worse-than-any-move eval not displayed as a negative number in LFYM

_Logged: 2026-04-03_

When the user plays a move that is worse than the engine's best move in LFYM, the centipawn
difference is not rendered as a negative number. The sign is missing or the value is displayed
as positive when it should clearly be negative to communicate how much worse the move was.

Target behavior:
- moves worse than the engine best must show a negative centipawn diff (e.g. `-0.9`, not `+0.9`)
- moves equal to or better than engine best show zero or positive values respectively
- the sign must match the direction of the eval change from the user's perspective

Impact:
- the user cannot tell at a glance whether their move was better or worse than the engine line
- negative/positive sign is the primary signal in centipawn feedback

Current code paths:
- `src/analyse/retroCtrl.ts` — computes eval diff value
- `src/analyse/retroView.ts` — renders the eval diff in the move feedback box

---

## [ ] [LOW] Redundant eval diff value displayed in LFYM move feedback box

_Logged: 2026-04-03_

The LFYM move feedback box displays a `<span class="retro-feedback__eval-diff">` value (e.g.
`+0.9`) that is redundant with the separate eval boxes already shown. This span provides no
additional information and adds visual noise.

Target behavior:
- remove or suppress the `retro-feedback__eval-diff` span from the move feedback box
- the dedicated eval boxes are the canonical display location for this information

Impact:
- the same number appears twice in the LFYM feedback UI, which is confusing and cluttered

Current code paths:
- `src/analyse/retroView.ts` — renders the `retro-feedback__eval-diff` span in the feedback row

---

## [ ] [MEDIUM] Imported games do not always load into the analysis board with the correct orientation

_Logged: 2026-03-21_

When a game is loaded from the games list onto the analysis board, the board does not always flip
to show the imported user's side. Any flip state the user applied while viewing the previous game
can persist into the next game load instead of being reset.

Target behavior:
- whenever any game loads from the games list, the board orientation must always reset to show
  the imported user's side, regardless of any flip the user made during the previous game
- the imported user's username is always available at load time and should be used to determine
  which color they played and therefore which orientation to apply
- user-driven flips during analysis are fine, but must never carry over to the next game load

Impact:
- imported-game analysis can open from the wrong perspective
- the board orientation feels unreliable when moving between games in the library

Current code paths:
- `src/main.ts` sets default analysis-board orientation during `loadGame()`
- `src/board/index.ts` owns live board orientation state and applies flips to Chessground

Likely current cause:
- the board flip state is not being reset during `loadGame()`, so manual flips from the previous
  game session carry over into the next game load instead of being recalculated from the
  imported user's color
