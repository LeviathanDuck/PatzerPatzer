# Batch Triage Audit — 2026-04-02

## Purpose

After fixing the sprint audit process (audit prompt templates now include task notes, and
`Audit Confirmed Done` requires confirmed implementation evidence), we triaged all sprints
with `Completed Needs Full Review` status to identify real mismatches vs genuinely complete work.

## Method

Used parallel Explore agents to check each unaudited task's implementation evidence in the
codebase. Each task was checked for the existence of the described feature in code, not for
quality or completeness of polish.

## Results

### SPR-001 — Analysis Controls Parity (7 tasks)
All DONE. `analysisControls.ts` contains three-zone control bar, hamburger menu, action menu,
explorer button, and migrated actions. No gaps.

### SPR-003 — Play Against Computer at Various Strength Levels (26 tasks)
All DONE. Full implementation chain: engine types/config (`src/engine/types.ts`), protocol
methods (`src/ceval/protocol.ts`), play mode lifecycle (`src/engine/ctrl.ts`), play move API
(`src/engine/playMove.ts`), practice session integration, strength selector UI
(`src/engine/strengthView.ts`), and responsive styles.

### SPR-006 — Openings Opponent Tool Suite (7 tasks)
6 DONE, 1 MISMATCH:
- **SPR-006-T01 (Phase 1 — Grounding & Implementation Map)**: No implementation found.
  This was a grounding/research phase. All downstream phases (T02-T07) are implemented,
  suggesting the grounding work was done informally but never formalized.

### SPR-007 — Openings Page Implementation (5 tasks)
All DONE. Openings subsystem fully implemented: separate db/types/import modules, import
workflow with filters, tree builder, played lines panel, collections management.

### SPR-008 — Openings Research Report Upgrade (3 tasks)
2 DONE, 1 MISMATCH:
- **SPR-008-T01 (Phase 5 — Research Model & Import Integrity)**: PGN upload is still
  paste-only (textarea in view.ts), not actual file upload as described in the sprint plan.
  Settings snapshot and provenance types exist, but file upload is the gap.

### SPR-012 — Rated Puzzle Ladder & Cloud Ownership (8 tasks)
All DONE. Full Glicko-2 implementation, rated session policy, difficulty selector, rating
display UI, cloud sync wiring.

## Mismatches

| Task | Gap | Severity |
|------|-----|----------|
| SPR-006-T01 | Grounding/research phase — no formal deliverable | Low (downstream phases all implemented) |
| SPR-008-T01 | PGN file upload missing — still paste-only | Medium (feature gap, not blocking) |

## Process Changes That Prompted This Audit

1. Audit prompt templates now include task `notes` so auditors see implementation gaps
2. `Audit Confirmed Done` now requires confirmed implementation evidence, not just a completed prompt
3. `prompt:complete` auto-resolves `Audit Found Mismatch` when a follow-up prompt completes
4. Dashboard shows a "Mismatch Follow-up" panel with copyable agent prompt for sprints with gaps
