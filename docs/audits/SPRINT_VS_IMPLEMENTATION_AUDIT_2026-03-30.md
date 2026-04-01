# Sprint vs Implementation Audit — 2026-03-30

## Purpose

Cross-reference all sprint docs against prompt history and implemented code to identify
what has been planned but not yet implemented, what has issues, and what docs need updating.

---

## Started But Never Reviewed — 52 Prompts

These prompts were created, marked as started (queued-started), but never reviewed.
All have status "created" and reviewOutcome "pending". All ran on 2026-03-30.

### Openings Opponent Tool Suite Sprint (31 prompts)

**Batch Managers (6):**
| CCP | Title | Started |
|---|---|---|
| CCP-323 | Openings Opponent Tool Suite Full Sprint Batch Manager | 04:55 |
| CCP-324 | Grounding And Implementation Map Batch Manager | 04:58 |
| CCP-331 | Tool Shell And Mode Architecture Batch Manager | 05:15 |
| CCP-339 | Opponent Analytics Foundation Batch Manager | 05:23 |
| CCP-347 | Repertoire Tool Full Page Upgrade Batch Manager | 05:30 |
| CCP-355 | Prep Report Dashboard Batch Manager | 05:45 |

**Audit & Grounding (5):**
| CCP | Title | Started |
|---|---|---|
| CCP-325 | Audit Current Openings Session Shell And Ownership Seams | 04:58 |
| CCP-326 | Audit Puzzle Sidebar And Library Patterns For Openings Tool Rail | 04:59 |
| CCP-327 | Recheck Lichess References For Board Tool Layout And Practice Flow | 04:59 |
| CCP-328 | Audit Current Opponent Analytics Seams From Imported Research Data | 05:14 |
| CCP-329 | Audit Current Board Engine And Practice Seams For Practice Against Them | 05:14 |

**Architecture & Implementation (8):**
| CCP | Title | Started |
|---|---|---|
| CCP-330 | Grounding And Implementation Map Review | 05:15 |
| CCP-332 | Add Canonical Openings Tool Types And Session Tool State | 05:15 |
| CCP-333 | Add Active Tool Selection Accessors And Reset Rules | 05:16 |
| CCP-334 | Render Persistent Left Tool Rail In The Openings Session | 05:17 |
| CCP-335 | Refactor Session Main Content To Active Tool Takeover Layout | 05:19 |
| CCP-336 | Extract Current Session Into Dedicated Repertoire Tool Owner | 05:20 |
| CCP-337 | Persist Active Tool Selection In Openings Session Resume State | 05:21 |
| CCP-338 | Tool Shell And Mode Architecture Review | 05:22 |

**Opponent Analytics (7):**
| CCP | Title | Started |
|---|---|---|
| CCP-340 | Add Canonical Opponent Analytics Types And Dashboard Section Models | 05:23 |
| CCP-341 | Add Base Collection Analytics Loader From Imported Research Games | 05:24 |
| CCP-342 | Add Repertoire Breadth Predictability And Opening Concentration Metrics | 05:26 |
| CCP-343 | Add Recency And Form Analytics From Imported Opponent Game History | 05:26 |
| CCP-344 | Add Prep Report Analytics Summaries From Collection History | 05:27 |
| CCP-345 | Add Opponent Analytics Cache And Controller Owner Seam | 05:28 |
| CCP-346 | Opponent Analytics Foundation Review | 05:29 |

**Repertoire Tool Upgrade (5):**
| CCP | Title | Started |
|---|---|---|
| CCP-348 | Render Repertoire As First Class Full Page Tool | 05:30 |
| CCP-349 | Add Repertoire Overview Dashboard Section Above Tree | 05:31 |
| CCP-350 | Add Repertoire Summary Modules For Perspective Speed And Recency | 05:33 |
| CCP-351 | Add Line Insight Cards Tied To Practical Opponent Prep Signals | 05:34 |
| CCP-352 | Strengthen Sample Game And Current Position Interplay Inside Repertoire | 05:35 |

