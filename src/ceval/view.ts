// Engine lines panel: toggle header, PV lines box, PV board preview, engine settings.
// Mirrors lichess-org/lila: ui/lib/src/ceval/view/main.ts, ui/lib/src/ceval/view/settings.ts

import { Chessground as makeChessground } from '@lichess-org/chessground';
import type { Config } from '@lichess-org/chessground/config';
import type { Key } from '@lichess-org/chessground/types';
import { uciToMove } from '@lichess-org/chessground/util';
import { Chess } from 'chessops/chess';
import { scalachessCharPair } from 'chessops/compat';
import { makeFen, parseFen } from 'chessops/fen';
import { makeSanAndPlay } from 'chessops/san';
import { makeUci, parseUci } from 'chessops/util';
import { h, type VNode } from 'snabbdom';
import type { AnalyseCtrl } from '../analyse/ctrl';
import {
  protocol,
  currentEval, resetCurrentEval,
  engineEnabled, engineReady,
  multiPv, setMultiPv,
  analysisDepth, setAnalysisDepth,
  searchTime, setSearchTime,
  searchUntilDepth, setSearchUntilDepth,
  isEngineSearching, getSearchProgress,
  clearPendingLines,
  showEngineArrows, setShowEngineArrows,
  arrowAllLines, setArrowAllLines,
  showPlayedArrow, setShowPlayedArrow,
  showArrowLabels, setShowArrowLabels,
  showReviewLabels, setShowReviewLabels,
  showBoardReviewGlyphs, setShowBoardReviewGlyphs,
  arrowLabelSize, setArrowLabelSize,
  syncArrow, toggleEngine, evalCurrentPosition,
  setEvalFenOverride,
  type EvalLine, type PositionEval,
} from '../engine/ctrl';
import {
  batchAnalyzing, batchDone, batchQueue,
  reviewDepth, setReviewDepth,
} from '../engine/batch';
import { formatScore } from '../analyse/evalView';
import { orientation } from '../board/index';
import { addNode } from '../tree/ops';
import type { TreeNode } from '../tree/types';

// --- Injected deps ---

let _getCtrl:  () => AnalyseCtrl = () => { throw new Error('cevalView not initialised'); };
let _navigate: (path: string) => void = () => {};
let _redraw:   () => void = () => {};

/** Optional FEN override — bypasses _getCtrl().node.fen in ceval UI and engine eval. */
let _fenOverride: string | null = null;
export function setCevalFenOverride(fen: string | null): void {
  _fenOverride = fen;
  setEvalFenOverride(fen); // keep engine/ctrl in sync
}

export function initCevalView(deps: {
  getCtrl:  () => AnalyseCtrl;
  navigate: (path: string) => void;
  redraw:   () => void;
}): void {
  _getCtrl  = deps.getCtrl;
  _navigate = deps.navigate;
  _redraw   = deps.redraw;
}

// --- Module state ---

let showEngineSettings = false;
let pvBoard: { fen: string; uci: string } | null = null;
let pvBoardPos: { x: number; y: number } = { x: 0, y: 0 };
const PV_BOARD_SIZE = 384;
const PV_BOARD_OFFSET = 16;

// --- renderCeval ---

/**
 * Engine header — toggle, large eval (pearl), engine name/status, settings gear.
 * Mirrors lichess-org/lila: ui/lib/src/ceval/view/main.ts renderCeval()
 * Layout: div.ceval flex row: .cmn-toggle | pearl | div.engine | button.settings-gear
 * CSS reference: ui/lib/css/ceval/_ctrl.scss
 */
