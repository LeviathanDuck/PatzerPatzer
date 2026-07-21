











import { pgnToTree } from '../tree/pgn';
import { nodeAtPath, addNode, pathInit, pathLast } from '../tree/ops';
import { getStudy, saveStudyStrict } from './studyDb';
import { replaceHashRoute } from '../router';
import { setOrientation } from '../board/index';
import {
  activeWorkspace,
  mountWorkspace,
  unmountWorkspace,
  type WorkspaceAdapter,
  type WorkspaceCursor,
  type WorkspaceInstance,
} from '../analyse/workspaceCore';
import { createStudyBoardInputModule } from './studyBoardInput';
import { mountStudyPracticeWorkspace } from './practice/workspaceModule';
import { isSourcePreviewOpen, closeSourcePreview } from './practice/sourcePreviewCtrl';
import { syncStudyDetailItemToLibraryCache } from './studyCtrl';
// studyBoardNavigate is a hoisted function declaration in studyDetailView.ts (which already imports
// from this file). Importing it back completes a module cycle, but that is safe here: it is only
// READ at move-dispatch call time, never during module evaluation, and function bindings are
// initialized during ESM instantiation (no TDZ).
import { studyBoardNavigate, syncStudyBoard } from './studyDetailView';
import {
  parseStudyDetailRouteState,
  resolveStudyDetailPath,
  serializeStudyDetailRouteState,
  type StudyDetailOrientation,
  type StudyDetailRouteState,
} from './detailRouteState';
import type { StudyItem } from './types';
import type { TreeNode } from '../tree/types';
import { encodeLocalPgnComment, LOCAL_COMMENT_ID, sanitizePgnCommentText } from '../tree/commentIdentity';
import {
  commentEditTarget,
  commitCommentEdit,
  isEditingComment,
  type CommentEditTarget,
} from './annotationCtrl';
import { record, Severity } from '../diagnostics';
import { WorkspaceSession } from '../analyse/workspaceSession';
import { INITIAL_FEN } from 'chessops/fen';

// Null-safe cursor fallback for the brief window between `_session = null` (start of a new
// load) and the next load's `mountWorkspace` call — the shared board can call the mounted
// adapter's `getCursor()` at any time. A minimal valid empty-board TreeNode (NOT `pgnToTree('')`,
// which throws — `parsePgn('')` returns zero games, see chessops/pgn parsePgn).
const EMPTY_STUDY_TREE: TreeNode = { id: '00', ply: 0, fen: INITIAL_FEN, children: [] };

function classifyStudyError(error: unknown): string {
  if (error instanceof DOMException) return error.name || 'DOMException';
  if (error instanceof Error) return error.name || error.constructor.name || 'Error';
  return typeof error;
}

function recordStudyLoadFail(error: unknown): void {
  record({
    kind: 'render',
    severity: Severity.Error,
    source: 'study/studyDetailCtrl',
    sourceTag: 'study-load-fail',
    message: 'study-load-fail',
    metadata: {
      errorClass: classifyStudyError(error),
      route: 'study-detail',
    },
    redactionClass: 'safe',
  });
}

function recordStudyRouteEmpty(): void {
  record({
    kind: 'render',
    severity: Severity.Warn,
    source: 'study/studyDetailCtrl',
    sourceTag: 'study-route-empty',
    message: 'study-route-empty',
    metadata: { route: 'study-detail' },
    redactionClass: 'safe',
  });
}

// --- Module-level state ---

// Tree cursor unit (root/path/node/nodeList/mainline) — owned by an internal WorkspaceSession
// (Phase 2 T5-D21 extraction, mirroring D-core-02's AnalyseCtrl adoption: see
// src/analyse/ctrl.ts and src/analyse/workspaceSession.ts). Reconstructed on each study load
// since a new study means a new tree root; exposed below as delegating accessors so every
// existing read site (detailRoot/detailPath/detailNode) keeps working unchanged.
// T5-D22b/c: Study now calls mountWorkspace() (mountStudyWorkspace, below) once its tree loads,
// registering with workspaceCore's active-workspace slot so the shared board reads this session.
let _session:     WorkspaceSession | null = null;
let _study:       StudyItem | null = null;
let _orientation: 'white' | 'black' = 'white';
let _dirty        = false;
let _loaded       = false;
let _loadTargetId: string | null = null;
let _loadRouteKey: string | null = null;
let _autoSaveTimer: ReturnType<typeof setTimeout> | undefined;
let _changeRevision = 0;
let _persistTail: Promise<void> = Promise.resolve();
let _pendingPersist: Promise<void> | null = null;
let _persistenceError: string | null = null;