### Improvement Intelligence Platform Sprint (20 prompts)

**Batch Managers (5):**
| CCP | Title | Started |
|---|---|---|
| CCP-398 | Improvement Intelligence Platform Full Sprint Batch Manager | 06:31 |
| CCP-394 | Quick Wins Batch Manager | 06:31 |
| CCP-395 | Foundation Spine Batch Manager | 06:36 |
| CCP-396 | Weakness Engine Batch Manager | 06:46 |
| CCP-397 | Stats Surfaces Batch Manager | 08:03 |

**Foundation & Core (6):**
| CCP | Title | Started |
|---|---|---|
| CCP-379 | Enable Clock Data On Lichess Import | 06:31 |
| CCP-380 | Add GameSummary Type And Persistence | 06:36 |
| CCP-381 | Extract GameSummary From Analyzed Games | 06:38 |
| CCP-382 | Backfill Missing GameSummaries | 06:41 |
| CCP-383 | Add Stats Controller And Route Wiring | 06:43 |
| CCP-390 | Persist Retro Session Results | 06:32 |

**Weakness Engine (2):**
| CCP | Title | Started |
|---|---|---|
| CCP-384 | Build Weakness Aggregation Engine | 06:46 |
| CCP-391 | Add Weakness Training Actions | 08:02 |

**Stats Dashboard UI (7):**
| CCP | Title | Started |
|---|---|---|
| CCP-385 | Add Stats Weakness Panel | 08:01 |
| CCP-386 | Add Accuracy And Blunder Trend Charts | 08:03 |
| CCP-387 | Add Opening Performance Table | 08:04 |
| CCP-388 | Add Tactical Profile Section | 08:04 |
| CCP-389 | Add Post Game Summary Panel | 08:05 |
| CCP-392 | Add Time Management Profile Section | 08:07 |
| CCP-393 | Add Conversion And Resourcefulness Metrics | 08:08 |

### Ad Hoc (1 prompt)

| CCP | Title | Started |
|---|---|---|
| CCP-322 | Redesign Openings White Black Flip Control Group | 03:56 |

---

## Sprint-by-Sprint Analysis

### 1. Opponent Research Platform Sprint (`OPPONENT_RESEARCH_PLATFORM_SPRINT_2026-03-29.md`)

**9 phases planned.** This is the largest active sprint.

| Phase | Description | Status | Notes |
|---|---|---|---|
| 1 | Rename Openings → Opponents | **Done** | CCP-399 passed |
| 2 | Sparkline win/draw/loss indicators | **Partial — typecheck failures** | CCP-406/410 have `exactOptionalPropertyTypes` failures in `openings/view.ts` |
| 3 | Termination profile panel | **Partial — typecheck failures** | CCP-408 has typecheck failure in `openings/analytics.ts` |
| 4 | Deviation detection engine | **Code exists** but deviation markers never render in move rows (CCP-417) — only summary panel landed |
| 5 | Recommendations panel | **Not implemented** | CCP-452 integration review missed blockers |
| 6 | Trap pattern detection | **Code exists** (`openings/traps.ts`) — UI integration unclear |
| 7 | Sample-size warnings | **Not implemented** | No matching CCP found executed |
| 8 | Recency-weighting | **Not implemented** | No matching CCP found executed |
| 9 | Save variations to ORP | **Not implemented** | ORP drill system still deferred |

**Verdict: Phases 1–4 partially landed with bugs. Phases 5–9 not implemented.**

---

### 2. Openings Opponent Tool Suite Sprint (`OPENINGS_OPPONENT_TOOL_SUITE_SPRINT_2026-03-29.md`)

**7 phases planned.** Major architectural overhaul of openings into 4-tool suite.

