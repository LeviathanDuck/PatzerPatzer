# Patzer Pro — Claude Development Guide

## Project Overview

**Patzer Pro** — hosted at **PatzerPro.com**

A web app for analyzing personal chess games and generating targeted practice puzzles.

Core goals:
- Import batches of user games
- Analyze them in bulk with an engine
- Use analysis board to study the game afterwards
- Extract puzzles for deliberate practice

This is a **multi-tool platform**:
- Game Analysis
- Puzzles
- Opening Trainer
- Stats Dashboard

The app shell, navigation, and routing are tool-agnostic from day one.

---

## Core Philosophy

Patzer Pro exists to **replicate Lichess functionality and behavior as closely as possible**.

This is not a typical "design a modern app" project.

It is a **faithful adaptation of Lichess concepts, behavior, and architecture**, implemented in a way that is practical for this project.

---

## Core Implementation Rule
## Task Scope Rule (CRITICAL)

Claude must only implement ONE small task at a time.

Constraints:
- Touch a maximum of 1–3 files per task
- Do NOT bundle multiple features together
- Do NOT refactor unrelated code
- Do NOT "improve" adjacent systems

If the requested task is too large:
- Break it into smaller steps
- Implement only the first step


## Pre-Implementation Checklist (MANDATORY)

Before writing any code, Claude must:

1. Locate relevant Lichess source files in:
   ~/Development/lichess-source/lila

2. Identify:
   - which files implement this feature
   - what logic is reusable vs tightly coupled

3. Confirm:
   - this task fits within 1–3 files


## Anti-Drift Rule

Claude must NOT:

- redesign UX that already exists in Lichess
- simplify core systems
- introduce new architecture patterns
- replace Lichess patterns with abstractions


## Terminology Clarification Rule

If the user uses unclear or incorrect terminology:

Claude must:
- identify closest Lichess concept
- ask for clarification before implementing


## Prompt Compliance Rule

Claude must:
- follow instructions exactly
- not add extra features


## Stop Condition

Claude must stop if:
- task exceeds 3 files
- unclear requirements
- no Lichess reference

Claude should treat the Lichess source code as the **primary source of truth**.

Priority order:

1. Reuse or closely adapt Lichess-origin code, patterns, and behavior
2. Reuse Lichess ecosystem libraries (especially Chessground)
3. Adapt Lichess patterns into this project's stack when necessary
4. Only invent new systems when no Lichess reference exists

Claude should **not redesign features that already exist in Lichess**.

---

## Lichess Reference Source

Local path:
`~/Development/lichess-source/lila`

Claude should use this for:
- analysis board behavior
- move tree and variation logic
- engine controls and UX
- puzzle extraction logic
- board interactions
- keyboard navigation
- UI state transitions
- contextual board UI (analysis vs puzzle vs play)

Claude must:
- study how Lichess implements a feature
- determine what can be reused directly
- adapt only what is necessary

### Key Source Paths (Lichess)

| Feature | Path within `lila/` |
|---|---|
| Move tree types & ops | `ui/lib/src/tree/` |
| Engine / ceval controller | `ui/lib/src/ceval/` |
| Stockfish Web Worker engine | `ui/lib/src/ceval/engines/stockfishWebEngine.ts` |
| UCI protocol | `ui/lib/src/ceval/protocol.ts` |
| Win/loss/draw calculation | `ui/lib/src/ceval/winningChances.ts` |
| Chessground game wrapper | `ui/lib/src/game/ground.ts` |
| Analysis board controller | `ui/analyse/src/ctrl.ts` |
| Analysis board view | `ui/analyse/src/view/` |
| Arrow / highlight drawing | `ui/analyse/src/autoShape.ts` |
| Keyboard navigation | `ui/analyse/src/keyboard.ts` |
| IndexedDB tree cache | `ui/analyse/src/idbTree.ts` |
| Puzzle controller | `ui/puzzle/src/ctrl.ts` |
| Puzzle move tree | `ui/puzzle/src/moveTree.ts` |
| PGN import (backend) | `modules/tree/src/main/ParseImport.scala` |
| Tree builder (backend) | `modules/tree/src/main/TreeBuilder.scala` |
| Analysis backend | `modules/analyse/` |
| Puzzle backend | `modules/puzzle/` |
| Game import backend | `modules/game/` |