// --- Accessors ---

export function studyDetail(): StudyItem | null { return _study; }
export function detailRoot():  TreeNode  | null { return _session?.root ?? null; }
export function detailPath():  string          { return _session?.path ?? ''; }
export function detailNode():  TreeNode  | null {
  if (!_session) return null;
  return _session.node;
}
export function detailOrientation(): 'white' | 'black' { return _orientation; }
export function detailLoaded(): boolean { return _loaded; }
export function detailLoadTargetId(): string | null { return _loadTargetId; }
export function detailLoadRouteKey(): string | null { return _loadRouteKey; }
export function studyPersistenceError(): string | null { return _persistenceError; }

export function rememberStudyDetailRouteQuery(id: string, query: string): void {
  if (_study?.id === id) _loadRouteKey = `${id}?${query}`;
}

export function studyDetailRouteSnapshot(): StudyDetailRouteState {
  return { path: _session?.path ?? '', orientation: _orientation };
}

function setStudyDetailOrientation(orientation: StudyDetailOrientation): void {
  _orientation = orientation;
  // T5-D22b/c: the physical chessground instance is now the SHARED one (src/board/index.ts),
  // not a Study-owned `_cgRef` — push through the shared setter so a flip/route-restore actually
  // repaints the live board. See the orientation subtlety note on mountStudyWorkspace below.
  setOrientation(_orientation);
}

// --- Load ---

export function loadStudyDetail(id: string, redraw: () => void): Promise<void> {
  _loaded = false;
  _loadTargetId = id;
  _loadRouteKey = `${id}?`;
  _study   = null;
  _session = null;
  _dirty   = false;
  clearTimeout(_autoSaveTimer);
  return getStudy(id).then(item => {
    if (!item) {
      recordStudyRouteEmpty();
      _loaded = true;
      redraw();
      return;
    }
    _study = item;
    let root: TreeNode;
    try {
      root = pgnToTree(item.pgn);
    } catch (e) {
      recordStudyLoadFail(e);
      root = pgnToTree(''); // empty tree on parse failure
    }
    _session = new WorkspaceSession(root, 'study-detail');
    mountStudyWorkspace(redraw);
    _loaded = true;
    redraw();
  }).catch(e => {
    recordStudyLoadFail(e);
    recordStudyRouteEmpty();
    _loaded = true;
    redraw();
  });
}

let _studyDetailHydrationRun = 0;

export function cancelStudyDetailRouteHydration(): void {
  ++_studyDetailHydrationRun;
}

