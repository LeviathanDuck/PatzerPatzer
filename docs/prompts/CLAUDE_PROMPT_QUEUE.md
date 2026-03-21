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

- CCP-083: Establish Puzzle Route Ownership
  - Create a real puzzle module seam and route surface so `#/puzzles` no longer depends on placeholder logic in `src/main.ts`.

- CCP-084: Add Puzzle Round Model
  - Introduce Patzer-owned puzzle-round types and a compatibility seam from saved `PuzzleCandidate` records.

- CCP-085: Render Saved Puzzle Library
  - Replace the placeholder puzzles page with a real saved-puzzle list backed by existing local IDB state.

- CCP-086: Add Puzzle Round Controller
  - Create a dedicated puzzle controller for active round state before wiring the full solve loop.

- CCP-087: Validate Puzzle Moves And Auto-Reply
  - Route puzzle-mode board moves through strict solution checking and scripted opponent replies.

- CCP-088: Add Puzzle Feedback And Round Controls
  - Add puzzle-specific feedback and after-round controls instead of reusing generic analysis chrome.

- CCP-089: Add Puzzle Side Panel Metadata
  - Add a lightweight metadata panel for source-game and puzzle context using only data Patzer already owns.

- CCP-090: Persist Local Puzzle Session
  - Save lightweight local puzzle session progress so saved-puzzle rounds can continue cleanly across reloads.

- CCP-091: Tighten Review-To-Puzzle Integration
  - Make Patzer’s game-review and saved-puzzle flow feel like one coherent local workflow.

## Queue

## CCP-083 - Establish Puzzle Route Ownership

```
Prompt ID: CCP-083
Task ID: CCP-083
Source Document: docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md
Source Step: Task 1 — Establish real puzzle module ownership and route surface
Execution Target: Claude Code

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle / routing / main-shell files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: take the first smallest safe step toward a real puzzles page by creating an owned puzzle module seam and routing `#/puzzles` through it instead of keeping puzzle-page behavior as placeholder logic inside `src/main.ts`.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - how Patzer currently routes and renders the puzzles page
   - what puzzle-specific ownership Lichess gives its puzzle controller/view layer
   - what the smallest safe Patzer ownership seam is today
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- Keep this scoped to ownership and route surface only.
- Do not implement the solve loop, feedback UI, or public-dataset ingestion in this task.
- Do not bundle broad analysis-page cleanup.
- Do not add substantial new puzzle logic to `src/main.ts`.

Relevant current code areas to inspect first:
- `src/main.ts`
- `src/router.ts`
- `src/puzzles/extract.ts`
- `src/idb/index.ts`

Relevant Lichess source to inspect first:
- `~/Development/lichess-source/lila/ui/puzzle/src/ctrl.ts`
- `~/Development/lichess-source/lila/ui/puzzle/src/view/main.ts`

Current audit-grounded diagnosis to confirm first:
- Patzer already has puzzle extraction and persistence, but no real puzzle page owner.
- `#/puzzles` is still effectively a placeholder route.
- Lichess treats puzzles as a dedicated controller/view subsystem, not as analysis-page residue.

Likely safe direction:
- create a real Patzer-owned seam in `src/puzzles/` such as `ctrl.ts` / `view.ts` or the closest equivalent that fits the current repo
- route `#/puzzles` through that seam
- keep the first rendered surface intentionally minimal

What I want from you:
- first provide the required pre-implementation output:
  1. relevant Patzer Pro files
  2. relevant Lichess files
  3. exact diagnosis
  4. exact small step to implement
  5. why that step is safely scoped
- then implement the change
- then validate it

Validation requirements:
- run `npm run build`
- run the most relevant task-specific check you can
- provide a short manual test checklist with concrete user actions and expected results
- explicitly report:
  - Prompt ID
  - Task ID
  - build result
  - feature-specific smoke tests
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks or limitations
```

## CCP-084 - Add Puzzle Round Model

```
Prompt ID: CCP-084
Task ID: CCP-084
Source Document: docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md
Source Step: Task 2 — Introduce a richer puzzle round model without breaking saved candidates
Execution Target: Claude Code

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle-type / tree-type / IDB files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: introduce a Patzer-owned puzzle-round model and a compatibility seam from persisted `PuzzleCandidate` records, without breaking existing saved-puzzle data or bundling route/UI work.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - what Patzer currently stores in `PuzzleCandidate`
   - what Lichess puzzle data and move-tree structures actually require
   - what the smallest safe Patzer round model is for the next puzzle steps
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- Keep this scoped to types / conversion / persistence compatibility.
- Do not implement puzzle solving UI in this task.
- Do not redesign the entire IDB layer.
- Do not overload `src/tree/types.ts` with large puzzle-only behavior if a `src/puzzles/` type owner is cleaner.

