# Rated Puzzle Stream Sprint

Date: 2026-03-29
Status: core implemented, shard integration has known issues (audited 2026-03-30)

### Phase Status (as of 2026-03-30)

| Phase | Status | Notes |
|---|---|---|
| Shard loader integration | **Done** | Typecheck issues fixed (CCP-461) |
| Auto-advance stream | **Done** | Rated stream with auto-next in ctrl.ts |
| Gap-fixing for shard loader | **Done** | `findRatedPuzzleInShards` guards fixed |
| Stream UI polish | **Done** | Rating delta, difficulty selector |

This sprint adds a Lichess-style rated puzzle stream entry point to the left sidebar of the puzzle
page. When the user clicks "Start Rated", the app automatically selects puzzles near the user's
current rating and chains them one after another — replicating the default Lichess puzzle mode.

## Locked Product Decisions

- The rated stream lives in the left sidebar panel of the puzzle page.
- It uses the existing `setSessionMode('rated')` / `selectNextRatedPuzzle()` infrastructure from
  the rated ladder sprint (CCP-258 family).
- After each rated round completes, the app auto-advances to the next rated puzzle without the user
  needing to press anything.
- The entry point shows: current user rating (or "?" if unknown), difficulty selector, and a
  "Start Rated" button.
- When no Lichess-imported puzzles are available at the user's rating range, show a clear empty
  state with a call to import.
- `selectNextRatedPuzzle()` currently only queries IDB definitions — this sprint fixes that gap by
  wiring in the shard loader fallback for Lichess-imported puzzles not yet in IDB.

## Known Gap Being Fixed

`selectNextRatedPuzzle()` in `src/puzzles/ctrl.ts` queries `puzzleDefinitions` IDB store only.
If the user has not yet imported any puzzles, or all imported puzzles are outside the rating
window, it returns `null` even if the Lichess puzzle shard data contains suitable puzzles.

This sprint adds a fallback: after an IDB miss, call into the shard loader to find a puzzle in the
rating window and import it into IDB on the fly.

## Phase Map

| Phase | Manager | Leaf tasks | Topic |
|---|---|---|---|
| 1 | CCP-308 | CCP-309, CCP-310, CCP-311 | Research and implementation map |
| 2 | CCP-312 | CCP-313, CCP-314 | Shard loader integration + gap fix |
| 3 | CCP-315 | CCP-316, CCP-317, CCP-318 | Controller + UI wiring |
| 4 | CCP-319 | CCP-320, CCP-321 | Styles + integration review |

## Files in Scope

- `src/puzzles/ctrl.ts` — `selectNextRatedPuzzle()` fix, `startRatedSession()`, auto-advance
- `src/puzzles/view.ts` — left-panel rated stream entry card
- `src/styles/main.scss` — `.puzzle__rated-stream-entry` styles
- Research only: `~/Development/lichess-source/lila/modules/puzzle/src/main/PuzzleSession.scala`
- Research only: `~/Development/lichess-source/lila/modules/puzzle/src/main/PuzzleSelector.scala`
