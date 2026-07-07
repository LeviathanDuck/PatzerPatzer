// Study Library controller — module-level state for the library browser.
// Follows the established ctrl.ts module pattern (openings/ctrl.ts, stats/ctrl.ts).
// Adapted from lichess-org/lila: ui/study/src/studyCtrl.ts state model.

import { parsePgn } from 'chessops/pgn';
import { listStudies, getStudiesPaginated, collectStudyIdsInScope, saveStudy, deleteStudy as deleteStudyFromIdb, listPracticeLines, listAllPositionProgress, listFolders, saveFolder, deleteFolder as deleteFolderFromIdb, migrateStudyFolders, deriveHomeFolderId } from './studyDb';
import { seedMasterGamesToLibrary } from './saveAction';
import { countDuePositions, buildReviewSession, buildLearnSession } from './practice/sessionBuilder';
import { positionKey } from './practice/scheduler';
import {
  importAccountRepertoireSource,
  deleteRepertoireSource as deleteRepertoireSourceFromIdb,
  importRepertoireSource,
  listRepertoireAccountSourceCandidates,
  listRepertoireDivergenceMatchRecords,
  listRepertoireReportGames,
  listRepertoireSources as listRepertoireSourcesFromIdb,
  loadRepertoireAccountGames,
  renameRepertoireSource as renameRepertoireSourceInIdb,
  replaceRepertoireSourceFile as replaceRepertoireSourceFileInIdb,
  saveRepertoireAccountBuildInfo,
  setRepertoireAccountSourceFilters as setRepertoireAccountSourceFiltersInIdb,
  setRepertoireSourceEnabled as setRepertoireSourceEnabledInIdb,
  setRepertoireSourceSideOverride as setRepertoireSourceSideOverrideInIdb,
  type RepertoireAccountSourceCandidate,
} from '../repertoire/sourceDb';
import {
  ensureAccountRepertoireBuild,
  invalidateAccountRepertoireBuilds,
} from '../repertoire/accountSource';
import {
  getRepertoireScanProgressSnapshot,
  isRepertoireComplianceScanRunning,
  requestRepertoireComplianceScanPause,
  runRepertoireComplianceScan,
  type RepertoireScanProgressSnapshot,
} from '../repertoire/scanRunner';
import { replaceHashRoute } from '../router';
import {
  parseStudyRouteState,
  resolveStudyRouteAvailability,
  serializeStudyRouteState,
  studyRouteNeedsFullLibraryScan,
  type StudyRouteState,
} from './routeState';
import type { StudyItem, TrainableSequence, PositionProgress, StudyFolder } from './types';
import { StudyNavigationIndex, type StudyNavigationTree } from './navigationIndexProvider';
import type { ImportedGame } from '../import/types';
import { isAccountRepertoireSource, type RepertoireAccountFilters, type RepertoireMatchRecord, type RepertoireSide, type RepertoireSource } from '../repertoire';
import {
  buildRepertoireComplianceReport,
  DEFAULT_REPERTOIRE_COMPLIANCE_REPORT_FILTERS,
  type RepertoireComplianceReport,
  type RepertoireComplianceReportFilters,
} from '../repertoire/report';
import { record, Severity } from '../diagnostics';

function classifyStudyError(error: unknown): string {
  if (error instanceof DOMException) return error.name || 'DOMException';
  if (error instanceof Error) return error.name || error.constructor.name || 'Error';
  return typeof error;
}

function recordStudyLoadFail(route: string, error: unknown): void {
  record({
    kind: 'render',
    severity: Severity.Error,
    source: 'study/studyCtrl',
    sourceTag: 'study-load-fail',
    message: 'study-load-fail',
    metadata: {
      errorClass: classifyStudyError(error),
      route,
    },
    redactionClass: 'safe',
  });
}

function recordStudyRouteEmpty(route: string): void {
  record({
    kind: 'render',
    severity: Severity.Warn,
    source: 'study/studyCtrl',
    sourceTag: 'study-route-empty',
    message: 'study-route-empty',
    metadata: { route },
    redactionClass: 'safe',
  });
}

function recordOrpLoadFail(route: string, error: unknown): void {
  record({
    kind: 'render',
    severity: Severity.Error,
    source: 'study/studyCtrl',
    sourceTag: 'orp-load-fail',
    message: 'orp-load-fail',
    metadata: {
      errorClass: classifyStudyError(error),
      route,
    },
    redactionClass: 'safe',
  });
}

function recordRepertoireLoadFail(route: string, error: unknown): void {
  record({
    kind: 'render',
    severity: Severity.Error,
    source: 'study/studyCtrl',
    sourceTag: 'repertoire-source-load-fail',
    message: 'repertoire-source-load-fail',
    metadata: {
      errorClass: classifyStudyError(error),
      route,
    },
    redactionClass: 'safe',
  });
}

function recordRepertoireReportLoadFail(route: string, error: unknown): void {
  record({
    kind: 'render',
    severity: Severity.Error,
    source: 'study/studyCtrl',
    sourceTag: 'repertoire-report-load-fail',
    message: 'repertoire-report-load-fail',
    metadata: {
      errorClass: classifyStudyError(error),
      route,
    },
    redactionClass: 'safe',
  });
}

let _importIdSeq = 0;
function nextImportId(): string {
  return `study_import_${Date.now()}_${_importIdSeq++}`;
}

// --- Sort / filter state ---

export type StudySortKey = 'createdAt' | 'updatedAt' | 'title';
export type StudySortDir = 'asc' | 'desc';

// --- Module-level state ---

const PAGE_SIZE = 50;

let _studies:    StudyItem[]     = [];
let _loaded      = false;
let _sortKey:    StudySortKey    = 'createdAt';
let _sortDir:    StudySortDir    = 'desc';
let _filterFav:  boolean         = false;
let _filterTag:  string | null   = null;
let _filterSrc:  string | null   = null;
let _search:     string          = '';
let _page:       number          = 0;
let _hasMore:    boolean         = false;
let _loadingMore: boolean        = false;

// --- Repertoire source state ---

let _repertoireSources: RepertoireSource[] = [];
let _repertoireSourcesLoaded = false;
let _repertoireSourcesError = false;
let _repertoireSourcesLoadPending = false;
let _repertoireAccountCandidates: RepertoireAccountSourceCandidate[] = [];
let _repertoireAccountCandidatesLoaded = false;
let _repertoireAccountCandidatesError = false;
let _repertoireAccountCandidatesLoadPending = false;
let _repertoireScanProgress: RepertoireScanProgressSnapshot | null = null;
let _repertoireScanProgressLoaded = false;
let _repertoireScanProgressLoadPending = false;
let _repertoireScanBusy = false;
let _repertoireComplianceReportRecords: RepertoireMatchRecord[] = [];
let _repertoireComplianceReportGames: ImportedGame[] = [];
let _repertoireComplianceReportLoaded = false;
let _repertoireComplianceReportLoadPending = false;
let _repertoireComplianceReportError = false;
let _repertoireComplianceReportLoadGeneration = 0;
let _repertoireComplianceReportFilters: RepertoireComplianceReportFilters = {
  ...DEFAULT_REPERTOIRE_COMPLIANCE_REPORT_FILTERS,
};

// --- Folder sidebar state ---

let _folders:           StudyFolder[] = [];
let _foldersLoaded:     boolean       = false;
let _activeFolderId:    string | null = null;  // StudyFolder.id (P2-LIB-11); null = "All Studies"
let _sidebarCollapsed:  boolean       = false;

