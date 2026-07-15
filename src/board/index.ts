// Board sync, move handling, Chessground lifecycle, player strips, and resize.
// Mirrors lichess-org/lila: ui/analyse/src/ground.ts, ui/lib/src/game/material.ts,
// ui/analyse/src/view/clocks.ts, ui/analyse/src/view/components.ts

import { Chessground as makeChessground } from '@lichess-org/chessground';
import type { Api as CgApi } from '@lichess-org/chessground/api';
import type { Config as CgConfig } from '@lichess-org/chessground/config';
import type { Key } from '@lichess-org/chessground/types';
import { key2pos, uciToMove } from '@lichess-org/chessground/util';
import type { NormalMove, Role, SquareName } from 'chessops';
import { Chess, normalizeMove } from 'chessops/chess';
import { chessgroundDests, scalachessCharPair } from 'chessops/compat';
import { makeFen, parseFen } from 'chessops/fen';
import { makeSan, makeSanAndPlay } from 'chessops/san';
import { makeSquare, makeUci, parseSquare, parseUci } from 'chessops/util';
import { h, type VNode } from 'snabbdom';
import type { AnalyseCtrl } from '../analyse/ctrl';
import { activeWorkspace, providerIsLive } from '../analyse/workspaceCore';
import type {
  WorkspaceBoardInputHandle,
  WorkspaceBoardPort,
  WorkspaceCursor,
} from '../analyse/workspaceCore';
import { boardZoom, applyBoardZoom, saveBoardZoom } from './cosmetics';
import { syncArrow } from '../engine/ctrl';
import type { ImportedGame } from '../import/types';
import { addNode } from '../tree/ops';
import type { Clock, TreeNode, TreePath } from '../tree/types';
import { chessBoardAnimationConfig, onBoardAnimationChange } from './animation';
import { REPERTOIRE_ALT_ARROW_BRUSH, REPERTOIRE_ARROW_BRUSH } from './arrowBrushes';
import { capturePremoveInput, currentPremoveCaptureSnapshot } from './premoves';

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
  // Always update the module-global orientation first — it stays Analysis's backing value even for
  // a module-owned surface (which flips through its own module/port instead of the shared board).
  orientation = v;
  // CCW-H03a-3: a module-owned board owns its own orientation; do not touch the shared Chessground
  // or rebind its resize handle for it. Analysis (no module) and Study (analysis-default) fall
  // through unchanged. Branch on the active input's config policy, not a mode string compare.
  const input = activeWorkspace()?.boardInputModule ?? null;
  if (input && input.configPolicy.kind === 'module-owned') return;
  // Apply to the live board immediately so the orientation change takes effect
  // without waiting for the next full renderBoard() cycle.
  // Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts flip() cgInstance.set pattern.
  cgInstance?.set({ orientation: v });
  // When orientation changes, Chessground calls redrawAll() → renderWrap() →
  // element.innerHTML = '', which destroys cg-resize. Re-attach it — but only when the shared
  // lifecycle owns resize (no module, or a module that allows resize).
  if (_cgWrap && (!input || input.allowResize)) bindBoardResizeHandle(_cgWrap);
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

// --- Shared-tree move transaction target (CCW-H03a-3) ---
//
// A single per-move-transaction handle to the tree cursor + navigation + commit for whichever
// workspace owns the shared-tree move pipeline (Analysis or a shared-tree module such as Study).
// Resolving it ONCE per transaction and threading it through every move function replaces the old
// pattern of re-reading `_getCtrl()`/`activeWorkspace()` at pre- and post-move points, which could
// mix a pre-move snapshot from one session with a post-move read from another (the exact
// cross-session hazard this slice closes). Module-owned surfaces do NOT dispatch through this path
// (they run on movable.events.after), so resolution fails closed to `null` for them.
interface SharedTreeMoveTarget {
  cursor(): WorkspaceCursor;
  navigate(path: TreePath): void;
  commit(parentPath: TreePath, node: TreeNode): void;
}

