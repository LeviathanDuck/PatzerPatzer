# Play-Mode Bestmove Routing Design

Audited for:
- `CCP-578`
- `CCP-578-F1`

Related sprint:
- [ENGINE_STRENGTH_LEVELS_SPRINT_2026-03-30.md](/Users/leftcoast/Development/PatzerPatzer/docs/mini-sprints/ENGINE_STRENGTH_LEVELS_SPRINT_2026-03-30.md)

Sources inspected:
- [ctrl.ts](/Users/leftcoast/Development/PatzerPatzer/src/engine/ctrl.ts)
- [playMove.ts](/Users/leftcoast/Development/PatzerPatzer/src/engine/playMove.ts)
- [protocol.ts](/Users/leftcoast/Development/PatzerPatzer/src/ceval/protocol.ts)

## Goal

Preserve the design answer for how play-mode searches should receive `bestmove` results without contaminating the normal analysis eval pipeline.

## Evaluated Approaches

### Option A: ctrl-owned callback slot checked inside `parseEngineLine()`

Shape:
- keep a one-shot `_playMoveCallback` in engine ctrl state
- when `engineMode === 'play'`, ignore `info` lines
- on `bestmove`, route the move to the callback instead of the analysis path

### Option B: temporary raw protocol listener

Shape:
- register a dedicated temporary `onMessage` listener against the protocol
- intercept `bestmove` outside normal ctrl parsing

## Chosen Approach

Choose **Option A**.

## Why Option A Is Safer

### 1. The engine lifecycle already converges in `parseEngineLine()`

`parseEngineLine()` is the existing owner of:
- `info` line parsing
- stale search handling
- threat handling
- batch routing
- live eval cache promotion
- bestmove completion

So the play-mode branch belongs at the same control point.

### 2. A separate raw listener would split ownership

A temporary protocol listener would create a second bestmove consumer outside ctrl ownership.

That would make it easier to drift on:
- pending stop handling
- stale-search behavior
- engine mode transitions
- future retro/live-eval hooks

### 3. Play mode needs to ignore `info` lines, not just reroute `bestmove`

The requirement is not only "get the final move somewhere else."
It is also:
- do not update `currentEval`
- do not redraw analysis UI
- do not promote play searches into `evalCache`

That makes a ctrl-level mode guard the natural seam.

## Exact Guard Placement

The guard belongs at the top of `parseEngineLine()` in [ctrl.ts](/Users/leftcoast/Development/PatzerPatzer/src/engine/ctrl.ts), before the normal analysis handling of `info` and `bestmove`.

Required behavior:
- if `engineMode === 'play'` and line is `info`: ignore it
- if `engineMode === 'play'` and line is `bestmove`:
  - read the UCI move
  - clear the one-shot callback
  - clear active-search state
  - dispatch to the callback if present
  - do not flow into analysis bestmove handling

That is now the implemented design in the current tree.

## `info` Line Policy In Play Mode

They should be ignored.

Reason:
- play searches are not analysis output
- partial search lines should not affect:
  - `currentEval`
  - arrows
  - PV box
  - eval cache
  - retro state

So play mode is best treated as:
- consume final `bestmove`
- suppress intermediate analysis UI

## Edge Cases

### User navigates during a pending play request

The callback should still be one-shot and cancellable.
This is why the play-move service needs:
- a pending callback slot
- explicit cancel support
- stale delayed-request cancellation

### A search is interrupted before bestmove

The normal stop/pending-stop machinery still matters.
Play-mode routing must not bypass the existing search lifecycle entirely; it only changes how successful `bestmove` completion is consumed.

### Batch or analysis mode resumes later

Because play-mode parsing avoids analysis-side mutation, exiting play mode can safely restore:
- protocol analysis options
- `evalCurrentPosition()`

without needing to unwind fake eval state.

## Summary

The right design is:
- ctrl-owned one-shot callback
- top-of-`parseEngineLine()` mode guard
- ignore play-mode `info`
- route play-mode `bestmove` directly to the callback

This keeps bestmove ownership centralized and avoids introducing a second protocol-consumption path.
