// Study Library controller — module-level state for the library browser.
// Follows the established ctrl.ts module pattern (openings/ctrl.ts, stats/ctrl.ts).
// Adapted from lichess-org/lila: ui/study/src/studyCtrl.ts state model.

import { parsePgn } from 'chessops/pgn';
import { listStudies, getStudiesPaginated, saveStudy, deleteStudy as deleteStudyFromIdb, listPracticeLines, listAllPositionProgress, listFolders, saveFolder, deleteFolder as deleteFolderFromIdb } from './studyDb';
import { seedMasterGamesToLibrary } from './saveAction';
import { countDuePositions, buildReviewSession, buildLearnSession } from './practice/sessionBuilder';
import { positionKey } from './practice/scheduler';
import {
  deleteRepertoireSource as deleteRepertoireSourceFromIdb,
  importRepertoireSource,
  listRepertoireSources as listRepertoireSourcesFromIdb,
  renameRepertoireSource as renameRepertoireSourceInIdb,
  replaceRepertoireSourceFile as replaceRepertoireSourceFileInIdb,
  setRepertoireSourceEnabled as setRepertoireSourceEnabledInIdb,
  setRepertoireSourceSideOverride as setRepertoireSourceSideOverrideInIdb,
} from '../repertoire/sourceDb';
import { replaceHashRoute } from '../router';
import {
  parseStudyRouteState,
  resolveStudyRouteAvailability,
  serializeStudyRouteState,
  studyRouteNeedsFullLibraryScan,
  type StudyRouteState,
} from './routeState';
import type { StudyItem, TrainableSequence, PositionProgress, StudyFolder } from './types';
import type { RepertoireSide, RepertoireSource } from '../repertoire';
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

// --- Folder sidebar state ---

let _folders:           StudyFolder[] = [];
let _foldersLoaded:     boolean       = false;
let _activeFolderName:  string | null = null;  // null = "All Studies"
let _sidebarCollapsed:  boolean       = false;

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

// --- Multi-select state ---

const _selectedIds     = new Set<string>();
let   _lastSelectedIdx = -1;   // index in the currently displayed filtered list

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

// Folder sidebar accessors
export function folders(): StudyFolder[]          { return _folders; }
export function foldersLoaded(): boolean          { return _foldersLoaded; }
export function activeFolderName(): string | null { return _activeFolderName; }
export function sidebarCollapsed(): boolean       { return _sidebarCollapsed; }
export function setActiveFolderName(name: string | null): void { _activeFolderName = name; }
export function toggleSidebar(): void             { _sidebarCollapsed = !_sidebarCollapsed; }

// Multi-select accessors
export function selectedIds(): ReadonlySet<string>  { return _selectedIds; }
export function isSelected(id: string): boolean     { return _selectedIds.has(id); }
export function selectionCount(): number            { return _selectedIds.size; }
export function clearSelection(): void              { _selectedIds.clear(); _lastSelectedIdx = -1; }

/**
 * Handle a click on a study row at the given index within the filtered+sorted list.
 * - Cmd/Ctrl+click: toggle single item
 * - Shift+click: range-select from last selected index to current
 * - Plain click: toggle selection (same as Cmd/Ctrl for simplicity)
 */
export function handleStudyClick(id: string, idx: number, e: MouseEvent): void {
  const displayedItems = studies();  // filtered+sorted list at this moment
  if (e.shiftKey && _lastSelectedIdx >= 0) {
    const lo = Math.min(_lastSelectedIdx, idx);
    const hi = Math.max(_lastSelectedIdx, idx);
    for (let i = lo; i <= hi; i++) {
      const item = displayedItems[i];
      if (item) _selectedIds.add(item.id);
    }
  } else if (e.metaKey || e.ctrlKey) {
    if (_selectedIds.has(id)) _selectedIds.delete(id);
    else _selectedIds.add(id);
    _lastSelectedIdx = idx;
  } else {
    // Plain click: toggle like Cmd/Ctrl
    if (_selectedIds.has(id)) _selectedIds.delete(id);
    else _selectedIds.add(id);
    _lastSelectedIdx = idx;
  }
}

// Bulk operations

export async function bulkDeleteStudies(): Promise<void> {
  const ids = Array.from(_selectedIds);
  for (const id of ids) {
    await deleteStudy(id);
  }
  _selectedIds.clear();
  _lastSelectedIdx = -1;
}

export async function bulkAddToFolder(folderName: string): Promise<void> {
  const ids = Array.from(_selectedIds);
  for (const id of ids) {
    const study = _studies.find(s => s.id === id);
    if (study && !study.folders.includes(folderName)) {
      await updateStudy({ id, folders: [...study.folders, folderName] });
    }
  }
}

export async function bulkSetFavorite(fav: boolean): Promise<void> {
  const ids = Array.from(_selectedIds);
  for (const id of ids) {
    await updateStudy({ id, favorite: fav });
  }
}

// Computed from all studies — unique sorted folder names.
export function studyFolders(): string[] {
  const folders = new Set<string>();
  for (const s of _studies) {
    for (const f of s.folders) folders.add(f);
  }
  return Array.from(folders).sort();
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
    folder:  _activeFolderName,
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
  _activeFolderName = state.folder;
  _filterFav = state.fav;
  _sortKey = state.sortKey;
  _sortDir = state.sortDir;
  _viewMode = state.view;
}

