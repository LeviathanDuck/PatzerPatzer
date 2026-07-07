






import type { DrawShape } from '@lichess-org/chessground/draw';
import { h, type VNode } from 'snabbdom';
import { renderMoveList } from '../analyse/moveList';
import { formatScore } from '../analyse/evalView';
import { renderMoveNavBar } from '../analyse/analysisControls';
import type { MoveNavOverride } from '../analyse/analysisControls';
import { renderToggleRow } from '../ui';
import { renderCommentPanel, renderGlyphToolbar, GLYPHS } from './annotationView';
import { updateCurrentNodeGlyphs, updateCurrentNodeShapes, toggleBookmark, isBookmarked, buildStudyPgn } from './studyDetailCtrl';
import {
  protocol, currentEval, engineReady,
  clearEvalPositionOverride, setEvalPositionOverride, evalCurrentPosition, setOnLiveEvalImproved,
  visibleEvalForFen,
} from '../engine/ctrl';
import { listPracticeLines, savePracticeLine, deletePracticeLine } from './studyDb';
import { progressMap } from './studyCtrl';
import { countDuePositions } from './practice/sessionBuilder';
import type { TrainableSequence } from './types';
import type { TreeNode } from '../tree/types';
import { deleteNodeAt, promoteAt, pathInit, nodeListAt } from '../tree/ops';
import {
  studyDetail, detailRoot, detailPath, detailNode, detailLoaded,
  detailLoadRouteKey, hydrateStudyDetailRoute, navigateTo, navigateFirst, navigateLast, navigatePrev, navigateNext,
  flipStudyBoard, studyDetailRouteSnapshot,
} from './studyDetailCtrl';
import { parseStudyDetailRouteState, serializeStudyDetailRouteState } from './detailRouteState';
import { normalizeStudyToolTab, type StudyToolTabId } from './navigatorShellView';
import { writeHashRoute } from '../router';
import { isDrillActive, isDrillSummary, initDrillView, renderDrillView, endDrill } from './practice/drillView';
import { extractMainline, extractFromPath, getNodeAtPath, extractFromVariationPath } from './practice/extractLine';
import { reportIssue } from '../diagnostics/reporting/reportAction';
import { contextFromNodeList, fenOnlyPositionContext, type EnginePositionContext } from '../engine/positionContext';
import { activeWorkspace } from '../analyse/workspaceCore';
import { cgInstance, onBoardUserMove, renderBoard, renderPromotionDialog, syncBoard } from '../board/index';


let _showColorPicker   = false;
let _practiceFromPath: string | null  = null;
let _practiceScope:   'full' | 'current' | 'variation' = 'full';


let _practiceLines:        TrainableSequence[]  = [];
let _practiceLinesLoaded   = false;
let _practiceLinesStudyId: string | null        = null;
let _renamingLineId:       string | null        = null;
let _renamingLineValue     = '';









let _toolsOpen = false;
let _activeToolTab: StudyToolTabId = 'comments';
let _toolsRouteSyncKey: string | null = null;

function syncToolsStateFromRoute(routeKey: string, routeQuery: string): void {
  if (_toolsRouteSyncKey === routeKey) return;
  _toolsRouteSyncKey = routeKey;
  const parsed = parseStudyDetailRouteState(routeQuery).state;
  _toolsOpen = parsed.tools ?? false;
  _activeToolTab = normalizeStudyToolTab(parsed.toolTab);
}

// Strips `tools`/`toolTab` out of a raw route query string, used ONLY to decide whether a route
// change looks like a path/orientation change (the actual value passed to `hydrateStudyDetailRoute`
// is the FULL query — see the call site's comment below for why that split matters). Without this
// stripped comparison, a Manual Review toggle or tab switch (which changes the query string but not
// path/orientation) would itself look like a path change and needlessly re-enter hydration.
function coreRouteQuery(routeQuery: string): string {
  const params = new URLSearchParams(routeQuery);
  params.delete('tools');
  params.delete('toolTab');
  return params.toString();
}

// Applies the same `tools`/`toolTab` stripping to a stored `detailLoadRouteKey()` value
// (`"id?query"`, `studyDetailCtrl.ts`) so the retrigger comparison below ignores tools/toolTab on
// BOTH sides — otherwise, once a real hydration call has been made with tools baked into the
// stored key (see below), every subsequent render would see a permanent mismatch and re-hydrate on
// every redraw.
function coreLoadRouteKey(key: string | null): string | null {
  if (key === null) return null;
  const qIndex = key.indexOf('?');
  if (qIndex === -1) return key;
  return `${key.slice(0, qIndex)}?${coreRouteQuery(key.slice(qIndex + 1))}`;
}