/**
 * Resolve the shared-tree move target for the CURRENT active workspace, once per move transaction.
 * - A workspace whose module dispatches `module-owned` → `null` (fail closed; those moves never
 *   reach this pipeline).
 * - A workspace whose module dispatches `shared-tree` (Study) → the captured instance's session +
 *   guarded navigate + guarded handleUserMove commit.
 * - A module-less workspace → only `free-analysis` (Analysis) may use the legacy Analysis closures;
 *   any other module-less mount fails closed (final defense behind mount validation).
 * - No active workspace (bootstrap) → the legacy Analysis closures.
 */
function sharedTreeMoveTarget(): SharedTreeMoveTarget | null {
  const ws = activeWorkspace();
  const input = ws ? ws.boardInputModule : null;
  if (ws && input) {
    const dispatch = input.moveDispatch;
    if (dispatch.kind === 'module-owned') return null;
    // shared-tree module (e.g. Study): read/write through this exact captured instance.
    return {
      cursor: () => ws.session(),
      navigate: path => { dispatch.navigate(path); },
      commit: (parentPath, node) => {
        if (input.isLive()) ws.handleUserMove(parentPath, node);
      },
    };
  }
  // No module: the legacy Analysis fallback closures. Legal only for a bootstrap (no workspace) or a
  // free-analysis workspace; any other module-less mount fails closed despite mount validation.
  if (ws && ws.boardInputMode !== 'free-analysis') return null;
  const ctrl = _getCtrl();







  const liveCursor: WorkspaceCursor = {
    get root() { return ctrl.root; },
    get path() { return ctrl.path; },
    get node() { return ctrl.node; },
    get nodeList() { return ctrl.nodeList; },
    get mainline() { return ctrl.mainline; },
  };
  return {
    cursor: () => liveCursor,
    navigate: path => { _navigate(path); },
    commit: (parentPath, node) => {
      addNode(ctrl.root, parentPath, node);
      _navigate(parentPath + node.id);
    },
  };
}

/**
 * Handle a legal move played on the board.
 * If the move already exists as a child: navigate to it.
 * Otherwise: create a new variation node, add to tree, navigate.
 * Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts addNodeLocally + addNode
 */
export function onUserMove(orig: string, dest: string): void {
  // Resolve the move target ONCE for the whole transaction; fail closed for module-owned surfaces.
  const target = sharedTreeMoveTarget();
  if (!target) return;
  const cursor = target.cursor();
  const setup = parseFen(cursor.node.fen).unwrap();
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
  fireBeforeMoveHooks({ uci: normUci, fenBefore: cursor.node.fen, path: cursor.path });

  // Check existing children — follow the tree if this move is already there.
  const existingChild = cursor.node.children.find(c => c.uci === normUci || c.uci?.startsWith(normUci));
  if (existingChild) {
    target.navigate(cursor.path + existingChild.id);
    // Preserved quirk: this fenBefore is read AFTER navigation (post-jump node fen), exactly as the
    // pre-extraction code did (it re-read the live ctrl.node.fen after _navigate).
    fireMoveHooks({ uci: normUci, fenBefore: target.cursor().node.fen, fenAfter: existingChild.fen, san: existingChild.san ?? normUci });
    return;
  }

  // Detect pawn promotion — show dialog instead of auto-queening
  const piece = pos.board.get(fromSq);
  if (piece?.role === 'pawn' && ((pos.turn === 'white' && toSq >= 56) || (pos.turn === 'black' && toSq < 8))) {
    pendingPromotion = { orig, dest, color: pos.turn };
    _redraw();
    return;
  }

  const fenBefore = cursor.node.fen;
  completeMoveWithTarget(target, orig, dest);
  const afterCursor = target.cursor();
  fireMoveHooks({ uci: normUci, fenBefore, fenAfter: afterCursor.node.fen, san: afterCursor.node.san ?? normUci });
}

/**
 * Finalise a move (with optional promotion role) and add it to the tree.
 * Adapted from lichess-org/lila: ui/analyse/src/ctrl.ts addNodeLocally
 */
