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

- CCP-079: Reduce Board Review Glyph Scale To 20 Percent
  - Shrink the on-board review glyph SVG badges by changing their current 40% scale to 20% while preserving the existing stack behavior.

- CCP-066-F1: Add Underboard Games Search Bar
  - Add the missing search bar to the compact games list beneath the analysis board without reopening the broader Games-page search scope.

- CCP-070: Add Lichess Review Glyph SVG Layer
  - Copy the Lichess on-board move-annotation glyph SVG system into a Patzer-owned module without wiring it into the board yet.

- CCP-071: Render Review Glyphs On The Board
  - Wire Lichess-style review glyph SVG badges onto the analysis board using destination-square anchoring and stacking like Lichess.

- CCP-072: Add Review Glyph Board Toggle
  - Add an engine-settings toggle for board review glyphs, default it on, and persist it cleanly.

- CCP-073: Clear Board And Ceval Typecheck Slice
  - Resolve the first cohesive current typecheck slice across board, ceval, and engine files without trying to clear the whole backlog.

- CCP-074: Clear Import And Shell Typecheck Slice
  - Resolve the remaining current typecheck slice across games, imports, keyboard, router, and main-shell files.

- CCP-075: Make Board Resize Handle Safari-Reliable
  - Fix the analysis-board resize handle so it appears and works reliably in Safari.

- CCP-076: Make Book-Aware Retrospection Cancellation Live
  - Wire the existing opening-provider seam into active retrospection so theory/book moves are actually skipped.

- CCP-077: Finish Eval Graph Hover And Scrub Behavior
  - Tighten the eval-graph hover and scrub interaction so graph-driven inspection works as intended.

- CCP-078: Fix Move-List Context Menu Positioning
  - Fix the move-list variation context menu so it opens over the selected move instead of at the page origin.

## Queue

## CCP-079 - Reduce Board Review Glyph Scale To 20 Percent

```
Prompt ID: CCP-079
Task ID: CCP-079
Source Document: ad hoc user request
Source Step: reduce on-board review glyph SVG scale from 40% to 20%
Execution Target: Codex

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same board-glyph / board-draw / analysis SVG files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: Reduce the on-board move-review glyph badge scale from the current 40% down to 20%, while preserving the existing badge system and stack behavior.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - how Patzer currently renders board review glyph SVG badges
   - how Lichess sizes and positions those glyph badges
   - whether changing scale alone is sufficient or whether a tiny stack-offset adjustment is needed to keep the smaller badges positioned cleanly
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- Keep this scoped to board review glyph badge scale and any tiny directly-related positioning adjustment.
- Do not redesign the board review glyph system.
- Do not bundle settings, glyph asset rewrites, or unrelated board-shape changes.
- Do not add substantial new logic to `src/main.ts`.

Relevant current code areas to inspect first:
- `src/analyse/boardGlyphs.ts` — current SVG badge composition, transform scale, and stack offsets
- `src/engine/ctrl.ts` — current board review glyph shape injection seam, only to confirm no broader wiring change is needed

Relevant Lichess source to inspect first:
- `~/Development/lichess-source/lila/ui/lib/src/game/glyphs.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/autoShape.ts`

Current repo-grounded behavior to confirm first:
- Patzer currently composes board review glyph badges with `transform="matrix(.4 0 0 .4 ...)"`, meaning 40% scale
- the badges are currently stacked using `glyphStacktoPx(...)`
- this task is only to make them significantly smaller at 20% scale

Requested behavior:
- update the board review glyph badge scale to 20%
- preserve the same basic badge design and stacking behavior
- if a tiny offset tweak is needed so the smaller badges still sit cleanly on the square, keep that tweak minimal and explicit

What I want from you:
- first provide the required pre-implementation output:
  1. what part of the current codebase is relevant
  2. what Lichess files/systems are relevant
  3. the exact diagnosis
  4. the exact small step being implemented
  5. why that step is safe and correctly scoped
- then implement the change
- then validate it

Validation requirements:
- run `npm run build`
- run any task-specific checks you can
- explicitly report:
  - build result
  - feature-specific smoke tests
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - any remaining risks or limitations

Explicit behaviors to verify:
- board review glyph badges are now visibly smaller
- the badge scale is 20%
- stacked badges still place cleanly on the move destination square
- no unrelated board glyph or engine-arrow behavior is changed

Success criteria:
- on-board review glyph SVG badges use 20% scale
- the existing badge system remains intact
- no unrelated board behavior is changed
```

