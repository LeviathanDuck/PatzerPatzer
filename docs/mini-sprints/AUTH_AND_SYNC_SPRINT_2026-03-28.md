# Auth & Sync Sprint

**Date:** 2026-03-28
**Status:** auth works, sync partially broken (audited 2026-03-30)
**Source:** docs/FUTURE_FUNCTIONALITY.md
**Goal:** Add admin login, server-side persistence, and cross-device sync so analysis and puzzle data survives across sessions and devices.

### Task Snapshot (as of 2026-03-30)

- Task 1 — Server database module: **Done**
  Migrated from MySQL to SQLite (CCP-472)
- Task 2 — Admin auth / login: **Done**
  Lichess OAuth in `server/auth.mjs`
- Task 3 — Server API endpoints: **Done**
  `server/sync.mjs` push/pull endpoints
- Task 4 — Client sync service: **Done**
  `src/sync/client.ts` with push/pull
- Task 5 — Pull → IDB write: **Fixed (CCP-466)**
  DB name corrected, attempts now written
- Task 6 — Bidirectional validation: **Not done**
  Needs end-to-end testing

**Known blockers:** Full merge logic (last-write-wins dedup for attempts) not yet implemented. End-to-end sync validation not yet performed.

## Current State

- All user data lives in IndexedDB (browser-local only)
- No backend auth, no user accounts, no server database
- `server.mjs` is a minimal static file server with COOP/COEP headers
- CLAUDE.md specifies SQLite as the target server database
- Navigation already includes an `/admin` route (renders placeholder)
- IDB stores: imported games, analysis results, puzzle definitions, puzzle attempts, puzzle user meta, puzzle PGN cache

## Product Direction (from FUTURE_FUNCTIONALITY.md)

1. **Phase 1 — Admin login:** Secret admin login that enables server-side save/sync
2. **Phase 2 — Server persistence:** SQLite database storing all user data server-side
3. **Phase 3 — Sync layer:** IDB ↔ SQLite bidirectional sync so data is available on any device
4. **Phase 4 — (Future) User accounts:** Multi-user login, per-user data isolation

This sprint covers Phases 1–3. Phase 4 is deferred.

## Architecture Decisions

- **Auth model:** Simple shared secret (environment variable) checked via HTTP header. No OAuth, no user registration, no session cookies. Just a token that proves you're the admin.
- **Server database:** MySQL via `mysql2`. Hosted on Bluehost cPanel MySQL. Configured via `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` env vars.
- **API pattern:** REST endpoints on the existing `server.mjs`. No new framework.
- **Sync model:** Client-initiated push/pull. IDB is the primary write store. Server is the durable backup. On login, pull server state into IDB. On save, push IDB changes to server.
- **What syncs:** Imported games list (metadata only, not full PGN), analysis/review results, puzzle definitions (user-library), puzzle attempts, puzzle user meta.

## Phase 1 — Core Auth And Sync Delivery

### Task 1 — SQLite schema and server database module (CCP-210)
- Add `better-sqlite3` dependency
- Create `server/db.mjs` with SQLite init, table creation, and basic CRUD
- Tables: `users` (just admin for now), `games`, `analysis_results`, `puzzle_definitions`, `puzzle_attempts`, `puzzle_user_meta`
- Schema mirrors IDB object store shapes
- No API endpoints yet — just the database layer

### Task 2 — Admin auth middleware and login endpoint (CCP-211)
- Add `ADMIN_TOKEN` environment variable
- Add `POST /api/auth/login` endpoint: accepts `{ token }`, returns session cookie or auth header
- Add auth middleware that checks the token on protected routes
- Add `GET /api/auth/status` to check if currently authenticated

### Task 3 — Server API endpoints for data sync (CCP-212)
- `GET /api/sync/games` — list all stored game metadata
- `POST /api/sync/games` — push game metadata batch
- `GET /api/sync/puzzles` — list puzzle definitions + attempts + meta
- `POST /api/sync/puzzles` — push puzzle data batch
- `GET /api/sync/analysis` — list analysis/review results
- `POST /api/sync/analysis` — push analysis data batch
- All endpoints require admin auth

### Task 4 — Client sync service (CCP-213)
- Create `src/sync/client.ts` with push/pull functions
- `pullFromServer()`: fetch all server data, merge into IDB
- `pushToServer()`: read IDB stores, send to server
- Conflict resolution: last-write-wins by timestamp
- Track sync state (last sync time) in localStorage

### Task 5 — Admin UI: login panel and sync controls (CCP-214)
- Wire the existing `/admin` route to show a login form
- After login, show sync controls: "Push to Server", "Pull from Server", "Last synced: ..."
- Show sync status and any errors
- Show basic data counts (games, puzzles, attempts)

### Task 6 — Manager prompt for the batch (CCP-215)
- Executes CCP-210 through CCP-214 in order

## Constraints

- Do not add user registration or multi-user support yet
- Do not add OAuth or third-party auth
- Do not replace IDB as the primary client-side store
- Do not add real-time sync — manual push/pull only
- Keep the server lightweight — no Express, no heavy frameworks
- Admin token is a simple string, not a password hash (single-admin model)