export function completeMove(orig: string, dest: string, promotion?: Role): void {
  const target = sharedTreeMoveTarget();
  if (!target) return;
  completeMoveWithTarget(target, orig, dest, promotion);
}

// Same as completeMove but reuses an already-resolved target so a whole transaction reads/writes
// one session (no re-resolve of _getCtrl()/activeWorkspace() mid-move).
function completeMoveWithTarget(target: SharedTreeMoveTarget, orig: string, dest: string, promotion?: Role): void {
  const setup = parseFen(target.cursor().node.fen).unwrap();
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
  applyMoveToTree(target, move, pos);
}

/**
 * Apply a move that has already been accepted as a user-intent move by a board-level feature
 * such as queued premoves. This preserves the same before/after hook contract as onUserMove()
 * while allowing callers to provide an already-selected promotion role.
 */
export function applyLegalBoardUserMove(orig: string, dest: string, promotion?: Role): void {
  const target = sharedTreeMoveTarget();
  if (!target) return;
  const cursor = target.cursor();
  const setup = parseFen(cursor.node.fen).unwrap();
  const pos = Chess.fromSetup(setup).unwrap();
  const fromSq = parseSquare(orig);
  const toSq = parseSquare(dest);
  if (fromSq === undefined || toSq === undefined) return;
  const move = normalizeMove(
    pos,
    promotion !== undefined ? { from: fromSq, to: toSq, promotion } : { from: fromSq, to: toSq },
  );
  if (!('from' in move) || !pos.isLegal(move)) return;

  const normUci = makeUci(move);
  // Preserved quirk: unlike onUserMove, this fenBefore is captured ONCE pre-move and reused in both
  // the existing-child and new-node hook payloads (matching the pre-extraction code).
  const fenBefore = cursor.node.fen;
  fireBeforeMoveHooks({ uci: normUci, fenBefore, path: cursor.path });

  const existingChild = cursor.node.children.find(c => c.uci === normUci || c.uci?.startsWith(normUci));
  if (existingChild) {
    target.navigate(cursor.path + existingChild.id);
    fireMoveHooks({ uci: normUci, fenBefore, fenAfter: existingChild.fen, san: existingChild.san ?? normUci });
    return;
  }

  applyMoveToTree(target, move as NormalMove, pos);
  const afterCursor = target.cursor();
  fireMoveHooks({ uci: normUci, fenBefore, fenAfter: afterCursor.node.fen, san: afterCursor.node.san ?? normUci });
}

function applyMoveToTree(target: SharedTreeMoveTarget, move: NormalMove, pos: Chess): void {
  const cursor = target.cursor();
  const normUci = makeUci(move);
  const existingChild = cursor.node.children.find(c => c.uci === normUci || c.uci?.startsWith(normUci));
  if (existingChild) {
    target.navigate(cursor.path + existingChild.id);
    return;
  }
  const san = makeSanAndPlay(pos, move);
  const newNode: TreeNode = {
    id: scalachessCharPair(move),
    ply: cursor.node.ply + 1,
    san,
    uci: makeUci(move),
    fen: makeFen(pos.toSetup()),
    children: [],
  };
  // Capture the parent node/path before the commit below — the cursor's node/path move on to the new
  // node once navigation happens, so the log must snapshot these first to keep reporting the
  // parent's post-insertion child count exactly as before this change.
  const parentNode = cursor.node;
  const parentPath = cursor.path;
  // The resolved target owns the commit: shared-tree module → workspace.handleUserMove; Analysis
  // fallback → addNode + navigate (verbatim the pre-extraction Analysis path).
  target.commit(parentPath, newNode);
  console.log('[variation] inserted', {
    id: newNode.id, ply: newNode.ply, san: newNode.san, uci: newNode.uci,
    parentPath, newPath: parentPath + newNode.id,
    parentChildCount: parentNode.children.length,
  });
}