export function hydrateStudyDetailRoute(id: string, query: string, redraw: () => void): void {
  const run = ++_studyDetailHydrationRun;
  const parsed = parseStudyDetailRouteState(query);
  const retainedRouteQuery = _loadRouteKey?.includes('?')
    ? _loadRouteKey.slice(_loadRouteKey.indexOf('?') + 1)
    : '';
  const retainedRouteState = parseStudyDetailRouteState(retainedRouteQuery).state;
  _loadTargetId = id;
  _loadRouteKey = `${id}?${query}`;

  // Path/orientation changes within the mounted Study are P0 navigation. Apply them directly to
  // the live session; never reload the same PGN from IDB or wait for persistence.
  if (_study?.id === id && _session) {






    if ((!_workspaceInstance || activeWorkspace() !== _workspaceInstance) && !isSourcePreviewOpen()) {
      mountStudyWorkspace(redraw);
    }
    const recovery = resolveStudyDetailPath(_session.root, parsed.state.path);
    _session.setPath(recovery.resolvedPath);
    setStudyDetailOrientation(parsed.state.orientation);
    syncStudyBoard(redraw);
    _loaded = true;
    const canonicalState = { ...studyDetailRouteSnapshot(), tools: parsed.state.tools ?? false, toolTab: parsed.state.toolTab ?? '' };
    const canonicalRoute = serializeStudyDetailRouteState(id, canonicalState);
    const needsCanonicalCleanup = parsed.canonical.hadUnknownParams || parsed.canonical.hadDuplicateParams || parsed.canonical.hadInvalidParams || recovery.status === 'deepest-valid' || recovery.status === 'invalid' || (parsed.state.path && recovery.resolvedPath !== parsed.state.path) || window.location.hash !== canonicalRoute;
    if (needsCanonicalCleanup && window.location.hash.startsWith(`#/study/${encodeURIComponent(id)}`)) replaceHashRoute(canonicalRoute);
    redraw();
    return;
  }

  // A real source replacement waits for any dirty predecessor to commit. The old live session is
  // retained until that succeeds, so a failed IDB write cannot erase the user's edit.
  const pendingPersist = flushStudyDetailPersistence(redraw);
  _loaded = false;
  clearTimeout(_autoSaveTimer);

  void pendingPersist.then(() => {
    if (run !== _studyDetailHydrationRun) return undefined;
    _study = null;
    _session = null;
    _dirty = false;
    _changeRevision = 0;
    _persistenceError = null;
    return getStudy(id);
  }).then(item => {
    if (run !== _studyDetailHydrationRun) return;
    if (!item) {
      recordStudyRouteEmpty();
      _loaded = true;
      redraw();
      return;
    }
    _study = item;
    let root: TreeNode;
    try {
      root = pgnToTree(item.pgn);
    } catch (e) {
      recordStudyLoadFail(e);
      root = pgnToTree('');
    }
    _session = new WorkspaceSession(root, 'study-detail');
    mountStudyWorkspace(redraw);
    const recovery = resolveStudyDetailPath(root, parsed.state.path);
    _session.setPath(recovery.resolvedPath);
    setStudyDetailOrientation(parsed.state.orientation);
    _loaded = true;






    const canonicalState = { ...studyDetailRouteSnapshot(), tools: parsed.state.tools ?? false, toolTab: parsed.state.toolTab ?? '' };
    const canonicalRoute = serializeStudyDetailRouteState(id, canonicalState);
    const needsCanonicalCleanup =
      parsed.canonical.hadUnknownParams ||
      parsed.canonical.hadDuplicateParams ||
      parsed.canonical.hadInvalidParams ||
      recovery.status === 'deepest-valid' ||
      recovery.status === 'invalid' ||
      (parsed.state.path && recovery.resolvedPath !== parsed.state.path) ||
      window.location.hash !== canonicalRoute;
    if (needsCanonicalCleanup && window.location.hash.startsWith(`#/study/${encodeURIComponent(id)}`)) {
      replaceHashRoute(canonicalRoute);
    }
    redraw();
  }).catch(e => {
    if (run !== _studyDetailHydrationRun) return;
    if (_study && _session && _persistenceError) {
      // Fail closed on source replacement: keep the dirty Study and restore its own URL. Never
      // render/edit Study A under Study B's route after B could not safely replace A.
      const retainedRoute = serializeStudyDetailRouteState(_study.id, {
        ...studyDetailRouteSnapshot(),
        tools: retainedRouteState.tools ?? false,
        toolTab: retainedRouteState.toolTab ?? '',
      });
      const retainedQuery = retainedRoute.includes('?') ? retainedRoute.slice(retainedRoute.indexOf('?') + 1) : '';
      _loadTargetId = _study.id;
      _loadRouteKey = `${_study.id}?${retainedQuery}`;
      _loaded = true;
      if (window.location.hash !== retainedRoute) replaceHashRoute(retainedRoute);
      redraw();
      return;
    }
    recordStudyLoadFail(e);
    recordStudyRouteEmpty();
    _loaded = true;
    redraw();
  });
}

// --- Navigation ---

export function navigateTo(path: string, redraw: () => void): void {
  if (!_session) return;
  const node = nodeAtPath(_session.root, path);
  if (node !== undefined || path === '') { _session.setPath(path); redraw(); }
}

export function navigateFirst(redraw: () => void): void {
  _session?.setPath('');
  redraw();
}

