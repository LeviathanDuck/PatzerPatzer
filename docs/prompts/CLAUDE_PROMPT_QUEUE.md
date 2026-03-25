# Claude Prompt Queue

Use this file to store Claude Code prompts that are ready to run in a future Claude session.

## How to use it

- Add full copy-paste-ready prompts here when they are created.
- Do not add review status here.
- Do not add queue status text by default. A queued prompt is simply present in this file.
- Keep a top-of-file queue index that lists only the prompts currently still queued.
- In that queue index, format each item as:
  - first line: `- CCP-###: Short Task Title`
  - second line: an indented bullet with a brief target description
- Leave one blank line between queue-index items for readability.
- Keep the queue index concise and scan-friendly.
- Keep the queue index in sync with the prompt blocks below:
  - add a new index item when a prompt is created
  - remove the matching index item when the prompt is removed from this file during review
- Add a scan-friendly Markdown heading immediately before each prompt block:
  - format: `## prompt-id - short task title`
  - keep this heading outside the fenced prompt block
- Use plain fenced Markdown blocks with no language tag for queued prompts.
- Keep the prompt metadata header near the top of each prompt:
  - `Prompt ID: CCP-###`
  - `Task ID: CCP-###`
  - `Parent Prompt ID: CCP-###` if this is a follow-up fix prompt
  - `Source Document: docs/...`
  - `Source Step: ...`
- For a follow-up fix prompt:
  - `Prompt ID` must use the next `-F#` modifier, such as `CCP-013-F1`
  - `Task ID` must stay the root family id, such as `CCP-013`
  - `Parent Prompt ID` should point to the reviewed prompt being fixed
- Once a queued prompt has actually been used in Claude Code and then reviewed:
  - remove it from this file
  - add or update its reviewed entry in `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_LOG.md`

## Queue Index

- CCP-113: Add Training Queue State to Imported Puzzle Module
  - Add training mode + cursor to `imported.ts`: startTraining(), advanceTrainingCursor(), getNextTrainingRouteId(), isTrainingMode().

- CCP-114: Wire Training Queue into Continue-Training Navigation
  - `onNext` for imported puzzles uses training cursor instead of page-bounded nextPuzzleHref; pre-fetches next page when approaching end.

- CCP-115: Add "Start Training" Entry Point to Puzzle Library
  - "Start Training →" button in imported library header calls startTraining() and navigates to first filtered puzzle.

- CCP-116: Persist Filter Query State to IDB
  - Save importedQuery to IDB when filters change; restore on startup so training resumes with the same filters.

- CCP-117: Show Active Training Context in Puzzle Round Side Panel
  - During an imported puzzle round, show the active theme/opening label in the side panel so the user knows what they are training on.

- CCP-118: Phase 1 Puzzle Training Queue Manager (CCP-113–115)
  - Manager prompt: run CCP-113, CCP-114, CCP-115 in order.

- CCP-119: Phase 2 Puzzle Filter Persistence Manager (CCP-116–117)
  - Manager prompt: run CCP-116, CCP-117 in order.

- CCP-103: Fix Wrong-Move Result State
  - Wrong move should set feedback='fail' but leave result='active' so the user can retry without the round locking.

- CCP-104: Add Opponent Move Animation Delay
  - Opponent reply in puzzle rounds should play after a short delay with the board locked, not instantly.

- CCP-105: Add Visual Feedback Icons
  - Correct move shows a ✓ icon, wrong move shows a ✗ icon in the puzzle feedback section.

- CCP-106: Add After-Puzzle Completion Panel
  - Solved and viewed-solution states render a distinct completion panel with a Next puzzle button.

- CCP-107: Add Puzzle-Specific SCSS
  - Extract puzzle-round styles from main.scss into _puzzle.scss, move sidebar to left, and add styles for feedback icons and after-panel.

- CCP-108: Add Move Navigation Controls
  - Add first/prev/next/last buttons to step through puzzle solution moves after the round ends.

- CCP-109: Add Keyboard Navigation Shortcuts
  - Arrow keys navigate puzzle solution moves; Escape returns to library.

- CCP-110: Add Result History Dots
  - Render a row of colored dots in the puzzle round view showing recent session outcomes.

- CCP-095: Establish Lichess Dataset Workspace
  - Add a repo-safe ignored local workspace for raw Lichess puzzle downloads and generated shard output.

- CCP-096: Add Lichess Puzzle Download Script
  - Add an explicit script to fetch the official `lichess_db_puzzle.csv.zst` export into the local dataset workspace.

- CCP-097: Build Lichess Puzzle Shard Pipeline
  - Convert the official export into Patzer-friendly generated manifest and shard files instead of loading raw CSV in the browser.

- CCP-098: Add Imported Puzzle Loader Seam
  - Add Patzer-owned imported-puzzle types and a loader that adapts generated Lichess shards into the app’s puzzle model.

- CCP-099: Add Imported Puzzle Source Switch
  - Let the puzzles page switch between local saved puzzles and imported Lichess puzzles.

- CCP-100: Open Imported Lichess Puzzle Rounds
  - Open imported Lichess puzzle records inside Patzer’s own puzzle controller and board flow.

- CCP-101: Add Imported Puzzle Filters And Paging
  - Add basic rating, theme, and opening filters plus lazy shard paging for the imported Lichess library.

## Queue

## CCP-103 - Fix Wrong-Move Result State

```
Prompt ID: CCP-103
Task ID: CCP-103
Source Document: CCP-102 audit (puzzle page Lichess audit and sprint plan)
Source Step: Sprint 1 — Fix wrong-move result state
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
Before editing, check whether any other tool, agent, or Claude Code session is actively
touching `src/puzzles/ctrl.ts` or `src/puzzles/types.ts`. If so, stop and report before editing.

---

Task:
Fix the wrong-move result state in the puzzle round controller.

Currently, any wrong move immediately sets `result = 'failed'`, which permanently locks the
round via the `result !== 'active'` guard. The correct Lichess behavior is:
- wrong move → feedback = 'fail', result stays 'active' (round stays live, user can retry)
- giving up (viewing solution) → result transitions to a terminal state

Inspect first:
- `src/puzzles/ctrl.ts` — the `submitUserMove` method, specifically the guard block and what
  it sets on a wrong move (currently lines 76–83)
- `src/puzzles/types.ts` — `PuzzleRoundResult` and `PuzzleSessionRecent` to understand how
  'failed' is used downstream
- `src/puzzles/view.ts` — how `result` and `feedback` states drive the controls section
  (Retry button, View solution button, Next puzzle button)
- Lichess reference: `ui/puzzle/src/ctrl.ts` — how Lichess separates feedback state from
  result/completion state for the wrong-move path

Constraints:
- Touch only `src/puzzles/ctrl.ts`
- Do not change the types, the view, or session logic
- Do not change `viewSolution()` behavior in this task
- Do not change `retry()` behavior
- The 'failed' result value may become unreachable after this fix — note that as a known
  implication but do not remove it from the type in this task

Exact small step:
In `submitUserMove`, when the move is wrong (the guard fires due to move mismatch or wrong
path), set only `feedback = 'fail'`. Do not set `result = 'failed'`. Leave `result` unchanged.

Note: the guard also fires when `result !== 'active'` (i.e. already solved/viewed). In that
case, result should also remain unchanged. The single fix of removing the `result = 'failed'`
assignment covers both cases correctly.

Why safely scoped:
One assignment removed in one file. Board remains interactive after a wrong move, which is
the existing behavior before result gets locked. Retry already works via `ctrl.retry()`.

Validation:
- Run `npm run build` — must pass
- Open a puzzle, play a wrong move
  - Expected: board stays interactive, Retry button appears, View solution remains available
  - Expected: playing the correct move is accepted and the round continues

Manual test checklist:
1. Load any puzzle from the saved or imported library
2. Play a deliberately wrong move
   - Expected: feedback label shows "Not the move. Try again or reveal the line."
   - Expected: board pieces remain draggable / clickable
   - Expected: Retry button is visible
3. After a wrong move, play the correct move
   - Expected: move is accepted, round advances normally
4. After a wrong move, click Retry
   - Expected: board resets to start position, feedback resets to "Find the best move"
5. After a wrong move, click View solution
   - Expected: solution plays out normally, Next puzzle button appears

Remaining risks:
- 'failed' result value becomes unreachable until a later sprint adds explicit give-up logic
  (noted, deferred to Sprint 4 / after-puzzle panel work)
- Session persistence records result at snapshot time — 'active' will now be persisted on
  mid-attempt saves; this is correct behavior but worth noting

In your final report, echo:
Prompt ID: CCP-103
Task ID: CCP-103
```