export function playUciMove(uci: string): void {
  const target = sharedTreeMoveTarget();
  if (!target) return;
  const parsed = parseUci(uci);
  if (!parsed) return;
  const setup = parseFen(target.cursor().node.fen).unwrap();
  const pos = Chess.fromSetup(setup).unwrap();
  const move = normalizeMove(pos, parsed);
  if (!('from' in move) || !pos.isLegal(move)) return;
  applyMoveToTree(target, move as NormalMove, pos);
}

/**
 * Called when the user selects a piece in the promotion dialog.
 * Adapted from lichess-org/lila: ui/lib/src/game/promotion.ts PromotionCtrl.finish
 */
export function completePromotion(role: Role): void {
  if (!pendingPromotion) return;
  // Resolve once BEFORE consuming the pending promotion so pre-move FEN, the promoted move, and the
  // post-move hook data all read the same session.
  const target = sharedTreeMoveTarget();
  if (!target) return;
  const { orig, dest } = pendingPromotion;
  pendingPromotion = null;
  const fenBefore = target.cursor().node.fen;
  completeMoveWithTarget(target, orig, dest, role);
  const afterCursor = target.cursor();
  const promoUci = afterCursor.node.uci ?? `${orig}${dest}${role[0]}`;
  fireMoveHooks({ uci: promoUci, fenBefore, fenAfter: afterCursor.node.fen, san: afterCursor.node.san ?? promoUci });
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

// --- Analysis board configuration (CCW-H03a-3) ---
//
// The exact Analysis initial + sync Chessground configuration, extracted VERBATIM from the former
// inline renderBoard()/syncBoard() bodies so a reviewer can diff old-vs-new field for field. These
// are the `analysis-default` config policy for both Analysis (no module) and Study (its module
// declares analysis-default). Evaluation order and every field/value are preserved deliberately —
// the listed pre-existing quirks (root-position lastMove omission rather than explicit clearing, the
// `new Map()` allocation during premove capture, deep-merge/partial-config semantics) are NOT
// "fixed" here. `events.move` / `movable.events.after` are intentionally ABSENT: the canonical
// move-callback installer owns those (see installCanonicalCallbacks).

function analysisInitialConfig(node: TreeNode): CgConfig {
  // Evaluation order matches the pre-extraction inline body: dests, lastMove, premove snapshot, turn.
  const dests = cachedDests(node.fen);
  const lastMove = uciToMove(node.uci);
  const premoveCapture = currentPremoveCaptureSnapshot();
  const turnColor = node.ply % 2 === 0 ? 'white' : 'black';
  return {
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
        repertoire: REPERTOIRE_ARROW_BRUSH,
        repertoireAlt: REPERTOIRE_ALT_ARROW_BRUSH,
      },
    },
    fen: node.fen,
    animation: chessBoardAnimationConfig(),
    turnColor,
    movable: {
      free: false,
      color: premoveCapture?.humanColor ?? turnColor,
      dests: premoveCapture ? new Map() : dests,
      showDests: true,
    },
    premovable: {
      enabled: premoveCapture !== null,
      showDests: true,
      castle: true,
      events: {
        set: onPatzerPremoveSet,
        unset: () => {},
      },
    },
    ...(lastMove ? { lastMove } : {}),
  };
}

function analysisSyncConfig(node: TreeNode): CgConfig {
  const dests = cachedDests(node.fen);
  const lastMove = uciToMove(node.uci);
  const premoveCapture = currentPremoveCaptureSnapshot();
  const turnColor = node.ply % 2 === 0 ? 'white' : 'black';
  return {
    fen: node.fen,
    animation: chessBoardAnimationConfig(),
    turnColor,
    movable: {
      color: premoveCapture?.humanColor ?? turnColor,
      dests: premoveCapture ? new Map() : dests,
    },
    premovable: {
      enabled: premoveCapture !== null,
      showDests: true,
      castle: true,
      events: {
        set: onPatzerPremoveSet,
        unset: () => {},
      },
    },
    ...(lastMove ? { lastMove } : {}),
  };
}

