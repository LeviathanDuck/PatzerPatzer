



import { h, type VNode } from 'snabbdom';
import {
  controlExplainerAttrs,
  iconControlExplainerAttrs,
  renderDisabledControlExplainer,
} from '../ui/controlExplainer';
import {
  allStudies, isLoaded, studyLibraryError, initStudyLibrary,
  sortKey, sortDir, filterFav, filterTag, filterSrc, searchQuery,
  setSortKey, setSortDir, setFilterFav, setFilterTag, setFilterSrc, setSearch,
  studyTags, updateStudy, deleteStudy, importPgnToLibrary,
  practiceLoaded, practiceError, dueCount, dueCountForStudy,
  reviewSequences, learnSequences, loadPracticeData, retryPracticeData,
  hasMore, isLoadingMore, loadNextPage, loadedStudyPageCount,
  folders, foldersLoaded, activeFolderId, sidebarCollapsed,
  setActiveFolderId, toggleSidebar, loadFolders,
  createFolder, renameFolder, removeFolderEntity, moveStudyToFolder, addStudyToFolderByName,
  selectedIds, isSelected, selectionCount, clearSelection,
  handleStudyClick, bulkDeleteStudies, bulkAddToFolder, bulkSetFavorite,
  resetPagination, studyLibraryRouteSnapshot,
  seedSampleStudies, isSeeding,
  listOrpPracticeLines,
  repertoireSources, repertoireSourcesLoaded, repertoireSourcesError, loadRepertoireSources,
  repertoireAccountCandidates, repertoireAccountCandidatesLoaded, repertoireAccountCandidatesError,
  loadRepertoireAccountCandidates, addRepertoireAccountSource, setRepertoireAccountSourceFilters,
  ensureRepertoireAccountSourceBuilds,
  uploadRepertoireSourceFile, renameRepertoireSource, setRepertoireSourceSideOverride,
  setRepertoireSourceEnabled, replaceRepertoireSourceFile, deleteRepertoireSource,
  repertoireScanProgress, repertoireScanProgressLoaded, repertoireScanBusy,
  loadRepertoireScanProgress, runRepertoireScanFromStudy, pauseRepertoireScanFromStudy,
  repertoireComplianceReport, repertoireComplianceReportLoaded, repertoireComplianceReportError,
  repertoireComplianceReportFilters, setRepertoireComplianceReportFilters,
  resetRepertoireComplianceReportFilters, loadRepertoireComplianceReport,
  studyNavigationTree,
  type StudySortKey,
  type OrpPracticeLineView,
} from './studyCtrl';
import { renderNavigatorShell, normalizeStudyToolTab, type StudyToolTabId } from './navigatorShellView';
import { renderStudyDetail, renderStudyToolPanel, setGuidedLearnLauncher } from './studyDetailView';
import { parseStudyDetailRouteState, serializeStudyDetailRouteState, STUDY_DETAIL_PRACTICE_TOOL_TAB } from './detailRouteState';
import { serializeAnalysisRouteWithPly, serializeAnalysisSelectedGameRoute } from '../analyse/routeState';
import { renderCompactGameRow } from '../games/view';
import {
  repertoireComplianceReportFiltersActive,
  type RepertoireComplianceCategoryFilter,
  type RepertoireComplianceDateFilter,
  type RepertoireComplianceOutcome,
  type RepertoireComplianceOwnerColorFilter,
  type RepertoireComplianceReport,
  type RepertoireComplianceReportGroup,
} from '../repertoire/report';
import { serializeStudyRouteState, type StudyRouteState } from './routeState';
import { writeHashRoute } from '../router';
import {
  closeRepertoireSourceBrowse,
  isRepertoireSourceBrowseOpen,
  openRepertoireSourceBrowse,
  renderRepertoireSourceBrowse,
  repertoireBrowseGeneration,
  repertoireBrowseSourceId,
} from './repertoireBrowseView';
import { isDrillActive, isDrillSummary, initDrillView, initLearnView, renderDrillView, endDrill } from './practice/drillView';
import { loadLearnLessonBundle } from './practice/lessonHost';
import { isDrillCatalogOpen, closeDrillCatalog, renderDrillCatalog } from './practice/drillCatalogView';
import { resolveOrpSettings, readOrpSessionOverride } from './practice/settings';
import { readOrpGlobalDefaults } from '../sync/settingsLiveApply';
import { launchDueReview } from './practice/dueReviewLaunch';
import { enrollLearnedLine } from './practice/learnEnrollment';
import type { LearnTargetCompletion } from './practice/drillCtrl';
import { createRepairCycleDriver, repairTargetsOf, type RepairCycleDriver } from './practice/drillCtrl';
import type { LessonModel } from './practice/lessonExtract';
import { buildReviewSession, buildLearnSession } from './practice/sessionBuilder';
import { listAllPositionProgress, savePracticeLine, getPracticeLine, deletePracticeLine } from './studyDb';
import { saveRepertoireLineToOrpLibrary } from './saveAction';
import { Chessground as makeChessground } from '@lichess-org/chessground';
import type { StudyItem, TrainableSequence } from './types';
import type { RepertoireLinePrefixMove, RepertoireSide, RepertoireSource } from '../repertoire';
import {
  ACCOUNT_REPERTOIRE_DIRECT_GAME_LIMIT,
  isAccountRepertoireSource,
  normalizeRepertoireAccountFilters,
  repertoireAccountFilterSummary,
  type RepertoireAccountFilters,
  type RepertoireAccountResultFilter,
} from '../repertoire';
import { resolveRepertoireReportGroupOrpLine } from '../repertoire/orp';
import { getAccountRepertoireBuildState } from '../repertoire/accountSource';

// --- Source label helpers ---

const SOURCE_LABELS: Record<string, string> = {
  analysis: 'Analysis',
  openings: 'Openings',
  puzzles:  'Puzzles',
  manual:   'Manual',
  import:   'Import',
};

function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

function formatDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function writeStudyLibraryRoute(overrides: Partial<StudyRouteState> = {}, opts: { resetPages?: boolean } = {}): void {
  const base = studyLibraryRouteSnapshot();
  const next = {
    ...base,
    ...overrides,
    pages: opts.resetPages ? 1 : (overrides.pages ?? base.pages),
  };
  writeHashRoute(serializeStudyRouteState(next), { mode: 'replace' });
}

function resetStudyLibraryLens(redraw: () => void): void {
  void resetPagination(redraw);
}

// --- Inline edit state (ephemeral — module-level since only one edit can be active) ---
let _editingTitleId: string | null = null;
let _editingTitleValue = '';
let _editingTagId: string | null = null;
let _editingTagValue = '';
let _editingFolderId: string | null = null;
let _editingFolderValue = '';
// Expanded rows (show notes + folder editor)
const _expandedRows = new Set<string>();
// Import modal state
let _showImportModal = false;
let _importPgnText   = '';
let _importStatus: string | null = null;





let _importModalOpener: HTMLElement | null = null;
let _repertoireSourceStatus: string | null = null;
let _repertoireSourceBusy = false;
let _openRepertoireMenuId: string | null = null;
let _editingRepertoireSourceId: string | null = null;
let _editingRepertoireSourceValue = '';
let _showAccountSourcePicker = false;
const _expandedRepertoireReportRows = new Set<string>();
type RepertoireReportMode = 'divergences' | 'study-next';
let _repertoireReportMode: RepertoireReportMode = 'divergences';
// T7-A8: Study-Next-only "Group by" toggle. Local UI state, not a persisted filter — both
// report.groups and report.studyNextGroups are already computed on every report build regardless
// of this value, so there is no filters-style plumbing to thread this through (and doing so would
// require touching studyCtrl.ts, outside this slice's file scope). Defaults to 'position' (the
// corrected, transposition-merged grouping); 'exact-line' restores the pre-A8 per-line-prefix
// breakdown for inspection/audit — same default-correct, switchable-for-audit pattern as A1/A2's
// category filter.
type RepertoireStudyNextGroupMode = 'position' | 'exact-line';
let _repertoireStudyNextGroupMode: RepertoireStudyNextGroupMode = 'position';
const _repertoireOrpSavingRows = new Set<string>();
const _repertoireOrpFeedback = new Map<string, string>();
const _repertoireOrpFeedbackTimers = new Map<string, ReturnType<typeof setTimeout>>();



let _orpLines:        OrpPracticeLineView[] = [];
let _orpLoaded        = false;
let _orpError         = false;
let _orpLoadPending   = false;


let _orpDueLaunching = false;


let _orpLearnLaunching = false;







let _orpDrillPending = false;




let _editingOrpLabelId: string | null = null;
let _editingOrpLabelValue = '';













async function launchOrpDueSession(redraw: () => void): Promise<void> {
  if (_orpDueLaunching) return;
  _orpDueLaunching = true;
  try {




    _orpDrillPending = true;

    const dueNow = Date.now();
    const dueSettings = resolveOrpSettings(readOrpGlobalDefaults(), undefined, readOrpSessionOverride(dueNow), dueNow).values;
    const startedNew = await launchDueReview({ limit: Math.max(1, dueSettings.duePerSession) }, redraw);
    if (startedNew.ok) return;
    _orpDrillPending = false;
    if (startedNew.reason !== 'no-due') {
      console.warn(`[libraryView] due-review runtime failed (${startedNew.reason}); falling back to legacy review`);
    }

    // Collect active ORP sequences (exclude paused — buildReviewSession filters them too,
    // but pre-filtering keeps the progress-map query focused).
    const activeSequences = _orpLines
      .filter(v => v.lineState !== 'PAUSED')
      .map(v => v.sequence);

    if (activeSequences.length === 0) return;

    const progressList  = await listAllPositionProgress();
    const progressMap   = new Map(progressList.map(p => [p.key, p]));
    const dueSequences  = buildReviewSession(activeSequences, progressMap);

    if (dueSequences.length === 0) return;

    // Use the first due sequence's trainAs as the initial board orientation.
    // drillView.syncDrillBoard() corrects orientation per-sequence as the session advances.
    const initialTrainAs = dueSequences[0]!.trainAs;
    _orpDrillPending = true;
    initDrillView(dueSequences, dueSequences[0]!.fens[0] ?? STARTING_FEN, initialTrainAs, redraw);
    redraw();
  } finally {
    _orpDueLaunching = false;
  }
}












async function launchOrpLearnSession(redraw: () => void): Promise<void> {
  if (_orpLearnLaunching) return;
  _orpLearnLaunching = true;
  try {
    const activeSequences = _orpLines
      .filter(v => v.lineState !== 'PAUSED')
      .map(v => v.sequence);

    if (activeSequences.length === 0) return;

    const progressList  = await listAllPositionProgress();
    const progressMap   = new Map(progressList.map(p => [p.key, p]));
    const newSequences  = buildLearnSession(activeSequences, progressMap);

    if (newSequences.length === 0) return;



    const learnNow = Date.now();
    const orpSettings = resolveOrpSettings(readOrpGlobalDefaults(), undefined, readOrpSessionOverride(learnNow), learnNow).values;
    const queue = newSequences.slice(0, Math.max(1, orpSettings.newPerSession));




    await launchGuidedLearn(queue, 0, redraw);
  } finally {
    _orpLearnLaunching = false;
  }
}

















function presentLearnRepair(
  model: LessonModel,
  trainAs: 'white' | 'black',
  studyItemId: string,
  driver: RepairCycleDriver,
  redraw: () => void,
  onRepairComplete: () => void,
): void {
  const targetId = driver.peek();
  if (targetId === null) {
    onRepairComplete();
    return;
  }
  let retryClean = false;
  initLearnView({
    line: model.line,
    content: model.content,
    replies: model.replies,
    siblingsAt: model.siblingsAt,
    targetIds: new Set([targetId]),
    leadInFenFor: model.leadInFenFor,
    shapesFor: model.shapesFor,
    rootFen: model.rootFen,
    trainAs,
    studyItemId,
    redraw,
    onTargetComplete: (completion) => {
      retryClean = completion.attempt.firstAttemptResult === 'clean'
        && completion.attempt.assistanceTypes.length === 0;
    },
    onLineComplete: () => {
      driver.recordRetry(retryClean);
      presentLearnRepair(model, trainAs, studyItemId, driver, redraw, onRepairComplete);
    },
  });
  redraw();
}

export async function launchGuidedLearn(
  sequences: readonly TrainableSequence[],
  index: number,
  redraw: () => void,
): Promise<void> {
  if (index >= sequences.length) {




    endDrill('guided-chain-complete', 'dismiss');
    redraw();
    return;
  }
  const sequence = sequences[index]!;
  const result = await loadLearnLessonBundle({
    studyItemId: sequence.studyItemId,
    learnerSide: sequence.trainAs,
    treatLineAsRequired: true,
  });
  if (!result.ok) {
    console.warn(`[libraryView] guided-learn load failed (${result.reason}) for study ${sequence.studyItemId}; skipping to the next line`);
    await launchGuidedLearn(sequences, index + 1, redraw);
    return;
  }
  const { model, targetIds } = result.bundle;
  if (model.line.length === 0) {
    console.warn(`[libraryView] guided-learn: study ${sequence.studyItemId} has no learner decisions; skipping to the next line`);
    await launchGuidedLearn(sequences, index + 1, redraw);
    return;
  }
  _orpDrillPending = true;



  const completions: LearnTargetCompletion[] = [];
  initLearnView({
    line: model.line,
    content: model.content,
    replies: model.replies,
    siblingsAt: model.siblingsAt,
    targetIds,
    leadInFenFor: model.leadInFenFor,
    shapesFor: model.shapesFor,
    rootFen: model.rootFen,
    trainAs: sequence.trainAs,
    studyItemId: sequence.studyItemId,
    redraw,
    onTargetComplete: (completion) => { completions.push(completion); },
    onLineComplete: () => {
      void enrollLearnedLine({
        studyItemId: sequence.studyItemId,
        lessonId: sequence.studyItemId,
        model,
        completions,
      }).then(outcome => {
        if (outcome.ok) {
          if (outcome.outcome === 'enrolled') {
            console.info(`[libraryView] learned line enrolled: ${outcome.srsRows} tracked decision(s)`);
          }
        } else if (outcome.reason === 'not-clean') {




          const repairQueue = repairTargetsOf(completions);
          console.info(`[libraryView] line not clean (${outcome.unclean.length} target(s)) — repair cycle over ${repairQueue.length} target(s), then a clean pass`);
          presentLearnRepair(
            model, sequence.trainAs, sequence.studyItemId,
            createRepairCycleDriver({ failedTargetIds: repairQueue }),
            redraw,
            () => { void launchGuidedLearn(sequences, index, redraw); },
          );
          return;
        } else {
          console.warn(`[libraryView] learn enrollment failed (${outcome.reason})`);
        }

        void launchGuidedLearn(sequences, index + 1, redraw);
      });
    },
  });
  redraw();
}

