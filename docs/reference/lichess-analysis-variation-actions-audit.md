# Lichess Analysis Variation Actions Audit

Date: 2026-03-20
Basis:
- inspected Lichess analysis-board source
- focused on move-tree interaction, variation actions, and per-move context actions

This document answers:
- how Lichess analysis lets the user interact with moves in variations
- what actions exist on a move/variation
- which actions are available in plain analysis
- which actions are only available in Study
- where PGN export and variation deletion actually come from

This is about the analysis board move tree, not retrospection and not standalone puzzle products.

---

## Short answer

Lichess analysis variation actions are primarily implemented through a dedicated move-tree context
menu, not through inline action buttons on each variation row.

The interaction model is:
- left click / tap on a move: jump to that path
- right click on desktop, or hold/double-tap on touch/debug paths: open the move-tree context menu
- from that menu, Lichess can:
  - promote a variation
  - make a variation the main line
  - force a mainline node into variation display
  - copy mainline PGN or variation PGN
  - delete from the selected node onward
  - add study-specific actions like comment or glyph annotation if the board is in Study write mode

So the source-backed mental model is:
- selection is direct click on move nodes
- actions are contextual and menu-based
- the exact set of actions depends on whether the current surface is plain analysis or Study

---

## Primary source files

### Move-tree event and menu attachment
- [~/Development/lichess-source/lila/ui/analyse/src/treeView/treeView.ts](/Users/leftcoast/Development/lichess-source/lila/ui/analyse/src/treeView/treeView.ts)

Why it matters:
- attaches the move-tree context menu callback
- routes normal pointer-up interactions into `ctrl.userJump(path)`
- chooses desktop vs touch behavior for opening the menu

### Move-tree context menu
- [~/Development/lichess-source/lila/ui/analyse/src/treeView/contextMenu.ts](/Users/leftcoast/Development/lichess-source/lila/ui/analyse/src/treeView/contextMenu.ts)

Why it matters:
- defines the actual move/variation actions
- decides which items show for mainline vs variation
- calls the controller methods that mutate the tree or export PGN

### Move-tree rendering
- [~/Development/lichess-source/lila/ui/analyse/src/treeView/inlineView.ts](/Users/leftcoast/Development/lichess-source/lila/ui/analyse/src/treeView/inlineView.ts)
- [~/Development/lichess-source/lila/ui/analyse/src/treeView/columnView.ts](/Users/leftcoast/Development/lichess-source/lila/ui/analyse/src/treeView/columnView.ts)

Why they matter:
- define the move node DOM structure
- store path information in `p` attributes on rendered move nodes
- visually mark context-menu and pending-action state

### Controller actions
- [~/Development/lichess-source/lila/ui/analyse/src/ctrl.ts](/Users/leftcoast/Development/lichess-source/lila/ui/analyse/src/ctrl.ts)

Relevant methods:
- `deleteNode(path)`
- `promote(path, toMainline)`
- `forceVariation(path, force)`
- `visibleChildren(...)`

### PGN export logic
- [~/Development/lichess-source/lila/ui/analyse/src/pgnExport.ts](/Users/leftcoast/Development/lichess-source/lila/ui/analyse/src/pgnExport.ts)

Relevant function:
- `renderVariationPgn(game, nodeList)`

### Tree mutation primitives
- [~/Development/lichess-source/lila/ui/lib/src/tree/tree.ts](/Users/leftcoast/Development/lichess-source/lila/ui/lib/src/tree/tree.ts)

Relevant APIs:
- `deleteNodeAt(path)`
- `promoteAt(path, toMainline)`
- `forceVariationAt(path, force)`
- `pathIsMainline(path)`
- `extendPath(path, isMainline)`

### Study-specific context menu extension
- [~/Development/lichess-source/lila/ui/analyse/src/study/studyView.ts](/Users/leftcoast/Development/lichess-source/lila/ui/analyse/src/study/studyView.ts)

Relevant function:
- `contextMenu(ctrl, path, node)`

---

## How clicking moves works

The move tree stores the move path on DOM nodes using the `p` attribute.

In [treeView.ts](/Users/leftcoast/Development/lichess-source/lila/ui/analyse/src/treeView/treeView.ts):
- `eventPath(e)` reads the `p` attribute from the clicked move node or its parent
- on `pointerup`, if the target is not a disclosure toggle and it is a primary click/tap:
  - Lichess calls `ctrl.userJump(path)`
  - then redraws