// --- Canonical move-callback installation (CCW-H03a-3) ---
//
// The board lifecycle — NOT a surface module — owns the final move-callback fields. Chessground
// 10.1 DEEP-MERGES config (node_modules/@lichess-org/chessground/src/config.ts), so an OMITTED
// callback is not removed; the inactive callback must be written as an explicit `undefined` or the
// board would fire BOTH events.move and movable.events.after (double dispatch). This installer
// therefore always writes both fields — one live callback, one explicit undefined — never both live.
//   - shared-tree (Analysis / Study / any shared-tree module): events.move = guarded shared-tree
//     move (delegates to onUserMove); movable.events.after = undefined. Preserves the existing
//     Analysis/Study move timing (events.move).
//   - module-owned: movable.events.after = guarded module handleMove; events.move = undefined.
//     Matches the ORP-drill-style movable.events.after timing.
//
// Chessground's Config marks these callbacks as optional-without-`undefined`, and the project runs
// with `exactOptionalPropertyTypes`, so a literal `undefined` on the field is a type error even
// though a runtime present-and-undefined property is EXACTLY what deep-merge needs to clear the
// inactive callback. `CLEARED_CALLBACK` is that deliberate escape hatch: the value is `undefined` at
// runtime, typed as the callback so the property stays present and clears its counterpart.
type CgMoveFn = NonNullable<NonNullable<CgConfig['events']>['move']>;
type CgMoveAfterFn = NonNullable<NonNullable<NonNullable<CgConfig['movable']>['events']>['after']>;
const CLEARED_CALLBACK = undefined as unknown as CgMoveFn & CgMoveAfterFn;

function installCanonicalCallbacks(
  config: CgConfig,
  input: WorkspaceBoardInputHandle | null,
  instanceId: string | null,
): CgConfig {
  const dispatch = input ? input.moveDispatch : null;
  if (input && dispatch && dispatch.kind === 'module-owned') {
    const guardedModuleMove = (orig: Key, dest: Key): void => {
      if (!input.isLive()) return;
      dispatch.handleMove(orig, dest);
    };
    return {
      ...config,
      events: { ...config.events, move: CLEARED_CALLBACK },
      movable: {
        ...config.movable,
        events: { ...config.movable?.events, after: guardedModuleMove },
      },
    };
  }
  // Shared-tree / no module. Capture the installing instance id; stale-drop if it is no longer the
  // active workspace (a null id — bootstrap before any mount — is treated as always live).
  const liveKey = { instanceId };
  const guardedSharedTreeMove = (orig: Key, dest: Key): void => {
    if (!providerIsLive(liveKey)) return;
    onUserMove(orig, dest);
  };
  return {
    ...config,
    events: { ...config.events, move: guardedSharedTreeMove },
    movable: {
      ...config.movable,
      events: { ...config.movable?.events, after: CLEARED_CALLBACK },
    },
  };
}










function makeGuardedPort(instanceId: string, capturedCg: CgApi, handleIsLive: () => boolean): WorkspaceBoardPort {
  const liveKey = { instanceId };
  const portIsLive = (): boolean =>
    providerIsLive(liveKey) && cgInstance === capturedCg && handleIsLive();
  return {
    instanceId,
    isLive: portIsLive,
    set: config => { if (portIsLive()) capturedCg.set(config); },
    move: (orig, dest) => { if (portIsLive()) capturedCg.move(orig, dest); },
  };
}

export function syncBoard(): void {
  // Capture the board once; all writes below target this exact instance.
  const capturedCg = cgInstance;
  if (!capturedCg) return;
  // One workspace + one session snapshot per selection (CCW-H03a-3). Byte-identical for Analysis:
  // its instance reads the same AnalyseCtrl, so session().node === _getCtrl().node.
  const workspace = activeWorkspace();
  const session = workspace ? workspace.session() : undefined;
  const node = session?.node ?? _getCtrl().node;
  const input = workspace ? workspace.boardInputModule : null;
  let baseConfig: CgConfig;
  if (workspace && input && input.configPolicy.kind === 'module-owned') {
    baseConfig = input.configPolicy.sync({
      instanceId: workspace.instanceId,
      mode: workspace.boardInputMode,
      session: session!,
    });
  } else {
    baseConfig = analysisSyncConfig(node);
  }
  const config = installCanonicalCallbacks(baseConfig, input, workspace ? workspace.instanceId : null);
  // Re-entrancy defense: do not apply a config whose owning module went stale mid-selection.
  if (input && !input.isLive()) return;
  capturedCg.set(config);
}