/** Walk the mainline to the end and navigate there. */
export function navigateLast(redraw: () => void): void {
  if (!_session) return;
  let node = _session.root;
  let path = '';
  while (node.children.length > 0) {
    const child = node.children[0]!;
    path += child.id;
    node  = child;
  }
  _session.setPath(path);
  redraw();
}

export function navigatePrev(redraw: () => void): void {
  if (!_session || _session.path === '') return;
  _session.setPath(pathInit(_session.path));
  redraw();
}

export function navigateNext(redraw: () => void): void {
  if (!_session) return;
  const node = _session.node;
  if (node.children.length > 0) {
    _session.setPath(_session.path + node.children[0]!.id);
    redraw();
  }
}

// --- Workspace mount (T5-D22b/c) ---
//
// Study's WorkspaceAdapter (design doc §6b "D22b/c BUILD DESIGN"): the shared board (src/board/
// index.ts, driven from studyDetailView.ts) reads this session's cursor/orientation and routes
// board-committed moves into handleUserMove below, in place of the old standalone
// handleStudyMove (retired — nothing outside this file called it; confirmed by grep before
// removal). `boardInputMode: 'always-new-variation'` names Study's input semantics for any future
// consumer of that field (per workspaceCore.ts's open-string-union design).
//
// ID-SCHEME DISCLOSURE: the retired handleStudyMove minted ids as
// `san[0].toLowerCase()+(ply%10)`. The shared board (src/board/index.ts applyMoveToTree) instead
// mints new nodes with `scalachessCharPair(move)` (chessops/compat) BEFORE calling
// handleUserMove — the SAME id scheme src/tree/pgn.ts's pgnToTree already stamps on every loaded
// study's nodes. So Study's newly-created nodes now match its own loaded tree's id scheme (a
// consistency fix), which is a behavior change from the old san-based ids. Existing-child
// following in the shared board's move pipeline is UCI-based (`node.uci === normUci`), not
// id-based, so it is unaffected by this id-scheme change.
// Live tree-cursor read shared by BOTH Study workspace siblings (the ordinary `always-new-variation`
// mount and the C3 Practice `practice-grading` takeover). Both read the SAME `_session` — there is
// no second cursor or cloned tree. Null-safe via EMPTY_STUDY_TREE for the brief window between a load
// reset and the next mount (see the const's own note above).
function studyWorkspaceCursor(): WorkspaceCursor {
  return {
    root:     _session?.root     ?? EMPTY_STUDY_TREE,
    path:     _session?.path     ?? '',
    node:     _session?.node     ?? EMPTY_STUDY_TREE,
    nodeList: _session?.nodeList ?? [EMPTY_STUDY_TREE],
    mainline: _session?.mainline ?? [EMPTY_STUDY_TREE],
  };
}

// Study's tree-commit for a board-created node, shared by BOTH siblings (mirrors the retired
// handleStudyMove): addNode → setPath → markDirty → redraw against the SAME `_session`. markDirty()
// already calls scheduleAutoSave() internally, so no separate scheduleAutoSave() call is needed.
// `redraw()` is required here (unlike Analysis's handleUserMove, which gets a redraw for free from
// its own navigate() call) — Study has no equivalent navigation primitive yet. The Practice module's
// placeholder move dispatch flows through this exact commit so both siblings write the one Study tree
// identically (no parallel Practice copy).
function commitStudyUserMove(parentPath: string, node: TreeNode, redraw: () => void): void {
  if (!_session) return;
  addNode(_session.root, parentPath, node);
  _session.setPath(parentPath + node.id);
  markDirty();
  redraw();
}

function buildStudyWorkspaceAdapter(redraw: () => void): WorkspaceAdapter {
  return {
    id: 'study-detail',
    boardInputMode: 'always-new-variation',
    // CCW-H03a-2: Study is the first real consumer of the mode-aware board-input seam. The module is
    // pass-through (analysis-default config + keyboard, shared-tree dispatch), so mounting it changes
    // no behavior this slice — src/board/index.ts does not read `boardInputModule` yet (H03a-3), and
    // main.ts still special-cases 'always-new-variation'. `navigate` is Study's existing-child follow.
    boardInputModule: createStudyBoardInputModule(path => studyBoardNavigate(path, redraw)),
    getCursor: studyWorkspaceCursor,
    getOrientation: () => _orientation,
    redraw,
    handleUserMove: (parentPath, node) => commitStudyUserMove(parentPath, node, redraw),
  };
}

