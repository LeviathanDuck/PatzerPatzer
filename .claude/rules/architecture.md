---
paths:
  - "src/**/*.ts"
  - "server/**"
---

# File-structure and extraction rules

- Do not add new feature code to `src/main.ts` by default.
- Treat `src/main.ts` as orchestration/bootstrap code only.
- Before implementing a new feature, identify which subsystem owns it.
- If a clear subsystem exists, implement there.
- If no subsystem exists and the feature is substantial, create a new module rather than expanding `main.ts`.
- Separate "extract code" tasks from "change behavior" tasks.
- When extracting, move one coherent subsystem at a time and verify behavior remains unchanged.
- Update the active architecture docs when subsystem ownership changes, and archive completed plans under `docs/archive/` instead of keeping them as live planning documents.

## Preferred subsystem boundaries

- `src/engine/` — live analysis, review pipeline, UCI parsing, PV state
- `src/games/` — game import, Games tab, game-row rendering, filtering
- `src/board/` — board settings, orientation, theme, piece/filter UI
- `src/idb/index.ts` — IndexedDB and serialization
- `src/analyse/` — move list, eval graph, summary, engine lines rendering

## Constraints

- Do not combine extraction + redesign + styling overhaul in one task.
- Do not invent hidden dependencies between modules.
- Prefer explicit parameters and return values over reaching into unrelated module state.

## When building new features

Before writing any code for a new tool or UI feature, find the equivalent in Lichess
and mirror its module structure. Lichess consistently separates each tool into:

- `ctrl.ts` — controller: state, logic, event handling, side effects
- `view.ts` — rendering: pure Snabbdom `h()` functions, no state mutation
- `config.ts` / `types.ts` — shared types and constants (if substantial)

**Examples:**

| Feature to build | Lichess reference | Create in this project |
|---|---|---|
| Puzzle tool (future rebuild) | `ui/puzzle/src/ctrl.ts` + `view.ts` | `src/puzzles/ctrl.ts` + `view.ts` when the standalone puzzle product is reintroduced |
| Opening trainer | `ui/learn/src/` | `src/openings/ctrl.ts` + `view.ts` |
| Stats dashboard | `ui/dasher/src/` | `src/stats/ctrl.ts` + `view.ts` |

New modules always go in the appropriate subsystem directory. Never add new feature
code to `main.ts` — it is bootstrap and orchestration only.

## State Architecture Rule

Claude should follow Lichess concepts for state separation:

- Board UI state (Chessground)
- Game state (moves, variations)
- Analysis state (engine evaluations)
- UI/tool state (mode: analysis, puzzle, etc.)

Do NOT tightly couple these layers.

Reference: `ui/analyse/src/ctrl.ts` for how Lichess separates these concerns.

## Naming & Structure Rule

- Match Lichess naming where possible, and doesn't violate their open source policy
- Avoid unnecessary renaming

## First Task Rule

When starting work:

Claude must:
- inspect existing repo
- understand current structure
- identify smallest next step
- avoid rebuilding existing systems
- follow current code patterns
