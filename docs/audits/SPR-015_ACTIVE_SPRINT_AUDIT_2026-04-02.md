# Active Sprint Audit — SPR-015 Study Page Sprint Plan

Date: 2026-04-02
Sprint: `SPR-015`
Source sprint doc: `docs/mini-sprints/STUDY_PAGE_SPRINT_2026-03-31.md`

## Scope

This audit reconciled the sprint against:
- the current sprint workflow in `docs/mini-sprints/SPRINT_AUDIT_PROCESS.md`
- the sprint registry entry for `SPR-015`
- linked prompts `CCP-519` through `CCP-563`
- the prior active audit at `docs/audits/SPR-015_ACTIVE_SPRINT_AUDIT_2026-04-01.md`
- current implementation evidence in `src/study/`, `src/main.ts`, `src/analyse/analysisControls.ts`, and linked persistence/router surfaces

## Normalization Check

- The sprint markdown doc is structurally normalized to the current sprint workflow: phased tasks, explicit task IDs, and linked prompt coverage through the implemented portion of the sprint.
- There is still tracking drift in the sprint doc header: it says `Status: Planning` while the registry currently treats the sprint as `Needs Prompts`.
- The latest completed audit on 2026-04-01 is no longer strict enough for the current audit workflow because it left unimplemented in-sprint tasks as soft future scope instead of explicit mismatches.

## Implementation Reality

### Confirmed implemented foundation

Implementation evidence is strong for `SPR-015-T01` through `SPR-015-T35`:
- `src/study/types.ts`
- `src/study/studyDb.ts`
- `src/study/saveAction.ts`
- `src/study/studyCtrl.ts`
- `src/study/libraryView.ts`
- `src/study/studyDetailCtrl.ts`
- `src/study/studyDetailView.ts`
- `src/study/practice/scheduler.ts`
- `src/study/practice/grader.ts`
- `src/study/practice/sessionBuilder.ts`
- `src/study/practice/extractLine.ts`
- `src/study/practice/boardAdapter.ts`
- `src/study/practice/drillCtrl.ts`
- `src/study/practice/drillView.ts`
- `src/router.ts`
- `src/main.ts`
- `src/analyse/analysisControls.ts`

The current codebase contains:
- a `#/study` route and page shell
- study persistence stores and controllers
- study library and detail surfaces
- save-to-library flows from analysis
- annotation, glyph, bookmark, and variation features
- practice line extraction, drill session control, grading, scheduling, dashboard, and learn flow

### Confirmed implementation gaps

`SPR-015-T36` through `SPR-015-T51` do not have implementation evidence sufficient for `Audit Confirmed Done`.

Concrete examples:
- `SPR-015-T36` / `SPR-015-T37`:
  - analysis save exists in `src/analyse/analysisControls.ts`
  - no equivalent Study save path was confirmed from openings research or active puzzle session
- `SPR-015-T38` / `SPR-015-T39`:
  - no study-drill-specific keyboard shortcut layer or drill-feedback sound system was confirmed
- `SPR-015-T40`:
  - `src/study/practice/drillCtrl.ts` has no warmup-specific scheduling or penalty state
- `SPR-015-T41`:
  - no study-library performance optimization work was confirmed beyond the baseline list rendering
- `SPR-015-T42` through `SPR-015-T51`:
  - the code still uses flat folder-name strings, not the planned folder object model
  - `src/study/types.ts` still defines `folders: string[]`
  - `src/study/libraryView.ts` still renders raw folder chips and a plain “+ folder” input
  - no `StudyFolder` type, `folderIds`, sidebar folder tree, drag-and-drop hierarchy, multi-select transform toolbar, per-folder view modes, tag-sidebar system, scoped search UI, favorites quick-access sidebar, or responsive sidebar shell was confirmed

Under the current audit rules, these are mismatches unless explicitly deferred to a future sprint. No such deferral has been recorded yet.

## Prompt Coverage And Tracking Drift

- Prompt coverage is present and reviewed for `SPR-015-T01` through `SPR-015-T35`.
- `SPR-015-T36` through `SPR-015-T41` still have no prompt coverage.
- `SPR-015-T42` through `SPR-015-T51` remain marked `Not Ready Yet` in the registry, but they are still in the active sprint and therefore must be treated as mismatches in this audit.
- The following manager prompts are linked at the sprint level but still appear as unassigned prompt IDs in the registry snapshot:
  - `CCP-522`
  - `CCP-527`
  - `CCP-532`
  - `CCP-542`
  - `CCP-548`
  - `CCP-553`
  - `CCP-557`
  - `CCP-561`
  - `CCP-563`

That unassigned-manager state is tracking drift, not missing implementation for the completed task blocks.

## Audit Findings

1. `SPR-015-T01` through `SPR-015-T35` remain `Audit Confirmed Done` because the implementation is present in the current codebase, not just in reviewed prompts.
2. `SPR-015-T36` through `SPR-015-T51` must now be `Audit Found Mismatch` under the current sprint audit workflow because they are still part of `SPR-015` and were not confirmed in code.
3. The prior 2026-04-01 active audit is now superseded as sprint truth because it treated unimplemented in-sprint tasks as future scope without a formal deferral.
4. The sprint is normalized, but its tracking is not fully clean:
   - sprint-doc header status is stale
   - manager prompt assignment metadata is incomplete

## Task Outcomes

### Audit Confirmed Done

`SPR-015-T01` through `SPR-015-T35`

### Audit Found Mismatch

`SPR-015-T36` through `SPR-015-T51`

## Completion Summary

The Study Page sprint is real and substantial through `SPR-015-T35`: core study persistence, library/detail UX, save flows, annotations, and drill/practice systems are all confirmed in the current codebase. But the sprint is not audit-clean as a whole under the current workflow. The remaining Phase 8 and Phase 9 tasks are still part of `SPR-015`, still lack implementation evidence, and were never formally deferred to a future sprint, so they must be recorded as mismatches rather than soft future scope.

## Next Best Steps

1. Decide whether `SPR-015-T36` through `SPR-015-T41` should stay in `SPR-015` and receive prompt coverage, or be formally moved into a future sprint.
2. Split `SPR-015-T42` through `SPR-015-T51` into a future folder/sidebar sprint if they are no longer intended to be part of the active Study sprint.
3. Clean up the unassigned manager-prompt linkage so sprint tracking reflects the already-reviewed prompt tree accurately.