## CCP-110 - Add Result History Dots

```
Prompt ID: CCP-110
Task ID: CCP-110
Source Document: CCP-102 audit (puzzle page Lichess audit and sprint plan)
Source Step: Sprint 8 — Add result history dots
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
Before editing, check whether any other tool, agent, or Claude Code session is actively
touching `src/puzzles/view.ts` or `src/puzzles/index.ts`. If so, stop and report.

---

Task:
Render a row of colored result dots in the puzzle round view showing the user's recent
session puzzle outcomes. This gives the user session context while solving — matching the
Lichess session strip pattern.

The session data already exists: `puzzleSession.recent` in `src/puzzles/index.ts` is an
array of up to 16 `PuzzleSessionRecent` entries, each with a `result` ('solved', 'viewed',
or 'failed'). This just needs to be passed to the view and rendered.

Inspect first:
- `src/puzzles/session.ts` — `StoredPuzzleSession`, `PuzzleSessionRecent`, and
  `RECENT_PUZZLES_MAX` (currently 16) to understand the data shape
- `src/puzzles/index.ts` — `puzzleSession` module variable (line ~62) and how it is already
  passed to `renderPuzzleLibrary` as `session: puzzleSession` (line ~295); same approach for
  `renderPuzzleRound`
- `src/puzzles/view.ts` — `renderPuzzleRound` deps type and where to add the dots render
- Lichess reference: `docs/reference/lichess-puzzle-ux/sources/ui/puzzle/src/view/main.ts`
  lines 150–187 — the session round-history strip; note Lichess uses rating diffs too;
  Patzer Pro only needs the colored result dots (no rating diffs in this task)
- Lichess reference: `docs/reference/lichess-puzzle-ux/sources/ui/puzzle/css/_session.scss`
  — color rules for result dots

Constraints:
- Touch only `src/puzzles/view.ts` and `src/puzzles/index.ts`
- No rating differential display (Patzer Pro has no user rating system)
- Dot colors: solved → green, failed → red, viewed → grey/neutral
- Render as `div.puzzle-round__session` containing one `span.result-dot` per recent entry
- Render dots most-recent-first (index 0 is most recent)
- Add the dots below the feedback/controls section in the sidebar
- Pass `recent: puzzleSession.recent` in the `renderPuzzleRound` deps from `index.ts`

Exact small step:
1. In `view.ts`: add `recent: PuzzleSessionRecent[]` to the `renderPuzzleRound` deps type;
   render `h('div.puzzle-round__session', recent.map(r => h('span.result-dot.result-dot--' + r.result))))`
   in the sidebar below the controls section
2. In `index.ts`: pass `recent: puzzleSession.recent` in the `renderPuzzleRound` call
3. In `src/styles/main.scss` (or `_puzzle.scss` if CCP-107 has been applied): add minimal
   dot styles — small circles (10–12px), green/red/grey by modifier class

Why safely scoped:
Read-only from existing session state. Additive view element and deps field. No logic changes.

Validation:
- Run `npm run build` — must pass
- Solve several puzzles — confirm dots appear and update after each outcome
- View solution on a puzzle — confirm a grey dot is added
- Confirm dots show most-recent-first

Manual test checklist:
1. Solve a puzzle correctly
   - Expected: a green dot appears as the first (leftmost) dot in the session strip
2. Deliberately fail and view solution on the next puzzle
   - Expected: a grey dot is added to the left of the previous green dot
3. Solve several more puzzles
   - Expected: dots accumulate up to 16 max, oldest drop off the right
4. Reload the app and return to a puzzle round
   - Expected: previous session dots are still shown (loaded from IDB via puzzleSession)

Remaining risks:
- Dot styling is minimal until CCP-107 SCSS is applied; if CCP-107 has already been applied,
  add the dot rules to `_puzzle.scss` instead of `main.scss`
- 'failed' result is currently unreachable (after CCP-103); red dots will not appear until
  a future sprint adds explicit give-up logic — grey 'viewed' dots will be the most common

In your final report, echo:
Prompt ID: CCP-110
Task ID: CCP-110
```

## CCP-109 - Add Keyboard Navigation Shortcuts

```
Prompt ID: CCP-109
Task ID: CCP-109
Source Document: CCP-102 audit (puzzle page Lichess audit and sprint plan)
Source Step: Sprint 7 — Add keyboard navigation shortcuts
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
Before editing, check whether any other tool, agent, or Claude Code session is actively
touching `src/puzzles/index.ts` or `src/keyboard.ts`. If so, stop and report.

---

Task:
Add keyboard shortcuts for the puzzle round: arrow keys navigate solution moves (building on
the nav handlers from CCP-108), and Escape returns to the puzzle library. These should only
be active on the puzzle route and must not conflict with the existing analysis board keyboard
handler in `src/keyboard.ts`.

Inspect first:
- `src/keyboard.ts` — the existing `document.addEventListener('keydown', ...)` handler
  (line ~51); it handles ArrowLeft/Right/Up/Down for analysis navigation — understand how
  to make puzzle keyboard handling take precedence without breaking analysis navigation
- `src/puzzles/index.ts` — `syncPuzzleRoute` entry/exit paths and the `viewPly` /
  `onFirst`/`onPrev`/`onNext`/`onLast` handlers added by CCP-108; these are what keyboard
  shortcuts should call
- `src/keyboard.ts` — check how `getActivePuzzleCtrl` is available or can be imported; the
  cleanest fix is to guard the analysis arrow-key handler so it skips when a puzzle is active

Constraints:
- Touch only `src/puzzles/index.ts` and `src/keyboard.ts`
- Do not add a second global `keydown` listener — instead, gate the existing analysis
  keyboard handler in `keyboard.ts` to skip arrow-key handling when `getActivePuzzleCtrl()`
  returns a truthy value
- The puzzle-specific key action (calling `onFirst`/`onPrev`/`onNext`/`onLast`) should live
  in a small exported function in `index.ts` (e.g. `handlePuzzleKey`) that `keyboard.ts`
  can call
- Escape should call the existing `onBack` logic (navigate to `#/puzzles`)
- `f` for flip should still work on the puzzle route — do not block it
- Only intercept arrow keys when a puzzle ctrl is active; otherwise fall through to analysis

Exact small step:
1. In `src/puzzles/index.ts`: export a `handlePuzzleKey(key: string): boolean` function that
   handles 'ArrowLeft' (prev), 'ArrowRight' (next), 'ArrowUp' (first), 'ArrowDown' (last),
   'Escape' (back to library); returns `true` if the key was consumed, `false` otherwise