| Phase | Description | Status | Notes |
|---|---|---|---|
| 1 | Left-rail tool selector | **Not implemented** | No left-rail layout exists |
| 2 | Repertoire tool (ORP) | **Not implemented** | ORP types defined but no drill UI |
| 3 | Prep Report tool | **Partial** | `analytics.ts` computes prep reports; no standalone tool view |
| 4 | Style Analysis tool | **Partial** | `analytics.ts` has style analysis; no standalone tool view |
| 5 | Practice Against Them tool | **Not implemented** | 11 unreviewed prompts (CCP-349–355+) |
| 6 | Shared analytics layer | **Partial** | `analytics.ts` exists but not structured as shared service |
| 7 | Full-page dashboards | **Not implemented** | No dashboard layout |

**Verdict: Analytics computation exists. UI framework (left-rail, tool views, dashboards) not built. 11 prompts still unreviewed.**

---

### 3. Rated Puzzle Ladder & Cloud Ownership Sprint (`RATED_PUZZLE_LADDER_AND_CLOUD_OWNERSHIP_SPRINT_2026-03-29.md`)

**8 phases planned.**

| Phase | Description | Status | Notes |
|---|---|---|---|
| 1 | Types & local rating domain | **Done** | `UserPuzzlePerf` with Glicko-2, `RatingHistoryEntry` in types.ts |
| 2 | Persistence layer | **Done** | `puzzleDb.ts` has user-perf and rating-history stores |
| 3 | Rated session policy | **Done** | Session mode (practice/rated), difficulty selector |
| 4 | Eligibility & selection | **Done** | Cooldown logic, `findRatedPuzzleFromShards` exists (but in wrong file per CCP-309) |
| 5 | Rating calculator | **Done** | Glicko-2 implementation in ctrl.ts |
| 6 | Rated UI surfaces | **Done** | Rating delta display, difficulty chart |
| 7 | Cloud sync for ratings | **Broken** | CCP-305: never pulls/merges rating history, not wired to runtime |
| 8 | Integration validation | **Failed** | CCP-321: shard fallback still has typecheck failures |

**Verdict: Phases 1–6 implemented. Phase 7 (cloud sync) is dead code. Phase 8 has unresolved typecheck issues.**

---

### 4. Rated Puzzle Stream Sprint (`RATED_PUZZLE_STREAM_SPRINT_2026-03-29.md`)

**4 phases planned.**

| Phase | Description | Status | Notes |
|---|---|---|---|
| 1 | Shard loader integration | **Partial** | Shard loading exists but typecheck failures remain |
| 2 | Auto-advance stream | **Implemented** | Rated stream with auto-next in ctrl.ts |
| 3 | Gap-fixing for shard loader | **Not confirmed** | CCP-310/312 had issues |
| 4 | Stream UI polish | **Unknown** | No clear CCP mapped |

**Verdict: Core stream works. Shard integration has lingering typecheck issues.**

---

### 5. Improvement Intelligence Platform Sprint (`IMPROVEMENT_INTELLIGENCE_PLATFORM_SPRINT_2026-03-29.md`)

**15 tasks planned.** The largest sprint by task count.

| Task | Description | Status | Notes |
|---|---|---|---|
| 1 | Clock data capture at import | **Done** | Import adapters extract clocks |
| 2 | GameSummary type definitions | **Done** | `stats/types.ts` has full schema |
| 3 | GameSummary extraction | **Done** | `stats/extract.ts` generates summaries from analysis |
| 4 | GameSummary backfill | **Done** | Backfill for pre-existing analyzed games |
| 5 | Stats controller & routing | **Done** | `stats/ctrl.ts` with time-filter |
| 6 | Weakness detection engine | **Done** | `stats/weakness.ts` with 8 detectors |
| 7 | Weakness dashboard panel | **Partial** | `stats/view.ts` has placeholder sections, not full cards |
| 8 | Trend charts | **Partial** | SVG polyline chart exists but minimal |
| 9 | Opening performance section | **Not implemented** | No opening-specific stats view |
| 10 | Tactical profile section | **Not implemented** | No tactical breakdown view |
| 11 | Post-game summary panel | **Not implemented** | No post-game summary in analysis view |
| 12 | Retro persistence integration | **Done** | Retro results stored in IDB |
| 13 | Training recommendations | **Not implemented** | Weakness detectors suggest actions but no UI |
| 14 | Conversion metrics | **Not implemented** | Data computed in extract.ts but no view |
| 15 | Time management section | **Not implemented** | Clock data captured but no stats view |

