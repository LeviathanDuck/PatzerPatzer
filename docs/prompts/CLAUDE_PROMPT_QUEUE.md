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

- CCP-067-F1: Fix Eval Graph Fill To Rise From Bottom
  - Correct the eval-graph fill so white territory fills from the bottom of the chart to the line instead of only filling from the middle line.

- CCP-044-F4: Fade In Engine Arrow Labels And Arrows
  - Reduce arrow-label typography to 10/400/2 and make both labels and arrows fade in subtly on first appearance.

- CCP-069: Refine Eval Graph Fill And Resize Handle
  - Replace the graph slider with a center drag handle, keep Lichess-style white fill, and remove phase labels from the chart.

- CCP-067: Bring Eval Graph Fill Into Lichess Parity
  - Replace the current neutral eval-graph fill treatment with Lichess-style white-advantage fill logic.

- CCP-068: Add Eval Graph Height Toggle
  - Add a small bottom-center graph control that cycles the eval graph from 100% up to 300% height.

- CCP-066: Add Search To Underboard And Games Lists
  - Add a real search bar to the underboard games list and extend the Games page filter into a broader text search without splitting the two surfaces into separate systems.

- CCP-035-F1: Fix Arrowhead Loss After Engine Line Changes
  - Stabilize engine arrowheads when changing line count or related engine-arrow settings so the main arrowhead does not disappear intermittently.

- CCP-044-F2: Match Arrow Label Styling To Eval Bar
  - Reduce arrow-label text size and make its styling match the eval-bar number instead of using oversized custom text.

## Queue

## CCP-067-F1 - Fix Eval Graph Fill To Rise From Bottom

```
Prompt ID: CCP-067-F1
Task ID: CCP-067
Parent Prompt ID: CCP-067
Source Document: ad hoc user request
Source Step: make eval-graph white fill rise from the bottom of the chart instead of the center line
Execution Target: Codex

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same eval-graph / analysis-view / underboard styling files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: Fix the eval-graph fill behavior so the white graph fill rises from the bottom of the graph up to the line, instead of only shading from the graph’s middle line. If there is any uncertainty about the intended look, compare directly against the local Lichess source and follow that visible behavior.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - how Patzer Pro currently builds the graph fill polygons
   - how Lichess fills the advantage graph and colors the line
   - where Patzer’s current fill still diverges visually
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- This is a follow-up fix to the existing `CCP-067` eval-graph fill work, not a new graph feature family.
- Keep the change scoped to graph fill geometry and the graph line styling only if a tiny line adjustment is needed for parity.
- Do not bundle graph-height handle work, hover redesign, or unrelated underboard changes.
- Use Lichess as the source of truth for the fill behavior.
- Do not add substantial new logic to `src/main.ts`.

Relevant current code areas to inspect first:
- `src/analyse/evalView.ts` — current graph SVG fill polygons, center line, and eval trace stroke
- `src/styles/main.scss` — any `.eval-graph` styling that affects visible contrast

Relevant Lichess source to inspect first:
- `~/Development/lichess-source/lila/ui/chart/src/acpl.ts`
- any corresponding local Lichess chart style/constants files used by that graph

Current repo-grounded behavior to confirm first:
- Patzer currently closes its SVG fill polygons to `cy`, the graph’s middle line
- the current white fill therefore reads like shading from the origin/middle rather than white territory rising from the bottom of the chart
- Lichess should be used as the visual source of truth if there is any doubt about the intended style

Requested behavior:
- the graph fill should visually fill entirely from the bottom of the graph up to the eval line
- the fill color should be white
- the graph line can use whatever Lichess uses if that is needed to make the parity clearer
- if there is uncertainty about the exact style difference, inspect the Lichess source directly and follow it rather than guessing

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
- the white fill now rises from the bottom of the chart to the eval line
- the fill no longer reads like it starts from the center line
- the graph line remains readable and Lichess-aligned
- hover/click graph navigation still works

Success criteria:
- white eval-graph territory fills from the bottom of the graph
- the graph line styling is acceptable and Lichess-aligned
- no unrelated graph behavior is changed
```

## CCP-044-F4 - Fade In Engine Arrow Labels And Arrows