function studyFolderRouteNames(): string[] {
  const names = new Set<string>();
  for (const folder of _folders) names.add(folder.name);
  for (const name of studyFolders()) names.add(name);
  return Array.from(names);
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
  return getStudiesPaginated(sortIdx, dir, 0, PAGE_SIZE + 1).then(items => {
    _hasMore  = items.length > PAGE_SIZE;
    _studies  = _hasMore ? items.slice(0, PAGE_SIZE) : items;
    if (_studies.length === 0) recordStudyRouteEmpty('study-library');
    _loaded   = true;
    _indexDirty = true;
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
  return listStudies().then(items => {
    _studies = items;
    _hasMore = false;
    _loadingMore = false;
    _page = Math.max(0, requestedPages - 1);
    if (_studies.length === 0) recordStudyRouteEmpty('study-library');
    _loaded = true;
    _indexDirty = true;
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
  return getStudiesPaginated(sortIdx, dir, _page * PAGE_SIZE, PAGE_SIZE + 1).then(items => {
    _hasMore     = items.length > PAGE_SIZE;
    _loadingMore = false;
    _studies     = [..._studies, ...(_hasMore ? items.slice(0, PAGE_SIZE) : items)];
    if (_studies.length === 0) recordStudyRouteEmpty('study-library');
    _indexDirty  = true;
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

/**
 * Load persisted StudyFolder entities from IDB.
 * Called once at library init. Safe to call multiple times.
 */
export function loadFolders(redraw: () => void): Promise<void> {
  if (_foldersLoaded) return Promise.resolve();
  return listFolders().then(items => {
    _folders      = items;
    _foldersLoaded = true;
    redraw();
  }).catch(e => {
    recordStudyLoadFail('study-library', e);
    _foldersLoaded = true;
  });
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

export async function uploadRepertoireSourceFile(
  filename: string,
  rawPgn: string,
): Promise<RepertoireSource> {
  const source = await importRepertoireSource({ filename, rawPgn });
  replaceRepertoireSourceInMemory(source);
  _repertoireSourcesLoaded = true;
  _repertoireSourcesError = false;
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
  return source;
}

export async function setRepertoireSourceEnabled(
  id: string,
  enabled: boolean,
): Promise<RepertoireSource> {
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
  return result.source;
}

export async function deleteRepertoireSource(id: string): Promise<void> {
  await deleteRepertoireSourceFromIdb(id);
  _repertoireSources = _repertoireSources.filter(source => source.id !== id);
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
      folders: studyFolderRouteNames(),
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
 * Create a new top-level folder with the given name.
 * Saves to IDB and updates in-memory folder list.
 */
export async function createFolder(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  const now = Date.now();
  const folder: import('./types').StudyFolder = {
    id:        nextFolderId(),
    name:      trimmed,
    createdAt: now,
    updatedAt: now,
  };
  await saveFolder(folder);
  _folders = [..._folders, folder];
}

/**
 * Rename a folder by id.
 * Also renames the folder name stored in every StudyItem that references the old name.
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
  // Rename inline folder references on all in-memory studies and persist each.
  const affected = _studies.filter(s => s.folders.includes(old.name));
  for (const study of affected) {
    const newFolders = study.folders.map(f => f === old.name ? trimmed : f);
    await updateStudy({ id: study.id, folders: newFolders });
  }
}

/**
 * Add a study to a folder by name (idempotent — skips if already in folder).
 * Used by drag-and-drop to assign a study to a folder without replacing existing assignments.
 */
export async function moveStudyToFolder(studyId: string, folderName: string): Promise<void> {
  const study = _studies.find(s => s.id === studyId);
  if (!study) return;
  if (study.folders.includes(folderName)) return;
  await updateStudy({ id: studyId, folders: [...study.folders, folderName] });
}

/**
 * Delete a folder entity by id.
 * Removes the folder name from any study that references it.
 */
export async function removeFolderEntity(id: string): Promise<void> {
  const folder = _folders.find(f => f.id === id);
  if (!folder) return;
  _folders = _folders.filter(f => f.id !== id);
  await deleteFolderFromIdb(id);
  // Remove folder name from all studies that reference it.
  const affected = _studies.filter(s => s.folders.includes(folder.name));
  for (const study of affected) {
    await updateStudy({ id: study.id, folders: study.folders.filter(f => f !== folder.name) });
  }
  // Clear active folder filter if it was the deleted folder.
  if (_activeFolderName === folder.name) _activeFolderName = null;
}

export async function updateStudy(partial: Partial<StudyItem> & { id: string }): Promise<void> {
  const idx = _studies.findIndex(s => s.id === partial.id);
  if (idx === -1) return;
  const updated: StudyItem = { ..._studies[idx]!, ...partial, updatedAt: Date.now() };
  _studies = [..._studies.slice(0, idx), updated, ..._studies.slice(idx + 1)];
  _indexDirty = true;
  await saveStudy(updated);
}

export async function deleteStudy(id: string): Promise<void> {
  _studies = _studies.filter(s => s.id !== id);
  _indexDirty = true;
  await deleteStudyFromIdb(id);
}

export function addStudy(item: StudyItem): void {
  _studies = [item, ..._studies];
  _indexDirty = true;
}

// --- Filter + sort helpers ---

function applyFilters(items: StudyItem[]): StudyItem[] {
  // Rebuild annotation index if studies have changed since last search.
  if (_search) rebuildAnnotationIndex();
  return items.filter(s => {
    if (_filterFav && !s.favorite) return false;
    if (_filterTag  && !s.tags.includes(_filterTag))    return false;
    if (_filterSrc  && s.source !== _filterSrc)         return false;
    if (_activeFolderName && !s.folders.includes(_activeFolderName)) return false;
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