function loadOrpLines(redraw: () => void): void {
  if (_orpLoadPending) return;
  _orpLoadPending = true;
  void listOrpPracticeLines().then(lines => {
    _orpLines   = lines;
    _orpLoaded  = true;
    _orpError   = false;
  }).catch(() => {
    _orpError  = true;
    _orpLoaded = true;
  }).finally(() => {
    _orpLoadPending = false;
    redraw();
  });
}





setGuidedLearnLauncher(launchGuidedLearn);

// --- Repertoire source section ---

function sideBadge(side: RepertoireSide): string {
  if (side === 'white') return 'W';
  if (side === 'black') return 'B';
  return 'WB';
}

function chapterCountLabel(count: number): string {
  return `${count} chapter${count === 1 ? '' : 's'}`;
}

function safeErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function uploadRepertoireFile(file: File, redraw: () => void): void {
  if (_repertoireSourceBusy) return;
  _repertoireSourceBusy = true;
  _repertoireSourceStatus = 'Importing repertoire source...';
  redraw();
  void file.text()
    .then(text => uploadRepertoireSourceFile(file.name, text))
    .then(source => {
      _repertoireSourceStatus = `Imported ${source.name} (${chapterCountLabel(source.chapterCount)}).`;
    })
    .catch(error => {
      _repertoireSourceStatus = `Could not import repertoire source: ${safeErrorMessage(error, 'unknown error')}`;
    })
    .finally(() => {
      _repertoireSourceBusy = false;
      redraw();
    });
}

function replaceSourceFile(source: RepertoireSource, file: File, redraw: () => void): void {
  if (_repertoireSourceBusy) return;
  if (!confirm(`Replace repertoire file for "${source.name}"? Existing scan records for this source will be removed.`)) return;
  _repertoireSourceBusy = true;
  _repertoireSourceStatus = `Replacing ${source.name}...`;
  redraw();
  void file.text()
    .then(text => replaceRepertoireSourceFile(source.id, text))
    .then(updated => {
      _repertoireSourceStatus = `Replaced ${updated.name} (${chapterCountLabel(updated.chapterCount)}).`;
    })
    .catch(error => {
      _repertoireSourceStatus = `Could not replace repertoire source: ${safeErrorMessage(error, 'unknown error')}`;
    })
    .finally(() => {
      _repertoireSourceBusy = false;
      redraw();
    });
}

function saveRepertoireSourceRename(source: RepertoireSource, redraw: () => void): void {
  const name = _editingRepertoireSourceValue.trim();
  _editingRepertoireSourceId = null;
  _editingRepertoireSourceValue = '';
  if (!name || name === source.name) { redraw(); return; }
  _repertoireSourceBusy = true;
  void renameRepertoireSource(source.id, name)
    .then(updated => {
      _repertoireSourceStatus = `Renamed repertoire source to ${updated.name}.`;
    })
    .catch(error => {
      _repertoireSourceStatus = `Could not rename repertoire source: ${safeErrorMessage(error, 'unknown error')}`;
    })
    .finally(() => {
      _repertoireSourceBusy = false;
      redraw();
    });
}

function changeRepertoireSourceSide(source: RepertoireSource, value: string, redraw: () => void): void {
  const sideOverride = value === 'auto' ? null : (value as RepertoireSide);
  _repertoireSourceBusy = true;
  void setRepertoireSourceSideOverride(source.id, sideOverride)
    .then(updated => {
      _repertoireSourceStatus = `${updated.name} side set to ${sideBadge(updated.side)}.`;
    })
    .catch(error => {
      _repertoireSourceStatus = `Could not update source side: ${safeErrorMessage(error, 'unknown error')}`;
    })
    .finally(() => {
      _repertoireSourceBusy = false;
      redraw();
    });
}

function changeRepertoireAccountFilters(
  source: RepertoireSource,
  filters: Partial<RepertoireAccountFilters>,
  redraw: () => void,
): void {
  _repertoireSourceBusy = true;
  void setRepertoireAccountSourceFilters(source.id, filters)
    .then(updated => {
      _repertoireSourceStatus = `${updated.name} filters: ${repertoireAccountFilterSummary(updated)}.`;
      ensureRepertoireAccountSourceBuilds(redraw);
    })
    .catch(error => {
      _repertoireSourceStatus = `Could not update account filters: ${safeErrorMessage(error, 'unknown error')}`;
    })
    .finally(() => {
      _repertoireSourceBusy = false;
      redraw();
    });
}

function parseRatingInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function addAccountSource(accountId: string, gameCount: number, redraw: () => void): void {
  if (_repertoireSourceBusy) return;
  const allowLargeAccount = gameCount > ACCOUNT_REPERTOIRE_DIRECT_GAME_LIMIT
    ? confirm(`Build an account-backed repertoire source from ${gameCount.toLocaleString()} stored games? This may take a moment and will run cooperatively.`)
    : true;
  if (!allowLargeAccount) return;
  _repertoireSourceBusy = true;
  _repertoireSourceStatus = 'Adding account source...';
  redraw();
  void addRepertoireAccountSource(accountId, allowLargeAccount)
    .then(source => {
      _showAccountSourcePicker = false;
      _repertoireSourceStatus = `Added account source ${source.name}.`;
      ensureRepertoireAccountSourceBuilds(redraw);
    })
    .catch(error => {
      _repertoireSourceStatus = `Could not add account source: ${safeErrorMessage(error, 'unknown error')}`;
    })
    .finally(() => {
      _repertoireSourceBusy = false;
      redraw();
    });
}

function toggleRepertoireSourceEnabled(source: RepertoireSource, redraw: () => void): void {
  _repertoireSourceBusy = true;
  void setRepertoireSourceEnabled(source.id, !source.enabled)
    .then(updated => {
      _repertoireSourceStatus = `${updated.name} ${updated.enabled ? 'enabled' : 'disabled'}.`;
    })
    .catch(error => {
      _repertoireSourceStatus = `Could not update source state: ${safeErrorMessage(error, 'unknown error')}`;
    })
    .finally(() => {
      _repertoireSourceBusy = false;
      redraw();
    });
}

function removeRepertoireSource(source: RepertoireSource, redraw: () => void): void {
  const detail = isAccountRepertoireSource(source)
    ? 'The account-backed source will be removed from repertoire suggestions.'
    : 'The source and its scan records will be removed.';
  if (!confirm(`Delete "${source.name}"? ${detail}`)) return;
  _repertoireSourceBusy = true;
  void deleteRepertoireSource(source.id)
    .then(() => {
      _openRepertoireMenuId = null;
      if (repertoireBrowseSourceId() === source.id) closeRepertoireSourceBrowse();
      _repertoireSourceStatus = `Deleted ${source.name}.`;
    })
    .catch(error => {
      _repertoireSourceStatus = `Could not delete repertoire source: ${safeErrorMessage(error, 'unknown error')}`;
    })
    .finally(() => {
      _repertoireSourceBusy = false;
      redraw();
    });
}

function renderRepertoireBusyControl(label: string, control: VNode): VNode {
  return _repertoireSourceBusy
    ? renderDisabledControlExplainer(
        { label, description: 'Wait for the current repertoire source operation to finish.' },
        control,
      )
    : control;
}

function renderRepertoireUploadControl(redraw: () => void): VNode {
  return renderRepertoireBusyControl('Upload repertoire PGN', h('label.study-btn.study-btn--import.repertoire__upload', {
    attrs: {
      ...controlExplainerAttrs({ label: 'Upload repertoire PGN', description: 'Imports a PGN file as a repertoire source.' }),
    },
  }, [
    _repertoireSourceBusy ? 'Working...' : 'Upload repertoire PGN',
    h('input.repertoire__file-input', {
      attrs: {
        type: 'file',
        accept: '.pgn,text/plain',
        disabled: _repertoireSourceBusy,
        'data-ui-explainer-exempt': 'hidden-implementation-input',
      },
      on: { change: (e: Event) => {
        const input = e.target as HTMLInputElement;
        const file = input.files?.[0];
        input.value = '';
        if (file) uploadRepertoireFile(file, redraw);
      }},
    }),
  ]));
}

function renderAccountSourceAddButton(redraw: () => void): VNode {
  const button = h('button.study-btn.repertoire__account-add', {
    attrs: {
      type: 'button',
      'aria-expanded': String(_showAccountSourcePicker),
      ...controlExplainerAttrs({ label: 'Add account repertoire', description: 'Chooses an imported account to use as a repertoire source.' }),
    },
    on: { click: () => {
      _showAccountSourcePicker = !_showAccountSourcePicker;
      if (_showAccountSourcePicker && !repertoireAccountCandidatesLoaded()) loadRepertoireAccountCandidates(redraw);
      redraw();
    } },
  }, 'Add account');
  return _repertoireSourceBusy
    ? renderDisabledControlExplainer(
        { label: 'Add account repertoire', description: 'Wait for the current repertoire source operation to finish.' },
        h('button.study-btn.repertoire__account-add', { attrs: { type: 'button', disabled: true } }, 'Add account'),
      )
    : button;
}

function renderAccountSourcePicker(redraw: () => void): VNode | null {
  if (!_showAccountSourcePicker) return null;
  if (!repertoireAccountCandidatesLoaded()) {
    loadRepertoireAccountCandidates(redraw);
    return h('div.repertoire__account-picker', [
      h('div.repertoire__source-loading', 'Loading imported accounts...'),
    ]);
  }
  if (repertoireAccountCandidatesError()) {
    return h('div.repertoire__account-picker', [
      h('div.repertoire__source-error', 'Could not load imported accounts.'),
    ]);
  }

  const candidates = repertoireAccountCandidates();
  if (candidates.length === 0) {
    return h('div.repertoire__account-picker', [
      h('div.repertoire__source-empty', 'No imported accounts with stored games.'),
    ]);
  }

  return h('div.repertoire__account-picker', candidates.map(candidate => {
    const disabled = candidate.alreadySource || _repertoireSourceBusy;
    const title = candidate.alreadySource
      ? `${candidate.accountLabel} is already a repertoire source`
      : `Add ${candidate.accountLabel} as an account-backed repertoire source`;
    const button = h('button.repertoire__account-candidate', {
      key: candidate.accountId,
      attrs: {
        type: 'button',
        ...controlExplainerAttrs({ label: title, description: 'Adds this imported account as a repertoire source.' }),
      },
      on: { click: () => {
        if (disabled) return;
        addAccountSource(candidate.accountId, candidate.gameCount, redraw);
      } },
    }, [
      h('span.repertoire__account-candidate-name', candidate.accountLabel),
      h('span.repertoire__account-candidate-meta', [
        candidate.accountPlatform,
        ' · ',
        `${candidate.gameCount.toLocaleString()} games`,
        candidate.gameCount > ACCOUNT_REPERTOIRE_DIRECT_GAME_LIMIT ? ' · confirm build' : '',
        candidate.alreadySource ? ' · added' : '',
      ]),
    ]);
    return disabled
      ? renderDisabledControlExplainer(
          { label: `Add ${candidate.accountLabel}`, description: candidate.alreadySource ? 'This account is already a repertoire source.' : 'Wait for the current repertoire source operation to finish.' },
          h('button.repertoire__account-candidate', { attrs: { type: 'button', disabled: true } }, [
            h('span.repertoire__account-candidate-name', candidate.accountLabel),
            h('span.repertoire__account-candidate-meta', candidate.alreadySource ? 'Already added' : 'Working'),
          ]),
        )
      : button;
  }));
}

function renderRepertoireIdentityChip(name: string, side: RepertoireSide, accentIndex: number): VNode {
  return h(`span.repertoire__chip.repertoire__accent--${accentIndex % 8}`, [
    h('span.repertoire__chip-dot'),
    h('span.repertoire__chip-name', name),
    h('span.repertoire__side-badge', sideBadge(side)),
  ]);
}

function renderRepertoireChip(source: RepertoireSource, accentIndex: number): VNode {
  return renderRepertoireIdentityChip(source.name, source.side, accentIndex);
}