function writeStudyDetailRoute(): void {
  const study = studyDetail();
  if (!study) return;
  const snapshot = studyDetailRouteSnapshot();
  writeHashRoute(serializeStudyDetailRouteState(study.id, {
    ...snapshot,
    tools: _toolsOpen,
    toolTab: _toolsOpen ? _activeToolTab : '',
  }), { mode: 'replace' });
}

function toggleManualReview(redraw: () => void): void {
  _toolsOpen = !_toolsOpen;
  writeStudyDetailRoute();
  redraw();
}




function renderManualReviewToggle(redraw: () => void): VNode {
  const label = _toolsOpen ? 'Close Manual Review' : 'Manual Review';
  return h('button.study-manual-review-toggle', {
    class: { 'study-manual-review-toggle--active': _toolsOpen },
    attrs: {
      type: 'button',
      title: label,
      'aria-label': label,
      'aria-pressed': String(_toolsOpen),
    },
    on: { click: () => toggleManualReview(redraw) },
  }, [
    h('span.study-manual-review-toggle__icon', { attrs: { 'aria-hidden': 'true' } }, _toolsOpen ? '◉' : '○'),
    h('span.study-manual-review-toggle__label', 'Manual Review'),
  ]);
}






/** One move+comment row for the Comments live-echo panel. `path` is the SAME `TreePath` shape
 * (concatenated 2-char node ids) `navigateTo`/the move list already use. */
interface StudyCommentRow {
  path: string;
  node: TreeNode;
}

/** Walks the WHOLE study tree (mainline + variations — a comment can live on any node, not only
 * the mainline), collecting every node with at least one non-blank comment. Mirrors this file's
 * own path-building convention (`parentPath + child.id`, same as `moveList.ts`'s tree walk and
 * `tree/ops.ts`'s `TreePath` doc comment: "a concatenation of 2-char node IDs"). The root itself
 * (`path === ''`) has no move (`san`/`ply` describe the position BEFORE any move), so it is never
 * included even if it somehow carried a comment — this panel is a list of MOVE+comment pairs.
 */
function collectCommentedNodes(root: TreeNode): StudyCommentRow[] {
  const rows: StudyCommentRow[] = [];
  const walk = (node: TreeNode, path: string): void => {
    if (path !== '' && node.comments?.some(c => c.text.trim().length > 0)) {
      rows.push({ path, node });
    }
    for (const child of node.children) walk(child, path + child.id);
  };
  walk(root, '');
  return rows;
}

/** Same move-number/SAN formatting `moveList.ts`'s inline `renderMoveSpan` uses (`renderMoveList`
 * itself is not reused here since it renders the whole move TREE with its own eval/context-menu/
 * fold wiring — this panel is a flat filtered list, a different shape — but the index convention
 * stays identical so a comment row reads the same way the move list already does: White is
 * `"14."`, Black is `"14…"`). */
function formatCommentRowMove(node: TreeNode): string {
  const n = Math.ceil(node.ply / 2);
  const index = node.ply % 2 === 1 ? `${n}.` : `${n}…`;
  return `${index} ${node.san ?? ''}`;
}

/** Read-only echo of every move-tree comment — the board's own Comment box (`renderCommentPanel`,
 * `annotationView.ts`) stays the ONLY editor; this panel never writes to `node.comments`. Clicking
 * a row navigates the board to that node's path via the EXACT SAME three-call nav sequence the
 * move list's own row click already uses (`navigateTo`/`syncStudyBoard`/`writeStudyDetailRoute`),
 * so bookmark state, engine re-sync, and route-write behavior are all identical to a move-list
 * click — no parallel nav path is introduced. */
function renderCommentsToolPanel(redraw: () => void): VNode {
  const root = detailRoot();
  const rows = root ? collectCommentedNodes(root) : [];

  if (rows.length === 0) {
    return h('div.study-tools-col__panel.study-tools-col__comments', [
      h('div.study-tools-col__empty', 'No comments yet.'),
    ]);
  }

  return h('div.study-tools-col__panel.study-tools-col__comments',
    rows.map(({ path, node }) => h('button.study-tools-col__comment-row', {
      key: path,
      attrs: { type: 'button' },
      on: { click: () => { navigateTo(path, redraw); syncStudyBoard(redraw); writeStudyDetailRoute(); } },
    }, [
      h('span.study-tools-col__comment-move', formatCommentRowMove(node)),
      h('span.study-tools-col__comment-text', (node.comments ?? [])
        .filter(c => c.text.trim().length > 0)
        .map(c => c.text)
        .join(' ')),
    ])),
  );
}





