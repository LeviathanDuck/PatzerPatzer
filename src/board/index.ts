// Board sync, move handling, Chessground lifecycle, player strips, and resize.
// Mirrors lichess-org/lila: ui/analyse/src/ground.ts, ui/lib/src/game/material.ts,
// ui/analyse/src/view/clocks.ts, ui/analyse/src/view/components.ts

import { Chessground as makeChessground } from '@lichess-org/chessground';
import type { Api as CgApi } from '@lichess-org/chessground/api';
import type { Key } from '@lichess-org/chessground/types';
import { key2pos, uciToMove } from '@lichess-org/chessground/util';
import type { NormalMove, Role } from 'chessops';
import { Chess, normalizeMove } from 'chessops/chess';
import { chessgroundDests, scalachessCharPair } from 'chessops/compat';
import { makeFen, parseFen } from 'chessops/fen';
import { makeSan, makeSanAndPlay } from 'chessops/san';
import { makeSquare, makeUci, parseSquare, parseUci } from 'chessops/util';
import { h, type VNode } from 'snabbdom';
import type { AnalyseCtrl } from '../analyse/ctrl';
import { boardZoom, applyBoardZoom, saveBoardZoom } from './cosmetics';
import { syncArrow } from '../engine/ctrl';
import type { ImportedGame } from '../import/types';
import { addNode } from '../tree/ops';
import type { TreeNode } from '../tree/types';

// --- Injected deps ---

let _getCtrl:           () => AnalyseCtrl   = () => { throw new Error('ground not initialised'); };
let _navigate:          (path: string) => void = () => {};
let _getImportedGames:  () => ImportedGame[] = () => [];
let _getSelectedGameId: () => string | null  = () => null;
let _redraw:            () => void           = () => {};

export function initGround(deps: {
  getCtrl:          () => AnalyseCtrl;
  navigate:         (path: string) => void;
  getImportedGames: () => ImportedGame[];
  getSelectedGameId:() => string | null;
  redraw:           () => void;
}): void {
  _getCtrl           = deps.getCtrl;
  _navigate          = deps.navigate;
  _getImportedGames  = deps.getImportedGames;
  _getSelectedGameId = deps.getSelectedGameId;
  _redraw            = deps.redraw;
}

// --- Board-consumer move hook seam ---
// Product owners (analysis, puzzles, etc.) register callbacks to observe user moves.
// Two hook phases are provided:
//   - before-move: fires BEFORE tree navigation, with the UCI and current path.
//     Use this when interception must happen before onJump() (e.g. retro onWin).
//   - after-move: fires AFTER the move is applied and the board navigated.
// Mirrors the pattern in lichess-org/lila where ground.ts events.move
// delegates to ctrl.userMove, allowing different controllers to observe moves.

export interface MoveHookInfo {
  /** UCI string of the played move (normalized, e.g. "e2e4", "e7e8q"). */
  uci: string;
  /** FEN of the position before the move was played. */
  fenBefore: string;
  /** FEN of the position after the move was played. */
  fenAfter: string;
  /** SAN notation of the played move (e.g. "e4", "Nf3"). */
  san: string;
}

/**
 * Info available before navigation occurs.
 * Allows handlers to inspect the move and current tree path before onJump fires.
 */
export interface BeforeMoveHookInfo {
  /** UCI string of the played move (normalized). */
  uci: string;
  /** FEN of the position before the move was played. */
  fenBefore: string;
  /** Current tree path at the moment of the move (before navigation). */
  path: string;
}

type MoveHookCallback = (info: MoveHookInfo) => void;
type BeforeMoveHookCallback = (info: BeforeMoveHookInfo) => void;

const _moveHooks: Set<MoveHookCallback> = new Set();
const _beforeMoveHooks: Set<BeforeMoveHookCallback> = new Set();

/**
 * Register a callback to be notified after the user makes a move on the board.
 * Returns an unsubscribe function.
 */