function renderRepertoireSourceMenu(source: RepertoireSource, redraw: () => void): VNode | null {
  if (_openRepertoireMenuId !== source.id) return null;
  const selectedSide = source.sideOverride ?? 'auto';
  const accountSource = isAccountRepertoireSource(source);
  const accountFilters = normalizeRepertoireAccountFilters(source.accountFilters);
  const resultOptions: { value: RepertoireAccountResultFilter; label: string }[] = [
    { value: 'wins', label: 'Wins' },
    { value: 'wins-draws', label: 'Wins + draws' },
    { value: 'all', label: 'All' },
    { value: 'losses', label: 'Losses' },
  ];
  return h('div.repertoire__source-menu', [
    renderRepertoireBusyControl(`Rename ${source.name}`, h('button.repertoire__source-menu-item', {
      attrs: {
        disabled: _repertoireSourceBusy,
        ...controlExplainerAttrs({ label: `Rename ${source.name}`, description: 'Opens this repertoire source name for editing.' }),
      },
      on: { click: (e: Event) => {
        e.stopPropagation();
        _editingRepertoireSourceId = source.id;
        _editingRepertoireSourceValue = source.name;
        _openRepertoireMenuId = null;
        redraw();
      }},
    }, 'Rename')),
    accountSource ? h('label.repertoire__source-menu-label', [
      h('span', 'Result'),
      renderRepertoireBusyControl(`Filter ${source.name} by account result`, h('select.repertoire__side-select', {
        attrs: {
          'aria-label': `Filter ${source.name} by account result`,
          disabled: _repertoireSourceBusy,
          ...controlExplainerAttrs({ label: `Filter ${source.name} by account result`, description: 'Limits this account repertoire source by game result.' }),
        },
        props: { value: accountFilters.result },
        on: { change: (e: Event) => {
          e.stopPropagation();
          changeRepertoireAccountFilters(source, { result: (e.target as HTMLSelectElement).value as RepertoireAccountResultFilter }, redraw);
        } },
      }, resultOptions.map(option => h('option', { attrs: { value: option.value } }, option.label)))),
    ]) : h('label.repertoire__source-menu-label', [
      h('span', 'Side'),
      renderRepertoireBusyControl(`Set side for ${source.name}`, h('select.repertoire__side-select', {
        attrs: {
          'aria-label': `Set side for ${source.name}`,
          disabled: _repertoireSourceBusy,
          ...controlExplainerAttrs({ label: `Set side for ${source.name}`, description: 'Chooses which side this repertoire source trains.' }),
        },
        props: { value: selectedSide },
        on: { change: (e: Event) => {
          e.stopPropagation();
          changeRepertoireSourceSide(source, (e.target as HTMLSelectElement).value, redraw);
        }},
      }, [
        h('option', { attrs: { value: 'auto' } }, `Auto (${sideBadge(source.inferredSide)})`),
        h('option', { attrs: { value: 'white' } }, 'White'),
        h('option', { attrs: { value: 'black' } }, 'Black'),
        h('option', { attrs: { value: 'both' } }, 'White + Black'),
      ])),
    ]),
    accountSource ? h('label.repertoire__source-menu-label', [
      h('span', 'Time'),
      renderRepertoireBusyControl(`Filter ${source.name} by time class`, h('select.repertoire__side-select', {
        attrs: {
          'aria-label': `Filter ${source.name} by time class`,
          disabled: _repertoireSourceBusy,
          ...controlExplainerAttrs({ label: `Filter ${source.name} by time class`, description: 'Limits this account repertoire source by time class.' }),
        },
        props: { value: accountFilters.timeClass ?? '' },
        on: { change: (e: Event) => {
          e.stopPropagation();
          const value = (e.target as HTMLSelectElement).value;
          changeRepertoireAccountFilters(source, { timeClass: value || null }, redraw);
        } },
      }, [
        h('option', { attrs: { value: '' } }, 'All'),
        h('option', { attrs: { value: 'bullet' } }, 'Bullet'),
        h('option', { attrs: { value: 'blitz' } }, 'Blitz'),
        h('option', { attrs: { value: 'rapid' } }, 'Rapid'),
        h('option', { attrs: { value: 'classical' } }, 'Classical'),
      ])),
    ]) : null,
    accountSource ? h('label.repertoire__source-menu-label.repertoire__rating-filter', [
      h('span', 'Rating'),
      h('span.repertoire__rating-inputs', [
        renderRepertoireBusyControl(`Minimum rating for ${source.name}`, h('input.repertoire__rating-input', {
          attrs: {
            type: 'number',
            min: '1',
            placeholder: 'min',
            'aria-label': `Minimum account rating for ${source.name}`,
            disabled: _repertoireSourceBusy,
            ...controlExplainerAttrs({ label: `Minimum rating for ${source.name}`, description: 'Sets the lowest account-game rating included in this source.' }),
          },
          props: { value: accountFilters.minRating === null ? '' : String(accountFilters.minRating) },
          on: { change: (e: Event) => {
            e.stopPropagation();
            changeRepertoireAccountFilters(source, { minRating: parseRatingInput((e.target as HTMLInputElement).value) }, redraw);
          } },
        })),
        renderRepertoireBusyControl(`Maximum rating for ${source.name}`, h('input.repertoire__rating-input', {
          attrs: {
            type: 'number',
            min: '1',
            placeholder: 'max',
            'aria-label': `Maximum account rating for ${source.name}`,
            disabled: _repertoireSourceBusy,
            ...controlExplainerAttrs({ label: `Maximum rating for ${source.name}`, description: 'Sets the highest account-game rating included in this source.' }),
          },
          props: { value: accountFilters.maxRating === null ? '' : String(accountFilters.maxRating) },
          on: { change: (e: Event) => {
            e.stopPropagation();
            changeRepertoireAccountFilters(source, { maxRating: parseRatingInput((e.target as HTMLInputElement).value) }, redraw);
          } },
        })),
      ]),
    ]) : null,
    accountSource ? null : renderRepertoireBusyControl(`Replace PGN for ${source.name}`, h('label.repertoire__source-menu-item.repertoire__replace-label', {
      attrs: {
        ...controlExplainerAttrs({ label: `Replace PGN for ${source.name}`, description: 'Replaces this repertoire source with another PGN file.' }),
      },
    }, [
      'Replace file',
      h('input.repertoire__file-input', {
        attrs: {
          type: 'file',
          accept: '.pgn,text/plain',
          disabled: _repertoireSourceBusy,
          'data-ui-explainer-exempt': 'hidden-implementation-input',
        },
        on: { change: (e: Event) => {
          const input = e.target as HTMLInputElement;
          const file = input.files?.[0];
          input.value = '';
          if (file) replaceSourceFile(source, file, redraw);
        }},
      }),
    ])),
    renderRepertoireBusyControl(`Delete ${source.name}`, h('button.repertoire__source-menu-item.repertoire__source-menu-item--danger', {
      attrs: {
        disabled: _repertoireSourceBusy,
        ...controlExplainerAttrs({ label: `Delete ${source.name}`, description: 'Permanently deletes this repertoire source after confirmation.' }),
      },
      on: { click: (e: Event) => {
        e.stopPropagation();
        removeRepertoireSource(source, redraw);
      }},
    }, 'Delete')),
  ]);
}

function renderRepertoireSourceRow(source: RepertoireSource, index: number, redraw: () => void): VNode {
  const isEditingName = _editingRepertoireSourceId === source.id;
  const accountSource = isAccountRepertoireSource(source);
  const accountBuildState = accountSource ? getAccountRepertoireBuildState(source) : null;
  const sourceCountLabel = accountSource
    ? `${source.gameCount.toLocaleString()} stored game${source.gameCount === 1 ? '' : 's'}`
    : chapterCountLabel(source.chapterCount);
  const accountBuildLabel = accountBuildState
    ? accountBuildState.state === 'ready'
      ? `built ${accountBuildState.filteredGameCount.toLocaleString()} games in ${accountBuildState.durationMs ?? 0}ms`
      : accountBuildState.state === 'building' || accountBuildState.state === 'publishing'
        ? `building ${accountBuildState.processedGameCount.toLocaleString()}/${accountBuildState.filteredGameCount.toLocaleString()}`
        : accountBuildState.state === 'empty'
          ? 'empty after filters'
          : accountBuildState.state === 'error'
            ? 'build error'
            : null
    : null;
  const sourceMainChildren = [
    h('div.repertoire__source-title-row', [
      isEditingName
        ? h('input.repertoire__source-name-input', {
            attrs: {
              value: _editingRepertoireSourceValue,
              'aria-label': `Rename ${source.name}`,
              ...controlExplainerAttrs({ label: `Rename ${source.name}`, description: 'Saves the new repertoire source name when the field loses focus.' }),
            },
            hook: { insert: (vn) => (vn.elm as HTMLInputElement).focus() },
            on: {
              input: (e: Event) => { _editingRepertoireSourceValue = (e.target as HTMLInputElement).value; },
              blur: () => saveRepertoireSourceRename(source, redraw),
              keydown: (e: KeyboardEvent) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') {
                  _editingRepertoireSourceId = null;
                  _editingRepertoireSourceValue = '';
                  redraw();
                }
              },
            },
          })
        : renderRepertoireChip(source, index),
      h('span.repertoire__chapter-count', sourceCountLabel),
    ]),
    h('div.repertoire__source-meta', [
      h('span', source.enabled ? 'Enabled' : 'Disabled'),
      h('span.repertoire__source-sep', '·'),
      accountSource ? h('span', repertoireAccountFilterSummary(source)) : h('span', `version ${source.contentVersion.slice(0, 8)}`),
      accountBuildLabel ? h('span.repertoire__source-sep', '·') : null,
      accountBuildLabel ? h('span', accountBuildLabel) : null,
    ]),
  ];
  return h(`div.repertoire__source-row.repertoire__accent--${index % 8}`, { key: source.id }, [
    isEditingName || accountSource
      ? h('div.repertoire__source-main', sourceMainChildren)
      : h('button.repertoire__source-main.repertoire__source-open', {
          attrs: {
            ...controlExplainerAttrs({ label: `Open ${source.name}`, description: 'Opens this repertoire source for chapter browsing.' }),
          },
          on: { click: () => {
            openRepertoireSourceBrowse(source, index);
            redraw();
          }},
        }, sourceMainChildren),
    renderRepertoireBusyControl(source.enabled ? `Disable ${source.name}` : `Enable ${source.name}`, h('button.repertoire__source-toggle', {
      attrs: {
        disabled: _repertoireSourceBusy,
        'aria-pressed': String(source.enabled),
        ...controlExplainerAttrs({ label: source.enabled ? `Disable ${source.name}` : `Enable ${source.name}`, description: `${source.enabled ? 'Excludes' : 'Includes'} this source in repertoire reports and practice.` }),
      },
      class: { active: source.enabled },
      on: { click: (e: Event) => {
        e.stopPropagation();
        toggleRepertoireSourceEnabled(source, redraw);
      }},
    }, source.enabled ? 'On' : 'Off')),
    h('div.repertoire__source-menu-wrap', [
      renderRepertoireBusyControl(`Actions for ${source.name}`, h('button.repertoire__source-menu-button', {
        attrs: {
          disabled: _repertoireSourceBusy,
          ...iconControlExplainerAttrs({ label: `Actions for ${source.name}`, description: 'Opens repertoire source settings and destructive actions.' }),
        },
        on: { click: (e: Event) => {
          e.stopPropagation();
          _openRepertoireMenuId = _openRepertoireMenuId === source.id ? null : source.id;
          redraw();
        }},
      }, '⋮')),
      renderRepertoireSourceMenu(source, redraw),
    ]),
  ]);
}

function renderRepertoireSourcesSection(redraw: () => void): VNode {
  const header = h('div.repertoire__section-header', [
    h('h2.repertoire__section-title', 'Repertoire Sources'),
    renderAccountSourceAddButton(redraw),
    renderRepertoireUploadControl(redraw),
  ]);

  if (!repertoireSourcesLoaded()) {
    return h('section.repertoire__source-section', [
      header,
      h('div.repertoire__source-loading', 'Loading...'),
    ]);
  }

  if (repertoireSourcesError()) {
    return h('section.repertoire__source-section', [
      header,
      h('div.repertoire__source-error', 'Could not load repertoire sources.'),
      _repertoireSourceStatus ? h('div.repertoire__source-status', _repertoireSourceStatus) : null,
    ]);
  }

  const sources = repertoireSources();
  return h('section.repertoire__source-section', [
    header,
    renderAccountSourcePicker(redraw),
    sources.length === 0
      ? h('div.repertoire__source-empty', 'No repertoire sources yet.')
      : h('div.repertoire__source-list',
          sources.map((source, index) => renderRepertoireSourceRow(source, index, redraw))
        ),
    _repertoireSourceStatus ? h('div.repertoire__source-status', _repertoireSourceStatus) : null,
  ]);
}

function repertoireScanActionLabel(): string {
  const progress = repertoireScanProgress();
  if (repertoireScanBusy() || progress?.state === 'running') return 'Pause scan';
  if (progress?.state === 'paused') return 'Resume';
  return 'Run scan';
}

const REPORT_DATE_OPTIONS: { value: RepertoireComplianceDateFilter; label: string }[] = [
  { value: 'all', label: 'All dates' },
  { value: 'last-30', label: 'Last 30 days' },
  { value: 'last-90', label: 'Last 90 days' },
  { value: 'last-365', label: 'Last year' },
  { value: 'undated', label: 'Undated' },
];

function updateReportFilters(filters: Parameters<typeof setRepertoireComplianceReportFilters>[0], redraw: () => void): void {
  setRepertoireComplianceReportFilters(filters);
  redraw();
}

function renderReportSelect(
  label: string,
  value: string,
  options: { value: string; label: string; count?: number }[],
  onChange: (value: string) => void,
): VNode {
  return h('div.games-view__filter-group.repertoire__filter-group', [
    h('span.games-view__filter-label', label),
    h('select.repertoire__filter-select', {
      attrs: {
        'aria-label': `Filter repertoire report by ${label.toLowerCase()}`,
        ...controlExplainerAttrs({ label: `Filter repertoire report by ${label.toLowerCase()}`, description: `Limits the repertoire report by ${label.toLowerCase()}.` }),
      },
      props: { value },
      on: { change: (e: Event) => onChange((e.target as HTMLSelectElement).value) },
    }, options.map(option =>
      h('option', { attrs: { value: option.value } },
        option.count === undefined ? option.label : `${option.label} (${option.count})`)
    )),
  ]);
}

function renderReportPill<T extends string>(
  label: string,
  value: T,
  activeValue: T | null,
  redraw: () => void,
  key: 'ownerColor' | 'result' | 'category',
): VNode {
  const active = activeValue === value;
  const next = active ? null : value;
  // Category has no "no filter" state — RepertoireComplianceReportFilters.category is always
  // exactly one of 'owner' | 'opponent' | 'all' (default 'owner'), unlike ownerColor/result, which
  // clear back to null ("no filter") when their active pill is clicked again. So the category
  // title never claims a "Clear" action, and its apply() branch below re-applies `value` directly
  // instead of toggling through `next` (which can be null) — casting a null `next` into the
  // non-nullable `category` field would silently write an invalid state past the type checker.
  const title = active && key !== 'category'
    ? `Clear ${label} repertoire report filter`
    : `Filter repertoire report by ${label}`;
  const apply = (): void => {
    if (key === 'ownerColor') {
      updateReportFilters({ ownerColor: next as RepertoireComplianceOwnerColorFilter | null }, redraw);
      return;
    }
    if (key === 'category') {
      updateReportFilters({ category: value as RepertoireComplianceCategoryFilter }, redraw);
      return;
    }
    updateReportFilters({ result: next as RepertoireComplianceOutcome | null }, redraw);
  };
  return h('button.games-view__pill.repertoire__filter-pill', {
    class: { active },
    attrs: {
      type: 'button',
      'aria-pressed': String(active),
      ...controlExplainerAttrs({ label: title, description: `${active && key !== 'category' ? 'Removes' : 'Applies'} this repertoire report filter.` }),
    },
    on: { click: apply },
  }, label);
}

