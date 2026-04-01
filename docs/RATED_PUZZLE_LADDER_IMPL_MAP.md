# Rated Puzzle Ladder — Implementation Map

Generated: 2026-03-29
Source: CCP-263 (Phase 1 research outputs)
Last audited: 2026-03-30

> **Note (2026-03-30):** Cloud sync functions in `puzzleDb.ts` were dead code until CCP-463 wired
> `syncRatedLadder()` into the auth flow and rated stream stop. The sync client also had a DB name
> mismatch (`patzer-puzzle-db` vs `patzer-puzzle-v1`) fixed in CCP-466. Server DB migrated from
> MySQL to SQLite in CCP-472. Cloud sync is now wired but has not been end-to-end validated.

---

## Current file ownership

| Domain | TypeScript owner | IDB persistence | Server persistence |
|---|---|---|---|
| Puzzle definitions | `src/puzzles/types.ts` → `PuzzleDefinition` | `puzzleDb.ts` → `definitions` store | `server/db.mjs` → `puzzle_definitions` table |
| Puzzle attempts | `src/puzzles/types.ts` → `PuzzleAttempt` | `puzzleDb.ts` → `attempts` store | `server/db.mjs` → `puzzle_attempts` table |
| User meta (folders, tags) | `src/puzzles/types.ts` → `PuzzleUserMeta` | `puzzleDb.ts` → `user-meta` store | `server/db.mjs` → `puzzle_user_meta` table |
| Round lifecycle | `src/puzzles/ctrl.ts` → `PuzzleRoundCtrl` | n/a — transient | n/a |
| Session mode | `src/puzzles/ctrl.ts` → `currentSessionMode` field | n/a — transient | n/a |
| User puzzle perf (rating) | **MISSING** — `PuzzleRatingSnapshot` stub exists in `types.ts` but is not an owned type or stored | **MISSING** | **MISSING** |
| Rating history | **MISSING** | **MISSING** | **MISSING** |
| Auth identity | `server/auth.mjs` → `getSession(req).username` | n/a | sessions in memory |
| Sync | `server/sync.mjs` | n/a | global, not user-scoped |

---

## Locked divergences from Lichess

| Lichess behavior | Patzer divergence | Reason |
|---|---|---|
| Puzzle Glicko updates on every rated solve | **Imported puzzle ratings stay fixed** | Personal tool; imported CSV is the authority |
| User rating + puzzle rating updated as a Glicko game | **Only user rating updates** | Follows from fixed puzzle ratings |
| dubiousPuzzle suppression for puzzle rating movement | **Not applicable** | Puzzle ratings are fixed |
| PuzzleTier / PuzzlePath infrastructure for selection | **Simplified selection** | No MongoDB tier infrastructure |
| Server-stored user perfs (MongoDB) | **Local-first IDB + optional MySQL sync** | Personal tool; single user |

---

## Section-by-section file ownership for sprint tasks

### Phase 2 — Type foundations
- File: `src/puzzles/types.ts`
- Add: `UserPuzzlePerf`, `PuzzleGlicko`, `PuzzleRatingHistoryEntry`, `RatedEligibilityReason`, `RatedScoringOutcome`, `PuzzleDifficultyOffset`

### Phase 3 — Local persistence
- File: `src/puzzles/puzzleDb.ts`
- Add: `user-perf` IDB store (one record, keyed by `'puzzle'`), `rating-history` IDB store (keyed by auto-increment), extend `PuzzleAttempt` on the attempts store with `ratedOutcome` field
- Bump `DB_VERSION` to 2

### Phase 4 — Session policy and assistance
- Files: `src/puzzles/ctrl.ts`, `src/puzzles/types.ts`
- Add: session mode flag on `PuzzleRoundCtrl`, assistance warning state, remember-choice state, cancel/switch/stay-rated branches

### Phase 5 — Eligibility and selection
- Files: `src/puzzles/ctrl.ts`, `src/puzzles/puzzleDb.ts`
- Add: source gating (imported-lichess only for rated), solved-repeat eligibility rule, recent-failure exclusion (1 week), rating-aware selection

### Phase 6 — Rating calculator and completion
- Files: `src/puzzles/ctrl.ts` (new service inline or `src/puzzles/ratingCalc.ts` if scope requires), `src/puzzles/puzzleDb.ts`
- Add: Glicko-2 calculator (user-only), rated success path, rated failure path, snapshot/history writes

### Phase 7 — Rated ladder UI
- Files: `src/puzzles/view.ts`, `src/styles/main.scss`
- Add: rated/practice toggle, difficulty selector, assistance warning modal, solved-repeat messaging, current rating + round delta display

### Phase 8 — Cloud ownership and sync
- Files: `server/db.mjs` (new tables), `server/sync.mjs` (new routes), `server/auth.mjs` (user-scoped access), `src/puzzles/puzzleDb.ts` (client push/pull)

---

## Remaining blockers before implementation

None. All audit findings confirmed. File boundaries are clean. Type stubs (`PuzzleRatingSnapshot`, `PuzzleSessionMode`, `currentSessionMode`) are forward-compatible with the planned additions.

---

## Rated Puzzle Stream

Added: 2026-03-29 (CCP-311, Phase 1 of RATED_PUZZLE_STREAM_SPRINT)

### Lichess reference behavior (source-confirmed)