export function renderCeval(): VNode {
  const hasEval  = currentEval.cp !== undefined || currentEval.mate !== undefined;
  const pearlStr = engineEnabled
    ? (hasEval ? formatScore(currentEval) : (engineReady ? '…' : ''))
    : '';

  const engineLabel = protocol.engineName ?? 'Stockfish 18';
  const statusText  = !engineEnabled
    ? 'Local analysis'
    : !engineReady
      ? 'Loading…'
      : batchAnalyzing
        ? `Reviewing ${batchDone}/${batchQueue.length}…`
        : 'Engine on';

  // Thin bar along the top of the ceval panel.
  // Progress bar along the top: fills left-to-right while searching, stays solid at 100% when done.
  // Width tracks whichever of depth-fraction or time-fraction is further along.
  const evalDone = engineEnabled && engineReady &&
    !isEngineSearching() && currentEval.depth !== undefined;
  const progressPct = evalDone ? 100 : Math.round(getSearchProgress() * 100);
  const progressBar = engineEnabled && engineReady
    ? h('div.ceval__progress', [
        h('div.ceval__progress-fill', {
          class: { 'ceval__progress-fill--done': evalDone },
          attrs: { style: `width:${progressPct}%` },
        }),
      ])
    : null;

  return h('div.ceval', { class: { enabled: engineEnabled } }, [
    progressBar,
    // Toggle — mirrors .cmn-toggle (flex: 0 0 40px)
    h('button.cmn-toggle', {
      class: { active: engineEnabled },
      attrs: { title: 'Toggle analysis engine (L)' },
      on: { click: toggleEngine },
    }, engineEnabled ? 'On' : 'Off'),

    // Pearl — large eval number (flex: 1 0 auto, font-size: 1.6em, bold)
    // Mirrors lichess-org/lila: ui/lib/src/ceval/view/main.ts pearl element
    h('pearl', { class: { 'ceval__ko': currentEval.mate === 0 } }, pearlStr),

    // Engine name + status info (flex: 2 1 auto, small text)
    h('div.engine', [
      engineLabel,
      h('span.info', statusText),
    ]),

    // Settings gear — mirrors button.settings-gear positioning
    h('button.settings-gear', {
      class: { active: showEngineSettings },
      attrs: { title: 'Engine settings' },
      on: { click: (e: Event) => { e.stopPropagation(); showEngineSettings = !showEngineSettings; _redraw(); } },
    }, '⚙'),
  ]);
}

// --- PV rendering ---

/**
 * Render a PV move sequence as SAN spans with move-number prefixes.
 * Mirrors lichess-org/lila: ui/lib/src/ceval/view/main.ts renderPvMoves
 */
function renderPvMoves(fen: string, moves: string[]): { first: VNode[]; rest: VNode[] } {
  const MAX_PV_MOVES = 12;
  try {
    const setup = parseFen(fen).unwrap();
    const pos = Chess.fromSetup(setup).unwrap();
    const first: VNode[] = [];
    const rest: VNode[] = [];
    let firstMoveDone = false;
    for (let i = 0; i < Math.min(moves.length, MAX_PV_MOVES); i++) {
      const numNode = (pos.turn === 'white')
        ? h('span.pv-num', `${pos.fullmoves}.`)
        : (i === 0 ? h('span.pv-num', `${pos.fullmoves}…`) : null);
      const uci = moves[i]!;
      const move = parseUci(uci);
      if (!move) break;
      const san = makeSanAndPlay(pos, move);
      if (san === '--') break;
      // Store FEN + UCI on each move so hover can preview the resulting position.
      // Adapted from lichess-org/lila: ui/lib/src/ceval/view/main.ts renderPvMoves
      const boardFen = makeFen(pos.toSetup());
      const sanNode = h('span.pv-san', { key: `${i}|${uci}`, attrs: { 'data-board': `${boardFen}|${uci}` } }, san);
      if (!firstMoveDone) {
        if (numNode) first.push(numNode);
        first.push(sanNode);
        firstMoveDone = true;
      } else {
        if (numNode) rest.push(numNode);
        rest.push(sanNode);
      }
    }
    return { first, rest };
  } catch {
    return { first: [], rest: [] };
  }
}

/**
 * Walk from the current node through a UCI sequence, following existing
 * tree children when possible and creating new variation nodes otherwise.
 * Navigates to the resulting position using the standard pipeline.
 * Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts playUciList / playUci
 */
