# Claude Prompt Log

Use this file to track Claude Code prompts from creation through review.

## How to use it

- Add one entry per prompt as soon as the prompt is created.
- Give each prompt a stable identifier in the form `CCP-###`.
- If a prompt is a follow-up fix for a reviewed prompt, keep the same root task id and use a prompt id modifier:
  - `CCP-013-F1`
  - `CCP-013-F2`
- Prompts should also live in `/Users/leftcoast/Development/PatzerPatzer/docs/prompts/CLAUDE_PROMPT_QUEUE.md` until they have actually been run and then reviewed.
- On prompt creation, add an unchecked entry here immediately.
- On prompt creation, also add the prompt id and short task title to the top-level checklist index as `- [ ] CCP-### - Short Task Title`.
- On review, update the same entry here rather than creating a second one.
- On review, also flip the matching top-level checklist index item from `- [ ]` to `- [x]`.
- Check the box as soon as the implementation has been reviewed, regardless of whether the review passed cleanly.
- After review, add a short review outcome label such as `passed`, `passed with notes`, `issues found`, or `needs rework`.
- If review finds issues, keep the entry checked and record a brief issue summary under the same entry.
- If the prompt was reviewed but the exact prompt text was not found in `CLAUDE_PROMPT_QUEUE.md`, note that explicitly.

## Template

## Index Template

Keep a top-level checklist index near the top of this file:

```
- [ ] CCP-### - Short Task Title
```

The index is a compact scan list of prompt ids plus short task titles.
It should not include review notes.
It should stay in sync with the detailed entry below.

## CCP-### - Short Task Title

```
- [x] Reviewed
  - ID: `CCP-###`
  - Task ID: `CCP-###`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/...`
  - Source step: `Priority X, Item Y` or equivalent section label
  - Task: short task title
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## Review rules

- `- [x] Reviewed` means the task was reviewed.
- `- [ ] Reviewed` means the prompt has been created and logged, but has not been reviewed yet.
- `ID` is the unique prompt instance id.
- `Task ID` is the root task family id.
- For a normal prompt, `ID` and `Task ID` are the same.
- For a follow-up fix prompt, `ID` uses the next `-F#` suffix and `Task ID` stays on the root family id.
- `Parent prompt ID` should be `none` for a root prompt and the reviewed prompt id for a follow-up fix prompt.
- `Batch prompt IDs` should be `none` for normal prompts and should list the child prompt ids for a manager/batch-runner prompt.
- Use `Review outcome: passed` when the review found no issues.
- Use `Review outcome: passed with notes` when the change is acceptable but has minor caveats worth recording.
- Use `Review outcome: issues found` when the review found concrete problems.
- Use `Review outcome: needs rework` when the implementation is not ready to accept as-is.
- Use `Claude used: yes` once the prompt id has been reviewed against actual Claude Code work.
- Use `Claude used: no` only for reviewed entries where Claude usage could not be confirmed.
- If review finds issues, replace `Review issues: none` with a short issue list or summary on the same entry.
- Keep the entry compact. This log is for tracking prompt provenance and review state, not for full review writeups.

## Prompt Index

- [ ] CCP-174 - Puzzle V1 Phase 5 Batch Manager
- [ ] CCP-169 - Puzzle V1 Phase 4 Batch Manager
- [ ] CCP-164 - Puzzle V1 Phase 3 Batch Manager
- [ ] CCP-159 - Puzzle V1 Phase 2 Batch Manager
- [x] CCP-154 - Puzzle V1 Phase 1 Batch Manager
- [ ] CCP-173 - Add Future Hooks For Rated Puzzle Mode
- [ ] CCP-172 - Improve Imported Puzzle Library Filtering And Loading Scale
- [ ] CCP-171 - Add Minimal Due-Again Metadata And Filters
- [ ] CCP-170 - Add Retry-Failed-Earlier Queue
- [ ] CCP-168 - Add Flat Collections, Notes, Tags, And Favorites
- [ ] CCP-167 - Add Move-List Create-Puzzle Flow
- [ ] CCP-166 - Bulk-Save Missed Moments After Review
- [ ] CCP-165 - Save Learn From Your Mistakes Moments Into User Library
- [ ] CCP-163 - Render Eval-Delta Feedback For Non-Best Moves
- [ ] CCP-162 - Log Assisted-Solve And Reveal Reasons
- [ ] CCP-161 - Add PuzzleMoveQuality Evaluation Layer
- [ ] CCP-160 - Add Puzzle-Mode Engine Runtime Owner
- [ ] CCP-158 - Render Puzzle Result States And Navigation
- [ ] CCP-157 - Persist Puzzle Attempt Results
- [ ] CCP-156 - Validate Strict Solution Moves And Auto-Reply
- [ ] CCP-155 - Add Puzzle Round Controller
- [x] CCP-153 - Add Puzzle Board Layout Shell
- [x] CCP-152 - Open Minimal Puzzle Round From Canonical Puzzle Definition
- [x] CCP-151 - Render Top-Level Puzzle Source Navigator
- [x] CCP-150 - Add Puzzle Library Route Owner
- [x] CCP-149 - Review Puzzle V1 Planning Docs
- [x] CCP-148 - Review Puzzle Phase 0 Prompts Before Execution
- [ ] CCP-143 - Add Board Consumer Move Hook
- [ ] CCP-144 - Move Retrospection Solve Logic Out Of Board Core
- [ ] CCP-145 - Add Canonical Puzzle Domain Types
- [ ] CCP-146 - Add Puzzle Library Persistence Owner
- [ ] CCP-147 - Add Puzzle Source Adapter Seams
- [x] CCP-134 - Add Mistake Detection Config Owner
- [x] CCP-135 - Add Mistake Detection Menu Modal
- [x] CCP-136 - Wire Mistake Detection Config Into Retrospection
- [x] CCP-137 - Apply Mistake Detection Changes To The Active Analysis Session
- [x] CCP-138 - Add Learn-Moment Reason Metadata
- [x] CCP-139 - Show Learn-Moment Reason In Success UI
- [x] CCP-140 - Add Collapse Family To Mistake Detection
- [x] CCP-141 - Add Defensive Resource Family To Mistake Detection
- [x] CCP-142 - Add Punish-The-Blunder Family To Mistake Detection
- [x] CCP-083 - Establish Puzzle Route Ownership
- [x] CCP-084 - Add Puzzle Round Model
- [x] CCP-085 - Render Saved Puzzle Library
- [x] CCP-086 - Add Puzzle Round Controller
- [x] CCP-087 - Validate Puzzle Moves And Auto-Reply
- [x] CCP-088 - Add Puzzle Feedback And Round Controls
- [x] CCP-089 - Add Puzzle Side Panel Metadata
- [x] CCP-090 - Persist Local Puzzle Session
- [x] CCP-091 - Tighten Review-To-Puzzle Integration
- [x] CCP-092 - Cache Board Move Destinations
- [x] CCP-093 - Narrow Board Auto-Shape Updates
- [x] CCP-094 - Remove Board Overlay Fade Animation
- [x] CCP-133 - Puzzle Filter Redesign Sprint Manager (CCP-127–132)
- [x] CCP-132 - Theme Category Collapse Toggle
- [x] CCP-131 - Custom Rating Range Number Inputs
- [x] CCP-130 - Multi-Select Theme Tile Grid View Update
- [x] CCP-129 - Multi-Select Theme Filter Type and Logic
- [x] CCP-128 - Difficulty Preset Pills with Range Display
- [x] CCP-127 - Active Filter Summary Bar
- [x] CCP-126 - Background Bulk Review Sprint Manager (CCP-120–125)
- [x] CCP-125 - Bulk Review Settings Submenu in Header
- [x] CCP-124 - Per-Game Progress Display in Games List
- [x] CCP-123 - Route-Change Resilience in main.ts
- [x] CCP-122 - Per-Game Analysis Loop in reviewQueue.ts
- [x] CCP-121 - Background Review Engine Module Skeleton
- [x] CCP-120 - Configurable StockfishProtocol Engine Options
- [x] CCP-119 - Phase 2 Puzzle Filter Persistence Manager (CCP-116–117)
- [x] CCP-118 - Phase 1 Puzzle Training Queue Manager (CCP-113–115)
- [x] CCP-117 - Show Active Training Context in Puzzle Round Side Panel
- [x] CCP-116 - Persist Filter Query State to IDB
- [x] CCP-115 - Add "Start Training" Entry Point to Puzzle Library
- [x] CCP-114 - Wire Training Queue into Continue-Training Navigation
- [x] CCP-113 - Add Training Queue State to Imported Puzzle Module
- [x] CCP-112 - Phase 2 Puzzle Sprint Manager (CCP-107–110)
- [x] CCP-111 - Phase 1 Puzzle Sprint Manager (CCP-103–106)
- [x] CCP-110 - Add Result History Dots
- [x] CCP-109 - Add Keyboard Navigation Shortcuts
- [x] CCP-108 - Add Move Navigation Controls
- [x] CCP-107 - Add Puzzle-Specific SCSS
- [x] CCP-106 - Add After-Puzzle Completion Panel
- [x] CCP-105 - Add Visual Feedback Icons
- [x] CCP-104 - Add Opponent Move Animation Delay
- [x] CCP-103 - Fix Wrong-Move Result State
- [x] CCP-102 - Puzzle Page Lichess Audit And Sprint Plan
- [x] CCP-095 - Establish Lichess Dataset Workspace
- [x] CCP-096 - Add Lichess Puzzle Download Script
- [x] CCP-097 - Build Lichess Puzzle Shard Pipeline
- [x] CCP-098 - Add Imported Puzzle Loader Seam
- [x] CCP-099 - Add Imported Puzzle Source Switch
- [x] CCP-100 - Open Imported Lichess Puzzle Rounds
- [x] CCP-101 - Add Imported Puzzle Filters And Paging
- [x] CCP-080 - Throttle Live Engine UI Refresh
- [x] CCP-081 - Split And Debounce Nav-State Persistence
- [x] CCP-082 - Reduce Default Live Engine Workload
- [x] CCP-079 - Reduce Board Review Glyph Scale To 20 Percent
- [x] CCP-066-F1 - Add Underboard Games Search Bar
- [x] CCP-073 - Clear Board And Ceval Typecheck Slice
- [x] CCP-074 - Clear Import And Shell Typecheck Slice
- [x] CCP-075 - Make Board Resize Handle Safari-Reliable
- [x] CCP-076 - Make Book-Aware Retrospection Cancellation Live
- [x] CCP-077 - Finish Eval Graph Hover And Scrub Behavior
- [x] CCP-078 - Fix Move-List Context Menu Positioning
- [x] CCP-070 - Add Lichess Review Glyph SVG Layer
- [x] CCP-071 - Render Review Glyphs On The Board
- [x] CCP-072 - Add Review Glyph Board Toggle
- [x] CCP-067-F1 - Fix Eval Graph Fill To Rise From Bottom
- [x] CCP-044-F4 - Fade In Engine Arrow Labels And Arrows
- [x] CCP-069 - Refine Eval Graph Fill And Resize Handle
- [x] CCP-065 - Add Toggle For Review Label Visibility
- [x] CCP-015-F3 - Restore Per-Candidate Show Engine Toggle In Mistakes Mode
- [x] CCP-021-F1 - Fix Retrospection Tools Render Corruption
- [x] CCP-015-F2 - Per-Candidate Engine Guidance Toggle In Retrospection
- [x] CCP-017 - Remove Clear Variations Button
- [x] CCP-013 - Retrospection Lifecycle Wiring
- [x] CCP-013-F1 - Finish Retrospection Lifecycle Wiring
- [x] CCP-014-F1 - Hide Find Puzzles Button During Mistakes Rollout
- [x] CCP-012 - Retrospection Controller Skeleton
- [x] CCP-016 - Use Persisted Review Labels In UI
- [x] CCP-015-F1 - Hide Engine Guidance During Retrospection
- [x] CCP-018 - Extract Retrospection UI Ownership
- [x] CCP-019 - Complete Retrospection Lifecycle Handling
- [x] CCP-020 - Move Retrospection UI Into Analysis Tools
- [x] CCP-021 - Suppress Conflicting Analysis UI During Retrospection
- [x] CCP-022 - Persist Retrospection Best-Line Context
- [x] CCP-023 - Add Book-Aware Retrospection Cancellation
- [x] CCP-024 - Add Near-Best Acceptance Parity
- [x] CCP-025 - Add Move-List Context Menu Infrastructure
- [x] CCP-026 - Add Copy Mainline And Variation PGN Actions
- [x] CCP-027 - Add Delete-From-Here Variation Action
- [x] CCP-028 - Add Variation Promotion And Make-Mainline Actions
- [x] CCP-015 - Minimal Retrospection Solve Loop
- [x] CCP-014 - Enter Retrospection For Current Game
- [x] CCP-011 - Retrospection Candidate Builder
- [x] CCP-010 - Fix Sparse Move-List Row Spacing
- [x] CCP-009 - Sticky Move-List Action Strip
- [x] CCP-008 - Move Clear Variations Into Bottom Action Strip
- [x] CCP-007 - Small Review-State Messaging Improvement
- [x] CCP-006 - Honest Minimum Analysis-Game Route Surface
- [x] CCP-005 - Clear Side Variations And Restore Mainline Order
- [x] CCP-004 - Variation Remove Button Visual Alignment
- [x] CCP-003 - First Move-List Variation Removal Affordance
- [x] CCP-030 - First Safe Typecheck Error Slice
- [x] CCP-031 - Fix Board Wheel Navigation Selector
- [x] CCP-032 - Replace Stop Boolean With Search Tokens
- [x] CCP-033 - Fix Imported-Game Orientation Propagation
- [x] CCP-006-F1 - Fix Analysis-Game Empty-Library Loading State
- [x] CCP-034 - Improve Eval Graph Hover And Scrub
- [x] CCP-035 - Fix Engine Arrowhead Rendering
- [x] CCP-036 - Implement Honest Minimum Puzzles Route
- [x] CCP-037 - Fetch Multi-Month Chess.com Archives
- [x] CCP-038 - Replace Header Game Review Stub
- [x] CCP-040 - Eval Graph Display Refresh
- [x] CCP-041 - Review Annotation Color Parity
- [x] CCP-042 - Move Review Button Beside Navigation Controls
- [x] CCP-043 - Replace Player-Strip Result Markers
- [x] CCP-044 - Add Eval Labels To Engine Arrows
- [x] CCP-045 - Prevent Duplicate Reimports
- [x] CCP-046 - Import Only New Games Since Last Import
- [x] CCP-047 - Header Platform Toggle UX
- [x] CCP-056 - Add Main-Menu Toggle For Board Wheel Navigation
- [x] CCP-057 - Fix Live Engine Stall During Move Navigation
- [x] CCP-048 - Highlight Massive Engine Improvements
- [x] CCP-049 - Show KO Mate Notation
- [x] CCP-050 - Winner-Color Eval Bar On Mate
- [x] CCP-051 - KO Overlay On Losing King For M1
- [x] CCP-052 - Hide Arrows During Game Review
- [x] CCP-053 - Toggle Review Dots To User Perspective Only
- [x] CCP-055 - Mate Display KO Polish
- [x] CCP-058 - Fix White KO Eval-Graph Direction
- [x] CCP-059 - Add Mobile Analysis Stack Layout
- [x] CCP-060 - Hide Mobile Analysis Chrome
- [x] CCP-061 - Make Mobile Controls Board-Adjacent
- [x] CCP-062 - Make Mobile Tools Stack Readable
- [x] CCP-063 - Make Underboard Secondary On Mobile
- [x] CCP-064 - Add One Minimal Mobile Touch Improvement
- [x] CCP-043-F1 - Winner And Loser Player-Strip Boxes
- [x] CCP-044-F1 - Refine Engine Arrow Eval Labels
- [x] CCP-043-F2 - Tighten Player-Strip Winner Box Sizing
- [x] CCP-044-F2 - Match Arrow Label Styling To Eval Bar