// The WorkspaceInstance most recently mounted by Study, retained so `unmountStudyWorkspace` can
// release EXACTLY that instance via the guarded `unmountWorkspace` (a stale instance can never tear
// down a newer workspace). Overwritten on every (re)mount; cleared by unmountStudyWorkspace.
let _workspaceInstance: WorkspaceInstance | null = null;

/**
 * Mount (or re-mount) the Study workspace instance so the shared board reads/writes through this
 * session while Study is the active surface. Called from loadStudyDetail/hydrateStudyDetailRoute
 * right after `_session` is (re)built — every later call supersedes whatever was mounted before
 * (Analysis, or an earlier study), per workspaceCore's single-active-slot design.
 */
export function mountStudyWorkspace(redraw: () => void): void {


  _practiceWorkspaceInstance = null;
  _workspaceInstance = mountWorkspace(buildStudyWorkspaceAdapter(redraw));
}

/**
 * Guarded route-exit unmount for the Study workspace (CCW-H03a-2). Releases ONLY the instance Study
 * last mounted, via workspaceCore's `unmountWorkspace` (which no-ops if that instance is no longer
 * the active workspace — e.g. Analysis already superseded it). Idempotent: no-op when nothing is
 * stored. Returns `unmountWorkspace`'s result (true only when a still-active Study instance was
 * removed). `_workspaceInstance` always points to whichever Study-owned sibling is current (during a
 * Practice takeover that is the Practice instance), so route exit releases the correct one; the
 * Practice ownership handle is cleared here too so Practice can never remain active off-route.
 */
export function unmountStudyWorkspace(reason: string): boolean {





  closeSourcePreview(reason);
  const instance = _workspaceInstance;
  _practiceWorkspaceInstance = null;
  if (!instance) return false;
  _workspaceInstance = null;
  return unmountWorkspace(instance, reason);
}








let _practiceWorkspaceInstance: WorkspaceInstance | null = null;

/**
 * Whether the controller-owned Study workspace (EITHER the ordinary or the Practice sibling) is the
 * live active workspace. The board-sync guard uses this so navigation updates the board under BOTH
 * Study modes, without mistaking Analysis's own `practice-grading` slot for Study's (identity, not
 * just mode).
 */
export function isStudyWorkspaceActive(): boolean {
  return _workspaceInstance !== null && activeWorkspace() === _workspaceInstance;
}

/** Whether the Study slot is currently hosting the shared Practice module. */
export function isStudyPracticeSlotActive(): boolean {
  return _practiceWorkspaceInstance !== null;
}

/**
 * Reconcile the single Study workspace slot with the route's Practice request (C3). Idempotent: a
 * no-op when the requested state already matches the active state, so repeated redraws never remount.
 *
 * Activate: mount the shared `study-practice` module (a FRESH instance via the C4 host-neutral
 * factory `mountStudyPracticeWorkspace`) with the SAME live cursor/orientation/redraw/navigate/
 * handleUserMove Study's ordinary mount uses; the core synchronously supersedes and tears down the
 * ordinary sibling. The factory result becomes BOTH the current Study instance and the Practice-owned
 * handle.
 *
 * Deactivate: clear the Practice handle, guarded-unmount EXACTLY that instance, and restore the
 * ordinary Study mount ONLY when that unmount returned `true` (the stale-owner rule — never clobber a
 * newer workspace that already superseded Practice, e.g. an Analysis excursion).
 *
 * Synchronous/bounded (P0 — board navigation wins the frame). Hosting only: no grading, session,
 * SRS, route-resume, or visible Practice behavior (Package D / C5).
 */
