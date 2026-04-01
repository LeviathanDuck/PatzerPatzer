# Data Architecture

Defines how Patzer Pro stores, queries, and scales data.
All new storage code must conform to this document.

---

## Game Storage Model

### Target structure (per-game records)

Games must be stored as **individual IDB records** keyed by `gameId`.

```
IDB: patzer-pro
Store: games
  Key: gameId (string)
  Record: {
    id: string,
    pgn: string,             // full PGN text — loaded on demand, not at startup
    white: string | null,
    black: string | null,
    result: string,
    date: string,
    timeClass: string,
    opening: string | null,
    eco: string | null,
    source: 'lichess' | 'chesscom' | 'pgn',
    whiteRating: number | null,
    blackRating: number | null,
    importedUsername: string | null,
    importedAt: number
  }
  Indexes:
    date          — range queries for date filtering
    importedUsername — filter by importing user
    source        — filter by platform
    timeClass     — filter by speed
```

### What must NOT happen

- All games stored in a single array under one key
- PGN text loaded eagerly at startup
- Full game library held in memory as a JavaScript array

### Metadata vs PGN separation

At startup, only metadata should be loaded (or not loaded at all — loaded on
demand via cursor/index query). PGN text is loaded when the user selects a
specific game for analysis.

If a lightweight game list is needed (e.g., for the Games tab), query the
store using a cursor that reads only the metadata fields. IDB returns full
records, so if PGN size is a concern at extreme scale (100k+), consider a
separate `game-pgn` store keyed by gameId.

---

## Review / Analysis Data Model

### Current structure (acceptable)

```
IDB: patzer-pro
Store: analysis-library
  Key: gameId (string)
  Record: StoredAnalysis {
    gameId: string,
    analysisVersion: number,
    analysisDepth: number,
    status: 'idle' | 'partial' | 'complete',
    updatedAt: number,
    nodes: Record<string, StoredNodeEntry>
  }
```

Each `StoredNodeEntry` holds: `nodeId`, `path`, `fen`, `cp`, `mate`, `best`,
`loss`, `delta`, `label`, `bestLine`.

### Size per record

~250 bytes per node x ~50 mainline moves = ~12.5 KB per analyzed game.

### Rules

- Analysis is stored **once per game**, keyed by `gameId`.
- The `nodes` map is path-keyed. Do not duplicate evals in the tree, the
  eval cache, AND the IDB record. The IDB record is the persistence layer;
  the eval cache is the runtime layer.
- Partial saves are allowed (status `'partial'`) during batch analysis.
  The `updatedAt` timestamp tracks freshness.
- **Version migration, not version discard.** When the analysis schema
  changes, write a migration function that transforms old records to the
  new format. Do not silently discard previously computed analysis.

---

## Game Summary Data Model

```
IDB: patzer-pro
Store: game-summaries
  Key: gameId (string)
  Record: GameSummary { ... }  // ~450 bytes per record
```

### Rules

- One summary per analyzed game. Written after batch analysis completes.
- Summaries must be **cached in memory** after the first load. The stats
  page must not re-scan the store on every entry.
- Invalidate the cache only when new analysis completes.

---

## Puzzle Data Model

```
IDB: patzer-puzzle-v1
Stores:
  definitions   — key: id, indexes: sourceKind, createdAt, rating
  attempts      — key: auto-increment, indexes: puzzleId, completedAt
  user-meta     — key: puzzleId
  user-perf     — key: literal 'puzzle'
  rating-history — key: auto-increment, index: timestamp
```

### Rules

- `definitions` may grow to tens of thousands (imported Lichess shards).
  Never use `getAll()` — use cursors with limits or index-based queries.
- `attempts` is append-only. Enforce retention: keep last 20 attempts per
  puzzle. Prune older entries during background maintenance.
- `rating-history` is append-only. Aggregate to daily granularity after
  30 days.

---

## Openings / Research Data Model

```
IDB: patzer-openings
Stores:
  collections         — key: id, full ResearchCollection
  session             — key: literal 'current'
  training-variations — key: id
```

### Rules

- Research collections store full PGN in each `ResearchGame`. For
  collections exceeding 10k games, consider separating PGN into a
  dedicated store (same pattern as game library).