// --- Navigation index (Phase 2 T5-D04) ---
// Derived adapter/index layer over _studies/_folders (see navigationIndexProvider.ts) — never a
// second source of truth for study/folder data itself.
const _studyNavigationIndex = new StudyNavigationIndex();

// --- Annotation search index ---
// Keyed by study id. Value is a lowercased concatenation of: notes, tags, PGN comments.
// Rebuilt lazily when studies change; checked during search in applyFilters.
// Mirrors the in-memory index approach in lichess-org/lila: ui/study/src/studySearch.ts.
let _annotationIndex: Map<string, string> = new Map();
let _indexDirty = true;

/** Extract all { comment } blocks from a PGN string. */
function extractPgnComments(pgn: string): string {
  const comments: string[] = [];
  const re = /\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pgn)) !== null) {
    comments.push(m[1]!);
  }
  return comments.join(' ');
}

function rebuildAnnotationIndex(): void {
  if (!_indexDirty) return;
  _annotationIndex = new Map();
  for (const s of _studies) {
    const text = [
      s.notes ?? '',
      s.tags.join(' '),
      extractPgnComments(s.pgn),
    ].join(' ').toLowerCase();
    _annotationIndex.set(s.id, text);
  }
  _indexDirty = false;
}

// --- View mode ---

export type StudyViewMode = 'list' | 'grid';
let _viewMode: StudyViewMode = 'list';

export function viewMode(): StudyViewMode             { return _viewMode; }
export function setViewMode(m: StudyViewMode): void   { _viewMode = m; }



















const _selectedIds = new Set<string>();
let   _cursorId: string | null = null; // id-keyed cursor/anchor; replaces the old display-index _lastSelectedIdx

// --- Accessors ---

export function studies(): StudyItem[] {
  return applySort(applyFilters(_studies));
}

export function allStudies(): StudyItem[] {
  return _studies;
}

export function isLoaded(): boolean {
  return _loaded;
}

export function sortKey(): StudySortKey { return _sortKey; }
export function sortDir(): StudySortDir { return _sortDir; }
export function filterFav(): boolean    { return _filterFav; }
export function filterTag(): string | null { return _filterTag; }
export function filterSrc(): string | null { return _filterSrc; }
export function searchQuery(): string   { return _search; }
export function hasMore(): boolean      { return _hasMore; }
export function isLoadingMore(): boolean { return _loadingMore; }

// Repertoire source accessors
export function repertoireSources(): RepertoireSource[] { return _repertoireSources; }
export function repertoireSourcesLoaded(): boolean { return _repertoireSourcesLoaded; }
export function repertoireSourcesError(): boolean { return _repertoireSourcesError; }
export function repertoireAccountCandidates(): RepertoireAccountSourceCandidate[] { return _repertoireAccountCandidates; }
export function repertoireAccountCandidatesLoaded(): boolean { return _repertoireAccountCandidatesLoaded; }
export function repertoireAccountCandidatesError(): boolean { return _repertoireAccountCandidatesError; }
export function repertoireScanProgress(): RepertoireScanProgressSnapshot | null { return _repertoireScanProgress; }
export function repertoireScanProgressLoaded(): boolean { return _repertoireScanProgressLoaded; }
export function repertoireScanBusy(): boolean { return _repertoireScanBusy || isRepertoireComplianceScanRunning(); }
export function repertoireComplianceReportLoaded(): boolean { return _repertoireComplianceReportLoaded; }
export function repertoireComplianceReportError(): boolean { return _repertoireComplianceReportError; }
export function repertoireComplianceReportFilters(): RepertoireComplianceReportFilters {
  return { ..._repertoireComplianceReportFilters };
}
export function repertoireComplianceReport(): RepertoireComplianceReport {
  return buildRepertoireComplianceReport({
    records: _repertoireComplianceReportRecords,
    sources: _repertoireSources,
    games: _repertoireComplianceReportGames,
    filters: _repertoireComplianceReportFilters,
  });
}

export function setRepertoireComplianceReportFilters(
  filters: Partial<RepertoireComplianceReportFilters>,
): void {
  _repertoireComplianceReportFilters = {
    ..._repertoireComplianceReportFilters,
    ...filters,
  };
}

export function resetRepertoireComplianceReportFilters(): void {
  _repertoireComplianceReportFilters = { ...DEFAULT_REPERTOIRE_COMPLIANCE_REPORT_FILTERS };
}

// Folder sidebar accessors
export function folders(): StudyFolder[]          { return _folders; }
export function foldersLoaded(): boolean          { return _foldersLoaded; }
export function activeFolderId(): string | null   { return _activeFolderId; }
export function sidebarCollapsed(): boolean       { return _sidebarCollapsed; }
export function setActiveFolderId(id: string | null): void { _activeFolderId = id; }
export function toggleSidebar(): void             { _sidebarCollapsed = !_sidebarCollapsed; }

/** Derived sections -> nested folders -> items tree (P2-LIB-2 IA) over the currently loaded
 * studies/folders. Synchronous and rebuildable; never blocks on background classification. */
export function studyNavigationTree(): StudyNavigationTree {
  return _studyNavigationIndex.buildTree(_studies, _folders);
}

// Multi-select accessors
export function selectedIds(): ReadonlySet<string>  { return _selectedIds; }
export function isSelected(id: string): boolean     { return _selectedIds.has(id); }
export function selectionCount(): number            { return _selectedIds.size; }
export function cursorId(): string | null           { return _cursorId; }
export function clearSelection(): void              { _selectedIds.clear(); _cursorId = null; }





















export function toggleSelectId(id: string, displayedIds: readonly string[]): void {
  const isDeselecting = _selectedIds.has(id);
  if (isDeselecting && _selectedIds.size === 1) return; // refuse: would deselect the last item
  if (isDeselecting) {
    _selectedIds.delete(id);
    if (_cursorId === id) {
      _cursorId = displayedIds.find(candidateId => _selectedIds.has(candidateId)) ?? null;
    }
  } else {
    _selectedIds.add(id);
    _cursorId = id;
  }
}














export function rangeSelectToId(id: string, displayedIds: readonly string[]): void {
  const targetIdx = displayedIds.indexOf(id);
  if (targetIdx === -1) { _cursorId = id; return; } // clicked item isn't in the displayed list
  const cursorIdx = _cursorId !== null ? displayedIds.indexOf(_cursorId) : -1;
  const lo = cursorIdx === -1 ? targetIdx : Math.min(cursorIdx, targetIdx);
  const hi = cursorIdx === -1 ? targetIdx : Math.max(cursorIdx, targetIdx);
  for (let i = lo; i <= hi; i++) {
    const itemId = displayedIds[i];
    if (itemId !== undefined) _selectedIds.add(itemId);
  }
  _cursorId = id;
}