export function reconcileStudyPracticeSlot(requested: boolean, redraw: () => void): void {
  if (!_session) return; // session not loaded yet — hydration's completion redraw retries
  const active = _practiceWorkspaceInstance !== null;
  if (requested === active) return; // idempotent no-op (also: no remount per redraw). Returning here
  // BEFORE any transition is what keeps the post-transition board sync below off the no-op path — a
  // stable requested state never resyncs the board.
  if (requested) {
    const instance = mountStudyPracticeWorkspace({
      hostId: 'study-detail',
      getCursor: studyWorkspaceCursor,
      getOrientation: () => _orientation,
      redraw,
      navigate: path => studyBoardNavigate(path, redraw),
      handleUserMove: (parentPath, node) => commitStudyUserMove(parentPath, node, redraw),
    });
    _practiceWorkspaceInstance = instance;
    _workspaceInstance = instance;





    syncStudyBoard(redraw);
  } else {
    const instance = _practiceWorkspaceInstance;
    _practiceWorkspaceInstance = null;
    if (_workspaceInstance === instance) _workspaceInstance = null;
    if (instance && unmountWorkspace(instance, 'study-practice-deactivate')) {
      mountStudyWorkspace(redraw);



      syncStudyBoard(redraw);
    }
  }
}




















export function reconcileOrdinaryStudySlot(redraw: () => void): void {
  if (!_session) return;
  if (isSourcePreviewOpen()) return;                 // preview owns the slot
  if (_practiceWorkspaceInstance !== null) return;   // Practice owns the slot (reconcileStudyPracticeSlot)
  if (isStudyWorkspaceActive()) return;              // already the active ordinary Study slot — no-op
  // Ordinary Study was superseded (Analysis excursion) and hydration skipped the re-mount. Re-mount it
  // so ordinary Study is the active slot BEFORE the board-wrap re-inserts in this render; its insert
  // hook (studyDetailView renderStudyBoardArea) then paints the authored shapes once, after layout.
  // Do NOT syncStudyBoard here: that would run during render, before the board is laid out, and
  // Chessground would draw shapes with NaN geometry (bounds not yet measured).
  //
  // INVARIANT (relied on, currently guaranteed): reaching here means a NON-Study workspace owns the
  // slot while the ordinary Study board is rendering. That state is only ever produced by a path that
  // rendered a DIFFERENT subtree (route-exit full remount, or the drill/preview/practice takeovers,
  // whose short-circuits render their own surface) — so `div.study-board-wrap` (keyed) fresh-INSERTS
  // on this render and its insert hook fires. If a future change kept study-detail's board-wrap
  // mounted while swapping the workspace under it (reuse, no re-insert), the insert hook would not
  // fire and this omission would leave shapes empty; such a change must add a post-layout resync here.
  mountStudyWorkspace(redraw);
}

// --- Orientation ---

export function flipStudyBoard(redraw: () => void): void {
  setStudyDetailOrientation(_orientation === 'white' ? 'black' : 'white');
  redraw();
}

// --- Dirty / auto-save ---

function scheduleAutoSave(): void {
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(() => { void persistStudy().catch(() => {}); }, 500);
}

export function markDirty(): void {
  _dirty = true;
  ++_changeRevision;
  _persistenceError = null;
  scheduleAutoSave();
}

function recordStudySaveFail(error: unknown): void {
  record({
    kind: 'idb', severity: Severity.Error, source: 'study/studyDetailCtrl',
    sourceTag: 'study-save-fail', message: 'study-save-fail',
    metadata: { errorClass: classifyStudyError(error), route: 'study-detail' },
    redactionClass: 'safe',
  });
}

async function persistStudy(): Promise<void> {
  if (_pendingPersist) await _pendingPersist;
  if (!_study || !_session || !_dirty) return;
  clearTimeout(_autoSaveTimer);
  const studyId = _study.id;
  const revision = _changeRevision;
  const updated: StudyItem = { ..._study, pgn: buildStudyPgn(), updatedAt: Date.now() };
  _study = updated;
  // Publish the whole-record PGN to the library cache before any async boundary. Organize actions
  // that run immediately after comment Save must merge their metadata into this newest PGN rather
  // than cloning a stale cached StudyItem and overwriting the annotation transaction.
  syncStudyDetailItemToLibraryCache(updated);
  const operation = _persistTail.catch(() => {}).then(() => saveStudyStrict(updated)).then(() => {
    if (_study?.id === studyId && _changeRevision === revision) _dirty = false;
    if (_study?.id === studyId) _persistenceError = null;
  }).catch(error => {
    if (_study?.id === studyId) {
      _dirty = true;
      _persistenceError = classifyStudyError(error);
    }
    recordStudySaveFail(error);
    throw error;
  });
  _persistTail = operation.catch(() => {});
  _pendingPersist = operation;
  void operation.then(
    () => { if (_pendingPersist === operation) _pendingPersist = null; },
    () => { if (_pendingPersist === operation) _pendingPersist = null; },
  );
  return operation;
}