2. In `src/keyboard.ts`: import `getActivePuzzleCtrl` from `src/puzzles/runtime` and
   `handlePuzzleKey` from `src/puzzles/index`; at the top of the keydown handler, if
   `getActivePuzzleCtrl()` is truthy, call `handlePuzzleKey(e.key)` and return if consumed

Why safely scoped:
Two files. The puzzle handler is an early-return guard — if there is no active puzzle ctrl,
behaviour is identical to today. Analysis board navigation is fully preserved.

Validation:
- Run `npm run build` — must pass
- On puzzle route (terminal state), arrow keys navigate solution moves
- On puzzle route (active solve), arrow keys do not interfere with board interaction
- On analysis route, arrow keys continue to navigate the move tree as before
- Escape on puzzle route navigates to puzzle library

Manual test checklist:
1. Open a puzzle round and solve it
   - Press ArrowLeft → board steps back one move
   - Press ArrowRight → board steps forward one move
   - Press ArrowUp → board jumps to puzzle start
   - Press ArrowDown → board jumps to final position
2. During an active puzzle (not yet solved)
   - Press arrow keys → no board navigation (board stays for move input)
3. Press Escape on puzzle round
   - Expected: navigates to #/puzzles library
4. Open analysis board (not puzzle route)
   - Press arrow keys → analysis move-tree navigation still works normally
5. Press 'f' on puzzle route
   - Expected: board flips (existing flip behavior preserved)

Remaining risks:
- Arrow key interception during active solve suppresses analysis navigation entirely; if
  users expect arrow navigation during solve, this can be relaxed in a follow-up
- Escape may conflict with other escape handlers (e.g. modals); test with board settings
  panel open

In your final report, echo:
Prompt ID: CCP-109
Task ID: CCP-109
```

## CCP-108 - Add Move Navigation Controls

```
Prompt ID: CCP-108
Task ID: CCP-108
Source Document: CCP-102 audit (puzzle page Lichess audit and sprint plan)
Source Step: Sprint 5 — Add move navigation controls
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
Before editing, check whether any other tool, agent, or Claude Code session is actively
touching `src/puzzles/view.ts` or `src/puzzles/index.ts`. If so, stop and report.

---

Task:
Add first/prev/next/last navigation buttons to the puzzle round view so the user can step
through the solution moves after the round is complete. This mirrors the analysis-board
navigation controls and matches Lichess puzzle behavior.

Currently there is no way to replay individual solution moves in Patzer Pro after solving.
Navigation should be available in terminal states (solved/viewed) and should use the existing
`restoreRoundBoard` infrastructure.

Inspect first:
- `src/puzzles/index.ts` — `restoreRoundBoard(round, progressPly)` (lines ~137–156); this
  is the correct mechanism for jumping to any ply by replaying from startFen; also inspect
  the module-level state variables and `syncPuzzleRoute` to understand where to add a
  `viewPly` tracker
- `src/puzzles/view.ts` — `renderPuzzleRound` signature and deps object; this is where the
  nav buttons will be rendered and the callbacks wired
- `src/puzzles/ctrl.ts` — `progressPly()` and `result()` to understand the current ply and
  terminal state
- Lichess reference: `docs/reference/lichess-puzzle-ux/sources/ui/puzzle/src/view/main.ts`
  lines 42–73 — the `controls()` function with `jumpButton` for first/prev/next/last

Constraints:
- Touch only `src/puzzles/index.ts` and `src/puzzles/view.ts`
- Navigation is only active in terminal states (`result === 'solved' || result === 'viewed'`)
  — disable or hide buttons during active solve to avoid confusing move-input state
- Track `viewPly` as module-level state in `index.ts` (not in ctrl.ts — the ctrl owns game
  logic, not presentation navigation)
- `viewPly` is initialized to the solution length when the round reaches a terminal state,
  and reset when a new puzzle loads
- After any navigation, call `restoreRoundBoard(round, viewPly)`, then
  `ctrl.setCurrentPath(_getCtrlPath())`, then `syncArrow()`, then `_redraw()`
- Do not change `ctrl.progressPly()` — that belongs to the solve state machine
- Buttons: first (|◀), prev (◀), next (▶), last (▶|) — use Unicode or text labels;
  proper icons come in a later styling pass

Exact small step:
1. In `index.ts`: add a `let viewPly = 0` module variable; set it to
   `ctrl.round().solution.length` when the round enters a terminal state; reset it to 0 when
   `clearActivePuzzleRoute()` is called or a new puzzle loads
2. In `index.ts`: add four nav handlers (`onFirst`, `onPrev`, `onNext`, `onLast`) that
   clamp `viewPly` to `[0, solution.length]` and call `restoreRoundBoard` accordingly
3. In `view.ts`: add nav buttons to `renderPuzzleRound` deps and render them in a
   `div.puzzle-round__nav` block below the board shell, visible only in terminal state

Why safely scoped:
`viewPly` is purely presentational state in `index.ts`. `restoreRoundBoard` already handles
replaying to any ply safely. The ctrl state machine is untouched.

Validation:
- Run `npm run build` — must pass
- Solve a puzzle — confirm nav buttons appear
- Step through solution using all four buttons — confirm board updates to correct position
- Load a new puzzle — confirm nav state resets

Manual test checklist:
1. Solve a puzzle correctly
   - Expected: first/prev/next/last buttons appear below the board
   - Expected: board is at the final position (last move)
2. Click prev repeatedly
   - Expected: board steps backward through solution moves one ply at a time
3. Click first
   - Expected: board jumps back to the puzzle start position
4. Click next then last
   - Expected: board advances to the final position
5. Click "Continue training →" to load the next puzzle
   - Expected: nav buttons disappear, board shows new puzzle start position
6. During an active puzzle (not yet solved)
   - Expected: nav buttons are not visible or are disabled

Remaining risks:
- `restoreRoundBoard` for imported puzzles re-initializes from `startFen` each call; with
  long solutions this replays all moves — acceptable for now, optimization deferred
- Nav button styling is minimal; CCP-107 SCSS sprint will style them properly

In your final report, echo:
Prompt ID: CCP-108
Task ID: CCP-108
```

## CCP-107 - Add Puzzle-Specific SCSS

```
Prompt ID: CCP-107
Task ID: CCP-107
Source Document: CCP-102 audit (puzzle page Lichess audit and sprint plan)
Source Step: Sprint 6 — Add puzzle-specific SCSS (layout + feedback)
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
Before editing, check whether any other tool, agent, or Claude Code session is actively
touching `src/styles/main.scss`. If so, stop and report.

---

Task:
Extract all puzzle-round styles from `src/styles/main.scss` into a dedicated
`src/styles/_puzzle.scss` file. Fix the sidebar position to be on the left (matching Lichess
convention). Add styles for the feedback icons (from CCP-105) and completion panel (from
CCP-106) so the puzzle layout is visually complete and self-contained.

Inspect first:
- `src/styles/main.scss` — locate the existing `.puzzle-round` block and all puzzle-related
  responsive rules (currently around lines 2688–2766); these will move to _puzzle.scss
- `src/puzzles/view.ts` — confirm the current class names used in puzzle round rendering
  (`.puzzle-round`, `.puzzle-round__board-shell`, `.puzzle-round__side`, etc.) and any new
  class names introduced by CCP-105 (`.puzzle-round__feedback-icon`) and CCP-106
  (`.puzzle-round__after`, `.puzzle-round__complete`, `.puzzle-round__next`)
- `src/styles/main.scss` — find the existing SCSS import block to know where to add the new
  import for `_puzzle.scss`
- Lichess reference: `docs/reference/lichess-puzzle-ux/sources/ui/puzzle/css/_tools.scss`
  lines 89–105 — `.icon` sizing and `.good .icon` / `.fail .icon` color rules to adapt
