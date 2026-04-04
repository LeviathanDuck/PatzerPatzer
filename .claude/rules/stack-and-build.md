---
paths:
  - "src/**/*.ts"
  - "package.json"
  - "tsconfig.json"
  - "esbuild*"
  - "server/**"
---

# Technical Direction

## Preferred Stack (Closest to Lichess)

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

## Acceptable Alternative (Simplified)

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

## Key Lichess Packages to Reuse Directly

These are published npm packages. Import them, do not reimplement them.

| Package | Purpose |
|---|---|
| `@lichess-org/chessground` | Chess board UI — rendering, interaction, drag/click |
| `@lichess-org/pgn-viewer` | PGN display component |
| `snabbdom` | Virtual DOM (matches Lichess UI rendering pattern) |
| `chessops` | TypeScript chess logic (move gen, validation, FEN, PGN) |

## Frontend Rules

- Do NOT use React
- Do NOT build a component-heavy UI system
- Do NOT manipulate the DOM directly with `querySelector` / `innerHTML` patterns
- Do NOT introduce unnecessary abstraction layers
- All UI must be built using Snabbdom vnode patterns (`h()`), not ad-hoc DOM updates
- Use **Snabbdom** (`h()` + `patch()`) for all UI rendering — this is exactly what Lichess does
- Use **Chessground** directly for the board
- Keep UI logic close to Lichess module patterns
- Build a thin app shell around Lichess-like behavior

## TypeScript Configuration

Match Lichess TypeScript settings:
- Strict mode: `"strict": true`
- Target: `"ES2021"`
- Module resolution: `"bundler"`
- Path alias: `@/*` maps to `src/*`
- No JSX

## Backend Rules

- Do NOT default to Express unless necessary
- Prefer architecture patterns similar to Lichess when practical
- Keep backend minimal and focused:
  - game storage
  - analysis orchestration
  - puzzle persistence

## Build System

Use esbuild as the bundler, matching Lichess's approach.

- pnpm workspace monorepo
- esbuild for bundling TypeScript modules
- Sass/SCSS for styles
- Content-hash filenames for cache busting (in production)

Node.js requirement: **24.13.0+**