## CCP-148 - Review Puzzle Phase 0 Prompts Before Execution

```
- [x] Reviewed
  - ID: `CCP-148`
  - Task ID: `CCP-148`
  - Parent prompt ID: none
  - Batch prompt IDs: `CCP-143`, `CCP-144`, `CCP-145`, `CCP-146`, `CCP-147`
  - Source document: `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
  - Source step: `Phase 0 — Ownership And Data Foundations / pre-execution prompt review`
  - Task: review Puzzle V1 Phase 0 Claude prompts before execution and update them if they need scope or wording fixes
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-149 - Review Puzzle V1 Planning Docs

```
- [x] Reviewed
  - ID: `CCP-149`
  - Task ID: `CCP-149`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/PUZZLE_V1_PLAN.md`, `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
  - Source step: `planning-doc review before later prompt drafting`
  - Task: review the Puzzle V1 product plan and phased execution plan for ordering, gaps, and out-of-order assumptions
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-143 - Add Board Consumer Move Hook

```
- [ ] Reviewed
  - ID: `CCP-143`
  - Task ID: `CCP-143`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
  - Source step: `Phase 0 — Ownership And Data Foundations / Task 1`
  - Task: add a board-consumer move hook seam so board core can notify product owners without embedding future puzzle behavior
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
```

## CCP-144 - Move Retrospection Solve Logic Out Of Board Core

```
- [ ] Reviewed
  - ID: `CCP-144`
  - Task ID: `CCP-144`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
  - Source step: `Phase 0 — Ownership And Data Foundations / Task 2`
  - Task: move analysis-owned retrospection solve interception out of `src/board/index.ts`
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
```

## CCP-145 - Add Canonical Puzzle Domain Types

```
- [ ] Reviewed
  - ID: `CCP-145`
  - Task ID: `CCP-145`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
  - Source step: `Phase 0 — Ownership And Data Foundations / Task 3`
  - Task: add canonical Puzzle V1 model types separately from the legacy analysis-side `PuzzleCandidate`
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
```

## CCP-146 - Add Puzzle Library Persistence Owner

```
- [ ] Reviewed
  - ID: `CCP-146`
  - Task ID: `CCP-146`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
  - Source step: `Phase 0 — Ownership And Data Foundations / Task 4`
  - Task: add persistence ownership for puzzle definitions, user metadata, and attempt history
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
```

## CCP-147 - Add Puzzle Source Adapter Seams

```
- [ ] Reviewed
  - ID: `CCP-147`
  - Task ID: `CCP-147`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
  - Source step: `Phase 0 — Ownership And Data Foundations / Task 5`
  - Task: add adapter seams from Patzer saved moments and imported Lichess records into the canonical puzzle model
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
```
- [x] CCP-044-F3 - Reduce Arrow Label Weight And Size
- [x] CCP-035-F1 - Fix Arrowhead Loss After Engine Line Changes
- [x] CCP-066 - Add Search To Underboard And Games Lists
- [x] CCP-067 - Bring Eval Graph Fill Into Lichess Parity
- [x] CCP-068 - Add Eval Graph Height Toggle

## Log

## CCP-095 - Establish Lichess Dataset Workspace

```
- [x] Reviewed
  - ID: `CCP-095`
  - Task ID: `CCP-095`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/LICHESS_PUZZLE_DATABASE_INTEGRATION_SPRINT_2026-03-21.md`
  - Source step: `Task 1 — Establish a repo-safe local dataset workspace`
  - Task: add a repo-safe ignored local dataset workspace for raw Lichess puzzle downloads and generated shard output
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: puzzle round restore/replay currently rebuilds progress through `playUciMove(...)`, which mutates the source analysis tree by inserting puzzle-line moves into the live game tree instead of keeping puzzle playback isolated
  - Execution target: `Claude Code`
```

## CCP-096 - Add Lichess Puzzle Download Script

```
- [x] Reviewed
  - ID: `CCP-096`
  - Task ID: `CCP-096`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/LICHESS_PUZZLE_DATABASE_INTEGRATION_SPRINT_2026-03-21.md`
  - Source step: `Task 2 — Add an official Lichess puzzle download script`
  - Task: add an explicit script to fetch the official `lichess_db_puzzle.csv.zst` export into the local dataset workspace
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-097 - Build Lichess Puzzle Shard Pipeline

```
- [x] Reviewed
  - ID: `CCP-097`
  - Task ID: `CCP-097`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/LICHESS_PUZZLE_DATABASE_INTEGRATION_SPRINT_2026-03-21.md`
  - Source step: `Task 3 — Add a streaming preprocessing pipeline to Patzer shard format`
  - Task: convert the official export into Patzer-friendly generated manifest and shard files instead of loading raw CSV in the browser
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-098 - Add Imported Puzzle Loader Seam

```
- [x] Reviewed
  - ID: `CCP-098`
  - Task ID: `CCP-098`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/LICHESS_PUZZLE_DATABASE_INTEGRATION_SPRINT_2026-03-21.md`
  - Source step: `Task 4 — Add imported Lichess puzzle types and loader seams`
  - Task: add Patzer-owned imported-puzzle types and a loader that adapts generated Lichess shards into the app’s puzzle model
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-099 - Add Imported Puzzle Source Switch

```
- [x] Reviewed
  - ID: `CCP-099`
  - Task ID: `CCP-099`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/LICHESS_PUZZLE_DATABASE_INTEGRATION_SPRINT_2026-03-21.md`
  - Source step: `Task 5 — Add a puzzle-source switch and imported library surface`
  - Task: let the puzzles page switch between local saved puzzles and imported Lichess puzzles
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: puzzle round progress currently replays solution moves through `playUciMove(...)`, which mutates the live source-game analysis tree instead of keeping puzzle playback isolated
  - Execution target: `Claude Code`
```

## CCP-100 - Open Imported Lichess Puzzle Rounds

```
- [x] Reviewed
  - ID: `CCP-100`
  - Task ID: `CCP-100`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/LICHESS_PUZZLE_DATABASE_INTEGRATION_SPRINT_2026-03-21.md`
  - Source step: `Task 6 — Open imported Lichess puzzles in Patzer’s own puzzle controller`
  - Task: open imported Lichess puzzle records inside Patzer’s own puzzle controller and board flow
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-101 - Add Imported Puzzle Filters And Paging

```
- [x] Reviewed
  - ID: `CCP-101`
  - Task ID: `CCP-101`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/LICHESS_PUZZLE_DATABASE_INTEGRATION_SPRINT_2026-03-21.md`
  - Source step: `Task 7 — Add basic filters and lazy paging for imported puzzles`
  - Task: add basic rating, theme, and opening filters plus lazy shard paging for the imported Lichess library
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-112 - Phase 2 Puzzle Sprint Manager (CCP-107–110)

```
- [x] Reviewed
  - ID: `CCP-112`
  - Task ID: `CCP-112`
  - Parent prompt ID: none
  - Batch prompt IDs: CCP-107, CCP-108, CCP-109, CCP-110
  - Source document: docs/prompts/manager-batch.md
  - Source step: Phase 2 puzzle sprint execution
  - Task: auto-run CCP-107 through CCP-110 in sequence
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-111 - Phase 1 Puzzle Sprint Manager (CCP-103–106)