**Verdict: Data layer (tasks 1–6, 12) is solid. UI layer (tasks 7–11, 13–15) is mostly placeholder or missing. 11 prompts still unreviewed.**

---

### 6. Auth & Sync Sprint (`AUTH_AND_SYNC_SPRINT_2026-03-28.md`)

**6 tasks planned.**

| Task | Description | Status | Notes |
|---|---|---|---|
| 1 | Lichess OAuth login | **Done** | `server/auth.mjs` with OAuth flow |
| 2 | Server-side SQLite persistence | **Partial** | `server/db.mjs` exists but CCP-226 used MySQL instead of SQLite |
| 3 | Sync client service | **Partial** | `server/sync.mjs` exists but CCP-229 missing merge logic |
| 4 | IDB → server push | **Partial** | Push exists but incomplete |
| 5 | Server → IDB pull | **Broken** | Never writes pulled puzzle attempts to IndexedDB |
| 6 | Bidirectional sync validation | **Failed** | CCP-230/231 batch had child failures |

**Verdict: Auth works. Sync is partially broken — push works, pull doesn't write to IDB, merge logic missing.**

---

### 7. Puzzle Page Mobile Usability Sprint (`PUZZLE_PAGE_MOBILE_USABILITY_SPRINT_2026-03-28.md`)

**5 tasks planned.**

| Task | Description | Status | Notes |
|---|---|---|---|
| 1 | CSS layout for portrait mobile | **Done** | |
| 2 | Library builder mobile | **Done** | |
| 3 | Feedback/actions mobile | **Done** | |
| 4 | Engine/move/session stacking | **Done** | |
| 5 | Polish pass | **Done** | |

**Verdict: Complete. All passed review.**

---

### 8. Mobile Analysis Usability Sprint (`MOBILE_ANALYSIS_USABILITY_SPRINT_2026-03-21.md`)

**6 tasks planned.**

| Task | Description | Status | Notes |
|---|---|---|---|
| 1 | Real layout mode | **Done** | |
| 2 | Hidden chrome | **Done** | |
| 3 | Board-adjacent controls | **Done** | |
| 4 | Readable tools stack | **Done** | |
| 5 | Secondary underboard | **Done** | |
| 6 | Touch affordances | **Done** | CCP-249-F2 has minor desktop+mobile regression |

**Verdict: Complete. One minor regression noted.**

---

### 9. Analysis Controls Parity Sprint (`ANALYSIS_CONTROLS_PARITY_SPRINT_2026-03-29.md`)

**7 tasks planned.**

| Task | Description | Status | Notes |
|---|---|---|---|
| 1 | Extract analysis-controls owner | **Done** | `analyse/analysisControls.ts` |
| 2 | Lichess-style action shell | **Done** | |
| 3 | Hamburger menu | **Done** | |
| 4 | Migrate existing actions | **Partial** | Legacy `.analyse__actions` path still in main.ts |
| 5 | Explorer button | **Partial** | Typecheck failure in explorer control-bar |
| 6 | Clean duplicate header entries | **Not confirmed** | |
| 7 | Final validation | **Failed** | CCP-245 left typecheck failures |

**Verdict: Foundation done. Migration incomplete — legacy render path and typecheck failures remain.**

---

### 10. Background Bulk Review Sprint (`SPRINT_BACKGROUND_BULK_REVIEW.md`)