## CCP-066-F1 - Add Underboard Games Search Bar

```
Prompt ID: CCP-066-F1
Task ID: CCP-066
Parent Prompt ID: CCP-066
Source Document: docs/prompts/CLAUDE_PROMPT_LOG.md
Source Step: CCP-066 review issue — underboard list still has no search bar
Execution Target: Codex

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same games-list / underboard / filter files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: Add the missing search bar to the compact games list beneath the analysis board. This is a follow-up fix to `CCP-066`, whose review already confirmed the Games page has a search seam but the underboard list still does not.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - how Patzer currently renders the underboard compact game list
   - how Patzer currently filters/searches the Games page
   - whether Lichess has any comparable compact game-list filter pattern that is structurally useful
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- This is a follow-up fix to `CCP-066`, not a new search feature family.
- Keep the change scoped to adding search to the underboard compact game list.
- Do not reopen or redesign the full Games-page search/filter system unless a tiny shared helper extraction is clearly the safest way to avoid duplicated filtering.
- Do not add substantial new logic to `src/main.ts`.

Relevant current code areas to inspect first:
- `src/games/view.ts` — `renderGameList()` underboard compact list and existing Games-page filter state
- any relevant local styling in `src/styles/main.scss` for compact game-list controls

Current repo-grounded behavior to confirm first:
- `renderGameList()` currently renders only a header plus the list rows
- the Games page already has `gamesFilterOpponent` and `input.games-view__search`
- the reviewed `CCP-066` log explicitly says the underboard list still has no search bar

Requested behavior:
- add a search bar to the games list beneath the analysis board
- make it actually filter that compact list
- keep the UI compact and appropriate for the underboard surface
- preserve the existing Games-page search behavior unless a tiny shared seam is the safest fit

What I want from you:
- first provide the required pre-implementation output:
  1. what part of the current codebase is relevant
  2. what Lichess files/systems are relevant
  3. the exact diagnosis
  4. the exact small step being implemented
  5. why that step is safe and correctly scoped
- then implement the change
- then validate it

Validation requirements:
- run `npm run build`
- run any task-specific checks you can
- explicitly report:
  - build result
  - feature-specific smoke tests
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - any remaining risks or limitations

Explicit behaviors to verify:
- the underboard game list now shows a search bar
- typing filters the compact list beneath the analysis board
- selecting a filtered game still loads it correctly
- the existing Games-page search/filter behavior is not regressed

Success criteria:
- the underboard compact game list has a working search bar
- the fix stays scoped to the missing underboard surface
- no unrelated games-view behavior is changed
```

## CCP-070 - Add Lichess Review Glyph SVG Layer