export function renderStudyToolPanel(activeToolTab: StudyToolTabId, redraw: () => void): VNode | null {
  if (activeToolTab !== 'comments') return null;
  return renderCommentsToolPanel(redraw);
}

// Defined at module scope so it survives the shared board's insert hook closure and any hook
// callback fired outside a render pass.
let _studyRedraw: () => void = () => {};

// --- Move input: consumed via the SHARED board (T5-D22b/c) ---
// board/index.ts's renderBoard() wires its own onUserMove -> applyMoveToTree, which (D22a) calls
// activeWorkspace().handleUserMove(parentPath, newNode) for a brand-new node, or navigates
// directly to an existing child. Study's own move-shaping logic (handleStudyMove) has been
// retired — see studyDetailCtrl.ts buildStudyWorkspaceAdapter's handleUserMove.
//
// route into main.ts's initGround() `navigate` closure for the existing-child-follow branch: this
// is invoked (via activeWorkspace-aware routing in main.ts, T5-D22b/c) instead of Analysis's own
// navigate() when Study is the mounted workspace, so it must apply the same tail effects Study's
// own nav-button/move-list handlers already apply (session update, board resync, route write).
export function studyBoardNavigate(path: string, redraw: () => void): void {
  navigateTo(path, redraw);
  syncStudyBoard(redraw);
  writeStudyDetailRoute();
}

// --- Hand-drawn shape (arrow/circle) persistence ---
// board/index.ts's shared renderBoard()/syncBoard() only wire `drawable.enabled` — they have no
// per-node shape save/restore (that's Study's own annotation feature: [%cal]/[%csl] round-tripped
// through buildStudyPgn/pgnToTree). Layered here via cgInstance.set() (an already-exported seam)
// so switching to the shared board does not silently drop it. Not editing board/index.ts.
function onStudyShapesChange(cgShapes: DrawShape[]): void {
  const converted = cgShapes.map(s => ({
    orig:  s.orig as string,
    ...(s.dest  ? { dest:  s.dest  as string } : {}),
    ...(s.brush ? { brush: s.brush            } : {}),
  }));
  updateCurrentNodeShapes(converted, _studyRedraw);
}

function currentStudyNodeShapes(): DrawShape[] {
  const node = detailNode();
  return (node?.shapes ?? []).map(s =>
    s.dest
      ? { orig: s.orig as DrawShape['orig'], dest: s.dest as NonNullable<DrawShape['dest']>, brush: s.brush ?? 'green' }
      : { orig: s.orig as DrawShape['orig'], brush: s.brush ?? 'green' }
  );
}

// Always pass enabled+onChange+shapes together — chessground's `.set()` does not guarantee
// partial-field merge of `drawable` across calls, so a shapes-only or onChange-only `.set()` could
// silently drop the other.
function syncStudyShapeDrawable(): void {
  cgInstance?.set({ drawable: { enabled: true, onChange: onStudyShapesChange, shapes: currentStudyNodeShapes() } });
}

// --- Board sync ---
// Guarded on Study actually being the mounted workspace: this touches the SHARED cgInstance, and
// (unlike the retired standalone board) that instance is also used by Analysis — calling this
// while Analysis is mounted would stomp Analysis's board with Study's stale node/shapes.
export function syncStudyBoard(redraw?: () => void): void {
  if (activeWorkspace()?.boardInputMode !== 'always-new-variation') return;
  if (redraw) syncStudyEngine(redraw);
  syncBoard();
  syncStudyShapeDrawable();
}

// Re-syncs the shared board after ANY committed board move while Study is mounted — covers both
// the "new variation" branch (studyDetailCtrl's handleUserMove already ran addNode/setPath/
// markDirty/redraw by the time this fires) and the "existing child, follow it" branch (handled by
// studyBoardNavigate above, which already calls syncStudyBoard itself — this call is then a
// harmless, idempotent no-op-ish re-sync). Registered once; safe to fire on Analysis's own moves
// too since syncStudyBoard() no-ops unless Study is the active workspace.
onBoardUserMove(() => { syncStudyBoard(); });



let _studyMenuOpen = false;

function reportStudyIssue(): void {
  const session = reportIssue({ triggeredBy: 'study-route', route: '/study' });
  console.info('[diagnostics] report issue session', session);
}

// Flip icon codepoint — Adapted from lichess-org/lila: ui/lib/src/licon.ts
const ICON_FLIP = ''; // licon.ChasingArrows — flip board



let _studyEngineOn = false;

export function studyEngineOn(): boolean { return _studyEngineOn; }