```
- [x] Reviewed
  - ID: `CCP-111`
  - Task ID: `CCP-111`
  - Parent prompt ID: none
  - Batch prompt IDs: CCP-103, CCP-104, CCP-105, CCP-106
  - Source document: docs/prompts/manager-batch.md
  - Source step: Phase 1 puzzle sprint execution
  - Task: auto-run CCP-103 through CCP-106 in sequence
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-110 - Add Result History Dots

```
- [x] Reviewed
  - ID: `CCP-110`
  - Task ID: `CCP-110`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: CCP-102 audit
  - Source step: Sprint 8 — Add result history dots
  - Task: render colored result dots from puzzleSession.recent in the puzzle round view
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-109 - Add Keyboard Navigation Shortcuts

```
- [x] Reviewed
  - ID: `CCP-109`
  - Task ID: `CCP-109`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: CCP-102 audit
  - Source step: Sprint 7 — Add keyboard navigation shortcuts
  - Task: arrow keys navigate puzzle moves; Escape returns to library
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-108 - Add Move Navigation Controls

```
- [x] Reviewed
  - ID: `CCP-108`
  - Task ID: `CCP-108`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: CCP-102 audit
  - Source step: Sprint 5 — Add move navigation controls
  - Task: add first/prev/next/last buttons to step through solution in terminal state
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-107 - Add Puzzle-Specific SCSS

```
- [x] Reviewed
  - ID: `CCP-107`
  - Task ID: `CCP-107`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: CCP-102 audit
  - Source step: Sprint 6 — Add puzzle-specific SCSS (layout + feedback)
  - Task: extract puzzle-round SCSS, fix sidebar-left, add icon and after-panel styles
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-106 - Add After-Puzzle Completion Panel

```
- [x] Reviewed
  - ID: `CCP-106`
  - Task ID: `CCP-106`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: CCP-102 audit
  - Source step: Sprint 4 — Add after-puzzle completion panel
  - Task: render distinct completion panel for solved/viewed terminal states
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-105 - Add Visual Feedback Icons

```
- [x] Reviewed
  - ID: `CCP-105`
  - Task ID: `CCP-105`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: CCP-102 audit
  - Source step: Sprint 3 — Add visual feedback icons
  - Task: add ✓/✗ icons to puzzle feedback section for good/fail/win states
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-104 - Add Opponent Move Animation Delay

```
- [x] Reviewed
  - ID: `CCP-104`
  - Task ID: `CCP-104`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: CCP-102 audit
  - Source step: Sprint 2 — Add opponent move animation delay
  - Task: delay opponent reply ~500ms and lock board during the window
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-103 - Fix Wrong-Move Result State

```
- [x] Reviewed
  - ID: `CCP-103`
  - Task ID: `CCP-103`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: CCP-102 audit
  - Source step: Sprint 1 — Fix wrong-move result state
  - Task: wrong move sets feedback='fail' but leaves result='active'
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-102 - Puzzle Page Lichess Audit And Sprint Plan

```
- [x] Reviewed
  - ID: `CCP-102`
  - Task ID: `CCP-102`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: none
  - Source step: Puzzle page Lichess audit and sprint planning
  - Task: audit puzzle page against Lichess and produce a sprint plan
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-083 - Establish Puzzle Route Ownership

```
- [x] Reviewed
  - ID: `CCP-083`
  - Task ID: `CCP-083`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md`
  - Source step: `Task 1 — Establish real puzzle module ownership and route surface`
  - Task: establish a real puzzle module seam and route surface so `#/puzzles` no longer depends on placeholder logic in `src/main.ts`
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-084 - Add Puzzle Round Model

```
- [x] Reviewed
  - ID: `CCP-084`
  - Task ID: `CCP-084`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md`
  - Source step: `Task 2 — Introduce a richer puzzle round model without breaking saved candidates`
  - Task: introduce a Patzer-owned puzzle-round model and a compatibility seam from persisted `PuzzleCandidate` records
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-085 - Render Saved Puzzle Library

```
- [x] Reviewed
  - ID: `CCP-085`
  - Task ID: `CCP-085`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md`
  - Source step: `Task 3 — Replace the placeholder puzzles route with a saved-puzzle library view`
  - Task: replace the placeholder puzzles page with a real saved-puzzle library view backed by current local IDB state
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-086 - Add Puzzle Round Controller

```
- [x] Reviewed
  - ID: `CCP-086`
  - Task ID: `CCP-086`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md`
  - Source step: `Task 4 — Add a minimal puzzle round controller`
  - Task: create a dedicated minimal puzzle round controller that owns active puzzle state, phase, and solution progress
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-087 - Validate Puzzle Moves And Auto-Reply

```
- [x] Reviewed
  - ID: `CCP-087`
  - Task ID: `CCP-087`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md`
  - Source step: `Task 5 — Route board moves through strict puzzle validation and scripted replies`
  - Task: wire puzzle-mode board moves through strict solution validation and scripted reply playback
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-088 - Add Puzzle Feedback And Round Controls

```
- [x] Reviewed
  - ID: `CCP-088`
  - Task ID: `CCP-088`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md`
  - Source step: `Task 6 — Add puzzle feedback and round controls`
  - Task: add puzzle-specific feedback and round controls for correct, wrong, solved, next, and view-solution states
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-089 - Add Puzzle Side Panel Metadata

```
- [x] Reviewed
  - ID: `CCP-089`
  - Task ID: `CCP-089`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md`
  - Source step: `Task 7 — Add the puzzle metadata / side-panel surface`
  - Task: add a lightweight puzzle metadata side panel using source-game and puzzle context that Patzer already owns
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-092 - Cache Board Move Destinations

```
- [x] Reviewed
  - ID: `CCP-092`
  - Task ID: `CCP-092`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/reference/patzer-board-motion-lag-audit.md`
  - Source step: `Next deep fix 1 — cache legal move destinations instead of recomputing them on every navigation step`
  - Task: stop recomputing legal move destinations from FEN on every navigation step and move to a cached destination seam
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-093 - Narrow Board Auto-Shape Updates

```
- [x] Reviewed
  - ID: `CCP-093`
  - Task ID: `CCP-093`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/reference/patzer-board-motion-lag-audit.md`
  - Source step: `Next deep fix 2 — switch to narrower Chessground auto-shape updates and skip no-op shape rebuilds`
  - Task: switch engine-overlay updates onto a narrower Chessground auto-shape path and skip no-op shape pushes
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-094 - Remove Board Overlay Fade Animation

```
- [x] Reviewed
  - ID: `CCP-094`
  - Task ID: `CCP-094`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/reference/patzer-board-motion-lag-audit.md`
  - Source step: `Next deep fix 3 — remove Patzer overlay fade animation from board arrows and custom SVGs`
  - Task: remove the Patzer board-overlay fade so arrows and custom SVG overlays appear immediately during move stepping
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-090 - Persist Local Puzzle Session

```
- [x] Reviewed
  - ID: `CCP-090`
  - Task ID: `CCP-090`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md`
  - Source step: `Task 8 — Persist lightweight local puzzle session state`
  - Task: persist a lightweight local puzzle session so saved-puzzle progress can survive reloads and continue cleanly
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-091 - Tighten Review-To-Puzzle Integration

```
- [x] Reviewed
  - ID: `CCP-091`
  - Task ID: `CCP-091`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md`
  - Source step: `Task 9 — Tighten review-to-puzzle integration`
  - Task: tighten the bridge from Patzer’s game-review flow to its saved-puzzle flow so the puzzle page feels like a direct downstream tool of review data
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-080 - Throttle Live Engine UI Refresh

```
- [x] Reviewed
  - ID: `CCP-080`
  - Task ID: `CCP-080`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/reference/patzer-board-motion-lag-audit.md`
  - Source step: `Recommended Order Of Work, Step 1`
  - Task: throttle engine-driven visible UI refresh during live analysis instead of redrawing directly from raw engine info output
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-081 - Split And Debounce Nav-State Persistence

```
- [x] Reviewed
  - ID: `CCP-081`
  - Task ID: `CCP-081`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/reference/patzer-board-motion-lag-audit.md`
  - Source step: `Recommended Order Of Work, Step 2`
  - Task: stop full imported-game library saves on every move-navigation step and move to a lightweight debounced nav-state persistence seam
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-082 - Reduce Default Live Engine Workload

```
- [x] Reviewed
  - ID: `CCP-082`
  - Task ID: `CCP-082`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/reference/patzer-board-motion-lag-audit.md`
  - Source step: `Recommended Order Of Work, Step 3`
  - Task: lower Patzer's default live-engine workload toward Lichess while preserving existing saved user preferences
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-079 - Reduce Board Review Glyph Scale To 20 Percent

```
- [x] Reviewed
  - ID: `CCP-079`
  - Task ID: `CCP-079`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `ad hoc user request`
  - Source step: `reduce on-board review glyph SVG scale from 40% to 20%`
  - Task: reduce the on-board review glyph badge scale from 40% to 20% while preserving the existing badge system
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-066-F1 - Add Underboard Games Search Bar

```
- [x] Reviewed
  - ID: `CCP-066-F1`
  - Task ID: `CCP-066`
  - Parent prompt ID: `CCP-066`
  - Batch prompt IDs: none
  - Source document: `docs/prompts/CLAUDE_PROMPT_LOG.md`
  - Source step: `CCP-066 review issue — underboard list still has no search bar`
  - Task: add the missing search bar to the compact games list beneath the analysis board
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-073 - Clear Board And Ceval Typecheck Slice

```
- [x] Reviewed
  - ID: `CCP-073`
  - Task ID: `CCP-073`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/KNOWN_ISSUES.md`
  - Source step: `[HIGH] npm run typecheck is wired but surfaces type errors`
  - Task: clear the first cohesive current typecheck slice across board, ceval, and engine files without tackling the whole backlog
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-074 - Clear Import And Shell Typecheck Slice

```
- [x] Reviewed
  - ID: `CCP-074`
  - Task ID: `CCP-074`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/KNOWN_ISSUES.md`
  - Source step: `[HIGH] npm run typecheck is wired but surfaces type errors`
  - Task: clear the next cohesive current typecheck slice across games, imports, keyboard, router, and shell files
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-075 - Make Board Resize Handle Safari-Reliable

```
- [x] Reviewed
  - ID: `CCP-075`
  - Task ID: `CCP-075`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/KNOWN_ISSUES.md`
  - Source step: `[MEDIUM] Board resize handle does not reliably appear or work in Safari`
  - Task: fix the board resize handle so it appears and works reliably in Safari
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-076 - Make Book-Aware Retrospection Cancellation Live

```
- [x] Reviewed
  - ID: `CCP-076`
  - Task ID: `CCP-076`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/KNOWN_ISSUES.md`
  - Source step: `[MEDIUM] Book-aware retrospection cancellation seam is defined but not live`
  - Task: make the existing book-aware retrospection cancellation seam live by wiring an opening provider into active candidate generation
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: the source-layer step in `src/analyse/boardGlyphs.ts` is bundled with later board wiring and settings work in `src/engine/ctrl.ts` and `src/ceval/view.ts`, so it did not land as a clean isolated extraction
  - Execution target: `Codex`
```

## CCP-077 - Finish Eval Graph Hover And Scrub Behavior

```
- [x] Reviewed
  - ID: `CCP-077`
  - Task ID: `CCP-077`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/KNOWN_ISSUES.md`
  - Source step: `[MEDIUM] Eval graph hover/scrub behavior is not yet working as expected`
  - Task: tighten eval-graph hover and scrub interaction so graph-driven review works as intended
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-078 - Fix Move-List Context Menu Positioning

```
- [x] Reviewed
  - ID: `CCP-078`
  - Task ID: `CCP-078`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/KNOWN_ISSUES.md`
  - Source step: `[MEDIUM] Move-list variation context menu can open at the top-left of the page`
  - Task: fix the move-list variation context menu so it opens over the selected move instead of at the page origin
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-070 - Add Lichess Review Glyph SVG Layer

```
- [x] Reviewed
  - ID: `CCP-070`
  - Task ID: `CCP-070`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `ad hoc user request`
  - Source step: `copy Lichess board move-review glyph SVGs exactly into Patzer as the source glyph layer`
  - Task: copy the Lichess board review glyph SVG system into Patzer as the source layer without wiring it into the board yet
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: bundled with later board-glyph wiring and toggle work in `src/engine/ctrl.ts` and `src/ceval/view.ts`, so the source-layer-only step did not land in isolation
  - Execution target: `Codex`