- Opening tree is built in memory from collection data. Chunked build
  (200 games/chunk with setTimeout yielding) is required.
- For collections >10k games, limit tree depth to 12 and use on-demand
  expansion for deeper nodes.

---

## Indexing Strategy

### Required indexes (IDB)

| Store | Index | Purpose |
|---|---|---|
| games.date | Non-unique | Date range filtering |
| games.importedUsername | Non-unique | Filter by user |
| games.source | Non-unique | Platform filtering |
| games.timeClass | Non-unique | Speed filtering |
| puzzle-definitions.sourceKind | Non-unique | Filter imported vs user |
| puzzle-definitions.rating | Non-unique | Rating range queries |
| puzzle-definitions.createdAt | Non-unique | Chronological ordering |
| puzzle-attempts.puzzleId | Non-unique | Attempts per puzzle |
| puzzle-attempts.completedAt | Non-unique | Time-ordered queries |
| rating-history.timestamp | Non-unique | Chronological ordering |

### Required indexes (MySQL server)

| Table | Index | Purpose |
|---|---|---|
| games | `idx_games_platform(platform, username)` | Already exists |
| games | `idx_games_date(date)` | Date range sync queries |
| games | `idx_games_updated(updated_at)` | Differential sync |
| analysis_results | `idx_analysis_updated(updated_at)` | Differential sync |
| puzzle_definitions | `idx_puzzle_defs_source(source_kind)` | Already exists |
| puzzle_definitions | `idx_puzzle_defs_rating(rating)` | Already exists |
| puzzle_attempts | `idx_puzzle_attempts_puzzle(puzzle_id)` | Already exists |
| puzzle_attempts | `idx_puzzle_attempts_completed(completed_at)` | Already exists |

### Query pattern rules

1. Never iterate an entire store when an index query suffices.
2. For "list all games matching filter X", use an IDB index + cursor with limit.
3. For "count games matching filter X", use an IDB index + cursor in count mode
   or maintain a cached count.
4. For compound filters (e.g., date + timeClass), use the most selective index
   and filter the remainder in application code.

---

## Scaling Expectations

### At 10,000 games

| Operation | Expected Behavior |
|---|---|
| App startup | < 500ms to interactive (metadata only, no PGN bulk load) |
| Game list render | Virtualized, 60fps scroll |
| Game selection | < 100ms to load PGN + hydrate eval cache |
| Stats page | < 200ms from cached summaries |
| Import 100 games | < 5s including parse + dedupe + save |
| Sync push (100 changed) | < 5s |

### At 30,000 games

| Operation | Expected Behavior |
|---|---|
| App startup | < 1s to interactive |
| Game list render | Virtualized, filtered via index query |
| Sync push (delta) | < 10s for typical session changes |
| Full re-sync | Minutes — acceptable as rare operation |

### At 60,000+ games

| Operation | Expected Behavior |
|---|---|
| IDB total size | < 1.5 GB (within browser quotas) |
| List queries | Index-driven, never full scan |
| Sync | Paginated differential only |
| Consideration | Server-primary with IDB as cache may be required |

---

## Storage Limits & Warnings

### Browser IDB quotas

| Browser | Quota |
|---|---|
| Chrome/Edge | ~50% of available disk (typically 10-20 GB) |
| Firefox | 10 GB per origin |
| Safari | 10 GB per origin (may prompt user) |

### Warning thresholds

- At 500 MB IDB usage: log a console warning.
- At 1 GB IDB usage: warn the user in the UI. Suggest server sync.
- Request persistent storage (`navigator.storage.persist()`) on first game
  import to prevent browser eviction.

### Estimating footprint

| Component | Per Game | 30k Games |
|---|---|---|
| PGN + metadata | ~3.2 KB | ~96 MB |
| Analysis (if reviewed) | ~12.5 KB | ~375 MB |
| Game summary | ~450 B | ~13.5 MB |
| **Total per reviewed game** | **~16.2 KB** | **~485 MB** |

At 30k fully-reviewed games, IDB usage approaches 500 MB. This is within
quotas but warrants the persistent storage request and user warnings.
