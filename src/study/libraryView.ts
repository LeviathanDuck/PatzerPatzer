



import { h, type VNode } from 'snabbdom';
import {
  studies, allStudies, isLoaded,
  sortKey, sortDir, filterFav, filterTag, filterSrc, searchQuery,
  setSortKey, setSortDir, setFilterFav, setFilterTag, setFilterSrc, setSearch,
  studyTags, studyFolders, updateStudy, deleteStudy, importPgnToLibrary,
  practiceLoaded, dueCount, dueCountForStudy,
  reviewSequences, learnSequences, loadPracticeData,
  hasMore, isLoadingMore, loadNextPage, loadedStudyPageCount,
  folders, foldersLoaded, activeFolderName, sidebarCollapsed,
  setActiveFolderName, toggleSidebar, loadFolders,
  createFolder, renameFolder, removeFolderEntity, moveStudyToFolder,
  selectedIds, isSelected, selectionCount, clearSelection,
  handleStudyClick, bulkDeleteStudies, bulkAddToFolder, bulkSetFavorite,
  viewMode, setViewMode, resetPagination, studyLibraryRouteSnapshot,
  seedSampleStudies, isSeeding,
  listOrpPracticeLines,
  repertoireSources, repertoireSourcesLoaded, repertoireSourcesError, loadRepertoireSources,
  uploadRepertoireSourceFile, renameRepertoireSource, setRepertoireSourceSideOverride,
  setRepertoireSourceEnabled, replaceRepertoireSourceFile, deleteRepertoireSource,
  repertoireScanProgress, repertoireScanProgressLoaded, repertoireScanBusy,
  loadRepertoireScanProgress, runRepertoireScanFromStudy, pauseRepertoireScanFromStudy,
  repertoireComplianceReport, repertoireComplianceReportLoaded, repertoireComplianceReportError,
  repertoireComplianceReportFilters, setRepertoireComplianceReportFilters,
  resetRepertoireComplianceReportFilters, loadRepertoireComplianceReport,
  type StudySortKey,
  type OrpPracticeLineView,
} from './studyCtrl';
import { serializeAnalysisRouteWithPly, serializeAnalysisSelectedGameRoute } from '../analyse/routeState';
import { renderCompactGameRow } from '../games/view';
import {
  repertoireComplianceReportFiltersActive,
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
  repertoireBrowseSourceId,
} from './repertoireBrowseView';
import { isDrillActive, isDrillSummary, initDrillView, renderDrillView, endDrill } from './practice/drillView';
import { buildReviewSession, buildLearnSession } from './practice/sessionBuilder';
import { listAllPositionProgress, savePracticeLine, getPracticeLine, deletePracticeLine } from './studyDb';
import { Chessground as makeChessground } from '@lichess-org/chessground';
import type { StudyItem } from './types';
import type { RepertoireSide, RepertoireSource } from '../repertoire';

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
let _repertoireSourceStatus: string | null = null;
let _repertoireSourceBusy = false;
let _openRepertoireMenuId: string | null = null;
let _editingRepertoireSourceId: string | null = null;
let _editingRepertoireSourceValue = '';
const _expandedRepertoireReportRows = new Set<string>();



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

    const initialTrainAs = newSequences[0]!.trainAs;
    _orpDrillPending = true;
    initDrillView(newSequences, newSequences[0]!.fens[0] ?? STARTING_FEN, initialTrainAs, redraw, 'learn');
    redraw();
  } finally {
    _orpLearnLaunching = false;
  }
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
  if (!confirm(`Delete "${source.name}"? The source and its scan records will be removed.`)) return;
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

