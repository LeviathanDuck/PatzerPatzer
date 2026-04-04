# Improvement Intelligence Platform Sprint Audit — 2026-04-02

Sprint: SPR-004
Source doc: docs/mini-sprints/IMPROVEMENT_INTELLIGENCE_PLATFORM_SPRINT_2026-03-29.md
Previous audit: docs/audits/SPRINT_VS_IMPLEMENTATION_AUDIT_2026-03-30.md

---

## Audit Method

Compared sprint markdown doc, sprint registry entry, all 20 linked prompt records,
and actual codebase implementation for every task.

---

## Task-by-Task Findings

### T01 — Enable clock data on Lichess import
**Sprint doc**: Task 1 | **Registry status**: Done | **Prompt**: CCP-379 (passed)
**Code evidence**: `src/import/lichess.ts` line 26: `params.set('clocks', 'true')`
**Verdict**: **Audit Confirmed Done**

### T02 — GameSummary type and persistence
**Sprint doc**: Task 2 | **Registry status**: Done | **Prompt**: CCP-380 (passed)
**Code evidence**: `src/stats/types.ts` has full GameSummary interface (39 fields). `src/idb/index.ts` has `game-summaries` store with save/get/list functions.
**Verdict**: **Audit Confirmed Done**

### T03 — GameSummary extraction from analyzed games
**Sprint doc**: Task 3 | **Registry status**: Done | **Prompt**: CCP-381 (passed)
**Code evidence**: `src/stats/extract.ts` has `extractGameSummary()` (lines 35-214) with move classification, win-chance tracking, accuracy, clock extraction.
**Verdict**: **Audit Confirmed Done**

### T04 — Backfill GameSummaries for existing analyzed games
**Sprint doc**: Task 4 | **Registry status**: Done | **Prompt**: CCP-382 (passed)
**Code evidence**: `src/stats/extract.ts` has `backfillGameSummaries()` (lines 236-275) with skip-existing logic.
**Verdict**: **Audit Confirmed Done**

### T05 — Stats controller and routing
**Sprint doc**: Task 5 | **Registry status**: Done | **Prompt**: CCP-383 (passed)
**Code evidence**: `src/stats/ctrl.ts` has StatsTimeFilter type, filter accessors, initStatsPage(), filteredSummaries(). Route wired in main.ts.
**Verdict**: **Audit Confirmed Done**

### T06 — Weakness aggregation engine
**Sprint doc**: Task 6 | **Registry status**: Done | **Prompt**: CCP-384 (passed)
**Code evidence**: `src/stats/weakness.ts` has 8 detectors: highBlunderRate, tacticalBlindness, conversionFailure, openingWeakness, colorAsymmetry, timeTrouble, endgameCollapse, earlyGameErrors. Returns top 5 by severity then confidence.
**Verdict**: **Audit Confirmed Done**

### T07 — Stats dashboard view: weakness panel
**Sprint doc**: Task 7 | **Registry status**: Partial | **Prompt**: CCP-385 (passed)
**Previous audit finding**: "placeholder sections, not full cards"
**Code evidence**: `src/stats/view.ts` has `renderWeaknessPanel()` with full weakness cards — severity indicator, category label, confidence badge, description, recommendation text, and training action buttons. This is no longer placeholder.
**Verdict**: **Audit Confirmed Done** — upgraded from Partial since previous audit

### T08 — Stats dashboard view: accuracy and blunder trends
**Sprint doc**: Task 8 | **Registry status**: Partial | **Prompt**: CCP-386 (passed)
**Previous audit finding**: "SVG polyline chart exists but minimal"
**Code evidence**: `src/stats/view.ts` has `renderTrendSection()` with accuracy and blunder trend charts, time-control separation, and minimum-game thresholds.
**Verdict**: **Audit Confirmed Done** — upgraded from Partial since previous audit

### T09 — Opening win rate from import data (Task 9a in sprint doc)
**Sprint doc**: Task 9a | **Registry status**: Not started | **Prompt**: CCP-387 (passed)
**Code evidence**: `src/stats/view.ts` has `renderOpeningTable()` rendering opening performance data.
**Verdict**: **Audit Confirmed Done** — registry was stale

### T10 — Opening performance table, full (Task 9 in sprint doc)
**Sprint doc**: Task 9 | **Registry status**: Not started | **Prompt**: CCP-387 (passed, shared with T09)
**Code evidence**: Same `renderOpeningTable()` handles both import-only and analysis-enriched columns.
**Verdict**: **Audit Confirmed Done** — registry was stale

### T11 — Tactical profile section (Task 10 in sprint doc)
**Sprint doc**: Task 10 | **Registry status**: Not started | **Prompt**: CCP-388 (passed)
**Code evidence**: `src/stats/view.ts` has `renderTacticalProfile()` with missed-moment breakdown by type.
**Verdict**: **Audit Confirmed Done** — registry was stale