Relevant current code areas to inspect first:
- `src/tree/types.ts`
- `src/puzzles/extract.ts`
- `src/idb/index.ts`
- any new `src/puzzles/*` files created by the previous task

Relevant Lichess source to inspect first:
- `~/Development/lichess-source/lila/ui/puzzle/src/interfaces.ts`
- `~/Development/lichess-source/lila/ui/puzzle/src/moveTree.ts`

Current audit-grounded diagnosis to confirm first:
- `PuzzleCandidate` is enough for extraction and save actions, but not enough for a full puzzle round.
- Patzer needs a dedicated puzzle-round model before controller, validation, and session work can land cleanly.

Likely safe direction:
- add `src/puzzles/types.ts` or the closest equivalent
- keep `PuzzleCandidate` compatibility explicit
- add a small conversion seam from saved candidates into the richer round shape

What I want from you:
- first provide the required pre-implementation output:
  1. relevant Patzer Pro files
  2. relevant Lichess files
  3. exact diagnosis
  4. exact small step to implement
  5. why that step is safely scoped
- then implement the change
- then validate it

Validation requirements:
- run `npm run build`
- run the most relevant task-specific check you can
- provide a short manual test checklist with concrete user actions and expected results
- explicitly report:
  - Prompt ID
  - Task ID
  - build result
  - type / persistence compatibility results
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks or limitations
```

## CCP-085 - Render Saved Puzzle Library

```
Prompt ID: CCP-085
Task ID: CCP-085
Source Document: docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md
Source Step: Task 3 — Replace the placeholder puzzles route with a saved-puzzle library view
Execution Target: Claude Code

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle route / puzzle view / IDB-backed library files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: replace the placeholder puzzles page with a real saved-puzzle library view backed by current local IDB state, while keeping the page focused on browsing rather than full round solving.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - how Patzer currently stores and exposes saved puzzles
   - how Lichess puzzle pages present a puzzle-focused entry surface
   - what the smallest honest saved-puzzle library surface is for Patzer now
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- Keep this scoped to the saved-puzzle library page.
- Do not implement the full round solve loop in this task.
- Do not invent fake rating / theme / popularity metadata Patzer does not own.
- Do not pull in the public Lichess puzzle database.

Relevant current code areas to inspect first:
- `src/main.ts`
- `src/idb/index.ts`
- `src/puzzles/extract.ts`
- current `src/puzzles/*` module files

Relevant Lichess source to inspect first:
- `~/Development/lichess-source/lila/ui/puzzle/src/view/main.ts`
- `~/Development/lichess-source/lila/ui/puzzle/src/view/side.ts`

Current audit-grounded diagnosis to confirm first:
- Patzer already persists saved puzzles locally.
- The user still cannot browse those puzzles on a real page.
- The smallest valuable next step is a local library surface, not public catalog expansion.

Likely safe direction:
- render a list of saved puzzles on `#/puzzles`
- show honest local metadata such as source game, move context, and loss severity where available
- prepare a clean selection seam for the later round controller

What I want from you:
- first provide the required pre-implementation output:
  1. relevant Patzer Pro files
  2. relevant Lichess files
  3. exact diagnosis
  4. exact small step to implement
  5. why that step is safely scoped
- then implement the change
- then validate it

