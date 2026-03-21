# Patzer Pro — Next Steps

Date: 2026-03-20
Status: analysis-board-first roadmap

This list is intentionally small and ordered for safety. It reflects the current repo, where the
next phase should focus on making game analysis and review trustworthy enough to support later
puzzle tooling. Full puzzle work should follow, not lead, the stabilization of the analysis board.

---

## Priority 0 — Restore trustworthy validation

### 1. ✓ Make `npm run typecheck` real — DONE

`tsconfig.json` added. `npm run typecheck` now checks the project and surfaces 53 real type
errors. Errors are deferred and tracked in `docs/KNOWN_ISSUES.md`.

### 2. Fix the 53 type errors surfaced by `npm run typecheck`

Current state:
- `npm run typecheck` exits non-zero with 53 errors
- errors are mostly `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` violations
- the build still passes because esbuild does not type-check

Why now:
- a non-zero typecheck gate provides no regression protection
- fixing the errors makes the gate meaningful for all subsequent work

### 3. Fix the broken clear-local-data reset path

Current state:
- `resetAllData()` in `src/main.ts` calls `openGameDb()` without importing it

User impact:
- the advertised “clear local data” recovery path is not currently trustworthy
- users have less reliable recovery when local state becomes confusing or corrupted

---

## Priority 1 — Make the analysis board and review loop reliable

### 4. Fix engine update reliability on navigation and variation changes

Current state:
- live engine analysis is not yet fully trustworthy across:
  - move navigation
  - variation creation
  - branch switching
  - other move-state changes

User impact:
- the board can show stale or missing engine lines when the user is actively reviewing a game
- this weakens the review experience and blocks downstream puzzle logic

### 5. Fix saved-analysis restore and active-game scoping

Current state:
- review results and persisted restore flow still need stronger active-game protection
- restore is still async and coordinated from `src/main.ts`
- review is still effectively tied to the currently selected game instead of being a clearly
  scoped per-game background task with explicit progress visibility in the game list

User impact:
- analysis can become untrustworthy when switching games quickly
- users cannot reliably start review on one game, move to another game, and still see the first
  game continue reviewing in the background with visible progress
- puzzle tooling later will depend on this data being correct

Implementation note:
- per-game review ownership should be explicit enough that a game already under review can keep
  progressing even when it is no longer the selected board context
- the Games list should show that review is in progress for that game, including a visible
  percentage indicator in the relevant review-status area of the row

### 6. Fix engine stop bookkeeping

Current state:
- `awaitingStopBestmove` in `src/engine/ctrl.ts` is still a single boolean

User impact:
- rapid stop/start sequences can still mis-handle stale `bestmove` output

### 7. Fix played-arrow semantics in side variations

Current state:
- the “played move” arrow still assumes the current node is on the original game line

User impact:
- arrows can communicate the wrong thing while the user explores side lines
- this makes move exploration less trustworthy in exactly the workflow the app is built for

---

## Priority 2 — Finish the remaining analysis/review ownership seams

### 8. Formalize game and analysis ownership

Current state:
- game library state is still owned by `src/main.ts`
- `loadGame()` and analysis restore coordination are still major cross-system seams

Why now:
- this is one of the last structural gaps that can still create confusing bugs in review flow

### 9. Persist engine settings and review context cleanly

Current state:
- `reviewDepth`, `analysisDepth`, and `multiPv` still reset on reload

Why now:
- saved analysis should be stable, understandable, and reusable across sessions

---

## Priority 3 — Build the next layer of review functionality

### 10. Implement a local per-game “Learn From Mistakes” style review flow

Current state:
- the app can review a game and extract puzzle candidates
- it does not yet have a focused local game-review flow that turns analysis into guided mistake study

Why now:
- this is the right bridge between game review and later puzzle tooling
- it keeps the project centered on strengthening the analysis board before expanding puzzle scope

### 11. Formalize per-move review annotations and add book-move support

Current state:
- the app already computes win-chance-based `inaccuracy` / `mistake` / `blunder` style labels
- those labels are still derived directly from eval cache data rather than a dedicated persisted review-annotation layer
- there is no current book-move source or opening-explorer-backed move tagging during review

Why now:
- Lichess-style computer analysis is not just raw engine numbers; it turns analysis into move-by-move review language
- Patzer Pro already has enough review math to support a proper annotation layer, but not yet enough structure to keep extending it safely
- book-move tagging is useful, but should be added only behind a small cached provider boundary rather than mixed directly into `src/main.ts` or the raw batch engine flow

Implementation shape:
- first persist explicit per-move review annotations alongside stored analysis
- make move-list and summary UI read those annotations instead of recomputing ad hoc view labels
- then add cached opening/book lookup by FEN so opening moves can be marked as book until the played line leaves known theory

---

## Priority 4 — Tighten board-review behavior details

### 12. Improve graph, arrows, and move-list review behavior

Current state:
- several analysis-board behaviors still need tightening for review quality:
  - graph scrub / hover behavior
  - move-list eval numbers
  - played-move arrow behavior in side lines
  - clear variations / reset flows
- variation management is still missing the user-facing controls needed to discard analysis-board side lines without destroying full-game review data

Exact implementation note:
- add a move-list action to clear user-created side variations and reset the tree view back to the imported/mainline move order without wiping engine evaluation or completed game-review data for the mainline
- add per-variation remove affordances in the move list, such as a small `x` beside user-created side lines, so variations can be removed one at a time
- keep this scoped to move-tree mutation and move-list rendering ownership in `src/tree/ops.ts` and `src/analyse/moveList.ts`, with care not to couple variation cleanup to `evalCache` or full-review persistence unless that dependency is intentionally designed
- because board move input currently creates new variation nodes in `src/board/index.ts`, this work should explicitly define which variations are safe to remove and how the current path is repaired after deletion

Why now:
- these are high-value improvements once engine correctness is reliable
- they improve the actual quality of game review without jumping ahead to full puzzle mode

### 13. Implement the honest minimum route surface

Current state:
- `analysis-game` and `puzzles` are still route-level placeholders

Why now:
- route honesty matters once the core analysis path is reliable
- the app should not advertise route-level workflows it cannot yet complete

### 14. Make small UI improvements that support review clarity

Scope examples:
- game list readability
- settings/menu cleanup
- clearer review-state messaging
- better reset / clear-cache placement

---

## Deferred until the core analysis path is safer and more complete

These should not be casual near-term sprint items:

- full puzzle play mode
- broad saved-puzzles product work beyond minimal support
- openings trainer
- stats dashboard
- engine worker migration
- broad UI polish initiatives

They are all lower-order than trustworthy analysis, stable saved review data, and clear subsystem
ownership.