function studyPositionContext(): EnginePositionContext | null {
  const root = detailRoot();
  const node = detailNode();
  if (!node) return null;
  if (!root) return fenOnlyPositionContext(node.fen, 'study-detail', 'missing-study-root');
  const path = detailPath();
  return contextFromNodeList(nodeListAt(root, path), 'study-detail', path);
}

function startStudyEngine(redraw: () => void): void {
  const context = studyPositionContext();
  if (!context) return;
  _studyEngineOn = true;
  setEvalPositionOverride('study-detail', context);
  setOnLiveEvalImproved(redraw);
  evalCurrentPosition();
  redraw();
}

function stopStudyEngine(redraw: () => void): void {
  _studyEngineOn = false;
  protocol.stop();
  clearEvalPositionOverride('study-detail');
  setOnLiveEvalImproved(null);
  redraw();
}

function toggleStudyEngine(redraw: () => void): void {
  if (_studyEngineOn) stopStudyEngine(redraw);
  else startStudyEngine(redraw);
}

// Called after navigation — restarts engine on the new position if it was on.
function syncStudyEngine(redraw: () => void): void {
  if (!_studyEngineOn) return;
  const context = studyPositionContext();
  if (!context) return;
  setEvalPositionOverride('study-detail', context);
  evalCurrentPosition();
}

function renderStudyEval(): VNode | null {
  if (!_studyEngineOn) return null;
  const node = detailNode();
  const ev = node ? visibleEvalForFen(node.fen) : currentEval;
  const score = formatScore(ev);
  const depth = ev.depth ?? 0;
  const ready = engineReady;
  return h('div.study-engine-bar', [
    h('span.study-engine-bar__score', score),
    h('span.study-engine-bar__depth', ready ? `depth ${depth}` : 'loading…'),
  ]);
}

// --- Board VNode (T5-D22b/c: the shared board, board/index.ts renderBoard()) ---
// Wrapped in a keyed parent whose OWN insert hook fires after the child's (Snabbdom fires insert
// hooks bottom-up: a vnode's children are created/inserted before the vnode itself is pushed onto
// the insert queue), so cgInstance already exists by the time syncStudyShapeDrawable() runs here,
// attaching Study's shape-drawing persistence without editing board/index.ts.
function renderStudyBoardArea(): VNode {
  return h('div.study-board-wrap', {
    key: 'study-board-wrap',
    hook: { insert: () => syncStudyShapeDrawable() },
  }, [renderBoard(), renderPromotionDialog()]);
}





function renderStudyActionMenu(redraw: () => void): VNode | null {
  if (!_studyMenuOpen) return null;
  const close = () => { _studyMenuOpen = false; redraw(); };

  return h('div.action-menu', [
    h('button.action-menu__close-btn', {
      attrs: { title: 'Close menu', 'aria-label': 'Close menu' },
      on:    { click: close },
    }, '×'),

    h('h2', 'Tools'),
    h('div.action-menu__tools', [
      // Flip board — mirrors lichess-org/lila: actionMenu.ts ctrl.flip() action
      h('button', {
        attrs: { 'data-icon': ICON_FLIP, title: 'Flip board' },
        on: { click: () => {
          flipStudyBoard(redraw);
          writeStudyDetailRoute();
          close();
        } },
      }, 'Flip board'),
      h('button', {
        attrs: { title: 'Report an issue with the Study page' },
        on: { click: () => { reportStudyIssue(); close(); } },
      }, 'Report issue'),
    ]),

    h('h2', 'Display'),
    h('div.action-menu__display', [
      renderToggleRow(
        'study-engine',
        'Engine',
        _studyEngineOn,
        (v) => { if (v) startStudyEngine(redraw); else stopStudyEngine(redraw); },
      ),
    ]),
  ]);
}




function renderStudyNavBar(redraw: () => void): VNode {
  const canPrev = detailPath() !== '';
  const canNext = (detailNode()?.children.length ?? 0) > 0;
  const override: MoveNavOverride = {
    canPrev,
    canNext,
    first:     () => { navigateFirst(redraw); syncStudyBoard(redraw); writeStudyDetailRoute(); },
    prev:      () => { navigatePrev(redraw); syncStudyBoard(redraw); writeStudyDetailRoute(); },
    next:      () => { navigateNext(redraw); syncStudyBoard(redraw); writeStudyDetailRoute(); },
    last:      () => { navigateLast(redraw); syncStudyBoard(redraw); writeStudyDetailRoute(); },
    // No onBook: study view has no explorer plumbing, so the book button is intentionally omitted.
    menuTitle: 'Study menu',
    menuOpen:  _studyMenuOpen,
    onMenu:    () => { _studyMenuOpen = !_studyMenuOpen; redraw(); },
  };
  return renderMoveNavBar([], override);
}