export function onBoardUserMove(cb: MoveHookCallback): () => void {
  _moveHooks.add(cb);
  return () => { _moveHooks.delete(cb); };
}

/**
 * Register a callback to be notified BEFORE tree navigation occurs.
 * Use for logic that must run before onJump() (e.g. retro win detection).
 * Returns an unsubscribe function.
 */
export function onBeforeBoardUserMove(cb: BeforeMoveHookCallback): () => void {
  _beforeMoveHooks.add(cb);
  return () => { _beforeMoveHooks.delete(cb); };
}

function fireMoveHooks(info: MoveHookInfo): void {
  for (const cb of _moveHooks) {
    try { cb(info); } catch (e) { console.error('[board] move hook error', e); }
  }
}

function fireBeforeMoveHooks(info: BeforeMoveHookInfo): void {
  for (const cb of _beforeMoveHooks) {
    try { cb(info); } catch (e) { console.error('[board] before-move hook error', e); }
  }
}

// --- Board state ---

export let cgInstance:  CgApi | undefined = undefined;
export let orientation: 'white' | 'black' = 'white';

/** Pending pawn promotion — set when a pawn reaches the back rank, cleared after piece selection. */
let pendingPromotion: { orig: string; dest: string; color: 'white' | 'black' } | null = null;

export function setOrientation(v: 'white' | 'black'): void {
  orientation = v;
  // Apply to the live board immediately so the orientation change takes effect
  // without waiting for the next full renderBoard() cycle.
  // Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts flip() cgInstance.set pattern.
  cgInstance?.set({ orientation: v });
  // When orientation changes, Chessground calls redrawAll() → renderWrap() →
  // element.innerHTML = '', which destroys cg-resize. Re-attach it.
  if (_cgWrap) bindBoardResizeHandle(_cgWrap);
}

// --- Board sync ---
// Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts showGround / makeCgOpts
// Board state is updated directly via cgInstance.set() — never via Snabbdom re-render.
// The cg-wrap element is keyed so Snabbdom always reuses it rather than recreating it.

/**
 * Compute legal destinations for the current position.
 * Returns a Map<square, dest[]> suitable for Chessground movable.dests.
 * Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts makeCgOpts (dests computation)
 */
export function computeDests(fen: string): Map<Key, Key[]> {
  const setup = parseFen(fen).unwrap();
  const pos = Chess.fromSetup(setup).unwrap();
  // chessgroundDests handles the chess960→standard castling square translation:
  // it adds g1/c1/g8/c8 destinations alongside the internal rook squares so
  // Chessground can display castling as king-to-final-square.
  // Adapted from lichess-org/lila: ui/lib/src/game/ground.ts
  return chessgroundDests(pos) as Map<Key, Key[]>;
}

const DESTS_CACHE_MAX = 512;
const destsCache = new Map<string, Map<Key, Key[]>>();

function cachedDests(fen: string): Map<Key, Key[]> {
  const cached = destsCache.get(fen);
  if (cached) return cached;
  const dests = computeDests(fen);
  destsCache.set(fen, dests);
  if (destsCache.size > DESTS_CACHE_MAX) {
    const oldest = destsCache.keys().next().value;
    if (oldest !== undefined) destsCache.delete(oldest);
  }
  return dests;
}

/**
 * Convert a UCI move string to readable SAN given the position FEN.
 * Falls back to the raw UCI string if conversion fails for any reason.
 * Mirrors the SAN derivation used in lichess-org/lila: ui/lib/src/ceval/util.ts
 */
export function uciToSan(fen: string, uci: string): string {
  try {
    const move = parseUci(uci);
    if (!move) return uci;
    const setup = parseFen(fen).unwrap();
    const pos = Chess.fromSetup(setup).unwrap();
    return makeSan(pos, move);
  } catch {
    return uci;
  }
}

/**
 * Handle a legal move played on the board.
 * If the move already exists as a child: navigate to it.
 * Otherwise: create a new variation node, add to tree, navigate.
 * Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts addNodeLocally + addNode
 */