```
Prompt ID: CCP-070
Task ID: CCP-070
Source Document: ad hoc user request
Source Step: copy Lichess board move-review glyph SVGs exactly into Patzer as the source glyph layer
Execution Target: Codex

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same board-draw / analysis-glyph / engine-display files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: Copy the Lichess move-review glyph SVG system exactly into Patzer as the source layer for future on-board review glyph rendering, without wiring it into the board yet.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - how Patzer currently represents move-review labels and PGN glyphs
   - how Lichess converts move glyphs into board-ready SVG annotation shapes
   - where the correct ownership seam should live in Patzer
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- This task is only about bringing over the Lichess review-glyph SVG source layer and shape-building helper.
- Copy the Lichess SVGs and stacking logic as faithfully as possible.
- Do not wire the glyphs into board rendering yet.
- Do not add the settings toggle yet.
- Do not add substantial new logic to `src/main.ts`.

Relevant current code areas to inspect first:
- `src/tree/types.ts` — current glyph data shape
- `src/tree/pgn.ts` — PGN glyph ingestion
- `src/analyse/moveList.ts` — current move-review / glyph display behavior
- `src/board/index.ts` and `src/engine/ctrl.ts` — current board shape seams, only to choose the future ownership boundary correctly

Relevant Lichess source to inspect first:
- `~/Development/lichess-source/lila/ui/lib/src/game/glyphs.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/autoShape.ts`
- any closely related Lichess tree/glyph type files needed to mirror the source behavior accurately

Current repo-grounded behavior to confirm first:
- Patzer already has move glyph/review data on nodes
- Patzer does not yet have a dedicated Lichess-style on-board glyph SVG module
- Lichess uses custom SVG badge shapes rather than plain text labels for the common review glyphs

Requested behavior:
- create the Patzer-side source module/helper for on-board review glyphs
- copy the Lichess SVG badge assets/definitions exactly where practical
- preserve:
  - destination-square anchoring assumptions
  - stack ordering
  - max visible glyph behavior
- stop before wiring it into the live board

What I want from you:
- first provide the required pre-implementation output:
  1. what part of the current codebase is relevant
  2. what Lichess files/systems are relevant
  3. the exact diagnosis
  4. the exact small step being implemented
  5. why that step is safe and correctly scoped
- then implement the change
- then validate it

Validation requirements:
- run `npm run build`
- run any task-specific checks you can
- explicitly report:
  - build result
  - feature-specific smoke tests
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - any remaining risks or limitations

Explicit behaviors to verify:
- Patzer now has a dedicated source/helper for Lichess-style board review glyph SVGs
- the copied glyph definitions are available for common review glyphs like `?!`, `?`, `??`, and `!`
- no board rendering behavior has changed yet

Success criteria:
- the Lichess review glyph SVG/source layer exists in Patzer
- it is not yet wired into live board rendering
- no unrelated behavior is changed
```

## CCP-071 - Render Review Glyphs On The Board

```
Prompt ID: CCP-071
Task ID: CCP-071
Source Document: ad hoc user request
Source Step: render Lichess-style move-review glyph SVGs on the analysis board in the same way Lichess does
Execution Target: Codex

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same board-draw / analysis-glyph / engine-arrow files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: Render move-review glyphs on the Patzer analysis board using the Lichess SVG badges and the same general board-annotation behavior Lichess uses.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - how Patzer currently builds board auto-shapes
   - how Lichess injects `annotationShapes(ctrl.node)` into board auto-shapes
   - how Patzer should scope review-glyph visibility relative to existing board arrows
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- This task is about board rendering only.
- Use the Lichess review glyph SVG behavior as the source of truth:
  - destination-square anchoring
  - stacked badge placement
  - common review glyph rendering
- Do not add the settings toggle in this task.
- Do not redesign all board-shape ownership unless a tiny extraction is clearly required.
- Do not add substantial new logic to `src/main.ts`.

Relevant current code areas to inspect first:
- the new glyph-source/helper introduced by the previous prompt
- `src/engine/ctrl.ts` — current board auto-shape construction seam
- `src/board/index.ts` — board draw integration and available shape hooks
- `src/tree/types.ts` and any current review-label/glyph consumers

Relevant Lichess source to inspect first:
- `~/Development/lichess-source/lila/ui/analyse/src/autoShape.ts`
- `~/Development/lichess-source/lila/ui/lib/src/game/glyphs.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/ctrl.ts`

Current repo-grounded behavior to confirm first:
- Patzer currently shows review information in the move list / eval graph, not as Lichess-style on-board SVG glyph badges
- Patzer already has a board-shape pipeline that can likely host these glyph shapes
- Lichess adds move annotations as board shapes for the current node when the setting is enabled

Requested behavior:
- render move-review glyphs on the analysis board itself
- use the copied Lichess SVG badges rather than inventing a new badge style
- anchor them to the move destination square and stack them the Lichess way
- keep the initial rendering behavior on by default unless the toggle layer later disables it

What I want from you:
- first provide the required pre-implementation output:
  1. what part of the current codebase is relevant
  2. what Lichess files/systems are relevant
  3. the exact diagnosis
  4. the exact small step being implemented
  5. why that step is safe and correctly scoped
- then implement the change
- then validate it

Validation requirements:
- run `npm run build`
- run any task-specific checks you can
- explicitly report:
  - build result
  - feature-specific smoke tests
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - any remaining risks or limitations

Explicit behaviors to verify:
- current-node review glyphs now appear on the board
- the badges use the Lichess-style SVG visuals rather than plain text
- the badges are anchored/stacked in the Lichess manner
- existing engine arrows and played arrows still behave correctly

Success criteria:
- Patzer renders Lichess-style board review glyphs on the analysis board
- the rendering is faithful to the Lichess badge system
- no unrelated board behavior is changed
```

