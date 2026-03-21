# Retrospection Flow

This document reconstructs the Lichess Learn From Your Mistakes flow from the visible source.

## High-Level Sequence

Confirmed end-to-end flow:

1. The analysis board already has reviewed mainline data.
2. The user toggles retrospection.
3. Lichess rebuilds candidate mistakes for the chosen color using `evalSwings(...)`.
4. It selects the next unsolved candidate.
5. It derives:
   - `fault`: the bad move that was played
   - `prev`: the position before that mistake
   - `solution`: the computer child of `prev`
6. It optionally cancels early-opening moments if the "mistake" is still a real master-book move.
7. It jumps the board to `prev.path`.
8. The user tries to find a better move.
9. Lichess evaluates the attempt through direct checks first, then ceval fallback when needed.
10. On success or failure, it updates feedback state, controls line visibility, and offers next
    actions.

## Candidate Discovery

`retroCtrl.ts` does not own the swing math itself. It delegates that to `evalSwings(...)` in
`nodeFinder.ts`.

Confirmed logic:

- retrospection recomputes `candidateNodes` instead of using a static saved list
- color filtering happens by ply parity:
  - white mistakes: `n.ply % 2 === 1`
  - black mistakes: `n.ply % 2 === 0`
- explorer-cancelled plies are excluded from future consideration
- already-solved plies are excluded from next-node selection

Important implication:

- Learn From Your Mistakes is not simply "every bad move"
- it is "every visible eval swing that also has a stored computer alternative line and survives
  opening cancellation"

## Retrospection State Shape

Confirmed controller state in `retroCtrl.ts`:

- `candidateNodes: TreeNode[]`
- `explorerCancelPlies: number[]`
- `solvedPlies: number[]`
- `current: Prop<Retrospection | null>`
- `feedback: Prop<Feedback>`

Confirmed `Retrospection` shape:

- `fault`
- `prev`
- `solution`
- `openingUcis`

Confirmed feedback states:

- `find`
- `eval`
- `win`
- `fail`
- `view`
- `offTrack`

Notable absence:

- there is no large persisted session object here
- the controller is lightweight and built from already-present analysis-tree data

## How the Board Enters Solve Mode

Confirmed entry path:

- `toggleRetro()` in `ctrl.ts` creates the controller via `makeRetro(this, this.bottomColor())`
- `makeRetro(...)` immediately calls `jumpToNext()`

`jumpToNext()` does the real transition work:

1. reset feedback to `find`
2. call `findNextNode()`
3. if no candidate exists:
   - set `current(null)`
   - redraw end state
4. otherwise derive:
   - `fault.path = root.mainlinePlyToPath(node.ply)`
   - `prev.path = treePath.init(fault.path)`
   - `solution = prev.node.children.find(n => !!n.comp)!`
5. set `current(...)`
6. possibly fetch opening explorer moves
7. call `root.userJump(prev.path)`
8. redraw

This is the central board transition:

- retrospection does not start from the bad move node
- it jumps back one ply to the position before the mistake
- that pre-mistake position is the solve position

## Opening Cancellation

Lichess explicitly avoids treating some opening moves as mistakes.

Confirmed gate in `jumpToNext()`:

- only for `standard`
- only if `game.division` exists
- only before the middle-game boundary:
  - `!game.division.middle || fault.node.ply < game.division.middle`

Confirmed process:

1. fetch master opening data for `prev.node.fen`
2. collect UCIs where `white + draws + black > 1`
3. if the played bad move UCI is among those opening moves:
   - push the fault ply into `explorerCancelPlies`
   - `setTimeout(jumpToNext, 100)`
4. otherwise store `openingUcis` for solve-time acceptance

Meaning:

- Lichess will completely skip a candidate if the played move still appears to be a real opening
  move in master data
- this is stricter than just tagging it as book

## How Attempts Are Judged

### Direct win cases

Confirmed direct success in `onJump()` when the board reaches the fault ply:

- the move is in `openingUcis`
- or SAN ends with `#`
- or the node is marked `comp`

Interpretation:

- opening-book alternatives can count as acceptable
- checkmate ends the question immediately
- following the stored computer line counts as success

### Direct fail case

Confirmed direct failure:

- if the reached node has `node.eval`

In practice this catches:

- the original bad move that was actually played
- or another already-evaluated move that the analysis tree knows is bad enough to have eval data

### Ceval fallback case

If the move is not trivially accepted or rejected:

1. feedback becomes `eval`
2. controller waits for local ceval
3. `checkCeval()` compares the new move against `cur.prev.node.eval`
4. win if `winningChances.povDiff(color, node.ceval!, cur.prev.node.eval!) > -0.04`
5. otherwise fail

Important consequence:

- retrospection is not exact-best-move-only in final Lichess behavior
- it uses a near-best acceptance window once ceval is ready

## Ceval Readiness

Confirmed readiness gate:

- `depth >= 18`
- or `depth >= 14 && millis > 6000`

This is a concrete compromise:

- wait for stronger local confidence than a trivial shallow blip
- do not require indefinite search if depth is already decent and the engine has spent real time

## Failure Recovery

Confirmed `onFail()` behavior:

1. set feedback to `fail`
2. save the current bad node/path
3. jump back to `current().prev.path`
4. if the bad attempt created a non-mainline leaf:
   - delete it from the tree
5. redraw

Meaning:

- failure is not just a message
- Lichess actively cleans up throwaway leaf attempts that are not on mainline and have no children

## Off-Track Handling

If the user browses away from the solve position:

- feedback becomes `offTrack`
- the view offers a resume action
- if the user returns to `cur.prev.path`, feedback resets from `offTrack` back to `find`

This is a dedicated state, not just a silent cancel.

## Solve Completion

Confirmed:

- solved bookkeeping is by `fault.node.ply`
- `viewSolution()` and `skip()` both mark the current candidate solved
- `jumpToNext()` advances to the next unsolved candidate
- `reset()` clears `solvedPlies`
- `flip()` switches review color, recreating retrospection in non-Racing Kings games via board flip

Important nuance:

- "view solution" is treated as solved
- "skip" is also treated as solved
- retrospection is optimized for progress through the review loop, not for strict puzzle-training
  statistics

## Main Controller Wiring

Visible integration points in `ctrl.ts`:

- `jump(path)` calls `this.retro.onJump()` after path changes
- `onNewCeval(...)` calls `this.retro?.onCeval()` when ceval updates land on the current path
- `mergeAnalysisData(...)` calls `this.retro?.onMergeAnalysisData()`
- `toggleExplorer()` closes retrospection when opening explorer is enabled
- `closeTools()` also clears retrospection when conflicting tools open
- line visibility uses:
  - `hideComputerLine(node)`
  - `forceCeval()`

This is why a faithful Patzer implementation cannot stop at candidate generation plus a button.
The mode must also integrate with:

- path changes
- move creation/jump behavior
- local ceval updates
- computer-line visibility
- other mutually exclusive board tools

## What This Proves for Patzer

Confirmed from source:

- Lichess Learn From Your Mistakes is a dedicated analysis-board mode
- it is built on reviewed mainline data
- it uses a strict candidate selector
- it jumps to the pre-mistake node
- it maintains a small explicit feedback state machine
- it uses opening cancellation and ceval fallback

What this does not prove:

- that the public puzzle generator uses the same upstream mining pipeline
- that published puzzles are just persisted retrospection candidates

Those are related ideas, but the visible source does not establish them as identical systems
