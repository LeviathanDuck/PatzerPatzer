# Mini Sprint — Lichess Puzzle Database Integration

Date: 2026-03-21
Status: proposed
Scope: smallest safe sequence for bringing the official Lichess puzzle export into Patzer Pro without committing the raw dataset into the repo or trying to load the raw CSV directly in the browser

---

## Goal

Add a second puzzle content source to Patzer Pro using the official Lichess puzzle export, while keeping the integration honest about the current app shape:

- browser-local app
- static `public/` dev server
- no backend ingestion service
- puzzle page still being built in the current local-puzzle sprint

The target is:

- download the official export locally
- preprocess it into a Patzer-friendly format
- surface it on the puzzles page as a separate library source
- open imported Lichess puzzles in Patzer’s own puzzle controller and board UI

This sprint is intentionally not:

- “put the raw 5.8M-row CSV directly in the browser”
- “commit a giant external dataset into git”
- “replace Patzer’s own review-derived puzzle pipeline”

---

## Why this must be a separate sprint

Patzer’s first puzzle build sprint is about:

- real puzzle route ownership
- real puzzle controller state
- real solve-loop behavior
- real saved-puzzle browsing

That work should stay separate from external dataset ingestion.

Imported Lichess puzzles are a second content source, not the definition of the
whole puzzle system.

Patzer still needs:

- its own local review-to-puzzle flow
- its own puzzle controller
- its own page ownership

before imported public data becomes structurally useful.

---

## Official source facts that matter

Official source:

- [Lichess open database](https://database.lichess.org/)

As checked on 2026-03-21, the official page reports:

- the puzzle export is `lichess_db_puzzle.csv.zst`
- the export is published under CC0
- the page lists the fields:
  - `PuzzleId`
  - `FEN`
  - `Moves`
  - `Rating`
  - `RatingDeviation`
  - `Popularity`
  - `NbPlays`
  - `Themes`
  - `GameUrl`
  - `OpeningTags`

Patzer implication:

- the raw format is a compressed CSV export, not a ready-to-serve browser dataset
- the app needs a repo-safe local download path and a preprocessing step
- the imported data model should remain distinct from Patzer’s own review-derived
  candidates

---

## Current repo reality that shapes the plan

Relevant current paths:

- [build.mjs](/Users/leftcoast/Development/PatzerPatzer/build.mjs)
- [server.mjs](/Users/leftcoast/Development/PatzerPatzer/server.mjs)
- [package.json](/Users/leftcoast/Development/PatzerPatzer/package.json)
- [src/puzzles/extract.ts](/Users/leftcoast/Development/PatzerPatzer/src/puzzles/extract.ts)
- [src/idb/index.ts](/Users/leftcoast/Development/PatzerPatzer/src/idb/index.ts)
- [docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md](/Users/leftcoast/Development/PatzerPatzer/docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md)

Important current constraints:

- there is no backend ingestion pipeline
- there is no repo-safe dataset workspace yet
- `.gitignore` does not currently ignore large local dataset folders
- the static server can serve files from `public/`, which makes generated local
  shard output practical
- the raw `.csv.zst` should not be consumed directly by the app runtime

---

## Safe implementation strategy

The safest shape for this repo is:

1. raw download in an ignored local workspace
2. preprocessing into generated shard files and a manifest
3. app runtime reads the generated manifest/shards from `public/generated/`
4. puzzles page treats imported Lichess puzzles as a second library source

Recommended local paths:

- raw download:
  - `data/lichess/raw/`
- preprocessing work files:
  - `data/lichess/work/`
- app-consumable generated output:
  - `public/generated/lichess-puzzles/`

All of those should be ignored by git.

This lets Patzer use the official export without bloating the repo.

---

## Dependencies and staging

This sprint is best staged after the local puzzle-page sprint becomes real enough
to host imported content.

Practical dependency rule:

- Tasks 1 to 3 can happen before the page integration is complete.
- Tasks 4 to 7 assume the local puzzle route/controller work from
  [docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md](/Users/leftcoast/Development/PatzerPatzer/docs/mini-sprints/PUZZLES_PAGE_BUILD_SPRINT_2026-03-21.md)
  has already landed, or at least that the repo has an equivalent real puzzle
  surface by then.

Do not build a parallel “Lichess-only puzzle page” just to force the import.

---

## Sprint tasks

## Task 1 — Establish a repo-safe local dataset workspace

### Diagnosis

The repo currently has no ignored local workspace for a multi-gig puzzle export
or generated shard output.

### Small safe step

Add:

- ignored local raw/work dataset paths
- ignored generated public output path
- a short repo note explaining that raw Lichess data is local-only and should
  not be committed

### Why safe

- no runtime behavior change yet
- removes the biggest repo-hygiene risk before download work starts

---

## Task 2 — Add an official Lichess puzzle download script

### Diagnosis

The repo already has a build-time NNUE download pattern, but nothing for the
official Lichess puzzle export.

### Small safe step

Add a dedicated script to fetch `lichess_db_puzzle.csv.zst` into the ignored raw
dataset path.

Do not tie this to `npm run build`.

### Why safe

- explicit operator action
- no accidental giant download during normal frontend builds

---

## Task 3 — Add a streaming preprocessing pipeline to Patzer shard format

### Diagnosis

The browser should not load the raw compressed CSV directly.

### Small safe step

Add a preprocessing script that reads the official export and writes:

- a manifest
- fixed-size JSON shards
- only the fields Patzer actually needs for the imported library and round flow

### Why safe

- keeps runtime simple
- makes the dataset page-loadable from the existing static server

---

## Task 4 — Add imported Lichess puzzle types and loader seams

### Diagnosis

Patzer needs a distinct imported-puzzle type and adapter, not a silent overload
of the local saved-puzzle shape.

### Small safe step

Add imported puzzle types plus a loader that reads the generated manifest and
shards and adapts imported rows into Patzer’s puzzle-round model.

### Why safe

- keeps local generated puzzles and imported public puzzles separate
- creates a clean seam for the page work

---

## Task 5 — Add a puzzle-source switch and imported library surface

### Diagnosis

The puzzles page needs to distinguish:

- Patzer local saved puzzles
- imported Lichess puzzles

### Small safe step

Add a source switch and a first imported-library view using the generated shard
data.

### Why safe

- user-facing but still controlled
- avoids mixing imported rows into the local saved-puzzle list

---

## Task 6 — Open imported Lichess puzzles in Patzer’s own puzzle controller

### Diagnosis

Imported Lichess rows only become real product value once they can enter the same
puzzle-round flow Patzer is already building.

### Small safe step

Wire imported rows into the Patzer puzzle controller and board flow without
forking the page into a separate product implementation.

### Why safe

- reuses the puzzle controller work instead of duplicating it
- keeps the page coherent

---

## Task 7 — Add basic filters and lazy paging for imported puzzles

### Diagnosis

The imported library will be too large for a naive “load everything and filter
in memory” approach.

### Small safe step

Add basic import-library controls and lazy shard paging, starting with:

- rating
- themes
- opening tags

### Why safe

- keeps the imported library usable without pretending Patzer already has the
  full Lichess selection stack

---

## Deferred on purpose

Do not include these in this sprint:

- committing the raw export into the repo
- loading the raw CSV directly in the browser
- broad server-side ingestion infrastructure
- puzzle rating/voting account systems
- cloud sync of imported puzzle state
- copying every Lichess puzzle filter or dashboard feature

Those are later decisions, after the basic imported-library flow is real.