This means:
- every rendered move node is fundamentally a navigation target
- variation moves are first-class clickable paths, not special separate controls

So from a board-state perspective:
- clicking a move in a variation changes the active analysis path to that exact variation node
- the board and analysis state then follow the usual `jump`/`setPath` path update flow

---

## How action menus open

In [treeView.ts](/Users/leftcoast/Development/lichess-source/lila/ui/analyse/src/treeView/treeView.ts):
- on desktop in normal mode:
  - `el.oncontextmenu = ctxMenuCallback`
- on touch devices:
  - `el.ondblclick = ctxMenuCallback`
  - `addPointerListeners(... hold: ctxMenuCallback)`
- in debug mode:
  - double click is used so dev tools can still use right click

The callback opens:
- `renderContextMenu(e, ctrl, path)`

So the move-action affordance is explicitly contextual:
- right click
- long press
- or double click in certain cases

It is not an always-visible inline action row.

---

## What actions exist in plain analysis

From [contextMenu.ts](/Users/leftcoast/Development/lichess-source/lila/ui/analyse/src/treeView/contextMenu.ts), the plain-analysis actions are:

### 1. Promote variation
Shown when:
- `canPromote`

Action:
- `ctrl.promote(path, false)`

Meaning:
- promote the selected variation upward within the sibling ordering
- not necessarily make it the main line immediately

### 2. Make main line
Shown when:
- the path is not on the mainline

Action:
- `ctrl.promote(path, true)`

Meaning:
- elevate the selected variation into the main line

### 3. Force variation
Shown when:
- the clicked path is on the mainline

Action:
- `ctrl.forceVariation(path, true)`

Meaning:
- marks a mainline node to be treated/displayed as a forced variation seam

This is a display/tree-structure behavior, not a generic promotion.

### 4. Collapse all / Expand all
Driven by:
- `idbTree.someCollapsedOf(false/true)`

Actions:
- `idbTree.setCollapsedFrom('', true)`
- `idbTree.setCollapsedFrom('', false)`

Meaning:
- global move-tree disclosure management

### 5. Copy mainline PGN / copy variation PGN
Always available from the menu.

Action:
- `navigator.clipboard.writeText(renderVariationPgn(ctrl.data.game, ctrl.tree.getNodeList(extendedPath)))`

Important detail:
- this uses `renderVariationPgn(...)`, not the full PGN exporter
- `extendedPath` is computed via:
  - `tree.extendPath(path, onMainline)`

Meaning:
- for a variation node, Lichess copies the PGN for that variation line from the selected node onward
- for mainline, it copies the mainline PGN

### 6. Delete from here
Shown when:
- `path` is non-empty

Action:
- `ctrl.deleteNode(path)`

Meaning:
- delete the selected node and everything beneath it
- not just one move

This is the important source-backed answer to “delete variation”:
- Lichess does not expose a tiny inline `x` per move in the source inspected here
- it exposes a context-menu delete-from-here operation

---

## What extra actions exist only in Study

If `ctrl.study` exists, [contextMenu.ts](/Users/leftcoast/Development/lichess-source/lila/ui/analyse/src/treeView/contextMenu.ts) injects:
- `studyView.contextMenu(ctrl.study, path, node)`

From [studyView.ts](/Users/leftcoast/Development/lichess-source/lila/ui/analyse/src/study/studyView.ts), this adds, but only in write mode:

### 1. Comment this move
Behavior:
- switches tool tab to comments
- opens study comment form for that move/path

### 2. Annotate with glyphs
Behavior:
- switches tool tab to glyphs
- jumps to that move/path

So:
- plain analysis and Study do not expose the same action set
- Study extends the per-move action surface with editorial/study authoring tools

---

## How PGN export for a variation really works

The relevant function is:
- `renderVariationPgn(game, nodeList)` in [pgnExport.ts](/Users/leftcoast/Development/lichess-source/lila/ui/analyse/src/pgnExport.ts)

What it does:
- filters the provided node list down to SAN-bearing nodes
- prefixes the first move with the proper move number
- then emits the SAN sequence for that path
- prepends variant/FEN tags when needed

Important limitation:
- this is path export, not arbitrary subtree export with all nested branches
- the context menu builds a node list for the chosen extended path and exports that specific line