---

## Technical Direction

### Preferred Stack (Closest to Lichess)

- Backend: **Scala + Play Framework**
- Frontend: **TypeScript modules + Snabbdom** (virtual DOM, matches Lichess exactly)
- Chess logic: **scalachess** (via GitHub: lichess-org/scalachess)
- Board UI: **Chessground** (`@lichess-org/chessground`)
- PGN display: **`@lichess-org/pgn-viewer`** (reuse directly)
- Engine: **Stockfish** (Web Worker, WASM)
- Bundler: **esbuild**
- Package tooling: **pnpm** (Node 24.13.0+)
- Database: **SQLite or PostgreSQL** (see Deliberate Divergences below)

This stack minimizes translation from Lichess architecture.

---

### Acceptable Alternative (Simplified)

If Scala is not used:

- Full stack: **TypeScript**
- Backend: **Node.js (minimal, no heavy frameworks)**
- Frontend: **TypeScript + Snabbdom** (NO React, NO raw DOM manipulation)
- Chess logic: **chessops** (TypeScript, Lichess-community aligned)
- Board UI: **Chessground** (`@lichess-org/chessground`)
- PGN display: **`@lichess-org/pgn-viewer`**
- Engine: **Stockfish (Web Worker, WASM)**
- Bundler: **esbuild**
- Package tooling: **pnpm** (Node 24.13.0+)
- Database: **SQLite or PostgreSQL**

---

## Deliberate Divergences from Lichess

These are intentional simplifications. Claude must NOT introduce the Lichess production equivalents.

| Lichess uses | Patzer Pro uses | Reason |
|---|---|---|
| MongoDB | SQLite or PostgreSQL | Personal project scale; simpler ops |
| Redis | In-memory or local state | No distributed caching needed |
| Fishnet cluster | Local Stockfish only | Single user; no distributed analysis |
| Elasticsearch | SQLite FTS or none | No game search at scale needed |
| CDN + asset pipeline | Local static serving | Development simplicity |
| ReactiveMongo | SQL ORM or raw SQL | Stack simplification |

If a feature requires something from the Lichess column, discuss with the developer before adding it.

---

## Key Lichess Packages to Reuse Directly

These are published npm packages. Import them, do not reimplement them.

| Package | Purpose |
|---|---|
| `@lichess-org/chessground` | Chess board UI — rendering, interaction, drag/click |
| `@lichess-org/pgn-viewer` | PGN display component |
| `snabbdom` | Virtual DOM (matches Lichess UI rendering pattern) |
| `chessops` | TypeScript chess logic (move gen, validation, FEN, PGN) |

---

## Frontend Rules

- Do NOT use React
- Do NOT build a component-heavy UI system
- Do NOT manipulate the DOM directly with `querySelector` / `innerHTML` patterns
- Do NOT introduce unnecessary abstraction layers
- All UI must be built using Snabbdom vnode patterns (`h()`), not ad-hoc DOM updates ## Task Scope Rule (CRITICAL)

Claude must only implement ONE small task at a time.

Constraints:
- Touch a maximum of 1–3 files per task
- Do NOT bundle multiple features together
- Do NOT refactor unrelated code
- Do NOT "improve" adjacent systems

If the requested task is too large:
- Break it into smaller steps
- Implement only the first step


## Pre-Implementation Checklist (MANDATORY)

Before writing any code, Claude must:

1. Locate relevant Lichess source files in:
   ~/Development/lichess-source/lila

2. Identify:
   - which files implement this feature
   - what logic is reusable vs tightly coupled

3. Confirm:
   - this task fits within 1–3 files


## Anti-Drift Rule

Claude must NOT:

- redesign UX that already exists in Lichess
- simplify core systems
- introduce new architecture patterns
- replace Lichess patterns with abstractions


## Terminology Clarification Rule

If the user uses unclear or incorrect terminology:

Claude must:
- identify closest Lichess concept
- ask for clarification before implementing


## Prompt Compliance Rule

Claude must:
- follow instructions exactly
- not add extra features


## Stop Condition

Claude must stop if:
- task exceeds 3 files
- unclear requirements
- no Lichess reference