/**
 * Shift+Arrow extend/shrink (§2.1 `handleShiftArrowSelection`), Apple-Notes-style "jump over
 * already-selected neighbors." The cursor doubles as the anchor — no separate anchor index is
 * tracked (§2.1). `direction` is +1 (next) or -1 (previous) within `displayedIds` order.
 *
 * Two of the four departure/arrival cases are quoted verbatim in §2.1 and are BINDING:
 *   - departing-selected -> arriving-unselected: select the arrival too (both stay selected);
 *     stop.
 *   - departing-selected -> arriving-selected: deselect the departure, then keep jumping in the
 *     same direction through the run of already-selected cells until an unselected cell or the
 *     list boundary is hit.
 * The remaining two departure/arrival combinations are not spelled out verbatim in the quoted
 * prose. Resolved here (implementation judgment, recorded per the repo's ambiguity-resolution
 * rule) with the same arrival-selected/unselected split that governs the two quoted cases —
 * departure state only decides whether the departure cell itself gets toggled off:
 *   - departing-unselected -> arriving-unselected: no active run yet (e.g. the very first
 *     shift-arrow before any prior click) — select BOTH cells; stop.
 *   - departing-unselected -> arriving-selected: nothing to toggle off (departure was never
 *     selected) — move the cursor across this already-selected neighbor and keep jumping,
 *     identical to the quoted jump-through-a-run continuation.
 * In other words: "arrival already selected" always means jump-through (toggle departure off only
 * if it was on, then continue); "arrival not yet selected" always means stop-and-extend (select
 * the arrival, and the departure too if it wasn't already selected).
 */
export function shiftArrowSelect(direction: 1 | -1, displayedIds: readonly string[]): void {
  if (displayedIds.length === 0) return;
  let idx = _cursorId !== null ? displayedIds.indexOf(_cursorId) : -1;
  if (idx === -1) {




    _cursorId = displayedIds[0] ?? null;
    return;
  }
  for (;;) {
    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= displayedIds.length) break; // list boundary — stop
    const departureId = displayedIds[idx]!;
    const arrivalId = displayedIds[nextIdx]!;
    if (_selectedIds.has(arrivalId)) {
      _selectedIds.delete(departureId); // no-op if departure wasn't selected (case 4)
      idx = nextIdx;
      _cursorId = arrivalId;
      continue; // keep jumping through the run of already-selected cells
    }
    _selectedIds.add(arrivalId);
    _selectedIds.add(departureId); // no-op if departure was already selected (case 1)
    idx = nextIdx;
    _cursorId = arrivalId;
    break;
  }
}

/**
 * Cmd/Ctrl+A select-all (§2.1). Selects every id in `displayedIds`. Keeps the cursor on whichever
 * item is currently the cursor if it's part of this view, else falls back to the first displayed
 * item — never resets to none (§2.1: "keeping the cursor on the currently-selected file (or the
 * first file) rather than resetting it").
 */
export function selectAllDisplayed(displayedIds: readonly string[]): void {
  for (const id of displayedIds) _selectedIds.add(id);
  if (_cursorId === null || !displayedIds.includes(_cursorId)) {
    _cursorId = displayedIds[0] ?? null;
  }
}












export async function selectAllInScope(
  scopeMatcher: (item: Pick<StudyItem, 'id' | 'folders'>) => boolean,
): Promise<void> {
  const ids = await collectStudyIdsInScope(scopeMatcher);
  for (const id of ids) _selectedIds.add(id);
  if (_cursorId === null || !ids.includes(_cursorId)) {
    _cursorId = ids[0] ?? null;
  }
}

















export function handleStudyClick(id: string, _idx: number, e: MouseEvent): void {
  const displayedIds = studies().map(s => s.id); // filtered+sorted list at this moment
  if (e.shiftKey && _cursorId !== null) {
    rangeSelectToId(id, displayedIds);
  } else {
    // Cmd/Ctrl+click and plain click share the same toggle transition in this slice.
    toggleSelectId(id, displayedIds);
  }
}

// Bulk operations

export async function bulkDeleteStudies(): Promise<void> {
  const ids = Array.from(_selectedIds);
  for (const id of ids) {
    await deleteStudy(id);
  }
  _selectedIds.clear();
  _cursorId = null;
}

/**
 * Add every selected study to the given folder by id (idempotent — skips studies already a
 * member). P2-LIB-11: membership is id-keyed, so callers must already hold a real
 * StudyFolder.id — the library-view bulk menu lists folders() records directly, never
 * free-text names, so no name resolution happens here.
 */
export async function bulkAddToFolder(folderId: string): Promise<void> {
  const ids = Array.from(_selectedIds);
  for (const id of ids) {
    const study = _studies.find(s => s.id === id);
    if (study && !study.folders.includes(folderId)) {
      await updateStudy({ id, folders: [...study.folders, folderId] });
    }
  }
}

export async function bulkSetFavorite(fav: boolean): Promise<void> {
  const ids = Array.from(_selectedIds);
  for (const id of ids) {
    await updateStudy({ id, favorite: fav });
  }
}

// Computed from all studies — unique sorted tag names.
export function studyTags(): string[] {
  const tags = new Set<string>();
  for (const s of _studies) {
    for (const t of s.tags) tags.add(t);
  }
  return Array.from(tags).sort();
}

// --- Mutations ---

export function setSortKey(key: StudySortKey): void { _sortKey = key; }
export function setSortDir(dir: StudySortDir): void { _sortDir = dir; }
export function setFilterFav(v: boolean): void       { _filterFav = v; }
export function setFilterTag(tag: string | null): void { _filterTag = tag; }
export function setFilterSrc(src: string | null): void { _filterSrc = src; }
export function setSearch(q: string): void           { _search = q; }

export function loadedStudyPageCount(): number {
  return Math.max(1, _page + 1);
}

export function studyLibraryRouteSnapshot(pages: number = loadedStudyPageCount()): StudyRouteState {
  return {
    q:       _search,
    source:  _filterSrc as StudyRouteState['source'],
    tag:     _filterTag,
    folder:  _activeFolderId,
    fav:     _filterFav,
    sortKey: _sortKey,
    sortDir: _sortDir,
    view:    _viewMode,
    pages,
  };
}

function applyStudyLibraryRouteState(state: StudyRouteState): void {
  _search = state.q;
  _filterSrc = state.source;
  _filterTag = state.tag;
  _activeFolderId = state.folder;
  _filterFav = state.fav;
  _sortKey = state.sortKey;
  _sortDir = state.sortDir;
  _viewMode = state.view;
}

// Known StudyFolder ids (P2-LIB-11) — the availability set resolveStudyRouteAvailability
// validates the route's `folder` param against. _folders already carries a record for every
// id referenced by a loaded StudyItem (T5-D01's migration never leaves an id orphaned), so no
// separate scan over _studies is needed here.
function knownFolderIds(): string[] {
  return _folders.map(f => f.id);
}

// --- CRUD ---

/**
 * Initialize the library by loading the first page of studies from IDB.
 * Uses cursor-based pagination to avoid loading the full store (CR-2, CR-3).
 * Calls redraw() when done. Safe to call multiple times.
 */
export function initStudyLibrary(redraw: () => void): Promise<void> {
  _page = 0;
  const dir: IDBCursorDirection = _sortDir === 'desc' ? 'prev' : 'next';
  const sortIdx = _sortKey === 'title' ? 'createdAt' : _sortKey;
  return getStudiesPaginated(sortIdx, dir, 0, PAGE_SIZE + 1).then(async items => {
    _hasMore  = items.length > PAGE_SIZE;
    _studies  = _hasMore ? items.slice(0, PAGE_SIZE) : items;
    if (_studies.length === 0) recordStudyRouteEmpty('study-library');
    if (_foldersLoaded) _folders = await migrateStudyFolders(_studies, _folders);
    _loaded   = true;
    _indexDirty = true;
    // initStudyLibrary loads one paginated page (CR-2/CR-3) — a partial batch, so this can only
    // ever add/update the navigation index, never prune it (see navigationIndexProvider.ts).
    _studyNavigationIndex.noteItemsLoaded(_studies);
    redraw();
  }).catch(e => {
    recordStudyLoadFail('study-library', e);
    _studies = [];
    _hasMore = false;
    _loaded = true;
    _indexDirty = true;
    redraw();
  });
}