let _showBookmarksOnly = false;

function toggleBookmarkFilter(redraw: () => void): void {
  _showBookmarksOnly = !_showBookmarksOnly;
  redraw();
}

// Build a Set of bookmarked paths from the study for use in renderMoveList.
// Reads directly from studyDetail() to avoid separate prop drilling.
function bookmarkedPathsSet(): Set<string> | undefined {
  if (!_showBookmarksOnly) return undefined; // undefined = no filter, show all
  // Even in filter mode, pass the full set so icons show on bookmarked moves.
  // Filtering the tree itself is done by returning undefined nodes — out of scope here.
  // Just return an always-defined set so bookmark icons are always visible when filter is on.
  return undefined;
}

// Returns a set of all bookmarked paths for icon rendering (always active when study loaded).
function allBookmarkedPaths(): Set<string> {
  const study = studyDetail();
  return new Set(study?.bookmarks ?? []);
}


const _foldedVariations = new Set<string>();

function toggleFold(path: string, redraw: () => void): void {
  if (_foldedVariations.has(path)) _foldedVariations.delete(path);
  else _foldedVariations.add(path);
  redraw();
}


let _studyCtxPath: string | null = null;
let _studyCtxPos:  { x: number; y: number } = { x: 0, y: 0 };

function openStudyCtxMenu(path: string, e: MouseEvent, redraw: () => void): void {
  _studyCtxPath = path;
  _studyCtxPos  = { x: e.clientX, y: e.clientY };
  redraw();
}

function closeStudyCtxMenu(redraw: () => void): void {
  _studyCtxPath = null;
  redraw();
}

function renderStudyContextMenu(redraw: () => void): VNode | null {
  const path = _studyCtxPath;
  if (!path) return null;

  const root = detailRoot();
  if (!root) return null;

  // Only show the context menu on non-mainline paths (variations).
  // Main line is always accessible — only show promote/delete on side branches.
  const isMainline = (() => {
    let node = root;
    let remaining = path;
    while (remaining.length >= 2) {
      const id = remaining.slice(0, 2);
      remaining = remaining.slice(2);
      const child = node.children.find(c => c.id === id);
      if (!child) return false;
      if (node.children[0]?.id !== id) return false; // branched off mainline
      node = child;
    }
    return true;
  })();

  const items: VNode[] = [];

  if (!isMainline) {
    items.push(
      h('div.study-ctx-item', {
        on: { click: () => {
          if (_studyCtxPath && root) { promoteAt(root, _studyCtxPath, false); }
          writeStudyDetailRoute();
          closeStudyCtxMenu(redraw);
        }},
      }, 'Promote variation'),
      h('div.study-ctx-item', {
        on: { click: () => {
          if (_studyCtxPath && root) { promoteAt(root, _studyCtxPath, true); }
          writeStudyDetailRoute();
          closeStudyCtxMenu(redraw);
        }},
      }, 'Make main line'),
    );
  }

  items.push(
    h('div.study-ctx-item', {
      on: { click: () => {
        _practiceFromPath = _studyCtxPath;
        _showColorPicker  = true;
        closeStudyCtxMenu(redraw);
      }},
    }, 'Practice from here'),
    h('div.study-ctx-item.study-ctx-item--danger', {
      on: { click: () => {
        if (_studyCtxPath && root) { deleteNodeAt(root, _studyCtxPath); }
        // If deleted path is active, navigate to its parent
        const curPath = detailPath();
        if (_studyCtxPath && curPath.startsWith(_studyCtxPath)) {
          navigateTo(pathInit(_studyCtxPath), redraw);
          syncStudyBoard(redraw);
        }
        writeStudyDetailRoute();
        closeStudyCtxMenu(redraw);
      }},
    }, 'Delete from here'),
  );

  return h('div.study-ctx-overlay', {
    on: { click: () => closeStudyCtxMenu(redraw) },
  }, [
    h('div.study-ctx-menu', {
      style: { left: `${_studyCtxPos.x}px`, top: `${_studyCtxPos.y}px` },
      on: { click: (e: MouseEvent) => e.stopPropagation() },
    }, items),
  ]);
}


let _glyphQuickSelectOpen = false;
let _glyphQuickSelectKey  = '';