```
Prompt ID: CCP-044-F4
Task ID: CCP-044
Parent Prompt ID: CCP-044-F3
Source Document: ad hoc user request
Source Step: reduce arrow label typography to 10/400/2 and add subtle fade-in for new arrow labels and arrows
Execution Target: Codex

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same engine-arrow / board-draw / ceval styling files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: Refine the engine-arrow label presentation so the labels use `font-size="10"`, `font-weight="400"`, and `stroke-width="2"`, and make both the arrow labels and the arrows themselves fade in subtly on first appearance instead of popping in instantly.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - how Patzer Pro currently renders engine arrows and arrow labels
   - whether Lichess has any relevant arrow / custom SVG appearance or fade patterns worth borrowing structurally
   - where Patzer’s current arrow appearance is too abrupt or visually heavy
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- This is a follow-up refinement to the existing `CCP-044` engine-arrow label work, not a new engine-arrow feature family.
- Keep the change scoped to arrow-label typography and arrow/label appearance timing only.
- Do not bundle arrow placement changes, new settings work, MultiPV behavior changes, or unrelated engine logic cleanup.
- Do not add substantial new logic to `src/main.ts`.

Relevant current code areas to inspect first:
- `src/engine/ctrl.ts` — arrow label SVG generation, engine-arrow shape construction, and any shape lifecycle seams
- `src/board/index.ts` — draw-shape integration and any available animation/styling hooks
- `src/styles/main.scss` — any existing transition/opacity patterns worth reusing
- any relevant ceval styling if the arrow-label typography should stay aligned with the eval presentation language

Relevant Lichess source to inspect first:
- the most relevant local Lichess analyse / board drawing / auto-shape files you can find for engine-arrow rendering behavior
- any corresponding Lichess CSS if there is a useful appearance/transition pattern
- if Lichess does not animate these shapes, say that clearly and keep the fade as a Patzer-specific polish step

Current repo-grounded behavior to confirm first:
- `src/engine/ctrl.ts` currently renders arrow-label text at `font-size="12"`, `font-weight="500"`, and `stroke-width="1.35"`
- arrow labels currently appear immediately as part of the shape render path
- the repo does not currently show an obvious dedicated fade-in mechanism for these engine-arrow shapes

Requested behavior:
- update arrow-label SVG typography to:
  - `font-size="10"`
  - `font-weight="400"`
  - `stroke-width="2"`
- keep the current shadow/outline concept, but with the updated typography values above
- when engine arrows first appear, they should fade in subtly and quickly instead of popping in
- when arrow labels first appear, they should fade in with the same subtle fast timing
- keep the fade tasteful and lightweight, not slow or flashy

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
- arrow-label SVG text now uses `font-size="10"`, `font-weight="400"`, and `stroke-width="2"`
- engine arrows no longer pop in abruptly on first appearance
- arrow labels no longer pop in abruptly on first appearance
- the fade is subtle and fast rather than slow or distracting
- existing arrow behavior remains otherwise unchanged

Success criteria:
- engine-arrow labels use the exact requested typography values
- arrows and labels fade in subtly on first appearance
- no unrelated engine-arrow behavior is changed
```

## CCP-069 - Refine Eval Graph Fill And Resize Handle

```
Prompt ID: CCP-069
Task ID: CCP-069
Source Document: ad hoc user request
Source Step: replace eval-graph slider with a center drag handle, keep Lichess-style white fill, and remove phase labels
Execution Target: Codex

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same eval-graph / analysis-view / underboard styling files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: Refine the eval graph so it uses a centered drag handle instead of the current slider-based height control, keeps Lichess-style white territory fill, and removes the phase labels from the chart.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - how Patzer Pro currently renders the graph fill, phase dividers, and height control
   - how Lichess renders chart fill and chart divisions
   - how Patzer already implements board-resize drag affordances that could inform the new graph handle
   - where the current graph UI diverges from the intended behavior
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- Keep this task scoped to eval-graph styling and graph-height interaction only.
- Do not bundle unrelated review-dot, move-list, or engine-display changes.
- Use Lichess as the source of truth for the graph fill behavior.
- Treat the drag handle as a Patzer-specific control, but ground its interaction/styling in the existing board resize affordance where helpful.
- Do not add substantial new logic to `src/main.ts`.

Relevant current code areas to inspect first:
- `src/analyse/evalView.ts` — eval graph fill polygons, phase labels, fixed graph dimensions, and current slider-based height control
- `src/styles/main.scss` — `.eval-graph` styling plus the existing board resize handle styling
- any small graph-height persistence helper currently used by Patzer

Relevant Lichess source to inspect first:
- `~/Development/lichess-source/lila/ui/chart/src/acpl.ts`
- `~/Development/lichess-source/lila/ui/chart/src/division.ts`
- `~/Development/lichess-source/lila/ui/lib/css/component/_board-resize.scss`
- any corresponding chart CSS needed to confirm the visible fill behavior

Current repo-grounded behavior to confirm first:
- `src/analyse/evalView.ts` currently renders a bottom-center `input[type="range"]` slider for graph height
- the graph still renders phase words like `Opening`, `Middlegame`, and `Endgame` directly on the chart
- the graph fill is currently implemented by two clipped polygons and should be compared directly against Lichess before changing it
- the repo already has a board resize handle pattern that may be a better reference for the desired graph-height affordance than a slider

Requested behavior:
- remove the current slider-based height control from the eval graph
- add a small drag handle centered at the bottom of the graph that can be grabbed and dragged downward to increase height
- keep the graph-height range bounded so the current baseline acts like 100% and the max remains 300%
- make the filled area visually read like Lichess, with white territory filling from the bottom up to the line when White has the advantage
- remove the on-chart phase labels; the words are not needed

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
- the eval graph no longer shows the slider UI
- a small center-bottom drag handle is visible and can increase graph height by dragging downward
- the graph cannot exceed the existing intended 300% max height
- the chart no longer shows `Opening`, `Middlegame`, or `Endgame` text labels
- white-advantage positions visually fill white in the Lichess style
- hover/click navigation in the graph still works after resizing

Success criteria:
- the eval graph uses a centered drag handle instead of a slider
- the graph fill matches Lichess-style white territory behavior more closely
- phase labels are gone
- no unrelated analysis-board behavior is changed
```