```

## CCP-071 - Render Review Glyphs On The Board

```
- [x] Reviewed
  - ID: `CCP-071`
  - Task ID: `CCP-071`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `ad hoc user request`
  - Source step: `render Lichess-style move-review glyph SVGs on the analysis board in the same way Lichess does`
  - Task: render Lichess-style board review glyph SVG badges on the analysis board using destination-square anchoring and stacking
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-072 - Add Review Glyph Board Toggle

```
- [x] Reviewed
  - ID: `CCP-072`
  - Task ID: `CCP-072`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `ad hoc user request`
  - Source step: `add an engine-settings toggle for board review glyphs and default it on`
  - Task: add a persisted engine-settings toggle for board review glyphs and default it on
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-067-F1 - Fix Eval Graph Fill To Rise From Bottom

```
- [x] Reviewed
  - ID: `CCP-067-F1`
  - Task ID: `CCP-067`
  - Parent prompt ID: `CCP-067`
  - Batch prompt IDs: none
  - Source document: `ad hoc user request`
  - Source step: `make eval-graph white fill rise from the bottom of the chart instead of the center line`
  - Task: fix eval-graph fill so white territory rises from the bottom of the graph instead of shading from the middle line
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-044-F4 - Fade In Engine Arrow Labels And Arrows

```
- [x] Reviewed
  - ID: `CCP-044-F4`
  - Task ID: `CCP-044`
  - Parent prompt ID: `CCP-044-F3`
  - Batch prompt IDs: none
  - Source document: `ad hoc user request`
  - Source step: `reduce arrow label typography to 10/400/2 and add subtle fade-in for new arrow labels and arrows`
  - Task: refine engine-arrow labels to 10/400/2 and make both arrows and labels fade in subtly on first appearance
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-069 - Refine Eval Graph Fill And Resize Handle

```
- [x] Reviewed
  - ID: `CCP-069`
  - Task ID: `CCP-069`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `ad hoc user request`
  - Source step: `replace eval-graph slider with a center drag handle, keep Lichess-style white fill, and remove phase labels`
  - Task: refine the eval graph so it uses a center drag handle, keeps Lichess-style white fill, and removes phase labels
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-044-F3 - Reduce Arrow Label Weight And Size

```
- [x] Reviewed
  - ID: `CCP-044-F3`
  - Task ID: `CCP-044`
  - Parent prompt ID: `CCP-044-F2`
  - Batch prompt IDs: none
  - Source document: `ad hoc user request`
  - Source step: `reduce move-arrow label size and font weight`
  - Task: refine move-arrow label typography so the numbers are much smaller and less bold while keeping the current shadow
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-067 - Bring Eval Graph Fill Into Lichess Parity

```
- [x] Reviewed
  - ID: `CCP-067`
  - Task ID: `CCP-067`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/WISHLIST.md`
  - Source step: `Changes to how the eval graph is displayed and formatted`
  - Task: bring the eval-graph fill behavior into Lichess parity so White advantage fills white
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-068 - Add Eval Graph Height Toggle

```
- [x] Reviewed
  - ID: `CCP-068`
  - Task ID: `CCP-068`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `ad hoc user request`
  - Source step: `add a bottom-center eval-graph height toggle from 100% to 300%`
  - Task: add a small bottom-center eval-graph control that enlarges graph height from 100% up to 300%
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-066 - Add Search To Underboard And Games Lists

```
- [x] Reviewed
  - ID: `CCP-066`
  - Task ID: `CCP-066`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `ad hoc user request`
  - Source step: `add a search bar to the underboard games list and the Games history page`
  - Task: add a search bar to both the underboard games list and the Games page using the smallest safe shared search/filter step
  - Claude used: no
  - Review outcome: issues found
  - Review issues: underboard list still has no search bar and Games-page search remains opponent-only rather than a shared text search
  - Execution target: `Codex`
```

## CCP-035-F1 - Fix Arrowhead Loss After Engine Line Changes

```
- [x] Reviewed
  - ID: `CCP-035-F1`
  - Task ID: `CCP-035`
  - Parent prompt ID: `CCP-035`
  - Batch prompt IDs: none
  - Source document: `docs/KNOWN_ISSUES.md`
  - Source step: `[MEDIUM] Changing engine line count can make the main engine arrowhead disappear`
  - Task: fix the remaining engine-arrowhead instability so line-count or nearby arrow-setting changes do not make the main arrowhead disappear
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-044-F2 - Match Arrow Label Styling To Eval Bar

```
- [x] Reviewed
  - ID: `CCP-044-F2`
  - Task ID: `CCP-044`
  - Parent prompt ID: `CCP-044-F1`
  - Batch prompt IDs: none
  - Source document: `docs/WISHLIST.md`
  - Source step: `Add tag or label next to engine move arrows showing what their eval is`
  - Task: refine engine-arrow label styling so the text is smaller and visually matches the eval-bar score
  - Claude used: no
  - Review outcome: issues found
  - Review issues: the reviewed family did not land the requested eval-bar-matching refinement before later F3/F4 follow-ups took the label styling in a different direction
  - Execution target: `Codex`
```

## CCP-043-F2 - Tighten Player-Strip Winner Box Sizing

```
- [x] Reviewed
  - ID: `CCP-043-F2`
  - Task ID: `CCP-043`
  - Parent prompt ID: `CCP-043-F1`
  - Batch prompt IDs: none
  - Source document: `docs/WISHLIST.md`
  - Source step: `Remove the 1 / 0 / ½ single-game result markers from the player strip by default`
  - Task: refine the player-strip winner/loser boxes so they hug the displayed identity width and use border-only styling without a background fill
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-065 - Add Toggle For Review Label Visibility

```
- [x] Reviewed
  - ID: `CCP-065`
  - Task ID: `CCP-065`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/archive/MOVE_QUALITY_AUDIT_2026-03-20.md`
  - Source step: `Lichess-style move review label visibility parity`
  - Task: verify exact Lichess move-review label rendering and add a persisted engine-setting toggle that shows or hides visible review labels in Patzer
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-044-F1 - Refine Engine Arrow Eval Labels

```
- [x] Reviewed
  - ID: `CCP-044-F1`
  - Task ID: `CCP-044`
  - Parent prompt ID: `CCP-044`
  - Batch prompt IDs: none
  - Source document: `docs/WISHLIST.md`
  - Source step: `Add tag or label next to engine move arrows showing what their eval is`
  - Task: refine engine-arrow eval labels so they are off by default, configurable in engine settings, and integrated into arrowheads for primary, secondary, and played arrows
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-043-F1 - Winner And Loser Player-Strip Boxes

```
- [x] Reviewed
  - ID: `CCP-043-F1`
  - Task ID: `CCP-043`
  - Parent prompt ID: `CCP-043`
  - Batch prompt IDs: none
  - Source document: `docs/WISHLIST.md`
  - Source step: `Remove the 1 / 0 / ½ single-game result markers from the player strip by default`
  - Task: replace the current player-strip winner star with styled green/red winner-loser boxes containing username, rating, and board color
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-015-F3 - Restore Per-Candidate Show Engine Toggle In Mistakes Mode

```
- [x] Reviewed
  - ID: `CCP-015-F3`
  - Task ID: `CCP-015`
  - Parent prompt ID: `CCP-015-F2`
  - Source document: `docs/reference/patzer-retrospection-audit.md`
  - Source step: `Learn From Mistakes guidance behavior follow-up fix`
  - Task: restore the per-candidate `Show engine` behavior in Learn From Mistakes and document it explicitly if it is a Patzer deviation from Lichess
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-021-F1 - Fix Retrospection Tools Render Corruption

```
- [x] Reviewed
  - ID: `CCP-021-F1`
  - Task ID: `CCP-021`
  - Parent prompt ID: `CCP-021`
  - Source document: `docs/reference/patzer-retrospection-audit.md`
  - Source step: `Recommended next implementation sequence, Step 4 follow-up fix`
  - Task: fix the retrospection render corruption bug causing duplicated panels, poisoned tools UI, and Snabbdom boolean-child patch failures
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-015-F2 - Per-Candidate Engine Guidance Toggle In Retrospection

```
- [x] Reviewed
  - ID: `CCP-015-F2`
  - Task ID: `CCP-015`
  - Parent prompt ID: `CCP-015-F1`
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 3, Item 10`
  - Task: keep engine guidance off by default in retrospection, allow per-candidate reveal, and reset to hidden on the next mistake
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-017 - Remove Clear Variations Button

```
- [x] Reviewed
  - ID: `CCP-017`
  - Task ID: `CCP-017`
  - Parent prompt ID: none
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 4, Item 12`
  - Task: remove the move-list `Clear variations` button while keeping per-variation `×` deletion
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-013 - Retrospection Lifecycle Wiring

```
- [x] Reviewed
  - ID: `CCP-013`
  - Task ID: `CCP-013`
  - Parent prompt ID: none
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 3, Item 10`
  - Task: wire retrospection into analysis lifecycle events
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: lifecycle hooks are currently dead because no `RetroCtrl` instance is attached to `ctrl`, and ceval updates still do not call `retro.onCeval()`
```

## CCP-013-F1 - Finish Retrospection Lifecycle Wiring

```
- [x] Reviewed
  - ID: `CCP-013-F1`
  - Task family: `CCP-013`
  - Parent prompt: `CCP-013`
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 3, Item 10`
  - Task: finish the missing live lifecycle and ceval wiring from `CCP-013`
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: closes the dead-hook and ceval-caller gaps, but bundles unrelated review-controls/export UI movement outside the scoped lifecycle fix
```

## CCP-014-F1 - Hide Find Puzzles Button During Mistakes Rollout

```
- [x] Reviewed
  - ID: `CCP-014-F1`
  - Task ID: `CCP-014`
  - Parent prompt ID: `CCP-014`
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 3, Item 10`
  - Task: hide the visible `Find Puzzles` button while keeping the current mistakes rollout intact
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: hides `Find Puzzles`, but the underlying `CCP-014` empty-candidate bug remains because the `Mistakes` button still opens an empty active session instead of failing honestly
```

## CCP-012 - Retrospection Controller Skeleton

```
- [x] Reviewed
  - ID: `CCP-012`
  - Task ID: `CCP-012`
  - Parent prompt ID: none
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 3, Item 10`
  - Task: add a dedicated retrospection controller/state owner
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-016 - Use Persisted Review Labels In UI

```
- [x] Reviewed
  - ID: `CCP-016`
  - Task ID: `CCP-016`
  - Parent prompt ID: none
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 3, Item 11`
  - Task: use persisted review labels in move-list and summary UI
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: the persisted-label hydration and UI fallback changes look correct, but the local task is bundled with unrelated retrospection lifecycle, entry, and controls work in `src/main.ts` and `src/engine/ctrl.ts`, so the prompt execution is not cleanly scoped
```

## CCP-015-F1 - Hide Engine Guidance During Retrospection

