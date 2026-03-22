## Local Lichess Puzzle Dataset Workspace

This folder is the repo-safe local workspace for official Lichess puzzle export work.

The large raw export and preprocessing outputs are intentionally ignored by git:

- `data/lichess/raw/` — downloaded official `lichess_db_puzzle.csv.zst`
- `data/lichess/work/` — local preprocessing scratch files and metadata
- `public/generated/lichess-puzzles/` — generated manifest and shard files served locally by Patzer

Do not commit the raw export or generated shards into the repo.

Use the dedicated dataset scripts instead of wiring this download into `npm run build`.