## CCP-067 - Bring Eval Graph Fill Into Lichess Parity

```
Prompt ID: CCP-067
Task ID: CCP-067
Source Document: docs/WISHLIST.md
Source Step: Changes to how the eval graph is displayed and formatted
Execution Target: Codex

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same eval-graph / analysis-view / underboard styling files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: Bring the eval-graph fill behavior into Lichess parity so the filled area is white when White has the advantage, instead of using Patzer’s current neutral filled polygon treatment.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - how Patzer Pro currently draws the graph background and filled polygon
   - how Lichess fills the eval graph for white/black advantage
   - where Patzer currently diverges
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- This task is only about the eval-graph fill logic and related styling parity.
- Do not bundle graph-height controls, hover redesign, or unrelated annotation changes.
- Use Lichess as the source of truth for the fill behavior.
- Do not add substantial new logic to `src/main.ts`.

Relevant current code areas to inspect first:
- `src/analyse/evalView.ts` — graph SVG construction, background rectangles, filled polygon
- `src/styles/main.scss` — `.eval-graph` styling
- any local Patzer graph-related prompt history if needed

Relevant Lichess source to inspect first:
- the relevant local Lichess chart / ACPL graph source that governs fill logic
- any corresponding Lichess CSS needed to confirm visual intent

Current repo-grounded behavior to confirm first:
- Patzer currently draws:
  - a light upper-half background
  - a dark lower-half background
  - one neutral semi-transparent polygon closed to the center line
- that does not match the desired Lichess-style fill behavior where White advantage visually fills white

Requested behavior:
- when White has the advantage, the graph fill should visually read as white territory in the same way Lichess does
- copy the visible Lichess fill logic rather than inventing a new Patzer graph-fill model
- keep the graph trace and existing interactions intact unless a tiny related adjustment is strictly required

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
- positions where White is better fill the graph the way Lichess does
- positions where Black is better still render correctly
- the graph line and current-position marker remain readable
- hover/click navigation still works

Success criteria:
- the eval-graph fill logic matches visible Lichess behavior more closely
- White advantage visually fills white
- no unrelated graph behavior is changed
```

## CCP-068 - Add Eval Graph Height Toggle

```
Prompt ID: CCP-068
Task ID: CCP-068
Source Document: ad hoc user request
Source Step: add a bottom-center eval-graph height toggle from 100% to 300%
Execution Target: Codex

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same eval-graph / underboard layout / styling files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: Add a small control at the center bottom of the eval graph that lets the user enlarge the graph height from the current 100% size up to 300% maximum.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - how Patzer Pro currently fixes eval-graph height
   - whether Lichess exposes any comparable graph-resize or underboard sizing pattern worth borrowing structurally
   - where a small Patzer-specific control is acceptable
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- This task is only about graph-height control.
- Treat 100% as the current baseline height.
- Allow expansion up to 300% max.
- Keep the UI small and centered at the bottom of the graph.
- Do not bundle graph fill parity, hover redesign, or broad underboard layout work unless a tiny layout adjustment is strictly required.
- Do not add substantial new logic to `src/main.ts`.

Relevant current code areas to inspect first:
- `src/analyse/evalView.ts` — graph render structure and any hook point for a local height control
- `src/styles/main.scss` — `.eval-graph` sizing and underboard layout styling
- any current local storage / settings patterns if a persisted graph-height value is the smallest safe fit after inspection

Relevant Lichess source to inspect first:
- any local Lichess underboard or chart sizing patterns that are structurally relevant
- do not force parity where Lichess has no equivalent; call it out as a Patzer-specific control if that is what inspection shows

Current repo-grounded behavior to confirm first:
- `GRAPH_H` is currently fixed at `80`
- the rendered SVG height is currently fixed to `GRAPH_H`
- there is no graph-height control in the UI today

Requested behavior:
- add a small center-bottom graph control
- the control should let the user increase graph height up to 300% max
- 100% should correspond to current height
- keep the control subtle and not visually noisy

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
- the control is visible at the center bottom of the graph
- the graph can be enlarged above the baseline height
- the graph never exceeds 300% of the baseline
- click/hover navigation within the graph still works after resizing
- the underboard layout remains usable when the graph is enlarged

Success criteria:
- the eval graph has a small bottom-center height control
- the graph can scale from 100% to 300% max
- no unrelated graph or underboard behavior is changed
```