Instead:
- Use **Snabbdom** (`h()` + `patch()`) for all UI rendering — this is exactly what Lichess does
- Use **Chessground** directly for the board
- Keep UI logic close to Lichess module patterns
- Build a thin app shell around Lichess-like behavior

### TypeScript Configuration

Match Lichess TypeScript settings:
- Strict mode: `"strict": true`
- Target: `"ES2021"`
- Module resolution: `"bundler"`
- Path alias: `@/*` maps to `src/*`
- No JSX

---

## Backend Rules

- Do NOT default to Express unless necessary
- Prefer architecture patterns similar to Lichess when practical
- Keep backend minimal and focused:
  - game storage
  - analysis orchestration
  - puzzle persistence

---

## Board Implementation Direction

The chessboard should behave like Lichess.

Use:
- Chessground for rendering and interaction
- Lichess source as behavioral reference

Required features:
- arrow drawing
- square highlighting
- drag + click move input
- board flipping
- keyboard navigation
- move list synchronization
- engine evaluation bar
- engine toggle
- hints
- player metadata
- board-perimeter controls
- theme/piece customization

Behavior must match Lichess analysis board UX.

Reference: `ui/analyse/src/autoShape.ts`, `ui/analyse/src/keyboard.ts`

---

## State Architecture Rule

Claude should follow Lichess concepts for state separation:

- Board UI state (Chessground)
- Game state (moves, variations)
- Analysis state (engine evaluations)
- UI/tool state (mode: analysis, puzzle, etc.)

Do NOT tightly couple these layers.

Reference: `ui/analyse/src/ctrl.ts` for how Lichess separates these concerns.

## Naming & Structure Rule

- Match Lichess naming where possible
- Avoid unnecessary renaming

---

## Engine Architecture

Follow Lichess approach exactly:

- Use Stockfish WASM
- Run engine in a **Web Worker** — never on the main thread
- Communicate via UCI protocol
- Do NOT block UI during analysis

Reference implementation: `ui/lib/src/ceval/engines/stockfishWebEngine.ts`

Support:
- evaluation per move (centipawns + mate)
- best move suggestions
- win/draw/loss percentages (`winningChances.ts`)
- configurable depth / time

---

## Move Tree / Variations

Must match Lichess behavior exactly. Reference: `ui/lib/src/tree/`

Core types to match:
```typescript
type TreePath = string; // immutable path notation

type TreeNode = {
  id: string;
  ply: number;
  move: { san: string; uci: string };
  fen: string;
  eval?: { cp?: number; mate?: number; best?: string };
  glyphs: Glyph[];
  children: TreeNode[];
  comments: TreeComment[];
  clock?: Clock;
};
```

Required operations (match `ui/lib/src/tree/tree.ts` TreeWrapper interface):
- full move tree with children (not a flat list)
- side variations
- promotion to mainline
- navigation across branches
- keyboard navigation
- delete node at path
- add node / add nodes at path

Do NOT simplify this into a flat move list.

---

## Puzzle Generation Logic

Puzzle extraction should be derived from Lichess concepts.

Reference:
- `lichess-puzzle-reference.md` (in /docs)
- `modules/puzzle/` in Lichess source

Future configurable parameters:
- evaluation swing threshold
- minimum depth
- game phase filters
- time spent filters

---

## Game Import System

Game import occurs globally in the header.

Sources:
- Chess.com
- Lichess

Support:
- username import (API)
- PGN paste
- PGN file upload

Filters:
- time control
- date range
- rated/unrated

Games populate shared application state.

Backend reference: `modules/tree/src/main/ParseImport.scala`

---

## Data Storage

Anonymous users:
- IndexedDB (local)

Admin/server:
- SQLite or PostgreSQL

Rules:
- IndexedDB acts as cache + local persistence (reference: `ui/analyse/src/idbTree.ts`)
- Server storage is optional for MVP
- Do NOT introduce MongoDB, Redis, or Elasticsearch

---

## Navigation Structure

Persistent top navigation.

Routes:
- /
- /analysis
- /analysis/:gameId
- /puzzles
- /puzzles/:setId
- /openings
- /stats
- /admin

---

## Build System

Use esbuild as the bundler, matching Lichess's approach.

- pnpm workspace monorepo
- esbuild for bundling TypeScript modules
- Sass/SCSS for styles
- Content-hash filenames for cache busting (in production)