function renderRepertoireUploadControl(redraw: () => void): VNode {
  return h('label.study-btn.study-btn--import.repertoire__upload', {
    attrs: {
      title: 'Upload repertoire PGN',
      'aria-label': 'Upload repertoire PGN',
    },
  }, [
    _repertoireSourceBusy ? 'Working...' : 'Upload repertoire PGN',
    h('input.repertoire__file-input', {
      attrs: {
        type: 'file',
        accept: '.pgn,text/plain',
        disabled: _repertoireSourceBusy,
        title: 'Choose repertoire PGN file',
        'aria-label': 'Choose repertoire PGN file',
      },
      on: { change: (e: Event) => {
        const input = e.target as HTMLInputElement;
        const file = input.files?.[0];
        input.value = '';
        if (file) uploadRepertoireFile(file, redraw);
      }},
    }),
  ]);
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
  return h('div.repertoire__source-menu', [
    h('button.repertoire__source-menu-item', {
      attrs: {
        title: `Rename ${source.name}`,
        'aria-label': `Rename ${source.name}`,
        disabled: _repertoireSourceBusy,
      },
      on: { click: (e: Event) => {
        e.stopPropagation();
        _editingRepertoireSourceId = source.id;
        _editingRepertoireSourceValue = source.name;
        _openRepertoireMenuId = null;
        redraw();
      }},
    }, 'Rename'),
    h('label.repertoire__source-menu-label', [
      h('span', 'Side'),
      h('select.repertoire__side-select', {
        attrs: {
          title: `Set side for ${source.name}`,
          'aria-label': `Set side for ${source.name}`,
          disabled: _repertoireSourceBusy,
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
      ]),
    ]),
    h('label.repertoire__source-menu-item.repertoire__replace-label', {
      attrs: {
        title: `Replace PGN file for ${source.name}`,
        'aria-label': `Replace PGN file for ${source.name}`,
      },
    }, [
      'Replace file',
      h('input.repertoire__file-input', {
        attrs: {
          type: 'file',
          accept: '.pgn,text/plain',
          disabled: _repertoireSourceBusy,
          title: `Choose replacement PGN for ${source.name}`,
          'aria-label': `Choose replacement PGN for ${source.name}`,
        },
        on: { change: (e: Event) => {
          const input = e.target as HTMLInputElement;
          const file = input.files?.[0];
          input.value = '';
          if (file) replaceSourceFile(source, file, redraw);
        }},
      }),
    ]),
    h('button.repertoire__source-menu-item.repertoire__source-menu-item--danger', {
      attrs: {
        title: `Delete ${source.name}`,
        'aria-label': `Delete ${source.name}`,
        disabled: _repertoireSourceBusy,
      },
      on: { click: (e: Event) => {
        e.stopPropagation();
        removeRepertoireSource(source, redraw);
      }},
    }, 'Delete'),
  ]);
}

function renderRepertoireSourceRow(source: RepertoireSource, index: number, redraw: () => void): VNode {
  const isEditingName = _editingRepertoireSourceId === source.id;
  const sourceMainChildren = [
    h('div.repertoire__source-title-row', [
      isEditingName
        ? h('input.repertoire__source-name-input', {
            attrs: {
              value: _editingRepertoireSourceValue,
              title: `Rename ${source.name}`,
              'aria-label': `Rename ${source.name}`,
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
      h('span.repertoire__chapter-count', chapterCountLabel(source.chapterCount)),
    ]),
    h('div.repertoire__source-meta', [
      h('span', source.enabled ? 'Enabled' : 'Disabled'),
      h('span.repertoire__source-sep', '·'),
      h('span', `version ${source.contentVersion.slice(0, 8)}`),
    ]),
  ];
  return h(`div.repertoire__source-row.repertoire__accent--${index % 8}`, { key: source.id }, [
    isEditingName
      ? h('div.repertoire__source-main', sourceMainChildren)
      : h('button.repertoire__source-main.repertoire__source-open', {
          attrs: {
            title: `Open ${source.name}`,
            'aria-label': `Open ${source.name}`,
          },
          on: { click: () => {
            openRepertoireSourceBrowse(source, index);
            redraw();
          }},
        }, sourceMainChildren),
    h('button.repertoire__source-toggle', {
      attrs: {
        title: source.enabled ? `Disable ${source.name}` : `Enable ${source.name}`,
        'aria-label': source.enabled ? `Disable ${source.name}` : `Enable ${source.name}`,
        disabled: _repertoireSourceBusy,
      },
      class: { active: source.enabled },
      on: { click: (e: Event) => {
        e.stopPropagation();
        toggleRepertoireSourceEnabled(source, redraw);
      }},
    }, source.enabled ? 'On' : 'Off'),
    h('div.repertoire__source-menu-wrap', [
      h('button.repertoire__source-menu-button', {
        attrs: {
          title: `Source actions for ${source.name}`,
          'aria-label': `Source actions for ${source.name}`,
          disabled: _repertoireSourceBusy,
        },
        on: { click: (e: Event) => {
          e.stopPropagation();
          _openRepertoireMenuId = _openRepertoireMenuId === source.id ? null : source.id;
          redraw();
        }},
      }, '⋮'),
      renderRepertoireSourceMenu(source, redraw),
    ]),
  ]);
}

function renderRepertoireSourcesSection(redraw: () => void): VNode {
  const header = h('div.repertoire__section-header', [
    h('h2.repertoire__section-title', 'Repertoire Sources'),
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
        title: `Filter repertoire report by ${label.toLowerCase()}`,
        'aria-label': `Filter repertoire report by ${label.toLowerCase()}`,
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
  key: 'ownerColor' | 'result',
): VNode {
  const active = activeValue === value;
  const next = active ? null : value;
  const title = active ? `Clear ${label} repertoire report filter` : `Filter repertoire report by ${label}`;
  const apply = (): void => {
    if (key === 'ownerColor') {
      updateReportFilters({ ownerColor: next as RepertoireComplianceOwnerColorFilter | null }, redraw);
      return;
    }
    updateReportFilters({ result: next as RepertoireComplianceOutcome | null }, redraw);
  };
  return h('button.games-view__pill.repertoire__filter-pill', {
    class: { active },
    attrs: {
      type: 'button',
      title,
      'aria-label': title,
      'aria-pressed': String(active),
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
              title: 'Clear repertoire report filters',
              'aria-label': 'Clear repertoire report filters',
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
    attrs: { title: label, 'aria-label': label },
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
        title,
        'aria-label': title,
      },
    }, entry.game
      ? renderCompactGameRow(entry.game, false, false)
      : [h('span.grl__opponent', entry.gameId), h('span.grl__date', 'Game metadata unavailable')]);
  }));
}

function renderRepertoireReportRow(group: RepertoireComplianceReportGroup, redraw: () => void): VNode {
  const expanded = _expandedRepertoireReportRows.has(group.key);
  const toggleTitle = expanded
    ? `Hide ${group.seenCount} matching games for ${group.lineLabel}`
    : `Show ${group.seenCount} matching games for ${group.lineLabel}`;
  return h('div.repertoire__line-row', { key: group.key }, [
    h('button.repertoire__line-summary', {
      attrs: {
        type: 'button',
        title: toggleTitle,
        'aria-label': toggleTitle,
        'aria-expanded': String(expanded),
      },
      on: { click: () => {
        if (expanded) _expandedRepertoireReportRows.delete(group.key);
        else _expandedRepertoireReportRows.add(group.key);
        redraw();
      } },
    }, [
      h('span.repertoire__line-main', [
        h('span.repertoire__line-text', [
          h('span.repertoire__line-prefix', `${group.sourceName} · ${group.firstDivergencePly === null ? 'ply ?' : `ply ${group.firstDivergencePly}`} · `),
          h('span.repertoire__line-highlight', group.playedUci ? `played ${group.playedUci}` : 'played ?'),
          h('span.repertoire__line-expected', group.missedUci ? ` expected ${group.missedUci}` : ' expected ?'),
        ]),
        h('span.repertoire__category-badge', group.categoryLabel),
        renderRepertoireIdentityChip(group.sourceName, group.sourceSide, group.sourceAccentIndex),
      ]),
      h('span.repertoire__line-metrics', [
        renderLossRatioToken(group),
        h('span.repertoire__line-game-count', `${expanded ? '▾' : '▸'} ${group.seenCount.toLocaleString()} game${group.seenCount === 1 ? '' : 's'}`),
      ]),
    ]),
    expanded ? renderRepertoireReportGameList(group) : null,
  ]);
}

function renderRepertoireReportBody(redraw: () => void): VNode {
  if (repertoireComplianceReportError()) {
    return h('div.repertoire__source-error', 'Could not load stored divergence records.');
  }

  if (!repertoireComplianceReportLoaded()) {
    return h('div.repertoire__source-loading', 'Loading stored divergence records...');
  }

  const report = repertoireComplianceReport();
  const summary = report.filteredDivergenceCount === report.totalDivergenceCount
    ? `${report.filteredDivergenceCount.toLocaleString()} stored divergence${report.filteredDivergenceCount === 1 ? '' : 's'}`
    : `${report.filteredDivergenceCount.toLocaleString()} of ${report.totalDivergenceCount.toLocaleString()} stored divergences`;

  return h('div.repertoire__report', [
    renderRepertoireReportFilters(report, redraw),
    h('div.repertoire__report-summary', summary),
    report.groups.length === 0
      ? h('div.repertoire__source-empty',
          report.totalDivergenceCount === 0
            ? 'No stored divergence records yet.'
            : 'No divergence rows match these filters.'
        )
      : h('div.repertoire__line-list',
          report.groups.map(group => renderRepertoireReportRow(group, redraw))
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
      h('button.study-btn.repertoire__scan-action', {
        attrs: {
          type: 'button',
          title: actionTitle,
          'aria-label': actionTitle,
          disabled,
        },
        on: { click: () => {
          if (disabled) return;
          if (busy) pauseRepertoireScanFromStudy(redraw);
          else runRepertoireScanFromStudy(redraw);
        } },
      }, actionLabel),
      h('span.repertoire__scan-progress', {
        attrs: { title: progressLabel },
      }, progressLabel),
    ]),
    progress?.message
      ? h(`div.repertoire__scan-message.repertoire__scan-message--${progress.state}`, progress.message)
      : null,
    renderRepertoireReportBody(redraw),
  ]);
}

// --- Row rendering ---

function renderStudyRow(item: StudyItem, idx: number, redraw: () => void): VNode {
  const isEditingTitle = _editingTitleId === item.id;
  const isEditingTag   = _editingTagId === item.id;
  const selected       = isSelected(item.id);

  return h('div.study-row', {
    key: item.id,
    class: { 'study-row--selected': selected },
    attrs: { draggable: 'true' },
    on: {
      click: (e: MouseEvent) => {
        // Only trigger selection if clicking on row background (not on child buttons/inputs)
        const target = e.target as HTMLElement;
        if (target.closest('button, a, input, textarea')) return;
        handleStudyClick(item.id, idx, e);
        redraw();
      },
      dragstart: (e: DragEvent) => {
        _draggingStudyId = item.id;
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', item.id);
        }
      },
      dragend: () => { _draggingStudyId = null; _dragOverFolderName = null; redraw(); },
    },
  }, [
    // Selection checkbox
    h('input.study-row__checkbox', {
      attrs: { type: 'checkbox', checked: selected },
      on: { click: (e: Event) => {
        e.stopPropagation();
        handleStudyClick(item.id, idx, e as unknown as MouseEvent);
        redraw();
      } },
    }),
    // Favorite star
    h('button.study-row__fav', {
      class: { active: item.favorite },
      attrs: { title: item.favorite ? 'Remove from favorites' : 'Add to favorites' },
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
              attrs: { value: _editingTitleValue, placeholder: 'Study title' },
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
              attrs: { title: 'Click to rename' },
              on: { click: () => {
                _editingTitleId    = item.id;
                _editingTitleValue = item.title;
                redraw();
              } },
            }, item.title),
        h('a.study-row__open', {
          attrs: { href: `#/study/${item.id}`, title: 'Open study' },
          on: { click: (e: Event) => e.stopPropagation() },
        }, '→'),
        h('button.study-row__expand', {
          attrs: { title: _expandedRows.has(item.id) ? 'Collapse' : 'Expand details' },
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
              attrs: { title: `Remove tag "${tag}"`, 'aria-label': `Remove tag "${tag}"` },
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
              attrs: { placeholder: 'Add tag…', value: _editingTagValue },
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
              attrs: { title: 'Add tag' },
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
          attrs: { placeholder: 'Add notes…', rows: 3 },
          props: { value: item.notes ?? '' },
          on: { blur: (e: Event) => {
            void updateStudy({ id: item.id, notes: (e.target as HTMLTextAreaElement).value });
          } },
        }),

        // Folder
        h('div.study-row__folder-row', [
          h('label.study-row__folder-label', 'Folder'),
          item.folders.length > 0
            ? h('div.study-row__folder-list', item.folders.map(f =>
                h('span.study-folder', [
                  f,
                  h('button.study-folder__remove', {
                    attrs: { title: `Remove folder "${f}"`, 'aria-label': `Remove folder "${f}"` },
                    on: { click: () => {
                      void updateStudy({ id: item.id, folders: item.folders.filter(x => x !== f) }).then(redraw);
                    } },
                  }, '×'),
                ])
              ))
            : null,
          _editingFolderId === item.id
            ? h('input.study-folder__input', {
                attrs: { placeholder: 'Folder name…', value: _editingFolderValue },
                hook: { insert: (vn) => (vn.elm as HTMLInputElement).focus() },
                on: {
                  input: (e: Event) => { _editingFolderValue = (e.target as HTMLInputElement).value; },
                  blur: () => {
                    const f = _editingFolderValue.trim();
                    if (f && !item.folders.includes(f)) {
                      void updateStudy({ id: item.id, folders: [...item.folders, f] }).then(redraw);
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
                attrs: { title: 'Add to folder' },
                on: { click: () => { _editingFolderId = item.id; _editingFolderValue = ''; redraw(); } },
              }, '+ folder'),
        ]),
      ]) : null,
    ]),

    // Delete button
    h('button.study-row__delete', {
      attrs: { title: 'Delete study', 'aria-label': 'Delete study' },
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
let _draggingStudyId: string | null   = null;
let _dragOverFolderName: string | null = null;

// DnD drop handlers for a folder drop target identified by name.
function folderDropHandlers(folderName: string, redraw: () => void) {
  return {
    dragover: (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      if (_dragOverFolderName !== folderName) { _dragOverFolderName = folderName; redraw(); }
    },
    dragleave: () => {
      if (_dragOverFolderName === folderName) { _dragOverFolderName = null; redraw(); }
    },
    drop: (e: DragEvent) => {
      e.preventDefault();
      const studyId = e.dataTransfer?.getData('text/plain') ?? _draggingStudyId;
      _dragOverFolderName = null;
      if (studyId) void moveStudyToFolder(studyId, folderName).then(redraw);
    },
  };
}

// --- Folder sidebar ---

function renderFolderSidebar(redraw: () => void): VNode {
  // Merge IDB-persisted folders with inline folder names from studies (backward compat).
  const persistedNames = new Set(folders().map(f => f.name));
  const inlineNames    = studyFolders().filter(n => !persistedNames.has(n));
  // All known folder names in display order: persisted (sorted by name) + orphaned inline names
  const allNames: string[] = [
    ...folders().map(f => f.name).sort(),
    ...inlineNames.sort(),
  ];

  return h('div.study-sidebar', [
    h('div.study-sidebar__header', [
      h('span.study-sidebar__title', 'Folders'),
      h('button.study-sidebar__toggle', {
        attrs: { title: sidebarCollapsed() ? 'Expand sidebar' : 'Collapse sidebar' },
        on: { click: () => { toggleSidebar(); redraw(); } },
      }, sidebarCollapsed() ? '›' : '‹'),
    ]),
    sidebarCollapsed() ? null : h('div.study-sidebar__folders', [
      h('button.study-sidebar__folder', {
        class: { active: activeFolderName() === null },
        on: { click: () => {
          setActiveFolderName(null);
          writeStudyLibraryRoute({ folder: null }, { resetPages: true });
          resetStudyLibraryLens(redraw);
          redraw();
        } },
      }, 'All Studies'),

      // Persisted folder entries (with rename + delete controls)
      ...folders().map(folder => {
        const isRenaming = _renamingFolderId === folder.id;
        return h('div.study-sidebar__folder-row', { key: folder.id }, [
          isRenaming
            ? h('input.study-sidebar__folder-rename', {
                attrs: { value: _renamingFolderValue },
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
                  active:       activeFolderName() === folder.name,
                  'drag-over':  _dragOverFolderName === folder.name,
                },
                on: {
                  click: () => {
                    const nextFolder = activeFolderName() === folder.name ? null : folder.name;
                    setActiveFolderName(nextFolder);
                    writeStudyLibraryRoute({ folder: nextFolder }, { resetPages: true });
                    resetStudyLibraryLens(redraw);
                    redraw();
                  },
                  ...folderDropHandlers(folder.name, redraw),
                },
              }, folder.name),
          h('div.study-sidebar__folder-actions', [
            h('button.study-sidebar__folder-action', {
              attrs: { title: 'Rename folder', 'aria-label': 'Rename folder' },
              on: { click: (e: Event) => {
                e.stopPropagation();
                _renamingFolderId    = folder.id;
                _renamingFolderValue = folder.name;
                redraw();
              } },
            }, '✎'),
            h('button.study-sidebar__folder-action.study-sidebar__folder-action--danger', {
              attrs: { title: 'Delete folder', 'aria-label': 'Delete folder' },
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

      // Orphaned inline folder names (in studies but no entity)
      ...inlineNames.map(name =>
        h('button.study-sidebar__folder', {
          key: `inline-${name}`,
          class: { active: activeFolderName() === name, 'drag-over': _dragOverFolderName === name },
          on: {
            click: () => {
              const nextFolder = activeFolderName() === name ? null : name;
              setActiveFolderName(nextFolder);
              writeStudyLibraryRoute({ folder: nextFolder }, { resetPages: true });
              resetStudyLibraryLens(redraw);
              redraw();
            },
            ...folderDropHandlers(name, redraw),
          },
        }, name)
      ),

      // New folder input or button
      _newFolderMode
        ? h('input.study-sidebar__new-folder', {
            attrs: { placeholder: 'Folder name…', value: _newFolderValue },
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
      attrs: { placeholder: 'Search studies…', value: searchQuery() },
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
    on: {
      click: (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('button, a')) return;
        handleStudyClick(item.id, idx, e);
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
        attrs: { href: `#/study/${item.id}` },
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

  const allFolderNames = [
    ...folders().map(f => f.name),
    ...studyFolders().filter(n => !folders().some(f => f.name === n)),
  ].sort();

  return h('div.study-bulk-bar', [
    h('span.study-bulk-bar__count', `${count} selected`),
    h('button.study-bulk-bar__btn', {
      on: { click: () => {
        void bulkSetFavorite(true).then(redraw);
      } },
    }, '★ Favorite'),
    h('button.study-bulk-bar__btn', {
      on: { click: () => {
        void bulkSetFavorite(false).then(redraw);
      } },
    }, '☆ Unfavorite'),
    allFolderNames.length > 0
      ? h('div.study-bulk-bar__folder-wrap', [
          h('button.study-bulk-bar__btn', {
            on: { click: () => { _bulkFolderMenuOpen = !_bulkFolderMenuOpen; redraw(); } },
          }, 'Add to folder ▾'),
          _bulkFolderMenuOpen ? h('div.study-bulk-bar__folder-menu', allFolderNames.map(name =>
            h('button.study-bulk-bar__folder-item', {
              on: { click: () => {
                _bulkFolderMenuOpen = false;
                void bulkAddToFolder(name).then(redraw);
              } },
            }, name)
          )) : null,
        ])
      : null,
    h('button.study-bulk-bar__btn.study-bulk-bar__btn--danger', {
      on: { click: () => {
        if (confirm(`Delete ${count} selected stud${count === 1 ? 'y' : 'ies'}?`)) {
          void bulkDeleteStudies().then(redraw);
        }
      } },
    }, 'Delete'),
    h('button.study-bulk-bar__btn', {
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

  return h('div.study-modal-backdrop', { on: { click: close } }, [
    h('div.study-modal', { on: { click: (e: Event) => e.stopPropagation() } }, [
      h('div.study-modal__header', [
        h('h2', 'Import PGN'),
        h('button.study-modal__close', {
          attrs: { title: 'Close import dialog', 'aria-label': 'Close import dialog' },
          on: { click: close },
        }, '×'),
      ]),
      h('textarea.study-modal__pgn', {
        attrs: { placeholder: 'Paste PGN here (single or multi-game)…', rows: 10 },
        props: { value: _importPgnText },
        on: { input: (e: Event) => { _importPgnText = (e.target as HTMLTextAreaElement).value; } },
      }),
      h('div.study-modal__file-row', [
        h('label.study-modal__file-label', [
          'Or upload a .pgn file: ',
          h('input', {
            attrs: { type: 'file', accept: '.pgn,text/plain' },
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
        h('button.study-btn.study-btn--import', { on: { click: doImport } }, 'Import'),
        h('button.study-btn', { on: { click: close } }, 'Cancel'),
      ]),
    ]),
  ]);
}

// --- Main library view ---

export function renderStudyLibrary(redraw: () => void): VNode {
  if (!isLoaded()) {
    return h('div.study-page', h('div.study-page__loading', 'Loading…'));
  }

  // Lazy-load practice data if not yet loaded.
  if (!practiceLoaded()) loadPracticeData(redraw);


  if (!_orpLoaded) loadOrpLines(redraw);

  // Lazy-load repertoire sources for Surface D.
  if (!repertoireSourcesLoaded()) loadRepertoireSources(redraw);

  // Lazy-load repertoire compliance scan state for Surface E.
  if (!repertoireScanProgressLoaded()) loadRepertoireScanProgress(redraw);

  // Lazy-load stored repertoire divergence records for Surface E.
  if (!repertoireComplianceReportLoaded()) loadRepertoireComplianceReport(redraw);


  if (isDrillActive() || isDrillSummary()) {
    return h('div.study-page', [
      h('div.study-page__header', [
        h('h1', 'Study Library'),
        h('button.study-btn', {
          on: { click: () => { endDrill(); redraw(); } },
        }, '← Back to Library'),
      ]),
      renderDrillView(redraw),
    ]);
  }






  if (_orpDrillPending) {
    _orpDrillPending = false;
    _orpLoaded       = false;
    _orpLoadPending  = false; // allow a fresh fetch even if a stale pending guard is set
    loadOrpLines(redraw);
  }

  // Lazy-load folder data if not yet loaded.
  if (!foldersLoaded()) loadFolders(redraw);

  const items = studies();
  const libraryMainNodes = isRepertoireSourceBrowseOpen()
    ? [renderRepertoireSourceBrowse(redraw)]
    : [
        renderRepertoireComplianceSection(redraw),
        renderRepertoireSourcesSection(redraw),
        h('div.repertoire__studies-heading', 'Studies'),
        renderFilterBar(redraw),
        renderSortControls(redraw),
        renderBulkActionBar(redraw),

        items.length === 0
          ? h('div.study-page__empty', [
              h('p', 'No studies yet.'),
              h('p', 'Right-click any move on the analysis board to save it here.'),
              allStudies().length === 0
                ? isSeeding()
                  ? h('p.study-page__seeding', 'Seeding sample studies…')
                  : h('button.study-btn.study-btn--seed', {
                      on: { click: () => { void seedSampleStudies(redraw); } },
                    }, 'Seed sample studies')
                : null,
            ])
          : viewMode() === 'grid'
            ? h('div.study-grid', items.map((item, idx) => renderStudyCard(item, idx, redraw)))
            : h('div.study-list', items.map((item, idx) => renderStudyRow(item, idx, redraw))),

        hasMore()
          ? h('div.study-list__load-more', [
              isLoadingMore()
                ? h('span.study-list__loading', 'Loading…')
                : h('button.study-btn.study-btn--load-more', {
                    on: { click: () => {
                      void loadNextPage(redraw).then(loaded => {
                        if (loaded) writeStudyLibraryRoute({ pages: loadedStudyPageCount() });
                      });
                    } },
                  }, 'Load more'),
            ])
          : null,
      ];

  return h('div.study-page', [
    h('div.study-page__header', [
      h('h1', 'Study Library'),
      h('div.study-page__header-actions', [
        // View mode toggle
        h('div.study-view-toggle', [
          h('button.study-view-toggle__btn', {
            class: { active: viewMode() === 'list' },
            attrs: { title: 'List view', 'aria-label': 'List view' },
            on: { click: () => {
              setViewMode('list');
              writeStudyLibraryRoute({ view: 'list' });
              redraw();
            } },
          }, '☰'),
          h('button.study-view-toggle__btn', {
            class: { active: viewMode() === 'grid' },
            attrs: { title: 'Grid view', 'aria-label': 'Grid view' },
            on: { click: () => {
              setViewMode('grid');
              writeStudyLibraryRoute({ view: 'grid' });
              redraw();
            } },
          }, '⊞'),
        ]),
        h('button.study-btn.study-btn--import', {
          on: { click: () => { _showImportModal = true; _importPgnText = ''; _importStatus = null; redraw(); } },
        }, 'Import PGN'),
      ]),
    ]),


    practiceLoaded() ? renderPracticeDashboard(redraw) : null,


    renderOrpSection(redraw),

    // Two-column layout: folder sidebar + main content area
    h('div.study-library-layout', [
      renderFolderSidebar(redraw),

      h('div.study-library-main', libraryMainNodes),
    ]),

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
    favorite ? h('span.study-orp-row__fav', { attrs: { title: 'Favorited' } }, '★') : null,

    // Main content
    h('div.study-orp-row__main', [


      h('div.study-orp-row__title-row', [
        isEditingLabel
          ? h('input.study-orp-row__label-input', {
              attrs: { value: _editingOrpLabelValue, placeholder: 'Line label' },
              hook: { insert: (vn) => (vn.elm as HTMLInputElement).focus() },
              on: {
                input: (e: Event) => { _editingOrpLabelValue = (e.target as HTMLInputElement).value; },
                blur: () => {
                  const newLabel = _editingOrpLabelValue.trim();
                  _editingOrpLabelId    = null;
                  _editingOrpLabelValue = '';
                  if (newLabel) {
                    // Load, update label + updatedAt, save, then refresh ORP section.
                    void getPracticeLine(sequence.id).then(line => {
                      if (!line) return;
                      return savePracticeLine({ ...line, label: newLabel, updatedAt: Date.now() });
                    }).then(() => {
                      _orpLoaded      = false;
                      _orpLoadPending = false;
                      loadOrpLines(redraw);
                    });
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
              attrs: { title: 'Click to rename' },
              on: { click: (e: Event) => {
                e.stopPropagation();
                _editingOrpLabelId    = sequence.id;
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
      attrs: { title: `Practice this line as ${sequence.trainAs}`, 'aria-label': `Practice this line as ${sequence.trainAs}` },
      on: { click: (e: Event) => {
        e.stopPropagation();
        _orpDrillPending = true;
        initDrillView([sequence], sequence.fens[0] ?? STARTING_FEN, sequence.trainAs, redraw);
        redraw();
      }},
    }, '▶'),




    h('button.study-orp-row__pause', {
      attrs: { title: sequence.status === 'active' ? 'Pause this line' : 'Resume this line' },
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
        });
      }},
    }, sequence.status === 'active' ? 'Pause' : 'Resume'),





    h('button.study-orp-row__remove', {
      attrs: {
        title: 'Remove this line from Opening Repetition Practice',
        'aria-label': 'Remove this line from Opening Repetition Practice',
      },
      on: { click: (e: Event) => {
        e.stopPropagation();
        if (confirm(`Remove "${sequence.label || title}" from Opening Repetition Practice?`)) {
          void deletePracticeLine(sequence.id).then(() => {
            _orpLoaded      = false;
            _orpLoadPending = false;
            loadOrpLines(redraw);
          });
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
      ? h('button.study-btn.study-btn--review.study-orp-bucket__review-btn', {
          attrs: { disabled: totalDue === 0 || _orpDueLaunching, title: 'Start review session for all due opening lines' },
          on: { click: (e: Event) => {
            e.stopPropagation();
            if (totalDue === 0 || _orpDueLaunching) return;
            void launchOrpDueSession(redraw);
          }},
        }, _orpDueLaunching ? 'Starting…' : `Review due (${totalDue})`)
      : null;



    const learnNewBtn: VNode | null = state === 'NEW'
      ? h('button.study-btn.study-btn--learn.study-orp-bucket__learn-btn', {
          attrs: { disabled: _orpLearnLaunching, title: 'Start a learn session for new opening lines' },
          on: { click: (e: Event) => {
            e.stopPropagation();
            if (_orpLearnLaunching) return;
            void launchOrpLearnSession(redraw);
          }},
        }, _orpLearnLaunching ? 'Starting…' : `Learn new (${group.length})`)
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
            on: { click: () => {
              initDrillView(learn, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'white', redraw);
              redraw();
            }},
          }, 'Learn Now'),
        ])
      : null,
  ]);
}