export function onUserMove(orig: string, dest: string): void {
  const ctrl = _getCtrl();
  const setup = parseFen(ctrl.node.fen).unwrap();
  const pos = Chess.fromSetup(setup).unwrap();
  const fromSq = parseSquare(orig);
  const toSq   = parseSquare(dest);
  if (fromSq === undefined || toSq === undefined) return;

  // Normalize castling: Chessground sends king-to-final-square (e1g1),
  // but tree UCIs are stored as king-to-rook-square (e1h1 — chessops internal).
  // normalizeMove converts standard→chess960 so the lookup matches imported moves.
  // Adapted from lichess-org/lila: ui/lib/src/game/ground.ts
  const normMove = normalizeMove(pos, { from: fromSq, to: toSq });
  const normUci  = makeUci(normMove);

  // Fire before-move hooks so analysis-owned handlers (e.g. retro solve interception)
  // can act before navigation. This preserves the timing rule: retro onWin() must
  // run BEFORE navigate so onJump() sees 'win' and skips offTrack detection.
  fireBeforeMoveHooks({ uci: normUci, fenBefore: ctrl.node.fen, path: ctrl.path });

  // Check existing children — follow the tree if this move is already there.
  const existingChild = ctrl.node.children.find(c => c.uci === normUci || c.uci?.startsWith(normUci));
  if (existingChild) {
    _navigate(ctrl.path + existingChild.id);
    fireMoveHooks({ uci: normUci, fenBefore: ctrl.node.fen, fenAfter: existingChild.fen, san: existingChild.san ?? normUci });
    return;
  }

  // Detect pawn promotion — show dialog instead of auto-queening
  const piece = pos.board.get(fromSq);
  if (piece?.role === 'pawn' && ((pos.turn === 'white' && toSq >= 56) || (pos.turn === 'black' && toSq < 8))) {
    pendingPromotion = { orig, dest, color: pos.turn };
    _redraw();
    return;
  }

  const fenBefore = ctrl.node.fen;
  completeMove(orig, dest);
  const afterCtrl = _getCtrl();
  fireMoveHooks({ uci: normUci, fenBefore, fenAfter: afterCtrl.node.fen, san: afterCtrl.node.san ?? normUci });
}

/**
 * Finalise a move (with optional promotion role) and add it to the tree.
 * Adapted from lichess-org/lila: ui/analyse/src/ctrl.ts addNodeLocally
 */
export function completeMove(orig: string, dest: string, promotion?: Role): void {
  const ctrl = _getCtrl();
  const setup = parseFen(ctrl.node.fen).unwrap();
  const pos = Chess.fromSetup(setup).unwrap();
  const fromSq = parseSquare(orig);
  const toSq = parseSquare(dest);
  if (fromSq === undefined || toSq === undefined) return;
  // normalizeMove converts king-to-final-square (g1/c1) back to king-to-rook-square
  // for chessops's internal castling representation (Chess960 style internally).
  // Required because chessgroundDests exposes g1/c1 as destinations.
  // Adapted from lichess-org/lila: ui/lib/src/game/ground.ts
  const move: NormalMove = normalizeMove(
    pos,
    promotion !== undefined ? { from: fromSq, to: toSq, promotion } : { from: fromSq, to: toSq },
  ) as NormalMove;
  applyMoveToTree(move, pos);
}

function applyMoveToTree(move: NormalMove, pos: Chess): void {
  const ctrl = _getCtrl();
  const normUci = makeUci(move);
  const existingChild = ctrl.node.children.find(c => c.uci === normUci || c.uci?.startsWith(normUci));
  if (existingChild) {
    _navigate(ctrl.path + existingChild.id);
    return;
  }
  const san = makeSanAndPlay(pos, move);
  const newNode: TreeNode = {
    id: scalachessCharPair(move),
    ply: ctrl.node.ply + 1,
    san,
    uci: makeUci(move),
    fen: makeFen(pos.toSetup()),
    children: [],
  };
  addNode(ctrl.root, ctrl.path, newNode);
  console.log('[variation] inserted', {
    id: newNode.id, ply: newNode.ply, san: newNode.san, uci: newNode.uci,
    parentPath: ctrl.path, newPath: ctrl.path + newNode.id,
    parentChildCount: (ctrl.node.children.length),
  });
  _navigate(ctrl.path + newNode.id);
}

