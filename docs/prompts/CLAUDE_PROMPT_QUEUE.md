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

- CCP-120: Configurable StockfishProtocol Engine Options
  - Add ProtocolConfig constructor param (threads?, hash?) to StockfishProtocol so the background engine can run at Threads=1, Hash=32.

- CCP-121: Background Review Engine Module Skeleton
  - Create src/engine/reviewQueue.ts with background StockfishProtocol instance, queue state types, and public API stubs. Engine init only — no analysis loop yet.

- CCP-122: Per-Game Analysis Loop in reviewQueue.ts
  - Implement enqueueBulkReview, per-game AnalyseCtrl/evalCache, the background batch analysis loop, and getReviewProgress export.

- CCP-123: Route-Change Resilience in main.ts
  - Guard loadGame() with source option, guard onChange() for isBulkRunning(), remove gameAnalysisQueue/onQueuedBatchComplete, wire reviewAllGames to enqueueBulkReview.

- CCP-124: Per-Game Progress Display in Games List
  - Add live progress percentage badges to game rows and a queue summary line above the list.

- CCP-125: Bulk Review Settings Submenu in Header
  - Add Review nav entry with running badge, and a dropdown submenu with depth selector, auto-review toggle, and queue controls (pause/resume/cancel).

- CCP-127: Active Filter Summary Bar
  - Add dismissible filter-chip summary row below the puzzle filter controls; "Clear all" resets all active filters at once.

- CCP-128: Difficulty Preset Pills with Range Display
  - Replace the difficulty `<select>` with five pill buttons (Easiest–Hardest) and a live numeric range label (e.g. "1500–1800").

- CCP-129: Multi-Select Theme Filter Type and Logic
  - Change `ImportedPuzzleFilters.theme: string` to `themes: string[]`; update `recordMatchesFilters`, `shardMayMatch`, IDB restore guard, and `index.ts` wiring.

- CCP-130: Multi-Select Theme Tile Grid View Update
  - Update `renderThemeGrid()` to accept `currentThemes: string[]`; tile clicks toggle membership; multiple tiles active simultaneously.

- CCP-131: Custom Rating Range Number Inputs
  - Add min/max number inputs below the preset pills (Sprint 2); typed values call the existing `onRatingMin`/`onRatingMax` callbacks.

- CCP-132: Theme Category Collapse Toggle
  - Add per-category expand/collapse in the theme grid; "Checkmate Patterns" defaults collapsed; headings become toggle buttons.

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

---

## CCP-120 - Configurable StockfishProtocol Engine Options

```
Prompt ID: CCP-120
Task ID: CCP-120
Source Document: docs/mini-sprints/SPRINT_BACKGROUND_BULK_REVIEW.md
Source Step: Sprint 0 — Make StockfishProtocol configurable

Before starting, check whether any other coding tool or agent is currently editing
src/ceval/protocol.ts or any engine-related file in this repo. If so, resolve the
conflict before proceeding.

Read CLAUDE.md and confirm you understand the 1–3 file constraint and the pre-implementation
checklist before writing any code.

---

TASK: Add a ProtocolConfig constructor parameter to StockfishProtocol.

CONTEXT:
The background bulk review system (see docs/mini-sprints/SPRINT_BACKGROUND_BULK_REVIEW.md)
requires a second Stockfish engine instance that runs at Threads=1 and Hash=32 to minimise
CPU and memory competition with the live analysis engine. Currently StockfishProtocol
hardcodes Threads=cores-1 and Hash=256. This must be overridable.

PRE-IMPLEMENTATION STEPS:
1. Read src/ceval/protocol.ts in full.
2. Locate the `received()` method where `setoption name Threads` and `setoption name Hash`
   are sent.
3. Confirm that the existing call site in src/engine/ctrl.ts uses
   `new StockfishProtocol()` with no arguments — this must remain valid with no
   behavior change after your edit.

FILE CONSTRAINT:
Touch exactly 1 file: src/ceval/protocol.ts

IMPLEMENTATION:
Add an optional ProtocolConfig interface and accept it in the constructor:

  export interface ProtocolConfig {
    threads?: number;  // if omitted: use Math.max(1, navigator.hardwareConcurrency - 1)
    hash?:    number;  // if omitted: use 256
  }

  export class StockfishProtocol {
    constructor(private config: ProtocolConfig = {}) {}
    ...
  }

In received(), when uciok arrives, resolve threads and hash from config before sending:

  const cores   = navigator.hardwareConcurrency ?? 2;
  const threads = this.config.threads ?? Math.max(1, cores - 1);
  const hash    = this.config.hash    ?? 256;
  this.send(`setoption name Threads value ${threads}`);
  this.send(`setoption name Hash value ${hash}`);

DO NOT:
- Change any other part of the protocol
- Touch src/engine/ctrl.ts
- Touch any other file

ACCEPTANCE CRITERIA:
- `new StockfishProtocol()` compiles and behaves identically to before
- `new StockfishProtocol({ threads: 1, hash: 32 })` compiles without error
- pnpm build passes with no new errors or warnings

After completing, run pnpm build and confirm it passes.
Report: Prompt ID CCP-120, Task ID CCP-120, files changed, build status.
Do NOT push to git.
```

---

## CCP-121 - Background Review Engine Module Skeleton