Validation requirements:
- run `npm run build`
- run the most relevant task-specific check you can
- provide a short manual test checklist with concrete user actions and expected results
- explicitly report:
  - Prompt ID
  - Task ID
  - build result
  - saved-puzzle library behavior
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks or limitations
```

## CCP-086 - Add Puzzle Round Controller

```
Prompt ID: CCP-086
Task ID: CCP-086
Source Document: docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md
Source Step: Task 4 — Add a minimal puzzle round controller
Execution Target: Claude Code

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle controller / board integration / route-selection files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: create a dedicated minimal puzzle round controller that owns active puzzle state, phase, and solution progress before the full solve loop is wired into the board.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - how Patzer currently owns analysis and retrospection session state
   - how Lichess `PuzzleCtrl` owns round state separately from generic board rendering
   - what the smallest clean Patzer controller seam is
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- Keep this scoped to controller ownership and minimal state only.
- Do not yet wire full move validation or scripted replies.
- Do not reimplement the entire retrospection controller.
- Do not add substantial puzzle state logic to `src/main.ts`.

Relevant current code areas to inspect first:
- `src/analyse/ctrl.ts`
- `src/analyse/retroCtrl.ts`
- current `src/puzzles/*` files
- `src/board/index.ts` only as needed to avoid future coupling mistakes

Relevant Lichess source to inspect first:
- `~/Development/lichess-source/lila/ui/puzzle/src/ctrl.ts`
- `~/Development/lichess-source/lila/ui/puzzle/src/interfaces.ts`

Current audit-grounded diagnosis to confirm first:
- Patzer has puzzle-adjacent data but no puzzle-specific controller.
- Without that controller, validation, feedback, and session state would leak into unrelated modules.

Likely safe direction:
- add a minimal `PuzzleCtrl`-style owner in `src/puzzles/`
- keep the initial surface narrow: active puzzle, phase, current move index, solved/failed flags
- let later tasks build on that seam

What I want from you:
- first provide the required pre-implementation output:
  1. relevant Patzer Pro files
  2. relevant Lichess files
  3. exact diagnosis
  4. exact small step to implement
  5. why that step is safely scoped
- then implement the change
- then validate it

Validation requirements:
- run `npm run build`
- run the most relevant task-specific check you can
- provide a short manual test checklist with concrete user actions and expected results
- explicitly report:
  - Prompt ID
  - Task ID
  - build result
  - puzzle-controller state behavior
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks or limitations
```

## CCP-087 - Validate Puzzle Moves And Auto-Reply

```
Prompt ID: CCP-087
Task ID: CCP-087
Source Document: docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md
Source Step: Task 5 — Route board moves through strict puzzle validation and scripted replies
Execution Target: Claude Code

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle controller / board move-handling / tree path files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: wire puzzle-mode board moves through strict solution validation and scripted reply playback, keeping the solve loop puzzle-owned rather than analysis-owned.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - how Patzer currently accepts user moves on the board
   - how the retrospection flow judges candidate moves today
   - how Lichess puzzle move validation and reply sequencing work
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- Keep this scoped to puzzle-mode move validation and auto-replies.
- Do not add live-engine hints or public-dataset logic.
- Do not break normal analysis-board move handling.
- Preserve existing board reuse where possible, but keep puzzle rules puzzle-owned.

Relevant current code areas to inspect first:
- `src/board/index.ts`
- `src/analyse/retroCtrl.ts`
- current `src/puzzles/*` files
- `src/tree/ops.ts` or related move-tree helpers if needed

Relevant Lichess source to inspect first:
- `~/Development/lichess-source/lila/ui/puzzle/src/moveTest.ts`
- `~/Development/lichess-source/lila/ui/puzzle/src/view/chessground.ts`
- `~/Development/lichess-source/lila/ui/puzzle/src/ctrl.ts`

Current audit-grounded diagnosis to confirm first:
- the biggest missing puzzle behavior is not rendering, it is sequence-aware move validation
- a correct user move must advance the round
- expected reply moves must be played automatically
- a wrong move must fail the round cleanly

Likely safe direction:
- route puzzle-mode user moves through a controller method
- compare them against the expected solution move
- auto-play required reply moves after correct progress
- keep normal analysis-mode user move handling unchanged

What I want from you:
- first provide the required pre-implementation output:
  1. relevant Patzer Pro files
  2. relevant Lichess files
  3. exact diagnosis
  4. exact small step to implement
  5. why that step is safely scoped
- then implement the change
- then validate it

