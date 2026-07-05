













import { parseFen } from 'chessops/fen';
import { Chess } from 'chessops/chess';
import { parseUci } from 'chessops/util';
import { makeSan } from 'chessops/san';
import type { Outcome } from 'chessops/types';
import type { DrawShape } from '@lichess-org/chessground/draw';

import type { TreeNode, TreePath } from '../../tree/types';
import { nodeAtPath, nodeListAt, pathInit } from '../../tree/ops';
import { evalWinChances, type WinChancesEval } from '../../engine/winchances';
import { STRENGTH_LEVELS, type EngineStrengthConfig } from '../../engine/types';
import {
  engineMode,
  exitPlayMode,
  getPlayStrengthLevel,
  setPlayStrengthLevel,
} from '../../engine/ctrl';
import { cancelPlayMove, playMoveWithDelay } from '../../engine/playMove';
import { fenOnlyPositionContext } from '../../engine/positionContext';

export type PracticeVerdict = 'goodMove' | 'inaccuracy' | 'mistake' | 'blunder';

export interface PracticeComment {
  prev: TreeNode;
  node: TreeNode;
  path: TreePath;
  verdict: PracticeVerdict;
  best?: { uci: string; san: string };
}

export interface PracticeHinting {
  mode: 'move' | 'piece';
  uci: string;
}

export type PracticeEndState =
  | { kind: 'checkmate'; winner: 'white' | 'black' }
  | { kind: 'stalemate' }
  | { kind: 'threefold' }
  | { kind: 'fiftyMoves' }
  | null;

export interface PracticeEval extends WinChancesEval {
  best?: string;
  depth?: number;
}

export interface PracticeDeps {
  getRoot(): TreeNode;
  getPath(): TreePath;
  bottomColor(): 'white' | 'black';
  navigate(path: TreePath): void;
  playUciMove(uci: string): void;
  /** Live analysis eval for a path (white-perspective cp), usually from evalCache. */
  getEval(path: TreePath): PracticeEval | undefined;
  redraw(): void;
  /** Re-sync board auto-shapes (hint circles/arrows, best-move hover). */
  onShapesChanged(): void;
}

// Depth gates — mirror lila practiceCtrl commentable/playable (Patzer tracks depth only).
const COMMENTABLE_DEPTH = 15;
// If the live eval never reaches the commentable gate (premove-fast play, engine hiccup),
// play the reply anyway after this long so the game never stalls.
const REPLY_FALLBACK_MS = 4000;

// Castling UCI aliases — mirrors lila practiceCtrl altCastles.
const ALT_CASTLES: Record<string, string> = {
  e1a1: 'e1c1',
  e1h1: 'e1g1',
  e8a8: 'e8c8',
  e8h8: 'e8g8',
};

let deps: PracticeDeps | null = null;

let _active = false;
let _running = false;
let _comment: PracticeComment | null = null;
let _hovering: { uci: string } | null = null;
let _hinting: PracticeHinting | null = null;
let _played = false;
let _threefold = false;
let _replyRequestFen: string | null = null;
let _fallbackTimer: ReturnType<typeof setTimeout> | null = null;

export function initPractice(d: PracticeDeps): void {
  deps = d;
}

// --- State accessors ---

export function practiceActive(): boolean { return _active; }
export function practiceRunning(): boolean { return _running; }
export function practiceComment(): PracticeComment | null { return _comment; }
export function practiceHinting(): PracticeHinting | null { return _hinting; }

export function practiceStrengthLevel(): number { return getPlayStrengthLevel(); }
export function setPracticeStrengthLevel(level: number): void { setPlayStrengthLevel(level); }
export function practiceStrengthConfig(): EngineStrengthConfig {
  return STRENGTH_LEVELS[practiceStrengthLevel() - 1] ?? STRENGTH_LEVELS[3]!;
}

// --- Position helpers ---

function currentNode(): TreeNode {
  const d = deps!;
  return nodeAtPath(d.getRoot(), d.getPath()) ?? d.getRoot();
}

function positionOf(node: TreeNode): Chess | null {
  const setup = parseFen(node.fen);
  if (setup.isErr) return null;
  const pos = Chess.fromSetup(setup.unwrap());
  return pos.isErr ? null : pos.unwrap();
}

function turnColor(node: TreeNode): 'white' | 'black' {
  return node.fen.includes(' w ') ? 'white' : 'black';
}

export function isMyTurn(): boolean {
  return deps !== null && turnColor(currentNode()) === deps.bottomColor();
}

function nodeOutcome(node: TreeNode): Outcome | undefined {
  return positionOf(node)?.outcome();
}

// Threefold detection — mirrors lichess-org/lila: ui/analyse/src/nodeFinder.ts
// detectThreefold (EPD occurrence count > 2 along the current node list).
function detectThreefold(): boolean {
  const d = deps!;
  const nodeList = nodeListAt(d.getRoot(), d.getPath());
  const node = nodeList[nodeList.length - 1];
  if (!node) return false;
  const epd = node.fen.split(' ').slice(0, 4).join(' ');
  let count = 0;
  for (const n of nodeList) {
    if (n.fen.split(' ').slice(0, 4).join(' ') === epd) count++;
  }
  return count > 2;
}