Lichess serves rated puzzles via a **path-based** model:
- Offline batch job builds `puzzle2_path` MongoDB collection: arrays of puzzle IDs keyed by `angle|tier|ratingRange`
- Session tracks which path is active + position within it (`positionInPath`)
- On each next-puzzle request: read puzzle at current position, check `PuzzleRound` for already-played, advance position or switch paths
- Rating window: `userRating + difficultyDelta ± ratingFlex` where `ratingFlex = (100 + abs(1500-r)/4) * compromise`, starting ~100–150 and expanding on retry
- Already-played retries: up to 5 times advances the path position; after 5, serves the repeat anyway (or steps down tier)
- Path switching: picks a new path from `puzzle2_path` excluding `previousPaths` (Set of path IDs used this session)

### Patzer divergences (locked)

| Lichess | Patzer | Reason |
|---|---|---|
| Pre-built path arrays in MongoDB | IDB definitions query + shard fallback | No server-side path infrastructure |
| Sequential position within a path | Random selection within rating window | Simpler; acceptable for single user |
| Per-user `PuzzleRound` already-played check | IDB `getPuzzleRatedEligibility()` (already-solved + 7-day failure cooldown) | Same intent, different backing store |
| Server-session path state | Module-level `_sessionSeenIds: Set<string>` | Single-user client |
| `previousPaths` path-level deduplication | Puzzle-level `_sessionSeenIds` deduplication | Same effect without path infrastructure |

### Shard fallback contract

**Owner:** private helper `findRatedPuzzleInShards()` in `src/puzzles/ctrl.ts`

**Reason for ctrl.ts (not puzzleDb.ts):** `ctrl.ts` already imports from both `shardLoader.ts` and `puzzleDb.ts`; adding shard imports to `puzzleDb.ts` would violate its IDB-only layer principle.

**Signature:**
```typescript
async function findRatedPuzzleInShards(
  targetRating: number,
  windowHalf: number,
  excludeIds: Set<string>,
): Promise<PuzzleDefinition | null>
```

**Algorithm:**
1. Load manifest via `loadManifest()`
2. Find candidate shards via `findMatchingShards(manifest, { ratingMin: targetRating - windowHalf, ratingMax: targetRating + windowHalf })`
3. If no candidate shards: return null
4. Pick one candidate shard at random (avoid loading all shards)
5. Load and filter it via `loadFilteredShard(shardId, { ratingMin, ratingMax })`
6. Filter out IDs in `excludeIds`
7. If filtered set is empty: try one more shard; if still empty, return null
8. Pick one record at random; convert via `lichessShardRecordToDefinition()`
9. Save to IDB via `savePuzzleDefinition()` (upsert — this is how shard-loaded puzzles become IDB definitions)
10. Return the `PuzzleDefinition`

### `startRatedSession()` contract

**Owner:** `src/puzzles/ctrl.ts`

1. Set `_currentSessionMode = 'rated'`
2. Clear `_sessionSeenIds`, reset `_ratedStreamCount = 0`, set `_ratedStreamActive = true`, `_emptyRatedStream = false`
3. Call `selectNextRatedPuzzle()` (which will try IDB then shard fallback)
4. If puzzle found: increment `_ratedStreamCount`, add id to `_sessionSeenIds`, call `openPuzzle(def, redraw)`
5. If null: set `_emptyRatedStream = true`, set `_ratedStreamActive = false`, call `redraw()`

### Auto-advance contract

**Hook point:** end of the rated scoring async IIFE in `recordAttempt()`, after `persistUserPerf()` and `appendRatingHistory()` have settled

**Guard:** only fires when `_ratedStreamActive === true`

**Algorithm:**
1. Add completed puzzle ID to `_sessionSeenIds`
2. After 300 ms (`setTimeout`), call `selectNextRatedPuzzle()` again
3. If puzzle found: increment `_ratedStreamCount`, add to `_sessionSeenIds`, call `openPuzzle()` + `redraw()`
4. If null: set `_emptyRatedStream = true`, set `_ratedStreamActive = false`, call `redraw()`

**Race condition:** if user manually navigates during the 300 ms delay, `openPuzzle()` will overwrite their navigation. Deferred — acceptable for MVP; fix in a follow-up by checking if the user has navigated before calling `openPuzzle()`.

### Left-panel entry point contract

**Owner:** `renderRatedStreamEntry(redraw)` in `src/puzzles/view.ts`

**Elements:**
- Rating display: `getCurrentUserPerf().glicko.rating.toFixed(0)` + `±` + deviation
- Difficulty selector: mapped to `PuzzleDifficulty` values (Easy/Normal/Hard/Hardest)
- If stream not active: "Start Rated" button → calls `startRatedSession(redraw)`
- If stream active: "Puzzle N" counter + "Stop" button → calls `stopRatedStream()` + `redraw()`
- If `isEmptyRatedStream()`: empty-state message

**Placement in view.ts:** above or alongside the existing session mode toggle, inside the left sidebar panel.

**CSS class:** `.puzzle__rated-stream-entry`

### `_sessionSeenIds` threading

`_sessionSeenIds: Set<string>` is module-level state in `ctrl.ts`.
- Cleared by `startRatedSession()`
- `selectNextRatedPuzzle()` receives it as a parameter (or reads the module-level var directly — same module, either is fine)
- `findRatedPuzzleInShards()` receives it as a parameter to filter shard results
- Both IDB path and shard path respect the exclusion list
