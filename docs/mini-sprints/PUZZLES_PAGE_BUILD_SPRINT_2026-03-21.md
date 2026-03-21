# Mini Sprint — Puzzles Page Build

Date: 2026-03-21
Status: proposed
Scope: smallest safe build sequence for turning Patzer Pro's placeholder puzzles route into a real local puzzle workflow, grounded in the current repo and informed by Lichess puzzle structure

---

## Goal

Build the first real Patzer Pro puzzles page by:

- reusing the existing board and analysis UI shell where it already fits
- introducing a puzzle-specific controller instead of treating puzzles as analysis-plus-label
- starting from Patzer's own saved puzzle candidates and review data
- keeping the first implementation browser-local and architecture-safe

This sprint is intentionally not:

- a full Lichess puzzle clone
- a public-dataset ingestion sprint
- a broad new product branch detached from current review work

The target is:

- real saved-puzzle browsing
- real puzzle-round solving
- real puzzle feedback
- real reuse of existing Patzer board UI

without destabilizing the analysis board or dragging major new logic into
`src/main.ts`.

---

## Why this sprint is the right next puzzle step

Patzer Pro already has meaningful puzzle-adjacent infrastructure:

- [src/puzzles/extract.ts](/Users/leftcoast/Development/PatzerPatzer/src/puzzles/extract.ts)
  - extracts `PuzzleCandidate[]` from review data
  - renders candidate lists and save actions
- [src/idb/index.ts](/Users/leftcoast/Development/PatzerPatzer/src/idb/index.ts)
  - persists saved puzzles in `puzzle-library`
- [src/analyse/retroCtrl.ts](/Users/leftcoast/Development/PatzerPatzer/src/analyse/retroCtrl.ts)
  - already models a per-candidate solve loop for “Learn From Your Mistakes”
- [src/board/index.ts](/Users/leftcoast/Development/PatzerPatzer/src/board/index.ts)
  - already owns live board integration, orientation, and user move handling
- [src/main.ts](/Users/leftcoast/Development/PatzerPatzer/src/main.ts)
  - still routes `#/puzzles`, but only as a placeholder surface

That means Patzer is not starting from zero.

The real need is to convert existing review-driven puzzle primitives into a
dedicated puzzle subsystem.

---

## Lichess comparison that matters here

Relevant local Lichess sources:

- [../lichess-source/lila/ui/puzzle/src/ctrl.ts](/Users/leftcoast/Development/lichess-source/lila/ui/puzzle/src/ctrl.ts)
- [../lichess-source/lila/ui/puzzle/src/interfaces.ts](/Users/leftcoast/Development/lichess-source/lila/ui/puzzle/src/interfaces.ts)
- [../lichess-source/lila/ui/puzzle/src/moveTest.ts](/Users/leftcoast/Development/lichess-source/lila/ui/puzzle/src/moveTest.ts)
- [../lichess-source/lila/ui/puzzle/src/moveTree.ts](/Users/leftcoast/Development/lichess-source/lila/ui/puzzle/src/moveTree.ts)
- [../lichess-source/lila/ui/puzzle/src/view/main.ts](/Users/leftcoast/Development/lichess-source/lila/ui/puzzle/src/view/main.ts)
- [../lichess-source/lila/ui/puzzle/src/view/chessground.ts](/Users/leftcoast/Development/lichess-source/lila/ui/puzzle/src/view/chessground.ts)
- [../lichess-source/lila/ui/puzzle/src/view/feedback.ts](/Users/leftcoast/Development/lichess-source/lila/ui/puzzle/src/view/feedback.ts)
- [../lichess-source/lila/ui/puzzle/src/view/after.ts](/Users/leftcoast/Development/lichess-source/lila/ui/puzzle/src/view/after.ts)
- [../lichess-source/lila/ui/puzzle/src/view/side.ts](/Users/leftcoast/Development/lichess-source/lila/ui/puzzle/src/view/side.ts)
- [../lichess-source/lila/ui/puzzle/src/session.ts](/Users/leftcoast/Development/lichess-source/lila/ui/puzzle/src/session.ts)
- [../lichess-source/lila/ui/puzzle/src/autoShape.ts](/Users/leftcoast/Development/lichess-source/lila/ui/puzzle/src/autoShape.ts)

The important Lichess lessons for Patzer are:

- puzzle mode is a dedicated controller/state machine
- board UI can be reused, but move handling becomes puzzle-specific
- solution validation is strict and sequence-aware
- scripted opponent replies are part of the round flow
- feedback and after-round actions are first-class UI, not generic analysis chrome
- lightweight local session tracking fits the feature well

We should copy those principles, not their entire final complexity.

---

## Non-destructive implementation strategy

This sprint should avoid:

- large new logic in `src/main.ts`
- full public Lichess puzzle-database ingestion
- bundling puzzle work with broad analysis refactors
- rebuilding the board subsystem just for puzzles
- adding engine-heavy puzzle assist behavior before the solve loop is sound

This sprint should prefer:

- new ownership in `src/puzzles/`
- small route and rendering seams in `src/main.ts`
- reuse of existing board shell and move-tree data
- data-model extensions that stay compatible with saved local candidates
- local saved puzzles as the first content source

---

## Proposed sprint outcome