function loadAllStudiesForRoute(requestedPages: number, redraw: () => void): Promise<void> {
  return listStudies().then(async items => {
    _studies = items;
    _hasMore = false;
    _loadingMore = false;
    _page = Math.max(0, requestedPages - 1);
    if (_studies.length === 0) recordStudyRouteEmpty('study-library');
    if (_foldersLoaded) _folders = await migrateStudyFolders(_studies, _folders);
    _loaded = true;
    _indexDirty = true;
    // listStudies() is exhaustive (full-library-scan route), so this is the one load point safe
    // to also prune stale cached navigation-index records via reconcileAll.
    void _studyNavigationIndex.reconcileAll(_studies);
    redraw();
  }).catch(e => {
    recordStudyLoadFail('study-library', e);
    _studies = [];
    _hasMore = false;
    _loadingMore = false;
    _page = 0;
    _loaded = true;
    _indexDirty = true;
    redraw();
  });
}

/**
 * Load the next page of studies and append to the current list.
 * Filters and sorts are applied client-side after loading.
 */
export function loadNextPage(redraw: () => void): Promise<boolean> {
  if (!_hasMore || _loadingMore) return Promise.resolve(false);
  _loadingMore = true;
  _page++;
  redraw();
  const dir: IDBCursorDirection = _sortDir === 'desc' ? 'prev' : 'next';
  const sortIdx = _sortKey === 'title' ? 'createdAt' : _sortKey;
  return getStudiesPaginated(sortIdx, dir, _page * PAGE_SIZE, PAGE_SIZE + 1).then(async items => {
    _hasMore     = items.length > PAGE_SIZE;
    _loadingMore = false;
    const nextBatch = _hasMore ? items.slice(0, PAGE_SIZE) : items;
    if (_foldersLoaded) _folders = await migrateStudyFolders(nextBatch, _folders);
    _studies     = [..._studies, ...nextBatch];
    if (_studies.length === 0) recordStudyRouteEmpty('study-library');
    _indexDirty  = true;
    // Only the newly-loaded page needs (re)classification — a partial batch, add/update only.
    _studyNavigationIndex.noteItemsLoaded(nextBatch);
    redraw();
    return true;
  }).catch(e => {
    recordStudyLoadFail('study-library', e);
    _page = Math.max(0, _page - 1);
    _loadingMore = false;
    redraw();
    return false;
  });
}

/**
 * Reset pagination and reload from page 0.
 * Called when sort key/direction or filters change.
 */
export function resetPagination(redraw: () => void): Promise<void> {
  _studies  = [];
  _loaded   = false;
  return initStudyLibrary(redraw);
}

let _loadFoldersPromise: Promise<void> | null = null;














export function loadFolders(redraw: () => void): Promise<void> {
  if (_foldersLoaded) return Promise.resolve();
  if (_loadFoldersPromise) return _loadFoldersPromise;
  _loadFoldersPromise = listFolders().then(async items => {
    _folders      = items;
    _foldersLoaded = true;
    if (_studies.length > 0) _folders = await migrateStudyFolders(_studies, _folders);
    redraw();
  }).catch(e => {
    recordStudyLoadFail('study-library', e);
    // Deliberately do not latch `_foldersLoaded` here: leaving it false lets a later call
    // retry (below, `_loadFoldersPromise` is cleared regardless of outcome) instead of
    // permanently freezing folders as an empty, unmigrated list after one transient failure.
  }).finally(() => {
    _loadFoldersPromise = null;
  });
  return _loadFoldersPromise;
}

function replaceRepertoireSourceInMemory(source: RepertoireSource): void {
  const idx = _repertoireSources.findIndex(item => item.id === source.id);
  if (idx === -1) {
    _repertoireSources = [..._repertoireSources, source].sort((a, b) =>
      a.createdAt - b.createdAt || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
    );
    return;
  }
  _repertoireSources = [
    ..._repertoireSources.slice(0, idx),
    source,
    ..._repertoireSources.slice(idx + 1),
  ];
}

export function invalidateRepertoireScanProgress(): void {
  _repertoireScanProgressLoaded = false;
  _repertoireScanProgressLoadPending = false;
}

export function invalidateRepertoireComplianceReport(): void {
  _repertoireComplianceReportLoadGeneration += 1;
  _repertoireComplianceReportLoaded = false;
  _repertoireComplianceReportLoadPending = false;
  _repertoireComplianceReportError = false;
  _repertoireComplianceReportRecords = [];
  _repertoireComplianceReportGames = [];
}

export function loadRepertoireSources(redraw: () => void): void {
  if (_repertoireSourcesLoadPending) return;
  _repertoireSourcesLoadPending = true;
  void listRepertoireSourcesFromIdb().then(sources => {
    _repertoireSources = sources;
    _repertoireSourcesLoaded = true;
    _repertoireSourcesError = false;
  }).catch(e => {
    recordRepertoireLoadFail('study-library-repertoire-sources', e);
    _repertoireSources = [];
    _repertoireSourcesLoaded = true;
    _repertoireSourcesError = true;
  }).finally(() => {
    _repertoireSourcesLoadPending = false;
    redraw();
  });
}

export function loadRepertoireAccountCandidates(redraw: () => void): void {
  if (_repertoireAccountCandidatesLoadPending) return;
  _repertoireAccountCandidatesLoadPending = true;
  void listRepertoireAccountSourceCandidates().then(candidates => {
    _repertoireAccountCandidates = candidates;
    _repertoireAccountCandidatesLoaded = true;
    _repertoireAccountCandidatesError = false;
  }).catch(e => {
    recordRepertoireLoadFail('study-library-repertoire-account-candidates', e);
    _repertoireAccountCandidates = [];
    _repertoireAccountCandidatesLoaded = true;
    _repertoireAccountCandidatesError = true;
  }).finally(() => {
    _repertoireAccountCandidatesLoadPending = false;
    redraw();
  });
}

function invalidateRepertoireAccountCandidates(): void {
  _repertoireAccountCandidatesLoaded = false;
  _repertoireAccountCandidatesLoadPending = false;
}

export async function uploadRepertoireSourceFile(
  filename: string,
  rawPgn: string,
): Promise<RepertoireSource> {
  const source = await importRepertoireSource({ filename, rawPgn });
  replaceRepertoireSourceInMemory(source);
  _repertoireSourcesLoaded = true;
  _repertoireSourcesError = false;
  invalidateRepertoireScanProgress();
  invalidateRepertoireComplianceReport();
  invalidateRepertoireAccountCandidates();
  return source;
}

export async function addRepertoireAccountSource(
  accountId: string,
  allowLargeAccount = false,
): Promise<RepertoireSource> {
  const source = await importAccountRepertoireSource(accountId, { allowLargeAccount });
  replaceRepertoireSourceInMemory(source);
  _repertoireSourcesLoaded = true;
  _repertoireSourcesError = false;
  invalidateRepertoireAccountCandidates();
  return source;
}

export async function renameRepertoireSource(id: string, name: string): Promise<RepertoireSource> {
  const source = await renameRepertoireSourceInIdb(id, name);
  replaceRepertoireSourceInMemory(source);
  return source;
}