function renderRepertoireReportFilters(report: RepertoireComplianceReport, redraw: () => void): VNode {
  const filters = repertoireComplianceReportFilters();
  const accountOptions = [
    { value: '', label: 'All accounts' },
    ...report.filterOptions.accounts,
  ];
  const timeOptions = [
    { value: '', label: 'All time controls' },
    ...report.filterOptions.timeClasses,
  ];

  return h('div.games-view__controls.repertoire__report-filters', [
    // T7-A2 (Audit C F14): the category filter is the primary "what counts" control, so it leads
    // the filter bar ahead of the account/color/result/time/date refinements below.
    h('div.games-view__filter-group.repertoire__filter-group', [
      h('span.games-view__filter-label', 'Category'),
      renderReportPill('Your divergences', 'owner', filters.category, redraw, 'category'),
      renderReportPill('Opponent', 'opponent', filters.category, redraw, 'category'),
      renderReportPill('All', 'all', filters.category, redraw, 'category'),
    ]),
    renderReportSelect('Account', filters.accountId ?? '', accountOptions, value =>
      updateReportFilters({ accountId: value || null }, redraw)
    ),
    h('div.games-view__filter-group.repertoire__filter-group', [
      h('span.games-view__filter-label', 'Color'),
      renderReportPill('White', 'white', filters.ownerColor, redraw, 'ownerColor'),
      renderReportPill('Black', 'black', filters.ownerColor, redraw, 'ownerColor'),
    ]),
    h('div.games-view__filter-group.repertoire__filter-group', [
      h('span.games-view__filter-label', 'Result'),
      renderReportPill('Win', 'win', filters.result, redraw, 'result'),
      renderReportPill('Loss', 'loss', filters.result, redraw, 'result'),
      renderReportPill('Draw', 'draw', filters.result, redraw, 'result'),
    ]),
    renderReportSelect('Time', filters.timeClass ?? '', timeOptions, value =>
      updateReportFilters({ timeClass: value || null }, redraw)
    ),
    renderReportSelect('Date', filters.date, REPORT_DATE_OPTIONS, value =>
      updateReportFilters({ date: value as RepertoireComplianceDateFilter }, redraw)
    ),
    repertoireComplianceReportFiltersActive(filters)
      ? h('div.games-view__filter-group.--right.repertoire__filter-clear-wrap', [
          h('button.games-view__clear', {
            attrs: {
              type: 'button',
              ...controlExplainerAttrs({ label: 'Clear repertoire report filters', description: 'Removes every active repertoire report filter.' }),
            },
            on: { click: () => { resetRepertoireComplianceReportFilters(); redraw(); } },
          }, 'Clear filters'),
        ])
      : null,
  ]);
}

function renderLossRatioToken(group: RepertoireComplianceReportGroup): VNode {
  const lostPct = group.seenCount > 0 ? (group.lostCount / group.seenCount) * 100 : 0;
  const nonLossPct = 100 - lostPct;
  const label = `${group.seenCount.toLocaleString()} seen · ${group.lostCount.toLocaleString()} lost`;
  return h('span.repertoire__loss-ratio', {
    attrs: { 'aria-label': label },
  }, [
    h('span.repertoire__loss-ratio-bar', [
      h('span.wdl-w.repertoire__loss-ratio-segment', {
        attrs: { style: `width:${nonLossPct.toFixed(1)}%` },
      }),
      h('span.wdl-l.repertoire__loss-ratio-segment', {
        attrs: { style: `width:${lostPct.toFixed(1)}%` },
      }),
    ]),
    h('span.repertoire__loss-ratio-counts', label),
  ]);
}

function reportGameHref(gameId: string, ply: number | null): string {
  return serializeAnalysisRouteWithPly(serializeAnalysisSelectedGameRoute(gameId), ply);
}

function repertoireReportGroupSource(group: RepertoireComplianceReportGroup): RepertoireSource | null {
  return repertoireSources().find(source => source.id === group.sourceId) ?? null;
}

function openRepertoireReportGroupOnBoard(group: RepertoireComplianceReportGroup, redraw: () => void): void {
  const source = repertoireReportGroupSource(group);
  if (!source) return;
  openRepertoireSourceBrowse(source, group.sourceAccentIndex, {
    uciPrefix: group.linePrefix.slice(0, -1).map(move => move.uci),
  });
  redraw();
}

function setRepertoireOrpFeedback(key: string, message: string, redraw: () => void): void {
  _repertoireOrpFeedback.set(key, message);
  const existingTimer = _repertoireOrpFeedbackTimers.get(key);
  if (existingTimer) clearTimeout(existingTimer);
  const timer = setTimeout(() => {
    _repertoireOrpFeedback.delete(key);
    _repertoireOrpFeedbackTimers.delete(key);
    redraw();
  }, 1800);
  _repertoireOrpFeedbackTimers.set(key, timer);
}

function renderStudyNextFormula(group: RepertoireComplianceReportGroup): VNode {
  const label = `seen ${group.seenCount.toLocaleString()} x lost ${group.lostCount.toLocaleString()}`;
  return h('span.repertoire__study-next-formula', {
    attrs: { 'aria-label': label },
  }, label);
}

function repertoireLineMoveLabel(move: RepertoireLinePrefixMove, isFirst: boolean): string {
  const turn = Math.ceil(move.ply / 2);
  const prefix = move.ply % 2 === 1 ? `${turn}.` : isFirst ? `${turn}...` : '';
  return `${prefix}${move.san}`;
}

function renderRepertoireLinePrefixMoves(moves: readonly RepertoireLinePrefixMove[]): (VNode | string)[] {
  return moves.flatMap((move, index) => [
    index > 0 ? ' ' : '',
    h('span.repertoire__line-move', repertoireLineMoveLabel(move, index === 0)),
  ]);
}

function renderRepertoireLineText(group: RepertoireComplianceReportGroup): VNode[] {
  const linePrefix = group.linePrefix;
  const divergenceMove = linePrefix[linePrefix.length - 1] ?? null;
  if (!divergenceMove) {
    return [
      h('span.repertoire__line-prefix', `${group.sourceName} · ${group.firstDivergencePly === null ? 'ply ?' : `ply ${group.firstDivergencePly}`} · `),
      h('span.repertoire__line-highlight', group.playedUci ? `played ${group.playedUci}` : 'played ?'),
      h('span.repertoire__line-expected', group.missedUci ? ` expected ${group.missedUci}` : ' expected ?'),
    ];
  }

  const prefixMoves = linePrefix.slice(0, -1);
  const expected = group.missedSan ?? group.missedUci ?? '?';
  return [
    prefixMoves.length > 0
      ? h('span.repertoire__line-prefix', [
          ...renderRepertoireLinePrefixMoves(prefixMoves),
          ' ',
        ])
      : h('span.repertoire__line-prefix'),
    h('span.repertoire__line-highlight', repertoireLineMoveLabel(divergenceMove, prefixMoves.length === 0)),
    h('span.repertoire__line-expected', ` · repertoire ${expected}`),
  ];
}

function renderRepertoireReportGameList(group: RepertoireComplianceReportGroup): VNode {
  return h('div.repertoire__line-games', group.games.map(entry => {
    const href = reportGameHref(entry.gameId, entry.firstDivergencePly);
    const title = entry.firstDivergencePly === null
      ? `Open ${entry.gameId} in Analysis`
      : `Open ${entry.gameId} in Analysis at ply ${entry.firstDivergencePly}`;
    return h('a.repertoire__line-game.game-list__row', {
      key: entry.gameId,
      attrs: {
        href,
        ...controlExplainerAttrs({ label: title, description: 'Opens this game in Analysis at the first repertoire divergence.' }),
      },
    }, entry.game
      ? renderCompactGameRow(entry.game, false, false)
      : [h('span.grl__opponent', entry.gameId), h('span.grl__date', 'Game metadata unavailable')]);
  }));
}

function renderRepertoireStudyNextActions(group: RepertoireComplianceReportGroup, redraw: () => void): VNode {
  const source = repertoireReportGroupSource(group);
  const openTitle = source
    ? `Open ${group.sourceName} at the repertoire prefix before this divergence`
    : `Source ${group.sourceName} is not available`;
  const orpUnavailableReason = repertoireOrpUnavailableReason(group, source);
  const saving = _repertoireOrpSavingRows.has(group.key);
  const orpTitle = orpUnavailableReason ?? `Send ${group.sourceName} line to Opening Repetition Practice`;
  const feedback = _repertoireOrpFeedback.get(group.key) ?? null;
  return h('div.repertoire__line-actions', [
    source
      ? h('button.study-btn.repertoire__line-action', {
          attrs: { type: 'button', ...controlExplainerAttrs({ label: openTitle, description: 'Opens this repertoire line on the board before the divergence.' }) },
          on: { click: () => openRepertoireReportGroupOnBoard(group, redraw) },
        }, 'Open on board')
      : renderDisabledControlExplainer(
          { label: 'Open on board', description: `Source ${group.sourceName} is not available.` },
          h('button.study-btn.repertoire__line-action', { attrs: { type: 'button', disabled: true } }, 'Open on board'),
        ),
    !orpUnavailableReason && !saving
      ? h('button.study-btn.repertoire__line-action', {
          attrs: { type: 'button', ...controlExplainerAttrs({ label: orpTitle, description: 'Saves this repertoire line to Opening Repetition Practice.' }) },
          on: { click: () => { if (source) saveRepertoireReportGroupToOrp(group, source, redraw); } },
        }, 'Send to ORP')
      : renderDisabledControlExplainer(
          { label: saving ? 'Saving to Opening Repetition Practice' : 'Send to Opening Repetition Practice', description: saving ? 'Wait for the current Opening Repetition Practice save to finish.' : `${orpUnavailableReason}` },
          h('button.study-btn.repertoire__line-action', { attrs: { type: 'button', disabled: true } }, saving ? 'Saving...' : 'Send to ORP'),
        ),
    feedback ? h('span.openings__save-feedback.repertoire__line-feedback', feedback) : null,
  ]);
}

function repertoireOrpUnavailableReason(
  group: RepertoireComplianceReportGroup,
  source: RepertoireSource | null,
): string | null {
  // T7-A4 (Audit C F14): an 'opponent-left' divergence has no owner move to drill — gate, don't
  // warn, ahead of the source/mixed/missedUci checks below (see T7_REPERTOIRE_DESIGN §A.1).
  if (group.category === 'opponent-left') return "This was the opponent's deviation, not yours — there's no repertoire move of your own to drill here.";
  if (!source) return `Source ${group.sourceName} is not available`;
  if (group.ownerColor === 'mixed') return 'This aggregate row mixes White and Black owner games, so send each color separately.';
  if (!group.missedUci) return 'No repertoire move is available for this row.';
  return null;
}

function saveRepertoireReportGroupToOrp(
  group: RepertoireComplianceReportGroup,
  source: RepertoireSource,
  redraw: () => void,
): void {
  if (_repertoireOrpSavingRows.has(group.key)) return;
  _repertoireOrpSavingRows.add(group.key);
  redraw();
  void Promise.resolve().then(async () => {
    const line = resolveRepertoireReportGroupOrpLine(group, source);
    if (!line) return 'Could not resolve the full source line for ORP.';
    if (line.ucis.length < 3) return 'Line too short to practice.';
    const result = await saveRepertoireLineToOrpLibrary({
      ucis: line.ucis,
      sans: line.sans,
      trainAs: line.trainAs,
      sourceName: line.sourceName,
      title: line.label,
    });
    return result?.alreadyExisted ? 'Already in practice' : result ? 'Saved to Library!' : 'Save failed - invalid moves';
  }).then(message => {
    setRepertoireOrpFeedback(group.key, message, redraw);
  }).catch(error => {
    const message = error instanceof Error && error.message ? `Save failed - ${error.message}` : 'Save failed';
    setRepertoireOrpFeedback(group.key, message, redraw);
  }).finally(() => {
    _repertoireOrpSavingRows.delete(group.key);
    redraw();
  });
}

function renderRepertoireReportRow(
  group: RepertoireComplianceReportGroup,
  redraw: () => void,
  mode: RepertoireReportMode,
): VNode {
  const expanded = _expandedRepertoireReportRows.has(group.key);
  const toggleTitle = expanded
    ? `Hide ${group.seenCount} matching games for ${group.lineLabel}`
    : `Show ${group.seenCount} matching games for ${group.lineLabel}`;
  return h('div.repertoire__line-row', { key: group.key }, [
    h('button.repertoire__line-summary', {
      attrs: {
        type: 'button',
        'aria-expanded': String(expanded),
        ...controlExplainerAttrs({ label: toggleTitle, description: `${expanded ? 'Hides' : 'Shows'} the matching games behind this repertoire divergence.` }),
      },
      on: { click: () => {
        if (expanded) _expandedRepertoireReportRows.delete(group.key);
        else _expandedRepertoireReportRows.add(group.key);
        redraw();
      } },
    }, [
      h('span.repertoire__line-main', [
        h('span.repertoire__line-text', renderRepertoireLineText(group)),
        h('span.repertoire__category-badge', group.categoryLabel),
        renderRepertoireIdentityChip(group.sourceName, group.sourceSide, group.sourceAccentIndex),
      ]),
      h('span.repertoire__line-metrics', [
        renderLossRatioToken(group),
        mode === 'study-next' ? renderStudyNextFormula(group) : null,
        h('span.repertoire__line-game-count', `${expanded ? '▾' : '▸'} ${group.seenCount.toLocaleString()} game${group.seenCount === 1 ? '' : 's'}`),
      ]),
    ]),
    mode === 'study-next' ? renderRepertoireStudyNextActions(group, redraw) : null,
    expanded ? renderRepertoireReportGameList(group) : null,
  ]);
}

function renderRepertoireReportTabs(redraw: () => void): VNode {
  const tabs: { mode: RepertoireReportMode; label: string }[] = [
    { mode: 'divergences', label: 'Divergences' },
    { mode: 'study-next', label: 'Study next' },
  ];
  return h('div.repertoire__report-tabs', {
    attrs: { role: 'tablist', 'aria-label': 'Repertoire compliance report view', ...controlExplainerAttrs({ label: 'Repertoire compliance report views' }) },
  }, tabs.map(tab => {
    const active = _repertoireReportMode === tab.mode;
    return h('button.repertoire__report-tab', {
      class: { active },
      attrs: {
        type: 'button',
        role: 'tab',
        'aria-selected': String(active),
        ...controlExplainerAttrs({ label: tab.label, description: `Shows the ${tab.label.toLowerCase()} repertoire report view.` }),
      },
      on: { click: () => {
        _repertoireReportMode = tab.mode;
        redraw();
      } },
    }, tab.label);
  }));
}

// T7-A8 (Audit C F16, consumption half): a sibling control next to the tabs, not inside them —
// Study-Next-only, since the dilution problem (F16) is specifically about Study-Next ranking; the
// Divergences tab's grouping is intentionally unchanged and has nothing to toggle.
function renderRepertoireStudyNextGroupToggle(redraw: () => void): VNode | null {
  if (_repertoireReportMode !== 'study-next') return null;
  const options: { mode: RepertoireStudyNextGroupMode; label: string }[] = [
    { mode: 'position', label: 'Position' },
    { mode: 'exact-line', label: 'Exact line' },
  ];
  return h('div.games-view__filter-group.repertoire__filter-group.repertoire__group-by', [
    h('span.games-view__filter-label', 'Group by'),
    ...options.map(option => {
      const active = _repertoireStudyNextGroupMode === option.mode;
      const title = `Group Study-Next rows by ${option.label.toLowerCase()}`;
      return h('button.games-view__pill.repertoire__filter-pill', {
        class: { active },
        attrs: {
          type: 'button',
          'aria-pressed': String(active),
          ...controlExplainerAttrs({ label: title, description: 'Changes how Study-Next repertoire rows are grouped.' }),
        },
        on: { click: () => {
          if (_repertoireStudyNextGroupMode === option.mode) return;
          _repertoireStudyNextGroupMode = option.mode;
          redraw();
        } },
      }, option.label);
    }),
  ]);
}