```
Prompt ID: CCP-121
Task ID: CCP-121
Source Document: docs/mini-sprints/SPRINT_BACKGROUND_BULK_REVIEW.md
Source Step: Sprint 1-A — Background engine module skeleton

Before starting, check whether any other coding tool or agent is currently editing
src/engine/ or src/ceval/ files in this repo. If so, resolve before proceeding.

Read CLAUDE.md and confirm you understand the 1–3 file constraint and the
pre-implementation checklist before writing any code.

PREREQUISITE: CCP-120 must be complete. Confirm that StockfishProtocol accepts a
ProtocolConfig constructor argument before proceeding.

---

TASK: Create the src/engine/reviewQueue.ts module with background engine lifecycle
and public API stubs. Do NOT implement the analysis loop yet — that is CCP-122.

CONTEXT:
See docs/mini-sprints/SPRINT_BACKGROUND_BULK_REVIEW.md, Sprint 1.
The background review engine is a second StockfishProtocol instance that operates
completely independently from the live analysis engine in src/engine/ctrl.ts.
It is initialised lazily on first use and stays running for the session.

PRE-IMPLEMENTATION STEPS:
1. Read src/engine/ctrl.ts lines 1–120 — understand how protocol, engineEnabled,
   engineReady, and the readyok handshake work.
2. Read src/engine/batch.ts lines 57–110 — understand initBatch deps structure.
3. Read src/ceval/protocol.ts — confirm ProtocolConfig is present (CCP-120 done).
4. Read src/import/types.ts — confirm the ImportedGame type shape.
5. Read src/analyse/ctrl.ts lines 1–50 — confirm AnalyseCtrl constructor signature.

FILE CONSTRAINT:
Create exactly 1 new file: src/engine/reviewQueue.ts
Do not modify any existing file in this step.

IMPLEMENTATION:

Create src/engine/reviewQueue.ts with:

1. A background engine instance:
   const reviewProtocol = new StockfishProtocol({ threads: 1, hash: 32 });
   let reviewEngineReady = false;
   let reviewEngineInitStarted = false;

2. ReviewQueueEntry type:
   export interface ReviewQueueEntry {
     game:    ImportedGame;
     ctrl:    AnalyseCtrl;
     cache:   Map<string, PositionEval>;
     done:    number;
     total:   number;
     status:  'pending' | 'analyzing' | 'complete' | 'error';
   }

3. Module-level queue state:
   let queue: ReviewQueueEntry[] = [];
   let activeIndex = -1;
   let queuePaused = false;

4. Public API (stubs — bodies to be filled in CCP-122):
   export function enqueueBulkReview(games: ImportedGame[]): void { /* stub */ }
   export function isBulkRunning(): boolean { return ... }
   export function isBulkPaused(): boolean { return queuePaused; }
   export function cancelBulkReview(): void { /* stub */ }
   export function pauseBulkReview(): void { /* stub */ }
   export function resumeBulkReview(): void { /* stub */ }
   export function getReviewProgress(gameId: string): number | undefined { /* stub */ }
   export function getQueueSummary(): { total: number; done: number; running: boolean } { ... }

5. Background engine init function (not exported — internal):
   async function initReviewEngine(baseUrl: string): Promise<void>
   This mirrors the pattern in src/engine/ctrl.ts initEngine() — wire reviewProtocol.onMessage()
   to a local received() handler that sets reviewEngineReady = true when it sees 'readyok'.

6. Export the reviewProtocol for use by the analysis loop in CCP-122:
   export { reviewProtocol };

DO NOT:
- Implement the analysis loop (that is CCP-122)
- Import from or modify src/engine/batch.ts
- Import from or modify src/engine/ctrl.ts (except types)
- Import from or modify src/main.ts

ACCEPTANCE CRITERIA:
- File compiles with no TypeScript errors
- pnpm build passes
- The module can be imported without side effects

After completing, run pnpm build and confirm it passes.
Report: Prompt ID CCP-121, Task ID CCP-121, files changed, build status.
Do NOT push to git.
```

---

## CCP-122 - Per-Game Analysis Loop in reviewQueue.ts

```
Prompt ID: CCP-122
Task ID: CCP-122
Source Document: docs/mini-sprints/SPRINT_BACKGROUND_BULK_REVIEW.md
Source Step: Sprint 1-B — Per-game analysis loop

Before starting, check whether any other coding tool or agent is currently editing
src/engine/reviewQueue.ts or src/engine/batch.ts. If so, resolve before proceeding.

Read CLAUDE.md and confirm you understand the 1–3 file constraint before writing any code.

PREREQUISITE: CCP-121 must be complete. Confirm reviewQueue.ts exists and compiles.

---

TASK: Implement the per-game background analysis loop inside src/engine/reviewQueue.ts.
This fills in the stubs created in CCP-121.

CONTEXT:
See docs/mini-sprints/SPRINT_BACKGROUND_BULK_REVIEW.md, Sprint 1.
The background analysis loop mirrors what src/engine/batch.ts does for the live board,
but uses the background engine (reviewProtocol), per-game AnalyseCtrl instances, and
per-game eval caches. It must be self-contained in reviewQueue.ts — do not modify
batch.ts or ctrl.ts.

PRE-IMPLEMENTATION STEPS:
1. Read src/engine/batch.ts in full — understand evalBatchItem(), onBatchBestmove(),
   advanceBatch(), startBatchAnalysis(), and the BatchItem type.
2. Read src/engine/ctrl.ts lines 60–200 — understand evalCache, currentEval,
   PositionEval, and the parseEngineLine/bestmove handling pattern.
3. Read src/engine/winchances.ts — understand evalWinChances() for loss computation.
4. Read src/idb/index.ts lines 200–230 — understand saveAnalysisToIdb and
   buildAnalysisNodes signatures.
5. Read src/tree/ops.ts — understand pathInit and how mainline paths are constructed.
6. Read src/engine/reviewQueue.ts in full (your CCP-121 output).

FILE CONSTRAINT:
Touch exactly 1 file: src/engine/reviewQueue.ts
Do not modify batch.ts, ctrl.ts, main.ts, or any other file.

IMPLEMENTATION:

Implement the following inside reviewQueue.ts:

1. enqueueBulkReview(games):
   - Skip games already in the queue or already complete in analyzedGameIds.
   - For each new game: build an AnalyseCtrl from pgnToTree(game.pgn).
   - Compute total = mainline.length - 1 (positions to analyze, skip root).
   - Push a ReviewQueueEntry with status 'pending'.
   - If engine not yet initialised, call initReviewEngine(baseUrl) — use the same
     baseUrl as the live engine ('/stockfish-web' or equivalent).
   - Call advanceQueue() to start.

2. advanceQueue():
   - Find the first 'pending' entry, set it to 'analyzing', set activeIndex.
   - Call startEntryBatch(entry).

3. startEntryBatch(entry):
   - Build a queue of { nodeId, nodePath, parentPath, fen, nodePly } for every
     mainline position not already in entry.cache.
   - If queue is empty, finishEntry(entry).
   - Otherwise send the first position to reviewProtocol:
       reviewProtocol.setPosition(fen)
       reviewProtocol.go(reviewDepth)
     (import reviewDepth from src/engine/batch.ts)

4. onReviewBestmove(line):
   - Called from the reviewProtocol onMessage handler when 'bestmove' is received.
   - Read the current eval accumulated from 'info' lines (mirror the currentEval
     accumulation pattern from src/engine/ctrl.ts parseEngineLine).
   - Store to entry.cache using the same delta/loss computation as batch.ts
     onBatchBestmove().
   - Increment entry.done.
   - Advance to the next position or call finishEntry(entry).

5. finishEntry(entry):
   - Set entry.status = 'complete'.
   - Call saveAnalysisToIdb('complete', entry.game.id, buildAnalysisNodes(...), reviewDepth).
   - Update _analyzedGameIds, _missedTacticGameIds, _analyzedGameAccuracy
     (these must be injected via an initReviewQueue(deps) function, mirroring initBatch).
   - Call _redraw().
   - Call advanceQueue() to start the next game.

6. getReviewProgress(gameId):
   - Find entry by gameId.
   - If not found: return undefined.
   - If status 'complete': return 100.
   - If total === 0: return undefined.
   - Return Math.round((entry.done / entry.total) * 100).

7. cancelBulkReview():
   - Call reviewProtocol.stop() if active.
   - Clear queue, reset activeIndex, queuePaused = false.

8. pauseBulkReview() / resumeBulkReview():
   - pause: set queuePaused = true, call reviewProtocol.stop().
   - resume: set queuePaused = false, call advanceQueue() if there are pending entries.

9. Add initReviewQueue(deps) function accepting the same shape as initBatch deps
   (analyzedGameIds, missedTacticGameIds, analyzedGameAccuracy, getUserColor, redraw)
   so main.ts can wire it at startup.

INFO LINE ACCUMULATION:
Maintain a module-level reviewCurrentEval: PositionEval = {} that is reset at the start
of each position and populated from 'info' UCI lines in the onMessage handler, exactly
mirroring the pattern in src/engine/ctrl.ts parseEngineLine() for the cp/mate/best/moves
fields. On 'bestmove', snapshot it before resetting.

DO NOT:
- Modify src/engine/batch.ts
- Modify src/engine/ctrl.ts
- Modify src/main.ts
- Implement anything related to UI rendering

ACCEPTANCE CRITERIA:
- pnpm build passes with no TypeScript errors
- enqueueBulkReview([game]) starts the background engine and sends the first position
- getReviewProgress(gameId) returns a number 0–100 while in progress
- Completing a game calls saveAnalysisToIdb and advances the queue

After completing, run pnpm build and confirm it passes.
Report: Prompt ID CCP-122, Task ID CCP-122, files changed, build status, any open
questions about the info-line parsing or loss computation.
Do NOT push to git.
```