**5 sprints planned.**

| Sprint | Description | Status | Notes |
|---|---|---|---|
| 1 | Two-engine architecture | **Done** | Separate review queue engine |
| 2 | Route resilience | **Done** | Review continues across navigation |
| 3 | Progress display | **Done** | Per-entry tracking |
| 4 | Settings submenu | **Done** | In global settings menu |
| 5 | Polish | **Done** | |

**Verdict: Complete. All passed review.**

---

### 11. Openings Page OpeningTree Implementation (`OPENINGS_PAGE_OPENINGTREE_IMPLEMENTATION_2026-03-27.md`)

**4 phases planned.**

| Phase | Description | Status | Notes |
|---|---|---|---|
| 1 | Ownership & persistence | **Done** | `openings/db.ts` |
| 2 | Import flow | **Done** | Full Lichess/Chess.com/PGN import |
| 3 | Tree build & board | **Done** | `openings/tree.ts` with FEN normalization |
| 4 | Played lines & report | **Done** | Analytics computed |

**Verdict: Complete.**

---

### 12. Openings Research Report Upgrade Sprint (`OPENINGS_RESEARCH_REPORT_UPGRADE_SPRINT_2026-03-28.md`)

**3 phases (5–7) planned.**

| Phase | Description | Status | Notes |
|---|---|---|---|
| 5 | Research model & source integrity | **Partial** | Import pipeline has `exactOptionalPropertyTypes` issues (CCP-324) |
| 6 | Opening-tree accuracy with position-keyed graphs | **Done** | FEN normalization, transposition awareness |
| 7 | Comparative prep value | **Partial** | Prep report computes but full comparative view not built |

**Verdict: Core accuracy work done. Import typecheck issues and comparative view remain.**

---

### 13. Puzzle V1 Phased Execution (`PUZZLE_V1_PHASED_EXECUTION_2026-03-27.md`)

**Historical record — 5 phases.**

| Phase | Description | Status | Notes |
|---|---|---|---|
| 1 | Ownership & data | **Done** | |
| 2 | Minimal shell | **Done** | |
| 3 | Strict solve loop | **Done** | |
| 4 | Engine assist | **Done** | |
| 5 | User library authoring | **Partial** | Save-puzzle can create inconsistent definitions (CCP-167) |

**Verdict: Built. Known issues with save-puzzle consistency and bulk-save first-attempt info (CCP-166/167).**

---

## Cross-Cutting Issues

### Typecheck Failures (Systemic)

Multiple sprints are blocked by `exactOptionalPropertyTypes` violations:

| File | Affected Sprints | CCP References |
|---|---|---|
| `src/openings/view.ts` | Opponent Research, Sparklines | CCP-203, CCP-410 |
| `src/openings/import.ts` | Research Report Upgrade | CCP-184, CCP-324 |
| `src/openings/analytics.ts` | Termination Profile | CCP-408 |
| `src/puzzles/ctrl.ts` | Rated Ladder, Shard Fallback | CCP-309, CCP-310 |
| `src/main.ts` | Analysis Controls Migration | CCP-245 |

**Recommendation: A dedicated typecheck-cleanup pass before further feature work.**

### Dead Code / Incomplete Wiring

| Area | Issue | CCP |
|---|---|---|
| Rated puzzle cloud sync | Functions exist but never called from runtime | CCP-305 |
| Retro lifecycle hooks | Dead code, never executed | CCP-013 |
| Book-aware cancellation | Not wired into actual flow | CCP-023 |
| Sync pull → IDB | Pull endpoint exists but never writes to IndexedDB | CCP-229 |
| Legacy analysis actions | Old render path still in main.ts alongside new controls | CCP-249-F3 |

---

## Summary: What's NOT Implemented Yet

### High Priority (Sprint-planned, data layer ready, UI missing)