So the user-facing “Copy variation PGN” behavior is:
- choose a move in a variation
- open context menu
- copy the linear PGN for that variation path

It is not:
- export the entire subtree with all sibling lines from that point

---

## How deletion really works

The delete action eventually lands in `AnalyseCtrl.deleteNode(path)` in [ctrl.ts](/Users/leftcoast/Development/lichess-source/lila/ui/analyse/src/ctrl.ts).

What happens there:
- clears pending deletion highlight
- counts nodes/comments under the target subtree
- if big enough, asks for confirmation
- calls `this.tree.deleteNodeAt(path)`
- repairs the active position:
  - if current path is inside deleted subtree, jump to parent path
  - otherwise jump back to current path
- if in Study, forwards deletion to study state too
- redraws

This is a very important behavior seam:
- Lichess does not just remove the branch
- it also repairs the active selection and propagates study-side state when relevant

---

## How variation promotion works

`AnalyseCtrl.promote(path, toMainline)`:
- calls `tree.promoteAt(path, toMainline)`
- jumps to the same path
- forwards to Study if present

And the underlying tree API in [tree.ts](/Users/leftcoast/Development/lichess-source/lila/ui/lib/src/tree/tree.ts):
- can reorder siblings
- can move a line into mainline
- can clear `forceVariation` where needed

So there are two related but distinct capabilities:
- promote variation upward
- make main line

They share the same underlying tree mutation primitive with different flags.

---

## How “force variation” works

This is a subtle one.

From [contextMenu.ts](/Users/leftcoast/Development/lichess-source/lila/ui/analyse/src/treeView/contextMenu.ts):
- only shown for a path currently considered mainline

From [ctrl.ts](/Users/leftcoast/Development/lichess-source/lila/ui/analyse/src/ctrl.ts):
- `forceVariation(path, true)` calls `tree.forceVariationAt(path, true)`
- then jumps to the path

From [tree.ts](/Users/leftcoast/Development/lichess-source/lila/ui/lib/src/tree/tree.ts):
- forcing variation clears other `forceVariation` flags
- marks the selected node as `forceVariation`

From the move renderers:
- `child.forceVariation` changes how lines are interrupted and rendered

So this action is about:
- how the move tree visually treats a branch seam
- not about deleting or exporting

---

## Visual feedback for pending actions

Lichess also gives visual feedback for context actions.

In [inlineView.ts](/Users/leftcoast/Development/lichess-source/lila/ui/analyse/src/treeView/inlineView.ts), move-node classes include:
- `context-menu`
- `pending-deletion`
- `pending-copy`

The context menu sets these through controller props like:
- `ctrl.pendingDeletionPath(path)`
- `ctrl.pendingCopyPath(extendedPath)`

This means:
- hovering context actions can visually preview which branch is about to be copied or deleted
- the move list itself reflects those pending actions

That is an important UX detail if Patzer wants close parity.

---

## Plain analysis vs Study: source-backed action matrix

### Plain analysis
- click move to jump
- context menu on move
- promote variation
- make main line
- force variation
- collapse all / expand all
- copy mainline/variation PGN
- delete from here

### Study write mode
All of the above, plus:
- comment this move
- annotate with glyphs

### Study non-write mode
- study-specific authoring actions are not exposed

---

## What this means for Patzer

If Patzer wants Lichess-like variation interaction, the closest source-backed pattern is:

1. Every move node should be directly clickable for path selection
2. Variation actions should be exposed through a move-tree context menu
3. That menu should operate on the selected path, not vague variation IDs
4. Deletion should be “delete from here” with active-path repair
5. Variation PGN export should export the selected line path, not a made-up subtree format
6. If Patzer later adds richer annotation/study tools, they should extend the context menu based on mode/capability, not pollute plain analysis

---

## Bottom-line conclusions

### Confirmed
- Lichess analysis move actions are context-menu driven
- PGN export for a variation is a real feature
- deletion is a real feature
- promotion and mainline replacement are real features
- Study adds extra move actions on top of plain analysis

### Important nuance
- “delete variation” is not implemented as a tiny always-visible inline control in the inspected Lichess source
- it is a contextual “delete from here” branch action

### Best Patzer takeaway
- if Patzer wants strong Lichess alignment, variation actions should be modeled as path-based context operations first
- inline affordances can still be a Patzer design choice, but they are a divergence from the primary Lichess pattern unless deliberately justified