function renderGlyphQuickSelect(redraw: () => void): VNode {
  // Filter glyphs by which key triggered the select (! shows !-family, ? shows ?-family)
  const filtered = _glyphQuickSelectKey === '!'
    ? GLYPHS.filter(g => g.symbol.startsWith('!') || g.symbol === '=' || g.symbol.includes('+'))
    : GLYPHS.filter(g => g.symbol.includes('?'));

  return h('div.glyph-quick-select', [
    h('span.glyph-quick-select__label', 'Pick:'),
    ...filtered.map(glyph =>
      h('button.glyph-btn', {
        attrs: { title: glyph.name },
        on:    { click: () => {
          const node = detailNode();
          if (node) {
            const current = node.glyphs ?? [];
            const hasIt   = current.some(g => g.id === glyph.id);
            const updated = hasIt ? current.filter(g => g.id !== glyph.id) : [...current, glyph];
            updateCurrentNodeGlyphs(updated, redraw);
          }
          _glyphQuickSelectOpen = false;
          redraw();
        } },
      }, glyph.symbol)
    ),
    h('button.glyph-btn', {
      attrs: { title: 'Cancel', 'aria-label': 'Cancel' },
      on:    { click: () => { _glyphQuickSelectOpen = false; redraw(); } },
    }, '×'),
  ]);
}



function handleStudyKeydown(e: KeyboardEvent, redraw: () => void): void {
  if (_glyphQuickSelectOpen) {
    if (e.key === 'Escape') { _glyphQuickSelectOpen = false; redraw(); }
    return;
  }
  if (e.key === '!' || e.key === '?') {
    _glyphQuickSelectOpen = true;
    _glyphQuickSelectKey  = e.key;
    redraw();
  }
  // Nav keys
  if (e.key === 'ArrowLeft')  { navigatePrev(redraw); syncStudyBoard(redraw); writeStudyDetailRoute(); }
  if (e.key === 'ArrowRight') { navigateNext(redraw); syncStudyBoard(redraw); writeStudyDetailRoute(); }
}



function loadPracticeLinesForStudy(studyId: string, redraw: () => void): void {
  if (_practiceLinesStudyId === studyId && _practiceLinesLoaded) return;
  _practiceLinesStudyId = studyId;
  _practiceLinesLoaded  = false;
  void listPracticeLines(studyId).then(lines => {
    _practiceLines      = lines;
    _practiceLinesLoaded = true;
    redraw();
  });
}

function renderPracticeLinesPanel(studyId: string, redraw: () => void): VNode {
  if (!_practiceLinesLoaded) return h('div.study-practice-lines', 'Loading practice lines…');
  if (_practiceLines.length === 0) return h('div.study-practice-lines.study-practice-lines--empty', 'No practice lines. Click "Practice this line" to create one.');

  const pMap = progressMap();

  return h('div.study-practice-lines', [
    h('div.study-practice-lines__title', 'Practice Lines'),
    h('ul.study-practice-lines__list',
      _practiceLines.map(line => {
        const dueForLine = countDuePositions([line], pMap);
        const isRenaming = _renamingLineId === line.id;
        return h('li.study-practice-line', { key: line.id }, [
          isRenaming
            ? h('input.study-practice-line__rename', {
                attrs: { value: _renamingLineValue },
                hook: { insert: (vn) => (vn.elm as HTMLInputElement).focus() },
                on: {
                  input:   (e: Event) => { _renamingLineValue = (e.target as HTMLInputElement).value; },
                  blur:    () => {
                    const newLabel = _renamingLineValue.trim() || line.label;
                    void savePracticeLine({ ...line, label: newLabel }).then(() => {
                      _practiceLines = _practiceLines.map(l => l.id === line.id ? { ...l, label: newLabel } : l);
                      _renamingLineId    = null;
                      _renamingLineValue = '';
                      redraw();
                    });
                  },
                  keydown: (e: KeyboardEvent) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') { _renamingLineId = null; redraw(); }
                  },
                },
              })
            : h('span.study-practice-line__label', {
                on: { dblclick: () => { _renamingLineId = line.id; _renamingLineValue = line.label; redraw(); } },
              }, line.label),
          h('span.study-practice-line__color', line.trainAs === 'white' ? '♙' : '♟'),
          h('span.study-practice-line__status', {
            class: { 'study-practice-line__status--paused': line.status === 'paused' },
          }, line.status === 'active' ? '●' : '⏸'),
          h('span.study-practice-line__count', `${line.sans.length} moves`),
          dueForLine > 0
            ? h('span.study-practice-line__due', `${dueForLine} due`)
            : null,
          h('div.study-practice-line__actions', [
            h('button.study-practice-line__btn', {
              attrs: { title: 'Practice now', 'aria-label': 'Practice now' },
              on: { click: () => {
                initDrillView([line], line.fens[0] ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', line.trainAs, redraw);
                redraw();
              }},
            }, '▶'),
            h('button.study-practice-line__btn', {
              attrs: {
                title: line.status === 'active' ? 'Pause' : 'Resume',
                'aria-label': line.status === 'active' ? 'Pause' : 'Resume',
              },
              on: { click: () => {
                const newStatus = line.status === 'active' ? 'paused' : 'active';
                void savePracticeLine({ ...line, status: newStatus }).then(() => {
                  _practiceLines = _practiceLines.map(l => l.id === line.id ? { ...l, status: newStatus } : l);
                  redraw();
                });
              }},
            }, line.status === 'active' ? '⏸' : '▶▶'),
            h('button.study-practice-line__btn.study-practice-line__btn--danger', {
              attrs: { title: 'Delete practice line', 'aria-label': 'Delete practice line' },
              on: { click: () => {
                void deletePracticeLine(line.id).then(() => {
                  _practiceLines = _practiceLines.filter(l => l.id !== line.id);
                  redraw();
                });
              }},
            }, '✕'),
          ]),
        ]);
      }),
    ),
  ]);
}