```
- [x] Reviewed
  - ID: `CCP-015-F1`
  - Task ID: `CCP-015`
  - Parent prompt ID: `CCP-015`
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 3, Item 10`
  - Task: hide engine lines and arrows while Learn From Mistakes / retrospection mode is active
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: engine PV lines and arrows are hidden only while `ctrl.retro?.isSolving()` is true, not for the full time retrospection mode is active, so guidance returns in other retro states like `win` / `view`
```

## CCP-018 - Extract Retrospection UI Ownership

```
- [x] Reviewed
  - ID: `CCP-018`
  - Task ID: `CCP-018`
  - Parent prompt ID: none
  - Source document: `docs/reference/patzer-retrospection-audit.md`
  - Source step: `Recommended next implementation sequence, Step 1`
  - Task: extract retrospection entry and active-session rendering out of `src/main.ts` into `src/analyse/`
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-019 - Complete Retrospection Lifecycle Handling

```
- [x] Reviewed
  - ID: `CCP-019`
  - Task ID: `CCP-019`
  - Parent prompt ID: none
  - Source document: `docs/reference/patzer-retrospection-audit.md`
  - Source step: `Recommended next implementation sequence, Step 2`
  - Task: replace the inert retrospection `onCeval()` seam with meaningful lifecycle behavior while preserving exact-best MVP solving
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: the `CCP-019` lifecycle changes are bundled into the same commit as unrelated `CCP-015-F2` guidance-reveal behavior, so the prompt execution is not cleanly isolated
```

## CCP-020 - Move Retrospection UI Into Analysis Tools

```
- [x] Reviewed
  - ID: `CCP-020`
  - Task ID: `CCP-020`
  - Parent prompt ID: none
  - Source document: `docs/reference/patzer-retrospection-audit.md`
  - Source step: `Recommended next implementation sequence, Step 3`
  - Task: move the active retrospection UI into the analysis tools area
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: the active retrospection panel was moved into the tools area, but this prompt execution also bundled the broader `CCP-021` suppression pass by hiding summary/puzzle surfaces during retrospection instead of staying placement-only
```

## CCP-021 - Suppress Conflicting Analysis UI During Retrospection

```
- [x] Reviewed
  - ID: `CCP-021`
  - Task ID: `CCP-021`
  - Parent prompt ID: none
  - Source document: `docs/reference/patzer-retrospection-audit.md`
  - Source step: `Recommended next implementation sequence, Step 4`
  - Task: suppress conflicting analysis UI while active retrospection is running
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: the suppression behavior is present, but the same local prompt execution is bundled with unrelated later work including `bestLine` persistence, near-best retrospection changes, and move-list context-menu actions, so it is not cleanly isolated
```

## CCP-022 - Persist Retrospection Best-Line Context

```
- [x] Reviewed
  - ID: `CCP-022`
  - Task ID: `CCP-022`
  - Parent prompt ID: none
  - Source document: `docs/reference/patzer-retrospection-audit.md`
  - Source step: `Recommended next implementation sequence, Step 5`
  - Task: persist richer retrospection solution context such as `bestLine`
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-023 - Add Book-Aware Retrospection Cancellation

```
- [x] Reviewed
  - ID: `CCP-023`
  - Task ID: `CCP-023`
  - Parent prompt ID: none
  - Source document: `docs/reference/patzer-retrospection-audit.md`
  - Source step: `Recommended next implementation sequence, Step 6`
  - Task: add the first safe opening/book-aware cancellation step for retrospection candidates
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: defines the opening-cancellation seam in `buildRetroCandidates()`, but `toggleRetro()` still calls it without any opening provider, so book-aware suppression is not actually live
```

## CCP-024 - Add Near-Best Acceptance Parity

```
- [x] Reviewed
  - ID: `CCP-024`
  - Task ID: `CCP-024`
  - Parent prompt ID: none
  - Source document: `docs/reference/patzer-retrospection-audit.md`
  - Source step: `Recommended next implementation sequence, Step 7`
  - Task: add the first source-backed near-best acceptance step to retrospection
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: the new `eval` / near-best path is still bypassed when the attempted move already exists in the tree, because `board/index.ts` returns early through the existing-child navigation path before any retro judgment runs
```

## CCP-025 - Add Move-List Context Menu Infrastructure

```
- [x] Reviewed
  - ID: `CCP-025`
  - Task ID: `CCP-025`
  - Parent prompt ID: none
  - Source document: `docs/reference/lichess-analysis-variation-actions-audit.md`
  - Source step: `Source-backed implementation sequence, Step 1`
  - Task: add move-list context-menu infrastructure for path-based variation actions
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: the infrastructure step is bundled with real copy/delete/promote actions in `renderContextMenu()`, so it is not cleanly scoped to menu shell + targeting only
```

## CCP-026 - Add Copy Mainline And Variation PGN Actions

```
- [x] Reviewed
  - ID: `CCP-026`
  - Task ID: `CCP-026`
  - Parent prompt ID: none
  - Source document: `docs/reference/lichess-analysis-variation-actions-audit.md`
  - Source step: `Source-backed implementation sequence, Step 2`
  - Task: add context-menu actions to copy mainline and variation PGN from the selected path
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: `copyLinePgn()` uses `nodeListAt(path)` instead of the Lichess-style extended line path, so it can copy only the moves up to the selected node instead of the full selected mainline/variation
```

## CCP-027 - Add Delete-From-Here Variation Action

```
- [x] Reviewed
  - ID: `CCP-027`
  - Task ID: `CCP-027`
  - Parent prompt ID: none
  - Source document: `docs/reference/lichess-analysis-variation-actions-audit.md`
  - Source step: `Source-backed implementation sequence, Step 3`
  - Task: add a move-list context `Delete from here` branch action with active-path repair
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: the context-menu action reuses `deleteVariation()`, so deleted branches still are not persisted across reload and can reappear because the mutated move tree is not saved as tree state
```

## CCP-028 - Add Variation Promotion And Make-Mainline Actions

```
- [x] Reviewed
  - ID: `CCP-028`
  - Task ID: `CCP-028`
  - Parent prompt ID: none
  - Source document: `docs/reference/lichess-analysis-variation-actions-audit.md`
  - Source step: `Source-backed implementation sequence, Step 4`
  - Task: add context-menu actions for variation promotion and make-mainline behavior
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: after `promoteAt(...)`, the handler only calls `redraw()` and does not refresh `ctrl.setPath(ctrl.path)`, so `ctrl.mainline` / `nodeList` can stay stale after tree reordering
```


## CCP-015 - Minimal Retrospection Solve Loop

```
- [x] Reviewed
  - ID: `CCP-015`
  - Task ID: `CCP-015`
  - Parent prompt ID: none
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 3, Item 10`
  - Task: add exact-best-move-only retrospection solve loop for the current game
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: board moves that already exist as child nodes bypass retrospection win/fail handling entirely, and failed attempts leave new variation clutter in the tree instead of cleaning up the bad retry branch
```

## CCP-014 - Enter Retrospection For Current Game

```
- [x] Reviewed
  - ID: `CCP-014`
  - Task ID: `CCP-014`
  - Parent prompt ID: none
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 3, Item 10`
  - Task: add a minimal current-game retrospection entry affordance
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: the `Mistakes` button still enables and opens an empty retro session when there are zero eligible candidates, instead of failing honestly with a disabled/empty state
```

## CCP-011 - Retrospection Candidate Builder

```
- [x] Reviewed
  - ID: `CCP-011`
  - Task ID: `CCP-011`
  - Parent prompt ID: none
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 3, Item 10`
  - Task: introduce a dedicated retrospection candidate shape and builder
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-010 - Fix Sparse Move-List Row Spacing

```
- [x] Reviewed
  - ID: `CCP-010`
  - Task ID: `CCP-010`
  - Parent prompt ID: none
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 4, Item 12`
  - Task: fix excessive vertical spacing in short move lists while preserving the sticky footer
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-009 - Sticky Move-List Action Strip

```
- [x] Reviewed
  - ID: `CCP-009`
  - Task ID: `CCP-009`
  - Parent prompt ID: none
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 4, Item 12`
  - Task: keep the bottom move-list action strip visible while the move list scrolls
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-008 - Move Clear Variations Into Bottom Action Strip

```
- [x] Reviewed
  - ID: `CCP-008`
  - Task ID: `CCP-008`
  - Parent prompt ID: none
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 4, Item 12`
  - Task: move `Clear variations` into a move-list bottom action strip
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-007 - Small Review-State Messaging Improvement

```
- [x] Reviewed
  - ID: `CCP-007`
  - Task ID: `CCP-007`
  - Parent prompt ID: none
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 4, Item 14`
  - Task: small review-state messaging improvement
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-006 - Honest Minimum Analysis-Game Route Surface

```
- [x] Reviewed
  - ID: `CCP-006`
  - Task ID: `CCP-006`
  - Parent prompt ID: none
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 4, Item 13`
  - Task: honest minimum `analysis-game` route surface
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: `analysis-game` can get stuck on a permanent "Loading…" state when the imported library is actually empty or the requested game id is missing before any games are loaded, because `routeContent()` uses `importedGames.length === 0` as an IDB-loading proxy with no separate loaded/empty distinction
```

## CCP-005 - Clear Side Variations And Restore Mainline Order

```
- [x] Reviewed
  - ID: `CCP-005`
  - Task ID: `CCP-005`
  - Parent prompt ID: none
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 4, Item 12`
  - Task: clear user-created side variations and restore move list to mainline order
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-004 - Variation Remove Button Visual Alignment

```
- [x] Reviewed
  - ID: `CCP-004`
  - Task ID: `CCP-004`
  - Parent prompt ID: none
  - Source document: inferred from commit/review history
  - Source step: unknown
  - Task: style variation remove button to match move-list visual language
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none; prompt id was reconstructed after the fact from commit order and review context, so exact original prompt provenance is not confirmed
```

## CCP-003 - First Move-List Variation Removal Affordance

```
- [x] Reviewed
  - ID: `CCP-003`
  - Task ID: `CCP-003`
  - Parent prompt ID: none
  - Source document: `docs/NEXT_STEPS.md`
  - Source step: `Priority 4, Item 12`
  - Task: first move-list variation removal affordance
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: variation deletion is not actually persisted across reload; `saveGamesToIdb()` stores imported game PGN/path, not the mutated move tree, so deleted branches can reappear after reload
```

## CCP-030 - First Safe Typecheck Error Slice

```
- [x] Reviewed
  - ID: `CCP-030`
  - Task ID: `CCP-030`
  - Parent prompt ID: none
  - Source document: `docs/KNOWN_ISSUES.md`
  - Source step: `[HIGH] npm run typecheck is wired but surfaces 53 type errors`
  - Task: clear the first cohesive typecheck error cluster in `src/analyse/evalView.ts` and `src/analyse/moveList.ts`
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-031 - Fix Board Wheel Navigation Selector

```
- [x] Reviewed
  - ID: `CCP-031`
  - Task ID: `CCP-031`
  - Parent prompt ID: none
  - Source document: `docs/KNOWN_ISSUES.md`
  - Source step: `[HIGH] Wheel scroll navigation is still non-functional`
  - Task: fix the board wheel-navigation hit target so wheel scrolling over the analysis board actually steps moves
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-032 - Replace Stop Boolean With Search Tokens

```
- [x] Reviewed
  - ID: `CCP-032`
  - Task ID: `CCP-032`
  - Parent prompt ID: none
  - Source document: `docs/KNOWN_ISSUES.md`
  - Source step: `[HIGH] In-flight engine stop handling still relies on a boolean flag`
  - Task: replace the remaining coarse stop boolean seam with per-search token bookkeeping
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-033 - Fix Imported-Game Orientation Propagation

```
- [x] Reviewed
  - ID: `CCP-033`
  - Task ID: `CCP-033`
  - Parent prompt ID: none
  - Source document: `docs/KNOWN_ISSUES.md`
  - Source step: `[HIGH] Imported-game board orientation does not always match the importing user's side`
  - Task: fix live board orientation so imported games reliably orient to the importing user's side
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-006-F1 - Fix Analysis-Game Empty-Library Loading State