## CCP-066 - Add Search To Underboard And Games Lists

```
Prompt ID: CCP-066
Task ID: CCP-066
Source Document: ad hoc user request
Source Step: add a search bar to the underboard games list and the Games history page
Execution Target: Codex

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same games-list / Games view / filtering / underboard list files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: Add a search bar to the underboard games list beneath the chess board, and add a proper search bar to the Games history page, using the smallest safe shared filtering step instead of inventing two separate systems.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - how Patzer Pro currently renders and filters the underboard games list
   - how Patzer Pro currently renders and filters the Games page
   - how Lichess handles comparable game-history / list filtering patterns where relevant
   - where the smallest shared search seam actually is
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- The underboard compact list currently has no search control.
- The Games page already has an opponent-only search input; inspect whether the smallest safe step is to broaden that control into a more general text search rather than bolt on a second field.
- Keep the task scoped to search/filter behavior and the minimal UI needed to expose it.
- Do not redesign the entire games filtering system.
- Do not add substantial new logic to `src/main.ts`.

Relevant current code areas to inspect first:
- `src/games/view.ts` — `renderGameList()`, `renderGamesView()`, existing filter state, existing opponent search
- `src/styles/main.scss` — games-view search styling and any game-list styling you need for the underboard control
- `src/main.ts` — only to confirm how the two game-list surfaces are wired, not as the default implementation target

Relevant Lichess source to inspect first:
- any relevant local Lichess game-history / filtering / list-control files that help confirm search placement and scope
- do not force a broad Lichess detour if the real change is a small Patzer-local list-filter refinement

Current repo-grounded behavior to confirm first:
- the underboard compact game list renders in `renderGameList()` with no text search control
- the Games page already has `gamesFilterOpponent` and an `input.games-view__search` labeled `Opponent`
- both surfaces draw from the same imported game collection, but they are not currently using a shared text-search model

Requested behavior:
- add a search bar to the games list beneath the board
- add a search bar to the Games history page
- prefer one coherent text-search behavior across both surfaces
- keep the UI small and obvious

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
- typing in the underboard search bar narrows the underboard games list
- typing in the Games-page search bar narrows the Games history list
- the Games-page search still composes sanely with existing result/time/color filters
- clearing the search restores the full visible list
- empty-state text remains reasonable when the search returns no matches

Success criteria:
- both game-list surfaces expose a visible text search bar
- the underboard list can be filtered by search text
- the Games page can be filtered by search text
- the implementation does not introduce a second conflicting filter model for the same page
- no unrelated import/review behavior is changed
```

## CCP-035-F1 - Fix Arrowhead Loss After Engine Line Changes

