// Study Detail view — annotation workspace with standalone board, move list, and nav controls.
// Creates its own Chessground instance independent of src/board/index.ts and AnalyseCtrl.
// Adapted from lichess-org/lila: ui/study/src/studyBoard.ts + ui/analyse/src/ground.ts patterns.
// Phase 3 Task 3.1 (CCP-533).

import { Chessground as makeChessground } from '@lichess-org/chessground';
import type { Api as CgApi } from '@lichess-org/chessground/api';
import type { DrawShape } from '@lichess-org/chessground/draw';
import { uciToMove } from '@lichess-org/chessground/util';
import { Chess } from 'chessops/chess';
import { chessgroundDests } from 'chessops/compat';
import { parseFen } from 'chessops/fen';
import { makeSanAndPlay } from 'chessops/san';
import { parseUci } from 'chessops/util';
import { h, type VNode } from 'snabbdom';
import type { Key } from '@lichess-org/chessground/types';
import { renderMoveList } from '../analyse/moveList';
import { formatScore } from '../analyse/evalView';
import { renderCommentPanel, renderGlyphToolbar, GLYPHS } from './annotationView';
import { updateCurrentNodeGlyphs, updateCurrentNodeShapes, toggleBookmark, isBookmarked, buildStudyPgn } from './studyDetailCtrl';
import {
  protocol, currentEval, engineReady,
  setEvalFenOverride, evalCurrentPosition, setOnLiveEvalImproved,
} from '../engine/ctrl';
import { listPracticeLines, savePracticeLine, deletePracticeLine } from './studyDb';
import { progressMap } from './studyCtrl';
import { countDuePositions } from './practice/sessionBuilder';
import type { TrainableSequence } from './types';
import { deleteNodeAt, promoteAt, pathInit } from '../tree/ops';
import {
  studyDetail, detailRoot, detailPath, detailNode, detailLoaded, detailOrientation,
  loadStudyDetail, navigateTo, navigateFirst, navigateLast, navigatePrev, navigateNext,
  handleStudyMove, flipStudyBoard, setCgRef, getCgRef,
} from './studyDetailCtrl';
import { isDrillActive, isDrillSummary, initDrillView, renderDrillView, endDrill } from './practice/drillView';
import { extractMainline, extractFromPath, getNodeAtPath, extractFromVariationPath } from './practice/extractLine';

// --- Practice entry point state (CCP-552, CCP-558, CCP-560) ---
let _showColorPicker   = false;
let _practiceFromPath: string | null  = null; // CCP-558: "Practice from here" path
let _practiceScope:   'full' | 'current' | 'variation' = 'full'; // CCP-560

// --- Practice Lines panel state (CCP-559) ---
let _practiceLines:        TrainableSequence[]  = [];
let _practiceLinesLoaded   = false;
let _practiceLinesStudyId: string | null        = null;
let _renamingLineId:       string | null        = null;
let _renamingLineValue     = '';

// --- Standalone dests cache (mirrors src/board/index.ts cachedDests) ---
const _destsCache = new Map<string, Map<Key, Key[]>>();

function computeStudyDests(fen: string): Map<Key, Key[]> {
  const cached = _destsCache.get(fen);
  if (cached) return cached;
  try {
    const setup = parseFen(fen).unwrap();
    const pos   = Chess.fromSetup(setup).unwrap();
    const dests = chessgroundDests(pos) as Map<Key, Key[]>;
    _destsCache.set(fen, dests);
    return dests;
  } catch {
    return new Map();
  }
}

// --- Move handler (study move = always creates/navigates variation) ---
// Defined at module scope so it survives the insert hook closure.
let _studyRedraw: () => void = () => {};

function onStudyMove(orig: string, dest: string): void {
  const node = detailNode();
  if (!node) return;
  try {
    const setup = parseFen(node.fen).unwrap();
    const pos   = Chess.fromSetup(setup).unwrap();
    const move  = parseUci(`${orig}${dest}`);
    if (!move) return;
    const san    = makeSanAndPlay(pos, move);
    const newFen = pos.toString(); // after play
    const uci    = `${orig}${dest}`;
    handleStudyMove(uci, san, newFen, _studyRedraw);
    syncStudyBoard(_studyRedraw);
  } catch (e) {
    console.warn('[studyDetailView] move error', e);
  }
}