### T12 — Post-game summary panel on analysis page (Task 11 in sprint doc)
**Sprint doc**: Task 11 | **Registry status**: Not started | **Prompt**: CCP-389 (passed)
**Code evidence**: `src/analyse/summaryView.ts` does NOT exist. No post-game summary panel found anywhere in `src/analyse/`. The stats dashboard has aggregate summary views, but the per-game post-analysis panel described in Task 11 was never built.
**Verdict**: **Audit Found Mismatch** — CCP-389 passed review but implementation does not exist in the codebase. Either the code was never committed or was removed.

### T13 — Persist retro session results (Task 12 in sprint doc)
**Sprint doc**: Task 12 | **Registry status**: Done | **Prompt**: CCP-390 (passed)
**Code evidence**: `src/idb/index.ts` has `retro-results` store with `saveRetroResult/getRetroResult/listRetroResults`. `RetroSessionResult` interface defined. `retroCtrl.ts` has onPersist callback wired through main.ts.
**Verdict**: **Audit Confirmed Done**

### T14 — Training recommendations with puzzle integration (Task 13 in sprint doc)
**Sprint doc**: Task 13 | **Registry status**: Not started | **Prompt**: CCP-391 (passed)
**Code evidence**: `src/stats/view.ts` weakness cards include training action buttons with navigation to puzzle library, retro, and openings page as described in Task 13.
**Verdict**: **Audit Confirmed Done** — registry was stale

### T15 — Clock/time-management profile (Task 14 in sprint doc)
**Sprint doc**: Task 14 | **Registry status**: Not started | **Prompt**: CCP-392 (passed)
**Code evidence**: `src/stats/view.ts` has `renderClockProfile()` with avg time per move, time-trouble fraction, and blunder rate comparison.
**Verdict**: **Audit Confirmed Done** — registry was stale

### T16 — Conversion and resourcefulness metrics (Task 15 in sprint doc)
**Sprint doc**: Task 15 | **Registry status**: Not started | **Prompt**: CCP-393 (passed)
**Code evidence**: `src/stats/view.ts` has `renderConversionMetrics()` with winning-position conversion rate and resourcefulness rate.
**Verdict**: **Audit Confirmed Done** — registry was stale

---

## Summary

| Status | Count | Tasks |
|---|---|---|
| Audit Confirmed Done | 15 | T01–T11, T13–T16 |
| Audit Found Mismatch | 1 | T12 (post-game summary panel) |

### Status changes from previous audit
- T07, T08: Partial → Done (UI completed since 2026-03-30 audit)
- T09, T10, T11, T14, T15, T16: Not started → Done (all implemented, registry was stale)
- T12: Not started → Mismatch (prompt passed review, but code does not exist)

---

## Linkage Issues Found

### T01 duplicate linkage
T01 has `linkedPromptIds: ["CCP-379","CCP-388","CCP-389","CCP-390","CCP-391","CCP-392","CCP-393"]`.
Only CCP-379 belongs to T01. The other 6 prompts have correct `sprintTaskId` values in
the prompt registry (CCP-388→T11, CCP-389→T12, etc.) but were also erroneously added to
T01's linkedPromptIds. This is a backfill artifact.

### Shared prompt CCP-387
CCP-387 is linked to both T09 and T10 (Task 9a and Task 9 in the sprint doc). The sprint
doc describes these as separate tasks where T10 extends T09. A single prompt covering both
is acceptable if the implementation handles both import-only and analysis-enriched cases.

### Unassigned batch managers
CCP-394, CCP-395, CCP-396, CCP-397, CCP-398 are batch manager prompts with no sprint task
linkage. These are orchestration-only and do not represent implementation work — no task
assignment needed.

---

## Normalization Assessment

The sprint markdown doc is **not normalized** to the current sprint workflow:
- Uses a flat numbered task list instead of phase/task hierarchy
- Status tracking is inline in the markdown table rather than owned by the registry
- Task numbering uses "9a" and "9" which maps awkwardly to T09/T10
- The registry has a single phase (SPR-004-P1) containing all 16 tasks — no phase structure

This is acceptable for a completed sprint with only one remaining mismatch task, but the
doc is not a reliable source for next-phase prompt generation.

---

## Prompt Coverage Gaps

None. All 16 tasks have at least one linked prompt, and all prompts have been reviewed.
The only gap is T12 where the prompt passed but the implementation is missing.

---

## Recommended Next Steps

1. **Fix T12 (Post-game summary panel)**: The only unimplemented task. Either:
   - Create a new prompt to implement `src/analyse/summaryView.ts` as described in Task 11
   - Or explicitly defer/descope T12 if the post-game summary is no longer wanted

2. **Fix T01 linkage**: Remove CCP-388, 389, 390, 391, 392, 393 from T01's linkedPromptIds

3. **Investigate CCP-389**: This prompt passed review for the post-game summary panel, but
   the feature doesn't exist. The review may have been a false positive during bulk review.