function renderColorPicker(title: string, root: import('../tree/types').TreeNode, redraw: () => void): VNode {
  const currentPath = detailPath();
  const fromPath    = _practiceFromPath; // set by "Practice from here", null for "Practice this line"

  const launch = (color: 'white' | 'black') => {
    _showColorPicker  = false;
    _practiceFromPath = null;
    const seqId  = `${title}_${color}_${Date.now()}`;
    let seq;
    let startFen: string;

    if (fromPath) {
      // "Practice from here" — extract from the context-menu path.
      seq      = extractFromPath(root, fromPath, title, `${title} (from move)`, color, seqId);
      startFen = getNodeAtPath(root, fromPath)?.fen ?? root.fen;
    } else if (_practiceScope === 'current' && currentPath) {
      seq      = extractFromPath(root, currentPath, title, `${title} (from current)`, color, seqId);
      startFen = getNodeAtPath(root, currentPath)?.fen ?? root.fen;
    } else if (_practiceScope === 'variation' && currentPath) {
      seq      = extractFromVariationPath(root, currentPath, title, `${title} (variation)`, color, seqId);
      startFen = root.fen;
    } else {
      // Full game — mainline from root.
      seq      = extractMainline(root, title, title, color, seqId);
      startFen = root.fen;
    }

    if (!seq) { redraw(); return; }
    initDrillView([seq], startFen, color, redraw);
    redraw();
  };

  // Scope buttons only shown when triggered from "Practice this line" (not from context menu).
  const showScopeSelector = !fromPath;
  const hasCurrentPath    = currentPath.length > 0;

  return h('div.study-color-picker-overlay', {
    on: { click: (e: Event) => { if (e.target === e.currentTarget) { _showColorPicker = false; _practiceFromPath = null; redraw(); } } },
  }, [
    h('div.study-color-picker', [
      showScopeSelector
        ? h('div.study-scope-selector', [
            h('div.study-scope-selector__title', 'Scope'),
            h('div.study-scope-selector__options', [
              h('button.study-scope-btn', {
                class: { 'study-scope-btn--active': _practiceScope === 'full' },
                on: { click: () => { _practiceScope = 'full'; redraw(); } },
              }, 'Full game'),
              hasCurrentPath
                ? h('button.study-scope-btn', {
                    class: { 'study-scope-btn--active': _practiceScope === 'current' },
                    on: { click: () => { _practiceScope = 'current'; redraw(); } },
                  }, 'From current position')
                : null,
              hasCurrentPath
                ? h('button.study-scope-btn', {
                    class: { 'study-scope-btn--active': _practiceScope === 'variation' },
                    on: { click: () => { _practiceScope = 'variation'; redraw(); } },
                  }, 'Selected variation')
                : null,
            ]),
          ])
        : null,
      h('div.study-color-picker__title', 'Practice as…'),
      h('div.study-color-picker__buttons', [
        h('button.study-color-picker__btn.study-color-picker__btn--white', {
          on: { click: () => launch('white') },
        }, '♙ White'),
        h('button.study-color-picker__btn.study-color-picker__btn--black', {
          on: { click: () => launch('black') },
        }, '♟ Black'),
      ]),
      h('button.study-color-picker__cancel', {
        on: { click: () => { _showColorPicker = false; _practiceFromPath = null; redraw(); } },
      }, 'Cancel'),
    ]),
  ]);
}