---

## CCP-123 - Route-Change Resilience in main.ts

```
Prompt ID: CCP-123
Task ID: CCP-123
Source Document: docs/mini-sprints/SPRINT_BACKGROUND_BULK_REVIEW.md
Source Step: Sprint 2 — Route-change resilience

Before starting, check whether any other coding tool or agent is currently editing
src/main.ts. If so, resolve before proceeding.

Read CLAUDE.md and confirm you understand the 1–3 file constraint before writing any code.

PREREQUISITE: CCP-122 must be complete. Confirm reviewQueue.ts exports enqueueBulkReview,
isBulkRunning, and initReviewQueue before proceeding.

---

TASK: Make background bulk review survive route changes and user navigation in main.ts.

CONTEXT:
See docs/mini-sprints/SPRINT_BACKGROUND_BULK_REVIEW.md, Sprint 2.
Currently loadGame() unconditionally calls resetBatchState() and clearEvalCache(),
destroying any running bulk queue. The onChange() route handler calls loadGame() on
analysis-game deep links regardless of queue state. Both must be guarded.

PRE-IMPLEMENTATION STEPS:
1. Read src/main.ts in full. Focus on:
   - loadGame() and every place it is called
   - onQueuedBatchComplete()
   - gameAnalysisQueue
   - reviewAllGames()
   - the onChange() route handler (the hashchange listener)
   - the initBatch() call and its deps
2. Read src/engine/reviewQueue.ts — confirm initReviewQueue, enqueueBulkReview,
   isBulkRunning exports exist.
3. Read src/engine/batch.ts lines 126–133 — confirm resetBatchState().

FILE CONSTRAINT:
Touch exactly 1 file: src/main.ts

CHANGES REQUIRED:

1. Add `source?: 'queue' | 'user'` parameter to loadGame():
   function loadGame(pgn: string, opts?: { source?: 'queue' | 'user' }): void

   When opts?.source === 'queue':
   - Rebuild ctrl from the new PGN
   - Increment restoreGeneration
   - Return immediately
   - Do NOT call resetBatchState()
   - Do NOT call clearEvalCache()
   - Do NOT call loadAndRestoreAnalysis()
   All other callers pass no opts and get the existing full-reset behavior unchanged.

2. In the onChange() route handler:
   After parsing the incoming route, add this guard before any loadGame() call:
   if (isBulkRunning() && (route.name === 'analysis-game' || route.name === 'analysis')) {
     selectedGameId = route.params?.id ?? selectedGameId;
     vnode = patch(vnode, view(currentRoute));
     return;
   }

3. Remove gameAnalysisQueue and onQueuedBatchComplete() from main.ts entirely.

4. Update reviewAllGames() to call enqueueBulkReview(games) instead of managing the
   queue itself:
   function reviewAllGames(games: ImportedGame[]): void {
     if (games.length === 0) return;
     enqueueBulkReview(games);
     window.location.hash = '#/games';
   }
   (Navigate to games tab so user can see progress — do not navigate to analysis board.)

5. Add initReviewQueue() call at the same point where initBatch() is called,
   passing the same shared state (analyzedGameIds, missedTacticGameIds,
   analyzedGameAccuracy, getUserColor, redraw).

6. Remove the onBatchComplete: onQueuedBatchComplete dep from the initBatch() call
   (the queue is now self-managing via reviewQueue.ts).

DO NOT:
- Change any logic inside loadGame() for the normal 'user' path
- Change the analysis board rendering
- Touch src/engine/batch.ts or src/engine/reviewQueue.ts

ACCEPTANCE CRITERIA:
- pnpm build passes
- reviewAllGames() calls enqueueBulkReview() and navigates to #/games
- loadGame() called with { source: 'queue' } does not reset batch state or eval cache
- onChange() does not call loadGame() while isBulkRunning() is true

After completing, run pnpm build and confirm it passes.
Report: Prompt ID CCP-123, Task ID CCP-123, files changed, build status.
Do NOT push to git.
```

---

## CCP-124 - Per-Game Progress Display in Games List