```
- [x] Reviewed
  - ID: `CCP-006-F1`
  - Task ID: `CCP-006`
  - Parent prompt ID: `CCP-006`
  - Source document: `docs/KNOWN_ISSUES.md`
  - Source step: `[MEDIUM] analysis-game route can still get stuck in a fake loading state`
  - Task: separate loading-vs-empty library semantics so `analysis-game` stops showing permanent fake loading text
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-034 - Improve Eval Graph Hover And Scrub

```
- [x] Reviewed
  - ID: `CCP-034`
  - Task ID: `CCP-034`
  - Parent prompt ID: none
  - Source document: `docs/KNOWN_ISSUES.md`
  - Source step: `[MEDIUM] Eval graph hover/scrub behavior is not yet working as expected`
  - Task: add the first safe eval-graph hover/scrub improvement
  - Claude used: yes
  - Review outcome: issues found
  - Review issues: hover indicator still updates only on per-strip `mouseenter`, not nearest-on-`mousemove`
```

## CCP-035 - Fix Engine Arrowhead Rendering

```
- [x] Reviewed
  - ID: `CCP-035`
  - Task ID: `CCP-035`
  - Parent prompt ID: none
  - Source document: `docs/KNOWN_ISSUES.md`
  - Source step: `[MEDIUM] Engine arrows can render without a visible arrowhead`
  - Task: fix engine-arrow rendering so live arrows keep a visible arrowhead
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-036 - Implement Honest Minimum Puzzles Route

```
- [x] Reviewed
  - ID: `CCP-036`
  - Task ID: `CCP-036`
  - Parent prompt ID: none
  - Source document: `docs/KNOWN_ISSUES.md`
  - Source step: `[MEDIUM] Puzzle route is still a placeholder`
  - Task: replace the placeholder puzzles route with the smallest honest saved-puzzle workflow
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-037 - Fetch Multi-Month Chess.com Archives

```
- [x] Reviewed
  - ID: `CCP-037`
  - Task ID: `CCP-037`
  - Parent prompt ID: none
  - Source document: `docs/KNOWN_ISSUES.md`
  - Source step: `[LOW] Chess.com import still fetches only the latest archive month`
  - Task: fetch the necessary Chess.com archive months for the selected date range instead of only the newest month
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-038 - Replace Header Game Review Stub

```
- [x] Reviewed
  - ID: `CCP-038`
  - Task ID: `CCP-038`
  - Parent prompt ID: none
  - Source document: `docs/KNOWN_ISSUES.md`
  - Source step: `[LOW] Header global menu still contains a stub Game Review action`
  - Task: replace the header `Game Review` TODO stub with honest real behavior or an honest disabled state
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-040 - Eval Graph Display Refresh

```
- [x] Reviewed
  - ID: `CCP-040`
  - Task ID: `CCP-040`
  - Parent prompt ID: none
  - Source document: `docs/WISHLIST.md`
  - Source step: `Changes to how the eval graph is displayed and formatted`
  - Task: take the first small safe wishlist step on eval-graph display and formatting
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-041 - Review Annotation Color Parity

```
- [x] Reviewed
  - ID: `CCP-041`
  - Task ID: `CCP-041`
  - Parent prompt ID: none
  - Source document: `docs/WISHLIST.md`
  - Source step: `Bring review annotation label/colors into Lichess parity`
  - Task: align Patzer review annotation colors and related styling with confirmed Lichess mapping
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-042 - Move Review Button Beside Navigation Controls

```
- [x] Reviewed
  - ID: `CCP-042`
  - Task ID: `CCP-042`
  - Parent prompt ID: none
  - Source document: `docs/WISHLIST.md`
  - Source step: `Move the analysis-page Review / Re-analyze button beside the move-navigation buttons`
  - Task: move the analysis-page Review/Re-analyze control beside Prev/Flip/Next in the smallest safe way
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-043 - Replace Player-Strip Result Markers

```
- [x] Reviewed
  - ID: `CCP-043`
  - Task ID: `CCP-043`
  - Parent prompt ID: none
  - Source document: `docs/WISHLIST.md`
  - Source step: `Remove the 1 / 0 / ½ single-game result markers from the player strip by default`
  - Task: remove the current player-strip result markers and replace them with a clearer minimal winner/loser signal
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```

## CCP-044 - Add Eval Labels To Engine Arrows

```
- [x] Reviewed
  - ID: `CCP-044`
  - Task ID: `CCP-044`
  - Parent prompt ID: none
  - Source document: `docs/WISHLIST.md`
  - Source step: `Add tag or label next to engine move arrows showing what their eval is`
  - Task: add the first safe eval label beside the primary engine arrow
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-045 - Prevent Duplicate Reimports

```
- [x] Reviewed
  - ID: `CCP-045`
  - Task ID: `CCP-045`
  - Parent prompt ID: none
  - Source document: `docs/WISHLIST.md`
  - Source step: `we shouldn't re import the same games that have already been imported`
  - Task: prevent obviously duplicate game reimports in the smallest safe way
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-046 - Import Only New Games Since Last Import

```
- [x] Reviewed
  - ID: `CCP-046`
  - Task ID: `CCP-046`
  - Parent prompt ID: none
  - Source document: `docs/WISHLIST.md`
  - Source step: `Import only new games since last import`
  - Task: take the first safe step toward incremental imports and temporary new-import badging
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-047 - Header Platform Toggle UX

```
- [x] Reviewed
  - ID: `CCP-047`
  - Task ID: `CCP-047`
  - Parent prompt ID: none
  - Source document: `docs/WISHLIST.md`
  - Source step: `In the header, it should default to a chess.com username input field`
  - Task: tighten the header platform-toggle UX while keeping Chess.com as the default
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-048 - Highlight Massive Engine Improvements

```
- [x] Reviewed
  - ID: `CCP-048`
  - Task ID: `CCP-048`
  - Parent prompt ID: none
  - Source document: `docs/WISHLIST.md`
  - Source step: `IF there is an engine line available that has a massive improvement`
  - Task: add a stronger visual highlight for clearly massive engine improvements in the PV list
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-049 - Show KO Mate Notation

```
- [x] Reviewed
  - ID: `CCP-049`
  - Task ID: `CCP-049`
  - Parent prompt ID: none
  - Source document: `docs/WISHLIST.md`
  - Source step: `When mate is played on the board, the analysis engine should show a #KO symbol`
  - Task: replace the current terminal mate notation with #KO in the intended analysis UI
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-050 - Winner-Color Eval Bar On Mate

```
- [x] Reviewed
  - ID: `CCP-050`
  - Task ID: `CCP-050`
  - Parent prompt ID: none
  - Source document: `docs/WISHLIST.md`
  - Source step: `When mate is played on the board, the eval bar should fill up entirely with whatever colour delivered the mate`
  - Task: fix mate-state eval-bar fill so it resolves fully to the winning side
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-051 - KO Overlay On Losing King For M1

```
- [x] Reviewed
  - ID: `CCP-051`
  - Task ID: `CCP-051`
  - Parent prompt ID: none
  - Source document: `docs/WISHLIST.md`
  - Source step: `When M1 is played on the board, the losing king should get a KO symbol over it`
  - Task: add the first safe KO overlay for the losing king on immediate mate positions
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-052 - Hide Arrows During Game Review

```
- [x] Reviewed
  - ID: `CCP-052`
  - Task ID: `CCP-052`
  - Parent prompt ID: none
  - Source document: `docs/WISHLIST.md`
  - Source step: `when game review button is pressed, all arrows should be removed from board until game review is completed`
  - Task: hide board arrows during active batch review and restore them when review finishes
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-053 - Toggle Review Dots To User Perspective Only

```
- [x] Reviewed
  - ID: `CCP-053`
  - Task ID: `CCP-053`
  - Parent prompt ID: none
  - Source document: `docs/WISHLIST.md`
  - Source step: `Setting to toggle only the users whose perspective we are looking at to have their move review annotated dot colour shown`
  - Task: add a setting that filters review-dot visibility to the current user perspective while defaulting to both
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-055 - Mate Display KO Polish

```
- [x] Reviewed
  - ID: `CCP-055`
  - Task ID: `CCP-055`
  - Parent prompt ID: none
  - Source document: inferred from user request in chat
  - Source step: `mate-display UI polish so checkmate is shown as #KO! in the move list and engine display`
  - Task: implement mate-display UI polish so checkmate is shown as `#KO!` in the move list and engine display, and make the engine-display `#KO!` purple
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-056 - Add Main-Menu Toggle For Board Wheel Navigation

```
- [x] Reviewed
  - ID: `CCP-056`
  - Task ID: `CCP-056`
  - Parent prompt ID: none
  - Source document: inferred from user request in chat
  - Source step: `make board-wheel move navigation a main-menu setting that defaults to off`
  - Task: add a persisted main-menu toggle for board-wheel move navigation and default it to off
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-057 - Fix Live Engine Stall During Move Navigation

```
- [x] Reviewed
  - ID: `CCP-057`
  - Task ID: `CCP-057`
  - Parent prompt ID: none
  - Source document: `docs/KNOWN_ISSUES.md`
  - Source step: `[HIGH] Live per-move engine analysis can stall during move navigation`
  - Task: diagnose and fix the live-engine navigation stall so PV lines and arrows keep matching the current position during move-by-move review
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-058 - Fix White KO Eval-Graph Direction

```
- [x] Reviewed
  - ID: `CCP-058`
  - Task ID: `CCP-058`
  - Parent prompt ID: none
  - Source document: inferred from user request in chat
  - Source step: `eval graph bug where White KO drops to the bottom instead of staying at the top`
  - Task: fix the eval-graph mate bug where a terminal KO/checkmate for White plots at the bottom instead of staying at the top
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-059 - Add Mobile Analysis Stack Layout

```
- [x] Reviewed
  - ID: `CCP-059`
  - Task ID: `CCP-059`
  - Parent prompt ID: none
  - Source document: `docs/mini-sprints/MOBILE_ANALYSIS_USABILITY_SPRINT_2026-03-21.md`
  - Source step: `Task 1 — Add a real mobile analysis layout mode`
  - Task: add the first safe portrait-mobile single-column analysis layout
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-060 - Hide Mobile Analysis Chrome

```
- [x] Reviewed
  - ID: `CCP-060`
  - Task ID: `CCP-060`
  - Parent prompt ID: none
  - Source document: `docs/mini-sprints/MOBILE_ANALYSIS_USABILITY_SPRINT_2026-03-21.md`
  - Source step: `Task 2 — Hide low-value chrome on mobile`
  - Task: hide eval gauge, player strips, resize handle, and wasteful chrome on the mobile analysis layout
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-061 - Make Mobile Controls Board-Adjacent

```
- [x] Reviewed
  - ID: `CCP-061`
  - Task ID: `CCP-061`
  - Parent prompt ID: none
  - Source document: `docs/mini-sprints/MOBILE_ANALYSIS_USABILITY_SPRINT_2026-03-21.md`
  - Source step: `Task 3 — Move board navigation and Review into a mobile-friendly control block`
  - Task: make the current analysis controls mobile-friendly and board-adjacent
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-062 - Make Mobile Tools Stack Readable