## CCP-072 - Add Review Glyph Board Toggle

```
Prompt ID: CCP-072
Task ID: CCP-072
Source Document: ad hoc user request
Source Step: add an engine-settings toggle for board review glyphs and default it on
Execution Target: Codex

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same engine-settings / board-glyph / ceval-view files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: Add a toggle in the engine settings menu that turns the on-board review glyphs on or off. The setting should be on by default.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - how Patzer currently stores and renders other engine/board display toggles
   - how Lichess exposes the move-annotation-on-board setting
   - where the cleanest local ownership seam is for a persisted Patzer toggle
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- This task is only about the settings toggle and its persistence/wiring.
- The toggle should live in the existing engine settings menu.
- The toggle should default to on.
- Do not redesign the whole settings panel.
- Do not bundle unrelated engine-arrow setting cleanup.
- Do not add substantial new logic to `src/main.ts`.

Relevant current code areas to inspect first:
- `src/ceval/view.ts` — existing engine settings UI rows
- `src/engine/ctrl.ts` — existing persisted toggle patterns like arrows/labels/review labels
- the board review-glyph rendering seam introduced by the previous prompt(s)

Relevant Lichess source to inspect first:
- `~/Development/lichess-source/lila/ui/analyse/src/ctrl.ts`
- `~/Development/lichess-source/lila/ui/analyse/src/view/actionMenu.ts`
- any other local Lichess setting storage path relevant to show-move-annotation-on-board behavior

Current repo-grounded behavior to confirm first:
- Patzer already has an engine settings menu with checkbox toggles
- Patzer already persists several board/eval display toggles in localStorage
- the new on-board review glyphs should follow that same persistence pattern, but start enabled by default

Requested behavior:
- add a checkbox toggle for on-board review glyphs in the engine settings menu
- default it to on
- persist it cleanly
- when disabled, remove/hide the board review glyphs without disturbing unrelated board arrows or move-list review labels

What I want from you:
- first provide the required pre-implementation output:
  1. what part of the current codebase is relevant
  2. what Lichess files/systems are relevant
  3. the exact diagnosis
  4. the exact small step being implemented
  5. why that step is safe and correctly scoped
- then implement the change
- then validate it

Validation requirements:
- run `npm run build`
- run any task-specific checks you can
- explicitly report:
  - build result
  - feature-specific smoke tests
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - any remaining risks or limitations

Explicit behaviors to verify:
- board review glyphs are shown by default
- the new engine-settings toggle appears and can disable them
- turning the toggle back on restores them
- the setting persists across reload
- engine arrows and move-list review labels still behave correctly

Success criteria:
- Patzer has a persisted engine-settings toggle for board review glyphs
- it defaults on
- it only affects the on-board review glyph layer
```

## CCP-073 - Clear Board And Ceval Typecheck Slice

```
Prompt ID: CCP-073
Task ID: CCP-073
Source Document: docs/KNOWN_ISSUES.md
Source Step: [HIGH] `npm run typecheck` is wired but surfaces type errors
Execution Target: Codex

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same typecheck / board / ceval / engine files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: Clear the first cohesive current typecheck slice without trying to solve the entire repo-wide backlog.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement, when the affected files touch Lichess-aligned board or ceval behavior.
4. Compare:
   - the current real typecheck failures
   - the affected Patzer ownership seams
   - any relevant Lichess patterns for the touched board/ceval APIs
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- Do not try to clear the whole typecheck backlog in one prompt.
- Keep this slice scoped to the current board / ceval / engine-adjacent failures.
- Preserve runtime behavior.
- Do not bundle unrelated refactors.
- Do not add substantial new logic to `src/main.ts`.

Relevant current code areas to inspect first:
- `src/board/cosmetics.ts`
- `src/board/index.ts`
- `src/ceval/view.ts`
- `src/engine/ctrl.ts`

Current repo-grounded diagnosis to confirm first:
- `npm run typecheck -- --pretty false` currently fails in this slice on:
  - Snabbdom attrs/value typing in `src/board/cosmetics.ts`
  - exact-optional / Chessground config issues in `src/board/index.ts`
  - missing `Key` typing and exact-optional config issues in `src/ceval/view.ts`
  - undefined string / exact-optional issues in `src/engine/ctrl.ts`

What I want from you:
- first provide the required pre-implementation output:
  1. what part of the current codebase is relevant
  2. what Lichess files/systems are relevant
  3. the exact diagnosis
  4. the exact small step being implemented
  5. why that step is safe and correctly scoped
- then implement the change
- then validate it

Validation requirements:
- run `npm run build`
- run `npm run typecheck -- --pretty false`
- explicitly report:
  - build result
  - typecheck result
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - any remaining risks or limitations

Success criteria:
- this board/ceval/engine typecheck slice is cleared
- runtime behavior is unchanged
- the repo still builds
```