export async function setRepertoireSourceSideOverride(
  id: string,
  sideOverride: RepertoireSide | null,
): Promise<RepertoireSource> {
  const source = await setRepertoireSourceSideOverrideInIdb(id, sideOverride);
  replaceRepertoireSourceInMemory(source);
  invalidateRepertoireScanProgress();
  invalidateRepertoireComplianceReport();
  return source;
}

export async function setRepertoireAccountSourceFilters(
  id: string,
  filters: Partial<RepertoireAccountFilters>,
): Promise<RepertoireSource> {
  invalidateAccountRepertoireBuilds(id);
  const source = await setRepertoireAccountSourceFiltersInIdb(id, filters);
  replaceRepertoireSourceInMemory(source);
  return source;
}

export async function setRepertoireSourceEnabled(
  id: string,
  enabled: boolean,
): Promise<RepertoireSource> {
  invalidateAccountRepertoireBuilds(id);
  const source = await setRepertoireSourceEnabledInIdb(id, enabled);
  replaceRepertoireSourceInMemory(source);
  return source;
}

export async function replaceRepertoireSourceFile(
  id: string,
  rawPgn: string,
): Promise<RepertoireSource> {
  const result = await replaceRepertoireSourceFileInIdb(id, rawPgn);
  replaceRepertoireSourceInMemory(result.source);
  invalidateRepertoireScanProgress();
  invalidateRepertoireComplianceReport();
  return result.source;
}

export async function deleteRepertoireSource(id: string): Promise<void> {
  invalidateAccountRepertoireBuilds(id);
  await deleteRepertoireSourceFromIdb(id);
  _repertoireSources = _repertoireSources.filter(source => source.id !== id);
  invalidateRepertoireAccountCandidates();
  invalidateRepertoireScanProgress();
  invalidateRepertoireComplianceReport();
}

export function ensureRepertoireAccountSourceBuilds(redraw: () => void): void {
  for (const source of _repertoireSources) {
    if (!source.enabled || !isAccountRepertoireSource(source)) continue;
    ensureAccountRepertoireBuild({
      source,
      loadGames: loadRepertoireAccountGames,
      saveBuildInfo: async updated => {
        const saved = await saveRepertoireAccountBuildInfo(
          updated.id,
          updated.contentVersion,
          updated.accountBuild!,
          updated.accountBuild?.builtAt,
        );
        if (saved) replaceRepertoireSourceInMemory(saved);
        return saved;
      },
      onProgress: () => redraw(),
      onComplete: updated => {
        replaceRepertoireSourceInMemory(updated);
        redraw();
      },
      onError: () => redraw(),
    });
  }
}

export function loadRepertoireComplianceReport(redraw: () => void): void {
  if (_repertoireComplianceReportLoadPending) return;
  const generation = ++_repertoireComplianceReportLoadGeneration;
  _repertoireComplianceReportLoadPending = true;
  void listRepertoireDivergenceMatchRecords()
    .then(async records => {
      if (generation !== _repertoireComplianceReportLoadGeneration) return;
      const games = await listRepertoireReportGames(records.map(record => record.gameId));
      if (generation !== _repertoireComplianceReportLoadGeneration) return;
      _repertoireComplianceReportRecords = records;
      _repertoireComplianceReportGames = games;
      _repertoireComplianceReportLoaded = true;
      _repertoireComplianceReportError = false;
    })
    .catch(error => {
      if (generation !== _repertoireComplianceReportLoadGeneration) return;
      recordRepertoireReportLoadFail('study-library-repertoire-report', error);
      _repertoireComplianceReportRecords = [];
      _repertoireComplianceReportGames = [];
      _repertoireComplianceReportLoaded = true;
      _repertoireComplianceReportError = true;
    })
    .finally(() => {
      if (generation !== _repertoireComplianceReportLoadGeneration) return;
      _repertoireComplianceReportLoadPending = false;
      redraw();
    });
}

export function loadRepertoireScanProgress(redraw: () => void): void {
  if (_repertoireScanProgressLoadPending) return;
  _repertoireScanProgressLoadPending = true;
  void getRepertoireScanProgressSnapshot().then(snapshot => {
    _repertoireScanProgress = snapshot;
    _repertoireScanProgressLoaded = true;
  }).catch(error => {
    _repertoireScanProgress = {
      state: 'error',
      scannedGameCount: 0,
      totalGameCount: 0,
      sourceCount: 0,
      runId: null,
      updatedAt: null,
      message: error instanceof Error ? error.message : 'Could not load scan status.',
    };
    _repertoireScanProgressLoaded = true;
  }).finally(() => {
    _repertoireScanProgressLoadPending = false;
    redraw();
  });
}

export function runRepertoireScanFromStudy(redraw: () => void): void {
  if (_repertoireScanBusy || isRepertoireComplianceScanRunning()) return;
  _repertoireScanBusy = true;
  void runRepertoireComplianceScan({
    onProgress: snapshot => {
      _repertoireScanProgress = snapshot;
      _repertoireScanProgressLoaded = true;
      redraw();
    },
  }).then(result => {
    _repertoireScanProgress = {
      state: result.paused ? 'paused' : 'complete',
      scannedGameCount: result.scannedGameCount,
      totalGameCount: result.totalGameCount,
      sourceCount: result.sourceCount,
      runId: result.manifest.runId,
      updatedAt: result.manifest.updatedAt,
      message: null,
    };
  }).catch(error => {
    _repertoireScanProgress = {
      state: 'error',
      scannedGameCount: _repertoireScanProgress?.scannedGameCount ?? 0,
      totalGameCount: _repertoireScanProgress?.totalGameCount ?? 0,
      sourceCount: _repertoireScanProgress?.sourceCount ?? 0,
      runId: _repertoireScanProgress?.runId ?? null,
      updatedAt: Date.now(),
      message: error instanceof Error ? error.message : 'Could not run scan.',
    };
  }).finally(() => {
    _repertoireScanBusy = false;
    _repertoireScanProgressLoaded = true;
    invalidateRepertoireComplianceReport();
    loadRepertoireComplianceReport(redraw);
    redraw();
  });
}

export function pauseRepertoireScanFromStudy(redraw: () => void): void {
  requestRepertoireComplianceScanPause();
  _repertoireScanProgress = _repertoireScanProgress
    ? { ..._repertoireScanProgress, state: 'paused', message: 'Pausing after this chunk.' }
    : _repertoireScanProgress;
  redraw();
}

let _studyRouteHydrationRun = 0;

export function cancelStudyLibraryRouteHydration(): void {
  ++_studyRouteHydrationRun;
}