- Lichess reference: `docs/reference/lichess-puzzle-ux/sources/ui/puzzle/css/_after.scss`
  — after-panel layout rules to adapt
- Lichess reference: `docs/reference/lichess-puzzle-ux/sources/ui/puzzle/css/_layout.scss`
  — desktop col2/col3 layout structure for reference only; adapt the concept not the
  mixin-heavy implementation

Constraints:
- Touch only `src/styles/main.scss` (remove puzzle block + add import) and the new
  `src/styles/_puzzle.scss`
- Do not change any TypeScript files
- Sidebar-left fix must use CSS only (no DOM reorder): use `order` properties on
  `.puzzle-round__board-shell` and `.puzzle-round__side` within the existing grid, or change
  grid-template-columns and use grid-template-areas
- Do not port Lichess SCSS mixin infrastructure — adapt the rules using Patzer's existing
  CSS variables (`var(--c-bg)`, `var(--c-border)`, `var(--c-muted)`, etc.)
- Keep mobile layout (max-width: 900px) working — single column, sidebar stacks above board
- Feedback icon styles: `.puzzle-round__feedback.good .puzzle-round__feedback-icon` → green,
  `.puzzle-round__feedback.fail .puzzle-round__feedback-icon` → red, font-size ~50px,
  width/height 64px, line-height 64px
- After-panel: `.puzzle-round__after` should be visually distinct from the controls section —
  centered content, larger "Continue training →" button

Why safely scoped:
Pure SCSS change. One file extracted, one new file created, one import added. No TypeScript
changes. Visual-only impact.

Validation:
- Run `npm run build` — must pass
- Open puzzle page and confirm sidebar is on the left of the board (desktop)
- Confirm mobile stacks to single column correctly
- Confirm feedback icon colors appear for good/fail states (if CCP-105 is already applied)
- Confirm after-panel renders correctly (if CCP-106 is already applied)

Manual test checklist:
1. Open any puzzle round on desktop (>900px viewport)
   - Expected: sidebar (meta/controls) appears on the LEFT of the board
2. Resize viewport below 900px
   - Expected: layout stacks to single column, sidebar below board
3. Play a correct move (requires CCP-105)
   - Expected: green ✓ icon is properly sized (~50px) in the feedback section
4. Play a wrong move (requires CCP-105)
   - Expected: red ✗ icon appears correctly
5. Solve a puzzle (requires CCP-106)
   - Expected: after-panel is visually distinct with a prominent "Continue training →" button

Remaining risks:
- If CCP-105 or CCP-106 have not yet been applied, the new class names won't appear in the
  DOM; the SCSS rules will be compiled but inert — this is safe
- Sidebar-left may shift the reading flow for the player strips; verify top/bottom strips
  still appear above and below the board correctly

In your final report, echo:
Prompt ID: CCP-107
Task ID: CCP-107
```

## CCP-106 - Add After-Puzzle Completion Panel

```
Prompt ID: CCP-106
Task ID: CCP-106
Source Document: CCP-102 audit (puzzle page Lichess audit and sprint plan)
Source Step: Sprint 4 — Add after-puzzle completion panel
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
Before editing, check whether any other tool, agent, or Claude Code session is actively
touching `src/puzzles/view.ts` or `src/puzzles/index.ts`. If so, stop and report.

---

Task:
When a puzzle round reaches a terminal state (solved or solution viewed), render a distinct
completion panel instead of the inline "Solved." / "Solution shown." text. This panel should
visually separate the active round from the finished state and make the "Next puzzle" action
prominent.

Currently `result === 'solved'` and `result === 'viewed'` render only a small "Next puzzle"
button in the controls section alongside other controls. Lichess renders a dedicated
`div.puzzle__feedback.after` block with a completion label and a prominent continue button.

Inspect first:
- `src/puzzles/view.ts` — `renderPuzzleRound`; the controls section (lines ~338–350) and how
  `result === 'solved' || result === 'viewed'` currently shows the Next puzzle button
- `src/puzzles/index.ts` — the `onNext` handler (line ~354); confirm it navigates to the
  next puzzle href correctly
- `src/puzzles/types.ts` — `PuzzleRoundResult` values and which states count as terminal
- Lichess reference: `docs/reference/lichess-puzzle-ux/sources/ui/puzzle/src/view/after.ts`
  — the `afterView` function, particularly `div.puzzle__feedback.after`, the `div.complete`
  label (win → 'puzzleSuccess', otherwise → 'puzzleComplete'), and the continue button
- Lichess reference: `docs/reference/lichess-puzzle-ux/sources/ui/puzzle/css/_after.scss`
  — layout rules for `.puzzle__feedback.after`

Constraints:
- Touch only `src/puzzles/view.ts`
- No voting UI (Patzer Pro has no user accounts)
- No streak mode
- The `onNext` callback is already wired in `index.ts` — just call it
- Do not restructure the outer `puzzle-round` layout; modify only what renders inside the
  feedback/controls area when the round is terminal
- Keep the "Back to library" and "Flip" buttons accessible from the terminal state
- The `result = 'failed'` state is currently unreachable after CCP-103 — ignore it in this task

Exact small step:
In `renderPuzzleRound`, when `result === 'solved' || result === 'viewed'`, replace the
feedback section content with a `div.puzzle-round__after` block containing:
- a `div.puzzle-round__complete` label: "Puzzle solved!" for `result === 'solved'`,
  "Puzzle complete." for `result === 'viewed'`
- a prominent `button.puzzle-round__next` labeled "Continue training →" wired to `onNext`

Keep the controls section ("Back to library", "Flip") visible in all states, but hide
"Retry", "View solution", and the progress counter when the round is terminal.

Why safely scoped:
View-only change. The `onNext` handler, the result state machine, and the session logic are
untouched. The terminal detection is a simple `result === 'solved' || result === 'viewed'` check.

Validation:
- Run `npm run build` — must pass
- Solve a puzzle — confirm completion panel appears
- View solution — confirm completion panel appears
- Click "Continue training →" — confirm next puzzle loads

Manual test checklist:
1. Solve a puzzle correctly (all moves correct)
   - Expected: "Puzzle solved!" label appears, "Continue training →" button is prominent
   - Expected: Retry and View solution buttons are gone
   - Expected: Back to library and Flip remain accessible
2. On another puzzle, click "View solution"
   - Expected: "Puzzle complete." label appears, "Continue training →" button is prominent
3. Click "Continue training →" from either terminal state
   - Expected: navigates to the next puzzle in the library
4. From the after-panel, click "Back to library"
   - Expected: returns to the puzzle library list

Remaining risks:
- Visual styling of the after-panel is minimal until CCP-107 adds puzzle SCSS
- 'failed' result state is unreachable; if it becomes reachable in a future sprint, this
  panel will need a third label variant

In your final report, echo:
Prompt ID: CCP-106
Task ID: CCP-106
```

## CCP-105 - Add Visual Feedback Icons

```
Prompt ID: CCP-105
Task ID: CCP-105
Source Document: CCP-102 audit (puzzle page Lichess audit and sprint plan)
Source Step: Sprint 3 — Add visual feedback icons
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
Before editing, check whether any other tool, agent, or Claude Code session is actively
touching `src/puzzles/view.ts` or `src/styles/main.scss`. If so, stop and report.

---

Task:
Add a ✓ icon for correct moves and a ✗ icon for wrong moves in the puzzle feedback section.
Currently the feedback section renders only a text label. Lichess renders a large icon alongside
the text to give clear visual weight to each feedback state.

Inspect first:
- `src/puzzles/view.ts` — the `renderPuzzleRound` function, specifically the
  `section.puzzle-round__feedback` block (lines ~327–337) and the `feedback` variable switch