function onPatzerPremoveSet(orig: Key, dest: Key): void {
  capturePremoveInput(orig as SquareName, dest as SquareName);
  // Chessground stores only one premove. Clear it immediately so Patzer queue state remains the
  // only stack source of truth while chessground still supplies premove input mechanics.
  cgInstance?.cancelPremove();
}

// Adapted from lichess-org/lila: ui/analyse/src/ctrl.ts (flip)
export function flip(): void {
  // CCW-H03a-3: a module-owned surface owns its own flipping through its module/port. Return before
  // toggling the global orientation, touching Chessground, or redrawing. Analysis (no module) and
  // Study (analysis-default) are unchanged.
  const input = activeWorkspace()?.boardInputModule ?? null;
  if (input && input.configPolicy.kind === 'module-owned') return;
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

const colorWhoMoved = (node: TreeNode): 'white' | 'black' => node.ply % 2 === 1 ? 'white' : 'black';

interface StripClockInfo {
  remaining: Clock | undefined;
  moveTime: Clock | undefined;
  active: boolean;
}

function deriveMoveTime(nodes: TreeNode[], color: 'white' | 'black', currentClock: Clock | undefined): Clock | undefined {
  if (currentClock === undefined) return undefined;
  const ctrl = _getCtrl();
  const previousSameColor = [...nodes.slice(0, -1)]
    .reverse()
    .find(node => colorWhoMoved(node) === color && node.clock !== undefined);
  const previousClock = previousSameColor?.clock ?? ctrl.root.timeControl?.initial;
  const increment = ctrl.root.timeControl?.increment;
  if (previousClock === undefined || increment === undefined) return undefined;
  const moveTime = previousClock + increment - currentClock;
  return moveTime >= 0 ? moveTime : undefined;
}

/**
 * Uses the selected node plus its parent clock, matching Lichess renderClocks().
 * node.clock stores time remaining after the move at that node.
 */
function getClockInfoAtPath(): { white: StripClockInfo; black: StripClockInfo } {
  const ctrl = _getCtrl();
  const nodes = ctrl.nodeList;
  const node = ctrl.node;
  const parentClock = nodes.length > 1 ? nodes[nodes.length - 2]?.clock : undefined;
  const isWhiteTurn = node.ply % 2 === 0;
  const selectedMoveColor = node.uci ? colorWhoMoved(node) : undefined;
  const selectedMoveTime = selectedMoveColor
    ? node.moveTime ?? deriveMoveTime(nodes, selectedMoveColor, node.clock)
    : undefined;

  return {
    white: {
      remaining: isWhiteTurn ? parentClock : node.clock,
      moveTime: selectedMoveColor === 'white' ? selectedMoveTime : undefined,
      active: isWhiteTurn,
    },
    black: {
      remaining: isWhiteTurn ? node.clock : parentClock,
      moveTime: selectedMoveColor === 'black' ? selectedMoveTime : undefined,
      active: !isWhiteTurn,
    },
  };
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
  const clocks = getClockInfoAtPath();

  const strip = (color: 'white' | 'black'): VNode => {
    const name     = color === 'white' ? whiteName : blackName;
    const rating   = color === 'white' ? whiteRating : blackRating;
    const winner   = (color === 'white' && result === '1-0') || (color === 'black' && result === '0-1');
    const loser    = (color === 'white' && result === '0-1') || (color === 'black' && result === '1-0');
    const matScore = color === 'white' ? score : -score;
    const clock    = color === 'white' ? clocks.white : clocks.black;
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
      clock.remaining !== undefined ? h('div.analyse__clock', {
        class: { active: clock.active },
      }, [
        clock.moveTime !== undefined ? h('span.analyse__move-time', formatClock(clock.moveTime)) : null,
        clock.moveTime !== undefined ? h('span.analyse__clock-separator', '·') : null,
        h('span.analyse__remaining-time', formatClock(clock.remaining)),
      ]) : null,
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
  let ownedCg: CgApi | undefined;
  return h('div.cg-wrap', {
    key: 'board',
    hook: {
      prepatch: (oldVnode, vnode) => {
        const insertedOwnerDestroy = oldVnode.data?.hook?.destroy;
        if (insertedOwnerDestroy && vnode.data?.hook) {
          vnode.data.hook.destroy = insertedOwnerDestroy;
        }
      },
      insert: vnode => {
        performance.mark('board-render-start');
        // CCW-H03a-3 config-selection sequence (one workspace + one session snapshot per selection):
        // 1) active workspace once, 2) its session once, 3) node, 4) its board-input handle once.
        const workspace = activeWorkspace();
        const session = workspace ? workspace.session() : undefined;
        const node = session?.node ?? _getCtrl().node;
        const input = workspace ? workspace.boardInputModule : null;
        // 5) select config: no module or analysis-default → the extracted Analysis factory;
        //    module-owned → the module's own complete config (built from the SAME session snapshot).
        let baseConfig: CgConfig;
        if (workspace && input && input.configPolicy.kind === 'module-owned') {
          baseConfig = input.configPolicy.initial({
            instanceId: workspace.instanceId,
            mode: workspace.boardInputMode,
            session: session!,
          });
        } else {
          baseConfig = analysisInitialConfig(node);
        }
        // Re-entrancy defense: never construct/apply a config whose owning module went stale.
        if (input && !input.isLive()) return;
        // 6) install canonical move callbacks WITHOUT mutating the selected config.
        const config = installCanonicalCallbacks(baseConfig, input, workspace ? workspace.instanceId : null);
        // 7) construct exactly one Chessground, 8) assign it to cgInstance.
        const capturedCg = makeChessground(vnode.elm as HTMLElement, config);
        ownedCg = capturedCg;
        cgInstance = capturedCg;
        // 9) construct the guarded port against that exact API, 10) attach the module (if any).
        if (workspace && input) {
          const port = makeGuardedPort(workspace.instanceId, capturedCg, () => input.isLive());
          input.attach(port, vnode.elm as HTMLElement);
        }
        // 11) bind the shared resize handle only when the lifecycle owns resize (no module, or a
        // module that allows resize). Standalone forks (editor/tree/puzzle) call it directly.
        // Adapted from lichess-org/lila: ui/lib/src/chessgroundResize.ts resizeHandle()
        if (!input || input.allowResize) {
          bindBoardResizeHandle(vnode.elm as HTMLElement);
        }
        performance.mark('board-render-end');
      },
      destroy: () => {
        const capturedCg = ownedCg;
        if (!capturedCg) return;
        capturedCg.destroy();
        ownedCg = undefined;
        if (cgInstance === capturedCg) cgInstance = undefined;
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
  // CCW-H03a-3: a module-owned board subscribes to its own animation scope; leave it alone.
  const input = activeWorkspace()?.boardInputModule ?? null;
  if (input && input.configPolicy.kind === 'module-owned') return;
  cgInstance?.set({ animation: { ...chessBoardAnimationConfig(), enabled } });
}

onBoardAnimationChange('chess', () => {
  // CCW-H03a-3: this shared listener writes only Analysis-default boards (no module, or an
  // analysis-default module such as Study). A module-owned surface owns its own animation.
  const input = activeWorkspace()?.boardInputModule ?? null;
  if (input && input.configPolicy.kind === 'module-owned') return;
  cgInstance?.set({ animation: chessBoardAnimationConfig() });
});