## CCP-074 - Clear Import And Shell Typecheck Slice

```
Prompt ID: CCP-074
Task ID: CCP-074
Source Document: docs/KNOWN_ISSUES.md
Source Step: [HIGH] `npm run typecheck` is wired but surfaces type errors
Execution Target: Codex

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same typecheck / games / import / router / main-shell files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: Clear the next cohesive current typecheck slice across games, imports, keyboard, router, and shell files without trying to solve the full repo backlog.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement where the touched behavior is Lichess-aligned.
4. Compare:
   - the current real typecheck failures in this slice
   - the current Patzer data contracts and shell ownership seams
   - any relevant Lichess patterns only where they meaningfully guide safer typing
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- Do not try to clear the whole typecheck backlog in one prompt.
- Keep this slice scoped to:
  - `src/games/view.ts`
  - `src/import/*.ts`
  - `src/keyboard.ts`
  - `src/router.ts`
  - `src/main.ts`
- Preserve runtime behavior.
- Avoid unrelated cleanup.

Current repo-grounded diagnosis to confirm first:
- `npm run typecheck -- --pretty false` currently still reports this slice across:
  - `src/games/view.ts`
  - `src/import/chesscom.ts`
  - `src/import/lichess.ts`
  - `src/import/pgn.ts`
  - `src/keyboard.ts`
  - `src/router.ts`
  - `src/main.ts`

What I want from you:
- first provide the required pre-implementation output:
  1. what part of the current codebase is relevant
  2. what Lichess files/systems are relevant
  3. the exact diagnosis
  4. the exact small step being implemented
  5. why that step is safe and correctly scoped
- then implement the change
- then validate it

Validation requirements:
- run `npm run build`
- run `npm run typecheck -- --pretty false`
- explicitly report:
  - build result
  - typecheck result
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - any remaining risks or limitations

Success criteria:
- this import/shell typecheck slice is cleared
- runtime behavior is unchanged
- the repo still builds
```

## CCP-075 - Make Board Resize Handle Safari-Reliable

```
Prompt ID: CCP-075
Task ID: CCP-075
Source Document: docs/KNOWN_ISSUES.md
Source Step: [MEDIUM] Board resize handle does not reliably appear or work in Safari
Execution Target: Codex

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same board / resize / Safari-related files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: Fix the board-resize handle so it appears and works reliably in Safari on the analysis board.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - how Patzer currently injects and binds the resize handle
   - how Lichess handles board resizing
   - what Safari-specific failure mode is plausible in the current implementation
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- Keep this scoped to Safari reliability for the existing resize handle.
- Do not redesign overall board resizing UX.
- Do not add substantial new logic to `src/main.ts`.

Relevant current code areas to inspect first:
- `src/board/index.ts`
- `src/styles/main.scss`

Relevant Lichess source to inspect first:
- the local Lichess chessground resize helper and board-resize CSS currently mirrored by Patzer

Validation requirements:
- run `npm run build`
- run the most relevant task-specific check you can
- explicitly report:
  - build result
  - Safari-specific reasoning or validation
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - any remaining risks or limitations

Success criteria:
- the existing board resize handle appears reliably
- dragging it works reliably in Safari
- no unrelated board behavior is changed
```

## CCP-076 - Make Book-Aware Retrospection Cancellation Live

```
Prompt ID: CCP-076
Task ID: CCP-076
Source Document: docs/KNOWN_ISSUES.md
Source Step: [MEDIUM] Book-aware retrospection cancellation seam is defined but not live
Execution Target: Codex

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same retrospection / opening-provider / analysis files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: Make the existing book-aware retrospection cancellation seam live by actually wiring an opening provider into active candidate generation.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - how Patzer currently defines the opening-provider seam
   - where Patzer currently calls `buildRetroCandidates(...)` without a provider
   - how Lichess retrospection uses opening/explorer data to cancel theory moves
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- Keep this focused on making the existing cancellation seam live.
- Do not redesign all retrospection candidate logic.
- Do not invent a large opening subsystem.
- If Patzer’s available opening data is still limited, make the smallest honest live wiring step and call out the remaining limitation explicitly.

Relevant current code areas to inspect first:
- `src/analyse/retro.ts`
- `src/main.ts`
- any current opening/book metadata or provider seam already present in the repo

Relevant Lichess source to inspect first:
- the local Lichess retrospection files and any opening-cancellation path they use

Validation requirements:
- run `npm run build`
- run the most relevant task-specific check you can
- explicitly report:
  - build result
  - whether theory/book moves are now actually filtered by the live path
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - any remaining risks or limitations

Success criteria:
- the existing opening-provider seam is no longer dead
- active retrospection candidate generation now uses it
- no unrelated retrospection behavior is changed
```

## CCP-077 - Finish Eval Graph Hover And Scrub Behavior

```
Prompt ID: CCP-077
Task ID: CCP-077
Source Document: docs/KNOWN_ISSUES.md
Source Step: [MEDIUM] Eval graph hover/scrub behavior is not yet working as expected
Execution Target: Codex

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same eval-graph / analysis-view / underboard interaction files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: Tighten the eval-graph hover and scrub interaction so graph-driven review/navigation behaves as intended.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - how Patzer currently handles hover indicators and click strips on the graph
   - how Lichess chart interaction works
   - where Patzer still falls short for scan/scrub usability
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- Keep this scoped to graph hover/scrub interaction.
- Do not bundle unrelated graph fill, resize-handle, or review-summary changes.
- Use Lichess as the interaction reference where applicable.

Relevant current code areas to inspect first:
- `src/analyse/evalView.ts`
- any relevant graph styling in `src/styles/main.scss`

Relevant Lichess source to inspect first:
- `~/Development/lichess-source/lila/ui/chart/src/acpl.ts`
- any other local Lichess chart interaction helpers that matter

Validation requirements:
- run `npm run build`
- run the most relevant task-specific check you can
- explicitly report:
  - build result
  - graph hover/scrub behavior after the fix
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - any remaining risks or limitations

Success criteria:
- graph hover/scrub now behaves as intended
- graph-driven review/navigation is clearer and more reliable
- no unrelated graph behavior is changed
```

## CCP-078 - Fix Move-List Context Menu Positioning

```
Prompt ID: CCP-078
Task ID: CCP-078
Source Document: docs/KNOWN_ISSUES.md
Source Step: [MEDIUM] Move-list variation context menu can open at the top-left of the page
Execution Target: Codex

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same move-list / context-menu / patcher files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: Fix the move-list variation context menu so it opens over the selected move instead of rendering at the top-left corner of the page.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - how Patzer currently stores cursor coordinates and renders the overlay
   - whether the Snabbdom patcher/setup is preventing inline positioning styles from applying
   - how Lichess handles comparable contextual move-list actions where relevant
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- Keep this scoped to context-menu positioning and the minimum supporting render seam needed.
- Do not redesign the full move-list action system.
- Do not bundle unrelated variation-action changes.

Relevant current code areas to inspect first:
- `src/main.ts`
- `src/analyse/moveList.ts`
- the app patcher/bootstrap setup if positioning modules are relevant

Validation requirements:
- run `npm run build`
- run the most relevant task-specific check you can
- explicitly report:
  - build result
  - context-menu positioning behavior
  - whether behavior changed intentionally
  - whether there are console/runtime errors
  - any remaining risks or limitations

Success criteria:
- the move-list context menu opens near the selected move
- it no longer falls back to the top-left page origin
- no unrelated move-list behavior is changed
```
