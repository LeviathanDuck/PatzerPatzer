# Engine Lifecycle And Mode-Switch Audit

Audited for:
- `CCP-572`
- `CCP-572-F1`

Related sprint:
- [ENGINE_STRENGTH_LEVELS_SPRINT_2026-03-30.md](/Users/leftcoast/Development/PatzerPatzer/docs/mini-sprints/ENGINE_STRENGTH_LEVELS_SPRINT_2026-03-30.md)

Sources inspected:
- [ctrl.ts](/Users/leftcoast/Development/PatzerPatzer/src/engine/ctrl.ts)
- [batch.ts](/Users/leftcoast/Development/PatzerPatzer/src/engine/batch.ts)
- [protocol.ts](/Users/leftcoast/Development/PatzerPatzer/src/ceval/protocol.ts)

## Goal

Preserve the research answer for where Patzer's engine lifecycle assumes analysis mode, and where a safe analysis/play mode switch can be injected.

## Source-Confirmed Lifecycle

### Toggle to ready-to-evaluate flow

The normal analysis lifecycle is:
1. UI toggles engine on through `toggleEngine()`
2. protocol `init()` sends `uci`
3. protocol receives `uciok`
4. protocol sets:
   - `UCI_AnalyseMode true`
   - `Analysis Contempt Off`
   - thread/hash options
5. protocol sends `ucinewgame`
6. protocol sends `isready`
7. engine ready callback fires
8. Patzer resumes `evalCurrentPosition()`

That is the main analysis-mode boot sequence the sprint needed to avoid breaking.

## Analysis-Mode Assumptions In Current Ownership

### In `src/ceval/protocol.ts`

`received('uciok')` assumes the default mode is analysis:
- `UCI_AnalyseMode true`
- `Analysis Contempt Off`

So protocol boot still establishes analysis as the baseline mode.

### In `src/engine/ctrl.ts`

`parseEngineLine()` historically assumed:
- `info` lines update `currentEval`
- bestmove updates analysis state
- live eval promotion can write into `evalCache`
- arrows/redraw follow normal analysis behavior

That is exactly why the sprint introduced:
- `engineMode`
- `enterPlayMode()`
- `exitPlayMode()`
- play-mode bestmove routing guards

### In `src/engine/batch.ts`

Batch review is analysis-owned work:
- it drives `protocol.go(reviewDepth)`
- stores evals into `evalCache`
- persists reviewed analysis to IDB
- resumes live analysis at the end

So batch must never run as if play mode were active.

## Safe Mode-Switch Injection Point

The safe seam is:
- after any active search is stopped
- before the next `go` command is sent

That is what [ctrl.ts](/Users/leftcoast/Development/PatzerPatzer/src/engine/ctrl.ts) now does in `enterPlayMode(config)`:
- set `engineMode = 'play'`
- persist `playStrengthConfig`
- if a search is active, increment pending stop count and stop protocol
- then send play-strength options through `protocol.setPlayStrength(config)`

And in `exitPlayMode()`:
- set `engineMode = 'analysis'`
- clear play config
- call `protocol.setAnalysisMode()`
- resume `evalCurrentPosition()` when engine is enabled and ready

This is the right seam because it changes engine options only while transitioning between searches, not in the middle of one.

## State That Must Be Preserved Across Mode Switches

Source-confirmed from current ownership:
- `engineEnabled`
- `engineReady`
- `engineSearchActive`
- `pendingStopCount`
- current protocol option state
- play-strength selection (`playStrengthConfig`)
- persisted user level (`patzer.playStrengthLevel`)

State that must remain analysis-owned and not be contaminated by play searches:
- `currentEval`
- `pendingLines`
- `evalCache`
- arrow refresh state
- threat-mode analysis state
- batch-review queue state

That separation is why play-mode bestmove routing belongs in the ctrl/protocol seam rather than in arbitrary view code.

## Batch Guard Requirement

Yes: batch analysis needs a guard against play-mode activation.

Why this is source-confirmed:
- batch review writes authoritative analysis into `evalCache`
- play mode intentionally suppresses analysis-side `info`/bestmove behavior
- mixing them would break both persistence and UI expectations

Current design already points the right way:
- `enterPlayMode()` stops any active search before switching
- play-mode parsing in `parseEngineLine()` avoids analysis updates
- silent/batch helpers already check batch-active / engine state before running

So the correct policy is:
- batch remains analysis-only
- play mode must never be activated on top of an active batch run

## Risks

### 1. Play-mode parsing must keep ignoring analysis-side `info`

If play-mode `info` lines ever start mutating:
- `currentEval`
- `evalCache`
- arrows
- retro hooks

then play searches will contaminate the analysis pipeline.

### 2. Exit-to-analysis must always resume cleanly

If `exitPlayMode()` restores protocol options but fails to resume `evalCurrentPosition()`,
the board can look idle after practice stops.

### 3. Future live-retro hooks increase coupling pressure

Any later callback hooked off live eval updates must respect `engineMode`, or play-mode searches can reintroduce analysis-side side effects.

## Summary

The safe source-backed mode-switch seam is:
- stop current search if needed
- switch protocol options
- then start the next search in the new mode

Protocol boot remains analysis-first, which is correct.
Batch remains analysis-only, which is also correct.

The right ownership boundary is therefore:
- protocol: option commands
- ctrl: mode state and search-transition guards
- play service / consumers: request single moves without mutating analysis caches