```
Prompt ID: CCP-124
Task ID: CCP-124
Source Document: docs/mini-sprints/SPRINT_BACKGROUND_BULK_REVIEW.md
Source Step: Sprint 3 — Per-game progress display

Before starting, check whether any other coding tool or agent is currently editing
src/games/view.ts or src/styles/main.scss. If so, resolve before proceeding.

Read CLAUDE.md and confirm you understand the 1–3 file constraint before writing any code.

PREREQUISITE: CCP-123 must be complete. Confirm isBulkRunning, getReviewProgress,
and getQueueSummary are exported from src/engine/reviewQueue.ts.

---

TASK: Show live progress percentages on game rows and a queue summary line above the
game list while bulk review is running.

CONTEXT:
See docs/mini-sprints/SPRINT_BACKGROUND_BULK_REVIEW.md, Sprint 3.
The background review engine calls _redraw() after each bestmove, which repaints
the games list. No new redraw wiring is needed — only new rendering logic.

PRE-IMPLEMENTATION STEPS:
1. Read src/games/view.ts in full. Understand:
   - renderGameRow / renderCompactGameRow and how badges are currently rendered
   - renderGamesView and renderGameList — where the list container is built
   - GamesViewDeps — what is currently injected
2. Read src/engine/reviewQueue.ts — confirm the exports needed:
   getReviewProgress(gameId): number | undefined
   isBulkRunning(): boolean
   getQueueSummary(): { total: number; done: number; running: boolean }
3. Read src/styles/main.scss — find the existing .game-list__row and
   .games-view__row styles to understand where to add new selectors.

FILE CONSTRAINT:
Touch exactly 2 files: src/games/view.ts, src/styles/main.scss

CHANGES IN src/games/view.ts:

1. Import getReviewProgress, isBulkRunning, getQueueSummary from
   '../engine/reviewQueue'.

2. In the game row renderer (both renderGameRow and renderCompactGameRow),
   after the existing analyzed/missed-tactic badge logic, add:
   const progress = getReviewProgress(game.id);
   If progress is defined and < 100:
   - Add class 'analyzing' to the row element
   - Render a span.game-row__progress with text `${progress}%` in the badges area
   If progress is 100 or analyzedIds has the game: render the existing analyzed badge.
   Priority order: in-progress > analyzed > missed-tactic > none.

3. In renderGamesView and renderGameList, immediately before the game list element,
   conditionally render a queue summary line:
   const summary = getQueueSummary();
   if (summary.running) {
     // h('div.games-view__queue-status', `Reviewing ${summary.total} games — ${summary.done} complete`)
   }

DO NOT:
- Add new deps to GamesViewDeps
- Change any existing badge rendering for non-bulk-review states
- Modify any file other than the two listed

CHANGES IN src/styles/main.scss:

Add these styles near the existing .game-list__row and .games-view__row blocks:

.game-list__row.analyzing,
.games-view__row.analyzing {
  background: #181d28;
}

.game-row__progress {
  color: #7eb6d9;
  font-size: 0.78em;
  font-variant-numeric: tabular-nums;
  min-width: 2.8ch;
  text-align: right;
}

.games-view__queue-status {
  font-size: 0.82em;
  color: var(--c-muted, #888);
  padding: 4px 8px 8px;
}

ACCEPTANCE CRITERIA:
- pnpm build passes
- A game row shows "42%" in the badge area while that game is being reviewed
- The percentage increments with each bestmove callback
- The .analyzing background is visible on the active row
- The queue summary line appears above the list while bulk is running
- No visual regression on rows that are not being reviewed

After completing, run pnpm build and confirm it passes.
Report: Prompt ID CCP-124, Task ID CCP-124, files changed, build status.
Do NOT push to git.
```

---

## CCP-125 - Bulk Review Settings Submenu in Header