function applyCommentAtTarget(target: CommentEditTarget, text: string, redraw: () => void): boolean {
  if (!_study || !_session || _study.id !== target.studyId) return false;
  const node = nodeAtPath(_session.root, target.path);
  if (!node) return false;
  const existing = node.comments ?? [];
  node.comments = text === ''
    ? existing.filter(comment => comment.id !== LOCAL_COMMENT_ID)
    : existing.some(comment => comment.id === LOCAL_COMMENT_ID)
      ? existing.map(comment => comment.id === LOCAL_COMMENT_ID ? { ...comment, text } : comment)
      : [...existing, { id: LOCAL_COMMENT_ID, by: 'user', text }];
  markDirty();
  redraw();
  return true;
}

function settleActiveCommentEdit(redraw: () => void): void {
  if (!isEditingComment()) return;
  const target = commentEditTarget();
  if (!_study || !_session || !target || target.studyId !== _study.id || !nodeAtPath(_session.root, target.path)) {
    const error = new Error('Active Study comment target is no longer available');
    _persistenceError = error.name;
    recordStudySaveFail(error);
    throw error;
  }
  const committed = commitCommentEdit();
  if (!committed || !applyCommentAtTarget(committed.target, committed.text, redraw)) {
    const error = new Error('Active Study comment could not be settled');
    _persistenceError = error.name;
    recordStudySaveFail(error);
    throw error;
  }
}

export async function flushStudyDetailPersistence(redraw: () => void = () => {}): Promise<void> {
  clearTimeout(_autoSaveTimer);
  settleActiveCommentEdit(redraw);
  const retainedStudyId = _study?.id;
  if (!retainedStudyId) return;
  while (_study?.id === retainedStudyId) {
    const revision = _changeRevision;
    await persistStudy();
    if (_study?.id !== retainedStudyId) return;
    if (!_dirty && _changeRevision === revision && !_pendingPersist) return;
  }
}



export function updateCurrentNodeGlyphs(glyphs: import('../tree/types').Glyph[], redraw: () => void): void {
  const node = detailNode();
  if (!node) return;
  node.glyphs = glyphs;
  markDirty();
  redraw();
}

export function updateCurrentNodeComments(comments: import('../tree/types').TreeComment[], redraw: () => void): void {
  const node = detailNode();
  if (!node) return;
  node.comments = comments;
  markDirty();
  redraw();
}

export function updateCommentAtTarget(target: CommentEditTarget, text: string, redraw: () => void): boolean {
  if (!applyCommentAtTarget(target, text, redraw)) return false;
  void flushStudyDetailPersistence(redraw).then(redraw, redraw);
  return true;
}

export function updateCurrentNodeShapes(shapes: import('../tree/types').Shape[], redraw: () => void): void {
  const node = detailNode();
  if (!node) return;
  node.shapes = shapes;
  markDirty();
  redraw();
}



export function toggleBookmark(path: string, redraw: () => void): void {
  if (!_study) return;
  const bookmarks = _study.bookmarks ?? [];
  const updated = bookmarks.includes(path)
    ? bookmarks.filter(b => b !== path)
    : [...bookmarks, path];
  _study = { ..._study, bookmarks: updated, updatedAt: Date.now() };
  markDirty();
  redraw();
}

export function isBookmarked(path: string): boolean {
  return (_study?.bookmarks ?? []).includes(path);
}






// Brush name → PGN color code (first letter, uppercase)
const BRUSH_CODE: Record<string, string> = {
  green: 'G', blue: 'B', red: 'R', yellow: 'Y',
};

function brushCode(brush?: string): string {
  return (brush ? (BRUSH_CODE[brush] ?? 'G') : 'G');
}