function playPvUciList(ucis: string[]): void {
  if (_fenOverride) return; // In puzzle mode, PV click-to-navigate is not supported
  const ctrl = _getCtrl();
  let path = ctrl.path;
  let node = ctrl.node;
  for (const uci of ucis) {
    const existing = node.children.find(c => c.uci === uci);
    if (existing) {
      path += existing.id;
      node = existing;
      continue;
    }
    const move = parseUci(uci);
    if (!move) break;
    try {
      const setup = parseFen(node.fen).unwrap();
      const pos = Chess.fromSetup(setup).unwrap();
      const san = makeSanAndPlay(pos, move);
      if (san === '--') break;
      const newNode: TreeNode = {
        id: scalachessCharPair(move),
        ply: node.ply + 1,
        san,
        uci: makeUci(move),
        fen: makeFen(pos.toSetup()),
        children: [],
      };
      addNode(ctrl.root, path, newNode);
      path += newNode.id;
      node = newNode;
    } catch {
      break;
    }
  }
  _navigate(path);
}

/**
 * Render the PV lines box — always exactly multiPv slots, populated as data arrives.
 * Empty slots render as placeholders so the panel height stays stable.
 * Mirrors lichess-org/lila: ui/lib/src/ceval/view/main.ts renderPvs — key line:
 *   [...Array(multiPv).keys()].map(i => renderPv(threat, multiPv, pvs[i], pos))
 * Mirrors lichess-org/lila: ui/lib/src/ceval/view/main.ts renderPvs + renderPv
 */