export function hydrateStudyLibraryRoute(query: string, redraw: () => void): void {
  const run = ++_studyRouteHydrationRun;
  const parsed = parseStudyRouteState(query);
  applyStudyLibraryRouteState(parsed.state);
  const needsFullLibraryScan = studyRouteNeedsFullLibraryScan(parsed.state);
  _studies = [];
  _loaded = false;
  _hasMore = false;
  _loadingMore = false;

  const initialLoad = needsFullLibraryScan
    ? loadAllStudiesForRoute(parsed.state.pages, redraw)
    : initStudyLibrary(redraw);

  void initialLoad.then(async () => {
    if (run !== _studyRouteHydrationRun) return;
    await loadFolders(redraw);
    if (run !== _studyRouteHydrationRun) return;

    const availability = resolveStudyRouteAvailability(studyLibraryRouteSnapshot(parsed.state.pages), {
      tags: studyTags(),
      folders: knownFolderIds(),
    });
    if (availability.invalidParams.length > 0) {
      applyStudyLibraryRouteState(availability.state);
    }

    const requestedPages = Math.max(1, availability.state.pages);
    while (run === _studyRouteHydrationRun && loadedStudyPageCount() < requestedPages && _hasMore) {
      const loaded = await loadNextPage(redraw);
      if (!loaded) break;
    }
    if (run !== _studyRouteHydrationRun) return;

    const actualPages = loadedStudyPageCount();
    const canonicalState = {
      ...studyLibraryRouteSnapshot(actualPages),
      pages: Math.min(requestedPages, actualPages),
    };
    const canonicalRoute = serializeStudyRouteState(canonicalState);
    const needsCanonicalCleanup =
      parsed.canonical.hadUnknownParams ||
      parsed.canonical.hadDuplicateParams ||
      parsed.canonical.hadInvalidParams ||
      availability.invalidParams.length > 0 ||
      parsed.state.pages !== canonicalState.pages ||
      window.location.hash !== canonicalRoute;

    if (needsCanonicalCleanup && window.location.hash.startsWith('#/study') && !window.location.hash.startsWith('#/study/')) {
      replaceHashRoute(canonicalRoute);
    }
    redraw();
  });
}

let _folderIdSeq = 0;
function nextFolderId(): string {
  return `folder_${Date.now()}_${_folderIdSeq++}`;
}

/**
 * Resolve a folder display name to its StudyFolder.id, synthesizing (and persisting) a new
 * top-level folder record if no folder with that name exists yet. This is the one remaining
 * name-based entry point post-T5-D02: addStudyToFolderByName, backing the library row's
 * free-text "+ folder" input, where a name is genuinely all the caller has. Every other
 * mutation (bulkAddToFolder, moveStudyToFolder, the folder sidebar) takes a StudyFolder.id
 * directly (P2-LIB-11). Duplicate-name matches resolve to the earliest-created record, the
 * same deterministic rule the batch migration (studyDb.ts planStudyFolderMigration) uses.
 */
async function resolveOrCreateFolderIdByName(name: string): Promise<string> {
  const matches = _folders.filter(f => f.name === name);
  if (matches.length === 1) return matches[0]!.id;
  if (matches.length > 1) {
    return [...matches].sort((a, b) => a.createdAt - b.createdAt)[0]!.id;
  }
  const now = Date.now();
  const folder: StudyFolder = { id: nextFolderId(), name, createdAt: now, updatedAt: now };
  await saveFolder(folder);
  _folders = [..._folders, folder];
  return folder.id;
}

/**
 * Create a new folder with the given name, optionally nested under a parent folder.
 * Saves to IDB and updates in-memory folder list.
 */
export async function createFolder(name: string, parentId?: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  const now = Date.now();
  const folder: StudyFolder = {
    id:        nextFolderId(),
    name:      trimmed,
    createdAt: now,
    updatedAt: now,
  };
  if (parentId) folder.parentId = parentId;
  await saveFolder(folder);
  _folders = [..._folders, folder];
}

/**
 * Rename a folder by id. Membership is id-keyed (P2-LIB-11), so this is exactly one
 * StudyFolder write — no StudyItem needs to change; every membership survives the rename.
 */
export async function renameFolder(id: string, newName: string): Promise<void> {
  const trimmed = newName.trim();
  if (!trimmed) return;
  const idx = _folders.findIndex(f => f.id === id);
  if (idx === -1) return;
  const old = _folders[idx]!;
  const updated = { ...old, name: trimmed, updatedAt: Date.now() };
  _folders = [..._folders.slice(0, idx), updated, ..._folders.slice(idx + 1)];
  await saveFolder(updated);
}


















export async function reparentFolder(id: string, newParentId: string | null): Promise<void> {
  const idx = _folders.findIndex(f => f.id === id);
  if (idx === -1) return;
  const old = _folders[idx]!;
  const updated: StudyFolder = { ...old, updatedAt: Date.now() };
  if (newParentId) updated.parentId = newParentId;
  else delete updated.parentId;
  _folders = [..._folders.slice(0, idx), updated, ..._folders.slice(idx + 1)];
  await saveFolder(updated);
}

/**
 * Add a study to a folder by id (idempotent — skips if already in folder). Used by
 * drag-and-drop to assign a study to a folder without replacing existing assignments
 * (P2-LIB-8: folders are collections, adding never removes another membership). Membership
 * is id-keyed (P2-LIB-11); the drop target already supplies a real StudyFolder.id, so no name
 * resolution happens here — see addStudyToFolderByName for the free-text-name entry point.
 */
export async function moveStudyToFolder(studyId: string, folderId: string): Promise<void> {
  const study = _studies.find(s => s.id === studyId);
  if (!study) return;
  if (study.folders.includes(folderId)) return;
  await updateStudy({ id: studyId, folders: [...study.folders, folderId] });
}

/**
 * Add a study to a folder by display name, synthesizing (and persisting) a new top-level
 * folder record if no folder with that name exists yet (idempotent — skips if already a
 * member). Backs the library row's free-text "+ folder" input (libraryView.ts), the one
 * remaining Study-library entry point where a user genuinely types a name rather than
 * picking an existing StudyFolder record. Fixes the T5-D01-flagged bug where that input wrote
 * the raw name straight into StudyItem.folders, bypassing id resolution entirely.
 */
export async function addStudyToFolderByName(studyId: string, name: string): Promise<void> {
  const study = _studies.find(s => s.id === studyId);
  if (!study) return;
  const folderId = await resolveOrCreateFolderIdByName(name);
  if (study.folders.includes(folderId)) return;
  await updateStudy({ id: studyId, folders: [...study.folders, folderId] });
}








/**
 * Explicit alias-add: adds `folderId` to `id`'s membership (`folders[]`) without ever touching
 * `homeFolderId` (P2-LIB-8 amendment: "adding to a folder never removes it from another" now
 * governs this EXPLICIT alias-add action specifically — OD-7 REVISED's DEFAULT drag is MOVE, see
 * `rehomeGame` below, never this). No-op if `folderId` is already a membership entry (idempotent,
 * mirrors `moveStudyToFolder`'s existing guard).
 */
export async function addAliasToFolder(id: string, folderId: string): Promise<void> {
  const study = _studies.find(s => s.id === id);
  if (!study) return;
  if (study.folders.includes(folderId)) return;
  await updateStudy({ id, folders: [...study.folders, folderId] });
}

/**
 * Remove `folderId` from `id`'s membership — but ONLY when it is not the item's home folder.
 * Compares against the effective home via `deriveHomeFolderId` (not the raw `homeFolderId`
 * field), so a legacy item with no explicit `homeFolderId` yet still refuses to remove its
 * derived `folders[0]` home. Removing the home folder is a re-home, not a plain removal — see
 * `rehomeGame` (explicit re-home) and `promoteOrClearHomeOnRemoval` (folder-deletion path, below).
 * No-op if `folderId` is not currently a member.
 */
export async function removeAliasFromFolder(id: string, folderId: string): Promise<void> {
  const study = _studies.find(s => s.id === id);
  if (!study) return;
  if (!study.folders.includes(folderId)) return;
  if (folderId === deriveHomeFolderId(study)) return; // refuse — removing home is a re-home
  await updateStudy({ id, folders: study.folders.filter(f => f !== folderId) });
}

/**
 * Re-home `id` to `folderId`: sets it as the explicit `homeFolderId` AND ensures folder
 * membership (adds `folderId` to `folders[]` if not already present) — the MOVE semantic (OD-7
 * REVISED: "Default game drag = MOVE (re-home)"). Provided for A-alias-2 to route the navigator
 * drag engine (`navigatorDragDrop.ts`) through — per this slice's out-of-scope fence, NOT wired
 * into any view here.
 */
