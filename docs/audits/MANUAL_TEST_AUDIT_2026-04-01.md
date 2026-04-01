# Manual Test Audit — 2026-04-01

Comprehensive manual testing checklist covering all features built since the Rated Puzzle Ladder sprint (~CCP-258 onward). Organized by feature area with specific user actions and expected results.

**How to use:** Work through each section in order. Check the box when verified. Note failures inline. Use browser dev tools (Console, Application > IndexedDB, Network) where indicated.

---

## Table of Contents

1. [Sprint Status Summary](#sprint-status-summary)
2. [Core App Shell & Navigation](#1-core-app-shell--navigation)
3. [Game Import & Library](#2-game-import--library)
4. [Analysis Board](#3-analysis-board)
5. [Analysis Controls (Parity Sprint)](#4-analysis-controls-parity-sprint)
6. [Learn From Your Mistakes (Retro)](#5-learn-from-your-mistakes-retro)
7. [Eval Diff Feature (Retro Enhancement)](#6-eval-diff-feature-retro-enhancement)
8. [Puzzles — Core V1](#7-puzzles--core-v1)
9. [Rated Puzzle Ladder](#8-rated-puzzle-ladder)
10. [Rated Puzzle Stream](#9-rated-puzzle-stream)
11. [Opponents Page (formerly Openings)](#10-opponents-page-formerly-openings)
12. [Opponent Research Platform](#11-opponent-research-platform)
13. [Opponent Tool Suite](#12-opponent-tool-suite)
14. [Stats / Improvement Intelligence](#13-stats--improvement-intelligence)
15. [Study Page](#14-study-page)
16. [Engine Strength Levels](#15-engine-strength-levels)
17. [Auth & Sync](#16-auth--sync)
18. [Performance Audit Items](#17-performance-audit-items)
19. [Known Issues & Fix Prompts Needing Rework](#18-known-issues--fix-prompts-needing-rework)

---

## Sprint Status Summary

| Sprint | Status | Completion |
|--------|--------|------------|
| Puzzle V1 Phased Execution | **Completed** (historical) | 100% |
| Openings Page / Opening Tree | **Completed** (infrastructure) | 100% |
| Puzzle Mobile Usability | **Proposed only** — never started | 0% |
| Rated Puzzle Ladder & Cloud Ownership | Mostly done, cloud sync incomplete | ~90% |
| Rated Puzzle Stream | Done (with known issues) | ~95% |
| Auth & Sync | 5/6 tasks done, e2e validation missing | ~80% |
| Analysis Controls Parity | 5/7 tasks done | ~70% |
| Openings Opponent Tool Suite | Phases 1-4 ran (unreviewed), Phases 5-7 not started | ~50% |
| Opponent Research Platform | Phases 0-3 done, code-only for Phase 5 | ~40% |
| Improvement Intelligence Platform | 7/15 done, 2 partial | ~45% |
| Engine Strength Levels | All prompts ran (CCP-564–592), needs verification | ~100% code, 0% tested |
| Study Page | Phase 0-5 ran + bug fixes (CCP-519–555, 599-603) | ~60% of full plan |
| Eval Diff (Retro) | All 3 leaf prompts ran (CCP-596–598) | 100% code, 0% tested |

---

## 1. Core App Shell & Navigation

### Routes

- [ ] Navigate to `#/` — loads analysis page (default route)
- [ ] Navigate to `#/analysis` — loads analysis page
- [ ] Navigate to `#/games` — loads games library
- [ ] Navigate to `#/puzzles` — loads puzzle page
- [ ] Navigate to `#/opponents` — loads opponents page
- [ ] Navigate to `#/openings` — redirects/aliases to opponents page
- [ ] Navigate to `#/stats` — loads stats page
- [ ] Navigate to `#/study` — loads study library
- [ ] Navigate to `#/study/some-id` — loads study detail view
- [ ] Navigate to `#/admin` — loads admin page
- [ ] Navigate to `#/analysis/some-game-id` — loads analysis for specific game

### Header / Nav

- [ ] Top nav bar is visible on all routes
- [ ] All nav links work and highlight the active route
- [ ] Logo/branding is visible
- [ ] Import bar is accessible from header
- [ ] Mobile: hamburger menu works (if implemented)
- [ ] Login button visible when not authenticated
- [ ] Login button hidden when authenticated (logout in global menu)

### Dev Tools Check

- [ ] Open Console on each route — **no red errors on initial load**
- [ ] No uncaught promise rejections in console during navigation

---

## 2. Game Import & Library

### Chess.com Import

- [ ] Enter a Chess.com username in the import bar
- [ ] Select Chess.com as platform
- [ ] Click import — games begin loading
- [ ] **Import does not freeze the UI** (CR-5 performance rule)
- [ ] Progress counter appears during import (CCP-505)
- [ ] Games appear in the Games tab after import completes
- [ ] Returning to the library after navigating away does NOT show stuck "importing" dialog (CCP-509)

### Lichess Import

- [ ] Enter a Lichess username — import works same as Chess.com
- [ ] Games appear in library after import

### Filters

- [ ] Time control filter pills work (rapid, blitz, bullet, etc.)
- [ ] Date range filter works
- [ ] **Verify time control thresholds are correct** (CCP-508 fixed classification)
  - Bullet: < 3 min
  - Blitz: 3–10 min
  - Rapid: 10–30 min (verify exact cutoffs match expectations)

### Game List

- [ ] Games list renders with metadata (opponent, result, date, time control)
- [ ] **Pagination works if >50 games** (CCP-503) — not loading all at once
- [ ] Clicking a game navigates to `#/analysis/<gameId>`

### Dev Tools Check

- [ ] Application > IndexedDB: verify games are stored as individual records (not one blob)
- [ ] Console: no errors during import
- [ ] After importing 100+ games, verify no performance lag in the games list

---

## 3. Analysis Board

### Board Display

- [ ] Board renders with pieces in correct starting position
- [ ] Board resizes properly on window resize
- [ ] Board orientation can be flipped
- [ ] Piece theme and board theme applied (if customization exists)

### Move Input

- [ ] Drag-and-drop move input works
- [ ] Click-click move input works
- [ ] Pawn promotion shows promotion dialog
- [ ] Illegal moves are rejected

### Move Navigation

- [ ] Arrow keys (left/right) navigate through moves
- [ ] First move / last move navigation works
- [ ] Clicking a move in the move list jumps to that position
- [ ] Board position updates to match selected move

### Move List

- [ ] Moves display in standard notation (1. e4 e5 2. Nf3 ...)
- [ ] Variations are rendered as indented sub-lines (not flat)
- [ ] Variation promotion works (if implemented)
- [ ] Delete node works (if implemented)

### Engine / Stockfish

- [ ] Engine toggle starts/stops Stockfish
- [ ] Evaluation bar updates as position changes
- [ ] Engine lines panel shows top moves with evaluations
- [ ] **Engine UI updates are throttled** (not flickering rapidly — CR-10)
- [ ] Engine arrows appear on the board for best move(s)
- [ ] Win/draw/loss bar updates with position

### Game Review (Request Computer Analysis)

- [ ] Select a game from the library
- [ ] Click Review button
- [ ] Engine analyzes moves (progress visible)
- [ ] After review: eval bar shows evaluation at each move
- [ ] Move annotations appear (blunder, mistake, inaccuracy, etc.)
- [ ] Review data persists in IndexedDB for later viewing

### Dev Tools Check

- [ ] Console: verify engine messages are being received (no silent failures)
- [ ] Verify Stockfish WASM loads without errors
- [ ] **CCP-506**: Verify `public/stockfish/` directory does NOT contain old unused files (nn-5af11540bbfe.nnue, stockfish-nnue-16-single.*, stockfish-nnue-16.*)

---

## 4. Analysis Controls (Parity Sprint)

These controls were extracted into their own owner module (CCP-462, CCP-467).

### Control Bar

- [ ] Analysis control bar visible below or near the board
- [ ] First / Previous / Next / Last move buttons work
- [ ] Buttons have correct icons/arrows

### Hamburger Menu

- [ ] Hamburger/menu icon is visible in the control bar
- [ ] Clicking it opens an overlay menu
- [ ] Menu contains analysis-local actions (flip board, etc.)
- [ ] Menu closes on outside click or Escape

### Explorer Button

- [ ] Explorer button is present in the controls
- [ ] Clicking it toggles the opening explorer (if wired)

### Legacy Cleanup

- [ ] **No duplicate controls** in the header that were supposed to be migrated to analysis controls
- [ ] The old `analyse__actions` render path is removed (CCP-467)

### Dev Tools Check

- [ ] Console: no errors when toggling analysis controls
- [ ] No orphaned DOM elements from old render path

---

## 5. Learn From Your Mistakes (Retro)

### Session Start

- [ ] After reviewing a game, "Learn From Your Mistakes" is accessible
- [ ] Starting a retro session loads candidate positions (mistakes/blunders)
- [ ] Board shows the first candidate position

### Solving Flow

- [ ] The correct move is accepted and shows success feedback
- [ ] An incorrect move shows failure feedback
- [ ] After failing, the solution is revealed
- [ ] **Feedback is NOT swallowed by offTrack state** (CCP-593 fix)
  - Specifically: after making a wrong move and seeing "offTrack", the next correct move attempt should still show feedback

### Navigation

- [ ] Can advance through all candidate positions
- [ ] Session ends when all candidates are reviewed
- [ ] Session summary/completion is shown

### Book-Aware Cancellation

- [ ] If retro position is in opening book, it should be skipped or handled gracefully (CCP-465)

### Dev Tools Check

- [ ] Console: verify retro candidates are being loaded with eval data
- [ ] No errors during retro session transitions

---

## 6. Eval Diff Feature (Retro Enhancement)

These prompts just ran — CCP-596, CCP-597, CCP-598.

### Eval Diff Display

- [ ] During retro exercises, an eval diff value is shown (e.g., "-0.8" or "Win chance: -12%")
- [ ] Eval diff appears in win feedback panel
- [ ] Eval diff appears in fail feedback panel
- [ ] Eval diff appears in solution reveal panel
- [ ] **Placeholder styling** — values display but may not be styled yet (CCP-598 was display-only)

### Eval Diff Correctness

- [ ] For a blunder: eval diff should be large and negative (from the player's perspective)
- [ ] For a slight inaccuracy: eval diff should be small

### Dev Tools Check

- [ ] Console: verify `evalDiff` field is populated on RetroCandidate objects
- [ ] If eval data is missing for a candidate, check console for background engine eval requests (CCP-597)

---

## 7. Puzzles — Core V1

### Puzzle Library

- [ ] `#/puzzles` route loads the puzzle page
- [ ] Puzzle sidebar shows available puzzle sources/collections
- [ ] Can browse puzzle library

### Puzzle Solving

- [ ] Click a puzzle to start solving
- [ ] Board shows puzzle position
- [ ] Making the correct move advances the puzzle
- [ ] Making the wrong move shows failure
- [ ] Puzzle completes when all moves are found
- [ ] Result feedback (solved/failed) is shown

### Puzzle Import / Authoring

- [ ] Can save puzzles from game analysis (if wired)
- [ ] Saved puzzles appear in the user's library

### Dev Tools Check

- [ ] Application > IndexedDB: puzzles are stored as individual records
- [ ] Console: no errors during puzzle solving

---

## 8. Rated Puzzle Ladder

This is a major feature (CCP-258–306). Tests the full Glicko-2 rating system.

### Session Types

- [ ] **Rated session**: start a rated puzzle session
  - Rating is displayed before starting
  - Puzzles are near user's rating level
  - After solving, rating delta is shown (e.g., "+8" or "-12")
  - Rating updates after each puzzle
- [ ] **Casual session**: start a casual puzzle session
  - No rating change
  - "Casual" indicator visible

### Rating System

- [ ] Initial rating is set (default ~1500 or whatever the Glicko-2 default is)
- [ ] Rating goes up after solving a puzzle
- [ ] Rating goes down after failing a puzzle
- [ ] Rating change magnitude makes sense (bigger swings for upsets)

### Puzzle Selection / Eligibility

- [ ] Puzzles served are near the user's current rating (within reasonable band)
- [ ] Already-solved puzzles are not re-served in the same session
- [ ] Difficulty offset logic works (puzzles aren't all trivially easy or impossibly hard)

### Persistence

- [ ] Close the app and reopen — rated puzzle rating is preserved
- [ ] Puzzle attempt history is preserved in IndexedDB

### Dev Tools Check

- [ ] Application > IndexedDB: check `puzzleAttempts` or similar store for attempt records
- [ ] Application > IndexedDB: check for user rating record
- [ ] Console: verify Glicko-2 calculations are running (no NaN or Infinity values)

---

## 9. Rated Puzzle Stream

Auto-advancing puzzle stream (CCP-308–321).

### Stream Entry

- [ ] In the puzzle sidebar, there's a "Rated Stream" or equivalent entry point
- [ ] Clicking it starts an auto-advancing rated puzzle session

### Auto-Advance

- [ ] After solving a puzzle, the next puzzle loads automatically
- [ ] After failing a puzzle, the next puzzle loads after brief feedback
- [ ] Stream continues indefinitely (doesn't stop after N puzzles)

### Shard Loader

- [ ] If IDB has no matching puzzles for the rating band, shard loader fetches more
- [ ] **Dev Tools > Network**: verify shard files are loaded on demand, not all at once
- [ ] Shard loading doesn't interrupt the solving flow

### Dev Tools Check

- [ ] Console: no errors during stream transitions
- [ ] Verify puzzle selection doesn't repeat recently-seen puzzles

---

## 10. Opponents Page (formerly Openings)

### Route & Naming

- [ ] `#/opponents` loads the page
- [ ] `#/openings` also loads the same page (alias)
- [ ] Page title says "Opponents" (not "Openings") — CCP renamed this
- [ ] Nav link says "Opponents"

### Opponent Selection

- [ ] Can select an opponent from imported games
- [ ] Selecting an opponent loads their opening data

### Opening Tree

- [ ] Opening tree renders with played lines
- [ ] Lines show frequency percentages
- [ ] Can click into deeper positions
- [ ] Board updates when navigating the tree
- [ ] Transpositions are handled correctly

### Engine in Opponents Page

- [ ] Engine section is positioned correctly (CCP-512 fixed this)
- [ ] Engine analysis works on selected positions
- [ ] Engine section does not overlap or misalign with other content

### Color Toggle

- [ ] White/Black toggle buttons work
- [ ] **When active, buttons show the opponent's username** (CCP-513)
- [ ] Switching colors reloads the tree from that perspective

### Dev Tools Check

- [ ] Console: no errors when switching between opponents
- [ ] Console: no errors when navigating deep into the opening tree

---

## 11. Opponent Research Platform

Features from the Opponent Research Platform sprint (Phases 0-3 done).

### Deviation Detection (CCP-468)

- [ ] In the opening tree, deviation markers appear on moves where the opponent diverges from book/expected
- [ ] Deviation markers render **in the move rows** (not missing — this was a bug fix)

### Termination Profile

- [ ] Opponent's game termination stats are visible (resignation %, timeout %, checkmate %)
- [ ] Data looks reasonable for the selected opponent

### Rating Sparkline

- [ ] A small rating chart/sparkline is visible for the opponent
- [ ] Shows rating trend over time

### Traps Detection (Code only — Phase 5)

- [ ] `src/openings/traps.ts` exists but may not have UI yet — note if any trap-related UI appears

---

## 12. Opponent Tool Suite

Left-rail tool switcher (CCP-324–378, Phases 1-4 ran).

### Tool Shell

- [ ] Opponents page has a persistent left rail / tool selector
- [ ] Tools listed: Repertoire, Prep Report, Style, Practice Against Them (some may be stubs)

### Repertoire Tool

- [ ] Clicking "Repertoire" shows the opening tree / repertoire view
- [ ] Can browse lines, see stats

### Prep Report Tool

- [ ] Clicking "Prep Report" shows a report view
- [ ] **Recency toggle works** (CCP-514 fixed dead toggle)
- [ ] Report content renders (even if minimal)

### Style Tool

- [ ] Clicking "Style" shows style analysis (may be a stub)

### Practice Against Them

- [ ] Clicking "Practice Against Them" enters practice mode
- [ ] Board is interactive for the user's color
- [ ] **Engine plays opponent moves** — this depends on Engine Strength Levels sprint
- [ ] If engine is not yet wired: banner shows "Engine has taken over" and may be stubbed
- [ ] Practice session state machine works (confidence tracking, etc.)

### Analytics Foundation

- [ ] Shared analytics data is computed from imported games
- [ ] No obvious data errors (NaN, undefined) in opponent statistics

### Dev Tools Check

- [ ] Console: no errors when switching between tools in the left rail
- [ ] Console: no errors in Prep Report rendering

---

## 13. Stats / Improvement Intelligence

Stats page with weakness diagnosis (Improvement Intelligence Platform sprint).

### Stats Dashboard

- [ ] `#/stats` loads the stats page
- [ ] Dashboard renders with some content (may be minimal)

### GameSummary Data

- [ ] After reviewing games, GameSummary records are created
- [ ] **Dev Tools > IndexedDB**: verify `gameSummary` or similar store has records
- [ ] Clock data is imported from games (CCP task 1 of IIP)

### Weakness Engine

- [ ] Some weakness/pattern data is displayed (if UI is wired)
- [ ] At minimum, the weakness aggregation engine runs without errors

### Charts

- [ ] If any SVG charts render (rating trend, etc.), verify they show real data not placeholders

### Dev Tools Check

- [ ] Console: no errors on `#/stats` route
- [ ] Console: verify no "undefined" or "NaN" in stats calculations

---

## 14. Study Page

Major new feature (CCP-519–555, with bug fixes CCP-599–603).

### Study Library (`#/study`)

- [ ] Route loads without errors
- [ ] Library view renders (may be empty initially)
- [ ] "Create Study" or equivalent action is available
- [ ] Can create a new study
- [ ] Study appears in the library list
- [ ] Due-count banner appears if there are items due for practice (CCP-555)
- [ ] "Start Review" button works for items with due positions
- [ ] "Learn New Lines" section appears for unstudied items

### Study Detail (`#/study/:id`)

- [ ] Clicking a study opens the detail/annotation view
- [ ] Board renders with the study position
- [ ] Move list shows the study's moves

### Navigation Between Studies

- [ ] **Navigating from one study to another shows the correct study** (CCP-601 fix)
- [ ] Back to library navigation works

### Annotation — Comments

- [ ] Can add text comments to moves
- [ ] Comments persist (visible after navigating away and back)

### Annotation — Glyphs/NAGs (CCP-535)

- [ ] Glyph toolbar is visible
- [ ] Can add !, ?, !!, ??, !?, ?! to moves
- [ ] Keyboard shortcuts work for glyphs
- [ ] Glyphs display on moves in the move list
- [ ] **Glyph quick-select CSS is positioned correctly** (CCP-602 fix)

### Annotation — Cancel/Discard

- [ ] **Clicking Cancel on annotation panel discards changes** (CCP-600 fix — previously Cancel was saving)
- [ ] Confirm this by: adding a comment, clicking Cancel, verifying the comment is NOT saved

### Variations (CCP-536)

- [ ] Playing a non-mainline move creates a variation branch
- [ ] Variations display as indented sub-lines
- [ ] Can promote a variation to mainline (context menu)
- [ ] Can delete a variation (context menu)

### Fold/Expand (CCP-537)

- [ ] Variation branch points show a fold/expand toggle (triangle icon)
- [ ] Clicking fold hides the variation
- [ ] Clicking expand shows it again

### Arrows/Shapes (CCP-538)

- [ ] Can draw arrows on the board (right-click drag)
- [ ] Can highlight squares (right-click)
- [ ] Arrows/shapes persist on the tree node
- [ ] Navigating away and back to the same move shows saved arrows/shapes

### Engine in Study (CCP-539)

- [ ] Engine toggle works in study detail view
- [ ] Stockfish evaluates the current position
- [ ] Compact eval display is shown

### Position Bookmarks (CCP-540)

- [ ] Can bookmark a move/position
- [ ] Bookmarked moves are visually highlighted
- [ ] Can filter to show only bookmarked positions

### Auto-Save & PGN (CCP-541)

- [ ] Changes auto-save after ~500ms of inactivity
- [ ] **PGN data is NOT lost on save** (CCP-599 fix)
- [ ] Copy PGN button works — paste into a text editor and verify valid PGN
- [ ] Download PGN button works — file contains valid PGN with comments, NAGs, shapes
- [ ] PGN preserves: comments, NAGs/glyphs, arrows/shapes as `[%cal]`/`[%csl]`

### Dev Tools Check

- [ ] Application > IndexedDB: verify `studies` store exists with study records
- [ ] Application > IndexedDB: verify study records contain tree data with comments/glyphs
- [ ] Console: no errors during study creation, editing, or navigation
- [ ] Console: verify auto-save triggers (look for IDB write operations)

---

### Study — Repetition Practice (CCP-543–555)

### Practice Line Extraction (CCP-547)

- [ ] "Practice this line" button appears in study detail
- [ ] Clicking it shows a color selector (play as White or Black)
- [ ] Starting practice extracts the mainline as a trainable sequence

### Drill Session (CCP-545, CCP-549, CCP-550)

- [ ] Drill session starts with the board in the starting position of the line
- [ ] Opponent's moves are auto-played
- [ ] User must play the correct move
- [ ] **Correct move**: green flash / success feedback, advances
- [ ] **Wrong move**: red flash / failure feedback, shows correct move
- [ ] Move counter / progress bar updates
- [ ] Sequence label (opening name or study title) is visible

### Drill Grading (CCP-544)

- [ ] Exact SAN match is required for correct
- [ ] Wrong moves are clearly marked as incorrect

### Session Summary (CCP-551)

- [ ] After completing all positions, summary screen appears
- [ ] Shows: accuracy %, positions quizzed, duration
- [ ] "Practice Again" button restarts the drill
- [ ] "Back to Library" returns to study library

### Spaced Repetition (CCP-543, CCP-554)

- [ ] Drill results persist to IndexedDB (PositionProgress records)
- [ ] Successfully drilled positions get a longer interval
- [ ] Failed positions get a shorter interval
- [ ] Due dates are calculated and stored
- [ ] **Dev Tools > IndexedDB**: verify `positionProgress` or similar store has records after drilling

### Review Session (CCP-546, CCP-555)

- [ ] If positions are due for review, "Start Review" in library loads only due items
- [ ] Due count badge shows correct number
- [ ] Review session only includes due positions, not all positions

---

## 15. Engine Strength Levels

Entire sprint ran (CCP-564–592). This is the newest code and completely untested.

### Types & Config (CCP-567)

- [ ] **Dev Tools > Console**: run `import('/src/engine/types.js')` or check that the module exists
- [ ] Verify 8 strength levels are defined (Beginner through Full Strength)

### UCI Integration (CCP-568)

- [ ] Engine protocol has `setPlayStrength()`, `setAnalysisMode()`, `goPlay()` methods
- [ ] **Dev Tools > Console**: no errors related to engine protocol on page load

### Mode Switching (CCP-573)

- [ ] Engine ctrl has `engineMode` state (analysis vs play)
- [ ] `enterPlayMode()` and `exitPlayMode()` exist
- [ ] Switching to play mode does NOT break analysis mode
  - Test: use analysis, then trigger play mode (if UI exists), then return to analysis — verify analysis still works

### Play Move Service (CCP-579, CCP-580)

- [ ] `requestPlayMove()` exists and can be called
- [ ] `cancelPlayMove()` exists
- [ ] **Dev Tools > Console test**: if you can access the engine ctrl, try:
  ```js
  // This is a rough test — adjust based on actual API
  engineCtrl.enterPlayMode(3) // level 3
  engineCtrl.requestPlayMove(currentFen, callback)
  ```
- [ ] Verify a bestmove is returned (not an analysis eval)
- [ ] `playMoveWithDelay()` adds variable delay

### Strength Persistence (CCP-574)

- [ ] **Dev Tools > Application > Local Storage**: check for `patzer.playStrengthLevel`
- [ ] After selecting a strength level, refresh the page — level is preserved

### Strength Selector UI (CCP-589, CCP-590, CCP-591)

- [ ] Strength selector widget renders in the practice setup panel
- [ ] Shows 8 levels with labels (Beginner through Full Strength)
- [ ] Selecting a level updates the state
- [ ] Styling looks reasonable (CCP-591)

### Practice Integration (CCP-583–586)

- [ ] In Opponents > Practice Against Them:
  - Strength level selector is available before/during practice
  - Starting practice at a specific strength level works
  - Engine plays moves at the selected strength (weaker levels should make noticeably worse moves)
  - Banner shows current strength level

### Dev Tools Check

- [ ] Console: no TypeScript runtime errors from engine/types.ts or engine/ctrl.ts
- [ ] Console: no errors when entering/exiting play mode
- [ ] Network: verify only ONE Stockfish WASM instance is loaded (not two)

---

## 16. Auth & Sync

### Login (Lichess OAuth)

- [ ] Login button triggers Lichess OAuth flow
- [ ] After authenticating, user is logged in
- [ ] Logout is in the global menu (not a separate button)
- [ ] After logout, login button reappears

### Server DB (CCP-472 — migrated to SQLite)

- [ ] **Server-side**: verify `server/data/` contains a SQLite database file
- [ ] Server starts without DB errors

### Sync — Push

- [ ] After logging in, can push local data to server
- [ ] Games, puzzle attempts, and analysis data sync up
- [ ] **Sync is differential** — not dumping everything (CR-8)

### Sync — Pull

- [ ] Can pull data from server to local IndexedDB
- [ ] **Pulled data writes correctly to IndexedDB** (CCP-466 fixed DB name mismatch)
- [ ] Pulled puzzle attempts appear in IndexedDB

### Dev Tools Check

- [ ] Network: verify sync API calls are batched (not one per record — CR-9)
- [ ] Application > IndexedDB: after pull, verify records exist
- [ ] Console: no errors during sync push/pull
- [ ] **Note**: Full bidirectional merge validation (Task 6) has NOT been done — expect edge cases

---

## 17. Performance Audit Items

These were built in CCP-503–507.

### Game List Pagination (CCP-503)

- [ ] With 100+ games, the games list paginates (not all loaded at once)
- [ ] Can navigate between pages
- [ ] Performance is smooth

### Skeleton UI (CCP-504)

- [ ] When navigating to a route, a skeleton/loading state appears briefly before content
- [ ] No blank white flash

### Import Progress Counter (CCP-505)

- [ ] During game import, a progress counter shows (e.g., "47/120 games imported")

### Stockfish Directory Cleanup (CCP-506)

- [ ] `public/stockfish/` does NOT contain: `nn-5af11540bbfe.nnue`, `stockfish-nnue-16-single.js`, `stockfish-nnue-16-single.wasm`, `stockfish-nnue-16.js`, `stockfish-nnue-16.wasm`
- [ ] Verify via `ls public/stockfish/` or dev tools

### General Performance

- [ ] With 500+ games in IDB, the app does not lag on load
- [ ] Engine eval updates are visually smooth (not flickering every frame)
- [ ] No obvious memory leaks (dev tools > Memory, take snapshot, use app for 5 min, take another snapshot)

---

## 18. Known Issues & Fix Prompts Needing Rework

These items have been flagged but not fully resolved:

### CCP-470 / CCP-470-F1 — Bulk-Save Puzzle Flow

- **Issue**: First-attempt outcomes are not preserved correctly during bulk puzzle save
- **Status**: Fix prompt CCP-470-F1 ran but marked "needs rework"
- [ ] Test: bulk-save puzzles from game analysis, verify first-attempt data is preserved on each puzzle record

### CCP-471 / CCP-471-F1 — findRatedPuzzleFromShards location

- **Issue**: Originally requested to move function to puzzleDb.ts, but it architecturally belongs in ctrl.ts
- **Status**: CCP-471-F1 marked "needs rework" — but the error note says the function intentionally stays in ctrl.ts
- [ ] Verify `findRatedPuzzleFromShards` works correctly from its current location in ctrl.ts

### Stuck `queued-started` Prompts

14 prompts are in `queued-started` state but most were reviewed and passed. They may need their registry state updated:
- CCP-462 through CCP-473 (reviewed, 9 passed, 2 had issues)
- CCP-564, CCP-565, CCP-566 (engine strength — started)

---

## Testing Order Recommendation

For most efficient testing, follow this order:

1. **Core Shell & Navigation** (Section 1) — establishes the app works at all
2. **Game Import** (Section 2) — you need games for everything else
3. **Analysis Board** (Section 3) — core functionality
4. **Analysis Controls** (Section 4) — quick visual check
5. **Puzzles** (Sections 7, 8, 9) — core puzzle flow, then rated, then stream
6. **Opponents** (Sections 10, 11, 12) — opening tree, research, tools
7. **Study Page** (Section 14) — biggest new feature, most untested
8. **Learn From Mistakes + Eval Diff** (Sections 5, 6) — requires reviewed games
9. **Engine Strength** (Section 15) — newest code, test via console + Practice
10. **Stats** (Section 13) — requires game data
11. **Auth & Sync** (Section 16) — requires server running
12. **Performance** (Section 17) — cross-cutting, verify at end

---

## Notes for the Tester

- **Build first**: Run `npm run build` and `npx tsc --noEmit` before testing to catch compile errors
- **Start fresh IndexedDB**: For clean testing, clear IndexedDB in dev tools before starting (Application > Storage > Clear site data). Then re-import games.
- **Console is your friend**: Keep dev tools Console open throughout. Many issues will show as runtime errors even if the UI looks okay.
- **Mobile viewport**: After desktop testing, shrink the browser to mobile width and repeat key flows (especially puzzles, analysis, opponents, study)
- **Engine issues**: If Stockfish doesn't load, check the Network tab for 404s on .wasm files