// T7-A2 (Audit C F14): name what's actually being counted instead of a bare "X stored
// divergence(s)" figure that silently blended owner-caused and opponent-caused rows together.
// Uses filteredDivergenceCount alone rather than a "filtered of total" comparison against
// totalDivergenceCount, because totalDivergenceCount spans every category regardless of the
// category filter — comparing the two no longer isolates "some other filter is narrowing this
// view" once category is one of the filters folded into filteredDivergenceCount; it would also
// fire from the category filter itself on any course with opponent-left records, which is the
// expected common case, not a corner case.
function repertoireReportSummaryText(report: RepertoireComplianceReport): string {
  const count = report.filteredDivergenceCount.toLocaleString();
  const plural = report.filteredDivergenceCount === 1 ? '' : 's';
  if (report.filters.category === 'opponent') {
    return `${count} opponent deviation${plural} (shown for reference, not counted against you)`;
  }
  if (report.filters.category === 'all') {
    return `${count} divergence${plural} across all categories`;
  }
  return `${count} divergence${plural} from your repertoire`;
}

function renderRepertoireReportBody(redraw: () => void): VNode {
  if (repertoireComplianceReportError()) {
    return h('div.repertoire__source-error', 'Could not load stored divergence records.');
  }

  if (!repertoireComplianceReportLoaded()) {
    return h('div.repertoire__source-loading', 'Loading stored divergence records...');
  }

  const report = repertoireComplianceReport();
  // T7-A8: the "Group by" toggle only applies on the Study-Next tab, and only changes which
  // grouping key feeds the ranked list — report.studyNextGroupsByLine (the Divergences tab's
  // exact-line grouping, but Study-Next-ranked, for the "Exact line" audit view) or
  // report.studyNextGroups (the corrected, position-first grouping, default). Both are ranked by
  // the same sortStudyNextGroups score, so the toggle changes grouping only, never ranking.
  const groups = _repertoireReportMode === 'study-next'
    ? (_repertoireStudyNextGroupMode === 'exact-line' ? report.studyNextGroupsByLine : report.studyNextGroups)
    : report.groups;
  const summary = repertoireReportSummaryText(report);

  return h('div.repertoire__report', [
    renderRepertoireReportFilters(report, redraw),
    h('div.repertoire__report-summary', summary),
    renderRepertoireReportTabs(redraw),
    renderRepertoireStudyNextGroupToggle(redraw),
    groups.length === 0
      ? h('div.repertoire__source-empty',
          report.totalDivergenceCount === 0
            ? 'No stored divergence records yet.'
            : 'No divergence rows match these filters.'
        )
      : h('div.repertoire__line-list',
          groups.map(group => renderRepertoireReportRow(group, redraw, _repertoireReportMode))
        ),
  ]);
}

function renderRepertoireComplianceSection(redraw: () => void): VNode {
  const progress = repertoireScanProgress();
  const loaded = repertoireScanProgressLoaded();
  const busy = repertoireScanBusy() || progress?.state === 'running';
  const scanned = progress?.scannedGameCount ?? 0;
  const total = progress?.totalGameCount ?? 0;
  const progressLabel = loaded
    ? `${scanned.toLocaleString()}/${total.toLocaleString()} games scanned`
    : 'Loading scan status...';
  const disabled =
    !loaded ||
    progress?.state === 'empty' ||
    progress?.state === 'error';
  const actionLabel = repertoireScanActionLabel();
  const actionTitle = busy ? 'Pause repertoire compliance scan' : `${actionLabel} repertoire compliance scan`;

  return h('section.repertoire__scan-section', [
    h('div.repertoire__scan-header', [
      h('h2.repertoire__section-title', 'Repertoire Compliance'),
      disabled
        ? renderDisabledControlExplainer(
            { label: actionTitle, description: !loaded ? 'Wait for repertoire scan status to load.' : progress?.state === 'empty' ? 'Add repertoire sources before running a compliance scan.' : 'Resolve the repertoire scan error before trying again.' },
            h('button.study-btn.repertoire__scan-action', { attrs: { type: 'button', disabled: true } }, actionLabel),
          )
        : h('button.study-btn.repertoire__scan-action', {
            attrs: { type: 'button', ...controlExplainerAttrs({ label: actionTitle, description: `${busy ? 'Pauses' : 'Starts'} the repertoire compliance scan.` }) },
            on: { click: () => { if (busy) pauseRepertoireScanFromStudy(redraw); else runRepertoireScanFromStudy(redraw); } },
          }, actionLabel),
      h('span.repertoire__scan-progress', progressLabel),
    ]),
    progress?.message
      ? h(`div.repertoire__scan-message.repertoire__scan-message--${progress.state}`, progress.message)
      : null,
    renderRepertoireReportBody(redraw),
  ]);
}

// --- Row rendering ---

function renderStudyRow(item: StudyItem, idx: number, redraw: () => void, folderNameById: Map<string, string>): VNode {
  const isEditingTitle = _editingTitleId === item.id;
  const isEditingTag   = _editingTagId === item.id;
  const selected       = isSelected(item.id);

  return h('div.study-row', {
    key: item.id,
    class: { 'study-row--selected': selected },
    attrs: { draggable: 'true', role: 'button', tabindex: '0', ...controlExplainerAttrs({ label: `${selected ? 'Deselect' : 'Select'} ${item.title}`, description: 'Changes this game selection for Study bulk actions.' }) },
    on: {
      click: (e: MouseEvent) => {
        // Only trigger selection if clicking on row background (not on child buttons/inputs)
        const target = e.target as HTMLElement;
        if (target.closest('button, a, input, textarea')) return;
        handleStudyClick(item.id, idx, e);
        redraw();
      },
      keydown: (e: KeyboardEvent) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        handleStudyClick(item.id, idx, e as unknown as MouseEvent);
        redraw();
      },
      dragstart: (e: DragEvent) => {
        _draggingStudyId = item.id;
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', item.id);
        }
      },
      dragend: () => { _draggingStudyId = null; _dragOverFolderId = null; redraw(); },
    },
  }, [
    // Selection checkbox
    h('input.study-row__checkbox', {
      attrs: { type: 'checkbox', checked: selected, 'aria-label': `${selected ? 'Deselect' : 'Select'} ${item.title}`, ...controlExplainerAttrs({ label: `${selected ? 'Deselect' : 'Select'} ${item.title}`, description: 'Changes this game selection for Study bulk actions.' }) },
      on: { click: (e: Event) => {
        e.stopPropagation();
        handleStudyClick(item.id, idx, e as unknown as MouseEvent);
        redraw();
      } },
    }),
    // Favorite star
    h('button.study-row__fav', {
      class: { active: item.favorite },
      attrs: { type: 'button', 'aria-pressed': String(item.favorite), ...iconControlExplainerAttrs({ label: item.favorite ? `Remove ${item.title} from Favorites` : `Add ${item.title} to Favorites`, description: `${item.favorite ? 'Removes' : 'Adds'} this Study game ${item.favorite ? 'from' : 'to'} Favorites.` }) },
      on: { click: (e: Event) => {
        e.stopPropagation();
        void updateStudy({ id: item.id, favorite: !item.favorite }).then(redraw);
      } },
    }, item.favorite ? '★' : '☆'),

    // Main content area
    h('div.study-row__main', {}, [
      // Title row: inline editable title + open-study link + expand toggle
      h('div.study-row__title-row', [
        isEditingTitle
          ? h('input.study-row__title-input', {
              attrs: { value: _editingTitleValue, placeholder: 'Study title', 'aria-label': 'Study title', ...controlExplainerAttrs({ label: 'Study title', description: 'Renames this Study game when the field loses focus.' }) },
              hook: { insert: (vn) => (vn.elm as HTMLInputElement).focus() },
              on: {
                input:   (e: Event) => { _editingTitleValue = (e.target as HTMLInputElement).value; },
                blur:    () => {
                  void updateStudy({ id: item.id, title: _editingTitleValue.trim() || item.title }).then(redraw);
                  _editingTitleId    = null;
                  _editingTitleValue = '';
                },
                keydown: (e: KeyboardEvent) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') { _editingTitleId = null; redraw(); }
                },
              },
            })
          : h('span.study-row__title', {
              attrs: { role: 'button', tabindex: '0', ...controlExplainerAttrs({ label: `Rename ${item.title}`, description: 'Opens this Study title for editing.' }) },
              on: { click: () => {
                _editingTitleId    = item.id;
                _editingTitleValue = item.title;
                redraw();
              }, keydown: (e: KeyboardEvent) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                _editingTitleId = item.id;
                _editingTitleValue = item.title;
                redraw();
              } },
            }, item.title),
        h('a.study-row__open', {
          attrs: { href: `#/study/${item.id}`, ...iconControlExplainerAttrs({ label: `Open ${item.title}`, description: 'Opens this game in the Study workspace.' }) },
          on: { click: (e: Event) => e.stopPropagation() },
        }, '→'),
        h('button.study-row__expand', {
          attrs: { type: 'button', 'aria-expanded': String(_expandedRows.has(item.id)), ...iconControlExplainerAttrs({ label: _expandedRows.has(item.id) ? `Collapse ${item.title} details` : `Expand ${item.title} details`, description: `${_expandedRows.has(item.id) ? 'Hides' : 'Shows'} notes and folder details for this game.` }) },
          on: { click: () => {
            if (_expandedRows.has(item.id)) _expandedRows.delete(item.id);
            else _expandedRows.add(item.id);
            redraw();
          } },
        }, _expandedRows.has(item.id) ? '▲' : '▼'),
      ]),

      // Meta row: source · date · due indicator
      h('div.study-row__meta', [
        h('span.study-row__source', sourceLabel(item.source)),
        h('span.study-row__sep', '·'),
        h('span.study-row__date', formatDate(item.createdAt)),
        ...(practiceLoaded() && dueCountForStudy(item.id) > 0
          ? [h('span.study-row__sep', '·'), h('span.study-row__due', `${dueCountForStudy(item.id)} due`)]
          : []),
        item.white && item.black ? h('span.study-row__players', [
          h('span.study-row__sep', '·'),
          `${item.white} vs ${item.black}`,
        ]) : null,
      ]),

      // Tags
      h('div.study-row__tags', [
        ...item.tags.map(tag =>
          h('span.study-tag', { key: tag }, [
            tag,
            h('button.study-tag__remove', {
              attrs: { type: 'button', ...iconControlExplainerAttrs({ label: `Remove tag ${tag}`, description: 'Removes this tag from the Study game.' }) },
              on: { click: (e: Event) => {
                e.stopPropagation();
                void updateStudy({ id: item.id, tags: item.tags.filter(t => t !== tag) }).then(redraw);
              } },
            }, '×'),
          ])
        ),
        // Tag input toggle
        isEditingTag
          ? h('input.study-tag__input', {
              attrs: { placeholder: 'Add tag…', value: _editingTagValue, 'aria-label': 'Add tag', ...controlExplainerAttrs({ label: 'Add tag', description: 'Adds this tag when the field loses focus.' }) },
              hook: { insert: (vn) => (vn.elm as HTMLInputElement).focus() },
              on: {
                input:   (e: Event) => { _editingTagValue = (e.target as HTMLInputElement).value; },
                blur:    () => {
                  const tag = _editingTagValue.trim();
                  if (tag && !item.tags.includes(tag)) {
                    void updateStudy({ id: item.id, tags: [...item.tags, tag] }).then(redraw);
                  }
                  _editingTagId    = null;
                  _editingTagValue = '';
                },
                keydown: (e: KeyboardEvent) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') { _editingTagId = null; redraw(); }
                },
              },
            })
          : h('button.study-tag__add', {
              attrs: iconControlExplainerAttrs({ label: 'Add tag' }),
              on: { click: () => {
                _editingTagId    = item.id;
                _editingTagValue = '';
                redraw();
              } },
            }, '+'),
      ]),

      // Expanded section: notes + folder
      _expandedRows.has(item.id) ? h('div.study-row__expanded', [
        // Notes textarea
        h('label.study-row__notes-label', 'Notes'),
        h('textarea.study-row__notes', {
          attrs: { placeholder: 'Add notes…', rows: 3, 'aria-label': `Notes for ${item.title}`, ...controlExplainerAttrs({ label: `Notes for ${item.title}`, description: 'Saves these Study notes when the field loses focus.' }) },
          props: { value: item.notes ?? '' },
          on: { blur: (e: Event) => {
            void updateStudy({ id: item.id, notes: (e.target as HTMLTextAreaElement).value });
          } },
        }),

        // Folder
        h('div.study-row__folder-row', [
          h('label.study-row__folder-label', 'Folder'),
          item.folders.length > 0
            ? h('div.study-row__folder-list', item.folders.map(f => {
                // item.folders holds StudyFolder.id values (P2-LIB-11); resolve to the current
                // display name here rather than rendering the raw id.
                const label = folderNameById.get(f) ?? f;
                return h('span.study-folder', { key: f }, [
                  label,
                  h('button.study-folder__remove', {
                    attrs: { type: 'button', ...iconControlExplainerAttrs({ label: `Remove folder ${label}`, description: 'Removes this game from the folder.' }) },
                    on: { click: () => {
                      void updateStudy({ id: item.id, folders: item.folders.filter(x => x !== f) }).then(redraw);
                    } },
                  }, '×'),
                ]);
              }))
            : null,
          _editingFolderId === item.id
            ? h('input.study-folder__input', {
                attrs: { placeholder: 'Folder name…', value: _editingFolderValue, 'aria-label': 'Folder name', ...controlExplainerAttrs({ label: 'Folder name', description: 'Adds this Study game to the named folder.' }) },
                hook: { insert: (vn) => (vn.elm as HTMLInputElement).focus() },
                on: {
                  input: (e: Event) => { _editingFolderValue = (e.target as HTMLInputElement).value; },
                  blur: () => {
                    // Free-text folder name (P2-LIB-11): resolved to (or synthesizes) a stable
                    // StudyFolder.id through the ctrl, never written into item.folders as a raw
                    // name — this was the T5-D01-flagged orphan-creation bug.
                    const name = _editingFolderValue.trim();
                    if (name) {
                      void addStudyToFolderByName(item.id, name).then(redraw);
                    }
                    _editingFolderId    = null;
                    _editingFolderValue = '';
                  },
                  keydown: (e: KeyboardEvent) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') { _editingFolderId = null; redraw(); }
                  },
                },
              })
            : h('button.study-tag__add', {
                attrs: controlExplainerAttrs({ label: 'Add to folder', description: 'Opens a folder-name field for this Study game.' }),
                on: { click: () => { _editingFolderId = item.id; _editingFolderValue = ''; redraw(); } },
              }, '+ folder'),
        ]),
      ]) : null,
    ]),

    // Delete button
    h('button.study-row__delete', {
      attrs: iconControlExplainerAttrs({ label: `Delete ${item.title}`, description: 'Permanently deletes this Study game after confirmation.' }),
      on: { click: (e: Event) => {
        e.stopPropagation();
        if (confirm(`Delete "${item.title}"?`)) {
          void deleteStudy(item.id).then(redraw);
        }
      } },
    }, '×'),
  ]);
}