```
Prompt ID: CCP-125
Task ID: CCP-125
Source Document: docs/mini-sprints/SPRINT_BACKGROUND_BULK_REVIEW.md
Source Step: Sprint 4 — Bulk Review settings submenu

Before starting, check whether any other coding tool or agent is currently editing
src/header/index.ts or src/styles/main.scss. If so, resolve before proceeding.

Read CLAUDE.md and confirm you understand the 1–3 file constraint before writing any code.

PREREQUISITE: CCP-124 must be complete.

---

TASK: Add a "Review" entry to the main nav with a submenu for bulk review settings
and queue controls.

CONTEXT:
See docs/mini-sprints/SPRINT_BACKGROUND_BULK_REVIEW.md, Sprint 4.
The submenu mirrors the pattern of the existing global settings menu in header/index.ts.
Clicking "Review" in the nav opens a dropdown — it does not change the route.

PRE-IMPLEMENTATION STEPS:
1. Read src/header/index.ts in full. Understand:
   - navLinks array and renderNav()
   - showGlobalMenu / showBoardSettings toggle pattern
   - How the existing global settings menu is rendered and closed on outside click
   - HeaderDeps interface
2. Read src/engine/reviewQueue.ts — confirm these exports:
   isBulkRunning(): boolean
   isBulkPaused(): boolean
   pauseBulkReview(): void
   resumeBulkReview(): void
   cancelBulkReview(): void
   getQueueSummary(): { total: number; done: number; running: boolean }
3. Read src/engine/batch.ts — confirm setReviewDepth(v) and reviewDepth exports.
4. Read src/styles/main.scss near the header section to understand existing
   menu/dropdown styles before adding new ones.

FILE CONSTRAINT:
Touch exactly 2 files: src/header/index.ts, src/styles/main.scss

CHANGES IN src/header/index.ts:

1. Add module-level state:
   let showReviewMenu = false;

2. Do NOT add "Review" to the navLinks array (navLinks drives <a> tag nav items
   that change the route). Instead render the Review button as a separate nav item
   that toggles showReviewMenu, placed after the existing navLinks items.

3. In renderNav(), append a Review button after the mapped navLinks:
   h('button.header__review-btn', {
     class: { active: showReviewMenu },
     on: { click: (e) => {
       e.stopPropagation();
       showReviewMenu = !showReviewMenu;
       showGlobalMenu = false;
       showBoardSettings = false;
       deps.redraw();
     }},
   }, [
     'Review',
     isBulkRunning() ? h('span.review-queue-badge', String(getQueueSummary().total - getQueueSummary().done)) : null,
   ])

4. When showReviewMenu is true, render a .header__review-menu dropdown containing:

   a) Depth selector — a row of buttons for depths 12, 14, 16, 18, 20:
      Current reviewDepth is highlighted. Clicking calls setReviewDepth(d) and redraws.

   b) Auto-review toggle — a checkbox:
      Label: "Auto-review new games after import"
      Persists to localStorage key 'patzer.autoReview' (read/write directly).

   c) Queue status section — shown only when isBulkRunning() or isBulkPaused():
      Text: `${summary.done} of ${summary.total} games complete`
      Pause button (if running): calls pauseBulkReview(), redraws
      Resume button (if paused): calls resumeBulkReview(), redraws
      Cancel button: calls cancelBulkReview(), redraws

   d) When not running and not paused: text "No review in progress"

5. Close showReviewMenu on outside click using the same document click listener
   pattern already used by showGlobalMenu and showBoardSettings.

6. Add redraw dep to any event handler that needs it, using deps.redraw.

7. Export a getAutoReview(): boolean helper reading localStorage for use by the
   import system in CCP-122/main.ts wiring later.

DO NOT:
- Change HeaderDeps interface (use the same existing redraw dep)
- Change the existing global menu or board settings menu behavior
- Add route-changing behavior to the Review button
- Modify any file other than the two listed

CHANGES IN src/styles/main.scss:

Add near the header nav styles:

.header__review-btn {
  background: none;
  border: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  padding: 0 10px;
  display: flex;
  align-items: center;
  gap: 5px;
  opacity: 0.8;
  &:hover, &.active { opacity: 1; }
}

.review-queue-badge {
  background: #3a6ea8;
  border-radius: 8px;
  font-size: 0.7em;
  padding: 1px 6px;
  font-variant-numeric: tabular-nums;
  color: #fff;
}

.header__review-menu {
  position: absolute;
  top: 100%;
  right: 0;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 16px;
  min-width: 260px;
  z-index: 200;
  display: flex;
  flex-direction: column;
  gap: 16px;

  h3 {
    margin: 0 0 8px;
    font-size: 0.9em;
    color: var(--c-muted, #888);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
}

.review-depth-strip {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;

  button {
    padding: 4px 10px;
    border-radius: 4px;
    border: 1px solid #444;
    background: #222;
    color: inherit;
    cursor: pointer;
    font-size: 0.88em;
    &.active {
      background: #3a6ea8;
      border-color: #3a6ea8;
      color: #fff;
    }
    &:hover:not(.active) { background: #2a2a2a; }
  }
}

.review-queue-controls {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

ACCEPTANCE CRITERIA:
- pnpm build passes
- Clicking "Review" in the nav toggles the submenu open/closed
- Depth buttons update reviewDepth in batch.ts and persist to localStorage
- Auto-review checkbox reads/writes patzer.autoReview in localStorage
- Queue status shows correct counts while bulk is running
- Pause/resume/cancel all call through to reviewQueue.ts correctly
- Running badge count updates each redraw
- Submenu closes when clicking outside it
- No regression to existing global menu or board settings menu

After completing, run pnpm build and confirm it passes.
Report: Prompt ID CCP-125, Task ID CCP-125, files changed, build status.
Do NOT push to git.
```

---

## CCP-126 - Background Bulk Review Sprint Manager (CCP-120–125)

```
Prompt ID: CCP-126
Task ID: CCP-126
Source Document: docs/mini-sprints/SPRINT_BACKGROUND_BULK_REVIEW.md

THIS IS A MANAGER/RUNNER PROMPT. CCP-126 is metadata for this runner only.
Do NOT execute CCP-126 as one of the child prompts. Do NOT re-read or recurse into this prompt.

---

SETUP: Before running any child prompt, read:
- /Users/leftcoast/Development/PatzerPatzer/CLAUDE.md
- /Users/leftcoast/Development/PatzerPatzer/AGENTS.md
- /Users/leftcoast/Development/PatzerPatzer/docs/mini-sprints/SPRINT_BACKGROUND_BULK_REVIEW.md
- /Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_QUEUE.md

The child prompts to execute are, in this exact order:
  1. CCP-120
  2. CCP-121
  3. CCP-122
  4. CCP-123
  5. CCP-124
  6. CCP-125

Read each prompt exactly as written from CLAUDE_PROMPT_QUEUE.md.
Do not interpret, reorder, or skip any prompt in the sequence.
Do not modify CLAUDE_PROMPT_QUEUE.md, CLAUDE_PROMPT_LOG.md, CLAUDE_PROMPT_HISTORY.md,
or code-review.md at any point during the batch.

---

EXECUTION RULES:

Execute each child prompt sequentially. After completing each one:
- Run pnpm build
- Confirm the build passes before moving to the next prompt
- Report briefly:
    Prompt ID: CCP-###
    Task: <short title>
    Build: passed / failed
    Internal check: passed / issue found
    Continue: yes / no

Stop immediately and report if any of the following occur:
- pnpm build fails
- TypeScript reports new errors introduced by the change
- A required file from the prompt spec does not exist
- The implementation cannot be completed safely within the stated file constraint
- Repo state becomes too uncertain to continue safely

If the batch stops early, report:
- which Prompt ID stopped the batch
- why it stopped
- what the exact failure or issue was
- what state the repo is in

Do not attempt to fix a failed build by expanding scope into unrequested files.
Do not continue past a known build or validation failure.
Do not create new prompts during the batch.
Do not push to git at any point.

---

DEPENDENCY ORDER:

CCP-120 has no dependencies.
CCP-121 requires CCP-120 to be complete (StockfishProtocol must accept ProtocolConfig).
CCP-122 requires CCP-121 to be complete (reviewQueue.ts skeleton must exist).
CCP-123 requires CCP-122 to be complete (enqueueBulkReview and isBulkRunning must be exported).
CCP-124 requires CCP-123 to be complete (getReviewProgress and getQueueSummary must be exported).
CCP-125 requires CCP-124 to be complete.

If any step's prerequisite is not met, stop and report before proceeding.

---

FINAL REPORT (when all 6 prompts complete):

Report a compact summary:
- List each completed Prompt ID and task title
- Final build status
- Any open questions or follow-up issues noted during the run
- Do NOT push to git
```

## CCP-127 - Active Filter Summary Bar