// --- Detail view entry point ---
export function renderStudyDetail(id: string, redraw: () => void, routeQuery = ''): VNode {
  _studyRedraw = redraw;



















  const routeKey = `${id}?${routeQuery}`;
  syncToolsStateFromRoute(routeKey, routeQuery);
  const hydrationQuery = coreRouteQuery(routeQuery);
  const hydrationKey = `${id}?${hydrationQuery}`;
  if (coreLoadRouteKey(detailLoadRouteKey()) !== hydrationKey) {
    hydrateStudyDetailRoute(id, routeQuery, redraw);
  }
  if (!detailLoaded()) {
    return h('div.study-detail', h('div.study-detail__loading', 'Loading…'));
  }


  loadPracticeLinesForStudy(id, redraw);

  const study = studyDetail();
  if (!study) {





    return h('div.study-detail', [
      h('div.study-detail__empty', 'Study not found.'),
    ]);
  }

  const root = detailRoot();
  const path = detailPath();


  if (isDrillActive() || isDrillSummary()) {
    return h('div.study-detail', [
      h('div.study-detail__header', [
        h('button.study-back', {
          on: { click: () => { endDrill(); _showColorPicker = false; redraw(); } },
        }, '← Library'),
        h('h1.study-detail__title', study.title),
      ]),
      renderDrillView(redraw),
    ]);
  }

  return h('div.study-detail', [




    h('div.study-detail__header', [
      h('h1.study-detail__title', study.title),

      h('div.study-header-actions', [
        h('button.study-btn', {
          attrs: { title: 'Copy PGN to clipboard' },
          on: { click: () => {
            const pgn = buildStudyPgn();
            void navigator.clipboard.writeText(pgn).then(() => redraw());
          }},
        }, 'Copy PGN'),
        h('button.study-btn', {
          attrs: { title: 'Download PGN file' },
          on: { click: () => {
            const pgn  = buildStudyPgn();
            const blob = new Blob([pgn], { type: 'application/x-chess-pgn' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = `${study.title.replace(/[^a-z0-9]/gi, '_')}.pgn`;
            a.click();
            URL.revokeObjectURL(url);
          }},
        }, 'Download PGN'),
        root
          ? h('button.study-btn.study-btn--practice', {
              attrs: { title: 'Practice this line' },
              on: { click: () => { _showColorPicker = true; redraw(); } },
            }, 'Practice this line')
          : null,
      ]),
    ]),

    _showColorPicker ? renderColorPicker(study.title, root!, redraw) : null,


    renderStudyContextMenu(redraw),

    // Main layout: board column + tools column
    h('div.study-detail__layout', [
      // Board column — keyboard handlers for glyph quick-select and nav
      h('div.study-detail__board-col', {
        attrs: { tabindex: '0' },
        on:    { keydown: (e: KeyboardEvent) => handleStudyKeydown(e, redraw) },
      }, [
        renderStudyBoardArea(),
        renderStudyNavBar(redraw),
        renderManualReviewToggle(redraw),
        renderStudyEval(),
        _glyphQuickSelectOpen ? renderGlyphQuickSelect(redraw) : null,
      ]),

      // Tools column: move list + annotation panel
      h('div.study-detail__tools-col', [
        // Study action menu overlay — must be first child so position:absolute covers the column.
        // Mirrors the pattern in openings/view.ts renderOpeningsActionMenu placement.
        renderStudyActionMenu(redraw),
        // Bookmark filter toggle
        h('div.study-tools-bar', [
          h('button.study-btn', {
            class: { 'study-btn--active': _showBookmarksOnly },
            attrs: { title: _showBookmarksOnly ? 'Show all moves' : 'Show bookmarked only' },
            on:    { click: () => toggleBookmarkFilter(redraw) },
          }, _showBookmarksOnly ? '★ Bookmarks' : '☆ Bookmarks'),
          isBookmarked(path)
            ? h('span.study-bookmark-indicator', { attrs: { title: 'Current position is bookmarked' } }, '★')
            : null,
        ]),
        root
          ? renderMoveList(
              root,
              path,
              () => undefined,        // no eval lookup in study view
              (p) => { navigateTo(p, redraw); syncStudyBoard(redraw); writeStudyDetailRoute(); },
              null,                   // no user color
              false,
              (p) => {
                deleteNodeAt(root, p);
                const cur = detailPath();
                if (cur.startsWith(p)) {
                  navigateTo(pathInit(p), redraw);
                  syncStudyBoard(redraw);
                } else {
                  redraw();
                }
                writeStudyDetailRoute();
              },
              _studyCtxPath,
              (p, e) => openStudyCtxMenu(p, e, redraw),
              undefined,
              _foldedVariations,
              (p) => toggleFold(p, redraw),
              allBookmarkedPaths(),
              (p) => { toggleBookmark(p, redraw); },
            )
          : h('div.study-detail__empty', 'No moves.'),
        renderGlyphToolbar(redraw),
        renderCommentPanel(redraw),
        renderPracticeLinesPanel(id, redraw),
      ]),
    ]),
  ]);
}