export function renderPvBox(): VNode | null {
  if (!engineEnabled) return null;

  const fen = _fenOverride ?? _getCtrl().node.fen;

  function pvRowForSlot(slotIdx: number): VNode {
    // Slot 0 = primary line (currentEval); slots 1+ = secondary lines (currentEval.lines[i-1])
    const ev: PositionEval | EvalLine | undefined =
      slotIdx === 0
        ? (currentEval.cp !== undefined || currentEval.mate !== undefined || currentEval.moves?.length
            ? currentEval : undefined)
        : currentEval.lines?.[slotIdx - 1];

    if (!ev) {
      // Empty placeholder — fixed 2em height so panel never jumps as lines arrive.
      // Mirrors lichess-org/lila: renderPv with undefined pv → empty div.pv.pv--nowrap
      if (slotIdx === 0) {
        const statusText = !engineReady
          ? 'Loading engine…'
          : batchAnalyzing
            ? `Reviewing ${batchDone}/${batchQueue.length}…`
            : '…';
        return h('div.pv.pv--nowrap', [h('span.ceval__info', statusText)]);
      }
      return h('div.pv.pv--nowrap.pv--empty');
    }

    const score = formatScore(ev);
    const isKo = ev.mate === 0;
    const isPositive = ev.cp !== undefined ? ev.cp > 0 : ev.mate !== undefined ? ev.mate > 0 : null;
    const { first, rest } = ev.moves ? renderPvMoves(fen, ev.moves) : { first: [], rest: [] };

    // "Massive improvement" — engine found a line with ≥ 2-pawn advantage for the side to move,
    // or a forced mate. Threshold 200cp matches a decisive material/positional advantage.
    // Adapted from lichess-org/lila: ui/lib/src/ceval/view/main.ts (brilliant-move threshold concept)
    const stm = fen.split(' ')[1]; // 'w' or 'b'
    const cpStm = ev.cp !== undefined ? (stm === 'w' ? ev.cp : -ev.cp) : undefined;
    const isMassive = (cpStm !== undefined && cpStm > 200)
      || (ev.mate !== undefined && ((stm === 'w' && ev.mate > 0) || (stm === 'b' && ev.mate < 0)));

    const children: (VNode | null)[] = [];
    children.push(h('strong', {
      class: {
        'pv__score--white':   isPositive === true,
        'pv__score--black':   isPositive === false,
        'pv__score--ko':      isKo,
        'pv__score--massive': isMassive,
      },
    }, score));
    if (first.length > 0) children.push(h('span.pv-first', first));
    if (rest.length  > 0) children.push(h('span.pv-cont',  rest));

    // div.pv.pv--nowrap: single-line truncated row, 2em height, matching Lichess row structure.
    // Mirrors lichess-org/lila: ui/lib/src/ceval/view/main.ts renderPv → div.pv.pv--nowrap
    return h('div.pv.pv--nowrap', children);
  }

  // Always render exactly multiPv slots regardless of how many have data.
  const slots = [...Array(multiPv).keys()].map(i => pvRowForSlot(i));

  // Attach hover/click listeners once on insert via event delegation.
  // Stable key 'pv-rows' ensures the element is not recreated between renders —
  // listeners stay attached and new slots are patched in place.
  // Adapted from lichess-org/lila: ui/lib/src/ceval/view/main.ts renderPvs hook
  return h('div.pv_box', {
    key: 'pv-rows',
    hook: {
      insert: (vnode) => {
        const el = vnode.elm as HTMLElement;
        el.addEventListener('mouseover', (e: MouseEvent) => {
          const dataBoard = (e.target as HTMLElement).dataset.board;
          if (!dataBoard) return;
          const sep = dataBoard.indexOf('|');
          const newFen = dataBoard.slice(0, sep);
          const newUci = dataBoard.slice(sep + 1);
          pvBoardPos = { x: e.clientX, y: e.clientY };
          if (pvBoard?.fen === newFen && pvBoard?.uci === newUci) return;
          pvBoard = { fen: newFen, uci: newUci };
          _redraw();
        });
        el.addEventListener('mousemove', (e: MouseEvent) => {
          pvBoardPos = { x: e.clientX, y: e.clientY };
          // Update position directly on DOM to avoid Snabbdom redraw per-frame.
          const overlay = document.querySelector<HTMLElement>('.pv-board-float');
          if (overlay) {
            const left = Math.min(e.clientX + PV_BOARD_OFFSET, window.innerWidth - (PV_BOARD_SIZE + PV_BOARD_OFFSET));
            const top  = Math.min(e.clientY + PV_BOARD_OFFSET, window.innerHeight - (PV_BOARD_SIZE + PV_BOARD_OFFSET));
            overlay.style.left = `${left}px`;
            overlay.style.top  = `${top}px`;
          }
        });
        el.addEventListener('mouseleave', () => {
          if (!pvBoard) return;
          pvBoard = null;
          _redraw();
        });
        // Click a PV move → load that position into the main analysis board.
        // Collects all UCIs in the row up to (and including) the clicked span,
        // then walks the tree from ctrl.node — following existing children or
        // creating new variation nodes as needed.
        // Adapted from lichess-org/lila: ui/lib/src/ceval/view/main.ts pointerdown handler
        el.addEventListener('click', (e: MouseEvent) => {
          const sanSpan = (e.target as HTMLElement).closest<HTMLElement>('span.pv-san');
          if (!sanSpan) return;
          e.preventDefault();
          const pvRow = sanSpan.closest<HTMLElement>('div.pv');
          if (!pvRow) return;
          const allSans = Array.from(pvRow.querySelectorAll<HTMLElement>('span.pv-san'));
          const clickedIdx = allSans.indexOf(sanSpan);
          if (clickedIdx < 0) return;
          const ucis: string[] = [];
          for (let i = 0; i <= clickedIdx; i++) {
            const db = allSans[i]!.dataset.board;
            if (!db) break;
            ucis.push(db.slice(db.indexOf('|') + 1));
          }
          if (ucis.length > 0) playPvUciList(ucis);
        });
      },
    },
  }, slots);
}

/**
 * Floating PV board preview — fixed overlay near the mouse cursor.
 * Shown when hovering a pv-san span; hidden when pvBoard is null.
 * Adapted from lichess-org/lila: ui/lib/src/ceval/view/main.ts renderPvBoard
 */