Validation requirements:
- run `npm run build`
- run the most relevant task-specific check you can
- provide a short manual test checklist with concrete user actions and expected results
- explicitly report:
  - Prompt ID
  - Task ID
  - build result
  - puzzle move-validation behavior
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks or limitations
```

## CCP-088 - Add Puzzle Feedback And Round Controls

```
Prompt ID: CCP-088
Task ID: CCP-088
Source Document: docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md
Source Step: Task 6 — Add puzzle feedback and round controls
Execution Target: Claude Code

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle view / feedback / control-bar files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: add puzzle-specific feedback and round controls for correct / wrong / solved / next / view-solution states instead of leaning on generic analysis-board UI.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - how Patzer currently renders analysis and retrospection feedback
   - how Lichess puzzle feedback and after-round controls are separated from board rendering
   - what the smallest honest Patzer puzzle feedback surface is now
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- Keep this scoped to puzzle feedback and control UI.
- Do not redesign the whole analysis tools column.
- Do not bundle session history or public puzzle metadata.
- Keep the UI honest about the local-only puzzle scope.

Relevant current code areas to inspect first:
- `src/analyse/retroView.ts`
- current `src/puzzles/*` files
- any small main-shell render seam only if required

Relevant Lichess source to inspect first:
- `~/Development/lichess-source/lila/ui/puzzle/src/view/feedback.ts`
- `~/Development/lichess-source/lila/ui/puzzle/src/view/after.ts`
- `~/Development/lichess-source/lila/ui/puzzle/src/view/main.ts`

Current audit-grounded diagnosis to confirm first:
- once solve validation exists, Patzer still needs puzzle-native feedback
- this should not be hidden inside generic analysis controls
- Lichess treats puzzle feedback as first-class stateful UI

Likely safe direction:
- add a dedicated feedback strip or panel in `src/puzzles/view.ts`
- support at least: find, wrong, solved, view solution, and next puzzle states
- keep the first UI compact and local-puzzle focused

What I want from you:
- first provide the required pre-implementation output:
  1. relevant Patzer Pro files
  2. relevant Lichess files
  3. exact diagnosis
  4. exact small step to implement
  5. why that step is safely scoped
- then implement the change
- then validate it

Validation requirements:
- run `npm run build`
- run the most relevant task-specific check you can
- provide a short manual test checklist with concrete user actions and expected results
- explicitly report:
  - Prompt ID
  - Task ID
  - build result
  - puzzle feedback/control behavior
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks or limitations
```

## CCP-089 - Add Puzzle Side Panel Metadata

```
Prompt ID: CCP-089
Task ID: CCP-089
Source Document: docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md
Source Step: Task 7 — Add the puzzle metadata / side-panel surface
Execution Target: Claude Code

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle view / metadata / source-game link files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: add a lightweight puzzle metadata side panel using source-game and puzzle context that Patzer already owns, without inventing public puzzle-catalog semantics.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - what metadata Patzer already has for saved puzzles
   - how Lichess uses side-panel context to orient the user
   - what the smallest honest Patzer metadata surface is
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- Keep this scoped to metadata display.
- Do not invent ratings, vote counts, or theme tags that Patzer does not own.
- Do not bundle session persistence or new routing systems.

Relevant current code areas to inspect first:
- `src/idb/index.ts`
- `src/puzzles/extract.ts`
- current `src/puzzles/*` files
- `src/games/view.ts` only if existing game-row metadata helps the display

Relevant Lichess source to inspect first:
- `~/Development/lichess-source/lila/ui/puzzle/src/view/side.ts`
- `~/Development/lichess-source/lila/ui/puzzle/src/interfaces.ts`

Current audit-grounded diagnosis to confirm first:
- puzzle rounds need context, but Patzer should only show data it genuinely has
- a small metadata surface improves orientation without pretending the app already has a public puzzle catalog

Likely safe direction:
- add a compact side panel with source-game, move context, side to move, loss severity, and related local fields where available
- leave absent fields absent rather than faking them

What I want from you:
- first provide the required pre-implementation output:
  1. relevant Patzer Pro files
  2. relevant Lichess files
  3. exact diagnosis
  4. exact small step to implement
  5. why that step is safely scoped
- then implement the change
- then validate it