- `src/styles/main.scss` — current puzzle-related styles if any exist; this is where the
  icon color rules should be added (puzzle-specific SCSS will be extracted in a later sprint)
- Lichess reference: `docs/reference/lichess-puzzle-ux/sources/ui/puzzle/src/view/feedback.ts`
  — how `good()` uses `h('div.icon', '✓')` and `fail()` uses `h('div.icon', '✗')` inside
  a `div.player` wrapper
- Lichess reference: `docs/reference/lichess-puzzle-ux/sources/ui/puzzle/css/_tools.scss`
  lines 89–105 — the `.icon` sizing rules and `.good .icon` / `.fail .icon` color rules

Constraints:
- Touch only `src/puzzles/view.ts` and `src/styles/main.scss`
- Use the existing `puzzle-round__feedback` section — do not restructure the surrounding layout
- Keep icon rendering as simple Unicode characters in a `div` element (✓ and ✗)
- CSS additions to `main.scss` should be minimal and scoped to `.puzzle-round__feedback`
- Do not create a new SCSS file — a dedicated puzzle SCSS will be added in a later sprint
- The 'find' state does not need an icon in this task (deferred with the king-piece icon)
- The 'win' state already shows "Solved." — add ✓ icon to it as well

Exact small step:
In `renderPuzzleRound` in `view.ts`, replace the flat `h('div.puzzle-round__status', label)`
with a structure that includes a `div.puzzle-round__feedback-icon` for the relevant states:
- feedback === 'good': render `h('div.puzzle-round__feedback-icon', '✓')`
- feedback === 'win': render `h('div.puzzle-round__feedback-icon', '✓')`
- feedback === 'fail': render `h('div.puzzle-round__feedback-icon', '✗')`
- feedback === 'find' or 'view': no icon element

In `main.scss`, add color rules for these icons:
- `.puzzle-round__feedback-icon` for `good`/`win`: green
- `.puzzle-round__feedback-icon` for `fail`: red
Scope these by wrapping the feedback section class (e.g. `.puzzle-round__feedback.good .puzzle-round__feedback-icon`), or use data attributes. Keep it simple and correct.

Why safely scoped:
Additive view change in one file plus a few CSS lines. No logic, no state, no controller changes.

Validation:
- Run `npm run build` — must pass
- Trigger each feedback state in a puzzle round and visually confirm the icon appears

Manual test checklist:
1. Load a puzzle, make no move yet
   - Expected: no icon shown, only text label "Find the best move for White/Black"
2. Play a correct move
   - Expected: green ✓ icon appears next to "Correct. Keep going."
3. Play a wrong move
   - Expected: red ✗ icon appears next to "Not the move. Try again or reveal the line."
4. Solve the puzzle completely
   - Expected: green ✓ icon appears next to "Solved."
5. View the solution
   - Expected: no icon, only "Solution shown."

Remaining risks:
- Icon sizing is not yet styled to match Lichess (64×64px block); that will be addressed in
  the puzzle SCSS sprint (CCP-107)
- 'find' state king-piece icon deferred to a later sprint

In your final report, echo:
Prompt ID: CCP-105
Task ID: CCP-105
```

## CCP-104 - Add Opponent Move Animation Delay

```
Prompt ID: CCP-104
Task ID: CCP-104
Source Document: CCP-102 audit (puzzle page Lichess audit and sprint plan)
Source Step: Sprint 2 — Add opponent move animation delay
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
Before editing, check whether any other tool, agent, or Claude Code session is actively
touching `src/board/index.ts`. If so, stop and report before editing.

---

Task:
After a correct user move in a puzzle round, the opponent's reply currently fires instantly
via `playUciMove()`. Add a ~500ms delay before the reply plays, and lock the board during
that window so the user cannot move the opponent's pieces.

Inspect first:
- `src/board/index.ts` — the `onUserMove` handler (puzzle branch, lines ~134–156) and the
  `completePromotion` handler (puzzle branch, lines ~266–285); both call
  `for (const reply of outcome.replies) playUciMove(reply)` synchronously
- `src/board/index.ts` — `syncBoard()` to understand how `movable.color` is set; this is
  what needs to be temporarily cleared during the delay window
- `src/board/index.ts` — `cgInstance` direct access for locking/unlocking the board
- Lichess reference: `ui/puzzle/src/ctrl.ts` — how Lichess sequences the opponent reply
  after a correct move (look for moveTest, afterMove, or reply-delay logic)

Constraints:
- Touch only `src/board/index.ts`
- Use `setTimeout` for the delay — do not introduce a Promise-based sleep utility
- Lock the board (set `movable.color` to `undefined` on `cgInstance`) immediately after the
  user's move is applied, before the timeout fires
- Re-enable the board after the reply plays via `syncBoard()` inside the timeout callback
- The delay value should be a named constant near the call site, not a magic number
- Do not change the promotion path's behavior except to apply the same delay pattern
- Do not change `playUciMove()` itself

Exact small step:
In both puzzle-branch locations in `onUserMove` and `completePromotion` where
`for (const reply of outcome.replies) playUciMove(reply)` is called:
1. Immediately after `applyMoveToTree`, lock the board:
   `cgInstance?.set({ movable: { color: undefined } });`
2. Replace the synchronous reply loop with a `setTimeout` callback (~500ms) that:
   a. plays each reply via `playUciMove(reply)`
   b. calls `syncBoard()` to restore board state and re-enable movability
   c. calls `_redraw()`

Why safely scoped:
Two matching call sites changed in one file. The delay is purely presentational — the tree
state and ctrl state are already correct before the timeout fires.

Validation:
- Run `npm run build` — must pass
- Play a correct puzzle move — opponent reply should pause ~500ms then animate onto the board
- Board should not be interactive during the delay window
- After the reply, the board should be interactive again for the next user move
- Wrong moves and retry should be unaffected

Manual test checklist:
1. Load a puzzle, play the correct first move
   - Expected: brief pause (~0.5s), then opponent piece moves visibly on board
   - Expected: board is not interactive during the pause
2. After opponent reply, play the next correct move in a multi-step puzzle
   - Expected: same delay pattern repeats
3. Play a wrong move
   - Expected: no delay, board stays interactive immediately (retry still works)
4. Click Retry after a wrong move
   - Expected: board resets normally, no stale timeout behavior

Remaining risks:
- If multiple replies arrive (edge case), they all fire at the same timeout tick — acceptable
  for now; chained delays can be added in a follow-up if needed
- 500ms is a heuristic; Lichess uses Chessground animation duration as the signal — this may
  need tuning after visual review

In your final report, echo:
Prompt ID: CCP-104
Task ID: CCP-104
```

## CCP-095 - Establish Lichess Dataset Workspace

```
Prompt ID: CCP-095
Task ID: CCP-095
Source Document: docs/mini-sprints/LICHESS_PUZZLE_DATABASE_INTEGRATION_SPRINT_2026-03-21.md
Source Step: Task 1 — Establish a repo-safe local dataset workspace
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same repo-config / build / dataset-path files.
- If overlapping work exists, stop and report it before editing.

Task: take the smallest safe step toward Lichess puzzle-dataset integration by adding a repo-safe ignored local dataset workspace for raw downloads, preprocessing work files, and generated public shard output.