export function renderPvBoard(): VNode | null {
  if (!pvBoard) return null;
  const { fen, uci } = pvBoard;
  const left = Math.min(pvBoardPos.x + PV_BOARD_OFFSET, window.innerWidth - (PV_BOARD_SIZE + PV_BOARD_OFFSET));
  const top  = Math.min(pvBoardPos.y + PV_BOARD_OFFSET, window.innerHeight - (PV_BOARD_SIZE + PV_BOARD_OFFSET));
  const arrow = uci.length >= 4
    ? [{ orig: uci.slice(0, 2) as Key, dest: uci.slice(2, 4) as Key, brush: 'paleBlue' }]
    : [];
  const lastMove = uciToMove(uci);
  const cgConfig: Config = {
    fen,
    orientation,
    coordinates: false,
    viewOnly: true,
    drawable: { enabled: false, visible: true, autoShapes: arrow },
    ...(lastMove ? { lastMove } : {}),
  };
  return h('div.pv-board-float', {
    key: 'pv-board-float',
    attrs: { style: `left:${left}px;top:${top}px` },
  }, [
    h('div.cg-wrap', {
      hook: {
        insert: (vnode) => {
          (vnode.elm as any)._cg = makeChessground(vnode.elm as HTMLElement, cgConfig);
        },
        update: (_old, vnode) => {
          (vnode.elm as any)._cg?.set(cgConfig);
        },
        destroy: (vnode) => {
          (vnode.elm as any)._cg?.destroy();
        },
      },
    }),
  ]);
}

/**
 * Engine settings panel — Lines (MultiPV) and Depth sliders.
 * Mirrors lichess-org/lila: ui/lib/src/ceval/view/settings.ts renderCevalSettings
 */