After this sprint, Patzer should be able to:

1. open a real `#/puzzles` page
2. browse saved local puzzles
3. open a puzzle round from that list
4. play the intended move on the existing board
5. get correct / wrong / solved feedback
6. move through a local puzzle session
7. return to the source game context later

This is enough to make the puzzle page real without overcommitting to the final
catalog or full public data story.

---

## Sprint tasks

## Task 1 — Establish real puzzle module ownership and route surface

### Diagnosis

Patzer currently has puzzle extraction and persistence, but no real puzzle page
owner. `#/puzzles` is still controlled from placeholder logic in
[src/main.ts](/Users/leftcoast/Development/PatzerPatzer/src/main.ts).

### Small safe step

Create a real puzzle module seam in `src/puzzles/` with a controller/view
entrypoint and switch the route to render through that seam without adding real
solve logic yet.

### Why safe

- creates ownership before behavior
- reduces future pressure on `src/main.ts`
- does not yet alter board move handling

---

## Task 2 — Introduce a richer puzzle round model without breaking saved candidates

### Diagnosis

Current `PuzzleCandidate` is enough for extraction and saving, but not enough
for a full round flow with scripted replies, display metadata, and future
session state.

### Small safe step

Add a Patzer-owned puzzle-round type in `src/puzzles/` and a compatibility
conversion seam from persisted `PuzzleCandidate` records.

### Why safe

- gives puzzle mode a real data owner
- avoids overloading `src/tree/types.ts` with too much puzzle-only behavior
- keeps current saved puzzles usable

---

## Task 3 — Replace the placeholder puzzles route with a saved-puzzle library view

### Diagnosis

The app already stores saved puzzles locally, but there is no dedicated route
for browsing and opening them as a library.

### Small safe step

Render a real saved-puzzle list on `#/puzzles`, backed by existing IDB state,
with a click path into a specific puzzle round.

### Why safe

- user-facing and immediately useful
- uses data Patzer already owns
- still avoids round-logic complexity

---

## Task 4 — Add a minimal puzzle round controller

### Diagnosis

Patzer has retrospection solve concepts, but no puzzle-specific controller that
owns round state, phase, and solution progress the way Lichess `PuzzleCtrl`
does.

### Small safe step

Create a minimal puzzle controller that owns:

- active puzzle
- current phase
- current solution index
- solved / failed state

but does not yet wire full feedback chrome or session history.

### Why safe

- creates the correct ownership boundary first
- lets later UI and board integration depend on a stable controller seam

---

## Task 5 — Route board moves through strict puzzle validation and scripted replies

### Diagnosis

The core puzzle behavior gap is not rendering. It is that the user’s move must
be checked against the expected solution sequence, and correct progress must
auto-play the reply moves that belong to the round.

### Small safe step

Wire the board move flow for puzzle mode so that:

- the user move is validated against the expected move
- a correct move advances the round
- required reply moves are played automatically
- a wrong move marks the round failed

### Why safe

- this is the smallest real puzzle-behavior milestone
- keeps the solve loop puzzle-owned instead of analysis-owned
- still avoids broader session or catalog work

---

## Task 6 — Add puzzle feedback and round controls

### Diagnosis

Once puzzle validation exists, the page still needs explicit puzzle-state UI for
correct / wrong / solved / view-solution / next actions.

### Small safe step

Add a puzzle feedback strip and minimal after-round controls modeled on the
Lichess puzzle flow, but scoped to local saved puzzles.

### Why safe

- puzzle-specific UI can now depend on a controller that already exists
- keeps feedback separate from generic analysis tools

---

## Task 7 — Add the puzzle metadata / side-panel surface

### Diagnosis

Puzzle rounds need lightweight context: source game link, move context, loss
severity, and other metadata Patzer already knows or can derive.

### Small safe step

Add a small puzzle side panel using current local metadata first, without
inventing rating / popularity / theme systems Patzer does not yet own.

### Why safe

- improves orientation without creating fake dataset semantics
- keeps Patzer honest about what data exists today

---

## Task 8 — Persist lightweight local puzzle session state

### Diagnosis

Lichess puzzle mode benefits from session continuity. Patzer’s browser-local
architecture is a good fit for a light local session record too.

### Small safe step

Persist a minimal local puzzle session with recent solved/failed rounds and next
round continuity, without introducing account or server assumptions.

### Why safe

- local-only state fits current architecture
- low coupling to analysis and import systems

---

## Task 9 — Tighten review-to-puzzle integration

### Diagnosis

Patzer’s product advantage is not just “has puzzles.” It is that game review can
feed puzzle practice. That bridge needs an explicit, stable entrypoint.

### Small safe step

Tighten the existing review/extraction/save flow so the puzzle page uses Patzer’s
own saved review-derived candidates cleanly and predictably.

### Why safe

- aligns puzzle work with the analysis-board-first project direction
- reinforces reuse instead of parallel systems

---

## Deferred on purpose

Do not treat these as part of this sprint:

- downloading and ingesting the full Lichess puzzle database
- public puzzle ratings / vote systems
- broad engine-assist puzzle hints
- large puzzle taxonomy/theme systems
- full parity with every Lichess puzzle page panel

Those are later decisions, after the local saved-puzzle flow is real and
trustworthy.