```
Prompt ID: CCP-127
Task ID: CCP-127
Source Document: puzzle filter UI audit (planning session)
Source Step: Sprint Prompt 1 — Active Filter Summary Bar
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Before editing any file, re-read:
- `/Users/leftcoast/Development/PatzerPatzer/AGENTS.md`
- `/Users/leftcoast/Development/PatzerPatzer/CLAUDE.md`

Startup coordination step:
Before editing, check whether any other tool, agent, or Claude Code session is actively
touching `src/puzzles/view.ts` or `src/styles/main.scss`. If so, stop and report.

---

Task:
Add a dismissible active-filter summary bar to the imported puzzle library view.

Currently there is no visual indication of which filters are active. The user must inspect
each control individually. The goal is a compact chip row that appears below the filter
controls whenever one or more filters are set.

Implementation steps:

1. Read `src/puzzles/view.ts` and `src/styles/main.scss` fully before editing.

2. In `src/puzzles/view.ts`, add a `renderActiveFilterSummary()` helper function.
   - It accepts `filters: ImportedPuzzleFilters` and callback refs for clearing each filter.
   - Returns a `VNode | null` — null when all filters are at their default state (empty strings).
   - When any filter is active, renders a `div.puzzle-filter__active-summary` containing:
     - One chip per active filter field:
       - ratingMin or ratingMax set: show a chip with the numeric range text (e.g. "1500–1800" or ">1500" if only one is set)
       - theme set: show a chip with the theme name
       - opening set: show a chip with a shortened opening name (first two words is fine)
     - Each chip: `span.puzzle-filter__chip` with an `×` button (`button.puzzle-filter__chip-clear`) that clears only that filter
     - A "Clear all" button (`button.puzzle-filter__clear-all`) shown only when ≥2 filters are active
   - The callbacks to call on clear:
     - rating chip: call `onRatingMin('')` and `onRatingMax('')`
     - theme chip: call `onTheme('')`
     - opening chip: call `onOpening('')`

3. In `renderImportedPuzzleLibrary()`, insert `renderActiveFilterSummary(...)` into the
   `filterPanel` node immediately after the `div.puzzle-filter__settings` settings row.
   Pass the filter values and the existing `deps.onRatingMin`, `deps.onRatingMax`,
   `deps.onTheme`, `deps.onOpening` callbacks.

4. In `src/styles/main.scss`, add styles for:
   - `.puzzle-filter__active-summary`: flex row, flex-wrap, gap 6px, padding 4px 0
   - `.puzzle-filter__chip`: inline-flex, align-items center, gap 4px, small padding, border, rounded
   - `.puzzle-filter__chip-clear`: small ×-button appearance, no border, cursor pointer
   - `.puzzle-filter__clear-all`: text button style, muted color, small font

Do not modify `src/puzzles/types.ts`, `src/puzzles/imported.ts`, or `src/puzzles/index.ts`.
Do not modify any files outside `src/puzzles/view.ts` and `src/styles/main.scss`.

Validation:
- Run `pnpm build` and confirm it passes with no type errors.
- In the browser, set Difficulty to "Normal" and pick a theme tile — confirm chips appear.
- Click the theme chip × — confirm only the theme clears, difficulty chip remains.
- Click "Clear all" — confirm both chips disappear and filters reset.
- Confirm no chips render when all filters are at default.

Echo in final report:
Prompt ID: CCP-127
Task ID: CCP-127
```

## CCP-128 - Difficulty Preset Pills with Range Display

```
Prompt ID: CCP-128
Task ID: CCP-128
Source Document: puzzle filter UI audit (planning session)
Source Step: Sprint Prompt 2 — Replace Difficulty Dropdown with Preset Pills
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Before editing any file, re-read:
- `/Users/leftcoast/Development/PatzerPatzer/AGENTS.md`
- `/Users/leftcoast/Development/PatzerPatzer/CLAUDE.md`

Startup coordination step:
Before editing, check whether any other tool, agent, or Claude Code session is actively
touching `src/puzzles/view.ts` or `src/styles/main.scss`. If so, stop and report.

---

Task:
Replace the difficulty `<select>` dropdown with five preset pill buttons plus a live
numeric range display.

The current `renderDifficultyStrip()` renders a `<select>` with named options. The user
cannot see the numeric range without opening the dropdown. The goal is a pill-button row
where the active preset is highlighted and the current numeric range is shown adjacent.

Implementation steps:

1. Read `src/puzzles/view.ts` and `src/styles/main.scss` fully before editing.

2. In `src/puzzles/view.ts`, replace the body of `renderDifficultyStrip()` with a new
   implementation (keep the function signature identical — same name and params):
   - Render a `div.puzzle-filter__difficulty` containing:
     - A label: `span.puzzle-filter__label` with text "Difficulty"
     - A row of 5 pill buttons, one per entry in `DIFFICULTY_PRESETS`:
       - each: `button.puzzle-filter__preset-pill` with `.active` class when the preset
         matches the current `ratingMin`/`ratingMax` values (use the existing `currentDifficulty()` helper)
       - clicking a pill calls `onRatingMin(preset.ratingMin)` and `onRatingMax(preset.ratingMax)`
     - A range display: `span.puzzle-filter__range-display` showing:
       - "All ratings" when both ratingMin and ratingMax are empty
       - "< N" when only ratingMax is set
       - "> N" when only ratingMin is set
       - "N – M" when both are set
   - Remove the old `h('select', ...)` and `h('option', ...)` nodes entirely.
   - Do not add an "All difficulties" pill — the default state (all empty) is shown by the
     range display text and the absence of any active pill highlight.

3. In `src/styles/main.scss`, add or update styles:
   - `.puzzle-filter__difficulty`: flex row, align-items center, flex-wrap wrap, gap 8px
   - `.puzzle-filter__preset-pill`: small pill button, border, rounded, muted color;
     `.active` state uses a highlighted border and text color
   - `.puzzle-filter__range-display`: muted small text, font-variant-numeric tabular-nums

4. Remove or replace the old `.puzzle-difficulty__selector` SCSS rule if it is now unused.
   Only remove it if `renderDifficultyStrip` no longer renders that class.

Do not modify `src/puzzles/types.ts`, `src/puzzles/imported.ts`, or `src/puzzles/index.ts`.
Do not modify any file other than `src/puzzles/view.ts` and `src/styles/main.scss`.

Validation:
- Run `pnpm build` and confirm it passes.
- In the browser, five preset pills appear where the dropdown was.
- Clicking "Normal" highlights that pill and shows "1500 – 1800" in the range display.
- Clicking "Easiest" changes active pill and range display to "< 1200".
- No active pill is shown for default (all ratings) state.
- The active-filter chip from CCP-127 (if already done) updates accordingly.

Echo in final report:
Prompt ID: CCP-128
Task ID: CCP-128
```