Validation requirements:
- run `npm run build`
- run the most relevant task-specific check you can
- provide a short manual test checklist with concrete user actions and expected results
- explicitly report:
  - Prompt ID
  - Task ID
  - build result
  - metadata-panel behavior
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks or limitations
```

## CCP-090 - Persist Local Puzzle Session

```
Prompt ID: CCP-090
Task ID: CCP-090
Source Document: docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md
Source Step: Task 8 — Persist lightweight local puzzle session state
Execution Target: Claude Code

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same puzzle session / local persistence / IDB files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: persist a lightweight local puzzle session so saved-puzzle progress can survive reloads and continue cleanly, without introducing account or server assumptions.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - how Patzer currently persists local state for analysis and saved puzzles
   - how Lichess puzzle session state stays lightweight and user-oriented
   - what the smallest safe Patzer session record is
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- Keep this scoped to lightweight local session state.
- Do not redesign the whole puzzle store.
- Do not introduce server, account, or rating assumptions.
- Do not bundle broad review-data persistence changes.

Relevant current code areas to inspect first:
- `src/idb/index.ts`
- current `src/puzzles/*` files
- `src/main.ts` only for the minimum restore seam if required

Relevant Lichess source to inspect first:
- `~/Development/lichess-source/lila/ui/puzzle/src/session.ts`
- `~/Development/lichess-source/lila/ui/puzzle/src/ctrl.ts`

Current audit-grounded diagnosis to confirm first:
- Patzer already persists saved puzzles, but not a puzzle session
- a light local session is a natural fit for the current browser-local architecture

Likely safe direction:
- add a small local session record for recent solved/failed rounds and active-round continuity
- keep persistence explicit and minimal

What I want from you:
- first provide the required pre-implementation output:
  1. relevant Patzer Pro files
  2. relevant Lichess files
  3. exact diagnosis
  4. exact small step to implement
  5. why that step is safely scoped
- then implement the change
- then validate it

Validation requirements:
- run `npm run build`
- run the most relevant task-specific check you can
- provide a short manual test checklist with concrete user actions and expected results
- explicitly report:
  - Prompt ID
  - Task ID
  - build result
  - local puzzle-session behavior
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks or limitations
```

## CCP-091 - Tighten Review-To-Puzzle Integration

```
Prompt ID: CCP-091
Task ID: CCP-091
Source Document: docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md
Source Step: Task 9 — Tighten review-to-puzzle integration
Execution Target: Claude Code

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same review / retrospection / saved-puzzle integration files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: tighten the bridge from Patzer’s game-review flow to its saved-puzzle flow so the puzzle page feels like a direct downstream tool of review data rather than a parallel subsystem.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - how Patzer currently extracts and saves puzzle candidates from review data
   - how Patzer retrospection already models per-candidate solving
   - what the smallest honest review-to-puzzle integration improvement is now
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- Keep this scoped to the review-to-puzzle bridge.
- Do not start public-dataset ingestion work.
- Do not collapse retrospection and puzzles into one controller unless the code clearly supports that as a tiny safe step.
- Preserve the current analysis-board behavior outside the targeted integration seam.

Relevant current code areas to inspect first:
- `src/puzzles/extract.ts`
- `src/analyse/retroCtrl.ts`
- `src/analyse/retroView.ts`
- `src/idb/index.ts`
- current `src/puzzles/*` files

Relevant Lichess source to inspect first:
- `~/Development/lichess-source/lila/ui/puzzle/src/ctrl.ts`
- `~/Development/lichess-source/lila/ui/puzzle/src/moveTree.ts`

Current audit-grounded diagnosis to confirm first:
- Patzer’s real product advantage is review-driven practice, not just a generic puzzle page
- the saved-puzzle flow should feel like a clean continuation of Game Review output

Likely safe direction:
- improve the explicit handoff from extracted/saved candidates into the puzzle page or controller
- keep the bridge local and data-driven
- avoid any broader architecture merge that is larger than this task requires

What I want from you:
- first provide the required pre-implementation output:
  1. relevant Patzer Pro files
  2. relevant Lichess files
  3. exact diagnosis
  4. exact small step to implement
  5. why that step is safely scoped
- then implement the change
- then validate it

Validation requirements:
- run `npm run build`
- run the most relevant task-specific check you can
- provide a short manual test checklist with concrete user actions and expected results
- explicitly report:
  - Prompt ID
  - Task ID
  - build result
  - review-to-puzzle integration behavior
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - remaining risks or limitations
```