// --- Folder sidebar state (ephemeral) ---
let _newFolderMode  = false;
let _newFolderValue = '';
let _renamingFolderId: string | null = null;
let _renamingFolderValue = '';

// --- Drag-and-drop state ---
let _draggingStudyId: string | null = null;
let _dragOverFolderId: string | null = null;

// DnD drop handlers for a folder drop target identified by its stable id (P2-LIB-11).
function folderDropHandlers(folderId: string, redraw: () => void) {
  return {
    dragover: (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      if (_dragOverFolderId !== folderId) { _dragOverFolderId = folderId; redraw(); }
    },
    dragleave: () => {
      if (_dragOverFolderId === folderId) { _dragOverFolderId = null; redraw(); }
    },
    drop: (e: DragEvent) => {
      e.preventDefault();
      const studyId = e.dataTransfer?.getData('text/plain') ?? _draggingStudyId;
      _dragOverFolderId = null;
      if (studyId) void moveStudyToFolder(studyId, folderId).then(redraw);
    },
  };
}

// --- Folder sidebar ---

function renderFolderSidebar(redraw: () => void): VNode {
  return h('div.study-sidebar', [
    h('div.study-sidebar__header', [
      h('span.study-sidebar__title', 'Folders'),
      h('button.study-sidebar__toggle', {
        attrs: { type: 'button', ...iconControlExplainerAttrs({ label: sidebarCollapsed() ? 'Expand folder sidebar' : 'Collapse folder sidebar', description: `${sidebarCollapsed() ? 'Shows' : 'Hides'} the Study folder list.` }) },
        on: { click: () => { toggleSidebar(); redraw(); } },
      }, sidebarCollapsed() ? '›' : '‹'),
    ]),
    sidebarCollapsed() ? null : h('div.study-sidebar__folders', [
      h('button.study-sidebar__folder', {
        class: { active: activeFolderId() === null },
        attrs: { type: 'button', 'aria-pressed': String(activeFolderId() === null), ...controlExplainerAttrs({ label: 'Show all Studies', description: 'Clears the current folder filter.' }) },
        on: { click: () => {
          setActiveFolderId(null);
          writeStudyLibraryRoute({ folder: null }, { resetPages: true });
          resetStudyLibraryLens(redraw);
          redraw();
        } },
      }, 'All Studies'),

      // Folder entries (with rename + delete controls). Every StudyFolder record is real and
      // id-addressable (P2-LIB-11) — there is no more "orphaned inline name" case to merge in
      // separately; T5-D01's migration guarantees a backing record for every membership id.
      ...folders().map(folder => {
        const isRenaming = _renamingFolderId === folder.id;
        return h('div.study-sidebar__folder-row', { key: folder.id }, [
          isRenaming
            ? h('input.study-sidebar__folder-rename', {
                attrs: { value: _renamingFolderValue, 'aria-label': `Rename ${folder.name}`, ...controlExplainerAttrs({ label: `Rename ${folder.name}`, description: 'Saves the new folder name when the field loses focus.' }) },
                hook: { insert: (vn) => (vn.elm as HTMLInputElement).focus() },
                on: {
                  input: (e: Event) => { _renamingFolderValue = (e.target as HTMLInputElement).value; },
                  blur: () => {
                    if (_renamingFolderValue.trim()) {
                      void renameFolder(folder.id, _renamingFolderValue).then(redraw);
                    }
                    _renamingFolderId = null;
                    redraw();
                  },
                  keydown: (e: KeyboardEvent) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') { _renamingFolderId = null; redraw(); }
                  },
                },
              })
            : h('button.study-sidebar__folder', {
                class: {
                  active:       activeFolderId() === folder.id,
                  'drag-over':  _dragOverFolderId === folder.id,
                },
                attrs: { type: 'button', 'aria-pressed': String(activeFolderId() === folder.id), ...controlExplainerAttrs({ label: `Show ${folder.name}`, description: 'Filters the Study Library to this folder.' }) },
                on: {
                  click: () => {
                    const nextFolder = activeFolderId() === folder.id ? null : folder.id;
                    setActiveFolderId(nextFolder);
                    writeStudyLibraryRoute({ folder: nextFolder }, { resetPages: true });
                    resetStudyLibraryLens(redraw);
                    redraw();
                  },
                  ...folderDropHandlers(folder.id, redraw),
                },
              }, folder.name),
          h('div.study-sidebar__folder-actions', [
            h('button.study-sidebar__folder-action', {
              attrs: iconControlExplainerAttrs({ label: `Rename ${folder.name}` }),
              on: { click: (e: Event) => {
                e.stopPropagation();
                _renamingFolderId    = folder.id;
                _renamingFolderValue = folder.name;
                redraw();
              } },
            }, '✎'),
            h('button.study-sidebar__folder-action.study-sidebar__folder-action--danger', {
              attrs: iconControlExplainerAttrs({ label: `Delete ${folder.name}`, description: 'Deletes this folder after confirmation without deleting its games.' }),
              on: { click: (e: Event) => {
                e.stopPropagation();
                if (confirm(`Delete folder "${folder.name}"? Studies will not be deleted.`)) {
                  void removeFolderEntity(folder.id).then(redraw);
                }
              } },
            }, '×'),
          ]),
        ]);
      }),

      // New folder input or button
      _newFolderMode
        ? h('input.study-sidebar__new-folder', {
            attrs: { placeholder: 'Folder name…', value: _newFolderValue, 'aria-label': 'New folder name', ...controlExplainerAttrs({ label: 'New folder name', description: 'Creates a Study folder when the field loses focus.' }) },
            hook: { insert: (vn) => (vn.elm as HTMLInputElement).focus() },
            on: {
              input:   (e: Event) => { _newFolderValue = (e.target as HTMLInputElement).value; },
              blur:    () => {
                if (_newFolderValue.trim()) {
                  void createFolder(_newFolderValue).then(redraw);
                }
                _newFolderMode  = false;
                _newFolderValue = '';
                redraw();
              },
              keydown: (e: KeyboardEvent) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') { _newFolderMode = false; redraw(); }
              },
            },
          })
        : h('button.study-sidebar__new-folder-btn', {
            attrs: controlExplainerAttrs({ label: 'New folder' }),
            on: { click: () => { _newFolderMode = true; _newFolderValue = ''; redraw(); } },
          }, '+ New Folder'),
    ]),
  ]);
}

// --- Filter bar ---

function renderFilterBar(redraw: () => void): VNode {
  const tags = studyTags();
  const sources = ['analysis', 'openings', 'puzzles', 'manual', 'import'];

  return h('div.study-filter-bar', [
    // Search
    h('input.study-filter-bar__search', {
      attrs: { placeholder: 'Search studies…', value: searchQuery(), 'aria-label': 'Search Studies', ...controlExplainerAttrs({ label: 'Search Studies', description: 'Filters the Study Library as you type.' }) },
      on: { input: (e: Event) => {
        setSearch((e.target as HTMLInputElement).value);
        writeStudyLibraryRoute({ q: searchQuery() }, { resetPages: true });
        resetStudyLibraryLens(redraw);
        redraw();
      } },
    }),

    // Favorite filter
    h('button.study-filter-btn', {
      class: { active: filterFav() },
      attrs: { type: 'button', 'aria-pressed': String(filterFav()), ...controlExplainerAttrs({ label: `${filterFav() ? 'Clear' : 'Apply'} Favorites filter`, description: `${filterFav() ? 'Stops limiting' : 'Limits'} results to favorite Studies.` }) },
      on: { click: () => {
        setFilterFav(!filterFav());
        writeStudyLibraryRoute({ fav: filterFav() }, { resetPages: true });
        resetStudyLibraryLens(redraw);
        redraw();
      } },
    }, '★ Favorites'),

    // Source filter pills
    ...sources.map(src =>
      h('button.study-filter-btn', {
        class: { active: filterSrc() === src },
        attrs: { type: 'button', 'aria-pressed': String(filterSrc() === src), ...controlExplainerAttrs({ label: `${filterSrc() === src ? 'Clear' : 'Apply'} ${sourceLabel(src)} source filter`, description: `${filterSrc() === src ? 'Removes' : 'Applies'} this Study source filter.` }) },
        on: { click: () => {
          const nextSource = filterSrc() === src ? null : src;
          setFilterSrc(nextSource);
          writeStudyLibraryRoute({ source: nextSource as StudyRouteState['source'] }, { resetPages: true });
          resetStudyLibraryLens(redraw);
          redraw();
        } },
      }, sourceLabel(src))
    ),

    // Tag filter pills
    ...tags.map(tag =>
      h('button.study-filter-btn', {
        class: { active: filterTag() === tag },
        attrs: { type: 'button', 'aria-pressed': String(filterTag() === tag), ...controlExplainerAttrs({ label: `${filterTag() === tag ? 'Clear' : 'Apply'} ${tag} tag filter`, description: `${filterTag() === tag ? 'Removes' : 'Applies'} this Study tag filter.` }) },
        on: { click: () => {
          const nextTag = filterTag() === tag ? null : tag;
          setFilterTag(nextTag);
          writeStudyLibraryRoute({ tag: nextTag }, { resetPages: true });
          resetStudyLibraryLens(redraw);
          redraw();
        } },
      }, tag)
    ),
  ]);
}

// --- Grid view ---

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function extractFenFromPgn(pgn: string): string {
  const m = pgn.match(/\[FEN\s+"([^"]+)"\]/i);
  return m ? m[1]! : STARTING_FEN;
}

function renderStudyCard(item: StudyItem, idx: number, redraw: () => void): VNode {
  const selected = isSelected(item.id);
  const fen      = extractFenFromPgn(item.pgn);

  return h('div.study-card', {
    key: item.id,
    class: { 'study-card--selected': selected },
    attrs: { role: 'button', tabindex: '0', ...controlExplainerAttrs({ label: `${selected ? 'Deselect' : 'Select'} ${item.title}`, description: 'Changes this game selection for Study bulk actions.' }) },
    on: {
      click: (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('button, a')) return;
        handleStudyClick(item.id, idx, e);
        redraw();
      },
      keydown: (e: KeyboardEvent) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        handleStudyClick(item.id, idx, e as unknown as MouseEvent);
        redraw();
      },
    },
  }, [
    // Mini board thumbnail via Chessground static mount
    h('div.study-card__board', {
      hook: {
        insert: (vn) => {
          const el = vn.elm as HTMLElement;
          makeChessground(el, {
            fen,
            viewOnly:    true,
            coordinates: false,
            animation:   { enabled: false },
            highlight:   { lastMove: false, check: false },
            movable:     { free: false },
            draggable:   { enabled: false },
            selectable:  { enabled: false },
          });
        },
      },
    }),
    h('div.study-card__body', [
      h('a.study-card__title', {
        attrs: { href: `#/study/${item.id}`, ...controlExplainerAttrs({ label: `Open ${item.title}`, description: 'Opens this game in the Study workspace.' }) },
        on:    { click: (e: Event) => e.stopPropagation() },
      }, item.title),
      h('div.study-card__meta', [
        h('span', sourceLabel(item.source)),
        h('span.study-card__sep', '·'),
        h('span', formatDate(item.createdAt)),
      ]),
      item.favorite ? h('span.study-card__fav', '★') : null,
    ]),
  ]);
}

// --- Bulk action bar ---

// State: bulk folder assignment dropdown
let _bulkFolderMenuOpen = false;

function renderBulkActionBar(redraw: () => void): VNode | null {
  const count = selectionCount();
  if (count === 0) return null;

  // Sorted by display name, but each entry is addressed by its stable id (P2-LIB-11) so two
  // folders sharing a name remain independently selectable.
  const bulkFolders = [...folders()].sort((a, b) => a.name.localeCompare(b.name));

  return h('div.study-bulk-bar', [
    h('span.study-bulk-bar__count', `${count} selected`),
    h('button.study-bulk-bar__btn', {
      attrs: { type: 'button', ...controlExplainerAttrs({ label: `Favorite ${count} selected Studies`, description: 'Adds every selected Study game to Favorites.' }) },
      on: { click: () => {
        void bulkSetFavorite(true).then(redraw);
      } },
    }, '★ Favorite'),
    h('button.study-bulk-bar__btn', {
      attrs: { type: 'button', ...controlExplainerAttrs({ label: `Unfavorite ${count} selected Studies`, description: 'Removes every selected Study game from Favorites.' }) },
      on: { click: () => {
        void bulkSetFavorite(false).then(redraw);
      } },
    }, '☆ Unfavorite'),
    bulkFolders.length > 0
      ? h('div.study-bulk-bar__folder-wrap', [
          h('button.study-bulk-bar__btn', {
            attrs: { type: 'button', 'aria-expanded': String(_bulkFolderMenuOpen), ...controlExplainerAttrs({ label: 'Add selected Studies to folder', description: 'Opens the destination-folder menu for selected games.' }) },
            on: { click: () => { _bulkFolderMenuOpen = !_bulkFolderMenuOpen; redraw(); } },
          }, 'Add to folder ▾'),
          _bulkFolderMenuOpen ? h('div.study-bulk-bar__folder-menu', bulkFolders.map(folder =>
            h('button.study-bulk-bar__folder-item', {
              key: folder.id,
              attrs: { type: 'button', ...controlExplainerAttrs({ label: `Add selected Studies to ${folder.name}`, description: 'Adds every selected Study game to this folder.' }) },
              on: { click: () => {
                _bulkFolderMenuOpen = false;
                void bulkAddToFolder(folder.id).then(redraw);
              } },
            }, folder.name)
          )) : null,
        ])
      : null,
    h('button.study-bulk-bar__btn.study-bulk-bar__btn--danger', {
      attrs: { type: 'button', ...controlExplainerAttrs({ label: `Delete ${count} selected Studies`, description: 'Permanently deletes every selected Study game after confirmation.' }) },
      on: { click: () => {
        if (confirm(`Delete ${count} selected stud${count === 1 ? 'y' : 'ies'}?`)) {
          void bulkDeleteStudies().then(redraw);
        }
      } },
    }, 'Delete'),
    h('button.study-bulk-bar__btn', {
      attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Clear Study selection', description: 'Deselects every selected Study game.' }) },
      on: { click: () => { clearSelection(); redraw(); } },
    }, 'Clear'),
  ]);
}