// --- Board sync ---
export function syncStudyBoard(redraw?: () => void): void {
  if (redraw) syncStudyEngine(redraw);
  const cg = getCgRef();
  if (!cg) return;
  const node = detailNode();
  if (!node) return;
  const dests    = computeStudyDests(node.fen);
  const lastMove = uciToMove(node.uci);
  // Restore user-drawn shapes from the node — clear when none saved.
  // Adapted from lichess-org/lila: ui/analyse/src/study/studyCtrl.ts setNode
  const shapes: DrawShape[] = (node.shapes ?? []).map(s =>
    s.dest
      ? { orig: s.orig as DrawShape['orig'], dest: s.dest as NonNullable<DrawShape['dest']>, brush: s.brush ?? 'green' }
      : { orig: s.orig as DrawShape['orig'], brush: s.brush ?? 'green' }
  );
  cg.set({
    fen:       node.fen,
    turnColor: node.ply % 2 === 0 ? 'white' : 'black',
    movable: {
      color: node.ply % 2 === 0 ? 'white' : 'black',
      dests,
    },
    drawable: { shapes },
    ...(lastMove ? { lastMove } : {}),
  });
}

// --- Study engine state (CCP-539) ---
// Mirrors lichess-org/lila: ui/analyse/src/study/studyCtrl.ts toggleCeval pattern.
let _studyEngineOn = false;

export function studyEngineOn(): boolean { return _studyEngineOn; }

function startStudyEngine(redraw: () => void): void {
  const node = detailNode();
  if (!node) return;
  _studyEngineOn = true;
  setEvalFenOverride(node.fen);
  setOnLiveEvalImproved(redraw);
  evalCurrentPosition();
  redraw();
}

function stopStudyEngine(redraw: () => void): void {
  _studyEngineOn = false;
  protocol.stop();
  setEvalFenOverride(null);
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
  const node = detailNode();
  if (!node) return;
  setEvalFenOverride(node.fen);
  evalCurrentPosition();
}

function renderStudyEval(): VNode | null {
  if (!_studyEngineOn) return null;
  const ev = currentEval;
  const score = formatScore(ev);
  const depth = ev.depth ?? 0;
  const ready = engineReady;
  return h('div.study-engine-bar', [
    h('span.study-engine-bar__score', score),
    h('span.study-engine-bar__depth', ready ? `depth ${depth}` : 'loading…'),
  ]);
}

// --- Board VNode (standalone Chessground, own lifecycle) ---
function renderStudyBoard(): VNode {
  return h('div.cg-wrap', {
    key: 'study-board',
    hook: {
      insert: (vnode) => {
        const node = detailNode();
        if (!node) return;
        const dests    = computeStudyDests(node.fen);
        const lastMove = uciToMove(node.uci);
        // drawable.onChange: save user-drawn shapes onto the current tree node.
        // Adapted from lichess-org/lila: ui/analyse/src/study/studyCtrl.ts mutateCgConfig
        const onShapesChange = (cgShapes: DrawShape[]): void => {
          const converted = cgShapes.map(s => ({
            orig:  s.orig as string,
            ...(s.dest  ? { dest:  s.dest  as string } : {}),
            ...(s.brush ? { brush: s.brush            } : {}),
          }));
          updateCurrentNodeShapes(converted, _studyRedraw);
        };

        const cg: CgApi = makeChessground(vnode.elm as HTMLElement, {
          orientation:  detailOrientation(),
          viewOnly:     false,
          drawable:     { enabled: true, onChange: onShapesChange },
          fen:          node.fen,
          turnColor:    node.ply % 2 === 0 ? 'white' : 'black',
          movable: {
            free:      false,
            color:     node.ply % 2 === 0 ? 'white' : 'black',
            dests,
            showDests: true,
          },
          events: { move: onStudyMove },
          ...(lastMove ? { lastMove } : {}),
        });
        setCgRef(cg);
      },
      destroy: () => {
        getCgRef()?.destroy();
        setCgRef(undefined as unknown as CgApi);
      },
    },
  });
}

// --- Move nav bar ---
function renderStudyNavBar(redraw: () => void): VNode {
  return h('div.study-nav-bar', [
    h('button.study-nav-btn', {
      attrs: { title: 'First move' },
      on:   { click: () => { navigateFirst(redraw); syncStudyBoard(redraw); } },
    }, '|←'),
    h('button.study-nav-btn', {
      attrs: { title: 'Previous move' },
      on:   { click: () => { navigatePrev(redraw); syncStudyBoard(redraw); } },
    }, '←'),
    h('button.study-nav-btn', {
      attrs: { title: 'Next move' },
      on:   { click: () => { navigateNext(redraw); syncStudyBoard(redraw); } },
    }, '→'),
    h('button.study-nav-btn', {
      attrs: { title: 'Last move' },
      on:   { click: () => { navigateLast(redraw); syncStudyBoard(redraw); } },
    }, '→|'),
    h('button.study-nav-btn', {
      attrs: { title: 'Flip board' },
      on:   { click: () => flipStudyBoard(redraw) },
    }, '⇅'),
    h('button.study-nav-btn', {
      class: { 'study-nav-btn--active': _studyEngineOn },
      attrs: { title: _studyEngineOn ? 'Stop engine' : 'Start engine' },
      on:   { click: () => toggleStudyEngine(redraw) },
    }, '⚙'),
  ]);
}