```
Prompt ID: CCP-035-F1
Task ID: CCP-035
Parent Prompt ID: CCP-035
Source Document: docs/KNOWN_ISSUES.md
Source Step: [MEDIUM] Changing engine line count can make the main engine arrowhead disappear
Execution Target: Codex

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same engine-arrow / Chessground draw / ceval-settings files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: Fix the remaining engine-arrowhead instability so changing engine line count or nearby arrow settings no longer causes the main engine arrowhead to disappear intermittently.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - how Patzer Pro currently builds engine and played arrows
   - how Patzer Pro applies Chessground brushes and labels during settings changes
   - how Lichess keeps auto-shape arrows stable across ceval / multipv updates
   - where the remaining instability seam actually is
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- This is a follow-up fix to `CCP-035`, not a new arrow system.
- Keep the task scoped to the disappearing-arrowhead bug.
- Do not bundle broader engine-label styling, arrow UX redesign, or unrelated ceval settings cleanup.
- Do not add substantial new logic to `src/main.ts`.

Relevant current code areas to inspect first:
- `src/engine/ctrl.ts` — arrow shape construction, brush selection, played arrow, MultiPV arrows, label integration
- `src/board/index.ts` — Chessground drawable brush registration and board config
- `src/ceval/view.ts` — engine line-count / arrow-related settings that trigger the bug
- `docs/KNOWN_ISSUES.md` — current bug wording
- `docs/prompts/CLAUDE_PROMPT_HISTORY.md` — prior `CCP-035` notes if useful

Relevant Lichess source to inspect first:
- `~/Development/lichess-source/lila/ui/analyse/src/autoShape.ts`
- any relevant local Lichess Chessground / ceval shape wiring needed to confirm arrow stability expectations

Current repo-grounded diagnosis to confirm first:
- the original arrowhead fix already forced explicit brush registration and simplified the played-arrow brush path
- the bug is still logged specifically around changing engine line count
- that suggests the remaining seam is likely not the original brush-key absence alone, but a settings-transition / shape-composition interaction that still sometimes yields a shape without a stable arrowhead marker
- current engine arrows now also support labels, so the fix must confirm whether label-bearing shapes or settings-triggered redraw order are part of the remaining regression

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
- changing engine line count does not make the primary engine arrowhead disappear
- toggling arrow-related settings on/off does not leave the arrowhead missing
- played-arrow and secondary-line arrows still render sanely after the fix
- existing arrow labels, if enabled, do not reintroduce the disappearance bug

Success criteria:
- the main engine arrow keeps a visible arrowhead after engine line-count changes
- arrowhead rendering remains stable across nearby engine-arrow settings changes
- no unrelated engine-arrow behavior is regressed
```

## CCP-044-F2 - Match Arrow Label Styling To Eval Bar

```
Prompt ID: CCP-044-F2
Task ID: CCP-044
Parent Prompt ID: CCP-044-F1
Source Document: docs/WISHLIST.md
Source Step: Add tag or label next to engine move arrows showing what their eval is
Execution Target: Codex

You are working in the Patzer Pro repo at `/Users/leftcoast/Development/PatzerPatzer`.

Startup coordination step:
- Before editing, check whether any other tool, agent, Claude Code session, or Codex thread is actively touching the same engine-arrow / score-styling / ceval files.
- If overlapping work is already in flight, stop and report the overlap before making repo edits.

Task: Refine the current engine-arrow eval label styling so the text is smaller and matches the visual styling of the eval-bar number.

Required repo workflow:
1. Inspect the current Patzer Pro codebase first.
2. Locate the actual implementation points before assuming file paths.
3. Inspect the relevant Lichess source before deciding how to implement.
4. Compare:
   - how Patzer Pro currently styles engine-arrow labels
   - how Patzer Pro styles the eval-bar number and engine-line scores
   - how Lichess handles comparable score typography
   - where this small Patzer-specific arrow-label styling choice should remain intentionally local
5. Identify the smallest safe implementation step.
6. Explain diagnosis before coding.
7. Implement.
8. Validate with build + task-specific checks.

Important project constraints:
- This is a follow-up refinement to `CCP-044-F1`, not a new arrow-label feature.
- Keep the implementation scoped to label text size, color, and typography only.
- Do not bundle changes to arrow geometry, settings defaults, label placement logic, or unrelated ceval behavior.
- Do not add substantial new logic to `src/main.ts`.

Relevant current code areas to inspect first:
- `src/engine/ctrl.ts` — current arrow-label text generation and color assignment
- `src/analyse/evalView.ts` — eval-bar score rendering and score formatting
- `src/ceval/view.ts` — engine-line score rendering
- `src/styles/main.scss` — `.ceval__score`, PV score styling, and any current arrow-label styling hooks

Relevant Lichess source to inspect first:
- any relevant ceval score styling / auto-shape styling files in local Lichess source that help confirm typography patterns
- do not force a broad Lichess detour if the real change is only a small local styling refinement

Current repo-grounded behavior to confirm first:
- the current arrow-label text is visually too large
- the intended target is the eval-bar number styling, not the oversized current arrow-label treatment
- the desired result is for the arrow label to feel like the eval-bar score transplanted into the arrow-label context

Requested behavior:
- reduce the arrow-label text size
- make the color/styling match the eval-bar number
- keep the change limited to arrow-label styling
- do not change other score displays unless a tiny shared styling extraction is clearly safer

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

Success criteria:
- arrow-label text is visibly smaller than the current implementation
- arrow-label styling matches the eval-bar score styling closely
- non-arrow score displays are not unintentionally regressed
- no unrelated arrow or engine-setting behavior is changed
```
