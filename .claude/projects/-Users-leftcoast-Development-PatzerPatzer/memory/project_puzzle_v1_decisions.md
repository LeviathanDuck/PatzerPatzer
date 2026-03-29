---
name: Puzzle V1 key product decisions
description: User decisions on puzzle board tree model, save-from-LFYM behavior, and imported puzzle data expectations
type: project
---

Puzzle board tree model: user wants full tree exploration during puzzle solving, not Lichess-style locked-to-solution-path. Users can freely create side variations and explore, but strict correctness grading still applies in the attempt log. This is an explicit Patzer divergence from Lichess standard puzzle behavior. Decided 2026-03-27.

**Why:** User values flexibility and learning over strict puzzle-mode lockdown.
**How to apply:** Puzzle round controller (Phase 2) must use the full TreeNode hierarchy, not a simplified linear model. Solution checking runs against the stored solution but does not prevent exploration.

Save-from-LFYM behavior: silent save with confirmation message, stay on analysis page. User navigates to /puzzles themselves later. No auto-redirect or modal prompt. Decided 2026-03-27.

**Why:** User wants a non-disruptive flow that keeps them in their current analysis context.
**How to apply:** Phase 4 save action should show a brief confirmation (toast or inline message) and not navigate away.

Imported puzzle shard data: user initially thought the shards were incomplete or broken. Clarified that the format (FEN + moves + metadata, no PGN) matches the official Lichess puzzle database distribution. User accepted this is sufficient for V1. Full PGN enrichment remains explicitly out of scope per V1 plan. Discussed 2026-03-27.

**Why:** 5.8M puzzle records; fetching full games would require a separate ingestion pipeline.
**How to apply:** Adapters (CCP-147) should work with the existing shard format as-is. Do not plan for full PGN in imported puzzles.