// --- Bookmark filter state (CCP-540) ---
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

// --- Variation fold state (CCP-537) — ephemeral, keyed by first-variant path ---
const _foldedVariations = new Set<string>();

function toggleFold(path: string, redraw: () => void): void {
  if (_foldedVariations.has(path)) _foldedVariations.delete(path);
  else _foldedVariations.add(path);
  redraw();
}

// --- Variation context menu state (CCP-536) ---
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
          closeStudyCtxMenu(redraw);
        }},
      }, 'Promote variation'),
      h('div.study-ctx-item', {
        on: { click: () => {
          if (_studyCtxPath && root) { promoteAt(root, _studyCtxPath, true); }
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

// --- Glyph quick-select state (CCP-535) ---
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
      attrs: { title: 'Cancel' },
      on:    { click: () => { _glyphQuickSelectOpen = false; redraw(); } },
    }, '×'),
  ]);
}

// Keyboard handler for glyph quick-select (CCP-535).
// Fires when the board area is focused and user types ! or ?.
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
  if (e.key === 'ArrowLeft')  { navigatePrev(redraw); syncStudyBoard(redraw); }
  if (e.key === 'ArrowRight') { navigateNext(redraw); syncStudyBoard(redraw); }
}

// --- Practice Lines panel (CCP-559) ---

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
              attrs: { title: 'Practice now' },
              on: { click: () => {
                initDrillView([line], line.fens[0] ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', line.trainAs, redraw);
                redraw();
              }},
            }, '▶'),
            h('button.study-practice-line__btn', {
              attrs: { title: line.status === 'active' ? 'Pause' : 'Resume' },
              on: { click: () => {
                const newStatus = line.status === 'active' ? 'paused' : 'active';
                void savePracticeLine({ ...line, status: newStatus }).then(() => {
                  _practiceLines = _practiceLines.map(l => l.id === line.id ? { ...l, status: newStatus } : l);
                  redraw();
                });
              }},
            }, line.status === 'active' ? '⏸' : '▶▶'),
            h('button.study-practice-line__btn.study-practice-line__btn--danger', {
              attrs: { title: 'Delete' },
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

// --- Color picker overlay (CCP-552) ---
// Shown when user clicks "Practice this line". Two buttons: White / Black.
// On selection, extracts mainline and launches drill.
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
export function renderStudyDetail(id: string, redraw: () => void): VNode {
  _studyRedraw = redraw;

  if (!detailLoaded() || studyDetail()?.id !== id) {
    loadStudyDetail(id, redraw);
    return h('div.study-detail', h('div.study-detail__loading', 'Loading…'));
  }

  // Lazily load practice lines for this study (CCP-559).
  loadPracticeLinesForStudy(id, redraw);

  const study = studyDetail();
  if (!study) {
    return h('div.study-detail', [
      h('a.study-back', { attrs: { href: '#/study' } }, '← Library'),
      h('div.study-detail__empty', 'Study not found.'),
    ]);
  }

  const root = detailRoot();
  const path = detailPath();

  // Drill mode active: render drill view instead of annotation workspace (CCP-552).
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
    // Header
    h('div.study-detail__header', [
      h('a.study-back', { attrs: { href: '#/study' } }, '← Library'),
      h('h1.study-detail__title', study.title),
      // Copy / Download PGN (CCP-541) + Practice this line (CCP-552)
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
    // Color picker overlay (CCP-552)
    _showColorPicker ? renderColorPicker(study.title, root!, redraw) : null,

    // Variation context menu overlay (CCP-536)
    renderStudyContextMenu(redraw),

    // Main layout: board column + tools column
    h('div.study-detail__layout', [
      // Board column — keyboard handlers for glyph quick-select and nav
      h('div.study-detail__board-col', {
        attrs: { tabindex: '0' },
        on:    { keydown: (e: KeyboardEvent) => handleStudyKeydown(e, redraw) },
      }, [
        renderStudyBoard(),
        renderStudyNavBar(redraw),
        renderStudyEval(),
        _glyphQuickSelectOpen ? renderGlyphQuickSelect(redraw) : null,
      ]),

      // Tools column: move list + annotation panel
      h('div.study-detail__tools-col', [
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
              (p) => { navigateTo(p, redraw); syncStudyBoard(redraw); },
              null,                   // no user color
              false,
              (p) => { deleteNodeAt(root, p); const cur = detailPath(); if (cur.startsWith(p)) { navigateTo(pathInit(p), redraw); syncStudyBoard(redraw); } else { redraw(); } },
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