export async function rehomeGame(id: string, folderId: string): Promise<void> {
  const study = _studies.find(s => s.id === id);
  if (!study) return;
  const folders = study.folders.includes(folderId) ? study.folders : [...study.folders, folderId];
  await updateStudy({ id, folders, homeFolderId: folderId });
}
























export async function moveGameToFolder(
  id: string,
  targetFolderId: string,
  sourceFolderId: string | null,
): Promise<void> {
  await rehomeGame(id, targetFolderId);
  if (
    sourceFolderId != null &&
    sourceFolderId !== targetFolderId &&
    folders().some(f => f.id === sourceFolderId)
  ) {
    await removeAliasFromFolder(id, sourceFolderId);
  }
}

/**
 * When `id`'s home folder has just been removed from its membership (the game left its home
 * folder, or that folder was deleted — see `removeFolderEntity` below), promote the OLDEST
 * remaining alias (the first entry left in `folders[]`, insertion order) to the new home, or
 * clear to `null` (falls to Unsorted/section-derived placement) if no alias remains. Never
 * orphans a game (locked owner decision, OD-7 REVISED APPROVED 2026-07-06: "removing a game from
 * its home folder auto-promotes the oldest alias to home ... falls to Unsorted if no alias
 * exists — never orphaned"). Always writes an explicit `homeFolderId` (string or `null`), making
 * the home designation authoritative going forward rather than leaving it to implicit
 * `folders[0]` derivation (the "Do not preserve" instruction for this slice). Call this AFTER
 * `folders[]` no longer contains the vacated home id — it reads the current `folders[]` as the
 * remaining-aliases set.
 */
export async function promoteOrClearHomeOnRemoval(id: string): Promise<void> {
  const study = _studies.find(s => s.id === id);
  if (!study) return;
  const nextHome = study.folders.length > 0 ? study.folders[0]! : null;
  await updateStudy({ id, homeFolderId: nextHome });
}








export async function removeFolderEntity(id: string): Promise<void> {
  const folder = _folders.find(f => f.id === id);
  if (!folder) return;
  _folders = _folders.filter(f => f.id !== id);
  await deleteFolderFromIdb(id);
  // Remove this folder's id from all studies that reference it.
  const affected = _studies.filter(s => s.folders.includes(folder.id));
  for (const study of affected) {
    const wasHome = deriveHomeFolderId(study) === folder.id;
    await updateStudy({ id: study.id, folders: study.folders.filter(f => f !== folder.id) });
    if (wasHome) await promoteOrClearHomeOnRemoval(study.id);
  }
  // Clear active folder filter if it was the deleted folder.
  if (_activeFolderId === folder.id) _activeFolderId = null;
}

export async function updateStudy(partial: Partial<StudyItem> & { id: string }): Promise<void> {
  const idx = _studies.findIndex(s => s.id === partial.id);
  if (idx === -1) return;
  const updated: StudyItem = { ..._studies[idx]!, ...partial, updatedAt: Date.now() };
  _studies = [..._studies.slice(0, idx), updated, ..._studies.slice(idx + 1)];
  _indexDirty = true;
  _studyNavigationIndex.noteItemsLoaded([updated]);
  await saveStudy(updated);
}

export async function deleteStudy(id: string): Promise<void> {
  _studies = _studies.filter(s => s.id !== id);
  _indexDirty = true;
  void _studyNavigationIndex.noteItemRemoved(id);
  await deleteStudyFromIdb(id);
}

export function addStudy(item: StudyItem): void {
  _studies = [item, ..._studies];
  _indexDirty = true;
  _studyNavigationIndex.noteItemsLoaded([item]);
}

// --- Filter + sort helpers ---

function applyFilters(items: StudyItem[]): StudyItem[] {
  // Rebuild annotation index if studies have changed since last search.
  if (_search) rebuildAnnotationIndex();
  // StudyItem.folders and _activeFolderId are both StudyFolder.id values (P2-LIB-11), so
  // membership is a direct id comparison — no name lookup, and no ambiguity between two
  // folders that happen to share a display name.
  return items.filter(s => {
    if (_filterFav && !s.favorite) return false;
    if (_filterTag  && !s.tags.includes(_filterTag))    return false;
    if (_filterSrc  && s.source !== _filterSrc)         return false;
    if (_activeFolderId && !s.folders.includes(_activeFolderId)) return false;
    if (_search) {
      const q = _search.toLowerCase();
      // Search title + players (fast path)
      const titleMatch = s.title.toLowerCase().includes(q) ||
        (s.white ?? '').toLowerCase().includes(q) ||
        (s.black ?? '').toLowerCase().includes(q);
      if (titleMatch) return true;
      // Search annotations index (notes, tags, PGN comments)
      const annotText = _annotationIndex.get(s.id) ?? '';
      if (!annotText.includes(q)) return false;
    }
    return true;
  });
}

function applySort(items: StudyItem[]): StudyItem[] {
  const dir = _sortDir === 'desc' ? -1 : 1;
  return [...items].sort((a, b) => {
    if (_sortKey === 'title') {
      return dir * a.title.localeCompare(b.title);
    }
    return dir * ((a[_sortKey] as number) - (b[_sortKey] as number));
  });
}

// --- PGN import ---

/**
 * Parse a PGN string (potentially multi-game) and save each game as a StudyItem.
 * Returns the number of games imported.
 * Reuses chessops/pgn parsePgn — handles multi-game PGN files natively.
 */
export async function importPgnToLibrary(pgnText: string): Promise<number> {
  const games = parsePgn(pgnText);
  if (games.length === 0) return 0;
  const now = Date.now();
  const items: StudyItem[] = games.map((game, idx) => {
    const white   = game.headers.get('White');
    const black   = game.headers.get('Black');
    const result  = game.headers.get('Result');
    const eco     = game.headers.get('ECO');
    const opening = game.headers.get('Opening');
    const event   = game.headers.get('Event');

    let title = 'Untitled Study';
    if (white && black && white !== '?' && black !== '?') {
      title = opening ? `${white} vs ${black} — ${opening}` : `${white} vs ${black}`;
    } else if (opening) {
      title = opening;
    } else if (event && event !== '?') {
      title = event;
    }

    // Re-serialize minimal PGN from headers + moves for storage.
    // For import, we use the raw pgnText slice if single-game, or reconstruct header+moves.
    // For simplicity, store the full pgnText for single-game imports and reconstruct for multi.
    const singleGame = games.length === 1;
    const pgn = singleGame ? pgnText.trim() : reconstructPgn(game, pgnText, idx);

    const item: StudyItem = {
      id:        nextImportId(),
      pgn,
      title,
      source:    'import',
      tags:      [],
      folders:   [],
      favorite:  false,
      createdAt: now + idx,  // slight offset so sort order matches import order
      updatedAt: now + idx,
    };
    if (white   && white   !== '?') item.white   = white;
    if (black   && black   !== '?') item.black   = black;
    if (result  && result  !== '*') item.result  = result;
    if (eco)                        item.eco     = eco;
    if (opening)                    item.opening = opening;
    return item;
  });

  // Save all items to IDB and update in-memory state.
  await Promise.all(items.map(item => saveStudy(item)));
  _studies    = [...items, ..._studies];
  _indexDirty = true;
  _studyNavigationIndex.noteItemsLoaded(items);
  return items.length;
}