export function playUciMove(uci: string): void {
  const ctrl = _getCtrl();
  const parsed = parseUci(uci);
  if (!parsed) return;
  const setup = parseFen(ctrl.node.fen).unwrap();
  const pos = Chess.fromSetup(setup).unwrap();
  const move = normalizeMove(pos, parsed) as NormalMove;
  applyMoveToTree(move, pos);
}

/**
 * Called when the user selects a piece in the promotion dialog.
 * Adapted from lichess-org/lila: ui/lib/src/game/promotion.ts PromotionCtrl.finish
 */
export function completePromotion(role: Role): void {
  if (!pendingPromotion) return;
  const { orig, dest } = pendingPromotion;
  pendingPromotion = null;
  const fenBefore = _getCtrl().node.fen;
  completeMove(orig, dest, role);
  const afterCtrl = _getCtrl();
  const promoUci = afterCtrl.node.uci ?? `${orig}${dest}${role[0]}`;
  fireMoveHooks({ uci: promoUci, fenBefore, fenAfter: afterCtrl.node.fen, san: afterCtrl.node.san ?? promoUci });
}

const PROMOTION_ROLES: Role[] = ['queen', 'knight', 'rook', 'bishop'];

/**
 * Renders the promotion piece-choice dialog overlaid on the board.
 * Positions itself at the destination column, stacking from the back rank.
 * Adapted from lichess-org/lila: ui/lib/src/game/promotion.ts renderPromotion
 */
export function renderPromotionDialog(): VNode | null {
  if (!pendingPromotion) return null;
  const { dest, color } = pendingPromotion;
  const [file] = key2pos(dest as Key);
  // Column left% — same formula as Lichess
  const left = orientation === 'white' ? file * 12.5 : (7 - file) * 12.5;
  const vertical = color === orientation ? 'top' : 'bottom';

  // Wrap in .cg-wrap so Chessground's piece background-image CSS rules cascade in
  return h('div.cg-wrap.promotion-wrap', {
    on: { click: () => { pendingPromotion = null; syncBoard(); _redraw(); } },
  }, [
    h('div#promotion-choice.' + vertical, {}, PROMOTION_ROLES.map((role, i) => {
      const top = (color === orientation ? i : 7 - i) * 12.5;
      return h('square', {
        attrs: { style: `top:${top}%;left:${left}%` },
        on: { click: (e: Event) => { e.stopPropagation(); completePromotion(role); } },
      }, [h(`piece.${role}.${color}`)]);
    })),
  ]);
}

export function syncBoard(): void {
  if (!cgInstance) return;
  const ctrl = _getCtrl();
  const node = ctrl.node;
  const dests = cachedDests(node.fen);
  const lastMove = uciToMove(node.uci);
  cgInstance.set({
    fen: node.fen,
    turnColor: node.ply % 2 === 0 ? 'white' : 'black',
    movable: {
      color: node.ply % 2 === 0 ? 'white' : 'black',
      dests,
    },
    ...(lastMove ? { lastMove } : {}),
  });
}

// Adapted from lichess-org/lila: ui/analyse/src/ctrl.ts (flip)
export function flip(): void {
  orientation = orientation === 'white' ? 'black' : 'white';
  cgInstance?.set({ orientation });
  _redraw();
}

// --- Material difference ---
// Adapted from lichess-org/lila: ui/lib/src/game/material.ts

type MaterialDiffSide = Record<Role, number>;
interface MaterialDiff { white: MaterialDiffSide; black: MaterialDiffSide; }