```
- [x] Reviewed
  - ID: `CCP-062`
  - Task ID: `CCP-062`
  - Parent prompt ID: none
  - Source document: `docs/mini-sprints/MOBILE_ANALYSIS_USABILITY_SPRINT_2026-03-21.md`
  - Source step: `Task 4 — Make the tools column readable as a mobile stack`
  - Task: relax the desktop tools-column assumptions so mobile ceval, PVs, move list, retro strip, and summary stack readably
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-063 - Make Underboard Secondary On Mobile

```
- [x] Reviewed
  - ID: `CCP-063`
  - Task ID: `CCP-063`
  - Parent prompt ID: none
  - Source document: `docs/mini-sprints/MOBILE_ANALYSIS_USABILITY_SPRINT_2026-03-21.md`
  - Source step: `Task 5 — Make underboard truly secondary on mobile`
  - Task: tidy mobile underboard spacing and overflow so graph and game list stay reachable below tools
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-064 - Add One Minimal Mobile Touch Improvement

```
- [x] Reviewed
  - ID: `CCP-064`
  - Task ID: `CCP-064`
  - Parent prompt ID: none
  - Source document: `docs/mini-sprints/MOBILE_ANALYSIS_USABILITY_SPRINT_2026-03-21.md`
  - Source step: `Task 6 — Add one minimal touch usability improvement`
  - Task: add one minimal touch usability improvement using the sprint’s low-risk larger-targets option
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Codex`
```

## CCP-113 - Add Training Queue State to Imported Puzzle Module

```
- [x] Reviewed
  - ID: `CCP-113`
  - Task ID: `CCP-113`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/reference/lichess-puzzle-ux/FILTERS_THEMES_AND_SELECTION.md`
  - Source step: Puzzle training queue — sequential puzzle delivery within a filtered set
  - Task: add training mode + cursor state to imported.ts (startTraining, advanceTrainingCursor, getNextTrainingRouteId, isTrainingMode, stopTraining)
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-114 - Wire Training Queue into Continue-Training Navigation

```
- [x] Reviewed
  - ID: `CCP-114`
  - Task ID: `CCP-114`
  - Parent prompt ID: CCP-113
  - Batch prompt IDs: none
  - Source document: `docs/reference/lichess-puzzle-ux/STANDARD_PUZZLE_FLOW.md`
  - Source step: Post-completion continuation — "next puzzle" in training mode
  - Task: update onNext in index.ts to use training queue cursor for imported puzzles; stopTraining if user navigates off-queue
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-115 - Add "Start Training" Entry Point to Puzzle Library

```
- [x] Reviewed
  - ID: `CCP-115`
  - Task ID: `CCP-115`
  - Parent prompt ID: CCP-114
  - Batch prompt IDs: none
  - Source document: `docs/reference/lichess-puzzle-ux/FILTERS_THEMES_AND_SELECTION.md`
  - Source step: Training entry point — entering continuous solve mode from the library
  - Task: add "Start Training →" button to imported library header in view.ts; wire onStartTraining callback in index.ts
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-116 - Persist Filter Query State to IDB

```
- [x] Reviewed
  - ID: `CCP-116`
  - Task ID: `CCP-116`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/reference/lichess-puzzle-ux/FILTERS_THEMES_AND_SELECTION.md`
  - Source step: Filter persistence — filters survive page reload
  - Task: add savePuzzleQueryToIdb/loadPuzzleQueryFromIdb to idb/index.ts; save on filter change, restore on initPuzzles
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-117 - Show Active Training Context in Puzzle Round Side Panel

```
- [x] Reviewed
  - ID: `CCP-117`
  - Task ID: `CCP-117`
  - Parent prompt ID: CCP-116
  - Batch prompt IDs: none
  - Source document: `docs/reference/lichess-puzzle-ux/STANDARD_PUZZLE_FLOW.md`
  - Source step: Side panel — puzzle metadata and active training context
  - Task: render training context label (theme/rating range) in puzzle-round side panel for imported puzzles
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-118 - Phase 1 Puzzle Training Queue Manager (CCP-113–115)

```
- [x] Reviewed
  - ID: `CCP-118`
  - Task ID: `CCP-118`
  - Parent prompt ID: none
  - Batch prompt IDs: CCP-113, CCP-114, CCP-115
  - Source document: `docs/prompts/CLAUDE_PROMPT_QUEUE.md`
  - Source step: Phase 1 — sequential training queue
  - Task: manager prompt — run CCP-113, CCP-114, CCP-115 in order, verify build after each
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-119 - Phase 2 Puzzle Filter Persistence Manager (CCP-116–117)

```
- [x] Reviewed
  - ID: `CCP-119`
  - Task ID: `CCP-119`
  - Parent prompt ID: none
  - Batch prompt IDs: CCP-116, CCP-117
  - Source document: `docs/prompts/CLAUDE_PROMPT_QUEUE.md`
  - Source step: Phase 2 — filter persistence and training context
  - Task: manager prompt — run CCP-116, CCP-117 in order, verify build after each
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-120 - Configurable StockfishProtocol Engine Options

```
- [x] Reviewed
  - ID: `CCP-120`
  - Task ID: `CCP-120`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/SPRINT_BACKGROUND_BULK_REVIEW.md`
  - Source step: Sprint 0 — Make StockfishProtocol configurable
  - Task: add ProtocolConfig constructor param (threads?, hash?) to StockfishProtocol
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-121 - Background Review Engine Module Skeleton

```
- [x] Reviewed
  - ID: `CCP-121`
  - Task ID: `CCP-121`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/SPRINT_BACKGROUND_BULK_REVIEW.md`
  - Source step: Sprint 1-A — Background engine module skeleton
  - Task: create src/engine/reviewQueue.ts with background StockfishProtocol, queue types, public API stubs
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-122 - Per-Game Analysis Loop in reviewQueue.ts

```
- [x] Reviewed
  - ID: `CCP-122`
  - Task ID: `CCP-122`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/SPRINT_BACKGROUND_BULK_REVIEW.md`
  - Source step: Sprint 1-B — Per-game analysis loop
  - Task: implement enqueueBulkReview, per-game ctrl/cache, background batch analysis loop, getReviewProgress
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-123 - Route-Change Resilience in main.ts

```
- [x] Reviewed
  - ID: `CCP-123`
  - Task ID: `CCP-123`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/SPRINT_BACKGROUND_BULK_REVIEW.md`
  - Source step: Sprint 2 — Route-change resilience
  - Task: guard loadGame() and onChange(); remove gameAnalysisQueue; wire enqueueBulkReview
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-124 - Per-Game Progress Display in Games List

```
- [x] Reviewed
  - ID: `CCP-124`
  - Task ID: `CCP-124`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/SPRINT_BACKGROUND_BULK_REVIEW.md`
  - Source step: Sprint 3 — Per-game progress display
  - Task: add live progress badges to game rows and queue summary line above list
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-125 - Bulk Review Settings Submenu in Header

```
- [x] Reviewed
  - ID: `CCP-125`
  - Task ID: `CCP-125`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/SPRINT_BACKGROUND_BULK_REVIEW.md`
  - Source step: Sprint 4 — Bulk Review settings submenu
  - Task: add Review nav button with submenu for depth, auto-review, and queue controls
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-126 - Background Bulk Review Sprint Manager (CCP-120–125)

```
- [x] Reviewed
  - ID: `CCP-126`
  - Task ID: `CCP-126`
  - Parent prompt ID: none
  - Batch prompt IDs: CCP-120, CCP-121, CCP-122, CCP-123, CCP-124, CCP-125
  - Source document: `docs/mini-sprints/SPRINT_BACKGROUND_BULK_REVIEW.md`
  - Source step: full sprint — manager runs CCP-120 through CCP-125 in order
  - Task: manager prompt — run CCP-120 through CCP-125 sequentially, verify build after each
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-127 - Active Filter Summary Bar

```
- [x] Reviewed
  - ID: `CCP-127`
  - Task ID: `CCP-127`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: puzzle filter UI audit (planning session)
  - Source step: Sprint Prompt 1 — Active Filter Summary Bar
  - Task: add dismissible chip summary bar showing active puzzle filters
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-128 - Difficulty Preset Pills with Range Display

```
- [x] Reviewed
  - ID: `CCP-128`
  - Task ID: `CCP-128`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: puzzle filter UI audit (planning session)
  - Source step: Sprint Prompt 2 — Difficulty Preset Pills with Range Display
  - Task: replace difficulty <select> with pill buttons and live numeric range label
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-129 - Multi-Select Theme Filter Type and Logic

```
- [x] Reviewed
  - ID: `CCP-129`
  - Task ID: `CCP-129`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: puzzle filter UI audit (planning session)
  - Source step: Sprint Prompt 3 — Multi-Select Theme Filter Type and Logic
  - Task: change ImportedPuzzleFilters.theme:string to themes:string[]; update filter logic and IDB migration
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-130 - Multi-Select Theme Tile Grid View Update

```
- [x] Reviewed
  - ID: `CCP-130`
  - Task ID: `CCP-130`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: puzzle filter UI audit (planning session)
  - Source step: Sprint Prompt 4 — Multi-Select Theme Tile Grid View Update
  - Task: update renderThemeGrid() for multi-select; tiles toggle membership in themes array
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-131 - Custom Rating Range Number Inputs

```
- [x] Reviewed
  - ID: `CCP-131`
  - Task ID: `CCP-131`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: puzzle filter UI audit (planning session)
  - Source step: Sprint Prompt 5 — Custom Rating Range Number Inputs
  - Task: add min/max number inputs below preset pills for arbitrary rating bands
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-132 - Theme Category Collapse Toggle

```
- [x] Reviewed
  - ID: `CCP-132`
  - Task ID: `CCP-132`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: puzzle filter UI audit (planning session)
  - Source step: Sprint Prompt 6 — Theme Category Collapse Toggle
  - Task: per-category expand/collapse; Checkmate Patterns defaults collapsed
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-133 - Puzzle Filter Redesign Sprint Manager (CCP-127–132)

```
- [x] Reviewed
  - ID: `CCP-133`
  - Task ID: `CCP-133`
  - Parent prompt ID: none
  - Batch prompt IDs: CCP-127, CCP-128, CCP-129, CCP-130, CCP-131, CCP-132
  - Source document: puzzle filter UI audit (planning session)
  - Source step: manager prompt — run CCP-127 through CCP-132 in order
  - Task: manager prompt — puzzle filter redesign sprint, run all six child prompts sequentially
  - Claude used: no
  - Review outcome: passed
  - Review issues: none
```

## CCP-134 - Add Mistake Detection Config Owner

```
- [x] Reviewed
  - ID: `CCP-134`
  - Task ID: `CCP-134`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: inferred from user request in chat
  - Source step: `add a configurable Learn From Your Mistakes parameter model in Patzer`
  - Task: introduce a dedicated persisted config owner for Learn From Your Mistakes candidate selection without adding the menu yet
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-135 - Add Mistake Detection Menu Modal

```
- [x] Reviewed
  - ID: `CCP-135`
  - Task ID: `CCP-135`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: inferred from user request in chat
  - Source step: `add a main-menu Mistake Detection modal for Learn From Your Mistakes settings`
  - Task: add a main-menu `Mistake Detection` modal using the same style as the existing detection settings UI
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-136 - Wire Mistake Detection Config Into Retrospection

```
- [x] Reviewed
  - ID: `CCP-136`
  - Task ID: `CCP-136`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: inferred from user request in chat
  - Source step: `apply configurable mistake-detection parameters to Learn From Your Mistakes candidate selection`
  - Task: make Learn From Your Mistakes candidate selection read the new configurable parameters instead of hard-coded rules
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-137 - Apply Mistake Detection Changes To The Active Analysis Session