export function renderEngineSettings(): VNode | null {
  if (!showEngineSettings) return null;
  return h('div.ceval-settings', [
    h('div.ceval-settings__row', [
      h('label.ceval-settings__label', { attrs: { for: 'ceval-multipv' } }, 'Lines'),
      h('input#ceval-multipv', {
        attrs: { type: 'range', min: 1, max: 5, step: 1, value: multiPv },
        on: {
          input: (e: Event) => {
            setMultiPv(parseInt((e.target as HTMLInputElement).value));
            clearPendingLines();
            // Re-evaluate current position with new MultiPV setting
            if (engineEnabled && engineReady && !batchAnalyzing) {
              resetCurrentEval();
              evalCurrentPosition();
            }
            _redraw();
          },
        },
      }),
      h('span.ceval-settings__val', `${multiPv} / 5`),
    ]),
    h('div.ceval-settings__row', [
      h('label.ceval-settings__label', { attrs: { for: 'ceval-review-depth' } }, 'Review depth'),
      h('select#ceval-review-depth', {
        on: {
          change: (e: Event) => {
            setReviewDepth(parseInt((e.target as HTMLSelectElement).value));
            _redraw();
          },
        },
      }, [12, 14, 16, 18, 20].map(d =>
        h('option', { attrs: { value: d, selected: d === reviewDepth } }, String(d))
      )),
    ]),
    h('div.ceval-settings__row', [
      h('label.ceval-settings__label', { attrs: { for: 'ceval-analysis-depth' } }, 'Analysis depth'),
      h('select#ceval-analysis-depth', {
        on: {
          change: (e: Event) => {
            setAnalysisDepth(parseInt((e.target as HTMLSelectElement).value));
            _redraw();
          },
        },
      }, [18, 20, 24, 30].map(d =>
        h('option', { attrs: { value: d, selected: d === analysisDepth } }, String(d))
      )),
    ]),
    h('div.ceval-settings__row', [
      h('label.ceval-settings__label', { attrs: { for: 'ceval-until-depth' } }, 'Search to depth'),
      h('input#ceval-until-depth', {
        attrs: { type: 'checkbox', checked: searchUntilDepth },
        on: {
          change: (e: Event) => {
            setSearchUntilDepth((e.target as HTMLInputElement).checked);
            _redraw();
          },
        },
      }),
    ]),
    h('div.ceval-settings__row', { class: { 'ceval-settings__row--disabled': searchUntilDepth } }, [
      h('label.ceval-settings__label', { attrs: { for: 'ceval-search-time' } }, 'Search time'),
      h('input#ceval-search-time', {
        attrs: { type: 'range', min: 1000, max: 60000, step: 1000, value: searchTime, disabled: searchUntilDepth },
        on: {
          input: (e: Event) => {
            setSearchTime(parseInt((e.target as HTMLInputElement).value));
            _redraw();
          },
        },
      }),
      h('span.ceval-settings__val', `${searchTime / 1000}s`),
    ]),
    h('div.ceval-settings__row', [
      h('label.ceval-settings__label', { attrs: { for: 'ceval-arrows' } }, 'Arrows'),
      h('input#ceval-arrows', {
        attrs: { type: 'checkbox', checked: showEngineArrows },
        on: {
          change: (e: Event) => {
            setShowEngineArrows((e.target as HTMLInputElement).checked);
            syncArrow();
            _redraw();
          },
        },
      }),
    ]),
    h('div.ceval-settings__row', [
      h('label.ceval-settings__label', { attrs: { for: 'ceval-arrow-lines' } }, 'All lines'),
      h('input#ceval-arrow-lines', {
        attrs: { type: 'checkbox', checked: arrowAllLines },
        on: {
          change: (e: Event) => {
            setArrowAllLines((e.target as HTMLInputElement).checked);
            syncArrow();
            _redraw();
          },
        },
      }),
    ]),
    h('div.ceval-settings__row', [
      h('label.ceval-settings__label', { attrs: { for: 'ceval-played-arrow' } }, 'Played'),
      h('input#ceval-played-arrow', {
        attrs: { type: 'checkbox', checked: showPlayedArrow },
        on: {
          change: (e: Event) => {
            setShowPlayedArrow((e.target as HTMLInputElement).checked);
            syncArrow();
            _redraw();
          },
        },
      }),
    ]),
    h('div.ceval-settings__row', [
      h('label.ceval-settings__label', { attrs: { for: 'ceval-arrow-labels' } }, 'Labels'),
      h('input#ceval-arrow-labels', {
        attrs: { type: 'checkbox', checked: showArrowLabels },
        on: {
          change: (e: Event) => {
            setShowArrowLabels((e.target as HTMLInputElement).checked);
            syncArrow();
            _redraw();
          },
        },
      }),
    ]),
    h('div.ceval-settings__row', [
      h('label.ceval-settings__label', { attrs: { for: 'ceval-label-size' } }, 'Label size'),
      h('input#ceval-label-size', {
        attrs: { type: 'range', min: 6, max: 18, step: 1, value: arrowLabelSize },
        on: {
          input: (e: Event) => {
            setArrowLabelSize(parseInt((e.target as HTMLInputElement).value));
            syncArrow();
            _redraw();
          },
        },
      }),
      h('span.ceval-settings__val', `${arrowLabelSize}px`),
    ]),
    h('div.ceval-settings__row', [
      h('label.ceval-settings__label', { attrs: { for: 'ceval-review-labels' } }, 'Review'),
      h('input#ceval-review-labels', {
        attrs: { type: 'checkbox', checked: showReviewLabels },
        on: {
          change: (e: Event) => {
            setShowReviewLabels((e.target as HTMLInputElement).checked);
            _redraw();
          },
        },
      }),
    ]),
    h('div.ceval-settings__row', [
      h('label.ceval-settings__label', { attrs: { for: 'ceval-board-review-glyphs' } }, 'Board review'),
      h('input#ceval-board-review-glyphs', {
        attrs: { type: 'checkbox', checked: showBoardReviewGlyphs },
        on: {
          change: (e: Event) => {
            setShowBoardReviewGlyphs((e.target as HTMLInputElement).checked);
            syncArrow();
            _redraw();
          },
        },
      }),
    ]),
  ]);
}