// --- Sort controls ---

function renderSortControls(redraw: () => void): VNode {
  const sortOptions: { label: string; key: StudySortKey }[] = [
    { label: 'Date saved', key: 'createdAt' },
    { label: 'Last modified', key: 'updatedAt' },
    { label: 'Title', key: 'title' },
  ];
  return h('div.study-sort-bar', [
    h('span.study-sort-bar__label', 'Sort:'),
    ...sortOptions.map(({ label, key }) =>
      h('button.study-sort-btn', {
        class: { active: sortKey() === key },
        attrs: { type: 'button', 'aria-pressed': String(sortKey() === key), ...controlExplainerAttrs({ label: `Sort Studies by ${label}`, description: sortKey() === key ? 'Reverses the current Study sort direction.' : `Orders Study games by ${label.toLowerCase()}.` }) },
        on: { click: () => {
          if (sortKey() === key) {
            setSortDir(sortDir() === 'desc' ? 'asc' : 'desc');
          } else {
            setSortKey(key);
            setSortDir('desc');
          }
          writeStudyLibraryRoute({ sortKey: sortKey(), sortDir: sortDir() }, { resetPages: true });
          resetStudyLibraryLens(redraw);
          redraw();
        } },
      }, [
        label,
        sortKey() === key ? h('span.study-sort-btn__dir', sortDir() === 'desc' ? ' ↓' : ' ↑') : null,
      ])
    ),
  ]);
}

// --- Import PGN modal ---




export function __renderImportModalForTest(redraw: () => void): VNode {
  return renderImportModal(redraw);
}

/** Test-only inspector: whether an opener is currently retained (must be null after destroy). */
export function __importModalOpenerForTest(): HTMLElement | null {
  return _importModalOpener;
}

function renderImportModal(redraw: () => void): VNode {
  const close = () => { _showImportModal = false; _importStatus = null; redraw(); };

  const doImport = () => {
    const text = _importPgnText.trim();
    if (!text) { _importStatus = 'Paste a PGN first.'; redraw(); return; }
    _importStatus = 'Importing…';
    redraw();
    void importPgnToLibrary(text).then(count => {
      _importStatus = count > 0 ? `Imported ${count} game${count !== 1 ? 's' : ''}.` : 'No games found in PGN.';
      if (count > 0) _importPgnText = '';
      redraw();
    });
  };

  return h('div.study-modal-backdrop', { attrs: { 'aria-label': 'Close PGN import dialog', ...controlExplainerAttrs({ label: 'Close PGN import dialog' }) }, on: { click: close } }, [




    h('div.study-modal', {
      attrs: {
        role: 'dialog', 'aria-modal': 'true', tabindex: '-1',
        'aria-label': 'PGN import dialog', ...controlExplainerAttrs({ label: 'PGN import dialog' }),
      },
      hook: {
        insert: (vnode) => {
          _importModalOpener = typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
          (vnode.elm as HTMLElement | undefined)?.focus();
        },
        destroy: () => {
          _importModalOpener?.focus();
          _importModalOpener = null;
        },
      },
      on: {
        click: (e: Event) => e.stopPropagation(),
        keydown: (e: KeyboardEvent) => {
          if (e.key !== 'Escape') return;
          e.preventDefault();
          // The modal consumes its own Escape. Without this, the event keeps bubbling to the
          // document-level `armGameOpenEscape` listener (navigatorShellView.ts:1616) -- which is
          // route-gated to `study-detail`, where this same dialog also renders -- and a single
          // Escape would BOTH close this dialog and step the shell back out of the open game,
          // destroying the opener and defeating the focus restore. The dialog root (not a text
          // input) holds focus here, so that listener's text-entry bail-out does not apply.
          e.stopPropagation();
          close();
        },
      },
    }, [
      h('div.study-modal__header', [
        h('h2', 'Import PGN'),
        h('button.study-modal__close', {
          attrs: iconControlExplainerAttrs({ label: 'Close PGN import dialog' }),
          on: { click: close },
        }, '×'),
      ]),
      h('textarea.study-modal__pgn', {
        attrs: { placeholder: 'Paste PGN here (single or multi-game)…', rows: 10, 'aria-label': 'PGN text', ...controlExplainerAttrs({ label: 'PGN text', description: 'Accepts one or more games for Study import.' }) },
        props: { value: _importPgnText },
        on: { input: (e: Event) => { _importPgnText = (e.target as HTMLTextAreaElement).value; } },
      }),
      h('div.study-modal__file-row', [
        h('label.study-modal__file-label', [
          'Or upload a .pgn file: ',
          h('input', {
            attrs: { type: 'file', accept: '.pgn,text/plain', 'aria-label': 'Choose PGN file', ...controlExplainerAttrs({ label: 'Choose PGN file', description: 'Loads PGN text from a local file.' }) },
            on: { change: (e: Event) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (!file) return;
              file.text().then(text => { _importPgnText = text; redraw(); });
            } },
          }),
        ]),
      ]),
      _importStatus ? h('div.study-modal__status', _importStatus) : null,
      h('div.study-modal__actions', [
        h('button.study-btn.study-btn--import', { attrs: controlExplainerAttrs({ label: 'Import PGN', description: 'Imports the pasted or uploaded games into Study.' }), on: { click: doImport } }, 'Import'),
        h('button.study-btn', { attrs: controlExplainerAttrs({ label: 'Cancel PGN import' }), on: { click: close } }, 'Cancel'),
      ]),
    ]),
  ]);
}

// --- Main library view ---







let _repertoireSectionOpen = false;
let _orpSectionOpen = false;











function renderStudyLibraryLoadError(): VNode {
  return h('div.study-page__loading.study-page__loading--error', [
    h('p', 'Couldn’t load your studies — a storage error occurred.'),
    h('p', 'Your studies are not lost. Reload to try again.'),
    h('button.study-btn', {
      attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Reload Study Library', description: 'Reloads the page to retry the failed Study storage read.' }) },
      on: { click: () => { window.location.reload(); } },
    }, 'Reload'),
  ]);
}

export function renderStudyLibrary(redraw: () => void): VNode {
  if (!isLoaded()) {
    return h('div.study-page', h('div.study-page__loading', 'Loading…'));
  }

  // Storage-failure state (BUG-2026-07-10-008 P1): when the library load REJECTED (studyDb reads
  // no longer mask a storage failure as an empty list), render an honest error state — with a
  // retry — instead of the empty/ready views. This closes the UI States gap on the primary
  // library path (loading/empty/ready existed; error did not) and also covers the previously
  // dropped getStudiesPaginated rejection, whose caller now latches the same flag.
  if (studyLibraryError()) {
    return h('div.study-page', renderStudyLibraryLoadError());
  }

  // Lazy-load practice data if not yet loaded.
  if (!practiceLoaded()) loadPracticeData(redraw);


  if (!_orpLoaded) loadOrpLines(redraw);

  // Lazy-load repertoire sources for Surface D.
  if (!repertoireSourcesLoaded()) loadRepertoireSources(redraw);
  else ensureRepertoireAccountSourceBuilds(redraw);

  if (_showAccountSourcePicker && !repertoireAccountCandidatesLoaded()) loadRepertoireAccountCandidates(redraw);

  // Lazy-load repertoire compliance scan state for Surface E.
  if (!repertoireScanProgressLoaded()) loadRepertoireScanProgress(redraw);

  // Lazy-load stored repertoire divergence records for Surface E.
  if (!repertoireComplianceReportLoaded()) loadRepertoireComplianceReport(redraw);



  if (isDrillCatalogOpen()) {
    return h('div.study-page', [
      h('div.study-page__header', [
        h('h1', 'Drill Catalog'),
        h('button.study-btn', {
          attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Back to Study Library', description: 'Closes the Drill Catalog and returns to the Study Library.' }) },
          on: { click: () => { closeDrillCatalog(); redraw(); } },
        }, '← Back to Library'),
      ]),
      renderDrillCatalog(redraw),
    ]);
  }


  if (isDrillActive() || isDrillSummary()) {
    return h('div.study-page', [
      h('div.study-page__header', [
        h('h1', 'Study Library'),
        h('button.study-btn', {
          attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Back to Study Library', description: 'Ends the current drill and returns to the Study Library.' }) },
          on: { click: () => { endDrill('library-back', 'dismiss'); redraw(); } },
        }, '← Back to Library'),
      ]),
      renderDrillView(redraw),
    ]);
  }








  if (isRepertoireSourceBrowseOpen()) {
    // The Browse takeover VNode is the workspace lifecycle owner (CCW-H02). Its board is mounted by
    // openRepertoireSourceBrowse (both launch paths — repertoire-source row and compliance-report
    // "Open on board"). A constant key keeps this VNode patched in place across a source switch (only
    // the inner board-generation key changes), so this destroy hook only fires when the takeover is
    // actually removed (top-nav departure, back button, deletion, route transition). It closes ONLY
    // the captured generation, so a stale hook after a source switch or an explicit close is an
    // idempotent no-op and can never tear down a newer workspace.
    const capturedGeneration = repertoireBrowseGeneration();
    return h('div.study-page', {
      key: 'study-page-repertoire-browse',
      hook: {
        destroy: () => closeRepertoireSourceBrowse('browse-view-destroy', capturedGeneration),
      },
    }, [
      h('div.study-page__header', [
        h('h1', 'Study Library'),
      ]),
      renderRepertoireSourceBrowse(redraw),
    ]);
  }






  if (_orpDrillPending) {
    _orpDrillPending = false;
    _orpLoaded       = false;
    _orpLoadPending  = false; // allow a fresh fetch even if a stale pending guard is set
    loadOrpLines(redraw);
  }

  // Lazy-load folder data if not yet loaded -- the P1 navigation-index tree needs real folders.
  if (!foldersLoaded()) loadFolders(redraw);

  const openImportModal = () => { _showImportModal = true; _importPgnText = ''; _importStatus = null; redraw(); };

  return h('div.study-page.study-page--dual-pane', [








    renderNavigatorShell(studyNavigationTree(), allStudies(), redraw, openImportModal),









    h('div.study-page__subordinate', [




      practiceError()
        ? h('div.study-practice-dashboard', [
            h('div.study-orp-section__error', [
              h('span', 'Could not load practice data.'),




              h('button.study-btn.study-btn--retry-practice', {
                attrs: {
                  type: 'button',
                  ...controlExplainerAttrs({
                    label: 'Try again',
                    description: 'Retries loading your practice dashboard after a storage error.',
                    tier: 'essential',
                  }),
                },
                on: { click: () => retryPracticeData(redraw) },
              }, 'Try again'),
            ]),
          ])
        : practiceLoaded() ? renderPracticeDashboard(redraw) : null,

      // Pagination is unchanged (CR-2/CR-3: studies load via IDB cursor pages, never an eager full
      // scan) -- "Load more" still appends additional pages into the same in-memory studies state
      // the navigator tree/item-list both read on every render.
      hasMore()
        ? h('div.study-list__load-more', [
            isLoadingMore()
              ? h('span.study-list__loading', 'Loading…')
              : h('button.study-btn.study-btn--load-more', {
                  attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Load more Studies', description: 'Loads the next page of Study Library games.' }) },
                  on: { click: () => {
                    void loadNextPage(redraw).then(loaded => {
                      if (loaded) writeStudyLibraryRoute({ pages: loadedStudyPageCount() });
                    });
                  } },
                }, 'Load more'),
          ])
        : null,










      h('div.study-page__bottom-controls', [
        allStudies().length === 0
          ? (isSeeding()
              ? h('span.study-page__seeding', 'Seeding sample studies…')
              : h('button.study-btn.study-btn--seed', {
                  attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Seed sample Studies', description: 'Creates sample Study games for onboarding.' }) },
                  on: { click: () => { void seedSampleStudies(redraw); } },
                }, 'Seed sample studies'))
          : null,
        h('button.study-btn.study-page__bottom-toggle.study-page__bottom-toggle--repertoire', {
          class: { 'study-btn--active': _repertoireSectionOpen },
          attrs: {
            type: 'button',
            'aria-expanded': String(_repertoireSectionOpen),
            ...controlExplainerAttrs({ label: _repertoireSectionOpen ? 'Hide Repertoire' : 'Show Repertoire', description: `${_repertoireSectionOpen ? 'Hides' : 'Shows'} repertoire compliance and source controls.` }),
          },
          on: { click: () => { _repertoireSectionOpen = !_repertoireSectionOpen; redraw(); } },
        }, 'Repertoire'),
        h('button.study-btn.study-page__bottom-toggle.study-page__bottom-toggle--orp', {
          class: { 'study-btn--active': _orpSectionOpen },
          attrs: {
            type: 'button',
            'aria-expanded': String(_orpSectionOpen),
            ...controlExplainerAttrs({ label: _orpSectionOpen ? 'Hide Opening Repetition Practice' : 'Show Opening Repetition Practice', description: `${_orpSectionOpen ? 'Hides' : 'Shows'} saved opening practice lines.` }),
          },
          on: { click: () => { _orpSectionOpen = !_orpSectionOpen; redraw(); } },
        }, 'Opening Repetition Practice'),
      ]),





      _repertoireSectionOpen ? renderRepertoireComplianceSection(redraw) : null,
      _repertoireSectionOpen ? renderRepertoireSourcesSection(redraw) : null,



      _orpSectionOpen ? renderOrpSection(redraw) : null,
    ]),

    _showImportModal ? renderImportModal(redraw) : null,
  ]);
}














