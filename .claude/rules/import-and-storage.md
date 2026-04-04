---
paths:
  - "src/header/**"
  - "src/import/**"
  - "src/games/**"
  - "src/idb/**"
  - "src/openings/**"
  - "server/**"
---

# Game Import System

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

# Data Storage

Anonymous users:
- IndexedDB (local)

Admin/server:
- SQLite or PostgreSQL

Rules:
- IndexedDB acts as cache + local persistence (reference: `ui/analyse/src/idbTree.ts`)
- Server storage is optional for MVP
- Do NOT introduce MongoDB, Redis, or Elasticsearch

# Header / Navigation UI Reference

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