## CCP-129 - Multi-Select Theme Filter Type and Logic

```
Prompt ID: CCP-129
Task ID: CCP-129
Source Document: puzzle filter UI audit (planning session)
Source Step: Sprint Prompt 3 — Multi-Select Theme Filter Type + Logic
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Before editing any file, re-read:
- `/Users/leftcoast/Development/PatzerPatzer/AGENTS.md`
- `/Users/leftcoast/Development/PatzerPatzer/CLAUDE.md`

Startup coordination step:
Before editing, check whether any other tool, agent, or Claude Code session is actively
touching `src/puzzles/types.ts`, `src/puzzles/imported.ts`, or `src/puzzles/index.ts`.
If so, stop and report.

---

Task:
Change the theme filter from single-select (`theme: string`) to multi-select (`themes: string[]`)
in the filter types, filter logic, IDB restore path, and wiring in `index.ts`.

This is a logic-only step. The view update for multi-select tiles is in the next prompt (CCP-130).

Implementation steps:

1. Read `src/puzzles/types.ts`, `src/puzzles/imported.ts`, and `src/puzzles/index.ts` fully.

2. In `src/puzzles/types.ts`:
   - Change `ImportedPuzzleFilters.theme: string` to `themes: string[]`.
   - No other changes to this file.

3. In `src/puzzles/imported.ts`:
   - Update `defaultImportedPuzzleFilters()` to return `themes: []` instead of `theme: ''`.
   - Update `recordMatchesFilters()`:
     - If `filters.themes.length === 0`, skip the theme filter (all themes match).
     - If `filters.themes.length > 0`, match if `record.themes` intersects any value in
       `filters.themes` (OR semantics). Use normalizeTag on both sides.
   - Update `shardMayMatch()` similarly:
     - If `filters.themes.length === 0`, skip.
     - If `filters.themes.length > 0`, the shard may match if any of `filters.themes`
       appears in `shard.themes`. If `shard.themes` is empty, the shard may still match
       (treat as unknown — do not skip it).
   - Fix all TypeScript errors caused by the renamed field.

4. In `src/puzzles/index.ts`:
   - Update `updateImportedFilters()` call sites to use `themes: string[]` instead of `theme: string`.
   - Change `onImportedTheme: value => updateImportedFilters({ theme: value })` to
     `onImportedThemes: values => updateImportedFilters({ themes: values })`.
   - Update the `renderPuzzleLibrary` call to pass `onImportedThemes` instead of `onImportedTheme`.
   - Fix all TypeScript errors caused by the renamed field.

5. IDB migration guard: In `index.ts`, in the `loadPuzzleQueryFromIdb()` restore block,
   add a migration guard:
   ```ts
   if (filters) {
     // Migrate old single-theme string to multi-select array.
     const migratedFilters = {
       ...filters,
       themes: (filters as any).themes ?? ((filters as any).theme ? [(filters as any).theme] : []),
     };
     importedQuery = { ...importedQuery, page: 0, filters: migratedFilters };
   }
   ```
   This handles stored data from before the rename without a hard IDB version bump.

Do not modify `src/puzzles/view.ts` or `src/styles/main.scss` in this prompt.
View changes for multi-select tiles are in CCP-130.

Validation:
- Run `pnpm build` and confirm it passes with no TypeScript errors.
- There should be no remaining references to `filters.theme` (singular) in the three edited files.
- Do not test in the browser yet — the view still passes a string to `onImportedTheme` until CCP-130 is done.

Echo in final report:
Prompt ID: CCP-129
Task ID: CCP-129
```

## CCP-130 - Multi-Select Theme Tile Grid View Update

```
Prompt ID: CCP-130
Task ID: CCP-130
Source Document: puzzle filter UI audit (planning session)
Source Step: Sprint Prompt 4 — Multi-Select Theme Tile Grid View Update
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Before editing any file, re-read:
- `/Users/leftcoast/Development/PatzerPatzer/AGENTS.md`
- `/Users/leftcoast/Development/PatzerPatzer/CLAUDE.md`

Startup coordination step:
Before editing, check whether any other tool, agent, or Claude Code session is actively
touching `src/puzzles/view.ts` or `src/styles/main.scss`. If so, stop and report.

---

Task:
Update the theme tile grid and its callers in `view.ts` to use `themes: string[]` (multi-select),
following the logic change made in CCP-129.

This prompt assumes CCP-129 has already been completed and the build passes.

Implementation steps:

1. Read `src/puzzles/view.ts` and `src/styles/main.scss` fully before editing.

2. In `src/puzzles/view.ts`, update `renderThemeGrid()`:
   - Change signature from:
     `(availableThemes, currentTheme: string, onTheme: (key: string) => void)`
     to:
     `(availableThemes, currentThemes: string[], onThemes: (keys: string[]) => void)`
   - A tile's `.active` class is set when `currentThemes.includes(theme.key)`.
   - Clicking a tile toggles the key in/out of `currentThemes`:
     ```ts
     const next = currentThemes.includes(theme.key)
       ? currentThemes.filter(k => k !== theme.key)
       : [...currentThemes, theme.key];
     onThemes(next);
     ```
   - No other changes to the tile rendering (same `h('button.puzzle-themes__link', ...)` shape).

3. Update `renderImportedPuzzleLibrary()` to pass the new props:
   - Change `onTheme: (value: string) => void` to `onThemes: (values: string[]) => void` in the deps type.
   - Pass `manifest?.themes ? renderThemeGrid(manifest.themes, filters.themes, deps.onThemes) : ...`
   - Fix all TypeScript errors.

4. Update `renderPuzzleLibrary()` deps type:
   - Change `onImportedTheme: (value: string) => void` to `onImportedThemes: (values: string[]) => void`.
   - Pass through to `renderImportedPuzzleLibrary`.

5. In `src/styles/main.scss`, confirm `.puzzle-themes__link.active` has a visually distinct
   multi-select-friendly style (currently it uses a border/background highlight — verify it reads
   well when multiple tiles are active simultaneously). No structural style changes needed unless
   the existing active style is insufficient.

Validation:
- Run `pnpm build` and confirm it passes with no TypeScript errors.
- In the browser:
  - Click "Fork" tile — it highlights.
  - Click "Pin" tile — both Fork and Pin highlight simultaneously.
  - Click "Fork" again — Fork deselects, Pin remains highlighted.
  - Active filter summary chips (from CCP-127, if done) update correctly.
  - Results list updates to show Fork OR Pin puzzles.

Echo in final report:
Prompt ID: CCP-130
Task ID: CCP-130
```