```
- [x] Reviewed
  - ID: `CCP-137`
  - Task ID: `CCP-137`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: inferred from user request in chat
  - Source step: `apply mistake-detection setting changes immediately on the active analysis board`
  - Task: make Mistake Detection setting changes apply coherently to the current analysis-board retrospection context
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-138 - Add Learn-Moment Reason Metadata

```
- [x] Reviewed
  - ID: `CCP-138`
  - Task ID: `CCP-138`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/reference/post-game-learning-opportunities-audit.md`
  - Source step: `Best next implementation direction — add reason metadata before expanding learnable-moment families`
  - Task: carry backend reason codes and human labels through retrospection and saved local puzzle candidates
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-139 - Show Learn-Moment Reason In Success UI

```
- [x] Reviewed
  - ID: `CCP-139`
  - Task ID: `CCP-139`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/reference/post-game-learning-opportunities-audit.md`
  - Source step: `Best next implementation direction — explain why a learnable moment was chosen`
  - Task: show backend learn-moment reasons in retrospection and saved-puzzle terminal feedback using parameter language
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-140 - Add Collapse Family To Mistake Detection

```
- [x] Reviewed
  - ID: `CCP-140`
  - Task ID: `CCP-140`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/reference/post-game-learning-opportunities-audit.md`
  - Source step: `Best next implementation direction — promote blown wins / failed conversion into a first-class training lane`
  - Task: extend Mistake Detection with an optional blown-win / failed-conversion family, defaulting it off
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-141 - Add Defensive Resource Family To Mistake Detection

```
- [x] Reviewed
  - ID: `CCP-141`
  - Task ID: `CCP-141`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/reference/post-game-learning-opportunities-audit.md`
  - Source step: `Best next implementation direction — add missed defensive resources as a separate learnable-moment family`
  - Task: add a narrow optional defensive-resource detector to Mistake Detection so missed saves can become learnable moments
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```

## CCP-142 - Add Punish-The-Blunder Family To Mistake Detection

```
- [x] Reviewed
  - ID: `CCP-142`
  - Task ID: `CCP-142`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/reference/post-game-learning-opportunities-audit.md`
  - Source step: `Best next implementation direction — add punish-the-blunder moments as a separate learnable family`
  - Task: add an optional family for moments where the opponent erred and the user failed to exploit it
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
  - Execution target: `Claude Code`
```


## CCP-150 - Add Puzzle Library Route Owner

```
- [x] Reviewed
  - ID: `CCP-150`
  - Task ID: `CCP-150`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
  - Source step: `Phase 1 — Minimal Puzzle Product Shell / Task 1`
  - Task: add a dedicated puzzle product route owner without rebuilding the full round UI
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```


## CCP-151 - Render Top-Level Puzzle Source Navigator

```
- [x] Reviewed
  - ID: `CCP-151`
  - Task ID: `CCP-151`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
  - Source step: `Phase 1 — Minimal Puzzle Product Shell / Task 2`
  - Task: render the first real puzzle-library surface with Imported Puzzles and User Library source sections
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```


## CCP-152 - Open Minimal Puzzle Round From Canonical Puzzle Definition

```
- [x] Reviewed
  - ID: `CCP-152`
  - Task ID: `CCP-152`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
  - Source step: `Phase 1 — Minimal Puzzle Product Shell / Task 3`
  - Task: make selecting a canonical puzzle open a minimal dedicated round context
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```


## CCP-153 - Add Puzzle Board Layout Shell

```
- [x] Reviewed
  - ID: `CCP-153`
  - Task ID: `CCP-153`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
  - Source step: `Phase 1 — Minimal Puzzle Product Shell / Task 4`
  - Task: add the dedicated puzzle board page shell on top of the shared board subsystem
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```


## CCP-155 - Add Puzzle Round Controller

```
- [ ] Reviewed
  - ID: `CCP-155`
  - Task ID: `CCP-155`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
  - Source step: `Phase 2 — Strict Puzzle Solve Loop / Task 1`
  - Task: introduce the smallest real controller for puzzle-round state and transitions
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
```


## CCP-156 - Validate Strict Solution Moves And Auto-Reply

```
- [ ] Reviewed
  - ID: `CCP-156`
  - Task ID: `CCP-156`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
  - Source step: `Phase 2 — Strict Puzzle Solve Loop / Task 2`
  - Task: enforce stored-solution move validation and scripted opponent replies
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
```


## CCP-157 - Persist Puzzle Attempt Results

```
- [ ] Reviewed
  - ID: `CCP-157`
  - Task ID: `CCP-157`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
  - Source step: `Phase 2 — Strict Puzzle Solve Loop / Task 3`
  - Task: persist puzzle-round outcomes into the canonical attempt-history model
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
```


## CCP-158 - Render Puzzle Result States And Navigation

```
- [ ] Reviewed
  - ID: `CCP-158`
  - Task ID: `CCP-158`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
  - Source step: `Phase 2 — Strict Puzzle Solve Loop / Task 4`
  - Task: show clean/recovered/assisted/skipped result UI and next-navigation controls
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
```


## CCP-160 - Add Puzzle-Mode Engine Runtime Owner

```
- [ ] Reviewed
  - ID: `CCP-160`
  - Task ID: `CCP-160`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
  - Source step: `Phase 3 — Engine Assist Layer / Task 1`
  - Task: introduce a puzzle-owned engine runtime seam without replacing strict puzzle correctness
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
```


## CCP-161 - Add PuzzleMoveQuality Evaluation Layer

```
- [ ] Reviewed
  - ID: `CCP-161`
  - Task ID: `CCP-161`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
  - Source step: `Phase 3 — Engine Assist Layer / Task 2`
  - Task: compute Patzer-specific move-quality feedback separately from strict solution validation
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
```


## CCP-162 - Log Assisted-Solve And Reveal Reasons

```
- [ ] Reviewed
  - ID: `CCP-162`
  - Task ID: `CCP-162`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
  - Source step: `Phase 3 — Engine Assist Layer / Task 3`
  - Task: record engine-reveal, hint, and other assist reasons in puzzle attempt history
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
```


## CCP-163 - Render Eval-Delta Feedback For Non-Best Moves

```
- [ ] Reviewed
  - ID: `CCP-163`
  - Task ID: `CCP-163`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
  - Source step: `Phase 3 — Engine Assist Layer / Task 4`
  - Task: show solver-perspective eval deltas and better/worse/best feedback on the puzzle board
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
```


## CCP-165 - Save Learn From Your Mistakes Moments Into User Library

```
- [ ] Reviewed
  - ID: `CCP-165`
  - Task ID: `CCP-165`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
  - Source step: `Phase 4 — User Library Authoring / Task 1`
  - Task: save selected retrospection moments into the canonical user puzzle library
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
```


## CCP-166 - Bulk-Save Missed Moments After Review

```
- [ ] Reviewed
  - ID: `CCP-166`
  - Task ID: `CCP-166`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
  - Source step: `Phase 4 — User Library Authoring / Task 2`
  - Task: add the focused bulk-save path for failed or missed Learn From Your Mistakes moments
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
```


## CCP-167 - Add Move-List Create-Puzzle Flow

```
- [ ] Reviewed
  - ID: `CCP-167`
  - Task ID: `CCP-167`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
  - Source step: `Phase 4 — User Library Authoring / Task 3`
  - Task: add the right-click move-list flow for creating user puzzles from analysis positions
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
```


## CCP-168 - Add Flat Collections, Notes, Tags, And Favorites

```
- [ ] Reviewed
  - ID: `CCP-168`
  - Task ID: `CCP-168`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
  - Source step: `Phase 4 — User Library Authoring / Task 4`
  - Task: add the first user-library organization layer on top of canonical puzzle records
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
```


## CCP-170 - Add Retry-Failed-Earlier Queue

```
- [ ] Reviewed
  - ID: `CCP-170`
  - Task ID: `CCP-170`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
  - Source step: `Phase 5 — Repetition And Imported-Library Scale / Task 1`
  - Task: add the first repetition-oriented queue using failed/assisted puzzle outcomes
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
```


## CCP-171 - Add Minimal Due-Again Metadata And Filters

```
- [ ] Reviewed
  - ID: `CCP-171`
  - Task ID: `CCP-171`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
  - Source step: `Phase 5 — Repetition And Imported-Library Scale / Task 2`
  - Task: add lightweight due-again metadata and filtering without a full scheduler
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
```


## CCP-172 - Improve Imported Puzzle Library Filtering And Loading Scale

```
- [ ] Reviewed
  - ID: `CCP-172`
  - Task ID: `CCP-172`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
  - Source step: `Phase 5 — Repetition And Imported-Library Scale / Task 3`
  - Task: improve imported-library loading and filter behavior once the product shell is stable
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
```


## CCP-173 - Add Future Hooks For Rated Puzzle Mode

```
- [ ] Reviewed
  - ID: `CCP-173`
  - Task ID: `CCP-173`
  - Parent prompt ID: none
  - Batch prompt IDs: none
  - Source document: `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
  - Source step: `Phase 5 — Repetition And Imported-Library Scale / Task 4`
  - Task: add non-user-facing rated-mode hooks without implementing rating progression yet
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
```


## CCP-154 - Puzzle V1 Phase 1 Batch Manager

```
- [x] Reviewed
  - ID: `CCP-154`
  - Task ID: `CCP-154`
  - Parent prompt ID: none
  - Batch prompt IDs: `CCP-150`, `CCP-151`, `CCP-152`, `CCP-153`
  - Source document: `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
  - Source step: `Phase 1 — Minimal Puzzle Product Shell / manager prompt`
  - Task: execute Puzzle V1 phase batch manager for `CCP-150`, `CCP-151`, `CCP-152`, `CCP-153`
  - Claude used: yes
  - Review outcome: passed
  - Review issues: none
```


## CCP-159 - Puzzle V1 Phase 2 Batch Manager

```
- [ ] Reviewed
  - ID: `CCP-159`
  - Task ID: `CCP-159`
  - Parent prompt ID: none
  - Batch prompt IDs: `CCP-155`, `CCP-156`, `CCP-157`, `CCP-158`
  - Source document: `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
  - Source step: `Phase 2 — Strict Puzzle Solve Loop / manager prompt`
  - Task: execute Puzzle V1 phase batch manager for `CCP-155`, `CCP-156`, `CCP-157`, `CCP-158`
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
```


## CCP-164 - Puzzle V1 Phase 3 Batch Manager

```
- [ ] Reviewed
  - ID: `CCP-164`
  - Task ID: `CCP-164`
  - Parent prompt ID: none
  - Batch prompt IDs: `CCP-160`, `CCP-161`, `CCP-162`, `CCP-163`
  - Source document: `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
  - Source step: `Phase 3 — Engine Assist Layer / manager prompt`
  - Task: execute Puzzle V1 phase batch manager for `CCP-160`, `CCP-161`, `CCP-162`, `CCP-163`
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
```


## CCP-169 - Puzzle V1 Phase 4 Batch Manager

```
- [ ] Reviewed
  - ID: `CCP-169`
  - Task ID: `CCP-169`
  - Parent prompt ID: none
  - Batch prompt IDs: `CCP-165`, `CCP-166`, `CCP-167`, `CCP-168`
  - Source document: `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
  - Source step: `Phase 4 — User Library Authoring / manager prompt`
  - Task: execute Puzzle V1 phase batch manager for `CCP-165`, `CCP-166`, `CCP-167`, `CCP-168`
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
```


## CCP-174 - Puzzle V1 Phase 5 Batch Manager

```
- [ ] Reviewed
  - ID: `CCP-174`
  - Task ID: `CCP-174`
  - Parent prompt ID: none
  - Batch prompt IDs: `CCP-170`, `CCP-171`, `CCP-172`, `CCP-173`
  - Source document: `docs/mini-sprints/PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`
  - Source step: `Phase 5 — Repetition And Imported-Library Scale / manager prompt`
  - Task: execute Puzzle V1 phase batch manager for `CCP-170`, `CCP-171`, `CCP-172`, `CCP-173`
  - Claude used: no
  - Review outcome: pending
  - Review issues: none
```