const ROLE_ORDER: Role[] = ['queen', 'rook', 'bishop', 'knight', 'pawn'];
const ROLE_POINTS: Record<Role, number> = { queen: 9, rook: 5, bishop: 3, knight: 3, pawn: 1, king: 0 };

function getMaterialDiff(fen: string): MaterialDiff {
  const diff: MaterialDiff = {
    white: { king: 0, queen: 0, rook: 0, bishop: 0, knight: 0, pawn: 0 },
    black: { king: 0, queen: 0, rook: 0, bishop: 0, knight: 0, pawn: 0 },
  };
  const fenBoard = fen.split(' ')[0] ?? '';
  const charToRole: Record<string, Role> = { p:'pawn', n:'knight', b:'bishop', r:'rook', q:'queen', k:'king' };
  for (const ch of fenBoard) {
    const lower = ch.toLowerCase();
    const role = charToRole[lower];
    if (!role) continue;
    const color: 'white' | 'black' = ch === lower ? 'black' : 'white';
    const opp = color === 'white' ? 'black' : 'white';
    if (diff[opp][role] > 0) diff[opp][role]--;
    else diff[color][role]++;
  }
  return diff;
}

function getMaterialScore(diff: MaterialDiff): number {
  return ROLE_ORDER.reduce((sum, role) => sum + (diff.white[role] - diff.black[role]) * ROLE_POINTS[role], 0);
}

/**
 * Renders captured pieces for one side as overlapping mono piece icons.
 * Adapted from lichess-org/lila: ui/lib/src/game/view/material.ts renderMaterialDiff
 * Uses mono SVG piece images (public/piece/mono/) — no .cg-wrap scope needed.
 */
function renderMaterialPieces(diff: MaterialDiff, color: 'white' | 'black', score: number): VNode {
  const groups: VNode[] = [];
  for (const role of ROLE_ORDER) {
    const count = diff[color][role];
    if (count <= 0) continue;
    const pieces: VNode[] = [];
    for (let i = 0; i < count; i++) pieces.push(h('mpiece.' + role));
    groups.push(h('div', pieces));
  }
  return h('div.material', [
    ...groups,
    score > 0 ? h('score', '+' + score) : null,
  ]);
}

/**
 * Format centiseconds as M:SS or H:MM:SS, matching Lichess clockContent.
 * Adapted from lichess-org/lila: ui/analyse/src/view/clocks.ts
 */