Node.js requirement: **24.13.0+**

---

## Development Workflow

- Small incremental changes only
- No large rewrites unless requested
- Preserve git history
- Developer commits manually

Workflow:
1. Claude writes/modifies code
2. Developer tests locally
3. Developer reviews via git diff
4. Developer commits
5. Developer pushes

## Definition of Done

A task is complete when:
- feature works in browser
- matches Lichess behavior
- meets acceptance criteria


## Bug Fix Protocol

When fixing bugs:
1. Identify expected behavior
2. Compare with current
3. Fix root issue only

---

## First Task Rule

When starting work:

Claude must:
- inspect existing repo
- understand current structure
- identify smallest next step
- avoid rebuilding existing systems
- follow current code patterns

---

## Reuse Priority

1. `@lichess-org/chessground` — board UI
2. `@lichess-org/pgn-viewer` — PGN display
3. Analysis board UI patterns (from `ui/analyse/`)
4. Move tree implementation (from `ui/lib/src/tree/`)
5. Engine/ceval patterns (from `ui/lib/src/ceval/`)
6. Puzzle logic (from `ui/puzzle/`)
7. Layout/styling

---

## Adaptation Rule

If Lichess code is tightly coupled:

1. Extract smallest useful behavior
2. Recreate it in this project's stack
3. Preserve user-facing behavior
4. Avoid copying unrelated infrastructure (MongoDB, Redis, Fishnet, etc.)

## File Discipline Rule

Claude must:
- only modify listed files
- not create new files unless instructed 
---

## Performance Rules

- Do not re-render board unnecessarily (Snabbdom patches only changed vnodes)
- Throttle engine updates
- Chunk large imports
- Cache analysis results (IndexedDB)

---

## UI States

Every tool must support:
- loading
- empty
- error
- ready

---

## Mobile Behavior

UI must adapt to mobile similar to Lichess.

---

## Open Source / License Rule

This project intentionally reuses Lichess-compatible concepts.

Requirements:
- preserve license notices where required (AGPL-3.0 for Lichess-derived code)
- track reused/adapted code
- do NOT copy branding or logos
- keep Patzer Pro branding original

If code is directly adapted:
- note it in a comment: `// Adapted from lichess-org/lila: <path>`

---

## Documentation

All research and notes live in:
`/docs`

Claude should consult these when relevant.

---

## Header / Navigation UI Reference

A working header and game import system was built in a previous iteration of
this project (PatzPro, React-based). Reference files have been copied into:

```
docs/reference/
  TopNav.jsx                  — main header component (logo, tool nav, import bar,
                                filters panel, mobile hamburger menu)
  AppShell.jsx                — layout wrapper that pins TopNav at the top and
                                renders the main content area below
  App.jsx                     — app root: wraps routes in GameLibraryProvider +
                                AppShell, defines tool routes
  GameLibraryContext.jsx      — shared state for platform, username, filters,
                                fetched games list, and selectedGame
  ImportControls/index.jsx    — filter pills component (time control + date range)
                                used inside the header filters panel
  GameImport/index.jsx        — scrollable game list shown after a successful import
  api/chesscom.js             — Chess.com API adapter (fetchRecentGames)
  api/lichess.js              — Lichess API adapter (stub, same interface)
```

When building the header or game import system, Claude should:

1. Read the relevant reference file(s) first
2. Understand the structure, state shape, and behavior
3. Adapt to this project's stack (TypeScript modules, not React)
4. Preserve the same user-facing behavior and feature set

These files are **reference only** — do not copy them verbatim into the new
build. Adapt patterns and behavior to match the chosen stack.

---

## Current Build Priority

1. Project setup (pnpm, esbuild, TypeScript config)
2. Chessground integration
3. Analysis board shell (Snabbdom UI + move list)
4. Move tree + navigation
5. Engine integration (Stockfish Web Worker)
6. Game import
7. Puzzle extraction MVP
8. Puzzle play
9. Persistence (IndexedDB + SQLite)
10. Admin sync

---

## Goal

Patzer Pro should feel like:

"A personal Lichess-style analysis and training environment built around your own games."

Claude should optimize for:
- fidelity to Lichess behavior
- functional correctness
- incremental progress

NOT:
- modern UI trends
- unnecessary abstraction
- reinventing solved problems
