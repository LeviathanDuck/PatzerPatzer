# UX Source Map

This file maps the copied Lichess sources to the UX questions they answer.

## Primary retrospection files

### `sources/src/retrospect/retroCtrl.ts`

Questions answered:
- what controller state exists during retrospection?
- what callbacks drive UX transitions?
- what special helpers expose board/UI effects?

Critical exports and methods:
- `feedback`
- `current`
- `jumpToNext()`
- `onJump()`
- `onCeval()`
- `viewSolution()`
- `skip()`
- `hideComputerLine()`
- `showBadNode()`
- `preventGoingToNextMove()`
- `forceCeval()`

Why it matters:
- this file is the UX behavior engine
- many visible board/UI changes are expressed as helper methods here rather than in the view

### `sources/src/retrospect/retroView.ts`

Questions answered:
- what does the main retrospection box render?
- what states are shown to the user?
- what actions are clickable in each state?

Critical details:
- `.retro-box.training-box.sub-box`
- title row with progress and close button
- feedback states:
  - `find`
  - `offTrack`
  - `fail`
  - `win`
  - `view`
  - `eval`
  - `end`

## Analysis controller integration

### `sources/src/ctrl.ts`

Questions answered:
- how does the mode become active?
- how is retrospection tied into path changes and ceval updates?
- what other tools conflict with it?
- how does it change active control mode?

Critical details:
- `retro?: RetroCtrl`
- `activeControlMode()`
- `toggleRetro()`
- `jump()`
- `onNewCeval(...)`
- `allowLines()`
- `showBestMoveArrows()`
- `toggleExplorer()`
- `closeTools()`

## Entry surfaces

### `sources/src/view/actionMenu.ts`

Questions answered:
- where does the user launch retrospection from the action menu?
- when is the action available?

Critical details:
- `canRetro = ctrl.hasFullComputerAnalysis() && !ctrl.isEmbed && !ctrl.retro`
- action-menu link uses `ctrl.toggleRetro`
- entry icon is `GraduateCap`

### `sources/src/view/roundTraining.ts`

Questions answered:
- where does the classic underboard “Learn From Your Mistakes” button live?
- how does it coexist with advice summary?

Critical details:
- retrospection button appears between white/black advice summary panes
- it is active when `ctrl.retro` exists
- it disappears when server analysis is absent

### `sources/src/view/controls.ts`

Questions answered:
- how does retrospection appear in the mobile control bar?
- how does it become an active engine mode?

Critical details:
- `EngineMode = 'ceval' | 'practice' | 'retro'`
- mobile control bar can switch to `retro`
- mobile retro button shows progress via `ctrl.retro?.completion().join('/')`

## Tool-column layout

### `sources/src/view/tools.ts`

Questions answered:
- where does the retrospection box render relative to ceval, PVs, move list, forks, explorer, and
  action menu?

Critical details:
- tool-column order:
  - ceval
  - PVs
  - move list
  - fork view
  - retro view or explorer view or practice view
  - action menu
- PVs are hidden while `ctrl.retro?.isSolving()`

### `sources/src/view/components.ts`

Questions answered:
- what higher-level layout flags does retrospection alter?

Critical details:
- `showCevalPvs: !ctrl.retro?.isSolving() && !ctrl.practice`
- board and underboard are unchanged structurally, but tools and controls react to retro state

## Board behavior and visual feedback

### `sources/src/autoShape.ts`

Questions answered:
- how does retrospection change arrows on the board?
- how is the bad move shown?
- how are best-move arrows and PV arrows affected?

Critical details:
- if `ctrl.retro.showBadNode()` returns a node, draw a pale red highlighted arrow for the bad move
- `showBestMoveArrows()` is also gated by `!ctrl.retro?.hideComputerLine(this.node)`

### `sources/src/control.ts`

Questions answered:
- how does retrospection block next-move stepping?

Critical details:
- `next(ctrl)` exits early if `ctrl.retro?.preventGoingToNextMove()`

### `sources/src/fork.ts`

Questions answered:
- what happens to fork/variation chooser UI while solving?

Critical details:
- `view(ctrl)` returns nothing if `ctrl.retro?.isSolving()`

### `sources/src/treeView/inlineView.ts`

Questions answered:
- how does the move tree treat fishnet comments and the current marker during retrospection?

Critical details:
- fishnet comments can be replaced with `learnFromThisMistake`
- current marker can anchor to `ctrl.retro?.current()?.prev.path`

## Alternate UI / accessibility

### `sources/src/retrospect/nvuiRetroView.ts`

Questions answered:
- how is retrospection rendered in NVUI / accessibility mode?
- what spoken feedback exists?

Critical details:
- dedicated retro toggle button
- live spoken text for solve states
- focus-friendly action hooks

### `sources/src/view/nvuiView.ts`

Questions answered:
- where does NVUI plug retrospection into the alternate analysis interface?

## Styling

### `sources/css/_retro.scss`

Questions answered:
- what retrospection-specific visuals are layered onto the training box?

### `sources/css/_training.scss`

Questions answered:
- what generic training-box structure does retrospection inherit?

### `sources/css/_tools.scss`

Questions answered:
- what base tool-column and controls styling does retrospection live inside?

### `sources/css/_tools-mobile.scss`

Questions answered:
- what mobile layout changes happen when active mode is `retro`?

### `sources/css/_fork.scss`

Questions answered:
- what fork area is being hidden/altered while retrospection is active?