/**
 * Reconstruct a minimal PGN string for a single game from a multi-game PGN.
 * Uses chessops game headers and the raw pgn input as fallback.
 * For multi-game PGNs we build a minimal header block + moves string.
 */
function reconstructPgn(game: ReturnType<typeof parsePgn>[0], _rawPgn: string, _idx: number): string {
  const headers: string[] = [];
  game.headers.forEach((val, key) => {
    headers.push(`[${key} "${val}"]`);
  });
  // Build moves string from the game's move nodes (simplified SAN reconstruction).
  // For a clean implementation, we collect SANs from the mainline.
  const sans: string[] = [];
  let node: typeof game.moves.children[0] | undefined = game.moves.children[0];
  let ply = 1;
  while (node) {
    const san = node.data.san;
    if (!san) break;
    if (ply % 2 === 1) sans.push(`${Math.ceil(ply / 2)}. ${san}`);
    else               sans.push(san);
    ply++;
    node = node.children[0];
  }
  const result = game.headers.get('Result') ?? '*';
  return `${headers.join('\n')}\n\n${sans.join(' ')} ${result}`;
}


















export type OrpLineState = 'NEW' | 'DUE' | 'IN_PROGRESS' | 'PAUSED';














export interface OrpPracticeLineView {
  // --- From TrainableSequence (the practice-line record itself) ---
  sequence:    TrainableSequence;

  // --- Joined from parent StudyItem ---
  title:       string;           // StudyItem.title
  opening:     string | undefined;  // StudyItem.opening (ECO opening name, if known)
  eco:         string | undefined;  // StudyItem.eco (ECO code, if known)
  collection:  string | undefined;  // extracted from 'collection:{name}' tag, if present
  favorite:    boolean;          // StudyItem.favorite


  lineState:      OrpLineState;  // NEW | DUE | IN_PROGRESS | PAUSED (see OrpLineState)
  dueCount:       number;        // positions currently due (0 for NEW/PAUSED/IN_PROGRESS)
  lastPracticed:  number | undefined; // max lastAttemptAt across line positions; undefined = never
}

/** Extract the collection name from a StudyItem.tags array, or undefined if not present. */
function extractCollectionTag(tags: string[]): string | undefined {
  const prefix = 'collection:';
  const found = tags.find(t => t.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

















export async function listOrpPracticeLines(): Promise<OrpPracticeLineView[]> {
  try {
    const [lines, studies, progressList] = await Promise.all([
      listPracticeLines(),
      listStudies(),
      listAllPositionProgress(),
    ]);

    // Build a lookup map of opening-sourced StudyItems only.
    const openingStudies = new Map<string, StudyItem>();
    for (const s of studies) {
      if (s.source === 'openings') {
        openingStudies.set(s.id, s);
      }
    }

    // Build a progress map keyed by positionKey — loaded once, reused per line.
    const progressMap = new Map<string, PositionProgress>(
      progressList.map(p => [p.key, p])
    );

    const now = Date.now();
    const results: OrpPracticeLineView[] = [];
    for (const seq of lines) {
      const parent = openingStudies.get(seq.studyItemId);
      if (!parent) {
        // Orphaned line (parent deleted) or non-opening source — skip gracefully.
        continue;
      }









      let lineState: OrpLineState;
      let dueCount = 0;
      let lastPracticed: number | undefined;

      if (seq.status === 'paused') {
        lineState = 'PAUSED';
        // Paused lines: excluded from due math (dueCount stays 0).
        // Still surface lastPracticed for display purposes.
      } else {
        // Active line: use countDuePositions (passes a single-element array of the seq).
        dueCount = countDuePositions([seq], progressMap, now);

        // Determine whether any PositionProgress exists for this line.
        let hasAnyProgress = false;
        for (const fen of seq.fens) {
          const key = positionKey(fen);
          if (progressMap.has(key)) {
            hasAnyProgress = true;
            break;
          }
        }

        if (!hasAnyProgress) {
          // No progress at all → treat as new (unlearned / due per scheduler semantics).
          lineState = 'NEW';
        } else if (dueCount > 0) {
          lineState = 'DUE';
        } else {
          lineState = 'IN_PROGRESS';
        }
      }

      // lastPracticed: max lastAttemptAt across all positions that have progress.
      for (const fen of seq.fens) {
        const key = positionKey(fen);
        const progress = progressMap.get(key);
        if (progress && progress.lastAttemptAt) {
          if (lastPracticed === undefined || progress.lastAttemptAt > lastPracticed) {
            lastPracticed = progress.lastAttemptAt;
          }
        }
      }

      results.push({
        sequence:      seq,
        title:         parent.title,
        opening:       parent.opening,
        eco:           parent.eco,
        collection:    extractCollectionTag(parent.tags),
        favorite:      parent.favorite,
        lineState,
        dueCount,
        lastPracticed,
      });
    }
    return results;
  } catch (e) {
    recordOrpLoadFail('opening-repetition-practice', e);
    recordStudyLoadFail('opening-practice-lines', e);
    console.warn('[studyCtrl] listOrpPracticeLines failed', e);
    return [];
  }
}



let _allSequences:   TrainableSequence[]          = [];
let _progressMap:    Map<string, PositionProgress> = new Map();
let _dueCount:       number                        = 0;
let _practiceLoaded: boolean                       = false;

export function practiceLoaded(): boolean { return _practiceLoaded; }
export function dueCount(): number        { return _dueCount; }
export function allSequences(): TrainableSequence[] { return _allSequences; }
export function progressMap(): Map<string, PositionProgress> { return _progressMap; }

export function reviewSequences(): TrainableSequence[] {
  return buildReviewSession(_allSequences, _progressMap);
}

export function learnSequences(): TrainableSequence[] {
  return buildLearnSession(_allSequences, _progressMap);
}

/** Per-study due count: how many positions are due across all sequences for a given studyItemId. */
export function dueCountForStudy(studyItemId: string): number {
  const seqs = _allSequences.filter(s => s.studyItemId === studyItemId);
  return countDuePositions(seqs, _progressMap);
}

let _practiceLoadPending = false;

export function loadPracticeData(redraw: () => void): void {
  if (_practiceLoadPending) return;
  _practiceLoadPending = true;
  void (async () => {
    try {
      const [seqs, progressList] = await Promise.all([
        listPracticeLines(),
        listAllPositionProgress(),
      ]);
      _allSequences   = seqs;
      _progressMap    = new Map(progressList.map(p => [p.key, p]));
      _dueCount       = countDuePositions(seqs, _progressMap);
      _practiceLoaded = true;
    } catch (e) {
      recordStudyLoadFail('study-practice', e);
      console.warn('[studyCtrl] loadPracticeData failed', e);
      _practiceLoaded = true;
    } finally {
      _practiceLoadPending = false;
      redraw();
    }
  })();
}

/** Recompute due count key for a specific FEN (called after a drill grade). */
export function invalidatePracticeData(): void {
  _practiceLoaded  = false;
  _practiceLoadPending = false;
}

let _seeding = false;
export function isSeeding(): boolean { return _seeding; }

/**
 * Seed all master games into the Study Library and reload the library view.
 * Runs in batched async chunks to avoid blocking the UI.
 */
export async function seedSampleStudies(redraw: () => void): Promise<void> {
  if (_seeding) return;
  _seeding = true;
  redraw();
  try {
    await seedMasterGamesToLibrary();
  } finally {
    _seeding = false;
  }
  resetPagination(redraw);
}