function isFiftyMoves(node: TreeNode): boolean {
  return node.fen.split(' ')[4] === '100';
}

/** Terminal state of the current practice position, for the view and reply gating. */
export function practiceEndState(): PracticeEndState {
  const node = currentNode();
  const outcome = nodeOutcome(node);
  if (outcome?.winner) return { kind: 'checkmate', winner: outcome.winner };
  if (outcome) return { kind: 'stalemate' };
  if (_threefold) return { kind: 'threefold' };
  if (isFiftyMoves(node)) return { kind: 'fiftyMoves' };
  return null;
}

// --- Verdict computation ---
// Mirrors lila practiceCtrl makeComment: shift = -povDiff(bottomColor, nodeEval, prevEval)
// with thresholds 0.025 / 0.06 / 0.14; checkmate delivered => goodMove; draw-ish terminal
// positions eval as cp 0.

function toPov(color: 'white' | 'black', wc: number): number {
  return color === 'white' ? wc : -wc;
}

function povDiff(color: 'white' | 'black', e1: WinChancesEval, e2: WinChancesEval): number {
  const wc1 = evalWinChances(e1) ?? 0;
  const wc2 = evalWinChances(e2) ?? 0;
  return (toPov(color, wc1) - toPov(color, wc2)) / 2;
}

function commentable(path: TreePath, node: TreeNode, bonus = 0): boolean {
  if (nodeOutcome(node)) return true;
  const ev = deps!.getEval(path);
  return ev !== undefined && (ev.depth ?? 0) + bonus >= COMMENTABLE_DEPTH;
}

function makeComment(prev: TreeNode, prevPath: TreePath, node: TreeNode, path: TreePath): PracticeComment {
  const d = deps!;
  let verdict: PracticeVerdict;
  let best: string | undefined;
  const outcome = nodeOutcome(node);

  if (outcome?.winner) {
    verdict = 'goodMove';
  } else {
    const nodeEval: WinChancesEval =
      _threefold || (outcome && !outcome.winner) || isFiftyMoves(node)
        ? { cp: 0 }
        : (d.getEval(path) ?? { cp: 0 });
    const prevEval: WinChancesEval = d.getEval(prevPath) ?? { cp: 0 };
    const shift = -povDiff(d.bottomColor(), nodeEval, prevEval);

    best = d.getEval(prevPath)?.best;
    if (best === node.uci || (node.san?.startsWith('O-O') && best === ALT_CASTLES[node.uci ?? ''])) {
      best = undefined;
    }

    if (!best) verdict = 'goodMove';
    else if (shift < 0.025) verdict = 'goodMove';
    else if (shift < 0.06) verdict = 'inaccuracy';
    else if (shift < 0.14) verdict = 'mistake';
    else verdict = 'blunder';
  }

  let bestSan: string | undefined;
  if (best) {
    const pos = positionOf(prev);
    const move = parseUci(best);
    if (pos && move) bestSan = makeSan(pos, move);
  }

  return {
    prev,
    node,
    path,
    verdict,
    ...(best && bestSan ? { best: { uci: best, san: bestSan } } : {}),
  };
}

// --- Engine reply ---

function clearFallbackTimer(): void {
  if (_fallbackTimer !== null) {
    clearTimeout(_fallbackTimer);
    _fallbackTimer = null;
  }
}

function cancelPendingReply(): void {
  clearFallbackTimer();
  if (_replyRequestFen !== null) {
    _replyRequestFen = null;
    cancelPlayMove();
    if (engineMode === 'play') exitPlayMode();
  }
}

function requestReply(): void {
  const d = deps!;
  const node = currentNode();
  const requestFen = node.fen;
  const requestPath = d.getPath();
  _replyRequestFen = requestFen;
  playMoveWithDelay({
    position: fenOnlyPositionContext(requestFen, 'analysis-practice-play', 'practice opponent reply'),
    strength: practiceStrengthConfig(),
    onMove: uci => {
      // Engine-result→node binding: the reply is only valid for the exact position it
      // was requested for. Stale-drop if the user navigated or the session ended.
      if (!_active || _replyRequestFen !== requestFen) return;
      _replyRequestFen = null;
      if (d.getPath() !== requestPath || currentNode().fen !== requestFen) return;
      d.playUciMove(uci);
      // Return the shared engine to analysis mode so the next verdict/hint evals run.
      exitPlayMode();
    },
    onError: () => {
      _replyRequestFen = null;
      if (engineMode === 'play') exitPlayMode();
      d.redraw();
    },
  });
}

// --- Core state machine ---
// Mirrors lila practiceCtrl checkCeval, driven by onJump + live-eval ticks.

