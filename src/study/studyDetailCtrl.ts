// Study Detail controller — module-level state for the annotation workspace.
// Owns the current tree, path, navigation, and dirty tracking.
// Does NOT depend on AnalyseCtrl or src/board/index.ts.
// Mirrors the state model in lichess-org/lila: ui/study/src/ctrl.ts (simplified).

import type { Api as CgApi } from '@lichess-org/chessground/api';
import { pgnToTree } from '../tree/pgn';
import { nodeAtPath, addNode, pathInit, pathLast } from '../tree/ops';
import { getStudy, saveStudy } from './studyDb';
import { replaceHashRoute } from '../router';
import {
  parseStudyDetailRouteState,
  resolveStudyDetailPath,
  serializeStudyDetailRouteState,
  type StudyDetailOrientation,
  type StudyDetailRouteState,
} from './detailRouteState';
import type { StudyItem } from './types';
import type { TreeNode } from '../tree/types';
import { record, Severity } from '../diagnostics';
import { WorkspaceSession } from '../analyse/workspaceSession';

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
// NOTE: this is cursor-model adoption only — it does NOT call mountWorkspace() / register with
// workspaceCore's active-workspace slot (that would supersede Analysis's session; see T5-D22).
let _session:     WorkspaceSession | null = null;
let _study:       StudyItem | null = null;
let _orientation: 'white' | 'black' = 'white';
let _dirty        = false;
let _loaded       = false;
let _loadTargetId: string | null = null;
let _loadRouteKey: string | null = null;
let _cgRef:       CgApi | undefined;
let _autoSaveTimer: ReturnType<typeof setTimeout> | undefined;

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
export function setCgRef(cg: CgApi): void { _cgRef = cg; }
export function getCgRef(): CgApi | undefined { return _cgRef; }

export function studyDetailRouteSnapshot(): StudyDetailRouteState {
  return { path: _session?.path ?? '', orientation: _orientation };
}

function setStudyDetailOrientation(orientation: StudyDetailOrientation): void {
  _orientation = orientation;
  _cgRef?.set({ orientation: _orientation });
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
  _loaded = false;
  _loadTargetId = id;
  _loadRouteKey = `${id}?${query}`;
  _study   = null;
  _session = null;
  _dirty   = false;
  clearTimeout(_autoSaveTimer);

  void getStudy(id).then(item => {
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
    const recovery = resolveStudyDetailPath(root, parsed.state.path);
    _session.setPath(recovery.resolvedPath);
    setStudyDetailOrientation(parsed.state.orientation);
    _loaded = true;

    const canonicalState = studyDetailRouteSnapshot();
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

// --- Move handling (study mode — always creates variations) ---

export function handleStudyMove(uci: string, san: string, fen: string, redraw: () => void): void {
  if (!_session) return;
  const parentNode = _session.node;
  const ply  = parentNode.ply + 1;
  // ID generation mirrors lichess-org/lila: ui/lib/src/tree/tree.ts
  const id   = (san[0]?.toLowerCase() ?? 'a') + (ply % 10).toString();
  const newNode: TreeNode = {
    id,
    ply,
    uci,
    san,
    fen,
    glyphs:   [],
    children: [],
    comments: [],
  };

  // Check if node already exists (same id = same move), navigate to existing.
  const existing = parentNode.children.find(c => c.id === id);
  if (existing) {
    _session.setPath(_session.path + existing.id);
  } else {
    addNode(_session.root, _session.path, newNode);
    _session.setPath(_session.path + id);
    _dirty = true;
    scheduleAutoSave();
  }
  redraw();
}

// --- Orientation ---

export function flipStudyBoard(redraw: () => void): void {
  setStudyDetailOrientation(_orientation === 'white' ? 'black' : 'white');
  redraw();
}

// --- Dirty / auto-save ---

function scheduleAutoSave(): void {
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(() => { void persistStudy(); }, 500);
}

export function markDirty(): void {
  _dirty = true;
  scheduleAutoSave();
}

async function persistStudy(): Promise<void> {
  if (!_study || !_session || !_dirty) return;
  const updated: StudyItem = { ..._study, pgn: buildStudyPgn(), updatedAt: Date.now() };
  _study = updated;
  _dirty = false;
  await saveStudy(updated);
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

    // Comment block: shapes + user comments
    const commentParts: string[] = [];
    const arrows   = (node.shapes ?? []).filter(s => s.dest);
    const squares  = (node.shapes ?? []).filter(s => !s.dest);
    if (arrows.length > 0) {
      const cal = arrows.map(s => `${brushCode(s.brush)}${s.orig}${s.dest ?? ''}`).join(',');
      commentParts.push(`[%cal ${cal}]`);
    }
    if (squares.length > 0) {
      const csl = squares.map(s => `${brushCode(s.brush)}${s.orig}`).join(',');
      commentParts.push(`[%csl ${csl}]`);
    }
    for (const c of (node.comments ?? [])) {
      if (c.text.trim()) commentParts.push(c.text.trim());
    }
    if (commentParts.length > 0) {
      parts.push(`{ ${commentParts.join(' ')} }`);
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
    ['Site',   'PatzerPro'],
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