## CCP-131 - Custom Rating Range Number Inputs

```
Prompt ID: CCP-131
Task ID: CCP-131
Source Document: puzzle filter UI audit (planning session)
Source Step: Sprint Prompt 5 — Custom Rating Range Number Inputs
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Before editing any file, re-read:
- `/Users/leftcoast/Development/PatzerPatzer/AGENTS.md`
- `/Users/leftcoast/Development/PatzerPatzer/CLAUDE.md`

Startup coordination step:
Before editing, check whether any other tool, agent, or Claude Code session is actively
touching `src/puzzles/view.ts` or `src/styles/main.scss`. If so, stop and report.

---

Task:
Add custom min/max number inputs below the difficulty preset pills (added in CCP-128) so
the user can type an arbitrary rating range.

This prompt assumes CCP-128 has already been completed and the build passes.
`ImportedPuzzleFilters.ratingMin` and `ratingMax` are already `string` — no type changes needed.

Implementation steps:

1. Read `src/puzzles/view.ts` and `src/styles/main.scss` fully before editing.

2. In `src/puzzles/view.ts`, extend `renderDifficultyStrip()`:
   - Below the preset pill row, add a `div.puzzle-filter__range-inputs` containing:
     - Label "Min": `span.puzzle-filter__range-label` + `input.puzzle-filter__range-input`
       with `type: 'number'`, `min: 0`, `max: 3500`, `placeholder: '0'`,
       `value: filters.ratingMin`
       On `input` event: call `onRatingMin((e.target as HTMLInputElement).value)`
     - Label "Max": same pattern with `placeholder: '3500'`, value: `filters.ratingMax`,
       calling `onRatingMax`
   - Keep the existing preset pills and range display from CCP-128 above the inputs.
   - When both inputs are empty (`ratingMin === '' && ratingMax === ''`) and no preset is
     active, no special state needed — the range display already shows "All ratings".
   - When a preset pill is clicked, the inputs will update automatically on the next render
     because Snabbdom re-renders `value` from `filters.ratingMin`/`ratingMax`.

3. In `src/styles/main.scss`, add:
   - `.puzzle-filter__range-inputs`: flex row, align-items center, gap 8px, margin-top 6px
   - `.puzzle-filter__range-label`: small muted text
   - `.puzzle-filter__range-input`: number input, width ~80px, padding 2px 6px

Do not modify `src/puzzles/types.ts`, `src/puzzles/imported.ts`, or `src/puzzles/index.ts`.

Validation:
- Run `pnpm build` and confirm it passes.
- In the browser:
  - Type 1700 in Min, 1900 in Max — results update to that band.
  - Click "Normal" preset — inputs update to 1500 / 1800 (Snabbdom re-renders from state).
  - Clear Min input — filter becomes ≤1800 only.
  - Active filter chips (CCP-127 if done) show the numeric range from the inputs.

Echo in final report:
Prompt ID: CCP-131
Task ID: CCP-131
```

## CCP-132 - Theme Category Collapse Toggle

```
Prompt ID: CCP-132
Task ID: CCP-132
Source Document: puzzle filter UI audit (planning session)
Source Step: Sprint Prompt 6 — Theme Grid Visual Hierarchy: Category Collapsing
Execution Target: Claude Code

You are working in `/Users/leftcoast/Development/PatzerPatzer`.

Before editing any file, re-read:
- `/Users/leftcoast/Development/PatzerPatzer/AGENTS.md`
- `/Users/leftcoast/Development/PatzerPatzer/CLAUDE.md`

Startup coordination step:
Before editing, check whether any other tool, agent, or Claude Code session is actively
touching `src/puzzles/view.ts` or `src/styles/main.scss`. If so, stop and report.

---

Task:
Make each theme category heading a collapse/expand toggle. Default "Checkmate Patterns"
to collapsed on first load to reduce initial scroll depth.

Implementation steps:

1. Read `src/puzzles/view.ts` and `src/styles/main.scss` fully before editing.

2. In `src/puzzles/view.ts`, at module scope (not inside any function), add:
   ```ts
   const collapsedCategories = new Set<string>(['Checkmate Patterns']);
   ```
   This is module-local UI state — no prop drilling needed.

3. Update `renderThemeGrid()`:
   - For each category, render the `h2.puzzle-themes__category-label` as a
     `button.puzzle-themes__category-toggle` instead of a plain heading.
   - The button shows the category label plus a chevron: `▾` when expanded, `›` when collapsed.
   - On click: toggle the category label in `collapsedCategories` and call the `redraw` function.
   - Since `renderThemeGrid` does not currently receive a `redraw` callback, add it as a new
     optional parameter: `redraw?: () => void`. Call it inside the toggle click handler if
     provided. Update the two call sites in `renderImportedPuzzleLibrary` to pass `deps.redraw`
     (which is already available in that scope via `deps` — confirm the deps object includes it,
     or thread it through from `renderPuzzleLibrary`'s deps).
   - When a category label is in `collapsedCategories`, render the category heading only —
     do not render the `div.puzzle-themes__list` tile grid for that category.

4. In `src/styles/main.scss`, add:
   - `.puzzle-themes__category-toggle`: button reset (background none, border none, cursor pointer,
     full width, text-align left, flex row with label + arrow, same font size as the old h2 label)
   - `.puzzle-themes__category-arrow`: muted small span for the chevron

Do not modify any file outside `src/puzzles/view.ts` and `src/styles/main.scss`.

Validation:
- Run `pnpm build` and confirm it passes.
- In the browser:
  - On load, "Checkmate Patterns" is collapsed (heading visible, no tiles).
  - Click "Checkmate Patterns" heading — tiles expand.
  - Click again — tiles collapse.
  - All other categories default expanded.
  - Multi-select theme state (from CCP-130, if done) is preserved across collapse/expand cycles.

Echo in final report:
Prompt ID: CCP-132
Task ID: CCP-132
```