1. **Stats dashboard cards** — Weakness panel, trend charts, opening performance, tactical profile, time management, conversion metrics, training recommendations (Improvement Intelligence tasks 7–11, 13–15)
2. **Post-game summary panel** — Data computed but no view in analysis page
3. **Opponent tool suite left-rail & tool views** — Analytics computed but no multi-tool UI framework
4. **Deviation markers in move rows** — Only summary panel exists
5. **Rated puzzle cloud sync wiring** — Functions are dead code

### Medium Priority (Sprint-planned, partially implemented)

6. **Opponent recommendations panel** (Phase 5 of Opponent Research)
7. **Trap detection UI** — Code in `traps.ts` but integration unclear
8. **Sample-size warnings** (Phase 7 of Opponent Research)
9. **Recency-weighting for opponent stats** (Phase 8 of Opponent Research)
10. **ORP drill UI** — Types defined, no practice interface
11. **Sync pull → IDB merge** — Server→client path broken
12. **Practice Against Them tool** — 11 unreviewed prompts

### Lower Priority (Planned but no prompts executed)

13. **Save variations to ORP from opponent research**
14. **Full-page opponent dashboards**
15. **Comparative prep value view**

---

## Documents That Need Updating

| Document | Issue | Recommended Action |
|---|---|---|
| `docs/NEXT_STEPS.md` | Dated 2026-03-27; doesn't reflect stats/weakness work that landed, or opponent research progress | **Update** with current priorities |
| `docs/FUTURE_FUNCTIONALITY.md` | Several items now partially or fully implemented (rated puzzles, game summaries, weakness detection) | **Update** to mark implemented items |
| `OPPONENT_RESEARCH_PLATFORM_SPRINT_2026-03-29.md` | Phases 1–4 status not tracked; Phases 5–9 never started | **Add status markers** per phase |
| `OPENINGS_OPPONENT_TOOL_SUITE_SPRINT_2026-03-29.md` | 11 prompts unreviewed; no phase has fully landed | **Add status markers** |
| `IMPROVEMENT_INTELLIGENCE_PLATFORM_SPRINT_2026-03-29.md` | Tasks 1–6 done but doc doesn't reflect it; 11 prompts unreviewed | **Add status markers** |
| `RATED_PUZZLE_LADDER_AND_CLOUD_OWNERSHIP_SPRINT_2026-03-29.md` | Phases 1–6 done, 7–8 broken, but doc has no status | **Add status markers** |
| `RATED_PUZZLE_STREAM_SPRINT_2026-03-29.md` | Shard integration status unclear | **Add status markers** |
| `AUTH_AND_SYNC_SPRINT_2026-03-28.md` | Sync is broken but doc reads as if planned | **Add status markers and blockers** |
| `ANALYSIS_CONTROLS_PARITY_SPRINT_2026-03-29.md` | Migration incomplete, doc doesn't reflect | **Add status markers** |
| `docs/RATED_PUZZLE_LADDER_IMPL_MAP.md` | Cloud sync section describes behavior that's dead code | **Add warning note** |
| `docs/audits/CHESS_IMPROVEMENT_PLATFORM_AUDIT.md` | Several Phase 1 items now implemented | **Update Phase 1 status** |

---

## Recommended Next Actions

1. **Typecheck cleanup pass** — Fix `exactOptionalPropertyTypes` violations across openings, puzzles, and main.ts. This unblocks multiple sprints.
2. **Stats dashboard UI** — Data layer is solid; build the actual cards/views for the stats page (highest user-visible ROI).
3. **Wire rated puzzle cloud sync** — Functions exist, just need to be called from the auth/session flow.
4. **Deviation markers in move rows** — Summary panel works; complete the per-row rendering.
5. **Update sprint docs** — Add phase-level status markers to all active sprint docs.
6. **Update NEXT_STEPS.md** — Reflect current state: stats data layer done, opponent research partially landed, rated ladder mostly done.