function checkState(): void {
  const d = deps!;
  if (!_active) return;
  if (!_running) {
    _comment = null;
    d.redraw();
    return;
  }
  const node = currentNode();
  const path = d.getPath();
  if (isMyTurn()) {
    const h = _hinting;
    if (h) {
      h.uci = d.getEval(path)?.best ?? h.uci;
      d.onShapesChanged();
    }
  } else {
    _comment = null;
    const root = d.getRoot();
    const prevPath = pathInit(path);
    const prev = nodeAtPath(root, prevPath);
    if (node.san && prev && commentable(path, node)) {
      if (commentable(prevPath, prev, 1)) {
        _comment = makeComment(prev, prevPath, node, path);
      } else {
        // Parent didn't get enough analysis time (fast play). Fall back to the position
        // before it — computer moves are supposed to preserve eval. Mirrors lila.
        const olderPath = pathInit(prevPath);
        const older = nodeAtPath(root, olderPath);
        if (older && commentable(olderPath, older, 1)) {
          _comment = makeComment(older, olderPath, node, path);
        }
      }
    }
    const terminal = practiceEndState() !== null;
    if (!_played && !terminal) {
      // Wait for the verdict eval before flipping the engine into play mode, so the
      // shared protocol is used strictly sequentially. The fallback timer guarantees
      // a reply even if the analysis eval never reaches the gate.
      const verdictReady = _comment !== null || !node.san || !prev;
      if (verdictReady) {
        clearFallbackTimer();
        _played = true;
        requestReply();
      } else if (_fallbackTimer === null) {
        _fallbackTimer = setTimeout(() => {
          _fallbackTimer = null;
          if (!_active || !_running || _played || isMyTurn()) return;
          _played = true;
          requestReply();
          d.redraw();
        }, REPLY_FALLBACK_MS);
      }
    }
    d.redraw();
  }
}

// --- Lifecycle / integration API (wired in main.ts) ---

/** Start a practice session from the current position. */
export function startPractice(): void {
  _active = true;
  _running = true;
  _comment = null;
  _hovering = null;
  _hinting = null;
  _played = false;
  _threefold = detectThreefold();
  checkState();
  deps?.redraw();
}

/** Stop the session and cancel any in-flight engine work owned by practice. */
export function stopPractice(): void {
  if (!_active) return;
  _active = false;
  _running = false;
  _comment = null;
  _hovering = null;
  _hinting = null;
  _played = false;
  cancelPendingReply();
  deps?.onShapesChanged();
  deps?.redraw();
}

/** Resume after going off-track. Mirrors lila resume(). */
export function practiceResume(): void {
  if (!_active) return;
  _running = true;
  checkState();
}

/** Every path change (browse or move application). Mirrors lila onJump. */
export function practiceOnJump(): void {
  if (!_active) return;
  _played = false;
  _hinting = null;
  cancelPendingReply();
  _threefold = detectThreefold();
  deps?.onShapesChanged();
  checkState();
}

/** User-initiated browse away from the current path. Mirrors lila preUserJump. */
export function practicePreUserJump(from: TreePath, to: TreePath): void {
  if (!_active) return;
  if (from !== to) {
    _running = false;
    _comment = null;
  }
}

/** After a user-initiated browse. Mirrors lila postUserJump. */
export function practicePostUserJump(from: TreePath, to: TreePath): void {
  if (!_active) return;
  if (from !== to && isMyTurn()) practiceResume();
}

/** The user played a move on the board. Mirrors lila onUserMove. */
export function practiceOnUserMove(): void {
  if (!_active) return;
  _running = true;
}

/** Live analysis eval landed for a path. Drives verdicts/hints like lila onCeval. */
export function practiceOnCeval(): void {
  if (!_active) return;
  checkState();
}

// --- Feedback interactions ---

/** Rewind and play the recommended best move. Mirrors lila playCommentBest. */
export function playCommentBest(): void {
  const d = deps;
  const c = _comment;
  if (!d || !c) return;
  d.navigate(pathInit(c.path));
  if (c.best) d.playUciMove(c.best.uci);
}

/** Hover state for the "Best was X" link. Mirrors lila commentShape. */
export function practiceCommentShape(enable: boolean): void {
  const c = _comment;
  _hovering = enable && c?.best ? { uci: c.best.uci } : null;
  deps?.onShapesChanged();
}

/** Cycle hint: none -> piece circle -> move arrow -> none. Mirrors lila hint(). */
export function practiceHint(): void {
  const d = deps;
  if (!d) return;
  const best = d.getEval(d.getPath())?.best;
  const prev = _hinting;
  if (!best || (prev && prev.mode === 'move')) _hinting = null;
  else _hinting = { mode: prev ? 'move' : 'piece', uci: best };
  d.onShapesChanged();
  d.redraw();
}

/** Board shapes owned by practice (hint circle/arrow + best-move hover). */
export function practiceShapes(): DrawShape[] {
  const shapes: DrawShape[] = [];
  if (!_active) return shapes;
  const push = (uci: string, mode: 'move' | 'piece') => {
    const orig = uci.slice(0, 2) as DrawShape['orig'];
    if (mode === 'piece') shapes.push({ orig, brush: 'green' });
    else shapes.push({ orig, dest: uci.slice(2, 4) as DrawShape['orig'], brush: 'green' });
  };
  if (_hovering) push(_hovering.uci, 'move');
  if (_hinting) push(_hinting.uci, _hinting.mode);
  return shapes;
}