Inspect first:
- Patzer: `.gitignore`, `package.json`, `build.mjs`, `server.mjs`, current `src/puzzles/*`
- Official source context: confirm the current official Lichess puzzle export details from [database.lichess.org](https://database.lichess.org/)

Constraints:
- scope this to workspace/ignore/guardrail setup only
- do not add the downloader or preprocessing pipeline in this task
- do not commit or vendor any large external data
- keep the generated-output path compatible with the current static `public/` server model

Recommended safe direction to verify first:
- ignore a local raw-data path such as `data/lichess/raw/`
- ignore a local work path such as `data/lichess/work/`
- ignore a generated serve-able path such as `public/generated/lichess-puzzles/`
- add a short repo note if needed so future sessions know raw/exported Lichess data is local-only

Deliverables:
- diagnosis before coding
- exact small step being implemented
- why that step is safely scoped
- implementation
- validation
- short manual test checklist

Validation:
- run the most relevant config/documentation check you can
- report Prompt ID, Task ID, intentional behavior change, runtime/console status, and remaining risks
```

## CCP-096 - Add Lichess Puzzle Download Script

```
Prompt ID: CCP-096
Task ID: CCP-096
Source Document: docs/mini-sprints/LICHESS_PUZZLE_DATABASE_INTEGRATION_SPRINT_2026-03-21.md
Source Step: Task 2 — Add an official Lichess puzzle download script
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same scripts / package metadata / dataset-path files.
- If overlapping work exists, stop and report it before editing.

Task: add an explicit script to download the official `lichess_db_puzzle.csv.zst` export into the local ignored dataset workspace, without tying the download to `npm run build`.

Inspect first:
- Patzer: `package.json`, `build.mjs`, current `scripts/`, `.gitignore`
- Official source: confirm the current puzzle export path and schema from [database.lichess.org](https://database.lichess.org/)

Constraints:
- scope this to the downloader only
- do not add preprocessing or page integration in this task
- do not hook the download into normal frontend build flow
- prefer a dedicated script such as `scripts/puzzles/download-lichess-puzzles.mjs`
- if checksum or metadata capture is practical, keep it minimal and local

Deliverables:
- diagnosis before coding
- exact small step being implemented
- why that step is safely scoped
- implementation
- validation
- short manual test checklist

Validation:
- run the most relevant script-level check you can without forcing a giant download if unnecessary
- report Prompt ID, Task ID, script behavior, runtime/console status, and remaining risks
```

## CCP-097 - Build Lichess Puzzle Shard Pipeline

```
Prompt ID: CCP-097
Task ID: CCP-097
Source Document: docs/mini-sprints/LICHESS_PUZZLE_DATABASE_INTEGRATION_SPRINT_2026-03-21.md
Source Step: Task 3 — Add a streaming preprocessing pipeline to Patzer shard format
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same dataset scripts / generated-output paths / puzzle-type files.
- If overlapping work exists, stop and report it before editing.

Task: add the smallest safe preprocessing pipeline that converts the official Lichess puzzle export into Patzer-friendly generated manifest and shard files for the current static app.

Inspect first:
- Patzer: `server.mjs`, `package.json`, current `scripts/`, current `src/puzzles/*`
- Official source: confirm the current CSV fields from [database.lichess.org](https://database.lichess.org/)
- Lichess reference context: inspect the local puzzle data/runtime references that are relevant to how imported records will later be consumed

Constraints:
- scope this to preprocessing only
- do not load raw CSV in the browser
- do not bundle page UI work
- prefer a streaming approach
- if `.zst` decompression requires a tool or dependency, choose the smallest honest path and explain it
- output should be generated into a serve-able ignored path under `public/generated/lichess-puzzles/`

Recommended output shape to evaluate:
- `manifest.json`
- fixed-size shard files with only the fields Patzer needs initially
- optional dev/sample limit support if it helps validation safely

Deliverables:
- diagnosis before coding
- exact small step being implemented
- why that step is safely scoped
- implementation
- validation
- short manual test checklist

Validation:
- run the most relevant script-level check you can
- report Prompt ID, Task ID, generated output shape, runtime/console status, and remaining risks
```

## CCP-098 - Add Imported Puzzle Loader Seam

```
Prompt ID: CCP-098
Task ID: CCP-098
Source Document: docs/mini-sprints/LICHESS_PUZZLE_DATABASE_INTEGRATION_SPRINT_2026-03-21.md
Source Step: Task 4 — Add imported Lichess puzzle types and loader seams
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle types / loader / manifest files.
- If overlapping work exists, stop and report it before editing.

Task: add Patzer-owned imported-puzzle types plus a loader seam that reads generated Lichess manifest/shard data and adapts imported rows into the app’s puzzle model.

Inspect first:
- Patzer: current `src/puzzles/*`, `src/tree/types.ts`, `src/idb/index.ts` if relevant
- Lichess: inspect the local puzzle runtime references that matter for puzzle-data shape and round consumption
- Dataset context: generated manifest/shard output from the previous task

Constraints:
- scope this to types and loader ownership
- do not build page UI in this task
- do not silently overload the local saved-puzzle type if a distinct imported type is cleaner
- if the real puzzle route/controller seam from `CCP-083` through `CCP-091` is not present yet, stop and report the dependency gap rather than inventing a parallel path

Deliverables:
- diagnosis before coding
- exact small step being implemented
- why that step is safely scoped
- implementation
- validation
- short manual test checklist

Validation:
- run `npm run build`
- report Prompt ID, Task ID, loader behavior, runtime/console status, and remaining risks
```

## CCP-099 - Add Imported Puzzle Source Switch

```
Prompt ID: CCP-099
Task ID: CCP-099
Source Document: docs/mini-sprints/LICHESS_PUZZLE_DATABASE_INTEGRATION_SPRINT_2026-03-21.md
Source Step: Task 5 — Add a puzzle-source switch and imported library surface
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle page / puzzle view / library files.
- If overlapping work exists, stop and report it before editing.

Task: add the smallest honest page-level switch between Patzer local saved puzzles and imported Lichess puzzles, and render a first imported-library surface from the generated shard data.

Inspect first:
- Patzer: current `src/puzzles/*`, `src/main.ts`, `src/idb/index.ts`, any current puzzle route/view files
- Lichess: inspect the local puzzle page/view references that matter for library presentation and source separation

Constraints:
- scope this to the source switch and imported library surface
- do not bundle solve-loop integration in this task
- keep local saved puzzles and imported Lichess puzzles visually and structurally distinct
- do not invent non-existent Lichess metadata fields
- if the real puzzle route/controller seam from `CCP-083` through `CCP-091` is not present yet, stop and report the dependency gap

Deliverables:
- diagnosis before coding
- exact small step being implemented
- why that step is safely scoped
- implementation
- validation
- short manual test checklist

Validation:
- run `npm run build`
- report Prompt ID, Task ID, imported-library behavior, runtime/console status, and remaining risks
```

## CCP-100 - Open Imported Lichess Puzzle Rounds

```
Prompt ID: CCP-100
Task ID: CCP-100
Source Document: docs/mini-sprints/LICHESS_PUZZLE_DATABASE_INTEGRATION_SPRINT_2026-03-21.md
Source Step: Task 6 — Open imported Lichess puzzles in Patzer’s own puzzle controller
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle controller / board / imported-loader files.
- If overlapping work exists, stop and report it before editing.

Task: wire imported Lichess puzzle records into Patzer’s own puzzle controller and board flow so imported rows open as real playable rounds instead of as a separate product path.

Inspect first:
- Patzer: current `src/puzzles/*`, `src/board/index.ts`, any real puzzle controller/view seam that exists by then
- Lichess: inspect the local puzzle solve-loop references that matter for move-sequence consumption

Constraints:
- scope this to opening imported rounds in the existing Patzer puzzle flow
- do not rebuild the puzzle controller for imported data
- do not start public-dataset filter work here
- if the imported loader or real puzzle controller seams are not present yet, stop and report the dependency gap

Deliverables:
- diagnosis before coding
- exact small step being implemented
- why that step is safely scoped
- implementation
- validation
- short manual test checklist

Validation:
- run `npm run build`
- report Prompt ID, Task ID, imported-round behavior, runtime/console status, and remaining risks
```

## CCP-101 - Add Imported Puzzle Filters And Paging

```
Prompt ID: CCP-101
Task ID: CCP-101
Source Document: docs/mini-sprints/LICHESS_PUZZLE_DATABASE_INTEGRATION_SPRINT_2026-03-21.md
Source Step: Task 7 — Add basic filters and lazy paging for imported puzzles
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same imported-library / filter / paging files.
- If overlapping work exists, stop and report it before editing.

Task: add the smallest useful filter and lazy-paging layer for the imported Lichess puzzle library so the page stays usable without trying to load the whole imported dataset at once.

Inspect first:
- Patzer: current imported-library page files, loader files, and any generated-manifest assumptions
- Lichess: inspect the local puzzle product references for filter semantics where relevant

Constraints:
- scope this to imported-library usability
- start with rating, themes, and opening tags only if the generated data genuinely supports them
- prefer lazy shard paging over eager full-library loading
- do not bundle extra product modes or dashboard work

Deliverables:
- diagnosis before coding
- exact small step being implemented
- why that step is safely scoped
- implementation
- validation
- short manual test checklist

Validation:
- run `npm run build`
- report Prompt ID, Task ID, filter/paging behavior, runtime/console status, and remaining risks
```

## CCP-113 - Add Training Queue State to Imported Puzzle Module

```
Prompt ID: CCP-113
Task ID: CCP-113
Source Document: docs/reference/lichess-puzzle-ux/FILTERS_THEMES_AND_SELECTION.md
Source Step: Puzzle training queue — sequential puzzle delivery within a filtered set

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Context:
The current imported puzzle module (`src/puzzles/imported.ts`) is page-based: it shows 24 puzzles at a time and has no concept of "training through a filtered set continuously." When a user finishes the last puzzle on a page, `nextPuzzleHref()` returns `#/puzzles`, bouncing them back to the library. The user needs to be able to solve puzzles sequentially without ever leaving the training flow.

Lichess reference:
- Lichess puzzle training is server-driven: one puzzle is served at a time, chosen from the selected theme/difficulty pool
- The client never manages a local puzzle list; it just requests "next puzzle" and the server responds
- For Patzer (local-only), we replicate this by maintaining a training queue cursor across the local shard pages

Task:
Add a training queue abstraction to `src/puzzles/imported.ts` only. Do NOT change any other files in this prompt.

Add the following to `src/puzzles/imported.ts`:

1. A private training queue state:
   - `trainingActive: boolean` — whether training mode is on
   - `trainingQuery: ImportedPuzzleQuery | null` — the query filters locked in when training started
   - `trainingPage: number` — the page currently loaded for training (may differ from the display page)
   - `trainingItems: ImportedPuzzleRecord[]` — items loaded for the current training page
   - `trainingIndex: number` — index within trainingItems pointing to the current puzzle being solved

2. Export these functions:
   - `startTraining(query: ImportedPuzzleQuery): void`
     - sets trainingActive = true, trainingQuery = query, trainingPage = query.page, trainingIndex = 0
     - loads the training page via the existing shard/manifest infrastructure
     - stores the loaded items into trainingItems when they arrive
   - `isTrainingMode(): boolean`
     - returns trainingActive
   - `currentTrainingRouteId(): string | null`
     - returns trainingItems[trainingIndex]?.routeId ?? null
   - `advanceTrainingCursor(): void`
     - increments trainingIndex
     - if trainingIndex >= trainingItems.length AND hasNext: increments trainingPage, reloads items into trainingItems, resets trainingIndex = 0
     - if trainingIndex >= trainingItems.length AND !hasNext: sets trainingActive = false (training complete)
   - `getNextTrainingRouteId(): string | null`
     - returns trainingItems[trainingIndex + 1]?.routeId ?? null (next after current, without advancing)
   - `stopTraining(): void`
     - resets trainingActive = false, clears training state

3. Training item loading:
   - Re-use the existing shard cache and manifest infrastructure already in the module
   - When `startTraining` or page advance is called, fetch the appropriate shards for the training page using the same filter logic
   - Store results into trainingItems; call the existing `redraw` callback once loaded

Constraints:
- Touch ONLY `src/puzzles/imported.ts`
- Do NOT change the display page state (importedQuery, items shown in library) — training queue is separate state
- Do NOT change `src/puzzles/index.ts` or any view file in this prompt
- Re-use existing shard loading and filter logic; do not duplicate it

Validation:
- run `npm run build`
- report Prompt ID, Task ID, new exports, build status, and any risks
```

## CCP-114 - Wire Training Queue into Continue-Training Navigation

```
Prompt ID: CCP-114
Task ID: CCP-114
Parent Prompt ID: CCP-113
Source Document: docs/reference/lichess-puzzle-ux/STANDARD_PUZZLE_FLOW.md
Source Step: Post-completion continuation — "next puzzle" in training mode

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Context:
After CCP-113, `src/puzzles/imported.ts` has a training queue with `isTrainingMode()`, `advanceTrainingCursor()`, and `getNextTrainingRouteId()`.

Currently in `src/puzzles/index.ts`, `onNext` calls `nextPuzzleHref(ctrl.round())` which only looks at the current display page and returns `#/puzzles` when the last puzzle on that page is reached. This needs to be replaced for imported puzzles in training mode.

Lichess reference:
- After completing a puzzle, the player clicks "Continue" and the next puzzle loads automatically
- The server picks the next puzzle; the client just navigates
- For Patzer, the training queue cursor replaces the server

Task:
Modify `src/puzzles/index.ts` to use the training queue for imported puzzle navigation.

Changes:
1. In `renderPuzzlesRoute` / `onNext` callback (inside the puzzle-round render block):
   - If `ctrl.round().sourceKind === 'imported'` AND `isTrainingMode()`:
     - call `advanceTrainingCursor()`
     - get the next route ID from `currentTrainingRouteId()`
     - if a route ID is available: navigate to `#/puzzles/${routeId}`
     - if null (queue exhausted): navigate to `#/puzzles` (training complete)
   - Otherwise: fall through to existing `nextPuzzleHref(ctrl.round())` behavior (no change for saved puzzles)

2. When `syncPuzzleRoute` loads an imported puzzle round:
   - If training mode is active and the loaded puzzle's routeId matches `currentTrainingRouteId()`, no change needed
   - If training mode is active but the routeId does NOT match (user navigated manually), call `stopTraining()` to exit training mode cleanly

Constraints:
- Touch ONLY `src/puzzles/index.ts`
- Do NOT change saved puzzle navigation behavior
- Do NOT change the library display filters or pagination

Validation:
- run `npm run build`
- report Prompt ID, Task ID, navigation behavior description, build status, remaining risks
```

## CCP-115 - Add "Start Training" Entry Point to Puzzle Library

```
Prompt ID: CCP-115
Task ID: CCP-115
Parent Prompt ID: CCP-114
Source Document: docs/reference/lichess-puzzle-ux/FILTERS_THEMES_AND_SELECTION.md
Source Step: Training entry point — entering continuous solve mode from the library

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Context:
After CCP-113 and CCP-114, training mode exists and navigation is wired. Now the user needs an entry point: a button in the library that starts training with the current filter set. Currently users must click "Solve" on a specific list item; there is no "just give me puzzles from this filter" action.

Lichess reference:
- The Lichess puzzle library shows a list with theme/filter selection
- From any theme page, clicking into puzzles starts a continuous training session
- The entry point is theme-first, not list-item-first

Task:
1. In `src/puzzles/view.ts`:
   - Add `onStartTraining: () => void` to the `renderPuzzleLibrary` deps interface
   - In `renderImportedPuzzleLibrary`, add a "Start Training →" button in the library header area (near the filters or paging section)
   - The button should be visually prominent (use existing `.button` class or similar)
   - Only show the button when `state.items.length > 0` (there are puzzles to train on)

2. In `src/puzzles/index.ts`:
   - Add `onStartTraining` to the `renderPuzzleLibrary` call
   - Implementation: call `startTraining(importedQuery)` then navigate to the first puzzle's routeId
   - `startTraining` is async (items may not be loaded yet); after calling it, wait for the training items to load then navigate
   - If items are already available (cache hit), navigate immediately
   - If items need to load, set a flag and navigate once the redraw fires with items loaded

Constraints:
- Touch ONLY `src/puzzles/view.ts` and `src/puzzles/index.ts`
- Do NOT add training UI to saved puzzle library — saved puzzles are not paginated the same way
- Keep the button label short: "Start Training →" or "Train on these puzzles"

Validation:
- run `npm run build`
- report Prompt ID, Task ID, button presence/behavior, build status, remaining risks
```

## CCP-116 - Persist Filter Query State to IDB

```
Prompt ID: CCP-116
Task ID: CCP-116
Source Document: docs/reference/lichess-puzzle-ux/FILTERS_THEMES_AND_SELECTION.md
Source Step: Filter persistence — filters survive page reload

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Context:
The imported puzzle filter state (`importedQuery`: rating min/max, theme, opening, page) is currently module-level ephemeral state. Every page reload resets it to `defaultImportedPuzzleQuery()`. This means a user who has selected "Endgame / Rating 1200-1600" loses that selection on every reload and has to re-apply filters manually.

Lichess reference:
- Lichess stores puzzle difficulty and color preferences server-side in user preferences
- For Patzer (local-only), IDB is the appropriate persistence layer
- Lichess source: `ctrl.ts` reads prefs from `data.user.prefs`; Patzer equivalent is the IDB puzzle session store

Task:
1. In `src/idb/index.ts`:
   - Add `savePuzzleQueryToIdb(query: ImportedPuzzleQuery): Promise<void>`
     - Persist the query as JSON under a key like `'puzzleQuery'` in the existing puzzle IDB store (or create a separate key-value entry alongside the puzzle session)
   - Add `loadPuzzleQueryFromIdb(): Promise<ImportedPuzzleQuery | null>`
     - Return the stored query, or null if nothing is stored yet

2. In `src/puzzles/index.ts`:
   - When `updateImportedFilters()` or `stepImportedPage()` is called, save the new `importedQuery` to IDB via `savePuzzleQueryToIdb()`
   - In `initPuzzles()`, after loading the puzzle session from IDB, also call `loadPuzzleQueryFromIdb()` and if a stored query exists, set `importedQuery` to it before the first `_redraw()`

Constraints:
- Touch ONLY `src/idb/index.ts` and `src/puzzles/index.ts`
- Do NOT persist the `page` field — restore the query with `page: 0` so the user starts at the first page of their saved filters (not mid-library)
- Do NOT change any view rendering

Validation:
- run `npm run build`
- report Prompt ID, Task ID, IDB key used, save/restore behavior, build status, remaining risks
```

## CCP-117 - Show Active Training Context in Puzzle Round Side Panel

```
Prompt ID: CCP-117
Task ID: CCP-117
Parent Prompt ID: CCP-116
Source Document: docs/reference/lichess-puzzle-ux/STANDARD_PUZZLE_FLOW.md
Source Step: Side panel — puzzle metadata and active training context

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Context:
When solving an imported puzzle, the user has no reminder of what filter/theme they are training on. The side panel shows puzzle ID, rating, themes, and opening — but not "you are currently training: Endgame / Medium difficulty." Adding a small training context label helps the user understand what set of puzzles they are working through.

Lichess reference:
- Lichess puzzle side panel shows the active theme angle prominently (e.g., "Endgame" as a heading)
- Difficulty setting is visible in the side panel
- Source: `ui/puzzle/src/view/side.ts` — `puzzleBox()` renders puzzle metadata; theme label shown near top

Task:
1. In `src/puzzles/view.ts`:
   - Add `trainingContext: { theme: string; opening: string; ratingMin: string; ratingMax: string } | null` to the `renderPuzzleRound` deps interface
   - In the side panel (`aside.puzzle-round__side`), if `deps.trainingContext` is non-null, render a small "Training context" block above the existing feedback section
   - Show only non-empty filter values (e.g., if theme is empty string, omit it)
   - Example display:
     ```
     Training: Endgame · 1200–1600
     ```
   - Use a `div.puzzle-round__training-context` element

2. In `src/styles/_puzzle.scss`:
   - Add minimal styling for `.puzzle-round__training-context`:
     - small font, muted color (`var(--c-muted)`), padding to separate from feedback box below

3. In `src/puzzles/index.ts`:
   - Build the `trainingContext` object from `importedQuery.filters` when `sourceKind === 'imported'`
   - Pass it to `renderPuzzleRound`
   - If `sourceKind === 'saved'`, pass `null`

Constraints:
- Touch ONLY `src/puzzles/view.ts`, `src/styles/_puzzle.scss`, and `src/puzzles/index.ts`
- Do NOT show training context for saved puzzles
- Keep the UI minimal — one line of text, no extra panel/card
- Only show fields that have non-empty/non-default values

Validation:
- run `npm run build`
- report Prompt ID, Task ID, rendering behavior, build status, remaining risks
```

## CCP-118 - Phase 1 Puzzle Training Queue Manager (CCP-113–115)

```
Prompt ID: CCP-118
Task ID: CCP-118
Batch prompt IDs: CCP-113, CCP-114, CCP-115
Source Document: docs/prompts/CLAUDE_PROMPT_QUEUE.md
Execution Target: Claude Code manager session

You are the manager for this batch. Run CCP-113, CCP-114, and CCP-115 in order.

Before starting:
- Read the full prompt for each CCP in docs/prompts/CLAUDE_PROMPT_QUEUE.md
- Confirm each prompt's constraints and file scope

Execution order:
1. Run CCP-113 (Add Training Queue State to Imported Puzzle Module)
   - Verify build passes before proceeding
2. Run CCP-114 (Wire Training Queue into Continue-Training Navigation)
   - Verify build passes before proceeding
3. Run CCP-115 (Add "Start Training" Entry Point to Puzzle Library)
   - Verify build passes

After all three pass:
- Run `npm run build` one final time
- Report: which files were changed, final build status, any risks or open questions
- Do NOT push to git
```

## CCP-119 - Phase 2 Puzzle Filter Persistence Manager (CCP-116–117)

```
Prompt ID: CCP-119
Task ID: CCP-119
Batch prompt IDs: CCP-116, CCP-117
Source Document: docs/prompts/CLAUDE_PROMPT_QUEUE.md
Execution Target: Claude Code manager session

You are the manager for this batch. Run CCP-116 and CCP-117 in order.

Before starting:
- Read the full prompt for each CCP in docs/prompts/CLAUDE_PROMPT_QUEUE.md
- Confirm each prompt's constraints and file scope

Execution order:
1. Run CCP-116 (Persist Filter Query State to IDB)
   - Verify build passes before proceeding
2. Run CCP-117 (Show Active Training Context in Puzzle Round Side Panel)
   - Verify build passes

After both pass:
- Run `npm run build` one final time
- Report: which files were changed, final build status, any risks or open questions
- Do NOT push to git
```