function serializeStudyNode(node: TreeNode, needsMoveNum: boolean, pendingVariations: TreeNode[] = []): string {
  const parts: string[] = [];
  const isWhite = node.ply % 2 === 1;
  let hasOwnAnnotation = false;

  // Root-position comments belong before move 1. They are standard PGN initial comments and must
  // not be hidden behind the move-only `node.san` branch.
  if (!node.san) {
    for (const c of node.comments ?? []) {
      const text = sanitizePgnCommentText(c.text);
      if (!text) continue;
      const persistedText = c.id === LOCAL_COMMENT_ID ? encodeLocalPgnComment(text) : text;
      parts.push(`{ ${persistedText} }`);
    }
  }

  if (node.san) {
    const moveNum = Math.ceil(node.ply / 2);
    if (isWhite || needsMoveNum) {
      parts.push(isWhite ? `${moveNum}.` : `${moveNum}...`);
    }
    parts.push(node.san);

    // NAGs from glyphs ($1 = !, $2 = ?, $3 = !!, $4 = ??, $5 = !?, $6 = ?!)
    for (const g of (node.glyphs ?? [])) {
      parts.push(`$${g.id}`);
    }

    // Metadata and authored comments use separate standard PGN blocks. The local comment carries
    // Patzer's readable ownership prefix so pgnToTree can restore its editable identity after a
    // route rehydrate; imported comments remain distinct and read-only.
    const metadataParts: string[] = [];
    const arrows   = (node.shapes ?? []).filter(s => s.dest);
    const squares  = (node.shapes ?? []).filter(s => !s.dest);
    if (arrows.length > 0) {
      const cal = arrows.map(s => `${brushCode(s.brush)}${s.orig}${s.dest ?? ''}`).join(',');
      metadataParts.push(`[%cal ${cal}]`);
    }
    if (squares.length > 0) {
      const csl = squares.map(s => `${brushCode(s.brush)}${s.orig}`).join(',');
      metadataParts.push(`[%csl ${csl}]`);
    }
    if (metadataParts.length > 0) parts.push(`{ ${metadataParts.join(' ')} }`);
    for (const c of (node.comments ?? [])) {
      const text = sanitizePgnCommentText(c.text);
      if (!text) continue;
      const persistedText = c.id === LOCAL_COMMENT_ID ? encodeLocalPgnComment(text) : text;
      parts.push(`{ ${persistedText} }`);
    }

    hasOwnAnnotation = (node.glyphs?.length ?? 0) > 0 || (node.comments?.length ?? 0) > 0 || (node.shapes?.length ?? 0) > 0;
  }





  for (const v of pendingVariations) {
    const varPgn = serializeStudyNode(v, true);
    if (varPgn.trim()) parts.push(`( ${varPgn} )`);
  }

  if (node.children.length > 0) {
    const [main, ...variations] = node.children;
    // The following mainline move restates its move number only if something just
    // intervened in the emitted text (this node's own annotation, or its own
    // pendingVariations flushed above) AND this node is White — Black's restatement
    // is conditional, White's move number always shows regardless so it never needs
    // to restate. Mirrors renderPgnLine's needsMoveNum propagation.
    const contNeedsNum = (hasOwnAnnotation || pendingVariations.length > 0) && isWhite;

    if (main) {
      parts.push(serializeStudyNode(main, contNeedsNum, variations));
    }
  }

  return parts.join(' ');
}

export function buildStudyPgn(): string {
  if (!_session || !_study) return '';
  // Header set follows the Phase 2 T1 persistence/portability contract §2 roster
  // spirit: White/Black from study metadata when known (carried from the source
  // PGN's headers at import/save time), else the PGN-spec "?" unknown placeholder.
  const headers: [string, string][] = [
    ['Event',  _study.title],
    ['Site',   'ChessPatzer'],
    ['Date',   new Date(_study.createdAt).toISOString().slice(0, 10).replace(/-/g, '.')],
    ['White',  _study.white ?? '?'],
    ['Black',  _study.black ?? '?'],
    ['Result', '*'],
  ];
  const headerStr = headers.map(([k, v]) => `[${k} "${v}"]`).join('\n');
  const movesStr  = serializeStudyNode(_session.root, false).trim();
  return `${headerStr}\n\n${movesStr} *\n`;
}

// Expose pathLast for use in detail view
export { pathLast };