export function renderStudyDetailShell(id: string, redraw: () => void, routeQuery: string): VNode {

















  if (!isLoaded()) {
    initStudyLibrary(redraw);
    return h('div.study-page', h('div.study-page__loading', 'Loading…'));
  }

  // Same lazy folder-load guard `renderStudyLibrary` uses above -- the P1 navigation-index tree
  // (and this shell's item-list rescope) needs real folders to resolve the open game's home folder.
  if (!foldersLoaded()) loadFolders(redraw);

  const openImportModal = () => { _showImportModal = true; _importPgnText = ''; _importStatus = null; redraw(); };








  const detailRoute = parseStudyDetailRouteState(routeQuery).state;
  const toolsOpen = detailRoute.tools ?? false;
  const activeToolTab = normalizeStudyToolTab(detailRoute.toolTab);
  const writeToolsRoute = (next: { tools: boolean; toolTab: StudyToolTabId | '' }): void => {
    writeHashRoute(serializeStudyDetailRouteState(id, { ...detailRoute, ...next }), { mode: 'replace' });
    redraw();
  };





  const toolPanelContent = toolsOpen ? renderStudyToolPanel(activeToolTab, redraw) : null;

  return h('div.study-page.study-page--dual-pane', [
    renderNavigatorShell(studyNavigationTree(), allStudies(), redraw, openImportModal, {
      openItemId: id,
      mainContent: renderStudyDetail(id, redraw, routeQuery),
      toolsOpen,
      activeToolTab,
      // `exactOptionalPropertyTypes` means the field must be OMITTED (not set to `undefined`) when
      // there's no real panel yet, so `renderStudyToolsColumn`'s `?? placeholder` fallback applies.
      ...(toolPanelContent ? { toolPanelContent } : {}),
      onCloseTools: () => writeToolsRoute({ tools: false, toolTab: '' }),
      onSelectToolTab: (tab) => writeToolsRoute({ tools: true, toolTab: tab }),
      // ORP V2 Package C, slice C2: the permanent Practice rail entry performs ONE synchronous
      // action — write `tools=1&toolTab=practice` through the existing replace-mode `writeToolsRoute`
      // (preserving `path`/`orientation`). No due queries, session builders, scheduler, drill launch,
      // or workspace mount on this path; the real Practice panel host is C3.
      onSelectPractice: () => writeToolsRoute({ tools: true, toolTab: STUDY_DETAIL_PRACTICE_TOOL_TAB }),
    }),
    _showImportModal ? renderImportModal(redraw) : null,
  ]);
}





/**
 * Format a lastPracticed epoch ms as a short relative date string for ORP rows.
 * Returns 'today', 'yesterday', 'N days ago', or a short locale date beyond 30 days.
 * Returns null when lastPracticed is undefined (never practiced).
 */
function formatLastPracticed(epochMs: number | undefined): string | null {
  if (epochMs === undefined) return null;
  const now   = Date.now();
  const diffMs = now - epochMs;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 30)  return `${diffDays}d ago`;
  return new Date(epochMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}







function renderOrpRow(view: OrpPracticeLineView, redraw: () => void): VNode {
  const { sequence, title, opening, eco, collection, lineState, dueCount, lastPracticed, favorite } = view;
  const moveCount = sequence.sans.length || sequence.moves.length;

  // Build the source context string: prefer opening name (with ECO code if both present),
  // fall back to collection, omit both if neither is available.
  const openingPart  = opening
    ? (eco ? `${eco} ${opening}` : opening)
    : null;
  const contextPart  = openingPart ?? collection ?? null;

  // lineState badge class and label
  const stateClass = `study-orp-row__state--${lineState.toLowerCase()}`;
  const stateLabel = lineState === 'IN_PROGRESS' ? 'In progress' : lineState.charAt(0) + lineState.slice(1).toLowerCase();

  // Due/progress badge: only show numeric due count when DUE; for others use stateLabel
  const dueNode: VNode | null = lineState === 'DUE' && dueCount > 0
    ? h('span.study-orp-row__due', `${dueCount} due`)
    : null;

  // Last-practiced text
  const lastPracticedText = formatLastPracticed(lastPracticed);

  // Color indicator: 'W' for white, 'B' for black — compact pill
  const colorLabel = sequence.trainAs === 'white' ? 'W' : 'B';
  const colorClass = `study-orp-row__color--${sequence.trainAs}`;

  const isEditingLabel = _editingOrpLabelId === sequence.id;
  const currentLabel   = sequence.label || title;

  return h('div.study-orp-row', { key: sequence.id }, [
    // Favorite star (informational only — editing is Phase 4)
    favorite ? h('span.study-orp-row__fav', '★') : null,

    // Main content
    h('div.study-orp-row__main', [


      h('div.study-orp-row__title-row', [
        isEditingLabel
          ? h('input.study-orp-row__label-input', {
              attrs: { value: _editingOrpLabelValue, placeholder: 'Line label', 'aria-label': 'Opening practice line label', ...controlExplainerAttrs({ label: 'Opening practice line label', description: 'Renames this opening practice line when the field loses focus.' }) },
              hook: { insert: (vn) => (vn.elm as HTMLInputElement).focus() },
              on: {
                input: (e: Event) => { _editingOrpLabelValue = (e.target as HTMLInputElement).value; },
                blur: () => {
                  const newLabel = _editingOrpLabelValue.trim();
                  _editingOrpLabelId    = null;
                  _editingOrpLabelValue = '';
                  if (newLabel) {








                    void getPracticeLine(sequence.id).then(line => {
                      if (!line) return;
                      return savePracticeLine({ ...line, label: newLabel, updatedAt: Date.now() });
                    }).then(() => {
                      _orpLoaded      = false;
                      _orpLoadPending = false;
                      loadOrpLines(redraw);
                    }).catch(e => console.warn('[libraryView] ORP label rename failed', e));
                  }
                  redraw();
                },
                keydown: (e: KeyboardEvent) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') { _editingOrpLabelId = null; redraw(); }
                },
              },
            })
          : h('span.study-orp-row__label', {
              attrs: { role: 'button', tabindex: '0', ...controlExplainerAttrs({ label: `Rename ${currentLabel}`, description: 'Opens this opening practice line label for editing.' }) },
              on: { click: (e: Event) => {
                e.stopPropagation();
                _editingOrpLabelId    = sequence.id;
                _editingOrpLabelValue = currentLabel;
                redraw();
              }, keydown: (e: KeyboardEvent) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                _editingOrpLabelId = sequence.id;
                _editingOrpLabelValue = currentLabel;
                redraw();
              }},
            }, currentLabel),
        h('span.study-orp-row__state', { class: { [stateClass]: true } }, stateLabel),
        dueNode,
      ]),

      // Meta row: source context (opening/ECO/collection) · color · moves · last practiced
      h('div.study-orp-row__meta', [
        contextPart ? h('span.study-orp-row__opening', contextPart) : null,
        contextPart ? h('span.study-orp-row__sep', '·') : null,
        h('span.study-orp-row__color', { class: { [colorClass]: true } }, colorLabel),
        h('span.study-orp-row__sep', '·'),
        h('span.study-orp-row__moves', `${moveCount} move${moveCount !== 1 ? 's' : ''}`),
        ...(lastPracticedText
          ? [h('span.study-orp-row__sep', '·'), h('span.study-orp-row__last', lastPracticedText)]
          : [h('span.study-orp-row__sep', '·'), h('span.study-orp-row__last.study-orp-row__last--never', 'never')]
        ),
      ]),
    ]),



    h('button.study-orp-row__drill', {
      attrs: iconControlExplainerAttrs({ label: `Practice this line as ${sequence.trainAs}`, description: 'Starts a drill with this opening practice line.' }),
      on: { click: (e: Event) => {
        e.stopPropagation();
        _orpDrillPending = true;
        initDrillView([sequence], sequence.fens[0] ?? STARTING_FEN, sequence.trainAs, redraw);
        redraw();
      }},
    }, '▶'),




    h('button.study-orp-row__pause', {
      attrs: { type: 'button', 'aria-pressed': String(sequence.status === 'paused'), ...controlExplainerAttrs({ label: sequence.status === 'active' ? 'Pause this line' : 'Resume this line', description: `${sequence.status === 'active' ? 'Pauses' : 'Resumes'} scheduling for this opening practice line.` }) },
      on: { click: (e: Event) => {
        e.stopPropagation();
        const newStatus = sequence.status === 'active' ? 'paused' : 'active';



        void getPracticeLine(sequence.id).then(line => {
          if (!line) return;
          return savePracticeLine({ ...line, status: newStatus, updatedAt: Date.now() });
        }).then(() => {
          _orpLoaded      = false;
          _orpLoadPending = false;
          loadOrpLines(redraw);
        }).catch(e => console.warn('[libraryView] ORP pause/resume failed', e));
      }},
    }, sequence.status === 'active' ? 'Pause' : 'Resume'),





    h('button.study-orp-row__remove', {
      attrs: {
        ...iconControlExplainerAttrs({ label: 'Remove from Opening Repetition Practice', description: 'Permanently deletes this practice line after confirmation without deleting the Study game.' }),
      },
      on: { click: (e: Event) => {
        e.stopPropagation();
        if (confirm(`Remove "${sequence.label || title}" from Opening Repetition Practice?`)) {











          void deletePracticeLine(sequence.id).then(() => {
            _orpLoaded      = false;
            _orpLoadPending = false;
            loadOrpLines(redraw);
          }).catch(e => console.warn('[libraryView] ORP line delete failed', e));
        }
      }},
    }, '×'),
  ]);
}

function renderOrpSection(redraw: () => void): VNode {
  // LOADING state
  if (!_orpLoaded) {
    return h('div.study-orp-section', [
      h('h2.study-orp-section__heading', 'Opening Repetition Practice'),
      h('div.study-orp-section__loading', 'Loading…'),
    ]);
  }

  // ERROR state
  if (_orpError) {
    return h('div.study-orp-section', [
      h('h2.study-orp-section__heading', 'Opening Repetition Practice'),
      h('div.study-orp-section__error', 'Could not load opening lines.'),
    ]);
  }


  if (_orpLines.length === 0) {
    return h('div.study-orp-section', [
      h('h2.study-orp-section__heading', 'Opening Repetition Practice'),
      h('div.study-orp-section__empty', [
        h('p', 'No opening lines to practice yet.'),
        h('p', [
          'To add a line, open ',
          h('strong', 'Opponents'),
          ', navigate to any position in a collection, then click ',
          h('strong', '📚 Save to Library'),
          '. The line will appear here as a drillable repetition-practice line.',
        ]),
      ]),
    ]);
  }


  return h('div.study-orp-section', [
    h('h2.study-orp-section__heading', 'Opening Repetition Practice'),
    ...renderOrpBuckets(_orpLines, redraw),
  ]);
}






function renderOrpBuckets(lines: OrpPracticeLineView[], redraw: () => void): VNode[] {
  const BUCKETS: { state: OrpPracticeLineView['lineState']; label: string }[] = [
    { state: 'DUE',         label: 'Due' },
    { state: 'NEW',         label: 'New' },
    { state: 'IN_PROGRESS', label: 'In progress' },
    { state: 'PAUSED',      label: 'Paused' },
  ];

  const grouped = new Map<string, OrpPracticeLineView[]>();
  for (const line of lines) {
    const bucket = grouped.get(line.lineState) ?? [];
    bucket.push(line);
    grouped.set(line.lineState, bucket);
  }

  // Total due positions across all ORP lines (DUE state only; NEW lines are not yet in review).
  const totalDue = lines
    .filter(v => v.lineState === 'DUE')
    .reduce((sum, v) => sum + v.dueCount, 0);

  const nodes: VNode[] = [];
  for (const { state, label } of BUCKETS) {
    const group = grouped.get(state);
    if (!group || group.length === 0) continue;




    const reviewDueBtn: VNode | null = state === 'DUE'
      ? (totalDue === 0 || _orpDueLaunching
        ? renderDisabledControlExplainer(
            { label: 'Review due opening lines', description: _orpDueLaunching ? 'Wait for the due-opening review session to start.' : 'No opening positions are currently due for review.' },
            h('button.study-btn.study-btn--review.study-orp-bucket__review-btn', { attrs: { type: 'button', disabled: true } }, _orpDueLaunching ? 'Starting…' : `Review due (${totalDue})`),
          )
        : h('button.study-btn.study-btn--review.study-orp-bucket__review-btn', {
          attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Review due opening lines', description: 'Starts an SRS review session for all due opening lines.' }) },
          on: { click: (e: Event) => {
            e.stopPropagation();
            if (totalDue === 0 || _orpDueLaunching) return;





            void launchOrpDueSession(redraw).catch(e => console.warn('[libraryView] ORP review-due launch failed', e));
          }},
        }, `Review due (${totalDue})`))
      : null;



    const learnNewBtn: VNode | null = state === 'NEW'
      ? (_orpLearnLaunching
        ? renderDisabledControlExplainer(
            { label: 'Learn new opening lines', description: 'Wait for the new-opening learn session to start.' },
            h('button.study-btn.study-btn--learn.study-orp-bucket__learn-btn', { attrs: { type: 'button', disabled: true } }, 'Starting…'),
          )
        : h('button.study-btn.study-btn--learn.study-orp-bucket__learn-btn', {
          attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Learn new opening lines', description: 'Starts a learning session for new opening lines.' }) },
          on: { click: (e: Event) => {
            e.stopPropagation();
            if (_orpLearnLaunching) return;



            void launchOrpLearnSession(redraw).catch(e => console.warn('[libraryView] ORP learn-new launch failed', e));
          }},
        }, `Learn new (${group.length})`))
      : null;

    nodes.push(
      h('div.study-orp-bucket', { key: state }, [
        h('div.study-orp-bucket__header', [
          h('span.study-orp-bucket__label', label),
          h('span.study-orp-bucket__count', `${group.length}`),
          reviewDueBtn,
          learnNewBtn,
        ]),
        h('div.study-orp-bucket__list',
          group.map(view => renderOrpRow(view, redraw))
        ),
      ])
    );
  }
  return nodes;
}

function renderPracticeDashboard(redraw: () => void): VNode | null {
  const due    = dueCount();
  const review = reviewSequences();
  const learn  = learnSequences();
  if (due === 0 && learn.length === 0) return null;

  return h('div.study-practice-dashboard', [
    due > 0
      ? h('div.study-practice-banner', [
          h('span.study-practice-banner__text', `${due} position${due === 1 ? '' : 's'} due for review`),
          h('button.study-btn.study-btn--review', {
            attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Start due-position review', description: 'Starts an SRS review session for due Study positions.' }) },
            on: { click: () => {
              if (review.length === 0) return;
              initDrillView(review, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'white', redraw);
              redraw();
            }},
          }, 'Start Review'),
        ])
      : null,
    learn.length > 0
      ? h('div.study-practice-learn', [
          h('span.study-practice-learn__label', `${learn.length} new line${learn.length === 1 ? '' : 's'} to learn`),
          h('button.study-btn', {
            attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Learn new Study lines', description: 'Starts a learning session for new Study practice lines.' }) },
            on: { click: () => {

              if (learn.length > 0) void launchGuidedLearn(learn, 0, redraw);
            }},
          }, 'Learn Now'),
        ])
      : null,
  ]);
}