function formatClock(centis: number): string {
  const totalSecs = Math.floor(centis / 100);
  const hh = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  const pad = (n: number) => n < 10 ? '0' + n : String(n);
  return hh > 0 ? `${hh}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * Walk the nodeList to find the most recent clock for each color.
 * node.clock stores the time remaining AFTER the move at that node.
 * White moves are at odd plies, black moves at even plies (ply 1 = white's first).
 * Adapted from lichess-org/lila: ui/analyse/src/view/clocks.ts renderClocks
 */
function getClocksAtPath(): { white: number | undefined; black: number | undefined } {
  const nodes = _getCtrl().nodeList;
  let white: number | undefined;
  let black: number | undefined;
  // Walk from most recent backwards so we get the closest available clock
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    if (!n) continue;
    if (n.clock === undefined) continue;
    // ply 1 = white moved, ply 2 = black moved, etc.
    if (n.ply % 2 === 1 && white === undefined) white = n.clock;
    if (n.ply % 2 === 0 && n.ply > 0 && black === undefined) black = n.clock;
    if (white !== undefined && black !== undefined) break;
  }
  return { white, black };
}

// Adapted from lichess-org/lila: ui/analyse/src/view/components.ts renderPlayerStrips
// Layout: [result] [color-dot] [name] [material] ... [clock]
// Result badge on left, clock on right — matching Lichess analyse__player_strip.
export function renderPlayerStrips(): [VNode, VNode] {
  const ctrl = _getCtrl();
  const selectedGameId = _getSelectedGameId();
  const importedGames  = _getImportedGames();
  const game = importedGames.find(g => g.id === selectedGameId);
  const whiteName   = game?.white ?? 'White';
  const blackName   = game?.black ?? 'Black';
  const whiteRating = game?.whiteRating;
  const blackRating = game?.blackRating;
  const result      = game?.result ?? '*';

  const diff   = getMaterialDiff(ctrl.node.fen);
  const score  = getMaterialScore(diff);
  const clocks = getClocksAtPath();

  const strip = (color: 'white' | 'black'): VNode => {
    const name     = color === 'white' ? whiteName : blackName;
    const rating   = color === 'white' ? whiteRating : blackRating;
    const winner   = (color === 'white' && result === '1-0') || (color === 'black' && result === '0-1');
    const loser    = (color === 'white' && result === '0-1') || (color === 'black' && result === '1-0');
    const matScore = color === 'white' ? score : -score;
    const centis   = color === 'white' ? clocks.white : clocks.black;
    return h('div.analyse__player_strip', [
      h('div.player-strip__identity', {
        class: {
          'player-strip__identity--winner': winner,
          'player-strip__identity--loser': loser,
          'player-strip__identity--draw': !winner && !loser,
        },
      }, [
        h('span.player-strip__color-icon', { class: { 'player-strip__color-icon--white': color === 'white', 'player-strip__color-icon--black': color === 'black' } }),
        h('span.player-strip__name', rating !== undefined ? `${name} (${rating})` : name),
      ]),
      renderMaterialPieces(diff, color, matScore > 0 ? matScore : 0),
      centis !== undefined ? h('div.analyse__clock', formatClock(centis)) : null,
    ]);
  };

  const topColor    = orientation === 'white' ? 'black' : 'white';
  const bottomColor = orientation === 'white' ? 'white' : 'black';
  return [strip(topColor), strip(bottomColor)];
}

// --- Board resize handle ---
// Adapted from lichess-org/lila: ui/lib/src/chessgroundResize.ts
// Appended to cg-container (the absolutely-positioned inner element) so that
// position: absolute on cg-resize resolves against an element with defined
// width/height — matching Lichess resizeHandle(els.container) exactly.
//
// Stored so setOrientation() can re-attach after Chessground's redrawAll()
// wipes element.innerHTML and destroys the handle.
let _cgWrap: HTMLElement | undefined;

export function bindBoardResizeHandle(wrap: HTMLElement): void {
  _cgWrap = wrap;
  const container = (wrap.querySelector('cg-container') as HTMLElement | null) ?? wrap;
  // Idempotent: remove any existing handle before adding a fresh one.
  // Required because setOrientation() triggers Chessground's redrawAll() →
  // renderWrap() → element.innerHTML = '', destroying the previous cg-resize.
  container.querySelector('cg-resize')?.remove();
  const el = document.createElement('cg-resize');
  container.appendChild(el);

  type MouchEvent = Event & Partial<MouseEvent & TouchEvent & PointerEvent>;
  const eventPos = (e: MouchEvent): [number, number] | undefined => {
    if (e.clientX !== undefined) return [e.clientX, e.clientY!];
    if (e.targetTouches?.[0]) return [e.targetTouches[0].clientX, e.targetTouches[0].clientY];
    return undefined;
  };

  const startResize = (start: MouchEvent) => {
    start.preventDefault();
    const startPos = eventPos(start);
    if (!startPos) return;
    const initialZoom = boardZoom;
    let zoom = initialZoom;

    // Debounced localStorage save — mirrors Lichess debounced XHR post.
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    const saveZoom = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveBoardZoom(zoom), 700);
    };

    const pointerId = typeof start.pointerId === 'number' ? start.pointerId : null;
    const usePointer = start.type === 'pointerdown';
    const mousemoveEvent = usePointer ? 'pointermove' : (start as TouchEvent).targetTouches ? 'touchmove' : 'mousemove';
    const mouseupEvent   = usePointer ? 'pointerup'   : (start as TouchEvent).targetTouches ? 'touchend'  : 'mouseup';

    const resize = (move: MouchEvent) => {
      if (pointerId !== null && move.pointerId !== undefined && move.pointerId !== pointerId) return;
      if (move.cancelable) move.preventDefault();
      const pos = eventPos(move);
      if (!pos) return;
      const delta = pos[0] - startPos[0] + pos[1] - startPos[1];
      zoom = Math.round(Math.min(100, Math.max(0, initialZoom + delta / 10)));
      applyBoardZoom(zoom);
      window.dispatchEvent(new Event('resize'));
      saveZoom();
    };

    document.body.classList.add('resizing');
    document.addEventListener(mousemoveEvent, resize as EventListener, { passive: false });
    document.addEventListener(mouseupEvent, () => {
      document.removeEventListener(mousemoveEvent, resize as EventListener);
      document.body.classList.remove('resizing');
    }, { once: true });
  };

  if ('PointerEvent' in window) {
    el.addEventListener('pointerdown', startResize as EventListener, { passive: false });
  } else {
    el.addEventListener('mousedown',  startResize as EventListener, { passive: false });
    el.addEventListener('touchstart', startResize as EventListener, { passive: false });
  }
}

// Adapted from lichess-org/lila: ui/analyse/src/ground.ts render + makeConfig
export function renderBoard(): VNode {
  return h('div.cg-wrap', {
    key: 'board',
    hook: {
      insert: vnode => {
        const ctrl = _getCtrl();
        const node = ctrl.node;
        const dests = cachedDests(node.fen);
        const lastMove = uciToMove(node.uci);
        cgInstance = makeChessground(vnode.elm as HTMLElement, {
          orientation,
          viewOnly: false,
          drawable: {
            enabled: true,
            brushes: {
              green:    { key: 'g',   color: '#15781B', opacity: 1,    lineWidth: 10 },
              blue:     { key: 'b',   color: '#003088', opacity: 1,    lineWidth: 10 },
              yellow:   { key: 'y',   color: '#e68f00', opacity: 1,    lineWidth: 10 },
              // Explicitly register all brushes used by engine arrow rendering so their
              // keys are always present in Chessground state regardless of deepMerge order.
              // Mirrors lichess-org/lila: state.ts default brushes; opacity/lineWidth values
              // kept at Chessground defaults except paleBlue which is boosted for visibility.
              paleBlue: { key: 'pb',  color: '#003088', opacity: 0.65, lineWidth: 15 },
              paleGrey: { key: 'pgr', color: '#4a4a4a', opacity: 0.35, lineWidth: 15 },
              red:      { key: 'r',   color: '#882020', opacity: 1,    lineWidth: 10 },
            },
          },
          fen: node.fen,
          turnColor: node.ply % 2 === 0 ? 'white' : 'black',
          movable: {
            free: false,
            color: node.ply % 2 === 0 ? 'white' : 'black',
            dests,
            showDests: true,
          },
          events: {
            move: onUserMove,
          },
          ...(lastMove ? { lastMove } : {}),
        });
        // Attach resize handle after Chessground is initialized.
        // Adapted from lichess-org/lila: ui/lib/src/chessgroundResize.ts resizeHandle()
        bindBoardResizeHandle(vnode.elm as HTMLElement);
      },
      destroy: () => {
        cgInstance?.destroy();
        cgInstance = undefined;
      },
    },
  });
}

// Re-sync board and arrow after a game load or IDB restore.
export function syncBoardAndArrow(): void {
  syncBoard();
  syncArrow();
}

// Temporarily disable/re-enable Chessground piece animation.
// Used during puzzle board setup to prevent intermediate FEN changes from
// producing multiple overlapping piece animations (visible as board "vibration").
export function setAnimationEnabled(enabled: boolean): void {
  cgInstance?.set({ animation: { enabled } });
}
